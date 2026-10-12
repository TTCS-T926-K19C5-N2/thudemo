'use client';

import { useEffect, useState } from 'react';
import { fetchAssignedShowtimes, type AssignedShowtime } from './scanner-api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  CalendarDays,
  MapPin,
  Scan,
  Ticket,
  RotateCw,
  CircleAlert,
} from '@/components/ui/material-icon';

interface ScannerShowtimeSelectorProps {
  onSelectShowtime: (showtime: AssignedShowtime) => void;
}

export function ScannerShowtimeSelector({
  onSelectShowtime,
}: ScannerShowtimeSelectorProps) {
  const [showtimes, setShowtimes] = useState<AssignedShowtime[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const data = await fetchAssignedShowtimes();
        if (!cancelled) {
          setShowtimes(data);
          setLoading(false);
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : 'Không thể tải danh sách suất diễn được phân công.',
          );
          setLoading(false);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleManualRefresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAssignedShowtimes();
      setShowtimes(data);
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : 'Không thể tải danh sách suất diễn được phân công.',
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto p-4 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Scan className="text-primary text-2xl" />
            Máy quét vé — Chọn suất diễn (S-29)
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Chọn một suất diễn được phân công để tải trước danh sách vé và bắt đầu soát vé.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleManualRefresh}
          disabled={loading}
          className="self-start sm:self-auto gap-2"
        >
          <RotateCw className={loading ? 'animate-spin' : ''} />
          Làm mới
        </Button>
      </div>

      {error && (
        <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive flex items-center gap-3">
          <CircleAlert className="text-xl shrink-0" />
          <div className="flex-1 text-sm">{error}</div>
          <Button variant="outline" size="sm" onClick={handleManualRefresh}>
            Thử lại
          </Button>
        </div>
      )}

      {loading ? (
        <div className="py-12 flex flex-col items-center justify-center space-y-3 text-muted-foreground">
          <RotateCw className="animate-spin text-3xl text-primary" />
          <p className="text-sm">Đang tải danh sách suất diễn được phân công…</p>
        </div>
      ) : showtimes.length === 0 ? (
        <div className="py-16 text-center border-2 border-dashed rounded-xl p-8 bg-muted/30">
          <Ticket className="text-4xl text-muted-foreground/60 mx-auto mb-3" />
          <h3 className="font-semibold text-lg">Chưa có suất diễn nào</h3>
          <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
            Tài khoản nhân viên của bạn hiện chưa được phân công suất diễn nào.
            Vui lòng liên hệ ban tổ chức hoặc quản trị viên để được cấp quyền.
          </p>
          <Button className="mt-4" variant="outline" onClick={handleManualRefresh}>
            Kiểm tra lại
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {showtimes.map((st) => (
            <div
              key={st.id}
              className="border rounded-xl p-5 hover:border-primary/50 transition-colors shadow-sm bg-card flex flex-col justify-between gap-4"
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold text-lg line-clamp-2">
                    {st.eventName}
                  </h3>
                  <Badge variant={st.status === 'ON_SALE' ? 'default' : 'secondary'}>
                    {st.status === 'ON_SALE' ? 'Đang mở' : st.status}
                  </Badge>
                </div>

                <div className="space-y-1.5 text-sm text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <CalendarDays className="text-base text-primary/70 shrink-0" />
                    <span>
                      {new Date(st.startTime).toLocaleString('vi-VN', {
                        timeZone: 'Asia/Ho_Chi_Minh',
                        dateStyle: 'full',
                        timeStyle: 'short',
                      })}
                    </span>
                  </div>
                  {st.location && (
                    <div className="flex items-center gap-2">
                      <MapPin className="text-base text-primary/70 shrink-0" />
                      <span className="line-clamp-1">{st.location}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <Ticket className="text-base text-primary/70 shrink-0" />
                    <span>
                      Tổng vé: <strong className="text-foreground">{st.totalTickets}</strong>{' '}
                      (Đã soát: {st.checkedInTickets})
                    </span>
                  </div>
                </div>
              </div>

              <Button
                className="w-full mt-2 gap-2"
                onClick={() => onSelectShowtime(st)}
              >
                <Scan />
                Vào máy quét suất này
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
