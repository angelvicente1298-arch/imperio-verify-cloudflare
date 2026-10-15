import { TRPCError } from "@trpc/server";
import crypto from "node:crypto";
import { z } from "zod";
import { publicProcedure, router } from "./_core/trpc";
import { sendChannelMessage, sendDirectMessage } from "./botAdmin";
import { getManualEntries, getSettings } from "./botSettings";
import {
  addVerificationEvent,
  countRelatedApprovals,
  createVerification,
  getVerificationByTicket,
  recentVerifications,
  updateVerification,
  verificationStats,
} from "./db";
import {
  addGuildMember,
  avatarUrl,
  buildAuthorizeUrl,
  clientIp,
  checkRoles,
  config,
  daysBetween,
  evaluateRisk,
  exchangeCode,
  fetchDiscordUser,
  grantAllRoles,
  isConfigured,
  lookupIp,
  makeTicket,
  missingConfig,
  redirectStatus,
  sha256,
  signState,
  snowflakeToDate,
  verifyState,
} from "./discordVerify";

/** Datos que envía el navegador junto con el botón de verificar. */
const contextSchema = z.object({
  timezone: z.string().max(64).optional(),
  fingerprint: z.string().max(64).optional(),
  userAgent: z.string().max(255).optional(),
});

type RequestHeaders = Record<string, unknown>;

/**
 * Tiempo máximo para entregar el acceso (unir al servidor y dar los roles).
 *
 * Es el último paso de la verificación y el que más depende de Discord. Sin
 * límite, si Discord no responde la web se queda pegada en «Entrega de acceso»
 * y la persona no sabe si funcionó. Pasado este tiempo se informa del fallo.
 */
const ACCESS_DELIVERY_MS = 20_000;

/**
 * Ejecuta una tarea con límite de tiempo.
 *
 * Se usa en los pasos que dependen de Discord: si tarda más de lo permitido, se
 * lanza un error en lugar de dejar la pantalla cargando sin fin.
 */
async function withTimeout<T>(work: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`Discord no respondió a tiempo (${what}).`)),
          ms,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function originFrom(headers: RequestHeaders, fallback: string): string {
  const host = (headers["x-forwarded-host"] as string) || (headers.host as string) || "";
  const proto = (headers["x-forwarded-proto"] as string) || "https";
  return host ? `${proto}://${host}` : fallback;
}

