import React, { useState, useEffect, useMemo } from 'react';
import {
  Cpu,
  CheckCircle2,
  Clock,
  AlertTriangle,
  ArrowRight,
  History as HistoryIcon,
  User,
  Calendar,
  Percent,
  ShieldAlert,
  ShieldCheck,
  Send,
  Play,
  Check,
  FileText,
  ChevronRight,
  RefreshCw,
  Sliders,
  Sparkles,
  ArrowRightLeft,
  X,
  Search,
  Filter,
  Eye,
  CheckSquare,
  Edit2,
  PauseCircle,
} from 'lucide-react';
import {
  Department,
  Machine,
  MachineProgressHistory,
  MachineStatus,
  DepartmentHandover,
  UserProfile,
  MonthlyPlan,
  WeeklyPlan,
  DepartmentWork,
  QualityDailyCheck,
  QualityRejection,
  QualityOperation,
  WorkOperationItem,
  DailyWorkHistoryGroup,
  STANDARD_DELAY_REASONS,
} from '../types';
import { useAuth } from '../context/AuthContext';
import {
  isDepartmentMatch,
  getNextDepartmentInRoute,
  getDepartmentIndex,
  isQualityDepartment,
  hasQualityInspectionAccess,
} from '../utils/departmentUtils';
import { getNextDepartmentForMachine } from '../utils/routeUtils';
import { areMachineNumbersEqual, cleanMonthYear, getMachineDisplaySize, normalizeMachineNumber } from '../utils/machineUtils';
import { MachineMovementTimelineModal } from './MachineMovementTimelineModal';
import { DailyOperationProgressModal } from './operations/DailyOperationProgressModal';
import { QualityInspectionDecisionModal } from './QualityInspectionDecisionModal';
import {
  recordMachineProgressUpdate,
  completeMachineWork,
  subscribeMachineProgressHistory,
  subscribeQualityOperations,
  createQualityHandover,
} from '../services/db';
import { createHandover, acceptHandover, rejectHandover, startHandoverWork } from '../services/workflowService';
import {
  getOperationsForMachineDepartment,
  calculateOperationsProgress,
  saveDepartmentOperationsProgress,
  returnMachineOfficially,
  formatDisplayDate,
  getDailyWorkHistoryForMachine,
  saveDailyWorkOperations,
} from '../services/operationWorkflowService';
import { INITIAL_DEPARTMENTS } from '../constants';

interface ShopFloorMachineMonitoringViewProps {
  currentDepartment: string;
  departments: Department[];
  machines: Machine[];
  handovers?: DepartmentHandover[];
  monthlyPlans?: MonthlyPlan[];
  weeklyPlans?: WeeklyPlan[];
  departmentWork?: DepartmentWork[];
  qualityChecks?: QualityDailyCheck[];
  qualityRejections?: QualityRejection[];
  onOpenMachineDetail?: (machine: Machine) => void;
  initialMonth?: string;
  initialFilter?: string | null;
}

export type ShopFloorFilterType =
  | 'all'
  | 'not_started'
  | 'in_progress'
  | 'completed'
  | 'delayed'
  | 'ready_handover'
  | 'waiting_handover'
  | 'quality_hold'
  | 'rejected'
  | 'incoming';

