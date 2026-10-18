import React, { useState, useMemo } from 'react';
import {
  Plus,
  FileSpreadsheet,
  Search,
  RotateCcw,
  Eye,
  Edit2,
  Trash2,
  X,
  AlertTriangle,
  Clock,
  CheckCircle2,
} from 'lucide-react';
import { Department, Machine, WeeklyPlan } from '../../types';
import { addWeeklyPlan, updateWeeklyPlan, deleteWeeklyPlan } from '../../services/db';
import { exportToExcel } from '../../utils/excel';
import { useAuth } from '../../context/AuthContext';
import { isDepartmentMatch } from '../../utils/departmentUtils';

interface WeeklyPlanModuleProps {
  departments: Department[];
  weeklyPlans: WeeklyPlan[];
  machines?: Machine[];
  selectedDepartment?: string;
  onOpenExcelImport: () => void;
}

export const WeeklyPlanModule: React.FC<WeeklyPlanModuleProps> = ({
  departments,
  weeklyPlans,
  machines = [],
  selectedDepartment,
  onOpenExcelImport,
}) => {
  const { userProfile } = useAuth();

  // Filters State
  const [filterWeek, setFilterWeek] = useState('');
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
  const [editingPlan, setEditingPlan] = useState<WeeklyPlan | null>(null);
  const [viewingPlan, setViewingPlan] = useState<WeeklyPlan | null>(null);
  const [deletingPlan, setDeletingPlan] = useState<WeeklyPlan | null>(null);
  const [saving, setSaving] = useState(false);

  // Form State
  const initialFormState = {
    weekNumber: 12,
    weekStartDate: new Date().toISOString().split('T')[0],
    weekEndDate: new Date(Date.now() + 6 * 86400000).toISOString().split('T')[0],
    year: '2026',
    department: departments[0]?.name || '02 Planning',
    responsibleEmployee: '',
    project: '',
    machineNumber: '',
    machineModel: '',
    process: '',
    task: '',
    plannedQuantity: 1,
    actualQuantity: 0,
    plannedStartDate: '',
    plannedEndDate: '',
    priority: 'Medium' as string,
    status: 'In Progress' as 'Not Started' | 'In Progress' | 'Completed' | 'Delayed' | 'On Hold',
    delayReason: '',
    revisedDate: '',
    correctiveAction: '',
    remarks: '',
  };

  const [formData, setFormData] = useState(initialFormState);

  // Filtered list
  const filteredPlans = useMemo(() => {
    return weeklyPlans.filter((w) => {
      if (filterWeek && String(w.weekNumber) !== String(filterWeek)) return false;
      if (filterYear && String(w.year) !== String(filterYear)) return false;
      if (filterDept && filterDept !== 'All Departments') {
        const isDesign = isDepartmentMatch(filterDept, '01 Design');
        if (isDesign) return false;
        const isCentral = isDepartmentMatch(w.department, '02 Planning') || !w.department;
        const matchesSpecific = isDepartmentMatch(w.department, filterDept);
        if (!matchesSpecific && !isCentral) return false;
      }
      if (filterEmployee && w.responsibleEmployee && !w.responsibleEmployee.toLowerCase().includes(filterEmployee.toLowerCase())) return false;
      if (filterProject && w.project && !w.project.toLowerCase().includes(filterProject.toLowerCase())) return false;
      if (filterMachine && w.machineNumber && !w.machineNumber.toLowerCase().includes(filterMachine.toLowerCase())) return false;
      if (filterProcess && ((w.process && !w.process.toLowerCase().includes(filterProcess.toLowerCase())) && (w.operationWork && !w.operationWork.toLowerCase().includes(filterProcess.toLowerCase())))) return false;
      if (filterPriority && w.priority !== filterPriority) return false;

      const target = Number(w.plannedQuantity) || 0;
      const actual = Number(w.actualQuantity) || 0;
      const isCompleted = actual >= target && target > 0;
      const isDelayed = w.weekEndDate && new Date(w.weekEndDate) < new Date() && !isCompleted;
      let calculatedStatus = w.status;
      if (!calculatedStatus) {
        if (isCompleted) calculatedStatus = 'Completed';
        else if (isDelayed) calculatedStatus = 'Delayed';
        else if (actual > 0) calculatedStatus = 'In Progress';
        else calculatedStatus = 'Pending';
      }
      if (filterStatus && calculatedStatus !== filterStatus) return false;

      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const match =
          w.department.toLowerCase().includes(q) ||
          (w.machineNumber && w.machineNumber.toLowerCase().includes(q)) ||
          (w.machineModel && w.machineModel.toLowerCase().includes(q)) ||
          (w.project && w.project.toLowerCase().includes(q)) ||
          (w.operationWork && w.operationWork.toLowerCase().includes(q)) ||
          (w.process && w.process.toLowerCase().includes(q)) ||
          (w.task && w.task.toLowerCase().includes(q)) ||
          (w.responsibleEmployee && w.responsibleEmployee.toLowerCase().includes(q));
        if (!match) return false;
      }

      return true;
    });
  }, [
    weeklyPlans,
    filterWeek,
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

    filteredPlans.forEach((w) => {
      const target = Number(w.plannedQuantity) || 0;
      const actual = Number(w.actualQuantity) || 0;
      totalTarget += target;
      totalActual += actual;

      const isCompleted = actual >= target && target > 0;
      const isDelayed = w.weekEndDate && new Date(w.weekEndDate) < new Date() && !isCompleted;

      if (isCompleted || w.status === 'Completed') {
        completedCount++;
      } else if (isDelayed || w.status === 'Delayed') {
        delayedCount++;
      } else if (actual > 0 || w.status === 'In Progress') {
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
    setFilterWeek('');
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

  const handleOpenAdd = () => {
    setFormData({
      ...initialFormState,
      department: selectedDepartment && selectedDepartment !== 'All Departments' ? selectedDepartment : departments[0]?.name || '',
    });
    setShowAddModal(true);
  };

  const handleSaveAdd = async (addAnother: boolean = false) => {
    if (!formData.department || !formData.weekStartDate || !formData.weekEndDate) {
      alert('Please fill all mandatory fields (Department, Start Date, End Date)');
      return;
    }
    setSaving(true);
    try {
      const plannedQty = Number(formData.plannedQuantity) || 0;
      const actualQty = Number(formData.actualQuantity) || 0;
      const remainingQty = Math.max(0, plannedQty - actualQty);
      const achievementPercent = plannedQty > 0 ? Math.round((actualQty / plannedQty) * 100) : 0;

      let status = formData.status || 'In Progress';
      if (actualQty >= plannedQty && plannedQty > 0) status = 'Completed';

      await addWeeklyPlan(
        {
          weekNumber: Number(formData.weekNumber) || 1,
          weekStartDate: formData.weekStartDate,
          weekEndDate: formData.weekEndDate,
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
          actualQuantity: actualQty,
          remainingQuantity: remainingQty,
          achievementPercent,
          plannedStartDate: formData.plannedStartDate || formData.weekStartDate,
          plannedEndDate: formData.plannedEndDate || formData.weekEndDate,
          priority: formData.priority,
          status,
          delayReason: formData.delayReason.trim() || undefined,
          revisedDate: formData.revisedDate || undefined,
          correctiveAction: formData.correctiveAction.trim() || undefined,
          remarks: formData.remarks.trim() || undefined,
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
      console.error('Error adding weekly plan:', err);
      alert('Failed to save Weekly Plan.');
    } finally {
      setSaving(false);
    }
  };

  const handleOpenEdit = (plan: WeeklyPlan) => {
    setEditingPlan(plan);
    setFormData({
      weekNumber: Number(plan.weekNumber) || 1,
      weekStartDate: plan.weekStartDate || '',
      weekEndDate: plan.weekEndDate || '',
      year: String(plan.year || '2026'),
      department: plan.department,
      responsibleEmployee: plan.responsibleEmployee || '',
      project: plan.project || '',
      machineNumber: plan.machineNumber || '',
      machineModel: plan.machineModel || '',
      process: plan.process || plan.operationWork || '',
      task: plan.task || plan.operationWork || '',
      plannedQuantity: plan.plannedQuantity || 0,
      actualQuantity: plan.actualQuantity || 0,
      plannedStartDate: plan.plannedStartDate || plan.weekStartDate || '',
      plannedEndDate: plan.plannedEndDate || plan.weekEndDate || '',
      priority: plan.priority || 'Medium',
      status: (plan.status as any) || 'In Progress',
      delayReason: plan.delayReason || '',
      revisedDate: plan.revisedDate || '',
      correctiveAction: plan.correctiveAction || '',
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

      let status = formData.status;
      if (actualQty >= plannedQty && plannedQty > 0) status = 'Completed';

      await updateWeeklyPlan(
        editingPlan.id,
        {
          weekNumber: Number(formData.weekNumber) || 1,
          weekStartDate: formData.weekStartDate,
          weekEndDate: formData.weekEndDate,
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
          actualQuantity: actualQty,
          remainingQuantity: remainingQty,
          achievementPercent,
          plannedStartDate: formData.plannedStartDate || formData.weekStartDate,
          plannedEndDate: formData.plannedEndDate || formData.weekEndDate,
          priority: formData.priority,
          status,
          delayReason: formData.delayReason.trim() || undefined,
          revisedDate: formData.revisedDate || undefined,
          correctiveAction: formData.correctiveAction.trim() || undefined,
          remarks: formData.remarks.trim() || undefined,
          updatedBy: userProfile?.displayName || userProfile?.email,
        },
        userProfile?.email
      );
      setEditingPlan(null);
    } catch (err) {
      console.error('Error updating weekly plan:', err);
      alert('Failed to update Weekly Plan.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingPlan) return;
    try {
      await deleteWeeklyPlan(deletingPlan.id, userProfile?.email);
      setDeletingPlan(null);
    } catch (err) {
      console.error('Error deleting weekly plan:', err);
      alert('Failed to delete Weekly Plan.');
    }
  };

  const handleExport = () => {
    const dataToExport = filteredPlans.map((w) => {
      const target = Number(w.plannedQuantity) || 0;
      const actual = Number(w.actualQuantity) || 0;
      const remaining = Math.max(0, target - actual);
      const achievement = target > 0 ? `${Math.round((actual / target) * 100)}%` : '0%';
      return {
        'Week Number': w.weekNumber,
        'Week Start': w.weekStartDate,
        'Week End': w.weekEndDate,
        Year: w.year,
        Department: w.department,
        Employee: w.responsibleEmployee || '',
        Project: w.project || '',
        'Machine Number': w.machineNumber || '',
        'Machine Model': w.machineModel || '',
        Process: w.process || w.operationWork || '',
        Task: w.task || w.operationWork || '',
        Target: target,
        Actual: actual,
        Remaining: remaining,
        'Achievement %': achievement,
        Priority: w.priority || 'Medium',
        Status: w.status || 'In Progress',
        'Delay Reason': w.delayReason || '',
        'Revised Date': w.revisedDate || '',
        'Corrective Action': w.correctiveAction || '',
        Remarks: w.remarks || '',
      };
    });
    exportToExcel('Weekly_Plans_Accurate_Gauging', 'Weekly Plans', dataToExport);
  };

  return (
    <div className="space-y-5">
      {/* Top Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
        <div>
          <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
            <span>Weekly Production &amp; Milestone Plan</span>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
              {filteredPlans.length} records
            </span>
          </h3>
          <p className="text-xs text-slate-500">
            Granular shop floor weekly execution schedules with delay tracing and corrective actions
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={onOpenExcelImport}
            className="text-xs font-black px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-sm flex items-center gap-1.5 transition"
          >
            <FileSpreadsheet className="w-4 h-4 text-white" />
            <span>IMPORT WEEKLY PLAN</span>
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
            <span>+ Add Weekly Plan</span>
          </button>
        </div>
      </div>

      {/* KPI Dashboard Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2.5 text-xs">
        <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-[10px] font-bold uppercase text-slate-400 block">Weekly Target</span>
          <span className="text-lg font-black text-slate-900 font-mono">{kpi.totalTarget}</span>
        </div>

        <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-[10px] font-bold uppercase text-slate-400 block">Weekly Actual</span>
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

      {/* Filter Bar */}
      <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-2xs space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {/* Search */}
          <div className="flex-1 min-w-[200px] relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search weekly tasks, machine, employee, project..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
            />
          </div>

          {/* Week Filter */}
          <input
            type="number"
            placeholder="Week #"
            value={filterWeek}
            onChange={(e) => setFilterWeek(e.target.value)}
            className="w-20 text-xs px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white text-slate-700"
          />

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
            <option value="Delayed">Delayed</option>
            <option value="Pending">Pending</option>
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
        </div>
      </div>

      {/* Weekly Plan Table */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs">
        {filteredPlans.length === 0 ? (
          <div className="p-12 text-center text-xs text-slate-400">
            No weekly execution plans found. Click &ldquo;+ Add Weekly Plan&rdquo; or Import from Excel.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="p-3">Week Dates</th>
                  <th className="p-3">Department</th>
                  <th className="p-3">Machine / Model</th>
                  <th className="p-3">Work Description</th>
                  <th className="p-3 text-right">Target</th>
                  <th className="p-3 text-right">Actual</th>
                  <th className="p-3 text-right">Remaining</th>
                  <th className="p-3 text-center">Achievement</th>
                  <th className="p-3">Responsible</th>
                  <th className="p-3">Status</th>
                  <th className="p-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredPlans.map((plan) => {
                  const target = Number(plan.plannedQuantity) || 0;
                  const actual = Number(plan.actualQuantity) || 0;
                  const remaining = Math.max(0, target - actual);
                  const pct = target > 0 ? Math.round((actual / target) * 100) : 0;

                  const isCompleted = actual >= target && target > 0;
                  const isDelayed = plan.weekEndDate && new Date(plan.weekEndDate) < new Date() && !isCompleted;
                  const displayStatus = plan.status || (isCompleted ? 'Completed' : isDelayed ? 'Delayed' : actual > 0 ? 'In Progress' : 'Pending');

                  return (
                    <tr key={plan.id} className="hover:bg-slate-50/80 transition">
                      <td className="p-3 whitespace-nowrap">
                        <div className="font-bold text-slate-900">
                          Wk {plan.weekNumber || '-'}{' '}
                          <span className="font-normal text-[11px] text-slate-500">
                            ({plan.weekStartDate} &rarr; {plan.weekEndDate})
                          </span>
                        </div>
                      </td>
                      <td className="p-3 text-slate-700">
                        <span className="font-mono text-[11px] bg-slate-100 px-1.5 py-0.5 rounded">
                          {plan.department}
                        </span>
                      </td>
                      <td className="p-3 text-slate-800">
                        {plan.machineNumber ? (
                          <span className="font-bold text-slate-900 block font-mono">
                            Mach {plan.machineNumber}
                          </span>
                        ) : null}
                        <span className="text-[11px] text-slate-500">
                          {plan.machineModel || '-'}
                        </span>
                      </td>
                      <td className="p-3 text-slate-800">
                        <div className="font-medium text-slate-900">
                          {plan.task || plan.process || plan.operationWork || '-'}
                        </div>
                        {plan.project && (
                          <span className="text-[10px] text-slate-500 block">
                            Project: {plan.project}
                          </span>
                        )}
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
                      <td className="p-3 text-slate-600 whitespace-nowrap">
                        {plan.responsibleEmployee || '-'}
                      </td>
                      <td className="p-3 whitespace-nowrap">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                            displayStatus === 'Completed'
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
                  {editingPlan ? 'Edit Weekly Production Plan' : 'Add Weekly Production Plan'}
                </h3>
                <p className="text-xs text-slate-400">
                  Shop floor target scheduling, milestone dates, and progress tracking
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
              <div className="grid grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Week # <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="53"
                    required
                    value={formData.weekNumber}
                    onChange={(e) => setFormData({ ...formData, weekNumber: Number(e.target.value) })}
                    className="w-full text-xs p-2 rounded-xl border border-slate-300 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Week Start Date <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={formData.weekStartDate}
                    onChange={(e) => setFormData({ ...formData, weekStartDate: e.target.value })}
                    className="w-full text-xs p-2 rounded-xl border border-slate-300"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Week End Date <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={formData.weekEndDate}
                    onChange={(e) => setFormData({ ...formData, weekEndDate: e.target.value })}
                    className="w-full text-xs p-2 rounded-xl border border-slate-300"
                  />
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
              </div>

              <div className="grid grid-cols-2 gap-3">
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

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Responsible Employee
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Ramesh P."
                    value={formData.responsibleEmployee}
                    onChange={(e) => setFormData({ ...formData, responsibleEmployee: e.target.value })}
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
                    list="weekly-machines-list"
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
                  <datalist id="weekly-machines-list">
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
                    Process / Work Description
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Granite surface grinding"
                    value={formData.process}
                    onChange={(e) => setFormData({ ...formData, process: e.target.value })}
                    className="w-full text-xs p-2 rounded-xl border border-slate-300"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Task / Operation Details
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Stage 2 lapping and precision inspection"
                    value={formData.task}
                    onChange={(e) => setFormData({ ...formData, task: e.target.value })}
                    className="w-full text-xs p-2 rounded-xl border border-slate-300"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
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
                    Status
                  </label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                    className="w-full text-xs p-2 rounded-xl border border-slate-300"
                  >
                    <option value="Not Started">Not Started</option>
                    <option value="In Progress">In Progress</option>
                    <option value="Completed">Completed</option>
                    <option value="Delayed">Delayed</option>
                    <option value="On Hold">On Hold</option>
                  </select>
                </div>
              </div>

              {formData.status === 'Delayed' && (
                <div className="p-3.5 bg-red-50 rounded-xl border border-red-200 space-y-3">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-red-800">
                    <AlertTriangle className="w-4 h-4" />
                    <span>Delay Management &amp; Corrective Action</span>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-red-900 mb-1">
                        Reason for Delay
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Raw material shortage, vendor delay"
                        value={formData.delayReason}
                        onChange={(e) => setFormData({ ...formData, delayReason: e.target.value })}
                        className="w-full text-xs p-2 rounded-xl border border-red-300 bg-white"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-red-900 mb-1">
                        Revised Completion Date
                      </label>
                      <input
                        type="date"
                        value={formData.revisedDate}
                        onChange={(e) => setFormData({ ...formData, revisedDate: e.target.value })}
                        className="w-full text-xs p-2 rounded-xl border border-red-300 bg-white"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-red-900 mb-1">
                      Corrective Action Planned
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Overtime arranged, secondary supplier expedited"
                      value={formData.correctiveAction}
                      onChange={(e) => setFormData({ ...formData, correctiveAction: e.target.value })}
                      className="w-full text-xs p-2 rounded-xl border border-red-300 bg-white"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Remarks / Notes
                </label>
                <textarea
                  rows={2}
                  placeholder="Additional execution details..."
                  value={formData.remarks}
                  onChange={(e) => setFormData({ ...formData, remarks: e.target.value })}
                  className="w-full text-xs p-2 rounded-xl border border-slate-300"
                />
              </div>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setFormData(initialFormState)}
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
                <h3 className="font-bold text-sm">Weekly Production Plan Details</h3>
                <p className="text-xs text-slate-400">
                  Week {viewingPlan.weekNumber} ({viewingPlan.weekStartDate} &rarr; {viewingPlan.weekEndDate}) &bull; {viewingPlan.department}
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
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Machine</span>
                  <span className="font-bold text-slate-900">
                    {viewingPlan.machineNumber ? `Mach ${viewingPlan.machineNumber}` : 'General'}{' '}
                    {viewingPlan.machineModel ? `(${viewingPlan.machineModel})` : ''}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Project</span>
                  <span className="font-bold text-slate-900">{viewingPlan.project || 'General'}</span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Status</span>
                  <span className="font-bold text-blue-700">{viewingPlan.status || 'In Progress'}</span>
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
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Work Description</span>
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

                {viewingPlan.delayReason && (
                  <div className="p-3 bg-red-50 rounded-xl border border-red-200 space-y-1">
                    <span className="text-[10px] uppercase font-bold text-red-800 block">Delay Reason</span>
                    <p className="text-red-900 font-medium">{viewingPlan.delayReason}</p>
                    {viewingPlan.revisedDate && (
                      <p className="text-[11px] text-red-700">Revised Date: {viewingPlan.revisedDate}</p>
                    )}
                    {viewingPlan.correctiveAction && (
                      <p className="text-[11px] text-red-700">Action: {viewingPlan.correctiveAction}</p>
                    )}
                  </div>
                )}

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
                <h3 className="font-bold text-sm">Delete Weekly Plan</h3>
                <p className="text-xs text-slate-500">This action will remove the record from Firebase.</p>
              </div>
            </div>

            <p className="text-xs text-slate-700 bg-slate-50 p-3 rounded-xl border border-slate-200">
              Are you sure you want to delete Week {deletingPlan.weekNumber} for <strong>{deletingPlan.department}</strong>?
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
