import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { ElectronLogo } from "./electron-logo";
import { CircuitBackground } from "./circuit-traces";
import { PageTransition } from "./motion-primitives";
import { Card } from "@/components/ui/card";

/**
 * Shared shell for /login and /register — deliberately not PublicShell:
 * this is the entry point itself, so it drops the full nav/header (no point
 * showing a second "Iniciar sesión" affordance on the sign-in page).
 */
export function AuthLayout({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-brand-navy px-4 py-10">
      <div className="absolute inset-x-0 top-0 h-44 opacity-50">
        <CircuitBackground />
      </div>
      <div className="absolute inset-x-0 bottom-0 h-44 rotate-180 opacity-30">
        <CircuitBackground />
      </div>

      <Link
        to="/"
        className="absolute left-4 top-4 z-10 inline-flex items-center gap-2 text-sm text-white/70 transition-colors hover:text-white sm:left-6 sm:top-6"
      >
        <ArrowLeft className="h-4 w-4" />
        Volver a la tienda
      </Link>

      <PageTransition>
        <div className="relative w-full max-w-md">
          <div className="mb-6 flex justify-center">
            <ElectronLogo layout="full" tone="white" className="h-9" />
          </div>

          <Card className="p-6 sm:p-8">
            <div className="text-center">
              <h1 className="text-2xl font-bold text-brand-navy">{title}</h1>
              <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
            </div>
            <div className="mt-6">{children}</div>
          </Card>

          <p className="mt-5 text-center text-sm text-white/60">{footer}</p>
        </div>
      </PageTransition>
    </div>
  );
}
