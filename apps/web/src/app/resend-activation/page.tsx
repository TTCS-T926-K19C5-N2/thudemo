import { Suspense } from "react";
import { ResendActivationForm } from "@/components/resend-activation-form";

export const metadata = {
  title: "Gửi lại link kích hoạt | Bán vé sự kiện",
  description: "Yêu cầu gửi lại liên kết kích hoạt tài khoản",
};

export default function ResendActivationPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto flex min-h-screen w-full max-w-md items-center justify-center p-6 text-sm text-slate-500">
          Đang tải trang...
        </div>
      }
    >
      <ResendActivationForm />
    </Suspense>
  );
}
