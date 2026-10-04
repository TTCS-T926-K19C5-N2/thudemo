import { PublicLayout } from "@/components/layout/product-layout";
import { EventCatalog } from "@/features/event-catalog/event-catalog";

export default function Home() {
  return <PublicLayout><EventCatalog /></PublicLayout>;
}
