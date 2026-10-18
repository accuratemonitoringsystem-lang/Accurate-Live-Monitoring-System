import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  where,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import {
  DepartmentHandover,
  HandoverHistoryEntry,
  Machine,
  QualityHandover,
  SystemNotification,
} from '../types';
import { isDepartmentMatch } from '../utils/departmentUtils';
import {
  calculateDepartmentDuration,
  calculateDurationDays,
  getNextDepartmentForMachine,
} from '../utils/routeUtils';
import {
  cleanData,
  createNotification,
  createQualityHandover,
  logAudit,
  qualityAcceptHandover,
  qualityHoldHandover,
  qualityRejectHandover,
  resubmitHandoverToQuality,
} from './db';
import {
  addDoc as _addDoc,
  setDoc as _setDoc,
  updateDoc as _updateDoc,
} from 'firebase/firestore';

const addDoc = async (reference: any, data: any) => _addDoc(reference, cleanData(data));
const setDoc = async (reference: any, data: any, options?: any) =>
  options ? _setDoc(reference, cleanData(data), options) : _setDoc(reference, cleanData(data));
const updateDoc = async (reference: any, data: any, ...more: any[]) =>
  more.length > 0
    ? (_updateDoc as any)(reference, cleanData(data), ...more)
    : _updateDoc(reference, cleanData(data));

/**
 * Generates unique formatted handover ID: HO-YYYY-XXXXX (e.g. HO-2026-00001)
 */
export async function generateDepartmentHandoverId(): Promise<string> {
  const currentYear = new Date().getFullYear();
  try {
    let maxNum = 0;
    // Check departmentHandovers
    const snap1 = await getDocs(collection(db, 'departmentHandovers'));
    snap1.docs.forEach((d) => {
      const hId = d.data().handoverId;
      if (typeof hId === 'string' && hId.startsWith(`HO-${currentYear}-`)) {
        const parts = hId.split('-');
        const n = parseInt(parts[2], 10);
        if (!isNaN(n) && n > maxNum) maxNum = n;
      }
    });

    // Also check department_handovers
    const snap2 = await getDocs(collection(db, 'department_handovers'));
    snap2.docs.forEach((d) => {
      const hId = d.data().handoverId;
      if (typeof hId === 'string' && hId.startsWith(`HO-${currentYear}-`)) {
        const parts = hId.split('-');
        const n = parseInt(parts[2], 10);
        if (!isNaN(n) && n > maxNum) maxNum = n;
      }
    });

    const nextNum = maxNum + 1;
    return `HO-${currentYear}-${String(nextNum).padStart(5, '0')}`;
  } catch (err) {
    console.error('Error generating department handover ID:', err);
    return `HO-${currentYear}-${Date.now().toString().slice(-5)}`;
  }
}

/**
 * Creates and dispatches a department-to-department handover.
 * Guarantees real persistence in Firestore, live notification to receiving department,
 * workflow history record, and optional Quality dispatch if destined for Quality.
 */
