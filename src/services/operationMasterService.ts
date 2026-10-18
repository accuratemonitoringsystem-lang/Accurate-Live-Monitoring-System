import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  onSnapshot,
} from 'firebase/firestore';
import { db } from '../firebase';
import {
  DepartmentMachineSize,
  DepartmentPart,
  DepartmentOperation,
  MachineOperationExecution,
  DailyOperationUpdate,
  DailyOperationResult,
  OperationExecutionStatus,
  Machine,
} from '../types';
import { logAudit } from './db';
import { normalizeDepartmentKey, isDepartmentMatch } from '../utils/departmentUtils';

// Helper to remove undefined fields before Firestore write
function cleanData<T extends Record<string, any>>(data: T): Partial<T> {
  const result: any = {};
  for (const key of Object.keys(data)) {
    if (data[key] !== undefined) {
      result[key] = data[key];
    }
  }
  return result;
}

// ============================================================================
// 1. DEPARTMENT MACHINE SIZE MASTER
// ============================================================================

/**
 * Subscribe to machine sizes defined for a specific department.
 * Relationships: departmentId + machineSizeId
 */
export function subscribeDepartmentMachineSizes(
  departmentId: string,
  callback: (sizes: DepartmentMachineSize[]) => void
) {
  const normDept = normalizeDepartmentKey(departmentId);
  const q = query(collection(db, 'departmentMachineSizes'));
  return onSnapshot(
    q,
    (snapshot) => {
      const list: DepartmentMachineSize[] = [];
      snapshot.forEach((d) => {
        const item = { id: d.id, ...d.data() } as DepartmentMachineSize;
        if (
          isDepartmentMatch(item.departmentId, departmentId) ||
          normalizeDepartmentKey(item.departmentId) === normDept
        ) {
          list.push(item);
        }
      });
      // Sort alphabetically or numerically by machine size
      list.sort((a, b) => a.machineSize.localeCompare(b.machineSize, undefined, { numeric: true }));
      callback(list);
    },
    (err) => {
      console.error('Error in subscribeDepartmentMachineSizes:', err);
      callback([]);
    }
  );
}

/**
 * Add a new Machine Size to a Department's Operation Master.
 * Validates uniqueness of machineSize within the department.
 */
export async function addDepartmentMachineSize(
  input: {
    departmentId: string;
    machineSize: string;
    description?: string;
    active?: boolean;
  },
  userEmail?: string
): Promise<string> {
  const cleanSize = input.machineSize.trim();
  if (!cleanSize) {
    throw new Error('Machine Size / Model is required.');
  }

  const normDept = normalizeDepartmentKey(input.departmentId);
  const machineSizeId = cleanSize.toUpperCase().replace(/\s+/g, '-');

  // Check for duplicate machine size inside this department
  const q = query(collection(db, 'departmentMachineSizes'));
  const snap = await getDocs(q);
  const duplicate = snap.docs.find((d) => {
    const data = d.data() as DepartmentMachineSize;
    return (
      (isDepartmentMatch(data.departmentId, input.departmentId) ||
        normalizeDepartmentKey(data.departmentId) === normDept) &&
      data.machineSize.trim().toLowerCase() === cleanSize.toLowerCase()
    );
  });

  if (duplicate) {
    throw new Error(
      `Machine Size "${cleanSize}" already exists in this department's Operation Master.`
    );
  }

  const now = new Date().toISOString();
  const newRecord: Omit<DepartmentMachineSize, 'id'> = {
    departmentId: input.departmentId,
    machineSizeId,
    machineSize: cleanSize,
    description: input.description?.trim() || '',
    active: input.active !== undefined ? input.active : true,
    createdBy: userEmail || 'Department User',
    createdAt: now,
    updatedAt: now,
  };

  const ref = await addDoc(collection(db, 'departmentMachineSizes'), cleanData(newRecord));

  await logAudit(
    'CREATE_MACHINE_SIZE',
    'OPERATION_MASTER',
    ref.id,
    'Added new machine size',
    `Department ${input.departmentId}: Size ${cleanSize}`,
    userEmail
  );

  return ref.id;
}

/**
 * Update an existing Machine Size in a department.
 */
export async function updateDepartmentMachineSize(
  id: string,
  updates: Partial<DepartmentMachineSize>,
  userEmail?: string
): Promise<void> {
  const ref = doc(db, 'departmentMachineSizes', id);
  const now = new Date().toISOString();
  await updateDoc(ref, cleanData({ ...updates, updatedAt: now }));

  await logAudit(
    'UPDATE_MACHINE_SIZE',
    'OPERATION_MASTER',
    id,
    'Updated machine size',
    `Updated fields: ${Object.keys(updates).join(', ')}`,
    userEmail
  );
}

