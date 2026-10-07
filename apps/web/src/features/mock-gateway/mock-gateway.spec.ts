import { describe, expect, it } from "vitest";

export interface MockSubmitResponse {
  success: boolean;
  redirectUrl: string;
}

export function decodeMockSubmitResponse(raw: unknown): MockSubmitResponse {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("Phản hồi không hợp lệ");
  }
  const obj = raw as Record<string, unknown>;
  if (typeof obj.success !== "boolean" || typeof obj.redirectUrl !== "string") {
    throw new Error("Dữ liệu phản hồi thiếu trường bắt buộc");
  }
  return {
    success: obj.success,
    redirectUrl: obj.redirectUrl,
  };
}

describe("Mock Gateway Contracts & Behavior (S-19)", () => {
  it("decodes successful mock gateway submission response", () => {
    const raw = {
      success: true,
      redirectUrl: "http://localhost:3000/payment/result?orderId=123",
      status: "SUCCESS",
    };

    const decoded = decodeMockSubmitResponse(raw);
    expect(decoded.success).toBe(true);
    expect(decoded.redirectUrl).toBe("http://localhost:3000/payment/result?orderId=123");
  });

  it("throws error when response is invalid or missing redirectUrl", () => {
    expect(() => decodeMockSubmitResponse({})).toThrow();
    expect(() => decodeMockSubmitResponse({ success: true })).toThrow();
    expect(() => decodeMockSubmitResponse(null)).toThrow();
  });
});
