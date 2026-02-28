import { where, orderBy, limit as firestoreLimit } from 'firebase/firestore';
import { FirestoreService } from './base';
import { User, UserRole } from '@/types/models';

const COLLECTION = 'users';

export const UserService = {
  /**
   * Create a new user
   */
  async create(user: Omit<User, 'id' | 'createdAt' | 'updatedAt'>) {
    const timestamp = Date.now();
    const userData: User = {
      ...user,
      createdAt: timestamp,
      updatedAt: timestamp,
      metadata: {
        loginCount: 0,
        lastActivityDate: timestamp,
      },
    };
    
    return FirestoreService.set(COLLECTION, user.email, userData, false);
  },

  /**
   * Create user with explicit ID (Firebase UID as doc ID)
   */
  async createWithId(id: string, user: Omit<User, 'id' | 'createdAt' | 'updatedAt'>) {
    const timestamp = Date.now();
    const userData: User = {
      ...user,
      id,
      createdAt: timestamp,
      updatedAt: timestamp,
      metadata: {
        loginCount: 0,
        lastActivityDate: timestamp,
      },
    };
    return FirestoreService.set(COLLECTION, id, userData, false);
  },

  /**
   * Get user by ID (Firebase UID)
   */
  async getById(id: string) {
    return FirestoreService.get<User>(COLLECTION, id);
  },

  /**
   * Get user by email
   */
  async getByEmail(email: string) {
    const results = await FirestoreService.query<User>(COLLECTION, [
      where('email', '==', email),
    ]);
    return results.length > 0 ? results[0] : null;
  },

  /**
   * Get all users (admin only) - active only
   */
  async getAll(pageLimit = 100) {
    const constraints = [
      where('isActive', '==', true),
      orderBy('createdAt', 'desc'),
      firestoreLimit(pageLimit),
    ];
    
    return FirestoreService.query<User>(COLLECTION, constraints);
  },

  /**
   * Get all users including inactive (for admin edit form parent dropdown)
   */
  async getAllForAdmin(pageLimit = 200) {
    const constraints = [
      where('isActive', 'in', [true, false]),
      orderBy('createdAt', 'desc'),
      firestoreLimit(pageLimit),
    ];
    return FirestoreService.query<User>(COLLECTION, constraints);
  },

  /**
   * Get users by role
   */
  async getByRole(role: UserRole) {
    const results = await FirestoreService.query<User>(COLLECTION, [
      where('role', '==', role),
    ]);
    return results
      .filter((u) => u.isActive !== false)
      .sort((a, b) => (a.displayName ?? '').localeCompare(b.displayName ?? ''));
  },

  /**
   * Get stockists (agents/resellers)
   */
  async getStockists() {
    return this.getByRole(UserRole.STOCKIST);
  },

  /**
   * Get admins (總經銷商)
   */
  async getAdmins() {
    return this.getByRole(UserRole.ADMIN);
  },

  /**
   * Get direct children (下線) of a user - 金三角架構
   */
  async getChildren(parentId: string) {
    const constraints = [
      where('parentUserId', '==', parentId),
      where('isActive', '==', true),
    ];
    const results = await FirestoreService.query<User>(COLLECTION, constraints);
    return results.sort((a, b) => (a.displayName || '').localeCompare(b.displayName || ''));
  },

  /**
   * Get subtree (all descendants) for building hierarchy - 遞迴取得下線
   */
  async getSubtree(parentId: string): Promise<User[]> {
    const children = await this.getChildren(parentId);
    const all: User[] = [...children];
    for (const child of children) {
      if (child.id) {
        const grandChildren = await this.getSubtree(child.id);
        all.push(...grandChildren);
      }
    }
    return all;
  },

  /**
   * Update user
   */
  async update(id: string, updates: Partial<User>) {
    return FirestoreService.update<User>(COLLECTION, id, updates);
  },

  /**
   * Update user role (admin only)
   */
  async updateRole(id: string, role: UserRole) {
    return FirestoreService.update<User>(COLLECTION, id, { role });
  },

  /**
   * Update user permissions
   */
  async updatePermissions(id: string, permissions: string[]) {
    return FirestoreService.update<User>(COLLECTION, id, { permissions });
  },

  /**
   * Deactivate user (soft delete)
   */
  async deactivate(id: string) {
    return FirestoreService.update<User>(COLLECTION, id, { isActive: false });
  },

  /**
   * Update last login timestamp
   */
  async updateLastLogin(id: string) {
    const updates: Partial<User> = {
      metadata: {
        loginCount: (await this.getById(id))?.metadata?.loginCount || 0 + 1,
        lastActivityDate: Date.now(),
      },
    };
    return FirestoreService.update<User>(COLLECTION, id, updates);
  },
};
