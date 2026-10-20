import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { parseEnv } from 'node:util';

const root = resolve(import.meta.dirname, '..');
const envFile = resolve(root, '.env');
if (existsSync(envFile)) {
  const parsed = parseEnv(readFileSync(envFile, 'utf8'));
  for (const [k, v] of Object.entries(parsed)) {
    process.env[k] = process.env[k] || v;
  }
}

const require = createRequire(import.meta.url);
const { PrismaClient } = require('../apps/api/node_modules/@prisma/client');
const { PrismaPg } = require('../apps/api/node_modules/@prisma/adapter-pg');
const Redis = require('../apps/api/node_modules/ioredis');

const defaultJson = resolve(root, 'su_kien_nha_hat_40_su_kien_chi_tiet_2026.json');
const jsonPath = process.env.EVENT_DATA_PATH || defaultJson;

const databaseUrl =
  process.env.DATABASE_URL ||
  'postgresql://postgres:postgres@localhost:5432/ticket_db?schema=public';

const adapter = new PrismaPg({ connectionString: databaseUrl });
const prisma = new PrismaClient({ adapter });

const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: Number(process.env.REDIS_PORT) || 6379,
  lazyConnect: true,
});

// Accurate poster mapping based on images in images_tham_khao / public/images/events/tham-khao
const referencePosterMap = {
  kich_benh_si: '/images/events/tham-khao/benh_si.jpg',
  kich_nguoi_tot_nha_so_5: '/images/events/tham-khao/nguoi_tot_nha_so_5.jpg',
  kich_ngheu_so_oc_hen: '/images/events/tham-khao/Ngheu_so_oc_hen.jpg',
  kich_kieu: '/images/events/tham-khao/kieu.jpg',
  kich_dem_trang: '/images/events/tham-khao/dem_trang.jpg',
  kich_hamlet: '/images/events/tham-khao/hamlet.jpg',
  kich_hon_truong_ba: '/images/events/tham-khao/hon_truong_ba_da_hang_thịt.jpg',
  kich_nguoi_trong_coi_nho: '/images/events/tham-khao/nguoi_trong_coi_nho.jpg',
  cheo_thien_menh_bac_ninh: '/images/events/tham-khao/thien_menh.png',
  cheo_ky_uc_dong_thuong: '/images/events/tham-khao/ky_uc_dong_thuong.jpg',
  vnso_180: '/images/events/tham-khao/subscriptionVNSOban_giao_huong_VNSO_subscription_concert.jpg',
  vnso_184: '/images/events/tham-khao/subscriptionVNSOban_giao_huong_VNSO_subscription_concert.jpg',
  vnso_186: '/images/events/tham-khao/subscriptionVNSOban_giao_huong_VNSO_subscription_concert.jpg',
  vnso_188: '/images/events/tham-khao/subscriptionVNSOban_giao_huong_VNSO_subscription_concert.jpg',
  vnso_189: '/images/events/tham-khao/subscriptionVNSOban_giao_huong_VNSO_subscription_concert.jpg',
  vnso_metropole_mozart_125: '/images/events/autumn-symphony.jpg',
  hoa_nhac_toyota_2026: '/images/events/tham-khao/hoa_nhac_toyota.jpg',
  in_gratitude_2026: '/images/events/tham-khao/in_gratitude.jpg',
  helmantic_quartet_2026: '/images/events/tham-khao/tieng_vong_truyen_thong.jpg',
  tieng_vi_cam_giai_dieu_mua_ha: '/images/events/tham-khao/tieng_vi_cam_trong_can_nha_co.jpg',
  hanoi_concert_mua_he_2025: '/images/events/tham-khao/hoa_nhac_toyota.png',
  kich_nguoc_chieu_binh_an: '/images/events/tham-khao/nguoc_chieu_binh_an.jpg',
  kich_nhan_the: '/images/events/tham-khao/nhan_the.webp',
  kich_quan_thanh_tra: '/images/events/tham-khao/quan_thanh_tra.jpg',
};

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

function selectImages(rawEvent) {
  const specificPoster = referencePosterMap[rawEvent.id];
  let preset;
  if (rawEvent.category === 'sankhau') {
    preset = rawEvent.subcategory === 'cheo' ? imageMap.sankhau_cheo : imageMap.sankhau_kich;
  } else if (rawEvent.subcategory === 'thinh_phong' || rawEvent.subcategory === 'thinh_phong_va_giao_huong') {
    preset = imageMap.am_nhac_thinh_phong;
  } else if (rawEvent.subcategory === 'hoa_nhac_dac_biet') {
    preset = imageMap.am_nhac_dac_biet;
  } else {
    preset = imageMap.am_nhac_giao_huong;
  }

  return {
    poster: specificPoster || preset.poster,
    mobile: specificPoster || preset.mobile,
    banner: specificPoster || preset.banner,
  };
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

function cleanTitle(title) {
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
    `【ĐỊA ĐIỂM BIỂU DIỄN】\n` +
      `• ${venue.name} — ${venue.address}.`,
  );

  return sections.join('\n\n');
}

