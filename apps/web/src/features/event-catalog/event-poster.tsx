import Image from "next/image";
import { ImageIcon } from "@/components/ui/material-icon";

const referencePosters = new Map<string, string>([
  ["BENH SI", "/images/events/tham-khao/benh_si.jpg"],
  ["DEM TRANG TRONG NGO", "/images/events/tham-khao/dem_trang.jpg"],
  ["HAMLET", "/images/events/tham-khao/hamlet.jpg"],
  [
    "HON TRUONG BA, DA HANG THIT",
    "/images/events/tham-khao/hon_truong_ba_da_hang_thịt.jpg",
  ],
  ["HOA NHAC TOYOTA 2026", "/images/events/tham-khao/hoa_nhac_toyota.jpg"],
  ["IN GRATITUDE – TRI AN", "/images/events/tham-khao/in_gratitude.jpg"],
  ["KIEU", "/images/events/tham-khao/kieu.jpg"],
  ["KY UC DONG THUONG", "/images/events/tham-khao/ky_uc_dong_thuong.jpg"],
  ["NGHEU, SO, OC, HEN", "/images/events/tham-khao/Ngheu_so_oc_hen.jpg"],
  ["NGUOI TOT NHA SO 5", "/images/events/tham-khao/nguoi_tot_nha_so_5.jpg"],
  ["NGUOI TRONG COI NHO", "/images/events/tham-khao/nguoi_trong_coi_nho.jpg"],
  ["THIEN MENH", "/images/events/tham-khao/thien_menh.png"],
  [
    "TIENG VI CAM TRONG CAN NHA CO: GIAI DIEU MUA HA",
    "/images/events/tham-khao/tieng_vi_cam_trong_can_nha_co.jpg",
  ],
  [
    "TIENG VONG TRUYEN THONG: TU BOHEMIA DEN TAY BAN NHA",
    "/images/events/tham-khao/tieng_vong_truyen_thong.jpg",
  ],
  [
    "VNSO SUBSCRIPTION CONCERT",
    "/images/events/tham-khao/subscriptionVNSOban_giao_huong_VNSO_subscription_concert.jpg",
  ],
]);

function normalizeEventName(name: string) {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, "d")
    .toLocaleUpperCase("vi-VN");
}

function posterForEvent(name: string) {
  const normalizedName = normalizeEventName(name);
  const exactMatch = referencePosters.get(normalizedName);
  if (exactMatch) return exactMatch;
  if (normalizedName.startsWith("HOA NHAC GIAO HUONG VNSO SUBSCRIPTION CONCERT"))
    return referencePosters.get("VNSO SUBSCRIPTION CONCERT") ?? null;
  return null;
}

export function EventPoster({
  path,
  name,
  className,
  mobilePath,
  decorative = false,
  // Portrait object-fit crops need enough source height, not just box width.
  sizes = "(max-width:600px) 180px, 240px",
}: {
  path: string | null;
  name: string;
  className?: string;
  mobilePath?: string | null;
  decorative?: boolean;
  sizes?: string;
}) {
  const referencePath = posterForEvent(name);
  const imagePath = referencePath ?? path;
  const imageMobilePath = referencePath ? null : mobilePath;
  return (
    <div className={className}>
      {imagePath ? (
        <>
          <Image
            src={imagePath}
            alt={decorative ? "" : name}
            fill
            sizes={sizes}
            className={imageMobilePath ? "poster-desktop" : undefined}
          />
          {imageMobilePath && (
            <Image
              src={imageMobilePath}
              alt={decorative ? "" : name}
              fill
              sizes={sizes}
              className="poster-mobile"
            />
          )}
        </>
      ) : (
        <div className="poster-placeholder">
          <ImageIcon />
          <span>Chưa có ảnh</span>
        </div>
      )}
    </div>
  );
}
