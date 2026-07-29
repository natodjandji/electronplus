import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TaxIdField } from "@/components/tax-id-field";
import { PhoneField } from "@/components/phone-field";
import { PayPalButton } from "@/components/paypal-button";
import { apiFetch, ApiError } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import type { Product } from "@/lib/mock-data";
import {
  formatTaxId,
  parseTaxId,
  validateTaxIdNumber,
  type TaxIdPrefix,
} from "@/lib/venezuelan-tax-id";
import {
  formatPhone,
  parsePhone,
  validatePhoneNumber,
  type PhonePrefix,
} from "@/lib/venezuelan-phone";
import { VENEZUELA_STATE_NAMES, citiesForState } from "@/lib/venezuela-locations";

const PAYPAL_CLIENT_ID = import.meta.env.VITE_PAYPAL_CLIENT_ID as string | undefined;

interface MyProfile {
  displayName?: string;
  phone?: string;
  taxId?: string;
  address?: string;
  city?: string;
  state?: string;
}

/**
 * A one-product express checkout — creates a single-item order with
 * paymentMethod "paypal" (same backend path checkout.tsx uses) and captures
 * it right in this dialog, skipping the cart and the 3-step checkout flow
 * entirely. Hidden whenever PayPal isn't configured on this build, same
 * reasoning as checkout.tsx hiding it from the payment-method list.
 */
