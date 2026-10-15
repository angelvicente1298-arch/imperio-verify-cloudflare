/**
 * Motor de verificación de cuentas de Discord.
 *
 * Analiza los metadatos que devuelve Discord Developer Portal (OAuth2) más las
 * señales de red del visitante, decide si la cuenta es apta y entrega el rol de
 * verificado. Nada de esto requiere que el usuario instale nada: solo pulsa un
 * botón y autoriza la app.
 */
import crypto from "crypto";
import { getInternal, setInternal } from "./botSettings";

export const DISCORD_API = "https://discord.com/api/v10";

/* ------------------------------------------------------------ configuración */

/**
 * Lee un número de configuración sin sorpresas: si la variable falta, está
 * vacía o no es un número válido, se usa el valor por defecto. Evita que una
 * variable vacía desactive un control de seguridad (Number("") sería 0).
 */
function numEnv(value: string | undefined, fallback: number, min = 0): number {
  if (value === undefined || value.trim() === "") return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min) return fallback;
  return parsed;
}

export const config = {
  clientId: process.env.DISCORD_CLIENT_ID ?? "",
  clientSecret: process.env.DISCORD_CLIENT_SECRET ?? "",
  botToken: process.env.DISCORD_BOT_TOKEN ?? "",
  guildId: process.env.DISCORD_GUILD_ID ?? "",
  verifiedRoleId: process.env.DISCORD_VERIFIED_ROLE_ID ?? "",
  redirectUriOverride: process.env.DISCORD_REDIRECT_URI ?? "",
  /**
   * Dominios que también están registrados en el Developer Portal, separados
   * por comas. Sirve para dos cosas: usar el dominio correcto cuando Discord no
   * responde, y no mostrar el aviso de «falta registrar» por error.
   */
  allowedDomains: (process.env.DISCORD_ALLOWED_DOMAINS ?? "")
    .split(",")
    .map(d => d.trim())
    .filter(Boolean),
  /** Días mínimos de antigüedad de la cuenta (5 por defecto). */
  minAccountDays: numEnv(process.env.VERIFY_MIN_ACCOUNT_DAYS, 5, 0),
  /** Cuentas distintas permitidas por IP. 2 = se bloquea la segunda. */
  maxAccountsPerIp: numEnv(process.env.VERIFY_MAX_ACCOUNTS_PER_IP, 2, 1),
  /** Cuentas distintas permitidas por dispositivo. */
  maxAccountsPerDevice: numEnv(process.env.VERIFY_MAX_ACCOUNTS_PER_DEVICE, 2, 1),
  /** Puntaje de riesgo que ya no permite entrar. */
  maxRisk: numEnv(process.env.VERIFY_MAX_RISK, 40, 1),
  ipqsKey: process.env.IPQUALITYSCORE_API_KEY ?? "",
};

/** ¿Están todas las credenciales de Discord presentes? */
export function isConfigured(): boolean {
  const c = config;
  // El servidor y el rol se pueden resolver solos con el token del bot, así que
  // solo exigimos las tres credenciales indispensables.
  return Boolean(c.clientId && c.clientSecret && c.botToken);
}

/** Qué falta configurar (para mostrarlo en el panel). */
export function missingConfig(): string[] {
  const missing: string[] = [];
  if (!config.clientId) missing.push("DISCORD_CLIENT_ID");
  if (!config.clientSecret) missing.push("DISCORD_CLIENT_SECRET");
  if (!config.botToken) missing.push("DISCORD_BOT_TOKEN");
  return missing;
}

const NUMERIC_ID = /^\d{17,20}$/;

/**
 * Cuánto se espera a Discord antes de darlo por perdido.
 *
 * Sin este límite, si Discord no responde (caída, red bloqueada, cortafuegos)
 * cada llamada se queda colgada hasta el tiempo de espera del sistema y la web
 * tarda muchísimo en abrirse o en mostrar el botón de verificar.
 */
const DISCORD_TIMEOUT_MS = 6_000;

/** Pide algo a Discord con un límite de tiempo. */
export async function discordFetch(
  url: string,
  init: RequestInit = {},
  timeoutMs = DISCORD_TIMEOUT_MS,
): Promise<Response> {
  return fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
}

/* ------------------------------------------------- URL de retorno (redirect) */

type AppInfo = { id: string; name: string; redirect_uris?: string[] | null };
let cachedApp: AppInfo | null = null;

/** Cuánto se reutiliza la ficha de la aplicación antes de volver a leerla. */
const APP_CACHE_MS = 5 * 60 * 1000;
let appCachedAt = 0;

/** Clave donde se recuerdan las URLs de retorno registradas. */
const APP_KEY = "internal.appInfo";

