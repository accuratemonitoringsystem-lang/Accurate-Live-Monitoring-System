import React, { useState, useMemo } from 'react';
import {
  Calendar,
  Layers,
  Upload,
  Plus,
  Download,
  Filter,
  Search,
  CheckCircle2,
  Clock,
  AlertCircle,
  TrendingUp,
  Building,
  Edit2,
  Trash2,
  X,
  RotateCcw,
  RefreshCw,
  Eye,
  FileSpreadsheet,
  AlertTriangle,
  ChevronDown,
  Info,
} from 'lucide-react';
import { MonthlyPlan, Department } from '../../types';
import {
  MONTHLY_PLAN_GROUP_1_DEPTS,
  MONTHLY_PLAN_GROUP_2_DEPTS,
  ALL_MONTHLY_PLAN_DEPTS,
  MonthlyPlanDeptDef,
} from '../../constants';
import {
  downloadMonthlyPlanTemplate,
  downloadConsolidatedMonthlyPlanTemplate,
  exportMonthlyPlanToExcel,
  addSingleMonthlyPlan,
  updateMonthlyPlanRecord,
  deleteMonthlyPlanRecord,
  deleteDepartmentMonthlyPlan,
  updateMonthlyPlanStatus,
} from '../../services/monthlyPlanService';
import { MonthlyPlanExcelUploadModal } from './MonthlyPlanExcelUploadModal';
import { useAuth } from '../../context/AuthContext';

interface AdminMonthlyPlanManagementViewProps {
  monthlyPlans: MonthlyPlan[];
  departments: Department[];
  onOpenQuickUpdate?: () => void;
}