export async function createHandover(
  data: {
    handoverId?: string;
    machineNumber: string;
    machineModel?: string;
    machineSize?: string;
    modelSize?: string;
    project?: string;
    customer?: string;
    fromDepartment: string;
    toDepartment: string;
    process?: string;
    operation: string;
    partCode?: string;
    quantity?: number;
    currentStatus?: string;
    handoverDate?: string;
    requiredDate?: string;
    priority?: string;
    employee?: string;
    remarks?: string;
    attachment?: string;
    attachmentUrl?: string;
  },
  userEmail?: string
): Promise<{ id: string; handoverId: string }> {
  // Step 1: Validation
  if (!data.machineNumber?.trim()) {
    throw new Error('Machine Number is mandatory for handover.');
  }
  if (!data.toDepartment?.trim()) {
    throw new Error('Receiving Department is required.');
  }
  if (isDepartmentMatch(data.fromDepartment, data.toDepartment)) {
    throw new Error('Current Department and Receiving Department cannot be identical.');
  }
  if (!data.operation?.trim()) {
    throw new Error('Operation or Work Description is required.');
  }

  const now = new Date().toISOString();
  const today = now.split('T')[0];
  const handoverId = data.handoverId || (await generateDepartmentHandoverId());

  const payload: Omit<DepartmentHandover, 'id'> = {
    handoverId,
    machineNumber: data.machineNumber.trim(),
    machineSize: (data as any).machineSize || data.machineModel || data.modelSize || '',
    machineModel: data.machineModel || data.modelSize || (data as any).machineSize || '',
    modelSize: data.modelSize || data.machineModel || (data as any).machineSize || '',
    project: data.project || '',
    customer: data.customer || '',
    fromDepartment: data.fromDepartment,
    sendingDepartment: data.fromDepartment,
    toDepartment: data.toDepartment,
    receivingDepartment: data.toDepartment,
    process: data.process || '',
    operation: data.operation.trim(),
    workDescription: data.operation.trim(),
    partCode: data.partCode || '',
    quantity: Number(data.quantity) || 1,
    currentStatus: data.currentStatus || 'In Progress',
    handoverDate: data.handoverDate || today,
    date: data.handoverDate || today,
    requiredDate: data.requiredDate || '',
    priority: data.priority || 'Medium',
    employee: data.employee || userEmail || 'Operator',
    remarks: data.remarks?.trim() || '',
    attachment: data.attachment || data.attachmentUrl || '',
    attachmentUrl: data.attachment || data.attachmentUrl || '',
    status: 'SENT',
    createdAt: now,
    updatedAt: now,
    createdBy: data.employee || userEmail || 'Operator',
  };

  // Step 3: Write to departmentHandovers
  const ref = await addDoc(collection(db, 'departmentHandovers'), payload);

  // Dual-write to department_handovers with same ID for backwards-compatibility
  try {
    await setDoc(doc(db, 'department_handovers', ref.id), { id: ref.id, ...payload });
  } catch (e) {
    console.warn('department_handovers sync warning:', e);
  }

  // Step 4: Create real notification for RECEIVING DEPARTMENT
  await createNotification({
    recipientDepartment: data.toDepartment,
    toDepartment: data.toDepartment,
    fromDepartment: data.fromDepartment,
    recipientRole: 'DEPARTMENT USER',
    type: 'DEPARTMENT_HANDOVER',
    title: 'New Work Handover Received',
    message: `Machine ${data.machineNumber} (${data.operation}) has been handed over from ${data.fromDepartment} to ${data.toDepartment}. Please accept to begin work. [${handoverId}]`,
    handoverId,
    machineNumber: data.machineNumber,
    machineModel: payload.machineModel,
    process: data.process,
    operation: data.operation,
    priority: data.priority,
    status: 'UNREAD',
    linkId: ref.id,
    linkType: 'handover',
    isRead: false,
  });

  // Step 5 & 6: Create workflow history record
  await addWorkflowHistory({
    handoverId,
    machineNumber: data.machineNumber,
    fromDepartment: data.fromDepartment,
    toDepartment: data.toDepartment,
    action: 'DISPATCHED',
    status: 'SENT',
    employee: data.employee || userEmail || 'Operator',
    user: data.employee || userEmail || 'Operator',
    remarks: data.remarks || `Handover dispatched from ${data.fromDepartment} to ${data.toDepartment}`,
    date: today,
    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    timestamp: now,
  });

  // Step 7: If receiving department is Quality, also bridge to Quality queue
  if (
    isDepartmentMatch(data.toDepartment, '04 Inward Quality') ||
    data.toDepartment.toLowerCase().includes('quality') ||
    data.toDepartment.toLowerCase().includes('calibration')
  ) {
    try {
      await createQualityHandover(
        {
          machineNumber: data.machineNumber,
          machineModel: payload.machineModel || '',
          project: data.project || '',
          customer: data.customer || '',
          sendingDepartment: data.fromDepartment,
          receivingDepartment: data.toDepartment,
          employee: data.employee || userEmail || 'Operator',
          work: data.operation,
          operation: data.operation.slice(0, 80),
          quantity: Number(data.quantity) || 1,
          handoverDate: today,
          priority: (data.priority as any) || 'Medium',
          remarks: data.remarks || '',
        },
        userEmail
      );
    } catch (e) {
      console.warn('Quality queue bridge warning:', e);
    }
  }

  // Update Machine state to reflect real movement to next department and complete history
  if (data.machineNumber) {
    try {
      const mQuery = query(collection(db, 'machines'), where('machineNumber', '==', data.machineNumber.trim()));
      const mDocs = await getDocs(mQuery);
      for (const mDoc of mDocs.docs) {
        const mData = mDoc.data() as Machine;
        const startDate = mData.actualStartDate || mData.startDate || mData.assignedDate || today;
        const durationStr = calculateDepartmentDuration(startDate, today);
        const durationDays = calculateDurationDays(startDate, today);

        const historyEntry = {
          id: `hist_${Date.now()}`,
          date: today,
          department: data.fromDepartment,
          task: `Work completed at ${data.fromDepartment}. Handed over to ${data.toDepartment}`,
          employee: data.employee || userEmail || 'Operator',
          startDate,
          completionDate: today,
          duration: durationStr,
          durationDays,
          handedOverTo: data.toDepartment,
          status: 'Handed Over',
          progress: 100,
          remarks: data.remarks || `Completed 100% work at ${data.fromDepartment}. Dispatched to ${data.toDepartment}`,
        };

        // Requirement 5.A: State becomes Awaiting Acceptance; DO NOT change currentDepartment until accepted
        await updateDoc(mDoc.ref, {
          handoverStatus: 'AWAITING_ACCEPTANCE',
          status: 'AWAITING_ACCEPTANCE',
          currentStatus: 'Awaiting Acceptance',
          pendingDepartment: data.toDepartment,
          nextDepartment: data.toDepartment,
          previousDepartment: data.fromDepartment,
          handoverSubmittedAt: now,
          handoverSubmissionDate: today,
          handoverSubmittedBy: data.employee || userEmail || 'Operator',
          history: [historyEntry, ...(mData.history || [])],
          updatedAt: now,
        });

        // Update department_work for sending department to AWAITING_HANDOVER so it is non-editable
        const dwQ = query(
          collection(db, 'department_work'),
          where('machineNumber', '==', data.machineNumber.trim()),
          where('department', '==', data.fromDepartment)
        );
        const dwDocs = await getDocs(dwQ);
        for (const dwDoc of dwDocs.docs) {
          await updateDoc(dwDoc.ref, {
            status: 'AWAITING_HANDOVER',
            updatedAt: now,
          });
        }
      }
    } catch (e) {
      console.warn('Machine handoverStatus update warning:', e);
    }
  }

  // Audit log
  await logAudit(
    'DISPATCH_HANDOVER',
    'HANDOVER',
    ref.id,
    '',
    `${data.fromDepartment} -> ${data.toDepartment} (Machine ${data.machineNumber}) [${handoverId}]`,
    userEmail
  );

  return { id: ref.id, handoverId };
}

