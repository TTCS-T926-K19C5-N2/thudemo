"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Mail, ArrowRight, CircleAlert, CheckCircle, RotateCw,
} from "@/components/ui/material-icon";
import { PublicLayout } from "@/components/layout/product-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { api, object, ApiError } from "@/lib/api/client";

const EMAIL_PATTERN = /^\S+@\S+\.\S+$/;

type State =
  | { kind: "pending" } | { kind: "success" }
  | { kind: "expired" } | { kind: "invalid"; message: string };

function ResendForm({ initialEmail = "" }: { initialEmail?: string }) {
  const [email, setEmail] = useState(initialEmail),
    [pending, setPending] = useState(false),
    [error, setError] = useState(""),
    [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pending || done) return;
    setError("");
    if (!EMAIL_PATTERN.test(email.trim())) {
      setError("Vui lòng nhập email hợp lệ để tiếp tục.");
      return;
    }
    setPending(true);
    try {
      await api("/users/resend-activation", object, {
        method: "POST",
        body: { email: email.trim() },
      });
      setDone(true); // Generic on purpose: never reveal whether the email exists.
    } catch (e) {
      setError(
        e instanceof ApiError ? e.message
          : e instanceof Error ? e.message
          : "Không gửi được liên kết. Hãy thử lại.",
      );
    } finally {
      setPending(false);
    }
  }

  if (done)
    return (
      <Alert>
        <CheckCircle />
        <AlertDescription>
          Nếu email hợp lệ và chưa được xác nhận, bạn sẽ nhận được liên kết
          mới. Hãy kiểm tra hộp thư (hiệu lực 24 giờ).
        </AlertDescription>
      </Alert>
    );
  return (
    <form onSubmit={submit} noValidate>
      <div className="login-fields">
        <h2>Gửi lại liên kết kích hoạt</h2>
        {error && (
          <Alert variant="destructive" className="login-error">
            <CircleAlert />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="resend-email">Email</FieldLabel>
            <div className="login-input-icon">
              <Mail />
              <Input id="resend-email" type="email" autoComplete="email"
                placeholder="name@example.com" value={email}
                onChange={(e) => setEmail(e.target.value)}
                required disabled={pending} maxLength={320} />
            </div>
          </Field>
        </FieldGroup>
        <Button type="submit" disabled={pending} className="login-submit">
          <RotateCw className="desktop-login-icon" />
          <span>{pending ? "Đang gửi…" : "Gửi lại liên kết"}</span>
          <ArrowRight className="mobile-login-icon" />
        </Button>
      </div>
    </form>
  );
}

export function ActivateForm({ token }: { token: string | null }) {
  const [state, setState] = useState<State>(
    token ? { kind: "pending" } : { kind: "invalid", message: "" },
  );

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    api(`/users/activate?token=${encodeURIComponent(token)}`, object)
      .then(() => { if (!cancelled) setState({ kind: "success" }); })
      .catch((e: unknown) => {
        if (cancelled) return;
        if (e instanceof ApiError && e.code === "ACTIVATION_EXPIRED") {
          setState({ kind: "expired" });
        } else {
          setState({
            kind: "invalid",
            message: e instanceof ApiError ? e.message
              : "Liên kết kích hoạt không hợp lệ.",
          });
        }
      });
    return () => { cancelled = true; };
  }, [token]);

  return (
    <PublicLayout>
      <div className="product-login">
        <h1>Kích hoạt tài khoản</h1>
        {state.kind === "pending" && <p>Đang kiểm tra liên kết kích hoạt…</p>}
        {state.kind === "success" && (
          <Alert>
            <CheckCircle />
            <AlertDescription>
              Kích hoạt tài khoản thành công. Bạn có thể{" "}
              <Link href="/login">đăng nhập</Link> ngay bây giờ.
            </AlertDescription>
          </Alert>
        )}
        {state.kind === "expired" && (
          <>
            <Alert variant="destructive" className="login-error">
              <CircleAlert />
              <AlertDescription>
                Liên kết kích hoạt đã hết hạn. Hãy gửi lại liên kết mới.
              </AlertDescription>
            </Alert>
            <ResendForm />
          </>
        )}
        {state.kind === "invalid" && (
          <>
            <Alert variant="destructive" className="login-error">
              <CircleAlert />
              <AlertDescription>
                {state.message || "Liên kết kích hoạt không hợp lệ."} Nếu chưa
                có tài khoản, hãy <Link href="/register">đăng ký</Link>.
              </AlertDescription>
            </Alert>
            <ResendForm />
          </>
        )}
      </div>
      <Link href="/" className="login-back">← Quay lại danh sách sự kiện</Link>
    </PublicLayout>
  );
}
