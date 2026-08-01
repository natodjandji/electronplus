import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AdminShell } from "@/components/admin-shell";
import { DiscountCodesPanel } from "@/components/admin/discount-codes-panel";
import { ErpSyncPanel, SecondStoreSyncPanel } from "@/components/admin/erp-sync-panel";
import { PaymentMethodsPanel } from "@/components/admin/payment-methods-panel";
import { ShippingRatesPanel } from "@/components/admin/shipping-rates-panel";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const TABS = ["payment-methods", "shipping", "discounts", "erp-sync"] as const;
type SettingsTab = (typeof TABS)[number];

export const Route = createFileRoute("/admin/settings")({
  // Lets the notification bell deep-link straight to a tab (e.g. a sync
  // error notification → ?tab=erp-sync) instead of just landing on the
  // default tab and making the admin find it themselves.
  validateSearch: (search: Record<string, unknown>): { tab?: SettingsTab } => ({
    tab: TABS.includes(search.tab as SettingsTab) ? (search.tab as SettingsTab) : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Configuración · Admin Electron Plus" },
      {
        name: "description",
        content: "Métodos de pago, costos de envío y códigos de descuento.",
      },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const { tab } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });

  return (
    <AdminShell title="Configuración">
      <Tabs
        value={tab ?? "payment-methods"}
        onValueChange={(value) => navigate({ search: { tab: value as SettingsTab } })}
      >
        <TabsList>
          <TabsTrigger value="payment-methods">Métodos de pago</TabsTrigger>
          <TabsTrigger value="shipping">Costos de envío</TabsTrigger>
          <TabsTrigger value="discounts">Códigos de descuento</TabsTrigger>
          <TabsTrigger value="erp-sync">Sincronización Profit Plus</TabsTrigger>
        </TabsList>
        <TabsContent value="payment-methods" className="mt-6">
          <PaymentMethodsPanel />
        </TabsContent>
        <TabsContent value="shipping" className="mt-6">
          <ShippingRatesPanel />
        </TabsContent>
        <TabsContent value="discounts" className="mt-6">
          <DiscountCodesPanel />
        </TabsContent>
        <TabsContent value="erp-sync" className="mt-6 space-y-6">
          {/* Two independent Profit Plus servers, two independent
              locations — each store's connection health/history is shown
              on its own, never combined into a single status. */}
          <ErpSyncPanel />
          <Separator />
          <SecondStoreSyncPanel />
        </TabsContent>
      </Tabs>
    </AdminShell>
  );
}
