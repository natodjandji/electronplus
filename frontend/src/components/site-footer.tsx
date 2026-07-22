import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { ElectronLogo } from "./electron-logo";
import { CONTACT_INFO } from "@/lib/contact-info";

type StoreLink = { label: string; to: "/catalog" | "/quotes" };

// "Ofertas" and "Envíos" don't have dedicated pages yet — point them at the
// catalog (where current stock/pricing actually lives) instead of a dead link.
const STORE_LINKS: StoreLink[] = [
  { label: "Catálogo", to: "/catalog" },
  { label: "Ofertas", to: "/catalog" },
  { label: "Cotizaciones", to: "/quotes" },
  { label: "Envíos", to: "/catalog" },
];

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-border bg-brand-navy text-white">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-4">
        <div className="md:col-span-2">
          <ElectronLogo layout="full" tone="white" className="h-9" />
          <p className="mt-4 max-w-sm text-sm text-white/70">
            Tu proveedor confiable de iluminación, cables y materiales eléctricos. Atención detal,
            mayorista y proyectos.
          </p>
        </div>

        <FooterCol title="Tienda">
          {STORE_LINKS.map((item) => (
            <li key={item.label}>
              <Link to={item.to} className="transition-colors hover:text-white">
                {item.label}
              </Link>
            </li>
          ))}
        </FooterCol>

        <FooterCol title="Contacto">
          <li>
            <a
              href={CONTACT_INFO.whatsappHref}
              target="_blank"
              rel="noopener noreferrer"
              className="transition-colors hover:text-white"
            >
              {CONTACT_INFO.phone}
            </a>
          </li>
          <li>
            <a
              href={CONTACT_INFO.gmailComposeHref}
              target="_blank"
              rel="noopener noreferrer"
              className="transition-colors hover:text-white"
            >
              {CONTACT_INFO.email}
            </a>
          </li>
          <li>{CONTACT_INFO.hours}</li>
        </FooterCol>
      </div>
      <div className="border-t border-white/10 px-4 py-4 text-center text-xs text-white/60 sm:px-6">
        © {new Date().getFullYear()} Electron Plus. Todos los derechos reservados.
      </div>
    </footer>
  );
}

function FooterCol({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-widest text-brand-yellow">
        {title}
      </div>
      <ul className="mt-3 space-y-2 text-sm text-white/80">{children}</ul>
    </div>
  );
}
