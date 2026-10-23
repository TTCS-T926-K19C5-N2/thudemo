import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';

const root = resolve(import.meta.dirname, '../../..');
const datasetPath = resolve(root, 'theater_chamber_events_seed.json');
const credentialPath = resolve(root, '.git', 'stitch-correction-password');
const simulationMarker = 'Mã dữ liệu mô phỏng: ';
const legacySimulationMarker = '[SIM-THEATER:';
const disclaimer =
  'MÔ PHỎNG — Đây là chương trình, nghệ sĩ, đơn vị tổ chức, địa điểm, lịch diễn, sơ đồ và giá vé hư cấu để thử nghiệm phần mềm. Không phải sự kiện thật; vé không có giá trị vào cửa và không được dùng để yêu cầu thanh toán thật.';

function requireValue(condition, message) {
  if (!condition) throw new Error(message);
}

function readLocalConfiguration() {
  const envPath = resolve(root, '.env');
  requireValue(existsSync(envPath), 'Không tìm thấy file .env local.');
  const env = parseEnv(readFileSync(envPath, 'utf8'));
  requireValue(
    env.NODE_ENV !== 'production',
    'Không cho phép nhập demo khi NODE_ENV=production.',
  );
  requireValue(
    env.PAYMENT_GATEWAY === 'mock',
    'Chỉ chạy khi PAYMENT_GATEWAY=mock trong .env local.',
  );

  let databaseUrl;
  try {
    databaseUrl = new URL(env.DATABASE_URL ?? '');
  } catch {
    throw new Error('DATABASE_URL trong .env không hợp lệ.');
  }
  requireValue(
    ['localhost', '127.0.0.1', '::1'].includes(databaseUrl.hostname),
    'Chỉ cho phép database trên máy local.',
  );

  const configuredOrigin = new URL(env.WEB_ORIGIN ?? 'http://localhost:3000');
  const requestedOrigin = new URL(
    process.env.DEMO_WEB_ORIGIN ?? configuredOrigin.origin,
  );
  requireValue(
    ['localhost', '127.0.0.1', '[::1]'].includes(requestedOrigin.hostname),
    'Chỉ cho phép ứng dụng web trên loopback local.',
  );
  requireValue(
    requestedOrigin.origin === configuredOrigin.origin,
    'DEMO_WEB_ORIGIN phải khớp WEB_ORIGIN trong .env.',
  );

  const password =
    process.env.DEMO_ORGANIZER_PASSWORD ??
    (existsSync(credentialPath)
      ? readFileSync(credentialPath, 'utf8').trim()
      : '');
  requireValue(
    password.length >= 12,
    'Thiếu mật khẩu local. Đặt DEMO_ORGANIZER_PASSWORD hoặc tạo file .git/stitch-correction-password.',
  );
  return { origin: requestedOrigin.origin, password };
}

function formatDateTime(value, timezone) {
  return new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: timezone,
  }).format(new Date(value));
}

function formatMoney(value) {
  return `${new Intl.NumberFormat('vi-VN').format(value)} ₫`;
}

