import { EventEditor } from "@/components/event-editor";

export default async function EditEventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EventEditor eventId={id} />;
}
