import React, { useState, useMemo, useEffect } from 'react';
import {
  Cpu,
  Search,
  Filter,
  Layers,
  Kanban,
  Table as TableIcon,
  Clock,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  User,
  Calendar,
  Building,
  FileSpreadsheet,
  History as HistoryIcon,
  ShieldCheck,
} from 'lucide-react';
import {
  Department,
  DepartmentHandover,
  DepartmentWork,
  Machine,
  QualityDailyCheck,
  QualityOperation,
  QualityRejection,
  MachineStatus,
} from '../types';
import { INITIAL_DEPARTMENTS } from '../constants';
import { resolveMachineInfo, ResolvedMachineInfo } from '../utils/machineMonitoring';
import { exportToExcel } from '../utils/excel';
import { MachineMovementTimelineModal } from './MachineMovementTimelineModal';
import { QualityInspectionDecisionModal } from './QualityInspectionDecisionModal';
import { useAuth } from '../context/AuthContext';
import { hasQualityInspectionAccess } from '../utils/departmentUtils';

interface AllMachineMonitoringViewProps {
  machines: Machine[];
  departmentWork: DepartmentWork[];
  handovers: DepartmentHandover[];
  qualityChecks: QualityDailyCheck[];
  qualityRejections: QualityRejection[];
  qualityOps: QualityOperation[];
  selectedDepartment?: string;
  onOpenMachineDetail: (machine: Machine) => void;
}

// Visual Kanban groups
const KANBAN_COLUMNS = [
  { id: 'Design', label: '01 Design', codeMatch: ['01', 'Design'] },
  { id: 'Planning', label: '02 Planning', codeMatch: ['02', 'Planning'] },
  { id: 'Purchase', label: '03 Purchase', codeMatch: ['03', 'Purchase'] },
  { id: 'Quality', label: '04 Inward Quality', codeMatch: ['04', 'Quality', 'Inward'] },
  { id: 'Store', label: '05 Store', codeMatch: ['05', 'Store'] },
  { id: 'Metal Shop', label: '06-A Metal Shop', codeMatch: ['06-A', 'Metal Shop'] },
  { id: 'Granite Shop', label: '06-B Granite Shop', codeMatch: ['06-B', 'Granite Shop'] },
  { id: '07A_Lapping', label: '07A Lapping - Flatness', codeMatch: ['07A', 'Flatness', 'Insert'] },
  { id: '07B_Lapping', label: '07B Lapping - Y3 & Slot', codeMatch: ['07B', 'Y3', 'Slot'] },
  { id: '07C_Lapping', label: '07C Lapping - RTLT', codeMatch: ['07C', 'RTLT', 'Top Bottom'] },
  { id: 'Sub Assembly', label: '08 Sub Assembly', codeMatch: ['08', 'Sub Assembly'] },
  { id: 'Guard Fitment', label: '09 Guard Fitment', codeMatch: ['09', 'Guard Fitment'] },
  { id: 'Paint Shop', label: '10 Paint Shop', codeMatch: ['10-A', '10-B', 'Paint'] },
  { id: 'Electronics', label: '11 Electronics', codeMatch: ['11-A', '11-B', 'Electronics'] },
  { id: 'Bridge Assembly', label: '12 Bridge Assembly', codeMatch: ['12-Bridge', 'Bridge Assembly'] },
  { id: 'Assembly', label: '12 Assembly', codeMatch: ['12', 'Assembly'] },
  { id: 'IT Computer', label: '13 IT Inspection', codeMatch: ['13', 'IT', 'Computer'] },
  { id: 'Calibration', label: '14 Calibration', codeMatch: ['14', 'Calibration'] },
  { id: 'Packing', label: '15 Packing', codeMatch: ['15', 'Packing'] },
];

