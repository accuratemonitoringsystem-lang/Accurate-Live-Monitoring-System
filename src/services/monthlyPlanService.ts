import * as XLSX from 'xlsx';
import {
  collection,
  doc,
  getDocs,
  setDoc,
  deleteDoc,
  updateDoc,
  query,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../firebase';
import { MonthlyPlan } from '../types';
import {
  MONTHLY_PLAN_GROUP_1_DEPTS,
  MONTHLY_PLAN_GROUP_2_DEPTS,
  ALL_MONTHLY_PLAN_DEPTS,
  MonthlyPlanDeptDef,
} from '../constants';
import { logAudit } from './db';
import { saveLocalCollection, getLocalCollection } from '../utils/localFallbackStore';

function cleanData<T extends Record<string, any>>(data: T): Partial<T> {
  const result: any = {};
  for (const key of Object.keys(data)) {
    if (data[key] !== undefined) {
      result[key] = data[key];
    }
  }
  return result;
}

export function findDepartmentForPlan(deptIdentifier: string): MonthlyPlanDeptDef | null {
  if (!deptIdentifier) return null;
  const raw = deptIdentifier.trim().toLowerCase();
  const clean = raw.replace(/[-_]/g, ' ').replace(/\s+/g, ' ');

  // Direct code match
  for (const d of ALL_MONTHLY_PLAN_DEPTS) {
    if (d.code.toLowerCase() === raw || d.code.toLowerCase().replace('-', '') === raw.replace('-', '')) {
      return d;
    }
    if (d.name.toLowerCase() === raw) {
      return d;
    }
    for (const a of d.aliases) {
      const cleanAlias = a.replace(/[-_]/g, ' ').replace(/\s+/g, ' ');
      if (clean === cleanAlias || clean.includes(cleanAlias) || cleanAlias.includes(clean)) {
        return d;
      }
    }
  }
  return null;
}

export interface ValidatedMonthlyPlanRow {
  rowNumber: number;
  sheetName: string;
  departmentCode: string;
  departmentName: string;
  departmentGroup: 'GROUP_1' | 'GROUP_2';
  machineNumber: string;
  machineSize: string;
  priority: 'High' | 'Medium' | 'Low' | 'Urgent';
  quantity: number;
  isValid: boolean;
  isDuplicate?: boolean;
  errors: string[];
  warnings: string[];
}

export interface MonthlyPlanParseResult {
  fileName: string;
  totalRows: number;
  validRows: ValidatedMonthlyPlanRow[];
  invalidRows: ValidatedMonthlyPlanRow[];
  duplicateRows: ValidatedMonthlyPlanRow[];
  departmentsDetected: {
    dept: MonthlyPlanDeptDef;
    rowCount: number;
    totalQuantity: number;
  }[];
  allRows: ValidatedMonthlyPlanRow[];
}

/**
 * Downloads standard 4-column Monthly Plan Excel template
 */
export function downloadMonthlyPlanTemplate(deptName?: string) {
  const wsData = [
    ['Machine Number', 'Machine Size', 'Priority', 'Quantity'],
    ['CMM-001', '1200 × 1500 × 1000', 'High', 2],
    ['CMM-002', '1600 × 2000 × 1500', 'Medium', 1],
    ['CMM-003', '2000 × 2500 × 1800', 'Urgent', 1],
    ['CMM-004', '800 × 1000 × 600', 'Low', 3],
  ];

  const ws = XLSX.utils.aoa_to_sheet(wsData);
  ws['!cols'] = [{ wch: 18 }, { wch: 24 }, { wch: 14 }, { wch: 12 }];

  const wb = XLSX.utils.book_new();
  const sheetName = deptName ? deptName.slice(0, 31).replace(/[:\\\/\?\*\[\]]/g, '') : 'Monthly Plan';
  XLSX.utils.book_append_sheet(wb, ws, sheetName);

  const fileName = deptName
    ? `Monthly_Plan_Template_${deptName.replace(/\s+/g, '_')}.xlsx`
    : 'Accurate_Monthly_Plan_Template.xlsx';

  XLSX.writeFile(wb, fileName);
}

/**
 * Downloads consolidated multi-sheet Excel template for all departments
 */
export function downloadConsolidatedMonthlyPlanTemplate() {
  const wb = XLSX.utils.book_new();

  // Overview / Consolidated sheet with Department column
  const overviewData = [
    ['Department Code', 'Machine Number', 'Machine Size', 'Priority', 'Quantity'],
    ['02', 'CMM-001', '1200 × 1500 × 1000', 'High', 2],
    ['03', 'CMM-002', '1600 × 2000 × 1500', 'Medium', 1],
    ['06-A', 'CMM-003', '2000 × 2500 × 1800', 'Urgent', 1],
    ['12-B', 'CMM-004', '800 × 1000 × 600', 'High', 2],
  ];
  const wsOverview = XLSX.utils.aoa_to_sheet(overviewData);
  wsOverview['!cols'] = [{ wch: 18 }, { wch: 18 }, { wch: 24 }, { wch: 14 }, { wch: 12 }];
  XLSX.utils.book_append_sheet(wb, wsOverview, 'Consolidated Master');

  // Also add sample departmental worksheets for Group 1 and Group 2
  const sampleDepts = ['02 Planning', '03 Purchase', '06-A Metal Shop', '12-B Final Assembly'];
  for (const dept of sampleDepts) {
    const wsData = [
      ['Machine Number', 'Machine Size', 'Priority', 'Quantity'],
      ['CMM-101', '1000 × 1200 × 800', 'High', 1],
      ['CMM-102', '1200 × 1500 × 1000', 'Medium', 2],
    ];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws['!cols'] = [{ wch: 18 }, { wch: 24 }, { wch: 14 }, { wch: 12 }];
    XLSX.utils.book_append_sheet(wb, ws, dept.slice(0, 31));
  }

  XLSX.writeFile(wb, 'Accurate_Consolidated_Monthly_Plan_Template.xlsx');
}

/**
 * Parses and strictly validates Monthly Plan Excel according to the 4 main columns
 */
export async function parseMonthlyPlanExcel(
  file: File,
  options: {
    selectedDepartment?: string;
    isConsolidatedUpload?: boolean;
    targetDepartmentGroup?: 'GROUP_1' | 'GROUP_2' | 'ALL';
  }
): Promise<MonthlyPlanParseResult> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });

  const allRows: ValidatedMonthlyPlanRow[] = [];
  const seenMachinesInDept = new Map<string, number>();

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;

    const rawRows: any[] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    if (!rawRows || rawRows.length < 2) continue;

    // Detect header indices
    const headerRow = rawRows[0] as any[];
    let machNoIdx = -1;
    let machSizeIdx = -1;
    let priorityIdx = -1;
    let qtyIdx = -1;
    let deptColIdx = -1;

    headerRow.forEach((cell, idx) => {
      const val = String(cell || '').trim().toLowerCase().replace(/[-_]/g, ' ');
      if (
        val.includes('machine number') ||
        val.includes('machineno') ||
        val.includes('machine no') ||
        val.includes('cmm no') ||
        val.includes('cmm number') ||
        val === 'machine'
      ) {
        machNoIdx = idx;
      } else if (
        val.includes('machine size') ||
        val.includes('size') ||
        val.includes('model') ||
        val.includes('specification') ||
        val.includes('cmm size')
      ) {
        machSizeIdx = idx;
      } else if (val.includes('priority') || val.includes('urgency') || val.includes('level')) {
        priorityIdx = idx;
      } else if (
        val.includes('quantity') ||
        val.includes('qty') ||
        val.includes('target qty') ||
        val.includes('planned qty')
      ) {
        qtyIdx = idx;
      } else if (
        val.includes('department') ||
        val.includes('dept code') ||
        val.includes('dept')
      ) {
        deptColIdx = idx;
      }
    });

    // Fallback: If headers weren't named exactly but have 4 columns
    if (machNoIdx === -1 && headerRow.length >= 4) {
      machNoIdx = 0;
      machSizeIdx = 1;
      priorityIdx = 2;
      qtyIdx = 3;
    }

    // Determine default department for this sheet
    let sheetDeptDef: MonthlyPlanDeptDef | null = null;
    if (options.selectedDepartment && options.selectedDepartment !== 'All Departments') {
      sheetDeptDef = findDepartmentForPlan(options.selectedDepartment);
    } else {
      sheetDeptDef = findDepartmentForPlan(sheetName);
    }

    for (let r = 1; r < rawRows.length; r++) {
      const row = rawRows[r];
      if (!row || row.every((c: any) => c === '' || c === null || c === undefined)) {
        continue;
      }

      const errors: string[] = [];
      const warnings: string[] = [];

      // Determine department for this row
      let rowDeptDef = sheetDeptDef;
      if (deptColIdx !== -1 && row[deptColIdx]) {
        const detected = findDepartmentForPlan(String(row[deptColIdx]));
        if (detected) {
          rowDeptDef = detected;
        }
      }

      if (!rowDeptDef) {
        errors.push(
          `Department not recognized for worksheet "${sheetName}". Please specify a valid department.`
        );
      }

      // Column 1: Machine Number
      const rawMachNo = machNoIdx !== -1 ? String(row[machNoIdx] || '').trim() : '';
      if (!rawMachNo) {
        errors.push('Machine Number is missing or empty.');
      }

      // Column 2: Machine Size
      const rawMachSize = machSizeIdx !== -1 ? String(row[machSizeIdx] || '').trim() : '';
      if (!rawMachSize) {
        errors.push('Machine Size is missing or empty.');
      }

      // Column 3: Priority
      const rawPriority = priorityIdx !== -1 ? String(row[priorityIdx] || '').trim() : '';
      let normalizedPriority: 'High' | 'Medium' | 'Low' | 'Urgent' = 'Medium';
      const prioLower = rawPriority.toLowerCase();
      if (prioLower.includes('urg') || prioLower.includes('crit') || prioLower === 'p0' || prioLower === 'p1') {
        normalizedPriority = 'Urgent';
      } else if (prioLower.includes('high') || prioLower === 'h' || prioLower === 'p01' || prioLower === 'p02') {
        normalizedPriority = 'High';
      } else if (prioLower.includes('low') || prioLower === 'l') {
        normalizedPriority = 'Low';
      } else if (prioLower.includes('med') || prioLower === 'm') {
        normalizedPriority = 'Medium';
      } else if (!rawPriority) {
        warnings.push('Priority not provided; defaulted to Medium.');
        normalizedPriority = 'Medium';
      } else {
        warnings.push(`Unrecognized priority "${rawPriority}"; normalized to Medium.`);
        normalizedPriority = 'Medium';
      }

      // Column 4: Quantity
      const rawQty = qtyIdx !== -1 ? row[qtyIdx] : '';
      let numQty = 1;
      if (rawQty === '' || rawQty === null || rawQty === undefined) {
        errors.push('Quantity is missing.');
      } else {
        numQty = Number(rawQty);
        if (isNaN(numQty) || numQty <= 0 || !Number.isInteger(numQty)) {
          errors.push(`Invalid quantity "${rawQty}". Must be a positive whole integer.`);
        }
      }

      // Check duplicates
      const deptKey = rowDeptDef?.code || 'UNKNOWN';
      const dupKey = `${deptKey}_${rawMachNo.toUpperCase()}`;
      const existingCount = seenMachinesInDept.get(dupKey) || 0;
      seenMachinesInDept.set(dupKey, existingCount + 1);

      const isDuplicate = existingCount > 0;
      if (isDuplicate) {
        warnings.push(`Duplicate Machine Number "${rawMachNo}" found within ${rowDeptDef?.name || 'this department'}.`);
      }

      allRows.push({
        rowNumber: r + 1,
        sheetName,
        departmentCode: rowDeptDef?.code || '',
        departmentName: rowDeptDef?.name || (options.selectedDepartment || 'Unassigned'),
        departmentGroup: rowDeptDef?.group || 'GROUP_1',
        machineNumber: rawMachNo,
        machineSize: rawMachSize,
        priority: normalizedPriority,
        quantity: numQty,
        isValid: errors.length === 0,
        isDuplicate,
        errors,
        warnings,
      });
    }
  }

  const validRows = allRows.filter((r) => r.isValid);
  const invalidRows = allRows.filter((r) => !r.isValid);
  const duplicateRows = allRows.filter((r) => r.isDuplicate);

  // Department-wise aggregated counts
  const deptMap = new Map<string, { dept: MonthlyPlanDeptDef; rowCount: number; totalQuantity: number }>();
  for (const r of validRows) {
    const d = findDepartmentForPlan(r.departmentCode) || findDepartmentForPlan(r.departmentName);
    if (d) {
      const cur = deptMap.get(d.code) || { dept: d, rowCount: 0, totalQuantity: 0 };
      cur.rowCount += 1;
      cur.totalQuantity += r.quantity;
      deptMap.set(d.code, cur);
    }
  }

  return {
    fileName: file.name,
    totalRows: allRows.length,
    validRows,
    invalidRows,
    duplicateRows,
    departmentsDetected: Array.from(deptMap.values()).sort((a, b) => a.dept.code.localeCompare(b.dept.code)),
    allRows,
  };
}