/**
 * Accepts an incoming handover.
 * Updates handover record, moves machine location to receiving department,
 * advances process stage, records history, and notifies originating department.
 */
export async function acceptHandover(
  handoverDocId: string,
  details: { acceptedBy?: string; remarks?: string } = {},
  userEmail?: string
) {
  const now = new Date().toISOString();
  const today = now.split('T')[0];

  // Fetch handover details
  let hData: DepartmentHandover | null = null;
  const snap1 = await getDoc(doc(db, 'departmentHandovers', handoverDocId));
  if (snap1.exists()) {
    hData = { id: snap1.id, ...snap1.data() } as DepartmentHandover;
  } else {
    const snap2 = await getDoc(doc(db, 'department_handovers', handoverDocId));
    if (snap2.exists()) {
      hData = { id: snap2.id, ...snap2.data() } as DepartmentHandover;
    }
  }

  const updates: Partial<DepartmentHandover> = {
    status: 'ACCEPTED',
    acceptedBy: details.acceptedBy || userEmail || 'Operator',
    acceptedDate: today,
    acceptedAt: now,
    updatedAt: now,
    updatedBy: details.acceptedBy || userEmail,
  };

  // Update both collections
  try {
    await updateDoc(doc(db, 'departmentHandovers', handoverDocId), updates);
  } catch {
    // ignore if only exists in other collection
  }
  try {
    await updateDoc(doc(db, 'department_handovers', handoverDocId), updates);
  } catch {
    // ignore
  }

  if (hData) {
    const fromDept = hData.fromDepartment || hData.sendingDepartment;
    const toDept = hData.toDepartment || hData.receivingDepartment;
    const hId = hData.handoverId || handoverDocId;

    // Add to handoverHistory
    await addWorkflowHistory({
      handoverId: hId,
      machineNumber: hData.machineNumber,
      fromDepartment: fromDept,
      toDepartment: toDept,
      action: 'ACCEPTED',
      status: 'ACCEPTED',
      employee: details.acceptedBy || userEmail || 'Operator',
      user: details.acceptedBy || userEmail || 'Operator',
      remarks: details.remarks || `Handover ${hId} accepted by ${toDept}`,
      date: today,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      timestamp: now,
    });

    // Notify originating department
    await createNotification({
      recipientDepartment: fromDept,
      toDepartment: fromDept,
      fromDepartment: toDept,
      type: 'HANDOVER_ACCEPTED',
      title: 'Handover Accepted',
      message: `${toDept} accepted handover ${hId} for Machine ${hData.machineNumber}.`,
      handoverId: hId,
      machineNumber: hData.machineNumber,
      operation: hData.operation || hData.workDescription,
      priority: hData.priority,
      status: 'UNREAD',
      linkId: handoverDocId,
      linkType: 'handover',
      isRead: false,
    });

    // Live Machine Movement (Machine Master updates)
    if (hData.machineNumber && toDept) {
      const mQuery = query(collection(db, 'machines'), where('machineNumber', '==', hData.machineNumber));
      const mDocs = await getDocs(mQuery);
      for (const mDoc of mDocs.docs) {
        const mData = mDoc.data() as Machine;
        const existingStages = { ...(mData.processStages || {}) };

        // Mark sending department stage Completed (100%)
        const sendingStage = Object.values(existingStages).find(
          (s) => isDepartmentMatch(s.departmentName, fromDept) || fromDept.includes(s.departmentCode)
        );
        if (sendingStage) {
          existingStages[sendingStage.departmentCode] = {
            ...sendingStage,
            status: 'Completed',
            progressPercent: 100,
            actualDate: today,
            updatedAt: now,
            updatedBy: details.acceptedBy || userEmail || 'Shop Floor Handover',
          };
        }

        // Set receiving department stage to In Progress
        const receivingStage = Object.values(existingStages).find(
          (s) => isDepartmentMatch(s.departmentName, toDept) || toDept.includes(s.departmentCode)
        );
        if (receivingStage) {
          existingStages[receivingStage.departmentCode] = {
            ...receivingStage,
            status: 'In Progress',
            progressPercent: Math.max(receivingStage.progressPercent || 0, 10),
            updatedAt: now,
            updatedBy: details.acceptedBy || userEmail || 'Shop Floor Handover',
          };
        }

        // Recalculate progress
        const stageVals = Object.values(existingStages);
        const applicableStages = stageVals.filter((s) => s.status !== 'N/A');
        const completedStages = applicableStages.filter((s) => s.status === 'Completed');
        const overallPct =
          applicableStages.length > 0 ? Math.round((completedStages.length / applicableStages.length) * 100) : 0;

        const historyEntry = {
          id: `hist_${Date.now()}`,
          date: today,
          department: toDept,
          task: hData.operation || hData.workDescription || `Handover from ${fromDept}`,
          employee: details.acceptedBy || 'Operator',
          startDate: today,
          progress: overallPct,
          status: 'In Progress',
          remarks: `Handover ${hId} accepted from ${fromDept}. ${details.remarks || hData.remarks || ''}`,
        };

        const nextDeptInRoute = getNextDepartmentForMachine(mData, toDept) || '';

        await updateDoc(mDoc.ref, {
          currentDepartment: toDept,
          responsibleDepartment: toDept,
          previousDepartment: fromDept,
          currentStatus: 'In Progress',
          status: 'IN_PROGRESS',
          handoverStatus: 'ACCEPTED',
          nextDepartment: nextDeptInRoute,
          receivedDate: today,
          actualStartDate: today,
          progress: 0,
          departmentProgress: 0,
          currentWork: hData.operation || hData.workDescription || '',
          currentEmployee: details.acceptedBy || 'Operator',
          responsibleEmployee: details.acceptedBy || 'Operator',
          processStages: existingStages,
          completedProcessesCount: completedStages.length,
          applicableProcessesCount: applicableStages.length,
          overallProgressPercent: overallPct,
          history: [historyEntry, ...(mData.history || [])],
          updatedAt: now,
        });

        await logAudit(
          'LIVE_MACHINE_MOVEMENT',
          'MACHINES',
          mDoc.id,
          mData.currentDepartment,
          `Machine ${mData.machineNumber} moved to ${toDept} upon handover acceptance`,
          userEmail
        );
      }
    }

    // Synchronize department_work: Complete for sending department, Activate for receiving department
    try {
      if (hData.machineNumber && fromDept) {
        const dwSendingQuery = query(
          collection(db, 'department_work'),
          where('machineNumber', '==', hData.machineNumber),
          where('department', '==', fromDept)
        );
        const dwSendingDocs = await getDocs(dwSendingQuery);
        for (const dwDoc of dwSendingDocs.docs) {
          await updateDoc(dwDoc.ref, {
            status: 'COMPLETED',
            progress: 100,
            updatedAt: now,
          });
        }
      }

      if (hData.machineNumber && toDept) {
        const dwReceivingQuery = query(
          collection(db, 'department_work'),
          where('machineNumber', '==', hData.machineNumber),
          where('department', '==', toDept)
        );
        const dwReceivingDocs = await getDocs(dwReceivingQuery);
        if (dwReceivingDocs.empty) {
          await addDoc(collection(db, 'department_work'), {
            department: toDept,
            machineNumber: hData.machineNumber,
            machineModel: hData.machineModel || '',
            operation: hData.operation || hData.workDescription || '',
            status: 'IN_PROGRESS',
            progress: 0,
            employee: details.acceptedBy || userEmail || 'Operator',
            startDate: today,
            createdAt: now,
            updatedAt: now,
          });
        } else {
          for (const dwDoc of dwReceivingDocs.docs) {
            await updateDoc(dwDoc.ref, {
              status: 'IN_PROGRESS',
              employee: details.acceptedBy || userEmail || 'Operator',
              updatedAt: now,
            });
          }
        }
      }
    } catch (e) {
      console.warn('department_work synchronization warning in acceptHandover:', e);
    }
  }

  await logAudit('ACCEPT_HANDOVER', 'HANDOVER', handoverDocId, '', 'ACCEPTED', userEmail);
}

