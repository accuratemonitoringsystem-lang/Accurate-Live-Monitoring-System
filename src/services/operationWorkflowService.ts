import { doc, getDoc, updateDoc, addDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import {
  Machine,
  DepartmentWork,
  WorkOperationItem,
  QualityOperation,
  DepartmentHandover,
  MachineProcessStage,
  UserProfile,
  DailyOperationLog,
  DailyWorkHistoryGroup,
} from '../types';
import { INITIAL_DEPARTMENTS, PRODUCTION_DEPARTMENTS } from '../constants';
import { getNextDepartmentInRoute, isDepartmentMatch } from '../utils/departmentUtils';
import { logAudit } from './db';

/**
 * Standard operation templates by department code / name.
 * Used when no custom Quality Operation Master has been configured yet.
 */
export const DEFAULT_DEPARTMENT_OPERATIONS: Record<string, string[]> = {
  'Design': [
    'Design specification review & balloon drawing generation',
    '3D CAD modeling & tolerance stackup verification',
    'BOM release & drawing signoff for production',
  ],
  'Planning': [
    'Material requirement analysis & procurement schedule',
    'Production slot assignment & routing card release',
    'Process sheet verification & tool allocation',
  ],
  'Purchase': [
    'Vendor quotation & PO issuance',
    'Procurement follow-up & expedited dispatch',
    'Inward gate pass verification & GRN booking',
  ],
  'Inward Quality': [
    'Raw material inspection & dimensional check',
    'Bought-out components verification & test certificates check',
    'Material clearance & store tagging',
  ],
  'Store': [
    'Inward material staging & inspection verification',
    'Kit bin allocation & picking against BOM',
    'Part issuing to fabrication & handover clearance',
  ],
  'Metal Shop': [
    'Base frame raw structure inspection',
    'Precision milling & datum surface machining',
    'Tapping, drilling & stress relief thermal treatment',
    'Final dimensional inspection against drawing tolerance',
  ],
  'Granite Shop': [
    'Granite block dimensional inspection & flatness check',
    'Rough lapping & reference surface preparation',
    'Precision insert drilling, epoxy potting & anchor setting',
    'Final surface plate calibration to Grade 00 tolerance',
  ],
  '07A-Lapping-Flatness & Insert Fitment': [
    'Air bearing guide rail precision flatness lapping',
    'Granite reference insert drilling & precision fitment',
    'Co-planarity & flatness tolerance verification',
    'Laser surface flatness check & roughness verification',
  ],
  '07B-Lapping-Y3 & Slot': [
    'Y3-axis guide way precision lapping & finishing',
    'Precision slot alignment, parallel finish & travel check',
    'Y-axis straightness and parallelism verification',
    'Fine abrasive lapping to sub-micron tolerance',
  ],
  '07C-Lapping-RTLT & Top Bottom': [
    'RTLT reference surface precision lapping',
    'Top and bottom master face finish & co-planarity audit',
    'Orthogonal squareness check & optical flat inspection',
    'Surface micro-finish signoff & datum release',
  ],
  'Lapping': [
    'Air bearing guide rail precision lapping',
    'Co-planarity & squareness verification',
    'Interferometric laser surface flatness check',
  ],
  'Sub Assembly': [
    'Sub-assembly frame & bracket mechanical mounting',
    'Bearing guides & ball screw alignment',
    'Pre-fitment torque check & backlash verification',
    'Sub-assembly test run & operational inspection',
  ],
  'Guard Fitment': [
    'Sheet metal covers & bellows dry fitting',
    'Clearance check & noise-free travel verification',
    'Gasket seals & rubber trim fitment',
  ],
  'Paint Shop': [
    'Surface degreasing, sandblasting & primer coating',
    'Anti-corrosive base coat spray application',
    'Polyurethane topcoat finish & thermal oven curing',
    'Paint thickness (DFT) check & visual gloss audit',
  ],
  'Electronics': [
    'Controller cabinet assembly & DIN rail components mounting',
    'Cable harness routing, crimping & ferruling',
    'Power supply & motor drive servo tuning',
    'Safety interlock, emergency stop & limit switch testing',
  ],
  '12 Bridge Assembly': [
    'Bridge structure casting inspection & datum alignment',
    'X-beam & guideway precision mounting & levelling',
    'Z-column carriage dry assembly & drive test',
    'Bridge squareness & repeatability verification',
  ],
  'Assembly': [
    'Main granite bed & structure integration',
    'Linear scale mounting, scanning head alignment & reader calibration',
    'Z-axis counter balance & pneumatics hookup',
    'Motor drive integration & axis travel test',
  ],
  'IT-Computer Inspection': [
    'Workstation OS installation & metrology software licensing',
    'Interface controller communication verification',
    'Diagnostic test script execution & backup generation',
  ],
  'Calibration': [
    'Laser interferometer volumetric error mapping (VEM)',
    'Renishaw ballbar circularity test & angular pitch/yaw verification',
    'Step gauge / ring gauge accuracy verification against ISO 10360',
    'Calibration certificate issuance & traceability report',
  ],
  'Quality': [
    'Full dimensional inspection against balloon drawing',
    'Electrical safety & insulation resistance verification',
    'Customer acceptance test trial & repeatability validation',
    'Final quality audit release stamp & clearance report',
  ],
  'Packing': [
    'Component de-greasing, anti-rust oil preservation',
    'Transit bracket installation & axis mechanical locking',
    'Moisture-barrier vacuum bagging & desiccant placement',
    'Plywood crate enclosure, cushioning & shock-watch sensors',
  ],
};

/**
 * Resolves standard fallback operations for a department
 */
export function getDefaultDepartmentOperations(deptName: string): WorkOperationItem[] {
  const clean = deptName.toLowerCase();
  let matchedKey = Object.keys(DEFAULT_DEPARTMENT_OPERATIONS).find((k) =>
    clean.includes(k.toLowerCase())
  );

  if (!matchedKey) {
    if (clean.includes('flatness') || clean.includes('insert') || clean.includes('07a')) {
      matchedKey = '07A-Lapping-Flatness & Insert Fitment';
    } else if (clean.includes('y3') || clean.includes('slot') || clean.includes('07b')) {
      matchedKey = '07B-Lapping-Y3 & Slot';
    } else if (clean.includes('rtlt') || clean.includes('top bottom') || clean.includes('07c')) {
      matchedKey = '07C-Lapping-RTLT & Top Bottom';
    } else if (clean.includes('bridge')) {
      matchedKey = '12 Bridge Assembly';
    } else if (clean.includes('design')) matchedKey = 'Design';
    else if (clean.includes('plan')) matchedKey = 'Planning';
    else if (clean.includes('purch')) matchedKey = 'Purchase';
    else if (clean.includes('qual') || clean.includes('inward')) matchedKey = 'Inward Quality';
    else if (clean.includes('stor')) matchedKey = 'Store';
    else if (clean.includes('metal')) matchedKey = 'Metal Shop';
    else if (clean.includes('gran')) matchedKey = 'Granite Shop';
    else if (clean.includes('lap')) matchedKey = '07A-Lapping-Flatness & Insert Fitment';
    else if (clean.includes('sub')) matchedKey = 'Sub Assembly';
    else if (clean.includes('guard')) matchedKey = 'Guard Fitment';
    else if (clean.includes('paint')) matchedKey = 'Paint Shop';
    else if (clean.includes('elect')) matchedKey = 'Electronics';
    else if (clean.includes('assem')) matchedKey = 'Assembly';
    else if (clean.includes('comp') || clean.includes('it-')) matchedKey = 'IT-Computer Inspection';
    else if (clean.includes('calib')) matchedKey = 'Calibration';
    else if (clean.includes('pack')) matchedKey = 'Packing';
  }

  const opNames = (matchedKey && DEFAULT_DEPARTMENT_OPERATIONS[matchedKey]) || [
    'Material & Parts Preparation',
    'Manufacturing / Assembly Process',
    'Interstage Inspection & Verification',
    'Department Signoff & Cleaning',
  ];

  return opNames.map((name, index) => ({
    id: `op_${index + 1}`,
    name,
    sequenceNumber: index + 1,
    department: deptName,
    status: 'Not Started',
  }));
}

/**
 * Resolves operations for a machine in a specific department:
 * 1. Checks existing machine operations
 * 2. Merges with Quality Operation Master (by Model/Size and Department)
 * 3. Falls back to default operations if none defined
 */
export function getOperationsForMachineDepartment(
  machine: Machine,
  department: string,
  qualityOps: QualityOperation[] = []
): WorkOperationItem[] {
  const machineModel = (machine.model || machine.machineModel || '').trim();

  // 1. Look for matching operations from the Master for this model & department
  const matchingMasterOps = qualityOps.filter((q) => {
    if (!q.active && q.status === 'Inactive') return false;
    const modelMatch =
      !machineModel ||
      (q.machineModel || '').trim().toLowerCase() === machineModel.toLowerCase() ||
      (q.machineModel || '').toLowerCase().includes(machineModel.toLowerCase()) ||
      machineModel.toLowerCase().includes((q.machineModel || '').toLowerCase());
    const deptMatch = isDepartmentMatch(q.processDepartment, department);
    return modelMatch && deptMatch;
  });

  // Sort master operations by sequence
  matchingMasterOps.sort((a, b) => {
    const numA = Number(a.srNo) || 0;
    const numB = Number(b.srNo) || 0;
    return numA - numB;
  });

  // 2. Existing recorded operations on the machine for this department
  const existingMachineOps = (machine.operations || []).filter(
    (o) => !o.department || isDepartmentMatch(o.department, department)
  );

  if (matchingMasterOps.length > 0) {
    return matchingMasterOps.map((mOp, idx) => {
      const existing = existingMachineOps.find(
        (e) => e.id === mOp.id || e.name.trim().toLowerCase() === mOp.operationName.trim().toLowerCase()
      );
      return {
        id: mOp.id || `mop_${idx + 1}`,
        name: mOp.operationName,
        sequenceNumber: Number(mOp.srNo) || idx + 1,
        partCode: mOp.partCode,
        category: mOp.category,
        department,
        status: existing?.status || 'Not Started',
        completedDate: existing?.completedDate,
        completedBy: existing?.completedBy,
        completedToday: existing?.completedToday,
        remarks: existing?.remarks,
      };
    });
  }

  // If machine already has existing operations for this department, keep them
  if (existingMachineOps.length > 0) {
    return existingMachineOps;
  }

  // Fall back to default department operations
  return getDefaultDepartmentOperations(department);
}

/**
 * Calculates operation stats:
 * - total
 * - completed
 * - todayCompleted
 * - remaining
 * - progressPercent
 * - isComplete
 */
/**
 * Format date string into standard DD-MMM-YYYY display format (e.g. "24-Sep-2026")
 */
export function formatDisplayDate(dateStr?: string): string {
  if (!dateStr) return '';
  try {
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      const year = parts[0];
      const monthIdx = parseInt(parts[1], 10) - 1;
      const day = parts[2].slice(0, 2);
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      if (months[monthIdx]) {
        return `${day}-${months[monthIdx]}-${year}`;
      }
    }
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) {
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      return `${String(d.getDate()).padStart(2, '0')}-${months[d.getMonth()]}-${d.getFullYear()}`;
    }
    return dateStr;
  } catch {
    return dateStr;
  }
}

