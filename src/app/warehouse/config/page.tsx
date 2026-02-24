'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { UserService } from '@/services/database/users';
import { User, UserRole } from '@/types/models';
import Link from 'next/link';

export default function WarehouseConfigPage() {
  useAuth();
  const [stockists, setStockists] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ companyName: '', phoneNumber: '', creditLimit: '' });
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    loadStockists();
  }, []);

  async function loadStockists() {
    setLoading(true);
    try {
      const data = await UserService.getStockists();
      setStockists(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  function startEdit(s: User) {
    setEditingId(s.id!);
    setEditForm({
      companyName: s.company?.name || '',
      phoneNumber: s.phoneNumber || '',
      creditLimit: s.creditLimit?.toString() || '0',
    });
    setSuccessMsg('');
    setError('');
  }

  function cancelEdit() {
    setEditingId(null);
  }

  async function handleSave(stockistId: string) {
    setSaving(true);
    setError('');
    try {
      const creditLimit = parseFloat(editForm.creditLimit);
      await UserService.update(stockistId, {
        phoneNumber: editForm.phoneNumber.trim() || undefined,
        company: editForm.companyName.trim() ? { name: editForm.companyName.trim() } : undefined,
        creditLimit: isNaN(creditLimit) ? 0 : creditLimit,
      });
      setSuccessMsg(`Stockist updated.`);
      setEditingId(null);
      await loadStockists();
    } catch (err: any) {
      setError(err?.message || 'Failed to update.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <ProtectedRoute requiredRoles={[UserRole.ADMIN]}>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <Link href="/warehouse" className="text-gray-400 hover:text-gray-200 text-sm">&larr; Warehouse</Link>
            </div>
            <h1 className="text-3xl font-bold text-gray-100">Warehouse Configuration</h1>
            <p className="text-gray-400 mt-1">Manage stockist warehouses and credit settings</p>
          </div>
        </div>

        {successMsg && (
          <div className="bg-green-900/30 border border-green-700 text-green-300 px-4 py-3 rounded-lg text-sm">
            {successMsg}
          </div>
        )}
        {error && (
          <div className="bg-red-900/30 border border-red-700 text-red-300 px-4 py-3 rounded-lg text-sm">
            {error}
          </div>
        )}

        {/* Summary */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
            <p className="text-gray-400 text-sm">Total Warehouses</p>
            <p className="text-2xl font-bold text-gray-100">{stockists.length}</p>
          </div>
          <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
            <p className="text-gray-400 text-sm">Active Stockists</p>
            <p className="text-2xl font-bold text-green-400">
              {stockists.filter((s) => s.isActive).length}
            </p>
          </div>
          <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
            <p className="text-gray-400 text-sm">Total Credit Limit</p>
            <p className="text-2xl font-bold text-blue-400">
              USD {stockists.reduce((sum, s) => sum + (s.creditLimit || 0), 0).toFixed(2)}
            </p>
          </div>
        </div>

        {/* Stockist Table */}
        <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center p-8">
              <p className="text-gray-400">Loading warehouses...</p>
            </div>
          ) : stockists.length === 0 ? (
            <div className="flex items-center justify-center p-12">
              <p className="text-gray-400">No stockists found. Add stockists from the Users page.</p>
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-gray-700 border-b border-gray-600">
                <tr>
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-200">Stockist</th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-200">Company</th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-200">Phone</th>
                  <th className="px-6 py-3 text-right text-sm font-medium text-gray-200">Credit Limit</th>
                  <th className="px-6 py-3 text-right text-sm font-medium text-gray-200">Credit Used</th>
                  <th className="px-6 py-3 text-center text-sm font-medium text-gray-200">Status</th>
                  <th className="px-6 py-3 text-center text-sm font-medium text-gray-200">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {stockists.map((s) => (
                  <tr key={s.id} className="hover:bg-gray-700/50">
                    {editingId === s.id ? (
                      <>
                        <td className="px-6 py-3 text-sm text-gray-100 font-medium">{s.displayName}</td>
                        <td className="px-3 py-3">
                          <input
                            type="text"
                            value={editForm.companyName}
                            onChange={(e) => setEditForm((p) => ({ ...p, companyName: e.target.value }))}
                            placeholder="Company name"
                            className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded text-gray-100 text-sm focus:outline-none focus:border-blue-500"
                          />
                        </td>
                        <td className="px-3 py-3">
                          <input
                            type="tel"
                            value={editForm.phoneNumber}
                            onChange={(e) => setEditForm((p) => ({ ...p, phoneNumber: e.target.value }))}
                            placeholder="+60 12-345 6789"
                            className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded text-gray-100 text-sm focus:outline-none focus:border-blue-500"
                          />
                        </td>
                        <td className="px-3 py-3">
                          <input
                            type="number"
                            value={editForm.creditLimit}
                            onChange={(e) => setEditForm((p) => ({ ...p, creditLimit: e.target.value }))}
                            min="0"
                            step="100"
                            className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded text-gray-100 text-sm text-right focus:outline-none focus:border-blue-500"
                          />
                        </td>
                        <td className="px-6 py-3 text-sm text-gray-300 text-right">
                          USD {(s.creditUsed ?? 0).toFixed(2)}
                        </td>
                        <td className="px-6 py-3 text-center">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${s.isActive ? 'bg-green-900/30 text-green-300' : 'bg-red-900/30 text-red-300'}`}>
                            {s.isActive ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className="px-6 py-3 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <button
                              onClick={() => handleSave(s.id!)}
                              disabled={saving}
                              className="px-3 py-1 text-xs bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded"
                            >
                              {saving ? '...' : 'Save'}
                            </button>
                            <button
                              onClick={cancelEdit}
                              className="px-3 py-1 text-xs bg-gray-600 hover:bg-gray-500 text-gray-200 rounded"
                            >
                              Cancel
                            </button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-6 py-4 text-sm">
                          <div>
                            <p className="text-gray-100 font-medium">{s.displayName}</p>
                            <p className="text-gray-500 text-xs">{s.email}</p>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-300">{s.company?.name || '-'}</td>
                        <td className="px-6 py-4 text-sm text-gray-300">{s.phoneNumber || '-'}</td>
                        <td className="px-6 py-4 text-sm text-gray-100 font-medium text-right">
                          USD {(s.creditLimit ?? 0).toFixed(2)}
                        </td>
                        <td className="px-6 py-4 text-sm text-right">
                          <span className={(s.creditUsed ?? 0) > (s.creditLimit ?? 0) * 0.8 ? 'text-yellow-400' : 'text-gray-300'}>
                            USD {(s.creditUsed ?? 0).toFixed(2)}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${s.isActive ? 'bg-green-900/30 text-green-300' : 'bg-red-900/30 text-red-300'}`}>
                            {s.isActive ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <button
                            onClick={() => startEdit(s)}
                            className="px-3 py-1 text-xs bg-gray-700 hover:bg-gray-600 text-gray-200 rounded"
                          >
                            Edit
                          </button>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Info */}
        <div className="bg-gray-800 rounded-lg border border-gray-700 p-5">
          <h2 className="text-base font-semibold text-gray-200 mb-3">Configuration Notes</h2>
          <ul className="space-y-1 text-sm text-gray-400 list-disc list-inside">
            <li>Credit limit controls how much a stockist can owe in pending transfers/loans.</li>
            <li>To add or remove stockists, use the <Link href="/users" className="text-blue-400 hover:underline">Users</Link> page.</li>
            <li>Inactive stockists cannot create new transfers or loans.</li>
          </ul>
        </div>
      </div>
    </ProtectedRoute>
  );
}
