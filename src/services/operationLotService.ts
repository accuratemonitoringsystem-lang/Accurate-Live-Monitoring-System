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
  OperationLot,
  OperationLotMachine,
  DailyLotComplianceReport,
  Machine,
  MachineHistoryEntry,
  UserProfile,
} from '../types';
import { logAudit, createNotification } from './db';
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

// Generate unique readable lot number
export function generateLotNumber(departmentName: string): string {
  const cleanDept = departmentName
    .replace(/[^a-zA-Z0-9]/g, '')
    .substring(0, 6)
    .toUpperCase() || 'DEPT';
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `LOT-${cleanDept}-${dateStr}-${randomSuffix}`;
}

// ============================================================================
// 1. REAL-TIME SUBSCRIPTIONS
// ============================================================================

/**
 * Subscribe to Operation Lots for a specific department
 */
export function subscribeDepartmentOperationLots(
  departmentName: string,
  callback: (lots: OperationLot[]) => void
) {
  if (!departmentName || departmentName === 'All Departments') {
    return subscribeAllOperationLots(callback);
  }
  const normDept = normalizeDepartmentKey(departmentName);
  const q = query(collection(db, 'operation_lots'));

  return onSnapshot(
    q,
    (snapshot) => {
      const list: OperationLot[] = [];
      snapshot.forEach((d) => {
        const item = { id: d.id, ...d.data() } as OperationLot;
        if (
          isDepartmentMatch(item.departmentName, departmentName) ||
          normalizeDepartmentKey(item.departmentId || '') === normDept ||
          normalizeDepartmentKey(item.departmentName || '') === normDept
        ) {
          list.push(item);
        }
      });
      list.sort((a, b) => new Date(b.createdAt || '').getTime() - new Date(a.createdAt || '').getTime());
      callback(list);
    },
    (err) => {
      console.warn('Notice listening to operation_lots:', err);
      callback([]);
    }
  );
}

/**
 * Subscribe to All Operation Lots across all departments (For Admin)
 */
export function subscribeAllOperationLots(
  callback: (lots: OperationLot[]) => void
) {
  const q = query(collection(db, 'operation_lots'));

  return onSnapshot(
    q,
    (snapshot) => {
      const list: OperationLot[] = [];
      snapshot.forEach((d) => {
        list.push({ id: d.id, ...d.data() } as OperationLot);
      });
      list.sort((a, b) => new Date(b.createdAt || '').getTime() - new Date(a.createdAt || '').getTime());
      callback(list);
    },
    (err) => {
      console.warn('Notice listening to all operation_lots:', err);
      callback([]);
    }
  );
}

/**
 * Subscribe to Machines within a specific Operation Lot
 */
export function subscribeLotMachines(
  lotId: string,
  callback: (lotMachines: OperationLotMachine[]) => void
) {
  const q = query(collection(db, 'operation_lot_machines'));

  return onSnapshot(
    q,
    (snapshot) => {
      const list: OperationLotMachine[] = [];
      snapshot.forEach((d) => {
        const item = { id: d.id, ...d.data() } as OperationLotMachine;
        if (item.lotId === lotId) {
          list.push(item);
        }
      });
      list.sort((a, b) => (a.machineNumber || '').localeCompare(b.machineNumber || ''));
      callback(list);
    },
    (err) => {
      console.warn('Notice listening to operation_lot_machines:', err);
      callback([]);
    }
  );
}

/**
 * Subscribe to Daily Lot Compliance Reports for a department
 */
