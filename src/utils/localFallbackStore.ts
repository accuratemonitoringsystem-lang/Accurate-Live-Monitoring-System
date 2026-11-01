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
  UserProfile,
} from '../types';
import { INITIAL_DEPARTMENTS } from '../constants';
import {
  STANDARD_DEPARTMENT_ACCOUNTS,
  MASTER_ADMIN_USERNAME,
} from '../services/authService';

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
  // Return empty array: Master catalog and planning start from zero per user request
  return [];
}

export function generateSeedMonthlyPlans(): MonthlyPlan[] {
  // Empty to ensure clean fresh entry and never resurrect deleted monthly plans
  return [];
}

export function generateSeedDepartmentWork(): DepartmentWork[] {
  // Empty to ensure clean fresh entry and never resurrect deleted department tasks
  return [];
}

export function generateSeedUsers(): UserProfile[] {
  const now = new Date().toISOString();
  const admin: UserProfile = {
    id: 'administrator',
    userId: 'administrator',
    username: MASTER_ADMIN_USERNAME,
    employeeName: 'System Administrator',
    displayName: 'System Administrator',
    authorityName: 'System Administrator',
    processNo: 'ADMIN',
    mustChangePassword: false,
    employeeCode: 'ADMIN-01',
    email: 'admin@accurate.in',
    departmentId: 'ALL',
    department: 'All Departments (Master View)',
    role: 'ADMIN',
    status: 'Active',
    active: true,
    createdAt: now,
    updatedAt: now,
    createdBy: 'SYSTEM_BOOTSTRAP',
  };

  const depts: UserProfile[] = STANDARD_DEPARTMENT_ACCOUNTS.map((ac) => ({
    id: ac.username.toLowerCase(),
    userId: ac.username.toLowerCase(),
    username: ac.username,
    employeeName: ac.authorityName,
    displayName: ac.authorityName,
    authorityName: ac.authorityName,
    processNo: ac.processNo,
    mustChangePassword: false,
    employeeCode: `ACC-${ac.processNo}`,
    email: `${ac.username.toLowerCase()}@accurate.in`,
    departmentId: ac.departmentId,
    department: ac.department,
    role: ac.role,
    status: 'Active',
    active: true,
    createdAt: now,
    updatedAt: now,
    createdBy: 'SYSTEM_BOOTSTRAP',
  }));

  return [admin, ...depts];
}

export function purgeAllOldPlanningAndShopFloorStorage(): void {
  const keysToPurge = [
    'ams_db_machines',
    'ams_db_monthly_plans',
    'ams_db_monthlyPlans',
    'ams_db_backlog_items',
    'ams_db_backlogItems',
    'ams_db_department_work',
    'ams_db_departmentWork',
    'ams_db_weekly_plans',
    'ams_db_weeklyPlans',
    'ams_db_yearly_plans',
    'ams_db_yearlyPlans',
    'ams_db_department_handovers',
    'ams_db_departmentHandovers',
    'ams_db_handovers',
    'ams_db_quality_rejections',
    'ams_db_qualityRejections',
    'ams_db_quality_daily_checks',
    'ams_db_qualityChecks',
    'ams_db_quality_operations',
    'ams_db_operations',
    'ams_db_operation_lots',
    'ams_db_operationLots',
    'ams_db_daily_operation_updates',
    'ams_db_roadmap_items',
    'ams_db_roadmapItems',
    'ams_db_notifications',
    'ams_db_import_history',
    'ams_db_machine_documents',
    'ams_db_machineDocs',
    'ams_db_accessoriesOrders',
  ];

  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      keysToPurge.forEach((k) => {
        window.localStorage.removeItem(k);
        window.localStorage.setItem(k, '[]');
      });
    }
  } catch (err) {
    console.warn('Notice purging local storage:', err);
  }

  // Clear in-memory collections and broadcast empty arrays to active listeners
  const collectionsToClear = [
    'machines',
    'monthly_plans',
    'monthlyPlans',
    'backlog_items',
    'backlogItems',
    'department_work',
    'departmentWork',
    'weekly_plans',
    'weeklyPlans',
    'yearly_plans',
    'yearlyPlans',
    'department_handovers',
    'quality_rejections',
    'quality_daily_checks',
    'quality_operations',
    'roadmap_items',
    'operation_lots',
    'notifications',
    'import_history',
    'machine_documents',
    'accessoriesOrders',
  ];

  collectionsToClear.forEach((col) => {
    inMemoryStore[col] = [];
    if (listeners[col]) {
      listeners[col].forEach((cb) => {
        try {
          cb([]);
        } catch {}
      });
    }
  });
}

// Backwards-compatible alias
export const purgeStaleMonthlyPlanAndBacklogStorage = purgeAllOldPlanningAndShopFloorStorage;

export function getLocalCollection<T = any>(collectionName: string): T[] {
  const key = getStorageKey(collectionName);
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const stored = window.localStorage.getItem(key);
      if (stored !== null) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          inMemoryStore[collectionName] = parsed;
          return parsed;
        }
      }
    }
  } catch (e) {
    console.warn(`Local store read error for ${collectionName}:`, e);
  }

  // Fallback to memory
  if (inMemoryStore[collectionName] !== undefined && Array.isArray(inMemoryStore[collectionName])) {
    return inMemoryStore[collectionName] as T[];
  }

  // Default initial seeding - ONLY preserve departments and users! All planning and shop-floor data starts at zero.
  let defaults: any[] = [];
  if (collectionName === 'departments') {
    defaults = INITIAL_DEPARTMENTS;
  } else if (collectionName === 'users') {
    defaults = generateSeedUsers();
  } else {
    defaults = [];
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
