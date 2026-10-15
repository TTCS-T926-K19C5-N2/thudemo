import { notFound } from "next/navigation";
import { OrganizerLayout } from "@/components/layout/product-layout";
import { ShowtimeWorkspace } from "@/features/showtime-management/showtime-workspace";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string; mode: string }>;
}) {
  const { id, mode } = await params;
  if (
    mode !== "manage" &&
    mode !== "import" &&
    mode !== "prices" &&
    mode !== "map"
  )
    notFound();
  return (
    <OrganizerLayout
      id={id}
      mode={mode}
      title={
        {
          manage: "Quản lý suất diễn",
          import: "Nạp sơ đồ JSON",
          prices: "Đặt giá theo hạng",
          map: "Xem sơ đồ ghế",
        }[mode]
      }
    >
      <ShowtimeWorkspace id={id} mode={mode} />
    </OrganizerLayout>
  );
}