export function BuyNowPaypalButton({ product }: { product: Product }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const [fulfillmentMethod, setFulfillmentMethod] = useState<"delivery" | "pickup">("delivery");
  const [fullName, setFullName] = useState("");
  const [taxIdPrefix, setTaxIdPrefix] = useState<TaxIdPrefix>("V");
  const [taxIdNumber, setTaxIdNumber] = useState("");
  const [phonePrefix, setPhonePrefix] = useState<PhonePrefix>("0412");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [address, setAddress] = useState("");
  const [state, setState] = useState("");
  const [city, setCity] = useState("");
  const [prefilled, setPrefilled] = useState(false);

  const [creating, setCreating] = useState(false);
  const [paypalPending, setPaypalPending] = useState<{
    paymentId: string;
    paypalOrderId: string;
  } | null>(null);

  // Only fetched once the dialog is actually open — no reason to hit
  // /users/me for every product card that renders this button.
  const { data: myProfile } = useQuery({
    queryKey: ["users", "me", "checkout"],
    queryFn: () => apiFetch<MyProfile>("/users/me"),
    enabled: !!user && open,
  });

  // Same prefill behavior as the main checkout (checkout.tsx): first
  // purchase gets just the name, a returning customer gets their last
  // saved shipping info pre-filled — still fully editable.
  useEffect(() => {
    if (!myProfile || prefilled) return;
    setFullName((prev) => prev || myProfile.displayName || "");
    if (myProfile.taxId) {
      const parsed = parseTaxId(myProfile.taxId);
      setTaxIdPrefix(parsed.prefix);
      setTaxIdNumber(parsed.number);
    }
    if (myProfile.phone) {
      const parsed = parsePhone(myProfile.phone);
      setPhonePrefix(parsed.prefix);
      setPhoneNumber(parsed.number);
    }
    if (myProfile.address) setAddress(myProfile.address);
    if (myProfile.state) setState(myProfile.state);
    if (myProfile.city) setCity(myProfile.city);
    setPrefilled(true);
  }, [myProfile, prefilled]);

  const isPickup = fulfillmentMethod === "pickup";
  const taxIdValidation = validateTaxIdNumber(taxIdPrefix, taxIdNumber);
  const phoneValidation = validatePhoneNumber(phoneNumber);
  const canSubmit = Boolean(
    fullName.trim() &&
    taxIdNumber.trim() &&
    taxIdValidation.valid &&
    phoneNumber.trim() &&
    phoneValidation.valid &&
    (isPickup || (address.trim() && state && city)),
  );

  const resetAndClose = () => {
    setOpen(false);
    setPaypalPending(null);
    setCreating(false);
  };

  const openDialog = () => {
    if (!user) {
      navigate({ to: "/login", search: { redirect: `/product/${product.id}` } });
      return;
    }
    setOpen(true);
  };

  const handleCreateOrder = async () => {
    setCreating(true);
    try {
      const shipping = {
        fullName: fullName.trim(),
        phone: formatPhone(phonePrefix, phoneNumber)!,
        taxId: formatTaxId(taxIdPrefix, taxIdNumber),
        ...(isPickup ? {} : { address: address.trim(), city, state }),
      };
      const order = await apiFetch<{ id: string }>("/orders", {
        method: "POST",
        body: {
          items: [{ productId: product.id, qty: 1 }],
          paymentMethod: "paypal",
          fulfillmentMethod,
          shipping,
        },
      });

      // Best-effort — save this shipping info for next time, same as the
      // main checkout does. Doesn't block the purchase if it fails.
      if (!isPickup) {
        apiFetch("/users/me", {
          method: "PATCH",
          body: {
            displayName: shipping.fullName,
            phone: shipping.phone,
            taxId: shipping.taxId,
            address: address.trim(),
            city,
            state,
          },
        }).catch(() => {});
      }

      const payments = await apiFetch<{ id: string; externalReference?: string }[]>(
        `/payments/order/${order.id}`,
      );
      const payment = payments[0];
      if (!payment?.externalReference) {
        throw new Error("No se pudo iniciar el pago con PayPal");
      }
      setPaypalPending({ paymentId: payment.id, paypalOrderId: payment.externalReference });
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : "No se pudo iniciar la compra con PayPal",
      );
    } finally {
      setCreating(false);
    }
  };

  const handleCaptured = async () => {
    if (!paypalPending) return;
    try {
      await apiFetch(`/payments/${paypalPending.paymentId}/paypal/capture`, { method: "POST" });
      toast.success("¡Compra confirmada! Te contactaremos pronto.");
      resetAndClose();
      navigate({ to: "/client/orders" });
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : "No se pudo confirmar el pago con PayPal",
      );
    }
  };

  if (!PAYPAL_CLIENT_ID) return null;

  return (
    <>
      <Button
        variant="outline"
        className="h-11 gap-2 border-[#0070ba] text-[#003087] hover:bg-[#0070ba]/5"
        onClick={openDialog}
      >
        Comprar ahora con PayPal
      </Button>

      <Dialog open={open} onOpenChange={(next) => !next && resetAndClose()}>
        <DialogContent className="max-h-[85vh] max-w-md overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Comprar {product.name}</DialogTitle>
          </DialogHeader>

          {paypalPending ? (
            <div className="space-y-3">
              <p className="text-center text-sm text-muted-foreground">
                Completa el pago con PayPal para confirmar tu compra.
              </p>
              <PayPalButton
                clientId={PAYPAL_CLIENT_ID}
                paypalOrderId={paypalPending.paypalOrderId}
                onCaptured={handleCaptured}
                onError={(message) => toast.error(message)}
              />
            </div>
          ) : (
            <>
              <div className="grid gap-3">
                <RadioGroup
                  value={fulfillmentMethod}
                  onValueChange={(v) => setFulfillmentMethod(v as "delivery" | "pickup")}
                  className="grid grid-cols-2 gap-2"
                >
                  <label
                    className={`flex cursor-pointer items-center gap-2 rounded-md border p-2.5 text-sm ${
                      fulfillmentMethod === "delivery"
                        ? "border-brand-blue bg-brand-blue/5"
                        : "border-border"
                    }`}
                  >
                    <RadioGroupItem value="delivery" /> Envío a domicilio
                  </label>
                  <label
                    className={`flex cursor-pointer items-center gap-2 rounded-md border p-2.5 text-sm ${
                      fulfillmentMethod === "pickup"
                        ? "border-brand-blue bg-brand-blue/5"
                        : "border-border"
                    }`}
                  >
                    <RadioGroupItem value="pickup" /> Retiro en tienda
                  </label>
                </RadioGroup>

                <div className="grid gap-1.5">
                  <Label className="text-xs font-medium text-brand-navy">Nombre completo</Label>
                  <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
                </div>
                <TaxIdField
                  prefix={taxIdPrefix}
                  onPrefixChange={setTaxIdPrefix}
                  number={taxIdNumber}
                  onNumberChange={setTaxIdNumber}
                  label="Cédula / RIF"
                />
                <PhoneField
                  prefix={phonePrefix}
                  onPrefixChange={setPhonePrefix}
                  number={phoneNumber}
                  onNumberChange={setPhoneNumber}
                />

                {!isPickup && (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="grid gap-1.5">
                        <Label className="text-xs font-medium text-brand-navy">Estado</Label>
                        <Select
                          value={state}
                          onValueChange={(v) => {
                            setState(v);
                            setCity("");
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Selecciona…" />
                          </SelectTrigger>
                          <SelectContent>
                            {VENEZUELA_STATE_NAMES.map((s) => (
                              <SelectItem key={s} value={s}>
                                {s}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="grid gap-1.5">
                        <Label className="text-xs font-medium text-brand-navy">Ciudad</Label>
                        <Select value={city} onValueChange={setCity} disabled={!state}>
                          <SelectTrigger>
                            <SelectValue
                              placeholder={state ? "Selecciona…" : "Elige un estado primero"}
                            />
                          </SelectTrigger>
                          <SelectContent>
                            {citiesForState(state).map((c) => (
                              <SelectItem key={c} value={c}>
                                {c}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="grid gap-1.5">
                      <Label className="text-xs font-medium text-brand-navy">Dirección</Label>
                      <Input
                        placeholder="Av. Principal, edif..."
                        value={address}
                        onChange={(e) => setAddress(e.target.value)}
                      />
                    </div>
                  </>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={resetAndClose}>
                  Cancelar
                </Button>
                <Button
                  className="gap-2 bg-brand-blue text-white hover:bg-brand-blue/90"
                  disabled={!canSubmit || creating}
                  onClick={handleCreateOrder}
                >
                  {creating && <Loader2 className="h-4 w-4 animate-spin" />}
                  Continuar al pago
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
