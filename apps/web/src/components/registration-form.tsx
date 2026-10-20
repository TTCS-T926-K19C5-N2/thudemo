"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { REGISTRATION_NOTICE } from "shared/registration-notice";
import { PublicLayout } from "@/components/layout/product-layout";
import { RegistrationNotice } from "@/components/registration-notice";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { api, object, ApiError } from "@/lib/api/client";

export function RegistrationForm({ resend = false }: { resend?: boolean }) {
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [consent, setConsent] = useState(false);
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [noticeReady, setNoticeReady] = useState(false);
  const [noticeAttempt, setNoticeAttempt] = useState(0);
  const [noticeError, setNoticeError] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const flight = useRef(false);

  useEffect(() => {
    if (resend) return;
    const controller = new AbortController();
    void api("/users/registration-notice", object, {
      signal: controller.signal,
    })
      .then((value) => {
        if (JSON.stringify(value) !== JSON.stringify(REGISTRATION_NOTICE))
          throw Error(
            "Thông báo đã thay đổi. Hãy tải lại trang trước khi đồng ý.",
          );
        setNoticeReady(true);
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted)
          setNoticeError(
            cause instanceof Error ? cause.message : "Chưa tải được thông báo.",
          );
      });
    return () => controller.abort();
  }, [resend, noticeAttempt]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (flight.current) return;
    const issues: Record<string, string> = {};
    if (
      !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email.trim()) ||
      email.length > 320
    )
      issues.email = "Nhập email hợp lệ.";
    if (!resend) {
      if (!fullName.trim() || fullName.trim().length > 120)
        issues.fullName = "Nhập họ tên giả từ 1 đến 120 ký tự.";
      if (password.length < 8 || password.length > 1024)
        issues.password = "Mật khẩu phải từ 8 đến 1024 ký tự.";
      if (!consent || !noticeReady)
        issues.consent =
          "Hãy đọc và chủ động đồng ý thông báo trước khi đăng ký.";
    }
    setErrors(issues);
    setError("");
    setMessage("");
    if (Object.keys(issues).length) return;
    flight.current = true;
    setPending(true);
    try {
      const value = await api(
        resend ? "/users/resend-activation" : "/users/register",
        object,
        {
          method: "POST",
          body: resend
            ? { email: email.trim() }
            : {
                email: email.trim(),
                fullName: fullName.trim(),
                password,
                consent,
                noticeVersion: REGISTRATION_NOTICE.version,
                marketingConsent,
              },
        },
      );
      setMessage(
        typeof value.message === "string"
          ? value.message
          : "Hãy kiểm tra hộp thư thử nghiệm.",
      );
      if (!resend) setPassword("");
    } catch (cause) {
      const detail = cause instanceof ApiError ? cause.details : {};
      if (
        detail.errors &&
        typeof detail.errors === "object" &&
        !Array.isArray(detail.errors)
      )
        setErrors(
          Object.fromEntries(
            Object.entries(detail.errors).filter(
              (entry): entry is [string, string] =>
                typeof entry[1] === "string",
            ),
          ),
        );
      setError(
        cause instanceof ApiError && cause.status === 429
          ? `Đã đạt giới hạn gửi lại. Thử lại sau ${Math.ceil(Number(detail.retryAfterSeconds ?? 3600) / 60)} phút.`
          : cause instanceof Error
            ? cause.message
            : "Không thực hiện được. Hãy thử lại.",
      );
    } finally {
      flight.current = false;
      setPending(false);
    }
  }

  const fieldError = (name: string) =>
    errors[name] ? (
      <p id={`registration-${name}-error`} role="alert">
        {errors[name]}
      </p>
    ) : null;
  return (
    <PublicLayout>
      <div className="product-login registration-form">
        <h1>
          {resend
            ? "Gửi lại liên kết kích hoạt"
            : "Đăng ký tài khoản thử nghiệm"}
        </h1>
        <p>
          {resend
            ? "Liên kết có hạn 24 giờ. Tối đa 5 yêu cầu gửi lại mỗi giờ cho một email."
            : "Chỉ dùng dữ liệu giả và mật khẩu thử nghiệm theo thông báo bên dưới."}
        </p>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {message && (
          <Alert role="status">
            <AlertDescription>
              {message} Kiểm tra cả thư rác; nếu chưa nhận được, bạn có thể gửi
              lại liên kết.
            </AlertDescription>
          </Alert>
        )}
        <form onSubmit={submit} noValidate aria-busy={pending}>
          <FieldGroup>
            {!resend && (
              <Field>
                <FieldLabel htmlFor="registration-fullName">
                  Họ tên giả
                </FieldLabel>
                <Input
                  id="registration-fullName"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  autoComplete="off"
                  maxLength={120}
                  disabled={pending}
                  required
                  aria-invalid={!!errors.fullName}
                  aria-describedby={
                    errors.fullName ? "registration-fullName-error" : undefined
                  }
                />
                {fieldError("fullName")}
              </Field>
            )}
            <Field>
              <FieldLabel htmlFor="registration-email">
                Email thử nghiệm
              </FieldLabel>
              <Input
                id="registration-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                maxLength={320}
                disabled={pending}
                required
                aria-invalid={!!errors.email}
                aria-describedby={
                  errors.email ? "registration-email-error" : undefined
                }
              />
              {fieldError("email")}
            </Field>
            {!resend && (
              <Field>
                <FieldLabel htmlFor="registration-password">
                  Mật khẩu thử nghiệm
                </FieldLabel>
                <Input
                  id="registration-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  minLength={8}
                  maxLength={1024}
                  disabled={pending}
                  required
                  aria-invalid={!!errors.password}
                  aria-describedby={
                    errors.password ? "registration-password-error" : undefined
                  }
                />
                {fieldError("password")}
              </Field>
            )}
            {!resend && (
              <>
                <RegistrationNotice />
                {noticeError && (
                  <Alert variant="destructive">
                    <AlertDescription>
                      {noticeError}{" "}
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          setNoticeError("");
                          setNoticeAttempt((n) => n + 1);
                        }}
                      >
                        Tải lại thông báo
                      </Button>
                    </AlertDescription>
                  </Alert>
                )}
                {!noticeReady && !noticeError && (
                  <p role="status">Đang xác nhận phiên bản thông báo…</p>
                )}
                <Field>
                  <label htmlFor="registration-consent">
                    <input
                      id="registration-consent"
                      type="checkbox"
                      checked={consent}
                      onChange={(e) => setConsent(e.target.checked)}
                      disabled={pending || !noticeReady}
                      required
                      aria-invalid={!!errors.consent}
                      aria-describedby={
                        errors.consent
                          ? "registration-consent-error"
                          : undefined
                      }
                    />{" "}
                    {REGISTRATION_NOTICE.consentLabel}
                  </label>
                  {fieldError("consent")}
                </Field>
                <Field>
                  <label
                    htmlFor="registration-marketing-consent"
                    style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer" }}
                  >
                    <button
                      id="registration-marketing-consent"
                      type="button"
                      role="switch"
                      aria-checked={marketingConsent}
                      onClick={() => setMarketingConsent((prev) => !prev)}
                      disabled={pending || !noticeReady}
                      style={{
                        width: "2.5rem",
                        height: "1.25rem",
                        borderRadius: "9999px",
                        backgroundColor: marketingConsent ? "#175cd3" : "#e4e7ec",
                        position: "relative",
                        border: "none",
                        cursor: pending || !noticeReady ? "not-allowed" : "pointer",
                        transition: "background-color 0.2s",
                      }}
                    >
                      <span
                        style={{
                          display: "block",
                          width: "1rem",
                          height: "1rem",
                          borderRadius: "50%",
                          backgroundColor: "#ffffff",
                          position: "absolute",
                          top: "0.125rem",
                          left: marketingConsent ? "1.375rem" : "0.125rem",
                          transition: "left 0.2s",
                        }}
                      />
                    </button>
                    <span>
                      Tôi đồng ý nhận thông tin tiếp thị, khuyến mãi và tin tức sự kiện qua email (tùy chọn, có thể thu hồi bất kỳ lúc nào).
                    </span>
                  </label>
                </Field>
              </>
            )}
            <Button
              type="submit"
              disabled={pending || (!resend && !noticeReady)}
            >
              {pending
                ? "Đang xử lý…"
                : resend
                  ? "Gửi lại liên kết"
                  : "Đăng ký"}
            </Button>
          </FieldGroup>
        </form>
        <p>
          <Link href="/login">Đăng nhập</Link> ·{" "}
          <Link href={resend ? "/register" : "/resend-activation"}>
            {resend ? "Đăng ký" : "Gửi lại liên kết kích hoạt"}
          </Link>
        </p>
      </div>
    </PublicLayout>
  );
}
