import { PageHeader } from "@/components/dashboard/page-header";
import { TokenStatus } from "./_components/token-status";
import { AccountsTable } from "./_components/accounts-table";
import { LastSync } from "./_components/last-sync";
import { RefreshNowButton } from "./_components/refresh-now-button";
import { TokenHowto } from "./_components/token-howto";

export const dynamic = "force-dynamic";

export default async function IntegrationsPage() {
  return (
    <>
      <PageHeader
        eyebrow="configurações · integrações"
        title="Integrações"
        subtitle="Conecte o Meta Ads para sincronizar campanhas e métricas"
        hidePicker
      />
      <div className="max-w-4xl space-y-6">
        <TokenStatus />
        <AccountsTable />
        <LastSync />
        <RefreshNowButton />
        <TokenHowto />
      </div>
    </>
  );
}
