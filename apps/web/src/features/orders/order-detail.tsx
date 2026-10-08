"use client";

import Link from "next/link";
import { PublicLayout } from "@/components/layout/product-layout";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  decodeOrderDetail,
  detailDeadline,
} from "@/lib/contracts/order-history";
import { formatShowtime, formatVnd } from "@/lib/formatting";
import { useOrderRead } from "./use-order-read";
import { OrderBadge } from "./order-badge";
import { OrderError, OrderLoading } from "./order-feedback";
import { OrderPaymentAction } from "./order-payment-action";

export function OrderDetail({
  id,
  page,
  onPay,
}: {
  id: string;
  page: number;
  onPay?: () => void;
}) {
  const path = `/orders/${id}`;
  const { value, error, retry } = useOrderRead(
    path,
    decodeOrderDetail,
    detailDeadline,
  );
  const order = value?.order;
  return (
    <PublicLayout signedIn={!!value}>
      <div className="operations-page account-page order-page">
        <Button variant="link" asChild>
          <Link href={`/orders?page=${page}`}>← Đơn hàng của tôi</Link>
        </Button>
        <header className="page-heading">
          <div>
            <h1>Chi tiết đơn hàng</h1>
          </div>
        </header>
        {error ? (
          <OrderError
            error={error}
            returnTo={`${path}?page=${page}`}
            retry={retry}
          />
        ) : !order ? (
          <OrderLoading detail />
        ) : (
          <>
            <section className="operations-panel">
              <div className="order-card-heading">
                <h2 className="order-code">{order.code}</h2>
                <OrderBadge status={order.status} />
              </div>
              <h2>{order.showtime.event.name}</h2>
              <dl className="order-facts">
                <div>
                  <dt>Suất diễn</dt>
                  <dd>{formatShowtime(order.showtime.startTime)}</dd>
                </div>
                <div>
                  <dt>Địa điểm</dt>
                  <dd>{order.showtime.event.location}</dd>
                </div>
                <div>
                  <dt>Thời gian đặt</dt>
                  <dd>{formatShowtime(order.createdAt, "short")}</dd>
                </div>
                <div>
                  <dt>Số ghế</dt>
                  <dd>{order.seatCount}</dd>
                </div>
                <div>
                  <dt>Tổng tiền</dt>
                  <dd className="order-money">
                    {formatVnd(order.totalAmount)}
                  </dd>
                </div>
              </dl>
              {(order.status === "PENDING_PAYMENT" ||
                order.status === "PENDING") &&
                value && (
                  <OrderPaymentAction
                    key={order.id}
                    order={order}
                    serverTime={value.serverTime}
                    onPay={onPay}
                  />
                )}
              {order.status === "EXPIRED" && (
                <p>
                  Đơn đã hết hạn. Thông tin đặt vé vẫn được lưu để bạn tra cứu.
                </p>
              )}
              {order.status === "CANCELLED" && (
                <p>Đơn đã hủy. Thông tin đặt vé vẫn được lưu để bạn tra cứu.</p>
              )}
            </section>
            <section className="operations-panel order-seat-panel">
              <h2>Ghế đã đặt</h2>
              <Table>
                <TableCaption className="sr-only">
                  Giá từng ghế tại thời điểm đặt đơn
                </TableCaption>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ghế</TableHead>
                    <TableHead>Hạng ghế</TableHead>
                    <TableHead>Giá khi đặt</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {order.items.map((item) => (
                    <TableRow key={item.seatId}>
                      <TableCell>
                        {item.row}
                        {item.seatNumber}
                      </TableCell>
                      <TableCell>{item.categoryName}</TableCell>
                      <TableCell className="order-money">
                        {formatVnd(item.unitPrice)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </section>
          </>
        )}
      </div>
    </PublicLayout>
  );
}
