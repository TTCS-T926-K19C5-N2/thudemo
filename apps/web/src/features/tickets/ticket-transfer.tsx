"use client";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { transferTicket } from "./order-tickets-api";

export function TicketTransfer({
  orderId,
  ticketId,
  onTransferred,
}: {
  orderId: string;
  ticketId: string;
  onTransferred: () => void;
}) {
  const id = useId();
  const [open, setOpen] = useState(false),
    [email, setEmail] = useState("");
  const [pending, setPending] = useState(false),
    [error, setError] = useState("");
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError("");
    try {
      await transferTicket(orderId, ticketId, email.trim());
      setOpen(false);
      setEmail("");
      onTransferred();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Chưa chuyển nhượng được. Hãy thử lại.",
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!pending) {
          setOpen(value);
          setError("");
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline">Chuyển nhượng vé</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Chuyển vé cho người khác</DialogTitle>
          <DialogDescription>
            QR hiện tại sẽ hết hiệu lực. Người nhận đăng nhập bằng email bên
            dưới để xem vé mới trong “Vé của tôi”.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={submit}
          className="flex flex-col gap-4"
          aria-busy={pending}
        >
          <Label htmlFor={id}>Email người nhận</Label>
          <Input
            id={id}
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            disabled={pending}
          />
          {error && (
            <p role="alert" className="text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => setOpen(false)}
            >
              Quay lại
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Đang chuyển vé…" : "Xác nhận chuyển vé"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