/**
 * Deactivate or activate a Machine Size (Preserves historical records per Section 25).
 */
export async function toggleDepartmentMachineSizeActive(
  id: string,
  active: boolean,
  userEmail?: string
): Promise<void> {
  await updateDepartmentMachineSize(id, { active }, userEmail);
}

// ============================================================================
// 2. DEPARTMENT PARTS MASTER
// ============================================================================

/**
 * Subscribe to parts under a machine size in a department.
 */
export function subscribeDepartmentParts(
  departmentId: string,
  machineSizeId: string,
  callback: (parts: DepartmentPart[]) => void
) {
  const normDept = normalizeDepartmentKey(departmentId);
  const q = query(collection(db, 'departmentParts'));
  return onSnapshot(
    q,
    (snapshot) => {
      const list: DepartmentPart[] = [];
      snapshot.forEach((d) => {
        const item = { id: d.id, ...d.data() } as DepartmentPart;
        const matchesDept =
          isDepartmentMatch(item.departmentId, departmentId) ||
          normalizeDepartmentKey(item.departmentId) === normDept;
        const matchesSize =
          item.machineSizeId.toLowerCase() === machineSizeId.toLowerCase() ||
          item.machineSizeId === machineSizeId;
        if (matchesDept && matchesSize) {
          list.push(item);
        }
      });
      list.sort((a, b) => (a.sequence || 0) - (b.sequence || 0));
      callback(list);
    },
    (err) => {
      console.error('Error in subscribeDepartmentParts:', err);
      callback([]);
    }
  );
}

/**
 * Subscribe to all parts across all machine sizes for a department.
 */
export function subscribeAllDepartmentParts(
  departmentId: string,
  callback: (parts: DepartmentPart[]) => void
) {
  const normDept = normalizeDepartmentKey(departmentId);
  const q = query(collection(db, 'departmentParts'));
  return onSnapshot(
    q,
    (snapshot) => {
      const list: DepartmentPart[] = [];
      snapshot.forEach((d) => {
        const item = { id: d.id, ...d.data() } as DepartmentPart;
        if (
          isDepartmentMatch(item.departmentId, departmentId) ||
          normalizeDepartmentKey(item.departmentId) === normDept
        ) {
          list.push(item);
        }
      });
      list.sort((a, b) => (a.sequence || 0) - (b.sequence || 0));
      callback(list);
    },
    (err) => {
      console.error('Error in subscribeAllDepartmentParts:', err);
      callback([]);
    }
  );
}

/**
 * Add a Part under a Machine Size.
 * Validates uniqueness of Part Name and Part Code under the same machine size.
 */
export async function addDepartmentPart(
  input: {
    departmentId: string;
    machineSizeId: string;
    partName: string;
    partCode?: string;
    sequence?: number;
    description?: string;
    active?: boolean;
  },
  userEmail?: string
): Promise<string> {
  const cleanName = input.partName.trim();
  if (!cleanName) {
    throw new Error('Part Name is required.');
  }

  const cleanCode = (input.partCode?.trim() || `${cleanName.toUpperCase().replace(/\s+/g, '-')}-${input.machineSizeId}`).toUpperCase();
  const normDept = normalizeDepartmentKey(input.departmentId);

  // Validate duplicate part name/code under the same machine size
  const q = query(collection(db, 'departmentParts'));
  const snap = await getDocs(q);
  const duplicate = snap.docs.find((d) => {
    const data = d.data() as DepartmentPart;
    const sameDept =
      isDepartmentMatch(data.departmentId, input.departmentId) ||
      normalizeDepartmentKey(data.departmentId) === normDept;
    const sameSize = data.machineSizeId.toLowerCase() === input.machineSizeId.toLowerCase();
    if (sameDept && sameSize) {
      if (data.partName.trim().toLowerCase() === cleanName.toLowerCase()) return true;
      if (data.partCode.trim().toLowerCase() === cleanCode.toLowerCase()) return true;
    }
    return false;
  });

  if (duplicate) {
    throw new Error(
      `Part with Name "${cleanName}" or Code "${cleanCode}" already exists under Machine Size "${input.machineSizeId}".`
    );
  }

  const now = new Date().toISOString();
  const partId = cleanCode;

  const newPart: Omit<DepartmentPart, 'id'> = {
    departmentId: input.departmentId,
    machineSizeId: input.machineSizeId,
    partId,
    partName: cleanName,
    partCode: cleanCode,
    sequence: input.sequence !== undefined ? Number(input.sequence) : 1,
    description: input.description?.trim() || '',
    active: input.active !== undefined ? input.active : true,
    createdBy: userEmail || 'Department User',
    createdAt: now,
    updatedAt: now,
  };

  const ref = await addDoc(collection(db, 'departmentParts'), cleanData(newPart));

  await logAudit(
    'CREATE_PART',
    'OPERATION_MASTER',
    ref.id,
    'Added new part',
    `${input.departmentId} - Size ${input.machineSizeId} - Part: ${cleanName} (${cleanCode})`,
    userEmail
  );

  return ref.id;
}

