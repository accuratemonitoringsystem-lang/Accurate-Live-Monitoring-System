import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Layers,
  Upload,
  Download,
  Search,
  Filter,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Building,
  Calendar,
  AlertCircle,
  FileSpreadsheet,
  X,
  Check,
  RefreshCw,
  Plus,
  ArrowRight,
  Eye,
  Edit2,
  Lock,
} from 'lucide-react';
import { BacklogItem, BacklogStatus, Machine, ImportHistoryEntry } from '../../types';
import { useAuth } from '../../context/AuthContext';
import {
  parseBacklogExcel,
  commitBacklogBatch,
  subscribeBacklogItems,
  updateBacklogItem,
  downloadBacklogTemplate,
  downloadBacklogErrorReport,
  BacklogValidationResult,
} from '../../services/backlogService';
import { subscribeImportHistory } from '../../services/db';
import { INITIAL_DEPARTMENTS } from '../../constants';

interface BacklogManagementViewProps {
  departmentName?: string;
  machines?: Machine[];
  onOpenDailyUpdate?: () => void;
}

export const BacklogManagementView: React.FC<BacklogManagementViewProps> = ({
  departmentName,
  machines = [],
  onOpenDailyUpdate,
}) => {
  const { userProfile } = useAuth();
  const isAdmin = userProfile?.role === 'ADMIN' || departmentName === 'All Departments';
  const isPlanning = userProfile?.department?.includes('Planning') || userProfile?.role === 'PLANNING';
  const canImport = isAdmin || isPlanning;

  const targetDept = isAdmin && departmentName === 'All Departments' ? undefined : departmentName;

  // View Mode: 'backlog' | 'history'
  const [activeViewMode, setActiveViewMode] = useState<'backlog' | 'history'>('backlog');

  // Live Backlog Data
  const [backlogItems, setBacklogItems] = useState<BacklogItem[]>([]);
  const [importHistory, setImportHistory] = useState<ImportHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [deptFilter, setDeptFilter] = useState<string>(targetDept || 'ALL');

  // Excel Import Modal State
  const [showImportModal, setShowImportModal] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [validationResult, setValidationResult] = useState<BacklogValidationResult | null>(null);
  const [duplicateStrategy, setDuplicateStrategy] = useState<'update' | 'skip'>('update');
  const [importMonth, setImportMonth] = useState('October');
  const [importYear, setImportYear] = useState('2026');
  const [committing, setCommitting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);

  // Edit Item Modal State
  const [editingItem, setEditingItem] = useState<BacklogItem | null>(null);
  const [editStatus, setEditStatus] = useState<BacklogStatus>('Open');
  const [editRemarks, setEditRemarks] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Subscribe to live backlog items and import history
  useEffect(() => {
    setLoading(true);
    const unsub = subscribeBacklogItems(targetDept, (items) => {
      setBacklogItems(items);
      setLoading(false);
    });
    const unsubHist = subscribeImportHistory((hist) => {
      setImportHistory(hist);
    });
    return () => {
      unsub();
      unsubHist();
    };
  }, [targetDept]);

  // Filtered Backlog Items
  const filteredItems = useMemo(() => {
    return backlogItems.filter((item) => {
      if (statusFilter !== 'ALL' && item.status !== statusFilter) return false;
      if (deptFilter !== 'ALL' && item.department !== deptFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const match =
          item.machineNumber.toLowerCase().includes(q) ||
          item.remainingOperation.toLowerCase().includes(q) ||
          (item.department && item.department.toLowerCase().includes(q)) ||
          (item.project && item.project.toLowerCase().includes(q)) ||
          (item.customer && item.customer.toLowerCase().includes(q));
        if (!match) return false;
      }
      return true;
    });
  }, [backlogItems, statusFilter, deptFilter, searchQuery]);

  // Aggregate Metrics
  const metrics = useMemo(() => {
    const totalItems = backlogItems.length;
    const totalOriginalQty = backlogItems.reduce((acc, i) => acc + (i.originalQuantity || 0), 0);
    const totalCompletedQty = backlogItems.reduce((acc, i) => acc + (i.completedQuantity || 0), 0);
    const totalRemainingQty = backlogItems.reduce((acc, i) => acc + (i.remainingQuantity || 0), 0);

    const openCount = backlogItems.filter((i) => i.status === 'Open').length;
    const inProgressCount = backlogItems.filter((i) => i.status === 'In Progress' || i.status === 'Partially Completed').length;
    const completedCount = backlogItems.filter((i) => i.status === 'Completed').length;
    const blockedCount = backlogItems.filter((i) => i.status === 'Blocked').length;

    return {
      totalItems,
      totalOriginalQty,
      totalCompletedQty,
      totalRemainingQty,
      openCount,
      inProgressCount,
      completedCount,
      blockedCount,
    };
  }, [backlogItems]);

  // Handle File Selection
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    setImportFile(file);
    setParsing(true);
    setImportError(null);
    setValidationResult(null);

    try {
      const result = await parseBacklogExcel(file, machines);
      setValidationResult(result);
    } catch (err: any) {
      console.error('Failed to parse backlog excel:', err);
      setImportError(err.message || 'Failed to parse Excel file.');
    } finally {
      setParsing(false);
    }
  };

  // Commit Backlog Batch
  const handleConfirmImport = async () => {
    if (!validationResult || validationResult.validRowsCount === 0) return;

    setCommitting(true);
    setImportError(null);
    try {
      const res = await commitBacklogBatch({
        month: importMonth,
        year: importYear,
        fileName: validationResult.fileName,
        rows: validationResult.rows,
        duplicateAction: duplicateStrategy,
        userEmail: userProfile?.email,
        userName: userProfile?.displayName || userProfile?.username,
      });

      setImportSuccess(
        `Successfully processed backlog import [Batch: ${res.batchId}]: ${res.importedCount} new machine entries imported, ${res.updatedCount} existing machines updated, ${res.skippedCount} duplicates skipped. Department queues and roadmaps configured!`
      );
      setTimeout(() => {
        setShowImportModal(false);
        setImportSuccess(null);
        setValidationResult(null);
        setImportFile(null);
      }, 2500);
    } catch (err: any) {
      console.error('Backlog import commit failed:', err);
      setImportError(err.message || 'Failed to commit backlog batch.');
    } finally {
      setCommitting(false);
    }
  };

  // Save Item Status Edit
  const handleSaveEdit = async () => {
    if (!editingItem) return;
    setSavingEdit(true);
    try {
      const remQty = editStatus === 'Completed' ? 0 : editingItem.remainingQuantity;
      const compQty = editStatus === 'Completed' ? editingItem.originalQuantity : editingItem.completedQuantity;

      await updateBacklogItem(
        editingItem.id,
        {
          status: editStatus,
          remarks: editRemarks,
          remainingQuantity: remQty,
          completedQuantity: compQty,
        },
        userProfile?.email
      );
      setEditingItem(null);
    } catch (err: any) {
      console.error('Error saving backlog item edit:', err);
      alert('Failed to update backlog item: ' + err.message);
    } finally {
      setSavingEdit(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-amber-500 text-white rounded-xl shadow-xs">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-black text-slate-900 uppercase tracking-tight">
                Backlog Management &amp; Reconciliation
              </h2>
              <p className="text-xs text-slate-500 font-medium">
                {targetDept ? `Work carryover & pending backlog tasks for ${targetDept}` : 'Cross-department backlog carryover, Excel import, and live execution reconciliation'}
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={downloadBacklogTemplate}
            className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition flex items-center space-x-1.5 border border-slate-300"
            title="Download standard Excel import template"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Excel Template</span>
          </button>

          {canImport && (
            <button
              onClick={() => {
                setValidationResult(null);
                setImportFile(null);
                setImportError(null);
                setShowImportModal(true);
              }}
              className="px-3.5 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl transition shadow-xs flex items-center space-x-1.5"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Import Backlog Excel</span>
            </button>
          )}

          {onOpenDailyUpdate && (
            <button
              onClick={onOpenDailyUpdate}
              className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition shadow-xs flex items-center space-x-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Update Backlog Progress</span>
            </button>
          )}
        </div>
      </div>

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
        <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs">
          <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
            Total Backlog Tasks
          </div>
          <div className="text-2xl font-black text-slate-900 mt-1 font-mono">
            {metrics.totalItems}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">
            Original Target: <span className="font-bold text-slate-700">{metrics.totalOriginalQty}</span> units
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-amber-200 shadow-xs bg-amber-50/30">
          <div className="text-[11px] font-bold text-amber-700 uppercase tracking-wider">
            Remaining Backlog Qty
          </div>
          <div className="text-2xl font-black text-amber-700 mt-1 font-mono">
            {metrics.totalRemainingQty}
          </div>
          <div className="text-[11px] text-amber-600 mt-0.5">
            Active Open: <span className="font-bold">{metrics.openCount}</span> tasks
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-emerald-200 shadow-xs bg-emerald-50/30">
          <div className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider">
            Completed Backlog Qty
          </div>
          <div className="text-2xl font-black text-emerald-700 mt-1 font-mono">
            {metrics.totalCompletedQty}
          </div>
          <div className="text-[11px] text-emerald-600 mt-0.5">
            Completed: <span className="font-bold">{metrics.completedCount}</span> tasks
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-indigo-200 shadow-xs bg-indigo-50/30">
          <div className="text-[11px] font-bold text-indigo-700 uppercase tracking-wider">
            In Progress / Partial
          </div>
          <div className="text-2xl font-black text-indigo-700 mt-1 font-mono">
            {metrics.inProgressCount}
          </div>
          <div className="text-[11px] text-indigo-600 mt-0.5">
            Blocked: <span className="font-bold text-red-600">{metrics.blockedCount}</span> tasks
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs flex flex-col md:flex-row items-center justify-between gap-3">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by Machine #, operation, project..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full text-xs pl-9 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 font-medium"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
          {/* Status Filter */}
          <div className="flex items-center space-x-1 text-xs">
            <span className="text-slate-500 font-semibold">Status:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-slate-50 border border-slate-300 rounded-lg px-2 py-1 text-xs font-bold text-slate-800 outline-none"
            >
              <option value="ALL">All Statuses</option>
              <option value="Open">Open</option>
              <option value="In Progress">In Progress</option>
              <option value="Partially Completed">Partially Completed</option>
              <option value="Completed">Completed</option>
              <option value="Blocked">Blocked</option>
            </select>
          </div>

          {/* Department Filter (Admin only) */}
          {isAdmin && (
            <div className="flex items-center space-x-1 text-xs">
              <span className="text-slate-500 font-semibold">Dept:</span>
              <select
                value={deptFilter}
                onChange={(e) => setDeptFilter(e.target.value)}
                className="bg-slate-50 border border-slate-300 rounded-lg px-2 py-1 text-xs font-bold text-slate-800 outline-none"
              >
                <option value="ALL">All Departments</option>
                {INITIAL_DEPARTMENTS.map((d) => (
                  <option key={d.code} value={d.name}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Backlog Items Detail Table / Upload History Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-200 bg-slate-50/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center space-x-2">
            <div className="flex items-center gap-1 bg-slate-200/80 p-1 rounded-xl">
              <button
                type="button"
                onClick={() => setActiveViewMode('backlog')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                  activeViewMode === 'backlog'
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-amber-600" />
                <span>Live Backlog Work Queue ({filteredItems.length})</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveViewMode('history')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                  activeViewMode === 'history'
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Clock className="w-3.5 h-3.5 text-indigo-600" />
                <span>Upload History ({importHistory.length})</span>
              </button>
            </div>
          </div>
          <span className="text-[11px] text-slate-500 font-medium">
            {activeViewMode === 'backlog'
              ? 'One authoritative backlog record per machine task'
              : 'Audit log of Excel backlog imports with filename, counts, and status'}
          </span>
        </div>

        {activeViewMode === 'history' ? (
          // UPLOAD HISTORY TABLE
          importHistory.length === 0 ? (
            <div className="p-12 text-center">
              <Clock className="w-10 h-10 text-slate-300 mx-auto mb-2" />
              <h4 className="text-sm font-bold text-slate-700">No Upload History Yet</h4>
              <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
                Upload history is automatically recorded whenever an Admin imports a backlog spreadsheet.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-100/80 text-slate-600 font-bold border-b border-slate-200">
                    <th className="p-3">File Name</th>
                    <th className="p-3">Uploaded Date &amp; Time</th>
                    <th className="p-3">Uploaded By</th>
                    <th className="p-3 text-center">Total Rows</th>
                    <th className="p-3 text-center">Imported</th>
                    <th className="p-3 text-center">Updated / Dup</th>
                    <th className="p-3 text-center">Invalid / Failed</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">Audit Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
                  {importHistory.map((h) => (
                    <tr key={h.id} className="hover:bg-slate-50/70 transition">
                      <td className="p-3 font-bold text-slate-900 font-mono flex items-center gap-2">
                        <FileSpreadsheet className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span className="truncate max-w-xs">{h.fileName}</span>
                      </td>
                      <td className="p-3 font-mono text-slate-600 text-[11px]">
                        {h.uploadDateTime ? new Date(h.uploadDateTime).toLocaleString('en-GB') : '-'}
                      </td>
                      <td className="p-3 text-slate-700 font-semibold">
                        {h.uploadedBy}
                      </td>
                      <td className="p-3 text-center font-mono font-bold text-slate-700">
                        {h.totalRows}
                      </td>
                      <td className="p-3 text-center font-mono font-bold text-emerald-700">
                        {h.importedCount}
                      </td>
                      <td className="p-3 text-center font-mono font-bold text-purple-700">
                        {h.duplicateCount || 0}
                      </td>
                      <td className="p-3 text-center font-mono font-bold text-red-700">
                        {h.invalidCount || 0}
                      </td>
                      <td className="p-3">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            h.status === 'Completed'
                              ? 'bg-emerald-100 text-emerald-800'
                              : h.status === 'Partial'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-red-100 text-red-800'
                          }`}
                        >
                          {h.status}
                        </span>
                      </td>
                      <td className="p-3 text-slate-500 text-[11px] max-w-xs truncate" title={h.errorDetails || 'Completed without errors'}>
                        {h.errorDetails || 'All valid machines distributed successfully'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : (
          // LIVE BACKLOG TABLE
          loading ? (
            <div className="p-12 text-center text-slate-400">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-amber-500" />
              <p className="text-xs font-medium">Loading backlog items from database...</p>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="p-12 text-center">
              <Layers className="w-10 h-10 text-slate-300 mx-auto mb-2" />
              <h4 className="text-sm font-bold text-slate-700">No Backlog Items Found</h4>
              <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
                There is currently no outstanding backlog work matching the selected filters.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-100/80 text-slate-600 font-bold border-b border-slate-200">
                    <th className="p-3">Backlog ID</th>
                    <th className="p-3">Machine #</th>
                    <th className="p-3">Model / Size</th>
                    <th className="p-3">Department</th>
                    <th className="p-3">Remaining Operation</th>
                    <th className="p-3 text-center">Orig Qty</th>
                    <th className="p-3 text-center">Done Qty</th>
                    <th className="p-3 text-center">Bal Qty</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">Due Date</th>
                    <th className="p-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
                  {filteredItems.map((item) => (
                    <tr key={item.id} className="hover:bg-amber-50/30 transition">
                      <td className="p-3 font-mono font-bold text-amber-800 text-[11px]">
                        {item.backlogId}
                      </td>
                      <td className="p-3 font-mono font-bold text-slate-900">
                        {item.machineNumber}
                      </td>
                      <td className="p-3 text-slate-600 font-medium">
                        {item.machineSize}
                      </td>
                      <td className="p-3 font-semibold text-slate-700">
                        {item.department}
                      </td>
                      <td className="p-3 font-bold text-slate-900 max-w-xs truncate" title={item.remainingOperation}>
                        {item.remainingOperation}
                      </td>
                      <td className="p-3 text-center font-mono font-bold text-slate-600">
                        {item.originalQuantity}
                      </td>
                      <td className="p-3 text-center font-mono font-bold text-emerald-600">
                        {item.completedQuantity}
                      </td>
                      <td className="p-3 text-center font-mono font-bold text-amber-700">
                        {item.remainingQuantity}
                      </td>
                      <td className="p-3">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            item.status === 'Completed'
                              ? 'bg-emerald-100 text-emerald-800'
                              : item.status === 'In Progress' || item.status === 'Partially Completed'
                              ? 'bg-blue-100 text-blue-800'
                              : item.status === 'Blocked'
                              ? 'bg-red-100 text-red-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {item.status}
                        </span>
                      </td>
                      <td className="p-3 text-slate-500 font-mono text-[11px]">
                        {item.dueDate || 'Unscheduled'}
                      </td>
                      <td className="p-3 text-right">
                        <button
                          onClick={() => {
                            setEditingItem(item);
                            setEditStatus(item.status);
                            setEditRemarks(item.remarks || '');
                          }}
                          className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-bold text-[11px] transition inline-flex items-center space-x-1"
                        >
                          <Edit2 className="w-3 h-3 text-slate-500" />
                          <span>Manage</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
      </div>

      {/* =========================================================================
          MODAL: EXCEL IMPORT & COLUMN VALIDATION
          ========================================================================= */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in">
            <div className="bg-slate-900 p-4 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center space-x-2">
                <Upload className="w-5 h-5 text-amber-400" />
                <div>
                  <h3 className="font-bold text-sm">Import Backlog Excel Work File</h3>
                  <p className="text-[11px] text-slate-400">Validate columns, detect duplicates, and link machines</p>
                </div>
              </div>
              <button
                onClick={() => setShowImportModal(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 flex-1 overflow-y-auto space-y-4">
              {importSuccess && (
                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs flex items-center space-x-2">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                  <span>{importSuccess}</span>
                </div>
              )}

              {importError && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-800 text-xs flex items-center space-x-2">
                  <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
                  <span>{importError}</span>
                </div>
              )}

              {/* Month / Year Target */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Backlog Period Month <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={importMonth}
                    onChange={(e) => setImportMonth(e.target.value)}
                    className="w-full text-xs p-2.5 bg-slate-50 border border-slate-300 rounded-xl font-bold"
                  >
                    {['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'].map(
                      (m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      )
                    )}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Backlog Period Year <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    value={importYear}
                    onChange={(e) => setImportYear(e.target.value)}
                    className="w-full text-xs p-2.5 bg-slate-50 border border-slate-300 rounded-xl font-bold"
                  />
                </div>
              </div>

              {/* File Upload Area */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Upload Backlog Spreadsheet (.xlsx, .xls)
                </label>
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-slate-300 hover:border-amber-500 rounded-xl p-6 text-center cursor-pointer transition bg-slate-50/50 hover:bg-amber-50/20"
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  <FileSpreadsheet className="w-8 h-8 text-amber-500 mx-auto mb-2" />
                  <p className="text-xs font-bold text-slate-700">
                    {importFile ? importFile.name : 'Click to select Excel file or drag and drop'}
                  </p>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Supports columns: SR NO, Machine Number, Machine Size, Department, Remaining Operation, Qty, Due Date...
                  </p>
                </div>
              </div>

              {parsing && (
                <div className="p-4 text-center text-slate-500 text-xs flex items-center justify-center space-x-2">
                  <RefreshCw className="w-4 h-4 animate-spin text-amber-600" />
                  <span>Validating Excel rows and matching Machine Master...</span>
                </div>
              )}

              {/* Validation Results Preview */}
              {validationResult && (
                <div className="space-y-4 pt-2">
                  <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 text-center">
                    <div className="bg-slate-100 p-2.5 rounded-xl border border-slate-200">
                      <div className="text-[10px] text-slate-500 uppercase font-bold">Total Rows</div>
                      <div className="text-base font-black text-slate-900 font-mono mt-0.5">
                        {validationResult.totalRows}
                      </div>
                    </div>
                    <div className="bg-emerald-50 p-2.5 rounded-xl border border-emerald-200">
                      <div className="text-[10px] text-emerald-700 uppercase font-bold">Valid Machines</div>
                      <div className="text-base font-black text-emerald-700 font-mono mt-0.5">
                        {validationResult.validRowsCount}
                      </div>
                    </div>
                    <div className="bg-blue-50 p-2.5 rounded-xl border border-blue-200">
                      <div className="text-[10px] text-blue-700 uppercase font-bold">New Machines</div>
                      <div className="text-base font-black text-blue-700 font-mono mt-0.5">
                        {validationResult.newMachinesCount}
                      </div>
                    </div>
                    <div className="bg-purple-50 p-2.5 rounded-xl border border-purple-200">
                      <div className="text-[10px] text-purple-700 uppercase font-bold">Updated Existing</div>
                      <div className="text-base font-black text-purple-700 font-mono mt-0.5">
                        {validationResult.updatedMachinesCount}
                      </div>
                    </div>
                    <div className="bg-amber-50 p-2.5 rounded-xl border border-amber-200">
                      <div className="text-[10px] text-amber-700 uppercase font-bold">Duplicates in File</div>
                      <div className="text-base font-black text-amber-700 font-mono mt-0.5">
                        {validationResult.duplicateRowsCount}
                      </div>
                    </div>
                    <div className="bg-red-50 p-2.5 rounded-xl border border-red-200">
                      <div className="text-[10px] text-red-700 uppercase font-bold">Invalid Rows</div>
                      <div className="text-base font-black text-red-700 font-mono mt-0.5">
                        {validationResult.invalidRowsCount}
                      </div>
                    </div>
                  </div>

                  {/* Duplicate Handling Strategy */}
                  <div className="p-3 bg-indigo-50/70 border border-indigo-200 rounded-xl space-y-2">
                    <div className="text-xs font-bold text-indigo-900 flex items-center justify-between">
                      <span>Duplicate Machine Number Policy:</span>
                      <span className="text-[10px] text-indigo-600 font-normal">
                        Choose how to handle machines that already exist in the database
                      </span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                      <label
                        className={`flex items-start gap-2 p-2.5 rounded-lg border cursor-pointer transition ${
                          duplicateStrategy === 'update'
                            ? 'bg-white border-indigo-500 shadow-2xs font-bold text-indigo-950'
                            : 'bg-indigo-50/40 border-indigo-200 text-indigo-800'
                        }`}
                      >
                        <input
                          type="radio"
                          name="duplicateStrategy"
                          checked={duplicateStrategy === 'update'}
                          onChange={() => setDuplicateStrategy('update')}
                          className="mt-0.5 text-indigo-600 focus:ring-indigo-500"
                        />
                        <div>
                          <div className="font-bold text-[11px]">Update Existing Machine (Recommended)</div>
                          <div className="text-[10px] text-slate-500 font-normal leading-tight mt-0.5">
                            Synchronizes department work and target dates; never deletes existing history or documents.
                          </div>
                        </div>
                      </label>

                      <label
                        className={`flex items-start gap-2 p-2.5 rounded-lg border cursor-pointer transition ${
                          duplicateStrategy === 'skip'
                            ? 'bg-white border-indigo-500 shadow-2xs font-bold text-indigo-950'
                            : 'bg-indigo-50/40 border-indigo-200 text-indigo-800'
                        }`}
                      >
                        <input
                          type="radio"
                          name="duplicateStrategy"
                          checked={duplicateStrategy === 'skip'}
                          onChange={() => setDuplicateStrategy('skip')}
                          className="mt-0.5 text-indigo-600 focus:ring-indigo-500"
                        />
                        <div>
                          <div className="font-bold text-[11px]">Skip Duplicate Machine</div>
                          <div className="text-[10px] text-slate-500 font-normal leading-tight mt-0.5">
                            Leaves existing database records untouched and imports only brand-new machine numbers.
                          </div>
                        </div>
                      </label>
                    </div>
                  </div>

                  {/* Errors & Invalid Rows breakdown with Download */}
                  {validationResult.errors.length > 0 && (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-xl space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-red-800 flex items-center gap-1.5">
                          <AlertTriangle className="w-4 h-4 text-red-600" />
                          <span>Validation Errors ({validationResult.errors.length} rows need correction)</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => downloadBacklogErrorReport(validationResult.errors)}
                          className="px-2.5 py-1 bg-red-100 hover:bg-red-200 text-red-800 text-[11px] font-bold rounded-lg border border-red-300 transition flex items-center gap-1"
                        >
                          <Download className="w-3 h-3" />
                          <span>Download Error Report (.xlsx)</span>
                        </button>
                      </div>
                      <div className="max-h-28 overflow-y-auto space-y-1 text-[11px] divide-y divide-red-100">
                        {validationResult.errors.map((e, idx) => (
                          <div key={idx} className="pt-1 first:pt-0 flex items-start justify-between gap-2 text-red-700">
                            <div>
                              <strong className="font-mono">Row #{e.rowNumber}</strong>
                              {e.machineNumber ? ` [Machine #${e.machineNumber}]` : ''}: {e.reason}
                            </div>
                            {e.fixHint && (
                              <span className="text-[10px] bg-red-100/80 px-1.5 py-0.5 rounded text-red-900 shrink-0">
                                {e.fixHint}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Row Preview Table */}
                  <div className="max-h-56 overflow-y-auto border border-slate-200 rounded-xl text-[11px]">
                    <table className="w-full text-left border-collapse">
                      <thead className="bg-slate-100 font-bold text-slate-600 sticky top-0">
                        <tr>
                          <th className="p-2">#</th>
                          <th className="p-2">Machine #</th>
                          <th className="p-2">Size / Model</th>
                          <th className="p-2">Department</th>
                          <th className="p-2">Remaining Work</th>
                          <th className="p-2">Start Date</th>
                          <th className="p-2">Target Date</th>
                          <th className="p-2">Bal Qty</th>
                          <th className="p-2">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {validationResult.rows.map((r, idx) => (
                          <tr key={idx} className={r.isValid ? 'hover:bg-slate-50' : 'bg-red-50/50'}>
                            <td className="p-2 font-mono text-slate-500">{r.srNo}</td>
                            <td className="p-2 font-mono font-bold text-slate-900">
                              {r.machineNumber}
                              {r.isExistingMachine && (
                                <span className="ml-1 text-[9px] bg-purple-100 text-purple-700 px-1 py-0.2 rounded font-semibold">
                                  Existing
                                </span>
                              )}
                            </td>
                            <td className="p-2 text-slate-600">{r.machineSize}</td>
                            <td className="p-2 text-slate-700 font-semibold">{r.department}</td>
                            <td className="p-2 text-slate-800 font-medium truncate max-w-xs">{r.remainingOperation}</td>
                            <td className="p-2 font-mono text-slate-600">{r.plannedStartDate || '-'}</td>
                            <td className="p-2 font-mono text-slate-600">{r.targetDate || r.dueDate || '-'}</td>
                            <td className="p-2 font-mono font-bold text-amber-700">{r.remainingQuantity}</td>
                            <td className="p-2">
                              {r.isValid ? (
                                <span className="text-emerald-600 font-bold">✓ Valid</span>
                              ) : (
                                <span className="text-red-600 font-bold" title={r.error}>
                                  ⚠ {r.error}
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between shrink-0">
              <button
                type="button"
                onClick={() => setShowImportModal(false)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200 rounded-xl transition"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!validationResult || validationResult.validRowsCount === 0 || committing}
                onClick={handleConfirmImport}
                className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl shadow-xs transition disabled:opacity-50 flex items-center space-x-1.5"
              >
                {committing ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Importing &amp; Distributing...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Approve &amp; Import ({validationResult?.validRowsCount || 0} items)</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL: MANAGE BACKLOG ITEM
          ========================================================================= */}
      {editingItem && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden animate-in fade-in">
            <div className="bg-slate-900 p-4 text-white flex items-center justify-between">
              <div>
                <h3 className="font-bold text-sm">Manage Backlog Work Item</h3>
                <p className="text-[11px] text-slate-400">Machine #{editingItem.machineNumber} &bull; {editingItem.department}</p>
              </div>
              <button onClick={() => setEditingItem(null)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div>
                <div className="text-xs font-bold text-slate-500 uppercase">Operation Work</div>
                <div className="text-sm font-black text-slate-900 mt-0.5">{editingItem.remainingOperation}</div>
              </div>

              <div className="grid grid-cols-3 gap-2 p-3 bg-slate-50 rounded-xl border border-slate-200 text-center">
                <div>
                  <div className="text-[10px] text-slate-400 font-bold uppercase">Original</div>
                  <div className="text-sm font-black text-slate-800 font-mono mt-0.5">{editingItem.originalQuantity}</div>
                </div>
                <div>
                  <div className="text-[10px] text-emerald-600 font-bold uppercase">Completed</div>
                  <div className="text-sm font-black text-emerald-600 font-mono mt-0.5">{editingItem.completedQuantity}</div>
                </div>
                <div>
                  <div className="text-[10px] text-amber-700 font-bold uppercase">Balance</div>
                  <div className="text-sm font-black text-amber-700 font-mono mt-0.5">{editingItem.remainingQuantity}</div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Backlog Status
                </label>
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value as BacklogStatus)}
                  className="w-full text-xs p-2.5 bg-slate-50 border border-slate-300 rounded-xl font-bold"
                >
                  <option value="Open">Open</option>
                  <option value="In Progress">In Progress</option>
                  <option value="Partially Completed">Partially Completed</option>
                  <option value="Completed">Completed</option>
                  <option value="Blocked">Blocked</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Remarks / Status Reason
                </label>
                <textarea
                  rows={2}
                  value={editRemarks}
                  onChange={(e) => setEditRemarks(e.target.value)}
                  placeholder="Add status notes or reason for delay/block..."
                  className="w-full text-xs p-2.5 bg-slate-50 border border-slate-300 rounded-xl font-medium"
                />
              </div>
            </div>

            <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-end space-x-2">
              <button
                type="button"
                onClick={() => setEditingItem(null)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200 rounded-xl"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={savingEdit}
                onClick={handleSaveEdit}
                className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl shadow-xs transition"
              >
                {savingEdit ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
