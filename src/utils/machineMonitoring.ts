import {
  Department,
  DepartmentHandover,
  DepartmentWork,
  Machine,
  MachineHistoryEntry,
  MachineStatus,
  MonthlyPlan,
  QualityDailyCheck,
  QualityOperation,
  QualityRejection,
  WeeklyPlan,
} from '../types';
import { INITIAL_DEPARTMENTS } from '../constants';

export interface ResolvedMachineInfo {
  machine: Machine;
  machineNumber: string;
  model: string;
  quantity: number;
  priority: string;
  sequenceNumber: number;
  planMonth: string;
  planYear: string;
  planName: string;
  project: string;
  customer: string;
  plannedDate: string;
  actualCompletionDate: string;
  currentDepartment: string;
  currentProcess: string;
  currentWork: string;
  assignedEmployee: string;
  startDate: string;
  dueDate: string;
  progressPercent: number;
  currentStatus: MachineStatus;
  delayDays: number;
  lastUpdate: string;
  nextDepartment: string;
  activeWorkList: DepartmentWork[];
  completedWorkList: DepartmentWork[];
  allWorkList: DepartmentWork[];
  handoverHistory: DepartmentHandover[];
  qualityChecks: QualityDailyCheck[];
  qualityRejections: QualityRejection[];
  workHistory: MachineHistoryEntry[];
  isDelayed: boolean;
  qualitySummary: {
    totalOps: number;
    completedOps: number;
    remainingOps: number;
    acceptedCount: number;
    rejectedCount: number;
    holdCount: number;
    reinspectionPendingCount: number;
    inspectionProgressPct: number;
  };
}

export function getNextDepartment(currentDeptName: string): string {
  if (!currentDeptName) return INITIAL_DEPARTMENTS[0]?.name || '01 Design';
  const cleanCurrent = currentDeptName.trim();
  const idx = INITIAL_DEPARTMENTS.findIndex(
    (d) => d.name === cleanCurrent || cleanCurrent.startsWith(d.code) || d.name.includes(cleanCurrent)
  );
  if (idx >= 0 && idx < INITIAL_DEPARTMENTS.length - 1) {
    return INITIAL_DEPARTMENTS[idx + 1].name;
  }
  if (idx === INITIAL_DEPARTMENTS.length - 1) {
    return 'Packing Complete / Dispatch Ready';
  }
  return 'Next Stage';
}

