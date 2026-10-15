import { useEffect, useRef, useState } from "react";
import { Eye, EyeOff, Loader2, Lock, ShieldCheck, User, X } from "lucide-react";
import { trpc } from "@/lib/trpc";

/**
 * Ventana de acceso al panel privado.
 *
 * No guarda la contraseña en el navegador: pide usuario y contraseña, y el
 * servidor devuelve una sesión firmada que caduca sola. A partir de ahí la
 * navegación va con esa sesión, así que recargar la página no pide nada.
 */
type Props = {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
};

export default function PanelAccess({ open, onClose, onSuccess }: Props) {
  const [user, setUser] = useState("");
  const [password, setPassword] = useState("");
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const userRef = useRef<HTMLInputElement>(null);

  const login = trpc.bot.login.useMutation({
    onSuccess: () => {
      setError(null);
      setPassword("");
      onSuccess();
    },
    onError: (err) => {
      setError(err.message || "Usuario o contraseña incorrectos.");
      setPassword("");
      requestAnimationFrame(() => userRef.current?.focus());
    },
  });

  useEffect(() => {
    if (!open) return;
    setError(null);
    const t = window.setTimeout(() => userRef.current?.focus(), 60);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!user.trim() || !password) {
      setError("Rellena el usuario y la contraseña.");
      return;
    }
    login.mutate({ user: user.trim(), password });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-5">
      <div
        onClick={onClose}
        className="absolute inset-0 bg-black/75 backdrop-blur-[3px] motion-safe:animate-[fade_.18s_ease-out_both]"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="panel-access-title"
        className="relative w-full max-w-[380px] overflow-hidden rounded-2xl border border-white/[0.1] bg-[#12111a] shadow-[0_24px_70px_rgba(0,0,0,.7)] motion-safe:animate-[pop_.22s_cubic-bezier(.23,1,.32,1)_both]"
      >
        <span className="absolute inset-x-0 top-0 h-[2.5px] bg-gradient-to-r from-brand to-brand-2 shadow-[0_0_12px_#ff0042]" />

        <div className="px-6 pt-6 pb-5">
          <div className="mb-5 flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-brand/40 bg-brand/12 text-brand">
              <Lock className="h-[18px] w-[18px]" strokeWidth={2} />
            </span>
            <div className="min-w-0 flex-1">
              <h2 id="panel-access-title" className="font-display text-[16.5px] font-bold text-white">
                Acceso privado
              </h2>
              <p className="mt-0.5 text-[12px] leading-relaxed text-white/45">
                Solo para el equipo autorizado de Imperio Shop.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar"
              className="grid h-8 w-8 place-items-center rounded-lg border border-white/10 text-white/45 transition duration-200 hover:border-white/25 hover:text-white active:scale-97"
            >
              <X className="h-4 w-4" strokeWidth={2} />
            </button>
          </div>

          <form onSubmit={submit} className="space-y-3.5">
            <label className="block">
              <span className="mb-1.5 block text-[12px] font-medium text-white/60">Usuario</span>
              <span className="relative block">
                <User
                  className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-white/30"
                  strokeWidth={2}
                />
                <input
                  ref={userRef}
                  type="text"
                  value={user}
                  onChange={(e) => setUser(e.target.value)}
                  autoComplete="username"
                  spellCheck={false}
                  placeholder="Tu usuario"
                  className="w-full rounded-xl border border-white/12 bg-black/35 py-2.5 pr-3 pl-9.5 text-[13.5px] text-white placeholder:text-white/25 focus:border-brand/60 focus:ring-2 focus:ring-brand/20 focus:outline-none"
                />
              </span>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-[12px] font-medium text-white/60">Contraseña</span>
              <span className="relative block">
                <Lock
                  className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-white/30"
                  strokeWidth={2}
                />
                <input
                  type={visible ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  placeholder="••••••••••••"
                  className="w-full rounded-xl border border-white/12 bg-black/35 py-2.5 pr-10 pl-9.5 text-[13.5px] text-white placeholder:text-white/25 focus:border-brand/60 focus:ring-2 focus:ring-brand/20 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setVisible((v) => !v)}
                  aria-label={visible ? "Ocultar contraseña" : "Mostrar contraseña"}
                  className="absolute top-1/2 right-2.5 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-lg text-white/35 transition hover:text-white/75"
                >
                  {visible ? (
                    <EyeOff className="h-4 w-4" strokeWidth={2} />
                  ) : (
                    <Eye className="h-4 w-4" strokeWidth={2} />
                  )}
                </button>
              </span>
            </label>

            {error && (
              <p className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-[12.5px] leading-relaxed text-red-200 motion-safe:animate-[fade_.18s_ease-out_both]">
                <ShieldCheck className="mt-px h-4 w-4 shrink-0" strokeWidth={2} />
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={login.isPending}
              className="group mt-1 flex w-full items-center justify-center gap-2 rounded-xl bg-brand py-2.5 text-[13.5px] font-semibold text-white shadow-[0_6px_20px_rgba(255,0,66,.28)] transition duration-200 hover:bg-brand-2 hover:shadow-[0_8px_26px_rgba(255,0,66,.4)] active:scale-[.97] disabled:opacity-60"
            >
              {login.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.4} />
                  Comprobando…
                </>
              ) : (
                <>
                  Entrar
                  <Lock className="h-3.5 w-3.5" strokeWidth={2.4} />
                </>
              )}
            </button>
          </form>

          <p className="mt-4 flex items-center justify-center gap-1.5 text-center text-[11px] text-white/28">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-400/70" strokeWidth={1.8} />
            Sesión protegida · caduca sola · entradas registradas
          </p>
        </div>
      </div>
    </div>
  );
}
