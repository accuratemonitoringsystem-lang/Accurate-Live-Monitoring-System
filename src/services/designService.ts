import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  where,
  orderBy,
  limit,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import {
  DesignWork,
  DesignOperationItem,
  DesignOperationMaster,
  DesignRequest,
  DesignDailyUpdate,
  DesignDocumentItem,
  DesignRequestStatus,
  DesignWorkStatus,
} from '../types';
import { cleanData, createNotification, logAudit } from './db';

const addDoc = async (reference: any, data: any) => {
  const { addDoc: _addDoc } = await import('firebase/firestore');
  return _addDoc(reference, cleanData(data));
};

const updateDoc = async (reference: any, data: any) => {
  const { updateDoc: _updateDoc } = await import('firebase/firestore');
  return _updateDoc(reference, cleanData(data));
};

const deleteDoc = async (reference: any) => {
  const { deleteDoc: _deleteDoc } = await import('firebase/firestore');
  return _deleteDoc(reference);
};

// =========================================================================
// 1. STANDARD OPERATIONS SEEDING (Requirement 5)
// =========================================================================
export const DEFAULT_DESIGN_OPERATIONS = [
  '3D Modeling',
  '2D Drawing',
  'Drawing Review',
  'Design Calculation',
  'BOM Preparation',
  'Engineering Change',
  'Customer Drawing',
  'Internal Review',
];

export async function seedStandardDesignOperations(department: string = '01 Design') {
  try {
    const q = query(collection(db, 'design_operations_master'), limit(1));
    const snapshot = await getDocs(q);
    if (snapshot.empty) {
      const now = new Date().toISOString();
      for (let i = 0; i < DEFAULT_DESIGN_OPERATIONS.length; i++) {
        const name = DEFAULT_DESIGN_OPERATIONS[i];
        await addDoc(collection(db, 'design_operations_master'), {
          name,
          department,
          isActive: true,
          order: i + 1,
          createdAt: now,
          updatedAt: now,
        });
      }
      console.log('Seeded standard design operations into Firestore.');
    }
  } catch (err) {
    console.warn('Could not seed standard design operations:', err);
  }
}

// =========================================================================
// 2. REAL-TIME SUBSCRIPTIONS
// =========================================================================

/**
 * Subscribes to Design Work items.
 * If department is provided, filters by department; otherwise returns all.
 */
