import React, { useState, useMemo } from 'react';
import {
  FileSpreadsheet,
  Upload,
  Download,
  Calendar,
  Clock,
  CheckCircle2,
  AlertTriangle,
  HelpCircle,
  FileCheck,
  Building,
  ShieldCheck,
  Boxes,
  ArrowRight,
  TrendingUp,
} from 'lucide-react';
import { MonthlyPlan, WeeklyPlan, Machine, Department } from '../../types';
import { downloadFourColumnPlanTemplate } from '../../services/adminPlanImportService';
import { AdminPlanExcelImportModal } from './AdminPlanExcelImportModal';

interface PlanExcelImportViewProps {
  monthlyPlans: MonthlyPlan[];
  weeklyPlans: WeeklyPlan[];
  machines: Machine[];
  departments: Department[];
  onNavigateToPlan?: (planType: 'monthly' | 'weekly' | 'plan_vs_actual') => void;
  onOpenImportModal?: (type: 'monthly' | 'weekly') => void;
}

export const PlanExcelImportView: React.FC<PlanExcelImportViewProps> = ({
  monthlyPlans,
  weeklyPlans,
  machines,
  departments,
  onNavigateToPlan,
  onOpenImportModal,
}) => {
  const [modalOpen, setModalOpen] = useState(false);
  const [activePlanType, setActivePlanType] = useState<'monthly' | 'weekly'>('monthly');

  // Compute batches from monthlyPlans and weeklyPlans
  const monthlyBatches = useMemo(() => {
    const map = new Map<string, {
      batchId: string;
      period: string;
      fileName: string;
      uploadedBy: string;
      uploadedAt: string;
      count: number;
    }>();

    monthlyPlans.forEach((p) => {
      const batchId = (p as any).planBatchId || `${p.year}-${p.month}`;
      const existing = map.get(batchId);
      if (existing) {
        existing.count += 1;
      } else {
        map.set(batchId, {
          batchId,
          period: `${p.month} ${p.year}`,
          fileName: (p as any).sourceFileName || 'Official Monthly Plan',
          uploadedBy: p.createdBy || 'Administrator',
          uploadedAt: p.createdAt || '',
          count: 1,
        });
      }
    });

    return Array.from(map.values()).sort((a, b) => b.batchId.localeCompare(a.batchId));
  }, [monthlyPlans]);

  const weeklyBatches = useMemo(() => {
    const map = new Map<string, {
      batchId: string;
      period: string;
      fileName: string;
      uploadedBy: string;
      uploadedAt: string;
      count: number;
    }>();

    weeklyPlans.forEach((p) => {
      const batchId = (p as any).planBatchId || `${p.year}-W${p.weekNumber}`;
      const existing = map.get(batchId);
      if (existing) {
        existing.count += 1;
      } else {
        map.set(batchId, {
          batchId,
          period: `Week ${p.weekNumber} (${p.weekStartDate || p.year})`,
          fileName: (p as any).sourceFileName || 'Official Weekly Plan',
          uploadedBy: p.createdBy || 'Administrator',
          uploadedAt: p.createdAt || '',
          count: 1,
        });
      }
    });

    return Array.from(map.values()).sort((a, b) => b.batchId.localeCompare(a.batchId));
  }, [weeklyPlans]);

  const openImportModal = (type: 'monthly' | 'weekly') => {
    if (onOpenImportModal) {
      onOpenImportModal(type);
    } else {
      setActivePlanType(type);
      setModalOpen(true);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-blue-900 text-white p-6 sm:p-8 rounded-3xl shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-2 max-w-2xl">
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-blue-500/20 text-blue-200 border border-blue-400/30 text-xs font-bold uppercase tracking-wider">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Admin-Authoritative Manufacturing Planning</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-black tracking-tight">
            Plan Excel Import & Priority Allocation
          </h2>
          <p className="text-xs sm:text-sm text-blue-100/80 leading-relaxed">
            Upload official Monthly & Weekly machine targets using the standard 4-column format.
            Planned machines automatically sync to all plant departments in priority order (SR.NO.),
            with strict handover gating before physical work updates can be submitted.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <button
            onClick={() => openImportModal('monthly')}
            className="px-5 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl text-xs font-black shadow-lg shadow-blue-900/40 transition flex items-center justify-center space-x-2"
          >
            <Calendar className="w-4 h-4" />
            <span>IMPORT MONTHLY PLAN</span>
          </button>

          <button
            onClick={() => openImportModal('weekly')}
            className="px-5 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl text-xs font-black shadow-lg shadow-emerald-900/40 transition flex items-center justify-center space-x-2"
          >
            <Clock className="w-4 h-4" />
            <span>IMPORT WEEKLY PLAN</span>
          </button>
        </div>
      </div>

      {/* 4-Column Format Specification Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Monthly Plan Card */}
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-2xs space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="p-3 bg-blue-100 rounded-2xl text-blue-700">
                <Calendar className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-black text-slate-900">Monthly Machine Target Plan</h3>
                <p className="text-xs text-slate-500">
                  {monthlyPlans.length} active machine lines in database
                </p>
              </div>
            </div>

            <button
              onClick={() => downloadFourColumnPlanTemplate('monthly')}
              className="p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition flex items-center space-x-1.5"
              title="Download 4-column sample Excel template"
            >
              <Download className="w-4 h-4" />
              <span>Template</span>
            </button>
          </div>

          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/80 text-xs space-y-2">
            <div className="font-bold text-slate-800 flex items-center space-x-1.5">
              <span>Required 4-Column Excel Structure:</span>
            </div>
            <div className="grid grid-cols-4 gap-2 text-center font-mono font-bold text-[11px] bg-white p-2.5 rounded-xl border border-slate-200 text-slate-700">
              <div className="bg-blue-50 text-blue-800 p-1 rounded">SR.NO.</div>
              <div className="bg-indigo-50 text-indigo-800 p-1 rounded">CMM NO</div>
              <div className="bg-emerald-50 text-emerald-800 p-1 rounded">CMM SIZE</div>
              <div className="bg-amber-50 text-amber-800 p-1 rounded">Qty</div>
            </div>
            <p className="text-[11px] text-slate-500">
              Preserves upload sequence as priority. Automatically matches existing Machine Master details (customer, project).
            </p>
          </div>

          <div className="flex items-center justify-between pt-2">
            <button
              onClick={() => onNavigateToPlan?.('monthly')}
              className="text-xs font-bold text-blue-600 hover:text-blue-800 flex items-center space-x-1"
            >
              <span>View Full Monthly Plan Board</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={() => openImportModal('monthly')}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition"
            >
              Import Monthly Excel
            </button>
          </div>
        </div>

        {/* Weekly Plan Card */}
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-2xs space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="p-3 bg-emerald-100 rounded-2xl text-emerald-700">
                <Clock className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-black text-slate-900">Weekly Execution Schedule</h3>
                <p className="text-xs text-slate-500">
                  {weeklyPlans.length} active weekly machine commitments
                </p>
              </div>
            </div>

            <button
              onClick={() => downloadFourColumnPlanTemplate('weekly')}
              className="p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition flex items-center space-x-1.5"
              title="Download 4-column sample Excel template"
            >
              <Download className="w-4 h-4" />
              <span>Template</span>
            </button>
          </div>

          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/80 text-xs space-y-2">
            <div className="font-bold text-slate-800 flex items-center space-x-1.5">
              <span>Required 4-Column Excel Structure:</span>
            </div>
            <div className="grid grid-cols-4 gap-2 text-center font-mono font-bold text-[11px] bg-white p-2.5 rounded-xl border border-slate-200 text-slate-700">
              <div className="bg-blue-50 text-blue-800 p-1 rounded">SR.NO.</div>
              <div className="bg-indigo-50 text-indigo-800 p-1 rounded">CMM NO</div>
              <div className="bg-emerald-50 text-emerald-800 p-1 rounded">CMM SIZE</div>
              <div className="bg-amber-50 text-amber-800 p-1 rounded">Qty</div>
            </div>
            <p className="text-[11px] text-slate-500">
              Calculates weekly targets against actual departmental completions. Reconciles with handover timestamps.
            </p>
          </div>

          <div className="flex items-center justify-between pt-2">
            <button
              onClick={() => onNavigateToPlan?.('weekly')}
              className="text-xs font-bold text-emerald-600 hover:text-emerald-800 flex items-center space-x-1"
            >
              <span>View Full Weekly Plan Board</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={() => openImportModal('weekly')}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition"
            >
              Import Weekly Excel
            </button>
          </div>
        </div>
      </div>

      {/* Recent Import Batches / History */}
      <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-2xs">
        <div className="p-6 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/50">
          <div>
            <h3 className="text-base font-black text-slate-900 flex items-center space-x-2">
              <FileSpreadsheet className="w-5 h-5 text-blue-600" />
              <span>Official Manufacturing Plan Batches</span>
            </h3>
            <p className="text-xs text-slate-500">
              History of uploaded monthly and weekly manufacturing plan files stored in Firestore
            </p>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => onNavigateToPlan?.('plan_vs_actual')}
              className="px-3.5 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-bold transition flex items-center space-x-1.5"
            >
              <TrendingUp className="w-4 h-4 text-blue-600" />
              <span>Reconcile Plan vs Actual</span>
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[10px]">
              <tr>
                <th className="p-4">Plan Type</th>
                <th className="p-4">Target Period</th>
                <th className="p-4">Batch ID</th>
                <th className="p-4">Source Filename</th>
                <th className="p-4 text-center">Machines</th>
                <th className="p-4">Published By</th>
                <th className="p-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {monthlyBatches.length === 0 && weeklyBatches.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-10 text-center text-slate-400">
                    No plan batches uploaded yet. Click &ldquo;IMPORT MONTHLY PLAN&rdquo; or &ldquo;IMPORT WEEKLY PLAN&rdquo; to upload your first 4-column schedule.
                  </td>
                </tr>
              ) : (
                <>
                  {monthlyBatches.map((b) => (
                    <tr key={`m-batch-${b.batchId}`} className="hover:bg-slate-50/80 transition">
                      <td className="p-4">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-200">
                          Monthly Plan
                        </span>
                      </td>
                      <td className="p-4 font-bold text-slate-900">{b.period}</td>
                      <td className="p-4 font-mono text-[11px] text-slate-600">{b.batchId}</td>
                      <td className="p-4 text-slate-600">{b.fileName}</td>
                      <td className="p-4 text-center font-mono font-black text-blue-600 text-sm">
                        {b.count}
                      </td>
                      <td className="p-4 text-slate-600 text-[11px]">{b.uploadedBy}</td>
                      <td className="p-4 text-right">
                        <button
                          onClick={() => onNavigateToPlan?.('monthly')}
                          className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-xs font-bold transition"
                        >
                          View Lines
                        </button>
                      </td>
                    </tr>
                  ))}

                  {weeklyBatches.map((b) => (
                    <tr key={`w-batch-${b.batchId}`} className="hover:bg-slate-50/80 transition">
                      <td className="p-4">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                          Weekly Plan
                        </span>
                      </td>
                      <td className="p-4 font-bold text-slate-900">{b.period}</td>
                      <td className="p-4 font-mono text-[11px] text-slate-600">{b.batchId}</td>
                      <td className="p-4 text-slate-600">{b.fileName}</td>
                      <td className="p-4 text-center font-mono font-black text-emerald-600 text-sm">
                        {b.count}
                      </td>
                      <td className="p-4 text-slate-600 text-[11px]">{b.uploadedBy}</td>
                      <td className="p-4 text-right">
                        <button
                          onClick={() => onNavigateToPlan?.('weekly')}
                          className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg text-xs font-bold transition"
                        >
                          View Lines
                        </button>
                      </td>
                    </tr>
                  ))}
                </>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal only rendered if not delegated to parent */}
      {!onOpenImportModal && modalOpen && (
        <AdminPlanExcelImportModal
          isOpen={true}
          onClose={() => setModalOpen(false)}
          defaultPlanType={activePlanType}
          machines={machines}
        />
      )}
    </div>
  );
};
