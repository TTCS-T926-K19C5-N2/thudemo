import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/client";
import {
  CHECK_IN_WAIT_TIMEOUT_MS,
  checkInFailureState,
  checkInWithWaiting,
} from "./check-in-request";

describe("ticket check-in request", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows WAITING after three seconds while the request is still pending", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    let resolveRequest!: (value: string) => void;
    const waiting = vi.fn();
    const pending = checkInWithWaiting(
      () =>
        new Promise<string>((resolve) => {
          resolveRequest = resolve;
        }),
      waiting,
      controller.signal,
    );

    await vi.advanceTimersByTimeAsync(CHECK_IN_WAIT_TIMEOUT_MS - 1);
    expect(waiting).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(waiting).toHaveBeenCalledOnce();

    resolveRequest("SUCCESS");
    await expect(pending).resolves.toBe("SUCCESS");
  });

  it("clears the waiting timer when a quick response arrives", async () => {
    vi.useFakeTimers();
    const waiting = vi.fn();
    const result = await checkInWithWaiting(
      async () => "SUCCESS",
      waiting,
      new AbortController().signal,
    );

    await vi.advanceTimersByTimeAsync(CHECK_IN_WAIT_TIMEOUT_MS);
    expect(result).toBe("SUCCESS");
    expect(waiting).not.toHaveBeenCalled();
  });

  it("does not show WAITING after the request has been cancelled", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const waiting = vi.fn();
    const pending = checkInWithWaiting(
      (signal) =>
        new Promise<string>((_resolve, reject) => {
          signal.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"));
          });
        }),
      waiting,
      controller.signal,
    );

    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    await vi.advanceTimersByTimeAsync(CHECK_IN_WAIT_TIMEOUT_MS);
    expect(waiting).not.toHaveBeenCalled();
  });

  it("treats invalid tickets as INVALID and network/server failures as ERROR", () => {
    expect(
      checkInFailureState(new ApiError("invalid", 404, "INVALID_TICKET")),
    ).toBe("INVALID");
    expect(
      checkInFailureState(new ApiError("conflict", 409, "ALREADY_USED")),
    ).toBe("INVALID");
    expect(
      checkInFailureState(new ApiError("invalid payload", 422, "INVALID")),
    ).toBe("INVALID");
    expect(
      checkInFailureState(new ApiError("unauthorized", 401, "UNAUTHORIZED")),
    ).toBe("ERROR");
    expect(
      checkInFailureState(new ApiError("offline", 0, "NETWORK_ERROR")),
    ).toBe("ERROR");
    expect(checkInFailureState(new ApiError("server", 503, "HTTP_503"))).toBe(
      "ERROR",
    );
  });
});
