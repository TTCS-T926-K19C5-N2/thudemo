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
  const localMockBooking =
    process.env.PAYMENT_GATEWAY?.toLowerCase() === "mock" &&
    /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?$/.test(process.env.WEB_ORIGIN ?? "");
  return (
    <html lang="vi" className="h-full antialiased">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400&family=Playfair+Display:ital,wght@0,500;0,600;0,700;0,800;1,500;1,600&family=Plus+Jakarta+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-full flex flex-col bg-background text-foreground">
        {localMockBooking && (
          <aside aria-label="Môi trường đặt vé thử" className="border-b border-border bg-secondary px-4 py-2 text-center text-xs text-secondary-foreground">
            Đặt vé thử trên localhost · Thanh toán giả lập, không thu tiền thật.
          </aside>
        )}
        {children}
      </body>
    </html>
  );
}
