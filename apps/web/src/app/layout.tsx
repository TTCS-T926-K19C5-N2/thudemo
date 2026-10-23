import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import "./product.css";
import "./theater-theme.css";

export const metadata: Metadata = {
  title: "Vé Sự Kiện — Đặt vé và quản lý sự kiện",
  description: "Khám phá sự kiện, chọn ghế và quản lý suất diễn.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  const demoProfileNotice =
    process.env.NEXT_PUBLIC_DEMO_PROFILE_NOTICE === "1";
  const demoProfileLabel = process.env.NEXT_PUBLIC_DEMO_PROFILE_LABEL;
  const localMockBooking =
    process.env.PAYMENT_GATEWAY?.toLowerCase() === "mock" &&
    /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?$/.test(process.env.WEB_ORIGIN ?? "");
  return (
    <html lang="vi" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-background text-foreground">
        {localMockBooking && (
          <aside aria-label="Môi trường đặt vé thử" className="border-b border-border bg-secondary px-4 py-2 text-center text-xs text-secondary-foreground">
            {demoProfileNotice
              ? `BẢN DEMO ${demoProfileLabel ? `· ${demoProfileLabel}` : ""} · Sự kiện, lịch và giá dùng để trình diễn; đặt vé và thanh toán chỉ chạy trong môi trường local, không thu tiền thật.`
              : "Đặt vé thử trên localhost · Thanh toán giả lập, không thu tiền thật."}
          </aside>
        )}
        {children}
      </body>
    </html>
  );
}
