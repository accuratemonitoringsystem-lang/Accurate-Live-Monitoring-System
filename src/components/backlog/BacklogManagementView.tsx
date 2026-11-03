import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Layers,
  Upload,
  Download,
  Search,
  Filter,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Building,
  Calendar,
  AlertCircle,
  FileSpreadsheet,
  X,
  Check,
  RefreshCw,
  Plus,
  ArrowRight,
  Eye,
  Edit2,
  Lock,
  ArrowRightLeft,
  Send,
  Inbox,
  CheckSquare,
  XCircle,
  User,
  Tag,
  ChevronDown,
  ShieldAlert,
} from 'lucide-react';
import {
  BacklogItem,
  BacklogStatus,
  BacklogHandoverRecord,
  Machine,
  ImportHistoryEntry,
} from '../../types';
import { useAuth } from '../../context/AuthContext';
import {
  parseBacklogExcel,
  commitBacklogBatch,
  subscribeBacklogItems,
  updateBacklogItem,
  initiateBacklogHandover,
  respondBacklogHandover,
  assignUnmappedBacklogItem,
  exportBacklogToExcel,
  getBacklogDepartmentSummary,
  downloadBacklogTemplate,
  downloadBacklogErrorReport,
  BacklogValidationResult,
} from '../../services/backlogService';
import { subscribeImportHistory } from '../../services/db';
import { INITIAL_DEPARTMENTS } from '../../constants';
import { isDepartmentMatch } from '../../utils/departmentUtils';

interface BacklogManagementViewProps {
  departmentName?: string;
  machines?: Machine[];
  onOpenDailyUpdate?: () => void;
}

