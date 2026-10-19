import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { PrismaClient } = require('../apps/api/node_modules/@prisma/client');
const { PrismaPg } = require('../apps/api/node_modules/@prisma/adapter-pg');
const Redis = require('../apps/api/node_modules/ioredis');

const root = resolve(import.meta.dirname, '..');
const jsonPath = process.env.EVENT_DATA_PATH || resolve(
  root,
  '..',
  'su_kien_nha_hat_chuyen_nghiep_chi_tiet_2026.json',
);

const databaseUrl =
  process.env.DATABASE_URL ||
  'postgresql://postgres:postgres@localhost:5432/ticketing_dev?schema=public';

const adapter = new PrismaPg({ connectionString: databaseUrl });
const prisma = new PrismaClient({ adapter });

const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: Number(process.env.REDIS_PORT) || 6379,
  lazyConnect: true,
});

// Image visual presets based on category and style
const imageMap = {
  sankhau_kich: {
    poster: '/images/events/trinh-poetry.jpg',
    mobile: '/images/events/trinh-poetry-mobile.jpg',
    banner: '/images/events/trinh-poetry.jpg',
  },
  sankhau_cheo: {
    poster: '/images/events/mustard-blossom.jpg',
    mobile: '/images/events/mustard-blossom-mobile.jpg',
    banner: '/images/events/mustard-blossom.jpg',
  },
  am_nhac_giao_huong: {
    poster: '/images/events/autumn-symphony.jpg',
    mobile: '/images/events/autumn-symphony-mobile.jpg',
    banner: '/images/events/autumn-symphony-banner.jpg',
  },
  am_nhac_thinh_phong: {
    poster: '/images/events/starlight-piano.jpg',
    mobile: '/images/events/starlight-piano-mobile.jpg',
    banner: '/images/events/starlight-piano.jpg',
  },
  am_nhac_hop_xuong: {
    poster: '/images/events/autumn-choir.jpg',
    mobile: '/images/events/autumn-choir-mobile.jpg',
    banner: '/images/events/autumn-choir.jpg',
  },
  am_nhac_dac_biet: {
    poster: '/images/events/indie-night.jpg',
    mobile: '/images/events/indie-night-mobile.jpg',
    banner: '/images/events/indie-night.jpg',
  },
};

function selectImages(category, subcategory) {
  if (category === 'sankhau') {
    if (subcategory === 'cheo') return imageMap.sankhau_cheo;
    return imageMap.sankhau_kich;
  }
  if (subcategory === 'thinh_phong' || subcategory === 'thinh_phong_va_giao_huong') {
    return imageMap.am_nhac_thinh_phong;
  }
  if (subcategory === 'hoa_nhac_dac_biet') {
    return imageMap.am_nhac_dac_biet;
  }
  return imageMap.am_nhac_giao_huong;
}

function getCategoryLabel(category, subcategory) {
  const map = {
    kich_noi: 'Kịch Nói',
    hai_kich_dan_gian: 'Hài Kịch Châm Biếm',
    chuyen_the_van_hoc: 'Kịch Văn Học',
    kich_lich_su: 'Chính Kịch Lịch Sử',
    bi_kich_kinh_dien: 'Bi Kịch Kinh Điển',
    kich_triet_ly: 'Kịch Triết Lý',
    kich_tam_ly: 'Kịch Tâm Lý Xã Hội',
    cheo: 'Chèo Cổ Truyền',
    giao_huong: 'Đại Hòa Nhạc Giao Hưởng',
    thinh_phong: 'Thính Phòng Cổ Điển',
    thinh_phong_va_giao_huong: 'Thính Phòng & Giao Hưởng',
    hoa_nhac_dac_biet: 'Hòa Nhạc Đặc Biệt',
  };
  return map[subcategory] || (category === 'sankhau' ? 'Sân Khấu Kịch Nghệ' : 'Âm Nhạc Cổ Điển');
}

function cleanTitle(title, subcategory) {
  // Enhance titles to make them sound like grand real-world productions
  let clean = title.trim();
  if (clean.startsWith('vnso_') || clean.startsWith('Hòa nhạc đặt vé trước số')) {
    const num = clean.replace(/[^0-9]/g, '');
    return `Hòa Nhạc Giao Hưởng VNSO Subscription Concert Số ${num}`;
  }
  return clean;
}

