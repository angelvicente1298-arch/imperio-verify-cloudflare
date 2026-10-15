/**
 * Firma ligera del dispositivo (sin librerías externas y sin datos personales).
 * Combina señales estables del navegador para detectar multicuentas desde el
 * mismo equipo. Se envía al servidor, que la guarda solo como hash.
 */
export async function deviceFingerprint(): Promise<string> {
  const parts: string[] = [
    String(navigator.hardwareConcurrency ?? 0),
    String(navigator.maxTouchPoints ?? 0),
    String(screen.width),
    String(screen.height),
    String(screen.colorDepth),
    String(window.devicePixelRatio ?? 1),
    Intl.DateTimeFormat().resolvedOptions().timeZone ?? "",
    navigator.language ?? "",
    (navigator.languages ?? []).join(","),
    String(new Date().getTimezoneOffset()),
  ];

  try {
    const canvas = document.createElement("canvas");
    canvas.width = 260;
    canvas.height = 60;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.textBaseline = "top";
      ctx.font = "16px Arial";
      ctx.fillStyle = "#ff0042";
      ctx.fillRect(0, 0, 260, 60);
      ctx.fillStyle = "#0b0b12";
      ctx.fillText("imperio-shop-verificacion", 6, 8);
      ctx.fillStyle = "rgba(255,123,0,.7)";
      ctx.fillText("seguridad", 10, 30);
      parts.push(canvas.toDataURL().slice(-120));
    }
  } catch {
    parts.push("no-canvas");
  }

  try {
    const gl = document.createElement("canvas").getContext("webgl");
    if (gl) {
      const info = gl.getExtension("WEBGL_debug_renderer_info");
      if (info) parts.push(String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)));
    }
  } catch {
    /* opcional */
  }

  parts.push(String(navigator.webdriver ?? false));

  const raw = parts.join("|");
  const buffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function currentTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? "";
  } catch {
    return "";
  }
}

export function truncateAgent(value: string, max = 250): string {
  return value.length > max ? value.slice(0, max) : value;
}