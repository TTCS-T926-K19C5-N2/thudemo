"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api/client";

type ReadState<T> = { path: string; value: T | null; error: ApiError | null };

// Order data stays inside this mounted reader, never in shared caches or storage.
export function useOrderRead<T>(
  path: string,
  decode: (value: unknown) => T,
  deadline: (value: T) => number | null,
) {
  const [state, setState] = useState<ReadState<T>>({
    path,
    value: null,
    error: null,
  });
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let controller: AbortController | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let active = true;
    async function refresh() {
      controller?.abort();
      clearTimeout(timer);
      const current = new AbortController();
      controller = current;
      setState({ path, value: null, error: null });
      const startedAt = performance.now();
      try {
        const value = await api(path, decode, { signal: current.signal });
        if (!active || current.signal.aborted) return;
        setState({ path, value, error: null });
        const delay = deadline(value);
        if (delay !== null)
          timer = setTimeout(
            () => void refresh(),
            Math.max(
              250,
              Math.min(
                delay - (performance.now() - startedAt) + 100,
                2147483647,
              ),
            ),
          );
      } catch (reason) {
        if (!active || current.signal.aborted) return;
        setState({
          path,
          value: null,
          error:
            reason instanceof ApiError
              ? reason
              : new ApiError(
                  "Không tải được đơn hàng. Hãy thử lại.",
                  0,
                  "NETWORK_ERROR",
                ),
        });
      }
    }
    function hide() {
      controller?.abort();
      clearTimeout(timer);
      setState({ path, value: null, error: null });
    }
    const reconnect = () => void refresh();
    const visibility = () =>
      document.visibilityState === "visible" ? reconnect() : hide();
    const channel =
      typeof BroadcastChannel === "undefined"
        ? null
        : new BroadcastChannel("account-session");
    if (channel) channel.onmessage = reconnect;
    void refresh();
    window.addEventListener("focus", reconnect);
    window.addEventListener("online", reconnect);
    window.addEventListener("pageshow", reconnect);
    window.addEventListener("pagehide", hide);
    window.addEventListener("account-session-changed", reconnect);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      active = false;
      controller?.abort();
      clearTimeout(timer);
      channel?.close();
      window.removeEventListener("focus", reconnect);
      window.removeEventListener("online", reconnect);
      window.removeEventListener("pageshow", reconnect);
      window.removeEventListener("pagehide", hide);
      window.removeEventListener("account-session-changed", reconnect);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [path, decode, deadline, retry]);
  return {
    value: state.path === path ? state.value : null,
    error: state.path === path ? state.error : null,
    retry: () => setRetry((value) => value + 1),
  };
}
