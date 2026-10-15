import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { toast } from "sonner";
import {
  Activity,
  ArrowLeft,
  Ban,
  BarChart3,
  Bot,
  CheckCircle2,
  Crown,
  Gauge,
  Hash,
  History,
  KeyRound,
  Loader2,
  LogOut,
  MessageSquare,
  RefreshCw,
  Save,
  Search,
  Send,
  Settings2,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  UserMinus,
  UserPlus,
  Users,
  Wrench,
  XCircle,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { ASSETS } from "@/lib/content";
import { cn } from "@/lib/utils";
import { Badge, Button, Card, Empty, Field, Notice, Stat, Toggle, ago, when } from "@/components/bot/ui";

type Tab = "resumen" | "ajustes" | "miembros" | "mensajes" | "historial" | "accesos" | "registro";

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "resumen", label: "Resumen", icon: <Gauge className="h-4 w-4" strokeWidth={2} /> },
  { id: "ajustes", label: "Ajustes del bot", icon: <Settings2 className="h-4 w-4" strokeWidth={2} /> },
  { id: "miembros", label: "Miembros", icon: <Users className="h-4 w-4" strokeWidth={2} /> },
  { id: "mensajes", label: "Mensajes", icon: <MessageSquare className="h-4 w-4" strokeWidth={2} /> },
  { id: "historial", label: "Historial", icon: <BarChart3 className="h-4 w-4" strokeWidth={2} /> },
  { id: "accesos", label: "Accesos", icon: <KeyRound className="h-4 w-4" strokeWidth={2} /> },
  { id: "registro", label: "Registro", icon: <History className="h-4 w-4" strokeWidth={2} /> },
];

/** Pantalla que se muestra si no hay sesión abierta. */
function Locked({ onEnter }: { onEnter: () => void }) {
  return (
    <div className="grid min-h-screen place-items-center px-5">
      <div className="w-full max-w-[430px] overflow-hidden rounded-3xl border border-white/10 bg-[linear-gradient(180deg,#13121c,#100f18)] text-center shadow-[0_24px_60px_-18px_rgba(0,0,0,.85)]">
        <span className="block h-[2.5px] w-full bg-gradient-to-r from-brand to-brand-2 shadow-[0_0_12px_#ff0042]" />
        <div className="px-7 py-9">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl border border-brand/40 bg-brand/12 text-brand">
            <Shield className="h-6 w-6" strokeWidth={2} />
          </span>
          <h1 className="mt-4 font-display text-[18px] font-bold text-white">Panel privado</h1>
          <p className="mx-auto mt-2 max-w-[310px] text-[13px] leading-relaxed text-white/45">
            Este panel solo se abre con una cuenta autorizada. Cada acceso es individual y queda
            registrado.
          </p>
          <Button className="mt-6" onClick={onEnter}>
            <KeyRound className="h-4 w-4" strokeWidth={2.2} />
            Introducir mis datos
          </Button>
          <p className="mt-4 text-[11.5px] text-white/25">
            ¿No tienes acceso? Pídeselo al administrador de Imperio Shop.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function BotPanel({ onRequestLogin }: { onRequestLogin: () => void }) {
  const [tab, setTab] = useState<Tab>("resumen");
  const me = trpc.bot.me.useQuery(undefined, { retry: false });

  // Mientras se comprueba la sesión se muestra una carga breve.
  if (me.isLoading) {
    return (
      <div className="grid min-h-screen place-items-center">
        <Loader2 className="h-6 w-6 animate-spin text-brand" strokeWidth={2.4} />
      </div>
    );
  }

  if (!me.data) return <Locked onEnter={onRequestLogin} />;

  const isOwner = me.data.role === "owner";

  return (
    <div className="min-h-screen px-4 py-7 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-[1180px]">
        <header className="mb-7 flex flex-wrap items-center gap-4">
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/[0.04] px-4 py-2 text-[13px] font-medium text-white/70 transition duration-200 hover:border-brand/50 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" strokeWidth={2} />
            Verificación
          </Link>
          <div className="flex items-center gap-3">
            <img
              src={ASSETS.logoMark}
              alt=""
              className="h-10 w-10 rounded-xl border border-brand/40 bg-brand/10 p-1.5"
            />
            <div>
              <h1 className="font-display text-[19px] font-bold tracking-[-0.2px] text-white">
                Panel del bot
              </h1>
              <p className="text-[12.5px] text-white/45">
                Todo lo que hagas aquí se aplica en Discord al instante
              </p>
            </div>
          </div>

          <div className="ml-auto flex items-center gap-2.5">
            <span className="hidden items-center gap-2 rounded-full border border-white/12 bg-white/[0.04] px-3.5 py-2 text-[12.5px] text-white/60 sm:inline-flex">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" strokeWidth={2.2} />
              {me.data.user}
              <span className="text-white/25">·</span>
              {isOwner ? "propietario" : "moderador"}
            </span>
            <LogoutButton />
          </div>
        </header>

        {/* Pestañas */}
        <nav className="mb-6 flex flex-wrap gap-2">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                "inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 text-[13px] font-medium transition duration-200 active:scale-[.97]",
                tab === t.id
                  ? "border-brand/50 bg-brand/12 text-white"
                  : "border-white/10 bg-white/[0.03] text-white/55 hover:border-white/22 hover:text-white",
              )}
            >
              {t.icon}
              {t.label}
              {t.id === "accesos" && !isOwner && <ShieldAlert className="h-3.5 w-3.5 text-amber-400" strokeWidth={2} />}
            </button>
          ))}
        </nav>

        {tab === "resumen" && <Overview />}
        {tab === "ajustes" && <SettingsTab canEdit={isOwner} />}
        {tab === "miembros" && <MembersTab />}
        {tab === "mensajes" && <MessagesTab />}
        {tab === "historial" && <HistoryTab />}
        {tab === "accesos" && <AccessTab canEdit={isOwner} />}
        {tab === "registro" && <ActionsTab />}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- cerrar sesión */

function LogoutButton() {
  const utils = trpc.useUtils();
  const logout = trpc.bot.logout.useMutation({
    onSuccess: async () => {
      await utils.bot.me.invalidate();
      toast.success("Sesión cerrada");
    },
  });
  return (
    <Button variant="soft" size="sm" loading={logout.isPending} onClick={() => logout.mutate()}>
      <LogOut className="h-3.5 w-3.5" strokeWidth={2.2} />
      Salir
    </Button>
  );
}

