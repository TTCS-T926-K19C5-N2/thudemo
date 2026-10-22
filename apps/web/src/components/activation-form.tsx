"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { PublicLayout } from "@/components/layout/product-layout";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel } from "@/components/ui/field";
import { api, object, ApiError } from "@/lib/api/client";

export function ActivationForm() {
  const token = useRef<string | null>(null);
  const started = useRef(false);
  const flight = useRef(false);
  const [pending, setPending] = useState(false);
  const [password, setPassword] = useState("");
  const [linkReady, setLinkReady] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [canRetry, setCanRetry] = useState(false);

  async function activate() {
    if (flight.current) return;
    if (!token.current || !/^[a-f0-9]{64}$/.test(token.current)) {
      setError("Liên kết không hợp lệ. Hãy yêu cầu gửi lại.");
      setPending(false);
      return;
    }
    if (password.length < 8 || password.length > 1024) {
      setError("Đặt mật khẩu từ 8 đến 1024 ký tự.");
      return;
    }
    flight.current = true;
    setPending(true);
    setError("");
    try {
      const value = await api("/users/activate", object, {
        method: "POST",
        body: { token: token.current, password },
      });
      token.current = null;
      setPassword("");
      setMessage(
        typeof value.message === "string"
          ? value.message
          : "Đã kích hoạt. Hãy đăng nhập.",
      );
    } catch (cause) {
      setCanRetry(
        cause instanceof ApiError &&
          (cause.status === 0 || cause.status >= 500),
      );
      setError(
        cause instanceof Error
          ? cause.message
          : "Chưa kích hoạt được. Hãy thử lại.",
      );
    } finally {
      flight.current = false;
      setPending(false);
    }
  }

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    token.current = new URLSearchParams(window.location.hash.slice(1)).get(
      "token",
    );
    window.history.replaceState(null, "", "/activate");
    queueMicrotask(() => {
      setLinkReady(true);
      if (!token.current || !/^[a-f0-9]{64}$/.test(token.current))
        setError("Liên kết không hợp lệ. Hãy yêu cầu gửi lại.");
    });
  }, []);

  return (
    <PublicLayout>
      <div className="product-login registration-form">
        <h1>Kích hoạt tài khoản</h1>
        {linkReady && !message && (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void activate();
            }}
          >
            <p>
              Đặt mật khẩu cho tài khoản sau khi xác nhận hộp thư. Mật khẩu này
              thay mật khẩu đã nhập ở bước đăng ký.
            </p>
            <Field>
              <FieldLabel htmlFor="activation-password">
                Mật khẩu tài khoản
              </FieldLabel>
              <Input
                id="activation-password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                minLength={8}
                maxLength={1024}
                required
                disabled={pending}
              />
            </Field>
            <Button type="submit" disabled={pending}>
              {pending ? "Đang kích hoạt…" : "Hoàn tất kích hoạt"}
            </Button>
          </form>
        )}
        {pending && <p role="status">Đang kiểm tra liên kết…</p>}
        {message && (
          <Alert role="status">
            <AlertDescription>{message}</AlertDescription>
          </Alert>
        )}
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {error && canRetry && (
          <Button disabled={pending} onClick={() => void activate()}>
            Thử lại
          </Button>
        )}
        <p>
          <Link href="/login">Đăng nhập</Link> ·{" "}
          <Link href="/resend-activation">Gửi lại liên kết kích hoạt</Link>
        </p>
      </div>
    </PublicLayout>
  );
}
