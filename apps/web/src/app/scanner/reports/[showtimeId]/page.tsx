import { notFound } from "next/navigation";
import { ConflictReport } from "@/features/scanner/conflict-report";
export default async function ReportPage({
  params,
}: {
  params: Promise<{ showtimeId: string }>;
}) {
  const { showtimeId } = await params;
  if (
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(
      showtimeId,
    )
  )
    notFound();
  return <ConflictReport showtimeId={showtimeId} />;
}
