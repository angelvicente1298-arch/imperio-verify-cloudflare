import { handleAsNodeRequest } from "cloudflare:node";
import cookieParser from "cookie-parser";
import express from "express";
import { createServer } from "node:http";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "../routers";
import { warmUp } from "../botAdmin";
import { setBindings } from "./env";
import { createContext } from "./context";

/**
 * Servidor del sitio: la API de la web de verificación.
 *
 * Se ejecuta dentro de Cloudflare Workers (por eso `cloudflare:node`), que es lo
 * que permite usar Express igual que en Node. Los archivos de la web ya
 * construidos los sirve Cloudflare por su cuenta desde `dist/public`, así que
 * este Worker solo se ocupa de `/api/*`.
 */

const app = express();

// Permite leer cuerpos grandes (el panel guarda ajustes y textos largos).
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// Lee las cookies: el panel privado guarda ahí su sesión.
app.use(cookieParser());

// Deja preparado el resumen del bot en segundo plano para que el panel abra
// rápido en la primera visita. No bloquea la respuesta.
let warmedUp = false;
function ensureWarmUp() {
  if (warmedUp) return;
  warmedUp = true;
  try {
    warmUp();
  } catch {
    // Si el calentamiento falla, el panel solo tarda un poco más la primera vez.
  }
}

// API
app.use(
  "/api/trpc",
  createExpressMiddleware({
    router: appRouter,
    createContext,
  })
);

// Comprobación de vida: confirma que el Worker está en pie y configurado.
app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

// Cualquier otra dirección que llegue hasta aquí no existe en la API.
app.use((_req, res) => {
  res.status(404).json({ error: "not_found" });
});

const PORT = 3000;
const server = createServer(app);
server.listen(PORT);

export default {
  fetch(request: Request, env: Record<string, unknown>, ctx: unknown) {
    // Las variables y secretos del Worker se publican antes de atender: así el
    // resto del código (base de datos, Discord…) los encuentra donde espera.
    setBindings(env);
    ensureWarmUp();
    return handleAsNodeRequest(PORT, request);
  },
};
