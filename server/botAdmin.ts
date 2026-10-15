/**
 * Administración del bot desde el panel.
 *
 * Aquí está todo lo que el panel puede hacer **de verdad** sobre Discord: leer
 * el estado del bot y del servidor, gestionar miembros (roles, expulsar,
 * vetar), publicar avisos en canales, enviar mensajes privados y consultar el
 * historial del servidor. Cada acción usa la API de Discord con el token del
 * bot, así que lo que se pulsa en el panel se aplica en Discord al instante.
 *
 * Si algo falla se devuelve el error tal cual lo cuenta Discord, para que en el
 * panel se vea el motivo real (falta de permisos, jerarquía, etc.).
 */
import {
  DISCORD_API,
  applicationInfo,
  botUserId,
  config,
  discordFetch,
  resolveTarget,
} from "./discordVerify";

/** Error de Discord con el detalle que devuelve la API. */
export class DiscordError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "DiscordError";
  }
}

type FetchOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  /** Si es true, no se lanza error cuando Discord responde 404. */
  allow404?: boolean;
};

/** Llama a la API de Discord con el token del bot, con reintentos ante límites. */
export async function discord<T>(path: string, options: FetchOptions = {}): Promise<T> {
  const { method = "GET", body, allow404 = false } = options;

  for (let intento = 0; intento < 3; intento++) {
    const res = await discordFetch(`${DISCORD_API}${path}`, {
      method,
      headers: {
        Authorization: `Bot ${config.botToken}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (res.status === 204) return undefined as T;

    if (res.ok) {
      const text = await res.text();
      return (text ? JSON.parse(text) : undefined) as T;
    }

    if (res.status === 404 && allow404) return undefined as T;

    const text = await res.text();
    // Se reintenta solo ante límites de peticiones o fallos temporales.
    if (res.status === 429 || res.status >= 500) {
      const espera = Number(res.headers.get("retry-after") ?? "0");
      const ms = Number.isFinite(espera) && espera > 0 ? Math.min(espera * 1000, 5000) : 500 * (intento + 1);
      await new Promise((r) => setTimeout(r, ms));
      continue;
    }

    throw new DiscordError(explain(res.status, text), res.status);
  }

  throw new DiscordError("Discord no respondió tras varios intentos.", 503);
}

/** Traduce el error de Discord a algo entendible en el panel. */
function explain(status: number, body: string): string {
  let code: number | undefined;
  let message = body.slice(0, 200);
  try {
    const parsed = JSON.parse(body) as { code?: number; message?: string };
    code = parsed.code;
    message = parsed.message ?? message;
  } catch {
    /* la respuesta no era JSON */
  }

  if (status === 401) return "El token del bot no es válido o fue regenerado.";
  if (status === 403) {
    return "El bot no tiene permisos suficientes para esta acción. Revisa que tenga «Gestionar roles» y que su rol esté por encima del que intenta asignar.";
  }
  if (status === 404) {
    if (code === 10007) return "Ese usuario no está en el servidor.";
    if (code === 10013) return "Ese usuario de Discord no existe.";
    if (code === 10003) return "Ese canal no existe o el bot no puede verlo.";
    if (code === 10011) return "Ese rol no existe.";
    return "No se encontró lo que se pedía (¿usuario fuera del servidor?).";
  }
  if (status === 400 && code === 50035) {
    return "Los datos enviados no son válidos para Discord.";
  }
  return `Discord respondió ${status}: ${message}`;
}

/* --------------------------------------------------------- estado del bot */

export type BotOverview = {
  bot: {
    id: string;
    username: string;
    discriminator: string;
    avatar: string | null;
    /** Permisos que tiene el bot en el servidor. */
    permissions: string;
  };
  guild: {
    id: string;
    name: string;
    icon: string | null;
    ownerId: string;
    memberCount: number;
    boostTier: number;
    boostCount: number;
    createdAt: string | null;
    locale: string;
  };
  verifiedRole: { id: string; name: string; position: number; color: number };
  botTopPosition: number;
  /** Si el bot puede entregar el rol de verificado. */
  canGrantVerified: boolean;
  /** Resumen del reparto de miembros por estado. */
  members: { total: number; online: number };
  channels: { id: string; name: string; type: number; parentId: string | null }[];
  roles: { id: string; name: string; position: number; color: number; managed: boolean }[];
  /** Estado de cada permiso clave para el bot. */
  checks: { name: string; ok: boolean; detail: string }[];
  /** Cuándo se leyó esta información. */
  fetchedAt: string;
};

/**
 * Permisos de Discord que interesa comprobar. Se calculan con BigInt para no
 * perder precisión: los permisos de Discord usan bits muy altos.
 * (Se usan literales de cadena porque el proyecto compila a un objetivo antiguo.)
 */
const bit = (n: number): bigint => BigInt(1) << BigInt(n);
const PERMISSIONS = {
  CREATE_INSTANT_INVITE: bit(0),
  KICK_MEMBERS: bit(1),
  BAN_MEMBERS: bit(2),
  MANAGE_CHANNELS: bit(4),
  MANAGE_GUILD: bit(5),
  VIEW_CHANNEL: bit(10),
  SEND_MESSAGES: bit(11),
  MANAGE_MESSAGES: bit(13),
  MENTION_EVERYONE: bit(17),
  MANAGE_ROLES: bit(28),
  MODERATE_MEMBERS: bit(40),
};

/** Bit de administrador: quien lo tiene puede hacer absolutamente todo. */
const ADMINISTRATOR = bit(3);

/** Comprueba si un conjunto de permisos incluye el indicado. */
function hasPermission(permissions: string | number | undefined, bit: bigint): boolean {
  try {
    return (BigInt(permissions ?? 0) & bit) === bit;
  } catch {
    return false;
  }
}

/**
 * Lee el estado completo del bot: quién es, en qué servidor está, sus permisos,
 * los canales y los roles. Es lo primero que muestra el panel.
 */
export async function botOverview(): Promise<BotOverview> {
  // El resumen se guarda unos segundos: al abrir el panel se piden varias cosas
  // a la vez y así no se repiten las mismas llamadas a Discord.
  const now = Date.now();
  if (overviewCache && now - overviewCache.at < OVERVIEW_MS) return overviewCache.value;

  const value = await readOverview();
  overviewCache = { at: now, value };
  return value;
}

/** Cuánto se reutiliza el resumen antes de volver a leerlo. */
const OVERVIEW_MS = 20_000;
let overviewCache: { at: number; value: BotOverview } | null = null;

/** Invalida la copia del resumen (tras una acción que lo cambia). */
export function invalidateOverview(): void {
  overviewCache = null;
}

/** Lee el resumen directamente de Discord. */
async function readOverview(): Promise<BotOverview> {
  // Se usa el destino ya resuelto (con caché): forzar la resolución en cada
  // consulta añadía varias llamadas a Discord y el panel tardaba en abrirse.
  const target = await resolveTarget();
  const botId = botUserId();

  const [me, guild, roles, member, channels, membersPage] = await Promise.all([
    discord<{ id: string; username: string; discriminator: string; avatar: string | null }>("/users/@me"),
    discord<{
      id: string;
      name: string;
      icon: string | null;
      owner_id: string;
      member_count?: number;
      approximate_member_count?: number;
      approximate_presence_count?: number;
      premium_tier: number;
      premium_subscription_count: number;
      locale: string;
    }>(`/guilds/${target.guildId}?with_counts=true`),
    discord<{ id: string; name: string; position: number; color: number; managed: boolean }[]>(
      `/guilds/${target.guildId}/roles`,
    ),
    discord<{ roles: string[] }>(`/guilds/${target.guildId}/members/${botId}`),
    discord<{ id: string; name: string; type: number; parent_id: string | null }[]>(
      `/guilds/${target.guildId}/channels`,
    ),
    // El total de miembros solo llega en «aproximado», así que también se cuenta
    // la lista real para poder mostrarla con exactitud.
    discord<unknown[]>(`/guilds/${target.guildId}/members?limit=1000`).catch(() => []),
  ]);

  const botTop = Math.max(
    ...member.roles.map((id) => roles.find((r) => r.id === id)?.position ?? 0),
    0,
  );
  const verified = roles.find((r) => r.id === target.roleId);

  // Permisos efectivos del bot: Discord no los devuelve en el miembro, así que
  // se combinan los de todos sus roles, igual que hace Discord para calcularlos.
  let permissions = "0";
  try {
    let combined = BigInt(0);
    for (const roleId of member.roles) {
      const role = roles.find((r) => r.id === roleId) as { permissions?: string } | undefined;
      if (role) combined |= BigInt(role.permissions ?? "0");
    }
    permissions = combined.toString();
  } catch {
    /* si algo falla, los permisos de abajo aparecerán como ausentes */
  }

  // Con el permiso de administrador, el bot puede hacerlo todo.
  const isAdmin = permissions !== "0" && hasPermission(permissions, ADMINISTRATOR);
  const can = (permission: bigint) => isAdmin || hasPermission(permissions, permission);

  const canGrant = Boolean(verified) && botTop > (verified?.position ?? 0);

  const checks: BotOverview["checks"] = [
    {
      name: "Token del bot",
      ok: true,
      detail: `Conectado como ${me.username}`,
    },
    {
      name: "Bot en el servidor",
      ok: true,
      detail: `${guild.name}`,
    },
    {
      name: "Rol de verificado",
      ok: Boolean(verified),
      detail: verified ? `«${verified.name}» en la posición ${verified.position}` : "No se encontró el rol",
    },
    {
      name: "Jerarquía de roles",
      ok: canGrant,
      detail: canGrant
        ? `El rol del bot está por encima (${botTop} > ${verified?.position})`
        : "El rol del bot debe estar por encima del rol de verificado",
    },
    {
      name: "Permiso Gestionar roles",
      ok: can(PERMISSIONS.MANAGE_ROLES),
      detail: isAdmin
        ? "Es administrador: puede gestionar los roles"
        : "Necesario para entregar el rol al verificar",
    },
    {
      name: "Permiso Expulsar miembros",
      ok: can(PERMISSIONS.KICK_MEMBERS),
      detail: isAdmin ? "Es administrador: puede expulsar" : "Para expulsar desde el panel",
    },
    {
      name: "Permiso Vetar miembros",
      ok: can(PERMISSIONS.BAN_MEMBERS),
      detail: isAdmin ? "Es administrador: puede vetar" : "Para vetar desde el panel",
    },
    {
      name: "Permiso Enviar mensajes",
      ok: can(PERMISSIONS.SEND_MESSAGES),
      detail: isAdmin ? "Es administrador: puede escribir en todos los canales" : "Para publicar avisos en canales",
    },
  ];

  return {
    bot: { id: me.id, username: me.username, discriminator: me.discriminator, avatar: me.avatar, permissions },
    guild: {
      id: guild.id,
      name: guild.name,
      icon: guild.icon,
      ownerId: guild.owner_id,
      // Se prefiere el recuento real; el aproximado solo si no hay lista.
      memberCount: membersPage.length > 0 ? membersPage.length : (guild.approximate_member_count ?? 0),
      boostTier: guild.premium_tier,
      boostCount: guild.premium_subscription_count,
      createdAt: null,
      locale: guild.locale,
    },
    verifiedRole: verified
      ? { id: verified.id, name: verified.name, position: verified.position, color: verified.color }
      : { id: target.roleId, name: "(no encontrado)", position: 0, color: 0 },
    botTopPosition: botTop,
    canGrantVerified: canGrant,
    members: {
      total: membersPage.length > 0 ? membersPage.length : (guild.approximate_member_count ?? 0),
      online: guild.approximate_presence_count ?? 0,
    },
    channels: channels
      .filter((c) => c.type === 0 || c.type === 5)
      .map((c) => ({ id: c.id, name: c.name, type: c.type, parentId: c.parent_id })),
    roles: roles
      .filter((r) => r.name !== "@everyone")
      .sort((a, b) => b.position - a.position)
      .map((r) => ({ id: r.id, name: r.name, position: r.position, color: r.color, managed: r.managed })),
    checks,
    fetchedAt: new Date().toISOString(),
  };
}

/* ------------------------------------------------------------- miembros */

export type Member = {
  id: string;
  username: string;
  globalName: string | null;
  nickname: string | null;
  avatar: string | null;
  joinedAt: string | null;
  createdAt: string | null;
  roles: string[];
  bot: boolean;
  /** Si está vetado (no puede volver a entrar sin quitar el veto). */
  banned?: boolean;
  banReason?: string | null;
};

type RawMember = {
  user?: { id: string; username: string; global_name: string | null; avatar: string | null; bot?: boolean };
  nick: string | null;
  joined_at: string | null;
  roles: string[];
};

function mapMember(raw: RawMember): Member {
  return {
    id: raw.user?.id ?? "",
    username: raw.user?.username ?? "(desconocido)",
    globalName: raw.user?.global_name ?? null,
    nickname: raw.nick,
    avatar: raw.user?.avatar ?? null,
    joinedAt: raw.joined_at,
    createdAt: null,
    roles: raw.roles,
    bot: Boolean(raw.user?.bot),
  };
}

/**
 * Lista de miembros del servidor. Discord los devuelve de 1000 en 1000, así que
 * se pide la primera página (suficiente para un servidor de comunidad) y se
 * filtra en memoria por nombre, apodo o ID.
 */
export async function listMembers(query = "", limit = 100): Promise<Member[]> {
  const target = await resolveTarget();
  const raw = await discord<RawMember[]>(
    `/guilds/${target.guildId}/members?limit=1000`,
  );

  const needle = query.trim().toLowerCase();
  const filtered = needle
    ? raw.filter((m) => {
        const name = `${m.user?.username ?? ""} ${m.user?.global_name ?? ""} ${m.nick ?? ""} ${m.user?.id ?? ""}`;
        return name.toLowerCase().includes(needle);
      })
    : raw;

  return filtered.slice(0, limit).map(mapMember);
}

/** Detalle de un miembro concreto. */
export async function getMember(userId: string): Promise<Member | null> {
  const target = await resolveTarget();
  const raw = await discord<RawMember>(
    `/guilds/${target.guildId}/members/${userId}`,
    { allow404: true },
  );
  return raw ? mapMember(raw) : null;
}

/** Expulsa a un miembro del servidor. */
export async function kickMember(userId: string, reason?: string): Promise<void> {
  const target = await resolveTarget();
  await discord(`/guilds/${target.guildId}/members/${userId}`, {
    method: "DELETE",
    body: reason ? { reason } : undefined,
  });
}

/** Veta a un miembro (no podrá volver a entrar hasta que se quite el veto). */
export async function banMember(userId: string, reason?: string, deleteDays = 0): Promise<void> {
  const target = await resolveTarget();
  await discord(`/guilds/${target.guildId}/bans/${userId}`, {
    method: "PUT",
    body: { reason: reason ?? "Vetado desde el panel", delete_message_seconds: deleteDays * 86400 },
  });
}

/** Quita el veto a un miembro. */
export async function unbanMember(userId: string): Promise<void> {
  const target = await resolveTarget();
  await discord(`/guilds/${target.guildId}/bans/${userId}`, { method: "DELETE" });
}

/** Lista de miembros vetados. */
export async function listBans(limit = 100): Promise<Member[]> {
  const target = await resolveTarget();
  const raw = await discord<{ user: RawMember["user"]; reason: string | null }[]>(
    `/guilds/${target.guildId}/bans?limit=${limit}`,
  );
  return raw.map((b) => ({
    id: b.user?.id ?? "",
    username: b.user?.username ?? "(desconocido)",
    globalName: b.user?.global_name ?? null,
    nickname: null,
    avatar: b.user?.avatar ?? null,
    joinedAt: null,
    createdAt: null,
    roles: [],
    bot: Boolean(b.user?.bot),
    banned: true,
    banReason: b.reason,
  }));
}

/** Añade un rol a un miembro. */
export async function addRole(userId: string, roleId: string): Promise<void> {
  const target = await resolveTarget();
  await discord(`/guilds/${target.guildId}/members/${userId}/roles/${roleId}`, { method: "PUT" });
}

/** Quita un rol a un miembro. */
export async function removeRole(userId: string, roleId: string): Promise<void> {
  const target = await resolveTarget();
  await discord(`/guilds/${target.guildId}/members/${userId}/roles/${roleId}`, { method: "DELETE" });
}

/* -------------------------------------------------- mensajes y avisos */

/** Envía un mensaje a un canal del servidor. */
export async function sendChannelMessage(channelId: string, content: string): Promise<string> {
  const msg = await discord<{ id: string }>(`/channels/${channelId}/messages`, {
    method: "POST",
    body: { content: content.slice(0, 2000) },
  });
  return msg?.id ?? "";
}

/**
 * Envía un mensaje privado a un usuario. Primero hay que abrir el canal privado
 * con esa persona, y luego escribir en él.
 */
export async function sendDirectMessage(userId: string, content: string): Promise<string> {
  const channel = await discord<{ id: string }>("/users/@me/channels", {
    method: "POST",
    body: { recipient_id: userId },
  });
  const msg = await discord<{ id: string }>(`/channels/${channel.id}/messages`, {
    method: "POST",
    body: { content: content.slice(0, 2000) },
  });
  return msg?.id ?? "";
}

/* --------------------------------------------------------- historial */

/**
 * Cuenta el historial del servidor: mensajes enviados en los últimos días.
 * Discord limita mucho esta búsqueda, así que si no hay permiso se devuelve
 * el motivo en vez de fallar.
 */
export async function guildHistory(days = 7): Promise<{
  total: number;
  byDay: { date: string; count: number }[];
  unavailable?: string;
}> {
  const target = await resolveTarget();
  const since = new Date(Date.now() - days * 86_400_000);
  const minId = dateToSnowflake(since);

  let total = 0;
  const byDay = new Map<string, number>();
  let channelErrors = 0;

  const channels = await discord<{ id: string; type: number; name: string }[]>(
    `/guilds/${target.guildId}/channels`,
  );
  const textChannels = channels.filter((c) => c.type === 0 || c.type === 5);

  // Los canales se leen en paralelo: si se hiciera uno tras otro, con 35 canales
  // el resumen tardaría demasiado en abrirse.
  const batches: typeof textChannels[] = [];
  for (let i = 0; i < textChannels.length; i += 8) {
    batches.push(textChannels.slice(i, i + 8));
  }

  for (const batch of batches) {
    const results = await Promise.all(
      batch.map((channel) =>
        discord<{ id: string; timestamp: string }[]>(`/channels/${channel.id}/messages?limit=100`).catch(
          () => {
            channelErrors++;
            return [] as { id: string; timestamp: string }[];
          },
        ),
      ),
    );
    for (const msgs of results) {
      for (const msg of msgs) {
        if (msg.id < minId) continue;
        total++;
        const day = msg.timestamp.slice(0, 10);
        byDay.set(day, (byDay.get(day) ?? 0) + 1);
      }
    }
  }

  return {
    total,
    byDay: Array.from(byDay.entries())
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date)),
    unavailable:
      channelErrors > 0
        ? `No se pudieron leer ${channelErrors} canales (falta el permiso «Leer historial de mensajes»).`
        : undefined,
  };
}

/** Convierte una fecha al copo de nieve mínimo de ese instante. */
function dateToSnowflake(date: Date): string {
  // Discord cuenta los milisegundos desde el 1 de enero de 2015 y los desplaza
  // 22 bits para formar el identificador.
  const DISCORD_EPOCH = 1420070400000;
  const ms = BigInt(Math.max(0, Math.floor(date.getTime() - DISCORD_EPOCH)));
  return (ms << BigInt(22)).toString();
}

/** Cuántos mensajes se han enviado hoy en el servidor. */
export async function messagesToday(): Promise<{ total: number; unavailable?: string }> {
  // Se reutiliza durante un minuto: recorrer todos los canales es caro y el
  // número no cambia tanto como para repetirlo en cada visita.
  const now = Date.now();
  if (todayCache && now - todayCache.at < 60_000) return todayCache.value;

  const history = await guildHistory(1);
  const value = { total: history.total, unavailable: history.unavailable };
  todayCache = { at: now, value };
  return value;
}

let todayCache: { at: number; value: { total: number; unavailable?: string } } | null = null;

/**
 * Prepara el resumen y el destino en segundo plano.
 *
 * Las llamadas a Discord tardan alrededor de un segundo cada una, así que la
 * primera visita al panel pagaría toda la suma. Al arrancar se dejan ya leídas
 * y se refrescan cada 15 s, de modo que el panel siempre se abre al instante.
 * Si algo falla (por ejemplo, sin credenciales) se ignora en silencio.
 */
export function warmUp(): void {
  const refresh = () => {
    Promise.all([
      resolveTarget().catch(() => null),
      // La ficha de la aplicación (con las URLs de retorno permitidas) se deja
      // ya leída: es lo que consulta la web nada más abrirse, y sin esto la
      // primera visita de cada rato esperaría varios segundos.
      applicationInfo(true).catch(() => null),
      readOverview().then(
        (value) => {
          overviewCache = { at: Date.now(), value };
        },
        () => undefined,
      ),
      messagesToday().catch(() => undefined),
    ]).catch(() => undefined);
  };

  // Primera pasada en cuanto arranca, y luego cada 15 segundos.
  setTimeout(refresh, 1500);
  setInterval(refresh, 15_000);
}
