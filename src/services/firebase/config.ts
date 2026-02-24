/**
 * Firebase Configuration
 * Initialize Firebase project configuration
 */

import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import { getAuth, Auth } from 'firebase/auth';
import { getFirestore, Firestore } from 'firebase/firestore';
import { getStorage, FirebaseStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

let app: FirebaseApp;
let auth: Auth;
let db: Firestore;
let storage: FirebaseStorage;

const initializeFirebase = () => {
  if (getApps().length > 0) {
    app = getApps()[0];
    auth = getAuth(app);
    db = getFirestore(app);
    storage = getStorage(app);
    return;
  }

  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
  storage = getStorage(app);
};

if (typeof window !== 'undefined') {
  initializeFirebase();
}

export const getFirebaseApp = (): FirebaseApp => {
  if (!app) initializeFirebase();
  return app;
};

export const getFirebaseAuth = (): Auth => {
  if (!auth) initializeFirebase();
  return auth;
};

export const getFirebaseDb = (): Firestore => {
  if (!db) initializeFirebase();
  return db;
};

export const getFirebaseStorage = (): FirebaseStorage => {
  if (!storage) initializeFirebase();
  return storage;
};

export default {
  app: getFirebaseApp,
  auth: getFirebaseAuth,
  db: getFirebaseDb,
  storage: getFirebaseStorage,
};
