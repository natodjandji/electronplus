import { createFileRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { PublicShell } from "@/components/public-shell";
import { CircuitBackground } from "@/components/circuit-traces";
import { CONTACT_INFO } from "@/lib/contact-info";
import { absoluteUrl } from "@/lib/site-url";

/** Shown under the title; change it whenever the text below changes. */
const LAST_UPDATED = "21 de octubre de 2026";

/** Meta asks for a data deletion URL next to the privacy policy one; this
 * section's anchor is that URL. */
export const DATA_DELETION_ANCHOR = "eliminacion-de-datos";

const SECTIONS = [
  { id: "quienes-somos", title: "Quiénes somos" },
  { id: "datos", title: "Qué datos recogemos" },
  { id: "usos", title: "Para qué los usamos" },
  { id: "asistente", title: "Asistente automático en WhatsApp e Instagram" },
  { id: "proveedores", title: "Con quién los compartimos" },
  { id: "conservacion", title: "Cuánto tiempo los guardamos" },
  { id: "derechos", title: "Tus derechos" },
  { id: DATA_DELETION_ANCHOR, title: "Cómo pedir que eliminemos tus datos" },
  { id: "seguridad", title: "Seguridad" },
  { id: "cambios", title: "Cambios a esta política" },
] as const;

type SectionId = (typeof SECTIONS)[number]["id"];

export const Route = createFileRoute("/privacidad")({
  head: () => ({
    meta: [
      { title: "Política de privacidad · Electron Plus" },
      {
        name: "description",
        content:
          "Qué datos personales recoge Electron Plus en su tienda en línea, WhatsApp e Instagram, para qué los usa, con quién los comparte y cómo pedir que los eliminemos.",
      },
      { property: "og:title", content: "Política de privacidad · Electron Plus" },
      {
        property: "og:description",
        content: "Cómo Electron Plus recoge, usa y protege tus datos personales.",
      },
      { property: "og:url", content: absoluteUrl("/privacidad") },
    ],
    links: [{ rel: "canonical", href: absoluteUrl("/privacidad") }],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <PublicShell>
      <section className="relative overflow-hidden border-b border-border bg-white">
        <CircuitBackground className="opacity-70" />
        <div className="relative mx-auto max-w-3xl px-4 py-8 sm:px-6">
          <div className="text-xs font-semibold uppercase tracking-widest text-brand-blue">
            Legal
          </div>
          <h1 className="mt-1 text-3xl font-bold text-brand-navy">Política de privacidad</h1>
          <p className="mt-1 text-sm text-muted-foreground">Última actualización: {LAST_UPDATED}</p>
        </div>
      </section>

      <article className="mx-auto max-w-3xl px-4 py-8 text-sm leading-relaxed text-foreground/90 sm:px-6">
        <p>
          En Electron Plus cuidamos los datos que nos confías cuando compras en nuestra tienda en
          línea, nos escribes por WhatsApp o Instagram, o nos visitas en la tienda. Aquí explicamos
          qué datos recogemos, para qué los usamos y qué puedes hacer con ellos.
        </p>

        <nav
          aria-label="Contenido"
          className="mt-6 rounded-xl border border-border bg-brand-surface p-4"
        >
          <div className="text-xs font-semibold uppercase tracking-widest text-brand-blue">
            Contenido
          </div>
          <ol className="mt-2 list-decimal space-y-1 pl-5">
            {SECTIONS.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className="text-brand-blue hover:underline">
                  {s.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <Section id="quienes-somos">
          <p>
            Electron Plus es una tienda de iluminación, cables y materiales eléctricos ubicada en{" "}
            {CONTACT_INFO.addressLines.join(", ")}. Somos responsables de los datos personales que
            se recogen a través de nuestra tienda en línea, nuestros canales de WhatsApp e Instagram
            y nuestra tienda física.
          </p>
          <ContactLines />
        </Section>

        <Section id="datos">
          <p>Solo recogemos los datos que necesitamos para atenderte:</p>
          <List>
            <li>
              <strong>Tu cuenta:</strong> nombre, correo electrónico, teléfono, cédula o RIF y
              dirección. Si entras con Google, también recibimos tu nombre, correo y foto de perfil
              de tu cuenta de Google.
            </li>
            <li>
              <strong>Pedidos y cotizaciones:</strong> los productos, cantidades y montos, la forma
              de entrega y los datos de envío o retiro (nombre, teléfono, cédula o RIF y dirección).
            </li>
            <li>
              <strong>Pagos:</strong> el método que elegiste y, si pagas por transferencia o pago
              móvil, el comprobante que subes. Si pagas con PayPal o Cashea, los datos de pago los
              recibe esa plataforma; nosotros no recibimos ni guardamos los datos de tu tarjeta.
            </li>
            <li>
              <strong>Mensajes por WhatsApp e Instagram:</strong> tu nombre o usuario, tu número de
              teléfono o identificador de Instagram, y el contenido de los mensajes y fotos que nos
              envías.
            </li>
            <li>
              <strong>Reseñas:</strong> la calificación y el comentario que nos dejas, y tu nombre y
              teléfono si decides darlos.
            </li>
            <li>
              <strong>Datos técnicos:</strong> cuando algo falla en la página, registramos la
              dirección de la página y el error para poder corregirlo. Tu carrito y tu sesión se
              guardan en tu propio navegador.
            </li>
          </List>
          <p className="mt-3">
            No usamos herramientas de analítica ni píxeles o cookies de publicidad.
          </p>
        </Section>

        <Section id="usos">
          <List>
            <li>Procesar tus pedidos, pagos, entregas y devoluciones.</li>
            <li>
              Preparar cotizaciones y llevar el registro administrativo y fiscal de las ventas.
            </li>
            <li>
              Enviarte correos sobre tu cuenta y tus pedidos, como la confirmación de compra y los
              cambios de estado.
            </li>
            <li>Responder tus consultas por WhatsApp, Instagram, correo o en la tienda.</li>
            <li>Prevenir fraudes y mantener la seguridad de la tienda y de tu cuenta.</li>
            <li>Corregir errores y mejorar nuestro servicio.</li>
          </List>
          <p className="mt-3">No vendemos tus datos ni los usamos para publicidad de terceros.</p>
        </Section>

        <Section id="asistente">
          <p>
            Cuando nos escribes por WhatsApp o Instagram, puede responderte un asistente automático
            basado en inteligencia artificial (Claude, de la empresa Anthropic). El asistente lee
            los mensajes y fotos de esa conversación para buscar productos en nuestro catálogo,
            darte precios, métodos de pago y costos de envío, y prepararte un enlace de compra.
          </p>
          <p className="mt-3">
            Una persona de nuestro equipo puede leer la conversación y tomarla en cualquier momento.
            Si prefieres que te atienda una persona, pídelo en el mismo chat y el asistente dejará
            de responder.
          </p>
        </Section>

        <Section id="proveedores">
          <p>
            Compartimos datos solo con los proveedores que necesitamos para operar, y solo lo
            necesario para cada servicio:
          </p>
          <List>
            <li>
              <strong>Google (Firebase y Google Cloud):</strong> alojamiento de la tienda, base de
              datos, inicio de sesión y almacenamiento de archivos.
            </li>
            <li>
              <strong>Cloudflare:</strong> entrega de la página y protección contra ataques.
            </li>
            <li>
              <strong>Meta (WhatsApp e Instagram):</strong> el envío y la recepción de los mensajes
              en esos canales.
            </li>
            <li>
              <strong>Anthropic:</strong> el asistente automático de WhatsApp e Instagram.
            </li>
            <li>
              <strong>PayPal y Cashea:</strong> el procesamiento del pago, solo si eliges esos
              métodos.
            </li>
            <li>
              <strong>Resend:</strong> el envío de los correos sobre tu cuenta y tus pedidos.
            </li>
            <li>
              <strong>La empresa de envíos</strong> que despacha tu pedido, cuando eliges envío:
              nombre, teléfono y dirección de entrega.
            </li>
          </List>
          <p className="mt-3">
            También podemos entregar datos a las autoridades cuando la ley nos lo exija.
          </p>
        </Section>

        <Section id="conservacion">
          <p>
            Guardamos los datos de tu cuenta mientras la tengas activa. Los registros de pedidos,
            pagos y facturación los conservamos el tiempo que exigen las obligaciones fiscales y
            contables. Las conversaciones por WhatsApp e Instagram las guardamos mientras sean
            útiles para atenderte y darle seguimiento a tus pedidos.
          </p>
        </Section>

        <Section id="derechos">
          <p>
            Puedes pedirnos en cualquier momento que te digamos qué datos tenemos sobre ti, que los
            corrijamos o que los eliminemos. Escríbenos por correo o por WhatsApp y te responderemos
            por el mismo medio.
          </p>
        </Section>

        <Section id={DATA_DELETION_ANCHOR}>
          <p>Para pedir que eliminemos tus datos personales:</p>
          <ol className="mt-3 list-decimal space-y-2 pl-5">
            <li>
              Escríbenos a{" "}
              <a href={CONTACT_INFO.emailHref} className="text-brand-blue hover:underline">
                {CONTACT_INFO.email}
              </a>{" "}
              con el asunto «Eliminar mis datos», o pídelo por{" "}
              <a
                href={CONTACT_INFO.whatsappHref}
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand-blue hover:underline"
              >
                WhatsApp
              </a>
              .
            </li>
            <li>
              Indica el correo de tu cuenta, el número de teléfono o el usuario de Instagram con el
              que nos escribiste, para que podamos encontrar tus datos.
            </li>
            <li>
              Eliminaremos tu cuenta, tus conversaciones y los demás datos personales que tengamos
              sobre ti, y te confirmaremos por el mismo medio cuando esté hecho.
            </li>
          </ol>
          <p className="mt-3">
            Solo conservaremos lo que la ley nos obligue a guardar, como los registros fiscales de
            las compras que hayas hecho.
          </p>
        </Section>

        <Section id="seguridad">
          <p>
            La tienda funciona siempre con conexión cifrada (HTTPS). Solo el personal autorizado de
            Electron Plus puede ver tus datos, y cada persona ve únicamente lo que necesita para su
            trabajo.
          </p>
        </Section>

        <Section id="cambios">
          <p>
            Si cambiamos esta política, publicaremos aquí la nueva versión con su fecha de
            actualización.
          </p>
          <ContactLines />
        </Section>
      </article>
    </PublicShell>
  );
}

function Section({ id, children }: { id: SectionId; children: ReactNode }) {
  const title = SECTIONS.find((s) => s.id === id)!.title;
  return (
    <section id={id} className="mt-8 scroll-mt-24">
      <h2 className="text-lg font-semibold text-brand-navy">{title}</h2>
      <div className="mt-2">{children}</div>
    </section>
  );
}

function List({ children }: { children: ReactNode }) {
  return <ul className="mt-3 list-disc space-y-2 pl-5">{children}</ul>;
}

function ContactLines() {
  return (
    <p className="mt-3">
      Para cualquier pregunta sobre tus datos, escríbenos a{" "}
      <a href={CONTACT_INFO.emailHref} className="text-brand-blue hover:underline">
        {CONTACT_INFO.email}
      </a>{" "}
      o por WhatsApp al{" "}
      <a
        href={CONTACT_INFO.whatsappHref}
        target="_blank"
        rel="noopener noreferrer"
        className="text-brand-blue hover:underline"
      >
        {CONTACT_INFO.phone}
      </a>
      .
    </p>
  );
}
