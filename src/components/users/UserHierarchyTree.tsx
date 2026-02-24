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
  [UserRole.ADMIN]: 'bg-chip-dark text-white border border-chip-dark',
  [UserRole.STOCKIST]: 'bg-chip-cyan text-gray-800 border border-cyan-200',
  [UserRole.CUSTOMER]: 'bg-chip-yellow text-gray-800 border border-amber-200',
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

const INDENT_PER_LEVEL = 28;

function TreeNodeComponent({ node, level }: { node: TreeNode; level: number }) {
  const [expanded, setExpanded] = useState(level < 2);
  const hasChildren = node.children.length > 0;
  const paddingLeft = level * INDENT_PER_LEVEL + 16;

  return (
    <div className="select-none">
      <div
        className="flex items-center gap-3 py-2.5 px-3 rounded-lg hover:bg-surface-2 transition-colors group min-h-[40px]"
        style={{ paddingLeft: `${paddingLeft}px` }}
      >
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="w-6 h-6 flex items-center justify-center rounded text-txt-subtle hover:text-txt-primary hover:bg-surface-3 shrink-0"
        >
          {hasChildren ? (
            <span className="text-xs font-medium">{expanded ? '▼' : '▶'}</span>
          ) : (
            <span className="w-6 inline-block" />
          )}
        </button>
        <Link
          href={`/users/${node.user.id || node.user.email}`}
          className="flex-1 min-w-0 flex items-center gap-2"
        >
          <span className="font-medium text-txt-primary truncate name-lowercase">{node.user.displayName || '—'}</span>
          <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-semibold uppercase shrink-0 ${roleBadge[node.user.role as UserRole] || 'bg-chip-blue text-gray-800 border border-blue-200'}`}>
            {node.user.role}
          </span>
        </Link>
        <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          <Link href={`/users/create?parent=${node.user.id || ''}`} className="px-2 py-1 text-[10px] text-success hover:underline">
            + 下線
          </Link>
          <Link href={`/users/${node.user.id || node.user.email}`} className="px-2 py-1 text-[10px] text-accent-text hover:underline">
            Edit
          </Link>
        </div>
      </div>
      {expanded && hasChildren && (
        <div className="border-l-2 border-border-muted ml-5">
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
    <div className="glass-panel overflow-hidden">
      <div className="px-4 py-3 border-b border-border bg-surface-base">
        <p className="text-xs text-txt-subtle">
          金三角架構：總經銷商 → 下線 → 下線的下線，點擊 ▼/▶ 展開/收合
        </p>
      </div>
      <div className="divide-y divide-border-muted px-4 py-2">
        {roots.map((node, idx) => (
          <TreeNodeComponent key={node.user.id || node.user.email || idx} node={node} level={0} />
        ))}
      </div>
    </div>
  );
}