export function resolveMachineInfo(
  machine: Machine,
  departmentWork: DepartmentWork[],
  handovers: DepartmentHandover[],
  qualityChecks: QualityDailyCheck[],
  qualityRejections: QualityRejection[],
  qualityOps: QualityOperation[] = []
): ResolvedMachineInfo {
  const mNo = (machine.machineNumber || '').trim();

  // Filter related database entities
  const machineWork = departmentWork.filter(
    (w) => (w.machineNumber || '').trim() === mNo
  );
  const activeWork = machineWork.filter(
    (w) => w.status === 'In Progress' || w.status === 'Pending' || w.status === 'Delayed'
  );
  const completedWork = machineWork.filter((w) => w.status === 'Completed');

  // Sort active work: In Progress first, then Delayed, then Pending, then by updated date
  activeWork.sort((a, b) => {
    const score = (status: string) =>
      status === 'In Progress' ? 3 : status === 'Delayed' ? 2 : 1;
    return score(b.status) - score(a.status);
  });

  const machineHandovers = handovers
    .filter((h) => (h.machineNumber || '').trim() === mNo)
    .sort((a, b) => new Date(b.createdAt || b.date).getTime() - new Date(a.createdAt || a.date).getTime());

  const machineQualityChecks = qualityChecks.filter(
    (c) => (c.machineNumber || '').trim() === mNo
  );
  const machineRejections = qualityRejections.filter(
    (r) => (r.machineNumber || '').trim() === mNo
  );

  // Determine current department from latest accepted handover or machine master
  let resolvedDept = machine.currentDepartment || '01 Design';
  if (machineHandovers.length > 0) {
    const latestAccepted = machineHandovers.find((h) => h.status === 'Accepted');
    if (latestAccepted?.receivingDepartment) {
      resolvedDept = latestAccepted.receivingDepartment;
    }
  }

  // Next department
  const nextDept = getNextDepartment(resolvedDept);

  // Active primary work
  const primaryActiveTask = activeWork[0];

  // Current Process
  let resolvedProcess =
    primaryActiveTask?.operationWork ||
    primaryActiveTask?.title ||
    machine.currentProcess ||
    'Stage Operation';

  // If no primary task, check processStages for the resolved department
  if (!primaryActiveTask && machine.processStages) {
    const stage = Object.values(machine.processStages).find(
      (s) => s.departmentName === resolvedDept || resolvedDept.includes(s.departmentCode)
    );
    if (stage) {
      resolvedProcess = `${stage.departmentName} (${stage.status})`;
    }
  }

  // Current Work description
  const resolvedWork = primaryActiveTask
    ? primaryActiveTask.title
    : machine.currentWork || (machineWork[0]?.title ?? 'Standard Production');

  // Assigned Employee
  const assignedEmp =
    primaryActiveTask?.assignedTo ||
    machine.currentEmployee ||
    (machineWork[0]?.assignedTo ?? 'Shop Floor Team');

  // Dates
  const startDate =
    primaryActiveTask?.createdAt?.split('T')[0] ||
    machine.createdAt?.split('T')[0] ||
    '';
  const dueDate =
    primaryActiveTask?.dueDate ||
    machine.plannedDate ||
    '';

  // Delay calculation
  const todayStr = new Date().toISOString().split('T')[0];
  let delayDays = 0;
  if (dueDate && machine.currentStatus !== 'Completed') {
    const dueTime = new Date(dueDate).getTime();
    const todayTime = new Date(todayStr).getTime();
    if (todayTime > dueTime) {
      delayDays = Math.max(0, Math.floor((todayTime - dueTime) / (1000 * 60 * 60 * 24)));
    }
  }

  // Progress Percent
  let progressPct = machine.overallProgressPercent || 0;
  if (primaryActiveTask) {
    if (primaryActiveTask.status === 'Completed') {
      progressPct = Math.max(progressPct, 100);
    } else if (primaryActiveTask.status === 'In Progress') {
      progressPct = Math.max(progressPct, 50);
    }
  }

  // Last Update timestamp
  const timestamps = [
    machine.updatedAt,
    primaryActiveTask?.updatedAt,
    machineHandovers[0]?.updatedAt,
    machineQualityChecks[0]?.updatedAt,
  ].filter(Boolean) as string[];
  timestamps.sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
  const lastUpdate = timestamps[0] || machine.updatedAt || new Date().toISOString();

  // Consolidated History
  const historyEntries: MachineHistoryEntry[] = [...(machine.history || [])];

  // Merge past tasks into history if not duplicate
  machineWork.forEach((w) => {
    const exists = historyEntries.some((h) => h.task === w.title && h.department === w.department);
    if (!exists) {
      historyEntries.push({
        id: `w_${w.id}`,
        date: w.updatedAt?.split('T')[0] || w.createdAt?.split('T')[0] || todayStr,
        department: w.department,
        task: w.title,
        employee: w.assignedTo || 'Operator',
        startDate: w.createdAt?.split('T')[0],
        completionDate: w.status === 'Completed' ? w.updatedAt?.split('T')[0] : undefined,
        progress: w.status === 'Completed' ? 100 : w.status === 'In Progress' ? 50 : 10,
        status: w.status,
        remarks: w.remarks || w.delayReason || '',
      });
    }
  });

  // Merge handovers into history
  machineHandovers.forEach((h) => {
    const exists = historyEntries.some(
      (entry) => entry.task === `Handover to ${h.receivingDepartment}` && entry.date === h.date
    );
    if (!exists) {
      historyEntries.push({
        id: `h_${h.id}`,
        date: h.date || h.createdAt?.split('T')[0] || todayStr,
        department: h.sendingDepartment,
        task: `Handover to ${h.receivingDepartment}`,
        employee: h.acceptedBy || 'Department Lead',
        startDate: h.date,
        completionDate: h.acceptedDate,
        progress: h.status === 'Accepted' ? 100 : 50,
        status: h.status,
        remarks: `Work: ${h.workDescription}. ${h.remarks || ''}`,
      });
    }
  });

  historyEntries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  // Quality Summary
  const matchingOps = qualityOps.filter(
    (o) => !o.machineModel || o.machineModel === machine.model
  );
  const acceptedChecks = machineQualityChecks.filter((c) => c.status === 'Accept');
  const rejectedChecks = machineQualityChecks.filter((c) => c.status === 'Reject');
  const holdChecks = machineQualityChecks.filter((c) => c.status === 'Hold');
  const reinspectionPending = machineRejections.filter(
    (r) => r.status === 'Re-inspection Pending'
  );

  const totalOps = Math.max(matchingOps.length, machineQualityChecks.length);
  const completedOps = acceptedChecks.length;
  const remainingOps = Math.max(0, totalOps - completedOps);
  const inspectionProgressPct =
    totalOps > 0 ? Math.min(100, Math.round((completedOps / totalOps) * 100)) : 0;

  return {
    machine,
    machineNumber: mNo,
    model: machine.model || '-',
    quantity: machine.quantity || 1,
    priority: machine.priority || 'P01',
    sequenceNumber: machine.sequenceNumber || 1,
    planMonth: machine.planMonth || '-',
    planYear: machine.planYear || '2026',
    planName: machine.planName || 'September 2026 Assembly Manufacturing Plan',
    project: machine.project || '-',
    customer: machine.customer || '-',
    plannedDate: machine.plannedDate || '',
    actualCompletionDate: machine.completionDate || '',
    currentDepartment: resolvedDept,
    currentProcess: resolvedProcess,
    currentWork: resolvedWork,
    assignedEmployee: assignedEmp,
    startDate,
    dueDate,
    progressPercent: progressPct,
    currentStatus: machine.currentStatus,
    delayDays,
    lastUpdate,
    nextDepartment: nextDept,
    activeWorkList: activeWork,
    completedWorkList: completedWork,
    allWorkList: machineWork,
    handoverHistory: machineHandovers,
    qualityChecks: machineQualityChecks,
    qualityRejections: machineRejections,
    workHistory: historyEntries,
    isDelayed: delayDays > 0 || machine.currentStatus === 'Delayed' || primaryActiveTask?.status === 'Delayed',
    qualitySummary: {
      totalOps,
      completedOps,
      remainingOps,
      acceptedCount: acceptedChecks.length,
      rejectedCount: rejectedChecks.length,
      holdCount: holdChecks.length,
      reinspectionPendingCount: reinspectionPending.length,
      inspectionProgressPct,
    },
  };
}