export const verifyRouter = router({
  /** Estado de la configuración para la pantalla inicial. */
  status: publicProcedure.query(async ({ ctx }) => {
    const missing = missingConfig();
    const origin = originFrom(ctx.req.headers as RequestHeaders, "http://localhost:3000");
    const redirect = await redirectStatus(origin);
    return {
      configured: isConfigured(),
      missing,
      // Se lee de la configuración central para que la web y el motor coincidan.
      minAccountDays: config.minAccountDays,
      vpnProtection: true,
      multiAccountProtection: true,
      // Si la URL de retorno no está registrada en Discord, se avisa en la web.
      redirectOk: redirect.ok,
      // Discord no respondió: la web no debe dar por hecho que falta registrar.
      redirectUnknown: Boolean(redirect.unknown),
      redirectUsed: redirect.used,
      redirectRegistered: redirect.registered,
      redirectSuggested: redirect.suggested,
    };
  }),

  /** Genera la URL del Discord Developer Portal para iniciar la verificación. */
  startLink: publicProcedure
    .input(contextSchema.optional())
    .query(async ({ ctx }) => {
      const origin = originFrom(ctx.req.headers as RequestHeaders, "http://localhost:3000");
      const state = signState();
      const url = await buildAuthorizeUrl(origin, state);
      const redirect = await redirectStatus(origin);
      return {
        url,
        state,
        redirectUri: redirect.used,
        redirectOk: redirect.ok,
        redirectUnknown: Boolean(redirect.unknown),
        redirectRegistered: redirect.registered,
        redirectSuggested: redirect.suggested,
        configured: isConfigured(),
        missing: missingConfig(),
      };
    }),

  /** Procesa la respuesta del portal y decide si la cuenta entra o se bloquea. */
  complete: publicProcedure
    .input(
      z.object({ code: z.string().min(4), state: z.string().max(512).optional() }).and(contextSchema),
    )
    .mutation(async ({ ctx, input }) => {
      if (!isConfigured()) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Faltan credenciales de Discord: " + missingConfig().join(", "),
        });
      }

      // Los ajustes del panel mandan: si la verificación está pausada, se avisa
      // y no se analiza nada.
      const settings = await getSettings();
      if (settings.verificationPaused) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: settings.pausedMessage || "La verificación está en mantenimiento.",
        });
      }

      // Protección CSRF: el `state` lo emitió este servidor hace menos de 15 min.
      if (input.state && !verifyState(input.state)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "El enlace de verificación caducó o no es válido. Vuelve a intentarlo.",
        });
      }

      const headers = ctx.req.headers as RequestHeaders;
      const origin = originFrom(headers, "http://localhost:3000");
      const ip = clientIp(headers, ctx.req.socket?.remoteAddress ?? undefined);
      const ticket = makeTicket();

      const fingerprint = input.fingerprint ? sha256(input.fingerprint) : null;
      const userAgent = (input.userAgent ?? (headers["user-agent"] as string) ?? "").slice(0, 250);

      // 1) Canjea el código por el token de la persona y lee sus metadatos.
      const accessToken = await exchangeCode(input.code, origin);
      const discordUser = await fetchDiscordUser(accessToken);
      const createdAt = snowflakeToDate(discordUser.id);
      const ageDays = createdAt ? daysBetween(createdAt) : null;
      const avatar = avatarUrl(discordUser);

      // 2) Comprueba la conexión: VPN, proxy, centro de datos.
      const ipInfo = await lookupIp(ip);

      // 3) Cuenta cuántas cuentas distintas ya pasaron por esta IP o dispositivo.
      const [sameIp, sameFingerprint] = await Promise.all([
        countRelatedApprovals("ip", ip),
        fingerprint ? countRelatedApprovals("fingerprint", fingerprint) : Promise.resolve(0),
      ]);

      const ipTimezone = ipInfo.timezone ?? "";
      const timezoneMismatch = Boolean(
        input.timezone && ipTimezone && input.timezone.trim() !== ipTimezone.trim(),
      );

      // 4) Decide.
      let risk = evaluateRisk(
        {
          accountAgeDays: ageDays,
          accountVerifiedEmail: Boolean(discordUser.verified),
          ip: ipInfo,
          timezoneMismatch,
          sameIpAccounts: sameIp,
          sameFingerprintAccounts: sameFingerprint,
          fingerprintMissing: !fingerprint,
        },
        settings,
      );

      // El panel puede bloquear o aprobar a alguien a mano. La decisión manual
      // tiene prioridad sobre el análisis automático.
      const manual = (await getManualEntries()).get(discordUser.id);
      if (manual === "block") {
        risk = {
          decision: "block",
          score: 100,
          reasons: [
            {
              code: "manual_block",
              text: "Un administrador ha bloqueado esta cuenta. Si crees que es un error, abre un ticket.",
              score: 100,
              hard: true,
            },
          ],
        };
      } else if (manual === "allow" && risk.decision === "block") {
        risk = {
          decision: "allow",
          score: risk.score,
          reasons: [
            ...risk.reasons,
            {
              code: "manual_allow",
              text: "Un administrador ha aprobado esta cuenta manualmente.",
              score: 0,
            },
          ],
        };
      }

      const verificationId = await createVerification({
        ticket,
        discordId: discordUser.id,
        username: discordUser.username,
        globalName: discordUser.global_name ?? null,
        avatar,
        email: discordUser.email ?? null,
        accountCreatedAt: createdAt,
        accountAgeDays: ageDays,
        status: risk.decision === "allow" ? "pending" : "blocked",
        decision: risk.decision,
        riskScore: risk.score,
        reasons: JSON.stringify(risk.reasons),
        ip: ip || null,
        ipCountry: ipInfo.countryCode,
        ipCity: ipInfo.city,
        ipIsp: ipInfo.isp,
        ipTimezone: ipInfo.timezone,
        ipProxy: ipInfo.proxy,
        ipHosting: ipInfo.hosting,
        vpnDetected: ipInfo.proxy || ipInfo.hosting,
        privateIp: ipInfo.privateIp,
        clientTimezone: input.timezone ?? null,
        fingerprint,
        userAgent,
        sameIpAccounts: sameIp,
        sameFingerprintAccounts: sameFingerprint,
      });

      if (risk.decision === "block") {
        await addVerificationEvent(
          verificationId,
          discordUser.id,
          "blocked",
          risk.reasons.map((r) => `${r.code}: ${r.text}`).join(" | "),
        );
        return {
          ticket,
          status: "blocked" as const,
          riskScore: risk.score,
          reasons: risk.reasons,
          account: {
            id: discordUser.id,
            username: discordUser.username,
            globalName: discordUser.global_name ?? null,
            avatar,
            createdAt: createdAt?.toISOString() ?? null,
            ageDays,
          },
          // Solo lo imprescindible: la ubicación (país, ciudad, operador) no se
          // envía al navegador, para no revelar dónde está la persona.
          network: {
            vpn: ipInfo.proxy,
            hosting: ipInfo.hosting,
          },
          roleGranted: false,
          guildJoined: false,
        };
      }

      // 5) Entrega el acceso: une al servidor y asigna el rol.
      let guildJoined = false;
      let roleGranted = false;
      let roleNames: string[] = [];
      try {
        // Con límite de tiempo: si Discord no responde, esta parte nunca puede
        // dejar la web pegada en «Entrega de acceso». Pasado el tiempo se
        // informa del fallo en lugar de esperar indefinidamente.
        const delivered = await withTimeout(
          (async () => {
            guildJoined = await addGuildMember(discordUser.id, accessToken);
            // Entrega el rol de verificado y los extra (p. ej. «Miembro»).
            return grantAllRoles(discordUser.id);
          })(),
          ACCESS_DELIVERY_MS,
          "entrega de acceso",
        );
        roleGranted = delivered.granted.length > 0;
        roleNames = delivered.granted;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Error desconocido";
        await updateVerification(verificationId, {
          status: "error",
          errorMessage: message.slice(0, 250),
          guildJoined,
          roleGranted,
        });
        await addVerificationEvent(verificationId, discordUser.id, "error", message);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            "Tu cuenta es apta, pero no se pudo entregar el rol. Revisa que el bot esté en el servidor y tenga el permiso de Gestionar roles, y que su rol esté por encima del rol de verificado.",
        });
      }

      await updateVerification(verificationId, {
        status: "approved",
        guildJoined,
        roleGranted,
      });
      await addVerificationEvent(
        verificationId,
        discordUser.id,
        "approved",
        `Verificación correcta (riesgo ${risk.score}) · roles: ${roleNames.join(", ") || "ninguno"}`,
      );

      // Avisos que se pueden activar desde el panel. Nunca interrumpen la
      // verificación: si fallan, se anota pero la persona ya tiene sus roles.
      await notifyApproval(settings, {
        username: discordUser.username,
        userId: discordUser.id,
        riskScore: risk.score,
        roles: roleNames,
      });

      return {
        ticket,
        status: "approved" as const,
        riskScore: risk.score,
        reasons: risk.reasons,
        account: {
          id: discordUser.id,
          username: discordUser.username,
          globalName: discordUser.global_name ?? null,
          avatar,
          createdAt: createdAt?.toISOString() ?? null,
          ageDays,
        },
        network: {
          vpn: ipInfo.proxy,
          hosting: ipInfo.hosting,
        },
        guildJoined,
        roleGranted,
      };
    },
  ),

  /** Consulta pública del resultado por ticket. */
  byTicket: publicProcedure.input(z.object({ ticket: z.string().min(4) })).query(async ({ input }) => {
    const row = await getVerificationByTicket(input.ticket);
    if (!row) return null;
    return {
      status: row.status,
      decision: row.decision,
      riskScore: row.riskScore,
      reasons: row.reasons ? JSON.parse(row.reasons) : [],
      roleGranted: row.roleGranted,
      createdAt: row.createdAt,
      account: {
        username: row.username,
        globalName: row.globalName,
        avatar: row.avatar,
        ageDays: row.accountAgeDays,
      },
      network: {
        vpn: row.vpnDetected,
      },
    };
  }),

  /**
   * Resumen de verificaciones para el panel privado.
   *
   * El acceso ya no se pide aquí: la puerta está en el router del bot, que
   * comprueba la sesión firmada. Así solo hay un sitio donde se entra.
   */
  panel: publicProcedure.query(async () => {
    const [stats, recent] = await Promise.all([verificationStats(), recentVerifications(25)]);
    return { stats, recent };
  }),

  /** Estado de los roles que se entregan al verificar. */
  roles: publicProcedure.query(() => checkRoles()),
});

