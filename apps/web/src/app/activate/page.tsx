import { ActivateForm } from "@/components/activate-form";

export default async function ActivatePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  return <ActivateForm token={typeof token === "string" ? token : null} />;
}
