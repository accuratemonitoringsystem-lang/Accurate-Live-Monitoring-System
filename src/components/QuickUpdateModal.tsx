import React, { useState } from 'react';
import { X, Clock, AlertTriangle, CheckCircle2, Calendar, FileText } from 'lucide-react';
import { DepartmentWork, Machine } from '../types';
import { updateDailyWorkStatus } from '../services/db';
import { useAuth } from '../context/AuthContext';

interface QuickUpdateModalProps {
  isOpen: boolean;
  onClose: () => void;
  departmentWork: DepartmentWork[];
  machines: Machine[];
}

export const QuickUpdateModal: React.FC<QuickUpdateModalProps> = ({
  isOpen,
  onClose,
  departmentWork,
  machines,
}) => {
  const { userProfile } = useAuth();
  const [selectedWorkId, setSelectedWorkId] = useState('');
  const [status, setStatus] = useState<'In Progress' | 'Completed' | 'Delayed'>('Completed');
  const [delayReason, setDelayReason] = useState('');
  const [revisedDate, setRevisedDate] = useState('');
  const [actualQuantity, setActualQuantity] = useState<number | ''>('');
  const [remarks, setRemarks] = useState('');
  const [saving, setSaving] = useState(false);

  if (!isOpen) return null;

  // Filter available work to user's department, or all work if Admin
  const availableWork = departmentWork.filter((w) => {
    if (userProfile?.role === 'ADMIN') return true;
    return w.department === userProfile?.department;
  });

  const activeWorkItem = departmentWork.find((w) => w.id === selectedWorkId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedWorkId || !activeWorkItem) return;

    if (status === 'Delayed' && (!delayReason.trim() || !revisedDate)) {
      alert('When marking work as Delayed, both the Delay Reason and Revised Date are mandatory.');
      return;
    }

    setSaving(true);
    try {
      await updateDailyWorkStatus(
        selectedWorkId,
        activeWorkItem.status,
        status,
        {
          delayReason: status === 'Delayed' ? delayReason : undefined,
          revisedDate: status === 'Delayed' ? revisedDate : undefined,
          actualQuantity: typeof actualQuantity === 'number' ? actualQuantity : undefined,
          remarks: remarks.trim() || undefined,
        },
        userProfile?.email,
        userProfile?.displayName
      );
      onClose();
      // Reset form
      setSelectedWorkId('');
      setStatus('Completed');
      setDelayReason('');
      setRevisedDate('');
      setActualQuantity('');
      setRemarks('');
    } catch (err) {
      console.error(err);
      alert('Failed to update work order. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="p-2 bg-emerald-500/20 text-emerald-400 rounded-lg">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm sm:text-base">One-Minute Daily Work Update</h3>
              <p className="text-xs text-slate-400">Fast shift status recording &amp; live dispatch</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Work Selection */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Select Work Order / Operation <span className="text-red-500">*</span>
            </label>
            {availableWork.length === 0 ? (
              <div className="text-xs text-amber-700 bg-amber-50 p-3 rounded-lg border border-amber-200">
                No active work orders found for your department ({userProfile?.department}). Please create or assign a work order first.
              </div>
            ) : (
              <select
                required
                value={selectedWorkId}
                onChange={(e) => {
                  setSelectedWorkId(e.target.value);
                  const w = availableWork.find((x) => x.id === e.target.value);
                  if (w && w.plannedQuantity) {
                    setActualQuantity(w.actualQuantity || w.plannedQuantity);
                  }
                }}
                className="w-full text-xs p-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:outline-hidden bg-white text-slate-900"
              >
                <option value="">-- Choose Work Order --</option>
                {availableWork.map((w) => (
                  <option key={w.id} value={w.id}>
                    [{w.department}] {w.title} {w.machineNumber ? `(Mach ${w.machineNumber})` : ''} - Current: {w.status}
                  </option>
                ))}
              </select>
            )}
          </div>

          {activeWorkItem && (
            <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-xs space-y-1">
              <div className="flex justify-between text-slate-600">
                <span>Department: <strong>{activeWorkItem.department}</strong></span>
                <span>Current Status: <strong className="text-blue-600">{activeWorkItem.status}</strong></span>
              </div>
              {activeWorkItem.machineNumber && (
                <div className="text-slate-600">
                  Machine: <strong>{activeWorkItem.machineNumber}</strong> {activeWorkItem.machineModel ? `(${activeWorkItem.machineModel})` : ''}
                </div>
              )}
              {activeWorkItem.plannedQuantity !== undefined && (
                <div className="text-slate-600">
                  Planned Target Qty: <strong>{activeWorkItem.plannedQuantity}</strong>
                </div>
              )}
            </div>
          )}

          {/* New Status Radios */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              New Status <span className="text-red-500">*</span>
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setStatus('In Progress')}
                className={`py-2 px-3 rounded-lg border text-xs font-semibold flex items-center justify-center gap-1.5 transition ${
                  status === 'In Progress'
                    ? 'border-blue-600 bg-blue-50 text-blue-700 shadow-xs'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                In Progress
              </button>

              <button
                type="button"
                onClick={() => setStatus('Completed')}
                className={`py-2 px-3 rounded-lg border text-xs font-semibold flex items-center justify-center gap-1.5 transition ${
                  status === 'Completed'
                    ? 'border-emerald-600 bg-emerald-50 text-emerald-700 shadow-xs'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                Completed
              </button>

              <button
                type="button"
                onClick={() => setStatus('Delayed')}
                className={`py-2 px-3 rounded-lg border text-xs font-semibold flex items-center justify-center gap-1.5 transition ${
                  status === 'Delayed'
                    ? 'border-red-600 bg-red-50 text-red-700 shadow-xs'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                <AlertTriangle className="w-3.5 h-3.5" />
                Delayed
              </button>
            </div>
          </div>

          {/* Conditional Delay Fields: Mandatory if Delayed */}
          {status === 'Delayed' && (
            <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl space-y-3 animate-in fade-in duration-150">
              <div className="flex items-center gap-1.5 text-xs font-bold text-red-800">
                <AlertTriangle className="w-4 h-4 text-red-600" />
                <span>Delay Details (Mandatory for Management Alert)</span>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-red-900 mb-1">
                  Delay Reason <span className="text-red-600">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Material shortage, machine breakdown, tool fixture rework..."
                  value={delayReason}
                  onChange={(e) => setDelayReason(e.target.value)}
                  className="w-full text-xs p-2 rounded-lg border border-red-300 focus:ring-2 focus:ring-red-500 bg-white text-slate-900"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-red-900 mb-1">
                  Revised Expected Date <span className="text-red-600">*</span>
                </label>
                <input
                  type="date"
                  required
                  value={revisedDate}
                  onChange={(e) => setRevisedDate(e.target.value)}
                  className="w-full text-xs p-2 rounded-lg border border-red-300 focus:ring-2 focus:ring-red-500 bg-white text-slate-900"
                />
              </div>
            </div>
          )}

          {/* Optional Actual Quantity */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Actual Produced Qty
              </label>
              <input
                type="number"
                min="0"
                placeholder="e.g. 5"
                value={actualQuantity}
                onChange={(e) => setActualQuantity(e.target.value === '' ? '' : Number(e.target.value))}
                className="w-full text-xs p-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 bg-white text-slate-900"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Operator / Remarks
              </label>
              <input
                type="text"
                placeholder="Shift A / notes"
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                className="w-full text-xs p-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 bg-white text-slate-900"
              />
            </div>
          </div>

          {/* Submit */}
          <div className="pt-2 flex items-center justify-end space-x-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !selectedWorkId}
              className="px-5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg shadow-sm transition"
            >
              {saving ? 'Saving...' : 'Submit Daily Update'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
