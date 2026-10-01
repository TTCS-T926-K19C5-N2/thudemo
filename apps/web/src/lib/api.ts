export type ApiError = {
  message?: string;
  retryAfterSeconds?: number;
  errors?: Record<string, string>;
};

export async function readApiError(response: Response): Promise<ApiError> {
  try {
    const body: unknown = await response.json();
    if (body && typeof body === "object") return body as ApiError;
  } catch {
    // Network/proxy failures may not have a JSON body.
  }
  return { message: "Không thể kết nối. Kiểm tra kết nối rồi thử lại." };
}

export type CurrentUser = { id: string; email: string; roles: string[] };

export async function loadCurrentUser(): Promise<CurrentUser | null> {
  const response = await fetch("/api/auth/me", { cache: "no-store" });
  if (response.status === 401) return null;
  if (!response.ok) throw new Error("Không tải được phiên đăng nhập.");
  return response.json() as Promise<CurrentUser>;
}

export type RegisterResult = {
  status: string;
  message: string;
  activationToken?: string;
};

export async function registerUser(email: string, password: string): Promise<RegisterResult> {
  const response = await fetch("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) {
    const error = await readApiError(response);
    throw error;
  }
  return response.json() as Promise<RegisterResult>;
}

export async function activateAccount(token: string): Promise<{ status: string; message: string }> {
  const response = await fetch("/api/auth/activate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  });
  if (!response.ok) {
    const error = await readApiError(response);
    throw error;
  }
  return response.json() as Promise<{ status: string; message: string }>;
}

export async function resendActivationLink(email: string): Promise<{ status: string; message: string }> {
  const response = await fetch("/api/auth/resend-activation", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  if (!response.ok) {
    const error = await readApiError(response);
    throw error;
  }
  return response.json() as Promise<{ status: string; message: string }>;
}

