import { decodePublicShowtime } from "@/lib/contracts/showtimes";
import type { Metadata } from "next";
import { PublicLayout } from "@/components/layout/product-layout";
import { PublicShowtime } from "@/features/event-catalog/public-showtime";
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  try {
    const res = await fetch(
      `${process.env.API_INTERNAL_URL ?? "http://localhost:3001"}/showtimes/${encodeURIComponent(id)}`,
      { cache: "no-store" },
    );
    if (!res.ok) return { title: "Suất diễn chưa mở bán" };
    const show = decodePublicShowtime(await res.json());
    return {
      title: show.event.name,
      description: show.event.description,
      openGraph: {
        title: show.event.name,
        description: show.event.description,
        type: "website",
      },
    };
  } catch {
    return { title: "Thông tin suất diễn" };
  }
}
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <PublicLayout>
      <PublicShowtime id={id} />
    </PublicLayout>
  );
}
