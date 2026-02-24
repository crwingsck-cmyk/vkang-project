'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { User as FirebaseUser, onAuthStateChanged, signOut } from 'firebase/auth';
import { getFirebaseAuth } from '@/services/firebase/config';
import { User, UserRole } from '@/types/models';
import { UserService } from '@/services/database/users';

interface AuthContextType {
  firebaseUser: FirebaseUser | null;
  user: User | null;
  role: UserRole | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  logout: () => Promise<void>;
  setUser: (user: User | null) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;

    const finishLoading = () => {
      setIsLoading(false);
    };

    const timeout = setTimeout(() => {
      console.warn('Auth: timeout - Firebase may not be configured. Check Vercel env vars (NEXT_PUBLIC_FIREBASE_*).');
      finishLoading();
    }, 8000);

    try {
      const authInstance = getFirebaseAuth();
      if (!authInstance) {
        finishLoading();
        clearTimeout(timeout);
        return;
      }

      unsubscribe = onAuthStateChanged(authInstance, async (firebaseUser) => {
        clearTimeout(timeout);
        try {
          if (firebaseUser) {
            setFirebaseUser(firebaseUser);
            const firestoreUser = await UserService.getById(firebaseUser.uid);
            if (firestoreUser) {
              setUser(firestoreUser);
              setRole(firestoreUser.role);
              await UserService.updateLastLogin(firebaseUser.uid);
            } else {
              const tempUser: User = {
                id: firebaseUser.uid,
                email: firebaseUser.email || '',
                displayName: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'User',
                role: UserRole.CUSTOMER,
                permissions: [],
                isActive: true,
                isVerified: firebaseUser.emailVerified,
              };
              setUser(tempUser);
              setRole(UserRole.CUSTOMER);
            }
          } else {
            setFirebaseUser(null);
            setUser(null);
            setRole(null);
          }
        } catch (error) {
          console.error('Error fetching user:', error);
        } finally {
          finishLoading();
        }
      });
    } catch (err) {
      console.error('Auth init error:', err);
      clearTimeout(timeout);
      finishLoading();
    }

    return () => {
      clearTimeout(timeout);
      unsubscribe?.();
    };
  }, []);

  const logout = async () => {
    try {
      const authInstance = getFirebaseAuth();
      if (authInstance) {
        await signOut(authInstance);
        setFirebaseUser(null);
        setUser(null);
        setRole(null);
      }
    } catch (error) {
      console.error('Error logging out:', error);
      throw error;
    }
  };

  const value: AuthContextType = {
    firebaseUser,
    user,
    role,
    isAuthenticated: !!firebaseUser,
    isLoading,
    logout,
    setUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
