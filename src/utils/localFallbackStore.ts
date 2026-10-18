import {
  Department,
  Machine,
  MonthlyPlan,
  YearlyPlan,
  WeeklyPlan,
  DepartmentWork,
  DepartmentHandover,
  QualityOperation,
  QualityRejection,
  QualityDailyCheck,
  SystemNotification,
  AuditLogEntry,
  RoadmapItem,
  BacklogItem,
} from '../types';
import { INITIAL_DEPARTMENTS } from '../constants';

// 25 CMM October 2026 Master Definition
export const SEED_OCTOBER_2026_MACHINES = [
  { srNo: 1, machineNumber: '2571', size: '564', model: 'ACCURA 564', priority: 'P01', dept: '02 Planning', nextDept: '03 Purchase' },
  { srNo: 2, machineNumber: '2572', size: '10158', model: 'ACCURA 10158', priority: 'P02', dept: '02 Planning', nextDept: '03 Purchase' },
  { srNo: 3, machineNumber: '2573', size: '8106', model: 'ACCURA 8106', priority: 'P03', dept: '02 Planning', nextDept: '03 Purchase' },
  { srNo: 4, machineNumber: '2574', size: '685', model: 'ACCURA 685', priority: 'P04', dept: '02 Planning', nextDept: '03 Purchase' },
  { srNo: 5, machineNumber: '2575', size: '10208', model: 'ACCURA 10208', priority: 'P05', dept: '02 Planning', nextDept: '03 Purchase' },
  { srNo: 6, machineNumber: '2576', size: '8106', model: 'ACCURA 8106', priority: 'P06', dept: '02 Planning', nextDept: '03 Purchase' },
  { srNo: 7, machineNumber: '2577', size: '564', model: 'ACCURA 564', priority: 'P07', dept: '02 Planning', nextDept: '03 Purchase' },
  { srNo: 8, machineNumber: '2578', size: '8156', model: 'ACCURA 8156', priority: 'P08', dept: '02 Planning', nextDept: '03 Purchase' },
  { srNo: 9, machineNumber: '2579', size: '8106', model: 'ACCURA 8106', priority: 'P09', dept: '02 Planning', nextDept: '03 Purchase' },
  { srNo: 10, machineNumber: '2580', size: '685', model: 'ACCURA 685', priority: 'P10', dept: '02 Planning', nextDept: '03 Purchase' },
  { srNo: 11, machineNumber: '2581', size: '122510', model: 'ACCURA 122510', priority: 'P11', dept: '02 Planning', nextDept: '03 Purchase' },
  { srNo: 12, machineNumber: '2582', size: '564', model: 'ACCURA 564', priority: 'P12', dept: '02 Planning', nextDept: '03 Purchase' },
  { srNo: 13, machineNumber: '2583', size: '6105', model: 'ACCURA 6105', priority: 'P13', dept: '02 Planning', nextDept: '03 Purchase' },
  { srNo: 14, machineNumber: '2584', size: '10158', model: 'ACCURA 10158', priority: 'P14', dept: '02 Planning', nextDept: '03 Purchase' },
  { srNo: 15, machineNumber: '2585', size: 'NPI 564', model: 'NPI 564', priority: 'P15', dept: '02 Planning', nextDept: '03 Purchase', isNpi: true },
  { srNo: 16, machineNumber: '2586', size: '8106', model: 'ACCURA 8106', priority: 'P16', dept: '02 Planning', nextDept: '03 Purchase' },
  { srNo: 17, machineNumber: '2587', size: '685', model: 'ACCURA 685', priority: 'P17', dept: '02 Planning', nextDept: '03 Purchase' },
  { srNo: 18, machineNumber: '2588', size: '123010', model: 'ACCURA 123010', priority: 'P18', dept: '02 Planning', nextDept: '03 Purchase' },
  { srNo: 19, machineNumber: '2589', size: '564', model: 'ACCURA 564', priority: 'P19', dept: '02 Planning', nextDept: '03 Purchase' },
  { srNo: 20, machineNumber: '2590', size: '10208', model: 'ACCURA 10208', priority: 'P20', dept: '02 Planning', nextDept: '03 Purchase' },
  { srNo: 21, machineNumber: '2591', size: '685', model: 'ACCURA 685', priority: 'P21', dept: '02 Planning', nextDept: '03 Purchase' },
  { srNo: 22, machineNumber: '2592', size: '8156', model: 'ACCURA 8156', priority: 'P22', dept: '02 Planning', nextDept: '03 Purchase' },
  { srNo: 23, machineNumber: '2593', size: '6105', model: 'ACCURA 6105', priority: 'P23', dept: '02 Planning', nextDept: '03 Purchase' },
  { srNo: 24, machineNumber: '2594', size: '564', model: 'ACCURA 564', priority: 'P24', dept: '02 Planning', nextDept: '03 Purchase' },
  { srNo: 25, machineNumber: '2595', size: '6105', model: 'ACCURA 6105', priority: 'P25', dept: '02 Planning', nextDept: '03 Purchase' },
];

