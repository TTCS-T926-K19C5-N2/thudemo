"use client";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
} from "react";
import {
  ZoomIn,
  ZoomOut,
  Scan,
  Check,
  LockKeyhole,
  Close,
} from "@/components/ui/material-icon";
import { Button } from "@/components/ui/button";
import type { Seat } from "@/lib/contracts/showtimes";
import { formatVnd } from "@/lib/formatting";
import { seatCategoryToken } from "@/lib/presentation/seat-category";

/* Hall geometry (CSS px before zoom). */
const SEAT = 26;
const PITCH = 35;
const ROW_PITCH = 38;
const AISLE = 28;
const LABEL = 32;
const PAD = 24;
const STAGE_H = 120;
const BREAK = 44;
const ICON_FONT = '400 15px "Material Symbols Outlined"';

type Layout = {
  rows: string[];
  positions: { x: number; y: number }[];
  breaks: { y: number; label: string }[];
  rowY: Map<string, number>;
  width: number;
  height: number;
  left: number;
  contentW: number;
};

/** Lay seats out by physical row: centred rows, aisles at section boundaries. */
function buildLayout(seats: Seat[], viewportWidth = 0): Layout {
  const rows = [...new Set(seats.map((s) => s.row))];
  const byRow = new Map<string, Seat[]>();
  for (const s of seats) {
    const list = byRow.get(s.row);
    if (list) list.push(s);
    else byRow.set(s.row, [s]);
  }
  const aisles = new Set<number>();
  for (const list of byRow.values()) {
    const sorted = list.toSorted((a, b) => a.seatNumber - b.seatNumber);
    for (let i = 1; i < sorted.length; i++)
      if (sorted[i].category !== sorted[i - 1].category)
        aisles.add(sorted[i - 1].seatNumber);
  }
  const maxSeat = Math.max(1, ...seats.map((s) => s.seatNumber));
  if (!aisles.size && maxSeat >= 8) aisles.add(Math.floor(maxSeat / 2));
  const aisleList = [...aisles];
  const pitch = viewportWidth
    ? Math.max(
        PITCH,
        Math.min(
          54,
          (viewportWidth - LABEL * 2 - PAD * 2 - aisleList.length * AISLE) /
            maxSeat,
        ),
      )
    : PITCH;
  const offsetOf = (n: number, min: number) =>
    (n - min) * pitch +
    aisleList.filter((a) => a >= min && a < n).length * AISLE;
  const extent = new Map<string, { min: number; span: number }>();
  for (const [row, list] of byRow) {
    const nums = list.map((s) => s.seatNumber);
    const min = Math.min(...nums);
    extent.set(row, { min, span: offsetOf(Math.max(...nums), min) + SEAT });
  }
  const contentW = Math.max(
    SEAT,
    ...[...extent.values()].map((e) => e.span),
  );
  const width = Math.max(560, contentW + LABEL * 2 + PAD * 2, viewportWidth);
  const left = (width - contentW) / 2;

  const rowY = new Map<string, number>();
  const breaks: Layout["breaks"] = [];
  let y = STAGE_H;
  let previous: Set<string> | null = null;
  for (const row of rows) {
    const cats = new Set(byRow.get(row)!.map((s) => s.category));
    if (previous && ![...cats].some((c) => previous!.has(c))) {
      const prevBottom = y - (ROW_PITCH - SEAT);
      breaks.push({
        y: (prevBottom + y + BREAK) / 2,
        label: [...cats].map((c) => `Hạng ${c}`).join(" · "),
      });
      y += BREAK;
    }
    rowY.set(row, y);
    y += ROW_PITCH;
    previous = cats;
  }
  const height = y - (ROW_PITCH - SEAT) + PAD;
  const positions = seats.map((s) => {
    const e = extent.get(s.row)!;
    return {
      x: left + (contentW - e.span) / 2 + offsetOf(s.seatNumber, e.min),
      y: rowY.get(s.row)!,
    };
  });
  return { rows, positions, breaks, rowY, width, height, left, contentW };
}

