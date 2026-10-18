import React, { useState, useEffect, useMemo } from 'react';
import {
  PenTool,
  Plus,
  CheckCircle2,
  Clock,
  AlertTriangle,
  FileText,
  Calendar,
  Layers,
  Search,
  Filter,
  Users,
  CheckSquare,
  Square,
  ChevronDown,
  ChevronRight,
  Download,
  Upload,
  Sparkles,
  Send,
  MessageSquare,
  Eye,
  Trash2,
  Edit3,
  Flame,
  BarChart3,
  PieChart,
  RefreshCw,
  X,
  FileSpreadsheet,
  AlertCircle,
  HelpCircle,
  FolderOpen,
  ArrowRight,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  DesignWork,
  DesignOperationItem,
  DesignOperationMaster,
  DesignRequest,
  DesignDailyUpdate,
  DesignDocumentItem,
  DesignWorkType,
  DesignWorkPriority,
  DesignWorkStatus,
  UserProfile,
  Machine,
} from '../types';
import {
  subscribeDesignWork,
  subscribeDesignRequests,
  subscribeDesignOperationsMaster,
  subscribeDesignDailyUpdates,
  createDesignWork,
  updateDesignWork,
  deleteDesignWork,
  toggleDesignWorkOperation,
  addCustomOperationToWork,
  addDocumentToDesignWork,
  acceptDesignRequest,
  requestMoreInfoForDesignRequest,
  provideInfoForDesignRequest,
  completeDesignRequest,
  submitDesignDailyUpdate,
  createDesignOperationMaster,
  updateDesignOperationMaster,
  deleteDesignOperationMaster,
  seedStandardDesignOperations,
} from '../services/designService';
import { COMPANY_NAME } from '../constants';

export const WORK_TYPE_OPTIONS: DesignWorkType[] = [
  'New Design',
  'Drawing Modification',
  'Drawing Preparation',
  '3D Model',
  '2D Drawing',
  'Design Review',
  'Engineering Change',
  'Customer Requirement',
  'Internal Improvement',
  'Other',
];

export const ROOT_CAUSE_OPTIONS = [
  'Information Pending',
  'Customer Clarification',
  'Drawing Revision',
  'Approval Pending',
  'Design Change',
  'Technical Issue',
  'Manpower Shortage',
  'Priority Change',
  'Software / Hardware Issue',
  'Other',
];

interface DesignWorkManagementViewProps {
  userProfile?: UserProfile | null;
  departmentName?: string;
  isAdmin?: boolean;
  machines?: Machine[];
}

