import {
  collection,
  doc,
  getDoc,
  addDoc as _addDoc,
  setDoc as _setDoc,
  updateDoc as _updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  getDocs,
  writeBatch as _writeBatch,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';

/**
 * Recursively cleans data objects before writing to Firestore.
 * Strips all `undefined` values so Firestore never errors with:
 * "Unsupported field value: undefined"
 */
export function cleanData<T>(obj: T): T {
  if (obj === null || obj === undefined) {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(cleanData) as unknown as T;
  }
  if (typeof obj === 'object' && !(obj instanceof Date)) {
    const cleaned: Record<string, any> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (value !== undefined) {
        cleaned[key] = cleanData(value);
      }
    }
    return cleaned as T;
  }
  return obj;
}

const addDoc = async (reference: any, data: any) => _addDoc(reference, cleanData(data));
const setDoc = async (reference: any, data: any, options?: any) =>
  options ? _setDoc(reference, cleanData(data), options) : _setDoc(reference, cleanData(data));
const updateDoc = async (reference: any, data: any, ...moreFieldsAndValues: any[]) => {
  if (moreFieldsAndValues.length > 0) {
    return (_updateDoc as any)(reference, cleanData(data), ...moreFieldsAndValues);
  }
  return _updateDoc(reference, cleanData(data));
};
const writeBatch = (firestore: any) => {
  const batch = _writeBatch(firestore);
  const origSet = batch.set.bind(batch);
  const origUpdate = batch.update.bind(batch);
  batch.set = ((docRef: any, data: any, options?: any) => {
    return options ? origSet(docRef, cleanData(data), options) : origSet(docRef, cleanData(data));
  }) as any;
  batch.update = ((docRef: any, data: any, ...rest: any[]) => {
    return (origUpdate as any)(docRef, cleanData(data), ...rest);
  }) as any;
  return batch;
};
import {
  Department,
  Machine,
  MachineHistoryEntry,
  YearlyPlan,
  MonthlyPlan,
  WeeklyPlan,
  QualityOperation,
  QualityDailyCheck,
  QualityRejection,
  DepartmentWork,
  DepartmentHandover,
  QualityHandover,
  QualityInspectionRecord,
  QualityHoldRecord,
  QualityCorrectiveActionRecord,
  QualityHandoverHistoryEntry,
  SystemNotification,
  AuditLogEntry,
  ImportHistoryEntry,
  MachineDocument,
  UserProfile,
  MachineProcessStage,
  RoadmapItem,
  WorkUpdate,
  AccessoriesOrder,
  AccessoriesItem,
  AccessoriesCompliance,
  AccessoriesOrderHistory,
  OpenCableOrder,
  OpenCableItem,
  OpenCableCompliance,
  OpenCableOrderHistory,
  ComplianceStatus,
  OrderStatus,
  MachineProgressHistory,
  WorkOperationItem,
} from '../types';
import { INITIAL_DEPARTMENTS } from '../constants';
import { isDepartmentMatch, getNextDepartmentInRoute, isQualityDepartment, hasQualityInspectionAccess } from '../utils/departmentUtils';
import {
  getLocalCollection,
  saveLocalCollection,
  upsertLocalItem,
  deleteLocalItem,
  subscribeLocalCollection,
} from '../utils/localFallbackStore';

/**
 * Strict server-side / handler authorization verification for Quality decisions.
 * Enforces that only authenticated users with an authorized Quality or Admin role
 * can accept, reject, hold, or make quality inspection decisions.
 */
export async function verifyQualityDecisionAuthorization(
  explicitProfile?: {
    id?: string;
    userId?: string;
    role?: string;
    department?: string;
    email?: string;
    username?: string;
    displayName?: string;
  } | null,
  userEmail?: string
): Promise<{
  authorized: boolean;
  userId: string;
  role: string;
  reason?: string;
}> {
  let profile = explicitProfile;

  // Retrieve stored session profile from localStorage if running client-side and not explicitly provided
  if (!profile && typeof window !== 'undefined' && window.localStorage) {
    try {
      const raw = localStorage.getItem('ag_ipl_user_session');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.profile) {
          profile = parsed.profile;
        }
      }
    } catch {}
  }

  // Cross-check with persistent user document in Firestore to prevent client tampering
  const lookupId = profile?.id || profile?.userId || (profile?.username ? profile.username.toLowerCase() : null);
  if (lookupId) {
    try {
      const uSnap = await getDoc(doc(db, 'users', lookupId));
      if (uSnap.exists()) {
        const dbProfile = uSnap.data() as UserProfile;
        profile = {
          ...profile,
          ...dbProfile,
        };
      }
    } catch (err) {
      console.warn('Notice cross-checking user profile with Firestore:', err);
    }
  }

  if (!profile) {
    return {
      authorized: false,
      userId: 'unauthenticated',
      role: 'NONE',
      reason: 'User is not authenticated. Please sign in with an authorized Quality or Admin account.',
    };
  }

  const isAuthorized = hasQualityInspectionAccess(profile);
  const actingRole = (profile.role || 'NORMAL_DEPARTMENT').toUpperCase().trim();
  const actingId = profile.id || profile.userId || profile.username || userEmail || 'unknown_user';

  if (!isAuthorized) {
    return {
      authorized: false,
      userId: actingId,
      role: actingRole,
      reason: `User with role '${actingRole}' in department '${profile.department || 'Unknown'}' is NOT authorized to make Quality decisions. Quality decisions (Accept, Reject, Hold, Inspection) are strictly restricted to Quality department and Admin.`,
    };
  }

  return {
    authorized: true,
    userId: actingId,
    role: actingRole,
  };
}

// --- AUDIT LOGGING ---
export async function logAudit(
  action: string,
  module: string,
  recordId: string,
  oldValue: string,
  newValue: string,
  userEmail?: string,
  userId?: string
) {
  try {
    const now = new Date();
    const entry: Omit<AuditLogEntry, 'id'> = {
      userId: userId || 'system',
      userEmail: userEmail || 'system@accurate.in',
      date: now.toISOString().split('T')[0],
      time: now.toTimeString().split(' ')[0],
      action,
      module,
      recordId,
      oldValue,
      newValue,
      timestamp: now.toISOString(),
    };
    await addDoc(collection(db, 'audit_logs'), entry);
  } catch (err) {
    console.error('Failed to write audit log:', err);
  }
}

// --- NOTIFICATIONS ---
export async function createNotification(
  notification: Omit<SystemNotification, 'id' | 'read' | 'createdAt'>
) {
  try {
    const targetDept = notification.recipientDepartment || notification.toDepartment;
    const entry: Omit<SystemNotification, 'id'> = {
      ...notification,
      recipientDepartment: targetDept,
      toDepartment: targetDept,
      read: false,
      isRead: false,
      status: notification.status || 'UNREAD',
      createdAt: new Date().toISOString(),
    };
    await addDoc(collection(db, 'notifications'), entry);
  } catch (err) {
    console.error('Failed to create notification:', err);
  }
}

// --- DEPARTMENTS ---
export function subscribeDepartments(callback: (depts: Department[]) => void) {
  const localUnsub = subscribeLocalCollection<Department>('departments', callback);

  let firestoreUnsub = () => {};
  try {
    firestoreUnsub = onSnapshot(
      collection(db, 'departments'),
      (snap) => {
        if (!snap.empty) {
          const rawList = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Department));
          // Deduplicate by department code or name to ensure unique entries
          const seen = new Set<string>();
          const list: Department[] = [];

          for (const d of rawList) {
            const rawCode = (d.code || '').trim();
            const rawName = (d.name || '').trim();
            // Skip obsolete separated departments
            if (
              rawCode === '01-A' ||
              rawCode === '01-B' ||
              rawCode === '02-A' ||
              rawCode === '02-B' ||
              rawCode === '07' ||
              rawName.includes('01-A') ||
              rawName.includes('01-B') ||
              rawName.includes('02-A') ||
              rawName.includes('02-B') ||
              rawName === '07 Lapping'
            ) {
              continue;
            }

            const key = (d.code || d.name || '').trim().toLowerCase();
            if (!key || seen.has(key)) continue;
            seen.add(key);
            list.push(d);
          }

          // Ensure all 21 initial departments are represented
          for (const initDept of INITIAL_DEPARTMENTS) {
            const hasMatch = list.some((d) => isDepartmentMatch(d.name, initDept.name) || d.code === initDept.code);
            if (!hasMatch) {
              list.push({
                id: initDept.id || initDept.code,
                code: initDept.code,
                name: initDept.name,
                order: initDept.order,
                active: true,
              });
            }
          }

          list.sort((a, b) => (a.order || 0) - (b.order || 0));
          saveLocalCollection('departments', list);
        }
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'departments')
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'departments');
  }

  return () => {
    localUnsub();
    firestoreUnsub();
  };
}

export async function initializeDefaultDepartmentsIfEmpty() {
  try {
    const snap = await getDocs(collection(db, 'departments'));
    const batch = writeBatch(db);
    let mutated = false;

    // 1. Delete obsolete departments if present
    const obsoleteCodes = ['01-a', '01-b', '02-a', '02-b', '07'];
    for (const d of snap.docs) {
      const data = d.data();
      const code = (data.code || '').toLowerCase().trim();
      const name = (data.name || '').toLowerCase().trim();
      if (
        obsoleteCodes.includes(code) ||
        name.includes('01-a') ||
        name.includes('01-b') ||
        name.includes('02-a') ||
        name.includes('02-b') ||
        name === '07 lapping'
      ) {
        batch.delete(d.ref);
        mutated = true;
      }
    }

    // 2. Ensure all 21 standard departments are populated
    const existingCodes = new Set(
      snap.docs.map((d) => (d.data().code || '').trim().toLowerCase())
    );

    for (const d of INITIAL_DEPARTMENTS) {
      const docKey = d.id || d.code;
      const ref = doc(db, 'departments', docKey);
      if (!existingCodes.has(d.code.toLowerCase())) {
        batch.set(ref, {
          id: docKey,
          code: d.code,
          name: d.name,
          order: d.order,
          active: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        mutated = true;
      }
    }

    if (mutated) {
      await batch.commit();
      await logAudit(
        'SYNC_DEPARTMENTS',
        'DEPARTMENTS',
        'all',
        '',
        'Consolidated 21 department structure synced in Firestore'
      );
    }
  } catch (err: any) {
    const msg = err?.message || String(err);
    if (msg.toLowerCase().includes('quota') || msg.toLowerCase().includes('resource-exhausted')) {
      saveLocalCollection('departments', INITIAL_DEPARTMENTS);
      console.warn('Notice: Firestore quota reached; operating with default 21 departments.');
      return;
    }
    console.warn('Notice checking departments initialization:', msg);
  }
}

export async function addDepartment(dept: Omit<Department, 'id'>, userEmail?: string) {
  try {
    const ref = await addDoc(collection(db, 'departments'), {
      ...dept,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    await logAudit('CREATE_DEPARTMENT', 'DEPARTMENTS', ref.id, '', dept.name, userEmail);
    return ref.id;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, 'departments');
  }
}

export async function updateDepartment(id: string, updates: Partial<Department>, userEmail?: string) {
  try {
    await updateDoc(doc(db, 'departments', id), {
      ...updates,
      updatedAt: new Date().toISOString(),
    });
    await logAudit('UPDATE_DEPARTMENT', 'DEPARTMENTS', id, '', JSON.stringify(updates), userEmail);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `departments/${id}`);
  }
}

// --- MACHINES ---
export function subscribeMachines(callback: (machines: Machine[]) => void) {
  const localUnsub = subscribeLocalCollection<Machine>('machines', callback);

  let firestoreUnsub = () => {};
  try {
    firestoreUnsub = onSnapshot(
      collection(db, 'machines'),
      (snap) => {
        if (!snap.empty) {
          const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Machine));
          list.sort((a, b) => a.machineNumber.localeCompare(b.machineNumber));
          saveLocalCollection('machines', list);
        }
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'machines')
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'machines');
  }

  return () => {
    localUnsub();
    firestoreUnsub();
  };
}

export async function addMachine(machine: Omit<Machine, 'id' | 'createdAt' | 'updatedAt'>, userEmail?: string) {
  const now = new Date().toISOString();
  const id = `MACH-${machine.machineNumber || Date.now()}`;
  const fullMachine: Machine = {
    id,
    ...machine,
    createdAt: now,
    updatedAt: now,
  } as Machine;

  upsertLocalItem('machines', fullMachine);

  try {
    const data = cleanData({
      ...machine,
      createdAt: now,
      updatedAt: now,
    });
    const ref = await addDoc(collection(db, 'machines'), data);
    await logAudit('CREATE_MACHINE', 'MACHINES', ref.id, '', `Machine ${machine.machineNumber} (${machine.model})`, userEmail);
    return ref.id;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, 'machines');
    return id;
  }
}

export async function updateMachine(id: string, updates: Partial<Machine>, userEmail?: string, oldVal?: string) {
  const now = new Date().toISOString();
  upsertLocalItem('machines', { id, ...updates, updatedAt: now });

  try {
    await updateDoc(doc(db, 'machines', id), cleanData({
      ...updates,
      updatedAt: now,
    }));
    await logAudit('UPDATE_MACHINE', 'MACHINES', id, oldVal || '', JSON.stringify(updates), userEmail);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `machines/${id}`);
  }
}

export interface MachineProgressUpdateParams {
  machineId: string;
  machineNumber: string;
  department: string;
  currentWork: string;
  employee: string;
  date: string;
  previousProgress: number;
  newProgress: number;
  actualQuantity?: number;
  status: string;
  remarks?: string;
  delayReason?: string;
  expectedCompletionDate?: string;
  attachmentUrl?: string;
  userProfile?: UserProfile | null;
}

/**
 * Updates a machine's production progress on the Shop Floor with strict department-level authorization.
 * Only the currently assigned department (or Admin) can update progress.
 * Records the progress update into the machine_progress_history collection.
 */
export async function recordMachineProgressUpdate(
  params: MachineProgressUpdateParams
): Promise<string> {
  const {
    machineId,
    machineNumber,
    department,
    currentWork,
    employee,
    date,
    previousProgress,
    newProgress,
    actualQuantity,
    status,
    remarks,
    delayReason,
    expectedCompletionDate,
    attachmentUrl,
    userProfile,
  } = params;

  // STRICT AUTHORIZATION: Only current responsible department or ADMIN can update work
  if (userProfile && userProfile.role !== 'ADMIN') {
    const isDeptUser = isDepartmentMatch(userProfile.department, department);
    if (!isDeptUser) {
      throw new Error(
        `UNAUTHORIZED: You belong to ${userProfile.department}, but Machine ${machineNumber} is currently owned by ${department}. Only the current responsible department can update this work.`
      );
    }
  }

  // Validate Progress % strictly between 0 and 100
  const numericProgress = Number(newProgress);
  if (isNaN(numericProgress) || numericProgress < 0 || numericProgress > 100) {
    throw new Error('INVALID PROGRESS: Progress percentage must be between 0% and 100%.');
  }

  const clampedProgress = Math.round(numericProgress);
  const now = new Date().toISOString();
  const today = date || now.split('T')[0];
  const time = new Date().toLocaleTimeString();

  // 1. Resolve real machine document
  let targetRef = doc(db, 'machines', machineId);
  const snapCheck = await getDoc(targetRef).catch(() => null);
  if (!snapCheck || !snapCheck.exists()) {
    const mQuery = query(collection(db, 'machines'), where('machineNumber', '==', machineNumber.trim()));
    const mSnaps = await getDocs(mQuery);
    if (!mSnaps.empty) {
      targetRef = mSnaps.docs[0].ref;
    } else {
      const newRef = await addDoc(collection(db, 'machines'), {
        machineNumber: machineNumber.trim(),
        model: 'Standard',
        machineModel: 'Standard',
        currentDepartment: department,
        responsibleDepartment: department,
        currentWork: currentWork || 'Department Work',
        progress: clampedProgress,
        overallProgressPercent: clampedProgress,
        status: status as any,
        currentStatus: status as any,
        createdAt: now,
        updatedAt: now,
      });
      targetRef = newRef;
    }
  }

  const machineUpdates: Partial<Machine> = {
    progress: clampedProgress,
    overallProgressPercent: clampedProgress,
    currentStatus: status as any,
    status: status as any,
    currentWork: currentWork || undefined,
    currentEmployee: employee || undefined,
    responsibleEmployee: employee || undefined,
    responsibleDepartment: department,
    currentDepartment: department,
    remarks: remarks || undefined,
    delayReason: delayReason || undefined,
    updatedAt: now,
  };

  if (clampedProgress >= 100 && status === 'COMPLETED') {
    machineUpdates.actualCompletionDate = today;
  }

  await updateDoc(targetRef, cleanData(machineUpdates));

  // 2. Synchronize department_work
  try {
    const dwQuery = query(
      collection(db, 'department_work'),
      where('machineNumber', '==', machineNumber.trim()),
      where('department', '==', department)
    );
    const dwDocs = await getDocs(dwQuery);
    if (!dwDocs.empty) {
      for (const dwDoc of dwDocs.docs) {
        await updateDoc(dwDoc.ref, {
          progress: clampedProgress,
          status: clampedProgress >= 100 ? 'Completed' : status === 'DELAYED' ? 'Delayed' : 'In Progress',
          actualQuantity: actualQuantity !== undefined ? Number(actualQuantity) : 1,
          assignedTo: employee || userProfile?.displayName || undefined,
          updatedAt: now,
        });
      }
    } else {
      await addDoc(collection(db, 'department_work'), {
        title: `${currentWork || 'Department Work'} - Machine ${machineNumber}`,
        department,
        machineNumber: machineNumber.trim(),
        machineModel: 'Standard',
        operationWork: currentWork || 'Department Work',
        category: 'Production',
        plannedQuantity: 1,
        actualQuantity: actualQuantity !== undefined ? Number(actualQuantity) : 0,
        progress: clampedProgress,
        status: clampedProgress >= 100 ? 'Completed' : status === 'DELAYED' ? 'Delayed' : 'In Progress',
        priority: 'Medium',
        assignedTo: employee || userProfile?.displayName || 'Department Team',
        assignedDate: today,
        createdAt: now,
        updatedAt: now,
      });
    }
  } catch (err) {
    console.warn('Sync department_work warning:', err);
  }

  // 3. Synchronize monthly_plans
  try {
    const mpQuery = query(
      collection(db, 'monthly_plans'),
      where('machineNumber', '==', machineNumber.trim())
    );
    const mpDocs = await getDocs(mpQuery);
    for (const mpDoc of mpDocs.docs) {
      if (isDepartmentMatch(mpDoc.data().department, department)) {
        await updateDoc(mpDoc.ref, {
          achievementPercent: clampedProgress,
          actualQuantity: actualQuantity !== undefined ? Number(actualQuantity) : undefined,
          status: clampedProgress >= 100 ? 'Completed' : 'In Progress',
          updatedAt: now,
        });
      }
    }
  } catch (err) {
    console.warn('Sync monthly_plans warning:', err);
  }

  // 4. Insert immutable historical entry into machine_progress_history
  const historyEntry: Omit<MachineProgressHistory, 'id'> = {
    machineId: targetRef.id,
    machineNumber,
    department,
    employee: employee || userProfile?.displayName || userProfile?.username || 'Operator',
    date: today,
    time,
    previousProgress: Number(previousProgress) || 0,
    newProgress: clampedProgress,
    actualQuantity: actualQuantity !== undefined ? Number(actualQuantity) : 1,
    status,
    remarks: remarks || '',
    delayReason: delayReason || '',
    expectedCompletionDate: expectedCompletionDate || '',
    attachmentUrl: attachmentUrl || '',
    createdAt: now,
    createdBy: userProfile?.email || userProfile?.username || 'Operator',
  };

  const ref = await addDoc(collection(db, 'machine_progress_history'), historyEntry);
  try {
    await setDoc(doc(db, 'machineProgressHistory', ref.id), { ...historyEntry, id: ref.id });
  } catch {
    // fallback
  }

  // 5. Write Audit Log
  await logAudit(
    'MACHINE_PROGRESS_UPDATE',
    'MACHINES',
    targetRef.id,
    `Progress: ${previousProgress}%`,
    `Updated to ${clampedProgress}% (${status}) by ${employee || userProfile?.displayName}`,
    userProfile?.email
  );

  return ref.id;
}

/**
 * Initiates work on a machine (Start Work).
 */
export async function startMachineWork(params: {
  machineId: string;
  machineNumber: string;
  department: string;
  employee?: string;
  remarks?: string;
  userProfile?: UserProfile | null;
}): Promise<void> {
  const { machineId, machineNumber, department, employee, remarks, userProfile } = params;

  if (userProfile && userProfile.role !== 'ADMIN') {
    if (!isDepartmentMatch(userProfile.department, department)) {
      throw new Error(
        `UNAUTHORIZED: You belong to ${userProfile.department}, but Machine ${machineNumber} is owned by ${department}.`
      );
    }
  }

  const now = new Date().toISOString();
  const today = now.split('T')[0];

  let targetRef = doc(db, 'machines', machineId);
  const snapCheck = await getDoc(targetRef).catch(() => null);
  if (!snapCheck || !snapCheck.exists()) {
    const mQuery = query(collection(db, 'machines'), where('machineNumber', '==', machineNumber.trim()));
    const mSnaps = await getDocs(mQuery);
    if (!mSnaps.empty) {
      targetRef = mSnaps.docs[0].ref;
    }
  }

  await updateDoc(targetRef, {
    status: 'IN_PROGRESS',
    currentStatus: 'In Progress',
    actualStartDate: today,
    currentEmployee: employee || userProfile?.displayName || 'Operator',
    responsibleEmployee: employee || userProfile?.displayName || 'Operator',
    updatedAt: now,
  });

  // Update department_work
  try {
    const dwQuery = query(
      collection(db, 'department_work'),
      where('machineNumber', '==', machineNumber.trim()),
      where('department', '==', department)
    );
    const dwDocs = await getDocs(dwQuery);
    if (!dwDocs.empty) {
      for (const dwDoc of dwDocs.docs) {
        await updateDoc(dwDoc.ref, {
          status: 'In Progress',
          assignedTo: employee || userProfile?.displayName || 'Operator',
          updatedAt: now,
        });
      }
    } else {
      await addDoc(collection(db, 'department_work'), {
        title: `Production Work - Machine ${machineNumber}`,
        department,
        machineNumber: machineNumber.trim(),
        machineModel: 'Standard',
        operationWork: 'Production Work',
        category: 'Production',
        plannedQuantity: 1,
        actualQuantity: 0,
        progress: 0,
        status: 'In Progress',
        priority: 'Medium',
        assignedTo: employee || userProfile?.displayName || 'Department Team',
        assignedDate: today,
        createdAt: now,
        updatedAt: now,
      });
    }
  } catch (err) {
    console.warn('startMachineWork dw update warning:', err);
  }

  // History entry
  await addDoc(collection(db, 'machine_progress_history'), {
    machineId: targetRef.id,
    machineNumber,
    department,
    employee: employee || userProfile?.displayName || 'Operator',
    date: today,
    time: new Date().toLocaleTimeString(),
    previousProgress: 0,
    newProgress: 0,
    actualQuantity: 1,
    status: 'IN_PROGRESS',
    remarks: remarks || 'Work initiated on Shop Floor',
    createdAt: now,
    createdBy: userProfile?.email || 'Operator',
  });

  await logAudit(
    'START_MACHINE_WORK',
    'MACHINES',
    targetRef.id,
    '',
    `Started work on Machine ${machineNumber} in ${department}`,
    userProfile?.email
  );
}

/**
 * Updates a specific work operation's status and automatically recalculates overall progress %.
 * If 100% of operations are completed, machine status transitions to READY_FOR_HANDOVER.
 */
