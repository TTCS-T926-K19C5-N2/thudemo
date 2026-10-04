"use client";
import { useEffect, useRef, useState } from "react";
import {
  Upload,
  FileJson,
  Info,
  CircleAlert,
} from "@/components/ui/material-icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel } from "@/components/ui/field";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Table,
  TableHeader,
  TableHead,
  TableRow,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import { SeatMap } from "@/components/seat-map/seat-map";
import { api, object, ApiError } from "@/lib/api/client";
import {
  decodeIssues,
  decodeSeatDocument,
  type MapIssue,
  type SeatDocument,
  type Seat,
} from "@/lib/contracts/showtimes";
import { seatCategoryToken } from "@/lib/presentation/seat-category";
export function SeatMapImportForm({
  id,
  locked,
  context,
  onSaved,
}: {
  id: string;
  locked: boolean;
  context: Readonly<{ name: string; location: string; date: string }>;
  onSaved: () => Promise<void>;
}) {
  const [document, setDocument] = useState<SeatDocument | null>(null),
    [issues, setIssues] = useState<MapIssue[]>([]),
    [filename, setFilename] = useState(""),
    [size, setSize] = useState(0),
    [pending, setPending] = useState(false),
    [validating, setValidating] = useState(false),
    [message, setMessage] = useState("");
  const version = useRef(0);
  useEffect(
    () => () => {
      version.current++;
    },
    [],
  );
  async function read(file?: File) {
    const current = ++version.current;
    setDocument(null);
    setValidating(false);
    setIssues([]);
    setMessage("");
    setFilename(file?.name ?? "");
    setSize(file?.size ?? 0);
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setIssues([
        { index: null, field: "file", message: "Tệp vượt quá 5 MB." },
      ]);
      return;
    }
    setValidating(true);
    try {
      const body: unknown = JSON.parse(await file.text());
      const result = await api("/showtimes/validate-map", decodeIssues, {
        method: "POST",
        body,
      });
      if (current !== version.current) return;
      setIssues(result.errors);
      if (!result.errors.length) setDocument(decodeSeatDocument(body));
    } catch (e) {
      if (current === version.current)
        setIssues([
          {
            index: null,
            field: "file",
            message:
              e instanceof SyntaxError
                ? "JSON không hợp lệ. Kiểm tra dấu ngoặc và dấu phẩy."
                : e instanceof Error
                  ? e.message
                  : "Không đọc được tệp.",
          },
        ]);
    } finally {
      if (current === version.current) setValidating(false);
    }
  }
  async function confirm() {
    if (!document || pending || locked) return;
    setPending(true);
    setMessage("");
    try {
      await api(`/showtimes/${id}/seat-map`, object, {
        method: "POST",
        body: document,
      });
      await onSaved();
      setMessage("Đã nạp sơ đồ thành công.");
    } catch (e) {
      if (e instanceof ApiError && Array.isArray(e.details.errors))
        setIssues(decodeIssues(e.details).errors);
      else
        setIssues([
          {
            index: null,
            field: "file",
            message: e instanceof Error ? e.message : "Không nạp được sơ đồ.",
          },
        ]);
    } finally {
      setPending(false);
    }
  }
  const seats: Seat[] =
    document?.seats.map((s, i) => ({
      ...s,
      id: String(i),
      price: null,
      status: "AVAILABLE",
    })) ?? [];
  const categories = [...new Set(seats.map((s) => s.category))];
  return (
    <>
      {message && (
        <p role="status" className="product-success">
          {message}
        </p>
      )}
      {issues.length === 0 && (
        <section className="import-steps">
          <div data-complete={!!document}>
            <strong>1 · Kiểm tra tệp JSON</strong>
            <p>
              {validating
                ? "Đang phân tích tệp…"
                : document
                  ? "Tệp hợp lệ. Bản xem trước đã sẵn sàng."
                  : "Chọn tệp để kiểm tra tất cả tọa độ ghế."}
            </p>
          </div>
          <div>
            <strong>2 · Xác nhận nạp sơ đồ</strong>
            <p>Dữ liệu chỉ được lưu sau khi bạn xác nhận.</p>
          </div>
        </section>
      )}
      {issues.length > 0 && (
        <Alert variant="destructive" className="product-error-summary">
          <CircleAlert />
          <AlertTitle>Tệp JSON chưa hợp lệ</AlertTitle>
          <AlertDescription>
            Xem trước chưa lưu dữ liệu. Tệp chưa hợp lệ. Sửa tất cả lỗi trước
            khi nạp lại.
          </AlertDescription>
        </Alert>
      )}
      <div
        className={`import-columns ${issues.length ? "import-invalid" : ""}`}
      >
        <section className="product-panel">
          <h2>Thông tin tệp nạp</h2>
          <Field>
            <FieldLabel htmlFor="map-file">Tệp JSON</FieldLabel>
            <div className={`upload-zone ${document ? "upload-ready" : ""}`}>
              <Upload />
              <p>Chọn tệp sơ đồ ghế</p>
              <small>Tối đa 5 MB · 2.000 ghế</small>
              <Input
                id="map-file"
                type="file"
                accept=".json,application/json"
                disabled={pending || locked}
                onChange={(e) => read(e.target.files?.[0])}
              />
            </div>
          </Field>
          {filename && (
            <p>
              <FileJson /> {filename} · {(size / 1024).toFixed(1)} KB
            </p>
          )}
          {validating && <p role="status">Đang kiểm tra tệp…</p>}
          {locked && <p>Sơ đồ đã khóa từ lần mở bán đầu tiên.</p>}
        </section>
        {issues.length > 0 && (
          <>
            <section className="product-panel import-file-status">
              <h2>Trạng thái tệp</h2>
              <p className="price-invalid">
                Không hợp lệ · {issues.length} lỗi phát hiện
              </p>
              <p>Sửa toàn bộ lỗi rồi chọn lại tệp để kiểm tra.</p>
            </section>
            <section className="product-panel import-target">
              <h2>Suất diễn mục tiêu</h2>
              <strong>{context.name}</strong>
              <p>{context.location}</p>
              <p>{context.date} · Tối đa 2.000 ghế</p>
            </section>
          </>
        )}
        {seats.length > 0 && (
          <section className="product-panel">
            <h2>Phân bố hạng vé theo sơ đồ JSON</h2>
            <div className="category-distribution">
              {categories.map((name) => (
                <article
                  key={name}
                  style={
                    {
                      "--category-color": `var(${seatCategoryToken(name)})`,
                    } as React.CSSProperties
                  }
                >
                  <h3>{name}</h3>
                  <strong>
                    {seats
                      .filter((s) => s.category === name)
                      .length.toLocaleString("vi-VN")}{" "}
                    <small>ghế</small>
                  </strong>
                  <p>
                    Hàng{" "}
                    {[
                      ...new Set(
                        seats
                          .filter((s) => s.category === name)
                          .map((s) => s.row),
                      ),
                    ]
                      .filter(
                        (_, position, rows) =>
                          position === 0 || position === rows.length - 1,
                      )
                      .join(" – ")}
                  </p>
                </article>
              ))}
            </div>
            <div className="distribution-bar">
              {categories.map((name) => (
                <span
                  key={name}
                  style={{
                    width: `${(seats.filter((s) => s.category === name).length / seats.length) * 100}%`,
                    background: `var(${seatCategoryToken(name)})`,
                  }}
                />
              ))}
            </div>
            <p>Tổng cộng {seats.length.toLocaleString("vi-VN")} / 2.000 ghế</p>
          </section>
        )}
      </div>
      {issues.length > 0 && (
        <>
          <section className="product-panel issue-table">
            <h2>Chi tiết danh sách {issues.length} lỗi phát hiện</h2>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vị trí</TableHead>
                  <TableHead>Trường</TableHead>
                  <TableHead>Lỗi và cách sửa</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {issues.map((issue, i) => (
                  <TableRow key={i}>
                    <TableCell>
                      {issue.index === null ? "Tệp" : `Ghế #${issue.index + 1}`}
                    </TableCell>
                    <TableCell>
                      <code>{issue.field}</code>
                    </TableCell>
                    <TableCell>{issue.message}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </section>
        </>
      )}
      {seats.length > 0 && (
        <>
          <div className="import-preview-label">
            <strong>Bản xem trước ma trận ghế</strong>
            <span>Chưa lưu dữ liệu</span>
          </div>
          <div className="readonly-notice">
            <Info /> Xem trước chưa lưu dữ liệu. Kiểm tra tệp rồi xác nhận nạp.
          </div>
          <SeatMap seats={seats} showNumbers />
        </>
      )}
      <div className="form-actions">
        <small>
          {locked
            ? "Cấu trúc sơ đồ đã khóa."
            : "Tệp phải hợp lệ hoàn toàn trước khi ghi dữ liệu."}
        </small>
        <Button
          disabled={
            !document || issues.length > 0 || pending || validating || locked
          }
          onClick={confirm}
        >
          {pending ? "Đang nạp…" : "Xác nhận nạp sơ đồ"}
        </Button>
      </div>
    </>
  );
}
