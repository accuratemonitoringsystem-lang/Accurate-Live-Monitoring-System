import React, { useState, useMemo, useEffect } from 'react';
import {
  CheckSquare,
  Plus,
  Search,
  Filter,
  AlertTriangle,
  CheckCircle2,
  Clock,
  RotateCcw,
  X,
  FileSpreadsheet,
  Layers,
  Sparkles,
  ShieldCheck,
  Eye,
  Edit2,
  Power,
  AlertCircle,
  Calendar,
  Building,
  Check,
  HelpCircle,
  PauseCircle,
} from 'lucide-react';
import {
  Department,
  Machine,
  QualityCategory,
  QualityDailyCheck,
  QualityInspectionStatus,
  QualityOperation,
  QualityOperationStatus,
  QualityRejection,
  RejectionReason,
} from '../types';
import {
  addQualityOperation,
  updateQualityOperation,
  deleteOrDeactivateQualityOperation,
  activateQualityOperation,
  saveQualityDailyCheck,
  createQualityRejection,
  submitCorrectiveAction,
  recordReinspectionResult,
} from '../services/db';
import { exportToExcel } from '../utils/excel';
import { REJECTION_REASONS, INITIAL_DEPARTMENTS } from '../constants';
import { isDepartmentMatch, hasQualityInspectionAccess } from '../utils/departmentUtils';
import { useAuth } from '../context/AuthContext';
import { QualityHandoverModule } from '../components/QualityHandoverModule';
import { QualityInspectionDecisionModal } from '../components/QualityInspectionDecisionModal';

interface QualityViewProps {
  departments?: Department[];
  machines: Machine[];
  operations: QualityOperation[];
  dailyChecks: QualityDailyCheck[];
  rejections: QualityRejection[];
  initialTab?: 'checklist' | 'decisions' | 'operations' | 'rejections' | 'history' | 'handovers';
  onOpenExcelImport: () => void;
}