export async function updateMachineOperationStatus(
  machineId: string,
  operationId: string,
  newStatus: 'Not Started' | 'In Progress' | 'Completed',
  userProfile?: UserProfile | null,
  remarks?: string
): Promise<number> {
  const mRef = doc(db, 'machines', machineId);
  const mSnap = await getDoc(mRef);
  if (!mSnap.exists()) throw new Error('Machine not found in database.');
  const mData = mSnap.data() as Machine;

  // STRICT AUTHORIZATION: Only current responsible department or ADMIN
  if (userProfile && userProfile.role !== 'ADMIN') {
    const isDeptUser = isDepartmentMatch(userProfile.department, mData.responsibleDepartment || mData.currentDepartment);
    if (!isDeptUser) {
      throw new Error(`UNAUTHORIZED: You belong to ${userProfile.department}, but Machine ${mData.machineNumber} is managed by ${mData.responsibleDepartment || mData.currentDepartment}.`);
    }
  }

  let existingOps: WorkOperationItem[] = mData.operations && mData.operations.length > 0
    ? [...mData.operations]
    : [
        { id: `op_1`, name: 'Material & Parts Preparation', department: mData.responsibleDepartment, status: 'Not Started' },
        { id: `op_2`, name: 'Manufacturing / Assembly Process', department: mData.responsibleDepartment, status: 'Not Started' },
        { id: `op_3`, name: 'Quality Inspection & Verification', department: mData.responsibleDepartment, status: 'Not Started' },
      ];

  const now = new Date().toISOString();
  const today = now.split('T')[0];

  const opIndex = existingOps.findIndex((o) => o.id === operationId);
  if (opIndex >= 0) {
    existingOps[opIndex] = {
      ...existingOps[opIndex],
      status: newStatus,
      completedDate: newStatus === 'Completed' ? today : undefined,
      completedBy: userProfile?.displayName || userProfile?.username || 'Operator',
      remarks: remarks || existingOps[opIndex].remarks,
    };
  }

  // Automatic progress calculation: completed operations / total operations * 100
  const totalOps = existingOps.length;
  const completedOps = existingOps.filter((o) => o.status === 'Completed').length;
  const calculatedProgress = totalOps > 0 ? Math.round((completedOps / totalOps) * 100) : (mData.progress || 0);

  const updates: Partial<Machine> = {
    operations: existingOps,
    progress: calculatedProgress,
    overallProgressPercent: calculatedProgress,
    updatedAt: now,
  };

  if (calculatedProgress === 100) {
    updates.status = 'READY_FOR_HANDOVER';
    updates.currentStatus = 'Ready for Handover';
    await createNotification({
      recipientRole: 'PLANNING',
      recipientDepartment: mData.responsibleDepartment || mData.currentDepartment,
      toDepartment: mData.responsibleDepartment || mData.currentDepartment,
      fromDepartment: mData.responsibleDepartment || mData.currentDepartment,
      title: `Machine ${mData.machineNumber} Ready for Handover (100%)`,
      message: `All operations for Machine ${mData.machineNumber} have reached 100% completion in ${mData.responsibleDepartment || mData.currentDepartment}. Ready for department handover.`,
      type: 'HANDOVER_READY',
      machineNumber: mData.machineNumber,
      status: 'UNREAD',
    });
  } else if (calculatedProgress > 0) {
    updates.status = 'IN_PROGRESS';
    updates.currentStatus = 'In Progress';
  }

  await updateDoc(mRef, updates);

  // Sync to department_work
  try {
    const wQuery = query(collection(db, 'department_work'), where('machineNumber', '==', mData.machineNumber));
    const wDocs = await getDocs(wQuery);
    for (const wDoc of wDocs.docs) {
      await updateDoc(wDoc.ref, {
        operations: existingOps,
        progress: calculatedProgress,
        status: calculatedProgress === 100 ? 'Completed' : 'In Progress',
        updatedAt: now,
      });
    }
  } catch (err) {
    console.warn('Sync to department_work warning:', err);
  }

  await logAudit(
    'UPDATE_OPERATION_STATUS',
    'MACHINES',
    machineId,
    `Op: ${operationId}`,
    `Status -> ${newStatus} (${calculatedProgress}% total) by ${userProfile?.displayName || userProfile?.email}`,
    userProfile?.email
  );

  return calculatedProgress;
}

/**
 * Marks a machine's departmental work as 100% COMPLETED.
 * Enforces the 100% completion rule: Work CANNOT be completed unless progress has reached 100%.
 */
export async function completeMachineWork(
  params: {
    machineId: string;
    machineNumber: string;
    department: string;
    employee: string;
    actualCompletionDate: string;
    actualQuantity?: number;
    remarks?: string;
    attachmentUrl?: string;
    userProfile?: UserProfile | null;
  }
): Promise<void> {
  const {
    machineId,
    machineNumber,
    department,
    employee,
    actualCompletionDate,
    actualQuantity,
    remarks,
    attachmentUrl,
    userProfile,
  } = params;

  // STRICT AUTHORIZATION: Only current responsible department or ADMIN
  if (userProfile && userProfile.role !== 'ADMIN') {
    if (!isDepartmentMatch(userProfile.department, department)) {
      throw new Error(
        `UNAUTHORIZED: Only the current responsible department (${department}) can mark this work completed.`
      );
    }
  }

  const now = new Date().toISOString();
  const completionDate = actualCompletionDate || now.split('T')[0];

  // Resolve target machine ref safely
  let targetRef = doc(db, 'machines', machineId);
  const snapCheck = await getDoc(targetRef).catch(() => null);
  if (!snapCheck || !snapCheck.exists()) {
    const mQuery = query(collection(db, 'machines'), where('machineNumber', '==', machineNumber.trim()));
    const mSnaps = await getDocs(mQuery);
    if (!mSnaps.empty) {
      targetRef = mSnaps.docs[0].ref;
    }
  }

  // Bring machine work to 100% completion and mark ready for handover
  const mSnap = await getDoc(targetRef);
  let updatedOps: any[] | undefined = undefined;
  if (mSnap.exists()) {
    const data = mSnap.data() as Machine;
    if (Array.isArray(data.operations)) {
      updatedOps = data.operations.map((op) => ({
        ...op,
        status: 'Completed',
        completedDate: completionDate,
        completedBy: employee,
      }));
    }
  }

  await updateDoc(targetRef, cleanData({
    progress: 100,
    departmentProgress: 100,
    overallProgressPercent: 100,
    status: 'READY_FOR_HANDOVER',
    currentStatus: 'Ready for Handover',
    actualCompletionDate: completionDate,
    completedDate: completionDate,
    operations: updatedOps,
    remarks: remarks || undefined,
    updatedAt: now,
  }));

  // Synchronize department_work
  try {
    const dwQuery = query(
      collection(db, 'department_work'),
      where('machineNumber', '==', machineNumber.trim()),
      where('department', '==', department)
    );
    const dwDocs = await getDocs(dwQuery);
    if (!dwDocs.empty) {
      for (const dwDoc of dwDocs.docs) {
        await updateDoc(dwDoc.ref, {
          progress: 100,
          status: 'Completed',
          completedDate: completionDate,
          actualQuantity: actualQuantity !== undefined ? Number(actualQuantity) : 1,
          updatedAt: now,
        });
      }
    } else {
      await addDoc(collection(db, 'department_work'), {
        title: `Completed Work - Machine ${machineNumber}`,
        department,
        machineNumber: machineNumber.trim(),
        machineModel: 'Standard',
        operationWork: 'Completed Work',
        category: 'Production',
        plannedQuantity: 1,
        actualQuantity: actualQuantity !== undefined ? Number(actualQuantity) : 1,
        progress: 100,
        status: 'Completed',
        priority: 'Medium',
        assignedTo: employee || userProfile?.displayName || 'Department Team',
        assignedDate: completionDate,
        completedDate: completionDate,
        createdAt: now,
        updatedAt: now,
      });
    }
  } catch (err) {
    console.warn('Sync department_work in completeMachineWork warning:', err);
  }

  // Synchronize monthly_plans
  try {
    const mpQuery = query(
      collection(db, 'monthly_plans'),
      where('machineNumber', '==', machineNumber.trim())
    );
    const mpDocs = await getDocs(mpQuery);
    for (const mpDoc of mpDocs.docs) {
      if (isDepartmentMatch(mpDoc.data().department, department)) {
        await updateDoc(mpDoc.ref, {
          achievementPercent: 100,
          status: 'Completed',
          updatedAt: now,
        });
      }
    }
  } catch (err) {
    console.warn('Sync monthly_plans in completeMachineWork warning:', err);
  }

  // Record historical completion
  const historyEntry: Omit<MachineProgressHistory, 'id'> = {
    machineId: targetRef.id,
    machineNumber,
    department,
    employee: employee || userProfile?.displayName || 'Operator',
    date: completionDate,
    time: new Date().toLocaleTimeString(),
    previousProgress: 100,
    newProgress: 100,
    actualQuantity: actualQuantity || 1,
    status: 'COMPLETED',
    remarks: remarks || 'Work completed and validated at 100%',
    attachmentUrl: attachmentUrl || '',
    createdAt: now,
    createdBy: userProfile?.email || 'Operator',
  };

  const ref = await addDoc(collection(db, 'machine_progress_history'), historyEntry);
  try {
    await setDoc(doc(db, 'machineProgressHistory', ref.id), { ...historyEntry, id: ref.id });
  } catch {}

  await logAudit(
    'COMPLETE_MACHINE_WORK',
    'MACHINES',
    targetRef.id,
    'IN_PROGRESS',
    `Work marked 100% COMPLETED by ${employee || userProfile?.displayName}`,
    userProfile?.email
  );
}

/**
 * Subscribes to real progress history updates for a specific machine.
 */
export function subscribeMachineProgressHistory(
  machineNumber: string,
  callback: (entries: MachineProgressHistory[]) => void
) {
  const q = query(
    collection(db, 'machine_progress_history'),
    where('machineNumber', '==', machineNumber)
  );

  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as MachineProgressHistory));
      list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      callback(list);
    },
    (err) => handleFirestoreError(err, OperationType.LIST, 'machine_progress_history')
  );
}

export async function deleteMachine(id: string, machineNo: string, userEmail?: string) {
  try {
    await deleteDoc(doc(db, 'machines', id));
    await logAudit('DELETE_MACHINE', 'MACHINES', id, machineNo, 'DELETED', userEmail);
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `machines/${id}`);
  }
}

export async function updateMachineProcessStage(
  machineId: string,
  stage: MachineProcessStage,
  existingStages: Record<string, MachineProcessStage> = {},
  userEmail?: string
) {
  try {
    const updatedStages = {
      ...existingStages,
      [stage.departmentCode]: {
        ...stage,
        updatedAt: new Date().toISOString(),
        updatedBy: userEmail || 'Operator',
      },
    };

    // Calculate Completed vs Applicable processes
    const stageValues = Object.values(updatedStages);
    const applicableStages = stageValues.filter((s) => s.status !== 'N/A');
    const completedStages = applicableStages.filter((s) => s.status === 'Completed');
    const applicableCount = applicableStages.length;
    const completedCount = completedStages.length;
    const overallProgress =
      applicableCount > 0 ? Math.round((completedCount / applicableCount) * 100) : 0;

    await updateMachine(
      machineId,
      {
        processStages: updatedStages,
        completedProcessesCount: completedCount,
        applicableProcessesCount: applicableCount,
        overallProgressPercent: overallProgress,
      },
      userEmail,
      `Stage ${stage.departmentCode} -> ${stage.status}`
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `machines/${machineId}/processStages`);
  }
}

// --- PLANS (Yearly, Monthly, Weekly) ---
export function subscribeYearlyPlans(callback: (plans: YearlyPlan[]) => void) {
  const localUnsub = subscribeLocalCollection<YearlyPlan>('yearly_plans', callback);

  let firestoreUnsub = () => {};
  try {
    firestoreUnsub = onSnapshot(
      collection(db, 'yearly_plans'),
      (snap) => {
        if (!snap.empty) {
          const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as YearlyPlan));
          saveLocalCollection('yearly_plans', list);
        }
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'yearly_plans')
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'yearly_plans');
  }

  return () => {
    localUnsub();
    firestoreUnsub();
  };
}

export async function addYearlyPlan(plan: Omit<YearlyPlan, 'id' | 'createdAt' | 'updatedAt'>, userEmail?: string) {
  try {
    const now = new Date().toISOString();
    const ref = await addDoc(collection(db, 'yearly_plans'), { ...plan, createdAt: now, updatedAt: now });
    await logAudit('CREATE_YEARLY_PLAN', 'PLANNING', ref.id, '', `Year ${plan.year} - Dept: ${plan.department}`, userEmail);
    return ref.id;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, 'yearly_plans');
  }
}

export async function updateYearlyPlan(id: string, updates: Partial<YearlyPlan>, userEmail?: string) {
  try {
    await updateDoc(doc(db, 'yearly_plans', id), { ...updates, updatedAt: new Date().toISOString() });
    await logAudit('UPDATE_YEARLY_PLAN', 'PLANNING', id, '', JSON.stringify(updates), userEmail);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `yearly_plans/${id}`);
  }
}

export async function deleteYearlyPlan(id: string, userEmail?: string) {
  try {
    await deleteDoc(doc(db, 'yearly_plans', id));
    await logAudit('DELETE_YEARLY_PLAN', 'PLANNING', id, '', 'DELETED', userEmail);
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `yearly_plans/${id}`);
  }
}

export function subscribeMonthlyPlans(callback: (plans: MonthlyPlan[]) => void) {
  const localUnsub = subscribeLocalCollection<MonthlyPlan>('monthly_plans', callback);

  let firestoreUnsub = () => {};
  try {
    firestoreUnsub = onSnapshot(
      collection(db, 'monthly_plans'),
      (snap) => {
        if (!snap.empty) {
          const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as MonthlyPlan));
          saveLocalCollection('monthly_plans', list);
        }
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'monthly_plans')
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'monthly_plans');
  }

  return () => {
    localUnsub();
    firestoreUnsub();
  };
}

export async function addMonthlyPlan(plan: Omit<MonthlyPlan, 'id' | 'createdAt' | 'updatedAt'>, userEmail?: string) {
  try {
    const now = new Date().toISOString();
    const today = now.split('T')[0];
    const ref = await addDoc(collection(db, 'monthly_plans'), { ...plan, createdAt: now, updatedAt: now });
    await logAudit('CREATE_MONTHLY_PLAN', 'PLANNING', ref.id, '', `${plan.month} ${plan.year} - ${plan.department}`, userEmail);

    // Requirement 1 & 28: Monthly Plan -> Automatic Machine Tracking & Department Work
    if (plan.machineNumber && plan.machineNumber.trim()) {
      const cleanNum = plan.machineNumber.trim();
      const mQuery = query(collection(db, 'machines'), where('machineNumber', '==', cleanNum));
      const mSnap = await getDocs(mQuery);

      const defaultOps: WorkOperationItem[] = [
        { id: `op_${Date.now()}_1`, name: 'Material & Parts Preparation', department: plan.department, status: 'Not Started' },
        { id: `op_${Date.now()}_2`, name: 'Manufacturing / Assembly Process', department: plan.department, status: 'Not Started' },
        { id: `op_${Date.now()}_3`, name: 'Quality Inspection & Verification', department: plan.department, status: 'Not Started' },
      ];

      if (mSnap.empty) {
        // Automatically create machine record in master database
        const newMachine: Omit<Machine, 'id'> = {
          machineNumber: cleanNum,
          model: plan.machineModel || 'Standard',
          machineModel: plan.machineModel || 'Standard',
          currentDepartment: plan.department,
          responsibleDepartment: plan.department,
          project: plan.project || '',
          customer: plan.customer || '',
          planMonth: plan.month,
          planYear: String(plan.year || new Date().getFullYear()),
          priority: plan.priority || 'P01',
          currentWork: plan.operationWork || plan.task || plan.process || 'Planned Department Work',
          progress: plan.achievementPercent || 0,
          overallProgressPercent: plan.achievementPercent || 0,
          status: 'IN_PROGRESS',
          currentStatus: 'In Progress',
          plannedStartDate: plan.plannedStartDate || today,
          plannedDueDate: plan.plannedEndDate || '',
          targetDate: plan.plannedEndDate || '',
          assignedDate: plan.plannedStartDate || today,
          dueDate: plan.plannedEndDate || '',
          operations: defaultOps,
          createdAt: now,
          updatedAt: now,
          createdBy: userEmail || 'Monthly Planning Master',
        };
        await addDoc(collection(db, 'machines'), newMachine);
      } else {
        // Enrich existing machine if missing planned dates or department work
        const existingDoc = mSnap.docs[0];
        const existingData = existingDoc.data() as Machine;
        const updates: Partial<Machine> = {
          updatedAt: now,
          planMonth: existingData.planMonth || plan.month,
          planYear: existingData.planYear || String(plan.year || new Date().getFullYear()),
          priority: existingData.priority || plan.priority || 'P01',
          currentWork: existingData.currentWork || plan.operationWork || plan.task || 'Planned Department Work',
          plannedDueDate: existingData.plannedDueDate || plan.plannedEndDate || '',
          targetDate: existingData.targetDate || plan.plannedEndDate || '',
          dueDate: existingData.dueDate || plan.plannedEndDate || '',
        };
        if (!existingData.operations || existingData.operations.length === 0) {
          updates.operations = defaultOps;
        }
        await updateDoc(existingDoc.ref, updates);
      }

      // Check and automatically create Department Work in department_work collection
      const wQuery = query(
        collection(db, 'department_work'),
        where('machineNumber', '==', cleanNum),
        where('department', '==', plan.department)
      );
      const wSnap = await getDocs(wQuery);
      if (wSnap.empty) {
        await addDoc(collection(db, 'department_work'), {
          title: `${plan.operationWork || 'Planned Work'} - Machine ${cleanNum}`,
          department: plan.department,
          machineNumber: cleanNum,
          machineModel: plan.machineModel || 'Standard',
          operationWork: plan.operationWork || 'Planned Department Work',
          category: plan.category || 'Production',
          plannedQuantity: plan.plannedQuantity || 1,
          actualQuantity: plan.actualQuantity || 0,
          status: 'In Progress',
          priority: plan.priority || 'Medium',
          assignedTo: plan.responsibleEmployee || 'Department Team',
          assignedDate: plan.plannedStartDate || today,
          targetDate: plan.plannedEndDate || '',
          dueDate: plan.plannedEndDate || '',
          remarks: plan.remarks || `Auto-allocated from ${plan.month} ${plan.year} Monthly Plan`,
          progress: plan.achievementPercent || 0,
          operations: defaultOps,
          createdAt: now,
          updatedAt: now,
          createdBy: userEmail || 'Monthly Plan Auto-Allocation',
        });
      }

      // Send live notification to assigned department
      await createNotification({
        recipientDepartment: plan.department,
        toDepartment: plan.department,
        fromDepartment: '01 Planning',
        title: `Machine ${cleanNum} Assigned (${plan.month} ${plan.year})`,
        message: `Machine ${cleanNum} (${plan.machineModel || 'Standard'}) has been assigned to ${plan.department} from the approved Monthly Plan. Priority: ${plan.priority || 'P01'}. Target Date: ${plan.plannedEndDate || 'Unscheduled'}.`,
        type: 'PLAN_ASSIGNED',
        machineNumber: cleanNum,
        priority: plan.priority || 'Medium',
        status: 'UNREAD',
      });
    }

    return ref.id;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, 'monthly_plans');
  }
}

export async function updateMonthlyPlan(id: string, updates: Partial<MonthlyPlan>, userEmail?: string) {
  try {
    await updateDoc(doc(db, 'monthly_plans', id), { ...updates, updatedAt: new Date().toISOString() });
    await logAudit('UPDATE_MONTHLY_PLAN', 'PLANNING', id, '', JSON.stringify(updates), userEmail);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `monthly_plans/${id}`);
  }
}

export async function deleteMonthlyPlan(id: string, userEmail?: string) {
  try {
    await deleteDoc(doc(db, 'monthly_plans', id));
    await logAudit('DELETE_MONTHLY_PLAN', 'PLANNING', id, '', 'DELETED', userEmail);
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `monthly_plans/${id}`);
  }
}

export function subscribeWeeklyPlans(callback: (plans: WeeklyPlan[]) => void) {
  const localUnsub = subscribeLocalCollection<WeeklyPlan>('weekly_plans', callback);

  let firestoreUnsub = () => {};
  try {
    firestoreUnsub = onSnapshot(
      collection(db, 'weekly_plans'),
      (snap) => {
        if (!snap.empty) {
          const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as WeeklyPlan));
          saveLocalCollection('weekly_plans', list);
        }
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'weekly_plans')
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'weekly_plans');
  }

  return () => {
    localUnsub();
    firestoreUnsub();
  };
}

export async function addWeeklyPlan(plan: Omit<WeeklyPlan, 'id' | 'createdAt' | 'updatedAt'>, userEmail?: string) {
  try {
    const now = new Date().toISOString();
    const today = now.split('T')[0];
    const ref = await addDoc(collection(db, 'weekly_plans'), { ...plan, createdAt: now, updatedAt: now });
    await logAudit('CREATE_WEEKLY_PLAN', 'PLANNING', ref.id, '', `Week ${plan.weekStartDate} - ${plan.department}`, userEmail);

    // Requirement 3: Connect Weekly Plan to existing Monthly Plan machine record (ONE MACHINE = ONE ROADMAP)
    if (plan.machineNumber && plan.machineNumber.trim()) {
      const cleanNum = plan.machineNumber.trim();
      const mQ = query(collection(db, 'machines'), where('machineNumber', '==', cleanNum));
      const mSnap = await getDocs(mQ);

      if (!mSnap.empty) {
        const mDoc = mSnap.docs[0];
        const mData = mDoc.data() as Machine;
        const updates: Partial<Machine> = {
          weeklyPlanId: ref.id,
          weekNumber: plan.weekNumber ? `Week ${plan.weekNumber}` : undefined,
          updatedAt: now,
        };
        if (plan.operationWork || plan.task) {
          updates.currentWork = plan.operationWork || plan.task;
        }
        if (plan.targetDate || plan.dueDate) {
          updates.targetDate = plan.targetDate || plan.dueDate;
        }
        await updateDoc(mDoc.ref, cleanData(updates));
      }

      // Connect or update department_work for this department
      const dwQ = query(
        collection(db, 'department_work'),
        where('machineNumber', '==', cleanNum),
        where('department', '==', plan.department)
      );
      const dwSnap = await getDocs(dwQ);
      if (!dwSnap.empty) {
        const dwDoc = dwSnap.docs[0];
        await updateDoc(dwDoc.ref, {
          title: `${plan.operationWork || plan.task || 'Weekly Operations'} - Machine ${cleanNum}`,
          operationWork: plan.operationWork || plan.task || 'Weekly Operations',
          targetDate: plan.targetDate || plan.dueDate || dwDoc.data().targetDate || '',
          assignedTo: plan.responsibleEmployee || dwDoc.data().assignedTo || 'Department Team',
          updatedAt: now,
        });
      } else {
        await addDoc(collection(db, 'department_work'), {
          title: `${plan.operationWork || plan.task || 'Weekly Work'} - Machine ${cleanNum}`,
          department: plan.department,
          machineNumber: cleanNum,
          machineModel: plan.machineModel || 'Standard',
          operationWork: plan.operationWork || plan.task || 'Weekly Operations',
          category: 'Production',
          plannedQuantity: plan.plannedQuantity || 1,
          actualQuantity: 0,
          status: 'In Progress',
          priority: plan.priority || 'Medium',
          assignedTo: plan.responsibleEmployee || 'Department Team',
          assignedDate: plan.weekStartDate || today,
          targetDate: plan.targetDate || plan.dueDate || '',
          dueDate: plan.targetDate || plan.dueDate || '',
          progress: 0,
          createdAt: now,
          updatedAt: now,
          createdBy: userEmail || 'Weekly Plan Auto-Allocation',
        });
      }

      // Send notification to department
      await createNotification({
        recipientDepartment: plan.department,
        toDepartment: plan.department,
        fromDepartment: '01 Planning',
        title: `Weekly Work Assigned: Machine ${cleanNum}`,
        message: `Machine ${cleanNum} assigned for Week starting ${plan.weekStartDate}. Work: ${plan.operationWork || plan.task || 'Weekly Operations'}. Target: ${plan.targetDate || 'Pending'}.`,
        type: 'WORK_ASSIGNED',
        machineNumber: cleanNum,
        priority: 'Normal',
        status: 'UNREAD',
        isRead: false,
      });
    }

    return ref.id;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, 'weekly_plans');
  }
}

export async function updateWeeklyPlan(id: string, updates: Partial<WeeklyPlan>, userEmail?: string) {
  try {
    await updateDoc(doc(db, 'weekly_plans', id), { ...updates, updatedAt: new Date().toISOString() });
    await logAudit('UPDATE_WEEKLY_PLAN', 'PLANNING', id, '', JSON.stringify(updates), userEmail);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `weekly_plans/${id}`);
  }
}

export async function deleteWeeklyPlan(id: string, userEmail?: string) {
  try {
    await deleteDoc(doc(db, 'weekly_plans', id));
    await logAudit('DELETE_WEEKLY_PLAN', 'PLANNING', id, '', 'DELETED', userEmail);
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `weekly_plans/${id}`);
  }
}

// --- ROADMAP & TIMELINE ---
export function subscribeRoadmapItems(callback: (items: RoadmapItem[]) => void) {
  const localUnsub = subscribeLocalCollection<RoadmapItem>('roadmap_items', callback);

  let firestoreUnsub = () => {};
  try {
    firestoreUnsub = onSnapshot(
      collection(db, 'roadmap_items'),
      (snap) => {
        if (!snap.empty) {
          const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as RoadmapItem));
          list.sort((a, b) => (a.startDate || '').localeCompare(b.startDate || ''));
          saveLocalCollection('roadmap_items', list);
        }
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'roadmap_items')
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'roadmap_items');
  }

  return () => {
    localUnsub();
    firestoreUnsub();
  };
}

