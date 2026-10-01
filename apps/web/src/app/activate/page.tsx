import { Suspense } from "react";
import { ActivateForm } from "@/components/activate-form";

export const metadata = {
  title: "Kích hoạt tài khoản | Bán vé sự kiện",
  description: "Xác thực email để hoàn tất kích hoạt tài khoản",
};

export default function ActivatePage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto flex min-h-screen w-full max-w-md items-center justify-center p-6 text-sm text-slate-500">
          Đang tải trang kích hoạt...
        </div>
      }
    >
      <ActivateForm />
    </Suspense>
  );
}
