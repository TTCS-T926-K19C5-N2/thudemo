"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { WorkspaceHeader } from "@/components/workspace-header";
import { loadCurrentUser } from "@/lib/api";

type EventRow = { id: string; name: string; location: string; status: string; updatedAt: string; showtimes: { id: string }[] };

export default function EventsPage() {
  const router = useRouter();
  const [events, setEvents] = useState<EventRow[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [forbidden, setForbidden] = useState(false);

  const reload = useCallback(async () => {
    try {
      const user = await loadCurrentUser();
      if (!user) { router.replace("/login"); return; }
      if (!user.roles.includes("ORGANIZER")) { setForbidden(true); return; }
      const response = await fetch("/api/events/mine", { cache: "no-store" });
      if (response.status === 403) { setForbidden(true); return; }
      if (!response.ok) throw new Error();
      setEvents(await response.json() as EventRow[]);
    } catch {
      setError("Không tải được sự kiện. Kiểm tra kết nối rồi thử lại.");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    const timer = window.setTimeout(() => void reload(), 0);
    return () => window.clearTimeout(timer);
  }, [reload]);
  const visible = events.filter((event) => event.name.toLocaleLowerCase("vi").includes(query.toLocaleLowerCase("vi")));

  return (
    <>
      <WorkspaceHeader />
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Ban tổ chức</p><h1 className="mt-1 text-2xl font-semibold">Sự kiện</h1></div>
          {!forbidden && <Button asChild className="h-11"><Link href="/events/new">Tạo sự kiện</Link></Button>}
        </div>
        {forbidden ? <div className="mt-10 border-t border-border pt-6"><h2 className="font-semibold">Không có quyền quản lý sự kiện</h2><p className="mt-2 text-sm text-muted-foreground">Tài khoản này chưa có vai trò ban tổ chức.</p><Link href="/account" className="mt-4 inline-block text-sm text-primary underline">Về tài khoản</Link></div> : <>
          <div className="mt-8 max-w-sm"><label htmlFor="event-search" className="mb-2 block text-sm font-medium">Tìm sự kiện</label><Input id="event-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nhập tên sự kiện" className="h-10" /></div>
          {loading && <p role="status" className="mt-8 text-sm text-muted-foreground">Đang tải danh sách sự kiện…</p>}
          {error && <div role="alert" className="mt-8 border-l-2 border-destructive bg-red-50 px-3 py-3 text-sm"><p>{error}</p><Button type="button" variant="outline" onClick={() => { setLoading(true); setError(""); void reload(); }} className="mt-3 h-10">Thử lại</Button></div>}
          {!loading && !error && visible.length === 0 && <div className="mt-8 border-t border-border py-10 text-sm text-muted-foreground">{events.length === 0 ? "Chưa có sự kiện. Tạo sự kiện đầu tiên để bắt đầu." : "Không có sự kiện khớp tên tìm kiếm."}</div>}
          {!loading && !error && visible.length > 0 && <div className="mt-6 overflow-x-auto border-t border-border"><table className="w-full min-w-[620px] text-left text-sm"><caption className="sr-only">Danh sách sự kiện của ban tổ chức</caption><thead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"><tr><th scope="col" className="py-3 pr-4">Sự kiện</th><th scope="col" className="py-3 pr-4">Trạng thái</th><th scope="col" className="py-3 pr-4">Suất diễn</th><th scope="col" className="py-3 pr-4">Cập nhật</th><th scope="col" className="py-3 text-right">Thao tác</th></tr></thead><tbody>{visible.map((event) => <tr key={event.id} className="border-t border-border"><td className="py-4 pr-4"><span className="font-medium">{event.name}</span><span className="block text-xs text-muted-foreground">{event.location}</span></td><td className="py-4 pr-4">{event.status === "DRAFT" ? "Nháp" : event.status}</td><td className="py-4 pr-4">{event.showtimes.length}</td><td className="py-4 pr-4">{new Intl.DateTimeFormat("vi-VN", { dateStyle: "short" }).format(new Date(event.updatedAt))}</td><td className="py-4 text-right"><Link href={`/events/${event.id}`} className="font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-primary">Quản lý</Link></td></tr>)}</tbody></table></div>}
        </>}
      </main>
    </>
  );
}
