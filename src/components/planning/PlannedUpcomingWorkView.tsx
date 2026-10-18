import React, { useState, useMemo } from 'react';
import {
  Calendar,
  Clock,
  Cpu,
  Layers,
  ArrowRight,
  ShieldAlert,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Lock,
  Unlock,
  Building,
  Search,
  Filter,
  Eye,
  Info,
  HelpCircle,
  ArrowRightLeft,
  Send,
  X,
  Check,
  RotateCcw,
} from 'lucide-react';
import { Machine, MonthlyPlan, WeeklyPlan, DepartmentHandover, Department } from '../../types';
import { checkDepartmentWorkPermission } from '../../services/adminPlanImportService';
import { isDepartmentMatch } from '../../utils/departmentUtils';
import { PRODUCTION_DEPARTMENTS } from '../../constants';
import { createHandover } from '../../services/workflowService';
import { useAuth } from '../../context/AuthContext';
import { areMachineNumbersEqual, getMachineDisplaySize, normalizeMachineNumber } from '../../utils/machineUtils';

interface PlannedUpcomingWorkViewProps {
  currentDepartment: string;
  departments: Department[];
  machines: Machine[];
  monthlyPlans: MonthlyPlan[];
  weeklyPlans: WeeklyPlan[];
  handovers: DepartmentHandover[];
  onOpenMachineDetail?: (machine: Machine) => void;
  onNavigateToWork?: () => void;
}

