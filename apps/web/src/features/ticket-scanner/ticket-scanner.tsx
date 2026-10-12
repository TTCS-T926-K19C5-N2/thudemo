"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Html5Qrcode } from "html5-qrcode";
import { PublicLayout } from "@/components/layout/product-layout";
import { ApiError, api, object } from "@/lib/api/client";
import { loadCurrentUser } from "@/lib/api";
import { checkInFailureState, checkInWithWaiting } from "./check-in-request";
import Link from "next/link";
import { AdmissionOverride } from "./admission-override";
import { verifyTicketQr, decodeQrKeys } from "./verify-ticket-qr";
import type { TicketQrPublicKey } from "shared/ticket-qr";
import {
  admissionTime,
  decodeCheckIn,
  usedTicket,
  type CheckInResult,
  type UsedTicket,
} from "./admission-response";
import { AlertTriangle, CheckCircle } from "lucide-react";

type ScanStatus =
  | "SCANNING"
  | "WAITING"
  | "SUCCESS"
  | "USED"
  | "RECORDED"
  | "EXCEPTION"
  | "INVALID"
  | "ERROR";
type Gate = { gateId: string; gateName: string; canOverride: boolean };

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
  const [qrKeys, setQrKeys] = useState<TicketQrPublicKey[]>([]);
  const [gates, setGates] = useState<Gate[]>([]);
  const [gateId, setGateId] = useState("");
  const [gatesLoading, setGatesLoading] = useState(false);
  const [used, setUsed] = useState<UsedTicket | null>(null);
  const scanAction = useRef<{
    ticketId: string;
    gateId: string;
    showtimeId: string;
    requestId: string;
  } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
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
      if (!showtimeId.trim() || !gateId) {
        setStatus("ERROR");
        setMessage("Chọn suất diễn và cửa được cấp quyền trước khi quét vé.");
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
      setUsed(null);
      setStatus("SCANNING");
      setMessage("Đang xác thực vé...");

      try {
        await verifyTicketQr(scannedTicketId, qrKeys, showtimeId.trim());
        const checkedIn = await checkInWithWaiting(
          (signal) =>
            api(
              `/showtimes/${encodeURIComponent(showtimeId.trim())}/check-in`,
              decodeCheckIn,
              {
                method: "POST",
                body: (() => {
                  const previous = scanAction.current;
                  if (
                    !previous ||
                    previous.ticketId !== scannedTicketId ||
                    previous.gateId !== gateId ||
                    previous.showtimeId !== showtimeId.trim()
                  ) {
                    scanAction.current = {
                      ticketId: scannedTicketId,
                      gateId,
                      showtimeId: showtimeId.trim(),
                      requestId: crypto.randomUUID(),
                    };
                  }
                  const action = scanAction.current;
                  if (!action)
                    throw new Error("Không thể tạo lượt quét. Hãy thử lại.");
                  return {
                    qrPayload: action.ticketId,
                    gateId: action.gateId,
                    requestId: action.requestId,
                  };
                })(),
                signal,
              },
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
        setStatus(
          checkedIn.status === "ALREADY_RECORDED" ? "RECORDED" : "SUCCESS",
        );
        setMessage(
          checkedIn.status === "ALREADY_RECORDED"
            ? "Yêu cầu này đã được ghi nhận. Đây không phải lần vào mới."
            : "Vé hợp lệ. Check-in thành công.",
        );
      } catch (error) {
        if (
          !mounted.current ||
          sequence !== requestSequence.current ||
          controller.signal.aborted
        ) {
          return;
        }
        const duplicate = usedTicket(error);
        setUsed(duplicate);
        setStatus(duplicate ? "USED" : checkInFailureState(error));
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
    [showtimeId, gateId, qrKeys, stopCamera],
  );

  const startCamera = useCallback(async () => {
    if (scanInProgress.current) return;
    if (!showtimeId.trim() || !gateId) {
      setStatus("ERROR");
      setMessage("Chọn suất diễn và cửa được cấp quyền trước khi bật camera.");
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
  }, [showtimeId, gateId, validateTicket]);

  const scanNext = useCallback(() => {
    if (scanInProgress.current) return;
    scanAction.current = null;
    setUsed(null);
    setTicketId("");
    requestSequence.current += 1;
    activeRequest.current?.abort();
    activeRequest.current = null;
    scanInProgress.current = false;
    setRequestPending(false);
    setResult(null);
    setStatus("SCANNING");
    setMessage("Sẵn sàng quét vé tiếp theo.");
    inputRef.current?.focus();
    if (scanner.current) void startCamera();
  }, [startCamera]);

  const statusClass =
    status === "SUCCESS" || status === "EXCEPTION"
      ? "border-emerald-300 bg-emerald-50 text-emerald-950"
      : status === "INVALID"
        ? "border-red-300 bg-red-50 text-red-950"
        : status === "WAITING" || status === "USED" || status === "RECORDED"
          ? "border-amber-300 bg-amber-50 text-amber-950"
          : status === "ERROR"
            ? "border-orange-300 bg-orange-50 text-orange-950"
            : "border-blue-300 bg-blue-50 text-blue-950";

  return (
    <PublicLayout signedIn={authorized}>
      <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-8 [&_button]:min-h-11">
        <header>
          <Link
            href="/scanner/snapshot"
            className="text-sm text-primary underline"
          >
            Chuẩn bị danh sách vé
          </Link>
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
                onChange={(event) => {
                  setShowtimeId(event.target.value);
                  setTicketId("");
                  setQrKeys([]);
                  setMessage(
                    "Chọn suất diễn và tải cửa được phân công để bắt đầu.",
                  );
                  setGates([]);
                  setGateId("");
                  scanAction.current = null;
                  setUsed(null);
                  setResult(null);
                  setStatus("SCANNING");
                }}
                className="w-full rounded-md border bg-background px-3 py-2 font-mono"
                autoComplete="off"
                aria-label="Mã suất diễn"
                disabled={cameraActive || requestPending || gatesLoading}
              />
            </label>

            <button
              type="button"
              disabled={
                cameraActive ||
                requestPending ||
                gatesLoading ||
                !showtimeId.trim()
              }
              className="rounded-md border px-4 py-2 font-semibold"
              onClick={() => {
                if (gatesLoading) return;
                setGatesLoading(true);
                void api(
                  `/showtimes/${encodeURIComponent(showtimeId.trim())}/check-in/gates`,
                  (value) => {
                    const data = object(value);
                    if (!Array.isArray(data.gates))
                      throw new ApiError(
                        "Không đọc được danh sách cửa.",
                        502,
                        "INVALID_RESPONSE",
                      );
                    return data.gates.map((value) => {
                      const gate = object(value);
                      if (
                        typeof gate.gateId !== "string" ||
                        typeof gate.gateName !== "string" ||
                        typeof gate.canOverride !== "boolean"
                      )
                        throw new ApiError(
                          "Không đọc được cửa.",
                          502,
                          "INVALID_RESPONSE",
                        );
                      return gate as Gate;
                    });
                  },
                )
                  .then(async (available) => {
                    const keys = await api("/scanner/qr-keys", decodeQrKeys);
                    setQrKeys(keys);
                    setGates(available);
                    setGateId(available[0]?.gateId ?? "");
                    setMessage(
                      available.length
                        ? "Sẵn sàng quét vé."
                        : "Bạn chưa được cấp quyền tại suất/cửa này.",
                    );
                  })
                  .catch((error: unknown) => {
                    setStatus("ERROR");
                    setMessage(
                      error instanceof Error
                        ? error.message
                        : "Không thể tải cửa. Hãy thử lại.",
                    );
                  })
                  .finally(() => setGatesLoading(false));
              }}
            >
              {gatesLoading ? "Đang tải cửa..." : "Tải cửa được phân công"}
            </button>
            <label className="block space-y-2">
              <span className="font-medium">Cửa hiện tại</span>
              <select
                aria-label="Cửa hiện tại"
                value={gateId}
                disabled={cameraActive || requestPending || !gates.length}
                className="w-full rounded-md border bg-background px-3 py-3"
                onChange={(event) => {
                  setGateId(event.target.value);
                  setTicketId("");
                  setMessage("Quét vé tại cửa hiện tại để xác thực.");
                  scanAction.current = null;
                  setUsed(null);
                  setResult(null);
                  setStatus("SCANNING");
                }}
              >
                {!gates.length && (
                  <option value="">Chọn suất và tải cửa trước</option>
                )}
                {gates.map((gate) => (
                  <option key={gate.gateId} value={gate.gateId}>
                    {gate.gateName}
                  </option>
                ))}
              </select>
            </label>
            <p className="break-all text-sm">
              Suất: {showtimeId || "Chưa chọn"} · Cửa:{" "}
              {gates.find((gate) => gate.gateId === gateId)?.gateName ??
                "Chưa chọn"}
            </p>
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
              <p className="flex items-center gap-2 font-semibold">
                {status === "USED" ||
                status === "RECORDED" ||
                status === "ERROR" ||
                status === "INVALID" ? (
                  <AlertTriangle
                    aria-hidden="true"
                    className="size-5 shrink-0"
                  />
                ) : result ? (
                  <CheckCircle aria-hidden="true" className="size-5 shrink-0" />
                ) : null}
                {status === "WAITING"
                  ? "Đang chờ phản hồi từ máy chủ..."
                  : status === "USED"
                    ? "Vé đã sử dụng"
                    : message}
              </p>
              {used && (
                <p className="mt-2">
                  Đã vào lúc {admissionTime(used.checkedInAt)} tại cửa{" "}
                  {used.gateName}.
                </p>
              )}
              {result && (
                <div className="mt-3 space-y-1">
                  <p>Cửa: {result.gateName}</p>
                  <p>Hạng ghế: {result.seat.category}</p>
                  <p>Số ghế: {result.seat.label}</p>
                  <p>Thời điểm check-in: {admissionTime(result.checkedInAt)}</p>
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
                disabled={!gateId || gatesLoading}
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
                  ref={inputRef}
                  disabled={requestPending || !gateId}
                  value={ticketId}
                  onChange={(event) => {
                    setTicketId(event.target.value);
                    setUsed(null);
                    setResult(null);
                    setStatus("SCANNING");
                    setMessage("Kiểm tra mã vé để xác thực.");
                  }}
                  className="min-w-0 flex-1 rounded-md border bg-background px-3 py-2 font-mono"
                  autoComplete="off"
                />
                <button
                  type="submit"
                  disabled={requestPending || !gateId}
                  className="rounded-md border px-4 py-2 font-semibold"
                >
                  Kiểm tra vé
                </button>
              </div>
            </form>

            <div className="flex flex-wrap gap-2">
              {used?.canOverride && (
                <AdmissionOverride
                  key={`${ticketId}:${gateId}:${showtimeId}`}
                  showtimeId={showtimeId.trim()}
                  gateId={gateId}
                  qrPayload={ticketId}
                  onRecorded={(recorded) => {
                    setUsed(null);
                    setResult(recorded);
                    setStatus(
                      recorded.status === "ALREADY_RECORDED"
                        ? "RECORDED"
                        : "EXCEPTION",
                    );
                    setMessage(
                      recorded.status === "ALREADY_RECORDED"
                        ? "Yêu cầu ngoại lệ này đã được ghi nhận. Đây không phải lần vào mới."
                        : "Đã ghi nhận vào lại theo ngoại lệ",
                    );
                  }}
                />
              )}
              {(status === "USED" ||
                status === "EXCEPTION" ||
                status === "RECORDED" ||
                status === "SUCCESS" ||
                status === "INVALID" ||
                status === "ERROR" ||
                status === "WAITING") && (
                <button
                  type="button"
                  onClick={scanNext}
                  id="scan-next"
                  disabled={requestPending}
                  className="rounded-md border px-4 py-2 font-semibold"
                >
                  Quét vé tiếp theo
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </PublicLayout>
  );
}
