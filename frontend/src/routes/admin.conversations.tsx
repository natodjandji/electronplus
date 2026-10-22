import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Bell,
  BellOff,
  Bot,
  CircleAlert,
  ExternalLink,
  Instagram,
  Loader2,
  MessagesSquare,
  PauseCircle,
  PlayCircle,
  Settings2,
  ShoppingBag,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { AdminShell } from "@/components/admin-shell";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { CardListSkeleton } from "@/components/table-skeleton";
import { WhatsappIcon } from "@/components/whatsapp-icon";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch, reportError } from "@/lib/api-client";
import {
  conversationsKey,
  customerLabel,
  EFFORT_OPTIONS,
  formatAlertPhones,
  isPaused,
  messagingSettingsKey,
  MODEL_OPTIONS,
  parseAlertPhones,
  whatsappChatHref,
  type ChatChannel,
  type ChatConversation,
  type ChatMessage,
  type MessagingSettings,
  type MessagingStatus,
} from "@/lib/conversations";
import { formatMoney } from "@/lib/electron-store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/conversations")({
  head: () => ({
    meta: [
      { title: "Conversaciones · Admin Electron Plus" },
      {
        name: "description",
        content: "Chats de WhatsApp e Instagram que atiende el asistente de ventas.",
      },
    ],
  }),
  component: ConversationsPage,
});

interface SettingsResponse {
  settings: MessagingSettings;
  status: MessagingStatus;
}

function formatTime(iso: string) {
  const date = new Date(iso);
  const sameDay = date.toDateString() === new Date().toDateString();
  return date.toLocaleString(
    "es-VE",
    sameDay ? { hour: "numeric", minute: "2-digit" } : { day: "numeric", month: "short" },
  );
}

function ChannelIcon({
  channel,
  className = "h-4 w-4",
}: {
  channel: ChatChannel;
  className?: string;
}) {
  return channel === "whatsapp" ? (
    <WhatsappIcon className={className} />
  ) : (
    <Instagram className={cn(className, "text-[#d62976]")} aria-hidden="true" />
  );
}

function ConversationsPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const { data: config } = useQuery({
    queryKey: messagingSettingsKey,
    queryFn: () => apiFetch<SettingsResponse>("/admin/messaging/settings"),
  });
  const { data: conversations, isLoading } = useQuery({
    queryKey: conversationsKey,
    queryFn: () => apiFetch<ChatConversation[]>("/admin/messaging/conversations"),
    refetchInterval: 20_000,
  });
  const selected = conversations?.find((c) => c.id === selectedId) ?? null;
  const waiting = conversations?.filter((c) => c.needsAttention).length ?? 0;

  return (
    <AdminShell title="Conversaciones">
      <AssistantBar
        config={config}
        waiting={waiting}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <Card className={cn("overflow-hidden", selected && "hidden lg:block")}>
          {isLoading ? (
            <div className="p-3">
              <CardListSkeleton rows={6} />
            </div>
          ) : !conversations?.length ? (
            <EmptyList />
          ) : (
            <ul className="max-h-[70vh] divide-y overflow-y-auto">
              {conversations.map((c) => (
                <li key={c.id}>
                  <ConversationRow
                    conversation={c}
                    active={c.id === selectedId}
                    onSelect={() => setSelectedId(c.id)}
                  />
                </li>
              ))}
            </ul>
          )}
        </Card>

        {selected ? (
          <ConversationThread conversation={selected} onBack={() => setSelectedId(null)} />
        ) : (
          <Card className="hidden min-h-[24rem] place-items-center p-8 text-center text-sm text-muted-foreground lg:grid">
            <div>
              <MessagesSquare className="mx-auto mb-3 h-8 w-8 text-brand-blue/40" />
              Elige una conversación para ver los mensajes.
            </div>
          </Card>
        )}
      </div>

      {config && (
        <SettingsDialog
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          settings={config.settings}
          whatsappReady={config.status.whatsapp}
        />
      )}
    </AdminShell>
  );
}

