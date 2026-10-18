import React, { useState, useMemo } from 'react';
import {
  Plus,
  FileSpreadsheet,
  Search,
  Filter,
  Eye,
  Edit2,
  Trash2,
  X,
  RotateCcw,
  CheckCircle2,
  Clock,
  AlertCircle,
  TrendingUp,
  RefreshCw,
} from 'lucide-react';
import { Department, Machine, MonthlyPlan } from '../../types';
import { addMonthlyPlan, updateMonthlyPlan, deleteMonthlyPlan } from '../../services/db';
import { exportToExcel } from '../../utils/excel';
import { useAuth } from '../../context/AuthContext';
import { HISTORICAL_MONTHS } from '../../constants';
import { isDepartmentMatch } from '../../utils/departmentUtils';
import { reconcileMonthlyPlanAssignments } from '../../services/reconciliationService';

interface MonthlyPlanModuleProps {
  departments: Department[];
  monthlyPlans: MonthlyPlan[];
  machines?: Machine[];
  selectedDepartment?: string;
  onOpenExcelImport: () => void;
}

export const MonthlyPlanModule: React.FC<MonthlyPlanModuleProps> = ({
  departments,
  monthlyPlans,
  machines = [],
  selectedDepartment,
  onOpenExcelImport,
}) => {
  const { userProfile } = useAuth();

  // Filters State
  const [filterMonth, setFilterMonth] = useState('');
  const [filterYear, setFilterYear] = useState('');
  const [filterDept, setFilterDept] = useState(
    selectedDepartment && selectedDepartment !== 'All Departments' ? selectedDepartment : ''
  );
  const [filterEmployee, setFilterEmployee] = useState('');
  const [filterProject, setFilterProject] = useState('');
  const [filterMachine, setFilterMachine] = useState('');
  const [filterProcess, setFilterProcess] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterPriority, setFilterPriority] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingPlan, setEditingPlan] = useState<MonthlyPlan | null>(null);
  const [viewingPlan, setViewingPlan] = useState<MonthlyPlan | null>(null);
  const [deletingPlan, setDeletingPlan] = useState<MonthlyPlan | null>(null);
  const [saving, setSaving] = useState(false);

  // Form State
  const initialFormState = {
    month: 'March',
    year: '2026',
    department: departments[0]?.name || '02 Planning',
    responsibleEmployee: '',
    project: '',
    machineNumber: '',
    machineModel: '',
    process: '',
    task: '',
    plannedQuantity: 1,
    targetAmount: 0,
    actualQuantity: 0,
    actualAmount: 0,
    plannedStartDate: '',
    plannedEndDate: '',
    priority: 'Medium' as string,
    remarks: '',
  };

  const [formData, setFormData] = useState(initialFormState);

  // Filtered List
  const filteredPlans = useMemo(() => {
    return monthlyPlans.filter((p) => {
      if (filterMonth && p.month !== filterMonth) return false;
      if (filterYear && String(p.year) !== String(filterYear)) return false;
      if (filterDept && filterDept !== 'All Departments') {
        const isDesign = isDepartmentMatch(filterDept, '01 Design');
        if (isDesign) return false;
        const isCentral = isDepartmentMatch(p.department, '02 Planning') || !p.department;
        const matchesSpecific = isDepartmentMatch(p.department, filterDept);
        if (!matchesSpecific && !isCentral) return false;
      }
      if (filterEmployee && p.responsibleEmployee && !p.responsibleEmployee.toLowerCase().includes(filterEmployee.toLowerCase())) return false;
      if (filterProject && p.project && !p.project.toLowerCase().includes(filterProject.toLowerCase())) return false;
      if (filterMachine && p.machineNumber && !p.machineNumber.toLowerCase().includes(filterMachine.toLowerCase())) return false;
      if (filterProcess && ((p.process && !p.process.toLowerCase().includes(filterProcess.toLowerCase())) && (p.operationWork && !p.operationWork.toLowerCase().includes(filterProcess.toLowerCase())))) return false;
      if (filterPriority && p.priority !== filterPriority) return false;

      // Status check
      const target = Number(p.plannedQuantity) || 0;
      const actual = Number(p.actualQuantity) || 0;
      const isCompleted = actual >= target && target > 0;
      const isDelayed = p.plannedEndDate && new Date(p.plannedEndDate) < new Date() && !isCompleted;
      let calculatedStatus = p.status;
      if (!calculatedStatus) {
        if (isCompleted) calculatedStatus = 'Completed';
        else if (isDelayed) calculatedStatus = 'Delayed';
        else if (actual > 0) calculatedStatus = 'In Progress';
        else calculatedStatus = 'Pending';
      }
      if (filterStatus && calculatedStatus !== filterStatus) return false;

      // Search Query
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const match =
          p.department.toLowerCase().includes(q) ||
          (p.machineNumber && p.machineNumber.toLowerCase().includes(q)) ||
          (p.machineModel && p.machineModel.toLowerCase().includes(q)) ||
          (p.project && p.project.toLowerCase().includes(q)) ||
          (p.operationWork && p.operationWork.toLowerCase().includes(q)) ||
          (p.process && p.process.toLowerCase().includes(q)) ||
          (p.task && p.task.toLowerCase().includes(q)) ||
          (p.responsibleEmployee && p.responsibleEmployee.toLowerCase().includes(q));
        if (!match) return false;
      }

      return true;
    });
  }, [
    monthlyPlans,
    filterMonth,
    filterYear,
    filterDept,
    filterEmployee,
    filterProject,
    filterMachine,
    filterProcess,
    filterStatus,
    filterPriority,
    searchQuery,
  ]);

  // KPI Calculations
  const kpi = useMemo(() => {
    let totalTarget = 0;
    let totalActual = 0;
    let completedCount = 0;
    let inProgressCount = 0;
    let pendingCount = 0;
    let delayedCount = 0;

    filteredPlans.forEach((p) => {
      const target = Number(p.plannedQuantity) || 0;
      const actual = Number(p.actualQuantity) || 0;
      totalTarget += target;
      totalActual += actual;

      const isCompleted = actual >= target && target > 0;
      const isDelayed = p.plannedEndDate && new Date(p.plannedEndDate) < new Date() && !isCompleted;

      if (isCompleted || p.status === 'Completed' || p.status === 'Achieved') {
        completedCount++;
      } else if (isDelayed || p.status === 'Delayed') {
        delayedCount++;
      } else if (actual > 0 || p.status === 'In Progress') {
        inProgressCount++;
      } else {
        pendingCount++;
      }
    });

    const remaining = Math.max(0, totalTarget - totalActual);
    const achievementPercent = totalTarget > 0 ? Math.round((totalActual / totalTarget) * 100) : 0;

    return {
      totalTarget,
      totalActual,
      remaining,
      achievementPercent,
      completedCount,
      inProgressCount,
      pendingCount,
      delayedCount,
    };
  }, [filteredPlans]);

  const handleResetFilters = () => {
    setFilterMonth('');
    setFilterYear('');
    setFilterDept(selectedDepartment && selectedDepartment !== 'All Departments' ? selectedDepartment : '');
    setFilterEmployee('');
    setFilterProject('');
    setFilterMachine('');
    setFilterProcess('');
    setFilterStatus('');
    setFilterPriority('');
    setSearchQuery('');
  };

  const [isSyncing, setIsSyncing] = useState(false);
  const [syncReport, setSyncReport] = useState<string | null>(null);

  const handleSyncPlanToShopFloor = async () => {
    setIsSyncing(true);
    setSyncReport(null);
    try {
      const report = await reconcileMonthlyPlanAssignments({
        userEmail: userProfile?.email || 'Planner',
      });
      setSyncReport(
        `Plan synchronization complete: ${report.reconciledMachineNumbers.length} machines reconciled into Machine Master and Active Work.`
      );
      setTimeout(() => setSyncReport(null), 6000);
    } catch (err: any) {
      console.error('Plan sync error:', err);
      alert('Plan synchronization notice: ' + (err?.message || 'Check database connection.'));
    } finally {
      setIsSyncing(false);
    }
  };

  const handleOpenAdd = () => {
    setFormData({
      ...initialFormState,
      department: selectedDepartment && selectedDepartment !== 'All Departments' ? selectedDepartment : departments[0]?.name || '',
    });
    setShowAddModal(true);
  };

  const handleSaveAdd = async (addAnother: boolean = false) => {
    if (!formData.department || !formData.month || !formData.year) {
      alert('Please fill all mandatory fields (Month, Year, Department)');
      return;
    }
    setSaving(true);
    try {
      const plannedQty = Number(formData.plannedQuantity) || 0;
      const actualQty = Number(formData.actualQuantity) || 0;
      const remainingQty = Math.max(0, plannedQty - actualQty);
      const achievementPercent = plannedQty > 0 ? Math.round((actualQty / plannedQty) * 100) : 0;

      let status = 'Pending';
      if (actualQty >= plannedQty && plannedQty > 0) status = 'Completed';
      else if (actualQty > 0) status = 'In Progress';
      if (formData.plannedEndDate && new Date(formData.plannedEndDate) < new Date() && status !== 'Completed') {
        status = 'Delayed';
      }

      await addMonthlyPlan(
        {
          month: formData.month,
          year: String(formData.year),
          department: formData.department,
          responsibleEmployee: formData.responsibleEmployee.trim() || undefined,
          project: formData.project.trim() || undefined,
          machineNumber: formData.machineNumber.trim() || undefined,
          machineModel: formData.machineModel.trim() || undefined,
          process: formData.process.trim() || undefined,
          task: formData.task.trim() || formData.process.trim() || undefined,
          operationWork: formData.task.trim() || formData.process.trim() || undefined,
          plannedQuantity: plannedQty,
          targetAmount: Number(formData.targetAmount) || 0,
          actualQuantity: actualQty,
          actualAmount: Number(formData.actualAmount) || 0,
          remainingQuantity: remainingQty,
          achievementPercent,
          plannedStartDate: formData.plannedStartDate || undefined,
          plannedEndDate: formData.plannedEndDate || undefined,
          priority: formData.priority,
          remarks: formData.remarks.trim() || undefined,
          status,
          createdBy: userProfile?.displayName || userProfile?.email,
        },
        userProfile?.email
      );

      if (addAnother) {
        setFormData((prev) => ({
          ...prev,
          machineNumber: '',
          task: '',
          plannedQuantity: 1,
          actualQuantity: 0,
          remarks: '',
        }));
      } else {
        setShowAddModal(false);
      }
    } catch (err) {
      console.error('Error saving monthly plan:', err);
      alert('Failed to save Monthly Plan. Check database connection.');
    } finally {
      setSaving(false);
    }
  };

  const handleOpenEdit = (plan: MonthlyPlan) => {
    setEditingPlan(plan);
    setFormData({
      month: plan.month,
      year: plan.year,
      department: plan.department,
      responsibleEmployee: plan.responsibleEmployee || '',
      project: plan.project || '',
      machineNumber: plan.machineNumber || '',
      machineModel: plan.machineModel || '',
      process: plan.process || plan.operationWork || '',
      task: plan.task || plan.operationWork || '',
      plannedQuantity: plan.plannedQuantity || 0,
      targetAmount: plan.targetAmount || 0,
      actualQuantity: plan.actualQuantity || 0,
      actualAmount: plan.actualAmount || 0,
      plannedStartDate: plan.plannedStartDate || '',
      plannedEndDate: plan.plannedEndDate || '',
      priority: plan.priority || 'Medium',
      remarks: plan.remarks || '',
    });
  };

  const handleSaveEdit = async () => {
    if (!editingPlan) return;
    setSaving(true);
    try {
      const plannedQty = Number(formData.plannedQuantity) || 0;
      const actualQty = Number(formData.actualQuantity) || 0;
      const remainingQty = Math.max(0, plannedQty - actualQty);
      const achievementPercent = plannedQty > 0 ? Math.round((actualQty / plannedQty) * 100) : 0;

      let status = 'Pending';
      if (actualQty >= plannedQty && plannedQty > 0) status = 'Completed';
      else if (actualQty > 0) status = 'In Progress';
      if (formData.plannedEndDate && new Date(formData.plannedEndDate) < new Date() && status !== 'Completed') {
        status = 'Delayed';
      }

      await updateMonthlyPlan(
        editingPlan.id,
        {
          month: formData.month,
          year: String(formData.year),
          department: formData.department,
          responsibleEmployee: formData.responsibleEmployee.trim() || undefined,
          project: formData.project.trim() || undefined,
          machineNumber: formData.machineNumber.trim() || undefined,
          machineModel: formData.machineModel.trim() || undefined,
          process: formData.process.trim() || undefined,
          task: formData.task.trim() || undefined,
          operationWork: formData.task.trim() || formData.process.trim() || undefined,
          plannedQuantity: plannedQty,
          targetAmount: Number(formData.targetAmount) || 0,
          actualQuantity: actualQty,
          actualAmount: Number(formData.actualAmount) || 0,
          remainingQuantity: remainingQty,
          achievementPercent,
          plannedStartDate: formData.plannedStartDate || undefined,
          plannedEndDate: formData.plannedEndDate || undefined,
          priority: formData.priority,
          remarks: formData.remarks.trim() || undefined,
          status,
          updatedBy: userProfile?.displayName || userProfile?.email,
        },
        userProfile?.email
      );
      setEditingPlan(null);
    } catch (err) {
      console.error('Error updating monthly plan:', err);
      alert('Failed to update Monthly Plan.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingPlan) return;
    try {
      await deleteMonthlyPlan(deletingPlan.id, userProfile?.email);
      setDeletingPlan(null);
    } catch (err) {
      console.error('Error deleting monthly plan:', err);
      alert('Failed to delete Monthly Plan.');
    }
  };

  const handleExport = () => {
    const dataToExport = filteredPlans.map((p) => {
      const target = Number(p.plannedQuantity) || 0;
      const actual = Number(p.actualQuantity) || 0;
      const remaining = Math.max(0, target - actual);
      const achievement = target > 0 ? `${Math.round((actual / target) * 100)}%` : '0%';
      return {
        Month: p.month,
        Year: p.year,
        Department: p.department,
        Employee: p.responsibleEmployee || '',
        Project: p.project || '',
        'Machine Number': p.machineNumber || '',
        'Machine Model': p.machineModel || '',
        Process: p.process || p.operationWork || '',
        Task: p.task || p.operationWork || '',
        'Target Quantity': target,
        'Target Amount': p.targetAmount || 0,
        'Actual Quantity': actual,
        'Actual Amount': p.actualAmount || 0,
        'Remaining Quantity': remaining,
        'Achievement %': achievement,
        'Start Date': p.plannedStartDate || '',
        'Due Date': p.plannedEndDate || '',
        Priority: p.priority || 'Medium',
        Status: p.status || 'Pending',
        Remarks: p.remarks || '',
      };
    });
    exportToExcel('Monthly_Plans_Accurate_Gauging', 'Monthly Plans', dataToExport);
  };

  return (
    <div className="space-y-5">
      {/* Top Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
        <div>
          <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
            <span>Monthly Production Target Plan</span>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
              {filteredPlans.length} records
            </span>
          </h3>
          <p className="text-xs text-slate-500">
            Define, monitor and control monthly plant targets with Target vs Actual reconciliation
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleSyncPlanToShopFloor}
            disabled={isSyncing}
            className={`text-xs font-bold px-3.5 py-2 ${
              isSyncing ? 'bg-indigo-400 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700'
            } text-white rounded-xl shadow-sm flex items-center gap-1.5 transition`}
            title="Synchronize saved Monthly Plan machines into Machine Master, Active Work, and Manufacturing Routes"
          >
            <RefreshCw className={`w-4 h-4 text-white ${isSyncing ? 'animate-spin' : ''}`} />
            <span>{isSyncing ? 'Syncing Plan...' : 'Sync to Shop Floor'}</span>
          </button>

          <button
            onClick={onOpenExcelImport}
            className="text-xs font-black px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-sm flex items-center gap-1.5 transition"
          >
            <FileSpreadsheet className="w-4 h-4 text-white" />
            <span>IMPORT MONTHLY PLAN</span>
          </button>

          <button
            onClick={handleExport}
            className="text-xs font-semibold px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl flex items-center gap-1.5 transition"
          >
            <FileSpreadsheet className="w-4 h-4 text-blue-600" />
            <span>Export Excel</span>
          </button>

          <button
            onClick={handleOpenAdd}
            className="text-xs font-bold px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-sm flex items-center gap-1.5 transition"
          >
            <Plus className="w-4 h-4" />
            <span>+ Add Monthly Plan</span>
          </button>
        </div>
      </div>

      {/* Sync Success Feedback Banner */}
      {syncReport && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between text-xs text-emerald-800 font-medium animate-fadeIn">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{syncReport}</span>
          </div>
          <button onClick={() => setSyncReport(null)} className="text-emerald-500 hover:text-emerald-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* KPI Dashboard Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2.5 text-xs">
        <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-[10px] font-bold uppercase text-slate-400 block">Total Target</span>
          <span className="text-lg font-black text-slate-900 font-mono">{kpi.totalTarget}</span>
        </div>

        <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-[10px] font-bold uppercase text-slate-400 block">Total Actual</span>
          <span className="text-lg font-black text-emerald-600 font-mono">{kpi.totalActual}</span>
        </div>

        <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-[10px] font-bold uppercase text-slate-400 block">Remaining</span>
          <span className="text-lg font-black text-amber-600 font-mono">{kpi.remaining}</span>
        </div>

        <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-[10px] font-bold uppercase text-slate-400 block">Achievement</span>
          <span className="text-lg font-black text-blue-600 font-mono">{kpi.achievementPercent}%</span>
        </div>

        <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-[10px] font-bold uppercase text-slate-400 block">Completed</span>
          <span className="text-lg font-black text-emerald-600 font-mono">{kpi.completedCount}</span>
        </div>

        <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-[10px] font-bold uppercase text-slate-400 block">In Progress</span>
          <span className="text-lg font-black text-blue-600 font-mono">{kpi.inProgressCount}</span>
        </div>

        <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-[10px] font-bold uppercase text-slate-400 block">Pending</span>
          <span className="text-lg font-black text-slate-600 font-mono">{kpi.pendingCount}</span>
        </div>

        <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-[10px] font-bold uppercase text-slate-400 block">Delayed</span>
          <span className="text-lg font-black text-red-600 font-mono">{kpi.delayedCount}</span>
        </div>
      </div>

      {/* Multi-Filters Bar */}
      <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-2xs space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {/* Search */}
          <div className="flex-1 min-w-[200px] relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search by dept, machine, project, work, employee..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
            />
          </div>

          {/* Month Filter */}
          <select
            value={filterMonth}
            onChange={(e) => setFilterMonth(e.target.value)}
            className="text-xs px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white text-slate-700"
          >
            <option value="">All Months</option>
            {[
              'January', 'February', 'March', 'April', 'May', 'June',
              'July', 'August', 'September', 'October', 'November', 'December',
            ].map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>

          {/* Year Filter */}
          <select
            value={filterYear}
            onChange={(e) => setFilterYear(e.target.value)}
            className="text-xs px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white text-slate-700"
          >
            <option value="">All Years</option>
            {['2024', '2025', '2026', '2027'].map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>

          {/* Department Filter */}
          <select
            value={filterDept}
            onChange={(e) => setFilterDept(e.target.value)}
            className="text-xs px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white text-slate-700 max-w-[180px]"
          >
            <option value="">All Departments</option>
            {departments.map((d) => (
              <option key={d.id} value={d.name}>{d.name}</option>
            ))}
          </select>

          {/* Status Filter */}
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="text-xs px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white text-slate-700"
          >
            <option value="">All Statuses</option>
            <option value="Completed">Completed</option>
            <option value="In Progress">In Progress</option>
            <option value="Pending">Pending</option>
            <option value="Delayed">Delayed</option>
          </select>

          {/* Priority Filter */}
          <select
            value={filterPriority}
            onChange={(e) => setFilterPriority(e.target.value)}
            className="text-xs px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white text-slate-700"
          >
            <option value="">All Priorities</option>
            <option value="Critical">Critical</option>
            <option value="High">High</option>
            <option value="Medium">Medium</option>
            <option value="Low">Low</option>
          </select>

          {/* Reset button */}
          <button
            onClick={handleResetFilters}
            className="text-xs font-semibold px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl flex items-center gap-1 transition"
            title="Reset Filters"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset</span>
          </button>

          {/* Quick Filter: October 2026 Plan */}
          <button
            onClick={() => {
              setFilterMonth('October');
              setFilterYear('2026');
            }}
            className={`text-xs font-bold px-3 py-1.5 rounded-xl border flex items-center gap-1.5 transition ml-auto ${
              filterMonth === 'October' && filterYear === '2026'
                ? 'bg-indigo-600 text-white border-indigo-700 shadow-xs'
                : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border-indigo-200'
            }`}
          >
            <span>🎯 Oct 2026 Plan (25 CMMs)</span>
          </button>

          {/* Quick Filter: September 2026 Assembly Plan */}
          <button
            onClick={() => {
              setFilterMonth('September');
              setFilterYear('2026');
            }}
            className={`text-xs font-bold px-3 py-1.5 rounded-xl border flex items-center gap-1.5 transition ${
              filterMonth === 'September' && filterYear === '2026'
                ? 'bg-indigo-600 text-white border-indigo-700 shadow-xs'
                : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
            }`}
          >
            <span>Sept 2026 (26 CMMs)</span>
          </button>
        </div>
      </div>

      {/* Monthly Plan Table */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs">
        {filteredPlans.length === 0 ? (
          <div className="p-12 text-center text-xs text-slate-400">
            No monthly production plans found. Use &ldquo;+ Add Monthly Plan&rdquo; or Import Excel.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="p-3 text-center">SR No</th>
                  <th className="p-3">CMM No</th>
                  <th className="p-3">CMM Size</th>
                  <th className="p-3 text-center">Qty</th>
                  <th className="p-3 text-center">Priority</th>
                  <th className="p-3">Department</th>
                  <th className="p-3">Process</th>
                  <th className="p-3">Task</th>
                  <th className="p-3 text-right">Target</th>
                  <th className="p-3 text-right">Actual</th>
                  <th className="p-3 text-right">Remaining</th>
                  <th className="p-3 text-center">Achievement %</th>
                  <th className="p-3">Status</th>
                  <th className="p-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredPlans.map((plan, idx) => {
                  const target = Number(plan.plannedQuantity) || 0;
                  const actual = Number(plan.actualQuantity) || 0;
                  const remaining = Math.max(0, target - actual);
                  const pct = target > 0 ? Math.round((actual / target) * 100) : 0;

                  const isCompleted = actual >= target && target > 0;
                  const isDelayed = plan.plannedEndDate && new Date(plan.plannedEndDate) < new Date() && !isCompleted;
                  const displayStatus = plan.status || (isCompleted ? 'Completed' : isDelayed ? 'Delayed' : actual > 0 ? 'In Progress' : 'Pending');

                  // Check for corresponding machine for priority or sequence
                  const matchedMachine = machines.find((m) => m.machineNumber === plan.machineNumber);
                  const displayPriority = plan.priority || matchedMachine?.priority || 'P01';
                  const displaySeq = plan.sequenceNumber || matchedMachine?.sequenceNumber || idx + 1;

                  return (
                    <tr key={plan.id} className="hover:bg-slate-50/80 transition">
                      <td className="p-3 text-center font-mono font-bold text-slate-500">
                        {displaySeq}
                      </td>
                      <td className="p-3 font-mono font-bold text-blue-600 text-xs">
                        {plan.machineNumber || '-'}
                      </td>
                      <td className="p-3 font-bold text-slate-800">
                        {plan.machineModel || matchedMachine?.model || '-'}
                      </td>
                      <td className="p-3 text-center font-mono font-semibold text-slate-700">
                        {target || 1}
                      </td>
                      <td className="p-3 text-center">
                        <span className="font-mono font-black text-[11px] px-2 py-0.5 rounded-full bg-slate-900 text-amber-300 border border-slate-700">
                          {displayPriority}
                        </span>
                      </td>
                      <td className="p-3 text-slate-700">
                        <span className="font-mono text-[11px] bg-slate-100 px-1.5 py-0.5 rounded font-semibold text-indigo-700">
                          {plan.department}
                        </span>
                      </td>
                      <td className="p-3 text-slate-700 font-medium">
                        {plan.process || 'Assembly & Inspection'}
                      </td>
                      <td className="p-3 text-slate-800">
                        <div className="font-medium text-slate-900">
                          {plan.task || plan.operationWork || '-'}
                        </div>
                      </td>
                      <td className="p-3 text-right font-mono font-bold text-slate-900">
                        {target}
                      </td>
                      <td className="p-3 text-right font-mono font-bold text-emerald-600">
                        {actual}
                      </td>
                      <td className="p-3 text-right font-mono font-bold text-amber-600">
                        {remaining}
                      </td>
                      <td className="p-3 text-center">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                            pct >= 100
                              ? 'bg-emerald-100 text-emerald-800'
                              : pct >= 50
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {pct}%
                        </span>
                      </td>
                      <td className="p-3 whitespace-nowrap">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                            displayStatus === 'Completed' || displayStatus === 'Achieved'
                              ? 'bg-emerald-100 text-emerald-700'
                              : displayStatus === 'Delayed'
                              ? 'bg-red-100 text-red-700'
                              : displayStatus === 'In Progress'
                              ? 'bg-blue-100 text-blue-700'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {displayStatus}
                        </span>
                      </td>
                      <td className="p-3 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center space-x-1">
                          <button
                            onClick={() => setViewingPlan(plan)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-blue-50 transition"
                            title="View Full Details"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleOpenEdit(plan)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 transition"
                            title="Edit Plan"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setDeletingPlan(plan)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-red-600 hover:bg-red-50 transition"
                            title="Delete Plan"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
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

      {/* ADD / EDIT MODAL */}
      {(showAddModal || editingPlan) && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden text-slate-900">
            <div className="p-4 sm:p-5 bg-slate-900 text-white flex items-center justify-between">
              <div>
                <h3 className="font-bold text-base">
                  {editingPlan ? 'Edit Monthly Production Plan' : 'Add Monthly Production Plan'}
                </h3>
                <p className="text-xs text-slate-400">
                  Target setting &amp; production alignment for shop floor manufacturing
                </p>
              </div>
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setEditingPlan(null);
                }}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Month <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={formData.month}
                    onChange={(e) => setFormData({ ...formData, month: e.target.value })}
                    className="w-full text-xs p-2 rounded-xl border border-slate-300"
                  >
                    {[
                      'January', 'February', 'March', 'April', 'May', 'June',
                      'July', 'August', 'September', 'October', 'November', 'December',
                    ].map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Year <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.year}
                    onChange={(e) => setFormData({ ...formData, year: e.target.value })}
                    className="w-full text-xs p-2 rounded-xl border border-slate-300"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Department <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={formData.department}
                    onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                    className="w-full text-xs p-2 rounded-xl border border-slate-300"
                  >
                    {departments.map((d) => (
                      <option key={d.id} value={d.name}>{d.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Responsible Employee
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Rajesh S."
                    value={formData.responsibleEmployee}
                    onChange={(e) => setFormData({ ...formData, responsibleEmployee: e.target.value })}
                    className="w-full text-xs p-2 rounded-xl border border-slate-300"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Project / Customer
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Project Aerospace / Tata Motors"
                    value={formData.project}
                    onChange={(e) => setFormData({ ...formData, project: e.target.value })}
                    className="w-full text-xs p-2 rounded-xl border border-slate-300"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Machine Number / CMM No
                  </label>
                  <input
                    type="text"
                    list="monthly-machines-list"
                    placeholder="e.g. 2568, 2544"
                    value={formData.machineNumber}
                    onChange={(e) => {
                      const val = e.target.value;
                      const match = machines.find((m) => m.machineNumber === val);
                      setFormData({
                        ...formData,
                        machineNumber: val,
                        ...(match ? { machineModel: match.model, priority: match.priority || formData.priority } : {}),
                      });
                    }}
                    className="w-full text-xs p-2 rounded-xl border border-slate-300 font-mono font-bold"
                  />
                  <datalist id="monthly-machines-list">
                    {machines.map((m) => (
                      <option key={m.id} value={m.machineNumber}>
                        {m.machineNumber} - {m.model} ({m.priority || 'P01'})
                      </option>
                    ))}
                  </datalist>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Machine Model / CMM Size
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. AirFlex 554, 685, 8106"
                    value={formData.machineModel}
                    onChange={(e) => setFormData({ ...formData, machineModel: e.target.value })}
                    className="w-full text-xs p-2 rounded-xl border border-slate-300"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Process Name
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Fabrication, Granite Lapping"
                    value={formData.process}
                    onChange={(e) => setFormData({ ...formData, process: e.target.value })}
                    className="w-full text-xs p-2 rounded-xl border border-slate-300"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Task / Operation Description
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Base structure welding"
                    value={formData.task}
                    onChange={(e) => setFormData({ ...formData, task: e.target.value })}
                    className="w-full text-xs p-2 rounded-xl border border-slate-300"
                  />
                </div>
              </div>

              <div className="grid grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Target Qty <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={formData.plannedQuantity}
                    onChange={(e) => setFormData({ ...formData, plannedQuantity: Number(e.target.value) })}
                    className="w-full text-xs p-2 rounded-xl border border-slate-300 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Target Amount (₹)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={formData.targetAmount}
                    onChange={(e) => setFormData({ ...formData, targetAmount: Number(e.target.value) })}
                    className="w-full text-xs p-2 rounded-xl border border-slate-300 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Actual Qty
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={formData.actualQuantity}
                    onChange={(e) => setFormData({ ...formData, actualQuantity: Number(e.target.value) })}
                    className="w-full text-xs p-2 rounded-xl border border-slate-300 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Actual Amount (₹)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={formData.actualAmount}
                    onChange={(e) => setFormData({ ...formData, actualAmount: Number(e.target.value) })}
                    className="w-full text-xs p-2 rounded-xl border border-slate-300 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Start Date
                  </label>
                  <input
                    type="date"
                    value={formData.plannedStartDate}
                    onChange={(e) => setFormData({ ...formData, plannedStartDate: e.target.value })}
                    className="w-full text-xs p-2 rounded-xl border border-slate-300"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Due Date
                  </label>
                  <input
                    type="date"
                    value={formData.plannedEndDate}
                    onChange={(e) => setFormData({ ...formData, plannedEndDate: e.target.value })}
                    className="w-full text-xs p-2 rounded-xl border border-slate-300"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Priority
                  </label>
                  <select
                    value={formData.priority}
                    onChange={(e) => setFormData({ ...formData, priority: e.target.value as any })}
                    className="w-full text-xs p-2 rounded-xl border border-slate-300"
                  >
                    <option value="Low">Low</option>
                    <option value="Medium">Medium</option>
                    <option value="High">High</option>
                    <option value="Critical">Critical</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Remarks / Notes
                </label>
                <textarea
                  rows={2}
                  placeholder="Additional planning notes or schedule constraints..."
                  value={formData.remarks}
                  onChange={(e) => setFormData({ ...formData, remarks: e.target.value })}
                  className="w-full text-xs p-2 rounded-xl border border-slate-300"
                />
              </div>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
              <button
                type="button"
                onClick={() => {
                  setFormData(initialFormState);
                }}
                className="text-xs font-semibold text-slate-500 hover:text-slate-800 px-3 py-1.5"
              >
                Reset
              </button>

              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddModal(false);
                    setEditingPlan(null);
                  }}
                  className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-200 rounded-xl"
                >
                  Cancel
                </button>

                {!editingPlan && (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => handleSaveAdd(true)}
                    className="px-4 py-2 text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-xl border border-blue-200"
                  >
                    Save &amp; Add Another
                  </button>
                )}

                <button
                  type="button"
                  disabled={saving}
                  onClick={() => (editingPlan ? handleSaveEdit() : handleSaveAdd(false))}
                  className="px-5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-sm disabled:opacity-50"
                >
                  {saving ? 'Saving...' : editingPlan ? 'Update Plan' : 'Save Plan'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* VIEW PLAN MODAL */}
      {viewingPlan && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden text-slate-900">
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
              <div>
                <h3 className="font-bold text-sm">Monthly Production Plan Details</h3>
                <p className="text-xs text-slate-400">
                  {viewingPlan.month} {viewingPlan.year} &bull; {viewingPlan.department}
                </p>
              </div>
              <button onClick={() => setViewingPlan(null)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Department</span>
                  <span className="font-bold text-slate-900">{viewingPlan.department}</span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Period</span>
                  <span className="font-bold text-slate-900">{viewingPlan.month} {viewingPlan.year}</span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Machine</span>
                  <span className="font-bold text-slate-900">
                    {viewingPlan.machineNumber ? `Mach ${viewingPlan.machineNumber}` : 'General'}{' '}
                    {viewingPlan.machineModel ? `(${viewingPlan.machineModel})` : ''}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Project</span>
                  <span className="font-bold text-slate-900">{viewingPlan.project || 'General Plant'}</span>
                </div>
              </div>

              <div className="grid grid-cols-4 gap-2 text-center">
                <div className="p-2.5 rounded-xl bg-slate-100">
                  <span className="text-[10px] font-bold text-slate-500 uppercase block">Target Qty</span>
                  <span className="text-base font-black text-slate-900 font-mono">
                    {viewingPlan.plannedQuantity}
                  </span>
                </div>
                <div className="p-2.5 rounded-xl bg-emerald-50">
                  <span className="text-[10px] font-bold text-emerald-600 uppercase block">Actual Qty</span>
                  <span className="text-base font-black text-emerald-700 font-mono">
                    {viewingPlan.actualQuantity || 0}
                  </span>
                </div>
                <div className="p-2.5 rounded-xl bg-amber-50">
                  <span className="text-[10px] font-bold text-amber-600 uppercase block">Remaining</span>
                  <span className="text-base font-black text-amber-700 font-mono">
                    {Math.max(0, Number(viewingPlan.plannedQuantity) - Number(viewingPlan.actualQuantity || 0))}
                  </span>
                </div>
                <div className="p-2.5 rounded-xl bg-blue-50">
                  <span className="text-[10px] font-bold text-blue-600 uppercase block">Achievement</span>
                  <span className="text-base font-black text-blue-700 font-mono">
                    {Number(viewingPlan.plannedQuantity) > 0
                      ? `${Math.round((Number(viewingPlan.actualQuantity || 0) / Number(viewingPlan.plannedQuantity)) * 100)}%`
                      : '0%'}
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Operation / Work</span>
                  <span className="text-slate-800 font-medium">
                    {viewingPlan.task || viewingPlan.process || viewingPlan.operationWork || '-'}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Responsible Person</span>
                    <span className="text-slate-800">{viewingPlan.responsibleEmployee || 'Unassigned'}</span>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Priority</span>
                    <span className="text-slate-800 font-semibold">{viewingPlan.priority || 'Medium'}</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Start Date</span>
                    <span className="text-slate-800">{viewingPlan.plannedStartDate || '-'}</span>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Due Date</span>
                    <span className="text-slate-800">{viewingPlan.plannedEndDate || '-'}</span>
                  </div>
                </div>

                {viewingPlan.remarks && (
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Remarks</span>
                    <p className="text-slate-700 bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                      {viewingPlan.remarks}
                    </p>
                  </div>
                )}
              </div>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end">
              <button
                onClick={() => setViewingPlan(null)}
                className="px-4 py-2 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-xl"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {deletingPlan && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 overflow-hidden text-slate-900 p-6 space-y-4">
            <div className="flex items-center space-x-3 text-red-600">
              <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-sm">Delete Monthly Plan</h3>
                <p className="text-xs text-slate-500">This action will remove the record from Firebase.</p>
              </div>
            </div>

            <p className="text-xs text-slate-700 bg-slate-50 p-3 rounded-xl border border-slate-200">
              Are you sure you want to delete the plan for <strong>{deletingPlan.department}</strong> ({deletingPlan.month} {deletingPlan.year})?
            </p>

            <div className="flex justify-end space-x-2">
              <button
                onClick={() => setDeletingPlan(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                className="px-4 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-xl shadow-sm"
              >
                Delete Plan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
