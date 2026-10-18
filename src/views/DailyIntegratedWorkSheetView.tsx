import React, { useState, useMemo } from 'react';
import {
  Calendar,
  Building,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Search,
  Filter,
  Download,
  FileSpreadsheet,
  Check,
  ShieldCheck,
  Eye,
  RefreshCw,
  Layers,
  ArrowRight,
} from 'lucide-react';
import { Machine, DepartmentWork, MonthlyPlan, WeeklyPlan, DepartmentHandover, QualityRejection } from '../types';
import { INITIAL_DEPARTMENTS } from '../constants';
import { getNextDepartmentInRoute, isDepartmentMatch } from '../utils/departmentUtils';
import { calculateOperationsProgress, getDefaultDepartmentOperations } from '../services/operationWorkflowService';
import * as XLSX from 'xlsx';

interface DailyIntegratedWorkSheetViewProps {
  machines: Machine[];
  departmentWork: DepartmentWork[];
  monthlyPlans: MonthlyPlan[];
  weeklyPlans?: WeeklyPlan[];
  handovers?: DepartmentHandover[];
  qualityRejections?: QualityRejection[];
  onOpenMachineDetail?: (machine: Machine) => void;
}

export interface IntegratedWorkSheetRow {
  id: string;
  date: string;
  machineNumber: string;
  specification: string;
  month: string;
  week: string;
  department: string;
  todaysOperationsCount: number;
  totalOperationsCount: number;
  completedOperationsCount: number;
  remainingOperationsCount: number;
  departmentProgressPercent: number;
  overallMachineProgressPercent: number;
  targetDate: string;
  delayDays: number;
  isDelayed: boolean;
  currentStatus: string;
  handoverStatus: string;
  nextDepartment: string;
  qualityStatus: string;
  remarks: string;
  machineRef?: Machine;
}

