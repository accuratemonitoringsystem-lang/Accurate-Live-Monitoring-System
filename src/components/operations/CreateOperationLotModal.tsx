import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Boxes,
  CheckSquare,
  AlertTriangle,
  Search,
  Check,
  User,
  Calendar,
  Layers,
  Sparkles,
  Info,
  ChevronRight,
  ShieldCheck,
  Clock,
  Filter,
} from 'lucide-react';
import {
  DepartmentOperation,
  DepartmentMachineSize,
  DepartmentPart,
  UserProfile,
  Machine,
} from '../../types';
import {
  getEligibleMachinesForLot,
  createOperationLot,
  generateLotNumber,
  EligibleMachineResult,
} from '../../services/operationLotService';

interface CreateOperationLotModalProps {
  isOpen: boolean;
  onClose: () => void;
  departmentName: string;
  operations: DepartmentOperation[];
  machineSizes: DepartmentMachineSize[];
  parts: DepartmentPart[];
  currentUserProfile: UserProfile | null;
  onSuccess: (message: string) => void;
}

export const CreateOperationLotModal: React.FC<CreateOperationLotModalProps> = ({
  isOpen,
  onClose,
  departmentName,
  operations,
  machineSizes,
  parts,
  currentUserProfile,
  onSuccess,
}) => {
  // Step A: Lot Details
  const [lotNumber, setLotNumber] = useState('');
  const [lotDate, setLotDate] = useState(new Date().toISOString().slice(0, 10));
  const [plannedDate, setPlannedDate] = useState('');
  const [selectedOpId, setSelectedOpId] = useState('');
  const [assignedEmployee, setAssignedEmployee] = useState('');
  const [remarks, setRemarks] = useState('');

  // Step B: Machine Selection
  const [eligibleMachines, setEligibleMachines] = useState<EligibleMachineResult[]>([]);
  const [loadingMachines, setLoadingMachines] = useState(false);
  const [selectedMachineNumbers, setSelectedMachineNumbers] = useState<Set<string>>(new Set());
  const [machineSearchQuery, setMachineSearchQuery] = useState('');
  const [showOnlyEligible, setShowOnlyEligible] = useState(true);

  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Active selected operation record
  const selectedOperation = useMemo(() => {
    return operations.find((o) => o.id === selectedOpId || o.operationId === selectedOpId);
  }, [operations, selectedOpId]);

  // Derived Part Name & Machine Size
  const derivedPart = useMemo(() => {
    if (!selectedOperation) return null;
    return parts.find((p) => p.partId === selectedOperation.partId) || null;
  }, [parts, selectedOperation]);

  const derivedSize = useMemo(() => {
    if (!selectedOperation) return null;
    return machineSizes.find((s) => s.machineSizeId === selectedOperation.machineSizeId) || null;
  }, [machineSizes, selectedOperation]);

  const displayMachineSize = derivedSize?.machineSize || selectedOperation?.machineSizeId || '';
  const displayPartName = derivedPart?.partName || selectedOperation?.partId || '';

  // Initialize modal state on open
  useEffect(() => {
    if (isOpen) {
      setLotNumber(generateLotNumber(departmentName));
      setLotDate(new Date().toISOString().slice(0, 10));
      setPlannedDate('');
      setAssignedEmployee(
        currentUserProfile?.displayName ||
        currentUserProfile?.employeeName ||
        currentUserProfile?.email ||
        'Operator'
      );
      setRemarks('');
      setErrorMessage(null);
      setSelectedMachineNumbers(new Set());
      setMachineSearchQuery('');

      // Auto-select first active operation if available
      const firstActive = operations.find((o) => o.active !== false);
      if (firstActive) {
        setSelectedOpId(firstActive.id || firstActive.operationId);
      } else {
        setSelectedOpId('');
      }
    }
  }, [isOpen, departmentName, operations, currentUserProfile]);

  // Fetch eligible machines when selected operation / machine size changes
  useEffect(() => {
    if (!isOpen || !selectedOperation) {
      setEligibleMachines([]);
      setSelectedMachineNumbers(new Set());
      return;
    }

    const fetchMachines = async () => {
      setLoadingMachines(true);
      try {
        const results = await getEligibleMachinesForLot(
          departmentName,
          displayMachineSize,
          selectedOperation.operationId
        );
        setEligibleMachines(results);

        // Pre-select all eligible machines by default for convenience
        const eligibleSet = new Set<string>();
        results.forEach((r) => {
          if (r.eligible) {
            eligibleSet.add(r.machine.machineNumber);
          }
        });
        setSelectedMachineNumbers(eligibleSet);
      } catch (err) {
        console.error('Error fetching eligible machines:', err);
      } finally {
        setLoadingMachines(false);
      }
    };

    fetchMachines();
  }, [isOpen, selectedOperation, displayMachineSize, departmentName]);

  if (!isOpen) return null;

  // Filtered machine list by search query and eligibility toggle
  const displayedMachines = eligibleMachines.filter((item) => {
    if (showOnlyEligible && !item.eligible) return false;
    if (machineSearchQuery.trim()) {
      const q = machineSearchQuery.toLowerCase();
      const m = item.machine;
      const match =
        m.machineNumber.toLowerCase().includes(q) ||
        (m.model || '').toLowerCase().includes(q) ||
        (m.customer || '').toLowerCase().includes(q) ||
        (m.project || '').toLowerCase().includes(q);
      if (!match) return false;
    }
    return true;
  });

  const eligibleCount = eligibleMachines.filter((m) => m.eligible).length;

  const handleToggleMachine = (machineNumber: string, eligible: boolean) => {
    if (!eligible) return; // Prevent selecting ineligible machines
    setSelectedMachineNumbers((prev) => {
      const next = new Set(prev);
      if (next.has(machineNumber)) {
        next.delete(machineNumber);
      } else {
        next.add(machineNumber);
      }
      return next;
    });
  };

  const handleSelectAllEligible = () => {
    const next = new Set<string>();
    eligibleMachines.forEach((r) => {
      if (r.eligible) next.add(r.machine.machineNumber);
    });
    setSelectedMachineNumbers(next);
  };

  const handleDeselectAll = () => {
    setSelectedMachineNumbers(new Set());
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOperation) {
      setErrorMessage('Please select a valid operation from the master.');
      return;
    }
    if (selectedMachineNumbers.size === 0) {
      setErrorMessage('Please select at least one machine for this operation lot.');
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);

    try {
      const selectedMachinesList = eligibleMachines
        .filter((r) => selectedMachineNumbers.has(r.machine.machineNumber))
        .map((r) => ({
          machineNumber: r.machine.machineNumber,
          model: r.machine.model,
          project: r.machine.project,
          customer: r.machine.customer,
        }));

      const res = await createOperationLot({
        departmentName,
        lotNumber,
        lotDate,
        operationId: selectedOperation.id || selectedOperation.operationId,
        operationName: selectedOperation.operationName,
        operationCode: selectedOperation.operationCode,
        machineSize: displayMachineSize,
        machineSizeId: selectedOperation.machineSizeId,
        partId: selectedOperation.partId,
        partName: displayPartName,
        assignedEmployee: assignedEmployee.trim() || 'Operator',
        plannedDate,
        remarks: remarks.trim(),
        selectedMachines: selectedMachinesList,
        userEmail: currentUserProfile?.email,
        userDisplayName: currentUserProfile?.displayName || currentUserProfile?.employeeName,
      });

      onSuccess(
        `Operation Lot ${res.lotNumber} created successfully with ${selectedMachinesList.length} machines!`
      );
      onClose();
    } catch (err: any) {
      console.error('Error creating operation lot:', err);
      setErrorMessage(err.message || 'Failed to create Operation Lot.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[94vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white flex items-center justify-between border-b border-indigo-900/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center border border-indigo-500/30">
              <Boxes className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-black tracking-tight">Create Operation Lot</h2>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-500/30 text-indigo-300 border border-indigo-400/30 uppercase tracking-wider">
                  {departmentName}
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                Select 1 Department Operation &rarr; Assign Multiple Eligible Machines &rarr; Execute Lot
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

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-6">
            {errorMessage && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-800 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* STEP A: LOT CONFIGURATION */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                <span className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 text-xs font-black flex items-center justify-center">
                  1
                </span>
                <h3 className="text-xs font-bold uppercase text-slate-800 tracking-wider">
                  Step A: Select Operation &amp; Lot Details
                </h3>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                {/* Lot Number */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                    Lot Number (Auto)
                  </label>
                  <input
                    type="text"
                    value={lotNumber}
                    readOnly
                    className="w-full p-2 rounded-lg border border-slate-200 bg-slate-50 font-mono font-bold text-slate-700"
                  />
                </div>

                {/* Lot Date */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                    Lot Date
                  </label>
                  <input
                    type="date"
                    value={lotDate}
                    onChange={(e) => setLotDate(e.target.value)}
                    className="w-full p-2 rounded-lg border border-slate-200 bg-white font-bold text-slate-800 focus:ring-1 focus:ring-indigo-500"
                  />
                </div>

                {/* Assigned Employee */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                    Assigned Operator
                  </label>
                  <input
                    type="text"
                    value={assignedEmployee}
                    onChange={(e) => setAssignedEmployee(e.target.value)}
                    placeholder="Enter operator name..."
                    className="w-full p-2 rounded-lg border border-slate-200 bg-white font-medium text-slate-800 focus:ring-1 focus:ring-indigo-500"
                  />
                </div>

                {/* Planned Completion Date */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                    Planned Date (Optional)
                  </label>
                  <input
                    type="date"
                    value={plannedDate}
                    onChange={(e) => setPlannedDate(e.target.value)}
                    className="w-full p-2 rounded-lg border border-slate-200 bg-white text-slate-800 focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              </div>

              {/* Operation Selection Dropdown */}
              <div className="p-4 bg-indigo-50/60 rounded-xl border border-indigo-100 space-y-3">
                <div>
                  <label className="block text-xs font-bold text-indigo-950 mb-1">
                    Select Department Operation <span className="text-red-500">*</span>
                  </label>
                  {operations.length === 0 ? (
                    <div className="p-3 bg-white rounded-lg border border-amber-200 text-xs text-amber-800 flex items-center gap-2">
                      <Info className="w-4 h-4 text-amber-600 shrink-0" />
                      <span>
                        No operations configured for <strong>{departmentName}</strong>. Please add operations in <strong>Operation Master</strong> or import Excel first.
                      </span>
                    </div>
                  ) : (
                    <select
                      value={selectedOpId}
                      onChange={(e) => setSelectedOpId(e.target.value)}
                      className="w-full p-2.5 rounded-lg border border-indigo-200 bg-white text-xs font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="">-- Choose an Operation from {departmentName} --</option>
                      {operations.map((op) => {
                        const s = machineSizes.find((sz) => sz.machineSizeId === op.machineSizeId);
                        const p = parts.find((pt) => pt.partId === op.partId);
                        return (
                          <option key={op.id || op.operationId} value={op.id || op.operationId}>
                            Size {s?.machineSize || op.machineSizeId} &bull; Part {p?.partName || op.partId} &bull; {op.operationName}
                          </option>
                        );
                      })}
                    </select>
                  )}
                </div>

                {/* Derived Parameters Badges */}
                {selectedOperation && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1 text-xs">
                    <div className="bg-white p-2.5 rounded-lg border border-indigo-100 flex items-center justify-between">
                      <span className="text-[10px] font-bold text-slate-400 uppercase">Derived Size:</span>
                      <span className="font-black text-indigo-900 font-mono text-sm">
                        {displayMachineSize || 'All Sizes'}
                      </span>
                    </div>
                    <div className="bg-white p-2.5 rounded-lg border border-indigo-100 flex items-center justify-between">
                      <span className="text-[10px] font-bold text-slate-400 uppercase">Derived Part:</span>
                      <span className="font-bold text-slate-900">{displayPartName || 'General'}</span>
                    </div>
                    <div className="bg-white p-2.5 rounded-lg border border-indigo-100 flex items-center justify-between">
                      <span className="text-[10px] font-bold text-slate-400 uppercase">Std Time:</span>
                      <span className="font-semibold text-slate-700">{selectedOperation.standardTime || 'N/A'}</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Remarks */}
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                  Lot Notes / Work Instructions
                </label>
                <input
                  type="text"
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  placeholder="e.g. Priority dispatch lot, ensure flatness inspection before handover..."
                  className="w-full p-2 rounded-lg border border-slate-200 bg-white text-xs text-slate-800"
                />
              </div>
            </div>

            {/* STEP B: MATCHING MACHINES CHECKBOX SELECTION */}
            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 text-xs font-black flex items-center justify-center">
                    2
                  </span>
                  <div>
                    <h3 className="text-xs font-bold uppercase text-slate-800 tracking-wider">
                      Step B: Select Machines for this Lot
                    </h3>
                    <p className="text-[11px] text-slate-500">
                      Eligible machines in <strong>{departmentName}</strong> matching model size <strong>{displayMachineSize || 'Any'}</strong>
                    </p>
                  </div>
                </div>

                {/* Batch Actions */}
                <div className="flex items-center gap-2 text-xs">
                  <button
                    type="button"
                    onClick={handleSelectAllEligible}
                    disabled={eligibleCount === 0}
                    className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold rounded-lg border border-indigo-200 transition text-[11px] disabled:opacity-40"
                  >
                    Select All ({eligibleCount})
                  </button>
                  <button
                    type="button"
                    onClick={handleDeselectAll}
                    disabled={selectedMachineNumbers.size === 0}
                    className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg transition text-[11px] disabled:opacity-40"
                  >
                    Deselect All
                  </button>
                </div>
              </div>

              {/* Search & Filter Bar */}
              <div className="flex items-center justify-between gap-3 text-xs">
                <div className="relative flex-1">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    placeholder="Search Machine #, Model, Customer, Project..."
                    value={machineSearchQuery}
                    onChange={(e) => setMachineSearchQuery(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                  />
                </div>

                <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={showOnlyEligible}
                    onChange={(e) => setShowOnlyEligible(e.target.checked)}
                    className="rounded text-indigo-600"
                  />
                  <span>Show Eligible Only</span>
                </label>
              </div>

              {/* Machine Selection Table */}
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                {loadingMachines ? (
                  <div className="p-8 text-center text-xs text-slate-400">
                    Evaluating eligible machines from Machine Master...
                  </div>
                ) : displayedMachines.length === 0 ? (
                  <div className="p-8 text-center space-y-2">
                    <p className="text-xs text-slate-500 font-semibold">
                      No matching eligible machines found in <strong>{departmentName}</strong> for Size <strong>{displayMachineSize}</strong>.
                    </p>
                    <p className="text-[11px] text-slate-400">
                      Machines must be active in this department and match the operation's machine model.
                    </p>
                  </div>
                ) : (
                  <div className="max-h-64 overflow-y-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 sticky top-0 border-b border-slate-200 text-[10px] font-bold text-slate-600 uppercase tracking-wider">
                        <tr>
                          <th className="p-2.5 w-10 text-center">Select</th>
                          <th className="p-2.5">Machine #</th>
                          <th className="p-2.5">Model / Size</th>
                          <th className="p-2.5">Project / Customer</th>
                          <th className="p-2.5">Current Dept</th>
                          <th className="p-2.5">Eligibility / Reason</th>
                          <th className="p-2.5 text-right">Roadmap Progress</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {displayedMachines.map((item) => {
                          const isSelected = selectedMachineNumbers.has(item.machine.machineNumber);
                          const isEligible = item.eligible;

                          return (
                            <tr
                              key={item.machine.id || item.machine.machineNumber}
                              onClick={() => handleToggleMachine(item.machine.machineNumber, isEligible)}
                              className={`transition cursor-pointer ${
                                !isEligible
                                  ? 'bg-slate-50/50 opacity-60 cursor-not-allowed'
                                  : isSelected
                                  ? 'bg-indigo-50/70 hover:bg-indigo-50'
                                  : 'hover:bg-slate-50'
                              }`}
                            >
                              <td className="p-2.5 text-center">
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  disabled={!isEligible}
                                  onChange={() => {}}
                                  className="rounded text-indigo-600 focus:ring-indigo-500"
                                />
                              </td>
                              <td className="p-2.5 font-bold font-mono text-slate-900">
                                #{item.machine.machineNumber}
                              </td>
                              <td className="p-2.5 font-semibold text-slate-800">
                                {item.machine.model || 'Standard'}
                              </td>
                              <td className="p-2.5 text-slate-600">
                                <div>{item.machine.customer || 'Standard'}</div>
                                {item.machine.project && (
                                  <div className="text-[10px] text-slate-400 font-mono">
                                    Proj: {item.machine.project}
                                  </div>
                                )}
                              </td>
                              <td className="p-2.5">
                                <span className="inline-block px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-50 text-blue-700">
                                  {item.machine.currentDepartment}
                                </span>
                              </td>
                              <td className="p-2.5">
                                {isEligible ? (
                                  <span className="inline-flex items-center text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                                    <Check className="w-3 h-3 mr-1" /> Eligible for Lot
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center text-[10px] font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                                    <AlertTriangle className="w-3 h-3 mr-1 shrink-0" />
                                    <span className="truncate max-w-[150px]" title={item.reason}>
                                      {item.reason || 'Ineligible'}
                                    </span>
                                  </span>
                                )}
                              </td>
                              <td className="p-2.5 text-right font-mono font-bold text-slate-700">
                                {item.machine.departmentCompliance ?? item.machine.progress ?? 0}%
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Footer Bar */}
          <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-3">
              <div className="bg-indigo-600 text-white font-mono font-bold px-3 py-1.5 rounded-lg">
                Selected: {selectedMachineNumbers.size} machines
              </div>
              {selectedOperation && (
                <div className="text-slate-600 text-[11px] truncate max-w-sm">
                  Op: <strong>{selectedOperation.operationName}</strong> ({displayMachineSize})
                </div>
              )}
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
                disabled={submitting || selectedMachineNumbers.size === 0 || !selectedOperation}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-black shadow-sm transition disabled:opacity-40 flex items-center gap-1.5"
              >
                {submitting ? (
                  <span>Creating Lot in Firestore...</span>
                ) : (
                  <>
                    <Boxes className="w-4 h-4" />
                    <span>Create Operation Lot ({selectedMachineNumbers.size})</span>
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
