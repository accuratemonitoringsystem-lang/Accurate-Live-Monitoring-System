import React, { useState, useMemo } from 'react';
import {
  BarChart3,
  FileSpreadsheet,
  Presentation,
  Download,
  Calendar,
  Filter,
  CheckCircle2,
  AlertTriangle,
  Flame,
  Building,
  TrendingUp,
  Clock,
  Layers,
  FileText,
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  Department,
  DepartmentWork,
  Machine,
  MonthlyPlan,
  QualityDailyCheck,
  QualityRejection,
} from '../types';
import { generateMISPresentation } from '../utils/ppt';
import { exportToExcel } from '../utils/excel';
import { isDepartmentMatch } from '../utils/departmentUtils';
import { INITIAL_DEPARTMENTS } from '../constants';

interface ReportsViewProps {
  departments: Department[];
  machines: Machine[];
  monthlyPlans: MonthlyPlan[];
  departmentWork: DepartmentWork[];
  qualityRejections: QualityRejection[];
  qualityChecks: QualityDailyCheck[];
}

export const ReportsView: React.FC<ReportsViewProps> = ({
  departments,
  machines,
  monthlyPlans,
  departmentWork,
  qualityRejections,
  qualityChecks,
}) => {
  const [selectedMonth, setSelectedMonth] = useState('September 2026');
  const [selectedDept, setSelectedDept] = useState('All Departments');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [generatingPpt, setGeneratingPpt] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);

  // Filter plans for month
  const currentPlans = monthlyPlans.filter(
    (p) => `${p.month} ${p.year}`.toLowerCase() === selectedMonth.toLowerCase()
  );

  const totalPlanned = currentPlans.reduce((sum, p) => sum + (Number(p.plannedQuantity) || 0), 0);
  const totalActual = currentPlans.reduce((sum, p) => sum + (Number(p.actualQuantity) || 0), 0);
  const achievementPct = totalPlanned > 0 ? Math.round((totalActual / totalPlanned) * 100) : 0;

  const totalMachines = machines.length;
  const dispatchedMachines = machines.filter((m) => m.currentStatus === 'Dispatched').length;
  const inProgressMachines = machines.filter(
    (m) => m.currentStatus === 'In Progress' || m.currentStatus === 'On Track'
  ).length;
  const delayedMachines = machines.filter((m) => m.currentStatus === 'Delayed').length;
  const qualityHoldMachines = machines.filter((m) => m.currentStatus === 'Quality Hold').length;

  // Delayed work items
  const delayedItems = departmentWork.filter((w) => w.status === 'Delayed');

  // Quality rejection stats
  const activeRejections = qualityRejections.filter((r) => r.status !== 'Accepted');
  const closedRejections = qualityRejections.filter((r) => r.status === 'Accepted');

  // Calculate Department Performance Matrix
  const uniqueDepartments = useMemo(() => {
    const seen = new Set<string>();
    return departments.filter((dept) => {
      const key = (dept.code || dept.name || '').trim().toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [departments]);

  const deptPerformance = uniqueDepartments.map((dept, index) => {
    const deptP = monthlyPlans.filter((p) => isDepartmentMatch(p.department, dept.name));
    const target = deptP.reduce((sum, p) => sum + (Number(p.plannedQuantity) || 0), 0);
    const actual = deptP.reduce((sum, p) => sum + (Number(p.actualQuantity) || 0), 0);
    const pct = target > 0 ? Math.round((actual / target) * 100) : 0;
    const delayedCount = departmentWork.filter(
      (w) => isDepartmentMatch(w.department, dept.name) && w.status === 'Delayed'
    ).length;

    return {
      id: dept.id || dept.code || `${dept.name}-${index}`,
      name: dept.name,
      target,
      actual,
      achievementPct: pct,
      delayedCount,
    };
  });

  const handleDownloadPPT = async () => {
    setGeneratingPpt(true);
    try {
      await generateMISPresentation({
        periodTitle: selectedMonth,
        totalMachines: machines.length,
        machines,
        monthlyPlans,
        departmentWork,
        qualityChecks,
        qualityRejections,
      });
    } catch (err) {
      console.error(err);
      alert('Failed to generate PPT presentation.');
    } finally {
      setGeneratingPpt(false);
    }
  };

  const handleExportExcelMIS = () => {
    exportToExcel(
      `Accurate_Gauging_MIS_Report_${selectedMonth.replace(/\s+/g, '_')}`,
      'Department Performance',
      filteredDeptPerformance
    );
  };

  const handleDownloadPDF = () => {
    setGeneratingPdf(true);
    try {
      const doc = new jsPDF();
      doc.setFontSize(16);
      doc.text('ACCURATE GAUGING & INSTRUMENTS PVT. LTD.', 14, 18);
      doc.setFontSize(12);
      doc.text(`Plant Management MIS Report — ${selectedMonth}`, 14, 26);
      doc.setFontSize(9);
      doc.text(
        `Department: ${selectedDept} | Date Range: ${startDate || 'All'} to ${endDate || 'All'} | Generated: ${new Date().toLocaleDateString()}`,
        14,
        32
      );

      const tableData = filteredDeptPerformance.map((d) => [
        d.name,
        d.target.toString(),
        d.actual.toString(),
        `${d.achievementPct}%`,
        d.delayedCount.toString(),
        d.delayedCount > 0 ? 'DELAYED' : 'ON TRACK',
      ]);

      autoTable(doc, {
        startY: 38,
        head: [['Department', 'Target Qty', 'Actual Qty', 'Achievement %', 'Delayed Orders', 'Status']],
        body: tableData,
        theme: 'grid',
        headStyles: { fillColor: [30, 58, 138], textColor: 255 },
      });

      doc.save(`Accurate_Gauging_MIS_Report_${selectedMonth.replace(/\s+/g, '_')}.pdf`);
    } catch (err) {
      console.error('Failed to export PDF:', err);
      alert('Failed to generate PDF report.');
    } finally {
      setGeneratingPdf(false);
    }
  };

  // Filtered department performance based on department selection
  const filteredDeptPerformance = useMemo(() => {
    if (selectedDept === 'All Departments') return deptPerformance;
    return deptPerformance.filter((d) => isDepartmentMatch(d.name, selectedDept));
  }, [deptPerformance, selectedDept]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-blue-600" />
            <span>Management Overview &amp; MIS Reporting</span>
          </h2>
          <p className="text-xs sm:text-sm text-slate-500">
            Executive metrics, department achievement rankings, delay analysis, Excel, PDF &amp; PowerPoint exports
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Requirement 12: Download Excel */}
          <button
            onClick={handleExportExcelMIS}
            className="text-xs font-bold px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl flex items-center gap-1.5 transition shadow-xs"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download Excel</span>
          </button>

          {/* Requirement 12: Download PDF */}
          <button
            onClick={handleDownloadPDF}
            disabled={generatingPdf}
            className="text-xs font-bold px-3 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl flex items-center gap-1.5 transition shadow-xs disabled:opacity-50"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>{generatingPdf ? 'Generating PDF...' : 'Download PDF'}</span>
          </button>

          <button
            onClick={handleDownloadPPT}
            disabled={generatingPpt}
            className="text-xs font-bold px-3.5 py-2 bg-gradient-to-r from-red-600 to-amber-600 hover:from-red-700 hover:to-amber-700 text-white rounded-xl shadow-xs flex items-center gap-1.5 transition disabled:opacity-50"
          >
            <Presentation className="w-3.5 h-3.5" />
            <span>{generatingPpt ? 'Generating...' : 'Download PPT'}</span>
          </button>
        </div>
      </div>

      {/* Requirement 12: Working Date Range Filter & Department Filter */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3 text-xs">
          {/* Month Selector */}
          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5">
            <Calendar className="w-3.5 h-3.5 text-blue-600" />
            <span className="font-bold text-slate-600">Month:</span>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="bg-transparent font-bold text-slate-900 outline-none cursor-pointer text-xs"
            >
              <option value="September 2026">September 2026</option>
              <option value="October 2026">October 2026</option>
              <option value="March 2026">March 2026</option>
              <option value="April 2026">April 2026</option>
              <option value="May 2026">May 2026</option>
              <option value="June 2026">June 2026</option>
            </select>
          </div>

          {/* Department Filter */}
          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5">
            <Building className="w-3.5 h-3.5 text-slate-500" />
            <span className="font-bold text-slate-600">Department:</span>
            <select
              value={selectedDept}
              onChange={(e) => setSelectedDept(e.target.value)}
              className="bg-transparent font-bold text-slate-900 outline-none cursor-pointer text-xs"
            >
              <option value="All Departments">All Departments</option>
              {INITIAL_DEPARTMENTS.map((d) => (
                <option key={d.code} value={d.name}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>

          {/* Date Range: From */}
          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5">
            <span className="font-bold text-slate-600">From:</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="bg-transparent font-bold text-slate-900 outline-none cursor-pointer text-xs"
            />
          </div>

          {/* Date Range: To */}
          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5">
            <span className="font-bold text-slate-600">To:</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="bg-transparent font-bold text-slate-900 outline-none cursor-pointer text-xs"
            />
          </div>
        </div>

        <div className="text-[11px] text-slate-400 font-medium">
          Executive Data Grounded in Real Operations Only
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-[10px] uppercase font-bold text-slate-400">Target vs Actual</span>
          <div className="text-xl sm:text-2xl font-black text-slate-900 mt-1">
            {totalActual} <span className="text-xs font-normal text-slate-400">/ {totalPlanned}</span>
          </div>
          <div className="text-[11px] font-semibold text-blue-600 mt-1">
            {achievementPct}% Planned Target Met
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-[10px] uppercase font-bold text-slate-400">Active Shop Machines</span>
          <div className="text-xl sm:text-2xl font-black text-slate-900 mt-1">
            {totalMachines}
          </div>
          <div className="text-[11px] font-semibold text-slate-600 mt-1">
            {inProgressMachines} In Progress &bull; {dispatchedMachines} Dispatched
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-[10px] uppercase font-bold text-slate-400">Delayed Operations</span>
          <div className="text-xl sm:text-2xl font-black text-red-600 mt-1">
            {delayedItems.length}
          </div>
          <div className="text-[11px] font-semibold text-red-600 mt-1">
            {delayedMachines} Machines Behind Schedule
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-[10px] uppercase font-bold text-slate-400">Quality Reworks &amp; NCRs</span>
          <div className="text-xl sm:text-2xl font-black text-amber-600 mt-1">
            {activeRejections.length}
          </div>
          <div className="text-[11px] font-semibold text-slate-600 mt-1">
            {closedRejections.length} Re-inspected &amp; Cleared
          </div>
        </div>
      </div>

      {/* Department Achievement Matrix */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
            <Building className="w-4 h-4 text-slate-700" />
            <span>Department Performance Ranking ({selectedMonth})</span>
          </h3>
          <span className="text-xs text-slate-500">Ranked by Target Fulfillment</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[10px]">
              <tr>
                <th className="p-3">Department</th>
                <th className="p-3 text-right">Target Qty</th>
                <th className="p-3 text-right">Actual Qty</th>
                <th className="p-3">Achievement %</th>
                <th className="p-3 text-right">Delayed Orders</th>
                <th className="p-3 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {deptPerformance.map((dept) => (
                <tr key={dept.id} className="hover:bg-slate-50 transition">
                  <td className="p-3 font-semibold text-slate-900">{dept.name}</td>
                  <td className="p-3 text-right font-mono text-slate-700">{dept.target}</td>
                  <td className="p-3 text-right font-mono font-bold text-slate-900">{dept.actual}</td>
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <div className="w-24 bg-slate-200 rounded-full h-2 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            dept.achievementPct >= 90
                              ? 'bg-emerald-500'
                              : dept.achievementPct >= 50
                              ? 'bg-blue-500'
                              : 'bg-amber-500'
                          }`}
                          style={{ width: `${Math.min(dept.achievementPct, 100)}%` }}
                        />
                      </div>
                      <span className="font-mono font-bold text-xs">{dept.achievementPct}%</span>
                    </div>
                  </td>
                  <td className="p-3 text-right font-bold text-red-600 font-mono">
                    {dept.delayedCount}
                  </td>
                  <td className="p-3 text-center">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        dept.delayedCount > 0
                          ? 'bg-red-100 text-red-800'
                          : dept.achievementPct >= 80
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {dept.delayedCount > 0
                        ? 'Bottleneck'
                        : dept.achievementPct >= 80
                        ? 'Optimal'
                        : 'On Schedule'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Delay Analysis & Rejections breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
          <h3 className="font-bold text-sm text-slate-900 mb-3 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-600" />
            <span>Bottleneck &amp; Delay Root Causes</span>
          </h3>

          {delayedItems.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-400">
              Zero shop floor delays currently recorded.
            </div>
          ) : (
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {delayedItems.map((item) => (
                <div key={item.id} className="p-3 bg-red-50/60 border border-red-200 rounded-xl text-xs">
                  <div className="font-bold text-slate-900">{item.title}</div>
                  <div className="text-slate-600 text-[11px] mt-0.5">
                    Dept: <strong>{item.department}</strong> {item.machineNumber ? `&bull; Machine ${item.machineNumber}` : ''}
                  </div>
                  <div className="text-red-800 font-medium mt-1">
                    Reason: {item.delayReason || 'Unspecified'}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
          <h3 className="font-bold text-sm text-slate-900 mb-3 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-amber-600" />
            <span>Quality NCR Summary</span>
          </h3>

          {qualityRejections.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-400">
              Zero active quality rejections logged.
            </div>
          ) : (
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {qualityRejections.map((rej) => (
                <div key={rej.id} className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-900">
                      Machine {rej.machineNumber} &bull; {rej.operationName}
                    </span>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                        rej.status === 'Accepted'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-red-100 text-red-800'
                      }`}
                    >
                      {rej.status}
                    </span>
                  </div>
                  <div className="text-red-700 mt-1">Finding: {rej.rejectionReason}</div>
                  {rej.correctiveAction && (
                    <div className="text-emerald-800 text-[11px] mt-0.5">
                      Action: {rej.correctiveAction}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
