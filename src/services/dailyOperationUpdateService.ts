import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  addDoc,
  updateDoc,
  query,
  where,
  orderBy,
  onSnapshot,
} from 'firebase/firestore';
import { db } from '../firebase';
import {
  Machine,
  DepartmentMachineSize,
  DepartmentPart,
  DepartmentOperation,
  MachineOperationExecution,
  MachineSizeDailyUpdateRecord,
  MachineComplianceSummary,
  DailyOperationResult,
  OperationExecutionStatus,
  MachineProcessStage,
  MachineHistoryEntry,
} from '../types';
import { logAudit, createNotification } from './db';
import { normalizeDepartmentKey, isDepartmentMatch } from '../utils/departmentUtils';
import { INITIAL_DEPARTMENTS } from '../constants';
import { recordBacklogDailyExecution } from './backlogService';

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
// 1. EXTRACT & GET DYNAMIC MACHINE SIZES FOR DEPARTMENT
// ============================================================================

export interface DepartmentMachineSizeOption {
  machineSize: string;
  machineSizeId: string;
  operationsCount: number;
  machinesInDeptCount: number;
}

/**
 * Loads dynamic machine sizes that have configured operations for the selected department.
 * Queries both departmentMachineSizes and departmentOperations.
 */
export async function getDepartmentSizesForDailyUpdate(
  departmentName: string
): Promise<DepartmentMachineSizeOption[]> {
  const normDept = normalizeDepartmentKey(departmentName);

  // 1. Fetch configured operations for this department
  const opsSnap = await getDocs(collection(db, 'departmentOperations'));
  const sizeOpCounts: Record<string, number> = {};

  opsSnap.forEach((d) => {
    const op = d.data() as DepartmentOperation;
    if (
      isDepartmentMatch(op.departmentId, departmentName) ||
      normalizeDepartmentKey(op.departmentId || '') === normDept
    ) {
      const size = (op.machineSizeId || '').trim();
      if (size) {
        sizeOpCounts[size] = (sizeOpCounts[size] || 0) + 1;
      }
    }
  });

  // 2. Fetch machines in this department to count matching machines
  const machinesSnap = await getDocs(collection(db, 'machines'));
  const sizeMachineCounts: Record<string, number> = {};

  machinesSnap.forEach((d) => {
    const m = d.data() as Machine;
    const inDept =
      isDepartmentMatch(m.currentDepartment, departmentName) ||
      isDepartmentMatch(m.responsibleDepartment, departmentName);
    if (inDept) {
      const model = (m.model || m.machineModel || m.size || '').trim();
      // Match against known sizes or store model
      for (const knownSize of Object.keys(sizeOpCounts)) {
        if (
          model.toLowerCase() === knownSize.toLowerCase() ||
          model.toLowerCase().includes(knownSize.toLowerCase()) ||
          knownSize.toLowerCase().includes(model.toLowerCase())
        ) {
          sizeMachineCounts[knownSize] = (sizeMachineCounts[knownSize] || 0) + 1;
        }
      }
    }
  });

  // 3. Also check departmentMachineSizes collection for any defined sizes
  const sizesSnap = await getDocs(collection(db, 'departmentMachineSizes'));
  const knownSizeObjects: Record<string, DepartmentMachineSize> = {};
  sizesSnap.forEach((d) => {
    const s = d.data() as DepartmentMachineSize;
    if (
      isDepartmentMatch(s.departmentId, departmentName) ||
      normalizeDepartmentKey(s.departmentId || '') === normDept
    ) {
      knownSizeObjects[s.machineSize] = s;
    }
  });

  // Combine unique sizes
  const allSizes = new Set([
    ...Object.keys(sizeOpCounts),
    ...Object.keys(knownSizeObjects),
  ]);

  const result: DepartmentMachineSizeOption[] = [];
  allSizes.forEach((size) => {
    const opCount = sizeOpCounts[size] || 0;
    // Show only sizes that have applicable operations for this department
    if (opCount > 0 || knownSizeObjects[size]) {
      result.push({
        machineSize: knownSizeObjects[size]?.machineSize || size,
        machineSizeId: size,
        operationsCount: opCount,
        machinesInDeptCount: sizeMachineCounts[size] || 0,
      });
    }
  });

  // Sort numerically or alphabetically
  result.sort((a, b) =>
    a.machineSize.localeCompare(b.machineSize, undefined, { numeric: true })
  );

  return result;
}