export const DailyIntegratedWorkSheetView: React.FC<DailyIntegratedWorkSheetViewProps> = ({
  machines,
  departmentWork,
  monthlyPlans,
  weeklyPlans = [],
  handovers = [],
  qualityRejections = [],
  onOpenMachineDetail,
}) => {
  const todayStr = new Date().toISOString().split('T')[0];
  const [selectedDate, setSelectedDate] = useState<string>(todayStr);
  const [selectedDept, setSelectedDept] = useState<string>('All Departments');
  const [selectedMonth, setSelectedMonth] = useState<string>('All Months');
  const [selectedWeek, setSelectedWeek] = useState<string>('All Weeks');
  const [searchQuery, setSearchQuery] = useState('');

  // Extract distinct months and weeks
  const availableMonths = useMemo(() => {
    const set = new Set<string>();
    monthlyPlans.forEach((p) => {
      if (p.month) set.add(`${p.month} ${p.year || 2026}`);
    });
    machines.forEach((m) => {
      if (m.planMonth) set.add(`${m.planMonth} ${m.planYear || 2026}`);
    });
    return ['All Months', ...Array.from(set)];
  }, [monthlyPlans, machines]);

  const availableWeeks = useMemo(() => {
    const set = new Set<string>();
    weeklyPlans.forEach((w) => {
      if (w.weekNumber) set.add(`Week ${w.weekNumber}`);
      else if (w.weekStartDate) set.add(`Week ${w.weekStartDate}`);
    });
    machines.forEach((m) => {
      if (m.weekNumber) set.add(m.weekNumber);
    });
    return ['All Weeks', ...Array.from(set)];
  }, [weeklyPlans, machines]);

  // Compute Integrated Rows across the entire plant
  const integratedRows: IntegratedWorkSheetRow[] = useMemo(() => {
    const rows: IntegratedWorkSheetRow[] = [];
    const currentDate = new Date(selectedDate);

    machines.forEach((m) => {
      const curDept = m.responsibleDepartment || m.currentDepartment || 'Store';
      const mNum = m.machineNumber;
      const spec = m.model || m.machineModel || 'Standard';

      // Month
      const monthStr = m.planMonth ? `${m.planMonth} ${m.planYear || '2026'}` : 'September 2026';

      // Week
      const matchingWeek = weeklyPlans.find((w) => w.machineNumber === mNum);
      const weekStr = m.weekNumber || (matchingWeek ? `Week ${matchingWeek.weekNumber || matchingWeek.weekStartDate}` : 'Week 1');

      // Operations
      const ops = m.operations && m.operations.length > 0 ? m.operations : getDefaultDepartmentOperations(curDept);
      const stats = calculateOperationsProgress(ops, selectedDate);

      // Progress percentages
      const deptProg = m.progress !== undefined ? m.progress : stats.progressPercent;
      let overallProg = m.overallProgressPercent;
      if (overallProg === undefined) {
        // Compute from processStages
        if (m.processStages) {
          const stages = Object.values(m.processStages);
          overallProg = stages.length > 0 ? Math.round(stages.reduce((sum, s) => sum + (s.progressPercent || 0), 0) / Math.max(12, stages.length)) : deptProg;
        } else {
          overallProg = Math.round(deptProg / 2);
        }
      }

      // Target Date & Delay Days
      const targetDate = m.targetDate || m.plannedDueDate || m.dueDate || m.plannedDate || '—';
      let delayDays = 0;
      let isDelayed = false;

      if (targetDate && targetDate !== '—') {
        const tDate = new Date(targetDate);
        if (!isNaN(tDate.getTime())) {
          const diffMs = currentDate.getTime() - tDate.getTime();
          const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
          if (days > 0 && deptProg < 100) {
            delayDays = days;
            isDelayed = true;
          }
        }
      }

      if (m.status === 'DELAYED' || m.currentStatus === 'Delayed') {
        isDelayed = true;
        if (delayDays === 0) delayDays = 1;
      }

      // Current Status
      let st = m.currentStatus || m.status || 'In Progress';
      if (m.status === 'RETURNED' || m.isReturned) st = 'Returned for Correction';
      else if (deptProg >= 100) st = '100% Completed';
      else if (isDelayed) st = 'Delayed';

      // Handover Status & Next Department
      const nextDept = m.nextDepartment || getNextDepartmentInRoute(curDept) || 'Final QA / Dispatch';
      const hoStatus = m.handoverStatus || (deptProg >= 100 ? 'Ready for Handover' : 'Not Ready');

      // Quality Status
      const activeRej = qualityRejections.find((r) => r.machineNumber === mNum && r.status !== 'Closed');
      const qStatus = activeRej ? `Hold (${activeRej.rejectionType || 'Defect'})` : m.qualityStatus || 'Approved';

      // Remarks
      const remarks = m.remarks || m.delayReason || (isDelayed ? `Delayed by ${delayDays} days` : 'Active on schedule');

      rows.push({
        id: `row_${m.id}`,
        date: selectedDate,
        machineNumber: mNum,
        specification: spec,
        month: monthStr,
        week: weekStr,
        department: curDept,
        todaysOperationsCount: stats.todayCompleted,
        totalOperationsCount: stats.total,
        completedOperationsCount: stats.completed,
        remainingOperationsCount: stats.remaining,
        departmentProgressPercent: deptProg,
        overallMachineProgressPercent: overallProg,
        targetDate,
        delayDays,
        isDelayed,
        currentStatus: st,
        handoverStatus: hoStatus,
        nextDepartment: nextDept,
        qualityStatus: qStatus,
        remarks,
        machineRef: m,
      });
    });

    return rows.sort((a, b) => {
      // Prioritize Delayed first
      if (a.isDelayed && !b.isDelayed) return -1;
      if (!a.isDelayed && b.isDelayed) return 1;
      return a.machineNumber.localeCompare(b.machineNumber);
    });
  }, [machines, weeklyPlans, qualityRejections, selectedDate]);

  // Filtered Rows
  const filteredRows = useMemo(() => {
    return integratedRows.filter((r) => {
      if (selectedDept !== 'All Departments') {
        if (!isDepartmentMatch(r.department, selectedDept)) return false;
      }
      if (selectedMonth !== 'All Months') {
        if (!r.month.toLowerCase().includes(selectedMonth.toLowerCase())) return false;
      }
      if (selectedWeek !== 'All Weeks') {
        if (r.week !== selectedWeek) return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matches =
          r.machineNumber.toLowerCase().includes(q) ||
          r.specification.toLowerCase().includes(q) ||
          r.department.toLowerCase().includes(q) ||
          r.remarks.toLowerCase().includes(q) ||
          r.currentStatus.toLowerCase().includes(q);
        if (!matches) return false;
      }
      return true;
    });
  }, [integratedRows, selectedDept, selectedMonth, selectedWeek, searchQuery]);

  // Summary statistics
  const summary = useMemo(() => {
    const total = filteredRows.length;
    const completed = filteredRows.filter((r) => r.departmentProgressPercent >= 100).length;
    const delayed = filteredRows.filter((r) => r.isDelayed).length;
    const todayOpsTotal = filteredRows.reduce((acc, r) => acc + r.todaysOperationsCount, 0);
    const avgOverall = total > 0 ? Math.round(filteredRows.reduce((acc, r) => acc + r.overallMachineProgressPercent, 0) / total) : 0;
    return { total, completed, delayed, todayOpsTotal, avgOverall };
  }, [filteredRows]);

  // Export to Excel (All Columns Required by Section 24)
  const handleExportExcel = () => {
    const exportData = filteredRows.map((r, idx) => ({
      'Sr. No': idx + 1,
      'Date': r.date,
      'Machine No.': r.machineNumber,
      'Specification / Size': r.specification,
      'Month': r.month,
      'Week': r.week,
      'Department': r.department,
      "Today's Operations": r.todaysOperationsCount,
      'Total Operations': r.totalOperationsCount,
      'Completed Operations': r.completedOperationsCount,
      'Remaining Operations': r.remainingOperationsCount,
      'Department Progress %': `${r.departmentProgressPercent}%`,
      'Overall Machine Progress %': `${r.overallMachineProgressPercent}%`,
      'Target Date': r.targetDate,
      'Delay Days': r.delayDays,
      'Current Status': r.currentStatus,
      'Handover Status': r.handoverStatus,
      'Next Department': r.nextDepartment,
      'Quality Status': r.qualityStatus,
      'Remarks': r.remarks,
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Daily Integrated Sheet');
    XLSX.writeFile(wb, `Admin_Daily_Integrated_Work_Sheet_${selectedDate}.xlsx`);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center space-x-2">
            <span className="p-1.5 bg-indigo-50 text-indigo-700 rounded-lg">
              <FileSpreadsheet className="w-5 h-5" />
            </span>
            <h2 className="text-xl font-black text-slate-900 tracking-tight">
              Admin Daily Integrated Work Sheet
            </h2>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Plant-wide synchronized manufacturing progress across all departments. One Machine = One Complete Roadmap.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleExportExcel}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition flex items-center space-x-1.5 shadow-xs"
          >
            <Download className="w-4 h-4" />
            <span>Export Sheet (.xlsx)</span>
          </button>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {/* Date Picker */}
          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-300 rounded-xl px-3 py-1.5 shadow-2xs">
            <Calendar className="w-3.5 h-3.5 text-blue-600" />
            <span className="font-bold text-slate-600">Date:</span>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-transparent font-bold text-slate-900 outline-none cursor-pointer"
            />
          </div>

          {/* Department Filter */}
          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-300 rounded-xl px-3 py-1.5 shadow-2xs">
            <Building className="w-3.5 h-3.5 text-slate-500" />
            <span className="font-bold text-slate-600">Dept:</span>
            <select
              value={selectedDept}
              onChange={(e) => setSelectedDept(e.target.value)}
              className="bg-transparent font-bold text-slate-900 outline-none cursor-pointer"
            >
              <option value="All Departments">All Departments</option>
              {INITIAL_DEPARTMENTS.map((d) => (
                <option key={d.code} value={d.name}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>

          {/* Month Filter */}
          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-300 rounded-xl px-3 py-1.5 shadow-2xs">
            <Calendar className="w-3.5 h-3.5 text-purple-600" />
            <span className="font-bold text-slate-600">Month:</span>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="bg-transparent font-bold text-slate-900 outline-none cursor-pointer"
            >
              {availableMonths.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>

          {/* Week Filter */}
          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-300 rounded-xl px-3 py-1.5 shadow-2xs">
            <Layers className="w-3.5 h-3.5 text-amber-600" />
            <span className="font-bold text-slate-600">Week:</span>
            <select
              value={selectedWeek}
              onChange={(e) => setSelectedWeek(e.target.value)}
              className="bg-transparent font-bold text-slate-900 outline-none cursor-pointer"
            >
              {availableWeeks.map((w) => (
                <option key={w} value={w}>
                  {w}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-64">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search machine, dept, remarks..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Summary KPI Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-[10px] font-bold uppercase text-slate-400 block">Total Machines</span>
          <span className="text-xl font-black text-slate-900 font-mono mt-0.5 block">{summary.total}</span>
        </div>
        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-[10px] font-bold uppercase text-emerald-600 block">Completed Work (100%)</span>
          <span className="text-xl font-black text-emerald-600 font-mono mt-0.5 block">{summary.completed}</span>
        </div>
        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-[10px] font-bold uppercase text-rose-600 block">Delayed Work</span>
          <span className="text-xl font-black text-rose-600 font-mono mt-0.5 block">{summary.delayed}</span>
        </div>
        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-[10px] font-bold uppercase text-blue-600 block">Operations Done Today</span>
          <span className="text-xl font-black text-blue-600 font-mono mt-0.5 block">{summary.todayOpsTotal}</span>
        </div>
        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-[10px] font-bold uppercase text-indigo-600 block">Avg Machine Progress</span>
          <span className="text-xl font-black text-indigo-600 font-mono mt-0.5 block">{summary.avgOverall}%</span>
        </div>
      </div>

      {/* Main Integrated Work Sheet Table (All 19 Columns) */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs whitespace-nowrap">
            <thead className="bg-slate-50/90 border-b border-slate-200 text-slate-600 font-bold uppercase text-[10px] tracking-wider">
              <tr>
                <th className="p-3 pl-4">Date</th>
                <th className="p-3">Machine No.</th>
                <th className="p-3">Specification</th>
                <th className="p-3">Month</th>
                <th className="p-3">Week</th>
                <th className="p-3">Department</th>
                <th className="p-3 text-center">Today's Ops</th>
                <th className="p-3 text-center">Total Ops</th>
                <th className="p-3 text-center">Completed</th>
                <th className="p-3 text-center">Remaining</th>
                <th className="p-3">Dept Progress</th>
                <th className="p-3">Overall Progress</th>
                <th className="p-3">Target Date</th>
                <th className="p-3">Delay Days</th>
                <th className="p-3">Current Status</th>
                <th className="p-3">Handover Status</th>
                <th className="p-3">Next Department</th>
                <th className="p-3">Quality Status</th>
                <th className="p-3">Remarks</th>
                <th className="p-3 pr-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredRows.map((row) => {
                const isDelayed = row.isDelayed;
                const isCompleted = row.departmentProgressPercent >= 100;

                return (
                  <tr
                    key={row.id}
                    className={`hover:bg-slate-50/80 transition ${
                      isDelayed ? 'bg-rose-50/25' : isCompleted ? 'bg-emerald-50/15' : ''
                    }`}
                  >
                    {/* 1. Date */}
                    <td className="p-3 pl-4 font-mono text-[11px] text-slate-500">{row.date}</td>

                    {/* 2. Machine No */}
                    <td className="p-3 font-mono font-black text-slate-900">
                      <button
                        onClick={() => row.machineRef && onOpenMachineDetail && onOpenMachineDetail(row.machineRef)}
                        className="text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1 font-bold"
                      >
                        {row.machineNumber}
                      </button>
                    </td>

                    {/* 3. Specification */}
                    <td className="p-3 text-slate-700 font-medium">{row.specification}</td>

                    {/* 4. Month */}
                    <td className="p-3 text-slate-600">{row.month}</td>

                    {/* 5. Week */}
                    <td className="p-3 text-slate-600 font-semibold">{row.week}</td>

                    {/* 6. Department */}
                    <td className="p-3 font-bold text-indigo-700">{row.department}</td>

                    {/* 7. Today's Operations */}
                    <td className="p-3 text-center">
                      <span className="px-2 py-0.5 bg-blue-50 text-blue-700 font-mono font-bold rounded">
                        {row.todaysOperationsCount}
                      </span>
                    </td>

                    {/* 8. Total Operations */}
                    <td className="p-3 text-center font-mono font-semibold text-slate-700">
                      {row.totalOperationsCount}
                    </td>

                    {/* 9. Completed Operations */}
                    <td className="p-3 text-center font-mono font-bold text-emerald-600">
                      {row.completedOperationsCount}
                    </td>

                    {/* 10. Remaining Operations */}
                    <td className="p-3 text-center font-mono font-bold text-amber-600">
                      {row.remainingOperationsCount}
                    </td>

                    {/* 11. Department Progress % */}
                    <td className="p-3">
                      <div className="flex items-center space-x-1.5">
                        <div className="w-14 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              isCompleted ? 'bg-emerald-500' : isDelayed ? 'bg-rose-500' : 'bg-blue-600'
                            }`}
                            style={{ width: `${row.departmentProgressPercent}%` }}
                          />
                        </div>
                        <span className="font-mono font-bold text-slate-800 text-[11px]">
                          {row.departmentProgressPercent}%
                        </span>
                      </div>
                    </td>

                    {/* 12. Overall Machine Progress % */}
                    <td className="p-3">
                      <div className="flex items-center space-x-1.5">
                        <div className="w-14 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-indigo-600 rounded-full transition-all"
                            style={{ width: `${row.overallMachineProgressPercent}%` }}
                          />
                        </div>
                        <span className="font-mono font-bold text-indigo-900 text-[11px]">
                          {row.overallMachineProgressPercent}%
                        </span>
                      </div>
                    </td>

                    {/* 13. Target Date */}
                    <td className="p-3 font-mono text-[11px] text-slate-600 font-medium">
                      {row.targetDate}
                    </td>

                    {/* 14. Delay Days (Highlight RED if delayed) */}
                    <td className="p-3">
                      {isDelayed ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-rose-100 text-rose-800 font-black font-mono text-[11px] border border-rose-300">
                          <AlertTriangle className="w-3 h-3 text-rose-600" />
                          <span>+{row.delayDays}d LATE</span>
                        </span>
                      ) : (
                        <span className="text-emerald-700 font-medium text-[11px]">On Time</span>
                      )}
                    </td>

                    {/* 15. Current Status */}
                    <td className="p-3">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          isCompleted
                            ? 'bg-emerald-100 text-emerald-800'
                            : isDelayed
                            ? 'bg-rose-100 text-rose-800'
                            : row.currentStatus.includes('Returned')
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-blue-100 text-blue-800'
                        }`}
                      >
                        {row.currentStatus}
                      </span>
                    </td>

                    {/* 16. Handover Status */}
                    <td className="p-3">
                      <span className="text-slate-600 font-medium text-[11px]">
                        {row.handoverStatus}
                      </span>
                    </td>

                    {/* 17. Next Department */}
                    <td className="p-3 text-slate-700 font-medium">
                      <div className="flex items-center gap-1 text-[11px]">
                        <ArrowRight className="w-3 h-3 text-slate-400 shrink-0" />
                        <span>{row.nextDepartment}</span>
                      </div>
                    </td>

                    {/* 18. Quality Status */}
                    <td className="p-3">
                      <span className="text-[11px] font-semibold text-slate-700">
                        {row.qualityStatus}
                      </span>
                    </td>

                    {/* 19. Remarks */}
                    <td className="p-3 max-w-xs truncate text-slate-600" title={row.remarks}>
                      {row.remarks}
                    </td>

                    {/* Action */}
                    <td className="p-3 pr-4 text-right">
                      {row.machineRef && (
                        <button
                          onClick={() => onOpenMachineDetail && onOpenMachineDetail(row.machineRef!)}
                          className="px-2 py-1 text-[11px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded transition"
                        >
                          View
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