export function subscribeDesignWork(
  callback: (works: DesignWork[]) => void,
  department?: string
) {
  try {
    let q = query(collection(db, 'design_work'), orderBy('createdAt', 'desc'));
    if (department && department !== 'All Departments') {
      q = query(
        collection(db, 'design_work'),
        where('department', '==', department),
        orderBy('createdAt', 'desc')
      );
    }

    return onSnapshot(
      q,
      (snapshot) => {
        const list: DesignWork[] = [];
        snapshot.forEach((docSnap) => {
          list.push({ id: docSnap.id, ...(docSnap.data() as any) });
        });
        callback(list);
      },
      (err) => {
        console.error('Error subscribing to design_work:', err);
        // Fallback without ordering in case index is pending
        const simpleQ = collection(db, 'design_work');
        return onSnapshot(simpleQ, (snapshot) => {
          const list: DesignWork[] = [];
          snapshot.forEach((docSnap) => {
            const data = docSnap.data() as any;
            if (!department || department === 'All Departments' || data.department === department) {
              list.push({ id: docSnap.id, ...data });
            }
          });
          callback(list.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')));
        });
      }
    );
  } catch (err) {
    console.error('Error creating subscription to design_work:', err);
    return () => {};
  }
}

/**
 * Subscribes to Design Requests.
 * If isDesignDept is true, sees all requests targeted to Design.
 * If requestingDepartment is provided, filters to requests made by that department.
 */
export function subscribeDesignRequests(
  callback: (requests: DesignRequest[]) => void,
  departmentFilter?: {
    isDesign?: boolean;
    requestingDept?: string;
  }
) {
  try {
    const q = query(collection(db, 'design_requests'), orderBy('createdAt', 'desc'));

    return onSnapshot(
      q,
      (snapshot) => {
        const list: DesignRequest[] = [];
        snapshot.forEach((docSnap) => {
          const item = { id: docSnap.id, ...(docSnap.data() as any) } as DesignRequest;
          if (departmentFilter) {
            if (departmentFilter.isDesign) {
              list.push(item);
            } else if (departmentFilter.requestingDept) {
              if (item.requestingDepartment === departmentFilter.requestingDept) {
                list.push(item);
              }
            } else {
              list.push(item);
            }
          } else {
            list.push(item);
          }
        });
        callback(list);
      },
      (err) => {
        console.error('Error subscribing to design_requests:', err);
        // Fallback without orderBy
        return onSnapshot(collection(db, 'design_requests'), (snapshot) => {
          const list: DesignRequest[] = [];
          snapshot.forEach((docSnap) => {
            list.push({ id: docSnap.id, ...(docSnap.data() as any) });
          });
          callback(list.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')));
        });
      }
    );
  } catch (err) {
    console.error('Error in subscribeDesignRequests:', err);
    return () => {};
  }
}

/**
 * Subscribes to Design Operations Master list
 */
export function subscribeDesignOperationsMaster(
  callback: (ops: DesignOperationMaster[]) => void
) {
  try {
    const q = query(collection(db, 'design_operations_master'), orderBy('order', 'asc'));
    return onSnapshot(
      q,
      (snapshot) => {
        const list: DesignOperationMaster[] = [];
        snapshot.forEach((docSnap) => {
          list.push({ id: docSnap.id, ...(docSnap.data() as any) });
        });
        callback(list);
      },
      () => {
        return onSnapshot(collection(db, 'design_operations_master'), (snapshot) => {
          const list: DesignOperationMaster[] = [];
          snapshot.forEach((docSnap) => {
            list.push({ id: docSnap.id, ...(docSnap.data() as any) });
          });
          callback(list.sort((a, b) => (a.order || 0) - (b.order || 0)));
        });
      }
    );
  } catch (err) {
    console.error('Error in subscribeDesignOperationsMaster:', err);
    return () => {};
  }
}

/**
 * Subscribes to Design Daily Updates (EOD updates submitted to Admin)
 */
export function subscribeDesignDailyUpdates(
  callback: (updates: DesignDailyUpdate[]) => void,
  department?: string
) {
  try {
    const q = query(collection(db, 'design_daily_updates'), orderBy('submittedAt', 'desc'));
    return onSnapshot(
      q,
      (snapshot) => {
        const list: DesignDailyUpdate[] = [];
        snapshot.forEach((docSnap) => {
          const data = { id: docSnap.id, ...(docSnap.data() as any) } as DesignDailyUpdate;
          if (!department || department === 'All Departments' || data.department === department) {
            list.push(data);
          }
        });
        callback(list);
      },
      () => {
        return onSnapshot(collection(db, 'design_daily_updates'), (snapshot) => {
          const list: DesignDailyUpdate[] = [];
          snapshot.forEach((docSnap) => {
            list.push({ id: docSnap.id, ...(docSnap.data() as any) });
          });
          callback(list.sort((a, b) => (b.submittedAt || '').localeCompare(a.submittedAt || '')));
        });
      }
    );
  } catch (err) {
    console.error('Error in subscribeDesignDailyUpdates:', err);
    return () => {};
  }
}

// =========================================================================
// 3. DESIGN WORK ACTIONS (Requirement 3, 4, 6)
// =========================================================================

/**
 * Creates a new Design Work item.
 * Automatically calculates progress % from operations count.
 */
export async function createDesignWork(
  data: Omit<
    DesignWork,
    | 'id'
    | 'createdAt'
    | 'updatedAt'
    | 'progressPercent'
    | 'completedOperationsCount'
    | 'totalOperationsCount'
    | 'operations'
    | 'status'
  > & {
    status?: DesignWorkStatus;
    operations?: Array<{ name: string; order?: number }>;
  },
  userEmail?: string
): Promise<string> {
  try {
    const now = new Date().toISOString();
    const ops: DesignOperationItem[] = (data.operations || []).map((op, idx) => ({
      id: `op_${Date.now()}_${idx}`,
      name: op.name,
      completed: false,
      order: op.order ?? idx + 1,
    }));

    const totalOperationsCount = ops.length;
    const completedOperationsCount = 0;
    const progressPercent = 0;

    const initialStatus: DesignWorkStatus = data.assignedDesigner ? 'ASSIGNED' : 'CREATE';

    const docRef = await addDoc(collection(db, 'design_work'), {
      ...data,
      operations: ops,
      totalOperationsCount,
      completedOperationsCount,
      progressPercent,
      status: initialStatus,
      documents: data.documents || [],
      createdAt: now,
      updatedAt: now,
    });

    await logAudit(
      'CREATE_DESIGN_WORK',
      'DESIGN',
      docRef.id,
      '',
      `Created Design Work: ${data.title} (${data.workType}) assigned to ${data.assignedDesigner || 'Unassigned'}`,
      userEmail
    );

    return docRef.id;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, 'design_work');
    throw err;
  }
}

/**
 * Updates an existing Design Work item
 */
export async function updateDesignWork(
  workId: string,
  updates: Partial<DesignWork>,
  userEmail?: string
): Promise<void> {
  try {
    const now = new Date().toISOString();
    await updateDoc(doc(db, 'design_work', workId), {
      ...updates,
      updatedAt: now,
    });

    await logAudit('UPDATE_DESIGN_WORK', 'DESIGN', workId, '', JSON.stringify(updates), userEmail);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `design_work/${workId}`);
    throw err;
  }
}

