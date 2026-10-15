"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle,
  CircleAlert,
  RotateCw,
  Info,
} from "@/components/ui/material-icon";
import { formatVnd } from "@/lib/formatting";
import { api } from "@/lib/api/client";

export interface MockGatewayPaymentProps {
  orderId: string;
  amount: number;
  gatewayRef: string;
  returnUrl: string;
}

export function MockGatewayPayment({
  orderId,
  amount,
  gatewayRef,
  returnUrl,
}: MockGatewayPaymentProps) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string>("");

  async function handleOutcome(outcome: "SUCCESS" | "FAILED") {
    if (submitting) return;
    setSubmitting(true);
    setError("");

    try {
      const res = await api<{ success: boolean; redirectUrl: string }>(
        "/mock-gateway/submit",
        (data) => data as { success: boolean; redirectUrl: string },
        {
          method: "POST",
          body: {
            orderId,
            amount,
            gatewayRef,
            returnUrl,
            outcome,
          },
        },
      );

      const target = res?.redirectUrl || returnUrl;
      if (target.startsWith("http://") || target.startsWith("https://")) {
        window.location.href = target;
      } else {
        router.push(target);
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Không thể gửi kết quả thanh toán giả lập.",
      );
      setSubmitting(false);
    }
  }

  return (
    <div className="order-review-container">
      <div className="order-review-card">
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
          <div>
            <h1 style={{ fontSize: "1.5rem", fontWeight: 700, margin: 0 }}>
              Cổng thanh toán giả lập
            </h1>
            <p style={{ margin: "0.25rem 0 0", color: "var(--color-text-secondary, #64748b)", fontSize: "0.875rem" }}>
              Mô phỏng quy trình thanh toán MoMo Sandbox (S-19)
            </p>
          </div>
          <Badge variant="outline" style={{ background: "rgba(245, 158, 11, 0.1)", color: "#d97706", borderColor: "rgba(245, 158, 11, 0.3)" }}>
            Môi trường Dev / Test
          </Badge>
        </div>

        {/* Info notice */}
        <Alert style={{ marginBottom: "1.5rem" }}>
          <Info className="h-4 w-4" />
          <AlertTitle>Chế độ giả lập thanh toán</AlertTitle>
          <AlertDescription>
            Cổng này được kích hoạt khi cấu hình hệ thống bật <code>PAYMENT_GATEWAY=mock</code>. Bạn có thể chọn mô phỏng giao dịch thành công hoặc thất bại để kiểm thử luồng IPN webhook và cập nhật đơn hàng.
          </AlertDescription>
        </Alert>

        {error && (
          <Alert variant="destructive" style={{ marginBottom: "1.5rem" }}>
            <CircleAlert className="h-4 w-4" />
            <AlertTitle>Lỗi xử lý</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Order details table / box */}
        <div
          style={{
            background: "var(--color-bg-subtle, #f8fafc)",
            border: "1px solid var(--color-border, #e2e8f0)",
            borderRadius: "0.5rem",
            padding: "1.25rem",
            marginBottom: "1.5rem",
          }}
        >
          <div style={{ display: "grid", gridTemplateColumns: "140px 1fr", rowGap: "0.75rem", fontSize: "0.9375rem" }}>
            <span style={{ color: "var(--color-text-secondary, #64748b)" }}>Mã đơn hàng:</span>
            <span style={{ fontFamily: "monospace", fontWeight: 600 }}>{orderId || "—"}</span>

            <span style={{ color: "var(--color-text-secondary, #64748b)" }}>Mã tham chiếu:</span>
            <span style={{ fontFamily: "monospace", fontSize: "0.875rem" }}>{gatewayRef || "—"}</span>

            <span style={{ color: "var(--color-text-secondary, #64748b)" }}>Số tiền:</span>
            <span style={{ fontSize: "1.25rem", fontWeight: 700, color: "var(--color-primary, #0f172a)" }}>
              {formatVnd(amount)}
            </span>
          </div>
        </div>

        {/* Action buttons */}
        <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", marginTop: "2rem" }}>
          <Button
            type="button"
            disabled={submitting}
            onClick={() => handleOutcome("SUCCESS")}
            style={{
              flex: 1,
              minWidth: "200px",
              background: "#16a34a",
              color: "#ffffff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "0.5rem",
              padding: "0.75rem 1.5rem",
              fontSize: "1rem",
              fontWeight: 600,
            }}
          >
            {submitting ? <RotateCw className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
            Thanh toán thành công
          </Button>

          <Button
            type="button"
            variant="outline"
            disabled={submitting}
            onClick={() => handleOutcome("FAILED")}
            style={{
              flex: 1,
              minWidth: "200px",
              borderColor: "#ef4444",
              color: "#dc2626",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "0.5rem",
              padding: "0.75rem 1.5rem",
              fontSize: "1rem",
              fontWeight: 600,
            }}
          >
            {submitting ? <RotateCw className="h-4 w-4 animate-spin" /> : <CircleAlert className="h-4 w-4" />}
            Thanh toán thất bại
          </Button>
        </div>
      </div>
    </div>
  );
}
