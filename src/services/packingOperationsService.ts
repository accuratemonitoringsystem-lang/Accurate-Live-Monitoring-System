import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  updateDoc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase';
import { cleanData } from './db';
import {
  PackingMachineOperation,
  PackingOperationStage,
  PackingOperationStatus,
  PackingStageRecord,
  PackingOperationHistoryEntry,
  DepartmentHandover,
  Machine,
} from '../types';

const PACKING_COLLECTION = 'packing_operations';
const LOCAL_STORAGE_KEY = 'ams_db_packing_operations';

export const PACKING_STAGES_SEQUENCE: PackingOperationStage[] = [
  'Open Cable',
  'Packed',
  'Packed with Probing',
  'Invoicing',
  'Dispatched',
];

let memoryStore: PackingMachineOperation[] = [];

function getLocalStore(): PackingMachineOperation[] {
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (raw) {
        memoryStore = JSON.parse(raw);
        return memoryStore;
      }
    }
    return memoryStore;
  } catch (err) {
    return memoryStore;
  }
}

function saveLocalStore(items: PackingMachineOperation[]): void {
  memoryStore = items;
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(items));
    }
  } catch (err) {
    // Ignore in non-browser envs
  }
}

function createEmptyStages(): Record<PackingOperationStage, PackingStageRecord> {
  return {
    'Open Cable': {
      stage: 'Open Cable',
      status: 'Not Started',
      progressPercent: 0,
    },
    Packed: {
      stage: 'Packed',
      status: 'Not Started',
      progressPercent: 0,
    },
    'Packed with Probing': {
      stage: 'Packed with Probing',
      status: 'Not Started',
      progressPercent: 0,
    },
    Invoicing: {
      stage: 'Invoicing',
      status: 'Not Started',
      progressPercent: 0,
    },
    Dispatched: {
      stage: 'Dispatched',
      status: 'Not Started',
      progressPercent: 0,
    },
  };
}

/**
 * Real-time listener for Packing & Dispatch Operations.
 */
export function subscribePackingOperations(
  callback: (items: PackingMachineOperation[]) => void
): () => void {
  let unsubscribeFirestore = () => {};

  try {
    const colRef = collection(db, PACKING_COLLECTION);
    unsubscribeFirestore = onSnapshot(
      colRef,
      (snapshot) => {
        if (!snapshot.empty) {
          const remoteItems = snapshot.docs.map((d) => ({
            id: d.id,
            ...(d.data() as any),
          })) as PackingMachineOperation[];
          saveLocalStore(remoteItems);
          callback(remoteItems);
        } else {
          // If Firestore is empty, use localStore
          callback(getLocalStore());
        }
      },
      (err) => {
        console.warn('Firestore subscribePackingOperations error, using fallback:', err);
        callback(getLocalStore());
      }
    );
  } catch (err) {
    console.warn('Firestore onSnapshot setup failed:', err);
    callback(getLocalStore());
  }

  // Window storage sync listener for multi-tab fallback
  const handleStorageChange = (e: StorageEvent) => {
    if (e.key === LOCAL_STORAGE_KEY) {
      callback(getLocalStore());
    }
  };
  window.addEventListener('storage', handleStorageChange);

  return () => {
    unsubscribeFirestore();
    window.removeEventListener('storage', handleStorageChange);
  };
}

/**
 * Initiates or accepts a machine into Packing & Dispatch Operations from a handover.
 */
