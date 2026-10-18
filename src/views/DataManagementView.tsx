import React, { useState } from 'react';
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
}) => {
  const { userProfile } = useAuth();
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [typedConfirmation, setTypedConfirmation] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteSuccess, setDeleteSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Collections summary
  const collectionStats = [
    { name: 'Machines (Master)', count: machines.length, type: 'Operational' },
    { name: 'Yearly Plans', count: yearlyPlans.length, type: 'Operational' },
    { name: 'Monthly Plans', count: monthlyPlans.length, type: 'Operational' },
    { name: 'Weekly Plans', count: weeklyPlans.length, type: 'Operational' },
    { name: 'Department Work & Tasks', count: departmentWork.length, type: 'Operational' },
    { name: 'Department Handovers', count: handovers.length, type: 'Operational' },
    { name: 'Quality Operations (Master)', count: qualityOps.length, type: 'Operational' },
    { name: 'Quality Daily Checks', count: qualityChecks.length, type: 'Operational' },
    { name: 'Quality Rejections', count: qualityRejections.length, type: 'Operational' },
    { name: 'Machine Documents', count: machineDocs.length, type: 'Operational' },
    { name: 'Notifications', count: notifications.length, type: 'System Log' },
    { name: 'Audit Logs', count: auditLogs.length, type: 'System Log' },
    { name: 'Departments Configuration', count: departments.length, type: 'Configuration (Protected)' },
    { name: 'User Profiles', count: userProfiles.length, type: 'Authentication (Protected)' },
  ];

  const totalOperationalRecords =
    machines.length +
    yearlyPlans.length +
    monthlyPlans.length +
    weeklyPlans.length +
    departmentWork.length +
    handovers.length +
    qualityOps.length +
    qualityChecks.length +
    qualityRejections.length +
    machineDocs.length +
    notifications.length;

  // Export Complete Backup (JSON)
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

  // Export Operational Work (Excel)
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

  // Handle Delete All Data Confirmation
  const handleDeleteAllOperationalData = async () => {
    if (typedConfirmation !== 'DELETE ALL DATA') {
      setErrorMsg('Please type the exact phrase "DELETE ALL DATA" to proceed.');
      return;
    }

    setDeleting(true);
    setErrorMsg(null);

    try {
      await clearAllOperationalData();
      await logAudit(
        'DELETE_ALL_DATA',
        'SYSTEM',
        'operational_collections',
        '',
        `Admin purged all operational data (${totalOperationalRecords} records). Preserved system configuration and administrator accounts.`
      );
      setDeleteSuccess(true);
      setShowDeleteModal(false);
      setTypedConfirmation('');
    } catch (err: any) {
      console.error('Delete all data failed:', err);
      setErrorMsg(err.message || 'Failed to clear operational data.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
            Data Management &amp; Database Integrity
          </h2>
          <p className="text-xs sm:text-sm text-slate-500">
            Export full system backups, inspect live collection statistics, or purge operational data.
          </p>
        </div>

        {/* Quick Actions */}
        <div className="flex items-center space-x-2">
          <button
            onClick={handleExportJsonBackup}
            className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold flex items-center space-x-1.5 transition shadow-xs"
          >
            <Download className="w-4 h-4" />
            <span>Export Database JSON</span>
          </button>
          <button
            onClick={handleExportWorkExcel}
            className="px-3 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-bold flex items-center space-x-1.5 transition shadow-xs"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Export Work Excel</span>
          </button>
        </div>
      </div>

      {deleteSuccess && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center space-x-2">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <span>Operational data successfully purged. System configuration and Administrator accounts remain intact.</span>
        </div>
      )}

      {/* Database Collections Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Database className="w-4 h-4 text-blue-600" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
              Live Firestore Collections &amp; Counts
            </h3>
          </div>
          <span className="text-xs font-bold text-slate-600">
            Total Operational Records: {totalOperationalRecords}
          </span>
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
              {collectionStats.map((col, idx) => (
                <tr key={idx} className="hover:bg-slate-50 transition">
                  <td className="p-3 font-semibold text-slate-900">{col.name}</td>
                  <td className="p-3">
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                        col.type.includes('Protected')
                          ? 'bg-amber-100 text-amber-800 border border-amber-200'
                          : col.type.includes('Log')
                          ? 'bg-slate-100 text-slate-700'
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

      {/* Danger Zone: DELETE ALL DATA */}
      <div className="bg-red-50 border-2 border-red-200 rounded-2xl p-5 shadow-xs space-y-3">
        <div className="flex items-start space-x-3 text-red-900">
          <ShieldAlert className="w-6 h-6 text-red-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h3 className="text-sm font-black uppercase tracking-wider text-red-900">
              Danger Zone: Operational Data Purge
            </h3>
            <p className="text-xs text-red-700 leading-relaxed">
              This administrative operation permanently deletes all machine records, yearly/monthly/weekly plans, daily work tasks, checklists, rejections, documents, and handovers. It does NOT delete department definitions or administrator authentication accounts.
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-red-200">
          <span className="text-xs text-red-600 font-semibold">
            Recommended: Export a complete JSON or Excel backup before proceeding.
          </span>
          <button
            onClick={() => {
              setShowDeleteModal(true);
              setTypedConfirmation('');
              setErrorMsg(null);
            }}
            className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-xs shadow-sm flex items-center space-x-1.5 transition"
          >
            <Trash2 className="w-4 h-4" />
            <span>DELETE ALL DATA</span>
          </button>
        </div>
      </div>

      {/* =========================================================================
          CONFIRMATION MODAL: DELETE ALL DATA
          ========================================================================= */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-red-300 relative space-y-4">
            <button
              onClick={() => setShowDeleteModal(false)}
              className="absolute right-4 top-4 text-slate-400 hover:text-slate-600"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center space-x-2 text-red-600">
              <AlertTriangle className="w-6 h-6" />
              <h3 className="text-base font-black text-slate-900">
                Confirm Permanent Data Purge
              </h3>
            </div>

            <div className="bg-red-50 border border-red-200 p-3 rounded-xl text-xs text-red-800 space-y-2">
              <p className="font-bold">Warning: This action is irreversible!</p>
              <ul className="list-disc pl-4 space-y-1 text-[11px]">
                <li>All machine records and tracking data will be purged.</li>
                <li>All plans (Yearly, Monthly, Weekly) will be permanently deleted.</li>
                <li>All department tasks, handovers, and daily updates will be removed.</li>
                <li>All quality operations, daily checklists, and rejections will be cleared.</li>
                <li>System departments and Administrator accounts will be preserved.</li>
              </ul>
            </div>

            {errorMsg && (
              <div className="p-2.5 rounded-lg bg-red-100 text-red-800 text-xs font-semibold">
                {errorMsg}
              </div>
            )}

            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-700">
                To confirm, please type <span className="font-mono text-red-600 font-black">DELETE ALL DATA</span> below:
              </label>
              <input
                type="text"
                autoFocus
                placeholder="DELETE ALL DATA"
                value={typedConfirmation}
                onChange={(e) => setTypedConfirmation(e.target.value)}
                className="w-full text-xs font-mono p-2.5 rounded-xl border border-slate-300 outline-none focus:ring-2 focus:ring-red-500"
              />
            </div>

            <div className="flex justify-end space-x-2 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setShowDeleteModal(false)}
                className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 text-xs font-semibold hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteAllOperationalData}
                disabled={typedConfirmation !== 'DELETE ALL DATA' || deleting}
                className="px-5 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold transition disabled:opacity-40 flex items-center space-x-1.5"
              >
                {deleting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Purging Data...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    <span>Confirm &amp; Delete</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
