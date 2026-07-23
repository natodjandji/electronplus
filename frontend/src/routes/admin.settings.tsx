import { createFileRoute } from "@tanstack/react-router";
import { AdminShell } from "@/components/admin-shell";
import { DiscountCodesPanel } from "@/components/admin/discount-codes-panel";
import { PaymentMethodsPanel } from "@/components/admin/payment-methods-panel";
import { ShippingRatesPanel } from "@/components/admin/shipping-rates-panel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/admin/settings")({
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
  return (
    <AdminShell title="Configuración">
      <Tabs defaultValue="payment-methods">
        <TabsList>
          <TabsTrigger value="payment-methods">Métodos de pago</TabsTrigger>
          <TabsTrigger value="shipping">Costos de envío</TabsTrigger>
          <TabsTrigger value="discounts">Códigos de descuento</TabsTrigger>
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
      </Tabs>
    </AdminShell>
  );
}