/* ------------------------------------------------------------------ resumen */

function Overview() {
  const utils = trpc.useUtils();
  const { data, isLoading, error, isFetching } = trpc.bot.overview.useQuery(undefined, {
    refetchInterval: 30_000,
    retry: false,
  });
  // El recuento de mensajes va aparte porque tarda más: llega un momento después.
  const today = trpc.bot.today.useQuery(undefined, { retry: false, staleTime: 60_000 });

  if (isLoading) return <Card><Loading label="Leyendo el estado del bot…" /></Card>;
  if (error) return <Notice tone="bad">No se pudo leer el estado del bot: {error.message}</Notice>;
  if (!data) return null;

  const { overview, settings } = data;
  const failing = overview.checks.filter((c) => !c.ok);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Miembros" value={overview.guild.memberCount} icon={<Users className="h-4 w-4" />} />
        <Stat
          label="Mensajes hoy"
          value={today.isLoading ? "…" : (today.data?.unavailable ? "—" : (today.data?.total ?? 0))}
          hint={today.data?.unavailable}
          icon={<MessageSquare className="h-4 w-4" />}
        />
        <Stat
          label="Roles"
          value={overview.roles.length}
          hint={`${overview.channels.length} canales de texto`}
          icon={<Shield className="h-4 w-4" />}
        />
        <Stat
          label="Nivel de impulso"
          value={overview.guild.boostTier === 0 ? "Sin nivel" : `Nivel ${overview.guild.boostTier}`}
          hint={`${overview.guild.boostCount} impulso${overview.guild.boostCount === 1 ? "" : "s"}`}
          icon={<Crown className="h-4 w-4" />}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <Card
          title="Estado del bot"
          subtitle={`${overview.bot.username} · en ${overview.guild.name}`}
          icon={<Bot className="h-4 w-4" strokeWidth={2} />}
          action={
            <Button variant="soft" size="sm" loading={isFetching} onClick={() => utils.bot.overview.invalidate()}>
              <RefreshCw className="h-3.5 w-3.5" strokeWidth={2.2} />
              Actualizar
            </Button>
          }
        >
          {failing.length > 0 ? (
            <Notice tone="warn">
              Hay {failing.length} cosa{failing.length === 1 ? "" : "s"} que revisar. Está marcado abajo.
            </Notice>
          ) : (
            <Notice tone="good">Todo correcto: el bot puede gestionar el servidor sin problemas.</Notice>
          )}

          <ul className="mt-4 divide-y divide-white/[0.05]">
            {overview.checks.map((check) => (
              <li key={check.name} className="flex items-start gap-3 py-2.5">
                <span
                  className={cn(
                    "mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-lg border",
                    check.ok
                      ? "border-emerald-500/35 bg-emerald-500/12 text-emerald-300"
                      : "border-red-500/35 bg-red-500/12 text-red-300",
                  )}
                >
                  {check.ok ? (
                    <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={2.4} />
                  ) : (
                    <XCircle className="h-3.5 w-3.5" strokeWidth={2.4} />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[13.5px] font-medium text-white">{check.name}</p>
                  <p className="text-[12px] leading-relaxed text-white/40">{check.detail}</p>
                </div>
              </li>
            ))}
          </ul>
        </Card>

        <div className="space-y-6">
          <Card title="Cómo está configurada la verificación" icon={<Wrench className="h-4 w-4" strokeWidth={2} />}>
            <ul className="space-y-2.5 text-[13px]">
              <Row label="Antigüedad mínima" value={`${settings.minAccountDays} días`} />
              <Row label="Cuentas por conexión" value={settings.maxAccountsPerIp} />
              <Row label="Cuentas por dispositivo" value={settings.maxAccountsPerDevice} />
              <Row label="Riesgo máximo" value={settings.maxRisk} />
              <Row
                label="Bloqueo de VPN"
                value={settings.blockVpn ? "Activado" : "Desactivado"}
                tone={settings.blockVpn ? "good" : "warn"}
              />
              <Row
                label="Verificación"
                value={settings.verificationPaused ? "En mantenimiento" : "Funcionando"}
                tone={settings.verificationPaused ? "bad" : "good"}
              />
            </ul>
            <p className="mt-4 text-[11.5px] text-white/30">
              Se puede cambiar todo desde la pestaña «Ajustes del bot».
            </p>
          </Card>

          <Card title="Canales disponibles" icon={<Hash className="h-4 w-4" strokeWidth={2} />}>
            <div className="flex flex-wrap gap-2">
              {overview.channels.slice(0, 14).map((c) => (
                <span
                  key={c.id}
                  className="rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-[12px] text-white/60"
                >
                  #{c.name}
                </span>
              ))}
              {overview.channels.length === 0 && <p className="text-[12.5px] text-white/40">No se leen canales.</p>}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string | number;
  tone?: "neutral" | "good" | "bad" | "warn";
}) {
  const tones: Record<string, string> = {
    neutral: "text-white",
    good: "text-emerald-300",
    bad: "text-red-300",
    warn: "text-amber-300",
  };
  return (
    <li className="flex items-center justify-between gap-3 border-b border-white/[0.05] pb-2 last:border-0">
      <span className="text-white/50">{label}</span>
      <span className={cn("font-medium", tones[tone])}>{value}</span>
    </li>
  );
}

/* ------------------------------------------------------------------ ajustes */

function SettingsTab({ canEdit }: { canEdit: boolean }) {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.bot.settings.useQuery(undefined, { retry: false });
  const [draft, setDraft] = useState<Record<string, unknown>>({});

  // Copia local para editar sin tocar lo guardado hasta pulsar Guardar.
  const current = useMemo(() => ({ ...(data?.settings ?? {}), ...draft }), [data?.settings, draft]);
  const dirty = Object.keys(draft).length > 0;

  const save = trpc.bot.saveSettings.useMutation({
    onSuccess: async (result) => {
      setDraft({});
      await Promise.all([utils.bot.settings.invalidate(), utils.bot.overview.invalidate()]);
      toast.success(`Guardado: ${result.saved.length} ajuste${result.saved.length === 1 ? "" : "s"}. Ya se aplica.`);
    },
    onError: (err) => toast.error(err.message),
  });

  const reset = trpc.bot.resetSettings.useMutation({
    onSuccess: async () => {
      setDraft({});
      await utils.bot.settings.invalidate();
      toast.success("Ajustes restaurados");
    },
    onError: (err) => toast.error(err.message),
  });

  if (isLoading) return <Card><Loading label="Leyendo los ajustes…" /></Card>;
  if (!data) return null;

  const set = (key: string, value: unknown) => setDraft((d) => ({ ...d, [key]: value }));
  // Los ajustes se leen por nombre; el tipo se resuelve al pintarlos.
  const bag = current as unknown as Record<string, unknown>;
  const asBool = (key: string) => Boolean(bag[key]);
  const asNum = (key: string) => Number(bag[key] ?? 0);
  const asText = (key: string) => String(bag[key] ?? "");

  return (
    <div className="space-y-6">
      {!canEdit && (
        <Notice tone="warn">
          Tu cuenta es de moderador: puedes gestionar miembros y mensajes, pero no cambiar los ajustes
          del bot. Pídeselo a la cuenta principal.
        </Notice>
      )}

      {asBool("verificationPaused") && (
        <Notice tone="bad">
          La verificación está <strong>en mantenimiento</strong>: nadie puede verificarse ahora mismo.
        </Notice>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card
          title="Reglas de acceso"
          subtitle="Quién puede verificarse y quién no"
          icon={<Shield className="h-4 w-4" strokeWidth={2} />}
        >
          <div className="space-y-4">
            <Field
              label="Antigüedad mínima de la cuenta"
              suffix="días"
              min={0}
              max={3650}
              value={asNum("minAccountDays")}
              onChange={(v) => set("minAccountDays", Number(v))}
              hint="Una cuenta más nueva que esto se rechaza. Ahora mismo: 5 días."
            />
            <Field
              label="Cuentas permitidas por conexión"
              min={1}
              max={100}
              value={asNum("maxAccountsPerIp")}
              onChange={(v) => set("maxAccountsPerIp", Number(v))}
              hint="Cuántas cuentas distintas pueden verificarse desde la misma IP."
            />
            <Field
              label="Cuentas permitidas por dispositivo"
              min={1}
              max={100}
              value={asNum("maxAccountsPerDevice")}
              onChange={(v) => set("maxAccountsPerDevice", Number(v))}
              hint="Cuántas cuentas distintas pueden verificarse desde el mismo navegador."
            />
            <Field
              label="Riesgo máximo permitido"
              min={1}
              max={1000}
              value={asNum("maxRisk")}
              onChange={(v) => set("maxRisk", Number(v))}
              hint="Si la suma de señales sospechosas llega a este número, se bloquea."
            />
          </div>
        </Card>

        <Card
          title="Qué se bloquea"
          subtitle="Activa o desactiva cada control"
          icon={<ShieldAlert className="h-4 w-4" strokeWidth={2} />}
        >
          <div className="space-y-2.5">
            <Toggle
              checked={asBool("blockVpn")}
              onChange={(v) => set("blockVpn", v)}
              label="Bloquear VPN, proxy y Tor"
              hint="Impide verificar desde conexiones anónimas."
            />
            <Toggle
              checked={asBool("blockDatacenter")}
              onChange={(v) => set("blockDatacenter", v)}
              label="Bloquear centros de datos"
              hint="Rechaza conexiones de servidores, no de casas."
            />
            <Toggle
              checked={asBool("blockTimezoneMismatch")}
              onChange={(v) => set("blockTimezoneMismatch", v)}
              label="Bloquear si la zona horaria no cuadra"
              hint="Señal de que alguien esconde su ubicación. Es estricto: puede molestar a gente que viaja."
            />
            <Toggle
              checked={asBool("requireVerifiedEmail")}
              onChange={(v) => set("requireVerifiedEmail", v)}
              label="Exigir correo verificado en Discord"
              hint="Bloquea cuentas de Discord sin correo confirmado."
            />
          </div>
        </Card>

        <Card
          title="Avisos automáticos"
          subtitle="Qué hace el bot cuando alguien se verifica"
          icon={<Activity className="h-4 w-4" strokeWidth={2} />}
        >
          <div className="space-y-2.5">
            <Toggle
              checked={asBool("notifyOnApproval")}
              onChange={(v) => set("notifyOnApproval", v)}
              label="Avisar en un canal cuando alguien se verifica"
            />
            <Toggle
              checked={asBool("dmOnApproval")}
              onChange={(v) => set("dmOnApproval", v)}
              label="Enviar un mensaje privado al verificado"
            />
          </div>

          <div className="mt-4 space-y-4">
            <ChannelPicker
              value={asText("logChannelId")}
              onChange={(v) => set("logChannelId", v)}
              disabled={!asBool("notifyOnApproval")}
            />
            <label className="block">
              <span className="mb-1.5 block text-[12px] font-medium text-white/60">
                Texto del mensaje privado
              </span>
              <textarea
                value={asText("dmMessage")}
                onChange={(e) => set("dmMessage", e.target.value)}
                rows={3}
                disabled={!asBool("dmOnApproval")}
                className="w-full resize-y rounded-xl border border-white/12 bg-black/35 px-3 py-2.5 text-[13px] text-white placeholder:text-white/25 focus:border-brand/60 focus:ring-2 focus:ring-brand/20 focus:outline-none disabled:opacity-45"
              />
            </label>
          </div>
        </Card>

        <Card
          title="Roles que se entregan"
          subtitle="Al verificarse, la persona recibe estos roles"
          icon={<ShieldCheck className="h-4 w-4" strokeWidth={2} />}
        >
          <label className="block">
            <span className="mb-1.5 block text-[12px] font-medium text-white/60">
              IDs de los roles extra (separados por comas)
            </span>
            <input
              type="text"
              value={asText("extraRoleIds")}
              onChange={(e) => set("extraRoleIds", e.target.value)}
              className="w-full rounded-xl border border-white/12 bg-black/35 px-3 py-2.5 font-mono text-[12.5px] text-white focus:border-brand/60 focus:ring-2 focus:ring-brand/20 focus:outline-none"
            />
            <span className="mt-1 block text-[11.5px] leading-relaxed text-white/35">
              El rol de verificado siempre se entrega. Aquí se añaden los demás (por ejemplo, Miembro).
            </span>
          </label>
          <RolesCheck />
        </Card>

        <Card
          title="Mantenimiento"
          subtitle="Pausa la verificación sin tocar nada más"
          icon={<Wrench className="h-4 w-4" strokeWidth={2} />}
          className="lg:col-span-2"
        >
          <div className="space-y-3">
            <Toggle
              checked={asBool("verificationPaused")}
              onChange={(v) => set("verificationPaused", v)}
              label="Pausar la verificación"
              hint="Mientras esté activo, nadie podrá verificarse y se mostrará el mensaje de abajo."
            />
            <label className="block">
              <span className="mb-1.5 block text-[12px] font-medium text-white/60">
                Mensaje que verán mientras esté pausada
              </span>
              <input
                type="text"
                value={asText("pausedMessage")}
                onChange={(e) => set("pausedMessage", e.target.value)}
                disabled={!asBool("verificationPaused")}
                className="w-full rounded-xl border border-white/12 bg-black/35 px-3 py-2.5 text-[13px] text-white focus:border-brand/60 focus:ring-2 focus:ring-brand/20 focus:outline-none disabled:opacity-45"
              />
            </label>
          </div>
        </Card>
      </div>

      <div className="sticky bottom-4 flex flex-wrap items-center gap-3 rounded-2xl border border-white/12 bg-[#12111a]/95 px-4 py-3 shadow-[0_16px_40px_-12px_rgba(0,0,0,.9)] backdrop-blur">
        <p className="text-[12.5px] text-white/50">
          {dirty
            ? `${Object.keys(draft).length} cambio${Object.keys(draft).length === 1 ? "" : "s"} sin guardar`
            : "Todo guardado"}
        </p>
        <div className="ml-auto flex gap-2.5">
          <Button variant="soft" size="sm" onClick={() => setDraft({})} disabled={!dirty}>
            Descartar
          </Button>
          <Button
            variant="danger"
            size="sm"
            loading={reset.isPending}
            disabled={!canEdit}
            onClick={() => reset.mutate()}
          >
            Restaurar
          </Button>
          <Button
            size="sm"
            loading={save.isPending}
            disabled={!dirty || !canEdit}
            onClick={() => save.mutate({ patch: draft as never })}
          >
            <Save className="h-3.5 w-3.5" strokeWidth={2.2} />
            Guardar cambios
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Selector de canal de Discord, con los canales que ve el bot. */
function ChannelPicker({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  const { data } = trpc.bot.overview.useQuery(undefined, { retry: false, staleTime: 60_000 });
  return (
    <label className="block">
      <span className="mb-1.5 block text-[12px] font-medium text-white/60">Canal de avisos</span>
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-white/12 bg-black/35 px-3 py-2.5 text-[13px] text-white focus:border-brand/60 focus:ring-2 focus:ring-brand/20 focus:outline-none disabled:opacity-45"
      >
        <option value="">— Sin canal —</option>
        {(data?.overview.channels ?? []).map((c) => (
          <option key={c.id} value={c.id}>
            #{c.name}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Comprueba que el bot puede entregar los roles configurados. */
function RolesCheck() {
  const { data, isLoading, error } = trpc.verify.roles.useQuery(undefined, { retry: false });
  if (isLoading) return <p className="mt-3 text-[12px] text-white/40">Comprobando los roles…</p>;
  if (error) return <p className="mt-3 text-[12px] text-red-300/80">{error.message}</p>;
  return (
    <ul className="mt-3 space-y-1.5">
      {(data ?? []).map((role) => (
        <li key={role.roleId} className="flex items-center gap-2 text-[12px]">
          <span className={role.deliverable ? "text-emerald-400" : "text-red-400"}>
            {role.deliverable ? "●" : "○"}
          </span>
          <span className="text-white/70">{role.name}</span>
          <span className="font-mono text-[11px] text-white/30">{role.roleId}</span>
          {!role.deliverable && <span className="text-red-300/80">· {role.reason}</span>}
        </li>
      ))}
    </ul>
  );
}

/* ----------------------------------------------------------------- miembros */

function MembersTab() {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const utils = trpc.useUtils();

  const { data, isLoading, error } = trpc.bot.members.useQuery({ query }, { retry: false });
  const detail = trpc.bot.member.useQuery({ userId: selected ?? "" }, { enabled: Boolean(selected), retry: false });
  const overview = trpc.bot.overview.useQuery(undefined, { retry: false, staleTime: 60_000 });
  const roles = overview.data?.overview.roles ?? [];

  const act = (name: string, fn: () => void) => () => {
    fn();
    void name;
  };
  void act;

  const kick = trpc.bot.kick.useMutation({
    onSuccess: async () => {
      toast.success("Miembro expulsado");
      await Promise.all([utils.bot.members.invalidate(), utils.bot.member.invalidate()]);
    },
    onError: (e) => toast.error(e.message),
  });
  const ban = trpc.bot.ban.useMutation({
    onSuccess: async () => {
      toast.success("Miembro vetado");
      await Promise.all([utils.bot.members.invalidate(), utils.bot.member.invalidate()]);
    },
    onError: (e) => toast.error(e.message),
  });
  const addRole = trpc.bot.addRole.useMutation({
    onSuccess: async () => {
      toast.success("Rol entregado");
      await Promise.all([utils.bot.members.invalidate(), utils.bot.member.invalidate()]);
    },
    onError: (e) => toast.error(e.message),
  });
  const removeRole = trpc.bot.removeRole.useMutation({
    onSuccess: async () => {
      toast.success("Rol retirado");
      await Promise.all([utils.bot.members.invalidate(), utils.bot.member.invalidate()]);
    },
    onError: (e) => toast.error(e.message),
  });
  const setManual = trpc.bot.setManual.useMutation({
    onSuccess: async () => {
      toast.success("Marca guardada");
      await Promise.all([utils.bot.manualBlocks.invalidate(), utils.bot.members.invalidate()]);
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
      <Card
        title="Miembros del servidor"
        subtitle="Busca por nombre, apodo o ID"
        icon={<Users className="h-4 w-4" strokeWidth={2} />}
      >
        <div className="relative mb-3">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-white/30" strokeWidth={2} />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar miembro…"
            className="w-full rounded-xl border border-white/12 bg-black/35 py-2.5 pr-3 pl-9.5 text-[13.5px] text-white placeholder:text-white/25 focus:border-brand/60 focus:ring-2 focus:ring-brand/20 focus:outline-none"
          />
        </div>

        {isLoading ? (
          <Loading label="Leyendo los miembros…" />
        ) : error ? (
          <Notice tone="bad">{error.message}</Notice>
        ) : (data ?? []).length === 0 ? (
          <Empty title="No se encontró a nadie" hint="Prueba con otro nombre o revisa los permisos del bot." />
        ) : (
          <ul className="max-h-[520px] divide-y divide-white/[0.05] overflow-y-auto">
            {(data ?? []).map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => setSelected(m.id)}
                  className={cn(
                    "flex w-full items-center gap-3 px-1 py-2.5 text-left transition hover:bg-white/[0.03]",
                    selected === m.id && "bg-brand/[0.07]",
                  )}
                >
                  <Avatar id={m.id} avatar={m.avatar} name={m.globalName ?? m.username} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-medium text-white">
                      {m.nickname ?? m.globalName ?? m.username}
                    </span>
                    <span className="block truncate font-mono text-[11.5px] text-white/35">
                      {m.username} · {m.id}
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    {m.banned && <Badge tone="bad">vetado</Badge>}
                    {m.bot && <Badge tone="neutral">bot</Badge>}
                    {m.roles.length > 0 && <Badge tone="good">{m.roles.length} roles</Badge>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card
        title={detail.data ? `${detail.data.globalName ?? detail.data.username}` : "Ficha del miembro"}
        subtitle={detail.data ? `Entró ${ago(detail.data.joinedAt)}` : "Elige a alguien de la lista"}
        icon={<Shield className="h-4 w-4" strokeWidth={2} />}
      >
        {!selected ? (
          <Empty title="Sin selección" hint="Pulsa en un miembro para ver y cambiar sus roles." />
        ) : detail.isLoading ? (
          <Loading label="Leyendo la ficha…" />
        ) : !detail.data ? (
          <Notice tone="warn">Ese usuario ya no está en el servidor.</Notice>
        ) : (
          <div className="space-y-5">
            <div className="flex items-center gap-3">
              <Avatar id={detail.data.id} avatar={detail.data.avatar} name={detail.data.username} big />
              <div className="min-w-0">
                <p className="truncate text-[15px] font-semibold text-white">
                  {detail.data.nickname ?? detail.data.globalName ?? detail.data.username}
                </p>
                <p className="font-mono text-[11.5px] text-white/35">{detail.data.id}</p>
                <p className="mt-0.5 text-[12px] text-white/45">
                  Cuenta creada {ago(snowflake(detail.data.id))}
                </p>
              </div>
            </div>

            <div>
              <p className="mb-2 text-[12px] font-medium tracking-wide text-white/50 uppercase">
                Roles que tiene
              </p>
              <div className="flex flex-wrap gap-2">
                {detail.data.roles.length === 0 && <span className="text-[12.5px] text-white/35">Ninguno</span>}
                {detail.data.roles.map((id) => {
                  const role = roles.find((r) => r.id === id);
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => removeRole.mutate({ userId: detail.data!.id, roleId: id })}
                      disabled={removeRole.isPending}
                      title="Pulsa para retirar este rol"
                      className="group inline-flex items-center gap-1.5 rounded-full border border-white/12 bg-white/[0.04] px-3 py-1.5 text-[12px] text-white/70 transition hover:border-red-500/45 hover:text-red-200"
                    >
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ background: roleColor(role?.color) }}
                      />
                      {role?.name ?? id}
                      <UserMinus className="h-3 w-3 opacity-0 transition group-hover:opacity-100" strokeWidth={2.4} />
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <p className="mb-2 text-[12px] font-medium tracking-wide text-white/50 uppercase">
                Entregar un rol
              </p>
              <div className="flex flex-wrap gap-2">
                {roles
                  .filter((r) => !detail.data!.roles.includes(r.id) && !r.managed)
                  .slice(0, 12)
                  .map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => addRole.mutate({ userId: detail.data!.id, roleId: r.id })}
                      disabled={addRole.isPending}
                      className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.02] px-3 py-1.5 text-[12px] text-white/55 transition hover:border-emerald-500/45 hover:text-emerald-200"
                    >
                      <UserPlus className="h-3 w-3" strokeWidth={2.4} />
                      {r.name}
                    </button>
                  ))}
                {roles.filter((r) => !detail.data!.roles.includes(r.id) && !r.managed).length === 0 && (
                  <span className="text-[12.5px] text-white/35">Ya tiene todos los roles disponibles.</span>
                )}
              </div>
            </div>

            <div className="space-y-2.5 border-t border-white/[0.07] pt-4">
              <p className="text-[12px] font-medium tracking-wide text-white/50 uppercase">
                Bloqueo de verificación
              </p>
              <p className="text-[12px] leading-relaxed text-white/40">
                Bloquear impide que esta cuenta se verifique aunque todo lo demás esté bien. Aprobar deja
                pasar aunque el análisis la hubiera bloqueado (útil para una VPN de empresa).
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="danger"
                  size="sm"
                  loading={setManual.isPending}
                  onClick={() =>
                    setManual.mutate({ discordId: detail.data!.id, username: detail.data!.username, kind: "block", reason: "Bloqueado desde el panel" })
                  }
                >
                  <Ban className="h-3.5 w-3.5" strokeWidth={2.2} />
                  Bloquear
                </Button>
                <Button
                  variant="soft"
                  size="sm"
                  loading={setManual.isPending}
                  onClick={() =>
                    setManual.mutate({ discordId: detail.data!.id, username: detail.data!.username, kind: "allow", reason: "Aprobado desde el panel" })
                  }
                >
                  <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={2.2} />
                  Aprobar a mano
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  loading={setManual.isPending}
                  onClick={() => setManual.mutate({ discordId: detail.data!.id, kind: "none" })}
                >
                  Quitar marca
                </Button>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 border-t border-white/[0.07] pt-4">
              <Button
                variant="danger"
                size="sm"
                loading={kick.isPending}
                onClick={() => kick.mutate({ userId: detail.data!.id, reason: "Expulsado desde el panel" })}
              >
                <UserMinus className="h-3.5 w-3.5" strokeWidth={2.2} />
                Expulsar
              </Button>
              <Button
                variant="danger"
                size="sm"
                loading={ban.isPending}
                onClick={() => ban.mutate({ userId: detail.data!.id, reason: "Vetado desde el panel", deleteDays: 0 })}
              >
                <Ban className="h-3.5 w-3.5" strokeWidth={2.2} />
                Vetar del servidor
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

function Avatar({ id, avatar, name, big }: { id: string; avatar: string | null; name: string; big?: boolean }) {
  const url = avatar
    ? `https://cdn.discordapp.com/avatars/${id}/${avatar}.png?size=128`
    : null;
  const size = big ? "h-14 w-14" : "h-9 w-9";
  if (url) {
    return <img src={url} alt="" className={cn(size, "shrink-0 rounded-full border border-white/10")} />;
  }
  return (
    <span
      className={cn(
        size,
        "grid shrink-0 place-items-center rounded-full border border-white/10 bg-white/[0.05] text-[13px] font-semibold text-white/60",
      )}
    >
      {name.slice(0, 2).toUpperCase()}
    </span>
  );
}

/** Convierte el número de color de un rol a un color CSS. */
function roleColor(color?: number): string {
  if (!color) return "#99aab5";
  return `#${color.toString(16).padStart(6, "0")}`;
}

/** Fecha de creación de una cuenta a partir de su ID. */
function snowflake(id: string): string | null {
  if (!/^\d{17,20}$/.test(id)) return null;
  try {
    return new Date(Number(BigInt(id) >> BigInt(22)) + 1420070400000).toISOString();
  } catch {
    return null;
  }
}

/* ----------------------------------------------------------------- mensajes */

function MessagesTab() {
  const overview = trpc.bot.overview.useQuery(undefined, { retry: false, staleTime: 60_000 });
  const [channelId, setChannelId] = useState("");
  const [content, setContent] = useState("");
  const [dmTarget, setDmTarget] = useState("");
  const [dmContent, setDmContent] = useState("");

  const send = trpc.bot.sendMessage.useMutation({
    onSuccess: () => {
      toast.success("Mensaje publicado en el canal");
      setContent("");
    },
    onError: (e) => toast.error(e.message),
  });
  const sendDm = trpc.bot.sendDm.useMutation({
    onSuccess: () => {
      toast.success("Mensaje privado enviado");
      setDmContent("");
    },
    onError: (e) => toast.error(e.message),
  });

  const channels = overview.data?.overview.channels ?? [];

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card
        title="Publicar en un canal"
        subtitle="El mensaje aparece en Discord al enviarlo"
        icon={<Hash className="h-4 w-4" strokeWidth={2} />}
      >
        <label className="mb-3 block">
          <span className="mb-1.5 block text-[12px] font-medium text-white/60">Canal</span>
          <select
            value={channelId}
            onChange={(e) => setChannelId(e.target.value)}
            className="w-full rounded-xl border border-white/12 bg-black/35 px-3 py-2.5 text-[13px] text-white focus:border-brand/60 focus:ring-2 focus:ring-brand/20 focus:outline-none"
          >
            <option value="">— Elige un canal —</option>
            {channels.map((c) => (
              <option key={c.id} value={c.id}>
                #{c.name}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1.5 block text-[12px] font-medium text-white/60">Mensaje</span>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={5}
            placeholder="Escribe el mensaje que quieres publicar…"
            className="w-full resize-y rounded-xl border border-white/12 bg-black/35 px-3 py-2.5 text-[13px] text-white placeholder:text-white/25 focus:border-brand/60 focus:ring-2 focus:ring-brand/20 focus:outline-none"
          />
          <span className="mt-1 block text-[11.5px] text-white/35">
            Puedes usar emojis, negritas (**texto**) y menciones a canales (#canal).
          </span>
        </label>

        <Button
          className="mt-4"
          loading={send.isPending}
          disabled={!channelId || !content.trim()}
          onClick={() => send.mutate({ channelId, content })}
        >
          <Send className="h-4 w-4" strokeWidth={2.2} />
          Publicar en Discord
        </Button>
      </Card>

      <Card
        title="Mensaje privado"
        subtitle="Escribe a una persona del servidor"
        icon={<MessageSquare className="h-4 w-4" strokeWidth={2} />}
      >
        <Field
          label="ID del usuario de Discord"
          value={dmTarget}
          type="text"
          onChange={setDmTarget}
          placeholder="Por ejemplo 1547748792483315712"
          hint="Puedes copiarlo desde la pestaña Miembros."
        />

        <label className="mt-3 block">
          <span className="mb-1.5 block text-[12px] font-medium text-white/60">Mensaje</span>
          <textarea
            value={dmContent}
            onChange={(e) => setDmContent(e.target.value)}
            rows={5}
            placeholder="Escribe el mensaje privado…"
            className="w-full resize-y rounded-xl border border-white/12 bg-black/35 px-3 py-2.5 text-[13px] text-white placeholder:text-white/25 focus:border-brand/60 focus:ring-2 focus:ring-brand/20 focus:outline-none"
          />
        </label>

        <Notice tone="warn">
          Si la persona tiene cerrados los mensajes privados, Discord no dejará enviarlo. No es un fallo del
          panel.
        </Notice>

        <Button
          className="mt-4"
          loading={sendDm.isPending}
          disabled={!dmTarget.trim() || !dmContent.trim()}
          onClick={() => sendDm.mutate({ userId: dmTarget.trim(), content: dmContent })}
        >
          <Send className="h-4 w-4" strokeWidth={2.2} />
          Enviar mensaje privado
        </Button>
      </Card>
    </div>
  );
}

/* ---------------------------------------------------------------- historial */

function HistoryTab() {
  const [days, setDays] = useState(7);
  const { data, isLoading, error } = trpc.bot.history.useQuery({ days }, { retry: false });
  const bans = trpc.bot.bans.useQuery(undefined, { retry: false });

  const max = Math.max(...(data?.byDay.map((d) => d.count) ?? [0]), 1);

  return (
    <div className="space-y-6">
      <Card
        title="Actividad del servidor"
        subtitle="Mensajes enviados en los últimos días"
        icon={<BarChart3 className="h-4 w-4" strokeWidth={2} />}
        action={
          <div className="flex gap-1.5">
            {[1, 7, 30].map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDays(d)}
                className={cn(
                  "rounded-lg border px-2.5 py-1.5 text-[12px] transition",
                  days === d
                    ? "border-brand/50 bg-brand/12 text-white"
                    : "border-white/10 text-white/50 hover:text-white",
                )}
              >
                {d === 1 ? "Hoy" : `${d} días`}
              </button>
            ))}
          </div>
        }
      >
        {isLoading ? (
          <Loading label="Contando mensajes…" />
        ) : error ? (
          <Notice tone="bad">{error.message}</Notice>
        ) : (
          <>
            <div className="mb-4 flex items-baseline gap-2">
              <span className="font-display text-[30px] leading-none font-bold text-white">
                {data?.total ?? 0}
              </span>
              <span className="text-[13px] text-white/45">
                mensaje{(data?.total ?? 0) === 1 ? "" : "s"} en {days === 1 ? "hoy" : `los últimos ${days} días`}
              </span>
            </div>

            {(data?.byDay.length ?? 0) > 0 ? (
              <div className="flex h-32 items-end gap-1.5">
                {data!.byDay.map((d) => (
                  <div key={d.date} className="group flex flex-1 flex-col items-center gap-1.5">
                    <span className="text-[10.5px] text-white/35 opacity-0 transition group-hover:opacity-100">
                      {d.count}
                    </span>
                    <div
                      className="w-full rounded-t-md bg-gradient-to-t from-brand/45 to-brand-2/85 transition-all"
                      style={{ height: `${Math.max(4, (d.count / max) * 100)}%` }}
                      title={`${d.date}: ${d.count} mensajes`}
                    />
                    <span className="text-[10px] text-white/30">{d.date.slice(5)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <Empty title="Sin actividad en este periodo" hint="No se han enviado mensajes, o el bot no puede leerlos." />
            )}

            {data?.unavailable && (
              <div className="mt-4">
                <Notice tone="warn">{data.unavailable}</Notice>
              </div>
            )}
          </>
        )}
      </Card>

      <Card
        title="Miembros vetados"
        subtitle="Personas que no pueden volver a entrar"
        icon={<Ban className="h-4 w-4" strokeWidth={2} />}
      >
        {bans.isLoading ? (
          <Loading label="Leyendo la lista…" />
        ) : (bans.data ?? []).length === 0 ? (
          <Empty title="No hay nadie vetado" />
        ) : (
          <ul className="divide-y divide-white/[0.05]">
            {(bans.data ?? []).map((b) => (
              <li key={b.id} className="flex flex-wrap items-center gap-3 py-2.5">
                <Avatar id={b.id} avatar={b.avatar} name={b.username} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13.5px] font-medium text-white">{b.username}</p>
                  <p className="truncate font-mono text-[11.5px] text-white/35">{b.id}</p>
                </div>
                {b.banReason && <span className="text-[12px] text-white/40">{b.banReason}</span>}
                <UnbanButton id={b.id} username={b.username} />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function UnbanButton({ id, username }: { id: string; username: string }) {
  const utils = trpc.useUtils();
  const unban = trpc.bot.unban.useMutation({
    onSuccess: async () => {
      toast.success(`${username} puede volver a entrar`);
      await Promise.all([utils.bot.bans.invalidate(), utils.bot.members.invalidate()]);
    },
    onError: (e) => toast.error(e.message),
  });
  return (
    <Button variant="soft" size="sm" loading={unban.isPending} onClick={() => unban.mutate({ userId: id })}>
      Quitar veto
    </Button>
  );
}

/* ----------------------------------------------------------------- accesos */

function AccessTab({ canEdit }: { canEdit: boolean }) {
  const utils = trpc.useUtils();
  const { data, isLoading, error } = trpc.bot.accounts.useQuery(undefined, { retry: false });

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [label, setLabel] = useState("");
  const [role, setRole] = useState<"owner" | "moderator">("moderator");

  const create = trpc.bot.createAccount.useMutation({
    onSuccess: async () => {
      toast.success("Acceso creado");
      setUsername("");
      setPassword("");
      setLabel("");
      await utils.bot.accounts.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const update = trpc.bot.updateAccount.useMutation({
    onSuccess: async () => {
      toast.success("Acceso actualizado");
      await utils.bot.accounts.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const remove = trpc.bot.deleteAccount.useMutation({
    onSuccess: async () => {
      toast.success("Acceso retirado");
      await utils.bot.accounts.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  if (!canEdit) {
    return (
      <Notice tone="warn">
        Solo la cuenta principal puede ver y gestionar quién tiene acceso al panel.
      </Notice>
    );
  }

  if (isLoading) return <Card><Loading label="Leyendo los accesos…" /></Card>;
  if (error) return <Notice tone="bad">{error.message}</Notice>;

  return (
    <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
      <div className="space-y-6">
        <Card
          title="Quién puede entrar al panel"
          subtitle="Cada persona tiene su propio usuario y contraseña"
          icon={<KeyRound className="h-4 w-4" strokeWidth={2} />}
        >
          <ul className="divide-y divide-white/[0.05]">
            {(data?.accounts ?? []).map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-3 py-3">
                <span
                  className={cn(
                    "grid h-9 w-9 shrink-0 place-items-center rounded-xl border",
                    a.active
                      ? "border-emerald-500/35 bg-emerald-500/12 text-emerald-300"
                      : "border-white/12 bg-white/[0.04] text-white/35",
                  )}
                >
                  {a.role === "owner" ? (
                    <Crown className="h-4 w-4" strokeWidth={2.2} />
                  ) : (
                    <Shield className="h-4 w-4" strokeWidth={2.2} />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13.5px] font-medium text-white">
                    {a.label ?? a.username}
                    {a.isOwner && <span className="ml-2 text-[11.5px] text-brand-soft">cuenta principal</span>}
                  </p>
                  <p className="truncate font-mono text-[11.5px] text-white/35">{a.username}</p>
                  <p className="mt-0.5 text-[11.5px] text-white/30">
                    {a.lastLoginAt ? `Última entrada ${ago(a.lastLoginAt)}` : "Nunca ha entrado"}
                    {a.loginCount > 0 && ` · ${a.loginCount} entrada${a.loginCount === 1 ? "" : "s"}`}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={a.role === "owner" ? "good" : "neutral"}>
                    {a.role === "owner" ? "propietario" : "moderador"}
                  </Badge>
                  <Badge tone={a.active ? "good" : "bad"}>{a.active ? "activo" : "desactivado"}</Badge>
                  {!a.isOwner && (
                    <>
                      <Button
                        variant="soft"
                        size="sm"
                        loading={update.isPending}
                        onClick={() => update.mutate({ id: a.id, active: !a.active })}
                      >
                        {a.active ? "Desactivar" : "Activar"}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          const next = window.prompt(`Nueva contraseña para ${a.username} (mínimo 8 caracteres):`);
                          if (next && next.length >= 8) update.mutate({ id: a.id, password: next });
                          else if (next) toast.error("La contraseña debe tener al menos 8 caracteres.");
                        }}
                      >
                        Cambiar contraseña
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        loading={remove.isPending}
                        onClick={() => {
                          if (window.confirm(`¿Retirar el acceso a ${a.username}?`)) remove.mutate({ id: a.id });
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" strokeWidth={2.2} />
                      </Button>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>

          <Notice>
            La cuenta principal no se puede borrar ni desactivar: siempre podrás entrar aunque te
            equivoques con las demás.
          </Notice>
        </Card>

        <Card
          title="Intentos de entrada"
          subtitle="Quién ha intentado entrar y si lo consiguió"
          icon={<History className="h-4 w-4" strokeWidth={2} />}
        >
          {(data?.logins ?? []).length === 0 ? (
            <Empty title="Todavía no hay intentos registrados" />
          ) : (
            <ul className="divide-y divide-white/[0.05]">
              {(data?.logins ?? []).map((l) => (
                <li key={l.id} className="flex flex-wrap items-center gap-3 py-2.5">
                  <span
                    className={cn(
                      "h-2 w-2 shrink-0 rounded-full",
                      l.ok ? "bg-emerald-400" : "bg-red-400",
                    )}
                  />
                  <span className="font-mono text-[12.5px] text-white/75">{l.username}</span>
                  <span className="text-[12px] text-white/40">{when(l.createdAt)}</span>
                  {l.ip && <span className="font-mono text-[11.5px] text-white/30">{l.ip}</span>}
                  <span className={cn("ml-auto text-[11.5px]", l.ok ? "text-emerald-300/80" : "text-red-300/80")}>
                    {l.ok ? "entró" : (l.reason ?? "rechazado")}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card
        title="Dar acceso a alguien"
        subtitle="Se crea una cuenta nueva para esa persona"
        icon={<UserPlus className="h-4 w-4" strokeWidth={2} />}
      >
        <div className="space-y-4">
          <Field
            label="Para quién es"
            type="text"
            value={label}
            onChange={setLabel}
            placeholder="Juan · moderador"
            hint="Solo para que tú lo reconozcas en la lista."
          />
          <Field
            label="Usuario"
            type="text"
            value={username}
            onChange={setUsername}
            placeholder="juan"
            hint="Mínimo 3 caracteres, sin espacios."
          />
          <Field
            label="Contraseña"
            type="text"
            value={password}
            onChange={setPassword}
            placeholder="Mínimo 8 caracteres"
            hint="Pásasela a esa persona por un sitio privado. Podrás cambiarla luego."
          />

          <label className="block">
            <span className="mb-1.5 block text-[12px] font-medium text-white/60">Permisos</span>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as "owner" | "moderator")}
              className="w-full rounded-xl border border-white/12 bg-black/35 px-3 py-2.5 text-[13px] text-white focus:border-brand/60 focus:ring-2 focus:ring-brand/20 focus:outline-none"
            >
              <option value="moderator">Moderador · miembros, mensajes e historial</option>
              <option value="owner">Propietario · todo, incluidos los ajustes y los accesos</option>
            </select>
          </label>

          <Button
            className="w-full"
            loading={create.isPending}
            disabled={username.trim().length < 3 || password.length < 8}
            onClick={() => create.mutate({ username: username.trim(), password, label: label.trim() || undefined, role })}
          >
            <UserPlus className="h-4 w-4" strokeWidth={2.2} />
            Crear acceso
          </Button>

          <Notice tone="warn">
            El panel no es público: si nadie tiene cuenta, nadie entra. Puedes desactivar o borrar
            cualquier acceso cuando quieras y la persona pierde la entrada al instante.
          </Notice>
        </div>
      </Card>
    </div>
  );
}

/* ----------------------------------------------------------------- registro */

function ActionsTab() {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.bot.actions.useQuery({ limit: 80 }, { retry: false });
  const clear = trpc.bot.clearActions.useMutation({
    onSuccess: async () => {
      toast.success("Registro vaciado");
      await utils.bot.actions.invalidate();
    },
  });

  return (
    <Card
      title="Registro de acciones"
      subtitle="Todo lo que se ha hecho desde el panel, con quién y cuándo"
      icon={<History className="h-4 w-4" strokeWidth={2} />}
      action={
        <Button
          variant="ghost"
          size="sm"
          loading={clear.isPending}
          onClick={() => {
            if (window.confirm("¿Vaciar el registro de acciones?")) clear.mutate();
          }}
        >
          <Trash2 className="h-3.5 w-3.5" strokeWidth={2.2} />
          Vaciar
        </Button>
      }
    >
      {isLoading ? (
        <Loading label="Leyendo el registro…" />
      ) : (data ?? []).length === 0 ? (
        <Empty title="Todavía no se ha hecho nada desde el panel" />
      ) : (
        <ul className="divide-y divide-white/[0.05]">
          {(data ?? []).map((a) => (
            <li key={a.id} className="flex flex-wrap items-center gap-3 py-2.5">
              <span
                className={cn(
                  "grid h-7 w-7 shrink-0 place-items-center rounded-lg border",
                  a.ok
                    ? "border-white/12 bg-white/[0.04] text-white/50"
                    : "border-red-500/35 bg-red-500/12 text-red-300",
                )}
              >
                {a.ok ? <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={2.4} /> : <XCircle className="h-3.5 w-3.5" strokeWidth={2.4} />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] text-white/85">
                  <span className="font-mono text-[12px] text-brand-soft">{a.action}</span>
                  {a.target && <span className="text-white/40"> · {a.target}</span>}
                </span>
                {a.detail && <span className="mt-0.5 block truncate text-[12px] text-white/40">{a.detail}</span>}
                {a.error && <span className="mt-0.5 block text-[12px] text-red-300/80">{a.error}</span>}
              </span>
              <span className="text-[11.5px] text-white/35">
                {a.createdBy} · {when(a.createdAt)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------ comunes */

function Loading({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center gap-2.5 py-10 text-[13.5px] text-white/45">
      <Loader2 className="h-4 w-4 animate-spin text-brand" strokeWidth={2.4} />
      {label}
    </div>
  );
}
