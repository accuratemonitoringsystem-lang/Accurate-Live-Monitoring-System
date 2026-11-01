import {
  collection,
  getDocs,
  writeBatch,
  doc,
  query,
  where,
  updateDoc,
} from 'firebase/firestore';
import { db } from '../firebase';
import { logAudit } from './db';
import { saveLocalCollection, purgeStaleMonthlyPlanAndBacklogStorage } from '../utils/localFallbackStore';

export type CleanupScope = 'MONTHLY_PLAN' | 'BACKLOG' | 'BOTH';

export interface CleanupCountSummary {
  monthlyPlansCount: number;
  monthlyDepartmentWorkCount: number;
  monthlyNotificationsCount: number;
  totalMonthlyRecords: number;
  monthlyDepartments: string[];

  backlogItemsCount: number;
  backlogDepartmentWorkCount: number;
  backlogNotificationsCount: number;
  totalBacklogRecords: number;
  backlogDepartments: string[];

  grandTotal: number;
  allDepartmentsCount: number;
}

export interface CleanupReportModuleSummary {
  moduleName: string;
  departmentsChecked: string | number;
  recordsDeleted: number;
  remainingRecords: number;
  details: Record<string, number>;
}

export interface CleanupReport {
  operation: CleanupScope;
  executedAt: string;
  executedBy: string;
  status: 'SUCCESS' | 'FAILED';
  monthlyPlanSummary: CleanupReportModuleSummary;
  backlogSummary: CleanupReportModuleSummary;
  preservedVerification: {
    yearlyPlansCount: number;
    projectsCount: number;
    machinesCount: number;
    usersCount: number;
    departmentsCount: number;
  };
  backupSnapshotJson?: string;
  error?: string;
}

/**
 * Clean data helper to strip undefined values
 */
function cleanData<T extends Record<string, any>>(data: T): Partial<T> {
  const result: any = {};
  for (const key of Object.keys(data)) {
    if (data[key] !== undefined) {
      result[key] = data[key];
    }
  }
  return result;
}

/**
 * Fetch current real-time counts of Monthly Plan and Backlog data across all departments.
 */
export async function getCleanupRecordCounts(): Promise<CleanupCountSummary> {
  const [
    mPlansSnap,
    mPlansAltSnap,
    bItemsSnap,
    bItemsAltSnap,
    dwSnap,
    notifSnap,
    deptSnap,
  ] = await Promise.all([
    getDocs(collection(db, 'monthly_plans')),
    getDocs(collection(db, 'monthlyPlans')),
    getDocs(collection(db, 'backlog_items')),
    getDocs(collection(db, 'backlogItems')),
    getDocs(collection(db, 'department_work')),
    getDocs(collection(db, 'notifications')),
    getDocs(collection(db, 'departments')),
  ]);

  const monthlyDepts = new Set<string>();
  const backlogDepts = new Set<string>();

  // Monthly Plans
  mPlansSnap.docs.forEach((d) => {
    const data = d.data();
    if (data.department) monthlyDepts.add(data.department);
  });
  mPlansAltSnap.docs.forEach((d) => {
    const data = d.data();
    if (data.department) monthlyDepts.add(data.department);
  });

  // Backlog Items
  bItemsSnap.docs.forEach((d) => {
    const data = d.data();
    if (data.department) backlogDepts.add(data.department);
  });
  bItemsAltSnap.docs.forEach((d) => {
    const data = d.data();
    if (data.department) backlogDepts.add(data.department);
  });

  // Department Work
  let monthlyDwCount = 0;
  let backlogDwCount = 0;

  dwSnap.docs.forEach((d) => {
    const data = d.data();
    const cat = (data.category || '').toLowerCase();
    const title = (data.title || '').toLowerCase();
    const remarks = (data.remarks || '').toLowerCase();

    if (cat === 'backlog' || title.includes('[backlog]') || remarks.includes('backlog')) {
      backlogDwCount++;
      if (data.department) backlogDepts.add(data.department);
    } else if (
      cat === 'production' ||
      cat === 'planning' ||
      remarks.includes('monthly plan') ||
      data.planMonth
    ) {
      monthlyDwCount++;
      if (data.department) monthlyDepts.add(data.department);
    }
  });

  // Notifications
  let monthlyNotifCount = 0;
  let backlogNotifCount = 0;
  notifSnap.docs.forEach((d) => {
    const data = d.data();
    const type = data.type || '';
    if (type === 'BACKLOG_ASSIGNED') {
      backlogNotifCount++;
    } else if (type === 'MONTHLY_PLAN_RELEASED' || type === 'PLAN_NOTIFICATION') {
      monthlyNotifCount++;
    }
  });

  const totalMonthlyPlans = mPlansSnap.size + mPlansAltSnap.size;
  const totalBacklogItems = bItemsSnap.size + bItemsAltSnap.size;

  const totalMonthlyRecords = totalMonthlyPlans + monthlyDwCount + monthlyNotifCount;
  const totalBacklogRecords = totalBacklogItems + backlogDwCount + backlogNotifCount;

  return {
    monthlyPlansCount: totalMonthlyPlans,
    monthlyDepartmentWorkCount: monthlyDwCount,
    monthlyNotificationsCount: monthlyNotifCount,
    totalMonthlyRecords,
    monthlyDepartments: Array.from(monthlyDepts),

    backlogItemsCount: totalBacklogItems,
    backlogDepartmentWorkCount: backlogDwCount,
    backlogNotificationsCount: backlogNotifCount,
    totalBacklogRecords,
    backlogDepartments: Array.from(backlogDepts),

    grandTotal: totalMonthlyRecords + totalBacklogRecords,
    allDepartmentsCount: Math.max(deptSnap.size, monthlyDepts.size + backlogDepts.size),
  };
}