/**
 * Avisa de una verificación correcta: publica en el canal de registros y/o
 * envía un mensaje privado, según lo que esté activado en el panel.
 *
 * Estos avisos son opcionales: si Discord los rechaza (por ejemplo, porque la
 * persona tiene los mensajes privados cerrados) se anota en la consola y la
 * verificación sigue siendo correcta.
 */
async function notifyApproval(
  settings: Awaited<ReturnType<typeof getSettings>>,
  data: { username: string; userId: string; riskScore: number; roles: string[] },
): Promise<void> {
  if (settings.notifyOnApproval && settings.logChannelId) {
    const lines = [
      `✅ **${data.username}** (<@${data.userId}>) se ha verificado.`,
      `Riesgo: **${data.riskScore}** · Roles: ${data.roles.length > 0 ? data.roles.join(", ") : "ninguno"}`,
    ];
    try {
      await sendChannelMessage(settings.logChannelId, lines.join("\n"));
    } catch (error) {
      console.warn("[Aviso] No se pudo publicar en el canal de registros:", error);
    }
  }

  if (settings.dmOnApproval) {
    try {
      await sendDirectMessage(data.userId, settings.dmMessage);
    } catch (error) {
      console.warn("[Aviso] No se pudo enviar el mensaje privado:", error);
    }
  }
}