export const PlannedUpcomingWorkView: React.FC<PlannedUpcomingWorkViewProps> = ({
  currentDepartment,
  departments,
  machines,
  monthlyPlans,
  weeklyPlans,
  handovers,
  onOpenMachineDetail,
  onNavigateToWork,
}) => {
  const { userProfile } = useAuth();
  const isAdmin = userProfile?.role === 'ADMIN';
  const isPlanningDept = isDepartmentMatch(currentDepartment, '02 Planning') || userProfile?.role === 'PLANNING';
  const isPlanningOrAdmin = isPlanningDept || isAdmin;

  const [periodFilter, setPeriodFilter] = useState<'all' | 'monthly' | 'weekly'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'in_dept' | 'awaiting_handover' | 'planned_upcoming' | 'transferred'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Multi-selection for Planning Handover
  const [selectedCmmNos, setSelectedCmmNos] = useState<string[]>([]);
  const [showHandoverModal, setShowHandoverModal] = useState(false);
  const [handoverTargetItems, setHandoverTargetItems] = useState<any[]>([]);
  const [hoReceivingDept, setHoReceivingDept] = useState(PRODUCTION_DEPARTMENTS.find(d => !isDepartmentMatch(d.name, currentDepartment))?.name || '06-A Metal Shop');
  const [hoOperation, setHoOperation] = useState('Monthly Plan Initial Production Release');
  const [hoPriority, setHoPriority] = useState<'Low' | 'Medium' | 'High' | 'Critical'>('Medium');
  const [hoRemarks, setHoRemarks] = useState('');
  const [submittingHandover, setSubmittingHandover] = useState(false);
  const [handoverSuccessMessage, setHandoverSuccessMessage] = useState<string | null>(null);
  const [handoverErrorMessage, setHandoverErrorMessage] = useState<string | null>(null);

  // 1. Gather all plan items from monthly & weekly plans with SR.NO / priority
  const combinedPlannedItems = useMemo(() => {
    // Map of machines by normalized machine number & bare number
    const machineMap = new Map<string, Machine>();
    machines.forEach((m) => {
      const norm = normalizeMachineNumber(m.machineNumber).toUpperCase();
      if (norm) {
        machineMap.set(norm, m);
        const bare = norm.replace(/^(MACH|CMM)[-_ ]*/i, '');
        if (bare && bare !== norm) {
          machineMap.set(bare, m);
        }
      }
    });

    const items: Array<{
      id: string;
      sourceType: 'monthly' | 'weekly';
      priority: number;
      srNo: number;
      cmmNo: string;
      cmmSize: string;
      qty: number;
      planPeriod: string;
      planTitle?: string;
      planStatus?: string;
      batchId?: string;
      matchedMachine?: Machine;
      permission: ReturnType<typeof checkDepartmentWorkPermission>;
    }> = [];

    // Monthly plans
    monthlyPlans.forEach((mp) => {
      const cmmNo = (mp.machineNumber || '').trim();
      if (!cmmNo) return;
      const matchedMachine =
        machineMap.get(normalizeMachineNumber(cmmNo).toUpperCase()) ||
        machineMap.get(normalizeMachineNumber(cmmNo).replace(/^(MACH|CMM)[-_ ]*/i, '').toUpperCase()) ||
        machines.find((m) => areMachineNumbersEqual(m.machineNumber, cmmNo));
      const priority = Number(mp.priorityNumber || mp.sequenceOrder || mp.planOrder || 999);
      const perm = checkDepartmentWorkPermission(cmmNo, currentDepartment, machines, handovers);

      const planSize = getMachineDisplaySize(mp as any) !== 'Size not available'
        ? getMachineDisplaySize(mp as any)
        : (matchedMachine && getMachineDisplaySize(matchedMachine) !== 'Size not available'
            ? getMachineDisplaySize(matchedMachine)
            : (mp.machineSize || mp.machineModel || matchedMachine?.model || 'Standard'));

      items.push({
        id: `m-${mp.id}`,
        sourceType: 'monthly',
        priority,
        srNo: priority,
        cmmNo,
        cmmSize: planSize,
        qty: Number(mp.plannedQuantity) || 1,
        planPeriod: `${mp.month} ${mp.year}`,
        planTitle: mp.planTitle,
        planStatus: mp.status,
        batchId: mp.importBatchId,
        matchedMachine,
        permission: perm,
      });
    });

    // Weekly plans
    weeklyPlans.forEach((wp) => {
      const cmmNo = (wp.machineNumber || '').trim();
      if (!cmmNo) return;
      const matchedMachine =
        machineMap.get(normalizeMachineNumber(cmmNo).toUpperCase()) ||
        machineMap.get(normalizeMachineNumber(cmmNo).replace(/^(MACH|CMM)[-_ ]*/i, '').toUpperCase()) ||
        machines.find((m) => areMachineNumbersEqual(m.machineNumber, cmmNo));
      const priority = Number(wp.priorityNumber || wp.sequenceOrder || wp.planOrder || 999);
      const perm = checkDepartmentWorkPermission(cmmNo, currentDepartment, machines, handovers);

      const planSize = getMachineDisplaySize(wp as any) !== 'Size not available'
        ? getMachineDisplaySize(wp as any)
        : (matchedMachine && getMachineDisplaySize(matchedMachine) !== 'Size not available'
            ? getMachineDisplaySize(matchedMachine)
            : (wp.machineSize || wp.machineModel || matchedMachine?.model || 'Standard'));

      items.push({
        id: `w-${wp.id}`,
        sourceType: 'weekly',
        priority,
        srNo: priority,
        cmmNo,
        cmmSize: planSize,
        qty: Number(wp.plannedQuantity) || 1,
        planPeriod: `W${wp.weekNumber || ''} (${wp.startDate || ''} to ${wp.endDate || ''})`,
        planTitle: wp.planTitle,
        planStatus: wp.status,
        batchId: wp.importBatchId,
        matchedMachine,
        permission: perm,
      });
    });

    // Sort by priority ascending (SR.NO. order preserved from Excel import)
    return items.sort((a, b) => a.priority - b.priority);
  }, [machines, monthlyPlans, weeklyPlans, handovers, currentDepartment]);

  // Open Handover for single item
  const handleOpenHandoverForSingle = (item: any) => {
    setHandoverTargetItems([item]);
    setHoRemarks('');
    setHoOperation(`Production release for Machine #${item.cmmNo}`);
    setHandoverSuccessMessage(null);
    setHandoverErrorMessage(null);
    setShowHandoverModal(true);
  };

  // Open Handover for multiple selected items
  const handleOpenHandoverForSelected = () => {
    const items = combinedPlannedItems.filter((i) => selectedCmmNos.includes(i.cmmNo));
    if (items.length === 0) return;
    setHandoverTargetItems(items);
    setHoRemarks('');
    setHoOperation(`Batch production release for ${items.length} machines`);
    setHandoverSuccessMessage(null);
    setHandoverErrorMessage(null);
    setShowHandoverModal(true);
  };

  const toggleSelectAll = () => {
    if (selectedCmmNos.length === filteredItems.length) {
      setSelectedCmmNos([]);
    } else {
      setSelectedCmmNos(filteredItems.map((i) => i.cmmNo));
    }
  };

  const toggleSelectOne = (cmmNo: string) => {
    setSelectedCmmNos((prev) =>
      prev.includes(cmmNo) ? prev.filter((c) => c !== cmmNo) : [...prev, cmmNo]
    );
  };

  // Submit Handover to receiving department
  const handleSubmitPlanningHandover = async (e: React.FormEvent) => {
    e.preventDefault();
    if (handoverTargetItems.length === 0) return;
    if (!hoReceivingDept) {
      setHandoverErrorMessage('Receiving Department is required.');
      return;
    }

    setSubmittingHandover(true);
    setHandoverErrorMessage(null);

    try {
      for (const item of handoverTargetItems) {
        await createHandover(
          {
            machineNumber: item.cmmNo,
            machineModel: item.cmmSize,
            machineSize: item.cmmSize,
            modelSize: item.cmmSize,
            quantity: item.qty || 1,
            fromDepartment: currentDepartment || '02 Planning',
            toDepartment: hoReceivingDept,
            operation: hoOperation || `Production release from Monthly Plan (${item.planPeriod})`,
            priority: hoPriority,
            remarks: hoRemarks || `Released by Planning from monthly plan sequence #${item.priority}`,
          },
          userProfile?.email
        );
      }

      setHandoverSuccessMessage(
        `Successfully dispatched handover for ${handoverTargetItems.length} machine(s) to ${hoReceivingDept}. Status: Awaiting Acceptance.`
      );
      setSelectedCmmNos([]);
      setTimeout(() => {
        setShowHandoverModal(false);
        setHandoverSuccessMessage(null);
      }, 1500);
    } catch (err: any) {
      console.error('Planning handover failed:', err);
      setHandoverErrorMessage(err.message || 'Failed to dispatch handover. Please try again.');
    } finally {
      setSubmittingHandover(false);
    }
  };

  // 2. Filtered planned items
  const filteredItems = useMemo(() => {
    return combinedPlannedItems.filter((item) => {
      if (periodFilter === 'monthly' && item.sourceType !== 'monthly') return false;
      if (periodFilter === 'weekly' && item.sourceType !== 'weekly') return false;

      if (statusFilter === 'in_dept' && item.permission.status !== 'ACCEPTED_ACTIVE') return false;
      if (statusFilter === 'awaiting_handover' && item.permission.status !== 'HANDOVER_AWAITING_ACCEPTANCE') return false;
      if (statusFilter === 'planned_upcoming' && item.permission.status !== 'PENDING_HANDOVER') return false;
      if (statusFilter === 'transferred' && item.permission.status !== 'TRANSFERRED_OUT') return false;

      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const matchCmm = item.cmmNo.toLowerCase().includes(q);
        const matchSize = item.cmmSize.toLowerCase().includes(q);
        const matchPeriod = item.planPeriod.toLowerCase().includes(q);
        const matchDept = (item.matchedMachine?.currentDepartment || '').toLowerCase().includes(q);
        return matchCmm || matchSize || matchPeriod || matchDept;
      }

      return true;
    });
  }, [combinedPlannedItems, periodFilter, statusFilter, searchQuery]);

  // Counts for KPI tabs
  const activeCount = combinedPlannedItems.filter((i) => i.permission.status === 'ACCEPTED_ACTIVE').length;
  const awaitingCount = combinedPlannedItems.filter((i) => i.permission.status === 'HANDOVER_AWAITING_ACCEPTANCE').length;
  const upcomingCount = combinedPlannedItems.filter((i) => i.permission.status === 'PENDING_HANDOVER').length;
  const transferredCount = combinedPlannedItems.filter((i) => i.permission.status === 'TRANSFERRED_OUT').length;

  // Design Department boundary guard (placed after all hooks so hook order and count are invariant)
  if (isDepartmentMatch(currentDepartment, '01 Design')) {
    return (
      <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-sm text-center max-w-xl mx-auto my-8 animate-in fade-in">
        <div className="w-12 h-12 bg-amber-100 text-amber-700 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <ShieldAlert className="w-6 h-6" />
        </div>
        <h3 className="text-base font-black text-slate-900">Design Department Boundary</h3>
        <p className="text-xs text-slate-500 mt-2 leading-relaxed">
          The monthly manufacturing plan represents the central shop floor production schedule and is routed to manufacturing departments. The Design department does not receive the monthly production plan.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Top Banner / Explanation */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 rounded-3xl p-6 text-white shadow-xl border border-indigo-900/30">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-1.5 bg-indigo-500/30 text-indigo-300 rounded-lg border border-indigo-400/30">
                <Layers className="w-5 h-5" />
              </span>
              <span className="text-xs font-bold uppercase tracking-wider text-indigo-300">
                Company-Wide Manufacturing Plan
              </span>
            </div>
            <h2 className="text-xl font-black tracking-tight mt-1">
              Planned Machines / Upcoming Work &mdash; {currentDepartment}
            </h2>
            <p className="text-xs text-slate-300 mt-1 max-w-2xl leading-relaxed">
              Target machines planned by Admin via Excel in strict priority order (SR.NO).
              Departments can inspect upcoming pipeline workload anytime; work updates and completion
              checklists become available only when a machine is physically handed over and accepted.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="px-3.5 py-2 rounded-xl bg-white/10 backdrop-blur-xs border border-white/10 text-center">
              <span className="block text-[10px] text-slate-300 font-bold uppercase">Total Planned</span>
              <span className="text-lg font-black text-white">{combinedPlannedItems.length}</span>
            </div>
            <div className="px-3.5 py-2 rounded-xl bg-emerald-500/20 border border-emerald-400/30 text-center">
              <span className="block text-[10px] text-emerald-200 font-bold uppercase">Ready in Dept</span>
              <span className="text-lg font-black text-emerald-300">{activeCount}</span>
            </div>
            <div className="px-3.5 py-2 rounded-xl bg-amber-500/20 border border-amber-400/30 text-center">
              <span className="block text-[10px] text-amber-200 font-bold uppercase">Awaiting Handover</span>
              <span className="text-lg font-black text-amber-300">{awaitingCount}</span>
            </div>
          </div>
        </div>

        {/* Access Control Notice */}
        <div className="mt-4 pt-4 border-t border-white/10 flex flex-wrap items-center gap-3 text-xs text-slate-300">
          <div className="flex items-center gap-1.5 font-semibold text-emerald-300">
            <Unlock className="w-4 h-4" />
            <span>Active Work: Full update &amp; completion rights</span>
          </div>
          <span className="text-slate-600">•</span>
          <div className="flex items-center gap-1.5 font-semibold text-amber-300">
            <Clock className="w-4 h-4" />
            <span>Awaiting Handover: Accept incoming machine to start</span>
          </div>
          <span className="text-slate-600">•</span>
          <div className="flex items-center gap-1.5 font-semibold text-blue-300">
            <Lock className="w-4 h-4" />
            <span>Upcoming in Route: View-only preview of expected pipeline</span>
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {/* Status Quick Filter Buttons */}
          <button
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
              statusFilter === 'all'
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            All Workload ({combinedPlannedItems.length})
          </button>
          <button
            onClick={() => setStatusFilter('in_dept')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
              statusFilter === 'in_dept'
                ? 'bg-emerald-600 text-white'
                : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-200'
            }`}
          >
            <Unlock className="w-3.5 h-3.5" />
            Active in Department ({activeCount})
          </button>
          <button
            onClick={() => setStatusFilter('awaiting_handover')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
              statusFilter === 'awaiting_handover'
                ? 'bg-amber-600 text-white'
                : 'bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-200'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            Awaiting Handover ({awaitingCount})
          </button>
          <button
            onClick={() => setStatusFilter('planned_upcoming')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
              statusFilter === 'planned_upcoming'
                ? 'bg-blue-600 text-white'
                : 'bg-blue-50 text-blue-800 hover:bg-blue-100 border border-blue-200'
            }`}
          >
            <Lock className="w-3.5 h-3.5" />
            Upcoming Work ({upcomingCount})
          </button>
        </div>

        <div className="flex items-center gap-2">
          {/* Period selector */}
          <select
            value={periodFilter}
            onChange={(e) => setPeriodFilter(e.target.value as any)}
            className="text-xs font-semibold bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
          >
            <option value="all">All Plan Periods</option>
            <option value="monthly">Monthly Plan Only</option>
            <option value="weekly">Weekly Plan Only</option>
          </select>

          {/* Search box */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search CMM No, Size..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="text-xs pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl w-44 sm:w-56 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>
      </div>

      {/* Bulk Action Bar for Planning */}
      {isPlanningOrAdmin && selectedCmmNos.length > 0 && (
        <div className="bg-blue-900 text-white p-3.5 rounded-2xl flex items-center justify-between shadow-lg animate-in slide-in-from-top-2">
          <div className="flex items-center space-x-2 text-xs font-bold">
            <span className="w-6 h-6 rounded-full bg-blue-700 flex items-center justify-center font-mono text-[11px]">
              {selectedCmmNos.length}
            </span>
            <span>Machine{selectedCmmNos.length > 1 ? 's' : ''} Selected for Production Handover</span>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setSelectedCmmNos([])}
              className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-bold transition"
            >
              Deselect All
            </button>
            <button
              onClick={handleOpenHandoverForSelected}
              className="px-4 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-black shadow-sm transition flex items-center space-x-1.5"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Release Selected Machines &rarr;</span>
            </button>
          </div>
        </div>
      )}

      {/* Required Table as per Specification:
          Priority | CMM No | CMM Size | Qty | Plan Period | Current Department | Work Status | Handover Status
      */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-700 font-black uppercase tracking-wider text-[11px]">
                {isPlanningOrAdmin && (
                  <th className="py-3.5 px-3 w-10 text-center">
                    <input
                      type="checkbox"
                      checked={filteredItems.length > 0 && selectedCmmNos.length === filteredItems.length}
                      onChange={toggleSelectAll}
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                      title="Select all"
                    />
                  </th>
                )}
                <th className="py-3.5 px-4 w-20 text-center">Priority</th>
                <th className="py-3.5 px-4">CMM No</th>
                <th className="py-3.5 px-4">CMM Size</th>
                <th className="py-3.5 px-4 text-center w-20">Qty</th>
                <th className="py-3.5 px-4">Plan Period</th>
                <th className="py-3.5 px-4">Current Department</th>
                <th className="py-3.5 px-4">Work Status</th>
                <th className="py-3.5 px-4">Handover Status</th>
                <th className="py-3.5 px-4 text-center w-36">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={isPlanningOrAdmin ? 10 : 9} className="py-12 text-center text-slate-400">
                    <div className="flex flex-col items-center justify-center space-y-2">
                      <Layers className="w-8 h-8 text-slate-300" />
                      <p className="font-semibold text-slate-600">No planned machines found matching filters.</p>
                      <p className="text-xs text-slate-400">
                        Admin has not uploaded a plan for this period or all planned machines are filtered out.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredItems.map((item) => {
                  const machine = item.matchedMachine;
                  const currentDeptName = machine?.currentDepartment || machine?.responsibleDepartment || '02 Planning';
                  const isCurrentInThisDept = isDepartmentMatch(currentDeptName, currentDepartment);
                  const perm = item.permission;
                  const isSelected = selectedCmmNos.includes(item.cmmNo);

                  return (
                    <tr
                      key={item.id}
                      className={`hover:bg-slate-50/80 transition group ${isSelected ? 'bg-blue-50/40' : ''}`}
                    >
                      {/* Checkbox for Planning release */}
                      {isPlanningOrAdmin && (
                        <td className="py-3.5 px-3 text-center">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelectOne(item.cmmNo)}
                            className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                          />
                        </td>
                      )}

                      {/* 1. Priority */}
                      <td className="py-3.5 px-4 text-center">
                        <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-700 font-black text-xs">
                          {item.priority}
                        </span>
                      </td>

                      {/* 2. CMM No */}
                      <td className="py-3.5 px-4 font-mono font-black text-slate-900">
                        <div className="flex items-center gap-2">
                          <span>{item.cmmNo}</span>
                          {!machine && (
                            <span
                              className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200"
                              title="Machine record not yet created in Machine Master"
                            >
                              Unresolved
                            </span>
                          )}
                        </div>
                      </td>

                      {/* 3. CMM Size */}
                      <td className="py-3.5 px-4 font-bold text-slate-700">
                        {item.cmmSize}
                      </td>

                      {/* 4. Qty */}
                      <td className="py-3.5 px-4 text-center font-bold text-slate-800">
                        {item.qty}
                      </td>

                      {/* 5. Plan Period */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-1.5 text-slate-700 font-semibold">
                          {item.sourceType === 'monthly' ? (
                            <Calendar className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                          ) : (
                            <Clock className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                          )}
                          <span>{item.planPeriod}</span>
                        </div>
                        {item.planTitle && (
                          <div className="text-[10px] text-slate-400 truncate max-w-xs">{item.planTitle}</div>
                        )}
                      </td>

                      {/* 6. Current Department */}
                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold border ${
                            isCurrentInThisDept
                              ? 'bg-blue-50 text-blue-800 border-blue-200'
                              : 'bg-slate-100 text-slate-700 border-slate-200'
                          }`}
                        >
                          <Building className="w-3 h-3 shrink-0" />
                          <span className="truncate max-w-[140px]">{currentDeptName}</span>
                        </span>
                      </td>

                      {/* 7. Work Status */}
                      <td className="py-3.5 px-4">
                        <div className="space-y-1">
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold border ${
                              perm.badgeColor
                            }`}
                          >
                            {perm.canUpdateWork ? (
                              <Unlock className="w-3 h-3 shrink-0" />
                            ) : (
                              <Lock className="w-3 h-3 shrink-0" />
                            )}
                            <span>{perm.badgeLabel}</span>
                          </span>
                          {machine && (
                            <div className="text-[10px] text-slate-400">
                              Master status: <span className="font-semibold text-slate-600">{machine.status}</span>
                            </div>
                          )}
                        </div>
                      </td>

                      {/* 8. Handover Status */}
                      <td className="py-3.5 px-4">
                        {perm.status === 'ACCEPTED_ACTIVE' ? (
                          <span className="inline-flex items-center gap-1 text-emerald-700 font-bold">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                            <span>Accepted &amp; In Progress</span>
                          </span>
                        ) : perm.status === 'HANDOVER_AWAITING_ACCEPTANCE' ? (
                          <span className="inline-flex items-center gap-1 text-amber-700 font-bold animate-pulse">
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                            <span>Handover Issued &mdash; Awaiting Acceptance</span>
                          </span>
                        ) : perm.status === 'TRANSFERRED_OUT' ? (
                          <span className="inline-flex items-center gap-1 text-slate-500 font-semibold">
                            <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                            <span>Handed over to next dept</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-slate-400 font-medium">
                            <Lock className="w-3 h-3 text-slate-300" />
                            <span>Waiting for previous dept</span>
                          </span>
                        )}
                      </td>

                      {/* 9. Action */}
                      <td className="py-3.5 px-4 text-center">
                        <div className="flex items-center justify-center gap-1.5 flex-wrap">
                          {machine && onOpenMachineDetail && (
                            <button
                              onClick={() => onOpenMachineDetail(machine)}
                              className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 transition"
                              title="View Machine Master Details"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                          )}
                          {isPlanningOrAdmin && perm.status !== 'ACCEPTED_ACTIVE' && (
                            <button
                              type="button"
                              onClick={() => handleOpenHandoverForSingle(item)}
                              className="px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-[11px] shadow-xs transition flex items-center gap-1 cursor-pointer"
                              title="Dispatch Handover to Next Department"
                            >
                              <ArrowRightLeft className="w-3 h-3" />
                              <span>Release</span>
                            </button>
                          )}
                          {perm.canUpdateWork && onNavigateToWork && (
                            <button
                              onClick={onNavigateToWork}
                              className="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[11px] shadow-xs transition"
                              title="Update Work for this Machine"
                            >
                              Update
                            </button>
                          )}
                          {!perm.canUpdateWork && !isPlanningOrAdmin && (
                            <span
                              className="text-[10px] text-slate-400 font-medium italic"
                              title={perm.message}
                            >
                              View-Only
                            </span>
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

      {/* PLANNING HANDOVER RELEASE MODAL */}
      {showHandoverModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-xl my-6 overflow-hidden">
            <div className="bg-gradient-to-r from-slate-900 via-blue-950 to-indigo-900 text-white p-5 flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="p-2.5 bg-blue-500/20 rounded-xl border border-blue-400/30">
                  <ArrowRightLeft className="w-5 h-5 text-blue-300" />
                </div>
                <div>
                  <h3 className="text-base font-black">Planning Manufacturing Handover</h3>
                  <p className="text-xs text-blue-200">
                    Release machine from monthly plan to production floor
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowHandoverModal(false)}
                className="p-1.5 text-slate-400 hover:text-white rounded-xl hover:bg-white/10 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitPlanningHandover} className="p-6 space-y-4">
              {handoverSuccessMessage && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-semibold flex items-center space-x-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>{handoverSuccessMessage}</span>
                </div>
              )}

              {handoverErrorMessage && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs font-semibold flex items-center space-x-2">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{handoverErrorMessage}</span>
                </div>
              )}

              {/* Machine Summary Box */}
              <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 space-y-2">
                <div className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                  Selected Machine{handoverTargetItems.length > 1 ? 's' : ''} ({handoverTargetItems.length})
                </div>
                <div className="max-h-32 overflow-y-auto divide-y divide-slate-200 text-xs">
                  {handoverTargetItems.map((item) => (
                    <div key={item.id} className="py-1.5 flex items-center justify-between">
                      <div>
                        <span className="font-mono font-black text-slate-900">Machine #{item.cmmNo}</span>
                        <span className="text-slate-500 ml-2 font-semibold">({item.cmmSize})</span>
                      </div>
                      <div className="text-[11px] font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded">
                        Qty: {item.qty} &bull; Priority {item.priority}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Sending Department */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Releasing Department
                </label>
                <input
                  type="text"
                  disabled
                  value={currentDepartment || '02 Planning'}
                  className="w-full text-xs font-bold bg-slate-100 border border-slate-200 rounded-xl px-3 py-2 text-slate-700"
                />
              </div>

              {/* Receiving Department (From configured manufacturing route) */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Receiving Production Department <span className="text-rose-500">*</span>
                </label>
                <select
                  required
                  value={hoReceivingDept}
                  onChange={(e) => setHoReceivingDept(e.target.value)}
                  className="w-full text-xs font-bold bg-white border border-slate-300 rounded-xl px-3 py-2 text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                >
                  {PRODUCTION_DEPARTMENTS.filter(d => !isDepartmentMatch(d.name, currentDepartment)).map((d) => (
                    <option key={d.code} value={d.name}>
                      {d.name}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-slate-500 mt-1">
                  Machine will appear in this department's <strong>Incoming Machines</strong> list and await formal acceptance.
                </p>
              </div>

              {/* Operation / Work Description */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Operation / Initial Work Description <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={hoOperation}
                  onChange={(e) => setHoOperation(e.target.value)}
                  placeholder="e.g. Fabrication and baseline machining"
                  className="w-full text-xs bg-white border border-slate-300 rounded-xl px-3 py-2 text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Priority */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Handover Priority
                </label>
                <select
                  value={hoPriority}
                  onChange={(e) => setHoPriority(e.target.value as any)}
                  className="w-full text-xs font-bold bg-white border border-slate-300 rounded-xl px-3 py-2 text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                >
                  <option value="Low">Low</option>
                  <option value="Medium">Medium</option>
                  <option value="High">High</option>
                  <option value="Critical">Critical</option>
                </select>
              </div>

              {/* Remarks */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Planning Remarks / Special Instructions
                </label>
                <textarea
                  rows={2}
                  value={hoRemarks}
                  onChange={(e) => setHoRemarks(e.target.value)}
                  placeholder="Enter remarks, dispatch notes or drawing reference..."
                  className="w-full text-xs bg-white border border-slate-300 rounded-xl px-3 py-2 text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Submit Buttons */}
              <div className="pt-3 border-t border-slate-200 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setShowHandoverModal(false)}
                  disabled={submittingHandover}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingHandover}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-black shadow-md transition flex items-center space-x-1.5 disabled:opacity-50"
                >
                  {submittingHandover ? (
                    <span>Dispatching...</span>
                  ) : (
                    <>
                      <Send className="w-3.5 h-3.5" />
                      <span>Submit Handover to {hoReceivingDept.split(' ')[1] || hoReceivingDept} &rarr;</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
