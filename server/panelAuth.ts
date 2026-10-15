/**
 * Acceso privado al panel de administración.
 *
 * El panel no es público: solo entra quien tenga una cuenta creada. Hay dos
 * tipos de cuenta:
 *
 * 1. La **cuenta principal**, definida en las variables de entorno
 *    (`PANEL_USER` y `PANEL_PASSWORD`). Siempre funciona y no se puede borrar,
 *    para no quedarse fuera del panel.
 * 2. Las **cuentas creadas desde el panel**, una por persona, con su propio
 *    usuario y contraseña. Se pueden desactivar o borrar en cualquier momento.
 *
 * Las contraseñas se guardan cifradas con scrypt y una sal distinta por cuenta.
 * Al entrar se emite una sesión firmada que caduca sola, así que aunque alguien
 * copie la cookie, deja de servir al cabo de unas horas. Todo intento de
 * entrada (acertado o no) queda registrado con la IP.
 */
import crypto from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { panelAccounts, panelLogins } from "../drizzle/schema";
import { getDb } from "./db";

/** Cuánto dura una sesión desde que se inicia. */
const SESSION_HOURS = 12;

/** Nombre de la cookie que guarda la sesión. */
export const PANEL_COOKIE = "imperio_panel";

/* ------------------------------------------------------------- contraseñas */

/**
 * Cifra una contraseña con scrypt y una sal aleatoria.
 * El resultado incluye la sal, así que no hace falta guardarla aparte.
 */
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

/** Comprueba una contraseña contra el valor guardado, en tiempo constante. */
export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const [, salt, expected] = parts;
  try {
    const actual = crypto.scryptSync(password, salt, 64).toString("hex");
    return crypto.timingSafeEqual(Buffer.from(actual, "hex"), Buffer.from(expected, "hex"));
  } catch {
    return false;
  }
}

/* ---------------------------------------------------------------- sesiones */

type SessionPayload = {
  /** Nombre de usuario de quien entró. */
  u: string;
  /** Rol: «owner» o «moderator». */
  r: "owner" | "moderator";
  /** Cuándo caduca (milisegundos). */
  exp: number;
  /** Identificador aleatorio, para que dos sesiones nunca sean iguales. */
  n: string;
};

/** Secreto para firmar las sesiones. */
function secret(): string {
  return process.env.JWT_SECRET || process.env.PANEL_SESSION_SECRET || "imperio-shop-panel";
}

/** Firma base64url de un texto. */
function sign(data: string): string {
  return crypto.createHmac("sha256", secret()).update(data).digest("base64url");
}

