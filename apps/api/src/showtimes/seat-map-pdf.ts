import PDFDocument from 'pdfkit';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const FONT = require.resolve('dejavu-fonts-ttf/ttf/DejaVuSans.ttf');
const STATUS = {
  AVAILABLE: { color: '#dcfce7', symbol: 'A', label: 'Còn trống' },
  HELD: { color: '#fef3c7', symbol: 'H', label: 'Đang giữ' },
  SOLD: { color: '#fecaca', symbol: 'S', label: 'Đã bán' },
} as const;

export type PdfSeat = {
  row: string;
  seatNumber: number;
  category: string;
  price: number | null;
  status: keyof typeof STATUS;
};

export async function createSeatMapPdf(input: {
  eventName: string;
  showtime: Date;
  generatedAt: Date;
  seats: PdfSeat[];
}): Promise<Buffer> {
  const rows = [...new Set(input.seats.map((seat) => seat.row))].sort((a, b) =>
    a.localeCompare(b, 'vi', { numeric: true }),
  );
  const maxSeat = Math.max(0, ...input.seats.map((seat) => seat.seatNumber));
  const cell = maxSeat > 80 ? 22 : 28;
  const rowHeight = maxSeat > 80 ? 25 : 32;
  const left = 100;
  const top = 142;
  const width = Math.max(842, left + maxSeat * cell + 42);
  const height = Math.max(595, top + rows.length * rowHeight + 40);
  const doc = new PDFDocument({ size: [width, height], margin: 0, compress: true, info: { Title: `Sơ đồ ghế - ${input.eventName}`, Subject: 'Sơ đồ trạng thái ghế một thời điểm' } });
  const chunks: Buffer[] = [];
  const pdf = new Promise<Buffer>((resolve, reject) => {
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
  doc.font(FONT).fillColor('#111827');
  doc.fontSize(19).text(input.eventName, 40, 28, { width: width - 80, lineBreak: false, ellipsis: true });
  doc.fontSize(11).text(`Suất: ${input.showtime.toISOString()}    |    Chụp lúc: ${input.generatedAt.toISOString()}`, 40, 58, { width: width - 80 });
  doc.fontSize(10).text(`Tổng ${input.seats.length} ghế · ${rows.length} hàng`, 40, 78);
  let legendX = 40;
  for (const state of Object.values(STATUS)) {
    doc.rect(legendX, 105, 16, 16).fill(state.color).stroke('#475569');
    doc.fillColor('#111827').fontSize(9).text(`${state.symbol}: ${state.label}`, legendX + 22, 108, { lineBreak: false });
    legendX += 125;
  }
  const byRow = new Map<string, PdfSeat[]>();
  for (const seat of input.seats) byRow.set(seat.row, [...(byRow.get(seat.row) ?? []), seat]);
  for (const list of byRow.values()) list.sort((a, b) => a.seatNumber - b.seatNumber);
  rows.forEach((row, rowIndex) => {
    const y = top + rowIndex * rowHeight;
    doc.fontSize(9).fillColor('#111827').text(row, 42, y + 5, { width: 48, lineBreak: false, ellipsis: true });
    for (const seat of byRow.get(row) ?? []) {
      const x = left + (seat.seatNumber - 1) * cell;
      const state = STATUS[seat.status];
      doc.rect(x, y, cell - 3, rowHeight - 3).fill(state.color).stroke('#64748b');
      doc.fillColor('#111827').fontSize(cell < 24 ? 6 : 7).text(`${seat.seatNumber}`, x + 1, y + 2, { width: cell - 5, align: 'center', lineBreak: false });
      if (seat.category) doc.fontSize(4).text(seat.category.slice(0, 12), x + 1, y + rowHeight - 9, { width: cell - 5, align: 'center', lineBreak: false, ellipsis: true });
    }
  });
  doc.end();
  return pdf;
}