/**
 * Update an existing Part.
 */
export async function updateDepartmentPart(
  id: string,
  updates: Partial<DepartmentPart>,
  userEmail?: string
): Promise<void> {
  const ref = doc(db, 'departmentParts', id);
  const now = new Date().toISOString();
  await updateDoc(ref, cleanData({ ...updates, updatedAt: now }));

  await logAudit(
    'UPDATE_PART',
    'OPERATION_MASTER',
    id,
    'Updated part',
    `Updated fields: ${Object.keys(updates).join(', ')}`,
    userEmail
  );
}

/**
 * Deactivate/activate a Part.
 */
export async function toggleDepartmentPartActive(
  id: string,
  active: boolean,
  userEmail?: string
): Promise<void> {
  await updateDepartmentPart(id, { active }, userEmail);
}

// ============================================================================
// 3. DEPARTMENT OPERATIONS MASTER
// ============================================================================

/**
 * Subscribe to operations for a specific department and machine size (optionally filtered by part).
 */
export function subscribeDepartmentOperations(
  departmentId: string,
  machineSizeId: string,
  callback: (ops: DepartmentOperation[]) => void,
  partId?: string
) {
  const normDept = normalizeDepartmentKey(departmentId);
  const q = query(collection(db, 'departmentOperations'));
  return onSnapshot(
    q,
    (snapshot) => {
      const list: DepartmentOperation[] = [];
      snapshot.forEach((d) => {
        const item = { id: d.id, ...d.data() } as DepartmentOperation;
        const matchesDept =
          isDepartmentMatch(item.departmentId, departmentId) ||
          normalizeDepartmentKey(item.departmentId) === normDept;
        const matchesSize =
          item.machineSizeId.toLowerCase() === machineSizeId.toLowerCase() ||
          item.machineSizeId === machineSizeId;
        const matchesPart = !partId || item.partId === partId;

        if (matchesDept && matchesSize && matchesPart) {
          list.push(item);
        }
      });
      list.sort((a, b) => (a.sequence || 0) - (b.sequence || 0));
      callback(list);
    },
    (err) => {
      console.error('Error in subscribeDepartmentOperations:', err);
      callback([]);
    }
  );
}

/**
 * Subscribe to all operations for a department across all machine sizes.
 */
export function subscribeAllDepartmentOperations(
  departmentId: string,
  callback: (ops: DepartmentOperation[]) => void
) {
  const normDept = normalizeDepartmentKey(departmentId);
  const q = query(collection(db, 'departmentOperations'));
  return onSnapshot(
    q,
    (snapshot) => {
      const list: DepartmentOperation[] = [];
      snapshot.forEach((d) => {
        const item = { id: d.id, ...d.data() } as DepartmentOperation;
        if (
          isDepartmentMatch(item.departmentId, departmentId) ||
          normalizeDepartmentKey(item.departmentId) === normDept
        ) {
          list.push(item);
        }
      });
      list.sort((a, b) => (a.sequence || 0) - (b.sequence || 0));
      callback(list);
    },
    (err) => {
      console.error('Error in subscribeAllDepartmentOperations:', err);
      callback([]);
    }
  );
}

/**
 * Add an Operation under a Part.
 * Validates uniqueness of Operation Name/Code under the same part.
 */
