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
import { BacklogItem, BacklogStatus, Machine, DepartmentWork } from '../types';
import { logAudit, createNotification, cleanData, recordImportHistory } from './db';
import { normalizeDepartmentKey, isDepartmentMatch } from '../utils/departmentUtils';
import { INITIAL_DEPARTMENTS } from '../constants';
import { STANDARD_ROUTE_ORDER } from '../utils/localFallbackStore';

export interface ParsedBacklogRow {
  rowNumber: number;
  srNo: number;
  month: string;
  year: string;
  department: string;
  machineNumber: string;
  machineSize: string;
  project?: string;
  customer?: string;
  productModel?: string;
  part?: string;
  remainingOperation: string;
  originalQuantity: number;
  remainingQuantity: number;
  plannedStartDate?: string;
  targetDate?: string;
  dueDate?: string;
  priority: string;
  remarks?: string;
  existingStatus?: string;
  existingMachine?: Machine | null;
  isExistingMachine?: boolean;
  isDuplicateInFile?: boolean;
  isValid: boolean;
  error?: string;
  warning?: string;
}

export interface BacklogValidationResult {
  fileName: string;
  headers: string[];
  totalRows: number;
  validRowsCount: number;
  invalidRowsCount: number;
  duplicateRowsCount: number;
  newMachinesCount: number;
  updatedMachinesCount: number;
  rows: ParsedBacklogRow[];
  errors: Array<{ rowNumber: number; machineNumber?: string; reason: string; fixHint?: string }>;
  warnings: Array<{ rowNumber: number; machineNumber?: string; message: string }>;
}

/**
 * Intelligent Excel parser for Backlog Files supporting flexible column headers.
 * Required columns: Machine No., Machine Size, Department, Month, Backlog Qty, Priority, Planned Start Date, Target Date
 * Optional columns: Project Name, Customer Name, Product Model, Remarks, Existing Status
 */
