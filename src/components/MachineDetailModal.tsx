import React, { useState } from 'react';
import {
  X,
  Cpu,
  Calendar,
  Clock,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  User,
  ShieldCheck,
  FileText,
  History,
  Building,
  ArrowRightLeft,
  Edit3,
  Flame,
  Check,
  Layers,
  Send,
  RefreshCw,
  PauseCircle,
} from 'lucide-react';
import {
  Department,
  DepartmentHandover,
  DepartmentWork,
  DocumentCategory,
  Machine,
  MachineDocument,
  MonthlyPlan,
  QualityDailyCheck,
  QualityOperation,
  QualityRejection,
  WeeklyPlan,
  YearlyPlan,
  MachineProcessStage,
  ProcessStageStatus,
  WorkOperationItem,
} from '../types';
import { INITIAL_DEPARTMENTS } from '../constants';
import { resolveMachineInfo } from '../utils/machineMonitoring';
import { updateMachineProcessStage, addMachineDocument, updateMachineOperationStatus } from '../services/db';
import { getOperationsForMachineDepartment, saveDepartmentOperationsProgress } from '../services/operationWorkflowService';
import { useAuth } from '../context/AuthContext';
import { hasQualityInspectionAccess } from '../utils/departmentUtils';
import { QualityInspectionDecisionModal } from './QualityInspectionDecisionModal';

interface MachineDetailModalProps {
  isOpen?: boolean;
  machine: Machine | null;
  onClose: () => void;
  departments?: Department[];
  departmentWork: DepartmentWork[];
  handovers: DepartmentHandover[];
  qualityChecks: QualityDailyCheck[];
  qualityRejections: QualityRejection[];
  qualityOps: QualityOperation[];
  machineDocs: MachineDocument[];
  monthlyPlans?: MonthlyPlan[];
  weeklyPlans?: WeeklyPlan[];
  yearlyPlans?: YearlyPlan[];
}

