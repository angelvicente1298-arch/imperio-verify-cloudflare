import { defineConfig } from "vitest/config";
import path from "node:path";

/**
 * Configuración de las pruebas.
 *
 * Se ejecutan en serie (una a una) porque varias hablan con la API de Discord y
 * en paralelo se alcanzaría su límite de peticiones, lo que hacía fallar pruebas
 * que estaban bien.
 */
export default defineConfig({
  test: {
    root: path.resolve(import.meta.dirname),
    include: ["server/**/*.test.ts"],
    environment: "node",
    testTimeout: 60_000,
    hookTimeout: 60_000,
    fileParallelism: false,
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
    },
  },
});