export const AdminMonthlyPlanManagementView: React.FC<AdminMonthlyPlanManagementViewProps> = ({
  monthlyPlans,
  departments,
}) => {
  const { userProfile } = useAuth();

  // Filters State
  const [filterFinancialYear, setFilterFinancialYear] = useState('2026-2027');
  const [filterYear, setFilterYear] = useState('2026');
  const [filterMonth, setFilterMonth] = useState('October');
  const [activeGroupTab, setActiveGroupTab] = useState<'ALL' | 'GROUP_1' | 'GROUP_2'>('GROUP_1');
  const [filterDepartment, setFilterDepartment] = useState('All Departments');
  const [filterPriority, setFilterPriority] = useState('All Priorities');
  const [filterStatus, setFilterStatus] = useState('All Statuses');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showAddManualModal, setShowAddManualModal] = useState(false);
  const [editingPlan, setEditingPlan] = useState<MonthlyPlan | null>(null);
  const [deletingPlan, setDeletingPlan] = useState<MonthlyPlan | null>(null);
  const [confirmDeleteDept, setConfirmDeleteDept] = useState<{
    deptName: string;
    month: string;
    year: string;
    count: number;
  } | null>(null);

  // Manual Add Form State
  const [manualForm, setManualForm] = useState({
    department: '02 Planning',
    machineNumber: '',
    machineSize: '',
    priority: 'Medium' as 'High' | 'Medium' | 'Low' | 'Urgent',
    quantity: 1,
    status: 'Planned' as 'Planned' | 'In Progress' | 'Completed' | 'On Hold',
  });
  const [savingManual, setSavingManual] = useState(false);
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // 1. Scoped Plans based on Month & Year filters
  const monthYearFilteredPlans = useMemo(() => {
    return monthlyPlans.filter((p) => {
      const pMonth = (p.month || '').trim().toLowerCase();
      const pYear = (p.year || p.calendarYear || '').trim();
      const matchMonth = !filterMonth || pMonth === filterMonth.toLowerCase();
      const matchYear = !filterYear || pYear === filterYear;
      return matchMonth && matchYear;
    });
  }, [monthlyPlans, filterMonth, filterYear]);

  // 2. Further filtered plans by Group, Dept, Priority, Status, Search
  const displayPlans = useMemo(() => {
    return monthYearFilteredPlans.filter((p) => {
      // Group filter
      if (activeGroupTab === 'GROUP_1') {
        const inG1 = MONTHLY_PLAN_GROUP_1_DEPTS.some(
          (d) => d.code === p.departmentCode || d.name === p.department || (p.departmentGroup === 'GROUP_1')
        );
        if (!inG1) return false;
      } else if (activeGroupTab === 'GROUP_2') {
        const inG2 = MONTHLY_PLAN_GROUP_2_DEPTS.some(
          (d) => d.code === p.departmentCode || d.name === p.department || (p.departmentGroup === 'GROUP_2')
        );
        if (!inG2) return false;
      }

      // Department filter
      if (filterDepartment !== 'All Departments') {
        if (p.department !== filterDepartment && p.departmentCode !== filterDepartment) {
          return false;
        }
      }

      // Priority filter
      if (filterPriority !== 'All Priorities' && p.priority !== filterPriority) {
        return false;
      }

      // Status filter
      if (filterStatus !== 'All Statuses' && p.status !== filterStatus) {
        return false;
      }

      // Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const machMatch = (p.machineNumber || '').toLowerCase().includes(q);
        const sizeMatch = (p.machineSize || p.machineModel || '').toLowerCase().includes(q);
        const deptMatch = (p.department || '').toLowerCase().includes(q);
        if (!machMatch && !sizeMatch && !deptMatch) return false;
      }

      return true;
    });
  }, [monthYearFilteredPlans, activeGroupTab, filterDepartment, filterPriority, filterStatus, searchQuery]);

  // 3. Consolidated Statistics
  const stats = useMemo(() => {
    const totalDepts = ALL_MONTHLY_PLAN_DEPTS.length; // 20 standard departments
    const activeDeptCodesWithPlans = new Set<string>();

    let totalMachineEntries = 0;
    let totalPlannedQuantity = 0;
    let group1Entries = 0;
    let group1Qty = 0;
    let group2Entries = 0;
    let group2Qty = 0;

    const priorityCounts: Record<string, number> = {
      Urgent: 0,
      High: 0,
      Medium: 0,
      Low: 0,
    };

    const statusCounts: Record<string, number> = {
      Planned: 0,
      'In Progress': 0,
      Completed: 0,
      'On Hold': 0,
    };

    monthYearFilteredPlans.forEach((p) => {
      totalMachineEntries += 1;
      const q = Number(p.quantity || p.plannedQuantity || 1);
      totalPlannedQuantity += q;

      // Group classification
      const isG1 = MONTHLY_PLAN_GROUP_1_DEPTS.some(
        (d) => d.code === p.departmentCode || d.name === p.department || p.departmentGroup === 'GROUP_1'
      );
      if (isG1) {
        group1Entries += 1;
        group1Qty += q;
      } else {
        group2Entries += 1;
        group2Qty += q;
      }

      if (p.departmentCode) {
        activeDeptCodesWithPlans.add(p.departmentCode);
      } else if (p.department) {
        activeDeptCodesWithPlans.add(p.department);
      }

      const prio = p.priority || 'Medium';
      priorityCounts[prio] = (priorityCounts[prio] || 0) + 1;

      const st = p.status || 'Planned';
      statusCounts[st] = (statusCounts[st] || 0) + 1;
    });

    const deptsWithPlansCount = activeDeptCodesWithPlans.size;
    const deptsWithoutPlansCount = Math.max(0, totalDepts - deptsWithPlansCount);

    return {
      totalDepts,
      deptsWithPlansCount,
      deptsWithoutPlansCount,
      totalMachineEntries,
      totalPlannedQuantity,
      group1Entries,
      group1Qty,
      group2Entries,
      group2Qty,
      priorityCounts,
      statusCounts,
    };
  }, [monthYearFilteredPlans]);

  // Department-wise breakdown for the active group
  const activeGroupDeptDefs =
    activeGroupTab === 'GROUP_1'
      ? MONTHLY_PLAN_GROUP_1_DEPTS
      : activeGroupTab === 'GROUP_2'
      ? MONTHLY_PLAN_GROUP_2_DEPTS
      : ALL_MONTHLY_PLAN_DEPTS;

  const deptSummaries = useMemo(() => {
    return activeGroupDeptDefs.map((def) => {
      const records = monthYearFilteredPlans.filter(
        (p) => p.departmentCode === def.code || p.department === def.name
      );
      const machineCount = records.length;
      const totalQty = records.reduce((sum, p) => sum + Number(p.quantity || p.plannedQuantity || 1), 0);
      const completedCount = records.filter((p) => p.status === 'Completed').length;
      const inProgressCount = records.filter((p) => p.status === 'In Progress').length;
      const onHoldCount = records.filter((p) => p.status === 'On Hold').length;

      return {
        def,
        records,
        machineCount,
        totalQty,
        completedCount,
        inProgressCount,
        onHoldCount,
        hasPlan: machineCount > 0,
      };
    });
  }, [activeGroupDeptDefs, monthYearFilteredPlans]);

  // Handler: Submit Manual Plan
  const handleSaveManualPlan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualForm.machineNumber.trim() || !manualForm.machineSize.trim()) {
      setActionMessage({ type: 'error', text: 'Machine Number and Machine Size are required.' });
      return;
    }

    setSavingManual(true);
    setActionMessage(null);
    try {
      await addSingleMonthlyPlan(
        {
          month: filterMonth,
          year: filterYear,
          financialYear: filterFinancialYear,
          department: manualForm.department,
          machineNumber: manualForm.machineNumber.trim(),
          machineSize: manualForm.machineSize.trim(),
          priority: manualForm.priority,
          quantity: Number(manualForm.quantity) || 1,
          plannedQuantity: Number(manualForm.quantity) || 1,
          status: manualForm.status,
        },
        userProfile?.email || userProfile?.username || 'Admin'
      );

      setActionMessage({ type: 'success', text: `Machine ${manualForm.machineNumber} added successfully to ${manualForm.department}.` });
      setManualForm({
        department: manualForm.department,
        machineNumber: '',
        machineSize: '',
        priority: 'Medium',
        quantity: 1,
        status: 'Planned',
      });
      setShowAddManualModal(false);
    } catch (err: any) {
      console.error(err);
      setActionMessage({ type: 'error', text: err?.message || 'Failed to save machine plan.' });
    } finally {
      setSavingManual(false);
    }
  };

  // Handler: Update Existing Plan
  const handleUpdatePlan = async () => {
    if (!editingPlan) return;
    try {
      await updateMonthlyPlanRecord(
        editingPlan.id,
        {
          machineNumber: editingPlan.machineNumber,
          machineSize: editingPlan.machineSize,
          priority: editingPlan.priority,
          quantity: Number(editingPlan.quantity) || 1,
          plannedQuantity: Number(editingPlan.quantity) || 1,
          status: editingPlan.status,
          department: editingPlan.department,
        },
        userProfile?.email || userProfile?.username || 'Admin'
      );
      setEditingPlan(null);
      setActionMessage({ type: 'success', text: 'Plan record updated successfully.' });
    } catch (err: any) {
      setActionMessage({ type: 'error', text: err?.message || 'Failed to update plan record.' });
    }
  };

  // Handler: Delete Single Record
  const handleDeleteSingle = async () => {
    if (!deletingPlan) return;
    try {
      await deleteMonthlyPlanRecord(deletingPlan.id, userProfile?.email || userProfile?.username || 'Admin');
      setDeletingPlan(null);
      setActionMessage({ type: 'success', text: 'Record deleted from Monthly Plan.' });
    } catch (err: any) {
      setActionMessage({ type: 'error', text: err?.message || 'Failed to delete record.' });
    }
  };

  // Handler: Delete Whole Department Plan
  const handleExecuteDeleteDeptPlan = async () => {
    if (!confirmDeleteDept) return;
    try {
      const deleted = await deleteDepartmentMonthlyPlan(
        confirmDeleteDept.deptName,
        confirmDeleteDept.month,
        confirmDeleteDept.year,
        userProfile?.email || userProfile?.username || 'Admin'
      );
      setConfirmDeleteDept(null);
      setActionMessage({
        type: 'success',
        text: `Successfully deleted all ${deleted} records for ${confirmDeleteDept.deptName} (${confirmDeleteDept.month} ${confirmDeleteDept.year}).`,
      });
    } catch (err: any) {
      setActionMessage({ type: 'error', text: err?.message || 'Failed to delete department plan.' });
    }
  };

  return (
    <div className="space-y-6">
      {/* SECTION 1: HEADER & ACTION BUTTONS */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2 text-xs font-black uppercase tracking-wider text-blue-600">
            <Calendar className="w-4 h-4" />
            <span>ACCURATE GAUGING &bull; OFFICIAL MONTHLY PRODUCTION SYSTEM</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight mt-0.5">
            Monthly Plan Management Module
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Dedicated 4-Column Planning: <strong>Machine Number &bull; Machine Size &bull; Priority &bull; Quantity</strong> with automatic department linkage
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => downloadMonthlyPlanTemplate()}
            className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition flex items-center space-x-1.5 border border-slate-200 shadow-2xs"
            title="Download the official 4-column Excel template"
          >
            <Download className="w-3.5 h-3.5 text-slate-600" />
            <span>Download Template</span>
          </button>

          <button
            type="button"
            onClick={() => exportMonthlyPlanToExcel(displayPlans, `Monthly_Plan_${filterMonth}_${filterYear}`)}
            className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition flex items-center space-x-1.5 border border-slate-200 shadow-2xs"
            title="Export currently filtered plans to Excel"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
            <span>Export to Excel</span>
          </button>

          <button
            type="button"
            onClick={() => setShowAddManualModal(true)}
            className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold transition flex items-center space-x-1.5 shadow-xs"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>+ Add Machine</span>
          </button>

          <button
            type="button"
            onClick={() => setShowUploadModal(true)}
            className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition flex items-center space-x-1.5 shadow-sm"
          >
            <Upload className="w-4 h-4" />
            <span>Upload Plan Excel</span>
          </button>
        </div>
      </div>

      {/* FEEDBACK BANNER */}
      {actionMessage && (
        <div
          className={`p-3.5 rounded-xl border flex items-center justify-between text-xs font-bold ${
            actionMessage.type === 'success'
              ? 'bg-emerald-50 text-emerald-900 border-emerald-300'
              : 'bg-red-50 text-red-900 border-red-300'
          }`}
        >
          <div className="flex items-center space-x-2">
            {actionMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            )}
            <span>{actionMessage.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setActionMessage(null)}
            className="text-slate-400 hover:text-slate-700"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* SECTION 2: TOP SUMMARY CARDS (Actual Database Computed) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* Total Machines */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
            <Layers className="w-3.5 h-3.5 text-blue-600" />
            <span>Total Machines</span>
          </div>
          <div className="text-2xl font-black text-slate-900 mt-1 font-mono">
            {stats.totalMachineEntries}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">
            Planned entries in {filterMonth} {filterYear}
          </div>
        </div>

        {/* Total Planned Quantity */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <div className="text-[11px] font-bold text-indigo-600 uppercase tracking-wider flex items-center gap-1">
            <TrendingUp className="w-3.5 h-3.5" />
            <span>Planned Quantity</span>
          </div>
          <div className="text-2xl font-black text-indigo-600 mt-1 font-mono">
            {stats.totalPlannedQuantity}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">Physical Units Target</div>
        </div>

        {/* Group 1 Summary */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <div className="text-[11px] font-bold text-blue-700 uppercase tracking-wider flex items-center gap-1">
            <Building className="w-3.5 h-3.5" />
            <span>Group 1 Plan</span>
          </div>
          <div className="text-2xl font-black text-blue-700 mt-1 font-mono">
            {stats.group1Entries}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            {stats.group1Qty} units &bull; 02 to 11-A
          </div>
        </div>

        {/* Group 2 Summary */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <div className="text-[11px] font-bold text-purple-700 uppercase tracking-wider flex items-center gap-1">
            <Building className="w-3.5 h-3.5" />
            <span>Group 2 Plan</span>
          </div>
          <div className="text-2xl font-black text-purple-700 mt-1 font-mono">
            {stats.group2Entries}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            {stats.group2Qty} units &bull; 11-B to 16
          </div>
        </div>

        {/* Departments Covered */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <div className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Depts with Plans</span>
          </div>
          <div className="text-2xl font-black text-emerald-700 mt-1 font-mono">
            {stats.deptsWithPlansCount} / {stats.totalDepts}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">
            {stats.deptsWithoutPlansCount} departments pending
          </div>
        </div>

        {/* Priority Breakdown */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <div className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">
            Priority Breakdown
          </div>
          <div className="grid grid-cols-2 gap-1 text-[11px] mt-1 font-bold">
            <span className="text-red-700">Urgent: {stats.priorityCounts.Urgent || 0}</span>
            <span className="text-amber-700">High: {stats.priorityCounts.High || 0}</span>
            <span className="text-blue-700">Med: {stats.priorityCounts.Medium || 0}</span>
            <span className="text-slate-600">Low: {stats.priorityCounts.Low || 0}</span>
          </div>
        </div>
      </div>

      {/* SECTION 3: FILTER BAR */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs space-y-3">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {/* Financial Year */}
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
              Financial Year:
            </label>
            <select
              value={filterFinancialYear}
              onChange={(e) => setFilterFinancialYear(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-2.5 py-1.5 text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
            >
              <option value="2026-2027">FY 2026-2027</option>
              <option value="2025-2026">FY 2025-2026</option>
              <option value="2024-2025">FY 2024-2025</option>
            </select>
          </div>

          {/* Calendar Year */}
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
              Calendar Year:
            </label>
            <select
              value={filterYear}
              onChange={(e) => setFilterYear(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-2.5 py-1.5 text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
            >
              <option value="2026">2026</option>
              <option value="2025">2025</option>
              <option value="2027">2027</option>
            </select>
          </div>

          {/* Month */}
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
              Month:
            </label>
            <select
              value={filterMonth}
              onChange={(e) => setFilterMonth(e.target.value)}
              className="w-full bg-blue-50 border border-blue-300 rounded-xl px-2.5 py-1.5 text-xs font-black text-blue-900 outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
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

          {/* Department Filter */}
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
              Department:
            </label>
            <select
              value={filterDepartment}
              onChange={(e) => setFilterDepartment(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-2.5 py-1.5 text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
            >
              <option value="All Departments">All Departments</option>
              <optgroup label="GROUP 1 (02 to 11-A)">
                {MONTHLY_PLAN_GROUP_1_DEPTS.map((d) => (
                  <option key={d.code} value={d.name}>
                    {d.code} &bull; {d.label}
                  </option>
                ))}
              </optgroup>
              <optgroup label="GROUP 2 (11-B to 16)">
                {MONTHLY_PLAN_GROUP_2_DEPTS.map((d) => (
                  <option key={d.code} value={d.name}>
                    {d.code} &bull; {d.label}
                  </option>
                ))}
              </optgroup>
            </select>
          </div>

          {/* Priority Filter */}
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
              Priority:
            </label>
            <select
              value={filterPriority}
              onChange={(e) => setFilterPriority(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-2.5 py-1.5 text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
            >
              <option value="All Priorities">All Priorities</option>
              <option value="Urgent">Urgent</option>
              <option value="High">High</option>
              <option value="Medium">Medium</option>
              <option value="Low">Low</option>
            </select>
          </div>

          {/* Search */}
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
              Search:
            </label>
            <div className="relative">
              <input
                type="text"
                placeholder="Machine No / Size..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl pl-8 pr-3 py-1.5 text-xs font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-blue-500"
              />
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>
        </div>

        {/* GROUP 1 vs GROUP 2 TABS */}
        <div className="pt-2 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={() => setActiveGroupTab('GROUP_1')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center space-x-1.5 ${
                activeGroupTab === 'GROUP_1'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <Building className="w-3.5 h-3.5" />
              <span>GROUP 1 &mdash; Departments 02 to 11-A ({stats.group1Entries})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveGroupTab('GROUP_2')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center space-x-1.5 ${
                activeGroupTab === 'GROUP_2'
                  ? 'bg-purple-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <Building className="w-3.5 h-3.5" />
              <span>GROUP 2 &mdash; Departments 11-B to 16 ({stats.group2Entries})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveGroupTab('ALL')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center space-x-1.5 ${
                activeGroupTab === 'ALL'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <span>Consolidated View ({stats.totalMachineEntries})</span>
            </button>
          </div>

          <div className="text-xs font-semibold text-slate-500">
            Showing <strong>{displayPlans.length}</strong> of <strong>{monthYearFilteredPlans.length}</strong> plan records for {filterMonth} {filterYear}
          </div>
        </div>
      </div>

      {/* SECTION 4: DEPARTMENT CARDS FOR ACTIVE GROUP */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-600"></span>
              <span>
                {activeGroupTab === 'GROUP_1'
                  ? 'Group 1 Department Plans (02 Planning to 11-A Cable Set)'
                  : activeGroupTab === 'GROUP_2'
                  ? 'Group 2 Department Plans (11-B Tuning to 16 IT)'
                  : 'All Departments Monthly Plans'}
              </span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Click any department below to view or replace its specific monthly plan.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-2.5">
          {deptSummaries.map(({ def, machineCount, totalQty, hasPlan, records }) => (
            <div
              key={def.code}
              onClick={() => {
                setFilterDepartment(def.name);
              }}
              className={`p-3 rounded-xl border text-left cursor-pointer transition flex flex-col justify-between ${
                filterDepartment === def.name
                  ? 'bg-blue-50 border-blue-400 ring-2 ring-blue-300'
                  : hasPlan
                  ? 'bg-slate-50/80 hover:bg-white border-slate-200 hover:border-blue-300'
                  : 'bg-slate-50/40 border-dashed border-slate-200 hover:bg-slate-50'
              }`}
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[10px] font-black text-blue-600 bg-blue-100/60 px-1.5 py-0.5 rounded">
                    {def.code}
                  </span>
                  {hasPlan ? (
                    <span className="w-2 h-2 rounded-full bg-emerald-500" title="Plan loaded"></span>
                  ) : (
                    <span className="w-2 h-2 rounded-full bg-slate-300" title="No plan loaded"></span>
                  )}
                </div>
                <div className="text-xs font-bold text-slate-900 mt-1.5 line-clamp-1" title={def.label}>
                  {def.label}
                </div>
              </div>

              <div className="mt-2 pt-2 border-t border-slate-200/80 flex items-center justify-between">
                <div>
                  <span className="text-sm font-black text-slate-800 font-mono">{machineCount}</span>
                  <span className="text-[10px] text-slate-400 ml-1">mc</span>
                </div>
                <span className="text-[10px] font-bold text-indigo-600">{totalQty} qty</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* SECTION 5: PLAN RECORDS TABLE */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-black text-slate-900 flex items-center space-x-2">
              <Calendar className="w-5 h-5 text-blue-600" />
              <span>
                Monthly Plan Records &bull; {filterMonth} {filterYear} ({displayPlans.length} entries)
              </span>
            </h3>
            <p className="text-xs text-slate-500">
              Live database records in `monthly_plans`. Real-time synchronized across all authorized department dashboards.
            </p>
          </div>

          {filterDepartment !== 'All Departments' && (
            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={() => {
                  const targetRecords = monthYearFilteredPlans.filter((p) => p.department === filterDepartment);
                  setConfirmDeleteDept({
                    deptName: filterDepartment,
                    month: filterMonth,
                    year: filterYear,
                    count: targetRecords.length,
                  });
                }}
                className="px-3 py-1.5 rounded-xl bg-red-50 hover:bg-red-100 text-red-700 text-xs font-bold transition border border-red-200 flex items-center space-x-1"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Clear {filterDepartment} Plan</span>
              </button>
            </div>
          )}
        </div>

        {displayPlans.length === 0 ? (
          <div className="py-16 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200 space-y-3">
            <div className="w-12 h-12 mx-auto rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <FileSpreadsheet className="w-6 h-6" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-slate-800">
                No monthly plan records found for {filterMonth} {filterYear}
              </h4>
              <p className="text-xs text-slate-500 mt-1">
                Upload an Excel file with the 4 standard columns or add a machine plan manually.
              </p>
            </div>
            <div className="flex items-center justify-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => downloadMonthlyPlanTemplate()}
                className="px-3 py-1.5 rounded-xl bg-white hover:bg-slate-100 border border-slate-300 text-xs font-bold text-slate-700 transition"
              >
                Download Template
              </button>
              <button
                type="button"
                onClick={() => setShowUploadModal(true)}
                className="px-4 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-xs font-bold text-white transition shadow-xs"
              >
                Upload Excel Plan
              </button>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-2xs">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100 text-slate-700 font-bold uppercase text-[10px]">
                <tr>
                  <th className="p-3">#</th>
                  <th className="p-3">Department</th>
                  <th className="p-3">Machine Number</th>
                  <th className="p-3">Machine Size</th>
                  <th className="p-3 text-center">Priority</th>
                  <th className="p-3 text-center">Quantity</th>
                  <th className="p-3 text-center">Status</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {displayPlans.map((plan, idx) => (
                  <tr key={plan.id} className="hover:bg-slate-50/70 transition">
                    <td className="p-3 font-mono text-slate-400">{idx + 1}</td>
                    <td className="p-3 font-bold text-slate-900">
                      <span className="font-mono text-blue-600 mr-1.5">
                        {plan.departmentCode || plan.department.split(' ')[0]}
                      </span>
                      <span>{plan.department}</span>
                    </td>
                    <td className="p-3 font-mono font-black text-slate-900 text-sm">
                      {plan.machineNumber}
                    </td>
                    <td className="p-3 font-medium text-slate-700">
                      {plan.machineSize || plan.machineModel || '—'}
                    </td>
                    <td className="p-3 text-center">
                      <span
                        className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                          plan.priority === 'Urgent'
                            ? 'bg-red-100 text-red-800 border border-red-200'
                            : plan.priority === 'High'
                            ? 'bg-amber-100 text-amber-800 border border-amber-200'
                            : plan.priority === 'Low'
                            ? 'bg-slate-100 text-slate-700 border border-slate-200'
                            : 'bg-blue-100 text-blue-800 border border-blue-200'
                        }`}
                      >
                        {plan.priority || 'Medium'}
                      </span>
                    </td>
                    <td className="p-3 font-mono font-black text-center text-slate-900 text-sm">
                      {plan.quantity || plan.plannedQuantity || 1}
                    </td>
                    <td className="p-3 text-center">
                      <select
                        value={plan.status || 'Planned'}
                        onChange={(e) => {
                          const newStatus = e.target.value as any;
                          updateMonthlyPlanStatus(
                            plan.id,
                            newStatus,
                            userProfile?.email || userProfile?.username || 'Admin'
                          );
                        }}
                        className={`text-[11px] font-bold px-2.5 py-1 rounded-lg border outline-none cursor-pointer ${
                          plan.status === 'Completed'
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                            : plan.status === 'In Progress'
                            ? 'bg-blue-50 text-blue-800 border-blue-300'
                            : plan.status === 'On Hold'
                            ? 'bg-amber-50 text-amber-800 border-amber-300'
                            : 'bg-slate-50 text-slate-700 border-slate-300'
                        }`}
                      >
                        <option value="Planned">Planned</option>
                        <option value="In Progress">In Progress</option>
                        <option value="Completed">Completed</option>
                        <option value="On Hold">On Hold</option>
                      </select>
                    </td>
                    <td className="p-3 text-right">
                      <div className="flex items-center justify-end space-x-1.5">
                        <button
                          type="button"
                          onClick={() => setEditingPlan(plan)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition"
                          title="Edit Plan Entry"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeletingPlan(plan)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition"
                          title="Delete Record"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* MODAL: MANUAL ADD PLAN */}
      {showAddManualModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
            <div className="bg-slate-900 text-white px-5 py-4 flex items-center justify-between">
              <h3 className="text-sm font-black uppercase tracking-wider flex items-center gap-2">
                <Plus className="w-4 h-4 text-blue-400" />
                <span>Add Machine to Monthly Plan</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowAddManualModal(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveManualPlan} className="p-5 space-y-4">
              <div className="bg-blue-50/60 border border-blue-200 p-3 rounded-xl text-xs text-blue-900">
                Adding machine to <strong>{filterMonth} {filterYear}</strong> ({filterFinancialYear}).
              </div>

              {/* Department */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Department: <span className="text-red-500">*</span>
                </label>
                <select
                  value={manualForm.department}
                  onChange={(e) => setManualForm({ ...manualForm, department: e.target.value })}
                  className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                >
                  <optgroup label="GROUP 1 (02 to 11-A)">
                    {MONTHLY_PLAN_GROUP_1_DEPTS.map((d) => (
                      <option key={d.code} value={d.name}>
                        {d.code} &bull; {d.label}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="GROUP 2 (11-B to 16)">
                    {MONTHLY_PLAN_GROUP_2_DEPTS.map((d) => (
                      <option key={d.code} value={d.name}>
                        {d.code} &bull; {d.label}
                      </option>
                    ))}
                  </optgroup>
                </select>
              </div>

              {/* Machine Number */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Machine Number: <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. CMM-2601"
                  value={manualForm.machineNumber}
                  onChange={(e) => setManualForm({ ...manualForm, machineNumber: e.target.value })}
                  className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono font-bold text-slate-900 outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Machine Size */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Machine Size: <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 1200 × 1500 × 1000"
                  value={manualForm.machineSize}
                  onChange={(e) => setManualForm({ ...manualForm, machineSize: e.target.value })}
                  className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Priority & Quantity */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Priority: <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={manualForm.priority}
                    onChange={(e) => setManualForm({ ...manualForm, priority: e.target.value as any })}
                    className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                  >
                    <option value="Urgent">Urgent</option>
                    <option value="High">High</option>
                    <option value="Medium">Medium</option>
                    <option value="Low">Low</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Quantity: <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={manualForm.quantity}
                    onChange={(e) => setManualForm({ ...manualForm, quantity: Math.max(1, parseInt(e.target.value) || 1) })}
                    className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono font-bold text-slate-900 outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-slate-200 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setShowAddManualModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingManual}
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition shadow-xs flex items-center space-x-1.5"
                >
                  {savingManual ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                  <span>Save to Plan</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: EDIT PLAN */}
      {editingPlan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
            <div className="bg-slate-900 text-white px-5 py-4 flex items-center justify-between">
              <h3 className="text-sm font-black uppercase tracking-wider flex items-center gap-2">
                <Edit2 className="w-4 h-4 text-blue-400" />
                <span>Edit Monthly Plan Record</span>
              </h3>
              <button
                type="button"
                onClick={() => setEditingPlan(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Department:</label>
                <select
                  value={editingPlan.department}
                  onChange={(e) => setEditingPlan({ ...editingPlan, department: e.target.value })}
                  className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 outline-none"
                >
                  {ALL_MONTHLY_PLAN_DEPTS.map((d) => (
                    <option key={d.code} value={d.name}>
                      {d.code} &bull; {d.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Machine Number:</label>
                <input
                  type="text"
                  value={editingPlan.machineNumber}
                  onChange={(e) => setEditingPlan({ ...editingPlan, machineNumber: e.target.value })}
                  className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono font-bold text-slate-900 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Machine Size:</label>
                <input
                  type="text"
                  value={editingPlan.machineSize}
                  onChange={(e) => setEditingPlan({ ...editingPlan, machineSize: e.target.value })}
                  className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Priority:</label>
                  <select
                    value={editingPlan.priority}
                    onChange={(e) => setEditingPlan({ ...editingPlan, priority: e.target.value as any })}
                    className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 outline-none"
                  >
                    <option value="Urgent">Urgent</option>
                    <option value="High">High</option>
                    <option value="Medium">Medium</option>
                    <option value="Low">Low</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Quantity:</label>
                  <input
                    type="number"
                    min="1"
                    value={editingPlan.quantity || editingPlan.plannedQuantity || 1}
                    onChange={(e) => setEditingPlan({ ...editingPlan, quantity: Math.max(1, parseInt(e.target.value) || 1) })}
                    className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono font-bold text-slate-900 outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Status:</label>
                <select
                  value={editingPlan.status || 'Planned'}
                  onChange={(e) => setEditingPlan({ ...editingPlan, status: e.target.value as any })}
                  className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 outline-none"
                >
                  <option value="Planned">Planned</option>
                  <option value="In Progress">In Progress</option>
                  <option value="Completed">Completed</option>
                  <option value="On Hold">On Hold</option>
                </select>
              </div>

              <div className="pt-3 border-t border-slate-200 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setEditingPlan(null)}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleUpdatePlan}
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs"
                >
                  Update Record
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: DELETE CONFIRMATION */}
      {deletingPlan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 p-5 space-y-4">
            <div className="flex items-center space-x-3 text-red-600">
              <AlertTriangle className="w-6 h-6 shrink-0" />
              <h3 className="text-sm font-black text-slate-900">Confirm Deletion</h3>
            </div>
            <p className="text-xs text-slate-600">
              Are you sure you want to delete Machine <strong>{deletingPlan.machineNumber}</strong> from the Monthly Plan of <strong>{deletingPlan.department}</strong>?
            </p>
            <div className="pt-2 flex items-center justify-end space-x-2">
              <button
                type="button"
                onClick={() => setDeletingPlan(null)}
                className="px-3.5 py-1.5 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold hover:bg-slate-200"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteSingle}
                className="px-4 py-1.5 rounded-xl bg-red-600 text-white text-xs font-bold hover:bg-red-700 shadow-xs"
              >
                Delete Record
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: DELETE WHOLE DEPARTMENT PLAN */}
      {confirmDeleteDept && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-red-200 p-5 space-y-4">
            <div className="flex items-center space-x-3 text-red-600">
              <AlertTriangle className="w-6 h-6 shrink-0" />
              <h3 className="text-sm font-black text-slate-900">Clear Department Plan</h3>
            </div>
            <p className="text-xs text-slate-600">
              This will permanently delete all <strong>{confirmDeleteDept.count}</strong> monthly plan records for <strong>{confirmDeleteDept.deptName}</strong> in <strong>{confirmDeleteDept.month} {confirmDeleteDept.year}</strong>.
            </p>
            <div className="pt-2 flex items-center justify-end space-x-2">
              <button
                type="button"
                onClick={() => setConfirmDeleteDept(null)}
                className="px-3.5 py-1.5 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold hover:bg-slate-200"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExecuteDeleteDeptPlan}
                className="px-4 py-1.5 rounded-xl bg-red-600 text-white text-xs font-bold hover:bg-red-700 shadow-xs"
              >
                Confirm Deletion
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EXCEL UPLOAD MODAL */}
      <MonthlyPlanExcelUploadModal
        isOpen={showUploadModal}
        onClose={() => setShowUploadModal(false)}
        onSuccess={() => {
          setShowUploadModal(false);
          setActionMessage({
            type: 'success',
            text: 'Excel Monthly Plan successfully saved and linked to department dashboards!',
          });
        }}
        initialDepartment={filterDepartment !== 'All Departments' ? filterDepartment : undefined}
        initialMonth={filterMonth}
        initialYear={filterYear}
      />
    </div>
  );
};