export const ShopFloorMachineMonitoringView: React.FC<ShopFloorMachineMonitoringViewProps> = ({
  currentDepartment,
  departments,
  machines,
  handovers = [],
  monthlyPlans = [],
  weeklyPlans = [],
  departmentWork = [],
  qualityChecks = [],
  qualityRejections = [],
  onOpenMachineDetail,
  initialMonth,
  initialFilter,
}) => {
  const { userProfile } = useAuth();
  const isAdmin = userProfile?.role === 'ADMIN';
  const isQualityUser = hasQualityInspectionAccess(userProfile);

  // State for active filter tab, month selection, and week selection
  const [filterTab, setFilterTab] = useState<ShopFloorFilterType>(
    (initialFilter as ShopFloorFilterType) || 'all'
  );
  const [selectedMonth, setSelectedMonth] = useState<string>(initialMonth || 'October 2026');
  const [selectedWeek, setSelectedWeek] = useState<string>('All Weeks');
  const [selectedSize, setSelectedSize] = useState<string>('All Sizes');
  const [searchQuery, setSearchQuery] = useState('');

  // Sync initial props from parent dashboard KPI clicks
  useEffect(() => {
    if (initialMonth) {
      setSelectedMonth(initialMonth);
    }
  }, [initialMonth]);

  useEffect(() => {
    if (initialFilter) {
      setFilterTab(initialFilter as ShopFloorFilterType);
    }
  }, [initialFilter]);

  // Modals state
  const [selectedMachineForDailyWork, setSelectedMachineForDailyWork] = useState<Machine | null>(null);
  const [showDailyWorkModal, setShowDailyWorkModal] = useState<boolean>(false);
  const [selectedMachineForProgress, setSelectedMachineForProgress] = useState<Machine | null>(null);
  const [selectedMachineForComplete, setSelectedMachineForComplete] = useState<Machine | null>(null);
  const [selectedMachineForHandover, setSelectedMachineForHandover] = useState<Machine | null>(null);
  const [selectedMachineForHistory, setSelectedMachineForHistory] = useState<Machine | null>(null);
  const [selectedTimelineMachine, setSelectedTimelineMachine] = useState<Machine | null>(null);
  const [adminHandoverOverride, setAdminHandoverOverride] = useState<boolean>(false);
  const [historyList, setHistoryList] = useState<MachineProgressHistory[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Quality operations catalogue for resolving master operations
  const [qualityOpsList, setQualityOpsList] = useState<QualityOperation[]>([]);

  // Form states for Operations-based Update Progress modal (Requirement 3 & 4)
  const [modalOperations, setModalOperations] = useState<WorkOperationItem[]>([]);
  const [newlyCompletedOpIds, setNewlyCompletedOpIds] = useState<string[]>([]);
  const [dailyWorkHistory, setDailyWorkHistory] = useState<DailyWorkHistoryGroup[]>([]);
  const [loadingDailyHistory, setLoadingDailyHistory] = useState<boolean>(false);
  const [selectedHistoryDate, setSelectedHistoryDate] = useState<string | null>(null);
  const [activeProgressTab, setActiveProgressTab] = useState<'today' | 'remaining' | 'all' | 'history'>('today');
  const [operationsFilter, setOperationsFilter] = useState<'ALL' | 'PENDING' | 'COMPLETED' | 'TODAY'>('ALL');
  const [workDescription, setWorkDescription] = useState<string>('');
  const [operatorEmployee, setOperatorEmployee] = useState<string>('');
  const [progressStatus, setProgressStatus] = useState<string>('IN_PROGRESS');
  const [actualQuantity, setActualQuantity] = useState<number>(1);
  const [expectedDate, setExpectedDate] = useState<string>('');
  const [delayReason, setDelayReason] = useState<string>('');
  const [progressRemarks, setProgressRemarks] = useState<string>('');
  const [workDoneToday, setWorkDoneToday] = useState<string>('');
  const [remainingWork, setRemainingWork] = useState<string>('');
  const [attachmentUrl, setAttachmentUrl] = useState<string>('');
  const [savingProgress, setSavingProgress] = useState(false);
  const [sendingToAdmin, setSendingToAdmin] = useState(false);

  // Form states for Complete Work modal
  const [completionDate, setCompletionDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [finalQuantity, setFinalQuantity] = useState<number>(1);
  const [completionRemarks, setCompletionRemarks] = useState<string>('');
  const [completionAttachment, setCompletionAttachment] = useState<string>('');
  const [savingCompletion, setSavingCompletion] = useState<boolean>(false);

  // Form states for Handover modal (Requirement 6 & 11)
  const [targetDepartment, setTargetDepartment] = useState<string>('');
  const [handoverWorkDesc, setHandoverWorkDesc] = useState<string>('');
  const [handoverPriority, setHandoverPriority] = useState<string>('Medium');
  const [handoverRemarks, setHandoverRemarks] = useState<string>('');
  const [confirmCompletedWork, setConfirmCompletedWork] = useState<boolean>(false);
  const [dispatchingHandover, setDispatchingHandover] = useState(false);

  // States for Return / Reverse Machine modal (Requirement 14 & 15)
  const [selectedMachineForReturn, setSelectedMachineForReturn] = useState<Machine | null>(null);
  const [returnTargetDept, setReturnTargetDept] = useState<string>('');
  const [returnReason, setReturnReason] = useState<string>('');
  const [returnCorrectiveAction, setReturnCorrectiveAction] = useState<string>('');
  const [returnRemarks, setReturnRemarks] = useState<string>('');
  const [submittingReturn, setSubmittingReturn] = useState(false);

  // States for Incoming Handover Rejection
  const [selectedIncomingForReject, setSelectedIncomingForReject] = useState<DepartmentHandover | null>(null);
  const [incomingRejectionReason, setIncomingRejectionReason] = useState<string>('');
  const [incomingRejectionRemarks, setIncomingRejectionRemarks] = useState<string>('');
  const [rejectingHandover, setRejectingHandover] = useState(false);

  // States for Send to Quality modal (Requirement 11 & 12)
  const [selectedMachineForQuality, setSelectedMachineForQuality] = useState<Machine | null>(null);
  const [qualityHandoverOperation, setQualityHandoverOperation] = useState<string>('');
  const [qualityHandoverPriority, setQualityHandoverPriority] = useState<'Low' | 'Medium' | 'High' | 'Critical'>('Medium');
  const [qualityHandoverRemarks, setQualityHandoverRemarks] = useState<string>('');
  const [submittingQualityHandover, setSubmittingQualityHandover] = useState<boolean>(false);

  // States for Quality Inspection Decision modal (Rework, Reject, Accept - Quality & Admin)
  const [selectedMachineForQCInspection, setSelectedMachineForQCInspection] = useState<Machine | null>(null);
  const [qcInspectionInitialAction, setQcInspectionInitialAction] = useState<'Accept' | 'Reject' | 'Rework' | 'Hold'>('Accept');

  // Toast / notification feedback
  const [toast, setToast] = useState<{ type: 'success' | 'error' | 'warning'; text: string } | null>(null);

  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 5000);
      return () => clearTimeout(t);
    }
  }, [toast]);

  // Subscribe to quality operations catalogue
  useEffect(() => {
    const unsub = subscribeQualityOperations((ops) => {
      setQualityOpsList(ops);
    });
    return () => unsub();
  }, []);

  // Load history when history modal opens
  useEffect(() => {
    if (selectedMachineForHistory) {
      setLoadingHistory(true);
      const unsubscribe = subscribeMachineProgressHistory(
        selectedMachineForHistory.machineNumber,
        (entries) => {
          setHistoryList(entries);
          setLoadingHistory(false);
        }
      );
      return () => unsubscribe();
    } else {
      setHistoryList([]);
    }
  }, [selectedMachineForHistory]);

  // Check if current user is authorized to edit work on this machine (Requirement 2, 11, 14, 15)
  const canUserEditMachine = (m: Machine): boolean => {
    if (isAdmin) return true;
    const responsible = m.responsibleDepartment || m.currentDepartment;
    const isMyDept = isDepartmentMatch(userProfile?.department, responsible);
    if (!isMyDept) return false;

    // If handover was dispatched and is awaiting acceptance, sending department cannot edit until accepted or returned!
    const isPendingHandover =
      m.handoverStatus === 'AWAITING_ACCEPTANCE' ||
      m.handoverStatus === 'PENDING_ACCEPTANCE';
    if (isPendingHandover) return false;

    // If the machine has moved to another department, previous department can only VIEW, not edit!
    if (
      m.previousDepartment &&
      isDepartmentMatch(m.previousDepartment, userProfile?.department) &&
      !isDepartmentMatch(m.currentDepartment, userProfile?.department)
    ) {
      return false;
    }

    // Requirement 15: If the machine is officially RETURNED for correction, it IS editable again!
    const isReturned = m.status === 'RETURNED' || m.currentStatus === 'Returned for Correction' || m.isReturned;
    if (isReturned) return true;

    // Requirement 11: Once 100% completed and handed over (or pending acceptance): previous department cannot edit!
    const prog = m.departmentProgress !== undefined ? m.departmentProgress : (m.progress !== undefined ? m.progress : m.overallProgressPercent || 0);
    const isCompletedAndLocked = prog >= 100 && (m.status === 'COMPLETED' || m.handoverStatus === 'ACCEPTED');
    if (isCompletedAndLocked && !isDepartmentMatch(m.currentDepartment, userProfile?.department)) return false;

    return true;
  };

  // Find incoming handovers directed to currentDepartment
  const incomingHandovers = useMemo(() => {
    return handovers.filter((h) => {
      const isToThisDept = isDepartmentMatch(h.toDepartment || h.receivingDepartment, currentDepartment);
      const isPending = h.status === 'SENT' || h.status === 'Pending Acceptance' || h.status === 'PENDING_ACCEPTANCE';
      return isToThisDept && isPending;
    });
  }, [handovers, currentDepartment]);

  // Automatically show all machines assigned to currentDepartment from machines collection AND approved Monthly Plan
  const departmentMachines = useMemo(() => {
    const map = new Map<string, Machine>();

    // 1. First add machines currently situated at / assigned to currentDepartment
    machines.forEach((m) => {
      const currentLoc = m.responsibleDepartment || m.currentDepartment;
      if (isDepartmentMatch(currentLoc, currentDepartment)) {
        map.set(m.machineNumber, { ...m });
      }
    });

    // 2. Incorporate machines from approved Monthly Plans (Requirement 2: visible to all departments except Design)
    const isCurrentDeptDesign = isDepartmentMatch(currentDepartment, '01 Design');
    if (!isCurrentDeptDesign && monthlyPlans && monthlyPlans.length > 0) {
      monthlyPlans.forEach((p) => {
        if (!p.machineNumber) return;
        const isApplicablePlan =
          isDepartmentMatch(p.department, '02 Planning') ||
          !p.department ||
          isDepartmentMatch(p.department, currentDepartment);
        if (!isApplicablePlan) return;

        const planSize = getMachineDisplaySize(p as any) !== 'Size not available'
          ? getMachineDisplaySize(p as any)
          : (p.machineSize || p.machineModel || 'Standard');

        if (map.has(p.machineNumber)) {
          // Enrich existing machine if missing attributes
          const existing = map.get(p.machineNumber)!;
          const resolvedSize = getMachineDisplaySize(existing) !== 'Size not available'
            ? getMachineDisplaySize(existing)
            : planSize;
          map.set(p.machineNumber, {
            ...existing,
            machineSize: resolvedSize,
            model: resolvedSize,
            machineModel: resolvedSize,
            currentWork: existing.currentWork || p.operationWork || p.task || p.process || 'Planned Department Work',
            process: existing.process || p.process,
            responsibleEmployee: existing.responsibleEmployee || p.responsibleEmployee,
            currentEmployee: existing.currentEmployee || existing.responsibleEmployee || p.responsibleEmployee,
            plannedStartDate: existing.plannedStartDate || p.plannedStartDate,
            plannedDueDate: existing.plannedDueDate || existing.dueDate || p.plannedEndDate,
            dueDate: existing.dueDate || existing.plannedDueDate || p.plannedEndDate,
            project: existing.project || p.project,
            customer: existing.customer || p.customer,
          });
        } else {
          // Check global machines list to retain actual location and status
          const matchInAllMachines = machines.find((m) => areMachineNumbersEqual(m.machineNumber, p.machineNumber));
          if (matchInAllMachines) {
            const resolvedSize = getMachineDisplaySize(matchInAllMachines) !== 'Size not available'
              ? getMachineDisplaySize(matchInAllMachines)
              : planSize;
            map.set(p.machineNumber, {
              ...matchInAllMachines,
              machineSize: resolvedSize,
              model: resolvedSize,
              machineModel: resolvedSize,
              responsibleDepartment: matchInAllMachines.responsibleDepartment || matchInAllMachines.currentDepartment || '02 Planning',
              currentDepartment: matchInAllMachines.currentDepartment || '02 Planning',
              currentWork: matchInAllMachines.currentWork || p.operationWork || p.task || p.process || 'Planned Work',
              process: matchInAllMachines.process || p.process,
              responsibleEmployee: matchInAllMachines.responsibleEmployee || p.responsibleEmployee,
              plannedStartDate: matchInAllMachines.plannedStartDate || p.plannedStartDate,
              plannedDueDate: matchInAllMachines.plannedDueDate || p.plannedEndDate,
              dueDate: matchInAllMachines.dueDate || p.plannedEndDate,
              project: matchInAllMachines.project || p.project,
              customer: matchInAllMachines.customer || p.customer,
            });
          } else {
            // Synthesize from monthly plan so it appears in shop floor monitoring as planned pipeline
            map.set(p.machineNumber, {
              id: `plan_${p.id || p.machineNumber}`,
              machineNumber: p.machineNumber,
              machineSize: planSize,
              machineModel: planSize,
              model: planSize,
              specification: planSize,
              project: p.project || '',
              customer: p.customer || '',
              currentDepartment: '02 Planning',
              responsibleDepartment: '02 Planning',
              currentWork: p.operationWork || p.task || p.process || 'Planned Department Work',
              process: p.process || '',
              responsibleEmployee: p.responsibleEmployee || '',
              currentEmployee: p.responsibleEmployee || '',
              progress: p.achievementPercent || 0,
              overallProgressPercent: p.achievementPercent || 0,
              status: (p.status as any) || 'PLANNED',
              currentStatus: (p.status as any) || 'Planned',
              plannedStartDate: p.plannedStartDate || '',
              plannedDueDate: p.plannedEndDate || '',
              dueDate: p.plannedEndDate || '',
              createdAt: p.createdAt || new Date().toISOString(),
              updatedAt: p.updatedAt || new Date().toISOString(),
            });
          }
        }
      });
    }

    // 3. Incorporate live tasks from department_work assigned to this department
    if (departmentWork && departmentWork.length > 0) {
      departmentWork.forEach((dw) => {
        if (!dw.machineNumber) return;
        if (!isDepartmentMatch(dw.department, currentDepartment)) return;

        const dwSize = getMachineDisplaySize(dw as any) !== 'Size not available'
          ? getMachineDisplaySize(dw as any)
          : (dw.machineSize || dw.machineModel || dw.specification || 'Standard');

        if (map.has(dw.machineNumber)) {
          const existing = map.get(dw.machineNumber)!;
          const resolvedSize = getMachineDisplaySize(existing) !== 'Size not available'
            ? getMachineDisplaySize(existing)
            : dwSize;
          map.set(dw.machineNumber, {
            ...existing,
            machineSize: resolvedSize,
            model: resolvedSize,
            machineModel: resolvedSize,
            currentWork: existing.currentWork || dw.operation || 'Department Work',
            responsibleEmployee: existing.responsibleEmployee || dw.employee,
            currentEmployee: existing.currentEmployee || dw.employee,
            status: dw.status || existing.status,
            currentStatus: dw.status || existing.currentStatus,
            progress: dw.progress !== undefined ? dw.progress : existing.progress,
            overallProgressPercent: dw.progress !== undefined ? dw.progress : existing.overallProgressPercent,
          });
        } else {
          const matchInAllMachines = machines.find((m) => areMachineNumbersEqual(m.machineNumber, dw.machineNumber));
          if (matchInAllMachines) {
            const resolvedSize = getMachineDisplaySize(matchInAllMachines) !== 'Size not available'
              ? getMachineDisplaySize(matchInAllMachines)
              : dwSize;
            map.set(dw.machineNumber, {
              ...matchInAllMachines,
              machineSize: resolvedSize,
              model: resolvedSize,
              machineModel: resolvedSize,
              currentDepartment: matchInAllMachines.currentDepartment || currentDepartment,
              responsibleDepartment: matchInAllMachines.responsibleDepartment || matchInAllMachines.currentDepartment || currentDepartment,
              departmentProgress: dw.progress !== undefined ? dw.progress : matchInAllMachines.departmentProgress,
              currentWork: dw.operationWork || dw.operation || dw.title || matchInAllMachines.currentWork || 'Department Work',
              responsibleEmployee: matchInAllMachines.responsibleEmployee || dw.employee,
              currentEmployee: matchInAllMachines.currentEmployee || dw.employee,
              assignedDate: dw.assignedDate || matchInAllMachines.assignedDate,
              targetDate: dw.targetDate || dw.dueDate || matchInAllMachines.targetDate,
              dueDate: dw.dueDate || dw.targetDate || matchInAllMachines.dueDate,
              priority: dw.priority || matchInAllMachines.priority,
              specification: resolvedSize,
              status: dw.status || matchInAllMachines.status,
              currentStatus: dw.status || matchInAllMachines.currentStatus,
              progress: dw.progress !== undefined ? dw.progress : matchInAllMachines.progress,
              overallProgressPercent: matchInAllMachines.overallProgressPercent || dw.progress || 0,
            });
          } else {
            map.set(dw.machineNumber, {
              id: `dw_${dw.id || dw.machineNumber}`,
              machineNumber: dw.machineNumber,
              machineSize: dwSize,
              machineModel: dwSize,
              model: dwSize,
              specification: dwSize,
              project: '',
              customer: '',
              currentDepartment: currentDepartment,
              responsibleDepartment: currentDepartment,
              currentWork: dw.operation || 'Department Work',
              process: '',
              responsibleEmployee: dw.employee || '',
              currentEmployee: dw.employee || '',
              progress: dw.progress || 0,
              overallProgressPercent: dw.progress || 0,
              status: dw.status || 'IN_PROGRESS',
              currentStatus: dw.status || 'In Progress',
              plannedStartDate: dw.startDate || '',
              plannedDueDate: dw.dueDate || '',
              dueDate: dw.dueDate || '',
              createdAt: dw.createdAt || new Date().toISOString(),
              updatedAt: dw.updatedAt || new Date().toISOString(),
            });
          }
        }
      });
    }

    // 4. Incorporate machines previously completed and handed over by currentDepartment
    machines.forEach((m) => {
      if (
        m.previousDepartment &&
        isDepartmentMatch(m.previousDepartment, currentDepartment) &&
        !map.has(m.machineNumber)
      ) {
        map.set(m.machineNumber, { ...m });
      }
    });

    return Array.from(map.values());
  }, [machines, monthlyPlans, departmentWork, currentDepartment]);

  // Helper: Quality Status resolution
  const getMachineQualityStatus = (m: Machine) => {
    if (qualityRejections && qualityRejections.length > 0) {
      const activeRejection = qualityRejections.find(
        (qr) => qr.machineNumber === m.machineNumber && qr.status !== 'Accepted'
      );
      if (activeRejection) {
        return {
          text: 'REJECTED',
          badge: 'bg-rose-100 text-rose-800 border-rose-300 font-bold ring-1 ring-rose-400',
          isRejected: true,
        };
      }
    }

    if (qualityChecks && qualityChecks.length > 0) {
      const qc = qualityChecks.find((c) => c.machineNumber === m.machineNumber);
      if (qc) {
        const st = String(qc.status || '');
        if (st === 'Approved' || st === 'Accepted' || st === 'Accept') {
          return { text: 'Passed', badge: 'bg-emerald-100 text-emerald-800 border-emerald-200' };
        }
        if (st === 'Pending' || st === 'Hold') {
          return { text: 'Pending QC', badge: 'bg-amber-100 text-amber-800 border-amber-200' };
        }
        if (st === 'Rejected' || st === 'Reject') {
          return { text: 'Rejected', badge: 'bg-rose-100 text-rose-800 border-rose-200', isRejected: true };
        }
      }
    }

    if (m.qualityStatus) {
      if (m.qualityStatus.toLowerCase().includes('reject')) {
        return { text: m.qualityStatus, badge: 'bg-rose-100 text-rose-800 border-rose-200', isRejected: true };
      }
      if (m.qualityStatus.toLowerCase().includes('pass') || m.qualityStatus.toLowerCase().includes('accept')) {
        return { text: m.qualityStatus, badge: 'bg-emerald-100 text-emerald-800 border-emerald-200' };
      }
      return { text: m.qualityStatus, badge: 'bg-amber-100 text-amber-800 border-amber-200' };
    }

    return { text: 'N/A', badge: 'bg-slate-100 text-slate-600 border-slate-200' };
  };

  // Available Months dynamically computed from real database data (Requirement 2)
  const availableMonths = useMemo(() => {
    const monthSet = new Set<string>();
    // 1. From monthlyPlans
    monthlyPlans.forEach((p) => {
      if (p.month) {
        const yr = p.year || (p.createdAt ? new Date(p.createdAt).getFullYear() : 2026);
        monthSet.add(`${p.month} ${yr}`.trim());
      }
    });
    // 2. From machines
    machines.forEach((m) => {
      if (m.planMonth) {
        const yr = m.planYear || 2026;
        monthSet.add(`${m.planMonth} ${yr}`.trim());
      } else if (m.plannedStartDate) {
        const d = new Date(m.plannedStartDate);
        if (!isNaN(d.getTime())) {
          const mName = d.toLocaleString('en-US', { month: 'long' });
          monthSet.add(`${mName} ${d.getFullYear()}`);
        }
      }
    });
    // 3. From departmentWork
    departmentWork.forEach((w) => {
      const dStr = w.dueDate || w.assignedDate || w.createdAt;
      if (dStr) {
        const d = new Date(dStr);
        if (!isNaN(d.getTime())) {
          const mName = d.toLocaleString('en-US', { month: 'long' });
          monthSet.add(`${mName} ${d.getFullYear()}`);
        }
      }
    });

    const monthOrder: Record<string, number> = {
      january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
      july: 7, august: 8, september: 9, october: 10, november: 11, december: 12
    };

    return Array.from(monthSet).sort((a, b) => {
      const [mA, yA] = a.toLowerCase().split(' ');
      const [mB, yB] = b.toLowerCase().split(' ');
      const yrDiff = (Number(yA) || 2026) - (Number(yB) || 2026);
      if (yrDiff !== 0) return yrDiff;
      return (monthOrder[mA] || 0) - (monthOrder[mB] || 0);
    });
  }, [monthlyPlans, machines, departmentWork]);

  // Available Weeks dynamically computed from real database data (Requirement 3 & 4)
  const availableWeeks = useMemo(() => {
    const weekSet = new Set<string>();
    weeklyPlans.forEach((w) => {
      if (w.weekNumber) weekSet.add(`Week ${w.weekNumber}`);
      else if (w.weekStartDate) weekSet.add(`Week ${w.weekStartDate}`);
    });
    machines.forEach((m) => {
      if (m.weekNumber) weekSet.add(m.weekNumber);
    });
    return ['All Weeks', ...Array.from(weekSet).sort()];
  }, [weeklyPlans, machines]);

  // Available Machine Sizes dynamically computed across all machines and plans (Requirement 4)
  const availableMachineSizes = useMemo(() => {
    const sizeSet = new Set<string>();
    machines.forEach((m) => {
      const sz = getMachineDisplaySize(m);
      if (sz && sz !== 'Size not available') sizeSet.add(sz);
      if (m.machineSize) sizeSet.add(m.machineSize.trim());
      if (m.size) sizeSet.add(m.size.trim());
      if (m.specification) sizeSet.add(m.specification.trim());
    });
    monthlyPlans.forEach((p) => {
      if (p.machineSize) sizeSet.add(p.machineSize.trim());
      if (p.machineModel) sizeSet.add(p.machineModel.trim());
    });
    departmentMachines.forEach((m) => {
      const sz = getMachineDisplaySize(m);
      if (sz && sz !== 'Size not available') sizeSet.add(sz);
    });

    const list = Array.from(sizeSet).filter((s) => s && s.toLowerCase() !== 'standard');
    list.sort((a, b) => {
      const numA = parseInt(a.replace(/\D/g, ''), 10);
      const numB = parseInt(b.replace(/\D/g, ''), 10);
      if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
      return a.localeCompare(b);
    });
    return ['All Sizes', ...list];
  }, [machines, monthlyPlans, departmentMachines]);

  // Helper: Delay Info resolution (Requirement 7: Target Date vs Today & Days Late)
  const getMachineDelayInfo = (
    m: Machine
  ): { isDelayed: boolean; text: string; daysOverdue?: number; reason?: string } => {
    const prog = m.progress !== undefined ? m.progress : m.overallProgressPercent || 0;
    const isCompleted = prog >= 100 || m.status === 'COMPLETED' || m.currentStatus === 'COMPLETED';

    if (isCompleted) {
      return { isDelayed: false, text: '-' };
    }

    const targetDate = m.targetDate || m.plannedDueDate || m.dueDate;
    if (targetDate) {
      const due = new Date(targetDate).getTime();
      const now = new Date().setHours(0, 0, 0, 0);
      if (now > due) {
        const diffDays = Math.max(1, Math.ceil((now - due) / (1000 * 60 * 60 * 24)));
        return {
          isDelayed: true,
          text: `DELAYED (${diffDays}d Late)`,
          daysOverdue: diffDays,
          reason: m.delayReason || `${diffDays} days past target date`,
        };
      }
    }

    if (m.delayReason || m.status === 'DELAYED' || m.status === 'BLOCKED') {
      return {
        isDelayed: true,
        text: 'DELAYED',
        daysOverdue: m.delayDays || 1,
        reason: m.delayReason || 'Department Delay Reported',
      };
    }

    return { isDelayed: false, text: '-' };
  };

  // Filtered list based on filterTab, selectedMonth, selectedWeek, and searchQuery
  const filteredMachines = departmentMachines.filter((m) => {
    const q = searchQuery.toLowerCase().trim();
    if (q) {
      const matchesNum = m.machineNumber.toLowerCase().includes(q);
      const matchesModel = (m.model || m.machineModel || '').toLowerCase().includes(q);
      const matchesWork = (m.currentWork || '').toLowerCase().includes(q);
      const matchesEmp = (m.responsibleEmployee || m.currentEmployee || '').toLowerCase().includes(q);
      if (!matchesNum && !matchesModel && !matchesWork && !matchesEmp) return false;
    }

    // Month-wise filter (Requirement 2)
    if (selectedMonth !== 'All Months') {
      let matchesMonth = false;
      const { month: selMonth, year: selYear } = cleanMonthYear(selectedMonth);

      if (m.planMonth) {
        const { month: mM, year: mY } = cleanMonthYear(m.planMonth, m.planYear);
        if (mM.toLowerCase() === selMonth.toLowerCase() && (selYear ? mY === selYear : true)) matchesMonth = true;
      }
      if (!matchesMonth && (m.month || (m as any).planMonth)) {
        const { month: mM, year: mY } = cleanMonthYear(m.month || (m as any).planMonth, m.year || (m as any).planYear);
        if (mM.toLowerCase() === selMonth.toLowerCase() && (selYear ? mY === selYear : true)) matchesMonth = true;
      }
      if (!matchesMonth) {
        const plan = monthlyPlans.find((p) => areMachineNumbersEqual(p.machineNumber, m.machineNumber));
        if (plan?.month) {
          const { month: pM, year: pY } = cleanMonthYear(plan.month, plan.year);
          if (pM.toLowerCase() === selMonth.toLowerCase() && (selYear ? pY === selYear : true)) matchesMonth = true;
        }
      }
      if (!matchesMonth) {
        const dStr = m.plannedStartDate || m.targetDate || m.dueDate || m.createdAt;
        if (dStr) {
          const d = new Date(dStr);
          if (!isNaN(d.getTime())) {
            const mName = d.toLocaleString('en-US', { month: 'long' });
            if (mName.toLowerCase() === selMonth.toLowerCase() && (selYear ? String(d.getFullYear()) === selYear : true)) matchesMonth = true;
          }
        }
      }
      if (!matchesMonth) return false;
    }

    // Week-wise filter (Requirement 3)
    if (selectedWeek !== 'All Weeks') {
      let matchesWeek = false;
      if (m.weekNumber && m.weekNumber.toLowerCase() === selectedWeek.toLowerCase()) {
        matchesWeek = true;
      }
      if (!matchesWeek) {
        const wp = weeklyPlans.find((w) => w.machineNumber === m.machineNumber);
        if (wp) {
          const wLabel = wp.weekNumber ? `Week ${wp.weekNumber}` : `Week ${wp.weekStartDate}`;
          if (wLabel.toLowerCase() === selectedWeek.toLowerCase()) matchesWeek = true;
        }
      }
      if (!matchesWeek) return false;
    }

    // Machine Size Filter (Requirement 4)
    if (selectedSize !== 'All Sizes') {
      const displaySize = getMachineDisplaySize(m);
      const rawSize = m.machineSize || m.size || m.model || m.machineModel || m.specification || '';
      const plan = monthlyPlans.find((p) => areMachineNumbersEqual(p.machineNumber, m.machineNumber));
      const planSize = plan?.machineSize || plan?.machineModel || '';

      const match =
        (displaySize && displaySize.toLowerCase().includes(selectedSize.toLowerCase())) ||
        (rawSize && rawSize.toLowerCase().includes(selectedSize.toLowerCase())) ||
        (planSize && planSize.toLowerCase().includes(selectedSize.toLowerCase()));

      if (!match) return false;
    }

    const ops = getOperationsForMachineDepartment(m, currentDepartment, qualityOpsList);
    const opsStats = calculateOperationsProgress(ops);
    const prog = opsStats.total > 0 ? opsStats.progressPercent : (m.departmentProgress !== undefined ? m.departmentProgress : (m.progress !== undefined ? m.progress : 0));
    const isCompleted = prog >= 100 || m.status === 'COMPLETED' || m.currentStatus === 'COMPLETED';
    const delayInfo = getMachineDelayInfo(m);
    const isDelayed = delayInfo.isDelayed;
    const qualityStatus = getMachineQualityStatus(m);

    if (filterTab === 'not_started') {
      return (prog === 0 || !prog) && !isCompleted;
    }
    if (filterTab === 'in_progress') {
      return prog > 0 && prog < 100 && !isCompleted;
    }
    if (filterTab === 'completed') {
      return isCompleted || prog >= 100;
    }
    if (filterTab === 'delayed') {
      return isDelayed || m.status === 'DELAYED';
    }
    if (filterTab === 'ready_handover') {
      return (prog >= 100 || isCompleted) && m.handoverStatus !== 'ACCEPTED';
    }
    if (filterTab === 'waiting_handover') {
      return m.handoverStatus === 'PENDING_ACCEPTANCE';
    }
    if (filterTab === 'quality_hold') {
      return qualityStatus.text.toLowerCase().includes('hold') || m.status === 'QUALITY_HOLD' || m.currentStatus === 'Quality Hold';
    }
    if (filterTab === 'rejected') {
      return qualityStatus.text.toLowerCase().includes('reject') || m.isReturned || m.status === 'RETURNED';
    }
    if (filterTab === 'incoming') {
      return m.handoverStatus === 'PENDING_ACCEPTANCE';
    }
    return true;
  });

  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);

  // Calculate live operations progress stats for the active machine in the modal
  const modalOpsStats = useMemo(() => {
    return calculateOperationsProgress(modalOperations, todayStr);
  }, [modalOperations, todayStr]);

  // Open Update Progress Modal (Requirement 1, 2, 3 & 4: Operations-Based Tracking)
  const handleOpenUpdateProgress = async (m: Machine) => {
    if (!canUserEditMachine(m)) {
      setToast({
        type: 'error',
        text: `ACCESS DENIED: Machine ${m.machineNumber} is owned by ${m.responsibleDepartment || m.currentDepartment}. Only users of that department can update work progress.`,
      });
      return;
    }

    const ops = getOperationsForMachineDepartment(m, currentDepartment, qualityOpsList);
    // Find operations already completed on today's date
    const alreadyTodayOpIds = ops
      .filter((o) => o.status === 'Completed' && (o.completedDate === todayStr || o.completedToday))
      .map((o) => o.id);

    setModalOperations(ops);
    setNewlyCompletedOpIds(alreadyTodayOpIds);
    setActiveProgressTab('today');
    setOperationsFilter('ALL');
    setSelectedMachineForProgress(m);
    setWorkDescription(m.currentWork || '');
    setOperatorEmployee(m.responsibleEmployee || m.currentEmployee || userProfile?.displayName || userProfile?.username || '');
    setProgressStatus(m.status === 'COMPLETED' ? 'COMPLETED' : m.status || 'IN_PROGRESS');
    setExpectedDate(m.expectedCompletionDate || m.dueDate || m.plannedDueDate || '');
    setDelayReason(m.delayReason || '');
    setProgressRemarks(m.remarks || '');
    setWorkDoneToday('');
    setRemainingWork('');
    setActualQuantity(1);
    setAttachmentUrl('');

    // Fetch daily work history from live database
    setLoadingDailyHistory(true);
    setSelectedHistoryDate(null);
    try {
      const hist = await getDailyWorkHistoryForMachine(m.machineNumber, currentDepartment, ops.length);
      setDailyWorkHistory(hist);
    } catch (err) {
      console.warn('Could not fetch daily work history:', err);
      setDailyWorkHistory([]);
    } finally {
      setLoadingDailyHistory(false);
    }
  };

  // Toggle individual operation in modal (Section 7: Do NOT count already completed operations twice)
  const handleToggleOperation = (opId: string) => {
    const op = modalOperations.find((o) => o.id === opId);
    if (!op) return;

    // Check if operation was completed previously on an earlier day
    const isHistoricalCompleted =
      op.status === 'Completed' &&
      op.completedDate &&
      op.completedDate !== todayStr &&
      !newlyCompletedOpIds.includes(op.id);

    if (isHistoricalCompleted) {
      setToast({
        type: 'warning',
        text: `Operation "${op.operationName || op.name}" was already completed on ${formatDisplayDate(op.completedDate)}${op.completedBy ? ` by ${op.completedBy}` : ''}. Historical completed operations cannot be re-counted.`,
      });
      return;
    }

    const isSelectedToday = newlyCompletedOpIds.includes(opId);

    if (isSelectedToday) {
      // Deselect from today's work
      setNewlyCompletedOpIds((prev) => prev.filter((id) => id !== opId));
      setModalOperations((prev) =>
        prev.map((o) =>
          o.id === opId
            ? {
                ...o,
                status: 'Not Started',
                completedToday: false,
                completedDate: undefined,
                completedBy: undefined,
                workDate: undefined,
              }
            : o
        )
      );
    } else {
      // Select as completed today
      setNewlyCompletedOpIds((prev) => [...prev, opId]);
      setModalOperations((prev) =>
        prev.map((o) =>
          o.id === opId
            ? {
                ...o,
                status: 'Completed',
                completedToday: true,
                completedDate: todayStr,
                workDate: todayStr,
                completedBy: userProfile?.displayName || userProfile?.email || 'Operator',
              }
            : o
        )
      );
    }
  };

  // Save Progress Update (SAVE DAILY UPDATE)
  const handleSubmitProgress = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMachineForProgress) return;

    if (!canUserEditMachine(selectedMachineForProgress)) {
      setToast({
        type: 'error',
        text: 'ACCESS DENIED: You are not authorized to update this machine.',
      });
      return;
    }

    if ((progressStatus === 'BLOCKED' || progressStatus === 'DELAYED') && !delayReason.trim()) {
      setToast({ type: 'warning', text: 'Please specify the Delay/Block Reason before submitting.' });
      return;
    }

    setSavingProgress(true);
    try {
      const res = await saveDailyWorkOperations({
        machine: selectedMachineForProgress,
        department: currentDepartment,
        operations: modalOperations,
        newlyCompletedOpIds,
        remarks: progressRemarks.trim(),
        delayReason: delayReason.trim(),
        workDoneToday: workDoneToday.trim(),
        remainingWork: remainingWork.trim(),
        expectedDate,
        userProfile,
        sendToAdmin: false,
      });

      setToast({
        type: 'success',
        text: `Daily Update Saved! Today's Work: ${res.todayWorkPercent}%, Overall Progress: ${res.departmentProgress}% (${res.completedCount}/${modalOperations.length} operations completed)!`,
      });
      setSelectedMachineForProgress(null);
    } catch (err: any) {
      setToast({
        type: 'error',
        text: err?.message || 'Failed to update machine progress.',
      });
    } finally {
      setSavingProgress(false);
    }
  };

  // Send Progress To Admin (Requirement 4: Saves progress + updates Admin dashboard + creates notification)
  const handleSendProgressToAdmin = async () => {
    if (!selectedMachineForProgress) return;

    if (!canUserEditMachine(selectedMachineForProgress)) {
      setToast({
        type: 'error',
        text: 'ACCESS DENIED: You are not authorized to update this machine.',
      });
      return;
    }

    setSendingToAdmin(true);
    try {
      const res = await saveDailyWorkOperations({
        machine: selectedMachineForProgress,
        department: currentDepartment,
        operations: modalOperations,
        newlyCompletedOpIds,
        remarks: progressRemarks.trim(),
        delayReason: delayReason.trim(),
        workDoneToday: workDoneToday.trim(),
        remainingWork: remainingWork.trim(),
        expectedDate,
        userProfile,
        sendToAdmin: true,
      });

      setToast({
        type: 'success',
        text: `Daily Progress (${res.departmentProgress}%) successfully saved and sent to Admin dashboard!`,
      });
      setSelectedMachineForProgress(null);
    } catch (err: any) {
      setToast({
        type: 'error',
        text: err?.message || 'Failed to send progress to Admin.',
      });
    } finally {
      setSendingToAdmin(false);
    }
  };

  // Open Return / Reverse Modal (Requirement 14 & 15)
  const handleOpenReturnModal = (m: Machine) => {
    setSelectedMachineForReturn(m);
    const curIdx = INITIAL_DEPARTMENTS.findIndex((d) => isDepartmentMatch(d.name, m.currentDepartment));
    const defaultTarget = curIdx > 0 ? INITIAL_DEPARTMENTS[curIdx - 1].name : INITIAL_DEPARTMENTS[0].name;
    setReturnTargetDept(defaultTarget);
    setReturnReason('');
    setReturnCorrectiveAction('');
    setReturnRemarks('');
  };

  // Submit Return Machine (Requirement 14 & 15)
  const handleSubmitReturn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMachineForReturn) return;
    if (!returnReason.trim()) {
      setToast({ type: 'warning', text: 'Please specify the Reason for return.' });
      return;
    }
    if (!returnCorrectiveAction.trim()) {
      setToast({ type: 'warning', text: 'Please specify the Corrective Action Required.' });
      return;
    }

    setSubmittingReturn(true);
    try {
      await returnMachineOfficially({
        machineId: selectedMachineForReturn.id,
        machineNumber: selectedMachineForReturn.machineNumber,
        currentDepartment: selectedMachineForReturn.currentDepartment,
        targetDepartment: returnTargetDept,
        returnReason,
        correctiveActionRequired: returnCorrectiveAction,
        remarks: returnRemarks,
        returnedBy: userProfile?.displayName || userProfile?.email || 'Quality / Admin',
        userEmail: userProfile?.email,
      });

      setToast({
        type: 'success',
        text: `Machine ${selectedMachineForReturn.machineNumber} officially returned to ${returnTargetDept} for correction. Target department unlocked!`,
      });
      setSelectedMachineForReturn(null);
    } catch (err: any) {
      setToast({
        type: 'error',
        text: err?.message || 'Failed to return machine.',
      });
    } finally {
      setSubmittingReturn(false);
    }
  };

  // Open Complete Work Modal (Requirement 12)
  const handleOpenCompleteModal = (m: Machine) => {
    if (!canUserEditMachine(m)) {
      setToast({
        type: 'error',
        text: `ACCESS DENIED: Machine ${m.machineNumber} is owned by ${m.responsibleDepartment || m.currentDepartment}.`,
      });
      return;
    }

    setSelectedMachineForComplete(m);
    setCompletionDate(new Date().toISOString().split('T')[0]);
    setFinalQuantity(1);
    setCompletionRemarks('Work validated and marked 100% complete.');
    setCompletionAttachment('');
  };

  // Submit Complete Work (Requirement 12)
  const handleSubmitCompleteWork = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMachineForComplete) return;

    setSavingCompletion(true);
    try {
      await completeMachineWork({
        machineId: selectedMachineForComplete.id,
        machineNumber: selectedMachineForComplete.machineNumber,
        department: currentDepartment,
        employee: userProfile?.displayName || userProfile?.username || 'Operator',
        actualCompletionDate: completionDate,
        actualQuantity: Number(finalQuantity) || 1,
        remarks: completionRemarks.trim() || 'Work validated and marked 100% complete.',
        attachmentUrl: completionAttachment.trim(),
        userProfile,
      });

      setToast({
        type: 'success',
        text: `Machine ${selectedMachineForComplete.machineNumber} marked 100% COMPLETED. Ready for handover!`,
      });
      setSelectedMachineForComplete(null);
    } catch (err: any) {
      setToast({
        type: 'error',
        text: err?.message || 'Failed to complete machine work.',
      });
    } finally {
      setSavingCompletion(false);
    }
  };

  // Open Handover Modal (Requirement 11 & 13)
  const handleOpenHandover = (m: Machine) => {
    if (!canUserEditMachine(m)) {
      setToast({
        type: 'error',
        text: `ACCESS DENIED: Machine ${m.machineNumber} is owned by ${m.responsibleDepartment || m.currentDepartment}.`,
      });
      return;
    }

    const curProg = m.departmentProgress !== undefined ? m.departmentProgress : (m.progress !== undefined ? m.progress : m.overallProgressPercent || 0);
    const isCompleted = curProg >= 100 || m.status === 'COMPLETED' || m.currentStatus === 'COMPLETED' || m.status === 'READY_FOR_HANDOVER';

    // 100% Completion Rule
    if (!isCompleted && !isAdmin) {
      setToast({
        type: 'warning',
        text: 'Complete the assigned work to 100% or click Complete Work before handover.',
      });
      return;
    }

    // Quality check: only block if explicitly rejected or on active quality hold
    const qStatus = getMachineQualityStatus(m);
    const hasQualityBlock = qStatus.isRejected || qStatus.text === 'REJECTED' || qStatus.text.toLowerCase().includes('hold');
    if (hasQualityBlock && !isAdmin) {
      setToast({
        type: 'warning',
        text: `Cannot handover: Machine has quality issue (${qStatus.text}). Please resolve with Quality before handover.`,
      });
      return;
    }

    setSelectedMachineForHandover(m);
    setConfirmCompletedWork(false);
    const suggestedNext = getNextDepartmentForMachine(m, currentDepartment) || getNextDepartmentInRoute(currentDepartment) || '';
    setTargetDepartment(suggestedNext);
    setHandoverWorkDesc(`Transfer from ${currentDepartment} to next station`);
    setHandoverPriority('Medium');
    setHandoverRemarks(`Work 100% completed at ${currentDepartment}. Handed over to next station.`);
  };

  // Dispatch Handover
  const handleSubmitHandover = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMachineForHandover) return;

    if (!confirmCompletedWork && !isAdmin) {
      setToast({ type: 'warning', text: 'Please check the confirmation box verifying that all assigned work is 100% completed.' });
      return;
    }

    if (!targetDepartment.trim()) {
      setToast({ type: 'warning', text: 'Please select the Receiving Department.' });
      return;
    }

    if (isDepartmentMatch(currentDepartment, targetDepartment)) {
      setToast({ type: 'warning', text: 'Receiving Department cannot be the same as current department.' });
      return;
    }

    setDispatchingHandover(true);
    try {
      const resolvedSize = getMachineDisplaySize(selectedMachineForHandover) !== 'Size not available'
        ? getMachineDisplaySize(selectedMachineForHandover)
        : (selectedMachineForHandover.machineSize || selectedMachineForHandover.model || selectedMachineForHandover.machineModel || 'Standard');

      await createHandover(
        {
          machineNumber: selectedMachineForHandover.machineNumber,
          machineModel: resolvedSize,
          machineSize: resolvedSize,
          modelSize: resolvedSize,
          fromDepartment: currentDepartment,
          toDepartment: targetDepartment,
          operation: handoverWorkDesc.trim() || `Completed stage at ${currentDepartment}`,
          priority: handoverPriority,
          employee: userProfile?.displayName || userProfile?.username || 'Operator',
          remarks: handoverRemarks.trim() || `Machine work 100% completed at ${currentDepartment}. Handed over to ${targetDepartment}.`,
        },
        userProfile?.email
      );

      setToast({
        type: 'success',
        text: `Machine ${selectedMachineForHandover.machineNumber} successfully dispatched to ${targetDepartment}! Pending their acceptance.`,
      });
      setSelectedMachineForHandover(null);
    } catch (err: any) {
      setToast({
        type: 'error',
        text: err?.message || 'Failed to dispatch handover.',
      });
    } finally {
      setDispatchingHandover(false);
    }
  };

  // Accept incoming handover
  const handleAcceptIncoming = async (handover: DepartmentHandover) => {
    try {
      await acceptHandover(
        handover.id,
        {
          acceptedBy: userProfile?.displayName || userProfile?.username || 'Operator',
          remarks: `Accepted at ${currentDepartment} by ${userProfile?.displayName || 'Operator'}. Ready to begin work.`,
        },
        userProfile?.email
      );

      setToast({
        type: 'success',
        text: `Machine ${handover.machineNumber} accepted by ${currentDepartment}! It is now on your Shop Floor.`,
      });
    } catch (err: any) {
      setToast({
        type: 'error',
        text: err?.message || 'Failed to accept handover.',
      });
    }
  };

  // Reject incoming handover (returns machine to originating department)
  const handleSubmitRejectIncoming = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedIncomingForReject) return;
    if (!incomingRejectionReason.trim()) {
      setToast({ type: 'warning', text: 'Rejection reason is required.' });
      return;
    }

    setRejectingHandover(true);
    try {
      await rejectHandover(
        selectedIncomingForReject.id,
        {
          rejectedBy: userProfile?.displayName || userProfile?.username || 'Operator',
          rejectionReason: incomingRejectionReason.trim(),
          remarks: incomingRejectionRemarks.trim(),
        },
        userProfile?.email
      );

      const senderDept = selectedIncomingForReject.fromDepartment || selectedIncomingForReject.sendingDepartment || 'originating department';
      setToast({
        type: 'success',
        text: `Handover for Machine ${selectedIncomingForReject.machineNumber} rejected and returned to ${senderDept} for rework.`,
      });
      setSelectedIncomingForReject(null);
      setIncomingRejectionReason('');
      setIncomingRejectionRemarks('');
    } catch (err: any) {
      setToast({
        type: 'error',
        text: err?.message || 'Failed to reject handover.',
      });
    } finally {
      setRejectingHandover(false);
    }
  };

  // Start work on machine
  const handleStartWork = async (m: Machine) => {
    if (!canUserEditMachine(m)) {
      setToast({
        type: 'error',
        text: `ACCESS DENIED: Machine ${m.machineNumber} is owned by ${m.responsibleDepartment || m.currentDepartment}.`,
      });
      return;
    }

    try {
      await recordMachineProgressUpdate({
        machineId: m.id,
        machineNumber: m.machineNumber,
        department: currentDepartment,
        currentWork: m.currentWork || `Work started at ${currentDepartment}`,
        employee: userProfile?.displayName || 'Operator',
        date: new Date().toISOString().split('T')[0],
        previousProgress: 0,
        newProgress: Math.max(m.progress || 0, 5),
        status: 'IN_PROGRESS',
        remarks: 'Work officially initiated on shop floor.',
        userProfile,
      });

      setToast({
        type: 'success',
        text: `Work started on Machine ${m.machineNumber}! Status is now IN_PROGRESS.`,
      });
    } catch (err: any) {
      setToast({
        type: 'error',
        text: err?.message || 'Failed to start work.',
      });
    }
  };

  // Send to Quality (Requirement 11 & 12)
  const handleOpenSendToQuality = (m: Machine) => {
    if (!canUserEditMachine(m)) {
      setToast({
        type: 'error',
        text: `ACCESS DENIED: Machine ${m.machineNumber} is owned by ${m.responsibleDepartment || m.currentDepartment}.`,
      });
      return;
    }
    setSelectedMachineForQuality(m);
    setQualityHandoverOperation(m.currentWork || `Process verification at ${currentDepartment}`);
    setQualityHandoverPriority('Medium');
    setQualityHandoverRemarks(`Handed over from ${currentDepartment} to Quality for inspection.`);
  };

  const handleSubmitQualityHandover = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMachineForQuality) return;

    setSubmittingQualityHandover(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      await createQualityHandover(
        {
          machineNumber: selectedMachineForQuality.machineNumber,
          machineModel: selectedMachineForQuality.model || selectedMachineForQuality.machineModel || 'Standard',
          sendingDepartment: currentDepartment,
          receivingDepartment: '04 Inward Quality',
          operation: qualityHandoverOperation.trim() || 'Quality Inspection',
          work: qualityHandoverOperation.trim(),
          quantity: 1,
          priority: qualityHandoverPriority,
          handoverDate: today,
          employee: userProfile?.displayName || userProfile?.email || 'Operator',
          remarks: qualityHandoverRemarks.trim(),
          status: 'SENT_TO_QUALITY',
          createdBy: userProfile?.email || 'Operator',
        },
        userProfile?.email
      );

      setToast({
        type: 'success',
        text: `Machine ${selectedMachineForQuality.machineNumber} successfully sent to Quality for inspection! Incoming queue & notification sent.`,
      });
      setSelectedMachineForQuality(null);
    } catch (err: any) {
      setToast({
        type: 'error',
        text: err?.message || 'Failed to send machine to Quality.',
      });
    } finally {
      setSubmittingQualityHandover(false);
    }
  };

  // KPI Calculations
  const totalDeptMachines = departmentMachines.length;
  const inProgressCount = departmentMachines.filter((m) => {
    const p = m.progress !== undefined ? m.progress : m.overallProgressPercent || 0;
    return p > 0 && p < 100 && m.status !== 'COMPLETED';
  }).length;
  const completedCount = departmentMachines.filter((m) => {
    const p = m.progress !== undefined ? m.progress : m.overallProgressPercent || 0;
    return p >= 100 || m.status === 'COMPLETED' || m.status === 'READY_FOR_HANDOVER';
  }).length;
  const delayedCount = departmentMachines.filter((m) => !!m.delayReason || m.status === 'DELAYED' || m.status === 'BLOCKED').length;

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {toast && (
        <div
          className={`p-4 rounded-xl flex items-center justify-between shadow-lg text-sm font-semibold transition-all ${
            toast.type === 'success'
              ? 'bg-emerald-600 text-white shadow-emerald-600/20'
              : toast.type === 'warning'
              ? 'bg-amber-600 text-white shadow-amber-600/20'
              : 'bg-rose-600 text-white shadow-rose-600/20'
          }`}
        >
          <div className="flex items-center gap-3">
            {toast.type === 'success' && <CheckCircle2 className="w-5 h-5 shrink-0" />}
            {toast.type === 'warning' && <AlertTriangle className="w-5 h-5 shrink-0" />}
            {toast.type === 'error' && <ShieldAlert className="w-5 h-5 shrink-0" />}
            <span>{toast.text}</span>
          </div>
          <button
            onClick={() => setToast(null)}
            className="p-1 hover:bg-white/20 rounded-lg transition-colors ml-4"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Header Banner */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider bg-blue-100 text-blue-700">
              Department Shop Floor
            </span>
            <span className="text-xs font-semibold text-slate-500">
              Department: <strong className="text-slate-900">{currentDepartment}</strong>
            </span>
          </div>
          <h2 className="text-xl font-bold text-slate-900 mt-1">
            Machine-Wise Production Monitoring &amp; Ownership
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Strict department ownership: only {currentDepartment} can update progress on assigned machines. Work must reach 100% before formal handover.
          </p>
        </div>

        {/* Suggest Next Dept Route Info */}
        <div className="flex items-center gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
          <div className="text-right">
            <div className="text-[10px] uppercase font-bold text-slate-400">Standard Next Route</div>
            <div className="text-xs font-bold text-blue-600">
              {getNextDepartmentInRoute(currentDepartment) || 'Final Inspection / Dispatch'}
            </div>
          </div>
          <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
            <ArrowRight className="w-4 h-4" />
          </div>
        </div>
      </div>

      {/* KPI Stats Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="text-xs text-slate-500 font-medium">Assigned to Dept</div>
          <div className="text-2xl font-bold text-slate-900 mt-1">{totalDeptMachines}</div>
          <div className="text-[11px] text-slate-400 mt-0.5">Real machines at {currentDepartment}</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="text-xs text-blue-600 font-medium flex items-center gap-1">
            <Clock className="w-3.5 h-3.5" />
            <span>Work In Progress</span>
          </div>
          <div className="text-2xl font-bold text-blue-600 mt-1">{inProgressCount}</div>
          <div className="text-[11px] text-slate-400 mt-0.5">Actively updating progress</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="text-xs text-emerald-600 font-medium flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>100% Completed</span>
          </div>
          <div className="text-2xl font-bold text-emerald-600 mt-1">{completedCount}</div>
          <div className="text-[11px] text-slate-400 mt-0.5">Ready for formal handover</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="text-xs text-amber-600 font-medium flex items-center gap-1">
            <ArrowRightLeft className="w-3.5 h-3.5" />
            <span>Incoming Handovers</span>
          </div>
          <div className="text-2xl font-bold text-amber-600 mt-1">{incomingHandovers.length}</div>
          <div className="text-[11px] text-slate-400 mt-0.5">Pending acceptance</div>
        </div>
      </div>

      {/* INCOMING HANDOVERS BANNER (If any pending incoming handovers) */}
      {incomingHandovers.length > 0 && (
        <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-2xl p-5 shadow-xs">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="p-1.5 bg-amber-500 text-white rounded-lg">
                <ArrowRightLeft className="w-4 h-4" />
              </span>
              <div>
                <h3 className="text-sm font-bold text-amber-900">
                  Incoming Machine Handovers ({incomingHandovers.length} Pending Acceptance)
                </h3>
                <p className="text-xs text-amber-700">
                  Other departments have completed their 100% work and dispatched these machines to {currentDepartment}. Accept to take ownership.
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            {incomingHandovers.map((h) => (
              <div
                key={h.id}
                className="bg-white p-3 rounded-xl border border-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-slate-900">{h.machineNumber}</span>
                    <span className="text-xs px-2 py-0.5 bg-slate-100 text-slate-700 font-medium rounded-md">
                      {h.machineModel || 'Machine Model'}
                    </span>
                    <span className="text-xs text-slate-400 font-mono">[{h.handoverId}]</span>
                  </div>
                  <div className="text-xs text-slate-600 mt-1">
                    Sent by <strong className="text-slate-800">{h.fromDepartment || h.sendingDepartment}</strong>: {h.operation || h.workDescription}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => handleAcceptIncoming(h)}
                    className="px-3.5 py-1.5 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg shadow-xs flex items-center gap-1.5 transition-colors"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Accept Machine</span>
                  </button>
                  <button
                    onClick={() => {
                      setSelectedIncomingForReject(h);
                      setIncomingRejectionReason('');
                      setIncomingRejectionRemarks('');
                    }}
                    className="px-3 py-1.5 text-xs font-bold bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg flex items-center gap-1.5 transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                    <span>Reject Handover</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filter Tabs & Search Bar */}
      <div className="flex flex-col xl:flex-row items-stretch xl:items-center justify-between gap-3 bg-white p-3 rounded-xl border border-slate-200">
        <div className="flex items-center gap-1 overflow-x-auto pb-1 xl:pb-0">
          <button
            onClick={() => setFilterTab('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors whitespace-nowrap ${
              filterTab === 'all'
                ? 'bg-slate-900 text-white'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            All Machines ({departmentMachines.length})
          </button>
          <button
            onClick={() => setFilterTab('in_progress')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors whitespace-nowrap ${
              filterTab === 'in_progress'
                ? 'bg-blue-600 text-white'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            In Progress ({inProgressCount})
          </button>
          <button
            onClick={() => setFilterTab('completed')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors whitespace-nowrap ${
              filterTab === 'completed'
                ? 'bg-emerald-600 text-white'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            100% Completed ({completedCount})
          </button>
          <button
            onClick={() => setFilterTab('delayed')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors whitespace-nowrap ${
              filterTab === 'delayed'
                ? 'bg-amber-600 text-white'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            Delayed ({delayedCount})
          </button>
          <button
            onClick={() => setFilterTab('incoming')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors whitespace-nowrap ${
              filterTab === 'incoming'
                ? 'bg-purple-600 text-white'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            New Machine Received ({incomingHandovers.length})
          </button>
        </div>

        {/* Right: Month Dropdown & Week Dropdown & Search */}
        <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 w-full xl:w-auto">
          {/* Machine Size Filter (Requirement 4) */}
          <div className="flex items-center gap-1.5 bg-indigo-50 border border-indigo-300 rounded-lg px-2.5 py-1 text-xs shrink-0 shadow-2xs">
            <Cpu className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
            <span className="font-bold text-indigo-900 text-[11px] uppercase tracking-wide">Size:</span>
            <select
              id="shopfloor-size-select"
              value={selectedSize}
              onChange={(e) => setSelectedSize(e.target.value)}
              className="bg-transparent font-black text-indigo-950 outline-none cursor-pointer text-xs"
            >
              {availableMachineSizes.map((sz) => (
                <option key={sz} value={sz}>
                  {sz === 'All Sizes' ? '📐 All Sizes' : `Size ${sz}`}
                </option>
              ))}
            </select>
            {selectedSize !== 'All Sizes' && (
              <span className="ml-1 px-1.5 py-0.5 bg-indigo-600 text-white font-mono text-[10px] rounded-full font-bold">
                {filteredMachines.length}
              </span>
            )}
          </div>

          {/* Month Filter */}
          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1 text-xs shrink-0 shadow-2xs">
            <Calendar className="w-3.5 h-3.5 text-blue-600 shrink-0" />
            <span className="font-bold text-slate-600 text-[11px] uppercase tracking-wide">Month:</span>
            <select
              id="shopfloor-month-select"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="bg-transparent font-bold text-slate-900 outline-none cursor-pointer text-xs"
            >
              <option value="All Months">📅 All Months</option>
              {availableMonths.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>

          {/* Week Filter */}
          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1 text-xs shrink-0 shadow-2xs">
            <Clock className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
            <span className="font-bold text-slate-600 text-[11px] uppercase tracking-wide">Week:</span>
            <select
              id="shopfloor-week-select"
              value={selectedWeek}
              onChange={(e) => setSelectedWeek(e.target.value)}
              className="bg-transparent font-bold text-slate-900 outline-none cursor-pointer text-xs"
            >
              {availableWeeks.map((w) => (
                <option key={w} value={w}>{w}</option>
              ))}
            </select>
          </div>

          <div className="relative flex-1 sm:w-56">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search machine, model, work..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Dedicated Update Daily Work Action (Sections 8-16, 28) */}
          <button
            onClick={() => {
              setSelectedMachineForDailyWork(null);
              setShowDailyWorkModal(true);
            }}
            className="px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-xs transition shrink-0"
            title="Update Daily Operations Progress (Machine-Size-Wise)"
          >
            <CheckSquare className="w-3.5 h-3.5" />
            <span>+ Update Progress</span>
          </button>
        </div>
      </div>

      {/* MACHINES TABLE / LIST */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
        {filteredMachines.length === 0 ? (
          <div className="text-center py-12 px-4">
            <Cpu className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <h4 className="text-sm font-bold text-slate-700">No Machines Found for {currentDepartment}</h4>
            <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1">
              There are currently no machines assigned to this department matching the current filter.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs whitespace-nowrap">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-bold uppercase text-[10px] tracking-wider">
                  <th className="p-3 pl-4">Machine Number</th>
                  <th className="p-3">Machine Size</th>
                  <th className="p-3">Project</th>
                  <th className="p-3">Customer</th>
                  <th className="p-3">Current Work</th>
                  <th className="p-3">Process</th>
                  <th className="p-3">Employee</th>
                  <th className="p-3">Progress %</th>
                  <th className="p-3">Today&apos;s Work %</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Planned Start</th>
                  <th className="p-3">Due Date</th>
                  <th className="p-3">Delay</th>
                  <th className="p-3">Quality Status</th>
                  <th className="p-3">Next Department</th>
                  <th className="p-3">Last Update</th>
                  <th className="p-3 text-right pr-4 min-w-[340px]">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredMachines.map((m) => {
                  const ops = getOperationsForMachineDepartment(m, currentDepartment, qualityOpsList);
                  const opsStats = calculateOperationsProgress(ops);
                  const deptProg = opsStats.total > 0 ? opsStats.progressPercent : (m.departmentProgress !== undefined ? m.departmentProgress : (m.progress !== undefined ? m.progress : 0));
                  const is100Percent = deptProg >= 100;
                  const isCompleted = is100Percent && (m.status === 'COMPLETED' || m.currentStatus === 'COMPLETED' || m.status === 'READY_FOR_HANDOVER');
                  const canEdit = canUserEditMachine(m);
                  const isPendingHandover =
                    m.handoverStatus === 'PENDING_ACCEPTANCE' ||
                    m.handoverStatus === 'AWAITING_ACCEPTANCE';
                  const delayInfo = getMachineDelayInfo(m);
                  const qualityStatus = getMachineQualityStatus(m);
                  const isReturned = m.status === 'RETURNED' || m.currentStatus === 'Returned for Correction' || m.isReturned;
                  const isQualityApproved = qualityStatus.text === 'Passed' || qualityStatus.text === 'Accepted' || qualityStatus.text === 'Accept';

                  return (
                    <tr key={m.id} className={`hover:bg-slate-50/60 transition-colors ${isReturned ? 'bg-amber-50/40' : ''}`}>
                      {/* 1. Machine Number */}
                      <td className="p-3 pl-4 font-bold text-slate-900">
                        <button
                          onClick={() => onOpenMachineDetail && onOpenMachineDetail(m)}
                          className="text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1 font-bold"
                          title="Open detailed machine roadmap"
                        >
                          <span>{m.machineNumber}</span>
                          <ChevronRight className="w-3 h-3 text-slate-400" />
                        </button>
                      </td>

                      {/* 2. Model/Size */}
                      <td className="p-3 text-slate-700 font-medium">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-slate-800">{getMachineDisplaySize(m) !== 'Size not available' ? getMachineDisplaySize(m) : (m.machineSize || m.model || m.machineModel || m.specification || 'Standard')}</span>
                          {(m.isNpi || m.remarks?.toUpperCase().includes('NPI') || m.model?.toUpperCase().includes('NPI') || m.machineModel?.toUpperCase().includes('NPI') || m.specification?.toUpperCase().includes('NPI')) && (
                            <span className="text-[10px] font-black px-1.5 py-0.5 bg-purple-100 text-purple-800 border border-purple-200 rounded animate-pulse">
                              NPI
                            </span>
                          )}
                        </div>
                      </td>

                      {/* 3. Project */}
                      <td className="p-3 text-slate-700 font-medium">
                        {m.project || m.projectName || 'AGI Project'}
                      </td>

                      {/* 4. Customer */}
                      <td className="p-3 text-slate-600 font-medium">
                        {m.customer || m.client || '-'}
                      </td>

                      {/* 5. Current Work */}
                      <td className="p-3 text-slate-800 font-medium max-w-[180px] truncate" title={m.currentWork || m.operation || 'Shop Floor Process'}>
                        {m.currentWork || m.operation || 'Shop Floor Process'}
                      </td>

                      {/* 6. Process */}
                      <td className="p-3 text-slate-600 font-medium">
                        <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded text-[11px] border border-slate-200 font-medium">
                          {m.process || m.currentProcess || m.processName || currentDepartment}
                        </span>
                      </td>

                      {/* 7. Employee */}
                      <td className="p-3 text-slate-700 font-medium">
                        <div className="flex items-center gap-1">
                          <User className="w-3 h-3 text-slate-400" />
                          <span>{m.responsibleEmployee || m.currentEmployee || (m as any).employee || 'Unassigned'}</span>
                        </div>
                      </td>

                      {/* 8. Progress % */}
                      <td className="p-3 min-w-[110px]">
                        <div className="flex items-center justify-between text-[11px] font-bold text-slate-700 mb-1">
                          <span>{deptProg}%</span>
                          {is100Percent && <CheckCircle2 className="w-3 h-3 text-emerald-600 inline" />}
                        </div>
                        <div className="w-20 bg-slate-100 rounded-full h-1.5 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-300 ${
                              is100Percent ? 'bg-emerald-500' : deptProg > 50 ? 'bg-blue-600' : 'bg-amber-500'
                            }`}
                            style={{ width: `${Math.min(100, Math.max(0, deptProg))}%` }}
                          />
                        </div>
                      </td>

                      {/* 9. Today's Work % (Sections 13, 14, 29) */}
                      <td className="p-3">
                        {m.todayWorkPercent !== undefined ? (
                          <div className="space-y-0.5">
                            <span className="font-mono font-black text-blue-700 text-xs px-2 py-0.5 rounded bg-blue-50 border border-blue-200">
                              {m.todayWorkPercent}%
                            </span>
                            {m.todayCompletedOperations !== undefined && m.totalOperations ? (
                              <div className="text-[10px] text-slate-500 font-semibold mt-0.5">
                                {m.todayCompletedOperations}/{m.totalOperations} ops
                              </div>
                            ) : null}
                          </div>
                        ) : (
                          <span className="text-slate-400 font-mono text-[11px]">-</span>
                        )}
                      </td>

                      {/* 10. Status */}
                      <td className="p-3">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                            delayInfo.isDelayed
                              ? 'bg-red-100 text-red-800 border border-red-200'
                              : isReturned
                              ? 'bg-rose-100 text-rose-800 border border-rose-200'
                              : isPendingHandover
                              ? 'bg-purple-100 text-purple-800 border border-purple-200'
                              : is100Percent
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                              : deptProg > 0
                              ? 'bg-blue-100 text-blue-800 border border-blue-200'
                              : 'bg-slate-100 text-slate-600 border border-slate-200'
                          }`}
                        >
                          {delayInfo.isDelayed
                            ? 'DELAYED'
                            : isReturned
                            ? 'Returned for Correction'
                            : isPendingHandover
                            ? 'Pending Handover'
                            : is100Percent
                            ? 'Completed'
                            : deptProg > 0
                            ? 'In Progress'
                            : 'Not Started'}
                        </span>
                      </td>

                      {/* 10. Planned Start */}
                      <td className="p-3 text-slate-600 font-mono text-[11px]">
                        {m.plannedStartDate || m.startDate || m.actualStartDate || '-'}
                      </td>

                      {/* 11. Due Date */}
                      <td className="p-3 text-slate-700 font-mono text-[11px] font-medium">
                        {m.dueDate || m.plannedDueDate || m.targetDate || m.expectedCompletionDate || '-'}
                      </td>

                      {/* 12. Delay */}
                      <td className="p-3">
                        {delayInfo.isDelayed ? (
                          <span
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-red-100 text-red-800 font-bold text-[10px] border border-red-200"
                            title={delayInfo.reason || 'Overdue'}
                          >
                            <AlertTriangle className="w-3 h-3 text-red-600 shrink-0" />
                            <span>{(delayInfo.daysOverdue ?? 0) > 0 ? `${delayInfo.daysOverdue}d LATE` : 'DELAYED'}</span>
                          </span>
                        ) : (
                          <span className="text-slate-400 text-[10px] font-medium">0 days</span>
                        )}
                      </td>

                      {/* 13. Quality Status */}
                      <td className="p-3">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[10px] font-bold border ${qualityStatus.badge}`}
                          >
                            {qualityStatus.text === 'Passed' && <CheckCircle2 className="w-2.5 h-2.5" />}
                            {qualityStatus.isRejected && <X className="w-2.5 h-2.5" />}
                            <span>{qualityStatus.text}</span>
                          </span>
                          {isQualityUser && (
                            <button
                              onClick={() => {
                                setSelectedMachineForQCInspection(m);
                                setQcInspectionInitialAction('Accept');
                              }}
                              className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition"
                              title="Quality Inspection: Hold, Reject, or Accept this machine"
                            >
                              <Edit2 className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </td>

                      {/* 14. Next Department */}
                      <td className="p-3">
                        <span className="px-2 py-0.5 bg-purple-50 text-purple-700 rounded font-bold text-[11px] border border-purple-100">
                          {m.nextDepartment || getNextDepartmentForMachine(m, currentDepartment) || getNextDepartmentInRoute(currentDepartment) || 'Dispatch'}
                        </span>
                      </td>

                      {/* 15. Last Update */}
                      <td className="p-3 text-slate-500 font-mono text-[10px]">
                        {m.updatedAt ? new Date(m.updatedAt).toLocaleDateString() : (m.createdAt ? new Date(m.createdAt).toLocaleDateString() : '-')}
                      </td>

                      {/* 16. Action Buttons */}
                      <td className="p-3 pr-4 text-right">
                        <div className="flex items-center justify-end gap-1.5 flex-wrap">
                          {/* [Update Progress] button (Sections 8-16: Machine-Size Operations Checklist) */}
                          {canEdit && !isPendingHandover && (
                            <button
                              onClick={() => {
                                setSelectedMachineForDailyWork(m);
                                setShowDailyWorkModal(true);
                              }}
                              className="px-2.5 py-1 text-[11px] font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-xs transition-colors flex items-center gap-1"
                              title="Update machine operations progress"
                            >
                              <CheckSquare className="w-3 h-3 text-white" />
                              <span>Update Progress</span>
                            </button>
                          )}

                          {/* [Stage Notes] button for legacy remarks / delay notes */}
                          {canEdit && !isPendingHandover && (
                            <button
                              onClick={() => handleOpenUpdateProgress(m)}
                              className="px-2 py-1 text-[11px] font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg shadow-2xs transition-colors"
                              title="Update stage notes and delay reasons"
                            >
                              Notes
                            </button>
                          )}

                          {/* [Complete Work] button */}
                          {canEdit && !isPendingHandover && !is100Percent && (
                            <button
                              onClick={() => handleOpenCompleteModal(m)}
                              className="px-2.5 py-1 text-[11px] font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg shadow-xs transition-colors"
                              title="Mark work 100% completed"
                            >
                              Complete Work
                            </button>
                          )}
                          {is100Percent && !isPendingHandover && (
                            <span className="px-2 py-0.5 text-[10px] font-bold bg-emerald-50 text-emerald-700 rounded border border-emerald-200">
                              ✓ 100% Done
                            </span>
                          )}

                          {/* Quality & Admin Direct Inspection Buttons (Hold / Reject / Accept) */}
                          {isQualityUser && (
                            <div className="inline-flex items-center rounded-lg border border-indigo-200 bg-indigo-50/80 p-0.5 shadow-2xs">
                              <button
                                onClick={() => {
                                  setSelectedMachineForQCInspection(m);
                                  setQcInspectionInitialAction('Accept');
                                }}
                                className="px-2 py-0.5 text-[10px] font-bold text-emerald-800 hover:bg-emerald-100 rounded transition"
                                title="Accept Machine (Pass Quality Inspection)"
                              >
                                ✓ Accept
                              </button>
                              <button
                                onClick={() => {
                                  setSelectedMachineForQCInspection(m);
                                  setQcInspectionInitialAction('Rework');
                                }}
                                className="px-2 py-0.5 text-[10px] font-bold text-amber-800 hover:bg-amber-100 rounded transition border-x border-indigo-200/80"
                                title="Send Machine for Rework (REWORK REQUIRED)"
                              >
                                🔧 Rework
                              </button>
                              <button
                                onClick={() => {
                                  setSelectedMachineForQCInspection(m);
                                  setQcInspectionInitialAction('Reject');
                                }}
                                className="px-2 py-0.5 text-[10px] font-bold text-rose-800 hover:bg-rose-100 rounded transition"
                                title="Reject Machine (Quality Rejection / Rework)"
                              >
                                ✕ Reject
                              </button>
                            </div>
                          )}

                          {/* [Send to Quality] button (for non-quality departments) */}
                          {canEdit && !isPendingHandover && !isQualityUser && (
                            <button
                              onClick={() => handleOpenSendToQuality(m)}
                              className="px-2.5 py-1 text-[11px] font-bold bg-teal-600 hover:bg-teal-700 text-white rounded-lg shadow-xs transition-colors flex items-center gap-1"
                              title="Send machine work to Quality inspection"
                            >
                              <ShieldCheck className="w-3 h-3" />
                              <span>Send to Quality</span>
                            </button>
                          )}

                          {/* [Handover to Next Department] button (Requirement 10 & 13) */}
                          {canEdit && !isPendingHandover && (
                            (() => {
                              const hasQualityBlock = qualityStatus.isRejected || qualityStatus.text === 'REJECTED' || qualityStatus.text.toLowerCase().includes('hold') || qualityStatus.text.toLowerCase().includes('pending');
                              const canHandover = (is100Percent || m.status === 'READY_FOR_HANDOVER') && (!hasQualityBlock || isAdmin);

                              if (!canHandover) {
                                return (
                                  <button
                                    onClick={() => {
                                      if (!is100Percent && m.status !== 'READY_FOR_HANDOVER') {
                                        setToast({ type: 'warning', text: 'Complete work to 100% or click Complete Work before handover.' });
                                      } else if (hasQualityBlock && !isAdmin) {
                                        setToast({ type: 'warning', text: `Quality resolution required (${qualityStatus.text}) before handover.` });
                                      }
                                    }}
                                    className="px-2.5 py-1 text-[11px] font-bold rounded-lg shadow-xs transition-colors flex items-center gap-1 bg-amber-50 text-amber-800 border border-amber-300 hover:bg-amber-100"
                                    title={!is100Percent && m.status !== 'READY_FOR_HANDOVER' ? 'Complete work to 100% before handover' : `Quality issue: ${qualityStatus.text}`}
                                  >
                                    <Send className="w-2.5 h-2.5" />
                                    <span>Handover ({!is100Percent && m.status !== 'READY_FOR_HANDOVER' ? 'Prog < 100%' : 'Quality Issue'})</span>
                                  </button>
                                );
                              }

                              return (
                                <button
                                  onClick={() => handleOpenHandover(m)}
                                  className="px-2.5 py-1 text-[11px] font-bold rounded-lg shadow-xs transition-colors flex items-center gap-1 bg-purple-600 hover:bg-purple-700 text-white"
                                  title="Handover machine to next department"
                                >
                                  <Send className="w-2.5 h-2.5" />
                                  <span>Handover to Next Department</span>
                                </button>
                              );
                            })()
                          )}

                          {/* Pending Handover notice */}
                          {isPendingHandover && (
                            <span className="px-2 py-1 text-[10px] font-bold bg-purple-50 text-purple-700 rounded border border-purple-200">
                              Pending Acceptance
                            </span>
                          )}

                          {/* [View Machine History] button */}
                          <button
                            onClick={() => setSelectedTimelineMachine(m)}
                            className="px-2 py-1 text-[11px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors flex items-center gap-1"
                            title="View full machine movement timeline & history"
                          >
                            <HistoryIcon className="w-3 h-3 text-slate-500" />
                            <span>History</span>
                          </button>

                          {/* VIEW action */}
                          <button
                            onClick={() => onOpenMachineDetail && onOpenMachineDetail(m)}
                            className="px-2 py-1 text-[11px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg transition-colors"
                            title="View machine roadmap and details"
                          >
                            VIEW
                          </button>

                          {/* RETURN / REVERSE ACTION (Rework) */}
                          {(canEdit || isAdmin || isQualityDepartment(userProfile?.department)) && (
                            <button
                              onClick={() => handleOpenReturnModal(m)}
                              className="px-2 py-1 text-[11px] font-bold bg-amber-50 hover:bg-amber-100 text-amber-800 rounded transition-colors"
                              title="Return machine to prior department for rework/correction"
                            >
                              Return
                            </button>
                          )}

                          {/* Read-only tag if locked / already handed over */}
                          {!canEdit && (
                            <span className="text-[10px] text-slate-400 font-semibold italic bg-slate-50 px-1.5 py-0.5 rounded border border-slate-200">
                              {m.previousDepartment && isDepartmentMatch(m.previousDepartment, currentDepartment)
                                ? `Handed Over to ${m.currentDepartment}`
                                : '🔒 Read Only'}
                            </span>
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

      {/* ======================================================== */}
      {/* MODAL 1: UPDATE PROGRESS (Requirement 9)                 */}
      {/* ======================================================== */}
      {/* ======================================================== */}
      {/* MODAL 1: OPERATIONS-BASED PROGRESS (Requirement 3, 4, 5) */}
      {/* ======================================================== */}
      {selectedMachineForProgress && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-4xl w-full p-6 shadow-2xl border border-slate-200 space-y-4 max-h-[94vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600">
                  Shop Floor Execution • Department Operations Management
                </span>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <span>Machine {selectedMachineForProgress.machineNumber}</span>
                  <span className="text-xs px-2 py-0.5 bg-blue-50 text-blue-700 font-semibold rounded">
                    {currentDepartment}
                  </span>
                </h3>
              </div>
              <button
                onClick={() => setSelectedMachineForProgress(null)}
                className="p-1 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Section 6 & 1: Important Example Banner */}
            <div className="bg-slate-900 text-white rounded-xl p-4 shadow-md border border-slate-800">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 mb-3 border-b border-slate-800 gap-2">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-blue-400">
                    MACHINE OPERATION WORKFLOW • {currentDepartment.toUpperCase()}
                  </div>
                  <h3 className="text-lg font-black tracking-tight text-white flex items-center gap-2 mt-0.5">
                    <span>MACHINE {selectedMachineForProgress.machineNumber}</span>
                    <span className="text-xs px-2.5 py-0.5 bg-blue-500/20 text-blue-300 font-bold rounded-full border border-blue-400/30 font-sans">
                      Spec: {selectedMachineForProgress.specification || selectedMachineForProgress.model || 'Standard'}
                    </span>
                  </h3>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold text-slate-400">Date:</span>
                  <span className="px-2.5 py-1 bg-slate-800 text-slate-200 rounded-lg text-xs font-mono font-bold border border-slate-700">
                    {formatDisplayDate(todayStr)}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                {/* Overall Progress */}
                <div className="bg-slate-800/80 p-3 rounded-lg border border-slate-700">
                  <div className="text-[10px] uppercase font-bold text-slate-400">Overall Progress</div>
                  <div className="text-2xl font-black text-indigo-400 mt-0.5">{modalOpsStats.overallProgressPercent}%</div>
                  <div className="text-[10px] text-slate-400 mt-0.5">Cumulative dept work</div>
                </div>
                {/* Today's Work */}
                <div className="bg-slate-800/80 p-3 rounded-lg border border-blue-500/40 ring-1 ring-blue-500/30">
                  <div className="text-[10px] uppercase font-bold text-blue-300">Today&apos;s Work</div>
                  <div className="text-2xl font-black text-blue-400 mt-0.5">{modalOpsStats.todayWorkPercent}%</div>
                  <div className="text-[10px] text-blue-300/80 mt-0.5">{modalOpsStats.todayCompleted} new ops today</div>
                </div>
                {/* Completed Operations */}
                <div className="bg-slate-800/80 p-3 rounded-lg border border-slate-700">
                  <div className="text-[10px] uppercase font-bold text-emerald-400">Completed Operations</div>
                  <div className="text-2xl font-black text-emerald-400 mt-0.5">
                    {modalOpsStats.completed} <span className="text-sm font-normal text-slate-400">/ {modalOpsStats.total}</span>
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">Total operations finished</div>
                </div>
                {/* Remaining Operations */}
                <div className="bg-slate-800/80 p-3 rounded-lg border border-slate-700">
                  <div className="text-[10px] uppercase font-bold text-amber-400">Remaining Operations</div>
                  <div className="text-2xl font-black text-amber-400 mt-0.5">{modalOpsStats.remaining}</div>
                  <div className="text-[10px] text-slate-400 mt-0.5">Operations to complete</div>
                </div>
              </div>
            </div>

            {/* Section 7: The 8 Required Header Fields */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
              <div>
                <span className="text-[10px] text-slate-400 font-bold uppercase block">1. Machine Number</span>
                <span className="font-bold text-slate-900 text-sm font-mono">{selectedMachineForProgress.machineNumber}</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 font-bold uppercase block">2. Specification</span>
                <span className="font-bold text-slate-800">
                  {selectedMachineForProgress.specification || selectedMachineForProgress.model || selectedMachineForProgress.machineModel || 'Standard'}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 font-bold uppercase block">3. Month</span>
                <span className="font-semibold text-blue-700">
                  {selectedMachineForProgress.planMonth
                    ? `${selectedMachineForProgress.planMonth} ${selectedMachineForProgress.planYear || 2026}`
                    : (selectedMachineForProgress.month ? `${selectedMachineForProgress.month} ${selectedMachineForProgress.year || 2026}` : 'October 2026')}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 font-bold uppercase block">4. Priority</span>
                <span className="font-mono font-bold text-slate-700 bg-white px-2 py-0.5 rounded border border-slate-200 inline-block mt-0.5">
                  {selectedMachineForProgress.priority || 'P01'}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 font-bold uppercase block">5. Department</span>
                <span className="font-bold text-slate-800">{currentDepartment}</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 font-bold uppercase block">6. Target Date</span>
                <span className="font-mono text-slate-700 font-medium">
                  {selectedMachineForProgress.targetDate || selectedMachineForProgress.dueDate || '2026-10-31'}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 font-bold uppercase block">7. Current Progress</span>
                <span className="font-bold text-blue-600 font-mono text-sm">
                  {modalOpsStats.progressPercent}% ({modalOpsStats.completed}/{modalOpsStats.total} Ops)
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 font-bold uppercase block">8. Status</span>
                <span
                  className={`inline-block mt-0.5 px-2 py-0.5 rounded text-[11px] font-bold ${
                    modalOpsStats.progressPercent >= 100
                      ? 'bg-emerald-100 text-emerald-800'
                      : modalOpsStats.progressPercent > 0
                      ? 'bg-blue-100 text-blue-800'
                      : 'bg-slate-200 text-slate-700'
                  }`}
                >
                  {modalOpsStats.progressPercent >= 100
                    ? 'Completed'
                    : modalOpsStats.progressPercent > 0
                    ? 'In Progress'
                    : 'Not Started'}
                </span>
              </div>
            </div>

            {/* Section 4 & 5: Automatic Progress Calculation Notice */}
            <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-xl text-[11px] text-blue-900 flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <div>
                  <strong>Live Automatic Calculation:</strong> Overall Progress: {modalOpsStats.completed}/{modalOpsStats.total} ops = <strong>{modalOpsStats.overallProgressPercent}%</strong> | Today&apos;s Work: {modalOpsStats.todayCompleted}/{modalOpsStats.total} ops = <strong>{modalOpsStats.todayWorkPercent}%</strong>.
                </div>
                <div className="text-slate-500 text-[10px]">
                  Percentages are computed exclusively from marked operations. Manual typing is prevented to preserve live operational accuracy.
                </div>
              </div>
            </div>

            {/* Navigation Tabs for Update Progress Modal */}
            <div className="flex border-b border-slate-200 gap-2 overflow-x-auto text-xs">
              <button
                type="button"
                onClick={() => setActiveProgressTab('today')}
                className={`pb-2.5 px-3 font-bold border-b-2 flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                  activeProgressTab === 'today'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <span>Today&apos;s Work ({formatDisplayDate(todayStr)})</span>
                <span className="px-1.5 py-0.5 bg-blue-100 text-blue-800 rounded-full text-[10px]">
                  {modalOpsStats.todayCompleted} Done
                </span>
              </button>

              <button
                type="button"
                onClick={() => setActiveProgressTab('remaining')}
                className={`pb-2.5 px-3 font-bold border-b-2 flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                  activeProgressTab === 'remaining'
                    ? 'border-amber-600 text-amber-600'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <span>Remaining Operations</span>
                <span className="px-1.5 py-0.5 bg-amber-100 text-amber-800 rounded-full text-[10px]">
                  {modalOpsStats.remaining} Remaining
                </span>
              </button>

              <button
                type="button"
                onClick={() => setActiveProgressTab('all')}
                className={`pb-2.5 px-3 font-bold border-b-2 flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                  activeProgressTab === 'all'
                    ? 'border-slate-800 text-slate-900'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <span>All Department Operations</span>
                <span className="px-1.5 py-0.5 bg-slate-100 text-slate-700 rounded-full text-[10px]">
                  {modalOpsStats.total}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setActiveProgressTab('history')}
                className={`pb-2.5 px-3 font-bold border-b-2 flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                  activeProgressTab === 'history'
                    ? 'border-purple-600 text-purple-600'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <span>Daily Work History</span>
                <span className="px-1.5 py-0.5 bg-purple-100 text-purple-800 rounded-full text-[10px]">
                  {dailyWorkHistory.length} Days
                </span>
              </button>
            </div>

            {/* TAB 1: TODAY'S WORK */}
            {activeProgressTab === 'today' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-bold text-slate-900 text-sm">
                      Today&apos;s Work - {formatDisplayDate(todayStr)}
                    </h4>
                    <p className="text-[11px] text-slate-500">
                      Select operations worked on and finished today. Previously completed operations are protected and cannot be counted twice.
                    </p>
                  </div>
                  <span className="text-xs font-bold px-2.5 py-1 bg-blue-50 text-blue-700 rounded-lg border border-blue-200">
                    Today&apos;s Work: {modalOpsStats.todayWorkPercent}% ({modalOpsStats.todayCompleted} ops)
                  </span>
                </div>

                <div className="max-h-60 overflow-y-auto space-y-1.5 pr-1 border border-slate-200 rounded-xl p-2 bg-slate-50/50">
                  {modalOperations.length === 0 ? (
                    <div className="p-4 text-center text-slate-400 text-xs">
                      No operations configured for specification &quot;{selectedMachineForProgress.specification || selectedMachineForProgress.model}&quot; in {currentDepartment}.
                    </div>
                  ) : (
                    modalOperations.map((op, idx) => {
                      const isNewlyToday = newlyCompletedOpIds.includes(op.id);
                      const isCompletedToday = op.completedToday || op.completedDate === todayStr || isNewlyToday;
                      const isAlreadyCompletedPrev = Boolean(
                        op.status === 'Completed' &&
                        op.completedDate &&
                        op.completedDate !== todayStr &&
                        !isNewlyToday
                      );

                      return (
                        <div
                          key={op.id || idx}
                          onClick={() => {
                            if (!isAlreadyCompletedPrev) {
                              handleToggleOperation(op.id);
                            }
                          }}
                          className={`flex items-center justify-between p-2.5 rounded-lg border text-xs transition-all ${
                            isAlreadyCompletedPrev
                              ? 'bg-slate-100 border-slate-200 opacity-80 cursor-not-allowed'
                              : isCompletedToday
                              ? 'bg-blue-50 border-blue-300 shadow-2xs cursor-pointer'
                              : 'bg-white border-slate-200 hover:border-slate-300 cursor-pointer'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <input
                              type="checkbox"
                              checked={Boolean(isAlreadyCompletedPrev || isCompletedToday)}
                              disabled={isAlreadyCompletedPrev}
                              onChange={() => {
                                if (!isAlreadyCompletedPrev) {
                                  handleToggleOperation(op.id);
                                }
                              }}
                              className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500 cursor-pointer disabled:cursor-not-allowed"
                            />
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-mono font-bold text-slate-500">#{idx + 1}</span>
                                <span className={`font-bold ${isAlreadyCompletedPrev ? 'text-slate-600 line-through' : isCompletedToday ? 'text-blue-900' : 'text-slate-800'}`}>
                                  {op.operationName || op.name || 'Operation'}
                                </span>
                                {op.partCode && (
                                  <span className="text-[10px] font-mono px-1.5 py-0.2 bg-slate-200 text-slate-700 rounded">
                                    {op.partCode}
                                  </span>
                                )}
                              </div>
                              <div className="text-[10px] text-slate-400 mt-0.5">
                                Category: {op.category || 'Standard'}
                              </div>
                            </div>
                          </div>

                          <div className="text-right">
                            {isAlreadyCompletedPrev ? (
                              <div className="flex flex-col items-end">
                                <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 font-bold rounded text-[10px] flex items-center gap-1">
                                  <Check className="w-3 h-3 text-emerald-600" />
                                  <span>Already Completed</span>
                                </span>
                                <span className="text-[9px] text-slate-400 mt-0.5">
                                  {formatDisplayDate(op.completedDate)} {op.completedBy ? `by ${op.completedBy}` : ''}
                                </span>
                              </div>
                            ) : isCompletedToday ? (
                              <span className="px-2 py-0.5 bg-blue-100 text-blue-800 font-bold rounded text-[10px] flex items-center gap-1">
                                <Check className="w-3 h-3 text-blue-600" />
                                <span>Completed Today</span>
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 bg-slate-100 text-slate-600 font-medium rounded text-[10px]">
                                ○ Not Completed
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}

            {/* TAB 2: REMAINING OPERATIONS */}
            {activeProgressTab === 'remaining' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-slate-900 text-sm">
                    {modalOpsStats.remaining} Operations Remaining
                  </h4>
                  <span className="text-xs text-slate-500 font-medium">
                    Click &apos;+ Mark Done Today&apos; to include in today&apos;s work
                  </span>
                </div>

                <div className="max-h-60 overflow-y-auto space-y-1.5 border border-slate-200 rounded-xl p-2 bg-slate-50/50">
                  {modalOpsStats.remaining === 0 ? (
                    <div className="p-8 text-center text-emerald-700 bg-emerald-50 rounded-lg">
                      <CheckCircle2 className="w-8 h-8 mx-auto text-emerald-600 mb-1" />
                      <div className="font-bold text-sm">All operations are complete!</div>
                      <div className="text-xs text-emerald-600">Overall department progress is 100%.</div>
                    </div>
                  ) : (
                    modalOperations
                      .filter((op) => op.status !== 'Completed' && !newlyCompletedOpIds.includes(op.id))
                      .map((op, idx) => (
                        <div
                          key={op.id || idx}
                          className="flex items-center justify-between p-2.5 rounded-lg border border-slate-200 bg-white hover:border-slate-300 text-xs"
                        >
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-bold text-slate-500">#{op.sequenceNumber || idx + 1}</span>
                              <span className="font-bold text-slate-800">{op.operationName || op.name}</span>
                              {op.partCode && (
                                <span className="text-[10px] font-mono px-1.5 py-0.2 bg-slate-200 text-slate-700 rounded">
                                  {op.partCode}
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-slate-400 mt-0.5">Category: {op.category || 'Standard'}</div>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleToggleOperation(op.id)}
                            className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold rounded border border-blue-200 text-xs flex items-center gap-1 transition-colors"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>+ Mark Done Today</span>
                          </button>
                        </div>
                      ))
                  )}
                </div>
              </div>
            )}

            {/* TAB 3: ALL OPERATIONS */}
            {activeProgressTab === 'all' && (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h4 className="font-bold text-slate-900 text-sm">
                    All Department Operations ({modalOpsStats.total})
                  </h4>
                  <div className="flex items-center gap-1 text-xs">
                    {(['ALL', 'PENDING', 'COMPLETED', 'TODAY'] as const).map((filter) => (
                      <button
                        key={filter}
                        type="button"
                        onClick={() => setOperationsFilter(filter)}
                        className={`px-2 py-0.5 rounded text-[11px] font-bold transition-colors ${
                          operationsFilter === filter
                            ? 'bg-slate-900 text-white'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        {filter === 'ALL'
                          ? `All (${modalOpsStats.total})`
                          : filter === 'PENDING'
                          ? `Pending (${modalOpsStats.remaining})`
                          : filter === 'COMPLETED'
                          ? `Completed (${modalOpsStats.completed})`
                          : `Today (${modalOpsStats.todayCompleted})`}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="max-h-60 overflow-y-auto border border-slate-200 rounded-xl bg-white">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 sticky top-0 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                      <tr>
                        <th className="p-2.5 pl-3">Op No.</th>
                        <th className="p-2.5">Operation Name</th>
                        <th className="p-2.5">Category</th>
                        <th className="p-2.5">Status</th>
                        <th className="p-2.5">Completed Date</th>
                        <th className="p-2.5">Completed By</th>
                        <th className="p-2.5 pr-3 text-center">Toggle</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {modalOperations
                        .filter((op) => {
                          const isNewly = newlyCompletedOpIds.includes(op.id);
                          const isToday = op.completedToday || op.completedDate === todayStr || isNewly;
                          const isDone = op.status === 'Completed' || isNewly;
                          if (operationsFilter === 'PENDING') return !isDone;
                          if (operationsFilter === 'COMPLETED') return isDone;
                          if (operationsFilter === 'TODAY') return isToday;
                          return true;
                        })
                        .map((op, idx) => {
                          const isNewly = newlyCompletedOpIds.includes(op.id);
                          const isToday = op.completedToday || op.completedDate === todayStr || isNewly;
                          const isDone = op.status === 'Completed' || isNewly;
                          const isPrev = isDone && !isNewly && op.completedDate && op.completedDate !== todayStr;

                          return (
                            <tr
                              key={op.id || idx}
                              className={`transition-colors ${
                                isDone ? 'bg-emerald-50/40 hover:bg-emerald-100/40' : 'hover:bg-slate-50'
                              }`}
                            >
                              <td className="p-2.5 pl-3 font-mono font-bold text-slate-600">
                                #{op.sequenceNumber || idx + 1}
                              </td>
                              <td className="p-2.5 font-medium">
                                <div className={isDone ? 'line-through text-slate-500 font-normal' : 'font-bold text-slate-900'}>
                                  {op.operationName || op.name}
                                </div>
                                {op.partCode && (
                                  <span className="text-[10px] text-slate-400 font-mono block">Code: {op.partCode}</span>
                                )}
                              </td>
                              <td className="p-2.5 text-slate-600 text-[11px]">{op.category || 'Standard'}</td>
                              <td className="p-2.5">
                                <span
                                  className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                    isPrev
                                      ? 'bg-emerald-100 text-emerald-800'
                                      : isToday
                                      ? 'bg-blue-100 text-blue-800'
                                      : 'bg-slate-100 text-slate-600'
                                  }`}
                                >
                                  {isPrev ? '✓ Completed' : isToday ? '✓ Done Today' : '○ Pending'}
                                </span>
                              </td>
                              <td className="p-2.5 font-mono text-[10px] text-slate-500">
                                {op.completedDate ? formatDisplayDate(op.completedDate) : '—'}
                              </td>
                              <td className="p-2.5 text-slate-600 text-[11px]">
                                {op.completedBy || (isDone ? userProfile?.displayName || userProfile?.email || 'Operator' : '—')}
                              </td>
                              <td className="p-2.5 pr-3 text-center">
                                <input
                                  type="checkbox"
                                  checked={Boolean(isDone)}
                                  disabled={Boolean(isPrev)}
                                  onChange={() => handleToggleOperation(op.id)}
                                  className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500 cursor-pointer disabled:cursor-not-allowed"
                                />
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* TAB 4: DAILY WORK HISTORY (Section 8) */}
            {activeProgressTab === 'history' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-slate-900 text-sm">
                    Daily Work History
                  </h4>
                  <span className="text-xs text-slate-500">
                    Click a date card to inspect operations completed on that date
                  </span>
                </div>

                {loadingDailyHistory ? (
                  <div className="p-6 text-center text-slate-500 text-xs flex items-center justify-center gap-2">
                    <RefreshCw className="w-4 h-4 animate-spin text-blue-600" />
                    <span>Loading daily work logs from database...</span>
                  </div>
                ) : dailyWorkHistory.length === 0 ? (
                  <div className="p-8 text-center text-slate-400 text-xs border border-dashed border-slate-200 rounded-xl">
                    No historical daily logs recorded for Machine {selectedMachineForProgress.machineNumber} in {currentDepartment} yet.
                    Daily records will appear here as work updates are submitted.
                  </div>
                ) : (
                  <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                    {dailyWorkHistory.map((group) => {
                      const isExpanded = selectedHistoryDate === group.date;
                      return (
                        <div
                          key={group.date}
                          className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-2xs"
                        >
                          <div
                            onClick={() => setSelectedHistoryDate(isExpanded ? null : group.date)}
                            className="flex items-center justify-between p-3 bg-slate-50 hover:bg-slate-100 cursor-pointer transition-colors"
                          >
                            <div className="flex items-center gap-3">
                              <span className="font-bold text-slate-900 text-xs font-mono">
                                {formatDisplayDate(group.date)}
                              </span>
                              <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-800 font-bold rounded-full">
                                {group.completedCount} {group.completedCount === 1 ? 'operation' : 'operations'} completed
                              </span>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="text-xs font-bold text-slate-700">
                                Daily Work: <strong className="text-blue-600">{group.dailyWorkPercent}%</strong>
                              </span>
                              <ChevronRight className={`w-4 h-4 text-slate-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                            </div>
                          </div>

                          {isExpanded && (
                            <div className="p-3 border-t border-slate-200 space-y-2 bg-white text-xs">
                              {group.operations.map((opItem, opIdx) => (
                                <div
                                  key={opItem.operationId || opIdx}
                                  className="flex items-center justify-between py-1.5 border-b border-slate-100 last:border-0"
                                >
                                  <div className="flex items-center gap-2">
                                    <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                    <span className="font-bold text-slate-800">{opItem.operationName}</span>
                                    {opItem.remarks && (
                                      <span className="text-[10px] text-slate-400 italic">({opItem.remarks})</span>
                                    )}
                                  </div>
                                  <div className="text-right text-[10px] text-slate-500 font-mono">
                                    {opItem.completedBy} • {opItem.completedAt ? new Date(opItem.completedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Logged'}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Operational Form Inputs */}
            <form onSubmit={handleSubmitProgress} className="space-y-3 text-xs pt-1 border-t border-slate-100">
              {/* Today's Work & Remaining Work text inputs */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Work Completed Today</label>
                  <textarea
                    rows={2}
                    placeholder="Describe specific operations, components fitted, or tests executed today..."
                    value={workDoneToday}
                    onChange={(e) => setWorkDoneToday(e.target.value)}
                    className="w-full p-2 bg-white border border-slate-200 rounded-lg font-medium focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Remaining Work</label>
                  <textarea
                    rows={2}
                    placeholder="Remaining sub-assemblies, inspection items, or next shift requirements..."
                    value={remainingWork}
                    onChange={(e) => setRemainingWork(e.target.value)}
                    className="w-full p-2 bg-white border border-slate-200 rounded-lg font-medium focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Status & Expected Date */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Operational Status</label>
                  <select
                    value={progressStatus}
                    onChange={(e) => setProgressStatus(e.target.value)}
                    className="w-full p-2 bg-white border border-slate-200 rounded-lg font-medium focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="WORK_STARTED">Work Started</option>
                    <option value="IN_PROGRESS">In Progress</option>
                    <option value="BLOCKED">Blocked (Issues / Bottleneck)</option>
                    <option value="DELAYED">Delayed</option>
                    {modalOpsStats.progressPercent >= 100 && <option value="COMPLETED">Completed (100%)</option>}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Expected Completion Date</label>
                  <input
                    type="date"
                    value={expectedDate}
                    onChange={(e) => setExpectedDate(e.target.value)}
                    className="w-full p-2 bg-white border border-slate-200 rounded-lg font-medium focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Delay Reason Section */}
              <div className="p-3 bg-amber-50/60 border border-amber-200 rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block font-bold text-slate-800 text-xs">
                    Delay Reason Tracking {(progressStatus === 'BLOCKED' || progressStatus === 'DELAYED') && <span className="text-red-600 font-bold">*</span>}
                  </label>
                  <span className="text-[10px] text-slate-400 font-medium">Select if work is impeded</span>
                </div>
                <select
                  value={delayReason}
                  onChange={(e) => setDelayReason(e.target.value)}
                  className="w-full p-2 bg-white border border-slate-300 rounded-lg text-slate-800 font-medium text-xs focus:ring-2 focus:ring-amber-500"
                >
                  <option value="">No Delay Reported (On Track)</option>
                  {STANDARD_DELAY_REASONS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>

              {/* Shift Remarks */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">Remarks / Shift Notes</label>
                <input
                  type="text"
                  placeholder="Notes for the team, supervisor review comments, etc."
                  value={progressRemarks}
                  onChange={(e) => setProgressRemarks(e.target.value)}
                  className="w-full p-2 bg-white border border-slate-200 rounded-lg font-medium focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* 100% Completion Banner */}
              {modalOpsStats.progressPercent >= 100 && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-emerald-900 font-bold">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                    <span>All department operations 100% finished! Ready for formal handover.</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const m = selectedMachineForProgress;
                      setSelectedMachineForProgress(null);
                      handleOpenHandover(m);
                    }}
                    className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-lg text-xs shrink-0 flex items-center gap-1 shadow-xs"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Proceed to Handover</span>
                  </button>
                </div>
              )}

              {/* Footer Action Buttons */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setSelectedMachineForProgress(null)}
                  className="px-4 py-2 font-bold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  Cancel
                </button>

                <div className="flex items-center gap-2">
                  {/* Save Daily Update Button */}
                  <button
                    type="submit"
                    disabled={savingProgress || sendingToAdmin}
                    className="px-4 py-2 font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-xs flex items-center gap-1.5 transition-colors disabled:opacity-50"
                  >
                    {savingProgress ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <CheckSquare className="w-3.5 h-3.5" />}
                    <span>SAVE DAILY UPDATE</span>
                  </button>

                  {/* SEND PROGRESS TO ADMIN (Requirement 4) */}
                  <button
                    type="button"
                    onClick={handleSendProgressToAdmin}
                    disabled={savingProgress || sendingToAdmin}
                    className="px-4 py-2 font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg shadow-xs flex items-center gap-1.5 transition-colors disabled:opacity-50"
                    title="Save latest progress and immediately update Admin dashboard with notification"
                  >
                    {sendingToAdmin ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                    <span>SEND PROGRESS TO ADMIN</span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL 1B: COMPLETE WORK (Requirement 12)                 */}
      {/* ======================================================== */}
      {selectedMachineForComplete && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600">
                  Department Work Completion (100%)
                </span>
                <h3 className="text-base font-bold text-slate-900">
                  Complete Work: Machine {selectedMachineForComplete.machineNumber}
                </h3>
              </div>
              <button
                onClick={() => setSelectedMachineForComplete(null)}
                className="p-1 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-900 space-y-1">
              <div className="font-bold flex items-center gap-1">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>Validation: Progress reached 100%</span>
              </div>
              <p>
                Marking this work completed confirms all operations assigned to <strong>{currentDepartment}</strong> are finished and ready for formal handover to the receiving department.
              </p>
            </div>

            <form onSubmit={handleSubmitCompleteWork} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Actual Completion Date</label>
                  <input
                    type="date"
                    required
                    value={completionDate}
                    onChange={(e) => setCompletionDate(e.target.value)}
                    className="w-full p-2 bg-white border border-slate-300 rounded-lg font-medium focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Actual Quantity Completed</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={finalQuantity}
                    onChange={(e) => setFinalQuantity(Number(e.target.value))}
                    className="w-full p-2 bg-white border border-slate-300 rounded-lg font-medium focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Completion Remarks / Quality Sign-off Notes</label>
                <textarea
                  rows={2}
                  required
                  placeholder="Details of finished work, quality verification, or handover instructions..."
                  value={completionRemarks}
                  onChange={(e) => setCompletionRemarks(e.target.value)}
                  className="w-full p-2 bg-white border border-slate-300 rounded-lg font-medium focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Inspection Document / Sign-off Attachment URL (Optional)</label>
                <input
                  type="text"
                  placeholder="https://... inspection certificate or checklist link"
                  value={completionAttachment}
                  onChange={(e) => setCompletionAttachment(e.target.value)}
                  className="w-full p-2 bg-white border border-slate-300 rounded-lg font-medium focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setSelectedMachineForComplete(null)}
                  className="px-4 py-2 font-bold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingCompletion}
                  className="px-4 py-2 font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg shadow-xs flex items-center gap-1.5 transition-colors disabled:opacity-50"
                >
                  {savingCompletion && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  <Check className="w-4 h-4" />
                  <span>Confirm 100% Completed</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL 2: FORMAL HANDOVER (100% Completed -> Next Dept)   */}
      {/* ======================================================== */}
      {selectedMachineForHandover && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-purple-600">
                  Formal Handover
                </span>
                <h3 className="text-base font-bold text-slate-900">
                  Handover Machine {selectedMachineForHandover.machineNumber}
                </h3>
              </div>
              <button
                onClick={() => setSelectedMachineForHandover(null)}
                className="p-1 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 bg-purple-50 border border-purple-200 rounded-2xl space-y-1.5">
              <h4 className="text-sm font-black text-purple-950">
                Are you sure you want to handover CMM {selectedMachineForHandover.machineNumber} to {targetDepartment || 'the next department'}?
              </h4>
              <p className="text-xs text-purple-700">
                Work at <strong>{currentDepartment}</strong> is 100% complete. Confirming will handover this machine to <strong>{targetDepartment}</strong>, send an instant notification, and display it in their &quot;New Machine Received&quot; queue.
              </p>
            </div>

            <form onSubmit={handleSubmitHandover} className="space-y-4 text-xs">
              {/* From & To Department */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Sending Department</label>
                  <input
                    type="text"
                    disabled
                    value={currentDepartment}
                    className="w-full p-2 bg-slate-100 border border-slate-200 rounded-lg font-bold text-slate-700 cursor-not-allowed"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Receiving Department</label>
                  <select
                    required
                    value={targetDepartment}
                    onChange={(e) => setTargetDepartment(e.target.value)}
                    className="w-full p-2 bg-white border border-slate-300 rounded-lg font-bold text-purple-700 focus:ring-2 focus:ring-purple-500"
                  >
                    <option value="">Select Receiving Department</option>
                    {departments
                      .filter((d) => !isDepartmentMatch(d.name, currentDepartment))
                      .map((d) => (
                        <option key={d.code || d.name} value={d.name}>
                          {d.order !== undefined ? `${d.order}. ` : ''}{d.name}
                        </option>
                      ))}
                  </select>
                </div>
              </div>

              {/* Work / Operation for Next Department */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">Operation / Next Stage Work</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Ready for Pre-assembly, Inward Quality Inspection, Painting"
                  value={handoverWorkDesc}
                  onChange={(e) => setHandoverWorkDesc(e.target.value)}
                  className="w-full p-2 bg-white border border-slate-200 rounded-lg font-medium focus:ring-2 focus:ring-purple-500"
                />
              </div>

              {/* Priority */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">Handover Priority</label>
                <select
                  value={handoverPriority}
                  onChange={(e) => setHandoverPriority(e.target.value)}
                  className="w-full p-2 bg-white border border-slate-200 rounded-lg font-medium focus:ring-2 focus:ring-purple-500"
                >
                  <option value="Normal">Normal</option>
                  <option value="Medium">Medium</option>
                  <option value="High">High Priority</option>
                  <option value="Urgent">Urgent / Critical</option>
                </select>
              </div>

              {/* Handover Remarks */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">Handover Notes / Instructions</label>
                <textarea
                  rows={2}
                  placeholder="Notes for the next station operator, critical dimensions checked, etc."
                  value={handoverRemarks}
                  onChange={(e) => setHandoverRemarks(e.target.value)}
                  className="w-full p-2 bg-white border border-slate-200 rounded-lg font-medium focus:ring-2 focus:ring-purple-500"
                />
              </div>

              {/* Handover Confirmation Checkbox (Requirement 6, 11) */}
              <div className="p-3 bg-purple-50/70 border border-purple-200 rounded-xl space-y-1">
                <label className="flex items-center gap-2 cursor-pointer font-bold text-purple-900 text-xs">
                  <input
                    type="checkbox"
                    checked={confirmCompletedWork}
                    onChange={(e) => setConfirmCompletedWork(e.target.checked)}
                    className="w-4 h-4 rounded text-purple-600 focus:ring-purple-500 border-purple-300"
                  />
                  <span>I confirm that all assigned work at {currentDepartment} is 100% complete and verified.</span>
                </label>
                <p className="text-[10px] text-purple-700 pl-6">
                  Once handed over, the receiving department will take active ownership and this department&apos;s editing will be locked.
                </p>
              </div>

              {/* Admin Override Checkbox */}
              {isAdmin && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs font-bold text-amber-900 flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={adminHandoverOverride}
                    onChange={(e) => {
                      setAdminHandoverOverride(e.target.checked);
                      if (e.target.checked) setConfirmCompletedWork(true);
                    }}
                    className="w-4 h-4 rounded text-amber-600"
                  />
                  <span>Admin Override: Authorize early handover before 100% completion</span>
                </div>
              )}

              {/* Footer */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setSelectedMachineForHandover(null)}
                  className="px-4 py-2 font-bold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={dispatchingHandover}
                  className="px-5 py-2 font-bold bg-purple-600 hover:bg-purple-700 text-white rounded-lg shadow-xs flex items-center gap-1.5 transition-colors disabled:opacity-50"
                >
                  {dispatchingHandover && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  <Send className="w-3.5 h-3.5" />
                  <span>Confirm Handover to {targetDepartment || 'Next Department'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL 3: IMMUTABLE PROGRESS HISTORY                      */}
      {/* ======================================================== */}
      {selectedMachineForHistory && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Immutable Audit Trail
                </span>
                <h3 className="text-base font-bold text-slate-900">
                  Progress History: Machine {selectedMachineForHistory.machineNumber}
                </h3>
              </div>
              <button
                onClick={() => setSelectedMachineForHistory(null)}
                className="p-1 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 pr-1 text-xs">
              {loadingHistory ? (
                <div className="text-center py-8 text-slate-400 flex items-center justify-center gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Loading progress history from Firestore...</span>
                </div>
              ) : historyList.length === 0 ? (
                <div className="text-center py-8 text-slate-400">
                  <HistoryIcon className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  <p>No historical updates recorded for this machine yet.</p>
                </div>
              ) : (
                <div className="relative border-l-2 border-slate-200 ml-4 space-y-4">
                  {historyList.map((entry, idx) => (
                    <div key={entry.id || idx} className="relative pl-6">
                      {/* Timeline dot */}
                      <div
                        className={`absolute -left-[9px] top-1 w-4 h-4 rounded-full border-2 border-white ${
                          entry.newProgress >= 100
                            ? 'bg-emerald-500'
                            : entry.status === 'BLOCKED' || entry.status === 'DELAYED'
                            ? 'bg-red-500'
                            : 'bg-blue-600'
                        }`}
                      />

                      <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-slate-800">
                            {entry.department} — {entry.newProgress}% ({entry.status})
                          </span>
                          <span className="text-[10px] text-slate-400 font-mono">
                            {entry.date} {entry.time}
                          </span>
                        </div>

                        <div className="text-slate-600">
                          <strong>Operator:</strong> {entry.employee}
                        </div>

                        {entry.remarks && (
                          <div className="text-slate-700 bg-white p-2 rounded-lg border border-slate-100 mt-1">
                            {entry.remarks}
                          </div>
                        )}

                        {entry.delayReason && (
                          <div className="text-red-700 bg-red-50 p-2 rounded-lg border border-red-200 font-semibold mt-1">
                            Delay: {entry.delayReason}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-100">
              <button
                onClick={() => setSelectedMachineForHistory(null)}
                className="px-4 py-2 font-bold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors text-xs"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL 4: REJECT INCOMING HANDOVER (Requirement 14)       */}
      {/* ======================================================== */}
      {selectedIncomingForReject && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-rose-600">
                  Shop Floor Handover Rejection
                </span>
                <h3 className="text-base font-bold text-slate-900">
                  Reject Machine {selectedIncomingForReject.machineNumber}
                </h3>
              </div>
              <button
                onClick={() => setSelectedIncomingForReject(null)}
                className="p-1 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-900 space-y-1">
              <div className="font-bold flex items-center gap-1">
                <AlertTriangle className="w-4 h-4 text-rose-600" />
                <span>Return to Originating Department</span>
              </div>
              <p>
                Rejecting this handover returns Machine <strong>{selectedIncomingForReject.machineNumber}</strong> back to <strong>{selectedIncomingForReject.fromDepartment || selectedIncomingForReject.sendingDepartment}</strong> for necessary rework and correction.
              </p>
            </div>

            <form onSubmit={handleSubmitRejectIncoming} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Rejection Reason <span className="text-rose-600">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Dimensions out of tolerance, missing parts, inspection failure"
                  value={incomingRejectionReason}
                  onChange={(e) => setIncomingRejectionReason(e.target.value)}
                  className="w-full p-2.5 bg-white border border-rose-300 rounded-lg font-medium text-rose-950 focus:ring-2 focus:ring-rose-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Detailed Notes / Corrective Action Required (Optional)
                </label>
                <textarea
                  rows={3}
                  placeholder="Specify what rework the originating department must perform before re-submitting..."
                  value={incomingRejectionRemarks}
                  onChange={(e) => setIncomingRejectionRemarks(e.target.value)}
                  className="w-full p-2.5 bg-white border border-slate-300 rounded-lg font-medium focus:ring-2 focus:ring-rose-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setSelectedIncomingForReject(null)}
                  className="px-4 py-2 font-bold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={rejectingHandover}
                  className="px-4 py-2 font-bold bg-rose-600 hover:bg-rose-700 text-white rounded-lg shadow-xs flex items-center gap-1.5 transition-colors disabled:opacity-50"
                >
                  {rejectingHandover && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  <X className="w-4 h-4" />
                  <span>Confirm Rejection &amp; Return</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* ======================================================== */}
      {/* MODAL 5: RETURN MACHINE TO PRIOR DEPT (Requirement 14,15)*/}
      {/* ======================================================== */}
      {selectedMachineForReturn && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-600">
                  Defect / Rework Correction
                </span>
                <h3 className="text-base font-bold text-slate-900">
                  Return Machine {selectedMachineForReturn.machineNumber}
                </h3>
              </div>
              <button
                onClick={() => setSelectedMachineForReturn(null)}
                className="p-1 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 space-y-1">
              <div className="font-bold flex items-center gap-1">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                <span>Return to Prior Department</span>
              </div>
              <p>
                Returning this machine marks it as <strong>RETURNED FOR CORRECTION</strong> and unlocks the target department so they can rectify defects and re-submit.
              </p>
            </div>

            <form onSubmit={handleSubmitReturn} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Target Department for Rework <span className="text-amber-600">*</span></label>
                <select
                  value={returnTargetDept}
                  onChange={(e) => setReturnTargetDept(e.target.value)}
                  className="w-full p-2 bg-white border border-slate-300 rounded-lg font-bold text-slate-800 focus:ring-2 focus:ring-amber-500"
                >
                  {departments
                    .filter((d) => !isDepartmentMatch(d.name, currentDepartment))
                    .map((d) => (
                      <option key={d.code || d.name} value={d.name}>
                        {d.order !== undefined ? `${d.order}. ` : ''}{d.name}
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Reason for Return <span className="text-rose-600">*</span></label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Dimensions out of tolerance, paint defect, missing drilling hole"
                  value={returnReason}
                  onChange={(e) => setReturnReason(e.target.value)}
                  className="w-full p-2.5 bg-white border border-slate-300 rounded-lg font-medium text-slate-900 focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Corrective Action Required <span className="text-rose-600">*</span></label>
                <textarea
                  rows={2}
                  required
                  placeholder="Specify exact rework required before this machine can be accepted..."
                  value={returnCorrectiveAction}
                  onChange={(e) => setReturnCorrectiveAction(e.target.value)}
                  className="w-full p-2.5 bg-white border border-slate-300 rounded-lg font-medium text-slate-900 focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Additional Remarks (Optional)</label>
                <input
                  type="text"
                  placeholder="Shift notes or contact person..."
                  value={returnRemarks}
                  onChange={(e) => setReturnRemarks(e.target.value)}
                  className="w-full p-2 bg-white border border-slate-200 rounded-lg font-medium"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setSelectedMachineForReturn(null)}
                  className="px-4 py-2 font-bold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingReturn}
                  className="px-4 py-2 font-bold bg-amber-600 hover:bg-amber-700 text-white rounded-lg shadow-xs flex items-center gap-1.5 transition-colors disabled:opacity-50"
                >
                  {submittingReturn && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  <span>Confirm Return to {returnTargetDept}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL: COMPLETE MACHINE MOVEMENT TIMELINE (Requirement 9) */}
      {/* ======================================================== */}
      <MachineMovementTimelineModal
        isOpen={Boolean(selectedTimelineMachine)}
        machine={selectedTimelineMachine}
        onClose={() => setSelectedTimelineMachine(null)}
        handovers={handovers}
      />

      {/* ======================================================== */}
      {/* MODAL: DAILY OPERATIONS PROGRESS CHECKLIST (Sections 8-28) */}
      {/* ======================================================== */}
      {showDailyWorkModal && (
        <DailyOperationProgressModal
          isOpen={showDailyWorkModal}
          onClose={() => {
            setShowDailyWorkModal(false);
            setSelectedMachineForDailyWork(null);
          }}
          currentDepartment={currentDepartment}
          machines={Array.from(departmentMachines.values())}
          initialMachine={selectedMachineForDailyWork}
        />
      )}

      {/* ======================================================== */}
      {/* MODAL: QUALITY INSPECTION DECISION (Quality & Admin Only) */}
      {/* ======================================================== */}
      {selectedMachineForQCInspection && isQualityUser && (
        <QualityInspectionDecisionModal
          isOpen={Boolean(selectedMachineForQCInspection)}
          onClose={() => setSelectedMachineForQCInspection(null)}
          machine={selectedMachineForQCInspection}
          initialAction={qcInspectionInitialAction}
          onSuccess={(msg) => setToast({ type: 'success', text: msg })}
        />
      )}
    </div>
  );
};
