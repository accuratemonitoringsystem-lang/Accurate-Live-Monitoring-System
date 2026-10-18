import React, { useState, useEffect, useMemo } from 'react';
import {
  FileSpreadsheet,
  Upload,
  Download,
  AlertTriangle,
  CheckCircle2,
  X,
  Calendar,
  Clock,
  RefreshCw,
  Info,
  ArrowRight,
  ArrowLeft,
  FileCheck,
  AlertOctagon,
  HelpCircle,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { Machine } from '../../types';
import { useAuth } from '../../context/AuthContext';
import {
  parseFourColumnPlanExcel,
  importMonthlyPlanBatch,
  importWeeklyPlanBatch,
  downloadFourColumnPlanTemplate,
  PlanExcelValidationResult,
  ParsedPlanRow,
} from '../../services/adminPlanImportService';
import { HISTORICAL_MONTHS } from '../../constants';

interface AdminPlanExcelImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultPlanType?: 'monthly' | 'weekly';
  machines?: Machine[];
  onImportSuccess?: (batchId: string, planType: 'monthly' | 'weekly') => void;
}

const AdminPlanExcelImportModalContent: React.FC<Omit<AdminPlanExcelImportModalProps, 'isOpen'>> = ({
  onClose,
  defaultPlanType = 'monthly',
  machines = [],
  onImportSuccess,
}) => {
  const { userProfile } = useAuth();

  // Wizard Steps: 1 = Configure & Upload, 2 = Validate & Preview, 3 = Confirmation & Summary
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);
  const [planType, setPlanType] = useState<'monthly' | 'weekly'>(defaultPlanType);

  // Step 1: Form Fields - Monthly
  const currentYear = new Date().getFullYear().toString();
  const [month, setMonth] = useState('March');
  const [year, setYear] = useState(currentYear);
  const [monthlyTitle, setMonthlyTitle] = useState('');
  const [monthlyRemarks, setMonthlyRemarks] = useState('');

  // Step 1: Form Fields - Weekly
  const [weekNumber, setWeekNumber] = useState('12');
  const [weekStartDate, setWeekStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [weekEndDate, setWeekEndDate] = useState(
    new Date(Date.now() + 6 * 86400000).toISOString().split('T')[0]
  );
  const [weeklyTitle, setWeeklyTitle] = useState('');
  const [weeklyRemarks, setWeeklyRemarks] = useState('');

  // File & Parsing State
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [validationResult, setValidationResult] = useState<PlanExcelValidationResult | null>(null);

  // Overwrite Confirmation
  const [overwriteExisting, setOverwriteExisting] = useState(false);
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);

  // Import Execution State
  const [importing, setImporting] = useState(false);
  const [importSuccessResult, setImportSuccessResult] = useState<{
    batchId: string;
    importedCount: number;
    warningsCount: number;
    unresolvedCount: number;
  } | null>(null);

  // Table Filter & Search in Preview
  const [previewFilter, setPreviewFilter] = useState<'all' | 'valid' | 'invalid' | 'warning'>('all');
  const [previewSearch, setPreviewSearch] = useState('');

  useEffect(() => {
    setPlanType(defaultPlanType);
  }, [defaultPlanType]);

  // Handle File Upload and Transition to Step 2
  const handleFileSelected = async (file: File) => {
    setSelectedFile(file);
    setParseError(null);
    setParsing(true);
    try {
      const result = await parseFourColumnPlanExcel(file, machines);
      setValidationResult(result);
      setCurrentStep(2);
    } catch (err: any) {
      console.error(err);
      setParseError(err.message || 'Failed to parse Excel file.');
    } finally {
      setParsing(false);
    }
  };

  const handleDownloadErrorReport = () => {
    if (!validationResult) return;
    const errorData = validationResult.rows
      .filter((r) => !r.isValid || r.warning || r.error)
      .map((r) => ({
        'Row Number': r.rowNumber,
        'SR.NO.': r.srNo,
        'CMM NO': r.cmmNo,
        'CMM SIZE': r.cmmSize,
        Qty: r.qty,
        Status: !r.isValid ? 'INVALID' : 'WARNING',
        Issue: r.error || r.warning || 'No issue',
      }));

    if (errorData.length === 0) {
      alert('No errors or warnings found in this uploaded file.');
      return;
    }

    const ws = XLSX.utils.json_to_sheet(errorData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Validation_Report');
    XLSX.writeFile(
      wb,
      `Accurate_${planType === 'monthly' ? 'Monthly' : 'Weekly'}_Plan_Validation_Report.xlsx`
    );
  };

  // Step 3: Execute Batch Import
  const handleConfirmImport = async () => {
    if (!validationResult || validationResult.validRowsCount === 0) {
      alert('There are no valid rows to import.');
      return;
    }

    setImporting(true);
    setDuplicateWarning(null);

    try {
      if (planType === 'monthly') {
        const res = await importMonthlyPlanBatch({
          month,
          year,
          title: monthlyTitle || `${month} ${year} Production Plan`,
          remarks: monthlyRemarks,
          fileName: selectedFile?.name || 'monthly_plan.xlsx',
          rows: validationResult.rows,
          overwriteExisting,
          userEmail: userProfile?.email || 'admin@accurate.com',
          userName: userProfile?.displayName || userProfile?.employeeName || 'Administrator',
        });

        setImportSuccessResult(res);
        setCurrentStep(3);
        if (onImportSuccess) {
          onImportSuccess(res.batchId, 'monthly');
        }
      } else {
        // Validate weekly dates
        if (new Date(weekEndDate) < new Date(weekStartDate)) {
          alert('Week End Date cannot be earlier than Week Start Date.');
          setImporting(false);
          return;
        }

        const res = await importWeeklyPlanBatch({
          weekNumber,
          weekStartDate,
          weekEndDate,
          year,
          title: weeklyTitle || `Week ${weekNumber} (${year}) Manufacturing Plan`,
          remarks: weeklyRemarks,
          fileName: selectedFile?.name || 'weekly_plan.xlsx',
          rows: validationResult.rows,
          overwriteExisting,
          userEmail: userProfile?.email || 'admin@accurate.com',
          userName: userProfile?.displayName || userProfile?.employeeName || 'Administrator',
        });

        setImportSuccessResult(res);
        setCurrentStep(3);
        if (onImportSuccess) {
          onImportSuccess(res.batchId, 'weekly');
        }
      }
    } catch (err: any) {
      console.error(err);
      if (err.message && err.message.includes('already exists')) {
        setDuplicateWarning(err.message);
      } else {
        alert(err.message || 'Error occurred while saving plan to Firestore.');
      }
    } finally {
      setImporting(false);
    }
  };

  // Preview filtering
  const displayedRows = useMemo(() => {
    return (validationResult?.rows || []).filter((r) => {
      if (previewFilter === 'valid' && !r.isValid) return false;
      if (previewFilter === 'invalid' && r.isValid) return false;
      if (previewFilter === 'warning' && (!r.warning && !r.sizeDiscrepancy && !r.unresolvedMachine))
        return false;

      if (previewSearch) {
        const q = previewSearch.toLowerCase();
        const matchCmm = r.cmmNo.toLowerCase().includes(q);
        const matchSize = r.cmmSize.toLowerCase().includes(q);
        const matchSr = String(r.srNo).includes(q);
        return matchCmm || matchSize || matchSr;
      }
      return true;
    });
  }, [validationResult, previewFilter, previewSearch]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-5xl my-6 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-blue-900 text-white p-6 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-3 bg-blue-500/20 rounded-2xl border border-blue-400/30">
              <FileSpreadsheet className="w-6 h-6 text-blue-300" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-xl font-black tracking-tight">Admin Plan Excel Import Wizard</h2>
                <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-blue-500/30 text-blue-200 border border-blue-400/30">
                  {planType === 'monthly' ? 'Monthly Plan' : 'Weekly Plan'}
                </span>
              </div>
              <p className="text-xs text-blue-200/80 mt-0.5">
                Accurate Gauging & Instruments • 4-Column Canonical Import (SR.NO. | CMM NO | CMM SIZE | Qty)
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-white/70 hover:text-white hover:bg-white/10 rounded-xl transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Wizard Steps Navigation Bar */}
        <div className="bg-slate-50 border-b border-slate-200 px-6 py-3 flex items-center justify-between text-xs">
          <div className="flex items-center space-x-6">
            <div
              className={`flex items-center space-x-2 ${
                currentStep === 1 ? 'font-bold text-blue-600' : 'text-slate-500'
              }`}
            >
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black ${
                  currentStep === 1
                    ? 'bg-blue-600 text-white shadow-sm'
                    : currentStep > 1
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-200 text-slate-600'
                }`}
              >
                1
              </div>
              <span>Plan Period & File</span>
            </div>

            <ArrowRight className="w-3.5 h-3.5 text-slate-300" />

            <div
              className={`flex items-center space-x-2 ${
                currentStep === 2 ? 'font-bold text-blue-600' : 'text-slate-500'
              }`}
            >
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black ${
                  currentStep === 2
                    ? 'bg-blue-600 text-white shadow-sm'
                    : currentStep > 2
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-200 text-slate-600'
                }`}
              >
                2
              </div>
              <span>Validation & Preview</span>
            </div>

            <ArrowRight className="w-3.5 h-3.5 text-slate-300" />

            <div
              className={`flex items-center space-x-2 ${
                currentStep === 3 ? 'font-bold text-blue-600' : 'text-slate-500'
              }`}
            >
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black ${
                  currentStep === 3
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'bg-slate-200 text-slate-600'
                }`}
              >
                3
              </div>
              <span>Import Confirmation</span>
            </div>
          </div>

          {/* Quick Plan Type Switcher (only active on step 1) */}
          {currentStep === 1 && (
            <div className="flex items-center bg-white p-1 rounded-xl border border-slate-200">
              <button
                type="button"
                onClick={() => setPlanType('monthly')}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
                  planType === 'monthly'
                    ? 'bg-blue-600 text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Monthly Plan
              </button>
              <button
                type="button"
                onClick={() => setPlanType('weekly')}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
                  planType === 'weekly'
                    ? 'bg-blue-600 text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Weekly Plan
              </button>
            </div>
          )}
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* STEP 1: SELECT PLAN PERIOD & FILE */}
          {currentStep === 1 && (
            <div className="space-y-6 max-w-3xl mx-auto">
              <div className="bg-blue-50 border border-blue-200 p-4 rounded-2xl flex items-start space-x-3">
                <Info className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
                <div className="text-xs text-blue-900 leading-relaxed">
                  <p className="font-bold mb-1">Standard 4-Column Excel Structure</p>
                  <p>
                    Please upload an Excel file containing exactly these four columns:
                    <span className="font-mono font-bold bg-blue-100 px-1 py-0.5 rounded ml-1 mr-1">
                      SR.NO. | CMM NO | CMM SIZE | Qty
                    </span>
                    Serial number preserves the priority sequence. Machine details (customer, project) will be automatically retrieved from the Machine Master.
                  </p>
                </div>
              </div>

              {/* Form Options */}
              {planType === 'monthly' ? (
                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
                  <h3 className="text-sm font-black text-slate-900 flex items-center space-x-2">
                    <Calendar className="w-4 h-4 text-blue-600" />
                    <span>Monthly Plan Target Period</span>
                  </h3>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Plan Month <span className="text-rose-500">*</span>
                      </label>
                      <select
                        value={month}
                        onChange={(e) => setMonth(e.target.value)}
                        className="w-full text-xs font-semibold px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-800 focus:ring-2 focus:ring-blue-500"
                      >
                        {HISTORICAL_MONTHS.map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Plan Year <span className="text-rose-500">*</span>
                      </label>
                      <select
                        value={year}
                        onChange={(e) => setYear(e.target.value)}
                        className="w-full text-xs font-semibold px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-800 focus:ring-2 focus:ring-blue-500"
                      >
                        {['2024', '2025', '2026', '2027', '2028'].map((y) => (
                          <option key={y} value={y}>
                            {y}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Plan Title (Optional)
                      </label>
                      <input
                        type="text"
                        value={monthlyTitle}
                        onChange={(e) => setMonthlyTitle(e.target.value)}
                        placeholder={`e.g. ${month} ${year} Accurate Manufacturing Target`}
                        className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-800 focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Remarks / Plan Notes (Optional)
                      </label>
                      <input
                        type="text"
                        value={monthlyRemarks}
                        onChange={(e) => setMonthlyRemarks(e.target.value)}
                        placeholder="e.g. Approved monthly shop floor capacity schedule"
                        className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-800 focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
                  <h3 className="text-sm font-black text-slate-900 flex items-center space-x-2">
                    <Clock className="w-4 h-4 text-blue-600" />
                    <span>Weekly Plan Execution Schedule</span>
                  </h3>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Week Number <span className="text-rose-500">*</span>
                      </label>
                      <select
                        value={weekNumber}
                        onChange={(e) => setWeekNumber(e.target.value)}
                        className="w-full text-xs font-semibold px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-800 focus:ring-2 focus:ring-blue-500"
                      >
                        {Array.from({ length: 52 }, (_, i) => i + 1).map((w) => (
                          <option key={w} value={w}>
                            Week {w}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Year <span className="text-rose-500">*</span>
                      </label>
                      <select
                        value={year}
                        onChange={(e) => setYear(e.target.value)}
                        className="w-full text-xs font-semibold px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-800 focus:ring-2 focus:ring-blue-500"
                      >
                        {['2024', '2025', '2026', '2027', '2028'].map((y) => (
                          <option key={y} value={y}>
                            {y}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Week Start Date <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="date"
                        value={weekStartDate}
                        onChange={(e) => setWeekStartDate(e.target.value)}
                        className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-800 focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Week End Date <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="date"
                        value={weekEndDate}
                        onChange={(e) => setWeekEndDate(e.target.value)}
                        className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-800 focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Plan Title (Optional)
                      </label>
                      <input
                        type="text"
                        value={weeklyTitle}
                        onChange={(e) => setWeeklyTitle(e.target.value)}
                        placeholder={`e.g. Week ${weekNumber} Production Target`}
                        className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-800 focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Remarks (Optional)
                      </label>
                      <input
                        type="text"
                        value={weeklyRemarks}
                        onChange={(e) => setWeeklyRemarks(e.target.value)}
                        placeholder="e.g. Priority dispatch line for weekly assembly"
                        className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-800 focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Upload Dropzone */}
              <div className="bg-slate-50 border-2 border-dashed border-slate-300 rounded-3xl p-8 text-center hover:border-blue-500 hover:bg-blue-50/30 transition flex flex-col items-center justify-center">
                <div className="w-16 h-16 bg-blue-100 rounded-2xl flex items-center justify-center text-blue-600 mb-4 shadow-xs">
                  <Upload className="w-8 h-8" />
                </div>
                <h4 className="text-base font-black text-slate-800">
                  Select Excel Plan File to Upload
                </h4>
                <p className="text-xs text-slate-500 mt-1 max-w-sm">
                  Accepts <span className="font-bold text-slate-700">.xlsx</span> and{' '}
                  <span className="font-bold text-slate-700">.xls</span> workbooks formatted with SR.NO., CMM NO, CMM SIZE, Qty.
                </p>

                <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
                  <label className="cursor-pointer px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-black shadow-sm transition flex items-center space-x-2">
                    <FileSpreadsheet className="w-4 h-4" />
                    <span>Choose File (.xlsx / .xls)</span>
                    <input
                      type="file"
                      accept=".xlsx, .xls"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleFileSelected(f);
                      }}
                    />
                  </label>

                  <button
                    type="button"
                    onClick={() => downloadFourColumnPlanTemplate(planType)}
                    className="px-4 py-2.5 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 rounded-xl text-xs font-bold transition flex items-center space-x-2"
                  >
                    <Download className="w-4 h-4 text-slate-500" />
                    <span>Download Blank Template</span>
                  </button>
                </div>

                {parsing && (
                  <div className="mt-4 flex items-center space-x-2 text-xs font-bold text-blue-600">
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Parsing Excel and verifying with Machine Master...</span>
                  </div>
                )}

                {parseError && (
                  <div className="mt-4 p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center space-x-2 max-w-md">
                    <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                    <span className="text-left">{parseError}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* STEP 2: VALIDATION & PREVIEW */}
          {currentStep === 2 && validationResult && (
            <div className="space-y-6">
              {/* Summary KPI Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
                <div className="p-3 bg-white rounded-2xl border border-slate-200 shadow-2xs">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                    Total Rows
                  </span>
                  <span className="text-xl font-black text-slate-900 font-mono">
                    {validationResult.totalRows}
                  </span>
                </div>

                <div className="p-3 bg-emerald-50 rounded-2xl border border-emerald-200 shadow-2xs">
                  <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider block">
                    Valid Rows
                  </span>
                  <span className="text-xl font-black text-emerald-700 font-mono">
                    {validationResult.validRowsCount}
                  </span>
                </div>

                <div className="p-3 bg-rose-50 rounded-2xl border border-rose-200 shadow-2xs">
                  <span className="text-[10px] font-bold text-rose-600 uppercase tracking-wider block">
                    Invalid Rows
                  </span>
                  <span className="text-xl font-black text-rose-700 font-mono">
                    {validationResult.invalidRowsCount}
                  </span>
                </div>

                <div className="p-3 bg-amber-50 rounded-2xl border border-amber-200 shadow-2xs">
                  <span className="text-[10px] font-bold text-amber-600 uppercase tracking-wider block">
                    Duplicates
                  </span>
                  <span className="text-xl font-black text-amber-700 font-mono">
                    {validationResult.duplicateRowsCount}
                  </span>
                </div>

                <div className="p-3 bg-indigo-50 rounded-2xl border border-indigo-200 shadow-2xs">
                  <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider block">
                    Discrepancies
                  </span>
                  <span className="text-xl font-black text-indigo-700 font-mono">
                    {validationResult.sizeDiscrepanciesCount}
                  </span>
                </div>

                <div className="p-3 bg-blue-50 rounded-2xl border border-blue-200 shadow-2xs">
                  <span className="text-[10px] font-bold text-blue-600 uppercase tracking-wider block">
                    Unresolved
                  </span>
                  <span className="text-xl font-black text-blue-700 font-mono">
                    {validationResult.unresolvedMachinesCount}
                  </span>
                </div>

                <div className="p-3 bg-purple-50 rounded-2xl border border-purple-200 shadow-2xs">
                  <span className="text-[10px] font-bold text-purple-600 uppercase tracking-wider block">
                    Plan Target
                  </span>
                  <span className="text-xl font-black text-purple-700 font-mono">
                    {planType === 'monthly' ? `${month} '${year.slice(-2)}` : `W${weekNumber}`}
                  </span>
                </div>
              </div>

              {/* Action Toolbar for Preview Table */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-slate-200">
                <div className="flex items-center space-x-2">
                  <input
                    type="text"
                    value={previewSearch}
                    onChange={(e) => setPreviewSearch(e.target.value)}
                    placeholder="Search CMM # or Size..."
                    className="text-xs px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-800 focus:bg-white w-48 sm:w-60"
                  />

                  <div className="flex items-center bg-slate-100 p-0.5 rounded-xl text-xs font-bold">
                    <button
                      type="button"
                      onClick={() => setPreviewFilter('all')}
                      className={`px-2.5 py-1 rounded-lg ${
                        previewFilter === 'all' ? 'bg-white shadow-2xs text-slate-900' : 'text-slate-500'
                      }`}
                    >
                      All ({validationResult.rows.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setPreviewFilter('valid')}
                      className={`px-2.5 py-1 rounded-lg ${
                        previewFilter === 'valid' ? 'bg-white shadow-2xs text-emerald-700' : 'text-slate-500'
                      }`}
                    >
                      Valid ({validationResult.validRowsCount})
                    </button>
                    <button
                      type="button"
                      onClick={() => setPreviewFilter('invalid')}
                      className={`px-2.5 py-1 rounded-lg ${
                        previewFilter === 'invalid' ? 'bg-white shadow-2xs text-rose-700' : 'text-slate-500'
                      }`}
                    >
                      Invalid ({validationResult.invalidRowsCount})
                    </button>
                    <button
                      type="button"
                      onClick={() => setPreviewFilter('warning')}
                      className={`px-2.5 py-1 rounded-lg ${
                        previewFilter === 'warning' ? 'bg-white shadow-2xs text-amber-700' : 'text-slate-500'
                      }`}
                    >
                      Warnings ({validationResult.warnings.length})
                    </button>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={handleDownloadErrorReport}
                    className="px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-bold transition flex items-center space-x-1.5"
                  >
                    <Download className="w-3.5 h-3.5 text-slate-500" />
                    <span>Download Error Report</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => downloadFourColumnPlanTemplate(planType)}
                    className="px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-bold transition flex items-center space-x-1.5"
                  >
                    <Download className="w-3.5 h-3.5 text-slate-500" />
                    <span>Blank Template</span>
                  </button>
                </div>
              </div>

              {/* Duplicate or Overwrite Warning if detected */}
              {duplicateWarning && (
                <div className="p-4 bg-amber-50 border border-amber-300 rounded-2xl flex items-start space-x-3">
                  <AlertOctagon className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <div className="text-xs text-amber-900 flex-1">
                    <p className="font-bold mb-1">Existing Plan Period Detected</p>
                    <p>{duplicateWarning}</p>
                    <label className="mt-2.5 flex items-center space-x-2 font-bold cursor-pointer text-amber-950">
                      <input
                        type="checkbox"
                        checked={overwriteExisting}
                        onChange={(e) => setOverwriteExisting(e.target.checked)}
                        className="rounded border-amber-400 text-blue-600 focus:ring-blue-500"
                      />
                      <span>
                        Yes, explicitly update/overwrite official plan records for this period (preserves historical logs)
                      </span>
                    </label>
                  </div>
                </div>
              )}

              {/* Preview Table */}
              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs">
                <div className="overflow-x-auto max-h-96">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 sticky top-0 z-10 text-slate-600 font-bold uppercase tracking-wider text-[10px]">
                      <tr>
                        <th className="p-3 w-16 text-center">Row #</th>
                        <th className="p-3 w-20 text-center">SR.NO.</th>
                        <th className="p-3 w-32">CMM NO</th>
                        <th className="p-3 w-28">CMM SIZE</th>
                        <th className="p-3 w-16 text-right">Qty</th>
                        <th className="p-3">Machine Master Status</th>
                        <th className="p-3">Customer / Project</th>
                        <th className="p-3 text-center w-28">Validation</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {displayedRows.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="p-8 text-center text-slate-400">
                            No rows matching current filter criteria.
                          </td>
                        </tr>
                      ) : (
                        displayedRows.map((r) => {
                          return (
                            <tr
                              key={`row-${r.rowNumber}-${r.srNo}-${r.cmmNo}`}
                              className={`hover:bg-slate-50 transition ${
                                !r.isValid
                                  ? 'bg-rose-50/40'
                                  : r.sizeDiscrepancy
                                  ? 'bg-indigo-50/40'
                                  : r.unresolvedMachine
                                  ? 'bg-blue-50/30'
                                  : ''
                              }`}
                            >
                              <td className="p-3 text-center text-slate-400 font-mono">
                                {r.rowNumber}
                              </td>
                              <td className="p-3 text-center font-black text-blue-600 font-mono">
                                {r.srNo}
                              </td>
                              <td className="p-3 font-mono font-bold text-slate-900">
                                {r.cmmNo || <span className="text-rose-500 italic">Missing</span>}
                              </td>
                              <td className="p-3 font-semibold text-slate-800">
                                {r.cmmSize || <span className="text-rose-500 italic">Missing</span>}
                              </td>
                              <td className="p-3 text-right font-mono font-bold text-slate-800">
                                {r.qty}
                              </td>
                              <td className="p-3">
                                {r.existingMachine ? (
                                  <div className="flex items-center space-x-1.5 text-[11px]">
                                    <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                                    <span className="font-bold text-slate-800">
                                      Registered ({r.existingMachine.model})
                                    </span>
                                  </div>
                                ) : (
                                  <div className="flex items-center space-x-1.5 text-[11px] text-blue-700">
                                    <HelpCircle className="w-3.5 h-3.5 shrink-0" />
                                    <span>Unregistered in Master</span>
                                  </div>
                                )}
                                {r.sizeDiscrepancy && (
                                  <span className="block text-[10px] text-indigo-700 font-medium mt-0.5">
                                    {r.warning}
                                  </span>
                                )}
                              </td>
                              <td className="p-3 text-slate-600 text-[11px]">
                                {r.existingMachine?.customer || r.existingMachine?.project ? (
                                  <span>
                                    {r.existingMachine.customer || '—'} /{' '}
                                    {r.existingMachine.project || '—'}
                                  </span>
                                ) : (
                                  <span className="text-slate-400 italic">Auto-linked on creation</span>
                                )}
                              </td>
                              <td className="p-3 text-center">
                                {r.isValid ? (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                    Valid
                                  </span>
                                ) : (
                                  <span
                                    title={r.error}
                                    className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200"
                                  >
                                    Error
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: CONFIRMATION & RECEIPT */}
          {currentStep === 3 && importSuccessResult && (
            <div className="space-y-6 max-w-xl mx-auto text-center py-6">
              <div className="w-20 h-20 bg-emerald-100 rounded-3xl flex items-center justify-center text-emerald-600 mx-auto shadow-sm">
                <FileCheck className="w-10 h-10" />
              </div>

              <div>
                <h3 className="text-xl font-black text-slate-900">
                  Plan Import Successfully Published!
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  The official {planType === 'monthly' ? 'monthly' : 'weekly'} manufacturing plan has been saved to Firestore and linked with the Machine Master.
                </p>
              </div>

              <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200 text-left space-y-2.5 text-xs">
                <div className="flex justify-between pb-2 border-b border-slate-200">
                  <span className="text-slate-500">Import Batch ID:</span>
                  <span className="font-mono font-bold text-slate-900">
                    {importSuccessResult.batchId}
                  </span>
                </div>
                <div className="flex justify-between pb-2 border-b border-slate-200">
                  <span className="text-slate-500">Plan Period:</span>
                  <span className="font-bold text-slate-900">
                    {planType === 'monthly' ? `${month} ${year}` : `Week ${weekNumber} (${year})`}
                  </span>
                </div>
                <div className="flex justify-between pb-2 border-b border-slate-200">
                  <span className="text-slate-500">Imported Machines:</span>
                  <span className="font-bold text-emerald-600 font-mono">
                    {importSuccessResult.importedCount} machines
                  </span>
                </div>
                <div className="flex justify-between pb-2 border-b border-slate-200">
                  <span className="text-slate-500">Unresolved Machines:</span>
                  <span className="font-bold text-blue-600 font-mono">
                    {importSuccessResult.unresolvedCount} (will link upon master creation)
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Size Discrepancy Warnings:</span>
                  <span className="font-bold text-amber-600 font-mono">
                    {importSuccessResult.warningsCount}
                  </span>
                </div>
              </div>

              <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-left text-xs text-blue-900 flex items-start space-x-2.5">
                <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                <p>
                  <strong>Priority Sequence Activated:</strong> All manufacturing and quality departments now display these planned machines in priority sequence (SR.NO.). Work updates will automatically unlock as machines are handed over and accepted.
                </p>
              </div>

              <div className="flex items-center justify-center space-x-3 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-sm transition"
                >
                  Done & Return to Dashboard
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer Navigation */}
        <div className="bg-slate-50 border-t border-slate-200 px-6 py-4 flex items-center justify-between">
          {currentStep === 1 ? (
            <div>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-900 hover:bg-slate-200 rounded-xl transition"
              >
                Cancel
              </button>
            </div>
          ) : currentStep === 2 ? (
            <div className="flex items-center justify-between w-full">
              <button
                type="button"
                onClick={() => setCurrentStep(1)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-900 hover:bg-slate-200 rounded-xl transition flex items-center space-x-1.5"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back to File Upload</span>
              </button>

              <div className="flex items-center space-x-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-900 hover:bg-slate-200 rounded-xl transition"
                >
                  Cancel
                </button>

                <button
                  type="button"
                  onClick={handleConfirmImport}
                  disabled={importing || (validationResult?.validRowsCount || 0) === 0}
                  className={`px-5 py-2.5 rounded-xl text-xs font-black shadow-sm transition flex items-center space-x-2 ${
                    importing || (validationResult?.validRowsCount || 0) === 0
                      ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                      : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                  }`}
                >
                  {importing ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Saving to Firestore & Machine Master...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Confirm & Publish Official Plan ({validationResult?.validRowsCount} Rows)</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex justify-end w-full">
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800 transition"
              >
                Close
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export const AdminPlanExcelImportModal: React.FC<AdminPlanExcelImportModalProps> = (props) => {
  if (!props.isOpen) return null;
  return <AdminPlanExcelImportModalContent {...props} />;
};
