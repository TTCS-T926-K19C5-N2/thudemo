"use client";
import { useState } from "react";
import Link from "next/link";
import {
  Eye, EyeOff, LockKeyhole, Mail, ArrowRight,
  UserRound, CircleAlert, CheckCircle,
} from "@/components/ui/material-icon";
import { PublicLayout } from "@/components/layout/product-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { api, object, ApiError } from "@/lib/api/client";

const EMAIL_PATTERN = /^\S+@\S+\.\S+$/;

export function RegisterForm() {
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [confirm, setConfirm] = useState(""),
    [visible, setVisible] = useState(false),
    [pending, setPending] = useState(false),
    [error, setError] = useState(""),
    [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pending || done) return;
    setError("");
    const value = email.trim();
    if (!EMAIL_PATTERN.test(value)) {
      setError("Vui lòng nhập email hợp lệ để tiếp tục.");
      return;
    }
    if (password.length < 8) {
      setError("Mật khẩu phải có ít nhất 8 ký tự.");
      return;
    }
    if (password !== confirm) {
      setError("Mật khẩu nhập lại chưa khớp.");
      return;
    }
    setPending(true);
    try {
      await api("/users/register", object, {
        method: "POST",
        body: { email: value, password },
      });
      // Generic response on purpose: never reveal whether the email is new.
      setDone(true);
    } catch (e) {
      setError(
        e instanceof ApiError ? e.message
          : e instanceof Error ? e.message
          : "Không đăng ký được. Hãy thử lại.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <PublicLayout>
      <div className="product-login">
        <h1>Tạo tài khoản mua vé</h1>
        <p>Tự tạo tài khoản bằng email để mua vé, không cần chờ ai cấp.</p>
        {done ? (
          <Alert>
            <CheckCircle />
            <AlertDescription>
              Nếu email hợp lệ, bạn sẽ nhận được hướng dẫn. Hãy kiểm tra hộp
              thư để lấy liên kết kích hoạt (hiệu lực 24 giờ), rồi{" "}
              <Link href="/login">đăng nhập</Link>. Không thấy email?{" "}
              <Link href="/activate">Gửi lại liên kết kích hoạt</Link>.
            </AlertDescription>
          </Alert>
        ) : (
          <form onSubmit={submit} noValidate>
            <div className="login-fields">
              <h2 className="mobile-login-intro">Tài khoản mới</h2>
              <p className="mobile-login-intro">
                Nhập email và mật khẩu để tạo tài khoản mua vé.
              </p>
              {error && (
                <Alert variant="destructive" className="login-error">
                  <CircleAlert />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="register-email">
                    <span className="desktop-email-label">Email</span>
                    <span className="mobile-email-label">Email</span>
                  </FieldLabel>
                  <div className="login-input-icon">
                    <Mail />
                    <Input id="register-email" type="email" autoComplete="email"
                      placeholder="name@example.com" value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required disabled={pending} maxLength={320} />
                  </div>
                </Field>
                <Field>
                  <FieldLabel htmlFor="register-password">
                    Mật khẩu (ít nhất 8 ký tự)
                  </FieldLabel>
                  <div className="password-control">
                    <LockKeyhole className="password-leading-icon" />
                    <Input id="register-password"
                      type={visible ? "text" : "password"}
                      autoComplete="new-password" placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required minLength={8} maxLength={1024}
                      disabled={pending} aria-invalid={!!error} />
                    <button type="button"
                      aria-label={visible ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                      onClick={() => setVisible((v) => !v)} disabled={pending}>
                      {visible ? <EyeOff /> : <Eye />}
                    </button>
                  </div>
                </Field>
                <Field>
                  <FieldLabel htmlFor="register-confirm">
                    Nhập lại mật khẩu
                  </FieldLabel>
                  <div className="password-control">
                    <LockKeyhole className="password-leading-icon" />
                    <Input id="register-confirm"
                      type={visible ? "text" : "password"}
                      autoComplete="new-password" placeholder="••••••••"
                      value={confirm}
                      onChange={(e) => setConfirm(e.target.value)}
                      required minLength={8} maxLength={1024}
                      disabled={pending} aria-invalid={!!error} />
                  </div>
                </Field>
              </FieldGroup>
              <Button type="submit" disabled={pending} className="login-submit">
                <UserRound className="desktop-login-icon" />
                <span>{pending ? "Đang tạo tài khoản…" : "Đăng ký"}</span>
                <ArrowRight className="mobile-login-icon" />
              </Button>
            </div>
            <p className="login-availability">
              Đã có tài khoản? <Link href="/login">Đăng nhập</Link>
            </p>
          </form>
        )}
      </div>
      <Link href="/" className="login-back">← Quay lại danh sách sự kiện</Link>
    </PublicLayout>
  );
}
