import { WorkspaceHeader } from "@/components/workspace-header";
import { PaymentResultView } from "@/components/payment-result-view";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function OrderResultPage({ params }: PageProps) {
  const { id } = await params;

  return (
    <>
      <WorkspaceHeader />
      <main className="min-h-[calc(100vh-57px)] bg-muted/20 py-8">
        <PaymentResultView orderIdOrCode={id} />
      </main>
    </>
  );
}