export const BacklogManagementView: React.FC<BacklogManagementViewProps> = ({
  departmentName,
  machines = [],
  onOpenDailyUpdate,
}) => {
  const { userProfile } = useAuth();
  const isAdmin = userProfile?.role === 'ADMIN' || departmentName === 'All Departments';
  const isPlanning =
    userProfile?.department?.includes('Planning') || userProfile?.role === 'PLANNING';
  const canImport = isAdmin || isPlanning;

  const targetDept = isAdmin && departmentName === 'All Departments' ? undefined : departmentName;

  // View Mode for Admin: 'backlog' | 'handovers' | 'unmapped' | 'summary' | 'history'
  // View Mode for Dept: 'backlog' | 'incoming_handovers' | 'outgoing_handovers'
  const [activeTab, setActiveTab] = useState<string>('backlog');

  // Live Backlog Data
  const [backlogItems, setBacklogItems] = useState<BacklogItem[]>([]);
  const [importHistory, setImportHistory] = useState<ImportHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [deptFilter, setDeptFilter] = useState<string>(targetDept || 'ALL');
  const [priorityFilter, setPriorityFilter] = useState<string>('ALL');

  // Excel Import Modal State
  const [showImportModal, setShowImportModal] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [validationResult, setValidationResult] = useState<BacklogValidationResult | null>(null);
  const [duplicateStrategy, setDuplicateStrategy] = useState<'update' | 'skip'>('update');
  const [importMonth, setImportMonth] = useState('October');
  const [importYear, setImportYear] = useState('2026');
  const [committing, setCommitting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);

  // Working UPDATE Item Modal State
  const [editingItem, setEditingItem] = useState<BacklogItem | null>(null);
  const [editStatus, setEditStatus] = useState<BacklogStatus>('Open');
  const [editCompletedQty, setEditCompletedQty] = useState<number>(0);
  const [editPendingQty, setEditPendingQty] = useState<number>(1);
  const [editProgressPercent, setEditProgressPercent] = useState<number>(0);
  const [editDelayReason, setEditDelayReason] = useState<string>('');
  const [editRemarks, setEditRemarks] = useState<string>('');
  const [editResponsiblePerson, setEditResponsiblePerson] = useState<string>('');
  const [editExpectedDate, setEditExpectedDate] = useState<string>('');
  const [editActualDate, setEditActualDate] = useState<string>('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [updateFeedback, setUpdateFeedback] = useState<string | null>(null);

  // Working HANDOVER Modal State
  const [handoverItem, setHandoverItem] = useState<BacklogItem | null>(null);
  const [handoverReceivingDept, setHandoverReceivingDept] = useState<string>('');
  const [handoverQty, setHandoverQty] = useState<number>(1);
  const [handoverDate, setHandoverDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [handoverRemarks, setHandoverRemarks] = useState<string>('');
  const [submittingHandover, setSubmittingHandover] = useState(false);
  const [handoverFeedback, setHandoverFeedback] = useState<string | null>(null);

  // Reject Modal State for Incoming Handover
  const [rejectingHandover, setRejectingHandover] = useState<{
    backlogItemId: string;
    handoverId: string;
    machineNumber: string;
  } | null>(null);
  const [rejectionReason, setRejectionReason] = useState<string>('');
  const [submittingRejection, setSubmittingRejection] = useState(false);

  // Unmapped Assignment State
  const [assigningItem, setAssigningItem] = useState<BacklogItem | null>(null);
  const [targetAssignDept, setTargetAssignDept] = useState<string>('03 Purchase');
  const [submittingAssign, setSubmittingAssign] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Subscribe to live backlog items and import history
  useEffect(() => {
    setLoading(true);
    const unsub = subscribeBacklogItems(targetDept, (items) => {
      setBacklogItems(items);
      setLoading(false);
    });
    const unsubHist = subscribeImportHistory((hist) => {
      setImportHistory(hist);
    });
    return () => {
      unsub();
      unsubHist();
    };
  }, [targetDept]);

  // Available Production Departments for Handover
  const availableTargetDepartments = useMemo(() => {
    return INITIAL_DEPARTMENTS.filter((d) => d.code !== '01');
  }, []);

  // Filtered Backlog Items
  const filteredItems = useMemo(() => {
    return backlogItems.filter((item) => {
      if (item.isUnmapped && activeTab !== 'unmapped') return false;
      if (statusFilter !== 'ALL' && item.status !== statusFilter) return false;
      if (priorityFilter !== 'ALL' && item.priority !== priorityFilter) return false;
      if (deptFilter !== 'ALL') {
        const matches =
          isDepartmentMatch(item.currentDepartment, deptFilter) ||
          isDepartmentMatch(item.department, deptFilter) ||
          isDepartmentMatch(item.departmentCode, deptFilter);
        if (!matches) return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const match =
          item.machineNumber.toLowerCase().includes(q) ||
          (item.machineSize && item.machineSize.toLowerCase().includes(q)) ||
          item.remainingOperation.toLowerCase().includes(q) ||
          (item.department && item.department.toLowerCase().includes(q)) ||
          (item.currentDepartment && item.currentDepartment.toLowerCase().includes(q)) ||
          (item.project && item.project.toLowerCase().includes(q)) ||
          (item.customer && item.customer.toLowerCase().includes(q)) ||
          (item.responsiblePerson && item.responsiblePerson.toLowerCase().includes(q));
        if (!match) return false;
      }
      return true;
    });
  }, [backlogItems, statusFilter, deptFilter, priorityFilter, searchQuery, activeTab]);

  // Incoming Handovers Pending for this Department
  const incomingPendingHandovers = useMemo(() => {
    const list: { item: BacklogItem; handover: BacklogHandoverRecord }[] = [];
    backlogItems.forEach((item) => {
      (item.handovers || []).forEach((h) => {
        const matchesRec =
          targetDept &&
          (isDepartmentMatch(h.receivingDepartment, targetDept) ||
            isDepartmentMatch(h.receivingDepartment, userProfile?.department));
        const isPending = h.status === 'Awaiting Acceptance' || h.status === 'Handover Initiated';
        if ((isAdmin || matchesRec) && isPending) {
          list.push({ item, handover: h });
        }
      });
    });
    return list;
  }, [backlogItems, targetDept, userProfile, isAdmin]);

  // All Handover Records for Audit Trail (Admin) or Outgoing
  const allHandoversList = useMemo(() => {
    const list: { item: BacklogItem; handover: BacklogHandoverRecord }[] = [];
    backlogItems.forEach((item) => {
      (item.handovers || []).forEach((h) => {
        if (!targetDept || isDepartmentMatch(h.sendingDepartment, targetDept)) {
          list.push({ item, handover: h });
        }
      });
    });
    return list.sort((a, b) => new Date(b.handover.createdAt).getTime() - new Date(a.handover.createdAt).getTime());
  }, [backlogItems, targetDept]);

  // Unmapped Backlog Items (Admin)
  const unmappedItems = useMemo(() => {
    return backlogItems.filter((i) => i.isUnmapped);
  }, [backlogItems]);

  // Aggregate Metrics
  const metrics = useMemo(() => {
    const active = backlogItems.filter((i) => !i.isUnmapped);
    const totalItems = active.length;
    const totalOriginalQty = active.reduce((acc, i) => acc + (i.originalQuantity || 0), 0);
    const totalCompletedQty = active.reduce((acc, i) => acc + (i.completedQuantity || 0), 0);
    const totalPendingQty = active.reduce(
      (acc, i) => acc + (i.pendingQuantity ?? i.remainingQuantity ?? 0),
      0
    );

    const openCount = active.filter((i) => i.status === 'Open').length;
    const inProgressCount = active.filter(
      (i) => i.status === 'In Progress' || i.status === 'Partially Completed'
    ).length;
    const onHoldCount = active.filter((i) => i.status === 'On Hold' || i.status === 'Blocked').length;
    const completedCount = active.filter((i) => i.status === 'Completed').length;
    const transferredCount = active.filter(
      (i) => i.status === 'Transferred' || i.status === 'Handed Over'
    ).length;

    // Overdue calculation
    const today = new Date().toISOString().split('T')[0];
    const overdueCount = active.filter((i) => {
      if (i.status === 'Completed' || i.status === 'Transferred') return false;
      const target = i.dueDate || i.expectedCompletionDate;
      return target && target < today;
    }).length;

    return {
      totalItems,
      totalOriginalQty,
      totalCompletedQty,
      totalPendingQty,
      openCount,
      inProgressCount,
      onHoldCount,
      completedCount,
      transferredCount,
      overdueCount,
      incomingHandoversCount: incomingPendingHandovers.length,
    };
  }, [backlogItems, incomingPendingHandovers]);

  // Department Summary for Verification Report
  const departmentSummary = useMemo(() => {
    return getBacklogDepartmentSummary(backlogItems);
  }, [backlogItems]);

  // Open Update Modal
  const handleOpenEdit = (item: BacklogItem) => {
    setEditingItem(item);
    setEditStatus(item.status);
    setEditCompletedQty(item.completedQuantity || 0);
    setEditPendingQty(item.pendingQuantity ?? item.remainingQuantity ?? item.originalQuantity);
    setEditProgressPercent(
      item.progressPercent ??
        (item.status === 'Completed'
          ? 100
          : item.completedQuantity > 0
          ? Math.round((item.completedQuantity / item.originalQuantity) * 100)
          : 0)
    );
    setEditDelayReason(item.delayReason || '');
    setEditRemarks(item.remarks || '');
    setEditResponsiblePerson(item.responsiblePerson || '');
    setEditExpectedDate(item.expectedCompletionDate || item.dueDate || '');
    setEditActualDate(item.actualCompletionDate || '');
    setUpdateFeedback(null);
  };

  // Save Item Status Edit
  const handleSaveEdit = async () => {
    if (!editingItem) return;
    setSavingEdit(true);
    setUpdateFeedback(null);
    try {
      await updateBacklogItem(
        editingItem.id,
        {
          status: editStatus,
          completedQuantity: Number(editCompletedQty),
          pendingQuantity: Number(editPendingQty),
          progressPercent: Number(editProgressPercent),
          delayReason: editDelayReason,
          remarks: editRemarks,
          responsiblePerson: editResponsiblePerson,
          expectedCompletionDate: editExpectedDate,
          actualCompletionDate: editStatus === 'Completed' ? editActualDate || new Date().toISOString().split('T')[0] : editActualDate,
        },
        userProfile?.email,
        userProfile?.displayName || userProfile?.username
      );
      setUpdateFeedback('Backlog item updated successfully!');
      setTimeout(() => {
        setEditingItem(null);
        setUpdateFeedback(null);
      }, 1000);
    } catch (err: any) {
      console.error('Error saving backlog item edit:', err);
      alert('Failed to update backlog item: ' + err.message);
    } finally {
      setSavingEdit(false);
    }
  };

  // Open Handover Modal
  const handleOpenHandover = (item: BacklogItem) => {
    setHandoverItem(item);
    const currentRemaining = item.pendingQuantity ?? item.remainingQuantity ?? item.originalQuantity;
    setHandoverQty(currentRemaining > 0 ? currentRemaining : 1);
    setHandoverDate(new Date().toISOString().split('T')[0]);
    setHandoverRemarks('');
    // Default receiving department to next or first available
    const myDept = targetDept || item.currentDepartment || item.department;
    const candidates = availableTargetDepartments.filter((d) => !isDepartmentMatch(d.name, myDept));
    setHandoverReceivingDept(candidates[0]?.name || '08 Sub Assembly');
    setHandoverFeedback(null);
  };

  // Submit Handover
  const handleSubmitHandover = async () => {
    if (!handoverItem || !handoverReceivingDept) return;
    setSubmittingHandover(true);
    setHandoverFeedback(null);
    try {
      const sending = targetDept || handoverItem.currentDepartment || handoverItem.department;
      await initiateBacklogHandover({
        backlogItemId: handoverItem.id,
        sendingDepartment: sending,
        receivingDepartment: handoverReceivingDept,
        handoverQuantity: Number(handoverQty),
        handoverDate,
        remarks: handoverRemarks,
        userEmail: userProfile?.email,
        userName: userProfile?.displayName || userProfile?.username,
      });

      setHandoverFeedback(`Handover of ${handoverQty} unit(s) dispatched to ${handoverReceivingDept}!`);
      setTimeout(() => {
        setHandoverItem(null);
        setHandoverFeedback(null);
      }, 1200);
    } catch (err: any) {
      console.error('Handover failed:', err);
      alert('Handover initiation failed: ' + err.message);
    } finally {
      setSubmittingHandover(false);
    }
  };

  // Accept Incoming Handover
  const handleAcceptIncomingHandover = async (backlogItemId: string, handoverId: string) => {
    try {
      await respondBacklogHandover({
        backlogItemId,
        handoverId,
        decision: 'ACCEPT',
        userEmail: userProfile?.email,
        userName: userProfile?.displayName || userProfile?.username,
      });
      alert('Handover accepted! This machine task has been added to your active backlog.');
    } catch (err: any) {
      console.error('Accept handover error:', err);
      alert('Failed to accept handover: ' + err.message);
    }
  };

  // Reject Incoming Handover
  const handleConfirmRejection = async () => {
    if (!rejectingHandover) return;
    if (!rejectionReason.trim()) {
      alert('Please specify a reason for rejecting the handover.');
      return;
    }

    setSubmittingRejection(true);
    try {
      await respondBacklogHandover({
        backlogItemId: rejectingHandover.backlogItemId,
        handoverId: rejectingHandover.handoverId,
        decision: 'REJECT',
        rejectionReason,
        userEmail: userProfile?.email,
        userName: userProfile?.displayName || userProfile?.username,
      });
      setRejectingHandover(null);
      setRejectionReason('');
      alert('Handover rejected and returned to sending department with reason.');
    } catch (err: any) {
      console.error('Reject handover error:', err);
      alert('Failed to reject handover: ' + err.message);
    } finally {
      setSubmittingRejection(false);
    }
  };

  // Assign Unmapped Item (Admin)
  const handleAssignUnmapped = async () => {
    if (!assigningItem) return;
    setSubmittingAssign(true);
    try {
      await assignUnmappedBacklogItem(
        assigningItem.id,
        targetAssignDept,
        userProfile?.email,
        userProfile?.displayName || userProfile?.username
      );
      setAssigningItem(null);
      alert(`Record assigned to ${targetAssignDept} successfully!`);
    } catch (err: any) {
      console.error('Failed to assign unmapped record:', err);
      alert('Assignment failed: ' + err.message);
    } finally {
      setSubmittingAssign(false);
    }
  };

  // Handle File Selection for Excel Import
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    setImportFile(file);
    setParsing(true);
    setImportError(null);
    setValidationResult(null);

    try {
      const result = await parseBacklogExcel(file, machines);
      setValidationResult(result);
    } catch (err: any) {
      console.error('Failed to parse backlog excel:', err);
      setImportError(err.message || 'Failed to parse Excel file.');
    } finally {
      setParsing(false);
    }
  };

  // Commit Backlog Batch
  const handleConfirmImport = async () => {
    if (!validationResult || validationResult.validRowsCount === 0) return;

    setCommitting(true);
    setImportError(null);
    try {
      const res = await commitBacklogBatch({
        month: importMonth,
        year: importYear,
        fileName: validationResult.fileName,
        rows: validationResult.rows,
        duplicateAction: duplicateStrategy,
        userEmail: userProfile?.email,
        userName: userProfile?.displayName || userProfile?.username,
      });

      setImportSuccess(
        `Successfully processed backlog import [Batch: ${res.batchId}]: ${res.importedCount} new machine entries imported, ${res.updatedCount} existing machines updated, ${res.skippedCount} duplicates skipped. Department queues configured!`
      );
      setTimeout(() => {
        setShowImportModal(false);
        setImportSuccess(null);
        setValidationResult(null);
        setImportFile(null);
      }, 2500);
    } catch (err: any) {
      console.error('Backlog import commit failed:', err);
      setImportError(err.message || 'Failed to commit backlog batch.');
    } finally {
      setCommitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* =========================================================================
          TOP BANNER & GLOBAL ACTIONS
          ========================================================================= */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2.5">
            <div className="p-2.5 bg-amber-500 text-white rounded-xl shadow-xs">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-base font-black text-slate-900 uppercase tracking-tight">
                  {targetDept ? `${targetDept} – Backlog Execution Module` : 'Master Backlog Management Hub'}
                </h2>
                {targetDept && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                    Live Linked
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                {targetDept
                  ? `Active carryover backlog, execution tracking, status updates, and inter-department handovers for ${targetDept}`
                  : 'Universal plant-wide backlog control: multi-department allocation, live updates, handovers & reconciliation'}
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Export to Excel */}
          <button
            onClick={() => exportBacklogToExcel(filteredItems)}
            className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition flex items-center space-x-1.5 border border-slate-300 shadow-2xs"
            title="Export filtered backlog records to Excel"
          >
            <Download className="w-3.5 h-3.5 text-slate-600" />
            <span>Export Excel</span>
          </button>

          {/* Excel Template */}
          <button
            onClick={downloadBacklogTemplate}
            className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition flex items-center space-x-1.5 border border-slate-300 shadow-2xs"
            title="Download standard Excel import template"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-slate-600" />
            <span>Template</span>
          </button>

          {/* Import Backlog (Admin / Planning) */}
          {canImport && (
            <button
              onClick={() => {
                setValidationResult(null);
                setImportFile(null);
                setImportError(null);
                setShowImportModal(true);
              }}
              className="px-3.5 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl transition shadow-xs flex items-center space-x-1.5"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Import Backlog</span>
            </button>
          )}

          {/* Quick Progress Update Link */}
          {onOpenDailyUpdate && (
            <button
              onClick={onOpenDailyUpdate}
              className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition shadow-xs flex items-center space-x-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Daily Update</span>
            </button>
          )}
        </div>
      </div>

      {/* =========================================================================
          INCOMING HANDOVERS ALERT BANNER (If any pending acceptance)
          ========================================================================= */}
      {incomingPendingHandovers.length > 0 && (
        <div className="bg-amber-500/10 border-2 border-amber-500/40 rounded-2xl p-4 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-amber-500 text-white rounded-xl">
                <ArrowRightLeft className="w-5 h-5 animate-pulse" />
              </div>
              <div>
                <h3 className="text-xs font-bold text-amber-950 uppercase tracking-wider">
                  Incoming Backlog Handovers Awaiting Acceptance ({incomingPendingHandovers.length})
                </h3>
                <p className="text-[11px] text-amber-800">
                  Other departments have transferred backlog machine tasks to your department queue. Accept to add to active backlog or reject with feedback.
                </p>
              </div>
            </div>
            <button
              onClick={() => setActiveTab('incoming_handovers')}
              className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-xl transition shadow-xs shrink-0 flex items-center space-x-1.5"
            >
              <Inbox className="w-3.5 h-3.5" />
              <span>Review Incoming ({incomingPendingHandovers.length})</span>
            </button>
          </div>
        </div>
      )}

      {/* =========================================================================
          KPI SUMMARY CARDS
          ========================================================================= */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        {/* 1. Total Backlog */}
        <div className="bg-white rounded-2xl p-3.5 border border-slate-200 shadow-xs">
          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Total Backlog</div>
          <div className="text-2xl font-black text-slate-900 mt-1 font-mono">{metrics.totalItems}</div>
          <div className="text-[10px] text-slate-400 mt-0.5">
            Target Qty: <span className="font-bold text-slate-700">{metrics.totalOriginalQty}</span>
          </div>
        </div>

        {/* 2. Pending Quantity */}
        <div className="bg-white rounded-2xl p-3.5 border border-amber-300 bg-amber-50/40 shadow-xs">
          <div className="text-[10px] font-bold text-amber-800 uppercase tracking-wider">Pending Qty</div>
          <div className="text-2xl font-black text-amber-700 mt-1 font-mono">{metrics.totalPendingQty}</div>
          <div className="text-[10px] text-amber-700/80 mt-0.5">
            Open Tasks: <span className="font-bold">{metrics.openCount}</span>
          </div>
        </div>

        {/* 3. In Progress */}
        <div className="bg-white rounded-2xl p-3.5 border border-blue-200 bg-blue-50/40 shadow-xs">
          <div className="text-[10px] font-bold text-blue-800 uppercase tracking-wider">In Progress</div>
          <div className="text-2xl font-black text-blue-700 mt-1 font-mono">{metrics.inProgressCount}</div>
          <div className="text-[10px] text-blue-600 mt-0.5">Active on Floor</div>
        </div>

        {/* 4. On Hold / Blocked */}
        <div className="bg-white rounded-2xl p-3.5 border border-orange-200 bg-orange-50/40 shadow-xs">
          <div className="text-[10px] font-bold text-orange-800 uppercase tracking-wider">On Hold</div>
          <div className="text-2xl font-black text-orange-700 mt-1 font-mono">{metrics.onHoldCount}</div>
          <div className="text-[10px] text-orange-600 mt-0.5">Requires Resolution</div>
        </div>

        {/* 5. Completed */}
        <div className="bg-white rounded-2xl p-3.5 border border-emerald-200 bg-emerald-50/40 shadow-xs">
          <div className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider">Completed</div>
          <div className="text-2xl font-black text-emerald-700 mt-1 font-mono">{metrics.completedCount}</div>
          <div className="text-[10px] text-emerald-600 mt-0.5">
            Done Qty: <span className="font-bold">{metrics.totalCompletedQty}</span>
          </div>
        </div>

        {/* 6. Overdue Backlog */}
        <div className="bg-white rounded-2xl p-3.5 border border-rose-200 bg-rose-50/40 shadow-xs">
          <div className="text-[10px] font-bold text-rose-800 uppercase tracking-wider">Overdue</div>
          <div className="text-2xl font-black text-rose-700 mt-1 font-mono">{metrics.overdueCount}</div>
          <div className="text-[10px] text-rose-600 mt-0.5">Past Target Date</div>
        </div>

        {/* 7. Handovers / Transferred */}
        <div className="bg-white rounded-2xl p-3.5 border border-indigo-200 bg-indigo-50/40 shadow-xs">
          <div className="text-[10px] font-bold text-indigo-800 uppercase tracking-wider">Handed Over</div>
          <div className="text-2xl font-black text-indigo-700 mt-1 font-mono">{metrics.transferredCount}</div>
          <div className="text-[10px] text-indigo-600 mt-0.5">
            Pending HO: <span className="font-bold">{incomingPendingHandovers.length}</span>
          </div>
        </div>
      </div>

      {/* =========================================================================
          TAB NAVIGATION (ADMIN vs DEPARTMENT)
          ========================================================================= */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-200 pb-2">
        <button
          onClick={() => setActiveTab('backlog')}
          className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center space-x-1.5 ${
            activeTab === 'backlog'
              ? 'bg-amber-600 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>Assigned Backlog ({backlogItems.filter((i) => !i.isUnmapped).length})</span>
        </button>

        <button
          onClick={() => setActiveTab('incoming_handovers')}
          className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center space-x-1.5 ${
            activeTab === 'incoming_handovers'
              ? 'bg-amber-600 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Inbox className="w-3.5 h-3.5" />
          <span>Incoming Handovers</span>
          {incomingPendingHandovers.length > 0 && (
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-red-500 text-white font-black">
              {incomingPendingHandovers.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('handovers')}
          className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center space-x-1.5 ${
            activeTab === 'handovers'
              ? 'bg-amber-600 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <ArrowRightLeft className="w-3.5 h-3.5" />
          <span>Handover History ({allHandoversList.length})</span>
        </button>

        {isAdmin && (
          <>
            <button
              onClick={() => setActiveTab('unmapped')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center space-x-1.5 ${
                activeTab === 'unmapped'
                  ? 'bg-red-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <AlertCircle className="w-3.5 h-3.5" />
              <span>Unmapped Records ({unmappedItems.length})</span>
              {unmappedItems.length > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-red-100 text-red-800 font-bold border border-red-300">
                  Action Required
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('summary')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center space-x-1.5 ${
                activeTab === 'summary'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <CheckSquare className="w-3.5 h-3.5" />
              <span>Department Verification Summary</span>
            </button>

            <button
              onClick={() => setActiveTab('history')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center space-x-1.5 ${
                activeTab === 'history'
                  ? 'bg-slate-800 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>Import History</span>
            </button>
          </>
        )}
      </div>

      {/* =========================================================================
          TAB 1: ASSIGNED BACKLOG TABLE
          ========================================================================= */}
      {activeTab === 'backlog' && (
        <div className="space-y-4">
          {/* Search & Filter Toolbar */}
          <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs flex flex-col md:flex-row items-center justify-between gap-3">
            <div className="relative w-full md:w-80">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search by Machine #, size, operation, person..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full text-xs pl-9 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 font-medium"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
              {/* Status Filter */}
              <div className="flex items-center space-x-1 text-xs">
                <span className="text-slate-500 font-semibold">Status:</span>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1 text-xs font-bold text-slate-800 outline-none"
                >
                  <option value="ALL">All Statuses</option>
                  <option value="Open">Open</option>
                  <option value="In Progress">In Progress</option>
                  <option value="Partially Completed">Partially Completed</option>
                  <option value="On Hold">On Hold</option>
                  <option value="Completed">Completed</option>
                  <option value="Blocked">Blocked</option>
                  <option value="Transferred">Transferred</option>
                </select>
              </div>

              {/* Priority Filter */}
              <div className="flex items-center space-x-1 text-xs">
                <span className="text-slate-500 font-semibold">Priority:</span>
                <select
                  value={priorityFilter}
                  onChange={(e) => setPriorityFilter(e.target.value)}
                  className="bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1 text-xs font-bold text-slate-800 outline-none"
                >
                  <option value="ALL">All Priorities</option>
                  <option value="High">High</option>
                  <option value="Medium">Medium</option>
                  <option value="Low">Low</option>
                </select>
              </div>

              {/* Department Filter (Admin view only) */}
              {isAdmin && (
                <div className="flex items-center space-x-1 text-xs">
                  <span className="text-slate-500 font-semibold">Dept:</span>
                  <select
                    value={deptFilter}
                    onChange={(e) => setDeptFilter(e.target.value)}
                    className="bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1 text-xs font-bold text-slate-800 outline-none max-w-[200px]"
                  >
                    <option value="ALL">All Departments</option>
                    {availableTargetDepartments.map((d) => (
                      <option key={d.code} value={d.name}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>

          {/* Backlog Items Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100/80 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[10px]">
                  <tr>
                    <th className="p-3.5">Machine #</th>
                    <th className="p-3.5">Size</th>
                    <th className="p-3.5">Department Linkage</th>
                    <th className="p-3.5">Remaining Operation / Task</th>
                    <th className="p-3.5">Priority</th>
                    <th className="p-3.5 text-center">Quantities</th>
                    <th className="p-3.5">Status</th>
                    <th className="p-3.5">Progress</th>
                    <th className="p-3.5">Target Due</th>
                    <th className="p-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredItems.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="p-8 text-center text-slate-400 text-xs">
                        {loading ? 'Loading backlog data...' : 'No backlog items match the selected criteria.'}
                      </td>
                    </tr>
                  ) : (
                    filteredItems.map((item) => {
                      const pending = item.pendingQuantity ?? item.remainingQuantity ?? item.originalQuantity;
                      const isOverdue =
                        item.status !== 'Completed' &&
                        item.status !== 'Transferred' &&
                        item.dueDate &&
                        item.dueDate < new Date().toISOString().split('T')[0];
                      const isHandedOver = item.status === 'Transferred' || item.status === 'Handed Over';

                      return (
                        <tr key={item.id} className="hover:bg-slate-50/70 transition">
                          {/* Machine Number */}
                          <td className="p-3.5 font-bold text-slate-900 font-mono">
                            <span className="px-2 py-1 bg-slate-100 rounded-lg border border-slate-200 text-slate-800">
                              {item.machineNumber}
                            </span>
                          </td>

                          {/* Machine Size */}
                          <td className="p-3.5 text-slate-600 font-semibold">{item.machineSize}</td>

                          {/* Department Linkage */}
                          <td className="p-3.5">
                            <div className="font-bold text-slate-800 flex items-center space-x-1">
                              <span className="font-mono text-[10px] px-1.5 py-0.2 rounded bg-indigo-50 text-indigo-700 font-black">
                                {item.departmentCode || 'DEPT'}
                              </span>
                              <span>{item.currentDepartment || item.department}</span>
                            </div>
                            {item.originalDepartment &&
                              item.currentDepartment &&
                              item.originalDepartment !== item.currentDepartment && (
                                <div className="text-[10px] text-indigo-600 font-medium mt-0.5">
                                  Transferred from: {item.originalDepartment}
                                </div>
                              )}
                          </td>

                          {/* Remaining Operation */}
                          <td className="p-3.5 max-w-xs">
                            <div className="font-bold text-slate-900 leading-snug">{item.remainingOperation}</div>
                            {item.remarks && (
                              <div className="text-[10px] text-slate-400 truncate mt-0.5" title={item.remarks}>
                                {item.remarks}
                              </div>
                            )}
                            {item.responsiblePerson && (
                              <div className="text-[10px] text-slate-500 font-medium mt-0.5 flex items-center space-x-1">
                                <User className="w-3 h-3 text-slate-400" />
                                <span>{item.responsiblePerson}</span>
                              </div>
                            )}
                          </td>

                          {/* Priority */}
                          <td className="p-3.5 font-mono text-[11px]">
                            <span
                              className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
                                item.priority === 'High' || item.priority.startsWith('P0')
                                  ? 'bg-red-50 text-red-700 border border-red-200'
                                  : 'bg-slate-100 text-slate-700 border border-slate-200'
                              }`}
                            >
                              {item.priority}
                            </span>
                          </td>

                          {/* Quantities Breakdown */}
                          <td className="p-3.5 text-center">
                            <div className="inline-flex items-center space-x-1 text-xs">
                              <span className="text-slate-400 font-semibold" title="Original Qty">
                                {item.originalQuantity}
                              </span>
                              <span className="text-slate-300">/</span>
                              <span className="text-emerald-600 font-semibold" title="Completed Qty">
                                {item.completedQuantity || 0}
                              </span>
                              <span className="text-slate-300">/</span>
                              <span
                                className="font-black text-amber-700 font-mono px-1.5 py-0.2 rounded bg-amber-100 border border-amber-300"
                                title="Pending Qty"
                              >
                                {pending}
                              </span>
                            </div>
                          </td>

                          {/* Status */}
                          <td className="p-3.5">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold inline-flex items-center space-x-1 ${
                                item.status === 'Completed'
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  : item.status === 'In Progress'
                                  ? 'bg-blue-50 text-blue-700 border border-blue-200'
                                  : item.status === 'Partially Completed'
                                  ? 'bg-teal-50 text-teal-700 border border-teal-200'
                                  : item.status === 'On Hold' || item.status === 'Blocked'
                                  ? 'bg-orange-50 text-orange-700 border border-orange-200'
                                  : item.status === 'Transferred'
                                  ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                                  : 'bg-amber-50 text-amber-700 border border-amber-200'
                              }`}
                            >
                              <span>{item.status}</span>
                            </span>
                          </td>

                          {/* Progress */}
                          <td className="p-3.5">
                            <div className="w-20">
                              <div className="flex justify-between text-[10px] font-bold text-slate-600 mb-0.5">
                                <span>{item.progressPercent || (item.status === 'Completed' ? 100 : 0)}%</span>
                              </div>
                              <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
                                <div
                                  className={`h-1.5 rounded-full ${
                                    item.status === 'Completed' ? 'bg-emerald-500' : 'bg-blue-500'
                                  }`}
                                  style={{
                                    width: `${item.progressPercent || (item.status === 'Completed' ? 100 : 0)}%`,
                                  }}
                                />
                              </div>
                            </div>
                          </td>

                          {/* Target Due Date */}
                          <td className="p-3.5">
                            <div className="font-medium text-slate-700">{item.dueDate || 'Immediate'}</div>
                            {isOverdue && (
                              <span className="text-[9px] font-bold text-rose-600 bg-rose-50 px-1 py-0.2 rounded border border-rose-200 mt-0.5 inline-block">
                                Overdue
                              </span>
                            )}
                          </td>

                          {/* Actions: UPDATE and HANDOVER */}
                          <td className="p-3.5 text-right whitespace-nowrap">
                            <div className="inline-flex items-center space-x-1.5">
                              {/* UPDATE Button */}
                              <button
                                onClick={() => handleOpenEdit(item)}
                                className="px-2.5 py-1 bg-blue-50 hover:bg-blue-600 text-blue-700 hover:text-white rounded-lg text-xs font-bold border border-blue-200 transition shadow-2xs flex items-center space-x-1"
                                title="Update status, progress, delay reasons, and completion"
                              >
                                <Edit2 className="w-3 h-3" />
                                <span>Update</span>
                              </button>

                              {/* HANDOVER Button */}
                              {!isHandedOver && pending > 0 && (
                                <button
                                  onClick={() => handleOpenHandover(item)}
                                  className="px-2.5 py-1 bg-amber-50 hover:bg-amber-600 text-amber-800 hover:text-white rounded-lg text-xs font-bold border border-amber-300 transition shadow-2xs flex items-center space-x-1"
                                  title="Handover this backlog task (full or partial) to another department"
                                >
                                  <ArrowRightLeft className="w-3 h-3" />
                                  <span>Handover</span>
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          TAB 2: INCOMING HANDOVERS (Pending Acceptance)
          ========================================================================= */}
      {activeTab === 'incoming_handovers' && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900 uppercase">Incoming Backlog Handovers</h3>
              <p className="text-xs text-slate-500">
                Tasks transferred by preceding departments awaiting your acceptance or rejection with feedback.
              </p>
            </div>
            <span className="px-3 py-1 bg-amber-100 text-amber-800 font-bold text-xs rounded-xl border border-amber-300">
              {incomingPendingHandovers.length} Pending Actions
            </span>
          </div>

          {incomingPendingHandovers.length === 0 ? (
            <div className="bg-white rounded-2xl p-12 text-center border border-slate-200 shadow-xs">
              <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto mb-2" />
              <h4 className="text-sm font-bold text-slate-800">All Inbound Backlog Handovers Cleared</h4>
              <p className="text-xs text-slate-500 mt-1">
                There are no pending incoming handovers waiting for your department.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {incomingPendingHandovers.map(({ item, handover }) => (
                <div
                  key={handover.id}
                  className="bg-white rounded-2xl p-4 border-2 border-amber-400 shadow-xs flex flex-col justify-between"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <span className="font-mono text-xs font-black text-slate-900 px-2 py-0.5 bg-slate-100 rounded border border-slate-200">
                          {item.machineNumber}
                        </span>
                        <span className="text-xs text-slate-600 font-bold">{item.machineSize}</span>
                      </div>
                      <span className="px-2 py-0.5 text-[10px] font-black rounded-full bg-amber-100 text-amber-800 border border-amber-300">
                        {handover.status}
                      </span>
                    </div>

                    <div className="text-xs font-bold text-slate-900">{item.remainingOperation}</div>

                    <div className="grid grid-cols-2 gap-2 text-[11px] pt-2 border-t border-slate-100">
                      <div>
                        <span className="text-slate-400 font-medium">From Department:</span>
                        <div className="font-bold text-slate-800">{handover.sendingDepartment}</div>
                      </div>
                      <div>
                        <span className="text-slate-400 font-medium">Handover Qty:</span>
                        <div className="font-black text-amber-700 font-mono text-sm">
                          {handover.handoverQuantity} unit(s)
                        </div>
                      </div>
                      <div>
                        <span className="text-slate-400 font-medium">Handover Date:</span>
                        <div className="font-medium text-slate-700">{handover.handoverDate}</div>
                      </div>
                      <div>
                        <span className="text-slate-400 font-medium">Initiated By:</span>
                        <div className="font-medium text-slate-700 truncate">{handover.initiatedBy || 'Sender'}</div>
                      </div>
                    </div>

                    {handover.remarks && (
                      <div className="text-[11px] bg-slate-50 p-2 rounded-lg text-slate-600 border border-slate-200">
                        <strong>Sender Remarks:</strong> {handover.remarks}
                      </div>
                    )}
                  </div>

                  <div className="pt-4 mt-3 border-t border-slate-100 flex items-center justify-end space-x-2">
                    <button
                      onClick={() =>
                        setRejectingHandover({
                          backlogItemId: item.id,
                          handoverId: handover.id,
                          machineNumber: item.machineNumber,
                        })
                      }
                      className="px-3 py-1.5 bg-rose-50 hover:bg-rose-600 text-rose-700 hover:text-white font-bold text-xs rounded-xl transition border border-rose-200 flex items-center space-x-1"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                      <span>Reject Handover</span>
                    </button>
                    <button
                      onClick={() => handleAcceptIncomingHandover(item.id, handover.id)}
                      className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl transition shadow-xs flex items-center space-x-1"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>Accept Handover</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* =========================================================================
          TAB 3: HANDOVER HISTORY & AUDIT TRAIL
          ========================================================================= */}
      {activeTab === 'handovers' && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900 uppercase">Backlog Handover History &amp; Audit Trail</h3>
              <p className="text-xs text-slate-500">
                Full chronological record of all inter-department backlog handovers, partial quantities, and acceptance statuses.
              </p>
            </div>
            <span className="text-xs font-bold text-slate-600 bg-slate-100 px-3 py-1 rounded-xl">
              {allHandoversList.length} Total Handovers
            </span>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100/80 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[10px]">
                  <tr>
                    <th className="p-3.5">Machine #</th>
                    <th className="p-3.5">Size</th>
                    <th className="p-3.5">Sending Dept</th>
                    <th className="p-3.5">Receiving Dept</th>
                    <th className="p-3.5 text-center">Handover Qty</th>
                    <th className="p-3.5">Date</th>
                    <th className="p-3.5">Status</th>
                    <th className="p-3.5">Remarks / Reason</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {allHandoversList.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="p-8 text-center text-slate-400 text-xs">
                        No backlog handovers recorded yet.
                      </td>
                    </tr>
                  ) : (
                    allHandoversList.map(({ item, handover }) => (
                      <tr key={handover.id} className="hover:bg-slate-50">
                        <td className="p-3.5 font-bold font-mono text-slate-900">{item.machineNumber}</td>
                        <td className="p-3.5 text-slate-600 font-medium">{item.machineSize}</td>
                        <td className="p-3.5 font-bold text-slate-800">{handover.sendingDepartment}</td>
                        <td className="p-3.5 font-bold text-indigo-700">{handover.receivingDepartment}</td>
                        <td className="p-3.5 text-center font-black font-mono text-amber-700">
                          {handover.handoverQuantity}
                        </td>
                        <td className="p-3.5 text-slate-600">{handover.handoverDate}</td>
                        <td className="p-3.5">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              handover.status === 'Accepted'
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : handover.status === 'Rejected'
                                ? 'bg-rose-50 text-rose-700 border border-rose-200'
                                : 'bg-amber-50 text-amber-700 border border-amber-200'
                            }`}
                          >
                            {handover.status}
                          </span>
                        </td>
                        <td className="p-3.5 text-slate-600 max-w-xs">
                          <div>{handover.remarks || '-'}</div>
                          {handover.rejectionReason && (
                            <div className="text-[10px] text-rose-600 font-bold mt-0.5">
                              Rejection: {handover.rejectionReason}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          TAB 4: UNMAPPED RECORDS (Admin only)
          ========================================================================= */}
      {isAdmin && activeTab === 'unmapped' && (
        <div className="space-y-4">
          <div className="bg-red-50 border border-red-200 rounded-2xl p-4 shadow-xs flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-red-600 text-white rounded-xl">
                <AlertCircle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-red-950 uppercase">Unmapped Backlog Records ({unmappedItems.length})</h3>
                <p className="text-xs text-red-800">
                  Records whose department in the uploaded Excel was unrecognized or ambiguous. Assign them to a department queue below.
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[10px]">
                  <tr>
                    <th className="p-3.5">Machine #</th>
                    <th className="p-3.5">Size</th>
                    <th className="p-3.5">Raw Excel Dept</th>
                    <th className="p-3.5">Operation Description</th>
                    <th className="p-3.5 text-center">Qty</th>
                    <th className="p-3.5">Priority</th>
                    <th className="p-3.5 text-right">Assign Department</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {unmappedItems.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-slate-400 text-xs">
                        All backlog records successfully mapped to manufacturing departments!
                      </td>
                    </tr>
                  ) : (
                    unmappedItems.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-50">
                        <td className="p-3.5 font-bold font-mono text-slate-900">{item.machineNumber}</td>
                        <td className="p-3.5 text-slate-600 font-medium">{item.machineSize}</td>
                        <td className="p-3.5 font-bold text-red-600 bg-red-50/50 rounded">{item.department}</td>
                        <td className="p-3.5 text-slate-800 font-medium max-w-xs">{item.remainingOperation}</td>
                        <td className="p-3.5 text-center font-black font-mono">{item.originalQuantity}</td>
                        <td className="p-3.5">{item.priority}</td>
                        <td className="p-3.5 text-right">
                          <button
                            onClick={() => {
                              setAssigningItem(item);
                              setTargetAssignDept('03 Purchase');
                            }}
                            className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl transition shadow-xs"
                          >
                            Assign Dept
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          TAB 5: DEPARTMENT VERIFICATION SUMMARY (Admin only)
          ========================================================================= */}
      {isAdmin && activeTab === 'summary' && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900 uppercase">
                Department-Wise Backlog Verification Report
              </h3>
              <p className="text-xs text-slate-500">
                Detailed verification matrix confirming database linkage across all manufacturing departments.
              </p>
            </div>
            <button
              onClick={() => exportBacklogToExcel(backlogItems, 'Backlog_Verification_Matrix.xlsx')}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition border border-slate-300 flex items-center space-x-1"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export Summary</span>
            </button>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100 border-b border-slate-200 text-slate-700 font-bold uppercase tracking-wider text-[10px]">
                  <tr>
                    <th className="p-3.5">Dept Code</th>
                    <th className="p-3.5">Department Name</th>
                    <th className="p-3.5 text-center">Existing Backlog</th>
                    <th className="p-3.5 text-center">Linked to Dashboard</th>
                    <th className="p-3.5 text-center">Unmapped</th>
                    <th className="p-3.5 text-center">Pending Qty</th>
                    <th className="p-3.5 text-center">Completed</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {departmentSummary.rows.map((row) => (
                    <tr
                      key={row.code}
                      className={row.code === 'UNMAPPED' ? 'bg-red-50/50 text-red-900' : 'hover:bg-slate-50'}
                    >
                      <td className="p-3.5 font-mono font-bold">{row.code}</td>
                      <td className="p-3.5 font-bold text-slate-900">{row.department}</td>
                      <td className="p-3.5 text-center font-mono font-bold text-slate-700">{row.existingCount}</td>
                      <td className="p-3.5 text-center font-mono font-bold text-emerald-600">
                        {row.linkedCount}
                      </td>
                      <td className="p-3.5 text-center font-mono font-bold text-red-600">
                        {row.unmappedCount}
                      </td>
                      <td className="p-3.5 text-center font-mono font-black text-amber-700 bg-amber-50/30">
                        {row.totalPendingQty}
                      </td>
                      <td className="p-3.5 text-center font-mono font-bold text-emerald-700">
                        {row.completedCount}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-slate-100 font-black border-t-2 border-slate-300 text-xs">
                  <tr>
                    <td className="p-3.5" colSpan={2}>
                      TOTAL FACTORY BACKLOG
                    </td>
                    <td className="p-3.5 text-center font-mono text-slate-900">
                      {departmentSummary.totalExisting}
                    </td>
                    <td className="p-3.5 text-center font-mono text-emerald-700">
                      {departmentSummary.totalLinked}
                    </td>
                    <td className="p-3.5 text-center font-mono text-red-700">
                      {departmentSummary.totalUnmapped}
                    </td>
                    <td className="p-3.5 text-center font-mono text-amber-800 bg-amber-100/60 text-sm">
                      {departmentSummary.grandPendingQty}
                    </td>
                    <td className="p-3.5 text-center font-mono text-emerald-700">
                      {departmentSummary.rows.reduce((acc, r) => acc + r.completedCount, 0)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          TAB 6: IMPORT HISTORY
          ========================================================================= */}
      {isAdmin && activeTab === 'history' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-200 flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900 uppercase">Excel Import History</h3>
            <span className="text-xs text-slate-500 font-medium">{importHistory.length} uploads recorded</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100 border-b border-slate-200 text-slate-600 font-bold uppercase text-[10px]">
                <tr>
                  <th className="p-3.5">File Name</th>
                  <th className="p-3.5">Date &amp; Time</th>
                  <th className="p-3.5">Uploaded By</th>
                  <th className="p-3.5 text-center">Total Rows</th>
                  <th className="p-3.5 text-center">Imported</th>
                  <th className="p-3.5">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {importHistory.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-slate-400 text-xs">
                      No import history recorded yet.
                    </td>
                  </tr>
                ) : (
                  importHistory.map((h, i) => (
                    <tr key={i} className="hover:bg-slate-50">
                      <td className="p-3.5 font-bold font-mono text-slate-900">{h.fileName}</td>
                      <td className="p-3.5 text-slate-600">{new Date(h.uploadDateTime).toLocaleString()}</td>
                      <td className="p-3.5 text-slate-800">{h.uploadedBy}</td>
                      <td className="p-3.5 text-center font-mono">{h.totalRows}</td>
                      <td className="p-3.5 text-center font-mono text-emerald-600 font-bold">{h.importedCount}</td>
                      <td className="p-3.5">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          {h.status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* =========================================================================
          WORKING UPDATE MODAL
          ========================================================================= */}
      {editingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-xl w-full p-6 shadow-2xl border border-slate-200 space-y-4 my-8">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 bg-blue-600 text-white rounded-xl">
                  <Edit2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900 uppercase">
                    Update Backlog Execution Status
                  </h3>
                  <p className="text-xs text-slate-500 font-medium">
                    Machine {editingItem.machineNumber} &bull; {editingItem.machineSize}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setEditingItem(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Read-Only Data Integrity Card */}
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 text-xs grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div>
                <span className="text-[10px] text-slate-400 font-bold uppercase flex items-center space-x-1">
                  <Lock className="w-2.5 h-2.5" />
                  <span>Machine #</span>
                </span>
                <span className="font-bold text-slate-900 font-mono text-sm">{editingItem.machineNumber}</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 font-bold uppercase flex items-center space-x-1">
                  <Lock className="w-2.5 h-2.5" />
                  <span>Size</span>
                </span>
                <span className="font-bold text-slate-900">{editingItem.machineSize}</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 font-bold uppercase flex items-center space-x-1">
                  <Lock className="w-2.5 h-2.5" />
                  <span>Orig. Dept</span>
                </span>
                <span className="font-bold text-slate-900 truncate block">
                  {editingItem.originalDepartment || editingItem.department}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 font-bold uppercase flex items-center space-x-1">
                  <Lock className="w-2.5 h-2.5" />
                  <span>Orig. Qty</span>
                </span>
                <span className="font-bold text-slate-900 font-mono text-sm">
                  {editingItem.originalQuantity} unit(s)
                </span>
              </div>
            </div>

            {/* Editable Form Fields */}
            <div className="space-y-3.5 text-xs">
              {/* Status & Progress Slider */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Execution Status</label>
                  <select
                    value={editStatus}
                    onChange={(e) => {
                      const st = e.target.value as BacklogStatus;
                      setEditStatus(st);
                      if (st === 'Completed') {
                        setEditCompletedQty(editingItem.originalQuantity);
                        setEditPendingQty(0);
                        setEditProgressPercent(100);
                        setEditActualDate(new Date().toISOString().split('T')[0]);
                      }
                    }}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 font-bold text-slate-900 outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="Open">Open</option>
                    <option value="In Progress">In Progress</option>
                    <option value="Partially Completed">Partially Completed</option>
                    <option value="On Hold">On Hold</option>
                    <option value="Completed">Completed</option>
                    <option value="Blocked">Blocked</option>
                  </select>
                </div>

                <div>
                  <div className="flex justify-between font-bold mb-1">
                    <span className="text-slate-700">Progress Percentage</span>
                    <span className="text-blue-600 font-mono">{editProgressPercent}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="5"
                    value={editProgressPercent}
                    onChange={(e) => setEditProgressPercent(Number(e.target.value))}
                    className="w-full accent-blue-600 cursor-pointer mt-2"
                  />
                </div>
              </div>

              {/* Quantities: Completed & Pending */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Completed Quantity</label>
                  <input
                    type="number"
                    min="0"
                    max={editingItem.originalQuantity}
                    value={editCompletedQty}
                    onChange={(e) => {
                      const val = Math.max(0, Math.min(editingItem.originalQuantity, Number(e.target.value)));
                      setEditCompletedQty(val);
                      setEditPendingQty(Math.max(0, editingItem.originalQuantity - val));
                    }}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2 font-mono font-bold text-slate-900 outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Pending Quantity</label>
                  <input
                    type="number"
                    min="0"
                    max={editingItem.originalQuantity}
                    value={editPendingQty}
                    onChange={(e) => setEditPendingQty(Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2 font-mono font-bold text-amber-700 outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Responsible Person & Delay Reason */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Responsible Person</label>
                  <input
                    type="text"
                    placeholder="Operator / Engineer name"
                    value={editResponsiblePerson}
                    onChange={(e) => setEditResponsiblePerson(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2 font-medium text-slate-900 outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">
                    Delay Reason {editStatus === 'On Hold' && <span className="text-red-500">*</span>}
                  </label>
                  <input
                    type="text"
                    placeholder="Material shortage, alignment delay, etc."
                    value={editDelayReason}
                    onChange={(e) => setEditDelayReason(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2 font-medium text-slate-900 outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Target & Actual Dates */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Expected Completion</label>
                  <input
                    type="date"
                    value={editExpectedDate}
                    onChange={(e) => setEditExpectedDate(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2 text-slate-900 outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Actual Completion Date</label>
                  <input
                    type="date"
                    value={editActualDate}
                    onChange={(e) => setEditActualDate(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2 text-slate-900 outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                  />
                </div>
              </div>

              {/* Remarks */}
              <div>
                <label className="block text-slate-700 font-bold mb-1">Execution Remarks / Notes</label>
                <textarea
                  rows={2}
                  placeholder="Additional notes on tooling, precision check, or handoff readiness..."
                  value={editRemarks}
                  onChange={(e) => setEditRemarks(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2 text-slate-900 outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                />
              </div>

              {updateFeedback && (
                <div className="p-2.5 rounded-xl bg-emerald-50 text-emerald-800 font-bold border border-emerald-200 text-center">
                  {updateFeedback}
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-end space-x-2">
              <button
                onClick={() => setEditingItem(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition"
              >
                Cancel
              </button>
              <button
                disabled={savingEdit}
                onClick={handleSaveEdit}
                className="px-5 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white transition shadow-xs flex items-center space-x-1.5"
              >
                {savingEdit ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Save Update</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          WORKING HANDOVER MODAL
          ========================================================================= */}
      {handoverItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4 my-8">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 bg-amber-500 text-white rounded-xl">
                  <ArrowRightLeft className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900 uppercase">Initiate Backlog Handover</h3>
                  <p className="text-xs text-slate-500 font-medium">
                    Machine {handoverItem.machineNumber} &bull; {handoverItem.machineSize}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setHandoverItem(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Source Information */}
            <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 text-xs space-y-1.5">
              <div className="flex justify-between">
                <span className="text-slate-500">Operation:</span>
                <span className="font-bold text-slate-900 text-right">{handoverItem.remainingOperation}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Sending Department:</span>
                <span className="font-bold text-slate-900">
                  {targetDept || handoverItem.currentDepartment || handoverItem.department}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Available Pending Quantity:</span>
                <span className="font-black text-amber-700 font-mono text-sm">
                  {handoverItem.pendingQuantity ?? handoverItem.remainingQuantity ?? handoverItem.originalQuantity} unit(s)
                </span>
              </div>
            </div>

            {/* Handover Form */}
            <div className="space-y-3.5 text-xs">
              {/* Receiving Department Dropdown */}
              <div>
                <label className="block text-slate-700 font-bold mb-1">Receiving Department *</label>
                <select
                  value={handoverReceivingDept}
                  onChange={(e) => setHandoverReceivingDept(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 font-bold text-slate-900 outline-none focus:ring-2 focus:ring-amber-500"
                >
                  {availableTargetDepartments
                    .filter((d) => !isDepartmentMatch(d.name, targetDept || handoverItem.currentDepartment))
                    .map((d) => (
                      <option key={d.code} value={d.name}>
                        {d.name}
                      </option>
                    ))}
                </select>
              </div>

              {/* Handover Quantity */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Handover Quantity *</label>
                  <input
                    type="number"
                    min="1"
                    max={handoverItem.pendingQuantity ?? handoverItem.remainingQuantity ?? handoverItem.originalQuantity}
                    value={handoverQty}
                    onChange={(e) => setHandoverQty(Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2 font-mono font-black text-amber-700 outline-none focus:ring-2 focus:ring-amber-500 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Handover Date</label>
                  <input
                    type="date"
                    value={handoverDate}
                    onChange={(e) => setHandoverDate(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2 text-slate-900 outline-none focus:ring-2 focus:ring-amber-500 font-medium"
                  />
                </div>
              </div>

              {/* Partial vs Full Handover Helper Notice */}
              <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-[11px]">
                {handoverQty < (handoverItem.pendingQuantity ?? handoverItem.remainingQuantity ?? 1) ? (
                  <span>
                    <strong>Partial Handover:</strong> You will hand over {handoverQty} unit(s) and retain{' '}
                    {(handoverItem.pendingQuantity ?? handoverItem.remainingQuantity ?? 1) - handoverQty} unit(s) in your active backlog queue.
                  </span>
                ) : (
                  <span>
                    <strong>Full Handover:</strong> All {handoverQty} pending unit(s) will be transferred. Your record will be marked as &ldquo;Transferred&rdquo;.
                  </span>
                )}
              </div>

              {/* Remarks */}
              <div>
                <label className="block text-slate-700 font-bold mb-1">Remarks / Handoff Instructions</label>
                <textarea
                  rows={2}
                  placeholder="Special instructions for receiving team, stage status, surface condition..."
                  value={handoverRemarks}
                  onChange={(e) => setHandoverRemarks(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2 text-slate-900 outline-none focus:ring-2 focus:ring-amber-500 font-medium"
                />
              </div>

              {handoverFeedback && (
                <div className="p-2.5 rounded-xl bg-emerald-50 text-emerald-800 font-bold border border-emerald-200 text-center">
                  {handoverFeedback}
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-end space-x-2">
              <button
                onClick={() => setHandoverItem(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition"
              >
                Cancel
              </button>
              <button
                disabled={submittingHandover}
                onClick={handleSubmitHandover}
                className="px-5 py-2 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white transition shadow-xs flex items-center space-x-1.5"
              >
                {submittingHandover ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Dispatching...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5" />
                    <span>Dispatch Handover</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          REJECT HANDOVER MODAL
          ========================================================================= */}
      {rejectingHandover && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center space-x-2.5 text-rose-600">
              <XCircle className="w-5 h-5" />
              <h3 className="text-sm font-black text-slate-900 uppercase">Reject Inbound Handover</h3>
            </div>
            <p className="text-xs text-slate-600">
              Provide reason for rejecting Machine <strong>{rejectingHandover.machineNumber}</strong>. The task will be returned to the sending department.
            </p>
            <div>
              <label className="block text-slate-700 text-xs font-bold mb-1">Rejection Reason *</label>
              <textarea
                rows={3}
                placeholder="Missing components, incomplete prior machining, tolerance out of spec..."
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs text-slate-900 outline-none focus:ring-2 focus:ring-rose-500 font-medium"
              />
            </div>
            <div className="pt-2 flex items-center justify-end space-x-2">
              <button
                onClick={() => setRejectingHandover(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                disabled={submittingRejection}
                onClick={handleConfirmRejection}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl transition shadow-xs flex items-center space-x-1"
              >
                {submittingRejection ? <span>Rejecting...</span> : <span>Confirm Rejection</span>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          ASSIGN UNMAPPED ITEM MODAL (Admin only)
          ========================================================================= */}
      {assigningItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center space-x-2.5 text-indigo-600">
              <ShieldAlert className="w-5 h-5" />
              <h3 className="text-sm font-black text-slate-900 uppercase">Assign Unmapped Backlog Record</h3>
            </div>
            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs space-y-1">
              <div>
                <strong>Machine:</strong> {assigningItem.machineNumber} ({assigningItem.machineSize})
              </div>
              <div>
                <strong>Operation:</strong> {assigningItem.remainingOperation}
              </div>
              <div>
                <strong>Raw Excel Dept:</strong> {assigningItem.department}
              </div>
            </div>
            <div>
              <label className="block text-slate-700 text-xs font-bold mb-1">Target Department *</label>
              <select
                value={targetAssignDept}
                onChange={(e) => setTargetAssignDept(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs font-bold text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {availableTargetDepartments.map((d) => (
                  <option key={d.code} value={d.name}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="pt-2 flex items-center justify-end space-x-2">
              <button
                onClick={() => setAssigningItem(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                disabled={submittingAssign}
                onClick={handleAssignUnmapped}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition shadow-xs"
              >
                {submittingAssign ? 'Assigning...' : 'Assign to Department'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          EXCEL IMPORT MODAL
          ========================================================================= */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 space-y-5 my-8">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 bg-amber-600 text-white rounded-xl">
                  <Upload className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900 uppercase">Import Backlog Excel File</h3>
                  <p className="text-xs text-slate-500 font-medium">
                    Upload multi-department backlog workbook with intelligent column matching
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowImportModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Target Planning Period */}
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block text-slate-700 font-bold mb-1">Import Month</label>
                <select
                  value={importMonth}
                  onChange={(e) => setImportMonth(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2 font-bold text-slate-800"
                >
                  {[
                    'January',
                    'February',
                    'March',
                    'April',
                    'May',
                    'June',
                    'July',
                    'August',
                    'September',
                    'October',
                    'November',
                    'December',
                  ].map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-slate-700 font-bold mb-1">Import Year</label>
                <select
                  value={importYear}
                  onChange={(e) => setImportYear(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2 font-bold text-slate-800"
                >
                  <option value="2026">2026</option>
                  <option value="2027">2027</option>
                </select>
              </div>
            </div>

            {/* File Dropzone */}
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-slate-300 hover:border-amber-500 rounded-2xl p-6 text-center cursor-pointer transition bg-slate-50/50 hover:bg-amber-50/20"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx, .xls, .csv"
                onChange={handleFileChange}
                className="hidden"
              />
              <FileSpreadsheet className="w-10 h-10 text-slate-400 mx-auto mb-2" />
              <div className="text-xs font-bold text-slate-800">
                {importFile ? importFile.name : 'Click to select Backlog Excel file (.xlsx, .xls)'}
              </div>
              <div className="text-[11px] text-slate-400 mt-1">
                Required columns: Machine No., Machine Size, Department, Month, Backlog Qty, Priority, Target Date
              </div>
            </div>

            {/* Validation Feedback */}
            {parsing && (
              <div className="text-center text-xs text-amber-700 font-bold flex items-center justify-center space-x-2">
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Parsing and validating backlog workbook rows...</span>
              </div>
            )}

            {validationResult && (
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 text-xs space-y-2">
                <div className="flex items-center justify-between font-bold">
                  <span className="text-slate-800">Workbook Validation Summary:</span>
                  <span className="text-emerald-700 font-black">{validationResult.validRowsCount} Valid Rows</span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center pt-2 border-t border-slate-200">
                  <div className="bg-white p-2 rounded-xl border border-slate-200">
                    <div className="text-[10px] text-slate-400 font-bold">Total Rows</div>
                    <div className="text-sm font-black text-slate-800">{validationResult.totalRows}</div>
                  </div>
                  <div className="bg-white p-2 rounded-xl border border-slate-200">
                    <div className="text-[10px] text-slate-400 font-bold">Valid Rows</div>
                    <div className="text-sm font-black text-emerald-600">{validationResult.validRowsCount}</div>
                  </div>
                  <div className="bg-white p-2 rounded-xl border border-slate-200">
                    <div className="text-[10px] text-slate-400 font-bold">Invalid / Skipped</div>
                    <div className="text-sm font-black text-rose-600">{validationResult.invalidRowsCount}</div>
                  </div>
                </div>

                {validationResult.errors.length > 0 && (
                  <div className="pt-2">
                    <button
                      onClick={() => downloadBacklogErrorReport(validationResult.errors)}
                      className="text-xs text-rose-600 font-bold hover:underline flex items-center space-x-1"
                    >
                      <Download className="w-3 h-3" />
                      <span>Download Validation Error Report ({validationResult.errors.length} errors)</span>
                    </button>
                  </div>
                )}
              </div>
            )}

            {importError && (
              <div className="p-3 rounded-xl bg-rose-50 text-rose-800 text-xs font-bold border border-rose-200">
                {importError}
              </div>
            )}

            {importSuccess && (
              <div className="p-3 rounded-xl bg-emerald-50 text-emerald-800 text-xs font-bold border border-emerald-200">
                {importSuccess}
              </div>
            )}

            <div className="pt-3 border-t border-slate-100 flex items-center justify-end space-x-2">
              <button
                onClick={() => setShowImportModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                disabled={!validationResult || validationResult.validRowsCount === 0 || committing}
                onClick={handleConfirmImport}
                className="px-5 py-2 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white transition shadow-xs flex items-center space-x-1.5 disabled:opacity-50"
              >
                {committing ? 'Importing Batch...' : `Confirm Import (${validationResult?.validRowsCount || 0} Rows)`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