export async function addRoadmapItem(item: Omit<RoadmapItem, 'id' | 'createdAt' | 'updatedAt'>, userEmail?: string) {
  try {
    const now = new Date().toISOString();
    const ref = await addDoc(collection(db, 'roadmap_items'), {
      ...item,
      createdAt: now,
      updatedAt: now,
    });
    await logAudit('CREATE_ROADMAP_ITEM', 'PLANNING', ref.id, '', `${item.project} - ${item.task}`, userEmail);
    return ref.id;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, 'roadmap_items');
  }
}

export async function updateRoadmapItem(id: string, updates: Partial<RoadmapItem>, userEmail?: string) {
  try {
    await updateDoc(doc(db, 'roadmap_items', id), {
      ...updates,
      updatedAt: new Date().toISOString(),
    });
    await logAudit('UPDATE_ROADMAP_ITEM', 'PLANNING', id, '', JSON.stringify(updates), userEmail);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `roadmap_items/${id}`);
  }
}

export async function deleteRoadmapItem(id: string, taskTitle: string, userEmail?: string) {
  try {
    await deleteDoc(doc(db, 'roadmap_items', id));
    await logAudit('DELETE_ROADMAP_ITEM', 'PLANNING', id, taskTitle, 'DELETED', userEmail);
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `roadmap_items/${id}`);
  }
}

// --- QUALITY OPERATION MASTER (Model-Wise) ---
export function subscribeQualityOperations(callback: (ops: QualityOperation[]) => void) {
  const localUnsub = subscribeLocalCollection<QualityOperation>('quality_operations', callback);

  let firestoreUnsub = () => {};
  try {
    firestoreUnsub = onSnapshot(
      collection(db, 'operations'),
      (snap) => {
        if (!snap.empty) {
          const ops = snap.docs.map((d) => {
            const data = d.data();
            const active = data.active !== undefined ? data.active : (data.status ? data.status === 'Active' : true);
            return {
              id: d.id,
              ...data,
              active,
              status: data.status || (active ? 'Active' : 'Inactive'),
              specification: data.specification || data.specificationRequirement || '',
              specificationRequirement: data.specificationRequirement || data.specification || '',
            } as QualityOperation;
          });
          saveLocalCollection('quality_operations', ops);
        }
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'operations')
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'operations');
  }

  return () => {
    localUnsub();
    firestoreUnsub();
  };
}

export async function checkDuplicateOperation(
  machineModel: string,
  operationName: string,
  partCode?: string,
  category?: string,
  excludeId?: string
): Promise<boolean> {
  try {
    const q = query(
      collection(db, 'operations'),
      where('machineModel', '==', machineModel.trim()),
      where('operationName', '==', operationName.trim())
    );
    const snap = await getDocs(q);
    const match = snap.docs.find((d) => {
      if (excludeId && d.id === excludeId) return false;
      const data = d.data();
      const sameCategory = !category || (data.category || '').toLowerCase() === category.toLowerCase();
      const samePart = !partCode || (data.partCode || '').trim().toLowerCase() === (partCode || '').trim().toLowerCase();
      return sameCategory && samePart;
    });
    return !!match;
  } catch (err) {
    console.warn('Duplicate check warning:', err);
    return false;
  }
}

export async function addQualityOperation(
  op: Omit<QualityOperation, 'id' | 'createdAt' | 'updatedAt'>,
  userEmail?: string
) {
  try {
    const now = new Date().toISOString();
    const status = op.status || (op.active !== false ? 'Active' : 'Inactive');
    const active = status === 'Active';
    const payload = {
      machineModel: op.machineModel.trim(),
      category: op.category,
      operationName: op.operationName.trim(),
      partCode: (op.partCode || '').trim(),
      srNo: (op.srNo || '').trim(),
      type: (op.type || 'Dimensional').trim(),
      processDepartment: (op.processDepartment || '').trim(),
      plannedInspectionTime: (op.plannedInspectionTime || '').trim(),
      description: (op.description || '').trim(),
      specification: (op.specification || op.specificationRequirement || '').trim(),
      specificationRequirement: (op.specificationRequirement || op.specification || '').trim(),
      status,
      active,
      createdAt: now,
      updatedAt: now,
      createdBy: op.createdBy || userEmail || 'System Admin',
      updatedBy: op.createdBy || userEmail || 'System Admin',
    };

    // 1. Create Firestore document in 'operations'
    const ref = await addDoc(collection(db, 'operations'), payload);

    // Also dual-write to legacy 'quality_operations' for backwards compatibility
    try {
      await setDoc(doc(db, 'quality_operations', ref.id), { id: ref.id, ...payload });
    } catch {
      // ignore
    }

    await logAudit('CREATE_QUALITY_OPERATION', 'QUALITY', ref.id, '', `Model: ${op.machineModel} - ${op.operationName}`, userEmail);
    return ref.id;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, 'operations');
    throw err;
  }
}

export async function updateQualityOperation(
  id: string,
  updates: Partial<QualityOperation>,
  userEmail?: string
) {
  try {
    const now = new Date().toISOString();
    const cleanUpdates: Record<string, any> = { ...updates, updatedAt: now, updatedBy: userEmail || 'System User' };
    if (updates.status !== undefined) {
      cleanUpdates.active = updates.status === 'Active';
    } else if (updates.active !== undefined) {
      cleanUpdates.status = updates.active ? 'Active' : 'Inactive';
    }
    if (updates.specification !== undefined) {
      cleanUpdates.specificationRequirement = updates.specification;
    }

    await updateDoc(doc(db, 'operations', id), cleanUpdates);
    try {
      await updateDoc(doc(db, 'quality_operations', id), cleanUpdates);
    } catch {
      // ignore
    }

    await logAudit('UPDATE_QUALITY_OPERATION', 'QUALITY', id, '', JSON.stringify(updates), userEmail);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `operations/${id}`);
    throw err;
  }
}

export async function deleteOrDeactivateQualityOperation(
  id: string,
  opName: string,
  model: string,
  userEmail?: string
) {
  try {
    const now = new Date().toISOString();
    // Rule 9: Do not permanently delete an operation that may already have historical quality records.
    // Use status = "Inactive"
    const checksSnap = await getDocs(query(collection(db, 'quality_daily_checks'), where('operationId', '==', id)));
    const resultsSnap = await getDocs(query(collection(db, 'qualityResults'), where('operationId', '==', id)));

    if (!checksSnap.empty || !resultsSnap.empty) {
      // Must preserve historical records: mark Inactive
      const updateData = { status: 'Inactive' as const, active: false, updatedAt: now, updatedBy: userEmail || 'System User' };
      await updateDoc(doc(db, 'operations', id), updateData);
      try {
        await updateDoc(doc(db, 'quality_operations', id), updateData);
      } catch {
        // ignore
      }
      await logAudit('DEACTIVATE_QUALITY_OPERATION', 'QUALITY', id, 'Active', 'Inactive (preserved historical inspections)', userEmail);
      return { status: 'deactivated', message: `Operation "${opName}" has historical inspections and has been deactivated (status set to Inactive).` };
    } else {
      // Check if user deactivates
      const updateData = { status: 'Inactive' as const, active: false, updatedAt: now, updatedBy: userEmail || 'System User' };
      await updateDoc(doc(db, 'operations', id), updateData);
      try {
        await updateDoc(doc(db, 'quality_operations', id), updateData);
      } catch {
        // ignore
      }
      await logAudit('DEACTIVATE_QUALITY_OPERATION', 'QUALITY', id, opName, 'Inactive', userEmail);
      return { status: 'deactivated', message: `Operation "${opName}" has been deactivated.` };
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `operations/${id}`);
    throw err;
  }
}

export async function activateQualityOperation(
  id: string,
  opName: string,
  userEmail?: string
) {
  try {
    const now = new Date().toISOString();
    const updateData = { status: 'Active' as const, active: true, updatedAt: now, updatedBy: userEmail || 'System User' };
    await updateDoc(doc(db, 'operations', id), updateData);
    try {
      await updateDoc(doc(db, 'quality_operations', id), updateData);
    } catch {
      // ignore
    }
    await logAudit('ACTIVATE_QUALITY_OPERATION', 'QUALITY', id, 'Inactive', 'Active', userEmail);
    return { status: 'activated', message: `Operation "${opName}" has been activated.` };
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `operations/${id}`);
    throw err;
  }
}

// --- DAILY QUALITY CHECKS & RESULTS (Machine-Specific) ---
export function subscribeQualityDailyChecks(callback: (checks: QualityDailyCheck[]) => void) {
  const localUnsub = subscribeLocalCollection<QualityDailyCheck>('quality_daily_checks', callback);

  let firestoreUnsub = () => {};
  try {
    firestoreUnsub = onSnapshot(
      collection(db, 'quality_daily_checks'),
      (snap) => {
        if (!snap.empty) {
          const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as QualityDailyCheck));
          saveLocalCollection('quality_daily_checks', list);
        }
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'quality_daily_checks')
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'quality_daily_checks');
  }

  return () => {
    localUnsub();
    firestoreUnsub();
  };
}

export async function saveQualityDailyCheck(
  check: Omit<QualityDailyCheck, 'id' | 'createdAt' | 'updatedAt'>,
  userEmail?: string
) {
  const docId = `${check.machineNumber}_${check.operationId}`.replace(/[^a-zA-Z0-9_-]/g, '_');
  const now = new Date();
  const payload: QualityDailyCheck = {
    id: docId,
    ...check,
    qualityResult: check.status,
    updatedAt: now.toISOString(),
    createdAt: now.toISOString(),
    updatedBy: userEmail || check.userEmail || 'Quality Inspector',
  };

  upsertLocalItem('quality_daily_checks', payload);

  try {
    if (
      check.status === 'Accept' ||
      check.status === 'Reject' ||
      check.status === 'Hold' ||
      (check.status as any) === 'Pass' ||
      (check.status as any) === 'Fail'
    ) {
      const authCheck = await verifyQualityDecisionAuthorization(undefined, userEmail);
      if (!authCheck.authorized) {
        throw new Error(`UNAUTHORIZED_QUALITY_ACTION: ${authCheck.reason}`);
      }
    }

    const ref = doc(db, 'quality_daily_checks', docId);
    await setDoc(ref, payload, { merge: true });

    try {
      await setDoc(doc(db, 'qualityResults', docId), payload, { merge: true });
    } catch (e) {
      console.warn('qualityResults sync warning:', e);
    }

    await logAudit(
      'UPDATE_QUALITY_CHECK',
      'QUALITY',
      docId,
      '',
      `Machine ${check.machineNumber} - Op ${check.operationName} -> ${check.status}`,
      userEmail
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'quality_daily_checks');
  }
}

// --- QUALITY REJECTIONS & CORRECTIVE ACTION WORKFLOW ---
export function subscribeQualityRejections(callback: (rejections: QualityRejection[]) => void) {
  const localUnsub = subscribeLocalCollection<QualityRejection>('quality_rejections', callback);

  let firestoreUnsub = () => {};
  try {
    firestoreUnsub = onSnapshot(
      collection(db, 'quality_rejections'),
      (snap) => {
        if (!snap.empty) {
          const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as QualityRejection));
          saveLocalCollection('quality_rejections', list);
        }
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'quality_rejections')
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'quality_rejections');
  }

  return () => {
    localUnsub();
    firestoreUnsub();
  };
}

export async function createQualityRejection(
  rejection: Omit<QualityRejection, 'id' | 'createdAt' | 'updatedAt'>,
  userEmail?: string
) {
  try {
    const now = new Date().toISOString();
    const ref = await addDoc(collection(db, 'quality_rejections'), { ...rejection, createdAt: now, updatedAt: now });

    // Dual-write to qualityRejections collection
    try {
      await setDoc(doc(db, 'qualityRejections', ref.id), { id: ref.id, ...rejection, createdAt: now, updatedAt: now });
    } catch {
      // ignore
    }

    // Send real notification to concerned department
    await createNotification({
      recipientDepartment: rejection.concernedDepartment,
      recipientRole: 'DEPARTMENT USER',
      title: `Quality Rejection on Machine ${rejection.machineNumber}`,
      message: `Operation: ${rejection.operationName}. Reason: ${rejection.rejectionReason}. Please provide corrective action.`,
      type: 'rejection',
      linkId: ref.id,
      linkType: 'quality_rejection',
    });

    await logAudit(
      'QUALITY_REJECTION_CREATED',
      'QUALITY',
      ref.id,
      '',
      `Machine ${rejection.machineNumber} - Dept ${rejection.concernedDepartment}: ${rejection.rejectionReason}`,
      userEmail
    );
    return ref.id;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, 'quality_rejections');
  }
}

export async function submitCorrectiveAction(
  rejectionId: string,
  correctiveAction: string,
  employeeName: string,
  userEmail?: string
) {
  try {
    const now = new Date().toISOString();
    const updates = {
      correctiveAction,
      correctiveActionBy: employeeName,
      correctiveActionDate: now.split('T')[0],
      status: 'Re-inspection Pending' as const,
      updatedAt: now,
    };
    await updateDoc(doc(db, 'quality_rejections', rejectionId), updates);
    try {
      await updateDoc(doc(db, 'qualityRejections', rejectionId), updates);
    } catch {
      // ignore
    }

    // Notify Quality team
    await createNotification({
      recipientDepartment: '04 Inward Quality',
      recipientRole: 'QUALITY',
      title: `Corrective Action Submitted for Rejection`,
      message: `Corrective action provided by ${employeeName}. Ready for re-inspection.`,
      type: 'reinspection',
      linkId: rejectionId,
      linkType: 'quality_rejection',
    });

    await logAudit('CORRECTIVE_ACTION_SUBMITTED', 'QUALITY', rejectionId, '', correctiveAction, userEmail);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `quality_rejections/${rejectionId}`);
  }
}

export async function recordReinspectionResult(
  rejectionId: string,
  result: 'Accepted' | 'Rejected',
  remarks: string,
  inspectorName: string,
  userEmail?: string
) {
  try {
    const authCheck = await verifyQualityDecisionAuthorization(undefined, userEmail);
    if (!authCheck.authorized) {
      throw new Error(`UNAUTHORIZED_QUALITY_ACTION: ${authCheck.reason}`);
    }

    const now = new Date().toISOString();
    const updates = {
      status: result === 'Accepted' ? ('Accepted' as const) : ('Rejected' as const),
      reinspectionResult: result,
      reinspectionRemarks: remarks,
      reinspectionDate: now.split('T')[0],
      reinspectedBy: inspectorName,
      updatedAt: now,
    };
    await updateDoc(doc(db, 'quality_rejections', rejectionId), updates);
    try {
      await updateDoc(doc(db, 'qualityRejections', rejectionId), updates);
    } catch {
      // ignore
    }

    await logAudit('REINSPECTION_RECORDED', 'QUALITY', rejectionId, '', `Result: ${result} by ${inspectorName}`, userEmail);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `quality_rejections/${rejectionId}`);
  }
}

// --- DEPARTMENT WORK & 1-MINUTE DAILY UPDATES ---
export function subscribeDepartmentWork(callback: (work: DepartmentWork[]) => void) {
  const localUnsub = subscribeLocalCollection<DepartmentWork>('department_work', callback);

  let firestoreUnsub = () => {};
  try {
    firestoreUnsub = onSnapshot(
      collection(db, 'department_work'),
      (snap) => {
        if (!snap.empty) {
          const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as DepartmentWork));
          saveLocalCollection('department_work', list);
        }
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'department_work')
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'department_work');
  }

  return () => {
    localUnsub();
    firestoreUnsub();
  };
}

export async function addDepartmentWork(work: Omit<DepartmentWork, 'id' | 'createdAt' | 'updatedAt'>, userEmail?: string) {
  try {
    const now = new Date().toISOString();
    const ref = await addDoc(collection(db, 'department_work'), { ...work, createdAt: now, updatedAt: now });

    if (work.assignedTo) {
      await createNotification({
        recipientId: work.assignedTo,
        recipientDepartment: work.department,
        title: `New Task Assigned: ${work.title}`,
        message: `Assigned work in ${work.department} for Machine ${work.machineNumber || 'General'}.`,
        type: 'task',
        linkId: ref.id,
        linkType: 'department_work',
      });
    }

    await logAudit('CREATE_DEPARTMENT_WORK', 'DEPARTMENT', ref.id, '', work.title, userEmail);
    return ref.id;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, 'department_work');
  }
}

export async function updateDailyWorkStatus(
  workId: string,
  oldStatus: string,
  newStatus: 'Pending' | 'In Progress' | 'Completed' | 'Delayed',
  details: {
    delayReason?: string;
    revisedDate?: string;
    correctiveAction?: string;
    remarks?: string;
    actualQuantity?: number;
  },
  userEmail?: string,
  userName?: string
) {
  try {
    const now = new Date();
    const updates: Partial<DepartmentWork> = {
      status: newStatus,
      updatedAt: now.toISOString(),
    };

    if (newStatus === 'Completed') {
      updates.completionTime = now.toLocaleTimeString();
    }
    if (newStatus === 'Delayed') {
      updates.delayReason = details.delayReason;
      updates.revisedDate = details.revisedDate;
      updates.correctiveAction = details.correctiveAction;

      // Real notification to Planning & Management
      await createNotification({
        recipientRole: 'PLANNING',
        title: `Work Delayed: ${details.delayReason}`,
        message: `Task ${workId} was marked Delayed by ${userName || userEmail}. Revised date: ${details.revisedDate}`,
        type: 'delay',
        linkId: workId,
        linkType: 'department_work',
      });
    }
    if (details.remarks) updates.remarks = details.remarks;
    if (details.actualQuantity !== undefined) updates.actualQuantity = details.actualQuantity;

    await updateDoc(doc(db, 'department_work', workId), updates);
    await logAudit('DAILY_WORK_UPDATE', 'DEPARTMENT', workId, oldStatus, newStatus, userEmail);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `department_work/${workId}`);
  }
}

export async function updateDepartmentWork(
  id: string,
  updates: Partial<DepartmentWork>,
  userEmail?: string
) {
  try {
    const now = new Date().toISOString();
    await updateDoc(doc(db, 'department_work', id), {
      ...updates,
      updatedAt: now,
    });
    await logAudit('UPDATE_DEPARTMENT_WORK', 'DEPARTMENT', id, '', JSON.stringify(updates), userEmail);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `department_work/${id}`);
  }
}

export async function deleteDepartmentWork(id: string, title?: string, userEmail?: string) {
  try {
    await deleteDoc(doc(db, 'department_work', id));
    await logAudit('DELETE_DEPARTMENT_WORK', 'DEPARTMENT', id, title || '', 'DELETED', userEmail);
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `department_work/${id}`);
  }
}

// --- WORK UPDATES (DAILY SHOP FLOOR LOGS) ---
export function subscribeWorkUpdates(callback: (updates: WorkUpdate[]) => void) {
  return onSnapshot(
    collection(db, 'work_updates'),
    (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as WorkUpdate));
      list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      callback(list);
    },
    (err) => handleFirestoreError(err, OperationType.LIST, 'work_updates')
  );
}

export async function addWorkUpdate(
  update: Omit<WorkUpdate, 'id' | 'createdAt'>,
  userEmail?: string
) {
  try {
    const now = new Date().toISOString();
    const ref = await addDoc(collection(db, 'work_updates'), {
      ...update,
      createdAt: now,
    });
    await logAudit(
      'CREATE_WORK_UPDATE',
      'DEPARTMENT',
      ref.id,
      '',
      `Work update for Machine ${update.machineNumber || 'N/A'}: ${update.progressPercent}%`,
      userEmail
    );
    return ref.id;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, 'work_updates');
  }
}

// --- DEPARTMENT HANDOVERS ---
export function subscribeDepartmentHandovers(callback: (handovers: DepartmentHandover[]) => void) {
  const localUnsub = subscribeLocalCollection<DepartmentHandover>('department_handovers', callback);
  let docsA: DepartmentHandover[] = [];
  let docsB: DepartmentHandover[] = [];

  const emit = () => {
    const map = new Map<string, DepartmentHandover>();
    docsA.forEach((d) => map.set(d.id, d));
    docsB.forEach((d) => {
      const existing = map.get(d.id);
      if (!existing) {
        map.set(d.id, d);
      } else {
        // Keep the one with newer updatedAt
        const timeExisting = new Date(existing.updatedAt || existing.createdAt || '').getTime();
        const timeNew = new Date(d.updatedAt || d.createdAt || '').getTime();
        if (timeNew >= timeExisting) {
          map.set(d.id, d);
        }
      }
    });
    const combined = Array.from(map.values());
    combined.sort((a, b) => new Date(b.createdAt || '').getTime() - new Date(a.createdAt || '').getTime());
    saveLocalCollection('department_handovers', combined);
  };

  let unsubA = () => {};
  let unsubB = () => {};
  try {
    unsubA = onSnapshot(
      collection(db, 'department_handovers'),
      (snap) => {
        docsA = snap.docs.map((d) => ({ id: d.id, ...d.data() } as DepartmentHandover));
        emit();
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'department_handovers')
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'department_handovers');
  }

  try {
    unsubB = onSnapshot(
      collection(db, 'departmentHandovers'),
      (snap) => {
        docsB = snap.docs.map((d) => ({ id: d.id, ...d.data() } as DepartmentHandover));
        emit();
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'departmentHandovers')
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'departmentHandovers');
  }

  return () => {
    localUnsub();
    unsubA();
    unsubB();
  };
}

export async function createDepartmentHandover(
  handover: Omit<DepartmentHandover, 'id' | 'createdAt' | 'updatedAt'>,
  userEmail?: string
) {
  try {
    const now = new Date().toISOString();
    const ref = await addDoc(collection(db, 'department_handovers'), { ...handover, createdAt: now, updatedAt: now });

    // Send real notification to receiving department
    await createNotification({
      recipientDepartment: handover.receivingDepartment,
      recipientRole: 'DEPARTMENT USER',
      title: `Handover Received from ${handover.sendingDepartment}`,
      message: `Machine ${handover.machineNumber}: ${handover.workDescription}. Please accept to begin work.`,
      type: 'handover',
      linkId: ref.id,
      linkType: 'handover',
    });

    await logAudit(
      'CREATE_HANDOVER',
      'HANDOVER',
      ref.id,
      '',
      `${handover.sendingDepartment} -> ${handover.receivingDepartment} (Machine ${handover.machineNumber})`,
      userEmail
    );
    return ref.id;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, 'department_handovers');
  }
}

export async function updateHandoverStatus(
  handoverId: string,
  newStatus: DepartmentHandover['status'],
  details: { acceptedBy?: string; issueRemarks?: string },
  userEmail?: string
) {
  try {
    const now = new Date().toISOString();
    const todayDate = now.split('T')[0];
    const updates: Partial<DepartmentHandover> = {
      status: newStatus,
      updatedAt: now,
      ...details,
    };
    if (newStatus === 'Accepted') {
      updates.acceptedDate = todayDate;
    }
    await updateDoc(doc(db, 'department_handovers', handoverId), updates);
    await logAudit('UPDATE_HANDOVER', 'HANDOVER', handoverId, '', newStatus, userEmail);

    // Live Machine Movement upon Handover Acceptance (Section 19 & 20)
    if (newStatus === 'Accepted') {
      const hSnap = await getDoc(doc(db, 'department_handovers', handoverId));
      if (hSnap.exists()) {
        const hData = hSnap.data() as DepartmentHandover;
        if (hData.machineNumber && hData.receivingDepartment) {
          const mQuery = query(
            collection(db, 'machines'),
            where('machineNumber', '==', hData.machineNumber)
          );
          const mDocs = await getDocs(mQuery);
          for (const mDoc of mDocs.docs) {
            const mData = mDoc.data() as Machine;
            const existingStages = { ...(mData.processStages || {}) };

            // Find sending department stage and mark Completed (100%)
            const sendingStage = Object.values(existingStages).find(
              (s) =>
                s.departmentName === hData.sendingDepartment ||
                hData.sendingDepartment.includes(s.departmentCode)
            );
            if (sendingStage) {
              existingStages[sendingStage.departmentCode] = {
                ...sendingStage,
                status: 'Completed',
                progressPercent: 100,
                actualDate: todayDate,
                updatedAt: now,
                updatedBy: details.acceptedBy || userEmail || 'Shop Floor Handover',
              };
            }

            // Set receiving department stage to In Progress
            const receivingStage = Object.values(existingStages).find(
              (s) =>
                s.departmentName === hData.receivingDepartment ||
                hData.receivingDepartment.includes(s.departmentCode)
            );
            if (receivingStage) {
              existingStages[receivingStage.departmentCode] = {
                ...receivingStage,
                status: 'In Progress',
                progressPercent: Math.max(receivingStage.progressPercent || 0, 10),
                updatedAt: now,
                updatedBy: details.acceptedBy || userEmail || 'Shop Floor Handover',
              };
            }

            // Recalculate stage counts
            const stageVals = Object.values(existingStages);
            const applicableStages = stageVals.filter((s) => s.status !== 'N/A');
            const completedStages = applicableStages.filter((s) => s.status === 'Completed');
            const overallPct =
              applicableStages.length > 0
                ? Math.round((completedStages.length / applicableStages.length) * 100)
                : 0;

            const existingHistory = mData.history || [];
            const historyEntry = {
              id: `hist_${Date.now()}`,
              date: todayDate,
              department: hData.receivingDepartment,
              task: hData.workDescription || `Handover from ${hData.sendingDepartment}`,
              employee: details.acceptedBy || 'Operator',
              startDate: todayDate,
              progress: overallPct,
              status: 'In Progress',
              remarks: `Handover accepted from ${hData.sendingDepartment}. ${hData.remarks || ''}`,
            };

            await updateDoc(mDoc.ref, {
              currentDepartment: hData.receivingDepartment,
              currentStatus: 'In Progress',
              processStages: existingStages,
              completedProcessesCount: completedStages.length,
              applicableProcessesCount: applicableStages.length,
              overallProgressPercent: overallPct,
              history: [historyEntry, ...existingHistory],
              updatedAt: now,
            });

            await logAudit(
              'LIVE_MACHINE_MOVEMENT',
              'MACHINES',
              mDoc.id,
              mData.currentDepartment,
              `Machine ${mData.machineNumber} moved to ${hData.receivingDepartment} upon handover acceptance`,
              userEmail
            );
          }
        }
      }
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `department_handovers/${handoverId}`);
  }
}

