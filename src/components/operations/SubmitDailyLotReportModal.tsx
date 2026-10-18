import React, { useState, useEffect } from 'react';
import {
  X,
  FileCheck2,
  AlertTriangle,
  CheckCircle2,
  Send,
  Building,
  Calendar,
  Layers,
  Clock,
  Sparkles,
  Info,
} from 'lucide-react';
import { OperationLot, OperationLotMachine, UserProfile } from '../../types';
import {
  subscribeLotMachines,
  submitDailyLotReportToAdmin,
} from '../../services/operationLotService';

interface SubmitDailyLotReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  departmentName: string;
  lot: OperationLot | null;
  currentUserProfile: UserProfile | null;
  onSuccess: (message: string) => void;
}

export const SubmitDailyLotReportModal: React.FC<SubmitDailyLotReportModalProps> = ({
  isOpen,
  onClose,
  departmentName,
  lot,
  currentUserProfile,
  onSuccess,
}) => {
  const [reportDate, setReportDate] = useState(new Date().toISOString().slice(0, 10));
  const [machines, setMachines] = useState<OperationLotMachine[]>([]);
  const [loading, setLoading] = useState(true);
  const [remarks, setRemarks] = useState('');
  const [exceptions, setExceptions] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !lot) {
      setMachines([]);
      return;
    }

    setReportDate(new Date().toISOString().slice(0, 10));
    setRemarks('');
    setExceptions('');
    setErrorMsg(null);
    setLoading(true);

    const unsubscribe = subscribeLotMachines(lot.id, (list) => {
      setMachines(list);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [isOpen, lot]);

  if (!isOpen || !lot) return null;

  // Compute snapshot counters
  const totalMachinesCount = machines.length;
  const completedCount = machines.filter((m) => m.completed || m.status === 'COMPLETED').length;
  const inProgressCount = machines.filter((m) => m.status === 'IN PROGRESS').length;
  const holdCount = machines.filter((m) => m.status === 'HOLD').length;
  const delayedCount = machines.filter((m) => m.status === 'DELAYED').length;
  const pendingCount = machines.filter((m) => m.status === 'NOT STARTED').length;

  const totalComplianceSum = machines.reduce((sum, m) => sum + (m.compliancePercentage || (m.completed ? 100 : 0)), 0);
  const avgCompliance = totalMachinesCount > 0 ? Math.round(totalComplianceSum / totalMachinesCount) : 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setErrorMsg(null);

    try {
      const machineWiseDetails = machines.map((m) => ({
        machineNumber: m.machineNumber,
        model: m.machineSize || 'Standard',
        status: m.status,
        progress: m.progress || (m.completed ? 100 : 0),
        completedOps: m.completed || m.status === 'COMPLETED' ? 1 : 0,
        totalOps: 1,
        compliancePercentage: m.compliancePercentage || (m.completed ? 100 : 0),
        delayReason: m.delayReason || '',
        remarks: m.remarks || '',
      }));

      const res = await submitDailyLotReportToAdmin({
        departmentName,
        date: reportDate,
        lotId: lot.id,
        lotNumber: lot.lotNumber,
        operationName: lot.operationName,
        machinesUpdated: totalMachinesCount,
        machinesCompletedToday: completedCount,
        machinesInProgress: inProgressCount,
        pendingAndDelayedMachines: pendingCount + delayedCount + holdCount,
        machineWiseDetails,
        overallDepartmentCompliance: avgCompliance,
        remarks: remarks.trim(),
        exceptions: exceptions.trim(),
        submittedBy:
          currentUserProfile?.displayName ||
          currentUserProfile?.employeeName ||
          currentUserProfile?.email ||
          'Department User',
        submittedByEmail: currentUserProfile?.email,
      });

      onSuccess(
        `Daily Operation Report ${res.reportNumber} submitted to Admin successfully with ${totalMachinesCount} machines logged!`
      );
      onClose();
    } catch (err: any) {
      console.error('Error submitting daily report to admin:', err);
      setErrorMsg(err.message || 'Failed to submit Daily Operation Report to Admin.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white flex items-center justify-between border-b border-indigo-900/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center border border-indigo-500/30">
              <FileCheck2 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-black tracking-tight">
                  Submit Daily Operation Update to Admin
                </h2>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-500/30 text-indigo-300 border border-indigo-400/30 uppercase tracking-wider">
                  {departmentName}
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                Generates a permanent compliance snapshot for Admin review and notifications.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5">
            {errorMsg && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-800 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Snapshot KPI Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                <span className="text-[10px] font-bold text-slate-400 uppercase">Department / Lot</span>
                <div className="font-bold text-slate-800 truncate">{departmentName}</div>
                <div className="font-mono text-[10px] text-indigo-600 font-bold">{lot.lotNumber}</div>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                <span className="text-[10px] font-bold text-slate-400 uppercase">Total Machines</span>
                <div className="text-xl font-black text-slate-900 mt-0.5 font-mono">{totalMachinesCount}</div>
                <div className="text-[10px] text-slate-500">In this active lot</div>
              </div>

              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
                <span className="text-[10px] font-bold text-emerald-700 uppercase">Completed Today</span>
                <div className="text-xl font-black text-emerald-800 mt-0.5 font-mono">{completedCount}</div>
                <div className="text-[10px] text-emerald-600">100% operation done</div>
              </div>

              <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-xl">
                <span className="text-[10px] font-bold text-indigo-700 uppercase">Lot Compliance</span>
                <div className="text-xl font-black text-indigo-900 mt-0.5 font-mono">{avgCompliance}%</div>
                <div className="text-[10px] text-indigo-600">Calculated average</div>
              </div>
            </div>

            {/* Date and Operation Bar */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                  Report Date
                </label>
                <input
                  type="date"
                  value={reportDate}
                  onChange={(e) => setReportDate(e.target.value)}
                  className="w-full p-2.5 rounded-lg border border-slate-200 bg-white font-bold text-slate-800 text-xs"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                  Operation Name
                </label>
                <input
                  type="text"
                  value={lot.operationName}
                  readOnly
                  className="w-full p-2.5 rounded-lg border border-slate-200 bg-slate-50 font-bold text-slate-700 text-xs"
                />
              </div>
            </div>

            {/* Machine-wise summary preview table */}
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-3.5 py-2 bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-700 flex items-center justify-between">
                <span>Machine Compliance Snapshot Preview</span>
                <span className="text-[10px] text-slate-400 font-normal">
                  In-Progress: {inProgressCount} &bull; Delayed: {delayedCount} &bull; On Hold: {holdCount}
                </span>
              </div>

              <div className="max-h-48 overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-white border-b border-slate-100 text-[10px] font-bold text-slate-500 uppercase">
                    <tr>
                      <th className="p-2.5">Machine #</th>
                      <th className="p-2.5">Status</th>
                      <th className="p-2.5">Progress</th>
                      <th className="p-2.5">Remarks / Reason</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {machines.map((m) => (
                      <tr key={m.machineNumber} className="hover:bg-slate-50/50">
                        <td className="p-2.5 font-mono font-bold text-slate-900">#{m.machineNumber}</td>
                        <td className="p-2.5">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              m.completed || m.status === 'COMPLETED'
                                ? 'bg-emerald-100 text-emerald-800'
                                : m.status === 'IN PROGRESS'
                                ? 'bg-blue-100 text-blue-800'
                                : m.status === 'HOLD'
                                ? 'bg-amber-100 text-amber-800'
                                : m.status === 'DELAYED'
                                ? 'bg-rose-100 text-rose-800'
                                : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {m.status}
                          </span>
                        </td>
                        <td className="p-2.5 font-mono font-bold text-slate-800">{m.progress || (m.completed ? 100 : 0)}%</td>
                        <td className="p-2.5 text-slate-600 truncate max-w-xs">{m.delayReason || m.remarks || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* General Remarks & Exceptions */}
            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                  Overall Department Remarks for Admin
                </label>
                <textarea
                  rows={2}
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  placeholder="e.g. Daily shift targets met, 3 machines ready for next department handover..."
                  className="w-full p-2.5 rounded-lg border border-slate-200 bg-white text-xs text-slate-800"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                  Exceptions, Blockers &amp; Material Issues (if any)
                </label>
                <input
                  type="text"
                  value={exceptions}
                  onChange={(e) => setExceptions(e.target.value)}
                  placeholder="e.g. Awaiting hardware fixture from Store, tool insert wear reported..."
                  className="w-full p-2.5 rounded-lg border border-slate-200 bg-white text-xs text-slate-800"
                />
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="text-slate-500">
              Submitted By:{' '}
              <strong className="text-slate-800">
                {currentUserProfile?.displayName || currentUserProfile?.email || 'Department User'}
              </strong>
            </div>

            <div className="flex items-center gap-2 justify-end">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-white border border-slate-300 rounded-xl font-bold text-slate-700 hover:bg-slate-100 transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting || machines.length === 0}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-black shadow-sm transition disabled:opacity-40 flex items-center gap-1.5"
              >
                {submitting ? (
                  <span>Recording Snapshot in Firestore...</span>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    <span>Confirm &amp; Submit Daily Report to Admin</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
