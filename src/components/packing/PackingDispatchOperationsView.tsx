import React, { useState, useEffect, useMemo } from 'react';
import {
  Cable,
  Package,
  Box,
  Truck,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Search,
  Filter,
  ArrowRight,
  History,
  FileText,
  FileCheck,
  Building,
  User,
  Calendar,
  Layers,
  Sparkles,
  Info,
  ShieldCheck,
  ChevronRight,
  X,
  UploadCloud,
  TrendingUp,
  RotateCcw,
  Check,
  Eye,
  PlusCircle,
  Hash,
} from 'lucide-react';
import {
  PackingMachineOperation,
  PackingOperationStage,
  PackingOperationStatus,
  DepartmentHandover,
  Machine,
  UserProfile,
} from '../../types';
import {
  subscribePackingOperations,
  savePackingOperationProgress,
  completeAndAdvanceOperation,
  initializePackingOperationFromHandover,
  initializePackingOperationFromMachine,
  seedInitialPackingOperations,
  PACKING_STAGES_SEQUENCE,
} from '../../services/packingOperationsService';

interface PackingDispatchOperationsViewProps {
  userProfile?: UserProfile | null;
  departmentName?: string;
  isAdmin?: boolean;
  machines?: Machine[];
  handovers?: DepartmentHandover[];
}