// --- QUALITY HANDOVER WORKFLOW (CENTRAL & DEPARTMENT) ---

export async function generateQualityHandoverId(): Promise<string> {
  const currentYear = new Date().getFullYear();
  try {
    const qSnap = await getDocs(collection(db, 'qualityHandovers'));
    let maxNum = 0;
    qSnap.docs.forEach((docSnap) => {
      const data = docSnap.data();
      const hid = data.handoverId || '';
      const match = hid.match(/^QH-(\d{4})-(\d+)$/);
      if (match && match[1] === String(currentYear)) {
        const num = parseInt(match[2], 10);
        if (num > maxNum) maxNum = num;
      }
    });
    const nextNum = maxNum + 1;
    return `QH-${currentYear}-${String(nextNum).padStart(5, '0')}`;
  } catch {
    return `QH-${currentYear}-${String(Date.now()).slice(-5)}`;
  }
}

export function subscribeQualityHandovers(
  callback: (handovers: QualityHandover[]) => void,
  departmentScope?: string
) {
  return onSnapshot(
    collection(db, 'qualityHandovers'),
    (snap) => {
      let list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as QualityHandover));
      if (departmentScope && departmentScope !== 'All Departments') {
        const isQuality =
          departmentScope.toLowerCase().includes('quality') ||
          departmentScope === '04 Inward Quality' ||
          departmentScope === '14 Calibration';
        if (!isQuality) {
          list = list.filter(
            (h) =>
              h.sendingDepartment === departmentScope ||
              h.receivingDepartment === departmentScope
          );
        }
      }
      list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      callback(list);
    },
    (err) => handleFirestoreError(err, OperationType.LIST, 'qualityHandovers')
  );
}

export async function createQualityHandover(
  handoverData: Omit<
    QualityHandover,
    'id' | 'handoverId' | 'createdAt' | 'updatedAt' | 'currentInspectionCycle' | 'status'
  > & {
    status?: QualityHandover['status'];
  },
  userEmail?: string
): Promise<{ id: string; handoverId: string }> {
  try {
    const handoverId = await generateQualityHandoverId();
    const now = new Date().toISOString();
    const today = now.split('T')[0];

    const record: Omit<QualityHandover, 'id'> = {
      ...handoverData,
      handoverId,
      status: handoverData.status || 'SENT_TO_QUALITY',
      currentInspectionCycle: 1,
      createdAt: now,
      updatedAt: now,
      createdBy: handoverData.createdBy || userEmail || 'Operator',
      employee: handoverData.employee || userEmail || 'Operator',
    };

    const docRef = await addDoc(collection(db, 'qualityHandovers'), record);
    try {
      await setDoc(doc(db, 'quality_handovers', docRef.id), { ...record, id: docRef.id });
    } catch {}

    // Initial Handover History log
    await addDoc(collection(db, 'qualityHandoverHistory'), {
      handoverId,
      timestamp: now,
      date: today,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      action: 'DISPATCHED_TO_QUALITY',
      department: handoverData.sendingDepartment,
      user: handoverData.employee || userEmail || 'Operator',
      details: `Work dispatched to Quality for Machine ${handoverData.machineNumber} (${handoverData.operation}). Status: SENT_TO_QUALITY. Qty: ${handoverData.quantity}`,
      cycle: 1,
      status: 'SENT_TO_QUALITY',
    });

    // Notify Quality
    await createNotification({
      recipientDepartment: '04 Inward Quality',
      recipientRole: 'QUALITY',
      toDepartment: '04 Inward Quality',
      fromDepartment: handoverData.sendingDepartment,
      title: `Incoming Handover: Machine ${handoverData.machineNumber}`,
      message: `${handoverData.sendingDepartment} handed over Machine ${handoverData.machineNumber} (${handoverData.operation}) for Quality inspection. [${handoverId}]`,
      type: 'QUALITY_HANDOVER',
      handoverId,
      machineNumber: handoverData.machineNumber,
      machineModel: handoverData.machineModel,
      operation: handoverData.operation,
      priority: handoverData.priority,
      status: 'UNREAD',
      linkId: docRef.id,
      linkType: 'quality_handover',
    });

    // Update Machine Master status to SENT_TO_QUALITY
    if (handoverData.machineNumber) {
      const mQuery = query(
        collection(db, 'machines'),
        where('machineNumber', '==', handoverData.machineNumber)
      );
      const mDocs = await getDocs(mQuery);
      for (const mDoc of mDocs.docs) {
        const mData = mDoc.data() as Machine;
        const existingHistory = mData.history || [];
        const histEntry = {
          id: `hist_${Date.now()}`,
          date: today,
          department: handoverData.sendingDepartment,
          task: `Dispatched to Quality: ${handoverData.operation} (${handoverId})`,
          employee: handoverData.employee || userEmail || 'Operator',
          startDate: today,
          progress: mData.overallProgressPercent || 0,
          status: 'SENT_TO_QUALITY',
          remarks: `Handed over to Quality. Priority: ${handoverData.priority}`,
        };
        await updateDoc(mDoc.ref, {
          qualityStatus: 'SENT_TO_QUALITY',
          status: 'SENT_TO_QUALITY',
          currentStatus: 'SENT_TO_QUALITY',
          history: [histEntry, ...existingHistory],
          updatedAt: now,
        });
      }
    }

    // Synchronize department_work
    try {
      const dwQuery = query(
        collection(db, 'department_work'),
        where('machineNumber', '==', handoverData.machineNumber),
        where('department', '==', handoverData.sendingDepartment)
      );
      const dwDocs = await getDocs(dwQuery);
      for (const dwDoc of dwDocs.docs) {
        await updateDoc(dwDoc.ref, {
          status: 'SENT_TO_QUALITY',
          updatedAt: now,
        });
      }
    } catch (err) {
      console.warn('Sync department_work in createQualityHandover warning:', err);
    }

    await logAudit(
      'CREATE_QUALITY_HANDOVER',
      'QUALITY_HANDOVER',
      docRef.id,
      '',
      `Handover ${handoverId} created by ${handoverData.sendingDepartment} for Machine ${handoverData.machineNumber}`,
      userEmail
    );

    return { id: docRef.id, handoverId };
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, 'qualityHandovers');
    throw err;
  }
}

/**
 * Transitions a Quality Handover into active inspection.
 */
export async function startInspection(
  handoverDocId: string,
  inspector: string,
  userEmail?: string
): Promise<void> {
  try {
    const now = new Date().toISOString();
    const today = now.split('T')[0];
    const hDoc = await getDoc(doc(db, 'qualityHandovers', handoverDocId));
    if (!hDoc.exists()) throw new Error('Handover record not found');
    const handover = hDoc.data() as QualityHandover;

    const updates = {
      status: 'UNDER_INSPECTION' as any,
      lastInspector: inspector || userEmail || 'Quality Inspector',
      updatedAt: now,
      updatedBy: inspector || userEmail,
    };

    await updateDoc(doc(db, 'qualityHandovers', handoverDocId), updates);
    try {
      await updateDoc(doc(db, 'quality_handovers', handoverDocId), updates);
    } catch {}

    // Update machine status
    if (handover.machineNumber) {
      const mQuery = query(collection(db, 'machines'), where('machineNumber', '==', handover.machineNumber));
      const mDocs = await getDocs(mQuery);
      for (const mDoc of mDocs.docs) {
        await updateDoc(mDoc.ref, {
          qualityStatus: 'UNDER_INSPECTION',
          status: 'UNDER_INSPECTION',
          currentStatus: 'Under Quality Inspection',
          updatedAt: now,
        });
      }
    }

    // Add to History
    await addDoc(collection(db, 'qualityHandoverHistory'), {
      handoverId: handover.handoverId,
      timestamp: now,
      date: today,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      action: 'INSPECTION_STARTED',
      department: '04 Inward Quality',
      user: inspector,
      details: `Quality Inspection started by ${inspector} for Machine ${handover.machineNumber} (${handover.operation})`,
      cycle: handover.currentInspectionCycle || 1,
      status: 'UNDER_INSPECTION',
    });

    await logAudit(
      'START_QUALITY_INSPECTION',
      'QUALITY_HANDOVER',
      handoverDocId,
      handover.status,
      `Inspection started by ${inspector}`,
      userEmail
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `qualityHandovers/${handoverDocId}`);
    throw err;
  }
}

export async function qualityAcceptHandover(
  handoverDocId: string,
  details: {
    inspector: string;
    remarks?: string;
    attachment?: string;
  },
  userEmail?: string
) {
  try {
    // 0. Verify Quality / Admin Authorization
    const authCheck = await verifyQualityDecisionAuthorization(undefined, userEmail);
    if (!authCheck.authorized) {
      throw new Error(`UNAUTHORIZED_QUALITY_ACTION: ${authCheck.reason}`);
    }

    const now = new Date().toISOString();
    const today = now.split('T')[0];

    const hDoc = await getDoc(doc(db, 'qualityHandovers', handoverDocId));
    if (!hDoc.exists()) throw new Error('Handover record not found');
    const handover = hDoc.data() as QualityHandover;

    // Validate that latest status permits decision
    if (handover.status === 'ACCEPTED' || handover.status === 'CLOSED') {
      throw new Error(`INELIGIBLE_STATUS: Handover ${handover.handoverId} is already ${handover.status} and cannot be decided again.`);
    }

    const previousStatus = handover.status;
    const acceptPayload = {
      status: 'ACCEPTED' as any,
      qualityStatus: 'ACCEPTED' as any,
      lastInspectionResult: 'ACCEPT' as any,
      lastInspectionDate: today,
      lastInspector: details.inspector,
      remarks: details.remarks
        ? `${handover.remarks ? handover.remarks + '\n' : ''}[Quality Accept]: ${details.remarks}`
        : handover.remarks,
      updatedAt: now,
      updatedBy: details.inspector || userEmail || authCheck.userId,
    };

    // 1. Update Handover document and dual-write
    await updateDoc(doc(db, 'qualityHandovers', handoverDocId), acceptPayload);
    try {
      await updateDoc(doc(db, 'quality_handovers', handoverDocId), acceptPayload);
    } catch {}

    // 2. Add Quality Inspection record
    const inspRecord = {
      handoverId: handover.handoverId,
      inspectionCycle: handover.currentInspectionCycle || 1,
      machineNumber: handover.machineNumber,
      machineModel: handover.machineModel || '',
      operation: handover.operation,
      inspector: details.inspector,
      inspectionDate: today,
      result: 'ACCEPT',
      remarks: details.remarks || '',
      attachment: details.attachment || '',
      createdAt: now,
      createdBy: details.inspector || userEmail || authCheck.userId,
    };
    await addDoc(collection(db, 'qualityInspections'), inspRecord);
    try {
      await addDoc(collection(db, 'quality_inspections'), inspRecord);
    } catch {}

    // 3. Add History Entry
    await addDoc(collection(db, 'qualityHandoverHistory'), {
      handoverId: handover.handoverId,
      timestamp: now,
      date: today,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      action: 'QUALITY_ACCEPTED',
      department: '04 Inward Quality',
      user: details.inspector,
      details: `Quality Inspection ACCEPTED for Machine ${handover.machineNumber} - ${handover.operation} (Cycle ${handover.currentInspectionCycle || 1}). Result: ACCEPTED. Ready for handover. ${details.remarks ? 'Remarks: ' + details.remarks : ''}`,
      cycle: handover.currentInspectionCycle || 1,
      status: 'ACCEPTED',
    });

    // 4. Create Immutable Decision Audit Entry (Section 6 Requirement)
    const auditRecord = {
      handoverId: handover.handoverId,
      machineNumber: handover.machineNumber,
      action: 'ACCEPT',
      previousStatus: previousStatus || 'PENDING',
      newStatus: 'ACCEPTED',
      actingUserId: authCheck.userId,
      actingUserRole: authCheck.role,
      timestamp: now,
      inspectionRemarks: details.remarks || 'Accepted by Quality',
      inspector: details.inspector,
    };
    await addDoc(collection(db, 'quality_decision_audits'), auditRecord);
    try {
      await addDoc(collection(db, 'qualityDecisionAudits'), auditRecord);
    } catch {}

    // 4. Create Notification for originating department
    await createNotification({
      recipientDepartment: handover.sendingDepartment,
      toDepartment: handover.sendingDepartment,
      fromDepartment: '04 Inward Quality',
      title: `Quality Accepted: Machine ${handover.machineNumber}`,
      message: `Quality inspection completed for Machine ${handover.machineNumber} - Operation ${handover.operation}. Result: ACCEPTED. Ready for department handover.`,
      type: 'QUALITY_ACCEPTED',
      handoverId: handover.handoverId,
      machineNumber: handover.machineNumber,
      machineModel: handover.machineModel,
      operation: handover.operation,
      priority: 'Medium',
      status: 'UNREAD',
      linkId: handoverDocId,
      linkType: 'quality_handover',
    });

    // 5. Update Machine Master
    if (handover.machineNumber) {
      const mQuery = query(
        collection(db, 'machines'),
        where('machineNumber', '==', handover.machineNumber)
      );
      const mDocs = await getDocs(mQuery);
      for (const mDoc of mDocs.docs) {
        const mData = mDoc.data() as Machine;
        const existingHistory = mData.history || [];
        const histEntry = {
          id: `hist_${Date.now()}`,
          date: today,
          department: '04 Inward Quality',
          task: `Quality Inspection Passed: ${handover.operation}`,
          employee: details.inspector,
          startDate: today,
          progress: 100,
          status: 'READY_FOR_HANDOVER',
          remarks: `Quality Accepted [${handover.handoverId}]. Ready for department handover. ${details.remarks || ''}`,
        };
        await updateDoc(mDoc.ref, {
          qualityStatus: 'ACCEPTED',
          status: 'READY_FOR_HANDOVER',
          currentStatus: 'Ready for Handover',
          history: [histEntry, ...existingHistory],
          updatedAt: now,
        });
      }
    }

    // 6. Synchronize department_work
    try {
      const dwQuery = query(
        collection(db, 'department_work'),
        where('machineNumber', '==', handover.machineNumber),
        where('department', '==', handover.sendingDepartment)
      );
      const dwDocs = await getDocs(dwQuery);
      for (const dwDoc of dwDocs.docs) {
        await updateDoc(dwDoc.ref, {
          status: 'READY_FOR_HANDOVER',
          updatedAt: now,
        });
      }
    } catch (err) {
      console.warn('Sync department_work in qualityAcceptHandover warning:', err);
    }

    await logAudit(
      'QUALITY_ACCEPT_HANDOVER',
      'QUALITY_HANDOVER',
      handoverDocId,
      handover.status,
      `Quality Accepted Handover ${handover.handoverId} by ${details.inspector}`,
      userEmail
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `qualityHandovers/${handoverDocId}`);
    throw err;
  }
}

export async function qualityRejectHandover(
  handoverDocId: string,
  details: {
    inspector: string;
    defectCategory: string;
    reason?: string;
    defectDescription?: string;
    specification?: string;
    expectedValue?: string;
    actualFinding?: string;
    concernedDepartment?: string;
    remarks?: string;
    correctiveActionRequired?: string;
    attachment?: string;
  },
  userEmail?: string
) {
  try {
    // 0. Verify Quality / Admin Authorization
    const authCheck = await verifyQualityDecisionAuthorization(undefined, userEmail);
    if (!authCheck.authorized) {
      throw new Error(`UNAUTHORIZED_QUALITY_ACTION: ${authCheck.reason}`);
    }

    if (!details.defectCategory || !details.defectCategory.trim()) {
      throw new Error('VALIDATION_ERROR: Defect Category is mandatory.');
    }

    const now = new Date().toISOString();
    const today = now.split('T')[0];

    const hDoc = await getDoc(doc(db, 'qualityHandovers', handoverDocId));
    if (!hDoc.exists()) throw new Error('Handover record not found');
    const handover = hDoc.data() as QualityHandover;

    // Validate that latest status permits rejection
    if (handover.status === 'ACCEPTED' || handover.status === 'CLOSED') {
      throw new Error(`INELIGIBLE_STATUS: Handover ${handover.handoverId} is already ${handover.status} and cannot be rejected.`);
    }

    const previousStatus = handover.status;
    const targetDept = details.concernedDepartment || handover.sendingDepartment;
    const primaryReason = details.reason || details.defectDescription || details.defectCategory;

    const rejectPayload = {
      status: 'REJECTED' as any,
      qualityStatus: 'REJECTED' as any,
      lastInspectionResult: 'REJECT' as any,
      lastInspectionDate: today,
      lastInspector: details.inspector,
      defectCategory: details.defectCategory.trim(),
      defectDescription: details.defectDescription || primaryReason,
      rejectionReason: primaryReason,
      specification: details.specification || details.expectedValue || '',
      expectedValue: details.expectedValue || details.specification || '',
      actualFinding: details.actualFinding || '',
      correctiveActionRequired: details.correctiveActionRequired || details.remarks || '',
      correctiveActionStatus: 'PENDING_ACTION' as any,
      updatedAt: now,
      updatedBy: details.inspector || userEmail || authCheck.userId,
    };

    // 1. Update Handover document and dual-write
    await updateDoc(doc(db, 'qualityHandovers', handoverDocId), rejectPayload);
    try {
      await updateDoc(doc(db, 'quality_handovers', handoverDocId), rejectPayload);
    } catch {}

    // 2. Add to qualityInspections and dual-write
    const inspRecord = {
      handoverId: handover.handoverId,
      inspectionCycle: handover.currentInspectionCycle || 1,
      machineNumber: handover.machineNumber,
      machineModel: handover.machineModel || '',
      operation: handover.operation,
      inspector: details.inspector,
      inspectionDate: today,
      result: 'REJECT',
      defectCategory: details.defectCategory.trim(),
      defectDescription: details.defectDescription || primaryReason,
      specification: details.specification || details.expectedValue || '',
      actualFinding: details.actualFinding || '',
      remarks: `[${details.defectCategory}] ${primaryReason}. ${details.remarks || ''}`,
      attachment: details.attachment || '',
      createdAt: now,
      createdBy: details.inspector || userEmail,
    };
    await addDoc(collection(db, 'qualityInspections'), inspRecord);
    try {
      await addDoc(collection(db, 'quality_inspections'), inspRecord);
    } catch {}

    // 3. Add to qualityRejections & quality_rejections
    const rejData = {
      handoverId: handover.handoverId,
      machineNumber: handover.machineNumber,
      machineModel: handover.machineModel || '',
      operationName: handover.operation,
      defectCategory: details.defectCategory.trim(),
      defectDescription: details.defectDescription || primaryReason,
      rejectionReason: primaryReason as any,
      specification: details.specification || details.expectedValue || '',
      actualFinding: details.actualFinding || '',
      concernedDepartment: targetDept,
      remarks: details.remarks || '',
      status: 'Rejected',
      correctiveAction: details.correctiveActionRequired || '',
      attachmentUrl: details.attachment || '',
      createdAt: now,
      updatedAt: now,
      createdBy: details.inspector,
    };
    const rejRef = await addDoc(collection(db, 'qualityRejections'), rejData);
    try {
      await setDoc(doc(db, 'quality_rejections', rejRef.id), { ...rejData, id: rejRef.id });
    } catch {}

    // 4. Add to qualityCorrectiveActions & quality_corrective_actions
    const caData = {
      handoverId: handover.handoverId,
      rejectionId: rejRef.id,
      inspectionCycle: handover.currentInspectionCycle || 1,
      machineNumber: handover.machineNumber,
      department: targetDept,
      defectCategory: details.defectCategory.trim(),
      originalIssue: `[${details.defectCategory}] ${primaryReason}${details.actualFinding ? ' (Actual: ' + details.actualFinding + ')' : ''}`,
      correctiveAction: details.correctiveActionRequired || 'Rectify defect per specification',
      actionTaken: '',
      responsibleEmployee: '',
      completionDate: '',
      status: 'IN_PROGRESS',
      createdAt: now,
      createdBy: details.inspector,
    };
    await addDoc(collection(db, 'qualityCorrectiveActions'), caData);
    try {
      await addDoc(collection(db, 'quality_corrective_actions'), caData);
    } catch {}

    // 5. Add to qualityHandoverHistory
    await addDoc(collection(db, 'qualityHandoverHistory'), {
      handoverId: handover.handoverId,
      timestamp: now,
      date: today,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      action: 'QUALITY_REJECTED',
      department: '04 Inward Quality',
      user: details.inspector,
      defectCategory: details.defectCategory.trim(),
      details: `Quality Inspection REJECTED for Machine ${handover.machineNumber} - ${handover.operation}. Category: ${details.defectCategory}. Reason: ${primaryReason}. Spec: ${details.specification || details.expectedValue || 'N/A'}. Actual: ${details.actualFinding || 'N/A'}. Concerned Dept: ${targetDept}`,
      cycle: handover.currentInspectionCycle || 1,
      status: 'REJECTED',
    });

    // 6. Create Notification for concerned department ONLY
    await createNotification({
      recipientDepartment: targetDept,
      toDepartment: targetDept,
      fromDepartment: '04 Inward Quality',
      title: `CRITICAL: Quality Rejection - Machine ${handover.machineNumber}`,
      message: `Quality rejected Machine ${handover.machineNumber} (${handover.operation}). Defect Category: ${details.defectCategory}. Reason: ${primaryReason}. Corrective action required. [${handover.handoverId}]`,
      type: 'QUALITY_REJECTION',
      handoverId: handover.handoverId,
      machineNumber: handover.machineNumber,
      machineModel: handover.machineModel,
      operation: handover.operation,
      priority: 'Critical',
      status: 'UNREAD',
      linkId: handoverDocId,
      linkType: 'quality_handover',
    });

    // 7. Update Machine Master
    if (handover.machineNumber) {
      const mQuery = query(
        collection(db, 'machines'),
        where('machineNumber', '==', handover.machineNumber)
      );
      const mDocs = await getDocs(mQuery);
      for (const mDoc of mDocs.docs) {
        const mData = mDoc.data() as Machine;
        const existingHistory = mData.history || [];
        const histEntry = {
          id: `hist_${Date.now()}`,
          date: today,
          department: '04 Inward Quality',
          task: `Quality Rejection: ${handover.operation}`,
          employee: details.inspector,
          startDate: today,
          progress: mData.overallProgressPercent || 0,
          status: 'CORRECTIVE_ACTION',
          remarks: `REJECTED [${handover.handoverId}]. Defect Category: ${details.defectCategory}. Reason: ${primaryReason}. Corrective action pending with ${targetDept}`,
        };
        await updateDoc(mDoc.ref, {
          currentDepartment: targetDept,
          responsibleDepartment: targetDept,
          qualityStatus: 'REJECTED',
          status: 'IN_PROGRESS',
          currentStatus: 'Re-work / Corrective Action',
          handoverStatus: 'REWORK',
          defectCategory: details.defectCategory.trim(),
          delayReason: `[${details.defectCategory}] ${primaryReason}`,
          progress: Math.min(mData.progress !== undefined ? mData.progress : 90, 90),
          history: [histEntry, ...existingHistory],
          updatedAt: now,
        });
      }
    }

    // 8. Synchronize department_work
    try {
      const dwQuery = query(
        collection(db, 'department_work'),
        where('machineNumber', '==', handover.machineNumber),
        where('department', '==', targetDept)
      );
      const dwDocs = await getDocs(dwQuery);
      for (const dwDoc of dwDocs.docs) {
        await updateDoc(dwDoc.ref, {
          status: 'CORRECTIVE_ACTION',
          updatedAt: now,
        });
      }
    } catch (err) {
      console.warn('Sync department_work in qualityRejectHandover warning:', err);
    }

    // 9. Create Immutable Decision Audit Entry (Section 6 Requirement)
    const auditRecord = {
      handoverId: handover.handoverId,
      machineNumber: handover.machineNumber,
      action: 'REJECT',
      previousStatus: previousStatus || 'PENDING',
      newStatus: 'REJECTED',
      actingUserId: authCheck.userId,
      actingUserRole: authCheck.role,
      timestamp: now,
      defectCategory: details.defectCategory.trim(),
      defectDescription: details.defectDescription || primaryReason,
      inspectionRemarks: details.remarks || primaryReason,
      reason: primaryReason,
      specification: details.specification || details.expectedValue || '',
      actualFinding: details.actualFinding || '',
      correctiveActionRequired: details.correctiveActionRequired || '',
      inspector: details.inspector,
    };
    await addDoc(collection(db, 'quality_decision_audits'), auditRecord);
    try {
      await addDoc(collection(db, 'qualityDecisionAudits'), auditRecord);
    } catch {}

    await logAudit(
      'QUALITY_REJECT_HANDOVER',
      'QUALITY_HANDOVER',
      handoverDocId,
      handover.status,
      `Quality Rejected Handover ${handover.handoverId} [${details.defectCategory}]: ${primaryReason}`,
      userEmail
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `qualityHandovers/${handoverDocId}`);
    throw err;
  }
}

