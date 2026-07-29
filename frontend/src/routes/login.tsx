import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { Loader2, LogIn, Mail, Lock } from "lucide-react";
import { AuthLayout } from "@/components/auth-layout";
import { GoogleIcon } from "@/components/google-icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useAuth, authErrorMessage } from "@/lib/auth-context";
import { useElectronStore } from "@/lib/electron-store";

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>): { redirect?: string } => ({
    redirect: typeof search.redirect === "string" ? search.redirect : undefined,
  }),
  head: () => ({
    meta: [{ title: "Iniciar sesión · Electron Plus" }, { name: "robots", content: "noindex" }],
  }),
  component: LoginPage,
});

function LoginPage() {
  const { redirect } = Route.useSearch();
  const navigate = useNavigate();
  const { user, loading, redirectError, signInWithGoogle, signInWithEmail } = useAuth();
  const { isOps } = useElectronStore();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [googleSubmitting, setGoogleSubmitting] = useState(false);

  // Surfaces a failure from a completed signInWithRedirect() (the
  // popup-blocked fallback) once the page reloads after the round trip.
  useEffect(() => {
    if (redirectError) setError(authErrorMessage(redirectError));
  }, [redirectError]);

  // Fires once the Firebase session AND the backend profile are both ready —
  // covers both the Google popup and the email/password form the same way.
  // Admin/warehouse accounts land in the panel; clients go back to where
  // they came from (or the storefront).
  useEffect(() => {
    if (loading || !user) return;
    if (isOps) {
      navigate({ to: "/admin", replace: true });
      return;
    }
    // Don't send a non-ops account back into /admin — it would just bounce
    // off the guard again.
    navigate({ to: redirect && !redirect.startsWith("/admin") ? redirect : "/", replace: true });
  }, [loading, user, isOps, redirect, navigate]);

  const handleGoogle = async () => {
    setError(null);
    setGoogleSubmitting(true);
    try {
      await signInWithGoogle();
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setGoogleSubmitting(false);
    }
  };

  const handleEmailLogin = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await signInWithEmail(email, password);
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout
      title="Iniciar sesión"
      subtitle="Clientes y administradores acceden desde aquí."
      footer={
        <>
          ¿No tienes cuenta?{" "}
          <Link to="/register" className="font-semibold text-brand-yellow hover:underline">
            Regístrate
          </Link>
        </>
      }
    >
      <Button
        type="button"
        variant="outline"
        className="w-full gap-2"
        onClick={() => void handleGoogle()}
        disabled={googleSubmitting || submitting}
      >
        {googleSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <GoogleIcon />}
        Continuar con Google
      </Button>

      {error && (
        <div className="mt-4 rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="my-5 flex items-center gap-3">
        <Separator className="flex-1" />
        <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          o con tu correo
        </span>
        <Separator className="flex-1" />
      </div>

      <form onSubmit={handleEmailLogin} className="space-y-4">
        <div className="grid gap-1.5">
          <Label htmlFor="email" className="text-xs font-medium text-brand-navy">
            Correo
          </Label>
          <div className="relative">
            <Mail className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              placeholder="tucorreo@dominio.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="password" className="text-xs font-medium text-brand-navy">
            Contraseña
          </Label>
          <div className="relative">
            <Lock className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        <Button
          type="submit"
          className="w-full gap-2 bg-brand-blue text-white hover:bg-brand-blue/90"
          disabled={submitting || googleSubmitting}
        >
          {submitting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <LogIn className="h-4 w-4" />
          )}
          Iniciar sesión
        </Button>
      </form>
    </AuthLayout>
  );
}