/**
 * Calculates operation stats:
 * - total: total department operations
 * - completed: all completed operations (previously + today)
 * - previouslyCompleted: completed before today
 * - todayCompleted: newly completed operations on today's date
 * - remaining: total - completed
 * - progressPercent / overallProgressPercent: (completed / total) * 100
 * - todayWorkPercent: (todayCompleted / total) * 100
 * - isComplete: total > 0 && completed === total
 */
export function calculateOperationsProgress(
  operations: WorkOperationItem[],
  todayStr: string = new Date().toISOString().split('T')[0]
) {
  const total = operations.length;
  if (total === 0) {
    return {
      total: 0,
      completed: 0,
      previouslyCompleted: 0,
      todayCompleted: 0,
      remaining: 0,
      progressPercent: 0,
      overallProgressPercent: 0,
      todayWorkPercent: 0,
      isComplete: false,
    };
  }

  const completed = operations.filter((o) => o.status === 'Completed').length;
  const todayCompleted = operations.filter(
    (o) => o.status === 'Completed' && (o.completedToday || o.completedDate === todayStr || o.workDate === todayStr)
  ).length;
  const previouslyCompleted = Math.max(0, completed - todayCompleted);
  const remaining = Math.max(0, total - completed);
  const progressPercent = Math.round((completed / total) * 100);
  const overallProgressPercent = progressPercent;
  const todayWorkPercent = Math.round((todayCompleted / total) * 100);
  const isComplete = total > 0 && completed === total;

  return {
    total,
    completed,
    previouslyCompleted,
    todayCompleted,
    remaining,
    progressPercent,
    overallProgressPercent,
    todayWorkPercent,
    isComplete,
  };
}

