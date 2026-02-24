import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  confirmPasswordReset,
  setPersistence,
  browserLocalPersistence,
  signOut,
} from 'firebase/auth';
import { getFirebaseAuth } from './config';

function getAuth() {
  const a = getFirebaseAuth();
  if (!a) throw new Error('Firebase not initialized');
  return a;
}

/**
 * Register a new user with email and password
 */
export async function registerUser(email: string, password: string) {
  try {
    const userCredential = await createUserWithEmailAndPassword(getAuth(), email, password);
    return userCredential.user;
  } catch (error: any) {
    throw new Error(`Registration failed: ${error.message}`);
  }
}

/**
 * Sign in user with email and password
 */
export async function loginUser(email: string, password: string) {
  try {
    await setPersistence(getAuth(), browserLocalPersistence);
    const userCredential = await signInWithEmailAndPassword(getAuth(), email, password);
    return userCredential.user;
  } catch (error: any) {
    throw new Error(`Login failed: ${error.message}`);
  }
}

/**
 * Send password reset email
 */
export async function resetPassword(email: string) {
  try {
    await sendPasswordResetEmail(getAuth(), email);
    return { success: true };
  } catch (error: any) {
    throw new Error(`Password reset failed: ${error.message}`);
  }
}

/**
 * Confirm password reset with token
 */
export async function confirmReset(code: string, newPassword: string) {
  try {
    await confirmPasswordReset(getAuth(), code, newPassword);
    return { success: true };
  } catch (error: any) {
    throw new Error(`Password confirmation failed: ${error.message}`);
  }
}

/**
 * Logout current user
 */
export async function logoutUser() {
  try {
    await signOut(getAuth());
    return { success: true };
  } catch (error: any) {
    throw new Error(`Logout failed: ${error.message}`);
  }
}

/**
 * Get current user's ID token
 */
export async function getCurrentToken(forceRefresh = false) {
  const authInstance = getFirebaseAuth();
  if (!authInstance?.currentUser) return null;
  try {
    return await authInstance.currentUser.getIdToken(forceRefresh);
  } catch (error) {
    console.error('Error getting token:', error);
    return null;
  }
}
