"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { readApiError } from "@/lib/api";
import {
  vietnamInputFromUtc,
  vietnamInputToUtc,
} from "@/lib/formatting/vietnam-input";

type Coupon = {
  id: string;
  code: string;
  type: "PERCENT" | "FIXED";
  value: number;
  maxUses: number;
  startsAt: string;
  expiresAt: string;
  isActive: boolean;
  redemptionRecords: number;
};

function defaultDate(offsetDays: number) {
  const date = new Date(Date.now() + offsetDays * 86_400_000);
  return vietnamInputFromUtc(date);
}

export function EventCouponsManager({ eventId }: { eventId: string }) {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [code, setCode] = useState("");
  const [type, setType] = useState<"PERCENT" | "FIXED">("PERCENT");
  const [value, setValue] = useState("");
  const [maxUses, setMaxUses] = useState("");
  const [startsAt, setStartsAt] = useState(() => defaultDate(0));
  const [expiresAt, setExpiresAt] = useState(() => defaultDate(7));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/events/${eventId}/coupons`, {
        cache: "no-store",
      });
      if (!response.ok) {
        setError((await readApiError(response)).message ?? "Không tải được mã giảm giá.");
        return;
      }
      const data = (await response.json()) as { coupons?: Coupon[] };
      setCoupons(Array.isArray(data.coupons) ? data.coupons : []);
    } catch {
      setError("Không tải được mã giảm giá. Hãy thử lại.");
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const response = await fetch(`/api/events/${eventId}/coupons`, {
          cache: "no-store",
        });
        if (!response.ok)
          throw new Error((await readApiError(response)).message ?? "Không tải được mã giảm giá.");
        const data = (await response.json()) as { coupons?: Coupon[] };
        if (active) setCoupons(Array.isArray(data.coupons) ? data.coupons : []);
      } catch (reason) {
        if (active) setError(reason instanceof Error ? reason.message : "Không tải được mã giảm giá. Hãy thử lại.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [eventId]);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError("");
    setMessage("");
    const body = {
      code,
      type,
      value: Number(value),
      maxUses: Number(maxUses),
      startsAt: vietnamInputToUtc(startsAt),
      expiresAt: vietnamInputToUtc(expiresAt),
    };
    try {
      const response = await fetch(`/api/events/${eventId}/coupons`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        setError((await readApiError(response)).message ?? "Không tạo được mã giảm giá.");
        return;
      }
      setCode("");
      setValue("");
      setMaxUses("");
      setMessage("Đã tạo mã giảm giá.");
      await load();
    } catch {
      setError("Không tạo được mã giảm giá. Hãy kiểm tra kết nối rồi thử lại.");
    } finally {
      setSaving(false);
    }
  }

  async function deactivate(couponId: string) {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(`/api/events/${eventId}/coupons/${couponId}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        setError((await readApiError(response)).message ?? "Không thể ngừng mã này.");
        return;
      }
      setMessage("Đã ngừng áp dụng mã giảm giá.");
      await load();
    } catch {
      setError("Không thể ngừng mã giảm giá. Hãy thử lại.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="operations-panel operations-form" aria-labelledby="event-coupons-title">
      <div>
        <h2 id="event-coupons-title">Mã giảm giá theo sự kiện</h2>
        <p>Mỗi đơn áp dụng tối đa một mã. Giá trị giảm được máy chủ tính theo tổng tiền vé.</p>
      </div>
      {error && <p role="alert" className="operations-notice operations-error">{error}</p>}
      {message && <p role="status" className="operations-notice">{message}</p>}
      <form onSubmit={(event) => void create(event)} className="operations-form" noValidate>
        <div>
          <Label htmlFor="coupon-code">Mã giảm giá *</Label>
          <Input id="coupon-code" value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} maxLength={32} required disabled={saving} autoComplete="off" />
        </div>
        <div>
          <Label htmlFor="coupon-type">Loại giảm *</Label>
          <select id="coupon-type" className="h-10 w-full rounded-md border bg-background px-3" value={type} onChange={(event) => setType(event.target.value as "PERCENT" | "FIXED")} disabled={saving}>
            <option value="PERCENT">Phần trăm</option>
            <option value="FIXED">Số tiền (₫)</option>
          </select>
        </div>
        <div>
          <Label htmlFor="coupon-value">{type === "PERCENT" ? "Tỷ lệ (%) *" : "Số tiền (₫) *"}</Label>
          <Input id="coupon-value" type="number" min={1} max={type === "PERCENT" ? 100 : undefined} step={1} value={value} onChange={(event) => setValue(event.target.value)} required disabled={saving} />
        </div>
        <div>
          <Label htmlFor="coupon-max-uses">Số lượt tối đa *</Label>
          <Input id="coupon-max-uses" type="number" min={1} step={1} value={maxUses} onChange={(event) => setMaxUses(event.target.value)} required disabled={saving} />
        </div>
        <div>
          <Label htmlFor="coupon-starts-at">Bắt đầu (giờ Việt Nam) *</Label>
          <Input id="coupon-starts-at" type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} required disabled={saving} />
        </div>
        <div>
          <Label htmlFor="coupon-expires-at">Hết hạn (giờ Việt Nam) *</Label>
          <Input id="coupon-expires-at" type="datetime-local" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} required disabled={saving} />
        </div>
        <Button type="submit" disabled={saving}>{saving ? "Đang lưu…" : "Tạo mã"}</Button>
      </form>
      {loading ? (
        <p role="status">Đang tải mã giảm giá…</p>
      ) : coupons.length === 0 ? (
        <p>Chưa có mã giảm giá cho sự kiện này.</p>
      ) : (
        <ul className="space-y-3" aria-label="Danh sách mã giảm giá">
          {coupons.map((coupon) => (
            <li key={coupon.id} className="flex flex-col gap-2 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <strong>{coupon.code}</strong>
                <p className="text-sm text-muted-foreground">
                  {coupon.type === "PERCENT" ? `${coupon.value}%` : `${coupon.value.toLocaleString("vi-VN")} ₫`} · {coupon.redemptionRecords}/{coupon.maxUses} lượt · {coupon.isActive ? "Đang bật" : "Đã ngừng"}
                </p>
                <p className="text-xs text-muted-foreground">{new Date(coupon.startsAt).toLocaleString("vi-VN")} – {new Date(coupon.expiresAt).toLocaleString("vi-VN")}</p>
              </div>
              {coupon.isActive && <Button type="button" variant="outline" disabled={saving} onClick={() => void deactivate(coupon.id)}>Ngừng mã</Button>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