export const DesignWorkManagementView: React.FC<DesignWorkManagementViewProps> = ({
  userProfile,
  departmentName = '01 Design',
  isAdmin = false,
  machines = [],
}) => {
  // Active sub-tab
  const [activeTab, setActiveTab] = useState<
    | 'active_work'
    | 'my_daily_work'
    | 'requests'
    | 'ops_master'
    | 'delayed_work'
    | 'eod_update'
    | 'analytics'
  >('active_work');

  // Live collections
  const [designWorks, setDesignWorks] = useState<DesignWork[]>([]);
  const [designRequests, setDesignRequests] = useState<DesignRequest[]>([]);
  const [opsMaster, setOpsMaster] = useState<DesignOperationMaster[]>([]);
  const [dailyUpdates, setDailyUpdates] = useState<DesignDailyUpdate[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [selectedDeptFilter, setSelectedDeptFilter] = useState<string>(
    isAdmin ? 'All Departments' : departmentName
  );
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('All');
  const [priorityFilter, setPriorityFilter] = useState<string>('All');
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [selectedDesignerFilter, setSelectedDesignerFilter] = useState<string>('All');

  // Modals
  const [isAddWorkOpen, setIsAddWorkOpen] = useState(false);
  const [isAddOpMasterOpen, setIsAddOpMasterOpen] = useState(false);
  const [selectedWorkForDocs, setSelectedWorkForDocs] = useState<DesignWork | null>(null);
  const [requestForInfoModal, setRequestForInfoModal] = useState<DesignRequest | null>(null);
  const [requestForCompleteModal, setRequestForCompleteModal] = useState<DesignRequest | null>(null);
  const [requestForAcceptModal, setRequestForAcceptModal] = useState<DesignRequest | null>(null);
  const [requestForDetailModal, setRequestForDetailModal] = useState<DesignRequest | null>(null);

  // Seed standard operations on mount
  useEffect(() => {
    seedStandardDesignOperations(departmentName);
  }, [departmentName]);

  // Subscriptions
  useEffect(() => {
    const unsubWork = subscribeDesignWork((works) => {
      setDesignWorks(works);
      setLoading(false);
    }, isAdmin && selectedDeptFilter === 'All Departments' ? undefined : selectedDeptFilter);

    const unsubReqs = subscribeDesignRequests((reqs) => {
      setDesignRequests(reqs);
    }, { isDesign: true });

    const unsubOps = subscribeDesignOperationsMaster((ops) => {
      setOpsMaster(ops);
    });

    const unsubUpdates = subscribeDesignDailyUpdates((updates) => {
      setDailyUpdates(updates);
    }, isAdmin && selectedDeptFilter === 'All Departments' ? undefined : selectedDeptFilter);

    return () => {
      unsubWork();
      unsubReqs();
      unsubOps();
      unsubUpdates();
    };
  }, [selectedDeptFilter, isAdmin]);

  // Available designers from existing works and users
  const availableDesigners = useMemo(() => {
    const set = new Set<string>();
    designWorks.forEach((w) => {
      if (w.assignedDesigner) set.add(w.assignedDesigner);
    });
    if (userProfile?.displayName) set.add(userProfile.displayName);
    return Array.from(set);
  }, [designWorks, userProfile]);

  // Today string
  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);

  // Filtered Design Works
  const filteredWorks = useMemo(() => {
    return designWorks.filter((w) => {
      if (selectedDeptFilter !== 'All Departments' && w.department !== selectedDeptFilter) return false;
      if (typeFilter !== 'All' && w.workType !== typeFilter) return false;
      if (priorityFilter !== 'All' && w.priority !== priorityFilter) return false;
      if (statusFilter !== 'All' && w.status !== statusFilter) return false;
      if (selectedDesignerFilter !== 'All' && w.assignedDesigner !== selectedDesignerFilter) return false;
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        const matchesTitle = w.title.toLowerCase().includes(term);
        const matchesDesc = w.description?.toLowerCase().includes(term);
        const matchesMachine = w.machineNumber?.toLowerCase().includes(term);
        const matchesDesigner = w.assignedDesigner?.toLowerCase().includes(term);
        if (!matchesTitle && !matchesDesc && !matchesMachine && !matchesDesigner) return false;
      }
      return true;
    });
  }, [designWorks, selectedDeptFilter, typeFilter, priorityFilter, statusFilter, selectedDesignerFilter, searchTerm]);

  // Delayed Works
  const delayedWorks = useMemo(() => {
    return designWorks.filter((w) => {
      if (w.status === 'COMPLETED') return false;
      if (w.status === 'DELAYED') return true;
      if (w.targetDate && w.targetDate < todayStr && (w.progressPercent || 0) < 100) return true;
      return false;
    }).map((w) => {
      const targetDate = new Date(w.targetDate || todayStr);
      const diffTime = Math.max(0, new Date().getTime() - targetDate.getTime());
      const daysLate = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      return { ...w, daysLate };
    });
  }, [designWorks, todayStr]);

  // Top KPI Metrics
  const kpis = useMemo(() => {
    const totalActive = designWorks.filter((w) => w.status !== 'COMPLETED').length;
    const completed = designWorks.filter((w) => w.status === 'COMPLETED').length;
    const inProgress = designWorks.filter((w) => w.status === 'IN_PROGRESS').length;
    const pending = designWorks.filter((w) => w.status === 'CREATE' || w.status === 'ASSIGNED').length;
    const delayed = delayedWorks.length;
    const todayWork = designWorks.filter(
      (w) => (w.startDate === todayStr || w.targetDate === todayStr) && w.status !== 'COMPLETED'
    ).length;

    const reqReceived = designRequests.length;
    const reqCompleted = designRequests.filter((r) => r.status === 'Completed' || r.status === 'Closed').length;
    const eodCount = dailyUpdates.length;

    return {
      totalActive,
      todayWork,
      completed,
      inProgress,
      pending,
      delayed,
      reqReceived,
      reqCompleted,
      eodCount,
    };
  }, [designWorks, delayedWorks, designRequests, dailyUpdates, todayStr]);

  // Designer Workload Matrix
  const designerWorkload = useMemo(() => {
    const map: Record<
      string,
      { active: number; completed: number; pending: number; delayed: number; total: number }
    > = {};

    designWorks.forEach((w) => {
      const designer = w.assignedDesigner || 'Unassigned';
      if (!map[designer]) {
        map[designer] = { active: 0, completed: 0, pending: 0, delayed: 0, total: 0 };
      }
      map[designer].total += 1;
      if (w.status === 'COMPLETED') {
        map[designer].completed += 1;
      } else {
        map[designer].active += 1;
        if (w.status === 'IN_PROGRESS') {
          // in progress
        } else if (w.status === 'CREATE' || w.status === 'ASSIGNED') {
          map[designer].pending += 1;
        }
        if (w.status === 'DELAYED' || (w.targetDate && w.targetDate < todayStr)) {
          map[designer].delayed += 1;
        }
      }
    });

    return Object.entries(map).map(([name, stats]) => ({
      designer: name,
      ...stats,
    })).sort((a, b) => b.active - a.active);
  }, [designWorks, todayStr]);

  // Operations toggle handler
  const handleToggleOperation = async (work: DesignWork, opId: string) => {
    try {
      const userName = userProfile?.displayName || 'Designer';
      await toggleDesignWorkOperation(work, opId, userName, userProfile?.email);
    } catch (err) {
      console.error('Failed to toggle operation:', err);
    }
  };

  // Export Excel
  const handleExportExcel = () => {
    const wb = XLSX.utils.book_new();

    // Sheet 1: Design Works
    const worksData = filteredWorks.map((w) => ({
      'Title': w.title,
      'Department': w.department,
      'Work Type': w.workType,
      'Priority': w.priority,
      'Status': w.status,
      'Assigned Designer': w.assignedDesigner || 'Unassigned',
      'Progress %': `${w.progressPercent || 0}%`,
      'Operations': `${w.completedOperationsCount || 0}/${w.totalOperationsCount || 0}`,
      'Start Date': w.startDate,
      'Target Date': w.targetDate,
      'Delay Reason': w.delayReason || '',
      'Machine': w.machineNumber || '',
    }));
    const wsWorks = XLSX.utils.json_to_sheet(worksData);
    XLSX.utils.book_append_sheet(wb, wsWorks, 'Design Works');

    // Sheet 2: Requests
    const reqData = designRequests.map((r) => ({
      'Request Number': r.requestNumber,
      'Title': r.requestTitle,
      'Requesting Department': r.requestingDepartment,
      'Requested By': r.requestedBy,
      'Status': r.status,
      'Priority': r.priority,
      'Assigned Designer': r.assignedDesigner || '',
      'Required By': r.requiredByDate,
      'Completed Date': r.completedDate || '',
    }));
    const wsReqs = XLSX.utils.json_to_sheet(reqData);
    XLSX.utils.book_append_sheet(wb, wsReqs, 'Design Requests');

    // Sheet 3: Designer Workload
    const wsWorkload = XLSX.utils.json_to_sheet(designerWorkload);
    XLSX.utils.book_append_sheet(wb, wsWorkload, 'Designer Workload');

    XLSX.writeFile(wb, `Design_Work_Management_${todayStr}.xlsx`);
  };

  return (
    <div className="space-y-6 animate-fadeIn pb-16">
      {/* =============================================================
          1. HEADER & TOP BANNER
          ============================================================= */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
            <div className="w-11 h-11 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-md shadow-indigo-200">
              <PenTool className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h1 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight">
                  DESIGN WORK MANAGEMENT
                </h1>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                  Autonomous Division &bull; Non-Production Pipeline
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Self-Governed Engineering &bull; 2D/3D Drawings &bull; Reusable Operations &bull; Support Requests &bull; EOD Reports
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setIsAddWorkOpen(true)}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition flex items-center space-x-1.5 shadow-md shadow-indigo-200"
            >
              <Plus className="w-4 h-4" />
              <span>+ ADD DESIGN WORK</span>
            </button>
            <button
              onClick={() => setActiveTab('eod_update')}
              className="px-3.5 py-2 bg-slate-900 hover:bg-black text-white rounded-xl text-xs font-bold transition flex items-center space-x-1.5 shadow-xs"
            >
              <Send className="w-3.5 h-3.5 text-indigo-300" />
              <span>END OF DAY UPDATE</span>
            </button>
            <button
              onClick={handleExportExcel}
              className="px-3 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-xl text-xs font-bold transition flex items-center space-x-1.5"
              title="Download full Excel report"
            >
              <Download className="w-3.5 h-3.5 text-emerald-600" />
              <span>Export</span>
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center space-x-1 border-t border-slate-100 pt-3 overflow-x-auto custom-scrollbar text-xs font-bold">
          <button
            onClick={() => setActiveTab('active_work')}
            className={`px-3 py-2 rounded-xl transition flex items-center space-x-2 shrink-0 ${
              activeTab === 'active_work'
                ? 'bg-indigo-600 text-white shadow-2xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>Active Work &amp; Projects</span>
            <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${activeTab === 'active_work' ? 'bg-indigo-700 text-white' : 'bg-slate-200 text-slate-700'}`}>
              {kpis.totalActive}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('my_daily_work')}
            className={`px-3 py-2 rounded-xl transition flex items-center space-x-2 shrink-0 ${
              activeTab === 'my_daily_work'
                ? 'bg-indigo-600 text-white shadow-2xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Clock className="w-4 h-4" />
            <span>My Daily Work</span>
            <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${activeTab === 'my_daily_work' ? 'bg-indigo-700 text-white' : 'bg-slate-200 text-slate-700'}`}>
              {kpis.todayWork}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('requests')}
            className={`px-3 py-2 rounded-xl transition flex items-center space-x-2 shrink-0 ${
              activeTab === 'requests'
                ? 'bg-indigo-600 text-white shadow-2xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <MessageSquare className="w-4 h-4" />
            <span>Design Requests</span>
            <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${activeTab === 'requests' ? 'bg-indigo-700 text-white' : 'bg-amber-100 text-amber-800'}`}>
              {kpis.reqReceived}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('ops_master')}
            className={`px-3 py-2 rounded-xl transition flex items-center space-x-2 shrink-0 ${
              activeTab === 'ops_master'
                ? 'bg-indigo-600 text-white shadow-2xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <CheckSquare className="w-4 h-4" />
            <span>Operation Master</span>
            <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${activeTab === 'ops_master' ? 'bg-indigo-700 text-white' : 'bg-slate-200 text-slate-700'}`}>
              {opsMaster.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('delayed_work')}
            className={`px-3 py-2 rounded-xl transition flex items-center space-x-2 shrink-0 ${
              activeTab === 'delayed_work'
                ? 'bg-indigo-600 text-white shadow-2xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <AlertTriangle className="w-4 h-4 text-red-500" />
            <span>Late &amp; Delayed</span>
            {kpis.delayed > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-red-100 text-red-700 font-black">
                {kpis.delayed}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('eod_update')}
            className={`px-3 py-2 rounded-xl transition flex items-center space-x-2 shrink-0 ${
              activeTab === 'eod_update'
                ? 'bg-indigo-600 text-white shadow-2xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>EOD Updates ({dailyUpdates.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('analytics')}
            className={`px-3 py-2 rounded-xl transition flex items-center space-x-2 shrink-0 ${
              activeTab === 'analytics'
                ? 'bg-indigo-600 text-white shadow-2xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <BarChart3 className="w-4 h-4" />
            <span>Design Analytics</span>
          </button>
        </div>
      </div>

      {/* =============================================================
          2. TOP KPI CARDS (Requirement 2)
          ============================================================= */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
        <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs">
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">Active Work</span>
          <span className="text-xl font-black font-mono text-slate-900 mt-1 block">{kpis.totalActive}</span>
          <span className="text-[10px] text-slate-500 mt-0.5 block">Open projects</span>
        </div>

        <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs">
          <span className="text-[10px] font-black uppercase tracking-wider text-indigo-700 block">Today's Work</span>
          <span className="text-xl font-black font-mono text-indigo-700 mt-1 block">{kpis.todayWork}</span>
          <span className="text-[10px] text-indigo-500 mt-0.5 block">Scheduled for shift</span>
        </div>

        <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs">
          <span className="text-[10px] font-black uppercase tracking-wider text-emerald-700 block">Completed</span>
          <span className="text-xl font-black font-mono text-emerald-700 mt-1 block">{kpis.completed}</span>
          <span className="text-[10px] text-emerald-600 mt-0.5 block">100% Done</span>
        </div>

        <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs">
          <span className="text-[10px] font-black uppercase tracking-wider text-blue-700 block">In Progress</span>
          <span className="text-xl font-black font-mono text-blue-700 mt-1 block">{kpis.inProgress}</span>
          <span className="text-[10px] text-blue-600 mt-0.5 block">Active drafting</span>
        </div>

        <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs">
          <span className="text-[10px] font-black uppercase tracking-wider text-amber-700 block">Pending</span>
          <span className="text-xl font-black font-mono text-amber-700 mt-1 block">{kpis.pending}</span>
          <span className="text-[10px] text-amber-600 mt-0.5 block">Awaiting start</span>
        </div>

        <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs">
          <span className="text-[10px] font-black uppercase tracking-wider text-red-700 block">Delayed</span>
          <span className="text-xl font-black font-mono text-red-700 mt-1 block">{kpis.delayed}</span>
          <span className="text-[10px] text-red-600 mt-0.5 block">Overdue target</span>
        </div>

        <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs">
          <span className="text-[10px] font-black uppercase tracking-wider text-purple-700 block">Requests In</span>
          <span className="text-xl font-black font-mono text-purple-700 mt-1 block">{kpis.reqReceived}</span>
          <span className="text-[10px] text-purple-600 mt-0.5 block">From plant depts</span>
        </div>

        <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs">
          <span className="text-[10px] font-black uppercase tracking-wider text-emerald-800 block">Requests Done</span>
          <span className="text-xl font-black font-mono text-emerald-800 mt-1 block">{kpis.reqCompleted}</span>
          <span className="text-[10px] text-emerald-700 mt-0.5 block">Resolved &amp; sent</span>
        </div>
      </div>

      {/* =============================================================
          SUB-TAB 1: ACTIVE WORK & PROJECTS (Requirement 3, 4, 6)
          ============================================================= */}
      {activeTab === 'active_work' && (
        <div className="space-y-4">
          {/* Filter Bar */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-wrap items-center gap-3 text-xs">
            <div className="flex-1 min-w-[200px] relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                placeholder="Search design title, machine no, designer..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-8 pr-3 py-2 text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {isAdmin && (
              <div className="w-48">
                <select
                  value={selectedDeptFilter}
                  onChange={(e) => setSelectedDeptFilter(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 font-semibold outline-none"
                >
                  <option value="01 Design">01 Design</option>
                </select>
              </div>
            )}

            <div className="w-36">
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 font-semibold outline-none"
              >
                <option value="All">All Work Types</option>
                {WORK_TYPE_OPTIONS.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>

            <div className="w-32">
              <select
                value={selectedDesignerFilter}
                onChange={(e) => setSelectedDesignerFilter(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 font-semibold outline-none"
              >
                <option value="All">All Designers</option>
                {availableDesigners.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>

            <div className="w-32">
              <select
                value={priorityFilter}
                onChange={(e) => setPriorityFilter(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 font-semibold outline-none"
              >
                <option value="All">All Priorities</option>
                <option value="Critical">Critical</option>
                <option value="High">High</option>
                <option value="Medium">Medium</option>
                <option value="Low">Low</option>
              </select>
            </div>

            <div className="w-32">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 font-semibold outline-none"
              >
                <option value="All">All Statuses</option>
                <option value="CREATE">Created</option>
                <option value="ASSIGNED">Assigned</option>
                <option value="IN_PROGRESS">In Progress</option>
                <option value="COMPLETED">Completed</option>
                <option value="DELAYED">Delayed</option>
              </select>
            </div>
          </div>

          {/* Design Works List */}
          <div className="space-y-3">
            {filteredWorks.length === 0 ? (
              <div className="bg-white p-12 rounded-2xl border border-slate-200 text-center text-xs text-slate-400">
                No design work records match the criteria. Click "+ ADD DESIGN WORK" to create a new task.
              </div>
            ) : (
              filteredWorks.map((work) => {
                const isOverdue = work.status !== 'COMPLETED' && work.targetDate && work.targetDate < todayStr;
                return (
                  <div
                    key={work.id}
                    className={`bg-white rounded-2xl p-4 sm:p-5 border transition space-y-3 shadow-xs ${
                      isOverdue
                        ? 'border-red-300 ring-1 ring-red-100'
                        : work.status === 'COMPLETED'
                        ? 'border-emerald-200'
                        : 'border-slate-200 hover:border-indigo-300'
                    }`}
                  >
                    {/* Top Row: Title, Priority, Status, Designer */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="space-y-1">
                        <div className="flex items-center space-x-2">
                          <span className="font-mono text-[10px] font-black px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                            {work.workType}
                          </span>
                          <span
                            className={`text-[10px] font-black px-2 py-0.5 rounded uppercase ${
                              work.priority === 'Critical'
                                ? 'bg-red-100 text-red-800'
                                : work.priority === 'High'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {work.priority} Priority
                          </span>
                          {isOverdue && (
                            <span className="text-[10px] font-black px-2 py-0.5 rounded bg-red-600 text-white flex items-center space-x-1">
                              <AlertTriangle className="w-3 h-3" />
                              <span>OVERDUE</span>
                            </span>
                          )}
                        </div>

                        <h3 className="font-black text-sm text-slate-900 flex items-center space-x-2">
                          <span>{work.title}</span>
                          {work.machineNumber && (
                            <span className="font-mono text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">
                              Machine {work.machineNumber}
                            </span>
                          )}
                        </h3>
                        {work.description && (
                          <p className="text-xs text-slate-500">{work.description}</p>
                        )}
                      </div>

                      {/* Designer & Schedule */}
                      <div className="flex sm:flex-col items-end justify-between sm:justify-center gap-1 text-xs">
                        <div className="flex items-center space-x-1.5 font-bold text-slate-800">
                          <Users className="w-3.5 h-3.5 text-indigo-600" />
                          <span>{work.assignedDesigner || 'Unassigned'}</span>
                        </div>
                        <div className="text-[11px] text-slate-500 flex items-center space-x-2">
                          <span>Start: {work.startDate || '-'}</span>
                          <span>&bull;</span>
                          <span className={isOverdue ? 'font-bold text-red-600' : ''}>
                            Target: {work.targetDate || '-'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Auto-Calculated Progress Bar (Requirement 4) */}
                    <div className="space-y-1.5 pt-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-600 font-semibold">
                          Operations Progress ({work.completedOperationsCount || 0} / {work.totalOperationsCount || 0} Completed)
                        </span>
                        <span className="font-mono font-black text-indigo-700">
                          {work.progressPercent || 0}%
                        </span>
                      </div>
                      <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            (work.progressPercent || 0) >= 100
                              ? 'bg-emerald-500'
                              : (work.progressPercent || 0) >= 50
                              ? 'bg-indigo-600'
                              : 'bg-amber-500'
                          }`}
                          style={{ width: `${work.progressPercent || 0}%` }}
                        />
                      </div>
                    </div>

                    {/* Operations Checklist (Requirement 4) */}
                    <div className="p-3 bg-slate-50/80 rounded-xl border border-slate-200/80 space-y-2">
                      <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider block">
                        Operations Checklist (Click to complete)
                      </span>
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 text-xs">
                        {(work.operations || []).map((op) => (
                          <button
                            key={op.id}
                            type="button"
                            onClick={() => handleToggleOperation(work, op.id)}
                            className={`p-2 rounded-lg border text-left flex items-start space-x-2 transition ${
                              op.completed
                                ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                                : 'bg-white border-slate-200 hover:border-slate-300 text-slate-700'
                            }`}
                          >
                            <span className="mt-0.5">
                              {op.completed ? (
                                <CheckSquare className="w-3.5 h-3.5 text-emerald-600" />
                              ) : (
                                <Square className="w-3.5 h-3.5 text-slate-400" />
                              )}
                            </span>
                            <div className="flex-1 min-w-0">
                              <span className={`block font-semibold truncate ${op.completed ? 'line-through opacity-75' : ''}`}>
                                {op.name}
                              </span>
                              {op.completed && op.completedBy && (
                                <span className="text-[9px] text-emerald-700 block">
                                  Done by {op.completedBy}
                                </span>
                              )}
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Documents / Drawings Attached (Requirement 19) */}
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 text-xs">
                      <div className="flex flex-wrap items-center gap-2">
                        {(work.documents || []).map((doc) => (
                          <span
                            key={doc.id}
                            className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-800 text-[11px] font-bold"
                          >
                            <FileText className="w-3 h-3 text-indigo-600" />
                            <span>{doc.name}</span>
                            <span className="text-[10px] px-1 py-0.2 bg-indigo-200 rounded text-indigo-900">
                              {doc.version}
                            </span>
                          </span>
                        ))}
                        <button
                          onClick={() => setSelectedWorkForDocs(work)}
                          className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[11px] font-bold transition flex items-center space-x-1"
                        >
                          <Upload className="w-3 h-3" />
                          <span>+ Add Drawing / Doc</span>
                        </button>
                      </div>

                      <div className="flex items-center space-x-2">
                        {isOverdue && !work.delayReason && (
                          <button
                            onClick={async () => {
                              const reason = prompt('Please select or enter reason for delay:', 'Customer Clarification');
                              if (reason) {
                                await updateDesignWork(work.id, { delayReason: reason, status: 'DELAYED' }, userProfile?.email);
                              }
                            }}
                            className="px-2 py-1 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-lg text-[11px] font-bold"
                          >
                            Specify Delay Reason
                          </button>
                        )}
                        <button
                          onClick={async () => {
                            if (confirm(`Delete design work "${work.title}"?`)) {
                              await deleteDesignWork(work.id, userProfile?.email);
                            }
                          }}
                          className="p-1.5 text-slate-400 hover:text-red-600 transition rounded-lg hover:bg-slate-100"
                          title="Delete work"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* =============================================================
          SUB-TAB 2: MY DAILY WORK (Requirement 12)
          ============================================================= */}
      {activeTab === 'my_daily_work' && (
        <div className="space-y-4">
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
            <div>
              <h2 className="font-black text-sm text-slate-900 uppercase tracking-wide flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-indigo-600" />
                <span>MY DAILY DESIGN WORK SCHEDULE ({todayStr})</span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Personalized task queue for active designer shift execution
              </p>
            </div>
            <div className="flex items-center space-x-2">
              <span className="text-xs font-bold text-slate-500">Filter Designer:</span>
              <select
                value={selectedDesignerFilter}
                onChange={(e) => setSelectedDesignerFilter(e.target.value)}
                className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-800 font-bold outline-none"
              >
                <option value="All">All Team Members</option>
                {availableDesigners.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Active & In Progress */}
            <div className="space-y-3">
              <h3 className="font-bold text-xs uppercase tracking-wider text-slate-600 flex items-center justify-between">
                <span>Active / In Progress Work</span>
                <span className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded-full font-mono text-[10px]">
                  {filteredWorks.filter((w) => w.status !== 'COMPLETED').length}
                </span>
              </h3>
              {filteredWorks.filter((w) => w.status !== 'COMPLETED').map((work) => (
                <div key={work.id} className="bg-white p-4 rounded-xl border border-slate-200 space-y-2 shadow-2xs">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs text-slate-900">{work.title}</span>
                    <span className="font-mono text-xs font-black text-indigo-600">{work.progressPercent || 0}%</span>
                  </div>
                  <div className="text-[11px] text-slate-500 flex items-center justify-between">
                    <span>Target: {work.targetDate || '-'}</span>
                    <span className="font-bold text-slate-700">{work.assignedDesigner}</span>
                  </div>
                  {/* Quick toggle operations */}
                  <div className="space-y-1 pt-1 border-t border-slate-100">
                    {(work.operations || []).slice(0, 4).map((op) => (
                      <button
                        key={op.id}
                        type="button"
                        onClick={() => handleToggleOperation(work, op.id)}
                        className="w-full text-left text-[11px] flex items-center space-x-2 py-0.5 hover:text-indigo-600"
                      >
                        {op.completed ? (
                          <CheckSquare className="w-3 h-3 text-emerald-600 shrink-0" />
                        ) : (
                          <Square className="w-3 h-3 text-slate-400 shrink-0" />
                        )}
                        <span className={op.completed ? 'line-through text-slate-400' : 'text-slate-700 font-medium'}>
                          {op.name}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Completed Work Today */}
            <div className="space-y-3">
              <h3 className="font-bold text-xs uppercase tracking-wider text-emerald-700 flex items-center justify-between">
                <span>Completed Tasks</span>
                <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-full font-mono text-[10px]">
                  {filteredWorks.filter((w) => w.status === 'COMPLETED').length}
                </span>
              </h3>
              {filteredWorks.filter((w) => w.status === 'COMPLETED').map((work) => (
                <div key={work.id} className="bg-emerald-50/50 p-4 rounded-xl border border-emerald-200 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs text-slate-900">{work.title}</span>
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  </div>
                  <div className="text-[11px] text-emerald-800 font-semibold">
                    100% Completed &bull; Designer: {work.assignedDesigner}
                  </div>
                  <div className="text-[10px] text-slate-500">
                    Completion Date: {work.actualCompletionDate || todayStr}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* =============================================================
          SUB-TAB 3: DESIGN REQUESTS INBOX (Requirement 7, 8, 9, 10, 11)
          ============================================================= */}
      {activeTab === 'requests' && (
        <div className="space-y-4">
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
            <div>
              <h2 className="font-black text-sm text-slate-900 uppercase tracking-wide flex items-center gap-1.5">
                <MessageSquare className="w-4 h-4 text-purple-600" />
                <span>DESIGN REQUESTS INBOX (FROM PLANT DIVISIONS)</span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Engineering support requests sent by other departments &bull; Independent of machine handover roadmap
              </p>
            </div>
            <span className="px-3 py-1 rounded-full text-xs font-bold bg-purple-100 text-purple-800 font-mono">
              {designRequests.length} Total Requests
            </span>
          </div>

          <div className="space-y-3">
            {designRequests.length === 0 ? (
              <div className="bg-white p-12 rounded-2xl border border-slate-200 text-center text-xs text-slate-400">
                No active design requests received from other departments.
              </div>
            ) : (
              designRequests.map((req) => (
                <div
                  key={req.id}
                  className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs space-y-3 hover:border-purple-300 transition"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="space-y-1">
                      <div className="flex items-center space-x-2">
                        <span className="font-mono text-xs font-black text-purple-700 bg-purple-50 px-2 py-0.5 rounded">
                          {req.requestNumber}
                        </span>
                        <span className="font-bold text-xs text-slate-600">
                          From: <strong>{req.requestingDepartment}</strong> ({req.requestedBy})
                        </span>
                        <span
                          className={`text-[10px] font-black px-2 py-0.5 rounded uppercase ${
                            req.status === 'Completed'
                              ? 'bg-emerald-100 text-emerald-800'
                              : req.status === 'Waiting for Information'
                              ? 'bg-amber-100 text-amber-800'
                              : req.status === 'Accepted'
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-purple-100 text-purple-800'
                          }`}
                        >
                          {req.status}
                        </span>
                      </div>
                      <h3 className="font-black text-sm text-slate-900">{req.requestTitle}</h3>
                      <p className="text-xs text-slate-600">{req.requestDescription}</p>
                    </div>

                    <div className="text-right text-xs space-y-0.5">
                      <div className="text-slate-500">Required By: <strong>{req.requiredByDate}</strong></div>
                      <div className="text-slate-700">Designer: <strong>{req.assignedDesigner || 'Unassigned'}</strong></div>
                    </div>
                  </div>

                  {/* Clarification state info */}
                  {req.status === 'Waiting for Information' && req.infoRequiredNote && (
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs space-y-1">
                      <span className="font-bold text-amber-800 uppercase text-[10px] block">Information Requested From {req.requestingDepartment}:</span>
                      <p className="text-amber-900 font-medium">{req.infoRequiredNote}</p>
                    </div>
                  )}

                  {/* Completed info */}
                  {req.status === 'Completed' && req.solutionProvided && (
                    <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs space-y-1">
                      <span className="font-bold text-emerald-800 uppercase text-[10px] block">Solution Provided by Design:</span>
                      <p className="text-emerald-900 font-medium">{req.solutionProvided}</p>
                      {req.responseDocumentName && (
                        <span className="inline-flex items-center space-x-1 font-bold text-emerald-700 mt-1">
                          <FileText className="w-3 h-3" />
                          <span>Document: {req.responseDocumentName}</span>
                        </span>
                      )}
                    </div>
                  )}

                  {/* Actions bar */}
                  <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="text-slate-400 text-[11px]">Submitted: {req.createdAt?.split('T')[0]}</span>

                    <div className="flex items-center space-x-2">
                      {req.status === 'New' && (
                        <button
                          onClick={() => setRequestForAcceptModal(req)}
                          className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition flex items-center space-x-1"
                        >
                          <CheckCircle2 className="w-3 h-3" />
                          <span>Accept &amp; Assign</span>
                        </button>
                      )}

                      {req.status !== 'Completed' && req.status !== 'Closed' && (
                        <>
                          <button
                            onClick={() => setRequestForInfoModal(req)}
                            className="px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 rounded-xl font-bold transition"
                          >
                            Request More Info
                          </button>
                          <button
                            onClick={() => setRequestForCompleteModal(req)}
                            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold transition flex items-center space-x-1"
                          >
                            <Send className="w-3 h-3" />
                            <span>Complete Request</span>
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* =============================================================
          SUB-TAB 4: DESIGN OPERATION MASTER (Requirement 5)
          ============================================================= */}
      {activeTab === 'ops_master' && (
        <div className="space-y-4">
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
            <div>
              <h2 className="font-black text-sm text-slate-900 uppercase tracking-wide flex items-center gap-1.5">
                <CheckSquare className="w-4 h-4 text-indigo-600" />
                <span>DESIGN OPERATION MASTER (REUSABLE PROCESSES)</span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Configure standard operations (3D Modeling, 2D Drawing, Review, BOM) selectable when creating new work
              </p>
            </div>
            <button
              onClick={() => setIsAddOpMasterOpen(true)}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition flex items-center space-x-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>Add Operation</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {opsMaster.map((op) => (
              <div
                key={op.id}
                className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-2 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-black text-indigo-600">Seq #{op.order}</span>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        op.isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      {op.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  <h4 className="font-bold text-slate-900 text-sm mt-1">{op.name}</h4>
                  {op.description && <p className="text-xs text-slate-500 mt-0.5">{op.description}</p>}
                </div>

                <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                  <button
                    onClick={async () => {
                      await updateDesignOperationMaster(op.id, { isActive: !op.isActive }, userProfile?.email);
                    }}
                    className="text-slate-600 hover:text-indigo-600 font-semibold"
                  >
                    {op.isActive ? 'Deactivate' : 'Activate'}
                  </button>
                  <button
                    onClick={async () => {
                      if (confirm(`Delete operation "${op.name}"?`)) {
                        await deleteDesignOperationMaster(op.id, userProfile?.email);
                      }
                    }}
                    className="text-red-500 hover:text-red-700"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* =============================================================
          SUB-TAB 5: LATE DESIGN WORK & ROOT CAUSE (Requirement 17 & 18)
          ============================================================= */}
      {activeTab === 'delayed_work' && (
        <div className="space-y-4">
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
            <div>
              <h2 className="font-black text-sm text-slate-900 uppercase tracking-wide flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-red-600" />
                <span>LATE DESIGN WORK &amp; ROOT CAUSE ANALYSIS</span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Overdue items with calculated days late and categorized delay root causes
              </p>
            </div>
            <span className="px-3 py-1 rounded-full text-xs font-bold bg-red-100 text-red-800 font-mono">
              {delayedWorks.length} Overdue
            </span>
          </div>

          <div className="space-y-3">
            {delayedWorks.length === 0 ? (
              <div className="bg-white p-12 rounded-2xl border border-slate-200 text-center text-xs text-slate-400">
                No delayed design work. All tasks are currently on schedule.
              </div>
            ) : (
              delayedWorks.map((work) => (
                <div
                  key={work.id}
                  className="bg-white rounded-2xl p-4 sm:p-5 border border-red-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="space-y-1">
                    <div className="flex items-center space-x-2">
                      <span className="font-mono text-xs font-black text-red-700 bg-red-50 px-2 py-0.5 rounded">
                        {work.daysLate} Days Late
                      </span>
                      <span className="text-xs font-bold text-slate-600">Designer: {work.assignedDesigner}</span>
                      <span className="text-xs text-slate-400">Target: {work.targetDate}</span>
                    </div>
                    <h3 className="font-black text-sm text-slate-900">{work.title}</h3>
                    <div className="flex items-center space-x-2 text-xs">
                      <span className="text-slate-500">Root Cause:</span>
                      <span className="font-bold text-red-800 bg-red-50 px-2 py-0.5 rounded">
                        {work.delayReason || 'Unspecified'}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    <button
                      onClick={async () => {
                        const reason = prompt('Update Delay Root Cause:', work.delayReason || 'Customer Clarification');
                        if (reason) {
                          await updateDesignWork(work.id, { delayReason: reason }, userProfile?.email);
                        }
                      }}
                      className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl font-bold text-xs transition"
                    >
                      Update Root Cause
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* =============================================================
          SUB-TAB 6: END OF DAY UPDATE TO ADMIN (Requirement 13 & 14)
          ============================================================= */}
      {activeTab === 'eod_update' && (
        <div className="space-y-6">
          <EndOfWeekDailyUpdateForm
            departmentName={departmentName}
            userProfile={userProfile}
            designWorks={designWorks}
            designRequests={designRequests}
            todayStr={todayStr}
          />

          {/* Past Submissions History */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
            <h3 className="font-black text-sm text-slate-900 uppercase tracking-wide">
              Past End-of-Day Updates ({dailyUpdates.length})
            </h3>
            <div className="space-y-3">
              {dailyUpdates.map((up) => (
                <div key={up.id} className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-2">
                  <div className="flex items-center justify-between font-bold">
                    <span className="text-indigo-700 font-mono text-sm">{up.date}</span>
                    <span className="text-slate-500">Submitted by {up.submittedBy} at {up.submittedAt?.split('T')[1]?.slice(0, 5)}</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center pt-1 font-mono">
                    <div className="p-2 bg-white rounded border border-slate-200">
                      <span className="text-[10px] text-slate-400 font-bold block">Completed</span>
                      <span className="font-black text-emerald-700">{up.totalWorkCompletedToday}</span>
                    </div>
                    <div className="p-2 bg-white rounded border border-slate-200">
                      <span className="text-[10px] text-slate-400 font-bold block">In Progress</span>
                      <span className="font-black text-blue-700">{up.workInProgress}</span>
                    </div>
                    <div className="p-2 bg-white rounded border border-slate-200">
                      <span className="text-[10px] text-slate-400 font-bold block">Requests Done</span>
                      <span className="font-black text-purple-700">{up.designRequestsCompleted}</span>
                    </div>
                    <div className="p-2 bg-white rounded border border-slate-200">
                      <span className="text-[10px] text-slate-400 font-bold block">Delayed</span>
                      <span className="font-black text-red-700">{up.delayedWork}</span>
                    </div>
                  </div>
                  {up.majorIssues && (
                    <p className="text-slate-700 pt-1"><strong>Major Issues:</strong> {up.majorIssues}</p>
                  )}
                  {up.tomorrowPlannedWork && (
                    <p className="text-slate-700"><strong>Tomorrow's Plan:</strong> {up.tomorrowPlannedWork}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* =============================================================
          SUB-TAB 7: DESIGN ANALYTICS (Requirement 15 & 16)
          ============================================================= */}
      {activeTab === 'analytics' && (
        <div className="space-y-6">
          {/* Designer Workload Matrix */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
            <h3 className="font-black text-sm text-slate-900 uppercase tracking-wide flex items-center gap-1.5">
              <Users className="w-4 h-4 text-indigo-600" />
              <span>DESIGNER WORKLOAD DISTRIBUTION</span>
            </h3>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100 text-slate-600 uppercase font-bold text-[10px]">
                  <tr>
                    <th className="p-3">Designer</th>
                    <th className="p-3 text-center">Active Work</th>
                    <th className="p-3 text-center">Completed</th>
                    <th className="p-3 text-center">Pending</th>
                    <th className="p-3 text-center">Delayed</th>
                    <th className="p-3 text-right">Total Assigned</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {designerWorkload.map((row) => (
                    <tr key={row.designer} className="hover:bg-slate-50">
                      <td className="p-3 font-bold text-slate-900">{row.designer}</td>
                      <td className="p-3 text-center font-mono font-bold text-blue-700">{row.active}</td>
                      <td className="p-3 text-center font-mono font-bold text-emerald-700">{row.completed}</td>
                      <td className="p-3 text-center font-mono font-bold text-amber-700">{row.pending}</td>
                      <td className="p-3 text-center font-mono font-bold text-red-700">{row.delayed}</td>
                      <td className="p-3 text-right font-mono font-bold text-slate-800">{row.total}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Add Design Work Modal */}
      {isAddWorkOpen && (
        <AddDesignWorkModal
          isOpen={isAddWorkOpen}
          onClose={() => setIsAddWorkOpen(false)}
          department={departmentName}
          availableDesigners={availableDesigners}
          opsMaster={opsMaster}
          machines={machines}
          userProfile={userProfile}
        />
      )}

      {/* Add Operation Master Modal */}
      {isAddOpMasterOpen && (
        <AddDesignOperationMasterModal
          isOpen={isAddOpMasterOpen}
          onClose={() => setIsAddOpMasterOpen(false)}
          department={departmentName}
          userProfile={userProfile}
        />
      )}

      {/* Add Document Modal */}
      {selectedWorkForDocs && (
        <AddDesignDocumentModal
          isOpen={Boolean(selectedWorkForDocs)}
          work={selectedWorkForDocs}
          onClose={() => setSelectedWorkForDocs(null)}
          userProfile={userProfile}
        />
      )}

      {/* Request Modals */}
      {requestForAcceptModal && (
        <AcceptDesignRequestModal
          isOpen={Boolean(requestForAcceptModal)}
          request={requestForAcceptModal}
          availableDesigners={availableDesigners}
          onClose={() => setRequestForAcceptModal(null)}
          userProfile={userProfile}
        />
      )}

      {requestForInfoModal && (
        <RequestInfoModal
          isOpen={Boolean(requestForInfoModal)}
          request={requestForInfoModal}
          onClose={() => setRequestForInfoModal(null)}
          userProfile={userProfile}
        />
      )}

      {requestForCompleteModal && (
        <CompleteRequestModal
          isOpen={Boolean(requestForCompleteModal)}
          request={requestForCompleteModal}
          onClose={() => setRequestForCompleteModal(null)}
          userProfile={userProfile}
        />
      )}
    </div>
  );
};

// =========================================================================
// SUB-COMPONENTS & MODALS
// =========================================================================

const EndOfWeekDailyUpdateForm: React.FC<{
  departmentName: string;
  userProfile?: UserProfile | null;
  designWorks: DesignWork[];
  designRequests: DesignRequest[];
  todayStr: string;
}> = ({ departmentName, userProfile, designWorks, designRequests, todayStr }) => {
  const [majorIssues, setMajorIssues] = useState('');
  const [reasonForPending, setReasonForPending] = useState('');
  const [tomorrowPlan, setTomorrowPlan] = useState('');
  const [remarks, setRemarks] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  // Auto-calculated stats
  const totalPlanned = designWorks.length;
  const totalCompleted = designWorks.filter((w) => w.status === 'COMPLETED').length;
  const inProgress = designWorks.filter((w) => w.status === 'IN_PROGRESS').length;
  const pending = designWorks.filter((w) => w.status === 'CREATE' || w.status === 'ASSIGNED').length;
  const delayed = designWorks.filter((w) => w.status === 'DELAYED' || (w.targetDate && w.targetDate < todayStr)).length;
  const reqReceived = designRequests.length;
  const reqCompleted = designRequests.filter((r) => r.status === 'Completed').length;

  const totalOps = designWorks.reduce((acc, w) => acc + (w.totalOperationsCount || 0), 0);
  const compOps = designWorks.reduce((acc, w) => acc + (w.completedOperationsCount || 0), 0);
  const overallProgress = totalOps > 0 ? Math.round((compOps / totalOps) * 100) : 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await submitDesignDailyUpdate(
        {
          date: todayStr,
          department: departmentName,
          totalWorkPlannedToday: totalPlanned,
          totalWorkCompletedToday: totalCompleted,
          workInProgress: inProgress,
          pendingWork: pending,
          delayedWork: delayed,
          designRequestsReceived: reqReceived,
          designRequestsCompleted: reqCompleted,
          operationsCompletedToday: compOps,
          totalOperationsCompleted: compOps,
          overallActiveWorkProgress: overallProgress,
          majorIssues,
          reasonForPendingWork: reasonForPending,
          tomorrowPlannedWork: tomorrowPlan,
          remarks,
          submittedBy: userProfile?.displayName || 'Design Lead',
          submittedByEmail: userProfile?.email || undefined,
        },
        userProfile?.email
      );

      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      console.error('Failed to submit EOD update:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4 text-xs">
      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
        <div>
          <h3 className="font-black text-sm text-slate-900 uppercase tracking-wide">
            SUBMIT END-OF-DAY UPDATE TO ADMIN
          </h3>
          <p className="text-slate-500 text-[11px] mt-0.5">
            Auto-calculated performance metrics &bull; Official shift closure
          </p>
        </div>
        <span className="font-mono font-bold text-indigo-700 bg-indigo-50 px-2.5 py-1 rounded-xl">
          Date: {todayStr}
        </span>
      </div>

      {success && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 font-bold rounded-xl flex items-center space-x-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          <span>End-of-Day Update submitted successfully to Admin!</span>
        </div>
      )}

      {/* Stats Summary Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-center font-mono">
          <span className="text-[10px] uppercase font-bold text-slate-400 block">Total Work</span>
          <span className="text-lg font-black text-slate-900 mt-0.5 block">{totalPlanned}</span>
        </div>
        <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-center font-mono">
          <span className="text-[10px] uppercase font-bold text-emerald-700 block">Completed</span>
          <span className="text-lg font-black text-emerald-700 mt-0.5 block">{totalCompleted}</span>
        </div>
        <div className="p-3 bg-blue-50 rounded-xl border border-blue-200 text-center font-mono">
          <span className="text-[10px] uppercase font-bold text-blue-700 block">In Progress</span>
          <span className="text-lg font-black text-blue-700 mt-0.5 block">{inProgress}</span>
        </div>
        <div className="p-3 bg-red-50 rounded-xl border border-red-200 text-center font-mono">
          <span className="text-[10px] uppercase font-bold text-red-700 block">Delayed</span>
          <span className="text-lg font-black text-red-700 mt-0.5 block">{delayed}</span>
        </div>
      </div>

      {/* Text inputs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
            Major Technical / Design Issues
          </label>
          <textarea
            rows={2}
            placeholder="e.g. Customer clarification pending for bracket thickness..."
            value={majorIssues}
            onChange={(e) => setMajorIssues(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-800 outline-none resize-none"
          />
        </div>

        <div>
          <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
            Reason for Pending Work
          </label>
          <textarea
            rows={2}
            placeholder="e.g. Awaiting 3D CAD modeling approval from customer..."
            value={reasonForPending}
            onChange={(e) => setReasonForPending(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-800 outline-none resize-none"
          />
        </div>

        <div>
          <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
            Tomorrow's Planned Work
          </label>
          <textarea
            rows={2}
            placeholder="e.g. Release revised drawings for 8156, complete 2D drawings for Assembly..."
            value={tomorrowPlan}
            onChange={(e) => setTomorrowPlan(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-800 outline-none resize-none"
          />
        </div>

        <div>
          <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
            Additional Remarks
          </label>
          <textarea
            rows={2}
            placeholder="e.g. Team completed overtime for high priority project..."
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-800 outline-none resize-none"
          />
        </div>
      </div>

      <div className="pt-2 flex justify-end">
        <button
          type="submit"
          disabled={isSubmitting}
          className="px-6 py-2.5 bg-slate-900 hover:bg-black text-white font-bold rounded-xl text-xs transition flex items-center space-x-2 shadow-md disabled:opacity-50"
        >
          <Send className="w-3.5 h-3.5" />
          <span>{isSubmitting ? 'Submitting...' : 'SUBMIT END-OF-DAY UPDATE'}</span>
        </button>
      </div>
    </form>
  );
};

const AddDesignWorkModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  department: string;
  availableDesigners: string[];
  opsMaster: DesignOperationMaster[];
  machines: Machine[];
  userProfile?: UserProfile | null;
}> = ({ isOpen, onClose, department, availableDesigners, opsMaster, machines, userProfile }) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [workType, setWorkType] = useState<DesignWorkType>('New Design');
  const [priority, setPriority] = useState<DesignWorkPriority>('Medium');
  const [machineNumber, setMachineNumber] = useState('');
  const [assignedDesigner, setAssignedDesigner] = useState('');
  const [customDesigner, setCustomDesigner] = useState('');
  const [startDate, setStartDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [targetDate, setTargetDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 5);
    return d.toISOString().split('T')[0];
  });
  const [selectedOps, setSelectedOps] = useState<string[]>([]);
  const [customOpInput, setCustomOpInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Initialize selected ops with active master ops
  useEffect(() => {
    const defaults = opsMaster.filter((o) => o.isActive).slice(0, 4).map((o) => o.name);
    setSelectedOps(defaults.length > 0 ? defaults : ['3D Modeling', '2D Drawing', 'Drawing Review']);
  }, [opsMaster]);

  const toggleOp = (name: string) => {
    if (selectedOps.includes(name)) {
      setSelectedOps(selectedOps.filter((o) => o !== name));
    } else {
      setSelectedOps([...selectedOps, name]);
    }
  };

  const handleAddCustomOp = () => {
    if (customOpInput.trim() && !selectedOps.includes(customOpInput.trim())) {
      setSelectedOps([...selectedOps, customOpInput.trim()]);
      setCustomOpInput('');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setIsSubmitting(true);
    try {
      const designer = customDesigner.trim() || assignedDesigner || userProfile?.displayName || 'Designer';

      await createDesignWork(
        {
          department,
          title: title.trim(),
          description: description.trim(),
          workType,
          priority,
          machineNumber: machineNumber.trim() || undefined,
          assignedDesigner: designer,
          startDate,
          targetDate,
          operations: selectedOps.map((name, idx) => ({ name, order: idx + 1 })),
          createdBy: userProfile?.displayName || 'Design Lead',
        },
        userProfile?.email
      );

      onClose();
    } catch (err) {
      console.error('Failed to create design work:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fadeIn">
      <div className="bg-white rounded-2xl max-w-xl w-full border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="p-4 bg-gradient-to-r from-slate-900 to-indigo-950 text-white flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <PenTool className="w-5 h-5 text-indigo-300" />
            <h3 className="font-black text-base">Add Design Work</h3>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-white rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto text-xs flex-1 custom-scrollbar">
          <div>
            <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
              Work Title <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              placeholder="e.g. 8156 Drawing Modification, New Z-Axis Bracket Design"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 font-semibold outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                Work Type
              </label>
              <select
                value={workType}
                onChange={(e) => setWorkType(e.target.value as any)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 font-semibold outline-none"
              >
                {WORK_TYPE_OPTIONS.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                Priority
              </label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as any)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 font-semibold outline-none"
              >
                <option value="Low">Low</option>
                <option value="Medium">Medium</option>
                <option value="High">High</option>
                <option value="Critical">Critical</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                Machine Number (Optional)
              </label>
              <input
                type="text"
                list="design-machines"
                placeholder="e.g. 8156"
                value={machineNumber}
                onChange={(e) => setMachineNumber(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 font-mono font-semibold outline-none"
              />
              <datalist id="design-machines">
                {machines.map((m) => (
                  <option key={m.id} value={m.machineNumber} />
                ))}
              </datalist>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                Assigned Designer
              </label>
              <div className="space-y-1">
                <select
                  value={assignedDesigner}
                  onChange={(e) => setAssignedDesigner(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 font-semibold outline-none"
                >
                  <option value="">Select team member...</option>
                  {availableDesigners.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                  <option value="other">+ Type custom name</option>
                </select>
                {assignedDesigner === 'other' && (
                  <input
                    type="text"
                    placeholder="Type designer name..."
                    value={customDesigner}
                    onChange={(e) => setCustomDesigner(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-slate-800 mt-1"
                  />
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                Start Date
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 font-semibold outline-none"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                Target Date
              </label>
              <input
                type="date"
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 font-semibold outline-none"
              />
            </div>
          </div>

          {/* Operations selection */}
          <div>
            <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
              Select Operations for this Work
            </label>
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
              <div className="flex flex-wrap gap-1.5">
                {opsMaster.map((op) => {
                  const isSel = selectedOps.includes(op.name);
                  return (
                    <button
                      key={op.id}
                      type="button"
                      onClick={() => toggleOp(op.name)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition ${
                        isSel
                          ? 'bg-indigo-600 text-white shadow-2xs'
                          : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      {isSel ? '✓ ' : '+ '}
                      {op.name}
                    </button>
                  );
                })}
              </div>

              {/* Add custom operation */}
              <div className="flex items-center space-x-1.5 pt-2 border-t border-slate-200">
                <input
                  type="text"
                  placeholder="Or type custom operation..."
                  value={customOpInput}
                  onChange={(e) => setCustomOpInput(e.target.value)}
                  className="flex-1 bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-xs"
                />
                <button
                  type="button"
                  onClick={handleAddCustomOp}
                  className="px-3 py-1 bg-slate-800 text-white rounded-lg text-xs font-bold"
                >
                  Add
                </button>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
              Description / Remarks
            </label>
            <textarea
              rows={2}
              placeholder="Engineering specifications, reference files..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-800 outline-none resize-none"
            />
          </div>

          <div className="pt-2 flex justify-end space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-100 text-slate-700 font-bold rounded-xl text-xs"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs shadow-md disabled:opacity-50"
            >
              {isSubmitting ? 'Creating...' : 'Create Design Work'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const AddDesignOperationMasterModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  department: string;
  userProfile?: UserProfile | null;
}> = ({ isOpen, onClose, department, userProfile }) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [order, setOrder] = useState(10);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setIsSubmitting(true);
    try {
      await createDesignOperationMaster(
        {
          name: name.trim(),
          description: description.trim() || undefined,
          department,
          isActive: true,
          order: Number(order) || 1,
        },
        userProfile?.email
      );
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-2xl max-w-md w-full border border-slate-200 shadow-2xl p-5 space-y-4 text-xs">
        <div className="flex items-center justify-between border-b border-slate-100 pb-2">
          <h3 className="font-black text-sm text-slate-900">Add Reusable Operation</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1">Operation Name</label>
            <input
              type="text"
              required
              placeholder="e.g. Finite Element Analysis (FEA)"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 font-semibold"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1">Sequence Order</label>
            <input
              type="number"
              value={order}
              onChange={(e) => setOrder(Number(e.target.value))}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 font-mono"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1">Description (Optional)</label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-800 resize-none"
            />
          </div>

          <div className="pt-2 flex justify-end space-x-2">
            <button type="button" onClick={onClose} className="px-3 py-1.5 bg-slate-100 rounded-xl font-bold">
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-1.5 bg-indigo-600 text-white rounded-xl font-bold"
            >
              {isSubmitting ? 'Adding...' : 'Add Operation'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const AddDesignDocumentModal: React.FC<{
  isOpen: boolean;
  work: DesignWork;
  onClose: () => void;
  userProfile?: UserProfile | null;
}> = ({ isOpen, work, onClose, userProfile }) => {
  const [docName, setDocName] = useState('');
  const [version, setVersion] = useState('Rev 00');
  const [docType, setDocType] = useState<any>('2D Drawing');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!docName.trim()) return;

    setIsSubmitting(true);
    try {
      await addDocumentToDesignWork(
        work,
        {
          name: docName.trim(),
          version,
          docType,
          notes,
          uploadedBy: userProfile?.displayName || 'Designer',
        },
        userProfile?.email
      );
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-2xl max-w-md w-full border border-slate-200 shadow-2xl p-5 space-y-4 text-xs">
        <div className="flex items-center justify-between border-b border-slate-100 pb-2">
          <h3 className="font-black text-sm text-slate-900">Add Drawing / Document</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1">Document / Drawing Name</label>
            <input
              type="text"
              required
              placeholder="e.g. DWG-8156-BRACKET-01"
              value={docName}
              onChange={(e) => setDocName(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 font-semibold"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">Revision / Version</label>
              <input
                type="text"
                placeholder="e.g. Rev 00, Rev 01"
                value={version}
                onChange={(e) => setVersion(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 font-mono"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">Document Type</label>
              <select
                value={docType}
                onChange={(e) => setDocType(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800"
              >
                <option value="2D Drawing">2D Drawing</option>
                <option value="3D Model">3D Model (STEP/IGES)</option>
                <option value="PDF">PDF Drawing</option>
                <option value="Calculation">Calculation Sheet</option>
                <option value="BOM">BOM</option>
                <option value="Specification">Specification</option>
                <option value="Customer Drawing">Customer Drawing</option>
                <option value="Other">Other</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1">Change Notes</label>
            <textarea
              rows={2}
              placeholder="Summary of modifications in this revision..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2 text-slate-800 resize-none"
            />
          </div>

          <div className="pt-2 flex justify-end space-x-2">
            <button type="button" onClick={onClose} className="px-3 py-1.5 bg-slate-100 rounded-xl font-bold">
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-1.5 bg-indigo-600 text-white rounded-xl font-bold"
            >
              {isSubmitting ? 'Saving...' : 'Save Document'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const AcceptDesignRequestModal: React.FC<{
  isOpen: boolean;
  request: DesignRequest;
  availableDesigners: string[];
  onClose: () => void;
  userProfile?: UserProfile | null;
}> = ({ isOpen, request, availableDesigners, onClose, userProfile }) => {
  const [designer, setDesigner] = useState(availableDesigners[0] || userProfile?.displayName || 'Designer');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleAccept = async () => {
    setIsSubmitting(true);
    try {
      const userName = userProfile?.displayName || 'Design Lead';
      await acceptDesignRequest(request, designer, userName, userProfile?.email);
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-2xl max-w-md w-full border border-slate-200 shadow-2xl p-5 space-y-4 text-xs">
        <h3 className="font-black text-sm text-slate-900">Accept Request &amp; Assign</h3>
        <p className="text-slate-600">
          Accepting request <strong>{request.requestNumber}</strong> from {request.requestingDepartment}.
        </p>

        <div>
          <label className="block text-[11px] font-bold text-slate-700 mb-1">Assign to Designer</label>
          <select
            value={designer}
            onChange={(e) => setDesigner(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 font-bold"
          >
            {availableDesigners.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </div>

        <div className="pt-2 flex justify-end space-x-2">
          <button onClick={onClose} className="px-3 py-1.5 bg-slate-100 rounded-xl font-bold">Cancel</button>
          <button
            onClick={handleAccept}
            disabled={isSubmitting}
            className="px-4 py-1.5 bg-indigo-600 text-white rounded-xl font-bold"
          >
            {isSubmitting ? 'Accepting...' : 'Accept & Assign'}
          </button>
        </div>
      </div>
    </div>
  );
};

const RequestInfoModal: React.FC<{
  isOpen: boolean;
  request: DesignRequest;
  onClose: () => void;
  userProfile?: UserProfile | null;
}> = ({ isOpen, request, onClose, userProfile }) => {
  const [note, setNote] = useState('');
  const [reason, setReason] = useState('Drawing Revision Clarification');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!note.trim()) return;

    setIsSubmitting(true);
    try {
      const userName = userProfile?.displayName || 'Designer';
      await requestMoreInfoForDesignRequest(request, note.trim(), reason, userName, userProfile?.email);
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-2xl max-w-md w-full border border-slate-200 shadow-2xl p-5 space-y-4 text-xs">
        <h3 className="font-black text-sm text-slate-900">Request Information from {request.requestingDepartment}</h3>

        <form onSubmit={handleSend} className="space-y-3">
          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1">Reason</label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800"
            >
              <option value="Drawing Clarification">Drawing Clarification</option>
              <option value="Missing Dimensions">Missing Dimensions</option>
              <option value="Customer Confirmation Needed">Customer Confirmation Needed</option>
              <option value="Sample / Physical Fitment Check">Sample / Physical Fitment Check</option>
              <option value="Other">Other</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1">Information Required</label>
            <textarea
              required
              rows={3}
              placeholder="State exactly what details or drawing feedback are needed..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-800 resize-none"
            />
          </div>

          <div className="pt-2 flex justify-end space-x-2">
            <button type="button" onClick={onClose} className="px-3 py-1.5 bg-slate-100 rounded-xl font-bold">Cancel</button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-1.5 bg-amber-600 text-white rounded-xl font-bold"
            >
              {isSubmitting ? 'Sending...' : 'Send Clarification Request'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const CompleteRequestModal: React.FC<{
  isOpen: boolean;
  request: DesignRequest;
  onClose: () => void;
  userProfile?: UserProfile | null;
}> = ({ isOpen, request, onClose, userProfile }) => {
  const [solution, setSolution] = useState('');
  const [remarks, setRemarks] = useState('');
  const [docName, setDocName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleComplete = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!solution.trim()) return;

    setIsSubmitting(true);
    try {
      const userName = userProfile?.displayName || 'Designer';
      await completeDesignRequest(
        request,
        {
          solutionProvided: solution.trim(),
          completionRemarks: remarks.trim() || 'Work completed per engineering requirement',
          completedBy: userName,
          completedDate: new Date().toISOString().split('T')[0],
          responseDocumentName: docName.trim() || undefined,
        },
        userProfile?.email
      );
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-2xl max-w-md w-full border border-slate-200 shadow-2xl p-5 space-y-4 text-xs">
        <h3 className="font-black text-sm text-slate-900">Complete Design Request: {request.requestNumber}</h3>

        <form onSubmit={handleComplete} className="space-y-3">
          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1">Solution Provided</label>
            <textarea
              required
              rows={2}
              placeholder="e.g. Revised drawing released with updated hole PCD, uploaded to CAD vault..."
              value={solution}
              onChange={(e) => setSolution(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-800 resize-none"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1">Drawing / Document Reference</label>
            <input
              type="text"
              placeholder="e.g. DWG-8156-REV-02.pdf"
              value={docName}
              onChange={(e) => setDocName(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1">Completion Remarks</label>
            <textarea
              rows={2}
              placeholder="Any assembly guidance or inspection notes..."
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-800 resize-none"
            />
          </div>

          <div className="pt-2 flex justify-end space-x-2">
            <button type="button" onClick={onClose} className="px-3 py-1.5 bg-slate-100 rounded-xl font-bold">Cancel</button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-1.5 bg-emerald-600 text-white rounded-xl font-bold"
            >
              {isSubmitting ? 'Completing...' : 'Submit & Notify Department'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