// ============================================================================
// 2. GET PARTS FOR SELECTED MACHINE SIZE
// ============================================================================

export interface DepartmentPartOption {
  partId: string;
  partName: string;
  operationsCount: number;
}

export async function getDepartmentPartsForSize(
  departmentName: string,
  machineSize: string
): Promise<DepartmentPartOption[]> {
  const normDept = normalizeDepartmentKey(departmentName);
  const normSize = machineSize.trim().toLowerCase();

  // Query parts collection
  const partsSnap = await getDocs(collection(db, 'departmentParts'));
  const partsList: DepartmentPartOption[] = [];
  const seenParts = new Set<string>();

  partsSnap.forEach((d) => {
    const p = d.data() as DepartmentPart;
    const deptMatch =
      isDepartmentMatch(p.departmentId, departmentName) ||
      normalizeDepartmentKey(p.departmentId || '') === normDept;
    const sizeMatch =
      !p.machineSizeId ||
      p.machineSizeId.trim().toLowerCase() === normSize ||
      normSize.includes(p.machineSizeId.trim().toLowerCase());

    if (deptMatch && sizeMatch && !seenParts.has(p.partId)) {
      seenParts.add(p.partId);
      partsList.push({
        partId: p.partId,
        partName: p.partName,
        operationsCount: 0,
      });
    }
  });

  // Also query operations to see if any parts are used directly in operations
  const opsSnap = await getDocs(collection(db, 'departmentOperations'));
  const partOpCounts: Record<string, number> = {};

  opsSnap.forEach((d) => {
    const op = d.data() as DepartmentOperation;
    const deptMatch =
      isDepartmentMatch(op.departmentId, departmentName) ||
      normalizeDepartmentKey(op.departmentId || '') === normDept;
    const sizeMatch =
      !op.machineSizeId ||
      op.machineSizeId.trim().toLowerCase() === normSize ||
      normSize.includes(op.machineSizeId.trim().toLowerCase());

    if (deptMatch && sizeMatch && op.partId) {
      partOpCounts[op.partId] = (partOpCounts[op.partId] || 0) + 1;
      if (!seenParts.has(op.partId)) {
        seenParts.add(op.partId);
        partsList.push({
          partId: op.partId,
          partName: op.partId, // fallback to partId if name not found
          operationsCount: 0,
        });
      }
    }
  });

  // Update operationsCount
  partsList.forEach((p) => {
    p.operationsCount = partOpCounts[p.partId] || 0;
  });

  partsList.sort((a, b) => a.partName.localeCompare(b.partName));
  return partsList;
}

// ============================================================================
// 3. GET OPERATIONS FOR SELECTED MACHINE SIZE & PART
// ============================================================================

export async function getDepartmentOperationsForSize(
  departmentName: string,
  machineSize: string,
  partId?: string
): Promise<DepartmentOperation[]> {
  const normDept = normalizeDepartmentKey(departmentName);
  const normSize = machineSize.trim().toLowerCase();

  const opsSnap = await getDocs(collection(db, 'departmentOperations'));
  const opsList: DepartmentOperation[] = [];

  opsSnap.forEach((d) => {
    const op = { id: d.id, ...d.data() } as DepartmentOperation;
    const deptMatch =
      isDepartmentMatch(op.departmentId, departmentName) ||
      normalizeDepartmentKey(op.departmentId || '') === normDept;

    const sizeMatch =
      !op.machineSizeId ||
      op.machineSizeId.trim().toLowerCase() === normSize ||
      normSize.includes(op.machineSizeId.trim().toLowerCase());

    const partMatch = !partId || op.partId === partId;

    if (deptMatch && sizeMatch && partMatch && op.active !== false) {
      opsList.push(op);
    }
  });

  opsList.sort((a, b) => (a.sequence || 0) - (b.sequence || 0));
  return opsList;
}