export async function parseBacklogExcel(
  file: File,
  existingMachines: Machine[] = []
): Promise<BacklogValidationResult> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });

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

  // Build Machine lookup map
  const machineMap = new Map<string, Machine>();
  existingMachines.forEach((m) => {
    if (m.machineNumber) {
      machineMap.set(m.machineNumber.trim().toUpperCase(), m);
    }
  });

  // Keywords for column recognition
  const isSrKeyword = (c: string) => ['srno', 'sr', 'sno', 'slno', 'serialno', 'serial', 'seq'].includes(c);
  const isMonthKeyword = (c: string) => ['month', 'planmonth', 'monthyear', 'period'].includes(c);
  const isYearKeyword = (c: string) => ['year', 'planyear'].includes(c);
  const isDeptKeyword = (c: string) => ['department', 'dept', 'deptname', 'section', 'process', 'shop'].includes(c);
  const isMachineKeyword = (c: string) => ['machineno', 'machinenumber', 'machine', 'cmmno', 'cmmnumber', 'cmm', 'machineid'].includes(c);
  const isSizeKeyword = (c: string) => ['machinesize', 'cmmsize', 'size', 'specification', 'cmmspec'].includes(c);
  const isModelKeyword = (c: string) => ['model', 'productmodel', 'cmmmodel', 'machinemodel', 'product'].includes(c);
  const isProjKeyword = (c: string) => ['project', 'projectname'].includes(c);
  const isCustKeyword = (c: string) => ['customer', 'customername', 'client'].includes(c);
  const isPartKeyword = (c: string) => ['part', 'partname', 'partcode', 'component'].includes(c);
  const isOpKeyword = (c: string) => ['remainingoperation', 'operation', 'work', 'workdescription', 'task', 'pendingoperation', 'activity'].includes(c);
  const isBacklogQtyKeyword = (c: string) => ['backlogqty', 'backlogquantity', 'balqty', 'balanceqty', 'remainingqty', 'remainingquantity', 'pendingqty', 'qty', 'quantity'].includes(c);
  const isOrigQtyKeyword = (c: string) => ['originalquantity', 'originalqty', 'targetqty', 'targetquantity', 'plannedqty', 'totalqty'].includes(c);
  const isPlannedStartKeyword = (c: string) => ['plannedstartdate', 'plannedstart', 'startdate', 'start'].includes(c);
  const isTargetDateKeyword = (c: string) => ['targetdate', 'target', 'duedate', 'due', 'completiondate', 'scheduledate'].includes(c);
  const isPriorityKeyword = (c: string) => ['priority', 'prioritylevel', 'prio'].includes(c);
  const isRemarksKeyword = (c: string) => ['remarks', 'remark', 'comment', 'notes', 'note'].includes(c);
  const isStatusKeyword = (c: string) => ['existingstatus', 'status', 'currentstatus', 'machinestatus'].includes(c);

  let headerRowIdx = -1;
  let bestScore = 0;
  let srIdx = -1, monthIdx = -1, yearIdx = -1, deptIdx = -1, machIdx = -1, sizeIdx = -1, modelIdx = -1;
  let projIdx = -1, custIdx = -1, partIdx = -1, opIdx = -1, origQtyIdx = -1, remQtyIdx = -1;
  let planStartIdx = -1, dueIdx = -1, prioIdx = -1, remIdx = -1, statusIdx = -1;

  for (let i = 0; i < Math.min(rawData.length, 25); i++) {
    const row = rawData[i];
    if (!Array.isArray(row) || row.length === 0) continue;

    let curSr = -1, curMonth = -1, curYear = -1, curDept = -1, curMach = -1, curSize = -1, curModel = -1;
    let curProj = -1, curCust = -1, curPart = -1, curOp = -1, curOrigQty = -1, curRemQty = -1;
    let curPlanStart = -1, curDue = -1, curPrio = -1, curRem = -1, curStatus = -1;
    let score = 0;

    row.forEach((cell, idx) => {
      if (cell === undefined || cell === null) return;
      const clean = String(cell).toLowerCase().replace(/[^a-z0-9]/g, '');
      if (!clean) return;

      if (isMachineKeyword(clean) && curMach === -1) { curMach = idx; score += 5; }
      else if (isDeptKeyword(clean) && curDept === -1) { curDept = idx; score += 4; }
      else if (isSizeKeyword(clean) && curSize === -1) { curSize = idx; score += 4; }
      else if (isModelKeyword(clean) && curModel === -1) { curModel = idx; score += 3; }
      else if (isBacklogQtyKeyword(clean) && curRemQty === -1) { curRemQty = idx; score += 4; }
      else if (isPlannedStartKeyword(clean) && curPlanStart === -1) { curPlanStart = idx; score += 3; }
      else if (isTargetDateKeyword(clean) && curDue === -1) { curDue = idx; score += 4; }
      else if (isPriorityKeyword(clean) && curPrio === -1) { curPrio = idx; score += 3; }
      else if (isMonthKeyword(clean) && curMonth === -1) { curMonth = idx; score += 3; }
      else if (isOpKeyword(clean) && curOp === -1) { curOp = idx; score += 3; }
      else if (isOrigQtyKeyword(clean) && curOrigQty === -1) { curOrigQty = idx; score += 2; }
      else if (isYearKeyword(clean) && curYear === -1) { curYear = idx; score += 2; }
      else if (isProjKeyword(clean) && curProj === -1) { curProj = idx; score += 2; }
      else if (isCustKeyword(clean) && curCust === -1) { curCust = idx; score += 2; }
      else if (isPartKeyword(clean) && curPart === -1) { curPart = idx; score += 1; }
      else if (isStatusKeyword(clean) && curStatus === -1) { curStatus = idx; score += 2; }
      else if (isRemarksKeyword(clean) && curRem === -1) { curRem = idx; score += 1; }
      else if (isSrKeyword(clean) && curSr === -1) { curSr = idx; score += 1; }
    });

    if (score > bestScore) {
      bestScore = score;
      headerRowIdx = i;
      srIdx = curSr; monthIdx = curMonth; yearIdx = curYear; deptIdx = curDept;
      machIdx = curMach; sizeIdx = curSize; modelIdx = curModel;
      projIdx = curProj; custIdx = curCust; partIdx = curPart;
      opIdx = curOp; origQtyIdx = curOrigQty; remQtyIdx = curRemQty;
      planStartIdx = curPlanStart; dueIdx = curDue; prioIdx = curPrio; remIdx = curRem;
      statusIdx = curStatus;
    }
  }

  if (headerRowIdx === -1 || machIdx === -1) {
    throw new Error('Could not identify Machine Number column in the Excel file. Please use the template.');
  }

  const rawHeaders = rawData[headerRowIdx].map((c) => (c !== undefined && c !== null ? String(c).trim() : ''));
  const parsedRows: ParsedBacklogRow[] = [];
  const errors: Array<{ rowNumber: number; machineNumber?: string; reason: string; fixHint?: string }> = [];
  const warnings: Array<{ rowNumber: number; machineNumber?: string; message: string }> = [];
  const seenMachinesInFile = new Set<string>();
  const uniqueMachineSet = new Set<string>();
  let duplicateCount = 0;
  let newMachinesCount = 0;
  let updatedMachinesCount = 0;

  const currentYear = new Date().getFullYear();
  const currentMonthName = new Date().toLocaleString('default', { month: 'long' });

  for (let i = headerRowIdx + 1; i < rawData.length; i++) {
    const row = rawData[i];
    if (!Array.isArray(row) || row.every((c) => c === undefined || c === null || String(c).trim() === '')) {
      continue;
    }
    const rowNum = i + 1;

    // Machine Number
    let rawMach = row[machIdx];
    let machineNumber = String(rawMach !== undefined && rawMach !== null ? rawMach : '').trim();
    if (machineNumber.endsWith('.0')) machineNumber = machineNumber.slice(0, -2);

    // Department
    let rawDept = deptIdx !== -1 ? row[deptIdx] : '';
    let department = String(rawDept || '').trim();

    // Machine Size & Model
    let rawSize = sizeIdx !== -1 ? row[sizeIdx] : '';
    let machineSize = String(rawSize || '').trim();
    let rawModel = modelIdx !== -1 ? row[modelIdx] : '';
    let productModel = String(rawModel || (machineSize ? `ACCURA ${machineSize}` : '')).trim();

    // Month & Year
    let month = monthIdx !== -1 && row[monthIdx] ? String(row[monthIdx]).trim() : currentMonthName;
    let year = yearIdx !== -1 && row[yearIdx] ? String(row[yearIdx]).trim() : String(currentYear);

    // Quantities
    let rawRemQty = remQtyIdx !== -1 ? Number(row[remQtyIdx]) : 1;
    let remainingQuantity = isNaN(rawRemQty) || rawRemQty < 0 ? 1 : rawRemQty;
    let rawOrigQty = origQtyIdx !== -1 ? Number(row[origQtyIdx]) : remainingQuantity;
    let originalQuantity = isNaN(rawOrigQty) || rawOrigQty <= 0 ? remainingQuantity : rawOrigQty;

    // Operation / Work
    let rawOp = opIdx !== -1 ? row[opIdx] : '';
    let remainingOperation = String(rawOp || 'Pending Manufacturing Operations').trim();

    // Project, Customer, Part, Due Date, Priority, Remarks, Status
    let project = projIdx !== -1 && row[projIdx] ? String(row[projIdx]).trim() : '';
    let customer = custIdx !== -1 && row[custIdx] ? String(row[custIdx]).trim() : '';
    let part = partIdx !== -1 && row[partIdx] ? String(row[partIdx]).trim() : '';
    let plannedStartDate = planStartIdx !== -1 && row[planStartIdx] ? String(row[planStartIdx]).trim() : '';
    let targetDate = dueIdx !== -1 && row[dueIdx] ? String(row[dueIdx]).trim() : '';
    let priority = prioIdx !== -1 && row[prioIdx] ? String(row[prioIdx]).trim() : 'Medium';
    let remarks = remIdx !== -1 && row[remIdx] ? String(row[remIdx]).trim() : '';
    let existingStatus = statusIdx !== -1 && row[statusIdx] ? String(row[statusIdx]).trim() : 'In Progress';
    let srNo = srIdx !== -1 && !isNaN(Number(row[srIdx])) ? Number(row[srIdx]) : parsedRows.length + 1;

    let rowError: string | undefined = undefined;
    let rowWarning: string | undefined = undefined;

    // Validation
    if (!machineNumber) {
      rowError = 'Machine Number is missing.';
      errors.push({ rowNumber: rowNum, reason: rowError, fixHint: 'Provide a valid unique Machine No. (e.g., 2571)' });
    }

    if (!department) {
      rowError = 'Department is required for backlog allocation.';
      errors.push({ rowNumber: rowNum, machineNumber, reason: rowError, fixHint: 'Enter an active department (e.g., 02 Planning, 06-A Metal Shop)' });
    }

    if (!machineSize) {
      rowWarning = 'Machine size not specified; defaulting to Standard/Model.';
      warnings.push({ rowNumber: rowNum, machineNumber, message: rowWarning });
    }

    // Match against Machine Master
    const matchedMachine = machineNumber ? machineMap.get(machineNumber.toUpperCase()) : null;
    const isExisting = Boolean(matchedMachine);

    // Duplicate detection in file
    const mKey = `${machineNumber.toUpperCase()}_${department.toUpperCase()}`;
    let isDupInFile = false;
    if (machineNumber && seenMachinesInFile.has(mKey)) {
      duplicateCount++;
      isDupInFile = true;
      rowWarning = `Duplicate machine number #${machineNumber} within same department in file.`;
      warnings.push({ rowNumber: rowNum, machineNumber, message: rowWarning });
    } else if (machineNumber) {
      seenMachinesInFile.add(mKey);
    }

    if (machineNumber && !uniqueMachineSet.has(machineNumber.toUpperCase())) {
      uniqueMachineSet.add(machineNumber.toUpperCase());
      if (isExisting) {
        updatedMachinesCount++;
      } else {
        newMachinesCount++;
      }
    }

    parsedRows.push({
      rowNumber: rowNum,
      srNo,
      month,
      year,
      department,
      machineNumber,
      machineSize: machineSize || matchedMachine?.machineSize || matchedMachine?.model || 'Standard',
      productModel: productModel || matchedMachine?.model || (machineSize ? `ACCURA ${machineSize}` : 'Standard'),
      project: project || matchedMachine?.project || 'Standard CMM Series',
      customer: customer || matchedMachine?.customer || 'Accurate Gauging Plant',
      part,
      remainingOperation,
      originalQuantity,
      remainingQuantity,
      plannedStartDate: plannedStartDate || matchedMachine?.plannedStartDate || '',
      targetDate: targetDate || matchedMachine?.targetDate || '',
      dueDate: targetDate || matchedMachine?.targetDate || '',
      priority: priority || matchedMachine?.priority || 'Medium',
      remarks,
      existingStatus: existingStatus || matchedMachine?.currentStatus || 'In Progress',
      existingMachine: matchedMachine,
      isExistingMachine: isExisting,
      isDuplicateInFile: isDupInFile,
      isValid: !rowError,
      error: rowError,
      warning: rowWarning,
    });
  }

  return {
    fileName: file.name,
    headers: rawHeaders,
    totalRows: parsedRows.length,
    validRowsCount: parsedRows.filter((r) => r.isValid).length,
    invalidRowsCount: parsedRows.filter((r) => !r.isValid).length,
    duplicateRowsCount: duplicateCount,
    newMachinesCount,
    updatedMachinesCount,
    rows: parsedRows,
    errors,
    warnings,
  };
}

