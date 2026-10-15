/**
 * Variables de entorno del servidor.
 *
 * En Cloudflare los valores llegan por los *bindings* del Worker, así que se
 * publican aquí una sola vez y el resto del código los lee de este archivo. En
 * local se leen del archivo `.dev.vars` (Wrangler lo carga solo).
 *
 * Las claves sensibles (token del bot, contraseña de la base de datos, etc.) NO
 * van en el código: se configuran como secretos en Cloudflare
 * (`wrangler secret put`) o en `.dev.vars` para las pruebas locales.
 */

type HyperdriveBinding = {
  host?: string;
  user?: string;
  password?: string;
  database?: string;
  port?: number | string;
};

type Bindings = {
  HYPERDRIVE?: HyperdriveBinding;
  DATABASE_URL?: string;
  JWT_SECRET?: string;
  DISCORD_CLIENT_ID?: string;
  DISCORD_CLIENT_SECRET?: string;
  DISCORD_BOT_TOKEN?: string;
  DISCORD_GUILD_ID?: string;
  DISCORD_VERIFIED_ROLE_ID?: string;
  DISCORD_REDIRECT_URI?: string;
  DISCORD_ALLOWED_DOMAINS?: string;
  DISCORD_EXTRA_ROLE_IDS?: string;
  PANEL_USER?: string;
  PANEL_PASSWORD?: string;
  PANEL_SESSION_SECRET?: string;
  IPQUALITYSCORE_API_KEY?: string;
  VERIFY_MIN_ACCOUNT_DAYS?: string;
  VERIFY_MAX_ACCOUNTS_PER_IP?: string;
  VERIFY_MAX_ACCOUNTS_PER_DEVICE?: string;
  VERIFY_MAX_RISK?: string;
};

let bindings: Bindings = {};

/** El Worker llama a esto al arrancar para publicar sus bindings. */
export function setBindings(next: Bindings | undefined): void {
  bindings = next ?? {};
}

/** Valor de una variable: primero el binding de Cloudflare, luego el entorno. */
function read(name: keyof Bindings): string {
  const value = bindings[name];
  if (typeof value === "string" && value) return value;
  return (typeof process !== "undefined" ? process.env?.[name as string] : undefined) ?? "";
}

export const ENV = {
  get databaseUrl() {
    return read("DATABASE_URL");
  },
  get hyperdrive() {
    return bindings.HYPERDRIVE;
  },
  get cookieSecret() {
    return read("JWT_SECRET");
  },
  get isProduction() {
    return typeof process !== "undefined" && process.env?.NODE_ENV === "production";
  },
};