/** Lee la ficha de la aplicación (incluye las URLs de retorno registradas). */
export async function applicationInfo(force = false): Promise<AppInfo | null> {
  if (cachedApp && !force && Date.now() - appCachedAt < APP_CACHE_MS) return cachedApp;

  // Si ya hay una lectura en curso se aprovecha, pero con un límite de tiempo:
  // si esa lectura se atasca, esperarla sin más dejaría colgadas todas las
  // visitas siguientes (el botón se quedaría en «Abriendo Discord…» para
  // siempre). Pasado el límite se sigue sin ella.
  if (pendingApp) return withTimeout(pendingApp, APP_TIMEOUT_MS);

  pendingApp = withTimeout(readApp(), APP_TIMEOUT_MS)
    .then((value) => {
      if (value) {
        cachedApp = value;
        appCachedAt = Date.now();
      }
      return value;
    })
    .finally(() => {
      pendingApp = null;
    });
  return pendingApp;
}

let pendingApp: Promise<AppInfo | null> | null = null;

/**
 * Cuánto se espera a la ficha de la aplicación antes de seguir sin ella.
 *
 * Es una lectura que se hace al abrir la web (para saber la URL de retorno), así
 * que nunca puede bloquear la pantalla.
 */
const APP_TIMEOUT_MS = 5_000;

/** Devuelve el valor de una promesa, o `null` si tarda más de lo permitido. */
async function withTimeout<T>(work: Promise<T>, ms: number): Promise<T | null> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), ms);
      }),
    ]);
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Hace la lectura de verdad. */
async function readApp(): Promise<AppInfo | null> {
  try {
    const res = await discordFetch(`${DISCORD_API}/applications/@me`, {
      headers: { Authorization: `Bot ${config.botToken}` },
    });
    if (!res.ok) return await rememberedApp();
    const info = (await res.json()) as AppInfo;
    // Se recuerda lo leído: si Discord no responde más tarde, se sigue sabiendo
    // qué direcciones están permitidas en lugar de dar por hecho que no hay.
    void setInternal(APP_KEY, JSON.stringify(info));
    return info;
  } catch {
    return await rememberedApp();
  }
}

/**
 * Última ficha conocida de la aplicación, guardada de una lectura anterior.
 *
 * Esto evita el aviso engañoso de «falta registrar el dominio» cuando el
 * problema real es que Discord no contesta.
 */
async function rememberedApp(): Promise<AppInfo | null> {
  const raw = await getInternal(APP_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as AppInfo;
    if (Array.isArray(parsed?.redirect_uris) && parsed.redirect_uris.length > 0) {
      cachedApp = parsed;
      return parsed;
    }
  } catch {
    // Dato corrupto: se ignora y se resolverá al recuperar la conexión.
  }
  return null;
}

/** Dominio de una URL (sin barra final ni protocolo), para comparar. */
export function hostOf(value: string): string {
  try {
    return new URL(value).host;
  } catch {
    return "";
  }
}

function isLocalhost(value: string): boolean {
  const host = hostOf(value);
  return host.startsWith("localhost") || host.startsWith("127.0.0.1");
}

/**
 * URL de retorno que hay que enviar a Discord.
 *
 * Discord exige que coincida **exactamente** con una de las registradas en el
 * Developer Portal (una barra final de diferencia ya la invalida). Por eso aquí
 * se leen las URLs registradas y se devuelve la que corresponde al dominio
 * actual, en lugar de construirla a mano.
 */
export async function callbackUrl(origin: string): Promise<string> {
  if (config.redirectUriOverride) return config.redirectUriOverride;

  const host = hostOf(origin);

  // 0) Dominios configurados a mano: se resuelven al instante y sin depender de
  //    Discord. Es el caso normal del sitio publicado, así que la web abre sin
  //    esperar a nada.
  const configured = config.allowedDomains;
  const configuredMatch = configured.find(d => d === host);
  if (configuredMatch) return `https://${configuredMatch}`;

  // La lista de URLs registradas casi nunca cambia y cada consulta a Discord
  // cuesta alrededor de un segundo, así que se guarda unos minutos.
  const app = await applicationInfo();
  // Si Discord no responde (`null`), se tira de la lista configurada a mano
  // para no quedarnos sin URL de retorno.
  const registered = (app?.redirect_uris ?? []).filter(Boolean);

  // 1) Coincidencia de dominio con el sitio actual (la situación normal).
  const match = registered.find(uri => hostOf(uri) === host);
  if (match) {
    // Sin avisos: es el caso normal.
    return match;
  }

  // 1b) El dominio actual está configurado como permitido pero Discord no
  //     respondió: se confía en la configuración y se sigue adelante.
  if (app === null && configured.length > 0) {
    const preferred = configured.find(d => !d.startsWith("localhost")) ?? configured[0];
    if (!warnedHosts.has(`offline:${preferred}`)) {
      warnedHosts.add(`offline:${preferred}`);
      console.warn(
        `[Discord] Sin conexión para leer las URLs registradas. Se usará ${preferred} (de DISCORD_ALLOWED_DOMAINS).`,
      );
    }
    return `https://${preferred}`;
  }

  // 2) Sin coincidencia: se usa una registrada que no sea de desarrollo, para
  //    que la verificación pueda completarse aunque se entre por otro dominio.
  const production = registered.find(uri => !isLocalhost(uri));
  if (production) {
    // Se avisa una sola vez por dominio para no llenar los registros.
    if (!warnedHosts.has(host)) {
      warnedHosts.add(host);
      console.warn(
        `[Discord] El dominio ${host} no está registrado en el Developer Portal. Se usará ${production}.`,
      );
    }
    return production;
  }

  if (registered.length > 0) return registered[0];

  // 3) Sin ninguna registrada: se avisa en la interfaz.
  return origin;
}

