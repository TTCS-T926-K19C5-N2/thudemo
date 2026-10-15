import { PaymentResult } from "@/features/payment-result/payment-result";

export default async function PaymentResultPage({
  searchParams,
}: {
  searchParams: Promise<{ orderId?: string }>;
}) {
  const { orderId } = await searchParams;
  return <PaymentResult orderId={orderId ?? ""} />;
}
