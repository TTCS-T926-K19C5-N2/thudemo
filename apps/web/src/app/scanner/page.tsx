'use client';

import { useEffect, useState } from 'react';
import { ScannerShowtimeSelector } from '@/features/scanner/scanner-showtime-selector';
import { ScannerTicketsView } from '@/features/scanner/scanner-tickets-view';
import type { AssignedShowtime } from '@/features/scanner/scanner-api';
import { PublicLayout } from '@/components/layout/product-layout';
import { CurrentUser, loadCurrentUser } from '@/lib/api';

export default function ScannerPage() {
  const [selectedShowtime, setSelectedShowtime] = useState<AssignedShowtime | null>(null);
  const [user, setUser] = useState<CurrentUser | null>(null);

  useEffect(() => {
    let mounted = true;
    void loadCurrentUser().then((u) => {
      if (mounted) setUser(u);
    });
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <PublicLayout signedIn={!!user}>
      <div className="operations-page scanner-page">
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