/** Dominios ya avisados, para no repetir el mismo aviso. */
const warnedHosts = new Set<string>();

/**
 * Diagnóstico para la interfaz: si la URL de retorno coincide o no con las
 * registradas, y cuál hay que añadir en el Developer Portal si falta.
 */
export async function redirectStatus(origin: string): Promise<{
  ok: boolean;
  used: string;
  registered: string[];
  suggested: string;
  /** Discord no respondió: no se puede saber si el dominio está registrado. */
  unknown?: boolean;
}> {
  const used = await callbackUrl(origin);
  const host = hostOf(used);

  // Si el dominio está configurado a mano se da por bueno sin preguntar a
  // Discord: así la web abre al instante y no depende de que Discord responda.
  if (config.allowedDomains.includes(host)) {
    return { ok: true, used, registered: [], suggested: origin };
  }

  // Sin forzar: cada consulta a Discord cuesta alrededor de un segundo, y esto
  // se llama en cada visita a la web. La lista de URLs registradas cambia muy
  // rara vez, así que se reutiliza la copia ya leída.
  const app = await applicationInfo();
  const registered = ((app?.redirect_uris ?? []).filter(Boolean) as string[]) ?? [];

  // Sin respuesta de Discord no se puede comprobar nada: se marca como
  // «desconocido» para que la web no afirme que falta registrar el dominio
  // cuando en realidad solo está caída la red.
  if (app === null) {
    return {
      ok: true,
      unknown: true,
      used,
      registered,
      suggested: origin,
    };
  }

  // Es válida si su dominio está entre los registrados.
  const ok = registered.some(uri => hostOf(uri) === host);

  return {
    ok,
    used,
    registered,
    // Lo que debería registrarse para que funcione desde este dominio.
    suggested: registered.find(uri => hostOf(uri) === hostOf(origin)) ?? origin,
  };
}

/* ------------------------------------------- resolución automática de destino */

/**
 * Averigua el servidor y el rol de verificado. Si los IDs configurados no son
 * válidos (o no existen), se detectan automáticamente usando el token del bot:
 * el primer servidor donde esté el bot y el rol llamado «Verificado». Así el
 * sistema funciona aunque un ID se pegue mal en la configuración.
 */
type Target = { guildId: string; roleId: string; roleName: string; guildName: string };
let cachedTarget: Target | null = null;

async function botGet<T>(path: string): Promise<T> {
  // Se reintenta ante límites de peticiones (429) y errores temporales del
  // servidor de Discord (5xx), que son pasajeros y no deben romper nada.
  let lastError = "";
  for (let intento = 0; intento < 3; intento++) {
    const res = await discordFetch(`${DISCORD_API}${path}`, {
      headers: { Authorization: `Bot ${config.botToken}` },
    });
    if (res.ok) return (await res.json()) as T;

    const text = await res.text();
    lastError = `Discord respondió ${res.status}: ${text.slice(0, 160)}`;

    // Solo se reintenta si es un límite de peticiones o un fallo temporal.
    if (res.status !== 429 && res.status < 500) break;

    // Discord indica cuántos segundos esperar en la cabecera Retry-After.
    const espera = Number(res.headers.get("retry-after") ?? "0");
    const ms = Number.isFinite(espera) && espera > 0 ? Math.min(espera * 1000, 5000) : 400 * (intento + 1);
    await new Promise((r) => setTimeout(r, ms));
  }
  throw new Error(lastError);
}

export async function resolveTarget(force = false): Promise<Target> {
  if (cachedTarget && !force) return cachedTarget;
  // Si varias cosas piden el destino a la vez (el resumen, el historial y el
  // calentador arrancan juntos), todas verían la caché vacía y repetirían las
  // mismas llamadas a Discord. Guardando la promesa en curso, la segunda espera
  // a la primera en lugar de volver a empezar.
  // Igual que con la ficha de la aplicación: si la resolución en curso se
  // atasca, esperarla sin más dejaría pegada la entrega de acceso (y con ella
  // toda la verificación). Pasado el límite se intenta resolver de nuevo.
  if (pendingTarget && !force) {
    return withTimeout(pendingTarget, TARGET_TIMEOUT_MS).then((value) => {
      if (value) return value;
      return resolveTargetNow();
    });
  }

  pendingTarget = resolveTargetNow()
    .catch(async (error) => {
      // Si Discord no responde, se entrega a dónde se entregaba ayer en lugar de
      // dejar la verificación inservible. El error solo se propaga si nunca se
      // llegó a resolver nada.
      const remembered = await rememberedTarget();
      if (remembered) {
        console.warn(
          `[Discord] No se pudo comprobar el destino (${error instanceof Error ? error.message : error}). Se usa el último conocido: ${remembered.guildName} / ${remembered.roleName}.`,
        );
        return remembered;
      }
      throw error;
    })
    .finally(() => {
      pendingTarget = null;
    });
  return pendingTarget;
}

