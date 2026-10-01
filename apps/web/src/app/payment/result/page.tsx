import { Suspense } from "react";
import { WorkspaceHeader } from "@/components/workspace-header";
import { PaymentResultView } from "@/components/payment-result-view";

interface PageProps {
  searchParams: Promise<{
    orderId?: string;
    orderCode?: string;
    id?: string;
    // Ghi chú AC4: Bất kỳ tham số nào như status=success, result=00 đều bị bỏ qua (Server-authoritative)
    status?: string;
    result?: string;
  }>;
}

export default async function PaymentResultQueryPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const orderIdentifier = params.orderId || params.orderCode || params.id || "";

  return (
    <>
      <WorkspaceHeader />
      <main className="min-h-[calc(100vh-57px)] bg-muted/20 py-8">
        <Suspense
          fallback={
            <div className="flex justify-center py-16">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
          }
        >
          <PaymentResultView orderIdOrCode={orderIdentifier} />
        </Suspense>
      </main>
    </>
  );
}
