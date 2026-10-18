import React, { useState, useEffect } from 'react';
import {
  X,
  Boxes,
  CheckCircle2,
  AlertTriangle,
  Clock,
  PauseCircle,
  Save,
  Check,
  ChevronRight,
  User,
  Sliders,
} from 'lucide-react';
import { OperationLot, OperationLotMachine, UserProfile } from '../../types';
import {
  subscribeLotMachines,
  updateLotMachineProgress,
} from '../../services/operationLotService';

interface DailyLotUpdateModalProps {
  isOpen: boolean;
  onClose: () => void;
  lot: OperationLot | null;
  currentUserProfile: UserProfile | null;
  onSuccess: (message: string) => void;
}

export const DailyLotUpdateModal: React.FC<DailyLotUpdateModalProps> = ({
  isOpen,
  onClose,
  lot,
  currentUserProfile,
  onSuccess,
}) => {
  const [machines, setMachines] = useState<OperationLotMachine[]>([]);
  const [loading, setLoading] = useState(true);

  // Editable row states keyed by machineNumber
  const [editStatus, setEditStatus] = useState<Record<string, any>>({});
  const [editProgress, setEditProgress] = useState<Record<string, number>>({});
  const [editRemarks, setEditRemarks] = useState<Record<string, string>>({});
  const [editDelayReason, setEditDelayReason] = useState<Record<string, string>>({});

  const [savingMachineNumber, setSavingMachineNumber] = useState<string | null>(null);
  const [savingAll, setSavingAll] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (!isOpen || !lot) {
      setMachines([]);
      return;
    }

    setLoading(true);
    const unsubscribe = subscribeLotMachines(lot.id, (list) => {
      setMachines(list);
      // Initialize edit fields
      const statMap: Record<string, any> = {};
      const progMap: Record<string, number> = {};
      const remMap: Record<string, string> = {};
      const delayMap: Record<string, string> = {};

      list.forEach((m) => {
        statMap[m.machineNumber] = m.status || 'NOT STARTED';
        progMap[m.machineNumber] = m.progress || (m.completed ? 100 : 0);
        remMap[m.machineNumber] = m.remarks || '';
        delayMap[m.machineNumber] = m.delayReason || '';
      });

      setEditStatus(statMap);
      setEditProgress(progMap);
      setEditRemarks(remMap);
      setEditDelayReason(delayMap);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [isOpen, lot]);

  if (!isOpen || !lot) return null;

  const handleSaveMachineRow = async (machineNumber: string) => {
    setSavingMachineNumber(machineNumber);
    setFeedbackMsg(null);
    try {
      const status = editStatus[machineNumber] || 'NOT STARTED';
      const progress = editProgress[machineNumber] ?? 0;
      const remarks = editRemarks[machineNumber] || '';
      const delayReason = editDelayReason[machineNumber] || '';

      await updateLotMachineProgress({
        lotId: lot.id,
        machineNumber,
        status,
        progress,
        remarks,
        delayReason,
        completedBy: currentUserProfile?.displayName || currentUserProfile?.employeeName || 'Operator',
        userEmail: currentUserProfile?.email,
      });

      setFeedbackMsg({
        type: 'success',
        text: `Machine ${machineNumber} progress updated successfully!`,
      });
    } catch (err: any) {
      console.error('Error updating lot machine:', err);
      setFeedbackMsg({
        type: 'error',
        text: err.message || `Failed to update Machine ${machineNumber}`,
      });
    } finally {
      setSavingMachineNumber(null);
    }
  };

  const handleMarkCompleted = async (machineNumber: string) => {
    setSavingMachineNumber(machineNumber);
    setFeedbackMsg(null);
    try {
      await updateLotMachineProgress({
        lotId: lot.id,
        machineNumber,
        status: 'COMPLETED',
        progress: 100,
        remarks: 'Operation completed 100%',
        completedBy: currentUserProfile?.displayName || currentUserProfile?.employeeName || 'Operator',
        userEmail: currentUserProfile?.email,
      });

      setEditStatus((prev) => ({ ...prev, [machineNumber]: 'COMPLETED' }));
      setEditProgress((prev) => ({ ...prev, [machineNumber]: 100 }));
      setFeedbackMsg({
        type: 'success',
        text: `Machine ${machineNumber} marked 100% Completed!`,
      });
    } catch (err: any) {
      console.error('Error marking machine completed:', err);
      setFeedbackMsg({
        type: 'error',
        text: err.message || `Failed to mark Machine ${machineNumber} completed.`,
      });
    } finally {
      setSavingMachineNumber(null);
    }
  };

  const handleSaveAll = async () => {
    setSavingAll(true);
    setFeedbackMsg(null);
    let successCount = 0;
    try {
      for (const m of machines) {
        const status = editStatus[m.machineNumber] || m.status || 'NOT STARTED';
        const progress = editProgress[m.machineNumber] ?? m.progress ?? 0;
        const remarks = editRemarks[m.machineNumber] || '';
        const delayReason = editDelayReason[m.machineNumber] || '';

        await updateLotMachineProgress({
          lotId: lot.id,
          machineNumber: m.machineNumber,
          status,
          progress,
          remarks,
          delayReason,
          completedBy: currentUserProfile?.displayName || currentUserProfile?.employeeName || 'Operator',
          userEmail: currentUserProfile?.email,
        });
        successCount++;
      }

      onSuccess(`Successfully saved progress for all ${successCount} machines in Lot ${lot.lotNumber}!`);
      onClose();
    } catch (err: any) {
      console.error('Error saving all lot machines:', err);
      setFeedbackMsg({
        type: 'error',
        text: err.message || 'Error occurred while saving machine updates.',
      });
    } finally {
      setSavingAll(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-5xl max-h-[94vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white flex items-center justify-between border-b border-indigo-900/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center border border-indigo-500/30">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-black tracking-tight">
                  Update Lot Progress: {lot.lotNumber}
                </h2>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-500/30 text-indigo-300 border border-indigo-400/30 uppercase tracking-wider">
                  {lot.departmentName}
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                Operation: <strong className="text-white">{lot.operationName}</strong> &bull; Size: <strong>{lot.machineSize}</strong> &bull; Part: <strong>{lot.partName}</strong>
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

        {/* Feedback Alert */}
        {feedbackMsg && (
          <div
            className={`px-5 py-2.5 text-xs flex items-center gap-2 border-b ${
              feedbackMsg.type === 'success'
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                : 'bg-red-50 text-red-800 border-red-200'
            }`}
          >
            {feedbackMsg.type === 'success' ? (
              <Check className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
            )}
            <span>{feedbackMsg.text}</span>
          </div>
        )}

        {/* Machine Table */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5">
          {loading ? (
            <div className="p-12 text-center text-xs text-slate-400">
              Loading lot machines from Firestore...
            </div>
          ) : machines.length === 0 ? (
            <div className="p-12 text-center text-xs text-slate-400">
              No machines assigned to this lot.
            </div>
          ) : (
            <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[10px]">
                  <tr>
                    <th className="p-3">Machine #</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">Progress (%)</th>
                    <th className="p-3">Delay / Hold Reason</th>
                    <th className="p-3">Remarks / Daily Notes</th>
                    <th className="p-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {machines.map((m) => {
                    const status = editStatus[m.machineNumber] || m.status || 'NOT STARTED';
                    const progress = editProgress[m.machineNumber] ?? m.progress ?? 0;
                    const remarks = editRemarks[m.machineNumber] ?? m.remarks ?? '';
                    const delayReason = editDelayReason[m.machineNumber] ?? m.delayReason ?? '';
                    const isSavingThis = savingMachineNumber === m.machineNumber;
                    const isCompleted = status === 'COMPLETED' || progress >= 100;

                    return (
                      <tr key={m.id || m.machineNumber} className="hover:bg-slate-50/80 transition">
                        {/* Machine # */}
                        <td className="p-3">
                          <div className="font-mono font-bold text-slate-900 text-sm">
                            #{m.machineNumber}
                          </div>
                          <div className="text-[10px] text-slate-400 font-medium">
                            {m.customer ? `Cust: ${m.customer}` : m.project || 'Standard'}
                          </div>
                        </td>

                        {/* Status Dropdown */}
                        <td className="p-3">
                          <select
                            value={status}
                            onChange={(e) => {
                              const newStat = e.target.value;
                              setEditStatus((prev) => ({ ...prev, [m.machineNumber]: newStat }));
                              if (newStat === 'COMPLETED') {
                                setEditProgress((prev) => ({ ...prev, [m.machineNumber]: 100 }));
                              }
                            }}
                            className={`p-1.5 rounded-lg border text-xs font-bold ${
                              isCompleted
                                ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                                : status === 'IN PROGRESS'
                                ? 'bg-blue-50 text-blue-800 border-blue-300'
                                : status === 'HOLD'
                                ? 'bg-amber-50 text-amber-800 border-amber-300'
                                : status === 'DELAYED'
                                ? 'bg-rose-50 text-rose-800 border-rose-300'
                                : 'bg-slate-50 text-slate-700 border-slate-200'
                            }`}
                          >
                            <option value="NOT STARTED">NOT STARTED</option>
                            <option value="IN PROGRESS">IN PROGRESS</option>
                            <option value="COMPLETED">COMPLETED</option>
                            <option value="HOLD">HOLD</option>
                            <option value="DELAYED">DELAYED</option>
                          </select>
                        </td>

                        {/* Progress Slider & Input */}
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            <input
                              type="range"
                              min="0"
                              max="100"
                              step="5"
                              value={progress}
                              onChange={(e) => {
                                const val = Number(e.target.value);
                                setEditProgress((prev) => ({ ...prev, [m.machineNumber]: val }));
                                if (val >= 100) {
                                  setEditStatus((prev) => ({ ...prev, [m.machineNumber]: 'COMPLETED' }));
                                } else if (val > 0 && status === 'NOT STARTED') {
                                  setEditStatus((prev) => ({ ...prev, [m.machineNumber]: 'IN PROGRESS' }));
                                }
                              }}
                              className="w-24 accent-indigo-600"
                            />
                            <span className="font-mono font-bold text-slate-800 w-10 text-right">
                              {progress}%
                            </span>
                          </div>
                        </td>

                        {/* Delay / Hold Reason */}
                        <td className="p-3">
                          <input
                            type="text"
                            value={delayReason}
                            onChange={(e) =>
                              setEditDelayReason((prev) => ({
                                ...prev,
                                [m.machineNumber]: e.target.value,
                              }))
                            }
                            placeholder={status === 'HOLD' || status === 'DELAYED' ? 'Specify reason...' : '-'}
                            className="w-36 p-1.5 rounded border border-slate-200 bg-white text-xs"
                          />
                        </td>

                        {/* Remarks */}
                        <td className="p-3">
                          <input
                            type="text"
                            value={remarks}
                            onChange={(e) =>
                              setEditRemarks((prev) => ({
                                ...prev,
                                [m.machineNumber]: e.target.value,
                              }))
                            }
                            placeholder="Daily note..."
                            className="w-44 p-1.5 rounded border border-slate-200 bg-white text-xs"
                          />
                        </td>

                        {/* Row Actions */}
                        <td className="p-3 text-right">
                          <div className="inline-flex items-center gap-1.5 justify-end">
                            {!isCompleted && (
                              <button
                                type="button"
                                onClick={() => handleMarkCompleted(m.machineNumber)}
                                disabled={isSavingThis}
                                className="px-2 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded text-[11px] font-bold border border-emerald-300 transition"
                                title="Mark 100% Complete"
                              >
                                ✓ 100% Done
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => handleSaveMachineRow(m.machineNumber)}
                              disabled={isSavingThis}
                              className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-[11px] font-bold shadow-2xs transition flex items-center gap-1"
                            >
                              <Save className="w-3 h-3" />
                              <span>{isSavingThis ? 'Saving...' : 'Save'}</span>
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

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="text-slate-500">
            Total Machines in Lot: <strong>{machines.length}</strong> &bull; Completed:{' '}
            <strong className="text-emerald-700">
              {machines.filter((m) => m.completed || m.status === 'COMPLETED').length}
            </strong>
          </div>

          <div className="flex items-center gap-2 justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-white border border-slate-300 rounded-xl font-bold text-slate-700 hover:bg-slate-100 transition"
            >
              Close
            </button>
            <button
              type="button"
              onClick={handleSaveAll}
              disabled={savingAll || machines.length === 0}
              className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-black shadow-sm transition disabled:opacity-40 flex items-center gap-1.5"
            >
              <Save className="w-4 h-4" />
              <span>{savingAll ? 'Saving All Updates...' : 'Save All Machine Updates'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
