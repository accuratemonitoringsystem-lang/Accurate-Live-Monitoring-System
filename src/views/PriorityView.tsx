import React from 'react';
import {
  Flame,
  AlertTriangle,
  Clock,
  CheckSquare,
  ArrowRightLeft,
  Calendar,
  CheckCircle2,
} from 'lucide-react';
import {
  DepartmentHandover,
  DepartmentWork,
  Machine,
  QualityRejection,
} from '../types';

interface PriorityViewProps {
  departmentWork: DepartmentWork[];
  qualityRejections: QualityRejection[];
  departmentHandovers: DepartmentHandover[];
  machines: Machine[];
  onOpenQuickUpdate: () => void;
  onSelectView: (view: string) => void;
}

export const PriorityView: React.FC<PriorityViewProps> = ({
  departmentWork,
  qualityRejections,
  departmentHandovers,
  machines,
  onOpenQuickUpdate,
  onSelectView,
}) => {
  const todayStr = new Date().toISOString().split('T')[0];

  // 1. Delayed Work
  const delayedWork = departmentWork.filter((w) => w.status === 'Delayed');

  // 2. Work Due Today or Overdue
  const dueTodayOrOverdue = departmentWork.filter(
    (w) => w.dueDate && w.dueDate <= todayStr && w.status !== 'Completed'
  );

  // 3. High/Critical Priority Pending Work
  const criticalWork = departmentWork.filter(
    (w) => (w.priority === 'Critical' || w.priority === 'High') && w.status !== 'Completed'
  );

  // 4. Active Quality Rejections
  const activeRejections = qualityRejections.filter(
    (r) => r.status !== 'Accepted' && r.status !== 'Closed'
  );

  // 5. Pending Handovers
  const pendingHandovers = departmentHandovers.filter((h) => h.status === 'Pending Acceptance');

  const totalUrgent =
    delayedWork.length +
    dueTodayOrOverdue.length +
    criticalWork.length +
    activeRejections.length +
    pendingHandovers.length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <Flame className="w-6 h-6 text-amber-500 fill-amber-500" />
            <span>Today&apos;s Priority &amp; Urgent Actions</span>
          </h2>
          <p className="text-xs sm:text-sm text-slate-500">
            Consolidated view of overdue items, shop floor delays, quality rejections, and pending handovers
          </p>
        </div>

        <button
          onClick={onOpenQuickUpdate}
          className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-4 py-2 rounded-lg shadow-sm flex items-center gap-1.5 transition"
        >
          <Clock className="w-4 h-4" />
          <span>Post Fast Shift Update</span>
        </button>
      </div>

      {totalUrgent === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center max-w-xl mx-auto shadow-xs">
          <div className="w-14 h-14 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-8 h-8" />
          </div>
          <h3 className="text-base font-bold text-slate-900">Zero Priority Bottlenecks</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            No work orders are delayed, overdue, or held for quality rework today. All active operations are progressing smoothly.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Section 1: Delayed Work */}
          {delayedWork.length > 0 && (
            <div className="bg-white rounded-2xl border border-red-200 p-5 shadow-xs">
              <div className="flex items-center justify-between mb-3 border-b border-red-100 pb-2">
                <div className="flex items-center gap-2 text-red-900 font-bold text-sm">
                  <AlertTriangle className="w-4 h-4 text-red-600" />
                  <span>Delayed Work Orders ({delayedWork.length})</span>
                </div>
                <span className="text-[11px] font-semibold text-red-700 bg-red-100 px-2.5 py-0.5 rounded-full">
                  Immediate Shift Rescheduling Needed
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {delayedWork.map((w) => (
                  <div key={w.id} className="p-3.5 bg-red-50/50 rounded-xl border border-red-200">
                    <div className="font-bold text-xs text-slate-900">{w.title}</div>
                    <div className="text-[11px] text-slate-600 mt-1">
                      Dept: <strong>{w.department}</strong> {w.machineNumber ? `• Machine ${w.machineNumber}` : ''}
                    </div>
                    <div className="mt-2 text-xs text-red-800 bg-white p-2 rounded border border-red-200">
                      <strong>Reason:</strong> {w.delayReason || 'Not stated'}
                      {w.revisedDate && <div className="text-[10px] text-red-600 mt-0.5">Revised Date: {w.revisedDate}</div>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Section 2: Active Quality Rejections */}
          {activeRejections.length > 0 && (
            <div className="bg-white rounded-2xl border border-amber-200 p-5 shadow-xs">
              <div className="flex items-center justify-between mb-3 border-b border-amber-100 pb-2">
                <div className="flex items-center gap-2 text-amber-900 font-bold text-sm">
                  <CheckSquare className="w-4 h-4 text-amber-600" />
                  <span>Active Quality Rejections ({activeRejections.length})</span>
                </div>
                <button
                  onClick={() => onSelectView('quality')}
                  className="text-xs font-bold text-amber-800 hover:underline"
                >
                  Go to Quality Module &rarr;
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {activeRejections.map((r) => (
                  <div key={r.id} className="p-3.5 bg-amber-50/50 rounded-xl border border-amber-200">
                    <div className="flex justify-between items-start">
                      <span className="font-bold text-xs text-slate-900">Machine {r.machineNumber}</span>
                      <span className="text-[10px] font-bold bg-amber-200 text-amber-900 px-2 py-0.5 rounded">
                        {r.status}
                      </span>
                    </div>
                    <div className="text-xs text-slate-700 font-medium mt-1">{r.operationName}</div>
                    <div className="text-[11px] text-slate-600 mt-0.5">
                      Concerned Dept: <strong>{r.concernedDepartment}</strong>
                    </div>
                    <div className="mt-2 text-xs text-amber-900 bg-white p-2 rounded border border-amber-200">
                      <strong>Finding:</strong> {r.rejectionReason}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Section 3: Pending Handovers */}
          {pendingHandovers.length > 0 && (
            <div className="bg-white rounded-2xl border border-blue-200 p-5 shadow-xs">
              <div className="flex items-center justify-between mb-3 border-b border-blue-100 pb-2">
                <div className="flex items-center gap-2 text-blue-900 font-bold text-sm">
                  <ArrowRightLeft className="w-4 h-4 text-blue-600" />
                  <span>Pending Department Handovers ({pendingHandovers.length})</span>
                </div>
                <button
                  onClick={() => onSelectView('department_work')}
                  className="text-xs font-bold text-blue-700 hover:underline"
                >
                  Review Handovers &rarr;
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {pendingHandovers.map((h) => (
                  <div key={h.id} className="p-3.5 bg-blue-50/50 rounded-xl border border-blue-200">
                    <div className="font-bold text-xs text-slate-900">
                      Machine {h.machineNumber}
                    </div>
                    <div className="text-xs text-slate-700 mt-1">{h.workDescription}</div>
                    <div className="text-[11px] text-slate-600 mt-2 flex items-center justify-between">
                      <span>From: <strong>{h.sendingDepartment}</strong></span>
                      <span>To: <strong className="text-blue-700">{h.receivingDepartment}</strong></span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
