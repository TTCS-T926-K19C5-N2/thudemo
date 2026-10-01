"use client";

import { FormEvent, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { resendActivationLink, ApiError } from "@/lib/api";

export function ResendActivationForm() {
  const searchParams = useSearchParams();
  const defaultEmail = searchParams.get("email") ?? "";

  const [email, setEmail] = useState(defaultEmail);
  const [pending, setPending] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    setStatusMessage("");
    setErrorMessage("");

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setErrorMessage("Vui lòng nhập địa chỉ email hợp lệ.");
      return;
    }

    setPending(true);
    try {
      const res = await resendActivationLink(email.trim());
      setStatusMessage(res.message);
    } catch (err: unknown) {
      const apiErr = err as ApiError;
      setErrorMessage(apiErr.message ?? "Không thể gửi lại link kích hoạt. Vui lòng thử lại sau.");
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
        <h1 className="text-2xl font-semibold tracking-tight">Gửi lại link kích hoạt</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Nhập email đăng ký của bạn để nhận liên kết kích hoạt mới.
        </p>

        {statusMessage ? (
          <div className="mt-8 space-y-4">
            <div className="border-l-4 border-green-600 bg-green-50 p-4 text-sm text-green-900">
              <p className="font-semibold">Yêu cầu đã được tiếp nhận</p>
              <p className="mt-1">{statusMessage}</p>
            </div>
            <div className="flex flex-col gap-2 pt-2">
              <Link href="/activate" className="w-full">
                <Button variant="default" className="w-full">
                  Đi đến trang Nhập mã kích hoạt
                </Button>
              </Link>
              <Link href="/login" className="w-full">
                <Button variant="outline" className="w-full">
                  Quay lại Đăng nhập
                </Button>
              </Link>
            </div>
          </div>
        ) : (
          <form className="mt-8 space-y-5" onSubmit={submit} noValidate>
            <div className="space-y-2">
              <Label htmlFor="email">Email tài khoản</Label>
              <Input
                id="email"
                name="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nguoimua@example.com"
                required
                disabled={pending}
                className="h-10"
              />
            </div>

            {errorMessage && (
              <p
                role="alert"
                className="border-l-2 border-destructive bg-red-50 px-3 py-2 text-sm text-destructive"
              >
                {errorMessage}
              </p>
            )}

            <Button type="submit" disabled={pending} className="h-11 w-full">
              {pending ? "Đang gửi yêu cầu…" : "Gửi lại liên kết kích hoạt"}
            </Button>
          </form>
        )}

        <div className="mt-6 border-t border-border pt-4 text-center text-sm text-muted-foreground flex flex-col gap-2">
          <div>
            Đã có tài khoản hoạt động?{" "}
            <Link href="/login" className="font-semibold text-primary underline">
              Đăng nhập
            </Link>
          </div>
          <div>
            Chưa có tài khoản?{" "}
            <Link href="/register" className="font-semibold text-slate-700 underline">
              Đăng ký tài khoản
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