export async function qualityReworkHandover(
  handoverDocId: string,
  details: {
    inspector: string;
    defectCategory: string;
    reason?: string;
    defectDescription?: string;
    specification?: string;
    expectedValue?: string;
    actualFinding?: string;
    concernedDepartment?: string;
    correctiveActionRequired?: string;
    expectedReviewDate?: string;
    remarks?: string;
    attachment?: string;
  },
  userEmail?: string
) {
  try {
    // 0. Verify Quality / Admin Authorization
    const authCheck = await verifyQualityDecisionAuthorization(undefined, userEmail);
    if (!authCheck.authorized) {
      throw new Error(`UNAUTHORIZED_QUALITY_ACTION: ${authCheck.reason}`);
    }

    if (!details.defectCategory || !details.defectCategory.trim()) {
      throw new Error('VALIDATION_ERROR: Defect Category is mandatory.');
    }

    const now = new Date().toISOString();
    const today = now.split('T')[0];

    const hDoc = await getDoc(doc(db, 'qualityHandovers', handoverDocId));
    if (!hDoc.exists()) throw new Error('Handover record not found');
    const handover = hDoc.data() as QualityHandover;

    // Validate that latest status permits placing on rework
    if (handover.status === 'ACCEPTED' || handover.status === 'CLOSED') {
      throw new Error(`INELIGIBLE_STATUS: Handover ${handover.handoverId} is already ${handover.status} and cannot be sent for rework.`);
    }

    const previousStatus = handover.status;
    const targetDept = details.concernedDepartment || handover.sendingDepartment;
    const primaryReason = details.reason || details.defectDescription || details.defectCategory;
    const caRequired = details.correctiveActionRequired || details.remarks || `Rework required per defect: ${details.defectCategory}`;

    const reworkPayload = {
      status: 'REWORK_REQUIRED' as any,
      qualityStatus: 'REWORK_REQUIRED' as any,
      lastInspectionResult: 'REWORK' as any,
      lastInspectionDate: today,
      lastInspector: details.inspector,
      defectCategory: details.defectCategory.trim(),
      defectDescription: details.defectDescription || primaryReason,
      reworkReason: primaryReason,
      holdReason: primaryReason, // Backward compatibility for legacy listeners
      specification: details.specification || details.expectedValue || '',
      expectedValue: details.expectedValue || details.specification || '',
      actualFinding: details.actualFinding || '',
      correctiveActionRequired: caRequired,
      correctiveActionStatus: 'PENDING_ACTION' as any,
      expectedReviewDate: details.expectedReviewDate || '',
      updatedAt: now,
      updatedBy: details.inspector || userEmail || authCheck.userId,
    };

    // 1. Update Handover document and dual-write
    await updateDoc(doc(db, 'qualityHandovers', handoverDocId), reworkPayload);
    try {
      await updateDoc(doc(db, 'quality_handovers', handoverDocId), reworkPayload);
    } catch {}

    // 2. Add to quality_reworks and qualityReworks
    const rwRecord = {
      handoverId: handover.handoverId,
      inspectionCycle: handover.currentInspectionCycle || 1,
      machineNumber: handover.machineNumber,
      machineModel: handover.machineModel || '',
      department: targetDept,
      defectCategory: details.defectCategory.trim(),
      defectDescription: details.defectDescription || primaryReason,
      reason: primaryReason,
      specification: details.specification || details.expectedValue || '',
      actualFinding: details.actualFinding || '',
      correctiveActionRequired: caRequired,
      expectedReviewDate: details.expectedReviewDate || '',
      remarks: details.remarks || '',
      attachment: details.attachment || '',
      status: 'ACTIVE',
      createdAt: now,
      createdBy: details.inspector,
    };
    await addDoc(collection(db, 'quality_reworks'), rwRecord);
    try {
      await addDoc(collection(db, 'qualityReworks'), rwRecord);
    } catch {}

    // Also write to qualityHolds for legacy views
    try {
      await addDoc(collection(db, 'qualityHolds'), {
        ...rwRecord,
        status: 'ACTIVE',
        legacyHold: true,
      });
    } catch {}

    // 3. Add to qualityCorrectiveActions & quality_corrective_actions
    const caData = {
      handoverId: handover.handoverId,
      inspectionCycle: handover.currentInspectionCycle || 1,
      machineNumber: handover.machineNumber,
      department: targetDept,
      defectCategory: details.defectCategory.trim(),
      originalIssue: `[${details.defectCategory}] ${primaryReason}${details.actualFinding ? ' (Actual: ' + details.actualFinding + ')' : ''}`,
      correctiveAction: caRequired,
      actionTaken: '',
      responsibleEmployee: '',
      completionDate: '',
      status: 'IN_PROGRESS',
      createdAt: now,
      createdBy: details.inspector,
    };
    await addDoc(collection(db, 'qualityCorrectiveActions'), caData);
    try {
      await addDoc(collection(db, 'quality_corrective_actions'), caData);
    } catch {}

    // 4. Add to qualityHandoverHistory
    await addDoc(collection(db, 'qualityHandoverHistory'), {
      handoverId: handover.handoverId,
      timestamp: now,
      date: today,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      action: 'QUALITY_REWORK_REQUIRED',
      department: '04 Inward Quality',
      user: details.inspector,
      defectCategory: details.defectCategory.trim(),
      details: `Quality flagged Machine ${handover.machineNumber} (${handover.operation}) for REWORK REQUIRED. Defect Category: ${details.defectCategory}. Reason: ${primaryReason}. Expected review: ${details.expectedReviewDate || 'TBD'}`,
      cycle: handover.currentInspectionCycle || 1,
      status: 'REWORK_REQUIRED',
    });

    // 5. Create Notification
    await createNotification({
      recipientDepartment: targetDept,
      toDepartment: targetDept,
      fromDepartment: '04 Inward Quality',
      title: `REWORK REQUIRED: Machine ${handover.machineNumber}`,
      message: `Quality has marked Machine ${handover.machineNumber} / Operation ${handover.operation} as REWORK REQUIRED. Defect Category: ${details.defectCategory}. Reason: ${primaryReason}. [${handover.handoverId}]`,
      type: 'QUALITY_REWORK',
      handoverId: handover.handoverId,
      machineNumber: handover.machineNumber,
      machineModel: handover.machineModel,
      operation: handover.operation,
      priority: 'High',
      status: 'UNREAD',
      linkId: handoverDocId,
      linkType: 'quality_handover',
    });

    // 6. Update Machine Master status to REWORK_REQUIRED
    if (handover.machineNumber) {
      const mQuery = query(
        collection(db, 'machines'),
        where('machineNumber', '==', handover.machineNumber)
      );
      const mDocs = await getDocs(mQuery);
      for (const mDoc of mDocs.docs) {
        const mData = mDoc.data() as Machine;
        const existingHistory = mData.history || [];
        const histEntry = {
          id: `hist_${Date.now()}`,
          date: today,
          department: '04 Inward Quality',
          task: `Quality Rework Required: ${handover.operation}`,
          employee: details.inspector,
          startDate: today,
          progress: mData.overallProgressPercent || 0,
          status: 'REWORK_REQUIRED',
          remarks: `Quality Rework Required [${handover.handoverId}]. Defect Category: ${details.defectCategory}. Reason: ${primaryReason}`,
        };
        await updateDoc(mDoc.ref, {
          currentDepartment: targetDept,
          responsibleDepartment: targetDept,
          qualityStatus: 'REWORK_REQUIRED',
          status: 'REWORK_REQUIRED',
          currentStatus: 'Rework Required',
          handoverStatus: 'REWORK',
          defectCategory: details.defectCategory.trim(),
          delayReason: `[${details.defectCategory}] ${primaryReason}`,
          history: [histEntry, ...existingHistory],
          updatedAt: now,
        });
      }
    }

    // 7. Update department_work
    try {
      const dwQuery = query(
        collection(db, 'department_work'),
        where('machineNumber', '==', handover.machineNumber),
        where('department', '==', targetDept)
      );
      const dwDocs = await getDocs(dwQuery);
      for (const dwDoc of dwDocs.docs) {
        await updateDoc(dwDoc.ref, {
          status: 'CORRECTIVE_ACTION',
          updatedAt: now,
        });
      }
    } catch (err) {
      console.warn('Sync department_work in qualityReworkHandover warning:', err);
    }

    // 8. Create Immutable Decision Audit Entry
    const auditRecord = {
      handoverId: handover.handoverId,
      machineNumber: handover.machineNumber,
      action: 'REWORK',
      previousStatus: previousStatus || 'PENDING',
      newStatus: 'REWORK_REQUIRED',
      actingUserId: authCheck.userId,
      actingUserRole: authCheck.role,
      timestamp: now,
      defectCategory: details.defectCategory.trim(),
      defectDescription: details.defectDescription || primaryReason,
      inspectionRemarks: details.remarks || primaryReason,
      reason: primaryReason,
      specification: details.specification || details.expectedValue || '',
      actualFinding: details.actualFinding || '',
      correctiveActionRequired: caRequired,
      expectedReviewDate: details.expectedReviewDate || '',
      inspector: details.inspector,
    };
    await addDoc(collection(db, 'quality_decision_audits'), auditRecord);
    try {
      await addDoc(collection(db, 'qualityDecisionAudits'), auditRecord);
    } catch {}

    await logAudit(
      'QUALITY_REWORK_HANDOVER',
      'QUALITY_HANDOVER',
      handoverDocId,
      handover.status,
      `Quality Rework Required on Handover ${handover.handoverId} [${details.defectCategory}]: ${primaryReason}`,
      userEmail
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `qualityHandovers/${handoverDocId}`);
    throw err;
  }
}

export async function qualityHoldHandover(
  handoverDocId: string,
  details: {
    inspector: string;
    defectCategory?: string;
    reason: string;
    defectDescription?: string;
    specification?: string;
    expectedValue?: string;
    actualFinding?: string;
    concernedDepartment?: string;
    correctiveActionRequired?: string;
    expectedReviewDate?: string;
    remarks?: string;
    attachment?: string;
  },
  userEmail?: string
) {
  // Routes to qualityReworkHandover using defect category
  return qualityReworkHandover(
    handoverDocId,
    {
      ...details,
      defectCategory: details.defectCategory || 'Dimensional',
      defectDescription: details.defectDescription || details.reason,
    },
    userEmail
  );
}

export async function startCorrectiveAction(
  handoverDocId: string,
  details: {
    originalIssue: string;
    correctiveAction: string;
    actionTaken: string;
    responsibleEmployee: string;
    completionDate: string;
    remarks?: string;
    attachment?: string;
  },
  userEmail?: string
) {
  try {
    const now = new Date().toISOString();
    const today = now.split('T')[0];

    const hDoc = await getDoc(doc(db, 'qualityHandovers', handoverDocId));
    if (!hDoc.exists()) throw new Error('Handover record not found');
    const handover = hDoc.data() as QualityHandover;

    // 1. Update Handover
    await updateDoc(doc(db, 'qualityHandovers', handoverDocId), {
      status: 'CORRECTIVE_ACTION_IN_PROGRESS',
      correctiveActionStatus: 'IN_PROGRESS',
      updatedAt: now,
      updatedBy: details.responsibleEmployee || userEmail,
    });

    // 2. Query and update/create corrective action record
    const caQuery = query(
      collection(db, 'qualityCorrectiveActions'),
      where('handoverId', '==', handover.handoverId)
    );
    const caDocs = await getDocs(caQuery);
    if (!caDocs.empty) {
      const caDoc = caDocs.docs[0];
      await updateDoc(caDoc.ref, {
        correctiveAction: details.correctiveAction,
        actionTaken: details.actionTaken,
        responsibleEmployee: details.responsibleEmployee,
        completionDate: details.completionDate,
        remarks: details.remarks || '',
        attachment: details.attachment || '',
        status: 'IN_PROGRESS',
        updatedAt: now,
      });
    } else {
      await addDoc(collection(db, 'qualityCorrectiveActions'), {
        handoverId: handover.handoverId,
        inspectionCycle: handover.currentInspectionCycle || 1,
        machineNumber: handover.machineNumber,
        department: handover.sendingDepartment,
        originalIssue: details.originalIssue,
        correctiveAction: details.correctiveAction,
        actionTaken: details.actionTaken,
        responsibleEmployee: details.responsibleEmployee,
        completionDate: details.completionDate,
        remarks: details.remarks || '',
        attachment: details.attachment || '',
        status: 'IN_PROGRESS',
        createdAt: now,
        createdBy: details.responsibleEmployee || userEmail,
      });
    }

    // 3. Add to History
    await addDoc(collection(db, 'qualityHandoverHistory'), {
      handoverId: handover.handoverId,
      timestamp: now,
      date: today,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      action: 'CORRECTIVE_ACTION_STARTED',
      department: handover.sendingDepartment,
      user: details.responsibleEmployee,
      details: `Corrective action started by ${details.responsibleEmployee}. Action planned/taken: ${details.actionTaken || details.correctiveAction}`,
      cycle: handover.currentInspectionCycle || 1,
      status: 'CORRECTIVE_ACTION_IN_PROGRESS',
    });

    await logAudit(
      'START_CORRECTIVE_ACTION',
      'QUALITY_HANDOVER',
      handoverDocId,
      '',
      `Corrective action logged for ${handover.handoverId} by ${details.responsibleEmployee}`,
      userEmail
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `qualityHandovers/${handoverDocId}`);
    throw err;
  }
}

export async function resubmitHandoverToQuality(
  handoverDocId: string,
  details: {
    employee: string;
    actionTaken?: string;
    remarks?: string;
    attachment?: string;
  },
  userEmail?: string
) {
  try {
    const now = new Date().toISOString();
    const today = now.split('T')[0];

    const hDoc = await getDoc(doc(db, 'qualityHandovers', handoverDocId));
    if (!hDoc.exists()) throw new Error('Handover record not found');
    const handover = hDoc.data() as QualityHandover;

    const newCycle = (handover.currentInspectionCycle || 1) + 1;

    const resubmitPayload = {
      status: 'RESUBMITTED' as any,
      qualityStatus: 'REINSPECTION' as any,
      currentInspectionCycle: newCycle,
      correctiveActionStatus: 'RESUBMITTED' as any,
      remarks: details.remarks
        ? `${handover.remarks ? handover.remarks + '\n' : ''}[Cycle ${newCycle} Resubmit]: ${details.remarks}`
        : handover.remarks,
      attachment: details.attachment || handover.attachment,
      updatedAt: now,
      updatedBy: details.employee || userEmail,
    };

    // 1. Update Handover document and dual-write
    await updateDoc(doc(db, 'qualityHandovers', handoverDocId), resubmitPayload);
    try {
      await updateDoc(doc(db, 'quality_handovers', handoverDocId), resubmitPayload);
    } catch {}

    // 2. Update corrective actions record status
    const caQuery = query(
      collection(db, 'qualityCorrectiveActions'),
      where('handoverId', '==', handover.handoverId)
    );
    const caDocs = await getDocs(caQuery);
    for (const caDoc of caDocs.docs) {
      await updateDoc(caDoc.ref, {
        status: 'RESUBMITTED',
        actionTaken: details.actionTaken || (caDoc.data().actionTaken || ''),
        remarks: details.remarks || (caDoc.data().remarks || ''),
        updatedAt: now,
      });
    }

    // 3. Add to quality_reinspections
    try {
      await addDoc(collection(db, 'quality_reinspections'), {
        handoverId: handover.handoverId,
        machineNumber: handover.machineNumber,
        operation: handover.operation,
        sendingDepartment: handover.sendingDepartment,
        cycle: newCycle,
        actionTaken: details.actionTaken || 'Corrected per specs',
        submittedBy: details.employee || userEmail || 'Operator',
        submittedDate: today,
        createdAt: now,
      });
    } catch {}

    // 4. Add to History
    await addDoc(collection(db, 'qualityHandoverHistory'), {
      handoverId: handover.handoverId,
      timestamp: now,
      date: today,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      action: 'RESUBMITTED_TO_QUALITY',
      department: handover.sendingDepartment,
      user: details.employee,
      details: `Work resubmitted to Quality for Re-inspection (Cycle ${newCycle}). Action Taken: ${details.actionTaken || 'Corrected per specs'}. ${details.remarks ? 'Remarks: ' + details.remarks : ''}`,
      cycle: newCycle,
      status: 'RESUBMITTED',
    });

    // 5. Send notification to Quality ONLY
    await createNotification({
      recipientDepartment: '04 Inward Quality',
      recipientRole: 'QUALITY',
      toDepartment: '04 Inward Quality',
      fromDepartment: handover.sendingDepartment,
      title: `Re-inspection Required: Machine ${handover.machineNumber}`,
      message: `Re-submitted work received from ${handover.sendingDepartment} for Machine ${handover.machineNumber} (${handover.operation}). Inspection Cycle ${newCycle}. [${handover.handoverId}]`,
      type: 'QUALITY_RESUBMITTED',
      handoverId: handover.handoverId,
      machineNumber: handover.machineNumber,
      machineModel: handover.machineModel,
      operation: handover.operation,
      priority: 'High',
      status: 'UNREAD',
      linkId: handoverDocId,
      linkType: 'quality_handover',
    });

    // 6. Update Machine Master
    if (handover.machineNumber) {
      const mQuery = query(collection(db, 'machines'), where('machineNumber', '==', handover.machineNumber));
      const mDocs = await getDocs(mQuery);
      for (const mDoc of mDocs.docs) {
        await updateDoc(mDoc.ref, {
          qualityStatus: 'REINSPECTION',
          status: 'RESUBMITTED_TO_QUALITY',
          currentStatus: 'Resubmitted to Quality',
          updatedAt: now,
        });
      }
    }

    // 7. Update department_work
    try {
      const dwQuery = query(
        collection(db, 'department_work'),
        where('machineNumber', '==', handover.machineNumber),
        where('department', '==', handover.sendingDepartment)
      );
      const dwDocs = await getDocs(dwQuery);
      for (const dwDoc of dwDocs.docs) {
        await updateDoc(dwDoc.ref, {
          status: 'RESUBMITTED_TO_QUALITY',
          updatedAt: now,
        });
      }
    } catch {}

    await logAudit(
      'RESUBMIT_QUALITY_HANDOVER',
      'QUALITY_HANDOVER',
      handoverDocId,
      '',
      `Handover ${handover.handoverId} resubmitted for Cycle ${newCycle} by ${details.employee}`,
      userEmail
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `qualityHandovers/${handoverDocId}`);
    throw err;
  }
}

export function subscribeQualityInspections(
  handoverId?: string,
  callback?: (inspections: QualityInspectionRecord[]) => void
) {
  const coll = collection(db, 'qualityInspections');
  return onSnapshot(
    coll,
    (snap) => {
      let list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as QualityInspectionRecord));
      if (handoverId) {
        list = list.filter((i) => i.handoverId === handoverId);
      }
      list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      if (callback) callback(list);
    },
    (err) => handleFirestoreError(err, OperationType.LIST, 'qualityInspections')
  );
}

export function subscribeQualityHolds(
  handoverId?: string,
  callback?: (holds: QualityHoldRecord[]) => void
) {
  const coll = collection(db, 'qualityHolds');
  return onSnapshot(
    coll,
    (snap) => {
      let list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as QualityHoldRecord));
      if (handoverId) {
        list = list.filter((h) => h.handoverId === handoverId);
      }
      list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      if (callback) callback(list);
    },
    (err) => handleFirestoreError(err, OperationType.LIST, 'qualityHolds')
  );
}

export function subscribeQualityCorrectiveActions(
  handoverId?: string,
  callback?: (actions: QualityCorrectiveActionRecord[]) => void
) {
  const coll = collection(db, 'qualityCorrectiveActions');
  return onSnapshot(
    coll,
    (snap) => {
      let list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as QualityCorrectiveActionRecord));
      if (handoverId) {
        list = list.filter((a) => a.handoverId === handoverId);
      }
      list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      if (callback) callback(list);
    },
    (err) => handleFirestoreError(err, OperationType.LIST, 'qualityCorrectiveActions')
  );
}

export function subscribeQualityHandoverHistory(
  handoverId?: string,
  callback?: (history: QualityHandoverHistoryEntry[]) => void
) {
  const coll = collection(db, 'qualityHandoverHistory');
  return onSnapshot(
    coll,
    (snap) => {
      let list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as QualityHandoverHistoryEntry));
      if (handoverId) {
        list = list.filter((h) => h.handoverId === handoverId);
      }
      list.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      if (callback) callback(list);
    },
    (err) => handleFirestoreError(err, OperationType.LIST, 'qualityHandoverHistory')
  );
}

export function subscribeNotifications(
  userDepartment?: string,
  userRole?: string,
  userId?: string,
  callback?: (notifs: SystemNotification[]) => void
) {
  const localUnsub = subscribeLocalCollection<SystemNotification>('notifications', (rawList) => {
    if (!callback) return;
    let list = rawList.map((n) => ({
      ...n,
      read: n.read ?? n.isRead ?? false,
      isRead: n.isRead ?? n.read ?? false,
    }));
    if (userRole !== 'ADMIN') {
      list = list.filter((n) => {
        if (n.recipientId && n.recipientId === userId) return true;
        if (n.recipientUserId && n.recipientUserId === userId) return true;

        const isQualityUser =
          userDepartment?.toLowerCase().includes('quality') ||
          userDepartment === '04 Inward Quality' ||
          userDepartment === '14 Calibration';

        const isQualityTarget =
          n.recipientDepartment?.toLowerCase().includes('quality') ||
          n.recipientDepartment === '04 Inward Quality' ||
          n.toDepartment?.toLowerCase().includes('quality') ||
          n.toDepartment === '04 Inward Quality' ||
          n.recipientRole === 'QUALITY';

        if (isQualityUser && isQualityTarget) return true;

        if (n.recipientDepartment && isDepartmentMatch(n.recipientDepartment, userDepartment)) return true;
        if (n.toDepartment && isDepartmentMatch(n.toDepartment, userDepartment)) return true;
        if (n.recipientRole && n.recipientRole === userRole) return true;
        return !n.recipientDepartment && !n.recipientRole && !n.recipientId && !n.toDepartment;
      });
    }
    list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    callback(list);
  });

  let firestoreUnsub = () => {};
  try {
    firestoreUnsub = onSnapshot(
      collection(db, 'notifications'),
      (snap) => {
        if (!snap.empty) {
          const raw = snap.docs.map((d) => ({ id: d.id, ...d.data() } as SystemNotification));
          saveLocalCollection('notifications', raw);
        }
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'notifications')
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'notifications');
  }

  return () => {
    localUnsub();
    firestoreUnsub();
  };
}

