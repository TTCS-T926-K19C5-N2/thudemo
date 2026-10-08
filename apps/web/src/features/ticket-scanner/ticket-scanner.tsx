"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Html5Qrcode } from "html5-qrcode";
import { PublicLayout } from "@/components/layout/product-layout";
import { ApiError, api, object } from "@/lib/api/client";
import { loadCurrentUser } from "@/lib/api";
import { checkInFailureState, checkInWithWaiting } from "./check-in-request";

type CheckInResult = {
  status: "SUCCESS";
  ticketId: string;
  seat: {
    category: string;
    row: string;
    number: number;
    label: string;
  };
  checkedInAt: string;
};

type ScanStatus = "SCANNING" | "WAITING" | "SUCCESS" | "INVALID" | "ERROR";

function decodeCheckIn(value: unknown): CheckInResult {
  const response = object(value);
  const seat = object(response.seat);
  if (
    response.status !== "SUCCESS" ||
    typeof response.ticketId !== "string" ||
    typeof seat.category !== "string" ||
    typeof seat.row !== "string" ||
    typeof seat.number !== "number" ||
    typeof seat.label !== "string" ||
    typeof response.checkedInAt !== "string" ||
    !Number.isFinite(Date.parse(response.checkedInAt))
  ) {
    throw new ApiError(
      "Phản hồi check-in không hợp lệ. Vui lòng thử lại.",
      502,
      "INVALID_RESPONSE",
    );
  }

  return {
    status: "SUCCESS",
    ticketId: response.ticketId,
    seat: {
      category: seat.category,
      row: seat.row,
      number: seat.number,
      label: seat.label,
    },
    checkedInAt: response.checkedInAt,
  };
}