// ============================================================================
// 4. GET MATCHING & ELIGIBLE MACHINES WITH STATUS & PREVIOUS COMPLETION
// ============================================================================

export interface EligibleMachineForDailyUpdate {
  machine: Machine;
  eligible: boolean;
  ineligibilityReason?: string;
  operationStatus: 'NOT STARTED' | 'IN PROGRESS' | 'COMPLETED' | 'HOLD' | 'DELAYED';
  previouslyCompleted: boolean;
  previouslyCompletedAt?: string;
  previouslyCompletedBy?: string;
  lastRemarks?: string;
  currentCompliance: number;
}

export async function getEligibleMachinesForDailyUpdate(
  departmentName: string,
  machineSize: string,
  operationId: string
): Promise<EligibleMachineForDailyUpdate[]> {
  const normDept = normalizeDepartmentKey(departmentName);
  const normSize = machineSize.trim().toLowerCase();

  // 1. Fetch all machines
  const machinesSnap = await getDocs(collection(db, 'machines'));

  // 2. Fetch existing executions for this department + operation
  const execSnap = await getDocs(collection(db, 'machineOperationExecution'));
  const executionMap: Record<string, MachineOperationExecution> = {};

  execSnap.forEach((d) => {
    const exec = d.data() as MachineOperationExecution;
    const deptMatch =
      isDepartmentMatch(exec.departmentId, departmentName) ||
      normalizeDepartmentKey(exec.departmentId || '') === normDept;

    if (deptMatch && exec.operationId === operationId) {
      executionMap[exec.machineNumber.trim()] = exec;
    }
  });

  const results: EligibleMachineForDailyUpdate[] = [];

  machinesSnap.forEach((d) => {
    const m = { id: d.id, ...d.data() } as Machine;
    const model = (m.model || m.machineModel || m.size || '').trim();
    const normModel = model.toLowerCase();

    // Check size match
    const sizeMatches =
      !normSize ||
      normModel === normSize ||
      normModel.includes(normSize) ||
      normSize.includes(normModel);

    // Check department ownership / assignment
    const isInDept =
      isDepartmentMatch(m.currentDepartment, departmentName) ||
      isDepartmentMatch(m.responsibleDepartment, departmentName);

    const exec = executionMap[m.machineNumber.trim()];
    const isCompleted = exec?.completed === true || exec?.status === 'COMPLETED';

    const isAwaitingAcceptance =
      m.handoverStatus === 'AWAITING_ACCEPTANCE' ||
      m.status === 'AWAITING_ACCEPTANCE' ||
      m.currentStatus === 'Awaiting Acceptance';

    if (!sizeMatches) {
      results.push({
        machine: m,
        eligible: false,
        ineligibilityReason: `Size mismatch (${model || 'Unknown'} vs ${machineSize})`,
        operationStatus: 'NOT STARTED',
        previouslyCompleted: false,
        currentCompliance: m.departmentCompliance || m.compliancePercentage || (m.progress || 0),
      });
    } else if (!isInDept) {
      results.push({
        machine: m,
        eligible: false,
        ineligibilityReason: `Assigned to ${m.currentDepartment || 'another department'}`,
        operationStatus: exec ? (exec.status as any) : 'NOT STARTED',
        previouslyCompleted: isCompleted,
        currentCompliance: m.departmentCompliance || m.compliancePercentage || (m.progress || 0),
      });
    } else if (isAwaitingAcceptance) {
      results.push({
        machine: m,
        eligible: false,
        ineligibilityReason: 'Handover submitted; awaiting receiving department acceptance',
        operationStatus: 'HOLD',
        previouslyCompleted: isCompleted,
        currentCompliance: m.departmentCompliance || m.compliancePercentage || (m.progress || 0),
      });
    } else if (isCompleted) {
      results.push({
        machine: m,
        eligible: false,
        ineligibilityReason: 'Operation already completed',
        operationStatus: 'COMPLETED',
        previouslyCompleted: true,
        previouslyCompletedAt: exec?.completedAt || exec?.lastUpdatedAt,
        previouslyCompletedBy: exec?.completedBy,
        lastRemarks: exec?.remarks,
        currentCompliance: m.departmentCompliance || m.compliancePercentage || (m.progress || 0),
      });
    } else {
      // Fully eligible for execution
      results.push({
        machine: m,
        eligible: true,
        operationStatus: exec
          ? (exec.status as any)
          : 'NOT STARTED',
        previouslyCompleted: false,
        previouslyCompletedAt: exec?.completedAt || exec?.lastUpdatedAt,
        previouslyCompletedBy: exec?.completedBy,
        lastRemarks: exec?.remarks,
        currentCompliance: m.departmentCompliance || m.compliancePercentage || (m.progress || 0),
      });
    }
  });

  // Sort: Eligible first, then by Machine Number
  results.sort((a, b) => {
    if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
    return a.machine.machineNumber.localeCompare(b.machine.machineNumber, undefined, { numeric: true });
  });

  return results;
}

