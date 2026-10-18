import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { CheckCircle2, Loader2, Star } from "lucide-react";
import { ElectronLogo } from "@/components/electron-logo";
import { PhoneField } from "@/components/phone-field";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch, reportError } from "@/lib/api-client";
import { OTHER_SOURCE_ID, RATING_LABELS, type ReviewForm } from "@/lib/reviews";
import { cn } from "@/lib/utils";
import { formatPhone, validatePhoneNumber, type PhonePrefix } from "@/lib/venezuelan-phone";

export const Route = createFileRoute("/resena")({
  head: () => ({
    meta: [
      { title: "¿Cómo te atendimos? · Electron Plus" },
      { name: "description", content: "Cuéntanos cómo fue tu visita a la tienda Electron Plus." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: ReviewPage,
});

const MESSAGE_MAX = 1000;

/** Where the QR at the store leads: how they found the store, how they were
 * attended, and anything else they want to say. No account needed. */
function ReviewPage() {
  const form = useQuery({
    queryKey: ["review-form"],
    queryFn: () => apiFetch<ReviewForm>("/reviews/form"),
    staleTime: 5 * 60_000,
  });

  const [sourceId, setSourceId] = useState<string | null>(null);
  const [sourceOther, setSourceOther] = useState("");
  const [rating, setRating] = useState(0);
  const [sellerId, setSellerId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [phonePrefix, setPhonePrefix] = useState<PhonePrefix>("0414");
  const [phoneNumber, setPhoneNumber] = useState("");
  // Hidden from people; a bot that fills every field fills this one too.
  const [website, setWebsite] = useState("");

  const send = useMutation({
    mutationFn: () =>
      apiFetch("/reviews", {
        method: "POST",
        body: {
          rating,
          sourceId,
          sourceOther: sourceId === OTHER_SOURCE_ID ? sourceOther : undefined,
          sellerId: sellerId ?? undefined,
          message: message || undefined,
          customerName: customerName || undefined,
          customerPhone: formatPhone(phonePrefix, phoneNumber),
          website: website || undefined,
        },
      }),
    onError: reportError,
  });

  const phoneValid = validatePhoneNumber(phoneNumber).valid;
  const canSend = Boolean(sourceId) && rating > 0 && phoneValid && !send.isPending;

  return (
    <div className="min-h-dvh bg-brand-surface">
      <header className="bg-brand-blue px-4 pb-16 pt-6 text-white">
        <div className="mx-auto max-w-lg">
          <Link to="/" aria-label="Ir a la tienda en línea" className="inline-block">
            <ElectronLogo layout="full" tone="white" className="h-8" />
          </Link>
          {!send.isSuccess && (
            <>
              <h1 className="mt-6 text-2xl font-bold">¿Cómo te atendimos?</h1>
              <p className="mt-1 text-sm text-white/80">
                Tu opinión nos ayuda a mejorar. Te toma menos de un minuto.
              </p>
            </>
          )}
        </div>
      </header>

      <main className="mx-auto -mt-10 max-w-lg px-4 pb-12">
        {send.isSuccess ? (
          <ThankYou />
        ) : form.isLoading ? (
          <Card className="space-y-4 p-5">
            <Skeleton className="h-5 w-56" />
            <div className="flex flex-wrap gap-2">
              {Array.from({ length: 6 }, (_, i) => (
                <Skeleton key={i} className="h-11 w-28 rounded-full" />
              ))}
            </div>
          </Card>
        ) : form.isError || !form.data ? (
          <Card className="p-6 text-center text-sm text-muted-foreground">
            No pudimos cargar el formulario. Revisa tu conexión e inténtalo de nuevo.
            <Button variant="outline" className="mt-4 w-full" onClick={() => form.refetch()}>
              Reintentar
            </Button>
          </Card>
        ) : (
          <Card className="p-5 sm:p-6">
            <form
              className="space-y-8"
              onSubmit={(e) => {
                e.preventDefault();
                if (canSend) send.mutate();
              }}
            >
              <Question title="¿Cómo llegaste a Electron Plus?">
                <div className="flex flex-wrap gap-2">
                  {form.data.sources.map((source) => (
                    <Chip
                      key={source.id}
                      selected={sourceId === source.id}
                      onClick={() => setSourceId(source.id)}
                    >
                      {source.label}
                    </Chip>
                  ))}
                </div>
                {sourceId === OTHER_SOURCE_ID && (
                  <Input
                    className="mt-3"
                    value={sourceOther}
                    onChange={(e) => setSourceOther(e.target.value)}
                    maxLength={120}
                    placeholder="Cuéntanos cómo (opcional)"
                    aria-label="¿Cómo llegaste? Otro"
                    autoFocus
                  />
                )}
              </Question>

              <Question title="¿Cómo calificarías la atención que recibiste?">
                <StarRating value={rating} onChange={setRating} />
              </Question>

              {form.data.sellers.length > 0 && (
                <Question title="¿Quién te atendió?" optional>
                  <div className="flex flex-wrap gap-2">
                    {form.data.sellers.map((seller) => (
                      <Chip
                        key={seller.id}
                        selected={sellerId === seller.id}
                        onClick={() => setSellerId(sellerId === seller.id ? null : seller.id)}
                      >
                        {seller.name}
                      </Chip>
                    ))}
                  </div>
                </Question>
              )}

              <Question title="¿Quieres contarnos algo más?" optional>
                <Textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  maxLength={MESSAGE_MAX}
                  rows={4}
                  placeholder="Lo que te gustó, lo que podemos mejorar…"
                  aria-label="Mensaje"
                />
                {message.length > MESSAGE_MAX * 0.8 && (
                  <p className="mt-1 text-right text-xs text-muted-foreground">
                    {message.length}/{MESSAGE_MAX}
                  </p>
                )}
              </Question>

              <Question
                title="¿Quieres que te contactemos?"
                optional
                hint="Déjanos tus datos solo si quieres que te escribamos."
              >
                <div className="grid gap-3">
                  <Field className="grid gap-1.5">
                    <Label className="text-xs font-medium text-brand-navy">Nombre</Label>
                    <Input
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      maxLength={80}
                      autoComplete="name"
                    />
                  </Field>
                  <PhoneField
                    prefix={phonePrefix}
                    onPrefixChange={setPhonePrefix}
                    number={phoneNumber}
                    onNumberChange={setPhoneNumber}
                  />
                </div>
              </Question>

              <input
                type="text"
                name="website"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                tabIndex={-1}
                autoComplete="off"
                aria-hidden="true"
                className="absolute -left-[9999px] h-px w-px opacity-0"
              />

              <div>
                <Button
                  type="submit"
                  size="lg"
                  disabled={!canSend}
                  className="h-12 w-full gap-2 bg-brand-blue text-base text-white hover:bg-brand-blue/90"
                >
                  {send.isPending && <Loader2 className="h-5 w-5 animate-spin" />}
                  Enviar reseña
                </Button>
                {(!sourceId || rating === 0) && (
                  <p className="mt-2 text-center text-xs text-muted-foreground">
                    Elige cómo llegaste y califica la atención para enviar.
                  </p>
                )}
              </div>
            </form>
          </Card>
        )}
      </main>
    </div>
  );
}

function Question({
  title,
  optional = false,
  hint,
  children,
}: {
  title: string;
  optional?: boolean;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <fieldset>
      <legend className="text-base font-semibold text-brand-navy">
        {title}
        {optional && (
          <span className="ml-2 text-xs font-normal text-muted-foreground">Opcional</span>
        )}
      </legend>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
      <div className="mt-3">{children}</div>
    </fieldset>
  );
}

function Chip({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        "min-h-11 rounded-full border px-4 py-2 text-sm font-medium transition-[background-color,border-color,color,transform] duration-150 ease-out active:scale-[0.97]",
        selected
          ? "border-brand-blue bg-brand-blue text-white"
          : "border-border bg-white text-brand-navy hover:border-brand-blue/50",
      )}
    >
      {children}
    </button>
  );
}

function StarRating({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  // Previews the rating under the pointer on a computer; a phone just taps.
  const [hover, setHover] = useState(0);
  const shown = hover || value;
  return (
    <div>
      <div
        role="radiogroup"
        aria-label="Calificación de la atención"
        className="flex gap-1"
        onPointerLeave={() => setHover(0)}
      >
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={`${n} de 5: ${RATING_LABELS[n]}`}
            onClick={() => onChange(n)}
            onPointerEnter={(e) => e.pointerType === "mouse" && setHover(n)}
            className="grid h-12 w-12 place-items-center rounded-md transition-transform duration-150 ease-out active:scale-90"
          >
            <Star
              className={cn(
                "h-9 w-9 transition-colors duration-150",
                n <= shown ? "fill-brand-yellow text-brand-yellow" : "text-muted-foreground/40",
              )}
            />
          </button>
        ))}
      </div>
      <p className="mt-1 h-5 text-sm font-medium text-brand-navy" aria-live="polite">
        {shown > 0 ? RATING_LABELS[shown] : ""}
      </p>
    </div>
  );
}

function ThankYou() {
  return (
    <Card className="p-8 text-center">
      <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" />
      <h1 className="mt-4 text-xl font-bold text-brand-navy">¡Gracias por tu reseña!</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        La leemos todas para mejorar la atención en la tienda. ¡Te esperamos pronto!
      </p>
      <Button asChild className="mt-6 w-full bg-brand-blue text-white hover:bg-brand-blue/90">
        <Link to="/catalog">Ver el catálogo</Link>
      </Button>
    </Card>
  );
}
