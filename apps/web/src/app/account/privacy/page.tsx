"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { PublicLayout } from "@/components/layout/product-layout";
import { Button } from "@/components/ui/button";
import { api, object } from "@/lib/api/client";
type State = {
  version: string;
  text: string;
  requiresAcceptance: boolean;
  marketing: boolean;
  marketingEnabled: boolean;
  erasure: { status: string } | null;
};
export default function PrivacyPage() {
  const [state, setState] = useState<State | null>(null),
    [agree, setAgree] = useState(false),
    [erase, setErase] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  async function load() {
    setState(await api("/privacy/me", (v) => object(v) as unknown as State));
  }
  useEffect(() => {
    const controller = new AbortController();
    void api("/privacy/me", (v) => object(v) as unknown as State, {
      signal: controller.signal,
    })
      .then(setState)
      .catch((e) => {
        if (!controller.signal.aborted)
          setError(
            e instanceof Error ? e.message : "Không tải được thông tin.",
          );
      });
    return () => controller.abort();
  }, []);
  async function change(path: string, body: unknown) {
    if (busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await api(path, object, { method: "POST", body });
      await load();
      setMessage("Đã cập nhật lựa chọn của bạn.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Chưa cập nhật được.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <PublicLayout>
      <div className="operations-page">
        <h1>Quyền riêng tư và lựa chọn của bạn</h1>
        <Link href="/account">Về tài khoản</Link>
        {!state && !error && <p role="status">Đang tải…</p>}
        {error && <p role="alert">{error}</p>}
        {message && <p role="status">{message}</p>}
        {state && (
          <>
            <section className="operations-panel">
              <h2>Thông báo xử lý dữ liệu · {state.version}</h2>
              {state.text.split("\n\n").map((paragraph, index) => (
                <p key={index}>{paragraph}</p>
              ))}
              <p>
                {state.requiresAcceptance
                  ? "Có phiên bản mới cần bạn xác nhận trước khi tiếp tục."
                  : "Bạn có thể xem và cập nhật lựa chọn tại đây."}
              </p>
              <label className="flex gap-2">
                <input
                  type="checkbox"
                  checked={agree}
                  onChange={(e) => setAgree(e.target.checked)}
                  disabled={busy}
                />
                Tôi đã đọc và đồng ý phiên bản thông báo trên.
              </label>
              <Button
                disabled={!agree || busy}
                onClick={() =>
                  void change("/privacy/consent", {
                    version: state.version,
                    purpose: "SERVICE",
                    granted: true,
                  })
                }
              >
                Xác nhận phiên bản
              </Button>
            </section>
            <section className="operations-panel">
              <h2>Thông tin tiếp thị</h2>
              <p>
                {state.marketing
                  ? "Đã cho phép tiếp thị."
                  : "Không cho phép tiếp thị."}{" "}
                Rút đồng ý tiếp thị không tắt thư kích hoạt và thư vé cần cho
                giao dịch.
              </p>
              <Button
                disabled={busy || (!state.marketing && !state.marketingEnabled)}
                variant="outline"
                onClick={() =>
                  void change("/privacy/consent", {
                    version: state.version,
                    purpose: "MARKETING",
                    granted: !state.marketing,
                  })
                }
              >
                {state.marketing
                  ? "Rút đồng ý tiếp thị"
                  : state.marketingEnabled
                    ? "Cho phép nhận thông tin tiếp thị"
                    : "Hiện không sử dụng dữ liệu cho tiếp thị"}
              </Button>
            </section>
            <section className="operations-panel">
              <h2>Yêu cầu xoá dữ liệu cá nhân</h2>
              <p>
                Sau khi quản trị phê duyệt, thông tin cá nhân được ẩn danh và
                tài khoản không đăng nhập được. Đơn hàng, thanh toán và số liệu
                doanh thu được giữ. Backup hết hạn theo quy trình lưu trữ riêng.
              </p>
              {state.erasure ? (
                <p role="status">Trạng thái: {state.erasure.status}</p>
              ) : (
                <>
                  <label className="flex gap-2">
                    <input
                      type="checkbox"
                      checked={erase}
                      onChange={(e) => setErase(e.target.checked)}
                      disabled={busy}
                    />
                    Tôi muốn gửi yêu cầu để quản trị xem xét.
                  </label>
                  <Button
                    variant="destructive"
                    disabled={!erase || busy}
                    onClick={() => void change("/privacy/erasure", {})}
                  >
                    Gửi yêu cầu xoá dữ liệu
                  </Button>
                </>
              )}
            </section>
          </>
        )}
      </div>
    </PublicLayout>
  );
}