export const AllMachineMonitoringView: React.FC<AllMachineMonitoringViewProps> = ({
  machines,
  departmentWork,
  handovers,
  qualityChecks,
  qualityRejections,
  qualityOps,
  selectedDepartment,
  onOpenMachineDetail,
}) => {
  const { userProfile } = useAuth();
  const isQualityUser = hasQualityInspectionAccess(userProfile);
  const [viewMode, setViewMode] = useState<'table' | 'board'>('table');

  // Multi-Filters (Section 17)
  const [searchQuery, setSearchQuery] = useState('');
  const [deptFilter, setDeptFilter] = useState(
    selectedDepartment && selectedDepartment !== 'All Departments' ? selectedDepartment : 'ALL'
  );
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [modelFilter, setModelFilter] = useState('ALL');
  const [projectFilter, setProjectFilter] = useState('ALL');
  const [monthFilter, setMonthFilter] = useState('ALL');
  const [selectedTimelineMachine, setSelectedTimelineMachine] = useState<Machine | null>(null);
  const [selectedMachineForQC, setSelectedMachineForQC] = useState<Machine | null>(null);

  // Sync with persistent selected department
  useEffect(() => {
    if (selectedDepartment && selectedDepartment !== 'All Departments') {
      setDeptFilter(selectedDepartment);
    } else if (selectedDepartment === 'All Departments') {
      setDeptFilter('ALL');
    }
  }, [selectedDepartment]);

  // Resolve all machines with live data
  const resolvedMachines = useMemo(() => {
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

  // Unique options for filters
  const models = useMemo(() => {
    return Array.from(new Set(machines.map((m) => m.model).filter(Boolean))).sort();
  }, [machines]);

  const projects = useMemo(() => {
    return Array.from(new Set(machines.map((m) => m.project).filter(Boolean))).sort();
  }, [machines]);

  const months = useMemo(() => {
    return Array.from(new Set(machines.map((m) => m.planMonth).filter(Boolean))).sort();
  }, [machines]);

  // Filtered Machines
  const filteredMachines = useMemo(() => {
    return resolvedMachines.filter((m) => {
      // Search
      const q = searchQuery.toLowerCase().trim();
      const matchSearch =
        !q ||
        m.machineNumber.toLowerCase().includes(q) ||
        m.model.toLowerCase().includes(q) ||
        m.project.toLowerCase().includes(q) ||
        m.customer.toLowerCase().includes(q) ||
        m.assignedEmployee.toLowerCase().includes(q) ||
        m.currentProcess.toLowerCase().includes(q) ||
        m.currentDepartment.toLowerCase().includes(q);

      // Dept Filter
      const matchDept =
        deptFilter === 'ALL' ||
        m.currentDepartment === deptFilter ||
        m.currentDepartment.includes(deptFilter);

      // Status Filter
      const matchStatus =
        statusFilter === 'ALL' ||
        (statusFilter === 'Delayed' ? m.isDelayed : m.currentStatus === statusFilter);

      // Model Filter
      const matchModel = modelFilter === 'ALL' || m.model === modelFilter;

      // Project Filter
      const matchProject = projectFilter === 'ALL' || m.project === projectFilter;

      // Month Filter
      const matchMonth = monthFilter === 'ALL' || m.planMonth === monthFilter;

      return (
        matchSearch &&
        matchDept &&
        matchStatus &&
        matchModel &&
        matchProject &&
        matchMonth
      );
    });
  }, [
    resolvedMachines,
    searchQuery,
    deptFilter,
    statusFilter,
    modelFilter,
    projectFilter,
    monthFilter,
  ]);

  // Export to Excel
  const handleExport = () => {
    const exportData = filteredMachines.map((m) => ({
      'Machine No': m.machineNumber,
      'Model': m.model,
      'Project': m.project,
      'Customer': m.customer,
      'Plan Month': m.planMonth,
      'Current Department': m.currentDepartment,
      'Current Process': m.currentProcess,
      'Current Work': m.currentWork,
      'Employee': m.assignedEmployee,
      'Start Date': m.startDate,
      'Due Date': m.dueDate,
      'Progress %': m.progressPercent,
      'Status': m.currentStatus,
      'Delay (Days)': m.delayDays,
      'Next Department': m.nextDepartment,
      'Last Update': m.lastUpdate,
    }));
    exportToExcel(
      `Accurate_All_Machine_Monitoring_${new Date().toISOString().split('T')[0]}`,
      'Machines',
      exportData
    );
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2 text-xs font-black uppercase tracking-wider text-blue-600">
            <Cpu className="w-4 h-4" />
            <span>Plant-wide Machine Tracking</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight mt-0.5">
            All Machine Monitoring &amp; Pipeline Board
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Realtime location, stage movement, delay status, and handover progress across all shop floor machines
          </p>
        </div>

        <div className="flex items-center space-x-2">
          {/* View Toggle */}
          <div className="bg-slate-100 p-1 rounded-xl flex items-center space-x-1 border border-slate-200 text-xs font-bold">
            <button
              onClick={() => setViewMode('table')}
              className={`px-3 py-1.5 rounded-lg flex items-center space-x-1.5 transition ${
                viewMode === 'table'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <TableIcon className="w-3.5 h-3.5" />
              <span>Table View</span>
            </button>
            <button
              onClick={() => setViewMode('board')}
              className={`px-3 py-1.5 rounded-lg flex items-center space-x-1.5 transition ${
                viewMode === 'board'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Kanban className="w-3.5 h-3.5" />
              <span>Tracking Board</span>
            </button>
          </div>

          <button
            onClick={handleExport}
            className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center space-x-1.5 transition shadow-2xs"
            title="Export all filtered machines to Excel"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span className="hidden sm:inline">Export Excel</span>
          </button>
        </div>
      </div>

      {/* FILTER BAR (Section 17) */}
      <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-xs space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2.5">
          {/* Search */}
          <div className="relative lg:col-span-2">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search Machine No (e.g. 2521), Model, Customer..."
              className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-blue-500 font-medium"
            />
          </div>

          {/* Department Filter */}
          <div>
            <select
              value={deptFilter}
              onChange={(e) => setDeptFilter(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-2 text-xs font-semibold text-slate-700 outline-none"
            >
              <option value="ALL">All Departments</option>
              {INITIAL_DEPARTMENTS.map((d) => (
                <option key={d.code} value={d.name}>
                  {d.code} {d.name.replace(/^[0-9]+(-[A-Z])?\s*/, '')}
                </option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-2 text-xs font-semibold text-slate-700 outline-none"
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

          {/* Model Filter */}
          <div>
            <select
              value={modelFilter}
              onChange={(e) => setModelFilter(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-2 text-xs font-semibold text-slate-700 outline-none"
            >
              <option value="ALL">All Models</option>
              {models.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>

          {/* Month Filter */}
          <div>
            <select
              value={monthFilter}
              onChange={(e) => setMonthFilter(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-2 text-xs font-semibold text-slate-700 outline-none"
            >
              <option value="ALL">All Plan Months</option>
              {months.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center justify-between text-xs text-slate-500 font-semibold pt-1 border-t border-slate-100">
          <span>
            Showing <strong className="text-slate-800">{filteredMachines.length}</strong> of{' '}
            <strong className="text-slate-800">{machines.length}</strong> total machines
          </span>
          {(searchQuery || deptFilter !== 'ALL' || statusFilter !== 'ALL' || modelFilter !== 'ALL' || monthFilter !== 'ALL') && (
            <button
              onClick={() => {
                setSearchQuery('');
                setDeptFilter('ALL');
                setStatusFilter('ALL');
                setModelFilter('ALL');
                setMonthFilter('ALL');
              }}
              className="text-blue-600 hover:text-blue-800 font-bold"
            >
              Reset Filters
            </button>
          )}
        </div>
      </div>

      {/* VIEW MODE 1: TABLE VIEW (Section 16) */}
      {viewMode === 'table' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          {filteredMachines.length === 0 ? (
            <div className="p-16 text-center text-xs text-slate-400 bg-slate-50">
              {machines.length === 0
                ? 'No machines in the database yet. Real machines will be added or imported via Excel.'
                : 'No machines match the selected filter criteria.'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100/90 border-b border-slate-200 text-slate-700 font-bold uppercase tracking-wider text-[10px]">
                  <tr>
                    <th className="p-3">CMM No</th>
                    <th className="p-3">CMM Size</th>
                    <th className="p-3 text-center">Priority</th>
                    <th className="p-3">Current Department</th>
                    <th className="p-3">Current Process</th>
                    <th className="p-3">Current Work</th>
                    <th className="p-3">Employee</th>
                    <th className="p-3">Progress</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">Due Date</th>
                    <th className="p-3">Delay</th>
                    <th className="p-3">Delay Reason</th>
                    <th className="p-3">Next Dept</th>
                    <th className="p-3">Last Update</th>
                    <th className="p-3 text-right min-w-[120px]">Action</th>
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
                      <td className="p-3 text-center">
                        <span className="font-mono font-black text-[11px] px-2 py-0.5 rounded-full bg-slate-900 text-amber-300 border border-slate-700">
                          {m.priority || 'P01'}
                        </span>
                      </td>
                      <td className="p-3 font-semibold text-indigo-700 max-w-[140px] truncate" title={m.currentDepartment}>
                        {m.currentDepartment}
                      </td>
                      <td className="p-3 text-slate-700 max-w-[130px] truncate" title={m.currentProcess}>
                        {m.currentProcess}
                      </td>
                      <td className="p-3 font-medium text-slate-900 max-w-[150px] truncate" title={m.currentWork}>
                        {m.currentWork}
                      </td>
                      <td className="p-3 text-slate-700 flex items-center space-x-1">
                        <User className="w-3 h-3 text-slate-400" />
                        <span className="truncate max-w-[100px]">{m.assignedEmployee}</span>
                      </td>
                      <td className="p-3 font-mono">
                        <div className="flex items-center space-x-1.5">
                          <div className="w-10 h-1.5 bg-slate-200 rounded-full overflow-hidden">
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
                      <td className="p-3 text-slate-600">{m.dueDate || '-'}</td>
                      <td className="p-3 font-bold text-red-600">
                        {m.delayDays > 0 ? `${m.delayDays}d` : '-'}
                      </td>
                      <td className="p-3 text-slate-700 font-medium">
                        {m.machine.delayReason ? (
                          <span className="px-2 py-0.5 bg-amber-50 text-amber-800 rounded font-bold text-[10px] border border-amber-200">
                            {m.machine.delayReason}
                          </span>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>
                      <td className="p-3 text-slate-600 max-w-[120px] truncate" title={m.nextDepartment}>
                        {m.nextDepartment}
                      </td>
                      <td className="p-3 text-slate-500 text-[11px] whitespace-nowrap font-mono">
                        {m.lastUpdate ? new Date(m.lastUpdate).toLocaleDateString() : '-'}
                      </td>
                      <td className="p-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {isQualityUser && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedMachineForQC(m.machine);
                              }}
                              className="px-2 py-1 rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100 font-bold transition text-[11px] flex items-center gap-1 shadow-2xs"
                              title="Quality Inspection: Hold, Reject, or Accept"
                            >
                              <ShieldCheck className="w-3 h-3 text-indigo-600" />
                              <span>QC Decision</span>
                            </button>
                          )}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedTimelineMachine(m.machine);
                            }}
                            className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold transition text-[11px]"
                            title="View Machine Movement Timeline & History"
                          >
                            <HistoryIcon className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onOpenMachineDetail(m.machine);
                            }}
                            className="px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 font-bold hover:bg-blue-100 transition text-[11px]"
                          >
                            View &rarr;
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
      )}

      {/* VIEW MODE 2: MACHINE TRACKING BOARD (Visual Kanban Pipeline - Section 18) */}
      {viewMode === 'board' && (
        <div className="space-y-3">
          <div className="text-xs text-slate-500">
            Pipeline board arranged by 16 shop floor factory departments. Machines are placed dynamically under their live current department.
          </div>

          <div className="overflow-x-auto pb-4 custom-scrollbar">
            <div className="flex items-start space-x-3 min-w-max">
              {KANBAN_COLUMNS.map((col) => {
                const columnMachines = filteredMachines.filter((m) =>
                  col.codeMatch.some(
                    (cm) =>
                      m.currentDepartment.includes(cm) ||
                      m.currentDepartment === cm
                  )
                );

                return (
                  <div
                    key={col.id}
                    className="w-72 bg-slate-100/80 rounded-2xl p-3 border border-slate-200/80 flex flex-col max-h-[750px] shadow-2xs"
                  >
                    {/* Column Header */}
                    <div className="flex items-center justify-between pb-2.5 mb-2.5 border-b border-slate-200">
                      <span className="font-bold text-xs text-slate-800 tracking-wide">
                        {col.label}
                      </span>
                      <span className="bg-white text-slate-700 text-[10px] font-black px-2 py-0.5 rounded-full border border-slate-200 shadow-2xs font-mono">
                        {columnMachines.length}
                      </span>
                    </div>

                    {/* Column Body Cards */}
                    <div className="flex-1 overflow-y-auto space-y-2.5 pr-1 custom-scrollbar">
                      {columnMachines.length === 0 ? (
                        <div className="p-6 text-center text-[11px] text-slate-400 border border-dashed border-slate-300/80 rounded-xl bg-white/40">
                          No machines in this stage
                        </div>
                      ) : (
                        columnMachines.map((m) => (
                          <div
                            key={m.machine.id}
                            onClick={() => onOpenMachineDetail(m.machine)}
                            className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs hover:shadow-xs hover:border-blue-400 transition cursor-pointer text-xs space-y-2"
                          >
                            <div className="flex items-start justify-between">
                              <span className="font-mono font-black text-blue-600 text-xs">
                                Machine {m.machineNumber}
                              </span>
                              <span
                                className={`text-[9px] font-bold px-1.5 py-0.2 rounded ${
                                  m.currentStatus === 'Completed'
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : m.isDelayed
                                    ? 'bg-red-100 text-red-800'
                                    : 'bg-blue-100 text-blue-800'
                                }`}
                              >
                                {m.currentStatus}
                              </span>
                            </div>

                            <div className="font-semibold text-slate-800 text-[11px] truncate">
                              {m.model} &bull; {m.project}
                            </div>

                            <div className="text-[11px] text-slate-600 truncate bg-slate-50 p-1.5 rounded-lg border border-slate-100">
                              Work: <strong>{m.currentWork}</strong>
                            </div>

                            {/* Progress bar */}
                            <div>
                              <div className="flex items-center justify-between text-[10px] text-slate-500 mb-0.5">
                                <span>Progress</span>
                                <span className="font-bold font-mono text-slate-800">{m.progressPercent}%</span>
                              </div>
                              <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full ${
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

                            <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1 border-t border-slate-100">
                              <span>Due: {m.dueDate || 'Unscheduled'}</span>
                              {m.delayDays > 0 && (
                                <span className="text-red-600 font-bold">{m.delayDays}d delayed</span>
                              )}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Complete Machine Movement Timeline Modal */}
      <MachineMovementTimelineModal
        isOpen={Boolean(selectedTimelineMachine)}
        machine={selectedTimelineMachine}
        onClose={() => setSelectedTimelineMachine(null)}
        handovers={handovers}
      />

      {/* Quality Inspection Decision Modal - Restricted to Quality and Admin */}
      {selectedMachineForQC && isQualityUser && (
        <QualityInspectionDecisionModal
          isOpen={Boolean(selectedMachineForQC)}
          onClose={() => setSelectedMachineForQC(null)}
          machine={selectedMachineForQC}
        />
      )}
    </div>
  );
};