function AssistantBar({
  config,
  waiting,
  onOpenSettings,
}: {
  config?: SettingsResponse;
  waiting: number;
  onOpenSettings: () => void;
}) {
  const queryClient = useQueryClient();
  const toggle = useMutation({
    mutationFn: (botEnabled: boolean) =>
      apiFetch<SettingsResponse>("/admin/messaging/settings", {
        method: "PUT",
        body: { botEnabled },
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(messagingSettingsKey, data);
      toast.success(data.settings.botEnabled ? "Asistente encendido" : "Asistente apagado");
    },
    onError: (error) => reportError(error),
  });

  const status = config?.status;
  const missing = status
    ? [
        !status.assistant && "la clave de Claude",
        !status.webhook && "el webhook de Meta",
        !status.whatsapp && !status.instagram && "un canal (WhatsApp o Instagram)",
      ].filter(Boolean)
    : [];

  return (
    <Card className="flex flex-wrap items-center justify-between gap-4 p-4">
      <div className="flex min-w-0 items-center gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-blue/10 text-brand-blue">
          <Bot className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="font-semibold text-brand-navy">Asistente de ventas</p>
          <p className="text-sm text-muted-foreground">
            {missing.length > 0
              ? `Falta configurar ${missing.join(", ")}.`
              : config?.settings.botEnabled
                ? "Responde en WhatsApp e Instagram y pasa a una persona cuando hace falta."
                : "Apagado: los mensajes se guardan aquí, pero nadie los responde automáticamente."}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {waiting > 0 && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-destructive/10 px-3 py-1 text-xs font-semibold text-destructive">
            <CircleAlert className="h-3.5 w-3.5" />
            {waiting} {waiting === 1 ? "cliente espera" : "clientes esperan"} a una persona
          </span>
        )}
        <Field className="flex items-center gap-2">
          <Switch
            checked={config?.settings.botEnabled ?? false}
            disabled={!config || toggle.isPending}
            onCheckedChange={(checked) => toggle.mutate(checked)}
          />
          <Label className="text-sm font-medium">Encendido</Label>
        </Field>
        <Button variant="outline" className="gap-2" onClick={onOpenSettings} disabled={!config}>
          <Settings2 className="h-4 w-4" />
          Ajustes
        </Button>
      </div>
    </Card>
  );
}

function EmptyList() {
  return (
    <div className="p-8 text-center text-sm text-muted-foreground">
      <MessagesSquare className="mx-auto mb-3 h-8 w-8 text-brand-blue/40" />
      Todavía no hay conversaciones. Cuando un cliente escriba por WhatsApp o Instagram, aparece
      aquí.
    </div>
  );
}

function ConversationRow({
  conversation: c,
  active,
  onSelect,
}: {
  conversation: ChatConversation;
  active: boolean;
  onSelect: () => void;
}) {
  const paused = isPaused(c);
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/60",
        active && "bg-brand-blue/5",
      )}
    >
      <ChannelIcon channel={c.channel} className="mt-0.5 h-5 w-5 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p className="truncate font-medium text-brand-navy">{customerLabel(c)}</p>
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
            {formatTime(c.lastMessageAt)}
          </span>
        </div>
        <p className="truncate text-sm text-muted-foreground">{c.lastMessagePreview}</p>
        {(c.needsAttention || paused) && (
          <span
            className={cn(
              "mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold",
              c.needsAttention
                ? "bg-destructive/10 text-destructive"
                : "bg-muted text-muted-foreground",
            )}
          >
            {c.needsAttention
              ? "Espera a una persona"
              : c.pauseReason === "manual"
                ? "Asistente pausado"
                : "Atiende una persona"}
          </span>
        )}
      </div>
    </button>
  );
}

const PAUSE_LABEL: Record<NonNullable<ChatConversation["pauseReason"]>, string> = {
  human_reply: "Una persona respondió desde el teléfono o Instagram: el asistente espera.",
  handoff: "El asistente pasó este chat a una persona.",
  manual: "Pausado desde el panel.",
};