export async function addDepartmentOperation(
  input: {
    departmentId: string;
    machineSizeId: string;
    partId: string;
    operationName: string;
    operationCode?: string;
    sequence?: number;
    description?: string;
    standardTime?: string;
    targetQuantity?: number;
    unit?: string;
    weight?: number;
    active?: boolean;
  },
  userEmail?: string
): Promise<string> {
  const cleanName = input.operationName.trim();
  if (!cleanName) {
    throw new Error('Operation Name is required.');
  }

  const cleanCode = (input.operationCode?.trim() || `OP-${cleanName.toUpperCase().slice(0, 4)}-${Date.now().toString().slice(-4)}`).toUpperCase();
  const normDept = normalizeDepartmentKey(input.departmentId);

  // Validate duplicate operation name/code under the same part
  const q = query(collection(db, 'departmentOperations'));
  const snap = await getDocs(q);
  const duplicate = snap.docs.find((d) => {
    const data = d.data() as DepartmentOperation;
    const sameDept =
      isDepartmentMatch(data.departmentId, input.departmentId) ||
      normalizeDepartmentKey(data.departmentId) === normDept;
    const sameSize = data.machineSizeId.toLowerCase() === input.machineSizeId.toLowerCase();
    const samePart = data.partId === input.partId;
    if (sameDept && sameSize && samePart) {
      if (data.operationName.trim().toLowerCase() === cleanName.toLowerCase()) return true;
      if (data.operationCode.trim().toLowerCase() === cleanCode.toLowerCase()) return true;
    }
    return false;
  });

  if (duplicate) {
    throw new Error(
      `Operation with Name "${cleanName}" or Code "${cleanCode}" already exists under Part "${input.partId}".`
    );
  }

  const now = new Date().toISOString();
  const operationId = cleanCode;

  const newOp: Omit<DepartmentOperation, 'id'> = {
    departmentId: input.departmentId,
    machineSizeId: input.machineSizeId,
    partId: input.partId,
    operationId,
    operationName: cleanName,
    operationCode: cleanCode,
    sequence: input.sequence !== undefined ? Number(input.sequence) : 1,
    description: input.description?.trim() || '',
    standardTime: input.standardTime?.trim() || '',
    targetQuantity: input.targetQuantity !== undefined ? Number(input.targetQuantity) : undefined,
    unit: input.unit?.trim() || 'Pcs',
    weight: input.weight !== undefined ? Number(input.weight) : 1,
    active: input.active !== undefined ? input.active : true,
    createdBy: userEmail || 'Department User',
    createdAt: now,
    updatedAt: now,
  };

  const ref = await addDoc(collection(db, 'departmentOperations'), cleanData(newOp));

  await logAudit(
    'CREATE_OPERATION',
    'OPERATION_MASTER',
    ref.id,
    'Added new operation',
    `${input.departmentId} - Size ${input.machineSizeId} - Part ${input.partId} - Op: ${cleanName}`,
    userEmail
  );

  return ref.id;
}

/**
 * Update an existing Operation.
 */
export async function updateDepartmentOperation(
  id: string,
  updates: Partial<DepartmentOperation>,
  userEmail?: string
): Promise<void> {
  const ref = doc(db, 'departmentOperations', id);
  const now = new Date().toISOString();
  await updateDoc(ref, cleanData({ ...updates, updatedAt: now }));

  await logAudit(
    'UPDATE_OPERATION',
    'OPERATION_MASTER',
    id,
    'Updated operation',
    `Updated fields: ${Object.keys(updates).join(', ')}`,
    userEmail
  );
}

/**
 * Deactivate/activate an Operation (Preserves history per Section 25).
 */
export async function toggleDepartmentOperationActive(
  id: string,
  active: boolean,
  userEmail?: string
): Promise<void> {
  await updateDepartmentOperation(id, { active }, userEmail);
}

// ============================================================================
// 4. MACHINE OPERATION EXECUTION & DAILY UPDATES
// ============================================================================

/**
 * Subscribe to machine-specific operation executions for a given machine and department.
 */
export function subscribeMachineOperationExecutions(
  machineNumber: string,
  departmentId: string,
  callback: (execs: MachineOperationExecution[]) => void
) {
  const normDept = normalizeDepartmentKey(departmentId);
  const q = query(
    collection(db, 'machineOperationExecution'),
    where('machineNumber', '==', machineNumber.trim())
  );
  return onSnapshot(
    q,
    (snapshot) => {
      const list: MachineOperationExecution[] = [];
      snapshot.forEach((d) => {
        const item = { id: d.id, ...d.data() } as MachineOperationExecution;
        if (
          isDepartmentMatch(item.departmentId, departmentId) ||
          normalizeDepartmentKey(item.departmentId) === normDept
        ) {
          list.push(item);
        }
      });
      callback(list);
    },
    (err) => {
      console.error('Error in subscribeMachineOperationExecutions:', err);
      callback([]);
    }
  );
}

/**
 * Subscribe to daily operation updates for a department.
 */
export function subscribeDepartmentDailyUpdates(
  departmentId: string,
  callback: (updates: DailyOperationUpdate[]) => void
) {
  const normDept = normalizeDepartmentKey(departmentId);
  const q = query(collection(db, 'dailyOperationUpdates'));
  return onSnapshot(
    q,
    (snapshot) => {
      const list: DailyOperationUpdate[] = [];
      snapshot.forEach((d) => {
        const item = { id: d.id, ...d.data() } as DailyOperationUpdate;
        if (
          isDepartmentMatch(item.departmentId, departmentId) ||
          normalizeDepartmentKey(item.departmentId) === normDept
        ) {
          list.push(item);
        }
      });
      // Sort newest first
      list.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
      callback(list);
    },
    (err) => {
      console.error('Error in subscribeDepartmentDailyUpdates:', err);
      callback([]);
    }
  );
}