export async function initializePackingOperationFromHandover(
  handover: DepartmentHandover,
  userEmail: string
): Promise<PackingMachineOperation> {
  const machineNumber = handover.machineNumber;
  const id = `PKG-${machineNumber.trim()}`;
  const now = new Date().toISOString();
  const dateStr = now.split('T')[0];
  const timeStr = new Date().toLocaleTimeString('en-US', { hour12: false });

  const existingItems = getLocalStore();
  const existing = existingItems.find((item) => item.machineNumber === machineNumber || item.id === id);

  if (existing) {
    return existing;
  }

  const stages = createEmptyStages();
  // Open Cable begins as first stage
  stages['Open Cable'] = {
    stage: 'Open Cable',
    status: 'In Progress',
    progressPercent: 0,
    startDate: dateStr,
    assignedEmployee: handover.employee || 'Atul More',
    remarks: `Received from ${handover.sendingDepartment || 'Previous Department'} via Handover #${handover.id || ''}`,
    updatedBy: userEmail,
    updatedAt: now,
  };

  const initialHistory: PackingOperationHistoryEntry[] = [
    {
      id: `HIST-${Date.now()}-1`,
      machineNumber,
      stage: 'Open Cable',
      action: 'RECEIVED',
      previousProgress: 0,
      newProgress: 0,
      assignedEmployee: handover.employee || 'Atul More',
      remarks: `Machine received from ${handover.sendingDepartment || 'Previous Department'}. Handover accepted.`,
      timestamp: now,
      updatedBy: userEmail,
    },
    {
      id: `HIST-${Date.now()}-2`,
      machineNumber,
      stage: 'Open Cable',
      action: 'STAGE_STARTED',
      previousProgress: 0,
      newProgress: 0,
      assignedEmployee: handover.employee || 'Atul More',
      remarks: 'Open Cable stage initialized.',
      timestamp: now,
      updatedBy: userEmail,
    },
  ];

  const newOp: PackingMachineOperation = {
    id,
    machineId: handover.machineId,
    machineNumber,
    machineSize: handover.machineSize || handover.modelSize || 'Standard',
    model: handover.machineModel || handover.modelSize || 'CMM Standard',
    project: handover.project || 'Production Machine',
    customer: handover.customer || 'Standard Customer',
    handoverId: handover.id,
    previousDepartment: handover.sendingDepartment || handover.fromDepartment || '14 Calibration',
    receivedDate: dateStr,
    receivedTime: timeStr,
    receivedBy: userEmail,
    currentStage: 'Open Cable',
    currentProgressPercent: 0,
    currentStageStatus: 'In Progress',
    stages,
    isDispatched: false,
    history: initialHistory,
    createdAt: now,
    updatedAt: now,
    createdBy: userEmail,
    updatedBy: userEmail,
  };

  // 1. Save to LocalStore
  const updatedList = [newOp, ...existingItems.filter((i) => i.id !== id)];
  saveLocalStore(updatedList);

  // 2. Save to Firestore
  try {
    const docRef = doc(db, PACKING_COLLECTION, id);
    await setDoc(docRef, cleanData(newOp), { merge: true });
  } catch (err) {
    console.warn('Firestore setDoc failed for packing operation:', err);
  }

  return newOp;
}

/**
 * Initiates a machine directly from the Machine Master or Department Machine list.
 */
export async function initializePackingOperationFromMachine(
  machine: Machine,
  previousDeptName: string = '14 Calibration',
  userEmail: string
): Promise<PackingMachineOperation> {
  const machineNumber = machine.machineNumber;
  const id = `PKG-${machineNumber.trim()}`;
  const now = new Date().toISOString();
  const dateStr = now.split('T')[0];
  const timeStr = new Date().toLocaleTimeString('en-US', { hour12: false });

  const existingItems = getLocalStore();
  const existing = existingItems.find((item) => item.machineNumber === machineNumber || item.id === id);

  if (existing) {
    return existing;
  }

  const stages = createEmptyStages();
  stages['Open Cable'] = {
    stage: 'Open Cable',
    status: 'In Progress',
    progressPercent: 0,
    startDate: dateStr,
    assignedEmployee: machine.responsibleEmployee || 'Atul More',
    remarks: `Initiated in Packing & Dispatch Operations`,
    updatedBy: userEmail,
    updatedAt: now,
  };

  const initialHistory: PackingOperationHistoryEntry[] = [
    {
      id: `HIST-${Date.now()}-1`,
      machineNumber,
      stage: 'Open Cable',
      action: 'RECEIVED',
      previousProgress: 0,
      newProgress: 0,
      assignedEmployee: machine.responsibleEmployee || 'Atul More',
      remarks: `Machine inducted into Packing & Dispatch Operations from ${previousDeptName}.`,
      timestamp: now,
      updatedBy: userEmail,
    },
    {
      id: `HIST-${Date.now()}-2`,
      machineNumber,
      stage: 'Open Cable',
      action: 'STAGE_STARTED',
      previousProgress: 0,
      newProgress: 0,
      assignedEmployee: machine.responsibleEmployee || 'Atul More',
      remarks: 'Open Cable stage started.',
      timestamp: now,
      updatedBy: userEmail,
    },
  ];

  const newOp: PackingMachineOperation = {
    id,
    machineId: machine.id,
    machineNumber,
    machineSize: machine.machineSize || machine.size || 'Standard',
    model: machine.model || machine.machineModel || 'CMM Standard',
    project: machine.project || machine.projectName || 'Production Machine',
    customer: machine.customer || machine.client || 'Standard Customer',
    previousDepartment: previousDeptName,
    receivedDate: dateStr,
    receivedTime: timeStr,
    receivedBy: userEmail,
    currentStage: 'Open Cable',
    currentProgressPercent: 0,
    currentStageStatus: 'In Progress',
    stages,
    isDispatched: false,
    history: initialHistory,
    createdAt: now,
    updatedAt: now,
    createdBy: userEmail,
    updatedBy: userEmail,
  };

  const updatedList = [newOp, ...existingItems.filter((i) => i.id !== id)];
  saveLocalStore(updatedList);

  try {
    const docRef = doc(db, PACKING_COLLECTION, id);
    await setDoc(docRef, cleanData(newOp), { merge: true });
  } catch (err) {
    console.warn('Firestore setDoc failed for packing operation:', err);
  }

  return newOp;
}

