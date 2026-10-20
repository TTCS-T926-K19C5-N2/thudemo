"use client";
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Button } from "@/components/ui/button";

export function TicketQrImage({
  payload,
  ticketId,
  seatLabel,
}: {
  payload: string;
  ticketId: string;
  seatLabel: string;
}) {
  const [src, setSrc] = useState("");
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    void QRCode.toDataURL(payload, {
      width: 512,
      margin: 4,
      errorCorrectionLevel: "M",
    })
      .then((image) => {
        if (active) setSrc(image);
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
    };
  }, [payload]);
  if (error)
    return <p role="alert">Không tạo được ảnh QR. Hãy tải lại trang.</p>;
  if (!src) return <p role="status">Đang tạo ảnh QR…</p>;
  return (
    <div className="flex flex-col items-center gap-3">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        width={320}
        height={320}
        className="max-w-full rounded-md bg-white"
        alt={`Mã QR vé ghế ${seatLabel}`}
        data-testid="ticket-qr-image"
      />
      <Button asChild variant="outline">
        <a href={src} download={`ve-${ticketId}.png`}>
          Tải ảnh QR
        </a>
      </Button>
    </div>
  );
}