/**
 * Subscribe to daily operation updates for a specific machine.
 */
export function subscribeMachineDailyUpdates(
  machineNumber: string,
  callback: (updates: DailyOperationUpdate[]) => void
) {
  const q = query(
    collection(db, 'dailyOperationUpdates'),
    where('machineNumber', '==', machineNumber.trim())
  );
  return onSnapshot(
    q,
    (snapshot) => {
      const list: DailyOperationUpdate[] = [];
      snapshot.forEach((d) => {
        list.push({ id: d.id, ...d.data() } as DailyOperationUpdate);
      });
      list.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
      callback(list);
    },
    (err) => {
      console.error('Error in subscribeMachineDailyUpdates:', err);
      callback([]);
    }
  );
}

/**
 * Subscribe to detailed daily operation results for a machine or update.
 */
export function subscribeMachineDailyResults(
  machineNumber: string,
  callback: (results: DailyOperationResult[]) => void
) {
  const q = query(
    collection(db, 'dailyOperationResults'),
    where('machineNumber', '==', machineNumber.trim())
  );
  return onSnapshot(
    q,
    (snapshot) => {
      const list: DailyOperationResult[] = [];
      snapshot.forEach((d) => {
        list.push({ id: d.id, ...d.data() } as DailyOperationResult);
      });
      list.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
      callback(list);
    },
    (err) => {
      console.error('Error in subscribeMachineDailyResults:', err);
      callback([]);
    }
  );
}

export interface OperationDailyInput {
  operationId: string;
  operationName: string;
  partId: string;
  partName: string;
  status: OperationExecutionStatus;
  completed: boolean;
  weight?: number;
  remarks?: string;
  holdReason?: string;
  startTime?: string;
  completionTime?: string;
}

/**
 * Submit a Daily Operation Update.
 * - Saves immutable entry in dailyOperationUpdates
 * - Saves each operation status in dailyOperationResults
 * - Updates or creates persistent machineOperationExecution status
 * - Automatically computes Today's Completion %:
 *   SUM(completed operation weights) / SUM(applicable operation weights) * 100
 * - Does NOT overwrite previous days' updates
 * - Updates Machine record with today's work stats and lastUpdate
 */