/**
 * Fetches all daily operation logs for a machine and department
 */
export async function fetchDailyOperationLogs(
  machineNumber: string,
  department: string
): Promise<DailyOperationLog[]> {
  try {
    const q = query(collection(db, 'daily_operation_logs'), where('machineNumber', '==', machineNumber));
    const snap = await getDocs(q);
    const logs: DailyOperationLog[] = [];
    snap.forEach((d) => {
      const data = d.data() as DailyOperationLog;
      if (isDepartmentMatch(data.department, department)) {
        logs.push({ id: d.id, ...data });
      }
    });
    return logs;
  } catch (err) {
    console.warn('Could not fetch daily_operation_logs:', err);
    return [];
  }
}

/**
 * Gets aggregated daily work history for a machine in a department,
 * grouped by date in descending order (e.g. 24-Sep-2026, 23-Sep-2026...)
 */
export async function getDailyWorkHistoryForMachine(
  machineNumber: string,
  department: string,
  totalDepartmentOperations: number
): Promise<DailyWorkHistoryGroup[]> {
  const logs = await fetchDailyOperationLogs(machineNumber, department);
  const total = Math.max(1, totalDepartmentOperations);

  // Group by work_date
  const groupsByDate: Record<string, DailyOperationLog[]> = {};
  for (const log of logs) {
    const dateKey = log.work_date || (log.completed_at ? log.completed_at.split('T')[0] : 'Unknown');
    if (!groupsByDate[dateKey]) {
      groupsByDate[dateKey] = [];
    }
    groupsByDate[dateKey].push(log);
  }

  // Also check machine_progress_history to ensure no previous dates are missed
  try {
    const histQ = query(
      collection(db, 'machine_progress_history'),
      where('machineNumber', '==', machineNumber)
    );
    const histSnap = await getDocs(histQ);
    histSnap.forEach((docSnap) => {
      const hData = docSnap.data();
      if (isDepartmentMatch(hData.department, department) && hData.date) {
        if (!groupsByDate[hData.date]) {
          groupsByDate[hData.date] = [];
        }
      }
    });
  } catch {}

  const sortedDates = Object.keys(groupsByDate).sort((a, b) => b.localeCompare(a));

  return sortedDates.map((dateStr) => {
    const dateLogs = groupsByDate[dateStr] || [];
    const count = dateLogs.length;
    const dailyWorkPercent = Math.round((count / total) * 100);

    return {
      date: dateStr,
      formattedDate: formatDisplayDate(dateStr),
      completedCount: count,
      dailyWorkPercent,
      operations: dateLogs.map((l) => ({
        operationId: l.operation_id,
        operationName: l.operation_name,
        completedAt: l.completed_at,
        completedBy: l.completed_by,
        remarks: l.remarks,
      })),
    };
  });
}

