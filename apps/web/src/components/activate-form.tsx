"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { activateAccount, ApiError } from "@/lib/api";

export function ActivateForm() {
  const searchParams = useSearchParams();
  const tokenFromUrl = searchParams.get("token") ?? "";

  const [token, setToken] = useState(tokenFromUrl);
  const [pending, setPending] = useState(false);
  const [success, setSuccess] = useState(false);
  const [expired, setExpired] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [userEmail, setUserEmail] = useState("");

  useEffect(() => {
    if (!tokenFromUrl) return;
    let ignore = false;
    activateAccount(tokenFromUrl)
      .then((res) => {
        if (!ignore) {
          setSuccess(true);
          setStatusMessage(res.message);
        }
      })
      .catch((err: unknown) => {
        if (!ignore) {
          const apiErr = err as ApiError & { code?: string; email?: string };
          if (apiErr.code === "ACTIVATION_EXPIRED") {
            setExpired(true);
            if (apiErr.email) setUserEmail(apiErr.email);
            setStatusMessage(apiErr.message ?? "Liên kết kích hoạt đã hết hạn.");
          } else {
            setStatusMessage(apiErr.message ?? "Kích hoạt thất bại.");
          }
        }
      });
    return () => {
      ignore = true;
    };
  }, [tokenFromUrl]);

  async function handleManualActivate(e: React.FormEvent) {
    e.preventDefault();
    if (!token.trim() || pending) return;
    setPending(true);
    setStatusMessage("");
    setExpired(false);

    try {
      const res = await activateAccount(token.trim());
      setSuccess(true);
      setStatusMessage(res.message);
    } catch (err: unknown) {
      const apiErr = err as ApiError & { code?: string; email?: string };
      if (apiErr.code === "ACTIVATION_EXPIRED") {
        setExpired(true);
        if (apiErr.email) setUserEmail(apiErr.email);
        setStatusMessage(apiErr.message ?? "Liên kết kích hoạt đã hết hạn.");
      } else {
        setStatusMessage(apiErr.message ?? "Kích hoạt thất bại.");
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
        <h1 className="text-2xl font-semibold tracking-tight">Kích hoạt tài khoản</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Xác thực địa chỉ email để hoàn tất đăng ký tài khoản người mua vé.
        </p>

        {pending && (
          <div className="mt-8 border border-border bg-slate-50 p-6 text-center text-sm text-slate-700">
            <div className="inline-block animate-spin mb-2">⏳</div>
            <p>Đang xác thực mã kích hoạt tài khoản…</p>
          </div>
        )}

        {success && (
          <div className="mt-8 space-y-4">
            <div className="border-l-4 border-green-600 bg-green-50 p-4 text-sm text-green-900">
              <p className="font-semibold">Kích hoạt thành công!</p>
              <p className="mt-1">{statusMessage}</p>
            </div>
            <Link href="/login" className="block w-full">
              <Button className="h-11 w-full">Đăng nhập ngay</Button>
            </Link>
          </div>
        )}

        {expired && (
          <div className="mt-8 space-y-4">
            <div className="border-l-4 border-amber-500 bg-amber-50 p-4 text-sm text-amber-900">
              <p className="font-semibold">Mã kích hoạt đã hết hạn</p>
              <p className="mt-1">{statusMessage}</p>
            </div>
            <Link
              href={userEmail ? `/resend-activation?email=${encodeURIComponent(userEmail)}` : "/resend-activation"}
              className="block w-full"
            >
              <Button className="h-11 w-full" variant="default">
                Gửi lại liên kết kích hoạt mới
              </Button>
            </Link>
          </div>
        )}

        {!pending && !success && !expired && (
          <form
            className="mt-8 space-y-5"
            onSubmit={handleManualActivate}
          >
            <div className="space-y-2">
              <Label htmlFor="token">Mã kích hoạt (Token)</Label>
              <Input
                id="token"
                name="token"
                type="text"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="Dán token kích hoạt từ email..."
                required
                className="h-10 font-mono text-xs"
              />
            </div>

            {statusMessage && (
              <p
                role="alert"
                className="border-l-2 border-destructive bg-red-50 px-3 py-2 text-sm text-destructive"
              >
                {statusMessage}
              </p>
            )}

            <Button type="submit" disabled={pending || !token.trim()} className="h-11 w-full">
              Kích hoạt tài khoản
            </Button>
          </form>
        )}

        <div className="mt-6 border-t border-border pt-4 text-center text-sm text-muted-foreground flex flex-col gap-2">
          <div>
            Đã kích hoạt rồi?{" "}
            <Link href="/login" className="font-semibold text-primary underline">
              Đăng nhập
            </Link>
          </div>
          <div>
            Chưa có tài khoản?{" "}
            <Link href="/register" className="font-semibold text-slate-700 underline">
              Đăng ký mới
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
