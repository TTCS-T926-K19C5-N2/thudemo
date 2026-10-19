import { parseTicketQr, type TicketQrPublicKey } from "shared/ticket-qr";
import { ApiError, object } from "@/lib/api/client";
export function decodeQrKeys(value: unknown): TicketQrPublicKey[] {
  const data = object(value);
  if (!Array.isArray(data.keys) || !data.keys.length)
    throw new ApiError(
      "Chưa tải được khóa xác minh QR.",
      502,
      "INVALID_RESPONSE",
    );
  return data.keys.map((raw) => {
    const key = object(raw);
    if (typeof key.keyId !== "string" || typeof key.key !== "string")
      throw new ApiError(
        "Khóa xác minh không hợp lệ.",
        502,
        "INVALID_RESPONSE",
      );
    return { keyId: key.keyId, key: key.key };
  });
}
function bytes(base64: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(
    atob(base64.replace(/-/g, "+").replace(/_/g, "/")),
    (c) => c.charCodeAt(0),
  );
}
export async function verifyTicketQr(
  value: string,
  keys: TicketQrPublicKey[],
  showtimeId: string,
) {
  const qr = parseTicketQr(value);
  const key = qr && keys.find((key) => key.keyId === qr.keyId);
  if (!qr || !key)
    throw new ApiError(
      "Mã QR không hợp lệ hoặc chưa có khóa xác minh. Tải lại quyền cửa và thử lại.",
      400,
      "INVALID_QR_SIGNATURE",
    );
  let valid = false;
  try {
    const spki = key.key.replace(
      /-----BEGIN PUBLIC KEY-----|-----END PUBLIC KEY-----|\s/g,
      "",
    );
    const publicKey = await crypto.subtle.importKey(
      "spki",
      bytes(spki),
      "Ed25519",
      false,
      ["verify"],
    );
    valid = await crypto.subtle.verify(
      "Ed25519",
      publicKey,
      bytes(qr.signature),
      new TextEncoder().encode(qr.signingInput),
    );
  } catch {
    // Server verification is still mandatory. Unsupported browsers get an actionable error, never a client "valid".
    throw new ApiError(
      "Trình duyệt chưa thể xác minh QR. Dùng trình duyệt được hỗ trợ hoặc liên hệ người phụ trách.",
      400,
      "QR_BROWSER_UNSUPPORTED",
    );
  }
  if (!valid)
    throw new ApiError("Chữ ký QR không hợp lệ.", 400, "INVALID_QR_SIGNATURE");
  if (qr.showtimeId !== showtimeId.toLowerCase())
    throw new ApiError("Vé không thuộc suất đang soát.", 400, "WRONG_SHOWTIME");
}