export function TicketScanner({
  initialShowtimeId,
}: {
  initialShowtimeId: string;
}) {
  const [userLoading, setUserLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [userError, setUserError] = useState("");
  const [showtimeId, setShowtimeId] = useState(initialShowtimeId);
  const [ticketId, setTicketId] = useState("");
  const [status, setStatus] = useState<ScanStatus>("SCANNING");
  const [message, setMessage] = useState("Nhập mã suất diễn để bắt đầu.");
  const [result, setResult] = useState<CheckInResult | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [requestPending, setRequestPending] = useState(false);
  const scanner = useRef<Html5Qrcode | null>(null);
  const activeRequest = useRef<AbortController | null>(null);
  const requestSequence = useRef(0);
  const scanInProgress = useRef(false);
  const mounted = useRef(false);

  useEffect(() => {
    let active = true;
    mounted.current = true;

    void loadCurrentUser()
      .then((user) => {
        if (!active) return;
        setAuthorized(
          Boolean(
            user?.roles.some((role) =>
              ["STAFF", "ORGANIZER", "ADMIN"].includes(role),
            ),
          ),
        );
        setUserLoading(false);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setUserError(
          error instanceof Error
            ? error.message
            : "Không thể xác minh quyền truy cập.",
        );
        setUserLoading(false);
      });

    return () => {
      active = false;
      mounted.current = false;
      requestSequence.current += 1;
      activeRequest.current?.abort();
      const currentScanner = scanner.current;
      scanner.current = null;
      if (currentScanner?.isScanning) {
        void currentScanner
          .stop()
          .catch((error: unknown) =>
            console.error("Không thể dừng camera quét QR.", error),
          );
      }
    };
  }, []);

  const stopCamera = useCallback(async () => {
    const currentScanner = scanner.current;
    if (currentScanner?.isScanning) await currentScanner.stop();
    if (mounted.current) setCameraActive(false);
  }, []);

  const validateTicket = useCallback(
    async (rawTicketId: string) => {
      if (scanInProgress.current) return;
      const scannedTicketId = rawTicketId.trim();
      if (!showtimeId.trim()) {
        setStatus("ERROR");
        setMessage("Vui lòng nhập mã suất diễn trước khi quét vé.");
        return;
      }
      if (!scannedTicketId) {
        setStatus("INVALID");
        setMessage("Mã QR không hợp lệ.");
        return;
      }
      scanInProgress.current = true;

      try {
        await stopCamera();
      } catch (error) {
        scanInProgress.current = false;
        setStatus("ERROR");
        setMessage(
          error instanceof Error
            ? error.message
            : "Không thể dừng camera trước khi xác thực vé.",
        );
        return;
      }

      const sequence = ++requestSequence.current;
      activeRequest.current?.abort();
      const controller = new AbortController();
      activeRequest.current = controller;
      setRequestPending(true);
      setTicketId(scannedTicketId);
      setResult(null);
      setStatus("SCANNING");
      setMessage("Đang xác thực vé...");

      try {
        const checkedIn = await checkInWithWaiting(
          (signal) =>
            api(
              `/showtimes/${encodeURIComponent(showtimeId.trim())}/check-in`,
              decodeCheckIn,
              { method: "POST", body: { ticketId: scannedTicketId }, signal },
            ),
          () => {
            if (mounted.current && sequence === requestSequence.current) {
              setStatus("WAITING");
              setMessage("Đang chờ phản hồi từ máy chủ...");
            }
          },
          controller.signal,
        );
        if (!mounted.current || sequence !== requestSequence.current) return;
        setResult(checkedIn);
        setStatus("SUCCESS");
        setMessage("Vé hợp lệ. Check-in thành công.");
      } catch (error) {
        if (
          !mounted.current ||
          sequence !== requestSequence.current ||
          controller.signal.aborted
        ) {
          return;
        }
        setStatus(checkInFailureState(error));
        setMessage(
          error instanceof Error
            ? error.message
            : "Không thể xác thực vé. Vui lòng thử lại.",
        );
      } finally {
        if (sequence === requestSequence.current) {
          activeRequest.current = null;
          scanInProgress.current = false;
          setRequestPending(false);
        }
      }
    },
    [showtimeId, stopCamera],
  );

  const startCamera = useCallback(async () => {
    if (scanInProgress.current) return;
    if (!showtimeId.trim()) {
      setStatus("ERROR");
      setMessage("Vui lòng nhập mã suất diễn trước khi bật camera.");
      return;
    }
    const sequenceBeforeStart = requestSequence.current;
    try {
      const { Html5Qrcode, Html5QrcodeSupportedFormats } =
        await import("html5-qrcode");
      const currentScanner =
        scanner.current ??
        new Html5Qrcode("ticket-qr-reader", {
          formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
          verbose: false,
        });
      scanner.current = currentScanner;
      if (currentScanner.isScanning) return;

      await currentScanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 240, height: 240 } },
        (decodedText) => {
          void validateTicket(decodedText);
        },
        () => {
          // Frames without a decodable QR code are expected while scanning.
        },
      );
      if (!mounted.current) {
        if (currentScanner.isScanning) await currentScanner.stop();
        return;
      }
      if (
        scanInProgress.current ||
        sequenceBeforeStart !== requestSequence.current
      ) {
        return;
      }
      setCameraActive(true);
      setStatus("SCANNING");
      setMessage("Đưa mã QR vé vào khung hình để quét.");
    } catch (error) {
      if (!mounted.current) return;
      setCameraActive(false);
      setStatus("ERROR");
      setMessage(
        error instanceof Error
          ? `Không thể bật camera: ${error.message}`
          : "Không thể bật camera. Hãy kiểm tra quyền truy cập camera.",
      );
    }
  }, [showtimeId, validateTicket]);

  const scanNext = useCallback(() => {
    requestSequence.current += 1;
    activeRequest.current?.abort();
    activeRequest.current = null;
    scanInProgress.current = false;
    setRequestPending(false);
    setResult(null);
    setStatus("SCANNING");
    setMessage("Sẵn sàng quét vé tiếp theo.");
    void startCamera();
  }, [startCamera]);

  const statusClass =
    status === "SUCCESS"
      ? "border-emerald-300 bg-emerald-50 text-emerald-950"
      : status === "INVALID"
        ? "border-red-300 bg-red-50 text-red-950"
        : status === "WAITING"
          ? "border-amber-300 bg-amber-50 text-amber-950"
          : status === "ERROR"
            ? "border-orange-300 bg-orange-50 text-orange-950"
            : "border-blue-300 bg-blue-50 text-blue-950";

  return (
    <PublicLayout signedIn={authorized}>
      <main className="mx-auto w-full max-w-3xl space-y-6 px-4 py-8">
        <header>
          <h1 className="text-2xl font-bold">Soát vé bằng mã QR</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Chọn đúng suất diễn trước khi quét. Mỗi vé chỉ được check-in một
            lần.
          </p>
        </header>

        {userLoading ? (
          <p role="status">Đang kiểm tra quyền truy cập...</p>
        ) : userError ? (
          <section
            role="alert"
            className="rounded-lg border border-orange-300 bg-orange-50 p-4 text-orange-950"
          >
            {userError}
          </section>
        ) : !authorized ? (
          <section
            role="alert"
            className="rounded-lg border border-red-300 bg-red-50 p-4 text-red-900"
          >
            Bạn cần đăng nhập bằng tài khoản nhân viên, ban tổ chức hoặc quản
            trị viên để soát vé.
          </section>
        ) : (
          <>
            <label className="block space-y-2">
              <span className="font-medium">Mã suất diễn</span>
              <input
                value={showtimeId}
                onChange={(event) => setShowtimeId(event.target.value)}
                className="w-full rounded-md border bg-background px-3 py-2 font-mono"
                autoComplete="off"
                aria-label="Mã suất diễn"
                disabled={cameraActive || requestPending}
              />
            </label>

            <div
              id="ticket-qr-reader"
              className="mx-auto min-h-16 w-full max-w-lg overflow-hidden rounded-lg border bg-card"
              aria-label="Camera quét mã QR vé"
            />
            <div
              role="status"
              aria-live="polite"
              data-testid="ticket-scan-status"
              data-state={status}
              className={`rounded-lg border p-4 ${statusClass}`}
            >
              <p className="font-semibold">
                {status === "WAITING" ? "Đang chờ..." : message}
              </p>
              {result && (
                <div className="mt-3 space-y-1">
                  <p>Hạng ghế: {result.seat.category}</p>
                  <p>Số ghế: {result.seat.label}</p>
                  <p>
                    Thời điểm check-in:{" "}
                    {new Date(result.checkedInAt).toLocaleString("vi-VN")}
                  </p>
                </div>
              )}
            </div>

            {cameraActive ? (
              <button
                type="button"
                onClick={() => void stopCamera()}
                className="rounded-md border px-4 py-2 font-semibold"
              >
                Dừng camera
              </button>
            ) : requestPending ? (
              <button
                type="button"
                disabled
                className="rounded-md border px-4 py-2 font-semibold opacity-60"
              >
                {status === "WAITING" ? "Đang chờ..." : "Đang xác thực..."}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void startCamera()}
                className="rounded-md bg-primary px-4 py-2 font-semibold text-primary-foreground"
              >
                Bật camera
              </button>
            )}

            <form
              className="space-y-2 rounded-lg border bg-card p-4"
              onSubmit={(event) => {
                event.preventDefault();
                void validateTicket(ticketId);
              }}
            >
              <label htmlFor="ticket-code" className="block font-medium">
                Hoặc nhập mã vé
              </label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  id="ticket-code"
                  value={ticketId}
                  onChange={(event) => setTicketId(event.target.value)}
                  className="min-w-0 flex-1 rounded-md border bg-background px-3 py-2 font-mono"
                  autoComplete="off"
                />
                <button
                  type="submit"
                  disabled={requestPending}
                  className="rounded-md border px-4 py-2 font-semibold"
                >
                  Kiểm tra vé
                </button>
              </div>
            </form>

            {(status === "SUCCESS" ||
              status === "INVALID" ||
              status === "ERROR" ||
              status === "WAITING") && (
              <button
                type="button"
                onClick={scanNext}
                className="rounded-md border px-4 py-2 font-semibold"
              >
                Quét vé tiếp theo
              </button>
            )}
          </>
        )}
      </main>
    </PublicLayout>
  );
}
