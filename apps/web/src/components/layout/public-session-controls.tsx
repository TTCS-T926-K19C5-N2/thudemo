"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { loadCurrentUser } from "@/lib/api";
import { SessionActions } from "./session-actions";

type SessionState = "checking" | "signed-in" | "signed-out" | "error";

export function PublicSessionControls() {
  const [state, setState] = useState<SessionState>("checking");

  const refresh = useCallback(async () => {
    setState("checking");
    try {
      setState((await loadCurrentUser()) ? "signed-in" : "signed-out");
    } catch {
      setState("error");
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    void loadCurrentUser()
      .then((user) => {
        if (mounted) setState(user ? "signed-in" : "signed-out");
      })
      .catch(() => {
        if (mounted) setState("error");
      });
    const onSessionChanged = () => void refresh();
    window.addEventListener("account-session-changed", onSessionChanged);
    const channel =
      typeof BroadcastChannel === "undefined"
        ? null
        : new BroadcastChannel("account-session");
    channel?.addEventListener("message", onSessionChanged);
    return () => {
      mounted = false;
      window.removeEventListener("account-session-changed", onSessionChanged);
      channel?.removeEventListener("message", onSessionChanged);
      channel?.close();
    };
  }, [refresh]);

  if (state === "signed-in") return <SessionActions />;
  if (state === "signed-out") {
    return (
      <Link href="/login" className="header-login-link">
        Đăng nhập
      </Link>
    );
  }
  if (state === "error") {
    return (
      <span className="header-login-link" role="status">
        Chưa kiểm tra được phiên
      </span>
    );
  }
  return (
    <span className="header-login-link" role="status" aria-label="Đang kiểm tra phiên">
      Đang kiểm tra…
    </span>
  );
}
