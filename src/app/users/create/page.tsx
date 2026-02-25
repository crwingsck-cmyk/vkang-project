'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { UserService } from '@/services/database/users';
import { registerUser } from '@/services/firebase/auth';
import { User, UserRole } from '@/types/models';
import Link from 'next/link';

function CreateUserForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const parentIdFromUrl = searchParams?.get('parent') ?? null;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [allUsers, setAllUsers] = useState<User[]>([]);

  const [form, setForm] = useState({
    email: '',
    password: '',
    displayName: '',
    role: UserRole.CUSTOMER,
    phoneNumber: '',
    companyName: '',
    creditLimit: '',
    parentUserId: parentIdFromUrl ?? '',
  });

  useEffect(() => {
    UserService.getAll().then(setAllUsers);
  }, []);
  useEffect(() => {
    if (parentIdFromUrl) setForm((f) => ({ ...f, parentUserId: parentIdFromUrl }));
  }, [parentIdFromUrl ?? '']);

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!form.email || !form.password || !form.displayName) {
      setError('Email, password, and display name are required.');
      return;
    }
    if (form.password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    setSaving(true);
    try {
      // Create Firebase Auth account
      const firebaseUser = await registerUser(form.email, form.password);

      // Create Firestore user record with Firebase UID as document ID
      await UserService.createWithId(firebaseUser.uid, {
        email: form.email,
        displayName: form.displayName.trim(),
        role: form.role as UserRole,
        phoneNumber: form.phoneNumber.trim() || undefined,
        company: form.companyName.trim() ? { name: form.companyName.trim() } : undefined,
        creditLimit: form.creditLimit ? parseFloat(form.creditLimit) : undefined,
        parentUserId: form.parentUserId.trim() || undefined,
        permissions: [],
        isActive: true,
        isVerified: false,
      });

      router.push('/users');
    } catch (err: any) {
      setError(err?.message || 'Failed to create user.');
    } finally {
      setSaving(false);
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

        <div>
          <h1 className="text-3xl font-bold text-gray-900">Add User</h1>
          <p className="text-gray-400 mt-1">Create a new system user account</p>
        </div>

        {error && (
          <div className="msg-error px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="bg-gray-800 rounded-lg border border-gray-700 p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Email <span className="text-red-400">*</span>
            </label>
            <input
              type="email"
              name="email"
              value={form.email}
              onChange={handleChange}
              placeholder="user@example.com"
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Password <span className="text-red-400">*</span>
            </label>
            <input
              type="password"
              name="password"
              value={form.password}
              onChange={handleChange}
              placeholder="Min. 6 characters"
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Display Name <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              name="displayName"
              value={form.displayName}
              onChange={handleChange}
              placeholder="Full name"
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Role <span className="text-red-400">*</span>
              </label>
              <select
                name="role"
                value={form.role}
                onChange={handleChange}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 focus:outline-none focus:border-blue-500"
              >
                <option value={UserRole.CUSTOMER}>Customer</option>
                <option value={UserRole.STOCKIST}>Stockist</option>
                <option value={UserRole.ADMIN}>Admin</option>
                <option value={UserRole.TAIWAN}>Taiwan（台灣供應商）</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Phone Number
              </label>
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
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Company Name
            </label>
            <input
              type="text"
              name="companyName"
              value={form.companyName}
              onChange={handleChange}
              placeholder="Optional"
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              上線（金三角架構）
            </label>
            <select
              name="parentUserId"
              value={form.parentUserId}
              onChange={handleChange}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 focus:outline-none focus:border-blue-500"
            >
              <option value="">無（頂層 / 總經銷商）</option>
              {allUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  <span className="name-lowercase">{u.displayName}</span> - {u.role}
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-500 mt-1">選擇此用戶的上線，不選則為頂層</p>
          </div>

          {(form.role === UserRole.STOCKIST || form.role === UserRole.CUSTOMER) && (
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Credit Limit (USD)
              </label>
              <input
                type="number"
                name="creditLimit"
                value={form.creditLimit}
                onChange={handleChange}
                placeholder="0.00"
                min="0"
                step="0.01"
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500"
              />
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg font-medium"
            >
              {saving ? 'Creating...' : 'Create User'}
            </button>
            <Link
              href="/users"
              className="px-6 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-lg font-medium"
            >
              Cancel
            </Link>
          </div>
        </form>
      </div>
    </ProtectedRoute>
  );
}

export default function CreateUserPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-gray-400">Loading...</div>}>
      <CreateUserForm />
    </Suspense>
  );
}
