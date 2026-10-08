import Link from "next/link";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { ApiError } from "@/lib/api/client";

export function OrderLoading({ detail = false }: { detail?: boolean }) {
  return (
    <div role="status" aria-label="Đang tải đơn hàng" className="order-loading">
      <Skeleton className="h-8 w-48" />
      {Array.from({ length: detail ? 3 : 5 }, (_, index) => (
        <div key={index} className="order-loading-row">
          <Skeleton className="h-5 w-2/3" />
          <Skeleton className="h-5 w-1/4" />
          <Skeleton className="h-5 w-1/3" />
        </div>
      ))}
    </div>
  );
}

export function OrderError({
  error,
  returnTo,
  retry,
}: {
  error: ApiError;
  returnTo: string;
  retry: () => void;
}) {
  const signedOut = error.status === 401,
    forbidden = error.status === 403,
    missing = error.status === 404;
  return (
    <Alert variant="destructive">
      <AlertTitle>
        {signedOut
          ? "Vui lòng đăng nhập lại"
          : forbidden
            ? "Không có quyền xem đơn hàng"
            : missing
              ? "Không tìm thấy đơn hàng"
              : "Không tải được đơn hàng"}
      </AlertTitle>
      <AlertDescription>
        <p>
          {signedOut
            ? "Phiên đăng nhập đã hết hạn hoặc bạn chưa đăng nhập. Đăng nhập để tiếp tục xem đơn hàng."
            : forbidden
              ? "Bạn chỉ có thể xem đơn hàng thuộc tài khoản của mình."
              : missing
                ? "Kiểm tra lại đường dẫn hoặc trở về danh sách đơn hàng."
                : "Chưa tải được dữ liệu. Kiểm tra kết nối rồi thử lại; trang đang xem sẽ được giữ nguyên."}
        </p>
        <div className="operations-actions">
          {signedOut ? (
            <Button asChild>
              <Link href={`/login?returnTo=${encodeURIComponent(returnTo)}`}>
                Đăng nhập
              </Link>
            </Button>
          ) : forbidden || missing ? (
            <Button variant="outline" asChild>
              <Link href="/orders">Về đơn hàng của tôi</Link>
            </Button>
          ) : (
            <Button variant="outline" onClick={retry}>
              Thử lại
            </Button>
          )}
        </div>
      </AlertDescription>
    </Alert>
  );
}
