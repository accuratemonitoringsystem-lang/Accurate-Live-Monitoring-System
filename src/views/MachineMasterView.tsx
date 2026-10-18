import React, { useState, useEffect, useMemo } from 'react';
import {
  Cpu,
  Plus,
  Search,
  Filter,
  ArrowRight,
  FileSpreadsheet,
  Clock,
  CheckCircle2,
  AlertTriangle,
  FolderOpen,
  Upload,
  FileText,
  Trash2,
  X,
  Building,
  ExternalLink,
  Truck,
} from 'lucide-react';
import {
  Department,
  DepartmentHandover,
  DepartmentWork,
  DocumentCategory,
  Machine,
  MachineDocument,
  MachineStatus,
  QualityDailyCheck,
  QualityOperation,
  MachineProcessStage,
  ProcessStageStatus,
} from '../types';
import {
  addMachine,
  updateMachine,
  deleteMachine,
  addMachineDocument,
  updateMachineProcessStage,
} from '../services/db';
import { exportToExcel } from '../utils/excel';
import { MACHINE_STATUSES, DOCUMENT_CATEGORIES, INITIAL_DEPARTMENTS } from '../constants';
import { useAuth } from '../context/AuthContext';

interface MachineMasterViewProps {
  machines: Machine[];
  departments: Department[];
  qualityOps: QualityOperation[];
  qualityChecks: QualityDailyCheck[];
  departmentWork: DepartmentWork[];
  handovers: DepartmentHandover[];
  machineDocs: MachineDocument[];
  selectedMachine: Machine | null;
  onSelectMachine: (machine: Machine | null) => void;
  onOpenExcelImport: () => void;
  selectedDepartment?: string;
}

