import React, { useState, useRef } from 'react';
import {
  Upload,
  X,
  FileSpreadsheet,
  AlertCircle,
  CheckCircle2,
  AlertTriangle,
  Download,
  Building,
  Layers,
  ArrowRight,
  RotateCcw,
  RefreshCw,
  FileText,
  Info,
} from 'lucide-react';
import {
  MONTHLY_PLAN_GROUP_1_DEPTS,
  MONTHLY_PLAN_GROUP_2_DEPTS,
  ALL_MONTHLY_PLAN_DEPTS,
} from '../../constants';
import {
  downloadMonthlyPlanTemplate,
  downloadConsolidatedMonthlyPlanTemplate,
  parseMonthlyPlanExcel,
  saveMonthlyPlanBatch,
  MonthlyPlanParseResult,
  ValidatedMonthlyPlanRow,
} from '../../services/monthlyPlanService';
import { useAuth } from '../../context/AuthContext';

interface MonthlyPlanExcelUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  initialDepartment?: string;
  initialMonth?: string;
  initialYear?: string;
}

export const MonthlyPlanExcelUploadModal: React.FC<MonthlyPlanExcelUploadModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  initialDepartment,
  initialMonth = 'October',
  initialYear = '2026',
}) => {
  const { userProfile } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form selections
  const [financialYear, setFinancialYear] = useState('2026-2027');
  const [calendarYear, setCalendarYear] = useState(initialYear);
  const [month, setMonth] = useState(initialMonth);
  const [uploadScope, setUploadScope] = useState<'single' | 'consolidated'>('single');
  const [departmentGroup, setDepartmentGroup] = useState<'GROUP_1' | 'GROUP_2'>('GROUP_1');
  const [selectedDepartment, setSelectedDepartment] = useState(
    initialDepartment && initialDepartment !== 'All Departments'
      ? initialDepartment
      : '02 Planning'
  );

  // File parsing states
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parseResult, setParseResult] = useState<MonthlyPlanParseResult | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);

  // Import mode
  const [importMode, setImportMode] = useState<'replace' | 'add' | 'update'>('replace');
  const [skipInvalid, setSkipInvalid] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState<{
    inserted: number;
    replacedDepts: string[];
  } | null>(null);

  if (!isOpen) return null;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedFile(file);
    setParseError(null);
    setParsing(true);

    try {
      const res = await parseMonthlyPlanExcel(file, {
        selectedDepartment: uploadScope === 'single' ? selectedDepartment : undefined,
        isConsolidatedUpload: uploadScope === 'consolidated',
        targetDepartmentGroup: uploadScope === 'single' ? departmentGroup : 'ALL',
      });
      setParseResult(res);
    } catch (err: any) {
      console.error('File parsing error:', err);
      setParseError(err?.message || 'Failed to parse Excel file. Please ensure it has valid sheets and data.');
      setParseResult(null);
    } finally {
      setParsing(false);
    }
  };

  const handleDownloadTemplate = () => {
    if (uploadScope === 'consolidated') {
      downloadConsolidatedMonthlyPlanTemplate();
    } else {
      downloadMonthlyPlanTemplate(selectedDepartment);
    }
  };

  const handleDownloadErrorReport = () => {
    if (!parseResult || parseResult.invalidRows.length === 0) return;
    const errorText = parseResult.invalidRows
      .map(
        (r) =>
          `Row ${r.rowNumber} (${r.departmentName}): Machine="${r.machineNumber}", Size="${r.machineSize}", Qty="${r.quantity}". Errors: ${r.errors.join('; ')}`
      )
      .join('\n');

    const blob = new Blob([errorText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Monthly_Plan_Import_Errors_${Date.now()}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleExecuteImport = async () => {
    if (!parseResult) return;

    const rowsToImport = skipInvalid ? parseResult.validRows : parseResult.allRows.filter((r) => r.isValid);
    if (rowsToImport.length === 0) {
      setParseError('No valid rows available to import.');
      return;
    }

    setIsSubmitting(true);
    setParseError(null);

    try {
      const result = await saveMonthlyPlanBatch({
        rows: rowsToImport,
        mode: importMode,
        financialYear,
        year: calendarYear,
        month,
        userEmail: userProfile?.email || userProfile?.username || 'Admin',
      });

      setSubmitSuccess({
        inserted: result.insertedCount,
        replacedDepts: result.replacedDepartments,
      });

      setTimeout(() => {
        onSuccess();
      }, 1500);
    } catch (err: any) {
      console.error('Import save error:', err);
      setParseError(err?.message || 'Failed to save monthly plans to database.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const activeGroupDepts =
    departmentGroup === 'GROUP_1' ? MONTHLY_PLAN_GROUP_1_DEPTS : MONTHLY_PLAN_GROUP_2_DEPTS;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/70 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white w-full max-w-4xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Modal Header */}
        <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-blue-900 text-white px-6 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600/30 border border-blue-400/40 flex items-center justify-center text-blue-300">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-black tracking-tight">
                Monthly Plan Excel Upload &amp; Department Distribution
              </h3>
              <p className="text-xs text-slate-300 mt-0.5">
                Exact 4-Column Format: <strong>Machine Number &bull; Machine Size &bull; Priority &bull; Quantity</strong>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* STEP 1: Select Plan Period & Scope */}
          <div className="bg-slate-50 rounded-2xl p-4 sm:p-5 border border-slate-200 space-y-4">
            <div className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
              <span className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px]">1</span>
              <span>Step 1: Select Plan Period &amp; Upload Scope</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {/* Financial Year */}
              <div>
                <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                  Financial Year:
                </label>
                <select
                  value={financialYear}
                  onChange={(e) => setFinancialYear(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="2026-2027">FY 2026-2027</option>
                  <option value="2025-2026">FY 2025-2026</option>
                  <option value="2024-2025">FY 2024-2025</option>
                </select>
              </div>

              {/* Month */}
              <div>
                <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                  Month:
                </label>
                <select
                  value={month}
                  onChange={(e) => setMonth(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {[
                    'January',
                    'February',
                    'March',
                    'April',
                    'May',
                    'June',
                    'July',
                    'August',
                    'September',
                    'October',
                    'November',
                    'December',
                  ].map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>

              {/* Calendar Year */}
              <div>
                <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                  Calendar Year:
                </label>
                <select
                  value={calendarYear}
                  onChange={(e) => setCalendarYear(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="2026">2026</option>
                  <option value="2025">2025</option>
                  <option value="2027">2027</option>
                </select>
              </div>

              {/* Upload Scope */}
              <div>
                <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                  Upload Scope:
                </label>
                <select
                  value={uploadScope}
                  onChange={(e) => {
                    const sc = e.target.value as 'single' | 'consolidated';
                    setUploadScope(sc);
                    setParseResult(null);
                  }}
                  className="w-full bg-indigo-50 border border-indigo-200 rounded-xl px-3 py-2 text-xs font-bold text-indigo-900 outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="single">Single Department File</option>
                  <option value="consolidated">Consolidated Multi-Dept File</option>
                </select>
              </div>
            </div>

            {/* Department Selection (when Single Department upload is chosen) */}
            {uploadScope === 'single' && (
              <div className="pt-2 border-t border-slate-200 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                    Department Group:
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setDepartmentGroup('GROUP_1');
                        setSelectedDepartment(MONTHLY_PLAN_GROUP_1_DEPTS[0].name);
                      }}
                      className={`px-3 py-2 rounded-xl text-xs font-bold border transition ${
                        departmentGroup === 'GROUP_1'
                          ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                          : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                      }`}
                    >
                      Group 1 (02 to 11-A)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setDepartmentGroup('GROUP_2');
                        setSelectedDepartment(MONTHLY_PLAN_GROUP_2_DEPTS[0].name);
                      }}
                      className={`px-3 py-2 rounded-xl text-xs font-bold border transition ${
                        departmentGroup === 'GROUP_2'
                          ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                          : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                      }`}
                    >
                      Group 2 (11-B to 16)
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                    Target Department:
                  </label>
                  <select
                    value={selectedDepartment}
                    onChange={(e) => setSelectedDepartment(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-blue-500 shadow-2xs cursor-pointer"
                  >
                    {activeGroupDepts.map((d) => (
                      <option key={d.code} value={d.name}>
                        {d.code} &bull; {d.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </div>

          {/* STEP 2: File Upload & Template Download */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                <span className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px]">2</span>
                <span>Step 2: Choose Excel / CSV File</span>
              </div>
              <button
                type="button"
                onClick={handleDownloadTemplate}
                className="text-xs font-bold text-blue-600 hover:text-blue-800 flex items-center space-x-1 transition"
              >
                <Download className="w-3.5 h-3.5" />
                <span>
                  {uploadScope === 'consolidated' ? 'Download Consolidated Template' : 'Download 4-Column Template'}
                </span>
              </button>
            </div>

            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-slate-300 hover:border-blue-500 bg-slate-50/60 hover:bg-blue-50/30 rounded-2xl p-6 sm:p-8 text-center cursor-pointer transition group"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx, .xls, .csv"
                onChange={handleFileChange}
                className="hidden"
              />
              <div className="w-12 h-12 mx-auto rounded-2xl bg-blue-100 text-blue-600 flex items-center justify-center group-hover:scale-105 transition-transform">
                <Upload className="w-6 h-6" />
              </div>
              <div className="mt-3 text-xs sm:text-sm font-bold text-slate-900">
                {selectedFile ? selectedFile.name : 'Click to select or drop Monthly Plan Excel / CSV'}
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                Supports .xlsx, .xls, and .csv files with columns: <strong>Machine Number</strong>, <strong>Machine Size</strong>, <strong>Priority</strong>, <strong>Quantity</strong>
              </p>
            </div>

            {parsing && (
              <div className="p-3 bg-blue-50 text-blue-800 rounded-xl text-xs font-bold flex items-center space-x-2">
                <RefreshCw className="w-4 h-4 animate-spin text-blue-600" />
                <span>Parsing and strictly validating Excel format...</span>
              </div>
            )}

            {parseError && (
              <div className="p-3 bg-red-50 text-red-800 border border-red-200 rounded-xl text-xs flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                  <span>{parseError}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setParseError(null)}
                  className="text-red-700 hover:text-red-900 font-bold"
                >
                  Dismiss
                </button>
              </div>
            )}
          </div>

          {/* STEP 3: Preview & Validation Metrics */}
          {parseResult && (
            <div className="space-y-4">
              <div className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                <span className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px]">3</span>
                <span>Step 3: Verification &amp; Department Distribution Preview</span>
              </div>

              {/* Metric Badges */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-slate-100 p-3 rounded-xl border border-slate-200">
                  <span className="text-[10px] uppercase font-bold text-slate-500 block">Total Rows</span>
                  <span className="text-xl font-black text-slate-900 font-mono mt-0.5 block">
                    {parseResult.totalRows}
                  </span>
                </div>
                <div className="bg-emerald-50 p-3 rounded-xl border border-emerald-200">
                  <span className="text-[10px] uppercase font-bold text-emerald-700 block">Valid Rows</span>
                  <span className="text-xl font-black text-emerald-700 font-mono mt-0.5 block">
                    {parseResult.validRows.length}
                  </span>
                </div>
                <div className="bg-red-50 p-3 rounded-xl border border-red-200">
                  <span className="text-[10px] uppercase font-bold text-red-700 block">Invalid Rows</span>
                  <span className="text-xl font-black text-red-700 font-mono mt-0.5 block">
                    {parseResult.invalidRows.length}
                  </span>
                </div>
                <div className="bg-amber-50 p-3 rounded-xl border border-amber-200">
                  <span className="text-[10px] uppercase font-bold text-amber-800 block">Duplicates Detected</span>
                  <span className="text-xl font-black text-amber-800 font-mono mt-0.5 block">
                    {parseResult.duplicateRows.length}
                  </span>
                </div>
              </div>

              {/* Department breakdown chips */}
              <div className="bg-indigo-50/60 p-3.5 rounded-xl border border-indigo-200 space-y-2">
                <span className="text-[11px] font-black text-indigo-900 uppercase tracking-wider block">
                  Automatic Department Distribution ({parseResult.departmentsDetected.length} Departments):
                </span>
                <div className="flex flex-wrap gap-2">
                  {parseResult.departmentsDetected.map((item) => (
                    <span
                      key={item.dept.code}
                      className="px-2.5 py-1 rounded-lg bg-white border border-indigo-200 text-xs font-bold text-indigo-950 shadow-2xs flex items-center space-x-1.5"
                    >
                      <span className="font-mono text-indigo-600">{item.dept.code}</span>
                      <span>{item.dept.label}:</span>
                      <span className="text-emerald-700">{item.rowCount} machines ({item.totalQuantity} units)</span>
                    </span>
                  ))}
                </div>
              </div>

              {/* Invalid Rows Notice & Action */}
              {parseResult.invalidRows.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                  <div className="flex items-center space-x-2 text-amber-900">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>
                      {parseResult.invalidRows.length} row(s) failed validation. Check machine number, size, or quantity.
                    </span>
                  </div>
                  <div className="flex items-center space-x-3">
                    <button
                      type="button"
                      onClick={handleDownloadErrorReport}
                      className="text-amber-800 font-bold underline hover:text-amber-950"
                    >
                      Download Error Report
                    </button>
                    <label className="flex items-center space-x-1 text-slate-700 font-bold cursor-pointer">
                      <input
                        type="checkbox"
                        checked={skipInvalid}
                        onChange={(e) => setSkipInvalid(e.target.checked)}
                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span>Skip invalid &amp; import valid</span>
                    </label>
                  </div>
                </div>
              )}

              {/* Preview Table */}
              <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs max-h-56 overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 text-slate-700 font-bold uppercase text-[10px] sticky top-0">
                    <tr>
                      <th className="p-2.5">Row</th>
                      <th className="p-2.5">Department</th>
                      <th className="p-2.5">Machine Number</th>
                      <th className="p-2.5">Machine Size</th>
                      <th className="p-2.5">Priority</th>
                      <th className="p-2.5 text-center">Qty</th>
                      <th className="p-2.5">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {parseResult.allRows.slice(0, 50).map((r, idx) => (
                      <tr key={idx} className={r.isValid ? 'hover:bg-slate-50' : 'bg-red-50/50'}>
                        <td className="p-2.5 font-mono text-slate-500">{r.rowNumber}</td>
                        <td className="p-2.5 font-bold text-slate-800">
                          <span className="font-mono text-blue-600 mr-1">{r.departmentCode}</span>
                          {r.departmentName}
                        </td>
                        <td className="p-2.5 font-mono font-bold text-slate-900">{r.machineNumber || '—'}</td>
                        <td className="p-2.5 text-slate-700">{r.machineSize || '—'}</td>
                        <td className="p-2.5">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              r.priority === 'Urgent'
                                ? 'bg-red-100 text-red-800'
                                : r.priority === 'High'
                                ? 'bg-amber-100 text-amber-800'
                                : r.priority === 'Low'
                                ? 'bg-slate-100 text-slate-700'
                                : 'bg-blue-100 text-blue-800'
                            }`}
                          >
                            {r.priority}
                          </span>
                        </td>
                        <td className="p-2.5 font-mono font-bold text-center text-slate-900">{r.quantity}</td>
                        <td className="p-2.5">
                          {r.isValid ? (
                            <span className="text-emerald-700 font-bold flex items-center space-x-1 text-[11px]">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Valid</span>
                            </span>
                          ) : (
                            <span
                              className="text-red-700 font-bold flex items-center space-x-1 text-[11px]"
                              title={r.errors.join('; ')}
                            >
                              <AlertCircle className="w-3.5 h-3.5" />
                              <span className="truncate max-w-[150px]">{r.errors[0]}</span>
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* STEP 4: Choose Import Mode (Add vs Replace) */}
              <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 space-y-3">
                <div className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px]">4</span>
                  <span>Step 4: Select Import Mode for {month} {calendarYear}</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <label
                    className={`p-3 rounded-xl border cursor-pointer transition ${
                      importMode === 'replace'
                        ? 'bg-rose-50/80 border-rose-300 ring-2 ring-rose-400'
                        : 'bg-white border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <input
                      type="radio"
                      name="importMode"
                      value="replace"
                      checked={importMode === 'replace'}
                      onChange={() => setImportMode('replace')}
                      className="sr-only"
                    />
                    <div className="text-xs font-black text-rose-900">
                      3. Replace Monthly Plan
                    </div>
                    <div className="text-[11px] text-rose-700 mt-1">
                      Wipes prior plan for affected departments in {month} {calendarYear} and writes fresh records.
                    </div>
                  </label>

                  <label
                    className={`p-3 rounded-xl border cursor-pointer transition ${
                      importMode === 'add'
                        ? 'bg-blue-50/80 border-blue-300 ring-2 ring-blue-400'
                        : 'bg-white border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <input
                      type="radio"
                      name="importMode"
                      value="add"
                      checked={importMode === 'add'}
                      onChange={() => setImportMode('add')}
                      className="sr-only"
                    />
                    <div className="text-xs font-black text-blue-900">
                      1. Add New Records
                    </div>
                    <div className="text-[11px] text-blue-700 mt-1">
                      Appends all uploaded rows to the existing monthly plan without removing prior entries.
                    </div>
                  </label>

                  <label
                    className={`p-3 rounded-xl border cursor-pointer transition ${
                      importMode === 'update'
                        ? 'bg-indigo-50/80 border-indigo-300 ring-2 ring-indigo-400'
                        : 'bg-white border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <input
                      type="radio"
                      name="importMode"
                      value="update"
                      checked={importMode === 'update'}
                      onChange={() => setImportMode('update')}
                      className="sr-only"
                    />
                    <div className="text-xs font-black text-indigo-900">
                      2. Update Existing Records
                    </div>
                    <div className="text-[11px] text-indigo-700 mt-1">
                      Updates matching machine numbers with new size, priority, or quantity.
                    </div>
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* Success state */}
          {submitSuccess && (
            <div className="p-4 bg-emerald-50 border border-emerald-300 rounded-2xl text-emerald-900 space-y-1">
              <div className="font-bold flex items-center space-x-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                <span>Successfully imported {submitSuccess.inserted} monthly plan records!</span>
              </div>
              <p className="text-xs text-emerald-700">
                Data saved in Firestore `monthly_plans`. Department dashboards are now refreshed with their specific records.
              </p>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="bg-slate-100 px-6 py-4 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
          <div className="text-xs text-slate-500">
            {parseResult ? (
              <span>
                Ready to import <strong>{skipInvalid ? parseResult.validRows.length : parseResult.allRows.length}</strong> records into{' '}
                <strong>{month} {calendarYear}</strong>
              </span>
            ) : (
              <span>Upload an Excel or CSV file to validate and preview records</span>
            )}
          </div>

          <div className="flex items-center space-x-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-xl bg-white hover:bg-slate-200 text-slate-700 text-xs font-bold transition border border-slate-300"
            >
              Cancel
            </button>

            <button
              type="button"
              disabled={!parseResult || parseResult.validRows.length === 0 || isSubmitting}
              onClick={handleExecuteImport}
              className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold transition shadow-xs flex items-center space-x-1.5"
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Saving to Database...</span>
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4" />
                  <span>
                    Confirm &amp; Save Plan ({parseResult?.validRows.length || 0} Records)
                  </span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