function validateDataset(dataset, now = new Date()) {
  requireValue(
    dataset && typeof dataset === 'object' && dataset.isFictional === true,
    'Chỉ nhập dataset được đánh dấu isFictional: true.',
  );
  requireValue(
    dataset.timezone === 'Asia/Ho_Chi_Minh' && dataset.currency === 'VND',
    'Dataset cần dùng múi giờ Asia/Ho_Chi_Minh và tiền tệ VND.',
  );
  for (const field of [
    'events',
    'venues',
    'seatMaps',
    'performances',
    'seatInventories',
  ]) {
    requireValue(Array.isArray(dataset[field]), `Dataset thiếu mảng ${field}.`);
  }

  const uniqueById = (items, label) => {
    const map = new Map();
    for (const item of items) {
      requireValue(
        item && typeof item.id === 'string' && item.id.trim(),
        `${label} thiếu id hợp lệ.`,
      );
      requireValue(!map.has(item.id), `${label} bị trùng id ${item.id}.`);
      map.set(item.id, item);
    }
    return map;
  };
  const events = uniqueById(dataset.events, 'Sự kiện');
  const venues = uniqueById(dataset.venues, 'Địa điểm');
  const seatMaps = uniqueById(dataset.seatMaps, 'Sơ đồ ghế');
  const performances = uniqueById(dataset.performances, 'Suất diễn');
  const inventoryByPerformance = new Map(
    dataset.seatInventories.map((inventory) => [
      inventory.performanceId,
      inventory,
    ]),
  );
  requireValue(
    inventoryByPerformance.size === dataset.seatInventories.length,
    'Tồn kho ghế có performanceId trùng.',
  );
  requireValue(
    dataset.seatInventories.length === performances.size,
    'Mỗi suất diễn cần một bản ghi tồn kho mô phỏng.',
  );

  const eventPlans = new Map();
  for (const event of events.values()) {
    requireValue(
      typeof event.title === 'string' &&
        event.title.trim() &&
        typeof event.description === 'string' &&
        event.description.trim(),
      `Sự kiện ${event.id} thiếu tên hoặc nội dung.`,
    );
    const venue = venues.get(event.venueId);
    requireValue(venue, `Không tìm thấy địa điểm của ${event.id}.`);
    requireValue(
      typeof venue.name === 'string' &&
        venue.name.trim() &&
        typeof venue.address === 'string' &&
        venue.address.trim() &&
        typeof venue.city === 'string' &&
        venue.city.trim(),
      `Địa điểm của ${event.id} thiếu tên, địa chỉ hoặc thành phố.`,
    );
    requireValue(
      Array.isArray(event.artists) &&
        event.artists.every(
          (artist) => typeof artist === 'string' && artist.trim(),
        ) &&
        Number.isInteger(event.durationMinutes) &&
        event.durationMinutes > 0 &&
        Number.isInteger(event.minAge) &&
        event.minAge >= 0,
      `Sự kiện ${event.id} có thông tin nghệ sĩ/thời lượng/độ tuổi không hợp lệ.`,
    );
    const marker = `${simulationMarker}${event.id}`;
    const legacyMarker = `${legacySimulationMarker}${event.id}]`;
    const title = `[MÔ PHỎNG] ${event.title.trim()}`;
    const performancesForEvent = [...performances.values()].filter(
      (performance) => performance.eventId === event.id,
    );
    requireValue(
      performancesForEvent.length > 0,
      `Sự kiện ${event.id} chưa có suất diễn.`,
    );

    const startTimes = new Set();
    for (const performance of performancesForEvent) {
      requireValue(
        performance.venueId === event.venueId,
        `Địa điểm suất ${performance.id} không khớp sự kiện.`,
      );
      const seatMap = seatMaps.get(performance.seatMapId);
      requireValue(seatMap, `Không tìm thấy sơ đồ ghế của ${performance.id}.`);
      requireValue(
        venue.layoutId === seatMap.id,
        `Sơ đồ ghế không thuộc địa điểm của ${performance.id}.`,
      );
      requireValue(
        Array.isArray(seatMap.seats) &&
          seatMap.seats.length > 0 &&
          seatMap.seats.length <= 2000,
        `Sơ đồ ${seatMap.id} cần có từ 1 đến 2.000 ghế.`,
      );
      const categories = new Set();
      const seatKeys = new Set();
      for (const seat of seatMap.seats) {
        requireValue(
          typeof seat.row === 'string' &&
            seat.row.trim() &&
          seat.row.length <= 80 &&
          Number.isInteger(seat.number) &&
          seat.number > 0 &&
          typeof seat.sectionId === 'string' &&
          seat.sectionId.trim() === seat.sectionId &&
          seat.sectionId.length <= 80,
          `Sơ đồ ${seatMap.id} có ghế không hợp lệ.`,
        );
        const seatKey = `${seat.row.trim()}\0${seat.number}`;
        requireValue(!seatKeys.has(seatKey), `Sơ đồ ${seatMap.id} bị trùng ghế.`);
        seatKeys.add(seatKey);
        categories.add(seat.sectionId.trim());
      }
      const prices = performance.priceBySection;
      requireValue(
        prices && typeof prices === 'object' && !Array.isArray(prices),
        `Suất ${performance.id} thiếu bảng giá.`,
      );
      for (const category of categories) {
        requireValue(
          Number.isSafeInteger(prices[category]) && prices[category] >= 0,
          `Suất ${performance.id} thiếu giá hợp lệ cho hạng ${category}.`,
        );
      }
      requireValue(
        Object.keys(prices).every((category) => categories.has(category)),
        `Suất ${performance.id} có hạng giá không nằm trên sơ đồ.`,
      );
      requireValue(
        inventoryByPerformance.has(performance.id),
        `Suất ${performance.id} thiếu tồn kho mô phỏng.`,
      );

      const startAt = Date.parse(performance.startAt);
      const endAt = Date.parse(performance.endAt);
      const doorsOpenAt = Date.parse(performance.doorsOpenAt);
      const salesStartAt = Date.parse(performance.salesStartAt);
      const salesEndAt = Date.parse(performance.salesEndAt);
      const timeValues = [
        performance.startAt,
        performance.endAt,
        performance.doorsOpenAt,
        performance.salesStartAt,
        performance.salesEndAt,
      ];
      requireValue(
        timeValues.every(
          (value) =>
            typeof value === 'string' &&
            /(?:Z|[+-]\d{2}:\d{2})$/i.test(value),
        ) &&
          [startAt, endAt, doorsOpenAt, salesStartAt, salesEndAt].every(
            Number.isFinite,
          ) &&
          startAt > now.getTime() &&
          endAt > startAt &&
          doorsOpenAt < startAt &&
          salesStartAt <= now.getTime() &&
          salesEndAt > now.getTime(),
        `Suất ${performance.id} không có lịch diễn/sale window đang hợp lệ trong tương lai.`,
      );
      const startTime = new Date(startAt).toISOString();
      requireValue(
        !startTimes.has(startTime),
        `Sự kiện ${event.id} có hai suất trùng giờ bắt đầu.`,
      );
      startTimes.add(startTime);
      requireValue(
        performance.bookingStatus === 'on_sale',
        `Suất ${performance.id} không ở trạng thái on_sale.`,
      );
      requireValue(
        performance.currency === 'VND',
        `Suất ${performance.id} không dùng VND.`,
      );
    }

    const location = `${venue.name} — ĐỊA ĐIỂM GIẢ LẬP, ${venue.address}, ${venue.city}`;
    const details = [
      disclaimer,
      marker,
      event.subtitle,
      event.description.trim(),
      `Nghệ sĩ trong dữ liệu này đều là nhân vật hư cấu: ${(event.artists ?? []).join(', ') || 'chưa công bố'}.`,
      `Thời lượng minh họa: ${event.durationMinutes} phút · Độ tuổi gợi ý: ${event.minAge}+ · Đơn vị tổ chức: ${event.organizer ?? 'giả lập'}.`,
      `Lịch diễn (giờ Việt Nam): ${performancesForEvent
        .map(
          (performance) =>
            `${formatDateTime(performance.startAt, dataset.timezone)} — ${Object.entries(
              performance.priceBySection,
            )
              .map(([category, price]) => `${category}: ${formatMoney(price)}`)
              .join(' · ')}`,
        )
        .join('; ')}.`,
      'Sơ đồ ghế và giá chỉ phục vụ kiểm thử. Ghế được tạo ở trạng thái trống; các lượt giữ/đặt trong file nguồn không được nạp.',
      'Mở bán chỉ trong môi trường thử nghiệm dùng cổng thanh toán mock. Không thanh toán thật, không có giá trị vào cửa.',
    ].filter(Boolean);
    const description = details.join('\n\n');
    requireValue(title.length <= 120, `Tên sự kiện ${event.id} quá dài.`);
    requireValue(
      location.length <= 200,
      `Địa điểm sự kiện ${event.id} quá dài.`,
    );
    requireValue(
      description.length <= 2000,
      `Mô tả sự kiện ${event.id} vượt giới hạn 2.000 ký tự.`,
    );

    eventPlans.set(event.id, {
      event,
      marker,
      legacyMarker,
      title,
      description,
      location,
      venue,
      performances: performancesForEvent,
    });
  }
  requireValue(
    [...performances.values()].every((performance) =>
      events.has(performance.eventId),
    ),
    'Có suất diễn tham chiếu sự kiện không tồn tại.',
  );

  return { events: eventPlans, seatMaps };
}

