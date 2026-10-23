import { createSeatMapPdf, type PdfSeat } from './seat-map-pdf.js';

function map(count: number): PdfSeat[] {
  return Array.from({ length: count }, (_, index) => ({
    row: `Hàng ${Math.floor(index / 40) + 1}`,
    seatNumber: (index % 40) + 1,
    category: index % 2 ? 'Thường' : 'Ưu tiên',
    price: index % 2 ? 100_000 : 250_000,
    status: (['AVAILABLE', 'HELD', 'SOLD'] as const)[index % 3],
  }));
}

describe('one-page seat map PDF', () => {
  it.each([6, 2000])('renders %i seats with Vietnamese text on exactly one page', async (count) => {
    const pdf = await createSeatMapPdf({
      eventName: 'Đêm nhạc mùa hè – Sơ đồ ghế',
      showtime: new Date('2030-06-15T10:30:00.000Z'),
      generatedAt: new Date('2030-06-01T12:00:00.000Z'),
      seats: map(count),
    });
    const source = pdf.toString('latin1');
    expect(source.startsWith('%PDF-')).toBe(true);
    expect(source.match(/\/Type \/Page\b/g)).toHaveLength(1);
    expect(source).toContain('/FontFile2');
    expect(source).toContain('/MediaBox');
  });
});
