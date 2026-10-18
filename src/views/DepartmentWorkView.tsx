import React, { useState, useEffect } from 'react';
import {
  Building,
  Plus,
  Clock,
  CheckCircle2,
  AlertTriangle,
  ArrowRightLeft,
  Calendar,
  Filter,
  Search,
  FileSpreadsheet,
  X,
  MessageSquare,
  ShieldCheck,
} from 'lucide-react';
import {
  Department,
  DepartmentHandover,
  DepartmentWork,
  HandoverStatus,
  Machine,
  WorkStatus,
} from '../types';
import {
  addDepartmentWork,
  createDepartmentHandover,
  createQualityHandover,
  updateHandoverStatus,
} from '../services/db';
import { exportToExcel } from '../utils/excel';
import { useAuth } from '../context/AuthContext';
import { QualityHandoverModule } from '../components/QualityHandoverModule';
import { DepartmentHandoversView } from '../components/DepartmentHandoversView';
import { isDepartmentMatch } from '../utils/departmentUtils';
import { areMachineNumbersEqual, getMachineDisplaySize, normalizeMachineNumber } from '../utils/machineUtils';

interface DepartmentWorkViewProps {
  departments: Department[];
  departmentWork: DepartmentWork[];
  handovers: DepartmentHandover[];
  machines: Machine[];
  onOpenQuickUpdate: () => void;
  onOpenExcelImport: () => void;
  selectedDepartment?: string;
}

