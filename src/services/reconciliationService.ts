import {
  collection,
  getDocs,
  doc,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { db } from '../firebase';
import { Machine, DepartmentWork, MonthlyPlan } from '../types';
import { INITIAL_DEPARTMENTS } from '../constants';
import { isDepartmentMatch } from '../utils/departmentUtils';
import {
  areMachineNumbersEqual,
  cleanMonthYear,
  getMachineDisplaySize,
  normalizeMachineNumber,
} from '../utils/machineUtils';

export interface ReconciliationReport {
  totalPlansInspected: number;
  machinesCreated: number;
  machinesUpdated: number;
  planningAssignmentsCreated: number;
  planningAssignmentsUpdated: number;
  routeAssignmentsCreated: number;
  alreadyExistingCount: number;
  invalidCount: number;
  reconciledMachineNumbers: string[];
  errors: string[];
}

export const DEFAULT_MANUFACTURING_ROUTE = [
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
 * Reconciles saved Monthly Plans (e.g. October 2026) with Machine Master and Department Work.
 * Idempotent: Will not overwrite existing valid assignments, progress, or handover histories.
 * High-performance: Fetches collections in parallel and matches in memory.
 */
export async function reconcileMonthlyPlanAssignments(options?: {
  targetMonth?: string;
  targetYear?: string;
  userEmail?: string;
}): Promise<ReconciliationReport> {
  const now = new Date().toISOString();
  const today = now.split('T')[0];

  const report: ReconciliationReport = {
    totalPlansInspected: 0,
    machinesCreated: 0,
    machinesUpdated: 0,
    planningAssignmentsCreated: 0,
    planningAssignmentsUpdated: 0,
    routeAssignmentsCreated: 0,
    alreadyExistingCount: 0,
    invalidCount: 0,
    reconciledMachineNumbers: [],
    errors: [],
  };

  try {
    // 1. Pre-fetch in parallel
    const [plansSnap, machinesSnap, dwSnap] = await Promise.all([
      getDocs(collection(db, 'monthly_plans')),
      getDocs(collection(db, 'machines')),
      getDocs(collection(db, 'department_work')),
    ]);

    report.totalPlansInspected = plansSnap.size;

    // Cache machines by normalized machine number
    const machinesByNum = new Map<string, { id: string; ref: any; data: Machine }>();
    machinesSnap.docs.forEach((d) => {
      const data = d.data() as Machine;
      const norm = normalizeMachineNumber(data.machineNumber);
      if (norm) {
        machinesByNum.set(norm, { id: d.id, ref: d.ref, data });
        const bare = norm.replace(/^(MACH|CMM)[-_ ]*/i, '');
        if (bare && bare !== norm) {
          machinesByNum.set(bare, { id: d.id, ref: d.ref, data });
        }
      }
    });

    // Cache department_work by `${normalizedMachineNumber}|${canonicalDepartment}`
    const dwByMachineAndDept = new Map<string, { id: string; ref: any; data: DepartmentWork }>();
    dwSnap.docs.forEach((d) => {
      const data = d.data() as DepartmentWork;
      const norm = normalizeMachineNumber(data.machineNumber);
      if (norm && data.department) {
        dwByMachineAndDept.set(`${norm}|${data.department}`, { id: d.id, ref: d.ref, data });
        const bare = norm.replace(/^(MACH|CMM)[-_ ]*/i, '');
        if (bare && bare !== norm) {
          dwByMachineAndDept.set(`${bare}|${data.department}`, { id: d.id, ref: d.ref, data });
        }
      }
    });

    for (const pDoc of plansSnap.docs) {
      const p = pDoc.data() as MonthlyPlan;
      const cleanNum = normalizeMachineNumber(p.machineNumber);

      if (!cleanNum) {
        report.invalidCount++;
        continue;
      }

      const { month: cleanMonth, year: cleanYear } = cleanMonthYear(p.month, p.year);

      // If specific month requested, filter
      if (options?.targetMonth && options.targetMonth !== 'all') {
        const reqMonth = options.targetMonth.toLowerCase();
        if (
          cleanMonth.toLowerCase() !== reqMonth &&
          !cleanMonth.toLowerCase().includes(reqMonth) &&
          !String(p.month).toLowerCase().includes(reqMonth)
        ) {
          continue;
        }
      }

      // Robust resolution of machine size from all possible fields
      const rawPlanSize =
        (p.machineSize && p.machineSize !== 'Standard' ? p.machineSize : '') ||
        (p.machineModel && p.machineModel !== 'Standard' ? p.machineModel : '') ||
        ((p as any).cmmSize && (p as any).cmmSize !== 'Standard' ? (p as any).cmmSize : '') ||
        (p.specification && p.specification !== 'Standard' ? p.specification : '') ||
        ((p as any).size && (p as any).size !== 'Standard' ? (p as any).size : '') ||
        (p.model && p.model !== 'Standard' ? p.model : '') ||
        getMachineDisplaySize(p as any);

      const machineSizeVal =
        rawPlanSize && rawPlanSize !== 'Size not available' && rawPlanSize.trim() !== '-'
          ? rawPlanSize.trim()
          : 'Standard';

      const priorityCode = p.priority || `P${String(p.sequenceNumber || 1).padStart(2, '0')}`;

      // Build initial process stages for roadmap
      const initialStages: Record<string, any> = {};
      DEFAULT_MANUFACTURING_ROUTE.forEach((dept, sIdx) => {
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

      // 1. RECONCILE MACHINE IN `machines` COLLECTION
      const bareNum = cleanNum.replace(/^(MACH|CMM)[-_ ]*/i, '');
      const existingMachineEntry =
        machinesByNum.get(cleanNum) ||
        (bareNum ? machinesByNum.get(bareNum) : undefined) ||
        Array.from(machinesByNum.values()).find((m) => areMachineNumbersEqual(m.data.machineNumber, cleanNum));

      if (!existingMachineEntry) {
        // Machine does not exist in Machine Master -> Create it
        const newMachine: Omit<Machine, 'id'> = {
          machineNumber: cleanNum,
          model: machineSizeVal,
          machineModel: machineSizeVal,
          machineSize: machineSizeVal,
          size: machineSizeVal,
          specification: machineSizeVal,
          currentDepartment: '02 Planning',
          responsibleDepartment: '02 Planning',
          project: p.project || p.projectName || '',
          customer: p.customer || p.client || '',
          planMonth: cleanMonth,
          planYear: cleanYear,
          month: cleanMonth,
          year: cleanYear,
          planName: `${cleanMonth} ${cleanYear} Plan`,
          priority: priorityCode,
          sequenceNumber: p.sequenceNumber || 1,
          status: 'IN_PROGRESS',
          currentStatus: 'In Progress',
          currentWork: 'Planned Manufacturing Operations for 02 Planning',
          progress: 0,
          overallProgressPercent: 0,
          departmentProgress: 0,
          plannedStartDate: p.plannedStartDate || today,
          plannedDueDate: p.plannedEndDate || '',
          targetDate: p.plannedEndDate || '',
          dueDate: p.plannedEndDate || '',
          processRoute: DEFAULT_MANUFACTURING_ROUTE,
          processStages: initialStages,
          createdAt: p.createdAt || now,
          updatedAt: now,
          createdBy: options?.userEmail || 'Reconciliation Service',
        };
        const mRef = doc(db, 'machines', `MACH-${cleanNum}`);
        await setDoc(mRef, cleanData(newMachine), { merge: true });
        machinesByNum.set(cleanNum, { id: `MACH-${cleanNum}`, ref: mRef, data: { id: `MACH-${cleanNum}`, ...newMachine } });
        if (bareNum && bareNum !== cleanNum) {
          machinesByNum.set(bareNum, { id: `MACH-${cleanNum}`, ref: mRef, data: { id: `MACH-${cleanNum}`, ...newMachine } });
        }
        report.machinesCreated++;
      } else {
        // Machine exists -> Enrich missing metadata & ensure machineSize is non-empty
        const existingData = existingMachineEntry.data;
        const existingSize = getMachineDisplaySize(existingData);
        const resolvedSize =
          existingSize !== 'Size not available' && existingSize !== 'Standard'
            ? existingSize
            : (machineSizeVal !== 'Standard' ? machineSizeVal : existingData.model || 'Standard');

        const updates: Partial<Machine> = {
          model: resolvedSize,
          machineModel: resolvedSize,
          machineSize: resolvedSize,
          size: resolvedSize,
          specification: resolvedSize,
          planMonth: existingData.planMonth || cleanMonth,
          planYear: existingData.planYear || cleanYear,
          month: existingData.month || cleanMonth,
          year: existingData.year || cleanYear,
          planName: existingData.planName || `${cleanMonth} ${cleanYear} Plan`,
          priority: existingData.priority || priorityCode,
          sequenceNumber: existingData.sequenceNumber || p.sequenceNumber || 1,
          updatedAt: now,
        };

        if (!existingData.processRoute || existingData.processRoute.length === 0) {
          updates.processRoute = DEFAULT_MANUFACTURING_ROUTE;
        }
        if (!existingData.processStages || Object.keys(existingData.processStages).length === 0) {
          updates.processStages = initialStages;
        }

        await updateDoc(existingMachineEntry.ref, cleanData(updates));
        report.machinesUpdated++;
      }

      // 2. RECONCILE PLANNING WORK IN `department_work`
      const planningKey = `${cleanNum}|02 Planning`;
      const barePlanningKey = bareNum ? `${bareNum}|02 Planning` : '';
      const existingPlanWork =
        dwByMachineAndDept.get(planningKey) ||
        (barePlanningKey ? dwByMachineAndDept.get(barePlanningKey) : undefined) ||
        Array.from(dwByMachineAndDept.values()).find(
          (entry) => areMachineNumbersEqual(entry.data.machineNumber, cleanNum) && isDepartmentMatch(entry.data.department, '02 Planning')
        );

      const targetSize = machineSizeVal !== 'Standard' ? machineSizeVal : (existingMachineEntry?.data.machineSize || machineSizeVal);

      const planningPayload: Omit<DepartmentWork, 'id'> = {
        title: `Planned Production Work - Machine ${cleanNum}`,
        department: '02 Planning',
        machineNumber: cleanNum,
        machineModel: targetSize,
        machineSize: targetSize,
        specification: targetSize,
        operationWork: 'Planned Manufacturing Operations for 02 Planning',
        category: 'Production',
        month: cleanMonth,
        year: cleanYear,
        planMonth: cleanMonth,
        planYear: cleanYear,
        plannedQuantity: p.plannedQuantity || 1,
        actualQuantity: 0,
        status: 'In Progress', // Planning is the active starting department
        isResponsible: true,
        priority: (p.priority as any) || 'Medium',
        assignedTo: 'Planning Team',
        assignedDate: today,
        targetDate: p.plannedEndDate || '',
        dueDate: p.plannedEndDate || '',
        remarks: `Allocated from ${cleanMonth} ${cleanYear} Monthly Plan`,
        progress: 0,
        createdAt: p.createdAt || now,
        updatedAt: now,
        createdBy: options?.userEmail || 'Reconciliation Service',
      };

      if (!existingPlanWork) {
        const planDwId = `DW-${cleanNum}-02PL`;
        const dwRef = doc(db, 'department_work', planDwId);
        await setDoc(dwRef, cleanData(planningPayload), { merge: true });
        dwByMachineAndDept.set(planningKey, { id: planDwId, ref: dwRef, data: { id: planDwId, ...planningPayload } });
        if (barePlanningKey) {
          dwByMachineAndDept.set(barePlanningKey, { id: planDwId, ref: dwRef, data: { id: planDwId, ...planningPayload } });
        }
        report.planningAssignmentsCreated++;
      } else {
        const existingDw = existingPlanWork.data;
        await updateDoc(existingPlanWork.ref, cleanData({
          machineModel: targetSize,
          machineSize: targetSize,
          specification: targetSize,
          month: cleanMonth,
          year: cleanYear,
          planMonth: cleanMonth,
          planYear: cleanYear,
          isResponsible: true,
          status: existingDw.status || 'In Progress',
          updatedAt: now,
        }));
        report.planningAssignmentsUpdated++;
      }

      // 3. RECONCILE DOWNSTREAM ROUTE WORK IN `department_work` (status: 'Pending')
      for (const deptName of DEFAULT_MANUFACTURING_ROUTE) {
        if (isDepartmentMatch(deptName, '02 Planning')) continue;
        const dDef = INITIAL_DEPARTMENTS.find((d) => isDepartmentMatch(d.name, deptName));
        const dCode = dDef?.code || deptName.slice(0, 4).replace(/[^a-zA-Z0-9]/g, '');
        const routeKey = `${cleanNum}|${deptName}`;
        const bareRouteKey = bareNum ? `${bareNum}|${deptName}` : '';

        const existingRouteWork =
          dwByMachineAndDept.get(routeKey) ||
          (bareRouteKey ? dwByMachineAndDept.get(bareRouteKey) : undefined) ||
          Array.from(dwByMachineAndDept.values()).find(
            (entry) => areMachineNumbersEqual(entry.data.machineNumber, cleanNum) && isDepartmentMatch(entry.data.department, deptName)
          );

        if (!existingRouteWork) {
          const dwDocId = `DW-${cleanNum}-${dCode}`;
          const routeWork: Omit<DepartmentWork, 'id'> = {
            title: `Planned Production Work - Machine ${cleanNum}`,
            department: deptName,
            machineNumber: cleanNum,
            machineModel: targetSize,
            machineSize: targetSize,
            specification: targetSize,
            operationWork: `Planned Manufacturing Operations for ${deptName}`,
            category: 'Production',
            month: cleanMonth,
            year: cleanYear,
            planMonth: cleanMonth,
            planYear: cleanYear,
            plannedQuantity: p.plannedQuantity || 1,
            actualQuantity: 0,
            status: 'Pending', // Downstream stations are pending until handed over
            isResponsible: false,
            priority: (p.priority as any) || 'Medium',
            assignedTo: 'Department Team',
            assignedDate: today,
            targetDate: '',
            dueDate: '',
            remarks: `Allocated from ${cleanMonth} ${cleanYear} Monthly Plan`,
            progress: 0,
            createdAt: p.createdAt || now,
            updatedAt: now,
            createdBy: options?.userEmail || 'Reconciliation Service',
          };
          const dwRef = doc(db, 'department_work', dwDocId);
          await setDoc(dwRef, cleanData(routeWork), { merge: true });
          dwByMachineAndDept.set(routeKey, { id: dwDocId, ref: dwRef, data: { id: dwDocId, ...routeWork } });
          if (bareRouteKey) {
            dwByMachineAndDept.set(bareRouteKey, { id: dwDocId, ref: dwRef, data: { id: dwDocId, ...routeWork } });
          }
          report.routeAssignmentsCreated++;
        } else {
          // Enrich missing machineSize / planMonth on downstream work
          await updateDoc(existingRouteWork.ref, cleanData({
            machineModel: targetSize,
            machineSize: targetSize,
            specification: targetSize,
            month: cleanMonth,
            year: cleanYear,
            planMonth: cleanMonth,
            planYear: cleanYear,
            updatedAt: now,
          }));
        }
      }

      // 4. Update monthly_plans document to status: RELEASED with cleanMonth, cleanYear, machineSize
      await updateDoc(pDoc.ref, cleanData({
        status: 'RELEASED',
        month: cleanMonth,
        year: cleanYear,
        machineSize: targetSize,
        machineModel: targetSize,
        updatedAt: now,
      }));

      report.reconciledMachineNumbers.push(cleanNum);
    }
  } catch (err: any) {
    console.warn('Notice in monthly plan reconciliation:', err?.message || String(err));
    report.errors.push(err?.message || String(err));
  }

  return report;
}
