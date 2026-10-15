import { and, desc, eq, gte, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  verifications,
  verificationEvents,
  type InsertVerification,
  type Verification,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

/**
 * Tiempo máximo que se espera a la base de datos antes de seguir sin ella.
 *
 * Sin este límite, si la base de datos deja de responder (conexión cortada,
 * servidor saturado) cada consulta se queda esperando indefinidamente. Como las
 * peticiones de la web se atienden en cadena, una consulta colgada deja colgada
 * toda la web: el botón se queda en «Abriendo Discord…» para siempre. Con este
 * límite, la verificación sigue con los valores por defecto y la web responde.
 */
export const DB_TIMEOUT_MS = 4_000;

/**
 * Ejecuta una consulta con límite de tiempo.
 *
 * Se usa en las lecturas que hace la web (estado, ajustes y bloqueos): si la
 * base de datos tarda más de la cuenta, se sigue adelante con el valor de
 * respaldo en lugar de dejar la página esperando.
 */
export async function withDbTimeout<T>(work: Promise<T>, fallback: T, what: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<T>((resolve) => {
        timer = setTimeout(() => {
          console.warn(
            `[Database] «${what}» tardó más de ${DB_TIMEOUT_MS} ms; se sigue sin esperar.`,
          );
          resolve(fallback);
        }, DB_TIMEOUT_MS);
      }),
    ]);
  } catch {
    return fallback;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Crea (una sola vez) la conexión a la base de datos.
 *
 * En Cloudflare la conexión se toma de Hyperdrive (`env.HYPERDRIVE`), que se
 * encarga del agrupamiento de conexiones y del caché. Hyperdrive entrega los
 * mismos datos que una URL de conexión, así que Drizzle recibe el objeto con
 * host, usuario, contraseña, base de datos y puerto.
 *
 * Si Hyperdrive no está disponible se cae de vuelta a `DATABASE_URL`, para que
 * el proyecto siga funcionando en local (`pnpm dev`) sin configurar nada.
 */
function connectionOptions() {
  const hyperdrive = ENV.hyperdrive;
  if (hyperdrive?.host && hyperdrive?.user) {
    return {
      host: hyperdrive.host,
      user: hyperdrive.user,
      password: hyperdrive.password,
      database: hyperdrive.database,
      port: Number(hyperdrive.port ?? 3306),
      // Necesario para que el controlador funcione dentro de Workers.
      disableEval: true,
    };
  }
  return ENV.databaseUrl || null;
}

// Se crea a petición: la web puede arrancar aunque la base de datos no esté.
export async function getDb() {
  if (!_db) {
    const options = connectionOptions();
    if (options) {
      try {
        _db = drizzle({ connection: options });
      } catch (error) {
        console.warn("[Database] Failed to connect:", error);
        _db = null;
      }
    }
  }
  return _db;
}

/* --------------------------------------------------------- verificaciones */

export async function createVerification(data: InsertVerification): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Base de datos no disponible");
  const result = await db.insert(verifications).values(data);
  return Number(result[0].insertId);
}

export async function updateVerification(
  id: number,
  data: Partial<InsertVerification>,
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(verifications).set(data).where(eq(verifications.id, id));
}

export async function getVerificationByTicket(ticket: string): Promise<Verification | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db
    .select()
    .from(verifications)
    .where(eq(verifications.ticket, ticket))
    .limit(1);
  return rows[0];
}

/**
 * Cuántas cuentas distintas ya pasaron por esta IP o este dispositivo en la
 * ventana indicada (30 días por defecto). Sirve para frenar multicuentas.
 */
export async function countRelatedApprovals(
  field: "ip" | "fingerprint",
  value: string,
  sinceDays = 30,
): Promise<number> {
  const db = await getDb();
  if (!db || !value) return 0;

  const since = new Date(Date.now() - sinceDays * 86_400_000);
  const column = field === "ip" ? verifications.ip : verifications.fingerprint;

  const rows = await db
    .select({ total: sql<number>`count(distinct ${verifications.discordId})` })
    .from(verifications)
    .where(
      and(
        eq(column, value),
        eq(verifications.status, "approved"),
        gte(verifications.createdAt, since),
      ),
    );

  return Number(rows[0]?.total ?? 0);
}

export async function addVerificationEvent(
  verificationId: number | null,
  discordId: string | null,
  type: string,
  message: string,
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(verificationEvents).values({ verificationId, discordId, type, message });
}

/** Resumen para el panel de control. */
export async function verificationStats() {
  const db = await getDb();
  if (!db) return { total: 0, approved: 0, blocked: 0, vpnBlocked: 0, last24h: 0 };

  const rows = await db
    .select({
      total: sql<number>`count(*)`,
      approved: sql<number>`sum(case when ${verifications.status} = 'approved' then 1 else 0 end)`,
      blocked: sql<number>`sum(case when ${verifications.status} = 'blocked' then 1 else 0 end)`,
      vpnBlocked: sql<number>`sum(case when ${verifications.vpnDetected} = true then 1 else 0 end)`,
    })
    .from(verifications);

  const recent = await db
    .select({ total: sql<number>`count(*)` })
    .from(verifications)
    .where(gte(verifications.createdAt, new Date(Date.now() - 86_400_000)));

  const row = rows[0];
  return {
    total: Number(row?.total ?? 0),
    approved: Number(row?.approved ?? 0),
    blocked: Number(row?.blocked ?? 0),
    vpnBlocked: Number(row?.vpnBlocked ?? 0),
    last24h: Number(recent[0]?.total ?? 0),
  };
}

export async function recentVerifications(limit = 25) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      id: verifications.id,
      ticket: verifications.ticket,
      discordId: verifications.discordId,
      username: verifications.username,
      globalName: verifications.globalName,
      avatar: verifications.avatar,
      status: verifications.status,
      riskScore: verifications.riskScore,
      ipCountry: verifications.ipCountry,
      ipIsp: verifications.ipIsp,
      vpnDetected: verifications.vpnDetected,
      roleGranted: verifications.roleGranted,
      reasons: verifications.reasons,
      createdAt: verifications.createdAt,
    })
    .from(verifications)
    .orderBy(desc(verifications.createdAt))
    .limit(limit);
}
