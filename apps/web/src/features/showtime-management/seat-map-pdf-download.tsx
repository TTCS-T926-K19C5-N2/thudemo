"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export function SeatMapPdfDownload({ showtimeId }: { showtimeId: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  async function download() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/showtimes/${showtimeId}/manage/seats.pdf`, { cache: "no-store" });
      if (!response.ok) throw new Error("Không thể xuất sơ đồ ghế. Hãy thử lại.");
      const blob = await response.blob();
      if (blob.type !== "application/pdf") throw new Error("Tệp xuất không đúng định dạng PDF.");
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `seat-map-${showtimeId}.pdf`;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không thể xuất sơ đồ ghế.");
    } finally {
      setLoading(false);
    }
  }
  return (
    <div className="space-y-1">
      <Button variant="outline" onClick={download} disabled={loading}>
        {loading ? "Đang tạo PDF…" : "Xuất sơ đồ ghế PDF"}
      </Button>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {loading && <p role="status" className="text-sm">Đang tạo tệp một trang từ trạng thái ghế hiện tại…</p>}
    </div>
  );
}
