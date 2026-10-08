import { notFound } from "next/navigation";
import { PublicLayout } from "@/components/layout/product-layout";
import { MockGatewayPayment } from "@/features/mock-gateway/mock-gateway-payment";
import { upstreamUrl } from "@/lib/server/api-proxy";

export interface MockGatewayPayPageProps {
  searchParams: Promise<{
    orderId?: string;
    amount?: string;
    gatewayRef?: string;
    returnUrl?: string;
  }>;
}

export default async function MockGatewayPayPage({
  searchParams,
}: MockGatewayPayPageProps) {
  const isMockEnv =
    (process.env.PAYMENT_GATEWAY ?? "").toLowerCase() === "mock";

  if (!isMockEnv) {
    try {
      const apiOrigin =
        process.env.API_INTERNAL_URL ??
        process.env.NEXT_PUBLIC_API_URL ??
        "http://localhost:3001";
      const statusRes = await fetch(
        upstreamUrl(apiOrigin, ["mock-gateway", "status"], ""),
        {
          cache: "no-store",
        },
      );
      if (!statusRes.ok) {
        notFound();
      }
    } catch {
      notFound();
    }
  }

  const params = await searchParams;
  const orderId = params.orderId ?? "";
  const amount = Number(params.amount ?? 0);
  const gatewayRef = params.gatewayRef ?? "";
  const returnUrl = params.returnUrl ?? `/payment/result?orderId=${orderId}`;

  return (
    <PublicLayout compact>
      <main
        style={{ padding: "2rem 1rem", maxWidth: "700px", margin: "0 auto" }}
      >
        <MockGatewayPayment
          orderId={orderId}
          amount={amount}
          gatewayRef={gatewayRef}
          returnUrl={returnUrl}
        />
      </main>
    </PublicLayout>
  );
}
