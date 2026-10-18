import React, { useState, useEffect, useMemo } from 'react';
import {
  Boxes,
  Plus,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  AlertTriangle,
  FileCheck2,
  Send,
  Building,
  Calendar,
  Layers,
  ChevronRight,
  Eye,
  Sliders,
  FileText,
  User,
  ShieldCheck,
  RefreshCw,
  Check,
  X,
  History,
  TrendingUp,
  Cpu,
} from 'lucide-react';
import {
  OperationLot,
  OperationLotMachine,
  DailyLotComplianceReport,
  DepartmentOperation,
  DepartmentMachineSize,
  DepartmentPart,
  Machine,
} from '../../types';
import {
  subscribeDepartmentOperationLots,
  subscribeDepartmentDailyLotReports,
} from '../../services/operationLotService';
import {
  subscribeDepartmentMachineSizes,
  subscribeAllDepartmentParts,
  subscribeAllDepartmentOperations,
} from '../../services/operationMasterService';
import { useAuth } from '../../context/AuthContext';
import { CreateOperationLotModal } from './CreateOperationLotModal';
import { DailyLotUpdateModal } from './DailyLotUpdateModal';
import { SubmitDailyLotReportModal } from './SubmitDailyLotReportModal';
import { DepartmentOperationMasterView } from './DepartmentOperationMasterView';
import { INITIAL_DEPARTMENTS } from '../../constants';

interface DepartmentOperationLotsViewProps {
  departmentName: string;
  machines?: Machine[];
}