export const MachineMasterView: React.FC<MachineMasterViewProps> = ({
  machines,
  departments,
  qualityOps,
  qualityChecks,
  departmentWork,
  handovers,
  machineDocs,
  selectedMachine,
  onSelectMachine,
  onOpenExcelImport,
  selectedDepartment,
}) => {
  const { userProfile } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [filterDept, setFilterDept] = useState(
    selectedDepartment && selectedDepartment !== 'All Departments' ? selectedDepartment : ''
  );
  const [filterStatus, setFilterStatus] = useState('');
  const [filterSize, setFilterSize] = useState('');

  const availableSizes = useMemo(() => {
    const set = new Set<string>();
    machines.forEach((m) => {
      const sz = m.machineSize || m.size || m.model || m.machineModel;
      if (sz) set.add(sz.trim());
    });
    return Array.from(set).sort();
  }, [machines]);

  // Sync with persistent selected department
  useEffect(() => {
    if (selectedDepartment && selectedDepartment !== 'All Departments') {
      setFilterDept(selectedDepartment);
    } else if (selectedDepartment === 'All Departments') {
      setFilterDept('');
    }
  }, [selectedDepartment]);

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [showUploadDocModal, setShowUploadDocModal] = useState(false);

  // Form states for Add Machine
  const [machNo, setMachNo] = useState('');
  const [machModel, setMachModel] = useState('');
  const [machProject, setMachProject] = useState('');
  const [machCustomer, setMachCustomer] = useState('');
  const [machPlanMonth, setMachPlanMonth] = useState('March 2026');
  const [machDept, setMachDept] = useState('01 Design');
  const [machStatus, setMachStatus] = useState<MachineStatus>('Not Started');
  const [machPlannedDate, setMachPlannedDate] = useState('');
  const [machRemarks, setMachRemarks] = useState('');
  const [saving, setSaving] = useState(false);

  // Document upload state
  const [docCategory, setDocCategory] = useState<DocumentCategory>('Balloon Drawing');
  const [docTitle, setDocTitle] = useState('');
  const [docVersion, setDocVersion] = useState('v1.0');
  const [docNotes, setDocNotes] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadingDoc, setUploadingDoc] = useState(false);

  // Process stage editing state
  const [editingStage, setEditingStage] = useState<{
    departmentCode: string;
    departmentName: string;
    status: ProcessStageStatus;
    progressPercent: number;
    targetDate: string;
    actualDate: string;
    delayDays: number;
    remarks: string;
  } | null>(null);
  const [savingStage, setSavingStage] = useState(false);

  const handleOpenEditStage = (deptCode: string, deptName: string) => {
    if (!selectedMachine) return;
    const stage = selectedMachine.processStages?.[deptCode];
    setEditingStage({
      departmentCode: deptCode,
      departmentName: deptName,
      status: stage?.status || 'Not Started',
      progressPercent: stage?.progressPercent || 0,
      targetDate: stage?.targetDate || selectedMachine.plannedDate || '',
      actualDate: stage?.actualDate || '',
      delayDays: stage?.delayDays || 0,
      remarks: stage?.remarks || '',
    });
  };

  const handleSaveStage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMachine || !editingStage) return;

    setSavingStage(true);
    try {
      await updateMachineProcessStage(
        selectedMachine.id,
        {
          departmentCode: editingStage.departmentCode,
          departmentName: editingStage.departmentName,
          status: editingStage.status,
          progressPercent: Number(editingStage.progressPercent) || 0,
          targetDate: editingStage.targetDate || undefined,
          actualDate: editingStage.actualDate || undefined,
          delayDays: Number(editingStage.delayDays) || 0,
          remarks: editingStage.remarks.trim() || undefined,
        },
        selectedMachine.processStages || {},
        userProfile?.email
      );
      setEditingStage(null);
    } catch (err) {
      console.error(err);
      alert('Failed to update process stage.');
    } finally {
      setSavingStage(false);
    }
  };

  // Final Dispatch completion state (Requirement: authorized users can perform Dispatch completion)
  const [showDispatchModal, setShowDispatchModal] = useState(false);
  const [dispatchDate, setDispatchDate] = useState(new Date().toISOString().split('T')[0]);
  const [dispatchTransporter, setDispatchTransporter] = useState('');
  const [dispatchInvoice, setDispatchInvoice] = useState('');
  const [dispatchRemarks, setDispatchRemarks] = useState('');
  const [savingDispatch, setSavingDispatch] = useState(false);

  const handleCompleteDispatch = async () => {
    if (!selectedMachine) return;
    setSavingDispatch(true);
    try {
      await updateMachine(
        selectedMachine.id,
        {
          currentStatus: 'Dispatched',
          status: 'DISPATCHED',
          dispatchDate: dispatchDate,
          completionDate: dispatchDate,
          currentDepartment: '15 Packing',
          remarks: dispatchRemarks
            ? `${selectedMachine.remarks ? selectedMachine.remarks + ' | ' : ''}Dispatched on ${dispatchDate}. Ref: ${dispatchInvoice || 'N/A'}. Transporter: ${dispatchTransporter || 'N/A'}. ${dispatchRemarks}`
            : selectedMachine.remarks,
          updatedAt: new Date().toISOString(),
        },
        userProfile?.email
      );
      setShowDispatchModal(false);
    } catch (err: any) {
      console.error('Error completing dispatch:', err);
      alert('Failed to complete dispatch: ' + err.message);
    } finally {
      setSavingDispatch(false);
    }
  };

  // Filtered machines
  const filteredMachines = machines.filter((m) => {
    if (filterDept && m.currentDepartment !== filterDept) return false;
    if (filterStatus && m.currentStatus !== filterStatus) return false;
    if (filterSize) {
      const sz = (m.machineSize || m.size || m.model || m.machineModel || '').toLowerCase();
      if (!sz.includes(filterSize.toLowerCase())) return false;
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const match =
        m.machineNumber.toLowerCase().includes(q) ||
        m.model.toLowerCase().includes(q) ||
        (m.project && m.project.toLowerCase().includes(q)) ||
        (m.customer && m.customer.toLowerCase().includes(q));
      if (!match) return false;
    }
    return true;
  });

  const handleCreateMachine = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!machNo.trim() || !machModel.trim()) return;

    // Check duplicate machine number
    const exists = machines.some(
      (m) => m.machineNumber.trim().toLowerCase() === machNo.trim().toLowerCase()
    );
    if (exists) {
      alert(`Machine Number ${machNo} already exists in the system.`);
      return;
    }

    setSaving(true);
    try {
      await addMachine(
        {
          machineNumber: machNo.trim(),
          model: machModel.trim(),
          project: machProject.trim() || undefined,
          customer: machCustomer.trim() || undefined,
          planMonth: machPlanMonth,
          currentDepartment: machDept,
          currentStatus: machStatus,
          plannedDate: machPlannedDate || undefined,
          remarks: machRemarks.trim() || undefined,
          createdBy: userProfile?.displayName || userProfile?.email,
        },
        userProfile?.email
      );
      setShowAddModal(false);
      // Reset
      setMachNo('');
      setMachModel('');
      setMachProject('');
      setMachCustomer('');
      setMachRemarks('');
    } catch (err) {
      console.error(err);
      alert('Failed to add machine.');
    } finally {
      setSaving(false);
    }
  };

  const handleUploadDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMachine || !docTitle.trim()) return;

    setUploadingDoc(true);
    try {
      let fileDataString = '';
      if (selectedFile) {
        // Read file as base64 for safe storage
        fileDataString = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(selectedFile);
        });
      }

      await addMachineDocument(
        {
          machineNumber: selectedMachine.machineNumber,
          category: docCategory,
          title: docTitle.trim(),
          fileName: selectedFile?.name || 'document.pdf',
          fileSize: selectedFile?.size,
          fileData: fileDataString || undefined,
          version: docVersion.trim() || 'v1.0',
          notes: docNotes.trim() || undefined,
          uploadedBy: userProfile?.displayName || userProfile?.email || 'Authorized User',
        },
        userProfile?.email
      );

      setShowUploadDocModal(false);
      setDocTitle('');
      setSelectedFile(null);
      setDocNotes('');
    } catch (err) {
      console.error(err);
      alert('Failed to upload document.');
    } finally {
      setUploadingDoc(false);
    }
  };

  // If a machine is selected, show Dedicated Tracking Page
  if (selectedMachine) {
    // Quality operations for this machine's model
    const modelOps = qualityOps.filter(
      (o) => o.active && o.machineModel.toLowerCase() === selectedMachine.model.toLowerCase()
    );

    // Checks logged for this specific machine
    const machChecks = qualityChecks.filter((c) => c.machineNumber === selectedMachine.machineNumber);
    const completedCheckIds = new Set(
      machChecks.filter((c) => c.status === 'Accept').map((c) => c.operationId)
    );

    const remainingOps = modelOps.filter((o) => !completedCheckIds.has(o.id));

    // Work history for this machine
    const machWork = departmentWork.filter((w) => w.machineNumber === selectedMachine.machineNumber);

    // Handovers for this machine
    const machHandovers = handovers.filter((h) => h.machineNumber === selectedMachine.machineNumber);

    // Documents for this machine
    const docsForThisMachine = machineDocs.filter(
      (d) => d.machineNumber === selectedMachine.machineNumber
    );

    return (
      <div className="space-y-6">
        {/* Navigation bar back to Master List */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => onSelectMachine(null)}
            className="text-xs font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1.5"
          >
            &larr; Back to Machine Master List
          </button>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => setShowUploadDocModal(true)}
              className="text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg flex items-center gap-1.5 shadow-xs"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Upload Machine Document</span>
            </button>
          </div>
        </div>

        {/* Machine Header Card */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex items-center space-x-4">
              <div className="w-14 h-14 rounded-2xl bg-slate-900 text-white flex flex-col items-center justify-center font-black">
                <span className="text-[10px] text-blue-400">NO.</span>
                <span className="text-base">{selectedMachine.machineNumber}</span>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-xl sm:text-2xl font-black text-slate-900">
                    Machine {selectedMachine.machineNumber}
                  </h2>
                  <span className="text-xs font-bold bg-blue-100 text-blue-800 px-2.5 py-0.5 rounded-md">
                    Model {selectedMachine.model}
                  </span>
                </div>
                <div className="text-xs text-slate-500 mt-1 flex flex-wrap items-center gap-3">
                  <span>Customer: <strong>{selectedMachine.customer || 'General'}</strong></span>
                  <span>Project: <strong>{selectedMachine.project || 'Standard'}</strong></span>
                  <span>Plan Month: <strong>{selectedMachine.planMonth || 'N/A'}</strong></span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-4 bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs">
              <div>
                <div className="text-[10px] text-slate-400 uppercase font-semibold">Current Dept</div>
                <div className="font-bold text-slate-900">{selectedMachine.currentDepartment}</div>
              </div>
              <div className="border-l border-slate-200 pl-4">
                <div className="text-[10px] text-slate-400 uppercase font-semibold">Status</div>
                <span
                  className={`inline-block px-2 py-0.5 rounded text-[11px] font-bold ${
                    selectedMachine.currentStatus === 'Completed' || selectedMachine.currentStatus === 'Dispatched'
                      ? 'bg-emerald-100 text-emerald-800'
                      : selectedMachine.currentStatus === 'Delayed'
                      ? 'bg-red-100 text-red-800'
                      : selectedMachine.currentStatus === 'Quality Hold' || (selectedMachine.currentStatus as string) === 'REWORK_REQUIRED'
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-blue-100 text-blue-800'
                  }`}
                >
                  {selectedMachine.currentStatus === 'Quality Hold'
                    ? 'Rework (legacy Hold)'
                    : (selectedMachine.currentStatus as string) === 'REWORK_REQUIRED'
                    ? 'REWORK REQUIRED'
                    : selectedMachine.currentStatus}
                </span>
              </div>

              {/* Final Dispatch Status & Action */}
              {selectedMachine.currentStatus === 'Dispatched' || selectedMachine.dispatchDate ? (
                <div className="border-l border-emerald-200 pl-4 bg-emerald-50/80 px-3 py-1 rounded-lg">
                  <div className="text-[10px] text-emerald-700 uppercase font-bold flex items-center gap-1">
                    <Truck className="w-3 h-3 text-emerald-600" />
                    <span>Dispatched</span>
                  </div>
                  <div className="font-bold text-emerald-900 font-mono text-[11px]">
                    {selectedMachine.dispatchDate || selectedMachine.completionDate || 'Dispatched'}
                  </div>
                </div>
              ) : (
                <div className="border-l border-slate-200 pl-4">
                  <button
                    type="button"
                    onClick={() => {
                      setDispatchDate(new Date().toISOString().split('T')[0]);
                      setShowDispatchModal(true);
                    }}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition flex items-center gap-1.5 shadow-2xs cursor-pointer"
                    title="Mark machine as final inspected, packed, and dispatched"
                  >
                    <Truck className="w-3.5 h-3.5" />
                    <span>Complete Dispatch</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Machine Progress & Delay KPIs */}
        {(() => {
          const stages = selectedMachine.processStages || {};
          let completedStagesCount = 0;
          let applicableStagesCount = 0;

          INITIAL_DEPARTMENTS.forEach((d) => {
            const stage = stages[d.code];
            const status = stage?.status || 'Not Started';
            if (status !== 'N/A') {
              applicableStagesCount++;
              if (status === 'Completed') {
                completedStagesCount++;
              }
            }
          });

          const overallProgressPct =
            applicableStagesCount > 0
              ? Math.round((completedStagesCount / applicableStagesCount) * 100)
              : 0;

          const isDelayed =
            selectedMachine.plannedDate &&
            selectedMachine.currentStatus !== 'Completed' &&
            new Date(selectedMachine.plannedDate) < new Date();
          const delayDaysCount = isDelayed
            ? Math.floor(
                (Date.now() - new Date(selectedMachine.plannedDate!).getTime()) /
                  (1000 * 60 * 60 * 24)
              )
            : 0;

          return (
            <>
              {/* Progress and Delay Banner */}
              <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="p-3.5 bg-blue-50/60 rounded-xl border border-blue-100">
                  <div className="text-[10px] uppercase font-bold text-blue-800 tracking-wider">Overall Progress</div>
                  <div className="text-2xl font-black text-blue-900 mt-1">{overallProgressPct}%</div>
                  <div className="text-[11px] text-blue-700 mt-0.5">
                    {completedStagesCount} of {applicableStagesCount} applicable processes completed
                  </div>
                  <div className="h-1.5 w-full bg-blue-200 rounded-full mt-2 overflow-hidden">
                    <div
                      className="h-full bg-blue-600 rounded-full transition-all"
                      style={{ width: `${overallProgressPct}%` }}
                    />
                  </div>
                </div>

                <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200">
                  <div className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Planned Completion</div>
                  <div className="text-base font-bold text-slate-900 mt-1">
                    {selectedMachine.plannedDate || 'Not specified'}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">Target production schedule date</div>
                </div>

                <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200">
                  <div className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Actual Completion</div>
                  <div className="text-base font-bold text-slate-900 mt-1">
                    {selectedMachine.completionDate || (selectedMachine.currentStatus === 'Completed' ? 'Completed' : 'In Production')}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">Shop floor recorded date</div>
                </div>

                <div className={`p-3.5 rounded-xl border ${
                  delayDaysCount > 0
                    ? 'bg-red-50 border-red-200 text-red-900'
                    : 'bg-emerald-50 border-emerald-200 text-emerald-900'
                }`}>
                  <div className="text-[10px] uppercase font-bold tracking-wider">
                    {delayDaysCount > 0 ? 'Production Delay' : 'Schedule Status'}
                  </div>
                  <div className="text-2xl font-black mt-1">
                    {delayDaysCount > 0 ? `${delayDaysCount} Days` : 'On Schedule'}
                  </div>
                  <div className="text-[11px] mt-0.5">
                    {delayDaysCount > 0 ? 'Overdue past target date' : 'Running as planned'}
                  </div>
                </div>
              </div>

              {/* Visual Sequential Lifecycle Timeline (Prompt Section 14) */}
              <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h3 className="font-bold text-sm sm:text-base text-slate-900 flex items-center gap-2">
                      <Clock className="w-4 h-4 text-blue-600" />
                      <span>Machine Process Lifecycle Timeline (20 Departments)</span>
                    </h3>
                    <p className="text-xs text-slate-500">
                      End-to-end manufacturing sequence from Design to Final Calibration &amp; Packing. Click any stage to update.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
                    <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" /> Completed</span>
                    <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-blue-600 inline-block" /> In Progress</span>
                    <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block" /> Delayed</span>
                    <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" /> On Hold</span>
                    <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-slate-300 inline-block" /> Not Started</span>
                    <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-slate-200 inline-block" /> N/A</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2.5">
                  {INITIAL_DEPARTMENTS.map((dept) => {
                    const stage = stages[dept.code];
                    const status: ProcessStageStatus = stage?.status || (selectedMachine.currentDepartment === dept.name ? selectedMachine.currentStatus as any : 'Not Started');
                    const isNA = status === 'N/A';
                    const isCompleted = status === 'Completed';
                    const isInProgress = status === 'In Progress';
                    const isDelayedStage = status === 'Delayed';
                    const isOnHold = status === 'On Hold';

                    let cardBg = 'bg-slate-50 border-slate-200 text-slate-700';
                    let badgeBg = 'bg-slate-200 text-slate-700';
                    let statusText = 'Not Started';

                    if (isCompleted) {
                      cardBg = 'bg-emerald-50/70 border-emerald-200 text-emerald-950';
                      badgeBg = 'bg-emerald-100 text-emerald-800';
                      statusText = '✓ Completed';
                    } else if (isInProgress) {
                      cardBg = 'bg-blue-50/70 border-blue-200 text-blue-950';
                      badgeBg = 'bg-blue-100 text-blue-800';
                      statusText = '● In Progress';
                    } else if (isDelayedStage) {
                      cardBg = 'bg-red-50/70 border-red-200 text-red-950';
                      badgeBg = 'bg-red-100 text-red-800';
                      statusText = '⚠ Delayed';
                    } else if (isOnHold) {
                      cardBg = 'bg-amber-50/70 border-amber-200 text-amber-950';
                      badgeBg = 'bg-amber-100 text-amber-800';
                      statusText = '⏸ On Hold';
                    } else if (isNA) {
                      cardBg = 'bg-slate-100/50 border-slate-200 text-slate-400 opacity-60';
                      badgeBg = 'bg-slate-200 text-slate-500';
                      statusText = '⊘ N/A';
                    }

                    return (
                      <div
                        key={dept.code}
                        onClick={() => handleOpenEditStage(dept.code, dept.name)}
                        className={`p-3 rounded-xl border cursor-pointer hover:shadow-sm hover:border-blue-400 transition flex flex-col justify-between ${cardBg}`}
                      >
                        <div>
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-mono font-bold text-slate-500">{dept.code}</span>
                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${badgeBg}`}>
                              {statusText}
                            </span>
                          </div>
                          <div className="font-bold text-xs mt-1.5 line-clamp-2">{dept.name}</div>
                        </div>

                        <div className="mt-2.5 pt-1.5 border-t border-slate-200/60 text-[10px] space-y-0.5 text-slate-500">
                          <div className="flex justify-between">
                            <span>Target:</span>
                            <span className="font-mono font-semibold">{stage?.targetDate || '-'}</span>
                          </div>
                          {stage?.actualDate && (
                            <div className="flex justify-between text-emerald-700 font-semibold">
                              <span>Actual:</span>
                              <span className="font-mono">{stage.actualDate}</span>
                            </div>
                          )}
                          <div className="flex justify-between">
                            <span>Progress:</span>
                            <span className="font-bold">{stage?.progressPercent || (isCompleted ? 100 : 0)}%</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Detailed 20 Process Stages Table (Prompt Section 13 & 15) */}
              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
                <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                  <div>
                    <h3 className="font-bold text-sm sm:text-base text-slate-900">
                      Department Stage Matrix &amp; Status Controls
                    </h3>
                    <p className="text-xs text-slate-500">
                      Target dates, actual dates, progress percentage, delay tracking, and remarks
                    </p>
                  </div>
                  <span className="text-xs text-slate-400 font-mono">
                    20 Processes Standard
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[10px]">
                      <tr>
                        <th className="p-3">Seq / Code</th>
                        <th className="p-3">Process / Department</th>
                        <th className="p-3">Status</th>
                        <th className="p-3">Target Date</th>
                        <th className="p-3">Actual Date</th>
                        <th className="p-3">Progress %</th>
                        <th className="p-3">Delay (Days)</th>
                        <th className="p-3">Remarks</th>
                        <th className="p-3 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {INITIAL_DEPARTMENTS.map((dept) => {
                        const stage = stages[dept.code];
                        const status: ProcessStageStatus = stage?.status || (selectedMachine.currentDepartment === dept.name ? selectedMachine.currentStatus as any : 'Not Started');
                        const progress = stage?.progressPercent ?? (status === 'Completed' ? 100 : 0);
                        const delay = stage?.delayDays || 0;

                        return (
                          <tr key={dept.code} className="hover:bg-slate-50 transition">
                            <td className="p-3 font-mono font-bold text-slate-700">
                              {dept.code}
                            </td>
                            <td className="p-3 font-bold text-slate-900">
                              {dept.name}
                            </td>
                            <td className="p-3">
                              <span
                                className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                                  status === 'Completed'
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : status === 'In Progress'
                                    ? 'bg-blue-100 text-blue-800'
                                    : status === 'Delayed'
                                    ? 'bg-red-100 text-red-800'
                                    : status === 'On Hold'
                                    ? 'bg-amber-100 text-amber-800'
                                    : status === 'N/A'
                                    ? 'bg-slate-100 text-slate-400 line-through'
                                    : 'bg-slate-100 text-slate-700'
                                }`}
                              >
                                {status}
                              </span>
                            </td>
                            <td className="p-3 font-mono text-slate-600">
                              {stage?.targetDate || selectedMachine.plannedDate || '-'}
                            </td>
                            <td className="p-3 font-mono text-emerald-700 font-semibold">
                              {stage?.actualDate || '-'}
                            </td>
                            <td className="p-3">
                              <div className="w-24 flex items-center gap-2">
                                <span className="font-bold text-[11px] text-slate-700 w-8">{progress}%</span>
                                <div className="h-1.5 flex-1 bg-slate-200 rounded-full overflow-hidden">
                                  <div
                                    className={`h-full rounded-full ${
                                      progress === 100 ? 'bg-emerald-500' : 'bg-blue-600'
                                    }`}
                                    style={{ width: `${progress}%` }}
                                  />
                                </div>
                              </div>
                            </td>
                            <td className="p-3">
                              {delay > 0 ? (
                                <span className="text-red-700 font-bold font-mono text-xs">+{delay} d</span>
                              ) : (
                                <span className="text-slate-400">-</span>
                              )}
                            </td>
                            <td className="p-3 text-slate-500 max-w-[180px] truncate">
                              {stage?.remarks || '-'}
                            </td>
                            <td className="p-3 text-right">
                              <button
                                onClick={() => handleOpenEditStage(dept.code, dept.name)}
                                className="px-2.5 py-1 text-xs font-bold text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 rounded-md border border-blue-200"
                              >
                                Update Stage
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          );
        })()}

        {/* Quality Checklist & Remaining Operations Breakdown */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Quality Progress for this machine */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-bold text-sm sm:text-base text-slate-900">
                  Quality Progress (Model {selectedMachine.model})
                </h3>
                <p className="text-xs text-slate-400">
                  {completedCheckIds.size} of {modelOps.length} model operations accepted
                </p>
              </div>
              <span className="text-xs font-bold font-mono bg-blue-50 text-blue-700 px-2.5 py-1 rounded-lg border border-blue-200">
                {modelOps.length > 0
                  ? `${Math.round((completedCheckIds.size / modelOps.length) * 100)}% Complete`
                  : 'No Ops Defined'}
              </span>
            </div>

            {/* Remaining Operations box */}
            <div>
              <div className="text-xs font-bold text-slate-700 mb-2 flex items-center justify-between">
                <span>Remaining Operations for Machine {selectedMachine.machineNumber}:</span>
                <span className="text-slate-400 font-normal">
                  {remainingOps.length} remaining
                </span>
              </div>

              {modelOps.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-400 bg-slate-50 rounded-xl">
                  No quality operations defined for model {selectedMachine.model}. Add operations in Quality Master.
                </div>
              ) : remainingOps.length === 0 ? (
                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>All quality operations for this machine are completed!</span>
                </div>
              ) : (
                <div className="max-h-60 overflow-y-auto space-y-2">
                  {remainingOps.map((op) => (
                    <div
                      key={op.id}
                      className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs flex items-center justify-between"
                    >
                      <div>
                        <div className="font-semibold text-slate-900">{op.operationName}</div>
                        <div className="text-[10px] text-slate-500">
                          {op.category} &bull; {op.processDepartment || 'General'}
                        </div>
                      </div>
                      <span className="text-[10px] bg-amber-100 text-amber-800 font-semibold px-2 py-0.5 rounded">
                        Pending
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Department Work History for this Machine */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
            <h3 className="font-bold text-sm sm:text-base text-slate-900 mb-3">
              Shop Floor Work History
            </h3>
            {machWork.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400 bg-slate-50 rounded-xl">
                No work orders assigned to Machine {selectedMachine.machineNumber} yet.
              </div>
            ) : (
              <div className="space-y-2 max-h-72 overflow-y-auto">
                {machWork.map((w) => (
                  <div key={w.id} className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-900">{w.title}</span>
                      <span
                        className={`text-[10px] font-semibold px-2 py-0.5 rounded ${
                          w.status === 'Completed'
                            ? 'bg-emerald-100 text-emerald-800'
                            : w.status === 'Delayed'
                            ? 'bg-red-100 text-red-800'
                            : 'bg-blue-100 text-blue-800'
                        }`}
                      >
                        {w.status}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500 mt-1">
                      Dept: <strong>{w.department}</strong> &bull; Assigned: {w.assignedTo || 'Unassigned'}
                    </div>
                    {w.delayReason && (
                      <div className="mt-1.5 text-xs text-red-700 bg-red-50 p-1.5 rounded">
                        Delay: {w.delayReason}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Document Vault for this machine */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-bold text-sm sm:text-base text-slate-900 flex items-center gap-2">
                <FolderOpen className="w-4 h-4 text-blue-600" />
                <span>Machine Document Vault (Balloon Drawings, Reports &amp; Photos)</span>
              </h3>
              <p className="text-xs text-slate-400">
                Secure engineering drawings and quality reports for Machine {selectedMachine.machineNumber}
              </p>
            </div>

            <button
              onClick={() => setShowUploadDocModal(true)}
              className="text-xs font-semibold px-3 py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg border border-blue-200 flex items-center gap-1.5"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Upload Document</span>
            </button>
          </div>

          {docsForThisMachine.length === 0 ? (
            <div className="py-10 text-center text-xs text-slate-400 border-2 border-dashed border-slate-200 rounded-xl">
              No documents or drawings uploaded for this machine yet. Click &ldquo;Upload Document&rdquo; above.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {docsForThisMachine.map((docItem) => (
                <div
                  key={docItem.id}
                  className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-start justify-between">
                      <span className="text-[10px] font-bold uppercase tracking-wider bg-blue-100 text-blue-800 px-2 py-0.5 rounded">
                        {docItem.category}
                      </span>
                      <span className="text-[10px] font-mono text-slate-400">
                        {docItem.version || 'v1.0'}
                      </span>
                    </div>
                    <div className="font-bold text-xs text-slate-900 mt-2">{docItem.title}</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">{docItem.fileName}</div>
                    {docItem.notes && (
                      <p className="text-[11px] text-slate-600 mt-1 italic">&ldquo;{docItem.notes}&rdquo;</p>
                    )}
                  </div>

                  <div className="mt-3 pt-2 border-t border-slate-200 flex items-center justify-between text-[10px] text-slate-400">
                    <span>By: {docItem.uploadedBy}</span>
                    {docItem.fileData && (
                      <a
                        href={docItem.fileData}
                        download={docItem.fileName}
                        className="text-blue-600 font-bold hover:underline"
                      >
                        Download
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Upload Document Modal */}
        {showUploadDocModal && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 overflow-hidden text-slate-900">
              <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
                <h3 className="font-bold text-sm">Upload Machine Document</h3>
                <button onClick={() => setShowUploadDocModal(false)} className="text-slate-400 hover:text-white">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleUploadDocument} className="p-5 space-y-3.5">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Document Category <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={docCategory}
                    onChange={(e) => setDocCategory(e.target.value as any)}
                    className="w-full text-xs p-2 rounded-lg border border-slate-300"
                  >
                    {DOCUMENT_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Document Title <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Balloon Drawing Rev 3"
                    value={docTitle}
                    onChange={(e) => setDocTitle(e.target.value)}
                    className="w-full text-xs p-2 rounded-lg border border-slate-300"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Version Code
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. v1.2 / Rev C"
                    value={docVersion}
                    onChange={(e) => setDocVersion(e.target.value)}
                    className="w-full text-xs p-2 rounded-lg border border-slate-300"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Select File (Drawing / PDF / Image)
                  </label>
                  <input
                    type="file"
                    onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                    className="w-full text-xs p-1.5 rounded-lg border border-slate-300 bg-slate-50"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Notes / Remarks
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Approved by engineering team"
                    value={docNotes}
                    onChange={(e) => setDocNotes(e.target.value)}
                    className="w-full text-xs p-2 rounded-lg border border-slate-300"
                  />
                </div>

                <div className="pt-2 flex justify-end space-x-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setShowUploadDocModal(false)}
                    className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={uploadingDoc}
                    className="px-4 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg"
                  >
                    {uploadingDoc ? 'Uploading...' : 'Save Document'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Update Process Stage Modal (Prompt Section 13 & 15) */}
        {editingStage && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 overflow-hidden text-slate-900">
              <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-sm">Update Factory Process Stage</h3>
                  <p className="text-[11px] text-blue-300">
                    {editingStage.departmentCode} - {editingStage.departmentName}
                  </p>
                </div>
                <button
                  onClick={() => setEditingStage(null)}
                  className="text-slate-400 hover:text-white p-1"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleSaveStage} className="p-5 space-y-3.5 text-xs">
                {/* Quick actions */}
                <div className="flex items-center gap-2 pb-1">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingStage({
                        ...editingStage,
                        status: 'Completed',
                        progressPercent: 100,
                        actualDate: editingStage.actualDate || new Date().toISOString().split('T')[0],
                      });
                    }}
                    className="px-2.5 py-1 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-md font-bold text-[11px] hover:bg-emerald-100"
                  >
                    ✓ Mark Completed (100%)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingStage({
                        ...editingStage,
                        status: 'N/A',
                        progressPercent: 0,
                      });
                    }}
                    className="px-2.5 py-1 bg-slate-100 text-slate-700 border border-slate-300 rounded-md font-bold text-[11px] hover:bg-slate-200"
                  >
                    ⊘ Mark N/A (Skip)
                  </button>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Process Status <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={editingStage.status}
                    onChange={(e) =>
                      setEditingStage({
                        ...editingStage,
                        status: e.target.value as ProcessStageStatus,
                      })
                    }
                    className="w-full p-2 rounded-lg border border-slate-300 bg-slate-50 font-bold"
                  >
                    <option value="Not Started">Not Started</option>
                    <option value="In Progress">In Progress</option>
                    <option value="Completed">Completed</option>
                    <option value="Delayed">Delayed</option>
                    <option value="On Hold">On Hold</option>
                    <option value="N/A">N/A (Not Applicable)</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Target Date
                    </label>
                    <input
                      type="date"
                      value={editingStage.targetDate}
                      onChange={(e) =>
                        setEditingStage({
                          ...editingStage,
                          targetDate: e.target.value,
                        })
                      }
                      className="w-full p-2 rounded-lg border border-slate-300 bg-slate-50 font-mono"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Actual Date
                    </label>
                    <input
                      type="date"
                      value={editingStage.actualDate}
                      onChange={(e) =>
                        setEditingStage({
                          ...editingStage,
                          actualDate: e.target.value,
                        })
                      }
                      className="w-full p-2 rounded-lg border border-slate-300 bg-slate-50 font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Progress Percentage ({editingStage.progressPercent}%)
                    </label>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={5}
                      value={editingStage.progressPercent}
                      onChange={(e) =>
                        setEditingStage({
                          ...editingStage,
                          progressPercent: Number(e.target.value),
                        })
                      }
                      className="w-full"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Delay Days
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={editingStage.delayDays}
                      onChange={(e) =>
                        setEditingStage({
                          ...editingStage,
                          delayDays: Number(e.target.value),
                        })
                      }
                      className="w-full p-2 rounded-lg border border-slate-300 bg-slate-50 font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Remarks / Operator Notes
                  </label>
                  <textarea
                    rows={2}
                    placeholder="e.g. Waiting for material release / Assembly alignment verified"
                    value={editingStage.remarks}
                    onChange={(e) =>
                      setEditingStage({
                        ...editingStage,
                        remarks: e.target.value,
                      })
                    }
                    className="w-full p-2 rounded-lg border border-slate-300 bg-slate-50"
                  />
                </div>

                <div className="pt-2 flex justify-end space-x-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setEditingStage(null)}
                    className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={savingStage}
                    className="px-4 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50"
                  >
                    {savingStage ? 'Saving...' : 'Update Stage'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Final Dispatch Completion Modal */}
        {showDispatchModal && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 overflow-hidden text-slate-900">
              <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Truck className="w-5 h-5 text-emerald-400" />
                  <div>
                    <h3 className="font-bold text-sm">Final Dispatch Completion</h3>
                    <p className="text-[11px] text-emerald-300">
                      Machine #{selectedMachine.machineNumber} &bull; Model {selectedMachine.model}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowDispatchModal(false)}
                  className="text-slate-400 hover:text-white p-1"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-5 space-y-3.5 text-xs">
                <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-emerald-800">
                  <p className="font-bold">Record Final Factory Dispatch</p>
                  <p className="text-[11px] text-emerald-700 mt-0.5">
                    This confirms Quality clearance, packing completion, and marks the machine as dispatched in the central register.
                  </p>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Dispatch Date <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={dispatchDate}
                    onChange={(e) => setDispatchDate(e.target.value)}
                    className="w-full p-2.5 rounded-lg border border-slate-300 bg-slate-50 font-mono font-bold"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Invoice / DC / Gate Pass Number (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. AGPL/DC/2026/10-042"
                    value={dispatchInvoice}
                    onChange={(e) => setDispatchInvoice(e.target.value)}
                    className="w-full p-2.5 rounded-lg border border-slate-300 bg-slate-50 font-mono"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Logistics / Transporter / Vehicle Details (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. VRL Logistics / Truck MH-12-AB-3456"
                    value={dispatchTransporter}
                    onChange={(e) => setDispatchTransporter(e.target.value)}
                    className="w-full p-2.5 rounded-lg border border-slate-300 bg-slate-50"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Dispatch Remarks &amp; Customer Notes
                  </label>
                  <textarea
                    rows={2}
                    placeholder="e.g. Factory testing cleared, boxed in wooden crate with certificate of accuracy"
                    value={dispatchRemarks}
                    onChange={(e) => setDispatchRemarks(e.target.value)}
                    className="w-full p-2.5 rounded-lg border border-slate-300 bg-slate-50"
                  />
                </div>

                <div className="pt-2 flex justify-end space-x-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setShowDispatchModal(false)}
                    className="px-3.5 py-2 text-xs text-slate-600 hover:bg-slate-100 rounded-lg font-bold"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={savingDispatch || !dispatchDate}
                    onClick={handleCompleteDispatch}
                    className="px-5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-xs disabled:opacity-50 flex items-center gap-1.5"
                  >
                    <Truck className="w-3.5 h-3.5" />
                    <span>{savingDispatch ? 'Completing Dispatch...' : 'Confirm Dispatch'}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Otherwise show the Master Machines List
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <Cpu className="w-6 h-6 text-blue-600" />
            <span>Machine Master &amp; Tracking Directory</span>
          </h2>
          <p className="text-xs sm:text-sm text-slate-500">
            Machine database, live stages, individual tracking pages, and document vaults
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onOpenExcelImport}
            className="text-xs font-semibold px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg flex items-center gap-1.5"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
            <span>Import Machines</span>
          </button>

          <button
            onClick={() => exportToExcel('Machines_Accurate_Gauging', 'Machines', filteredMachines)}
            className="text-xs font-semibold px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg flex items-center gap-1.5"
          >
            <FileSpreadsheet className="w-4 h-4 text-blue-600" />
            <span>Export Excel</span>
          </button>

          <button
            onClick={() => setShowAddModal(true)}
            className="text-xs font-bold px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-sm flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>Add Machine</span>
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[200px]">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search by machine number, model, customer, project..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full text-xs pl-9 pr-3 py-2 rounded-lg border border-slate-200 focus:outline-hidden focus:ring-2 focus:ring-blue-500 bg-slate-50 text-slate-900"
            />
          </div>
        </div>

        <div className="w-44">
          <select
            value={filterDept}
            onChange={(e) => setFilterDept(e.target.value)}
            className="w-full text-xs p-2 rounded-lg border border-slate-200 bg-slate-50 text-slate-900"
          >
            <option value="">All Departments</option>
            {departments.map((d) => (
              <option key={d.id} value={d.name}>
                {d.name}
              </option>
            ))}
          </select>
        </div>

        <div className="w-44">
          <select
            value={filterSize}
            onChange={(e) => setFilterSize(e.target.value)}
            className="w-full text-xs p-2 rounded-lg border border-indigo-200 bg-indigo-50/60 text-indigo-950 font-bold"
          >
            <option value="">📐 All Sizes ({machines.length})</option>
            {availableSizes.map((sz) => (
              <option key={sz} value={sz}>
                Size {sz}
              </option>
            ))}
          </select>
        </div>

        <div className="w-40">
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="w-full text-xs p-2 rounded-lg border border-slate-200 bg-slate-50 text-slate-900"
          >
            <option value="">All Statuses</option>
            {MACHINE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Master Machines Table */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
        {filteredMachines.length === 0 ? (
          <div className="p-12 text-center text-xs text-slate-400">
            No machine data available yet. Click &ldquo;Add Machine&rdquo; or import from Excel.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="p-3">Machine No.</th>
                  <th className="p-3">Model / Size</th>
                  <th className="p-3">Current Department</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Overall Progress</th>
                  <th className="p-3">Plan Month</th>
                  <th className="p-3">Customer / Project</th>
                  <th className="p-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredMachines.map((m) => {
                  const stages = m.processStages || {};
                  let completedCount = 0;
                  let applicableCount = 0;
                  INITIAL_DEPARTMENTS.forEach((d) => {
                    const stage = stages[d.code];
                    const status = stage?.status || 'Not Started';
                    if (status !== 'N/A') {
                      applicableCount++;
                      if (status === 'Completed') completedCount++;
                    }
                  });
                  const progressPct =
                    applicableCount > 0
                      ? Math.round((completedCount / applicableCount) * 100)
                      : 0;

                  return (
                    <tr key={m.id} className="hover:bg-slate-50 transition">
                      <td className="p-3 font-bold text-slate-900">
                        Machine {m.machineNumber}
                      </td>
                      <td className="p-3 text-slate-700 font-medium">{m.model}</td>
                      <td className="p-3 text-slate-700">
                        <span className="bg-slate-100 px-2 py-0.5 rounded text-[11px] font-mono">
                          {m.currentDepartment}
                        </span>
                      </td>
                      <td className="p-3">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                            m.currentStatus === 'Completed'
                              ? 'bg-emerald-100 text-emerald-800'
                              : m.currentStatus === 'Delayed'
                              ? 'bg-red-100 text-red-800'
                              : m.currentStatus === 'Quality Hold' || (m.currentStatus as string) === 'REWORK_REQUIRED'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-blue-100 text-blue-800'
                          }`}
                        >
                          {m.currentStatus === 'Quality Hold'
                            ? 'Rework (legacy Hold)'
                            : (m.currentStatus as string) === 'REWORK_REQUIRED'
                            ? 'REWORK REQUIRED'
                            : m.currentStatus}
                        </span>
                      </td>
                      <td className="p-3">
                        <div className="w-32">
                          <div className="flex items-center justify-between text-[10px] font-bold text-slate-700 mb-1">
                            <span>{progressPct}%</span>
                            <span className="text-[9px] font-normal text-slate-400">
                              {completedCount}/{applicableCount} stages
                            </span>
                          </div>
                          <div className="h-1.5 w-full bg-slate-200 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${
                                progressPct === 100
                                  ? 'bg-emerald-500'
                                  : progressPct > 50
                                  ? 'bg-blue-600'
                                  : 'bg-slate-400'
                              }`}
                              style={{ width: `${progressPct}%` }}
                            />
                          </div>
                        </div>
                      </td>
                      <td className="p-3 text-slate-600">{m.planMonth || '-'}</td>
                      <td className="p-3 text-slate-600">
                        {m.customer || m.project || '-'}
                      </td>
                      <td className="p-3 text-right">
                        <button
                          onClick={() => onSelectMachine(m)}
                          className="text-xs font-bold text-blue-600 hover:text-blue-800"
                        >
                          Track Details &rarr;
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add Machine Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200 overflow-hidden text-slate-900">
            <div className="p-5 bg-slate-900 text-white flex items-center justify-between">
              <div>
                <h3 className="font-bold text-base">Add New Machine</h3>
                <p className="text-xs text-slate-400">Register machine into factory workflow</p>
              </div>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateMachine} className="p-5 space-y-3.5">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Machine Number <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 2523, 2528"
                    value={machNo}
                    onChange={(e) => setMachNo(e.target.value)}
                    className="w-full text-xs p-2 rounded-lg border border-slate-300 font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Model / Size <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 685, 1012, 1220"
                    value={machModel}
                    onChange={(e) => setMachModel(e.target.value)}
                    className="w-full text-xs p-2 rounded-lg border border-slate-300"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Customer Name
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Tata Motors, Aerospace Corp"
                    value={machCustomer}
                    onChange={(e) => setMachCustomer(e.target.value)}
                    className="w-full text-xs p-2 rounded-lg border border-slate-300"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Project Name
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Project V6"
                    value={machProject}
                    onChange={(e) => setMachProject(e.target.value)}
                    className="w-full text-xs p-2 rounded-lg border border-slate-300"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Plan Month
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. March 2026"
                    value={machPlanMonth}
                    onChange={(e) => setMachPlanMonth(e.target.value)}
                    className="w-full text-xs p-2 rounded-lg border border-slate-300"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Initial Department <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={machDept}
                    onChange={(e) => setMachDept(e.target.value)}
                    className="w-full text-xs p-2 rounded-lg border border-slate-300"
                  >
                    {departments.map((d) => (
                      <option key={d.id} value={d.name}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Initial Status
                  </label>
                  <select
                    value={machStatus}
                    onChange={(e) => setMachStatus(e.target.value as any)}
                    className="w-full text-xs p-2 rounded-lg border border-slate-300"
                  >
                    {MACHINE_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Planned Date
                  </label>
                  <input
                    type="date"
                    value={machPlannedDate}
                    onChange={(e) => setMachPlannedDate(e.target.value)}
                    className="w-full text-xs p-2 rounded-lg border border-slate-300"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Remarks / Notes
                </label>
                <input
                  type="text"
                  placeholder="Additional machine tracking instructions..."
                  value={machRemarks}
                  onChange={(e) => setMachRemarks(e.target.value)}
                  className="w-full text-xs p-2 rounded-lg border border-slate-300"
                />
              </div>

              <div className="pt-3 flex justify-end space-x-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg"
                >
                  {saving ? 'Saving...' : 'Register Machine'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
