import React, { useState, useEffect, useMemo } from 'react';
import {
  Layers,
  Plus,
  Search,
  Filter,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Sliders,
  Settings,
  Edit2,
  Trash2,
  Check,
  X,
  FileText,
  Boxes,
  Cpu,
  Sparkles,
  Info,
  Shield,
  Eye,
  Power,
  RotateCcw,
  FileSpreadsheet,
  Download,
  Upload,
} from 'lucide-react';
import {
  DepartmentMachineSize,
  DepartmentPart,
  DepartmentOperation,
  UserProfile,
} from '../../types';
import {
  subscribeDepartmentMachineSizes,
  subscribeAllDepartmentParts,
  subscribeAllDepartmentOperations,
  addDepartmentMachineSize,
  updateDepartmentMachineSize,
  toggleDepartmentMachineSizeActive,
  addDepartmentPart,
  updateDepartmentPart,
  toggleDepartmentPartActive,
  addDepartmentOperation,
  updateDepartmentOperation,
  toggleDepartmentOperationActive,
  ExcelImportSummary,
} from '../../services/operationMasterService';
import { useAuth } from '../../context/AuthContext';
import { isDepartmentMatch } from '../../utils/departmentUtils';
import { downloadOperationMasterExcelTemplate } from '../../utils/excel';
import { OperationMasterExcelImportModal } from './OperationMasterExcelImportModal';

interface DepartmentOperationMasterViewProps {
  departmentName: string;
}

