"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export function WorkspaceHeader() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function logout() {
    if (pending) return;
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) throw new Error();
      router.replace("/login");
      router.refresh();
    } catch {
      setError("Không thể đăng xuất. Hãy thử lại.");
    } finally {
      setPending(false);
    }
  }

  return (
    <header className="border-b border-border bg-white">
      <div className="mx-auto flex min-h-14 max-w-6xl items-center justify-between gap-4 px-4 sm:px-8">
        <Link href="/account" className="text-sm font-semibold tracking-wide text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">VẬN HÀNH SỰ KIỆN</Link>
        <nav aria-label="Tài khoản" className="flex items-center gap-2">
          <Link href="/account" className="rounded px-3 py-2 text-sm text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary">Tài khoản</Link>
          <Button variant="outline" type="button" disabled={pending} onClick={logout} className="h-10">Đăng xuất</Button>
        </nav>
      </div>
      {error && <p role="alert" className="mx-auto max-w-6xl px-4 pb-2 text-sm text-destructive sm:px-8">{error}</p>}
    </header>
  );
}
