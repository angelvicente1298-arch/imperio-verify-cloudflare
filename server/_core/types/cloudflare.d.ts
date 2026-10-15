/**
 * Tipos de los módulos especiales de Cloudflare Workers.
 *
 * Los proporciona el propio entorno de ejecución, no un paquete de npm, así que
 * se declaran aquí para que el editor y `tsc` los reconozcan.
 */
declare module "cloudflare:node" {
  /** Envía una petición del Worker al servidor de Node que escucha en `port`. */
  export function handleAsNodeRequest(port: number, request: Request): Promise<Response>;
  /** Integra un servidor de Node con el modelo de peticiones de Workers. */
  export function httpServerHandler(options: {
    port: number;
    fetch?: (request: Request, env: unknown, ctx: unknown) => unknown;
  }): { fetch: (request: Request, env: unknown, ctx: unknown) => unknown };
}

declare module "cloudflare:workers" {
  export const env: Record<string, unknown>;
}
