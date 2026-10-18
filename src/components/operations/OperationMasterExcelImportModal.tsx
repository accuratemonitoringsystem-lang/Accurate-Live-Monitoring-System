import React, { useState, useRef, useMemo, useEffect } from 'react';
import * as XLSX from 'xlsx';
import {
  Upload,
  FileSpreadsheet,
  Download,
  CheckCircle2,
  AlertTriangle,
  X,
  FileText,
  Boxes,
  Layers,
  ArrowRight,
  Filter,
  Check,
  AlertCircle,
  HelpCircle,
  ListTree,
  Table as TableIcon,
} from 'lucide-react';
import {
  DepartmentMachineSize,
  DepartmentPart,
  DepartmentOperation,
} from '../../types';
import {
  bulkImportDepartmentOperationsFromExcel,
  ExcelImportSummary,
} from '../../services/operationMasterService';
import { downloadOperationMasterExcelTemplate } from '../../utils/excel';
import { useAuth } from '../../context/AuthContext';

export interface PreviewRow {
  excelRowNum: number;
  machineSize: string;
  part: string;
  operation: string;
  status: 'NEW' | 'DUPLICATE' | 'ERROR';
  statusReason?: string;
}

interface OperationMasterExcelImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  departmentName: string;
  existingMachineSizes: DepartmentMachineSize[];
  existingParts: DepartmentPart[];
  existingOperations: DepartmentOperation[];
  onImportSuccess: (summary: ExcelImportSummary) => void;
}

export const OperationMasterExcelImportModal: React.FC<
  OperationMasterExcelImportModalProps
