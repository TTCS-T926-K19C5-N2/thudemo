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
  return (
    <html lang="vi" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-background text-foreground">
        {children}
      </body>
    </html>
  );
}
