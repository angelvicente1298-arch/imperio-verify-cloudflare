/**
 * Piezas de interfaz del panel de administración del bot.
 *
 * Son componentes pequeños y reutilizables (tarjetas, interruptores, campos y
 * botones) para que todas las secciones del panel se vean igual y no haya que
 * repetir estilos en cada una.
 */
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/* --------------------------------------------------------------- tarjetas */

export function Card({
  title,
  subtitle,
  icon,
  action,
  children,
  className,
}: {
  title?: string;
  subtitle?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "overflow-hidden rounded-3xl border border-white/10 bg-[linear-gradient(180deg,#13121c,#100f18)] shadow-[0_20px_50px_-20px_rgba(0,0,0,.85)]",
        className,
      )}
    >
      {title && (
        <header className="flex flex-wrap items-center gap-2.5 border-b border-white/[0.07] px-5 py-4">
          {icon && <span className="text-brand-soft">{icon}</span>}
          <div className="min-w-0">
            <h2 className="font-display text-[14.5px] font-semibold text-white">{title}</h2>
            {subtitle && <p className="mt-0.5 text-[12px] text-white/40">{subtitle}</p>}
          </div>
          {action && <div className="ml-auto">{action}</div>}
        </header>
      )}
      <div className="px-5 py-4">{children}</div>
    </section>
  );
}

/** Número grande con su etiqueta, para los resúmenes. */
export function Stat({
  label,
  value,
  hint,
  tone = "neutral",
  icon,
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: "neutral" | "good" | "bad" | "warn";
  icon?: React.ReactNode;
}) {
  const tones: Record<string, string> = {
    neutral: "text-brand-soft",
    good: "text-emerald-400",
    bad: "text-red-400",
    warn: "text-amber-400",
  };
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3.5">
      <div className="flex items-center gap-2">
        {icon && <span className={tones[tone]}>{icon}</span>}
        <p className="text-[11.5px] font-medium tracking-wide text-white/45 uppercase">{label}</p>
      </div>
      <p className="mt-1.5 font-display text-[24px] leading-none font-bold text-white">{value}</p>
      {hint && <p className="mt-1 text-[11.5px] text-white/35">{hint}</p>}
    </div>
  );
}

/* ----------------------------------------------------------- formularios */

/** Interruptor de encendido/apagado, con su explicación. */
export function Toggle({
  checked,
  onChange,
  label,
  hint,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left transition duration-200",
        checked
          ? "border-brand/40 bg-brand/[0.08]"
          : "border-white/10 bg-white/[0.02] hover:border-white/20",
        disabled && "cursor-not-allowed opacity-50",
      )}
    >
      <span
        className={cn(
          "relative h-5 w-9 shrink-0 rounded-full transition duration-200",
          checked ? "bg-brand" : "bg-white/15",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all duration-200",
            checked ? "left-[18px]" : "left-0.5",
          )}
        />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13.5px] font-medium text-white">{label}</span>
        {hint && <span className="mt-0.5 block text-[11.5px] leading-relaxed text-white/40">{hint}</span>}
      </span>
    </button>
  );
}

/** Campo numérico o de texto con etiqueta y explicación. */
export function Field({
  label,
  hint,
  value,
  onChange,
  type = "number",
  min,
  max,
  placeholder,
  suffix,
}: {
  label: string;
  hint?: string;
  value: string | number;
  onChange: (v: string) => void;
  type?: "number" | "text";
  min?: number;
  max?: number;
  placeholder?: string;
  suffix?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[12px] font-medium text-white/60">{label}</span>
      <span className="relative block">
        <input
          type={type}
          value={value}
          min={min}
          max={max}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-xl border border-white/12 bg-black/35 px-3 py-2.5 text-[13.5px] text-white placeholder:text-white/25 focus:border-brand/60 focus:ring-2 focus:ring-brand/20 focus:outline-none"
        />
        {suffix && (
          <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-[12px] text-white/35">
            {suffix}
          </span>
        )}
      </span>
      {hint && <span className="mt-1 block text-[11.5px] leading-relaxed text-white/35">{hint}</span>}
    </label>
  );
}

/** Botón con los estilos del sitio. */
export function Button({
  children,
  onClick,
  variant = "primary",
  size = "md",
  loading,
  disabled,
  type = "button",
  className,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: "primary" | "ghost" | "danger" | "soft";
  size?: "sm" | "md";
  loading?: boolean;
  disabled?: boolean;
  type?: "button" | "submit";
  className?: string;
}) {
  const variants: Record<string, string> = {
    primary:
      "bg-brand text-white shadow-[0_6px_20px_rgba(255,0,66,.28)] hover:bg-brand-2 hover:shadow-[0_8px_26px_rgba(255,0,66,.4)]",
    soft: "border border-white/12 bg-white/[0.05] text-white/80 hover:border-white/25 hover:text-white",
    ghost: "text-white/60 hover:text-white",
    danger:
      "border border-red-500/35 bg-red-500/12 text-red-200 hover:border-red-500/60 hover:bg-red-500/20",
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition duration-200 active:scale-[.97] disabled:cursor-not-allowed disabled:opacity-55",
        size === "sm" ? "px-3.5 py-2 text-[12.5px]" : "px-4 py-2.5 text-[13.5px]",
        variants[variant],
        className,
      )}
    >
      {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2.4} />}
      {children}
    </button>
  );
}

/** Etiqueta de estado (verde/rojo/ámbar). */
export function Badge({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "good" | "bad" | "warn";
}) {
  const tones: Record<string, string> = {
    neutral: "border-white/12 bg-white/[0.05] text-white/60",
    good: "border-emerald-500/35 bg-emerald-500/10 text-emerald-300",
    bad: "border-red-500/35 bg-red-500/10 text-red-300",
    warn: "border-amber-500/35 bg-amber-500/10 text-amber-300",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold",
        tones[tone],
      )}
    >
      {children}
    </span>
  );
}

/** Aviso dentro del panel. */
export function Notice({
  children,
  tone = "info",
}: {
  children: React.ReactNode;
  tone?: "info" | "good" | "bad" | "warn";
}) {
  const tones: Record<string, string> = {
    info: "border-white/12 bg-white/[0.04] text-white/65",
    good: "border-emerald-500/30 bg-emerald-500/10 text-emerald-100/90",
    bad: "border-red-500/30 bg-red-500/10 text-red-100/90",
    warn: "border-amber-500/30 bg-amber-500/10 text-amber-100/90",
  };
  return (
    <p className={cn("rounded-2xl border px-4 py-3 text-[12.5px] leading-relaxed", tones[tone])}>
      {children}
    </p>
  );
}

/** Lista vacía con su explicación. */
export function Empty({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="px-5 py-10 text-center">
      <p className="text-[13.5px] text-white/45">{title}</p>
      {hint && <p className="mt-1 text-[12px] text-white/30">{hint}</p>}
    </div>
  );
}

/** Formatea una fecha en la zona horaria del visitante. */
export function when(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Cuánto tiempo ha pasado desde una fecha, en palabras. */
export function ago(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "hace un momento";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `hace ${days} d`;
  const months = Math.floor(days / 30);
  return `hace ${months} mes${months === 1 ? "" : "es"}`;
}

/** Fecha de creación a partir del identificador de Discord (copo de nieve). */
export function snowflakeDate(id: string | null | undefined): string | null {
  if (!id || !/^\d{17,20}$/.test(id)) return null;
  try {
    const ms = Number(BigInt(id) >> BigInt(22)) + 1420070400000;
    return new Date(ms).toISOString();
  } catch {
    return null;
  }
}