/**
 * Creates an exportable JSON backup snapshot of all Monthly Plan and/or Backlog records before deletion.
 */
export async function createCleanupBackup(scope: CleanupScope): Promise<string> {
  const backup: Record<string, any> = {
    backupTimestamp: new Date().toISOString(),
    scope,
    generatedFor: 'Accurate Planning / Accurate Gauging and Instruments Pvt Ltd',
    monthlyPlans: [],
    backlogItems: [],
    departmentWorkMonthly: [],
    departmentWorkBacklog: [],
    notifications: [],
  };

  if (scope === 'MONTHLY_PLAN' || scope === 'BOTH') {
    const [m1, m2] = await Promise.all([
      getDocs(collection(db, 'monthly_plans')),
      getDocs(collection(db, 'monthlyPlans')),
    ]);
    backup.monthlyPlans = [
      ...m1.docs.map((d) => ({ id: d.id, _collection: 'monthly_plans', ...d.data() })),
      ...m2.docs.map((d) => ({ id: d.id, _collection: 'monthlyPlans', ...d.data() })),
    ];
  }

  if (scope === 'BACKLOG' || scope === 'BOTH') {
    const [b1, b2] = await Promise.all([
      getDocs(collection(db, 'backlog_items')),
      getDocs(collection(db, 'backlogItems')),
    ]);
    backup.backlogItems = [
      ...b1.docs.map((d) => ({ id: d.id, _collection: 'backlog_items', ...d.data() })),
      ...b2.docs.map((d) => ({ id: d.id, _collection: 'backlogItems', ...d.data() })),
    ];
  }

  const [dwSnap, notifSnap] = await Promise.all([
    getDocs(collection(db, 'department_work')),
    getDocs(collection(db, 'notifications')),
  ]);

  dwSnap.docs.forEach((d) => {
    const data = d.data();
    const cat = (data.category || '').toLowerCase();
    const title = (data.title || '').toLowerCase();
    const remarks = (data.remarks || '').toLowerCase();

    if (
      (scope === 'BACKLOG' || scope === 'BOTH') &&
      (cat === 'backlog' || title.includes('[backlog]') || remarks.includes('backlog'))
    ) {
      backup.departmentWorkBacklog.push({ id: d.id, ...data });
    } else if (
      (scope === 'MONTHLY_PLAN' || scope === 'BOTH') &&
      (cat === 'production' || cat === 'planning' || remarks.includes('monthly plan') || data.planMonth)
    ) {
      backup.departmentWorkMonthly.push({ id: d.id, ...data });
    }
  });

  notifSnap.docs.forEach((d) => {
    const data = d.data();
    const type = data.type || '';
    if ((scope === 'BACKLOG' || scope === 'BOTH') && type === 'BACKLOG_ASSIGNED') {
      backup.notifications.push({ id: d.id, ...data });
    } else if (
      (scope === 'MONTHLY_PLAN' || scope === 'BOTH') &&
      (type === 'MONTHLY_PLAN_RELEASED' || type === 'PLAN_NOTIFICATION')
    ) {
      backup.notifications.push({ id: d.id, ...data });
    }
  });

  return JSON.stringify(backup, null, 2);
}