/**
 * Saves or updates valid monthly plan records to Firestore in batches
 */
export async function saveMonthlyPlanBatch(params: {
  rows: ValidatedMonthlyPlanRow[];
  mode: 'add' | 'update' | 'replace';
  financialYear: string;
  year: string;
  month: string;
  userEmail?: string;
}): Promise<{
  success: boolean;
  insertedCount: number;
  updatedCount: number;
  replacedDepartments: string[];
}> {
  const { rows, mode, financialYear, year, month, userEmail } = params;
  const now = new Date().toISOString();
  const replacedDepartments: string[] = [];

  // Group rows by department
  const deptsAffected = Array.from(new Set(rows.map((r) => r.departmentName)));

  // If REPLACE mode, first purge the current plans for these specific departments in the selected month & year
  if (mode === 'replace') {
    for (const deptName of deptsAffected) {
      replacedDepartments.push(deptName);
      try {
        const q = query(
          collection(db, 'monthly_plans'),
          where('department', '==', deptName),
          where('month', '==', month),
          where('year', '==', year)
        );
        const existingSnap = await getDocs(q);
        if (!existingSnap.empty) {
          const deleteBatch = writeBatch(db);
          existingSnap.docs.forEach((d) => deleteBatch.delete(d.ref));
          await deleteBatch.commit();
        }
      } catch (err) {
        console.warn(`Notice while replacing previous plan for ${deptName}:`, err);
      }
    }
  }

  // Write new plan records in chunks of 400
  let insertedCount = 0;
  for (let i = 0; i < rows.length; i += 400) {
    const chunk = rows.slice(i, i + 400);
    const batch = writeBatch(db);

    chunk.forEach((row) => {
      const cleanMachNo = row.machineNumber.replace(/[^a-zA-Z0-9]/g, '_');
      const docId = `MP_${year}_${month.toUpperCase()}_${row.departmentCode}_${cleanMachNo}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const docRef = doc(db, 'monthly_plans', docId);

      const planRecord: MonthlyPlan = {
        id: docId,
        planId: `MP-${year}-${month.toUpperCase()}-${row.departmentCode}-${row.machineNumber}`,
        financialYear,
        calendarYear: year,
        year,
        month,
        departmentGroup: row.departmentGroup,
        departmentCode: row.departmentCode,
        departmentId: row.departmentCode,
        departmentName: row.departmentName,
        department: row.departmentName,
        machineNumber: row.machineNumber,
        machineSize: row.machineSize,
        priority: row.priority,
        quantity: row.quantity,
        plannedQuantity: row.quantity,
        actualQuantity: 0,
        status: 'Planned',
        createdAt: now,
        updatedAt: now,
        createdBy: userEmail || 'Admin',
        updatedBy: userEmail || 'Admin',
      };

      batch.set(docRef, cleanData(planRecord));
      insertedCount++;
    });

    await batch.commit();
  }

  // Audit log
  await logAudit(
    mode === 'replace' ? 'REPLACE_MONTHLY_PLAN' : 'IMPORT_MONTHLY_PLAN',
    'MONTHLY_PLAN',
    `${month} ${year}`,
    '',
    `Imported ${insertedCount} monthly plan records across ${deptsAffected.join(', ')}. Mode: ${mode}`,
    userEmail
  );

  return {
    success: true,
    insertedCount,
    updatedCount: 0,
    replacedDepartments,
  };
}

/**
 * Adds a single manual monthly plan record
 */
export async function addSingleMonthlyPlan(
  plan: Omit<MonthlyPlan, 'id' | 'createdAt' | 'updatedAt'>,
  userEmail?: string
): Promise<string> {
  const now = new Date().toISOString();
  const cleanMachNo = (plan.machineNumber || 'MACH').replace(/[^a-zA-Z0-9]/g, '_');
  const deptDef = findDepartmentForPlan(plan.department);
  const deptCode = deptDef?.code || plan.departmentCode || 'DEPT';
  const docId = `MP_${plan.year}_${plan.month.toUpperCase()}_${deptCode}_${cleanMachNo}_${Date.now()}`;

  const fullPlan: MonthlyPlan = {
    ...plan,
    id: docId,
    planId: plan.planId || `MP-${plan.year}-${plan.month.toUpperCase()}-${deptCode}-${plan.machineNumber}`,
    departmentGroup: deptDef?.group || plan.departmentGroup || 'GROUP_1',
    departmentCode: deptCode,
    departmentName: deptDef?.name || plan.department,
    department: deptDef?.name || plan.department,
    quantity: plan.quantity || plan.plannedQuantity || 1,
    plannedQuantity: plan.plannedQuantity || plan.quantity || 1,
    actualQuantity: plan.actualQuantity || 0,
    status: plan.status || 'Planned',
    createdAt: now,
    updatedAt: now,
    createdBy: userEmail || 'Admin',
    updatedBy: userEmail || 'Admin',
  };

  const ref = doc(db, 'monthly_plans', docId);
  await setDoc(ref, cleanData(fullPlan));

  await logAudit(
    'CREATE_MONTHLY_PLAN',
    'MONTHLY_PLAN',
    docId,
    '',
    `Created plan for Machine ${plan.machineNumber} (${plan.department})`,
    userEmail
  );

  return docId;
}

/**
 * Updates a monthly plan record
 */
export async function updateMonthlyPlanRecord(
  id: string,
  updates: Partial<MonthlyPlan>,
  userEmail?: string
): Promise<void> {
  const now = new Date().toISOString();
  const ref = doc(db, 'monthly_plans', id);

  const cleanUpdates = cleanData({
    ...updates,
    updatedAt: now,
    updatedBy: userEmail || 'Admin',
  });

  await updateDoc(ref, cleanUpdates);

  await logAudit(
    'UPDATE_MONTHLY_PLAN',
    'MONTHLY_PLAN',
    id,
    '',
    JSON.stringify(updates),
    userEmail
  );
}

/**
 * Deletes a single monthly plan record
 */
export async function deleteMonthlyPlanRecord(id: string, userEmail?: string): Promise<void> {
  const ref = doc(db, 'monthly_plans', id);
  await deleteDoc(ref);

  await logAudit(
    'DELETE_MONTHLY_PLAN',
    'MONTHLY_PLAN',
    id,
    '',
    'Record deleted by user',
    userEmail
  );
}

/**
 * Deletes all monthly plan records for a department in a specific month and year
 */
export async function deleteDepartmentMonthlyPlan(
  deptName: string,
  month: string,
  year: string,
  userEmail?: string
): Promise<number> {
  const q = query(
    collection(db, 'monthly_plans'),
    where('department', '==', deptName),
    where('month', '==', month),
    where('year', '==', year)
  );

  const snap = await getDocs(q);
  if (snap.empty) return 0;

  const batch = writeBatch(db);
  snap.docs.forEach((d) => batch.delete(d.ref));
  await batch.commit();

  await logAudit(
    'DELETE_DEPT_MONTHLY_PLAN',
    'MONTHLY_PLAN',
    `${deptName}_${month}_${year}`,
    '',
    `Deleted ${snap.size} records for ${deptName} (${month} ${year})`,
    userEmail
  );

  return snap.size;
}

/**
 * Updates status of a monthly plan record (Planned | In Progress | Completed | On Hold)
 */
export async function updateMonthlyPlanStatus(
  id: string,
  newStatus: 'Planned' | 'In Progress' | 'Completed' | 'On Hold',
  userEmail?: string
): Promise<void> {
  const now = new Date().toISOString();
  const ref = doc(db, 'monthly_plans', id);

  await updateDoc(ref, {
    status: newStatus,
    updatedAt: now,
    updatedBy: userEmail || 'Staff',
  });

  await logAudit(
    'UPDATE_PLAN_STATUS',
    'MONTHLY_PLAN',
    id,
    '',
    `Status updated to ${newStatus}`,
    userEmail
  );
}

/**
 * Exports monthly plan records to Excel with the standard 4 columns + department & status
 */
export function exportMonthlyPlanToExcel(plans: MonthlyPlan[], title = 'Monthly_Plan_Report') {
  const data = plans.map((p) => ({
    'Machine Number': p.machineNumber || '',
    'Machine Size': p.machineSize || p.machineModel || '',
    'Priority': p.priority || 'Medium',
    'Quantity': p.quantity || p.plannedQuantity || 1,
    'Department': p.department || '',
    'Department Group': p.departmentGroup || '',
    'Month': p.month || '',
    'Year': p.year || '',
    'Financial Year': p.financialYear || '',
    'Status': p.status || 'Planned',
  }));

  const ws = XLSX.utils.json_to_sheet(data);
  ws['!cols'] = [
    { wch: 18 },
    { wch: 24 },
    { wch: 14 },
    { wch: 12 },
    { wch: 26 },
    { wch: 18 },
    { wch: 14 },
    { wch: 10 },
    { wch: 14 },
    { wch: 14 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Monthly Plan');
  XLSX.writeFile(wb, `${title.replace(/\s+/g, '_')}_${Date.now()}.xlsx`);
}