export const STANDARD_ROUTE_ORDER = [
  '02 Planning',
  '03 Purchase',
  '04 Inward Quality',
  '05 Store',
  '06-A Metal Shop',
  '06-B Granite Shop',
  '07A-Lapping-Flatness & Insert Fitment',
  '07B-Lapping-Y3 & Slot',
  '07C-Lapping-RTLT & Top Bottom',
  '08 Sub Assembly',
  '09 Guard Fitment',
  '10-A Paint Shop-A Class Item',
  '10-B Paint Shop-Guard Set',
  '11-A Electronics-Cable Set',
  '11-B Electronics-Tuning',
  '12 Assembly',
  '12 Bridge Assembly',
  '13 IT-Computer Inspection',
  '14 Calibration',
  '15 Packing',
];

const inMemoryStore: Record<string, any[]> = {};
const listeners: Record<string, Set<(data: any[]) => void>> = {};

function getStorageKey(collectionName: string): string {
  return `ams_db_${collectionName}`;
}

export function generateSeedMachines(): Machine[] {
  const now = new Date().toISOString();
  return SEED_OCTOBER_2026_MACHINES.map((s) => ({
    id: `MACH-${s.machineNumber}`,
    machineNumber: s.machineNumber,
    model: s.model,
    machineModel: s.model,
    machineSize: s.size,
    size: s.size,
    specification: s.size,
    quantity: 1,
    priority: s.priority,
    month: 'October',
    year: '2026',
    planMonth: 'October',
    planYear: '2026',
    planName: 'October 2026 Master Production Plan',
    sequenceNumber: s.srNo,
    status: 'IN_PROGRESS',
    currentStatus: 'In Progress',
    project: 'Standard CMM Series',
    customer: 'Accurate Gauging Plant',
    currentDepartment: s.dept,
    responsibleDepartment: s.dept,
    nextDepartment: s.nextDept,
    previousDepartment: '',
    progress: 10,
    overallProgress: 10,
    overallProgressPercent: 10,
    departmentProgress: 10,
    plannedStartDate: '2026-10-01',
    targetDate: '2026-10-31',
    plannedDueDate: '2026-10-31',
    processRoute: STANDARD_ROUTE_ORDER,
    remarks: s.isNpi ? 'NPI machine with priority allocation' : 'Planned for October 2026',
    isNpi: s.isNpi || false,
    createdAt: now,
    updatedAt: now,
  }));
}

export function generateSeedMonthlyPlans(): MonthlyPlan[] {
  const now = new Date().toISOString();
  return SEED_OCTOBER_2026_MACHINES.map((s) => ({
    id: `PLAN-2026-10-${s.machineNumber}`,
    srNo: s.srNo,
    machineNumber: s.machineNumber,
    machineModel: s.model,
    machineSize: s.size,
    quantity: 1,
    plannedQuantity: 1,
    priority: s.priority,
    month: 'October',
    year: '2026',
    department: '02 Planning',
    status: 'RELEASED',
    planStatus: 'Active',
    remarks: s.isNpi ? 'NPI October Plan' : 'Standard October 2026 Plan',
    createdAt: now,
    updatedAt: now,
  }));
}

export function generateSeedDepartmentWork(): DepartmentWork[] {
  const now = new Date().toISOString();
  return SEED_OCTOBER_2026_MACHINES.map((s) => {
    const pNum = parseInt(s.priority.replace(/\D/g, '') || '10', 10);
    const workPriority: 'Low' | 'Medium' | 'High' | 'Critical' =
      pNum <= 5 ? 'Critical' : pNum <= 15 ? 'High' : 'Medium';

    return {
      id: `DW-02-PLANNING-${s.machineNumber}`,
      title: `[PLANNING] Material & Production Release - CMM #${s.machineNumber}`,
      department: '02 Planning',
      machineNumber: s.machineNumber,
      machineModel: s.model,
      machineSize: s.size,
      operationWork: 'Master Planning, BOM Validation & Production Release',
      category: 'Planning',
      plannedQuantity: 1,
      actualQuantity: 1,
      status: 'In Progress' as const,
      priority: workPriority,
      assignedTo: 'Planning Lead',
      assignedDate: '2026-10-01',
      targetDate: '2026-10-15',
      dueDate: '2026-10-15',
      remarks: `October 2026 production batch #${s.srNo}`,
      progress: 25,
      month: 'October',
      year: '2026',
      planMonth: 'October',
      planYear: '2026',
      createdAt: now,
      updatedAt: now,
      isResponsible: true,
    };
  });
}

