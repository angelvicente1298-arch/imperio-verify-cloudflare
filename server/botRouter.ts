/**
 * Panel de administración del bot.
 *
 * Todo lo que hay aquí se ejecuta de verdad sobre Discord: los ajustes cambian
 * el comportamiento de la verificación, y las acciones sobre miembros y canales
 * se aplican al instante. Cada acción queda registrada con quién la hizo.
 *
 * El acceso es el mismo del panel de control (usuario y contraseña), porque es
 * la única cuenta de administración del proyecto.
 */
import { TRPCError } from "@trpc/server";
import { desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { botActions, botBlocks } from "../drizzle/schema";
import { publicProcedure, router } from "./_core/trpc";
import {
  DiscordError,
  addRole,
  banMember,
  botOverview,
  getMember,
  guildHistory,
  kickMember,
  listBans,
  listMembers,
  messagesToday,
  removeRole,
  sendChannelMessage,
  sendDirectMessage,
  unbanMember,
} from "./botAdmin";
import {
  defaultSettings,
  getSettings,
  invalidateSettings,
  rawSettings,
  saveSettings,
  type SettingsShape,
} from "./botSettings";
import { getDb } from "./db";
import {
  PANEL_COOKIE,
  checkAccess,
  createAccount,
  createSession,
  deleteAccount,
  listAccounts,
  logLogin,
  readSession,
  recentLogins,
  sessionCookieOptions,
  updateAccount,
} from "./panelAuth";

/**
 * El panel es privado: cada petición debe traer una sesión válida, que se crea
 * al entrar con una cuenta autorizada. Las sesiones se firman y caducan solas.
 */
function sessionOf(ctx: { req: { headers: Record<string, unknown>; cookies?: Record<string, string> } }) {
  const fromCookie = ctx.req.cookies?.[PANEL_COOKIE];
  // La cookie viaja sola; se admite también la cabecera por comodidad.
  const header = ctx.req.headers["x-panel-session"];
  const token = fromCookie ?? (typeof header === "string" ? header : undefined);
  return readSession(token);
}

/** Exige sesión válida y devuelve quién es. */
function requireSession(ctx: Parameters<typeof sessionOf>[0]): { user: string; role: "owner" | "moderator" } {
  const session = sessionOf(ctx);
  if (!session) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Necesitas entrar al panel para hacer esto.",
    });
  }
  return session;
}

/** Exige sesión válida con permiso de propietario (para ajustes y cuentas). */
function requireOwner(ctx: Parameters<typeof sessionOf>[0]): { user: string; role: "owner" | "moderator" } {
  const session = requireSession(ctx);
  if (session.role !== "owner") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Solo la cuenta principal puede cambiar esta parte del bot.",
    });
  }
  return session;
}

/** Dirección del visitante, para el registro de entradas. */
function ipOf(ctx: { req: { headers: Record<string, unknown>; socket?: { remoteAddress?: string } } }): string {
  const forwarded = ctx.req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded) return forwarded.split(",")[0].trim();
  return ctx.req.socket?.remoteAddress ?? "";
}

/** Entrada al panel: comprueba las credenciales y abre sesión. */
const loginInput = z.object({
  user: z.string().min(1).max(64),
  password: z.string().min(1).max(128),
});

/** Convierte cualquier error en un mensaje entendible para el panel. */
function friendly(error: unknown): never {
  if (error instanceof DiscordError) {
    throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
  }
  const message = error instanceof Error ? error.message : "Error desconocido";
  throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message });
}

/** Anota una acción del panel en la bitácora. */
async function log(
  action: string,
  target: string | null,
  detail: string,
  ok: boolean,
  who: string,
  error?: string,
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  try {
    await db.insert(botActions).values({
      action,
      target: target ?? null,
      detail: detail.slice(0, 2000),
      ok,
      error: error?.slice(0, 250) ?? null,
      createdBy: who,
    });
  } catch (err) {
    console.warn("[Bitácora] No se pudo anotar la acción:", err);
  }
}

