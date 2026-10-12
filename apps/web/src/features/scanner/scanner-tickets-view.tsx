'use client';

import { useEffect, useState, useRef } from 'react';
import type { AssignedShowtime } from './scanner-api';
import {
  getShowtimeMeta,
  getTicketsForShowtime,
  type ShowtimeLocalMeta,
  type LocalTicket,
} from './scanner-db';
import {
  downloadTicketsFull,
  syncTicketsIncremental,
  startAutoSync,
  isListStale,
} from './scanner-sync';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle,
  CircleAlert,
  CloudOff,
  MapPin,
  RotateCw,
  Search,
  Ticket,
} from '@/components/ui/material-icon';

interface ScannerTicketsViewProps {
  showtime: AssignedShowtime;
  onChangeShowtime: () => void;
}

type SyncUIStatus = 'not_downloaded' | 'downloading' | 'synced' | 'stale' | 'error';

export function ScannerTicketsView({
  showtime,
  onChangeShowtime,
}: ScannerTicketsViewProps) {
  const [meta, setMeta] = useState<ShowtimeLocalMeta | null>(null);
  const [ticketCount, setTicketCount] = useState<number>(0);
  const [tickets, setTickets] = useState<LocalTicket[]>([]);
  const [status, setStatus] = useState<SyncUIStatus>('not_downloaded');
  const [downloadProgress, setDownloadProgress] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  );

  const isDownloadingRef = useRef(false);

  // Monitor online status
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Load existing metadata and tickets from IndexedDB
  useEffect(() => {
    let cancelled = false;

    async function loadDb() {
      try {
        const existing = await getShowtimeMeta(showtime.id);
        if (cancelled) return;

        if (existing) {
          setMeta(existing);
          setTicketCount(existing.ticketCount);
          setStatus(isListStale(existing.lastSyncAt) ? 'stale' : 'synced');
          const list = await getTicketsForShowtime(showtime.id);
          if (!cancelled) setTickets(list);
        } else {
          setMeta(null);
          setTicketCount(0);
          setTickets([]);
          setStatus('not_downloaded');
        }
      } catch (err: unknown) {
        console.error('Lỗi đọc dữ liệu máy quét cục bộ:', err);
      }
    }

    void loadDb();
    return () => {
      cancelled = true;
    };
  }, [showtime.id]);

  // Setup auto sync for stale lists (> 30 mins)
  useEffect(() => {
    const cleanup = startAutoSync(showtime.id, async (updatedMeta) => {
      setMeta(updatedMeta);
      setTicketCount(updatedMeta.ticketCount);
      setStatus('synced');
      const list = await getTicketsForShowtime(showtime.id);
      setTickets(list);
    });

    return cleanup;
  }, [showtime.id]);

  // Full Download handler
  const handleFullDownload = async () => {
    if (isDownloadingRef.current) return;
    if (!isOnline) {
      setErrorMessage('Không có kết nối mạng. Hãy kết nối lại trước khi tải.');
      return;
    }

    isDownloadingRef.current = true;
    setStatus('downloading');
    setErrorMessage(null);
    setDownloadProgress('Đang kết nối và chuẩn bị tải danh sách vé…');

    try {
      const result = await downloadTicketsFull(showtime.id, (step, count) => {
        if (step === 'fetching') {
          setDownloadProgress('Đang tải danh sách vé từ máy chủ…');
        } else if (step === 'saving') {
          setDownloadProgress(`Đang lưu ${count ?? 0} vé vào IndexedDB của máy quét…`);
        } else if (step === 'done') {
          setDownloadProgress(`Đã lưu hoàn tất ${count ?? 0} vé.`);
        }
      });

      setMeta(result);
      setTicketCount(result.ticketCount);
      setStatus('synced');
      setDownloadProgress('');
      const list = await getTicketsForShowtime(showtime.id);
      setTickets(list);
    } catch (err: unknown) {
      console.error('Tải danh sách vé thất bại:', err);
      setStatus(meta ? (isListStale(meta.lastSyncAt) ? 'stale' : 'synced') : 'error');
      setErrorMessage(
        err instanceof Error
          ? err.message
          : 'Tải danh sách vé thất bại. Thiết bị vẫn giữ nguyên bản cũ (nếu có).',
      );
    } finally {
      isDownloadingRef.current = false;
      setDownloadProgress('');
    }
  };

  // Incremental sync handler
  const handleIncrementalSync = async () => {
    if (isDownloadingRef.current) return;
    if (!isOnline) {
      setErrorMessage('Không có kết nối mạng. Hãy kết nối lại để cập nhật.');
      return;
    }

    isDownloadingRef.current = true;
    setErrorMessage(null);
    setDownloadProgress('Đang tải phần thay đổi từ máy chủ…');

    try {
      const updated = await syncTicketsIncremental(showtime.id);
      if (updated) {
        setMeta(updated);
        setTicketCount(updated.ticketCount);
        setStatus('synced');
        const list = await getTicketsForShowtime(showtime.id);
        setTickets(list);
      }
    } catch (err: unknown) {
      console.error('Đồng bộ phần thay đổi thất bại:', err);
      setErrorMessage(
        err instanceof Error
          ? err.message
          : 'Không thể đồng bộ phần thay đổi.',
      );
    } finally {
      isDownloadingRef.current = false;
      setDownloadProgress('');
    }
  };

  // Format date helper for Vietnam timezone
  const formatVNDate = (isoStr: string | null | undefined) => {
    if (!isoStr) return 'Chưa tải';
    try {
      return new Date(isoStr).toLocaleString('vi-VN', {
        timeZone: 'Asia/Ho_Chi_Minh',
        dateStyle: 'medium',
        timeStyle: 'medium',
      });
    } catch {
      return isoStr;
    }
  };

  // Filtered tickets for preview table
  const filteredTickets = tickets.filter((t) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().trim();
    return (
      t.code.toLowerCase().includes(q) ||
      t.seatLabel.toLowerCase().includes(q) ||
      t.ticketType.toLowerCase().includes(q)
    );
  });

  const previewTickets = filteredTickets.slice(0, 15);

  return (
    <div className="scanner-view-wrap" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Top Navigation Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <button
          type="button"
          onClick={onChangeShowtime}
          className="operations-back"
          style={{ marginBottom: 0, cursor: 'pointer' }}
        >
          <ArrowLeft />
          <span>Chọn suất diễn khác</span>
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {isOnline ? (
            <Badge variant="outline" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              <span
                style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  background: 'var(--primary)',
                  display: 'inline-block',
                }}
              />
              Trực tuyến
            </Badge>
          ) : (
            <Badge variant="destructive" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              <CloudOff size={14} />
              Ngoại tuyến
            </Badge>
          )}
        </div>
      </div>

      {/* Showtime Facts Panel */}
      <section className="operations-panel">
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px',
            marginBottom: '16px',
          }}
        >
          <div>
            <small style={{ color: 'var(--primary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Suất diễn đang chọn
            </small>
            <h1 style={{ fontSize: '22px', fontWeight: 700, margin: '4px 0 0 0' }}>
              {showtime.eventName}
            </h1>
          </div>

          <div>
            {status === 'not_downloaded' && (
              <Badge variant="secondary">Chưa tải dữ liệu</Badge>
            )}
            {status === 'downloading' && (
              <Badge variant="default" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                <RotateCw className="animate-spin" size={14} />
                Đang tải…
              </Badge>
            )}
            {status === 'synced' && (
              <Badge variant="default" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                <CheckCircle size={14} />
                Đã tải
              </Badge>
            )}
            {status === 'stale' && (
              <Badge variant="destructive" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                <CircleAlert size={14} />
                Đã cũ — cần cập nhật
              </Badge>
            )}
            {status === 'error' && (
              <Badge variant="destructive">Lỗi tải</Badge>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', color: 'var(--muted-foreground)' }}>
          <p style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
            <CalendarDays />
            <span>
              {new Date(showtime.startTime).toLocaleString('vi-VN', {
                timeZone: 'Asia/Ho_Chi_Minh',
                dateStyle: 'full',
                timeStyle: 'short',
              })}
            </span>
          </p>

          {showtime.location && (
            <p style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
              <MapPin />
              <span>{showtime.location}</span>
            </p>
          )}
        </div>
      </section>

      {/* Sync Status & Metrics Panel */}
      <section className="operations-panel">
        <h2 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Ticket />
          Dữ liệu vé trên máy quét (S-33)
        </h2>
        <p style={{ marginTop: '-8px' }}>
          Danh sách vé đã tải xuống thiết bị qua IndexedDB, sẵn sàng soát vé ngay cả khi mất mạng.
        </p>

        {/* 4 Standard Metrics Columns */}
        <div className="operations-metrics">
          <div>
            <dt>Số vé đã tải</dt>
            <dd>
              {ticketCount} <small style={{ fontWeight: 400, color: 'var(--muted-foreground)' }}>vé</small>
            </dd>
          </div>

          <div>
            <dt>Thời điểm tải gần nhất</dt>
            <dd style={{ fontSize: '15px', fontWeight: 600 }}>
              {formatVNDate(meta?.downloadedAt)}
            </dd>
          </div>

          <div>
            <dt>Tình trạng danh sách</dt>
            <dd style={{ fontSize: '15px', fontWeight: 600 }}>
              {status === 'not_downloaded' && 'Chưa tải'}
              {status === 'downloading' && 'Đang tải…'}
              {status === 'synced' && 'Đã đồng bộ'}
              {status === 'stale' && 'Cũ (> 30 phút)'}
              {status === 'error' && 'Lỗi kết nối'}
            </dd>
          </div>

          <div>
            <dt>Khoá QR / Cursor</dt>
            <dd style={{ fontSize: '13px', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {meta ? `${meta.keyId} · ${meta.cursor.slice(0, 10)}` : 'Chưa có'}
            </dd>
          </div>
        </div>

        {/* Downloading progress indicator */}
        {status === 'downloading' && (
          <div
            className="operations-notice"
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              background: 'var(--muted)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px' }}>
              <strong>{downloadProgress || 'Đang xử lý dữ liệu…'}</strong>
              <RotateCw className="animate-spin" size={16} />
            </div>
            <div
              style={{
                width: '100%',
                height: '6px',
                background: 'var(--border)',
                borderRadius: '3px',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: '60%',
                  height: '100%',
                  background: 'var(--primary)',
                  borderRadius: '3px',
                  animation: 'pulse 1.5s infinite',
                }}
              />
            </div>
          </div>
        )}

        {/* Error message banner */}
        {errorMessage && (
          <div className="operations-notice operations-error" role="alert">
            <CircleAlert />
            <div style={{ flex: 1 }}>
              <strong>Có lỗi xảy ra:</strong>
              <p style={{ margin: '4px 0 0 0' }}>{errorMessage}</p>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={handleFullDownload}
              disabled={status === 'downloading' || !isOnline}
            >
              Thử lại
            </Button>
          </div>
        )}

        {/* Action Buttons */}
        <div className="operations-actions" style={{ marginTop: '8px' }}>
          <Button
            size="lg"
            onClick={handleFullDownload}
            disabled={status === 'downloading' || !isOnline}
          >
            <RotateCw className={status === 'downloading' ? 'animate-spin' : ''} />
            {meta ? 'Tải lại toàn bộ danh sách' : 'Tải danh sách'}
          </Button>

          {meta && (
            <Button
              size="lg"
              variant="outline"
              onClick={handleIncrementalSync}
              disabled={status === 'downloading' || !isOnline}
            >
              <RotateCw />
              Tải phần thay đổi
            </Button>
          )}
        </div>

        {/* Offline Notice */}
        {!isOnline && (
          <div
            className="operations-notice"
            role="status"
            style={{ marginTop: '16px', marginBottom: 0 }}
          >
            <p style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: 0, fontSize: '13px' }}>
              <CloudOff />
              <span>
                Nút tải bị vô hiệu hoá khi thiết bị mất mạng. Dữ liệu vé đã tải trên máy vẫn sẵn sàng để soát vé.
              </span>
            </p>
          </div>
        )}
      </section>

      {/* Ticket List Preview Panel */}
      {tickets.length > 0 && (
        <section className="operations-panel">
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '16px',
              marginBottom: '16px',
            }}
          >
            <div>
              <h2 style={{ margin: 0 }}>Danh sách vé cục bộ ({tickets.length} vé)</h2>
              <p style={{ margin: '4px 0 0 0' }}>
                Hiển thị dữ liệu vé lưu trong IndexedDB của trình duyệt máy quét.
              </p>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '280px', maxWidth: '100%' }}>
              <Search />
              <Input
                placeholder="Tìm mã vé, ghế..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                aria-label="Tìm kiếm vé trong máy quét"
              />
            </div>
          </div>

          <div className="operations-table-wrap">
            <table className="operations-table">
              <thead>
                <tr>
                  <th>Mã vé</th>
                  <th>Hạng vé</th>
                  <th>Vị trí ghế</th>
                  <th>Trạng thái</th>
                  <th>Thời gian vào</th>
                </tr>
              </thead>
              <tbody>
                {previewTickets.map((t) => (
                  <tr key={t.code}>
                    <td>
                      <strong style={{ fontFamily: 'monospace' }}>{t.code}</strong>
                    </td>
                    <td>{t.ticketType}</td>
                    <td>{t.seatLabel}</td>
                    <td>
                      {t.status === 'valid' && (
                        <Badge variant="outline">Hợp lệ</Badge>
                      )}
                      {t.status === 'checked_in' && (
                        <Badge variant="default">Đã vào</Badge>
                      )}
                      {t.status === 'cancelled' && (
                        <Badge variant="destructive">Đã huỷ</Badge>
                      )}
                    </td>
                    <td style={{ color: 'var(--muted-foreground)', fontSize: '13px' }}>
                      {t.checkedInAt ? formatVNDate(t.checkedInAt) : '—'}
                    </td>
                  </tr>
                ))}
                {previewTickets.length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', padding: '24px', color: 'var(--muted-foreground)' }}>
                      Không tìm thấy vé nào khớp với từ khoá tìm kiếm.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {filteredTickets.length > 15 && (
            <p style={{ marginTop: '12px', fontSize: '12px', color: 'var(--muted-foreground)', textAlign: 'right' }}>
              Đang hiển thị 15 trên tổng số {filteredTickets.length} vé tìm thấy.
            </p>
          )}
        </section>
      )}
    </div>
  );
}
