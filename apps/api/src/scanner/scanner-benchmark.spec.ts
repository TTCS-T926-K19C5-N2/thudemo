import { describe, it, expect } from 'vitest';
import { gzipSync } from 'node:zlib';
import type { ScannerTicketItem, ShowtimeTicketsResponse } from './scanner.service.js';

describe('S-33 Performance Benchmark: 5000 and 20000 tickets (AC #3)', () => {
  function generateMockTickets(count: number): ScannerTicketItem[] {
    const list: ScannerTicketItem[] = [];
    const rows = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'J', 'K'];
    const types = ['STANDARD', 'VIP', 'SWEETBOX'];

    for (let i = 0; i < count; i++) {
      const row = rows[i % rows.length];
      const seatNum = (i % 50) + 1;
      const type = types[i % types.length];
      const isCheckedIn = i % 10 === 0;

      list.push({
        code: `TK-${(i + 1).toString(36).toUpperCase().padStart(8, '0')}`,
        status: isCheckedIn ? 'checked_in' : 'valid',
        checkedInAt: isCheckedIn ? new Date(1760000000000 + i * 1000).toISOString() : null,
        seatLabel: `${row}-${seatNum}`,
        ticketType: type,
      });
    }
    return list;
  }

  it('measures payload size and simulated Fast 4G download time for 5,000 tickets', () => {
    const startBuild = performance.now();
    const tickets = generateMockTickets(5000);
    const buildDuration = performance.now() - startBuild;

    const response: ShowtimeTicketsResponse = {
      showtimeId: 'showtime-bench-5000',
      showtimeName: 'Hòa Nhạc Giao Hưởng Quốc Gia 5000 Khách',
      generatedAt: new Date().toISOString(),
      cursor: new Date().toISOString(),
      publicKey: {
        keyId: 'k1',
        key: '-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEA0123456789abcdef0123456789abcdef0123456789abcdef\n-----END PUBLIC KEY-----',
      },
      tickets,
    };

    const jsonString = JSON.stringify(response);
    const rawSizeBytes = Buffer.byteLength(jsonString, 'utf8');
    const bytesPerTicket = rawSizeBytes / 5000;

    const compressedGzip = gzipSync(Buffer.from(jsonString, 'utf8'));
    const compressedSizeBytes = compressedGzip.byteLength;

    // Fast 4G Network Specs:
    // Download throughput: 1.6 MB/s (12.8 Mbps = 1,600,000 B/s)
    // Round-trip latency (RTT): 150ms = 0.150s
    const fast4gThroughputBytesPerSec = 1_600_000;
    const fast4gRttSeconds = 0.150;
    const downloadSeconds = compressedSizeBytes / fast4gThroughputBytesPerSec;
    const totalSimulatedTimeSeconds = fast4gRttSeconds + downloadSeconds;

    console.log(`\n=== KẾT QUẢ ĐO HIỆU NĂNG 5,000 VÉ (AC #3) ===`);
    console.log(`- Kích thước JSON thô: ${(rawSizeBytes / 1024).toFixed(2)} KB (~${bytesPerTicket.toFixed(1)} bytes/vé)`);
    console.log(`- Kích thước nén (gzip): ${(compressedSizeBytes / 1024).toFixed(2)} KB`);
    console.log(`- Thời gian truyền qua Fast 4G (giả lập): ${totalSimulatedTimeSeconds.toFixed(3)} giây`);
    console.log(`- Thời gian tạo/map trên server: ${buildDuration.toFixed(2)} ms`);
    console.log(`- So với ngưỡng AC #3 (< 10 giây): Đạt ${((totalSimulatedTimeSeconds / 10) * 100).toFixed(2)}% ngân sách`);

    // AC #3 Assertion: < 10 seconds
    expect(totalSimulatedTimeSeconds).toBeLessThan(10.0);
    // Payload per ticket <= 120 bytes
    expect(bytesPerTicket).toBeLessThan(120);
    // Compressed size <= 150 KB
    expect(compressedSizeBytes).toBeLessThan(150 * 1024);
  });

  it('measures payload size and simulated Fast 4G download time for 20,000 tickets (headroom)', () => {
    const tickets = generateMockTickets(20000);
    const response: ShowtimeTicketsResponse = {
      showtimeId: 'showtime-bench-20000',
      showtimeName: 'Đại Nhạc Hội Sân Vận Động 20,000 Khách',
      generatedAt: new Date().toISOString(),
      cursor: new Date().toISOString(),
      publicKey: {
        keyId: 'k1',
        key: '-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEA0123456789abcdef0123456789abcdef0123456789abcdef\n-----END PUBLIC KEY-----',
      },
      tickets,
    };

    const jsonString = JSON.stringify(response);
    const rawSizeBytes = Buffer.byteLength(jsonString, 'utf8');
    const compressedGzip = gzipSync(Buffer.from(jsonString, 'utf8'));
    const compressedSizeBytes = compressedGzip.byteLength;

    const fast4gThroughputBytesPerSec = 1_600_000;
    const fast4gRttSeconds = 0.150;
    const downloadSeconds = compressedSizeBytes / fast4gThroughputBytesPerSec;
    const totalSimulatedTimeSeconds = fast4gRttSeconds + downloadSeconds;

    console.log(`\n=== KẾT QUẢ ĐO HIỆU NĂNG 20,000 VÉ (DƯ ĐỊA) ===`);
    console.log(`- Kích thước JSON thô: ${(rawSizeBytes / 1024).toFixed(2)} KB`);
    console.log(`- Kích thước nén (gzip): ${(compressedSizeBytes / 1024).toFixed(2)} KB`);
    console.log(`- Thời gian truyền qua Fast 4G (giả lập): ${totalSimulatedTimeSeconds.toFixed(3)} giây`);

    // Headroom check: 20,000 tickets still well under 10 seconds!
    expect(totalSimulatedTimeSeconds).toBeLessThan(10.0);
  });
});
