"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { UserRound } from "@/components/ui/material-icon";
import { notifySessionChanged } from "@/lib/session-events";

interface SessionActionsProps {
  readonly accountLink?: boolean;
}

export function SessionActions({ accountLink = true }: SessionActionsProps) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function logout() {
    if (pending) return;
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) throw new Error();
      notifySessionChanged();
      // A new document drops the router's in-memory private route history.
      window.location.replace("/login");
    } catch {
      setError("Không thể đăng xuất. Hãy thử lại.");
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="session-actions">
      <Link href="/orders" className="session-orders-link">
        Đơn hàng của tôi
      </Link>
      {accountLink && (
        <Link href="/account">
          <UserRound />
          Tài khoản
        </Link>
      )}
      <Button variant="outline" onClick={logout} disabled={pending}>
        {pending ? "Đang đăng xuất…" : "Đăng xuất"}
      </Button>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
