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
import { AlertTriangle, CheckCircle, CloudOff } from "lucide-react";
import { OfflineBanner } from "./offline-banner";
import {
  addPendingScan,
  getPendingScanByTicket,
  getPendingScanCount,
  removePendingScan,
  subscribePendingCount,
  type PendingScan,
} from "./offline-queue";
import {
  subscribeNetworkStatus,
  markServerOnline,
  markServerOffline,
} from "./network-status";
import {
  syncPendingScans,
  subscribeSyncState,
  isSyncing,
} from "./sync-manager";
import {
  getShowtimeMeta,
  markTicketAsLocalCheckedIn,
  countPendingOfflineScans,
} from "../scanner/scanner-db";
import { processOfflineScan } from "../scanner/offline-scanner";
import { syncOfflineScanQueue } from "../scanner/scanner-sync";

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

function createOfflineCheckInResult(
  ticketCode: string,
  gateName: string,
  ticketType: string,
  seatLabel: string,
  checkedInAt: string,
): CheckInResult {
  const [rowPart, numPart] = seatLabel.split("-");
  return {
    status: "SUCCESS",
    ticketId: ticketCode,
    gateName,
    kind: "NORMAL",
    seat: {
      category: ticketType || "Tiêu chuẩn",
      row: rowPart || seatLabel,
      number: numPart ? parseInt(numPart, 10) || 0 : 0,
      label: seatLabel || "Ghế",
    },
    checkedInAt,
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
  const [qrKeys, setQrKeys] = useState<TicketQrPublicKey[]>([]);
  const [gates, setGates] = useState<Gate[]>([]);
  const [gateId, setGateId] = useState("");
  const [gatesLoading, setGatesLoading] = useState(false);
  const [used, setUsed] = useState<UsedTicket | null>(null);

  const [isOnline, setIsOnline] = useState(true);
  const [browserOnline, setBrowserOnline] = useState(true);
  const [offlineModeSimulated, setOfflineModeSimulated] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [pendingScansCount, setPendingScansCount] = useState<number>(0);
  const [isSyncingState, setIsSyncingState] = useState(false);
  const [isSyncingQueue, setIsSyncingQueue] = useState(false);
  const [syncSuccessMessage, setSyncSuccessMessage] = useState<string | null>(null);

  const isExplicitOffline = offlineModeSimulated || !browserOnline;
  const isDeviceOnline = !isExplicitOffline;

  const scanAction = useRef<{
    ticketId: string;
    gateId: string;
    showtimeId: string;
    requestId: string;
  } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<ScanStatus>("SCANNING");
  const [message, setMessage] = useState(
    "Chọn suất diễn và tải cửa được phân công để bắt đầu.",
  );
  const [result, setResult] = useState<CheckInResult | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [requestPending, setRequestPending] = useState(false);

  const scanner = useRef<Html5Qrcode | null>(null);
  const activeRequest = useRef<AbortController | null>(null);
  const requestSequence = useRef(0);
  const scanInProgress = useRef(false);
  const mounted = useRef(false);

  const refreshPendingCount = useCallback(async () => {
    try {
      const count = await countPendingOfflineScans(
        showtimeId.trim() || undefined,
      );
      if (mounted.current) setPendingScansCount(count);
    } catch {
      // ignore
    }
  }, [showtimeId]);

  const triggerSync = useCallback(async () => {
    if (isSyncing()) return;
    const syncResult = await syncPendingScans({
      showtimeId: showtimeId.trim() || undefined,
    });
    try {
      await syncOfflineScanQueue(showtimeId.trim() || undefined);
      await refreshPendingCount();
    } catch {
      // ignore
    }
    if (syncResult.syncedCount > 0 && syncResult.remainingCount === 0) {
      setSyncSuccessMessage(
        `Đã đồng bộ thành công ${syncResult.syncedCount} lượt quét.`,
      );
      setTimeout(() => {
        if (mounted.current) setSyncSuccessMessage(null);
      }, 4000);
    }
  }, [showtimeId, refreshPendingCount]);

  const syncOfflineQueue = useCallback(async () => {
    if (typeof navigator !== "undefined" && !navigator.onLine) return;
    if (isSyncingQueue) return;
    setIsSyncingQueue(true);
    try {
      await syncOfflineScanQueue(showtimeId.trim() || undefined);
      await syncPendingScans({ showtimeId: showtimeId.trim() || undefined });
      await refreshPendingCount();
    } catch (e) {
      console.warn("Lỗi đồng bộ hàng đợi ngoại tuyến:", e);
    } finally {
      if (mounted.current) setIsSyncingQueue(false);
    }
  }, [showtimeId, isSyncingQueue, refreshPendingCount]);

  useEffect(() => {
    let active = true;
    void countPendingOfflineScans(showtimeId.trim() || undefined)
      .then((count) => {
        if (active) setPendingScansCount(count);
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [showtimeId]);

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
        if (typeof navigator !== "undefined" && !navigator.onLine) {
          setAuthorized(true);
          setUserLoading(false);
          return;
        }
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
            console.warn("Không thể dừng camera quét QR.", error),
          );
      }
    };
  }, []);

  useEffect(() => {
    const unsubCount = subscribePendingCount((count) => {
      if (mounted.current) setPendingCount(count);
    });
    void getPendingScanCount(showtimeId.trim() || undefined).then((count) => {
      if (mounted.current) setPendingCount(count);
    });
    return unsubCount;
  }, [showtimeId]);

  useEffect(() => {
    return subscribeSyncState((syncing) => {
      if (mounted.current) setIsSyncingState(syncing);
    });
  }, []);

  useEffect(() => {
    return subscribeNetworkStatus((netState) => {
      if (!mounted.current) return;
      setIsOnline(netState.isOnline);
      setBrowserOnline(netState.browserOnline);
      if (netState.isOnline) {
        void triggerSync();
      }
    });
  }, [triggerSync]);

  useEffect(() => {
    if (showtimeId.trim() && qrKeys.length === 0) {
      void getShowtimeMeta(showtimeId.trim())
        .then((meta) => {
          if (!mounted.current || !meta) return;
          if (meta.verificationKeys && meta.verificationKeys.length > 0) {
            setQrKeys(meta.verificationKeys);
          } else if (meta.keyId && meta.publicKey) {
            setQrKeys([{ keyId: meta.keyId, key: meta.publicKey }]);
          }
        })
        .catch(() => {});
    }
  }, [showtimeId, qrKeys.length]);

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
        setMessage("Chọn suất diễn và tải cửa được phân công để bắt đầu.");
        return;
      }

      if (isDeviceOnline && !gateId) {
        setStatus("ERROR");
        setMessage("Chọn suất diễn và cửa được cấp quyền trước khi quét vé.");
        return;
      }

      if (!scannedTicketId) {
        setStatus("INVALID");
        setMessage("Mã QR không hợp lệ.");
        return;
      }

      // OFFLINE VALIDATION FLOW (S-34)
      if (!isDeviceOnline) {
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
        setRequestPending(true);
        setTicketId(scannedTicketId);
        setResult(null);
        setUsed(null);
        setStatus("SCANNING");
        setMessage("Đang xác thực vé...");

        try {
          const offlineOutcome = await processOfflineScan({
            showtimeId: showtimeId.trim(),
            qrPayload: scannedTicketId,
            gateId: gateId || gates[0]?.gateId || "gate-offline",
            gateName:
              gates.find((g) => g.gateId === gateId)?.gateName ??
              gates[0]?.gateName ??
              "Cửa soát vé",
          });

          if (!mounted.current || sequence !== requestSequence.current) return;
          void refreshPendingCount();

          if (offlineOutcome.success && offlineOutcome.code === "OK") {
            setResult(
              createOfflineCheckInResult(
                offlineOutcome.ticket?.code ?? scannedTicketId,
                gates.find((g) => g.gateId === gateId)?.gateName ??
                  "Cửa soát vé",
                offlineOutcome.ticket?.ticketType ?? "Tiêu chuẩn",
                offlineOutcome.ticket?.seatLabel ?? "Ghế",
                offlineOutcome.ticket?.checkedInAt ?? new Date().toISOString(),
              ),
            );
            setStatus("SUCCESS");
            setMessage("Vé hợp lệ. Check-in thành công (ngoại tuyến).");
          } else if (offlineOutcome.code === "ALREADY_CHECKED_IN") {
            setUsed({
              checkedInAt:
                offlineOutcome.previousCheckedInAt ??
                new Date().toISOString(),
              gateName: "cửa trước đó",
              canOverride: false,
            });
            setStatus("USED");
            setMessage("Vé đã sử dụng");
          } else if (offlineOutcome.code === "DUPLICATE_ON_DEVICE") {
            setStatus("USED");
            setMessage(
              "Vé đã được quét offline trên máy này (DUPLICATE_ON_DEVICE).",
            );
          } else if (offlineOutcome.code === "NO_LIST_OFFLINE") {
            setStatus("ERROR");
            setMessage(offlineOutcome.message);
          } else {
            setStatus("INVALID");
            setMessage(offlineOutcome.message);
          }
        } catch (offlineErr) {
          if (!mounted.current || sequence !== requestSequence.current) return;
          setStatus("ERROR");
          setMessage(
            offlineErr instanceof Error
              ? offlineErr.message
              : "Có lỗi khi xác thực vé ngoại tuyến.",
          );
        } finally {
          if (sequence === requestSequence.current) {
            activeRequest.current = null;
            scanInProgress.current = false;
            setRequestPending(false);
          }
        }
        return;
      }

      // ONLINE VALIDATION FLOW (S-30, S-31, S-37)
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
        let effectiveKeys = qrKeys;
        if (!effectiveKeys.length && showtimeId.trim()) {
          const meta = await getShowtimeMeta(showtimeId.trim()).catch(() => null);
          if (meta?.verificationKeys?.length) {
            effectiveKeys = meta.verificationKeys;
          } else if (meta?.keyId && meta?.publicKey) {
            effectiveKeys = [{ keyId: meta.keyId, key: meta.publicKey }];
          }
        }

        await verifyTicketQr(scannedTicketId, effectiveKeys, showtimeId.trim());

        // Check if ticket was already scanned locally and pending sync
        const existingPending = await getPendingScanByTicket(
          showtimeId.trim(),
          scannedTicketId,
        );
        if (existingPending) {
          setUsed({
            checkedInAt: existingPending.createdAt,
            gateName:
              gates.find((g) => g.gateId === existingPending.gateId)?.gateName ??
              "Cửa hiện tại",
            canOverride: false,
          });
          setStatus("USED");
          setMessage("Vé đã được quét trước đó trên máy này (đang chờ đồng bộ).");
          return;
        }

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

        const pendingItem: PendingScan = {
          id: action.requestId,
          showtimeId: action.showtimeId,
          ticketId: action.ticketId,
          gateId: action.gateId,
          requestId: action.requestId,
          createdAt: new Date().toISOString(),
          status: "pending",
          retryCount: 0,
        };

        // If browser is offline, save locally and sync when reconnected
        if (!browserOnline) {
          await addPendingScan(pendingItem);
          void markTicketAsLocalCheckedIn(
            action.showtimeId,
            action.ticketId,
          ).catch(() => {});
          if (!mounted.current || sequence !== requestSequence.current) return;
          setStatus("RECORDED");
          setMessage(
            "Đã lưu ngoại tuyến thành công. Lượt quét sẽ tự động đồng bộ khi có mạng.",
          );
          setResult({
            status: "ALREADY_RECORDED",
            ticketId: action.ticketId,
            gateName:
              gates.find((g) => g.gateId === gateId)?.gateName ?? "Cửa hiện tại",
            kind: "NORMAL",
            seat: {
              category: "Đã lưu máy",
              row: "-",
              number: 0,
              label: "Lưu ngoại tuyến",
            },
            checkedInAt: pendingItem.createdAt,
          });
          return;
        }

        const checkedIn = await checkInWithWaiting(
          (signal) =>
            api(
              `/showtimes/${encodeURIComponent(showtimeId.trim())}/check-in`,
              decodeCheckIn,
              {
                method: "POST",
                body: {
                  qrPayload: action.ticketId,
                  gateId: action.gateId,
                  requestId: action.requestId,
                },
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

        // Server confirmed! Remove from pending queue (counter decreases)
        await removePendingScan(pendingItem.id);
        markServerOnline();

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

        const isNetworkErr =
          error instanceof ApiError &&
          (error.status === 0 || error.code === "NETWORK_ERROR");

        if (isNetworkErr) {
          const failedAction = scanAction.current;
          if (!failedAction) {
            setStatus("ERROR");
            setMessage(error.message);
            return;
          }
          const failedPendingItem: PendingScan = {
            id: failedAction.requestId,
            showtimeId: failedAction.showtimeId,
            ticketId: failedAction.ticketId,
            gateId: failedAction.gateId,
            requestId: failedAction.requestId,
            createdAt: new Date().toISOString(),
            status: "pending",
            retryCount: 0,
          };
          try {
            await addPendingScan(failedPendingItem);
          } catch (queueError) {
            setStatus("ERROR");
            setMessage(
              queueError instanceof Error
                ? `Mất kết nối máy chủ và không thể lưu lượt quét ngoại tuyến: ${queueError.message}`
                : "Mất kết nối máy chủ và không thể lưu lượt quét ngoại tuyến.",
            );
            return;
          }
          void markTicketAsLocalCheckedIn(
            failedAction.showtimeId,
            failedAction.ticketId,
          ).catch(() => {});
          markServerOffline("Mất kết nối máy chủ");
          setStatus("RECORDED");
          setMessage(
            "Mất kết nối máy chủ. Lượt quét đã được lưu ngoại tuyến để đồng bộ sau.",
          );
          setResult({
            status: "ALREADY_RECORDED",
            ticketId: scannedTicketId,
            gateName:
              gates.find((g) => g.gateId === gateId)?.gateName ?? "Cửa hiện tại",
            kind: "NORMAL",
            seat: {
              category: "Đã lưu máy",
              row: "-",
              number: 0,
              label: "Lưu ngoại tuyến",
            },
            checkedInAt: new Date().toISOString(),
          });
          return;
        }

        // Server returned a business decision (e.g. 409 USED or 400 INVALID)
        const action = scanAction.current;
        if (action?.requestId) {
          await removePendingScan(action.requestId).catch(() => {});
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
    [
      showtimeId,
      gateId,
      qrKeys,
      gates,
      isDeviceOnline,
      browserOnline,
      stopCamera,
      refreshPendingCount,
    ],
  );

  const startCamera = useCallback(async () => {
    if (scanInProgress.current) return;
    if (!showtimeId.trim()) {
      setStatus("ERROR");
      setMessage("Nhập mã suất diễn trước khi bật camera.");
      return;
    }
    if (isDeviceOnline && !gateId) {
      setStatus("ERROR");
      setMessage("Chọn suất diễn và cửa được cấp quyền trước khi bật camera.");
      return;
    }

    try {
      const { Html5Qrcode } = await import("html5-qrcode");
      if (!scanner.current) {
        scanner.current = new Html5Qrcode("ticket-qr-reader");
      }
      const instance = scanner.current;
      await instance.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText) => {
          void validateTicket(decodedText);
        },
        () => {},
      );
      setCameraActive(true);
    } catch (error) {
      setCameraActive(false);
      setStatus("ERROR");
      setMessage(
        error instanceof Error
          ? error.message
          : "Không thể bật camera. Hãy kiểm tra quyền truy cập camera.",
      );
    }
  }, [showtimeId, gateId, isDeviceOnline, validateTicket]);

  const scanNext = useCallback(() => {
    if (scanInProgress.current) return;
    scanAction.current = null;
    setTicketId("");
    setUsed(null);
    setResult(null);
    setStatus("SCANNING");
    setMessage("Quét vé tiếp theo.");
    inputRef.current?.focus();
  }, []);

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
        <header className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Link
              href="/scanner/snapshot"
              className="text-sm text-primary underline"
            >
              Chuẩn bị danh sách vé
            </Link>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setOfflineModeSimulated((prev) => !prev);
                  setMessage(
                    offlineModeSimulated
                      ? "Đã chuyển sang chế độ trực tuyến."
                      : "Đã chuyển sang chế độ ngoại tuyến (mô phỏng mất mạng).",
                  );
                }}
                title="Bấm để chuyển đổi giữa Trực tuyến và Ngoại tuyến"
                data-testid="network-status"
                className={`inline-flex items-center gap-1.5 font-medium text-xs px-2.5 py-1 rounded-full border transition-colors cursor-pointer ${
                  isDeviceOnline
                    ? "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/20 hover:bg-emerald-500/20"
                    : "text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/20 hover:bg-amber-500/20"
                }`}
              >
                {isDeviceOnline ? (
                  <>
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    Trực tuyến (Bấm để thử Ngoại tuyến)
                  </>
                ) : (
                  <>
                    <CloudOff className="size-3.5" />
                    Ngoại tuyến (Bấm để về Trực tuyến)
                  </>
                )}
              </button>
              {pendingScansCount > 0 && (
                <span
                  data-testid="pending-scans-count"
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground bg-muted px-2.5 py-1 rounded-full"
                >
                  {pendingScansCount} lượt quét chờ đồng bộ
                </span>
              )}
              {isDeviceOnline && pendingScansCount > 0 && (
                <button
                  type="button"
                  disabled={isSyncingQueue}
                  onClick={() => void syncOfflineQueue()}
                  className="text-xs text-primary underline hover:text-primary/80 disabled:opacity-50"
                >
                  {isSyncingQueue ? "Đang đồng bộ..." : "Đồng bộ ngay"}
                </button>
              )}
            </div>
          </div>
          <h1 className="text-2xl font-bold">Soát vé bằng mã QR</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Chọn đúng suất diễn trước khi quét. Mỗi vé chỉ được check-in một
            lần.
          </p>
        </header>

        <OfflineBanner
          isOnline={isOnline && !isExplicitOffline}
          pendingCount={pendingCount}
          isSyncing={isSyncingState || isSyncingQueue}
          onRetrySync={() => void triggerSync()}
          syncSuccessMessage={syncSuccessMessage}
        />

        <div className="pointer-events-none fixed left-0 top-20 z-[9999] flex w-full flex-wrap items-center justify-between gap-2 border-b bg-background/95 px-4 pb-3 pt-2 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <span
              data-testid="network-status-indicator"
              className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full font-medium ${
                isOnline && !isExplicitOffline
                  ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
                  : "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300"
              }`}
            >
              <span
                className={`size-1.5 rounded-full ${
                  isOnline && !isExplicitOffline ? "bg-emerald-500" : "bg-amber-500"
                }`}
              />
              {isOnline && !isExplicitOffline ? "Trực tuyến" : "Ngoại tuyến"}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span>Lượt chờ đồng bộ:</span>
            <span
              data-testid="pending-scan-counter"
              className="font-bold text-foreground"
            >
              {pendingCount + pendingScansCount}
            </span>
          </div>
        </div>

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
                disabled={Boolean(
                  (isDeviceOnline && !gateId) ||
                    gatesLoading ||
                    !showtimeId.trim(),
                )}
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
                  disabled={requestPending || Boolean(isDeviceOnline && !gateId)}
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
                  disabled={requestPending || Boolean(isDeviceOnline && !gateId)}
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