/** Resolución en curso, para no repetirla si se pide dos veces a la vez. */
let pendingTarget: Promise<Target> | null = null;

/**
 * Cuánto se espera a la resolución del destino antes de darla por fallida.
 *
 * Cubre varios reintentos de Discord (límite de peticiones incluido), pero
 * nunca deja la entrega de acceso esperando sin fin.
 */
const TARGET_TIMEOUT_MS = 12_000;

/** Hace la resolución de verdad (varias llamadas a Discord). */
async function resolveTargetNow(): Promise<Target> {
  type Guild = { id: string; name: string };
  type Role = { id: string; name: string; position: number };

  let guild: Guild | null = null;

  if (NUMERIC_ID.test(config.guildId)) {
    try {
      guild = await botGet<Guild>(`/guilds/${config.guildId}`);
    } catch {
      guild = null;
    }
  }

  if (!guild) {
    const guilds = await botGet<Guild[]>("/users/@me/guilds");
    if (guilds.length === 0) {
      throw new Error(
        "El bot no está en ningún servidor. Invítalo a tu servidor de Discord e inténtalo de nuevo.",
      );
    }
    // Si está en varios, se prefiere el que coincida por nombre con la marca.
    guild =
      guilds.find(g => g.name.toLowerCase().includes("imperio")) ??
      (guilds.length === 1 ? guilds[0] : guilds[0]);
    console.warn(`[Discord] Servidor detectado automáticamente: ${guild.name} (${guild.id})`);
  }

  const roles = await botGet<Role[]>(`/guilds/${guild.id}/roles`);

  let role = NUMERIC_ID.test(config.verifiedRoleId)
    ? roles.find(r => r.id === config.verifiedRoleId)
    : undefined;

  if (!role) {
    const keywords = ["verificad", "verified"];
    role =
      roles.find(r => keywords.some(k => r.name.toLowerCase().includes(k))) ??
      undefined;
  }

  if (!role) {
    throw new Error(
      `No se encontró el rol de verificado en «${guild.name}». Crea un rol llamado «Verificado» o configura DISCORD_VERIFIED_ROLE_ID. Roles disponibles: ` +
        roles.filter(r => r.name !== "@everyone").map(r => r.name).slice(0, 12).join(", "),
    );
  }

  if (role.id !== config.verifiedRoleId || guild.id !== config.guildId) {
    console.warn(
      `[Discord] Destino resuelto automáticamente → servidor ${guild.name} (${guild.id}), rol ${role.name} (${role.id})`,
    );
  }

  cachedTarget = {
    guildId: guild.id,
    roleId: role.id,
    roleName: role.name,
    guildName: guild.name,
  };
  // Se recuerda también en la base de datos: si el servidor se reinicia o
  // Discord no responde, la verificación sigue sabiendo a dónde entregar.
  void setInternal(TARGET_KEY, JSON.stringify(cachedTarget));
  return cachedTarget;
}

/** Clave donde se recuerda el servidor y el rol ya resueltos. */
const TARGET_KEY = "internal.resolvedTarget";

/**
 * Último destino conocido, leído de la base de datos.
 *
 * Evita que un fallo de red con Discord deje la verificación inservible: se usa
 * solo lo imprescindible (a qué servidor unir y qué rol entregar).
 */
export async function rememberedTarget(): Promise<Target | null> {
  if (cachedTarget) return cachedTarget;
  const raw = await getInternal(TARGET_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Target;
    if (parsed?.guildId && parsed?.roleId) {
      cachedTarget = parsed;
      return parsed;
    }
  } catch {
    // Un valor corrupto se ignora: se volverá a resolver al recuperar la red.
  }
  return null;
}

/* ---------------------------------------------------------- oauth de Discord */

export async function buildAuthorizeUrl(origin: string, state: string): Promise<string> {
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: await callbackUrl(origin),
    response_type: "code",
    // guilds.join permite añadir a la persona al servidor con su propio token.
    scope: "identify email guilds.join",
    state,
    prompt: "consent",
  });
  return `https://discord.com/oauth2/authorize?${params.toString()}`;
}