/**
 * Downloads standard Excel template for Backlog import with exact required columns:
 * 1. Machine No., 2. Machine Size, 3. Department, 4. Month, 5. Backlog Qty,
 * 6. Priority, 7. Planned Start Date, 8. Target Date, plus optional columns.
 */
export function downloadBacklogTemplate(): void {
  const headers = [
    'Machine No.',
    'Machine Size',
    'Department',
    'Month',
    'Backlog Qty',
    'Priority',
    'Planned Start Date',
    'Target Date',
    'Project Name',
    'Customer Name',
    'Product Model',
    'Remarks',
    'Existing Status',
  ];

  const sampleData = [
    [
      '2571',
      '564',
      '02 Planning',
      'October',
      1,
      'P01',
      '2026-10-01',
      '2026-10-31',
      'Standard CMM Series',
      'Accurate Gauging Plant',
      'ACCURA 564',
      'October Master Backlog Machine',
      'In Progress',
    ],
    [
      '2578',
      '8156',
      '06-A Metal Shop',
      'October',
      1,
      'P08',
      '2026-10-05',
      '2026-10-25',
      'Precision CMM Line',
      'Accurate Gauging Plant',
      'ACCURA 8156',
      'Base machining and milling carryover',
      'In Progress',
    ],
  ];

  const ws = XLSX.utils.aoa_to_sheet([headers, ...sampleData]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Machine_Backlog_Template');
  XLSX.writeFile(wb, 'Accurate_Machine_Backlog_Template.xlsx');
}

/**
 * Downloads comprehensive error report from validation results.
 */
export function downloadBacklogErrorReport(
  errors: Array<{ rowNumber: number; machineNumber?: string; reason: string; fixHint?: string }>
): void {
  const exportRows = errors.map((e) => ({
    'Row Number': e.rowNumber,
    'Machine Number': e.machineNumber || 'N/A',
    'Error Reason': e.reason,
    'Correction Required': e.fixHint || 'Please fill in the required field correctly in the Excel file.',
  }));
  const ws = XLSX.utils.json_to_sheet(exportRows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Import_Errors');
  XLSX.writeFile(wb, 'Backlog_Import_Validation_Errors.xlsx');
}

/**
 * Commits an approved batch of backlog items to Firestore, creating linked department work records
 * and configured roadmap stages. Never deletes existing records.
 */
export async function commitBacklogBatch(params: {
  batchName?: string;
  month: string;
  year: string;
  fileName: string;
  rows: ParsedBacklogRow[];
  duplicateAction?: 'update' | 'skip';
  userEmail?: string;
  userName?: string;
}): Promise<{ batchId: string; importedCount: number; updatedCount: number; skippedCount: number }> {
  const { batchName, month, year, fileName, rows, duplicateAction = 'update', userEmail, userName } = params;
  const validRows = rows.filter((r) => r.isValid);
  if (validRows.length === 0) {
    throw new Error('No valid backlog rows to import.');
  }

  const now = new Date().toISOString();
  const today = now.split('T')[0];
  const batchId = `BLB-${year}-${month.toUpperCase().slice(0, 3)}-${Date.now().toString().slice(-6)}`;
  let importedCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;

  // Group rows by Machine Number so that separate rows for different departments
  // map cleanly to the same machine record without creating duplicate machines
  const rowsByMachine = new Map<string, ParsedBacklogRow[]>();
  for (const row of validRows) {
    const cleanMach = row.machineNumber.trim().toUpperCase();
    if (!rowsByMachine.has(cleanMach)) {
      rowsByMachine.set(cleanMach, []);
    }
    rowsByMachine.get(cleanMach)!.push(row);
  }

  // Process machine by machine
  for (const [cleanMach, machRows] of rowsByMachine.entries()) {
    const primaryRow = machRows[0];
    const isExisting = Boolean(primaryRow.isExistingMachine);

    // If duplicate action is 'skip' and machine already exists, skip it
    if (isExisting && duplicateAction === 'skip') {
      skippedCount += machRows.length;
      continue;
    }

    // Determine machine route
    const isPlanning = machRows.some((r) => isDepartmentMatch(r.department, '02 Planning'));
    const machineRoute = isPlanning ? STANDARD_ROUTE_ORDER : machRows.map((r) => r.department);

    // 1. Synchronize / Upsert Machine Master
    try {
      const mQ = query(collection(db, 'machines'), where('machineNumber', '==', primaryRow.machineNumber.trim()));
      const mSnap = await getDocs(mQ);

      if (mSnap.empty) {
        // Create brand-new machine record
        const newMachine: Omit<Machine, 'id'> = {
          machineNumber: primaryRow.machineNumber.trim(),
          model: primaryRow.productModel || primaryRow.machineSize,
          machineModel: primaryRow.productModel || primaryRow.machineSize,
          machineSize: primaryRow.machineSize,
          size: primaryRow.machineSize,
          specification: primaryRow.machineSize,
          month: primaryRow.month || month,
          year: primaryRow.year || year,
          planMonth: primaryRow.month || month,
          planYear: primaryRow.year || year,
          priority: primaryRow.priority || 'Medium',
          currentDepartment: primaryRow.department,
          responsibleDepartment: primaryRow.department,
          nextDepartment: machineRoute.length > 1 ? machineRoute[1] : 'Dispatch',
          previousDepartment: '',
          project: primaryRow.project || 'Standard CMM Series',
          customer: primaryRow.customer || 'Accurate Gauging Plant',
          status: 'IN_PROGRESS',
          currentStatus: 'In Progress',
          currentWork: primaryRow.remainingOperation,
          progress: 0,
          overallProgressPercent: 0,
          departmentProgress: 0,
          plannedStartDate: primaryRow.plannedStartDate || today,
          targetDate: primaryRow.targetDate || primaryRow.dueDate || '',
          processRoute: machineRoute,
          remarks: primaryRow.remarks || `Imported via Backlog Batch [${batchId}]`,
          createdAt: now,
          updatedAt: now,
          createdBy: userEmail || userName || 'Backlog Import',
        };
        await addDoc(collection(db, 'machines'), cleanData(newMachine));
        importedCount += machRows.length;
      } else {
        // Update existing machine record without silent deletion
        const mDoc = mSnap.docs[0];
        const existingData = mDoc.data() as Machine;
        await updateDoc(mDoc.ref, {
          machineSize: primaryRow.machineSize || existingData.machineSize,
          model: primaryRow.productModel || existingData.model,
          machineModel: primaryRow.productModel || existingData.machineModel,
          currentDepartment: primaryRow.department || existingData.currentDepartment,
          responsibleDepartment: primaryRow.department || existingData.responsibleDepartment,
          plannedStartDate: primaryRow.plannedStartDate || existingData.plannedStartDate || today,
          targetDate: primaryRow.targetDate || existingData.targetDate || '',
          priority: primaryRow.priority || existingData.priority,
          hasBacklog: true,
          backlogOperation: primaryRow.remainingOperation,
          backlogRemainingQty: primaryRow.remainingQuantity,
          remarks: primaryRow.remarks ? `${existingData.remarks || ''}; ${primaryRow.remarks}`.trim() : existingData.remarks,
          updatedAt: now,
        });
        updatedCount += machRows.length;
      }
    } catch (mErr) {
      console.warn('Machine sync warning in backlog import:', mErr);
    }

    // 2. Process each department row for this machine
    for (const row of machRows) {
      const backlogId = `BL-${year}-${month.toUpperCase().slice(0, 3)}-${String(row.srNo).padStart(3, '0')}-${row.machineNumber.trim()}-${normalizeDepartmentKey(row.department)}`;

      const backlogDocData: BacklogItem = {
        id: backlogId,
        backlogId,
        month: row.month || month,
        year: row.year || year,
        department: row.department,
        machineNumber: row.machineNumber.trim(),
        machineSize: row.machineSize,
        project: row.project || 'Standard CMM Series',
        customer: row.customer || 'Accurate Gauging Plant',
        part: row.part || '',
        remainingOperation: row.remainingOperation,
        originalQuantity: row.originalQuantity,
        completedQuantity: 0,
        remainingQuantity: row.remainingQuantity,
        dueDate: row.targetDate || row.dueDate || '',
        priority: row.priority || 'Medium',
        status: 'Open',
        remarks: row.remarks || '',
        batchId,
        sourceFileName: fileName,
        createdAt: now,
        updatedAt: now,
        lastUpdated: now,
        createdBy: userEmail || userName || 'Administrator',
      };

      // Dual-write backlog item
      try {
        await setDoc(doc(db, 'backlog_items', backlogId), cleanData(backlogDocData), { merge: true });
        await setDoc(doc(db, 'backlogItems', backlogId), cleanData(backlogDocData), { merge: true });
      } catch {}

      // 3. Create or update department work item in department_work
      try {
        const dwQuery = query(
          collection(db, 'department_work'),
          where('machineNumber', '==', row.machineNumber.trim()),
          where('department', '==', row.department)
        );
        const dwSnap = await getDocs(dwQuery);
        if (dwSnap.empty) {
          await addDoc(collection(db, 'department_work'), {
            title: `[BACKLOG] ${row.remainingOperation} - Machine ${row.machineNumber.trim()}`,
            department: row.department,
            machineNumber: row.machineNumber.trim(),
            machineModel: row.productModel || row.machineSize,
            machineSize: row.machineSize,
            operationWork: row.remainingOperation,
            category: 'Backlog',
            plannedQuantity: row.originalQuantity,
            actualQuantity: 0,
            status: 'In Progress',
            priority: row.priority || 'Medium',
            assignedTo: 'Department Team',
            assignedDate: row.plannedStartDate || today,
            targetDate: row.targetDate || row.dueDate || '',
            dueDate: row.targetDate || row.dueDate || '',
            remarks: `Imported from Backlog Batch [${batchId}]`,
            progress: 0,
            month: row.month || month,
            year: row.year || year,
            planMonth: row.month || month,
            planYear: row.year || year,
            isResponsible: true,
            createdAt: now,
            updatedAt: now,
            createdBy: userEmail || userName || 'Backlog Allocation',
          });
        } else {
          // Update existing department work
          const existingDwDoc = dwSnap.docs[0];
          await updateDoc(existingDwDoc.ref, {
            plannedQuantity: row.originalQuantity,
            priority: row.priority || 'Medium',
            targetDate: row.targetDate || row.dueDate || '',
            dueDate: row.targetDate || row.dueDate || '',
            remarks: `Updated via Backlog Batch [${batchId}]`,
            updatedAt: now,
          });
        }
      } catch (dwErr) {
        console.warn('department_work link warning in backlog import:', dwErr);
      }

      // 4. Send live notification to assigned department
      try {
        await createNotification({
          recipientDepartment: row.department,
          toDepartment: row.department,
          fromDepartment: '02 Planning',
          title: `Backlog Work Assigned: Machine ${row.machineNumber.trim()}`,
          message: `Machine ${row.machineNumber.trim()} (${row.machineSize}) allocated with backlog task: "${row.remainingOperation}". Priority: ${row.priority}. Due: ${row.targetDate || row.dueDate || 'Immediate'}.`,
          type: 'BACKLOG_ASSIGNED',
          machineNumber: row.machineNumber.trim(),
          priority: row.priority,
          status: 'UNREAD',
        });
      } catch {}
    }
  }

  // 5. Record upload history in import_history
  try {
    await recordImportHistory(
      {
        fileName,
        uploadedBy: userName || userEmail || 'Administrator',
        uploadedByEmail: userEmail,
        uploadDateTime: now,
        totalRows: rows.length,
        importedCount,
        duplicateCount: updatedCount + skippedCount,
        invalidCount: rows.length - validRows.length,
        status: rows.length - validRows.length > 0 ? 'Partial' : 'Completed',
        module: 'Machine Backlog Import',
        errorDetails:
          rows.length - validRows.length > 0
            ? `${rows.length - validRows.length} invalid rows skipped; ${updatedCount} updated; ${skippedCount} duplicates skipped.`
            : undefined,
      },
      userEmail
    );
  } catch (histErr) {
    console.warn('Import history record warning:', histErr);
  }

  // Admin audit log
  await logAudit(
    'IMPORT_BACKLOG',
    'BACKLOG',
    batchId,
    `${month} ${year}`,
    `Imported ${importedCount} backlog items, updated ${updatedCount}, skipped ${skippedCount} from ${fileName}`,
    userEmail
  );

  return { batchId, importedCount, updatedCount, skippedCount };
}

/**
 * Real-time subscription to backlog items.
 */
export function subscribeBacklogItems(
  departmentName: string | undefined,
  callback: (items: BacklogItem[]) => void
) {
  const colRef = collection(db, 'backlog_items');
  return onSnapshot(
    colRef,
    (snap) => {
      let items = snap.docs.map((d) => ({ id: d.id, ...d.data() } as BacklogItem));
      if (departmentName && departmentName !== 'All Departments') {
        items = items.filter((item) => isDepartmentMatch(item.department, departmentName));
      }
      callback(items);
    },
    (err) => {
      console.error('Error subscribing to backlog_items:', err);
      callback([]);
    }
  );
}

/**
 * Updates a backlog item status and remaining quantity.
 */
export async function updateBacklogItem(
  id: string,
  updates: Partial<BacklogItem>,
  userEmail?: string
) {
  const now = new Date().toISOString();
  const ref = doc(db, 'backlog_items', id);
  await updateDoc(ref, cleanData({ ...updates, updatedAt: now, lastUpdated: now, updatedBy: userEmail }));
  try {
    await updateDoc(doc(db, 'backlogItems', id), cleanData({ ...updates, updatedAt: now, lastUpdated: now }));
  } catch {}

  await logAudit('UPDATE_BACKLOG', 'BACKLOG', id, '', JSON.stringify(updates), userEmail);
}

/**
 * Automatically adjusts backlog status and remaining quantity when a daily operation update is saved.
 */
export async function recordBacklogDailyExecution(
  machineNumber: string,
  department: string,
  operationName: string,
  completedQty: number = 1,
  userEmail?: string
): Promise<void> {
  try {
    const q = query(
      collection(db, 'backlog_items'),
      where('machineNumber', '==', machineNumber.trim())
    );
    const snap = await getDocs(q);
    const now = new Date().toISOString();

    for (const d of snap.docs) {
      const item = d.data() as BacklogItem;
      if (isDepartmentMatch(item.department, department) && item.status !== 'Completed') {
        const newCompleted = (item.completedQuantity || 0) + completedQty;
        const newRemaining = Math.max(0, item.originalQuantity - newCompleted);
        const newStatus: BacklogStatus = newRemaining === 0 ? 'Completed' : 'Partially Completed';

        await updateDoc(d.ref, {
          completedQuantity: newCompleted,
          remainingQuantity: newRemaining,
          status: newStatus,
          updatedAt: now,
          lastUpdated: now,
          updatedBy: userEmail || 'Daily Operation Update',
        });

        // Also update machine record
        const mQ = query(collection(db, 'machines'), where('machineNumber', '==', machineNumber.trim()));
        const mSnap = await getDocs(mQ);
        for (const mDoc of mSnap.docs) {
          await updateDoc(mDoc.ref, {
            backlogRemainingQty: newRemaining,
            hasBacklog: newRemaining > 0,
            updatedAt: now,
          });
        }
      }
    }
  } catch (err) {
    console.warn('Notice recording backlog daily execution:', err);
  }
}