/**
 * Toggles an operation within a Design Work item.
 * Automatically recalculates completed count and progress percentage.
 * If 100% of operations are completed, transitions status to COMPLETED and sets actualCompletionDate.
 */
export async function toggleDesignWorkOperation(
  work: DesignWork,
  operationId: string,
  userName: string,
  userEmail?: string
): Promise<void> {
  try {
    const now = new Date().toISOString();
    const updatedOperations = (work.operations || []).map((op) => {
      if (op.id === operationId) {
        const nextState = !op.completed;
        return {
          ...op,
          completed: nextState,
          completedAt: nextState ? now : undefined,
          completedBy: nextState ? userName : undefined,
        };
      }
      return op;
    });

    const totalOps = updatedOperations.length;
    const completedOps = updatedOperations.filter((o) => o.completed).length;
    const progressPercent = totalOps > 0 ? Math.round((completedOps / totalOps) * 100) : 0;

    let nextStatus: DesignWorkStatus = work.status;
    let actualCompletionDate = work.actualCompletionDate;

    if (progressPercent >= 100) {
      nextStatus = 'COMPLETED';
      actualCompletionDate = now.split('T')[0];
    } else if (completedOps > 0) {
      nextStatus = 'IN_PROGRESS';
    }

    await updateDoc(doc(db, 'design_work', work.id), {
      operations: updatedOperations,
      completedOperationsCount: completedOps,
      totalOperationsCount: totalOps,
      progressPercent,
      status: nextStatus,
      actualCompletionDate: actualCompletionDate || null,
      updatedAt: now,
    });

    await logAudit(
      'UPDATE_DESIGN_OPERATION',
      'DESIGN',
      work.id,
      '',
      `Operation ${operationId} toggled by ${userName}. Progress: ${progressPercent}%`,
      userEmail
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `design_work/${work.id}`);
    throw err;
  }
}

/**
 * Adds a custom operation to an existing Design Work item
 */
export async function addCustomOperationToWork(
  work: DesignWork,
  operationName: string,
  userEmail?: string
): Promise<void> {
  try {
    const now = new Date().toISOString();
    const newOp: DesignOperationItem = {
      id: `op_${Date.now()}`,
      name: operationName.trim(),
      completed: false,
      order: (work.operations?.length || 0) + 1,
    };

    const updatedOps = [...(work.operations || []), newOp];
    const totalOps = updatedOps.length;
    const completedOps = updatedOps.filter((o) => o.completed).length;
    const progressPercent = totalOps > 0 ? Math.round((completedOps / totalOps) * 100) : 0;

    await updateDoc(doc(db, 'design_work', work.id), {
      operations: updatedOps,
      totalOperationsCount: totalOps,
      completedOperationsCount: completedOps,
      progressPercent,
      updatedAt: now,
    });

    await logAudit(
      'ADD_OPERATION_TO_DESIGN_WORK',
      'DESIGN',
      work.id,
      '',
      `Added custom operation "${operationName}" to work ${work.title}`,
      userEmail
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `design_work/${work.id}`);
    throw err;
  }
}