/**
 * Saves a daily work update based on individual operations:
 * - Writes individual operation completion records to daily_operation_logs
 * - Updates master machine record and department_work with automatic percentages
 * - Automatically calculates:
 *    Today's Work % = (New Operations Completed Today / Total Operations) * 100
 *    Overall Progress % = (Completed Operations / Total Operations) * 100
 * - Records snapshot in machine_progress_history
 */
export async function saveDailyWorkOperations(params: {
  machine: Machine;
  department: string;
  operations: WorkOperationItem[];
  newlyCompletedOpIds: string[];
  remarks?: string;
  delayReason?: string;
  workDoneToday?: string;
  remainingWork?: string;
  expectedDate?: string;
  userProfile?: UserProfile | null;
  sendToAdmin?: boolean;
}): Promise<{
  departmentProgress: number;
  overallProgress: number;
  todayWorkPercent: number;
  completedCount: number;
  remainingCount: number;
  todayCompletedCount: number;
  isComplete: boolean;
}> {
  const {
    machine,
    department,
    operations,
    newlyCompletedOpIds,
    remarks,
    delayReason,
    workDoneToday,
    remainingWork,
    expectedDate,
    userProfile,
    sendToAdmin,
  } = params;

  const now = new Date().toISOString();
  const today = now.split('T')[0];
  const operatorName = userProfile?.displayName || userProfile?.email || 'Department Operator';

  // 1. Resolve department code
  const deptDef = INITIAL_DEPARTMENTS.find((d) => isDepartmentMatch(d.name, department));
  const deptCode = deptDef?.code || '08';

  // 2. Process operations: ensure newly completed operations get tagged with today's date & operator
  const updatedOperations: WorkOperationItem[] = operations.map((op) => {
    if (newlyCompletedOpIds.includes(op.id)) {
      return {
        ...op,
        status: 'Completed',
        completedDate: today,
        completedAt: now,
        workDate: today,
        completedBy: operatorName,
        completedToday: true,
        remarks: remarks || op.remarks,
      };
    }
    // If completed previously, make sure completedToday is false so it cannot be counted twice
    if (op.status === 'Completed' && op.completedDate && op.completedDate !== today) {
      return {
        ...op,
        completedToday: false,
      };
    }
    return op;
  });

  // 3. Compute accurate stats
  const stats = calculateOperationsProgress(updatedOperations, today);
  const deptProgress = stats.overallProgressPercent;
  const todayPercent = stats.todayWorkPercent;
  const is100 = stats.isComplete;

  // 4. Save each newly completed operation to `daily_operation_logs` (live database)
  for (const opId of newlyCompletedOpIds) {
    const op = updatedOperations.find((o) => o.id === opId);
    if (op) {
      try {
        await addDoc(collection(db, 'daily_operation_logs'), {
          machine_id: machine.id,
          machineNumber: machine.machineNumber,
          department_id: deptCode,
          department,
          operation_id: op.id,
          operation_name: op.name || op.operationName || 'Operation',
          status: 'Completed',
          work_date: today,
          completed_at: now,
          completed_by: operatorName,
          remarks: remarks || workDoneToday || '',
          createdAt: now,
        });
      } catch (err) {
        console.warn('Could not write to daily_operation_logs:', err);
      }
    }
  }

  // 5. Resolve master machine document
  let mRef = doc(db, 'machines', machine.id);
  const mSnap = await getDoc(mRef);
  if (!mSnap.exists()) {
    const mQ = query(collection(db, 'machines'), where('machineNumber', '==', machine.machineNumber));
    const mRes = await getDocs(mQ);
    if (!mRes.empty) {
      mRef = mRes.docs[0].ref;
    }
  }

  // 6. Update processStages
  const currentStages: Record<string, MachineProcessStage> = { ...(machine.processStages || {}) };
  currentStages[deptCode] = {
    departmentCode: deptCode,
    departmentName: department,
    progressPercent: deptProgress,
    status: is100 ? 'Completed' : deptProgress > 0 ? 'In Progress' : 'Not Started',
    actualDate: is100 ? today : undefined,
    remarks: remarks || workDoneToday,
    updatedBy: operatorName,
    updatedAt: now,
  };

  // 7. Compute plant-wide roadmap progress
  const stageValues = Object.values(currentStages);
  const totalStages = Math.max(1, stageValues.length);
  const sumProgress = stageValues.reduce((acc, s) => acc + (s.progressPercent || 0), 0);
  const overallMachineProgress = Math.round(sumProgress / Math.max(12, totalStages));

  // 8. Update Master Machine document
  const machineUpdates: Partial<Machine> = {
    progress: deptProgress,
    overallProgressPercent: overallMachineProgress,
    todayWorkPercent: todayPercent,
    completedOpsCount: stats.completed,
    remainingOpsCount: stats.remaining,
    todayCompletedCount: stats.todayCompleted,
    totalOpsCount: stats.total,
    operations: updatedOperations,
    departmentProgress: deptProgress,
    currentStatus: is100 ? 'Ready for Packing' : delayReason ? 'Delayed' : 'In Progress',
    status: is100 ? 'COMPLETED' : delayReason ? 'DELAYED' : 'IN_PROGRESS',
    remarks: remarks || workDoneToday || machine.remarks,
    delayReason: delayReason || undefined,
    expectedCompletionDate: expectedDate || machine.expectedCompletionDate,
    processStages: currentStages,
    updatedAt: now,
  };

  if (is100) {
    machineUpdates.actualCompletionDate = today;
    machineUpdates.handoverStatus = 'READY_FOR_HANDOVER';
  }

  await updateDoc(mRef, machineUpdates as any);

  // 9. Update department_work document
  try {
    const dwQ = query(
      collection(db, 'department_work'),
      where('machineNumber', '==', machine.machineNumber)
    );
    const dwRes = await getDocs(dwQ);
    const matchingWork = dwRes.docs.find((d) => isDepartmentMatch(d.data().department, department));

    const dwPayload = {
      progress: deptProgress,
      todayWorkPercent: todayPercent,
      completedOperationsCount: stats.completed,
      remainingOperationsCount: stats.remaining,
      todayCompletedOperationsCount: stats.todayCompleted,
      totalOperationsCount: stats.total,
      status: is100 ? 'Completed' : delayReason ? 'Delayed' : 'In Progress',
      operations: updatedOperations,
      remarks: remarks || workDoneToday || '',
      updatedAt: now,
    };

    if (matchingWork) {
      await updateDoc(matchingWork.ref, dwPayload as any);
    } else {
      await addDoc(collection(db, 'department_work'), {
        machineNumber: machine.machineNumber,
        machineModel: machine.model || machine.machineModel || 'Standard',
        specification: machine.specification || machine.model || 'Standard',
        department,
        title: `${machine.currentWork || 'Department Work'} - Machine ${machine.machineNumber}`,
        ...dwPayload,
        assignedTo: operatorName,
        assignedDate: today,
        createdAt: now,
      });
    }
  } catch (err) {
    console.warn('Could not sync department_work:', err);
  }

  // 10. Record in machine_progress_history
  try {
    await addDoc(collection(db, 'machine_progress_history'), {
      machineNumber: machine.machineNumber,
      machineId: machine.id,
      department,
      date: today,
      time: new Date().toLocaleTimeString(),
      progressPercent: deptProgress,
      overallProgressPercent: overallMachineProgress,
      todayWorkPercent: todayPercent,
      completedOperationsCount: stats.completed,
      todayCompletedCount: stats.todayCompleted,
      totalOperationsCount: stats.total,
      remainingOperationsCount: stats.remaining,
      workDoneToday: workDoneToday || `${newlyCompletedOpIds.length} operations completed`,
      remainingWork: remainingWork || '',
      remarks: remarks || '',
      issues: delayReason || '',
      updatedBy: operatorName,
      timestamp: now,
    });
  } catch (err) {
    console.warn('Could not record machine_progress_history:', err);
  }

  // 11. Send notification to Admin if requested
  if (sendToAdmin) {
    try {
      await addDoc(collection(db, 'notifications'), {
        recipientDepartment: 'Admin',
        toDepartment: 'Admin',
        fromDepartment: department,
        type: 'PROGRESS_UPDATE',
        title: `Machine ${machine.machineNumber} Progress Update (${deptProgress}%)`,
        message: `Machine ${machine.machineNumber} (${department}): Today's Work ${todayPercent}% (${stats.todayCompleted} ops), Overall Progress ${deptProgress}% (${stats.completed}/${stats.total} ops). ${remarks || ''}`,
        machineNumber: machine.machineNumber,
        priority: 'Normal',
        status: 'UNREAD',
        read: false,
        isRead: false,
        createdAt: now,
      });
    } catch (err) {
      console.warn('Could not dispatch Admin notification:', err);
    }

    await logAudit(
      'SAVE_DAILY_UPDATE',
      'SHOP_FLOOR',
      machine.id,
      machine.machineNumber,
      `Department ${department} completed ${stats.todayCompleted} operations today (${todayPercent}%). Overall: ${deptProgress}% (${stats.completed}/${stats.total}).`,
      userProfile?.email
    );
  }

  return {
    departmentProgress: deptProgress,
    overallProgress: overallMachineProgress,
    todayWorkPercent: todayPercent,
    completedCount: stats.completed,
    remainingCount: stats.remaining,
    todayCompletedCount: stats.todayCompleted,
    isComplete: is100,
  };
}

