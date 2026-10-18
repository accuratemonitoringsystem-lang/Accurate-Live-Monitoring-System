import { Machine, MachineHistoryEntry } from '../types';
import { isDepartmentMatch } from './departmentUtils';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { logAudit } from '../services/db';

/**
 * Standard complete factory process route from Planning through Packing & Dispatch
 */
export const DEFAULT_MACHINE_ROUTE: string[] = [
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
  '10-B Paint Shop-Guard Set',
  '11-A Electronics-Cable Set',
  '11-B Electronics-Tuning',
  '12 Assembly',
  '12 Bridge Assembly',
  '13 IT-Computer Inspection',
  '14 Calibration',
  '15 Packing',
];

/**
 * Returns the effective process route for a given machine.
 * Fallbacks to DEFAULT_MACHINE_ROUTE if not explicitly defined.
 */
export function getMachineRoute(machine?: Machine | null): string[] {
  if (machine && Array.isArray(machine.processRoute) && machine.processRoute.length > 0) {
    return machine.processRoute;
  }
  return DEFAULT_MACHINE_ROUTE;
}

/**
 * Finds the index of a department within a machine's process route.
 */
export function findDepartmentIndexInRoute(deptName: string, route: string[]): number {
  if (!deptName) return -1;
  const cleanTarget = deptName.trim().toLowerCase();

  // 1. Direct exact or isDepartmentMatch
  const directIdx = route.findIndex(
    (r) => r.toLowerCase() === cleanTarget || isDepartmentMatch(r, deptName)
  );
  if (directIdx !== -1) return directIdx;

  // 2. Planning match
  if (cleanTarget.includes('plan')) {
    const pIdx = route.findIndex((r) => r.toLowerCase().includes('plan'));
    if (pIdx !== -1) return pIdx;
  }

  // 3. Design match
  if (cleanTarget.includes('design')) {
    const dIdx = route.findIndex((r) => r.toLowerCase().includes('design'));
    if (dIdx !== -1) return dIdx;
  }

  // 4. Quality match
  if (cleanTarget.includes('inward quality')) {
    const qIdx = route.findIndex((r) => r.toLowerCase().includes('inward'));
    if (qIdx !== -1) return qIdx;
  } else if (cleanTarget.includes('quality')) {
    const qIdx = route.findIndex(
      (r) => r.toLowerCase().includes('final quality') || r.toLowerCase().includes('quality')
    );
    if (qIdx !== -1) return qIdx;
  }

  // 5. Electronics
  if (cleanTarget.includes('elect')) {
    const eIdx = route.findIndex((r) => r.toLowerCase().includes('elect'));
    if (eIdx !== -1) return eIdx;
  }

  // 6. Packing / Dispatch
  if (cleanTarget.includes('pack') || cleanTarget.includes('dispatch')) {
    const pIdx = route.findIndex(
      (r) => r.toLowerCase().includes('pack') || r.toLowerCase().includes('dispatch')
    );
    if (pIdx !== -1) return pIdx;
  }

  return -1;
}

/**
 * Gets the next department in route for a machine.
 */
export function getNextDepartmentForMachine(
  machine?: Machine | null,
  currentDept?: string
): string | null {
  if (!machine) return null;
  const route = getMachineRoute(machine);
  const targetDept = currentDept || machine.currentDepartment;
  const currentIdx = findDepartmentIndexInRoute(targetDept, route);

  if (currentIdx >= 0 && currentIdx < route.length - 1) {
    return route[currentIdx + 1];
  }
  return null;
}

/**
 * Gets the previous department in route for a machine.
 */
export function getPreviousDepartmentForMachine(
  machine?: Machine | null,
  currentDept?: string
): string | null {
  if (!machine) return null;
  const route = getMachineRoute(machine);
  const targetDept = currentDept || machine.currentDepartment;
  const currentIdx = findDepartmentIndexInRoute(targetDept, route);

  if (currentIdx > 0) {
    return route[currentIdx - 1];
  }
  return null;
}

/**
 * Calculates duration string (e.g. "2 days", "4 days", "Today") between two dates.
 */
export function calculateDepartmentDuration(startDate?: string, endDate?: string): string {
  if (!startDate) return '1 day';
  const start = new Date(startDate);
  const end = endDate ? new Date(endDate) : new Date();

  const diffTime = Math.abs(end.getTime() - start.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays <= 0) return 'Same day';
  if (diffDays === 1) return '1 day';
  return `${diffDays} days`;
}

/**
 * Calculates numeric duration in days.
 */
export function calculateDurationDays(startDate?: string, endDate?: string): number {
  if (!startDate) return 1;
  const start = new Date(startDate);
  const end = endDate ? new Date(endDate) : new Date();
  const diffTime = Math.abs(end.getTime() - start.getTime());
  return Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
}

/**
 * Admin action: Save updated process route for a machine to Firestore
 */
export async function saveMachineProcessRoute(
  machineId: string,
  route: string[],
  userEmail?: string
): Promise<void> {
  if (!machineId) throw new Error('Machine ID is required');
  if (!Array.isArray(route) || route.length === 0) {
    throw new Error('Process route must contain at least one department');
  }

  const now = new Date().toISOString();
  const mRef = doc(db, 'machines', machineId);

  await updateDoc(mRef, {
    processRoute: route,
    updatedAt: now,
  });

  await logAudit(
    'UPDATE_MACHINE_PROCESS_ROUTE',
    'MACHINES',
    machineId,
    '',
    `Route updated: ${route.join(' → ')}`,
    userEmail
  );
}
