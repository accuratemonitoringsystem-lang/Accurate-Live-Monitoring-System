import React from 'react';
import {
  X,
  History,
  CheckCircle2,
  Clock,
  ArrowRight,
  Building,
  User,
  AlertTriangle,
  Send,
  Calendar,
  Layers,
  ChevronRight,
} from 'lucide-react';
import { Machine, DepartmentHandover } from '../types';
import {
  getMachineRoute,
  findDepartmentIndexInRoute,
  calculateDepartmentDuration,
} from '../utils/routeUtils';
import { isDepartmentMatch } from '../utils/departmentUtils';

interface MachineMovementTimelineModalProps {
  isOpen: boolean;
  machine: Machine | null;
  onClose: () => void;
  handovers?: DepartmentHandover[];
}

export const MachineMovementTimelineModal: React.FC<MachineMovementTimelineModalProps> = ({
  isOpen,
  machine,
  onClose,
  handovers = [],
}) => {
  if (!isOpen || !machine) return null;

  const route = getMachineRoute(machine);
  const currentDeptIdx = findDepartmentIndexInRoute(machine.currentDepartment, route);
  const historyList = machine.history || [];

  // Filter relevant handovers for this machine
  const machineHandovers = handovers
    .filter((h) => h.machineNumber === machine.machineNumber)
    .sort(
      (a, b) =>
        new Date(a.createdAt || a.handoverDate || '').getTime() -
        new Date(b.createdAt || b.handoverDate || '').getTime()
    );

  // Format date helper
  const formatDate = (d?: string) => {
    if (!d) return '-';
    try {
      const dt = new Date(d);
      if (isNaN(dt.getTime())) return d;
      return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch {
      return d;
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl max-w-3xl w-full my-8 shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="bg-slate-900 text-white p-5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-600/30 border border-blue-500/40 rounded-2xl">
              <History className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold text-blue-400 uppercase tracking-widest">
                  Machine Movement Timeline
                </span>
                <span className="text-[10px] px-2 py-0.5 bg-slate-800 text-slate-300 font-mono rounded">
                  {machine.priority || 'P01'}
                </span>
              </div>
              <h2 className="text-lg font-black text-white flex items-center gap-2">
                <span>CMM {machine.machineNumber}</span>
                <span className="text-slate-400 text-sm font-medium">
                  ({machine.specification || machine.model || machine.machineModel || 'Standard'})
                </span>
              </h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Status & KPIs Bar */}
        <div className="bg-slate-50 border-b border-slate-200 px-6 py-3 shrink-0 grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400 block">Current Location</span>
            <span className="font-bold text-blue-700">{machine.currentDepartment}</span>
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400 block">Current Status</span>
            <span className="font-bold text-slate-800">{machine.currentStatus || machine.status || 'In Progress'}</span>
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400 block">Work Progress</span>
            <span className="font-bold text-emerald-600">
              {machine.progress !== undefined ? machine.progress : machine.overallProgressPercent || 0}%
            </span>
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400 block">Next Station</span>
            <span className="font-bold text-purple-700">
              {machine.nextDepartment || (currentDeptIdx >= 0 && currentDeptIdx < route.length - 1 ? route[currentDeptIdx + 1] : 'Dispatch')}
            </span>
          </div>
        </div>

        {/* Scrollable Timeline Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          <div>
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-400 mb-4">
              Sequential Process Journey ({route.length} Departments)
            </h3>

            {/* Department-by-department Timeline Cards */}
            <div className="space-y-3 relative before:absolute before:left-4 before:top-4 before:bottom-4 before:w-0.5 before:bg-slate-200">
              {route.map((deptName, idx) => {
                const isCurrent = idx === currentDeptIdx;
                const isPassed = currentDeptIdx >= 0 ? idx < currentDeptIdx : false;
                const isUpcoming = currentDeptIdx >= 0 ? idx > currentDeptIdx : true;

                // Find matching history entry for this department
                const deptHist = historyList.find(
                  (h) => isDepartmentMatch(h.department, deptName) || h.department?.toLowerCase().includes(deptName.toLowerCase())
                );

                // Find matching handover where this department was sender
                const deptHandover = machineHandovers.find(
                  (h) => isDepartmentMatch(h.fromDepartment || h.sendingDepartment, deptName)
                );

                // Find matching handover where this department was receiver
                const incomingHandover = machineHandovers.find(
                  (h) => isDepartmentMatch(h.toDepartment || h.receivingDepartment, deptName)
                );

                const receivedDate =
                  deptHist?.receivedDate ||
                  deptHist?.startDate ||
                  incomingHandover?.acceptedDate ||
                  incomingHandover?.handoverDate ||
                  (idx === 0 ? machine.assignedDate || machine.plannedStartDate : undefined);

                const completedDate =
                  deptHist?.completionDate ||
                  deptHist?.date ||
                  deptHandover?.acceptedDate ||
                  deptHandover?.handoverDate;

                const durationStr =
                  deptHist?.duration ||
                  (receivedDate && completedDate
                    ? calculateDepartmentDuration(receivedDate, completedDate)
                    : isCurrent && receivedDate
                    ? `${calculateDepartmentDuration(receivedDate)} (ongoing)`
                    : '-');

                const nextDeptName = idx < route.length - 1 ? route[idx + 1] : 'Dispatch';

                return (
                  <div
                    key={`${deptName}-${idx}`}
                    className={`relative pl-10 transition-all ${
                      isCurrent
                        ? 'scale-[1.01]'
                        : ''
                    }`}
                  >
                    {/* Timeline Node Bullet */}
                    <div
                      className={`absolute left-2.5 -translate-x-1/2 top-4 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold border-2 transition-colors ${
                        isPassed
                          ? 'bg-emerald-600 border-emerald-600 text-white'
                          : isCurrent
                          ? 'bg-blue-600 border-blue-600 text-white ring-4 ring-blue-100'
                          : 'bg-white border-slate-300 text-slate-400'
                      }`}
                    >
                      {isPassed ? '✓' : idx + 1}
                    </div>

                    {/* Department Card */}
                    <div
                      className={`p-4 rounded-2xl border transition-all ${
                        isCurrent
                          ? 'bg-blue-50/70 border-blue-300 shadow-sm'
                          : isPassed
                          ? 'bg-white border-slate-200'
                          : 'bg-slate-50/60 border-slate-200 text-slate-400'
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-bold text-slate-400">
                            {idx + 1}.
                          </span>
                          <span className={`font-black text-sm ${isCurrent ? 'text-blue-900' : isPassed ? 'text-slate-900' : 'text-slate-500'}`}>
                            {deptName}
                          </span>
                        </div>

                        {/* Status Badge */}
                        <div>
                          {isPassed && (
                            <span className="px-2.5 py-0.5 bg-emerald-100 text-emerald-800 rounded-full font-bold text-[10px] border border-emerald-200 flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                              <span>Completed</span>
                            </span>
                          )}
                          {isCurrent && (
                            <span className="px-2.5 py-0.5 bg-blue-100 text-blue-800 rounded-full font-bold text-[10px] border border-blue-200 flex items-center gap-1 animate-pulse">
                              <span className="w-1.5 h-1.5 rounded-full bg-blue-600" />
                              <span>In Progress ({machine.progress !== undefined ? machine.progress : machine.overallProgressPercent || 0}%)</span>
                            </span>
                          )}
                          {isUpcoming && (
                            <span className="px-2.5 py-0.5 bg-slate-100 text-slate-500 rounded-full font-medium text-[10px] border border-slate-200">
                              Upcoming Station
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Details Grid */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs mt-3 pt-3 border-t border-slate-100">
                        <div>
                          <span className="text-[10px] text-slate-400 block font-medium">Started Date:</span>
                          <span className="font-mono font-bold text-slate-700">
                            {receivedDate ? formatDate(receivedDate) : '-'}
                          </span>
                        </div>

                        <div>
                          <span className="text-[10px] text-slate-400 block font-medium">
                            {isPassed ? 'Completed Date:' : isCurrent ? 'Expected Completion:' : 'Status:'}
                          </span>
                          <span className="font-mono font-bold text-slate-700">
                            {isPassed
                              ? completedDate ? formatDate(completedDate) : 'Completed'
                              : isCurrent
                              ? machine.targetCompletionDate || machine.expectedCompletionDate ? formatDate(machine.targetCompletionDate || machine.expectedCompletionDate) : 'In Progress'
                              : 'Waiting in Route'}
                          </span>
                        </div>

                        <div>
                          <span className="text-[10px] text-slate-400 block font-medium">Duration:</span>
                          <span className="font-mono font-bold text-slate-700">
                            {durationStr}
                          </span>
                        </div>

                        <div>
                          <span className="text-[10px] text-slate-400 block font-medium">
                            {isPassed ? 'Handed Over To:' : 'Next Station:'}
                          </span>
                          <span className="font-bold text-purple-700 truncate block">
                            {isPassed
                              ? deptHist?.handedOverTo || nextDeptName
                              : nextDeptName}
                          </span>
                        </div>
                      </div>

                      {/* Delay & Reason if any */}
                      {((deptHist?.delayDays && deptHist.delayDays > 0) || (deptHist?.delayReason) || (isCurrent && ((machine.delayDays && machine.delayDays > 0) || machine.delayReason))) && (
                        <div className="mt-2.5 pt-2 border-t border-amber-100 bg-amber-50/70 -mx-4 -mb-4 p-3 rounded-b-2xl flex flex-wrap items-center gap-3 text-[11px] text-amber-900">
                          <div className="flex items-center gap-1 font-bold text-amber-800">
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                            <span>Delay: {deptHist?.delayDays ?? (isCurrent ? machine.delayDays : 0)} days</span>
                          </div>
                          {(deptHist?.delayReason || (isCurrent && machine.delayReason)) && (
                            <div className="text-amber-800">
                              <span className="font-bold">Reason: </span>
                              <span className="px-1.5 py-0.5 bg-amber-200/80 rounded font-semibold text-[10px]">
                                {deptHist?.delayReason || (isCurrent && machine.delayReason)}
                              </span>
                            </div>
                          )}
                          {(deptHist?.delayRemarks || (isCurrent && machine.delayRemarks)) && (
                            <span className="text-amber-700 italic text-[10px]">
                              ({deptHist?.delayRemarks || (isCurrent && machine.delayRemarks)})
                            </span>
                          )}
                        </div>
                      )}

                      {/* Quality Status if any */}
                      {(deptHist?.qualityStatus || (isCurrent && machine.qualityStatus)) && (
                        <div className="mt-2 text-[10px] flex items-center gap-1.5">
                          <span className="font-bold text-slate-500">Quality Status:</span>
                          <span className={`px-2 py-0.5 rounded font-bold ${
                            (deptHist?.qualityStatus || machine.qualityStatus) === 'ACCEPTED'
                              ? 'bg-emerald-100 text-emerald-800'
                              : (deptHist?.qualityStatus || machine.qualityStatus) === 'REJECTED'
                              ? 'bg-red-100 text-red-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}>
                            {deptHist?.qualityStatus || machine.qualityStatus}
                          </span>
                        </div>
                      )}

                      {/* Remarks if any */}
                      {(deptHist?.remarks || deptHandover?.remarks) && (
                        <div className="mt-2.5 pt-2 border-t border-slate-100 text-[11px] text-slate-600 flex items-start gap-1.5">
                          <span className="font-bold text-slate-400 shrink-0">Notes:</span>
                          <span className="italic">{deptHist?.remarks || deptHandover?.remarks}</span>
                        </div>
                      )}
                    </div>

                    {/* Downward indicator to next department */}
                    {idx < route.length - 1 && (
                      <div className="pl-6 py-1 flex items-center text-slate-300">
                        <span className="text-sm font-bold font-mono">↓</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Granular Handover History Table */}
          {machineHandovers.length > 0 && (
            <div className="pt-4 border-t border-slate-200">
              <h4 className="text-xs font-black uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-1.5">
                <Send className="w-3.5 h-3.5 text-purple-600" />
                <span>Inter-Department Handover Log ({machineHandovers.length})</span>
              </h4>

              <div className="bg-slate-50 rounded-2xl border border-slate-200 overflow-hidden text-xs">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-100 text-slate-500 text-[10px] font-bold uppercase border-b border-slate-200">
                      <th className="p-2.5 pl-3">Handover ID</th>
                      <th className="p-2.5">From</th>
                      <th className="p-2.5">To</th>
                      <th className="p-2.5">Date</th>
                      <th className="p-2.5">Status</th>
                      <th className="p-2.5 pr-3">Remarks</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {machineHandovers.map((h) => (
                      <tr key={h.id} className="hover:bg-white transition-colors">
                        <td className="p-2.5 pl-3 font-mono font-bold text-purple-700">
                          {h.handoverId}
                        </td>
                        <td className="p-2.5 font-bold text-slate-800">
                          {h.fromDepartment || h.sendingDepartment}
                        </td>
                        <td className="p-2.5 font-bold text-blue-700">
                          {h.toDepartment || h.receivingDepartment}
                        </td>
                        <td className="p-2.5 font-mono text-slate-600">
                          {formatDate(h.handoverDate || h.date)}
                        </td>
                        <td className="p-2.5">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            h.status === 'ACCEPTED'
                              ? 'bg-emerald-100 text-emerald-800'
                              : h.status === 'RETURNED'
                              ? 'bg-rose-100 text-rose-800'
                              : 'bg-purple-100 text-purple-800'
                          }`}>
                            {h.status}
                          </span>
                        </td>
                        <td className="p-2.5 pr-3 text-slate-500 max-w-xs truncate">
                          {h.remarks || h.operation || '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="bg-slate-50 border-t border-slate-200 px-6 py-3 flex items-center justify-end shrink-0">
          <button
            onClick={onClose}
            className="px-5 py-2 text-xs font-bold bg-slate-900 hover:bg-slate-800 text-white rounded-xl shadow-xs transition-colors"
          >
            Close Timeline
          </button>
        </div>
      </div>
    </div>
  );
};