/**
 * Calculates the overall roadmap and progress % across all plant departments
 */
export function calculateOverallMachineRoadmap(
  machine: Machine,
  departmentWorkList: DepartmentWork[] = []
): {
  stages: {
    departmentCode: string;
    departmentName: string;
    progressPercent: number;
    status: 'Completed' | 'In Progress' | 'Not Started' | 'Delayed' | 'Returned';
    isCurrent: boolean;
  }[];
  overallProgressPercent: number;
  currentDepartmentIndex: number;
} {
  const curDept = machine.currentDepartment || machine.responsibleDepartment || PRODUCTION_DEPARTMENTS[0].name;
  let totalProgSum = 0;
  let stageCount = 0;
  let curIndex = -1;

  // Use PRODUCTION_DEPARTMENTS - Design is independent and strictly excluded from production machine roadmap
  const stages = PRODUCTION_DEPARTMENTS.map((dept, idx) => {
    const isCurrent = isDepartmentMatch(dept.name, curDept);
    if (isCurrent) curIndex = idx;

    // Check existing processStage in machine
    const stageData = machine.processStages?.[dept.code];
    let prog = 0;
    let st: 'Completed' | 'In Progress' | 'Not Started' | 'Delayed' | 'Returned' = 'Not Started';

    if (stageData) {
      prog = stageData.progressPercent || 0;
      if (stageData.status === 'Completed') st = 'Completed';
      else if (stageData.status === 'Delayed') st = 'Delayed';
      else if (stageData.status === 'In Progress') st = 'In Progress';
    } else {
      // Look in departmentWork
      const dw = departmentWorkList.find(
        (w) => w.machineNumber === machine.machineNumber && isDepartmentMatch(w.department, dept.name)
      );
      if (dw) {
        prog = dw.progress || 0;
        if (dw.status === 'Completed' || prog >= 100) st = 'Completed';
        else if (dw.status === 'Delayed') st = 'Delayed';
        else if (dw.status === 'In Progress' || prog > 0) st = 'In Progress';
      } else if (curIndex !== -1 && idx < curIndex) {
        // Preceding departments that have already handed over
        prog = 100;
        st = 'Completed';
      } else if (isCurrent) {
        prog = machine.progress || 0;
        st = prog >= 100 ? 'Completed' : 'In Progress';
      }
    }

    if (isCurrent && machine.status === 'RETURNED') {
      st = 'Returned';
    }

    totalProgSum += prog;
    stageCount++;

    return {
      departmentCode: dept.code,
      departmentName: dept.name,
      progressPercent: prog,
      status: st,
      isCurrent,
    };
  });

  const overallProgressPercent = stageCount > 0 ? Math.round(totalProgSum / stageCount) : 0;

  return {
    stages,
    overallProgressPercent,
    currentDepartmentIndex: curIndex >= 0 ? curIndex : 0,
  };
}