export const PackingDispatchOperationsView: React.FC<PackingDispatchOperationsViewProps> = ({
  userProfile,
  departmentName = '15 Packing & Dispatch',
  isAdmin = false,
  machines = [],
  handovers = [],
}) => {
  const [operations, setOperations] = useState<PackingMachineOperation[]>([]);
  const [selectedBox, setSelectedBox] = useState<PackingOperationStage | 'ALL'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'IN_PROGRESS' | 'READY_FOR_NEXT' | 'DISPATCHED'>('ALL');
  const [invoicingSubTab, setInvoicingSubTab] = useState<'INVOICING' | 'DISPATCHED'>('INVOICING');

  // Modal States
  const [activeModalMachine, setActiveModalMachine] = useState<PackingMachineOperation | null>(null);
  const [historyModalMachine, setHistoryModalMachine] = useState<PackingMachineOperation | null>(null);
  const [isIncomingModalOpen, setIsIncomingModalOpen] = useState(false);

  // Form States for Update
  const [editProgressPercent, setEditProgressPercent] = useState<number>(0);
  const [editEmployee, setEditEmployee] = useState<string>('');
  const [editRemarks, setEditRemarks] = useState<string>('');
  const [editPendingWork, setEditPendingWork] = useState<string>('');
  const [editStartDate, setEditStartDate] = useState<string>('');
  const [editDocName, setEditDocName] = useState<string>('');

  // Invoicing Specific Form States
  const [invoiceNumber, setInvoiceNumber] = useState<string>('');
  const [invoiceDate, setInvoiceDate] = useState<string>('');
  const [invoiceAmount, setInvoiceAmount] = useState<string>('');
  const [invoiceStatus, setInvoiceStatus] = useState<string>('Approved');
  const [invoiceRemarks, setInvoiceRemarks] = useState<string>('');

  // Dispatch Specific Form States
  const [dispatchDate, setDispatchDate] = useState<string>('');
  const [deliveryRef, setDeliveryRef] = useState<string>('');
  const [transporterName, setTransporterName] = useState<string>('');
  const [lrNumber, setLrNumber] = useState<string>('');
  const [ewayBillNumber, setEwayBillNumber] = useState<string>('');
  const [dispatchRemarks, setDispatchRemarks] = useState<string>('');

  // Feedback Messages
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const currentUserEmail = userProfile?.email || 'atul.more@accurate.in';
  const currentUserName = userProfile?.displayName || userProfile?.employeeName || userProfile?.username || 'Atul More';

  // Subscribe to real-time operations data
  useEffect(() => {
    // Seed initial demo items if store is empty
    seedInitialPackingOperations(machines, handovers, currentUserEmail);

    const unsubscribe = subscribePackingOperations((items) => {
      setOperations(items);
    });

    return () => unsubscribe();
  }, [machines, handovers, currentUserEmail]);

  // Handle opening update modal
  const handleOpenUpdateModal = (op: PackingMachineOperation) => {
    setActiveModalMachine(op);
    setActionError(null);
    setActionSuccess(null);

    const currentStageRecord = op.stages[op.currentStage];
    setEditProgressPercent(op.currentProgressPercent || 0);
    setEditEmployee(currentStageRecord?.assignedEmployee || currentUserName);
    setEditRemarks(currentStageRecord?.remarks || '');
    setEditPendingWork(currentStageRecord?.pendingWork || '');
    setEditStartDate(currentStageRecord?.startDate || new Date().toISOString().split('T')[0]);
    setEditDocName(currentStageRecord?.documentName || '');

    // Invoicing prefill
    setInvoiceNumber(currentStageRecord?.invoiceNumber || `INV-2026-${op.machineNumber}`);
    setInvoiceDate(currentStageRecord?.invoiceDate || new Date().toISOString().split('T')[0]);
    setInvoiceAmount(currentStageRecord?.invoiceAmount ? String(currentStageRecord.invoiceAmount) : '3500000');
    setInvoiceStatus(currentStageRecord?.invoiceStatus || 'Approved');
    setInvoiceRemarks(currentStageRecord?.invoiceRemarks || '');

    // Dispatch prefill
    setDispatchDate(currentStageRecord?.dispatchDate || new Date().toISOString().split('T')[0]);
    setDeliveryRef(currentStageRecord?.deliveryReference || `DISP-REF-${op.machineNumber}-${Date.now().toString().slice(-4)}`);
    setTransporterName(currentStageRecord?.transporterName || 'V-Trans Logistics India');
    setLrNumber(currentStageRecord?.lrNumber || `LR-${Math.floor(100000 + Math.random() * 900000)}`);
    setEwayBillNumber(currentStageRecord?.ewayBillNumber || `EWAY-${Math.floor(100000000000 + Math.random() * 900000000000)}`);
    setDispatchRemarks(currentStageRecord?.dispatchRemarks || '');
  };

  // Action: Save Progress without advancing stage
  const handleSaveProgress = async () => {
    if (!activeModalMachine) return;
    setIsSubmitting(true);
    setActionError(null);
    setActionSuccess(null);

    try {
      await savePackingOperationProgress({
        operationId: activeModalMachine.id,
        progressPercent: Number(editProgressPercent),
        assignedEmployee: editEmployee,
        remarks: editRemarks,
        pendingWork: editPendingWork,
        documentName: editDocName,
        invoiceData:
          activeModalMachine.currentStage === 'Invoicing'
            ? {
                invoiceNumber,
                invoiceDate,
                invoiceAmount: invoiceAmount ? Number(invoiceAmount) : undefined,
                invoiceStatus,
                invoiceRemarks,
              }
            : undefined,
        dispatchData:
          activeModalMachine.currentStage === 'Dispatched'
            ? {
                dispatchDate,
                deliveryReference: deliveryRef,
                transporterName,
                lrNumber,
                ewayBillNumber,
                dispatchRemarks,
              }
            : undefined,
        userEmail: currentUserEmail,
      });

      setActionSuccess(`Progress successfully saved at ${editProgressPercent}%. Stage remains in ${activeModalMachine.currentStage}.`);
      setTimeout(() => {
        setActionSuccess(null);
      }, 3500);
    } catch (err: any) {
      setActionError(err.message || 'Failed to save progress.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Action: Complete Operation and Move to Next (100% compulsory)
  const handleCompleteAndAdvance = async () => {
    if (!activeModalMachine) return;
    setIsSubmitting(true);
    setActionError(null);
    setActionSuccess(null);

    // CRITICAL 100% CHECK
    if (editProgressPercent < 100 && activeModalMachine.currentProgressPercent < 100) {
      setActionError(
        `Validation Failed: Current operation is at ${editProgressPercent}%. ` +
        `A machine must achieve exactly 100% completion in ${activeModalMachine.currentStage} before moving to the next operation!`
      );
      setIsSubmitting(false);
      return;
    }

    try {
      // If user had moved slider to 100% but not saved yet, save it first
      if (editProgressPercent === 100 && activeModalMachine.currentProgressPercent !== 100) {
        await savePackingOperationProgress({
          operationId: activeModalMachine.id,
          progressPercent: 100,
          assignedEmployee: editEmployee,
          remarks: editRemarks,
          pendingWork: editPendingWork,
          userEmail: currentUserEmail,
        });
      }

      const updated = await completeAndAdvanceOperation({
        operationId: activeModalMachine.id,
        userEmail: currentUserEmail,
        employeeName: editEmployee,
        completionRemarks: editRemarks || `Completed 100% by ${editEmployee}`,
        invoiceData:
          activeModalMachine.currentStage === 'Invoicing'
            ? {
                invoiceNumber,
                invoiceDate,
                invoiceAmount: invoiceAmount ? Number(invoiceAmount) : undefined,
                invoiceStatus,
                invoiceRemarks,
                invoiceDocName: editDocName || 'Commercial_Invoice.pdf',
              }
            : undefined,
        dispatchData:
          activeModalMachine.currentStage === 'Dispatched'
            ? {
                dispatchDate,
                deliveryReference: deliveryRef,
                transporterName,
                lrNumber,
                ewayBillNumber,
                dispatchRemarks,
                dispatchDocName: editDocName || 'LR_Consignment_Note.pdf',
              }
            : undefined,
      });

      setActionSuccess(
        updated.isDispatched
          ? `Machine ${updated.machineNumber} successfully marked DISPATCHED and archived!`
          : `Stage Completed! Machine ${updated.machineNumber} moved to next operation: ${updated.currentStage}.`
      );

      setTimeout(() => {
        setActiveModalMachine(null);
        setActionSuccess(null);
      }, 1800);
    } catch (err: any) {
      setActionError(err.message || 'Failed to complete operation.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Action: Accept Incoming Handover into Packing
  const handleAcceptIncomingHandover = async (handover: DepartmentHandover) => {
    try {
      const newOp = await initializePackingOperationFromHandover(handover, currentUserEmail);
      setIsIncomingModalOpen(false);
      handleOpenUpdateModal(newOp);
    } catch (err) {
      console.error('Failed to accept handover into packing:', err);
    }
  };

  // Action: Direct Induct from Machine List
  const handleInductMachine = async (mach: Machine) => {
    try {
      const newOp = await initializePackingOperationFromMachine(
        mach,
        mach.previousDepartment || '14 Calibration',
        currentUserEmail
      );
      handleOpenUpdateModal(newOp);
    } catch (err) {
      console.error('Failed to induct machine into packing:', err);
    }
  };

  // =========================================================================
  // LIVE OPERATION COUNTS COMPUTATION
  // =========================================================================
  const openCableCount = useMemo(
    () => operations.filter((o) => !o.isDispatched && o.currentStage === 'Open Cable').length,
    [operations]
  );

  const packedCount = useMemo(
    () => operations.filter((o) => !o.isDispatched && o.currentStage === 'Packed').length,
    [operations]
  );

  const packedWithProbingCount = useMemo(
    () => operations.filter((o) => !o.isDispatched && o.currentStage === 'Packed with Probing').length,
    [operations]
  );

  const invoicingCount = useMemo(
    () => operations.filter((o) => !o.isDispatched && o.currentStage === 'Invoicing').length,
    [operations]
  );

  const dispatchedCount = useMemo(
    () => operations.filter((o) => o.isDispatched || o.currentStage === 'Dispatched').length,
    [operations]
  );

  const totalReceivedCount = operations.length;
  const inProgressActiveCount = operations.filter((o) => !o.isDispatched && o.currentProgressPercent < 100).length;
  const readyForNextCount = operations.filter((o) => !o.isDispatched && o.currentProgressPercent === 100).length;
  const completedDispatchedCount = operations.filter((o) => o.isDispatched).length;

  // Incoming Handovers from Calibration or other departments to Packing
  const incomingHandovers = useMemo(() => {
    return handovers.filter((h) => {
      const receiving = h.receivingDepartment || h.toDepartment || '';
      const isForPacking =
        receiving.includes('Packing') ||
        receiving.includes('Dispatch') ||
        receiving.startsWith('15');
      const notYetInOps = !operations.some((op) => op.machineNumber === h.machineNumber);
      return isForPacking && notYetInOps;
    });
  }, [handovers, operations]);

  // Filtered Machines List for Display
  const filteredOperations = useMemo(() => {
    return operations.filter((op) => {
      // 1. Box Filter
      if (selectedBox === 'Open Cable' && (op.isDispatched || op.currentStage !== 'Open Cable')) return false;
      if (selectedBox === 'Packed' && (op.isDispatched || op.currentStage !== 'Packed')) return false;
      if (selectedBox === 'Packed with Probing' && (op.isDispatched || op.currentStage !== 'Packed with Probing')) return false;
      if (selectedBox === 'Invoicing') {
        if (invoicingSubTab === 'INVOICING' && (op.isDispatched || op.currentStage !== 'Invoicing')) return false;
        if (invoicingSubTab === 'DISPATCHED' && (!op.isDispatched && op.currentStage !== 'Dispatched')) return false;
      }

      // 2. Status Filter
      if (statusFilter === 'IN_PROGRESS' && (op.isDispatched || op.currentProgressPercent === 100)) return false;
      if (statusFilter === 'READY_FOR_NEXT' && (op.isDispatched || op.currentProgressPercent !== 100)) return false;
      if (statusFilter === 'DISPATCHED' && !op.isDispatched) return false;

      // 3. Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const machMatch = op.machineNumber.toLowerCase().includes(q);
        const sizeMatch = (op.machineSize || '').toLowerCase().includes(q);
        const modelMatch = (op.model || '').toLowerCase().includes(q);
        const custMatch = (op.customer || '').toLowerCase().includes(q);
        const opStageMatch = op.currentStage.toLowerCase().includes(q);
        if (!machMatch && !sizeMatch && !modelMatch && !custMatch && !opStageMatch) return false;
      }

      return true;
    });
  }, [operations, selectedBox, invoicingSubTab, statusFilter, searchQuery]);

  return (
    <div className="space-y-6">
      {/* =========================================================================
          MODULE HEADER & CONTEXT BAR
          ========================================================================= */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 rounded-3xl p-6 text-white shadow-xl border border-indigo-900/40 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="px-2.5 py-1 rounded-lg bg-indigo-500/20 text-indigo-300 text-xs font-black tracking-wider uppercase border border-indigo-500/30">
                Department 15
              </span>
              <span className="px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 text-xs font-bold border border-emerald-500/30 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                Live Shop Floor Module
              </span>
              {isAdmin && (
                <span className="px-2.5 py-1 rounded-lg bg-amber-500/20 text-amber-300 text-xs font-bold border border-amber-500/30">
                  Admin Inspection Mode
                </span>
              )}
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white flex items-center gap-3">
              <Truck className="w-8 h-8 text-indigo-400" />
              Packing &amp; Dispatch Operations
            </h1>
            <p className="text-slate-300 text-xs sm:text-sm mt-1 max-w-2xl">
              Strict 100% sequential operation workflow: Open Cable &rarr; Packed &rarr; Packed with Probing &rarr; Invoicing &rarr; Dispatched.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Incoming Handover Queue Button */}
            <button
              onClick={() => setIsIncomingModalOpen(true)}
              className="relative px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs transition shadow-lg flex items-center gap-2 cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Incoming Machines</span>
              {incomingHandovers.length > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-red-600 text-white font-mono text-[10px] font-black">
                  {incomingHandovers.length} new
                </span>
              )}
            </button>

            {/* Induct Machine Quick Button */}
            <div className="px-3.5 py-2 rounded-xl bg-slate-800/80 border border-slate-700/80 text-xs text-slate-300 flex items-center gap-2">
              <User className="w-4 h-4 text-indigo-400" />
              <div>
                <div className="text-[10px] text-slate-400">Operator</div>
                <div className="font-bold text-white text-xs">{currentUserName}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Live Status Indicator Bar */}
        <div className="mt-5 pt-4 border-t border-slate-800/80 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-400" />
            <span className="text-slate-300">Total Received:</span>
            <span className="font-mono font-bold text-white">{totalReceivedCount}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
            <span className="text-slate-300">Active In Progress:</span>
            <span className="font-mono font-bold text-amber-300">{inProgressActiveCount}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
            <span className="text-slate-300">100% Ready for Next:</span>
            <span className="font-mono font-bold text-emerald-300">{readyForNextCount}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-purple-400" />
            <span className="text-slate-300">Officially Dispatched:</span>
            <span className="font-mono font-bold text-purple-300">{completedDispatchedCount}</span>
          </div>
        </div>
      </div>

      {/* =========================================================================
          FOUR MAIN CLICKABLE OPERATION DASHBOARD BOXES
          ========================================================================= */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-black uppercase tracking-wider text-slate-700 flex items-center gap-2">
            <Layers className="w-4 h-4 text-indigo-600" />
            Operation Stage Controller (Click Box to Filter)
          </h2>
          {selectedBox !== 'ALL' && (
            <button
              onClick={() => setSelectedBox('ALL')}
              className="text-xs text-indigo-600 hover:text-indigo-800 font-bold transition flex items-center gap-1 cursor-pointer"
            >
              <span>View All Stages</span>
              <RotateCcw className="w-3 h-3" />
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* BOX 1: OPEN CABLE */}
          <div
            onClick={() => setSelectedBox(selectedBox === 'Open Cable' ? 'ALL' : 'Open Cable')}
            className={`group rounded-2xl p-5 border transition-all cursor-pointer select-none relative overflow-hidden ${
              selectedBox === 'Open Cable'
                ? 'bg-blue-600 text-white border-blue-600 shadow-xl shadow-blue-600/20 ring-4 ring-blue-200'
                : 'bg-white hover:bg-blue-50/50 text-slate-800 border-slate-200 hover:border-blue-400 shadow-sm'
            }`}
          >
            <div className="flex items-start justify-between">
              <div>
                <span
                  className={`text-[10px] font-black tracking-wider uppercase px-2 py-0.5 rounded-md ${
                    selectedBox === 'Open Cable'
                      ? 'bg-white/20 text-white'
                      : 'bg-blue-100 text-blue-700'
                  }`}
                >
                  Stage 1
                </span>
                <h3 className="text-lg font-black mt-2 tracking-tight">OPEN CABLE</h3>
                <p className={`text-xs mt-0.5 ${selectedBox === 'Open Cable' ? 'text-blue-100' : 'text-slate-500'}`}>
                  Harness, conduits &amp; routing
                </p>
              </div>
              <div
                className={`p-3 rounded-xl ${
                  selectedBox === 'Open Cable' ? 'bg-white/20 text-white' : 'bg-blue-50 text-blue-600'
                }`}
              >
                <Cable className="w-6 h-6" />
              </div>
            </div>

            <div className="mt-5 flex items-baseline justify-between border-t border-slate-100 pt-3">
              <div className="text-3xl font-black font-mono">{openCableCount}</div>
              <span className={`text-xs font-bold flex items-center gap-1 ${selectedBox === 'Open Cable' ? 'text-blue-100' : 'text-blue-600'}`}>
                {openCableCount === 1 ? '1 Machine' : `${openCableCount} Machines`}
                <ChevronRight className="w-3.5 h-3.5" />
              </span>
            </div>
          </div>

          {/* BOX 2: PACKED */}
          <div
            onClick={() => setSelectedBox(selectedBox === 'Packed' ? 'ALL' : 'Packed')}
            className={`group rounded-2xl p-5 border transition-all cursor-pointer select-none relative overflow-hidden ${
              selectedBox === 'Packed'
                ? 'bg-amber-600 text-white border-amber-600 shadow-xl shadow-amber-600/20 ring-4 ring-amber-200'
                : 'bg-white hover:bg-amber-50/50 text-slate-800 border-slate-200 hover:border-amber-400 shadow-sm'
            }`}
          >
            <div className="flex items-start justify-between">
              <div>
                <span
                  className={`text-[10px] font-black tracking-wider uppercase px-2 py-0.5 rounded-md ${
                    selectedBox === 'Packed'
                      ? 'bg-white/20 text-white'
                      : 'bg-amber-100 text-amber-700'
                  }`}
                >
                  Stage 2
                </span>
                <h3 className="text-lg font-black mt-2 tracking-tight">PACKED</h3>
                <p className={`text-xs mt-0.5 ${selectedBox === 'Packed' ? 'text-amber-100' : 'text-slate-500'}`}>
                  VCI barrier, axis locks &amp; base
                </p>
              </div>
              <div
                className={`p-3 rounded-xl ${
                  selectedBox === 'Packed' ? 'bg-white/20 text-white' : 'bg-amber-50 text-amber-600'
                }`}
              >
                <Package className="w-6 h-6" />
              </div>
            </div>

            <div className="mt-5 flex items-baseline justify-between border-t border-slate-100 pt-3">
              <div className="text-3xl font-black font-mono">{packedCount}</div>
              <span className={`text-xs font-bold flex items-center gap-1 ${selectedBox === 'Packed' ? 'text-amber-100' : 'text-amber-600'}`}>
                {packedCount === 1 ? '1 Machine' : `${packedCount} Machines`}
                <ChevronRight className="w-3.5 h-3.5" />
              </span>
            </div>
          </div>

          {/* BOX 3: PACKED WITH PROBING */}
          <div
            onClick={() => setSelectedBox(selectedBox === 'Packed with Probing' ? 'ALL' : 'Packed with Probing')}
            className={`group rounded-2xl p-5 border transition-all cursor-pointer select-none relative overflow-hidden ${
              selectedBox === 'Packed with Probing'
                ? 'bg-indigo-600 text-white border-indigo-600 shadow-xl shadow-indigo-600/20 ring-4 ring-indigo-200'
                : 'bg-white hover:bg-indigo-50/50 text-slate-800 border-slate-200 hover:border-indigo-400 shadow-sm'
            }`}
          >
            <div className="flex items-start justify-between">
              <div>
                <span
                  className={`text-[10px] font-black tracking-wider uppercase px-2 py-0.5 rounded-md ${
                    selectedBox === 'Packed with Probing'
                      ? 'bg-white/20 text-white'
                      : 'bg-indigo-100 text-indigo-700'
                  }`}
                >
                  Stage 3
                </span>
                <h3 className="text-lg font-black mt-2 tracking-tight">PACKED WITH PROBING</h3>
                <p className={`text-xs mt-0.5 ${selectedBox === 'Packed with Probing' ? 'text-indigo-100' : 'text-slate-500'}`}>
                  Probe kits, styli &amp; crate packing
                </p>
              </div>
              <div
                className={`p-3 rounded-xl ${
                  selectedBox === 'Packed with Probing' ? 'bg-white/20 text-white' : 'bg-indigo-50 text-indigo-600'
                }`}
              >
                <Box className="w-6 h-6" />
              </div>
            </div>

            <div className="mt-5 flex items-baseline justify-between border-t border-slate-100 pt-3">
              <div className="text-3xl font-black font-mono">{packedWithProbingCount}</div>
              <span className={`text-xs font-bold flex items-center gap-1 ${selectedBox === 'Packed with Probing' ? 'text-indigo-100' : 'text-indigo-600'}`}>
                {packedWithProbingCount === 1 ? '1 Machine' : `${packedWithProbingCount} Machines`}
                <ChevronRight className="w-3.5 h-3.5" />
              </span>
            </div>
          </div>

          {/* BOX 4: INVOICING / DISPATCHED */}
          <div
            onClick={() => setSelectedBox(selectedBox === 'Invoicing' ? 'ALL' : 'Invoicing')}
            className={`group rounded-2xl p-5 border transition-all cursor-pointer select-none relative overflow-hidden ${
              selectedBox === 'Invoicing'
                ? 'bg-emerald-700 text-white border-emerald-700 shadow-xl shadow-emerald-700/20 ring-4 ring-emerald-200'
                : 'bg-white hover:bg-emerald-50/50 text-slate-800 border-slate-200 hover:border-emerald-400 shadow-sm'
            }`}
          >
            <div className="flex items-start justify-between">
              <div>
                <span
                  className={`text-[10px] font-black tracking-wider uppercase px-2 py-0.5 rounded-md ${
                    selectedBox === 'Invoicing'
                      ? 'bg-white/20 text-white'
                      : 'bg-emerald-100 text-emerald-800'
                  }`}
                >
                  Stage 4 &amp; 5
                </span>
                <h3 className="text-lg font-black mt-2 tracking-tight">INVOICING / DISPATCH</h3>
                <p className={`text-xs mt-0.5 ${selectedBox === 'Invoicing' ? 'text-emerald-100' : 'text-slate-500'}`}>
                  Invoicing ({invoicingCount}) &bull; Dispatched ({dispatchedCount})
                </p>
              </div>
              <div
                className={`p-3 rounded-xl ${
                  selectedBox === 'Invoicing' ? 'bg-white/20 text-white' : 'bg-emerald-50 text-emerald-700'
                }`}
              >
                <Truck className="w-6 h-6" />
              </div>
            </div>

            <div className="mt-5 flex items-baseline justify-between border-t border-slate-100 pt-3">
              <div className="text-3xl font-black font-mono">
                {invoicingCount + dispatchedCount}
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-[11px] font-bold px-2 py-0.5 rounded-md ${
                  selectedBox === 'Invoicing' ? 'bg-white/20 text-white' : 'bg-emerald-100 text-emerald-800'
                }`}>
                  {invoicingCount} Inv
                </span>
                <span className={`text-[11px] font-bold px-2 py-0.5 rounded-md ${
                  selectedBox === 'Invoicing' ? 'bg-purple-900/40 text-purple-200' : 'bg-purple-100 text-purple-800'
                }`}>
                  {dispatchedCount} Disp
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* =========================================================================
          FILTER, SEARCH & SUB-TABS TOOLBAR
          ========================================================================= */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {/* Active Box Indicator */}
          {selectedBox !== 'ALL' && (
            <div className="px-3 py-1.5 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-800 text-xs font-bold flex items-center gap-1.5">
              <span>Active Filter: {selectedBox}</span>
              <button
                onClick={() => setSelectedBox('ALL')}
                className="hover:text-red-600 transition"
                title="Clear stage filter"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Sub-tab when Invoicing is selected */}
          {selectedBox === 'Invoicing' && (
            <div className="flex items-center bg-slate-100 p-1 rounded-xl">
              <button
                onClick={() => setInvoicingSubTab('INVOICING')}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
                  invoicingSubTab === 'INVOICING'
                    ? 'bg-white text-emerald-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Invoicing Stage ({invoicingCount})
              </button>
              <button
                onClick={() => setInvoicingSubTab('DISPATCHED')}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
                  invoicingSubTab === 'DISPATCHED'
                    ? 'bg-white text-purple-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Dispatched Archive ({dispatchedCount})
              </button>
            </div>
          )}

          {/* Status Quick Filters */}
          <div className="flex items-center bg-slate-100 p-1 rounded-xl text-xs">
            <button
              onClick={() => setStatusFilter('ALL')}
              className={`px-2.5 py-1 rounded-lg font-bold transition ${
                statusFilter === 'ALL' ? 'bg-white text-slate-800 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All Status
            </button>
            <button
              onClick={() => setStatusFilter('IN_PROGRESS')}
              className={`px-2.5 py-1 rounded-lg font-bold transition ${
                statusFilter === 'IN_PROGRESS' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              In Progress
            </button>
            <button
              onClick={() => setStatusFilter('READY_FOR_NEXT')}
              className={`px-2.5 py-1 rounded-lg font-bold transition ${
                statusFilter === 'READY_FOR_NEXT' ? 'bg-white text-emerald-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              100% Ready
            </button>
            <button
              onClick={() => setStatusFilter('DISPATCHED')}
              className={`px-2.5 py-1 rounded-lg font-bold transition ${
                statusFilter === 'DISPATCHED' ? 'bg-white text-purple-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Dispatched
            </button>
          </div>
        </div>

        {/* Search Input */}
        <div className="relative min-w-[260px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search Machine #, Size, Customer..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500 font-medium"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* =========================================================================
          MACHINE-WISE OPERATIONS DATA TABLE
          ========================================================================= */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider">
              {selectedBox === 'ALL' ? 'All Packing Operations' : `${selectedBox} Machine Queue`}
            </h3>
            <span className="px-2 py-0.5 rounded-full bg-slate-200 text-slate-700 font-mono text-xs font-bold">
              {filteredOperations.length}
            </span>
          </div>

          <span className="text-xs text-slate-500 font-medium">
            Rule: 100% completion required to move to next operation
          </span>
        </div>

        {filteredOperations.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <Package className="w-12 h-12 mx-auto mb-3 opacity-30 text-indigo-400" />
            <h4 className="text-base font-bold text-slate-700">No Machines in this Operation Stage</h4>
            <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
              Machines handed over from 14 Calibration or Final Assembly appear in the Incoming Machines queue, ready to begin Open Cable.
            </p>
            {incomingHandovers.length > 0 && (
              <button
                onClick={() => setIsIncomingModalOpen(true)}
                className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 transition"
              >
                View Incoming Machines ({incomingHandovers.length})
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-100/80 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[11px]">
                  <th className="p-3.5">Machine Details</th>
                  <th className="p-3.5">Previous Dept &amp; Received</th>
                  <th className="p-3.5">Current Operation</th>
                  <th className="p-3.5">Assigned Person</th>
                  <th className="p-3.5">Progress &amp; Status</th>
                  <th className="p-3.5">Remarks / Pending Details</th>
                  <th className="p-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredOperations.map((op) => {
                  const currentStageRec = op.stages[op.currentStage];
                  const is100Percent = op.currentProgressPercent === 100;
                  const isFinalDispatched = op.isDispatched;

                  // Stage badge styling
                  let stageBadgeClass = 'bg-blue-100 text-blue-800 border-blue-200';
                  if (op.currentStage === 'Packed') stageBadgeClass = 'bg-amber-100 text-amber-800 border-amber-200';
                  if (op.currentStage === 'Packed with Probing') stageBadgeClass = 'bg-indigo-100 text-indigo-800 border-indigo-200';
                  if (op.currentStage === 'Invoicing') stageBadgeClass = 'bg-emerald-100 text-emerald-800 border-emerald-200';
                  if (op.currentStage === 'Dispatched') stageBadgeClass = 'bg-purple-100 text-purple-800 border-purple-200';

                  return (
                    <tr
                      key={op.id}
                      className={`hover:bg-slate-50/80 transition-colors ${
                        isFinalDispatched ? 'bg-slate-50/50 opacity-90' : ''
                      }`}
                    >
                      {/* Machine Details */}
                      <td className="p-3.5 font-medium">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-black text-slate-900 text-sm">
                            {op.machineNumber}
                          </span>
                          <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-bold text-[10px]">
                            {op.machineSize || 'Standard'}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5">{op.model || 'Bridge CMM'}</div>
                        <div className="text-[10px] text-indigo-600 font-medium">{op.customer || 'Accurate Plant'}</div>
                      </td>

                      {/* Previous Dept & Received Date */}
                      <td className="p-3.5">
                        <div className="font-bold text-slate-700 flex items-center gap-1">
                          <Building className="w-3 h-3 text-slate-400" />
                          <span>{op.previousDepartment || '14 Calibration'}</span>
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-1">
                          <Calendar className="w-3 h-3 text-slate-400" />
                          <span>Received: {op.receivedDate}</span>
                        </div>
                      </td>

                      {/* Current Operation */}
                      <td className="p-3.5">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold border ${stageBadgeClass}`}>
                          {op.currentStage === 'Open Cable' && <Cable className="w-3 h-3" />}
                          {op.currentStage === 'Packed' && <Package className="w-3 h-3" />}
                          {op.currentStage === 'Packed with Probing' && <Box className="w-3 h-3" />}
                          {op.currentStage === 'Invoicing' && <FileCheck className="w-3 h-3" />}
                          {op.currentStage === 'Dispatched' && <Truck className="w-3 h-3" />}
                          <span>{op.currentStage}</span>
                        </span>

                        <div className="text-[10px] text-slate-400 mt-1">
                          Started: {currentStageRec?.startDate || op.receivedDate}
                        </div>
                      </td>

                      {/* Assigned Person */}
                      <td className="p-3.5">
                        <div className="flex items-center gap-1.5 font-bold text-slate-800">
                          <User className="w-3 h-3 text-slate-400" />
                          <span>{currentStageRec?.assignedEmployee || 'Atul More'}</span>
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5">Packing Team</div>
                      </td>

                      {/* Progress & Status */}
                      <td className="p-3.5">
                        <div className="w-36">
                          <div className="flex items-center justify-between text-[11px] mb-1">
                            <span className="font-bold text-slate-700 font-mono">
                              {op.currentProgressPercent}%
                            </span>
                            {is100Percent ? (
                              <span className="text-[10px] font-black text-emerald-600 flex items-center gap-0.5">
                                <CheckCircle2 className="w-3 h-3" />
                                100% Ready
                              </span>
                            ) : (
                              <span className="text-[10px] font-medium text-amber-600">
                                In Progress
                              </span>
                            )}
                          </div>
                          <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                            <div
                              className={`h-full transition-all rounded-full ${
                                is100Percent
                                  ? 'bg-emerald-500'
                                  : isFinalDispatched
                                  ? 'bg-purple-600'
                                  : 'bg-indigo-600'
                              }`}
                              style={{ width: `${op.currentProgressPercent}%` }}
                            />
                          </div>
                        </div>
                      </td>

                      {/* Remarks / Details */}
                      <td className="p-3.5 max-w-xs">
                        <div className="text-slate-700 font-medium truncate" title={currentStageRec?.remarks}>
                          {currentStageRec?.remarks || '-'}
                        </div>
                        {currentStageRec?.pendingWork && (
                          <div className="text-[10px] text-amber-600 truncate mt-0.5" title={currentStageRec.pendingWork}>
                            Pending: {currentStageRec.pendingWork}
                          </div>
                        )}
                        {currentStageRec?.invoiceNumber && (
                          <div className="text-[10px] text-emerald-700 font-mono font-bold mt-0.5">
                            Inv: {currentStageRec.invoiceNumber}
                          </div>
                        )}
                        {currentStageRec?.deliveryReference && (
                          <div className="text-[10px] text-purple-700 font-mono font-bold mt-0.5">
                            Disp Ref: {currentStageRec.deliveryReference}
                          </div>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="p-3.5 text-right space-x-1.5 whitespace-nowrap">
                        {/* Update Progress Button */}
                        <button
                          onClick={() => handleOpenUpdateModal(op)}
                          className="px-2.5 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-xs transition border border-indigo-200 cursor-pointer"
                        >
                          Update
                        </button>

                        {/* Move to Next Operation Button */}
                        {!isFinalDispatched && (
                          <button
                            onClick={() => handleOpenUpdateModal(op)}
                            disabled={!is100Percent}
                            title={
                              is100Percent
                                ? `Click to advance to next operation`
                                : `Disabled: Must achieve 100% completion in ${op.currentStage} first (Currently ${op.currentProgressPercent}%)`
                            }
                            className={`px-3 py-1.5 rounded-lg font-bold text-xs transition inline-flex items-center gap-1 ${
                              is100Percent
                                ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs cursor-pointer animate-pulse'
                                : 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200'
                            }`}
                          >
                            <span>Move Next</span>
                            <ArrowRight className="w-3 h-3" />
                          </button>
                        )}

                        {/* History Button */}
                        <button
                          onClick={() => setHistoryModalMachine(op)}
                          className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 transition"
                          title="View complete operation history"
                        >
                          <History className="w-3.5 h-3.5" />
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

      {/* =========================================================================
          UPDATE MACHINE OPERATION MODAL
          ========================================================================= */}
      {activeModalMachine && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-2xl w-full border border-slate-200 shadow-2xl overflow-hidden my-8">
            {/* Header */}
            <div className="bg-slate-900 text-white p-6 relative">
              <button
                onClick={() => setActiveModalMachine(null)}
                className="absolute top-5 right-5 text-slate-400 hover:text-white transition"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="flex items-center gap-2 mb-2">
                <span className="px-2.5 py-0.5 rounded-md bg-indigo-500/20 text-indigo-300 font-mono font-bold text-xs border border-indigo-500/30">
                  Update Operation
                </span>
                <span className="px-2.5 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 font-bold text-xs border border-emerald-500/30">
                  Current Stage: {activeModalMachine.currentStage}
                </span>
              </div>

              <h3 className="text-xl font-black text-white flex items-center gap-2">
                <span>Machine #{activeModalMachine.machineNumber}</span>
                <span className="text-sm font-normal text-slate-400">
                  ({activeModalMachine.machineSize || 'Standard'} &bull; {activeModalMachine.model})
                </span>
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Previous Department: <strong className="text-white">{activeModalMachine.previousDepartment}</strong> &bull; Received on {activeModalMachine.receivedDate}
              </p>
            </div>

            {/* Content Form */}
            <div className="p-6 space-y-5 max-h-[70vh] overflow-y-auto">
              {/* Alert Messages */}
              {actionError && (
                <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-start gap-2.5">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <div>{actionError}</div>
                </div>
              )}

              {actionSuccess && (
                <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <div>{actionSuccess}</div>
                </div>
              )}

              {/* Read-Only Machine Identifiers Card */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3.5 bg-slate-50 rounded-2xl border border-slate-200 text-xs">
                <div>
                  <span className="text-[10px] text-slate-500 uppercase font-bold block">Machine Number</span>
                  <span className="font-mono font-black text-slate-900 text-sm">{activeModalMachine.machineNumber}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 uppercase font-bold block">Machine Size</span>
                  <span className="font-bold text-slate-800">{activeModalMachine.machineSize || 'Standard'}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 uppercase font-bold block">Current Operation</span>
                  <span className="font-bold text-indigo-700">{activeModalMachine.currentStage}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 uppercase font-bold block">Customer / Project</span>
                  <span className="font-bold text-slate-800 truncate block">{activeModalMachine.customer}</span>
                </div>
              </div>

              {/* Completion Percentage Controller */}
              <div className="bg-indigo-50/50 p-4 rounded-2xl border border-indigo-100 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-black uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                    <TrendingUp className="w-4 h-4 text-indigo-600" />
                    <span>Completion Percentage ({editProgressPercent}%)</span>
                  </label>
                  <span className={`text-xs font-black px-2.5 py-1 rounded-lg ${
                    editProgressPercent === 100
                      ? 'bg-emerald-600 text-white animate-pulse'
                      : 'bg-indigo-100 text-indigo-800'
                  }`}>
                    {editProgressPercent === 100 ? '100% COMPLETE' : `${editProgressPercent}% In Progress`}
                  </span>
                </div>

                <input
                  type="range"
                  min="0"
                  max="100"
                  step="5"
                  value={editProgressPercent}
                  onChange={(e) => setEditProgressPercent(Number(e.target.value))}
                  className="w-full accent-indigo-600 cursor-pointer h-2 bg-slate-200 rounded-lg"
                />

                <div className="flex items-center justify-between text-[11px] font-bold text-slate-500">
                  <button type="button" onClick={() => setEditProgressPercent(0)} className="hover:text-indigo-600">0%</button>
                  <button type="button" onClick={() => setEditProgressPercent(25)} className="hover:text-indigo-600">25%</button>
                  <button type="button" onClick={() => setEditProgressPercent(50)} className="hover:text-indigo-600">50%</button>
                  <button type="button" onClick={() => setEditProgressPercent(75)} className="hover:text-indigo-600">75%</button>
                  <button type="button" onClick={() => setEditProgressPercent(90)} className="hover:text-indigo-600">90%</button>
                  <button
                    type="button"
                    onClick={() => setEditProgressPercent(100)}
                    className="text-emerald-600 font-black hover:underline"
                  >
                    100% (Complete)
                  </button>
                </div>

                {editProgressPercent < 100 && (
                  <p className="text-[11px] text-amber-700 bg-amber-50 p-2 rounded-xl border border-amber-200">
                    <strong>Rule:</strong> You can save progress at {editProgressPercent}%. To move to the next operation ({getNextStageName(activeModalMachine.currentStage)}), progress must reach <strong>100%</strong>.
                  </p>
                )}
              </div>

              {/* Assigned Person & Start Date */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-[11px] font-bold uppercase tracking-wider text-slate-700 block mb-1">
                    Assigned Employee
                  </label>
                  <input
                    type="text"
                    value={editEmployee}
                    onChange={(e) => setEditEmployee(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white font-medium"
                    placeholder="e.g. Atul More"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold uppercase tracking-wider text-slate-700 block mb-1">
                    Operation Start Date
                  </label>
                  <input
                    type="date"
                    value={editStartDate}
                    onChange={(e) => setEditStartDate(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white font-medium"
                  />
                </div>
              </div>

              {/* Work Remarks */}
              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-700 block mb-1">
                  Work Remarks / Progress Description
                </label>
                <textarea
                  rows={2}
                  value={editRemarks}
                  onChange={(e) => setEditRemarks(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white font-medium"
                  placeholder="Enter details of work performed in this operation stage..."
                />
              </div>

              {/* Pending Work Details */}
              {editProgressPercent < 100 && (
                <div>
                  <label className="text-[11px] font-bold uppercase tracking-wider text-slate-700 block mb-1">
                    Pending Work Details (Remaining for 100%)
                  </label>
                  <textarea
                    rows={2}
                    value={editPendingWork}
                    onChange={(e) => setEditPendingWork(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-amber-50/50 border border-amber-200 rounded-xl focus:bg-white font-medium text-amber-900"
                    placeholder="List what is remaining to reach 100% completion..."
                  />
                </div>
              )}

              {/* Invoicing Stage Special Fields */}
              {activeModalMachine.currentStage === 'Invoicing' && (
                <div className="p-4 rounded-2xl bg-emerald-50/60 border border-emerald-200 space-y-3">
                  <h4 className="text-xs font-black uppercase tracking-wider text-emerald-900 flex items-center gap-1.5">
                    <FileCheck className="w-4 h-4 text-emerald-700" />
                    <span>Commercial Invoicing Details</span>
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div>
                      <label className="text-[10px] font-bold uppercase text-slate-600 block mb-1">
                        Invoice Number *
                      </label>
                      <input
                        type="text"
                        value={invoiceNumber}
                        onChange={(e) => setInvoiceNumber(e.target.value)}
                        className="w-full px-3 py-2 text-xs bg-white border border-emerald-300 rounded-xl font-mono font-bold"
                        placeholder="e.g. INV-2026-AG-0512"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold uppercase text-slate-600 block mb-1">
                        Invoice Date *
                      </label>
                      <input
                        type="date"
                        value={invoiceDate}
                        onChange={(e) => setInvoiceDate(e.target.value)}
                        className="w-full px-3 py-2 text-xs bg-white border border-emerald-300 rounded-xl font-bold"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold uppercase text-slate-600 block mb-1">
                        Invoice Amount (INR)
                      </label>
                      <input
                        type="number"
                        value={invoiceAmount}
                        onChange={(e) => setInvoiceAmount(e.target.value)}
                        className="w-full px-3 py-2 text-xs bg-white border border-emerald-300 rounded-xl font-mono"
                        placeholder="e.g. 4500000"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold uppercase text-slate-600 block mb-1">
                        Invoice Status
                      </label>
                      <select
                        value={invoiceStatus}
                        onChange={(e) => setInvoiceStatus(e.target.value)}
                        className="w-full px-3 py-2 text-xs bg-white border border-emerald-300 rounded-xl font-bold"
                      >
                        <option value="Draft">Draft</option>
                        <option value="Approved">Approved</option>
                        <option value="Sent to Customer">Sent to Customer</option>
                        <option value="Paid">Payment Cleared</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {/* Dispatched Stage Special Fields */}
              {activeModalMachine.currentStage === 'Dispatched' && (
                <div className="p-4 rounded-2xl bg-purple-50/60 border border-purple-200 space-y-3">
                  <h4 className="text-xs font-black uppercase tracking-wider text-purple-900 flex items-center gap-1.5">
                    <Truck className="w-4 h-4 text-purple-700" />
                    <span>Official Dispatch &amp; Logistics Details</span>
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div>
                      <label className="text-[10px] font-bold uppercase text-slate-600 block mb-1">
                        Dispatch Date *
                      </label>
                      <input
                        type="date"
                        value={dispatchDate}
                        onChange={(e) => setDispatchDate(e.target.value)}
                        className="w-full px-3 py-2 text-xs bg-white border border-purple-300 rounded-xl font-bold"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold uppercase text-slate-600 block mb-1">
                        Delivery / Dispatch Ref *
                      </label>
                      <input
                        type="text"
                        value={deliveryRef}
                        onChange={(e) => setDeliveryRef(e.target.value)}
                        className="w-full px-3 py-2 text-xs bg-white border border-purple-300 rounded-xl font-mono font-bold"
                        placeholder="e.g. DISP-2026-081"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold uppercase text-slate-600 block mb-1">
                        Transporter Name
                      </label>
                      <input
                        type="text"
                        value={transporterName}
                        onChange={(e) => setTransporterName(e.target.value)}
                        className="w-full px-3 py-2 text-xs bg-white border border-purple-300 rounded-xl font-bold"
                        placeholder="e.g. V-Trans Logistics"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold uppercase text-slate-600 block mb-1">
                        LR / E-Way Bill Number
                      </label>
                      <input
                        type="text"
                        value={lrNumber}
                        onChange={(e) => setLrNumber(e.target.value)}
                        className="w-full px-3 py-2 text-xs bg-white border border-purple-300 rounded-xl font-mono"
                        placeholder="e.g. LR-984124"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Supporting Document Reference */}
              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-700 block mb-1">
                  Supporting Document Attachment
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={editDocName}
                    onChange={(e) => setEditDocName(e.target.value)}
                    placeholder="e.g. Packing_Inspection_Checklist.pdf or Invoice_Copy.pdf"
                    className="flex-1 px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setEditDocName(`Packing_Record_${activeModalMachine.machineNumber}_${activeModalMachine.currentStage.replace(/\s+/g, '_')}.pdf`)}
                    className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs flex items-center gap-1 cursor-pointer"
                  >
                    <UploadCloud className="w-3.5 h-3.5" />
                    <span>Attach</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Modal Actions Footer: 2 SEPARATE BUTTONS */}
            <div className="p-5 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setActiveModalMachine(null)}
                className="w-full sm:w-auto px-4 py-2.5 rounded-xl text-slate-600 hover:bg-slate-200 text-xs font-bold transition"
              >
                Cancel
              </button>

              <div className="flex items-center gap-3 w-full sm:w-auto">
                {/* 1. SAVE PROGRESS BUTTON */}
                <button
                  type="button"
                  onClick={handleSaveProgress}
                  disabled={isSubmitting}
                  className="flex-1 sm:flex-none px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs transition shadow-xs cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <Check className="w-4 h-4 text-emerald-400" />
                  <span>Save Progress ({editProgressPercent}%)</span>
                </button>

                {/* 2. COMPLETE OPERATION & MOVE TO NEXT (Compulsory 100%) */}
                <button
                  type="button"
                  onClick={handleCompleteAndAdvance}
                  disabled={isSubmitting || editProgressPercent < 100}
                  title={
                    editProgressPercent < 100
                      ? 'Compulsory: Machine must reach 100% completion in current operation before moving forward.'
                      : 'Complete current operation and move machine to next stage'
                  }
                  className={`flex-1 sm:flex-none px-5 py-2.5 rounded-xl font-black text-xs transition shadow-md flex items-center justify-center gap-2 ${
                    editProgressPercent === 100
                      ? 'bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer ring-4 ring-emerald-100 animate-pulse'
                      : 'bg-slate-200 text-slate-400 cursor-not-allowed border border-slate-300'
                  }`}
                >
                  <span>Complete &amp; Move to {getNextStageName(activeModalMachine.currentStage)}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          MACHINE-WISE OPERATION HISTORY TIMELINE MODAL
          ========================================================================= */}
      {historyModalMachine && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-2xl w-full border border-slate-200 shadow-2xl overflow-hidden my-8">
            <div className="bg-slate-900 text-white p-6 relative">
              <button
                onClick={() => setHistoryModalMachine(null)}
                className="absolute top-5 right-5 text-slate-400 hover:text-white transition"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="flex items-center gap-2 mb-1">
                <span className="px-2.5 py-0.5 rounded-md bg-indigo-500/20 text-indigo-300 font-mono font-bold text-xs border border-indigo-500/30">
                  Operation History
                </span>
                <span className="px-2.5 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 font-bold text-xs">
                  Machine #{historyModalMachine.machineNumber}
                </span>
              </div>
              <h3 className="text-xl font-black text-white">Chronological Packing &amp; Dispatch Timeline</h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Full audit trail of all operation handovers, updates, completions and dispatch milestones.
              </p>
            </div>

            <div className="p-6 max-h-[70vh] overflow-y-auto space-y-6">
              {/* Stages Summary Bar */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center text-xs">
                {PACKING_STAGES_SEQUENCE.map((stg) => {
                  const rec = historyModalMachine.stages[stg];
                  const isDone = rec?.status === 'Completed' || (historyModalMachine.isDispatched && stg === 'Dispatched');
                  const isCurrent = historyModalMachine.currentStage === stg && !historyModalMachine.isDispatched;

                  return (
                    <div
                      key={stg}
                      className={`p-3 rounded-2xl border text-xs ${
                        isDone
                          ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                          : isCurrent
                          ? 'bg-indigo-50 border-indigo-300 text-indigo-800 font-bold'
                          : 'bg-slate-50 border-slate-200 text-slate-400'
                      }`}
                    >
                      <div className="text-[10px] uppercase font-bold text-slate-400">{stg}</div>
                      <div className="text-sm font-black font-mono mt-0.5">
                        {isDone ? '100%' : isCurrent ? `${historyModalMachine.currentProgressPercent}%` : '0%'}
                      </div>
                      <div className="text-[10px] mt-0.5">
                        {isDone ? 'Completed' : isCurrent ? 'Active' : 'Pending'}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Chronological Timeline */}
              <div className="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
                {historyModalMachine.history.map((entry, idx) => {
                  let dotColor = 'bg-blue-600';
                  if (entry.action === 'STAGE_COMPLETED') dotColor = 'bg-emerald-600';
                  if (entry.action === 'DISPATCHED') dotColor = 'bg-purple-600';
                  if (entry.action === 'RECEIVED') dotColor = 'bg-amber-600';

                  return (
                    <div key={entry.id || idx} className="relative">
                      <div className={`absolute -left-6 top-1 w-3.5 h-3.5 rounded-full border-2 border-white ${dotColor} shadow-xs`} />
                      <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 text-xs">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="font-bold text-slate-800 text-xs">
                            {entry.stage} &bull; <span className="uppercase text-[10px] tracking-wider text-indigo-700">{entry.action.replace(/_/g, ' ')}</span>
                          </span>
                          <span className="text-[10px] text-slate-400 font-mono">
                            {entry.timestamp ? new Date(entry.timestamp).toLocaleString() : 'Recent'}
                          </span>
                        </div>

                        <p className="text-slate-700 font-medium">{entry.remarks || '-'}</p>

                        <div className="mt-2 pt-2 border-t border-slate-200/60 flex flex-wrap items-center justify-between text-[10px] text-slate-500 gap-2">
                          <div>
                            Progress: <strong className="font-mono text-slate-800">{entry.previousProgress}% &rarr; {entry.newProgress}%</strong>
                          </div>
                          <div>
                            Updated by: <strong className="text-slate-800">{entry.assignedEmployee || entry.updatedBy}</strong>
                          </div>
                          {entry.invoiceNumber && (
                            <span className="text-emerald-700 font-mono font-bold">
                              Inv: {entry.invoiceNumber}
                            </span>
                          )}
                          {entry.dispatchReference && (
                            <span className="text-purple-700 font-mono font-bold">
                              Ref: {entry.dispatchReference}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-200 text-right">
              <button
                onClick={() => setHistoryModalMachine(null)}
                className="px-4 py-2 bg-slate-800 text-white rounded-xl text-xs font-bold hover:bg-slate-900 transition"
              >
                Close History
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          INCOMING MACHINES & HANDOVER ACCEPTANCE MODAL
          ========================================================================= */}
      {isIncomingModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-3xl w-full border border-slate-200 shadow-2xl overflow-hidden my-8">
            <div className="bg-slate-900 text-white p-6 relative">
              <button
                onClick={() => setIsIncomingModalOpen(false)}
                className="absolute top-5 right-5 text-slate-400 hover:text-white transition"
              >
                <X className="w-5 h-5" />
              </button>
              <div className="flex items-center gap-2 mb-1">
                <span className="px-2.5 py-0.5 rounded-md bg-amber-500/20 text-amber-300 font-bold text-xs">
                  Handover Acceptance
                </span>
              </div>
              <h3 className="text-xl font-black text-white">Incoming Machines for Packing &amp; Dispatch</h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Machines handed over from 14 Calibration or 12-B Final Assembly awaiting acceptance into Open Cable.
              </p>
            </div>

            <div className="p-6 max-h-[70vh] overflow-y-auto">
              {incomingHandovers.length === 0 ? (
                <div className="text-center py-10 text-slate-400 text-xs">
                  <CheckCircle2 className="w-10 h-10 mx-auto mb-2 text-emerald-500 opacity-60" />
                  <div className="text-slate-700 font-bold text-sm">No Pending Incoming Handovers</div>
                  <p className="mt-1">All handed-over machines have been accepted into active operations.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {incomingHandovers.map((h) => (
                    <div
                      key={h.id}
                      className="p-4 rounded-2xl border border-slate-200 bg-slate-50 hover:bg-white transition flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-black text-slate-900 text-sm">
                            Machine #{h.machineNumber}
                          </span>
                          <span className="px-2 py-0.5 rounded-md bg-slate-200 text-slate-700 font-bold text-[10px]">
                            {h.machineSize || h.modelSize || 'Standard'}
                          </span>
                        </div>
                        <div className="text-slate-600 mt-1">
                          From: <strong>{h.sendingDepartment || h.fromDepartment || '14 Calibration'}</strong> &bull; Handover Date: {h.handoverDate || h.date}
                        </div>
                        <div className="text-slate-500 text-[11px] mt-0.5 italic">
                          "{h.remarks || h.workDescription || 'Machine calibrated and ready for packing'}"
                        </div>
                      </div>

                      <button
                        onClick={() => handleAcceptIncomingHandover(h)}
                        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-xs transition flex items-center gap-1.5 shrink-0 cursor-pointer"
                      >
                        <PlusCircle className="w-3.5 h-3.5" />
                        <span>Accept &amp; Begin Open Cable</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Direct Machine Induct Section */}
              <div className="mt-8 pt-5 border-t border-slate-200">
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-700 mb-2">
                  Direct Machine Induction (From Factory Master)
                </h4>
                <p className="text-xs text-slate-400 mb-3">
                  Induct any machine currently at station into Packing &amp; Dispatch Operations:
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {machines
                    .filter((m) => !operations.some((op) => op.machineNumber === m.machineNumber))
                    .slice(0, 4)
                    .map((mach) => (
                      <button
                        key={mach.id}
                        onClick={() => handleInductMachine(mach)}
                        className="p-2.5 rounded-xl border border-slate-200 hover:border-indigo-400 hover:bg-indigo-50/40 text-left transition text-xs cursor-pointer"
                      >
                        <div className="font-mono font-bold text-slate-900">#{mach.machineNumber}</div>
                        <div className="text-[10px] text-slate-500 truncate">{mach.machineSize || '564'}</div>
                        <div className="text-[10px] text-indigo-600 font-bold mt-1">+ Induct</div>
                      </button>
                    ))}
                </div>
              </div>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-200 text-right">
              <button
                onClick={() => setIsIncomingModalOpen(false)}
                className="px-4 py-2 bg-slate-800 text-white rounded-xl text-xs font-bold hover:bg-slate-900 transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

function getNextStageName(current: PackingOperationStage): string {
  if (current === 'Open Cable') return 'Packed';
  if (current === 'Packed') return 'Packed with Probing';
  if (current === 'Packed with Probing') return 'Invoicing';
  if (current === 'Invoicing') return 'Dispatched';
  return 'Completed';
}
