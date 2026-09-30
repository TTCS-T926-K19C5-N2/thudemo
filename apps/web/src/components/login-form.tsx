"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { loadCurrentUser, readApiError } from "@/lib/api";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setError("");
    if (!/^\S+@\S+\.\S+$/.test(email.trim()) || !password) {
      setError("Nhập email hợp lệ và mật khẩu để tiếp tục.");
      return;
    }

    setPending(true);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!response.ok) {
        const detail = await readApiError(response);
        if (response.status === 429 && detail.retryAfterSeconds) {
          setError(`Đăng nhập tạm khoá. Thử lại sau ${Math.ceil(detail.retryAfterSeconds / 60)} phút.`);
        } else {
          setError(response.status === 401 ? "Email hoặc mật khẩu không đúng." : detail.message ?? "Đăng nhập thất bại.");
        }
        return;
      }
      const user = await loadCurrentUser();
      router.replace(user?.roles.includes("ORGANIZER") ? "/events" : "/account");
      router.refresh();
    } catch {
      setError("Không thể kết nối. Kiểm tra kết nối rồi thử lại.");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-4 py-12 sm:px-6">
      <div className="mb-8 flex items-center gap-3 text-sm font-semibold tracking-wide text-slate-700">
        <span aria-hidden="true" className="grid size-8 place-items-center rounded border border-primary bg-blue-50 text-primary">E</span>
        VẬN HÀNH SỰ KIỆN
      </div>
      <div className="border border-border bg-white p-6 sm:p-8">
        <h1 className="text-2xl font-semibold tracking-tight">Đăng nhập</h1>
        <p className="mt-2 text-sm text-muted-foreground">Dùng tài khoản đã được cấp để quản lý sự kiện.</p>
        <form className="mt-8 space-y-5" onSubmit={submit} noValidate>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} disabled={pending} required className="h-10" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Mật khẩu</Label>
            <Input id="password" name="password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} disabled={pending} required className="h-10" />
          </div>
          {error && <p role="alert" className="border-l-2 border-destructive bg-red-50 px-3 py-2 text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={pending} className="h-11 w-full">{pending ? "Đang đăng nhập…" : "Đăng nhập"}</Button>
          <p aria-live="polite" className="sr-only">{pending ? "Đang kiểm tra tài khoản" : ""}</p>
        </form>
      </div>
      <p className="mt-5 text-xs text-muted-foreground">Môi trường phát triển · Chỉ dùng tài khoản và dữ liệu giả.</p>
    </main>
  );
}
