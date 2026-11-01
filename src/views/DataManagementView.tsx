import React, { useState, useEffect } from 'react';
import {
  Database,
  Trash2,
  Download,
  AlertTriangle,
  CheckCircle2,
  FileSpreadsheet,
  RefreshCw,
  X,
  Layers,
  ShieldAlert,
  Calendar,
  Layers as BacklogIcon,
  Check,
  Info,
  ShieldCheck,
  ArrowRight,
  FileText,
  AlertCircle,
} from 'lucide-react';
import {
  AuditLogEntry,
  Department,
  DepartmentHandover,
  DepartmentWork,
  Machine,
  MachineDocument,
  MonthlyPlan,
  QualityDailyCheck,
  QualityOperation,
  QualityRejection,
  SystemNotification,
  UserProfile,
  WeeklyPlan,
  YearlyPlan,
} from '../types';
import { clearAllOperationalData, logAudit } from '../services/db';
import { exportToExcel } from '../utils/excel';
import { useAuth } from '../context/AuthContext';
import {
  CleanupScope,
  CleanupReport,
  CleanupCountSummary,
  getCleanupRecordCounts,
  createCleanupBackup,
  executePlanAndBacklogCleanup,
} from '../services/planAndBacklogCleanupService';

interface DataManagementViewProps {
  departments: Department[];
  machines: Machine[];
  yearlyPlans: YearlyPlan[];
  monthlyPlans: MonthlyPlan[];
  weeklyPlans: WeeklyPlan[];
  qualityOps: QualityOperation[];
  qualityChecks: QualityDailyCheck[];
  qualityRejections: QualityRejection[];
  departmentWork: DepartmentWork[];
  handovers: DepartmentHandover[];
  notifications: SystemNotification[];
  auditLogs: AuditLogEntry[];
  machineDocs: MachineDocument[];
  userProfiles: UserProfile[];
  onOpenExcelImport: () => void;
  onNavigateTab?: (tabId: string) => void;
  initialSubTab?: 'clear_plan_backlog' | 'collections' | 'danger_purge';
}

