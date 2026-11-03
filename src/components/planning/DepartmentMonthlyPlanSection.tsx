import React, { useState, useMemo } from 'react';
import {
  Calendar,
  Layers,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  AlertCircle,
  FileSpreadsheet,
  Download,
  Building,
  Eye,
  RefreshCw,
  TrendingUp,
} from 'lucide-react';
import { MonthlyPlan } from '../../types';
import { updateMonthlyPlanStatus, exportMonthlyPlanToExcel } from '../../services/monthlyPlanService';
import { isDepartmentMatch } from '../../utils/departmentUtils';
import { useAuth } from '../../context/AuthContext';

interface DepartmentMonthlyPlanSectionProps {
  departmentName: string;
  monthlyPlans: MonthlyPlan[];
  selectedMonth?: string;
  selectedYear?: string;
  onOpenQuickUpdate?: () => void;
  onSelectMachineNumber?: (machineNumber: string) => void;
}

export const DepartmentMonthlyPlanSection: React.FC<DepartmentMonthlyPlanSectionProps> = ({
  departmentName,
  monthlyPlans,
  selectedMonth: initialMonth = 'October',
  selectedYear: initialYear = '2026',
  onOpenQuickUpdate,
  onSelectMachineNumber,
}) => {
  const { userProfile } = useAuth();
  const isAdmin = userProfile?.role === 'ADMIN';

  // Local filter states
  const [selectedMonth, setSelectedMonth] = useState(initialMonth);
  const [selectedYear, setSelectedYear] = useState(initialYear);
  const [priorityFilter, setPriorityFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // 1. Department-scoped Monthly Plans
  // Users only see their department's plans. Admin sees all or selected department.
  const deptPlans = useMemo(() => {
    return monthlyPlans.filter((p) => {
      // Must match department
      const matchDept = isDepartmentMatch(p.department, departmentName) ||
        (p.departmentCode && isDepartmentMatch(p.departmentCode, departmentName));
      if (!matchDept) return false;

      // Month & Year filter
      const pMonth = (p.month || '').trim().toLowerCase();
      const pYear = (p.year || p.calendarYear || '').trim();
      if (selectedMonth && pMonth !== selectedMonth.toLowerCase()) return false;
      if (selectedYear && pYear !== selectedYear) return false;

      // Priority filter
      if (priorityFilter !== 'All' && p.priority !== priorityFilter) return false;

      // Status filter
      if (statusFilter !== 'All' && p.status !== statusFilter) return false;

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const machMatch = (p.machineNumber || '').toLowerCase().includes(q);
        const sizeMatch = (p.machineSize || p.machineModel || '').toLowerCase().includes(q);
        if (!machMatch && !sizeMatch) return false;
      }

      return true;
    });
  }, [monthlyPlans, departmentName, selectedMonth, selectedYear, priorityFilter, statusFilter, searchQuery]);

  // Available months found in this department's records
  const availableMonths = useMemo(() => {
    const set = new Set<string>();
    monthlyPlans
      .filter((p) => isDepartmentMatch(p.department, departmentName))
      .forEach((p) => {
        if (p.month) set.add(p.month);
      });
    const arr = Array.from(set);
    if (arr.length === 0) return ['October', 'September', 'November', 'December'];
    return arr;
  }, [monthlyPlans, departmentName]);

  // Aggregate metrics
  const totalMachineEntries = deptPlans.length;
  const totalPlannedQuantity = deptPlans.reduce(
    (sum, p) => sum + Number(p.quantity || p.plannedQuantity || 1),
    0
  );
  const completedCount = deptPlans.filter((p) => p.status === 'Completed').length;
  const inProgressCount = deptPlans.filter((p) => p.status === 'In Progress').length;
  const onHoldCount = deptPlans.filter((p) => p.status === 'On Hold').length;
  const plannedCount = deptPlans.filter((p) => !p.status || p.status === 'Planned').length;

  const handleStatusChange = async (planId: string, newStatus: 'Planned' | 'In Progress' | 'Completed' | 'On Hold') => {
    setUpdatingId(planId);
    try {
      await updateMonthlyPlanStatus(
        planId,
        newStatus,
        userProfile?.email || userProfile?.username || departmentName
      );
    } catch (err) {
      console.error('Failed to update plan status:', err);
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <div className="space-y-5">
      {/* HEADER & FILTERS */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2 text-xs font-black uppercase tracking-wider text-blue-600">
            <Building className="w-4 h-4" />
            <span>{departmentName} &bull; AUTHORIZED MONTHLY PLAN</span>
          </div>
          <h3 className="text-xl font-black text-slate-900 tracking-tight mt-0.5">
            Monthly Production Schedule
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Physical target machines allocated by Administration for <strong>{selectedMonth} {selectedYear}</strong>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Month Selector */}
          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-300 rounded-xl px-2.5 py-1">
            <Calendar className="w-3.5 h-3.5 text-blue-600 shrink-0" />
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="bg-transparent text-xs font-bold text-slate-800 outline-none cursor-pointer"
            >
              {availableMonths.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>

          {/* Year Selector */}
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(e.target.value)}
            className="bg-slate-50 border border-slate-300 rounded-xl px-2.5 py-1 text-xs font-bold text-slate-800 outline-none cursor-pointer"
          >
            <option value="2026">2026</option>
            <option value="2025">2025</option>
            <option value="2027">2027</option>
          </select>

          <button
            type="button"
            onClick={() => exportMonthlyPlanToExcel(deptPlans, `${departmentName}_Monthly_Plan_${selectedMonth}_${selectedYear}`)}
            className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition flex items-center space-x-1.5 border border-slate-200"
          >
            <Download className="w-3.5 h-3.5 text-slate-600" />
            <span>Export Excel</span>
          </button>
        </div>
      </div>

      {/* KPI METRIC CARDS */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* Total Machines */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
            <Layers className="w-3.5 h-3.5 text-blue-600" />
            <span>Total Machines</span>
          </div>
          <div className="text-2xl font-black text-slate-900 mt-1 font-mono">
            {totalMachineEntries}
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">Machine Entries</div>
        </div>

        {/* Planned Quantity */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <div className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider flex items-center gap-1">
            <TrendingUp className="w-3.5 h-3.5" />
            <span>Planned Quantity</span>
          </div>
          <div className="text-2xl font-black text-indigo-600 mt-1 font-mono">
            {totalPlannedQuantity}
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">Physical Units</div>
        </div>

        {/* Planned State */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <div className="text-[10px] font-bold text-slate-600 uppercase tracking-wider flex items-center gap-1">
            <Clock className="w-3.5 h-3.5 text-slate-500" />
            <span>Planned</span>
          </div>
          <div className="text-2xl font-black text-slate-700 mt-1 font-mono">
            {plannedCount}
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">Not Started</div>
        </div>

        {/* In Progress */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <div className="text-[10px] font-bold text-blue-600 uppercase tracking-wider flex items-center gap-1">
            <Clock className="w-3.5 h-3.5 text-blue-600" />
            <span>In Progress</span>
          </div>
          <div className="text-2xl font-black text-blue-600 mt-1 font-mono">
            {inProgressCount}
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">Shop Floor Active</div>
        </div>

        {/* Completed */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <div className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            <span>Completed</span>
          </div>
          <div className="text-2xl font-black text-emerald-600 mt-1 font-mono">
            {completedCount}
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">100% Finished</div>
        </div>

        {/* On Hold */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <div className="text-[10px] font-bold text-amber-700 uppercase tracking-wider flex items-center gap-1">
            <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
            <span>On Hold</span>
          </div>
          <div className="text-2xl font-black text-amber-700 mt-1 font-mono">
            {onHoldCount}
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">Blocked / Hold</div>
        </div>
      </div>

      {/* SEARCH & SECONDARY FILTERS */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-72">
          <input
            type="text"
            placeholder="Search Machine No or Size..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-50 border border-slate-300 rounded-xl pl-8 pr-3 py-1.5 text-xs font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-blue-500"
          />
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          {/* Priority filter */}
          <div className="flex items-center space-x-1.5">
            <span className="text-[11px] font-bold text-slate-500 uppercase">Priority:</span>
            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
              className="bg-slate-50 border border-slate-300 rounded-lg px-2 py-1 text-xs font-bold text-slate-800 outline-none"
            >
              <option value="All">All Priorities</option>
              <option value="Urgent">Urgent</option>
              <option value="High">High</option>
              <option value="Medium">Medium</option>
              <option value="Low">Low</option>
            </select>
          </div>

          {/* Status filter */}
          <div className="flex items-center space-x-1.5">
            <span className="text-[11px] font-bold text-slate-500 uppercase">Status:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-slate-50 border border-slate-300 rounded-lg px-2 py-1 text-xs font-bold text-slate-800 outline-none"
            >
              <option value="All">All Statuses</option>
              <option value="Planned">Planned</option>
              <option value="In Progress">In Progress</option>
              <option value="Completed">Completed</option>
              <option value="On Hold">On Hold</option>
            </select>
          </div>
        </div>
      </div>

      {/* PLAN TABLE */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        {deptPlans.length === 0 ? (
          <div className="py-16 text-center bg-slate-50 space-y-2">
            <div className="w-10 h-10 mx-auto rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div className="text-xs font-bold text-slate-700">
              No monthly plan entries allocated for {departmentName} in {selectedMonth} {selectedYear}
            </div>
            <p className="text-[11px] text-slate-400">
              When Administration uploads an Excel plan for {departmentName}, the 4-column machine targets will appear here automatically.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100 text-slate-700 font-bold uppercase text-[10px]">
                <tr>
                  <th className="p-3">#</th>
                  <th className="p-3">Machine Number</th>
                  <th className="p-3">Machine Size</th>
                  <th className="p-3 text-center">Priority</th>
                  <th className="p-3 text-center">Quantity</th>
                  <th className="p-3 text-center">Shop Status</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {deptPlans.map((plan, idx) => (
                  <tr key={plan.id} className="hover:bg-blue-50/30 transition">
                    <td className="p-3 font-mono text-slate-400">{idx + 1}</td>
                    <td className="p-3 font-mono font-black text-slate-900 text-sm">
                      <span className="text-blue-600">{plan.machineNumber}</span>
                    </td>
                    <td className="p-3 font-medium text-slate-700">
                      {plan.machineSize || plan.machineModel || 'Standard'}
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
                        disabled={updatingId === plan.id}
                        onChange={(e) => handleStatusChange(plan.id, e.target.value as any)}
                        className={`text-[11px] font-bold px-2.5 py-1 rounded-lg border outline-none cursor-pointer transition ${
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
                      {onOpenQuickUpdate && (
                        <button
                          type="button"
                          onClick={onOpenQuickUpdate}
                          className="px-2.5 py-1 rounded bg-blue-50 text-blue-700 hover:bg-blue-100 font-bold text-[11px] transition shadow-2xs"
                        >
                          Update Progress
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