export function SeatMap({
  seats,
  selectable = false,
  onSelection,
  inspection = "below",
  showNumbers = false,
  selectedIds,
  ownedIds,
}: {
  seats: Seat[];
  selectable?: boolean;
  inspection?: "below" | "aside";
  showNumbers?: boolean;
  onSelection?: (seats: Seat[]) => void;
  selectedIds?: string[];
  ownedIds?: string[];
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const fitted = useRef(false);
  const [zoom, setZoom] = useState(1);
  const [viewportWidth, setViewportWidth] = useState(0);
  const [focus, setFocus] = useState(0);
  const [localSelected, setSelected] = useState<Set<string>>(new Set());
  const [iconsReady, setIconsReady] = useState(false);
  useEffect(() => {
    let active = true;
    void document.fonts.load(ICON_FONT).finally(() => {
      if (active) setIconsReady(true);
    });
    return () => {
      active = false;
    };
  }, []);
  const selected = useMemo(
    () => (selectedIds ? new Set(selectedIds) : localSelected),
    [selectedIds, localSelected],
  );
  const owned = useMemo(() => new Set(ownedIds), [ownedIds]);
  useEffect(() => {
    const viewport = canvas.current?.parentElement;
    if (!viewport) return;
    const resize = () => setViewportWidth(viewport.clientWidth);
    const observer = new ResizeObserver(resize);
    observer.observe(viewport);
    resize();
    return () => observer.disconnect();
  }, []);
  const layout = useMemo(
    () => buildLayout(seats, viewportWidth),
    [seats, viewportWidth],
  );
  const { rows, positions, width, height } = layout;
  const tiers = useMemo(
    () =>
      [...new Set(seats.map((s) => s.category))]
        .map((name) => {
          const inTier = seats.filter((s) => s.category === name);
          return {
            name,
            price: inTier[0]?.price ?? null,
            token: seatCategoryToken(name),
            free: inTier.filter((s) => s.status === "AVAILABLE").length,
          };
        })
        .toSorted((a, b) => (b.price ?? 0) - (a.price ?? 0)),
    [seats],
  );
  const available = useMemo(
    () => seats.filter((s) => s.status === "AVAILABLE").length,
    [seats],
  );

  // Fit wide halls to narrow screens once, keeping seats tappable.
  useEffect(() => {
    if (fitted.current || !seats.length) return;
    const visible = canvas.current?.parentElement?.clientWidth;
    if (!visible) return;
    fitted.current = true;
    if (visible < width) setZoom(Math.max(0.6, (visible - 8) / width));
  }, [seats.length, width]);

  useEffect(() => {
    const node = canvas.current;
    const ctx = node?.getContext("2d");
    if (!node || !ctx || !iconsReady) return;
    const computed = getComputedStyle(node);
    const token = (name: string) => computed.getPropertyValue(name).trim();
    const font = computed.fontFamily;
    const dpr = window.devicePixelRatio || 1;
    node.width = width * dpr;
    node.height = height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    // Stage: curved apron with a soft light spill toward the audience.
    const { left, contentW } = layout;
    const stageW = Math.min(width - PAD * 2, Math.max(320, contentW * 1.05));
    const sx = (width - stageW) / 2;
    const glow = ctx.createRadialGradient(
      width / 2, 40, 10, width / 2, 40, stageW * 0.62,
    );
    glow.addColorStop(0, "rgba(23, 92, 211, 0.16)");
    glow.addColorStop(1, "rgba(23, 92, 211, 0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, STAGE_H);
    const stage = ctx.createLinearGradient(0, 16, 0, 64);
    stage.addColorStop(0, token("--inverse-surface"));
    stage.addColorStop(1, token("--primary"));
    ctx.fillStyle = stage;
    ctx.beginPath();
    ctx.moveTo(sx + 10, 16);
    ctx.lineTo(sx + stageW - 10, 16);
    ctx.quadraticCurveTo(sx + stageW, 16, sx + stageW, 26);
    ctx.lineTo(sx + stageW, 44);
    ctx.quadraticCurveTo(width / 2, 74, sx, 44);
    ctx.lineTo(sx, 26);
    ctx.quadraticCurveTo(sx, 16, sx + 10, 16);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.font = `700 12px ${font}`;
    if ("letterSpacing" in ctx) ctx.letterSpacing = "4px";
    ctx.fillText("SÂN KHẤU", width / 2, 38);
    if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
    ctx.fillStyle = token("--outline");
    ctx.font = `500 10px ${font}`;
    ctx.fillText("Hướng nhìn của khán giả", width / 2, 88);

    // Row labels on both sides of the hall.
    ctx.font = `700 11px ${font}`;
    ctx.fillStyle = token("--muted-foreground");
    for (const row of rows) {
      const y = layout.rowY.get(row)! + SEAT / 2;
      ctx.fillText(row, left - LABEL / 2 - 4, y);
      ctx.fillText(row, left + contentW + LABEL / 2 + 4, y);
    }

    // Section dividers between non-overlapping price zones.
    for (const b of layout.breaks) {
      ctx.strokeStyle = token("--border");
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(left - LABEL, b.y);
      ctx.lineTo(left + contentW + LABEL, b.y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.font = `600 10px ${font}`;
      const text = b.label.toLocaleUpperCase("vi-VN");
      const w = ctx.measureText(text).width + 20;
      ctx.fillStyle = token("--card");
      ctx.beginPath();
      ctx.roundRect(width / 2 - w / 2, b.y - 10, w, 20, 10);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = token("--muted-foreground");
      ctx.fillText(text, width / 2, b.y + 0.5);
    }

    seats.forEach((s, i) => {
      const { x, y } = positions[i];
      const tier = token(seatCategoryToken(s.category));
      const mine = owned.has(s.id);
      const draft = selected.has(s.id);
      const shape = () => {
        ctx.beginPath();
        ctx.roundRect(x, y, SEAT, SEAT - 2, [8, 8, 4, 4]);
      };
      let glyph = "";
      let glyphColor = "#ffffff";
      if (mine || draft) {
        ctx.fillStyle = mine ? token("--primary") : token("--primary-container");
        shape();
        ctx.fill();
        glyph = "check";
      } else if (s.status === "SOLD") {
        ctx.fillStyle = token("--border");
        shape();
        ctx.fill();
        glyph = "close";
      } else if (s.status === "HELD") {
        ctx.fillStyle = token("--surface-container-highest");
        shape();
        ctx.fill();
        glyph = "lock";
        glyphColor = token("--outline");
      } else {
        ctx.globalAlpha = 0.14;
        ctx.fillStyle = tier;
        shape();
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.strokeStyle = tier;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
      // Seat cushion line for a chair silhouette.
      ctx.fillStyle =
        s.status === "AVAILABLE" && !mine && !draft ? tier : "rgba(0,0,0,0.12)";
      ctx.globalAlpha = s.status === "AVAILABLE" && !mine && !draft ? 0.55 : 1;
      ctx.fillRect(x + 4, y + SEAT - 2, SEAT - 8, 2);
      ctx.globalAlpha = 1;
      if (glyph) {
        ctx.fillStyle = glyphColor;
        ctx.font = ICON_FONT;
        ctx.fillText(glyph, x + SEAT / 2, y + SEAT / 2);
      } else if (showNumbers) {
        ctx.fillStyle = tier;
        ctx.font = `700 10px ${font}`;
        ctx.fillText(String(s.seatNumber), x + SEAT / 2, y + SEAT / 2);
      }
      if (focus === i) {
        ctx.strokeStyle = token("--ring");
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(x - 3, y - 3, SEAT + 6, SEAT + 4, 10);
        ctx.stroke();
      }
    });
    let paintedFrame = 0;
    const frame = requestAnimationFrame(() => {
      paintedFrame = requestAnimationFrame(() => {
        node.dataset.rendered = String(seats.length);
        performance.mark("seat-map-rendered");
      });
    });
    return () => {
      cancelAnimationFrame(frame);
      cancelAnimationFrame(paintedFrame);
    };
  }, [
    layout,
    width,
    height,
    seats,
    rows,
    positions,
    selected,
    owned,
    focus,
    showNumbers,
    iconsReady,
  ]);
  function inspect(index: number, toggle = false) {
    if (index < 0 || index >= seats.length) return;
    if (index !== focus) setFocus(index);
    const seat = seats[index];
    if (!toggle || !selectable || seat.status !== "AVAILABLE") return;
    const next = new Set(selected);
    if (next.has(seat.id)) next.delete(seat.id);
    else next.add(seat.id);
    if (!selectedIds) setSelected(next);
    onSelection?.(seats.filter((s) => next.has(s.id)));
  }
  function hit(e: ReactMouseEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / zoom;
    const y = (e.clientY - rect.top) / zoom;
    return positions.findIndex(
      (p) => x >= p.x && x <= p.x + SEAT && y >= p.y && y <= p.y + SEAT,
    );
  }
  const seat = seats[focus];
  const seatStatus = seat
    ? owned.has(seat.id)
      ? "Bạn đang giữ"
      : selected.has(seat.id)
        ? "Đang chọn"
        : seat.status === "SOLD"
          ? "Đã bán"
          : seat.status === "HELD"
            ? "Đang được giữ"
            : "Còn trống"
    : "";
  return (
    <section
      className={`product-map seat-hall ${inspection === "aside" ? "map-with-inspector" : ""}`}
      aria-label="Sơ đồ ghế"
    >
      <div className="product-toolbar">
        <div className="seat-hall-title">
          <h2>Sơ đồ khán phòng</h2>
          <p>
            <strong>{available.toLocaleString("vi-VN")}</strong> /{" "}
            {seats.length.toLocaleString("vi-VN")} ghế còn trống
          </p>
        </div>
        <div className="seat-hall-zoom" role="group" aria-label="Thu phóng sơ đồ">
          <Button
            variant="outline"
            aria-label="Thu nhỏ"
            onClick={() => setZoom((z) => Math.max(0.4, +(z - 0.2).toFixed(2)))}
          >
            <ZoomOut />
          </Button>
          <output aria-label="Mức thu phóng">{Math.round(zoom * 100)}%</output>
          <Button
            variant="outline"
            aria-label="Phóng to"
            onClick={() => setZoom((z) => Math.min(2, +(z + 0.2).toFixed(2)))}
          >
            <ZoomIn />
          </Button>
          <Button
            variant="outline"
            aria-label="Vừa màn hình"
            onClick={() => {
              const visible = canvas.current?.parentElement?.clientWidth;
              if (visible) setZoom(Math.min(1, (visible - 8) / width));
            }}
          >
            <Scan />
          </Button>
        </div>
      </div>
      <div className="map-legend-bar">
        <div className="product-legend seat-tier-legend" aria-label="Hạng vé">
          {tiers.map((t) => (
            <span
              key={t.name}
              className="seat-tier-chip"
              style={{ "--tier": `var(${t.token})` } as CSSProperties}
            >
              <i aria-hidden="true" />
              <b>{t.name}</b>
              <span>{formatVnd(t.price)}</span>
              <small>{t.free} trống</small>
            </span>
          ))}
        </div>
        <div className="product-legend seat-status-legend" aria-label="Chú thích">
          <span>
            <i className="legend-swatch" data-state="available" aria-hidden="true" />
            Còn trống
          </span>
          {selectable && (
            <span>
              <i className="legend-swatch" data-state="draft">
                <Check />
              </i>
              Đang chọn
            </span>
          )}
          {!!ownedIds?.length && (
            <span>
              <i className="legend-swatch" data-state="owned">
                <Check />
              </i>
              Bạn đang giữ
            </span>
          )}
          <span>
            <i className="legend-swatch" data-state="held">
              <LockKeyhole />
            </i>
            Đang được giữ
          </span>
          <span>
            <i className="legend-swatch" data-state="sold">
              <Close />
            </i>
            Đã bán
          </span>
        </div>
      </div>
      <div className="product-map-scroll">
        <canvas
          ref={canvas}
          style={{ width: width * zoom, height: height * zoom }}
          tabIndex={0}
          role="application"
          aria-label="Dùng phím mũi tên để xem ghế; Enter chọn ghế trống."
          aria-describedby="seat-inspector"
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              inspect(focus, true);
              return;
            }
            const current = seats[focus];
            if (!current || !e.key.startsWith("Arrow")) return;
            e.preventDefault();
            const rowIndex = rows.indexOf(current.row);
            const targetRow =
              e.key === "ArrowDown"
                ? rows[rowIndex + 1]
                : e.key === "ArrowUp"
                  ? rows[rowIndex - 1]
                  : current.row;
            const number =
              e.key === "ArrowRight"
                ? current.seatNumber + 1
                : e.key === "ArrowLeft"
                  ? current.seatNumber - 1
                  : current.seatNumber;
            const target = seats.findIndex(
              (s) => s.row === targetRow && s.seatNumber === number,
            );
            if (target >= 0) {
              inspect(target);
              const pos = positions[target];
              e.currentTarget.parentElement?.scrollTo({
                left: Math.max(0, pos.x * zoom - 100),
                top: Math.max(0, pos.y * zoom - 100),
              });
            }
          }}
          onPointerMove={(e) => {
            if (e.pointerType !== "mouse") return;
            const index = hit(e);
            e.currentTarget.style.cursor =
              index >= 0 && selectable && seats[index].status === "AVAILABLE"
                ? "pointer"
                : "default";
            inspect(index);
          }}
          onClick={(e) => inspect(hit(e), true)}
        />
      </div>
      <aside className="map-inspector">
        <output id="seat-inspector" aria-live="polite">
          {seat ? (
            <>
              <small>THÔNG TIN GHẾ</small>
              <h3>Chi tiết ghế đang xem</h3>
              <div
                className="inspected-seat"
                style={
                  { "--tier": `var(${seatCategoryToken(seat.category)})` } as CSSProperties
                }
              >
                <div>
                  <small>Vị trí ghế</small>
                  <strong>
                    Hàng {seat.row} · Ghế {seat.seatNumber}
                  </strong>
                </div>
                <dl>
                  <div>
                    <dt>Hạng vé</dt>
                    <dd>{seat.category}</dd>
                  </div>
                  <div>
                    <dt>Đơn giá</dt>
                    <dd>{formatVnd(seat.price)}</dd>
                  </div>
                  <div>
                    <dt>Trạng thái</dt>
                    <dd>{seatStatus}</dd>
                  </div>
                </dl>
              </div>
            </>
          ) : (
            "Chưa có ghế."
          )}
        </output>
      </aside>
    </section>
  );
}
