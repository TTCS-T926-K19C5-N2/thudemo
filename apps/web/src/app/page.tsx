import { PublicLayout } from "@/components/layout/product-layout";
import { EventCatalog } from "@/features/event-catalog/event-catalog";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  const params = await searchParams;
  const initialQuery = Array.isArray(params.q) ? params.q[0] ?? "" : params.q ?? "";
  return <PublicLayout searchQuery={initialQuery}><EventCatalog initialQuery={initialQuery} /></PublicLayout>;
}
