import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { useEffect, useState } from "react";
import { Route, Switch, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import PanelAccess from "./components/PanelAccess";
import BotPanel from "./pages/BotPanel";
import Panel from "./pages/Panel";
import Verify from "./pages/Verify";

/** Rutas que solo se ven con sesión abierta en el panel privado. */
const PRIVATE_ROUTES = ["/panel", "/bot"];

function Router() {
  const [location, navigate] = useLocation();
  const [loginOpen, setLoginOpen] = useState(false);

  // Solo se pide entrar si no hay sesión. Si ya la hay, la ruta privada se abre
  // directamente: recargar la página no vuelve a pedir la contraseña.
  const me = trpc.bot.me.useQuery(undefined, { retry: false, staleTime: 30_000 });

  useEffect(() => {
    const isPrivate = PRIVATE_ROUTES.some((r) => location.startsWith(r));
    if (isPrivate && me.isFetched && !me.data) setLoginOpen(true);
  }, [location, me.isFetched, me.data]);

  return (
    <>
      <Switch>
        {/* Verificación: la raíz también recibe la respuesta de Discord (?code=…). */}
        <Route path={"/"} component={Verify} />
        <Route path={"/panel"}>
          <Panel />
        </Route>
        <Route path={"/bot"}>
          <BotPanel onRequestLogin={() => setLoginOpen(true)} />
        </Route>
        <Route path={"/404"} component={NotFound} />
        <Route component={NotFound} />
      </Switch>

      {/* Acceso privado: solo aparece al pedirlo o al entrar a una ruta privada. */}
      <PanelAccess
        open={loginOpen}
        onClose={() => {
          setLoginOpen(false);
          if (PRIVATE_ROUTES.some((r) => location.startsWith(r))) navigate("/");
        }}
        onSuccess={() => {
          setLoginOpen(false);
          // Se recarga para que el panel lea la sesión recién creada.
          window.location.reload();
        }}
      />
    </>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          <Toaster
            position="bottom-center"
            toastOptions={{
              classNames: {
                toast:
                  "!bg-[#14131d] !border-white/15 !text-white !shadow-[0_10px_30px_rgba(0,0,0,.5)]",
                description: "!text-white/60",
              },
            }}
          />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
