import { initTRPC } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";

/**
 * Base de la API.
 *
 * Todas las rutas son públicas a propósito: la web de verificación la usa
 * cualquiera, y el panel privado comprueba su propia contraseña dentro de cada
 * operación (ver `panelAuth.ts`). Así no hay dos sistemas de sesión distintos.
 */
const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;
