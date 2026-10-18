import React, { useState, useMemo } from 'react';
import {
  Building,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Flame,
  ArrowRight,
  TrendingUp,
  Cpu,
  Calendar,
  Layers,
  ArrowRightLeft,
  ChevronDown,
  ShieldAlert,
  User,
  Check,
} from 'lucide-react';
import {
  Department,
  DepartmentHandover,
  DepartmentWork,
  Machine,
  MonthlyPlan,
  QualityDailyCheck,
  QualityOperation,
  QualityRejection,
  WeeklyPlan,
  MachineStatus,
} from '../types';
import { INITIAL_DEPARTMENTS } from '../constants';
import {
  calculateDepartmentKpis,
  resolveMachineInfo,
  ResolvedMachineInfo,
} from '../utils/machineMonitoring';

interface AdminDepartmentMonitoringViewProps {
  selectedDepartment: string;
  onSelectDepartment: (dept: string) => void;
  machines: Machine[];
  departmentWork: DepartmentWork[];
  handovers: DepartmentHandover[];
  qualityChecks: QualityDailyCheck[];
  qualityRejections: QualityRejection[];
  qualityOps: QualityOperation[];
  monthlyPlans: MonthlyPlan[];
  weeklyPlans: WeeklyPlan[];
  onOpenMachineDetail: (machine: Machine) => void;
}

