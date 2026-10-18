import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { initializeFirestore, doc, getDocFromServer } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
}, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errMessage = error instanceof Error ? error.message : String(error);
  const errCode = (error as any)?.code;

  const isQuota =
    errCode === 'resource-exhausted' ||
    errMessage.toLowerCase().includes('quota') ||
    errMessage.toLowerCase().includes('limit exceeded');

  const isTransient =
    errCode === 'unavailable' ||
    errMessage.toLowerCase().includes('offline') ||
    errMessage.toLowerCase().includes('could not reach') ||
    errMessage.toLowerCase().includes('connection failed') ||
    errMessage.toLowerCase().includes('network');

  if (isQuota || isTransient || operationType === OperationType.LIST) {
    console.warn(`Firestore notice on ${path} (${operationType}): ${errMessage}`);
    return;
  }

  const errInfo: FirestoreErrorInfo = {
    error: errMessage,
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || [],
    },
    operationType,
    path,
  };

  console.warn('Firestore Operation Notice: ', JSON.stringify(errInfo));
}

// Validate connection on startup per Firebase Skill
export async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error) {
      if (
        error.message.includes('the client is offline') ||
        (error as any).code === 'unavailable' ||
        error.message.includes('unavailable') ||
        error.message.toLowerCase().includes('quota')
      ) {
        console.warn('Firestore client is connecting or running in offline sync mode.');
        return;
      }
    }
  }
}
setTimeout(() => {
  testConnection().catch(() => {});
}, 1000);
