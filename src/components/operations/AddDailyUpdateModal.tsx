import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Clock,
  Cpu,
  Layers,
  CheckCircle2,
  AlertTriangle,
  Search,
  Filter,
  CheckSquare,
  Square,
  Building,
  User,
  Calendar,
  Info,
  Check,
  RefreshCw,
  Send,
  AlertOctagon,
  FileText,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import {
  getDepartmentSizesForDailyUpdate,
  getDepartmentPartsForSize,
  getDepartmentOperationsForSize,
  getEligibleMachinesForDailyUpdate,
  submitMachineSizeDailyUpdate,
  DepartmentMachineSizeOption,
  DepartmentPartOption,
  EligibleMachineForDailyUpdate,
} from '../../services/dailyOperationUpdateService';
import { DepartmentOperation } from '../../types';

interface AddDailyUpdateModalProps {
  isOpen: boolean;
  onClose: () => void;
  departmentName: string;
  onSuccess: (message: string) => void;
}

export const AddDailyUpdateModal: React.FC<AddDailyUpdateModalProps> = ({
  isOpen,
  onClose,
  departmentName,
  onSuccess,
}) => {
  const { userProfile } = useAuth();

  // Step 1: Machine Size state
  const [availableSizes, setAvailableSizes] = useState<DepartmentMachineSizeOption[]>([]);
  const [selectedMachineSize, setSelectedMachineSize] = useState<string>('');
  const [loadingSizes, setLoadingSizes] = useState<boolean>(true);
  const [sizeSearchQuery, setSizeSearchQuery] = useState<string>('');

  // Step 2: Part state
  const [availableParts, setAvailableParts] = useState<DepartmentPartOption[]>([]);
  const [selectedPartId, setSelectedPartId] = useState<string>('');
  const [loadingParts, setLoadingParts] = useState<boolean>(false);

  // Step 3: Operation state
  const [availableOps, setAvailableOps] = useState<DepartmentOperation[]>([]);
  const [selectedOpId, setSelectedOpId] = useState<string>('');
  const [loadingOps, setLoadingOps] = useState<boolean>(false);

  // Step 4: Machine Checkbox list
  const [machinesList, setMachinesList] = useState<EligibleMachineForDailyUpdate[]>([]);
  const [loadingMachines, setLoadingMachines] = useState<boolean>(false);
  const [selectedMachineNumbers, setSelectedMachineNumbers] = useState<Set<string>>(new Set());
  const [machineSearchQuery, setMachineSearchQuery] = useState<string>('');

  // Individual machine outcome overrides (if a machine in batch is In Progress or Delayed)
  const [individualOutcomes, setIndividualOutcomes] = useState<
    Record<string, { outcome: 'Completed' | 'In Progress' | 'On Hold' | 'Delayed'; delayReason?: string }>
  >({});

  // Daily Update Details
  const [updateDate, setUpdateDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [employeeName, setEmployeeName] = useState<string>(
    userProfile?.displayName || userProfile?.employeeName || userProfile?.email || 'Operator'
  );
  const [operationResult, setOperationResult] = useState<'Completed' | 'In Progress' | 'On Hold' | 'Delayed'>(
    'Completed'
  );
  const [batchDelayReason, setBatchDelayReason] = useState<string>('');
  const [actualQuantity, setActualQuantity] = useState<number | ''>('');
  const [remarks, setRemarks] = useState<string>('');
  const [attachmentUrl, setAttachmentUrl] = useState<string>('');

  // Confirmation Summary & Submission
  const [showConfirmSummary, setShowConfirmSummary] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Reset states when modal opens
  useEffect(() => {
    if (isOpen) {
      setUpdateDate(new Date().toISOString().split('T')[0]);
      setEmployeeName(
        userProfile?.displayName || userProfile?.employeeName || userProfile?.email || 'Operator'
      );
      setOperationResult('Completed');
      setBatchDelayReason('');
      setActualQuantity('');
      setRemarks('');
      setAttachmentUrl('');
      setErrorMessage(null);
      setShowConfirmSummary(false);
      setSelectedMachineNumbers(new Set());
      setIndividualOutcomes({});
      setMachineSearchQuery('');
      setSizeSearchQuery('');

      // Load Sizes
      loadSizes();
    }
  }, [isOpen, departmentName]);

  const loadSizes = async () => {
    setLoadingSizes(true);
    try {
      const sizes = await getDepartmentSizesForDailyUpdate(departmentName);
      setAvailableSizes(sizes);
      if (sizes.length > 0) {
        setSelectedMachineSize(sizes[0].machineSize);
      } else {
        setSelectedMachineSize('');
      }
    } catch (err: any) {
      console.error('Failed to load sizes:', err);
      setErrorMessage('Failed to load machine sizes for department.');
    } finally {
      setLoadingSizes(false);
    }
  };

  // When Machine Size changes, load parts and operations
  useEffect(() => {
    if (!selectedMachineSize) {
      setAvailableParts([]);
      setSelectedPartId('');
      setAvailableOps([]);
      setSelectedOpId('');
      setMachinesList([]);
      return;
    }

    const fetchPartsAndOps = async () => {
      setLoadingParts(true);
      setLoadingOps(true);
      try {
        const parts = await getDepartmentPartsForSize(departmentName, selectedMachineSize);
        setAvailableParts(parts);
        if (parts.length > 0) {
          setSelectedPartId(parts[0].partId);
        } else {
          setSelectedPartId('');
        }

        // Fetch operations for this size
        const ops = await getDepartmentOperationsForSize(
          departmentName,
          selectedMachineSize,
          parts.length > 0 ? parts[0].partId : undefined
        );
        setAvailableOps(ops);
        if (ops.length > 0) {
          setSelectedOpId(ops[0].operationId);
        } else {
          setSelectedOpId('');
        }
      } catch (err: any) {
        console.error('Failed to load parts or ops:', err);
      } finally {
        setLoadingParts(false);
        setLoadingOps(false);
      }
    };

    fetchPartsAndOps();
  }, [selectedMachineSize, departmentName]);

  // When Part changes, reload operations for that part
  const handlePartChange = async (partId: string) => {
    setSelectedPartId(partId);
    setLoadingOps(true);
    try {
      const ops = await getDepartmentOperationsForSize(
        departmentName,
        selectedMachineSize,
        partId || undefined
      );
      setAvailableOps(ops);
      if (ops.length > 0) {
        setSelectedOpId(ops[0].operationId);
      } else {
        setSelectedOpId('');
      }
    } catch (err: any) {
      console.error('Failed to load ops for part:', err);
    } finally {
      setLoadingOps(false);
    }
  };

  // When Operation changes, load matching machine numbers with checkboxes
  useEffect(() => {
    if (!selectedMachineSize || !selectedOpId) {
      setMachinesList([]);
      setSelectedMachineNumbers(new Set());
      return;
    }

    const fetchMachines = async () => {
      setLoadingMachines(true);
      try {
        const list = await getEligibleMachinesForDailyUpdate(
          departmentName,
          selectedMachineSize,
          selectedOpId
        );
        setMachinesList(list);

        // Per requirement: exclude already-completed machine-operation combinations from default selection
        // Do NOT automatically mark all machines as completed; leave checkboxes unchecked or user selects today's completed machines
        setSelectedMachineNumbers(new Set());
        setIndividualOutcomes({});
      } catch (err: any) {
        console.error('Failed to load machines:', err);
        setErrorMessage('Failed to fetch eligible machines.');
      } finally {
        setLoadingMachines(false);
      }
    };

    fetchMachines();
  }, [selectedMachineSize, selectedOpId, departmentName]);

  // Filtered machine size options
  const filteredSizes = useMemo(() => {
    if (!sizeSearchQuery.trim()) return availableSizes;
    const q = sizeSearchQuery.toLowerCase();
    return availableSizes.filter((s) => s.machineSize.toLowerCase().includes(q));
  }, [availableSizes, sizeSearchQuery]);

  // Active operation object
  const activeOp = useMemo(() => {
    return availableOps.find((o) => o.operationId === selectedOpId) || null;
  }, [availableOps, selectedOpId]);

  // Active part object
  const activePart = useMemo(() => {
    return availableParts.find((p) => p.partId === selectedPartId) || null;
  }, [availableParts, selectedPartId]);

  // Filtered machine records for search
  const displayedMachines = useMemo(() => {
    if (!machineSearchQuery.trim()) return machinesList;
    const q = machineSearchQuery.toLowerCase();
    return machinesList.filter((m) => {
      return (
        m.machine.machineNumber.toLowerCase().includes(q) ||
        (m.machine.project && m.machine.project.toLowerCase().includes(q)) ||
        (m.machine.customer && m.machine.customer.toLowerCase().includes(q))
      );
    });
  }, [machinesList, machineSearchQuery]);

  // Machine counts
  const eligibleMachines = useMemo(() => {
    return machinesList.filter((m) => m.eligible);
  }, [machinesList]);

  const totalEligibleCount = eligibleMachines.length;
  const totalSelectedCount = selectedMachineNumbers.size;
  const alreadyCompletedCount = machinesList.filter((m) => m.previouslyCompleted).length;
  const inProgressCount = machinesList.filter(
    (m) => m.operationStatus === 'IN PROGRESS' && !m.previouslyCompleted
  ).length;
  const pendingCount = Math.max(0, totalEligibleCount - alreadyCompletedCount - inProgressCount);
  const notSelectedCount = Math.max(0, totalEligibleCount - totalSelectedCount);

  // Compute how many machines are marked Completed today
  const completedTodayCount = useMemo(() => {
    let count = 0;
    selectedMachineNumbers.forEach((mNo) => {
      const outcome = individualOutcomes[mNo]?.outcome || operationResult;
      if (outcome === 'Completed') count++;
    });
    return count;
  }, [selectedMachineNumbers, individualOutcomes, operationResult]);

  // Checkbox toggles
  const handleToggleMachine = (machineNumber: string, isEligible: boolean) => {
    if (!isEligible) return;
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
    eligibleMachines.forEach((m) => {
      next.add(m.machine.machineNumber);
    });
    setSelectedMachineNumbers(next);
  };

  const handleDeselectAll = () => {
    setSelectedMachineNumbers(new Set());
  };

  // Submit Handler
  const handleProceedToConfirmation = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMachineSize) {
      setErrorMessage('Please select a Machine Size.');
      return;
    }
    if (availableParts.length > 0 && !selectedPartId) {
      setErrorMessage('Please select a Part.');
      return;
    }
    if (!selectedOpId || !activeOp) {
      setErrorMessage('Please select an Operation.');
      return;
    }
    if (selectedMachineNumbers.size === 0) {
      setErrorMessage('Please select at least one machine for this daily update.');
      return;
    }
    if (
      (operationResult === 'Delayed' || operationResult === 'On Hold') &&
      !batchDelayReason.trim()
    ) {
      setErrorMessage('Delay / Hold Reason is mandatory when marking work as Delayed or On Hold.');
      return;
    }

    setErrorMessage(null);
    setShowConfirmSummary(true);
  };

  const handleFinalSubmit = async () => {
    setSubmitting(true);
    setErrorMessage(null);

    try {
      const selectedMachinesPayload = Array.from(selectedMachineNumbers).map((mNo) => {
        const match = machinesList.find((m) => m.machine.machineNumber === mNo);
        const ind = individualOutcomes[mNo];
        return {
          machineNumber: mNo,
          model: match?.machine.model || selectedMachineSize,
          project: match?.machine.project,
          customer: match?.machine.customer,
          outcome: ind?.outcome || operationResult,
          delayReason: ind?.delayReason || batchDelayReason,
          remarks: remarks.trim(),
        };
      });

      const res = await submitMachineSizeDailyUpdate({
        departmentName,
        machineSize: selectedMachineSize,
        partId: selectedPartId || undefined,
        partName: activePart?.partName || undefined,
        operationId: selectedOpId,
        operationName: activeOp!.operationName,
        operationCode: activeOp!.operationCode,
        updateDate,
        employeeName: employeeName.trim() || 'Operator',
        employeeEmail: userProfile?.email,
        operationResult,
        selectedMachines: selectedMachinesPayload,
        actualQuantity: typeof actualQuantity === 'number' ? actualQuantity : undefined,
        remarks: remarks.trim(),
        attachmentUrl: attachmentUrl.trim() || undefined,
      });

      onSuccess(
        `Daily Operation Update saved successfully! ${res.completedCount} machines marked completed, ${res.inProgressCount} in progress.`
      );
      onClose();
    } catch (err: any) {
      console.error('Error submitting daily update:', err);
      setErrorMessage(err.message || 'Failed to submit daily operation update.');
      setShowConfirmSummary(false);
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[94vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white flex items-center justify-between border-b border-indigo-900/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center border border-indigo-500/30">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-black tracking-tight">Add Daily Operation Update</h2>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-500/30 text-indigo-300 border border-indigo-400/30 uppercase tracking-wider">
                  {departmentName}
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                Exact Selection Flow: Machine Size &rarr; Part &rarr; Operation &rarr; Machine Checkboxes &rarr; Submit
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg transition"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Form Body */}
        <form onSubmit={handleProceedToConfirmation} className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-6">
            {errorMessage && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-800 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* ============================================================= */}
            {/* 1. SELECTION HIERARCHY BAR (STEP 1: DATE, STEP 2: SIZE, STEP 3: OP) */}
            {/* ============================================================= */}
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-4">
              <div className="flex items-center gap-2 pb-2 border-b border-slate-200 text-slate-800 text-xs font-bold uppercase tracking-wider">
                <span className="w-5 h-5 rounded-full bg-indigo-600 text-white text-[11px] font-black flex items-center justify-center">
                  1
                </span>
                <span>Exact Selection Sequence</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {/* STEP 1: SELECT DATE */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                    Step 1: Select Date <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={updateDate}
                    onChange={(e) => setUpdateDate(e.target.value)}
                    className="w-full text-xs font-bold p-2.5 rounded-lg border border-slate-300 bg-white text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>

                {/* STEP 2: SELECT MACHINE SIZE */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                    Step 2: Machine Size <span className="text-red-500">*</span>
                  </label>
                  {loadingSizes ? (
                    <div className="text-xs text-slate-400 p-2 border border-slate-200 rounded-lg bg-white flex items-center gap-1.5">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Loading sizes...</span>
                    </div>
                  ) : availableSizes.length === 0 ? (
                    <div className="text-xs text-amber-700 bg-amber-50 p-2 rounded-lg border border-amber-200">
                      No sizes configured for {departmentName}
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      <select
                        id="daily-update-machine-size-select"
                        value={selectedMachineSize}
                        onChange={(e) => setSelectedMachineSize(e.target.value)}
                        className="w-full text-xs font-bold p-2.5 rounded-lg border border-slate-300 bg-white text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                      >
                        {filteredSizes.map((s) => (
                          <option key={s.machineSizeId} value={s.machineSize}>
                            Size {s.machineSize} ({s.operationsCount} ops configured)
                          </option>
                        ))}
                      </select>
                      {availableSizes.length > 5 && (
                        <input
                          type="text"
                          placeholder="Search size..."
                          value={sizeSearchQuery}
                          onChange={(e) => setSizeSearchQuery(e.target.value)}
                          className="w-full text-[11px] p-1.5 rounded-md border border-slate-200 bg-white text-slate-700 placeholder:text-slate-400"
                        />
                      )}
                    </div>
                  )}
                </div>

                {/* STEP 3A: SELECT PART (IF APPLICABLE) */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                    Part {availableParts.length > 0 ? <span className="text-red-500">*</span> : '(Optional)'}
                  </label>
                  {loadingParts ? (
                    <div className="text-xs text-slate-400 p-2 border border-slate-200 rounded-lg bg-white flex items-center gap-1.5">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Loading parts...</span>
                    </div>
                  ) : availableParts.length === 0 ? (
                    <div className="text-xs text-slate-500 bg-slate-100 p-2.5 rounded-lg border border-slate-200 italic">
                      Direct Operation (No parts)
                    </div>
                  ) : (
                    <select
                      id="daily-update-part-select"
                      value={selectedPartId}
                      onChange={(e) => handlePartChange(e.target.value)}
                      className="w-full text-xs font-bold p-2.5 rounded-lg border border-slate-300 bg-white text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    >
                      {availableParts.map((p) => (
                        <option key={p.partId} value={p.partId}>
                          Part: {p.partName} ({p.operationsCount} ops)
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                {/* STEP 3B: SELECT OPERATION */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                    Step 3: Operation <span className="text-red-500">*</span>
                  </label>
                  {loadingOps ? (
                    <div className="text-xs text-slate-400 p-2 border border-slate-200 rounded-lg bg-white flex items-center gap-1.5">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Loading operations...</span>
                    </div>
                  ) : availableOps.length === 0 ? (
                    <div className="text-xs text-amber-700 bg-amber-50 p-2 rounded-lg border border-amber-200">
                      No active operations found for Size {selectedMachineSize}.
                    </div>
                  ) : (
                    <select
                      id="daily-update-operation-select"
                      value={selectedOpId}
                      onChange={(e) => setSelectedOpId(e.target.value)}
                      className="w-full text-xs font-bold p-2.5 rounded-lg border border-slate-300 bg-white text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    >
                      {availableOps.map((op) => (
                        <option key={op.operationId} value={op.operationId}>
                          {op.sequence ? `${op.sequence}. ` : ''}
                          {op.operationName} {op.operationCode ? `(${op.operationCode})` : ''}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </div>
            </div>

            {/* ============================================================= */}
            {/* 2. MATCHING MACHINE NUMBERS WITH CHECKBOXES (STEP 4) */}
            {/* ============================================================= */}
            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-200">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-indigo-600 text-white text-[11px] font-black flex items-center justify-center">
                    2
                  </span>
                  <div>
                    <h3 className="text-xs font-bold uppercase text-slate-800 tracking-wider">
                      Matching Machines for Size {selectedMachineSize} &bull; Checkbox Selection
                    </h3>
                    <p className="text-[11px] text-slate-500">
                      Check only the machines on which &ldquo;{activeOp?.operationName || 'this operation'}&rdquo; was completed today.
                    </p>
                  </div>
                </div>

                {/* Filter and actions */}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleSelectAllEligible}
                    disabled={eligibleMachines.length === 0}
                    className="px-2.5 py-1 rounded-lg border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold transition disabled:opacity-50"
                  >
                    Select All Eligible ({eligibleMachines.length})
                  </button>
                  <button
                    type="button"
                    onClick={handleDeselectAll}
                    disabled={selectedMachineNumbers.size === 0}
                    className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 text-xs font-bold transition disabled:opacity-50"
                  >
                    Deselect All
                  </button>
                </div>
              </div>

              {/* Counts Bar */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center text-xs">
                <div className="p-2 bg-slate-100 rounded-lg border border-slate-200">
                  <span className="text-[10px] text-slate-500 uppercase font-bold block">Total Eligible</span>
                  <span className="text-sm font-black text-slate-800">{totalEligibleCount}</span>
                </div>
                <div className="p-2 bg-indigo-50 rounded-lg border border-indigo-100">
                  <span className="text-[10px] text-indigo-700 uppercase font-bold block">Selected for Update</span>
                  <span className="text-sm font-black text-indigo-800">{totalSelectedCount}</span>
                </div>
                <div className="p-2 bg-emerald-50 rounded-lg border border-emerald-100">
                  <span className="text-[10px] text-emerald-700 uppercase font-bold block">Completed Today</span>
                  <span className="text-sm font-black text-emerald-800">{completedTodayCount}</span>
                </div>
                <div className="p-2 bg-blue-50 rounded-lg border border-blue-100">
                  <span className="text-[10px] text-blue-700 uppercase font-bold block">Previously Completed</span>
                  <span className="text-sm font-black text-blue-800">{alreadyCompletedCount}</span>
                </div>
                <div className="p-2 bg-amber-50 rounded-lg border border-amber-100">
                  <span className="text-[10px] text-amber-700 uppercase font-bold block">Not Selected</span>
                  <span className="text-sm font-black text-amber-800">{notSelectedCount}</span>
                </div>
              </div>

              {/* Machine Search input */}
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search machine number, project, or customer..."
                  value={machineSearchQuery}
                  onChange={(e) => setMachineSearchQuery(e.target.value)}
                  className="w-full text-xs pl-9 pr-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-800 placeholder:text-slate-400 focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              {/* Checkbox Machine Table */}
              {loadingMachines ? (
                <div className="p-8 text-center text-slate-400 text-xs flex items-center justify-center gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin text-indigo-600" />
                  <span>Loading eligible machines for Size {selectedMachineSize}...</span>
                </div>
              ) : displayedMachines.length === 0 ? (
                <div className="p-8 text-center bg-slate-50 rounded-xl border border-dashed border-slate-300 text-xs text-slate-500 space-y-1">
                  <AlertTriangle className="w-6 h-6 text-amber-500 mx-auto" />
                  <p className="font-bold text-slate-700">No matching machines found</p>
                  <p>
                    There are no machines of Size {selectedMachineSize} currently assigned to {departmentName}.
                  </p>
                </div>
              ) : (
                <div className="border border-slate-200 rounded-xl overflow-hidden max-h-64 overflow-y-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-100 border-b border-slate-200 text-slate-600 uppercase text-[10px] sticky top-0 z-10">
                      <tr>
                        <th className="p-2.5 w-10 text-center">Select</th>
                        <th className="p-2.5">Machine No.</th>
                        <th className="p-2.5">Size</th>
                        <th className="p-2.5">Project</th>
                        <th className="p-2.5">Current Department</th>
                        <th className="p-2.5">Operation</th>
                        <th className="p-2.5">Today's Status</th>
                        <th className="p-2.5 text-center">Last Updated</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {displayedMachines.map((m) => {
                        const mNo = m.machine.machineNumber;
                        const isSelected = selectedMachineNumbers.has(mNo);
                        const isEligible = m.eligible;

                        return (
                          <tr
                            key={mNo}
                            onClick={() => handleToggleMachine(mNo, isEligible)}
                            className={`transition cursor-pointer ${
                              !isEligible
                                ? 'bg-slate-50/60 opacity-60 cursor-not-allowed'
                                : isSelected
                                ? 'bg-indigo-50/70 hover:bg-indigo-100/70'
                                : 'hover:bg-slate-50'
                            }`}
                          >
                            <td className="p-2.5 text-center" onClick={(e) => e.stopPropagation()}>
                              <input
                                type="checkbox"
                                disabled={!isEligible}
                                checked={isSelected}
                                onChange={() => handleToggleMachine(mNo, isEligible)}
                                className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer disabled:cursor-not-allowed"
                              />
                            </td>
                            <td className="p-2.5 font-mono font-bold text-slate-900">
                              #{mNo}
                            </td>
                            <td className="p-2.5 font-semibold text-slate-800">
                              {m.machine.model || selectedMachineSize}
                            </td>
                            <td className="p-2.5 text-slate-700">{m.machine.project || 'Standard'}</td>
                            <td className="p-2.5 text-slate-700">
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                  isEligible
                                    ? 'bg-blue-50 text-blue-700'
                                    : 'bg-amber-50 text-amber-700'
                                }`}
                              >
                                {m.machine.currentDepartment}
                              </span>
                            </td>
                            <td className="p-2.5 text-slate-800 font-medium">
                              {activeOp?.operationName || 'Selected Operation'}
                            </td>
                            <td className="p-2.5">
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                  m.previouslyCompleted
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : m.operationStatus === 'IN PROGRESS'
                                    ? 'bg-blue-100 text-blue-800'
                                    : m.operationStatus === 'HOLD'
                                    ? 'bg-amber-100 text-amber-800'
                                    : 'bg-slate-100 text-slate-700'
                                }`}
                              >
                                {m.previouslyCompleted ? 'COMPLETED' : m.operationStatus}
                              </span>
                            </td>
                            <td className="p-2.5 text-center text-[11px] text-slate-500 font-mono">
                              {m.previouslyCompletedAt?.slice(0, 10) || m.machine.updatedAt?.slice(0, 10) || updateDate}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* ============================================================= */}
            {/* 3. DAILY UPDATE DETAILS (DATE, OPERATOR, RESULT, REMARKS) */}
            {/* ============================================================= */}
            <div className="space-y-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
              <div className="flex items-center gap-2 pb-2 border-b border-slate-200 text-slate-800 text-xs font-bold uppercase tracking-wider">
                <span className="w-5 h-5 rounded-full bg-indigo-600 text-white text-[11px] font-black flex items-center justify-center">
                  3
                </span>
                <span>Execution Details &amp; Shift Notes</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                {/* Employee / Operator */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                    Operator / Employee <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={employeeName}
                    onChange={(e) => setEmployeeName(e.target.value)}
                    placeholder="Enter operator name..."
                    className="w-full p-2.5 rounded-lg border border-slate-300 bg-white font-medium text-slate-800 focus:ring-1 focus:ring-indigo-500"
                  />
                </div>

                {/* Operation Result */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                    Operation Result <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={operationResult}
                    onChange={(e) =>
                      setOperationResult(e.target.value as 'Completed' | 'In Progress' | 'On Hold' | 'Delayed')
                    }
                    className="w-full p-2.5 rounded-lg border border-slate-300 bg-white font-bold text-slate-800 focus:ring-1 focus:ring-indigo-500"
                  >
                    <option value="Completed">Completed (100% Passed)</option>
                    <option value="In Progress">In Progress (Work Continuing)</option>
                    <option value="On Hold">On Hold (Waiting for input)</option>
                    <option value="Delayed">Delayed (Exception)</option>
                  </select>
                </div>

                {/* Actual Quantity */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                    Actual Quantity (Optional)
                  </label>
                  <input
                    type="number"
                    min="1"
                    placeholder="e.g. 1"
                    value={actualQuantity}
                    onChange={(e) =>
                      setActualQuantity(e.target.value === '' ? '' : Number(e.target.value))
                    }
                    className="w-full p-2.5 rounded-lg border border-slate-300 bg-white text-slate-800 focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              </div>

              {/* Delay Reason if applicable */}
              {(operationResult === 'Delayed' || operationResult === 'On Hold') && (
                <div>
                  <label className="block text-[10px] font-bold text-amber-700 uppercase tracking-wider mb-1">
                    Delay / Hold Reason <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={batchDelayReason}
                    onChange={(e) => setBatchDelayReason(e.target.value)}
                    placeholder="Reason for delay or hold..."
                    className="w-full p-2.5 rounded-lg border border-amber-300 bg-amber-50/40 text-amber-900 font-medium text-xs focus:ring-1 focus:ring-amber-500"
                  />
                </div>
              )}

              {/* Remarks */}
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                  Shift Remarks / Notes
                </label>
                <input
                  type="text"
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  placeholder="Add any specific observations or details..."
                  className="w-full p-2.5 rounded-lg border border-slate-300 bg-white text-slate-800 text-xs focus:ring-1 focus:ring-indigo-500"
                />
              </div>
            </div>
          </div>

          {/* Modal Footer */}
          <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
            <div className="text-xs text-slate-500">
              <span className="font-bold text-slate-800">{selectedMachineNumbers.size}</span> machines selected
              &bull; <span className="font-bold text-emerald-700">{completedTodayCount}</span> marked Completed
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-slate-600 hover:text-slate-800 text-xs font-bold transition"
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={selectedMachineNumbers.size === 0 || !selectedOpId}
                className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black shadow-sm transition disabled:opacity-50 flex items-center gap-2"
              >
                <Send className="w-4 h-4" />
                <span>REVIEW &amp; SUBMIT DAILY UPDATE</span>
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* ============================================================= */}
      {/* CONFIRMATION SUMMARY MODAL */}
      {/* ============================================================= */}
      {showConfirmSummary && (
        <div className="fixed inset-0 z-60 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                <h3 className="font-bold text-sm">Confirm Daily Operation Update</h3>
              </div>
              <button
                onClick={() => setShowConfirmSummary(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs">
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2">
                <div className="flex justify-between">
                  <span className="text-slate-500 font-medium">Department:</span>
                  <span className="font-bold text-slate-900">{departmentName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 font-medium">Update Date:</span>
                  <span className="font-bold text-slate-900">{updateDate}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 font-medium">Machine Size:</span>
                  <span className="font-bold text-slate-900">Size {selectedMachineSize}</span>
                </div>
                {activePart && (
                  <div className="flex justify-between">
                    <span className="text-slate-500 font-medium">Part:</span>
                    <span className="font-bold text-slate-900">{activePart.partName}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-slate-500 font-medium">Operation:</span>
                  <span className="font-bold text-indigo-700">{activeOp?.operationName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 font-medium">Employee / Operator:</span>
                  <span className="font-bold text-slate-900">{employeeName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 font-medium">Operation Result:</span>
                  <span className="font-bold text-emerald-700">{operationResult}</span>
                </div>
              </div>

              {/* Counts Summary */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                <div className="p-2.5 bg-slate-100 rounded-lg">
                  <span className="text-[10px] text-slate-500 block uppercase font-bold">Eligible</span>
                  <span className="text-base font-bold text-slate-800">{totalEligibleCount}</span>
                </div>
                <div className="p-2.5 bg-indigo-50 rounded-lg">
                  <span className="text-[10px] text-indigo-700 block uppercase font-bold">Selected</span>
                  <span className="text-base font-bold text-indigo-900">{selectedMachineNumbers.size}</span>
                </div>
                <div className="p-2.5 bg-emerald-50 rounded-lg">
                  <span className="text-[10px] text-emerald-700 block uppercase font-bold">Completed Today</span>
                  <span className="text-base font-bold text-emerald-900">{completedTodayCount}</span>
                </div>
                <div className="p-2.5 bg-amber-50 rounded-lg">
                  <span className="text-[10px] text-amber-700 block uppercase font-bold">Not Selected</span>
                  <span className="text-base font-bold text-amber-900">{notSelectedCount}</span>
                </div>
              </div>

              {/* Selected Machine Numbers List */}
              <div>
                <span className="font-bold text-slate-700 block mb-1">Selected Machines:</span>
                <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200 max-h-24 overflow-y-auto text-slate-700 font-mono text-[11px] leading-relaxed">
                  {Array.from(selectedMachineNumbers).map((mNo) => `#${mNo}`).join(', ')}
                </div>
              </div>

              {remarks && (
                <div className="p-3 bg-slate-50 rounded-lg text-slate-600">
                  <span className="font-bold text-slate-700 block">Remarks:</span>
                  {remarks}
                </div>
              )}
            </div>

            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowConfirmSummary(false)}
                disabled={submitting}
                className="px-4 py-2 rounded-xl text-slate-600 hover:text-slate-800 text-xs font-bold transition disabled:opacity-50"
              >
                Back to Edit
              </button>

              <button
                type="button"
                onClick={handleFinalSubmit}
                disabled={submitting}
                className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black shadow-sm transition disabled:opacity-50 flex items-center gap-2"
              >
                {submitting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Saving to Firestore...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    <span>CONFIRM &amp; SAVE UPDATE</span>
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
