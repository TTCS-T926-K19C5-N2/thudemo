"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { registerUser, ApiError } from "@/lib/api";

export function RegisterForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [successMessage, setSuccessMessage] = useState("");
  const [devActivationToken, setDevActivationToken] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setError("");
    setFieldErrors({});
    setSuccessMessage("");
    setDevActivationToken(null);

    const errors: Record<string, string> = {};
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      errors.email = "Vui lòng nhập địa chỉ email hợp lệ.";
    }
    if (password.length < 8) {
      errors.password = "Mật khẩu phải có ít nhất 8 ký tự.";
    }
    if (password !== confirmPassword) {
      errors.confirmPassword = "Mật khẩu xác nhận không trùng khớp.";
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setPending(true);
    try {
      const res = await registerUser(email, password);
      setSuccessMessage(res.message);
      if (res.activationToken) {
        setDevActivationToken(res.activationToken);
      }
    } catch (err: unknown) {
      const apiErr = err as ApiError;
      if (apiErr.errors) {
        setFieldErrors(apiErr.errors);
      } else {
        setError(apiErr.message ?? "Đăng ký thất bại. Vui lòng thử lại.");
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-4 py-12 sm:px-6">
      <div className="mb-8 flex items-center gap-3 text-sm font-semibold tracking-wide text-slate-700">
        <span aria-hidden="true" className="grid size-8 place-items-center rounded border border-primary bg-blue-50 text-primary">
          E
        </span>
        HỆ THỐNG VÉ SỰ KIỆN
      </div>
      <div className="border border-border bg-white p-6 sm:p-8">
        <h1 className="text-2xl font-semibold tracking-tight">Đăng ký tài khoản</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Đăng ký tài khoản người mua vé bằng email cá nhân của bạn.
        </p>

        {successMessage ? (
          <div className="mt-6 space-y-4">
            <div className="border-l-4 border-green-600 bg-green-50 p-4 text-sm text-green-900">
              <p className="font-semibold">Đăng ký thành công!</p>
              <p className="mt-1">{successMessage}</p>
            </div>

            {devActivationToken && (
              <div className="rounded border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900">
                <span className="font-semibold">[Môi trường phát triển]</span>
                <p className="mt-1">Link kích hoạt mô phỏng:</p>
                <Link
                  href={`/activate?token=${devActivationToken}`}
                  className="mt-1 block font-mono text-primary underline break-all"
                >
                  /activate?token={devActivationToken}
                </Link>
              </div>
            )}

            <div className="pt-2 flex flex-col gap-2">
              <Link href="/login" className="w-full">
                <Button variant="outline" className="w-full">
                  Đi đến trang Đăng nhập
                </Button>
              </Link>
            </div>
          </div>
        ) : (
          <form className="mt-8 space-y-5" onSubmit={submit} noValidate>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                disabled={pending}
                required
                className="h-10"
                placeholder="nguoimua@example.com"
              />
              {fieldErrors.email && (
                <p className="text-xs text-destructive">{fieldErrors.email}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Mật khẩu (tối thiểu 8 ký tự)</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                disabled={pending}
                required
                className="h-10"
              />
              {fieldErrors.password && (
                <p className="text-xs text-destructive">{fieldErrors.password}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Xác nhận mật khẩu</Label>
              <Input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                disabled={pending}
                required
                className="h-10"
              />
              {fieldErrors.confirmPassword && (
                <p className="text-xs text-destructive">{fieldErrors.confirmPassword}</p>
              )}
            </div>

            {error && (
              <p
                role="alert"
                className="border-l-2 border-destructive bg-red-50 px-3 py-2 text-sm text-destructive"
              >
                {error}
              </p>
            )}

            <Button type="submit" disabled={pending} className="h-11 w-full">
              {pending ? "Đang xử lý đăng ký…" : "Đăng ký tài khoản"}
            </Button>
          </form>
        )}

        <div className="mt-6 border-t border-border pt-4 text-center text-sm text-muted-foreground flex flex-col gap-2">
          <div>
            Đã có tài khoản?{" "}
            <Link href="/login" className="font-semibold text-primary underline">
              Đăng nhập tại đây
            </Link>
          </div>
          <div>
            Chưa nhận được mã kích hoạt?{" "}
            <Link href="/resend-activation" className="font-semibold text-slate-700 underline">
              Gửi lại link kích hoạt
            </Link>
          </div>
        </div>
      </div>
      <p className="mt-5 text-xs text-muted-foreground">
        Môi trường phát triển · S-03 Đăng ký tài khoản người mua vé bằng email.
      </p>
    </main>
  );
}
