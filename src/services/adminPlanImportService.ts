import * as XLSX from 'xlsx';
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
  MonthlyPlan,
  WeeklyPlan,
  Department,
  DepartmentHandover,
  DepartmentWork,
} from '../types';
import { logAudit, createNotification } from './db';
import { normalizeDepartmentKey, isDepartmentMatch } from '../utils/departmentUtils';
import { areMachineNumbersEqual } from '../utils/machineUtils';
import { INITIAL_DEPARTMENTS } from '../constants';

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

// Canonical 4-Column Plan Row
export interface ParsedPlanRow {
  rowNumber: number;
  srNo: number;
  cmmNo: string;
  cmmSize: string;
  qty: number;
  existingMachine?: Machine | null;
  sizeDiscrepancy?: boolean;
  unresolvedMachine?: boolean;
  isValid: boolean;
  error?: string;
  warning?: string;
}

export interface PlanExcelValidationResult {
  fileName: string;
  headers: string[];
  totalRows: number;
  validRowsCount: number;
  invalidRowsCount: number;
  duplicateRowsCount: number;
  unresolvedMachinesCount: number;
  sizeDiscrepanciesCount: number;
  rows: ParsedPlanRow[];
  errors: Array<{ rowNumber: number; cmmNo?: string; reason: string }>;
  warnings: Array<{ rowNumber: number; cmmNo?: string; message: string }>;
}

/**
 * Parses the exact four-column plan Excel file:
 * | SR.NO. | CMM NO | CMM SIZE | Qty |
 * Supports variations: SR NO, SR.NO., CMM NO, CMM NUMBER, CMM SIZE, SIZE, QTY, QUANTITY
 */
