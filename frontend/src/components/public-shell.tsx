import type { ReactNode } from "react";
import { SiteHeader } from "./site-header";
import { SiteFooter } from "./site-footer";
import { CircuitDivider } from "./circuit-traces";
import { PageTransition } from "./motion-primitives";
import { MascotChatWidget } from "./mascot-chat-widget";

export function PublicShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteHeader />
      <main className="flex-1">
        <PageTransition>{children}</PageTransition>
      </main>
      <CircuitDivider />
      <SiteFooter />
      <MascotChatWidget />
    </div>
  );
}
