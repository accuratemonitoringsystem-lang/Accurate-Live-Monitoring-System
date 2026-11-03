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

  // Seed 1: A machine in Open Cable (e.g. 2571)
  const now = new Date();
  const d1 = new Date(now.getTime() - 4 * 24 * 3600 * 1000).toISOString();
  const d2 = new Date(now.getTime() - 2 * 24 * 3600 * 1000).toISOString();
  const d3 = new Date(now.getTime() - 1 * 24 * 3600 * 1000).toISOString();

  // Item 1: Machine 2571 in Open Cable at 40%
  const stages1 = createEmptyStages();
  stages1['Open Cable'] = {
    stage: 'Open Cable',
    status: 'In Progress',
    progressPercent: 40,
    startDate: d1.split('T')[0],
    assignedEmployee: 'Atul More',
    remarks: 'Internal harness and conduit routing in progress',
    pendingWork: 'Bracket mounting torque check & continuity testing',
    updatedBy: userEmail,
    updatedAt: d3,
  };
  initialItems.push({
    id: 'PKG-2571',
    machineNumber: '2571',
    machineSize: '564',
    model: 'Bridge CMM 564',
    project: 'Standard CMM Series',
    customer: 'Accurate Gauging Plant',
    previousDepartment: '14 Calibration',
    receivedDate: d1.split('T')[0],
    receivedTime: '10:15:00',
    receivedBy: userEmail,
    currentStage: 'Open Cable',
    currentProgressPercent: 40,
    currentStageStatus: 'In Progress',
    stages: stages1,
    isDispatched: false,
    history: [
      {
        id: 'H1-2',
        machineNumber: '2571',
        stage: 'Open Cable',
        action: 'PROGRESS_UPDATE',
        previousProgress: 0,
        newProgress: 40,
        assignedEmployee: 'Atul More',
        remarks: 'Conduit routing completed, testing in progress',
        timestamp: d3,
        updatedBy: userEmail,
      },
      {
        id: 'H1-1',
        machineNumber: '2571',
        stage: 'Open Cable',
        action: 'RECEIVED',
        previousProgress: 0,
        newProgress: 0,
        assignedEmployee: 'Atul More',
        remarks: 'Received from 14 Calibration after laser interferometer calibration.',
        timestamp: d1,
        updatedBy: userEmail,
      },
    ],
    createdAt: d1,
    updatedAt: d3,
    createdBy: userEmail,
    updatedBy: userEmail,
  });

  // Item 2: Machine 2572 in Packed at 100% (Ready to advance to Packed with Probing)
  const stages2 = createEmptyStages();
  stages2['Open Cable'] = {
    stage: 'Open Cable',
    status: 'Completed',
    progressPercent: 100,
    startDate: d1.split('T')[0],
    completionDate: d2.split('T')[0],
    completedAt: d2,
    assignedEmployee: 'Atul More',
    remarks: 'Open cable tested & bundled',
    updatedBy: userEmail,
    updatedAt: d2,
  };
  stages2['Packed'] = {
    stage: 'Packed',
    status: 'In Progress',
    progressPercent: 75,
    startDate: d2.split('T')[0],
    assignedEmployee: 'Atul More',
    remarks: 'VCI anti-corrosion barrier wrap applied, axis locks tightened',
    pendingWork: 'Desiccant bags placement & wooden base bracing',
    updatedBy: userEmail,
    updatedAt: d3,
  };
  initialItems.push({
    id: 'PKG-2572',
    machineNumber: '2572',
    machineSize: '10158',
    model: 'Gantry CMM 10158',
    project: 'Industrial Line',
    customer: 'Bharat Dynamics Ltd',
    previousDepartment: '14 Calibration',
    receivedDate: d1.split('T')[0],
    receivedTime: '11:30:00',
    receivedBy: userEmail,
    currentStage: 'Packed',
    currentProgressPercent: 75,
    currentStageStatus: 'In Progress',
    stages: stages2,
    isDispatched: false,
    history: [
      {
        id: 'H2-3',
        machineNumber: '2572',
        stage: 'Packed',
        action: 'PROGRESS_UPDATE',
        previousProgress: 0,
        newProgress: 75,
        assignedEmployee: 'Atul More',
        remarks: 'VCI film sealed, axis clamps installed',
        timestamp: d3,
        updatedBy: userEmail,
      },
      {
        id: 'H2-2',
        machineNumber: '2572',
        stage: 'Open Cable',
        action: 'STAGE_COMPLETED',
        previousProgress: 100,
        newProgress: 100,
        assignedEmployee: 'Atul More',
        remarks: 'Open cable 100% completed and approved.',
        timestamp: d2,
        updatedBy: userEmail,
      },
      {
        id: 'H2-1',
        machineNumber: '2572',
        stage: 'Open Cable',
        action: 'RECEIVED',
        previousProgress: 0,
        newProgress: 0,
        assignedEmployee: 'Atul More',
        remarks: 'Received from 14 Calibration.',
        timestamp: d1,
        updatedBy: userEmail,
      },
    ],
    createdAt: d1,
    updatedAt: d3,
    createdBy: userEmail,
    updatedBy: userEmail,
  });

  // Item 3: Machine 2573 in Packed with Probing at 50%
  const stages3 = createEmptyStages();
  stages3['Open Cable'] = {
    stage: 'Open Cable',
    status: 'Completed',
    progressPercent: 100,
    startDate: d1.split('T')[0],
    completionDate: d1.split('T')[0],
    completedAt: d1,
    assignedEmployee: 'Atul More',
    remarks: 'Open cable completed',
    updatedBy: userEmail,
    updatedAt: d1,
  };
  stages3['Packed'] = {
    stage: 'Packed',
    status: 'Completed',
    progressPercent: 100,
    startDate: d2.split('T')[0],
    completionDate: d2.split('T')[0],
    completedAt: d2,
    assignedEmployee: 'Atul More',
    remarks: 'Packed complete',
    updatedBy: userEmail,
    updatedAt: d2,
  };
  stages3['Packed with Probing'] = {
    stage: 'Packed with Probing',
    status: 'In Progress',
    progressPercent: 50,
    startDate: d3.split('T')[0],
    assignedEmployee: 'Atul More',
    remarks: 'Renishaw probe kit custom cushioning fitted',
    pendingWork: 'Stylus kit box placement & sealing',
    updatedBy: userEmail,
    updatedAt: d3,
  };
  initialItems.push({
    id: 'PKG-2573',
    machineNumber: '2573',
    machineSize: '8106',
    model: 'Bridge CMM 8106',
    project: 'High Precision Series',
    customer: 'Tata Motors Pune',
    previousDepartment: '14 Calibration',
    receivedDate: d1.split('T')[0],
    receivedTime: '14:00:00',
    receivedBy: userEmail,
    currentStage: 'Packed with Probing',
    currentProgressPercent: 50,
    currentStageStatus: 'In Progress',
    stages: stages3,
    isDispatched: false,
    history: [
      {
        id: 'H3-4',
        machineNumber: '2573',
        stage: 'Packed with Probing',
        action: 'PROGRESS_UPDATE',
        previousProgress: 0,
        newProgress: 50,
        assignedEmployee: 'Atul More',
        remarks: 'Probe box packed in crate compartment',
        timestamp: d3,
        updatedBy: userEmail,
      },
      {
        id: 'H3-3',
        machineNumber: '2573',
        stage: 'Packed',
        action: 'STAGE_COMPLETED',
        previousProgress: 100,
        newProgress: 100,
        assignedEmployee: 'Atul More',
        remarks: 'Packed stage 100% complete',
        timestamp: d2,
        updatedBy: userEmail,
      },
      {
        id: 'H3-2',
        machineNumber: '2573',
        stage: 'Open Cable',
        action: 'STAGE_COMPLETED',
        previousProgress: 100,
        newProgress: 100,
        assignedEmployee: 'Atul More',
        remarks: 'Open cable 100% complete',
        timestamp: d1,
        updatedBy: userEmail,
      },
      {
        id: 'H3-1',
        machineNumber: '2573',
        stage: 'Open Cable',
        action: 'RECEIVED',
        previousProgress: 0,
        newProgress: 0,
        assignedEmployee: 'Atul More',
        remarks: 'Received from 14 Calibration.',
        timestamp: d1,
        updatedBy: userEmail,
      },
    ],
    createdAt: d1,
    updatedAt: d3,
    createdBy: userEmail,
    updatedBy: userEmail,
  });

  // Item 4: Machine 2574 in Invoicing stage (Ready for invoice generation)
  const stages4 = createEmptyStages();
  stages4['Open Cable'] = { stage: 'Open Cable', status: 'Completed', progressPercent: 100, startDate: d1.split('T')[0], completionDate: d1.split('T')[0], completedAt: d1, updatedBy: userEmail, updatedAt: d1 };
  stages4['Packed'] = { stage: 'Packed', status: 'Completed', progressPercent: 100, startDate: d2.split('T')[0], completionDate: d2.split('T')[0], completedAt: d2, updatedBy: userEmail, updatedAt: d2 };
  stages4['Packed with Probing'] = { stage: 'Packed with Probing', status: 'Completed', progressPercent: 100, startDate: d3.split('T')[0], completionDate: d3.split('T')[0], completedAt: d3, updatedBy: userEmail, updatedAt: d3 };
  stages4['Invoicing'] = {
    stage: 'Invoicing',
    status: 'In Progress',
    progressPercent: 30,
    startDate: d3.split('T')[0],
    assignedEmployee: 'Atul More',
    invoiceNumber: 'INV-2026-AG-0412',
    invoiceDate: d3.split('T')[0],
    invoiceAmount: 4250000,
    invoiceStatus: 'Draft Generated',
    invoiceRemarks: 'Commercial invoice drafted, pending finance clearance',
    updatedBy: userEmail,
    updatedAt: d3,
  };
  initialItems.push({
    id: 'PKG-2574',
    machineNumber: '2574',
    machineSize: '685',
    model: 'Bridge CMM 685',
    project: 'Standard CMM Series',
    customer: 'Kalyani Forge Ltd',
    previousDepartment: '14 Calibration',
    receivedDate: d1.split('T')[0],
    receivedTime: '09:00:00',
    receivedBy: userEmail,
    currentStage: 'Invoicing',
    currentProgressPercent: 30,
    currentStageStatus: 'In Progress',
    stages: stages4,
    isDispatched: false,
    history: [
      {
        id: 'H4-4',
        machineNumber: '2574',
        stage: 'Invoicing',
        action: 'STAGE_STARTED',
        previousProgress: 0,
        newProgress: 30,
        assignedEmployee: 'Atul More',
        invoiceNumber: 'INV-2026-AG-0412',
        remarks: 'Entered Invoicing stage. Draft invoice generated.',
        timestamp: d3,
        updatedBy: userEmail,
      },
      {
        id: 'H4-3',
        machineNumber: '2574',
        stage: 'Packed with Probing',
        action: 'STAGE_COMPLETED',
        previousProgress: 100,
        newProgress: 100,
        assignedEmployee: 'Atul More',
        remarks: 'Packed with probing 100% completed.',
        timestamp: d3,
        updatedBy: userEmail,
      },
      {
        id: 'H4-2',
        machineNumber: '2574',
        stage: 'Packed',
        action: 'STAGE_COMPLETED',
        previousProgress: 100,
        newProgress: 100,
        assignedEmployee: 'Atul More',
        remarks: 'Packed completed 100%.',
        timestamp: d2,
        updatedBy: userEmail,
      },
      {
        id: 'H4-1',
        machineNumber: '2574',
        stage: 'Open Cable',
        action: 'RECEIVED',
        previousProgress: 0,
        newProgress: 0,
        assignedEmployee: 'Atul More',
        remarks: 'Received from 14 Calibration.',
        timestamp: d1,
        updatedBy: userEmail,
      },
    ],
    createdAt: d1,
    updatedAt: d3,
    createdBy: userEmail,
    updatedBy: userEmail,
  });

  saveLocalStore(initialItems);

  // Sync to Firestore
  for (const item of initialItems) {
    try {
      const docRef = doc(db, PACKING_COLLECTION, item.id);
      await setDoc(docRef, cleanData(item), { merge: true });
    } catch (e) {
      console.warn('Failed to seed initial item to firestore:', e);
    }
  }

  return initialItems;
}