/**
 * Rejects or returns an incoming handover back to originating department.
 * Saves rejection reason, required corrective action, updates status to RETURNED,
 * records in workflow history, and dispatches urgent notification to sender.
 */
export async function rejectHandover(
  handoverDocId: string,
  details: {
    rejectedBy?: string;
    rejectionReason: string;
    remarks?: string;
    correctiveActionRequired?: string;
  },
  userEmail?: string
) {
  if (!details.rejectionReason?.trim()) {
    throw new Error('Rejection reason is mandatory.');
  }

  const now = new Date().toISOString();
  const today = now.split('T')[0];

  let hData: DepartmentHandover | null = null;
  const snap1 = await getDoc(doc(db, 'departmentHandovers', handoverDocId));
  if (snap1.exists()) {
    hData = { id: snap1.id, ...snap1.data() } as DepartmentHandover;
  } else {
    const snap2 = await getDoc(doc(db, 'department_handovers', handoverDocId));
    if (snap2.exists()) {
      hData = { id: snap2.id, ...snap2.data() } as DepartmentHandover;
    }
  }

  const updates: Partial<DepartmentHandover> = {
    status: 'RETURNED',
    rejectionReason: details.rejectionReason.trim(),
    returnRemarks: details.remarks?.trim() || '',
    issueRemarks: details.remarks?.trim() || '',
    correctiveActionRequired: details.correctiveActionRequired?.trim() || '',
    updatedAt: now,
    updatedBy: details.rejectedBy || userEmail,
  };

  try {
    await updateDoc(doc(db, 'departmentHandovers', handoverDocId), updates);
  } catch {
    // ignore
  }
  try {
    await updateDoc(doc(db, 'department_handovers', handoverDocId), updates);
  } catch {
    // ignore
  }

  if (hData) {
    const fromDept = hData.fromDepartment || hData.sendingDepartment;
    const toDept = hData.toDepartment || hData.receivingDepartment;
    const hId = hData.handoverId || handoverDocId;

    await addWorkflowHistory({
      handoverId: hId,
      machineNumber: hData.machineNumber,
      fromDepartment: toDept,
      toDepartment: fromDept,
      action: 'RETURNED',
      status: 'RETURNED',
      employee: details.rejectedBy || userEmail || 'Operator',
      user: details.rejectedBy || userEmail || 'Operator',
      remarks: `Returned: ${details.rejectionReason}. ${details.remarks || ''}`,
      rejectionReason: details.rejectionReason,
      correctiveActionRequired: details.correctiveActionRequired,
      date: today,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      timestamp: now,
    });

    // Notify originating department
    await createNotification({
      recipientDepartment: fromDept,
      toDepartment: fromDept,
      fromDepartment: toDept,
      type: 'HANDOVER_RETURNED',
      title: 'Handover Returned',
      message: `${toDept} returned handover ${hId} for Machine ${hData.machineNumber}. Reason: ${details.rejectionReason}`,
      handoverId: hId,
      machineNumber: hData.machineNumber,
    });

    // Revert machine status to IN_PROGRESS at sender with RETURNED handover state
    try {
      const mQ = query(collection(db, 'machines'), where('machineNumber', '==', hData.machineNumber));
      const mDocs = await getDocs(mQ);
      for (const mDoc of mDocs.docs) {
        await updateDoc(mDoc.ref, {
          handoverStatus: 'RETURNED',
          status: 'IN_PROGRESS',
          currentStatus: 'In Progress',
          currentDepartment: fromDept,
          responsibleDepartment: fromDept,
          delayReason: details.rejectionReason,
          correctiveActionRequired: details.correctiveActionRequired || '',
          updatedAt: now,
        });
      }

      // Re-enable editing for sender's department_work
      const dwQ = query(
        collection(db, 'department_work'),
        where('machineNumber', '==', hData.machineNumber),
        where('department', '==', fromDept)
      );
      const dwDocs = await getDocs(dwQ);
      for (const dwDoc of dwDocs.docs) {
        await updateDoc(dwDoc.ref, {
          status: 'IN_PROGRESS',
          delayReason: details.rejectionReason,
          updatedAt: now,
        });
      }
    } catch (mErr) {
      console.warn('Machine revert error on handover reject:', mErr);
    }
  }

  await logAudit('REJECT_HANDOVER', 'HANDOVER', handoverDocId, '', `RETURNED: ${details.rejectionReason}`, userEmail);
}

