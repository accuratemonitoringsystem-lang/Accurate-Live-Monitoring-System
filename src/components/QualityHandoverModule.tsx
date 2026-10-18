import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  Plus,
  Search,
  Filter,
  CheckCircle2,
  AlertTriangle,
  Clock,
  RotateCcw,
  PauseCircle,
  FileText,
  Building,
  User,
  Calendar,
  Eye,
  ArrowRight,
  Upload,
  ChevronRight,
  AlertOctagon,
  History,
  Check,
  X,
  Sparkles,
  ShieldAlert,
  Inbox,
  Send,
  Wrench,
  CheckSquare,
} from 'lucide-react';
import {
  Machine,
  Department,
  QualityHandover,
  QualityInspectionRecord,
  QualityHoldRecord,
  QualityCorrectiveActionRecord,
  QualityHandoverHistoryEntry,
  QualityHandoverStatus,
} from '../types';
import {
  subscribeQualityHandovers,
  createQualityHandover,
  qualityAcceptHandover,
  qualityRejectHandover,
  qualityHoldHandover,
  startCorrectiveAction,
  resubmitHandoverToQuality,
  subscribeQualityHandoverHistory,
  subscribeQualityInspections,
  subscribeQualityHolds,
  subscribeQualityCorrectiveActions,
} from '../services/db';
import { useAuth } from '../context/AuthContext';
import { isDepartmentMatch, hasQualityInspectionAccess } from '../utils/departmentUtils';
import { DEFECT_CATEGORIES, DefectCategory } from '../constants';

interface QualityHandoverModuleProps {
  currentDepartment: string;
  departments: Department[];
  machines: Machine[];
  isQualityView?: boolean;
}

export type QualityQueueTab =
  | 'incoming'
  | 'pending'
  | 'under_inspection'
  | 'accepted'
  | 'rejected'
  | 'hold'
  | 're_inspection'
  | 'closed'
  | 'history';

export type DepartmentQueueTab =
  | 'send_to_quality'
  | 'sent_to_quality'
  | 'pending_quality'
  | 'quality_accepted'
  | 'quality_rejected'
  | 'quality_hold'
  | 'rework_required'
  | 'resubmitted_to_quality'
  | 'handover_history';

