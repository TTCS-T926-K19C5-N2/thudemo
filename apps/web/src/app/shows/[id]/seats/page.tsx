import { PublicLayout } from "@/components/layout/product-layout";
import { SeatSelection } from "@/features/seat-selection/seat-selection";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <PublicLayout>
      <SeatSelection id={id} />
    </PublicLayout>
  );
}
