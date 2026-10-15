/**
 * Recursos de marca del proyecto Imperio Shop.
 *
 * Las imágenes viven en `client/public/assets`, así que se sirven desde este
 * mismo sitio (`/assets/...`). Antes se pedían a un almacenamiento externo de
 * Manus (`/manus-storage/...`), que aquí no existiría: en Cloudflare cada
 * archivo tiene que estar dentro del propio proyecto.
 */
export const ASSETS = {
  logo: "/assets/logo.png",
  logoMark: "/assets/logo-mark.png",
  logoWatermark: "/assets/logo-patern.png",
  banner: "/assets/banner.png",
  favicon: "/assets/favicon-32.png",
  ogImage: "/assets/og-image.png",
};

export const BRAND = {
  name: "Imperio Shop",
  tagline: "Verificación de cuentas de Discord",
};

/** Pasos que se muestran en el panel de progreso. */
export const SCAN_STEPS = [
  { id: "handshake", label: "Conectando con Discord", detail: "Enlace seguro con el Developer Portal" },
  { id: "identity", label: "Leyendo datos de la cuenta", detail: "ID, antigüedad y correo" },
  { id: "network", label: "Modelo de red", detail: "Detección de VPN, proxy y centro de datos" },
  { id: "risk", label: "Antifraude y multicuentas", detail: "Historial por IP y dispositivo" },
  { id: "access", label: "Entrega de acceso", detail: "Unir al servidor y asignar el rol" },
] as const;

export type ScanStepId = (typeof SCAN_STEPS)[number]["id"];