export const AdminDepartmentMonitoringView: React.FC<AdminDepartmentMonitoringViewProps> = ({
  selectedDepartment,
  onSelectDepartment,
  machines,
  departmentWork,
  handovers,
  qualityChecks,
  qualityRejections,
  qualityOps,
  monthlyPlans,
  weeklyPlans,
  onOpenMachineDetail,
}) => {
  // Machine Table Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [selectedMonth, setSelectedMonth] = useState<string>('March');
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());

  // Quick KPI Chip Filter (Section 10)
  const [quickKpiFilter, setQuickKpiFilter] = useState<string | null>(null);

  // Calculate live KPIs for this department
  const kpis = useMemo(() => {
    return calculateDepartmentKpis(
      selectedDepartment,
      machines,
      departmentWork,
      monthlyPlans,
      weeklyPlans,
      handovers
    );
  }, [selectedDepartment, machines, departmentWork, monthlyPlans, weeklyPlans, handovers]);

  // Resolve all machines with live data
  const resolvedAllMachines = useMemo(() => {
    return machines.map((m) =>
      resolveMachineInfo(
        m,
        departmentWork,
        handovers,
        qualityChecks,
        qualityRejections,
        qualityOps
      )
    );
  }, [machines, departmentWork, handovers, qualityChecks, qualityRejections, qualityOps]);

  // Filter machines assigned or currently in this department
  const departmentMachines = useMemo(() => {
    return resolvedAllMachines.filter(
      (m) =>
        m.currentDepartment === selectedDepartment ||
        m.activeWorkList.some((w) => w.department === selectedDepartment)
    );
  }, [resolvedAllMachines, selectedDepartment]);

  // Filtered Machines for the Table
  const filteredMachines = useMemo(() => {
    return departmentMachines.filter((m) => {
      // Search
      const q = searchQuery.toLowerCase().trim();
      const matchSearch =
        !q ||
        m.machineNumber.toLowerCase().includes(q) ||
        m.model.toLowerCase().includes(q) ||
        m.project.toLowerCase().includes(q) ||
        m.customer.toLowerCase().includes(q) ||
        m.assignedEmployee.toLowerCase().includes(q) ||
        m.currentProcess.toLowerCase().includes(q);

      // Status Filter
      let matchStatus = true;
      if (statusFilter !== 'ALL') {
        matchStatus = m.currentStatus === statusFilter;
      }

      // Quick KPI Filter
      let matchQuick = true;
      if (quickKpiFilter === 'In Progress') {
        matchQuick = m.currentStatus === 'In Progress';
      } else if (quickKpiFilter === 'Completed') {
        matchQuick = m.currentStatus === 'Completed';
      } else if (quickKpiFilter === 'Pending') {
        matchQuick = m.currentStatus === 'Not Started';
      } else if (quickKpiFilter === 'Delayed') {
        matchQuick = m.isDelayed;
      } else if (quickKpiFilter === 'Rework Required' || quickKpiFilter === 'On Hold') {
        matchQuick = m.currentStatus === 'Quality Hold' || (m.currentStatus as string) === 'REWORK_REQUIRED';
      }

      return matchSearch && matchStatus && matchQuick;
    });
  }, [departmentMachines, searchQuery, statusFilter, quickKpiFilter]);

  // Department Work Items
  const deptWorkList = useMemo(() => {
    return departmentWork.filter((w) => w.department === selectedDepartment);
  }, [departmentWork, selectedDepartment]);

  // Is Quality department?
  const isQualityDept =
    selectedDepartment.includes('Quality') ||
    selectedDepartment.includes('04') ||
    selectedDepartment.includes('13') ||
    selectedDepartment.includes('14');

  // Quality operations for this department
  const qualityDeptChecks = useMemo(() => {
    return qualityChecks.filter((c) => {
      const op = qualityOps.find((o) => o.id === c.operationId);
      return (
        op?.processDepartment === selectedDepartment ||
        departmentMachines.some((m) => m.machineNumber === c.machineNumber)
      );
    });
  }, [qualityChecks, qualityOps, selectedDepartment, departmentMachines]);

  return (
    <div className="space-y-6">
      {/* Top Bar with Department Selector (Section 1) */}
      <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2 text-xs font-black uppercase tracking-wider text-blue-600">
            <Building className="w-4 h-4" />
            <span>Department Operations Monitor</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight mt-0.5">
            {selectedDepartment}
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Live machine stage allocation, current tasks, targets and handovers
          </p>
        </div>

        {/* Global VIEW DEPARTMENT Dropdown */}
        <div className="flex items-center space-x-2">
          <label className="text-xs font-bold text-slate-600 uppercase tracking-wider whitespace-nowrap">
            View Department:
          </label>
          <div className="relative min-w-[240px] sm:min-w-[280px]">
            <select
              value={selectedDepartment}
              onChange={(e) => {
                onSelectDepartment(e.target.value);
                setQuickKpiFilter(null);
              }}
              className="w-full bg-slate-50 hover:bg-slate-100 border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-blue-500 transition cursor-pointer appearance-none pr-8 shadow-2xs"
            >
              <option value="All Departments">&larr; All Departments (Global Overview)</option>
              {INITIAL_DEPARTMENTS.map((dept) => (
                <option key={dept.code} value={dept.name}>
                  {dept.code} &bull; {dept.name}
                </option>
              ))}
            </select>
            <ChevronDown className="w-4 h-4 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
        </div>
      </div>

      {/* DEPARTMENT KPI CARDS (Section 2) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        {/* Total Machines */}
        <div
          onClick={() => setQuickKpiFilter(null)}
          className={`p-3.5 rounded-2xl border transition cursor-pointer shadow-xs ${
            quickKpiFilter === null ? 'bg-blue-50/70 border-blue-300 ring-2 ring-blue-400/30' : 'bg-white border-slate-200 hover:border-slate-300'
          }`}
        >
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
            Total Machines
          </span>
          <span className="text-2xl font-black text-slate-900 mt-1 block">
            {kpis.totalMachines}
          </span>
          <span className="text-[10px] text-slate-400 mt-0.5 block">In this dept</span>
        </div>

        {/* Assigned Work */}
        <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
            Assigned Work
          </span>
          <span className="text-2xl font-black text-slate-800 mt-1 block">
            {kpis.totalAssignedWork}
          </span>
          <span className="text-[10px] text-slate-400 mt-0.5 block">Shop tasks</span>
        </div>

        {/* Completed */}
        <div
          onClick={() => setQuickKpiFilter('Completed')}
          className={`p-3.5 rounded-2xl border transition cursor-pointer shadow-xs ${
            quickKpiFilter === 'Completed' ? 'bg-emerald-50 border-emerald-300 ring-2 ring-emerald-400/30' : 'bg-white border-slate-200 hover:border-slate-300'
          }`}
        >
          <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider block flex items-center space-x-1">
            <CheckCircle2 className="w-3 h-3" />
            <span>Completed</span>
          </span>
          <span className="text-2xl font-black text-emerald-600 mt-1 block">
            {kpis.completed}
          </span>
          <span className="text-[10px] text-emerald-600/70 mt-0.5 block">Finished orders</span>
        </div>

        {/* In Progress */}
        <div
          onClick={() => setQuickKpiFilter('In Progress')}
          className={`p-3.5 rounded-2xl border transition cursor-pointer shadow-xs ${
            quickKpiFilter === 'In Progress' ? 'bg-blue-50 border-blue-300 ring-2 ring-blue-400/30' : 'bg-white border-slate-200 hover:border-slate-300'
          }`}
        >
          <span className="text-[10px] font-bold text-blue-600 uppercase tracking-wider block flex items-center space-x-1">
            <Clock className="w-3 h-3" />
            <span>In Progress</span>
          </span>
          <span className="text-2xl font-black text-blue-600 mt-1 block">
            {kpis.inProgress}
          </span>
          <span className="text-[10px] text-blue-600/70 mt-0.5 block">On active floor</span>
        </div>

        {/* Pending */}
        <div
          onClick={() => setQuickKpiFilter('Pending')}
          className={`p-3.5 rounded-2xl border transition cursor-pointer shadow-xs ${
            quickKpiFilter === 'Pending' ? 'bg-slate-100 border-slate-300 ring-2 ring-slate-400/30' : 'bg-white border-slate-200 hover:border-slate-300'
          }`}
        >
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
            Pending
          </span>
          <span className="text-2xl font-black text-slate-700 mt-1 block">
            {kpis.pending}
          </span>
          <span className="text-[10px] text-slate-400 mt-0.5 block">Awaiting start</span>
        </div>

        {/* Delayed */}
        <div
          onClick={() => setQuickKpiFilter('Delayed')}
          className={`p-3.5 rounded-2xl border transition cursor-pointer shadow-xs ${
            quickKpiFilter === 'Delayed' ? 'bg-red-50 border-red-300 ring-2 ring-red-400/30' : kpis.delayed > 0 ? 'bg-red-50/70 border-red-200' : 'bg-white border-slate-200 hover:border-slate-300'
          }`}
        >
          <span className="text-[10px] font-bold text-red-600 uppercase tracking-wider block flex items-center space-x-1">
            <AlertTriangle className="w-3 h-3" />
            <span>Delayed</span>
          </span>
          <span className="text-2xl font-black text-red-600 mt-1 block">
            {kpis.delayed}
          </span>
          <span className="text-[10px] text-red-600/80 mt-0.5 block">Requires action</span>
        </div>

        {/* Rework Required */}
        <div
          onClick={() => setQuickKpiFilter('Rework Required')}
          className={`p-3.5 rounded-2xl border transition cursor-pointer shadow-xs ${
            quickKpiFilter === 'Rework Required' || quickKpiFilter === 'On Hold' ? 'bg-amber-50 border-amber-300 ring-2 ring-amber-400/30' : 'bg-white border-slate-200 hover:border-slate-300'
          }`}
        >
          <span className="text-[10px] font-bold text-amber-600 uppercase tracking-wider block">
            Rework Required
          </span>
          <span className="text-2xl font-black text-amber-600 mt-1 block">
            {kpis.onHold}
          </span>
          <span className="text-[10px] text-amber-600/70 mt-0.5 block">Sent for correction</span>
        </div>
      </div>

      {/* TARGET VS ACTUAL BANNER (Daily, Weekly, Monthly) */}
      <div className="bg-gradient-to-r from-slate-900 to-indigo-950 text-white rounded-2xl p-4 sm:p-5 shadow-lg border border-slate-800 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-4 text-center divide-y sm:divide-y-0 sm:divide-x divide-slate-800/80">
        <div>
          <span className="text-[10px] uppercase tracking-wider text-slate-400 block">Today's Target</span>
          <span className="text-xl sm:text-2xl font-black text-white mt-1 block">{kpis.todayTarget}</span>
        </div>
        <div className="pt-2 sm:pt-0">
          <span className="text-[10px] uppercase tracking-wider text-emerald-400 block">Today's Actual</span>
          <span className="text-xl sm:text-2xl font-black text-emerald-400 mt-1 block">{kpis.todayActual}</span>
        </div>
        <div className="pt-2 sm:pt-0">
          <span className="text-[10px] uppercase tracking-wider text-slate-400 block">Weekly Target</span>
          <span className="text-xl sm:text-2xl font-black text-white mt-1 block">{kpis.weeklyTarget}</span>
        </div>
        <div className="pt-2 sm:pt-0">
          <span className="text-[10px] uppercase tracking-wider text-emerald-400 block">Weekly Actual</span>
          <span className="text-xl sm:text-2xl font-black text-emerald-400 mt-1 block">{kpis.weeklyActual}</span>
        </div>
        <div className="pt-2 sm:pt-0">
          <span className="text-[10px] uppercase tracking-wider text-slate-400 block">Monthly Target</span>
          <span className="text-xl sm:text-2xl font-black text-white mt-1 block">{kpis.monthlyTarget}</span>
        </div>
        <div className="pt-2 sm:pt-0">
          <span className="text-[10px] uppercase tracking-wider text-emerald-400 block">Monthly Actual</span>
          <span className="text-xl sm:text-2xl font-black text-emerald-400 mt-1 block">{kpis.monthlyActual}</span>
        </div>
        <div className="pt-2 sm:pt-0">
          <span className="text-[10px] uppercase tracking-wider text-blue-300 block">Achievement</span>
          <span className="text-xl sm:text-2xl font-black text-blue-300 mt-1 block">{kpis.achievementPercent}%</span>
        </div>
      </div>

      {/* SPECIALIZED QUALITY SECTION (If Quality Department) */}
      {isQualityDept && (
        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-indigo-200 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2 text-indigo-900 font-bold text-sm">
              <CheckCircle2 className="w-4 h-4 text-indigo-600" />
              <span>Inward &amp; Shop Floor Quality Oversight ({selectedDepartment})</span>
            </div>
            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700">
              Live Inspection Logs
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
              <span className="text-[10px] font-bold text-slate-400 uppercase block">Total Checks</span>
              <span className="font-black text-slate-900 text-lg">{qualityDeptChecks.length}</span>
            </div>
            <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200">
              <span className="text-[10px] font-bold text-emerald-600 uppercase block">Accepted</span>
              <span className="font-black text-emerald-600 text-lg">
                {qualityDeptChecks.filter((c) => c.status === 'Accept').length}
              </span>
            </div>
            <div className="p-3 bg-red-50 rounded-xl border border-red-200">
              <span className="text-[10px] font-bold text-red-600 uppercase block">Rejected</span>
              <span className="font-black text-red-600 text-lg">
                {qualityDeptChecks.filter((c) => c.status === 'Reject').length}
              </span>
            </div>
            <div className="p-3 bg-amber-50 rounded-xl border border-amber-200">
              <span className="text-[10px] font-bold text-amber-600 uppercase block">Rework Required</span>
              <span className="font-black text-amber-600 text-lg">
                {qualityDeptChecks.filter((c) => c.status === 'Hold').length}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* SECTION 3 & 9: DEPARTMENT MACHINE MONITORING TABLE */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden space-y-4 p-4 sm:p-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-black text-slate-900 flex items-center space-x-2">
              <Cpu className="w-5 h-5 text-blue-600" />
              <span>Department Machine Monitoring ({departmentMachines.length})</span>
            </h3>
            <p className="text-xs text-slate-500">
              Active machines currently located in or assigned to {selectedDepartment}. Click any row to view complete machine journey.
            </p>
          </div>

          {/* Quick Filter Indicator */}
          {quickKpiFilter && (
            <div className="flex items-center space-x-2 text-xs bg-blue-50 border border-blue-200 px-3 py-1.5 rounded-xl">
              <span className="text-blue-700 font-bold">Filtered: {quickKpiFilter}</span>
              <button
                onClick={() => setQuickKpiFilter(null)}
                className="text-blue-500 hover:text-blue-800 font-bold"
              >
                Clear
              </button>
            </div>
          )}
        </div>

        {/* Filters Bar (Section 9) */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search machine no, model, project, customer, employee..."
              className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex items-center space-x-2">
            <Filter className="w-4 h-4 text-slate-400 shrink-0" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-700 outline-none"
            >
              <option value="ALL">All Statuses</option>
              <option value="Not Started">Not Started</option>
              <option value="In Progress">In Progress</option>
              <option value="Completed">Completed</option>
              <option value="Delayed">Delayed</option>
              <option value="Quality Hold">Rework Required (legacy Hold)</option>
              <option value="REWORK_REQUIRED">Rework Required</option>
            </select>
          </div>

          <div className="text-right flex items-center justify-end text-xs text-slate-500 font-semibold">
            Showing {filteredMachines.length} of {departmentMachines.length} machines
          </div>
        </div>

        {/* Table (Section 3) */}
        {filteredMachines.length === 0 ? (
          <div className="p-12 text-center text-xs text-slate-400 bg-slate-50 rounded-2xl border border-slate-200">
            {departmentMachines.length === 0
              ? `No machines currently assigned to ${selectedDepartment}. Real machines will appear when dispatched or planned.`
              : 'No machines match the selected filter criteria.'}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-2xs">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100/90 border-b border-slate-200 text-slate-700 font-bold uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="p-3">Machine No</th>
                  <th className="p-3">Model / Size</th>
                  <th className="p-3">Project / Customer</th>
                  <th className="p-3">Current Work</th>
                  <th className="p-3">Current Process</th>
                  <th className="p-3">Assigned Employee</th>
                  <th className="p-3">Start Date</th>
                  <th className="p-3">Due Date</th>
                  <th className="p-3">Progress</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Delay</th>
                  <th className="p-3">Next Dept</th>
                  <th className="p-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredMachines.map((m) => (
                  <tr
                    key={m.machine.id}
                    onClick={() => onOpenMachineDetail(m.machine)}
                    className="hover:bg-blue-50/40 transition cursor-pointer"
                  >
                    <td className="p-3 font-mono font-black text-blue-600 text-xs">
                      {m.machineNumber}
                    </td>
                    <td className="p-3 font-bold text-slate-800">{m.model}</td>
                    <td className="p-3 text-slate-700">
                      <div>{m.project}</div>
                      <div className="text-[10px] text-slate-400">{m.customer}</div>
                    </td>
                    <td className="p-3 font-semibold text-slate-900 max-w-xs truncate" title={m.currentWork}>
                      {m.currentWork}
                    </td>
                    <td className="p-3 text-slate-700 max-w-xs truncate" title={m.currentProcess}>
                      {m.currentProcess}
                    </td>
                    <td className="p-3 text-slate-700 flex items-center space-x-1">
                      <User className="w-3 h-3 text-slate-400" />
                      <span>{m.assignedEmployee}</span>
                    </td>
                    <td className="p-3 text-slate-600">{m.startDate || '-'}</td>
                    <td className="p-3 text-slate-600">{m.dueDate || '-'}</td>
                    <td className="p-3 font-mono">
                      <div className="flex items-center space-x-1.5">
                        <div className="w-12 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-blue-600 rounded-full"
                            style={{ width: `${Math.min(100, m.progressPercent)}%` }}
                          />
                        </div>
                        <span className="text-[11px] font-bold">{m.progressPercent}%</span>
                      </div>
                    </td>
                    <td className="p-3">
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                          m.currentStatus === 'Completed'
                            ? 'bg-emerald-100 text-emerald-800'
                            : m.isDelayed
                            ? 'bg-red-100 text-red-800'
                            : m.currentStatus === 'In Progress'
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {m.currentStatus}
                      </span>
                    </td>
                    <td className="p-3 font-bold text-red-600">
                      {m.delayDays > 0 ? `${m.delayDays}d` : '-'}
                    </td>
                    <td className="p-3 text-slate-600 max-w-[120px] truncate" title={m.nextDepartment}>
                      {m.nextDepartment}
                    </td>
                    <td className="p-3 text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenMachineDetail(m.machine);
                        }}
                        className="px-2.5 py-1 rounded bg-blue-50 text-blue-700 font-bold hover:bg-blue-100 transition text-[11px]"
                      >
                        View &rarr;
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* SECTION 15: DEPARTMENT MACHINE PROGRESS VISUAL */}
      <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-xs space-y-4">
        <div>
          <h3 className="text-sm font-black text-slate-900 uppercase tracking-wide">
            Machine Production Progress Bars ({departmentMachines.length})
          </h3>
          <p className="text-xs text-slate-500">
            Realtime completion levels for machines actively moving through {selectedDepartment}
          </p>
        </div>

        {departmentMachines.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-400 bg-slate-50 rounded-xl">
            No machines in this department to visualize.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {departmentMachines.map((m) => (
              <div
                key={m.machine.id}
                onClick={() => onOpenMachineDetail(m.machine)}
                className="p-3.5 rounded-xl border border-slate-200 hover:border-blue-400 transition bg-slate-50/50 cursor-pointer space-y-2 shadow-2xs"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono font-black text-slate-900 text-xs">
                    Machine {m.machineNumber}
                  </span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-white border border-slate-200 text-slate-700">
                    {m.model}
                  </span>
                </div>
                <div className="text-[11px] text-slate-600 truncate">
                  Current Process: <strong>{m.currentProcess}</strong>
                </div>
                <div>
                  <div className="flex items-center justify-between text-[10px] text-slate-500 mb-1">
                    <span>Progress</span>
                    <span className="font-bold font-mono text-slate-800">{m.progressPercent}%</span>
                  </div>
                  <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        m.currentStatus === 'Completed'
                          ? 'bg-emerald-500'
                          : m.isDelayed
                          ? 'bg-red-500'
                          : 'bg-blue-600'
                      }`}
                      style={{ width: `${Math.min(100, m.progressPercent)}%` }}
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1 border-t border-slate-200/60">
                  <span>Assigned: {m.assignedEmployee}</span>
                  <span className="text-blue-600 font-bold">Details &rarr;</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* SECTION 11: DEPARTMENT WORK STATUS */}
      <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-xs space-y-4">
        <div>
          <h3 className="text-sm font-black text-slate-900 uppercase tracking-wide">
            Department Work Status ({deptWorkList.length})
          </h3>
          <p className="text-xs text-slate-500">
            Real tasks assigned to operators and technicians in {selectedDepartment}
          </p>
        </div>

        {deptWorkList.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-400 bg-slate-50 rounded-xl">
            No department tasks found. Operators will add daily tasks on the floor.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-2xs">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100 text-slate-700 font-bold uppercase text-[10px]">
                <tr>
                  <th className="p-3">Task / Description</th>
                  <th className="p-3">Machine</th>
                  <th className="p-3">Employee</th>
                  <th className="p-3">Target</th>
                  <th className="p-3">Actual</th>
                  <th className="p-3">Start Date</th>
                  <th className="p-3">Due Date</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Delay Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {deptWorkList.map((w) => (
                  <tr key={w.id} className="hover:bg-slate-50 transition">
                    <td className="p-3 font-semibold text-slate-900">{w.title}</td>
                    <td className="p-3 font-mono font-bold text-blue-600">
                      {w.machineNumber || '-'}
                    </td>
                    <td className="p-3 text-slate-700">{w.assignedTo || 'Unassigned'}</td>
                    <td className="p-3 font-mono">{w.plannedQuantity ?? 1}</td>
                    <td className="p-3 font-mono">{w.actualQuantity ?? 0}</td>
                    <td className="p-3 text-slate-600">{w.createdAt?.split('T')[0]}</td>
                    <td className="p-3 text-slate-600">{w.dueDate || '-'}</td>
                    <td className="p-3">
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                          w.status === 'Completed'
                            ? 'bg-emerald-100 text-emerald-800'
                            : w.status === 'In Progress'
                            ? 'bg-blue-100 text-blue-800'
                            : w.status === 'Delayed'
                            ? 'bg-red-100 text-red-800'
                            : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {w.status}
                      </span>
                    </td>
                    <td className="p-3 text-red-600 font-semibold">{w.delayReason || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* SECTION 12, 13, 14: DAILY, WEEKLY & MONTHLY MONITORING */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Section 12: Today's Department Status */}
        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-xs space-y-3">
          <div className="flex items-center space-x-2 text-slate-900 font-black text-xs uppercase tracking-wide">
            <Calendar className="w-4 h-4 text-blue-600" />
            <span>Today's Department Status</span>
          </div>
          <div className="space-y-2 text-xs">
            <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-slate-200/70">
              <span className="text-slate-600">Today's Target:</span>
              <span className="font-mono font-bold text-slate-900">{kpis.todayTarget}</span>
            </div>
            <div className="flex items-center justify-between p-2 rounded-lg bg-emerald-50/70 border border-emerald-200/70">
              <span className="text-emerald-800">Today's Actual:</span>
              <span className="font-mono font-bold text-emerald-700">{kpis.todayActual}</span>
            </div>
            <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-slate-200/70">
              <span className="text-slate-600">Pending Tasks:</span>
              <span className="font-mono font-bold text-slate-700">{kpis.todayPending}</span>
            </div>
            <div className="flex items-center justify-between p-2 rounded-lg bg-red-50/70 border border-red-200/70">
              <span className="text-red-800">Delayed Tasks:</span>
              <span className="font-mono font-bold text-red-700">{kpis.todayDelayed}</span>
            </div>
            <div className="flex items-center justify-between p-2 rounded-lg bg-blue-50/70 border border-blue-200/70">
              <span className="text-blue-800">New Tasks Created Today:</span>
              <span className="font-mono font-bold text-blue-700">{kpis.todayNew}</span>
            </div>
            <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-slate-200/70">
              <span className="text-slate-600">Completed Handovers:</span>
              <span className="font-mono font-bold text-slate-800">{kpis.todayCompletedHandovers}</span>
            </div>
          </div>
        </div>

        {/* Section 13: Weekly Monitoring */}
        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-xs space-y-3">
          <div className="flex items-center space-x-2 text-slate-900 font-black text-xs uppercase tracking-wide">
            <TrendingUp className="w-4 h-4 text-emerald-600" />
            <span>Weekly Monitoring</span>
          </div>
          <div className="space-y-2.5 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Weekly Target:</span>
              <span className="font-bold text-slate-900 font-mono">{kpis.weeklyTarget}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Weekly Actual:</span>
              <span className="font-bold text-emerald-600 font-mono">{kpis.weeklyActual}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Remaining:</span>
              <span className="font-bold text-slate-700 font-mono">
                {Math.max(0, kpis.weeklyTarget - kpis.weeklyActual)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Weekly Achievement:</span>
              <span className="font-bold text-blue-600 font-mono">
                {kpis.weeklyTarget > 0
                  ? `${Math.round((kpis.weeklyActual / kpis.weeklyTarget) * 100)}%`
                  : '0%'}
              </span>
            </div>
            {/* Visual comparison bar */}
            <div className="pt-2">
              <div className="text-[10px] text-slate-400 mb-1">Target vs Actual Bar</div>
              <div className="h-3 bg-slate-100 rounded-full overflow-hidden flex">
                <div
                  className="bg-emerald-500 h-full rounded-full transition-all"
                  style={{
                    width: `${
                      kpis.weeklyTarget > 0
                        ? Math.min(100, (kpis.weeklyActual / kpis.weeklyTarget) * 100)
                        : 0
                    }%`,
                  }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Section 14: Monthly Monitoring */}
        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2 text-slate-900 font-black text-xs uppercase tracking-wide">
              <Layers className="w-4 h-4 text-purple-600" />
              <span>Monthly Monitoring</span>
            </div>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="text-[11px] font-bold border border-slate-200 rounded-lg px-2 py-1 bg-slate-50"
            >
              {['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'].map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
          <div className="space-y-2.5 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Monthly Target:</span>
              <span className="font-bold text-slate-900 font-mono">{kpis.monthlyTarget}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Monthly Actual:</span>
              <span className="font-bold text-emerald-600 font-mono">{kpis.monthlyActual}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Remaining:</span>
              <span className="font-bold text-slate-700 font-mono">
                {Math.max(0, kpis.monthlyTarget - kpis.monthlyActual)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Monthly Achievement:</span>
              <span className="font-bold text-purple-600 font-mono">{kpis.achievementPercent}%</span>
            </div>
            {/* Visual comparison bar */}
            <div className="pt-2">
              <div className="text-[10px] text-slate-400 mb-1">Target vs Actual Bar</div>
              <div className="h-3 bg-slate-100 rounded-full overflow-hidden flex">
                <div
                  className="bg-purple-600 h-full rounded-full transition-all"
                  style={{ width: `${Math.min(100, kpis.achievementPercent)}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
