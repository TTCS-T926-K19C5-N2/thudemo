"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { api, ApiError, object } from "@/lib/api/client";
import { loadCurrentUser } from "@/lib/api";
import { OrganizerLayout } from "@/components/layout/product-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { StaffAssignment } from "@/features/check-in/staff-assignment";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const roles = {
  BUYER: "Người mua",
  STAFF: "Nhân viên soát vé",
  ORGANIZER: "Ban tổ chức",
  ACCOUNTANT: "Kế toán",
  ADMIN: "Quản trị",
};
type UserItem = {
  id: string;
  email: string;
  isActive: boolean;
  roles: string[];
};
function decodeList(value: unknown) {
  const data = object(value);
  if (!Array.isArray(data.items) || typeof data.hasNext !== "boolean")
    throw new Error("Không đọc được danh sách tài khoản.");
  const items = data.items.map((value: unknown): UserItem => {
    const user = object(value);
    if (
      typeof user.id !== "string" ||
      typeof user.email !== "string" ||
      typeof user.isActive !== "boolean" ||
      !Array.isArray(user.roles) ||
      !user.roles.every((r): r is string => typeof r === "string")
    )
      throw new Error("Dữ liệu tài khoản không hợp lệ.");
    return {
      id: user.id,
      email: user.email,
      isActive: user.isActive,
      roles: user.roles,
    };
  });
  return { items, hasNext: data.hasNext };
}
function message(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Không thực hiện được thao tác.";
}

