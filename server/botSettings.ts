/**
 * Ajustes del bot editables desde el panel de administración.
 *
 * Los ajustes se guardan en la base de datos, pero la verificación necesita
 * leerlos en cada intento: para no golpear la base de datos en cada visita se
 * guardan en memoria durante unos segundos. Al guardar desde el panel la copia
 * se refresca al instante, así que el cambio se aplica de inmediato.
 *
 * Si un ajuste no está en la base de datos se usa su valor por defecto, que
 * viene de las variables de entorno. Así el bot funciona igual aunque la base
 * de datos esté vacía.
 */
import { eq } from "drizzle-orm";
import { botSettings } from "../drizzle/schema";
import { getDb, withDbTimeout } from "./db";
import { config as envConfig } from "./discordVerify";

/** Cada cuánto se vuelve a leer de la base de datos (por si hay varios servidores). */
const CACHE_MS = 15_000;

export type SettingsShape = {
  /** Antigüedad mínima de la cuenta de Discord, en días. */
  minAccountDays: number;
  /** Cuentas distintas permitidas por conexión (IP). */
  maxAccountsPerIp: number;
  /** Cuentas distintas permitidas por dispositivo. */
  maxAccountsPerDevice: number;
  /** Puntaje de riesgo a partir del cual se bloquea. */
  maxRisk: number;
  /** Bloquear si se detecta VPN, proxy o Tor. */
  blockVpn: boolean;
  /** Bloquear si la conexión viene de un centro de datos. */
  blockDatacenter: boolean;
  /** Bloquear si la zona horaria no coincide con la de la conexión. */
  blockTimezoneMismatch: boolean;
  /** Exigir que el correo de Discord esté verificado. */
  requireVerifiedEmail: boolean;
  /** Pausar por completo la verificación (modo mantenimiento). */
  verificationPaused: boolean;
  /** Mensaje que se muestra cuando la verificación está pausada. */
  pausedMessage: string;
  /** Avisar al canal de registros cuando alguien es bloqueado. */
  notifyOnBlock: boolean;
  /** Canal de Discord donde se avisa (ID). */
  logChannelId: string;
  /** Publicar un aviso en el canal cuando alguien se verifica. */
  notifyOnApproval: boolean;
  /** Enviar un mensaje privado al usuario cuando recibe los roles. */
  dmOnApproval: boolean;
  /** Texto del mensaje privado. */
  dmMessage: string;
  /** Roles que se entregan al verificar (IDs separados por comas). */
  extraRoleIds: string;
};

/** Valor por defecto de cada ajuste (el que tenía el bot antes del panel). */
export function defaultSettings(): SettingsShape {
  return {
    minAccountDays: envConfig.minAccountDays,
    maxAccountsPerIp: envConfig.maxAccountsPerIp,
    maxAccountsPerDevice: envConfig.maxAccountsPerDevice,
    maxRisk: envConfig.maxRisk,
    blockVpn: true,
    blockDatacenter: true,
    blockTimezoneMismatch: false,
    requireVerifiedEmail: false,
    verificationPaused: false,
    pausedMessage:
      "La verificación está en mantenimiento. Vuelve a intentarlo en unos minutos.",
    notifyOnBlock: false,
    logChannelId: "",
    notifyOnApproval: false,
    dmOnApproval: false,
    dmMessage:
      "¡Ya estás verificado en **Imperio Shop**! Se te han entregado tus roles y tienes acceso a todos los canales.",
    extraRoleIds: process.env.DISCORD_EXTRA_ROLE_IDS ?? "1550275700114587679",
  };
}

type Cache = { at: number; values: SettingsShape };
let cache: Cache | null = null;

/** Convierte el texto guardado al tipo del ajuste, con red de seguridad. */
function parse(key: keyof SettingsShape, raw: string | null | undefined): unknown {
  const fallback = defaultSettings()[key];
  if (raw === null || raw === undefined || raw === "") return fallback;
  switch (typeof fallback) {
    case "number": {
      const n = Number(raw);
      // Un valor no numérico nunca debe desactivar un control de seguridad.
      return Number.isFinite(n) ? n : fallback;
    }
    case "boolean":
      return raw === "true" || raw === "1";
    default:
      return raw;
  }
}

/**
 * Ajustes actuales. Se leen de la base de datos como mucho una vez cada 15 s.
 * Si la base de datos falla, se devuelven los valores por defecto para que la
 * verificación siga funcionando.
 */
