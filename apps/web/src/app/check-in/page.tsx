"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CurrentUser, loadCurrentUser } from "@/lib/api";
import { PublicLayout } from "@/components/layout/product-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  fetchTodayShowtimesS29,
  TodayShowtimeS29,
} from "@/lib/api-check-in-s29";

export const LOCAL_STORAGE_SHOWTIME_KEY = "checkin_showtime_s29";
export const LOCAL_STORAGE_GATE_KEY = "checkin_gate_s29";

const QUICK_GATES = ["Cửa A", "Cửa B", "Cửa C", "Cửa VIP", "Cửa 1", "Cửa 2"];

export default function CheckInPageS29() {
  const router = useRouter();
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);
  const [forbidden, setForbidden] = useState(false);

  const [showtimes, setShowtimes] = useState<TodayShowtimeS29[]>([]);
  const [loadingShowtimes, setLoadingShowtimes] = useState(true);
  const [showtimesError, setShowtimesError] = useState<string | null>(null);

  const [selectedShowtimeId, setSelectedShowtimeId] = useState<string>("");
  const [gate, setGate] = useState<string>("");
  const [isConfigured, setIsConfigured] = useState(false);
  const [saveSuccessMessage, setSaveSuccessMessage] = useState<string | null>(
    null,
  );

  useEffect(() => {
    let mounted = true;
    loadCurrentUser()
      .then((result) => {
        if (!mounted) return;
        if (!result) {
          router.replace("/login?returnTo=/check-in");
        } else if (!result.roles.includes("STAFF")) {
          setForbidden(true);
        } else {
          setUser(result);
        }
      })
      .catch(() => {
        if (mounted) router.replace("/login?returnTo=/check-in");
      })
      .finally(() => {
        if (mounted) setLoadingUser(false);
      });

    return () => {
      mounted = false;
    };
  }, [router]);

  useEffect(() => {
    if (!user) return;
    let mounted = true;

    fetchTodayShowtimesS29()
      .then((data) => {
        if (!mounted) return;
        setShowtimes(data);

        // Restore from localStorage
        const savedShowtimeId = localStorage.getItem(
          LOCAL_STORAGE_SHOWTIME_KEY,
        );
        const savedGate = localStorage.getItem(LOCAL_STORAGE_GATE_KEY);

        if (savedGate) {
          setGate(savedGate);
        }

        if (savedShowtimeId && data.some((s) => s.id === savedShowtimeId)) {
          setSelectedShowtimeId(savedShowtimeId);
          if (savedGate && savedGate.trim()) {
            setIsConfigured(true);
            setSaveSuccessMessage("Đã khôi phục cấu hình soát vé từ thiết bị.");
          }
        } else if (data.length > 0) {
          setSelectedShowtimeId(data[0].id);
        }
      })
      .catch((err) => {
        if (mounted) {
          setShowtimesError(
            err instanceof Error
              ? err.message
              : "Không thể tải danh sách suất diễn hôm nay.",
          );
        }
      })
      .finally(() => {
        if (mounted) setLoadingShowtimes(false);
      });

    return () => {
      mounted = false;
    };
  }, [user]);

  const handleSaveConfig = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanGate = gate.trim();
    if (!selectedShowtimeId || !cleanGate) return;

    localStorage.setItem(LOCAL_STORAGE_SHOWTIME_KEY, selectedShowtimeId);
    localStorage.setItem(LOCAL_STORAGE_GATE_KEY, cleanGate);
    setIsConfigured(true);
    setSaveSuccessMessage(
      `Đã lưu cấu hình: Suất diễn ${selectedShowtime?.eventName ?? selectedShowtimeId}, ${cleanGate}.`,
    );
  };

  const handleChangeConfig = () => {
    setIsConfigured(false);
    setSaveSuccessMessage(null);
  };

  const selectedShowtime = showtimes.find((s) => s.id === selectedShowtimeId);

  // 1. Loading State
  if (loadingUser) {
    return (
      <PublicLayout signedIn={false}>
        <div className="operations-page max-w-md mx-auto p-4 space-y-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-40 w-full" />
        </div>
      </PublicLayout>
    );
  }

  // 2. Forbidden State (Not STAFF)
  if (forbidden) {
    return (
      <PublicLayout signedIn={true}>
        <div className="operations-page max-w-md mx-auto p-4">
          <div
            className="operations-panel border border-red-200 bg-red-50 p-6 rounded-lg text-center"
            role="alert"
          >
            <h2 className="text-xl font-bold text-red-800 mb-2">
              Truy cập bị từ chối
            </h2>
            <p className="text-sm text-red-700 mb-4">
              Tài khoản của bạn không có vai trò Nhân viên soát vé (STAFF). Chỉ
              nhân viên soát vé mới được quyền vào khu vực này.
            </p>
            <Button variant="outline" asChild>
              <Link href="/">Quay về trang chủ</Link>
            </Button>
          </div>
        </div>
      </PublicLayout>
    );
  }

  // 3. STAFF User View
  return (
    <PublicLayout signedIn={true}>
      <div className="operations-page max-w-lg mx-auto p-4 space-y-6">
        <div className="page-heading">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold">Khu vực Soát vé</h1>
              <Badge variant="outline" className="text-xs">
                STAFF
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Chọn suất diễn đang diễn ra hôm nay và khai báo cửa trước khi bật
              máy ảnh quét vé.
            </p>
          </div>
        </div>

        {saveSuccessMessage && (
          <div
            className="p-3 bg-green-50 border border-green-200 text-green-800 rounded-md text-sm"
            role="status"
          >
            {saveSuccessMessage}
          </div>
        )}

        {loadingShowtimes ? (
          <div className="space-y-4" aria-label="Đang tải dữ liệu">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : showtimesError ? (
          <div
            className="p-4 bg-red-50 border border-red-200 text-red-800 rounded-md text-sm"
            role="alert"
          >
            {showtimesError}
          </div>
        ) : showtimes.length === 0 ? (
          /* Empty State (AC 3): Không có suất nào hôm nay */
          <div
            className="operations-panel p-6 border rounded-lg bg-card text-center space-y-3"
            role="status"
          >
            <div className="inline-flex p-3 rounded-full bg-muted text-muted-foreground mb-1">
              <span className="text-2xl">📅</span>
            </div>
            <h2 className="text-lg font-semibold text-foreground">
              Không có suất diễn nào hôm nay
            </h2>
            <p className="text-sm text-muted-foreground">
              Hiện tại không có suất diễn nào đang diễn ra trong ngày hôm nay để
              thực hiện soát vé.
            </p>
          </div>
        ) : isConfigured && selectedShowtime ? (
          /* Configured View: Ready to scan */
          <div className="operations-panel p-6 border rounded-lg bg-card space-y-5 shadow-sm">
            <div className="flex items-center justify-between border-b pb-3">
              <div>
                <span className="text-xs font-semibold uppercase text-muted-foreground">
                  Trạng thái thiết lập
                </span>
                <div className="flex items-center gap-2 mt-1">
                  <span className="inline-block w-2.5 h-2.5 bg-green-500 rounded-full animate-pulse" />
                  <span className="font-semibold text-green-700">
                    Sẵn sàng soát vé
                  </span>
                </div>
              </div>
              <Badge variant="outline">{gate}</Badge>
            </div>

            <div className="space-y-2 text-sm">
              <div>
                <span className="text-muted-foreground">Sự kiện:</span>{" "}
                <strong className="text-foreground">
                  {selectedShowtime.eventName}
                </strong>
              </div>
              <div>
                <span className="text-muted-foreground">Giờ diễn:</span>{" "}
                <span className="font-medium text-foreground">
                  {new Date(selectedShowtime.startTime).toLocaleTimeString(
                    "vi-VN",
                    {
                      hour: "2-digit",
                      minute: "2-digit",
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                    },
                  )}
                </span>
              </div>
              {selectedShowtime.location && (
                <div>
                  <span className="text-muted-foreground">Địa điểm:</span>{" "}
                  <span className="text-foreground">
                    {selectedShowtime.location}
                  </span>
                </div>
              )}
              <div>
                <span className="text-muted-foreground">Cửa soát vé:</span>{" "}
                <strong className="text-foreground text-base">{gate}</strong>
              </div>
            </div>

            <div className="pt-2 flex flex-col gap-2">
              <Button
                id="start-camera-scan-btn"
                className="w-full bg-primary hover:bg-primary/90"
                onClick={() => {
                  alert(
                    `Bắt đầu máy ảnh quét vé cho Suất: ${selectedShowtime.eventName} tại Cửa: ${gate}`,
                  );
                }}
              >
                Bật máy ảnh quét mã QR
              </Button>
              <Button
                id="change-config-btn"
                variant="outline"
                className="w-full"
                onClick={handleChangeConfig}
              >
                Đổi suất diễn hoặc cửa khác
              </Button>
            </div>
          </div>
        ) : (
          /* Selection Form: Select showtime and gate (AC 1 & AC 2) */
          <form
            onSubmit={handleSaveConfig}
            className="operations-panel p-6 border rounded-lg bg-card space-y-5 shadow-sm"
          >
            <div className="space-y-2">
              <label
                htmlFor="showtime-select"
                className="block text-sm font-semibold"
              >
                Chọn suất diễn hôm nay <span className="text-red-500">*</span>
              </label>
              <select
                id="showtime-select"
                className="w-full p-2.5 border rounded-md bg-background text-sm focus:ring-2 focus:ring-primary"
                value={selectedShowtimeId}
                onChange={(e) => setSelectedShowtimeId(e.target.value)}
                required
              >
                {showtimes.map((show) => {
                  const timeFormatted = new Date(
                    show.startTime,
                  ).toLocaleTimeString("vi-VN", {
                    hour: "2-digit",
                    minute: "2-digit",
                  });
                  return (
                    <option key={show.id} value={show.id}>
                      {timeFormatted} - {show.eventName}
                      {show.location ? ` (${show.location})` : ""}
                    </option>
                  );
                })}
              </select>
            </div>

            <div className="space-y-2">
              <label
                htmlFor="gate-input"
                className="block text-sm font-semibold"
              >
                Khai báo tên cửa soát vé <span className="text-red-500">*</span>
              </label>
              <Input
                id="gate-input"
                type="text"
                placeholder="Ví dụ: Cửa A, Cửa 1, Cửa VIP..."
                value={gate}
                onChange={(e) => setGate(e.target.value)}
                required
              />
              <div className="flex flex-wrap gap-1.5 pt-1">
                <span className="text-xs text-muted-foreground self-center mr-1">
                  Gợi ý nhanh:
                </span>
                {QUICK_GATES.map((g) => (
                  <button
                    key={g}
                    type="button"
                    className="text-xs px-2.5 py-1 rounded border bg-muted/50 hover:bg-muted transition-colors"
                    onClick={() => setGate(g)}
                  >
                    {g}
                  </button>
                ))}
              </div>
            </div>

            <Button
              id="save-config-btn"
              type="submit"
              className="w-full mt-4"
              disabled={!selectedShowtimeId || !gate.trim()}
            >
              Xác nhận & Lưu cấu hình
            </Button>
          </form>
        )}
      </div>
    </PublicLayout>
  );
}
