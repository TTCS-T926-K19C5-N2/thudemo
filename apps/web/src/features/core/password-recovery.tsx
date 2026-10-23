"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, object } from "@/lib/api/client";
export function PasswordRecovery({ reset = false }: { reset?: boolean }) {
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [confirmation, setConfirmation] = useState(""),
    [token, setToken] = useState(""),
    [loaded, setLoaded] = useState(!reset),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [done, setDone] = useState(false);
  useEffect(() => {
    if (!reset) return;
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (cancelled) return;
      const hash = new URLSearchParams(window.location.hash.slice(1));
      const value =
        hash.get("token") ??
        new URLSearchParams(window.location.search).get("token") ??
        "";
      setToken(value);
      setLoaded(true);
      window.history.replaceState(window.history.state, "", "/reset-password");
    });
    return () => {
      cancelled = true;
    };
  }, [reset]);
  const validToken = /^[a-f0-9]{64}$/.test(token);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (reset && password !== confirmation) {
      setMessage("Hai mật khẩu chưa khớp.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const r = await api(
        reset ? "/auth/reset-password" : "/auth/forgot-password",
        object,
        { method: "POST", body: reset ? { token, password } : { email } },
      );
      setMessage(String(r.message));
      setDone(true);
      setPassword("");
      setConfirmation("");
      if (reset) setToken("");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Không thực hiện được.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="mx-auto my-12 w-full max-w-lg px-4">
      <section className="operations-panel space-y-4">
        <h1>{reset ? "Đặt lại mật khẩu" : "Quên mật khẩu"}</h1>
        <p>
          {reset
            ? "Liên kết chỉ dùng một lần trong 15 phút. Bạn sẽ đăng nhập lại sau khi đổi mật khẩu."
            : "Nhập email đã kích hoạt để nhận hướng dẫn đặt lại mật khẩu."}
        </p>
        {loaded && reset && !validToken && !done ? (
          <p role="alert">
            Liên kết thiếu mã hoặc không hợp lệ. Hãy yêu cầu liên kết mới.
          </p>
        ) : (
          !done && (
            <form onSubmit={(e) => void submit(e)} className="space-y-4">
              {reset ? (
                <>
                  <label className="block">
                    Mật khẩu mới
                    <Input
                      type="password"
                      autoComplete="new-password"
                      minLength={8}
                      maxLength={1024}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      disabled={busy}
                    />
                  </label>
                  <label className="block">
                    Nhập lại mật khẩu
                    <Input
                      type="password"
                      autoComplete="new-password"
                      minLength={8}
                      maxLength={1024}
                      value={confirmation}
                      onChange={(e) => setConfirmation(e.target.value)}
                      required
                      disabled={busy}
                    />
                  </label>
                </>
              ) : (
                <label className="block">
                  Email
                  <Input
                    type="email"
                    autoComplete="email"
                    maxLength={320}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    disabled={busy}
                  />
                </label>
              )}
              <Button disabled={busy || !loaded}>
                {busy
                  ? "Đang xử lý…"
                  : reset
                    ? "Đặt lại mật khẩu"
                    : "Gửi hướng dẫn"}
              </Button>
            </form>
          )
        )}
        {message && <p role="status">{message}</p>}
        <div className="flex flex-wrap gap-4">
          <Link href="/login">Về đăng nhập</Link>
          {reset && <Link href="/forgot-password">Yêu cầu liên kết mới</Link>}
        </div>
      </section>
    </main>
  );
}