/**
 * Saves updated operations, updates department work, updates machine roadmap,
 * and sends live notification to Admin if requested.
 */
export async function saveDepartmentOperationsProgress(params: {
  machine: Machine;
  department: string;
  operations: WorkOperationItem[];
  remarks?: string;
  delayReason?: string;
  workDoneToday?: string;
  remainingWork?: string;
  userProfile?: UserProfile | null;
  sendToAdmin?: boolean;
}): Promise<{ departmentProgress: number; overallProgress: number }> {
  const { machine, department, operations, remarks, delayReason, workDoneToday, remainingWork, userProfile, sendToAdmin } =
    params;

  const now = new Date().toISOString();
  const today = now.split('T')[0];
  const stats = calculateOperationsProgress(operations, today);
  const deptProgress = stats.progressPercent;
  const is100 = stats.isComplete;

  // 1. Resolve master machine document
  let mRef = doc(db, 'machines', machine.id);
  const mSnap = await getDoc(mRef);
  if (!mSnap.exists()) {
    const mQ = query(collection(db, 'machines'), where('machineNumber', '==', machine.machineNumber));
    const mRes = await getDocs(mQ);
    if (!mRes.empty) {
      mRef = mRes.docs[0].ref;
    }
  }

  // 2. Update machine processStages
  const currentStages: Record<string, MachineProcessStage> = { ...(machine.processStages || {}) };
  const deptDef = INITIAL_DEPARTMENTS.find((d) => isDepartmentMatch(d.name, department));
  const deptCode = deptDef?.code || '08';

  currentStages[deptCode] = {
    departmentCode: deptCode,
    departmentName: department,
    progressPercent: deptProgress,
    status: is100 ? 'Completed' : deptProgress > 0 ? 'In Progress' : 'Not Started',
    actualDate: is100 ? today : undefined,
    remarks: remarks || workDoneToday,
    updatedBy: userProfile?.displayName || userProfile?.email || 'Department Team',
    updatedAt: now,
  };

  // 3. Compute overall machine progress
  const stageValues = Object.values(currentStages);
  const totalStages = Math.max(1, stageValues.length);
  const sumProgress = stageValues.reduce((acc, s) => acc + (s.progressPercent || 0), 0);
  const overallProgress = Math.round(sumProgress / Math.max(12, totalStages));

  // 4. Update Machine document
  const machineUpdates: Partial<Machine> = {
    progress: deptProgress,
    overallProgressPercent: overallProgress,
    operations,
    currentStatus: is100 ? 'Ready for Packing' : delayReason ? 'Delayed' : 'In Progress',
    status: is100 ? 'COMPLETED' : delayReason ? 'DELAYED' : 'IN_PROGRESS',
    remarks: remarks || workDoneToday || machine.remarks,
    delayReason: delayReason || undefined,
    processStages: currentStages,
    updatedAt: now,
  };

  if (is100) {
    machineUpdates.actualCompletionDate = today;
  }

  await updateDoc(mRef, machineUpdates as any);

  // 5. Update department_work document
  try {
    const dwQ = query(
      collection(db, 'department_work'),
      where('machineNumber', '==', machine.machineNumber)
    );
    const dwRes = await getDocs(dwQ);
    const matchingWork = dwRes.docs.find((d) => isDepartmentMatch(d.data().department, department));

    if (matchingWork) {
      await updateDoc(matchingWork.ref, {
        progress: deptProgress,
        status: is100 ? 'Completed' : delayReason ? 'Delayed' : 'In Progress',
        operations,
        remarks: remarks || workDoneToday || '',
        updatedAt: now,
      });
    } else {
      await addDoc(collection(db, 'department_work'), {
        machineNumber: machine.machineNumber,
        machineModel: machine.model || machine.machineModel || 'Standard',
        department,
        title: `${machine.currentWork || 'Department Work'} - Machine ${machine.machineNumber}`,
        progress: deptProgress,
        status: is100 ? 'Completed' : delayReason ? 'Delayed' : 'In Progress',
        operations,
        remarks: remarks || workDoneToday || '',
        assignedTo: userProfile?.displayName || 'Department Team',
        assignedDate: today,
        createdAt: now,
        updatedAt: now,
      });
    }
  } catch (err) {
    console.warn('Could not sync department_work:', err);
  }

  // 6. Record progress history
  try {
    await addDoc(collection(db, 'machine_progress_history'), {
      machineNumber: machine.machineNumber,
      machineId: machine.id,
      department,
      date: today,
      time: new Date().toLocaleTimeString(),
      progressPercent: deptProgress,
      overallProgressPercent: overallProgress,
      completedOperationsCount: stats.completed,
      todayCompletedCount: stats.todayCompleted,
      totalOperationsCount: stats.total,
      remainingOperationsCount: stats.remaining,
      workDoneToday: workDoneToday || '',
      remainingWork: remainingWork || '',
      remarks: remarks || '',
      issues: delayReason || '',
      updatedBy: userProfile?.displayName || userProfile?.email || 'User',
      timestamp: now,
    });
  } catch (err) {
    console.warn('Could not record machine_progress_history:', err);
  }

  // 7. If sendToAdmin requested: dispatch live notification and audit
  if (sendToAdmin) {
    try {
      await addDoc(collection(db, 'notifications'), {
        recipientDepartment: 'Admin',
        toDepartment: 'Admin',
        fromDepartment: department,
        type: 'PROGRESS_UPDATE',
        title: `Machine ${machine.machineNumber} Progress Update (${deptProgress}%)`,
        message: `Machine ${machine.machineNumber} (${department}) progress updated to ${deptProgress}%. ${remarks || workDoneToday || ''}`,
        machineNumber: machine.machineNumber,
        priority: 'Normal',
        status: 'UNREAD',
        read: false,
        isRead: false,
        createdAt: now,
      });
    } catch (err) {
      console.warn('Could not dispatch Admin notification:', err);
    }

    await logAudit(
      'SEND_PROGRESS_TO_ADMIN',
      'SHOP_FLOOR',
      machine.id,
      machine.machineNumber,
      `Department ${department} reported progress ${deptProgress}%. Operations ${stats.completed}/${stats.total}. Remarks: ${remarks || workDoneToday || 'None'}`,
      userProfile?.email
    );
  }

  return { departmentProgress: deptProgress, overallProgress };
}

