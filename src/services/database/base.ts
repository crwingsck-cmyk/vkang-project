import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  deleteDoc,
  QueryConstraint,
  DocumentData,
  Timestamp,
} from 'firebase/firestore';
import { getFirebaseDb } from '@/services/firebase/config';

function getDb() {
  const d = getFirebaseDb();
  if (!d) throw new Error('Firestore not initialized');
  return d;
}

// Firestore does not accept `undefined` field values — strip them before writing
function stripUndefined<T extends Record<string, unknown>>(data: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(data).filter(([, v]) => v !== undefined)
  ) as Partial<T>;
}

export class FirestoreService {
  static async set<T extends DocumentData>(
    collectionName: string,
    docId: string,
    data: T,
    merge = false
  ) {
    try {
      const clean = stripUndefined(data as Record<string, unknown>);
      await setDoc(doc(getDb(), collectionName, docId), clean, { merge });
      return { id: docId, ...clean };
    } catch (error) {
      console.error(`Error setting document in ${collectionName}:`, error);
      throw error;
    }
  }

  static async get<T extends DocumentData>(
    collectionName: string,
    docId: string
  ): Promise<(T & { id: string }) | null> {
    try {
      const docSnap = await getDoc(doc(getDb(), collectionName, docId));
      return docSnap.exists()
        ? { id: docSnap.id, ...docSnap.data() as T }
        : null;
    } catch (error) {
      console.error(`Error getting document from ${collectionName}:`, error);
      throw error;
    }
  }

  static async query<T extends DocumentData>(
    collectionName: string,
    constraints: QueryConstraint[] = []
  ): Promise<(T & { id: string })[]> {
    try {
      const q = query(collection(getDb(), collectionName), ...constraints);
      const querySnapshot = await getDocs(q);
      return querySnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data() as T,
      }));
    } catch (error) {
      console.error(`Error querying ${collectionName}:`, error);
      throw error;
    }
  }

  static async update<T extends DocumentData>(
    collectionName: string,
    docId: string,
    data: Partial<T>
  ) {
    try {
      const clean = stripUndefined({ ...data, updatedAt: Timestamp.now().toMillis() } as Record<string, unknown>);
      await updateDoc(doc(getDb(), collectionName, docId), clean);
      return { id: docId, ...clean };
    } catch (error) {
      console.error(`Error updating document in ${collectionName}:`, error);
      throw error;
    }
  }

  static async delete(collectionName: string, docId: string) {
    try {
      await deleteDoc(doc(getDb(), collectionName, docId));
      return { success: true };
    } catch (error) {
      console.error(`Error deleting document from ${collectionName}:`, error);
      throw error;
    }
  }
}
