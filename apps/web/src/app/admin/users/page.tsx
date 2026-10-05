'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

type UserItem = {
  id: string;
  email: string;
  isActive: boolean;
  roles?: string[];
};

export default function AdminUsersPage() {
  const router = useRouter();
  const [users, setUsers] = useState<UserItem[]>([]);

  const loadUsers = async () => {
    try {
      const res = await fetch('/api/admin/users');
      if (res.status === 401) {
        router.push('/login');
        return;
      }
      if (res.ok) {
        const data = (await res.json()) as UserItem[];
        setUsers(data);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    let mounted = true;
    void fetch('/api/admin/users')
      .then(async (res) => {
        if (!mounted) return;
        if (res.status === 401) {
          router.push('/login');
          return;
        }
        if (res.ok) {
          const data = (await res.json()) as UserItem[];
          if (mounted) {
            setUsers(data);
          }
        }
      })
      .catch((e) => {
        console.error(e);
      });

    return () => {
      mounted = false;
    };
  }, [router]);

  const handleToggleStatus = async (id: string, isActive: boolean) => {
    const res = await fetch(`/api/admin/users/${id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive }),
    });
    if (res.status === 401) {
      router.push('/login');
      return;
    }
    if (res.ok) {
      void loadUsers();
    }
  };

  const handleChangeRole = async (id: string, role: string) => {
    const res = await fetch(`/api/admin/users/${id}/role`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role }),
    });
    if (res.status === 401) {
      router.push('/login');
      return;
    }
    if (res.ok) {
      void loadUsers();
    }
  };

  return (
    <div className="p-8">
      <div className="flex justify-between mb-4">
        <h1 className="text-2xl font-bold">Quản lý nhân viên</h1>
        <button className="bg-blue-600 text-white px-4 py-2 rounded">
          Tạo nhân viên
        </button>
      </div>

      <table className="min-w-full bg-white border">
        <thead>
          <tr>
            <th className="border p-2">Email</th>
            <th className="border p-2">Trạng thái</th>
            <th className="border p-2">Vai trò</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id}>
              <td className="border p-2">{u.email}</td>
              <td className="border p-2">
                <button 
                  onClick={() => handleToggleStatus(u.id, !u.isActive)}
                  className={`px-2 py-1 rounded ${u.isActive ? 'bg-green-100' : 'bg-red-100'}`}
                >
                  {u.isActive ? 'Hoạt động' : 'Bị khóa'}
                </button>
              </td>
              <td className="border p-2">
                <select 
                  value={u.roles?.[0] || 'BUYER'} 
                  onChange={(e) => handleChangeRole(u.id, e.target.value)}
                  className="border p-1"
                >
                  <option value="ADMIN">ADMIN</option>
                  <option value="ORGANIZER">ORGANIZER</option>
                  <option value="ACCOUNTANT">ACCOUNTANT</option>
                  <option value="TICKET_INSPECTOR">TICKET_INSPECTOR</option>
                  <option value="BUYER">BUYER</option>
                </select>
              </td>
            </tr>
          ))}
          {users.length === 0 && (
            <tr><td colSpan={3} className="text-center p-4">Chưa có dữ liệu</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