export interface DepartmentKpis {
  departmentName: string;
  totalMachines: number;
  totalAssignedWork: number;
  completed: number;
  inProgress: number;
  pending: number;
  delayed: number;
  onHold: number;
  todayTarget: number;
  todayActual: number;
  weeklyTarget: number;
  weeklyActual: number;
  monthlyTarget: number;
  monthlyActual: number;
  achievementPercent: number;
  todayPending: number;
  todayDelayed: number;
  todayNew: number;
  todayCompletedHandovers: number;
}

export function calculateDepartmentKpis(
  deptName: string,
  machines: Machine[],
  departmentWork: DepartmentWork[],
  monthlyPlans: MonthlyPlan[],
  weeklyPlans: WeeklyPlan[],
  handovers: DepartmentHandover[]
): DepartmentKpis {
  const today = new Date().toISOString().split('T')[0];

  // Work scoped to department
  const deptWork = departmentWork.filter((w) => w.department === deptName);
  const totalAssignedWork = deptWork.length;
  const completed = deptWork.filter((w) => w.status === 'Completed').length;
  const inProgress = deptWork.filter((w) => w.status === 'In Progress').length;
  const pending = deptWork.filter((w) => w.status === 'Pending').length;
  const delayed = deptWork.filter((w) => w.status === 'Delayed').length;

  // Machines currently in or having active work in this department
  const assignedMachines = machines.filter(
    (m) =>
      m.currentDepartment === deptName ||
      deptWork.some((w) => w.machineNumber === m.machineNumber)
  );
  const totalMachines = assignedMachines.length;
  const onHold = assignedMachines.filter(
    (m) =>
      m.currentStatus === 'Quality Hold' ||
      (m.currentStatus as string) === 'REWORK_REQUIRED' ||
      m.currentStatus === 'Delayed'
  ).length;

  // Monthly Plans
  const deptMonthly = monthlyPlans.filter((p) => p.department === deptName);
  const monthlyTarget = deptMonthly.reduce(
    (sum, p) => sum + (Number(p.plannedQuantity) || 0),
    0
  );
  const monthlyActual = deptMonthly.reduce(
    (sum, p) => sum + (Number(p.actualQuantity) || 0),
    0
  );
  const achievementPercent =
    monthlyTarget > 0 ? Math.round((monthlyActual / monthlyTarget) * 100) : 0;

  // Weekly Plans
  const deptWeekly = weeklyPlans.filter((p) => p.department === deptName);
  const weeklyTarget = deptWeekly.reduce(
    (sum, p) => sum + (Number(p.plannedQuantity) || 0),
    0
  );
  const weeklyActual = deptWeekly.reduce(
    (sum, p) => sum + (Number(p.actualQuantity) || 0),
    0
  );

  // Today metrics
  const todayTarget = deptWork.filter((w) => w.dueDate === today).length;
  const todayActual = deptWork.filter(
    (w) => w.status === 'Completed' && w.updatedAt?.startsWith(today)
  ).length;
  const todayPending = deptWork.filter(
    (w) => (w.status === 'Pending' || w.status === 'In Progress') && (w.dueDate === today || !w.dueDate)
  ).length;
  const todayDelayed = deptWork.filter(
    (w) => w.status === 'Delayed' || (w.dueDate && w.dueDate < today && w.status !== 'Completed')
  ).length;
  const todayNew = deptWork.filter((w) => w.createdAt?.startsWith(today)).length;

  const todayCompletedHandovers = handovers.filter(
    (h) =>
      (h.receivingDepartment === deptName || h.sendingDepartment === deptName) &&
      h.status === 'Accepted' &&
      (h.acceptedDate === today || h.updatedAt?.startsWith(today))
  ).length;

  return {
    departmentName: deptName,
    totalMachines,
    totalAssignedWork,
    completed,
    inProgress,
    pending,
    delayed,
    onHold,
    todayTarget,
    todayActual,
    weeklyTarget,
    weeklyActual,
    monthlyTarget,
    monthlyActual,
    achievementPercent,
    todayPending,
    todayDelayed,
    todayNew,
    todayCompletedHandovers,
  };
}
