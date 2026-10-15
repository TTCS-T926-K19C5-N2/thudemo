"use client";
import { useEffect, useMemo, useRef, useState } from "react";
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
  const [zoom, setZoom] = useState(1);
  const [focus, setFocus] = useState(0);
  const [localSelected, setSelected] = useState<Set<string>>(new Set());
  const [iconsReady, setIconsReady] = useState(false);
  useEffect(() => {
    let active = true;
    void document.fonts
      .load('400 14px "Material Symbols Outlined"')
      .finally(() => {
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
  const rows = useMemo(() => [...new Set(seats.map((s) => s.row))], [seats]);
  const categories = useMemo(
    () => [...new Set(seats.map((s) => s.category))],
    [seats],
  );
  const zones = useMemo(() => {
    let offset = 100;
    return categories.map((name) => {
      const zoneRows = [
        ...new Set(seats.filter((s) => s.category === name).map((s) => s.row)),
      ];
      const zone = {
        name,
        rows: zoneRows,
        top: offset,
        height: zoneRows.length * 28 + 70,
      };
      offset += zone.height + 24;
      return zone;
    });
  }, [seats, categories]);
  const positions = useMemo(
    () =>
      seats.map((s) => {
        const zone = zones.find((z) => z.name === s.category)!;
        return {
          x:
            65 +
            (s.seatNumber - 1) * 23 +
            Math.floor((s.seatNumber - 1) / 10) * 16,
          y: zone.top + 45 + zone.rows.indexOf(s.row) * 28,
        };
      }),
    [seats, zones],
  );
  const width = Math.max(500, ...positions.map((p) => p.x + 70));
  const height = (zones.at(-1)?.top ?? 0) + (zones.at(-1)?.height ?? 0) + 32;
  useEffect(() => {
    const node = canvas.current;
    const ctx = node?.getContext("2d");
    if (!node || !ctx || !iconsReady) return;
    const computed = getComputedStyle(node);
    const categoryColor = (name: string) =>
      computed.getPropertyValue(seatCategoryToken(name)).trim();
    const dpr = window.devicePixelRatio || 1;
    node.width = width * dpr;
    node.height = height * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);
    const token = (name: string) => computed.getPropertyValue(name).trim();
    ctx.fillStyle = token("--surface-container-highest");
    ctx.fillRect(70, 12, width - 140, 32);
    ctx.fillStyle = token("--muted-foreground");
    ctx.font = `12px ${computed.fontFamily}`;
    ctx.textAlign = "center";
    ctx.fillText("SÂN KHẤU BIỂU DIỄN", width / 2, 33);
    zones.forEach((zone) => {
      ctx.fillStyle = token("--card");
      ctx.strokeStyle = computed.getPropertyValue("--border").trim();
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(32, zone.top, width - 64, zone.height, 8);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = categoryColor(zone.name);
      ctx.textAlign = "left";
      ctx.font = `600 12px ${computed.fontFamily}`;
      ctx.fillText(
        `■ KHU VỰC ${zone.name.toLocaleUpperCase("vi-VN")}`,
        50,
        zone.top + 25,
      );
      ctx.fillStyle = computed.getPropertyValue("--muted-foreground").trim();
      ctx.font = `11px ${computed.fontFamily}`;
      ctx.textAlign = "center";
      zone.rows.forEach((row, index) =>
        ctx.fillText(row, 48, zone.top + 57 + index * 28),
      );
    });
    seats.forEach((s, i) => {
      const { x, y } = positions[i];
      const chosen = selected.has(s.id) || owned.has(s.id);
      ctx.fillStyle = chosen
        ? token("--primary-container")
        : s.status === "AVAILABLE"
          ? token("--card")
          : s.status === "SOLD"
            ? token("--inverse-surface")
            : token("--surface-container-highest");
      ctx.strokeStyle =
        s.status === "AVAILABLE"
          ? categoryColor(s.category)
          : token("--outline");
      ctx.lineWidth = focus === i ? 2.5 : 1;
      ctx.fillRect(x, y, 16, 16);
      ctx.strokeRect(x, y, 16, 16);
      ctx.fillStyle =
        chosen || s.status === "SOLD"
          ? token("--primary-foreground")
          : ctx.strokeStyle;
      ctx.font =
        chosen || s.status !== "AVAILABLE"
          ? '400 14px "Material Symbols Outlined"'
          : `10px ${computed.fontFamily}`;
      ctx.fillText(
        chosen
          ? "check"
          : s.status === "SOLD"
            ? "close"
            : s.status === "HELD"
              ? "lock"
              : showNumbers
                ? String(s.seatNumber)
                : "",
        x + 8,
        y + 11,
      );
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
    width,
    height,
    zones,
    seats,
    categories,
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
  const seat = seats[focus];
  return (
    <section
      className={`product-map ${inspection === "aside" ? "map-with-inspector" : ""}`}
      aria-label="Sơ đồ ghế"
    >
      <div className="product-toolbar">
        <h2>Sơ đồ ghế · {seats.length.toLocaleString("vi-VN")} ghế</h2>
        <div>
          <Button
            variant="outline"
            aria-label="Thu nhỏ"
            onClick={() => setZoom((z) => Math.max(0.4, z - 0.2))}
          >
            <ZoomOut />
          </Button>{" "}
          <Button
            variant="outline"
            aria-label="Vừa màn hình"
            onClick={() => {
              const visible = canvas.current?.parentElement?.clientWidth;
              if (visible) setZoom(Math.min(1, (visible - 16) / width));
            }}
          >
            <Scan />
          </Button>{" "}
          <Button
            variant="outline"
            aria-label="Phóng to"
            onClick={() => setZoom((z) => Math.min(2, z + 0.2))}
          >
            <ZoomIn />
          </Button>
        </div>
      </div>
      <div className="map-legend-bar">
        <div className="product-legend">
          <span>
            <i
              className="legend-swatch"
              data-state="available"
              aria-hidden="true"
            />
            Trống
          </span>
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
          {selectable && (
            <span>
              <i className="legend-swatch" data-state="draft">
                <Check />
              </i>
              Chọn nháp
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
        </div>
        <div className="product-legend">
          {categories.map((c) => (
            <span key={c} style={{ color: `var(${seatCategoryToken(c)})` }}>
              □ {c}:{" "}
              {formatVnd(seats.find((s) => s.category === c)?.price ?? null)}
            </span>
          ))}
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
            if (e.key === "Enter") {
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
            const rect = e.currentTarget.getBoundingClientRect();
            const x = (e.clientX - rect.left) / zoom;
            const y = (e.clientY - rect.top) / zoom;
            inspect(
              positions.findIndex(
                (p) => x >= p.x && x <= p.x + 16 && y >= p.y && y <= p.y + 16,
              ),
            );
          }}
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const x = (e.clientX - rect.left) / zoom;
            const y = (e.clientY - rect.top) / zoom;
            inspect(
              positions.findIndex(
                (p) => x >= p.x && x <= p.x + 16 && y >= p.y && y <= p.y + 16,
              ),
              true,
            );
          }}
        />
      </div>
      <aside className="map-inspector">
        <output id="seat-inspector" aria-live="polite">
          {seat ? (
            <>
              <small>THÔNG TIN GHẾ</small>
              <h3>Chi tiết ghế đang xem</h3>
              <div className="inspected-seat">
                <div>
                  <small>Vị trí ghế</small>
                  <strong>
                    Ghế {seat.row}-{seat.seatNumber}
                  </strong>
                </div>
                <dl>
                  <div>
                    <dt>Hàng</dt>
                    <dd>{seat.row}</dd>
                  </div>
                  <div>
                    <dt>Số ghế</dt>
                    <dd>{seat.seatNumber}</dd>
                  </div>
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
                    <dd>
                      {seat.status === "SOLD"
                        ? "Đã bán"
                        : seat.status === "HELD"
                          ? "Đang giữ"
                          : "Trống"}
                    </dd>
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