/**
 * Adds a document/drawing attachment to a Design Work item with version history
 */
export async function addDocumentToDesignWork(
  work: DesignWork,
  docItem: Omit<DesignDocumentItem, 'id' | 'uploadedAt'>,
  userEmail?: string
): Promise<void> {
  try {
    const now = new Date().toISOString();
    const newDoc: DesignDocumentItem = {
      id: `doc_${Date.now()}`,
      ...docItem,
      uploadedAt: now,
    };

    const updatedDocuments = [...(work.documents || []), newDoc];

    await updateDoc(doc(db, 'design_work', work.id), {
      documents: updatedDocuments,
      updatedAt: now,
    });

    await logAudit(
      'ADD_DESIGN_DOCUMENT',
      'DESIGN',
      work.id,
      '',
      `Added document "${newDoc.name}" (${newDoc.version}) to work ${work.title}`,
      userEmail
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `design_work/${work.id}`);
    throw err;
  }
}

/**
 * Deletes a Design Work item
 */
export async function deleteDesignWork(workId: string, userEmail?: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'design_work', workId));
    await logAudit('DELETE_DESIGN_WORK', 'DESIGN', workId, '', 'Deleted design work item', userEmail);
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `design_work/${workId}`);
    throw err;
  }
}

// =========================================================================
// 4. DESIGN REQUEST ACTIONS (Requirement 7, 8, 9, 10, 11)
// =========================================================================

/**
 * Creates a Design Request from any production department.
 * Does NOT affect machine roadmap or shop floor status.
 * Automatically notifies Design department.
 */
export async function createDesignRequest(
  data: Omit<DesignRequest, 'id' | 'requestNumber' | 'status' | 'createdAt' | 'updatedAt' | 'history'>,
  userEmail?: string
): Promise<string> {
  try {
    const now = new Date().toISOString();
    const randNum = Math.floor(1000 + Math.random() * 9000);
    const requestNumber = `DR-${new Date().getFullYear()}-${randNum}`;

    const targetDept = data.targetDesignDepartment || '01 Design';

    const historyItem = {
      timestamp: now,
      action: 'REQUEST_SUBMITTED',
      user: data.requestedBy,
      department: data.requestingDepartment,
      notes: `Design Request submitted: "${data.requestTitle}" (Priority: ${data.priority})`,
    };

    const docRef = await addDoc(collection(db, 'design_requests'), {
      ...data,
      requestNumber,
      targetDesignDepartment: targetDept,
      status: 'New' as DesignRequestStatus,
      history: [historyItem],
      createdAt: now,
      updatedAt: now,
    });

    // Notify Design team (Requirement 25)
    await createNotification({
      recipientDepartment: targetDept,
      recipientRole: 'DESIGN',
      title: `New Design Request: ${requestNumber}`,
      message: `${data.requestingDepartment} requested Design support for: "${data.requestTitle}" (Priority: ${data.priority})`,
      type: 'delay', // High-priority notification style
      linkId: docRef.id,
      linkType: 'design_request',
    });

    await logAudit(
      'CREATE_DESIGN_REQUEST',
      'DESIGN_REQUESTS',
      docRef.id,
      '',
      `${requestNumber} by ${data.requestingDepartment} (${data.requestedBy})`,
      userEmail
    );

    return docRef.id;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, 'design_requests');
    throw err;
  }
}

/**
 * Design accepts a request and optionally assigns to a designer
 */
