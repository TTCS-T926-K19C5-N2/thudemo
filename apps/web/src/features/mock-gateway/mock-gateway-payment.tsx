"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  CheckCircle,
  CircleAlert,
  RotateCw,
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
          : "Không thể xử lý thanh toán. Vui lòng thử lại.",
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
              Thanh toán đơn hàng
            </h1>
            <p style={{ margin: "0.25rem 0 0", color: "var(--color-text-secondary, #64748b)", fontSize: "0.875rem" }}>
              Kiểm tra thông tin và hoàn tất thanh toán
            </p>
          </div>
        </div>

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
            Hoàn tất thanh toán
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
            Hủy giao dịch
          </Button>
        </div>
      </div>
    </div>
  );
}