export const DepartmentWorkView: React.FC<DepartmentWorkViewProps> = ({
  departments,
  departmentWork,
  handovers,
  machines,
  onOpenQuickUpdate,
  onOpenExcelImport,
  selectedDepartment,
}) => {
  const { userProfile } = useAuth();
  const isAdmin = userProfile?.role === 'ADMIN';

  // Filter department: default to persistent department or user's department
  const [selectedDeptFilter, setSelectedDeptFilter] = useState(() => {
    if (selectedDepartment && selectedDepartment !== 'All Departments') {
      return selectedDepartment;
    }
    return isAdmin ? '' : userProfile?.department || '';
  });

  // Sync with persistent selected department
  useEffect(() => {
    if (selectedDepartment && selectedDepartment !== 'All Departments') {
      setSelectedDeptFilter(selectedDepartment);
    } else if (selectedDepartment === 'All Departments' && isAdmin) {
      setSelectedDeptFilter('');
    }
  }, [selectedDepartment, isAdmin]);

  const [activeTab, setActiveTab] = useState<
    'work' | 'pending' | 'completed' | 'delayed' | 'handovers' | 'quality_handovers'
  >('work');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals
  const [showAddWorkModal, setShowAddWorkModal] = useState(false);
  const [showHandoverModal, setShowHandoverModal] = useState(false);
  const [selectedHandoverForIssue, setSelectedHandoverForIssue] = useState<DepartmentHandover | null>(null);
  const [issueRemarks, setIssueRemarks] = useState('');

  // Add Work form states
  const [workTitle, setWorkTitle] = useState('');
  const [workDept, setWorkDept] = useState(userProfile?.department || '06-A Metal Shop');
  const [workMachineNo, setWorkMachineNo] = useState('');
  const [workModel, setWorkModel] = useState('');
  const [workQty, setWorkQty] = useState<number>(1);
  const [workDueDate, setWorkDueDate] = useState('');
  const [workPriority, setWorkPriority] = useState<'Low' | 'Medium' | 'High' | 'Critical'>('Medium');
  const [workAssignedTo, setWorkAssignedTo] = useState('');
  const [workRemarks, setWorkRemarks] = useState('');
  const [savingWork, setSavingWork] = useState(false);

  // Handover form states
  const [hoMachineNo, setHoMachineNo] = useState(machines[0]?.machineNumber || '');
  const [hoWorkDesc, setHoWorkDesc] = useState('');
  const [hoSendingDept, setHoSendingDept] = useState(userProfile?.department || '06-A Metal Shop');
  const [hoReceivingDept, setHoReceivingDept] = useState('08 Sub Assembly');
  const [hoRemarks, setHoRemarks] = useState('');
  const [savingHo, setSavingHo] = useState(false);

  // Filter scoped work
  const currentDeptScope = selectedDeptFilter || (!isAdmin ? userProfile?.department : '');

  const scopedWork = departmentWork.filter((w) => {
    if (currentDeptScope && !isDepartmentMatch(w.department, currentDeptScope)) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const match =
        w.title.toLowerCase().includes(q) ||
        (w.machineNumber && w.machineNumber.toLowerCase().includes(q)) ||
        (w.assignedTo && w.assignedTo.toLowerCase().includes(q));
      if (!match) return false;
    }
    return true;
  });

  const pendingList = scopedWork.filter((w) => w.status === 'Pending');
  const completedList = scopedWork.filter((w) => w.status === 'Completed');
  const delayedList = scopedWork.filter((w) => w.status === 'Delayed');
  const inProgressList = scopedWork.filter((w) => w.status === 'In Progress');

  // Handovers involving this department
  const relevantHandovers = handovers.filter((h) => {
    if (isAdmin && !currentDeptScope) return true;
    return (
      isDepartmentMatch(h.receivingDepartment, currentDeptScope) ||
      isDepartmentMatch(h.toDepartment, currentDeptScope) ||
      isDepartmentMatch(h.sendingDepartment, currentDeptScope) ||
      isDepartmentMatch(h.fromDepartment, currentDeptScope)
    );
  });

  const handleCreateWork = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!workTitle.trim()) return;

    setSavingWork(true);
    try {
      await addDepartmentWork(
        {
          title: workTitle.trim(),
          department: workDept,
          machineNumber: workMachineNo.trim() || undefined,
          machineModel: workModel.trim() || undefined,
          plannedQuantity: Number(workQty),
          actualQuantity: 0,
          status: 'Pending',
          priority: workPriority,
          assignedTo: workAssignedTo.trim() || undefined,
          dueDate: workDueDate || undefined,
          remarks: workRemarks.trim() || undefined,
          createdBy: userProfile?.displayName || userProfile?.email,
        },
        userProfile?.email
      );
      setShowAddWorkModal(false);
      setWorkTitle('');
      setWorkRemarks('');
    } catch (err) {
      console.error(err);
      alert('Failed to add work order.');
    } finally {
      setSavingWork(false);
    }
  };

  const handleCreateHandover = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hoMachineNo || !hoWorkDesc.trim()) return;

    setSavingHo(true);
    try {
      const mach = machines.find((m) => areMachineNumbersEqual(m.machineNumber, hoMachineNo));
      const machSize = mach ? (getMachineDisplaySize(mach) !== 'Size not available' ? getMachineDisplaySize(mach) : (mach.machineSize || mach.model || 'Standard')) : 'Standard';
      await createDepartmentHandover(
        {
          machineNumber: hoMachineNo,
          machineModel: machSize,
          machineSize: machSize,
          modelSize: machSize,
          project: mach?.project || '',
          customer: mach?.customer || '',
          workDescription: hoWorkDesc.trim(),
          sendingDepartment: hoSendingDept,
          receivingDepartment: hoReceivingDept,
          date: new Date().toISOString().split('T')[0],
          remarks: hoRemarks.trim() || '',
          status: 'Pending Acceptance',
          createdBy: userProfile?.displayName || userProfile?.email || 'Operator',
        },
        userProfile?.email
      );

      // If receiving department is Quality, also dispatch official QualityHandover
      if (
        hoReceivingDept.toLowerCase().includes('quality') ||
        hoReceivingDept === '04 Inward Quality' ||
        hoReceivingDept === '14 Calibration'
      ) {
        await createQualityHandover(
          {
            machineNumber: hoMachineNo,
            machineModel: machSize,
            project: mach?.project || '',
            customer: mach?.customer || '',
            sendingDepartment: hoSendingDept,
            receivingDepartment: hoReceivingDept,
            employee: userProfile?.displayName || userProfile?.email || 'Operator',
            work: hoWorkDesc.trim(),
            operation: hoWorkDesc.trim().slice(0, 80),
            quantity: 1,
            handoverDate: new Date().toISOString().split('T')[0],
            priority: 'Medium',
            remarks: hoRemarks.trim() || '',
          },
          userProfile?.email
        );
      }

      setShowHandoverModal(false);
      setHoWorkDesc('');
      setHoRemarks('');
    } catch (err) {
      console.error(err);
      alert('Failed to send handover.');
    } finally {
      setSavingHo(false);
    }
  };

  const handleHandoverAction = async (
    handoverId: string,
    action: HandoverStatus,
    details: { issueRemarks?: string } = {}
  ) => {
    try {
      await updateHandoverStatus(
        handoverId,
        action,
        {
          acceptedBy: userProfile?.displayName || userProfile?.email,
          ...details,
        },
        userProfile?.email
      );
    } catch (err) {
      console.error(err);
      alert('Failed to update handover status.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <Building className="w-6 h-6 text-indigo-600" />
            <span>Department Work &amp; Handover Management</span>
          </h2>
          <p className="text-xs sm:text-sm text-slate-500">
            Task execution, shift priority, 1-minute daily updates, and formal inter-department handovers
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onOpenQuickUpdate}
            className="text-xs font-bold px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg shadow-sm flex items-center gap-1.5 transition"
          >
            <Clock className="w-4 h-4" />
            <span>1-Min Update</span>
          </button>

          <button
            onClick={() => setShowHandoverModal(true)}
            className="text-xs font-bold px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-sm flex items-center gap-1.5 transition"
          >
            <ArrowRightLeft className="w-4 h-4" />
            <span>Send Handover</span>
          </button>

          <button
            onClick={() => setActiveTab('quality_handovers')}
            className="text-xs font-bold px-3 py-2 bg-indigo-700 hover:bg-indigo-800 text-white rounded-lg shadow-sm flex items-center gap-1.5 transition"
          >
            <ShieldCheck className="w-4 h-4 text-indigo-300" />
            <span>Quality Handover</span>
          </button>

          <button
            onClick={() => setShowAddWorkModal(true)}
            className="text-xs font-bold px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg shadow-sm flex items-center gap-1.5 transition"
          >
            <Plus className="w-4 h-4" />
            <span>Add Work Order</span>
          </button>
        </div>
      </div>

      {/* Department Filter & Stats Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
              Active Department Scope:
            </label>
            {isAdmin ? (
              <select
                value={selectedDeptFilter}
                onChange={(e) => setSelectedDeptFilter(e.target.value)}
                className="text-xs font-bold p-2 rounded-lg border border-slate-300 bg-white text-slate-900"
              >
                <option value="">All Departments (Admin Overview)</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.name}>
                    {d.name}
                  </option>
                ))}
              </select>
            ) : (
              <div className="text-xs font-bold bg-slate-100 text-slate-900 px-3 py-2 rounded-lg border border-slate-200">
                {userProfile?.department}
              </div>
            )}
          </div>
        </div>

        {/* Mini stats counters */}
        <div className="flex items-center gap-4 text-xs">
          <div className="text-center px-3 py-1 bg-slate-50 rounded-lg border border-slate-200">
            <span className="text-[10px] text-slate-400 block font-semibold">TOTAL</span>
            <span className="font-bold text-slate-900 text-sm">{scopedWork.length}</span>
          </div>
          <div className="text-center px-3 py-1 bg-emerald-50 rounded-lg border border-emerald-200">
            <span className="text-[10px] text-emerald-600 block font-semibold">COMPLETED</span>
            <span className="font-bold text-emerald-700 text-sm">{completedList.length}</span>
          </div>
          <div className="text-center px-3 py-1 bg-blue-50 rounded-lg border border-blue-200">
            <span className="text-[10px] text-blue-600 block font-semibold">IN PROGRESS</span>
            <span className="font-bold text-blue-700 text-sm">{inProgressList.length}</span>
          </div>
          <div className="text-center px-3 py-1 bg-red-50 rounded-lg border border-red-200">
            <span className="text-[10px] text-red-600 block font-semibold">DELAYED</span>
            <span className="font-bold text-red-700 text-sm">{delayedList.length}</span>
          </div>
        </div>
      </div>

      {/* Navigation tabs */}
      <div className="flex border-b border-slate-200 space-x-6 text-sm font-semibold">
        <button
          onClick={() => setActiveTab('work')}
          className={`pb-3 border-b-2 transition ${
            activeTab === 'work'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          All Department Work ({scopedWork.length})
        </button>

        <button
          onClick={() => setActiveTab('pending')}
          className={`pb-3 border-b-2 transition ${
            activeTab === 'pending'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Pending / In Progress ({pendingList.length + inProgressList.length})
        </button>

        <button
          onClick={() => setActiveTab('delayed')}
          className={`pb-3 border-b-2 transition ${
            activeTab === 'delayed'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Delayed ({delayedList.length})
        </button>

        <button
          onClick={() => setActiveTab('completed')}
          className={`pb-3 border-b-2 transition ${
            activeTab === 'completed'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Completed ({completedList.length})
        </button>

        <button
          onClick={() => setActiveTab('handovers')}
          className={`pb-3 border-b-2 transition ${
            activeTab === 'handovers'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Shop Handovers ({relevantHandovers.length})
        </button>

        <button
          onClick={() => setActiveTab('quality_handovers')}
          className={`pb-3 border-b-2 transition flex items-center space-x-1.5 ${
            activeTab === 'quality_handovers'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <ShieldCheck className="w-4 h-4 text-indigo-600" />
          <span>Quality Handovers</span>
        </button>
      </div>

      {/* Main Work Table View */}
      {activeTab !== 'handovers' && activeTab !== 'quality_handovers' && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
          {scopedWork.length === 0 ? (
            <div className="p-12 text-center text-xs text-slate-400">
              No work orders recorded for {currentDeptScope || 'selected department'} yet. Click &ldquo;Add Work Order&rdquo;.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[10px]">
                  <tr>
                    <th className="p-3">Work Title / Task</th>
                    <th className="p-3">Department</th>
                    <th className="p-3">Machine</th>
                    <th className="p-3">Machine Size</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">Assigned To</th>
                    <th className="p-3">Due Date</th>
                    <th className="p-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {scopedWork
                    .filter((w) => {
                      if (activeTab === 'pending') return w.status === 'Pending' || w.status === 'In Progress';
                      if (activeTab === 'delayed') return w.status === 'Delayed';
                      if (activeTab === 'completed') return w.status === 'Completed';
                      return true;
                    })
                    .map((w) => {
                      const matched = machines.find((m) => areMachineNumbersEqual(m.machineNumber, w.machineNumber));
                      const resolvedSize = getMachineDisplaySize(matched) !== 'Size not available'
                        ? getMachineDisplaySize(matched)
                        : (w.machineSize || w.machineModel || w.specification || matched?.model || '-');
                      return (
                        <tr key={w.id} className="hover:bg-slate-50 transition">
                          <td className="p-3">
                            <div className="font-bold text-slate-900">{w.title}</div>
                            {w.delayReason && (
                              <div className="text-[10px] text-red-600 mt-0.5 font-medium">
                                Delayed: {w.delayReason}
                              </div>
                            )}
                          </td>
                          <td className="p-3 text-slate-700">
                            <span className="font-mono text-[11px] bg-slate-100 px-1.5 py-0.5 rounded">
                              {w.department}
                            </span>
                          </td>
                          <td className="p-3 text-slate-800 font-bold">
                            {w.machineNumber ? `Machine ${w.machineNumber}` : '-'}
                          </td>
                          <td className="p-3 text-slate-800 font-semibold">
                            {resolvedSize}
                          </td>
                        <td className="p-3">
                          <span
                            className={`inline-block px-2.5 py-0.5 rounded text-[10px] font-bold ${
                              w.status === 'Completed'
                                ? 'bg-emerald-100 text-emerald-800'
                                : w.status === 'Delayed'
                                ? 'bg-red-100 text-red-800'
                                : w.status === 'In Progress'
                                ? 'bg-blue-100 text-blue-800'
                                : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {w.status}
                          </span>
                        </td>
                        <td className="p-3 text-slate-600">{w.assignedTo || 'Unassigned'}</td>
                        <td className="p-3 text-slate-600 font-mono text-[11px]">{w.dueDate || '-'}</td>
                        <td className="p-3 text-right">
                          <button
                            onClick={onOpenQuickUpdate}
                            className="text-xs text-blue-600 hover:text-blue-800 font-bold"
                          >
                            Update &rarr;
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
      )}

      {/* TAB: QUALITY HANDOVERS */}
      {activeTab === 'quality_handovers' && (
        <QualityHandoverModule
          currentDepartment={currentDeptScope || userProfile?.department || '06-A Metal Shop'}
          departments={departments}
          machines={machines}
        />
      )}
      {activeTab === 'handovers' && (
        <DepartmentHandoversView
          currentDepartment={currentDeptScope || userProfile?.department || '06-A Metal Shop'}
          departments={departments}
          machines={machines}
          handovers={handovers}
        />
      )}

      {/* Add Department Work Modal */}
      {showAddWorkModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200 overflow-hidden text-slate-900">
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
              <h3 className="font-bold text-sm">Add Department Work Order</h3>
              <button onClick={() => setShowAddWorkModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateWork} className="p-5 space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Work Title / Task Description <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Guard fitment and align bearing brackets"
                  value={workTitle}
                  onChange={(e) => setWorkTitle(e.target.value)}
                  className="w-full text-xs p-2 rounded-lg border border-slate-300"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Department <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={workDept}
                    onChange={(e) => setWorkDept(e.target.value)}
                    className="w-full text-xs p-2 rounded-lg border border-slate-300"
                  >
                    {departments.map((d) => (
                      <option key={d.id} value={d.name}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Machine Number
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 2523"
                    value={workMachineNo}
                    onChange={(e) => setWorkMachineNo(e.target.value)}
                    className="w-full text-xs p-2 rounded-lg border border-slate-300"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Target Qty
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={workQty}
                    onChange={(e) => setWorkQty(Number(e.target.value))}
                    className="w-full text-xs p-2 rounded-lg border border-slate-300"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Priority
                  </label>
                  <select
                    value={workPriority}
                    onChange={(e) => setWorkPriority(e.target.value as any)}
                    className="w-full text-xs p-2 rounded-lg border border-slate-300"
                  >
                    <option value="Low">Low</option>
                    <option value="Medium">Medium</option>
                    <option value="High">High</option>
                    <option value="Critical">Critical</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Due Date
                  </label>
                  <input
                    type="date"
                    value={workDueDate}
                    onChange={(e) => setWorkDueDate(e.target.value)}
                    className="w-full text-xs p-2 rounded-lg border border-slate-300"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Assigned Operator
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Ramesh Kumar"
                    value={workAssignedTo}
                    onChange={(e) => setWorkAssignedTo(e.target.value)}
                    className="w-full text-xs p-2 rounded-lg border border-slate-300"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Remarks
                  </label>
                  <input
                    type="text"
                    placeholder="Shift instructions..."
                    value={workRemarks}
                    onChange={(e) => setWorkRemarks(e.target.value)}
                    className="w-full text-xs p-2 rounded-lg border border-slate-300"
                  />
                </div>
              </div>

              <div className="pt-2 flex justify-end space-x-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddWorkModal(false)}
                  className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingWork}
                  className="px-4 py-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg"
                >
                  {savingWork ? 'Saving...' : 'Assign Work'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Send Handover Modal */}
      {showHandoverModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200 overflow-hidden text-slate-900">
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
              <div>
                <h3 className="font-bold text-sm">Send Department Handover</h3>
                <p className="text-xs text-slate-400">Formal stage transition with notification dispatch</p>
              </div>
              <button onClick={() => setShowHandoverModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateHandover} className="p-5 space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Machine Number <span className="text-red-500">*</span>
                </label>
                {machines.length === 0 ? (
                  <input
                    type="text"
                    required
                    placeholder="e.g. 2523"
                    value={hoMachineNo}
                    onChange={(e) => setHoMachineNo(e.target.value)}
                    className="w-full text-xs p-2 rounded-lg border border-slate-300 font-bold"
                  />
                ) : (
                  <select
                    value={hoMachineNo}
                    onChange={(e) => setHoMachineNo(e.target.value)}
                    className="w-full text-xs p-2 rounded-lg border border-slate-300 font-bold"
                  >
                    {machines.map((m) => {
                      const displaySize = getMachineDisplaySize(m) !== 'Size not available' ? getMachineDisplaySize(m) : (m.machineSize || m.model || 'Standard');
                      return (
                        <option key={m.id || m.machineNumber} value={m.machineNumber}>
                          Machine {m.machineNumber} (Size: {displaySize})
                        </option>
                      );
                    })}
                  </select>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Work Completed &amp; Handed Over <span className="text-red-500">*</span>
                </label>
                <textarea
                  rows={2}
                  required
                  placeholder="e.g. Granite base lapping complete, ready for bridge assembly..."
                  value={hoWorkDesc}
                  onChange={(e) => setHoWorkDesc(e.target.value)}
                  className="w-full text-xs p-2 rounded-lg border border-slate-300"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Sending Department
                  </label>
                  <select
                    value={hoSendingDept}
                    onChange={(e) => setHoSendingDept(e.target.value)}
                    className="w-full text-xs p-2 rounded-lg border border-slate-300"
                  >
                    {departments.map((d) => (
                      <option key={d.id} value={d.name}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Receiving Department <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={hoReceivingDept}
                    onChange={(e) => setHoReceivingDept(e.target.value)}
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

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Remarks / Special Instructions
                </label>
                <input
                  type="text"
                  placeholder="e.g. Handle with care, granite surface calibrated..."
                  value={hoRemarks}
                  onChange={(e) => setHoRemarks(e.target.value)}
                  className="w-full text-xs p-2 rounded-lg border border-slate-300"
                />
              </div>

              <div className="pt-2 flex justify-end space-x-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowHandoverModal(false)}
                  className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingHo}
                  className="px-4 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg"
                >
                  {savingHo ? 'Sending...' : 'Dispatch Handover'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Raise Issue on Handover Modal */}
      {selectedHandoverForIssue && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-red-200 overflow-hidden text-slate-900">
            <div className="p-4 bg-red-600 text-white flex items-center justify-between">
              <h3 className="font-bold text-sm">Raise Issue on Handover</h3>
              <button onClick={() => setSelectedHandoverForIssue(null)} className="text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-3.5">
              <p className="text-xs text-slate-600">
                State why Machine {selectedHandoverForIssue.machineNumber} handover cannot be accepted from {selectedHandoverForIssue.sendingDepartment}:
              </p>
              <textarea
                rows={3}
                required
                placeholder="e.g. Missing bolts, drawing mismatch, incomplete deburring..."
                value={issueRemarks}
                onChange={(e) => setIssueRemarks(e.target.value)}
                className="w-full text-xs p-2 rounded-lg border border-slate-300"
              />

              <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setSelectedHandoverForIssue(null)}
                  className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    handleHandoverAction(selectedHandoverForIssue.id, 'Issue Raised', { issueRemarks });
                    setSelectedHandoverForIssue(null);
                  }}
                  className="px-4 py-1.5 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-lg"
                >
                  Send Back / Flag Issue
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
