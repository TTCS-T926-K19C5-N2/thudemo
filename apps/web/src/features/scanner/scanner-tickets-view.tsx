'use client';

import { useEffect, useState, useRef } from 'react';
import type { AssignedShowtime } from './scanner-api';
import {
  getShowtimeMeta,
  type ShowtimeLocalMeta,
} from './scanner-db';
import {
  downloadTicketsFull,
  syncTicketsIncremental,
  startAutoSync,
  isListStale,
} from './scanner-sync';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle,
  CircleAlert,
  CloudOff,
  MapPin,
  RotateCw,
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
  const [status, setStatus] = useState<SyncUIStatus>('not_downloaded');
  const [downloadProgress, setDownloadProgress] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
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

  // Load existing metadata from IndexedDB
  useEffect(() => {
    let cancelled = false;

    async function loadLocal() {
      try {
        const existing = await getShowtimeMeta(showtime.id);
        if (cancelled) return;

        if (existing) {
          setMeta(existing);
          setTicketCount(existing.ticketCount);
          setStatus(isListStale(existing.lastSyncAt) ? 'stale' : 'synced');
        } else {
          setMeta(null);
          setTicketCount(0);
          setStatus('not_downloaded');
        }
      } catch (err: unknown) {
        console.error('Lỗi đọc dữ liệu máy quét cục bộ:', err);
      }
    }

    void loadLocal();
    return () => {
      cancelled = true;
    };
  }, [showtime.id]);

  // Setup auto sync for stale lists (> 30 mins)
  useEffect(() => {
    const cleanup = startAutoSync(showtime.id, (updatedMeta) => {
      setMeta(updatedMeta);
      setTicketCount(updatedMeta.ticketCount);
      setStatus('synced');
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
    setDownloadProgress('Đang tải danh sách vé từ máy chủ…');

    try {
      const result = await downloadTicketsFull(showtime.id, (step, count) => {
        if (step === 'fetching') {
          setDownloadProgress('Đang kết nối và tải dữ liệu từ máy chủ…');
        } else if (step === 'saving') {
          setDownloadProgress(`Đang lưu ${count ?? 0} vé vào thiết bị…`);
        } else if (step === 'done') {
          setDownloadProgress(`Đã lưu thành công ${count ?? 0} vé.`);
        }
      });

      setMeta(result);
      setTicketCount(result.ticketCount);
      setStatus('synced');
      setDownloadProgress('');
    } catch (err: unknown) {
      console.error('Tải danh sách vé thất bại:', err);
      // Keep old version intact on failure
      setStatus(meta ? (isListStale(meta.lastSyncAt) ? 'stale' : 'synced') : 'error');
      setErrorMessage(
        err instanceof Error
          ? err.message
          : 'Tải danh sách vé thất bại. Thiết bị vẫn giữ nguyên bản cũ (nếu có).',
      );
    } finally {
      isDownloadingRef.current = false;
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
    setDownloadProgress('Đang tải phần thay đổi…');

    try {
      const updated = await syncTicketsIncremental(showtime.id);
      if (updated) {
        setMeta(updated);
        setTicketCount(updated.ticketCount);
        setStatus('synced');
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
    if (!isoStr) return 'Chưa có';
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

  return (
    <div className="w-full max-w-3xl mx-auto p-4 space-y-6">
      {/* Top Navigation */}
      <div className="flex items-center justify-between pb-3 border-b">
        <Button
          variant="ghost"
          size="sm"
          onClick={onChangeShowtime}
          className="gap-2 text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft />
          Đổi suất diễn
        </Button>
        <div className="flex items-center gap-2 text-sm">
          {isOnline ? (
            <span className="inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-medium text-xs bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              Trực tuyến
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-amber-600 dark:text-amber-400 font-medium text-xs bg-amber-500/10 px-2.5 py-1 rounded-full border border-amber-500/20">
              <CloudOff className="text-sm" />
              Ngoại tuyến
            </span>
          )}
        </div>
      </div>

      {/* Showtime Details Header */}
      <div className="bg-card border rounded-2xl p-6 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
          <div>
            <span className="text-xs font-semibold tracking-wider uppercase text-primary">
              Suất diễn đang chọn
            </span>
            <h1 className="text-2xl font-bold tracking-tight text-foreground mt-0.5">
              {showtime.eventName}
            </h1>
          </div>
          <div>
            {status === 'not_downloaded' && (
              <Badge variant="secondary" className="text-xs px-2.5 py-1">
                Chưa tải
              </Badge>
            )}
            {status === 'downloading' && (
              <Badge variant="default" className="text-xs px-2.5 py-1 bg-blue-600 gap-1.5 animate-pulse">
                <RotateCw className="animate-spin text-xs" />
                Đang tải…
              </Badge>
            )}
            {status === 'synced' && (
              <Badge variant="default" className="text-xs px-2.5 py-1 bg-emerald-600 gap-1">
                <CheckCircle className="text-xs" />
                Đã tải
              </Badge>
            )}
            {status === 'stale' && (
              <Badge variant="secondary" className="text-xs px-2.5 py-1 bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30 gap-1">
                <CircleAlert className="text-xs" />
                Đã cũ — cần cập nhật
              </Badge>
            )}
            {status === 'error' && (
              <Badge variant="destructive" className="text-xs px-2.5 py-1">
                Lỗi
              </Badge>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm text-muted-foreground pt-1">
          <div className="flex items-center gap-2">
            <CalendarDays className="text-primary text-base shrink-0" />
            <span>
              {new Date(showtime.startTime).toLocaleString('vi-VN', {
                timeZone: 'Asia/Ho_Chi_Minh',
                dateStyle: 'full',
                timeStyle: 'short',
              })}
            </span>
          </div>
          {showtime.location && (
            <div className="flex items-center gap-2">
              <MapPin className="text-primary text-base shrink-0" />
              <span className="line-clamp-1">{showtime.location}</span>
            </div>
          )}
        </div>
      </div>

      {/* Sync Status & Stats Card */}
      <div className="bg-card border rounded-2xl p-6 shadow-sm space-y-6">
        <h2 className="text-base font-semibold flex items-center gap-2">
          <Ticket className="text-primary" />
          Dữ liệu vé trên máy quét (S-33)
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="border rounded-xl p-4 bg-muted/20">
            <p className="text-xs text-muted-foreground">Số vé đã tải</p>
            <p className="text-2xl font-bold mt-1 text-foreground">
              {ticketCount}
              <span className="text-xs font-normal text-muted-foreground ml-1.5">
                vé
              </span>
            </p>
          </div>

          <div className="border rounded-xl p-4 bg-muted/20">
            <p className="text-xs text-muted-foreground">Thời điểm tải gần nhất</p>
            <p className="text-sm font-semibold mt-1 text-foreground">
              {formatVNDate(meta?.downloadedAt)}
            </p>
          </div>

          <div className="border rounded-xl p-4 bg-muted/20">
            <p className="text-xs text-muted-foreground">Tình trạng</p>
            <p className="text-sm font-semibold mt-1 text-foreground">
              {status === 'not_downloaded' && 'Chưa tải danh sách'}
              {status === 'downloading' && 'Đang tải dữ liệu…'}
              {status === 'synced' && 'Đã tải mới nhất'}
              {status === 'stale' && 'Quá 30 phút (cần tải lại)'}
              {status === 'error' && 'Lỗi kết nối'}
            </p>
          </div>
        </div>

        {/* Downloading progress indicator */}
        {status === 'downloading' && (
          <div className="space-y-2 p-4 rounded-xl bg-primary/5 border border-primary/20">
            <div className="flex items-center justify-between text-xs text-primary font-medium">
              <span>{downloadProgress || 'Đang xử lý dữ liệu…'}</span>
              <RotateCw className="animate-spin text-sm" />
            </div>
            <div className="w-full bg-primary/20 h-2 rounded-full overflow-hidden">
              <div className="bg-primary h-full w-2/3 animate-pulse rounded-full" />
            </div>
          </div>
        )}

        {/* Error message with retry */}
        {errorMessage && (
          <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm flex items-start gap-3">
            <CircleAlert className="text-lg shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-medium">Có lỗi xảy ra</p>
              <p className="text-xs text-destructive/90 mt-0.5">{errorMessage}</p>
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
        <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <Button
            size="lg"
            className="flex-1 gap-2 text-base font-medium shadow-sm"
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
              className="gap-2 text-base"
              onClick={handleIncrementalSync}
              disabled={status === 'downloading' || !isOnline}
            >
              <RotateCw />
              Tải phần thay đổi
            </Button>
          )}
        </div>

        {/* Offline notice */}
        {!isOnline && (
          <p className="text-xs text-muted-foreground/80 text-center flex items-center justify-center gap-1.5">
            <CloudOff className="text-sm" />
            Nút tải bị vô hiệu hoá khi thiết bị mất mạng. Khi có mạng trở lại, bạn có thể tải danh sách.
          </p>
        )}

        {meta && (
          <div className="pt-4 border-t flex flex-col sm:flex-row items-center justify-between text-xs text-muted-foreground gap-2">
            <span>
              Khoá công khai QR:{' '}
              <strong>
                {meta.publicKeys?.length
                  ? meta.publicKeys.map((k) => k.keyId).join(', ')
                  : 'chưa có, hãy tải lại danh sách'}
              </strong>
            </span>
            <span>Mốc đồng bộ (cursor): <strong>{meta.cursor.slice(0, 19).replace('T', ' ')}</strong></span>
          </div>
        )}
      </div>
    </div>
  );
}
