import React, { useState, useMemo } from 'react';
import {
  Plus,
  FileSpreadsheet,
  Search,
  RotateCcw,
  Eye,
  Edit2,
  Trash2,
  X,
  Target,
} from 'lucide-react';
import { Department, Machine, YearlyPlan } from '../../types';
import { addYearlyPlan, updateYearlyPlan, deleteYearlyPlan } from '../../services/db';
import { exportToExcel } from '../../utils/excel';
import { useAuth } from '../../context/AuthContext';
import { isDepartmentMatch } from '../../utils/departmentUtils';

interface YearlyPlanModuleProps {
  departments: Department[];
  yearlyPlans: YearlyPlan[];
  machines?: Machine[];
  selectedDepartment?: string;
  onOpenExcelImport: () => void;
}

export const YearlyPlanModule: React.FC<YearlyPlanModuleProps> = ({
  departments,
  yearlyPlans,
  machines = [],
  selectedDepartment,
  onOpenExcelImport,
}) => {
  const { userProfile } = useAuth();

  const [filterYear, setFilterYear] = useState('');
  const [filterDept, setFilterDept] = useState(
    selectedDepartment && selectedDepartment !== 'All Departments' ? selectedDepartment : ''
  );
  const [searchQuery, setSearchQuery] = useState('');

  const [showAddModal, setShowAddModal] = useState(false);
  const [editingPlan, setEditingPlan] = useState<YearlyPlan | null>(null);
  const [viewingPlan, setViewingPlan] = useState<YearlyPlan | null>(null);
  const [deletingPlan, setDeletingPlan] = useState<YearlyPlan | null>(null);
  const [saving, setSaving] = useState(false);

  const initialFormState = {
    year: '2026',
    department: departments[0]?.name || '02 Planning',
    machineModel: '',
    project: '',
    targetQuantity: 10,
    responsiblePerson: '',
    remarks: '',
  };

  const [formData, setFormData] = useState(initialFormState);

  const filteredPlans = useMemo(() => {
    return yearlyPlans.filter((y) => {
      if (filterYear && String(y.year) !== String(filterYear)) return false;
      if (filterDept && !isDepartmentMatch(y.department, filterDept)) return false;

      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const match =
          y.department.toLowerCase().includes(q) ||
          (y.machineModel && y.machineModel.toLowerCase().includes(q)) ||
          (y.project && y.project.toLowerCase().includes(q)) ||
          (y.responsiblePerson && y.responsiblePerson.toLowerCase().includes(q));
        if (!match) return false;
      }
      return true;
    });
  }, [yearlyPlans, filterYear, filterDept, searchQuery]);

  const kpi = useMemo(() => {
    let totalTarget = 0;
    filteredPlans.forEach((p) => {
      totalTarget += Number(p.targetQuantity) || 0;
    });
    return { totalTarget, count: filteredPlans.length };
  }, [filteredPlans]);

  const handleOpenAdd = () => {
    setFormData({
      ...initialFormState,
      department: selectedDepartment && selectedDepartment !== 'All Departments' ? selectedDepartment : departments[0]?.name || '',
    });
    setShowAddModal(true);
  };

  const handleSaveAdd = async () => {
    if (!formData.department || !formData.year) {
      alert('Please fill mandatory fields (Year and Department)');
      return;
    }
    setSaving(true);
    try {
      await addYearlyPlan(
        {
          year: String(formData.year),
          department: formData.department,
          machineModel: formData.machineModel.trim() || undefined,
          project: formData.project.trim() || undefined,
          targetQuantity: Number(formData.targetQuantity) || 0,
          responsiblePerson: formData.responsiblePerson.trim() || undefined,
          remarks: formData.remarks.trim() || undefined,
          createdBy: userProfile?.displayName || userProfile?.email,
        },
        userProfile?.email
      );
      setShowAddModal(false);
    } catch (err) {
      console.error('Error adding yearly plan:', err);
      alert('Failed to save Yearly Target.');
    } finally {
      setSaving(false);
    }
  };

  const handleOpenEdit = (plan: YearlyPlan) => {
    setEditingPlan(plan);
    setFormData({
      year: plan.year,
      department: plan.department,
      machineModel: plan.machineModel || '',
      project: plan.project || '',
      targetQuantity: plan.targetQuantity || 0,
      responsiblePerson: plan.responsiblePerson || '',
      remarks: plan.remarks || '',
    });
  };

  const handleSaveEdit = async () => {
    if (!editingPlan) return;
    setSaving(true);
    try {
      await updateYearlyPlan(
        editingPlan.id,
        {
          year: String(formData.year),
          department: formData.department,
          machineModel: formData.machineModel.trim() || undefined,
          project: formData.project.trim() || undefined,
          targetQuantity: Number(formData.targetQuantity) || 0,
          responsiblePerson: formData.responsiblePerson.trim() || undefined,
          remarks: formData.remarks.trim() || undefined,
          updatedBy: userProfile?.displayName || userProfile?.email,
        },
        userProfile?.email
      );
      setEditingPlan(null);
    } catch (err) {
      console.error('Error updating yearly plan:', err);
      alert('Failed to update Yearly Target.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingPlan) return;
    try {
      await deleteYearlyPlan(deletingPlan.id, userProfile?.email);
      setDeletingPlan(null);
    } catch (err) {
      console.error('Error deleting yearly plan:', err);
      alert('Failed to delete Yearly Target.');
    }
  };

  const handleExport = () => {
    const dataToExport = filteredPlans.map((y) => ({
      Year: y.year,
      Department: y.department,
      'Machine Model': y.machineModel || '',
      Project: y.project || '',
      'Target Quantity': y.targetQuantity,
      'Responsible Person': y.responsiblePerson || '',
      Remarks: y.remarks || '',
    }));
    exportToExcel('Yearly_Targets_Accurate_Gauging', 'Yearly Targets', dataToExport);
  };

  return (
    <div className="space-y-5">
      {/* Top Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
        <div>
          <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
            <span>Annual Production Targets</span>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
              {filteredPlans.length} records
            </span>
          </h3>
          <p className="text-xs text-slate-500">
            High-level annual strategic volume and machine targets across operational departments
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={onOpenExcelImport}
            className="text-xs font-semibold px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl flex items-center gap-1.5 transition"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
            <span>Import Excel</span>
          </button>

          <button
            onClick={handleExport}
            className="text-xs font-semibold px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl flex items-center gap-1.5 transition"
          >
            <FileSpreadsheet className="w-4 h-4 text-blue-600" />
            <span>Export Excel</span>
          </button>

          <button
            onClick={handleOpenAdd}
            className="text-xs font-bold px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-sm flex items-center gap-1.5 transition"
          >
            <Plus className="w-4 h-4" />
            <span>+ Add Yearly Target</span>
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-[10px] font-bold uppercase text-slate-400 block">Total Annual Target</span>
          <span className="text-xl font-black text-slate-900 font-mono">{kpi.totalTarget}</span>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-[10px] font-bold uppercase text-slate-400 block">Active Target Categories</span>
          <span className="text-xl font-black text-blue-600 font-mono">{kpi.count}</span>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-2xs space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex-1 min-w-[200px] relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search yearly targets, department, model..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
            />
          </div>

          <select
            value={filterYear}
            onChange={(e) => setFilterYear(e.target.value)}
            className="text-xs px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white text-slate-700"
          >
            <option value="">All Years</option>
            {['2024', '2025', '2026', '2027'].map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>

          <select
            value={filterDept}
            onChange={(e) => setFilterDept(e.target.value)}
            className="text-xs px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white text-slate-700 max-w-[200px]"
          >
            <option value="">All Departments</option>
            {departments.map((d) => (
              <option key={d.id} value={d.name}>{d.name}</option>
            ))}
          </select>

          <button
            onClick={() => {
              setFilterYear('');
              setFilterDept('');
              setSearchQuery('');
            }}
            className="text-xs font-semibold px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl flex items-center gap-1 transition"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset</span>
          </button>
        </div>
      </div>

      {/* Yearly Plan Table */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs">
        {filteredPlans.length === 0 ? (
          <div className="p-12 text-center text-xs text-slate-400">
            No annual targets found. Click &ldquo;+ Add Yearly Target&rdquo; or Import from Excel.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="p-3">Year</th>
                  <th className="p-3">Department</th>
                  <th className="p-3">Model / Size</th>
                  <th className="p-3">Project</th>
                  <th className="p-3 text-right">Target Qty</th>
                  <th className="p-3">Responsible</th>
                  <th className="p-3">Remarks</th>
                  <th className="p-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredPlans.map((plan) => (
                  <tr key={plan.id} className="hover:bg-slate-50/80 transition">
                    <td className="p-3 font-black text-slate-900 font-mono">{plan.year}</td>
                    <td className="p-3 text-slate-700">{plan.department}</td>
                    <td className="p-3 font-semibold text-slate-900">{plan.machineModel || '-'}</td>
                    <td className="p-3 text-slate-600">{plan.project || '-'}</td>
                    <td className="p-3 text-right font-mono font-bold text-blue-700 text-sm">
                      {plan.targetQuantity}
                    </td>
                    <td className="p-3 text-slate-600">{plan.responsiblePerson || '-'}</td>
                    <td className="p-3 text-slate-500 text-[11px] truncate max-w-xs">{plan.remarks || '-'}</td>
                    <td className="p-3 text-center whitespace-nowrap">
                      <div className="flex items-center justify-center space-x-1">
                        <button
                          onClick={() => setViewingPlan(plan)}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-blue-50 transition"
                          title="View Details"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleOpenEdit(plan)}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 transition"
                          title="Edit Target"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setDeletingPlan(plan)}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-red-600 hover:bg-red-50 transition"
                          title="Delete Target"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
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

      {/* ADD / EDIT MODAL */}
      {(showAddModal || editingPlan) && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200 overflow-hidden text-slate-900">
            <div className="p-4 sm:p-5 bg-slate-900 text-white flex items-center justify-between">
              <div>
                <h3 className="font-bold text-base">
                  {editingPlan ? 'Edit Annual Production Target' : 'Add Annual Production Target'}
                </h3>
                <p className="text-xs text-slate-400">
                  Set strategic annual unit targets for department operations
                </p>
              </div>
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setEditingPlan(null);
                }}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Year <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.year}
                    onChange={(e) => setFormData({ ...formData, year: e.target.value })}
                    className="w-full text-xs p-2 rounded-xl border border-slate-300 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Department <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={formData.department}
                    onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                    className="w-full text-xs p-2 rounded-xl border border-slate-300"
                  >
                    {departments.map((d) => (
                      <option key={d.id} value={d.name}>{d.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Machine Model / Size
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 685, 1012, 1220"
                    value={formData.machineModel}
                    onChange={(e) => setFormData({ ...formData, machineModel: e.target.value })}
                    className="w-full text-xs p-2 rounded-xl border border-slate-300"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Target Quantity <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={formData.targetQuantity}
                    onChange={(e) => setFormData({ ...formData, targetQuantity: Number(e.target.value) })}
                    className="w-full text-xs p-2 rounded-xl border border-slate-300 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Project / Client
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Aerospace / Defense"
                    value={formData.project}
                    onChange={(e) => setFormData({ ...formData, project: e.target.value })}
                    className="w-full text-xs p-2 rounded-xl border border-slate-300"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Responsible Person
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Plant Manager"
                    value={formData.responsiblePerson}
                    onChange={(e) => setFormData({ ...formData, responsiblePerson: e.target.value })}
                    className="w-full text-xs p-2 rounded-xl border border-slate-300"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Remarks / Notes
                </label>
                <textarea
                  rows={2}
                  placeholder="Strategic notes..."
                  value={formData.remarks}
                  onChange={(e) => setFormData({ ...formData, remarks: e.target.value })}
                  className="w-full text-xs p-2 rounded-xl border border-slate-300"
                />
              </div>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end space-x-2">
              <button
                type="button"
                onClick={() => {
                  setShowAddModal(false);
                  setEditingPlan(null);
                }}
                className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-200 rounded-xl"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={editingPlan ? handleSaveEdit : handleSaveAdd}
                className="px-5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-sm disabled:opacity-50"
              >
                {saving ? 'Saving...' : editingPlan ? 'Update Target' : 'Save Target'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* VIEW MODAL */}
      {viewingPlan && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 overflow-hidden text-slate-900 p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <h3 className="font-bold text-sm">Annual Target Details</h3>
              <button onClick={() => setViewingPlan(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2 bg-slate-50 p-3 rounded-xl border border-slate-200">
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Year</span>
                  <span className="font-bold text-slate-900">{viewingPlan.year}</span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Department</span>
                  <span className="font-bold text-slate-900">{viewingPlan.department}</span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Target Qty</span>
                  <span className="text-base font-black text-blue-700 font-mono">{viewingPlan.targetQuantity}</span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Model</span>
                  <span className="font-bold text-slate-900">{viewingPlan.machineModel || 'General'}</span>
                </div>
              </div>

              {viewingPlan.project && (
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Project / Customer</span>
                  <span className="text-slate-800">{viewingPlan.project}</span>
                </div>
              )}

              {viewingPlan.responsiblePerson && (
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Responsible Person</span>
                  <span className="text-slate-800">{viewingPlan.responsiblePerson}</span>
                </div>
              )}

              {viewingPlan.remarks && (
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Remarks</span>
                  <p className="text-slate-700 bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                    {viewingPlan.remarks}
                  </p>
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-slate-200 flex justify-end">
              <button
                onClick={() => setViewingPlan(null)}
                className="px-4 py-2 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-xl"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DELETE MODAL */}
      {deletingPlan && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 overflow-hidden text-slate-900 p-6 space-y-4">
            <div className="flex items-center space-x-3 text-red-600">
              <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-sm">Delete Annual Target</h3>
                <p className="text-xs text-slate-500">This action will remove the record from Firebase.</p>
              </div>
            </div>

            <p className="text-xs text-slate-700 bg-slate-50 p-3 rounded-xl border border-slate-200">
              Are you sure you want to delete Year {deletingPlan.year} target for <strong>{deletingPlan.department}</strong>?
            </p>

            <div className="flex justify-end space-x-2">
              <button
                onClick={() => setDeletingPlan(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                className="px-4 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-xl shadow-sm"
              >
                Delete Target
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
