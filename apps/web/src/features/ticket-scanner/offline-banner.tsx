"use client";

import { CheckCircle, RotateCw, WifiOff } from "lucide-react";

interface OfflineBannerProps {
  isOnline: boolean;
  pendingCount: number;
  isSyncing: boolean;
  onRetrySync?: () => void;
  syncSuccessMessage?: string | null;
}

export function OfflineBanner({
  isOnline,
  pendingCount,
  isSyncing,
  onRetrySync,
  syncSuccessMessage,
}: OfflineBannerProps) {
  // Case 1: Offline
  if (!isOnline) {
    return (
      <div
        role="alert"
        aria-live="polite"
        data-testid="offline-status-banner"
        className="rounded-lg border border-amber-400 bg-amber-50 p-4 text-amber-950 dark:border-amber-600 dark:bg-amber-950/40 dark:text-amber-200"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <WifiOff
              className="mt-0.5 size-5 shrink-0 text-amber-700 dark:text-amber-400"
              aria-hidden="true"
            />
            <div>
              <p
                className="font-bold tracking-wide uppercase text-sm sm:text-base"
                data-testid="offline-banner-title"
              >
                {pendingCount > 0
                  ? `ĐANG NGOẠI TUYẾN — ${pendingCount} lượt quét chưa đồng bộ`
                  : "ĐANG NGOẠI TUYẾN — 0 lượt quét chưa đồng bộ"}
              </p>
              <p className="mt-0.5 text-xs text-amber-800 dark:text-amber-300">
                {pendingCount > 0
                  ? "Dữ liệu quét được lưu an toàn trên máy. Không tắt thiết bị khi còn dữ liệu chưa đẩy lên."
                  : "Thiết bị mất kết nối máy chủ. Bạn vẫn có thể tiếp tục soát vé, dữ liệu sẽ được lưu cục bộ."}
              </p>
            </div>
          </div>
          {onRetrySync && (
            <button
              type="button"
              onClick={onRetrySync}
              className="self-start rounded-md border border-amber-600 bg-white px-3 py-1.5 text-xs font-semibold text-amber-950 shadow-sm transition hover:bg-amber-100 disabled:opacity-50 dark:bg-amber-900 dark:text-amber-100 sm:self-center"
            >
              Thử kết nối lại
            </button>
          )}
        </div>
      </div>
    );
  }

  // Case 2: Online & Syncing
  if (isSyncing && pendingCount > 0) {
    return (
      <div
        role="status"
        aria-live="polite"
        data-testid="syncing-status-banner"
        className="rounded-lg border border-blue-400 bg-blue-50 p-4 text-blue-950 dark:border-blue-600 dark:bg-blue-950/40 dark:text-blue-200"
      >
        <div className="flex items-center gap-3">
          <RotateCw
            className="size-5 shrink-0 animate-spin text-blue-700 dark:text-blue-400"
            aria-hidden="true"
          />
          <div>
            <p
              className="font-bold tracking-wide uppercase text-sm sm:text-base"
              data-testid="syncing-banner-title"
            >
              {`ĐANG ĐỒNG BỘ — Còn ${pendingCount} lượt quét`}
            </p>
            <p className="mt-0.5 text-xs text-blue-800 dark:text-blue-300">
              Đang đẩy các lượt quét chờ lên máy chủ...
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Case 3: Transient success notice after completing sync
  if (syncSuccessMessage) {
    return (
      <div
        role="status"
        aria-live="polite"
        data-testid="synced-status-banner"
        className="rounded-lg border border-emerald-400 bg-emerald-50 p-3 text-emerald-950 dark:border-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-200 flex items-center justify-between"
      >
        <div className="flex items-center gap-2.5 text-sm">
          <CheckCircle className="size-4 shrink-0 text-emerald-600" aria-hidden="true" />
          <span>{syncSuccessMessage}</span>
        </div>
      </div>
    );
  }

  if (pendingCount > 0) {
    return (
      <div
        role="alert"
        aria-live="polite"
        data-testid="pending-sync-status-banner"
        className="rounded-lg border border-amber-400 bg-amber-50 p-4 text-amber-950 dark:border-amber-600 dark:bg-amber-950/40 dark:text-amber-200"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-bold tracking-wide uppercase text-sm sm:text-base">
              {`CÒN ${pendingCount} lượt quét chưa đồng bộ`}
            </p>
            <p className="mt-0.5 text-xs text-amber-800 dark:text-amber-300">
              Máy chủ chưa xác nhận các lượt quét đang chờ.
            </p>
          </div>
          {onRetrySync && (
            <button
              type="button"
              onClick={onRetrySync}
              className="self-start rounded-md border border-amber-600 bg-white px-3 py-1.5 text-xs font-semibold text-amber-950 shadow-sm transition hover:bg-amber-100 dark:bg-amber-900 dark:text-amber-100 sm:self-center"
            >
              Thử kết nối lại
            </button>
          )}
        </div>
      </div>
    );
  }

  return null;
}
