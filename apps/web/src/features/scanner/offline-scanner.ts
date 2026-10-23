import { parseTicketQr, type TicketQrPublicKey } from "shared/ticket-qr";
import {
  getShowtimeMeta,
  getTicketByCode,
  hasOfflineScanForTicket,
  saveOfflineScanAtomic,
  type OfflineScanRecord,
} from "./scanner-db";

export type OfflineScanResultCode =
  | "OK"
  | "INVALID_SIGNATURE"
  | "WRONG_SHOWTIME"
  | "NOT_IN_LIST"
  | "CANCELLED"
  | "ALREADY_CHECKED_IN"
  | "DUPLICATE_ON_DEVICE"
  | "NO_LIST_OFFLINE";

export interface OfflineScanOutcome {
  success: boolean;
  code: OfflineScanResultCode;
  message: string;
  ticket?: {
    code: string;
  };
}

export interface ProcessOfflineScanParams {
  showtimeId: string;
  qrPayload: string;
  gateId?: string;
  gateName?: string;
  staffId?: string;
  deviceId?: string;
}

function base64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(
    atob(base64.replace(/-/g, "+").replace(/_/g, "/")),
    (c) => c.charCodeAt(0),
  );
}

export async function verifyEd25519Offline(
  publicKeyPem: string,
  signatureBase64Url: string,
  signingInput: string,
): Promise<boolean> {
  try {
    const spki = publicKeyPem.replace(
      /-----BEGIN PUBLIC KEY-----|-----END PUBLIC KEY-----|\s/g,
      "",
    );
    const keyData = base64ToBytes(spki);
    const signatureBytes = base64ToBytes(signatureBase64Url);
    const dataBytes = new TextEncoder().encode(signingInput);

    if (typeof crypto !== "undefined" && crypto.subtle) {
      const publicKey = await crypto.subtle.importKey(
        "spki",
        keyData,
        "Ed25519",
        false,
        ["verify"],
      );
      return await crypto.subtle.verify(
        "Ed25519",
        publicKey,
        signatureBytes,
        dataBytes,
      );
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Executes the offline scan flow strictly following Section 4.3 in huong-dan-antigravity.md:
 * 1. Check if showtime list has been downloaded
 * 2. Verify QR signature with saved offline public key
 * 3. Verify showtime matches current showtime
 * 4. Lookup ticket code in local IndexedDB
 * 5. Check if cancelled
 * 6. Check if already checked in in downloaded list
 * 7. Check if already checked in on this device (local duplicate)
 * 8. Valid -> Atomically mark checked in and enqueue in scan_queue
 */
export async function processOfflineScan(
  params: ProcessOfflineScanParams,
): Promise<OfflineScanOutcome> {
  const { showtimeId, qrPayload, gateId, gateName, staffId, deviceId } = params;

  // 1. Check if showtime list has been downloaded (AC #4)
  const meta = await getShowtimeMeta(showtimeId);
  if (!meta || meta.ticketCount === 0) {
    return {
      success: false,
      code: "NO_LIST_OFFLINE",
      message:
        "Không soát được. Chưa có danh sách vé của suất này. Hãy kết nối mạng và bấm 'Tải danh sách' trước khi vào cửa.",
    };
  }

  // 2. Decode QR and verify signature with saved public keys
  const qr = parseTicketQr(qrPayload);
  if (!qr) {
    return {
      success: false,
      code: "INVALID_SIGNATURE",
      message: "Chữ ký QR không hợp lệ hoặc mã vé sai định dạng.",
    };
  }

  const keys: TicketQrPublicKey[] = meta.verificationKeys?.length
    ? meta.verificationKeys
    : meta.publicKey
      ? [{ keyId: meta.keyId, key: meta.publicKey }]
      : [];

  const matchedKey = keys.find((k) => k.keyId === qr.keyId);
  if (!matchedKey) {
    return {
      success: false,
      code: "INVALID_SIGNATURE",
      message:
        "Chữ ký QR không hợp lệ (không tìm thấy khoá xác minh trên thiết bị).",
    };
  }

  const isValidSignature = await verifyEd25519Offline(
    matchedKey.key,
    qr.signature,
    qr.signingInput,
  );
  if (!isValidSignature) {
    return {
      success: false,
      code: "INVALID_SIGNATURE",
      message: "Chữ ký QR không hợp lệ.",
    };
  }

  // 3. Verify showtime matches current showtime
  if (qr.showtimeId.toLowerCase() !== showtimeId.toLowerCase()) {
    return {
      success: false,
      code: "WRONG_SHOWTIME",
      message: "Vé không thuộc suất đang soát.",
    };
  }

  // 4. Lookup ticket by code in local IndexedDB
  const ticket = await getTicketByCode(showtimeId, qr.ticketId);
  if (!ticket) {
    return {
      success: false,
      code: "NOT_IN_LIST",
      message:
        "Vé không có trong danh sách đã tải. Hãy kết nối mạng để tải lại danh sách.",
    };
  }

  // 5. Check if cancelled
  if (ticket.status === "cancelled") {
    return {
      success: false,
      code: "CANCELLED",
      message: "Vé đã bị huỷ.",
    };
  }

  // 6. Check if already checked in in downloaded list (AC #2)
  const alreadyScannedOnDevice = await hasOfflineScanForTicket(
    showtimeId,
    qr.ticketId,
  );
  if (ticket.status === "checked_in" && !alreadyScannedOnDevice) {
    return {
      success: false,
      code: "ALREADY_CHECKED_IN",
      message: "Vé đã sử dụng.",
    };
  }

  // 7. Check if already checked in on this device (AC #3)
  const isDuplicateOnDevice =
    (await hasOfflineScanForTicket(showtimeId, qr.ticketId));

  if (isDuplicateOnDevice) {
    return {
      success: false,
      code: "DUPLICATE_ON_DEVICE",
      message: "Vé đã được quét offline trên máy này (DUPLICATE_ON_DEVICE).",
    };
  }

  // 8. Valid -> Atomically mark checked in and record in scan_queue (AC #1)
  if (!gateId || !staffId || !deviceId) {
    return { success: false, code: 'NO_LIST_OFFLINE', message: 'Chọn cửa, đăng nhập đúng nhân viên và chuẩn bị thiết bị trước khi quét offline.' };
  }
  const scannedAt = new Date().toISOString();
  const scanRecord: OfflineScanRecord = {
    scanId: crypto.randomUUID(),
    ticketCode: qr.ticketId,
    qrPayload,
    showtimeId,
    gateId,
    gateName: gateName ?? "Cửa soát vé",
    scannedAt,
    deviceId,
    staffId,
    offline: true,
    syncStatus: "pending",
  };

  await saveOfflineScanAtomic(scanRecord);

  return {
    success: true,
    code: "OK",
    message: "Vé hợp lệ. Check-in thành công (ngoại tuyến).",
    ticket: {
      code: ticket.code,
    },
  };
}