export function subscribeDepartmentDailyLotReports(
  departmentName: string,
  callback: (reports: DailyLotComplianceReport[]) => void
) {
  if (!departmentName || departmentName === 'All Departments') {
    return subscribeAllDailyLotReports(callback);
  }
  const normDept = normalizeDepartmentKey(departmentName);
  const q = query(collection(db, 'daily_lot_reports'));

  return onSnapshot(
    q,
    (snapshot) => {
      const list: DailyLotComplianceReport[] = [];
      snapshot.forEach((d) => {
        const item = { id: d.id, ...d.data() } as DailyLotComplianceReport;
        if (
          isDepartmentMatch(item.departmentName, departmentName) ||
          normalizeDepartmentKey(item.departmentId || '') === normDept
        ) {
          list.push(item);
        }
      });
      list.sort((a, b) => new Date(b.submittedAt || '').getTime() - new Date(a.submittedAt || '').getTime());
      callback(list);
    },
    (err) => {
      console.warn('Notice listening to daily_lot_reports:', err);
      callback([]);
    }
  );
}

/**
 * Subscribe to All Daily Lot Compliance Reports across departments (For Admin)
 */
export function subscribeAllDailyLotReports(
  callback: (reports: DailyLotComplianceReport[]) => void
) {
  const q = query(collection(db, 'daily_lot_reports'));

  return onSnapshot(
    q,
    (snapshot) => {
      const list: DailyLotComplianceReport[] = [];
      snapshot.forEach((d) => {
        list.push({ id: d.id, ...d.data() } as DailyLotComplianceReport);
      });
      list.sort((a, b) => new Date(b.submittedAt || '').getTime() - new Date(a.submittedAt || '').getTime());
      callback(list);
    },
    (err) => {
      console.warn('Notice listening to all daily_lot_reports:', err);
      callback([]);
    }
  );
}

// ============================================================================
// 2. ELIGIBLE MACHINE CHECKER
// ============================================================================

export interface EligibleMachineResult {
  machine: Machine;
  eligible: boolean;
  reason?: string;
  previousCompliance?: number;
}

/**
 * Automatically fetch and evaluate eligible machines for an operation lot
 * based on machine size/model and department ownership rules.
 */
export async function getEligibleMachinesForLot(
  departmentName: string,
  targetMachineSize: string,
  operationId?: string
): Promise<EligibleMachineResult[]> {
  try {
    const machinesSnap = await getDocs(collection(db, 'machines'));
    const results: EligibleMachineResult[] = [];
    const normTargetSize = (targetMachineSize || '').trim().toLowerCase();

    machinesSnap.forEach((d) => {
      const m = { id: d.id, ...d.data() } as Machine;
      const model = (m.model || m.machineModel || '').trim();
      const normModel = model.toLowerCase();

      // Check size compatibility:
      // Exact match or contains size (e.g. '685' matches 'ACCU 685' or '685')
      const sizeMatches =
        !normTargetSize ||
        normModel === normTargetSize ||
        normModel.includes(normTargetSize) ||
        normTargetSize.includes(normModel);

      // Check department ownership:
      const isInDept =
        isDepartmentMatch(m.currentDepartment, departmentName) ||
        isDepartmentMatch(m.responsibleDepartment, departmentName);

      if (!sizeMatches) {
        results.push({
          machine: m,
          eligible: false,
          reason: `Model mismatch (${model || 'Unknown'} vs ${targetMachineSize})`,
        });
      } else if (!isInDept) {
        results.push({
          machine: m,
          eligible: false,
          reason: `Machine currently in ${m.currentDepartment || 'different department'}`,
        });
      } else {
        // Machine is in this department and size matches!
        results.push({
          machine: m,
          eligible: true,
          previousCompliance: m.departmentCompliance || m.compliancePercentage || (m.progress || 0),
        });
      }
    });

    return results;
  } catch (err) {
    console.error('Error fetching eligible machines for lot:', err);
    return [];
  }
}

// ============================================================================
// 3. CREATE OPERATION LOT (SELECT 1 OPERATION, MULTIPLE MACHINES)
// ============================================================================

