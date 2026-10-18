import React, { useState, useMemo } from 'react';
import {
  CheckCircle2,
  Clock,
  AlertTriangle,
  Flame,
  Cpu,
  Layers,
  BarChart3,
  Calendar,
  ArrowRight,
  TrendingUp,
  ShieldAlert,
  Building,
  ChevronDown,
  User,
  ArrowRightLeft,
  Eye,
  Check,
} from 'lucide-react';
import {
  AuditLogEntry,
  Department,
  DepartmentHandover,
  DepartmentWork,
  Machine,
  MonthlyPlan,
  QualityDailyCheck,
  QualityOperation,
  QualityRejection,
  WeeklyPlan,
} from '../types';
import { INITIAL_DEPARTMENTS } from '../constants';
import { AdminDepartmentMonitoringView } from '../components/AdminDepartmentMonitoringView';
import { resolveMachineInfo } from '../utils/machineMonitoring';

interface DashboardViewProps {
  machines: Machine[];
  monthlyPlans: MonthlyPlan[];
  weeklyPlans?: WeeklyPlan[];
  departmentWork: DepartmentWork[];
  qualityChecks: QualityDailyCheck[];
  qualityRejections: QualityRejection[];
  qualityOps?: QualityOperation[];
  handovers?: DepartmentHandover[];
  auditLogs: AuditLogEntry[];
  selectedDepartment?: string;
  onSelectDepartment?: (dept: string) => void;
  onSelectView: (view: string) => void;
  onSelectMachine: (machine: Machine) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  machines,
  monthlyPlans,
  weeklyPlans = [],
  departmentWork,
  qualityChecks,
  qualityRejections,
  qualityOps = [],
  handovers = [],
  auditLogs,
  selectedDepartment = 'All Departments',
  onSelectDepartment,
  onSelectView,
  onSelectMachine,
}) => {
  const [internalDept, setInternalDept] = useState<string>(selectedDepartment);
  const currentDept = onSelectDepartment ? selectedDepartment : internalDept;
  const setDept = onSelectDepartment || setInternalDept;

  // 3b. Active Plan Stats (Section 10) - Defaults to October 2026, allows switching to September 2026 or any historical month
  const [selectedPlanMonth, setSelectedPlanMonth] = useState('October 2026');

  const activePlanMachines = useMemo(() => {
    const [selMonth, selYear] = selectedPlanMonth.split(' ');
    return machines.filter((m) => {
      const matchMonth =
        (m.planMonth && m.planMonth.toLowerCase() === selMonth.toLowerCase()) ||
        (m.planName && m.planName.toLowerCase().includes(selMonth.toLowerCase())) ||
        m.id?.toLowerCase().includes(`${selMonth.toLowerCase()}-${selYear || '2026'}`);
      const matchYear = !selYear || !m.planYear || m.planYear === selYear;
      return matchMonth && matchYear;
    });
  }, [machines, selectedPlanMonth]);

  // If a specific department is chosen, render the full dedicated Department Dashboard (Section 2-15)
  if (currentDept !== 'All Departments') {
    return (
      <AdminDepartmentMonitoringView
        selectedDepartment={currentDept}
        onSelectDepartment={setDept}
        machines={machines}
        departmentWork={departmentWork}
        handovers={handovers}
        qualityChecks={qualityChecks}
        qualityRejections={qualityRejections}
        qualityOps={qualityOps}
        monthlyPlans={monthlyPlans}
        weeklyPlans={weeklyPlans}
        onOpenMachineDetail={onSelectMachine}
      />
    );
  }

  // =========================================================================
  // ALL DEPARTMENTS / PLANT-WIDE EXECUTIVE MONITORING (Section 34)
  // =========================================================================

  // 1. Live calculations for Company Overview
  const totalWork = departmentWork.length;
  const completedWork = departmentWork.filter((w) => w.status === 'Completed').length;
  const inProgressWork = departmentWork.filter((w) => w.status === 'In Progress').length;
  const pendingWork = departmentWork.filter((w) => w.status === 'Pending').length;
  const delayedWork = departmentWork.filter((w) => w.status === 'Delayed').length;
  const remainingWork = pendingWork + inProgressWork + delayedWork;

  // 2. Red Zone / Action Required Items (Section 29)
  const todayStr = new Date().toISOString().split('T')[0];
  const overdueMachines = machines.filter((m) => {
    if (!m.plannedDate || m.currentStatus === 'Completed') return false;
    return new Date(m.plannedDate).getTime() < new Date(todayStr).getTime();
  });
  const delayedWorkList = departmentWork.filter((w) => w.status === 'Delayed');
  const activeRejections = qualityRejections.filter(
    (r) => r.status !== 'Accepted' && r.status !== 'Closed'
  );
  const pendingHandovers = handovers.filter((h) => h.status === 'Pending Acceptance');
  const holdMachines = machines.filter(
    (m) => m.currentStatus === 'Quality Hold' || m.currentStatus === 'Delayed'
  );

  const totalActionRequired =
    overdueMachines.length +
    delayedWorkList.length +
    activeRejections.length +
    pendingHandovers.length +
    holdMachines.length;

  // 3. Target vs Actual aggregate
  const targetQuantityTotal = monthlyPlans.reduce(
    (sum, p) => sum + (Number(p.plannedQuantity) || 0),
    0
  );
  const actualQuantityTotal = monthlyPlans.reduce(
    (sum, p) => sum + (Number(p.actualQuantity) || 0),
    0
  );
  const achievementPct =
    targetQuantityTotal > 0
      ? Math.round((actualQuantityTotal / targetQuantityTotal) * 100)
      : 0;

  const planTotalMachines = activePlanMachines.length;
  const planTotalQuantity = activePlanMachines.reduce((sum, m) => sum + (m.quantity || 1), 0);
  const planCompleted = activePlanMachines.filter(
    (m) => m.currentStatus === 'Completed' || (m.overallProgressPercent || 0) >= 100
  ).length;
  const planInProgress = activePlanMachines.filter(
    (m) =>
      m.currentStatus === 'In Progress' ||
      ((m.overallProgressPercent || 0) > 0 && (m.overallProgressPercent || 0) < 100)
  ).length;
  const planPending = activePlanMachines.filter(
    (m) =>
      m.currentStatus === 'Not Started' ||
      m.currentStatus === 'Pending' ||
      (!m.currentStatus && (m.overallProgressPercent || 0) === 0)
  ).length;
  const planDelayed = activePlanMachines.filter(
    (m) =>
      m.currentStatus === 'Delayed' ||
      (m.plannedDate && new Date(m.plannedDate) < new Date() && m.currentStatus !== 'Completed')
  ).length;
  const planOnHold = activePlanMachines.filter(
    (m) =>
      m.currentStatus === 'Quality Hold' ||
      (m.currentStatus as string) === 'REWORK_REQUIRED' ||
      m.currentStatus === 'On Hold' ||
      (m.currentStatus as string)?.toLowerCase().includes('rework')
  ).length;

  // 4. Section 25: Department Comparison Matrix
  const departmentOverviewRows = INITIAL_DEPARTMENTS.map((dept) => {
    const deptWork = departmentWork.filter((w) => w.department === dept.name);
    const assignedMachines = machines.filter(
      (m) =>
        m.currentDepartment === dept.name ||
        deptWork.some((w) => w.machineNumber === m.machineNumber)
    );
    const completed = deptWork.filter((w) => w.status === 'Completed').length;
    const inProgress = deptWork.filter((w) => w.status === 'In Progress').length;
    const pending = deptWork.filter((w) => w.status === 'Pending').length;
    const delayed = deptWork.filter((w) => w.status === 'Delayed').length;

    const deptPlans = monthlyPlans.filter((p) => p.department === dept.name);
    const target = deptPlans.reduce((sum, p) => sum + (Number(p.plannedQuantity) || 0), 0);
    const actual = deptPlans.reduce((sum, p) => sum + (Number(p.actualQuantity) || 0), 0);
    const ach = target > 0 ? Math.round((actual / target) * 100) : 0;

    return {
      code: dept.code,
      name: dept.name,
      machinesCount: assignedMachines.length,
      target,
      actual,
      achievementPct: ach,
      completed,
      inProgress,
      pending,
      delayed,
    };
  });

  // 5. Resolved Machines for the quick monitoring table
  const resolvedMachines = machines.map((m) =>
    resolveMachineInfo(
      m,
      departmentWork,
      handovers,
      qualityChecks,
      qualityRejections,
      qualityOps
    )
  );

  // Requirement 10: Top KPI Cards Calculations
  const totalPlannedMachines = machines.length || monthlyPlans.length;
  const totalInProgressMachines = machines.filter(
    (m) =>
      m.status === 'IN_PROGRESS' ||
      m.currentStatus === 'In Progress' ||
      ((m.progress || 0) > 0 && (m.progress || 0) < 100)
  ).length;
  const totalCompletedMachines = machines.filter(
    (m) => m.status === 'COMPLETED' || m.currentStatus === 'Completed' || (m.progress || 0) >= 100
  ).length;

  const totalDelayedMachines = machines.filter((m) => {
    if (m.status === 'DELAYED' || m.currentStatus === 'Delayed' || m.delayReason) return true;
    const target = m.targetDate || m.plannedDueDate || m.dueDate || m.plannedDate;
    if (target && new Date(target).getTime() < new Date().setHours(0, 0, 0, 0) && (m.progress || 0) < 100) {
      return true;
    }
    return false;
  }).length;

  // Department with Most Delays
  const deptDelayCounts: Record<string, number> = {};
  machines.forEach((m) => {
    const target = m.targetDate || m.plannedDueDate || m.dueDate || m.plannedDate;
    const isLate =
      m.status === 'DELAYED' ||
      m.currentStatus === 'Delayed' ||
      !!m.delayReason ||
      (target && new Date(target).getTime() < new Date().setHours(0, 0, 0, 0) && (m.progress || 0) < 100);
    if (isLate) {
      const dept = m.responsibleDepartment || m.currentDepartment || 'Design';
      deptDelayCounts[dept] = (deptDelayCounts[dept] || 0) + 1;
    }
  });
  departmentWork
    .filter((w) => w.status === 'Delayed')
    .forEach((w) => {
      deptDelayCounts[w.department] = (deptDelayCounts[w.department] || 0) + 1;
    });

  let deptWithMostDelays = 'None';
  let maxDelaysCount = 0;
  Object.entries(deptDelayCounts).forEach(([dept, count]) => {
    if (count > maxDelaysCount) {
      maxDelaysCount = count;
      deptWithMostDelays = dept;
    }
  });

  const monthlyTargetAchievementPct = achievementPct;

  return (
    <div className="space-y-6">
      {/* SECTION 1: GLOBAL VIEW DEPARTMENT HEADER & SELECTOR */}
      <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2 text-xs font-black uppercase tracking-wider text-blue-600">
            <Building className="w-4 h-4" />
            <span>Accurate Gauging &amp; Instruments &bull; Universal Factory Management</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight mt-0.5">
            Admin Plant Overview &amp; Department Monitor
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Live database visibility of all 20 departments, machine movements, and operational targets
          </p>
        </div>

        {/* VIEW DEPARTMENT Global Dropdown (Section 1) */}
        <div className="flex items-center space-x-2">
          <label className="text-xs font-bold text-slate-600 uppercase tracking-wider whitespace-nowrap">
            View Department:
          </label>
          <div className="relative min-w-[240px] sm:min-w-[280px]">
            <select
              value={currentDept}
              onChange={(e) => setDept(e.target.value)}
              className="w-full bg-slate-50 hover:bg-slate-100 border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-blue-500 transition cursor-pointer appearance-none pr-8 shadow-2xs"
            >
              <option value="All Departments">All Departments (Plant Overview)</option>
              {INITIAL_DEPARTMENTS.map((d) => (
                <option key={d.code} value={d.name}>
                  {d.code} &bull; {d.name}
                </option>
              ))}
            </select>
            <ChevronDown className="w-4 h-4 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
        </div>
      </div>

      {/* REQUIREMENT 10: TOP 6 KPI CARDS */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* 1. Total Planned Machines */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
            <Cpu className="w-3.5 h-3.5 text-blue-600" />
            <span>Planned Machines</span>
          </div>
          <div className="text-2xl font-black text-slate-900 mt-1">{totalPlannedMachines}</div>
          <div className="text-[11px] text-slate-400 mt-0.5">Master Plan Target</div>
        </div>

        {/* 2. Total In Progress Machines */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <div className="text-[11px] font-bold text-blue-600 uppercase tracking-wider flex items-center gap-1">
            <Clock className="w-3.5 h-3.5" />
            <span>In Progress</span>
          </div>
          <div className="text-2xl font-black text-blue-600 mt-1">{totalInProgressMachines}</div>
          <div className="text-[11px] text-slate-400 mt-0.5">Active Shop Floor</div>
        </div>

        {/* 3. Total Completed Machines */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <div className="text-[11px] font-bold text-emerald-600 uppercase tracking-wider flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Completed</span>
          </div>
          <div className="text-2xl font-black text-emerald-600 mt-1">{totalCompletedMachines}</div>
          <div className="text-[11px] text-slate-400 mt-0.5">100% Finalized</div>
        </div>

        {/* 4. Total Delayed Machines */}
        <div
          className={`p-4 rounded-2xl border shadow-xs ${
            totalDelayedMachines > 0 ? 'bg-rose-50/80 border-rose-200' : 'bg-white border-slate-200'
          }`}
        >
          <div className="text-[11px] font-bold text-rose-600 uppercase tracking-wider flex items-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>Delayed Machines</span>
          </div>
          <div className="text-2xl font-black text-rose-600 mt-1">{totalDelayedMachines}</div>
          <div className="text-[11px] text-rose-500 mt-0.5 font-medium">Overdue Target</div>
        </div>

        {/* 5. Department with Most Delays */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <div className="text-[11px] font-bold text-amber-700 uppercase tracking-wider flex items-center gap-1">
            <Building className="w-3.5 h-3.5 text-amber-600" />
            <span>Most Delays</span>
          </div>
          <div className="text-xs font-black text-slate-900 mt-1 truncate" title={deptWithMostDelays}>
            {deptWithMostDelays}
          </div>
          <div className="text-[11px] text-amber-600 mt-0.5 font-semibold">
            {maxDelaysCount > 0 ? `${maxDelaysCount} delayed units` : 'Zero delays reported'}
          </div>
        </div>

        {/* 6. Monthly Target Achievement % */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <div className="text-[11px] font-bold text-indigo-600 uppercase tracking-wider flex items-center gap-1">
            <TrendingUp className="w-3.5 h-3.5" />
            <span>Achievement %</span>
          </div>
          <div className="text-2xl font-black text-indigo-600 mt-1">{monthlyTargetAchievementPct}%</div>
          <div className="text-[11px] text-slate-400 mt-0.5">Actual vs Target</div>
        </div>
      </div>

      {/* SECTION 10: OFFICIAL MANUFACTURING PLAN DASHBOARD */}
      <div className="bg-white rounded-2xl p-5 border-2 border-indigo-200 shadow-sm space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-indigo-100">
          <div>
            <div className="flex items-center space-x-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[11px] font-black uppercase tracking-wider text-indigo-700">
                Official Production Schedule &bull; Master Plan
              </span>
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <h3 className="text-base sm:text-lg font-black text-slate-900">
                {selectedPlanMonth} Production &amp; Assembly Plan
              </h3>
            </div>
            <p className="text-xs text-slate-500">
              Live database tracking of all {planTotalMachines} CMM machines across all factory departments
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* Month selector for the plan */}
            <select
              value={selectedPlanMonth}
              onChange={(e) => setSelectedPlanMonth(e.target.value)}
              className="bg-indigo-50/80 hover:bg-indigo-100 border border-indigo-200 text-indigo-800 text-xs font-bold px-3 py-1.5 rounded-xl outline-none transition cursor-pointer"
            >
              <option value="October 2026">October 2026 (Active Master Plan &bull; 25 CMMs)</option>
              <option value="September 2026">September 2026 (26 CMMs)</option>
              <option value="August 2026">August 2026</option>
              <option value="November 2026">November 2026</option>
              <option value="December 2026">December 2026</option>
            </select>
            <button
              onClick={() => onSelectView('planning')}
              className="text-xs font-bold px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs transition"
            >
              Open Plan &rarr;
            </button>
          </div>
        </div>

        {/* The 7 Required Plan Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 pt-1">
          {/* Total Machines */}
          <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
              Total Machines
            </span>
            <span className="text-2xl font-black text-slate-900 block mt-0.5 font-mono">
              {planTotalMachines}
            </span>
            <span className="text-[10px] text-slate-400 font-medium">All {planTotalMachines} CMMs in DB</span>
          </div>

          {/* Total Quantity */}
          <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
              Total Quantity
            </span>
            <span className="text-2xl font-black text-indigo-600 block mt-0.5 font-mono">
              {planTotalQuantity}
            </span>
            <span className="text-[10px] text-slate-400 font-medium">1 Qty / Machine</span>
          </div>

          {/* Completed */}
          <div className="bg-emerald-50/70 p-3.5 rounded-xl border border-emerald-200">
            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 block">
              Completed
            </span>
            <span className="text-2xl font-black text-emerald-700 block mt-0.5 font-mono">
              {planCompleted}
            </span>
            <span className="text-[10px] text-emerald-600 font-medium">Fully finalized</span>
          </div>

          {/* In Progress */}
          <div className="bg-blue-50/70 p-3.5 rounded-xl border border-blue-200">
            <span className="text-[10px] font-bold uppercase tracking-wider text-blue-700 block">
              In Progress
            </span>
            <span className="text-2xl font-black text-blue-700 block mt-0.5 font-mono">
              {planInProgress}
            </span>
            <span className="text-[10px] text-blue-600 font-medium">Under active work</span>
          </div>

          {/* Pending */}
          <div className="bg-amber-50/70 p-3.5 rounded-xl border border-amber-200">
            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700 block">
              Pending
            </span>
            <span className="text-2xl font-black text-amber-700 block mt-0.5 font-mono">
              {planPending}
            </span>
            <span className="text-[10px] text-amber-600 font-medium">Awaiting shop start</span>
          </div>

          {/* Delayed */}
          <div className="bg-red-50/70 p-3.5 rounded-xl border border-red-200">
            <span className="text-[10px] font-bold uppercase tracking-wider text-red-700 block">
              Delayed
            </span>
            <span className="text-2xl font-black text-red-700 block mt-0.5 font-mono">
              {planDelayed}
            </span>
            <span className="text-[10px] text-red-600 font-medium">Schedule delay</span>
          </div>

          {/* Rework Required */}
          <div className="bg-purple-50/70 p-3.5 rounded-xl border border-purple-200">
            <span className="text-[10px] font-bold uppercase tracking-wider text-purple-700 block">
              Rework Required
            </span>
            <span className="text-2xl font-black text-purple-700 block mt-0.5 font-mono">
              {planOnHold}
            </span>
            <span className="text-[10px] text-purple-600 font-medium">Sent for correction</span>
          </div>
        </div>
      </div>

      {/* TARGET VS ACTUAL BANNER */}
      <div className="bg-gradient-to-r from-slate-900 to-indigo-950 text-white rounded-2xl p-5 shadow-lg border border-slate-800 flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="flex items-center space-x-4">
          <div className="w-12 h-12 rounded-xl bg-blue-600/30 border border-blue-400/40 flex items-center justify-center text-blue-300">
            <TrendingUp className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs uppercase tracking-widest text-blue-300 font-bold">
              Target vs Actual Performance
            </div>
            <div className="text-lg sm:text-xl font-bold mt-0.5">
              Monthly Production Achievement
            </div>
            <div className="text-xs text-slate-400 mt-1">
              Aggregated strictly from authorized monthly planning records in Firestore
            </div>
          </div>
        </div>

        <div className="flex items-center gap-6 sm:gap-10">
          <div className="text-center">
            <div className="text-xs text-slate-400">Total Target</div>
            <div className="text-xl sm:text-2xl font-black text-white">{targetQuantityTotal}</div>
          </div>
          <div className="text-center">
            <div className="text-xs text-slate-400">Total Actual</div>
            <div className="text-xl sm:text-2xl font-black text-emerald-400">{actualQuantityTotal}</div>
          </div>
          <div className="text-center">
            <div className="text-xs text-slate-400">Achievement</div>
            <div className="text-xl sm:text-2xl font-black text-blue-400">{achievementPct}%</div>
          </div>
        </div>
      </div>

      {/* SECTION 29: ADMIN ACTION REQUIRED / RED ZONE */}
      {totalActionRequired > 0 ? (
        <div className="bg-red-50/80 border border-red-200 rounded-2xl p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2 text-red-900 font-bold text-sm sm:text-base">
              <ShieldAlert className="w-5 h-5 text-red-600" />
              <span>Admin Action Required &mdash; Red Zone ({totalActionRequired})</span>
            </div>
            <span className="text-xs font-semibold text-red-700 bg-red-100 px-2.5 py-0.5 rounded-full">
              Urgent Shop Floor Follow-up
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {/* Overdue machines */}
            {overdueMachines.map((m) => (
              <div
                key={`overdue_${m.id}`}
                onClick={() => onSelectMachine(m)}
                className="bg-white p-3.5 rounded-xl border border-red-200 shadow-2xs hover:border-red-400 cursor-pointer text-xs space-y-1.5"
              >
                <div className="flex items-start justify-between">
                  <span className="font-mono font-black text-slate-900">Machine {m.machineNumber}</span>
                  <span className="text-[10px] font-bold bg-red-100 text-red-800 px-2 py-0.5 rounded">
                    Overdue Target
                  </span>
                </div>
                <div className="text-slate-600 text-[11px]">
                  Model: <strong>{m.model}</strong> &bull; Dept: <strong>{m.currentDepartment}</strong>
                </div>
                <div className="text-red-700 font-semibold bg-red-50 p-1.5 rounded text-[11px]">
                  Planned Date: {m.plannedDate} (Passed)
                </div>
              </div>
            ))}

            {/* Delayed tasks */}
            {delayedWorkList.map((w) => (
              <div
                key={`delay_${w.id}`}
                className="bg-white p-3.5 rounded-xl border border-red-200 shadow-2xs text-xs space-y-1.5"
              >
                <div className="flex items-start justify-between">
                  <span className="font-bold text-slate-900 line-clamp-1">{w.title}</span>
                  <span className="text-[10px] font-bold bg-red-100 text-red-800 px-2 py-0.5 rounded">
                    Delayed Task
                  </span>
                </div>
                <div className="text-slate-600 text-[11px]">
                  Dept: <strong>{w.department}</strong> {w.machineNumber ? `• Machine ${w.machineNumber}` : ''}
                </div>
                <div className="text-red-800 font-medium bg-red-50 p-2 rounded text-xs">
                  Reason: {w.delayReason || 'Not specified'}
                </div>
              </div>
            ))}

            {/* Pending Handovers */}
            {pendingHandovers.map((h) => (
              <div
                key={`hand_${h.id}`}
                className="bg-white p-3.5 rounded-xl border border-amber-200 shadow-2xs text-xs space-y-1.5"
              >
                <div className="flex items-start justify-between">
                  <span className="font-mono font-bold text-slate-900">Machine {h.machineNumber}</span>
                  <span className="text-[10px] font-bold bg-amber-100 text-amber-800 px-2 py-0.5 rounded">
                    Pending Handover
                  </span>
                </div>
                <div className="text-slate-600 text-[11px]">
                  From: <strong>{h.sendingDepartment}</strong> &rarr; To: <strong>{h.receivingDepartment}</strong>
                </div>
                <div className="text-amber-800 font-medium bg-amber-50 p-1.5 rounded text-[11px]">
                  Submitted on {h.date} by {h.createdBy || 'Authorized Staff'}
                </div>
              </div>
            ))}

            {/* Quality Rejections */}
            {activeRejections.map((r) => (
              <div
                key={`rej_${r.id}`}
                className="bg-white p-3.5 rounded-xl border border-red-200 shadow-2xs text-xs space-y-1.5"
              >
                <div className="flex items-start justify-between">
                  <span className="font-bold text-slate-900">Machine {r.machineNumber}</span>
                  <span className="text-[10px] font-bold bg-red-100 text-red-800 px-2 py-0.5 rounded">
                    Quality Rejection
                  </span>
                </div>
                <div className="text-slate-600 text-[11px]">{r.operationName} &bull; Dept: {r.concernedDepartment}</div>
                <div className="text-red-800 font-medium bg-red-50 p-2 rounded text-xs">
                  {r.rejectionReason}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex items-center space-x-3 text-emerald-800 text-xs">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <div>
            <strong>Zero Action Required:</strong> All machines, operations, and shop floor handovers are currently on schedule.
          </div>
        </div>
      )}

      {/* SECTION 25: ADMIN DEPARTMENT COMPARISON TABLE */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-black text-slate-900 flex items-center space-x-2">
              <Building className="w-5 h-5 text-indigo-600" />
              <span>Department Overview &amp; Comparison Table (20 Divisions)</span>
            </h3>
            <p className="text-xs text-slate-500">
              Live factory status by department. Click any row to immediately open that department's detailed dashboard.
            </p>
          </div>
          <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-xl">
            Click row to inspect
          </span>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-2xs">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-100/90 border-b border-slate-200 text-slate-700 font-bold uppercase tracking-wider text-[10px]">
              <tr>
                <th className="p-3">Dept Code</th>
                <th className="p-3">Department Name</th>
                <th className="p-3 text-center">Machines</th>
                <th className="p-3 text-center">Target Qty</th>
                <th className="p-3 text-center">Actual Qty</th>
                <th className="p-3 text-center">Achievement %</th>
                <th className="p-3 text-center">Completed</th>
                <th className="p-3 text-center">In Progress</th>
                <th className="p-3 text-center">Pending</th>
                <th className="p-3 text-center">Delayed</th>
                <th className="p-3 text-right">Inspect</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {departmentOverviewRows.map((row) => (
                <tr
                  key={row.code}
                  onClick={() => setDept(row.name)}
                  className="hover:bg-indigo-50/40 transition cursor-pointer"
                >
                  <td className="p-3 font-mono font-black text-indigo-700">{row.code}</td>
                  <td className="p-3 font-bold text-slate-900">{row.name}</td>
                  <td className="p-3 text-center font-mono font-bold text-slate-800">
                    {row.machinesCount}
                  </td>
                  <td className="p-3 text-center font-mono text-slate-600">{row.target}</td>
                  <td className="p-3 text-center font-mono text-emerald-600 font-bold">
                    {row.actual}
                  </td>
                  <td className="p-3 text-center">
                    <span
                      className={`font-mono font-bold px-2 py-0.5 rounded text-[11px] ${
                        row.achievementPct >= 80
                          ? 'bg-emerald-100 text-emerald-800'
                          : row.achievementPct > 0
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {row.achievementPct}%
                    </span>
                  </td>
                  <td className="p-3 text-center font-mono text-emerald-600">{row.completed}</td>
                  <td className="p-3 text-center font-mono text-blue-600">{row.inProgress}</td>
                  <td className="p-3 text-center font-mono text-slate-600">{row.pending}</td>
                  <td className="p-3 text-center font-mono font-bold text-red-600">
                    {row.delayed > 0 ? row.delayed : '-'}
                  </td>
                  <td className="p-3 text-right">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setDept(row.name);
                      }}
                      className="px-2.5 py-1 rounded bg-indigo-50 text-indigo-700 font-bold hover:bg-indigo-100 transition text-[11px]"
                    >
                      Open &rarr;
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* SECTION 16: ALL MACHINE MONITORING TABLE (Section 16 Preview & Quick Table) */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-black text-slate-900 flex items-center space-x-2">
              <Cpu className="w-5 h-5 text-blue-600" />
              <span>Plant Machines Active Tracking ({machines.length})</span>
            </h3>
            <p className="text-xs text-slate-500">
              Complete machine journey, current work, assigned technician, and delay status
            </p>
          </div>
          <button
            onClick={() => onSelectView('all_machines')}
            className="text-xs font-bold text-blue-600 hover:text-blue-800 flex items-center space-x-1"
          >
            <span>Open Full Machine Tracking Board</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {resolvedMachines.length === 0 ? (
          <div className="py-12 text-center text-xs text-slate-400 bg-slate-50 rounded-xl">
            No machines currently in the database. Add or import machines to begin live tracking.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-2xs">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100 text-slate-700 font-bold uppercase text-[10px]">
                <tr>
                  <th className="p-3">Machine No</th>
                  <th className="p-3">Model / Size</th>
                  <th className="p-3">Project / Customer</th>
                  <th className="p-3">Current Dept</th>
                  <th className="p-3">Current Process</th>
                  <th className="p-3">Current Work</th>
                  <th className="p-3">Employee</th>
                  <th className="p-3">Progress</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Due Date</th>
                  <th className="p-3">Delay</th>
                  <th className="p-3">Next Dept</th>
                  <th className="p-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {resolvedMachines.slice(0, 8).map((m) => (
                  <tr
                    key={m.machine.id}
                    onClick={() => onSelectMachine(m.machine)}
                    className="hover:bg-blue-50/40 transition cursor-pointer"
                  >
                    <td className="p-3 font-mono font-black text-blue-600">{m.machineNumber}</td>
                    <td className="p-3 font-bold text-slate-800">{m.model}</td>
                    <td className="p-3 text-slate-700">
                      <div>{m.project}</div>
                      <div className="text-[10px] text-slate-400">{m.customer}</div>
                    </td>
                    <td className="p-3 font-semibold text-indigo-700 max-w-[130px] truncate" title={m.currentDepartment}>
                      {m.currentDepartment}
                    </td>
                    <td className="p-3 text-slate-700 max-w-[120px] truncate" title={m.currentProcess}>
                      {m.currentProcess}
                    </td>
                    <td className="p-3 font-medium text-slate-900 max-w-[140px] truncate" title={m.currentWork}>
                      {m.currentWork}
                    </td>
                    <td className="p-3 text-slate-700 flex items-center space-x-1">
                      <User className="w-3 h-3 text-slate-400" />
                      <span className="truncate max-w-[90px]">{m.assignedEmployee}</span>
                    </td>
                    <td className="p-3 font-mono">
                      <div className="flex items-center space-x-1">
                        <div className="w-8 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-blue-600 rounded-full"
                            style={{ width: `${Math.min(100, m.progressPercent)}%` }}
                          />
                        </div>
                        <span className="text-[10px] font-bold">{m.progressPercent}%</span>
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
                    <td className="p-3 text-slate-600">{m.dueDate || '-'}</td>
                    <td className="p-3 font-bold text-red-600">
                      {m.delayDays > 0 ? `${m.delayDays}d` : '-'}
                    </td>
                    <td className="p-3 text-slate-600 max-w-[110px] truncate" title={m.nextDepartment}>
                      {m.nextDepartment}
                    </td>
                    <td className="p-3 text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectMachine(m.machine);
                        }}
                        className="px-2.5 py-1 rounded bg-blue-50 text-blue-700 font-bold hover:bg-blue-100 transition text-[11px]"
                      >
                        Inspect &rarr;
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* RECENT FACTORY ACTIVITY STREAM */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
        <div className="flex items-center justify-between mb-3">
          <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">
            Live Factory Activity Trail &amp; Audit Log
          </div>
          <span className="text-[11px] text-slate-400">Recorded in real-time</span>
        </div>

        {auditLogs.length === 0 ? (
          <div className="py-6 text-center text-xs text-slate-400">
            No audit records created yet. System is awaiting user actions.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {auditLogs.slice(0, 6).map((log) => (
              <div key={log.id} className="py-2.5 flex items-center justify-between text-xs">
                <div className="flex items-center space-x-3">
                  <span className="font-mono text-[10px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded">
                    {log.module}
                  </span>
                  <span className="font-semibold text-slate-800">{log.action}</span>
                  <span className="text-slate-500 truncate max-w-md hidden sm:inline">
                    {log.newValue}
                  </span>
                </div>
                <div className="text-right text-slate-400 text-[11px] shrink-0 font-mono">
                  {log.userEmail} &bull; {log.date} {log.time}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
