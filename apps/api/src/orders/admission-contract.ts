import { BadRequestException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export type ScanCommand = {
  qrPayload: string;
  gateId: string;
  requestId: string;
  reason?: string;
  ownerConfirmed?: boolean;
};

export function scanCommand(body: unknown, exception = false): ScanCommand {
  if (!body || typeof body !== 'object' || Array.isArray(body))
    throw new BadRequestException({
      code: 'INVALID_SCAN',
      message: 'Yêu cầu quét vé không hợp lệ.',
    });
  const value = body as Record<string, unknown>;
  if (
    typeof value.qrPayload !== 'string' ||
    value.qrPayload.length > 256 ||
    'ticketId' in value
  )
    throw new BadRequestException({
      code: 'INVALID_QR_SIGNATURE',
      message: 'Cần mã QR có chữ ký; mã vé trần không được chấp nhận.',
    });
  for (const key of ['gateId']) {
    if (typeof value[key] !== 'string' || !uuid.test(value[key]))
      throw new BadRequestException({
        code: 'INVALID_GATE',
        message: 'Chọn cửa được cấp quyền trước khi quét vé.',
      });
  }
  const requestId = value.requestId ?? randomUUID();
  if (typeof requestId !== 'string' || !uuid.test(requestId))
    throw new BadRequestException({
      code: 'INVALID_REQUEST_ID',
      message: 'Mã yêu cầu không hợp lệ. Hãy quét lại.',
    });
  if (
    [
      'staffId',
      'staffName',
      'employeeId',
      'employeeName',
      'userId',
      'userName',
      'actorId',
      'actorName',
      'checkedInAt',
      'enteredAt',
    ].some((key) => key in value)
  )
    throw new BadRequestException({
      code: 'CLIENT_IDENTITY_REJECTED',
      message: 'Không được gửi danh tính nhân viên hoặc thời gian từ thiết bị.',
    });
  if (
    exception &&
    (typeof value.reason !== 'string' ||
      !value.reason.trim() ||
      value.reason.length > 500 ||
      value.ownerConfirmed !== true)
  )
    throw new BadRequestException({
      code: 'EXCEPTION_DETAILS_REQUIRED',
      message: 'Xác nhận đã kiểm tra chủ vé và nhập lý do từ 1 đến 500 ký tự.',
    });
  return {
    qrPayload: value.qrPayload as string,
    gateId: (value.gateId as string).toLowerCase(),
    requestId: requestId.toLowerCase(),
    ...(exception
      ? { reason: (value.reason as string).trim(), ownerConfirmed: true }
      : {}),
  };
}
