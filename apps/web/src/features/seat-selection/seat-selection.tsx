"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Clock3,
  CircleAlert,
  Check,
  Armchair,
  RotateCw,
} from "@/components/ui/material-icon";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { SeatMap } from "@/components/seat-map/seat-map";
import { MobileShowHeader } from "@/components/layout/product-layout";
import { api, ApiError } from "@/lib/api/client";
import { loadCurrentUser } from "@/lib/api";
import { decodeHoldState, type HoldState } from "@/lib/contracts/holds";
import {
  decodePublicShowtime,
  decodeSeats,
  type Seat,
  type PublicShowtime,
} from "@/lib/contracts/showtimes";
import { formatVnd, formatShowtime } from "@/lib/formatting";
import {
  countdownLabel,
  remainingSeconds,
  type ServerClock,
} from "./server-countdown";

export function SeatSelection({ id }: { id: string }) {
  const router = useRouter();
  const [show, setShow] = useState<PublicShowtime | null>(null),
    [seats, setSeats] = useState<Seat[]>([]),
    [draft, setDraft] = useState<Seat[]>([]);
  const [hold, setHold] = useState<HoldState["hold"]>(null),
    [clock, setClock] = useState<ServerClock | null>(null),
    [remaining, setRemaining] = useState(0);
  const [error, setError] = useState(""),
    [expired, setExpired] = useState(false),
    [pending, setPending] = useState(false),
    [conflict, setConflict] = useState<Seat[]>([]);
  const authority = useRef<HoldState["hold"]>(null),
    busy = useRef(false),
    alive = useRef(true);
  const apply = useCallback((state: HoldState) => {
    if (!alive.current) return;
    if (authority.current && !state.hold) {
      setExpired(true);
      setDraft([]);
    }
    authority.current = state.hold;
    setHold(state.hold);
    const anchor = {
      serverMs: Date.parse(state.serverTime),
      receivedAt: performance.now(),
    };
    setClock(anchor);
    setRemaining(
      state.hold
        ? remainingSeconds(state.hold.expiresAt, anchor, anchor.receivedAt)
        : 0,
    );
    if (state.hold) setExpired(false);
  }, []);
  const refresh = useCallback(async () => {
    if (busy.current) return;
    const [state, map] = await Promise.all([
      api(`/showtimes/${id}/holds`, decodeHoldState),
      api(`/showtimes/${id}/seats`, decodeSeats),
    ]);
    if (!alive.current || busy.current) return;
    apply(state);
    setSeats(map);
    setDraft((current) =>
      current.filter((s) =>
        map.some((next) => next.id === s.id && next.status === "AVAILABLE"),
      ),
    );
    return state;
  }, [apply, id]);
  useEffect(() => {
    alive.current = true;
    const controller = new AbortController();
    async function load() {
      const user = await loadCurrentUser();
      if (controller.signal.aborted) return;
      if (!user) {
        router.replace(
          `/login?returnTo=${encodeURIComponent(`/shows/${id}/seats`)}`,
        );
        return;
      }
      if (!user.roles.includes("BUYER"))
        throw Error("Tài khoản cần vai trò người mua để chọn ghế.");
      const [detail, map, state] = await Promise.all([
        api(`/showtimes/${id}`, decodePublicShowtime, {
          signal: controller.signal,
        }),
        api(`/showtimes/${id}/seats`, decodeSeats, {
          signal: controller.signal,
        }),
        api(`/showtimes/${id}/holds`, decodeHoldState, {
          signal: controller.signal,
        }),
      ]);
      if (controller.signal.aborted) return;
      setShow(detail);
      setSeats(map);
      apply(state);
    }
    void load().catch((e) => {
      if (!controller.signal.aborted)
        setError(
          e instanceof Error ? e.message : "Không tải được sơ đồ. Hãy thử lại.",
        );
    });
    const reconnect = () => {
      void refresh()
        .then(() => setError(""))
        .catch(() =>
          setError(
            "Không đồng bộ được thời hạn. Kiểm tra kết nối rồi thử lại.",
          ),
        );
    };
    const visible = () => {
      if (document.visibilityState === "visible") reconnect();
    };
    window.addEventListener("online", reconnect);
    window.addEventListener("focus", reconnect);
    document.addEventListener("visibilitychange", visible);
    return () => {
      alive.current = false;
      controller.abort();
      window.removeEventListener("online", reconnect);
      window.removeEventListener("focus", reconnect);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [apply, id, refresh, router]);
  useEffect(() => {
    if (!hold || !clock) return;
    let checking = false;
    const tick = () => {
      const value = remainingSeconds(hold.expiresAt, clock, performance.now());
      setRemaining(value);
      if (value === 0 && !checking) {
        checking = true;
        void refresh()
          .catch(() =>
            setError(
              "Không kiểm tra được thời hạn. Kết nối lại để xác nhận trạng thái ghế.",
            ),
          )
          .finally(() => {
            checking = false;
          });
      }
    };
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [hold, clock, refresh]);
  const selectedIds = useMemo(() => draft.map((s) => s.id), [draft]);
  const ownedIds = useMemo(() => hold?.seatIds ?? [], [hold]);
  const held = useMemo(
    () => seats.filter((s) => ownedIds.includes(s.id)),
    [seats, ownedIds],
  );
  const summary = conflict.length ? conflict : [...held, ...draft];
  async function claim() {
    if (busy.current || !draft.length) return;
    busy.current = true;
    setPending(true);
    setError("");
    setConflict([]);
    try {
      const state = await api(`/showtimes/${id}/holds`, decodeHoldState, {
        method: "POST",
        body: { seatIds: selectedIds },
      });
      apply(state);
      setDraft([]);
      setExpired(false);
    } catch (e) {
      if (
        e instanceof ApiError &&
        e.status === 409 &&
        e.code === "SEAT_CONFLICT"
      ) {
        const rejected = e.details.rejectedSeatIds;
        setConflict(
          Array.isArray(rejected)
            ? draft.filter((s) => rejected.includes(s.id))
            : draft,
        );
        setDraft([]);
      } else
        setError(
          e instanceof Error ? e.message : "Không giữ được ghế. Hãy thử lại.",
        );
    } finally {
      busy.current = false;
      setPending(false);
      // Reconcile even a lost POST response; only the server can confirm success.
      await refresh()
        .then((state) => {
          if (
            state?.hold &&
            selectedIds.every((seatId) => state.hold?.seatIds.includes(seatId))
          ) {
            setError("");
            setDraft([]);
          }
        })
        .catch(() =>
          setError(
            "Chưa xác nhận được trạng thái trên máy chủ. Tải lại trước khi giữ tiếp.",
          ),
        );
    }
  }
  async function retry() {
    setError("");
    setConflict([]);
    await refresh().catch(() =>
      setError("Không tải được sơ đồ. Kiểm tra kết nối rồi thử lại."),
    );
  }
  if (!show)
    return error ? (
      <Alert variant="destructive">
        <AlertDescription>
          {error}
          <Button variant="outline" onClick={() => window.location.reload()}>
            Thử lại
          </Button>
        </AlertDescription>
      </Alert>
    ) : (
      <Skeleton className="h-80 w-full" />
    );
  return (
    <>
      <MobileShowHeader
        href={`/shows/${id}`}
        title="Chọn và giữ ghế"
        subtitle={show.event.name}
      >
        <span className="mobile-hold-time">
          <Clock3 size={14} />
          {hold ? countdownLabel(remaining) : expired ? "00:00" : "--:--"}
        </span>
      </MobileShowHeader>
      <div className="selection-mobile-context">
        <span>{show.event.location}</span>
        <span>{formatShowtime(show.startTime, "short")}</span>
      </div>
      <Link href={`/shows/${id}`} className="selection-back-link text-xs">
        ← Chi tiết suất diễn
      </Link>
      <header
        className="selection-heading"
        data-seat-state={
          conflict.length
            ? "conflict"
            : expired
              ? "expired"
              : hold
                ? "held"
                : "draft"
        }
      >
        <h1>Chọn và giữ ghế</h1>
        <p>
          {show.event.name} · {formatShowtime(show.startTime)} ·{" "}
          {show.event.location}
        </p>
      </header>
      {error && (
        <Alert variant="destructive">
          <CircleAlert />
          <AlertDescription>
            {error}
            <Button variant="outline" onClick={retry}>
              Thử lại
            </Button>
          </AlertDescription>
        </Alert>
      )}
      {expired && (
        <Alert className="hold-alert hold-alert-expired" variant="destructive">
          <Clock3 />
          <AlertTitle>Thời gian giữ ghế đã hết</AlertTitle>
          <AlertDescription>
            Sơ đồ đã được cập nhật; hãy chọn lại ghế còn trống.
            <Button variant="outline" onClick={retry}>
              Tải lại sơ đồ
            </Button>
          </AlertDescription>
        </Alert>
      )}
      <div className="product-seat-layout">
        <div>
          {conflict.length > 0 && (
            <Alert
              className="hold-alert hold-alert-conflict"
              variant="destructive"
            >
              <CircleAlert />
              <AlertTitle>
                Ghế {conflict.map((s) => `${s.row}-${s.seatNumber}`).join(", ")}{" "}
                vừa được người khác giữ
              </AlertTitle>
              <AlertDescription>
                Toàn bộ lượt chọn này chưa được giữ. Hãy chọn lại ghế còn trống.
              </AlertDescription>
            </Alert>
          )}
          <SeatMap
            seats={seats}
            selectable={!pending}
            selectedIds={selectedIds}
            ownedIds={ownedIds}
            onSelection={(value) => {
              setDraft(value);
              setConflict([]);
              setExpired(false);
            }}
          />
        </div>
        <aside className="seat-summary">
          <div className={`hold-clock ${expired ? "hold-clock-expired" : ""}`}>
            <span>
              <Clock3 size={20} /> {expired ? "Đã hết hạn" : "Thời gian giữ vé"}
            </span>
            <output aria-label="Thời gian giữ ghế">
              {hold ? countdownLabel(remaining) : expired ? "00:00" : "--:--"}
            </output>
          </div>
          <p className="hold-rule">
            10 phút tính từ ghế đầu tiên được máy chủ xác nhận. Thêm ghế không
            gia hạn.
          </p>
          {hold && remaining > 0 && (
            <Badge variant="secondary">
              <Check size={12} /> <span>Máy chủ đã xác nhận</span>
            </Badge>
          )}
          <h2>
            {conflict.length
              ? "Ghế bị từ chối"
              : hold
                ? "Ghế đã giữ"
                : "Ghế đang chọn"}{" "}
            ({summary.length})
          </h2>
          {summary.length ? (
            summary.map((s) => (
              <div
                className={`hold-seat ${conflict.length ? "hold-seat-conflict" : ""}`}
                key={s.id}
              >
                <span>
                  <b>
                    {s.row}-{s.seatNumber}
                  </b>
                  <small>
                    {s.category} ·{" "}
                    {conflict.length
                      ? "Bị trùng / Đã có người giữ"
                      : ownedIds.includes(s.id)
                        ? "Đã giữ"
                        : "Chưa giữ"}
                  </small>
                </span>
                <b>{formatVnd(s.price)}</b>
              </div>
            ))
          ) : (
            <div className="hold-empty">
              <Armchair size={28} />
              <b>Chưa có ghế nào được chọn</b>
              <span>Chạm vào ghế trống trên sơ đồ.</span>
            </div>
          )}
          <Separator className="my-4" />
          <p>Tổng tạm tính</p>
          <strong>
            {formatVnd(
              (conflict.length ? held : summary).reduce(
                (sum, s) => sum + (s.price ?? 0),
                0,
              ),
            )}
          </strong>
          {conflict.length > 0 ? (
            <Button onClick={retry}>
              <RotateCw /> Làm mới sơ đồ & Chọn lại
            </Button>
          ) : expired ? (
            <Button
              onClick={() => {
                setExpired(false);
                void retry();
              }}
            >
              <RotateCw /> Chọn lại ghế
            </Button>
          ) : (
            <Button
              disabled={
                pending || !draft.length || Boolean(hold && remaining === 0)
              }
              onClick={claim}
            >
              {pending ? "Đang xác nhận…" : hold ? "Giữ thêm ghế" : "Giữ ghế"}
            </Button>
          )}
          {!hold && !expired && (
            <p>Đồng hồ chỉ bắt đầu khi máy chủ xác nhận giữ ghế thành công.</p>
          )}
          {hold && remaining === 0 && (
            <p role="status">Đang kiểm tra thời hạn trên máy chủ…</p>
          )}
          {hold && (
            <>
              <Button variant="outline" disabled>
                Tiếp tục
              </Button>
              <p>Đặt vé và thanh toán chưa khả dụng.</p>
            </>
          )}
        </aside>
      </div>
    </>
  );
}
