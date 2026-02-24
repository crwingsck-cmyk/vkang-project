'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { deleteField } from 'firebase/firestore';
import { useAuth } from '@/context/AuthContext';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { UserService } from '@/services/database/users';
import { getCurrentToken } from '@/services/firebase/auth';
import { User, UserRole } from '@/types/models';
import Link from 'next/link';

const roleColors: Record<UserRole, string> = {
  [UserRole.ADMIN]: 'bg-red-900/30 text-red-300',
  [UserRole.STOCKIST]: 'bg-blue-900/30 text-blue-300',
  [UserRole.CUSTOMER]: 'bg-green-900/30 text-green-300',
};

export default function UserDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user: currentUser } = useAuth();
  const userId = (params?.id ?? '') as string;

  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const [deleting, setDeleting] = useState(false);
  const [form, setForm] = useState({
    email: '',
    displayName: '',
    phoneNumber: '',
    role: UserRole.CUSTOMER,
    companyName: '',
    creditLimit: '',
    isActive: true,
    parentUserId: '',
  });
  const [allUsers, setAllUsers] = useState<User[]>([]);

  useEffect(() => {
    loadUser();
  }, [userId]);
  useEffect(() => {
    UserService.getAllForAdmin().then(setAllUsers);
  }, []);

  async function loadUser() {
    setLoading(true);
    try {
      const data = await UserService.getById(userId);
      if (!data) {
        setError('User not found.');
        return;
      }
      setUser(data);
      setForm({
        email: data.email || '',
        displayName: data.displayName,
        phoneNumber: data.phoneNumber || '',
        role: data.role,
        companyName: data.company?.name || '',
        creditLimit: data.creditLimit !== undefined ? String(data.creditLimit) : '',
        isActive: data.isActive,
        parentUserId: data.parentUserId || '',
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`載入失敗：${msg}`);
      console.error('Load user error:', err);
    } finally {
      setLoading(false);
    }
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    const { name, value, type } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value,
    }));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSuccessMsg('');
    if (!form.email.trim()) {
      setError('Email 為必填');
      return;
    }
    setSaving(true);
    try {
      const newEmail = form.email.trim().toLowerCase();
      if (newEmail && newEmail !== (user?.email || '').toLowerCase()) {
        const token = await getCurrentToken(true);
        if (!token) {
          setError('請重新登入後再試');
          setSaving(false);
          return;
        }
        const res = await fetch('/api/users/update-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ uid: userId, newEmail }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || 'Email 更新失敗');
          setSaving(false);
          return;
        }
      }
      await UserService.update(userId, {
        email: form.email.trim() || undefined,
        displayName: form.displayName.trim(),
        phoneNumber: form.phoneNumber.trim() || undefined,
        role: form.role as UserRole,
        company: form.companyName.trim() ? { name: form.companyName.trim() } : (deleteField() as any),
        creditLimit: form.creditLimit ? parseFloat(form.creditLimit) : undefined,
        isActive: form.isActive,
        parentUserId: form.parentUserId.trim() || (deleteField() as any),
      });
      setSuccessMsg('使用者已更新。');
      setIsEditing(false);
      await loadUser();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`更新失敗：${msg}`);
      console.error('User update error:', err);
    } finally {
      setSaving(false);
    }
  }

  async function handleDeactivate() {
    if (!confirm(`Deactivate user "${user?.displayName}"? They will no longer be able to log in.`)) return;
    setSaving(true);
    try {
      await UserService.deactivate(userId);
      setSuccessMsg('User deactivated.');
      await loadUser();
    } catch {
      setError('Failed to deactivate user.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    const msg = `確定要永久刪除使用者「${user?.displayName}」嗎？\n\n將一併刪除：\n• 此帳號（Firebase Auth）\n• 庫存、進貨單、訂單等所有相關資料\n\n此操作無法復原。`;
    if (!confirm(msg)) return;
    if (!confirm('請再次確認：此操作將永久刪除該使用者及其所有資料。')) return;
    setDeleting(true);
    setError('');
    try {
      const token = await getCurrentToken(true);
      if (!token) {
        setError('請重新登入後再試');
        setDeleting(false);
        return;
      }
      const res = await fetch('/api/users/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ uid: userId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || '刪除失敗');
        setDeleting(false);
        return;
      }
      setSuccessMsg('使用者已刪除。');
      setTimeout(() => router.push('/users'), 1500);
    } catch {
      setError('刪除失敗');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <ProtectedRoute requiredRoles={[UserRole.ADMIN]}>
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Link href="/users" className="text-gray-400 hover:text-gray-200 text-sm">
            &larr; Back to Users
          </Link>
        </div>

        {loading ? (
          <div className="text-gray-400">Loading...</div>
        ) : error && !user ? (
          <div className="msg-error px-4 py-3 rounded-lg">{error}</div>
        ) : user ? (
          <>
            <div className="flex items-start justify-between">
              <div>
                <h1 className="text-3xl font-bold text-gray-100 name-lowercase">{user.displayName}</h1>
                <p className="text-gray-400 mt-1">{user.email}</p>
                <div className="mt-2 flex items-center gap-2">
                  <span className={`px-3 py-1 rounded-full text-xs font-medium ${roleColors[user.role]}`}>
                    {user.role}
                  </span>
                  <span className={`px-3 py-1 rounded-full text-xs font-medium ${user.isActive ? 'bg-blue-100 text-blue-800' : 'bg-gray-200 text-gray-600'}`}>
                    {user.isActive ? 'Active' : 'Inactive'}
                  </span>
                </div>
              </div>
              {!isEditing && (
                <div className="flex gap-2">
                  <Link
                    href={`/users/create?parent=${userId}`}
                    className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm"
                  >
                    + 新增下線
                  </Link>
                  <button
                    onClick={() => { setIsEditing(true); setSuccessMsg(''); setError(''); }}
                    className="px-4 py-2 bg-blue-400 hover:bg-blue-500 text-white border border-blue-500 rounded-lg text-sm"
                  >
                    修改
                  </button>
                  {user.isActive && (
                    <button
                      onClick={handleDeactivate}
                      disabled={saving}
                      className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg text-sm"
                    >
                      Deactivate
                    </button>
                  )}
                  {currentUser?.id !== userId && (
                    <button
                      onClick={handleDelete}
                      disabled={deleting}
                      className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg text-sm"
                    >
                      {deleting ? '刪除中...' : '刪除'}
                    </button>
                  )}
                </div>
              )}
            </div>

            {error && (
              <div className="msg-error px-4 py-3 rounded-lg">{error}</div>
            )}
            {successMsg && (
              <div className="bg-green-900/30 border border-green-700 text-green-300 px-4 py-3 rounded-lg">{successMsg}</div>
            )}

            {isEditing ? (
              <form onSubmit={handleSave} className="bg-gray-800 rounded-lg border border-gray-700 p-6 space-y-4">
                <h2 className="text-lg font-semibold text-gray-200">Edit User</h2>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Email</label>
                  <input
                    type="email"
                    name="email"
                    value={form.email}
                    onChange={handleChange}
                    placeholder="user@example.com"
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">修改後，該使用者需使用新 Email 登入</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Display Name</label>
                  <input
                    type="text"
                    name="displayName"
                    value={form.displayName}
                    onChange={handleChange}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">Role</label>
                    <select
                      name="role"
                      value={form.role}
                      onChange={handleChange}
                      className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 focus:outline-none focus:border-blue-500"
                    >
                      <option value={UserRole.CUSTOMER}>Customer</option>
                      <option value={UserRole.STOCKIST}>Stockist</option>
                      <option value={UserRole.ADMIN}>Admin</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">Phone Number</label>
                    <input
                      type="tel"
                      name="phoneNumber"
                      value={form.phoneNumber}
                      onChange={handleChange}
                      placeholder="+60 12-345 6789"
                      className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Company Name</label>
                  <input
                    type="text"
                    name="companyName"
                    value={form.companyName}
                    onChange={handleChange}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">上線（金三角架構）</label>
                  <select
                    name="parentUserId"
                    value={form.parentUserId}
                    onChange={handleChange}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 focus:outline-none focus:border-blue-500"
                  >
                    <option value="">無（頂層 / 總經銷商）</option>
                    {allUsers.filter((u) => u.id !== userId).map((u) => (
                      <option key={u.id} value={u.id}>
                        <span className="name-lowercase">{u.displayName}</span> - {u.role}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Credit Limit (USD)</label>
                  <input
                    type="number"
                    name="creditLimit"
                    value={form.creditLimit}
                    onChange={handleChange}
                    min="0"
                    step="0.01"
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    name="isActive"
                    id="isActive"
                    checked={form.isActive}
                    onChange={handleChange}
                    className="w-4 h-4 accent-blue-500"
                  />
                  <label htmlFor="isActive" className="text-sm text-gray-300">Account Active</label>
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg font-medium"
                  >
                    {saving ? 'Saving...' : 'Save Changes'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setIsEditing(false); setError(''); }}
                    className="px-6 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-lg font-medium"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <div className="bg-gray-800 rounded-lg border border-gray-700 p-6 space-y-4">
                {user.role === UserRole.STOCKIST && (
                  <div className="mb-4">
                    <Link
                      href={`/stockists/${user.id}`}
                      className="inline-flex px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium"
                    >
                      查看經銷商營運（訂單、庫存、進貨）→
                    </Link>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-4 text-sm">
                  {user.parentUserId && (
                    <div>
                      <p className="text-gray-400">上線</p>
                      <Link href={`/users/${user.parentUserId}`} className="text-blue-400 hover:underline font-medium">
                        查看上線 →
                      </Link>
                    </div>
                  )}
                  <div>
                    <p className="text-gray-400">Phone</p>
                    <p className="text-gray-100 font-medium">{user.phoneNumber || '-'}</p>
                  </div>
                  <div>
                    <p className="text-gray-400">Company</p>
                    <p className="text-gray-100 font-medium">{user.company?.name || '-'}</p>
                  </div>
                  <div>
                    <p className="text-gray-400">Credit Limit</p>
                    <p className="text-gray-100 font-medium">
                      {user.creditLimit !== undefined ? `USD ${user.creditLimit.toFixed(2)}` : '-'}
                    </p>
                  </div>
                  <div>
                    <p className="text-gray-400">Credit Used</p>
                    <p className="text-gray-100 font-medium">
                      {user.creditUsed !== undefined ? `USD ${user.creditUsed.toFixed(2)}` : '-'}
                    </p>
                  </div>
                  <div>
                    <p className="text-gray-400">Login Count</p>
                    <p className="text-gray-100 font-medium">{user.metadata?.loginCount ?? 0}</p>
                  </div>
                  <div>
                    <p className="text-gray-400">Last Login</p>
                    <p className="text-gray-100 font-medium">
                      {user.metadata?.lastLogin ? new Date(user.metadata.lastLogin).toLocaleString() : '-'}
                    </p>
                  </div>
                </div>
                <div className="border-t border-gray-700 pt-4 text-xs text-gray-500">
                  User ID: {user.id}
                  &nbsp;|&nbsp;
                  Created: {user.createdAt ? new Date(user.createdAt).toLocaleString() : '-'}
                </div>
              </div>
            )}
          </>
        ) : null}
      </div>
    </ProtectedRoute>
  );
}
