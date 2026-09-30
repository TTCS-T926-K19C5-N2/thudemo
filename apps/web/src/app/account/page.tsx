"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CurrentUser, loadCurrentUser } from "@/lib/api";
import { WorkspaceHeader } from "@/components/workspace-header";

export default function AccountPage() {
  const router = useRouter();
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;
    loadCurrentUser().then((result) => {
      if (!mounted) return;
      if (!result) router.replace("/login");
      else setUser(result);
    }).catch(() => mounted && setError("Không tải được tài khoản. Hãy tải lại trang.")).finally(() => mounted && setLoading(false));
    return () => { mounted = false; };
  }, [router]);

  return (
    <>
      <WorkspaceHeader />
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-8">
        <h1 className="text-2xl font-semibold">Tài khoản</h1>
        {loading && <p role="status" className="mt-8 text-sm text-muted-foreground">Đang tải tài khoản…</p>}
        {error && <p role="alert" className="mt-8 text-sm text-destructive">{error}</p>}
        {user && <div className="mt-8 border-t border-border py-5 text-sm">
          <p><span className="text-muted-foreground">Email:</span> {user.email}</p>
          <p className="mt-2"><span className="text-muted-foreground">Vai trò:</span> {user.roles.join(", ") || "Chưa được cấp"}</p>
          {user.roles.includes("ORGANIZER") ? <Link href="/events" className="mt-6 inline-block font-medium text-primary underline-offset-4 hover:underline">Quản lý sự kiện</Link> : <p className="mt-6 text-muted-foreground">Chưa có chức năng vận hành cho vai trò này trong Sprint 1.</p>}
        </div>}
      </main>
    </>
  );
}
