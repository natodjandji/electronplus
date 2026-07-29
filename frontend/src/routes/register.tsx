import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { Loader2, UserPlus, Mail, Lock, User } from "lucide-react";
import { AuthLayout } from "@/components/auth-layout";
import { GoogleIcon } from "@/components/google-icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useAuth, authErrorMessage } from "@/lib/auth-context";
import { useElectronStore } from "@/lib/electron-store";

export const Route = createFileRoute("/register")({
  head: () => ({
    meta: [{ title: "Crear cuenta · Electron Plus" }, { name: "robots", content: "noindex" }],
  }),
  component: RegisterPage,
});

// New accounts always start as client — the backend rejects any other role
// at signup (see firestore.rules `users` create rule). Admin/warehouse
// access is granted afterwards by an administrator.
function RegisterPage() {
  const navigate = useNavigate();
  const { user, loading, redirectError, signInWithGoogle, registerWithEmail } = useAuth();
  const { isOps } = useElectronStore();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [googleSubmitting, setGoogleSubmitting] = useState(false);

  useEffect(() => {
    if (loading || !user) return;
    navigate({ to: isOps ? "/admin" : "/", replace: true });
  }, [loading, user, isOps, navigate]);

  // Surfaces a failure from a completed signInWithRedirect() (the
  // popup-blocked fallback) once the page reloads after the round trip.
  useEffect(() => {
    if (redirectError) setError(authErrorMessage(redirectError));
  }, [redirectError]);

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

  const handleRegister = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password !== confirmPassword) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    setSubmitting(true);
    try {
      await registerWithEmail(name, email, password);
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout
      title="Crear cuenta"
      subtitle="Regístrate para cotizar, comprar y llevar seguimiento de tus pedidos."
      footer={
        <>
          ¿Ya tienes cuenta?{" "}
          <Link to="/login" className="font-semibold text-brand-yellow hover:underline">
            Inicia sesión
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
        Registrarme con Google
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

      <form onSubmit={handleRegister} className="space-y-4">
        <div className="grid gap-1.5">
          <Label htmlFor="name" className="text-xs font-medium text-brand-navy">
            Nombre completo
          </Label>
          <div className="relative">
            <User className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              id="name"
              autoComplete="name"
              required
              placeholder="María Pérez"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

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

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="password" className="text-xs font-medium text-brand-navy">
              Contraseña
            </Label>
            <div className="relative">
              <Lock className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                required
                minLength={6}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="confirmPassword" className="text-xs font-medium text-brand-navy">
              Confirmar
            </Label>
            <div className="relative">
              <Lock className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                id="confirmPassword"
                type="password"
                autoComplete="new-password"
                required
                minLength={6}
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="pl-9"
              />
            </div>
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
            <UserPlus className="h-4 w-4" />
          )}
          Crear cuenta
        </Button>
      </form>
    </AuthLayout>
  );
}
