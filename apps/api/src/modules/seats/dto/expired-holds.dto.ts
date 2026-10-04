/**
 * DTO đại diện cho một bản ghi giữ chỗ đã hết hạn trong hệ thống
 */
export class ExpiredHoldItemDto {
  /**
   * Mã định danh của lượt giữ chỗ (nếu có)
   * @example "hold_abc_123"
   */
  holdId?: string;

  /**
   * Mã suất chiếu
   * @example "st_101"
   */
  showtimeId!: string;

  /**
   * Mã ghế
   * @example "A1"
   */
  seatId!: string;

  /**
   * Danh sách ghế trong cùng một lượt giữ (nếu hold theo cụm)
   * @example ["A1", "A2"]
   */
  seatIds?: string[];

  /**
   * Mã người dùng đã thực hiện giữ chỗ
   * @example "usr_previous_buyer"
   */
  userId?: string;

  /**
   * Thời điểm bắt đầu giữ chỗ (timestamp milliseconds)
   * @example 1791033335000
   */
  heldAt?: number;

  /**
   * Thời điểm hết hạn giữ chỗ (ISO 8601 UTC)
   * @example "2026-10-04T13:45:00.000Z"
   */
  expiresAt!: string;

  /**
   * Số giây đã trôi qua kể từ khi lượt giữ chỗ hết hạn
   * @example 60
   */
  expiredSecondsAgo!: number;
}

/**
 * Query Params DTO cho việc tìm kiếm danh sách giữ chỗ đã hết hạn
 */
export class QueryExpiredHoldsDto {
  /**
   * Lọc theo mã suất chiếu cụ thể (tùy chọn)
   * @example "st_101"
   */
  showtimeId?: string;

  /**
   * Giới hạn số lượng bản ghi trả về (tùy chọn)
   * @example 100
   */
  limit?: number;
}

/**
 * Response DTO trả về danh sách các lượt giữ chỗ đã hết hạn
 */
export class ExpiredHoldsResponseDto {
  /**
   * Mã suất chiếu đã truy vấn (nếu có lọc theo suất chiếu)
   * @example "st_101"
   */
  showtimeId?: string;

  /**
   * Tổng số lượt giữ chỗ đã hết hạn tìm thấy
   * @example 2
   */
  totalExpired!: number;

  /**
   * Danh sách chi tiết các lượt giữ chỗ đã hết hạn
   */
  expiredHolds!: ExpiredHoldItemDto[];

  /**
   * Thời điểm thực hiện truy vấn (ISO 8601 UTC)
   * @example "2026-10-04T13:50:00.000Z"
   */
  queriedAt!: string;
}
