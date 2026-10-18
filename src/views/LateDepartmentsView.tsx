import React, { useState, useMemo } from 'react';
import {
  AlertTriangle,
  Clock,
  Calendar,
  Building,
  User,
  Search,
  Filter,
  ArrowRight,
  MessageSquare,
  ShieldAlert,
  CheckCircle2,
  ExternalLink,
} from 'lucide-react';
import { Machine, DepartmentWork, MonthlyPlan } from '../types';
import { INITIAL_DEPARTMENTS } from '../constants';

interface LateDepartmentsViewProps {
  machines: Machine[];
  departmentWork: DepartmentWork[];
  monthlyPlans: MonthlyPlan[];
  onOpenMachineDetail?: (machine: Machine) => void;
}

interface DelayedItem {
  id: string;
  machineId?: string;
  machineNumber: string;
  machineSize: string;
  responsibleDepartment: string;
  assignedDate: string;
  targetDate: string;
  daysLate: number;
  delayReason: string;
  currentStatus: string;
  employee: string;
  progress: number;
  machineRef?: Machine;
}

export const LateDepartmentsView: React.FC<LateDepartmentsViewProps> = ({
  machines,
  departmentWork,
  monthlyPlans,
  onOpenMachineDetail,
}) => {
  const [selectedDept, setSelectedDept] = useState<string>('All Departments');
  const [selectedMonth, setSelectedMonth] = useState<string>('All Months');
  const [selectedSeverity, setSelectedSeverity] = useState<'all' | '1to4' | '5to10' | 'gt10'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [followupNote, setFollowupNote] = useState<{ [id: string]: string }>({});
  const [activeFollowupId, setActiveFollowupId] = useState<string | null>(null);

  // Compute all delayed items from live machines, monthly plans, and department work
  const delayedItems: DelayedItem[] = useMemo(() => {
    const list: DelayedItem[] = [];
    const seen = new Set<string>();
    const now = new Date().setHours(0, 0, 0, 0);

    // 1. Check Machines
    machines.forEach((m) => {
      const prog = m.progress !== undefined ? m.progress : m.overallProgressPercent || 0;
      if (prog >= 100 || m.status === 'COMPLETED' || m.currentStatus === 'Completed') return;

      const target = m.targetDate || m.plannedDueDate || m.dueDate || m.plannedDate;
      let isLate = false;
      let daysLate = 0;

      if (target) {
        const targetTime = new Date(target).getTime();
        if (now > targetTime) {
          isLate = true;
          daysLate = Math.max(1, Math.ceil((now - targetTime) / (1000 * 60 * 60 * 24)));
        }
      }

      if (m.delayReason || m.status === 'DELAYED' || m.status === 'BLOCKED' || m.currentStatus === 'Delayed') {
        isLate = true;
        if (daysLate === 0) daysLate = m.delayDays || 1;
      }

      if (isLate) {
        seen.add(m.machineNumber);
        list.push({
          id: `mach_${m.id}`,
          machineId: m.id,
          machineNumber: m.machineNumber,
          machineSize: m.model || m.machineModel || 'Standard',
          responsibleDepartment: m.responsibleDepartment || m.currentDepartment || 'Unassigned',
          assignedDate: m.assignedDate || m.plannedStartDate || m.createdAt?.split('T')[0] || '—',
          targetDate: target || 'Not specified',
          daysLate,
          delayReason: m.delayReason || 'Target completion date exceeded without 100% progress',
          currentStatus: m.currentStatus || (m.status as string) || 'Delayed',
          employee: m.responsibleEmployee || m.currentEmployee || 'Operator',
          progress: prog,
          machineRef: m,
        });
      }
    });

    // 2. Check Department Work with 'Delayed' status or overdue target
    departmentWork.forEach((w) => {
      if (w.status === 'Completed') return;
      const key = `${w.machineNumber}_${w.department}`;
      if (seen.has(key)) return;

      let isLate = false;
      let daysLate = 0;
      const target = w.dueDate || w.targetDate;
      if (target) {
        const targetTime = new Date(target).getTime();
        if (now > targetTime) {
          isLate = true;
          daysLate = Math.max(1, Math.ceil((now - targetTime) / (1000 * 60 * 60 * 24)));
        }
      }

      if (w.status === 'Delayed' || w.delayReason) {
        isLate = true;
        if (daysLate === 0) daysLate = 1;
      }

      if (isLate && w.machineNumber) {
        seen.add(key);
        const parentMachine = machines.find((m) => m.machineNumber === w.machineNumber);
        list.push({
          id: `work_${w.id}`,
          machineId: parentMachine?.id,
          machineNumber: w.machineNumber,
          machineSize: parentMachine?.model || parentMachine?.machineModel || 'Standard',
          responsibleDepartment: w.department,
          assignedDate: w.assignedDate || w.createdAt?.split('T')[0] || '—',
          targetDate: target || 'Not specified',
          daysLate,
          delayReason: w.delayReason || w.remarks || 'Department task delayed past schedule',
          currentStatus: w.status,
          employee: w.assignedTo || 'Department Team',
          progress: w.progress || parentMachine?.progress || 0,
          machineRef: parentMachine,
        });
      }
    });

    return list.sort((a, b) => b.daysLate - a.daysLate);
  }, [machines, departmentWork]);

  // Compute available months from delayed items and monthly plans
  const availableMonths = useMemo(() => {
    const set = new Set<string>();
    monthlyPlans.forEach((p) => {
      if (p.month) set.add(`${p.month} ${p.year || 2026}`.trim());
    });
    delayedItems.forEach((d) => {
      if (d.targetDate && d.targetDate !== 'Not specified') {
        const dt = new Date(d.targetDate);
        if (!isNaN(dt.getTime())) {
          set.add(`${dt.toLocaleString('en-US', { month: 'long' })} ${dt.getFullYear()}`);
        }
      }
    });
    return Array.from(set);
  }, [monthlyPlans, delayedItems]);

  // Filter delayed items
  const filteredItems = useMemo(() => {
    return delayedItems.filter((item) => {
      // Department filter
      if (selectedDept !== 'All Departments') {
        if (item.responsibleDepartment.toLowerCase() !== selectedDept.toLowerCase()) {
          return false;
        }
      }

      // Month filter
      if (selectedMonth !== 'All Months') {
        const itemDateStr = item.targetDate !== 'Not specified' ? item.targetDate : item.assignedDate;
        if (itemDateStr && itemDateStr !== '—') {
          const dt = new Date(itemDateStr);
          if (!isNaN(dt.getTime())) {
            const mName = `${dt.toLocaleString('en-US', { month: 'long' })} ${dt.getFullYear()}`;
            if (mName.toLowerCase() !== selectedMonth.toLowerCase()) return false;
          }
        }
      }

      // Severity filter
      if (selectedSeverity === '1to4' && (item.daysLate < 1 || item.daysLate > 4)) return false;
      if (selectedSeverity === '5to10' && (item.daysLate < 5 || item.daysLate > 10)) return false;
      if (selectedSeverity === 'gt10' && item.daysLate <= 10) return false;

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesNum = item.machineNumber.toLowerCase().includes(q);
        const matchesDept = item.responsibleDepartment.toLowerCase().includes(q);
        const matchesReason = item.delayReason.toLowerCase().includes(q);
        const matchesEmp = item.employee.toLowerCase().includes(q);
        if (!matchesNum && !matchesDept && !matchesReason && !matchesEmp) return false;
      }

      return true;
    });
  }, [delayedItems, selectedDept, selectedMonth, selectedSeverity, searchQuery]);

  return (
    <div className="space-y-6">
      {/* Module Header */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2 text-xs font-black uppercase tracking-wider text-rose-600">
            <ShieldAlert className="w-4 h-4" />
            <span>Admin Control Panel &bull; Plant Production Delays</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight mt-0.5">
            Late Departments &amp; Delayed Work Module
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Real-time tracking of machines that have exceeded target dates or reported departmental bottlenecks.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="bg-rose-50 border border-rose-200 px-4 py-2.5 rounded-xl text-center">
            <span className="text-[10px] font-bold uppercase text-rose-700 block">Total Delayed Items</span>
            <span className="text-2xl font-black text-rose-700 font-mono">{delayedItems.length}</span>
          </div>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {/* Department Filter */}
          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-300 rounded-xl px-3 py-1.5 text-xs">
            <Building className="w-3.5 h-3.5 text-slate-500" />
            <span className="font-bold text-slate-600">Dept:</span>
            <select
              value={selectedDept}
              onChange={(e) => setSelectedDept(e.target.value)}
              className="bg-transparent font-bold text-slate-900 outline-none cursor-pointer text-xs"
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
          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-300 rounded-xl px-3 py-1.5 text-xs">
            <Calendar className="w-3.5 h-3.5 text-blue-600" />
            <span className="font-bold text-slate-600">Month:</span>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="bg-transparent font-bold text-slate-900 outline-none cursor-pointer text-xs"
            >
              <option value="All Months">All Months</option>
              {availableMonths.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>

          {/* Severity Filter */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-xs font-bold">
            <button
              onClick={() => setSelectedSeverity('all')}
              className={`px-2.5 py-1 rounded-lg transition ${
                selectedSeverity === 'all' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All Delays
            </button>
            <button
              onClick={() => setSelectedSeverity('1to4')}
              className={`px-2.5 py-1 rounded-lg transition ${
                selectedSeverity === '1to4' ? 'bg-amber-500 text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              1-4 Days
            </button>
            <button
              onClick={() => setSelectedSeverity('5to10')}
              className={`px-2.5 py-1 rounded-lg transition ${
                selectedSeverity === '5to10' ? 'bg-orange-600 text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              5-10 Days
            </button>
            <button
              onClick={() => setSelectedSeverity('gt10')}
              className={`px-2.5 py-1 rounded-lg transition ${
                selectedSeverity === 'gt10' ? 'bg-rose-600 text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              &gt;10 Days Late
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-64">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search delayed machine or dept..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-500"
          />
        </div>
      </div>

      {/* Table of Late Departments */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
        {filteredItems.length === 0 ? (
          <div className="text-center py-12 px-4">
            <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
            <h4 className="text-sm font-bold text-slate-800">No Delayed Work Found</h4>
            <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1">
              All departmental work for the selected filter is on schedule.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs whitespace-nowrap">
              <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-bold uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="p-3 pl-4">Machine Number</th>
                  <th className="p-3">Model / Size</th>
                  <th className="p-3">Responsible Dept</th>
                  <th className="p-3">Assigned Date</th>
                  <th className="p-3">Target Date</th>
                  <th className="p-3 text-center">Days Late</th>
                  <th className="p-3">Delay Reason</th>
                  <th className="p-3">Progress %</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Employee</th>
                  <th className="p-3 pr-4 text-right">Quick Follow-up Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredItems.map((item) => {
                  const isSevere = item.daysLate > 10;
                  const isModerate = item.daysLate >= 5 && item.daysLate <= 10;

                  return (
                    <tr
                      key={item.id}
                      className={`hover:bg-rose-50/40 transition ${
                        isSevere ? 'bg-rose-50/20' : isModerate ? 'bg-amber-50/15' : ''
                      }`}
                    >
                      {/* Machine Number */}
                      <td className="p-3 pl-4 font-mono font-black text-slate-900">
                        <div className="flex items-center space-x-1.5">
                          <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0 animate-pulse" />
                          <span>{item.machineNumber}</span>
                        </div>
                      </td>

                      {/* Size / Model */}
                      <td className="p-3 text-slate-700 font-medium">{item.machineSize}</td>

                      {/* Responsible Department */}
                      <td className="p-3 font-bold text-indigo-700">
                        <span className="px-2 py-0.5 rounded bg-indigo-50 border border-indigo-200">
                          {item.responsibleDepartment}
                        </span>
                      </td>

                      {/* Assigned Date */}
                      <td className="p-3 text-slate-600 font-mono text-[11px]">{item.assignedDate}</td>

                      {/* Target Date */}
                      <td className="p-3 font-mono text-[11px] font-bold text-slate-800">
                        {item.targetDate}
                      </td>

                      {/* Days Late */}
                      <td className="p-3 text-center">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-black font-mono ${
                            isSevere
                              ? 'bg-rose-600 text-white'
                              : isModerate
                              ? 'bg-orange-500 text-white'
                              : 'bg-amber-100 text-amber-900'
                          }`}
                        >
                          <AlertTriangle className="w-3 h-3" />
                          <span>{item.daysLate}d Late</span>
                        </span>
                      </td>

                      {/* Delay Reason */}
                      <td className="p-3 max-w-xs truncate text-rose-700 font-medium text-[11px]" title={item.delayReason}>
                        {item.delayReason}
                      </td>

                      {/* Progress % */}
                      <td className="p-3">
                        <div className="flex items-center space-x-1.5">
                          <div className="w-16 h-2 bg-slate-200 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-amber-500 rounded-full"
                              style={{ width: `${item.progress}%` }}
                            />
                          </div>
                          <span className="font-mono font-bold text-slate-800 text-[11px]">
                            {item.progress}%
                          </span>
                        </div>
                      </td>

                      {/* Status */}
                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200 uppercase">
                          {item.currentStatus}
                        </span>
                      </td>

                      {/* Employee */}
                      <td className="p-3 text-slate-700 font-medium">{item.employee}</td>

                      {/* Action */}
                      <td className="p-3 pr-4 text-right">
                        <div className="flex items-center justify-end space-x-1.5">
                          {item.machineRef && onOpenMachineDetail && (
                            <button
                              onClick={() => onOpenMachineDetail(item.machineRef!)}
                              className="px-2 py-1 text-[11px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition flex items-center space-x-1"
                              title="Open machine detail"
                            >
                              <ExternalLink className="w-3 h-3" />
                              <span>View</span>
                            </button>
                          )}

                          <button
                            onClick={() => {
                              setActiveFollowupId(item.id);
                              if (!followupNote[item.id]) {
                                setFollowupNote((prev) => ({
                                  ...prev,
                                  [item.id]: `Follow up: Machine ${item.machineNumber} is ${item.daysLate} days late in ${item.responsibleDepartment}. Priority expedited clearance required.`,
                                }));
                              }
                            }}
                            className="px-2.5 py-1 text-[11px] font-bold bg-rose-600 hover:bg-rose-700 text-white rounded-lg transition flex items-center space-x-1 shadow-2xs"
                          >
                            <MessageSquare className="w-3 h-3" />
                            <span>Expedite</span>
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

      {/* Follow-up / Expedite Modal */}
      {activeFollowupId && (
        <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center space-x-2 text-rose-600">
                <AlertTriangle className="w-5 h-5" />
                <h3 className="font-black text-sm text-slate-900 uppercase">Send Expedited Follow-up</h3>
              </div>
              <button
                onClick={() => setActiveFollowupId(null)}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold"
              >
                &times;
              </button>
            </div>

            <p className="text-xs text-slate-500">
              This message will be dispatched directly to the responsible department head and operator.
            </p>

            <textarea
              rows={4}
              value={followupNote[activeFollowupId] || ''}
              onChange={(e) =>
                setFollowupNote((prev) => ({ ...prev, [activeFollowupId]: e.target.value }))
              }
              className="w-full text-xs p-3 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-500"
            />

            <div className="flex items-center justify-end space-x-2">
              <button
                onClick={() => setActiveFollowupId(null)}
                className="px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  alert('Expedite follow-up dispatched to department supervisor.');
                  setActiveFollowupId(null);
                }}
                className="px-4 py-1.5 text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white rounded-xl shadow-xs transition"
              >
                Send Expedite Notice
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
