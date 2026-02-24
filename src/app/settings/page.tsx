'use client';

import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { UserService } from '@/services/database/users';
import { clearAllData } from '@/services/database/dataClear';
import { UserRole } from '@/types/models';

export default function SettingsPage() {
  const { user, role, setUser } = useAuth();
  const [saving, setSaving] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [clearResult, setClearResult] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [error, setError] = useState('');

  const [profileForm, setProfileForm] = useState({
    displayName: user?.displayName || '',
    phoneNumber: user?.phoneNumber || '',
    companyName: user?.company?.name || '',
  });

  function handleProfileChange(e: React.ChangeEvent<HTMLInputElement>) {
    setProfileForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function handleProfileSave(e: React.FormEvent) {
    e.preventDefault();
    if (!user?.id) return;
    setError('');
    setSuccessMsg('');
    setSaving(true);
    try {
      await UserService.update(user.id, {
        displayName: profileForm.displayName.trim(),
        phoneNumber: profileForm.phoneNumber.trim() || undefined,
        company: profileForm.companyName.trim()
          ? { name: profileForm.companyName.trim() }
          : user.company,
      });
      setSuccessMsg('Profile updated successfully.');
      setUser({
        ...user,
        displayName: profileForm.displayName.trim(),
        phoneNumber: profileForm.phoneNumber.trim() || undefined,
        company: profileForm.companyName.trim()
          ? { name: profileForm.companyName.trim() }
          : user.company,
      });
    } catch {
      setError('Failed to update profile.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <ProtectedRoute requiredRoles={[UserRole.ADMIN, UserRole.STOCKIST, UserRole.CUSTOMER]}>
      <div className="max-w-2xl space-y-5">

        {/* Page Header */}
        <div>
          <h1 className="text-xl font-bold text-txt-primary tracking-tight">Settings</h1>
          <p className="text-sm text-txt-subtle mt-0.5">Manage your account and preferences</p>
        </div>

        {/* Profile Section */}
        <div className="glass-card p-5 space-y-4">
          <p className="text-[10px] font-semibold text-txt-subtle uppercase tracking-widest">Profile</p>

          {error && (
            <div className="msg-error px-3 py-2.5 text-xs">{error}</div>
          )}
          {successMsg && (
            <div className="bg-success/10 border border-success/20 text-success px-3 py-2.5 rounded-lg text-xs">{successMsg}</div>
          )}

          {/* Read-only info */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-surface-2 rounded-lg px-3 py-2.5">
              <p className="text-[10px] font-semibold text-txt-subtle uppercase tracking-widest mb-1">Email</p>
              <p className="text-xs text-txt-primary font-medium">{user?.email || '-'}</p>
            </div>
            <div className="bg-surface-2 rounded-lg px-3 py-2.5">
              <p className="text-[10px] font-semibold text-txt-subtle uppercase tracking-widest mb-1">Role</p>
              <p className="text-xs text-txt-primary font-medium">{user?.role || '-'}</p>
            </div>
          </div>

          <form onSubmit={handleProfileSave} className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-txt-secondary mb-1.5">Display Name</label>
              <input
                type="text"
                name="displayName"
                value={profileForm.displayName}
                onChange={handleProfileChange}
                className="w-full px-3 py-2 bg-surface-2 border border-border rounded-lg text-txt-primary text-sm focus:outline-none focus:border-accent"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-txt-secondary mb-1.5">Phone Number</label>
              <input
                type="tel"
                name="phoneNumber"
                value={profileForm.phoneNumber}
                onChange={handleProfileChange}
                placeholder="+60 12-345 6789"
                className="w-full px-3 py-2 bg-surface-2 border border-border rounded-lg text-txt-primary text-sm placeholder-txt-subtle focus:outline-none focus:border-accent"
              />
            </div>

            {(role === UserRole.STOCKIST || role === UserRole.ADMIN) && (
              <div>
                <label className="block text-xs font-medium text-txt-secondary mb-1.5">Company Name</label>
                <input
                  type="text"
                  name="companyName"
                  value={profileForm.companyName}
                  onChange={handleProfileChange}
                  className="w-full px-3 py-2 bg-surface-2 border border-border rounded-lg text-txt-primary text-sm focus:outline-none focus:border-accent"
                />
              </div>
            )}

            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 bg-accent hover:bg-accent-hover disabled:opacity-50 text-white rounded-lg text-xs font-semibold transition-colors"
            >
              {saving ? 'Saving...' : 'Save Profile'}
            </button>
          </form>
        </div>

        {/* Account Info */}
        <div className="glass-card p-5 space-y-3">
          <p className="text-[10px] font-semibold text-txt-subtle uppercase tracking-widest">Account Info</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-surface-2 rounded-lg px-3 py-2.5">
              <p className="text-[10px] font-semibold text-txt-subtle uppercase tracking-widest mb-1">User ID</p>
              <p className="text-[10px] text-txt-subtle font-mono break-all">{user?.id || '-'}</p>
            </div>
            <div className="bg-surface-2 rounded-lg px-3 py-2.5">
              <p className="text-[10px] font-semibold text-txt-subtle uppercase tracking-widest mb-1">Status</p>
              <p className={`text-xs font-semibold ${user?.isActive ? 'text-blue-600' : 'text-error'}`}>
                {user?.isActive ? 'Active' : 'Inactive'}
              </p>
            </div>
            <div className="bg-surface-2 rounded-lg px-3 py-2.5">
              <p className="text-[10px] font-semibold text-txt-subtle uppercase tracking-widest mb-1">Email Verified</p>
              <p className={`text-xs font-semibold ${user?.isVerified ? 'text-success' : 'text-warning'}`}>
                {user?.isVerified ? 'Verified' : 'Not Verified'}
              </p>
            </div>
            <div className="bg-surface-2 rounded-lg px-3 py-2.5">
              <p className="text-[10px] font-semibold text-txt-subtle uppercase tracking-widest mb-1">Login Count</p>
              <p className="text-xs text-txt-primary font-semibold tabular-nums">{user?.metadata?.loginCount ?? 0}</p>
            </div>
            {user?.creditLimit !== undefined && (
              <>
                <div className="bg-surface-2 rounded-lg px-3 py-2.5">
                  <p className="text-[10px] font-semibold text-txt-subtle uppercase tracking-widest mb-1">Credit Limit</p>
                  <p className="text-xs text-txt-primary font-semibold tabular-nums">USD {user.creditLimit.toFixed(2)}</p>
                </div>
                <div className="bg-surface-2 rounded-lg px-3 py-2.5">
                  <p className="text-[10px] font-semibold text-txt-subtle uppercase tracking-widest mb-1">Credit Used</p>
                  <p className="text-xs text-txt-primary font-semibold tabular-nums">USD {(user.creditUsed ?? 0).toFixed(2)}</p>
                </div>
              </>
            )}
          </div>
        </div>

        {/* System Info (Admin only) */}
        {role === UserRole.ADMIN && (
          <div className="glass-card p-5 space-y-3">
            <p className="text-[10px] font-semibold text-txt-subtle uppercase tracking-widest">System</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-surface-2 rounded-lg px-3 py-2.5">
                <p className="text-[10px] font-semibold text-txt-subtle uppercase tracking-widest mb-1">Version</p>
                <p className="text-xs text-txt-primary">Vkang ERP v2.0</p>
              </div>
              <div className="bg-surface-2 rounded-lg px-3 py-2.5">
                <p className="text-[10px] font-semibold text-txt-subtle uppercase tracking-widest mb-1">Stack</p>
                <p className="text-xs text-txt-primary">Next.js 14 + Firebase</p>
              </div>
              <div className="bg-surface-2 rounded-lg px-3 py-2.5">
                <p className="text-[10px] font-semibold text-txt-subtle uppercase tracking-widest mb-1">Currency</p>
                <p className="text-xs text-txt-primary">USD</p>
              </div>
              <div className="bg-surface-2 rounded-lg px-3 py-2.5">
                <p className="text-[10px] font-semibold text-txt-subtle uppercase tracking-widest mb-1">Timezone</p>
                <p className="text-xs text-txt-primary">Asia/Kuala_Lumpur</p>
              </div>
            </div>

            {/* 清空所有資料 - 危險操作 */}
            <div className="mt-6 pt-6 border-t border-border">
              <p className="text-[10px] font-semibold text-txt-subtle uppercase tracking-widest mb-2">危險操作</p>
              <p className="text-xs text-txt-subtle mb-3">
                清空所有產品、庫存、進貨單、訂單、財務紀錄。使用者帳號會保留。
              </p>
              {clearResult && (
                <div className={`mb-3 px-3 py-2 rounded-lg text-xs ${clearResult.startsWith('錯誤') ? 'msg-error' : 'bg-success/10 border border-success/20 text-success'}`}>
                  {clearResult}
                </div>
              )}
              <button
                type="button"
                onClick={async () => {
                  const msg = '確定要清空所有資料嗎？此操作無法復原。將刪除：產品、庫存、進貨單、訂單、財務紀錄。';
                  if (!confirm(msg)) return;
                  const confirmAgain = '請再次確認：此操作將永久刪除所有業務資料。';
                  if (!confirm(confirmAgain)) return;
                  setClearing(true);
                  setError('');
                  setSuccessMsg('');
                  setClearResult('');
                  try {
                    const { cleared, error: err } = await clearAllData();
                    if (err) {
                      setClearResult(`錯誤：${err}`);
                    } else {
                      const summary = Object.entries(cleared)
                        .map(([k, v]) => `${k}: ${v}`)
                        .join(', ');
                      setClearResult(`已清空：${summary}`);
                    }
                  } catch (e) {
                    setClearResult(e instanceof Error ? e.message : '清空失敗');
                  } finally {
                    setClearing(false);
                  }
                }}
                disabled={clearing}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg text-xs font-semibold transition-colors"
              >
                {clearing ? '清空中...' : '清空所有資料'}
              </button>
            </div>
          </div>
        )}
      </div>
    </ProtectedRoute>
  );
}
