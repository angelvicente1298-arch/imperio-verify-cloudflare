import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  Check,
  Copy,
  Fingerprint,
  Loader2,
  Lock,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
  Wifi,
  WifiOff,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { ASSETS, SCAN_STEPS } from "@/lib/content";
import { currentTimezone, deviceFingerprint, truncateAgent } from "@/lib/fingerprint";
import PanelAccess from "@/components/PanelAccess";
import { cn } from "@/lib/utils";

type Reason = { code: string; text: string; score: number; hard?: boolean };

type VerifyResult = {
  ticket: string;
  status: "approved" | "blocked";
  riskScore: number;
  reasons: Reason[];
  account: {
    id: string;
    username: string;
    globalName: string | null;
    avatar: string | null;
    createdAt: string | null;
    ageDays: number | null;
  };
  network: {
    vpn: boolean;
    hosting: boolean;
  };
  guildJoined: boolean;
  roleGranted: boolean;
};

export default function Verify() {
  const [fingerprint, setFingerprint] = useState("");
  const [fpReady, setFpReady] = useState(false);
  const [timezone, setTimezone] = useState("");
  const [stepIndex, setStepIndex] = useState(-1);
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Se pone en verdadero mientras se pide el enlace de Discord al pulsar. */
  const [starting, setStarting] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);

  /**
   * El panel es privado, así que no se anuncia en la web. Se entra de dos
   * formas: escribiendo /panel en la barra de direcciones, o pulsando tres
   * veces seguidas el nombre «Imperio Shop» del pie.
   */
  const secretClicks = useRef(0);
  const handleLogoSecret = () => {
    secretClicks.current += 1;
    window.setTimeout(() => {
      secretClicks.current = 0;
    }, 1200);
    if (secretClicks.current >= 3) {
      secretClicks.current = 0;
      setPanelOpen(true);
    }
  };
  const timers = useRef<number[]>([]);

  const status = trpc.verify.status.useQuery(undefined, { retry: false });
  const start = trpc.verify.startLink.useQuery(undefined, { retry: false, staleTime: 0 });
  const utils = trpc.useUtils();

  useEffect(() => {
    deviceFingerprint()
      .then((value) => {
        setFingerprint(value);
      })
      .catch(() => {
        setFingerprint("");
      })
      .finally(() => setFpReady(true));
    setTimezone(currentTimezone());
    return () => timers.current.forEach((id) => window.clearTimeout(id));
  }, []);

  // Avance visual del panel de pasos mientras se completa la verificación.
  const advance = () => {
    timers.current.forEach((id) => window.clearTimeout(id));
    SCAN_STEPS.forEach((_, index) => {
      timers.current.push(
        window.setTimeout(() => setStepIndex(index), index * 700),
      );
    });
  };

  const complete = trpc.verify.complete.useMutation({
    onSuccess: (data) => {
      SCAN_STEPS.forEach(() => undefined);
      setStepIndex(SCAN_STEPS.length);
      setResult(data as VerifyResult);
      if (data.status === "approved") {
        toast.success("Verificación completada", {
          description: data.roleGranted
            ? "Ya tienes el rol de verificado en Discord."
            : "Acceso aprobado.",
        });
      } else {
        toast.error("Verificación rechazada", {
          description: "Revisa los motivos que aparecen abajo.",
        });
      }
    },
    onError: (err) => {
      // No se reintenta solo desde aquí: el código de Discord solo sirve una vez,
      // así que un segundo intento con el mismo código fallaría. El servidor ya
      // reintenta la entrega internamente; si aun así falla, se pide volver a
      // pulsar el botón (con permiso nuevo).
      timers.current.forEach((id) => window.clearTimeout(id));
      setStepIndex(-1);
      setError(err.message);
      toast.error("No se pudo completar la verificación", { description: err.message });
    },
  });

  // Cuando Discord devuelve el código, se procesa automáticamente.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const state = params.get("state") ?? undefined;
    // Espera a tener la firma del dispositivo para que el análisis antifraude
    // cuente con todas las señales, y evita procesar el mismo código dos veces.
    if (!code || !fpReady || complete.isPending || result) return;
    const key = `verify-code-${code}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");
    advance();

    // Red de seguridad: si la comprobación tarda demasiado (Discord lento o sin
    // responder), se avisa y se deja de mostrar la barra girando sin fin. El
    // trabajo puede terminar igualmente, así que se invita a recargar.
    const aviso = window.setTimeout(() => {
      // Se detiene la animación de pasos para que quede claro que ya no se está
      // comprobando nada y que hay que recargar.
      timers.current.forEach((id) => window.clearTimeout(id));
      timers.current = [];
      setStepIndex(-1);
      setError(
        "La comprobación está tardando más de lo normal. Discord puede estar lento. " +
          "Recarga la página en unos segundos: si ya te dieron el rol, aparecerá como verificado.",
      );
      toast.error("Está tardando demasiado", {
        description: "Recarga la página en unos segundos.",
      });
    }, 45_000);
    timers.current.push(aviso);

    complete.mutate({
      code,
      state,
      timezone: currentTimezone(),
      fingerprint: fingerprint || undefined,
      userAgent: truncateAgent(navigator.userAgent),
    });
    // Limpia la barra de direcciones para que el enlace no se pueda reutilizar.
    window.history.replaceState({}, "", window.location.pathname);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fingerprint, fpReady]);

  const errorParam = useMemo(
    () => new URLSearchParams(window.location.search).get("error"),
    [],
  );

  /**
   * Lleva a Discord para autorizar.
   *
   * Si el enlace todavía no se ha recibido (la primera visita tarda un momento
   * en tener la configuración lista), no se avisa con un error: se pide el
   * enlace en ese momento y se continúa sola. Antes, pulsar el botón demasiado
   * pronto mostraba «Aún no está disponible», que parecía un fallo de la web.
   */
  const handleStart = async () => {
    if (starting) return;
    let url = start.data?.url ?? null;

    if (!url) {
      setStarting(true);
      try {
        // Con límite de tiempo: si el servidor no responde, se avisa y se puede
        // volver a intentar en vez de dejar el botón girando para siempre.
        const data = await Promise.race([
          utils.verify.startLink.fetch(),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("timeout")), 12_000),
          ),
        ]);
        url = data.url;
      } catch {
        url = null;
      } finally {
        setStarting(false);
      }
    }

    if (!url) {
      toast.error("No se pudo conectar con Discord", {
        description: "Revisa tu conexión y vuelve a pulsar el botón en unos segundos.",
      });
      return;
    }

    advance();
    window.location.href = url;
  };

  const copyTicket = async (ticket: string) => {
    try {
      await navigator.clipboard.writeText(ticket);
      toast.success("Código copiado", { description: ticket });
    } catch {
      toast.error("No se pudo copiar", { description: ticket });
    }
  };

  const missing = status.data?.missing ?? [];
  const loading = complete.isPending || (stepIndex >= 0 && stepIndex < SCAN_STEPS.length && !result);

  return (
    <div className="relative min-h-screen overflow-hidden px-5 py-10 sm:py-14">
      {/* Fondo ambiental */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <span className="absolute -left-24 -top-32 h-[420px] w-[420px] rounded-full bg-[radial-gradient(circle,rgba(255,0,66,.45),transparent_65%)] opacity-60 blur-[80px] motion-safe:animate-[float_12s_ease-in-out_infinite]" />
        <span className="absolute -bottom-36 -right-20 h-[380px] w-[380px] rounded-full bg-[radial-gradient(circle,rgba(255,123,0,.32),transparent_65%)] opacity-60 blur-[80px] motion-safe:animate-[float_15s_ease-in-out_infinite_reverse]" />
        <img
          src={ASSETS.logoWatermark}
          alt=""
          className="absolute left-1/2 top-1/2 w-[680px] max-w-[88vw] -translate-x-1/2 -translate-y-1/2 opacity-20 blur-[2px]"
        />
      </div>

      <div className="relative mx-auto w-full max-w-[560px]">
        {/* Marca */}
        <div className="mb-7 flex flex-col items-center text-center">
          <img
            src={ASSETS.logoMark}
            alt="Imperio Shop"
            className="h-[72px] w-[72px] rounded-2xl border border-brand/45 bg-brand/10 p-2.5 shadow-[0_0_28px_rgba(255,0,66,.45)] motion-safe:animate-[glow_2.8s_ease-in-out_infinite]"
          />
          <h1 className="mt-4 font-display text-[26px] font-extrabold tracking-[-0.4px] text-white">
            Verifica tu cuenta de Discord
          </h1>
          <p className="mt-2 max-w-[420px] text-[14px] leading-relaxed text-muted-foreground">
            Un solo clic para confirmar que eres una persona real. Comprobamos la antigüedad de tu
            cuenta, tu conexión y tu dispositivo para bloquear multicuentas, VPN y fraude.
          </p>
        </div>

        {/* Aviso de configuración pendiente */}
        {status.data && !status.data.configured && (
          <div className="mb-5 rounded-2xl border border-amber-500/35 bg-amber-500/10 px-4.5 py-4">
            <p className="flex items-center gap-2 font-display text-[13.5px] font-semibold text-amber-200">
              <AlertTriangle className="h-4 w-4" strokeWidth={2} />
              Falta conectar tu aplicación de Discord
            </p>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-amber-100/70">
              Sin estas credenciales el botón no puede funcionar. Se configuran una sola vez:
            </p>
            <ul className="mt-2 grid gap-1">
              {missing.map((key) => (
                <li key={key} className="font-mono text-[11.5px] text-amber-100/80">
                  • {key}
                </li>
              ))}
            </ul>
            <a
              href="https://discord.com/developers/applications"
              target="_blank"
              rel="noopener"
              className="mt-3 inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-amber-200 underline decoration-amber-200/40 underline-offset-4 hover:decoration-amber-200"
            >
              Abrir Discord Developer Portal
              <ArrowRight className="h-3.5 w-3.5" />
            </a>
          </div>
        )}

        {/* Aviso: Discord no respondió. No es culpa del dominio, así que se dice
            tal cual en lugar de pedir que se registre algo que ya lo está. */}
        {status.data?.configured && status.data.redirectUnknown === true && (
          <div className="mb-5 rounded-2xl border border-sky-500/30 bg-sky-500/10 px-4.5 py-4">
            <p className="flex items-center gap-2 font-display text-[13.5px] font-semibold text-sky-200">
              <AlertTriangle className="h-4 w-4" strokeWidth={2} />
              Discord no responde en este momento
            </p>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-sky-100/70">
              No se ha podido comprobar la lista de direcciones permitidas porque Discord no
              contesta. La verificación usará igualmente{" "}
              <strong className="text-sky-100">{status.data.redirectUsed}</strong>. Suele
              solucionarse solo en unos minutos.
            </p>
          </div>
        )}

        {/* Aviso: la URL de retorno no está registrada en Discord */}
        {status.data?.configured &&
          status.data.redirectOk === false &&
          status.data.redirectUnknown !== true && (
          <div className="mb-5 rounded-2xl border border-amber-500/35 bg-amber-500/10 px-4.5 py-4">
            <p className="flex items-center gap-2 font-display text-[13.5px] font-semibold text-amber-200">
              <AlertTriangle className="h-4 w-4" strokeWidth={2} />
              Falta registrar este dominio en Discord
            </p>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-amber-100/70">
              Discord rechaza la vuelta si la dirección exacta no está en la lista permitida. Añade
              esta URL en <strong>OAuth2 → Redirects</strong> y guarda:
            </p>
            <code className="mt-2.5 block overflow-x-auto rounded-lg border border-amber-500/25 bg-black/30 px-3 py-2 font-mono text-[11.5px] text-amber-100">
              {status.data.redirectSuggested}
            </code>
            {status.data.redirectRegistered.length > 0 && (
              <p className="mt-2 text-[11.5px] text-amber-100/50">
                Registradas ahora: {status.data.redirectRegistered.join(" · ")}
              </p>
            )}
            <a
              href="https://discord.com/developers/applications"
              target="_blank"
              rel="noopener"
              className="mt-3 inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-amber-200 underline decoration-amber-200/40 underline-offset-4 hover:decoration-amber-200"
            >
              Abrir Discord Developer Portal
              <ArrowRight className="h-3.5 w-3.5" />
            </a>
          </div>
        )}

        {/* Tarjeta principal */}
        <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-[linear-gradient(180deg,#14131d_0%,#12111a_100%)] shadow-[0_24px_60px_-12px_rgba(0,0,0,.8)]">
          <span className="absolute inset-x-0 top-0 h-[3px] bg-brand-gradient shadow-[0_0_12px_#ff0042]" />

          <div className="px-6 py-7 sm:px-8">
            {/* Resultado */}
            {result ? (
              <ResultCard result={result} onCopy={() => copyTicket(result.ticket)} />
            ) : (
              <>
                {/* Panel de análisis */}
                <div className="mb-6 grid gap-2">
                  {SCAN_STEPS.map((step, index) => {
                    const done = stepIndex > index || Boolean(result);
                    const active = loading && stepIndex === index;
                    return (
                      <div
                        key={step.id}
                        className={cn(
                          "flex items-center gap-3 rounded-xl border px-3.5 py-3 transition-all duration-300",
                          done
                            ? "border-emerald-500/30 bg-emerald-500/[0.07]"
                            : active
                              ? "border-brand/45 bg-[linear-gradient(90deg,rgba(255,0,66,.14),rgba(255,123,0,.05))]"
                              : "border-white/[0.07] bg-white/[0.02]",
                        )}
                      >
                        <span
                          className={cn(
                            "grid h-7 w-7 shrink-0 place-items-center rounded-full border transition-all duration-300",
                            done
                              ? "border-transparent bg-emerald-500"
                              : active
                                ? "border-transparent bg-brand-gradient"
                                : "border-white/15 bg-white/[0.04]",
                          )}
                        >
                          {done ? (
                            <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} />
                          ) : active ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin text-white" strokeWidth={2.6} />
                          ) : (
                            <span className="h-1.5 w-1.5 rounded-full bg-white/30" />
                          )}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span
                            className={cn(
                              "block text-[13.5px] font-medium",
                              done || active ? "text-white" : "text-white/45",
                            )}
                          >
                            {step.label}
                          </span>
                          <span className="block text-[11.5px] text-white/35">{step.detail}</span>
                        </span>
                      </div>
                    );
                  })}
                </div>

                {errorParam === "access_denied" && (
                  <p className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-[12.5px] text-amber-100/80">
                    Cancelaste la autorización en Discord. Pulsa el botón para intentarlo de nuevo.
                  </p>
                )}

                {error && (
                  <div className="mb-4 rounded-xl border border-red-500/35 bg-red-500/10 px-4 py-3.5">
                    <div className="flex items-start gap-2.5">
                      <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-red-400" strokeWidth={2} />
                      <p className="text-[12.5px] leading-relaxed text-red-100/85">{error}</p>
                    </div>
                    {/* Nunca dejar a la persona sin salida: puede reintentar. */}
                    <button
                      type="button"
                      onClick={() => {
                        setError(null);
                        setResult(null);
                        setStepIndex(-1);
                        window.location.reload();
                      }}
                      className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-red-400/40 bg-red-500/15 px-3 py-1.5 text-[12px] font-semibold text-red-100 transition-colors duration-150 ease-out hover:bg-red-500/25"
                    >
                      <RefreshCw className="h-3.5 w-3.5" strokeWidth={2.2} />
                      Reintentar
                    </button>
                  </div>
                )}

                {/* Botón de verificación */}
                <button
                  type="button"
                  onClick={handleStart}
                  disabled={loading || starting || status.data?.configured === false}
                  className={cn(
                    "group flex w-full items-center justify-center gap-3 rounded-2xl px-6 py-4 font-display text-[15.5px] font-semibold text-white transition-all duration-200 ease-out",
                    "bg-[#5865f2] shadow-[0_10px_26px_rgba(88,101,242,.35)] hover:bg-[#4752c4] hover:shadow-[0_14px_32px_rgba(88,101,242,.5)] active:scale-[.98]",
                    (loading || starting || status.data?.configured === false) &&
                      "cursor-not-allowed opacity-60 hover:translate-y-0",
                  )}
                >
                  {loading || starting ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin" strokeWidth={2.2} />
                      {loading ? "Verificando tu cuenta…" : "Abriendo Discord…"}
                    </>
                  ) : (
                    <>
                      <DiscordMark className="h-5 w-5" />
                      Verificarme con Discord
                      <ArrowRight className="h-4.5 w-4.5 transition-transform duration-200 group-hover:translate-x-0.5" strokeWidth={2.2} />
                    </>
                  )}
                </button>

                <p className="mt-3 text-center text-[11.5px] leading-relaxed text-white/35">
                  Autorizas a Imperio Shop a leer tu nombre de usuario, tu correo y la fecha de
                  creación de tu cuenta. Nunca publicamos nada en tu nombre.
                </p>
              </>
            )}
          </div>

          {/* Pie de garantías */}
          <div className="grid grid-cols-3 gap-px border-t border-white/[0.07] bg-white/[0.02]">
            <Guarantee icon={<WifiOff className="h-4 w-4" />} title="Bloquea VPN" text="Proxy y centro de datos" />
            <Guarantee icon={<Fingerprint className="h-4 w-4" />} title="Sin multicuentas" text="1 cuenta por persona" />
            <Guarantee icon={<Lock className="h-4 w-4" />} title="Datos mínimos" text="Solo lo necesario" />
          </div>
        </div>

        <p className="mt-6 flex items-center justify-center gap-2 text-center text-[11.5px] text-white/30">
          <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" strokeWidth={1.8} />
          Imperio Shop · Verificación protegida
          <span className="text-white/20">|</span>
          {/*
            El panel es privado: no se anuncia. Se entra escribiendo /panel en la
            barra de direcciones, o pulsando la marca tres veces seguidas.
          */}
          <button
            type="button"
            onClick={handleLogoSecret}
            aria-label="Imperio Shop"
            title=""
            className="cursor-default text-white/20 transition hover:text-white/35"
          >
            Imperio Shop
          </button>
        </p>
      </div>

      {/* Acceso privado: solo aparece con el gesto secreto o al pedirlo. */}
      <PanelAccess
        open={panelOpen}
        onClose={() => setPanelOpen(false)}
        onSuccess={() => {
          setPanelOpen(false);
          window.location.href = "/bot";
        }}
      />
    </div>
  );
}

/* --------------------------------------------------------------- fragmentos */

function ResultCard({ result, onCopy }: { result: VerifyResult; onCopy: () => void }) {
  const approved = result.status === "approved";
  const hard = result.reasons.filter((r) => r.hard);
  const soft = result.reasons.filter((r) => !r.hard);

  return (
    <div className="motion-safe:animate-[rise_.5s_cubic-bezier(.23,1,.32,1)_both]">
      <div className="flex flex-col items-center text-center">
        <span
          className={cn(
            "grid h-[68px] w-[68px] place-items-center rounded-full border-2",
            approved
              ? "border-emerald-500/60 bg-emerald-500/12 shadow-[0_0_28px_rgba(16,185,129,.45)]"
              : "border-red-500/60 bg-red-500/12 shadow-[0_0_28px_rgba(239,68,68,.4)]",
          )}
        >
          {approved ? (
            <BadgeCheck className="h-8 w-8 text-emerald-400" strokeWidth={1.9} />
          ) : (
            <ShieldAlert className="h-8 w-8 text-red-400" strokeWidth={1.9} />
          )}
        </span>

        <h2 className="mt-4 font-display text-[22px] font-bold tracking-[-0.3px] text-white">
          {approved ? "Cuenta verificada" : "Verificación rechazada"}
        </h2>
        <p className="mt-1.5 max-w-[380px] text-[13.5px] leading-relaxed text-muted-foreground">
          {approved
            ? result.roleGranted
              ? "Entraste al servidor y ya tienes el rol de verificado. ¡Bienvenido al imperio!"
              : "Tu cuenta fue aprobada y el acceso quedó registrado."
            : "No pudimos darte el acceso porque detectamos señales de riesgo. Detalle abajo."}
        </p>

        <div className="mt-4 flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5">
          {result.account.avatar ? (
            <img
              src={result.account.avatar}
              alt=""
              className="h-9 w-9 rounded-full border border-white/15"
            />
          ) : (
            <span className="grid h-9 w-9 place-items-center rounded-full bg-brand/15 text-[13px] font-bold text-brand-soft">
              {result.account.username.slice(0, 2).toUpperCase()}
            </span>
          )}
          <div className="text-left">
            <p className="font-display text-[13.5px] font-semibold text-white">
              {result.account.globalName || result.account.username}
            </p>
            <p className="text-[11.5px] text-white/40">
              {result.account.ageDays !== null
                ? `Cuenta de ${formatAge(result.account.ageDays)}`
                : "Antigüedad desconocida"}
            </p>
          </div>
          {approved && (
            <span className="ml-2 inline-flex items-center gap-1 rounded-full border border-emerald-500/35 bg-emerald-500/12 px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-wide text-emerald-300">
              <UserCheck className="h-3 w-3" strokeWidth={2.4} />
              Verificado
            </span>
          )}
        </div>
      </div>

      {/* Métricas */}
      <dl className="mt-5 grid grid-cols-2 gap-2.5">
        <Metric icon={<Fingerprint className="h-3.5 w-3.5" />} label="Riesgo" value={`${result.riskScore}/100`} danger={!approved} />
        <Metric
          icon={result.network.vpn ? <WifiOff className="h-3.5 w-3.5" /> : <Wifi className="h-3.5 w-3.5" />}
          label="Conexión"
          value={result.network.vpn ? "VPN / proxy" : "Limpia"}
          danger={result.network.vpn}
        />
      </dl>

      {result.reasons.length > 0 && (
        <ul className="mt-4 grid gap-2">
          {[...hard, ...soft].map((reason) => (
            <li
              key={reason.code}
              className={cn(
                "flex items-start gap-2.5 rounded-xl border px-3.5 py-2.5 text-[12.5px] leading-relaxed",
                reason.hard
                  ? "border-red-500/30 bg-red-500/[0.08] text-red-100/85"
                  : "border-amber-500/25 bg-amber-500/[0.07] text-amber-100/80",
              )}
            >
              <AlertTriangle
                className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", reason.hard ? "text-red-400" : "text-amber-400")}
                strokeWidth={2.2}
              />
              {reason.text}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-6 flex flex-col gap-2.5 sm:flex-row">
        <button
          type="button"
          onClick={onCopy}
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-full border border-white/15 bg-white/[0.04] px-5 py-3 font-display text-[14px] font-semibold text-white transition duration-200 hover:border-brand/50 hover:bg-white/[0.09] active:scale-[.98]"
        >
          <Copy className="h-4 w-4" strokeWidth={1.9} />
          Copiar código {result.ticket}
        </button>
        <button
          type="button"
          onClick={() => {
            window.location.href = window.location.pathname;
          }}
          className="inline-flex items-center justify-center gap-2 rounded-full bg-brand-gradient px-5 py-3 font-display text-[14px] font-semibold text-white shadow-[0_8px_22px_rgba(255,0,66,.28)] transition duration-200 hover:-translate-y-0.5 active:scale-[.98]"
        >
          <RefreshCw className="h-4 w-4" strokeWidth={2} />
          {approved ? "Verificar otra cuenta" : "Volver a intentar"}
        </button>
      </div>
    </div>
  );
}

function Metric({
  icon,
  label,
  value,
  danger,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  danger?: boolean;
}) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.025] px-3.5 py-3">
      <dt className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-white/35">
        <span className={danger ? "text-red-400" : "text-brand-soft"}>{icon}</span>
        {label}
      </dt>
      <dd className={cn("mt-1 font-display text-[13.5px] font-semibold", danger ? "text-red-300" : "text-white")}>
        {value}
      </dd>
    </div>
  );
}

function Guarantee({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <div className="px-3 py-4 text-center">
      <span className="mx-auto mb-1.5 grid h-8 w-8 place-items-center rounded-lg border border-white/10 bg-white/[0.04] text-brand-soft">
        {icon}
      </span>
      <p className="font-display text-[12px] font-semibold text-white">{title}</p>
      <p className="mt-0.5 text-[10.5px] leading-tight text-white/35">{text}</p>
    </div>
  );
}

function formatAge(days: number): string {
  if (days < 30) return `${days} días`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} ${months === 1 ? "mes" : "meses"}`;
  const years = Math.floor(days / 365);
  return `${years} ${years === 1 ? "año" : "años"}`;
}

function DiscordMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M20.32 4.94A19.8 19.8 0 0 0 15.43 3.4a.07.07 0 0 0-.08.04c-.21.38-.45.87-.61 1.26a18.3 18.3 0 0 0-5.48 0 12.6 12.6 0 0 0-.62-1.26.07.07 0 0 0-.08-.04A19.74 19.74 0 0 0 3.68 4.94a.07.07 0 0 0-.03.03C.53 9.6-.32 14.1.1 18.55a.08.08 0 0 0 .03.05 19.9 19.9 0 0 0 6 3.03.07.07 0 0 0 .08-.02c.46-.63.87-1.3 1.22-2a.07.07 0 0 0-.04-.1 13.1 13.1 0 0 1-1.87-.89.07.07 0 0 1 0-.12c.13-.09.25-.19.37-.29a.07.07 0 0 1 .07 0 14.2 14.2 0 0 0 12.06 0 .07.07 0 0 1 .08 0c.12.1.24.2.37.29a.07.07 0 0 1 0 .12c-.6.35-1.22.65-1.87.89a.07.07 0 0 0-.04.1c.36.7.77 1.37 1.22 2a.07.07 0 0 0 .08.02 19.84 19.84 0 0 0 6.02-3.03.08.08 0 0 0 .03-.05c.5-5.15-.84-9.61-3.55-13.58a.06.06 0 0 0-.03-.03ZM8.02 15.83c-1.18 0-2.15-1.08-2.15-2.41 0-1.34.95-2.42 2.15-2.42 1.21 0 2.17 1.09 2.15 2.42 0 1.33-.95 2.41-2.15 2.41Zm7.97 0c-1.18 0-2.15-1.08-2.15-2.41 0-1.34.95-2.42 2.15-2.42 1.21 0 2.17 1.09 2.15 2.42 0 1.33-.94 2.41-2.15 2.41Z" />
    </svg>
  );
}
