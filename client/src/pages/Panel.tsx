import { Link } from "wouter";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  BadgeCheck,
  Ban,
  Clock,
  Globe,
  ShieldAlert,
  ShieldCheck,
  Users,
  WifiOff,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { ASSETS } from "@/lib/content";
import { cn } from "@/lib/utils";

const STATUS_STYLE: Record<string, { label: string; className: string }> = {
  approved: { label: "Verificado", className: "border-emerald-500/35 bg-emerald-500/12 text-emerald-300" },
  blocked: { label: "Bloqueado", className: "border-red-500/35 bg-red-500/12 text-red-300" },
  error: { label: "Error", className: "border-amber-500/35 bg-amber-500/12 text-amber-300" },
  pending: { label: "Pendiente", className: "border-white/15 bg-white/[0.06] text-white/60" },
};

export default function Panel() {
  // El acceso lo comprueba el servidor con la sesión firmada del panel privado.
  const me = trpc.bot.me.useQuery(undefined, { retry: false });
  const allowed = Boolean(me.data);

  const { data, isLoading, error, refetch } = trpc.verify.panel.useQuery(undefined, {
    refetchInterval: 8000,
    enabled: allowed,
    retry: false,
  });
  const status = trpc.verify.status.useQuery(undefined, { retry: false });
  const roles = trpc.verify.roles.useQuery(undefined, { enabled: allowed, retry: false });
  const stats = data?.stats;
  const recent = data?.recent ?? [];

  // Sin sesión abierta no se muestra nada: la puerta está en el panel privado.
  if (me.isLoading) {
    return (
      <div className="grid min-h-screen place-items-center">
        <ShieldCheck className="h-6 w-6 animate-pulse text-brand" strokeWidth={2.2} />
      </div>
    );
  }
  if (!allowed) return <AccessDenied reason="no-access" />;

  return (
    <div className="min-h-screen px-5 py-10 sm:px-8">
      <div className="mx-auto w-full max-w-[1080px]">
        {/* Cabecera */}
        <header className="mb-8 flex flex-wrap items-center gap-4">
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/[0.04] px-4 py-2 text-[13px] font-medium text-white/70 transition duration-200 hover:border-brand/50 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" strokeWidth={2} />
            Volver a la verificación
          </Link>
          <div className="flex items-center gap-3">
            <img
              src={ASSETS.logoMark}
              alt=""
              className="h-10 w-10 rounded-xl border border-brand/40 bg-brand/10 p-1.5"
            />
            <div>
              <h1 className="font-display text-[19px] font-bold tracking-[-0.2px] text-white">
                Panel de verificaciones
              </h1>
              <p className="text-[12.5px] text-muted-foreground">
                Control de accesos, VPN y multicuentas
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => refetch()}
            className="ml-auto rounded-full border border-white/12 bg-white/[0.04] px-4 py-2 text-[13px] font-medium text-white/70 transition hover:border-brand/50 hover:text-white"
          >
            Actualizar
          </button>
        </header>

        {/* Estado de la integración */}
        {status.data && !status.data.configured && (
          <div className="mb-6 flex flex-wrap items-center gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-5 py-4">
            <ShieldAlert className="h-5 w-5 shrink-0 text-amber-400" strokeWidth={2} />
            <p className="text-[13px] text-amber-100/85">
              La integración con Discord está incompleta. Falta configurar:{" "}
              <span className="font-mono text-[12px]">{status.data.missing.join(", ")}</span>
            </p>
          </div>
        )}

        {/* Métricas */}
        <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            icon={<Users className="h-5 w-5" />}
            label="Intentos totales"
            value={stats?.total ?? 0}
          />
          <StatCard
            icon={<BadgeCheck className="h-5 w-5" />}
            label="Verificados"
            value={stats?.approved ?? 0}
            tone="good"
          />
          <StatCard
            icon={<Ban className="h-5 w-5" />}
            label="Bloqueados"
            value={stats?.blocked ?? 0}
            tone="bad"
          />
          <StatCard
            icon={<WifiOff className="h-5 w-5" />}
            label="VPN detectada"
            value={stats?.vpnBlocked ?? 0}
            tone="warn"
          />
        </div>

        {/* Tabla */}
        <div className="overflow-hidden rounded-3xl border border-white/10 bg-[linear-gradient(180deg,#13121c,#100f18)] shadow-[0_20px_50px_-16px_rgba(0,0,0,.8)]">

        {/* Roles que se entregan al verificar */}
        <div className="mb-6 overflow-hidden rounded-3xl border border-white/10 bg-[linear-gradient(180deg,#13121c,#100f18)]">
          <div className="flex items-center gap-2.5 border-b border-white/[0.07] px-5 py-4">
            <ShieldCheck className="h-4 w-4 text-brand-soft" strokeWidth={2} />
            <h2 className="font-display text-[14.5px] font-semibold text-white">
              Roles que se entregan al verificar
            </h2>
          </div>
          <div className="divide-y divide-white/[0.05]">
            {(roles.data ?? []).map((role) => (
              <div key={role.roleId} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                <span
                  className={cn(
                    "grid h-8 w-8 shrink-0 place-items-center rounded-lg border",
                    role.deliverable
                      ? "border-emerald-500/35 bg-emerald-500/12 text-emerald-300"
                      : "border-red-500/35 bg-red-500/12 text-red-300",
                  )}
                >
                  {role.deliverable ? (
                    <BadgeCheck className="h-4 w-4" strokeWidth={2} />
                  ) : (
                    <ShieldAlert className="h-4 w-4" strokeWidth={2} />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[13.5px] font-medium text-white">{role.name}</p>
                  <p className="font-mono text-[11.5px] text-white/35">{role.roleId}</p>
                </div>
                <span
                  className={cn(
                    "rounded-full border px-3 py-1 text-[11.5px] font-medium",
                    role.deliverable
                      ? "border-emerald-500/35 bg-emerald-500/10 text-emerald-300"
                      : "border-red-500/35 bg-red-500/10 text-red-300",
                  )}
                >
                  {role.deliverable ? "Se entregará" : "No se puede entregar"}
                </span>
                {!role.deliverable && role.reason && (
                  <p className="w-full text-[12px] text-red-200/70">{role.reason}</p>
                )}
              </div>
            ))}
            {roles.isLoading && (
              <p className="px-5 py-6 text-center text-[13px] text-white/40">Comprobando roles…</p>
            )}
            {roles.error && (
              <p className="px-5 py-6 text-center text-[13px] text-red-300/80">
                No se pudieron comprobar los roles: {roles.error.message}
              </p>
            )}
          </div>
        </div>

          <div className="flex items-center gap-2.5 border-b border-white/[0.07] px-5 py-4">
            <Clock className="h-4 w-4 text-brand-soft" strokeWidth={2} />
            <h2 className="font-display text-[14.5px] font-semibold text-white">
              Últimos intentos
            </h2>
            <span className="ml-auto text-[12px] text-white/35">
              {stats?.last24h ?? 0} en las últimas 24 h
            </span>
          </div>

          {isLoading ? (
            <p className="px-5 py-12 text-center text-[13.5px] text-white/40">Cargando registros…</p>
          ) : error ? (
            <p className="px-5 py-12 text-center text-[13.5px] text-red-300/80">
              No se pudieron cargar los registros: {error.message}
            </p>
          ) : recent.length === 0 ? (
            <div className="px-5 py-14 text-center">
              <ShieldCheck className="mx-auto h-8 w-8 text-white/20" strokeWidth={1.6} />
              <p className="mt-3 text-[13.5px] text-white/45">
                Todavía no hay verificaciones registradas.
              </p>
              <p className="mt-1 text-[12px] text-white/30">
                Cuando alguien use el botón de verificar, aparecerá aquí.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-white/[0.05]">
              {recent.map((row) => {
                const style = STATUS_STYLE[row.status] ?? STATUS_STYLE.pending;
                const reasons: { text: string }[] = row.reasons ? JSON.parse(row.reasons) : [];
                return (
                  <li key={row.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                    {row.avatar ? (
                      <img src={row.avatar} alt="" className="h-9 w-9 rounded-full border border-white/12" />
                    ) : (
                      <span className="grid h-9 w-9 place-items-center rounded-full bg-white/[0.06] text-[11px] font-bold text-white/50">
                        {(row.username ?? "??").slice(0, 2).toUpperCase()}
                      </span>
                    )}

                    <div className="min-w-[150px] flex-1">
                      <p className="font-display text-[13.5px] font-semibold text-white">
                        {row.globalName || row.username || "Cuenta desconocida"}
                      </p>
                      <p className="font-mono text-[11px] text-white/30">
                        {row.discordId ?? "—"} · {new Date(row.createdAt).toLocaleString("es-ES")}
                      </p>
                    </div>

                    <span className="hidden items-center gap-1.5 text-[11.5px] text-white/40 sm:flex">
                      <Globe className="h-3.5 w-3.5" strokeWidth={1.9} />
                      {row.ipCountry ?? "—"}
                      {row.ipIsp ? ` · ${row.ipIsp.slice(0, 22)}` : ""}
                    </span>

                    {row.vpnDetected && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-red-500/35 bg-red-500/12 px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-wide text-red-300">
                        <WifiOff className="h-3 w-3" strokeWidth={2.4} />
                        VPN
                      </span>
                    )}

                    <span className="font-mono text-[11.5px] text-white/40">
                      riesgo {row.riskScore}
                    </span>

                    <span
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-wide",
                        style.className,
                      )}
                    >
                      {row.roleGranted && <BadgeCheck className="h-3 w-3" strokeWidth={2.4} />}
                      {style.label}
                    </span>

                    {reasons.length > 0 && (
                      <p className="w-full pl-12 text-[11.5px] leading-relaxed text-white/30">
                        {reasons.map((r) => r.text).join(" · ")}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <p className="mt-5 text-center text-[11.5px] text-white/25">
          Se muestran los últimos 25 intentos. La tabla se actualiza sola cada 8 segundos.
        </p>
      </div>
    </div>
  );
}

/** Pantalla que se muestra si no hay credenciales válidas para el panel. */
function AccessDenied({ reason }: { reason: "no-access" | "expired" }) {
  return (
    <div className="grid min-h-screen place-items-center px-5">
      <div className="w-full max-w-[420px] overflow-hidden rounded-3xl border border-white/10 bg-[linear-gradient(180deg,#13121c,#100f18)] text-center shadow-[0_24px_60px_-18px_rgba(0,0,0,.85)]">
        <span className="block h-[2.5px] w-full bg-gradient-to-r from-brand to-brand-2 shadow-[0_0_12px_#ff0042]" />
        <div className="px-7 py-9">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl border border-brand/40 bg-brand/12 text-brand">
            <ShieldAlert className="h-6 w-6" strokeWidth={2} />
          </span>
          <h1 className="mt-4 font-display text-[18px] font-bold text-white">
            {reason === "expired" ? "Sesión caducada" : "Acceso restringido"}
          </h1>
          <p className="mx-auto mt-2 max-w-[300px] text-[13px] leading-relaxed text-white/45">
            {reason === "expired"
              ? "Por seguridad, el acceso al panel caducó. Vuelve a introducir tus datos."
              : "El panel de control solo se abre desde la web de verificación, con usuario y contraseña."}
          </p>
          <Link
            href="/"
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-brand px-5 py-2.5 text-[13.5px] font-semibold text-white shadow-[0_6px_20px_rgba(255,0,66,.28)] transition duration-200 hover:bg-brand-2 active:scale-[.97]"
          >
            <ArrowLeft className="h-4 w-4" strokeWidth={2.4} />
            Volver a la verificación
          </Link>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  tone = "neutral",
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone?: "neutral" | "good" | "bad" | "warn";
}) {
  const tones: Record<string, string> = {
    neutral: "text-brand-soft border-white/10 bg-white/[0.03]",
    good: "text-emerald-400 border-emerald-500/25 bg-emerald-500/[0.07]",
    bad: "text-red-400 border-red-500/25 bg-red-500/[0.07]",
    warn: "text-amber-400 border-amber-500/25 bg-amber-500/[0.07]",
  };
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-4">
      <div className="flex items-center gap-2.5">
        <span className={cn("grid h-9 w-9 place-items-center rounded-xl border", tones[tone])}>
          {icon}
        </span>
        <span className="text-[12.5px] text-muted-foreground">{label}</span>
      </div>
      <p className="mt-3 font-display text-[28px] font-extrabold leading-none tracking-[-0.8px] text-white">
        {value}
      </p>
    </div>
  );
}
