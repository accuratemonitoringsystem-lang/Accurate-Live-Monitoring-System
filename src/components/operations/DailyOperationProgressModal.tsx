import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Cpu,
  Calendar,
  User,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Play,
  Pause,
  AlertOctagon,
  Sparkles,
  Save,
  CheckSquare,
  Square,
  Layers,
  Building,
  History,
  Info,
} from 'lucide-react';
import {
  Machine,
  DepartmentMachineSize,
  DepartmentPart,
  DepartmentOperation,
  MachineOperationExecution,
  DailyOperationUpdate,
  OperationExecutionStatus,
} from '../../types';
import {
  subscribeDepartmentMachineSizes,
  subscribeAllDepartmentParts,
  subscribeAllDepartmentOperations,
  subscribeMachineOperationExecutions,
  subscribeMachineDailyUpdates,
  submitDailyOperationUpdate,
  extractMachineSize,
  OperationDailyInput,
} from '../../services/operationMasterService';
import { useAuth } from '../../context/AuthContext';
import { isDepartmentMatch } from '../../utils/departmentUtils';
import { getMachineDisplaySize, normalizeMachineNumber } from '../../utils/machineUtils';

interface DailyOperationProgressModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentDepartment: string;
  machines: Machine[];
  initialMachine?: Machine | null;
  onSuccess?: () => void;
}

