"use client";
import Link from "next/link";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { api, object } from "@/lib/api/client";
import type { Category, Seat } from "@/lib/contracts/showtimes";
import { formatVnd, parseVndInput } from "@/lib/formatting";
import { seatCategoryToken } from "@/lib/presentation/seat-category";
import { CheckCircle, CircleAlert } from "@/components/ui/material-icon";
export function SeatPricingForm({
  id,
  categories,
  seats,
  onSaved,
}: {
  id: string;
  categories: Category[];
  seats: Seat[];
  onSaved: () => Promise<void>;
}) {
  const [values, setValues] = useState(() =>
    Object.fromEntries(
      categories.map((c) => [
        c.id,
        c.price === null ? "" : new Intl.NumberFormat("vi-VN").format(c.price),
      ]),
    ),
  );
  const [pending, setPending] = useState(false),
    [error, setError] = useState(""),
    [saved, setSaved] = useState(false);
  const invalid = categories.some(
    (c) => parseVndInput(values[c.id] ?? "") === null,
  );
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pending || invalid) return;
    setPending(true);
    setError("");
    setSaved(false);
    try {
      await api(`/showtimes/${id}/prices`, object, {
        method: "PATCH",
        body: {
          prices: categories.map((c) => ({
            id: c.id,
            price: parseVndInput(values[c.id]),
          })),
        },
      });
      await onSaved();
      setSaved(true);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Không lưu được giá. Hãy thử lại.",
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <form onSubmit={submit} noValidate data-price-errors={invalid}>
      {invalid && (
        <Alert variant="destructive" className="product-error-summary">
          <CircleAlert />
          <AlertTitle>Chưa đủ điều kiện mở bán</AlertTitle>
          <AlertDescription>
            Chưa đủ điều kiện mở bán: còn hạng vé chưa có giá hợp lệ. Nhập số
            nguyên không âm; 0 là miễn phí.
          </AlertDescription>
        </Alert>
      )}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {saved && (
        <p role="status" className="product-success">
          Đã lưu giá. Sơ đồ đã cập nhật.
        </p>
      )}
      <div className="pricing-body">
        <section className="product-panel price-table">
          <h2>Cấu hình đơn giá phân khu</h2>
          <p>Đơn giá bằng VNĐ, có hiệu lực trên sơ đồ bán vé.</p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Hạng vé</TableHead>
                <TableHead>Phân khu &amp; số lượng ghế</TableHead>
                <TableHead>Trạng thái giá</TableHead>
                <TableHead>Đơn giá niêm yết (VNĐ)</TableHead>
                <TableHead>Ghi chú</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {categories.map((c) => {
                const count = seats.filter((s) => s.category === c.name);
                const rows = [...new Set(count.map((s) => s.row))];
                const price = parseVndInput(values[c.id] ?? "");
                const bad = price === null;
                return (
                  <TableRow
                    key={c.id}
                    data-invalid={bad}
                    data-negative={(values[c.id] ?? "").trim().startsWith("-")}
                  >
                    <TableCell>
                      <strong>
                        <span
                          aria-hidden="true"
                          style={{ color: `var(${seatCategoryToken(c.name)})` }}
                        >
                          ■
                        </span>{" "}
                        Hạng {c.name}
                      </strong>
                    </TableCell>
                    <TableCell>
                      Hàng {rows[0]} – {rows.at(-1)} ·{" "}
                      {count.length.toLocaleString("vi-VN")} ghế
                    </TableCell>
                    <TableCell>
                      <span className={bad ? "price-invalid" : "price-status"}>
                        {!bad && <CheckCircle size={12} />}
                        {bad
                          ? "Chưa hợp lệ"
                          : price === 0
                            ? "Miễn phí"
                            : "Đã định giá"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Field data-invalid={bad}>
                        <FieldLabel
                          htmlFor={`price-${c.id}`}
                          className="price-mobile-label"
                        >
                          {c.name} · VND
                        </FieldLabel>
                        <div className="price-input-control">
                          <Input
                            id={`price-${c.id}`}
                            aria-label={`${c.name} · VND`}
                            inputMode="numeric"
                            value={values[c.id] ?? ""}
                            disabled={pending}
                            aria-invalid={bad}
                            onChange={(e) => {
                              setSaved(false);
                              setValues((v) => ({
                                ...v,
                                [c.id]: e.target.value,
                              }));
                            }}
                            onBlur={() => {
                              const n = parseVndInput(values[c.id]);
                              if (n !== null)
                                setValues((v) => ({
                                  ...v,
                                  [c.id]: new Intl.NumberFormat("vi-VN").format(
                                    n,
                                  ),
                                }));
                            }}
                          />
                          <span className="price-currency" aria-hidden="true">
                            VNĐ
                          </span>
                        </div>
                        {bad && (
                          <small>Nhập số nguyên không âm; 0 là miễn phí.</small>
                        )}
                      </Field>
                    </TableCell>
                    <TableCell>
                      {c.price === null ? "Chưa đặt giá" : formatVnd(c.price)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </section>
        {invalid && (
          <aside className="product-panel pricing-error-context">
            <h2>Thông tin suất diễn hiện tại</h2>
            <p>
              Tổng sức chứa:{" "}
              <strong>{seats.length.toLocaleString("vi-VN")} ghế</strong>
            </p>
            <p>
              Hạng vé: <strong>{categories.length} phân khu</strong>
            </p>
            <p>
              Giá đã lưu chỉ thay đổi khi bạn nhập đủ giá hợp lệ và xác nhận
              lưu.
            </p>
          </aside>
        )}
      </div>
      <div className="form-actions">
        <Link href={`/showtimes/${id}/map`}>Xem trước trên sơ đồ ghế</Link>
        <div className="price-actions">
          <Button
            variant="outline"
            type="button"
            disabled={pending}
            onClick={() => {
              setValues(
                Object.fromEntries(
                  categories.map((c) => [
                    c.id,
                    c.price === null
                      ? ""
                      : new Intl.NumberFormat("vi-VN").format(c.price),
                  ]),
                ),
              );
              setSaved(false);
              setError("");
            }}
          >
            Khôi phục giá đã lưu
          </Button>
          <Button
            type="submit"
            disabled={pending || invalid || !categories.length}
          >
            {pending ? "Đang lưu…" : "Lưu giá"}
          </Button>
        </div>
      </div>
    </form>
  );
}