export async function submitDailyOperationUpdate(
  params: {
    machineNumber: string;
    machineSize: string;
    machineId?: string;
    departmentId: string;
    employeeName: string;
    employeeId?: string;
    date: string; // YYYY-MM-DD
    operations: OperationDailyInput[];
    remarks?: string;
    overallProgressUpdate?: number; // Optional user progress update
  },
  userEmail?: string
): Promise<{ updateId: string; completionPercentage: number }> {
  const {
    machineNumber,
    machineSize,
    machineId,
    departmentId,
    employeeName,
    employeeId,
    date,
    operations,
    remarks,
    overallProgressUpdate,
  } = params;

  if (!machineNumber || !machineNumber.trim()) {
    throw new Error('Machine Number is required.');
  }

  if (operations.length === 0) {
    throw new Error('At least one operation is required for this machine size.');
  }

  // Calculate automatic Today's Work Completion % (Section 13, 14, 33)
  // Formula: SUM(completed operation weights) / SUM(applicable operation weights) * 100
  let totalWeight = 0;
  let completedWeight = 0;
  let totalOpsCount = operations.length;
  let completedOpsCount = 0;

  for (const op of operations) {
    const w = op.weight && op.weight > 0 ? Number(op.weight) : 1;
    totalWeight += w;
    if (op.completed || op.status === 'COMPLETED') {
      completedWeight += w;
      completedOpsCount++;
    }
  }

  const completionPercentage =
    totalWeight > 0 ? Math.round((completedWeight / totalWeight) * 100) : 0;

  const now = new Date().toISOString();
  const dateCompact = date.replace(/-/g, '');
  const randSuffix = Math.floor(1000 + Math.random() * 9000);
  const updateId = `DOU-${dateCompact}-${randSuffix}`;

  // 1. Create immutable DailyOperationUpdate
  const updateRecord: Omit<DailyOperationUpdate, 'id'> = {
    updateId,
    machineId: machineId || '',
    machineNumber: machineNumber.trim(),
    machineSize: machineSize.trim(),
    departmentId,
    employeeId: employeeId || '',
    employeeName: employeeName.trim(),
    date,
    totalOperations: totalOpsCount,
    completedOperations: completedOpsCount,
    completionPercentage,
    remarks: remarks?.trim() || '',
    createdAt: now,
  };

  await addDoc(collection(db, 'dailyOperationUpdates'), cleanData(updateRecord));

  // 2. Create individual dailyOperationResults & update machineOperationExecution
  for (const op of operations) {
    const isDone = op.completed || op.status === 'COMPLETED';
    const resultRecord: Omit<DailyOperationResult, 'id'> = {
      updateId,
      machineId: machineId || '',
      machineNumber: machineNumber.trim(),
      machineSize: machineSize.trim(),
      departmentId,
      operationId: op.operationId,
      operationName: op.operationName,
      partId: op.partId,
      partName: op.partName,
      status: op.status,
      completed: isDone,
      remarks: op.remarks?.trim() || '',
      holdReason: op.holdReason?.trim() || '',
      startTime: op.startTime || '',
      completionTime: op.completionTime || (isDone ? now : ''),
      employeeId: employeeId || '',
      employeeName: employeeName.trim(),
      date,
      createdAt: now,
    };

    await addDoc(collection(db, 'dailyOperationResults'), cleanData(resultRecord));

    // Upsert machineOperationExecution for this machine + operation
    // Document ID: `${machineNumber}_${departmentId}_${op.operationId}`
    const execDocId = `${machineNumber.trim()}_${departmentId.replace(/[^a-zA-Z0-9]/g, '_')}_${op.operationId}`;
    const execRef = doc(db, 'machineOperationExecution', execDocId);

    const execData: MachineOperationExecution = {
      machineId: machineId || '',
      machineNumber: machineNumber.trim(),
      machineSize: machineSize.trim(),
      departmentId,
      partId: op.partId,
      partName: op.partName,
      operationId: op.operationId,
      operationName: op.operationName,
      status: op.status,
      completed: isDone,
      completedBy: isDone ? employeeName.trim() : undefined,
      completedAt: isDone ? now : undefined,
      holdReason: op.holdReason?.trim() || '',
      remarks: op.remarks?.trim() || '',
      weight: op.weight || 1,
      lastUpdatedAt: now,
    };

    await setDoc(execRef, cleanData(execData), { merge: true });
  }

  // 3. Update Machine Master document
  // Updates todayWorkPercent, todayOperationsCount, todayCompletedOperations, lastUpdate
  try {
    const mQuery = query(
      collection(db, 'machines'),
      where('machineNumber', '==', machineNumber.trim())
    );
    const mSnap = await getDocs(mQuery);
    for (const mDoc of mSnap.docs) {
      const updates: any = {
        todayWorkPercent: completionPercentage,
        todayCompletedOperations: completedOpsCount,
        totalOperations: totalOpsCount,
        lastUpdateDate: date,
        lastUpdate: `${date} (${completionPercentage}% by ${employeeName})`,
        updatedAt: now,
      };

      if (overallProgressUpdate !== undefined && overallProgressUpdate >= 0) {
        updates.progress = overallProgressUpdate;
        updates.departmentProgress = overallProgressUpdate;
        if (overallProgressUpdate >= 100) {
          updates.status = 'COMPLETED';
          updates.currentStatus = 'COMPLETED';
        }
      }

      await updateDoc(mDoc.ref, cleanData(updates));
    }
  } catch (err) {
    console.warn('Warning updating machine document with daily stats:', err);
  }

  // 4. Log Audit
  await logAudit(
    'SUBMIT_DAILY_OPERATION_UPDATE',
    'SHOP_FLOOR',
    updateId,
    `Submitted Daily Work for Machine ${machineNumber}`,
    `Dept: ${departmentId}, Size: ${machineSize}, Today's Completion: ${completionPercentage}% (${completedOpsCount}/${totalOpsCount} ops) by ${employeeName}`,
    userEmail
  );

  return { updateId, completionPercentage };
}

// ============================================================================
// 5. AUTO-DETECT MACHINE SIZE HELPER
// ============================================================================

/**
 * Extracts and matches a machine size from a Machine object against configured sizes.
 * Example: Machine model "CMM 685" or "685" -> matches "685".
 */