export async function parseFourColumnPlanExcel(
  file: File,
  existingMachines: Machine[] = []
): Promise<PlanExcelValidationResult> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });

  // 1. Pick the best sheet that contains tabular data
  let rawData: any[][] = [];
  let chosenSheetName = workbook.SheetNames[0];

  for (const sName of workbook.SheetNames) {
    const ws = workbook.Sheets[sName];
    const data = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1 });
    if (data && data.length > rawData.length) {
      rawData = data;
      chosenSheetName = sName;
    }
  }

  if (!rawData || rawData.length === 0) {
    throw new Error('The selected Excel file is empty.');
  }

  // 2. Intelligent Header Detection across the first 30 rows
  // Matches header keywords regardless of title rows, banners, or notes at the top
  const isSrKeyword = (clean: string) =>
    ['srno', 'sr', 'sno', 'slno', 'serialno', 'serial', 'sequence', 'seq', 'priority', 'pos', 's'].includes(clean);

  const isCmmKeyword = (clean: string) =>
    ['cmmno', 'cmmnumber', 'cmm', 'machineno', 'machinenumber', 'machine', 'cmmid', 'machineid', 'cmmcode', 'assetno', 'asset', 'cmmn'].includes(clean);

  const isSizeKeyword = (clean: string) =>
    ['cmmsize', 'size', 'model', 'cmmmodel', 'machinemodel', 'machinesize', 'dimension', 'type', 'capacity'].includes(clean);

  const isQtyKeyword = (clean: string) =>
    ['qty', 'quantity', 'targetqty', 'plannedqty', 'planqty', 'target', 'count', 'vol', 'volume', 'nos'].includes(clean);

  let bestHeaderIdx = -1;
  let bestScore = 0;
  let srNoIdx = -1;
  let cmmNoIdx = -1;
  let cmmSizeIdx = -1;
  let qtyIdx = -1;

  for (let i = 0; i < Math.min(rawData.length, 30); i++) {
    const row = rawData[i];
    if (!Array.isArray(row) || row.length === 0) continue;

    let curSr = -1;
    let curCmm = -1;
    let curSize = -1;
    let curQty = -1;
    let score = 0;

    row.forEach((cell, idx) => {
      if (cell === undefined || cell === null) return;
      const clean = String(cell).toLowerCase().replace(/[^a-z0-9]/g, '');
      if (!clean) return;

      if (isCmmKeyword(clean) && curCmm === -1) {
        curCmm = idx;
        score += 4;
      } else if (isSizeKeyword(clean) && curSize === -1) {
        curSize = idx;
        score += 4;
      } else if (isSrKeyword(clean) && curSr === -1) {
        curSr = idx;
        score += 2;
      } else if (isQtyKeyword(clean) && curQty === -1) {
        curQty = idx;
        score += 2;
      }
    });

    if (score > bestScore) {
      bestScore = score;
      bestHeaderIdx = i;
      srNoIdx = curSr;
      cmmNoIdx = curCmm;
      cmmSizeIdx = curSize;
      qtyIdx = curQty;
    }
  }

  let headerRowIdx = bestHeaderIdx;
  let rawHeaders: string[] = [];

  // 3. Fallback Mapping if no explicit headers found or columns partially detected
  if (bestScore < 3 || headerRowIdx === -1) {
    // Find first row with at least 2 non-empty values
    let firstDataIdx = -1;
    for (let i = 0; i < rawData.length; i++) {
      const row = rawData[i];
      if (Array.isArray(row) && row.filter((c) => c !== undefined && c !== null && String(c).trim() !== '').length >= 2) {
        firstDataIdx = i;
        break;
      }
    }

    if (firstDataIdx === -1) {
      throw new Error('Could not identify table data in the uploaded Excel workbook.');
    }

    const sampleRow = rawData[firstDataIdx];
    const nonEmpties = sampleRow.filter((c) => c !== undefined && c !== null && String(c).trim() !== '');

    if (nonEmpties.length >= 4) {
      srNoIdx = 0;
      cmmNoIdx = 1;
      cmmSizeIdx = 2;
      qtyIdx = 3;
    } else if (nonEmpties.length === 3) {
      const val0 = String(sampleRow[0] || '').trim();
      if (!isNaN(Number(val0)) && Number(val0) > 50) {
        cmmNoIdx = 0;
        cmmSizeIdx = 1;
        qtyIdx = 2;
        srNoIdx = -1;
      } else {
        srNoIdx = 0;
        cmmNoIdx = 1;
        cmmSizeIdx = 2;
        qtyIdx = -1;
      }
    } else {
      cmmNoIdx = 0;
      cmmSizeIdx = 1;
      srNoIdx = -1;
      qtyIdx = -1;
    }

    headerRowIdx = firstDataIdx - 1;
    rawHeaders = ['SR.NO.', 'CMM NO', 'CMM SIZE', 'Qty'];
  } else {
    rawHeaders = rawData[headerRowIdx].map((h: any) => String(h || '').trim());

    // If CMM NO was matched but CMM SIZE was not, infer CMM SIZE as adjacent column
    if (cmmNoIdx !== -1 && cmmSizeIdx === -1) {
      if (cmmNoIdx + 1 < rawHeaders.length) {
        cmmSizeIdx = cmmNoIdx + 1;
      }
    }

    // If CMM SIZE was matched but CMM NO was not, infer CMM NO as preceding or adjacent column
    if (cmmSizeIdx !== -1 && cmmNoIdx === -1) {
      if (cmmSizeIdx - 1 >= 0) {
        cmmNoIdx = cmmSizeIdx - 1;
      } else if (cmmSizeIdx + 1 < rawHeaders.length) {
        cmmNoIdx = cmmSizeIdx + 1;
      }
    }

    // If SR NO is still -1 and column 0 is available
    if (srNoIdx === -1 && cmmNoIdx !== 0 && cmmSizeIdx !== 0) {
      srNoIdx = 0;
    }

    // If Qty is still -1
    if (qtyIdx === -1) {
      const candidateIdx = [3, 2, 4].find((idx) => idx !== cmmNoIdx && idx !== cmmSizeIdx && idx !== srNoIdx);
      if (candidateIdx !== undefined && candidateIdx < rawHeaders.length) {
        qtyIdx = candidateIdx;
      }
    }
  }

  // Final sanity fallback
  if (cmmNoIdx === -1) cmmNoIdx = 1;
  if (cmmSizeIdx === -1) cmmSizeIdx = 2;
  if (srNoIdx === -1) srNoIdx = 0;
  if (qtyIdx === -1) qtyIdx = 3;

  // Create lookup map of existing machines by machineNumber
  const machineMap = new Map<string, Machine>();
  existingMachines.forEach((m) => {
    machineMap.set(m.machineNumber.trim().toUpperCase(), m);
  });

  const parsedRows: ParsedPlanRow[] = [];
  const errors: Array<{ rowNumber: number; cmmNo?: string; reason: string }> = [];
  const warnings: Array<{ rowNumber: number; cmmNo?: string; message: string }> = [];
  const seenCmmNumbersInFile = new Set<string>();
  let duplicateCount = 0;
  let unresolvedCount = 0;
  let discrepancyCount = 0;

  for (let i = headerRowIdx + 1; i < rawData.length; i++) {
    const row = rawData[i];
    if (!Array.isArray(row) || row.every((c) => c === undefined || c === null || String(c).trim() === '')) {
      continue; // skip completely empty rows
    }

    const rowNum = i + 1; // 1-indexed Excel row number

    // 1. SR.NO.
    let rawSrNo = srNoIdx !== -1 ? row[srNoIdx] : parsedRows.length + 1;
    let srNo = Number(rawSrNo);
    if (isNaN(srNo) || srNo <= 0) {
      srNo = parsedRows.length + 1;
    }

    // 2. CMM NO (Strictly preserved as string, remove trailing .0 if parsed as float)
    let rawCmmNo = row[cmmNoIdx];
    let cmmNo = String(rawCmmNo !== undefined && rawCmmNo !== null ? rawCmmNo : '').trim();
    if (cmmNo.endsWith('.0')) {
      cmmNo = cmmNo.slice(0, -2);
    }

    // 3. CMM SIZE (Preserved as string, remove trailing .0)
    let rawSize = row[cmmSizeIdx];
    let cmmSize = String(rawSize !== undefined && rawSize !== null ? rawSize : '').trim();
    if (cmmSize.endsWith('.0')) {
      cmmSize = cmmSize.slice(0, -2);
    }

    // 4. Qty
    let rawQty = qtyIdx !== -1 ? row[qtyIdx] : 1;
    let qty = Number(rawQty);
    if (isNaN(qty) || qty <= 0) {
      qty = 1;
    }

    // Validations
    let rowError: string | undefined = undefined;
    let rowWarning: string | undefined = undefined;

    if (!cmmNo) {
      rowError = 'Missing CMM Number (Machine Number is required)';
      errors.push({ rowNumber: rowNum, reason: rowError });
    } else if (!cmmSize) {
      rowError = 'Missing CMM Size / Model (Machine Size is required)';
      errors.push({ rowNumber: rowNum, cmmNo, reason: rowError });
    }

    // Duplicate check in same upload file
    const cmmUpper = cmmNo.toUpperCase();
    if (cmmNo && seenCmmNumbersInFile.has(cmmUpper)) {
      duplicateCount++;
      rowWarning = `Duplicate CMM #${cmmNo} appears multiple times in uploaded plan.`;
      warnings.push({ rowNumber: rowNum, cmmNo, message: rowWarning });
    } else if (cmmNo) {
      seenCmmNumbersInFile.add(cmmUpper);
    }

    // Machine Master Lookup
    const matchedMachine = cmmNo ? machineMap.get(cmmUpper) : null;
    let unresolvedMachine = false;
    let sizeDiscrepancy = false;

    if (cmmNo && !matchedMachine) {
      unresolvedMachine = true;
      unresolvedCount++;
      const msg = `CMM #${cmmNo} not yet registered in Machine Master. Will link upon master creation.`;
      if (!rowWarning) rowWarning = msg;
      warnings.push({ rowNumber: rowNum, cmmNo, message: msg });
    } else if (matchedMachine) {
      const masterModel = (matchedMachine.model || matchedMachine.machineModel || '').trim().toLowerCase();
      const planModel = cmmSize.trim().toLowerCase();
      if (masterModel && planModel && !masterModel.includes(planModel) && !planModel.includes(masterModel)) {
        sizeDiscrepancy = true;
        discrepancyCount++;
        const msg = `Size discrepancy: Uploaded as "${cmmSize}", but Machine Master has "${matchedMachine.model}".`;
        if (!rowWarning) rowWarning = msg;
        warnings.push({ rowNumber: rowNum, cmmNo, message: msg });
      }
    }

    parsedRows.push({
      rowNumber: rowNum,
      srNo,
      cmmNo,
      cmmSize,
      qty,
      existingMachine: matchedMachine,
      sizeDiscrepancy,
      unresolvedMachine,
      isValid: !rowError,
      error: rowError,
      warning: rowWarning,
    });
  }

  // Preserve original uploaded sequence
  parsedRows.sort((a, b) => a.srNo - b.srNo);

  const validRows = parsedRows.filter((r) => r.isValid);
  const invalidRows = parsedRows.filter((r) => !r.isValid);

  return {
    fileName: file.name,
    headers: rawHeaders,
    totalRows: parsedRows.length,
    validRowsCount: validRows.length,
    invalidRowsCount: invalidRows.length,
    duplicateRowsCount: duplicateCount,
    unresolvedMachinesCount: unresolvedCount,
    sizeDiscrepanciesCount: discrepancyCount,
    rows: parsedRows,
    errors,
    warnings,
  };
}