async function readDataset() {
  let dataset;
  try {
    dataset = JSON.parse(readFileSync(datasetPath, 'utf8'));
  } catch (error) {
    throw new Error(`Không đọc được ${datasetPath}: ${error.message}`);
  }
  return validateDataset(dataset);
}

function mapForApi(seatMap) {
  return {
    seats: seatMap.seats.map((seat) => ({
      row: seat.row,
      seatNumber: seat.number,
      category: seat.sectionId,
    })),
  };
}

async function login(origin, password) {
  const response = await fetch(`${origin}/api/auth/login`, {
    method: 'POST',
    headers: { origin, 'content-type': 'application/json' },
    body: JSON.stringify({
      email: 'design-organizer@example.invalid',
      password,
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    throw new Error(`Đăng nhập organizer thất bại (HTTP ${response.status}).`);
  }
  const cookie = response.headers.getSetCookie()[0]?.split(';', 1)[0];
  requireValue(cookie, 'Đăng nhập không trả session cookie.');
  return cookie;
}

function apiClient(origin, cookie) {
  return async function request(path, options = {}) {
    const headers = { cookie };
    if (options.body !== undefined)
      headers['content-type'] = 'application/json';
    if (options.origin) headers.origin = origin;
    const response = await fetch(`${origin}/api${path}`, {
      method: options.method ?? 'GET',
      headers,
      body:
        options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: AbortSignal.timeout(30000),
    });
    const text = await response.text();
    let result;
    try {
      result = text ? JSON.parse(text) : null;
    } catch {
      result = text;
    }
    if (!response.ok) {
      const detail =
        typeof result === 'string' ? result : JSON.stringify(result);
      throw new Error(
        `${options.method ?? 'GET'} ${path} thất bại (HTTP ${response.status}): ${detail}`,
      );
    }
    return result;
  };
}

async function runImport(plan, origin, password) {
  const cookie = await login(origin, password);
  const request = apiClient(origin, cookie);
  try {
    const currentUser = await request('/auth/me');
    requireValue(
      currentUser.roles?.includes('ORGANIZER'),
      'Tài khoản đăng nhập không có quyền ORGANIZER.',
    );
    const ownedEvents = await request('/events/mine');
    const matchesByMarker = new Map();
    const legacyMarkers = new Set();
    for (const event of ownedEvents) {
      for (const item of plan.events.values()) {
        if (
          event.description?.includes(item.marker) ||
          event.description?.includes(item.legacyMarker)
        ) {
          requireValue(
            !matchesByMarker.has(item.marker),
            `Database đã có nhiều sự kiện mang marker ${item.marker}.`,
          );
          requireValue(
            event.name === item.title && event.location === item.location,
            `Sự kiện ${item.marker} đã tồn tại nhưng thông tin cơ bản khác. Không tự ghi đè dữ liệu.`,
          );
          matchesByMarker.set(item.marker, event);
          if (event.description.includes(item.legacyMarker))
            legacyMarkers.add(item.marker);
        }
      }
    }
    for (const item of plan.events.values()) {
      if (
        !matchesByMarker.has(item.marker) &&
        ownedEvents.some((event) => event.name === item.title)
      ) {
        throw new Error(
          `Đã có sự kiện cùng tên "${item.title}" nhưng không có marker nhập liệu. Kiểm tra thủ công trước khi chạy lại.`,
        );
      }
    }

    const validatedMaps = new Set();
    for (const performance of [...plan.events.values()].flatMap(
      (item) => item.performances,
    )) {
      if (validatedMaps.has(performance.seatMapId)) continue;
      const seatMap = plan.seatMaps.get(performance.seatMapId);
      const result = await request('/showtimes/validate-map', {
        method: 'POST',
        body: mapForApi(seatMap),
      });
      requireValue(
        Array.isArray(result.errors) && result.errors.length === 0,
        `API từ chối sơ đồ ${seatMap.id}: ${JSON.stringify(result.errors)}`,
      );
      validatedMaps.add(seatMap.id);
    }

    let updatedDescriptions = 0;
    for (const item of plan.events.values()) {
      if (!legacyMarkers.has(item.marker)) continue;
      const event = matchesByMarker.get(item.marker);
      const description = event.description.replace(
        item.legacyMarker,
        item.marker,
      );
      await request(`/events/${event.id}`, {
        method: 'PATCH',
        body: {
          name: event.name,
          description,
          location: event.location,
        },
        origin: true,
      });
      event.description = description;
      updatedDescriptions += 1;
    }

    let createdEvents = 0;
    let createdShowtimes = 0;
    let activatedShowtimes = 0;
    for (const item of plan.events.values()) {
      let event = matchesByMarker.get(item.marker);
      if (!event) {
        event = await request('/events', {
          method: 'POST',
          body: {
            name: item.title,
            description: item.description,
            location: item.location,
          },
          origin: true,
        });
        createdEvents += 1;
      }

      for (const performance of item.performances) {
        const startAt = new Date(performance.startAt).toISOString();
        let showtime = event.showtimes?.find(
          (candidate) =>
            new Date(candidate.startTime).getTime() ===
            new Date(startAt).getTime(),
        );
        const createdThisRun = !showtime;
        if (!showtime) {
          showtime = await request(`/events/${event.id}/showtimes`, {
            method: 'POST',
            body: { startTime: performance.startAt },
            origin: true,
          });
          createdShowtimes += 1;
          event.showtimes ??= [];
          event.showtimes.push(showtime);
        }

        if (showtime.status === 'CLOSED') {
          console.log(
            `Giữ nguyên suất đã đóng: ${item.title} · ${formatDateTime(startAt, 'Asia/Ho_Chi_Minh')}`,
          );
          continue;
        }
        if (showtime.status === 'ON_SALE') continue;

        const seatMap = plan.seatMaps.get(performance.seatMapId);
        let managed;
        if (!createdThisRun) {
          managed = await request(`/showtimes/${showtime.id}/manage`);
          const expectedSeats = mapForApi(seatMap).seats;
          const existingSeatCount = managed._count?.seats ?? 0;
          if (existingSeatCount > 0) {
            const currentSeats = await request(
              `/showtimes/${showtime.id}/manage/seats`,
            );
            const seatKey = (seat) =>
              JSON.stringify([seat.row, seat.seatNumber, seat.category]);
            const expected = expectedSeats.map(seatKey).sort();
            const current = currentSeats.map(seatKey).sort();
            requireValue(
              JSON.stringify(current) === JSON.stringify(expected),
              `Sơ đồ của suất ${performance.id} đã được thay đổi. Không tự ghi đè.`,
            );
          } else {
            requireValue(
              managed.categories.length === 0,
              `Suất ${performance.id} có hạng ghế nhưng không có ghế. Không tự ghi đè.`,
            );
            await request(`/showtimes/${showtime.id}/seat-map`, {
              method: 'POST',
              body: { seats: expectedSeats },
              origin: true,
            });
            managed = await request(`/showtimes/${showtime.id}/manage`);
          }
        } else {
          await request(`/showtimes/${showtime.id}/seat-map`, {
            method: 'POST',
            body: mapForApi(seatMap),
            origin: true,
          });
          managed = await request(`/showtimes/${showtime.id}/manage`);
        }
        const prices = managed.categories.map((category) => {
          const price = performance.priceBySection[category.name];
          requireValue(
            Number.isSafeInteger(price),
            `Không có giá cho hạng ${category.name} ở ${performance.id}.`,
          );
          return { id: category.id, price };
        });
        requireValue(
          prices.length === Object.keys(performance.priceBySection).length,
          `Các hạng giá không khớp sơ đồ của ${performance.id}.`,
        );
        const hasConfiguredPrices = managed.categories.some(
          (category) => category.price !== null,
        );
        if (hasConfiguredPrices) {
          requireValue(
            managed.categories.every(
              (category) =>
                category.price === performance.priceBySection[category.name],
            ),
            `Giá của suất ${performance.id} đã được thay đổi. Không tự ghi đè.`,
          );
        } else {
          await request(`/showtimes/${showtime.id}/prices`, {
            method: 'PATCH',
            body: { prices },
            origin: true,
          });
        }
        await request(`/showtimes/${showtime.id}/status`, {
          method: 'PATCH',
          body: { status: 'ON_SALE' },
          origin: true,
        });
        activatedShowtimes += 1;
        console.log(
          `Đã mở suất demo: ${item.title} · ${formatDateTime(startAt, 'Asia/Ho_Chi_Minh')} · ${seatMap.seats.length} ghế`,
        );
      }
    }
    console.log(
      `Hoàn tất: ${createdEvents} sự kiện mới, ${createdShowtimes} suất mới, ${activatedShowtimes} suất demo được mở bán, ${updatedDescriptions} mô tả được chuẩn hóa marker.`,
    );
  } finally {
    await request('/auth/logout', { method: 'POST', body: {}, origin: true });
  }
}

async function main() {
  const args = process.argv.slice(2);
  requireValue(
    args.length <= 1 && args.every((arg) => ['--dry-run', '--apply'].includes(arg)),
    'Dùng --dry-run (mặc định) hoặc --apply.',
  );
  requireValue(
    args.length === 0 || args[0] !== '--dry-run' || args.length === 1,
    'Chỉ dùng một chế độ chạy.',
  );
  const apply = args[0] === '--apply';
  const plan = await readDataset();
  const performances = [...plan.events.values()].flatMap(
    (item) => item.performances,
  );
  const seatCount = performances.reduce(
    (sum, performance) =>
      sum + plan.seatMaps.get(performance.seatMapId).seats.length,
    0,
  );
  console.log(
    `Dataset hư cấu đã kiểm tra: ${plan.events.size} sự kiện, ${performances.length} suất, ${seatCount} ghế demo.`,
  );
  console.log(
    'Tên/địa điểm được gắn nhãn MÔ PHỎNG; không tạo giao dịch thật. Lượt giữ/đặt trong inventory nguồn được bỏ qua.',
  );
  if (!apply) {
    console.log('Dry run: chưa đăng nhập và chưa thay đổi database.');
    return;
  }
  const { origin, password } = readLocalConfiguration();
  await runImport(plan, origin, password);
}

main().catch((error) => {
  console.error(`Nhập sự kiện mô phỏng thất bại: ${error.message}`);
  process.exitCode = 1;
});