export default function AdminUsersPage() {
  const [self, setSelf] = useState("");
  const [access, setAccess] = useState<"loading" | "allowed" | "denied">(
    "loading",
  );
  const [list, setList] = useState<{ items: UserItem[]; hasNext: boolean }>({
    items: [],
    hasNext: false,
  });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const mutation = useRef(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("STAFF");
  const load = useCallback(async (page: number, signal?: AbortSignal) => {
    setLoading(true);
    try {
      setList(await api(`/admin/users?page=${page}`, decodeList, { signal }));
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);
  useEffect(() => {
    const abort = new AbortController();
    loadCurrentUser()
      .then(async (user) => {
        if (abort.signal.aborted) return;
        if (!user?.roles.includes("ADMIN")) {
          setAccess("denied");
          return;
        }
        setSelf(user.id);
        setAccess("allowed");
        await load(page, abort.signal);
      })
      .catch((e) => {
        if (!abort.signal.aborted) setError(message(e));
      });
    return () => abort.abort();
  }, [load, page]);

  async function change(path: string, body: unknown, created = false) {
    if (mutation.current) return;
    mutation.current = true;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      await api(path, object, { method: created ? "POST" : "PATCH", body });
      if (created) {
        setEmail("");
        setPassword("");
      }
      setSuccess(
        created
          ? "Đã tạo tài khoản nhân viên."
          : "Đã cập nhật. Quyền mới có hiệu lực ngay; khóa tài khoản thu hồi các phiên cũ.",
      );
      await load(page);
    } catch (e) {
      if (e instanceof ApiError && (e.status === 401 || e.status === 403))
        setAccess("denied");
      setError(message(e));
    } finally {
      mutation.current = false;
      setBusy(false);
    }
  }

  return (
    <OrganizerLayout title="Quản lý nhân viên" mode="account">
      <div className="operations-page">
        <div className="page-heading">
          <div>
            <h1>Quản lý nhân viên</h1>
            <p>Tạo tài khoản, cấp vai trò và khóa quyền truy cập.</p>
          </div>
        </div>
        {error && (
          <section className="operations-panel" role="alert">
            <p>{error}</p>
            <Button variant="outline" onClick={() => window.location.reload()}>
              Tải lại
            </Button>
          </section>
        )}
        {success && <p role="status">{success}</p>}
        {access === "loading" && !error && (
          <Skeleton className="h-48 w-full" aria-label="Đang kiểm tra quyền" />
        )}
        {access === "denied" && (
          <section className="operations-panel">
            <h2>Không có quyền truy cập</h2>
            <p>Chức năng này dành cho quản trị viên đang hoạt động.</p>
            <Button asChild>
              <Link href="/login">Đăng nhập</Link>
            </Button>
          </section>
        )}
        {access === "allowed" && (
          <>
            <form
              className="operations-panel"
              onSubmit={(e) => {
                e.preventDefault();
                void change("/admin/users", { email, password, role }, true);
              }}
            >
              <h2>Tạo nhân viên</h2>
              <div className="grid gap-4 md:grid-cols-3">
                <div>
                  <Label htmlFor="employee-email">Email</Label>
                  <Input
                    id="employee-email"
                    type="email"
                    autoComplete="off"
                    required
                    maxLength={320}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={busy}
                  />
                </div>
                <div>
                  <Label htmlFor="employee-password">Mật khẩu thử nghiệm</Label>
                  <Input
                    id="employee-password"
                    type="password"
                    autoComplete="new-password"
                    required
                    minLength={8}
                    maxLength={1024}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={busy}
                  />
                </div>
                <div>
                  <Label htmlFor="employee-role">Vai trò</Label>
                  <select
                    id="employee-role"
                    className="h-11 w-full rounded-md border bg-background px-3 text-sm"
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    disabled={busy}
                  >
                    {Object.entries(roles)
                      .filter(([key]) => key !== "BUYER")
                      .map(([key, label]) => (
                        <option key={key} value={key}>
                          {label}
                        </option>
                      ))}
                  </select>
                </div>
              </div>
              <div className="operations-actions">
                <Button type="submit" disabled={busy}>
                  {busy ? "Đang xử lý…" : "Tạo nhân viên"}
                </Button>
              </div>
            </form>
            <StaffAssignment users={list.items} />
            <section className="operations-panel" aria-busy={loading}>
              <h2>Danh sách tài khoản</h2>
              {loading ? (
                <p role="status">Đang tải danh sách…</p>
              ) : list.items.length === 0 ? (
                <p>Chưa có tài khoản.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Email</TableHead>
                      <TableHead>Vai trò</TableHead>
                      <TableHead>Trạng thái</TableHead>
                      <TableHead>Thao tác</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {list.items.map((user) => (
                      <TableRow key={user.id}>
                        <TableCell>
                          {user.email}
                          {user.id === self ? " (bạn)" : ""}
                        </TableCell>
                        <TableCell>
                          <select
                            className="h-11 rounded-md border bg-background px-3 text-sm"
                            aria-label={`Vai trò ${user.email}`}
                            value={user.roles.length === 1 ? user.roles[0] : ""}
                            disabled={busy || user.id === self}
                            onChange={(e) => {
                              if (
                                window.confirm(
                                  `Đổi vai trò ${user.email}? Quyền mới có hiệu lực ngay.`,
                                )
                              )
                                void change(`/admin/users/${user.id}/role`, {
                                  role: e.target.value,
                                });
                            }}
                          >
                            {user.roles.length !== 1 && (
                              <option value="">
                                {user.roles.join(", ") || "Chưa có vai trò"}
                              </option>
                            )}
                            {Object.entries(roles).map(([key, label]) => (
                              <option key={key} value={key}>
                                {label}
                              </option>
                            ))}
                          </select>
                        </TableCell>
                        <TableCell>
                          {user.isActive ? "Hoạt động" : "Đã khóa"}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="outline"
                            disabled={busy || user.id === self}
                            onClick={() => {
                              if (
                                window.confirm(
                                  `${user.isActive ? "Khóa" : "Mở khóa"} ${user.email}?`,
                                )
                              )
                                void change(`/admin/users/${user.id}/status`, {
                                  isActive: !user.isActive,
                                });
                            }}
                          >
                            {user.isActive ? "Khóa" : "Mở khóa"}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
              <div
                className="operations-actions"
                aria-label="Phân trang tài khoản"
              >
                <Button
                  variant="outline"
                  disabled={page === 1 || loading || busy}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Trang trước
                </Button>
                <span>Trang {page}</span>
                <Button
                  variant="outline"
                  disabled={!list.hasNext || loading || busy}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Trang sau
                </Button>
              </div>
            </section>
          </>
        )}
      </div>
    </OrganizerLayout>
  );
}
