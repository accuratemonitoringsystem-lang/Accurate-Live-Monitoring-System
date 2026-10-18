import React, { useState } from 'react';
import {
  Calendar,
  Clock,
  Plus,
  Search,
  Filter,
  CheckCircle2,
  AlertTriangle,
  ChevronRight,
  Boxes,
  Cpu,
  Building,
  X,
  SlidersHorizontal,
  CalendarDays,
  Trash2,
} from 'lucide-react';
import { RoadmapItem, Department, Machine } from '../types';
import { addRoadmapItem, updateRoadmapItem, deleteRoadmapItem } from '../services/db';
import { INITIAL_DEPARTMENTS, PRODUCTION_DEPARTMENTS } from '../constants';
import { useAuth } from '../context/AuthContext';

interface RoadmapTimelineViewProps {
  roadmapItems: RoadmapItem[];
  machines: Machine[];
  departments: Department[];
}

export const RoadmapTimelineView: React.FC<RoadmapTimelineViewProps> = ({
  roadmapItems,
  machines,
  departments,
}) => {
  const { userProfile } = useAuth();

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [filterProject, setFilterProject] = useState('');
  const [filterDept, setFilterDept] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [viewMode, setViewMode] = useState<'timeline' | 'table'>('timeline');
  const [timelineScale, setTimelineScale] = useState<'Daily' | 'Weekly' | 'Monthly'>('Weekly');

  // Modal for Add / Edit
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingItem, setEditingItem] = useState<RoadmapItem | null>(null);

  // Form states
  const [formProject, setFormProject] = useState('');
  const [formMachine, setFormMachine] = useState('');
  const [formDept, setFormDept] = useState(PRODUCTION_DEPARTMENTS[0].name);
  const [formProcess, setFormProcess] = useState('');
  const [formTask, setFormTask] = useState('');
  const [formStartDate, setFormStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [formPlannedEnd, setFormPlannedEnd] = useState(
    new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  );
  const [formActualEnd, setFormActualEnd] = useState('');
  const [formStatus, setFormStatus] = useState<RoadmapItem['status']>('Not Started');
  const [formPriority, setFormPriority] = useState<RoadmapItem['priority']>('Medium');
  const [formRemarks, setFormRemarks] = useState('');
  const [saving, setSaving] = useState(false);

  // Filter items
  const filteredItems = roadmapItems.filter((item) => {
    if (filterProject && item.project !== filterProject) return false;
    if (filterDept && item.department !== filterDept) return false;
    if (filterStatus && item.status !== filterStatus) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const match =
        item.task.toLowerCase().includes(q) ||
        item.project.toLowerCase().includes(q) ||
        item.machineNumber.toLowerCase().includes(q) ||
        item.department.toLowerCase().includes(q) ||
        item.process.toLowerCase().includes(q);
      if (!match) return false;
    }
    return true;
  });

  // Extract unique projects
  const uniqueProjects = Array.from(new Set(roadmapItems.map((i) => i.project).filter(Boolean)));

  const handleOpenAdd = () => {
    setEditingItem(null);
    setFormProject(uniqueProjects[0] || 'Standard Project');
    setFormMachine(machines[0]?.machineNumber || '');
    setFormDept(INITIAL_DEPARTMENTS[0].name);
    setFormProcess('');
    setFormTask('');
    setFormStartDate(new Date().toISOString().split('T')[0]);
    setFormPlannedEnd(new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
    setFormActualEnd('');
    setFormStatus('Not Started');
    setFormPriority('Medium');
    setFormRemarks('');
    setShowAddModal(true);
  };

  const handleOpenEdit = (item: RoadmapItem) => {
    setEditingItem(item);
    setFormProject(item.project);
    setFormMachine(item.machineNumber);
    setFormDept(item.department);
    setFormProcess(item.process);
    setFormTask(item.task);
    setFormStartDate(item.startDate);
    setFormPlannedEnd(item.plannedCompletionDate);
    setFormActualEnd(item.actualCompletionDate || '');
    setFormStatus(item.status);
    setFormPriority(item.priority);
    setFormRemarks(item.remarks || '');
    setShowAddModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTask.trim() || !formStartDate || !formPlannedEnd) {
      alert('Task title, start date and planned completion date are required.');
      return;
    }

    setSaving(true);
    try {
      if (editingItem) {
        await updateRoadmapItem(
          editingItem.id,
          {
            project: formProject.trim(),
            machineNumber: formMachine.trim(),
            department: formDept,
            process: formProcess.trim(),
            task: formTask.trim(),
            startDate: formStartDate,
            plannedCompletionDate: formPlannedEnd,
            actualCompletionDate: formActualEnd || undefined,
            status: formStatus,
            priority: formPriority,
            remarks: formRemarks.trim() || undefined,
          },
          userProfile?.email
        );
      } else {
        await addRoadmapItem(
          {
            project: formProject.trim(),
            machineNumber: formMachine.trim(),
            department: formDept,
            process: formProcess.trim(),
            task: formTask.trim(),
            startDate: formStartDate,
            plannedCompletionDate: formPlannedEnd,
            actualCompletionDate: formActualEnd || undefined,
            status: formStatus,
            priority: formPriority,
            remarks: formRemarks.trim() || undefined,
          },
          userProfile?.email
        );
      }
      setShowAddModal(false);
    } catch (err) {
      console.error(err);
      alert('Failed to save roadmap item.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string, title: string) => {
    if (confirm(`Are you sure you want to delete roadmap task "${title}"?`)) {
      try {
        await deleteRoadmapItem(id, title, userProfile?.email);
      } catch (err) {
        console.error(err);
      }
    }
  };

  // Status colors helper
  const getStatusColor = (status: RoadmapItem['status']) => {
    switch (status) {
      case 'Completed':
        return 'bg-emerald-500 text-white';
      case 'In Progress':
        return 'bg-blue-600 text-white';
      case 'Delayed':
        return 'bg-red-500 text-white';
      case 'On Hold':
        return 'bg-amber-500 text-white';
      default:
        return 'bg-slate-400 text-white';
    }
  };

  const getStatusBadge = (status: RoadmapItem['status']) => {
    switch (status) {
      case 'Completed':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'In Progress':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'Delayed':
        return 'bg-red-50 text-red-700 border-red-200';
      case 'On Hold':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      default:
        return 'bg-slate-50 text-slate-700 border-slate-200';
    }
  };

  return (
    <div className="space-y-5">
      {/* Header and Controls */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <span className="px-2.5 py-0.5 rounded-md bg-blue-100 text-blue-800 text-[10px] font-black uppercase tracking-wider">
              Planning Module
            </span>
            <span className="text-xs text-slate-500 font-semibold">
              {filteredItems.length} Scheduled Tasks
            </span>
          </div>
          <h2 className="text-lg sm:text-xl font-black text-slate-900 mt-1">
            Manufacturing Roadmap &amp; Gantt Timeline
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Visualize machine project schedules, process dependencies, and planned vs actual delivery across all departments.
          </p>
        </div>

        <div className="flex items-center flex-wrap gap-2">
          {/* View mode toggle */}
          <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-semibold">
            <button
              onClick={() => setViewMode('timeline')}
              className={`px-3 py-1.5 rounded-lg transition ${
                viewMode === 'timeline' ? 'bg-white text-blue-700 shadow-xs font-bold' : 'text-slate-600'
              }`}
            >
              Gantt Timeline
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`px-3 py-1.5 rounded-lg transition ${
                viewMode === 'table' ? 'bg-white text-blue-700 shadow-xs font-bold' : 'text-slate-600'
              }`}
            >
              Table View
            </button>
          </div>

          {/* Add Roadmap Task Button */}
          <button
            onClick={handleOpenAdd}
            className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs flex items-center space-x-1.5 transition"
          >
            <Plus className="w-4 h-4" />
            <span>+ Add Roadmap Task</span>
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white rounded-xl border border-slate-200 p-3.5 shadow-xs flex flex-wrap items-center gap-3 text-xs">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search task, machine, project, department..."
            className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-blue-500"
          />
        </div>

        <div className="flex items-center gap-2">
          <select
            value={filterDept}
            onChange={(e) => setFilterDept(e.target.value)}
            className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700"
          >
            <option value="">All Departments</option>
            {INITIAL_DEPARTMENTS.map((d) => (
              <option key={d.code} value={d.name}>
                {d.name}
              </option>
            ))}
          </select>

          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700"
          >
            <option value="">All Statuses</option>
            <option value="Not Started">Not Started</option>
            <option value="In Progress">In Progress</option>
            <option value="Completed">Completed</option>
            <option value="Delayed">Delayed</option>
            <option value="On Hold">On Hold</option>
          </select>

          {viewMode === 'timeline' && (
            <select
              value={timelineScale}
              onChange={(e) => setTimelineScale(e.target.value as any)}
              className="bg-blue-50 text-blue-800 font-bold border border-blue-200 rounded-lg px-2.5 py-1.5 text-xs"
            >
              <option value="Daily">Daily Scale</option>
              <option value="Weekly">Weekly Scale</option>
              <option value="Monthly">Monthly Scale</option>
            </select>
          )}
        </div>
      </div>

      {/* Visual Gantt Timeline / Table View */}
      {filteredItems.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-xs text-slate-400">
          <CalendarDays className="w-10 h-10 text-slate-300 mx-auto mb-2" />
          <p className="font-semibold text-slate-600 text-sm">No Roadmap Tasks Found</p>
          <p className="mt-1">
            Create production milestones and machine schedules by clicking &ldquo;+ Add Roadmap Task&rdquo; above.
          </p>
        </div>
      ) : viewMode === 'timeline' ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500 border-b border-slate-100 pb-2">
            <span>Project / Task / Machine</span>
            <div className="flex items-center space-x-3">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" /> Completed
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-600 inline-block" /> In Progress
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block" /> Delayed
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" /> On Hold
              </span>
            </div>
          </div>

          <div className="space-y-3">
            {filteredItems.map((item) => (
              <div
                key={item.id}
                className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl hover:border-blue-300 transition"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                  <div className="flex items-center space-x-2">
                    <span className="font-bold text-xs text-slate-900">{item.task}</span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-blue-100 text-blue-800 font-bold">
                      {item.machineNumber ? `Mach ${item.machineNumber}` : item.project}
                    </span>
                    <span className="text-[10px] text-slate-500 font-medium">{item.department}</span>
                  </div>

                  <div className="flex items-center space-x-2">
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${getStatusBadge(
                        item.status
                      )}`}
                    >
                      {item.status}
                    </span>
                    <button
                      onClick={() => handleOpenEdit(item)}
                      className="text-[11px] font-bold text-blue-600 hover:underline"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(item.id, item.task)}
                      className="text-slate-400 hover:text-red-600 p-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Progress / Timeline visual bar */}
                <div className="relative pt-1">
                  <div className="flex items-center justify-between text-[10px] text-slate-500 mb-1">
                    <span>Start: <strong>{item.startDate}</strong></span>
                    <span>Planned Due: <strong>{item.plannedCompletionDate}</strong></span>
                    {item.actualCompletionDate && (
                      <span className="text-emerald-700 font-bold">
                        Actual: {item.actualCompletionDate}
                      </span>
                    )}
                  </div>
                  <div className="h-3 w-full bg-slate-200 rounded-full overflow-hidden flex items-center">
                    <div
                      className={`h-full rounded-full transition-all ${getStatusColor(item.status)}`}
                      style={{
                        width:
                          item.status === 'Completed'
                            ? '100%'
                            : item.status === 'In Progress'
                            ? '60%'
                            : item.status === 'Delayed'
                            ? '85%'
                            : '15%',
                      }}
                    />
                  </div>
                  {item.remarks && (
                    <div className="mt-1 text-[11px] text-slate-500 italic">
                      Remarks: {item.remarks}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        /* Table View */
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-blue-50 text-blue-900 border-b border-blue-200 font-bold uppercase tracking-wider text-[10px]">
                  <th className="p-3">Project / Machine</th>
                  <th className="p-3">Task &amp; Process</th>
                  <th className="p-3">Department</th>
                  <th className="p-3">Start Date</th>
                  <th className="p-3">Planned Completion</th>
                  <th className="p-3">Actual Date</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Priority</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filteredItems.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50 transition">
                    <td className="p-3 font-semibold text-slate-900">
                      <div>{item.project}</div>
                      <div className="text-[10px] text-blue-700 font-mono">
                        {item.machineNumber ? `Mach ${item.machineNumber}` : '-'}
                      </div>
                    </td>
                    <td className="p-3">
                      <div className="font-bold text-slate-900">{item.task}</div>
                      <div className="text-[10px] text-slate-500">{item.process || '-'}</div>
                    </td>
                    <td className="p-3 text-slate-600">{item.department}</td>
                    <td className="p-3 font-mono text-[11px]">{item.startDate}</td>
                    <td className="p-3 font-mono text-[11px]">{item.plannedCompletionDate}</td>
                    <td className="p-3 font-mono text-[11px] text-emerald-700 font-bold">
                      {item.actualCompletionDate || '-'}
                    </td>
                    <td className="p-3">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold border ${getStatusBadge(
                          item.status
                        )}`}
                      >
                        {item.status}
                      </span>
                    </td>
                    <td className="p-3 font-bold">{item.priority}</td>
                    <td className="p-3 text-right space-x-2">
                      <button
                        onClick={() => handleOpenEdit(item)}
                        className="text-blue-600 hover:text-blue-800 font-bold"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(item.id, item.task)}
                        className="text-slate-400 hover:text-red-600"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add / Edit Roadmap Task Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-base text-slate-900">
                {editingItem ? 'Edit Roadmap Task' : 'Add Roadmap Task'}
              </h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Project <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formProject}
                    onChange={(e) => setFormProject(e.target.value)}
                    placeholder="e.g. CMM Alpha 2026"
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Machine Number
                  </label>
                  <input
                    type="text"
                    value={formMachine}
                    onChange={(e) => setFormMachine(e.target.value)}
                    placeholder="e.g. 2523"
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 focus:bg-white"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Department <span className="text-red-500">*</span>
                </label>
                <select
                  value={formDept}
                  onChange={(e) => setFormDept(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 focus:bg-white"
                >
                  {INITIAL_DEPARTMENTS.map((d) => (
                    <option key={d.code} value={d.name}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Process Name
                  </label>
                  <input
                    type="text"
                    value={formProcess}
                    onChange={(e) => setFormProcess(e.target.value)}
                    placeholder="e.g. Base Machining"
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Task Title <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formTask}
                    onChange={(e) => setFormTask(e.target.value)}
                    placeholder="e.g. Granite bed lapping"
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 focus:bg-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Start Date <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={formStartDate}
                    onChange={(e) => setFormStartDate(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Planned End <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={formPlannedEnd}
                    onChange={(e) => setFormPlannedEnd(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Actual End
                  </label>
                  <input
                    type="date"
                    value={formActualEnd}
                    onChange={(e) => setFormActualEnd(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 focus:bg-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Status
                  </label>
                  <select
                    value={formStatus}
                    onChange={(e) => setFormStatus(e.target.value as any)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 focus:bg-white"
                  >
                    <option value="Not Started">Not Started</option>
                    <option value="In Progress">In Progress</option>
                    <option value="Completed">Completed</option>
                    <option value="Delayed">Delayed</option>
                    <option value="On Hold">On Hold</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Priority
                  </label>
                  <select
                    value={formPriority}
                    onChange={(e) => setFormPriority(e.target.value as any)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 focus:bg-white"
                  >
                    <option value="Low">Low</option>
                    <option value="Medium">Medium</option>
                    <option value="High">High</option>
                    <option value="Critical">Critical</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Remarks / Notes
                </label>
                <textarea
                  rows={2}
                  value={formRemarks}
                  onChange={(e) => setFormRemarks(e.target.value)}
                  placeholder="Additional schedule details or constraints..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 focus:bg-white"
                />
              </div>

              <div className="pt-2 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-3 py-2 rounded-xl text-slate-600 hover:bg-slate-100 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold shadow-xs disabled:opacity-50"
                >
                  {saving ? 'Saving...' : editingItem ? 'Update Task' : 'Save Task'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