async function main() {
  console.log('🚀 Bắt đầu nạp nội dung sự kiện và lịch tham khảo...');

  if (!existsSync(jsonPath)) {
    throw new Error(`Không tìm thấy file dữ liệu tại: ${jsonPath}`);
  }

  const rawJson = readFileSync(jsonPath, 'utf8');
  const dataset = JSON.parse(rawJson);
  const demoPerformances = dataset.demoPerformances || [];
  const updateExistingEvents = process.env.EVENT_IMPORT_UPDATE_EXISTING === 'true';

  if (
    process.env.NODE_ENV === 'production' &&
    (dataset.importGuide?.productionImportAllowed === false || demoPerformances.length > 0)
  ) {
    throw new Error(
      'Từ chối nhập bộ dữ liệu có suất diễn demo vào production. Dữ liệu này chỉ dành cho development.',
    );
  }

  if (dataset.importGuide?.productionImportAllowed !== false && demoPerformances.length > 0) {
    throw new Error(
      'Bộ dữ liệu có suất demo nhưng thiếu khai báo productionImportAllowed=false; dừng nhập để tránh mở bán nhầm.',
    );
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

  // 2. Lookup existing venues and seatmaps
  const venueMap = new Map(dataset.venues.map((v) => [v.id, v]));
  const seatMapDefMap = new Map(dataset.seatMaps.map((sm) => [sm.id, sm]));

  console.log(`\n🎭 Nạp ${dataset.events.length} sự kiện đã tuyển chọn và liên kết poster...`);

  const demosByEvent = new Map();
  for (const demo of demoPerformances) {
    const performances = demosByEvent.get(demo.eventId) || [];
    performances.push(demo);
    demosByEvent.set(demo.eventId, performances);
  }

  let eventIndex = 0;
  for (const rawEvent of dataset.events) {
    const performances = demosByEvent.get(rawEvent.id) || [];
    const venue = venueMap.get(performances[0]?.venueId || rawEvent.defaultVenueId) || dataset.venues[0];
    const categoryLabel = getCategoryLabel(rawEvent.category, rawEvent.subcategory);
    const title = cleanTitle(rawEvent.title);
    const description = buildCompellingDescription(rawEvent, venue, dataset.disclaimer);
    const location = `${venue.name} — ${venue.address}`;
    const images = selectImages(rawEvent);

    const eventData = {
      description,
      posterPath: images.poster,
      mobilePosterPath: images.mobile,
      bannerPath: images.banner,
      categoryLabel,
      location,
      status: 'PUBLISHED',
      organizerId: organizer.id,
    };

    const existingEvent = await prisma.event.findFirst({
      where: { name: title },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });

    const eventId = existingEvent
      ? (updateExistingEvents
          ? (await prisma.event.update({ where: { id: existingEvent.id }, data: eventData })).id
          : existingEvent.id)
      : (await prisma.event.create({
          data: {
            ...eventData,
            name: title,
          },
        })).id;

    console.log(
      `✅ [${eventIndex + 1}/${dataset.events.length}] ${existingEvent ? (updateExistingEvents ? 'Cập nhật theo EVENT_IMPORT_UPDATE_EXISTING' : 'Giữ nguyên nội dung hiện có') : 'Tạo mới'}: "${title}" (${categoryLabel}) | Poster: ${images.poster}`,
    );

    for (const performance of performances) {
      if (performance.bookingEnabled !== false || performance.isRealEventSchedule !== false) {
        throw new Error(`Suất ${performance.id} không được xác nhận là dữ liệu demo không bán vé.`);
      }
      const seatMapDef = seatMapDefMap.get(performance.seatMapId);
      if (!seatMapDef) {
        console.log(`    ↳ Bỏ qua suất không có sơ đồ ghế: ${performance.id}`);
        continue;
      }

      const priceTable = Object.fromEntries(
        (performance.priceTiers || []).map((tier) => [tier.sectionId, tier.priceVND]),
      );
      const showDate = new Date(performance.startAt);

      const existingPerformance = await prisma.showtime.findFirst({
        where: { eventId, startTime: showDate },
        select: {
          id: true,
          isDemo: true,
        },
      });

      if (existingPerformance) {
        console.log(
          `    ↳ Giữ nguyên suất đã có (${existingPerformance.isDemo ? 'demo' : 'đã cấu hình'}): ${performance.startAt}`,
        );
        continue;
      }

      const showtime = await prisma.showtime.create({
        data: {
          eventId,
          startTime: showDate,
          status: 'DRAFT',
          isDemo: true,
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
          isSold: false,
        };
      });

      await prisma.seat.createMany({
        data: seatRows,
      });

      console.log(
        `    ↳ Tạo suất demo DRAFT: ${showDate.toLocaleString('vi-VN')} | ${seatRows.length} ghế | ${categoriesInMap.length} hạng vé | Không thể đặt vé`,
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

  console.log(`\n🎉 Đã xử lý ${dataset.events.length} sự kiện và ${demoPerformances.length} suất demo. Suất demo luôn ở trạng thái DRAFT và không được bán vé.`);
}

main()
  .catch((e) => {
    console.error('❌ Lỗi khi nạp dữ liệu:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
