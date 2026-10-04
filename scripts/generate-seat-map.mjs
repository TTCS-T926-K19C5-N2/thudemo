import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
const count = Number(process.argv[2] ?? 2000);
if (!Number.isInteger(count) || count < 1 || count > 2000) throw new Error('Count must be an integer from 1 to 2000');
const seats = Array.from({ length: count }, (_, i) => ({ row: String.fromCharCode(65 + Math.floor(i / 50 / 26)) + String.fromCharCode(65 + Math.floor(i / 50) % 26), seatNumber: i % 50 + 1, category: i < count / 5 ? 'VIP' : i < count * .7 ? 'Tiêu chuẩn' : 'Ban công' }));
const output = resolve(process.argv[3] ?? 'fixtures/seat-map-2000.json');
mkdirSync(resolve(output, '..'), { recursive: true });
writeFileSync(output, JSON.stringify({ seats }, null, 2));
console.log(`Generated ${count} seats`);