function buildCompellingDescription(ev, venue, datasetDisclaimer) {
  const sections = [];

  if (ev.fullDescription || ev.description) {
    sections.push((ev.fullDescription || ev.description).trim());
  }

  const highlights = (ev.editorialContent?.highlightCards || [])
    .filter((item) => item.title && item.description)
    .map((item) => `• ${item.title}: ${item.description}`);
  if (highlights.length) sections.push(`【ĐIỂM NHẤN】\n${highlights.join('\n')}`);

  const credits = (ev.creativeTeam || []).map(
    (member) => `• ${member.position}: ${member.name}`,
  );
  if (credits.length > 0) {
    sections.push(`【THÀNH PHẦN SÁNG TẠO】\n${credits.join('\n')}`);
  }

  const artists = (ev.artists || []).map((artist) => {
    const charPart = artist.character ? ` (vai ${artist.character})` : '';
    const rolePart = artist.role ? ` - ${artist.role}` : '';
    return `• Nghệ sĩ: ${artist.name}${charPart}${rolePart}`;
  });
  if (artists.length > 0) {
    sections.push(`【DÀN NGHỆ SĨ ĐÃ ĐƯỢC GHI NHẬN】\n${artists.join('\n')}`);
  }

  if (ev.editorialContent?.artisticIdentity) {
    sections.push(`【GÓC NHÌN NGHỆ THUẬT】\n${ev.editorialContent.artisticIdentity}`);
  }

  const audience = ev.audienceGuide || {};
  const audienceLines = [audience.whoShouldAttend, audience.languageNote].filter(Boolean);
  if (audienceLines.length) {
    sections.push(`【GỢI Ý KHÁN GIẢ】\n${audienceLines.map((line) => `• ${line}`).join('\n')}`);
  }

  const practical = ev.practicalInfo || {};
  const practicalLines = [
    practical.showDurationText,
    practical.breaks,
    practical.ageRestriction,
    practical.dressCode,
  ].filter(Boolean);
  if (practicalLines.length) {
    sections.push(`【THÔNG TIN THAM DỰ】\n${practicalLines.map((line) => `• ${line}`).join('\n')}`);
  }

  const faq = (ev.faq || [])
    .filter((item) => item.question && item.answer)
    .map((item) => `• ${item.question}: ${item.answer}`);
  if (faq.length) sections.push(`【CÂU HỎI THƯỜNG GẶP】\n${faq.join('\n')}`);

  const sources = [...new Set([
    ev.officialEventPage,
    ...(ev.dataProvenance?.sourceUrls || []),
  ].filter((url) => typeof url === 'string' && url.startsWith('https://')))].slice(0, 6);
  if (sources.length) {
    sections.push(`【NGUỒN THAM KHẢO】\n${sources.map((url) => `• ${url}`).join('\n')}`);
  }

  sections.push(
    `【ĐỊA ĐIỂM THAM KHẢO】\n` +
      `• Tư liệu bản dựng nhắc đến ${venue.name} — ${venue.address}, ${venue.city}. ` +
      `Địa điểm của suất diễn cụ thể cần được đơn vị tổ chức xác nhận.`,
  );
  sections.push(
    `【DỮ LIỆU MÔ PHỎNG】\n[MÔ PHỎNG] Suất diễn, giá vé và sơ đồ ghế chỉ phục vụ trải nghiệm thử; không phải lịch mở bán hoặc tồn ghế thực tế.\n${datasetDisclaimer}`,
  );

  return sections.join('\n\n');
}