/**
 * Starts active work on an accepted handover.
 */
export async function startHandoverWork(
  handoverDocId: string,
  details: { startedBy?: string; remarks?: string } = {},
  userEmail?: string
) {
  const now = new Date().toISOString();
  const updates: Partial<DepartmentHandover> = {
    status: 'IN_PROGRESS',
    updatedAt: now,
    updatedBy: details.startedBy || userEmail,
  };

  try {
    await updateDoc(doc(db, 'departmentHandovers', handoverDocId), updates);
  } catch {}
  try {
    await updateDoc(doc(db, 'department_handovers', handoverDocId), updates);
  } catch {}

  // Also update machine status
  try {
    let machineNum = '';
    const hSnap = await getDoc(doc(db, 'departmentHandovers', handoverDocId));
    if (hSnap.exists()) {
      machineNum = hSnap.data().machineNumber;
    } else {
      const hSnap2 = await getDoc(doc(db, 'department_handovers', handoverDocId));
      if (hSnap2.exists()) machineNum = hSnap2.data().machineNumber;
    }
    if (machineNum) {
      const mQ = query(collection(db, 'machines'), where('machineNumber', '==', machineNum));
      const mSnaps = await getDocs(mQ);
      for (const mDoc of mSnaps.docs) {
        await updateDoc(mDoc.ref, {
          status: 'IN_PROGRESS',
          currentStatus: 'IN_PROGRESS',
          actualStartDate: now.split('T')[0],
          updatedAt: now,
        });
      }
    }
  } catch (err) {
    console.warn('Machine sync in startHandoverWork warning:', err);
  }

  await logAudit('START_HANDOVER_WORK', 'HANDOVER', handoverDocId, '', 'IN_PROGRESS', userEmail);
}