// ============================================================================
// 2. BATCH IMPORT MONTHLY PLAN
// ============================================================================

export interface ImportMonthlyPlanBatchParams {
  month: string;
  year: string;
  title?: string;
  remarks?: string;
  fileName: string;
  rows: ParsedPlanRow[];
  overwriteExisting?: boolean;
  userEmail?: string;
  userName?: string;
}

export async function importMonthlyPlanBatch(
  params: ImportMonthlyPlanBatchParams
): Promise<{
  batchId: string;
  importedCount: number;
  warningsCount: number;
  unresolvedCount: number;
}> {
  const { month, year, title, remarks, fileName, rows, overwriteExisting, userEmail, userName } =
    params;

  if (!month || !year) {
    throw new Error('Plan Month and Year are required.');
  }

  const validRows = rows.filter((r) => r.isValid);
  if (validRows.length === 0) {
    throw new Error('No valid plan rows to import.');
  }

  const now = new Date().toISOString();
  const batchId = `MPB-${year}-${month.toUpperCase()}-${Date.now().toString().slice(-6)}`;

  // 1. Check if an official monthly plan for this month and year already exists
  const existingPlansQ = query(
    collection(db, 'monthly_plans'),
    where('month', '==', month),
    where('year', '==', String(year))
  );
  const existingPlansSnap = await getDocs(existingPlansQ);

  if (!existingPlansSnap.empty && !overwriteExisting) {
    throw new Error(
      `An official monthly plan already exists for ${month} ${year} (${existingPlansSnap.size} existing rows). Please review or explicitly confirm update.`
    );
  }

  // If overwrite/update confirmed, flag existing rows or mark as updated
  // Note: We preserve previous plan history by archiving batch IDs
  let importedCount = 0;
  let unresolvedCount = 0;
  let warningsCount = 0;

  for (const row of validRows) {
    const planLineId = `MPL-${year}-${month.toUpperCase()}-${String(row.srNo).padStart(3, '0')}-${row.cmmNo}`;
    const priorityCode = `P${String(row.srNo).padStart(2, '0')}`;

    const planData: Omit<MonthlyPlan, 'id'> = {
      month,
      year: String(year),
      department: '02 Planning', // Primary planning master; visible across all departments
      sequenceNumber: row.srNo,
      priority: priorityCode,
      machineNumber: row.cmmNo,
      machineModel: row.cmmSize,
      machineSize: row.cmmSize,
      plannedQuantity: row.qty,
      actualQuantity: 0,
      remainingQuantity: row.qty,
      achievementPercent: 0,
      project: row.existingMachine?.project || '',
      projectName: row.existingMachine?.project || '',
      customer: row.existingMachine?.customer || '',
      client: row.existingMachine?.customer || '',
      status: 'PLANNED',
      remarks: remarks || title || `Imported from ${fileName}`,
      createdAt: now,
      updatedAt: now,
      createdBy: userName || userEmail || 'Administrator',
      updatedBy: userName || userEmail || 'Administrator',
      // Metadata fields for plan tracking
      ...( {
        planBatchId: batchId,
        sourceFileName: fileName,
        originalSrNo: row.srNo,
        planTitle: title || `${month} ${year} Production Plan`,
        sizeDiscrepancy: row.sizeDiscrepancy || false,
        unresolvedMachine: row.unresolvedMachine || false,
      } as any ),
    };

    // Save to Firestore monthly_plans collection
    const planDocRef = doc(db, 'monthly_plans', planLineId);
    await setDoc(planDocRef, cleanData(planData), { merge: true });
    importedCount++;

    if (row.unresolvedMachine) unresolvedCount++;
    if (row.sizeDiscrepancy) warningsCount++;

    // 2. Link with Machine Master & Distribute Department Work across Manufacturing Route
    try {
      const cleanNum = row.cmmNo.trim();
      const mQ = query(
        collection(db, 'machines'),
        where('machineNumber', '==', cleanNum)
      );
      const mSnap = await getDocs(mQ);

      const defaultRoute = [
        '01 Design',
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
        '11-A Electronics-Cable Set',
        '12 Bridge Assembly',
        '12 Assembly',
        '14 Calibration',
        '15 Packing',
      ];

      // Build initial process stages for roadmap
      const initialStages: Record<string, any> = {};
      defaultRoute.forEach((dept, sIdx) => {
        const dDef = INITIAL_DEPARTMENTS.find((d) => isDepartmentMatch(d.name, dept));
        const dCode = dDef?.code || String(sIdx + 1).padStart(2, '0');
        const isPlanning = isDepartmentMatch(dept, '02 Planning');
        initialStages[dCode] = {
          departmentCode: dCode,
          departmentName: dept,
          progressPercent: 0,
          status: isPlanning ? 'In Progress' : 'Pending',
          updatedAt: now,
        };
      });

      if (mSnap.empty) {
        // Auto-register machine in Machine Master
        const machineSizeVal = row.cmmSize || 'Standard';
        const newMachine: Omit<Machine, 'id'> = {
          machineNumber: cleanNum,
          model: machineSizeVal,
          machineModel: machineSizeVal,
          machineSize: machineSizeVal,
          size: machineSizeVal,
          specification: machineSizeVal,
          currentDepartment: '02 Planning',
          responsibleDepartment: '02 Planning',
          project: row.existingMachine?.project || '',
          customer: row.existingMachine?.customer || '',
          planMonth: month,
          planYear: String(year),
          planName: title || `${month} ${year} Plan`,
          priority: priorityCode,
          sequenceNumber: row.srNo,
          status: 'IN_PROGRESS',
          currentStatus: 'In Progress',
          progress: 0,
          overallProgressPercent: 0,
          plannedStartDate: new Date().toISOString().split('T')[0],
          targetDate: '',
          processRoute: defaultRoute,
          processStages: initialStages,
          createdAt: now,
          updatedAt: now,
          createdBy: userName || userEmail || 'Monthly Planning Master',
        };
        await addDoc(collection(db, 'machines'), cleanData(newMachine));
      } else {
        for (const mDoc of mSnap.docs) {
          const mData = mDoc.data() as Machine;
          const machineSizeVal = row.cmmSize || mData.machineSize || mData.model || 'Standard';
          const updates: Partial<Machine> = {
            model: machineSizeVal,
            machineModel: machineSizeVal,
            machineSize: machineSizeVal,
            size: machineSizeVal,
            specification: machineSizeVal,
            planMonth: month,
            planYear: String(year),
            planName: title || `${month} ${year} Plan`,
            sequenceNumber: row.srNo,
            priority: priorityCode,
            updatedAt: now,
          };
          if (!mData.processRoute || mData.processRoute.length === 0) {
            updates.processRoute = defaultRoute;
          }
          if (!mData.processStages || Object.keys(mData.processStages).length === 0) {
            updates.processStages = initialStages;
          }
          if (row.sizeDiscrepancy) {
            updates.remarks = mData.remarks
              ? `${mData.remarks} | Plan size notice: ${row.cmmSize}`
              : `Plan size notice: ${row.cmmSize}`;
          }
          await updateDoc(mDoc.ref, cleanData(updates));
        }
      }

      // Distribute department work assignments across the configured route
      for (const deptName of defaultRoute) {
        const dDef = INITIAL_DEPARTMENTS.find((d) => isDepartmentMatch(d.name, deptName));
        const dCode = dDef?.code || deptName.slice(0, 4).replace(/[^a-zA-Z0-9]/g, '');
        const dwDocId = `DW-${cleanNum}-${dCode}`;

        const dwQ = query(
          collection(db, 'department_work'),
          where('machineNumber', '==', cleanNum),
          where('department', '==', deptName)
        );
        const dwSnap = await getDocs(dwQ);

        const assignedSize = row.cmmSize || 'Standard';

        if (dwSnap.empty) {
          const newWork: Omit<DepartmentWork, 'id'> = {
            title: `Planned Production Work - Machine ${cleanNum}`,
            department: deptName,
            machineNumber: cleanNum,
            machineModel: assignedSize,
            machineSize: assignedSize,
            specification: assignedSize,
            operationWork: `Planned Manufacturing Operations for ${deptName}`,
            category: 'Production',
            month,
            year: String(year),
            planMonth: month,
            planYear: String(year),
            plannedQuantity: row.qty,
            actualQuantity: 0,
            status: isDepartmentMatch(deptName, '02 Planning') ? 'In Progress' : 'Pending',
            isResponsible: isDepartmentMatch(deptName, '02 Planning'),
            priority: (priorityCode as any) || 'Medium',
            assignedTo: 'Department Team',
            assignedDate: new Date().toISOString().split('T')[0],
            targetDate: '',
            dueDate: '',
            remarks: `Allocated from ${month} ${year} Monthly Plan [${batchId}]`,
            progress: 0,
            createdAt: now,
            updatedAt: now,
            createdBy: userName || userEmail || 'Monthly Plan Auto-Allocation',
          };
          await setDoc(doc(db, 'department_work', dwDocId), cleanData(newWork), { merge: true });
        }
      }
    } catch (mErr) {
      console.warn(`Notice linking machine #${row.cmmNo}:`, mErr);
    }
  }

  // 3. Dispatch Notification to all production & manufacturing departments
  try {
    await createNotification({
      title: `Official Monthly Plan Released (${month} ${year})`,
      message: `Planning has released the official manufacturing target plan for ${month} ${year} (${importedCount} machines). Work assignments distributed across all manufacturing routes.`,
      type: 'PLAN_NOTIFICATION',
      priority: 'HIGH',
      recipientRole: 'DEPARTMENT',
      linkTo: 'monthly_plan',
    });
  } catch (notifErr) {
    console.warn('Notice sending monthly plan notification:', notifErr);
  }

  // 4. Log Audit Entry
  await logAudit(
    'IMPORT_MONTHLY_PLAN',
    'PLANNING',
    batchId,
    `${month} ${year}`,
    `Imported official monthly plan (${importedCount} rows, ${unresolvedCount} unresolved, ${warningsCount} size discrepancies) from ${fileName}`,
    userEmail
  );

  return {
    batchId,
    importedCount,
    warningsCount,
    unresolvedCount,
  };
}