export const DepartmentOperationMasterView: React.FC<DepartmentOperationMasterViewProps> = ({
  departmentName,
}) => {
  const { userProfile } = useAuth();
  const isAdmin = userProfile?.role === 'ADMIN';

  // Subscribed state from Firestore
  const [machineSizes, setMachineSizes] = useState<DepartmentMachineSize[]>([]);
  const [parts, setParts] = useState<DepartmentPart[]>([]);
  const [operations, setOperations] = useState<DepartmentOperation[]>([]);
  const [loading, setLoading] = useState(true);

  // Search & Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [expandedSizes, setExpandedSizes] = useState<Record<string, boolean>>({});
  const [expandedParts, setExpandedParts] = useState<Record<string, boolean>>({});

  // Modals state
  const [showSizeModal, setShowSizeModal] = useState(false);
  const [editingSize, setEditingSize] = useState<DepartmentMachineSize | null>(null);
  const [sizeFormName, setSizeFormName] = useState('');
  const [sizeFormDesc, setSizeFormDesc] = useState('');
  const [sizeFormActive, setSizeFormActive] = useState(true);

  const [showPartModal, setShowPartModal] = useState(false);
  const [selectedSizeForPart, setSelectedSizeForPart] = useState<DepartmentMachineSize | null>(null);
  const [editingPart, setEditingPart] = useState<DepartmentPart | null>(null);
  const [partFormName, setPartFormName] = useState('');
  const [partFormCode, setPartFormCode] = useState('');
  const [partFormSeq, setPartFormSeq] = useState<number>(1);
  const [partFormDesc, setPartFormDesc] = useState('');
  const [partFormActive, setPartFormActive] = useState(true);

  const [showOpModal, setShowOpModal] = useState(false);
  const [selectedPartForOp, setSelectedPartForOp] = useState<DepartmentPart | null>(null);
  const [selectedSizeForOp, setSelectedSizeForOp] = useState<DepartmentMachineSize | null>(null);
  const [editingOp, setEditingOp] = useState<DepartmentOperation | null>(null);
  const [opFormName, setOpFormName] = useState('');
  const [opFormCode, setOpFormCode] = useState('');
  const [opFormSeq, setOpFormSeq] = useState<number>(1);
  const [opFormDesc, setOpFormDesc] = useState('');
  const [opFormTime, setOpFormTime] = useState('');
  const [opFormWeight, setOpFormWeight] = useState<number>(1);
  const [opFormTargetQty, setOpFormTargetQty] = useState<number>(1);
  const [opFormUnit, setOpFormUnit] = useState('Pcs');
  const [opFormActive, setOpFormActive] = useState(true);

  // Excel Import Modal
  const [showExcelImportModal, setShowExcelImportModal] = useState(false);

  // Status & Feedback
  const [toast, setToast] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const handleImportSuccess = (summary: ExcelImportSummary) => {
    setToast({
      type: 'success',
      text: `Excel Import Complete: Added ${summary.operationsCreated} operations across ${summary.partsCreated} parts and ${summary.machineSizesCreated} machine sizes into ${departmentName}!`,
    });

    // Auto-expand all imported machine sizes
    if (summary.importedSizes.length > 0) {
      setExpandedSizes((prev) => {
        const next = { ...prev };
        summary.importedSizes.forEach((sId) => {
          next[sId] = true;
        });
        return next;
      });
    }
  };

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // Firestore Realtime Subscriptions
  useEffect(() => {
    setLoading(true);
    const unsubSizes = subscribeDepartmentMachineSizes(departmentName, (list) => {
      setMachineSizes(list);
      setLoading(false);
      // Auto expand first size if none expanded
      if (list.length > 0) {
        setExpandedSizes((prev) => {
          if (Object.keys(prev).length === 0 && list[0]?.machineSizeId) {
            return { [list[0].machineSizeId]: true };
          }
          return prev;
        });
      }
    });

    const unsubParts = subscribeAllDepartmentParts(departmentName, (list) => {
      setParts(list);
    });

    const unsubOps = subscribeAllDepartmentOperations(departmentName, (list) => {
      setOperations(list);
    });

    return () => {
      unsubSizes();
      unsubParts();
      unsubOps();
    };
  }, [departmentName]);

  // Toggle expansion
  const toggleSizeExpand = (sizeId: string) => {
    setExpandedSizes((prev) => ({ ...prev, [sizeId]: !prev[sizeId] }));
  };

  const togglePartExpand = (partKey: string) => {
    setExpandedParts((prev) => ({ ...prev, [partKey]: !prev[partKey] }));
  };

  // Grouped and Filtered Data
  const filteredSizes = useMemo(() => {
    return machineSizes.filter((s) => {
      if (!showInactive && !s.active) return false;
      if (!searchQuery.trim()) return true;
      const query = searchQuery.toLowerCase();
      const matchSize = s.machineSize.toLowerCase().includes(query) || (s.description || '').toLowerCase().includes(query);
      const matchPart = parts.some(
        (p) =>
          p.machineSizeId.toLowerCase() === s.machineSizeId.toLowerCase() &&
          (p.partName.toLowerCase().includes(query) || p.partCode.toLowerCase().includes(query))
      );
      const matchOp = operations.some(
        (o) =>
          o.machineSizeId.toLowerCase() === s.machineSizeId.toLowerCase() &&
          (o.operationName.toLowerCase().includes(query) || o.operationCode.toLowerCase().includes(query))
      );
      return matchSize || matchPart || matchOp;
    });
  }, [machineSizes, parts, operations, showInactive, searchQuery]);

  // MACHINE SIZE ACTIONS
  const handleOpenAddSize = () => {
    setEditingSize(null);
    setSizeFormName('');
    setSizeFormDesc('');
    setSizeFormActive(true);
    setShowSizeModal(true);
  };

  const handleOpenEditSize = (s: DepartmentMachineSize) => {
    setEditingSize(s);
    setSizeFormName(s.machineSize);
    setSizeFormDesc(s.description || '');
    setSizeFormActive(s.active);
    setShowSizeModal(true);
  };

  const handleSaveSize = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sizeFormName.trim()) {
      setToast({ type: 'error', text: 'Machine Size / Model is required.' });
      return;
    }

    setSaving(true);
    try {
      if (editingSize && editingSize.id) {
        await updateDepartmentMachineSize(
          editingSize.id,
          {
            machineSize: sizeFormName.trim(),
            description: sizeFormDesc.trim(),
            active: sizeFormActive,
          },
          userProfile?.email
        );
        setToast({ type: 'success', text: `Machine Size "${sizeFormName}" updated successfully.` });
      } else {
        await addDepartmentMachineSize(
          {
            departmentId: departmentName,
            machineSize: sizeFormName.trim(),
            description: sizeFormDesc.trim(),
            active: sizeFormActive,
          },
          userProfile?.email
        );
        setToast({ type: 'success', text: `Machine Size "${sizeFormName}" added to ${departmentName}!` });
      }
      setShowSizeModal(false);
    } catch (err: any) {
      setToast({ type: 'error', text: err.message || 'Failed to save Machine Size.' });
    } finally {
      setSaving(false);
    }
  };

  const handleToggleSize = async (s: DepartmentMachineSize) => {
    if (!s.id) return;
    try {
      await toggleDepartmentMachineSizeActive(s.id, !s.active, userProfile?.email);
      setToast({
        type: 'info',
        text: `Machine Size "${s.machineSize}" marked as ${!s.active ? 'Active' : 'Inactive'}.`,
      });
    } catch (err: any) {
      setToast({ type: 'error', text: err.message || 'Action failed.' });
    }
  };

  // PART ACTIONS
  const handleOpenAddPart = (s: DepartmentMachineSize) => {
    setSelectedSizeForPart(s);
    setEditingPart(null);
    setPartFormName('');
    setPartFormCode('');
    // Auto calculate sequence
    const existingParts = parts.filter((p) => p.machineSizeId.toLowerCase() === s.machineSizeId.toLowerCase());
    setPartFormSeq(existingParts.length + 1);
    setPartFormDesc('');
    setPartFormActive(true);
    setShowPartModal(true);
  };

  const handleOpenEditPart = (p: DepartmentPart, s: DepartmentMachineSize) => {
    setSelectedSizeForPart(s);
    setEditingPart(p);
    setPartFormName(p.partName);
    setPartFormCode(p.partCode);
    setPartFormSeq(p.sequence || 1);
    setPartFormDesc(p.description || '');
    setPartFormActive(p.active);
    setShowPartModal(true);
  };

  const handleSavePart = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSizeForPart) return;
    if (!partFormName.trim()) {
      setToast({ type: 'error', text: 'Part Name is required.' });
      return;
    }

    setSaving(true);
    try {
      if (editingPart && editingPart.id) {
        await updateDepartmentPart(
          editingPart.id,
          {
            partName: partFormName.trim(),
            partCode: partFormCode.trim().toUpperCase() || `${partFormName.trim().toUpperCase()}-${selectedSizeForPart.machineSizeId}`,
            sequence: Number(partFormSeq) || 1,
            description: partFormDesc.trim(),
            active: partFormActive,
          },
          userProfile?.email
        );
        setToast({ type: 'success', text: `Part "${partFormName}" updated successfully.` });
      } else {
        await addDepartmentPart(
          {
            departmentId: departmentName,
            machineSizeId: selectedSizeForPart.machineSizeId,
            partName: partFormName.trim(),
            partCode: partFormCode.trim() || undefined,
            sequence: Number(partFormSeq) || 1,
            description: partFormDesc.trim(),
            active: partFormActive,
          },
          userProfile?.email
        );
        setToast({
          type: 'success',
          text: `Part "${partFormName}" added under Machine Size ${selectedSizeForPart.machineSize}!`,
        });
      }
      setShowPartModal(false);
      setExpandedSizes((prev) => ({ ...prev, [selectedSizeForPart.machineSizeId]: true }));
    } catch (err: any) {
      setToast({ type: 'error', text: err.message || 'Failed to save Part.' });
    } finally {
      setSaving(false);
    }
  };

  const handleTogglePart = async (p: DepartmentPart) => {
    if (!p.id) return;
    try {
      await toggleDepartmentPartActive(p.id, !p.active, userProfile?.email);
      setToast({
        type: 'info',
        text: `Part "${p.partName}" marked as ${!p.active ? 'Active' : 'Inactive'}.`,
      });
    } catch (err: any) {
      setToast({ type: 'error', text: err.message || 'Action failed.' });
    }
  };

  // OPERATION ACTIONS
  const handleOpenAddOp = (p: DepartmentPart, s: DepartmentMachineSize) => {
    setSelectedPartForOp(p);
    setSelectedSizeForOp(s);
    setEditingOp(null);
    setOpFormName('');
    setOpFormCode('');
    const existingOps = operations.filter(
      (o) => o.machineSizeId.toLowerCase() === s.machineSizeId.toLowerCase() && o.partId === p.partId
    );
    setOpFormSeq(existingOps.length + 1);
    setOpFormDesc('');
    setOpFormTime('60 mins');
    setOpFormWeight(1);
    setOpFormTargetQty(1);
    setOpFormUnit('Pcs');
    setOpFormActive(true);
    setShowOpModal(true);
  };

  const handleOpenEditOp = (o: DepartmentOperation, p: DepartmentPart, s: DepartmentMachineSize) => {
    setSelectedPartForOp(p);
    setSelectedSizeForOp(s);
    setEditingOp(o);
    setOpFormName(o.operationName);
    setOpFormCode(o.operationCode);
    setOpFormSeq(o.sequence || 1);
    setOpFormDesc(o.description || '');
    setOpFormTime(o.standardTime || '60 mins');
    setOpFormWeight(o.weight !== undefined ? o.weight : 1);
    setOpFormTargetQty(o.targetQuantity !== undefined ? o.targetQuantity : 1);
    setOpFormUnit(o.unit || 'Pcs');
    setOpFormActive(o.active);
    setShowOpModal(true);
  };

  const handleSaveOp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPartForOp || !selectedSizeForOp) return;
    if (!opFormName.trim()) {
      setToast({ type: 'error', text: 'Operation Name is required.' });
      return;
    }

    setSaving(true);
    try {
      if (editingOp && editingOp.id) {
        await updateDepartmentOperation(
          editingOp.id,
          {
            operationName: opFormName.trim(),
            operationCode: opFormCode.trim().toUpperCase() || editingOp.operationCode,
            sequence: Number(opFormSeq) || 1,
            description: opFormDesc.trim(),
            standardTime: opFormTime.trim(),
            weight: Number(opFormWeight) > 0 ? Number(opFormWeight) : 1,
            targetQuantity: Number(opFormTargetQty) || 1,
            unit: opFormUnit.trim(),
            active: opFormActive,
          },
          userProfile?.email
        );
        setToast({ type: 'success', text: `Operation "${opFormName}" updated successfully.` });
      } else {
        await addDepartmentOperation(
          {
            departmentId: departmentName,
            machineSizeId: selectedSizeForOp.machineSizeId,
            partId: selectedPartForOp.partId,
            operationName: opFormName.trim(),
            operationCode: opFormCode.trim() || undefined,
            sequence: Number(opFormSeq) || 1,
            description: opFormDesc.trim(),
            standardTime: opFormTime.trim(),
            weight: Number(opFormWeight) > 0 ? Number(opFormWeight) : 1,
            targetQuantity: Number(opFormTargetQty) || 1,
            unit: opFormUnit.trim(),
            active: opFormActive,
          },
          userProfile?.email
        );
        setToast({
          type: 'success',
          text: `Operation "${opFormName}" added to Part ${selectedPartForOp.partName}!`,
        });
      }
      setShowOpModal(false);
      setExpandedSizes((prev) => ({ ...prev, [selectedSizeForOp.machineSizeId]: true }));
      setExpandedParts((prev) => ({
        ...prev,
        [`${selectedSizeForOp.machineSizeId}_${selectedPartForOp.partId}`]: true,
      }));
    } catch (err: any) {
      setToast({ type: 'error', text: err.message || 'Failed to save Operation.' });
    } finally {
      setSaving(false);
    }
  };

  const handleToggleOp = async (o: DepartmentOperation) => {
    if (!o.id) return;
    try {
      await toggleDepartmentOperationActive(o.id, !o.active, userProfile?.email);
      setToast({
        type: 'info',
        text: `Operation "${o.operationName}" marked as ${!o.active ? 'Active' : 'Inactive'}.`,
      });
    } catch (err: any) {
      setToast({ type: 'error', text: err.message || 'Action failed.' });
    }
  };

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-lg border text-xs font-semibold flex items-center gap-2 animate-in fade-in slide-in-from-top-2 ${
            toast.type === 'success'
              ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
              : toast.type === 'error'
              ? 'bg-rose-50 text-rose-900 border-rose-200'
              : 'bg-blue-50 text-blue-900 border-blue-200'
          }`}
        >
          {toast.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          ) : toast.type === 'error' ? (
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
          ) : (
            <Info className="w-4 h-4 text-blue-600 shrink-0" />
          )}
          <span>{toast.text}</span>
        </div>
      )}

      {/* Header & Controls */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-1 rounded-md text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200 uppercase tracking-wider">
              {departmentName}
            </span>
            <span className="text-xs text-slate-400 font-mono">Department-Specific Scope</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight mt-1 flex items-center gap-2">
            <Sliders className="w-6 h-6 text-blue-600" />
            <span>Machine Size Operation Master</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1 max-w-2xl leading-relaxed">
            Configure parts and operational sequences for each machine size. When machines of matching size arrive at {departmentName}, this reusable structure automatically powers shop floor daily execution.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start md:self-auto">
          <button
            onClick={() => downloadOperationMasterExcelTemplate(departmentName)}
            className="px-3.5 py-2.5 rounded-xl bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs border border-slate-200 shadow-2xs flex items-center gap-1.5 transition"
            title="Download 3-column Excel template (Machine Size | Part | Operation)"
          >
            <Download className="w-4 h-4 text-slate-500" />
            <span>DOWNLOAD EXCEL TEMPLATE</span>
          </button>

          <button
            onClick={() => setShowExcelImportModal(true)}
            className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md shadow-emerald-600/20 flex items-center gap-1.5 transition"
            title="Import Machine Sizes, Parts, and Operations from Excel file"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>IMPORT EXCEL</span>
          </button>

          <button
            onClick={handleOpenAddSize}
            className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-md shadow-blue-600/20 flex items-center gap-2 transition"
          >
            <Plus className="w-4 h-4" />
            <span>+ ADD MACHINE SIZE</span>
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white rounded-xl border border-slate-200 p-3 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search machine sizes, parts, or operations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 rounded-lg border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50/50"
          />
        </div>

        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-slate-600 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-3.5 h-3.5"
            />
            <span>Show Inactive Items</span>
          </label>

          <span className="text-slate-400">|</span>

          <span className="text-slate-500 font-medium">
            Sizes: <strong className="text-slate-800">{machineSizes.length}</strong> | Parts:{' '}
            <strong className="text-slate-800">{parts.length}</strong> | Operations:{' '}
            <strong className="text-slate-800">{operations.length}</strong>
          </span>
        </div>
      </div>

      {/* Operation Master Hierarchy Tree */}
      <div className="space-y-4">
        {loading ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
            <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-xs text-slate-500 font-medium">Loading {departmentName} Operation Master...</p>
          </div>
        ) : filteredSizes.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center space-y-3">
            <Cpu className="w-12 h-12 text-slate-300 mx-auto" />
            <h3 className="text-sm font-bold text-slate-700">No Machine Sizes Configured Yet</h3>
            <p className="text-xs text-slate-400 max-w-md mx-auto">
              Start by adding your department&apos;s machine sizes (e.g. 685, 8106, 10208). You can then define the required parts and operational procedures for each size.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2.5 pt-2">
              <button
                onClick={() => setShowExcelImportModal(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow-xs transition"
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>IMPORT EXCEL</span>
              </button>
              <button
                onClick={handleOpenAddSize}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl shadow-xs transition"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Machine Size Manually</span>
              </button>
              <button
                onClick={() => downloadOperationMasterExcelTemplate(departmentName)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2.5 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs rounded-xl border border-slate-200 shadow-2xs transition"
              >
                <Download className="w-3.5 h-3.5 text-slate-500" />
                <span>Download Template</span>
              </button>
            </div>
          </div>
        ) : (
          filteredSizes.map((size) => {
            const isExpanded = !!expandedSizes[size.machineSizeId];
            const sizeParts = parts.filter(
              (p) => p.machineSizeId.toLowerCase() === size.machineSizeId.toLowerCase()
            );
            const sizeOps = operations.filter(
              (o) => o.machineSizeId.toLowerCase() === size.machineSizeId.toLowerCase()
            );

            return (
              <div
                key={size.id || size.machineSizeId}
                className={`bg-white rounded-2xl border transition-all ${
                  size.active ? 'border-slate-200 shadow-xs' : 'border-slate-200/60 bg-slate-50/40 opacity-75'
                }`}
              >
                {/* Machine Size Header Card */}
                <div className="p-4 flex items-center justify-between border-b border-slate-100 bg-gradient-to-r from-slate-50/90 to-white">
                  <div
                    onClick={() => toggleSizeExpand(size.machineSizeId)}
                    className="flex items-center gap-3 cursor-pointer select-none flex-1"
                  >
                    <button className="text-slate-400 hover:text-slate-600 transition">
                      {isExpanded ? (
                        <ChevronDown className="w-4 h-4 text-blue-600" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-slate-400" />
                      )}
                    </button>

                    <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-700 font-mono font-bold text-xs flex items-center justify-center border border-blue-200">
                      {size.machineSize.slice(0, 4)}
                    </div>

                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-black text-slate-900 tracking-tight">
                          MACHINE SIZE: {size.machineSize}
                        </h3>
                        {!size.active && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-500 border border-slate-200">
                            Inactive
                          </span>
                        )}
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600">
                          {sizeParts.length} {sizeParts.length === 1 ? 'Part' : 'Parts'} • {sizeOps.length}{' '}
                          {sizeOps.length === 1 ? 'Operation' : 'Operations'}
                        </span>
                      </div>
                      {size.description && (
                        <p className="text-[11px] text-slate-500 mt-0.5">{size.description}</p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => handleOpenAddPart(size)}
                      className="px-2.5 py-1 text-[11px] font-bold bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-lg transition flex items-center gap-1"
                      title="Add Part to this Machine Size"
                    >
                      <Plus className="w-3 h-3" />
                      <span>+ Add Part</span>
                    </button>

                    <button
                      onClick={() => handleOpenEditSize(size)}
                      className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-slate-100 rounded-lg transition"
                      title="Edit Machine Size"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>

                    <button
                      onClick={() => handleToggleSize(size)}
                      className={`p-1.5 rounded-lg transition ${
                        size.active
                          ? 'text-slate-400 hover:text-rose-600 hover:bg-rose-50'
                          : 'text-slate-400 hover:text-emerald-600 hover:bg-emerald-50'
                      }`}
                      title={size.active ? 'Deactivate Machine Size' : 'Activate Machine Size'}
                    >
                      <Power className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Expanded: Parts and Operations under this Machine Size */}
                {isExpanded && (
                  <div className="p-4 sm:p-5 space-y-4 bg-slate-50/30">
                    {sizeParts.length === 0 ? (
                      <div className="p-6 text-center border border-dashed border-slate-200 rounded-xl bg-white">
                        <Boxes className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                        <p className="text-xs text-slate-600 font-bold">No Parts Added Yet for Size {size.machineSize}</p>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          Add the components (e.g. Base, Table, Guide, Insert) to configure operational steps.
                        </p>
                        <button
                          onClick={() => handleOpenAddPart(size)}
                          className="mt-3 inline-flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white font-bold text-xs rounded-lg hover:bg-blue-500 shadow-2xs transition"
                        >
                          <Plus className="w-3 h-3" />
                          <span>+ Add Part (e.g. Base)</span>
                        </button>
                      </div>
                    ) : (
                      sizeParts.map((part, pIdx) => {
                        const partKey = `${size.machineSizeId}_${part.partId}`;
                        const isPartExpanded = expandedParts[partKey] !== false; // default expanded
                        const partOps = operations.filter(
                          (o) =>
                            o.machineSizeId.toLowerCase() === size.machineSizeId.toLowerCase() &&
                            o.partId === part.partId
                        );

                        return (
                          <div
                            key={part.id || partKey}
                            className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs"
                          >
                            {/* Part Header Bar */}
                            <div className="p-3 bg-slate-100/60 border-b border-slate-200 flex items-center justify-between">
                              <div
                                onClick={() => togglePartExpand(partKey)}
                                className="flex items-center gap-2.5 cursor-pointer select-none flex-1"
                              >
                                <button className="text-slate-400 hover:text-slate-600">
                                  {isPartExpanded ? (
                                    <ChevronDown className="w-3.5 h-3.5 text-blue-600" />
                                  ) : (
                                    <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                                  )}
                                </button>
                                <span className="w-5 h-5 rounded-full bg-slate-200 text-slate-700 font-bold text-[10px] flex items-center justify-center">
                                  {pIdx + 1}
                                </span>
                                <h4 className="text-xs font-bold text-slate-800 flex items-center gap-2">
                                  <span>Part: {part.partName}</span>
                                  <span className="font-mono text-[10px] font-semibold text-slate-500 bg-white px-1.5 py-0.5 rounded border border-slate-200">
                                    {part.partCode}
                                  </span>
                                  {!part.active && (
                                    <span className="text-[10px] text-slate-400 italic">(Inactive)</span>
                                  )}
                                </h4>
                                <span className="text-[10px] font-semibold text-slate-500 ml-1">
                                  ({partOps.length} {partOps.length === 1 ? 'operation' : 'operations'})
                                </span>
                              </div>

                              <div className="flex items-center gap-1 shrink-0">
                                <button
                                  onClick={() => handleOpenAddOp(part, size)}
                                  className="px-2 py-0.5 text-[11px] font-bold bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded transition flex items-center gap-1"
                                  title="Add Operation to this Part"
                                >
                                  <Plus className="w-2.5 h-2.5" />
                                  <span>+ Add Operation</span>
                                </button>
                                <button
                                  onClick={() => handleOpenEditPart(part, size)}
                                  className="p-1 text-slate-400 hover:text-blue-600 rounded transition"
                                  title="Edit Part"
                                >
                                  <Edit2 className="w-3 h-3" />
                                </button>
                                <button
                                  onClick={() => handleTogglePart(part)}
                                  className="p-1 text-slate-400 hover:text-rose-600 rounded transition"
                                  title={part.active ? 'Deactivate Part' : 'Activate Part'}
                                >
                                  <Power className="w-3 h-3" />
                                </button>
                              </div>
                            </div>

                            {/* Operations List under Part */}
                            {isPartExpanded && (
                              <div className="p-3">
                                {partOps.length === 0 ? (
                                  <div className="py-4 text-center text-[11px] text-slate-400">
                                    No operations configured for {part.partName} yet.{' '}
                                    <button
                                      onClick={() => handleOpenAddOp(part, size)}
                                      className="text-blue-600 hover:underline font-bold"
                                    >
                                      + Add First Operation
                                    </button>
                                  </div>
                                ) : (
                                  <div className="overflow-x-auto">
                                    <table className="w-full text-left text-xs whitespace-nowrap">
                                      <thead>
                                        <tr className="border-b border-slate-100 text-[10px] uppercase font-bold text-slate-400">
                                          <th className="pb-2 pl-2 w-10">Seq</th>
                                          <th className="pb-2">Operation Name</th>
                                          <th className="pb-2">Code</th>
                                          <th className="pb-2">Standard Time</th>
                                          <th className="pb-2">Weight</th>
                                          <th className="pb-2">Target</th>
                                          <th className="pb-2">Status</th>
                                          <th className="pb-2 text-right pr-2">Actions</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-slate-50">
                                        {partOps.map((op, oIdx) => (
                                          <tr
                                            key={op.id || op.operationId}
                                            className={`hover:bg-slate-50 transition ${
                                              !op.active ? 'opacity-60 bg-slate-50/50' : ''
                                            }`}
                                          >
                                            <td className="py-2 pl-2 font-mono font-bold text-slate-500 text-[11px]">
                                              {op.sequence || oIdx + 1}
                                            </td>
                                            <td className="py-2 font-semibold text-slate-800">
                                              {op.operationName}
                                              {op.description && (
                                                <span className="block text-[10px] text-slate-400 font-normal truncate max-w-xs">
                                                  {op.description}
                                                </span>
                                              )}
                                            </td>
                                            <td className="py-2 font-mono text-[10px] text-slate-500">
                                              {op.operationCode}
                                            </td>
                                            <td className="py-2 text-[11px] text-slate-600 flex items-center gap-1">
                                              <Clock className="w-3 h-3 text-slate-400" />
                                              <span>{op.standardTime || '-'}</span>
                                            </td>
                                            <td className="py-2 text-[11px] font-semibold text-slate-700">
                                              {op.weight || 1}
                                            </td>
                                            <td className="py-2 text-[11px] text-slate-600">
                                              {op.targetQuantity ? `${op.targetQuantity} ${op.unit || ''}` : '-'}
                                            </td>
                                            <td className="py-2">
                                              <span
                                                className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                                                  op.active
                                                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                                    : 'bg-slate-100 text-slate-500 border border-slate-200'
                                                }`}
                                              >
                                                {op.active ? 'Active' : 'Inactive'}
                                              </span>
                                            </td>
                                            <td className="py-2 text-right pr-2">
                                              <div className="flex items-center justify-end gap-1">
                                                <button
                                                  onClick={() => handleOpenEditOp(op, part, size)}
                                                  className="p-1 text-slate-400 hover:text-blue-600 rounded transition"
                                                  title="Edit Operation"
                                                >
                                                  <Edit2 className="w-3 h-3" />
                                                </button>
                                                <button
                                                  onClick={() => handleToggleOp(op)}
                                                  className="p-1 text-slate-400 hover:text-rose-600 rounded transition"
                                                  title={op.active ? 'Deactivate' : 'Activate'}
                                                >
                                                  <Power className="w-3 h-3" />
                                                </button>
                                              </div>
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* ========================================================================= */}
      {/* MODAL 1: ADD / EDIT MACHINE SIZE                                          */}
      {/* ========================================================================= */}
      {showSizeModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-2xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
                <Cpu className="w-4 h-4 text-blue-600" />
                <span>{editingSize ? 'Edit Machine Size' : '+ Add Machine Size'}</span>
              </h3>
              <button
                onClick={() => setShowSizeModal(false)}
                className="p-1 text-slate-400 hover:text-slate-700 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveSize} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-700 font-bold mb-1">
                  Machine Size / Model <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. 685, 8106, 10208, 122010"
                  value={sizeFormName}
                  onChange={(e) => setSizeFormName(e.target.value)}
                  required
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono font-bold focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Enter the canonical size identifier used across planning and drawing schedules.
                </p>
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Description</label>
                <textarea
                  rows={2}
                  placeholder="e.g. CMM 685 Bridge Model with Granite Base"
                  value={sizeFormDesc}
                  onChange={(e) => setSizeFormDesc(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="sizeActive"
                  checked={sizeFormActive}
                  onChange={(e) => setSizeFormActive(e.target.checked)}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-4 h-4"
                />
                <label htmlFor="sizeActive" className="text-slate-700 font-semibold cursor-pointer">
                  Active for Production &amp; Shop Floor Work
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowSizeModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 font-bold hover:bg-slate-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold transition disabled:opacity-50"
                >
                  {saving ? 'Saving...' : editingSize ? 'Update Machine Size' : 'Save Machine Size'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: ADD / EDIT PART                                                  */}
      {/* ========================================================================= */}
      {showPartModal && selectedSizeForPart && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-2xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
                  <Boxes className="w-4 h-4 text-emerald-600" />
                  <span>{editingPart ? 'Edit Part' : '+ Add Part'}</span>
                </h3>
                <p className="text-[11px] text-slate-500 font-mono mt-0.5">
                  Machine Size: {selectedSizeForPart.machineSize}
                </p>
              </div>
              <button
                onClick={() => setShowPartModal(false)}
                className="p-1 text-slate-400 hover:text-slate-700 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSavePart} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-700 font-bold mb-1">
                  Part Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Base, Table, Guide, Insert, Bridge"
                  value={partFormName}
                  onChange={(e) => {
                    const val = e.target.value;
                    setPartFormName(val);
                    if (!editingPart) {
                      setPartFormCode(`${val.trim().toUpperCase().replace(/\s+/g, '-')}-${selectedSizeForPart.machineSizeId}`);
                    }
                  }}
                  required
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Part Code</label>
                  <input
                    type="text"
                    placeholder="e.g. BASE-685"
                    value={partFormCode}
                    onChange={(e) => setPartFormCode(e.target.value.toUpperCase())}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono text-[11px] focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Sequence Order</label>
                  <input
                    type="number"
                    min="1"
                    value={partFormSeq}
                    onChange={(e) => setPartFormSeq(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Description</label>
                <textarea
                  rows={2}
                  placeholder="Part specifications, drawing references, material notes"
                  value={partFormDesc}
                  onChange={(e) => setPartFormDesc(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="partActive"
                  checked={partFormActive}
                  onChange={(e) => setPartFormActive(e.target.checked)}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-4 h-4"
                />
                <label htmlFor="partActive" className="text-slate-700 font-semibold cursor-pointer">
                  Active in Work Hierarchy
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowPartModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 font-bold hover:bg-slate-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold transition disabled:opacity-50"
                >
                  {saving ? 'Saving...' : editingPart ? 'Update Part' : 'Save Part'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 3: ADD / EDIT OPERATION                                             */}
      {/* ========================================================================= */}
      {showOpModal && selectedPartForOp && selectedSizeForOp && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-2xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4 max-h-[94vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-blue-600" />
                  <span>{editingOp ? 'Edit Operation' : '+ Add Operation'}</span>
                </h3>
                <p className="text-[11px] text-slate-500 font-mono mt-0.5">
                  Machine Size: {selectedSizeForOp.machineSize} • Part: {selectedPartForOp.partName}
                </p>
              </div>
              <button
                onClick={() => setShowOpModal(false)}
                className="p-1 text-slate-400 hover:text-slate-700 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveOp} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-700 font-bold mb-1">
                  Operation Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Surface Lapping, Flatness Check, Insert Fitment, Drilling"
                  value={opFormName}
                  onChange={(e) => {
                    const val = e.target.value;
                    setOpFormName(val);
                    if (!editingOp) {
                      setOpFormCode(`OP-${val.trim().toUpperCase().slice(0, 4)}-${Date.now().toString().slice(-3)}`);
                    }
                  }}
                  required
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Operation Code</label>
                  <input
                    type="text"
                    placeholder="e.g. OP-LAP-01"
                    value={opFormCode}
                    onChange={(e) => setOpFormCode(e.target.value.toUpperCase())}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono text-[11px] focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Sequence Order</label>
                  <input
                    type="number"
                    min="1"
                    value={opFormSeq}
                    onChange={(e) => setOpFormSeq(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Standard / Planned Time</label>
                  <input
                    type="text"
                    placeholder="e.g. 120 mins, 2 hrs"
                    value={opFormTime}
                    onChange={(e) => setOpFormTime(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-bold mb-1">
                    Weight (Section 14)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={opFormWeight}
                    onChange={(e) => setOpFormWeight(Number(e.target.value) || 1)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <span className="text-[10px] text-slate-400">Default = 1</span>
                </div>
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Target Qty &amp; Unit</label>
                  <div className="flex gap-1">
                    <input
                      type="number"
                      min="1"
                      value={opFormTargetQty}
                      onChange={(e) => setOpFormTargetQty(Number(e.target.value) || 1)}
                      className="w-16 px-2 py-2 rounded-xl border border-slate-300 text-center"
                    />
                    <input
                      type="text"
                      placeholder="Pcs"
                      value={opFormUnit}
                      onChange={(e) => setOpFormUnit(e.target.value)}
                      className="flex-1 px-2 py-2 rounded-xl border border-slate-300"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Description / SOP Instructions</label>
                <textarea
                  rows={2}
                  placeholder="Standard operating procedure, tolerance constraints, critical inspection points"
                  value={opFormDesc}
                  onChange={(e) => setOpFormDesc(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="opActive"
                  checked={opFormActive}
                  onChange={(e) => setOpFormActive(e.target.checked)}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-4 h-4"
                />
                <label htmlFor="opActive" className="text-slate-700 font-semibold cursor-pointer">
                  Active for Daily Work Checklist
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowOpModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 font-bold hover:bg-slate-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold transition disabled:opacity-50"
                >
                  {saving ? 'Saving...' : editingOp ? 'Update Operation' : 'Save Operation'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Excel Import Modal */}
      {showExcelImportModal && (
        <OperationMasterExcelImportModal
          isOpen={showExcelImportModal}
          onClose={() => setShowExcelImportModal(false)}
          departmentName={departmentName}
          existingMachineSizes={machineSizes}
          existingParts={parts}
          existingOperations={operations}
          onImportSuccess={handleImportSuccess}
        />
      )}
    </div>
  );
};