/** Envuelve una acción de Discord para anotarla y devolver un error claro. */
async function run<T>(
  action: string,
  target: string | null,
  detail: string,
  who: string,
  fn: () => Promise<T>,
): Promise<T> {
  try {
    const result = await fn();
    await log(action, target, detail, true, who);
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error desconocido";
    await log(action, target, detail, false, who, message);
    friendly(error);
  }
}

/** Ajustes editables desde el panel, con su tipo y sus límites. */
const settingsSchema = z.object({
  minAccountDays: z.number().int().min(0).max(3650).optional(),
  maxAccountsPerIp: z.number().int().min(1).max(100).optional(),
  maxAccountsPerDevice: z.number().int().min(1).max(100).optional(),
  maxRisk: z.number().int().min(1).max(1000).optional(),
  blockVpn: z.boolean().optional(),
  blockDatacenter: z.boolean().optional(),
  blockTimezoneMismatch: z.boolean().optional(),
  requireVerifiedEmail: z.boolean().optional(),
  verificationPaused: z.boolean().optional(),
  pausedMessage: z.string().max(500).optional(),
  notifyOnBlock: z.boolean().optional(),
  logChannelId: z.string().max(32).optional(),
  notifyOnApproval: z.boolean().optional(),
  dmOnApproval: z.boolean().optional(),
  dmMessage: z.string().max(1500).optional(),
  extraRoleIds: z.string().max(400).optional(),
});