export const DailyOperationProgressModal: React.FC<DailyOperationProgressModalProps> = ({
  isOpen,
  onClose,
  currentDepartment,
  machines,
  initialMachine = null,
  onSuccess,
}) => {
  const { userProfile } = useAuth();
  const isAdmin = userProfile?.role === 'ADMIN';

  // Machines currently assigned to this department (Section 8)
  const availableMachines = useMemo(() => {
    const list = machines.filter((m) => {
      const loc = m.responsibleDepartment || m.currentDepartment;
      return isDepartmentMatch(loc, currentDepartment);
    });
    if (initialMachine && !list.some((m) => normalizeMachineNumber(m.machineNumber) === normalizeMachineNumber(initialMachine.machineNumber))) {
      return [initialMachine, ...list];
    }
    return list;
  }, [machines, currentDepartment, initialMachine]);

  // Selected Machine
  const [selectedMachine, setSelectedMachine] = useState<Machine | null>(initialMachine);

  // Subscribed Operation Master data for current department
  const [configuredSizes, setConfiguredSizes] = useState<DepartmentMachineSize[]>([]);
  const [allParts, setAllParts] = useState<DepartmentPart[]>([]);
  const [allOperations, setAllOperations] = useState<DepartmentOperation[]>([]);

  // Subscribed machine execution history
  const [prevExecutions, setPrevExecutions] = useState<MachineOperationExecution[]>([]);
  const [dailyHistory, setDailyHistory] = useState<DailyOperationUpdate[]>([]);

  // Working state for operations
  const [opStateMap, setOpStateMap] = useState<
    Record<
      string,
      {
        status: OperationExecutionStatus;
        completed: boolean;
        remarks: string;
        holdReason: string;
        startTime: string;
        completionTime: string;
      }
    >
  >({});

  // General fields
  const [todayDate, setTodayDate] = useState(new Date().toISOString().split('T')[0]);
  const [generalRemarks, setGeneralRemarks] = useState('');
  const [overallProgressInput, setOverallProgressInput] = useState<number>(0);
  const [activeTab, setActiveTab] = useState<'today_work' | 'history'>('today_work');

  // Submission feedback
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Set initial machine if passed
  useEffect(() => {
    if (initialMachine) {
      setSelectedMachine(initialMachine);
    } else {
      setSelectedMachine(null);
    }
  }, [initialMachine, isOpen]);

  // Sync overall progress input from selected machine
  useEffect(() => {
    if (selectedMachine) {
      const curProg =
        selectedMachine.departmentProgress !== undefined
          ? selectedMachine.departmentProgress
          : selectedMachine.progress !== undefined
          ? selectedMachine.progress
          : 0;
      setOverallProgressInput(curProg);
    }
  }, [selectedMachine]);

  // 1. Subscribe to Department's Operation Master (Sizes, Parts, Operations)
  useEffect(() => {
    if (!isOpen) return;

    const unsubSizes = subscribeDepartmentMachineSizes(currentDepartment, (sizes) => {
      setConfiguredSizes(sizes);
    });

    const unsubParts = subscribeAllDepartmentParts(currentDepartment, (parts) => {
      setAllParts(parts);
    });

    const unsubOps = subscribeAllDepartmentOperations(currentDepartment, (ops) => {
      setAllOperations(ops);
    });

    return () => {
      unsubSizes();
      unsubParts();
      unsubOps();
    };
  }, [isOpen, currentDepartment]);

  // 2. Detect Machine Size automatically from selected machine (Section 9)
  const detectedMachineSize = useMemo(() => {
    if (!selectedMachine) return '';
    return extractMachineSize(selectedMachine, configuredSizes);
  }, [selectedMachine, configuredSizes]);

  // 3. Subscribe to Machine's previous executions and daily update history (Section 18 & 20)
  useEffect(() => {
    if (!isOpen || !selectedMachine) {
      setPrevExecutions([]);
      setDailyHistory([]);
      return;
    }

    const unsubExec = subscribeMachineOperationExecutions(
      selectedMachine.machineNumber,
      currentDepartment,
      (execs) => {
        setPrevExecutions(execs);
      }
    );

    const unsubHist = subscribeMachineDailyUpdates(selectedMachine.machineNumber, (updates) => {
      setDailyHistory(updates);
    });

    return () => {
      unsubExec();
      unsubHist();
    };
  }, [isOpen, selectedMachine, currentDepartment]);

  // 4. Filter parts and operations applicable to the detected Machine Size (Section 10)
  const applicableParts = useMemo(() => {
    if (!detectedMachineSize) return [];
    return allParts
      .filter(
        (p) =>
          p.active &&
          p.machineSizeId.toLowerCase() === detectedMachineSize.toLowerCase()
      )
      .sort((a, b) => (a.sequence || 0) - (b.sequence || 0));
  }, [allParts, detectedMachineSize]);

  const applicableOperations = useMemo(() => {
    if (!detectedMachineSize) return [];
    return allOperations
      .filter(
        (o) =>
          o.active &&
          o.machineSizeId.toLowerCase() === detectedMachineSize.toLowerCase()
      )
      .sort((a, b) => (a.sequence || 0) - (b.sequence || 0));
  }, [allOperations, detectedMachineSize]);

  // 5. Initialize operation form state when operations or machine changes
  useEffect(() => {
    const map: Record<string, any> = {};

    applicableOperations.forEach((op) => {
      const prev = prevExecutions.find((e) => e.operationId === op.operationId);
      if (prev) {
        map[op.operationId] = {
          status: prev.status || (prev.completed ? 'COMPLETED' : 'NOT STARTED'),
          completed: prev.completed || prev.status === 'COMPLETED',
          remarks: prev.remarks || '',
          holdReason: prev.holdReason || '',
          startTime: '',
          completionTime: prev.completedAt || '',
        };
      } else {
        map[op.operationId] = {
          status: 'NOT STARTED',
          completed: false,
          remarks: '',
          holdReason: '',
          startTime: '',
          completionTime: '',
        };
      }
    });

    setOpStateMap(map);
  }, [applicableOperations, prevExecutions, selectedMachine?.machineNumber]);

  // 6. AUTOMATIC TODAY'S WORK COMPLETION PERCENTAGE (Section 13, 14, 33)
  // Formula: SUM(completed operation weights) ÷ SUM(applicable operation weights) * 100
  const { todayCompletionPercent, totalWeight, completedWeight, completedCount } = useMemo(() => {
    if (applicableOperations.length === 0) {
      return { todayCompletionPercent: 0, totalWeight: 0, completedWeight: 0, completedCount: 0 };
    }

    let totW = 0;
    let compW = 0;
    let compCnt = 0;

    applicableOperations.forEach((op) => {
      const w = op.weight && op.weight > 0 ? Number(op.weight) : 1;
      totW += w;
      const st = opStateMap[op.operationId];
      if (st && (st.completed || st.status === 'COMPLETED')) {
        compW += w;
        compCnt++;
      }
    });

    const pct = totW > 0 ? Math.round((compW / totW) * 100) : 0;
    return {
      todayCompletionPercent: pct,
      totalWeight: totW,
      completedWeight: compW,
      completedCount: compCnt,
    };
  }, [applicableOperations, opStateMap]);

  // Handlers for operation status toggling
  const handleToggleCompleted = (opId: string) => {
    setOpStateMap((prev) => {
      const current = prev[opId] || { status: 'NOT STARTED', completed: false };
      const willBeCompleted = !current.completed;
      return {
        ...prev,
        [opId]: {
          ...current,
          completed: willBeCompleted,
          status: willBeCompleted ? 'COMPLETED' : 'NOT STARTED',
          completionTime: willBeCompleted ? new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '',
        },
      };
    });
  };

  const handleStatusChange = (opId: string, newStatus: OperationExecutionStatus) => {
    setOpStateMap((prev) => {
      const current = prev[opId] || {};
      const isComp = newStatus === 'COMPLETED';
      return {
        ...prev,
        [opId]: {
          ...current,
          status: newStatus,
          completed: isComp,
          completionTime: isComp ? (current.completionTime || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })) : '',
        },
      };
    });
  };

  const handleHoldReasonChange = (opId: string, reason: string) => {
    setOpStateMap((prev) => ({
      ...prev,
      [opId]: {
        ...(prev[opId] || {}),
        holdReason: reason,
      },
    }));
  };

  const handleRemarksChange = (opId: string, remarks: string) => {
    setOpStateMap((prev) => ({
      ...prev,
      [opId]: {
        ...(prev[opId] || {}),
        remarks,
      },
    }));
  };

  // Submit Daily Operation Update
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMachine) {
      setErrorMsg('Please select a Machine Number.');
      return;
    }

    if (applicableOperations.length === 0) {
      setErrorMsg(
        `No operations configured for Machine Size "${detectedMachineSize}" in ${currentDepartment}. Please configure them in Operation Master first.`
      );
      return;
    }

    // Validate hold reasons if any hold status
    for (const op of applicableOperations) {
      const st = opStateMap[op.operationId];
      if (st && st.status === 'HOLD' && !st.holdReason?.trim()) {
        setErrorMsg(`Please specify a Hold Reason for operation "${op.operationName}".`);
        return;
      }
    }

    setSubmitting(true);
    setErrorMsg(null);
    try {
      const opInputs: OperationDailyInput[] = applicableOperations.map((op) => {
        const part = allParts.find((p) => p.partId === op.partId);
        const st = opStateMap[op.operationId] || {
          status: 'NOT STARTED',
          completed: false,
        };
        return {
          operationId: op.operationId,
          operationName: op.operationName,
          partId: op.partId,
          partName: part?.partName || 'Component',
          status: st.status,
          completed: st.completed,
          weight: op.weight || 1,
          remarks: st.remarks || '',
          holdReason: st.holdReason || '',
          startTime: st.startTime || '',
          completionTime: st.completionTime || '',
        };
      });

      await submitDailyOperationUpdate(
        {
          machineNumber: selectedMachine.machineNumber,
          machineSize: detectedMachineSize,
          machineId: selectedMachine.id,
          departmentId: currentDepartment,
          employeeName: userProfile?.displayName || userProfile?.username || 'Operator',
          employeeId: userProfile?.employeeCode || (userProfile as any)?.employeeId || userProfile?.uid || '',
          date: todayDate,
          operations: opInputs,
          remarks: generalRemarks.trim(),
          overallProgressUpdate: overallProgressInput,
        },
        userProfile?.email
      );

      setSuccessMsg('✓ Daily work updated successfully. Records preserved in persistent history.');
      if (onSuccess) onSuccess();

      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err: any) {
      console.error('Error submitting daily operation update:', err);
      setErrorMsg(err.message || 'Failed to submit daily update.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-2xs flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white rounded-2xl max-w-4xl w-full p-5 sm:p-6 shadow-2xl border border-slate-200 space-y-4 max-h-[94vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-3 shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200 uppercase">
                {currentDepartment}
              </span>
              <span className="text-[11px] text-slate-400">Daily Operations Workflow</span>
            </div>
            <h2 className="text-base sm:text-lg font-black text-slate-900 tracking-tight mt-0.5 flex items-center gap-2">
              <CheckSquare className="w-5 h-5 text-blue-600" />
              <span>Update Daily Work (Shop Floor Operations)</span>
            </h2>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab(activeTab === 'today_work' ? 'history' : 'today_work')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                activeTab === 'history'
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              <span>{activeTab === 'history' ? 'Today\'s Checklist' : 'Daily History'}</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Scrollable Content Body */}
        <div className="flex-1 overflow-y-auto space-y-4 pr-1 text-xs">
          {/* Notifications */}
          {errorMsg && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs flex items-center gap-2 animate-in fade-in">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}
          {successMsg && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs font-bold flex items-center gap-2 animate-in fade-in">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Machine Header & Selection Bar (Section 8 & 9) */}
          <div className="bg-slate-50/80 rounded-xl p-4 border border-slate-200 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
            {/* Machine Number Select */}
            <div className="md:col-span-2">
              <label className="block text-slate-600 font-bold mb-1">
                Machine Number <span className="text-rose-500">*</span>
              </label>
              <select
                value={selectedMachine?.machineNumber || ''}
                onChange={(e) => {
                  const m = availableMachines.find((x) => x.machineNumber === e.target.value);
                  setSelectedMachine(m || null);
                }}
                className="w-full bg-white px-3 py-2 rounded-xl border border-slate-300 font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-2xs"
              >
                <option value="">-- SELECT MACHINE NUMBER --</option>
                {availableMachines.length === 0 ? (
                  <option value="" disabled>No machines currently assigned to {currentDepartment}</option>
                ) : (
                  availableMachines.map((m) => {
                    const displaySize = getMachineDisplaySize(m) !== 'Size not available' ? getMachineDisplaySize(m) : (m.machineSize || m.model || 'Standard');
                    return (
                      <option key={m.id || m.machineNumber} value={m.machineNumber}>
                        {m.machineNumber} - Size: {displaySize} ({m.customer || 'Stock'})
                      </option>
                    );
                  })
                )}
              </select>
            </div>

            {/* Auto-detected Machine Size (Section 9) */}
            <div>
              <label className="block text-slate-600 font-bold mb-1">Machine Size</label>
              <div className="bg-white px-3 py-2 rounded-xl border border-slate-200 font-mono font-bold text-blue-700 flex items-center gap-1 shadow-2xs">
                <Cpu className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                <span className="truncate">
                  {selectedMachine ? (detectedMachineSize || 'Size Not Found') : 'Select Machine First'}
                </span>
              </div>
            </div>

            {/* Project & Customer */}
            <div>
              <label className="block text-slate-600 font-bold mb-1">Project / Customer</label>
              <div className="bg-white px-3 py-2 rounded-xl border border-slate-200 text-slate-700 truncate shadow-2xs">
                {selectedMachine ? `${selectedMachine.project || 'Standard'} / ${selectedMachine.customer || 'Stock'}` : '-'}
              </div>
            </div>

            {/* Logged in Employee & Date */}
            <div>
              <label className="block text-slate-600 font-bold mb-1">Employee / Date</label>
              <div className="bg-white px-3 py-2 rounded-xl border border-slate-200 text-slate-700 truncate shadow-2xs">
                {userProfile?.displayName || userProfile?.username || 'Operator'} • {todayDate}
              </div>
            </div>
          </div>

          {/* TAB 1: TODAY'S OPERATIONS CHECKLIST */}
          {activeTab === 'today_work' && (
            <div className="space-y-4">
              {/* Progress Summary KPI Cards (Section 13, 14, 15, 33) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* 1. TODAY'S WORK COMPLETION % (AUTOMATICALLY CALCULATED - READ ONLY) */}
                <div className="p-4 rounded-xl bg-gradient-to-br from-blue-50 to-indigo-50/50 border border-blue-200 shadow-2xs">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-[10px] font-black uppercase tracking-wider text-blue-600">
                        Section 13 &amp; 33 Formula
                      </span>
                      <h4 className="text-xs font-bold text-slate-800">
                        TODAY&apos;S WORK COMPLETION %
                      </h4>
                    </div>
                    <span className="text-2xl font-black text-blue-700 font-mono">
                      {todayCompletionPercent}%
                    </span>
                  </div>
                  <div className="w-full bg-blue-100 rounded-full h-2 mt-2 overflow-hidden">
                    <div
                      className="bg-blue-600 h-full rounded-full transition-all duration-300"
                      style={{ width: `${todayCompletionPercent}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-blue-700 mt-2 font-medium">
                    <span>
                      Completed: <strong>{completedCount}</strong> of{' '}
                      <strong>{applicableOperations.length}</strong> operations
                    </span>
                    <span>
                      Weight: <strong>{completedWeight}</strong> / <strong>{totalWeight}</strong>
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1 italic">
                    * Calculated automatically from completed operation weights. Manual typing is prevented.
                  </p>
                </div>

                {/* 2. OVERALL MACHINE PROGRESS % (SEPARATE FROM DAILY WORK - Section 15 & 16) */}
                <div className="p-4 rounded-xl bg-gradient-to-br from-emerald-50 to-teal-50/50 border border-emerald-200 shadow-2xs">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-[10px] font-black uppercase tracking-wider text-emerald-600">
                        Shop Floor Stage
                      </span>
                      <h4 className="text-xs font-bold text-slate-800">
                        OVERALL MACHINE PROGRESS %
                      </h4>
                    </div>
                    <span className="text-2xl font-black text-emerald-700 font-mono">
                      {overallProgressInput}%
                    </span>
                  </div>
                  <div className="w-full bg-emerald-100 rounded-full h-2 mt-2 overflow-hidden">
                    <div
                      className="bg-emerald-600 h-full rounded-full transition-all duration-300"
                      style={{ width: `${overallProgressInput}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-[11px] text-emerald-800 font-medium">
                      Status: <strong>{selectedMachine?.currentStatus || selectedMachine?.status || 'In Progress'}</strong>
                    </span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] text-slate-500 font-semibold">Adjust Overall:</span>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={overallProgressInput}
                        onChange={(e) => setOverallProgressInput(Math.min(100, Math.max(0, Number(e.target.value))))}
                        className="w-16 px-1.5 py-0.5 rounded border border-emerald-300 text-center font-bold text-xs bg-white"
                      />
                      <span className="text-xs font-bold text-emerald-800">%</span>
                    </div>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1 italic">
                    * Maintained separately from daily operation percentage per Section 15.
                  </p>
                </div>
              </div>

              {/* Operations Checklist Grouped by Part (Section 10 & 11) */}
              {!selectedMachine ? (
                <div className="p-8 text-center border border-dashed border-blue-200 rounded-xl bg-blue-50/50">
                  <Cpu className="w-9 h-9 text-blue-500 mx-auto mb-2" />
                  <h4 className="text-sm font-bold text-slate-800">
                    Select a Machine Number to Update Progress
                  </h4>
                  <p className="text-xs text-slate-600 mt-1 max-w-md mx-auto">
                    Please select a machine currently assigned to <strong>{currentDepartment}</strong> from the dropdown above. The system will automatically fetch its Machine Size from Machine Master and load all configured operations for that size.
                  </p>
                </div>
              ) : applicableOperations.length === 0 ? (
                <div className="p-8 text-center border border-dashed border-amber-200 rounded-xl bg-amber-50/40">
                  <AlertTriangle className="w-8 h-8 text-amber-500 mx-auto mb-2" />
                  <h4 className="text-xs font-bold text-amber-900">
                    No Operations Configured for Size &quot;{detectedMachineSize}&quot; in {currentDepartment}
                  </h4>
                  <p className="text-[11px] text-amber-700 mt-1 max-w-md mx-auto">
                    Please open <strong>Operation Master</strong> from the department sidebar to create parts (Base, Table, Guide, etc.) and define operations for this machine size.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between text-xs text-slate-600 font-bold border-b border-slate-200 pb-2">
                    <span className="uppercase tracking-wider text-[11px] text-slate-500">
                      TODAY&apos;S OPERATIONS CHECKLIST (MACHINE SIZE: {detectedMachineSize})
                    </span>
                    <span className="text-[11px] text-slate-400">
                      Check operations completed today to automatically calculate daily progress
                    </span>
                  </div>

                  {applicableParts.length === 0 ? (
                    // Operations without explicit part grouping
                    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden divide-y divide-slate-100">
                      {applicableOperations.map((op) => renderOperationRow(op))}
                    </div>
                  ) : (
                    // Operations grouped by Part
                    applicableParts.map((part) => {
                      const partOps = applicableOperations.filter((o) => o.partId === part.partId);
                      if (partOps.length === 0) return null;

                      return (
                        <div
                          key={part.id || part.partId}
                          className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs"
                        >
                          <div className="px-3 py-2 bg-slate-100/70 border-b border-slate-200 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Layers className="w-3.5 h-3.5 text-blue-600" />
                              <h4 className="font-bold text-slate-800 text-xs">
                                Part: {part.partName}{' '}
                                <span className="font-mono text-[10px] text-slate-500 font-normal">
                                  ({part.partCode})
                                </span>
                              </h4>
                            </div>
                            <span className="text-[10px] text-slate-500 font-medium">
                              {partOps.filter((o) => opStateMap[o.operationId]?.completed).length} /{' '}
                              {partOps.length} completed
                            </span>
                          </div>

                          <div className="divide-y divide-slate-100">
                            {partOps.map((op) => renderOperationRow(op))}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}

              {/* General Remarks */}
              <div>
                <label className="block text-slate-700 font-bold mb-1">
                  Daily Work Summary &amp; Handover Notes
                </label>
                <textarea
                  rows={2}
                  placeholder="Record overall shift progress, observations, machine alignment findings, or notes for the next shift"
                  value={generalRemarks}
                  onChange={(e) => setGeneralRemarks(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs"
                />
              </div>
            </div>
          )}

          {/* TAB 2: DAILY WORK HISTORY (Section 18 & 20) */}
          {activeTab === 'history' && (
            <div className="space-y-3">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between text-xs">
                <span className="font-bold text-slate-700">
                  Immutable Daily Work Log for Machine {selectedMachine?.machineNumber}
                </span>
                <span className="text-slate-500">
                  {dailyHistory.length} {dailyHistory.length === 1 ? 'record' : 'records'} logged
                </span>
              </div>

              {dailyHistory.length === 0 ? (
                <div className="p-8 text-center border border-dashed border-slate-200 rounded-xl text-slate-400">
                  No previous daily operation updates recorded for this machine yet. Updates submitted today will be permanently preserved here.
                </div>
              ) : (
                <div className="space-y-2">
                  {dailyHistory.map((item) => (
                    <div
                      key={item.id || item.updateId}
                      className="p-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50/50 transition flex items-center justify-between gap-3 text-xs"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-blue-700">{item.date}</span>
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                            {item.employeeName}
                          </span>
                          <span className="font-mono text-[10px] text-slate-400">
                            [{item.updateId}]
                          </span>
                        </div>
                        {item.remarks && (
                          <p className="text-[11px] text-slate-600 mt-1 italic">&ldquo;{item.remarks}&rdquo;</p>
                        )}
                      </div>

                      <div className="text-right shrink-0">
                        <div className="flex items-center gap-2 justify-end">
                          <span className="text-[11px] text-slate-500">
                            {item.completedOperations} / {item.totalOperations} ops
                          </span>
                          <span className="font-black font-mono text-emerald-700 text-sm px-2 py-0.5 rounded bg-emerald-50 border border-emerald-200">
                            {item.completionPercentage}%
                          </span>
                        </div>
                        <span className="text-[10px] text-slate-400">
                          {new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between border-t border-slate-100 pt-3 shrink-0">
          <div className="text-[11px] text-slate-500">
            {applicableOperations.length > 0 && (
              <span>
                Today&apos;s auto-calculated progress: <strong className="text-blue-700">{todayCompletionPercent}%</strong>
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 font-bold hover:bg-slate-50 transition text-xs"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting || applicableOperations.length === 0}
              className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold transition text-xs shadow-md shadow-blue-600/20 flex items-center gap-2 disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              <span>{submitting ? 'Saving Daily Work...' : 'SAVE DAILY UPDATE'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  // Helper row renderer for each operation
  function renderOperationRow(op: DepartmentOperation) {
    const st = opStateMap[op.operationId] || {
      status: 'NOT STARTED',
      completed: false,
      remarks: '',
      holdReason: '',
    };
    const isDone = st.completed || st.status === 'COMPLETED';

    return (
      <div
        key={op.id || op.operationId}
        className={`p-3 transition-colors ${
          isDone ? 'bg-emerald-50/30' : st.status === 'HOLD' ? 'bg-amber-50/40' : 'hover:bg-slate-50/60'
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          {/* Left: Checkbox + Name + Specs */}
          <div className="flex items-start gap-2.5 flex-1">
            <button
              type="button"
              onClick={() => handleToggleCompleted(op.operationId)}
              className="mt-0.5 text-slate-400 hover:text-blue-600 transition shrink-0"
              title={isDone ? 'Mark as Pending' : 'Mark as Completed Today'}
            >
              {isDone ? (
                <CheckSquare className="w-4 h-4 text-emerald-600" />
              ) : (
                <Square className="w-4 h-4 text-slate-300" />
              )}
            </button>

            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-900 text-xs">
                  {op.operationName}
                </span>
                <span className="font-mono text-[10px] text-slate-400 bg-slate-100 px-1 py-0.5 rounded">
                  {op.operationCode}
                </span>
                {op.standardTime && (
                  <span className="text-[10px] text-slate-500 flex items-center gap-0.5">
                    <Clock className="w-2.5 h-2.5 text-slate-400" />
                    <span>{op.standardTime}</span>
                  </span>
                )}
                {op.weight && op.weight > 1 && (
                  <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.2 rounded border border-blue-200">
                    Weight: {op.weight}x
                  </span>
                )}
              </div>
              {op.description && (
                <p className="text-[11px] text-slate-400 mt-0.5">{op.description}</p>
              )}
            </div>
          </div>

          {/* Right: Status selector and Remarks */}
          <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
            <select
              value={st.status}
              onChange={(e) =>
                handleStatusChange(op.operationId, e.target.value as OperationExecutionStatus)
              }
              className={`px-2.5 py-1 rounded-lg font-bold text-[11px] border outline-none cursor-pointer transition ${
                isDone
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                  : st.status === 'HOLD'
                  ? 'bg-amber-50 text-amber-800 border-amber-300'
                  : st.status === 'IN PROGRESS'
                  ? 'bg-blue-50 text-blue-800 border-blue-300'
                  : 'bg-white text-slate-700 border-slate-300'
              }`}
            >
              <option value="NOT STARTED">Not Started</option>
              <option value="IN PROGRESS">In Progress</option>
              <option value="COMPLETED">Completed</option>
              <option value="HOLD">Hold</option>
            </select>

            <input
              type="text"
              placeholder="Remarks / details..."
              value={st.remarks || ''}
              onChange={(e) => handleRemarksChange(op.operationId, e.target.value)}
              className="w-36 sm:w-44 px-2 py-1 rounded-lg border border-slate-200 text-[11px] focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
            />
          </div>
        </div>

        {/* Hold reason prompt if HOLD is selected (Section 12) */}
        {st.status === 'HOLD' && (
          <div className="mt-2 pl-6">
            <label className="block text-[11px] font-bold text-amber-800 mb-0.5">
              Hold Reason (Required) <span className="text-rose-500">*</span>:
            </label>
            <input
              type="text"
              placeholder="e.g. Awaiting fixture alignment, missing drawing revision, material hardness issue"
              value={st.holdReason || ''}
              onChange={(e) => handleHoldReasonChange(op.operationId, e.target.value)}
              required
              className="w-full px-2.5 py-1 rounded-lg border border-amber-300 bg-amber-50/50 text-[11px] text-amber-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>
        )}
      </div>
    );
  }
};