/**
 * Initiates a formal handover to the next department.
 * Requires 100% completion of current department operations.
 */
export async function initiateDepartmentHandover(params: {
  machine: Machine;
  fromDepartment: string;
  toDepartment?: string;
  remarks: string;
  userProfile?: UserProfile | null;
}) {
  const { machine, fromDepartment, remarks, userProfile } = params;
  const toDept = params.toDepartment || getNextDepartmentInRoute(fromDepartment) || 'Final Inspection';

  const now = new Date().toISOString();
  const today = now.split('T')[0];
  const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const handoverId = `HO-${machine.machineNumber}-${Date.now().toString().slice(-4)}`;

  // 1. Create database handover record
  const handoverData: Partial<DepartmentHandover> = {
    handoverId,
    machineId: machine.id,
    machineNumber: machine.machineNumber,
    modelSize: machine.model || machine.machineModel,
    machineModel: machine.model || machine.machineModel,
    project: machine.project,
    customer: machine.customer,
    fromDepartment,
    sendingDepartment: fromDepartment,
    toDepartment: toDept,
    receivingDepartment: toDept,
    workDescription: `${fromDepartment} 100% complete. Handed over to ${toDept}`,
    status: 'PENDING_ACCEPTANCE',
    sentDate: today,
    handoverDate: today,
    handoverTime: time,
    remarks,
    sentBy: userProfile?.displayName || userProfile?.email || 'Department Team',
    completedProgress: 100,
    createdAt: now,
    updatedAt: now,
  };

  const ref = await addDoc(collection(db, 'department_handovers'), handoverData);
  try {
    // Keep duplicate collection synced
    await addDoc(collection(db, 'departmentHandovers'), handoverData);
  } catch {}

  // 2. Update Machine status and handover reference
  let mRef = doc(db, 'machines', machine.id);
  await updateDoc(mRef, {
    handoverStatus: 'PENDING_ACCEPTANCE',
    nextDepartment: toDept,
    status: 'READY_FOR_HANDOVER',
    currentStatus: 'Ready for Handover',
    updatedAt: now,
  });

  // 3. Dispatch real notification to receiving department
  await addDoc(collection(db, 'notifications'), {
    recipientDepartment: toDept,
    toDepartment: toDept,
    fromDepartment,
    type: 'NEW_HANDOVER',
    title: `New Machine Handover: Machine ${machine.machineNumber}`,
    message: `Machine ${machine.machineNumber} (${machine.model || 'Standard'}) has been handed over from ${fromDepartment} to ${toDept}. Status: Pending Acceptance.`,
    machineNumber: machine.machineNumber,
    linkId: ref.id,
    linkType: 'handover',
    priority: 'High',
    status: 'UNREAD',
    read: false,
    isRead: false,
    createdAt: now,
  });

  // 4. Also notify Admin
  await addDoc(collection(db, 'notifications'), {
    recipientDepartment: 'Admin',
    toDepartment: 'Admin',
    fromDepartment,
    type: 'HANDOVER_SUBMITTED',
    title: `Handover Created: ${machine.machineNumber} (${fromDepartment} → ${toDept})`,
    message: `Machine ${machine.machineNumber} handed over to ${toDept}. Awaiting acceptance. Remarks: ${remarks}`,
    machineNumber: machine.machineNumber,
    priority: 'Normal',
    status: 'UNREAD',
    read: false,
    isRead: false,
    createdAt: now,
  });

  await logAudit(
    'INITIATE_HANDOVER',
    'HANDOVER',
    ref.id,
    machine.machineNumber,
    `Handover ${handoverId} created from ${fromDepartment} to ${toDept}`,
    userProfile?.email
  );

  return ref.id;
}

