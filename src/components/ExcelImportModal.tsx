import React, { useState } from 'react';
import {
  FileSpreadsheet,
  Download,
  Upload,
  CheckCircle2,
  AlertTriangle,
  X,
  FileText,
} from 'lucide-react';
import {
  generateExcelTemplate,
  parseExcelFile,
  ExcelImportType,
} from '../utils/excel';
import {
  bulkImportMachines,
  bulkImportMonthlyPlans,
  bulkImportQualityOperations,
} from '../services/db';
import { useAuth } from '../context/AuthContext';

interface ExcelImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultType?: ExcelImportType;
}

export const ExcelImportModal: React.FC<ExcelImportModalProps> = ({
  isOpen,
  onClose,
  defaultType = 'planning',
}) => {
  const { userProfile } = useAuth();
  const [importType, setImportType] = useState<ExcelImportType>(defaultType);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [parsedRows, setParsedRows] = useState<any[]>([]);
  const [importing, setImporting] = useState(false);
  const [resultSummary, setResultSummary] = useState<{
    total: number;
    success: number;
    errors: number;
  } | null>(null);

  const [rowErrors, setRowErrors] = useState<string[]>([]);

  if (!isOpen) return null;

  const handleFileChange = async (file: File) => {
    setSelectedFile(file);
    setResultSummary(null);
    setRowErrors([]);
    try {
      const result = await parseExcelFile(file);
      const rows = result.rows || [];

      // Validate rows
      const errors: string[] = [];
      rows.forEach((r: any, idx: number) => {
        const rowNum = idx + 2; // header is row 1
        if (importType === 'planning') {
          if (!r.machineNumber && !r['Machine Number'] && !r.month && !r['Month']) {
            errors.push(`Row ${rowNum}: Missing machine number and month.`);
          }
        } else if (importType === 'machines') {
          if (!r.machineNumber && !r['Machine Number']) {
            errors.push(`Row ${rowNum}: Missing Machine Number.`);
          }
        }
      });

      setRowErrors(errors);
      setParsedRows(rows);
    } catch (err: any) {
      console.error(err);
      alert('Error parsing Excel file. Ensure it is a valid .xlsx, .xls, or .csv file.');
    }
  };

  const handleImportData = async () => {
    if (!parsedRows.length) return;
    setImporting(true);
    try {
      let count = 0;
      if (importType === 'planning') {
        count = await bulkImportMonthlyPlans(
          parsedRows,
          userProfile?.displayName || userProfile?.email || 'Admin'
        );
      } else if (importType === 'machines') {
        count = await bulkImportMachines(
          parsedRows,
          userProfile?.displayName || userProfile?.email || 'Admin'
        );
      } else if (importType === 'quality_ops') {
        count = await bulkImportQualityOperations(
          parsedRows,
          userProfile?.displayName || userProfile?.email || 'Quality'
        );
      }

      setResultSummary({
        total: parsedRows.length,
        success: count,
        errors: parsedRows.length - count,
      });
      setParsedRows([]);
      setSelectedFile(null);
    } catch (err) {
      console.error(err);
      alert('Import failed. Please review file format and data fields.');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden text-slate-900">
        <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-emerald-400" />
            <div>
              <h3 className="font-bold text-sm">Excel Import &amp; Template Center</h3>
              <p className="text-[11px] text-slate-400">
                Bulk import live historical or current factory data with validation
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
          {/* Step 1: Select Type */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
              1. Select Data Type
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'planning', label: 'Monthly Plans' },
                { id: 'machines', label: 'Machine Master' },
                { id: 'quality_ops', label: 'Quality Ops (Model)' },
              ].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    setImportType(t.id as ExcelImportType);
                    setParsedRows([]);
                    setSelectedFile(null);
                    setResultSummary(null);
                  }}
                  className={`p-2 text-xs font-bold rounded-lg border text-center transition ${
                    importType === t.id
                      ? 'bg-blue-50 border-blue-600 text-blue-700'
                      : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Step 2: Download Standard Template */}
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between">
            <div className="text-xs">
              <div className="font-bold text-emerald-900">
                Standard Excel Template ({importType})
              </div>
              <div className="text-emerald-700 text-[11px]">
                Download official format headers for accurate import.
              </div>
            </div>

            <button
              type="button"
              onClick={() => generateExcelTemplate(importType)}
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 shadow-xs transition"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download Template</span>
            </button>
          </div>

          {/* Step 3: Upload file */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
              2. Upload Excel (.xlsx or .xls)
            </label>
            <div className="border-2 border-dashed border-slate-300 hover:border-blue-500 rounded-xl p-6 text-center cursor-pointer bg-slate-50 transition relative">
              <input
                type="file"
                accept=".xlsx, .xls, .csv"
                onChange={(e) => {
                  if (e.target.files?.[0]) handleFileChange(e.target.files[0]);
                }}
                className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
              />
              <Upload className="w-8 h-8 text-slate-400 mx-auto mb-2" />
              <div className="text-xs font-bold text-slate-700">
                {selectedFile ? selectedFile.name : 'Click to select or drag and drop Excel file'}
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">
                Supports real factory sheets with columns matching the template
              </div>
            </div>
          </div>

          {/* Row Validation Warnings */}
          {rowErrors.length > 0 && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl space-y-1 text-xs">
              <div className="font-bold text-amber-900 flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                <span>Validation Warnings ({rowErrors.length} issues detected)</span>
              </div>
              <ul className="list-disc pl-5 text-[11px] text-amber-800 space-y-0.5 max-h-24 overflow-y-auto">
                {rowErrors.map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Parsed Preview Table */}
          {parsedRows.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-800">
                  Ready to Import: {parsedRows.length} rows found
                </span>
                <span className="text-slate-400 text-[11px]">Previewing first 5 rows</span>
              </div>

              <div className="border border-slate-200 rounded-xl overflow-hidden overflow-x-auto max-h-48">
                <table className="w-full text-left text-xs whitespace-nowrap">
                  <thead className="bg-slate-100 text-slate-600 text-[10px] font-bold uppercase">
                    <tr>
                      <th className="p-2 pl-3">#</th>
                      <th className="p-2">Machine Number</th>
                      <th className="p-2">Model / Size</th>
                      <th className="p-2">Month</th>
                      <th className="p-2">Department</th>
                      <th className="p-2">Qty</th>
                      <th className="p-2 pr-3">Target Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {parsedRows.slice(0, 5).map((r, i) => (
                      <tr key={i} className="hover:bg-slate-50 font-mono text-[11px]">
                        <td className="p-2 pl-3 text-slate-400">{i + 1}</td>
                        <td className="p-2 font-bold text-slate-900">
                          {r.machineNumber || r['Machine Number'] || '—'}
                        </td>
                        <td className="p-2 text-slate-700">
                          {r.model || r.machineModel || r['Model'] || 'Standard'}
                        </td>
                        <td className="p-2 text-slate-700">{r.month || r['Month'] || '—'}</td>
                        <td className="p-2 text-indigo-700 font-bold">
                          {r.department || r['Department'] || 'Design'}
                        </td>
                        <td className="p-2 text-slate-800">
                          {r.plannedQuantity || r.quantity || r['Quantity'] || 1}
                        </td>
                        <td className="p-2 pr-3 text-slate-600">
                          {r.plannedDate || r.targetDate || r['Target Date'] || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Requirement 12: Confirm Import Explanation Box */}
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs space-y-1">
                <div className="font-bold text-blue-900">Automatic Creation Pipeline:</div>
                <div className="text-[11px] text-blue-800 space-y-0.5">
                  <div>&bull; Monthly Plan Records in database</div>
                  <div>&bull; Machine Records with master attributes</div>
                  <div>&bull; Initial Department Work assigned to first stage</div>
                  <div>&bull; 20-Stage Factory Timeline entries</div>
                </div>
              </div>

              <button
                type="button"
                onClick={handleImportData}
                disabled={importing}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-sm transition disabled:opacity-50"
              >
                {importing
                  ? 'Importing into Database...'
                  : `Confirm & Bulk Insert ${parsedRows.length} Records`}
              </button>
            </div>
          )}

          {/* Import Result Summary */}
          {resultSummary && (
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-xs space-y-1">
              <div className="font-bold text-emerald-900 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>Import Complete!</span>
              </div>
              <div className="text-slate-700">
                Total Rows in File: <strong>{resultSummary.total}</strong>
              </div>
              <div className="text-emerald-700">
                Successfully Added to Clean Database: <strong>{resultSummary.success}</strong>
              </div>
              {resultSummary.errors > 0 && (
                <div className="text-amber-700">
                  Skipped / Invalid Rows: <strong>{resultSummary.errors}</strong>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="p-3 bg-slate-50 border-t border-slate-200 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 text-xs text-slate-600 hover:bg-slate-200 rounded-lg font-semibold"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
