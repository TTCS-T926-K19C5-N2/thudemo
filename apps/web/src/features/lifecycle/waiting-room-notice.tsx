"use client";
import { useEffect, useState } from "react";
import { api, object } from "@/lib/api/client";
export function WaitingRoomNotice({ id }: { id: string }) {
  const [state, setState] = useState<{
      enabled: boolean;
      admitted: boolean;
      position: number;
      expiresAt: string | null;
    } | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    let closed = false;
    let timer: ReturnType<typeof setTimeout>;
    const controller = new AbortController();
    async function refresh() {
      try {
        const result = await api(
          `/showtimes/${id}/waiting-room`,
          (v) => object(v) as unknown as NonNullable<typeof state>,
          { method: "POST", body: {}, signal: controller.signal },
        );
        if (closed) return;
        setState(result);
        setError("");
        if (result.enabled) timer = setTimeout(() => void refresh(), 3000);
      } catch (e) {
        if (!closed) {
          setError(
            e instanceof Error ? e.message : "Chưa xác nhận được lượt đặt vé.",
          );
          timer = setTimeout(() => void refresh(), 5000);
        }
      }
    }
    void refresh();
    return () => {
      closed = true;
      controller.abort();
      clearTimeout(timer);
    };
  }, [id]);
  if (error) return <p role="alert">{error}</p>;
  if (!state?.enabled) return null;
  return (
    <section className="operations-panel" aria-live="polite">
      <h2>
        {state.admitted ? "Đến lượt đặt vé của bạn" : "Bạn đang ở phòng chờ"}
      </h2>
      <p>
        {state.admitted
          ? `Lượt có hiệu lực đến ${new Date(state.expiresAt!).toLocaleTimeString("vi-VN")}. Hết hạn sẽ xếp hàng lại.`
          : `Vị trí hiện tại: ${state.position}. Giữ trang mở để duy trì vị trí.`}
      </p>
    </section>
  );
}