// ============================================================================
// 3. BATCH IMPORT WEEKLY PLAN
// ============================================================================

export interface ImportWeeklyPlanBatchParams {
  weekNumber: string | number;
  weekStartDate: string;
  weekEndDate: string;
  year: string | number;
  title?: string;
  remarks?: string;
  fileName: string;
  rows: ParsedPlanRow[];
  overwriteExisting?: boolean;
  userEmail?: string;
  userName?: string;
}

export async function importWeeklyPlanBatch(
  params: ImportWeeklyPlanBatchParams
): Promise<{
  batchId: string;
  importedCount: number;
  warningsCount: number;
  unresolvedCount: number;
}> {
  const {
    weekNumber,
    weekStartDate,
    weekEndDate,
    year,
    title,
    remarks,
    fileName,
    rows,
    overwriteExisting,
    userEmail,
    userName,
  } = params;

  if (!weekStartDate || !weekEndDate) {
    throw new Error('Week Start Date and Week End Date are required.');
  }

  if (new Date(weekEndDate) < new Date(weekStartDate)) {
    throw new Error('Week End Date cannot be earlier than Week Start Date.');
  }

  const validRows = rows.filter((r) => r.isValid);
  if (validRows.length === 0) {
    throw new Error('No valid plan rows to import.');
  }

  const now = new Date().toISOString();
  const batchId = `WPB-${year}-W${weekNumber}-${Date.now().toString().slice(-6)}`;

  // 1. Check if weekly plan for this week and year exists
  const existingWeeklyQ = query(
    collection(db, 'weekly_plans'),
    where('weekStartDate', '==', weekStartDate),
    where('weekEndDate', '==', weekEndDate)
  );
  const existingWeeklySnap = await getDocs(existingWeeklyQ);

  if (!existingWeeklySnap.empty && !overwriteExisting) {
    throw new Error(
      `An official weekly plan already exists for ${weekStartDate} to ${weekEndDate} (${existingWeeklySnap.size} existing rows). Please review or confirm update.`
    );
  }

  let importedCount = 0;
  let unresolvedCount = 0;
  let warningsCount = 0;

  for (const row of validRows) {
    const planLineId = `WPL-${year}-W${weekNumber}-${String(row.srNo).padStart(3, '0')}-${row.cmmNo}`;
    const priorityCode = `P${String(row.srNo).padStart(2, '0')}`;

    const planData: Omit<WeeklyPlan, 'id'> = {
      weekNumber: String(weekNumber),
      weekStartDate,
      weekEndDate,
      year: String(year),
      department: '02 Planning',
      sequenceNumber: row.srNo,
      priority: priorityCode,
      machineNumber: row.cmmNo,
      machineModel: row.cmmSize,
      plannedQuantity: row.qty,
      actualQuantity: 0,
      remainingQuantity: row.qty,
      achievementPercent: 0,
      project: row.existingMachine?.project || '',
      status: 'PLANNED',
      remarks: remarks || title || `Weekly Import from ${fileName}`,
      createdAt: now,
      updatedAt: now,
      createdBy: userName || userEmail || 'Administrator',
      updatedBy: userName || userEmail || 'Administrator',
      // Metadata
      ...( {
        planBatchId: batchId,
        sourceFileName: fileName,
        originalSrNo: row.srNo,
        planTitle: title || `Week ${weekNumber} (${weekStartDate} to ${weekEndDate}) Plan`,
        sizeDiscrepancy: row.sizeDiscrepancy || false,
        unresolvedMachine: row.unresolvedMachine || false,
      } as any ),
    };

    const docRef = doc(db, 'weekly_plans', planLineId);
    await setDoc(docRef, cleanData(planData), { merge: true });
    importedCount++;

    if (row.unresolvedMachine) unresolvedCount++;
    if (row.sizeDiscrepancy) warningsCount++;

    // Link to machine weekly fields
    try {
      const mQ = query(
        collection(db, 'machines'),
        where('machineNumber', '==', row.cmmNo)
      );
      const mSnap = await getDocs(mQ);

      for (const mDoc of mSnap.docs) {
        const updates: Partial<Machine> = {
          weekNumber: String(weekNumber),
          weeklyPlanId: planLineId,
          updatedAt: now,
        };
        await updateDoc(mDoc.ref, cleanData(updates));
      }
    } catch (mErr) {
      console.warn(`Notice linking weekly machine #${row.cmmNo}:`, mErr);
    }
  }

  // 2. Dispatch Notification
  try {
    await createNotification({
      title: `Official Weekly Plan Published (Week ${weekNumber})`,
      message: `Admin has imported the manufacturing weekly plan for ${weekStartDate} to ${weekEndDate} (${importedCount} machines). Work updates become available upon handover acceptance.`,
      type: 'PLAN_NOTIFICATION',
      priority: 'HIGH',
      recipientRole: 'DEPARTMENT',
      linkTo: 'weekly_plan',
    });
  } catch (notifErr) {
    console.warn('Notice sending weekly plan notification:', notifErr);
  }

  // 3. Log Audit Entry
  await logAudit(
    'IMPORT_WEEKLY_PLAN',
    'PLANNING',
    batchId,
    `Week ${weekNumber} (${year})`,
    `Imported official weekly plan (${importedCount} rows) from ${fileName}`,
    userEmail
  );

  return {
    batchId,
    importedCount,
    warningsCount,
    unresolvedCount,
  };
}