/**
 * Updates progress for the CURRENT operation without moving the machine.
 * Validates progress percent is between 0 and 100.
 */
export async function savePackingOperationProgress(params: {
  operationId: string;
  progressPercent: number;
  assignedEmployee?: string;
  remarks?: string;
  pendingWork?: string;
  documentUrl?: string;
  documentName?: string;
  invoiceData?: {
    invoiceNumber?: string;
    invoiceDate?: string;
    invoiceAmount?: number;
    invoiceStatus?: string;
    invoiceRemarks?: string;
  };
  dispatchData?: {
    dispatchDate?: string;
    deliveryReference?: string;
    transporterName?: string;
    lrNumber?: string;
    ewayBillNumber?: string;
    dispatchRemarks?: string;
  };
  userEmail: string;
}): Promise<PackingMachineOperation> {
  const { operationId, progressPercent, assignedEmployee, remarks, pendingWork, documentUrl, documentName, userEmail } = params;

  if (progressPercent < 0 || progressPercent > 100) {
    throw new Error('Progress percentage must be between 0 and 100.');
  }

  const items = getLocalStore();
  const index = items.findIndex((i) => i.id === operationId);
  if (index === -1) {
    throw new Error(`Packing operation record ${operationId} not found.`);
  }

  const currentOp = { ...items[index] };
  const currentStage = currentOp.currentStage;
  const previousProgress = currentOp.currentProgressPercent;
  const now = new Date().toISOString();

  // Status for current stage
  let stageStatus: PackingOperationStatus = 'In Progress';
  if (progressPercent === 100) {
    stageStatus = 'Completed';
  } else if (progressPercent === 0) {
    stageStatus = 'Not Started';
  }

  // Update current stage record
  const updatedStageRecord: PackingStageRecord = {
    ...currentOp.stages[currentStage],
    stage: currentStage,
    status: stageStatus,
    progressPercent,
    assignedEmployee: assignedEmployee || currentOp.stages[currentStage]?.assignedEmployee,
    remarks: remarks !== undefined ? remarks : currentOp.stages[currentStage]?.remarks,
    pendingWork: pendingWork !== undefined ? pendingWork : currentOp.stages[currentStage]?.pendingWork,
    documentUrl: documentUrl || currentOp.stages[currentStage]?.documentUrl,
    documentName: documentName || currentOp.stages[currentStage]?.documentName,
    updatedBy: userEmail,
    updatedAt: now,
  };

  // If in Invoicing stage, save any draft invoice fields
  if (currentStage === 'Invoicing' && params.invoiceData) {
    if (params.invoiceData.invoiceNumber) updatedStageRecord.invoiceNumber = params.invoiceData.invoiceNumber;
    if (params.invoiceData.invoiceDate) updatedStageRecord.invoiceDate = params.invoiceData.invoiceDate;
    if (params.invoiceData.invoiceAmount !== undefined) updatedStageRecord.invoiceAmount = params.invoiceData.invoiceAmount;
    if (params.invoiceData.invoiceStatus) updatedStageRecord.invoiceStatus = params.invoiceData.invoiceStatus;
    if (params.invoiceData.invoiceRemarks) updatedStageRecord.invoiceRemarks = params.invoiceData.invoiceRemarks;
  }

  // If in Dispatched stage, save any draft dispatch fields
  if (currentStage === 'Dispatched' && params.dispatchData) {
    if (params.dispatchData.dispatchDate) updatedStageRecord.dispatchDate = params.dispatchData.dispatchDate;
    if (params.dispatchData.deliveryReference) updatedStageRecord.deliveryReference = params.dispatchData.deliveryReference;
    if (params.dispatchData.transporterName) updatedStageRecord.transporterName = params.dispatchData.transporterName;
    if (params.dispatchData.lrNumber) updatedStageRecord.lrNumber = params.dispatchData.lrNumber;
    if (params.dispatchData.ewayBillNumber) updatedStageRecord.ewayBillNumber = params.dispatchData.ewayBillNumber;
    if (params.dispatchData.dispatchRemarks) updatedStageRecord.dispatchRemarks = params.dispatchData.dispatchRemarks;
  }

  const updatedStages = {
    ...currentOp.stages,
    [currentStage]: updatedStageRecord,
  };

  // Add history record
  const historyEntry: PackingOperationHistoryEntry = {
    id: `HIST-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    machineId: currentOp.machineId,
    machineNumber: currentOp.machineNumber,
    stage: currentStage,
    action: 'PROGRESS_UPDATE',
    previousProgress,
    newProgress: progressPercent,
    assignedEmployee: assignedEmployee || updatedStageRecord.assignedEmployee,
    remarks: remarks || `Progress updated to ${progressPercent}%`,
    pendingWork,
    invoiceNumber: updatedStageRecord.invoiceNumber,
    dispatchReference: updatedStageRecord.deliveryReference,
    timestamp: now,
    updatedBy: userEmail,
  };

  const updatedOp: PackingMachineOperation = {
    ...currentOp,
    currentProgressPercent: progressPercent,
    currentStageStatus: stageStatus,
    stages: updatedStages,
    history: [historyEntry, ...currentOp.history],
    updatedAt: now,
    updatedBy: userEmail,
  };

  items[index] = updatedOp;
  saveLocalStore(items);

  // Sync to Firestore
  try {
    const docRef = doc(db, PACKING_COLLECTION, operationId);
    await setDoc(docRef, cleanData(updatedOp), { merge: true });
  } catch (err) {
    console.warn('Firestore setDoc failed during savePackingOperationProgress:', err);
  }

  return updatedOp;
}

/**
 * COMPLETES THE CURRENT OPERATION AND MOVES TO THE NEXT.
 * STRICT ENFORCEMENT: currentProgressPercent must be EXACTLY 100%.
 */
export async function completeAndAdvanceOperation(params: {
  operationId: string;
  userEmail: string;
  employeeName?: string;
  completionRemarks?: string;
  invoiceData?: {
    invoiceNumber: string;
    invoiceDate: string;
    invoiceAmount?: number;
    invoiceStatus?: string;
    invoiceRemarks?: string;
    invoiceDocUrl?: string;
    invoiceDocName?: string;
  };
  dispatchData?: {
    dispatchDate: string;
    deliveryReference: string;
    transporterName?: string;
    lrNumber?: string;
    ewayBillNumber?: string;
    dispatchRemarks?: string;
    dispatchDocUrl?: string;
    dispatchDocName?: string;
  };
}): Promise<PackingMachineOperation> {
  const { operationId, userEmail, employeeName, completionRemarks, invoiceData, dispatchData } = params;

  const items = getLocalStore();
  const index = items.findIndex((i) => i.id === operationId);
  if (index === -1) {
    throw new Error(`Packing operation record ${operationId} not found.`);
  }

  const currentOp = { ...items[index] };
  const currentStage = currentOp.currentStage;
  const now = new Date().toISOString();
  const dateStr = now.split('T')[0];

  // =========================================================================
  // CRITICAL 100% COMPLETION RULE VALIDATION
  // =========================================================================
  const hasFullDispatchData = currentStage === 'Dispatched' && Boolean(dispatchData?.dispatchDate && dispatchData?.deliveryReference);
  if (currentOp.currentProgressPercent < 100 && !hasFullDispatchData) {
    throw new Error(
      `Cannot move machine to next operation! ${currentStage} is currently at ${currentOp.currentProgressPercent}%. ` +
      `A machine must achieve exactly 100% completion in its current operation before moving forward.`
    );
  }

  const currentStageIndex = PACKING_STAGES_SEQUENCE.indexOf(currentStage);
  if (currentStageIndex === -1) {
    throw new Error(`Invalid stage: ${currentStage}`);
  }

  // 1. Mark Current Stage as 100% Completed
  const completedStageRecord: PackingStageRecord = {
    ...currentOp.stages[currentStage],
    stage: currentStage,
    status: 'Completed',
    progressPercent: 100,
    completionDate: dateStr,
    completedAt: now,
    assignedEmployee: employeeName || currentOp.stages[currentStage]?.assignedEmployee,
    remarks: completionRemarks || `100% Completed on ${dateStr}`,
    updatedBy: userEmail,
    updatedAt: now,
  };

  const historyEntries: PackingOperationHistoryEntry[] = [
    {
      id: `HIST-${Date.now()}-comp`,
      machineId: currentOp.machineId,
      machineNumber: currentOp.machineNumber,
      stage: currentStage,
      action: 'STAGE_COMPLETED',
      previousProgress: 100,
      newProgress: 100,
      assignedEmployee: completedStageRecord.assignedEmployee,
      remarks: completionRemarks || `${currentStage} operation completed 100%.`,
      timestamp: now,
      updatedBy: userEmail,
    },
  ];

  // Specific Stage Transitions
  let nextStage: PackingOperationStage = currentStage;
  let nextProgress = 0;
  let nextStatus: PackingOperationStatus = 'Not Started';
  let isDispatched = currentOp.isDispatched;
  let dispatchDate = currentOp.dispatchDate;

  if (currentStage === 'Open Cable') {
    nextStage = 'Packed';
    nextProgress = 0;
    nextStatus = 'Not Started';
  } else if (currentStage === 'Packed') {
    nextStage = 'Packed with Probing';
    nextProgress = 0;
    nextStatus = 'Not Started';
  } else if (currentStage === 'Packed with Probing') {
    nextStage = 'Invoicing';
    nextProgress = 0;
    nextStatus = 'Not Started';
  } else if (currentStage === 'Invoicing') {
    // Validate Invoicing details
    if (!invoiceData?.invoiceNumber || !invoiceData?.invoiceDate) {
      throw new Error('Invoice Number and Invoice Date are required before completing Invoicing stage.');
    }
    completedStageRecord.invoiceNumber = invoiceData.invoiceNumber;
    completedStageRecord.invoiceDate = invoiceData.invoiceDate;
    completedStageRecord.invoiceAmount = invoiceData.invoiceAmount;
    completedStageRecord.invoiceStatus = invoiceData.invoiceStatus || 'Generated';
    completedStageRecord.invoiceRemarks = invoiceData.invoiceRemarks;
    completedStageRecord.invoiceDocUrl = invoiceData.invoiceDocUrl;
    completedStageRecord.invoiceDocName = invoiceData.invoiceDocName;

    nextStage = 'Dispatched';
    nextProgress = 0;
    nextStatus = 'Not Started';
  } else if (currentStage === 'Dispatched') {
    // Final stage completion validation
    if (!dispatchData?.dispatchDate || !dispatchData?.deliveryReference) {
      throw new Error('Dispatch Date and Delivery / Dispatch Reference are required to dispatch machine.');
    }
    completedStageRecord.dispatchDate = dispatchData.dispatchDate;
    completedStageRecord.deliveryReference = dispatchData.deliveryReference;
    completedStageRecord.transporterName = dispatchData.transporterName;
    completedStageRecord.lrNumber = dispatchData.lrNumber;
    completedStageRecord.ewayBillNumber = dispatchData.ewayBillNumber;
    completedStageRecord.dispatchRemarks = dispatchData.dispatchRemarks;
    completedStageRecord.dispatchDocUrl = dispatchData.dispatchDocUrl;
    completedStageRecord.dispatchDocName = dispatchData.dispatchDocName;

    nextStage = 'Dispatched';
    nextProgress = 100;
    nextStatus = 'Completed';
    isDispatched = true;
    dispatchDate = dispatchData.dispatchDate;

    historyEntries.push({
      id: `HIST-${Date.now()}-disp`,
      machineId: currentOp.machineId,
      machineNumber: currentOp.machineNumber,
      stage: 'Dispatched',
      action: 'DISPATCHED',
      previousProgress: 100,
      newProgress: 100,
      assignedEmployee: completedStageRecord.assignedEmployee,
      dispatchReference: dispatchData.deliveryReference,
      remarks: `Machine officially dispatched via ${dispatchData.transporterName || 'Transporter'}. Ref: ${dispatchData.deliveryReference}`,
      timestamp: now,
      updatedBy: userEmail,
    });
  }

  // If moving to a subsequent stage that is not final Dispatched completion
  const updatedStages = {
    ...currentOp.stages,
    [currentStage]: completedStageRecord,
  };

  if (nextStage !== currentStage && !isDispatched) {
    updatedStages[nextStage] = {
      ...updatedStages[nextStage],
      stage: nextStage,
      status: 'In Progress',
      progressPercent: 0,
      startDate: dateStr,
      assignedEmployee: employeeName || 'Atul More',
      remarks: `Started ${nextStage} operation`,
      updatedBy: userEmail,
      updatedAt: now,
    };
    nextStatus = 'In Progress';

    historyEntries.push({
      id: `HIST-${Date.now()}-start-next`,
      machineId: currentOp.machineId,
      machineNumber: currentOp.machineNumber,
      stage: nextStage,
      action: 'STAGE_STARTED',
      previousProgress: 0,
      newProgress: 0,
      assignedEmployee: employeeName || 'Atul More',
      remarks: `Entered ${nextStage} operation.`,
      timestamp: now,
      updatedBy: userEmail,
    });
  }

  const updatedOp: PackingMachineOperation = {
    ...currentOp,
    currentStage: nextStage,
    currentProgressPercent: nextProgress,
    currentStageStatus: nextStatus,
    stages: updatedStages,
    isDispatched,
    dispatchDate,
    history: [...historyEntries, ...currentOp.history],
    updatedAt: now,
    updatedBy: userEmail,
  };

  items[index] = updatedOp;
  saveLocalStore(items);

  // Sync to Firestore
  try {
    const docRef = doc(db, PACKING_COLLECTION, operationId);
    await setDoc(docRef, cleanData(updatedOp), { merge: true });

    // Also update machine record if dispatched
    if (isDispatched && currentOp.machineId) {
      try {
        const machDocRef = doc(db, 'machines', currentOp.machineId);
        await updateDoc(machDocRef, cleanData({
          isDispatched: true,
          status: 'Dispatched',
          currentStatus: 'Dispatched',
          dispatchDate,
          updatedAt: now,
          updatedBy: userEmail,
        }));
      } catch (e) {
        console.warn('Failed to update machine document on dispatch:', e);
      }
    }
  } catch (err) {
    console.warn('Firestore setDoc failed during completeAndAdvanceOperation:', err);
  }

  return updatedOp;
}

/**
 * Seeds initial received machines for Packing & Dispatch so the module is immediately testable
 * with actual machine handovers from Calibration / Final Assembly.
 */
export async function seedInitialPackingOperations(
  machines: Machine[],
  handovers: DepartmentHandover[],
  userEmail: string = 'atul.more@accurate.in'
): Promise<PackingMachineOperation[]> {
  const existing = getLocalStore();
  if (existing.length > 0) {
    return existing;
  }

  // Look for machines in 15 Packing or handovers to 15 Packing
  const packingCandidates = machines.filter(
    (m) =>
      m.currentDepartment?.includes('Packing') ||
      m.responsibleDepartment?.includes('Packing') ||
      m.currentDepartment?.startsWith('15') ||
      m.responsibleDepartment?.startsWith('15')
  );

  const incomingToPacking = handovers.filter(
    (h) =>
      h.receivingDepartment?.includes('Packing') ||
      h.receivingDepartment?.startsWith('15') ||
      h.toDepartment?.includes('Packing') ||
      h.toDepartment?.startsWith('15')
  );

  const initialItems: PackingMachineOperation[] = [];

  // Initialize from incoming handovers if any exist
  for (const h of incomingToPacking) {
    try {
      const op = await initializePackingOperationFromHandover(h, userEmail);
      initialItems.push(op);
    } catch (e) {
      console.warn('Failed to initialize packing operation from handover:', e);
    }
  }

  // Initialize from packing machines if any exist
  for (const m of packingCandidates) {
    if (!initialItems.some((i) => i.machineNumber === m.machineNumber)) {
      try {
        const op = await initializePackingOperationFromMachine(m, m.currentDepartment || '14 Calibration', userEmail);
        initialItems.push(op);
      } catch (e) {
        console.warn('Failed to initialize packing operation from machine:', e);
      }
    }
  }

  saveLocalStore(initialItems);
  return initialItems;
}
