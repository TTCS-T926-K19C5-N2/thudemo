import { ApiError } from "@/lib/api/client";

export const CHECK_IN_WAIT_TIMEOUT_MS = 3000;

export async function checkInWithWaiting<T>(
  request: (signal: AbortSignal) => Promise<T>,
  onWaiting: () => void,
  signal: AbortSignal,
): Promise<T> {
  let settled = false;
  const timeout = setTimeout(() => {
    if (!settled && !signal.aborted) onWaiting();
  }, CHECK_IN_WAIT_TIMEOUT_MS);

  try {
    return await request(signal);
  } finally {
    settled = true;
    clearTimeout(timeout);
  }
}

export function checkInFailureState(error: unknown): "INVALID" | "ERROR" {
  return error instanceof ApiError &&
    error.status >= 400 &&
    error.status < 500 &&
    error.status !== 401 &&
    error.status !== 403
    ? "INVALID"
    : "ERROR";
}
