"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Eye,
  EyeOff,
  LockKeyhole,
  Mail,
  ArrowRight,
  LogIn,
  CircleAlert,
  Info,
} from "@/components/ui/material-icon";
import { PublicLayout } from "@/components/layout/product-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { api, object, ApiError } from "@/lib/api/client";
import { loadCurrentUser, safeReturnTo } from "@/lib/api";
import type { PublicShowtime } from "@/lib/contracts/showtimes";
import { formatVnd, formatShowtime } from "@/lib/formatting";
export function LoginForm({
  returnTo,
  show,
}: { returnTo?: string; show?: PublicShowtime | null } = {}) {
  const router = useRouter();
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [visible, setVisible] = useState(false),
    [pending, setPending] = useState(false),
    [error, setError] = useState("");
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    setError("");
    if (!/^\S+@\S+\.\S+$/.test(email.trim()) || !password) {
      setError("Vui lòng nhập email hợp lệ và mật khẩu để tiếp tục.");
      return;
    }
    setPending(true);
    try {
      await api("/auth/login", object, {
        method: "POST",
        body: { email: email.trim(), password },
      });
      const user = await loadCurrentUser();
      if (!user)
        throw new Error(
          "Phiên đăng nhập chưa được xác nhận. Hãy đăng nhập lại.",
        );
      router.replace(
        safeReturnTo(returnTo ?? null) ??
          (user.roles.includes("ORGANIZER") ? "/events" : "/account"),
      );
      router.refresh();
    } catch (e) {
      setError(
        e instanceof ApiError && e.status === 401
          ? "Email hoặc mật khẩu không chính xác."
          : e instanceof ApiError && e.status === 429
            ? `Đăng nhập tạm thời bị khóa. Thử lại sau ${Math.ceil(Number(e.details.retryAfterSeconds ?? 60) / 60)} phút.`
            : e instanceof Error
              ? e.message
              : "Không đăng nhập được. Hãy thử lại.",
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <PublicLayout
      compact
      context={
        show ? (
          <>
            {show.event.name} · {formatShowtime(show.startTime, "short")} ·{" "}
            {show.event.location}
          </>
        ) : undefined
      }
    >
      <div className="product-login">
        <h1>{returnTo ? "Đăng nhập để tiếp tục chọn ghế" : "Đăng nhập"}</h1>
        <p>
          {returnTo
            ? "Đăng nhập bằng email và mật khẩu của bạn."
            : "Truy cập tài khoản để quản lý sự kiện và chọn vị trí ghế."}
        </p>
        {returnTo && (
          <div className="login-return-note">
            <ArrowRight className="desktop-return-icon" />
            <Info className="mobile-return-icon" filled />
            <div>
              {show && (
                <strong className="mobile-login-context">
                  {show.event.name} · {formatShowtime(show.startTime, "short")}{" "}
                  · {show.event.location}
                </strong>
              )}
              <p>
                Sau khi đăng nhập thành công, bạn sẽ quay lại chọn ghế{" "}
                {show ? `cho ${show.event.name}` : "cho đúng suất diễn"}.
              </p>
            </div>
          </div>
        )}
        <form onSubmit={submit} noValidate>
          <div className="login-fields">
            <h2 className="mobile-login-intro">Tài khoản thành viên</h2>
            <p className="mobile-login-intro">
              Nhập email và mật khẩu để tiếp tục chọn ghế.
            </p>
            {error && (
              <Alert variant="destructive" className="login-error">
                <CircleAlert />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="login-email">
                  <span className="desktop-email-label">
                    Email / Tên đăng nhập
                  </span>
                  <span className="mobile-email-label">Email</span>
                </FieldLabel>
                <div className="login-input-icon">
                  <Mail />
                  <Input
                    id="login-email"
                    type="email"
                    autoComplete="username"
                    placeholder="name@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    disabled={pending}
                  />
                </div>
              </Field>
              <Field>
                <FieldLabel htmlFor="login-password">Mật khẩu</FieldLabel>
                <div className="password-control">
                  <LockKeyhole className="password-leading-icon" />
                  <Input
                    id="login-password"
                    type={visible ? "text" : "password"}
                    autoComplete="current-password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    disabled={pending}
                    aria-invalid={!!error}
                  />
                  <button
                    type="button"
                    aria-label={visible ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                    onClick={() => setVisible((v) => !v)}
                    disabled={pending}
                  >
                    {visible ? <EyeOff /> : <Eye />}
                  </button>
                </div>
              </Field>
            </FieldGroup>
            <Button type="submit" disabled={pending} className="login-submit">
              <LogIn className="desktop-login-icon" />
              <span>{pending ? "Đang đăng nhập…" : "Đăng nhập"}</span>
              <ArrowRight className="mobile-login-icon" />
            </Button>
          </div>
          {show && (
            <section className="login-price-reference">
              <h2>Giá vé tham khảo</h2>
              <div>
                {show.categories
                  .toSorted((a, b) => (b.price ?? 0) - (a.price ?? 0))
                  .map((c) => (
                    <div key={c.name}>
                      <span>{c.name}</span>
                      <strong>{formatVnd(c.price)}</strong>
                    </div>
                  ))}
              </div>
            </section>
          )}

          {returnTo && (
            <p className="login-availability">
              Việc chọn vị trí chưa xác nhận đặt chỗ. Ghế chỉ được giữ sau khi
              máy chủ xác nhận thành công.
            </p>
          )}
        </form>
      </div>
      <Link href={show ? `/shows/${show.id}` : "/"} className="login-back">
        ← Quay lại {show ? "chi tiết sự kiện" : "danh sách sự kiện"}
      </Link>
    </PublicLayout>
  );
}
