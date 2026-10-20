"use client";

import { useEffect, useState } from "react";
import { api, object } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export interface UserConsentItem {
  type: string;
  title: string;
  version: string | null;
  activeVersion: string;
  status: string;
  mandatory: boolean;
  consentedAt: string | null;
  revokedAt: string | null;
  needsReconsent: boolean;
}

export interface ConsentStatusData {
  consents: UserConsentItem[];
  pendingPolicies: Array<{
    type: string;
    title: string;
    requiredVersion: string;
    currentVersion: string | null;
    mandatory: boolean;
  }>;
  needsReconsent: boolean;
}

export interface ConsentHistoryItem {
  id: string;
  type: string;
  version: string;
  action: string;
  ipAddress: string | null;
  createdAt: string;
}

export function ConsentManagement() {
  const [data, setData] = useState<ConsentStatusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [pendingAction, setPendingAction] = useState(false);

  const [history, setHistory] = useState<ConsentHistoryItem[] | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);

  function loadStatus() {
    return api("/users/consents/status", (raw) => raw as ConsentStatusData)
      .then((res) => {
        setData(res);
        setError("");
      })
      .catch((err) => {
        setError(
          err instanceof Error
            ? err.message
            : "Chưa tải được thông tin đồng ý điều khoản.",
        );
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    void loadStatus();
  }, []);

  async function handleAgree(
    policies: Array<{ type: string; version: string }>,
  ) {
    if (pendingAction) return;
    setPendingAction(true);
    setActionMessage("");
    setError("");
    try {
      await api("/users/consents/agree", object, {
        method: "POST",
        body: { policies },
      });
      setActionMessage("Đã cập nhật đồng ý điều khoản thành công.");
      await loadStatus();
      if (showHistory) void loadHistory();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Chưa cập nhật được sự đồng ý.",
      );
    } finally {
      setPendingAction(false);
    }
  }

  async function handleRevoke(type: string) {
    if (pendingAction) return;
    setPendingAction(true);
    setActionMessage("");
    setError("");
    try {
      await api("/users/consents/revoke", object, {
        method: "POST",
        body: { type },
      });
      setActionMessage("Đã thu hồi sự đồng ý thành công.");
      await loadStatus();
      if (showHistory) void loadHistory();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Chưa thể thu hồi sự đồng ý.",
      );
    } finally {
      setPendingAction(false);
    }
  }

  async function loadHistory() {
    setLoadingHistory(true);
    try {
      const res = await api(
        "/users/consents/history",
        (raw) => raw as ConsentHistoryItem[],
      );
      setHistory(res);
    } catch {
      /* ignore history fetch error */
    } finally {
      setLoadingHistory(false);
    }
  }

  function toggleHistory() {
    if (!showHistory && !history) {
      void loadHistory();
    }
    setShowHistory((prev) => !prev);
  }

  if (loading) {
    return (
      <section className="operations-panel" role="status">
        <Skeleton className="h-32 w-full" />
      </section>
    );
  }

  return (
    <section className="operations-panel consent-management-panel">
      <h2>Quyền riêng tư & Điều khoản</h2>
      <p>
        Quản lý sự đồng ý với các điều khoản dịch vụ, chính sách quyền riêng tư
        và quyền nhận thông tin tiếp thị qua email.
      </p>

      {error && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {actionMessage && (
        <Alert role="status">
          <AlertDescription>{actionMessage}</AlertDescription>
        </Alert>
      )}

      {data?.needsReconsent && (
        <Alert
          variant="destructive"
          role="region"
          aria-label="Cần đồng ý điều khoản mới"
        >
          <AlertDescription>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              <p>
                <strong>Thông báo cập nhật:</strong> Có chính sách hoặc điều khoản
                đã được cập nhật phiên bản mới. Vui lòng xác nhận để tiếp tục sử
                dụng đầy đủ dịch vụ:
              </p>
              <ul>
                {data.pendingPolicies.map((p) => (
                  <li key={p.type}>
                    {p.title} (Phiên bản mới: <code>{p.requiredVersion}</code>
                    {p.currentVersion ? `, bạn đang ở: ${p.currentVersion}` : ""})
                  </li>
                ))}
              </ul>
              <div>
                <Button
                  size="sm"
                  disabled={pendingAction}
                  onClick={() =>
                    handleAgree(
                      data.pendingPolicies.map((p) => ({
                        type: p.type,
                        version: p.requiredVersion,
                      })),
                    )
                  }
                >
                  {pendingAction ? "Đang xử lý…" : "Đồng ý các phiên bản mới"}
                </Button>
              </div>
            </div>
          </AlertDescription>
        </Alert>
      )}

      <div style={{ overflowX: "auto", margin: "1rem 0" }}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Loại điều khoản / chính sách</TableHead>
              <TableHead>Phiên bản</TableHead>
              <TableHead>Trạng thái</TableHead>
              <TableHead>Thời điểm ghi nhận</TableHead>
              <TableHead>Thao tác</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data?.consents.map((item) => {
              const isGranted = item.status === "GRANTED";
              const isMarketing = item.type === "MARKETING_EMAIL";

              return (
                <TableRow key={item.type}>
                  <TableCell>
                    <strong>{item.title}</strong>
                    {item.mandatory && (
                      <span
                        style={{
                          fontSize: "0.75rem",
                          color: "#667085",
                          marginLeft: "0.5rem",
                        }}
                      >
                        (Bắt buộc)
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <code>{item.version ?? item.activeVersion}</code>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        isGranted
                          ? "default"
                          : item.status === "REVOKED"
                            ? "destructive"
                            : "outline"
                      }
                    >
                      {isGranted
                        ? "Đã đồng ý"
                        : item.status === "REVOKED"
                          ? "Đã thu hồi"
                          : "Chưa thiết lập"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {item.consentedAt
                      ? new Date(item.consentedAt).toLocaleString("vi-VN")
                      : "—"}
                  </TableCell>
                  <TableCell>
                    {isMarketing && (
                      <Button
                        size="sm"
                        variant={isGranted ? "outline" : "default"}
                        disabled={pendingAction}
                        onClick={() =>
                          isGranted
                            ? handleRevoke(item.type)
                            : handleAgree([
                                { type: item.type, version: item.activeVersion },
                              ])
                        }
                      >
                        {isGranted ? "Thu hồi quyền" : "Đồng ý nhận email"}
                      </Button>
                    )}
                    {!isMarketing && item.needsReconsent && (
                      <Button
                        size="sm"
                        disabled={pendingAction}
                        onClick={() =>
                          handleAgree([
                            { type: item.type, version: item.activeVersion },
                          ])
                        }
                      >
                        Đồng ý bản mới
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <div style={{ marginTop: "1rem" }}>
        <Button
          variant="outline"
          size="sm"
          onClick={toggleHistory}
          disabled={loadingHistory}
        >
          {showHistory
            ? "Ẩn lịch sử thay đổi"
            : "Xem lịch sử thay đổi đồng ý (Audit Log)"}
        </Button>
      </div>

      {showHistory && (
        <div style={{ marginTop: "1rem" }}>
          <h3>Lịch sử thay đổi đồng ý</h3>
          {loadingHistory && <Skeleton className="h-20 w-full" />}
          {history && history.length === 0 && (
            <p style={{ color: "#667085" }}>Chưa có bản ghi lịch sử nào.</p>
          )}
          {history && history.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Thời gian</TableHead>
                  <TableHead>Loại</TableHead>
                  <TableHead>Phiên bản</TableHead>
                  <TableHead>Hành động</TableHead>
                  <TableHead>Địa chỉ IP</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((h) => (
                  <TableRow key={h.id}>
                    <TableCell>
                      {new Date(h.createdAt).toLocaleString("vi-VN")}
                    </TableCell>
                    <TableCell>{h.type}</TableCell>
                    <TableCell>
                      <code>{h.version}</code>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          h.action === "GRANTED" ? "default" : "destructive"
                        }
                      >
                        {h.action === "GRANTED" ? "Đồng ý" : "Thu hồi"}
                      </Badge>
                    </TableCell>
                    <TableCell>{h.ipAddress ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      )}
    </section>
  );
}
