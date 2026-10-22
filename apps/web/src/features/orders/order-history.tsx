"use client";

import Link from "next/link";
import { PublicLayout } from "@/components/layout/product-layout";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableCell,
  TableRow,
  TableCaption,
} from "@/components/ui/table";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import {
  decodeOrderHistory,
  historyDeadline,
  type OrderSummary,
} from "@/lib/contracts/order-history";
import { formatVnd, formatShowtime } from "@/lib/formatting";
import { useOrderRead } from "./use-order-read";
import { OrderBadge } from "./order-badge";
import { OrderLoading, OrderError } from "./order-feedback";

function DetailLink({ order, page }: { order: OrderSummary; page: number }) {
  return (
    <Button variant="outline" size="sm" asChild>
      <Link
        href={`/orders/${order.id}?page=${page}`}
        aria-label={`Xem chi tiết đơn ${order.code}`}
      >
        Xem chi tiết
      </Link>
    </Button>
  );
}

export function OrderHistory({ page }: { page: number | null }) {
  // Invalid URLs do not query an arbitrary page; the API also validates direct requests.
  return page === null ? (
    <PublicLayout>
      <div className="operations-page account-page">
        <h1>Đơn hàng của tôi</h1>
        <Alert>
          <AlertTitle>Trang không hợp lệ</AlertTitle>
          <AlertDescription>
            <Link href="/orders">Về trang đầu của lịch sử đơn hàng</Link>
          </AlertDescription>
        </Alert>
      </div>
    </PublicLayout>
  ) : (
    <HistoryPage page={page} />
  );
}

function HistoryPage({ page }: { page: number }) {
  const { value, error, retry } = useOrderRead(
    `/orders/me?page=${page}`,
    decodeOrderHistory,
    historyDeadline,
  );
  return (
    <PublicLayout signedIn={!!value}>
      <div className="operations-page account-page order-page">
        <header className="page-heading">
          <div>
            <h1>Đơn hàng của tôi</h1>
            <p>Tra cứu các đơn đã đặt và trạng thái hiện tại.</p>
          </div>
        </header>
        {error ? (
          <OrderError
            error={error}
            returnTo={`/orders?page=${page}`}
            retry={retry}
          />
        ) : !value ? (
          <OrderLoading />
        ) : (
          <>
            {value.pagination.total === 0 ? (
              <Alert>
                <AlertTitle>Bạn chưa có đơn hàng</AlertTitle>
                <AlertDescription>
                  <p>Các đơn đã đặt sẽ xuất hiện tại đây.</p>
                  <Button asChild>
                    <Link href="/">Khám phá sự kiện</Link>
                  </Button>
                </AlertDescription>
              </Alert>
            ) : value.orders.length === 0 ? (
              <Alert>
                <AlertTitle>Trang này không có đơn hàng</AlertTitle>
                <AlertDescription>
                  <p>Lịch sử hiện có {value.pagination.totalPages} trang.</p>
                  <Button asChild variant="outline">
                    <Link href={`/orders?page=${value.pagination.totalPages}`}>
                      Về trang cuối có đơn
                    </Link>
                  </Button>
                </AlertDescription>
              </Alert>
            ) : (
              <>
                <div className="operations-panel order-table">
                  <Table>
                    <TableCaption className="sr-only">
                      Các đơn đã đặt, mới nhất trước
                    </TableCaption>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Đơn hàng / Thời gian đặt</TableHead>
                        <TableHead>Sự kiện / Suất diễn</TableHead>
                        <TableHead>Số ghế</TableHead>
                        <TableHead>Tổng tiền</TableHead>
                        <TableHead>Trạng thái</TableHead>
                        <TableHead>
                          <span className="sr-only">Thao tác</span>
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {value.orders.map((order) => (
                        <TableRow key={order.id}>
                          <TableCell>
                            <strong className="order-code">{order.code}</strong>
                            <p>{formatShowtime(order.createdAt, "short")}</p>
                          </TableCell>
                          <TableCell>
                            <strong>{order.showtime.event.name}</strong>
                            <p>
                              {formatShowtime(
                                order.showtime.startTime,
                                "short",
                              )}
                            </p>
                          </TableCell>
                          <TableCell>{order.seatCount}</TableCell>
                          <TableCell className="order-money">
                            {formatVnd(order.totalAmount)}
                          </TableCell>
                          <TableCell>
                            <OrderBadge status={order.status} />
                          </TableCell>
                          <TableCell>
                            <DetailLink order={order} page={page} />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <ul
                  className="order-mobile-list"
                  aria-label="Các đơn đã đặt, mới nhất trước"
                >
                  {value.orders.map((order) => (
                    <li key={order.id} className="operations-panel">
                      <div className="order-card-heading">
                        <strong className="order-code">{order.code}</strong>
                        <OrderBadge status={order.status} />
                      </div>
                      <h2>{order.showtime.event.name}</h2>
                      <dl className="order-facts">
                        <div>
                          <dt>Suất diễn</dt>
                          <dd>
                            {formatShowtime(order.showtime.startTime, "short")}
                          </dd>
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
                      <DetailLink order={order} page={page} />
                    </li>
                  ))}
                </ul>
              </>
            )}
            {value.pagination.total > 0 && value.orders.length > 0 && (
              <nav
                className="order-pagination"
                aria-label="Phân trang lịch sử đơn hàng"
              >
                {value.pagination.hasPrevious ? (
                  <Button variant="outline" asChild>
                    <Link href={`/orders?page=${page - 1}`}>Trang trước</Link>
                  </Button>
                ) : (
                  <Button variant="outline" disabled>
                    Trang trước
                  </Button>
                )}
                <p role="status">
                  Trang {page} / {value.pagination.totalPages} ·{" "}
                  {value.pagination.total} đơn
                </p>
                {value.pagination.hasNext ? (
                  <Button variant="outline" asChild>
                    <Link href={`/orders?page=${page + 1}`}>Trang sau</Link>
                  </Button>
                ) : (
                  <Button variant="outline" disabled>
                    Trang sau
                  </Button>
                )}
              </nav>
            )}
          </>
        )}
      </div>
    </PublicLayout>
  );
}