export function signState(): string {
  const payload = { n: crypto.randomBytes(16).toString("hex"), t: Date.now() };
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

export function verifyState(state: string | undefined, maxAgeMs = 15 * 60 * 1000): boolean {
  if (!state) return false;
  try {
    const parsed = JSON.parse(Buffer.from(state, "base64url").toString("utf8"));
    return typeof parsed?.n === "string" && Date.now() - Number(parsed.t) < maxAgeMs;
  } catch {
    return false;
  }
}

type TokenResponse = { access_token?: string; token_type?: string; error?: string; error_description?: string };

/**
 * Traduce los errores técnicos de Discord a algo que entienda una persona.
 *
 * Discord responde en inglés y muy escueto («Invalid "code" in request.»), lo
 * que en la web parecía un fallo grave cuando en realidad casi siempre significa
 * que el enlace ya se usó o caducó: basta con volver a pulsar el botón.
 */
function friendlyDiscordError(error: string | undefined, description: string | undefined): string {
  const texto = `${error ?? ""} ${description ?? ""}`.toLowerCase();

  if (texto.includes("invalid_grant") || texto.includes("invalid \"code\"") || texto.includes("invalid code")) {
    return "El enlace de autorización ya se usó o caducó. Vuelve a pulsar «Verificarme con Discord».";
  }
  if (texto.includes("invalid_client")) {
    return "Las credenciales de la aplicación no son válidas. Avisa al administrador del servidor.";
  }
  if (texto.includes("invalid_request") || texto.includes("redirect_uri")) {
    return "Discord rechazó la dirección de vuelta. Avisa al administrador del servidor.";
  }
  if (error === "access_denied") {
    return "Cancelaste la autorización en Discord. Puedes intentarlo de nuevo cuando quieras.";
  }
  // Cualquier otra cosa: se da contexto en lugar del texto crudo en inglés.
  return "No se pudo completar la autorización con Discord. Vuelve a intentarlo en unos segundos.";
}

export async function exchangeCode(code: string, origin: string): Promise<string> {
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    grant_type: "authorization_code",
    code,
    redirect_uri: await callbackUrl(origin),
  });

  const res = await discordFetch(`${DISCORD_API}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = (await res.json()) as TokenResponse;
  if (!res.ok || !data.access_token) {
    // El detalle técnico queda en los registros del servidor; a la persona se le
    // da un mensaje que puede entender y accionar.
    console.warn(
      `[Discord] Falló el canje del código: ${data.error ?? res.status} — ${data.error_description ?? ""}`,
    );
    throw new Error(friendlyDiscordError(data.error, data.error_description));
  }
  return data.access_token;
}

export type DiscordUser = {
  id: string;
  username: string;
  global_name?: string | null;
  avatar?: string | null;
  email?: string | null;
  verified?: boolean;
};

export async function fetchDiscordUser(accessToken: string): Promise<DiscordUser> {
  const res = await discordFetch(`${DISCORD_API}/users/@me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error("Discord no devolvió los datos de la cuenta");
  return (await res.json()) as DiscordUser;
}