> = ({
  isOpen,
  onClose,
  departmentName,
  existingMachineSizes,
  existingParts,
  existingOperations,
  onImportSuccess,
}) => {
  const { userProfile } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([]);
  const [filterTab, setFilterTab] = useState<'all' | 'new' | 'duplicate' | 'error'>('all');
  const [viewMode, setViewMode] = useState<'table' | 'hierarchy'>('table');
  const [importing, setImporting] = useState(false);

  // Clean up state when modal is closed
  useEffect(() => {
    if (!isOpen) {
      setSelectedFile(null);
      setPreviewRows([]);
      setParseError(null);
      setFilterTab('all');
      setViewMode('table');
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }, [isOpen]);

  // Handle file selection and parsing
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await processFile(file);
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) {
      await processFile(file);
    }
  };

  const processFile = async (file: File) => {
    setSelectedFile(file);
    setParsing(true);
    setParseError(null);
    setPreviewRows([]);

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
        throw new Error('The uploaded Excel file contains no readable worksheets.');
      }

      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      const rawData = XLSX.utils.sheet_to_json<any[]>(worksheet, {
        header: 1,
        defval: '',
        blankrows: false,
      });

      if (!rawData || rawData.length === 0) {
        throw new Error('The selected Excel sheet appears to be empty.');
      }

      // Step 1: Detect header row and column indexes
      let headerRowIdx = -1;
      let sizeColIdx = -1;
      let partColIdx = -1;
      let opColIdx = -1;

      for (let r = 0; r < Math.min(rawData.length, 10); r++) {
        const row = rawData[r] as any[];
        if (!Array.isArray(row)) continue;

        let sIdx = -1;
        let pIdx = -1;
        let oIdx = -1;

        row.forEach((cell, idx) => {
          const str = String(cell || '').trim().toLowerCase();
          if (/machine\s*size|size|machine\s*model|model/i.test(str) && sIdx === -1) {
            sIdx = idx;
          } else if (/^part$|part\s*name|component/i.test(str) && pIdx === -1) {
            pIdx = idx;
          } else if (/operation|op\s*name|process|task/i.test(str) && oIdx === -1) {
            oIdx = idx;
          }
        });

        if (sIdx !== -1 && pIdx !== -1 && oIdx !== -1) {
          headerRowIdx = r;
          sizeColIdx = sIdx;
          partColIdx = pIdx;
          opColIdx = oIdx;
          break;
        }
      }

      // Fallback: If strict header names weren't found, try columns 0, 1, 2
      if (headerRowIdx === -1) {
        // Assume row 0 is header with 3 columns
        const firstRow = rawData[0] as any[];
        if (firstRow && firstRow.length >= 3) {
          headerRowIdx = 0;
          sizeColIdx = 0;
          partColIdx = 1;
          opColIdx = 2;
        } else {
          throw new Error(
            'Could not find required columns: "Machine Size", "Part", "Operation". Please use the standard template.'
          );
        }
      }

      // Step 2: Build existing lookups for duplicate check
      // Key format: machineSize.toLowerCase()
      const existingSizeMap = new Map<string, string>(); // sizeKey -> machineSizeId
      existingMachineSizes.forEach((s) => {
        existingSizeMap.set(s.machineSize.trim().toLowerCase(), s.machineSizeId);
        existingSizeMap.set(s.machineSizeId.toLowerCase(), s.machineSizeId);
      });

      // Key format: `${machineSizeId.toLowerCase()}:::${partName.toLowerCase()}`
      const existingPartMap = new Map<string, string>(); // key -> partId
      existingParts.forEach((p) => {
        existingPartMap.set(
          `${p.machineSizeId.toLowerCase()}:::${p.partName.trim().toLowerCase()}`,
          p.partId
        );
      });

      // Key format: `${machineSizeId.toLowerCase()}:::${partId.toLowerCase()}:::${opName.toLowerCase()}`
      const existingOpSet = new Set<string>();
      existingOperations.forEach((o) => {
        existingOpSet.add(
          `${o.machineSizeId.toLowerCase()}:::${o.partId.toLowerCase()}:::${o.operationName.trim().toLowerCase()}`
        );
      });

      // Step 3: Validate each row
      const rows: PreviewRow[] = [];
      const seenInFile = new Map<string, number>(); // key -> first row seen

      for (let r = headerRowIdx + 1; r < rawData.length; r++) {
        const row = rawData[r] as any[];
        if (!Array.isArray(row)) continue;

        const rawSize = String(row[sizeColIdx] ?? '').trim();
        const rawPart = String(row[partColIdx] ?? '').trim();
        const rawOp = String(row[opColIdx] ?? '').trim();

        // Skip completely blank rows
        if (!rawSize && !rawPart && !rawOp) continue;

        const excelRowNum = r + 1;

        // Check for missing mandatory fields
        const missingFields: string[] = [];
        if (!rawSize) missingFields.push('Machine Size is missing');
        if (!rawPart) missingFields.push('Part is missing');
        if (!rawOp) missingFields.push('Operation is missing');

        if (missingFields.length > 0) {
          rows.push({
            excelRowNum,
            machineSize: rawSize || '-',
            part: rawPart || '-',
            operation: rawOp || '-',
            status: 'ERROR',
            statusReason: missingFields.join(', '),
          });
          continue;
        }

        // Key for intra-file duplicate detection
        const fileKey = `${rawSize.toLowerCase()}:::${rawPart.toLowerCase()}:::${rawOp.toLowerCase()}`;

        if (seenInFile.has(fileKey)) {
          const prevRow = seenInFile.get(fileKey);
          rows.push({
            excelRowNum,
            machineSize: rawSize,
            part: rawPart,
            operation: rawOp,
            status: 'DUPLICATE',
            statusReason: `Duplicate in Excel file (same as Row ${prevRow})`,
          });
          continue;
        }

        // Check against existing Firestore database operations for this department
        let isExistingDuplicate = false;
        const matchedSizeId =
          existingSizeMap.get(rawSize.toLowerCase()) ||
          rawSize.toUpperCase().replace(/\s+/g, '-');
        const partKey = `${matchedSizeId.toLowerCase()}:::${rawPart.toLowerCase()}`;
        const matchedPartId =
          existingPartMap.get(partKey) ||
          `${rawPart.toUpperCase().replace(/\s+/g, '-')}-${matchedSizeId}`;

        const opLookupKey = `${matchedSizeId.toLowerCase()}:::${matchedPartId.toLowerCase()}:::${rawOp.toLowerCase()}`;

        if (existingOpSet.has(opLookupKey)) {
          isExistingDuplicate = true;
        }

        if (isExistingDuplicate) {
          rows.push({
            excelRowNum,
            machineSize: rawSize,
            part: rawPart,
            operation: rawOp,
            status: 'DUPLICATE',
            statusReason: `Already exists in ${departmentName} Operation Master`,
          });
          continue;
        }

        // Record as seen and valid new row
        seenInFile.set(fileKey, excelRowNum);
        rows.push({
          excelRowNum,
          machineSize: rawSize,
          part: rawPart,
          operation: rawOp,
          status: 'NEW',
          statusReason: 'Ready to import',
        });
      }

      if (rows.length === 0) {
        throw new Error(
          'No valid data rows found in the sheet. Please make sure data starts beneath the header row.'
        );
      }

      setPreviewRows(rows);
    } catch (err: any) {
      console.error('Error processing Excel file:', err);
      setParseError(err.message || 'Failed to read Excel file.');
    } finally {
      setParsing(false);
    }
  };

  // Metrics
  const totalRows = previewRows.length;
  const newRows = useMemo(
    () => previewRows.filter((r) => r.status === 'NEW'),
    [previewRows]
  );
  const duplicateRows = useMemo(
    () => previewRows.filter((r) => r.status === 'DUPLICATE'),
    [previewRows]
  );
  const errorRows = useMemo(
    () => previewRows.filter((r) => r.status === 'ERROR'),
    [previewRows]
  );

  // Filtered rows for the preview table
  const displayedRows = useMemo(() => {
    if (filterTab === 'new') return newRows;
    if (filterTab === 'duplicate') return duplicateRows;
    if (filterTab === 'error') return errorRows;
    return previewRows;
  }, [previewRows, filterTab, newRows, duplicateRows, errorRows]);

  // Grouped hierarchy preview
  const hierarchyPreview = useMemo(() => {
    const map = new Map<
      string,
      Map<string, { op: string; status: 'NEW' | 'DUPLICATE' | 'ERROR' }[]>
    >();

    previewRows.forEach((r) => {
      if (!map.has(r.machineSize)) {
        map.set(r.machineSize, new Map());
      }
      const partMap = map.get(r.machineSize)!;
      if (!partMap.has(r.part)) {
        partMap.set(r.part, []);
      }
      partMap.get(r.part)!.push({ op: r.operation, status: r.status });
    });

    return map;
  }, [previewRows]);

  // Execute Import
  const handleExecuteImport = async () => {
    if (newRows.length === 0) return;

    setImporting(true);
    try {
      const itemsToImport = newRows.map((r) => ({
        machineSize: r.machineSize,
        part: r.part,
        operation: r.operation,
      }));

      const summary = await bulkImportDepartmentOperationsFromExcel(
        departmentName,
        itemsToImport,
        userProfile?.email
      );

      onImportSuccess(summary);
      onClose();
    } catch (err: any) {
      console.error('Error importing operations:', err);
      setParseError(err.message || 'Failed to save imported operations to database.');
    } finally {
      setImporting(false);
    }
  };

  const handleResetFile = () => {
    setSelectedFile(null);
    setPreviewRows([]);
    setParseError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-slate-50 to-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center border border-emerald-200">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-black text-slate-900 tracking-tight">
                  Import Operation Master from Excel
                </h2>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200 uppercase">
                  {departmentName}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Automatically builds Machine Size → Part → Operation hierarchy for this department.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => downloadOperationMasterExcelTemplate(departmentName)}
              className="px-3 py-1.5 text-xs font-bold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg shadow-2xs transition flex items-center gap-1.5"
              title="Download 3-column template"
            >
              <Download className="w-3.5 h-3.5 text-slate-500" />
              <span>Download Template</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-5">
          {/* Parse error banner */}
          {parseError && (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2.5">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              <div className="flex-1 font-medium">{parseError}</div>
              <button
                onClick={() => setParseError(null)}
                className="text-rose-500 hover:text-rose-700 text-xs underline font-bold"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* STEP 1: FILE SELECTION / UPLOAD ZONE */}
          {!selectedFile ? (
            <div className="space-y-4">
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-slate-300 hover:border-blue-500 hover:bg-blue-50/20 rounded-2xl p-8 sm:p-12 text-center cursor-pointer transition flex flex-col items-center justify-center group"
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept=".xlsx, .xls"
                  className="hidden"
                />

                <div className="w-14 h-14 rounded-2xl bg-blue-50 text-blue-600 group-hover:bg-blue-600 group-hover:text-white flex items-center justify-center transition mb-3 shadow-xs">
                  <Upload className="w-7 h-7" />
                </div>

                <h3 className="text-sm font-bold text-slate-800 group-hover:text-blue-600 transition">
                  Click to select or drag & drop an Excel file
                </h3>
                <p className="text-xs text-slate-500 mt-1 max-w-sm">
                  Upload an .xlsx or .xls file. Only 3 columns are required:
                </p>

                <div className="mt-3 flex items-center gap-2 text-xs font-mono font-bold bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200 text-slate-700">
                  <span>Machine Size</span>
                  <span className="text-slate-400">|</span>
                  <span>Part</span>
                  <span className="text-slate-400">|</span>
                  <span>Operation</span>
                </div>
              </div>

              {/* Template Guidance & Instructions */}
              <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 space-y-2">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
                  <HelpCircle className="w-4 h-4 text-blue-600" />
                  <span>Excel Formatting Specifications</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs text-slate-600">
                  <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                    <p className="font-bold text-slate-800">1. Exact 3 Columns Only</p>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      No Machine Number, Customer, or Progress columns needed.
                    </p>
                  </div>
                  <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                    <p className="font-bold text-slate-800">2. Automatic Trimming</p>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Leading and trailing spaces like &quot; 685 &quot; are cleanly trimmed.
                    </p>
                  </div>
                  <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                    <p className="font-bold text-slate-800">3. Duplicate Prevention</p>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Existing operations in {departmentName} are skipped automatically.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* STEP 2: PREVIEW & CONFIRMATION */
            <div className="space-y-4">
              {/* File Info & Quick Actions */}
              <div className="bg-slate-50 rounded-xl border border-slate-200 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-3">
                  <FileSpreadsheet className="w-5 h-5 text-emerald-600 shrink-0" />
                  <div>
                    <div className="font-bold text-slate-800 flex items-center gap-2">
                      <span>{selectedFile.name}</span>
                      <span className="text-slate-400 font-normal">
                        ({(selectedFile.size / 1024).toFixed(1)} KB)
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500">
                      Destination Department:{' '}
                      <strong className="text-slate-700">{departmentName}</strong>
                    </p>
                  </div>
                </div>

                <button
                  onClick={handleResetFile}
                  disabled={importing}
                  className="px-3 py-1.5 text-xs font-bold text-slate-600 hover:text-slate-900 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg transition self-start sm:self-auto"
                >
                  Choose Different File
                </button>
              </div>

              {/* Parsing Spinner */}
              {parsing && (
                <div className="p-10 text-center space-y-2">
                  <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
                  <p className="text-xs text-slate-500 font-medium">
                    Reading and validating Excel rows...
                  </p>
                </div>
              )}

              {/* Summary Metrics Bar */}
              {!parsing && previewRows.length > 0 && (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
                      <p className="text-[11px] font-medium text-slate-500">Total Rows</p>
                      <p className="text-lg font-black text-slate-800">{totalRows}</p>
                    </div>

                    <div className="bg-emerald-50/60 p-3 rounded-xl border border-emerald-200 shadow-2xs">
                      <p className="text-[11px] font-bold text-emerald-800">Valid / New</p>
                      <p className="text-lg font-black text-emerald-700">{newRows.length}</p>
                    </div>

                    <div className="bg-amber-50/60 p-3 rounded-xl border border-amber-200 shadow-2xs">
                      <p className="text-[11px] font-bold text-amber-800">Duplicates</p>
                      <p className="text-lg font-black text-amber-700">
                        {duplicateRows.length}
                      </p>
                    </div>

                    <div className="bg-rose-50/60 p-3 rounded-xl border border-rose-200 shadow-2xs">
                      <p className="text-[11px] font-bold text-rose-800">Errors</p>
                      <p className="text-lg font-black text-rose-700">{errorRows.length}</p>
                    </div>
                  </div>

                  {/* View Controls: Filter Tabs + Table vs Hierarchy Toggle */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-2 border-t border-slate-100">
                    {/* Filter tabs */}
                    <div className="flex items-center gap-1 text-xs">
                      <button
                        onClick={() => setFilterTab('all')}
                        className={`px-3 py-1.5 rounded-lg font-bold transition ${
                          filterTab === 'all'
                            ? 'bg-slate-900 text-white'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        All Rows ({totalRows})
                      </button>
                      <button
                        onClick={() => setFilterTab('new')}
                        className={`px-3 py-1.5 rounded-lg font-bold transition ${
                          filterTab === 'new'
                            ? 'bg-emerald-700 text-white'
                            : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                        }`}
                      >
                        New ({newRows.length})
                      </button>
                      <button
                        onClick={() => setFilterTab('duplicate')}
                        className={`px-3 py-1.5 rounded-lg font-bold transition ${
                          filterTab === 'duplicate'
                            ? 'bg-amber-700 text-white'
                            : 'bg-amber-50 text-amber-800 hover:bg-amber-100'
                        }`}
                      >
                        Duplicates ({duplicateRows.length})
                      </button>
                      <button
                        onClick={() => setFilterTab('error')}
                        className={`px-3 py-1.5 rounded-lg font-bold transition ${
                          filterTab === 'error'
                            ? 'bg-rose-700 text-white'
                            : 'bg-rose-50 text-rose-800 hover:bg-rose-100'
                        }`}
                      >
                        Errors ({errorRows.length})
                      </button>
                    </div>

                    {/* View mode toggle */}
                    <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg self-start sm:self-auto text-xs">
                      <button
                        onClick={() => setViewMode('table')}
                        className={`px-2.5 py-1 rounded-md font-bold flex items-center gap-1.5 transition ${
                          viewMode === 'table'
                            ? 'bg-white text-slate-800 shadow-xs'
                            : 'text-slate-500 hover:text-slate-800'
                        }`}
                      >
                        <TableIcon className="w-3.5 h-3.5" />
                        <span>Table Preview</span>
                      </button>
                      <button
                        onClick={() => setViewMode('hierarchy')}
                        className={`px-2.5 py-1 rounded-md font-bold flex items-center gap-1.5 transition ${
                          viewMode === 'hierarchy'
                            ? 'bg-white text-slate-800 shadow-xs'
                            : 'text-slate-500 hover:text-slate-800'
                        }`}
                      >
                        <ListTree className="w-3.5 h-3.5" />
                        <span>Hierarchy Tree</span>
                      </button>
                    </div>
                  </div>

                  {/* PREVIEW CONTENT */}
                  {viewMode === 'table' ? (
                    <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
                      <div className="max-h-72 overflow-y-auto">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-slate-50 sticky top-0 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[10px]">
                            <tr>
                              <th className="py-2.5 px-3 w-16 text-center">Row</th>
                              <th className="py-2.5 px-3">Machine Size</th>
                              <th className="py-2.5 px-3">Part</th>
                              <th className="py-2.5 px-3">Operation</th>
                              <th className="py-2.5 px-3 text-center w-36">Status</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 bg-white">
                            {displayedRows.length === 0 ? (
                              <tr>
                                <td
                                  colSpan={5}
                                  className="py-8 text-center text-slate-400 italic"
                                >
                                  No rows match the selected filter.
                                </td>
                              </tr>
                            ) : (
                              displayedRows.map((r, idx) => (
                                <tr
                                  key={idx}
                                  className={`hover:bg-slate-50/70 transition ${
                                    r.status === 'ERROR'
                                      ? 'bg-rose-50/30'
                                      : r.status === 'DUPLICATE'
                                      ? 'bg-slate-50/30'
                                      : ''
                                  }`}
                                >
                                  <td className="py-2 px-3 text-center text-slate-400 font-mono">
                                    {r.excelRowNum}
                                  </td>
                                  <td className="py-2 px-3 font-bold text-slate-800 font-mono">
                                    {r.machineSize}
                                  </td>
                                  <td className="py-2 px-3 font-semibold text-slate-700">
                                    {r.part}
                                  </td>
                                  <td className="py-2 px-3 text-slate-800">
                                    {r.operation}
                                  </td>
                                  <td className="py-2 px-3 text-center">
                                    {r.status === 'NEW' ? (
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                        <Check className="w-3 h-3" />
                                        <span>NEW</span>
                                      </span>
                                    ) : r.status === 'DUPLICATE' ? (
                                      <span
                                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200"
                                        title={r.statusReason}
                                      >
                                        <span>DUPLICATE</span>
                                      </span>
                                    ) : (
                                      <span
                                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200"
                                        title={r.statusReason}
                                      >
                                        <AlertCircle className="w-3 h-3" />
                                        <span>ERROR</span>
                                      </span>
                                    )}
                                  </td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ) : (
                    /* HIERARCHY TREE VIEW */
                    <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/50 max-h-72 overflow-y-auto space-y-4">
                      {Array.from(hierarchyPreview.entries()).map(([size, partsMap]) => (
                        <div
                          key={size}
                          className="bg-white rounded-xl border border-slate-200 p-3 shadow-2xs space-y-2.5"
                        >
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-md bg-blue-50 text-blue-700 font-mono font-bold text-xs flex items-center justify-center border border-blue-200">
                              {size.slice(0, 3)}
                            </div>
                            <h4 className="text-xs font-black text-slate-900 uppercase">
                              Machine Size: {size}
                            </h4>
                          </div>

                          <div className="pl-6 space-y-2 border-l-2 border-blue-100 ml-3">
                            {Array.from(partsMap.entries()).map(([partName, opsList]) => (
                              <div key={partName} className="space-y-1">
                                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
                                  <Boxes className="w-3.5 h-3.5 text-slate-400" />
                                  <span>{partName}</span>
                                </div>
                                <div className="pl-5 space-y-0.5">
                                  {opsList.map((item, oIdx) => (
                                    <div
                                      key={oIdx}
                                      className="flex items-center gap-2 text-[11px] text-slate-600"
                                    >
                                      <span className="text-slate-400 font-mono">
                                        {oIdx + 1}.
                                      </span>
                                      <span className="font-medium">{item.op}</span>
                                      {item.status === 'NEW' && (
                                        <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                                          NEW
                                        </span>
                                      )}
                                      {item.status === 'DUPLICATE' && (
                                        <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-amber-50 text-amber-700 border border-amber-200">
                                          DUPLICATE
                                        </span>
                                      )}
                                      {item.status === 'ERROR' && (
                                        <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-rose-50 text-rose-700 border border-rose-200">
                                          ERROR
                                        </span>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Informational callout before confirmation */}
                  <div className="p-3 bg-blue-50/50 border border-blue-200 rounded-xl text-xs text-blue-900 flex items-center justify-between">
                    <div>
                      <p className="font-bold">Confirmation Required</p>
                      <p className="text-[11px] text-blue-700 mt-0.5">
                        Clicking &quot;Import&quot; will create {newRows.length} new operations under{' '}
                        {departmentName}. Existing duplicates ({duplicateRows.length}) and rows with
                        errors ({errorRows.length}) will be safely skipped.
                      </p>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between gap-3">
          <button
            onClick={onClose}
            disabled={importing}
            className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-800 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl transition"
          >
            CANCEL
          </button>

          {selectedFile && previewRows.length > 0 && (
            <button
              onClick={handleExecuteImport}
              disabled={importing || newRows.length === 0}
              className={`px-5 py-2 text-xs font-bold rounded-xl flex items-center gap-2 shadow-sm transition ${
                newRows.length === 0 || importing
                  ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                  : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/20'
              }`}
            >
              {importing ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Importing Operations to {departmentName}...</span>
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  <span>
                    IMPORT ({newRows.length} Valid {newRows.length === 1 ? 'Row' : 'Rows'})
                  </span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
