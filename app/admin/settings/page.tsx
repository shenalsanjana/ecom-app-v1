import { getStoreSettings } from "@/app/_lib/store-settings";
import { getPaymentDiagnostics, getSystemDiagnostics } from "@/app/_lib/payments/diagnostics";
import { StoreInfoForm } from "@/app/_components/admin/settings/store-info-form";
import { DeliveryPricingForm } from "@/app/_components/admin/settings/delivery-pricing-form";
import { PaymentMethodsTable } from "@/app/_components/admin/settings/payment-methods-table";
import { SystemDiagnosticsPanel } from "@/app/_components/admin/settings/system-diagnostics";

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border p-5 sm:p-6">
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

export default async function AdminSettingsPage() {
  const settings = await getStoreSettings();
  const payments = getPaymentDiagnostics();
  const system = getSystemDiagnostics();

  return (
    <section className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>

      <Section title="Store info" description="Used across the storefront, emails, and order documents.">
        <StoreInfoForm
          initial={{
            storeName: settings.storeName,
            supportEmail: settings.supportEmail,
            supportPhone: settings.supportPhone,
            businessAddress: settings.businessAddress,
          }}
        />
      </Section>

      <Section title="Delivery pricing" description="Zone rates and the free-delivery threshold.">
        <DeliveryPricingForm
          initial={{
            colomboDeliveryCost: settings.colomboDeliveryCost,
            otherDeliveryCost: settings.otherDeliveryCost,
            freeDeliveryThreshold: settings.freeDeliveryThreshold,
          }}
        />
      </Section>

      <Section title="Payment methods" description="Read-only. Configured via environment variables.">
        <PaymentMethodsTable rows={payments} />
      </Section>

      <Section title="System" description="Read-only environment diagnostics.">
        <SystemDiagnosticsPanel data={system} />
      </Section>
    </section>
  );
}
