'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { UserService } from '@/services/database/users';
import { User, UserRole } from '@/types/models';

interface TreeNode {
  user: User;
  children: TreeNode[];
}

const roleBadge: Record<UserRole, string> = {
  [UserRole.ADMIN]: 'bg-error/10 text-error border border-error/20',
  [UserRole.STOCKIST]: 'bg-info/10 text-info border border-info/20',
  [UserRole.CUSTOMER]: 'bg-success/10 text-success border border-success/20',
};

function buildTree(users: User[], parentId: string | null): TreeNode[] {
  const list = users.filter((u) => (u.parentUserId || null) === parentId && (u.id || u.email));
  return list
    .map((user) => ({
      user,
      children: buildTree(users, user.id || null),
    }))
    .sort((a, b) => (a.user.displayName || '').localeCompare(b.user.displayName || ''));
}

function TreeNodeComponent({ node, level }: { node: TreeNode; level: number }) {
  const [expanded, setExpanded] = useState(level < 2);
  const hasChildren = node.children.length > 0;
  const indent = level * 24;

  return (
    <div className="select-none">
      <div
        className="flex items-center gap-2 py-2 px-3 rounded-lg hover:bg-surface-2 transition-colors group"
        style={{ paddingLeft: `${indent + 12}px` }}
      >
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="w-5 h-5 flex items-center justify-center text-txt-subtle hover:text-txt-primary shrink-0"
        >
          {hasChildren ? (
            <span className="text-xs">{expanded ? '▼' : '▶'}</span>
          ) : (
            <span className="w-5 inline-block" />
          )}
        </button>
        <Link
          href={`/users/${node.user.id || node.user.email}`}
          className="flex-1 min-w-0 flex items-center gap-2"
        >
          <span className="font-medium text-txt-primary truncate">{node.user.displayName || '—'}</span>
          <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${roleBadge[node.user.role as UserRole] || 'bg-gray-500/10 text-gray-400'}`}>
            {node.user.role}
          </span>
          <span className="text-txt-subtle text-xs truncate hidden sm:inline">{node.user.email || ''}</span>
        </Link>
        <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <Link href={`/users/create?parent=${node.user.id || ''}`} className="px-2 py-1 text-[10px] text-success hover:underline">
            + 下線
          </Link>
          <Link href={`/users/${node.user.id || node.user.email}`} className="px-2 py-1 text-[10px] text-accent-text hover:underline">
            Edit
          </Link>
        </div>
      </div>
      {expanded && hasChildren && (
        <div className="border-l border-border-muted ml-5">
          {node.children.map((child, idx) => (
            <TreeNodeComponent key={child.user.id || child.user.email || idx} node={child} level={level + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function UserHierarchyTree() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadUsers();
  }, []);

  async function loadUsers() {
    try {
      setLoading(true);
      const data = await UserService.getAll();
      setUsers(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error loading users:', error);
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }

  const roots = buildTree(users, null);

  if (loading) {
    return (
      <div className="py-16 text-center">
        <div className="inline-block animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-accent mb-3" />
        <p className="text-txt-subtle text-sm">載入組織架構...</p>
      </div>
    );
  }

  if (roots.length === 0) {
    return (
      <div className="py-16 text-center">
        <p className="text-txt-subtle text-sm">尚無使用者，或請設定 parentUserId 建立上下線關係</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border overflow-hidden bg-surface-1">
      <div className="px-4 py-3 border-b border-border bg-surface-base">
        <p className="text-xs text-txt-subtle">
          金三角架構：總經銷商 → 下線 → 下線的下線，點擊 ▼/▶ 展開/收合
        </p>
      </div>
      <div className="divide-y divide-border-muted">
        {roots.map((node, idx) => (
          <TreeNodeComponent key={node.user.id || node.user.email || idx} node={node} level={0} />
        ))}
      </div>
    </div>
  );
}