/**
 * Marks work on a handover as Completed.
 */
export async function completeHandoverWork(
  handoverDocId: string,
  details: { completedBy?: string; remarks?: string } = {},
  userEmail?: string
) {
  const now = new Date().toISOString();
  const updates: Partial<DepartmentHandover> = {
    status: 'COMPLETED',
    updatedAt: now,
    updatedBy: details.completedBy || userEmail,
  };

  try {
    await updateDoc(doc(db, 'departmentHandovers', handoverDocId), updates);
  } catch {}
  try {
    await updateDoc(doc(db, 'department_handovers', handoverDocId), updates);
  } catch {}

  await logAudit('COMPLETE_HANDOVER_WORK', 'HANDOVER', handoverDocId, '', 'COMPLETED', userEmail);
}

/**
 * Appends entry to handoverHistory collection
 */
export async function addWorkflowHistory(entry: Omit<HandoverHistoryEntry, 'id'>) {
  try {
    await addDoc(collection(db, 'handoverHistory'), entry);
    // Dual write to snake_case for completeness
    try {
      await addDoc(collection(db, 'handover_history'), entry);
    } catch {}
  } catch (err) {
    console.warn('Failed to add handover history:', err);
  }
}

/**
 * Subscribes to handover history
 */
export function subscribeHandoverHistory(
  handoverId?: string,
  callback?: (history: HandoverHistoryEntry[]) => void
) {
  return onSnapshot(
    collection(db, 'handoverHistory'),
    (snap) => {
      let list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as HandoverHistoryEntry));
      if (handoverId) {
        list = list.filter((h) => h.handoverId === handoverId);
      }
      list.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      if (callback) callback(list);
    },
    (err) => handleFirestoreError(err, OperationType.LIST, 'handoverHistory')
  );
}

// Re-export Quality Workflow wrappers to form One Common Workflow Engine
export {
  createQualityHandover as sendToQuality,
  qualityAcceptHandover as acceptQuality,
  qualityRejectHandover as rejectQuality,
  qualityHoldHandover as holdQuality,
  resubmitHandoverToQuality as resubmitToQuality,
};