export interface CreateOperationLotParams {
  departmentName: string;
  departmentId?: string;
  lotNumber?: string;
  lotDate: string;
  operationId: string;
  operationName: string;
  operationCode?: string;
  machineSize: string;
  machineSizeId: string;
  partId: string;
  partName: string;
  assignedEmployee: string;
  assignedEmployeeId?: string;
  plannedDate?: string;
  remarks?: string;
  selectedMachines: Array<{
    machineNumber: string;
    model?: string;
    project?: string;
    customer?: string;
  }>;
  userEmail?: string;
  userDisplayName?: string;
}

export async function createOperationLot(
  params: CreateOperationLotParams
): Promise<{ success: boolean; lotId: string; lotNumber: string }> {
  if (!params.operationId || !params.operationName) {
    throw new Error('Operation is mandatory to create an Operation Lot.');
  }
  if (!params.selectedMachines || params.selectedMachines.length === 0) {
    throw new Error('Please select at least one eligible machine to include in the lot.');
  }

  const now = new Date().toISOString();
  const canonicalDeptId = normalizeDepartmentKey(params.departmentId || params.departmentName);
  const lotNumber = params.lotNumber || generateLotNumber(params.departmentName);
  const lotDocId = `lot_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

  const totalMachines = params.selectedMachines.length;
  const selectedMachineNumbers = params.selectedMachines.map((m) => m.machineNumber);

  const newLot: OperationLot = {
    id: lotDocId,
    lotNumber,
    departmentId: canonicalDeptId,
    departmentName: params.departmentName,
    operationId: params.operationId,
    operationName: params.operationName,
    operationCode: params.operationCode || '',
    machineSize: params.machineSize,
    machineSizeId: params.machineSizeId,
    partId: params.partId,
    partName: params.partName,
    assignedEmployee: params.assignedEmployee,
    assignedEmployeeId: params.assignedEmployeeId || '',
    lotDate: params.lotDate,
    plannedDate: params.plannedDate || '',
    remarks: params.remarks || '',
    status: 'ACTIVE',
    totalMachines,
    completedMachines: 0,
    inProgressMachines: 0,
    pendingMachines: totalMachines,
    delayedMachines: 0,
    overallCompliance: 0,
    selectedMachineNumbers,
    createdBy: params.userEmail || 'system',
    createdByName: params.userDisplayName || params.assignedEmployee,
    createdAt: now,
    updatedAt: now,
    lastUpdateDate: params.lotDate,
  };

  // 1. Save Lot document
  await setDoc(doc(db, 'operation_lots', lotDocId), cleanData(newLot));
  try {
    await setDoc(doc(db, 'operationLots', lotDocId), cleanData(newLot));
  } catch {}

  // 2. Create Machine-Wise Execution Records for every selected machine
  for (const m of params.selectedMachines) {
    const lmDocId = `lm_${lotDocId}_${m.machineNumber.replace(/[^a-zA-Z0-9]/g, '_')}`;
    const lotMachine: OperationLotMachine = {
      id: lmDocId,
      lotId: lotDocId,
      lotNumber,
      machineNumber: m.machineNumber,
      machineSize: params.machineSize,
      project: m.project || '',
      customer: m.customer || '',
      departmentId: canonicalDeptId,
      departmentName: params.departmentName,
      operationId: params.operationId,
      operationName: params.operationName,
      partId: params.partId,
      partName: params.partName,
      status: 'NOT STARTED',
      completed: false,
      progress: 0,
      plannedDate: params.plannedDate || '',
      compliancePercentage: 0,
      createdAt: now,
      updatedAt: now,
    };

    await setDoc(doc(db, 'operation_lot_machines', lmDocId), cleanData(lotMachine));
    try {
      await setDoc(doc(db, 'operationLotMachines', lmDocId), cleanData(lotMachine));
    } catch {}

    // Update machine status on shop floor with active lot reference
    try {
      const mSnap = await getDocs(
        query(collection(db, 'machines'), where('machineNumber', '==', m.machineNumber))
      );
      if (!mSnap.empty) {
        const mDoc = mSnap.docs[0];
        const mData = mDoc.data() as Machine;
        const existingHistory = mData.history || [];

        const histEntry: MachineHistoryEntry = {
          id: `hist_lot_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          date: params.lotDate,
          department: params.departmentName,
          task: `Lot Created: ${lotNumber} (${params.operationName})`,
          employee: params.assignedEmployee,
          startDate: params.lotDate,
          status: 'In Progress',
          remarks: `Assigned to Operation Lot ${lotNumber} for ${params.partName} - ${params.operationName}`,
        };

        await updateDoc(mDoc.ref, {
          activeLotNumber: lotNumber,
          activeOperationName: params.operationName,
          activePartName: params.partName,
          lastUpdate: now,
          updatedAt: now,
          history: [histEntry, ...existingHistory],
        });
      }
    } catch (e) {
      console.warn(`Notice updating machine ${m.machineNumber} with lot info:`, e);
    }
  }

  // 3. Log Audit
  await logAudit(
    'CREATE_OPERATION_LOT',
    'OPERATION_LOTS',
    lotNumber,
    '',
    `Created Operation Lot ${lotNumber} with ${totalMachines} machines for ${params.operationName} in ${params.departmentName}`,
    params.userEmail
  );

  return { success: true, lotId: lotDocId, lotNumber };
}