export async function markNotificationAsRead(notifId: string) {
  try {
    await updateDoc(doc(db, 'notifications', notifId), {
      read: true,
      isRead: true,
      status: 'READ',
      readAt: new Date().toISOString(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `notifications/${notifId}`);
  }
}

export async function markAllNotificationsAsRead(userDepartment?: string, userRole?: string) {
  try {
    const snap = await getDocs(collection(db, 'notifications'));
    const unread = snap.docs.filter((d) => !d.data().read && !d.data().isRead);
    const batch = writeBatch(db);
    unread.forEach((d) => {
      const data = d.data();
      if (
        userRole === 'ADMIN' ||
        !data.recipientDepartment ||
        isDepartmentMatch(data.recipientDepartment, userDepartment) ||
        isDepartmentMatch(data.toDepartment, userDepartment)
      ) {
        batch.update(d.ref, {
          read: true,
          isRead: true,
          status: 'READ',
          readAt: new Date().toISOString(),
        });
      }
    });
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, 'notifications');
  }
}

export async function deleteNotification(id: string) {
  try {
    await deleteDoc(doc(db, 'notifications', id));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `notifications/${id}`);
  }
}

// --- AUDIT LOGS ---
export function subscribeAuditLogs(callback: (logs: AuditLogEntry[]) => void) {
  const localUnsub = subscribeLocalCollection<AuditLogEntry>('audit_logs', callback);

  let firestoreUnsub = () => {};
  try {
    firestoreUnsub = onSnapshot(
      collection(db, 'audit_logs'),
      (snap) => {
        if (!snap.empty) {
          const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as AuditLogEntry));
          list.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
          saveLocalCollection('audit_logs', list);
        }
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'audit_logs')
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'audit_logs');
  }

  return () => {
    localUnsub();
    firestoreUnsub();
  };
}

// --- IMPORT HISTORY ---
export function subscribeImportHistory(callback: (history: ImportHistoryEntry[]) => void) {
  const localUnsub = subscribeLocalCollection<ImportHistoryEntry>('import_history', callback);

  let firestoreUnsub = () => {};
  try {
    firestoreUnsub = onSnapshot(
      collection(db, 'import_history'),
      (snap) => {
        if (!snap.empty) {
          const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as ImportHistoryEntry));
          list.sort((a, b) => new Date(b.uploadDateTime).getTime() - new Date(a.uploadDateTime).getTime());
          saveLocalCollection('import_history', list);
        }
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'import_history')
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'import_history');
  }

  return () => {
    localUnsub();
    firestoreUnsub();
  };
}

export async function recordImportHistory(entry: Omit<ImportHistoryEntry, 'id'>, userEmail?: string) {
  try {
    const ref = await addDoc(collection(db, 'import_history'), entry);
    await logAudit(
      'IMPORT_EXCEL',
      'IMPORT',
      ref.id,
      '',
      `Imported ${entry.importedCount} rows from ${entry.fileName}`,
      userEmail
    );
    return ref.id;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, 'import_history');
  }
}

export async function bulkImportMachines(
  rows: Record<string, any>[],
  userEmail?: string
): Promise<number> {
  let count = 0;
  try {
    const now = new Date().toISOString();
    // Process in batches of 400
    const chunkSize = 400;
    for (let i = 0; i < rows.length; i += chunkSize) {
      const chunk = rows.slice(i, i + chunkSize);
      const batch = writeBatch(db);

      for (const row of chunk) {
        const machineNo = String(
          row['Machine Number'] || row.machineNumber || row['Machine No'] || row['Sr. No.'] || ''
        ).trim();
        const model = String(row['Model / Size'] || row.model || row.Model || '').trim();
        if (!machineNo || !model) continue;

        const ref = doc(collection(db, 'machines'));
        batch.set(ref, {
          machineNumber: machineNo,
          model,
          project: String(row.Project || row.project || ''),
          customer: String(row.Customer || row.customer || ''),
          planMonth: String(row['Plan Month'] || row.planMonth || ''),
          currentDepartment: String(row.Department || row.currentDepartment || '06-A Metal Shop'),
          currentStatus: String(row['Current Status'] || row.currentStatus || 'Under Progress'),
          plannedDate: String(row['Planned Date'] || row.plannedDate || ''),
          actualDispatchDate: String(row['Dispatch Date'] || row.actualDispatchDate || ''),
          remarks: String(row.Remarks || row.remarks || ''),
          createdAt: now,
          updatedAt: now,
        });
        count++;
      }
      await batch.commit();
    }

    await logAudit('BULK_IMPORT_MACHINES', 'MACHINES', 'bulk', '', `Imported ${count} machines`, userEmail);
    return count;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'machines');
    return count;
  }
}

export async function bulkImportMonthlyPlans(
  rows: Record<string, any>[],
  userEmail?: string
): Promise<number> {
  let count = 0;
  try {
    const now = new Date().toISOString();
    const chunkSize = 400;
    for (let i = 0; i < rows.length; i += chunkSize) {
      const chunk = rows.slice(i, i + chunkSize);
      const batch = writeBatch(db);

      for (const row of chunk) {
        const month = String(row.Month || row.month || 'March').trim();
        const year = Number(row.Year || row.year || new Date().getFullYear());
        const department = String(row.Department || row.department || '').trim();
        if (!department) continue;

        const plannedQty = Number(row['Target / Planned Qty'] || row.plannedQuantity || row.Target || 0);
        const machineNum = String(row['Machine Number'] || row.machineNumber || row['CMM NO'] || row['CMM No'] || '').trim();
        const machineModel = String(row['Model / Size'] || row.machineModel || row['CMM SIZE'] || row['CMM Size'] || '').trim();
        const plannedStartDate = String(row['Start Date'] || row.startDate || row.plannedStartDate || '').trim();
        const plannedEndDate = String(row['Target Date'] || row['Due Date'] || row.dueDate || row.plannedEndDate || '').trim();
        const project = String(row.Project || row.project || '').trim();
        const operationWork = String(row['Operation / Work'] || row.operationWork || row.Task || row.task || '').trim();
        const priority = String(row.Priority || row.priority || 'Medium').trim();

        const ref = doc(collection(db, 'monthly_plans'));
        batch.set(ref, {
          month,
          year,
          department,
          machineModel,
          machineNumber: machineNum,
          project,
          operationWork,
          category: String(row.Category || row.category || ''),
          plannedQuantity: plannedQty,
          actualQuantity: Number(row['Actual Qty'] || row.actualQuantity || 0),
          plannedTime: String(row['Planned Time'] || row.plannedTime || ''),
          plannedStartDate: plannedStartDate || undefined,
          plannedEndDate: plannedEndDate || undefined,
          responsibleEmployee: String(row['Responsible Employee'] || row.responsibleEmployee || ''),
          priority,
          remarks: String(row.Remarks || row.remarks || ''),
          createdAt: now,
          updatedAt: now,
        });

        // Also ensure master machine and department_work records are prepared (ONE MACHINE = ONE RECORD)
        if (machineNum) {
          const cleanDocId = machineNum.replace(/[^a-zA-Z0-9_-]/g, '_');
          const mRef = doc(db, 'machines', `mach_${cleanDocId}`);
          batch.set(mRef, {
            machineNumber: machineNum,
            model: machineModel || 'Standard',
            machineModel: machineModel || 'Standard',
            currentDepartment: department,
            responsibleDepartment: department,
            project: project,
            planMonth: month,
            planYear: String(year),
            priority: priority,
            currentWork: operationWork || 'Planned Department Work',
            progress: 0,
            overallProgressPercent: 0,
            status: 'IN_PROGRESS',
            currentStatus: 'In Progress',
            plannedStartDate: plannedStartDate || now.split('T')[0],
            plannedDueDate: plannedEndDate || '',
            targetDate: plannedEndDate || '',
            assignedDate: plannedStartDate || now.split('T')[0],
            dueDate: plannedEndDate || '',
            operations: [
              { id: `op_1`, name: 'Material & Parts Preparation', department, status: 'Not Started' },
              { id: `op_2`, name: 'Manufacturing / Assembly Process', department, status: 'Not Started' },
              { id: `op_3`, name: 'Quality Inspection & Verification', department, status: 'Not Started' },
            ],
            createdAt: now,
            updatedAt: now,
            createdBy: userEmail || 'Excel Import Master',
          }, { merge: true });

          const wRef = doc(db, 'department_work', `imported_work_${cleanDocId}_${department.replace(/[^a-zA-Z0-9]/g, '_')}`);
          batch.set(wRef, {
            title: `${operationWork || 'Planned Work'} - Machine ${machineNum}`,
            department: department,
            machineNumber: machineNum,
            machineModel: machineModel || 'Standard',
            operationWork: operationWork || 'Planned Department Work',
            category: 'Production',
            plannedQuantity: plannedQty || 1,
            actualQuantity: 0,
            status: 'In Progress',
            priority: priority,
            assignedTo: 'Department Team',
            assignedDate: plannedStartDate || now.split('T')[0],
            targetDate: plannedEndDate || '',
            dueDate: plannedEndDate || '',
            remarks: `Imported from Excel Monthly Plan (${month} ${year})`,
            progress: 0,
            operations: [
              { id: `op_1`, name: 'Material & Parts Preparation', department, status: 'Not Started' },
              { id: `op_2`, name: 'Manufacturing / Assembly Process', department, status: 'Not Started' },
              { id: `op_3`, name: 'Quality Inspection & Verification', department, status: 'Not Started' },
            ],
            createdAt: now,
            updatedAt: now,
            createdBy: userEmail || 'Excel Import Master',
          }, { merge: true });
        }
        count++;
      }
      await batch.commit();
    }

    await logAudit('BULK_IMPORT_PLANNING', 'PLANNING', 'bulk', '', `Imported ${count} monthly plans`, userEmail);
    return count;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'monthly_plans');
    return count;
  }
}

export async function bulkImportQualityOperations(
  rows: Record<string, any>[],
  userEmail?: string
): Promise<number> {
  let count = 0;
  try {
    const now = new Date().toISOString();
    const chunkSize = 400;
    for (let i = 0; i < rows.length; i += chunkSize) {
      const chunk = rows.slice(i, i + chunkSize);
      const batch = writeBatch(db);

      for (const row of chunk) {
        const machineModel = String(
          row['Machine Model / Size'] || row.machineModel || row.Model || ''
        ).trim();
        const operationName = String(
          row['Operation Name'] || row.operationName || row.Operation || ''
        ).trim();
        if (!machineModel || !operationName) continue;

        const ref = doc(collection(db, 'quality_operations'));
        batch.set(ref, {
          machineModel,
          operationName,
          category: String(row['Category'] || row.category || 'Manufacturing (Fabrication, Machining, Sub-Assembly, etc.)'),
          partCode: String(row['Part Code'] || row.partCode || ''),
          srNo: String(row['Sr. No.'] || row.srNo || ''),
          processDepartment: String(row['Process / Department'] || row.processDepartment || ''),
          plannedInspectionTime: String(row['Planned Inspection Time'] || row.plannedInspectionTime || ''),
          specificationRequirement: String(row['Specification / Requirement'] || row.specificationRequirement || ''),
          active: true,
          createdAt: now,
          updatedAt: now,
        });
        count++;
      }
      await batch.commit();
    }

    await logAudit('BULK_IMPORT_QUALITY', 'QUALITY', 'bulk', '', `Imported ${count} operations`, userEmail);
    return count;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'quality_operations');
    return count;
  }
}

// --- MACHINE DOCUMENTS ---
export function subscribeMachineDocuments(machineNumber: string, callback: (docs: MachineDocument[]) => void) {
  const q = query(collection(db, 'machine_documents'), where('machineNumber', '==', machineNumber));
  return onSnapshot(
    q,
    (snap) => {
      callback(snap.docs.map((d) => ({ id: d.id, ...d.data() } as MachineDocument)));
    },
    (err) => handleFirestoreError(err, OperationType.LIST, 'machine_documents')
  );
}

export async function addMachineDocument(documentItem: Omit<MachineDocument, 'id' | 'uploadedAt'>, userEmail?: string) {
  try {
    const now = new Date().toISOString();
    const ref = await addDoc(collection(db, 'machine_documents'), { ...documentItem, uploadedAt: now });
    await logAudit(
      'UPLOAD_DOCUMENT',
      'DOCUMENTS',
      ref.id,
      '',
      `Document: ${documentItem.title} (${documentItem.category}) for Machine ${documentItem.machineNumber}`,
      userEmail
    );
    return ref.id;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, 'machine_documents');
  }
}

export async function deleteMachineDocument(id: string, title?: string, userEmail?: string) {
  try {
    await deleteDoc(doc(db, 'machine_documents', id));
    await logAudit('DELETE_DOCUMENT', 'DOCUMENTS', id, title || '', 'DELETED', userEmail);
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `machine_documents/${id}`);
  }
}

// --- ADMIN: DANGEROUS DELETE ALL / SELECTIVE DELETE ---
export async function adminSelectiveDelete(
  collectionsToDelete: Array<
    | 'machines'
    | 'yearly_plans'
    | 'monthly_plans'
    | 'weekly_plans'
    | 'quality_operations'
    | 'quality_daily_checks'
    | 'quality_rejections'
    | 'department_work'
    | 'department_handovers'
    | 'notifications'
    | 'audit_logs'
    | 'import_history'
    | 'machine_documents'
  >,
  userEmail?: string
) {
  try {
    for (const collName of collectionsToDelete) {
      const snap = await getDocs(collection(db, collName));
      const batch = writeBatch(db);
      snap.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
    await logAudit(
      'ADMIN_DELETE_COLLECTIONS',
      'ADMIN',
      'multi',
      '',
      `Deleted collections: ${collectionsToDelete.join(', ')}`,
      userEmail
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, 'multiple');
    throw err;
  }
}

// Clear all operational data while preserving departments configuration and user accounts
export async function clearAllOperationalData(userEmail?: string) {
  const operationalCollections = [
    'machines',
    'yearly_plans',
    'yearlyPlans',
    'monthly_plans',
    'monthlyPlans',
    'weekly_plans',
    'weeklyPlans',
    'department_work',
    'department_handovers',
    'quality_operations',
    'operations',
    'quality_daily_checks',
    'quality_rejections',
    'machine_documents',
    'import_history',
    'notifications',
    'roadmap_items',
  ];

  try {
    for (const collName of operationalCollections) {
      const snap = await getDocs(collection(db, collName));
      if (!snap.empty) {
        // Delete in chunks of 450 to stay under batch limit of 500
        const docs = snap.docs;
        for (let i = 0; i < docs.length; i += 450) {
          const chunk = docs.slice(i, i + 450);
          const batch = writeBatch(db);
          chunk.forEach((d) => batch.delete(d.ref));
          await batch.commit();
        }
      }
    }

    await logAudit(
      'CLEAR_ALL_OPERATIONAL_DATA',
      'ADMIN',
      'system',
      '',
      'Purged all operational collections (machines, plans, work, checks, rejections, documents, logs). Preserved system configuration and user accounts.',
      userEmail
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, 'operational_collections');
    throw err;
  }
}

// --- ALL MACHINE DOCUMENTS ---
export function subscribeAllMachineDocuments(callback: (docs: MachineDocument[]) => void) {
  const localUnsub = subscribeLocalCollection<MachineDocument>('machine_documents', callback);

  let firestoreUnsub = () => {};
  try {
    firestoreUnsub = onSnapshot(
      collection(db, 'machine_documents'),
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as MachineDocument));
        saveLocalCollection('machine_documents', list);
        callback(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'machine_documents')
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'machine_documents');
  }

  return () => {
    localUnsub();
    try {
      firestoreUnsub();
    } catch (_) {}
  };
}

// --- USER PROFILES ---
export function subscribeUserProfiles(callback: (profiles: UserProfile[]) => void) {
  const localUnsub = subscribeLocalCollection<UserProfile>('users', callback);

  let firestoreUnsub = () => {};
  try {
    firestoreUnsub = onSnapshot(
      collection(db, 'users'),
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as UserProfile));
        saveLocalCollection('users', list);
        callback(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'users')
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'users');
  }

  return () => {
    localUnsub();
    try {
      firestoreUnsub();
    } catch (_) {}
  };
}

export async function addUserProfile(profile: Omit<UserProfile, 'id' | 'createdAt' | 'updatedAt'>) {
  try {
    const now = new Date().toISOString();
    // Use email or auto id
    const docId = profile.email.replace(/[^a-zA-Z0-9_-]/g, '_');
    const ref = doc(db, 'users', docId);
    await setDoc(ref, {
      ...profile,
      createdAt: now,
      updatedAt: now,
    });
    await logAudit('CREATE_USER_PROFILE', 'USERS', docId, '', `${profile.displayName} (${profile.role})`, profile.createdBy);
    return docId;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'users');
  }
}

export async function updateUserProfile(id: string, updates: Partial<UserProfile>, userEmail?: string) {
  try {
    const now = new Date().toISOString();
    await updateDoc(doc(db, 'users', id), {
      ...updates,
      updatedAt: now,
    });
    await logAudit('UPDATE_USER', 'USERS', id, '', JSON.stringify(updates), userEmail);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `users/${id}`);
  }
}

export async function deleteUserProfile(id: string, displayName?: string, userEmail?: string) {
  try {
    await deleteDoc(doc(db, 'users', id));
    await logAudit('DELETE_USER', 'USERS', id, displayName || '', 'DELETED', userEmail);
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `users/${id}`);
  }
}

// =========================================================================
// ACCESSORIES ORDERS SERVICE
// =========================================================================

export const ACCESSORIES_TARGET_DEPARTMENTS = [
  '03 Purchase',
  '05 Store',
  '11-A Electronics-Cable Set',
  '14 Calibration',
  '15 Packing',
];

export function subscribeAccessoriesOrders(callback: (orders: AccessoriesOrder[]) => void) {
  const localUnsub = subscribeLocalCollection<AccessoriesOrder>('accessoriesOrders', (orders) => {
    const sorted = [...orders].sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
    callback(sorted);
  });

  let firestoreUnsub = () => {};
  try {
    firestoreUnsub = onSnapshot(
      collection(db, 'accessoriesOrders'),
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as AccessoriesOrder));
        list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        saveLocalCollection('accessoriesOrders', list);
        callback(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'accessoriesOrders')
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'accessoriesOrders');
  }

  return () => {
    localUnsub();
    try {
      firestoreUnsub();
    } catch (_) {}
  };
}

export function subscribeAccessoriesItems(
  orderIdOrCallback?: string | ((items: AccessoriesItem[]) => void),
  maybeCallback?: (items: AccessoriesItem[]) => void
) {
  const orderId = typeof orderIdOrCallback === 'string' ? orderIdOrCallback : undefined;
  const callback = typeof orderIdOrCallback === 'function' ? orderIdOrCallback : maybeCallback;
  
  const localUnsub = subscribeLocalCollection<AccessoriesItem>('accessoriesItems', (items) => {
    const filtered = orderId ? items.filter((i) => i.orderId === orderId) : items;
    filtered.sort((a, b) => Number(a.srNo || 0) - Number(b.srNo || 0));
    if (callback) callback(filtered);
  });

  let firestoreUnsub = () => {};
  try {
    const colRef = collection(db, 'accessoriesItems');
    const q = orderId ? query(colRef, where('orderId', '==', orderId)) : colRef;
    firestoreUnsub = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as AccessoriesItem));
        list.sort((a, b) => Number(a.srNo) - Number(b.srNo));
        if (callback) callback(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'accessoriesItems')
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'accessoriesItems');
  }

  return () => {
    localUnsub();
    try {
      firestoreUnsub();
    } catch (_) {}
  };
}

export function subscribeAccessoriesCompliances(
  orderIdOrCallback?: string | ((compliances: AccessoriesCompliance[]) => void),
  maybeCallback?: (compliances: AccessoriesCompliance[]) => void
) {
  const orderId = typeof orderIdOrCallback === 'string' ? orderIdOrCallback : undefined;
  const callback = typeof orderIdOrCallback === 'function' ? orderIdOrCallback : maybeCallback;

  const localUnsub = subscribeLocalCollection<AccessoriesCompliance>('accessoriesCompliances', (compliances) => {
    const filtered = orderId ? compliances.filter((c) => c.orderId === orderId) : compliances;
    if (callback) callback(filtered);
  });

  let firestoreUnsub = () => {};
  try {
    const colRef = collection(db, 'accessoriesCompliances');
    const q = orderId ? query(colRef, where('orderId', '==', orderId)) : colRef;
    firestoreUnsub = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as AccessoriesCompliance));
        if (callback) callback(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'accessoriesCompliances')
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'accessoriesCompliances');
  }

  return () => {
    localUnsub();
    try {
      firestoreUnsub();
    } catch (_) {}
  };
}

export function subscribeAccessoriesOrderHistory(
  orderIdOrCallback?: string | ((history: AccessoriesOrderHistory[]) => void),
  maybeCallback?: (history: AccessoriesOrderHistory[]) => void
) {
  const orderId = typeof orderIdOrCallback === 'string' ? orderIdOrCallback : undefined;
  const callback = typeof orderIdOrCallback === 'function' ? orderIdOrCallback : maybeCallback;

  const localUnsub = subscribeLocalCollection<AccessoriesOrderHistory>('accessoriesOrderHistory', (history) => {
    const filtered = orderId ? history.filter((h) => h.orderId === orderId) : history;
    filtered.sort((a, b) => new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime());
    if (callback) callback(filtered);
  });

  let firestoreUnsub = () => {};
  try {
    const colRef = collection(db, 'accessoriesOrderHistory');
    const q = orderId ? query(colRef, where('orderId', '==', orderId)) : colRef;
    firestoreUnsub = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as AccessoriesOrderHistory));
        list.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        if (callback) callback(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'accessoriesOrderHistory')
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'accessoriesOrderHistory');
  }

  return () => {
    localUnsub();
    try {
      firestoreUnsub();
    } catch (_) {}
  };
}

export async function createAccessoriesOrder(
  orderData: Omit<AccessoriesOrder, 'id' | 'createdAt' | 'updatedAt' | 'totalItemsCount' | 'completedItemsCount'>,
  items: Array<Omit<AccessoriesItem, 'id' | 'orderId' | 'orderNumber' | 'createdAt' | 'updatedAt'>>,
  userEmail?: string,
  userName?: string
) {
  try {
    const now = new Date().toISOString();
    const today = now.split('T')[0];
    const time = new Date().toLocaleTimeString('en-US', { hour12: false });

    // Initial department statuses
    const initialDeptStatuses: Record<string, ComplianceStatus> = {};
    if (orderData.status === 'Released') {
      ACCESSORIES_TARGET_DEPARTMENTS.forEach((dept) => {
        initialDeptStatuses[dept] = 'Pending';
      });
    }

    const orderDocRef = await addDoc(collection(db, 'accessoriesOrders'), {
      ...orderData,
      orderType: 'ACCESSORIES',
      revision: orderData.revision ?? 0,
      totalItemsCount: items.length,
      completedItemsCount: 0,
      departmentStatuses: orderData.departmentStatuses || initialDeptStatuses,
      releasedAt: orderData.status === 'Released' ? now : null,
      releasedBy: orderData.status === 'Released' ? (userName || userEmail || 'Planning') : null,
      createdAt: now,
      updatedAt: now,
    });

    const orderId = orderDocRef.id;

    // Dual-write to accessories_orders
    try {
      await setDoc(doc(db, 'accessories_orders', orderId), {
        id: orderId,
        ...orderData,
        orderType: 'ACCESSORIES',
        revision: orderData.revision ?? 0,
        totalItemsCount: items.length,
        completedItemsCount: 0,
        departmentStatuses: orderData.departmentStatuses || initialDeptStatuses,
        releasedAt: orderData.status === 'Released' ? now : null,
        releasedBy: orderData.status === 'Released' ? (userName || userEmail || 'Planning') : null,
        createdAt: now,
        updatedAt: now,
      });
    } catch {
      // ignore
    }

    // Add items
    for (const item of items) {
      const itemRef = await addDoc(collection(db, 'accessoriesItems'), {
        ...item,
        orderId,
        orderNumber: orderData.orderNumber,
        createdAt: now,
        updatedAt: now,
      });
      try {
        await setDoc(doc(db, 'accessories_items', itemRef.id), {
          id: itemRef.id,
          ...item,
          orderId,
          orderNumber: orderData.orderNumber,
          createdAt: now,
          updatedAt: now,
        });
      } catch {
        // ignore
      }
    }

    // Add order history
    await addDoc(collection(db, 'accessoriesOrderHistory'), {
      orderId,
      orderNumber: orderData.orderNumber,
      date: today,
      time,
      user: userName || userEmail || 'Planning',
      department: 'Planning Accessories',
      action: orderData.status === 'Released' ? 'ORDER_RELEASED' : 'ORDER_CREATED_DRAFT',
      oldStatus: '',
      newStatus: orderData.status,
      remarks: orderData.status === 'Released'
        ? `Accessories Order ${orderData.orderNumber} created and released for CMM ${orderData.cmmNumber} with ${items.length} items`
        : `Accessories Order ${orderData.orderNumber} saved as draft for CMM ${orderData.cmmNumber}`,
      timestamp: now,
    });

    // If released, notify Purchase, Store, Electronics, Calibration, Packing
    if (orderData.status === 'Released') {
      for (const dept of ACCESSORIES_TARGET_DEPARTMENTS) {
        await createNotification({
          recipientDepartment: dept,
          recipientRole: 'DEPARTMENT USER',
          title: `Accessories Order Released: ${orderData.orderNumber}`,
          message: `Planning released Accessories Order ${orderData.orderNumber} for CMM ${orderData.cmmNumber} (${orderData.cmmModel}). Required Date: ${orderData.requiredDate}. Priority: ${orderData.priority}.`,
          type: 'accessories_order',
          linkId: orderId,
          linkType: 'accessories_order',
        });
      }
    }

    await logAudit(
      orderData.status === 'Released' ? 'RELEASE_ACCESSORIES_ORDER' : 'CREATE_ACCESSORIES_ORDER_DRAFT',
      'ACCESSORIES_ORDERS',
      orderId,
      '',
      `Order ${orderData.orderNumber} (CMM ${orderData.cmmNumber}) - ${items.length} items`,
      userEmail
    );

    return orderId;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, 'accessoriesOrders');
    throw err;
  }
}