// ============================================================================
// 5. SUBMIT MACHINE-SIZE-WISE DAILY OPERATION UPDATE (BULK / BATCH)
// ============================================================================

export interface SubmitMachineSizeDailyUpdateParams {
  departmentName: string;
  departmentId?: string;
  machineSize: string;
  machineSizeId?: string;
  partId?: string;
  partName?: string;
  operationId: string;
  operationName: string;
  operationCode?: string;
  updateDate: string; // YYYY-MM-DD
  employeeName: string;
  employeeEmail?: string;
  operationResult: 'Completed' | 'In Progress' | 'On Hold' | 'Delayed';
  selectedMachines: Array<{
    machineNumber: string;
    model: string;
    project?: string;
    customer?: string;
    outcome?: 'Completed' | 'In Progress' | 'On Hold' | 'Delayed';
    delayReason?: string;
    remarks?: string;
  }>;
  actualQuantity?: number;
  remarks?: string;
  attachmentUrl?: string;
}

export async function submitMachineSizeDailyUpdate(
  params: SubmitMachineSizeDailyUpdateParams
): Promise<{
  updateId: string;
  totalSelected: number;
  completedCount: number;
  inProgressCount: number;
  onHoldCount: number;
  delayedCount: number;
}> {
  const {
    departmentName,
    machineSize,
    machineSizeId,
    partId,
    partName,
    operationId,
    operationName,
    operationCode,
    updateDate,
    employeeName,
    employeeEmail,
    operationResult,
    selectedMachines,
    actualQuantity,
    remarks,
    attachmentUrl,
  } = params;

  if (!departmentName) {
    throw new Error('Department is required.');
  }
  if (!machineSize) {
    throw new Error('Machine Size is required.');
  }
  if (!operationId || !operationName) {
    throw new Error('Operation is required.');
  }
  if (selectedMachines.length === 0) {
    throw new Error('Please select at least one machine for this update.');
  }

  const now = new Date().toISOString();
  const dateCompact = updateDate.replace(/-/g, '');
  const randSuffix = Math.floor(1000 + Math.random() * 9000);
  const updateId = `MSU-${dateCompact}-${randSuffix}`;
  const normDept = normalizeDepartmentKey(departmentName);

  // 1. Calculate outcome counts
  let completedCount = 0;
  let inProgressCount = 0;
  let onHoldCount = 0;
  let delayedCount = 0;

  const completedMachineNumbers: string[] = [];
  const selectedMachineNumbers: string[] = [];

  for (const m of selectedMachines) {
    selectedMachineNumbers.push(m.machineNumber);
    const outcome = m.outcome || operationResult;
    if (outcome === 'Completed') {
      completedCount++;
      completedMachineNumbers.push(m.machineNumber);
    } else if (outcome === 'In Progress') {
      inProgressCount++;
    } else if (outcome === 'On Hold') {
      onHoldCount++;
    } else if (outcome === 'Delayed') {
      delayedCount++;
    }
  }

  // 2. Query all applicable operations for this machine size in this department
  // to compute exact machine-level compliance:
  // Department Operation Compliance % = Completed Applicable Operations ÷ Total Applicable Operations × 100
  const allDeptOpsSnap = await getDocs(collection(db, 'departmentOperations'));
  const applicableOpsForSize: DepartmentOperation[] = [];
  const normSize = machineSize.trim().toLowerCase();

  allDeptOpsSnap.forEach((d) => {
    const op = { id: d.id, ...d.data() } as DepartmentOperation;
    const deptMatch =
      isDepartmentMatch(op.departmentId, departmentName) ||
      normalizeDepartmentKey(op.departmentId || '') === normDept;
    const sizeMatch =
      !op.machineSizeId ||
      op.machineSizeId.trim().toLowerCase() === normSize ||
      normSize.includes(op.machineSizeId.trim().toLowerCase());

    if (deptMatch && sizeMatch && op.active !== false) {
      applicableOpsForSize.push(op);
    }
  });

  const totalApplicableOpsCount = Math.max(1, applicableOpsForSize.length);

  // 3. Query existing executions for all selected machines to get previous completions
  const allExecSnap = await getDocs(collection(db, 'machineOperationExecution'));
  const machineCompletedOpsMap: Record<string, Set<string>> = {};

  allExecSnap.forEach((d) => {
    const exec = d.data() as MachineOperationExecution;
    const deptMatch =
      isDepartmentMatch(exec.departmentId, departmentName) ||
      normalizeDepartmentKey(exec.departmentId || '') === normDept;

    if (deptMatch && (exec.completed === true || exec.status === 'COMPLETED')) {
      const mNo = exec.machineNumber.trim();
      if (!machineCompletedOpsMap[mNo]) {
        machineCompletedOpsMap[mNo] = new Set<string>();
      }
      machineCompletedOpsMap[mNo].add(exec.operationId);
    }
  });

  // 4. Process each selected machine
  const machineWiseOutcomes: MachineSizeDailyUpdateRecord['machineWiseOutcomes'] = [];

  for (const item of selectedMachines) {
    const outcome = item.outcome || operationResult;
    const isDone = outcome === 'Completed';
    const progress = isDone ? 100 : outcome === 'In Progress' ? 50 : 0;
    const mNo = item.machineNumber.trim();

    // Track completed ops for compliance calculation
    if (!machineCompletedOpsMap[mNo]) {
      machineCompletedOpsMap[mNo] = new Set<string>();
    }
    if (isDone) {
      machineCompletedOpsMap[mNo].add(operationId);
    }

    // Calculate: Completed Applicable Operations / Total Applicable Operations * 100
    const completedOpsSet = machineCompletedOpsMap[mNo];
    let matchingCompletedOps = 0;
    for (const appOp of applicableOpsForSize) {
      if (completedOpsSet.has(appOp.operationId)) {
        matchingCompletedOps++;
      }
    }
    const compliancePercent = Math.min(
      100,
      Math.round((matchingCompletedOps / totalApplicableOpsCount) * 100)
    );

    machineWiseOutcomes.push({
      machineNumber: mNo,
      model: item.model,
      project: item.project,
      customer: item.customer,
      outcome,
      progress,
      delayReason: item.delayReason,
      remarks: item.remarks || remarks,
      departmentComplianceAfter: compliancePercent,
    });

    // 4a. Write to dailyOperationResults
    const dailyResult: Omit<DailyOperationResult, 'id'> = {
      updateId,
      machineNumber: mNo,
      machineSize,
      departmentId: departmentName,
      operationId,
      operationName,
      partId: partId || '',
      partName: partName || '',
      status: isDone
        ? 'COMPLETED'
        : outcome === 'On Hold'
        ? 'HOLD'
        : outcome === 'Delayed'
        ? 'HOLD'
        : 'IN PROGRESS',
      completed: isDone,
      remarks: item.remarks || remarks || '',
      holdReason: item.delayReason || '',
      employeeName,
      date: updateDate,
      createdAt: now,
    };
    await addDoc(collection(db, 'dailyOperationResults'), cleanData(dailyResult));

    // 4b. Upsert machineOperationExecution
    const execDocId = `${mNo}_${normDept.replace(/[^a-zA-Z0-9]/g, '_')}_${operationId}`;
    const execRef = doc(db, 'machineOperationExecution', execDocId);

    const execData: MachineOperationExecution = {
      machineNumber: mNo,
      machineSize,
      departmentId: departmentName,
      partId: partId || '',
      partName: partName || '',
      operationId,
      operationName,
      status: isDone
        ? 'COMPLETED'
        : outcome === 'On Hold'
        ? 'HOLD'
        : outcome === 'Delayed'
        ? 'HOLD'
        : 'IN PROGRESS',
      completed: isDone,
      completedBy: isDone ? employeeName : undefined,
      completedAt: isDone ? now : undefined,
      holdReason: item.delayReason || '',
      remarks: item.remarks || remarks || '',
      weight: 1,
      lastUpdatedAt: now,
    };
    await setDoc(execRef, cleanData(execData), { merge: true });

    // 4c. Update Machine record & History
    try {
      const mQ = query(
        collection(db, 'machines'),
        where('machineNumber', '==', mNo)
      );
      const mSnap = await getDocs(mQ);

      for (const mDoc of mSnap.docs) {
        const mData = mDoc.data() as Machine;
        const existingHistory = mData.history || [];

        const histEntry: MachineHistoryEntry = {
          id: `HIST-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          date: updateDate,
          department: departmentName,
          task: `${operationName} (${outcome} - ${progress}%)`,
          employee: employeeName,
          startDate: updateDate,
          completionDate: isDone ? updateDate : undefined,
          status: isDone ? 'Completed' : outcome === 'Delayed' ? 'Delayed' : 'In Progress',
          progress: compliancePercent,
          remarks: item.remarks || remarks || (isDone ? 'Operation Completed' : outcome),
          delayReason: item.delayReason,
        };

        // Update process stages for roadmap
        const currentStages = { ...(mData.processStages || {}) };
        const deptDef = INITIAL_DEPARTMENTS.find((d) => isDepartmentMatch(d.name, departmentName));
        const deptCode = deptDef?.code || '08';

        currentStages[deptCode] = {
          departmentCode: deptCode,
          departmentName,
          progressPercent: compliancePercent,
          status: compliancePercent >= 100 ? 'Completed' : compliancePercent > 0 ? 'In Progress' : 'Pending',
          actualDate: compliancePercent >= 100 ? updateDate : undefined,
          remarks: item.remarks || remarks || `${matchingCompletedOps}/${totalApplicableOpsCount} ops completed`,
          updatedBy: employeeName,
          updatedAt: now,
        };

        // Recalculate overall machine journey completion across all applicable route stages (Requirement 4)
        const allStages = Object.values(currentStages);
        const applicableStages = allStages.filter((s: any) => s.status !== 'N/A');
        const overallJourneyPercent = applicableStages.length > 0
          ? Math.round(applicableStages.reduce((acc: number, s: any) => acc + (s.progressPercent || 0), 0) / applicableStages.length)
          : 0;

        const machineUpdates: Partial<Machine> = {
          currentOperation: operationName,
          currentOperationStatus: outcome,
          departmentCompliance: compliancePercent,
          compliancePercentage: compliancePercent,
          todayCompletedCount: matchingCompletedOps,
          totalOpsCount: totalApplicableOpsCount,
          lastUpdateDate: updateDate,
          lastUpdated: now,
          remarks: item.remarks || remarks || mData.remarks,
          processStages: currentStages,
          overallProgressPercent: overallJourneyPercent,
          progress: overallJourneyPercent,
          history: [histEntry, ...existingHistory],
          lastOperationUpdateTime: now,
          updatedAt: now,
        };

        if (!mData.firstOperationExecutionTime) {
          machineUpdates.firstOperationExecutionTime = now;
        }

        if (compliancePercent >= 100) {
          machineUpdates.departmentWorkCompletionTime = now;
        }

        if (item.delayReason) {
          machineUpdates.delayReason = item.delayReason;
        }

        await updateDoc(mDoc.ref, cleanData(machineUpdates));

        // Update corresponding department_work progress
        try {
          const dwQ = query(
            collection(db, 'department_work'),
            where('machineNumber', '==', mNo),
            where('department', '==', departmentName)
          );
          const dwDocs = await getDocs(dwQ);
          for (const dwDoc of dwDocs.docs) {
            await updateDoc(dwDoc.ref, {
              progress: compliancePercent,
              status: compliancePercent >= 100 ? 'COMPLETED' : 'IN_PROGRESS',
              lastUpdateDate: updateDate,
              updatedAt: now,
            });
          }
        } catch {}

        // Automatically reconcile backlog items if this machine has outstanding backlog work (Requirement 9)
        if (isDone) {
          await recordBacklogDailyExecution(mNo, departmentName, operationName, 1, employeeEmail);
        }
      }
    } catch (err) {
      console.warn(`Notice updating machine ${mNo} master document:`, err);
    }
  }

  // 5. Save master DailyOperationUpdate summary
  const summaryRecord: Omit<MachineSizeDailyUpdateRecord, 'id'> = {
    updateId,
    departmentName,
    departmentId: departmentName,
    date: updateDate,
    machineSize,
    machineSizeId: machineSizeId || machineSize,
    partId: partId || '',
    partName: partName || '',
    operationId,
    operationName,
    operationCode: operationCode || '',
    employeeName,
    employeeEmail: employeeEmail || '',
    totalEligible: selectedMachines.length, // total processed
    totalSelected: selectedMachines.length,
    completedTodayCount: completedCount,
    inProgressCount,
    onHoldCount,
    delayedCount,
    notSelectedCount: 0,
    selectedMachineNumbers,
    completedMachineNumbers,
    operationResult,
    actualQuantity: typeof actualQuantity === 'number' ? actualQuantity : undefined,
    remarks: remarks || '',
    attachmentUrl: attachmentUrl || '',
    machineWiseOutcomes,
    createdAt: now,
  };

  await addDoc(collection(db, 'dailyOperationUpdates'), cleanData(summaryRecord));

  // 6. Notify Admin
  try {
    await createNotification({
      title: 'Daily Operation Update Submitted',
      message: `${departmentName}: ${operationName} (${machineSize}) - ${completedCount} machine${completedCount !== 1 ? 's' : ''} completed today by ${employeeName}. Machines: ${completedMachineNumbers.join(', ')}`,
      type: 'WORK_UPDATE',
      priority: delayedCount > 0 ? 'HIGH' : 'NORMAL',
      department: departmentName,
      recipientRole: 'ADMIN',
      linkTo: 'daily_worksheet',
    });
  } catch (notifErr) {
    console.warn('Notice creating admin notification for daily update:', notifErr);
  }

  // 7. Log Audit
  await logAudit(
    'SUBMIT_DAILY_OPERATION_UPDATE',
    'DAILY_UPDATES',
    updateId,
    `${departmentName} - ${operationName}`,
    `Submitted daily operation update for ${machineSize} - ${completedCount} machines completed, ${inProgressCount} in progress, ${delayedCount} delayed.`,
    employeeEmail
  );

  return {
    updateId,
    totalSelected: selectedMachines.length,
    completedCount,
    inProgressCount,
    onHoldCount,
    delayedCount,
  };
}

// ============================================================================
// 6. REAL-TIME SUBSCRIPTIONS
// ============================================================================

/**
 * Subscribes to daily operation updates for a specific department (or all departments for Admin)
 */
export function subscribeDepartmentDailyUpdates(
  departmentName: string,
  callback: (records: MachineSizeDailyUpdateRecord[]) => void
) {
  const normDept = normalizeDepartmentKey(departmentName);
  const q = query(collection(db, 'dailyOperationUpdates'));

  return onSnapshot(
    q,
    (snapshot) => {
      const list: MachineSizeDailyUpdateRecord[] = [];
      snapshot.forEach((d) => {
        const item = { id: d.id, ...d.data() } as MachineSizeDailyUpdateRecord;
        if (
          !departmentName ||
          departmentName === 'All Departments' ||
          isDepartmentMatch(item.departmentName, departmentName) ||
          normalizeDepartmentKey(item.departmentId || '') === normDept
        ) {
          list.push(item);
        }
      });
      list.sort(
        (a, b) => new Date(b.createdAt || '').getTime() - new Date(a.createdAt || '').getTime()
      );
      callback(list);
    },
    (err) => {
      console.warn('Notice listening to dailyOperationUpdates:', err);
      callback([]);
    }
  );
}

/**
 * Subscribes to live machine-wise compliance list for machines in a department
 */
export function subscribeDepartmentMachineCompliance(
  departmentName: string,
  callback: (summaries: MachineComplianceSummary[]) => void
) {
  const normDept = normalizeDepartmentKey(departmentName);
  const q = query(collection(db, 'machines'));

  return onSnapshot(
    q,
    async (snapshot) => {
      const summaries: MachineComplianceSummary[] = [];

      snapshot.forEach((d) => {
        const m = { id: d.id, ...d.data() } as Machine;
        const inDept =
          !departmentName ||
          departmentName === 'All Departments' ||
          isDepartmentMatch(m.currentDepartment, departmentName) ||
          isDepartmentMatch(m.responsibleDepartment, departmentName);

        if (inDept) {
          const completedOps = m.todayCompletedCount || 0;
          const totalOps = m.totalOpsCount || 0;
          const remainingOps = Math.max(0, totalOps - completedOps);

          summaries.push({
            machineNumber: m.machineNumber,
            machineId: m.id,
            model: m.model || m.machineModel || 'Standard',
            machineSize: m.size || m.model || '',
            project: m.project,
            customer: m.customer,
            currentDepartment: m.currentDepartment,
            completedOpsCount: completedOps,
            totalApplicableOpsCount: totalOps,
            remainingOpsCount: remainingOps,
            departmentCompliance: m.departmentCompliance || m.compliancePercentage || (m.progress || 0),
            currentOperationStatus: m.currentOperationStatus || m.currentStatus || 'Not Started',
            currentOperationName: m.currentOperation,
            lastUpdateDate: m.lastUpdateDate || m.lastUpdated,
            lastUpdatedBy: m.responsibleEmployee,
          });
        }
      });

      summaries.sort((a, b) =>
        a.machineNumber.localeCompare(b.machineNumber, undefined, { numeric: true })
      );

      callback(summaries);
    },
    (err) => {
      console.warn('Notice listening to machines for compliance:', err);
      callback([]);
    }
  );
}