export async function acceptDesignRequest(
  request: DesignRequest,
  assignedDesigner: string,
  userName: string,
  userEmail?: string
): Promise<void> {
  try {
    const now = new Date().toISOString();
    const historyItem = {
      timestamp: now,
      action: 'REQUEST_ACCEPTED',
      user: userName,
      department: request.targetDesignDepartment || 'Design',
      notes: `Accepted and assigned to designer: ${assignedDesigner}`,
    };

    await updateDoc(doc(db, 'design_requests', request.id), {
      status: 'Accepted' as DesignRequestStatus,
      assignedDesigner,
      history: [...(request.history || []), historyItem],
      updatedAt: now,
    });

    // Notify requesting department (Requirement 25)
    await createNotification({
      recipientDepartment: request.requestingDepartment,
      recipientRole: 'ALL',
      title: `Design Request Accepted: ${request.requestNumber}`,
      message: `Design team has accepted your request "${request.requestTitle}". Assigned to designer ${assignedDesigner}.`,
      type: 'general',
      linkId: request.id,
      linkType: 'design_request',
    });

    await logAudit(
      'ACCEPT_DESIGN_REQUEST',
      'DESIGN_REQUESTS',
      request.id,
      '',
      `Accepted and assigned to ${assignedDesigner}`,
      userEmail
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `design_requests/${request.id}`);
    throw err;
  }
}

/**
 * Design requests more information from requesting department (Requirement 11)
 */
export async function requestMoreInfoForDesignRequest(
  request: DesignRequest,
  note: string,
  reason: string,
  userName: string,
  userEmail?: string
): Promise<void> {
  try {
    const now = new Date().toISOString();
    const historyItem = {
      timestamp: now,
      action: 'MORE_INFO_REQUESTED',
      user: userName,
      department: request.targetDesignDepartment || 'Design',
      notes: `Information required: ${note} | Reason: ${reason}`,
    };

    await updateDoc(doc(db, 'design_requests', request.id), {
      status: 'Waiting for Information' as DesignRequestStatus,
      infoRequiredNote: note,
      infoRequiredReason: reason,
      history: [...(request.history || []), historyItem],
      updatedAt: now,
    });

    // Notify Requesting department (Requirement 25)
    await createNotification({
      recipientDepartment: request.requestingDepartment,
      recipientRole: 'ALL',
      title: `Design Clarification Needed: ${request.requestNumber}`,
      message: `Design requires more information for "${request.requestTitle}": ${note}`,
      type: 'delay',
      linkId: request.id,
      linkType: 'design_request',
    });

    await logAudit(
      'REQUEST_MORE_INFO_DESIGN',
      'DESIGN_REQUESTS',
      request.id,
      '',
      `Requested info: ${note}`,
      userEmail
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `design_requests/${request.id}`);
    throw err;
  }
}

/**
 * Requesting department provides clarification/information back to Design
 */
export async function provideInfoForDesignRequest(
  request: DesignRequest,
  response: string,
  userName: string,
  userEmail?: string
): Promise<void> {
  try {
    const now = new Date().toISOString();
    const historyItem = {
      timestamp: now,
      action: 'INFO_PROVIDED',
      user: userName,
      department: request.requestingDepartment,
      notes: `Clarification provided: ${response}`,
    };

    await updateDoc(doc(db, 'design_requests', request.id), {
      status: 'In Progress' as DesignRequestStatus,
      infoProvidedResponse: response,
      history: [...(request.history || []), historyItem],
      updatedAt: now,
    });

    // Notify Design department
    await createNotification({
      recipientDepartment: request.targetDesignDepartment || '01 Design',
      recipientRole: 'DESIGN',
      title: `Info Received for Request: ${request.requestNumber}`,
      message: `${request.requestingDepartment} provided clarification for "${request.requestTitle}": ${response}`,
      type: 'general',
      linkId: request.id,
      linkType: 'design_request',
    });

    await logAudit(
      'PROVIDE_INFO_DESIGN_REQUEST',
      'DESIGN_REQUESTS',
      request.id,
      '',
      `Provided info: ${response}`,
      userEmail
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `design_requests/${request.id}`);
    throw err;
  }
}

/**
 * Design completes a request with response, remarks, and attached drawing/document (Requirement 10)
 */