export function extractMachineSize(
  machine: Machine,
  configuredSizes: DepartmentMachineSize[]
): string {
  const modelStr = (
    machine.machineSize ||
    machine.size ||
    machine.model ||
    machine.machineModel ||
    machine.specification ||
    ''
  ).trim();

  if (!modelStr) {
    return configuredSizes[0]?.machineSize || '';
  }

  // 1. Direct match
  const exactMatch = configuredSizes.find(
    (s) => s.machineSize.toLowerCase() === modelStr.toLowerCase()
  );
  if (exactMatch) return exactMatch.machineSize;

  // 2. Partial word or number match (e.g. "685" in "CMM-685" or "Bridge 8106")
  for (const s of configuredSizes) {
    const sNorm = s.machineSize.toLowerCase();
    if (modelStr.toLowerCase().includes(sNorm)) {
      return s.machineSize;
    }
  }

  // 3. Fallback to modelStr directly or first configured size
  return modelStr || (configuredSizes[0]?.machineSize ?? '');
}

// ============================================================================
// 6. EXCEL IMPORT OPERATION MASTER
// ============================================================================

export interface ValidatedOperationImportItem {
  machineSize: string;
  part: string;
  operation: string;
}

export interface ExcelImportSummary {
  machineSizesCreated: number;
  partsCreated: number;
  operationsCreated: number;
  importedSizes: string[];
}

/**
 * Bulk imports validated Excel operation master rows for a department.
 * Automatically constructs the 3-level hierarchy:
 * Department -> Machine Size -> Part -> Operation
 * Reuses existing machine sizes and parts, creates new ones as needed,
 * and skips duplicates.
 */
