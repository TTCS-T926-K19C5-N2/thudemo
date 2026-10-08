"use client";
import { useRef, useState } from "react";
import { ApiError, api } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { checkInWithWaiting } from "./check-in-request";
import { decodeCheckIn, type CheckInResult } from "./admission-response";

export function AdmissionOverride({
  showtimeId,
  gateId,
  ticketId,
  onRecorded,
}: {
  showtimeId: string;
  gateId: string;
  ticketId: string;
  onRecorded: (result: CheckInResult) => void;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const busy = useRef(false);
  const action = useRef<{ requestId: string; reason: string } | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const invalid = submitted && (!reason.trim() || !confirmed);
  async function submit() {
    if (busy.current) return;
    setSubmitted(true);
    if (!reason.trim() || reason.length > 500 || !confirmed) {
      setMessage(
        "Xác nhận đã kiểm tra chủ vé và nhập lý do từ 1 đến 500 ký tự.",
      );
      return;
    }
    busy.current = true;
    setPending(true);
    setMessage("Đang ghi nhận ngoại lệ...");
    const command = action.current ?? {
      requestId: crypto.randomUUID(),
      reason: reason.trim(),
    };
    action.current = command;
    setRetrying(true);
    try {
      const result = await checkInWithWaiting(
        (signal) =>
          api(
            `/showtimes/${encodeURIComponent(showtimeId)}/check-in/exception`,
            decodeCheckIn,
            {
              method: "POST",
              body: {
                ticketId,
                gateId,
                requestId: command.requestId,
                reason: command.reason,
                ownerConfirmed: true,
              },
              signal,
            },
          ),
        () => setMessage("Đang chờ phản hồi từ máy chủ..."),
        new AbortController().signal,
      );
      onRecorded(result);
      setOpen(false);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Chưa nhận được kết quả. Hãy thử lại cùng yêu cầu.",
      );
      // A definitive business rejection has not committed. Network/invalid responses keep the exact action for retry.
      if (
        error instanceof ApiError &&
        error.status >= 400 &&
        error.status < 500
      ) {
        action.current = null;
        setRetrying(false);
      }
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!busy.current) setOpen(next);
      }}
    >
      <DialogTrigger asChild>
        <Button ref={trigger} variant="outline">
          Cho vào có ghi chú
        </Button>
      </DialogTrigger>
      <DialogContent
        showCloseButton={!pending}
        className="max-h-[90dvh] overflow-y-auto [&_button]:min-h-11"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          (trigger.current ?? document.getElementById("scan-next"))?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>Cho vào có ghi chú</DialogTitle>
          <DialogDescription>
            Chỉ tiếp tục sau khi nhân viên đã xác nhận khách là chủ vé thật. Lần
            vào trước vẫn được giữ trong lịch sử.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
          className="flex flex-col gap-4"
        >
          <FieldGroup>
            <Field data-invalid={invalid} data-disabled={pending || retrying}>
              <FieldLabel htmlFor="admission-reason">
                Lý do cho vào lại
              </FieldLabel>
              <Textarea
                id="admission-reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                maxLength={500}
                aria-invalid={invalid}
                aria-describedby="override-message"
                disabled={pending || retrying}
              />
            </Field>
            <Field data-invalid={invalid} orientation="horizontal">
              <input
                id="owner-confirmed"
                type="checkbox"
                checked={confirmed}
                onChange={(event) => setConfirmed(event.target.checked)}
                disabled={pending || retrying}
                aria-invalid={invalid}
                className="size-5 accent-primary"
              />
              <FieldLabel htmlFor="owner-confirmed">
                Tôi đã xác nhận khách là chủ vé thật
              </FieldLabel>
            </Field>
          </FieldGroup>
          <p id="override-message" role="status" aria-live="polite">
            {message}
          </p>
          {retrying && !pending && (
            <p className="text-sm text-muted-foreground">
              Kết quả chưa rõ. Thử lại sẽ gửi cùng yêu cầu và không tạo thêm lần
              vào.
            </p>
          )}
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => setOpen(false)}
            >
              Đóng
            </Button>
            <Button type="submit" disabled={pending}>
              {pending
                ? "Đang ghi nhận..."
                : retrying
                  ? "Thử lại cùng yêu cầu"
                  : "Xác nhận cho vào"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