export const MachineDetailModal: React.FC<MachineDetailModalProps> = ({
  isOpen = true,
  machine,
  onClose,
  departments = INITIAL_DEPARTMENTS,
  departmentWork,
  handovers,
  qualityChecks,
  qualityRejections,
  qualityOps,
  machineDocs,
  monthlyPlans = [],
  weeklyPlans = [],
  yearlyPlans = [],
}) => {
  const { userProfile } = useAuth();
  const [activeTab, setActiveTab] = useState<
    | 'overview'
    | 'planning'
    | 'monthly_plan'
    | 'weekly_plan'
    | 'progress'
    | 'work'
    | 'quality'
    | 'handover'
    | 'documents'
    | 'history'
  >('overview');

  // Process Stage Edit State
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

  // Document Upload State
  const [showUploadDoc, setShowUploadDoc] = useState(false);
  const [docCategory, setDocCategory] = useState<DocumentCategory>('Machine Drawing');
  const [docTitle, setDocTitle] = useState('');
  const [docVersion, setDocVersion] = useState('v1.0');
  const [docNotes, setDocNotes] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadingDoc, setUploadingDoc] = useState(false);

  // Work Operations state (Requirement 4 & 6)
  const [updatingOpId, setUpdatingOpId] = useState<string | null>(null);
  const [opError, setOpError] = useState<string | null>(null);

  // Progress notes & Send to Admin state (Requirement 3, 4)
  const [modalWorkDoneToday, setModalWorkDoneToday] = useState('');
  const [modalRemainingWork, setModalRemainingWork] = useState('');
  const [modalRemarks, setModalRemarks] = useState('');
  const [sendingToAdmin, setSendingToAdmin] = useState(false);
  const [adminSendSuccess, setAdminSendSuccess] = useState<string | null>(null);

  // Quality Inspection Decision modal state (Hold, Reject, Accept - Quality & Admin)
  const [showQcModal, setShowQcModal] = useState(false);
  const [qcModalAction, setQcModalAction] = useState<'Accept' | 'Reject' | 'Hold'>('Accept');

  if (!isOpen || !machine) return null;

  const info = resolveMachineInfo(
    machine,
    departmentWork,
    handovers,
    qualityChecks,
    qualityRejections,
    qualityOps
  );

  const docsForMachine = machineDocs.filter(
    (d) => d.machineNumber === machine.machineNumber
  );

  const machineMonthlyPlans = monthlyPlans.filter(
    (p) => p.machineNumber === machine.machineNumber || p.machineModel === machine.model
  );

  const machineWeeklyPlans = weeklyPlans.filter(
    (p) => p.machineNumber === machine.machineNumber || p.machineModel === machine.model
  );

  const handleOpenEditStage = (deptCode: string, deptName: string) => {
    const existing = machine.processStages?.[deptCode];
    setEditingStage({
      departmentCode: deptCode,
      departmentName: deptName,
      status: existing?.status || 'Not Started',
      progressPercent: existing?.progressPercent || 0,
      targetDate: existing?.targetDate || machine.plannedDate || '',
      actualDate: existing?.actualDate || '',
      delayDays: existing?.delayDays || 0,
      remarks: existing?.remarks || '',
    });
  };

  const handleSaveStage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStage) return;
    setSavingStage(true);
    try {
      await updateMachineProcessStage(
        machine.id,
        {
          departmentCode: editingStage.departmentCode,
          departmentName: editingStage.departmentName,
          status: editingStage.status,
          progressPercent: Number(editingStage.progressPercent),
          targetDate: editingStage.targetDate,
          actualDate: editingStage.actualDate,
          delayDays: Number(editingStage.delayDays),
          remarks: editingStage.remarks,
        },
        machine.processStages,
        userProfile?.email
      );
      setEditingStage(null);
    } catch (err) {
      console.error('Failed to update stage:', err);
    } finally {
      setSavingStage(false);
    }
  };

  const handleUploadDoc = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile || !docTitle.trim()) return;
    setUploadingDoc(true);
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const base64Data = reader.result as string;
        await addMachineDocument(
          {
            machineNumber: machine.machineNumber,
            category: docCategory,
            title: docTitle.trim(),
            fileName: selectedFile.name,
            fileSize: selectedFile.size,
            fileData: base64Data,
            version: docVersion,
            notes: docNotes,
            uploadedBy: userProfile?.employeeName || userProfile?.email || 'User',
          },
          userProfile?.email
        );
        setShowUploadDoc(false);
        setDocTitle('');
        setSelectedFile(null);
        setUploadingDoc(false);
      };
      reader.readAsDataURL(selectedFile);
    } catch (err) {
      console.error('Failed to upload document:', err);
      setUploadingDoc(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl max-w-5xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden text-slate-800">
        {/* Top Header */}
        <div className="p-4 sm:p-5 bg-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600/30 border border-blue-400/40 flex items-center justify-center text-blue-300">
              <Cpu className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-lg sm:text-xl font-black tracking-tight text-white">
                  Machine {info.machineNumber}
                </h2>
                <span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-slate-800 text-slate-300 border border-slate-700">
                  {info.model}
                </span>
                {(machine.isNpi || machine.remarks?.toUpperCase().includes('NPI') || machine.model?.toUpperCase().includes('NPI') || info.model?.toUpperCase().includes('NPI')) && (
                  <span className="text-xs px-2.5 py-0.5 rounded-full font-black bg-purple-600 text-white border border-purple-400 shadow-xs">
                    NPI Model
                  </span>
                )}
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    info.currentStatus === 'Completed'
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                      : info.isDelayed
                      ? 'bg-red-500/20 text-red-300 border border-red-500/40'
                      : 'bg-blue-500/20 text-blue-300 border border-blue-500/40'
                  }`}
                >
                  {info.currentStatus}
                </span>
              </div>
              <div className="text-xs text-slate-400 mt-0.5">
                Project: <strong className="text-slate-200">{info.project}</strong> &bull; Customer: <strong className="text-slate-200">{info.customer}</strong>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {hasQualityInspectionAccess(userProfile) && (
              <button
                onClick={() => {
                  setQcModalAction('Accept');
                  setShowQcModal(true);
                }}
                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-xs"
                title="Quality Inspection: Hold, Reject, or Accept"
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>QC Decision</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* PROMINENT CURRENT MACHINE LOCATION (Section 6) */}
        <div className="bg-gradient-to-r from-blue-50 via-indigo-50/70 to-slate-50 border-b border-indigo-100/80 p-4 sm:p-5">
          <div className="text-[10px] font-black uppercase tracking-wider text-blue-700 mb-2 flex items-center space-x-1.5">
            <Building className="w-3.5 h-3.5" />
            <span>Current Machine Location &amp; Shop Floor Handover Status</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 text-xs">
            <div className="bg-white/90 p-2.5 rounded-xl border border-slate-200/80">
              <span className="text-[10px] font-bold text-slate-400 uppercase block">Machine</span>
              <span className="font-mono font-black text-slate-900 text-sm">{info.machineNumber}</span>
            </div>

            <div className="bg-white/90 p-2.5 rounded-xl border border-slate-200/80">
              <span className="text-[10px] font-bold text-slate-400 uppercase block">Current Dept</span>
              <span className="font-bold text-indigo-700 truncate block" title={info.currentDepartment}>
                {info.currentDepartment}
              </span>
            </div>

            <div className="bg-white/90 p-2.5 rounded-xl border border-slate-200/80">
              <span className="text-[10px] font-bold text-slate-400 uppercase block">Current Process</span>
              <span className="font-semibold text-slate-800 truncate block" title={info.currentProcess}>
                {info.currentProcess}
              </span>
            </div>

            <div className="bg-white/90 p-2.5 rounded-xl border border-slate-200/80">
              <span className="text-[10px] font-bold text-slate-400 uppercase block">Assigned Employee</span>
              <span className="font-semibold text-slate-700 truncate block" title={info.assignedEmployee}>
                {info.assignedEmployee}
              </span>
            </div>

            <div className="bg-white/90 p-2.5 rounded-xl border border-slate-200/80">
              <span className="text-[10px] font-bold text-slate-400 uppercase block">Status</span>
              <span
                className={`font-bold inline-block px-1.5 py-0.2 rounded text-[11px] ${
                  info.currentStatus === 'Completed'
                    ? 'text-emerald-700 bg-emerald-50'
                    : info.isDelayed
                    ? 'text-red-700 bg-red-50'
                    : 'text-blue-700 bg-blue-50'
                }`}
              >
                {info.currentStatus}
              </span>
            </div>

            <div className="bg-white/90 p-2.5 rounded-xl border border-slate-200/80">
              <span className="text-[10px] font-bold text-slate-400 uppercase block">Progress</span>
              <div className="flex items-center space-x-1.5 mt-0.5">
                <div className="flex-1 h-2 bg-slate-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-600 rounded-full transition-all"
                    style={{ width: `${Math.min(100, info.progressPercent)}%` }}
                  />
                </div>
                <span className="font-mono font-bold text-slate-900 text-[11px]">
                  {info.progressPercent}%
                </span>
              </div>
            </div>

            <div className="bg-white/90 p-2.5 rounded-xl border border-slate-200/80">
              <span className="text-[10px] font-bold text-slate-400 uppercase block">Next Dept</span>
              <span className="font-bold text-emerald-700 truncate block" title={info.nextDepartment}>
                {info.nextDepartment}
              </span>
            </div>
          </div>
        </div>

        {/* Modal Tabs (Section 21) */}
        <div className="flex items-center px-4 sm:px-6 border-b border-slate-200 bg-white overflow-x-auto shrink-0 custom-scrollbar">
          {[
            { id: 'overview', label: 'Overview' },
            { id: 'planning', label: 'Planning' },
            { id: 'monthly_plan', label: `Monthly Plan (${machineMonthlyPlans.length})` },
            { id: 'weekly_plan', label: `Weekly Plan (${machineWeeklyPlans.length})` },
            { id: 'progress', label: 'Department Progress' },
            { id: 'work', label: `Current Work (${info.allWorkList.length})` },
            { id: 'quality', label: `Quality (${info.qualityChecks.length})` },
            { id: 'handover', label: `Handover (${info.handoverHistory.length})` },
            { id: 'documents', label: `Documents (${docsForMachine.length})` },
            { id: 'history', label: `History (${info.workHistory.length})` },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-3 sm:px-4 py-3 text-xs font-bold whitespace-nowrap border-b-2 transition ${
                activeTab === tab.id
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          {/* TAB 1: OVERVIEW */}
          {activeTab === 'overview' && (() => {
            const canUpdateCurrentDept =
              userProfile?.role === 'ADMIN' ||
              (userProfile?.department &&
                info.currentDepartment &&
                (userProfile.department.toLowerCase() === info.currentDepartment.toLowerCase() ||
                  info.currentDepartment.includes(userProfile.department) ||
                  userProfile.department.includes(info.currentDepartment)));

            const machineOps: WorkOperationItem[] =
              machine.operations && machine.operations.length > 0
                ? machine.operations
                : [
                    { id: 'op_1', name: 'Material & Raw Stock Verification', status: 'Not Started' },
                    { id: 'op_2', name: 'Machining & Mechanical Fabrication', status: 'Not Started' },
                    { id: 'op_3', name: 'Sub-Assembly & Precision Fitting', status: 'Not Started' },
                    { id: 'op_4', name: 'Electrical Wiring & Pneumatic Routing', status: 'Not Started' },
                    { id: 'op_5', name: 'Calibration & Alignment Check', status: 'Not Started' },
                    { id: 'op_6', name: 'Pre-Inspection Quality Verification', status: 'Not Started' },
                  ];

            const completedOpsCount = machineOps.filter((o) => o.status === 'Completed').length;
            const is100Percent =
              info.progressPercent >= 100 || (machineOps.length > 0 && completedOpsCount === machineOps.length);

            const handleToggleOp = async (
              opId: string,
              newStatus: 'Not Started' | 'In Progress' | 'Completed'
            ) => {
              if (!canUpdateCurrentDept) {
                setOpError(
                  `ACCESS RESTRICTED: You belong to ${userProfile?.department || 'another department'}, but Machine ${machine.machineNumber} is currently owned by ${info.currentDepartment}. Only users of ${info.currentDepartment} or Admin can update these operations.`
                );
                return;
              }
              setUpdatingOpId(opId);
              setOpError(null);
              try {
                await updateMachineOperationStatus(machine.id, opId, newStatus, userProfile);
              } catch (err: any) {
                setOpError(err?.message || 'Failed to update operation.');
              } finally {
                setUpdatingOpId(null);
              }
            };

            const handleSendProgressToAdmin = async () => {
              if (!canUpdateCurrentDept) {
                setOpError('ACCESS RESTRICTED: You are not authorized to update progress for this department.');
                return;
              }
              setSendingToAdmin(true);
              setOpError(null);
              setAdminSendSuccess(null);
              try {
                const deptOps = machineOps.map((op) => ({
                  id: op.id,
                  operationName: op.name,
                  department: info.currentDepartment,
                  status: op.status || 'Not Started',
                  completedToday: op.status === 'Completed',
                  completedDate: op.completedDate,
                  completedBy: op.completedBy,
                }));

                const res = await saveDepartmentOperationsProgress({
                  machine,
                  department: info.currentDepartment,
                  operations: deptOps as any,
                  remarks: modalRemarks.trim(),
                  workDoneToday: modalWorkDoneToday.trim(),
                  remainingWork: modalRemainingWork.trim(),
                  userProfile,
                  sendToAdmin: true,
                });

                setAdminSendSuccess(
                  `Progress (${res.departmentProgress}%) successfully recorded and transmitted to Admin dashboard with notification!`
                );
              } catch (err: any) {
                setOpError(err?.message || 'Failed to send progress to Admin.');
              } finally {
                setSendingToAdmin(false);
              }
            };

            return (
              <div className="space-y-6">
                {/* 1. MACHINE DETAIL HEADER (Requirement 4) */}
                <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200">
                  <div className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-3">
                    Machine Master Information
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 text-xs">
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase block">Machine Number</span>
                      <span className="text-base font-black text-slate-900 font-mono">{info.machineNumber}</span>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase block">Machine Size / Model</span>
                      <span className="text-xs font-bold text-slate-800">{info.model}</span>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase block">Priority</span>
                      <span className="text-xs font-black font-mono px-2 py-0.5 bg-blue-100 text-blue-800 rounded">
                        {machine.priority || 'P01'}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase block">Plan Month</span>
                      <span className="text-xs font-bold text-slate-800">{info.planMonth || 'September 2026'}</span>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase block">Current Department</span>
                      <span className="text-xs font-bold text-indigo-700">{info.currentDepartment}</span>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase block">Assigned Date</span>
                      <span className="text-xs font-semibold text-slate-700">
                        {machine.assignedDate || machine.plannedStartDate || machine.createdAt?.split('T')[0] || 'Today'}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase block">Target Date</span>
                      <span className="text-xs font-semibold text-slate-700">
                        {machine.targetDate || machine.plannedDueDate || machine.dueDate || info.plannedDate || 'Pending Schedule'}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase block">Current Status</span>
                      <span
                        className={`text-xs font-bold px-2 py-0.5 rounded inline-block ${
                          info.currentStatus === 'Completed' || is100Percent
                            ? 'bg-emerald-100 text-emerald-800'
                            : info.isDelayed
                            ? 'bg-red-100 text-red-800'
                            : 'bg-blue-100 text-blue-800'
                        }`}
                      >
                        {is100Percent ? 'Ready for Handover' : info.currentStatus}
                      </span>
                    </div>
                    <div className="col-span-2">
                      <span className="text-[10px] font-bold text-slate-400 uppercase block">Overall Progress %</span>
                      <div className="flex items-center space-x-2 mt-1">
                        <div className="flex-1 h-2.5 bg-slate-200 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              is100Percent ? 'bg-emerald-600' : 'bg-blue-600'
                            }`}
                            style={{ width: `${Math.min(100, is100Percent ? 100 : info.progressPercent)}%` }}
                          />
                        </div>
                        <span className="text-xs font-black font-mono text-slate-900">
                          {is100Percent ? 100 : info.progressPercent}%
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 2. READY FOR HANDOVER BANNER (Requirement 6) */}
                {is100Percent && (
                  <div className="bg-emerald-600 text-white p-4 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-md animate-fadeIn">
                    <div className="flex items-center space-x-3">
                      <div className="p-2 bg-emerald-700/80 rounded-xl">
                        <CheckCircle2 className="w-6 h-6 text-white" />
                      </div>
                      <div>
                        <div className="text-sm font-black uppercase tracking-wider">READY FOR HANDOVER</div>
                        <div className="text-xs text-emerald-100 mt-0.5">
                          100% of operations have been completed in {info.currentDepartment}. This machine is authorized for handover to the next department.
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => setActiveTab('handover')}
                      className="px-4 py-2 bg-white text-emerald-800 font-bold rounded-xl text-xs hover:bg-emerald-50 transition shadow-xs shrink-0"
                    >
                      Initiate Handover &rarr;
                    </button>
                  </div>
                )}

                {/* Error Banner if any */}
                {opError && (
                  <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl flex items-center justify-between">
                    <span>{opError}</span>
                    <button onClick={() => setOpError(null)} className="font-bold text-red-900 ml-2">
                      &times;
                    </button>
                  </div>
                )}

                {/* 3. WORK OPERATIONS SECTION (Requirement 4 & 6) */}
                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
                    <div>
                      <div className="flex items-center space-x-2">
                        <Layers className="w-4 h-4 text-blue-600" />
                        <h3 className="text-sm font-black text-slate-900 uppercase tracking-wide">
                          WORK OPERATIONS &bull; {info.currentDepartment}
                        </h3>
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Department employee can update ONLY their own department's operations. Progress is automatically calculated: {completedOpsCount} of {machineOps.length} completed ({machineOps.length > 0 ? Math.round((completedOpsCount / machineOps.length) * 100) : 0}%).
                      </p>
                    </div>

                    {!canUpdateCurrentDept && (
                      <span className="text-[11px] font-bold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-lg">
                        Read-Only View (Owned by {info.currentDepartment})
                      </span>
                    )}
                  </div>

                  <div className="space-y-2.5">
                    {machineOps.map((op, idx) => {
                      const isNotStarted = op.status === 'Not Started' || !op.status;
                      const isInProgress = op.status === 'In Progress';
                      const isCompleted = op.status === 'Completed';
                      const isUpdating = updatingOpId === op.id;

                      return (
                        <div
                          key={op.id || idx}
                          className={`p-3.5 rounded-xl border transition flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                            isCompleted
                              ? 'bg-emerald-50/40 border-emerald-200'
                              : isInProgress
                              ? 'bg-blue-50/40 border-blue-200'
                              : 'bg-slate-50/60 border-slate-200'
                          }`}
                        >
                          <div className="flex items-center space-x-3">
                            <span className="w-6 h-6 rounded-full bg-slate-200 text-slate-700 font-mono font-bold text-xs flex items-center justify-center shrink-0">
                              {idx + 1}
                            </span>
                            <div>
                              <div className="text-xs font-bold text-slate-900">{op.name}</div>
                              {op.completedDate && (
                                <div className="text-[10px] text-emerald-700">
                                  Completed on {op.completedDate} by {op.completedBy || 'Operator'}
                                </div>
                              )}
                            </div>
                          </div>

                          {/* 3 Status Buttons */}
                          <div className="flex items-center space-x-1.5 shrink-0">
                            <button
                              disabled={!canUpdateCurrentDept || isUpdating}
                              onClick={() => handleToggleOp(op.id, 'Not Started')}
                              className={`px-2.5 py-1 text-[11px] font-bold rounded-lg border transition ${
                                isNotStarted
                                  ? 'bg-slate-800 text-white border-slate-800 shadow-2xs'
                                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100 disabled:opacity-40'
                              }`}
                            >
                              [ ] Not Started
                            </button>

                            <button
                              disabled={!canUpdateCurrentDept || isUpdating}
                              onClick={() => handleToggleOp(op.id, 'In Progress')}
                              className={`px-2.5 py-1 text-[11px] font-bold rounded-lg border transition ${
                                isInProgress
                                  ? 'bg-blue-600 text-white border-blue-600 shadow-2xs'
                                  : 'bg-white text-blue-700 border-blue-200 hover:bg-blue-50 disabled:opacity-40'
                              }`}
                            >
                              [●] In Progress
                            </button>

                            <button
                              disabled={!canUpdateCurrentDept || isUpdating}
                              onClick={() => handleToggleOp(op.id, 'Completed')}
                              className={`px-2.5 py-1 text-[11px] font-bold rounded-lg border transition ${
                                isCompleted
                                  ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs'
                                  : 'bg-white text-emerald-700 border-emerald-200 hover:bg-emerald-50 disabled:opacity-40'
                              }`}
                            >
                              [✓] Completed
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Send to Admin Success Alert */}
                  {adminSendSuccess && (
                    <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl flex items-center justify-between animate-fadeIn">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span className="font-semibold">{adminSendSuccess}</span>
                      </div>
                      <button onClick={() => setAdminSendSuccess(null)} className="text-emerald-900 font-bold ml-2">
                        &times;
                      </button>
                    </div>
                  )}

                  {/* Work Notes / Daily Shift Reporting (Requirement 3, 4) */}
                  {canUpdateCurrentDept && (
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                      <div className="text-[11px] font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                        <FileText className="w-3.5 h-3.5 text-blue-600" />
                        <span>Daily Shift Work Details &amp; Supervisor Reporting</span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                        <div>
                          <label className="block font-bold text-slate-700 mb-1">Work Completed Today</label>
                          <textarea
                            rows={2}
                            placeholder="Components assembled, tests run, or machining steps completed..."
                            value={modalWorkDoneToday}
                            onChange={(e) => setModalWorkDoneToday(e.target.value)}
                            className="w-full p-2 bg-white border border-slate-200 rounded-lg text-xs font-medium focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                        <div>
                          <label className="block font-bold text-slate-700 mb-1">Remaining Work</label>
                          <textarea
                            rows={2}
                            placeholder="Remaining items for next shift or pending parts..."
                            value={modalRemainingWork}
                            onChange={(e) => setModalRemainingWork(e.target.value)}
                            className="w-full p-2 bg-white border border-slate-200 rounded-lg text-xs font-medium focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block font-bold text-slate-700 mb-1">Remarks / Shift Notes</label>
                        <input
                          type="text"
                          placeholder="General observations, tools used, or quality notices..."
                          value={modalRemarks}
                          onChange={(e) => setModalRemarks(e.target.value)}
                          className="w-full p-2 bg-white border border-slate-200 rounded-lg text-xs font-medium focus:ring-2 focus:ring-blue-500"
                        />
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200">
                        <span className="text-[11px] text-slate-500 font-medium">
                          Click below to commit your shift's progress and alert the central Admin dashboard.
                        </span>

                        <button
                          type="button"
                          onClick={handleSendProgressToAdmin}
                          disabled={sendingToAdmin}
                          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 transition shadow-xs disabled:opacity-50"
                          title="Save latest progress and immediately update Admin dashboard with notification"
                        >
                          {sendingToAdmin ? (
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Send className="w-3.5 h-3.5" />
                          )}
                          <span>SEND PROGRESS TO ADMIN</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>

              {/* COMPLETE MACHINE JOURNEY TIMELINE (Section 5 & 28) */}
              <div className="bg-white p-5 rounded-2xl border border-slate-200 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-black text-slate-900 uppercase tracking-wide">
                      Complete Machine Journey (20 Factory Stages)
                    </h3>
                    <p className="text-xs text-slate-500">
                      Sequential lifecycle pipeline from regular design to final packing and calibration
                    </p>
                  </div>
                  <div className="flex items-center space-x-3 text-[11px] font-semibold text-slate-500">
                    <span className="flex items-center space-x-1">
                      <span className="w-2 h-2 rounded-full bg-emerald-500" />
                      <span>✓ Completed</span>
                    </span>
                    <span className="flex items-center space-x-1">
                      <span className="w-2 h-2 rounded-full bg-blue-500" />
                      <span>● Current</span>
                    </span>
                    <span className="flex items-center space-x-1">
                      <span className="w-2 h-2 rounded-full bg-slate-300" />
                      <span>○ Pending</span>
                    </span>
                    <span className="flex items-center space-x-1">
                      <span className="w-2 h-2 rounded-full bg-red-500" />
                      <span>⚠ Delayed</span>
                    </span>
                  </div>
                </div>

                {/* Horizontal Scrollable Step Nodes */}
                <div className="overflow-x-auto pb-2 custom-scrollbar">
                  <div className="flex items-center min-w-max py-3 space-x-2">
                    {INITIAL_DEPARTMENTS.map((dept, idx) => {
                      const stage = machine.processStages?.[dept.code];
                      const isCurrent =
                        info.currentDepartment === dept.name ||
                        info.currentDepartment.includes(dept.code);
                      const isCompleted = stage?.status === 'Completed';
                      const isDelayed = stage?.status === 'Delayed';

                      let badgeBg = 'bg-slate-100 text-slate-500 border-slate-200';
                      if (isCompleted) badgeBg = 'bg-emerald-50 text-emerald-700 border-emerald-300';
                      else if (isCurrent) badgeBg = 'bg-blue-600 text-white border-blue-700 ring-2 ring-blue-300';
                      else if (isDelayed) badgeBg = 'bg-red-50 text-red-700 border-red-300';

                      return (
                        <React.Fragment key={dept.code}>
                          <div
                            onClick={() => handleOpenEditStage(dept.code, dept.name)}
                            className={`p-2.5 rounded-xl border text-xs cursor-pointer transition hover:shadow-xs flex flex-col justify-between w-36 shrink-0 ${badgeBg}`}
                            title="Click to view/update stage details"
                          >
                            <div className="flex items-center justify-between text-[10px]">
                              <span className="font-mono font-black">{dept.code}</span>
                              <span>
                                {isCompleted ? '✓' : isCurrent ? '●' : isDelayed ? '⚠' : '○'}
                              </span>
                            </div>
                            <div className="font-bold text-[11px] truncate mt-1">
                              {dept.name.replace(/^[0-9]+(-[A-Z])?\s*/, '')}
                            </div>
                            <div className="text-[10px] opacity-80 mt-1 flex items-center justify-between">
                              <span>{stage?.status || 'Pending'}</span>
                              <span>{stage?.progressPercent || 0}%</span>
                            </div>
                          </div>
                          {idx < INITIAL_DEPARTMENTS.length - 1 && (
                            <ArrowRight className="w-3.5 h-3.5 text-slate-300 shrink-0" />
                          )}
                        </React.Fragment>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* CURRENT ACTIVE WORK SUMMARY (Section 7) */}
              <div className="bg-white p-5 rounded-2xl border border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-black text-slate-900 uppercase tracking-wide">
                    Active Tasks on Machine ({info.activeWorkList.length})
                  </h3>
                  <button
                    onClick={() => setActiveTab('work')}
                    className="text-xs font-bold text-blue-600 hover:text-blue-700"
                  >
                    View All Tasks &rarr;
                  </button>
                </div>

                {info.activeWorkList.length === 0 ? (
                  <div className="p-6 text-center text-xs text-slate-400">
                    No active tasks currently assigned to this machine.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {info.activeWorkList.map((w) => (
                      <div
                        key={w.id}
                        className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/60 text-xs space-y-1.5"
                      >
                        <div className="flex items-start justify-between">
                          <span className="font-bold text-slate-900">{w.title}</span>
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded ${
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
                        <div className="text-slate-500 text-[11px]">
                          Dept: <strong>{w.department}</strong> &bull; Assigned: <strong>{w.assignedTo || 'Unassigned'}</strong>
                        </div>
                        <div className="text-[11px] text-slate-500 flex items-center justify-between pt-1 border-t border-slate-200/60">
                          <span>Due: {w.dueDate || 'No due date'}</span>
                          {w.delayReason && <span className="text-red-600 font-semibold">{w.delayReason}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            );
          })()}

          {/* TAB 2: DEPARTMENT PROGRESS (Full 20-Stage Matrix) */}
          {activeTab === 'progress' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-black text-slate-900">
                    20-Stage Factory Process Matrix
                  </h3>
                  <p className="text-xs text-slate-500">
                    Track status, target dates, progress percentage, and delay per factory department
                  </p>
                </div>
                <div className="text-xs font-mono font-bold text-slate-600">
                  Completed: {machine.completedProcessesCount || 0} / {machine.applicableProcessesCount || 20}
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-100/80 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[10px]">
                      <tr>
                        <th className="p-3">Dept Code</th>
                        <th className="p-3">Department Name</th>
                        <th className="p-3">Status</th>
                        <th className="p-3">Progress</th>
                        <th className="p-3">Target Date</th>
                        <th className="p-3">Actual Date</th>
                        <th className="p-3">Delay</th>
                        <th className="p-3">Remarks</th>
                        <th className="p-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {INITIAL_DEPARTMENTS.map((dept) => {
                        const stage = machine.processStages?.[dept.code];
                        const isCurrent =
                          info.currentDepartment === dept.name ||
                          info.currentDepartment.includes(dept.code);

                        return (
                          <tr
                            key={dept.code}
                            className={`hover:bg-slate-50 transition ${
                              isCurrent ? 'bg-blue-50/40 font-semibold' : ''
                            }`}
                          >
                            <td className="p-3 font-mono font-bold text-slate-700">
                              {dept.code}
                            </td>
                            <td className="p-3 text-slate-900 flex items-center space-x-1.5">
                              <span>{dept.name}</span>
                              {isCurrent && (
                                <span className="bg-blue-600 text-white text-[9px] font-bold px-1.5 py-0.2 rounded-full">
                                  Current
                                </span>
                              )}
                            </td>
                            <td className="p-3">
                              <span
                                className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                                  stage?.status === 'Completed'
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : stage?.status === 'In Progress'
                                    ? 'bg-blue-100 text-blue-800'
                                    : stage?.status === 'Delayed'
                                    ? 'bg-red-100 text-red-800'
                                    : stage?.status === 'N/A'
                                    ? 'bg-slate-100 text-slate-500'
                                    : 'bg-slate-100 text-slate-700'
                                }`}
                              >
                                {stage?.status || 'Not Started'}
                              </span>
                            </td>
                            <td className="p-3 font-mono">
                              {stage?.progressPercent || 0}%
                            </td>
                            <td className="p-3 text-slate-600">
                              {stage?.targetDate || '-'}
                            </td>
                            <td className="p-3 text-slate-600">
                              {stage?.actualDate || '-'}
                            </td>
                            <td className="p-3 text-red-600 font-semibold">
                              {stage?.delayDays ? `${stage.delayDays}d` : '-'}
                            </td>
                            <td className="p-3 text-slate-500 max-w-xs truncate">
                              {stage?.remarks || '-'}
                            </td>
                            <td className="p-3 text-right">
                              <button
                                onClick={() => handleOpenEditStage(dept.code, dept.name)}
                                className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[11px] transition inline-flex items-center space-x-1"
                              >
                                <Edit3 className="w-3 h-3" />
                                <span>Update</span>
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: CURRENT WORK (Section 7) */}
          {activeTab === 'work' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-black text-slate-900">
                    Machine Tasks &amp; Department Work
                  </h3>
                  <p className="text-xs text-slate-500">
                    All tasks assigned across factory departments, sorted active work first
                  </p>
                </div>
              </div>

              {info.allWorkList.length === 0 ? (
                <div className="p-12 text-center text-xs text-slate-400 bg-slate-50 rounded-2xl border border-slate-200">
                  No work assigned to this machine yet. Real tasks will appear when planned or dispatched.
                </div>
              ) : (
                <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-100/80 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[10px]">
                      <tr>
                        <th className="p-3">Task / Operation</th>
                        <th className="p-3">Department</th>
                        <th className="p-3">Employee</th>
                        <th className="p-3">Target</th>
                        <th className="p-3">Actual</th>
                        <th className="p-3">Progress</th>
                        <th className="p-3">Start Date</th>
                        <th className="p-3">Due Date</th>
                        <th className="p-3">Status</th>
                        <th className="p-3">Delay Reason</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {info.allWorkList.map((w) => (
                        <tr key={w.id} className="hover:bg-slate-50 transition">
                          <td className="p-3 font-semibold text-slate-900">{w.title}</td>
                          <td className="p-3 text-slate-700">{w.department}</td>
                          <td className="p-3 text-slate-700">{w.assignedTo || 'Unassigned'}</td>
                          <td className="p-3 font-mono">{w.plannedQuantity ?? 1}</td>
                          <td className="p-3 font-mono">{w.actualQuantity ?? 0}</td>
                          <td className="p-3 font-mono">
                            {w.status === 'Completed' ? '100%' : w.status === 'In Progress' ? '50%' : '0%'}
                          </td>
                          <td className="p-3 text-slate-600">{w.createdAt?.split('T')[0]}</td>
                          <td className="p-3 text-slate-600">{w.dueDate || '-'}</td>
                          <td className="p-3">
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                                w.status === 'Completed'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : w.status === 'In Progress'
                                  ? 'bg-blue-100 text-blue-800'
                                  : w.status === 'Delayed'
                                  ? 'bg-red-100 text-red-800'
                                  : 'bg-slate-100 text-slate-700'
                              }`}
                            >
                              {w.status}
                            </span>
                          </td>
                          <td className="p-3 text-red-600 font-semibold">{w.delayReason || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB: PLANNING */}
          {activeTab === 'planning' && (
            <div className="space-y-4">
              <h3 className="text-sm font-black text-slate-900">
                Machine Planning Targets
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-white p-4 rounded-2xl border border-slate-200 space-y-2">
                  <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Monthly Plans for this Machine/Model ({machineMonthlyPlans.length})
                  </h4>
                  {machineMonthlyPlans.length === 0 ? (
                    <div className="text-xs text-slate-400 py-4 text-center">
                      No monthly plans allocated yet.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {machineMonthlyPlans.map((p) => (
                        <div key={p.id} className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs">
                          <div className="font-bold text-slate-900">{p.month} {p.year} &bull; {p.department}</div>
                          <div className="text-slate-500 text-[11px] mt-0.5">
                            Target Qty: {p.plannedQuantity} | Actual Qty: {p.actualQuantity || 0}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="bg-white p-4 rounded-2xl border border-slate-200 space-y-2">
                  <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Weekly Plans for this Machine/Model ({machineWeeklyPlans.length})
                  </h4>
                  {machineWeeklyPlans.length === 0 ? (
                    <div className="text-xs text-slate-400 py-4 text-center">
                      No weekly plans allocated yet.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {machineWeeklyPlans.map((p) => (
                        <div key={p.id} className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs">
                          <div className="font-bold text-slate-900">{p.department} &bull; Week {p.weekStartDate}</div>
                          <div className="text-slate-500 text-[11px] mt-0.5">
                            Target Qty: {p.plannedQuantity} | Actual Qty: {p.actualQuantity || 0}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB: MONTHLY PLAN (Detailed) */}
          {activeTab === 'monthly_plan' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-black text-slate-900">
                    Monthly Commitments for Machine {machine.machineNumber}
                  </h3>
                  <p className="text-xs text-slate-500">
                    Target allocations and actual output registered in the monthly master plan
                  </p>
                </div>
                <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                  {machineMonthlyPlans.length} records
                </span>
              </div>

              {machineMonthlyPlans.length === 0 ? (
                <div className="p-12 text-center text-xs text-slate-400 bg-slate-50 rounded-2xl border border-slate-200">
                  No monthly plan items assigned to this machine or model ({machine.model}).
                </div>
              ) : (
                <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[10px]">
                        <tr>
                          <th className="p-3">Period</th>
                          <th className="p-3">Department</th>
                          <th className="p-3">Task / Operation</th>
                          <th className="p-3 text-right">Target Qty</th>
                          <th className="p-3 text-right">Actual Qty</th>
                          <th className="p-3 text-center">Status</th>
                          <th className="p-3">Responsible</th>
                          <th className="p-3">Remarks</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {machineMonthlyPlans.map((p) => {
                          const pct = p.plannedQuantity > 0 ? Math.round(((p.actualQuantity || 0) / p.plannedQuantity) * 100) : 0;
                          return (
                            <tr key={p.id} className="hover:bg-slate-50/80 transition">
                              <td className="p-3 font-mono font-bold text-slate-900">
                                {p.month} {p.year}
                              </td>
                              <td className="p-3 text-slate-700">{p.department}</td>
                              <td className="p-3 font-medium text-slate-900">{p.task || p.operationWork || '-'}</td>
                              <td className="p-3 text-right font-mono font-bold text-blue-700">
                                {p.plannedQuantity}
                              </td>
                              <td className="p-3 text-right font-mono font-bold text-emerald-600">
                                {p.actualQuantity || 0}
                              </td>
                              <td className="p-3 text-center">
                                <span
                                  className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                                    p.status === 'Completed'
                                      ? 'bg-emerald-100 text-emerald-800'
                                      : p.status === 'In Progress'
                                      ? 'bg-blue-100 text-blue-800'
                                      : 'bg-amber-100 text-amber-800'
                                  }`}
                                >
                                  {p.status || 'Planned'}
                                </span>
                              </td>
                              <td className="p-3 text-slate-600">{p.responsibleEmployee || '-'}</td>
                              <td className="p-3 text-slate-500 text-[11px] max-w-xs truncate">{p.remarks || '-'}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB: WEEKLY PLAN (Detailed) */}
          {activeTab === 'weekly_plan' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-black text-slate-900">
                    Weekly Execution Schedules for Machine {machine.machineNumber}
                  </h3>
                  <p className="text-xs text-slate-500">
                    Granular weekly operational tasks and progress tracking
                  </p>
                </div>
                <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                  {machineWeeklyPlans.length} records
                </span>
              </div>

              {machineWeeklyPlans.length === 0 ? (
                <div className="p-12 text-center text-xs text-slate-400 bg-slate-50 rounded-2xl border border-slate-200">
                  No weekly plan items assigned to this machine or model ({machine.model}).
                </div>
              ) : (
                <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[10px]">
                        <tr>
                          <th className="p-3">Week</th>
                          <th className="p-3">Department</th>
                          <th className="p-3">Task / Operation</th>
                          <th className="p-3 text-right">Target Qty</th>
                          <th className="p-3 text-right">Actual Qty</th>
                          <th className="p-3 text-center">Status</th>
                          <th className="p-3">Delay Reason</th>
                          <th className="p-3">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {machineWeeklyPlans.map((w) => (
                          <tr key={w.id} className="hover:bg-slate-50/80 transition">
                            <td className="p-3 font-mono font-bold text-slate-900">
                              W{w.weekNumber} ({w.weekStartDate})
                            </td>
                            <td className="p-3 text-slate-700">{w.department}</td>
                            <td className="p-3 font-medium text-slate-900">{w.task || w.operationWork || '-'}</td>
                            <td className="p-3 text-right font-mono font-bold text-blue-700">
                              {w.plannedQuantity}
                            </td>
                            <td className="p-3 text-right font-mono font-bold text-emerald-600">
                              {w.actualQuantity || 0}
                            </td>
                            <td className="p-3 text-center">
                              <span
                                className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                                  w.status === 'Completed'
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : w.status === 'Delayed'
                                    ? 'bg-red-100 text-red-800'
                                    : w.status === 'In Progress'
                                    ? 'bg-blue-100 text-blue-800'
                                    : 'bg-slate-100 text-slate-700'
                                }`}
                              >
                                {w.status || 'Pending'}
                              </span>
                            </td>
                            <td className="p-3 text-red-600 font-semibold">{w.delayReason || '-'}</td>
                            <td className="p-3 text-slate-600 text-[11px] max-w-xs truncate">
                              {w.correctiveAction || w.remarks || '-'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 5: QUALITY (Section 22 & 23) */}
          {activeTab === 'quality' && (
            <div className="space-y-5">
              {/* Quality & Admin Decision Controls */}
              {hasQualityInspectionAccess(userProfile) && (
                <div className="p-4 bg-indigo-50/70 border border-indigo-200 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h4 className="text-xs font-bold text-indigo-950 flex items-center gap-1.5">
                      <ShieldCheck className="w-4 h-4 text-indigo-600" />
                      <span>Quality Inspection Decision &amp; Sign-off</span>
                    </h4>
                    <p className="text-[11px] text-indigo-700 mt-0.5">
                      Authorize quality acceptance, log critical rejection, or place Machine #{machine.machineNumber} on hold.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        setQcModalAction('Accept');
                        setShowQcModal(true);
                      }}
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs transition flex items-center gap-1"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>Accept Machine</span>
                    </button>
                    <button
                      onClick={() => {
                        setQcModalAction('Hold');
                        setShowQcModal(true);
                      }}
                      className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-bold shadow-xs transition flex items-center gap-1"
                    >
                      <PauseCircle className="w-3.5 h-3.5" />
                      <span>Hold Machine</span>
                    </button>
                    <button
                      onClick={() => {
                        setQcModalAction('Reject');
                        setShowQcModal(true);
                      }}
                      className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold shadow-xs transition flex items-center gap-1"
                    >
                      <AlertTriangle className="w-3.5 h-3.5" />
                      <span>Reject Machine</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Quality KPI Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 text-xs">
                <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs">
                  <span className="text-[10px] font-bold text-slate-400 uppercase block">Operations</span>
                  <span className="font-black text-slate-900 text-lg">{info.qualitySummary.totalOps}</span>
                </div>
                <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs">
                  <span className="text-[10px] font-bold text-slate-400 uppercase block">Completed</span>
                  <span className="font-black text-emerald-600 text-lg">{info.qualitySummary.completedOps}</span>
                </div>
                <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs">
                  <span className="text-[10px] font-bold text-slate-400 uppercase block">Remaining</span>
                  <span className="font-black text-slate-700 text-lg">{info.qualitySummary.remainingOps}</span>
                </div>
                <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs">
                  <span className="text-[10px] font-bold text-slate-400 uppercase block">Accepted</span>
                  <span className="font-black text-emerald-600 text-lg">{info.qualitySummary.acceptedCount}</span>
                </div>
                <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs">
                  <span className="text-[10px] font-bold text-slate-400 uppercase block">Rejected</span>
                  <span className="font-black text-red-600 text-lg">{info.qualitySummary.rejectedCount}</span>
                </div>
                <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs">
                  <span className="text-[10px] font-bold text-slate-400 uppercase block">Hold</span>
                  <span className="font-black text-amber-600 text-lg">{info.qualitySummary.holdCount}</span>
                </div>
                <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs">
                  <span className="text-[10px] font-bold text-slate-400 uppercase block">Progress</span>
                  <span className="font-black text-blue-600 text-lg">{info.qualitySummary.inspectionProgressPct}%</span>
                </div>
              </div>

              {/* Quality Inspection History Table (Section 23) */}
              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
                <div className="p-3.5 bg-slate-50 border-b border-slate-200 font-bold text-xs text-slate-700">
                  Daily Quality Inspection Records ({info.qualityChecks.length})
                </div>
                {info.qualityChecks.length === 0 ? (
                  <div className="p-8 text-center text-xs text-slate-400">
                    No quality inspection checks recorded for this machine yet.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-100 text-slate-600 font-bold uppercase text-[10px]">
                        <tr>
                          <th className="p-3">Inspection Date</th>
                          <th className="p-3">Operation</th>
                          <th className="p-3">Category</th>
                          <th className="p-3">Result</th>
                          <th className="p-3">Inspector</th>
                          <th className="p-3">Remarks</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {info.qualityChecks.map((c) => (
                          <tr key={c.id} className="hover:bg-slate-50 transition">
                            <td className="p-3 font-mono">{c.date}</td>
                            <td className="p-3 font-semibold text-slate-900">{c.operationName}</td>
                            <td className="p-3 text-slate-600">{c.category}</td>
                            <td className="p-3">
                              <span
                                className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                                  c.status === 'Accept'
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : c.status === 'Reject'
                                    ? 'bg-red-100 text-red-800'
                                    : 'bg-amber-100 text-amber-800'
                                }`}
                              >
                                {c.status}
                              </span>
                            </td>
                            <td className="p-3 text-slate-700">{c.userEmail}</td>
                            <td className="p-3 text-slate-500">{c.remarks || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Quality Rejections & Corrective Actions */}
              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
                <div className="p-3.5 bg-red-50 border-b border-red-200 font-bold text-xs text-red-800">
                  Quality Rejections &amp; Corrective Action History ({info.qualityRejections.length})
                </div>
                {info.qualityRejections.length === 0 ? (
                  <div className="p-6 text-center text-xs text-slate-400">
                    No quality rejections logged on this machine.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-100 text-slate-600 font-bold uppercase text-[10px]">
                        <tr>
                          <th className="p-3">Date</th>
                          <th className="p-3">Operation</th>
                          <th className="p-3">Reason</th>
                          <th className="p-3">Concerned Dept</th>
                          <th className="p-3">Corrective Action</th>
                          <th className="p-3">Re-inspection</th>
                          <th className="p-3">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {info.qualityRejections.map((r) => (
                          <tr key={r.id} className="hover:bg-slate-50 transition">
                            <td className="p-3 font-mono">{r.createdAt?.split('T')[0]}</td>
                            <td className="p-3 font-semibold text-slate-900">{r.operationName}</td>
                            <td className="p-3 text-red-700 font-semibold">{r.rejectionReason}</td>
                            <td className="p-3 text-slate-700">{r.concernedDepartment}</td>
                            <td className="p-3 text-slate-600">{r.correctiveAction || 'Pending submission'}</td>
                            <td className="p-3 text-slate-600">{r.reinspectionResult || 'Pending inspection'}</td>
                            <td className="p-3">
                              <span
                                className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                                  r.status === 'Accepted'
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : 'bg-red-100 text-red-800'
                                }`}
                              >
                                {r.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 6: HANDOVER (Section 24) */}
          {activeTab === 'handover' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-black text-slate-900">
                    Shop Floor Handover History
                  </h3>
                  <p className="text-xs text-slate-500">
                    Inter-departmental physical machine transfer chain and approvals
                  </p>
                </div>
              </div>

              {info.handoverHistory.length === 0 ? (
                <div className="p-12 text-center text-xs text-slate-400 bg-slate-50 rounded-2xl border border-slate-200">
                  No handovers recorded for this machine yet.
                </div>
              ) : (
                <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-100/80 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[10px]">
                      <tr>
                        <th className="p-3">Date</th>
                        <th className="p-3">From Department</th>
                        <th className="p-3">To Department</th>
                        <th className="p-3">Work Description</th>
                        <th className="p-3">Status</th>
                        <th className="p-3">Accepted By</th>
                        <th className="p-3">Accepted Date</th>
                        <th className="p-3">Remarks</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {info.handoverHistory.map((h) => (
                        <tr key={h.id} className="hover:bg-slate-50 transition">
                          <td className="p-3 font-mono">{h.date}</td>
                          <td className="p-3 font-semibold text-slate-900">{h.sendingDepartment}</td>
                          <td className="p-3 font-semibold text-indigo-700">{h.receivingDepartment}</td>
                          <td className="p-3 text-slate-700">{h.workDescription}</td>
                          <td className="p-3">
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                                h.status === 'Accepted'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : h.status === 'Pending Acceptance'
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-red-100 text-red-800'
                              }`}
                            >
                              {h.status}
                            </span>
                          </td>
                          <td className="p-3 text-slate-700">{h.acceptedBy || '-'}</td>
                          <td className="p-3 text-slate-600">{h.acceptedDate || '-'}</td>
                          <td className="p-3 text-slate-500">{h.remarks || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB 7: DOCUMENTS */}
          {activeTab === 'documents' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-black text-slate-900">
                    Machine Engineering &amp; Quality Documents
                  </h3>
                  <p className="text-xs text-slate-500">
                    Drawings, quality reports, inspection files, and photos
                  </p>
                </div>
                <button
                  onClick={() => setShowUploadDoc(true)}
                  className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs transition shadow-xs"
                >
                  + Upload Document
                </button>
              </div>

              {docsForMachine.length === 0 ? (
                <div className="p-12 text-center text-xs text-slate-400 bg-slate-50 rounded-2xl border border-slate-200">
                  No documents uploaded for this machine yet.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {docsForMachine.map((doc) => (
                    <div
                      key={doc.id}
                      className="p-3.5 rounded-2xl border border-slate-200 bg-white hover:border-blue-400 transition shadow-xs text-xs space-y-2"
                    >
                      <div className="flex items-start justify-between">
                        <span className="font-bold text-slate-900 truncate block max-w-[200px]" title={doc.title}>
                          {doc.title}
                        </span>
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                          {doc.version || 'v1.0'}
                        </span>
                      </div>
                      <div className="text-[11px] text-blue-600 font-semibold">{doc.category}</div>
                      <div className="text-[10px] text-slate-400">
                        Uploaded by {doc.uploadedBy} on {doc.uploadedAt?.split('T')[0]}
                      </div>
                      {doc.fileData && (
                        <a
                          href={doc.fileData}
                          download={doc.fileName}
                          className="inline-block text-[11px] font-bold text-blue-600 hover:underline mt-1"
                        >
                          Download {doc.fileName} &darr;
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 8: HISTORY (Section 8) */}
          {activeTab === 'history' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-black text-slate-900">
                    Complete Machine Work &amp; Stage History
                  </h3>
                  <p className="text-xs text-slate-500">
                    Chronological journey across factory departments without losing previous records
                  </p>
                </div>
              </div>

              {info.workHistory.length === 0 ? (
                <div className="p-12 text-center text-xs text-slate-400 bg-slate-50 rounded-2xl border border-slate-200">
                  No history records logged for this machine yet.
                </div>
              ) : (
                <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-100/80 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[10px]">
                      <tr>
                        <th className="p-3">Date</th>
                        <th className="p-3">Department</th>
                        <th className="p-3">Task / Operation</th>
                        <th className="p-3">Employee</th>
                        <th className="p-3">Start Date</th>
                        <th className="p-3">Completion Date</th>
                        <th className="p-3">Duration</th>
                        <th className="p-3">Handed Over To</th>
                        <th className="p-3">Progress</th>
                        <th className="p-3">Status</th>
                        <th className="p-3">Remarks</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {info.workHistory.map((h) => (
                        <tr key={h.id} className="hover:bg-slate-50 transition">
                          <td className="p-3 font-mono">{h.date}</td>
                          <td className="p-3 font-bold text-slate-900">{h.department}</td>
                          <td className="p-3 font-semibold text-slate-800">{h.task}</td>
                          <td className="p-3 text-slate-700">{h.employee || '-'}</td>
                          <td className="p-3 text-slate-600">{h.startDate || '-'}</td>
                          <td className="p-3 text-slate-600">{h.completionDate || '-'}</td>
                          <td className="p-3 font-mono text-slate-700">{h.duration || '-'}</td>
                          <td className="p-3 font-bold text-purple-700">{h.handedOverTo || '-'}</td>
                          <td className="p-3 font-mono">{h.progress ?? 0}%</td>
                          <td className="p-3">
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                                h.status === 'Completed' || h.status === 'Accepted'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : h.status === 'In Progress'
                                  ? 'bg-blue-100 text-blue-800'
                                  : h.status === 'Delayed'
                                  ? 'bg-red-100 text-red-800'
                                  : 'bg-slate-100 text-slate-700'
                              }`}
                            >
                              {h.status || 'Done'}
                            </span>
                          </td>
                          <td className="p-3 text-slate-500 max-w-xs truncate">{h.remarks || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs shrink-0">
          <span className="text-slate-500">
            Last Updated: <strong className="text-slate-800">{new Date(info.lastUpdate).toLocaleString()}</strong>
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold transition"
          >
            Close Details
          </button>
        </div>
      </div>

      {/* Edit Process Stage Modal */}
      {editingStage && (
        <div className="fixed inset-0 z-60 bg-slate-950/70 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 text-xs">
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-sm text-slate-900">
                Update Stage: {editingStage.departmentName}
              </h4>
              <button
                onClick={() => setEditingStage(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveStage} className="space-y-3">
              <div>
                <label className="font-bold text-slate-700 block mb-1">Status</label>
                <select
                  value={editingStage.status}
                  onChange={(e) =>
                    setEditingStage({
                      ...editingStage,
                      status: e.target.value as ProcessStageStatus,
                      progressPercent: e.target.value === 'Completed' ? 100 : editingStage.progressPercent,
                    })
                  }
                  className="w-full p-2 border border-slate-300 rounded-lg outline-none font-bold"
                >
                  <option value="Not Started">Not Started</option>
                  <option value="In Progress">In Progress</option>
                  <option value="Completed">Completed</option>
                  <option value="Delayed">Delayed</option>
                  <option value="On Hold">On Hold</option>
                  <option value="N/A">N/A (Not Applicable)</option>
                </select>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Progress % ({editingStage.progressPercent}%)</label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="5"
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

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Target Date</label>
                  <input
                    type="date"
                    value={editingStage.targetDate}
                    onChange={(e) =>
                      setEditingStage({ ...editingStage, targetDate: e.target.value })
                    }
                    className="w-full p-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Actual Date</label>
                  <input
                    type="date"
                    value={editingStage.actualDate}
                    onChange={(e) =>
                      setEditingStage({ ...editingStage, actualDate: e.target.value })
                    }
                    className="w-full p-2 border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Delay (Days)</label>
                <input
                  type="number"
                  min="0"
                  value={editingStage.delayDays}
                  onChange={(e) =>
                    setEditingStage({ ...editingStage, delayDays: Number(e.target.value) })
                  }
                  className="w-full p-2 border border-slate-300 rounded-lg"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Remarks</label>
                <textarea
                  value={editingStage.remarks}
                  onChange={(e) =>
                    setEditingStage({ ...editingStage, remarks: e.target.value })
                  }
                  rows={2}
                  className="w-full p-2 border border-slate-300 rounded-lg"
                  placeholder="Stage observations or remarks..."
                />
              </div>

              <div className="flex items-center justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingStage(null)}
                  className="px-3 py-1.5 rounded-lg text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingStage}
                  className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold disabled:opacity-50"
                >
                  {savingStage ? 'Saving...' : 'Save Stage'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Upload Document Modal */}
      {showUploadDoc && (
        <div className="fixed inset-0 z-60 bg-slate-950/70 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 text-xs">
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-sm text-slate-900">
                Upload Document for Machine {machine.machineNumber}
              </h4>
              <button
                onClick={() => setShowUploadDoc(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleUploadDoc} className="space-y-3">
              <div>
                <label className="font-bold text-slate-700 block mb-1">Category</label>
                <select
                  value={docCategory}
                  onChange={(e) => setDocCategory(e.target.value as DocumentCategory)}
                  className="w-full p-2 border border-slate-300 rounded-lg"
                >
                  <option value="Machine Drawing">Machine Drawing</option>
                  <option value="Balloon Drawing">Balloon Drawing</option>
                  <option value="Inspection Drawing">Inspection Drawing</option>
                  <option value="Quality Documents">Quality Documents</option>
                  <option value="Inspection Reports">Inspection Reports</option>
                  <option value="Photos">Photos</option>
                  <option value="Other Documents">Other Documents</option>
                </select>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Document Title</label>
                <input
                  type="text"
                  required
                  value={docTitle}
                  onChange={(e) => setDocTitle(e.target.value)}
                  placeholder="e.g. Approved Assembly Drawing"
                  className="w-full p-2 border border-slate-300 rounded-lg"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Version</label>
                <input
                  type="text"
                  value={docVersion}
                  onChange={(e) => setDocVersion(e.target.value)}
                  placeholder="v1.0"
                  className="w-full p-2 border border-slate-300 rounded-lg"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Select File</label>
                <input
                  type="file"
                  required
                  onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                  className="w-full text-xs"
                />
              </div>

              <div className="flex items-center justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowUploadDoc(false)}
                  className="px-3 py-1.5 rounded-lg text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={uploadingDoc}
                  className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold disabled:opacity-50"
                >
                  {uploadingDoc ? 'Uploading...' : 'Upload'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Quality Inspection Decision Modal - Restricted to Quality & Admin */}
      {showQcModal && hasQualityInspectionAccess(userProfile) && (
        <QualityInspectionDecisionModal
          isOpen={showQcModal}
          onClose={() => setShowQcModal(false)}
          machine={machine}
          initialAction={qcModalAction}
        />
      )}
    </div>
  );
};