export async function bulkImportDepartmentOperationsFromExcel(
  departmentId: string,
  items: ValidatedOperationImportItem[],
  userEmail?: string
): Promise<ExcelImportSummary> {
  const normDept = normalizeDepartmentKey(departmentId);
  const now = new Date().toISOString();

  // 1. Fetch current department machine sizes, parts, and operations
  const [sizesSnap, partsSnap, opsSnap] = await Promise.all([
    getDocs(query(collection(db, 'departmentMachineSizes'))),
    getDocs(query(collection(db, 'departmentParts'))),
    getDocs(query(collection(db, 'departmentOperations'))),
  ]);

  // Existing Sizes map (key: size lowercase -> DepartmentMachineSize)
  const sizeMap = new Map<string, DepartmentMachineSize>();
  sizesSnap.forEach((d) => {
    const item = { id: d.id, ...d.data() } as DepartmentMachineSize;
    if (
      isDepartmentMatch(item.departmentId, departmentId) ||
      normalizeDepartmentKey(item.departmentId) === normDept
    ) {
      sizeMap.set(item.machineSize.trim().toLowerCase(), item);
      sizeMap.set(item.machineSizeId.toLowerCase(), item);
    }
  });

  // Existing Parts map (key: `${machineSizeId.toLowerCase()}:::${partName.toLowerCase()}` -> DepartmentPart)
  const partMap = new Map<string, DepartmentPart>();
  const partMaxSeqMap = new Map<string, number>(); // key: machineSizeId.toLowerCase()
  partsSnap.forEach((d) => {
    const item = { id: d.id, ...d.data() } as DepartmentPart;
    if (
      isDepartmentMatch(item.departmentId, departmentId) ||
      normalizeDepartmentKey(item.departmentId) === normDept
    ) {
      const key = `${item.machineSizeId.toLowerCase()}:::${item.partName.trim().toLowerCase()}`;
      partMap.set(key, item);
      const currentMax = partMaxSeqMap.get(item.machineSizeId.toLowerCase()) || 0;
      if ((item.sequence || 0) > currentMax) {
        partMaxSeqMap.set(item.machineSizeId.toLowerCase(), item.sequence);
      }
    }
  });

  // Existing Operations set (key: `${machineSizeId.toLowerCase()}:::${partId.toLowerCase()}:::${opName.toLowerCase()}`)
  const opSet = new Set<string>();
  const opMaxSeqMap = new Map<string, number>(); // key: `${machineSizeId.toLowerCase()}:::${partId.toLowerCase()}`
  opsSnap.forEach((d) => {
    const item = { id: d.id, ...d.data() } as DepartmentOperation;
    if (
      isDepartmentMatch(item.departmentId, departmentId) ||
      normalizeDepartmentKey(item.departmentId) === normDept
    ) {
      const key = `${item.machineSizeId.toLowerCase()}:::${item.partId.toLowerCase()}:::${item.operationName.trim().toLowerCase()}`;
      opSet.add(key);
      const seqKey = `${item.machineSizeId.toLowerCase()}:::${item.partId.toLowerCase()}`;
      const currentMax = opMaxSeqMap.get(seqKey) || 0;
      if ((item.sequence || 0) > currentMax) {
        opMaxSeqMap.set(seqKey, item.sequence);
      }
    }
  });

  let machineSizesCreated = 0;
  let partsCreated = 0;
  let operationsCreated = 0;
  const importedSizesSet = new Set<string>();

  // Process rows sequentially to maintain proper sequencing and avoid race conditions
  for (let i = 0; i < items.length; i++) {
    const row = items[i];
    const cleanSize = row.machineSize.trim();
    const cleanPart = row.part.trim();
    const cleanOp = row.operation.trim();

    if (!cleanSize || !cleanPart || !cleanOp) continue;

    const sizeKey = cleanSize.toLowerCase();

    // Step A: Ensure Machine Size exists
    let sizeObj = sizeMap.get(sizeKey);
    if (!sizeObj) {
      const machineSizeId = cleanSize.toUpperCase().replace(/\s+/g, '-');
      const newSize: Omit<DepartmentMachineSize, 'id'> = {
        departmentId,
        machineSizeId,
        machineSize: cleanSize,
        description: `Imported via Excel`,
        active: true,
        createdBy: userEmail || 'Excel Import',
        createdAt: now,
        updatedAt: now,
      };
      const docRef = await addDoc(collection(db, 'departmentMachineSizes'), cleanData(newSize));
      sizeObj = { id: docRef.id, ...newSize };
      sizeMap.set(sizeKey, sizeObj);
      sizeMap.set(machineSizeId.toLowerCase(), sizeObj);
      machineSizesCreated++;
    }
    importedSizesSet.add(sizeObj.machineSizeId);

    // Step B: Ensure Part exists under this Machine Size
    const partLookupKey = `${sizeObj.machineSizeId.toLowerCase()}:::${cleanPart.toLowerCase()}`;
    let partObj = partMap.get(partLookupKey);
    if (!partObj) {
      const cleanPartCode = `${cleanPart.toUpperCase().replace(/\s+/g, '-')}-${sizeObj.machineSizeId}`;
      const nextSeq = (partMaxSeqMap.get(sizeObj.machineSizeId.toLowerCase()) || 0) + 1;
      partMaxSeqMap.set(sizeObj.machineSizeId.toLowerCase(), nextSeq);

      const newPart: Omit<DepartmentPart, 'id'> = {
        departmentId,
        machineSizeId: sizeObj.machineSizeId,
        partId: cleanPartCode,
        partName: cleanPart,
        partCode: cleanPartCode,
        sequence: nextSeq,
        description: `Imported via Excel`,
        active: true,
        createdBy: userEmail || 'Excel Import',
        createdAt: now,
        updatedAt: now,
      };
      const docRef = await addDoc(collection(db, 'departmentParts'), cleanData(newPart));
      partObj = { id: docRef.id, ...newPart };
      partMap.set(partLookupKey, partObj);
      partsCreated++;
    }

    // Step C: Ensure Operation exists under this Part
    const opLookupKey = `${sizeObj.machineSizeId.toLowerCase()}:::${partObj.partId.toLowerCase()}:::${cleanOp.toLowerCase()}`;
    if (opSet.has(opLookupKey)) {
      // Duplicate, skip
      continue;
    }

    const seqKey = `${sizeObj.machineSizeId.toLowerCase()}:::${partObj.partId.toLowerCase()}`;
    const nextOpSeq = (opMaxSeqMap.get(seqKey) || 0) + 1;
    opMaxSeqMap.set(seqKey, nextOpSeq);

    const safeOpShort = cleanOp.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4) || 'OP';
    const cleanOpCode = `OP-${safeOpShort}-${Date.now().toString().slice(-4)}-${i + 1}`;

    const newOp: Omit<DepartmentOperation, 'id'> = {
      departmentId,
      machineSizeId: sizeObj.machineSizeId,
      partId: partObj.partId,
      operationId: cleanOpCode,
      operationName: cleanOp,
      operationCode: cleanOpCode,
      sequence: nextOpSeq,
      description: '',
      standardTime: '',
      unit: 'Pcs',
      weight: 1,
      active: true,
      createdBy: userEmail || 'Excel Import',
      createdAt: now,
      updatedAt: now,
    };

    await addDoc(collection(db, 'departmentOperations'), cleanData(newOp));
    opSet.add(opLookupKey);
    operationsCreated++;
  }

  // Log Audit Entry
  if (operationsCreated > 0 || machineSizesCreated > 0 || partsCreated > 0) {
    await logAudit(
      'EXCEL_IMPORT_OPERATIONS',
      'OPERATION_MASTER',
      departmentId,
      `Excel imported ${operationsCreated} operations`,
      `Dept ${departmentId}: ${machineSizesCreated} new sizes, ${partsCreated} new parts, ${operationsCreated} new operations`,
      userEmail
    );
  }

  return {
    machineSizesCreated,
    partsCreated,
    operationsCreated,
    importedSizes: Array.from(importedSizesSet),
  };
}