/** Crea una sesión firmada para el usuario indicado. */
export function createSession(user: string, role: "owner" | "moderator"): string {
  const payload: SessionPayload = {
    u: user,
    r: role,
    exp: Date.now() + SESSION_HOURS * 3_600_000,
    n: crypto.randomBytes(12).toString("hex"),
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(body)}`;
}

/**
 * Comprueba una sesión y devuelve quién es. Devuelve `null` si la firma no
 * cuadra o si ya ha caducado.
 */
export function readSession(token: string | undefined): { user: string; role: "owner" | "moderator" } | null {
  if (!token) return null;
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;

  // Comparación en tiempo constante para no filtrar información.
  const expected = sign(body);
  if (
    expected.length !== signature.length ||
    !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
  ) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as SessionPayload;
    if (!payload.u || payload.exp < Date.now()) return null;
    return { user: payload.u, role: payload.r === "owner" ? "owner" : "moderator" };
  } catch {
    return null;
  }
}

/** Opciones de la cookie de sesión. */
export function sessionCookieOptions(): {
  httpOnly: boolean;
  sameSite: "lax";
  secure: boolean;
  path: string;
  maxAge: number;
} {
  return {
    httpOnly: true,
    sameSite: "lax",
    // En local se sirve por http, así que «secure» se activa solo en producción.
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_HOURS * 3_600_000,
  };
}

/* ------------------------------------------------------------- credenciales */

/**
 * Cuenta principal: la del propietario.
 *
 * Se configura como secreto en Cloudflare (`PANEL_USER` y `PANEL_PASSWORD`) y
 * nunca se escribe en el código: así la contraseña no acaba en el repositorio ni
 * en el historial de git. Si no está configurada, la cuenta principal queda
 * deshabilitada (solo se podría entrar con las cuentas creadas desde el panel).
 */
function ownerCredentials(): { user: string; password: string } {
  return {
    user: process.env.PANEL_USER?.trim() ?? "",
    password: process.env.PANEL_PASSWORD ?? "",
  };
}

export type AccessCheck = {
  ok: boolean;
  user?: string;
  role?: "owner" | "moderator";
  /** Motivo del rechazo, para la pantalla y el registro. */
  reason?: string;
};

/**
 * Comprueba unas credenciales. Primero la cuenta principal, y después las
 * cuentas creadas desde el panel.
 */
export async function checkAccess(username?: string, password?: string): Promise<AccessCheck> {
  if (!username || !password) return { ok: false, reason: "Faltan el usuario y la contraseña." };

  const user = username.trim();
  const owner = ownerCredentials();

  // 1) Cuenta principal (comparación en tiempo constante).
  // Solo se prueba si está configurada: si faltan las variables, esta vía queda
  // cerrada en lugar de aceptar un usuario o contraseña vacíos.
  if (owner.user && owner.password && sameText(user, owner.user)) {
    if (!sameText(password, owner.password)) return { ok: false, reason: "Contraseña incorrecta." };
    return { ok: true, user: owner.user, role: "owner" };
  }

  // 2) Cuentas creadas desde el panel.
  const db = await getDb();
  if (!db) return { ok: false, reason: "La base de datos no está disponible." };

  const rows = await db
    .select()
    .from(panelAccounts)
    .where(sql`lower(${panelAccounts.username}) = lower(${user})`)
    .limit(1);

  const account = rows[0];
  if (!account) return { ok: false, reason: "Ese usuario no existe." };
  if (!account.active) return { ok: false, reason: "Ese acceso está desactivado." };
  if (!verifyPassword(password, account.passwordHash)) {
    return { ok: false, reason: "Contraseña incorrecta." };
  }

  await db
    .update(panelAccounts)
    .set({ lastLoginAt: new Date(), loginCount: sql`${panelAccounts.loginCount} + 1` })
    .where(eq(panelAccounts.id, account.id));

  return { ok: true, user: account.username, role: account.role };
}

/** Compara dos textos sin filtrar información por el tiempo que tarda. */
function sameText(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/* -------------------------------------------------------------- registro */

/** Anota un intento de entrada al panel. */
export async function logLogin(data: {
  username: string;
  ok: boolean;
  ip?: string;
  userAgent?: string;
  reason?: string;
}): Promise<void> {
  const db = await getDb();
  if (!db) return;
  try {
    await db.insert(panelLogins).values({
      username: data.username.slice(0, 64),
      ok: data.ok,
      ip: data.ip?.slice(0, 64) ?? null,
      userAgent: data.userAgent?.slice(0, 250) ?? null,
      reason: data.reason?.slice(0, 160) ?? null,
    });
  } catch (error) {
    console.warn("[Panel] No se pudo registrar el intento de entrada:", error);
  }
}

/** Últimos intentos de entrada, para revisarlos en el panel. */
export async function recentLogins(limit = 25): Promise<PanelLoginRow[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      id: panelLogins.id,
      username: panelLogins.username,
      ok: panelLogins.ok,
      ip: panelLogins.ip,
      reason: panelLogins.reason,
      createdAt: panelLogins.createdAt,
    })
    .from(panelLogins)
    .orderBy(sql`${panelLogins.createdAt} desc`)
    .limit(limit);
}

type PanelLoginRow = {
  id: number;
  username: string;
  ok: boolean;
  ip: string | null;
  reason: string | null;
  createdAt: Date;
};

/* --------------------------------------------------------------- cuentas */

/** Lista de cuentas del panel (sin las contraseñas). */
export async function listAccounts() {
  const db = await getDb();
  const owner = ownerCredentials().user;

  // La cuenta principal no está en la base de datos (vive en las variables de
  // entorno), pero se muestra igualmente para que la lista esté completa y se
  // vea que no se puede borrar.
  const ownerRow = {
    id: 0,
    username: owner,
    label: "Cuenta principal",
    role: "owner" as const,
    active: true,
    createdBy: null as string | null,
    lastLoginAt: null as Date | null,
    loginCount: 0,
    createdAt: new Date(0),
    isOwner: true,
  };

  if (!db) return [ownerRow];

  const rows = await db.select().from(panelAccounts).orderBy(panelAccounts.createdAt);
  return [
    ownerRow,
    ...rows.map((row) => ({
      id: row.id,
      username: row.username,
      label: row.label,
      role: row.role,
      active: row.active,
      createdBy: row.createdBy,
      lastLoginAt: row.lastLoginAt,
      loginCount: row.loginCount,
      createdAt: row.createdAt,
      /** Marca para que el panel sepa cuál no se puede borrar. */
      isOwner: false,
    })),
  ];
}

/** Crea una cuenta nueva con acceso al panel. */
export async function createAccount(data: {
  username: string;
  password: string;
  label?: string;
  role: "owner" | "moderator";
  createdBy: string;
}): Promise<{ ok: true; id: number }> {
  const db = await getDb();
  if (!db) throw new Error("La base de datos no está disponible.");

  const username = data.username.trim();
  if (username.length < 3) throw new Error("El usuario debe tener al menos 3 caracteres.");
  if (data.password.length < 8) throw new Error("La contraseña debe tener al menos 8 caracteres.");
  if (sameText(username.toLowerCase(), ownerCredentials().user.toLowerCase())) {
    throw new Error("Ese nombre de usuario ya está en uso por la cuenta principal.");
  }

  const existing = await db
    .select({ id: panelAccounts.id })
    .from(panelAccounts)
    .where(sql`lower(${panelAccounts.username}) = lower(${username})`)
    .limit(1);
  if (existing.length > 0) throw new Error("Ya existe una cuenta con ese usuario.");

  const inserted = await db
    .insert(panelAccounts)
    .values({
      username,
      passwordHash: hashPassword(data.password),
      label: data.label?.slice(0, 96) ?? null,
      role: data.role,
      createdBy: data.createdBy,
    })
    .$returningId();

  return { ok: true, id: inserted[0]?.id ?? 0 };
}

/** Activa o desactiva una cuenta, o le cambia la contraseña. */
export async function updateAccount(data: {
  id: number;
  active?: boolean;
  password?: string;
  label?: string;
  role?: "owner" | "moderator";
}): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("La base de datos no está disponible.");

  const patch: Record<string, unknown> = {};
  if (data.active !== undefined) patch.active = data.active;
  if (data.label !== undefined) patch.label = data.label.slice(0, 96);
  if (data.role !== undefined) patch.role = data.role;
  if (data.password !== undefined) {
    if (data.password.length < 8) throw new Error("La contraseña debe tener al menos 8 caracteres.");
    patch.passwordHash = hashPassword(data.password);
  }
  if (Object.keys(patch).length === 0) return;

  await db.update(panelAccounts).set(patch).where(eq(panelAccounts.id, data.id));
}

/** Borra una cuenta del panel. La cuenta principal no se puede borrar. */
export async function deleteAccount(id: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("La base de datos no está disponible.");

  const rows = await db.select().from(panelAccounts).where(eq(panelAccounts.id, id)).limit(1);
  const account = rows[0];
  if (!account) return;
  if (account.username === ownerCredentials().user) {
    throw new Error("La cuenta principal no se puede borrar.");
  }
  await db.delete(panelAccounts).where(eq(panelAccounts.id, id));
}
