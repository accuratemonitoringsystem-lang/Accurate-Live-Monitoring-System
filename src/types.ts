export type UserRole = 'ADMIN' | 'PLANNING' | 'QUALITY' | 'DEPARTMENT USER' | 'MANAGEMENT / VIEWER';

export interface UserProfile {
  id: string;
  userId: string;
  uid?: string;
  username: string;
  passwordHash?: string;
  employeeName: string;
  displayName: string;
  authorityName?: string;
  processNo?: string;
  mustChangePassword?: boolean;
  employeeCode?: string;
  email: string;
  departmentId: string;
  department: string;
  role: UserRole;
  status: 'Active' | 'Inactive';
  active: boolean;
  lastLoginAt?: string;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

export type AppUser = UserProfile;

export interface Department {
  id: string;
  code: string;
  name: string;
  active: boolean;
  order: number;
  createdAt?: string;
  updatedAt?: string;
}

export type MachineStatus =
  | 'Not Started'
  | 'Pending'
  | 'In Progress'
  | 'On Track'
  | 'Delayed'
  | 'Quality Hold'
  | 'QUALITY_HOLD'
  | 'On Hold'
  | 'Completed'
  | 'Ready for Packing'
  | 'Dispatched'
  | 'DISPATCHED'
  | 'PLANNED'
  | 'ASSIGNED'
  | 'INCOMING'
  | 'ACCEPTED'
  | 'NOT_STARTED'
  | 'IN_PROGRESS'
  | 'WORK_STARTED'
  | 'ON_HOLD'
  | 'DELAYED'
  | 'BLOCKED'
  | 'COMPLETED'
  | 'QUALITY_PENDING'
  | 'QUALITY_REJECTED'
  | 'CORRECTIVE_ACTION'
  | 'REINSPECTION'
  | 'READY_FOR_HANDOVER'
  | 'Ready for Handover'
  | 'HANDED_OVER'
  | 'RETURNED'
  | 'Returned for Correction'
  | '100% Completed'
  | 'AWAITING_ACCEPTANCE'
  | 'Awaiting Acceptance'
  | 'CANCELLED';

export type ProcessStageStatus =
  | 'Not Started'
  | 'In Progress'
  | 'Completed'
  | 'Pending'
  | 'Delayed'
  | 'On Hold'
  | 'N/A';

export const STANDARD_DELAY_REASONS = [
  'Material Shortage',
  'Drawing Revision',
  'Vendor Delay',
  'Rework',
  'Manpower Shortage',
  'Machine Breakdown',
  'Customer Inspection Delay',
  'Other',
] as const;

export type StandardDelayReason = typeof STANDARD_DELAY_REASONS[number];

export interface MachineProcessStage {
  departmentCode: string;
  departmentName: string;
  targetDate?: string;
  actualDate?: string;
  status: ProcessStageStatus;
  progressPercent: number;
  delayDays?: number;
  remarks?: string;
  updatedBy?: string;
  updatedAt?: string;
}

export interface MachineHistoryEntry {
  id: string;
  date: string;
  department: string;
  task?: string;
  employee?: string;
  startDate?: string;
  completionDate?: string;
  duration?: string;
  durationDays?: number;
  handedOverTo?: string;
  receivedDate?: string;
  progress?: number;
  status?: string;
  remarks?: string;
  delayDays?: number;
  delayReason?: string;
  delayRemarks?: string;
  qualityStatus?: string;
}

export interface MachineProgressHistory {
  id: string;
  machineId?: string;
  machineNumber: string;
  department: string;
  workId?: string;
  workTitle?: string;
  employee: string;
  date: string;
  time?: string;
  previousProgress: number;
  newProgress: number;
  actualQuantity?: number;
  status: string;
  remarks?: string;
  delayReason?: string;
  expectedCompletionDate?: string;
  attachmentUrl?: string;
  createdAt: string;
  createdBy?: string;
}

export interface Machine {
  id: string;
  machineNumber: string;
  model: string;
  machineSize?: string;
  specification?: string;
  quantity?: number;
  priority?: string;
  month?: string;
  year?: string | number;
  planMonth?: string;
  planYear?: string;
  planName?: string;
  sequenceNumber?: number;
  status?: MachineStatus;
  project?: string;
  customer?: string;
  currentDepartment: string;
  currentProcess?: string;
  currentEmployee?: string;
  currentWork?: string;
  responsibleDepartment?: string;
  responsibleEmployee?: string;
  progress?: number;
  plannedStartDate?: string;
  plannedDueDate?: string;
  actualStartDate?: string;
  actualCompletionDate?: string;
  expectedCompletionDate?: string;
  targetCompletionDate?: string;
  targetDisptachDate?: string;
  targetDispatchDate?: string;
  machineModel?: string;
  nextDepartment?: string;
  previousDepartment?: string;
  processRoute?: string[];
  handoverStatus?: string;
  handoverDate?: string;
  receivedDate?: string;
  completedDate?: string;
  overallProgress?: number;
  qualityStatus?: string;
  delayDays?: number;
  delayReason?: string;
  delayRemarks?: string;
  currentStatus: MachineStatus;
  process?: string;
  processName?: string;
  operation?: string;
  projectName?: string;
  client?: string;
  dueDate?: string;
  startDate?: string;
  lastUpdated?: string;
  plannedDate?: string;
  completionDate?: string;
  dispatchDate?: string;
  isDispatched?: boolean;
  assignedDate?: string;
  targetDate?: string;
  size?: string;
  departmentProgress?: number;
  departmentOperations?: Record<string, any[]>;
  operations?: WorkOperationItem[];
  todayCompletedOperations?: number;
  totalOperations?: number;
  remarks?: string;
  isNpi?: boolean;
  processStages?: Record<string, MachineProcessStage>;
  completedProcessesCount?: number;
  applicableProcessesCount?: number;
  overallProgressPercent?: number;
  todayWorkPercent?: number;
  completedOpsCount?: number;
  remainingOpsCount?: number;
  todayCompletedCount?: number;
  totalOpsCount?: number;
  departmentCompliance?: number;
  compliancePercentage?: number;
  activeOperationName?: string;
  currentOperation?: string;
  currentOperationStatus?: string;
  lastUpdateDate?: string;
  lastUpdate?: string;
  isDelayed?: boolean;
  isReturned?: boolean;
  returnedBy?: string;
  returnedAt?: string;
  returnReason?: string;
  correctiveAction?: string;
  weekNumber?: string;
  weeklyPlanId?: string;
  history?: MachineHistoryEntry[];
  lastOperationUpdateTime?: string;
  firstOperationExecutionTime?: string;
  departmentWorkCompletionTime?: string;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
}

export interface ProductionPlan {
  id: string;
  planName: string;
  month: string;
  year: string;
  totalMachines: number;
  totalQuantity: number;
  status: 'Active' | 'Draft' | 'Completed' | 'Archived';
  remarks?: string;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
}

export interface RoadmapItem {
  id: string;
  project: string;
  machineNumber: string;
  department: string;
  process: string;
  task: string;
  startDate: string;
  plannedCompletionDate: string;
  actualCompletionDate?: string;
  status: 'Not Started' | 'In Progress' | 'Completed' | 'Delayed' | 'On Hold';
  priority: 'Low' | 'Medium' | 'High' | 'Critical';
  remarks?: string;
  createdAt: string;
  updatedAt: string;
}

export interface YearlyPlan {
  id: string;
  year: string;
  department: string;
  machineModel?: string;
  machineNumber?: string;
  project?: string;
  targetQuantity: number;
  targetAmount?: number;
  plannedStartDate?: string;
  plannedEndDate?: string;
  responsiblePerson?: string;
  remarks?: string;
  status?: string;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  updatedBy?: string;
}

export interface MonthlyPlan {
  id: string;
  month: string;
  year: string;
  department: string;
  machineModel?: string;
  machineNumber?: string;
  machineSize?: string;
  model?: string;
  specification?: string;
  size?: string;
  cmmSize?: string;
  cmmModel?: string;
  sequenceNumber?: number;
  priorityNumber?: number;
  sequenceOrder?: number;
  planOrder?: number;
  planTitle?: string;
  importBatchId?: string;
  batchId?: string;
  project?: string;
  projectName?: string;
  customer?: string;
  client?: string;
  operationWork?: string;
  process?: string;
  task?: string;
  category?: string;
  plannedQuantity: number;
  plannedTime?: string;
  targetAmount?: number;
  actualQuantity?: number;
  actualAmount?: number;
  remainingQuantity?: number;
  achievementPercent?: number;
  responsibleEmployee?: string;
  priority?: 'Low' | 'Medium' | 'High' | 'Critical' | string;
  plannedStartDate?: string;
  plannedEndDate?: string;
  remarks?: string;
  status?: string;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  updatedBy?: string;
}

export interface WeeklyPlan {
  id: string;
  weekNumber?: number | string;
  weekStartDate: string;
  weekEndDate: string;
  year: string | number;
  department: string;
  machineModel?: string;
  machineNumber?: string;
  machineSize?: string;
  sequenceNumber?: number;
  priorityNumber?: number;
  sequenceOrder?: number;
  planOrder?: number;
  planTitle?: string;
  importBatchId?: string;
  batchId?: string;
  project?: string;
  operationWork?: string;
  process?: string;
  task?: string;
  category?: string;
  plannedQuantity: number;
  plannedTime?: string;
  targetAmount?: number;
  actualQuantity?: number;
  actualAmount?: number;
  remainingQuantity?: number;
  achievementPercent?: number;
  responsibleEmployee?: string;
  priority?: 'Low' | 'Medium' | 'High' | 'Critical' | string;
  startDate?: string;
  endDate?: string;
  dueDate?: string;
  targetDate?: string;
  plannedStartDate?: string;
  plannedEndDate?: string;
  delayReason?: string;
  revisedDate?: string;
  correctiveAction?: string;
  remarks?: string;
  status?: string;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  updatedBy?: string;
}

export interface WorkUpdate {
  id: string;
  workId?: string;
  date: string; // YYYY-MM-DD
  machineNumber?: string;
  task?: string;
  employee?: string;
  progressPercent: number;
  actualQuantity?: number;
  status: WorkStatus;
  remarks?: string;
  attachmentUrl?: string;
  createdAt: string;
  createdBy?: string;
}

export type QualityCategory = 'Manufacturing' | 'Bought-Out' | 'Other';

export type QualityOperationStatus = 'Active' | 'Inactive';

export interface QualityOperation {
  id: string;
  machineModel: string;
  category: QualityCategory;
  operationName: string;
  partCode?: string;
  srNo?: string;
  type?: string;
  processDepartment: string;
  plannedInspectionTime?: string;
  description?: string;
  specification?: string;
  specificationRequirement?: string; // alias for compatibility
  status?: QualityOperationStatus;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  updatedBy?: string;
}

export type QualityInspectionStatus = 'Accept' | 'Reject' | 'Hold' | 'Rework' | 'Pending';

export interface QualityDailyCheck {
  id: string;
  machineId?: string;
  machineNumber: string;
  machineModel: string;
  operationId: string;
  operationName: string;
  category?: string;
  date: string; // YYYY-MM-DD
  userId?: string;
  userEmail?: string;
  time?: string;
  status: QualityInspectionStatus;
  qualityResult?: QualityInspectionStatus; // synonym for status
  remarks?: string;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  updatedBy?: string;
}

export type RejectionReason =
  | 'Dimension Out of Tolerance'
  | 'Drawing Mismatch'
  | 'Material Issue'
  | 'Wrong Part'
  | 'Surface Finish Issue'
  | 'Assembly Issue'
  | 'Damage'
  | 'Hole/Thread Issue'
  | 'Quality Parameter Not Achieved'
  | 'Previous Process Issue'
  | 'Quantity Issue'
  | 'Other';

export type RejectionWorkflowStatus =
  | 'Rejected'
  | 'Corrective Action Submitted'
  | 'Re-inspection Pending'
  | 'Accepted'
  | 'Closed';

export interface QualityRejection {
  id: string;
  machineId?: string;
  machineNumber: string;
  machineModel: string;
  operationId?: string;
  operationName: string;
  defectCategory?: string;
  defectDescription?: string;
  rejectionReason: RejectionReason | string;
  rejectionType?: string;
  specification?: string;
  actualFinding?: string;
  concernedDepartment: string;
  remarks?: string;
  attachmentUrl?: string;
  status: RejectionWorkflowStatus;
  correctiveAction?: string;
  correctiveActionBy?: string;
  correctiveActionDate?: string;
  reinspectionResult?: string;
  reinspectionRemarks?: string;
  reinspectionDate?: string;
  reinspectedBy?: string;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
}

export type WorkStatus =
  | 'Pending'
  | 'In Progress'
  | 'Completed'
  | 'Delayed'
  | 'Not Started'
  | 'Quality Hold'
  | 'QUALITY_HOLD'
  | 'On Hold';

export interface WorkOperationItem {
  id: string;
  name: string;
  operationName?: string;
  standardTimeMinutes?: number;
  department?: string;
  sequenceNumber?: number;
  partCode?: string;
  category?: string;
  status: 'Not Started' | 'In Progress' | 'Completed';
  startDate?: string;
  completedDate?: string;
  completedAt?: string;
  workDate?: string;
  completedBy?: string;
  completedToday?: boolean;
  remarks?: string;
}

export interface DailyOperationLog {
  id?: string;
  machine_id: string;
  machineNumber: string;
  department_id: string;
  department: string;
  operation_id: string;
  operation_name: string;
  status: 'Completed';
  work_date: string;
  completed_at: string;
  completed_by: string;
  remarks?: string;
  createdAt?: string;
}

export interface DailyWorkHistoryGroup {
  date: string;
  formattedDate: string;
  completedCount: number;
  dailyWorkPercent: number;
  operations: {
    operationId: string;
    operationName: string;
    completedAt: string;
    completedBy: string;
    remarks?: string;
  }[];
}

export interface DepartmentWork {
  id: string;
  title: string;
  description?: string;
  workDescription?: string;
  department: string;
  machineNumber?: string;
  machineModel?: string;
  machineSize?: string;
  specification?: string;
  month?: string;
  year?: string | number;
  planMonth?: string;
  planYear?: string | number;
  isResponsible?: boolean;
  operationWork?: string;
  operation?: string;
  employee?: string;
  startDate?: string;
  category?: string;
  plannedQuantity?: number;
  actualQuantity?: number;
  plannedTime?: string;
  status: WorkStatus;
  priority?: 'Low' | 'Medium' | 'High' | 'Critical';
  assignedTo?: string;
  assignedDate?: string;
  targetDate?: string;
  dueDate?: string;
  delayReason?: string;
  revisedDate?: string;
  correctiveAction?: string;
  completionTime?: string;
  remarks?: string;
  progress?: number;
  todayWorkPercent?: number;
  completedOperationsCount?: number;
  remainingOperationsCount?: number;
  todayCompletedOperationsCount?: number;
  totalOperationsCount?: number;
  operations?: WorkOperationItem[];
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
}

export type HandoverStatus =
  | 'SENT'
  | 'Pending Acceptance'
  | 'PENDING_ACCEPTANCE'
  | 'PENDING'
  | 'RECEIVED'
  | 'ACCEPTED'
  | 'Accepted'
  | 'REJECTED'
  | 'IN_PROGRESS'
  | 'In Progress'
  | 'COMPLETED'
  | 'Completed'
  | 'RETURNED'
  | 'Sent Back'
  | 'Issue Raised'
  | 'CANCELLED';

export interface DepartmentHandover {
  id: string;
  handoverId?: string;
  machineId?: string;
  machineNumber: string;
  modelSize?: string;
  machineModel?: string;
  machineSize?: string;
  project?: string;
  customer?: string;
  fromDepartment?: string;
  sendingDepartment: string;
  toDepartment?: string;
  receivingDepartment: string;
  process?: string;
  operation?: string;
  workDescription: string;
  partCode?: string;
  quantity?: number;
  currentStatus?: string;
  handoverDate?: string;
  sentDate?: string;
  handoverTime?: string;
  sentBy?: string;
  completedProgress?: number;
  date: string;
  requiredDate?: string;
  priority?: 'Low' | 'Medium' | 'High' | 'Critical' | string;
  employee?: string;
  remarks?: string;
  attachment?: string;
  attachmentUrl?: string;
  status: HandoverStatus;
  acceptedBy?: string;
  acceptedDate?: string;
  acceptedAt?: string;
  rejectionReason?: string;
  returnRemarks?: string;
  issueRemarks?: string;
  correctiveActionRequired?: string;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  updatedBy?: string;
}

export type QualityHandoverStatus =
  | 'SENT_TO_QUALITY'
  | 'RECEIVED'
  | 'UNDER_INSPECTION'
  | 'ACCEPTED'
  | 'REJECTED'
  | 'HOLD'
  | 'REWORK_REQUIRED'
  | 'CORRECTIVE_ACTION_IN_PROGRESS'
  | 'RESUBMITTED'
  | 'REINSPECTION'
  | 'CLOSED';

export interface QualityHandover {
  id: string;
  handoverId: string; // e.g. QH-2026-00001
  machineId?: string;
  machineNumber: string;
  machineModel?: string;
  project?: string;
  customer?: string;
  sendingDepartment: string;
  receivingDepartment: string;
  employee?: string;
  work?: string;
  process?: string;
  operation: string;
  partCode?: string;
  quantity: number;
  handoverDate: string; // YYYY-MM-DD
  requiredInspectionDate?: string;
  priority: 'Low' | 'Medium' | 'High' | 'Critical';
  remarks?: string;
  attachment?: string;
  status: QualityHandoverStatus;
  currentInspectionCycle: number;
  lastInspectionResult?: 'ACCEPT' | 'REJECT' | 'REWORK' | 'HOLD';
  lastInspectionDate?: string;
  lastInspector?: string;
  defectCategory?: string;
  defectDescription?: string;
  rejectionReason?: string;
  reworkReason?: string;
  holdReason?: string;
  specification?: string;
  expectedValue?: string;
  actualFinding?: string;
  concernedDepartment?: string;
  correctiveActionRequired?: string;
  correctiveActionStatus?: string;
  expectedReviewDate?: string;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  updatedBy?: string;
}

export interface QualityInspectionRecord {
  id: string;
  handoverId: string;
  inspectionCycle: number;
  machineNumber: string;
  machineModel?: string;
  operation: string;
  inspector: string;
  inspectionDate: string;
  result: 'ACCEPT' | 'REJECT' | 'REWORK' | 'HOLD';
  defectCategory?: string;
  defectDescription?: string;
  remarks?: string;
  attachment?: string;
  createdAt: string;
  createdBy?: string;
}

export interface QualityReworkRecord {
  id: string;
  handoverId: string;
  inspectionCycle: number;
  machineNumber: string;
  department: string;
  defectCategory: string;
  defectDescription?: string;
  reason: string;
  specification?: string;
  actualFinding?: string;
  correctiveActionRequired?: string;
  expectedReviewDate?: string;
  remarks?: string;
  attachment?: string;
  status: 'ACTIVE' | 'RESOLVED' | 'RESUBMITTED';
  createdAt: string;
  createdBy?: string;
}

export interface QualityHoldRecord {
  id: string;
  handoverId: string;
  inspectionCycle: number;
  machineNumber: string;
  department: string;
  defectCategory?: string;
  reason: string;
  expectedReviewDate?: string;
  remarks?: string;
  attachment?: string;
  status: 'ACTIVE' | 'RELEASED';
  createdAt: string;
  createdBy?: string;
}

export interface QualityCorrectiveActionRecord {
  id: string;
  handoverId: string;
  rejectionId?: string;
  inspectionCycle: number;
  machineNumber: string;
  department: string;
  originalIssue: string;
  correctiveAction: string;
  actionTaken: string;
  responsibleEmployee: string;
  completionDate: string;
  remarks?: string;
  attachment?: string;
  status: 'IN_PROGRESS' | 'COMPLETED' | 'RESUBMITTED';
  createdAt: string;
  createdBy?: string;
  updatedAt?: string;
}

export interface QualityHandoverHistoryEntry {
  id: string;
  handoverId: string;
  timestamp: string;
  date: string;
  time: string;
  action: string;
  department: string;
  user: string;
  details: string;
  cycle?: number;
  status?: string;
}

export interface HandoverHistoryEntry {
  id: string;
  handoverId: string;
  machineNumber: string;
  fromDepartment: string;
  toDepartment: string;
  action: string;
  employee?: string;
  user?: string;
  status: string;
  remarks?: string;
  rejectionReason?: string;
  correctiveActionRequired?: string;
  date: string;
  time: string;
  timestamp: string;
}

export interface SystemNotification {
  id: string;
  recipientDepartment?: string;
  recipientRole?: string;
  recipientId?: string;
  recipientUserId?: string;
  fromDepartment?: string;
  toDepartment?: string;
  department?: string;
  title: string;
  message: string;
  type: string;
  handoverId?: string;
  machineId?: string;
  machineNumber?: string;
  machineModel?: string;
  process?: string;
  operation?: string;
  priority?: 'Low' | 'Medium' | 'High' | 'Critical' | string;
  status?: 'UNREAD' | 'READ';
  linkId?: string;
  linkType?: string;
  linkTo?: string;
  read: boolean;
  isRead?: boolean;
  createdAt: string;
  createdBy?: string;
  readAt?: string;
}

export interface AuditLogEntry {
  id: string;
  userId?: string;
  userEmail?: string;
  date: string;
  time: string;
  action: string;
  module: string;
  recordId?: string;
  oldValue?: string;
  newValue?: string;
  timestamp: string;
}

export type AuditLog = AuditLogEntry;


export interface ImportHistoryEntry {
  id: string;
  fileName: string;
  uploadedBy: string;
  uploadedByEmail?: string;
  uploadDateTime: string;
  totalRows: number;
  importedCount: number;
  duplicateCount: number;
  invalidCount: number;
  status: 'Completed' | 'Partial' | 'Failed';
  module: string;
  errorDetails?: string;
}

export type DocumentCategory =
  | 'Balloon Drawing'
  | 'Machine Drawing'
  | 'Inspection Drawing'
  | 'Quality Documents'
  | 'Inspection Reports'
  | 'Previous Reports'
  | 'Photos'
  | 'Other Documents';

export interface MachineDocument {
  id: string;
  machineNumber: string;
  category: DocumentCategory;
  title: string;
  fileName: string;
  fileSize?: number;
  fileData?: string; // base64 or stored ref
  version?: string;
  notes?: string;
  uploadedBy: string;
  uploadedAt: string;
}

// ==========================================
// ACCESSORIES ORDER MODULE TYPES
// ==========================================

export type OrderPriority = 'Normal' | 'High' | 'Urgent' | 'Critical';
export type OrderStatus =
  | 'Draft'
  | 'Released'
  | 'In Progress'
  | 'Partially Completed'
  | 'Completed'
  | 'Delayed'
  | 'Cancelled';

export type ComplianceStatus =
  | 'Pending'
  | 'In Progress'
  | 'Partially Completed'
  | 'Completed'
  | 'Delayed'
  | 'Not Applicable';

export interface AccessoriesOrder {
  id: string;
  orderNumber: string;
  orderType: 'ACCESSORIES';
  orderDate: string;
  requiredDate: string;
  cmmId?: string;
  cmmNumber: string;
  cmmModel: string;
  project: string;
  customer: string;
  priority: OrderPriority;
  status: OrderStatus;
  revision: number;
  remarks?: string;
  createdBy: string;
  createdAt: string;
  updatedBy: string;
  updatedAt: string;
  releasedAt?: string;
  releasedBy?: string;
  departmentStatuses?: Record<string, ComplianceStatus>;
  totalItemsCount?: number;
  completedItemsCount?: number;
}

export interface AccessoriesItem {
  id: string;
  orderId: string;
  orderNumber?: string;
  srNo: number | string;
  accessoryName: string;
  partNumber: string;
  specification: string;
  quantity: number;
  uom: string;
  requiredDate: string;
  priority: OrderPriority;
  remarks?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface AccessoriesCompliance {
  id: string;
  orderId: string;
  orderNumber?: string;
  itemId: string;
  itemName?: string;
  department: string;
  requiredQuantity: number;
  completedQuantity: number;
  pendingQuantity: number;
  status: ComplianceStatus;
  expectedDate?: string;
  remarks?: string;
  attachment?: string;
  updatedBy: string;
  updatedAt: string;
  // Department specific fields:
  // Purchase:
  poStatus?: string;
  poNumber?: string;
  poDate?: string;
  supplier?: string;
  expectedDelivery?: string;
  // Store:
  materialReceived?: string;
  receivedQuantity?: number;
  grnReceiptReference?: string;
  receiptDate?: string;
  // Electronics:
  accessoryAvailable?: string;
  accessoryPreparedProcessed?: string;
  electronicsStatus?: string;
  // Calibration:
  calibrationRequired?: string;
  calibrationCompleted?: string;
  calibrationCertificate?: string;
  calibrationDate?: string;
  // Packing:
  packingStatus?: string;
  packedQuantity?: number;
  packingDate?: string;
}

export interface AccessoriesOrderHistory {
  id: string;
  orderId: string;
  orderNumber: string;
  date: string;
  time: string;
  user: string;
  department: string;
  action: string;
  item?: string;
  oldStatus?: string;
  newStatus?: string;
  remarks?: string;
  attachment?: string;
  timestamp: string;
}

// ==========================================
// OPEN CABLE ORDER MODULE TYPES
// ==========================================

export interface OpenCableOrder {
  id: string;
  orderNumber: string;
  orderType: 'OPEN_CABLE';
  orderDate: string;
  requiredDate: string;
  cmmId?: string;
  cmmNumber: string;
  cmmModel: string;
  project: string;
  customer: string;
  priority: OrderPriority;
  status: OrderStatus;
  revision: number;
  remarks?: string;
  createdBy: string;
  createdAt: string;
  updatedBy: string;
  updatedAt: string;
  releasedAt?: string;
  releasedBy?: string;
  departmentStatuses?: Record<string, ComplianceStatus>;
  totalItemsCount?: number;
  completedItemsCount?: number;
}

export interface OpenCableItem {
  id: string;
  orderId: string;
  orderNumber?: string;
  srNo: number | string;
  cableName: string;
  partNumber: string;
  specification: string;
  cableType: string;
  length: string | number;
  quantity: number;
  uom: string;
  requiredDate: string;
  priority: OrderPriority;
  remarks?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface OpenCableCompliance {
  id: string;
  orderId: string;
  orderNumber?: string;
  itemId: string;
  itemName?: string;
  department: string;
  requiredQuantity: number;
  completedQuantity: number;
  pendingQuantity: number;
  status: ComplianceStatus;
  expectedDate?: string;
  remarks?: string;
  attachment?: string;
  updatedBy: string;
  updatedAt: string;
  // Department specific fields:
  // Purchase:
  poStatus?: string;
  poNumber?: string;
  supplier?: string;
  poDate?: string;
  expectedDelivery?: string;
  // Store:
  materialReceived?: string;
  receivedQuantity?: number;
  grnReceiptReference?: string;
  receivedDate?: string;
  receiptDate?: string;
  // Electronics:
  cablePreparationStatus?: string;
  preparedQuantity?: number;
  testingProcessingStatus?: string;
  cableTestingStatus?: string;
  // Calibration:
  calibrationVerificationStatus?: string;
  calibrationRequired?: string;
  calibrationCompleted?: string;
  calibrationCertificate?: string;
  calibrationDate?: string;
  completedDate?: string;
  certificateReference?: string;
  // Packing:
  packingStatus?: string;
  packedQuantity?: number;
  packingDate?: string;
}

export interface OpenCableOrderHistory {
  id: string;
  orderId: string;
  orderNumber: string;
  date: string;
  time: string;
  user: string;
  department: string;
  action: string;
  item?: string;
  oldStatus?: string;
  newStatus?: string;
  remarks?: string;
  attachment?: string;
  timestamp: string;
}

// ==========================================
// DESIGN WORK MANAGEMENT TYPES
// ==========================================

export type DesignWorkType =
  | 'New Design'
  | 'Drawing Modification'
  | 'Drawing Preparation'
  | '3D Model'
  | '2D Drawing'
  | 'Design Review'
  | 'Engineering Change'
  | 'Customer Requirement'
  | 'Internal Improvement'
  | 'Other';

export type DesignWorkPriority = 'Low' | 'Medium' | 'High' | 'Critical';

export type DesignWorkStatus =
  | 'CREATE'
  | 'ASSIGNED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'DELAYED';

export interface DesignOperationItem {
  id: string;
  name: string;
  completed: boolean;
  completedAt?: string;
  completedBy?: string;
  order: number;
}

export interface DesignDocumentItem {
  id: string;
  name: string;
  version: string; // e.g. 'Rev 00', 'Rev 01', 'Rev 02'
  fileUrl?: string;
  fileName?: string;
  docType: '2D Drawing' | '3D Model' | 'PDF' | 'Calculation' | 'BOM' | 'Specification' | 'Customer Drawing' | 'Design Review' | 'Other';
  uploadedAt: string;
  uploadedBy: string;
  notes?: string;
}

export interface DesignWork {
  id: string;
  department: string; // '01-A Design-A Regular' or '01-B Design-A Engineering'
  title: string;
  description: string;
  machineNumber?: string;
  project?: string;
  specification?: string;
  workType: DesignWorkType;
  priority: DesignWorkPriority;
  startDate: string;
  targetDate: string;
  actualCompletionDate?: string;
  assignedDesigner: string;
  assignedDesignerEmail?: string;
  status: DesignWorkStatus;
  operations: DesignOperationItem[];
  completedOperationsCount: number;
  totalOperationsCount: number;
  progressPercent: number; // Auto-calculated (completed / total) * 100
  remarks?: string;
  delayReason?: string;
  delayDays?: number;
  documents?: DesignDocumentItem[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  sourceType?: 'SELF' | 'DEPARTMENT_REQUEST';
  requestId?: string;
}

export interface DesignOperationMaster {
  id: string;
  name: string;
  description?: string;
  department?: string;
  isActive: boolean;
  order: number;
  createdAt: string;
  updatedAt?: string;
}

export type DesignRequestStatus =
  | 'New'
  | 'Accepted'
  | 'In Progress'
  | 'Waiting for Information'
  | 'Completed'
  | 'Rejected'
  | 'Closed';

export interface DesignRequestHistoryItem {
  timestamp: string;
  action: string;
  user: string;
  department: string;
  notes?: string;
}

export interface DesignRequest {
  id: string;
  requestNumber: string; // e.g. 'DR-2026-001'
  requestTitle: string;
  requestDescription: string;
  requestingDepartment: string;
  requestedBy: string;
  requestedByEmail?: string;
  targetDesignDepartment?: string;
  machineNumber?: string;
  specification?: string;
  requiredDrawingDoc?: string;
  priority: 'Low' | 'Medium' | 'High' | 'Urgent';
  requiredByDate: string;
  attachmentName?: string;
  attachmentUrl?: string;
  status: DesignRequestStatus;
  assignedDesigner?: string;
  assignedDesignerEmail?: string;
  // Info Request loop
  infoRequiredNote?: string;
  infoRequiredReason?: string;
  infoProvidedResponse?: string;
  // Completion
  completionRemarks?: string;
  solutionProvided?: string;
  completedDate?: string;
  completedBy?: string;
  responseDocumentName?: string;
  responseDocumentUrl?: string;
  responseDocumentType?: string;
  // History & Audit
  history?: DesignRequestHistoryItem[];
  createdAt: string;
  updatedAt: string;
}

export interface DesignDailyUpdate {
  id: string;
  date: string; // YYYY-MM-DD
  department: string; // '01-A Design-A Regular' or '01-B Design-A Engineering'
  totalWorkPlannedToday: number;
  totalWorkCompletedToday: number;
  workInProgress: number;
  pendingWork: number;
  delayedWork: number;
  designRequestsReceived: number;
  designRequestsCompleted: number;
  operationsCompletedToday: number;
  totalOperationsCompleted: number;
  overallActiveWorkProgress: number;
  majorIssues: string;
  reasonForPendingWork: string;
  tomorrowPlannedWork: string;
  remarks: string;
  submittedBy: string;
  submittedByEmail?: string;
  submittedAt: string;
}

// ============================================================================
// MACHINE-SIZE-WISE OPERATION MASTER & DAILY OPERATION PROGRESS DATA MODELS
// ============================================================================

export interface DepartmentMachineSize {
  id?: string;
  departmentId: string; // Department scope (e.g. '07A_LAPPING_FLATNESS_INSERT', '06A_METAL_SHOP')
  machineSizeId: string; // Unique within department, e.g. '685', '8106'
  machineSize: string; // Display machine size / model, e.g. '685'
  description?: string;
  active: boolean;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DepartmentPart {
  id?: string;
  departmentId: string;
  machineSizeId: string;
  partId: string; // Unique part code or ID under machineSize, e.g. 'BASE-685'
  partName: string; // e.g. 'Base', 'Table', 'Guide', 'Insert'
  partCode: string; // e.g. 'BASE-685'
  sequence: number;
  description?: string;
  active: boolean;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DepartmentOperation {
  id?: string;
  departmentId: string;
  machineSizeId: string;
  partId: string;
  operationId: string; // Unique operation ID under part, e.g. 'OP-01'
  operationName: string; // e.g. 'Surface Lapping', 'Flatness Check', 'Milling'
  operationCode: string; // e.g. 'OP-01', 'LAP-01'
  sequence: number;
  description?: string;
  standardTime?: string; // e.g. '120 mins'
  targetQuantity?: number;
  unit?: string; // e.g. 'Pcs', 'Sets', 'Hours'
  weight?: number; // Default 1 for weighted calculation (Section 14)
  active: boolean;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

export type OperationExecutionStatus = 'NOT STARTED' | 'IN PROGRESS' | 'COMPLETED' | 'HOLD';

export interface MachineOperationExecution {
  id?: string;
  machineId?: string;
  machineNumber: string;
  machineSize: string;
  departmentId: string;
  partId: string;
  partName?: string;
  operationId: string;
  operationName?: string;
  status: OperationExecutionStatus;
  completed: boolean;
  completedBy?: string;
  completedAt?: string;
  holdReason?: string;
  remarks?: string;
  weight?: number;
  lastUpdatedAt: string;
}

export interface DailyOperationUpdate {
  id?: string;
  updateId: string; // e.g. 'DOU-20260929-XXXX'
  machineId?: string;
  machineNumber: string;
  machineSize: string;
  departmentId: string;
  employeeId?: string;
  employeeName: string;
  date: string; // YYYY-MM-DD
  totalOperations: number;
  completedOperations: number;
  completionPercentage: number; // 0-100 automatically calculated
  startTime?: string;
  endTime?: string;
  remarks?: string;
  createdAt: string;
}

export interface DailyOperationResult {
  id?: string;
  updateId: string;
  machineId?: string;
  machineNumber?: string;
  machineSize?: string;
  departmentId: string;
  operationId: string;
  operationName?: string;
  partId: string;
  partName?: string;
  status: OperationExecutionStatus;
  completed: boolean;
  remarks?: string;
  holdReason?: string;
  startTime?: string;
  completionTime?: string;
  employeeId?: string;
  employeeName?: string;
  date: string; // YYYY-MM-DD
  createdAt: string;
}

// ============================================================================
// 7. OPERATION LOT MANAGEMENT DATA MODELS
// ============================================================================

export type OperationLotStatus = 'ACTIVE' | 'COMPLETED' | 'ON_HOLD' | 'CANCELLED';

export interface OperationLot {
  id: string; // Document ID
  lotNumber: string; // Unique lot identifier, e.g. LOT-METAL-20261008-001
  departmentId: string; // Canonical department identifier
  departmentName: string; // Display department name
  operationId: string;
  operationName: string;
  operationCode?: string;
  machineSize: string; // Derived machine size, e.g. '685'
  machineSizeId: string;
  partId: string;
  partName: string;
  assignedEmployee: string;
  assignedEmployeeId?: string;
  lotDate: string; // YYYY-MM-DD
  plannedDate?: string; // YYYY-MM-DD
  remarks?: string;
  status: OperationLotStatus;
  totalMachines: number;
  completedMachines: number;
  inProgressMachines: number;
  pendingMachines: number;
  delayedMachines: number;
  overallCompliance: number; // 0 - 100%
  selectedMachineNumbers: string[];
  createdBy: string;
  createdByName?: string;
  createdAt: string;
  updatedAt: string;
  lastUpdateDate?: string;
}

export interface OperationLotMachine {
  id: string; // Document ID
  lotId: string;
  lotNumber: string;
  machineId?: string;
  machineNumber: string;
  machineSize: string;
  project?: string;
  customer?: string;
  departmentId: string;
  departmentName: string;
  operationId: string;
  operationName: string;
  partId: string;
  partName: string;
  status: 'NOT STARTED' | 'IN PROGRESS' | 'COMPLETED' | 'HOLD' | 'DELAYED';
  completed: boolean;
  progress: number; // 0 - 100%
  completedBy?: string;
  completedAt?: string;
  plannedDate?: string;
  delayReason?: string;
  holdReason?: string;
  remarks?: string;
  previousCompliance?: number;
  compliancePercentage: number; // 0 - 100%
  updatedAt: string;
  createdAt: string;
}

export interface DailyLotComplianceReport {
  id: string;
  reportNumber: string; // e.g. DLR-20261008-001
  departmentId: string;
  departmentName: string;
  date: string; // YYYY-MM-DD
  lotId?: string;
  lotNumber?: string;
  operationName?: string;
  machinesUpdated: number;
  machinesCompletedToday: number;
  machinesInProgress: number;
  pendingAndDelayedMachines: number;
  machineWiseDetails: Array<{
    machineNumber: string;
    model: string;
    status: string;
    progress: number;
    completedOps: number;
    totalOps: number;
    compliancePercentage: number;
    delayReason?: string;
    remarks?: string;
  }>;
  overallDepartmentCompliance: number;
  remarks?: string;
  exceptions?: string;
  submittedBy: string;
  submittedByEmail?: string;
  submittedAt: string;
  status: 'SUBMITTED' | 'REVIEWED';
  reviewedBy?: string;
  reviewedAt?: string;
}

// ============================================================================
// 8. MACHINE-SIZE-WISE DAILY OPERATION UPDATE DATA MODELS
// ============================================================================

export interface MachineSizeDailyUpdateRecord {
  id?: string;
  updateId: string; // e.g. 'MSU-20261009-XXXX'
  departmentName: string;
  departmentId: string;
  date: string; // YYYY-MM-DD
  machineSize: string;
  machineSizeId?: string;
  partId?: string;
  partName?: string;
  operationId: string;
  operationName: string;
  operationCode?: string;
  employeeName: string;
  employeeEmail?: string;
  totalEligible: number;
  totalSelected: number;
  completedTodayCount: number;
  inProgressCount: number;
  onHoldCount: number;
  delayedCount: number;
  notSelectedCount: number;
  selectedMachineNumbers: string[];
  completedMachineNumbers: string[];
  operationResult: 'Completed' | 'In Progress' | 'On Hold' | 'Delayed';
  actualQuantity?: number;
  remarks?: string;
  attachmentUrl?: string;
  machineWiseOutcomes: Array<{
    machineNumber: string;
    model: string;
    project?: string;
    customer?: string;
    outcome: 'Completed' | 'In Progress' | 'On Hold' | 'Delayed';
    progress: number;
    delayReason?: string;
    remarks?: string;
    departmentComplianceAfter: number;
  }>;
  createdAt: string;
}

export interface MachineComplianceSummary {
  machineNumber: string;
  machineId?: string;
  model: string;
  machineSize: string;
  project?: string;
  customer?: string;
  currentDepartment: string;
  completedOpsCount: number;
  totalApplicableOpsCount: number;
  remainingOpsCount: number;
  departmentCompliance: number; // 0 - 100%
  currentOperationStatus: string;
  currentOperationName?: string;
  lastUpdateDate?: string;
  lastUpdatedBy?: string;
}

export type BacklogStatus = 'Open' | 'In Progress' | 'Partially Completed' | 'Completed' | 'Blocked';

export interface BacklogItem {
  id: string;
  backlogId: string;
  month: string;
  year: string | number;
  department: string;
  machineNumber: string;
  machineSize: string;
  project?: string;
  customer?: string;
  part?: string;
  remainingOperation: string;
  originalQuantity: number;
  completedQuantity: number;
  remainingQuantity: number;
  dueDate?: string;
  priority: 'Low' | 'Medium' | 'High' | 'Critical' | string;
  status: BacklogStatus;
  remarks?: string;
  batchId?: string;
  sourceFileName?: string;
  linkedMonthlyPlanId?: string;
  createdAt: string;
  updatedAt: string;
  lastUpdated?: string;
  createdBy?: string;
  updatedBy?: string;
}
