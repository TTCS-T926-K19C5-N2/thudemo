export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "ApiError";
  }
}
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new ApiError(
      "Dữ liệu phản hồi không hợp lệ. Hãy tải lại.",
      502,
      "INVALID_RESPONSE",
    );
  return value as Record<string, unknown>;
}
export async function api<T>(
  path: string,
  decode: (value: unknown) => T,
  options: { method?: string; body?: unknown; signal?: AbortSignal } = {},
): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method: options.method ?? "GET",
    signal: options.signal,
    cache: "no-store",
    ...(options.body === undefined
      ? {}
      : {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(options.body),
        }),
  }).catch((error: unknown) => {
    if (error instanceof Error && error.name === "AbortError") throw error;
    throw new ApiError(
      "Không thể kết nối. Kiểm tra kết nối rồi thử lại.",
      0,
      "NETWORK_ERROR",
    );
  });
  let value: unknown;
  try {
    value = await response.json();
  } catch {
    throw new ApiError(
      "Không đọc được phản hồi. Hãy thử lại.",
      response.status,
      "INVALID_RESPONSE",
    );
  }
  if (!response.ok) {
    const detail =
      value && typeof value === "object" && !Array.isArray(value)
        ? object(value)
        : {};
    const messages = detail.message;
    const message =
      typeof messages === "string"
        ? messages
        : Array.isArray(messages)
          ? messages.filter((s): s is string => typeof s === "string").join(" ")
          : "Không thực hiện được thao tác. Hãy thử lại.";
    throw new ApiError(
      message,
      response.status,
      typeof detail.code === "string" ? detail.code : `HTTP_${response.status}`,
      detail,
    );
  }
  return decode(value);
}
