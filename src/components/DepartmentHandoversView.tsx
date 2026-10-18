import React, { useState, useEffect } from 'react';
import {
  ArrowRightLeft,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Plus,
  Search,
  Eye,
  Check,
  X,
  RotateCcw,
  FileText,
  Send,
  Calendar,
  User,
  Tag,
  Building,
  ShieldCheck,
  Play,
  CheckSquare,
  History,
} from 'lucide-react';
import {
  Department,
  DepartmentHandover,
  HandoverHistoryEntry,
  Machine,
} from '../types';
import { useAuth } from '../context/AuthContext';
import {
  createHandover,
  acceptHandover,
  rejectHandover,
  startHandoverWork,
  completeHandoverWork,
  generateDepartmentHandoverId,
  subscribeHandoverHistory,
} from '../services/workflowService';
import { isDepartmentMatch } from '../utils/departmentUtils';
import { areMachineNumbersEqual, getMachineDisplaySize, normalizeMachineNumber } from '../utils/machineUtils';

interface DepartmentHandoversViewProps {
  currentDepartment: string;
  departments: Department[];
  handovers: DepartmentHandover[];
  machines: Machine[];
  initialTab?: 'incoming' | 'outgoing' | 'history';
}

export const DepartmentHandoversView: React.FC<DepartmentHandoversViewProps> = ({
  currentDepartment,
  departments,
  handovers,
  machines,
  initialTab = 'incoming',
}) => {
  const { userProfile } = useAuth();
  const isAdmin = userProfile?.role === 'ADMIN';

  // Sub-tabs: incoming, outgoing, history
  const [subTab, setSubTab] = useState<'incoming' | 'outgoing' | 'history'>(initialTab);

  useEffect(() => {
    if (initialTab) {
      setSubTab(initialTab);
    }
  }, [initialTab]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Modals
  const [showDispatchModal, setShowDispatchModal] = useState(false);
  const [viewHandover, setViewHandover] = useState<DepartmentHandover | null>(null);
  const [returnHandoverItem, setReturnHandoverItem] = useState<DepartmentHandover | null>(null);

  // Return / Rejection form
  const [rejectionReason, setRejectionReason] = useState('');
  const [returnRemarks, setReturnRemarks] = useState('');
  const [correctiveActionRequired, setCorrectiveActionRequired] = useState('');
  const [submittingReturn, setSubmittingReturn] = useState(false);

  // Dispatch Form State
  const [generatedIdPreview, setGeneratedIdPreview] = useState('');
  const [hoMachineNo, setHoMachineNo] = useState('');
  const [hoModel, setHoModel] = useState('');
  const [hoProject, setHoProject] = useState('');
  const [hoCustomer, setHoCustomer] = useState('');
  const [hoSendingDept, setHoSendingDept] = useState(currentDepartment || '06-A Metal Shop');
  const [hoReceivingDept, setHoReceivingDept] = useState('');
  const [hoProcess, setHoProcess] = useState('');
  const [hoOperation, setHoOperation] = useState('');
  const [hoPartCode, setHoPartCode] = useState('');
  const [hoQuantity, setHoQuantity] = useState<number>(1);
  const [hoCurrentStatus, setHoCurrentStatus] = useState('In Progress');
  const [hoHandoverDate, setHoHandoverDate] = useState(new Date().toISOString().split('T')[0]);
  const [hoRequiredDate, setHoRequiredDate] = useState('');
  const [hoPriority, setHoPriority] = useState<'Low' | 'Medium' | 'High' | 'Critical'>('Medium');
  const [hoEmployee, setHoEmployee] = useState(userProfile?.displayName || userProfile?.email || 'Operator');
  const [hoRemarks, setHoRemarks] = useState('');
  const [hoAttachment, setHoAttachment] = useState('');
  const [submittingDispatch, setSubmittingDispatch] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Workflow history subscription
  const [allHistory, setAllHistory] = useState<HandoverHistoryEntry[]>([]);

  useEffect(() => {
    const unsub = subscribeHandoverHistory(undefined, setAllHistory);
    return () => unsub();
  }, []);

  // Update sending department when currentDepartment changes
  useEffect(() => {
    if (currentDepartment) {
      setHoSendingDept(currentDepartment);
    }
  }, [currentDepartment]);

  const dispatchEligibleMachines = React.useMemo(() => {
    return machines.filter((m) => {
      const inDept =
        isAdmin ||
        isDepartmentMatch(m.currentDepartment, currentDepartment) ||
        isDepartmentMatch(m.responsibleDepartment, currentDepartment);
      if (!inDept) return false;
      if (m.handoverStatus === 'AWAITING_ACCEPTANCE' || m.status === 'AWAITING_ACCEPTANCE') return false;
      return true;
    });
  }, [machines, currentDepartment, isAdmin]);

  // When opening dispatch modal, calculate next handover ID and auto-select machine
  const handleOpenDispatchModal = async () => {
    setSuccessMessage(null);
    setErrorMessage(null);
    try {
      const nextId = await generateDepartmentHandoverId();
      setGeneratedIdPreview(nextId);
    } catch {
      setGeneratedIdPreview(`HO-${new Date().getFullYear()}-00001`);
    }

    if (dispatchEligibleMachines.length > 0 && !hoMachineNo) {
      const first = dispatchEligibleMachines[0];
      const displaySize = getMachineDisplaySize(first) !== 'Size not available' ? getMachineDisplaySize(first) : (first.machineSize || first.model || '');
      setHoMachineNo(first.machineNumber);
      setHoModel(displaySize);
      setHoProject(first.project || '');
      setHoCustomer(first.customer || '');
    }

    // Default receiving department to a different department
    const otherDepts = departments.filter((d) => !isDepartmentMatch(d.name, currentDepartment));
    if (otherDepts.length > 0 && !hoReceivingDept) {
      setHoReceivingDept(otherDepts[0].name);
    }

    setShowDispatchModal(true);
  };

  const handleMachineChange = (machNo: string) => {
    setHoMachineNo(machNo);
    const found = machines.find((m) => areMachineNumbersEqual(m.machineNumber, machNo));
    if (found) {
      const displaySize = getMachineDisplaySize(found) !== 'Size not available' ? getMachineDisplaySize(found) : (found.machineSize || found.model || '');
      setHoModel(displaySize);
      setHoProject(found.project || '');
      setHoCustomer(found.customer || '');
      setHoCurrentStatus(found.currentStatus || 'In Progress');
    }
  };

  // Dispatch Handover Submit
  const handleDispatchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!hoMachineNo.trim()) {
      setErrorMessage('Machine Number is mandatory.');
      return;
    }
    if (!hoReceivingDept.trim()) {
      setErrorMessage('Receiving Department is mandatory.');
      return;
    }
    if (isDepartmentMatch(hoSendingDept, hoReceivingDept)) {
      setErrorMessage('Receiving Department must be different from Current Department.');
      return;
    }
    if (!hoOperation.trim()) {
      setErrorMessage('Operation / Work description is mandatory.');
      return;
    }

    setSubmittingDispatch(true);
    try {
      const res = await createHandover(
        {
          handoverId: generatedIdPreview,
          machineNumber: hoMachineNo.trim(),
          machineModel: hoModel,
          machineSize: hoModel,
          modelSize: hoModel,
          project: hoProject,
          customer: hoCustomer,
          fromDepartment: hoSendingDept,
          toDepartment: hoReceivingDept,
          process: hoProcess,
          operation: hoOperation.trim(),
          partCode: hoPartCode.trim(),
          quantity: Number(hoQuantity) || 1,
          currentStatus: hoCurrentStatus,
          handoverDate: hoHandoverDate,
          requiredDate: hoRequiredDate,
          priority: hoPriority,
          employee: hoEmployee.trim(),
          remarks: hoRemarks.trim(),
          attachment: hoAttachment.trim(),
        },
        userProfile?.email
      );

      setSuccessMessage(
        `Handover successfully sent to ${hoReceivingDept} (Handover ID: ${res.handoverId})`
      );
      setShowDispatchModal(false);
      // Reset fields
      setHoOperation('');
      setHoRemarks('');
      setHoPartCode('');
      setHoProcess('');
      setHoAttachment('');
    } catch (err: any) {
      console.error('Dispatch failed:', err);
      setErrorMessage(err.message || 'Failed to dispatch handover. Please try again.');
    } finally {
      setSubmittingDispatch(false);
    }
  };

  // Accept Handover
  const handleAccept = async (handover: DepartmentHandover) => {
    try {
      await acceptHandover(
        handover.id,
        {
          acceptedBy: userProfile?.displayName || userProfile?.email || 'Shop Floor Operator',
          remarks: 'Accepted via Department Handover Deck',
        },
        userProfile?.email
      );
      setSuccessMessage(`Handover ${handover.handoverId || handover.id} accepted successfully.`);
    } catch (err: any) {
      console.error('Accept handover failed:', err);
      alert(err.message || 'Failed to accept handover.');
    }
  };

  // Return Handover Submit
  const handleReturnSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!returnHandoverItem) return;
    if (!rejectionReason.trim()) {
      alert('Rejection reason is mandatory.');
      return;
    }

    setSubmittingReturn(true);
    try {
      await rejectHandover(
        returnHandoverItem.id,
        {
          rejectedBy: userProfile?.displayName || userProfile?.email || 'Inspector / Operator',
          rejectionReason: rejectionReason.trim(),
          remarks: returnRemarks.trim(),
          correctiveActionRequired: correctiveActionRequired.trim(),
        },
        userProfile?.email
      );
      setSuccessMessage(
        `Handover ${returnHandoverItem.handoverId || returnHandoverItem.id} returned to ${returnHandoverItem.fromDepartment || returnHandoverItem.sendingDepartment}.`
      );
      setReturnHandoverItem(null);
      setRejectionReason('');
      setReturnRemarks('');
      setCorrectiveActionRequired('');
    } catch (err: any) {
      console.error('Return failed:', err);
      alert(err.message || 'Failed to return handover.');
    } finally {
      setSubmittingReturn(false);
    }
  };

  // Start Work
  const handleStartWork = async (handoverId: string) => {
    try {
      await startHandoverWork(
        handoverId,
        { startedBy: userProfile?.displayName || userProfile?.email },
        userProfile?.email
      );
      setSuccessMessage('Handover work marked In Progress.');
    } catch (err: any) {
      alert(err.message || 'Failed to start work.');
    }
  };

  // Complete Work
  const handleCompleteWork = async (handoverId: string) => {
    try {
      await completeHandoverWork(
        handoverId,
        { completedBy: userProfile?.displayName || userProfile?.email },
        userProfile?.email
      );
      setSuccessMessage('Handover work marked Completed.');
    } catch (err: any) {
      alert(err.message || 'Failed to complete work.');
    }
  };

  // Filter Handovers
  const incomingHandovers = handovers.filter((h) => {
    const to = h.toDepartment || h.receivingDepartment;
    if (isAdmin && !currentDepartment) return true;
    return isDepartmentMatch(to, currentDepartment);
  });

  const outgoingHandovers = handovers.filter((h) => {
    const from = h.fromDepartment || h.sendingDepartment;
    if (isAdmin && !currentDepartment) return true;
    return isDepartmentMatch(from, currentDepartment);
  });

  const activeList = subTab === 'incoming' ? incomingHandovers : outgoingHandovers;

  const filteredHandovers = activeList.filter((h) => {
    if (statusFilter !== 'ALL') {
      const s = (h.status || '').toUpperCase();
      if (statusFilter === 'SENT' && !['SENT', 'PENDING ACCEPTANCE'].includes(s)) return false;
      if (statusFilter === 'ACCEPTED' && !['ACCEPTED'].includes(s)) return false;
      if (statusFilter === 'IN_PROGRESS' && !['IN_PROGRESS', 'IN PROGRESS'].includes(s)) return false;
      if (statusFilter === 'COMPLETED' && !['COMPLETED'].includes(s)) return false;
      if (statusFilter === 'RETURNED' && !['RETURNED', 'SENT BACK', 'ISSUE RAISED', 'REJECTED'].includes(s)) return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const match =
        (h.handoverId && h.handoverId.toLowerCase().includes(q)) ||
        (h.machineNumber && h.machineNumber.toLowerCase().includes(q)) ||
        (h.workDescription && h.workDescription.toLowerCase().includes(q)) ||
        (h.operation && h.operation.toLowerCase().includes(q)) ||
        (h.project && h.project.toLowerCase().includes(q)) ||
        (h.fromDepartment && h.fromDepartment.toLowerCase().includes(q)) ||
        (h.toDepartment && h.toDepartment.toLowerCase().includes(q));
      if (!match) return false;
    }
    return true;
  });

  // Department history list
  const departmentHistory = allHistory.filter((entry) => {
    if (isAdmin && !currentDepartment) return true;
    return (
      isDepartmentMatch(entry.fromDepartment, currentDepartment) ||
      isDepartmentMatch(entry.toDepartment, currentDepartment)
    );
  });

  return (
    <div className="space-y-6">
      {/* Top Banner with Actions */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <span className="p-2 rounded-xl bg-blue-50 text-blue-600">
              <ArrowRightLeft className="w-5 h-5" />
            </span>
            <div>
              <h2 className="text-base font-black text-slate-900 tracking-tight">
                Department Handover &amp; Dispatch Protocol
              </h2>
              <p className="text-xs text-slate-500">
                Official shop-floor transfer for {currentDepartment || 'All Departments'} with live tracking &amp; audit history
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-2.5">
          <button
            onClick={handleOpenDispatchModal}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-xs flex items-center space-x-2 transition"
          >
            <Send className="w-4 h-4" />
            <span>+ Dispatch / Handover to Department</span>
          </button>
        </div>
      </div>

      {/* Success / Error Messages */}
      {successMessage && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl flex items-center justify-between shadow-xs">
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span className="font-semibold">{successMessage}</span>
          </div>
          <button onClick={() => setSuccessMessage(null)} className="text-emerald-600 hover:text-emerald-900">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Sub-tab Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-3">
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setSubTab('incoming')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center space-x-2 transition ${
              subTab === 'incoming'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <span>Incoming Work Queue</span>
            <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-blue-900/40 text-white">
              {incomingHandovers.length}
            </span>
          </button>

          <button
            onClick={() => setSubTab('outgoing')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center space-x-2 transition ${
              subTab === 'outgoing'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <span>Dispatched / Outgoing</span>
            <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-slate-200 text-slate-700">
              {outgoingHandovers.length}
            </span>
          </button>

          <button
            onClick={() => setSubTab('history')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center space-x-2 transition ${
              subTab === 'history'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>Workflow History</span>
          </button>
        </div>

        {subTab !== 'history' && (
          <div className="flex items-center space-x-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search machine, ID, work..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg w-44 sm:w-56 focus:outline-hidden focus:border-blue-500"
              />
            </div>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg font-medium"
            >
              <option value="ALL">All Statuses</option>
              <option value="SENT">Sent / Pending</option>
              <option value="ACCEPTED">Accepted</option>
              <option value="IN_PROGRESS">In Progress</option>
              <option value="COMPLETED">Completed</option>
              <option value="RETURNED">Returned / Rejected</option>
            </select>
          </div>
        )}
      </div>

      {/* VIEW 1 & 2: INCOMING OR OUTGOING TABLE */}
      {subTab !== 'history' && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
          {filteredHandovers.length === 0 ? (
            <div className="p-12 text-center text-xs text-slate-400">
              No {subTab} handovers matching filter for {currentDepartment || 'this view'}.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[10px]">
                  <tr>
                    <th className="p-3">Handover ID</th>
                    <th className="p-3">Machine</th>
                    <th className="p-3">Project / Customer</th>
                    <th className="p-3">{subTab === 'incoming' ? 'From Dept' : 'To Dept'}</th>
                    <th className="p-3">Operation / Work</th>
                    <th className="p-3">Req Date</th>
                    <th className="p-3">Priority</th>
                    <th className="p-3">Status</th>
                    <th className="p-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredHandovers.map((h) => {
                    const toDept = h.toDepartment || h.receivingDepartment;
                    const fromDept = h.fromDepartment || h.sendingDepartment;
                    const isReceiver = isAdmin || isDepartmentMatch(toDept, currentDepartment);
                    const isSender = isAdmin || isDepartmentMatch(fromDept, currentDepartment);
                    const isPending = h.status === 'SENT' || h.status === 'Pending Acceptance';
                    const isAccepted = h.status === 'ACCEPTED' || h.status === 'Accepted';
                    const isInProgress = h.status === 'IN_PROGRESS' || h.status === 'In Progress';
                    const isReturned =
                      h.status === 'RETURNED' ||
                      h.status === 'Sent Back' ||
                      h.status === 'Issue Raised' ||
                      h.status === 'REJECTED';

                    return (
                      <tr key={h.id} className="hover:bg-slate-50 transition">
                        <td className="p-3 font-mono font-bold text-blue-700">
                          {h.handoverId || `HO-${h.id.slice(0, 6)}`}
                        </td>
                        <td className="p-3 font-bold text-slate-900">
                          <div>Machine {h.machineNumber}</div>
                          <span className="block text-[11px] font-semibold text-slate-600">
                            Size: {(() => {
                              if (h.machineSize && h.machineSize !== 'Standard') return h.machineSize;
                              if (h.modelSize && h.modelSize !== 'Standard') return h.modelSize;
                              if (h.machineModel && h.machineModel !== 'Standard') return h.machineModel;
                              const matched = machines.find((m) => areMachineNumbersEqual(m.machineNumber, h.machineNumber));
                              const sz = getMachineDisplaySize(matched);
                              return sz !== 'Size not available' ? sz : (matched?.model || h.machineSize || h.machineModel || 'Standard');
                            })()}
                          </span>
                        </td>
                        <td className="p-3 text-slate-700">
                          <div>{h.project || 'Standard'}</div>
                          {h.customer && (
                            <div className="text-[10px] text-slate-400">{h.customer}</div>
                          )}
                        </td>
                        <td className="p-3 font-semibold text-slate-700">
                          {subTab === 'incoming' ? fromDept : toDept}
                        </td>
                        <td className="p-3 text-slate-800 font-medium max-w-xs truncate">
                          {h.operation || h.workDescription}
                          {h.rejectionReason && (
                            <span className="block text-[10px] text-red-600 font-semibold truncate">
                              Return Reason: {h.rejectionReason}
                            </span>
                          )}
                        </td>
                        <td className="p-3 font-mono text-slate-600">
                          {h.requiredDate || h.handoverDate || h.date}
                        </td>
                        <td className="p-3">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              h.priority === 'Critical'
                                ? 'bg-red-100 text-red-700'
                                : h.priority === 'High'
                                ? 'bg-amber-100 text-amber-700'
                                : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {h.priority || 'Medium'}
                          </span>
                        </td>
                        <td className="p-3">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              isAccepted || h.status === 'COMPLETED' || h.status === 'Completed'
                                ? 'bg-emerald-100 text-emerald-800'
                                : isReturned
                                ? 'bg-red-100 text-red-800'
                                : isInProgress
                                ? 'bg-blue-100 text-blue-800'
                                : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {h.status}
                          </span>
                        </td>
                        <td className="p-3 text-right">
                          <div className="inline-flex items-center space-x-1.5">
                            <button
                              onClick={() => setViewHandover(h)}
                              className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-[11px] font-semibold flex items-center space-x-1"
                              title="View Details"
                            >
                              <Eye className="w-3 h-3" />
                              <span>View</span>
                            </button>

                            {/* Receiver Actions */}
                            {isReceiver && isPending && (
                              <>
                                <button
                                  onClick={() => handleAccept(h)}
                                  className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[11px] font-bold flex items-center space-x-1"
                                >
                                  <Check className="w-3 h-3" />
                                  <span>Accept</span>
                                </button>
                                <button
                                  onClick={() => {
                                    setReturnHandoverItem(h);
                                    setRejectionReason('');
                                    setReturnRemarks('');
                                    setCorrectiveActionRequired('');
                                  }}
                                  className="px-2.5 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-[11px] font-bold flex items-center space-x-1"
                                >
                                  <RotateCcw className="w-3 h-3" />
                                  <span>Reject / Return</span>
                                </button>
                              </>
                            )}

                            {isReceiver && isAccepted && (
                              <button
                                onClick={() => handleStartWork(h.id)}
                                className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-[11px] font-bold flex items-center space-x-1"
                              >
                                <Play className="w-3 h-3" />
                                <span>Start Work</span>
                              </button>
                            )}

                            {isReceiver && isInProgress && (
                              <button
                                onClick={() => handleCompleteWork(h.id)}
                                className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-[11px] font-bold flex items-center space-x-1"
                              >
                                <CheckSquare className="w-3 h-3" />
                                <span>Complete</span>
                              </button>
                            )}
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
      )}

      {/* VIEW 3: WORKFLOW HISTORY TIMELINE */}
      {subTab === 'history' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center space-x-2">
              <History className="w-4 h-4 text-slate-500" />
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                Real-Time Handover Audit Trail ({departmentHistory.length} events)
              </h3>
            </div>
          </div>

          {departmentHistory.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400">
              No handover history recorded for this department yet. Handover actions will record here automatically.
            </div>
          ) : (
            <div className="space-y-3">
              {departmentHistory.map((item) => (
                <div
                  key={item.id}
                  className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                >
                  <div className="space-y-1">
                    <div className="flex items-center space-x-2">
                      <span className="font-mono font-bold text-blue-700">{item.handoverId}</span>
                      <span className="font-bold text-slate-900">Machine {item.machineNumber}</span>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          item.action === 'ACCEPTED'
                            ? 'bg-emerald-100 text-emerald-800'
                            : item.action === 'RETURNED'
                            ? 'bg-red-100 text-red-800'
                            : 'bg-blue-100 text-blue-800'
                        }`}
                      >
                        {item.action}
                      </span>
                    </div>
                    <p className="text-slate-600">{item.remarks}</p>
                    <div className="text-[10px] text-slate-400 flex items-center space-x-3">
                      <span>From: {item.fromDepartment}</span>
                      <span>&rarr;</span>
                      <span>To: {item.toDepartment}</span>
                      <span>By: {item.employee || item.user}</span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-mono text-slate-500 text-[11px]">{item.date}</div>
                    <div className="text-[10px] text-slate-400">{item.time}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* DISPATCH / HANDOVER MODAL */}
      {showDispatchModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden text-slate-900 my-8">
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Send className="w-4 h-4 text-blue-400" />
                <div>
                  <h3 className="font-bold text-sm">Send Department Handover / Dispatch</h3>
                  <p className="text-xs text-slate-400">Formal stage transition with live notification to receiving team</p>
                </div>
              </div>
              <button onClick={() => setShowDispatchModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            {errorMessage && (
              <div className="m-4 p-3 bg-red-50 border border-red-200 text-red-800 text-xs rounded-xl flex items-center space-x-2">
                <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            <form onSubmit={handleDispatchSubmit} className="p-5 space-y-4 max-h-[80vh] overflow-y-auto custom-scrollbar">
              {/* Row 1: Handover ID & Machine Selection */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Handover ID <span className="text-slate-400">(Auto-generated)</span>
                  </label>
                  <input
                    type="text"
                    readOnly
                    value={generatedIdPreview}
                    className="w-full text-xs p-2.5 rounded-xl border border-slate-200 bg-slate-100 font-mono font-bold text-blue-700"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Machine Number <span className="text-red-500">*</span>
                  </label>
                  <select
                    required
                    value={hoMachineNo}
                    onChange={(e) => handleMachineChange(e.target.value)}
                    className="w-full text-xs p-2.5 rounded-xl border border-slate-300 font-bold bg-white"
                  >
                    <option value="">Select Machine...</option>
                    {dispatchEligibleMachines.map((m) => {
                      const displaySize = getMachineDisplaySize(m) !== 'Size not available' ? getMachineDisplaySize(m) : (m.machineSize || m.model || 'Standard');
                      return (
                        <option key={m.id || m.machineNumber} value={m.machineNumber}>
                          Machine {m.machineNumber} (Size: {displaySize}) - {m.currentDepartment || 'Authorized Work'}
                        </option>
                      );
                    })}
                  </select>
                </div>
              </div>

              {/* Row 2: Model & Project */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Model / Size
                  </label>
                  <input
                    type="text"
                    value={hoModel}
                    onChange={(e) => setHoModel(e.target.value)}
                    placeholder="e.g. ULTRA 686"
                    className="w-full text-xs p-2.5 rounded-xl border border-slate-300"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Project
                  </label>
                  <input
                    type="text"
                    value={hoProject}
                    onChange={(e) => setHoProject(e.target.value)}
                    placeholder="Project Name"
                    className="w-full text-xs p-2.5 rounded-xl border border-slate-300"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Customer
                  </label>
                  <input
                    type="text"
                    value={hoCustomer}
                    onChange={(e) => setHoCustomer(e.target.value)}
                    placeholder="Customer Name"
                    className="w-full text-xs p-2.5 rounded-xl border border-slate-300"
                  />
                </div>
              </div>

              {/* Row 3: Sending & Receiving Departments */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 bg-blue-50/60 rounded-xl border border-blue-100">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Current / Sending Department <span className="text-red-500">*</span>
                  </label>
                  {isAdmin ? (
                    <select
                      value={hoSendingDept}
                      onChange={(e) => setHoSendingDept(e.target.value)}
                      className="w-full text-xs p-2.5 rounded-xl border border-slate-300 bg-white"
                    >
                      {departments.map((d) => (
                        <option key={d.id} value={d.name}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      readOnly
                      value={hoSendingDept}
                      className="w-full text-xs p-2.5 rounded-xl border border-slate-200 bg-slate-100 font-bold"
                    />
                  )}
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Receiving Department <span className="text-red-500">*</span>
                  </label>
                  <select
                    required
                    value={hoReceivingDept}
                    onChange={(e) => setHoReceivingDept(e.target.value)}
                    className="w-full text-xs p-2.5 rounded-xl border border-blue-400 bg-white font-bold"
                  >
                    <option value="">Select Receiving Department...</option>
                    {departments
                      .filter((d) => !isDepartmentMatch(d.name, hoSendingDept))
                      .map((d) => (
                        <option key={d.id} value={d.name}>
                          {d.name}
                        </option>
                      ))}
                  </select>
                </div>
              </div>

              {/* Row 4: Process & Operation */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Process / Stage Name
                  </label>
                  <input
                    type="text"
                    value={hoProcess}
                    onChange={(e) => setHoProcess(e.target.value)}
                    placeholder="e.g. Granite Lapping / Base Assembly"
                    className="w-full text-xs p-2.5 rounded-xl border border-slate-300"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Part Code
                  </label>
                  <input
                    type="text"
                    value={hoPartCode}
                    onChange={(e) => setHoPartCode(e.target.value)}
                    placeholder="e.g. GB-686-01"
                    className="w-full text-xs p-2.5 rounded-xl border border-slate-300"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Operation / Work Completed &amp; Handed Over <span className="text-red-500">*</span>
                </label>
                <textarea
                  rows={2}
                  required
                  placeholder="Detail the exact operation completed, torque specs, readiness for next stage..."
                  value={hoOperation}
                  onChange={(e) => setHoOperation(e.target.value)}
                  className="w-full text-xs p-2.5 rounded-xl border border-slate-300"
                />
              </div>

              {/* Row 5: Quantity, Dates, Priority */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Quantity
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={hoQuantity}
                    onChange={(e) => setHoQuantity(Number(e.target.value))}
                    className="w-full text-xs p-2.5 rounded-xl border border-slate-300 font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Handover Date <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={hoHandoverDate}
                    onChange={(e) => setHoHandoverDate(e.target.value)}
                    className="w-full text-xs p-2.5 rounded-xl border border-slate-300 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Required Date
                  </label>
                  <input
                    type="date"
                    value={hoRequiredDate}
                    onChange={(e) => setHoRequiredDate(e.target.value)}
                    className="w-full text-xs p-2.5 rounded-xl border border-slate-300 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Priority
                  </label>
                  <select
                    value={hoPriority}
                    onChange={(e) => setHoPriority(e.target.value as any)}
                    className="w-full text-xs p-2.5 rounded-xl border border-slate-300 font-bold"
                  >
                    <option value="Low">Low</option>
                    <option value="Medium">Medium</option>
                    <option value="High">High</option>
                    <option value="Critical">Critical</option>
                  </select>
                </div>
              </div>

              {/* Row 6: Employee & Attachment */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Responsible Employee / Operator
                  </label>
                  <input
                    type="text"
                    value={hoEmployee}
                    onChange={(e) => setHoEmployee(e.target.value)}
                    className="w-full text-xs p-2.5 rounded-xl border border-slate-300"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Attachment / Drawing URL
                  </label>
                  <input
                    type="text"
                    placeholder="https://... or Drawing reference"
                    value={hoAttachment}
                    onChange={(e) => setHoAttachment(e.target.value)}
                    className="w-full text-xs p-2.5 rounded-xl border border-slate-300"
                  />
                </div>
              </div>

              {/* Row 7: Remarks */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Remarks / Special Instructions
                </label>
                <input
                  type="text"
                  placeholder="Special handling, calibration notes, shift instructions..."
                  value={hoRemarks}
                  onChange={(e) => setHoRemarks(e.target.value)}
                  className="w-full text-xs p-2.5 rounded-xl border border-slate-300"
                />
              </div>

              {/* Modal Actions */}
              <div className="pt-3 flex items-center justify-end space-x-2.5 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowDispatchModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingDispatch}
                  className="px-5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-xs flex items-center space-x-2"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{submittingDispatch ? 'Dispatching to Firestore...' : 'Confirm & Dispatch Handover'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* VIEW HANDOVER DETAILS MODAL */}
      {viewHandover && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden text-slate-900">
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <FileText className="w-4 h-4 text-blue-400" />
                <div>
                  <h3 className="font-bold text-sm">
                    Handover Details: {viewHandover.handoverId || viewHandover.id}
                  </h3>
                  <p className="text-[11px] text-slate-400">Machine {viewHandover.machineNumber}</p>
                </div>
              </div>
              <button onClick={() => setViewHandover(null)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-4 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">Originating Dept</span>
                  <span className="font-bold text-slate-900">
                    {viewHandover.fromDepartment || viewHandover.sendingDepartment}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">Receiving Dept</span>
                  <span className="font-bold text-blue-700">
                    {viewHandover.toDepartment || viewHandover.receivingDepartment}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">Status</span>
                  <span className="font-bold">{viewHandover.status}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">Priority</span>
                  <span className="font-bold">{viewHandover.priority || 'Medium'}</span>
                </div>
              </div>

              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-bold mb-1">Work Description</span>
                <p className="p-3 bg-slate-100 rounded-xl font-medium text-slate-800">
                  {viewHandover.operation || viewHandover.workDescription}
                </p>
              </div>

              {viewHandover.rejectionReason && (
                <div className="p-3 bg-red-50 rounded-xl border border-red-200 text-red-900">
                  <span className="text-red-700 font-bold block text-[10px] uppercase">Rejection Reason</span>
                  <p className="font-semibold">{viewHandover.rejectionReason}</p>
                  {viewHandover.correctiveActionRequired && (
                    <p className="mt-1 text-[11px] text-red-800">
                      <strong>Corrective Action:</strong> {viewHandover.correctiveActionRequired}
                    </p>
                  )}
                </div>
              )}

              <div className="grid grid-cols-3 gap-3 text-slate-600">
                <div>
                  <span className="text-[10px] text-slate-400 block">Handover Date</span>
                  <span className="font-mono font-bold">{viewHandover.handoverDate || viewHandover.date}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block">Required Date</span>
                  <span className="font-mono font-bold">{viewHandover.requiredDate || 'N/A'}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block">Quantity</span>
                  <span className="font-bold">{viewHandover.quantity || 1}</span>
                </div>
              </div>

              {viewHandover.remarks && (
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">Remarks</span>
                  <p className="text-slate-700">{viewHandover.remarks}</p>
                </div>
              )}

              <div className="pt-3 border-t border-slate-100 flex justify-end">
                <button
                  onClick={() => setViewHandover(null)}
                  className="px-4 py-1.5 bg-slate-900 text-white rounded-xl text-xs font-bold"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* REJECT / RETURN HANDOVER MODAL */}
      {returnHandoverItem && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-red-200 overflow-hidden text-slate-900">
            <div className="p-4 bg-red-600 text-white flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <RotateCcw className="w-4 h-4" />
                <h3 className="font-bold text-sm">Return Work to Originating Department</h3>
              </div>
              <button onClick={() => setReturnHandoverItem(null)} className="text-white hover:text-slate-200">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleReturnSubmit} className="p-5 space-y-3.5">
              <p className="text-xs text-slate-600">
                You are returning Machine <strong>{returnHandoverItem.machineNumber}</strong> (
                {returnHandoverItem.handoverId || returnHandoverItem.id}) back to{' '}
                <strong>{returnHandoverItem.fromDepartment || returnHandoverItem.sendingDepartment}</strong>.
              </p>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Rejection Reason <span className="text-red-500">*</span>
                </label>
                <select
                  required
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  className="w-full text-xs p-2.5 rounded-xl border border-slate-300 font-semibold"
                >
                  <option value="">Select Primary Reason...</option>
                  <option value="Dimension Out of Tolerance">Dimension Out of Tolerance</option>
                  <option value="Drawing Mismatch">Drawing Mismatch</option>
                  <option value="Material Issue">Material Issue</option>
                  <option value="Missing Parts / Components">Missing Parts / Components</option>
                  <option value="Surface Finish Issue">Surface Finish Issue</option>
                  <option value="Assembly Alignment Issue">Assembly Alignment Issue</option>
                  <option value="Damage / Scratch">Damage / Scratch</option>
                  <option value="Hole / Thread Issue">Hole / Thread Issue</option>
                  <option value="Incomplete Work">Incomplete Work</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Remarks / Defect Details
                </label>
                <textarea
                  rows={2}
                  placeholder="Describe specific finding or issue..."
                  value={returnRemarks}
                  onChange={(e) => setReturnRemarks(e.target.value)}
                  className="w-full text-xs p-2.5 rounded-xl border border-slate-300"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Required Corrective Action
                </label>
                <input
                  type="text"
                  placeholder="e.g. Re-machine mounting face, re-lap granite surface..."
                  value={correctiveActionRequired}
                  onChange={(e) => setCorrectiveActionRequired(e.target.value)}
                  className="w-full text-xs p-2.5 rounded-xl border border-slate-300"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setReturnHandoverItem(null)}
                  className="px-3.5 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingReturn}
                  className="px-4 py-1.5 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-xl shadow-xs"
                >
                  {submittingReturn ? 'Submitting Return...' : 'Confirm Return & Notify'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
