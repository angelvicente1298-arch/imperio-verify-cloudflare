import { describe, expect, it } from "vitest";
import {
  config,
  daysBetween,
  evaluateRisk,
  hostOf,
  isPrivateIp,
  makeTicket,
  redirectStatus,
  sha256,
  signState,
  snowflakeToDate,
  verifyState,
  type IpInfo,
} from "./discordVerify";

const cleanIp: IpInfo = {
  ok: true,
  country: "Chile",
  countryCode: "CL",
  city: "Santiago",
  isp: "Movistar",
  timezone: "America/Santiago",
  proxy: false,
  hosting: false,
  mobile: false,
  privateIp: false,
  source: "ip-api",
};

const baseInput = {
  accountAgeDays: 900,
  accountVerifiedEmail: true,
  ip: cleanIp,
  timezoneMismatch: false,
  sameIpAccounts: 0,
  sameFingerprintAccounts: 0,
  fingerprintMissing: false,
};

describe("evaluateRisk", () => {
  it("aprueba una cuenta sana de red limpia", () => {
    const result = evaluateRisk(baseInput);
    expect(result.decision).toBe("allow");
    expect(result.reasons).toHaveLength(0);
  });

  it("exige 5 días de antigüedad: 4 días se bloquea, 5 días se permite", () => {
    expect(config.minAccountDays).toBe(5);

    // 4 días: cuenta nueva → bloqueada.
    const cuatro = evaluateRisk({ ...baseInput, accountAgeDays: 4 });
    expect(cuatro.decision).toBe("block");
    expect(cuatro.reasons.some(r => r.code === "account_too_new" && r.hard)).toBe(true);
    expect(cuatro.reasons.find(r => r.code === "account_too_new")?.text).toContain("4 días");

    // 5 días exactos: ya cumple el mínimo (el resto de señales está limpio).
    const cinco = evaluateRisk({ ...baseInput, accountAgeDays: 5 });
    expect(cinco.decision).toBe("allow");
    expect(cinco.reasons.some(r => r.code === "account_too_new")).toBe(false);
  });

  it("marca como reciente una cuenta con menos del triple del mínimo", () => {
    // El umbral es 5 días, así que el aviso blando salta por debajo de 15.
    const result = evaluateRisk({ ...baseInput, accountAgeDays: 10 });
    expect(result.decision).toBe("allow");
    expect(result.reasons.some(r => r.code === "account_recent")).toBe(true);
  });

  it("bloquea siempre una conexión con VPN o proxy", () => {
    const result = evaluateRisk({ ...baseInput, ip: { ...cleanIp, proxy: true } });
    expect(result.decision).toBe("block");
    expect(result.reasons.some(r => r.code === "vpn_proxy" && r.hard)).toBe(true);
  });

  it("bloquea una conexión desde centro de datos", () => {
    const result = evaluateRisk({ ...baseInput, ip: { ...cleanIp, hosting: true } });
    expect(result.decision).toBe("block");
    expect(result.reasons.some(r => r.code === "datacenter")).toBe(true);
  });

  it("bloquea cuentas demasiado nuevas (multicuenta típica)", () => {
    const result = evaluateRisk({ ...baseInput, accountAgeDays: 3 });
    expect(result.decision).toBe("block");
    expect(result.reasons.some(r => r.code === "account_too_new" && r.hard)).toBe(true);
  });

  it("bloquea cuando el mismo dispositivo ya verificó otra cuenta", () => {
    const result = evaluateRisk({ ...baseInput, sameFingerprintAccounts: 2 });
    expect(result.decision).toBe("block");
    expect(result.reasons.some(r => r.code === "device_reuse")).toBe(true);
  });

  it("bloquea cuando la misma conexión acumula MUCHAS cuentas (abuso claro)", () => {
    // Muchas cuentas desde una misma conexión sí es abuso: 2 × 3 = 6 o más.
    const result = evaluateRisk({ ...baseInput, sameIpAccounts: 6 });
    expect(result.decision).toBe("block");
    expect(result.reasons.some(r => r.code === "ip_abuse" && r.hard)).toBe(true);
  });

  it("NO bloquea a la tercera persona de una red compartida (CGNAT)", () => {
    // Los operadores usan CGNAT: mucha gente comparte la misma IP pública (muy
    // habitual en Venezuela). Antes la tercera persona se quedaba sin rol aunque
    // fuera una cuenta real; ahora solo se informa como señal moderada.
    const result = evaluateRisk({ ...baseInput, sameIpAccounts: 3 });
    expect(result.decision).toBe("allow");
    expect(result.reasons.some(r => r.code === "ip_reuse")).toBe(true);
    expect(result.reasons.find(r => r.code === "ip_reuse")?.hard).toBeFalsy();
  });

  it("no bloquea por señales débiles aisladas, pero las reporta", () => {
    const result = evaluateRisk({ ...baseInput, accountVerifiedEmail: false });
    expect(result.decision).toBe("allow");
    // Con el bloqueo desactivado la señal se informa sin sumar riesgo: antes
    // sumaba 25 y, junto a otras señales, bloqueaba a quien no debía.
    expect(result.score).toBe(0);
    expect(result.reasons[0]?.code).toBe("email_unverified");
  });

  it("no bloquea por la suma de señales cuyo bloqueo está desactivado", () => {
    const result = evaluateRisk({
      ...baseInput,
      accountVerifiedEmail: false,
      timezoneMismatch: true,
      accountAgeDays: 40,
    });
    expect(result.decision).toBe("allow");
  });
});