// ============================================================================
// 4. UPDATE INDIVIDUAL MACHINE PROGRESS & COMPLIANCE
// ============================================================================

export interface UpdateLotMachineProgressParams {
  lotId: string;
  machineNumber: string;
  status: 'NOT STARTED' | 'IN PROGRESS' | 'COMPLETED' | 'HOLD' | 'DELAYED';
  progress: number; // 0-100%
  remarks?: string;
  delayReason?: string;
  holdReason?: string;
  completedBy?: string;
  userEmail?: string;
}

export async function updateLotMachineProgress(
  params: UpdateLotMachineProgressParams
): Promise<{ success: boolean; machineCompliance: number; lotCompliance: number }> {
  const now = new Date().toISOString();
  const today = now.slice(0, 10);
  const isCompleted = params.status === 'COMPLETED' || params.progress >= 100;
  const cleanProgress = Math.min(100, Math.max(0, params.progress));

  // 1. Fetch and update the target lot machine record
  const lmDocId = `lm_${params.lotId}_${params.machineNumber.replace(/[^a-zA-Z0-9]/g, '_')}`;
  const lmRef = doc(db, 'operation_lot_machines', lmDocId);
  const lmSnap = await getDoc(lmRef);

  let lotMachineData: OperationLotMachine | null = null;
  if (lmSnap.exists()) {
    lotMachineData = lmSnap.data() as OperationLotMachine;
  } else {
    // Try query fallback
    const q = query(
      collection(db, 'operation_lot_machines'),
      where('lotId', '==', params.lotId),
      where('machineNumber', '==', params.machineNumber)
    );
    const snap = await getDocs(q);
    if (!snap.empty) {
      lotMachineData = snap.docs[0].data() as OperationLotMachine;
    }
  }

  if (!lotMachineData) {
    throw new Error(`Execution record for Machine ${params.machineNumber} in lot not found.`);
  }

  const updatedLotMachine: Partial<OperationLotMachine> = {
    status: isCompleted ? 'COMPLETED' : params.status,
    completed: isCompleted,
    progress: isCompleted ? 100 : cleanProgress,
    compliancePercentage: isCompleted ? 100 : cleanProgress,
    remarks: params.remarks || '',
    delayReason: params.delayReason || '',
    holdReason: params.holdReason || '',
    completedBy: isCompleted ? (params.completedBy || params.userEmail || 'Operator') : undefined,
    completedAt: isCompleted ? now : undefined,
    updatedAt: now,
  };

  await updateDoc(doc(db, 'operation_lot_machines', lmDocId), cleanData(updatedLotMachine));
  try {
    await updateDoc(doc(db, 'operationLotMachines', lmDocId), cleanData(updatedLotMachine));
  } catch {}

  // 2. Fetch all machines for this lot and recalculate lot-level stats
  const qAll = query(
    collection(db, 'operation_lot_machines'),
    where('lotId', '==', params.lotId)
  );
  const allSnap = await getDocs(qAll);

  let completedCount = 0;
  let inProgressCount = 0;
  let pendingCount = 0;
  let delayedCount = 0;
  let totalComplianceSum = 0;
  const totalInLot = allSnap.size || 1;

  allSnap.forEach((d) => {
    const data = d.data() as OperationLotMachine;
    const isThis = data.machineNumber === params.machineNumber;
    const finalStat = isThis ? updatedLotMachine.status : data.status;
    const finalProg = isThis ? (updatedLotMachine.progress ?? data.progress) : data.progress;

    if (finalStat === 'COMPLETED' || finalProg >= 100) {
      completedCount++;
      totalComplianceSum += 100;
    } else if (finalStat === 'IN PROGRESS') {
      inProgressCount++;
      totalComplianceSum += finalProg || 50;
    } else if (finalStat === 'DELAYED') {
      delayedCount++;
      totalComplianceSum += finalProg || 0;
    } else {
      pendingCount++;
      totalComplianceSum += finalProg || 0;
    }
  });

  const overallLotCompliance = Math.round(totalComplianceSum / totalInLot);
  const isLotFullyCompleted = completedCount === totalInLot;

  // 3. Update the parent OperationLot document
  const lotUpdate: Partial<OperationLot> = {
    completedMachines: completedCount,
    inProgressMachines: inProgressCount,
    pendingMachines: pendingCount,
    delayedMachines: delayedCount,
    overallCompliance: overallLotCompliance,
    status: isLotFullyCompleted ? 'COMPLETED' : 'ACTIVE',
    updatedAt: now,
    lastUpdateDate: today,
  };

  await updateDoc(doc(db, 'operation_lots', params.lotId), cleanData(lotUpdate));
  try {
    await updateDoc(doc(db, 'operationLots', params.lotId), cleanData(lotUpdate));
  } catch {}

  // 4. Synchronize with Machine Master and Machine Roadmap
  try {
    const mQuery = query(
      collection(db, 'machines'),
      where('machineNumber', '==', params.machineNumber)
    );
    const mSnap = await getDocs(mQuery);
    if (!mSnap.empty) {
      const mDoc = mSnap.docs[0];
      const mData = mDoc.data() as Machine;
      const existingHistory = mData.history || [];

      const histEntry: MachineHistoryEntry = {
        id: `hist_lotup_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        date: today,
        department: lotMachineData.departmentName,
        task: `${lotMachineData.operationName}: ${updatedLotMachine.status} (${cleanProgress}%)`,
        employee: params.completedBy || params.userEmail || 'Operator',
        startDate: today,
        status: isCompleted ? 'Completed' : params.status === 'HOLD' || (params.status as string) === 'REWORK' ? 'REWORK_REQUIRED' : 'In Progress',
        remarks: params.remarks || (isCompleted ? 'Operation Completed' : `Progress updated to ${cleanProgress}%`),
      };

      const machineUpdates: any = {
        currentOperation: lotMachineData.operationName,
        currentOperationStatus: updatedLotMachine.status,
        departmentCompliance: cleanProgress,
        compliancePercentage: cleanProgress,
        lastUpdate: now,
        updatedAt: now,
        history: [histEntry, ...existingHistory],
      };

      if (params.delayReason) {
        machineUpdates.delayReason = params.delayReason;
      }

      await updateDoc(mDoc.ref, cleanData(machineUpdates));
    }
  } catch (err) {
    console.warn(`Notice synchronizing machine ${params.machineNumber} roadmap:`, err);
  }

  // 5. Log Audit
  await logAudit(
    'UPDATE_LOT_MACHINE_PROGRESS',
    'OPERATION_LOTS',
    params.lotId,
    params.machineNumber,
    `Machine ${params.machineNumber} in lot ${params.lotId} updated to ${updatedLotMachine.status} (${cleanProgress}%)`,
    params.userEmail
  );

  return {
    success: true,
    machineCompliance: cleanProgress,
    lotCompliance: overallLotCompliance,
  };
}

// ============================================================================
// 5. SUBMIT DAILY REPORT TO ADMIN
// ============================================================================

export interface SubmitDailyLotReportParams {
  departmentName: string;
  departmentId?: string;
  lotId?: string;
  lotNumber?: string;
  operationName?: string;
  date: string;
  machinesUpdated: number;
  machinesCompletedToday: number;
  machinesInProgress: number;
  pendingAndDelayedMachines: number;
  machineWiseDetails: Array<{
    machineNumber: string;
    model: string;
    status: string;
    progress: number;
    completedOps: number;
    totalOps: number;
    compliancePercentage: number;
    delayReason?: string;
    remarks?: string;
  }>;
  overallDepartmentCompliance: number;
  remarks?: string;
  exceptions?: string;
  submittedBy: string;
  submittedByEmail?: string;
}

export async function submitDailyLotReportToAdmin(
  params: SubmitDailyLotReportParams
): Promise<{ success: boolean; reportId: string; reportNumber: string }> {
  const now = new Date().toISOString();
  const canonicalDeptId = normalizeDepartmentKey(params.departmentId || params.departmentName);
  const dateStr = params.date.replace(/-/g, '');
  const reportNumber = `DLR-${canonicalDeptId}-${dateStr}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
  const reportDocId = `dlr_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

  const report: DailyLotComplianceReport = {
    id: reportDocId,
    reportNumber,
    departmentId: canonicalDeptId,
    departmentName: params.departmentName,
    date: params.date,
    lotId: params.lotId || '',
    lotNumber: params.lotNumber || '',
    operationName: params.operationName || '',
    machinesUpdated: params.machinesUpdated,
    machinesCompletedToday: params.machinesCompletedToday,
    machinesInProgress: params.machinesInProgress,
    pendingAndDelayedMachines: params.pendingAndDelayedMachines,
    machineWiseDetails: params.machineWiseDetails || [],
    overallDepartmentCompliance: params.overallDepartmentCompliance,
    remarks: params.remarks || '',
    exceptions: params.exceptions || '',
    submittedBy: params.submittedBy,
    submittedByEmail: params.submittedByEmail || '',
    submittedAt: now,
    status: 'SUBMITTED',
  };

  // 1. Save snapshot to Firestore
  await setDoc(doc(db, 'daily_lot_reports', reportDocId), cleanData(report));
  try {
    await setDoc(doc(db, 'dailyLotReports', reportDocId), cleanData(report));
  } catch {}

  // 2. Create high priority notification for Admin
  await createNotification({
    recipientDepartment: 'All Departments',
    toDepartment: 'ADMIN',
    fromDepartment: params.departmentName,
    title: `Daily Operation Report: ${params.departmentName} (${params.date})`,
    message: `${params.departmentName} submitted daily compliance report ${reportNumber}. Updated ${params.machinesUpdated} machines, ${params.machinesCompletedToday} completed. Overall Compliance: ${params.overallDepartmentCompliance}%.`,
    type: 'DAILY_REPORT',
    priority: 'Medium',
    status: 'UNREAD',
  });

  // 3. Log Audit
  await logAudit(
    'SUBMIT_DAILY_LOT_REPORT',
    'DAILY_REPORTS',
    reportNumber,
    params.departmentName,
    `Submitted Daily Lot Report ${reportNumber} for ${params.departmentName}. Compliance: ${params.overallDepartmentCompliance}%`,
    params.submittedByEmail || params.submittedBy
  );

  return { success: true, reportId: reportDocId, reportNumber };
}