export const QualityHandoverModule: React.FC<QualityHandoverModuleProps> = ({
  currentDepartment,
  departments,
  machines,
  isQualityView = false,
}) => {
  const { userProfile } = useAuth();
  const isAdmin = userProfile?.role === 'ADMIN';
  const isAuthorizedQualityUser = hasQualityInspectionAccess(userProfile);
  // Decision permissions are strictly tied to actual authenticated role, not UI view
  const isQualityUser = isAuthorizedQualityUser;

  const [handovers, setHandovers] = useState<QualityHandover[]>([]);
  const [loading, setLoading] = useState(true);

  // Tab states for Quality queue and Department queue
  const [activeQualityTab, setActiveQualityTab] = useState<QualityQueueTab>('incoming');
  const [activeDeptTab, setActiveDeptTab] = useState<DepartmentQueueTab>('sent_to_quality');
  const [searchQuery, setSearchQuery] = useState('');
  const [deptFilter, setDeptFilter] = useState(isAuthorizedQualityUser ? 'All' : currentDepartment);
  const [priorityFilter, setPriorityFilter] = useState('All');

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedHandoverForAccept, setSelectedHandoverForAccept] = useState<QualityHandover | null>(null);
  const [selectedHandoverForReject, setSelectedHandoverForReject] = useState<QualityHandover | null>(null);
  const [selectedHandoverForHold, setSelectedHandoverForHold] = useState<QualityHandover | null>(null);
  const [selectedHandoverForResubmit, setSelectedHandoverForResubmit] = useState<QualityHandover | null>(null);
  const [selectedHandoverForHistory, setSelectedHandoverForHistory] = useState<QualityHandover | null>(null);

  // Form states for Create Handover
  const [createMachineNo, setCreateMachineNo] = useState(machines[0]?.machineNumber || '');
  const [createSendingDept, setCreateSendingDept] = useState(
    currentDepartment === 'All Departments' || isQualityUser ? '06-A Metal Shop' : currentDepartment
  );
  const [createOperation, setCreateOperation] = useState('');
  const [createWork, setCreateWork] = useState('');
  const [createPartCode, setCreatePartCode] = useState('');
  const [createQty, setCreateQty] = useState<number>(1);
  const [createPriority, setCreatePriority] = useState<'Low' | 'Medium' | 'High' | 'Critical'>('Medium');
  const [createDate, setCreateDate] = useState(new Date().toISOString().split('T')[0]);
  const [createReqDate, setCreateReqDate] = useState('');
  const [createEmployee, setCreateEmployee] = useState(userProfile?.displayName || userProfile?.email || '');
  const [createRemarks, setCreateRemarks] = useState('');
  const [submittingCreate, setSubmittingCreate] = useState(false);

  // Accept Form
  const [acceptInspector, setAcceptInspector] = useState(userProfile?.displayName || userProfile?.email || 'Quality Inspector');
  const [acceptRemarks, setAcceptRemarks] = useState('');
  const [submittingAccept, setSubmittingAccept] = useState(false);

  // Reject Form
  const [rejectInspector, setRejectInspector] = useState(userProfile?.displayName || userProfile?.email || 'Quality Inspector');
  const [rejectDefectCategory, setRejectDefectCategory] = useState<DefectCategory>(
    DEFECT_CATEGORIES[0] || 'Dimensional'
  );
  const [rejectReason, setRejectReason] = useState('Dimension Out of Tolerance');
  const [rejectSpec, setRejectSpec] = useState('');
  const [rejectActual, setRejectActual] = useState('');
  const [rejectConcernedDept, setRejectConcernedDept] = useState('');
  const [rejectActionReq, setRejectActionReq] = useState('');
  const [rejectRemarks, setRejectRemarks] = useState('');
  const [submittingReject, setSubmittingReject] = useState(false);

  // Rework / Hold Form
  const [holdInspector, setHoldInspector] = useState(userProfile?.displayName || userProfile?.email || 'Quality Inspector');
  const [holdDefectCategory, setHoldDefectCategory] = useState<DefectCategory>(
    DEFECT_CATEGORIES[0] || 'Dimensional'
  );
  const [holdReason, setHoldReason] = useState('Correction / Rework Required');
  const [holdSpec, setHoldSpec] = useState('');
  const [holdActual, setHoldActual] = useState('');
  const [holdActionReq, setHoldActionReq] = useState('');
  const [holdConcernedDept, setHoldConcernedDept] = useState('');
  const [holdReviewDate, setHoldReviewDate] = useState('');
  const [holdRemarks, setHoldRemarks] = useState('');
  const [submittingHold, setSubmittingHold] = useState(false);

  // Resubmit / Corrective Action Form
  const [resubmitEmployee, setResubmitEmployee] = useState(userProfile?.displayName || userProfile?.email || '');
  const [resubmitActionTaken, setResubmitActionTaken] = useState('');
  const [resubmitRemarks, setResubmitRemarks] = useState('');
  const [submittingResubmit, setSubmittingResubmit] = useState(false);

  // History entries for selected handover
  const [historyEntries, setHistoryEntries] = useState<QualityHandoverHistoryEntry[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Subscribe to real-time Quality Handovers
  useEffect(() => {
    setLoading(true);
    const scope = isAdmin || isQualityUser ? undefined : currentDepartment;
    const unsub = subscribeQualityHandovers((data) => {
      setHandovers(data);
      setLoading(false);
    }, scope);
    return () => unsub();
  }, [currentDepartment, isAdmin, isQualityUser]);

  // Subscribe to History when modal opens
  useEffect(() => {
    if (!selectedHandoverForHistory) {
      setHistoryEntries([]);
      return;
    }
    setLoadingHistory(true);
    const unsub = subscribeQualityHandoverHistory(selectedHandoverForHistory.handoverId, (hist) => {
      setHistoryEntries(hist);
      setLoadingHistory(false);
    });
    return () => unsub();
  }, [selectedHandoverForHistory]);

  // Set default concerned department when opening reject modal
  useEffect(() => {
    if (selectedHandoverForReject) {
      setRejectConcernedDept(selectedHandoverForReject.sendingDepartment);
    }
  }, [selectedHandoverForReject]);

  // Filtered Handovers
  const filteredHandovers = handovers.filter((h) => {
    // Role & Department scope filter
    if (!isAdmin && !isAuthorizedQualityUser) {
      if (
        !isDepartmentMatch(h.sendingDepartment, currentDepartment) &&
        !isDepartmentMatch(h.receivingDepartment, currentDepartment)
      ) {
        return false;
      }
    } else if (deptFilter !== 'All') {
      if (
        !isDepartmentMatch(h.sendingDepartment, deptFilter) &&
        !isDepartmentMatch(h.receivingDepartment, deptFilter)
      ) {
        return false;
      }
    }

    // Priority filter
    if (priorityFilter !== 'All' && h.priority !== priorityFilter) {
      return false;
    }

    // Status Tab filter based on mode
    if (isAuthorizedQualityUser) {
      switch (activeQualityTab) {
        case 'incoming':
          // Active incoming queue awaiting inspection/decision
          if (h.status === 'ACCEPTED' || h.status === 'CLOSED') return false;
          break;
        case 'pending':
          if (h.status !== 'SENT_TO_QUALITY' && h.status !== 'RECEIVED') return false;
          break;
        case 'under_inspection':
          if (h.status !== 'UNDER_INSPECTION') return false;
          break;
        case 'accepted':
          if (h.status !== 'ACCEPTED') return false;
          break;
        case 'rejected':
          if (h.status !== 'REJECTED' && h.status !== 'CORRECTIVE_ACTION_IN_PROGRESS') return false;
          break;
        case 'hold':
          if (h.status !== 'HOLD' && h.status !== 'REWORK_REQUIRED') return false;
          break;
        case 're_inspection':
          if (h.status !== 'RESUBMITTED' && h.status !== 'REINSPECTION') return false;
          break;
        case 'closed':
          if (h.status !== 'CLOSED') return false;
          break;
        case 'history':
          // Shows all records
          break;
      }
    } else {
      switch (activeDeptTab) {
        case 'send_to_quality':
          // Shows all submissions ready
          break;
        case 'sent_to_quality':
          // All submissions by department
          break;
        case 'pending_quality':
          if (h.status !== 'SENT_TO_QUALITY' && h.status !== 'RECEIVED' && h.status !== 'UNDER_INSPECTION') return false;
          break;
        case 'quality_accepted':
          if (h.status !== 'ACCEPTED') return false;
          break;
        case 'quality_rejected':
          if (h.status !== 'REJECTED' && h.status !== 'CORRECTIVE_ACTION_IN_PROGRESS') return false;
          break;
        case 'quality_hold':
        case 'rework_required':
          if (h.status !== 'HOLD' && h.status !== 'REWORK_REQUIRED') return false;
          break;
        case 'resubmitted_to_quality':
          if (h.status !== 'RESUBMITTED' && h.status !== 'REINSPECTION') return false;
          break;
        case 'handover_history':
          // All submissions by department
          break;
      }
    }

    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const match =
        h.handoverId.toLowerCase().includes(q) ||
        h.machineNumber.toLowerCase().includes(q) ||
        h.operation.toLowerCase().includes(q) ||
        (h.machineModel && h.machineModel.toLowerCase().includes(q)) ||
        h.sendingDepartment.toLowerCase().includes(q) ||
        (h.employee && h.employee.toLowerCase().includes(q)) ||
        (h.remarks && h.remarks.toLowerCase().includes(q)) ||
        (h.rejectionReason && h.rejectionReason.toLowerCase().includes(q));
      if (!match) return false;
    }

    return true;
  });

  // Quality KPI calculations
  const totalCount = handovers.length;
  const incomingCount = handovers.filter(
    (h) => h.status !== 'ACCEPTED' && h.status !== 'CLOSED'
  ).length;
  const pendingCount = handovers.filter(
    (h) => h.status === 'SENT_TO_QUALITY' || h.status === 'RECEIVED'
  ).length;
  const underInspectionCount = handovers.filter(
    (h) => h.status === 'UNDER_INSPECTION'
  ).length;
  const acceptedCount = handovers.filter((h) => h.status === 'ACCEPTED').length;
  const rejectedCount = handovers.filter(
    (h) => h.status === 'REJECTED' || h.status === 'CORRECTIVE_ACTION_IN_PROGRESS'
  ).length;
  const reworkCount = handovers.filter((h) => h.status === 'REWORK_REQUIRED' || h.status === 'HOLD').length;
  const holdCount = reworkCount;
  const resubmittedCount = handovers.filter(
    (h) => h.status === 'RESUBMITTED' || h.status === 'REINSPECTION'
  ).length;
  const closedCount = handovers.filter((h) => h.status === 'CLOSED').length;

  // Department counts
  const deptSentCount = handovers.length;
  const deptPendingCount = handovers.filter(
    (h) => h.status === 'SENT_TO_QUALITY' || h.status === 'RECEIVED' || h.status === 'UNDER_INSPECTION'
  ).length;
  const deptAcceptedCount = handovers.filter((h) => h.status === 'ACCEPTED').length;
  const deptRejectedCount = handovers.filter(
    (h) => h.status === 'REJECTED' || h.status === 'CORRECTIVE_ACTION_IN_PROGRESS'
  ).length;
  const deptReworkCount = handovers.filter((h) => h.status === 'REWORK_REQUIRED' || h.status === 'HOLD').length;
  const deptHoldCount = deptReworkCount;
  const deptResubmittedCount = handovers.filter(
    (h) => h.status === 'RESUBMITTED' || h.status === 'REINSPECTION'
  ).length;

  // Modal Opener Guards - Prevents unauthorized triggers
  const openAcceptModal = (h: QualityHandover) => {
    if (!isAuthorizedQualityUser) {
      alert('ACCESS DENIED: Quality decisions are strictly restricted to Quality and Admin.');
      return;
    }
    if (h.status === 'ACCEPTED' || h.status === 'CLOSED') {
      alert(`Handover ${h.handoverId} is already ${h.status} and cannot be decided again.`);
      return;
    }
    setSelectedHandoverForAccept(h);
  };

  const openRejectModal = (h: QualityHandover) => {
    if (!isAuthorizedQualityUser) {
      alert('ACCESS DENIED: Quality decisions are strictly restricted to Quality and Admin.');
      return;
    }
    if (h.status === 'ACCEPTED' || h.status === 'CLOSED') {
      alert(`Handover ${h.handoverId} is already ${h.status} and cannot be rejected.`);
      return;
    }
    setSelectedHandoverForReject(h);
  };

  const openHoldModal = (h: QualityHandover) => {
    if (!isAuthorizedQualityUser) {
      alert('ACCESS DENIED: Quality decisions are strictly restricted to Quality and Admin.');
      return;
    }
    if (h.status === 'ACCEPTED' || h.status === 'CLOSED') {
      alert(`Handover ${h.handoverId} is already ${h.status} and cannot be sent for rework.`);
      return;
    }
    setSelectedHandoverForHold(h);
    setHoldConcernedDept(h.sendingDepartment || (departments[0]?.name ?? ''));
    setHoldSpec(h.specification || '');
    setHoldActual(h.actualFinding || '');
    setHoldActionReq(h.correctiveActionRequired || '');
    setHoldReviewDate('');
    setHoldRemarks('');
  };

  // Active rejected handovers needing corrective action for non-quality departments
  const rejectedHandoversNeedingAction = handovers.filter(
    (h) =>
      (h.status === 'REJECTED' || h.status === 'REWORK_REQUIRED') &&
      (isAdmin || isDepartmentMatch(h.sendingDepartment, currentDepartment))
  );

  // Handlers
  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createMachineNo || !createOperation.trim()) return;

    setSubmittingCreate(true);
    try {
      const selectedMach = machines.find((m) => m.machineNumber === createMachineNo);
      await createQualityHandover(
        {
          machineNumber: createMachineNo,
          machineModel: selectedMach?.model || '',
          project: selectedMach?.project || '',
          customer: selectedMach?.customer || '',
          sendingDepartment: createSendingDept,
          receivingDepartment: '04 Inward Quality',
          employee: createEmployee.trim() || userProfile?.displayName || userProfile?.email || 'Operator',
          work: createWork.trim() || '',
          operation: createOperation.trim(),
          partCode: createPartCode.trim() || '',
          quantity: Number(createQty) || 1,
          handoverDate: createDate,
          requiredInspectionDate: createReqDate || '',
          priority: createPriority,
          remarks: createRemarks.trim() || '',
        },
        userProfile?.email
      );

      setShowCreateModal(false);
      setCreateOperation('');
      setCreateWork('');
      setCreatePartCode('');
      setCreateRemarks('');
    } catch (err) {
      console.error('Failed to create Quality Handover:', err);
      alert('Failed to dispatch handover to Quality. Please try again.');
    } finally {
      setSubmittingCreate(false);
    }
  };

  const handleAcceptSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAuthorizedQualityUser) {
      alert('ACCESS DENIED: Quality decisions are strictly restricted to Quality and Admin.');
      return;
    }
    if (!selectedHandoverForAccept) return;

    setSubmittingAccept(true);
    try {
      await qualityAcceptHandover(
        selectedHandoverForAccept.id,
        {
          inspector: acceptInspector.trim() || userProfile?.displayName || 'Quality Inspector',
          remarks: acceptRemarks.trim() || '',
        },
        userProfile?.email
      );
      setSelectedHandoverForAccept(null);
      setAcceptRemarks('');
    } catch (err: any) {
      console.error('Failed to accept handover:', err);
      alert(err.message || 'Failed to record quality acceptance.');
    } finally {
      setSubmittingAccept(false);
    }
  };

  const handleRejectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAuthorizedQualityUser) {
      alert('ACCESS DENIED: Quality decisions are strictly restricted to Quality and Admin.');
      return;
    }
    if (!selectedHandoverForReject) return;
    if (!rejectDefectCategory) {
      alert('Please select a Defect Category before submitting rejection.');
      return;
    }

    setSubmittingReject(true);
    try {
      await qualityRejectHandover(
        selectedHandoverForReject.id,
        {
          inspector: rejectInspector.trim() || userProfile?.displayName || 'Quality Inspector',
          defectCategory: rejectDefectCategory,
          reason: rejectReason,
          specification: rejectSpec.trim() || '',
          actualFinding: rejectActual.trim() || '',
          concernedDepartment: rejectConcernedDept || selectedHandoverForReject.sendingDepartment,
          correctiveActionRequired: rejectActionReq.trim() || '',
          remarks: rejectRemarks.trim() || '',
        },
        userProfile?.email
      );
      setSelectedHandoverForReject(null);
      setRejectSpec('');
      setRejectActual('');
      setRejectActionReq('');
      setRejectRemarks('');
    } catch (err: any) {
      console.error('Failed to record rejection:', err);
      alert(err.message || 'Failed to record quality rejection.');
    } finally {
      setSubmittingReject(false);
    }
  };

  const handleHoldSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAuthorizedQualityUser) {
      alert('ACCESS DENIED: Quality decisions are strictly restricted to Quality and Admin.');
      return;
    }
    if (!selectedHandoverForHold) return;
    if (!holdDefectCategory) {
      alert('Please select a Defect Category before sending for rework.');
      return;
    }

    setSubmittingHold(true);
    try {
      await qualityHoldHandover(
        selectedHandoverForHold.id,
        {
          inspector: holdInspector.trim() || userProfile?.displayName || 'Quality Inspector',
          defectCategory: holdDefectCategory,
          reason: holdReason,
          defectDescription: holdReason,
          specification: holdSpec.trim(),
          expectedValue: holdSpec.trim(),
          actualFinding: holdActual.trim(),
          correctiveActionRequired: holdActionReq.trim() || `Rework required for ${holdDefectCategory}`,
          concernedDepartment: holdConcernedDept || selectedHandoverForHold.sendingDepartment,
          expectedReviewDate: holdReviewDate || '',
          remarks: holdRemarks.trim() || '',
        },
        userProfile?.email
      );
      setSelectedHandoverForHold(null);
      setHoldReviewDate('');
      setHoldRemarks('');
      setHoldSpec('');
      setHoldActual('');
      setHoldActionReq('');
    } catch (err: any) {
      console.error('Failed to place on rework:', err);
      alert(err.message || 'Failed to record rework decision.');
    } finally {
      setSubmittingHold(false);
    }
  };

  const handleResubmitSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedHandoverForResubmit) return;

    setSubmittingResubmit(true);
    try {
      // 1. Log corrective action details
      await startCorrectiveAction(
        selectedHandoverForResubmit.id,
        {
          originalIssue: selectedHandoverForResubmit.rejectionReason || 'Defect reported by Quality',
          correctiveAction: resubmitActionTaken.trim() || 'Defect reworked to specification',
          actionTaken: resubmitActionTaken.trim() || 'Rework completed',
          responsibleEmployee: resubmitEmployee.trim() || userProfile?.displayName || 'Operator',
          completionDate: new Date().toISOString().split('T')[0],
          remarks: resubmitRemarks.trim() || '',
        },
        userProfile?.email
      );

      // 2. Resubmit to Quality (advances cycle, notifies Quality)
      await resubmitHandoverToQuality(
        selectedHandoverForResubmit.id,
        {
          employee: resubmitEmployee.trim() || userProfile?.displayName || 'Operator',
          actionTaken: resubmitActionTaken.trim() || '',
          remarks: resubmitRemarks.trim() || '',
        },
        userProfile?.email
      );

      setSelectedHandoverForResubmit(null);
      setResubmitActionTaken('');
      setResubmitRemarks('');
    } catch (err) {
      console.error('Failed to resubmit handover to Quality:', err);
      alert('Failed to resubmit work to Quality.');
    } finally {
      setSubmittingResubmit(false);
    }
  };

  const getStatusBadge = (status: QualityHandoverStatus) => {
    switch (status) {
      case 'ACCEPTED':
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
            <Check className="w-3.5 h-3.5 mr-1 text-emerald-700" />
            <span>Accepted &mdash; Quality accepted the work</span>
          </span>
        );
      case 'REJECTED':
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-100 text-rose-800 border border-rose-300">
            <AlertOctagon className="w-3.5 h-3.5 mr-1 text-rose-700" />
            <span>Rejected &mdash; Non-conformance</span>
          </span>
        );
      case 'REWORK_REQUIRED':
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
            <Wrench className="w-3.5 h-3.5 mr-1 text-amber-700" />
            <span>REWORK REQUIRED &mdash; Sent back for correction</span>
          </span>
        );
      case 'HOLD':
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
            <PauseCircle className="w-3.5 h-3.5 mr-1 text-amber-700" />
            <span>Rework (legacy Hold) &mdash; Awaiting review</span>
          </span>
        );
      case 'RESUBMITTED':
      case 'REINSPECTION':
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold bg-purple-100 text-purple-800 border border-purple-300 animate-pulse">
            <RotateCcw className="w-3.5 h-3.5 mr-1 text-purple-700" />
            <span>Re-inspection &mdash; Resubmitted work is awaiting Quality</span>
          </span>
        );
      case 'UNDER_INSPECTION':
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold bg-indigo-100 text-indigo-800 border border-indigo-300">
            <Clock className="w-3.5 h-3.5 mr-1 text-indigo-700" />
            <span>Under Inspection &mdash; Quality is inspecting</span>
          </span>
        );
      case 'CLOSED':
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold bg-slate-200 text-slate-800 border border-slate-300">
            <Check className="w-3.5 h-3.5 mr-1 text-slate-600" />
            <span>Closed &mdash; Completed &amp; archived</span>
          </span>
        );
      case 'SENT_TO_QUALITY':
      case 'RECEIVED':
      default:
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold bg-blue-100 text-blue-800 border border-blue-300">
            <Clock className="w-3.5 h-3.5 mr-1 text-blue-700" />
            <span>Pending Quality &mdash; Awaiting inspection</span>
          </span>
        );
    }
  };

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case 'Critical':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-red-600 text-white">
            CRITICAL
          </span>
        );
      case 'High':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500 text-white">
            HIGH
          </span>
        );
      case 'Low':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-200 text-slate-700">
            LOW
          </span>
        );
      case 'Medium':
      default:
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-100 text-blue-800">
            MEDIUM
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center space-x-2">
            <ShieldCheck className="w-6 h-6 text-indigo-600" />
            <h2 className="text-xl font-black text-slate-900 tracking-tight">
              {isQualityUser ? 'Quality Receiving & Inspection Hub' : 'Quality Handover Hub'}
            </h2>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            {isQualityUser
              ? 'Central receiving deck: accept, reject, rework, and inspect all department handovers'
              : `Hand over completed machine operations to Quality, track inspection results, and manage rework`}
          </p>
        </div>

        <div className="flex items-center space-x-2">
          {/* Always allow creating a new Quality Handover */}
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-xs flex items-center space-x-1.5 transition"
          >
            <Plus className="w-4 h-4" />
            <span>+ Send to Quality</span>
          </button>
        </div>
      </div>

      {/* Critical Rejection Alert Banner for Shop Floor */}
      {!isQualityUser && rejectedHandoversNeedingAction.length > 0 && (
        <div className="p-4 bg-red-50 border-2 border-red-300 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-3 animate-fade-in shadow-xs">
          <div className="flex items-start space-x-3">
            <AlertOctagon className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <div>
              <h4 className="text-xs font-black text-red-900 uppercase tracking-wider">
                Attention: {rejectedHandoversNeedingAction.length} Quality Rejection(s) Require Action
              </h4>
              <p className="text-xs text-red-700 mt-0.5">
                Quality has reported defects or non-compliance on work handed over by your department. Perform corrective action and resubmit to Quality.
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2 shrink-0">
            <button
              onClick={() => setActiveDeptTab('quality_rejected')}
              className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-lg transition"
            >
              View Rejected Items &rarr;
            </button>
          </div>
        </div>
      )}

      {/* Tab Navigation Bars (Quality and Department Specific) */}
      <div className="bg-white p-2.5 rounded-2xl border border-slate-200 shadow-xs">
        {isQualityUser ? (
          /* QUALITY DEPARTMENT & ADMIN TABS (Requirement 2) */
          <div className="flex items-center space-x-1.5 overflow-x-auto pb-1 scrollbar-thin">
            <button
              onClick={() => setActiveQualityTab('incoming')}
              className={`px-3.5 py-2 text-xs font-bold rounded-xl transition flex items-center space-x-1.5 whitespace-nowrap ${
                activeQualityTab === 'incoming'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <Inbox className="w-3.5 h-3.5" />
              <span>Incoming</span>
              <span
                className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono ${
                  activeQualityTab === 'incoming' ? 'bg-indigo-700 text-white' : 'bg-slate-100 text-slate-700'
                }`}
              >
                {incomingCount}
              </span>
            </button>

            <button
              onClick={() => setActiveQualityTab('pending')}
              className={`px-3.5 py-2 text-xs font-bold rounded-xl transition flex items-center space-x-1.5 whitespace-nowrap ${
                activeQualityTab === 'pending'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>Pending Inspection</span>
              <span
                className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono ${
                  activeQualityTab === 'pending' ? 'bg-blue-700 text-white' : 'bg-slate-100 text-slate-700'
                }`}
              >
                {pendingCount}
              </span>
            </button>

            <button
              onClick={() => setActiveQualityTab('under_inspection')}
              className={`px-3.5 py-2 text-xs font-bold rounded-xl transition flex items-center space-x-1.5 whitespace-nowrap ${
                activeQualityTab === 'under_inspection'
                  ? 'bg-indigo-700 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Under Inspection</span>
              <span
                className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono ${
                  activeQualityTab === 'under_inspection' ? 'bg-indigo-800 text-white' : 'bg-slate-100 text-slate-700'
                }`}
              >
                {underInspectionCount}
              </span>
            </button>

            <button
              onClick={() => setActiveQualityTab('accepted')}
              className={`px-3.5 py-2 text-xs font-bold rounded-xl transition flex items-center space-x-1.5 whitespace-nowrap ${
                activeQualityTab === 'accepted'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <Check className="w-3.5 h-3.5" />
              <span>Accepted</span>
              <span
                className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono ${
                  activeQualityTab === 'accepted' ? 'bg-emerald-700 text-white' : 'bg-slate-100 text-slate-700'
                }`}
              >
                {acceptedCount}
              </span>
            </button>

            <button
              onClick={() => setActiveQualityTab('rejected')}
              className={`px-3.5 py-2 text-xs font-bold rounded-xl transition flex items-center space-x-1.5 whitespace-nowrap ${
                activeQualityTab === 'rejected'
                  ? 'bg-rose-600 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <AlertOctagon className="w-3.5 h-3.5" />
              <span>Rejected</span>
              <span
                className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono ${
                  activeQualityTab === 'rejected' ? 'bg-rose-700 text-white' : 'bg-slate-100 text-slate-700'
                }`}
              >
                {rejectedCount}
              </span>
            </button>

            <button
              onClick={() => setActiveQualityTab('hold')}
              className={`px-3.5 py-2 text-xs font-bold rounded-xl transition flex items-center space-x-1.5 whitespace-nowrap ${
                activeQualityTab === 'hold'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <Wrench className="w-3.5 h-3.5" />
              <span>Rework Required</span>
              <span
                className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono ${
                  activeQualityTab === 'hold' ? 'bg-amber-700 text-white' : 'bg-slate-100 text-slate-700'
                }`}
              >
                {reworkCount}
              </span>
            </button>

            <button
              onClick={() => setActiveQualityTab('re_inspection')}
              className={`px-3.5 py-2 text-xs font-bold rounded-xl transition flex items-center space-x-1.5 whitespace-nowrap ${
                activeQualityTab === 're_inspection'
                  ? 'bg-purple-600 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Re-inspection</span>
              <span
                className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono ${
                  activeQualityTab === 're_inspection' ? 'bg-purple-700 text-white' : 'bg-slate-100 text-slate-700'
                }`}
              >
                {resubmittedCount}
              </span>
            </button>

            <button
              onClick={() => setActiveQualityTab('closed')}
              className={`px-3.5 py-2 text-xs font-bold rounded-xl transition flex items-center space-x-1.5 whitespace-nowrap ${
                activeQualityTab === 'closed'
                  ? 'bg-slate-700 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <CheckSquare className="w-3.5 h-3.5" />
              <span>Closed</span>
              <span
                className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono ${
                  activeQualityTab === 'closed' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-700'
                }`}
              >
                {closedCount}
              </span>
            </button>

            <button
              onClick={() => setActiveQualityTab('history')}
              className={`px-3.5 py-2 text-xs font-bold rounded-xl transition flex items-center space-x-1.5 whitespace-nowrap ${
                activeQualityTab === 'history'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              <span>Quality History</span>
              <span
                className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono ${
                  activeQualityTab === 'history' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-700'
                }`}
              >
                {totalCount}
              </span>
            </button>
          </div>
        ) : (
          /* NORMAL PRODUCTION DEPARTMENT TABS (Requirement 3) */
          <div className="flex items-center space-x-1.5 overflow-x-auto pb-1 scrollbar-thin">
            <button
              onClick={() => setActiveDeptTab('send_to_quality')}
              className={`px-3.5 py-2 text-xs font-bold rounded-xl transition flex items-center space-x-1.5 whitespace-nowrap ${
                activeDeptTab === 'send_to_quality'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-blue-700 bg-blue-50 hover:bg-blue-100'
              }`}
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Send to Quality</span>
            </button>

            <button
              onClick={() => setActiveDeptTab('sent_to_quality')}
              className={`px-3.5 py-2 text-xs font-bold rounded-xl transition flex items-center space-x-1.5 whitespace-nowrap ${
                activeDeptTab === 'sent_to_quality'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <Send className="w-3.5 h-3.5" />
              <span>Sent to Quality</span>
              <span
                className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono ${
                  activeDeptTab === 'sent_to_quality' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-700'
                }`}
              >
                {deptSentCount}
              </span>
            </button>

            <button
              onClick={() => setActiveDeptTab('pending_quality')}
              className={`px-3.5 py-2 text-xs font-bold rounded-xl transition flex items-center space-x-1.5 whitespace-nowrap ${
                activeDeptTab === 'pending_quality'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>Pending Quality</span>
              <span
                className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono ${
                  activeDeptTab === 'pending_quality' ? 'bg-blue-700 text-white' : 'bg-slate-100 text-slate-700'
                }`}
              >
                {deptPendingCount}
              </span>
            </button>

            <button
              onClick={() => setActiveDeptTab('quality_accepted')}
              className={`px-3.5 py-2 text-xs font-bold rounded-xl transition flex items-center space-x-1.5 whitespace-nowrap ${
                activeDeptTab === 'quality_accepted'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <Check className="w-3.5 h-3.5" />
              <span>Quality Accepted</span>
              <span
                className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono ${
                  activeDeptTab === 'quality_accepted' ? 'bg-emerald-700 text-white' : 'bg-slate-100 text-slate-700'
                }`}
              >
                {deptAcceptedCount}
              </span>
            </button>

            <button
              onClick={() => setActiveDeptTab('quality_rejected')}
              className={`px-3.5 py-2 text-xs font-bold rounded-xl transition flex items-center space-x-1.5 whitespace-nowrap ${
                activeDeptTab === 'quality_rejected'
                  ? 'bg-rose-600 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <AlertOctagon className="w-3.5 h-3.5" />
              <span>Quality Rejected</span>
              <span
                className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono ${
                  activeDeptTab === 'quality_rejected' ? 'bg-rose-700 text-white' : 'bg-slate-100 text-slate-700'
                }`}
              >
                {deptRejectedCount}
              </span>
            </button>

            <button
              onClick={() => setActiveDeptTab('rework_required')}
              className={`px-3.5 py-2 text-xs font-bold rounded-xl transition flex items-center space-x-1.5 whitespace-nowrap ${
                activeDeptTab === 'rework_required' || activeDeptTab === 'quality_hold'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <Wrench className="w-3.5 h-3.5" />
              <span>Rework Required</span>
              <span
                className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono ${
                  activeDeptTab === 'rework_required' || activeDeptTab === 'quality_hold'
                    ? 'bg-amber-700 text-white'
                    : 'bg-slate-100 text-slate-700'
                }`}
              >
                {deptReworkCount}
              </span>
            </button>

            <button
              onClick={() => setActiveDeptTab('resubmitted_to_quality')}
              className={`px-3.5 py-2 text-xs font-bold rounded-xl transition flex items-center space-x-1.5 whitespace-nowrap ${
                activeDeptTab === 'resubmitted_to_quality'
                  ? 'bg-purple-600 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Resubmitted to Quality</span>
              <span
                className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono ${
                  activeDeptTab === 'resubmitted_to_quality' ? 'bg-purple-700 text-white' : 'bg-slate-100 text-slate-700'
                }`}
              >
                {deptResubmittedCount}
              </span>
            </button>

            <button
              onClick={() => setActiveDeptTab('handover_history')}
              className={`px-3.5 py-2 text-xs font-bold rounded-xl transition flex items-center space-x-1.5 whitespace-nowrap ${
                activeDeptTab === 'handover_history'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              <span>Handover History</span>
              <span
                className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono ${
                  activeDeptTab === 'handover_history' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-700'
                }`}
              >
                {deptSentCount}
              </span>
            </button>
          </div>
        )}
      </div>

      {/* KPI Stat Cards (Interactive quick-filter shortcuts) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div
          onClick={() => {
            if (isQualityUser) setActiveQualityTab('history');
            else setActiveDeptTab('sent_to_quality');
          }}
          className={`p-3.5 bg-white rounded-xl border cursor-pointer transition shadow-xs ${
            (isQualityUser && activeQualityTab === 'history') || (!isQualityUser && activeDeptTab === 'sent_to_quality')
              ? 'border-indigo-600 ring-2 ring-indigo-50'
              : 'border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Handovers</div>
          <div className="text-xl font-black text-slate-900 mt-1 font-mono">{totalCount}</div>
          <div className="text-[10px] text-slate-500 mt-0.5">All recorded</div>
        </div>

        <div
          onClick={() => {
            if (isQualityUser) setActiveQualityTab('under_inspection');
            else setActiveDeptTab('pending_quality');
          }}
          className={`p-3.5 bg-white rounded-xl border cursor-pointer transition shadow-xs ${
            (isQualityUser && activeQualityTab === 'under_inspection') || (!isQualityUser && activeDeptTab === 'pending_quality')
              ? 'border-blue-600 ring-2 ring-blue-50'
              : 'border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="text-[10px] font-bold text-blue-600 uppercase tracking-wider">Under Inspection</div>
          <div className="text-xl font-black text-blue-600 mt-1 font-mono">{isQualityUser ? underInspectionCount : deptPendingCount}</div>
          <div className="text-[10px] text-slate-500 mt-0.5">Inspection in progress</div>
        </div>

        <div
          onClick={() => {
            if (isQualityUser) setActiveQualityTab('re_inspection');
            else setActiveDeptTab('resubmitted_to_quality');
          }}
          className={`p-3.5 bg-white rounded-xl border cursor-pointer transition shadow-xs ${
            (isQualityUser && activeQualityTab === 're_inspection') || (!isQualityUser && activeDeptTab === 'resubmitted_to_quality')
              ? 'border-purple-600 ring-2 ring-purple-50'
              : 'border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="text-[10px] font-bold text-purple-600 uppercase tracking-wider">Resubmitted</div>
          <div className="text-xl font-black text-purple-600 mt-1 font-mono">{resubmittedCount}</div>
          <div className="text-[10px] text-slate-500 mt-0.5">Re-inspection priority</div>
        </div>

        <div
          onClick={() => {
            if (isQualityUser) setActiveQualityTab('accepted');
            else setActiveDeptTab('quality_accepted');
          }}
          className={`p-3.5 bg-white rounded-xl border cursor-pointer transition shadow-xs ${
            (isQualityUser && activeQualityTab === 'accepted') || (!isQualityUser && activeDeptTab === 'quality_accepted')
              ? 'border-emerald-600 ring-2 ring-emerald-50'
              : 'border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">Accepted</div>
          <div className="text-xl font-black text-emerald-600 mt-1 font-mono">{acceptedCount}</div>
          <div className="text-[10px] text-slate-500 mt-0.5">Passed Quality</div>
        </div>

        <div
          onClick={() => {
            if (isQualityUser) setActiveQualityTab('rejected');
            else setActiveDeptTab('quality_rejected');
          }}
          className={`p-3.5 bg-white rounded-xl border cursor-pointer transition shadow-xs ${
            (isQualityUser && activeQualityTab === 'rejected') || (!isQualityUser && activeDeptTab === 'quality_rejected')
              ? 'border-red-600 ring-2 ring-red-50'
              : 'border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="text-[10px] font-bold text-red-600 uppercase tracking-wider">Rejected</div>
          <div className="text-xl font-black text-red-600 mt-1 font-mono">{rejectedCount}</div>
          <div className="text-[10px] text-slate-500 mt-0.5">Rework required</div>
        </div>

        <div
          onClick={() => {
            if (isQualityUser) setActiveQualityTab('hold');
            else setActiveDeptTab('rework_required');
          }}
          className={`p-3.5 bg-white rounded-xl border cursor-pointer transition shadow-xs ${
            (isQualityUser && activeQualityTab === 'hold') || (!isQualityUser && (activeDeptTab === 'rework_required' || activeDeptTab === 'quality_hold'))
              ? 'border-amber-600 ring-2 ring-amber-50'
              : 'border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="text-[10px] font-bold text-amber-600 uppercase tracking-wider">Rework Required</div>
          <div className="text-xl font-black text-amber-600 mt-1 font-mono">{reworkCount}</div>
          <div className="text-[10px] text-slate-500 mt-0.5">Sent back for correction</div>
        </div>
      </div>

      {/* DEPARTMENT SCREEN: Dedicated In-Tab Send to Quality View (Section 3 Requirement) */}
      {!isQualityUser && activeDeptTab === 'send_to_quality' && (
        <div className="bg-white p-5 rounded-2xl border-2 border-blue-200 shadow-sm animate-fade-in space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div>
              <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
                <Send className="w-4 h-4 text-blue-600" />
                <span>Send Completed Operation / Machine to Quality</span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Submit completed department work to Quality inspection. Once submitted, Quality will inspect and record formal acceptance, rejection, or rework.
              </p>
            </div>
            <span className="px-2.5 py-1 bg-blue-50 text-blue-700 text-xs font-bold rounded-lg border border-blue-200">
              {currentDepartment}
            </span>
          </div>

          <form onSubmit={handleCreateSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Machine Number <span className="text-red-500">*</span>
                </label>
                {machines.length === 0 ? (
                  <input
                    type="text"
                    required
                    placeholder="e.g. 2523"
                    value={createMachineNo}
                    onChange={(e) => setCreateMachineNo(e.target.value)}
                    className="w-full text-xs p-2 rounded-lg border border-slate-300 font-bold"
                  />
                ) : (
                  <select
                    value={createMachineNo}
                    onChange={(e) => setCreateMachineNo(e.target.value)}
                    className="w-full text-xs p-2 rounded-lg border border-slate-300 font-bold bg-white"
                  >
                    {machines.map((m) => (
                      <option key={m.id} value={m.machineNumber}>
                        Machine {m.machineNumber} ({m.model})
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Completed Operation <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Rough Milling, Bed Lapping, Final Assembly"
                  value={createOperation}
                  onChange={(e) => setCreateOperation(e.target.value)}
                  className="w-full text-xs p-2 rounded-lg border border-slate-300 font-bold"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Part Code / Component
                </label>
                <input
                  type="text"
                  placeholder="e.g. BASE-2523-REV2"
                  value={createPartCode}
                  onChange={(e) => setCreatePartCode(e.target.value)}
                  className="w-full text-xs p-2 rounded-lg border border-slate-300"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Quantity
                </label>
                <input
                  type="number"
                  min="1"
                  value={createQty}
                  onChange={(e) => setCreateQty(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-full text-xs p-2 rounded-lg border border-slate-300"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Priority
                </label>
                <select
                  value={createPriority}
                  onChange={(e) => setCreatePriority(e.target.value as any)}
                  className="w-full text-xs p-2 rounded-lg border border-slate-300 bg-white"
                >
                  <option value="Low">Low</option>
                  <option value="Medium">Medium</option>
                  <option value="High">High</option>
                  <option value="Critical">Critical</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Submitting Employee / Operator
                </label>
                <input
                  type="text"
                  placeholder="Employee name"
                  value={createEmployee}
                  onChange={(e) => setCreateEmployee(e.target.value)}
                  className="w-full text-xs p-2 rounded-lg border border-slate-300"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Handover Date
                </label>
                <input
                  type="date"
                  value={createDate}
                  onChange={(e) => setCreateDate(e.target.value)}
                  className="w-full text-xs p-2 rounded-lg border border-slate-300"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Operation Completion Notes / Remarks
              </label>
              <input
                type="text"
                placeholder="e.g. Dimensions machined within master tolerance, deburred and cleaned, ready for Inward Quality inspection."
                value={createRemarks}
                onChange={(e) => setCreateRemarks(e.target.value)}
                className="w-full text-xs p-2 rounded-lg border border-slate-300"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="submit"
                disabled={submittingCreate}
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-xs transition flex items-center gap-1.5 disabled:opacity-50"
              >
                <Send className="w-4 h-4" />
                <span>{submittingCreate ? 'Dispatching to Quality...' : 'Dispatch to Quality Queue'}</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5 text-xs">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search Handover ID, Machine, Operation..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-blue-500 w-64"
            />
          </div>

          {(isAdmin || isQualityUser) && (
            <div className="flex items-center space-x-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase">Dept:</span>
              <select
                value={deptFilter}
                onChange={(e) => setDeptFilter(e.target.value)}
                className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-700"
              >
                <option value="All">All Departments</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.name}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="flex items-center space-x-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase">Priority:</span>
            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
              className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-700"
            >
              <option value="All">All Priorities</option>
              <option value="Critical">Critical</option>
              <option value="High">High</option>
              <option value="Medium">Medium</option>
              <option value="Low">Low</option>
            </select>
          </div>
        </div>

        <div className="flex items-center space-x-1 text-xs font-bold text-slate-500">
          <span>Showing {filteredHandovers.length} records</span>
        </div>
      </div>

      {/* Main Table / Grid of Quality Handovers */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
        {loading ? (
          <div className="p-12 text-center text-xs text-slate-400">Loading Quality Handovers...</div>
        ) : filteredHandovers.length === 0 ? (
          <div className="p-12 text-center text-xs text-slate-400 space-y-2">
            <ShieldCheck className="w-8 h-8 text-slate-300 mx-auto" />
            <div className="font-bold text-slate-600">No Quality Handovers found in this queue.</div>
            <p>Click &ldquo;+ Send to Quality&rdquo; above to dispatch an inspection handover.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="p-3">Handover ID</th>
                  <th className="p-3">Machine &amp; Model</th>
                  <th className="p-3">Operation &amp; Part</th>
                  <th className="p-3">Sending Dept</th>
                  <th className="p-3">Date</th>
                  <th className="p-3">Priority</th>
                  <th className="p-3">Cycle</th>
                  <th className="p-3">Status</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredHandovers.map((h) => {
                  const isOriginator = isAdmin || h.sendingDepartment === currentDepartment;
                  const isRejected =
                    h.status === 'REJECTED' || h.status === 'REWORK_REQUIRED' || h.status === 'HOLD';

                  return (
                    <tr key={h.id} className="hover:bg-slate-50/80 transition">
                      {/* ID */}
                      <td className="p-3 font-mono font-bold text-slate-900">
                        <button
                          onClick={() => setSelectedHandoverForHistory(h)}
                          className="hover:underline text-indigo-600 flex items-center space-x-1"
                          title="Click to view full handover details"
                        >
                          <span>{h.handoverId}</span>
                        </button>
                      </td>

                      {/* Machine */}
                      <td className="p-3">
                        <div className="font-bold text-slate-900">Machine {h.machineNumber}</div>
                        {h.machineModel && (
                          <div className="text-[10px] text-slate-500">{h.machineModel}</div>
                        )}
                        {h.customer && (
                          <div className="text-[10px] text-slate-400">Cust: {h.customer}</div>
                        )}
                      </td>

                      {/* Operation */}
                      <td className="p-3">
                        <div className="font-semibold text-slate-800">{h.operation}</div>
                        {h.partCode && (
                          <div className="text-[10px] font-mono text-slate-500">Part: {h.partCode}</div>
                        )}
                        {h.quantity > 1 && (
                          <div className="text-[10px] text-slate-500">Qty: {h.quantity}</div>
                        )}
                        {h.defectCategory && (
                          <div className="text-[10px] font-bold text-red-700 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded mt-0.5 inline-block">
                            Defect: {h.defectCategory}
                          </div>
                        )}
                        {h.rejectionReason && (
                          <div className="text-[10px] font-semibold text-red-600 mt-0.5">
                            Rejection: {h.rejectionReason}
                          </div>
                        )}
                        {h.holdReason && (
                          <div className="text-[10px] font-semibold text-amber-600 mt-0.5">
                            Rework: {h.holdReason}
                          </div>
                        )}
                      </td>

                      {/* Sending Dept */}
                      <td className="p-3">
                        <span className="font-medium text-slate-700 bg-slate-100 px-2 py-0.5 rounded text-[11px]">
                          {h.sendingDepartment}
                        </span>
                        {h.employee && (
                          <div className="text-[10px] text-slate-400 mt-0.5">By: {h.employee}</div>
                        )}
                      </td>

                      {/* Date */}
                      <td className="p-3 font-mono text-slate-600 text-[11px]">
                        {h.handoverDate}
                      </td>

                      {/* Priority */}
                      <td className="p-3">{getPriorityBadge(h.priority)}</td>

                      {/* Cycle */}
                      <td className="p-3 text-center">
                        <span
                          className={`font-mono text-xs px-2 py-0.5 rounded-full font-bold ${
                            h.currentInspectionCycle > 1
                              ? 'bg-purple-100 text-purple-700 border border-purple-300'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          Cycle {h.currentInspectionCycle || 1}
                        </span>
                      </td>

                      {/* Status (Read-Only Badge) */}
                      <td className="p-3">{getStatusBadge(h.status)}</td>

                      {/* Actions */}
                      <td className="p-3 text-right">
                        <div className="flex items-center justify-end space-x-1.5">
                          {/* Quality Actions (Accept / Reject / Hold) - STRICTLY RESTRICTED TO QUALITY & ADMIN ONLY */}
                          {isQualityUser && (
                            <div className="inline-flex items-center space-x-1 bg-slate-100 p-0.5 rounded-lg border border-slate-200">
                              {h.status !== 'ACCEPTED' && h.status !== 'CLOSED' && (
                                <button
                                  onClick={() => openAcceptModal(h)}
                                  title="Accept Inspection"
                                  className="px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[10px] font-bold shadow-2xs transition flex items-center space-x-1"
                                >
                                  <Check className="w-3 h-3" />
                                  <span>Accept</span>
                                </button>
                              )}

                              {h.status !== 'REJECTED' && h.status !== 'ACCEPTED' && h.status !== 'CLOSED' && (
                                <button
                                  onClick={() => openRejectModal(h)}
                                  title="Reject with Finding"
                                  className="px-2 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-[10px] font-bold shadow-2xs transition flex items-center space-x-1"
                                >
                                  <X className="w-3 h-3" />
                                  <span>Reject</span>
                                </button>
                              )}

                              {h.status !== 'HOLD' && h.status !== 'REWORK_REQUIRED' && h.status !== 'ACCEPTED' && h.status !== 'CLOSED' && (
                                <button
                                  onClick={() => openHoldModal(h)}
                                  title="Send for Rework"
                                  className="px-2 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded text-[10px] font-bold shadow-2xs transition flex items-center space-x-1"
                                >
                                  <Wrench className="w-3 h-3" />
                                  <span>Rework</span>
                                </button>
                              )}
                            </div>
                          )}

                          {/* Department Corrective Action & Resubmission (ONLY for Rejected Items) */}
                          {isRejected && (isOriginator || isQualityUser) && (
                            <button
                              onClick={() => setSelectedHandoverForResubmit(h)}
                              className="px-2.5 py-1 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-[11px] font-bold shadow-xs transition flex items-center space-x-1 animate-pulse"
                              title="Record corrective action and resubmit to Quality"
                            >
                              <RotateCcw className="w-3 h-3" />
                              <span>Resubmit to Quality</span>
                            </button>
                          )}

                          {/* View Details Modal Button (Available to all departments, read-only) */}
                          <button
                            onClick={() => setSelectedHandoverForHistory(h)}
                            title="View Handover Details & Quality Decisions"
                            className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[11px] font-semibold transition flex items-center space-x-1"
                          >
                            <Eye className="w-3.5 h-3.5 text-slate-500" />
                            <span>View</span>
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

      {/* =========================================================================
          MODAL: CREATE / SEND TO QUALITY
          ========================================================================= */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden text-slate-900 animate-in fade-in">
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
              <div>
                <h3 className="font-bold text-sm flex items-center space-x-2">
                  <ShieldCheck className="w-4 h-4 text-blue-400" />
                  <span>Send Handover to Quality</span>
                </h3>
                <p className="text-xs text-slate-400">Formal stage transition and quality inspection ticket</p>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Machine Number <span className="text-red-500">*</span>
                  </label>
                  {machines.length === 0 ? (
                    <input
                      type="text"
                      required
                      placeholder="e.g. 2523"
                      value={createMachineNo}
                      onChange={(e) => setCreateMachineNo(e.target.value)}
                      className="w-full text-xs p-2 rounded-lg border border-slate-300 font-bold"
                    />
                  ) : (
                    <select
                      value={createMachineNo}
                      onChange={(e) => setCreateMachineNo(e.target.value)}
                      className="w-full text-xs p-2 rounded-lg border border-slate-300 font-bold"
                    >
                      {machines.map((m) => (
                        <option key={m.id} value={m.machineNumber}>
                          Machine {m.machineNumber} ({m.model})
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Sending Department <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={createSendingDept}
                    onChange={(e) => setCreateSendingDept(e.target.value)}
                    className="w-full text-xs p-2 rounded-lg border border-slate-300 font-semibold"
                  >
                    {departments.map((d) => (
                      <option key={d.id} value={d.name}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Operation / Process Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Granite Lapping Stage 1, Bridge Alignment, Z-Axis Cable Harness"
                  value={createOperation}
                  onChange={(e) => setCreateOperation(e.target.value)}
                  className="w-full text-xs p-2 rounded-lg border border-slate-300 font-medium"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Part / Drawing Code</label>
                  <input
                    type="text"
                    placeholder="e.g. AG-GRN-1002"
                    value={createPartCode}
                    onChange={(e) => setCreatePartCode(e.target.value)}
                    className="w-full text-xs p-2 rounded-lg border border-slate-300"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Quantity</label>
                  <input
                    type="number"
                    min="1"
                    value={createQty}
                    onChange={(e) => setCreateQty(Number(e.target.value))}
                    className="w-full text-xs p-2 rounded-lg border border-slate-300"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Priority</label>
                  <select
                    value={createPriority}
                    onChange={(e) => setCreatePriority(e.target.value as any)}
                    className="w-full text-xs p-2 rounded-lg border border-slate-300 font-semibold"
                  >
                    <option value="Low">Low</option>
                    <option value="Medium">Medium</option>
                    <option value="High">High</option>
                    <option value="Critical">Critical</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Handover Date</label>
                  <input
                    type="date"
                    value={createDate}
                    onChange={(e) => setCreateDate(e.target.value)}
                    className="w-full text-xs p-2 rounded-lg border border-slate-300"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Handed Over By (Employee)
                  </label>
                  <input
                    type="text"
                    placeholder="Operator name"
                    value={createEmployee}
                    onChange={(e) => setCreateEmployee(e.target.value)}
                    className="w-full text-xs p-2 rounded-lg border border-slate-300"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Work Completed Description &amp; Self-Check Notes
                </label>
                <textarea
                  rows={2}
                  placeholder="e.g. Granite base cleaned and flatness verified on shop level, ready for official QA inspection..."
                  value={createWork}
                  onChange={(e) => setCreateWork(e.target.value)}
                  className="w-full text-xs p-2 rounded-lg border border-slate-300"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Remarks / Special Instructions
                </label>
                <input
                  type="text"
                  placeholder="e.g. Temperature stabilized for 12 hours..."
                  value={createRemarks}
                  onChange={(e) => setCreateRemarks(e.target.value)}
                  className="w-full text-xs p-2 rounded-lg border border-slate-300"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingCreate}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-xs transition disabled:opacity-50 flex items-center space-x-1.5"
                >
                  <ShieldCheck className="w-4 h-4" />
                  <span>{submittingCreate ? 'Dispatching...' : 'Dispatch to Quality'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL: ACCEPT HANDOVER (Quality Inspector Action)
          ========================================================================= */}
      {selectedHandoverForAccept && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200 overflow-hidden text-slate-900 animate-in fade-in">
            <div className="p-4 bg-emerald-700 text-white flex items-center justify-between">
              <div>
                <h3 className="font-bold text-sm flex items-center space-x-2">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Quality Accept Handover</span>
                </h3>
                <p className="text-xs text-emerald-100">
                  {selectedHandoverForAccept.handoverId} &bull; Machine {selectedHandoverForAccept.machineNumber}
                </p>
              </div>
              <button
                onClick={() => setSelectedHandoverForAccept(null)}
                className="text-emerald-200 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAcceptSubmit} className="p-5 space-y-4">
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs space-y-1 text-emerald-900">
                <div className="font-bold">
                  Operation: {selectedHandoverForAccept.operation}
                </div>
                <div className="text-emerald-700">
                  Department: {selectedHandoverForAccept.sendingDepartment} &bull; Cycle:{' '}
                  {selectedHandoverForAccept.currentInspectionCycle || 1}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Quality Inspector Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={acceptInspector}
                  onChange={(e) => setAcceptInspector(e.target.value)}
                  className="w-full text-xs p-2 rounded-lg border border-slate-300 font-bold"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Inspection Remarks / Calibration Confirmation
                </label>
                <textarea
                  rows={3}
                  placeholder="e.g. Dimensions verified within &plusmn;0.002mm tolerance, surface finish verified Ra 0.4. Stage approved for subsequent process."
                  value={acceptRemarks}
                  onChange={(e) => setAcceptRemarks(e.target.value)}
                  className="w-full text-xs p-2 rounded-lg border border-slate-300"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setSelectedHandoverForAccept(null)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingAccept}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-xs transition disabled:opacity-50 flex items-center space-x-1.5"
                >
                  <Check className="w-4 h-4" />
                  <span>{submittingAccept ? 'Accepting...' : 'Confirm Acceptance'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL: REJECT HANDOVER (Quality Inspector Action)
          ========================================================================= */}
      {selectedHandoverForReject && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200 overflow-hidden text-slate-900 animate-in fade-in">
            <div className="p-4 bg-red-700 text-white flex items-center justify-between">
              <div>
                <h3 className="font-bold text-sm flex items-center space-x-2">
                  <AlertOctagon className="w-4 h-4" />
                  <span>Quality Rejection &amp; Corrective Action Notice</span>
                </h3>
                <p className="text-xs text-red-100">
                  {selectedHandoverForReject.handoverId} &bull; Machine {selectedHandoverForReject.machineNumber}
                </p>
              </div>
              <button
                onClick={() => setSelectedHandoverForReject(null)}
                className="text-red-200 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleRejectSubmit} className="p-5 space-y-3.5">
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs space-y-1 text-red-900">
                <div className="font-bold">
                  Operation: {selectedHandoverForReject.operation}
                </div>
                <div className="text-red-700">
                  Originating Department: {selectedHandoverForReject.sendingDepartment}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Quality Inspector Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={rejectInspector}
                  onChange={(e) => setRejectInspector(e.target.value)}
                  className="w-full text-xs p-2 rounded-lg border border-slate-300 font-bold"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Defect Category <span className="text-red-500">*</span>
                </label>
                <select
                  required
                  value={rejectDefectCategory}
                  onChange={(e) => setRejectDefectCategory(e.target.value as DefectCategory)}
                  className="w-full text-xs p-2 rounded-lg border border-red-300 bg-red-50/20 font-bold text-red-900 focus:ring-1 focus:ring-red-500"
                >
                  {DEFECT_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Primary Rejection Reason <span className="text-red-500">*</span>
                </label>
                <select
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  className="w-full text-xs p-2 rounded-lg border border-slate-300 font-bold text-red-700"
                >
                  <option value="Dimension Out of Tolerance">Dimension Out of Tolerance</option>
                  <option value="Surface Scratch / Damage">Surface Scratch / Damage</option>
                  <option value="Assembly Misalignment">Assembly Misalignment</option>
                  <option value="Loose Fastener / Incomplete Torque">Loose Fastener / Incomplete Torque</option>
                  <option value="Wiring / Connector Defect">Wiring / Connector Defect</option>
                  <option value="Flatness / Orthogonality Deviation">Flatness / Orthogonality Deviation</option>
                  <option value="Incomplete Operation / Missing Component">Incomplete Operation / Missing Component</option>
                  <option value="Other Non-Conformance">Other Non-Conformance</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Specification Required
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Flatness &le; 0.003mm"
                    value={rejectSpec}
                    onChange={(e) => setRejectSpec(e.target.value)}
                    className="w-full text-xs p-2 rounded-lg border border-slate-300"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Actual Finding / Measured
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Measured 0.007mm"
                    value={rejectActual}
                    onChange={(e) => setRejectActual(e.target.value)}
                    className="w-full text-xs p-2 rounded-lg border border-slate-300 text-red-600 font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Concerned Department to Rectify <span className="text-red-500">*</span>
                </label>
                <select
                  value={rejectConcernedDept}
                  onChange={(e) => setRejectConcernedDept(e.target.value)}
                  className="w-full text-xs p-2 rounded-lg border border-slate-300 font-semibold"
                >
                  {departments.map((d) => (
                    <option key={d.id} value={d.name}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Mandatory Corrective Action Required
                </label>
                <input
                  type="text"
                  placeholder="e.g. Re-lap corner quadrant 2 and re-check flatness"
                  value={rejectActionReq}
                  onChange={(e) => setRejectActionReq(e.target.value)}
                  className="w-full text-xs p-2 rounded-lg border border-slate-300"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Detailed Inspector Observations
                </label>
                <textarea
                  rows={2}
                  placeholder="Additional observations, root cause suggestions..."
                  value={rejectRemarks}
                  onChange={(e) => setRejectRemarks(e.target.value)}
                  className="w-full text-xs p-2 rounded-lg border border-slate-300"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setSelectedHandoverForReject(null)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingReject}
                  className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl shadow-xs transition disabled:opacity-50 flex items-center space-x-1.5"
                >
                  <AlertOctagon className="w-4 h-4" />
                  <span>{submittingReject ? 'Recording...' : 'Issue Quality Rejection'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL: REWORK HANDOVER (Quality Inspector Action)
          ========================================================================= */}
      {selectedHandoverForHold && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200 overflow-hidden text-slate-900 animate-in fade-in">
            <div className="p-4 bg-amber-600 text-white flex items-center justify-between">
              <div>
                <h3 className="font-bold text-sm flex items-center space-x-2">
                  <Wrench className="w-4 h-4" />
                  <span>Quality Decision: REWORK REQUIRED</span>
                </h3>
                <p className="text-xs text-amber-100">
                  {selectedHandoverForHold.handoverId} &bull; Machine {selectedHandoverForHold.machineNumber}
                </p>
              </div>
              <button
                onClick={() => setSelectedHandoverForHold(null)}
                className="text-amber-200 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleHoldSubmit} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Quality Inspector <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={holdInspector}
                  onChange={(e) => setHoldInspector(e.target.value)}
                  className="w-full text-xs p-2 rounded-lg border border-slate-300 font-bold"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Defect Category <span className="text-red-500">*</span>
                </label>
                <select
                  required
                  value={holdDefectCategory}
                  onChange={(e) => setHoldDefectCategory(e.target.value as DefectCategory)}
                  className="w-full text-xs p-2 rounded-lg border border-amber-300 bg-amber-50/20 font-bold text-amber-900 focus:ring-1 focus:ring-amber-500"
                >
                  {DEFECT_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Rework / Defect Description <span className="text-red-500">*</span>
                </label>
                <select
                  value={holdReason}
                  onChange={(e) => setHoldReason(e.target.value)}
                  className="w-full text-xs p-2 rounded-lg border border-slate-300 font-bold text-amber-800"
                >
                  <option value="Correction / Rework Required">Correction / Rework Required</option>
                  <option value="Missing Drawing / Master Specification">
                    Missing Drawing / Master Specification
                  </option>
                  <option value="Customer Clarification Pending">Customer Clarification Pending</option>
                  <option value="Awaiting Calibration Standard / Gauge Availability">
                    Awaiting Calibration Standard / Gauge Availability
                  </option>
                  <option value="Environmental Temperature Stabilization Required">
                    Environmental Temperature Stabilization Required
                  </option>
                  <option value="Engineering Review Requested">Engineering Review Requested</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Concerned Department to Rectify <span className="text-red-500">*</span>
                </label>
                <select
                  value={holdConcernedDept}
                  onChange={(e) => setHoldConcernedDept(e.target.value)}
                  className="w-full text-xs p-2 rounded-lg border border-slate-300 font-semibold"
                >
                  {departments.map((d) => (
                    <option key={d.id} value={d.name}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Specification Required / Expected
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Surface finish &plusmn;0.005mm"
                    value={holdSpec}
                    onChange={(e) => setHoldSpec(e.target.value)}
                    className="w-full text-xs p-2 rounded-lg border border-slate-300"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Actual Finding / Measured
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Measured 0.009mm"
                    value={holdActual}
                    onChange={(e) => setHoldActual(e.target.value)}
                    className="w-full text-xs p-2 rounded-lg border border-slate-300 text-amber-700 font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Required Corrective Action
                </label>
                <input
                  type="text"
                  placeholder="e.g. Re-lap bed section and re-check tolerance"
                  value={holdActionReq}
                  onChange={(e) => setHoldActionReq(e.target.value)}
                  className="w-full text-xs p-2 rounded-lg border border-slate-300"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Expected Review / Correction Target Date
                </label>
                <input
                  type="date"
                  value={holdReviewDate}
                  onChange={(e) => setHoldReviewDate(e.target.value)}
                  className="w-full text-xs p-2 rounded-lg border border-slate-300"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Rework Remarks &amp; Action Instructions
                </label>
                <textarea
                  rows={2}
                  placeholder="Explain required correction for shop floor..."
                  value={holdRemarks}
                  onChange={(e) => setHoldRemarks(e.target.value)}
                  className="w-full text-xs p-2 rounded-lg border border-slate-300"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setSelectedHandoverForHold(null)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingHold}
                  className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl shadow-xs transition disabled:opacity-50 flex items-center space-x-1.5"
                >
                  <Wrench className="w-4 h-4" />
                  <span>{submittingHold ? 'Recording...' : 'Send for Rework (REWORK REQUIRED)'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL: RESUBMIT TO QUALITY (Department Corrective Action)
          ========================================================================= */}
      {selectedHandoverForResubmit && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200 overflow-hidden text-slate-900 animate-in fade-in">
            <div className="p-4 bg-purple-800 text-white flex items-center justify-between">
              <div>
                <h3 className="font-bold text-sm flex items-center space-x-2">
                  <RotateCcw className="w-4 h-4 text-purple-300" />
                  <span>Resubmit to Quality (Re-inspection Cycle)</span>
                </h3>
                <p className="text-xs text-purple-200">
                  {selectedHandoverForResubmit.handoverId} &bull; Advancing to Cycle{' '}
                  {(selectedHandoverForResubmit.currentInspectionCycle || 1) + 1}
                </p>
              </div>
              <button
                onClick={() => setSelectedHandoverForResubmit(null)}
                className="text-purple-300 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleResubmitSubmit} className="p-5 space-y-4">
              <div className="p-3 bg-purple-50 border border-purple-200 rounded-xl text-xs space-y-1 text-purple-900">
                <div className="font-bold">
                  Defect Reported: {selectedHandoverForResubmit.rejectionReason || 'Non-conformance'}
                </div>
                {selectedHandoverForResubmit.correctiveActionRequired && (
                  <div className="text-purple-700">
                    Mandatory Action: {selectedHandoverForResubmit.correctiveActionRequired}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Responsible Technician / Employee <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Technician who completed the rework"
                  value={resubmitEmployee}
                  onChange={(e) => setResubmitEmployee(e.target.value)}
                  className="w-full text-xs p-2 rounded-lg border border-slate-300 font-bold"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Corrective Action Taken &amp; Fix Details <span className="text-red-500">*</span>
                </label>
                <textarea
                  rows={3}
                  required
                  placeholder="e.g. Re-lapped surface flatness using diamond abrasive. Measured flatness 0.0018mm within tolerance limits. Ready for re-inspection."
                  value={resubmitActionTaken}
                  onChange={(e) => setResubmitActionTaken(e.target.value)}
                  className="w-full text-xs p-2 rounded-lg border border-slate-300"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Additional Notes for Quality Inspector
                </label>
                <input
                  type="text"
                  placeholder="e.g. Re-verified on shop granite standard..."
                  value={resubmitRemarks}
                  onChange={(e) => setResubmitRemarks(e.target.value)}
                  className="w-full text-xs p-2 rounded-lg border border-slate-300"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setSelectedHandoverForResubmit(null)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingResubmit}
                  className="px-5 py-2 bg-purple-700 hover:bg-purple-800 text-white text-xs font-bold rounded-xl shadow-xs transition disabled:opacity-50 flex items-center space-x-1.5"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>{submittingResubmit ? 'Resubmitting...' : 'Confirm & Resubmit to Quality'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL: HANDOVER DETAILS, QUALITY DECISIONS & AUDIT TRAIL (Section 3 Requirement)
          ========================================================================= */}
      {selectedHandoverForHistory && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-3xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden text-slate-900 animate-in fade-in max-h-[92vh] flex flex-col">
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
              <div>
                <div className="flex items-center space-x-2">
                  <ShieldCheck className="w-4 h-4 text-blue-400" />
                  <h3 className="font-bold text-sm">
                    Quality Handover Record: {selectedHandoverForHistory.handoverId}
                  </h3>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  Machine {selectedHandoverForHistory.machineNumber} &bull; {selectedHandoverForHistory.machineModel || 'General'} &bull; {selectedHandoverForHistory.operation}
                </p>
              </div>
              <button
                onClick={() => setSelectedHandoverForHistory(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4">
              {/* Status & Department Metadata Banner */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Current Inspection Status</span>
                    <div className="mt-1">{getStatusBadge(selectedHandoverForHistory.status)}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono px-2.5 py-1 rounded-full font-bold bg-purple-100 text-purple-800 border border-purple-200">
                      Cycle {selectedHandoverForHistory.currentInspectionCycle || 1}
                    </span>
                    {getPriorityBadge(selectedHandoverForHistory.priority)}
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-slate-200 text-xs">
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase font-bold block">Originating Dept</span>
                    <span className="font-semibold text-slate-800">{selectedHandoverForHistory.sendingDepartment}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase font-bold block">Submitted By</span>
                    <span className="font-semibold text-slate-800">{selectedHandoverForHistory.employee || 'Operator'}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase font-bold block">Submission Date</span>
                    <span className="font-mono text-slate-800">{selectedHandoverForHistory.handoverDate}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase font-bold block">Part &amp; Qty</span>
                    <span className="font-semibold text-slate-800">
                      {selectedHandoverForHistory.partCode || 'Part'}{' '}
                      <span className="text-slate-500 font-mono">(Qty: {selectedHandoverForHistory.quantity})</span>
                    </span>
                  </div>
                </div>

                {selectedHandoverForHistory.remarks && (
                  <div className="pt-2 border-t border-slate-200 text-xs text-slate-600">
                    <span className="text-[10px] font-bold text-slate-400 uppercase block">Submission Remarks</span>
                    <p className="mt-0.5">{selectedHandoverForHistory.remarks}</p>
                  </div>
                )}
              </div>

              {/* READ-ONLY QUALITY INSPECTION DECISION SECTION */}
              <div className="p-4 bg-indigo-50/60 border border-indigo-200 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-black uppercase tracking-wider text-indigo-950 flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-indigo-600" />
                    <span>Quality Inspector Decision &amp; Verification (Read-Only)</span>
                  </h4>
                  <span className="text-[10px] font-bold text-indigo-700 bg-indigo-100 px-2 py-0.5 rounded border border-indigo-200">
                    Quality Certified
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <div>
                    <span className="text-[10px] text-indigo-500 uppercase font-bold block">Inspector</span>
                    <span className="font-bold text-slate-900">
                      {selectedHandoverForHistory.lastInspector || 'Pending Assignment'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-indigo-500 uppercase font-bold block">Decision Date</span>
                    <span className="font-mono text-slate-800">
                      {selectedHandoverForHistory.lastInspectionDate || selectedHandoverForHistory.updatedAt?.split('T')[0] || 'Pending'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-indigo-500 uppercase font-bold block">Inspection Result</span>
                    <span className="font-bold text-slate-900">
                      {selectedHandoverForHistory.lastInspectionResult || selectedHandoverForHistory.status}
                    </span>
                  </div>
                </div>

                {/* Specific details for Rejections */}
                {(selectedHandoverForHistory.status === 'REJECTED' ||
                  selectedHandoverForHistory.status === 'REWORK_REQUIRED' ||
                  selectedHandoverForHistory.rejectionReason) && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs space-y-1.5 text-red-900">
                    <div className="font-bold flex items-center gap-1.5">
                      <AlertOctagon className="w-3.5 h-3.5 text-red-600" />
                      <span>Rejection Reason: {selectedHandoverForHistory.rejectionReason}</span>
                    </div>
                    {selectedHandoverForHistory.correctiveActionRequired && (
                      <div>
                        <span className="font-bold text-red-800">Mandatory Corrective Action: </span>
                        <span>{selectedHandoverForHistory.correctiveActionRequired}</span>
                      </div>
                    )}
                    <p className="text-[11px] text-red-700 pt-1 border-t border-red-200">
                      This handover is rejected. Originating department must complete required rework and resubmit to Quality. Only Quality or Admin can re-inspect and approve.
                    </p>
                  </div>
                )}

                {/* Defect Category Tag if present */}
                {selectedHandoverForHistory.defectCategory && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs flex items-center justify-between">
                    <span className="font-bold text-red-900 flex items-center gap-1.5">
                      <AlertOctagon className="w-3.5 h-3.5 text-red-600" />
                      <span>Defect Category:</span>
                    </span>
                    <span className="font-bold text-red-700 bg-red-100 px-2.5 py-1 rounded-md text-xs border border-red-300">
                      {selectedHandoverForHistory.defectCategory}
                    </span>
                  </div>
                )}

                {/* Specification & Actual Finding if recorded */}
                {(selectedHandoverForHistory.specification || selectedHandoverForHistory.actualFinding) && (
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-1">
                    {selectedHandoverForHistory.specification && (
                      <div className="flex justify-between items-center">
                        <span className="text-slate-600 font-semibold">Specification / Expected:</span>
                        <span className="font-mono text-slate-800 font-bold">{selectedHandoverForHistory.specification}</span>
                      </div>
                    )}
                    {selectedHandoverForHistory.actualFinding && (
                      <div className="flex justify-between items-center">
                        <span className="text-slate-600 font-semibold">Actual Finding / Measured:</span>
                        <span className="font-mono font-bold text-red-600">{selectedHandoverForHistory.actualFinding}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Specific details for Rework / Holds */}
                {(selectedHandoverForHistory.status === 'HOLD' ||
                  selectedHandoverForHistory.status === 'REWORK_REQUIRED' ||
                  selectedHandoverForHistory.holdReason) && (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs space-y-1.5 text-amber-900">
                    <div className="font-bold flex items-center gap-1.5">
                      <Wrench className="w-3.5 h-3.5 text-amber-600" />
                      <span>
                        {selectedHandoverForHistory.status === 'HOLD'
                          ? 'Rework (legacy Hold) Reason:'
                          : 'Rework Required Reason:'}{' '}
                        {selectedHandoverForHistory.holdReason}
                      </span>
                    </div>
                    {((selectedHandoverForHistory as any).expectedReviewDate) && (
                      <div>
                        <span className="font-bold text-amber-800">Expected Review Date: </span>
                        <span className="font-mono">{(selectedHandoverForHistory as any).expectedReviewDate}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Department Corrective Action Trigger in Modal */}
              {(selectedHandoverForHistory.status === 'REJECTED' ||
                selectedHandoverForHistory.status === 'REWORK_REQUIRED') && (
                <div className="p-3 bg-purple-50 border border-purple-200 rounded-xl flex items-center justify-between gap-3">
                  <div>
                    <h5 className="text-xs font-bold text-purple-900">Rework Required by Originating Department</h5>
                    <p className="text-[11px] text-purple-700">Record corrective actions taken and resubmit this machine for re-inspection.</p>
                  </div>
                  <button
                    onClick={() => {
                      const target = selectedHandoverForHistory;
                      setSelectedHandoverForHistory(null);
                      setSelectedHandoverForResubmit(target);
                    }}
                    className="px-3.5 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs font-bold shadow-xs transition flex items-center space-x-1 shrink-0"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Perform Corrective Action</span>
                  </button>
                </div>
              )}

              {/* Complete Timeline & Events */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">
                  Complete Timeline &amp; Audit Trail
                </h4>

                {loadingHistory ? (
                  <div className="p-8 text-center text-xs text-slate-400">Loading audit trail...</div>
                ) : historyEntries.length === 0 ? (
                  <div className="p-8 text-center text-xs text-slate-400">
                    No timeline records logged yet.
                  </div>
                ) : (
                  <div className="space-y-3 relative before:absolute before:left-3.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
                    {historyEntries.map((item) => (
                      <div key={item.id} className="relative pl-8 text-xs">
                        <div className="absolute left-2 top-1.5 w-3 h-3 rounded-full bg-blue-600 border-2 border-white ring-2 ring-blue-100" />
                        <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-slate-900">{item.action}</span>
                            <span className="font-mono text-[10px] text-slate-400">
                              {item.date} {item.time}
                            </span>
                          </div>
                          <div className="text-slate-600 leading-relaxed">{item.details}</div>
                          <div className="text-[10px] text-slate-400 flex items-center space-x-2 pt-1">
                            <span>User: {item.user}</span>
                            <span>&bull;</span>
                            <span>Dept: {item.department}</span>
                            {item.cycle && (
                              <>
                                <span>&bull;</span>
                                <span className="font-mono font-semibold">Cycle {item.cycle}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end shrink-0">
              <button
                onClick={() => setSelectedHandoverForHistory(null)}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl"
              >
                Close Handover Record
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
