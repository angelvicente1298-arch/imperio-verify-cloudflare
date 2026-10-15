import { router } from "./_core/trpc";
import { botRouter } from "./botRouter";
import { verifyRouter } from "./verifyRouter";

/**
 * API del sitio.
 *
 * Solo hay dos bloques, que son los que usa la web:
 *  · `verify`: la verificación de cuentas de Discord.
 *  · `bot`: el panel privado de administración (entra con usuario y contraseña).
 */
export const appRouter = router({
  verify: verifyRouter,
  bot: botRouter,
});

export type AppRouter = typeof appRouter;