export async function getSettings(force = false): Promise<SettingsShape> {
  const now = Date.now();
  if (!force && cache && now - cache.at < CACHE_MS) return cache.values;

  const values = defaultSettings();
  const db = await getDb();
  if (db) {
    try {
      // Con límite de tiempo: si la base de datos no responde, la verificación
      // sigue con los valores por defecto en vez de dejar la web colgada.
      const rows = await withDbTimeout(db.select().from(botSettings), [], "leer ajustes");
      for (const row of rows) {
        if (row.key in values) {
          const parsed = parse(row.key as keyof SettingsShape, row.value);
          // El valor por defecto marca el tipo; se asigna respetándolo.
          (values as Record<string, unknown>)[row.key] = parsed;
        }
      }
    } catch (error) {
      console.warn("[Ajustes] No se pudieron leer; se usan los valores por defecto:", error);
    }
  }

  cache = { at: now, values };
  return values;
}

/** Guarda un conjunto de ajustes y refresca la copia en memoria al instante. */
export async function saveSettings(
  patch: Partial<SettingsShape>,
): Promise<{ saved: string[]; settings: SettingsShape }> {
  const db = await getDb();
  if (!db) throw new Error("La base de datos no está disponible.");

  const saved: string[] = [];
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    if (!(key in defaultSettings())) continue;
    const text = typeof value === "boolean" ? String(value) : String(value);
    await db
      .insert(botSettings)
      .values({ key, value: text })
      .onDuplicateKeyUpdate({ set: { value: text } });
    saved.push(key);
  }

  // Refresca la copia para que el cambio surta efecto en la siguiente visita.
  cache = null;
  const settings = await getSettings(true);
  return { saved, settings };
}

/** Cuentas bloqueadas o aprobadas a mano, indexadas por ID de Discord. */
export async function getManualEntries(): Promise<Map<string, "block" | "allow">> {
  const map = new Map<string, "block" | "allow">();
  const db = await getDb();
  if (!db) return map;
  try {
    const rows = await withDbTimeout(db.select().from(botBlocksTable), [], "leer bloqueos");
    for (const row of rows) map.set(row.discordId, row.kind);
  } catch (error) {
    console.warn("[Bloqueos] No se pudieron leer:", error);
  }
  return map;
}

// Se importa aparte para no crear un ciclo con db.ts.
import { botBlocks as botBlocksTable } from "../drizzle/schema";

/** Invalida la copia en memoria (por ejemplo, tras restaurar ajustes). */
export function invalidateSettings(): void {
  cache = null;
}

/**
 * Ajustes internos que el propio sistema recuerda (no los edita nadie a mano).
 *
 * Hoy se usa para guardar el servidor y el rol de verificado ya resueltos: si
 * Discord no responde en ese momento, el bot sigue funcionando con lo último
 * que averiguó en lugar de quedarse a ciegas.
 */
export async function getInternal(key: string): Promise<string | null> {
  const db = await getDb();
  if (!db) return null;
  try {
    // Con límite de tiempo: esta lectura se hace al abrir la web, así que no
    // puede quedarse esperando a una base de datos que no contesta.
    const rows = await withDbTimeout(
      db.select().from(botSettings).where(eq(botSettings.key, key)).limit(1),
      [],
      `leer «${key}»`,
    );
    return rows[0]?.value ?? null;
  } catch {
    return null;
  }
}

/** Guarda un ajuste interno (no aparece en el panel). */
export async function setInternal(key: string, value: string): Promise<void> {
  // La base de datos puede cortar la conexión de forma puntual (ECONNRESET).
  // Se reintenta un par de veces: perder este dato significaría volver a
  // consultar Discord en cada visita, que es justo lo que se quiere evitar.
  for (let intento = 0; intento < 3; intento++) {
    const db = await getDb();
    if (!db) return;
    try {
      await db
        .insert(botSettings)
        .values({ key, value })
        .onDuplicateKeyUpdate({ set: { value } });
      return;
    } catch (error) {
      if (intento === 2) {
        console.warn(`[Ajustes] No se pudo guardar «${key}»:`, error);
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 300 * (intento + 1)));
    }
  }
}

/** Fila de la base de datos tal cual (para mostrarla en el panel). */
export async function rawSettings(): Promise<{ key: string; value: string | null; updatedAt: Date }[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({ key: botSettings.key, value: botSettings.value, updatedAt: botSettings.updatedAt })
    .from(botSettings)
    .orderBy(botSettings.key);
}
