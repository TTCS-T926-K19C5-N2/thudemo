'use client';

import { useEffect, useState } from 'react';
import { fetchAssignedShowtimes, type AssignedShowtime } from './scanner-api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
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
    <div className="scanner-selector-wrap">
      <div className="page-heading">
        <div>
          <h1>Máy quét vé · Chọn suất diễn (S-29)</h1>
          <p>
            Chọn suất diễn được phân công để tải trước danh sách vé và bắt đầu soát vé.
          </p>
        </div>
        <div className="operations-actions">
          <Button
            variant="outline"
            onClick={handleManualRefresh}
            disabled={loading}
          >
            <RotateCw className={loading ? 'animate-spin' : ''} />
            Làm mới
          </Button>
        </div>
      </div>

      {error && (
        <div className="operations-notice operations-error" role="alert">
          <CircleAlert />
          <p>{error}</p>
          <Button variant="outline" size="sm" onClick={handleManualRefresh}>
            Thử lại
          </Button>
        </div>
      )}

      {loading ? (
        <div className="operations-panel" role="status" aria-label="Đang tải danh sách suất diễn">
          <Skeleton className="h-48 w-full" />
        </div>
      ) : showtimes.length === 0 ? (
        <div className="operations-panel operations-empty">
          <Ticket size={48} />
          <h2>Chưa có suất diễn nào được phân công</h2>
          <p>
            Tài khoản nhân viên của bạn hiện chưa được phân công suất diễn nào.
            Vui lòng liên hệ ban tổ chức hoặc quản trị viên để được cấp quyền.
          </p>
          <div className="operations-actions" style={{ justifyContent: 'center', marginTop: '16px' }}>
            <Button variant="outline" onClick={handleManualRefresh}>
              Kiểm tra lại
            </Button>
          </div>
        </div>
      ) : (
        <div className="operations-event-grid">
          {showtimes.map((st) => (
            <article key={st.id} className="operations-panel">
              <div
                style={{
                  width: '100%',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  gap: '12px',
                }}
              >
                <h2>{st.eventName}</h2>
                <Badge variant={st.status === 'ON_SALE' ? 'default' : 'secondary'}>
                  {st.status === 'ON_SALE' ? 'Đang mở' : st.status}
                </Badge>
              </div>

              <p>
                <CalendarDays />
                <span>
                  {new Date(st.startTime).toLocaleString('vi-VN', {
                    timeZone: 'Asia/Ho_Chi_Minh',
                    dateStyle: 'full',
                    timeStyle: 'short',
                  })}
                </span>
              </p>

              {st.location && (
                <p>
                  <MapPin />
                  <span>{st.location}</span>
                </p>
              )}

              <p>
                <Ticket />
                <span>
                  Tổng vé: <strong>{st.totalTickets}</strong>{' '}
                  <span style={{ color: 'var(--muted-foreground)' }}>
                    (Đã soát: {st.checkedInTickets})
                  </span>
                </span>
              </p>

              <Button
                style={{ width: '100%', marginTop: 'auto' }}
                onClick={() => onSelectShowtime(st)}
              >
                <Scan />
                Vào máy quét suất này
              </Button>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
