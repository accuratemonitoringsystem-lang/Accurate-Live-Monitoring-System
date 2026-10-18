import React, { useState, useEffect } from 'react';
import {
  GitFork,
  ArrowRight,
  Plus,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Save,
  RotateCcw,
  CheckCircle2,
  Cpu,
  Layers,
  Sparkles,
  AlertCircle,
} from 'lucide-react';
import { Machine, Department } from '../types';
import { INITIAL_DEPARTMENTS } from '../constants';
import {
  DEFAULT_MACHINE_ROUTE,
  getMachineRoute,
  saveMachineProcessRoute,
  findDepartmentIndexInRoute,
} from '../utils/routeUtils';
import { useAuth } from '../context/AuthContext';

interface MachineProcessRouteViewProps {
  machines: Machine[];
  departments?: Department[];
}

export const MachineProcessRouteView: React.FC<MachineProcessRouteViewProps> = ({
  machines,
  departments = INITIAL_DEPARTMENTS,
}) => {
  const { userProfile } = useAuth();
  const [selectedMachineId, setSelectedMachineId] = useState<string>(machines[0]?.id || '');
  const [searchQuery, setSearchQuery] = useState('');
  const [currentRoute, setCurrentRoute] = useState<string[]>(DEFAULT_MACHINE_ROUTE);
  const [newDepartmentToAdd, setNewDepartmentToAdd] = useState<string>('08 Sub Assembly');
  const [saving, setSaving] = useState(false);
  const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Selected Machine object
  const selectedMachine = machines.find((m) => m.id === selectedMachineId) || machines[0] || null;

  // Sync route when selected machine changes
  useEffect(() => {
    if (selectedMachine) {
      setCurrentRoute(getMachineRoute(selectedMachine));
    }
  }, [selectedMachine?.id, selectedMachine?.processRoute]);

  // Filtered machine options
  const filteredMachines = machines.filter((m) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      m.machineNumber.toLowerCase().includes(q) ||
      (m.specification && m.specification.toLowerCase().includes(q)) ||
      (m.model && m.model.toLowerCase().includes(q))
    );
  });

  // Handle re-ordering
  const handleMove = (index: number, direction: 'left' | 'right') => {
    const targetIndex = direction === 'left' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= currentRoute.length) return;

    const newRoute = [...currentRoute];
    const temp = newRoute[index];
    newRoute[index] = newRoute[targetIndex];
    newRoute[targetIndex] = temp;
    setCurrentRoute(newRoute);
  };

  // Handle removal
  const handleRemove = (index: number) => {
    if (currentRoute.length <= 1) {
      setToastMessage({ type: 'error', text: 'Process route must have at least one department.' });
      return;
    }
    const newRoute = currentRoute.filter((_, idx) => idx !== index);
    setCurrentRoute(newRoute);
  };

  // Handle adding department
  const handleAddDepartment = () => {
    if (!newDepartmentToAdd) return;
    setCurrentRoute((prev) => [...prev, newDepartmentToAdd]);
  };

  // Reset to default
  const handleResetRoute = () => {
    setCurrentRoute(DEFAULT_MACHINE_ROUTE);
  };

  // Save to Firestore
  const handleSaveRoute = async () => {
    if (!selectedMachine) return;
    setSaving(true);
    setToastMessage(null);
    try {
      await saveMachineProcessRoute(selectedMachine.id, currentRoute, userProfile?.email);
      setToastMessage({
        type: 'success',
        text: `Process route for CMM ${selectedMachine.machineNumber} saved successfully!`,
      });
      setTimeout(() => setToastMessage(null), 4000);
    } catch (err: any) {
      setToastMessage({
        type: 'error',
        text: err?.message || 'Failed to save machine process route.',
      });
    } finally {
      setSaving(false);
    }
  };

  // All available departments for dropdown
  const availableDepts = [
    'Planning',
    'Design',
    'Purchase',
    'Inward Quality',
    'Store',
    'Metal Shop',
    'Granite Shop',
    'Lapping',
    'Sub Assembly',
    'Guard Fitment',
    'Paint Shop',
    'Electronics',
    'Assembly',
    'Calibration',
    'Final Quality',
    'Packing & Dispatch',
    ...departments.map((d) => d.name),
  ].filter((v, idx, arr) => arr.indexOf(v) === idx);

  const currentDeptIndex = selectedMachine
    ? findDepartmentIndexInRoute(selectedMachine.currentDepartment, currentRoute)
    : -1;

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 bg-blue-100 text-blue-700 rounded-xl">
              <GitFork className="w-5 h-5" />
            </span>
            <h2 className="text-base font-black text-slate-900 uppercase tracking-wide">
              Machine Process Route Configuration
            </h2>
            <span className="text-[10px] font-bold px-2 py-0.5 bg-purple-100 text-purple-800 rounded-full border border-purple-200">
              Admin Exclusive
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Configure the sequential department workflow for each machine. Machines will follow this exact handover sequence across shop floor departments.
          </p>
        </div>

        {/* Action Button: Save */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleResetRoute}
            type="button"
            className="px-3.5 py-2 text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl flex items-center gap-1.5 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset to Standard</span>
          </button>
          <button
            onClick={handleSaveRoute}
            disabled={saving || !selectedMachine}
            className="px-5 py-2 text-xs font-black bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-xs flex items-center gap-2 transition-all disabled:opacity-50"
          >
            {saving ? (
              <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            <span>SAVE ROUTE</span>
          </button>
        </div>
      </div>

      {/* Toast Notification */}
      {toastMessage && (
        <div
          className={`p-3.5 rounded-xl border flex items-center gap-2 text-xs font-bold ${
            toastMessage.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : 'bg-rose-50 text-rose-800 border-rose-200'
          }`}
        >
          {toastMessage.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          )}
          <span>{toastMessage.text}</span>
        </div>
      )}

      {/* Selection & Machine Info Bar */}
      <div className="bg-slate-900 text-white p-5 rounded-2xl shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Cpu className="w-5 h-5 text-blue-400" />
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Select CMM Machine
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <select
                  value={selectedMachine?.id || ''}
                  onChange={(e) => setSelectedMachineId(e.target.value)}
                  className="bg-slate-800 text-white font-bold text-sm px-3 py-1.5 rounded-xl border border-slate-700 outline-none cursor-pointer focus:border-blue-500"
                >
                  {filteredMachines.map((m) => (
                    <option key={m.id} value={m.id}>
                      CMM {m.machineNumber} - {m.specification || m.model || 'Standard'} ({m.priority || 'P01'})
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {selectedMachine && (
            <div className="flex flex-wrap items-center gap-4 text-xs bg-slate-800/80 px-4 py-2.5 rounded-xl border border-slate-700/60">
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-bold">CMM No</span>
                <span className="font-mono font-black text-blue-400 text-sm">{selectedMachine.machineNumber}</span>
              </div>
              <div className="border-l border-slate-700 pl-4">
                <span className="text-slate-400 block text-[10px] uppercase font-bold">CMM Size</span>
                <span className="font-bold text-slate-200">
                  {selectedMachine.specification || selectedMachine.model || selectedMachine.machineModel || 'Standard'}
                </span>
              </div>
              <div className="border-l border-slate-700 pl-4">
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Priority</span>
                <span className="font-bold text-amber-400">{selectedMachine.priority || 'P01'}</span>
              </div>
              <div className="border-l border-slate-700 pl-4">
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Current Department</span>
                <span className="font-bold text-emerald-400">{selectedMachine.currentDepartment}</span>
              </div>
              <div className="border-l border-slate-700 pl-4">
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Total Stages</span>
                <span className="font-mono font-bold text-slate-300">{currentRoute.length} Stations</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Process Route Flow Visualization & Editor */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-6">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div>
            <h3 className="text-sm font-black text-slate-900 uppercase tracking-wide">
              Configured Department Sequence
            </h3>
            <p className="text-xs text-slate-500">
              Re-order, insert, or remove stations. The machine progresses left to right from Planning to Dispatch.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 text-emerald-700 rounded-lg text-xs font-bold border border-emerald-200">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              Active Station Highlighted
            </span>
          </div>
        </div>

        {/* Flow Chain */}
        <div className="flex flex-wrap items-center gap-2.5">
          {currentRoute.map((deptName, idx) => {
            const isCurrent = idx === currentDeptIndex;
            const isPassed = currentDeptIndex >= 0 && idx < currentDeptIndex;
            const isPending = currentDeptIndex >= 0 && idx > currentDeptIndex;

            return (
              <React.Fragment key={`${deptName}-${idx}`}>
                <div
                  className={`relative group flex flex-col p-3 rounded-xl border transition-all min-w-[155px] ${
                    isCurrent
                      ? 'bg-blue-50/90 border-blue-500 ring-2 ring-blue-500/20 shadow-md'
                      : isPassed
                      ? 'bg-emerald-50/60 border-emerald-200'
                      : 'bg-slate-50 border-slate-200 hover:border-slate-300'
                  }`}
                >
                  {/* Top badges */}
                  <div className="flex items-center justify-between text-[10px] font-bold text-slate-400 mb-1">
                    <span className="font-mono text-slate-500">#{idx + 1}</span>
                    {isCurrent && (
                      <span className="px-1.5 py-0.5 bg-blue-600 text-white rounded font-bold uppercase tracking-wider text-[9px]">
                        Current
                      </span>
                    )}
                    {isPassed && (
                      <span className="text-emerald-700 font-bold">✓ Done</span>
                    )}
                  </div>

                  {/* Department Name */}
                  <div className="font-bold text-xs text-slate-900 leading-snug my-1">
                    {deptName}
                  </div>

                  {/* Edit Controls: Left, Right, Remove */}
                  <div className="flex items-center justify-between pt-2 border-t border-slate-200/60 mt-2">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleMove(idx, 'left')}
                        disabled={idx === 0}
                        title="Move station earlier in sequence"
                        className="p-1 hover:bg-white text-slate-500 hover:text-blue-600 disabled:opacity-25 rounded transition-colors"
                      >
                        <ChevronLeft className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleMove(idx, 'right')}
                        disabled={idx === currentRoute.length - 1}
                        title="Move station later in sequence"
                        className="p-1 hover:bg-white text-slate-500 hover:text-blue-600 disabled:opacity-25 rounded transition-colors"
                      >
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <button
                      onClick={() => handleRemove(idx)}
                      title="Remove station from sequence"
                      className="p-1 hover:bg-rose-100 text-slate-400 hover:text-rose-600 rounded transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {idx < currentRoute.length - 1 && (
                  <ArrowRight className="w-4 h-4 text-slate-300 shrink-0" />
                )}
              </React.Fragment>
            );
          })}
        </div>

        {/* Add Station Section */}
        <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Plus className="w-4 h-4 text-blue-600 shrink-0" />
            <span className="text-xs font-bold text-slate-700">Add Department to Route:</span>
            <select
              value={newDepartmentToAdd}
              onChange={(e) => setNewDepartmentToAdd(e.target.value)}
              className="bg-white text-xs font-bold px-3 py-1.5 rounded-lg border border-slate-300 outline-none cursor-pointer focus:border-blue-500"
            >
              {availableDepts.map((dept) => (
                <option key={dept} value={dept}>
                  {dept}
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={handleAddDepartment}
            className="px-4 py-1.5 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-xs flex items-center gap-1.5 transition-colors self-start sm:self-auto"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Station</span>
          </button>
        </div>

        {/* Sequence Preview Box */}
        <div className="bg-slate-900 text-slate-200 p-4 rounded-xl font-mono text-xs overflow-x-auto">
          <div className="text-[10px] uppercase font-bold text-slate-400 mb-1.5 tracking-wider">
            Sequence Preview ({currentRoute.length} steps):
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {currentRoute.map((dept, i) => (
              <span key={i} className="flex items-center gap-2">
                <span className={`px-2 py-0.5 rounded text-[11px] ${i === currentDeptIndex ? 'bg-blue-600 text-white font-bold' : 'bg-slate-800 text-slate-300'}`}>
                  {i + 1}. {dept}
                </span>
                {i < currentRoute.length - 1 && <span className="text-slate-500">→</span>}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