/** Une al usuario al servidor usando su propio token (scope guilds.join). */
export async function addGuildMember(userId: string, accessToken: string): Promise<boolean> {
  const target = await resolveTarget();

  // Si la persona YA está en el servidor no hay nada que hacer: se sale sin
  // gastar el token. Es el caso más habitual (entró por invitación y luego
  // verifica), y antes se llamaba a Discord igualmente.
  const yaEsta = await isGuildMember(userId);
  if (yaEsta) return true;

  const res = await discordFetch(`${DISCORD_API}/guilds/${target.guildId}/members/${userId}`, {
    method: "PUT",
    headers: {
      Authorization: `Bot ${config.botToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ access_token: accessToken }),
  });
  // 201 = añadido ahora, 204 = ya era miembro.
  if (res.status === 201 || res.status === 204) return true;

  const text = await res.text();

  // El token de la persona sirve UNA sola vez. Si ya se usó (por ejemplo porque
  // reintentó o porque el navegador repitió la llamada), Discord lo rechaza
  // aunque la persona sea legítima y ya esté dentro. Se comprueba de nuevo la
  // pertenencia antes de fallar, para no negar el rol por un token gastado.
  if (await isGuildMember(userId)) return true;

  throw new Error(`No se pudo unir al servidor: ${res.status} ${text.slice(0, 180)}`);
}

/** ¿La persona ya pertenece al servidor? (consulta directa a Discord) */
export async function isGuildMember(userId: string): Promise<boolean> {
  try {
    const target = await resolveTarget();
    const res = await discordFetch(`${DISCORD_API}/guilds/${target.guildId}/members/${userId}`, {
      headers: { Authorization: `Bot ${config.botToken}` },
    });
    return res.status === 200;
  } catch {
    // Si no se puede comprobar (Discord caído), no se afirma nada: se deja que
    // el intento normal siga su curso.
    return false;
  }
}

/** Entrega el rol de verificado. */
export async function grantVerifiedRole(userId: string): Promise<boolean> {
  const target = await resolveTarget();
  // Con límite de tiempo: sin él, si Discord no responde esta llamada se queda
  // esperando indefinidamente y la web se queda pegada en «Entrega de acceso».
  const res = await discordFetch(
    `${DISCORD_API}/guilds/${target.guildId}/members/${userId}/roles/${target.roleId}`,
    {
      method: "PUT",
      headers: { Authorization: `Bot ${config.botToken}` },
    },
  );
  if (res.status === 204) return true;
  const text = await res.text();
  throw new Error(`No se pudo asignar el rol: ${res.status} ${text.slice(0, 180)}`);
}

/**
 * Roles que se entregan al verificar. Además del rol de «Verificado» se pueden
 * repartir otros (por ejemplo «Miembro») separándolos por comas en
 * DISCORD_EXTRA_ROLE_IDS. Se ignoran los IDs repetidos o ya entregados.
 */
export function extraRoleIds(): string[] {
  const raw = process.env.DISCORD_EXTRA_ROLE_IDS ?? "1550275700114587679";
  return raw
    .split(",")
    .map(id => id.trim())
    .filter(id => NUMERIC_ID.test(id));
}

/**
 * Entrega al usuario el rol de verificado **y** los roles extra configurados.
 * Si algún rol extra falla (por ejemplo, porque ya lo tiene o está por encima
 * del bot), no se interrumpe la verificación: se informa y se continúa, porque
 * lo esencial es haber dado el rol de verificado.
 */
export async function grantAllRoles(userId: string): Promise<{
  granted: string[];
  failed: { roleId: string; error: string }[];
}> {
  // Presupuesto total de la entrega. Cada llamada a Discord ya tiene su propio
  // límite, pero se suman: resolver el destino (12 s) más el rol de verificado
  // con su reintento (6 s + 6 s) podía pasar de los 20 s y dejar la pantalla
  // cargando demasiado tiempo. Con esta marca, en cuanto se agota el presupuesto
  // se responde en lugar de seguir esperando.
  const inicio = Date.now();
  const PRESUPUESTO_MS = 18_000;
  const queda = () => PRESUPUESTO_MS - (Date.now() - inicio);

  const target = await resolveTarget();
  const granted: string[] = [];
  const failed: { roleId: string; error: string }[] = [];

  // 1) Rol de verificado (esencial: si falla, la verificación falla).
  //    Se reintenta una vez: un fallo puntual de red con Discord no debería
  //    impedir que la persona reciba su rol (y antes dejaba la web pegada).
  let okVerified = false;
  let ultimoError: unknown = null;
  for (let intento = 0; intento < 2 && !okVerified; intento++) {
    // Solo se reintenta si aún queda tiempo para intentarlo.
    if (intento > 0 && queda() < 4_000) break;
    try {
      okVerified = await grantVerifiedRole(userId);
    } catch (error) {
      ultimoError = error;
      if (intento === 0) {
        console.warn(
          `[Discord] Fallo al dar el rol, se reintenta: ${error instanceof Error ? error.message : error}`,
        );
        await new Promise((r) => setTimeout(r, 800));
      }
    }
  }
  if (!okVerified && ultimoError) throw ultimoError;
  if (okVerified) granted.push(target.roleName);

  // 2) Roles extra (opcionales: un fallo no rompe la verificación).
  const extra = extraRoleIds().filter(id => id !== target.roleId);
  for (const roleId of extra) {
    // Los roles extra son opcionales: si se agotó el presupuesto se informan como
    // no entregados y se responde, en lugar de alargar la espera.
    if (queda() < 3_000) {
      failed.push({ roleId, error: "sin tiempo: la entrega tardó demasiado" });
      continue;
    }
    try {
      const res = await discordFetch(
        `${DISCORD_API}/guilds/${target.guildId}/members/${userId}/roles/${roleId}`,
        { method: "PUT", headers: { Authorization: `Bot ${config.botToken}` } },
      );
      if (res.status === 204) {
        granted.push(roleId);
      } else {
        failed.push({ roleId, error: `${res.status} ${(await res.text()).slice(0, 120)}` });
      }
    } catch (err) {
      failed.push({ roleId, error: err instanceof Error ? err.message : "error desconocido" });
    }
  }

  if (failed.length > 0) {
    console.warn(`[Discord] Roles extra no entregados: ${JSON.stringify(failed)}`);
  }

  return { granted, failed };
}

/** Comprueba que los roles configurados existen y el bot puede entregarlos. */
export async function checkRoles(): Promise<
  { roleId: string; name: string; deliverable: boolean; reason?: string }[]
> {
  let target;
  try {
    target = await resolveTarget(true);
  } catch (err) {
    return [
      {
        roleId: config.verifiedRoleId,
        name: "(sin resolver)",
        deliverable: false,
        reason: err instanceof Error ? err.message : "error",
      },
    ];
  }

  const roles = await botGet<{ id: string; name: string; position: number }[]>(
    `/guilds/${target.guildId}/roles`,
  );
  const botId = botUserId();
  const member = await botGet<{ roles: string[] }>(`/guilds/${target.guildId}/members/${botId}`);
  const botTop = Math.max(
    ...member.roles.map(id => roles.find(r => r.id === id)?.position ?? 0),
  );

  const wanted = [target.roleId, ...extraRoleIds()];
  return wanted.map(id => {
    const role = roles.find(r => r.id === id);
    if (!role) {
      return { roleId: id, name: "(no existe)", deliverable: false, reason: "El rol no existe en el servidor" };
    }
    const deliverable = botTop > role.position;
    return {
      roleId: id,
      name: role.name,
      deliverable,
      reason: deliverable ? undefined : `El rol del bot está por debajo de «${role.name}»`,
    };
  });
}

/** ID del propio bot, deducido del token (su primera parte es base64 del ID). */
export function botUserId(): string {
  try {
    return Buffer.from(config.botToken.split(".")[0], "base64").toString("utf8");
  } catch {
    return "";
  }
}

/* ------------------------------------------------------------ metadatos */

/** Los IDs de Discord (snowflake) incluyen la fecha de creación de la cuenta. */
export function snowflakeToDate(id: string): Date | null {
  try {
    const ms = Number(BigInt(id) >> BigInt(22)) + 1420070400000;
    const date = new Date(ms);
    return Number.isNaN(date.getTime()) ? null : date;
  } catch {
    return null;
  }
}

export function daysBetween(from: Date, to: Date = new Date()): number {
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / 86_400_000));
}

export type IpInfo = {
  ok: boolean;
  country: string | null;
  countryCode: string | null;
  city: string | null;
  isp: string | null;
  timezone: string | null;
  proxy: boolean;
  hosting: boolean;
  mobile: boolean;
  privateIp: boolean;
  source: string;
};

export function isPrivateIp(ip: string): boolean {
  if (!ip) return true;
  const clean = ip.replace(/^::ffff:/, "");
  if (clean === "::1" || clean === "127.0.0.1" || clean === "localhost") return true;
  if (/^10\./.test(clean)) return true;
  if (/^192\.168\./.test(clean)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(clean)) return true;
  if (/^169\.254\./.test(clean)) return true;
  if (/^f[cd]/i.test(clean)) return true;
  return false;
}

const EMPTY_IP: Omit<IpInfo, "privateIp" | "source"> = {
  ok: false,
  country: null,
  countryCode: null,
  city: null,
  isp: null,
  timezone: null,
  proxy: false,
  hosting: false,
  mobile: false,
};

/** Geolocaliza y detecta VPN/proxy/centro de datos de la IP del visitante. */
export async function lookupIp(ip: string): Promise<IpInfo> {
  if (isPrivateIp(ip)) {
    return { ...EMPTY_IP, privateIp: true, source: "local" };
  }

  // Detección opcional de mayor calidad si hay clave de IPQualityScore.
  let ipqs: { proxy: boolean; vpn: boolean; tor: boolean; hosting: boolean } | null = null;
  if (config.ipqsKey) {
    try {
      const res = await fetch(
        `https://ipqualityscore.com/api/json/ip/${config.ipqsKey}/${encodeURIComponent(ip)}?strictness=1`,
        { signal: AbortSignal.timeout(6000) },
      );
      if (res.ok) {
        const data = (await res.json()) as Record<string, unknown>;
        ipqs = {
          proxy: Boolean(data.proxy),
          vpn: Boolean(data.vpn),
          tor: Boolean(data.tor),
          hosting: Boolean(data.is_crawler) || Boolean(data.recent_abuse),
        };
      }
    } catch {
      ipqs = null;
    }
  }

  try {
    const fields =
      "status,message,country,countryCode,city,timezone,isp,org,as,mobile,proxy,hosting,query";
    const res = await discordFetch(`http://ip-api.com/json/${encodeURIComponent(ip)}?fields=${fields}`, {
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) throw new Error(`ip-api ${res.status}`);
    const data = (await res.json()) as Record<string, unknown>;
    if (data.status !== "success") {
      return { ...EMPTY_IP, privateIp: false, source: "ip-api:error" };
    }
    return {
      ok: true,
      country: (data.country as string) ?? null,
      countryCode: (data.countryCode as string) ?? null,
      city: (data.city as string) ?? null,
      isp: (data.isp as string) ?? null,
      timezone: (data.timezone as string) ?? null,
      proxy: Boolean(data.proxy) || Boolean(ipqs?.proxy) || Boolean(ipqs?.vpn) || Boolean(ipqs?.tor),
      hosting: Boolean(data.hosting) || Boolean(ipqs?.hosting),
      mobile: Boolean(data.mobile),
      privateIp: false,
      source: ipqs ? "ip-api+ipqs" : "ip-api",
    };
  } catch {
    // Si el servicio externo falla no bloqueamos: se marca como desconocido.
    return { ...EMPTY_IP, privateIp: false, source: "unavailable" };
  }
}

/* ------------------------------------------------------------- antifraude */

export type Reason = { code: string; text: string; score: number; hard?: boolean };

export type RiskInput = {
  accountAgeDays: number | null;
  accountVerifiedEmail: boolean;
  ip: IpInfo;
  /** Diferencia entre la zona horaria del navegador y la de la IP. */
  timezoneMismatch: boolean;
  sameIpAccounts: number;
  sameFingerprintAccounts: number;
  fingerprintMissing: boolean;
};

export type RiskResult = {
  decision: "allow" | "block";
  score: number;
  reasons: Reason[];
};

/** Reglas que se pueden ajustar desde el panel de administración. */
export type RiskOptions = {
  minAccountDays: number;
  maxAccountsPerIp: number;
  maxAccountsPerDevice: number;
  maxRisk: number;
  blockVpn: boolean;
  blockDatacenter: boolean;
  blockTimezoneMismatch: boolean;
  requireVerifiedEmail: boolean;
};

/**
 * Reglas antifraude: multicuentas, VPN/proxy y cuentas desechables.
 *
 * Las reglas que se pueden ajustar desde el panel llegan en `options`; si no se
 * pasan, se usan las de la configuración por defecto (variables de entorno).
 */
export function evaluateRisk(input: RiskInput, options?: Partial<RiskOptions>): RiskResult {
  const reasons: Reason[] = [];
  const c = { ...config, ...options };
  const flags = {
    blockVpn: options?.blockVpn ?? true,
    blockDatacenter: options?.blockDatacenter ?? true,
    blockTimezoneMismatch: options?.blockTimezoneMismatch ?? false,
    requireVerifiedEmail: options?.requireVerifiedEmail ?? false,
  };

  if (input.ip.proxy && flags.blockVpn) {
    reasons.push({
      code: "vpn_proxy",
      text: "Se detectó VPN, proxy o red Tor en tu conexión.",
      score: 100,
      hard: true,
    });
  }

  if (input.ip.hosting && !input.ip.mobile && flags.blockDatacenter) {
    reasons.push({
      code: "datacenter",
      text: "La conexión proviene de un centro de datos, no de una red doméstica.",
      score: 100,
      hard: true,
    });
  }

  if (input.accountAgeDays !== null && input.accountAgeDays < c.minAccountDays) {
    reasons.push({
      code: "account_too_new",
      text: `Tu cuenta de Discord tiene ${input.accountAgeDays} días; se requieren al menos ${c.minAccountDays}.`,
      score: 100,
      hard: true,
    });
  }

  if (input.sameFingerprintAccounts >= c.maxAccountsPerDevice) {
    reasons.push({
      code: "device_reuse",
      text: `Este dispositivo ya verificó otra cuenta (${input.sameFingerprintAccounts} registradas).`,
      score: 100,
      hard: true,
    });
  }

  // La dirección IP se comparte mucho más de lo que parece: los operadores usan
  // CGNAT, así que miles de clientes salen a internet con la misma IP pública
  // (muy habitual en Venezuela). Por eso la IP no puede decidir por sí sola:
  // si lo hiciera, la tercera persona de una misma red se quedaría sin rol
  // aunque sea legítima. Se separa en dos casos:
  //   · varias cuentas pero pocas → señal de riesgo moderada (no bloquea sola).
  //   · muchas cuentas desde la misma conexión → abuso claro, sí bloquea.
  // El bloqueo duro de multicuentas queda para el dispositivo repetido, que sí
  // identifica a la misma persona creando varias cuentas.
  if (input.sameIpAccounts >= c.maxAccountsPerIp) {
    const abusoClaro = input.sameIpAccounts >= c.maxAccountsPerIp * 3;
    reasons.push({
      code: abusoClaro ? "ip_abuse" : "ip_reuse",
      text: abusoClaro
        ? `Desde esta conexión ya se verificaron ${input.sameIpAccounts} cuentas.`
        : `Se verificaron ${input.sameIpAccounts} cuentas desde esta conexión (puede ser una red compartida, como la de un operador).`,
      score: abusoClaro ? 100 : 30,
      hard: abusoClaro,
    });
  }

  // Estas dos señales se informan siempre (así el panel y el registro reflejan
  // la realidad), pero solo bloquean si están activadas en los ajustes.
  //
  // Importante: cuando el bloqueo está DESACTIVADO su puntaje es 0 en lugar de
  // sumar al riesgo. Antes sumaban (30 la zona horaria, 25 el correo) y, al
  // combinarse con otras señales, acababan bloqueando a personas que el
  // administrador había decidido NO bloquear. El interruptor del panel debe
  // mandar: si está apagado, la señal solo se informa.
  if (input.timezoneMismatch) {
    reasons.push({
      code: "timezone_mismatch",
      text: "La zona horaria de tu navegador no coincide con la de tu conexión.",
      score: flags.blockTimezoneMismatch ? 100 : 0,
      hard: flags.blockTimezoneMismatch,
    });
  }

  if (!input.accountVerifiedEmail) {
    reasons.push({
      code: "email_unverified",
      text: "Tu cuenta de Discord no tiene el correo verificado.",
      score: flags.requireVerifiedEmail ? 100 : 0,
      hard: flags.requireVerifiedEmail,
    });
  }

  if (input.fingerprintMissing) {
    reasons.push({
      code: "no_fingerprint",
      text: "No se pudo leer la firma del dispositivo.",
      score: 15,
    });
  }

  if (input.accountAgeDays !== null && input.accountAgeDays < c.minAccountDays * 3) {
    reasons.push({
      code: "account_recent",
      text: `Cuenta con ${input.accountAgeDays} días de antigüedad.`,
      score: 10,
    });
  }

  const score = reasons.reduce((total, reason) => total + reason.score, 0);
  const hard = reasons.some((reason) => reason.hard);
  return { decision: hard || score >= c.maxRisk ? "block" : "allow", score, reasons };
}

/* ---------------------------------------------------------------- utilidades */

export function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function makeTicket(): string {
  return crypto.randomBytes(9).toString("base64url");
}

/** Toma la IP pública real del visitante detrás de proxies. */
export function clientIp(headers: Record<string, unknown>, fallback?: string): string {
  const forwarded = headers["x-forwarded-for"];
  const raw = Array.isArray(forwarded) ? forwarded[0] : (forwarded as string | undefined);
  const first = (raw ?? "").split(",")[0]?.trim();
  return first || (headers["x-real-ip"] as string) || fallback || "";
}

export function avatarUrl(user: DiscordUser): string | null {
  if (!user.avatar) return null;
  return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=128`;
}
