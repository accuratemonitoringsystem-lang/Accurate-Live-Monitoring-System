import React, { useState, useMemo } from 'react';
import {
  Target,
  TrendingUp,
  BarChart3,
  Filter,
  Download,
  AlertTriangle,
  Cpu,
  Clock,
  CheckCircle2,
  AlertCircle,
  Building,
  Search,
} from 'lucide-react';
import { Department, Machine, MonthlyPlan, WeeklyPlan, YearlyPlan } from '../../types';
import { exportToExcel } from '../../utils/excel';

interface PlanVsActualModuleProps {
  departments: Department[];
  yearlyPlans: YearlyPlan[];
  monthlyPlans: MonthlyPlan[];
  weeklyPlans: WeeklyPlan[];
  machines?: Machine[];
  selectedDepartment?: string;
}

export const PlanVsActualModule: React.FC<PlanVsActualModuleProps> = ({
  departments,
  yearlyPlans,
  monthlyPlans,
  weeklyPlans,
  machines = [],
  selectedDepartment,
}) => {
  const [filterMonth, setFilterMonth] = useState('');
  const [filterYear, setFilterYear] = useState('2026');
  const [filterDept, setFilterDept] = useState(
    selectedDepartment && selectedDepartment !== 'All Departments' ? selectedDepartment : ''
  );
  const [searchMachine, setSearchMachine] = useState('');
  const [activeTab, setActiveTab] = useState<'departments' | 'machines' | 'delays'>('departments');

  // Department-wise aggregation
  const deptBreakdown = useMemo(() => {
    const map: Record<
      string,
      {
        name: string;
        monthlyTarget: number;
        monthlyActual: number;
        weeklyTarget: number;
        weeklyActual: number;
      }
    > = {};

    departments.forEach((d) => {
      map[d.name] = {
        name: d.name,
        monthlyTarget: 0,
        monthlyActual: 0,
        weeklyTarget: 0,
        weeklyActual: 0,
      };
    });

    monthlyPlans.forEach((m) => {
      if (filterYear && String(m.year) !== filterYear) return;
      if (filterMonth && m.month !== filterMonth) return;
      if (!map[m.department]) {
        map[m.department] = {
          name: m.department,
          monthlyTarget: 0,
          monthlyActual: 0,
          weeklyTarget: 0,
          weeklyActual: 0,
        };
      }
      map[m.department].monthlyTarget += Number(m.plannedQuantity) || 0;
      map[m.department].monthlyActual += Number(m.actualQuantity) || 0;
    });

    weeklyPlans.forEach((w) => {
      if (filterYear && String(w.year) !== filterYear) return;
      if (!map[w.department]) {
        map[w.department] = {
          name: w.department,
          monthlyTarget: 0,
          monthlyActual: 0,
          weeklyTarget: 0,
          weeklyActual: 0,
        };
      }
      map[w.department].weeklyTarget += Number(w.plannedQuantity) || 0;
      map[w.department].weeklyActual += Number(w.actualQuantity) || 0;
    });

    let list = Object.values(map);
    if (filterDept) {
      list = list.filter((item) => item.name === filterDept);
    }
    return list;
  }, [departments, monthlyPlans, weeklyPlans, filterMonth, filterYear, filterDept]);

  // Overall sums
  const overall = useMemo(() => {
    let mTarget = 0;
    let mActual = 0;
    let wTarget = 0;
    let wActual = 0;

    deptBreakdown.forEach((d) => {
      mTarget += d.monthlyTarget;
      mActual += d.monthlyActual;
      wTarget += d.weeklyTarget;
      wActual += d.weeklyActual;
    });

    const mPct = mTarget > 0 ? Math.round((mActual / mTarget) * 100) : 0;
    const wPct = wTarget > 0 ? Math.round((wActual / wTarget) * 100) : 0;

    return { mTarget, mActual, mPct, wTarget, wActual, wPct };
  }, [deptBreakdown]);

  // Machine-by-Machine Plan vs Actual Tracking
  const machineTrackingList = useMemo(() => {
    // Collect all planned machines from monthly plans and weekly plans
    const map = new Map<string, {
      cmmNo: string;
      cmmSize: string;
      srNo: number;
      priority: string;
      targetMonth: string;
      targetYear: string;
      targetWeek?: string;
      plannedQty: number;
      actualQty: number;
      currentDept: string;
      overallProgress: number;
      status: string;
      isDelayed: boolean;
      delayReason?: string;
      remarks?: string;
      customer?: string;
      project?: string;
    }>();

    // 1. Process Monthly Plans
    monthlyPlans.forEach((m) => {
      if (filterYear && String(m.year) !== filterYear) return;
      if (filterMonth && m.month !== filterMonth) return;
      const cmm = (m.machineNumber || '').trim();
      if (!cmm) return;

      const matchedMachine = machines.find(
        (mach) => mach.machineNumber.trim().toUpperCase() === cmm.toUpperCase()
      );

      const progress = matchedMachine?.progress ?? (m.actualQuantity ? 100 : 0);
      const isDelayed =
        matchedMachine?.isDelayed ||
        matchedMachine?.status === 'DELAYED' ||
        matchedMachine?.status === 'Delayed';

      map.set(cmm.toUpperCase(), {
        cmmNo: cmm,
        cmmSize: m.machineModel || matchedMachine?.model || matchedMachine?.machineModel || '—',
        srNo: m.sequenceNumber || (m as any).originalSrNo || 999,
        priority: m.priority || `P${String(m.sequenceNumber || 1).padStart(2, '0')}`,
        targetMonth: `${m.month} ${m.year}`,
        targetYear: String(m.year),
        plannedQty: m.plannedQuantity || 1,
        actualQty: m.actualQuantity || (progress >= 100 ? 1 : 0),
        currentDept: matchedMachine?.currentDepartment || m.department || '02 Planning',
        overallProgress: progress,
        status: matchedMachine?.status || m.status || 'PLANNED',
        isDelayed: Boolean(isDelayed),
        delayReason: matchedMachine?.delayReason,
        remarks: m.remarks || matchedMachine?.remarks,
        customer: m.customer || matchedMachine?.customer,
        project: m.project || matchedMachine?.project,
      });
    });

    // 2. Process Weekly Plans to supplement
    weeklyPlans.forEach((w) => {
      if (filterYear && String(w.year) !== filterYear) return;
      const cmm = (w.machineNumber || '').trim();
      if (!cmm) return;

      const upper = cmm.toUpperCase();
      const existing = map.get(upper);
      if (existing) {
        existing.targetWeek = `Week ${w.weekNumber}`;
      } else {
        const matchedMachine = machines.find(
          (mach) => mach.machineNumber.trim().toUpperCase() === upper
        );
        const progress = matchedMachine?.progress ?? (w.actualQuantity ? 100 : 0);
        map.set(upper, {
          cmmNo: cmm,
          cmmSize: w.machineModel || matchedMachine?.model || '—',
          srNo: w.sequenceNumber || 999,
          priority: w.priority || 'P01',
          targetMonth: matchedMachine?.planMonth ? `${matchedMachine.planMonth} ${matchedMachine.planYear}` : 'Weekly',
          targetYear: String(w.year),
          targetWeek: `Week ${w.weekNumber}`,
          plannedQty: w.plannedQuantity || 1,
          actualQty: w.actualQuantity || (progress >= 100 ? 1 : 0),
          currentDept: matchedMachine?.currentDepartment || w.department || '02 Planning',
          overallProgress: progress,
          status: matchedMachine?.status || w.status || 'PLANNED',
          isDelayed: Boolean(matchedMachine?.isDelayed || matchedMachine?.status === 'DELAYED'),
          delayReason: matchedMachine?.delayReason,
          remarks: w.remarks || matchedMachine?.remarks,
          customer: matchedMachine?.customer,
          project: w.project || matchedMachine?.project,
        });
      }
    });

    let list = Array.from(map.values()).sort((a, b) => a.srNo - b.srNo);

    if (filterDept) {
      list = list.filter((m) => m.currentDept.toLowerCase().includes(filterDept.toLowerCase()));
    }

    if (searchMachine) {
      const q = searchMachine.toLowerCase();
      list = list.filter(
        (m) =>
          m.cmmNo.toLowerCase().includes(q) ||
          m.cmmSize.toLowerCase().includes(q) ||
          (m.customer && m.customer.toLowerCase().includes(q)) ||
          (m.project && m.project.toLowerCase().includes(q))
      );
    }

    return list;
  }, [monthlyPlans, weeklyPlans, machines, filterYear, filterMonth, filterDept, searchMachine]);

  // Bottleneck & Delayed Machines
  const delayedMachinesList = useMemo(() => {
    return machineTrackingList.filter((m) => m.isDelayed || m.status === 'DELAYED' || m.status === 'On Hold');
  }, [machineTrackingList]);

  // Department bottlenecks (departments with lowest achievement or highest delays)
  const departmentBottlenecks = useMemo(() => {
    const deptDelayCount: Record<string, number> = {};
    delayedMachinesList.forEach((m) => {
      deptDelayCount[m.currentDept] = (deptDelayCount[m.currentDept] || 0) + 1;
    });

    return Object.entries(deptDelayCount)
      .map(([name, delayCount]) => ({ name, delayCount }))
      .sort((a, b) => b.delayCount - a.delayCount);
  }, [delayedMachinesList]);

  // Export to Excel
  const handleExportPlanVsActual = () => {
    const exportData = machineTrackingList.map((m) => ({
      'Priority / SR.NO.': m.srNo,
      'Priority Code': m.priority,
      'CMM NO': m.cmmNo,
      'CMM SIZE / Model': m.cmmSize,
      'Customer': m.customer || '',
      'Project': m.project || '',
      'Target Period': m.targetMonth,
      'Target Week': m.targetWeek || '',
      'Planned Qty': m.plannedQty,
      'Actual Qty': m.actualQty,
      'Progress %': `${m.overallProgress}%`,
      'Current Department': m.currentDept,
      'Status': m.status,
      'Is Delayed': m.isDelayed ? 'YES' : 'NO',
      'Delay Reason': m.delayReason || '',
      'Remarks': m.remarks || '',
    }));

    exportToExcel(
      `Accurate_Plan_Vs_Actual_${filterYear || 'All'}_${filterMonth || 'All'}.xlsx`,
      'Plan_Vs_Actual',
      exportData
    );
  };

  return (
    <div className="space-y-6">
      {/* Top Filter & Action Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white p-5 rounded-3xl border border-slate-200 shadow-2xs">
        <div>
          <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-blue-600" />
            <span>Plan vs Actual Manufacturing Reconciliation</span>
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Compare official Excel targets against physical shop-floor handovers, completions, and bottlenecks
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <select
            value={filterYear}
            onChange={(e) => setFilterYear(e.target.value)}
            className="text-xs font-semibold px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-700"
          >
            <option value="">All Years</option>
            {['2024', '2025', '2026', '2027'].map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>

          <select
            value={filterMonth}
            onChange={(e) => setFilterMonth(e.target.value)}
            className="text-xs font-semibold px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-700"
          >
            <option value="">All Months</option>
            {[
              'January', 'February', 'March', 'April', 'May', 'June',
              'July', 'August', 'September', 'October', 'November', 'December',
            ].map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>

          <select
            value={filterDept}
            onChange={(e) => setFilterDept(e.target.value)}
            className="text-xs font-semibold px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-700 max-w-[200px]"
          >
            <option value="">All Departments</option>
            {departments.map((d) => (
              <option key={d.id} value={d.name}>{d.name}</option>
            ))}
          </select>

          <button
            onClick={handleExportPlanVsActual}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition flex items-center space-x-1.5 shadow-sm"
          >
            <Download className="w-4 h-4" />
            <span>Export Report (.xlsx)</span>
          </button>
        </div>
      </div>

      {/* Top Level Comparison Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Monthly Target vs Actual */}
        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-2xs space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center space-x-1.5">
              <span>Monthly Target vs Actual</span>
            </span>
            <span
              className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${
                overall.mPct >= 100
                  ? 'bg-emerald-100 text-emerald-800'
                  : overall.mPct >= 70
                  ? 'bg-blue-100 text-blue-800'
                  : 'bg-amber-100 text-amber-800'
              }`}
            >
              {overall.mPct}% Achieved
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2.5 text-center">
            <div className="p-3 rounded-2xl bg-slate-50 border border-slate-100">
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Planned</span>
              <span className="text-xl font-black text-slate-900 font-mono">{overall.mTarget}</span>
            </div>

            <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-100">
              <span className="text-[10px] uppercase font-bold text-emerald-600 block">Actual</span>
              <span className="text-xl font-black text-emerald-700 font-mono">{overall.mActual}</span>
            </div>

            <div className="p-3 rounded-2xl bg-amber-50 border border-amber-100">
              <span className="text-[10px] uppercase font-bold text-amber-600 block">Pending</span>
              <span className="text-xl font-black text-amber-700 font-mono">
                {Math.max(0, overall.mTarget - overall.mActual)}
              </span>
            </div>
          </div>

          <div className="space-y-1">
            <div className="flex justify-between text-xs text-slate-600">
              <span>Plant Achievement</span>
              <span className="font-bold font-mono">{overall.mActual} / {overall.mTarget}</span>
            </div>
            <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-600 rounded-full transition-all"
                style={{ width: `${Math.min(100, overall.mPct)}%` }}
              />
            </div>
          </div>
        </div>

        {/* Weekly Target vs Actual */}
        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-2xs space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black uppercase tracking-wider text-slate-700">
              Weekly Target vs Actual
            </span>
            <span
              className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${
                overall.wPct >= 100
                  ? 'bg-emerald-100 text-emerald-800'
                  : overall.wPct >= 70
                  ? 'bg-indigo-100 text-indigo-800'
                  : 'bg-amber-100 text-amber-800'
              }`}
            >
              {overall.wPct}% Achieved
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2.5 text-center">
            <div className="p-3 rounded-2xl bg-slate-50 border border-slate-100">
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Weekly Plan</span>
              <span className="text-xl font-black text-slate-900 font-mono">{overall.wTarget}</span>
            </div>

            <div className="p-3 rounded-2xl bg-indigo-50 border border-indigo-100">
              <span className="text-[10px] uppercase font-bold text-indigo-600 block">Weekly Done</span>
              <span className="text-xl font-black text-indigo-700 font-mono">{overall.wActual}</span>
            </div>

            <div className="p-3 rounded-2xl bg-amber-50 border border-amber-100">
              <span className="text-[10px] uppercase font-bold text-amber-600 block">Remaining</span>
              <span className="text-xl font-black text-amber-700 font-mono">
                {Math.max(0, overall.wTarget - overall.wActual)}
              </span>
            </div>
          </div>

          <div className="space-y-1">
            <div className="flex justify-between text-xs text-slate-600">
              <span>Weekly Rate</span>
              <span className="font-bold font-mono">{overall.wActual} / {overall.wTarget}</span>
            </div>
            <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-indigo-600 rounded-full transition-all"
                style={{ width: `${Math.min(100, overall.wPct)}%` }}
              />
            </div>
          </div>
        </div>

        {/* Bottlenecks & Delays Summary Card */}
        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-2xs space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black uppercase tracking-wider text-slate-700">
              Department Bottlenecks & Delays
            </span>
            <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-rose-100 text-rose-800">
              {delayedMachinesList.length} Delayed Machines
            </span>
          </div>

          <div className="space-y-2 text-xs">
            {departmentBottlenecks.length === 0 ? (
              <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-100 text-emerald-800 text-center font-bold">
                ✓ No active department bottlenecks reported
              </div>
            ) : (
              departmentBottlenecks.slice(0, 3).map((b) => (
                <div
                  key={b.name}
                  className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-between"
                >
                  <span className="font-bold text-slate-800">{b.name}</span>
                  <span className="text-rose-600 font-mono font-bold">
                    {b.delayCount} delays
                  </span>
                </div>
              ))
            )}
          </div>

          <div className="pt-2 text-center">
            <button
              onClick={() => setActiveTab('delays')}
              className="text-xs font-bold text-rose-600 hover:text-rose-800 transition"
            >
              View all {delayedMachinesList.length} delayed machine details →
            </button>
          </div>
        </div>
      </div>

      {/* Tabs Selector: Department Breakdown vs Machine-by-Machine Tracking vs Delays */}
      <div className="flex items-center space-x-2 border-b border-slate-200 pb-3">
        <button
          onClick={() => setActiveTab('departments')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition ${
            activeTab === 'departments'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          Department Targets Breakdown ({deptBreakdown.length})
        </button>

        <button
          onClick={() => setActiveTab('machines')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition ${
            activeTab === 'machines'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          Machine-by-Machine Live Tracking ({machineTrackingList.length})
        </button>

        <button
          onClick={() => setActiveTab('delays')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition ${
            activeTab === 'delays'
              ? 'bg-rose-600 text-white shadow-sm'
              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          Bottlenecks & Delayed Machines ({delayedMachinesList.length})
        </button>
      </div>

      {/* TAB 1: Department-wise Breakdown Table */}
      {activeTab === 'departments' && (
        <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-2xs">
          <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
            <h4 className="text-xs font-black uppercase tracking-wider text-slate-700">
              Department-wise Target vs Actual Comparison
            </h4>
            <span className="text-xs text-slate-500 font-medium">
              {deptBreakdown.length} departments
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="p-3.5">Department</th>
                  <th className="p-3.5 text-right">Monthly Target</th>
                  <th className="p-3.5 text-right">Monthly Actual</th>
                  <th className="p-3.5 text-center">Monthly %</th>
                  <th className="p-3.5 text-right">Weekly Target</th>
                  <th className="p-3.5 text-right">Weekly Actual</th>
                  <th className="p-3.5 text-center">Weekly %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {deptBreakdown.map((dept, idx) => {
                  const mPct =
                    dept.monthlyTarget > 0
                      ? Math.round((dept.monthlyActual / dept.monthlyTarget) * 100)
                      : 0;
                  const wPct =
                    dept.weeklyTarget > 0
                      ? Math.round((dept.weeklyActual / dept.weeklyTarget) * 100)
                      : 0;

                  return (
                    <tr key={`${dept.name}-${idx}`} className="hover:bg-slate-50/80 transition">
                      <td className="p-3.5 font-bold text-slate-900">{dept.name}</td>
                      <td className="p-3.5 text-right font-mono font-bold text-slate-800">
                        {dept.monthlyTarget}
                      </td>
                      <td className="p-3.5 text-right font-mono font-bold text-emerald-600">
                        {dept.monthlyActual}
                      </td>
                      <td className="p-3.5 text-center">
                        <span
                          className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                            mPct >= 100
                              ? 'bg-emerald-100 text-emerald-800'
                              : mPct >= 50
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {mPct}%
                        </span>
                      </td>
                      <td className="p-3.5 text-right font-mono font-bold text-slate-800">
                        {dept.weeklyTarget}
                      </td>
                      <td className="p-3.5 text-right font-mono font-bold text-indigo-600">
                        {dept.weeklyActual}
                      </td>
                      <td className="p-3.5 text-center">
                        <span
                          className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                            wPct >= 100
                              ? 'bg-emerald-100 text-emerald-800'
                              : wPct >= 50
                              ? 'bg-indigo-100 text-indigo-800'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {wPct}%
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: Machine-by-Machine Live Tracking Table */}
      {activeTab === 'machines' && (
        <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-2xs space-y-3">
          <div className="p-4 border-b border-slate-200 bg-slate-50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h4 className="text-xs font-black uppercase tracking-wider text-slate-700">
                Machine-by-Machine Execution Status (Priority Sequence Order)
              </h4>
              <p className="text-[11px] text-slate-500">
                SR.NO. corresponds directly to the official Admin Excel upload priority
              </p>
            </div>

            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchMachine}
                onChange={(e) => setSearchMachine(e.target.value)}
                placeholder="Search CMM #, Size, Customer..."
                className="text-xs pl-9 pr-3 py-1.5 rounded-xl border border-slate-200 bg-white text-slate-800 focus:ring-2 focus:ring-blue-500 w-56 sm:w-64"
              />
            </div>
          </div>

          <div className="overflow-x-auto max-h-96">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 sticky top-0 z-10 text-slate-600 font-bold uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="p-3 w-16 text-center">SR.NO.</th>
                  <th className="p-3 w-28">CMM NO</th>
                  <th className="p-3 w-28">CMM SIZE</th>
                  <th className="p-3">Customer / Project</th>
                  <th className="p-3">Target Period</th>
                  <th className="p-3">Current Department</th>
                  <th className="p-3 text-center">Progress %</th>
                  <th className="p-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {machineTrackingList.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-slate-400">
                      No machines match the selected filter criteria.
                    </td>
                  </tr>
                ) : (
                  machineTrackingList.map((m) => (
                    <tr
                      key={`mach-${m.cmmNo}`}
                      className={`hover:bg-slate-50 transition ${
                        m.isDelayed ? 'bg-rose-50/30' : ''
                      }`}
                    >
                      <td className="p-3 text-center font-black text-blue-600 font-mono">
                        {m.srNo}
                      </td>
                      <td className="p-3 font-mono font-bold text-slate-900">{m.cmmNo}</td>
                      <td className="p-3 font-semibold text-slate-700">{m.cmmSize}</td>
                      <td className="p-3 text-slate-600 text-[11px]">
                        {m.customer || m.project ? (
                          <span>{m.customer || '—'} / {m.project || '—'}</span>
                        ) : (
                          <span className="text-slate-400 italic">—</span>
                        )}
                      </td>
                      <td className="p-3 text-slate-700">
                        <span className="font-semibold">{m.targetMonth}</span>
                        {m.targetWeek && (
                          <span className="block text-[10px] text-indigo-600 font-bold">
                            {m.targetWeek}
                          </span>
                        )}
                      </td>
                      <td className="p-3">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-bold bg-slate-100 text-slate-800">
                          {m.currentDept}
                        </span>
                      </td>
                      <td className="p-3 text-center font-mono font-bold">
                        <span
                          className={`${
                            m.overallProgress >= 100
                              ? 'text-emerald-600'
                              : m.overallProgress >= 50
                              ? 'text-blue-600'
                              : 'text-slate-600'
                          }`}
                        >
                          {m.overallProgress}%
                        </span>
                      </td>
                      <td className="p-3 text-center">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            m.isDelayed
                              ? 'bg-rose-100 text-rose-800 border border-rose-200'
                              : m.overallProgress >= 100
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                              : 'bg-blue-100 text-blue-800 border border-blue-200'
                          }`}
                        >
                          {m.isDelayed ? 'Delayed' : m.overallProgress >= 100 ? 'Completed' : 'In Progress'}
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

      {/* TAB 3: Bottlenecks & Delayed Machines Panel */}
      {activeTab === 'delays' && (
        <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-2xs space-y-4 p-6">
          <div className="flex items-center justify-between pb-4 border-b border-slate-200">
            <div>
              <h4 className="text-base font-black text-slate-900 flex items-center space-x-2">
                <AlertTriangle className="w-5 h-5 text-rose-600" />
                <span>Delayed Manufacturing Lines & Bottlenecks</span>
              </h4>
              <p className="text-xs text-slate-500">
                Machines flagged with schedule delays across plant departments
              </p>
            </div>
            <span className="text-xs font-bold px-3 py-1 bg-rose-100 text-rose-800 rounded-full">
              {delayedMachinesList.length} Delayed Machines
            </span>
          </div>

          {delayedMachinesList.length === 0 ? (
            <div className="p-10 text-center text-slate-400">
              <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-2 opacity-80" />
              <p className="font-bold text-slate-700">All planned machines are on schedule!</p>
              <p className="text-xs text-slate-400">No overdue handovers or delay flags detected.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {delayedMachinesList.map((m) => (
                <div
                  key={`delay-${m.cmmNo}`}
                  className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="space-y-1">
                    <div className="flex items-center space-x-2">
                      <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-800 font-mono text-[10px] font-black">
                        SR #{m.srNo}
                      </span>
                      <span className="font-black text-slate-900 text-sm font-mono">
                        CMM #{m.cmmNo} ({m.cmmSize})
                      </span>
                      <span className="text-xs text-slate-500">
                        in <strong className="text-slate-800">{m.currentDept}</strong>
                      </span>
                    </div>
                    {m.delayReason && (
                      <p className="text-xs text-rose-700 bg-rose-50 px-2.5 py-1 rounded-lg border border-rose-100 inline-block font-medium">
                        Delay Reason: {m.delayReason}
                      </p>
                    )}
                  </div>

                  <div className="text-right">
                    <span className="text-xs font-bold text-slate-500 block">Planned Target:</span>
                    <span className="text-xs font-black text-slate-800 font-mono">
                      {m.targetMonth} {m.targetWeek ? `(${m.targetWeek})` : ''}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