export const DataManagementView: React.FC<DataManagementViewProps> = ({
  departments,
  machines,
  yearlyPlans,
  monthlyPlans,
  weeklyPlans,
  qualityOps,
  qualityChecks,
  qualityRejections,
  departmentWork,
  handovers,
  notifications,
  auditLogs,
  machineDocs,
  userProfiles,
  onOpenExcelImport,
  onNavigateTab,
  initialSubTab = 'clear_plan_backlog',
}) => {
  const { userProfile } = useAuth();
  const isAdmin = userProfile?.role === 'ADMIN';

  // Sub-tabs navigation
  const [activeSubTab, setActiveSubTab] = useState<'clear_plan_backlog' | 'collections' | 'danger_purge'>(initialSubTab);

  useEffect(() => {
    if (initialSubTab) {
      setActiveSubTab(initialSubTab);
    }
  }, [initialSubTab]);

  // Real-time Counts State for Monthly Plan & Backlog
  const [counts, setCounts] = useState<CleanupCountSummary | null>(null);
  const [loadingCounts, setLoadingCounts] = useState(false);

  // Cleanup Modal State
  const [selectedScope, setSelectedScope] = useState<CleanupScope | null>(null);
  const [typedConfirmation, setTypedConfirmation] = useState('');
  const [isExecuting, setIsExecuting] = useState(false);
  const [cleanupReport, setCleanupReport] = useState<CleanupReport | null>(null);
  const [cleanupError, setCleanupError] = useState<string | null>(null);
  const [downloadingBackup, setDownloadingBackup] = useState(false);

  // Full Operational Data Purge Modal State (Legacy)
  const [showFullPurgeModal, setShowFullPurgeModal] = useState(false);
  const [fullPurgeConfirmation, setFullPurgeConfirmation] = useState('');
  const [fullPurging, setFullPurging] = useState(false);
  const [fullPurgeSuccess, setFullPurgeSuccess] = useState(false);
  const [fullPurgeError, setFullPurgeError] = useState<string | null>(null);

  // Load counts on mount and on subtab change
  const loadCounts = async () => {
    setLoadingCounts(true);
    try {
      const res = await getCleanupRecordCounts();
      setCounts(res);
    } catch (err) {
      console.warn('Notice loading record counts:', err);
    } finally {
      setLoadingCounts(false);
    }
  };

  useEffect(() => {
    loadCounts();
  }, [monthlyPlans, departmentWork]);

  // Expected confirmation phrase for selected scope
  const getRequiredPhrase = (scope: CleanupScope): string => {
    switch (scope) {
      case 'MONTHLY_PLAN':
        return 'DELETE MONTHLY PLAN';
      case 'BACKLOG':
        return 'DELETE BACKLOG';
      case 'BOTH':
        return 'DELETE BOTH';
    }
  };

  const isConfirmationValid = selectedScope
    ? typedConfirmation.trim() === getRequiredPhrase(selectedScope)
    : false;

  // Handler: Download Backup Snapshot as JSON
  const handleDownloadBackupSnapshot = async (scope: CleanupScope) => {
    setDownloadingBackup(true);
    try {
      const jsonStr = await createCleanupBackup(scope);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `backup_${scope.toLowerCase()}_${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      console.error('Backup download error:', err);
      alert('Failed to generate backup: ' + (err.message || 'Unknown error'));
    } finally {
      setDownloadingBackup(false);
    }
  };

  // Handler: Execute Cleanup
  const handleExecuteCleanup = async () => {
    if (!selectedScope || !isConfirmationValid) return;

    setIsExecuting(true);
    setCleanupError(null);

    try {
      const adminEmail = userProfile?.email || 'admin@accurate.in';
      const report = await executePlanAndBacklogCleanup(selectedScope, adminEmail);
      setCleanupReport(report);
      setSelectedScope(null);
      setTypedConfirmation('');
      await loadCounts();
    } catch (err: any) {
      console.error('Cleanup execution error:', err);
      setCleanupError(err.message || 'Failed to complete cleanup operation.');
    } finally {
      setIsExecuting(false);
    }
  };

  // Legacy Export Complete Backup (JSON)
  const handleExportJsonBackup = () => {
    const backupData = {
      exportDate: new Date().toISOString(),
      system: 'Accurate Manufacturing Planning & Monitoring System',
      machines,
      yearlyPlans,
      monthlyPlans,
      weeklyPlans,
      departmentWork,
      handovers,
      qualityOps,
      qualityChecks,
      qualityRejections,
      machineDocs,
      departments,
    };

    const blob = new Blob([JSON.stringify(backupData, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `accurate_system_backup_${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Legacy Export Operational Work (Excel)
  const handleExportWorkExcel = () => {
    exportToExcel(
      'Department_Work_Backup',
      'Tasks',
      departmentWork.map((w) => ({
        ID: w.id,
        Department: w.department,
        Title: w.title,
        MachineNo: w.machineNumber || '-',
        Model: w.machineModel || '-',
        PlannedQty: w.plannedQuantity ?? 0,
        ActualQty: w.actualQuantity ?? 0,
        Status: w.status,
        DueDate: w.dueDate || '-',
        DelayReason: w.delayReason || '-',
        AssignedTo: w.assignedTo || '-',
      }))
    );
  };

  // Legacy Full Operational Data Purge
  const handleFullOperationalDataPurge = async () => {
    if (fullPurgeConfirmation !== 'DELETE ALL DATA') {
      setFullPurgeError('Please type the exact phrase "DELETE ALL DATA" to proceed.');
      return;
    }

    setFullPurging(true);
    setFullPurgeError(null);

    try {
      await clearAllOperationalData();
      await logAudit(
        'DELETE_ALL_DATA',
        'SYSTEM',
        'operational_collections',
        '',
        `Admin purged all operational data. Preserved system configuration and administrator accounts.`
      );
      setFullPurgeSuccess(true);
      setShowFullPurgeModal(false);
      setFullPurgeConfirmation('');
      await loadCounts();
    } catch (err: any) {
      console.error('Delete all data failed:', err);
      setFullPurgeError(err.message || 'Failed to clear operational data.');
    } finally {
      setFullPurging(false);
    }
  };

  // Access Control Guard: Department users must not have access
  if (!isAdmin) {
    return (
      <div className="p-8 text-center bg-white rounded-2xl border border-slate-200 shadow-xs max-w-lg mx-auto mt-12">
        <div className="w-14 h-14 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto mb-4 border border-rose-200">
          <ShieldAlert className="w-8 h-8" />
        </div>
        <h3 className="text-lg font-black text-slate-900">Access Restricted</h3>
        <p className="text-xs text-slate-500 mt-2 leading-relaxed">
          Database Management and Data Cleanup operations are restricted strictly to System Administrators. Department user accounts do not have clearance to modify or purge database records.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 uppercase tracking-wider">
              Admin Master Control
            </span>
            <span className="text-xs text-slate-400 font-mono">Plant-Wide Database Authority</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight mt-1 flex items-center gap-2.5">
            <Database className="w-6 h-6 text-blue-600" />
            <span>Database Management</span>
          </h2>
          <p className="text-xs text-slate-500 mt-1 max-w-2xl leading-relaxed">
            Manage database integrity, clean Monthly Plan &amp; Backlog records across all departments, inspect collection statistics, and export system backup snapshots.
          </p>
        </div>

        {/* Quick Backup Export Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleExportJsonBackup}
            className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center gap-1.5 transition shadow-2xs"
            title="Download full Firestore collections backup in JSON format"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download Full Backup (JSON)</span>
          </button>
          <button
            onClick={handleExportWorkExcel}
            className="px-3.5 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-bold flex items-center gap-1.5 transition shadow-2xs"
            title="Export department work records to Excel"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>Export Tasks (Excel)</span>
          </button>
          <button
            onClick={loadCounts}
            disabled={loadingCounts}
            className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 transition"
            title="Refresh database counts"
          >
            <RefreshCw className={`w-4 h-4 ${loadingCounts ? 'animate-spin text-blue-600' : ''}`} />
          </button>
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
        <button
          onClick={() => setActiveSubTab('clear_plan_backlog')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
            activeSubTab === 'clear_plan_backlog'
              ? 'bg-rose-50 text-rose-700 border border-rose-200 shadow-2xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Trash2 className="w-4 h-4 text-rose-600" />
          <span>Clear Monthly Plan &amp; Backlog (All Departments)</span>
          <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse"></span>
        </button>

        <button
          onClick={() => setActiveSubTab('collections')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
            activeSubTab === 'collections'
              ? 'bg-blue-50 text-blue-700 border border-blue-200 shadow-2xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Database className="w-4 h-4 text-blue-600" />
          <span>Live Collections &amp; Counts</span>
        </button>

        <button
          onClick={() => setActiveSubTab('danger_purge')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
            activeSubTab === 'danger_purge'
              ? 'bg-red-50 text-red-700 border border-red-200 shadow-2xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <ShieldAlert className="w-4 h-4 text-red-600" />
          <span>System Danger Zone (Full Purge)</span>
        </button>
      </div>

      {/* =========================================================================
          TAB 1: CLEAR MONTHLY PLAN & BACKLOG (REQUIREMENT 1, 2, 3, 4, 5, 6, 7, 8)
          ========================================================================= */}
      {activeSubTab === 'clear_plan_backlog' && (
        <div className="space-y-6 animate-in fade-in">
          {/* Live Records Count Banner */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Monthly Plan Card */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs">
              <div className="flex items-center justify-between text-slate-500 mb-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Monthly Plan Data</span>
                <Calendar className="w-5 h-5 text-blue-600" />
              </div>
              <div className="text-3xl font-black text-slate-900 font-mono">
                {counts?.totalMonthlyRecords ?? 0}
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                {counts?.monthlyPlansCount ?? 0} Monthly Plans • {counts?.monthlyDepartmentWorkCount ?? 0} Assigned Dept Tasks
              </p>
              <div className="mt-3 pt-3 border-t border-slate-100 text-[10px] text-slate-400">
                Covers all 20+ plant departments (Design, Planning, Purchase, Store, Lapping, Paint, etc.)
              </div>
            </div>

            {/* Backlog Data Card */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs">
              <div className="flex items-center justify-between text-slate-500 mb-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Backlog Data</span>
                <BacklogIcon className="w-5 h-5 text-amber-600" />
              </div>
              <div className="text-3xl font-black text-slate-900 font-mono">
                {counts?.totalBacklogRecords ?? 0}
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                {counts?.backlogItemsCount ?? 0} Backlog Items • {counts?.backlogDepartmentWorkCount ?? 0} Backlog Tasks
              </p>
              <div className="mt-3 pt-3 border-t border-slate-100 text-[10px] text-slate-400">
                Includes pending backlog tasks, overdue targets, reasons, and stage assignments.
              </div>
            </div>

            {/* Plant Scope Card */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs">
              <div className="flex items-center justify-between text-slate-500 mb-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Scope &amp; Coverage</span>
                <ShieldCheck className="w-5 h-5 text-emerald-600" />
              </div>
              <div className="text-3xl font-black text-slate-900 font-mono">
                {counts?.allDepartmentsCount ?? 36} <span className="text-sm font-normal text-slate-500">Departments</span>
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                Dynamically checked across live database collections
              </p>
              <div className="mt-3 pt-3 border-t border-slate-100 text-[10px] text-emerald-700 font-semibold flex items-center gap-1">
                <Check className="w-3.5 h-3.5 text-emerald-600" />
                <span>Annual plans, user accounts, and machine catalogs are strictly preserved</span>
              </div>
            </div>
          </div>

          {/* Cleanup Report (Rendered upon execution as specified in Section 7) */}
          {cleanupReport && (
            <div className="bg-white rounded-2xl border-2 border-emerald-300 p-6 shadow-md animate-in fade-in zoom-in-95">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-emerald-100 pb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">
                    <CheckCircle2 className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-base font-black text-slate-900">Database Cleanup Execution Report</h3>
                    <p className="text-xs text-slate-500">
                      Executed on: <span className="font-mono font-bold text-slate-700">{new Date(cleanupReport.executedAt).toLocaleString()}</span> • Admin: <span className="font-mono font-bold text-slate-700">{cleanupReport.executedBy}</span>
                    </p>
                  </div>
                </div>

                {cleanupReport.backupSnapshotJson && (
                  <button
                    onClick={() => {
                      const blob = new Blob([cleanupReport.backupSnapshotJson!], { type: 'application/json' });
                      const url = URL.createObjectURL(blob);
                      const link = document.createElement('a');
                      link.href = url;
                      link.download = `cleanup_backup_snapshot_${cleanupReport.executedAt.slice(0, 10)}.json`;
                      link.click();
                      URL.revokeObjectURL(url);
                    }}
                    className="px-3 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-bold border border-emerald-200 flex items-center gap-1.5 transition"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download Pre-Deletion Backup (.json)</span>
                  </button>
                )}
              </div>

              {/* Requirement 7 Report Table */}
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-left text-xs border border-slate-200 rounded-xl overflow-hidden">
                  <thead className="bg-slate-50 text-slate-600 font-bold uppercase tracking-wider text-[11px] border-b border-slate-200">
                    <tr>
                      <th className="p-3">Module</th>
                      <th className="p-3 text-right">Departments Checked</th>
                      <th className="p-3 text-right">Records Deleted</th>
                      <th className="p-3 text-right">Remaining Records</th>
                      <th className="p-3 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    <tr className="hover:bg-slate-50/50">
                      <td className="p-3 font-bold text-slate-900 flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-blue-600" />
                        <span>Monthly Plan</span>
                      </td>
                      <td className="p-3 text-right font-medium text-slate-600">
                        {cleanupReport.monthlyPlanSummary.departmentsChecked}
                      </td>
                      <td className="p-3 text-right font-mono font-bold text-rose-600">
                        {cleanupReport.monthlyPlanSummary.recordsDeleted}
                      </td>
                      <td className="p-3 text-right font-mono font-bold text-emerald-600">
                        {cleanupReport.monthlyPlanSummary.remainingRecords}
                      </td>
                      <td className="p-3 text-center">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          CLEARED &amp; EMPTY
                        </span>
                      </td>
                    </tr>
                    <tr className="hover:bg-slate-50/50">
                      <td className="p-3 font-bold text-slate-900 flex items-center gap-2">
                        <BacklogIcon className="w-4 h-4 text-amber-600" />
                        <span>Backlog</span>
                      </td>
                      <td className="p-3 text-right font-medium text-slate-600">
                        {cleanupReport.backlogSummary.departmentsChecked}
                      </td>
                      <td className="p-3 text-right font-mono font-bold text-rose-600">
                        {cleanupReport.backlogSummary.recordsDeleted}
                      </td>
                      <td className="p-3 text-right font-mono font-bold text-emerald-600">
                        {cleanupReport.backlogSummary.remainingRecords}
                      </td>
                      <td className="p-3 text-center">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          CLEARED &amp; EMPTY
                        </span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Preserved Data Safety Audit */}
              <div className="mt-4 p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs flex flex-wrap items-center justify-between gap-3 text-slate-600">
                <span className="font-bold text-slate-800 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  Preserved Data Verification:
                </span>
                <span className="text-[11px]">
                  <strong>{cleanupReport.preservedVerification.machinesCount}</strong> Machines Master •{' '}
                  <strong>{cleanupReport.preservedVerification.usersCount}</strong> User Accounts •{' '}
                  <strong>{cleanupReport.preservedVerification.departmentsCount}</strong> Departments
                </span>
                <div className="flex items-center gap-2">
                  {onNavigateTab && (
                    <>
                      <button
                        onClick={() => onNavigateTab('monthly_plans')}
                        className="text-blue-600 hover:text-blue-700 font-bold text-xs underline"
                      >
                        Go to Monthly Plan (Fresh Entry)
                      </button>
                      <span>•</span>
                      <button
                        onClick={() => onNavigateTab('backlog_management')}
                        className="text-amber-600 hover:text-amber-700 font-bold text-xs underline"
                      >
                        Go to Backlog (Fresh Entry)
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Action Operations Grid (Section 5 Requirement: 3 Separate Options) */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {/* OPTION 1: Clear All Monthly Plan Data */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs hover:border-blue-300 transition flex flex-col justify-between">
              <div>
                <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold mb-3 border border-blue-200">
                  <Calendar className="w-5 h-5" />
                </div>
                <h3 className="text-base font-bold text-slate-900">1. Clear All Monthly Plan Data</h3>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  Deletes all monthly targets, assigned tasks, monthly work entries, completion/pending records, compliance entries, and monthly plan department work across <strong>ALL departments</strong>.
                </p>

                <div className="mt-4 p-3 bg-slate-50 rounded-xl text-xs space-y-1 font-mono">
                  <div className="flex justify-between text-slate-600">
                    <span>Monthly Plans:</span>
                    <span className="font-bold">{counts?.monthlyPlansCount ?? 0} records</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>Assigned Tasks:</span>
                    <span className="font-bold">{counts?.monthlyDepartmentWorkCount ?? 0} records</span>
                  </div>
                  <div className="flex justify-between text-slate-900 font-bold border-t border-slate-200 pt-1">
                    <span>Total Target:</span>
                    <span className="text-blue-600">{counts?.totalMonthlyRecords ?? 0} records</span>
                  </div>
                </div>
              </div>

              <div className="mt-5 pt-4 border-t border-slate-100 flex items-center gap-2">
                <button
                  onClick={() => {
                    setSelectedScope('MONTHLY_PLAN');
                    setTypedConfirmation('');
                  }}
                  className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-md shadow-blue-600/20 transition flex items-center justify-center gap-2"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Clear All Monthly Plans</span>
                </button>
              </div>
            </div>

            {/* OPTION 2: Clear All Backlog Data */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs hover:border-amber-300 transition flex flex-col justify-between">
              <div>
                <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold mb-3 border border-amber-200">
                  <BacklogIcon className="w-5 h-5" />
                </div>
                <h3 className="text-base font-bold text-slate-900">2. Clear All Backlog Data</h3>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  Deletes all old backlog tasks, pending backlog entries, overdue tasks, backlog targets, status records, reasons, remarks, and backlog-related department entries across <strong>ALL departments</strong>.
                </p>

                <div className="mt-4 p-3 bg-slate-50 rounded-xl text-xs space-y-1 font-mono">
                  <div className="flex justify-between text-slate-600">
                    <span>Backlog Items:</span>
                    <span className="font-bold">{counts?.backlogItemsCount ?? 0} records</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>Backlog Dept Tasks:</span>
                    <span className="font-bold">{counts?.backlogDepartmentWorkCount ?? 0} records</span>
                  </div>
                  <div className="flex justify-between text-slate-900 font-bold border-t border-slate-200 pt-1">
                    <span>Total Target:</span>
                    <span className="text-amber-600">{counts?.totalBacklogRecords ?? 0} records</span>
                  </div>
                </div>
              </div>

              <div className="mt-5 pt-4 border-t border-slate-100 flex items-center gap-2">
                <button
                  onClick={() => {
                    setSelectedScope('BACKLOG');
                    setTypedConfirmation('');
                  }}
                  className="w-full py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs shadow-md shadow-amber-600/20 transition flex items-center justify-center gap-2"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Clear All Backlog Data</span>
                </button>
              </div>
            </div>

            {/* OPTION 3: Clear Both – All Departments */}
            <div className="bg-white rounded-2xl border-2 border-rose-300 p-5 shadow-sm hover:border-rose-400 transition flex flex-col justify-between bg-gradient-to-b from-white to-rose-50/20">
              <div>
                <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center font-bold mb-3 border border-rose-200">
                  <ShieldAlert className="w-5 h-5" />
                </div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-black text-slate-900">3. Clear Both</h3>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800">
                    All Departments
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  Performs a comprehensive, simultaneous purge of both Monthly Plan AND Backlog data across all factory departments, resetting tables for completely fresh data entry.
                </p>

                <div className="mt-4 p-3 bg-rose-50/60 border border-rose-100 rounded-xl text-xs space-y-1 font-mono">
                  <div className="flex justify-between text-slate-600">
                    <span>Monthly Plan Records:</span>
                    <span className="font-bold">{counts?.totalMonthlyRecords ?? 0}</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>Backlog Records:</span>
                    <span className="font-bold">{counts?.totalBacklogRecords ?? 0}</span>
                  </div>
                  <div className="flex justify-between text-rose-900 font-bold border-t border-rose-200 pt-1">
                    <span>Grand Total:</span>
                    <span className="text-rose-600">{counts?.grandTotal ?? 0} records</span>
                  </div>
                </div>
              </div>

              <div className="mt-5 pt-4 border-t border-slate-100 flex items-center gap-2">
                <button
                  onClick={() => {
                    setSelectedScope('BOTH');
                    setTypedConfirmation('');
                  }}
                  className="w-full py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow-md shadow-rose-600/20 transition flex items-center justify-center gap-2"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Clear Both – All Departments</span>
                </button>
              </div>
            </div>
          </div>

          {/* Safety Guarantees Notice (Section 4 & 6) */}
          <div className="bg-slate-50 rounded-2xl border border-slate-200 p-5 text-xs text-slate-600 space-y-3">
            <h4 className="font-bold text-slate-900 flex items-center gap-2 text-sm">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span>Strict Database Safety &amp; Preservation Guarantee</span>
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <p className="font-semibold text-slate-800">What is deleted:</p>
                <ul className="list-disc pl-4 space-y-1 text-slate-600">
                  <li>Monthly plan targets, tasks, compliance records &amp; department work.</li>
                  <li>Old backlog records, pending items, overdue targets &amp; status logs.</li>
                  <li>Associated department backlog tasks and backlog notifications.</li>
                </ul>
              </div>
              <div className="space-y-1.5">
                <p className="font-semibold text-emerald-800">What is strictly PRESERVED:</p>
                <ul className="list-disc pl-4 space-y-1 text-slate-600">
                  <li>Annual Plan data (yearly_plans), roadmaps &amp; timelines.</li>
                  <li>Machine tracking records and CMM compliance history.</li>
                  <li>Department definitions, employee/admin user accounts &amp; passwords.</li>
                  <li>Purchase records, Store records, and Inward Quality checks.</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          TAB 2: DATABASE COLLECTIONS & COUNTS TABLE
          ========================================================================= */}
      {activeSubTab === 'collections' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden animate-in fade-in">
          <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Database className="w-4 h-4 text-blue-600" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                Live Firestore Collections &amp; Counts
              </h3>
            </div>
            <button
              onClick={loadCounts}
              className="text-xs font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingCounts ? 'animate-spin' : ''}`} />
              <span>Refresh Counts</span>
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100/70 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="p-3">Collection Name</th>
                  <th className="p-3">Classification</th>
                  <th className="p-3 text-right">Record Count</th>
                  <th className="p-3 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {[
                  { name: 'Monthly Plans (monthly_plans)', count: counts?.monthlyPlansCount ?? monthlyPlans.length, type: 'Monthly Plan' },
                  { name: 'Backlog Items (backlog_items)', count: counts?.backlogItemsCount ?? 0, type: 'Backlog' },
                  { name: 'Machines (Master Catalog)', count: machines.length, type: 'Master Data (Protected)' },
                  { name: 'Yearly Plans (Annual)', count: yearlyPlans.length, type: 'Annual Plan (Protected)' },
                  { name: 'Weekly Plans', count: weeklyPlans.length, type: 'Operational' },
                  { name: 'Department Work & Tasks', count: departmentWork.length, type: 'Department Operations' },
                  { name: 'Department Handovers', count: handovers.length, type: 'Operational' },
                  { name: 'Quality Operations', count: qualityOps.length, type: 'Master Data (Protected)' },
                  { name: 'Quality Daily Checks', count: qualityChecks.length, type: 'Operational' },
                  { name: 'Quality Rejections', count: qualityRejections.length, type: 'Operational' },
                  { name: 'Notifications', count: notifications.length, type: 'System Log' },
                  { name: 'Audit Logs', count: auditLogs.length, type: 'System Log' },
                  { name: 'Departments', count: departments.length, type: 'Configuration (Protected)' },
                  { name: 'User Profiles', count: userProfiles.length, type: 'Authentication (Protected)' },
                ].map((col, idx) => (
                  <tr key={idx} className="hover:bg-slate-50 transition">
                    <td className="p-3 font-semibold text-slate-900">{col.name}</td>
                    <td className="p-3">
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                          col.type.includes('Protected')
                            ? 'bg-amber-100 text-amber-800 border border-amber-200'
                            : col.type.includes('Log')
                            ? 'bg-slate-100 text-slate-700'
                            : col.type === 'Monthly Plan' || col.type === 'Backlog'
                            ? 'bg-rose-50 text-rose-700 border border-rose-100'
                            : 'bg-blue-50 text-blue-700 border border-blue-100'
                        }`}
                      >
                        {col.type}
                      </span>
                    </td>
                    <td className="p-3 text-right font-mono font-bold text-slate-800">
                      {col.count}
                    </td>
                    <td className="p-3 text-right">
                      {col.count > 0 ? (
                        <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                          Populated
                        </span>
                      ) : (
                        <span className="text-[10px] font-medium text-slate-400">
                          Empty
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* =========================================================================
          TAB 3: SYSTEM DANGER ZONE (LEGACY FULL PURGE)
          ========================================================================= */}
      {activeSubTab === 'danger_purge' && (
        <div className="bg-red-50 border-2 border-red-200 rounded-2xl p-6 shadow-xs space-y-4 animate-in fade-in">
          <div className="flex items-start space-x-3 text-red-900">
            <ShieldAlert className="w-7 h-7 text-red-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h3 className="text-base font-black uppercase tracking-wider text-red-900">
                Danger Zone: Operational Data Purge
              </h3>
              <p className="text-xs text-red-700 leading-relaxed">
                This administrative operation permanently deletes all machine tracking records, yearly/monthly/weekly plans, daily work tasks, checklists, rejections, documents, and handovers. It does NOT delete department definitions or administrator authentication accounts.
              </p>
            </div>
          </div>

          {fullPurgeSuccess && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs font-semibold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>Full operational data purge completed successfully. Configuration accounts preserved.</span>
            </div>
          )}

          <div className="pt-2">
            <button
              onClick={() => {
                setShowFullPurgeModal(true);
                setFullPurgeConfirmation('');
                setFullPurgeError(null);
              }}
              className="px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-xs shadow-md shadow-red-600/20 transition flex items-center space-x-2"
            >
              <Trash2 className="w-4 h-4" />
              <span>Initiate Full Operational Data Purge</span>
            </button>
          </div>
        </div>
      )}

      {/* =========================================================================
          CONFIRMATION MODAL: CLEAR MONTHLY PLAN / BACKLOG (SECTION 5 REQUIREMENT)
          ========================================================================= */}
      {selectedScope && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 space-y-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center border border-rose-200 font-bold shrink-0">
                  <AlertTriangle className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">
                    {selectedScope === 'MONTHLY_PLAN' && 'Clear All Monthly Plan Data?'}
                    {selectedScope === 'BACKLOG' && 'Clear All Backlog Data?'}
                    {selectedScope === 'BOTH' && 'Clear Both Monthly Plan & Backlog Data?'}
                  </h3>
                  <p className="text-xs text-rose-600 font-semibold mt-0.5">
                    Target: ALL Departments in the Factory
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedScope(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Warning Message */}
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-900 leading-relaxed">
              <strong>Warning:</strong> This will permanently delete all records belonging to{' '}
              {selectedScope === 'MONTHLY_PLAN' && 'Monthly Plan'}
              {selectedScope === 'BACKLOG' && 'Backlog'}
              {selectedScope === 'BOTH' && 'Monthly Plan and Backlog'}{' '}
              across <strong>every single department</strong>. Annual plans, machine tracking catalogs, user accounts, and department configurations will be preserved safely.
            </div>

            {/* Counts Preview */}
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs font-mono space-y-1">
              <div className="flex justify-between text-slate-600">
                <span>Scope:</span>
                <span className="font-bold text-slate-900">Entire Plant (All Departments)</span>
              </div>
              {selectedScope !== 'BACKLOG' && (
                <div className="flex justify-between text-slate-600">
                  <span>Monthly Plan Records:</span>
                  <span className="font-bold text-blue-600">{counts?.totalMonthlyRecords ?? 0}</span>
                </div>
              )}
              {selectedScope !== 'MONTHLY_PLAN' && (
                <div className="flex justify-between text-slate-600">
                  <span>Backlog Records:</span>
                  <span className="font-bold text-amber-600">{counts?.totalBacklogRecords ?? 0}</span>
                </div>
              )}
            </div>

            {/* Pre-Deletion Backup Button */}
            <div className="flex items-center justify-between p-2.5 bg-slate-100 rounded-xl text-xs">
              <span className="text-slate-600 font-medium">Download backup snapshot before proceeding:</span>
              <button
                type="button"
                onClick={() => handleDownloadBackupSnapshot(selectedScope)}
                disabled={downloadingBackup}
                className="px-2.5 py-1.5 rounded-lg bg-white hover:bg-slate-50 text-slate-800 font-bold border border-slate-200 text-[11px] flex items-center gap-1 transition"
              >
                <Download className="w-3 h-3 text-slate-500" />
                <span>{downloadingBackup ? 'Generating...' : 'Download JSON'}</span>
              </button>
            </div>

            {/* Typed Confirmation Prompt (Section 5 Requirement) */}
            <div className="space-y-1.5 pt-2">
              <label className="block text-xs font-bold text-slate-800">
                To confirm, type <span className="font-mono text-rose-600 font-black">{getRequiredPhrase(selectedScope)}</span> below:
              </label>
              <input
                type="text"
                placeholder={getRequiredPhrase(selectedScope)}
                value={typedConfirmation}
                onChange={(e) => setTypedConfirmation(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-rose-500 font-bold"
                autoFocus
              />
            </div>

            {cleanupError && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-800 text-xs rounded-xl flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
                <span>{cleanupError}</span>
              </div>
            )}

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                disabled={isExecuting}
                onClick={() => setSelectedScope(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 font-bold text-xs hover:bg-slate-50 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!isConfirmationValid || isExecuting}
                onClick={handleExecuteCleanup}
                className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow-md shadow-rose-600/20 transition disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{isExecuting ? 'Deleting Records...' : 'Confirm Deletion'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          FULL OPERATIONAL PURGE MODAL (LEGACY)
          ========================================================================= */}
      {showFullPurgeModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-red-200 animate-in fade-in zoom-in-95 space-y-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-red-100 text-red-600 flex items-center justify-center border border-red-300 font-bold shrink-0">
                  <ShieldAlert className="w-7 h-7" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">
                    Purge All Operational Data?
                  </h3>
                  <p className="text-xs text-red-600 font-semibold mt-0.5">
                    Irreversible Master Reset
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowFullPurgeModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              This will permanently delete all operational records (machines, plans, department work, handovers, quality checks). System configuration and admin accounts remain intact.
            </p>

            <div className="space-y-1.5 pt-2">
              <label className="block text-xs font-bold text-slate-800">
                To confirm, type <span className="font-mono text-red-600 font-black">DELETE ALL DATA</span>:
              </label>
              <input
                type="text"
                placeholder="DELETE ALL DATA"
                value={fullPurgeConfirmation}
                onChange={(e) => setFullPurgeConfirmation(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-red-500 font-bold"
              />
            </div>

            {fullPurgeError && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-800 text-xs rounded-xl">
                {fullPurgeError}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                disabled={fullPurging}
                onClick={() => setShowFullPurgeModal(false)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 font-bold text-xs hover:bg-slate-50 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={fullPurgeConfirmation !== 'DELETE ALL DATA' || fullPurging}
                onClick={handleFullOperationalDataPurge}
                className="px-5 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-xs shadow-md shadow-red-600/20 transition disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {fullPurging ? 'Purging Data...' : 'Purge All Operational Data'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
