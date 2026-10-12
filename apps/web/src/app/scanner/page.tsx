'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ScannerShowtimeSelector } from '@/features/scanner/scanner-showtime-selector';
import { ScannerTicketsView } from '@/features/scanner/scanner-tickets-view';
import type { AssignedShowtime } from '@/features/scanner/scanner-api';
import { PublicLayout } from '@/components/layout/product-layout';
import { CurrentUser, loadCurrentUser } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { LogIn, CircleAlert } from '@/components/ui/material-icon';

export default function ScannerPage() {
  const [selectedShowtime, setSelectedShowtime] = useState<AssignedShowtime | null>(null);
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    loadCurrentUser()
      .then((u) => {
        if (!mounted) return;
        setUser(u);
        setAuthLoading(false);
      })
      .catch(() => {
        if (!mounted) return;
        setUser(null);
        setAuthLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const hasScannerRole =
    user?.roles?.some((r) => ['STAFF', 'ORGANIZER', 'ADMIN'].includes(r)) ?? false;

  return (
    <PublicLayout signedIn={!!user}>
      <div className="operations-page scanner-page">
        {authLoading ? (
          <div className="operations-panel" role="status" aria-label="Đang kiểm tra đăng nhập">
            <Skeleton className="h-48 w-full" />
          </div>
        ) : !user ? (
          <div className="operations-panel operations-empty">
            <LogIn size={48} />
            <h2>Yêu cầu đăng nhập</h2>
            <p>
              Bạn cần đăng nhập bằng tài khoản nhân viên soát vé để tải trước danh sách vé và truy cập máy quét.
            </p>
            <div className="operations-actions" style={{ justifyContent: 'center', marginTop: '16px' }}>
              <Button asChild size="lg">
                <Link href="/login?returnTo=/scanner">
                  <LogIn />
                  Đăng nhập tài khoản nhân viên
                </Link>
              </Button>
            </div>
          </div>
        ) : !hasScannerRole ? (
          <div className="operations-panel operations-empty">
            <CircleAlert size={48} />
            <h2>Chưa có quyền soát vé</h2>
            <p>
              Tài khoản hiện tại ({user.email}) chưa được cấp quyền nhân viên soát vé (STAFF/ORGANIZER).
              Vui lòng đăng nhập bằng tài khoản được cấp quyền (ví dụ: staff@demo.invalid).
            </p>
            <div className="operations-actions" style={{ justifyContent: 'center', marginTop: '16px' }}>
              <Button asChild size="lg">
                <Link href="/login?returnTo=/scanner">
                  Đổi tài khoản đăng nhập
                </Link>
              </Button>
            </div>
          </div>
        ) : selectedShowtime ? (
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