export const QualityView: React.FC<QualityViewProps> = ({
  departments,
  machines,
  operations,
  dailyChecks,
  rejections,
  initialTab = 'checklist',
  onOpenExcelImport,
}) => {
  const { userProfile } = useAuth();
  const isAdmin = userProfile?.role === 'ADMIN';
  const isQualityUser = hasQualityInspectionAccess(userProfile);
  const effectiveDepartments: Department[] =
    departments ||
    INITIAL_DEPARTMENTS.map((d) => ({
      id: d.code,
      code: d.code,
      name: d.name,
      order: d.order,
      active: true,
    }));
  const [activeTab, setActiveTab] = useState<
    'checklist' | 'decisions' | 'operations' | 'rejections' | 'history' | 'handovers'
  >(initialTab);

  // Sync initialTab when props change
  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  // Notifications / Toast feedback
  const [toastMessage, setToastMessage] = useState<{
    type: 'success' | 'error' | 'warning';
    text: string;
  } | null>(null);

  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => setToastMessage(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [toastMessage]);

  // ==========================================
  // TAB: MACHINE INSPECTION DECISIONS STATE
  // ==========================================
  const [decisionSearchQuery, setDecisionSearchQuery] = useState('');
  const [decisionStatusFilter, setDecisionStatusFilter] = useState<'All' | 'Accepted' | 'Rework' | 'Rejected' | 'Pending'>('All');
  const [decisionDeptFilter, setDecisionDeptFilter] = useState('All');

  // Filtered machines for plant-wide decision console
  const filteredDecisionMachines = useMemo(() => {
    return machines.filter((m) => {
      if (decisionDeptFilter !== 'All' && m.currentDepartment !== decisionDeptFilter) {
        return false;
      }
      const qStatus = (m.qualityStatus || '').toLowerCase();
      if (decisionStatusFilter === 'Accepted' && !(qStatus.includes('accept') || qStatus.includes('pass'))) {
        return false;
      }
      if (
        decisionStatusFilter === 'Rework' &&
        !(
          qStatus.includes('hold') ||
          qStatus.includes('rework') ||
          m.status === 'Quality Hold' ||
          (m.status as string) === 'QUALITY_HOLD' ||
          (m.status as string) === 'REWORK_REQUIRED'
        )
      ) {
        return false;
      }
      if (decisionStatusFilter === 'Rejected' && !(qStatus.includes('reject') || m.status === 'QUALITY_REJECTED')) {
        return false;
      }
      if (
        decisionStatusFilter === 'Pending' &&
        (qStatus.includes('accept') ||
          qStatus.includes('pass') ||
          qStatus.includes('hold') ||
          qStatus.includes('rework') ||
          qStatus.includes('reject'))
      ) {
        return false;
      }
      if (decisionSearchQuery.trim()) {
        const q = decisionSearchQuery.toLowerCase();
        const match =
          m.machineNumber.toLowerCase().includes(q) ||
          (m.model || '').toLowerCase().includes(q) ||
          (m.customer || '').toLowerCase().includes(q) ||
          (m.project || '').toLowerCase().includes(q) ||
          (m.currentDepartment || '').toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [machines, decisionDeptFilter, decisionStatusFilter, decisionSearchQuery]);

  // Plant-wide Decision Statistics
  const decisionStats = useMemo(() => {
    let accepted = 0;
    let rework = 0;
    let rejected = 0;
    let pending = 0;

    machines.forEach((m) => {
      const q = (m.qualityStatus || '').toLowerCase();
      if (q.includes('accept') || q.includes('pass')) {
        accepted++;
      } else if (
        q.includes('hold') ||
        q.includes('rework') ||
        m.status === 'Quality Hold' ||
        (m.status as string) === 'QUALITY_HOLD' ||
        (m.status as string) === 'REWORK_REQUIRED'
      ) {
        rework++;
      } else if (q.includes('reject') || m.status === 'QUALITY_REJECTED') {
        rejected++;
      } else {
        pending++;
      }
    });

    return { total: machines.length, accepted, rework, rejected, pending };
  }, [machines]);

  // ==========================================
  // TAB 1: DAILY QUALITY CHECKLIST STATE
  // ==========================================
  const [inspectionDate, setInspectionDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [selectedMachineNo, setSelectedMachineNo] = useState<string>(
    machines[0]?.machineNumber || ''
  );
  const [activeCategoryTab, setActiveCategoryTab] = useState<QualityCategory | 'All'>('All');
  const [checklistSearch, setChecklistSearch] = useState('');
  const [showRemainingModal, setShowRemainingModal] = useState(false);
  const [checkRemarks, setCheckRemarks] = useState<Record<string, string>>({});
  const [savingCheckId, setSavingCheckId] = useState<string | null>(null);

  // States for Machine-Level Quality Inspection Decision Modal (Hold, Reject, Accept, Rework)
  const [selectedMachineForQCModal, setSelectedMachineForQCModal] = useState<Machine | null>(null);
  const [qcModalInitialAction, setQcModalInitialAction] = useState<'Accept' | 'Reject' | 'Rework' | 'Hold'>('Accept');

  // Active selected machine details
  const activeMachine = machines.find((m) => m.machineNumber === selectedMachineNo);
  const activeMachineModel = activeMachine?.model || '';

  // All active operations for this machine's model
  const modelOperations = useMemo(() => {
    if (!activeMachineModel) return [];
    return operations.filter(
      (o) =>
        (o.status === 'Active' || (o.status === undefined && o.active !== false)) &&
        o.machineModel.trim().toLowerCase() === activeMachineModel.trim().toLowerCase()
    );
  }, [operations, activeMachineModel]);

  // Filtered by category tab and checklist search
  const displayedChecklistOps = useMemo(() => {
    return modelOperations.filter((op) => {
      if (activeCategoryTab !== 'All' && op.category !== activeCategoryTab) {
        return false;
      }
      if (checklistSearch.trim()) {
        const q = checklistSearch.toLowerCase();
        const match =
          op.operationName.toLowerCase().includes(q) ||
          (op.partCode || '').toLowerCase().includes(q) ||
          (op.processDepartment || '').toLowerCase().includes(q) ||
          (op.specification || '').toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [modelOperations, activeCategoryTab, checklistSearch]);

  // Machine-specific daily checks map: operationId -> QualityDailyCheck
  const checkMap: Record<string, QualityDailyCheck> = useMemo(() => {
    const map: Record<string, QualityDailyCheck> = {};
    dailyChecks
      .filter((c) => c.machineNumber === selectedMachineNo)
      .forEach((c) => {
        map[c.operationId] = c;
      });
    return map;
  }, [dailyChecks, selectedMachineNo]);

  // Calculate remaining incomplete operations for this machine
  const completedOps = modelOperations.filter((op) => checkMap[op.id]?.status === 'Accept');
  const remainingOps = modelOperations.filter((op) => checkMap[op.id]?.status !== 'Accept');

  // Handle ticking check status (Accept, Reject, Hold)
  const handleCheckStatus = async (
    op: QualityOperation,
    status: QualityInspectionStatus
  ) => {
    if (!isQualityUser) {
      setToastMessage({
        type: 'error',
        text: 'ACCESS DENIED: Quality inspections can ONLY be performed by the Quality department or Admin.',
      });
      return;
    }

    if (!selectedMachineNo || !activeMachine) return;

    if (status === 'Reject') {
      setRejectionTargetOp(op);
      setRejSpec(op.specification || op.specificationRequirement || '');
      setRejFinding('');
      setRejRemarks('');
      setShowRejectionModal(true);
      return;
    }

    setSavingCheckId(op.id);
    try {
      const now = new Date();
      const userRemarks = checkRemarks[op.id]?.trim();
      const defaultRemarks = `Checked by ${userProfile?.displayName || userProfile?.email || 'Quality Inspector'}`;
      await saveQualityDailyCheck(
        {
          machineId: activeMachine.id,
          machineNumber: selectedMachineNo,
          machineModel: activeMachineModel,
          operationId: op.id,
          operationName: op.operationName,
          category: op.category,
          date: inspectionDate,
          userId: userProfile?.id || userProfile?.userId || 'user',
          userEmail: userProfile?.email || 'quality@accurate.in',
          time: now.toLocaleTimeString(),
          status,
          qualityResult: status,
          remarks: userRemarks || defaultRemarks,
        },
        userProfile?.email
      );
      setToastMessage({
        type: 'success',
        text: `Machine ${selectedMachineNo}: "${op.operationName}" saved as ${status}`,
      });
    } catch (err: any) {
      console.error('Error saving quality check:', err);
      setToastMessage({
        type: 'error',
        text: 'Failed to record quality inspection check. Please try again.',
      });
    } finally {
      setSavingCheckId(null);
    }
  };

  // ==========================================
  // TAB 2: OPERATION MASTER STATE
  // ==========================================
  const [opSearchQuery, setOpSearchQuery] = useState('');
  const [opFilterModel, setOpFilterModel] = useState<string>('All');
  const [opFilterCategory, setOpFilterCategory] = useState<string>('All');
  const [opFilterStatus, setOpFilterStatus] = useState<string>('All');

  // Available models derived from machines and operations
  const availableModels = useMemo(() => {
    const set = new Set<string>();
    machines.forEach((m) => {
      if (m.model) set.add(m.model.trim());
    });
    operations.forEach((o) => {
      if (o.machineModel) set.add(o.machineModel.trim());
    });
    return Array.from(set).sort();
  }, [machines, operations]);

  // Filtered operation list
  const filteredOperations = useMemo(() => {
    return operations.filter((op) => {
      if (opFilterModel !== 'All' && op.machineModel.toLowerCase() !== opFilterModel.toLowerCase()) {
        return false;
      }
      if (opFilterCategory !== 'All' && op.category !== opFilterCategory) {
        return false;
      }
      if (opFilterStatus !== 'All') {
        const isOpActive = op.status === 'Active' || (op.status === undefined && op.active !== false);
        if (opFilterStatus === 'Active' && !isOpActive) return false;
        if (opFilterStatus === 'Inactive' && isOpActive) return false;
      }
      if (opSearchQuery.trim()) {
        const q = opSearchQuery.toLowerCase();
        const match =
          op.operationName.toLowerCase().includes(q) ||
          op.machineModel.toLowerCase().includes(q) ||
          (op.partCode || '').toLowerCase().includes(q) ||
          (op.srNo || '').toLowerCase().includes(q) ||
          (op.processDepartment || '').toLowerCase().includes(q) ||
          (op.description || '').toLowerCase().includes(q) ||
          (op.specification || '').toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [operations, opFilterModel, opFilterCategory, opFilterStatus, opSearchQuery]);

  // Operation Master Counts
  const totalOpsCount = operations.length;
  const activeOpsCount = operations.filter(
    (o) => o.status === 'Active' || (o.status === undefined && o.active !== false)
  ).length;
  const inactiveOpsCount = totalOpsCount - activeOpsCount;

  // ==========================================
  // ADD OPERATION MODAL STATE & FORM
  // ==========================================
  const [showAddOpModal, setShowAddOpModal] = useState(false);
  const [addOpModel, setAddOpModel] = useState('');
  const [addOpCategory, setAddOpCategory] = useState<QualityCategory>('Manufacturing');
  const [addOpName, setAddOpName] = useState('');
  const [addOpPartCode, setAddOpPartCode] = useState('');
  const [addOpSrNo, setAddOpSrNo] = useState('');
  const [addOpType, setAddOpType] = useState('Dimensional');
  const [addOpDept, setAddOpDept] = useState('04 Inward Quality');
  const [addOpPlannedTime, setAddOpPlannedTime] = useState('15 mins');
  const [addOpDescription, setAddOpDescription] = useState('');
  const [addOpSpec, setAddOpSpec] = useState('');
  const [addOpStatus, setAddOpStatus] = useState<QualityOperationStatus>('Active');

  const [addFormErrors, setAddFormErrors] = useState<Record<string, string>>({});
  const [savingAddOp, setSavingAddOp] = useState(false);
  const [addDuplicateWarning, setAddDuplicateWarning] = useState<string | null>(null);
  const [addServerErrorMessage, setAddServerErrorMessage] = useState<string | null>(null);
  const [addSuccessMessage, setAddSuccessMessage] = useState<string | null>(null);

  const resetAddForm = () => {
    setAddOpModel(activeMachineModel || (availableModels[0] || ''));
    setAddOpCategory('Manufacturing');
    setAddOpName('');
    setAddOpPartCode('');
    setAddOpSrNo('');
    setAddOpType('Dimensional');
    setAddOpDept('04 Inward Quality');
    setAddOpPlannedTime('15 mins');
    setAddOpDescription('');
    setAddOpSpec('');
    setAddOpStatus('Active');
    setAddFormErrors({});
    setAddDuplicateWarning(null);
    setAddServerErrorMessage(null);
    setAddSuccessMessage(null);
  };

  const handleOpenAddOpModal = () => {
    resetAddForm();
    setShowAddOpModal(true);
  };

  // Validate form fields
  const validateAddForm = () => {
    const errors: Record<string, string> = {};
    if (!addOpModel.trim()) {
      errors.machineModel = 'Machine Model / Size is required.';
    }
    if (!addOpCategory) {
      errors.category = 'Category is required.';
    }
    if (!addOpName.trim()) {
      errors.operationName = 'Operation Name is required.';
    }
    if (!addOpDept.trim()) {
      errors.processDepartment = 'Process Department is required.';
    }
    if (!addOpStatus) {
      errors.status = 'Status is required.';
    }
    setAddFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Save operation handler with duplicate protection
  const handleSaveOperation = async (saveAndAddAnother = false, forceDuplicate = false) => {
    setAddServerErrorMessage(null);
    setAddSuccessMessage(null);

    // 1. Validate form
    if (!validateAddForm()) {
      return;
    }

    // 2. Duplicate Check
    if (!forceDuplicate) {
      const duplicateExists = operations.some((o) => {
        const sameModel = o.machineModel.trim().toLowerCase() === addOpModel.trim().toLowerCase();
        const sameName = o.operationName.trim().toLowerCase() === addOpName.trim().toLowerCase();
        const sameCategory = o.category.toLowerCase() === addOpCategory.toLowerCase();
        const samePart =
          (o.partCode || '').trim().toLowerCase() === (addOpPartCode || '').trim().toLowerCase();
        return sameModel && sameName && sameCategory && samePart;
      });

      if (duplicateExists) {
        setAddDuplicateWarning(
          `This operation already exists for Machine Model "${addOpModel}". Check operation name and category.`
        );
        return;
      }
    }

    setAddDuplicateWarning(null);
    setSavingAddOp(true);

    try {
      const newOpId = await addQualityOperation(
        {
          machineModel: addOpModel.trim(),
          category: addOpCategory,
          operationName: addOpName.trim(),
          partCode: addOpPartCode.trim() || undefined,
          srNo: addOpSrNo.trim() || undefined,
          type: addOpType.trim() || 'Dimensional',
          processDepartment: addOpDept.trim(),
          plannedInspectionTime: addOpPlannedTime.trim() || undefined,
          description: addOpDescription.trim() || undefined,
          specification: addOpSpec.trim() || undefined,
          specificationRequirement: addOpSpec.trim() || undefined,
          status: addOpStatus,
          active: addOpStatus === 'Active',
          createdBy: userProfile?.displayName || userProfile?.email || 'System User',
        },
        userProfile?.email
      );

      if (saveAndAddAnother) {
        // Clear operation specific fields, keep model and department for rapid entry
        setAddOpName('');
        setAddOpPartCode('');
        setAddOpSrNo('');
        setAddOpDescription('');
        setAddOpSpec('');
        setAddFormErrors({});
        setAddSuccessMessage(
          `Operation "${addOpName.trim()}" added successfully! Enter next operation details.`
        );
        setToastMessage({
          type: 'success',
          text: `Operation "${addOpName.trim()}" saved to Model ${addOpModel.trim()}.`,
        });
      } else {
        setShowAddOpModal(false);
        resetAddForm();
        setToastMessage({
          type: 'success',
          text: `Operation "${addOpName.trim()}" added successfully!`,
        });
      }
    } catch (err: any) {
      console.error('Failed to create quality operation:', err);
      const errMsg =
        err?.message || 'Unable to save operation. Please check database permissions or connection.';
      setAddServerErrorMessage(errMsg);
    } finally {
      setSavingAddOp(false);
    }
  };

  // ==========================================
  // VIEW OPERATION MODAL STATE
  // ==========================================
  const [viewingOp, setViewingOp] = useState<QualityOperation | null>(null);

  // ==========================================
  // EDIT OPERATION MODAL STATE & FORM
  // ==========================================
  const [editingOp, setEditingOp] = useState<QualityOperation | null>(null);
  const [editOpModel, setEditOpModel] = useState('');
  const [editOpCategory, setEditOpCategory] = useState<QualityCategory>('Manufacturing');
  const [editOpName, setEditOpName] = useState('');
  const [editOpPartCode, setEditOpPartCode] = useState('');
  const [editOpSrNo, setEditOpSrNo] = useState('');
  const [editOpType, setEditOpType] = useState('Dimensional');
  const [editOpDept, setEditOpDept] = useState('');
  const [editOpPlannedTime, setEditOpPlannedTime] = useState('');
  const [editOpDescription, setEditOpDescription] = useState('');
  const [editOpSpec, setEditOpSpec] = useState('');
  const [editOpStatus, setEditOpStatus] = useState<QualityOperationStatus>('Active');

  const [editFormErrors, setEditFormErrors] = useState<Record<string, string>>({});
  const [savingEditOp, setSavingEditOp] = useState(false);
  const [editServerErrorMessage, setEditServerErrorMessage] = useState<string | null>(null);

  const handleOpenEditModal = (op: QualityOperation) => {
    setEditingOp(op);
    setEditOpModel(op.machineModel || '');
    setEditOpCategory(op.category || 'Manufacturing');
    setEditOpName(op.operationName || '');
    setEditOpPartCode(op.partCode || '');
    setEditOpSrNo(op.srNo || '');
    setEditOpType(op.type || 'Dimensional');
    setEditOpDept(op.processDepartment || '04 Inward Quality');
    setEditOpPlannedTime(op.plannedInspectionTime || '');
    setEditOpDescription(op.description || '');
    setEditOpSpec(op.specification || op.specificationRequirement || '');
    setEditOpStatus(op.status || (op.active ? 'Active' : 'Inactive'));
    setEditFormErrors({});
    setEditServerErrorMessage(null);
  };

  const handleSaveEditOperation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingOp) return;

    // Validate
    const errors: Record<string, string> = {};
    if (!editOpModel.trim()) errors.machineModel = 'Machine Model / Size is required.';
    if (!editOpCategory) errors.category = 'Category is required.';
    if (!editOpName.trim()) errors.operationName = 'Operation Name is required.';
    if (!editOpDept.trim()) errors.processDepartment = 'Process Department is required.';
    if (!editOpStatus) errors.status = 'Status is required.';

    setEditFormErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSavingEditOp(true);
    setEditServerErrorMessage(null);

    try {
      const updates: Partial<QualityOperation> = {
        machineModel: editOpModel.trim(),
        category: editOpCategory,
        operationName: editOpName.trim(),
        partCode: editOpPartCode.trim() || undefined,
        srNo: editOpSrNo.trim() || undefined,
        type: editOpType.trim() || 'Dimensional',
        processDepartment: editOpDept.trim(),
        plannedInspectionTime: editOpPlannedTime.trim() || undefined,
        description: editOpDescription.trim() || undefined,
        specification: editOpSpec.trim() || undefined,
        specificationRequirement: editOpSpec.trim() || undefined,
        status: editOpStatus,
        active: editOpStatus === 'Active',
      };

      await updateQualityOperation(editingOp.id, updates, userProfile?.email);

      setEditingOp(null);
      setToastMessage({
        type: 'success',
        text: 'Operation updated successfully.',
      });
    } catch (err: any) {
      console.error('Failed to update quality operation:', err);
      setEditServerErrorMessage(
        err?.message || 'Unable to update operation. Please check database permissions or connection.'
      );
    } finally {
      setSavingEditOp(false);
    }
  };

  // ==========================================
  // DEACTIVATE / ACTIVATE CONFIRMATION MODAL
  // ==========================================
  const [confirmOpTarget, setConfirmOpTarget] = useState<QualityOperation | null>(null);
  const [confirmActionType, setConfirmActionType] = useState<'deactivate' | 'activate'>('deactivate');
  const [processingConfirm, setProcessingConfirm] = useState(false);

  const handleConfirmAction = async () => {
    if (!confirmOpTarget) return;
    setProcessingConfirm(true);
    try {
      if (confirmActionType === 'deactivate') {
        const res = await deleteOrDeactivateQualityOperation(
          confirmOpTarget.id,
          confirmOpTarget.operationName,
          confirmOpTarget.machineModel,
          userProfile?.email
        );
        setToastMessage({
          type: 'success',
          text: res.message || `Operation "${confirmOpTarget.operationName}" deactivated successfully.`,
        });
      } else {
        const res = await activateQualityOperation(
          confirmOpTarget.id,
          confirmOpTarget.operationName,
          userProfile?.email
        );
        setToastMessage({
          type: 'success',
          text: res.message || `Operation "${confirmOpTarget.operationName}" activated successfully.`,
        });
      }
      setConfirmOpTarget(null);
    } catch (err: any) {
      console.error('Action failed on operation:', err);
      setToastMessage({
        type: 'error',
        text: `Failed to ${confirmActionType} operation. Please check permissions.`,
      });
    } finally {
      setProcessingConfirm(false);
    }
  };

  // ==========================================
  // TAB 3: REJECTIONS & CORRECTIVE WORKFLOW
  // ==========================================
  const [showRejectionModal, setShowRejectionModal] = useState(false);
  const [rejectionTargetOp, setRejectionTargetOp] = useState<QualityOperation | null>(null);
  const [rejectionReason, setRejectionReason] = useState<RejectionReason>('Dimension Out of Tolerance');
  const [rejSpec, setRejSpec] = useState('');
  const [rejFinding, setRejFinding] = useState('');
  const [rejDept, setRejDept] = useState('06-A Metal Shop');
  const [rejRemarks, setRejRemarks] = useState('');
  const [savingRejection, setSavingRejection] = useState(false);

  // Corrective action modal for concerned department
  const [selectedRejectionForAction, setSelectedRejectionForAction] = useState<QualityRejection | null>(null);
  const [correctiveActionText, setCorrectiveActionText] = useState('');
  const [submittingAction, setSubmittingAction] = useState(false);

  // Reinspection modal for quality
  const [selectedRejectionForInspect, setSelectedRejectionForInspect] = useState<QualityRejection | null>(null);
  const [reinspectResult, setReinspectResult] = useState<'Accepted' | 'Rejected'>('Accepted');
  const [reinspectRemarks, setReinspectRemarks] = useState('');
  const [recordingInspect, setRecordingInspect] = useState(false);

  // Submit Rejection
  const handleSubmitRejection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isQualityUser) {
      setToastMessage({
        type: 'error',
        text: 'ACCESS DENIED: Only Quality department or Admin can log quality rejections.',
      });
      return;
    }
    if (!selectedMachineNo || !rejectionTargetOp || !activeMachine) return;
    if (!rejFinding.trim()) {
      setToastMessage({ type: 'error', text: 'Actual Finding / Observed Value is required.' });
      return;
    }

    setSavingRejection(true);
    try {
      const now = new Date();
      // 1. Save check status as 'Reject' in qualityResults and quality_daily_checks
      await saveQualityDailyCheck(
        {
          machineId: activeMachine.id,
          machineNumber: selectedMachineNo,
          machineModel: activeMachineModel,
          operationId: rejectionTargetOp.id,
          operationName: rejectionTargetOp.operationName,
          category: rejectionTargetOp.category,
          date: inspectionDate,
          userId: userProfile?.id || userProfile?.userId || 'user',
          userEmail: userProfile?.email || 'quality@accurate.in',
          time: now.toLocaleTimeString(),
          status: 'Reject',
          qualityResult: 'Reject',
          remarks: `Rejected: ${rejectionReason}. ${rejRemarks.trim()}`,
        },
        userProfile?.email
      );

      // 2. Create Rejection workflow document in qualityRejections
      await createQualityRejection(
        {
          machineId: activeMachine.id,
          machineNumber: selectedMachineNo,
          machineModel: activeMachineModel,
          operationId: rejectionTargetOp.id,
          operationName: rejectionTargetOp.operationName,
          rejectionReason,
          specification: rejSpec.trim() || '',
          actualFinding: rejFinding.trim(),
          concernedDepartment: rejDept,
          remarks: rejRemarks.trim() || '',
          status: 'Rejected',
          createdBy: userProfile?.displayName || userProfile?.email || 'Quality Inspector',
        },
        userProfile?.email
      );

      setShowRejectionModal(false);
      setRejectionTargetOp(null);
      setRejFinding('');
      setRejRemarks('');
      setToastMessage({
        type: 'warning',
        text: `Rejection recorded on Machine ${selectedMachineNo}. Notification dispatched to ${rejDept}.`,
      });
    } catch (err: any) {
      console.error(err);
      setToastMessage({
        type: 'error',
        text: 'Failed to record quality rejection. Please try again.',
      });
    } finally {
      setSavingRejection(false);
    }
  };

  // Submit Corrective Action
  const handleSubmitAction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRejectionForAction || !correctiveActionText.trim()) return;
    setSubmittingAction(true);
    try {
      await submitCorrectiveAction(
        selectedRejectionForAction.id,
        correctiveActionText.trim(),
        userProfile?.displayName || userProfile?.email || 'Responsible Engineer',
        userProfile?.email
      );
      setSelectedRejectionForAction(null);
      setCorrectiveActionText('');
      setToastMessage({
        type: 'success',
        text: 'Corrective action submitted. Re-inspection pending by Quality.',
      });
    } catch (err: any) {
      console.error(err);
      setToastMessage({
        type: 'error',
        text: 'Failed to submit corrective action.',
      });
    } finally {
      setSubmittingAction(false);
    }
  };

  // Submit Re-inspection
  const handleRecordReinspect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRejectionForInspect) return;

    if (!isQualityUser) {
      setToastMessage({
        type: 'error',
        text: 'ACCESS DENIED: Quality Re-inspection can ONLY be performed by the Quality department or Admin.',
      });
      return;
    }

    setRecordingInspect(true);
    try {
      await recordReinspectionResult(
        selectedRejectionForInspect.id,
        reinspectResult,
        reinspectRemarks.trim() || 'Verified by Quality Inspector',
        userProfile?.displayName || userProfile?.email || 'Quality Inspector',
        userProfile?.email
      );

      // If accepted, also mark the check as Accept for that machine
      if (reinspectResult === 'Accepted') {
        const now = new Date();
        await saveQualityDailyCheck(
          {
            machineNumber: selectedRejectionForInspect.machineNumber,
            machineModel: selectedRejectionForInspect.machineModel,
            operationId: selectedRejectionForInspect.operationId || '',
            operationName: selectedRejectionForInspect.operationName,
            date: now.toISOString().split('T')[0],
            userId: userProfile?.id || userProfile?.userId || 'user',
            userEmail: userProfile?.email || 'quality@accurate.in',
            time: now.toLocaleTimeString(),
            status: 'Accept',
            qualityResult: 'Accept',
            remarks: `Accepted after re-inspection. ${reinspectRemarks.trim()}`,
          },
          userProfile?.email
        );
      }

      setSelectedRejectionForInspect(null);
      setReinspectRemarks('');
      setToastMessage({
        type: 'success',
        text: `Re-inspection recorded: ${reinspectResult}. Status updated.`,
      });
    } catch (err: any) {
      console.error(err);
      setToastMessage({
        type: 'error',
        text: 'Failed to record re-inspection result.',
      });
    } finally {
      setRecordingInspect(false);
    }
  };

  // ==========================================
  // TAB 4: INSPECTION HISTORY STATE
  // ==========================================
  const [historySearch, setHistorySearch] = useState('');
  const [historyFilterResult, setHistoryFilterResult] = useState<string>('All');

  const filteredHistory = useMemo(() => {
    return dailyChecks.filter((c) => {
      if (historyFilterResult !== 'All' && c.status !== historyFilterResult) {
        return false;
      }
      if (historySearch.trim()) {
        const q = historySearch.toLowerCase();
        const match =
          c.machineNumber.toLowerCase().includes(q) ||
          c.operationName.toLowerCase().includes(q) ||
          (c.machineModel || '').toLowerCase().includes(q) ||
          (c.userEmail || '').toLowerCase().includes(q) ||
          (c.remarks || '').toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [dailyChecks, historyFilterResult, historySearch]);

  return (
    <div className="space-y-6">
      {/* Toast Notification Banner */}
      {toastMessage && (
        <div
          className={`p-3.5 rounded-xl border flex items-center justify-between text-xs font-semibold shadow-md transition animate-in fade-in slide-in-from-top-2 duration-200 ${
            toastMessage.type === 'success'
              ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
              : toastMessage.type === 'warning'
              ? 'bg-amber-50 border-amber-300 text-amber-900'
              : 'bg-red-50 border-red-300 text-red-900'
          }`}
        >
          <div className="flex items-center space-x-2.5">
            {toastMessage.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />}
            {toastMessage.type === 'warning' && <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />}
            {toastMessage.type === 'error' && <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />}
            <span>{toastMessage.text}</span>
          </div>
          <button
            onClick={() => setToastMessage(null)}
            className="p-1 hover:bg-black/5 rounded text-slate-500 hover:text-slate-800"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <CheckSquare className="w-6 h-6 text-emerald-600" />
            <span>Quality Management &amp; Inspection System</span>
          </h2>
          <p className="text-xs sm:text-sm text-slate-500">
            Model-wise master operations, machine-specific checklists, rejection workflows, and audit history
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={onOpenExcelImport}
            className="text-xs font-semibold px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg flex items-center gap-1.5 transition"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
            <span>Import Ops</span>
          </button>

          <button
            onClick={() => exportToExcel('Quality_Operations_Accurate', 'Operations', operations)}
            className="text-xs font-semibold px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg flex items-center gap-1.5 transition"
          >
            <FileSpreadsheet className="w-4 h-4 text-blue-600" />
            <span>Export Ops</span>
          </button>

          <button
            onClick={handleOpenAddOpModal}
            className="text-xs font-bold px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg shadow-sm flex items-center gap-1.5 transition"
          >
            <Plus className="w-4 h-4" />
            <span>+ ADD OPERATION</span>
          </button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex border-b border-slate-200 space-x-6 text-sm font-semibold overflow-x-auto">
        <button
          onClick={() => setActiveTab('decisions')}
          className={`pb-3 border-b-2 transition flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'decisions'
              ? 'border-indigo-600 text-indigo-600 font-black'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <ShieldCheck className="w-4 h-4 text-indigo-600" />
          <span>Machine Inspection (Rework / Reject / Accept)</span>
          <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-indigo-100 text-indigo-800 font-mono font-bold">
            {machines.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('checklist')}
          className={`pb-3 border-b-2 transition flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'checklist'
              ? 'border-emerald-600 text-emerald-600 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <CheckSquare className="w-4 h-4" />
          <span>Daily Quality Checklist</span>
        </button>

        <button
          onClick={() => setActiveTab('operations')}
          className={`pb-3 border-b-2 transition flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'operations'
              ? 'border-emerald-600 text-emerald-600 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>Operation Master ({activeOpsCount})</span>
        </button>

        <button
          onClick={() => setActiveTab('rejections')}
          className={`pb-3 border-b-2 transition flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'rejections'
              ? 'border-emerald-600 text-emerald-600 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <AlertTriangle className="w-4 h-4" />
          <span>Rejections &amp; Corrective Action ({rejections.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('history')}
          className={`pb-3 border-b-2 transition flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'history'
              ? 'border-emerald-600 text-emerald-600 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Clock className="w-4 h-4" />
          <span>Quality History ({dailyChecks.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('handovers')}
          className={`pb-3 border-b-2 transition flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'handovers'
              ? 'border-emerald-600 text-emerald-600 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <ShieldCheck className="w-4 h-4" />
          <span>Quality Receiving &amp; Handovers</span>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: DAILY QUALITY CHECKLIST */}
      {/* ========================================================================= */}
      {activeTab === 'checklist' && (
        <div className="space-y-4">
          {/* Machine & Inspection Date Bar */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                  1. Inspection Date:
                </label>
                <div className="relative">
                  <input
                    type="date"
                    value={inspectionDate}
                    onChange={(e) => setInspectionDate(e.target.value)}
                    className="text-xs font-bold p-2 rounded-lg border border-slate-300 bg-white text-slate-900"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                  2. Select Machine:
                </label>
                {machines.length === 0 ? (
                  <div className="text-xs text-slate-400 p-2">No machines in system.</div>
                ) : (
                  <select
                    value={selectedMachineNo}
                    onChange={(e) => setSelectedMachineNo(e.target.value)}
                    className="text-xs font-bold p-2 rounded-lg border border-slate-300 bg-white text-slate-900 min-w-[200px]"
                  >
                    {machines.map((m) => (
                      <option key={m.id} value={m.machineNumber}>
                        Machine {m.machineNumber} (Model {m.model})
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {activeMachine && (
                <div className="flex flex-wrap items-center gap-3 bg-slate-50 px-3.5 py-2 rounded-xl border border-slate-200 text-xs">
                  <div>
                    <span className="text-slate-400 text-[10px] uppercase font-semibold">Model / Size:</span>
                    <div className="font-bold text-slate-900">{activeMachine.model}</div>
                  </div>
                  <div className="border-l border-slate-200 pl-3">
                    <span className="text-slate-400 text-[10px] uppercase font-semibold">Current Dept:</span>
                    <div className="font-semibold text-blue-700">{activeMachine.currentDepartment}</div>
                  </div>
                  <div className="border-l border-slate-200 pl-3">
                    <span className="text-slate-400 text-[10px] uppercase font-semibold">Status:</span>
                    <div className="font-semibold text-slate-800">{activeMachine.currentStatus}</div>
                  </div>
                  <div className="border-l border-slate-200 pl-3">
                    <span className="text-slate-400 text-[10px] uppercase font-semibold">Progress:</span>
                    <div className="font-bold text-emerald-700">
                      {completedOps.length} / {modelOperations.length} Passed
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Machine Quality Decision Controls (Quality & Admin) & Remaining Operations */}
            <div className="flex flex-wrap items-center gap-2">
              {isQualityUser && activeMachine && (
                <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl border border-slate-200 shadow-2xs">
                  <span className="text-[10px] font-black uppercase text-indigo-900 px-2 flex items-center gap-1 bg-indigo-50 py-1 rounded-lg border border-indigo-200/60">
                    <ShieldCheck className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Quality Decision:</span>
                  </span>
                  <button
                    onClick={() => {
                      setSelectedMachineForQCModal(activeMachine);
                      setQcModalInitialAction('Accept');
                    }}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-xs transition flex items-center gap-1"
                    title="Accept Machine (Quality Passed & Ready for Handover)"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Accept Machine</span>
                  </button>

                  <button
                    onClick={() => {
                      setSelectedMachineForQCModal(activeMachine);
                      setQcModalInitialAction('Rework');
                    }}
                    className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-xs font-bold shadow-xs transition flex items-center gap-1"
                    title="Send Machine for Rework (REWORK REQUIRED)"
                  >
                    <PauseCircle className="w-3.5 h-3.5" />
                    <span>Send for Rework</span>
                  </button>

                  <button
                    onClick={() => {
                      setSelectedMachineForQCModal(activeMachine);
                      setQcModalInitialAction('Reject');
                    }}
                    className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold shadow-xs transition flex items-center gap-1"
                    title="Reject Machine (Quality Rejection / Non-conformance)"
                  >
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>Reject Machine</span>
                  </button>
                </div>
              )}

              {/* Remaining Operations Button */}
              <button
                onClick={() => setShowRemainingModal(true)}
                className="bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold px-3.5 py-2 rounded-xl shadow-xs flex items-center gap-1.5 transition"
              >
                <span>REMAINING OPS</span>
                <span className="bg-slate-700 px-1.5 py-0.5 rounded-full text-[10px]">
                  {remainingOps.length}
                </span>
              </button>
            </div>
          </div>

          {/* Filter and Search Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            {/* Category Filter Tabs */}
            <div className="flex items-center space-x-1.5">
              {(['All', 'Manufacturing', 'Bought-Out', 'Other'] as const).map((cat) => (
                <button
                  key={cat}
                  onClick={() => setActiveCategoryTab(cat)}
                  className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition ${
                    activeCategoryTab === cat
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* Checklist Search */}
            <div className="relative w-full sm:w-64">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
              <input
                type="text"
                placeholder="Search checklist operations..."
                value={checklistSearch}
                onChange={(e) => setChecklistSearch(e.target.value)}
                className="w-full text-xs pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          {/* Checklist Table */}
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
            {displayedChecklistOps.length === 0 ? (
              <div className="p-12 text-center text-xs text-slate-400 space-y-2">
                <p>
                  {activeMachine
                    ? `No active operations defined for Model ${activeMachine.model}.`
                    : 'Please select a machine to begin daily quality inspection.'}
                </p>
                {activeMachine && (
                  <button
                    onClick={() => {
                      setAddOpModel(activeMachine.model);
                      setShowAddOpModal(true);
                    }}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg transition"
                  >
                    + Add Operation for Model {activeMachine.model}
                  </button>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[10px]">
                    <tr>
                      <th className="p-3 w-12">#</th>
                      <th className="p-3">Category</th>
                      <th className="p-3">Operation Name</th>
                      <th className="p-3">Part Code / Sr.</th>
                      <th className="p-3">Process Dept</th>
                      <th className="p-3">Specification</th>
                      <th className="p-3">Remarks / Findings</th>
                      <th className="p-3">Inspection Status</th>
                      <th className="p-3 text-right">Quality Result</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {displayedChecklistOps.map((op, idx) => {
                      const check = checkMap[op.id];
                      const currentStatus: QualityInspectionStatus = check ? check.status : 'Pending';
                      const isSaving = savingCheckId === op.id;

                      return (
                        <tr key={op.id} className="hover:bg-slate-50 transition">
                          <td className="p-3 font-mono text-slate-400 text-[11px]">{idx + 1}</td>
                          <td className="p-3">
                            <span className="bg-slate-100 text-slate-700 text-[10px] font-bold px-2 py-0.5 rounded">
                              {op.category}
                            </span>
                          </td>
                          <td className="p-3 font-bold text-slate-900">
                            <div>{op.operationName}</div>
                            {op.description && (
                              <div className="text-[10px] text-slate-400 font-normal mt-0.5 max-w-xs truncate">
                                {op.description}
                              </div>
                            )}
                          </td>
                          <td className="p-3 text-slate-600 font-mono text-[11px]">
                            {op.partCode || op.srNo || '-'}
                          </td>
                          <td className="p-3 text-slate-600">{op.processDepartment || '-'}</td>
                          <td className="p-3 text-slate-600 max-w-xs truncate" title={op.specification || op.specificationRequirement}>
                            {op.specification || op.specificationRequirement || '-'}
                          </td>
                          <td className="p-3">
                            <input
                              type="text"
                              placeholder={check?.remarks || 'Add remark...'}
                              value={checkRemarks[op.id] !== undefined ? checkRemarks[op.id] : ''}
                              onChange={(e) =>
                                setCheckRemarks((prev) => ({ ...prev, [op.id]: e.target.value }))
                              }
                              className="w-36 sm:w-44 text-[11px] p-1.5 rounded border border-slate-200 bg-white"
                            />
                          </td>
                          <td className="p-3">
                            <span
                              className={`inline-block px-2.5 py-0.5 rounded text-[10px] font-bold ${
                                currentStatus === 'Accept'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : currentStatus === 'Reject'
                                  ? 'bg-red-100 text-red-800'
                                  : currentStatus === 'Hold' || currentStatus === 'Rework'
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-slate-100 text-slate-600'
                              }`}
                            >
                              {currentStatus === 'Hold' ? 'Rework (legacy Hold)' : currentStatus}
                            </span>
                            {check && (
                              <div className="text-[10px] text-slate-400 mt-0.5 font-mono">
                                {check.date} &bull; {check.time}
                              </div>
                            )}
                          </td>
                          <td className="p-3 text-right">
                            <div className="inline-flex items-center space-x-1.5">
                              <button
                                onClick={() => handleCheckStatus(op, 'Accept')}
                                disabled={isSaving}
                                className={`px-2.5 py-1 rounded font-bold text-[11px] transition border ${
                                  currentStatus === 'Accept'
                                    ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                                    : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-300'
                                }`}
                              >
                                Accept
                              </button>

                              <button
                                onClick={() => handleCheckStatus(op, 'Hold')}
                                disabled={isSaving}
                                title="Send operation for rework"
                                className={`px-2.5 py-1 rounded font-bold text-[11px] transition border ${
                                  currentStatus === 'Hold' || currentStatus === 'Rework'
                                    ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
                                    : 'bg-amber-50 hover:bg-amber-100 text-amber-700 border-amber-300'
                                }`}
                              >
                                Rework
                              </button>

                              <button
                                onClick={() => handleCheckStatus(op, 'Reject')}
                                disabled={isSaving}
                                className={`px-2.5 py-1 rounded font-bold text-[11px] transition border ${
                                  currentStatus === 'Reject'
                                    ? 'bg-red-600 text-white border-red-600 shadow-xs'
                                    : 'bg-red-50 hover:bg-red-100 text-red-700 border-red-300'
                                }`}
                              >
                                Reject
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB: MACHINE QUALITY INSPECTION DECISIONS (HOLD / REJECT / ACCEPT) */}
      {/* ========================================================================= */}
      {activeTab === 'decisions' && (
        <div className="space-y-4">
          {/* Top Banner */}
          <div className="p-4 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 rounded-2xl text-white shadow-md border border-indigo-900/40 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-indigo-500/20 text-indigo-400 rounded-lg border border-indigo-500/30">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <h3 className="text-base font-black tracking-tight">
                  Machine Quality Inspection Decision Console
                </h3>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-500/30 text-indigo-300 border border-indigo-400/30 uppercase tracking-wider">
                  Quality &amp; Admin Authorized
                </span>
              </div>
              <p className="text-xs text-slate-300 max-w-2xl">
                Official Quality inspection sign-off desk. Quality inspectors and System Administrators have full authority to <strong>Rework</strong>, <strong>Reject</strong>, or <strong>Accept</strong> machines across all manufacturing stages with immediate department notifications and audit logging.
              </p>
            </div>

            <div className="flex items-center gap-2">
              {isQualityUser && (
                <button
                  onClick={() => {
                    if (activeMachine) {
                      setSelectedMachineForQCModal(activeMachine);
                      setQcModalInitialAction('Accept');
                    }
                  }}
                  disabled={!activeMachine}
                  className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-sm transition flex items-center gap-1.5 disabled:opacity-50"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Quick QC: #{selectedMachineNo || 'Select'}</span>
                </button>
              )}
            </div>
          </div>

          {/* KPI Stat Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <div
              onClick={() => setDecisionStatusFilter('All')}
              className={`p-3.5 bg-white rounded-xl border cursor-pointer transition shadow-2xs ${
                decisionStatusFilter === 'All' ? 'border-indigo-600 ring-2 ring-indigo-50' : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Machines</div>
              <div className="text-2xl font-black text-slate-900 mt-1 font-mono">{decisionStats.total}</div>
              <div className="text-[10px] text-slate-500 mt-0.5">Across all departments</div>
            </div>

            <div
              onClick={() => setDecisionStatusFilter('Accepted')}
              className={`p-3.5 bg-white rounded-xl border cursor-pointer transition shadow-2xs ${
                decisionStatusFilter === 'Accepted' ? 'border-emerald-600 ring-2 ring-emerald-50' : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <div className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">Quality Accepted</div>
              <div className="text-2xl font-black text-emerald-600 mt-1 font-mono">{decisionStats.accepted}</div>
              <div className="text-[10px] text-slate-500 mt-0.5">Passed &amp; Handover Ready</div>
            </div>

            <div
              onClick={() => setDecisionStatusFilter('Rework')}
              className={`p-3.5 bg-white rounded-xl border cursor-pointer transition shadow-2xs ${
                decisionStatusFilter === 'Rework' ? 'border-amber-600 ring-2 ring-amber-50' : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <div className="text-[10px] font-bold text-amber-600 uppercase tracking-wider">REWORK REQUIRED</div>
              <div className="text-2xl font-black text-amber-600 mt-1 font-mono">{decisionStats.rework}</div>
              <div className="text-[10px] text-slate-500 mt-0.5">Sent back for correction</div>
            </div>

            <div
              onClick={() => setDecisionStatusFilter('Rejected')}
              className={`p-3.5 bg-white rounded-xl border cursor-pointer transition shadow-2xs ${
                decisionStatusFilter === 'Rejected' ? 'border-rose-600 ring-2 ring-rose-50' : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <div className="text-[10px] font-bold text-rose-600 uppercase tracking-wider">Quality Rejected</div>
              <div className="text-2xl font-black text-rose-600 mt-1 font-mono">{decisionStats.rejected}</div>
              <div className="text-[10px] text-slate-500 mt-0.5">Non-conformance / Rework</div>
            </div>

            <div
              onClick={() => setDecisionStatusFilter('Pending')}
              className={`p-3.5 bg-white rounded-xl border cursor-pointer transition shadow-2xs ${
                decisionStatusFilter === 'Pending' ? 'border-slate-600 ring-2 ring-slate-100' : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Pending QC</div>
              <div className="text-2xl font-black text-slate-700 mt-1 font-mono">{decisionStats.pending}</div>
              <div className="text-[10px] text-slate-500 mt-0.5">Awaiting inspection</div>
            </div>
          </div>

          {/* Filters & Search Bar */}
          <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2.5 text-xs">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Search Machine #, Model, Customer, Dept..."
                  value={decisionSearchQuery}
                  onChange={(e) => setDecisionSearchQuery(e.target.value)}
                  className="pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-indigo-500 w-64"
                />
              </div>

              <div className="flex items-center space-x-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase">Dept:</span>
                <select
                  value={decisionDeptFilter}
                  onChange={(e) => setDecisionDeptFilter(e.target.value)}
                  className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-700"
                >
                  <option value="All">All Departments</option>
                  {effectiveDepartments.map((d) => (
                    <option key={d.id} value={d.name}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center space-x-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase">Status:</span>
                <select
                  value={decisionStatusFilter}
                  onChange={(e) => setDecisionStatusFilter(e.target.value as any)}
                  className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-700"
                >
                  <option value="All">All Statuses</option>
                  <option value="Accepted">Accepted</option>
                  <option value="Rework">REWORK REQUIRED</option>
                  <option value="Rejected">Rejected</option>
                  <option value="Pending">Pending QC</option>
                </select>
              </div>
            </div>

            <div className="text-xs text-slate-500">
              Showing <strong>{filteredDecisionMachines.length}</strong> of {machines.length} machines
            </div>
          </div>

          {/* Machine Decisions Table */}
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs">
            {filteredDecisionMachines.length === 0 ? (
              <div className="p-12 text-center text-xs text-slate-400">
                No machines match the selected filter criteria.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[10px]">
                    <tr>
                      <th className="p-3">Machine #</th>
                      <th className="p-3">Model / Size</th>
                      <th className="p-3">Current Dept</th>
                      <th className="p-3">Customer &amp; Project</th>
                      <th className="p-3">Shop Floor Status</th>
                      <th className="p-3">Quality Status</th>
                      <th className="p-3 text-right">Accept / Rework / Reject</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredDecisionMachines.map((m) => {
                      const qStatus = (m.qualityStatus || '').toLowerCase();
                      const isAccepted = qStatus.includes('accept') || qStatus.includes('pass');
                      const isHold =
                        qStatus.includes('hold') ||
                        qStatus.includes('rework') ||
                        m.status === 'Quality Hold' ||
                        (m.status as string) === 'QUALITY_HOLD' ||
                        (m.status as string) === 'REWORK_REQUIRED';
                      const isRejected = qStatus.includes('reject') || m.status === 'QUALITY_REJECTED';

                      return (
                        <tr key={m.id} className="hover:bg-slate-50/80 transition">
                          {/* Machine Number */}
                          <td className="p-3 font-bold text-slate-900">
                            <span className="font-mono text-sm">#{m.machineNumber}</span>
                          </td>

                          {/* Model */}
                          <td className="p-3">
                            <span className="font-bold text-slate-800">{m.model || 'Standard'}</span>
                          </td>

                          {/* Current Dept */}
                          <td className="p-3">
                            <span className="inline-block px-2 py-0.5 rounded text-[11px] font-semibold bg-blue-50 text-blue-800 border border-blue-200/60">
                              {m.currentDepartment}
                            </span>
                          </td>

                          {/* Customer & Project */}
                          <td className="p-3 text-slate-600">
                            <div className="font-medium text-slate-800 truncate max-w-xs">{m.customer || 'Internal'}</div>
                            {m.project && <div className="text-[10px] text-slate-400">Proj: {m.project}</div>}
                          </td>

                          {/* Shop Floor Status */}
                          <td className="p-3">
                            <span className="text-[11px] text-slate-700 font-medium">
                              {m.currentStatus || m.status || 'In Progress'}
                            </span>
                            {m.progress !== undefined && (
                              <div className="w-20 bg-slate-100 h-1.5 rounded-full overflow-hidden mt-1">
                                <div
                                  className="h-full bg-blue-600 rounded-full"
                                  style={{ width: `${Math.min(100, Math.max(0, m.progress))}%` }}
                                />
                              </div>
                            )}
                          </td>

                          {/* Quality Status Badge */}
                          <td className="p-3">
                            {isAccepted ? (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800 border border-emerald-300">
                                <Check className="w-3 h-3 mr-1" /> ACCEPTED
                              </span>
                            ) : isHold ? (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-black bg-amber-100 text-amber-800 border border-amber-300">
                                <PauseCircle className="w-3 h-3 mr-1" /> {qStatus.includes('hold') ? 'REWORK (LEGACY HOLD)' : 'REWORK REQUIRED'}
                              </span>
                            ) : isRejected ? (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-black bg-rose-100 text-rose-800 border border-rose-300">
                                <AlertTriangle className="w-3 h-3 mr-1" /> REJECTED
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                                <Clock className="w-3 h-3 mr-1" /> PENDING QC
                              </span>
                            )}
                          </td>

                          {/* Hold, Reject, Accept Actions (Quality & Admin Only) */}
                          <td className="p-3 text-right">
                            <div className="inline-flex items-center gap-1.5 justify-end">
                              {isQualityUser ? (
                                <>
                                  {/* ACCEPT BUTTON */}
                                  <button
                                    onClick={() => {
                                      setSelectedMachineForQCModal(m);
                                      setQcModalInitialAction('Accept');
                                    }}
                                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1 shadow-2xs ${
                                      isAccepted
                                        ? 'bg-emerald-100 text-emerald-800 border border-emerald-300 hover:bg-emerald-200'
                                        : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                                    }`}
                                    title="Accept Machine (Pass Quality Inspection)"
                                  >
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                    <span>Accept</span>
                                  </button>

                                  {/* REWORK BUTTON */}
                                  <button
                                    onClick={() => {
                                      setSelectedMachineForQCModal(m);
                                      setQcModalInitialAction('Rework');
                                    }}
                                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1 shadow-2xs ${
                                      isHold
                                        ? 'bg-amber-100 text-amber-800 border border-amber-300 hover:bg-amber-200'
                                        : 'bg-amber-500 hover:bg-amber-600 text-white'
                                    }`}
                                    title="Send Machine for Rework (REWORK REQUIRED)"
                                  >
                                    <PauseCircle className="w-3.5 h-3.5" />
                                    <span>Rework</span>
                                  </button>

                                  {/* REJECT BUTTON */}
                                  <button
                                    onClick={() => {
                                      setSelectedMachineForQCModal(m);
                                      setQcModalInitialAction('Reject');
                                    }}
                                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1 shadow-2xs ${
                                      isRejected
                                        ? 'bg-rose-100 text-rose-800 border border-rose-300 hover:bg-rose-200'
                                        : 'bg-rose-600 hover:bg-rose-700 text-white'
                                    }`}
                                    title="Reject Machine (Quality Non-conformance)"
                                  >
                                    <AlertTriangle className="w-3.5 h-3.5" />
                                    <span>Reject</span>
                                  </button>
                                </>
                              ) : (
                                <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100 text-slate-500 border border-slate-200">
                                  View Only
                                </span>
                              )}

                              {/* CHECKLIST JUMP */}
                              <button
                                onClick={() => {
                                  setSelectedMachineNo(m.machineNumber);
                                  setActiveTab('checklist');
                                }}
                                className="p-1 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition"
                                title="Inspect Checklist"
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
      {activeTab === 'operations' && (
        <div className="space-y-4">
          {/* Master Operational Statistics */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Operations</span>
                <div className="text-xl font-black text-slate-900 mt-0.5">{totalOpsCount}</div>
              </div>
              <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                <Layers className="w-5 h-5" />
              </div>
            </div>

            <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Active Operations</span>
                <div className="text-xl font-black text-emerald-600 mt-0.5">{activeOpsCount}</div>
              </div>
              <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
                <CheckCircle2 className="w-5 h-5" />
              </div>
            </div>

            <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Inactive Operations</span>
                <div className="text-xl font-black text-slate-500 mt-0.5">{inactiveOpsCount}</div>
              </div>
              <div className="p-2 bg-slate-100 text-slate-500 rounded-lg">
                <Clock className="w-5 h-5" />
              </div>
            </div>
          </div>

          {/* Filter & Action Toolbar */}
          <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2.5">
              {/* Search */}
              <div className="relative w-56">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                <input
                  type="text"
                  placeholder="Search operations..."
                  value={opSearchQuery}
                  onChange={(e) => setOpSearchQuery(e.target.value)}
                  className="w-full text-xs pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-500"
                />
              </div>

              {/* Model Filter */}
              <select
                value={opFilterModel}
                onChange={(e) => setOpFilterModel(e.target.value)}
                className="text-xs p-1.5 rounded-lg border border-slate-200 bg-slate-50 font-semibold"
              >
                <option value="All">All Machine Models</option>
                {availableModels.map((m) => (
                  <option key={m} value={m}>
                    Model {m}
                  </option>
                ))}
              </select>

              {/* Category Filter */}
              <select
                value={opFilterCategory}
                onChange={(e) => setOpFilterCategory(e.target.value)}
                className="text-xs p-1.5 rounded-lg border border-slate-200 bg-slate-50 font-semibold"
              >
                <option value="All">All Categories</option>
                <option value="Manufacturing">Manufacturing</option>
                <option value="Bought-Out">Bought-Out</option>
                <option value="Other">Other</option>
              </select>

              {/* Status Filter */}
              <select
                value={opFilterStatus}
                onChange={(e) => setOpFilterStatus(e.target.value)}
                className="text-xs p-1.5 rounded-lg border border-slate-200 bg-slate-50 font-semibold"
              >
                <option value="All">All Statuses</option>
                <option value="Active">Active Only</option>
                <option value="Inactive">Inactive Only</option>
              </select>
            </div>

            <button
              onClick={handleOpenAddOpModal}
              className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-lg shadow-sm flex items-center gap-1.5 transition self-start md:self-auto"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>+ ADD OPERATION</span>
            </button>
          </div>

          {/* Operation Master Table */}
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
            <div className="p-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-700">
                Operations belong to Machine Model/Size and apply across all machines of that model.
              </span>
              <span className="text-slate-500 font-medium">
                Showing {filteredOperations.length} of {totalOpsCount} operation{totalOpsCount !== 1 ? 's' : ''}
              </span>
            </div>

            {filteredOperations.length === 0 ? (
              <div className="p-12 text-center text-xs text-slate-400 space-y-2">
                <p>No matching operations found.</p>
                <button
                  onClick={handleOpenAddOpModal}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg transition"
                >
                  + Add First Operation
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[10px]">
                    <tr>
                      <th className="p-3">Sr No</th>
                      <th className="p-3">Machine Model/Size</th>
                      <th className="p-3">Category</th>
                      <th className="p-3">Operation Name</th>
                      <th className="p-3">Part Code</th>
                      <th className="p-3">Type</th>
                      <th className="p-3">Process Department</th>
                      <th className="p-3">Planned Inspection Time</th>
                      <th className="p-3">Status</th>
                      <th className="p-3">Created Date</th>
                      <th className="p-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredOperations.map((op, idx) => {
                      const isOpActive = op.status === 'Active' || (op.status === undefined && op.active !== false);

                      return (
                        <tr key={op.id} className="hover:bg-slate-50 transition">
                          <td className="p-3 font-mono text-slate-400 font-semibold">{op.srNo || idx + 1}</td>
                          <td className="p-3 font-bold text-blue-700">{op.machineModel}</td>
                          <td className="p-3">
                            <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded text-[10px] font-bold">
                              {op.category}
                            </span>
                          </td>
                          <td className="p-3 font-bold text-slate-900">
                            <div>{op.operationName}</div>
                            {op.description && (
                              <div className="text-[10px] text-slate-400 font-normal mt-0.5 max-w-xs truncate">
                                {op.description}
                              </div>
                            )}
                          </td>
                          <td className="p-3 font-mono text-slate-600">{op.partCode || '-'}</td>
                          <td className="p-3 text-slate-600">{op.type || 'Dimensional'}</td>
                          <td className="p-3 text-slate-700">{op.processDepartment || '-'}</td>
                          <td className="p-3 text-slate-600">{op.plannedInspectionTime || '-'}</td>
                          <td className="p-3">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                isOpActive
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-slate-200 text-slate-600'
                              }`}
                            >
                              {isOpActive ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                          <td className="p-3 text-slate-500 font-mono text-[11px]">
                            {op.createdAt ? op.createdAt.split('T')[0] : '-'}
                          </td>
                          <td className="p-3 text-right whitespace-nowrap">
                            <div className="inline-flex items-center space-x-1">
                              {/* VIEW Action */}
                              <button
                                onClick={() => setViewingOp(op)}
                                className="p-1 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded transition"
                                title="View Details"
                              >
                                <Eye className="w-3.5 h-3.5" />
                              </button>

                              {/* EDIT Action */}
                              <button
                                onClick={() => handleOpenEditModal(op)}
                                className="p-1 text-slate-500 hover:text-amber-600 hover:bg-amber-50 rounded transition"
                                title="Edit Operation"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>

                              {/* DEACTIVATE / ACTIVATE Action */}
                              {isOpActive ? (
                                <button
                                  onClick={() => {
                                    setConfirmOpTarget(op);
                                    setConfirmActionType('deactivate');
                                  }}
                                  className="p-1 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded transition"
                                  title="Deactivate Operation"
                                >
                                  <Power className="w-3.5 h-3.5" />
                                </button>
                              ) : (
                                <button
                                  onClick={() => {
                                    setConfirmOpTarget(op);
                                    setConfirmActionType('activate');
                                  }}
                                  className="p-1 text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 rounded transition"
                                  title="Activate Operation"
                                >
                                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: REJECTIONS & CORRECTIVE ACTION WORKFLOW */}
      {/* ========================================================================= */}
      {activeTab === 'rejections' && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
            <div className="p-4 bg-red-50 border-b border-red-100 flex items-center justify-between text-xs text-red-900 font-semibold">
              <span>Live Quality Rejections &bull; Department Corrective Action &amp; Re-inspection Loop</span>
              <span className="font-mono text-red-700">{rejections.length} active issue{rejections.length !== 1 ? 's' : ''}</span>
            </div>

            {rejections.length === 0 ? (
              <div className="p-12 text-center text-xs text-slate-400">
                Zero quality rejections logged. All components conform to standard specifications.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[10px]">
                    <tr>
                      <th className="p-3">Machine</th>
                      <th className="p-3">Operation</th>
                      <th className="p-3">Rejection Reason</th>
                      <th className="p-3">Observed Finding</th>
                      <th className="p-3">Concerned Dept</th>
                      <th className="p-3">Workflow Status</th>
                      <th className="p-3">Corrective Action</th>
                      <th className="p-3 text-right">Workflow Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rejections.map((rej) => (
                      <tr key={rej.id} className="hover:bg-slate-50">
                        <td className="p-3 font-bold text-slate-900">
                          Machine {rej.machineNumber} ({rej.machineModel})
                        </td>
                        <td className="p-3 text-slate-800 font-medium">{rej.operationName}</td>
                        <td className="p-3 text-red-700 font-semibold">{rej.rejectionReason}</td>
                        <td className="p-3 text-slate-600 font-mono text-[11px] max-w-xs truncate" title={rej.actualFinding}>
                          {rej.actualFinding || '-'}
                        </td>
                        <td className="p-3 text-slate-700 font-medium">{rej.concernedDepartment}</td>
                        <td className="p-3">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              rej.status === 'Accepted'
                                ? 'bg-emerald-100 text-emerald-800'
                                : rej.status === 'Re-inspection Pending'
                                ? 'bg-blue-100 text-blue-800'
                                : 'bg-red-100 text-red-800'
                            }`}
                          >
                            {rej.status}
                          </span>
                        </td>
                        <td className="p-3 text-slate-600 max-w-xs truncate" title={rej.correctiveAction}>
                          {rej.correctiveAction || 'Pending Action'}
                        </td>
                        <td className="p-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {rej.status === 'Rejected' && (
                              <button
                                onClick={() => {
                                  setSelectedRejectionForAction(rej);
                                  setCorrectiveActionText('');
                                }}
                                className="px-2.5 py-1 text-xs font-bold bg-amber-500 hover:bg-amber-600 text-white rounded-lg shadow-xs"
                              >
                                Submit Corrective Action
                              </button>
                            )}

                            {rej.status === 'Re-inspection Pending' && (
                              isQualityUser ? (
                                <button
                                  onClick={() => {
                                    setSelectedRejectionForInspect(rej);
                                    setReinspectRemarks('');
                                  }}
                                  className="px-2.5 py-1 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-xs"
                                >
                                  Re-Inspect
                                </button>
                              ) : (
                                <span className="text-xs text-amber-600 font-semibold italic flex items-center justify-end gap-1">
                                  <Clock className="w-3.5 h-3.5" />
                                  <span>Awaiting Quality Re-inspection</span>
                                </span>
                              )
                            )}

                            {rej.status === 'Accepted' && (
                              <span className="text-xs text-emerald-600 font-bold flex items-center justify-end gap-1">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>Closed / Passed</span>
                              </span>
                            )}

                            {/* Direct Machine Decision Controls (Quality & Admin) */}
                            {isQualityUser && (
                              <div className="inline-flex items-center gap-1 pl-2 border-l border-slate-200">
                                <button
                                  onClick={() => {
                                    const matchedM = machines.find((m) => m.machineNumber === rej.machineNumber);
                                    if (matchedM) {
                                      setSelectedMachineForQCModal(matchedM);
                                      setQcModalInitialAction('Accept');
                                    }
                                  }}
                                  className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 hover:bg-emerald-200 text-emerald-800 transition"
                                  title="Accept Machine (Pass Quality Inspection)"
                                >
                                  ✓ Accept
                                </button>
                                <button
                                  onClick={() => {
                                    const matchedM = machines.find((m) => m.machineNumber === rej.machineNumber);
                                    if (matchedM) {
                                      setSelectedMachineForQCModal(matchedM);
                                      setQcModalInitialAction('Rework');
                                    }
                                  }}
                                  className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 hover:bg-amber-200 text-amber-800 transition"
                                  title="Send Machine for Rework (REWORK REQUIRED)"
                                >
                                  🔧 Rework
                                </button>
                                <button
                                  onClick={() => {
                                    const matchedM = machines.find((m) => m.machineNumber === rej.machineNumber);
                                    if (matchedM) {
                                      setSelectedMachineForQCModal(matchedM);
                                      setQcModalInitialAction('Reject');
                                    }
                                  }}
                                  className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 hover:bg-rose-200 text-rose-800 transition"
                                  title="Reject Machine"
                                >
                                  ✕ Reject
                                </button>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 4: QUALITY HISTORY */}
      {/* ========================================================================= */}
      {activeTab === 'history' && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
          <div className="p-3.5 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2.5">
              <input
                type="text"
                placeholder="Search history by machine, op, inspector..."
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
                className="text-xs p-2 rounded-lg border border-slate-300 w-64 bg-white"
              />

              <select
                value={historyFilterResult}
                onChange={(e) => setHistoryFilterResult(e.target.value)}
                className="text-xs p-2 rounded-lg border border-slate-300 bg-white font-semibold"
              >
                <option value="All">All Results</option>
                <option value="Accept">Accept Only</option>
                <option value="Reject">Reject Only</option>
                <option value="Hold">Rework Only</option>
              </select>
            </div>

            <button
              onClick={() => exportToExcel('Quality_Daily_Checks_History', 'History', dailyChecks)}
              className="text-xs font-semibold px-3 py-1.5 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 flex items-center gap-1.5 self-start sm:self-auto"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
              <span>Export History</span>
            </button>
          </div>

          {filteredHistory.length === 0 ? (
            <div className="p-12 text-center text-xs text-slate-400">
              No quality inspection history records logged yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[10px]">
                  <tr>
                    <th className="p-3">Date &amp; Time</th>
                    <th className="p-3">Machine</th>
                    <th className="p-3">Model</th>
                    <th className="p-3">Operation</th>
                    <th className="p-3">Category</th>
                    <th className="p-3">Remarks</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">Inspector</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredHistory.map((c) => (
                    <tr key={c.id} className="hover:bg-slate-50">
                      <td className="p-3 whitespace-nowrap text-slate-600 font-mono text-[11px]">
                        {c.date} {c.time}
                      </td>
                      <td className="p-3 font-bold text-slate-900">Machine {c.machineNumber}</td>
                      <td className="p-3 text-slate-700">{c.machineModel}</td>
                      <td className="p-3 text-slate-800 font-medium">{c.operationName}</td>
                      <td className="p-3 text-slate-600">{c.category}</td>
                      <td className="p-3 text-slate-600 max-w-xs truncate" title={c.remarks}>
                        {c.remarks || '-'}
                      </td>
                      <td className="p-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            c.status === 'Accept'
                              ? 'bg-emerald-100 text-emerald-800'
                              : c.status === 'Reject'
                              ? 'bg-red-100 text-red-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {c.status === 'Hold' ? 'Rework (legacy Hold)' : c.status === 'Rework' ? 'Rework Required' : c.status}
                        </span>
                      </td>
                      <td className="p-3 text-slate-600 font-mono text-[11px]">{c.userEmail}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 5: QUALITY RECEIVING & HANDOVERS */}
      {/* ========================================================================= */}
      {activeTab === 'handovers' && (
        <QualityHandoverModule
          currentDepartment="04 Inward Quality"
          departments={effectiveDepartments}
          machines={machines}
          isQualityView={true}
        />
      )}

      {/* ========================================================================= */}
      {/* MODAL 1: ADD OPERATION MODAL (End-to-End Implementation) */}
      {/* ========================================================================= */}
      {showAddOpModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white w-full max-w-xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden text-slate-900 my-8">
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
              <div>
                <h3 className="font-bold text-sm flex items-center gap-2">
                  <Plus className="w-4 h-4 text-emerald-400" />
                  <span>Add Operation to Master</span>
                </h3>
                <p className="text-xs text-slate-400">
                  Operations belong strictly to Machine Model / Size and apply to all machines of that model
                </p>
              </div>
              <button
                onClick={() => setShowAddOpModal(false)}
                className="text-slate-400 hover:text-white transition p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSaveOperation(false);
              }}
              className="p-5 space-y-4"
            >
              {/* Duplicate Warning Banner */}
              {addDuplicateWarning && (
                <div className="p-3 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 text-xs flex items-start justify-between gap-3">
                  <div className="flex items-start space-x-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold">Duplicate Detected</p>
                      <p>{addDuplicateWarning}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleSaveOperation(false, true)}
                    className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded text-[11px] shrink-0"
                  >
                    Save Anyway
                  </button>
                </div>
              )}

              {/* Server Error Message */}
              {addServerErrorMessage && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-300 text-red-900 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                  <span>{addServerErrorMessage}</span>
                </div>
              )}

              {/* Success Message Banner */}
              {addSuccessMessage && (
                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-900 text-xs flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>{addSuccessMessage}</span>
                </div>
              )}

              {/* Row 1: Machine Model & Category */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Machine Model / Size <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    list="machine-models-list"
                    placeholder="e.g. 685, 1012, 1220"
                    value={addOpModel}
                    onChange={(e) => {
                      setAddOpModel(e.target.value);
                      if (addFormErrors.machineModel) {
                        setAddFormErrors((prev) => ({ ...prev, machineModel: '' }));
                      }
                    }}
                    className={`w-full text-xs p-2 rounded-lg border font-bold ${
                      addFormErrors.machineModel ? 'border-red-500 bg-red-50' : 'border-slate-300 bg-white'
                    }`}
                  />
                  <datalist id="machine-models-list">
                    {availableModels.map((m) => (
                      <option key={m} value={m} />
                    ))}
                  </datalist>
                  {addFormErrors.machineModel && (
                    <p className="text-[11px] text-red-600 font-semibold mt-1">
                      {addFormErrors.machineModel}
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Category <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={addOpCategory}
                    onChange={(e) => setAddOpCategory(e.target.value as QualityCategory)}
                    className="w-full text-xs p-2 rounded-lg border border-slate-300 bg-white font-medium"
                  >
                    <option value="Manufacturing">Manufacturing</option>
                    <option value="Bought-Out">Bought-Out</option>
                    <option value="Other">Other</option>
                  </select>
                  {addFormErrors.category && (
                    <p className="text-[11px] text-red-600 font-semibold mt-1">
                      {addFormErrors.category}
                    </p>
                  )}
                </div>
              </div>

              {/* Row 2: Operation Name */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Operation Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Bridge Parallelism &amp; Flatness Inspection"
                  value={addOpName}
                  onChange={(e) => {
                    setAddOpName(e.target.value);
                    if (addFormErrors.operationName) {
                      setAddFormErrors((prev) => ({ ...prev, operationName: '' }));
                    }
                  }}
                  className={`w-full text-xs p-2 rounded-lg border font-semibold ${
                    addFormErrors.operationName ? 'border-red-500 bg-red-50' : 'border-slate-300 bg-white'
                  }`}
                />
                {addFormErrors.operationName && (
                  <p className="text-[11px] text-red-600 font-semibold mt-1">
                    {addFormErrors.operationName}
                  </p>
                )}
              </div>

              {/* Row 3: Part Code, Sr No, Type */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Part Code <span className="text-slate-400 font-normal">(Optional)</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. AG-BR-685"
                    value={addOpPartCode}
                    onChange={(e) => setAddOpPartCode(e.target.value)}
                    className="w-full text-xs p-2 rounded-lg border border-slate-300 bg-white font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Sr No <span className="text-slate-400 font-normal">(Optional)</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. OP-01"
                    value={addOpSrNo}
                    onChange={(e) => setAddOpSrNo(e.target.value)}
                    className="w-full text-xs p-2 rounded-lg border border-slate-300 bg-white font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Type
                  </label>
                  <select
                    value={addOpType}
                    onChange={(e) => setAddOpType(e.target.value)}
                    className="w-full text-xs p-2 rounded-lg border border-slate-300 bg-white"
                  >
                    <option value="Dimensional">Dimensional</option>
                    <option value="Visual">Visual</option>
                    <option value="Electrical">Electrical</option>
                    <option value="Alignment">Alignment</option>
                    <option value="Functional">Functional</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              </div>

              {/* Row 4: Process Department & Planned Inspection Time */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Process Department <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    list="factory-departments-list"
                    placeholder="e.g. 04 Inward Quality"
                    value={addOpDept}
                    onChange={(e) => {
                      setAddOpDept(e.target.value);
                      if (addFormErrors.processDepartment) {
                        setAddFormErrors((prev) => ({ ...prev, processDepartment: '' }));
                      }
                    }}
                    className={`w-full text-xs p-2 rounded-lg border ${
                      addFormErrors.processDepartment ? 'border-red-500 bg-red-50' : 'border-slate-300 bg-white'
                    }`}
                  />
                  <datalist id="factory-departments-list">
                    {INITIAL_DEPARTMENTS.map((d) => (
                      <option key={d.code} value={d.name} />
                    ))}
                  </datalist>
                  {addFormErrors.processDepartment && (
                    <p className="text-[11px] text-red-600 font-semibold mt-1">
                      {addFormErrors.processDepartment}
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Planned Inspection Time <span className="text-slate-400 font-normal">(Optional)</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 15 mins, 30 mins, 1 hour"
                    value={addOpPlannedTime}
                    onChange={(e) => setAddOpPlannedTime(e.target.value)}
                    className="w-full text-xs p-2 rounded-lg border border-slate-300 bg-white"
                  />
                </div>
              </div>

              {/* Row 5: Specification / Requirement */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Specification / Requirement <span className="text-slate-400 font-normal">(Optional)</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Flatness within 0.002 mm over 500 mm"
                  value={addOpSpec}
                  onChange={(e) => setAddOpSpec(e.target.value)}
                  className="w-full text-xs p-2 rounded-lg border border-slate-300 bg-white"
                />
              </div>

              {/* Row 6: Description */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Description <span className="text-slate-400 font-normal">(Optional)</span>
                </label>
                <textarea
                  rows={2}
                  placeholder="Detailed inspection procedure, equipment to use (micrometer, dial gauge, etc.)..."
                  value={addOpDescription}
                  onChange={(e) => setAddOpDescription(e.target.value)}
                  className="w-full text-xs p-2 rounded-lg border border-slate-300 bg-white"
                />
              </div>

              {/* Row 7: Status */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Status <span className="text-red-500">*</span>
                </label>
                <select
                  value={addOpStatus}
                  onChange={(e) => setAddOpStatus(e.target.value as QualityOperationStatus)}
                  className="w-full text-xs p-2 rounded-lg border border-slate-300 bg-white font-semibold"
                >
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                </select>
                {addFormErrors.status && (
                  <p className="text-[11px] text-red-600 font-semibold mt-1">{addFormErrors.status}</p>
                )}
              </div>

              {/* Modal Actions */}
              <div className="pt-3 flex flex-col sm:flex-row items-center justify-between border-t border-slate-200 gap-2">
                <button
                  type="button"
                  onClick={resetAddForm}
                  className="px-3 py-2 text-xs text-slate-600 hover:bg-slate-100 rounded-lg flex items-center gap-1 self-start sm:self-auto"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>RESET</span>
                </button>

                <div className="flex items-center space-x-2 w-full sm:w-auto justify-end">
                  <button
                    type="button"
                    onClick={() => setShowAddOpModal(false)}
                    className="px-3.5 py-2 text-xs text-slate-600 hover:bg-slate-100 rounded-lg font-semibold"
                  >
                    CANCEL
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSaveOperation(true)}
                    disabled={savingAddOp}
                    className="px-3.5 py-2 text-xs font-bold text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg border border-slate-300 disabled:opacity-50"
                  >
                    {savingAddOp ? 'Saving...' : 'SAVE & ADD ANOTHER'}
                  </button>

                  <button
                    type="submit"
                    disabled={savingAddOp}
                    className="px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-sm disabled:opacity-50 flex items-center gap-1.5"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>{savingAddOp ? 'Saving...' : 'SAVE OPERATION'}</span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: VIEW OPERATION MODAL (Read-Only Detail Screen) */}
      {/* ========================================================================= */}
      {viewingOp && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200 overflow-hidden text-slate-900">
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
              <div>
                <h3 className="font-bold text-sm flex items-center gap-2">
                  <Eye className="w-4 h-4 text-blue-400" />
                  <span>Operation Details</span>
                </h3>
                <p className="text-xs text-slate-400">Read-only master operation record</p>
              </div>
              <button
                onClick={() => setViewingOp(null)}
                className="text-slate-400 hover:text-white transition p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-3.5 max-h-[75vh] overflow-y-auto">
              <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-xs">
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Machine Model / Size</span>
                  <div className="text-sm font-bold text-blue-700 mt-0.5">{viewingOp.machineModel}</div>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Category</span>
                  <div className="text-sm font-semibold text-slate-900 mt-0.5">{viewingOp.category}</div>
                </div>
              </div>

              <div className="space-y-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase">Operation Name</span>
                <div className="text-sm font-bold text-slate-900">{viewingOp.operationName}</div>
              </div>

              <div className="grid grid-cols-3 gap-3 text-xs">
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Part Code</span>
                  <div className="font-mono text-slate-700 font-semibold">{viewingOp.partCode || '-'}</div>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Sr No</span>
                  <div className="font-mono text-slate-700 font-semibold">{viewingOp.srNo || '-'}</div>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Type</span>
                  <div className="text-slate-700 font-semibold">{viewingOp.type || 'Dimensional'}</div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Process Department</span>
                  <div className="text-slate-800 font-semibold">{viewingOp.processDepartment || '-'}</div>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Planned Inspection Time</span>
                  <div className="text-slate-800 font-semibold">{viewingOp.plannedInspectionTime || '-'}</div>
                </div>
              </div>

              <div className="text-xs">
                <span className="text-[10px] font-bold text-slate-400 uppercase">Specification / Requirement</span>
                <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-700 mt-1">
                  {viewingOp.specification || viewingOp.specificationRequirement || 'No specification specified.'}
                </div>
              </div>

              <div className="text-xs">
                <span className="text-[10px] font-bold text-slate-400 uppercase">Description / Work Steps</span>
                <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-700 mt-1">
                  {viewingOp.description || 'No description specified.'}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs border-t border-slate-200 pt-3">
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Status</span>
                  <div className="mt-0.5">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        viewingOp.status === 'Active' || viewingOp.active
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-slate-200 text-slate-600'
                      }`}
                    >
                      {viewingOp.status || (viewingOp.active ? 'Active' : 'Inactive')}
                    </span>
                  </div>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Created Date</span>
                  <div className="text-slate-600 font-mono text-[11px] mt-0.5">
                    {viewingOp.createdAt ? viewingOp.createdAt.split('T')[0] : '-'}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Created By</span>
                  <div className="text-slate-600 text-[11px] mt-0.5">{viewingOp.createdBy || 'System'}</div>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Updated By</span>
                  <div className="text-slate-600 text-[11px] mt-0.5">{viewingOp.updatedBy || 'System'}</div>
                </div>
              </div>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end">
              <button
                onClick={() => setViewingOp(null)}
                className="px-4 py-2 bg-slate-900 text-white font-semibold text-xs rounded-lg hover:bg-slate-800 transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 3: EDIT OPERATION MODAL */}
      {/* ========================================================================= */}
      {editingOp && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white w-full max-w-xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden text-slate-900 my-8">
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
              <div>
                <h3 className="font-bold text-sm flex items-center gap-2">
                  <Edit2 className="w-4 h-4 text-amber-400" />
                  <span>Edit Operation</span>
                </h3>
                <p className="text-xs text-slate-400">Update master operation specification and details</p>
              </div>
              <button
                onClick={() => setEditingOp(null)}
                className="text-slate-400 hover:text-white transition p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEditOperation} className="p-5 space-y-4">
              {editServerErrorMessage && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-300 text-red-900 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                  <span>{editServerErrorMessage}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Machine Model / Size <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    list="edit-machine-models-list"
                    value={editOpModel}
                    onChange={(e) => setEditOpModel(e.target.value)}
                    className="w-full text-xs p-2 rounded-lg border border-slate-300 bg-white font-bold"
                  />
                  <datalist id="edit-machine-models-list">
                    {availableModels.map((m) => (
                      <option key={m} value={m} />
                    ))}
                  </datalist>
                  {editFormErrors.machineModel && (
                    <p className="text-[11px] text-red-600 mt-1">{editFormErrors.machineModel}</p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Category <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={editOpCategory}
                    onChange={(e) => setEditOpCategory(e.target.value as QualityCategory)}
                    className="w-full text-xs p-2 rounded-lg border border-slate-300 bg-white font-medium"
                  >
                    <option value="Manufacturing">Manufacturing</option>
                    <option value="Bought-Out">Bought-Out</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Operation Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={editOpName}
                  onChange={(e) => setEditOpName(e.target.value)}
                  className="w-full text-xs p-2 rounded-lg border border-slate-300 bg-white font-semibold"
                />
                {editFormErrors.operationName && (
                  <p className="text-[11px] text-red-600 mt-1">{editFormErrors.operationName}</p>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Part Code</label>
                  <input
                    type="text"
                    value={editOpPartCode}
                    onChange={(e) => setEditOpPartCode(e.target.value)}
                    className="w-full text-xs p-2 rounded-lg border border-slate-300 bg-white font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Sr No</label>
                  <input
                    type="text"
                    value={editOpSrNo}
                    onChange={(e) => setEditOpSrNo(e.target.value)}
                    className="w-full text-xs p-2 rounded-lg border border-slate-300 bg-white font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Type</label>
                  <select
                    value={editOpType}
                    onChange={(e) => setEditOpType(e.target.value)}
                    className="w-full text-xs p-2 rounded-lg border border-slate-300 bg-white"
                  >
                    <option value="Dimensional">Dimensional</option>
                    <option value="Visual">Visual</option>
                    <option value="Electrical">Electrical</option>
                    <option value="Alignment">Alignment</option>
                    <option value="Functional">Functional</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Process Department <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    list="factory-departments-list-edit"
                    value={editOpDept}
                    onChange={(e) => setEditOpDept(e.target.value)}
                    className="w-full text-xs p-2 rounded-lg border border-slate-300 bg-white"
                  />
                  <datalist id="factory-departments-list-edit">
                    {INITIAL_DEPARTMENTS.map((d) => (
                      <option key={d.code} value={d.name} />
                    ))}
                  </datalist>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Planned Time</label>
                  <input
                    type="text"
                    value={editOpPlannedTime}
                    onChange={(e) => setEditOpPlannedTime(e.target.value)}
                    className="w-full text-xs p-2 rounded-lg border border-slate-300 bg-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Specification / Requirement
                </label>
                <input
                  type="text"
                  value={editOpSpec}
                  onChange={(e) => setEditOpSpec(e.target.value)}
                  className="w-full text-xs p-2 rounded-lg border border-slate-300 bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Description</label>
                <textarea
                  rows={2}
                  value={editOpDescription}
                  onChange={(e) => setEditOpDescription(e.target.value)}
                  className="w-full text-xs p-2 rounded-lg border border-slate-300 bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Status</label>
                <select
                  value={editOpStatus}
                  onChange={(e) => setEditOpStatus(e.target.value as QualityOperationStatus)}
                  className="w-full text-xs p-2 rounded-lg border border-slate-300 bg-white font-semibold"
                >
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                </select>
              </div>

              <div className="pt-3 flex items-center justify-end space-x-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setEditingOp(null)}
                  className="px-3.5 py-2 text-xs text-slate-600 hover:bg-slate-100 rounded-lg font-semibold"
                >
                  CANCEL
                </button>
                <button
                  type="submit"
                  disabled={savingEditOp}
                  className="px-4 py-2 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-lg shadow-sm disabled:opacity-50 flex items-center gap-1.5"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>{savingEditOp ? 'Saving...' : 'SAVE CHANGES'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 4: DEACTIVATE / ACTIVATE CONFIRMATION MODAL */}
      {/* ========================================================================= */}
      {confirmOpTarget && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 overflow-hidden text-slate-900">
            <div
              className={`p-4 text-white flex items-center justify-between ${
                confirmActionType === 'deactivate' ? 'bg-red-600' : 'bg-emerald-600'
              }`}
            >
              <h3 className="font-bold text-sm flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                <span>
                  {confirmActionType === 'deactivate' ? 'Deactivate Operation' : 'Activate Operation'}
                </span>
              </h3>
              <button
                onClick={() => setConfirmOpTarget(null)}
                className="text-white hover:opacity-80 transition p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-3">
              <p className="text-xs text-slate-700 leading-relaxed">
                {confirmActionType === 'deactivate' ? (
                  <>
                    Are you sure you want to deactivate operation{' '}
                    <strong>"{confirmOpTarget.operationName}"</strong> for Machine Model{' '}
                    <strong>{confirmOpTarget.machineModel}</strong>?
                    <br />
                    <span className="text-slate-500 mt-2 block">
                      Historical quality inspection records will be preserved intact, and this operation will no longer appear in daily checklists.
                    </span>
                  </>
                ) : (
                  <>
                    Are you sure you want to reactivate operation{' '}
                    <strong>"{confirmOpTarget.operationName}"</strong> for Machine Model{' '}
                    <strong>{confirmOpTarget.machineModel}</strong>?
                  </>
                )}
              </p>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs">
                <div><strong>Category:</strong> {confirmOpTarget.category}</div>
                <div><strong>Process Department:</strong> {confirmOpTarget.processDepartment}</div>
                {confirmOpTarget.partCode && <div><strong>Part Code:</strong> {confirmOpTarget.partCode}</div>}
              </div>

              <div className="pt-2 flex justify-end space-x-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setConfirmOpTarget(null)}
                  className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={processingConfirm}
                  onClick={handleConfirmAction}
                  className={`px-4 py-1.5 text-xs font-bold text-white rounded-lg transition ${
                    confirmActionType === 'deactivate'
                      ? 'bg-red-600 hover:bg-red-700'
                      : 'bg-emerald-600 hover:bg-emerald-700'
                  }`}
                >
                  {processingConfirm
                    ? 'Processing...'
                    : confirmActionType === 'deactivate'
                    ? 'Yes, Deactivate'
                    : 'Yes, Activate'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 5: VIEW REMAINING OPERATIONS MODAL */}
      {/* ========================================================================= */}
      {showRemainingModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200 overflow-hidden text-slate-900">
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
              <div>
                <h3 className="font-bold text-sm">Remaining Quality Operations</h3>
                <p className="text-xs text-slate-400">
                  Machine {selectedMachineNo} &bull; Model {activeMachineModel}
                </p>
              </div>
              <button
                onClick={() => setShowRemainingModal(false)}
                className="text-slate-400 hover:text-white transition p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 max-h-96 overflow-y-auto">
              {remainingOps.length === 0 ? (
                <div className="py-8 text-center text-xs text-emerald-800 bg-emerald-50 rounded-xl p-4 font-bold border border-emerald-200">
                  All active operations passed for Machine {selectedMachineNo}!
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="text-xs text-slate-600 font-medium mb-3">
                    The following {remainingOps.length} operations are pending or held for Machine {selectedMachineNo}:
                  </div>
                  {remainingOps.map((op) => (
                    <div
                      key={op.id}
                      className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs flex items-center justify-between"
                    >
                      <div>
                        <div className="font-bold text-slate-900">{op.operationName}</div>
                        <div className="text-[11px] text-slate-500">
                          {op.category} &bull; Process: {op.processDepartment || 'General'}
                        </div>
                      </div>
                      <span className="text-[10px] bg-amber-100 text-amber-800 font-bold px-2 py-0.5 rounded">
                        Remaining
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="p-3 bg-slate-50 border-t border-slate-200 text-right">
              <button
                onClick={() => setShowRemainingModal(false)}
                className="px-4 py-1.5 text-xs bg-slate-800 text-white font-semibold rounded-lg hover:bg-slate-700 transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 6: QUALITY REJECTION MODAL */}
      {/* ========================================================================= */}
      {showRejectionModal && rejectionTargetOp && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-red-200 overflow-hidden text-slate-900 my-8">
            <div className="p-4 bg-red-600 text-white flex items-center justify-between">
              <div>
                <h3 className="font-bold text-sm flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" />
                  <span>Raise Quality Rejection</span>
                </h3>
                <p className="text-xs text-red-100">
                  Machine {selectedMachineNo} &bull; {rejectionTargetOp.operationName}
                </p>
              </div>
              <button
                onClick={() => setShowRejectionModal(false)}
                className="text-red-200 hover:text-white transition p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmitRejection} className="p-5 space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Rejection Reason <span className="text-red-500">*</span>
                </label>
                <select
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value as any)}
                  className="w-full text-xs p-2 rounded-lg border border-slate-300 bg-white font-medium"
                >
                  {REJECTION_REASONS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Drawing / Specification Requirement
                </label>
                <input
                  type="text"
                  placeholder="e.g. 50.00 +/- 0.01 mm"
                  value={rejSpec}
                  onChange={(e) => setRejSpec(e.target.value)}
                  className="w-full text-xs p-2 rounded-lg border border-slate-300 bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Actual Finding / Observed Value <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 50.04 mm measured on digital height gauge"
                  value={rejFinding}
                  onChange={(e) => setRejFinding(e.target.value)}
                  className="w-full text-xs p-2 rounded-lg border border-slate-300 bg-white font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Concerned Department (Receives Notification) <span className="text-red-500">*</span>
                </label>
                <select
                  value={rejDept}
                  onChange={(e) => setRejDept(e.target.value)}
                  className="w-full text-xs p-2 rounded-lg border border-slate-300 bg-white font-medium"
                >
                  {INITIAL_DEPARTMENTS.map((d) => (
                    <option key={d.code} value={d.name}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Remarks / Inspector Notes
                </label>
                <textarea
                  rows={2}
                  placeholder="Detailed observations or defect instructions..."
                  value={rejRemarks}
                  onChange={(e) => setRejRemarks(e.target.value)}
                  className="w-full text-xs p-2 rounded-lg border border-slate-300 bg-white"
                />
              </div>

              <div className="pt-2 flex justify-end space-x-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowRejectionModal(false)}
                  className="px-3.5 py-2 text-xs text-slate-600 hover:bg-slate-100 rounded-lg font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingRejection}
                  className="px-4 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-lg shadow-sm disabled:opacity-50"
                >
                  {savingRejection ? 'Filing...' : 'Confirm Quality Rejection'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 7: SUBMIT CORRECTIVE ACTION MODAL */}
      {/* ========================================================================= */}
      {selectedRejectionForAction && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 overflow-hidden text-slate-900">
            <div className="p-4 bg-amber-600 text-white flex items-center justify-between">
              <h3 className="font-bold text-sm">Submit Corrective Action</h3>
              <button
                onClick={() => setSelectedRejectionForAction(null)}
                className="text-white hover:opacity-80 transition p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmitAction} className="p-5 space-y-3.5">
              <div className="text-xs text-slate-600 bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-1">
                <div><strong>Machine:</strong> {selectedRejectionForAction.machineNumber}</div>
                <div><strong>Operation:</strong> {selectedRejectionForAction.operationName}</div>
                <div><strong>Reason:</strong> {selectedRejectionForAction.rejectionReason}</div>
                {selectedRejectionForAction.actualFinding && (
                  <div><strong>Finding:</strong> {selectedRejectionForAction.actualFinding}</div>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Corrective Action Taken <span className="text-red-500">*</span>
                </label>
                <textarea
                  rows={3}
                  required
                  placeholder="Describe rework, machining adjustment, or replacement executed..."
                  value={correctiveActionText}
                  onChange={(e) => setCorrectiveActionText(e.target.value)}
                  className="w-full text-xs p-2 rounded-lg border border-slate-300 bg-white"
                />
              </div>

              <div className="pt-2 flex justify-end space-x-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setSelectedRejectionForAction(null)}
                  className="px-3.5 py-2 text-xs text-slate-600 hover:bg-slate-100 rounded-lg font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingAction}
                  className="px-4 py-2 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-lg shadow-sm disabled:opacity-50"
                >
                  {submittingAction ? 'Submitting...' : 'Submit to Quality'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 8: RE-INSPECTION MODAL */}
      {/* ========================================================================= */}
      {selectedRejectionForInspect && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 overflow-hidden text-slate-900">
            <div className="p-4 bg-blue-600 text-white flex items-center justify-between">
              <h3 className="font-bold text-sm">Quality Re-Inspection</h3>
              <button
                onClick={() => setSelectedRejectionForInspect(null)}
                className="text-white hover:opacity-80 transition p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleRecordReinspect} className="p-5 space-y-3.5">
              <div className="text-xs text-slate-600 bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-1">
                <div><strong>Machine:</strong> {selectedRejectionForInspect.machineNumber}</div>
                <div><strong>Operation:</strong> {selectedRejectionForInspect.operationName}</div>
                <div><strong>Action By Dept:</strong> {selectedRejectionForInspect.correctiveAction}</div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Re-Inspection Decision <span className="text-red-500">*</span>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setReinspectResult('Accepted')}
                    className={`p-2.5 text-xs font-bold rounded-lg border text-center transition ${
                      reinspectResult === 'Accepted'
                        ? 'bg-emerald-50 border-emerald-500 text-emerald-700 shadow-xs'
                        : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    Accept &amp; Close Issue
                  </button>

                  <button
                    type="button"
                    onClick={() => setReinspectResult('Rejected')}
                    className={`p-2.5 text-xs font-bold rounded-lg border text-center transition ${
                      reinspectResult === 'Rejected'
                        ? 'bg-red-50 border-red-500 text-red-700 shadow-xs'
                        : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    Reject Again
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Re-Inspection Remarks
                </label>
                <input
                  type="text"
                  placeholder="e.g. Dimensions re-measured within tolerance (50.00 mm)"
                  value={reinspectRemarks}
                  onChange={(e) => setReinspectRemarks(e.target.value)}
                  className="w-full text-xs p-2 rounded-lg border border-slate-300 bg-white"
                />
              </div>

              <div className="pt-2 flex justify-end space-x-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setSelectedRejectionForInspect(null)}
                  className="px-3.5 py-2 text-xs text-slate-600 hover:bg-slate-100 rounded-lg font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={recordingInspect}
                  className="px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm disabled:opacity-50"
                >
                  {recordingInspect ? 'Recording...' : 'Finalize Re-Inspection'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Modal for Machine-Level Quality Inspection (Hold, Reject, Accept) - Quality & Admin Only */}
      {selectedMachineForQCModal && isQualityUser && (
        <QualityInspectionDecisionModal
          isOpen={Boolean(selectedMachineForQCModal)}
          onClose={() => setSelectedMachineForQCModal(null)}
          machine={selectedMachineForQCModal}
          initialAction={qcModalInitialAction}
          onSuccess={(msg) => setToastMessage({ type: 'success', text: msg })}
        />
      )}
    </div>
  );
};
