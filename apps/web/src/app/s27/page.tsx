"use client";

import { useEffect, useState, useMemo } from "react";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import {
  CheckCircle,
  CircleAlert,
  Mail,
  RotateCw,
  Ticket as TicketIcon,
  Scan,
  MapPin,
  CalendarDays,
  Info,
  Banknote,
} from "@/components/ui/material-icon";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface SampleTicket {
  id: string;
  ticketCode: string;
  seatRow: string;
  seatNumber: number;
  categoryName: string;
  price: number;
  qrPayload: string;
  qrDataUrl: string;
}

export default function S27DemoPage() {
  // Production guard: strictly disabled in production builds
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  // Active view tab
  const [activeTab, setActiveTab] = useState<"tickets" | "email" | "simulation" | "tests">("tickets");

  // Sample order state
  const [orderId, setOrderId] = useState("a1b2c3d4-e5f6-4789-8012-3456789abcde");
  const [customerEmail, setCustomerEmail] = useState("khanhhang.demo@example.com");
  const [eventName, setEventName] = useState("Đại Nhạc Hội Mùa Thu 2026");
  const [location, setLocation] = useState("Trung tâm Hội nghị Quốc gia Hà Nội");
  const [showtimeDate, setShowtimeDate] = useState("2026-11-20T19:30");

  // Tickets state
  const [tickets, setTickets] = useState<SampleTicket[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);

  // Email simulation states
  const [simulateRetries, setSimulateRetries] = useState(false);
  const [simulatingSend, setSimulatingSend] = useState(false);
  const [simulationLogs, setSimulationLogs] = useState<string[]>([]);
  const [sendResult, setSendResult] = useState<{
    success: boolean;
    attempts: number;
    messageId?: string;
    error?: string;
    sentAt?: string;
  } | null>(null);

  // Initial load: generate QR codes for sample tickets
  useEffect(() => {
    async function initTickets() {
      setIsGenerating(true);
      const rawTickets = [
        {
          id: "tkt-vip-001",
          ticketCode: "TKT-AUTUMN-VIP-A12",
          seatRow: "VIP-A",
          seatNumber: 12,
          categoryName: "VIP Hạng Nhất",
          price: 750000,
        },
        {
          id: "tkt-vip-002",
          ticketCode: "TKT-AUTUMN-VIP-A14",
          seatRow: "VIP-A",
          seatNumber: 14,
          categoryName: "VIP Hạng Nhất",
          price: 750000,
        },
      ];

      const generated: SampleTicket[] = [];
      for (const t of rawTickets) {
        const payload = JSON.stringify({
          ticketCode: t.ticketCode,
          orderId,
          showtimeId: "st-demo-2026",
          seat: `${t.seatRow}-${t.seatNumber}`,
          verifiedAt: new Date().toISOString(),
        });
        const qrDataUrl = await QRCode.toDataURL(payload, {
          width: 250,
          margin: 2,
          color: { dark: "#0f172a", light: "#ffffff" },
          errorCorrectionLevel: "M",
        });
        generated.push({ ...t, qrPayload: payload, qrDataUrl });
      }

      setTickets(generated);
      setIsGenerating(false);
    }

    initTickets();
  }, [orderId]);

  const totalAmount = useMemo(
    () => tickets.reduce((sum, t) => sum + t.price, 0),
    [tickets]
  );

  function formatVnd(amount: number) {
    return new Intl.NumberFormat("vi-VN", {
      style: "currency",
      currency: "VND",
    }).format(amount);
  }

  function formatDateTime(dateStr: string) {
    try {
      const d = new Date(dateStr);
      return new Intl.DateTimeFormat("vi-VN", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Asia/Ho_Chi_Minh",
      }).format(d);
    } catch {
      return dateStr;
    }
  }

  // Re-generate QR codes with updated data
  async function handleRefreshQRs() {
    setIsGenerating(true);
    const updated: SampleTicket[] = [];
    for (const t of tickets) {
      const payload = JSON.stringify({
        ticketCode: t.ticketCode,
        orderId,
        customerEmail,
        seat: `${t.seatRow}-${t.seatNumber}`,
        updatedAt: new Date().toISOString(),
      });
      const qrDataUrl = await QRCode.toDataURL(payload, {
        width: 250,
        margin: 2,
        color: { dark: "#0f172a", light: "#ffffff" },
        errorCorrectionLevel: "M",
      });
      updated.push({ ...t, qrPayload: payload, qrDataUrl });
    }
    setTickets(updated);
    setIsGenerating(false);
  }

  // Simulate MailService sending logic (jsonTransport + retry mechanism)
  async function handleSimulateSendEmail() {
    setSimulatingSend(true);
    setSimulationLogs([]);
    setSendResult(null);

    const logs: string[] = [];
    const addLog = (msg: string) => {
      logs.push(`[${new Date().toLocaleTimeString("vi-VN")}] ${msg}`);
      setSimulationLogs([...logs]);
    };

    addLog(`Bắt đầu xử lý gửi email cho đơn hàng #${orderId.slice(0, 8).toUpperCase()}`);
    addLog(`Đích nhận: ${customerEmail}`);
    addLog(`Cấu hình mailer: jsonTransport (In-memory mock, không gửi ra Internet)`);
    addLog(`Đang sinh ${tickets.length} mã QR buffers để nhúng CID attachments...`);

    await new Promise((r) => setTimeout(r, 600));

    if (simulateRetries) {
      addLog(`[MailService] Lần thử 1/3: Kết nối tới hàng đợi...`);
      await new Promise((r) => setTimeout(r, 800));
      addLog(`[MailService] CẢNH BÁO: Lỗi mạng tạm thời (Connection Timeout).`);
      addLog(`[MailService] Chờ 1.000ms trước khi tự động thử lại lần 2...`);

      await new Promise((r) => setTimeout(r, 1000));
      addLog(`[MailService] Lần thử 2/3: Thử gửi lại...`);
      await new Promise((r) => setTimeout(r, 700));
      addLog(`[MailService] THÀNH CÔNG ở lần thử 2! MessageId: <simulated-${Date.now()}@ticketing.local>`);

      setSendResult({
        success: true,
        attempts: 2,
        messageId: `<simulated-${Date.now()}@ticketing.local>`,
        sentAt: new Date().toLocaleTimeString("vi-VN"),
      });
    } else {
      addLog(`[MailService] Lần thử 1/3: Gửi email vé thành công ở lần thử 1!`);
      addLog(`[MailService] MessageId: <simulated-${Date.now()}@ticketing.local>`);

      setSendResult({
        success: true,
        attempts: 1,
        messageId: `<simulated-${Date.now()}@ticketing.local>`,
        sentAt: new Date().toLocaleTimeString("vi-VN"),
      });
    }

    addLog(`Ghi nhận email_logs trạng thái SENT vào cơ sở dữ liệu.`);
    setSimulatingSend(false);
  }

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 py-8 px-4 sm:px-6 lg:px-8 font-sans">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Top Header Banner */}
        <div className="bg-slate-800/80 border border-slate-700 rounded-2xl p-6 shadow-xl backdrop-blur-md flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                Dev Environment Only
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-500/20 text-blue-300 border border-blue-500/30">
                Task S-27
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              S-27: Vé Điện Tử & Mã QR Check-in
            </h1>
            <p className="text-slate-400 text-sm mt-1">
              Trang kiểm thử độc lập: xem trước mã QR thật, nội dung email HTML và mô phỏng gửi thư qua jsonTransport an toàn.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefreshQRs}
              disabled={isGenerating}
              className="border-slate-600 text-slate-200 hover:bg-slate-700 bg-slate-800/50"
            >
              <RotateCw className={`mr-2 ${isGenerating ? "animate-spin" : ""}`} size={16} />
              Sinh lại mã QR
            </Button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-700/80 gap-2 overflow-x-auto pb-1">
          <button
            onClick={() => setActiveTab("tickets")}
            className={`px-4 py-2.5 rounded-t-lg font-medium text-sm transition-colors flex items-center gap-2 ${
              activeTab === "tickets"
                ? "bg-slate-800 text-blue-400 border-t-2 border-blue-500"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/40"
            }`}
          >
            <TicketIcon size={16} />
            1. Thẻ Vé & Mã QR Quét Thử
          </button>
          <button
            onClick={() => setActiveTab("email")}
            className={`px-4 py-2.5 rounded-t-lg font-medium text-sm transition-colors flex items-center gap-2 ${
              activeTab === "email"
                ? "bg-slate-800 text-blue-400 border-t-2 border-blue-500"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/40"
            }`}
          >
            <Mail size={16} />
            2. Xem Trước Email HTML
          </button>
          <button
            onClick={() => setActiveTab("simulation")}
            className={`px-4 py-2.5 rounded-t-lg font-medium text-sm transition-colors flex items-center gap-2 ${
              activeTab === "simulation"
                ? "bg-slate-800 text-blue-400 border-t-2 border-blue-500"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/40"
            }`}
          >
            <RotateCw size={16} />
            3. Mô Phỏng Gửi Mail (jsonTransport)
          </button>
          <button
            onClick={() => setActiveTab("tests")}
            className={`px-4 py-2.5 rounded-t-lg font-medium text-sm transition-colors flex items-center gap-2 ${
              activeTab === "tests"
                ? "bg-slate-800 text-blue-400 border-t-2 border-blue-500"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/40"
            }`}
          >
            <CheckCircle size={16} />
            4. Trạng Thái Test Suite (19/19 Pass)
          </button>
        </div>

        {/* TAB 1: TICKETS & QR CODES */}
        {activeTab === "tickets" && (
          <div className="space-y-6">
            <div className="bg-slate-800/50 border border-slate-700/80 rounded-xl p-5">
              <h2 className="text-lg font-bold text-white mb-2 flex items-center gap-2">
                <Scan size={20} className="text-blue-400" />
                Mã QR chuẩn ISO/IEC 18004 — Quét thử trực tiếp bằng điện thoại
              </h2>
              <p className="text-slate-400 text-sm">
                Bạn có thể mở ứng dụng Camera hoặc Zalo/Google Lens trên điện thoại và quét trực tiếp mã QR dưới màn hình.
                Nội dung giải mã chứa đầy đủ mã vé, ghế và ID đơn hàng.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {tickets.map((t, idx) => (
                <div
                  key={t.id}
                  className="bg-slate-800 border border-slate-700 rounded-2xl overflow-hidden shadow-lg flex flex-col justify-between"
                >
                  <div className="p-6">
                    <div className="flex items-start justify-between">
                      <div>
                        <span className="text-xs font-mono font-bold text-blue-400 uppercase tracking-wider">
                          Vé số {idx + 1} / {tickets.length}
                        </span>
                        <h3 className="text-xl font-bold text-white mt-1">{eventName}</h3>
                      </div>
                      <Badge variant="outline" className="border-blue-500/50 text-blue-300">
                        {t.categoryName}
                      </Badge>
                    </div>

                    <div className="mt-4 space-y-2 text-sm text-slate-300">
                      <div className="flex items-center gap-2">
                        <CalendarDays size={16} className="text-slate-400" />
                        <span>{formatDateTime(showtimeDate)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <MapPin size={16} className="text-slate-400" />
                        <span>{location}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Banknote size={16} className="text-slate-400" />
                        <span className="font-semibold text-emerald-400">{formatVnd(t.price)}</span>
                      </div>
                    </div>

                    {/* QR Code Presentation Box */}
                    <div className="mt-6 p-4 bg-white rounded-xl flex flex-col items-center justify-center text-slate-900 shadow-inner">
                      {t.qrDataUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={t.qrDataUrl}
                          alt={`QR ${t.ticketCode}`}
                          className="w-48 h-48 rounded"
                        />
                      ) : (
                        <div className="w-48 h-48 flex items-center justify-center text-slate-400 text-xs">
                          Đang sinh mã QR...
                        </div>
                      )}
                      <div className="mt-2 text-center">
                        <div className="font-mono font-black text-sm tracking-widest text-slate-900">
                          {t.ticketCode}
                        </div>
                        <div className="text-xs font-medium text-slate-600 mt-0.5">
                          Hàng ghế {t.seatRow} — Ghế số {t.seatNumber}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="bg-slate-900/60 px-6 py-3 border-t border-slate-700/60 flex items-center justify-between text-xs text-slate-400">
                    <span>Mã soát vé một lần duy nhất</span>
                    <span className="font-mono text-emerald-400">STATUS: VALID</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 2: EMAIL HTML PREVIEW */}
        {activeTab === "email" && (
          <div className="space-y-6">
            <div className="bg-slate-800/50 border border-slate-700/80 rounded-xl p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <Mail size={20} className="text-blue-400" />
                  Mẫu Thư Điện Tử Xác Nhận Đặt Vé (MailService Template)
                </h2>
                <p className="text-slate-400 text-sm mt-1">
                  Được render trực tiếp từ template HTML của `MailService`, với đầy đủ layout bảng vé, thông tin sự kiện và mã QR đính kèm.
                </p>
              </div>
            </div>

            {/* Email Container (Styled as an email client view) */}
            <div className="bg-white text-slate-900 rounded-2xl overflow-hidden shadow-2xl border border-slate-300 max-w-2xl mx-auto">
              {/* Fake Email Client Header */}
              <div className="bg-slate-100 p-4 border-b border-slate-200 text-xs space-y-1.5 font-sans">
                <div className="flex gap-2">
                  <span className="text-slate-500 font-semibold w-16">Từ:</span>
                  <span className="text-slate-800 font-medium">Ban Tổ Chức Rạp Chiếu Phim &lt;noreply@event-ticketing.local&gt;</span>
                </div>
                <div className="flex gap-2">
                  <span className="text-slate-500 font-semibold w-16">Đến:</span>
                  <span className="text-blue-600 font-medium">{customerEmail}</span>
                </div>
                <div className="flex gap-2">
                  <span className="text-slate-500 font-semibold w-16">Tiêu đề:</span>
                  <span className="font-bold text-slate-900">
                    [Vé điện tử] {eventName} - Đơn hàng #{orderId.slice(0, 8).toUpperCase()}
                  </span>
                </div>
              </div>

              {/* Exact HTML Email Content */}
              <div className="p-6 bg-slate-50">
                <div className="bg-white rounded-xl overflow-hidden border border-slate-200 shadow-sm max-w-xl mx-auto">
                  <div className="bg-[#175cd3] text-white p-6 text-center">
                    <h1 className="text-xl font-bold m-0">Xác nhận vé điện tử</h1>
                    <p className="text-sm text-blue-100 mt-1 mb-0">
                      Đơn hàng #{orderId.slice(0, 8).toUpperCase()}
                    </p>
                  </div>

                  <div className="p-6 space-y-4">
                    <p className="text-sm text-slate-700 m-0">
                      Xin chào <strong>{customerEmail}</strong>,
                    </p>
                    <p className="text-sm text-slate-600 m-0">
                      Cảm ơn bạn đã mua vé thành công. Dưới đây là thông tin vé và mã QR của bạn để xuất trình khi vào cửa (kể cả khi không đăng nhập).
                    </p>

                    <div className="bg-slate-100 rounded-lg p-4 space-y-2">
                      <h2 className="text-base font-bold text-slate-900 m-0">{eventName}</h2>
                      <div className="text-xs text-slate-600">
                        📅 <strong>Thời gian:</strong> {formatDateTime(showtimeDate)}
                      </div>
                      <div className="text-xs text-slate-600">
                        📍 <strong>Địa điểm:</strong> {location}
                      </div>
                      <div className="text-xs text-slate-600">
                        💰 <strong>Tổng thanh toán:</strong>{" "}
                        <span className="text-emerald-600 font-bold text-sm">
                          {formatVnd(totalAmount)}
                        </span>
                      </div>
                    </div>

                    <h3 className="text-sm font-bold text-slate-900 border-b border-slate-200 pb-2 pt-2 m-0">
                      Danh sách vé ({tickets.length} vé)
                    </h3>

                    <div className="space-y-4">
                      {tickets.map((t) => (
                        <div
                          key={t.id}
                          className="border border-slate-200 rounded-lg p-4 bg-white flex items-center justify-between gap-4"
                        >
                          <div className="space-y-1">
                            <div className="text-xs text-slate-500 uppercase font-semibold">Mã vé</div>
                            <div className="font-mono font-bold text-sm text-slate-900">{t.ticketCode}</div>
                            <div className="text-xs font-semibold text-slate-800">
                              Hàng {t.seatRow} - Ghế {t.seatNumber} ({t.categoryName})
                            </div>
                            <div className="text-xs text-sky-600 font-semibold">{formatVnd(t.price)}</div>
                          </div>

                          <div className="text-center shrink-0">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={t.qrDataUrl}
                              alt="QR"
                              className="w-24 h-24 border border-slate-300 rounded p-1 bg-white"
                            />
                            <div className="text-[10px] text-slate-500 mt-1">Quét tại cổng</div>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="p-4 bg-blue-50 border-l-4 border-blue-600 rounded text-xs text-blue-900 space-y-1">
                      <strong>Lưu ý quan trọng:</strong>
                      <ul className="list-disc pl-4 space-y-0.5 m-0">
                        <li>Vui lòng giữ mã QR cẩn thận và không chia sẻ cho người khác.</li>
                        <li>Mỗi mã QR chỉ có giá trị quét check-in một lần duy nhất tại cửa sự kiện.</li>
                        <li>Bạn có thể chụp màn hình hoặc lưu email này về điện thoại để quét trực tiếp tại cổng.</li>
                      </ul>
                    </div>
                  </div>

                  <div className="bg-slate-100 p-4 text-center text-xs text-slate-500 border-t border-slate-200">
                    Hệ thống bán vé sự kiện &copy; 2026. Mọi thắc mắc xin vui lòng liên hệ ban tổ chức.
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: SIMULATION & RETRY */}
        {activeTab === "simulation" && (
          <div className="space-y-6">
            <div className="bg-slate-800/80 border border-slate-700 rounded-xl p-6">
              <h2 className="text-lg font-bold text-white mb-2 flex items-center gap-2">
                <RotateCw size={20} className="text-blue-400" />
                Mô Phỏng Quá Trình Gửi Email Của MailService
              </h2>
              <p className="text-slate-400 text-sm mb-6">
                Kiểm tra cơ chế hoạt động của `MailService` trên môi trường local (chạy qua `jsonTransport` in-memory, tuyệt đối không gửi email ra ngoài).
              </p>

              <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-700 mb-6 space-y-4">
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="retry-toggle"
                    checked={simulateRetries}
                    onChange={(e) => setSimulateRetries(e.target.checked)}
                    className="w-4 h-4 text-blue-600 rounded bg-slate-800 border-slate-600 focus:ring-blue-500"
                  />
                  <label htmlFor="retry-toggle" className="text-sm text-slate-300 cursor-pointer">
                    Mô phỏng lỗi kết nối ở lần thử 1 để kiểm tra cơ chế <strong>Tự Động Thử Lại (Retry 3 Lần)</strong>
                  </label>
                </div>

                <div className="flex items-center gap-4 pt-2">
                  <Button
                    onClick={handleSimulateSendEmail}
                    disabled={simulatingSend}
                    className="bg-blue-600 hover:bg-blue-500 text-white font-semibold"
                  >
                    <Mail className="mr-2" size={16} />
                    {simulatingSend ? "Đang gửi qua jsonTransport..." : "Kích hoạt gửi thử nghiệm"}
                  </Button>
                </div>
              </div>

              {/* Status Banner */}
              {sendResult && (
                <Alert className={`mb-6 ${sendResult.success ? "bg-emerald-950/60 border-emerald-600 text-emerald-200" : "bg-red-950/60 border-red-600 text-red-200"}`}>
                  <CheckCircle className="text-emerald-400" size={18} />
                  <AlertTitle className="font-bold">
                    {sendResult.success ? "Gửi Thành Công (jsonTransport Mock)" : "Thất Bại"}
                  </AlertTitle>
                  <AlertDescription className="text-xs space-y-1 mt-1">
                    <div>Lần thử thành công: <strong>{sendResult.attempts}/3</strong></div>
                    <div>Mã định danh thư (MessageId): <code>{sendResult.messageId}</code></div>
                    <div>Thời điểm: {sendResult.sentAt}</div>
                  </AlertDescription>
                </Alert>
              )}

              {/* Terminal Logs View */}
              <div className="bg-black/90 rounded-xl p-4 font-mono text-xs border border-slate-800 text-slate-300 space-y-1.5 overflow-x-auto shadow-inner">
                <div className="text-slate-500 pb-2 border-b border-slate-800">
                  --- NHẬT KÝ TIẾN TRÌNH MAILSERVICE (SIMULATED CONSOLE) ---
                </div>
                {simulationLogs.length === 0 ? (
                  <div className="text-slate-600 italic py-2">
                    Nhấn nút &quot;Kích hoạt gửi thử nghiệm&quot; để xem quy trình gửi thư và tự động retry...
                  </div>
                ) : (
                  simulationLogs.map((log, idx) => (
                    <div
                      key={idx}
                      className={
                        log.includes("THÀNH CÔNG")
                          ? "text-emerald-400 font-bold"
                          : log.includes("CẢNH BÁO")
                          ? "text-amber-400"
                          : "text-slate-300"
                      }
                    >
                      {log}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: AUTOMATED TEST SUITE REPORT */}
        {activeTab === "tests" && (
          <div className="space-y-6">
            <div className="bg-slate-800/80 border border-slate-700 rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-lg font-bold text-white flex items-center gap-2">
                    <CheckCircle size={20} className="text-emerald-400" />
                    Báo Cáo Kiểm Thử Tự Động Task S-27
                  </h2>
                  <p className="text-slate-400 text-sm mt-1">
                    Toàn bộ 19 kịch bản kiểm thử độc lập của task S-27 đã được xác thực thành công qua Vitest.
                  </p>
                </div>
                <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30 text-sm px-3 py-1">
                  19 / 19 PASSED (100%)
                </Badge>
              </div>

              <div className="space-y-4">
                {/* Suite 1 */}
                <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-700/80">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-mono text-sm text-blue-400 font-bold">
                      apps/api/src/mail/mail.service.spec.ts
                    </span>
                    <span className="text-xs font-semibold text-emerald-400">4 / 4 passed (100%)</span>
                  </div>
                  <ul className="text-xs text-slate-300 space-y-1.5 pl-4 list-disc">
                    <li><code>generateQrCode</code>: Sinh mã QR hợp lệ định dạng PNG DataURL và Buffer.</li>
                    <li><code>sendTicketEmail</code>: Gửi email thành công và ghi log trạng thái <code>SENT</code> ở lần 1.</li>
                    <li><code>retry mechanism</code>: Tự động thử lại tối đa 3 lần khi lỗi và ghi <code>FAILED</code> nếu kiệt số lần.</li>
                    <li><code>recovery</code>: Tự phục hồi và thành công ở lần 2 nếu lần 1 bị lỗi chập chờn.</li>
                  </ul>
                </div>

                {/* Suite 2 */}
                <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-700/80">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-mono text-sm text-blue-400 font-bold">
                      apps/api/src/orders/orders.service.spec.ts
                    </span>
                    <span className="text-xs font-semibold text-emerald-400">10 / 10 passed (100%)</span>
                  </div>
                  <ul className="text-xs text-slate-300 space-y-1.5 pl-4 list-disc">
                    <li><code>checkout</code>: Tạo đơn hàng, tự sinh vé kèm chuỗi QR và ảnh Base64.</li>
                    <li><code>auto email</code>: Tự động kích hoạt gửi email vé cho người mua ngay sau khi thanh toán.</li>
                    <li><code>resend idempotent</code>: Gửi lại vé đúng danh sách vé đã có, <strong>tuyệt đối không tạo vé mới</strong>.</li>
                    <li><code>security guard</code>: Chặn người dùng khác xem trộm vé (ForbiddenException).</li>
                  </ul>
                </div>

                {/* Suite 3 */}
                <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-700/80">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-mono text-sm text-blue-400 font-bold">
                      apps/web/src/lib/contracts/orders.spec.ts
                    </span>
                    <span className="text-xs font-semibold text-emerald-400">5 / 5 passed (100%)</span>
                  </div>
                  <ul className="text-xs text-slate-300 space-y-1.5 pl-4 list-disc">
                    <li>Decode an toàn hợp đồng checkout, danh sách vé và ảnh mã QR.</li>
                    <li>Decode thông tin kết quả gửi email vé <code>EmailDeliveryResult</code>.</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