export async function releaseAccessoriesOrder(
  orderId: string,
  userEmail?: string,
  userName?: string
) {
  try {
    const now = new Date().toISOString();
    const today = now.split('T')[0];
    const time = new Date().toLocaleTimeString('en-US', { hour12: false });

    const orderDoc = await getDoc(doc(db, 'accessoriesOrders', orderId));
    if (!orderDoc.exists()) throw new Error('Order not found');
    const order = orderDoc.data() as AccessoriesOrder;

    const initialDeptStatuses: Record<string, ComplianceStatus> = {};
    ACCESSORIES_TARGET_DEPARTMENTS.forEach((dept) => {
      initialDeptStatuses[dept] = order.departmentStatuses?.[dept] || 'Pending';
    });

    const updates = {
      status: 'Released' as const,
      releasedAt: now,
      releasedBy: userName || userEmail || 'Planning',
      updatedAt: now,
      updatedBy: userEmail || 'Planning',
      departmentStatuses: initialDeptStatuses,
    };

    await updateDoc(doc(db, 'accessoriesOrders', orderId), updates);
    try {
      await updateDoc(doc(db, 'accessories_orders', orderId), updates);
    } catch {
      // ignore
    }

    // Add history
    await addDoc(collection(db, 'accessoriesOrderHistory'), {
      orderId,
      orderNumber: order.orderNumber,
      date: today,
      time,
      user: userName || userEmail || 'Planning',
      department: 'Planning Accessories',
      action: 'ORDER_RELEASED',
      oldStatus: order.status,
      newStatus: 'Released',
      remarks: `Order ${order.orderNumber} released to departments (Purchase, Store, Electronics, Calibration, Packing)`,
      timestamp: now,
    });

    // Notify departments
    for (const dept of ACCESSORIES_TARGET_DEPARTMENTS) {
      await createNotification({
        recipientDepartment: dept,
        recipientRole: 'DEPARTMENT USER',
        title: `Accessories Order Released: ${order.orderNumber}`,
        message: `Planning released Accessories Order ${order.orderNumber} for CMM ${order.cmmNumber} (${order.cmmModel}). Required Date: ${order.requiredDate}.`,
        type: 'accessories_order',
        linkId: orderId,
        linkType: 'accessories_order',
      });
    }

    await logAudit('RELEASE_ACCESSORIES_ORDER', 'ACCESSORIES_ORDERS', orderId, order.status, 'Released', userEmail);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `accessoriesOrders/${orderId}`);
    throw err;
  }
}

export async function updateAccessoriesOrder(
  orderId: string,
  updates: Partial<AccessoriesOrder>,
  userEmail?: string,
  userName?: string,
  revisionRemarks?: string
) {
  try {
    const now = new Date().toISOString();
    const today = now.split('T')[0];
    const time = new Date().toLocaleTimeString('en-US', { hour12: false });

    const orderDoc = await getDoc(doc(db, 'accessoriesOrders', orderId));
    if (!orderDoc.exists()) throw new Error('Order not found');
    const prev = orderDoc.data() as AccessoriesOrder;

    const newRevision = updates.revision !== undefined ? updates.revision : (prev.status === 'Released' ? (prev.revision || 0) + 1 : prev.revision || 0);

    const updatePayload = {
      ...updates,
      revision: newRevision,
      updatedAt: now,
      updatedBy: userEmail || 'Planning',
    };

    await updateDoc(doc(db, 'accessoriesOrders', orderId), updatePayload);
    try {
      await updateDoc(doc(db, 'accessories_orders', orderId), updatePayload);
    } catch {
      // ignore
    }

    // Add history
    await addDoc(collection(db, 'accessoriesOrderHistory'), {
      orderId,
      orderNumber: prev.orderNumber,
      date: today,
      time,
      user: userName || userEmail || 'Planning',
      department: 'Planning Accessories',
      action: prev.status === 'Released' ? `ORDER_REVISED_R${newRevision}` : 'ORDER_UPDATED',
      oldStatus: prev.status,
      newStatus: updates.status || prev.status,
      remarks: revisionRemarks || `Order revised to Rev ${newRevision}`,
      timestamp: now,
    });

    await logAudit('UPDATE_ACCESSORIES_ORDER', 'ACCESSORIES_ORDERS', orderId, JSON.stringify(prev), JSON.stringify(updatePayload), userEmail);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `accessoriesOrders/${orderId}`);
    throw err;
  }
}

export async function deleteAccessoriesOrder(orderId: string, userEmail?: string) {
  try {
    await deleteDoc(doc(db, 'accessoriesOrders', orderId));
    try {
      await deleteDoc(doc(db, 'accessories_orders', orderId));
    } catch {
      // ignore
    }
    await logAudit('DELETE_ACCESSORIES_ORDER', 'ACCESSORIES_ORDERS', orderId, '', 'DELETED', userEmail);
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `accessoriesOrders/${orderId}`);
    throw err;
  }
}

export async function saveAccessoriesCompliance(
  complianceData: Omit<AccessoriesCompliance, 'id' | 'pendingQuantity' | 'updatedAt'>,
  userEmail?: string,
  userName?: string,
  userDept?: string
) {
  try {
    const now = new Date().toISOString();
    const today = now.split('T')[0];
    const time = new Date().toLocaleTimeString('en-US', { hour12: false });

    const reqQty = Number(complianceData.requiredQuantity) || 0;
    const compQty = Number(complianceData.completedQuantity) || 0;
    const pendingQty = Math.max(0, reqQty - compQty);

    const sanitizedDept = complianceData.department.replace(/[^a-zA-Z0-9_-]/g, '_');
    const docId = `comp_${complianceData.orderId}_${complianceData.itemId}_${sanitizedDept}`;

    const recordPayload: AccessoriesCompliance = {
      id: docId,
      ...complianceData,
      requiredQuantity: reqQty,
      completedQuantity: compQty,
      pendingQuantity: pendingQty,
      updatedAt: now,
      updatedBy: userEmail || userName || 'User',
    };

    await setDoc(doc(db, 'accessoriesCompliances', docId), recordPayload);
    try {
      await setDoc(doc(db, 'accessories_compliances', docId), recordPayload);
    } catch {
      // ignore
    }

    // Add History
    await addDoc(collection(db, 'accessoriesOrderHistory'), {
      orderId: complianceData.orderId,
      orderNumber: complianceData.orderNumber || '',
      date: today,
      time,
      user: userName || userEmail || 'Operator',
      department: complianceData.department,
      action: 'COMPLIANCE_UPDATED',
      item: complianceData.itemName || complianceData.itemId,
      newStatus: complianceData.status,
      remarks: `${complianceData.department} updated compliance for ${complianceData.itemName || 'Item'}: Completed ${compQty}/${reqQty}. Status: ${complianceData.status}. ${complianceData.remarks || ''}`,
      attachment: complianceData.attachment,
      timestamp: now,
    });

    // Check next department notification workflow
    // Purchase -> Store -> Electronics -> Calibration -> Packing
    const deptUpper = complianceData.department.toUpperCase();
    if (deptUpper.includes('PURCHASE') && (complianceData.status === 'Completed' || compQty >= reqQty)) {
      await createNotification({
        recipientDepartment: '05 Store',
        recipientRole: 'DEPARTMENT USER',
        title: `Purchase Completed for Order ${complianceData.orderNumber}`,
        message: `Purchase completed for item "${complianceData.itemName}" in Accessories Order ${complianceData.orderNumber}. Ready for store material inward/receipt.`,
        type: 'compliance_update',
        linkId: complianceData.orderId,
        linkType: 'accessories_order',
      });
    } else if (deptUpper.includes('STORE') && (complianceData.status === 'Completed' || compQty >= reqQty)) {
      await createNotification({
        recipientDepartment: '11-A Electronics-Cable Set',
        recipientRole: 'DEPARTMENT USER',
        title: `Store Received Material: Order ${complianceData.orderNumber}`,
        message: `Store received item "${complianceData.itemName}" in Accessories Order ${complianceData.orderNumber}. Ready for Electronics processing/verification.`,
        type: 'compliance_update',
        linkId: complianceData.orderId,
        linkType: 'accessories_order',
      });
    } else if (deptUpper.includes('ELECTRONICS') && (complianceData.status === 'Completed' || compQty >= reqQty)) {
      await createNotification({
        recipientDepartment: '14 Calibration',
        recipientRole: 'CALIBRATION',
        title: `Electronics Done: Order ${complianceData.orderNumber}`,
        message: `Electronics completed processing for item "${complianceData.itemName}" in Accessories Order ${complianceData.orderNumber}. Ready for Calibration.`,
        type: 'compliance_update',
        linkId: complianceData.orderId,
        linkType: 'accessories_order',
      });
    } else if (deptUpper.includes('CALIBRATION') && (complianceData.status === 'Completed' || compQty >= reqQty)) {
      await createNotification({
        recipientDepartment: '15 Packing',
        recipientRole: 'PACKING',
        title: `Calibration Done: Order ${complianceData.orderNumber}`,
        message: `Calibration completed for item "${complianceData.itemName}" in Accessories Order ${complianceData.orderNumber}. Ready for Packing.`,
        type: 'compliance_update',
        linkId: complianceData.orderId,
        linkType: 'accessories_order',
      });
    } else if (deptUpper.includes('PACKING') && (complianceData.status === 'Completed' || compQty >= reqQty)) {
      await createNotification({
        recipientDepartment: '02-B Planning Accessories',
        recipientRole: 'PLANNING',
        title: `Packing Done: Order ${complianceData.orderNumber}`,
        message: `Packing completed for item "${complianceData.itemName}" in Accessories Order ${complianceData.orderNumber}.`,
        type: 'compliance_update',
        linkId: complianceData.orderId,
        linkType: 'accessories_order',
      });
    }

    // Refresh overall department & order status
    await refreshAccessoriesOrderStatus(complianceData.orderId);

    await logAudit(
      'UPDATE_ACCESSORIES_COMPLIANCE',
      'ACCESSORIES_ORDERS',
      complianceData.orderId,
      '',
      `${complianceData.department} - Item: ${complianceData.itemName} (${compQty}/${reqQty}) -> ${complianceData.status}`,
      userEmail
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'accessoriesCompliances');
    throw err;
  }
}

export async function refreshAccessoriesOrderStatus(orderId: string) {
  try {
    const orderDoc = await getDoc(doc(db, 'accessoriesOrders', orderId));
    if (!orderDoc.exists()) return;
    const order = orderDoc.data() as AccessoriesOrder;

    // Get all items
    const itemsSnap = await getDocs(query(collection(db, 'accessoriesItems'), where('orderId', '==', orderId)));
    const items = itemsSnap.docs.map((d) => ({ id: d.id, ...d.data() } as AccessoriesItem));

    // Get all compliances
    const compSnap = await getDocs(query(collection(db, 'accessoriesCompliances'), where('orderId', '==', orderId)));
    const compliances = compSnap.docs.map((d) => ({ id: d.id, ...d.data() } as AccessoriesCompliance));

    // Compute department-wise status
    const deptStatuses: Record<string, ComplianceStatus> = { ...(order.departmentStatuses || {}) };
    ACCESSORIES_TARGET_DEPARTMENTS.forEach((dept) => {
      const deptComps = compliances.filter((c) => c.department === dept);
      if (deptComps.length === 0) {
        deptStatuses[dept] = 'Pending';
      } else {
        const allCompleted = items.length > 0 && items.every((it) => {
          const c = deptComps.find((x) => x.itemId === it.id);
          return c && (c.status === 'Completed' || c.status === 'Not Applicable');
        });
        const anyDelayed = deptComps.some((c) => c.status === 'Delayed');
        const anyInProgress = deptComps.some((c) => c.status === 'In Progress' || c.status === 'Partially Completed');

        if (allCompleted) {
          deptStatuses[dept] = 'Completed';
        } else if (anyDelayed) {
          deptStatuses[dept] = 'Delayed';
        } else if (anyInProgress || deptComps.length > 0) {
          deptStatuses[dept] = 'In Progress';
        } else {
          deptStatuses[dept] = 'Pending';
        }
      }
    });

    // Overall order status logic:
    // Do not automatically mark an order Completed until all required items/processes across departments are completed.
    const allDeptCompleted = ACCESSORIES_TARGET_DEPARTMENTS.every((d) => deptStatuses[d] === 'Completed' || deptStatuses[d] === 'Not Applicable');
    const anyDeptDelayed = ACCESSORIES_TARGET_DEPARTMENTS.some((d) => deptStatuses[d] === 'Delayed');
    const anyDeptInProgress = ACCESSORIES_TARGET_DEPARTMENTS.some((d) => deptStatuses[d] === 'In Progress' || deptStatuses[d] === 'Partially Completed');
    const anyDeptCompleted = ACCESSORIES_TARGET_DEPARTMENTS.some((d) => deptStatuses[d] === 'Completed');

    let overallStatus: OrderStatus = order.status;
    if (order.status !== 'Draft' && order.status !== 'Cancelled') {
      if (allDeptCompleted && items.length > 0) {
        overallStatus = 'Completed';
      } else if (anyDeptDelayed) {
        overallStatus = 'Delayed';
      } else if (anyDeptCompleted || anyDeptInProgress) {
        overallStatus = 'Partially Completed';
      } else {
        overallStatus = 'In Progress';
      }
    }

    const updates = {
      departmentStatuses: deptStatuses,
      status: overallStatus,
      totalItemsCount: items.length,
      updatedAt: new Date().toISOString(),
    };

    await updateDoc(doc(db, 'accessoriesOrders', orderId), updates);
    try {
      await updateDoc(doc(db, 'accessories_orders', orderId), updates);
    } catch {
      // ignore
    }
  } catch (err) {
    console.error('Failed to refresh accessories order status:', err);
  }
}

// =========================================================================
// OPEN CABLE ORDERS SERVICE
// =========================================================================

export const OPEN_CABLE_TARGET_DEPARTMENTS = [
  '03 Purchase',
  '05 Store',
  '11-A Electronics-Cable Set',
  '14 Calibration',
  '15 Packing',
];

export function subscribeOpenCableOrders(callback: (orders: OpenCableOrder[]) => void) {
  return onSnapshot(
    collection(db, 'openCableOrders'),
    (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as OpenCableOrder));
      list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      callback(list);
    },
    (err) => handleFirestoreError(err, OperationType.LIST, 'openCableOrders')
  );
}

export function subscribeOpenCableItems(
  orderIdOrCallback?: string | ((items: OpenCableItem[]) => void),
  maybeCallback?: (items: OpenCableItem[]) => void
) {
  const orderId = typeof orderIdOrCallback === 'string' ? orderIdOrCallback : undefined;
  const callback = typeof orderIdOrCallback === 'function' ? orderIdOrCallback : maybeCallback;
  const colRef = collection(db, 'openCableItems');
  const q = orderId ? query(colRef, where('orderId', '==', orderId)) : colRef;
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as OpenCableItem));
      list.sort((a, b) => Number(a.srNo) - Number(b.srNo));
      if (callback) callback(list);
    },
    (err) => handleFirestoreError(err, OperationType.LIST, 'openCableItems')
  );
}

export function subscribeOpenCableCompliances(
  orderIdOrCallback?: string | ((compliances: OpenCableCompliance[]) => void),
  maybeCallback?: (compliances: OpenCableCompliance[]) => void
) {
  const orderId = typeof orderIdOrCallback === 'string' ? orderIdOrCallback : undefined;
  const callback = typeof orderIdOrCallback === 'function' ? orderIdOrCallback : maybeCallback;
  const colRef = collection(db, 'openCableCompliances');
  const q = orderId ? query(colRef, where('orderId', '==', orderId)) : colRef;
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as OpenCableCompliance));
      if (callback) callback(list);
    },
    (err) => handleFirestoreError(err, OperationType.LIST, 'openCableCompliances')
  );
}

export function subscribeOpenCableOrderHistory(
  orderIdOrCallback?: string | ((history: OpenCableOrderHistory[]) => void),
  maybeCallback?: (history: OpenCableOrderHistory[]) => void
) {
  const orderId = typeof orderIdOrCallback === 'string' ? orderIdOrCallback : undefined;
  const callback = typeof orderIdOrCallback === 'function' ? orderIdOrCallback : maybeCallback;
  const colRef = collection(db, 'openCableOrderHistory');
  const q = orderId ? query(colRef, where('orderId', '==', orderId)) : colRef;
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as OpenCableOrderHistory));
      list.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      if (callback) callback(list);
    },
    (err) => handleFirestoreError(err, OperationType.LIST, 'openCableOrderHistory')
  );
}

export async function createOpenCableOrder(
  orderData: Omit<OpenCableOrder, 'id' | 'createdAt' | 'updatedAt' | 'totalItemsCount' | 'completedItemsCount'>,
  items: Array<Omit<OpenCableItem, 'id' | 'orderId' | 'orderNumber' | 'createdAt' | 'updatedAt'>>,
  userEmail?: string,
  userName?: string
) {
  try {
    const now = new Date().toISOString();
    const today = now.split('T')[0];
    const time = new Date().toLocaleTimeString('en-US', { hour12: false });

    const initialDeptStatuses: Record<string, ComplianceStatus> = {};
    if (orderData.status === 'Released') {
      OPEN_CABLE_TARGET_DEPARTMENTS.forEach((dept) => {
        initialDeptStatuses[dept] = 'Pending';
      });
    }

    const orderDocRef = await addDoc(collection(db, 'openCableOrders'), {
      ...orderData,
      orderType: 'OPEN_CABLE',
      revision: orderData.revision ?? 0,
      totalItemsCount: items.length,
      completedItemsCount: 0,
      departmentStatuses: orderData.departmentStatuses || initialDeptStatuses,
      releasedAt: orderData.status === 'Released' ? now : null,
      releasedBy: orderData.status === 'Released' ? (userName || userEmail || 'Planning') : null,
      createdAt: now,
      updatedAt: now,
    });

    const orderId = orderDocRef.id;

    // Dual-write to open_cable_orders
    try {
      await setDoc(doc(db, 'open_cable_orders', orderId), {
        id: orderId,
        ...orderData,
        orderType: 'OPEN_CABLE',
        revision: orderData.revision ?? 0,
        totalItemsCount: items.length,
        completedItemsCount: 0,
        departmentStatuses: orderData.departmentStatuses || initialDeptStatuses,
        releasedAt: orderData.status === 'Released' ? now : null,
        releasedBy: orderData.status === 'Released' ? (userName || userEmail || 'Planning') : null,
        createdAt: now,
        updatedAt: now,
      });
    } catch {
      // ignore
    }

    // Add cable items
    for (const item of items) {
      const itemRef = await addDoc(collection(db, 'openCableItems'), {
        ...item,
        orderId,
        orderNumber: orderData.orderNumber,
        createdAt: now,
        updatedAt: now,
      });
      try {
        await setDoc(doc(db, 'open_cable_items', itemRef.id), {
          id: itemRef.id,
          ...item,
          orderId,
          orderNumber: orderData.orderNumber,
          createdAt: now,
          updatedAt: now,
        });
      } catch {
        // ignore
      }
    }

    // Add order history
    await addDoc(collection(db, 'openCableOrderHistory'), {
      orderId,
      orderNumber: orderData.orderNumber,
      date: today,
      time,
      user: userName || userEmail || 'Planning',
      department: 'Planning Open Cable',
      action: orderData.status === 'Released' ? 'ORDER_RELEASED' : 'ORDER_CREATED_DRAFT',
      oldStatus: '',
      newStatus: orderData.status,
      remarks: orderData.status === 'Released'
        ? `Open Cable Order ${orderData.orderNumber} created and released for CMM ${orderData.cmmNumber} with ${items.length} cable items`
        : `Open Cable Order ${orderData.orderNumber} saved as draft for CMM ${orderData.cmmNumber}`,
      timestamp: now,
    });

    // If released, notify Purchase, Store, Electronics, Calibration, Packing
    if (orderData.status === 'Released') {
      for (const dept of OPEN_CABLE_TARGET_DEPARTMENTS) {
        await createNotification({
          recipientDepartment: dept,
          recipientRole: 'DEPARTMENT USER',
          title: `Open Cable Order Released: ${orderData.orderNumber}`,
          message: `Planning released Open Cable Order ${orderData.orderNumber} for CMM ${orderData.cmmNumber} (${orderData.cmmModel}). Required Date: ${orderData.requiredDate}. Priority: ${orderData.priority}.`,
          type: 'open_cable_order',
          linkId: orderId,
          linkType: 'open_cable_order',
        });
      }
    }

    await logAudit(
      orderData.status === 'Released' ? 'RELEASE_OPEN_CABLE_ORDER' : 'CREATE_OPEN_CABLE_ORDER_DRAFT',
      'OPEN_CABLE_ORDERS',
      orderId,
      '',
      `Order ${orderData.orderNumber} (CMM ${orderData.cmmNumber}) - ${items.length} cables`,
      userEmail
    );

    return orderId;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, 'openCableOrders');
    throw err;
  }
}

export async function releaseOpenCableOrder(
  orderId: string,
  userEmail?: string,
  userName?: string
) {
  try {
    const now = new Date().toISOString();
    const today = now.split('T')[0];
    const time = new Date().toLocaleTimeString('en-US', { hour12: false });

    const orderDoc = await getDoc(doc(db, 'openCableOrders', orderId));
    if (!orderDoc.exists()) throw new Error('Order not found');
    const order = orderDoc.data() as OpenCableOrder;

    const initialDeptStatuses: Record<string, ComplianceStatus> = {};
    OPEN_CABLE_TARGET_DEPARTMENTS.forEach((dept) => {
      initialDeptStatuses[dept] = order.departmentStatuses?.[dept] || 'Pending';
    });

    const updates = {
      status: 'Released' as const,
      releasedAt: now,
      releasedBy: userName || userEmail || 'Planning',
      updatedAt: now,
      updatedBy: userEmail || 'Planning',
      departmentStatuses: initialDeptStatuses,
    };

    await updateDoc(doc(db, 'openCableOrders', orderId), updates);
    try {
      await updateDoc(doc(db, 'open_cable_orders', orderId), updates);
    } catch {
      // ignore
    }

    // Add history
    await addDoc(collection(db, 'openCableOrderHistory'), {
      orderId,
      orderNumber: order.orderNumber,
      date: today,
      time,
      user: userName || userEmail || 'Planning',
      department: 'Planning Open Cable',
      action: 'ORDER_RELEASED',
      oldStatus: order.status,
      newStatus: 'Released',
      remarks: `Order ${order.orderNumber} released to departments (Purchase, Store, Electronics, Calibration, Packing)`,
      timestamp: now,
    });

    // Notify departments
    for (const dept of OPEN_CABLE_TARGET_DEPARTMENTS) {
      await createNotification({
        recipientDepartment: dept,
        recipientRole: 'DEPARTMENT USER',
        title: `Open Cable Order Released: ${order.orderNumber}`,
        message: `Planning released Open Cable Order ${order.orderNumber} for CMM ${order.cmmNumber} (${order.cmmModel}). Required Date: ${order.requiredDate}.`,
        type: 'open_cable_order',
        linkId: orderId,
        linkType: 'open_cable_order',
      });
    }

    await logAudit('RELEASE_OPEN_CABLE_ORDER', 'OPEN_CABLE_ORDERS', orderId, order.status, 'Released', userEmail);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `openCableOrders/${orderId}`);
    throw err;
  }
}