/**
 * Officially returns/reverses a machine to a previous department for correction.
 * Can be executed by Admin, Quality, or receiving department upon rejection.
 */
export async function returnMachineOfficially(params: {
  machineId: string;
  machineNumber: string;
  currentDepartment: string;
  targetDepartment: string;
  returnReason: string;
  correctiveActionRequired?: string;
  remarks?: string;
  returnedBy?: string;
  userEmail?: string;
}) {
  const {
    machineId,
    machineNumber,
    currentDepartment,
    targetDepartment,
    returnReason,
    correctiveActionRequired,
    remarks,
    returnedBy,
    userEmail,
  } = params;

  if (!returnReason.trim()) {
    throw new Error('Return reason is mandatory.');
  }

  const now = new Date().toISOString();
  const today = now.split('T')[0];

  // 1. Update master machine
  let mRef = doc(db, 'machines', machineId);
  const mSnap = await getDoc(mRef);
  if (!mSnap.exists()) {
    const mQ = query(collection(db, 'machines'), where('machineNumber', '==', machineNumber));
    const mRes = await getDocs(mQ);
    if (!mRes.empty) {
      mRef = mRes.docs[0].ref;
    }
  }

  await updateDoc(mRef, {
    currentDepartment: targetDepartment,
    responsibleDepartment: targetDepartment,
    status: 'RETURNED',
    currentStatus: 'Returned for Correction',
    handoverStatus: 'RETURNED',
    isReturned: true,
    returnReason: returnReason.trim(),
    correctiveAction: correctiveActionRequired?.trim() || 'Correction needed',
    returnedBy: returnedBy || userEmail || 'Quality / Admin',
    returnedAt: now,
    remarks: remarks || `Returned: ${returnReason}`,
    updatedAt: now,
  });

  // 2. Unlock target department_work so it can be updated
  try {
    const dwQ = query(collection(db, 'department_work'), where('machineNumber', '==', machineNumber));
    const dwRes = await getDocs(dwQ);
    const targetDw = dwRes.docs.find((d) => isDepartmentMatch(d.data().department, targetDepartment));
    if (targetDw) {
      await updateDoc(targetDw.ref, {
        status: 'In Progress',
        delayReason: `Returned: ${returnReason}`,
        updatedAt: now,
      });
    }
  } catch (err) {
    console.warn('Could not unlock target department work:', err);
  }

  // 3. Dispatch urgent notification to target department
  await addDoc(collection(db, 'notifications'), {
    recipientDepartment: targetDepartment,
    toDepartment: targetDepartment,
    fromDepartment: currentDepartment,
    type: 'MACHINE_RETURNED',
    title: `⚠️ Machine ${machineNumber} Returned for Correction`,
    message: `Machine ${machineNumber} has been returned to ${targetDepartment}. Reason: ${returnReason}. Corrective Action: ${correctiveActionRequired || 'Rectify issues and complete inspection'}`,
    machineNumber,
    priority: 'Urgent',
    status: 'UNREAD',
    read: false,
    isRead: false,
    createdAt: now,
  });

  // 4. Record in audit logs
  await logAudit(
    'RETURN_MACHINE_FOR_CORRECTION',
    'MACHINE',
    machineId,
    machineNumber,
    `Machine ${machineNumber} returned from ${currentDepartment} to ${targetDepartment}. Reason: ${returnReason}. Corrective Action: ${correctiveActionRequired || 'N/A'}`,
    userEmail
  );
}