export const DepartmentOperationLotsView: React.FC<DepartmentOperationLotsViewProps> = ({
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

  const targetDept = (isAdmin && departmentName === 'All Departments') ? selectedDeptFilter : departmentName;

  const [activeTab, setActiveTab] = useState<
    'active_lots' | 'compliance' | 'submitted_updates' | 'lot_history' | 'reports' | 'operation_master'
  >('active_lots');

  // Operation Lots Data from Firestore
  const [lots, setLots] = useState<OperationLot[]>([]);
  const [reports, setReports] = useState<DailyLotComplianceReport[]>([]);
  const [loadingLots, setLoadingLots] = useState(true);

  // Operation Master Data
  const [machineSizes, setMachineSizes] = useState<DepartmentMachineSize[]>([]);
  const [parts, setParts] = useState<DepartmentPart[]>([]);
  const [operations, setOperations] = useState<DepartmentOperation[]>([]);

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'All' | 'ACTIVE' | 'COMPLETED' | 'ON_HOLD'>('All');

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedLotForUpdate, setSelectedLotForUpdate] = useState<OperationLot | null>(null);
  const [selectedLotForReport, setSelectedLotForReport] = useState<OperationLot | null>(null);
  const [selectedReportToView, setSelectedReportToView] = useState<DailyLotComplianceReport | null>(null);

  // Toast feedback
  const [toastMessage, setToastMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => setToastMessage(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [toastMessage]);

  // Subscribe to Department Operation Lots & Reports
  useEffect(() => {
    setLoadingLots(true);
    const unsubLots = subscribeDepartmentOperationLots(targetDept, (list) => {
      setLots(list);
      setLoadingLots(false);
    });

    const unsubReports = subscribeDepartmentDailyLotReports(targetDept, (reps) => {
      setReports(reps);
    });

    // Subscribe to Operation Master data
    const unsubSizes = subscribeDepartmentMachineSizes(targetDept, setMachineSizes);
    const unsubParts = subscribeAllDepartmentParts(targetDept, setParts);
    const unsubOps = subscribeAllDepartmentOperations(targetDept, setOperations);

    return () => {
      unsubLots();
      unsubReports();
      unsubSizes();
      unsubParts();
      unsubOps();
    };
  }, [targetDept]);

  // Filtered Active Lots
  const activeLots = useMemo(() => {
    return lots.filter((l) => l.status === 'ACTIVE');
  }, [lots]);

  const historyLots = useMemo(() => {
    return lots.filter((l) => l.status === 'COMPLETED' || l.status === 'CANCELLED');
  }, [lots]);

  const displayedLots = useMemo(() => {
    const source = activeTab === 'lot_history' ? historyLots : lots;
    return source.filter((l) => {
      if (activeTab === 'active_lots' && l.status !== 'ACTIVE') return false;
      if (statusFilter !== 'All' && l.status !== statusFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const match =
          l.lotNumber.toLowerCase().includes(q) ||
          l.operationName.toLowerCase().includes(q) ||
          l.machineSize.toLowerCase().includes(q) ||
          l.partName.toLowerCase().includes(q) ||
          (l.assignedEmployee || '').toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [lots, activeTab, historyLots, statusFilter, searchQuery]);

  // Department Machines in this department
  const deptMachines = useMemo(() => {
    return machines.filter(
      (m) =>
        (m.currentDepartment && m.currentDepartment.toLowerCase().includes(departmentName.toLowerCase())) ||
        (m.responsibleDepartment && m.responsibleDepartment.toLowerCase().includes(departmentName.toLowerCase()))
    );
  }, [machines, departmentName]);

  // Overall Department Compliance Percentage
  const overallComplianceAvg = useMemo(() => {
    if (activeLots.length === 0) return 0;
    const sum = activeLots.reduce((acc, l) => acc + (l.overallCompliance || 0), 0);
    return Math.round(sum / activeLots.length);
  }, [activeLots]);

  return (
    <div className="space-y-6">
      {/* Toast */}
      {toastMessage && (
        <div
          className={`fixed top-4 right-4 z-50 p-4 rounded-xl shadow-lg border text-xs font-bold flex items-center gap-2 animate-in fade-in slide-in-from-top-2 duration-200 ${
            toastMessage.type === 'success'
              ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
              : 'bg-red-50 text-red-900 border-red-200'
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
            <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center border border-indigo-100">
              <Boxes className="w-5 h-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-black text-slate-900 tracking-tight">
                  Operation Lot Management
                </h1>
                {isAdmin ? (
                  <div className="flex items-center gap-1.5 ml-1">
                    <span className="text-[10px] font-bold text-slate-500 uppercase">Department:</span>
                    <select
                      value={targetDept}
                      onChange={(e) => setSelectedDeptFilter(e.target.value)}
                      className="bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-900 font-bold text-xs rounded-lg px-2.5 py-1 focus:ring-2 focus:ring-indigo-500 cursor-pointer shadow-2xs transition"
                    >
                      {INITIAL_DEPARTMENTS.map((d) => (
                        <option key={d.code} value={d.name}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-indigo-50 text-indigo-800 border border-indigo-200">
                    {targetDept}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Batch machine execution &bull; Machine-wise progress tracking &bull; Roadmap compliance
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 self-start md:self-auto">
          {activeLots.length > 0 && (
            <button
              onClick={() => {
                setSelectedLotForReport(activeLots[0]);
              }}
              className="px-3.5 py-2.5 rounded-xl border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold transition flex items-center gap-1.5 shadow-2xs"
            >
              <Send className="w-4 h-4 text-indigo-600" />
              <span>SUBMIT DAILY UPDATE TO ADMIN</span>
            </button>
          )}

          <button
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black shadow-sm transition flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>+ CREATE LOT</span>
          </button>
        </div>
      </div>

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div
          onClick={() => setActiveTab('active_lots')}
          className={`p-4 bg-white rounded-xl border cursor-pointer transition shadow-2xs ${
            activeTab === 'active_lots' ? 'border-indigo-600 ring-2 ring-indigo-50' : 'border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Active Lots</div>
          <div className="text-2xl font-black text-slate-900 mt-1 font-mono">{activeLots.length}</div>
          <div className="text-[10px] text-slate-500 mt-0.5">In execution</div>
        </div>

        <div
          onClick={() => setActiveTab('compliance')}
          className={`p-4 bg-white rounded-xl border cursor-pointer transition shadow-2xs ${
            activeTab === 'compliance' ? 'border-indigo-600 ring-2 ring-indigo-50' : 'border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">Department Compliance</div>
          <div className="text-2xl font-black text-emerald-600 mt-1 font-mono">{overallComplianceAvg}%</div>
          <div className="text-[10px] text-slate-500 mt-0.5">Average lot compliance</div>
        </div>

        <div
          onClick={() => setActiveTab('submitted_updates')}
          className={`p-4 bg-white rounded-xl border cursor-pointer transition shadow-2xs ${
            activeTab === 'submitted_updates' ? 'border-indigo-600 ring-2 ring-indigo-50' : 'border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="text-[10px] font-bold text-blue-600 uppercase tracking-wider">Daily Updates to Admin</div>
          <div className="text-2xl font-black text-blue-600 mt-1 font-mono">{reports.length}</div>
          <div className="text-[10px] text-slate-500 mt-0.5">Snapshots recorded</div>
        </div>

        <div
          onClick={() => setActiveTab('operation_master')}
          className={`p-4 bg-white rounded-xl border cursor-pointer transition shadow-2xs ${
            activeTab === 'operation_master' ? 'border-indigo-600 ring-2 ring-indigo-50' : 'border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider">Configured Operations</div>
          <div className="text-2xl font-black text-indigo-900 mt-1 font-mono">{operations.length}</div>
          <div className="text-[10px] text-slate-500 mt-0.5">{machineSizes.length} Machine Sizes</div>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="flex border-b border-slate-200 space-x-6 text-sm font-semibold overflow-x-auto">
        <button
          onClick={() => setActiveTab('active_lots')}
          className={`pb-3 border-b-2 transition flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'active_lots'
              ? 'border-indigo-600 text-indigo-600 font-black'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Boxes className="w-4 h-4" />
          <span>Active Lots ({activeLots.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('compliance')}
          className={`pb-3 border-b-2 transition flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'compliance'
              ? 'border-indigo-600 text-indigo-600 font-black'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <TrendingUp className="w-4 h-4" />
          <span>Daily Machine Compliance</span>
        </button>

        <button
          onClick={() => setActiveTab('submitted_updates')}
          className={`pb-3 border-b-2 transition flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'submitted_updates'
              ? 'border-indigo-600 text-indigo-600 font-black'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <FileCheck2 className="w-4 h-4" />
          <span>Submitted Updates ({reports.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('lot_history')}
          className={`pb-3 border-b-2 transition flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'lot_history'
              ? 'border-indigo-600 text-indigo-600 font-black'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <History className="w-4 h-4" />
          <span>Lot History ({historyLots.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('operation_master')}
          className={`pb-3 border-b-2 transition flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'operation_master'
              ? 'border-indigo-600 text-indigo-600 font-black'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Sliders className="w-4 h-4" />
          <span>Operation Master</span>
        </button>
      </div>

      {/* TAB 1: ACTIVE LOTS */}
      {activeTab === 'active_lots' && (
        <div className="space-y-4">
          {/* Search bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="relative flex-1 max-w-md">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search Lot Number, Operation, Size, Operator..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs"
              />
            </div>
            <div className="text-slate-500 text-xs">
              Showing <strong>{displayedLots.length}</strong> active lots
            </div>
          </div>

          {/* Lots List */}
          {loadingLots ? (
            <div className="bg-white p-12 rounded-2xl border border-slate-200 text-center text-xs text-slate-400">
              Loading Operation Lots from Firestore...
            </div>
          ) : displayedLots.length === 0 ? (
            <div className="bg-white p-12 rounded-2xl border border-slate-200 text-center space-y-4 shadow-2xs">
              <div className="w-14 h-14 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto border border-indigo-100">
                <Boxes className="w-7 h-7" />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-slate-900">
                  No active Operation Lots in {departmentName}
                </h3>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  Create an Operation Lot to bundle multiple machines for a single operation, execute daily progress, and maintain roadmap compliance.
                </p>
              </div>
              <button
                onClick={() => setShowCreateModal(true)}
                className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black shadow-sm transition inline-flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>+ CREATE FIRST OPERATION LOT</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {displayedLots.map((l) => (
                <div
                  key={l.id}
                  className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs hover:shadow-md hover:border-indigo-200 transition space-y-4 flex flex-col justify-between"
                >
                  <div className="space-y-3">
                    {/* Header */}
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="font-mono text-xs font-black text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100">
                          {l.lotNumber}
                        </span>
                        <h4 className="text-sm font-bold text-slate-900 mt-1 line-clamp-1">
                          {l.operationName}
                        </h4>
                      </div>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800">
                        {l.status}
                      </span>
                    </div>

                    {/* Metadata tags */}
                    <div className="grid grid-cols-2 gap-2 text-xs bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                      <div>
                        <span className="text-[10px] text-slate-400 font-bold uppercase">Size</span>
                        <div className="font-bold text-slate-800">{l.machineSize || 'All'}</div>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 font-bold uppercase">Part</span>
                        <div className="font-bold text-slate-800">{l.partName || 'General'}</div>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 font-bold uppercase">Date</span>
                        <div className="font-medium text-slate-700 font-mono text-[11px]">{l.lotDate}</div>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 font-bold uppercase">Operator</span>
                        <div className="font-medium text-slate-700 truncate">{l.assignedEmployee || 'Operator'}</div>
                      </div>
                    </div>

                    {/* Progress Bar & Counters */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs font-semibold">
                        <span className="text-slate-600">Compliance</span>
                        <span className="font-mono text-indigo-700 font-bold">{l.overallCompliance}%</span>
                      </div>
                      <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-indigo-600 rounded-full transition-all"
                          style={{ width: `${Math.min(100, Math.max(0, l.overallCompliance))}%` }}
                        />
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
                        <span>Total: <strong>{l.totalMachines}</strong></span>
                        <span className="text-emerald-700">Done: <strong>{l.completedMachines}</strong></span>
                        <span className="text-blue-700">WIP: <strong>{l.inProgressMachines}</strong></span>
                        <span className="text-slate-400">Pending: <strong>{l.pendingMachines}</strong></span>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2 text-xs">
                    <button
                      onClick={() => setSelectedLotForUpdate(l)}
                      className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold shadow-2xs transition flex items-center gap-1"
                    >
                      <Sliders className="w-3.5 h-3.5" />
                      <span>Update Progress</span>
                    </button>

                    <button
                      onClick={() => setSelectedLotForReport(l)}
                      className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-bold transition flex items-center gap-1"
                      title="Submit daily snapshot to Admin"
                    >
                      <Send className="w-3 h-3 text-indigo-600" />
                      <span>Daily Update</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: DAILY MACHINE COMPLIANCE */}
      {activeTab === 'compliance' && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs">
          <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-xs">
            <span className="font-bold text-slate-800">
              Department Machine Compliance Matrix ({deptMachines.length} machines)
            </span>
            <span className="text-slate-500 text-[11px]">
              Compliance = (Completed Operations / Total Applicable Operations) &times; 100
            </span>
          </div>

          {deptMachines.length === 0 ? (
            <div className="p-12 text-center text-xs text-slate-400">
              No machines assigned to {departmentName} currently.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-white border-b border-slate-200 text-slate-500 font-bold uppercase text-[10px]">
                  <tr>
                    <th className="p-3">Machine #</th>
                    <th className="p-3">Model / Size</th>
                    <th className="p-3">Customer / Project</th>
                    <th className="p-3">Current Active Operation</th>
                    <th className="p-3">Status</th>
                    <th className="p-3 text-right">Compliance %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {deptMachines.map((m) => {
                    const comp = m.departmentCompliance ?? m.compliancePercentage ?? (m.progress || 0);
                    return (
                      <tr key={m.id || m.machineNumber} className="hover:bg-slate-50">
                        <td className="p-3 font-mono font-bold text-slate-900">#{m.machineNumber}</td>
                        <td className="p-3 font-semibold text-slate-800">{m.model || 'Standard'}</td>
                        <td className="p-3 text-slate-600">
                          <div>{m.customer || 'Internal'}</div>
                          {m.project && <div className="text-[10px] text-slate-400">Proj: {m.project}</div>}
                        </td>
                        <td className="p-3">
                          <span className="font-medium text-slate-800">
                            {m.activeOperationName || m.currentOperation || 'No Active Lot'}
                          </span>
                        </td>
                        <td className="p-3">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700">
                            {m.currentOperationStatus || m.currentStatus || 'In Progress'}
                          </span>
                        </td>
                        <td className="p-3 text-right">
                          <div className="inline-flex items-center gap-2">
                            <div className="w-20 bg-slate-100 h-1.5 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-emerald-600 rounded-full"
                                style={{ width: `${Math.min(100, Math.max(0, comp))}%` }}
                              />
                            </div>
                            <span className="font-mono font-bold text-slate-900 w-10 text-right">{comp}%</span>
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
      )}

      {/* TAB 3: SUBMITTED UPDATES */}
      {activeTab === 'submitted_updates' && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs">
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-xs">
              <span className="font-bold text-slate-800">
                Daily Lot Compliance Reports Submitted to Admin
              </span>
              <span className="font-mono text-slate-500 text-[11px]">{reports.length} snapshot(s)</span>
            </div>

            {reports.length === 0 ? (
              <div className="p-12 text-center text-xs text-slate-400 space-y-2">
                <p>No daily reports submitted to Admin yet.</p>
                <p className="text-[11px]">
                  Click <strong>&quot;SUBMIT DAILY UPDATE TO ADMIN&quot;</strong> on any active lot to generate a permanent report.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-white border-b border-slate-200 text-slate-500 font-bold uppercase text-[10px]">
                    <tr>
                      <th className="p-3">Report #</th>
                      <th className="p-3">Date</th>
                      <th className="p-3">Lot Reference</th>
                      <th className="p-3">Operation</th>
                      <th className="p-3">Machines Logged</th>
                      <th className="p-3">Compliance</th>
                      <th className="p-3">Submitted By</th>
                      <th className="p-3 text-right">View Snapshot</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {reports.map((r) => (
                      <tr key={r.id} className="hover:bg-slate-50">
                        <td className="p-3 font-mono font-bold text-indigo-700">{r.reportNumber}</td>
                        <td className="p-3 font-mono text-slate-600">{r.date}</td>
                        <td className="p-3 font-mono text-slate-700">{r.lotNumber || '-'}</td>
                        <td className="p-3 font-semibold text-slate-800">{r.operationName || 'Lot Execution'}</td>
                        <td className="p-3 font-bold text-slate-900">{r.machinesUpdated} machines</td>
                        <td className="p-3 font-mono font-bold text-emerald-700">{r.overallDepartmentCompliance}%</td>
                        <td className="p-3 text-slate-600">{r.submittedBy}</td>
                        <td className="p-3 text-right">
                          <button
                            onClick={() => setSelectedReportToView(r)}
                            className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition"
                            title="View Report Details"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 4: LOT HISTORY */}
      {activeTab === 'lot_history' && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs">
          <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-xs">
            <span className="font-bold text-slate-800">Archived &amp; Completed Operation Lots</span>
            <span className="font-mono text-slate-500">{historyLots.length} lot(s)</span>
          </div>

          {historyLots.length === 0 ? (
            <div className="p-12 text-center text-xs text-slate-400">
              No completed or archived lots in history yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-white border-b border-slate-200 text-slate-500 font-bold uppercase text-[10px]">
                  <tr>
                    <th className="p-3">Lot #</th>
                    <th className="p-3">Date</th>
                    <th className="p-3">Operation</th>
                    <th className="p-3">Size / Part</th>
                    <th className="p-3">Total Machines</th>
                    <th className="p-3">Status</th>
                    <th className="p-3 text-right">Compliance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {historyLots.map((l) => (
                    <tr key={l.id} className="hover:bg-slate-50">
                      <td className="p-3 font-mono font-bold text-slate-900">{l.lotNumber}</td>
                      <td className="p-3 font-mono text-slate-600">{l.lotDate}</td>
                      <td className="p-3 font-semibold text-slate-800">{l.operationName}</td>
                      <td className="p-3 text-slate-600">
                        {l.machineSize} &bull; {l.partName}
                      </td>
                      <td className="p-3 font-bold text-slate-900">{l.totalMachines}</td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700">
                          {l.status}
                        </span>
                      </td>
                      <td className="p-3 text-right font-mono font-bold text-emerald-700">
                        {l.overallCompliance}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 5: OPERATION MASTER EMBED */}
      {activeTab === 'operation_master' && (
        <div className="space-y-4">
          <DepartmentOperationMasterView departmentName={targetDept} />
        </div>
      )}

      {/* Modals */}
      <CreateOperationLotModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        departmentName={targetDept}
        operations={operations}
        machineSizes={machineSizes}
        parts={parts}
        currentUserProfile={userProfile}
        onSuccess={(msg) => setToastMessage({ type: 'success', text: msg })}
      />

      {selectedLotForUpdate && (
        <DailyLotUpdateModal
          isOpen={Boolean(selectedLotForUpdate)}
          onClose={() => setSelectedLotForUpdate(null)}
          lot={selectedLotForUpdate}
          currentUserProfile={userProfile}
          onSuccess={(msg) => setToastMessage({ type: 'success', text: msg })}
        />
      )}

      {selectedLotForReport && (
        <SubmitDailyLotReportModal
          isOpen={Boolean(selectedLotForReport)}
          onClose={() => setSelectedLotForReport(null)}
          departmentName={targetDept}
          lot={selectedLotForReport}
          currentUserProfile={userProfile}
          onSuccess={(msg) => setToastMessage({ type: 'success', text: msg })}
        />
      )}

      {/* View Submitted Report Modal */}
      {selectedReportToView && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
              <div>
                <h3 className="font-bold text-sm">
                  Daily Report Snapshot: {selectedReportToView.reportNumber}
                </h3>
                <p className="text-xs text-slate-400">
                  {selectedReportToView.departmentName} &bull; {selectedReportToView.date}
                </p>
              </div>
              <button
                onClick={() => setSelectedReportToView(null)}
                className="p-1 text-slate-400 hover:text-white rounded"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4 text-xs">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <div className="p-2.5 bg-slate-50 rounded-lg">
                  <span className="text-[10px] text-slate-400 uppercase font-bold">Machines Updated</span>
                  <div className="text-base font-bold text-slate-900">{selectedReportToView.machinesUpdated}</div>
                </div>
                <div className="p-2.5 bg-emerald-50 rounded-lg">
                  <span className="text-[10px] text-emerald-700 uppercase font-bold">Completed</span>
                  <div className="text-base font-bold text-emerald-800">{selectedReportToView.machinesCompletedToday}</div>
                </div>
                <div className="p-2.5 bg-blue-50 rounded-lg">
                  <span className="text-[10px] text-blue-700 uppercase font-bold">In-Progress</span>
                  <div className="text-base font-bold text-blue-800">{selectedReportToView.machinesInProgress}</div>
                </div>
                <div className="p-2.5 bg-indigo-50 rounded-lg">
                  <span className="text-[10px] text-indigo-700 uppercase font-bold">Compliance</span>
                  <div className="text-base font-bold text-indigo-900">{selectedReportToView.overallDepartmentCompliance}%</div>
                </div>
              </div>

              {selectedReportToView.remarks && (
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="font-bold text-slate-700 block mb-1">Remarks:</span>
                  <p className="text-slate-600">{selectedReportToView.remarks}</p>
                </div>
              )}

              {selectedReportToView.exceptions && (
                <div className="p-3 bg-amber-50 rounded-xl border border-amber-200">
                  <span className="font-bold text-amber-800 block mb-1">Exceptions / Blockers:</span>
                  <p className="text-amber-700">{selectedReportToView.exceptions}</p>
                </div>
              )}

              <div>
                <h4 className="font-bold text-slate-800 mb-2">Machine-Wise Snapshot</h4>
                <div className="border border-slate-200 rounded-xl overflow-hidden max-h-56 overflow-y-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase text-[10px]">
                      <tr>
                        <th className="p-2.5">Machine #</th>
                        <th className="p-2.5">Model</th>
                        <th className="p-2.5">Status</th>
                        <th className="p-2.5 text-right">Progress</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {(selectedReportToView.machineWiseDetails || []).map((m) => (
                        <tr key={m.machineNumber}>
                          <td className="p-2.5 font-mono font-bold text-slate-900">#{m.machineNumber}</td>
                          <td className="p-2.5 text-slate-700">{m.model}</td>
                          <td className="p-2.5 font-semibold text-slate-800">{m.status}</td>
                          <td className="p-2.5 text-right font-mono font-bold text-emerald-700">{m.progress}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-200 text-right">
              <button
                onClick={() => setSelectedReportToView(null)}
                className="px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