export async function completeDesignRequest(
  request: DesignRequest,
  data: {
    completionRemarks: string;
    solutionProvided: string;
    completedBy: string;
    completedDate: string;
    responseDocumentName?: string;
    responseDocumentUrl?: string;
    responseDocumentType?: string;
  },
  userEmail?: string
): Promise<void> {
  try {
    const now = new Date().toISOString();
    const historyItem = {
      timestamp: now,
      action: 'REQUEST_COMPLETED',
      user: data.completedBy,
      department: request.targetDesignDepartment || 'Design',
      notes: `Request completed. Solution: ${data.solutionProvided}. Remarks: ${data.completionRemarks}`,
    };

    await updateDoc(doc(db, 'design_requests', request.id), {
      status: 'Completed' as DesignRequestStatus,
      completionRemarks: data.completionRemarks,
      solutionProvided: data.solutionProvided,
      completedBy: data.completedBy,
      completedDate: data.completedDate || now.split('T')[0],
      responseDocumentName: data.responseDocumentName || null,
      responseDocumentUrl: data.responseDocumentUrl || null,
      responseDocumentType: data.responseDocumentType || null,
      history: [...(request.history || []), historyItem],
      updatedAt: now,
    });

    // Notify Requesting department (Requirement 10 & 25)
    await createNotification({
      recipientDepartment: request.requestingDepartment,
      recipientRole: 'ALL',
      title: `DESIGN REQUEST COMPLETED: ${request.requestNumber}`,
      message: `Design has completed request "${request.requestTitle}". Drawing/document available for review.`,
      type: 'milestone',
      linkId: request.id,
      linkType: 'design_request',
    });

    await logAudit(
      'COMPLETE_DESIGN_REQUEST',
      'DESIGN_REQUESTS',
      request.id,
      '',
      `Completed by ${data.completedBy}: ${data.solutionProvided}`,
      userEmail
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `design_requests/${request.id}`);
    throw err;
  }
}

// =========================================================================
// 5. END-OF-DAY UPDATE (Requirement 13 & 14)
// =========================================================================

/**
 * Submits Design End-of-Day Update to Admin
 */
export async function submitDesignDailyUpdate(
  data: Omit<DesignDailyUpdate, 'id' | 'submittedAt'>,
  userEmail?: string
): Promise<string> {
  try {
    const now = new Date().toISOString();
    const docRef = await addDoc(collection(db, 'design_daily_updates'), {
      ...data,
      submittedAt: now,
    });

    // Notify Administrator (Requirement 25)
    await createNotification({
      recipientDepartment: 'ADMIN',
      recipientRole: 'ADMIN',
      title: `Design End-of-Day Update: ${data.date}`,
      message: `${data.department} submitted daily update. Completed: ${data.totalWorkCompletedToday}, In Progress: ${data.workInProgress}, Delayed: ${data.delayedWork}`,
      type: 'general',
      linkId: docRef.id,
      linkType: 'design_daily_update',
    });

    await logAudit(
      'SUBMIT_DESIGN_DAILY_UPDATE',
      'DESIGN',
      docRef.id,
      '',
      `Design EOD update for ${data.date} submitted by ${data.submittedBy}`,
      userEmail
    );

    return docRef.id;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, 'design_daily_updates');
    throw err;
  }
}

// =========================================================================
// 6. DESIGN OPERATIONS MASTER MANAGEMENT (Requirement 5)
// =========================================================================

export async function createDesignOperationMaster(
  data: Omit<DesignOperationMaster, 'id' | 'createdAt' | 'updatedAt'>,
  userEmail?: string
): Promise<string> {
  try {
    const now = new Date().toISOString();
    const docRef = await addDoc(collection(db, 'design_operations_master'), {
      ...data,
      createdAt: now,
      updatedAt: now,
    });
    await logAudit('CREATE_DESIGN_OPERATION_MASTER', 'DESIGN', docRef.id, '', data.name, userEmail);
    return docRef.id;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, 'design_operations_master');
    throw err;
  }
}

export async function updateDesignOperationMaster(
  id: string,
  updates: Partial<DesignOperationMaster>,
  userEmail?: string
): Promise<void> {
  try {
    const now = new Date().toISOString();
    await updateDoc(doc(db, 'design_operations_master', id), {
      ...updates,
      updatedAt: now,
    });
    await logAudit('UPDATE_DESIGN_OPERATION_MASTER', 'DESIGN', id, '', JSON.stringify(updates), userEmail);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `design_operations_master/${id}`);
    throw err;
  }
}

export async function deleteDesignOperationMaster(id: string, userEmail?: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'design_operations_master', id));
    await logAudit('DELETE_DESIGN_OPERATION_MASTER', 'DESIGN', id, '', 'Deleted operation', userEmail);
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `design_operations_master/${id}`);
    throw err;
  }
}
