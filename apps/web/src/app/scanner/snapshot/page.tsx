"use client";

import { useState } from "react";
import { ScannerShowtimeSelector } from "@/features/scanner/scanner-showtime-selector";
import { ScannerTicketsView } from "@/features/scanner/scanner-tickets-view";
import type { AssignedShowtime } from "@/features/scanner/scanner-api";
import { PublicLayout } from "@/components/layout/product-layout";

export default function ScannerPage() {
  const [selectedShowtime, setSelectedShowtime] =
    useState<AssignedShowtime | null>(null);

  return (
    <PublicLayout compact>
      <div className="min-h-[calc(100vh-80px)] py-6 px-3">
        {selectedShowtime ? (
          <ScannerTicketsView
            showtime={selectedShowtime}
            onChangeShowtime={() => setSelectedShowtime(null)}
          />
        ) : (
          <ScannerShowtimeSelector
            onSelectShowtime={(showtime) => setSelectedShowtime(showtime)}
          />
        )}
      </div>
    </PublicLayout>
  );
}
