import { validateSeatMap } from './seat-map.js';
describe('seat map validation', () => {
  it('reports all missing, wrong-type, empty and duplicate fields with indexes', () => {
    const errors = validateSeatMap({
      seats: [
        { row: '', seatNumber: '1', category: '' },
        { row: 'A', seatNumber: 1, category: 'VIP' },
        { row: ' A ', seatNumber: 1, category: null },
      ],
    });
    expect(errors).toHaveLength(5);
    expect(errors.map((e) => e.index)).toEqual([0, 0, 0, 2, 2]);
  });
  it('accepts valid seats; rejects missing root, empty and oversized maps', () => {
    expect(
      validateSeatMap({
        seats: [{ row: 'A', seatNumber: 1, category: 'VIP' }],
      }),
    ).toEqual([]);
    for (const v of [null, {}, { seats: [] }, { seats: Array(2001).fill({}) }])
      expect(validateSeatMap(v).length).toBeGreaterThan(0);
  });
});