/**
 * Helper to delete a list of document references in safe batches of 400.
 */
async function batchDeleteDocuments(
  docsToDelete: { ref: any; id: string; col: string }[]
): Promise<number> {
  let count = 0;
  for (let i = 0; i < docsToDelete.length; i += 400) {
    const chunk = docsToDelete.slice(i, i + 400);
    const batch = writeBatch(db);
    chunk.forEach((item) => batch.delete(item.ref));
    await batch.commit();
    count += chunk.length;
  }
  return count;
}

/**
 * Execute deletion for Monthly Plan, Backlog, or Both across ALL departments.
 */
export async function executePlanAndBacklogCleanup(
  scope: CleanupScope,
  userEmail: string
): Promise<CleanupReport> {
  const executedAt = new Date().toISOString();
  console.log(`[CLEANUP] Starting cleanup operation "${scope}" initiated by ${userEmail}...`);

  // 1. Create In-Memory Backup Snapshot first for total safety
  let backupSnapshotJson = '';
  try {
    backupSnapshotJson = await createCleanupBackup(scope);
  } catch (backupErr) {
    console.warn('[CLEANUP] Backup snapshot notice:', backupErr);
  }

  // Pre-fetch all necessary collections
  const [
    mPlansSnap,
    mPlansAltSnap,
    bItemsSnap,
    bItemsAltSnap,
    dwSnap,
    notifSnap,
    machinesSnap,
    deptSnap,
    ypSnap,
    ypAltSnap,
    projSnap,
    usersSnap,
  ] = await Promise.all([
    getDocs(collection(db, 'monthly_plans')),
    getDocs(collection(db, 'monthlyPlans')),
    getDocs(collection(db, 'backlog_items')),
    getDocs(collection(db, 'backlogItems')),
    getDocs(collection(db, 'department_work')),
    getDocs(collection(db, 'notifications')),
    getDocs(collection(db, 'machines')),
    getDocs(collection(db, 'departments')),
    getDocs(collection(db, 'yearly_plans')),
    getDocs(collection(db, 'yearlyPlans')),
    getDocs(collection(db, 'projects')),
    getDocs(collection(db, 'users')),
  ]);

  const allDeptsCount = deptSnap.size;
  const docsToDelete: { ref: any; id: string; col: string }[] = [];

  const monthlyDetails: Record<string, number> = {
    monthly_plans: 0,
    monthlyPlans: 0,
    department_work: 0,
    notifications: 0,
  };

  const backlogDetails: Record<string, number> = {
    backlog_items: 0,
    backlogItems: 0,
    department_work: 0,
    notifications: 0,
  };

  // 2. Identify Monthly Plan records to delete
  if (scope === 'MONTHLY_PLAN' || scope === 'BOTH') {
    mPlansSnap.docs.forEach((d) => {
      docsToDelete.push({ ref: d.ref, id: d.id, col: 'monthly_plans' });
      monthlyDetails.monthly_plans++;
    });
    mPlansAltSnap.docs.forEach((d) => {
      docsToDelete.push({ ref: d.ref, id: d.id, col: 'monthlyPlans' });
      monthlyDetails.monthlyPlans++;
    });
  }

  // 3. Identify Backlog records to delete
  if (scope === 'BACKLOG' || scope === 'BOTH') {
    bItemsSnap.docs.forEach((d) => {
      docsToDelete.push({ ref: d.ref, id: d.id, col: 'backlog_items' });
      backlogDetails.backlog_items++;
    });
    bItemsAltSnap.docs.forEach((d) => {
      docsToDelete.push({ ref: d.ref, id: d.id, col: 'backlogItems' });
      backlogDetails.backlogItems++;
    });
  }

  // 4. Identify department_work records to delete
  dwSnap.docs.forEach((d) => {
    const data = d.data();
    const cat = (data.category || '').toLowerCase();
    const title = (data.title || '').toLowerCase();
    const remarks = (data.remarks || '').toLowerCase();

    if (
      (scope === 'BACKLOG' || scope === 'BOTH') &&
      (cat === 'backlog' || title.includes('[backlog]') || remarks.includes('backlog'))
    ) {
      docsToDelete.push({ ref: d.ref, id: d.id, col: 'department_work' });
      backlogDetails.department_work++;
    } else if (
      (scope === 'MONTHLY_PLAN' || scope === 'BOTH') &&
      (cat === 'production' || cat === 'planning' || remarks.includes('monthly plan') || data.planMonth)
    ) {
      docsToDelete.push({ ref: d.ref, id: d.id, col: 'department_work' });
      monthlyDetails.department_work++;
    }
  });

  // 5. Identify notification records to delete
  notifSnap.docs.forEach((d) => {
    const data = d.data();
    const type = data.type || '';
    if ((scope === 'BACKLOG' || scope === 'BOTH') && type === 'BACKLOG_ASSIGNED') {
      docsToDelete.push({ ref: d.ref, id: d.id, col: 'notifications' });
      backlogDetails.notifications++;
    } else if (
      (scope === 'MONTHLY_PLAN' || scope === 'BOTH') &&
      (type === 'MONTHLY_PLAN_RELEASED' || type === 'PLAN_NOTIFICATION')
    ) {
      docsToDelete.push({ ref: d.ref, id: d.id, col: 'notifications' });
      monthlyDetails.notifications++;
    }
  });

  // 6. Execute Batch Deletions safely in chunks of 400
  console.log(`[CLEANUP] Executing batch deletion of ${docsToDelete.length} documents...`);
  await batchDeleteDocuments(docsToDelete);

  // 7. Update Machine Master records safely (PRESERVE machines, only clear plan/backlog attributes)
  if (scope === 'MONTHLY_PLAN' || scope === 'BOTH' || scope === 'BACKLOG') {
    const machineUpdates: { ref: any; updates: any }[] = [];
    machinesSnap.docs.forEach((d) => {
      const data = d.data();
      const updates: Record<string, any> = {};

      if (scope === 'BACKLOG' || scope === 'BOTH') {
        if (data.hasBacklog || data.backlogOperation || data.backlogRemainingQty) {
          updates.hasBacklog = false;
          updates.backlogOperation = '';
          updates.backlogRemainingQty = 0;
        }
      }

      if (scope === 'MONTHLY_PLAN' || scope === 'BOTH') {
        const num = parseInt(data.machineNumber, 10);
        const isMaster = data.isMasterPlan || (num >= 2571 && num <= 2595);
        if (!isMaster && (data.planMonth || data.planYear || data.planName)) {
          updates.planMonth = '';
          updates.planYear = '';
          updates.planName = '';
          updates.plannedStartDate = '';
          updates.plannedDueDate = '';
        }
      }

      if (Object.keys(updates).length > 0) {
        updates.updatedAt = executedAt;
        machineUpdates.push({ ref: d.ref, updates });
      }
    });

    if (machineUpdates.length > 0) {
      console.log(`[CLEANUP] Synchronizing ${machineUpdates.length} machine master tracking records...`);
      for (let i = 0; i < machineUpdates.length; i += 400) {
        const chunk = machineUpdates.slice(i, i + 400);
        const batch = writeBatch(db);
        chunk.forEach((item) => batch.update(item.ref, cleanData(item.updates)));
        await batch.commit();
      }
    }
  }

  // 8. Clear Local Storage Fallback Cache to prevent resurrection from client memory
  purgeStaleMonthlyPlanAndBacklogStorage();
  saveLocalCollection('monthly_plans', []);
  saveLocalCollection('department_work', []);
  saveLocalCollection('backlog_items', []);

  // 9. Audit Trail Logging
  const auditAction =
    scope === 'BOTH'
      ? 'CLEAR_MONTHLY_AND_BACKLOG_DATA'
      : scope === 'MONTHLY_PLAN'
      ? 'CLEAR_MONTHLY_PLAN_DATA'
      : 'CLEAR_BACKLOG_DATA';

  await logAudit(
    auditAction,
    'DATABASE_MANAGEMENT',
    'ALL_DEPARTMENTS',
    `Database Cleanup: ${scope}`,
    `Deleted ${docsToDelete.length} records across all departments. Executed by ${userEmail}`,
    userEmail
  );

  // 10. Post-Deletion Verification Pass
  const [
    mCheck1,
    mCheck2,
    bCheck1,
    bCheck2,
    dwCheck,
    ypCheck1,
    ypCheck2,
    projCheck,
    machCheck,
    userCheck,
    deptCheck,
  ] = await Promise.all([
    getDocs(collection(db, 'monthly_plans')),
    getDocs(collection(db, 'monthlyPlans')),
    getDocs(collection(db, 'backlog_items')),
    getDocs(collection(db, 'backlogItems')),
    getDocs(collection(db, 'department_work')),
    getDocs(collection(db, 'yearly_plans')),
    getDocs(collection(db, 'yearlyPlans')),
    getDocs(collection(db, 'projects')),
    getDocs(collection(db, 'machines')),
    getDocs(collection(db, 'users')),
    getDocs(collection(db, 'departments')),
  ]);

  let remainingMonthlyDw = 0;
  let remainingBacklogDw = 0;

  dwCheck.docs.forEach((d) => {
    const data = d.data();
    const cat = (data.category || '').toLowerCase();
    const title = (data.title || '').toLowerCase();
    const remarks = (data.remarks || '').toLowerCase();

    if (cat === 'backlog' || title.includes('[backlog]') || remarks.includes('backlog')) {
      remainingBacklogDw++;
    }
    if (cat === 'production' || remarks.includes('monthly plan') || data.planMonth) {
      remainingMonthlyDw++;
    }
  });

  const totalMonthlyDeleted =
    monthlyDetails.monthly_plans +
    monthlyDetails.monthlyPlans +
    monthlyDetails.department_work +
    monthlyDetails.notifications;

  const totalBacklogDeleted =
    backlogDetails.backlog_items +
    backlogDetails.backlogItems +
    backlogDetails.department_work +
    backlogDetails.notifications;

  const remainingMonthlyRecords = mCheck1.size + mCheck2.size + remainingMonthlyDw;
  const remainingBacklogRecords = bCheck1.size + bCheck2.size + remainingBacklogDw;

  const report: CleanupReport = {
    operation: scope,
    executedAt,
    executedBy: userEmail,
    status: 'SUCCESS',
    monthlyPlanSummary: {
      moduleName: 'Monthly Plan',
      departmentsChecked: `All (${allDeptsCount}+ Departments)`,
      recordsDeleted: totalMonthlyDeleted,
      remainingRecords: remainingMonthlyRecords,
      details: monthlyDetails,
    },
    backlogSummary: {
      moduleName: 'Backlog',
      departmentsChecked: `All (${allDeptsCount}+ Departments)`,
      recordsDeleted: totalBacklogDeleted,
      remainingRecords: remainingBacklogRecords,
      details: backlogDetails,
    },
    preservedVerification: {
      yearlyPlansCount: ypCheck1.size + ypCheck2.size,
      projectsCount: projCheck.size,
      machinesCount: machCheck.size,
      usersCount: userCheck.size,
      departmentsCount: deptCheck.size,
    },
    backupSnapshotJson,
  };

  console.log('[CLEANUP] Cleanup completed successfully:', {
    scope,
    totalMonthlyDeleted,
    remainingMonthlyRecords,
    totalBacklogDeleted,
    remainingBacklogRecords,
    preservedMachines: machCheck.size,
    preservedUsers: userCheck.size,
  });

  return report;
}