async function main() {
  console.log('🚀 Bắt đầu nạp dữ liệu sự kiện văn hóa nghệ thuật thực tế...');

  const rawJson = readFileSync(jsonPath, 'utf8');
  const dataset = JSON.parse(rawJson);
  if (
    dataset.schemaVersion !== '2.0.0' ||
    dataset.importGuide?.environment !== 'development' ||
    dataset.importGuide?.productionImportAllowed !== false ||
    !Array.isArray(dataset.demoPerformances)
  ) {
    throw new Error('Tệp dữ liệu phải là catalog nhà hát phiên bản 2.0.0 có demoPerformances.');
  }
  const databaseHost = new URL(databaseUrl).hostname;
  if (!['localhost', '127.0.0.1', '::1'].includes(databaseHost)) {
    throw new Error('Catalog có giá và lịch mô phỏng chỉ được nhập vào PostgreSQL local.');
  }

  // 1. Identify Organizer account
  const organizer = await prisma.user.findFirst({
    where: {
      email: { in: ['design-organizer@example.invalid', 'organizer@demo.invalid'] },
    },
    orderBy: { createdAt: 'asc' },
  });

  if (!organizer) {
    throw new Error('Không tìm thấy tài khoản người tổ chức trong database.');
  }
  console.log(`👤 Sử dụng tài khoản người tổ chức: ${organizer.email} (${organizer.id})`);
  const demoOrganizers = await prisma.user.findMany({
    where: {
      email: { in: ['design-organizer@example.invalid', 'organizer@demo.invalid'] },
    },
    select: { id: true },
  });
  const demoOrganizerIds = demoOrganizers.map((user) => user.id);

  // 2. Lookup existing venues and seatmaps from the JSON
  const venueMap = new Map(dataset.venues.map((v) => [v.id, v]));
  const seatMapDefMap = new Map(dataset.seatMaps.map((sm) => [sm.id, sm]));

  console.log(`\n🎭 Cập nhật ${dataset.events.length} hồ sơ sự kiện trong catalog...`);

  const demosByEvent = new Map();
  for (const demo of dataset.demoPerformances) {
    const performances = demosByEvent.get(demo.eventId) || [];
    performances.push(demo);
    demosByEvent.set(demo.eventId, performances);
  }

  let eventIndex = 0;
  for (const rawEvent of dataset.events) {
    const performances = demosByEvent.get(rawEvent.id) || [];
    const venue = venueMap.get(performances[0]?.venueId || rawEvent.defaultVenueId) || dataset.venues[0];
    const categoryLabel = getCategoryLabel(rawEvent.category, rawEvent.subcategory);
    const title = cleanTitle(rawEvent.title, rawEvent.subcategory);
    const description = buildCompellingDescription(rawEvent, venue, dataset.disclaimer);
    const location = `${venue.name} — ${venue.address}`;
    const images = selectImages(rawEvent.category, rawEvent.subcategory);

    const eventData = {
      description,
      posterPath: images.poster,
      mobilePosterPath: images.mobile,
      bannerPath: images.banner,
      categoryLabel,
    };
    const existingEvent = await prisma.event.findFirst({
      where: { name: title, organizerId: { in: demoOrganizerIds } },
      orderBy: { createdAt: 'asc' },
      select: { id: true, organizerId: true },
    });
    const event = existingEvent
      ? await prisma.event.update({ where: { id: existingEvent.id }, data: eventData })
      : await prisma.event.create({
          data: {
            ...eventData,
            name: title,
            location,
            status: 'PUBLISHED',
            organizerId: organizer.id,
          },
        });

    console.log(`✅ [${eventIndex + 1}/${dataset.events.length}] Đã ${existingEvent ? 'cập nhật' : 'tạo'}: "${title}" (${categoryLabel})`);

    for (const performance of performances) {
      const seatMapDef = seatMapDefMap.get(performance.seatMapId);
      if (!seatMapDef) {
        console.log(`    ↳ Bỏ qua suất demo không có sơ đồ ghế: ${performance.id}`);
        continue;
      }
      const priceTable = Object.fromEntries(
        performance.priceTiers.map((tier) => [tier.sectionId, tier.priceVND]),
      );
      const showDate = new Date(performance.startAt);
      if (Number.isNaN(showDate.getTime()) || performance.isPubliclyBookable !== false) {
        throw new Error(`Suất demo không hợp lệ hoặc không được đánh dấu không thể đặt: ${performance.id}`);
      }
      if (performance.bookingEnabled !== false || performance.publicVisibility !== 'development_only') {
        throw new Error(`Suất demo không được cấu hình riêng cho development: ${performance.id}`);
      }
      const existingPerformance = await prisma.showtime.findFirst({
        where: { eventId: event.id, startTime: showDate },
        select: { id: true },
      });
      if (existingPerformance) {
        console.log(`    ↳ Giữ nguyên suất hiện có: ${performance.startAt}`);
        continue;
      }

      const showtime = await prisma.showtime.create({
        data: {
          eventId: event.id,
          startTime: showDate,
          status: 'ON_SALE',
          structureLocked: true,
          seatMapId: performance.seatMapId,
          maxTicketsPerUser: 4,
        },
      });

      // Group seats in this map by section
      const categoriesInMap = [...new Set(seatMapDef.seats.map((s) => s.sectionId || s.category))];

      // Create SeatCategories
      const categoryIdMap = new Map();
      for (const catName of categoriesInMap) {
        const price = priceTable[catName] || 450000;
        const seatCategory = await prisma.seatCategory.create({
          data: {
            showtimeId: showtime.id,
            name: catName,
            price,
          },
        });
        categoryIdMap.set(catName, seatCategory.id);
      }

      // Create Seats
      const seatRows = seatMapDef.seats.map((seat) => {
        const catName = seat.sectionId || seat.category;
        return {
          id: randomUUID(),
          showtimeId: showtime.id,
          categoryId: categoryIdMap.get(catName),
          row: seat.row,
          seatNumber: seat.seatNumber,
          isSold: (performance.seatInventory?.bookedSeatIds || []).includes(seat.id),
        };
      });

      await prisma.seat.createMany({
        data: seatRows,
      });

      console.log(
        `    ↳ Suất diễn: ${showDate.toLocaleString('vi-VN')} | ${seatRows.length} ghế | ${categoriesInMap.length} hạng vé | Trạng thái: ON_SALE`,
      );
    }

    eventIndex++;
  }

  // Invalidate API catalog cache
  await prisma.catalogRevision.upsert({
    where: { id: 1 },
    update: { version: { increment: 1 } },
    create: { id: 1, version: 1 },
  });

  try {
    await redis.connect();
    const keys = await redis.keys('catalog:*');
    if (keys.length > 0) {
      await redis.del(...keys);
      console.log(`🔄 Đã xóa ${keys.length} cache keys trong Redis.`);
    }
    await redis.quit();
  } catch (err) {
    console.log('ℹ️ Redis cache flush bypass hoặc không có keys.');
  }

  console.log('\n🎉 Đã nhập hồ sơ sự kiện và các suất mô phỏng có trong catalog.');
  console.log('ℹ️ Lịch, giá và sơ đồ ghế được gắn nhãn demo; không đại diện cho giao dịch thực.');
}

main()
  .catch((e) => {
    console.error('❌ Lỗi khi nạp dữ liệu:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
