'use client';

import React, { useState, useEffect } from 'react';

interface SeatCategory {
  id: string;
  name: string;
  showtimeId: string;
}

interface Seat {
  id: string;
  showtimeId: string;
  seatCategoryId: string | null;
  seatRow: string;
  seatNumber: number;
  seatCategory?: SeatCategory | null;
}

interface EventItem {
  id: string;
  name: string;
  description: string;
  location: string;
  status: string;
  organizerId: string;
}

type ApiResponse =
  | { status: number; statusText: string; data: unknown }
  | { error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export default function DemoPage() {
  const [apiUrl] = useState('http://localhost:3001');
  const [healthStatus, setHealthStatus] = useState<'checking' | 'healthy' | 'error'>('checking');
  
  const [events, setEvents] = useState<EventItem[]>([]);
  const selectedShowtimeId = '772632d1-1eee-4c3a-8131-972529c4e937';
  const [seats, setSeats] = useState<Seat[]>([]);
  const [categories, setCategories] = useState<SeatCategory[]>([]);
  const [loadingSeats, setLoadingSeats] = useState(true);
  const [selectedSeat, setSelectedSeat] = useState<Seat | null>(null);

  // API Tester State
  const [activeTab, setActiveTab] = useState<'seatmap' | 'api-tester'>('seatmap');
  const [apiEndpoint, setApiEndpoint] = useState('/health');
  const [apiMethod, setApiMethod] = useState<'GET' | 'POST'>('GET');
  const [apiRequestBody, setApiRequestBody] = useState('');
  const [apiResponse, setApiResponse] = useState<ApiResponse | null>(null);
  const [apiLoading, setApiLoading] = useState(false);
  const [authToken, setAuthToken] = useState<string | null>(null);

  const checkHealth = React.useCallback(async (): Promise<'healthy' | 'error'> => {
    try {
      const res = await fetch(`${apiUrl}/health`);
      return res.ok ? 'healthy' : 'error';
    } catch {
      return 'error';
    }
  }, [apiUrl]);

  const loadEvents = React.useCallback(async (): Promise<EventItem[] | null> => {
    try {
      const res = await fetch(`${apiUrl}/events`);
      if (res.ok) {
        const data = await res.json();
        return data;
      }
      return null;
    } catch (err) {
      console.error('Failed to load events:', err);
      return null;
    }
  }, [apiUrl]);

  const loadSeatsAndCategories = React.useCallback(async (
    showtimeId: string
  ): Promise<{ seats?: Seat[]; categories?: SeatCategory[] } | null> => {
    try {
      const [seatsRes, catsRes] = await Promise.all([
        fetch(`${apiUrl}/seats/showtime/${showtimeId}`),
        fetch(`${apiUrl}/seats/categories/showtime/${showtimeId}`),
      ]);

      const [seatsData, categoriesData] = await Promise.all([
        seatsRes.ok ? seatsRes.json() : undefined,
        catsRes.ok ? catsRes.json() : undefined,
      ]);

      return { seats: seatsData, categories: categoriesData };
    } catch (err) {
      console.error('Failed to load seats:', err);
      return null;
    }
  }, [apiUrl]);

  useEffect(() => {
    let active = true;

    checkHealth().then((status) => {
      if (active) setHealthStatus(status);
    });
    loadEvents().then((data) => {
      if (active && data) setEvents(data);
    });

    return () => {
      active = false;
    };
  }, [checkHealth, loadEvents]);

  useEffect(() => {
    let active = true;

    loadSeatsAndCategories(selectedShowtimeId).then((data) => {
      if (!active) return;
      if (data?.seats) setSeats(data.seats);
      if (data?.categories) setCategories(data.categories);
      setLoadingSeats(false);
    });

    return () => {
      active = false;
    };
  }, [loadSeatsAndCategories, selectedShowtimeId]);

  const executeApiCall = async () => {
    setApiLoading(true);
    setApiResponse(null);
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
      }

      const options: RequestInit = {
        method: apiMethod,
        headers,
      };

      if (apiMethod === 'POST' && apiRequestBody) {
        options.body = apiRequestBody;
      }

      const res = await fetch(`${apiUrl}${apiEndpoint}`, options);
      const data = await res.json();
      setApiResponse({
        status: res.status,
        statusText: res.statusText,
        data,
      });

      if (
        apiEndpoint === '/auth/login' &&
        isRecord(data) &&
        typeof data.access_token === 'string'
      ) {
        setAuthToken(data.access_token);
      }
    } catch (err: unknown) {
      setApiResponse({
        error: err instanceof Error ? err.message : 'Lỗi kết nối API',
      });
    } finally {
      setApiLoading(false);
    }
  };

  // Group seats by row
  const rowsMap = new Map<string, Seat[]>();
  seats.forEach((seat) => {
    const list = rowsMap.get(seat.seatRow) || [];
    list.push(seat);
    rowsMap.set(seat.seatRow, list);
  });
  const sortedRows = Array.from(rowsMap.keys()).sort();

  const getCategoryColor = (catName?: string) => {
    if (!catName) return 'bg-zinc-700 text-zinc-300 border-zinc-600';
    const lower = catName.toLowerCase();
    if (lower.includes('vip')) {
      return 'bg-amber-500/20 text-amber-300 border-amber-500 hover:bg-amber-500/30';
    }
    if (lower.includes('standard')) {
      return 'bg-sky-500/20 text-sky-300 border-sky-500 hover:bg-sky-500/30';
    }
    return 'bg-emerald-500/20 text-emerald-300 border-emerald-500 hover:bg-emerald-500/30';
  };

  const getCategoryBadge = (catName?: string) => {
    if (!catName) return 'bg-zinc-800 text-zinc-400 border-zinc-700';
    const lower = catName.toLowerCase();
    if (lower.includes('vip')) return 'bg-amber-500/10 text-amber-400 border-amber-500/30';
    if (lower.includes('standard')) return 'bg-sky-500/10 text-sky-400 border-sky-500/30';
    return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
  };

  return (
    <div className="min-h-screen bg-[#0a0f1d] text-zinc-100 flex flex-col selection:bg-indigo-500 selection:text-white">
      {/* Top Navbar */}
      <header className="border-b border-zinc-800/80 bg-zinc-950/70 backdrop-blur-md sticky top-0 z-50 px-6 py-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-gradient-to-tr from-indigo-500 to-violet-500 flex items-center justify-center font-bold text-white shadow-lg shadow-indigo-500/30">
            🎟️
          </div>
          <div>
            <h1 className="font-bold text-lg tracking-tight bg-gradient-to-r from-white via-zinc-200 to-zinc-400 bg-clip-text text-transparent">
              Event Ticketing Platform
            </h1>
            <p className="text-xs text-zinc-400">Sprint 1 Demo — Kiến trúc Sơ đồ ghế & Đặt chỗ</p>
          </div>
        </div>

        {/* System Health Indicators */}
        <div className="flex items-center gap-3 text-xs">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-zinc-900 border border-zinc-800">
            <span className="text-zinc-400">NestJS API:</span>
            <span className="font-mono text-zinc-300">:3001</span>
            <span
              className={`h-2.5 w-2.5 rounded-full ${
                healthStatus === 'healthy'
                  ? 'bg-emerald-400 shadow-md shadow-emerald-500/50 animate-pulse'
                  : healthStatus === 'checking'
                  ? 'bg-amber-400 animate-spin'
                  : 'bg-rose-500'
              }`}
            />
          </div>

          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-zinc-900 border border-zinc-800">
            <span className="text-zinc-400">PostgreSQL & Redis:</span>
            <span className={`font-semibold ${healthStatus === 'healthy' ? 'text-emerald-400' : 'text-rose-400'}`}>
              {healthStatus === 'healthy' ? 'Active' : 'Offline'}
            </span>
          </div>

          {authToken && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/30 text-indigo-400">
              <span>👤 Organizer Logged In</span>
            </div>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 flex flex-col gap-6">
        {/* Navigation Tabs */}
        <div className="flex items-center justify-between border-b border-zinc-800/80 pb-3">
          <div className="flex gap-2">
            <button
              onClick={() => setActiveTab('seatmap')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'seatmap'
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50'
              }`}
            >
              🎭 Sơ đồ ghế Trực quan (Seat Map)
            </button>
            <button
              onClick={() => setActiveTab('api-tester')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'api-tester'
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50'
              }`}
            >
              ⚡ Live API Tester (T-11 ~ T-14)
            </button>
          </div>

          <button
            onClick={() => {
              setHealthStatus('checking');
              checkHealth().then(setHealthStatus);
              if (selectedShowtimeId) {
                setLoadingSeats(true);
                loadSeatsAndCategories(selectedShowtimeId).then((data) => {
                  if (data?.seats) setSeats(data.seats);
                  if (data?.categories) setCategories(data.categories);
                  setLoadingSeats(false);
                });
              }
            }}
            className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white bg-zinc-900 border border-zinc-800 px-3 py-1.5 rounded-lg hover:border-zinc-700 transition"
          >
            🔄 Tải lại dữ liệu
          </button>
        </div>

        {activeTab === 'seatmap' ? (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            {/* Left 3 cols: Seat Map Display */}
            <div className="lg:col-span-3 flex flex-col gap-4">
              {/* Event Info Card */}
              {events.length > 0 && (
                <div className="p-5 rounded-2xl bg-gradient-to-r from-zinc-900 to-zinc-900/60 border border-zinc-800/80 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                        {events[0].status}
                      </span>
                      <span className="text-xs text-zinc-400">Suất diễn: 20/11/2026 19:30</span>
                    </div>
                    <h2 className="text-xl font-bold text-white">{events[0].name}</h2>
                    <p className="text-xs text-zinc-400 mt-1">📍 {events[0].location}</p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {categories.map((c) => (
                      <span
                        key={c.id}
                        className={`text-xs px-2.5 py-1 rounded-md border font-medium ${getCategoryBadge(c.name)}`}
                      >
                        {c.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Stage & Seat Grid */}
              <div className="p-6 rounded-2xl bg-zinc-900/50 border border-zinc-800/80 shadow-xl flex flex-col items-center">
                {/* Visual Stage */}
                <div className="w-full max-w-xl mb-12 flex flex-col items-center">
                  <div className="w-full h-8 rounded-lg bg-gradient-to-b from-indigo-500/30 to-indigo-600/5 border border-indigo-500/40 flex items-center justify-center font-bold text-xs tracking-widest text-indigo-300 uppercase shadow-[0_0_25px_rgba(99,102,241,0.2)]">
                    SÂN KHẤU CHÍNH (STAGE)
                  </div>
                  <div className="w-2/3 h-2 bg-gradient-to-b from-indigo-500/20 to-transparent blur-sm -mt-1" />
                </div>

                {/* Seat Matrix */}
                {loadingSeats ? (
                  <div className="py-20 text-zinc-400 text-sm flex items-center gap-2">
                    <span className="animate-spin text-lg">⏳</span> Đang tải sơ đồ ghế từ API backend...
                  </div>
                ) : seats.length === 0 ? (
                  <div className="py-20 text-zinc-400 text-sm text-center">
                    Chưa có ghế nào cho suất diễn này. Bạn có thể dùng tab Live API Tester để test API Import ghế!
                  </div>
                ) : (
                  <div className="w-full overflow-x-auto pb-4 flex flex-col items-center gap-3">
                    {sortedRows.map((rowName) => {
                      const rowSeats = rowsMap.get(rowName) || [];
                      rowSeats.sort((a, b) => a.seatNumber - b.seatNumber);
                      return (
                        <div key={rowName} className="flex items-center gap-3">
                          <span className="w-6 text-center font-bold text-xs text-zinc-500">
                            {rowName}
                          </span>
                          <div className="flex items-center gap-1.5">
                            {rowSeats.map((seat) => {
                              const isSelected = selectedSeat?.id === seat.id;
                              const catName = seat.seatCategory?.name;
                              return (
                                <button
                                  key={seat.id}
                                  onClick={() => setSelectedSeat(seat)}
                                  className={`h-8 w-8 rounded-md border text-[11px] font-semibold flex items-center justify-center transition-all ${
                                    isSelected
                                      ? 'bg-white text-black border-white scale-110 shadow-lg shadow-white/30 z-10'
                                      : getCategoryColor(catName)
                                  }`}
                                  title={`Ghế ${seat.seatRow}${seat.seatNumber} (${catName || 'Chưa phân hạng'})`}
                                >
                                  {seat.seatNumber}
                                </button>
                              );
                            })}
                          </div>
                          <span className="w-6 text-center font-bold text-xs text-zinc-500">
                            {rowName}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Legend */}
                <div className="mt-8 pt-6 border-t border-zinc-800/80 w-full flex flex-wrap items-center justify-center gap-6 text-xs text-zinc-400">
                  <div className="flex items-center gap-2">
                    <span className="h-4 w-4 rounded border bg-amber-500/20 border-amber-500" />
                    <span>Hàng A-B: VIP</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="h-4 w-4 rounded border bg-sky-500/20 border-sky-500" />
                    <span>Hàng C-E: Standard</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="h-4 w-4 rounded border bg-emerald-500/20 border-emerald-500" />
                    <span>Hàng F-G: Economy</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="h-4 w-4 rounded border bg-white border-white" />
                    <span>Đang chọn</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Right col: Seat Details & Info */}
            <div className="flex flex-col gap-4">
              <div className="p-5 rounded-2xl bg-zinc-900/60 border border-zinc-800/80 shadow-xl flex flex-col gap-4">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <span>📌</span> Chi tiết ghế đã chọn
                </h3>

                {selectedSeat ? (
                  <div className="flex flex-col gap-3">
                    <div className="p-4 rounded-xl bg-zinc-950/80 border border-zinc-800 flex items-center justify-between">
                      <div>
                        <div className="text-2xl font-black text-white">
                          {selectedSeat.seatRow}-{selectedSeat.seatNumber}
                        </div>
                        <div className="text-xs text-zinc-400 mt-0.5">Số hàng & số ghế</div>
                      </div>
                      <span
                        className={`text-xs px-2.5 py-1 rounded-md border font-semibold ${getCategoryBadge(
                          selectedSeat.seatCategory?.name
                        )}`}
                      >
                        {selectedSeat.seatCategory?.name || 'Standard'}
                      </span>
                    </div>

                    <div className="space-y-2 text-xs">
                      <div className="flex justify-between text-zinc-400">
                        <span>Seat ID:</span>
                        <span className="font-mono text-zinc-300 text-[10px] truncate max-w-[140px]">
                          {selectedSeat.id}
                        </span>
                      </div>
                      <div className="flex justify-between text-zinc-400">
                        <span>Showtime ID:</span>
                        <span className="font-mono text-zinc-300 text-[10px] truncate max-w-[140px]">
                          {selectedSeat.showtimeId}
                        </span>
                      </div>
                      <div className="flex justify-between text-zinc-400">
                        <span>Trạng thái:</span>
                        <span className="text-emerald-400 font-semibold">Khả dụng (Chưa bán)</span>
                      </div>
                    </div>

                    <button
                      onClick={() => alert(`Đã chọn ghế ${selectedSeat.seatRow}-${selectedSeat.seatNumber}`)}
                      className="w-full mt-2 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 font-semibold text-xs text-white shadow-lg shadow-indigo-600/30 transition"
                    >
                      Xác nhận giữ chỗ (Giả lập)
                    </button>
                  </div>
                ) : (
                  <div className="py-10 text-center text-xs text-zinc-500 border border-dashed border-zinc-800 rounded-xl">
                    Nhấp vào một ghế trên sơ đồ để xem chi tiết
                  </div>
                )}
              </div>

              {/* Statistics Card */}
              <div className="p-5 rounded-2xl bg-zinc-900/60 border border-zinc-800/80 shadow-xl flex flex-col gap-3">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <span>📊</span> Thống kê suất diễn
                </h3>
                <div className="grid grid-cols-2 gap-2 text-center text-xs">
                  <div className="p-3 rounded-xl bg-zinc-950/60 border border-zinc-800/60">
                    <div className="text-lg font-bold text-white">{seats.length}</div>
                    <div className="text-[11px] text-zinc-400">Tổng số ghế</div>
                  </div>
                  <div className="p-3 rounded-xl bg-zinc-950/60 border border-zinc-800/60">
                    <div className="text-lg font-bold text-white">{categories.length}</div>
                    <div className="text-[11px] text-zinc-400">Hạng vé</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* Live API Tester */
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left 1 col: Quick Endpoint Presets */}
            <div className="flex flex-col gap-3">
              <h3 className="text-sm font-bold text-white mb-1">Endpoints Sprint 1 (T-11 ~ T-14)</h3>

              <button
                onClick={() => {
                  setApiMethod('GET');
                  setApiEndpoint('/health');
                  setApiRequestBody('');
                }}
                className={`p-3 rounded-xl border text-left text-xs transition ${
                  apiEndpoint === '/health'
                    ? 'bg-zinc-800 border-indigo-500 text-white'
                    : 'bg-zinc-900/60 border-zinc-800 text-zinc-400 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-2 font-mono font-bold text-emerald-400">
                  <span>GET</span> <span>/health</span>
                </div>
                <p className="text-[11px] text-zinc-500 mt-1">Kiểm tra DB Postgres & Redis kết nối</p>
              </button>

              <button
                onClick={() => {
                  setApiMethod('GET');
                  setApiEndpoint('/events');
                  setApiRequestBody('');
                }}
                className={`p-3 rounded-xl border text-left text-xs transition ${
                  apiEndpoint === '/events'
                    ? 'bg-zinc-800 border-indigo-500 text-white'
                    : 'bg-zinc-900/60 border-zinc-800 text-zinc-400 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-2 font-mono font-bold text-emerald-400">
                  <span>GET</span> <span>/events</span>
                </div>
                <p className="text-[11px] text-zinc-500 mt-1">Lấy danh sách sự kiện công khai</p>
              </button>

              <button
                onClick={() => {
                  setApiMethod('GET');
                  setApiEndpoint(`/seats/showtime/${selectedShowtimeId}`);
                  setApiRequestBody('');
                }}
                className={`p-3 rounded-xl border text-left text-xs transition ${
                  apiEndpoint.startsWith('/seats/showtime')
                    ? 'bg-zinc-800 border-indigo-500 text-white'
                    : 'bg-zinc-900/60 border-zinc-800 text-zinc-400 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-2 font-mono font-bold text-emerald-400">
                  <span>GET</span> <span>/seats/showtime/:id</span>
                </div>
                <p className="text-[11px] text-zinc-500 mt-1">T-13: Lấy sơ đồ ghế theo suất diễn</p>
              </button>

              <button
                onClick={() => {
                  setApiMethod('GET');
                  setApiEndpoint(`/seats/categories/showtime/${selectedShowtimeId}`);
                  setApiRequestBody('');
                }}
                className={`p-3 rounded-xl border text-left text-xs transition ${
                  apiEndpoint.startsWith('/seats/categories')
                    ? 'bg-zinc-800 border-indigo-500 text-white'
                    : 'bg-zinc-900/60 border-zinc-800 text-zinc-400 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-2 font-mono font-bold text-emerald-400">
                  <span>GET</span> <span>/seats/categories/showtime/:id</span>
                </div>
                <p className="text-[11px] text-zinc-500 mt-1">T-14: Lấy danh sách hạng ghế theo suất</p>
              </button>

              <button
                onClick={() => {
                  setApiMethod('POST');
                  setApiEndpoint('/auth/login');
                  setApiRequestBody(
                    JSON.stringify(
                      {
                        email: 'organizer@eventticket.local',
                        password: 'Admin@123',
                      },
                      null,
                      2
                    )
                  );
                }}
                className={`p-3 rounded-xl border text-left text-xs transition ${
                  apiEndpoint === '/auth/login'
                    ? 'bg-zinc-800 border-indigo-500 text-white'
                    : 'bg-zinc-900/60 border-zinc-800 text-zinc-400 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-2 font-mono font-bold text-amber-400">
                  <span>POST</span> <span>/auth/login</span>
                </div>
                <p className="text-[11px] text-zinc-500 mt-1">Đăng nhập tài khoản Organizer test</p>
              </button>

              <button
                onClick={() => {
                  setApiMethod('POST');
                  setApiEndpoint('/seats/import');
                  setApiRequestBody(
                    JSON.stringify(
                      {
                        showtimeId: selectedShowtimeId,
                        categories: [{ name: 'VIP' }, { name: 'Standard' }],
                        seats: [
                          { seatRow: 'X', seatNumber: 1, categoryName: 'VIP' },
                          { seatRow: 'X', seatNumber: 2, categoryName: 'Standard' },
                        ],
                      },
                      null,
                      2
                    )
                  );
                }}
                className={`p-3 rounded-xl border text-left text-xs transition ${
                  apiEndpoint === '/seats/import'
                    ? 'bg-zinc-800 border-indigo-500 text-white'
                    : 'bg-zinc-900/60 border-zinc-800 text-zinc-400 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-2 font-mono font-bold text-amber-400">
                  <span>POST</span> <span>/seats/import</span>
                </div>
                <p className="text-[11px] text-zinc-500 mt-1">T-12: Import sơ đồ ghế mới trong transaction</p>
              </button>
            </div>

            {/* Right 2 cols: Request & Response console */}
            <div className="lg:col-span-2 flex flex-col gap-4">
              <div className="p-5 rounded-2xl bg-zinc-900/60 border border-zinc-800/80 shadow-xl flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <select
                    value={apiMethod}
                    onChange={(e) => {
                      if (e.target.value === 'GET' || e.target.value === 'POST') {
                        setApiMethod(e.target.value);
                      }
                    }}
                    className="bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs font-mono font-bold text-white focus:outline-none focus:border-indigo-500"
                  >
                    <option value="GET">GET</option>
                    <option value="POST">POST</option>
                  </select>
                  <input
                    type="text"
                    value={apiEndpoint}
                    onChange={(e) => setApiEndpoint(e.target.value)}
                    placeholder="/health"
                    className="flex-1 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-indigo-500"
                  />
                  <button
                    onClick={executeApiCall}
                    disabled={apiLoading}
                    className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold text-xs rounded-lg shadow-lg shadow-indigo-600/30 transition flex items-center gap-1.5"
                  >
                    {apiLoading ? 'Đang gửi...' : 'Gửi Request'}
                  </button>
                </div>

                {apiMethod === 'POST' && (
                  <div>
                    <label className="text-xs text-zinc-400 font-semibold mb-1 block">Request Body (JSON):</label>
                    <textarea
                      rows={5}
                      value={apiRequestBody}
                      onChange={(e) => setApiRequestBody(e.target.value)}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-3 text-xs font-mono text-zinc-200 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                )}
              </div>

              {/* Response Display */}
              <div className="p-5 rounded-2xl bg-zinc-900/60 border border-zinc-800/80 shadow-xl flex flex-col gap-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-zinc-300">Kết quả phản hồi (Response):</span>
                  {apiResponse && 'status' in apiResponse && (
                    <span
                      className={`font-mono font-bold px-2 py-0.5 rounded text-[11px] ${
                        apiResponse.status < 300
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                          : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                      }`}
                    >
                      Status: {apiResponse.status} {apiResponse.statusText}
                    </span>
                  )}
                </div>

                <pre className="w-full bg-zinc-950 border border-zinc-800/90 rounded-xl p-4 text-xs font-mono text-emerald-400 overflow-x-auto max-h-[400px] leading-relaxed">
                  {apiResponse
                    ? JSON.stringify(
                        'data' in apiResponse ? apiResponse.data : apiResponse,
                        null,
                        2
                      )
                    : '// Chưa gửi request. Bấm "Gửi Request" để xem kết quả.'}
                </pre>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