describe("snowflakeToDate", () => {
  it("extrae la fecha de creación de la cuenta desde el ID", () => {
    const date = snowflakeToDate("710569093779865650");
    expect(date).toBeInstanceOf(Date);
    expect(date!.getUTCFullYear()).toBe(2020);
    expect(daysBetween(date!) > 1000).toBe(true);
  });

  it("devuelve null con un ID inválido", () => {
    expect(snowflakeToDate("no-es-un-id")).toBeNull();
  });
});

describe("isPrivateIp", () => {
  it("reconoce rangos privados y locales", () => {
    expect(isPrivateIp("127.0.0.1")).toBe(true);
    expect(isPrivateIp("10.1.2.3")).toBe(true);
    expect(isPrivateIp("192.168.1.20")).toBe(true);
    expect(isPrivateIp("172.16.5.9")).toBe(true);
    expect(isPrivateIp("::ffff:10.0.0.4")).toBe(true);
  });

  it("no confunde IP públicas", () => {
    expect(isPrivateIp("190.160.10.5")).toBe(false);
    expect(isPrivateIp("8.8.8.8")).toBe(false);
  });
});

describe("state de OAuth", () => {
  it("acepta un state recién emitido", () => {
    expect(verifyState(signState())).toBe(true);
  });

  it("rechaza states viejos o manipulados", () => {
    expect(verifyState(undefined)).toBe(false);
    expect(verifyState("basura")).toBe(false);
    expect(verifyState(signState(), -1)).toBe(false);
  });
});

describe("utilidades", () => {
  it("genera tickets y hashes estables", () => {
    const a = makeTicket();
    const b = makeTicket();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThan(8);
    expect(sha256("hola")).toBe(sha256("hola"));
    expect(sha256("hola")).not.toBe(sha256("hola2"));
  });
});

describe("URL de retorno (redirect)", () => {
  it("extrae el dominio sin barra final", () => {
    expect(hostOf("https://imperioshop-mhfz2s3t.manus.space")).toBe(
      "imperioshop-mhfz2s3t.manus.space",
    );
    // Con y sin barra final dan el mismo dominio: por eso se comparan dominios
    // y no cadenas exactas, que es lo que hacía fallar la vuelta desde Discord.
    expect(hostOf("https://imperioshop-mhfz2s3t.manus.space/")).toBe(
      hostOf("https://imperioshop-mhfz2s3t.manus.space"),
    );
    expect(hostOf("no-es-una-url")).toBe("");
  });

  it("la URL que se envía a Discord es una de las registradas", async () => {
    const status = await redirectStatus("https://ejemplo-cualquiera.test");
    if (status.registered.length === 0 || status.unknown) {
      console.warn(
        "    (Discord no responde o no hay URLs leídas: se omite la comprobación)",
      );
      return;
    }
    // Lo importante: nunca se inventa una URL, siempre sale de la lista oficial.
    expect(status.registered).toContain(status.used);
    console.log(`    → URLs registradas: ${status.registered.join(", ")}`);
    console.log(`    → URL usada: ${status.used} (coincide: ${status.ok})`);
  });

  it("informa qué URL falta registrar cuando el dominio no coincide", async () => {
    const status = await redirectStatus("https://dominio-no-registrado-xyz.test");
    if (status.registered.length === 0 || status.unknown) return;
    // Si el dominio pedido no está, se usa uno registrado (nunca se falla).
    expect(status.used).toBeTruthy();
    expect(status.suggested).toBe("https://dominio-no-registrado-xyz.test");
  });

  it("la URL de retorno es siempre https y de un dominio real", async () => {
    const status = await redirectStatus("https://otro-dominio.test");
    // Pase lo que pase (incluso sin conexión con Discord) nunca se devuelve algo
    // vacío ni el dominio de desarrollo: Discord rechazaría la vuelta.
    expect(status.used.startsWith("https://")).toBe(true);
    expect(status.used).not.toContain("localhost");
  });

  it("no da el dominio por no registrado solo porque Discord no responda", async () => {
    // Se simula que Discord no contesta, que es justo lo que hacía aparecer el
    // aviso falso de «falta registrar este dominio» en la web.
    const original = globalThis.fetch;
    globalThis.fetch = (async () => {
      throw new Error("red caída");
    }) as unknown as typeof fetch;
    try {
      const status = await redirectStatus("https://imperioshop-mhfz2s3t.manus.space");
      // Sin respuesta no se puede afirmar que falte registrar nada.
      expect(status.ok).toBe(true);
      expect(status.used.startsWith("https://")).toBe(true);
    } finally {
      globalThis.fetch = original;
    }
  });
});
