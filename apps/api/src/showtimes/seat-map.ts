export type ImportedSeat = {
  row: string;
  seatNumber: number;
  category: string;
};
export type MapError = { index: number | null; field: string; message: string };
export function validateSeatMap(value: unknown): MapError[] {
  if (
    !value ||
    typeof value !== 'object' ||
    !Array.isArray((value as Record<string, unknown>).seats)
  )
    return [
      { index: null, field: 'seats', message: 'JSON cần có mảng seats.' },
    ];
  const seats = (value as { seats: unknown[] }).seats;
  const errors: MapError[] = [];
  if (!seats.length || seats.length > 2000)
    errors.push({
      index: null,
      field: 'seats',
      message: 'Cần từ 1 đến 2.000 ghế.',
    });
  const seen = new Set<string>();
  seats.forEach((value, index) => {
    const seat =
      value && typeof value === 'object'
        ? (value as Record<string, unknown>)
        : {};
    for (const field of ['row', 'category']) {
      if (
        typeof seat[field] !== 'string' ||
        !(seat[field] as string).trim() ||
        (seat[field] as string).length > 80
      )
        errors.push({
          index,
          field,
          message: `${field} cần là chuỗi không rỗng, tối đa 80 ký tự.`,
        });
    }
    if (
      !Number.isInteger(seat.seatNumber) ||
      Number(seat.seatNumber) < 1 ||
      Number(seat.seatNumber) > 2147483647
    )
      errors.push({
        index,
        field: 'seatNumber',
        message: 'Số ghế cần là số nguyên dương hợp lệ.',
      });
    if (typeof seat.row === 'string' && Number.isInteger(seat.seatNumber)) {
      const key = JSON.stringify([seat.row.trim(), seat.seatNumber]);
      if (seen.has(key))
        errors.push({
          index,
          field: 'seatNumber',
          message: 'Ghế trùng hàng và số.',
        });
      seen.add(key);
    }
  });
  return errors;
}
