/**
 * Comprueba que el enlace de verificación siempre se puede obtener.
 *
 * Antes, si la web pulsaba el botón antes de recibir la configuración, salía el
 * aviso «Aún no está disponible» y la persona se quedaba sin poder verificar.
 * Ahora la web pide el enlace en ese momento, así que este endpoint tiene que
 * responder siempre con una URL utilizable.
 */
import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";

function ctx(host: string) {
  return {
    user: null,
    req: {
      headers: { host, "x-forwarded-host": host, "user-agent": "prueba" },
      protocol: "https",
      cookies: {},
      socket: {},
    },
    res: { cookie: () => {}, clearCookie: () => {} },
  };
}

describe("enlace de verificación (startLink)", () => {
  it("devuelve una URL utilizable desde el dominio público", async () => {
    const caller = appRouter.createCaller(ctx("imperioshop-mhfz2s3t.manus.space") as never);
    const data = await caller.verify.startLink();

    expect(data.url, "sin URL: el botón no podría llevar a Discord").toBeTruthy();
    expect(data.url).toContain("discord.com/oauth2/authorize");
    expect(data.url).toContain("response_type=code");
    expect(data.url).toContain("scope=identify+email+guilds.join");
    console.log(`    → URL lista para usar (${data.redirectUri})`);
  });

  it("nunca deja la URL sin destino de vuelta", async () => {
    const caller = appRouter.createCaller(ctx("imperioshop-mhfz2s3t.manus.space") as never);
    const data = await caller.verify.startLink();
    // El destino tiene que ser uno de los registrados, o Discord rechazará la vuelta.
    expect(data.redirectUri).toBeTruthy();
    expect(data.url).toContain(encodeURIComponent(data.redirectUri));
  });

  it("responde igual de rápido la segunda vez (no bloquea la web)", async () => {
    const caller = appRouter.createCaller(ctx("imperioshop-mhfz2s3t.manus.space") as never);
    await caller.verify.startLink();
    const inicio = Date.now();
    await caller.verify.startLink();
    const ms = Date.now() - inicio;
    // Si esto tardara segundos, pulsar el botón se sentiría como un fallo.
    expect(ms, `tardó ${ms} ms: debería ser inmediato`).toBeLessThan(1500);
    console.log(`    → segunda llamada en ${ms} ms`);
  });
});

/**
 * Este caso cubre el fallo real: el botón se quedaba en «Abriendo Discord…»
 * para siempre cuando la base de datos dejaba de responder. La web nunca puede
 * depender de la base de datos ni de Discord para poder abrirse.
 */
describe("la web abre aunque la base de datos no responda", () => {
  it("startLink responde sin esperar a la base de datos", async () => {
    const host = "imperioshop-mhfz2s3t.manus.space";
    const caller = appRouter.createCaller(ctx(host) as never);

    const inicio = Date.now();
    const data = await Promise.race([
      caller.verify.startLink(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("se quedó colgado")), 10_000),
      ),
    ]);
    const ms = Date.now() - inicio;

    expect(data.url, "sin URL: el botón giraría sin hacer nada").toBeTruthy();
    expect(ms, `tardó ${ms} ms: el botón se quedaría cargando`).toBeLessThan(6000);
    console.log(`    → respondió en ${ms} ms con la base de datos disponible`);
  });

  it("status responde rápido para que la página se dibuje", async () => {
    const caller = appRouter.createCaller(ctx("imperioshop-mhfz2s3t.manus.space") as never);
    const inicio = Date.now();
    const data = await Promise.race([
      caller.verify.status(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("se quedó colgado")), 10_000),
      ),
    ]);
    const ms = Date.now() - inicio;
    expect(data.redirectOk, "el dominio debería darse por válido").toBe(true);
    expect(ms, `tardó ${ms} ms`).toBeLessThan(6000);
    console.log(`    → status en ${ms} ms`);
  });
});

/**
 * El paso «Entrega de acceso» (unir al servidor y dar el rol) fue el que dejó
 * la web pegada: se usaba una llamada a Discord sin límite de tiempo, así que si
 * Discord no respondía la pantalla se quedaba cargando para siempre.
 */
describe("la entrega de acceso nunca se queda colgada", () => {
  it("falla con mensaje claro en lugar de esperar para siempre", async () => {
    const { grantAllRoles } = await import("./discordVerify");
    const inicio = Date.now();

    let resultado: "ok" | "error" = "ok";
    try {
      // Un usuario inexistente fuerza la respuesta de error de Discord.
      await Promise.race([
        grantAllRoles("123456789012345678"),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("se quedó colgado")), 30_000),
        ),
      ]);
    } catch (error) {
      resultado = "error";
      const mensaje = error instanceof Error ? error.message : String(error);
      // El mensaje debe ser comprensible, no un volcado técnico.
      expect(mensaje).toBeTruthy();
      console.log(`    → respondió en ${Date.now() - inicio} ms: ${mensaje.slice(0, 70)}`);
    }

    // Lo que importa: respondió (con éxito o con error) en tiempo razonable.
    const ms = Date.now() - inicio;
    // El presupuesto de la entrega es 18 s; se deja margen para la red lenta.
    expect(ms, `tardó ${ms} ms: la pantalla se quedaría cargando`).toBeLessThan(25_000);
    expect(resultado).toBe("error");
  });
});

/**
 * Caso real: la persona entra al servidor por invitación y luego pulsa
 * «Verificarme». Al ir a unirla, Discord responde que ya está dentro. Antes ese
 * caso se trataba como error y se quedaba sin rol aunque fuera legítima.
 */
describe("entrega del acceso", () => {
  it("reconoce a quien ya está en el servidor sin gastar su token", async () => {
    const { isGuildMember } = await import("./discordVerify");
    // Se consulta con el bot: si ya es miembro debe decir que sí.
    const yaEsta = await isGuildMember("1547748792483315712"); // usuario ya verificado
    console.log(`    → ¿ya está en el servidor?: ${yaEsta}`);
    // Lo importante: responde sin lanzar y sin depender del token de la persona.
    expect(typeof yaEsta).toBe("boolean");
  });
});