export const botRouter = router({
  /* ------------------------------------------------------------- acceso */

  /**
   * Entrada al panel. Comprueba las credenciales contra la cuenta principal y
   * las cuentas creadas, y abre una sesión que caduca sola.
   */
  login: publicProcedure.input(loginInput).mutation(async ({ ctx, input }) => {
    const result = await checkAccess(input.user, input.password);

    await logLogin({
      username: input.user,
      ok: result.ok,
      ip: ipOf(ctx),
      userAgent: String(ctx.req.headers["user-agent"] ?? ""),
      reason: result.reason,
    });

    if (!result.ok) {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: result.reason ?? "Usuario o contraseña incorrectos.",
      });
    }

    const token = createSession(result.user!, result.role!);
    ctx.res.cookie(PANEL_COOKIE, token, sessionCookieOptions());
    return { ok: true as const, user: result.user!, role: result.role! };
  }),

  /** Cierra la sesión actual. */
  logout: publicProcedure.mutation(({ ctx }) => {
    ctx.res.clearCookie(PANEL_COOKIE, { ...sessionCookieOptions(), maxAge: -1 });
    return { ok: true as const };
  }),

  /** Quién ha entrado (para que la web sepa si puede mostrar el panel). */
  me: publicProcedure.query(({ ctx }) => {
    const session = sessionOf(ctx);
    return session ? { user: session.user, role: session.role } : null;
  }),

  /* ------------------------------------------------------------ cuentas */

  /** Lista de personas con acceso al panel, más los últimos intentos. */
  accounts: publicProcedure.query(async ({ ctx }) => {
    requireOwner(ctx);
    const [accounts, logins] = await Promise.all([listAccounts(), recentLogins(25)]);
    return { accounts, logins };
  }),

  /** Crea un acceso para una persona concreta. */
  createAccount: publicProcedure
    .input(
      z.object({
        username: z.string().min(3).max(64),
        password: z.string().min(8).max(128),
        label: z.string().max(96).optional(),
        role: z.enum(["owner", "moderator"]).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const who = requireOwner(ctx);
      try {
        const result = await createAccount({
          username: input.username,
          password: input.password,
          label: input.label,
          role: input.role ?? "moderator",
          createdBy: who.user,
        });
        await log(
          "account.create",
          input.username,
          `Acceso creado para ${input.label ?? input.username}`,
          true,
          who.user,
        );
        return result;
      } catch (error) {
        friendly(error);
      }
    }),

  /** Cambia la contraseña, el nombre visible o activa/desactiva un acceso. */
  updateAccount: publicProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        active: z.boolean().optional(),
        password: z.string().min(8).max(128).optional(),
        label: z.string().max(96).optional(),
        role: z.enum(["owner", "moderator"]).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const who = requireOwner(ctx);
      try {
        await updateAccount(input);
        await log("account.update", String(input.id), "Acceso modificado", true, who.user);
        return { ok: true as const };
      } catch (error) {
        friendly(error);
      }
    }),

  /** Retira el acceso a una persona. */
  deleteAccount: publicProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const who = requireOwner(ctx);
      try {
        await deleteAccount(input.id);
        await log("account.delete", String(input.id), "Acceso retirado", true, who.user);
        return { ok: true as const };
      } catch (error) {
        friendly(error);
      }
    }),

  /* ------------------------------------------------------------- estado */

  /** Estado del bot, del servidor, de los permisos y de los canales. */
  overview: publicProcedure.query(async ({ ctx }) => {
    requireSession(ctx);
    try {
      // El historial se lee aparte (pestaña propia): aquí solo lo esencial, para
      // que el resumen se abra rápido.
      const [overview, settings] = await Promise.all([botOverview(), getSettings(true)]);
      return { overview, settings };
    } catch (error) {
      friendly(error);
    }
  }),

  /**
   * Mensajes enviados hoy. Va aparte del resumen porque hay que recorrer todos
   * los canales y eso tarda: así el panel se abre al instante y este dato llega
   * un momento después.
   */
  today: publicProcedure.query(async ({ ctx }) => {
    requireSession(ctx);
    try {
      return await messagesToday();
    } catch {
      return { total: 0, unavailable: "No disponible" };
    }
  }),

  /** Ajustes actuales, sin pedir nada más (para pintar el formulario rápido). */
  settings: publicProcedure.query(async ({ ctx }) => {
    requireSession(ctx);
    const [current, stored] = await Promise.all([getSettings(true), rawSettings()]);
    return { settings: current, defaults: defaultSettings(), stored };
  }),

  /** Guarda los ajustes. Se aplican al instante en la verificación. */
  saveSettings: publicProcedure
    .input(z.object({ patch: settingsSchema }))
    .mutation(async ({ ctx, input }) => {
      // Solo el propietario cambia la configuración del bot.
      const who = requireOwner(ctx).user;
      const patch = Object.fromEntries(
        Object.entries(input.patch).filter(([, v]) => v !== undefined),
      ) as Partial<SettingsShape>;

      if (Object.keys(patch).length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "No hay nada que guardar." });
      }

      try {
        const { saved, settings } = await saveSettings(patch);
        await log(
          "settings.update",
          null,
          `Ajustes modificados: ${saved.join(", ")}`,
          true,
          who,
        );
        return { ok: true as const, saved, settings };
      } catch (error) {
        friendly(error);
      }
    }),

  /** Devuelve los ajustes a sus valores por defecto. */
  resetSettings: publicProcedure.mutation(async ({ ctx }) => {
    const who = requireOwner(ctx).user;
    try {
      const { settings } = await saveSettings(defaultSettings());
      invalidateSettings();
      await log("settings.reset", null, "Ajustes restaurados por defecto", true, who);
      return { ok: true as const, settings };
    } catch (error) {
      friendly(error);
    }
  }),

  /* ---------------------------------------------------------- miembros */

  /** Busca miembros del servidor por nombre, apodo o ID. */
  members: publicProcedure
    .input(z.object({ query: z.string().max(64).optional(), limit: z.number().int().min(1).max(200).optional() }))
    .query(async ({ ctx, input }) => {
      requireSession(ctx);
      try {
        const [members, bans] = await Promise.all([listMembers(input.query ?? "", input.limit ?? 100), listBans()]);
        const banned = new Set(bans.map((b) => b.id));
        return members.map((m) => ({ ...m, banned: banned.has(m.id) }));
      } catch (error) {
        friendly(error);
      }
    }),

  /** Detalle de un miembro concreto. */
  member: publicProcedure
    .input(z.object({ userId: z.string().min(5).max(32) }))
    .query(async ({ ctx, input }) => {
      requireSession(ctx);
      try {
        return await getMember(input.userId);
      } catch (error) {
        friendly(error);
      }
    }),

  /** Miembros vetados del servidor. */
  bans: publicProcedure.query(async ({ ctx }) => {
    requireSession(ctx);
    try {
      return await listBans();
    } catch (error) {
      friendly(error);
    }
  }),

  /** Expulsa a alguien del servidor. */
  kick: publicProcedure
    .input(z.object({ userId: z.string().min(5).max(32), reason: z.string().max(255).optional() }))
    .mutation(async ({ ctx, input }) => {
      const who = requireSession(ctx).user;
      await run("member.kick", input.userId, input.reason ?? "Sin motivo", who, () =>
        kickMember(input.userId, input.reason),
      );
      return { ok: true as const };
    }),

  /** Veta a alguien (no podrá volver a entrar). */
  ban: publicProcedure
    .input(
      z.object({
        userId: z.string().min(5).max(32),
        reason: z.string().max(255).optional(),
        deleteDays: z.number().int().min(0).max(7).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const who = requireSession(ctx).user;
      await run(
        "member.ban",
        input.userId,
        `${input.reason ?? "Sin motivo"} · borrar ${input.deleteDays ?? 0} días de mensajes`,
        who,
        () => banMember(input.userId, input.reason, input.deleteDays ?? 0),
      );
      return { ok: true as const };
    }),

  /** Quita el veto. */
  unban: publicProcedure
    .input(z.object({ userId: z.string().min(5).max(32) }))
    .mutation(async ({ ctx, input }) => {
      const who = requireSession(ctx).user;
      await run("member.unban", input.userId, "Veto retirado", who, () => unbanMember(input.userId));
      return { ok: true as const };
    }),

  /** Entrega un rol a alguien. */
  addRole: publicProcedure
    .input(z.object({ userId: z.string().min(5).max(32), roleId: z.string().min(5).max(32) }))
    .mutation(async ({ ctx, input }) => {
      const who = requireSession(ctx).user;
      await run("member.role.add", input.userId, `Rol ${input.roleId}`, who, () =>
        addRole(input.userId, input.roleId),
      );
      return { ok: true as const };
    }),

  /** Quita un rol a alguien. */
  removeRole: publicProcedure
    .input(z.object({ userId: z.string().min(5).max(32), roleId: z.string().min(5).max(32) }))
    .mutation(async ({ ctx, input }) => {
      const who = requireSession(ctx).user;
      await run("member.role.remove", input.userId, `Rol ${input.roleId}`, who, () =>
        removeRole(input.userId, input.roleId),
      );
      return { ok: true as const };
    }),

  /* ---------------------------------------------------- bloqueos manuales */

  /** Lista de cuentas bloqueadas o aprobadas a mano. */
  manualBlocks: publicProcedure.query(async ({ ctx }) => {
    requireSession(ctx);
    const db = await getDb();
    if (!db) return [];
    return db.select().from(botBlocks).orderBy(desc(botBlocks.createdAt));
  }),

  /**
   * Bloquea o aprueba una cuenta a mano. Tiene prioridad sobre el análisis
   * automático: un bloqueo manual impide verificar, y una aprobación manual
   * permite pasar aunque el análisis haya bloqueado.
   */
  setManual: publicProcedure
    .input(
      z.object({
        discordId: z.string().min(5).max(32),
        username: z.string().max(64).optional(),
        kind: z.enum(["block", "allow", "none"]),
        reason: z.string().max(255).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const who = requireSession(ctx).user;
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "La base de datos no está disponible." });

      try {
        if (input.kind === "none") {
          await db.delete(botBlocks).where(eq(botBlocks.discordId, input.discordId));
          await log("manual.clear", input.discordId, "Marca manual retirada", true, who);
          return { ok: true as const, kind: "none" as const };
        }

        const existing = await db
          .select()
          .from(botBlocks)
          .where(eq(botBlocks.discordId, input.discordId))
          .limit(1);

        if (existing.length > 0) {
          await db
            .update(botBlocks)
            .set({ kind: input.kind, reason: input.reason ?? null, username: input.username ?? null, createdBy: who })
            .where(eq(botBlocks.discordId, input.discordId));
        } else {
          await db.insert(botBlocks).values({
            discordId: input.discordId,
            username: input.username ?? null,
            kind: input.kind,
            reason: input.reason ?? null,
            createdBy: who,
          });
        }

        await log(
          input.kind === "block" ? "manual.block" : "manual.allow",
          input.discordId,
          input.reason ?? "Sin motivo",
          true,
          who,
        );
        return { ok: true as const, kind: input.kind };
      } catch (error) {
        friendly(error);
      }
    }),

  /* ----------------------------------------------------------- mensajes */

  /** Publica un aviso en un canal del servidor. */
  sendMessage: publicProcedure
    .input(z.object({ channelId: z.string().min(5).max(32), content: z.string().min(1).max(2000) }))
    .mutation(async ({ ctx, input }) => {
      const who = requireSession(ctx).user;
      const id = await run("channel.message", input.channelId, input.content.slice(0, 200), who, () =>
        sendChannelMessage(input.channelId, input.content),
      );
      return { ok: true as const, messageId: id };
    }),

  /** Envía un mensaje privado a un usuario del servidor. */
  sendDm: publicProcedure
    .input(z.object({ userId: z.string().min(5).max(32), content: z.string().min(1).max(2000) }))
    .mutation(async ({ ctx, input }) => {
      const who = requireSession(ctx).user;
      const id = await run("member.dm", input.userId, input.content.slice(0, 200), who, () =>
        sendDirectMessage(input.userId, input.content),
      );
      return { ok: true as const, messageId: id };
    }),

  /* --------------------------------------------------------- historial */

  /** Historial de mensajes del servidor en los últimos días. */
  history: publicProcedure
    .input(z.object({ days: z.number().int().min(1).max(30).optional() }))
    .query(async ({ ctx, input }) => {
      requireSession(ctx);
      try {
        return await guildHistory(input.days ?? 7);
      } catch (error) {
        friendly(error);
      }
    }),

  /** Bitácora de las acciones hechas desde el panel. */
  actions: publicProcedure
    .input(z.object({ limit: z.number().int().min(1).max(200).optional() }))
    .query(async ({ ctx, input }) => {
      requireSession(ctx);
      const db = await getDb();
      if (!db) return [];
      return db
        .select()
        .from(botActions)
        .orderBy(desc(botActions.createdAt))
        .limit(input.limit ?? 50);
    }),

  /** Borra la bitácora de acciones. */
  clearActions: publicProcedure.mutation(async ({ ctx }) => {
    const who = requireOwner(ctx).user;
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "La base de datos no está disponible." });
    await db.delete(botActions);
    await log("actions.clear", null, "Bitácora vaciada", true, who);
    return { ok: true as const };
  }),

  /* ------------------------------------------------------------ prueba */

  /** Comprueba que Discord acepta el token y devuelve el nombre del bot. */
  ping: publicProcedure.mutation(async ({ ctx }) => {
    requireSession(ctx);
    try {
      const overview = await botOverview();
      return {
        ok: true as const,
        bot: overview.bot.username,
        guild: overview.guild.name,
        members: overview.guild.memberCount,
        canGrant: overview.canGrantVerified,
      };
    } catch (error) {
      friendly(error);
    }
  }),
});

/** Cuenta las acciones registradas (para mostrar el total en el panel). */
export async function actionCount(): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const rows = await db.select({ n: sql<number>`count(*)` }).from(botActions);
  return Number(rows[0]?.n ?? 0);
}