function ConversationThread({
  conversation: c,
  onBack,
}: {
  conversation: ChatConversation;
  onBack: () => void;
}) {
  const queryClient = useQueryClient();
  const bottomRef = useRef<HTMLDivElement>(null);
  const { data: messages, isLoading } = useQuery({
    queryKey: [...conversationsKey, c.id, "messages"],
    queryFn: () =>
      apiFetch<ChatMessage[]>(
        `/admin/messaging/conversations/${encodeURIComponent(c.id)}/messages`,
      ),
    refetchInterval: 10_000,
  });
  const paused = isPaused(c);

  const setPaused = useMutation({
    mutationFn: (pause: boolean) =>
      apiFetch<void>(`/admin/messaging/conversations/${encodeURIComponent(c.id)}`, {
        method: "PATCH",
        body: { paused: pause },
      }),
    onSuccess: (_, pause) => {
      void queryClient.invalidateQueries({ queryKey: conversationsKey });
      toast.success(
        pause ? "El asistente no responderá en este chat" : "El asistente vuelve a responder",
      );
    },
    onError: (error) => reportError(error),
  });

  const setNoticesOff = useMutation({
    mutationFn: (off: boolean) =>
      apiFetch<void>(`/admin/messaging/conversations/${encodeURIComponent(c.id)}`, {
        method: "PATCH",
        body: { noticesOff: off },
      }),
    onSuccess: (_, off) => {
      void queryClient.invalidateQueries({ queryKey: conversationsKey });
      toast.success(
        off
          ? "Este cliente ya no recibirá avisos de pedidos ni cotizaciones"
          : "Este cliente vuelve a recibir avisos de pedidos y cotizaciones",
      );
    },
    onError: (error) => reportError(error),
  });

  const remove = useMutation({
    mutationFn: () =>
      apiFetch<void>(`/admin/messaging/conversations/${encodeURIComponent(c.id)}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      onBack();
      void queryClient.invalidateQueries({ queryKey: conversationsKey });
      toast.success("Chat eliminado");
    },
    onError: (error) => reportError(error),
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages?.length]);

  return (
    <Card className="flex min-h-[24rem] flex-col overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 border-b px-4 py-3">
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden"
          onClick={onBack}
          aria-label="Volver"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <ChannelIcon channel={c.channel} className="h-5 w-5" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-brand-navy">{customerLabel(c)}</p>
          {c.channel === "whatsapp" && c.customerName && (
            <p className="text-xs text-muted-foreground">+{c.customerId}</p>
          )}
        </div>
        {c.channel === "whatsapp" && (
          <Button asChild variant="outline" size="sm" className="gap-1.5">
            <a href={whatsappChatHref(c.customerId)} target="_blank" rel="noreferrer">
              <ExternalLink className="h-3.5 w-3.5" />
              WhatsApp
            </a>
          </Button>
        )}
        {c.channel === "whatsapp" && (
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            title="Avisos de pedidos y cotizaciones por WhatsApp"
            disabled={setNoticesOff.isPending}
            onClick={() => setNoticesOff.mutate(!c.noticesOff)}
          >
            {c.noticesOff ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
            {c.noticesOff ? "Activar avisos" : "Desactivar avisos"}
          </Button>
        )}
        <Button
          size="sm"
          variant={paused ? "default" : "outline"}
          className="gap-1.5"
          disabled={setPaused.isPending}
          onClick={() => setPaused.mutate(!paused)}
        >
          {paused ? <PlayCircle className="h-4 w-4" /> : <PauseCircle className="h-4 w-4" />}
          {paused ? "Reanudar asistente" : "Pausar asistente"}
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              size="icon"
              variant="outline"
              className="h-8 w-8 text-destructive hover:text-destructive"
              disabled={remove.isPending}
              aria-label="Eliminar chat"
              title="Eliminar chat"
            >
              {remove.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Eliminar el chat con {customerLabel(c)}?</AlertDialogTitle>
              <AlertDialogDescription>
                Se borran del panel todos sus mensajes y no se puede deshacer. El cliente conserva
                la conversación en su {c.channel === "whatsapp" ? "WhatsApp" : "Instagram"}, y si
                vuelve a escribir se abre un chat nuevo.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => remove.mutate()}
                className="bg-destructive text-white hover:bg-destructive/90"
              >
                Eliminar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      {paused && c.pauseReason && (
        <div
          className={cn(
            "border-b px-4 py-2.5 text-sm",
            c.needsAttention
              ? "bg-destructive/5 text-destructive"
              : "bg-muted/50 text-muted-foreground",
          )}
        >
          <p className="font-medium">{PAUSE_LABEL[c.pauseReason]}</p>
          {c.handoffSummary && (
            <p className="mt-1 whitespace-pre-line text-foreground/80">{c.handoffSummary}</p>
          )}
        </div>
      )}

      <div className="max-h-[60vh] flex-1 space-y-2 overflow-y-auto bg-muted/20 p-4">
        {isLoading ? (
          <div className="grid place-items-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          messages?.map((m) => <MessageBubble key={m.id} message={m} />)
        )}
        <div ref={bottomRef} />
      </div>
    </Card>
  );
}

function MessageBubble({ message: m }: { message: ChatMessage }) {
  const fromStore = m.author !== "customer";
  return (
    <div className={cn("flex", fromStore ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-3.5 py-2 text-sm shadow-sm sm:max-w-[70%]",
          m.author === "customer" && "rounded-bl-sm bg-card",
          m.author === "bot" && "rounded-br-sm bg-brand-blue text-white",
          m.author === "human" && "rounded-br-sm bg-brand-navy text-white",
        )}
      >
        {fromStore && (
          <p className="mb-0.5 text-[11px] font-semibold uppercase tracking-wide opacity-70">
            {m.author === "bot" ? "Asistente" : "Tienda"}
          </p>
        )}
        {m.kind === "products" && m.products?.length ? (
          <ul className="space-y-1">
            {m.products.map((p) => (
              <li key={p.id} className="flex items-center gap-2">
                <ShoppingBag className="h-3.5 w-3.5 shrink-0 opacity-80" />
                <span className="min-w-0 flex-1 truncate">{p.name}</span>
                <span className="shrink-0 tabular-nums opacity-90">{formatMoney(p.price)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="whitespace-pre-line break-words">{m.text || "—"}</p>
        )}
        <p className="mt-1 text-right text-[11px] tabular-nums opacity-60">{formatTime(m.at)}</p>
      </div>
    </div>
  );
}

function SettingsDialog({
  open,
  onOpenChange,
  settings,
  whatsappReady,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings: MessagingSettings;
  whatsappReady: boolean;
}) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState(settings);
  // Typed freely; the parsed numbers go into the draft as it changes.
  const [phonesText, setPhonesText] = useState("");
  useEffect(() => {
    if (open) {
      setDraft(settings);
      setPhonesText(formatAlertPhones(settings.alertPhones));
    }
  }, [open, settings]);
  const invalidPhones = useMemo(() => parseAlertPhones(phonesText).invalid, [phonesText]);
  const changed = useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(settings),
    [draft, settings],
  );

  const save = useMutation({
    mutationFn: () =>
      apiFetch<SettingsResponse>("/admin/messaging/settings", {
        method: "PUT",
        body: { ...draft, botEnabled: undefined },
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(messagingSettingsKey, data);
      toast.success("Ajustes guardados");
      onOpenChange(false);
    },
    onError: (error) => reportError(error),
  });

  const testAlert = useMutation({
    mutationFn: () =>
      apiFetch<{ sent: number; failed: { phone: string; error: string }[] }>(
        "/admin/messaging/alerts/test",
        { method: "POST" },
      ),
    onSuccess: ({ sent, failed }) => {
      if (sent > 0) {
        toast.success(
          sent === 1 ? "Alerta de prueba enviada" : `Alerta de prueba enviada a ${sent} números`,
        );
      }
      for (const f of failed) toast.error(`No llegó a +${f.phone}: ${f.error}`);
    },
    onError: (error) => reportError(error),
  });

  const set = <K extends keyof MessagingSettings>(key: K, value: MessagingSettings[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Ajustes del asistente</DialogTitle>
          <DialogDescription>Cambian en todos los chats en menos de un minuto.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-2">
            <Field className="flex items-center justify-between gap-3">
              <Label className="flex items-center gap-2">
                <WhatsappIcon className="h-4 w-4" /> Responder en WhatsApp
              </Label>
              <Switch
                checked={draft.whatsappEnabled}
                onCheckedChange={(v) => set("whatsappEnabled", v)}
              />
            </Field>
            <Field className="flex items-center justify-between gap-3">
              <Label className="flex items-center gap-2">
                <Instagram className="h-4 w-4 text-[#d62976]" /> Responder en Instagram
              </Label>
              <Switch
                checked={draft.instagramEnabled}
                onCheckedChange={(v) => set("instagramEnabled", v)}
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_9rem]">
            {/* min-w-0: a grid item won't shrink below its content otherwise,
                and the trigger ran over the next column. */}
            <Field className="grid min-w-0 gap-1.5">
              <Label className="text-xs font-medium text-brand-navy">Modelo</Label>
              <Select
                value={draft.model}
                onValueChange={(v) => set("model", v as MessagingSettings["model"])}
              >
                <SelectTrigger>
                  {/* The name only; the list adds what each one is for. */}
                  <SelectValue>
                    {MODEL_OPTIONS.find((o) => o.value === draft.model)?.label}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {MODEL_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      <span className="flex flex-col">
                        <span>{o.label}</span>
                        <span className="text-xs text-muted-foreground">{o.hint}</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field className="grid min-w-0 gap-1.5">
              <Label className="text-xs font-medium text-brand-navy">Respuesta</Label>
              <Select
                value={draft.effort}
                onValueChange={(v) => set("effort", v as MessagingSettings["effort"])}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EFFORT_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <Field className="grid gap-1.5">
            <Label className="text-xs font-medium text-brand-navy">
              Horas que espera el asistente cuando responde una persona
            </Label>
            <Input
              type="number"
              min={1}
              max={168}
              inputMode="numeric"
              value={draft.humanPauseHours}
              onChange={(e) =>
                set("humanPauseHours", Math.min(168, Math.max(1, Number(e.target.value) || 1)))
              }
              className="w-28"
            />
          </Field>

          <Field className="grid gap-1.5">
            <Label className="text-xs font-medium text-brand-navy">Indicaciones adicionales</Label>
            <Textarea
              rows={5}
              maxLength={4000}
              value={draft.extraInstructions}
              onChange={(e) => set("extraInstructions", e.target.value)}
              placeholder="Ej.: Esta semana hay 10 % de descuento en bombillos LED con el código LED10."
            />
            <p className="text-xs text-muted-foreground">
              Promociones, políticas o datos que el asistente debe conocer. No cambian los precios:
              esos salen del inventario.
            </p>
          </Field>

          <Field className="grid gap-1.5">
            <Label className="flex items-center gap-2 text-xs font-medium text-brand-navy">
              <WhatsappIcon className="h-4 w-4" /> Números que reciben las alertas del panel
            </Label>
            <Input
              inputMode="tel"
              value={phonesText}
              onChange={(e) => {
                setPhonesText(e.target.value);
                set("alertPhones", parseAlertPhones(e.target.value).phones);
              }}
              placeholder="+58 414 1234567"
              aria-invalid={invalidPhones.length > 0}
            />
            {invalidPhones.length > 0 ? (
              <p className="text-xs text-destructive">
                Revisa {invalidPhones.join(", ")}: escribe cada número con su código de país.
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Pedidos nuevos, clientes esperando, stock (agrupado), facturas y gastos por vencer,
                reseñas y errores de Profit Plus. Separa varios con comas. El asistente no responde
                a estos números.
              </p>
            )}
            <div>
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() => testAlert.mutate()}
                disabled={
                  !whatsappReady ||
                  settings.alertPhones.length === 0 ||
                  changed ||
                  testAlert.isPending
                }
              >
                {testAlert.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Enviar alerta de prueba
              </Button>
            </div>
          </Field>

          <Field className="flex items-start justify-between gap-3">
            <div className="grid gap-1">
              <Label className="flex items-center gap-2">
                <WhatsappIcon className="h-4 w-4" /> Avisar a los clientes por WhatsApp
              </Label>
              <p className="text-xs text-muted-foreground">
                Pedido recibido, pago confirmado, enviado o listo para retirar, entregado o
                cancelado, y cotizaciones aprobadas o rechazadas, a quienes marcan la casilla al
                pagar. Enciéndelo cuando esté conectado el número de la tienda: el de prueba solo
                llega a sus destinatarios de prueba.
              </p>
            </div>
            <Switch
              checked={draft.customerUpdatesEnabled}
              onCheckedChange={(v) => set("customerUpdatesEnabled", v)}
            />
          </Field>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={() => save.mutate()}
            disabled={!changed || invalidPhones.length > 0 || save.isPending}
          >
            {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
