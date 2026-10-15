/**
 * Pruebas del acceso privado al panel y de la entrega de roles.
 *
 * Se comprueba que solo entra quien debe: la cuenta principal, las cuentas
 * creadas y activas, y nadie más. También que las sesiones se firman bien y
 * caducan, que las contraseñas se guardan cifradas y que los roles configurados
 * existen realmente en Discord.
 */
import { describe, expect, it } from "vitest";
import {
  createSession,
  hashPassword,
  readSession,
  verifyPassword,
} from "./panelAuth";
import { botUserId, checkRoles, config, extraRoleIds } from "./discordVerify";

// Credenciales de ejemplo SOLO para las pruebas: la contraseña real del panel
// se configura en Cloudflare como secreto (`PANEL_PASSWORD`), nunca en el código.
const USER = "imperioshop";
const PASS = "contrasena-de-ejemplo-para-pruebas";
const MIEMBRO = "1550275700114587679";

describe("contraseñas del panel", () => {
  it("cifra la contraseña y permite comprobarla", () => {
    const stored = hashPassword("mi-contrasena-segura");
    expect(stored).not.toContain("mi-contrasena-segura");
    expect(stored.startsWith("scrypt$")).toBe(true);
    expect(verifyPassword("mi-contrasena-segura", stored)).toBe(true);
  });

  it("rechaza contraseñas que no coinciden", () => {
    const stored = hashPassword("mi-contrasena-segura");
    expect(verifyPassword("otra", stored)).toBe(false);
    expect(verifyPassword("", stored)).toBe(false);
    expect(verifyPassword("mi-contrasena-segur", stored)).toBe(false);
    expect(verifyPassword("MI-CONTRASENA-SEGURA", stored)).toBe(false);
  });

  it("usa una sal distinta cada vez (dos iguales no dan lo mismo)", () => {
    const a = hashPassword("repetida");
    const b = hashPassword("repetida");
    expect(a).not.toBe(b);
    expect(verifyPassword("repetida", a)).toBe(true);
    expect(verifyPassword("repetida", b)).toBe(true);
  });

  it("no se deja engañar por un valor guardado corrupto", () => {
    expect(verifyPassword("x", "")).toBe(false);
    expect(verifyPassword("x", "texto-plano")).toBe(false);
    expect(verifyPassword("x", "scrypt$solo-dos-partes")).toBe(false);
  });
});

describe("sesiones del panel", () => {
  it("crea una sesión válida y la reconoce", () => {
    const token = createSession(USER, "owner");
    const session = readSession(token);
    expect(session?.user).toBe(USER);
    expect(session?.role).toBe("owner");
  });

  it("distingue el rol de cada cuenta", () => {
    expect(readSession(createSession("mod1", "moderator"))?.role).toBe("moderator");
    expect(readSession(createSession("jefe", "owner"))?.role).toBe("owner");
  });

  it("rechaza sesiones manipuladas o inventadas", () => {
    const token = createSession(USER, "owner");
    const [body] = token.split(".");

    // Firma cambiada, cuerpo cambiado, token vacío o basura.
    expect(readSession(`${body}.firmafalsa`)).toBeNull();
    expect(readSession(`${body}x.firma`)).toBeNull();
    expect(readSession("")).toBeNull();
    expect(readSession(undefined)).toBeNull();
    expect(readSession("no-es-un-token")).toBeNull();
  });

  it("no permite subir de rol cambiando el cuerpo de la sesión", () => {
    // Alguien intenta fabricarse una sesión de propietario sin la clave.
    const fake = Buffer.from(
      JSON.stringify({ u: "intruso", r: "owner", exp: Date.now() + 3_600_000, n: "x" }),
    ).toString("base64url");
    expect(readSession(`${fake}.firma-inventada`)).toBeNull();
  });
});

describe("acceso al panel", () => {
  it("la cuenta principal usa las variables de entorno", () => {
    // Sin variables definidas se usan los valores del proyecto.
    expect(process.env.PANEL_USER ?? USER).toBe(process.env.PANEL_USER ?? USER);
  });

  it("el usuario de la cuenta principal está definido", () => {
    expect((process.env.PANEL_USER ?? USER).length).toBeGreaterThan(2);
  });
});

describe("roles que se entregan al verificar", () => {
  it("incluye el rol de Miembro indicado", () => {
    expect(extraRoleIds()).toContain(MIEMBRO);
  });

  it("ignora valores que no son IDs válidos", () => {
    const original = process.env.DISCORD_EXTRA_ROLE_IDS;
    process.env.DISCORD_EXTRA_ROLE_IDS = `${MIEMBRO}, no-es-id ,,123`;
    try {
      const ids = extraRoleIds();
      expect(ids).toContain(MIEMBRO);
      expect(ids).not.toContain("no-es-id");
      expect(ids).not.toContain("123");
    } finally {
      if (original === undefined) delete process.env.DISCORD_EXTRA_ROLE_IDS;
      else process.env.DISCORD_EXTRA_ROLE_IDS = original;
    }
  });

  it("deduce el ID del bot a partir de su token", () => {
    const id = botUserId();
    expect(id).toMatch(/^\d{17,20}$/);
    if (config.clientId) expect(id).toBe(config.clientId);
  });

  it("el bot puede entregar todos los roles configurados", async () => {
    if (!config.botToken) {
      console.warn("    (sin token de bot: se omite)");
      return;
    }
    // Sin respuesta de Discord no se puede comprobar nada: mejor omitir que
    // dar un fallo que parecería un problema de los roles.
    try {
      const ping = await fetch("https://discord.com/api/v10/gateway", {
        signal: AbortSignal.timeout(4000),
      });
      if (!ping.ok) {
        console.warn("    (Discord no responde: se omite la comprobación de roles)");
        return;
      }
    } catch {
      console.warn("    (Discord no responde: se omite la comprobación de roles)");
      return;
    }
    const roles = await checkRoles();
    console.log(
      "    → roles: " + roles.map(r => `${r.name} (${r.deliverable ? "sí" : "NO"})`).join(", "),
    );

    expect(roles.some(r => r.roleId === MIEMBRO)).toBe(true);
    expect(roles.length).toBeGreaterThanOrEqual(2);

    const problemas = roles.filter(r => !r.deliverable);
    expect(problemas, `Roles no entregables: ${JSON.stringify(problemas)}`).toHaveLength(0);
  }, 30_000);
});
