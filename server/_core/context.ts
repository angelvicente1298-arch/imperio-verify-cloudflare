import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";

/**
 * Contexto de cada petición de la API.
 *
 * El proyecto no usa el inicio de sesión de Manus: el único acceso con
 * credenciales es el panel privado, que valida su propia cookie de sesión
 * (ver `server/panelAuth.ts`). Por eso aquí no hay usuario.
 */
export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: null;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  return {
    req: opts.req,
    res: opts.res,
    user: null,
  };
}