// ============================================================================
// 4. WORK UPDATE PERMISSION & HANDOVER STATUS VERIFIER
// ============================================================================

export interface MachineDepartmentPermissionStatus {
  canUpdateWork: boolean;
  status: 'PENDING_HANDOVER' | 'HANDOVER_AWAITING_ACCEPTANCE' | 'ACCEPTED_ACTIVE' | 'TRANSFERRED_OUT' | 'NOT_APPLICABLE';
  badgeLabel: string;
  badgeColor: string;
  message: string;
  acceptedHandoverRef?: DepartmentHandover;
}

/**
 * Enforces the critical business rule:
 * A department can see its planned machines before receiving them,
 * but CANNOT start or update actual work until the machine has been formally handed over
 * to that department and the receiving department has accepted the handover.
 */
export function checkDepartmentWorkPermission(
  machineOrCmmNo: Machine | string,
  departmentName: string,
  machinesOrHandovers: Machine[] | DepartmentHandover[] = [],
  maybeHandovers?: DepartmentHandover[]
): MachineDepartmentPermissionStatus {
  if (!departmentName || departmentName === 'All Departments') {
    return {
      canUpdateWork: true,
      status: 'ACCEPTED_ACTIVE',
      badgeLabel: 'Admin Access',
      badgeColor: 'bg-emerald-100 text-emerald-800 border-emerald-200',
      message: 'Universal Administrator Work Access Granted.',
    };
  }

  let machine: Machine;
  let handovers: DepartmentHandover[] = [];

  if (typeof machineOrCmmNo === 'string') {
    const cmmNo = machineOrCmmNo.trim();
    const machinesList = Array.isArray(machinesOrHandovers) && (machinesOrHandovers.length === 0 || 'machineNumber' in (machinesOrHandovers[0] as any))
      ? (machinesOrHandovers as Machine[])
      : [];
    handovers = maybeHandovers || (Array.isArray(machinesOrHandovers) && machinesOrHandovers.length > 0 && !('machineNumber' in (machinesOrHandovers[0] as any))
      ? (machinesOrHandovers as DepartmentHandover[])
      : []);

    const found = machinesList.find(
      (m) => areMachineNumbersEqual(m.machineNumber, cmmNo)
    );
    if (found) {
      machine = found;
    } else {
      machine = {
        id: `plan-${cmmNo}`,
        machineNumber: cmmNo,
        model: 'Standard',
        currentDepartment: '02 Planning',
        responsibleDepartment: '02 Planning',
        currentStatus: 'In Progress',
        status: 'In Progress',
        overallProgress: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    }
  } else {
    machine = machineOrCmmNo;
    handovers = (machinesOrHandovers as DepartmentHandover[]) || [];
  }

  // 1. Check if machine is currently in this department
  const isCurrentlyInDept =
    isDepartmentMatch(machine.currentDepartment, departmentName) ||
    isDepartmentMatch(machine.responsibleDepartment, departmentName);

  // 2. Find any handovers involving this machine and this department
  const machineHandovers = handovers.filter((h) => {
    const mNum = (h.machineNumber || (h as any).cmmNumber || '').trim();
    return mNum && areMachineNumbersEqual(mNum, machine.machineNumber);
  });

  // Check if an incoming handover was accepted by this department
  const acceptedHandover = machineHandovers.find((h) => {
    const isReceiving =
      isDepartmentMatch(h.receivingDepartment, departmentName) ||
      isDepartmentMatch(h.toDepartment, departmentName);
    const isAccepted =
      h.status === 'ACCEPTED' ||
      h.status === 'Accepted' ||
      h.status === 'RECEIVED' ||
      h.status === 'COMPLETED';
    return isReceiving && isAccepted;
  });

  // Check if an incoming handover is currently pending acceptance
  const pendingIncoming = machineHandovers.find((h) => {
    const isReceiving =
      isDepartmentMatch(h.receivingDepartment, departmentName) ||
      isDepartmentMatch(h.toDepartment, departmentName);
    const isPending =
      h.status === 'SENT' ||
      h.status === 'Pending Acceptance' ||
      h.status === 'PENDING' ||
      h.status === 'PENDING_ACCEPTANCE';
    return isReceiving && isPending;
  });

  // Check if machine was already transferred OUT of this department to a later department
  const transferredOut = machineHandovers.find((h) => {
    const isSending =
      isDepartmentMatch(h.sendingDepartment, departmentName) ||
      isDepartmentMatch(h.fromDepartment, departmentName);
    const isTransferred =
      h.status === 'SENT' ||
      h.status === 'ACCEPTED' ||
      h.status === 'RECEIVED' ||
      h.status === 'COMPLETED';
    return isSending && isTransferred && !isCurrentlyInDept;
  });

  if (transferredOut) {
    return {
      canUpdateWork: false,
      status: 'TRANSFERRED_OUT',
      badgeLabel: 'Transferred Out (View-Only)',
      badgeColor: 'bg-slate-100 text-slate-700 border-slate-300',
      message: `Machine #${machine.machineNumber} has been transferred to ${machine.currentDepartment}. This department is now View-Only.`,
    };
  }

  if (pendingIncoming) {
    return {
      canUpdateWork: false,
      status: 'HANDOVER_AWAITING_ACCEPTANCE',
      badgeLabel: 'Awaiting Handover Acceptance',
      badgeColor: 'bg-amber-100 text-amber-800 border-amber-300 animate-pulse',
      message: `Handover has been issued by ${pendingIncoming.sendingDepartment || pendingIncoming.fromDepartment}. Work updates become available after handover acceptance.`,
    };
  }

  if (isCurrentlyInDept) {
    return {
      canUpdateWork: true,
      status: 'ACCEPTED_ACTIVE',
      badgeLabel: 'Active Work In Department',
      badgeColor: 'bg-emerald-100 text-emerald-800 border-emerald-300',
      message: `Machine is accepted and active in ${departmentName}. Work updates enabled.`,
      acceptedHandoverRef: acceptedHandover,
    };
  }

  // Not yet reached this department (Planned / Upcoming)
  return {
    canUpdateWork: false,
    status: 'PENDING_HANDOVER',
    badgeLabel: 'Planned / Upcoming Work',
    badgeColor: 'bg-blue-100 text-blue-800 border-blue-300',
    message: `Machine is currently in ${machine.currentDepartment || 'previous department'}. Work updates become available after handover acceptance.`,
  };
}

// ============================================================================
// 5. GENERATE SAMPLE 4-COLUMN EXCEL TEMPLATE
// ============================================================================

export function downloadFourColumnPlanTemplate(planType: 'monthly' | 'weekly') {
  const sampleData = [
    {
      'SR.NO.': 1,
      'CMM NO': '2521',
      'CMM SIZE': '10208',
      Qty: 1,
    },
    {
      'SR.NO.': 2,
      'CMM NO': '2522',
      'CMM SIZE': '8106',
      Qty: 1,
    },
    {
      'SR.NO.': 3,
      'CMM NO': '2523',
      'CMM SIZE': '685',
      Qty: 1,
    },
    {
      'SR.NO.': 4,
      'CMM NO': '2524',
      'CMM SIZE': '8106',
      Qty: 1,
    },
  ];

  const ws = XLSX.utils.json_to_sheet(sampleData, {
    header: ['SR.NO.', 'CMM NO', 'CMM SIZE', 'Qty'],
  });

  // Adjust column widths
  ws['!cols'] = [{ wch: 10 }, { wch: 15 }, { wch: 15 }, { wch: 10 }];

  const wb = XLSX.utils.book_new();
  const sheetTitle = planType === 'monthly' ? 'Monthly Plan' : 'Weekly Plan';
  XLSX.utils.book_append_sheet(wb, ws, sheetTitle);

  const fileName =
    planType === 'monthly'
      ? 'Accurate_Monthly_Plan_Template_SR_CMM_SIZE_Qty.xlsx'
      : 'Accurate_Weekly_Plan_Template_SR_CMM_SIZE_Qty.xlsx';

  XLSX.writeFile(wb, fileName);
}