export async function updateOpenCableOrder(
  orderId: string,
  updates: Partial<OpenCableOrder>,
  userEmail?: string,
  userName?: string,
  revisionRemarks?: string
) {
  try {
    const now = new Date().toISOString();
    const today = now.split('T')[0];
    const time = new Date().toLocaleTimeString('en-US', { hour12: false });

    const orderDoc = await getDoc(doc(db, 'openCableOrders', orderId));
    if (!orderDoc.exists()) throw new Error('Order not found');
    const prev = orderDoc.data() as OpenCableOrder;

    const newRevision = updates.revision !== undefined ? updates.revision : (prev.status === 'Released' ? (prev.revision || 0) + 1 : prev.revision || 0);

    const updatePayload = {
      ...updates,
      revision: newRevision,
      updatedAt: now,
      updatedBy: userEmail || 'Planning',
    };

    await updateDoc(doc(db, 'openCableOrders', orderId), updatePayload);
    try {
      await updateDoc(doc(db, 'open_cable_orders', orderId), updatePayload);
    } catch {
      // ignore
    }

    // Add history
    await addDoc(collection(db, 'openCableOrderHistory'), {
      orderId,
      orderNumber: prev.orderNumber,
      date: today,
      time,
      user: userName || userEmail || 'Planning',
      department: 'Planning Open Cable',
      action: prev.status === 'Released' ? `ORDER_REVISED_R${newRevision}` : 'ORDER_UPDATED',
      oldStatus: prev.status,
      newStatus: updates.status || prev.status,
      remarks: revisionRemarks || `Order revised to Rev ${newRevision}`,
      timestamp: now,
    });

    await logAudit('UPDATE_OPEN_CABLE_ORDER', 'OPEN_CABLE_ORDERS', orderId, JSON.stringify(prev), JSON.stringify(updatePayload), userEmail);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `openCableOrders/${orderId}`);
    throw err;
  }
}

export async function deleteOpenCableOrder(orderId: string, userEmail?: string) {
  try {
    await deleteDoc(doc(db, 'openCableOrders', orderId));
    try {
      await deleteDoc(doc(db, 'open_cable_orders', orderId));
    } catch {
      // ignore
    }
    await logAudit('DELETE_OPEN_CABLE_ORDER', 'OPEN_CABLE_ORDERS', orderId, '', 'DELETED', userEmail);
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `openCableOrders/${orderId}`);
    throw err;
  }
}

export async function saveOpenCableCompliance(
  complianceData: Omit<OpenCableCompliance, 'id' | 'pendingQuantity' | 'updatedAt'>,
  userEmail?: string,
  userName?: string,
  userDept?: string
) {
  try {
    const now = new Date().toISOString();
    const today = now.split('T')[0];
    const time = new Date().toLocaleTimeString('en-US', { hour12: false });

    const reqQty = Number(complianceData.requiredQuantity) || 0;
    const compQty = Number(complianceData.completedQuantity) || 0;
    const pendingQty = Math.max(0, reqQty - compQty);

    const sanitizedDept = complianceData.department.replace(/[^a-zA-Z0-9_-]/g, '_');
    const docId = `comp_${complianceData.orderId}_${complianceData.itemId}_${sanitizedDept}`;

    const recordPayload: OpenCableCompliance = {
      id: docId,
      ...complianceData,
      requiredQuantity: reqQty,
      completedQuantity: compQty,
      pendingQuantity: pendingQty,
      updatedAt: now,
      updatedBy: userEmail || userName || 'User',
    };

    await setDoc(doc(db, 'openCableCompliances', docId), recordPayload);
    try {
      await setDoc(doc(db, 'open_cable_compliances', docId), recordPayload);
    } catch {
      // ignore
    }

    // Add History
    await addDoc(collection(db, 'openCableOrderHistory'), {
      orderId: complianceData.orderId,
      orderNumber: complianceData.orderNumber || '',
      date: today,
      time,
      user: userName || userEmail || 'Operator',
      department: complianceData.department,
      action: 'COMPLIANCE_UPDATED',
      item: complianceData.itemName || complianceData.itemId,
      newStatus: complianceData.status,
      remarks: `${complianceData.department} updated compliance for cable "${complianceData.itemName || 'Cable'}": Completed ${compQty}/${reqQty}. Status: ${complianceData.status}. ${complianceData.remarks || ''}`,
      attachment: complianceData.attachment,
      timestamp: now,
    });

    // Check next department notification workflow for Open Cable
    // Purchase -> Store -> Electronics -> Calibration -> Packing
    const deptUpper = complianceData.department.toUpperCase();
    if (deptUpper.includes('PURCHASE') && (complianceData.status === 'Completed' || compQty >= reqQty)) {
      await createNotification({
        recipientDepartment: '05 Store',
        recipientRole: 'DEPARTMENT USER',
        title: `Purchase Completed for Cable Order ${complianceData.orderNumber}`,
        message: `Purchase completed for cable "${complianceData.itemName}" in Open Cable Order ${complianceData.orderNumber}. Ready for store material receipt.`,
        type: 'compliance_update',
        linkId: complianceData.orderId,
        linkType: 'open_cable_order',
      });
    } else if (deptUpper.includes('STORE') && (complianceData.status === 'Completed' || compQty >= reqQty)) {
      await createNotification({
        recipientDepartment: '11-A Electronics-Cable Set',
        recipientRole: 'DEPARTMENT USER',
        title: `Store Received Cable: Order ${complianceData.orderNumber}`,
        message: `Store received cable "${complianceData.itemName}" in Open Cable Order ${complianceData.orderNumber}. Ready for cable preparation and harness testing.`,
        type: 'compliance_update',
        linkId: complianceData.orderId,
        linkType: 'open_cable_order',
      });
    } else if (deptUpper.includes('ELECTRONICS') && (complianceData.status === 'Completed' || compQty >= reqQty)) {
      await createNotification({
        recipientDepartment: '14 Calibration',
        recipientRole: 'CALIBRATION',
        title: `Cable Prepared/Tested: Order ${complianceData.orderNumber}`,
        message: `Electronics prepared cable "${complianceData.itemName}" in Open Cable Order ${complianceData.orderNumber}. Ready for verification.`,
        type: 'compliance_update',
        linkId: complianceData.orderId,
        linkType: 'open_cable_order',
      });
    } else if (deptUpper.includes('CALIBRATION') && (complianceData.status === 'Completed' || compQty >= reqQty)) {
      await createNotification({
        recipientDepartment: '15 Packing',
        recipientRole: 'PACKING',
        title: `Calibration Done: Cable Order ${complianceData.orderNumber}`,
        message: `Calibration completed for cable "${complianceData.itemName}" in Open Cable Order ${complianceData.orderNumber}. Ready for packing.`,
        type: 'compliance_update',
        linkId: complianceData.orderId,
        linkType: 'open_cable_order',
      });
    } else if (deptUpper.includes('PACKING') && (complianceData.status === 'Completed' || compQty >= reqQty)) {
      await createNotification({
        recipientDepartment: '02 Planning',
        recipientRole: 'PLANNING',
        title: `Packing Done: Cable Order ${complianceData.orderNumber}`,
        message: `Packing completed for cable "${complianceData.itemName}" in Open Cable Order ${complianceData.orderNumber}.`,
        type: 'compliance_update',
        linkId: complianceData.orderId,
        linkType: 'open_cable_order',
      });
    }

    // Refresh overall department & order status
    await refreshOpenCableOrderStatus(complianceData.orderId);

    await logAudit(
      'UPDATE_OPEN_CABLE_COMPLIANCE',
      'OPEN_CABLE_ORDERS',
      complianceData.orderId,
      '',
      `${complianceData.department} - Cable: ${complianceData.itemName} (${compQty}/${reqQty}) -> ${complianceData.status}`,
      userEmail
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'openCableCompliances');
    throw err;
  }
}

export async function refreshOpenCableOrderStatus(orderId: string) {
  try {
    const orderDoc = await getDoc(doc(db, 'openCableOrders', orderId));
    if (!orderDoc.exists()) return;
    const order = orderDoc.data() as OpenCableOrder;

    // Get all cable items
    const itemsSnap = await getDocs(query(collection(db, 'openCableItems'), where('orderId', '==', orderId)));
    const items = itemsSnap.docs.map((d) => ({ id: d.id, ...d.data() } as OpenCableItem));

    // Get all compliances
    const compSnap = await getDocs(query(collection(db, 'openCableCompliances'), where('orderId', '==', orderId)));
    const compliances = compSnap.docs.map((d) => ({ id: d.id, ...d.data() } as OpenCableCompliance));

    // Compute department-wise status
    const deptStatuses: Record<string, ComplianceStatus> = { ...(order.departmentStatuses || {}) };
    OPEN_CABLE_TARGET_DEPARTMENTS.forEach((dept) => {
      const deptComps = compliances.filter((c) => c.department === dept);
      if (deptComps.length === 0) {
        deptStatuses[dept] = 'Pending';
      } else {
        const allCompleted = items.length > 0 && items.every((it) => {
          const c = deptComps.find((x) => x.itemId === it.id);
          return c && (c.status === 'Completed' || c.status === 'Not Applicable');
        });
        const anyDelayed = deptComps.some((c) => c.status === 'Delayed');
        const anyInProgress = deptComps.some((c) => c.status === 'In Progress' || c.status === 'Partially Completed');

        if (allCompleted) {
          deptStatuses[dept] = 'Completed';
        } else if (anyDelayed) {
          deptStatuses[dept] = 'Delayed';
        } else if (anyInProgress || deptComps.length > 0) {
          deptStatuses[dept] = 'In Progress';
        } else {
          deptStatuses[dept] = 'Pending';
        }
      }
    });

    const allDeptCompleted = OPEN_CABLE_TARGET_DEPARTMENTS.every((d) => deptStatuses[d] === 'Completed' || deptStatuses[d] === 'Not Applicable');
    const anyDeptDelayed = OPEN_CABLE_TARGET_DEPARTMENTS.some((d) => deptStatuses[d] === 'Delayed');
    const anyDeptInProgress = OPEN_CABLE_TARGET_DEPARTMENTS.some((d) => deptStatuses[d] === 'In Progress' || deptStatuses[d] === 'Partially Completed');
    const anyDeptCompleted = OPEN_CABLE_TARGET_DEPARTMENTS.some((d) => deptStatuses[d] === 'Completed');

    let overallStatus: OrderStatus = order.status;
    if (order.status !== 'Draft' && order.status !== 'Cancelled') {
      if (allDeptCompleted && items.length > 0) {
        overallStatus = 'Completed';
      } else if (anyDeptDelayed) {
        overallStatus = 'Delayed';
      } else if (anyDeptCompleted || anyDeptInProgress) {
        overallStatus = 'Partially Completed';
      } else {
        overallStatus = 'In Progress';
      }
    }

    const updates = {
      departmentStatuses: deptStatuses,
      status: overallStatus,
      totalItemsCount: items.length,
      updatedAt: new Date().toISOString(),
    };

    await updateDoc(doc(db, 'openCableOrders', orderId), updates);
    try {
      await updateDoc(doc(db, 'open_cable_orders', orderId), updates);
    } catch {
      // ignore
    }
  } catch (err) {
    console.error('Failed to refresh open cable order status:', err);
  }
}

// ============================================================================
// MACHINE-LEVEL QUALITY INSPECTION (ACCEPT, REJECT, HOLD)
// ============================================================================

export interface MachineQualityInspectionParams {
  machineNumber: string;
  action: 'Accept' | 'Reject' | 'Hold' | 'Rework';
  inspector: string;
  defectCategory?: string;
  defectDescription?: string;
  reason?: string;
  observedFinding?: string;
  specification?: string;
  concernedDepartment?: string;
  correctiveActionRequired?: string;
  expectedReviewDate?: string;
  remarks?: string;
  userEmail?: string;
}

/**
 * Executes a definitive Quality Inspection decision on a Machine (Accept, Reject, Rework/Hold).
 * Accessible exclusively to Quality department and Admin roles.
 * Synchronizes Machine Master, Inspection Records, Rejections, Reworks/Holds, Notifications, and Audit Trail.
 */
export async function performMachineQualityInspection(
  params: MachineQualityInspectionParams
): Promise<{ success: boolean; message: string }> {
  // 0. Verify Quality / Admin Authorization
  const authCheck = await verifyQualityDecisionAuthorization(undefined, params.userEmail);
  if (!authCheck.authorized) {
    throw new Error(`UNAUTHORIZED_QUALITY_ACTION: ${authCheck.reason}`);
  }

  // Validate required defectCategory for Reject and Rework/Hold
  if ((params.action === 'Reject' || params.action === 'Hold' || params.action === 'Rework') && (!params.defectCategory || !params.defectCategory.trim())) {
    throw new Error('VALIDATION_ERROR: Defect Category is mandatory.');
  }

  const now = new Date().toISOString();
  const today = now.split('T')[0];

  // 1. Fetch matching machine document(s)
  const mQuery = query(
    collection(db, 'machines'),
    where('machineNumber', '==', params.machineNumber)
  );
  const mDocs = await getDocs(mQuery);
  if (mDocs.empty) {
    throw new Error(`Machine ${params.machineNumber} not found.`);
  }

  const primaryDoc = mDocs.docs[0];
  const mData = primaryDoc.data() as Machine;

  if (params.action === 'Accept') {
    for (const mDoc of mDocs.docs) {
      const data = mDoc.data() as Machine;
      const existingHistory = data.history || [];
      const histEntry: MachineHistoryEntry = {
        id: `hist_qc_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        date: today,
        department: '04 Inward Quality',
        task: 'Quality Inspection: Passed / Accepted',
        employee: params.inspector,
        startDate: today,
        status: 'Passed',
        remarks: params.remarks
          ? `Quality Accepted: ${params.remarks}`
          : 'Quality Inspection Passed & Accepted. Ready for department handover.',
      };

      const machineUpdate: any = {
        qualityStatus: 'Accepted',
        updatedAt: now,
        history: [histEntry, ...existingHistory],
      };

      // If status was on rework, hold, or rejected, restore
      if (
        data.status === 'Quality Hold' ||
        data.status === 'QUALITY_HOLD' ||
        (data.status as string) === 'REWORK_REQUIRED' ||
        data.status === 'QUALITY_REJECTED' ||
        data.currentStatus === 'Quality Hold' ||
        (data.currentStatus as string) === 'REWORK_REQUIRED'
      ) {
        machineUpdate.status = (data.progress || 0) >= 100 ? 'READY_FOR_HANDOVER' : 'On Track';
        machineUpdate.currentStatus = (data.progress || 0) >= 100 ? 'Ready for Handover' : 'In Progress';
        machineUpdate.delayReason = '';
      }

      await updateDoc(mDoc.ref, machineUpdate);
    }

    // Save record to qualityInspections & quality_inspections
    const inspRecord = {
      machineNumber: params.machineNumber,
      machineModel: mData.model || mData.machineModel || '',
      inspector: params.inspector,
      inspectionDate: today,
      result: 'ACCEPT',
      remarks: params.remarks || 'Machine Quality Inspection Passed',
      createdAt: now,
      createdBy: params.inspector || params.userEmail,
    };
    await addDoc(collection(db, 'qualityInspections'), inspRecord);
    try {
      await addDoc(collection(db, 'quality_inspections'), inspRecord);
    } catch {}

    // Send notification to current department
    await createNotification({
      recipientDepartment: mData.currentDepartment,
      toDepartment: mData.currentDepartment,
      fromDepartment: '04 Inward Quality',
      title: `Quality Accepted: Machine ${params.machineNumber}`,
      message: `Quality inspection completed for Machine ${params.machineNumber}. Result: ACCEPTED. Ready for department handover.`,
      type: 'QUALITY_ACCEPTED',
      machineNumber: params.machineNumber,
      machineModel: mData.model || mData.machineModel,
      priority: 'Medium',
      status: 'UNREAD',
    });

    // Synchronize open quality handovers for this machine
    try {
      const qhQuery = query(
        collection(db, 'qualityHandovers'),
        where('machineNumber', '==', params.machineNumber)
      );
      const qhDocs = await getDocs(qhQuery);
      for (const qhDoc of qhDocs.docs) {
        const qhData = qhDoc.data();
        if (qhData.status !== 'ACCEPTED') {
          await updateDoc(qhDoc.ref, {
            status: 'ACCEPTED',
            qualityStatus: 'ACCEPTED',
            lastInspectionResult: 'ACCEPT',
            lastInspectionDate: today,
            lastInspector: params.inspector,
            updatedAt: now,
          });
        }
      }
    } catch {}

    await logAudit(
      'MACHINE_QUALITY_ACCEPTED',
      'QUALITY',
      params.machineNumber,
      'Machine Quality Inspection Passed',
      `Machine ${params.machineNumber} Accepted by ${params.inspector}. Remarks: ${params.remarks || 'None'}`,
      params.userEmail
    );

    return {
      success: true,
      message: `Machine ${params.machineNumber} successfully ACCEPTED for Quality Inspection. Ready for department handover.`,
    };
  } else if (params.action === 'Reject') {
    const reason = params.reason || params.defectDescription || params.defectCategory || 'Dimension Out of Tolerance';
    const defectCat = params.defectCategory?.trim() || 'Dimensional';

    for (const mDoc of mDocs.docs) {
      const data = mDoc.data() as Machine;
      const existingHistory = data.history || [];
      const histEntry: MachineHistoryEntry = {
        id: `hist_qc_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        date: today,
        department: '04 Inward Quality',
        task: `Quality Rejection [${defectCat}]: ${reason}`,
        employee: params.inspector,
        startDate: today,
        status: 'Rejected',
        remarks: `Quality Rejected. Category: ${defectCat}. Reason: ${reason}. Finding: ${params.observedFinding || 'N/A'}. ${params.remarks ? 'Remarks: ' + params.remarks : ''}`,
      };

      await updateDoc(mDoc.ref, {
        qualityStatus: 'Rejected',
        status: 'QUALITY_REJECTED',
        currentStatus: 'QUALITY_REJECTED' as any,
        defectCategory: defectCat,
        defectDescription: reason,
        delayReason: `[${defectCat}] ${reason}`,
        delayRemarks: params.remarks || params.observedFinding || '',
        history: [histEntry, ...existingHistory],
        updatedAt: now,
      });
    }

    // Save Rejection record to quality_rejections & qualityRejections
    const rejRecord = {
      machineId: primaryDoc.id,
      machineNumber: params.machineNumber,
      machineModel: mData.model || mData.machineModel || '',
      operationId: 'QC_OVERALL',
      operationName: `Overall Quality Inspection (${mData.currentDepartment})`,
      defectCategory: defectCat,
      defectDescription: reason,
      rejectionReason: reason,
      specification: params.specification || '',
      actualFinding: params.observedFinding || '',
      concernedDepartment: params.concernedDepartment || mData.currentDepartment,
      correctiveActionRequired: params.correctiveActionRequired || '',
      remarks: params.remarks || '',
      status: 'Rejected',
      createdAt: now,
      updatedAt: now,
      createdBy: params.inspector || params.userEmail,
    };
    await addDoc(collection(db, 'quality_rejections'), rejRecord);
    try {
      await addDoc(collection(db, 'qualityRejections'), rejRecord);
    } catch {}

    // Send high priority notification
    await createNotification({
      recipientDepartment: params.concernedDepartment || mData.currentDepartment,
      toDepartment: params.concernedDepartment || mData.currentDepartment,
      fromDepartment: '04 Inward Quality',
      title: `CRITICAL: Quality Rejection - Machine ${params.machineNumber}`,
      message: `Quality inspection REJECTED Machine ${params.machineNumber}. Defect Category: ${defectCat}. Reason: ${reason}. Observed Finding: ${params.observedFinding || 'Out of spec'}. Corrective action required.`,
      type: 'QUALITY_REJECTED',
      machineNumber: params.machineNumber,
      machineModel: mData.model || mData.machineModel,
      priority: 'High',
      status: 'UNREAD',
    });

    // Synchronize open quality handovers for this machine
    try {
      const qhQuery = query(
        collection(db, 'qualityHandovers'),
        where('machineNumber', '==', params.machineNumber)
      );
      const qhDocs = await getDocs(qhQuery);
      for (const qhDoc of qhDocs.docs) {
        await updateDoc(qhDoc.ref, {
          status: 'REJECTED',
          qualityStatus: 'REJECTED',
          lastInspectionResult: 'REJECT',
          lastInspectionDate: today,
          lastInspector: params.inspector,
          defectCategory: defectCat,
          defectDescription: reason,
          rejectionReason: reason,
          actualFinding: params.observedFinding || '',
          updatedAt: now,
        });
      }
    } catch {}

    await logAudit(
      'MACHINE_QUALITY_REJECTED',
      'QUALITY',
      params.machineNumber,
      'Machine Quality Inspection Rejected',
      `Machine ${params.machineNumber} Rejected by ${params.inspector}. Category: ${defectCat}. Reason: ${reason}. Finding: ${params.observedFinding || 'N/A'}`,
      params.userEmail
    );

    return {
      success: true,
      message: `Machine ${params.machineNumber} REJECTED by Quality. Alert sent to ${params.concernedDepartment || mData.currentDepartment} for corrective action.`,
    };
  } else {
    // Rework / Hold
    const reason = params.reason || params.defectDescription || params.defectCategory || 'Rework Required';
    const defectCat = params.defectCategory?.trim() || 'Dimensional';

    for (const mDoc of mDocs.docs) {
      const data = mDoc.data() as Machine;
      const existingHistory = data.history || [];
      const histEntry: MachineHistoryEntry = {
        id: `hist_qc_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        date: today,
        department: '04 Inward Quality',
        task: `Quality Rework Required [${defectCat}]: ${reason}`,
        employee: params.inspector,
        startDate: today,
        status: 'Rework Required',
        remarks: `Quality Decision: REWORK REQUIRED. Category: ${defectCat}. Reason: ${reason}. Expected review: ${params.expectedReviewDate || 'TBD'}. ${params.remarks ? 'Remarks: ' + params.remarks : ''}`,
      };

      await updateDoc(mDoc.ref, {
        qualityStatus: 'REWORK_REQUIRED',
        status: 'REWORK_REQUIRED',
        currentStatus: 'Rework Required' as any,
        defectCategory: defectCat,
        defectDescription: reason,
        delayReason: `[${defectCat}] ${reason}`,
        delayRemarks: params.remarks || '',
        history: [histEntry, ...existingHistory],
        updatedAt: now,
      });
    }

    // Save to quality_reworks & qualityReworks
    const reworkRecord = {
      machineNumber: params.machineNumber,
      machineModel: mData.model || mData.machineModel || '',
      department: params.concernedDepartment || mData.currentDepartment,
      defectCategory: defectCat,
      defectDescription: reason,
      reason,
      inspector: params.inspector,
      reworkDate: today,
      expectedReviewDate: params.expectedReviewDate || '',
      status: 'ACTIVE',
      remarks: params.remarks || '',
      createdAt: now,
      createdBy: params.inspector || params.userEmail,
    };
    await addDoc(collection(db, 'quality_reworks'), reworkRecord);
    try {
      await addDoc(collection(db, 'qualityReworks'), reworkRecord);
      await addDoc(collection(db, 'qualityHolds'), { ...reworkRecord, status: 'HOLD', legacyHold: true });
    } catch {}

    // Send notification
    await createNotification({
      recipientDepartment: params.concernedDepartment || mData.currentDepartment,
      toDepartment: params.concernedDepartment || mData.currentDepartment,
      fromDepartment: '04 Inward Quality',
      title: `Quality Rework Required: Machine ${params.machineNumber}`,
      message: `Quality placed Machine ${params.machineNumber} on REWORK REQUIRED. Defect Category: ${defectCat}. Reason: ${reason}. Expected review: ${params.expectedReviewDate || 'TBD'}.`,
      type: 'QUALITY_REWORK',
      machineNumber: params.machineNumber,
      machineModel: mData.model || mData.machineModel,
      priority: 'High',
      status: 'UNREAD',
    });

    // Synchronize open quality handovers for this machine
    try {
      const qhQuery = query(
        collection(db, 'qualityHandovers'),
        where('machineNumber', '==', params.machineNumber)
      );
      const qhDocs = await getDocs(qhQuery);
      for (const qhDoc of qhDocs.docs) {
        await updateDoc(qhDoc.ref, {
          status: 'REWORK_REQUIRED',
          qualityStatus: 'REWORK_REQUIRED',
          lastInspectionResult: 'REWORK',
          lastInspectionDate: today,
          lastInspector: params.inspector,
          defectCategory: defectCat,
          defectDescription: reason,
          reworkReason: reason,
          holdReason: reason,
          updatedAt: now,
        });
      }
    } catch {}

    await logAudit(
      'MACHINE_QUALITY_REWORK_REQUIRED',
      'QUALITY',
      params.machineNumber,
      'Machine Flagged for Quality Rework',
      `Machine ${params.machineNumber} marked for Rework by ${params.inspector}. Category: ${defectCat}. Reason: ${reason}`,
      params.userEmail
    );

    return {
      success: true,
      message: `Machine ${params.machineNumber} placed on REWORK REQUIRED. Defect Category: ${defectCat}. Reason: ${reason}.`,
    };
  }
}


