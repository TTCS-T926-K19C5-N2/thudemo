import { api, ApiError as HttpError, object } from "./api/client";

export type ApiError = {
  message?: string;
  retryAfterSeconds?: number;
  errors?: Record<string, string>;
};

export async function readApiError(response: Response): Promise<ApiError> {
  try {
    const body: unknown = await response.json();
    const value = object(body);
    return {
      message: typeof value.message === "string" ? value.message : undefined,
      retryAfterSeconds:
        typeof value.retryAfterSeconds === "number"
          ? value.retryAfterSeconds
          : undefined,
      errors:
        value.errors &&
        typeof value.errors === "object" &&
        !Array.isArray(value.errors)
          ? Object.fromEntries(
              Object.entries(value.errors).filter(
                (entry): entry is [string, string] =>
                  typeof entry[1] === "string",
              ),
            )
          : undefined,
    };
  } catch {
    // Network/proxy failures may not have a JSON body.
  }
  return { message: "Không thể kết nối. Kiểm tra kết nối rồi thử lại." };
}

export type CurrentUser = { id: string; email: string; roles: string[] };

export function decodeCurrentUser(value: unknown): CurrentUser {
  const user = object(value);
  if (
    typeof user.id !== "string" ||
    typeof user.email !== "string" ||
    !Array.isArray(user.roles) ||
    !user.roles.every((role): role is string => typeof role === "string")
  )
    throw new HttpError(
      "Không đọc được phiên đăng nhập. Hãy thử lại.",
      502,
      "INVALID_RESPONSE",
    );
  return { id: user.id, email: user.email, roles: user.roles };
}

export async function loadCurrentUser(): Promise<CurrentUser | null> {
  try {
    return await api("/auth/me", decodeCurrentUser);
  } catch (error) {
    if (error instanceof HttpError && error.status === 401) return null;
    throw error;
  }
}

export function safeReturnTo(value: string | null): string | null {
  return value &&
    /^\/shows\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/seats$/i.test(
      value,
    )
    ? value
    : null;
}
