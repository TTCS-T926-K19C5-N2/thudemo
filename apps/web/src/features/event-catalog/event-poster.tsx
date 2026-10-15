import Image from "next/image";
import { ImageIcon } from "@/components/ui/material-icon";
export function EventPoster({
  path,
  name,
  className,
  mobilePath,
  // Portrait object-fit crops need enough source height, not just box width.
  sizes = "(max-width:600px) 180px, 240px",
}: {
  path: string | null;
  name: string;
  className?: string;
  mobilePath?: string | null;
  sizes?: string;
}) {
  return (
    <div className={className}>
      {path ? (
        <>
          <Image
            src={path}
            alt={name}
            fill
            sizes={sizes}
            className={mobilePath ? "poster-desktop" : undefined}
          />
          {mobilePath && (
            <Image
              src={mobilePath}
              alt={name}
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