export function getLocalCollection<T = any>(collectionName: string): T[] {
  const key = getStorageKey(collectionName);
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const stored = window.localStorage.getItem(key);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          inMemoryStore[collectionName] = parsed;
          return parsed;
        }
      }
    }
  } catch (e) {
    console.warn(`Local store read error for ${collectionName}:`, e);
  }

  // Fallback to memory
  if (inMemoryStore[collectionName] && inMemoryStore[collectionName].length > 0) {
    return inMemoryStore[collectionName] as T[];
  }

  // Default initial seeding
  let defaults: any[] = [];
  if (collectionName === 'departments') {
    defaults = INITIAL_DEPARTMENTS;
  } else if (collectionName === 'machines') {
    defaults = generateSeedMachines();
  } else if (collectionName === 'monthly_plans') {
    defaults = generateSeedMonthlyPlans();
  } else if (collectionName === 'department_work') {
    defaults = generateSeedDepartmentWork();
  } else if (collectionName === 'quality_operations') {
    defaults = [
      { id: 'QOP-564-01', machineSize: '564', operationName: 'Granite Table Flatness Inspection', order: 1, standardLimit: '0.003 mm', active: true },
      { id: 'QOP-564-02', machineSize: '564', operationName: 'Guideway Alignment & Squareness', order: 2, standardLimit: '0.002 mm', active: true },
      { id: 'QOP-8156-01', machineSize: '8156', operationName: 'Granite Table Flatness Inspection', order: 1, standardLimit: '0.004 mm', active: true },
      { id: 'QOP-8156-02', machineSize: '8156', operationName: 'Bridge Alignment & Dual Scale Sync', order: 2, standardLimit: '0.003 mm', active: true },
      { id: 'QOP-ALL-FINAL', machineSize: 'ALL', operationName: 'Final Calibration & Verification (ISO 10360-2)', order: 99, standardLimit: 'E0,MPE <= 1.8 + L/350 um', active: true },
    ];
  } else if (collectionName === 'yearly_plans') {
    defaults = [
      { id: 'YP-2026', year: '2026', targetMachines: 300, totalTargetQuantity: 300, plannedTargetQuantity: 300, active: true, remarks: 'FY 2026 Master Production Plan' }
    ];
  }

  inMemoryStore[collectionName] = defaults;
  if (defaults.length > 0) {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(key, JSON.stringify(defaults));
      }
    } catch {}
  }
  return defaults as T[];
}

export function saveLocalCollection<T = any>(
  collectionName: string,
  data: T[],
  skipBroadcast = false
): void {
  inMemoryStore[collectionName] = data;
  const key = getStorageKey(collectionName);
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(key, JSON.stringify(data));
    }
  } catch (e) {
    console.warn(`Local store write error for ${collectionName}:`, e);
  }

  if (!skipBroadcast && listeners[collectionName]) {
    listeners[collectionName].forEach((cb) => {
      try {
        cb(data);
      } catch (err) {
        console.warn(`Local store listener error on ${collectionName}:`, err);
      }
    });
  }
}

export function upsertLocalItem<T extends { id?: string }>(
  collectionName: string,
  item: T,
  idField: keyof T = 'id' as keyof T
): T[] {
  const current = getLocalCollection<T>(collectionName);
  const itemId = item[idField];
  let found = false;
  const next = current.map((existing) => {
    if (itemId && existing[idField] === itemId) {
      found = true;
      return { ...existing, ...item };
    }
    return existing;
  });

  if (!found) {
    next.push(item);
  }

  saveLocalCollection(collectionName, next);
  return next;
}

export function deleteLocalItem<T extends { id?: string }>(
  collectionName: string,
  itemId: string,
  idField: keyof T = 'id' as keyof T
): T[] {
  const current = getLocalCollection<T>(collectionName);
  const next = current.filter((existing) => existing[idField] !== itemId);
  saveLocalCollection(collectionName, next);
  return next;
}

export function subscribeLocalCollection<T = any>(
  collectionName: string,
  callback: (data: T[]) => void
): () => void {
  if (!listeners[collectionName]) {
    listeners[collectionName] = new Set();
  }
  listeners[collectionName].add(callback);

  // Deliver current cached value immediately
  const initial = getLocalCollection<T>(collectionName);
  try {
    callback(initial);
  } catch (err) {
    console.warn(`Initial local store delivery error for ${collectionName}:`, err);
  }

  return () => {
    listeners[collectionName]?.delete(callback);
  };
}
