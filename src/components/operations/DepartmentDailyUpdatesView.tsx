import React, { useState, useEffect, useMemo } from 'react';
import {
  Clock,
  Plus,
  Search,
  Filter,
  CheckCircle2,
  AlertTriangle,
  Building,
  Calendar,
  Layers,
  ChevronRight,
  Eye,
  FileText,
  User,
  ShieldCheck,
  RefreshCw,
  Cpu,
  BarChart3,
  X,
  CheckSquare,
  AlertOctagon,
} from 'lucide-react';
import {
  subscribeDepartmentDailyUpdates,
  subscribeDepartmentMachineCompliance,
} from '../../services/dailyOperationUpdateService';
import {
  MachineSizeDailyUpdateRecord,
  MachineComplianceSummary,
  Machine,
} from '../../types';
import { useAuth } from '../../context/AuthContext';
import { AddDailyUpdateModal } from './AddDailyUpdateModal';
import { INITIAL_DEPARTMENTS } from '../../constants';

interface DepartmentDailyUpdatesViewProps {
  departmentName: string;
  machines?: Machine[];
}

export const DepartmentDailyUpdatesView: React.FC<DepartmentDailyUpdatesViewProps> = ({
  departmentName,
  machines = [],
}) => {
  const { userProfile } = useAuth();
  const isAdmin = userProfile?.role === 'ADMIN' || departmentName === 'All Departments';

  const [selectedDeptFilter, setSelectedDeptFilter] = useState<string>(
    departmentName === 'All Departments' ? '06-A Metal Shop' : departmentName
  );

  useEffect(() => {
    if (departmentName && departmentName !== 'All Departments') {
      setSelectedDeptFilter(departmentName);
    }
  }, [departmentName]);

  const targetDept = isAdmin && departmentName === 'All Departments' ? selectedDeptFilter : departmentName;

  // Active Tab
  const [activeTab, setActiveTab] = useState<'updates' | 'compliance'>('updates');

  // Subscribed Data
  const [dailyUpdates, setDailyUpdates] = useState<MachineSizeDailyUpdateRecord[]>([]);
  const [complianceList, setComplianceList] = useState<MachineComplianceSummary[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [sizeFilter, setSizeFilter] = useState('All');

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedRecordToView, setSelectedRecordToView] = useState<MachineSizeDailyUpdateRecord | null>(null);

  // Toast
  const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => setToastMessage(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [toastMessage]);

  // Subscriptions
  useEffect(() => {
    setLoading(true);

    const unsubUpdates = subscribeDepartmentDailyUpdates(targetDept, (recs) => {
      setDailyUpdates(recs);
      setLoading(false);
    });

    const unsubCompliance = subscribeDepartmentMachineCompliance(targetDept, (list) => {
      setComplianceList(list);
    });

    return () => {
      unsubUpdates();
      unsubCompliance();
    };
  }, [targetDept]);

  // Unique sizes in compliance list
  const uniqueSizes = useMemo(() => {
    const set = new Set<string>();
    complianceList.forEach((c) => {
      if (c.machineSize) set.add(c.machineSize);
    });
    return Array.from(set);
  }, [complianceList]);

  // Filtered daily updates
  const filteredUpdates = useMemo(() => {
    return dailyUpdates.filter((u) => {
      if (sizeFilter !== 'All' && u.machineSize !== sizeFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const match =
          u.operationName.toLowerCase().includes(q) ||
          u.machineSize.toLowerCase().includes(q) ||
          u.employeeName.toLowerCase().includes(q) ||
          (u.selectedMachineNumbers || []).some((m) => m.toLowerCase().includes(q));
        if (!match) return false;
      }
      return true;
    });
  }, [dailyUpdates, sizeFilter, searchQuery]);

  // Filtered compliance records
  const filteredCompliance = useMemo(() => {
    return complianceList.filter((c) => {
      if (sizeFilter !== 'All' && c.machineSize !== sizeFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const match =
          c.machineNumber.toLowerCase().includes(q) ||
          c.model.toLowerCase().includes(q) ||
          (c.project && c.project.toLowerCase().includes(q)) ||
          (c.customer && c.customer.toLowerCase().includes(q));
        if (!match) return false;
      }
      return true;
    });
  }, [complianceList, sizeFilter, searchQuery]);

  // High-level KPI aggregations
  const totalMachinesInDept = complianceList.length;
  const completedMachinesCount = complianceList.filter((c) => c.departmentCompliance >= 100).length;
  const inProgressMachinesCount = complianceList.filter(
    (c) => c.departmentCompliance > 0 && c.departmentCompliance < 100
  ).length;
  const avgDepartmentCompliance =
    complianceList.length > 0
      ? Math.round(
          complianceList.reduce((acc, c) => acc + c.departmentCompliance, 0) / complianceList.length
        )
      : 0;

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {toastMessage && (
        <div
          className={`p-4 rounded-xl border text-xs font-bold flex items-center gap-2 shadow-md animate-in fade-in slide-in-from-top-2 duration-200 ${
            toastMessage.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-red-50 border-red-200 text-red-800'
          }`}
        >
          {toastMessage.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
          )}
          <span>{toastMessage.text}</span>
        </div>
      )}

      {/* Page Header */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center border border-blue-100">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-black text-slate-900 tracking-tight">
                  Daily Operation Updates
                </h1>
                {isAdmin ? (
                  <div className="flex items-center gap-1.5 ml-1">
                    <span className="text-[10px] font-bold text-slate-500 uppercase">Department:</span>
                    <select
                      id="daily-updates-dept-selector"
                      value={targetDept}
                      onChange={(e) => setSelectedDeptFilter(e.target.value)}
                      className="bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-900 font-bold text-xs rounded-lg px-2.5 py-1 focus:ring-2 focus:ring-blue-500 cursor-pointer shadow-2xs transition"
                    >
                      {INITIAL_DEPARTMENTS.map((d) => (
                        <option key={d.code} value={d.name}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-blue-50 text-blue-800 border border-blue-200">
                    {targetDept}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Machine-Size-Wise Operation Execution &bull; Checkbox-Based Machine Completion &bull; Live Compliance
              </p>
            </div>
          </div>
        </div>

        {/* Action Button: + ADD DAILY UPDATE */}
        <div className="flex items-center gap-2.5 self-start md:self-auto">
          <button
            id="btn-add-daily-update"
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-black shadow-sm transition flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>+ ADD DAILY UPDATE</span>
          </button>
        </div>
      </div>

      {/* KPI Stats Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-2xs">
          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Department Machines</div>
          <div className="text-2xl font-black text-slate-900 mt-1">{totalMachinesInDept}</div>
          <div className="text-[10px] text-slate-400 mt-0.5">Total machines in {targetDept}</div>
        </div>

        <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-2xs">
          <div className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">100% Compliant</div>
          <div className="text-2xl font-black text-emerald-700 mt-1">{completedMachinesCount}</div>
          <div className="text-[10px] text-emerald-600 mt-0.5">All applicable operations passed</div>
        </div>

        <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-2xs">
          <div className="text-[10px] font-bold text-blue-600 uppercase tracking-wider">In Progress</div>
          <div className="text-2xl font-black text-blue-700 mt-1">{inProgressMachinesCount}</div>
          <div className="text-[10px] text-blue-600 mt-0.5">Active machine execution</div>
        </div>

        <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-2xs">
          <div className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider">Avg Compliance</div>
          <div className="text-2xl font-black text-indigo-700 mt-1">{avgDepartmentCompliance}%</div>
          <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden mt-1.5">
            <div
              className="bg-indigo-600 h-full rounded-full transition-all duration-300"
              style={{ width: `${avgDepartmentCompliance}%` }}
            />
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs p-2 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setActiveTab('updates')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
              activeTab === 'updates'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Clock className="w-4 h-4" />
            <span>Submitted Daily Updates ({dailyUpdates.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('compliance')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
              activeTab === 'compliance'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <BarChart3 className="w-4 h-4" />
            <span>Machine Compliance Matrix ({complianceList.length})</span>
          </button>
        </div>

        {/* Filter Controls */}
        <div className="flex items-center gap-2">
          {uniqueSizes.length > 0 && (
            <select
              value={sizeFilter}
              onChange={(e) => setSizeFilter(e.target.value)}
              className="bg-slate-50 border border-slate-200 text-slate-700 text-xs font-bold rounded-lg px-2.5 py-1.5"
            >
              <option value="All">All Sizes</option>
              {uniqueSizes.map((s) => (
                <option key={s} value={s}>
                  Size {s}
                </option>
              ))}
            </select>
          )}

          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search updates or machine #..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="text-xs pl-8 pr-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 text-slate-800 placeholder:text-slate-400 focus:bg-white"
            />
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: SUBMITTED DAILY UPDATES */}
      {/* ========================================================================= */}
      {activeTab === 'updates' && (
        <div className="space-y-4">
          {loading ? (
            <div className="p-12 text-center text-slate-400 text-xs flex items-center justify-center gap-2 bg-white rounded-2xl border border-slate-200">
              <RefreshCw className="w-4 h-4 animate-spin text-blue-600" />
              <span>Loading Daily Updates from Firestore...</span>
            </div>
          ) : filteredUpdates.length === 0 ? (
            <div className="p-12 text-center bg-white rounded-2xl border border-dashed border-slate-200 text-xs text-slate-500 space-y-3">
              <Clock className="w-8 h-8 text-slate-300 mx-auto" />
              <div>
                <p className="font-bold text-slate-700 text-sm">No daily operation updates recorded yet</p>
                <p className="text-slate-400 mt-0.5">
                  Click &ldquo;+ ADD DAILY UPDATE&rdquo; above to record today&apos;s machine-size operation completion.
                </p>
              </div>
              <button
                onClick={() => setShowAddModal(true)}
                className="px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold shadow-xs hover:bg-blue-700 transition"
              >
                Record First Daily Update
              </button>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase text-[10px] font-bold">
                    <tr>
                      <th className="p-3.5">Update ID / Date</th>
                      <th className="p-3.5">Machine Size &bull; Part</th>
                      <th className="p-3.5">Operation</th>
                      <th className="p-3.5 text-center">Completed Today</th>
                      <th className="p-3.5 text-center">In Progress</th>
                      <th className="p-3.5 text-center">Delayed / Hold</th>
                      <th className="p-3.5">Operator</th>
                      <th className="p-3.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredUpdates.map((u) => {
                      const completedCount = u.completedTodayCount || 0;
                      const inProgCount = u.inProgressCount || 0;
                      const delayCount = (u.delayedCount || 0) + (u.onHoldCount || 0);

                      return (
                        <tr key={u.id || u.updateId} className="hover:bg-slate-50 transition">
                          <td className="p-3.5">
                            <span className="font-mono font-bold text-slate-900 block">{u.updateId}</span>
                            <span className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                              <Calendar className="w-3 h-3 text-slate-400" />
                              <span>{u.date}</span>
                            </span>
                          </td>

                          <td className="p-3.5">
                            <span className="font-bold text-slate-800 block">Size {u.machineSize}</span>
                            <span className="text-[11px] text-slate-500">
                              {u.partName ? `Part: ${u.partName}` : 'Standard'}
                            </span>
                          </td>

                          <td className="p-3.5 font-semibold text-blue-900">
                            {u.operationName}
                            {u.operationCode && (
                              <span className="text-[10px] text-slate-400 font-mono block">
                                Code: {u.operationCode}
                              </span>
                            )}
                          </td>

                          {/* Completed Today Count (Clickable to view exact machines) */}
                          <td className="p-3.5 text-center">
                            <button
                              onClick={() => setSelectedRecordToView(u)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold font-mono text-xs border border-emerald-200 transition"
                              title="Click to view exact machine numbers completed"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                              <span>{completedCount} machines</span>
                            </button>
                          </td>

                          <td className="p-3.5 text-center font-bold text-slate-700">
                            {inProgCount > 0 ? (
                              <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-blue-50 text-blue-800">
                                {inProgCount}
                              </span>
                            ) : (
                              <span className="text-slate-400 font-normal">0</span>
                            )}
                          </td>

                          <td className="p-3.5 text-center font-bold text-slate-700">
                            {delayCount > 0 ? (
                              <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-50 text-amber-800">
                                {delayCount}
                              </span>
                            ) : (
                              <span className="text-slate-400 font-normal">0</span>
                            )}
                          </td>

                          <td className="p-3.5 text-slate-700 font-medium">
                            <div className="flex items-center gap-1.5">
                              <User className="w-3.5 h-3.5 text-slate-400" />
                              <span>{u.employeeName}</span>
                            </div>
                          </td>

                          <td className="p-3.5 text-right">
                            <button
                              onClick={() => setSelectedRecordToView(u)}
                              className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition inline-flex items-center gap-1"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>Inspect</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: MACHINE COMPLIANCE MATRIX */}
      {/* ========================================================================= */}
      {activeTab === 'compliance' && (
        <div className="space-y-4">
          <div className="bg-white p-4 rounded-xl border border-slate-200 text-xs text-slate-600 flex items-center justify-between">
            <div>
              <span className="font-bold text-slate-800">Department Compliance Formula:</span>{' '}
              <code className="bg-slate-100 px-2 py-0.5 rounded text-indigo-700 font-mono">
                (Completed Applicable Operations ÷ Total Applicable Operations) × 100
              </code>
            </div>
            <div className="text-slate-500">
              Auto-calculated per machine &bull; Persisted to Machine Master
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase text-[10px] font-bold">
                  <tr>
                    <th className="p-3.5">Machine # &bull; Model</th>
                    <th className="p-3.5">Size</th>
                    <th className="p-3.5">Project / Customer</th>
                    <th className="p-3.5 text-center">Completed Ops</th>
                    <th className="p-3.5 text-center">Total Ops</th>
                    <th className="p-3.5 text-center">Remaining</th>
                    <th className="p-3.5 text-center">Department Compliance %</th>
                    <th className="p-3.5">Current Operation Status</th>
                    <th className="p-3.5">Last Update</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredCompliance.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="p-8 text-center text-slate-400">
                        No machines found for {targetDept}
                      </td>
                    </tr>
                  ) : (
                    filteredCompliance.map((c) => {
                      const isComplete = c.departmentCompliance >= 100;
                      return (
                        <tr key={c.machineNumber} className="hover:bg-slate-50 transition">
                          <td className="p-3.5">
                            <span className="font-mono font-bold text-slate-900 block">#{c.machineNumber}</span>
                            <span className="text-[11px] text-slate-500">{c.model}</span>
                          </td>

                          <td className="p-3.5 font-bold text-slate-700">Size {c.machineSize || 'Standard'}</td>

                          <td className="p-3.5 text-slate-600">
                            <span className="block font-medium text-slate-800">{c.project || 'Standard'}</span>
                            <span className="text-[11px] text-slate-400">{c.customer || 'Internal'}</span>
                          </td>

                          <td className="p-3.5 text-center font-bold text-emerald-700 font-mono">
                            {c.completedOpsCount}
                          </td>

                          <td className="p-3.5 text-center font-bold text-slate-700 font-mono">
                            {c.totalApplicableOpsCount > 0 ? c.totalApplicableOpsCount : '—'}
                          </td>

                          <td className="p-3.5 text-center font-bold text-slate-600 font-mono">
                            {c.remainingOpsCount}
                          </td>

                          {/* Compliance Bar */}
                          <td className="p-3.5 text-center">
                            <div className="inline-flex flex-col items-center">
                              <span
                                className={`text-xs font-black font-mono ${
                                  isComplete
                                    ? 'text-emerald-700'
                                    : c.departmentCompliance > 0
                                    ? 'text-indigo-700'
                                    : 'text-slate-400'
                                }`}
                              >
                                {c.totalApplicableOpsCount === 0
                                  ? 'No ops configured'
                                  : `${c.departmentCompliance}%`}
                              </span>
                              {c.totalApplicableOpsCount > 0 && (
                                <div className="w-16 bg-slate-100 h-1.5 rounded-full overflow-hidden mt-1">
                                  <div
                                    className={`h-full rounded-full transition-all duration-300 ${
                                      isComplete
                                        ? 'bg-emerald-600'
                                        : c.departmentCompliance > 0
                                        ? 'bg-indigo-600'
                                        : 'bg-slate-300'
                                    }`}
                                    style={{ width: `${c.departmentCompliance}%` }}
                                  />
                                </div>
                              )}
                            </div>
                          </td>

                          <td className="p-3.5">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                isComplete
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : c.currentOperationStatus.toLowerCase().includes('progress')
                                  ? 'bg-blue-100 text-blue-800'
                                  : c.currentOperationStatus.toLowerCase().includes('delayed') ||
                                    c.currentOperationStatus.toLowerCase().includes('hold')
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-slate-100 text-slate-700'
                              }`}
                            >
                              {c.currentOperationStatus}
                            </span>
                            {c.currentOperationName && (
                              <span className="text-[10px] text-slate-500 block mt-0.5">
                                {c.currentOperationName}
                              </span>
                            )}
                          </td>

                          <td className="p-3.5 text-slate-500 text-[11px]">
                            {c.lastUpdateDate ? c.lastUpdateDate.slice(0, 10) : '—'}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* INSPECT DAILY UPDATE BREAKDOWN MODAL (EXACT MACHINE NUMBERS INSPECTION) */}
      {/* ========================================================================= */}
      {selectedRecordToView && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800">
              <div>
                <h3 className="font-bold text-sm">
                  Daily Update Breakdown: {selectedRecordToView.updateId}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  {selectedRecordToView.departmentName} &bull; {selectedRecordToView.date} &bull; Recorded by{' '}
                  {selectedRecordToView.employeeName}
                </p>
              </div>
              <button
                onClick={() => setSelectedRecordToView(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-4 text-xs">
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div>
                  <span className="text-[10px] text-slate-500 uppercase font-bold block">Machine Size</span>
                  <span className="font-bold text-slate-900">Size {selectedRecordToView.machineSize}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 uppercase font-bold block">Operation</span>
                  <span className="font-bold text-blue-900">{selectedRecordToView.operationName}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 uppercase font-bold block">Total Selected</span>
                  <span className="font-bold text-slate-900">{selectedRecordToView.totalSelected} machines</span>
                </div>
              </div>

              {/* Exact Machine Numbers Recorded as Completed Today */}
              <div>
                <h4 className="font-bold text-slate-800 mb-2 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>Machines Completed Today ({selectedRecordToView.completedTodayCount})</span>
                </h4>
                <div className="p-3 bg-emerald-50/60 rounded-xl border border-emerald-200">
                  {selectedRecordToView.completedMachineNumbers &&
                  selectedRecordToView.completedMachineNumbers.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {selectedRecordToView.completedMachineNumbers.map((mNo) => (
                        <span
                          key={mNo}
                          className="px-2.5 py-1 rounded-lg bg-emerald-600 text-white font-mono font-bold text-xs shadow-2xs"
                        >
                          #{mNo}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="text-slate-500 italic">No machines marked completed in this update.</span>
                  )}
                </div>
              </div>

              {/* Individual Machine Outcomes Snapshot */}
              <div>
                <h4 className="font-bold text-slate-800 mb-2">Machine-Wise Execution Results</h4>
                <div className="border border-slate-200 rounded-xl overflow-hidden max-h-56 overflow-y-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase text-[10px]">
                      <tr>
                        <th className="p-2.5">Machine #</th>
                        <th className="p-2.5">Model</th>
                        <th className="p-2.5">Outcome</th>
                        <th className="p-2.5 text-right">Compliance After</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {(selectedRecordToView.machineWiseOutcomes || []).map((o) => (
                        <tr key={o.machineNumber}>
                          <td className="p-2.5 font-mono font-bold text-slate-900">#{o.machineNumber}</td>
                          <td className="p-2.5 text-slate-700">{o.model}</td>
                          <td className="p-2.5">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                o.outcome === 'Completed'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : o.outcome === 'In Progress'
                                  ? 'bg-blue-100 text-blue-800'
                                  : 'bg-amber-100 text-amber-800'
                              }`}
                            >
                              {o.outcome}
                            </span>
                          </td>
                          <td className="p-2.5 text-right font-mono font-bold text-emerald-700">
                            {o.departmentComplianceAfter}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {selectedRecordToView.remarks && (
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="font-bold text-slate-700 block mb-1">Remarks:</span>
                  <p className="text-slate-600">{selectedRecordToView.remarks}</p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 text-right">
              <button
                onClick={() => setSelectedRecordToView(null)}
                className="px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* ADD DAILY UPDATE MODAL */}
      {/* ========================================================================= */}
      {showAddModal && (
        <AddDailyUpdateModal
          isOpen={showAddModal}
          onClose={() => setShowAddModal(false)}
          departmentName={targetDept}
          onSuccess={(msg) => {
            setToastMessage({ type: 'success', text: msg });
            setActiveTab('updates');
          }}
        />
      )}
    </div>
  );
};
