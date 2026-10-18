import React, { useState, useEffect, useMemo } from 'react';
import {
  LayoutDashboard,
  Building,
  CalendarDays,
  Cpu,
  Boxes,
  Calendar,
  CheckSquare,
  ArrowRightLeft,
  FileText,
  Bell,
  FileSpreadsheet,
  Database,
  Users,
  Settings,
  ShieldCheck,
  Search,
  Plus,
  Home,
  LogOut,
  ChevronDown,
  Eye,
  Sliders,
  Sparkles,
  Download,
  Package,
  Cable,
  AlertTriangle,
  BarChart3,
  PenTool,
  GitFork,
  Clock,
  TrendingUp,
  Layers,
} from 'lucide-react';
import { BacklogManagementView } from '../components/backlog/BacklogManagementView';
import { ProductionAnalyticsView } from '../components/ProductionAnalyticsView';
import { DesignWorkManagementView } from '../components/DesignWorkManagementView';
import { MachineProcessRouteView } from '../components/MachineProcessRouteView';
import { LateDepartmentsView } from './LateDepartmentsView';
import { DailyIntegratedWorkSheetView } from './DailyIntegratedWorkSheetView';
import { PlanExcelImportView } from '../components/planning/PlanExcelImportView';
import { AdminPlanExcelImportModal } from '../components/planning/AdminPlanExcelImportModal';
import {
  AuditLogEntry,
  Department,
  DepartmentHandover,
  DepartmentWork,
  Machine,
  MachineDocument,
  MonthlyPlan,
  QualityDailyCheck,
  QualityOperation,
  QualityRejection,
  SystemNotification,
  RoadmapItem,
  UserProfile,
  WeeklyPlan,
  YearlyPlan,
} from '../types';
import { COMPANY_NAME, SYSTEM_SUBTITLE, INITIAL_DEPARTMENTS } from '../constants';
import { useAuth } from '../context/AuthContext';
import { DashboardView } from './DashboardView';
import { PlanningView } from './PlanningView';
import { MachineMasterView } from './MachineMasterView';
import { QualityView } from './QualityView';
import { DepartmentWorkView } from './DepartmentWorkView';
import { ReportsView } from './ReportsView';
import { SettingsView } from './SettingsView';
import { DataManagementView } from './DataManagementView';
import { RoadmapTimelineView } from '../components/RoadmapTimelineView';
import { AllMachineMonitoringView } from '../components/AllMachineMonitoringView';
import { MachineDetailModal } from '../components/MachineDetailModal';
import { AccessoriesOrderModule } from '../components/AccessoriesOrderModule';
import { OpenCableOrderModule } from '../components/OpenCableOrderModule';
import { QualityHandoverModule } from '../components/QualityHandoverModule';
import { DepartmentNotificationCenter } from '../components/DepartmentNotificationCenter';
import { DepartmentOperationLotsView } from '../components/operations/DepartmentOperationLotsView';
import { DepartmentDailyUpdatesView } from '../components/operations/DepartmentDailyUpdatesView';
import { generateMisPresentation } from '../utils/ppt';
import { ExcelImportType } from '../utils/excel';

interface AdminDashboardViewProps {
  departments: Department[];
  machines: Machine[];
  yearlyPlans: YearlyPlan[];
  monthlyPlans: MonthlyPlan[];
  weeklyPlans: WeeklyPlan[];
  qualityOps: QualityOperation[];
  qualityChecks: QualityDailyCheck[];
  qualityRejections: QualityRejection[];
  departmentWork: DepartmentWork[];
  handovers: DepartmentHandover[];
  notifications: SystemNotification[];
  auditLogs: AuditLogEntry[];
  machineDocs: MachineDocument[];
  userProfiles: UserProfile[];
  roadmapItems?: RoadmapItem[];
  onOpenQuickUpdate: () => void;
  onOpenGlobalSearch: () => void;
  onOpenExcelImport: (type?: ExcelImportType) => void;
  onNavigateHome: () => void;
  onInspectDepartment: (deptName: string) => void;
}

export const AdminDashboardView: React.FC<AdminDashboardViewProps> = ({
  departments,
  machines,
  yearlyPlans,
  monthlyPlans,
  weeklyPlans,
  qualityOps,
  qualityChecks,
  qualityRejections,
  departmentWork,
  handovers,
  notifications,
  auditLogs,
  machineDocs,
  userProfiles,
  roadmapItems = [],
  onOpenQuickUpdate,
  onOpenGlobalSearch,
  onOpenExcelImport,
  onNavigateHome,
  onInspectDepartment,
}) => {
  const { userProfile, signOut } = useAuth();

  // Admin Navigation Tab
  const [activeAdminTab, setActiveAdminTab] = useState<string>('dashboard');

  // Persistent Department Selection (stored in localStorage)
  const [selectedDepartment, setSelectedDepartment] = useState<string>(() => {
    try {
      return localStorage.getItem('accurate_admin_selected_department') || 'All Departments';
    } catch {
      return 'All Departments';
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('accurate_admin_selected_department', selectedDepartment);
    } catch (err) {
      console.error('Failed to persist selected department', err);
    }
  }, [selectedDepartment]);

  // Live Firestore-driven department data filtering
  const filteredMachines = useMemo(() => {
    if (selectedDepartment === 'All Departments') return machines;
    return machines.filter((m) => {
      if (m.currentDepartment === selectedDepartment) return true;
      const hasDeptWork = departmentWork.some(
        (w) => w.machineNumber === m.machineNumber && w.department === selectedDepartment
      );
      if (hasDeptWork) return true;
      const hasDeptHandover = handovers.some(
        (h) =>
          h.machineNumber === m.machineNumber &&
          (h.sendingDepartment === selectedDepartment || h.receivingDepartment === selectedDepartment)
      );
      return hasDeptHandover;
    });
  }, [machines, selectedDepartment, departmentWork, handovers]);

  const filteredDepartmentWork = useMemo(() => {
    if (selectedDepartment === 'All Departments') return departmentWork;
    return departmentWork.filter((w) => w.department === selectedDepartment);
  }, [departmentWork, selectedDepartment]);

  const filteredMonthlyPlans = useMemo(() => {
    if (selectedDepartment === 'All Departments') return monthlyPlans;
    return monthlyPlans.filter((p) => p.department === selectedDepartment);
  }, [monthlyPlans, selectedDepartment]);

  const filteredWeeklyPlans = useMemo(() => {
    if (selectedDepartment === 'All Departments') return weeklyPlans;
    return weeklyPlans.filter((p) => p.department === selectedDepartment);
  }, [weeklyPlans, selectedDepartment]);

  const filteredYearlyPlans = useMemo(() => {
    if (selectedDepartment === 'All Departments') return yearlyPlans;
    return yearlyPlans.filter((p) => p.department === selectedDepartment);
  }, [yearlyPlans, selectedDepartment]);

  const filteredHandovers = useMemo(() => {
    if (selectedDepartment === 'All Departments') return handovers;
    return handovers.filter(
      (h) =>
        h.sendingDepartment === selectedDepartment ||
        h.receivingDepartment === selectedDepartment
    );
  }, [handovers, selectedDepartment]);

  const filteredQualityChecks = useMemo(() => {
    if (selectedDepartment === 'All Departments') return qualityChecks;
    return qualityChecks.filter((c) => {
      const op = qualityOps.find((o) => o.id === c.operationId);
      if (op?.processDepartment === selectedDepartment) return true;
      return filteredMachines.some((m) => m.machineNumber === c.machineNumber);
    });
  }, [qualityChecks, qualityOps, selectedDepartment, filteredMachines]);

  const filteredQualityRejections = useMemo(() => {
    if (selectedDepartment === 'All Departments') return qualityRejections;
    return qualityRejections.filter((r) => r.concernedDepartment === selectedDepartment);
  }, [qualityRejections, selectedDepartment]);

  const [selectedMachine, setSelectedMachine] = useState<Machine | null>(null);
  const [modalMachine, setModalMachine] = useState<Machine | null>(null);

  // MIS PPT generation state
  const [generatingPpt, setGeneratingPpt] = useState(false);

  // Dedicated 4-column Plan Excel Import modal state
  const [planImportModalState, setPlanImportModalState] = useState<{
    isOpen: boolean;
    planType: 'monthly' | 'weekly';
  }>({ isOpen: false, planType: 'monthly' });

  // Admin Navigation Sidebar Items
  const adminMenuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'production_analytics', label: 'Production Analytics', icon: BarChart3 },
    { id: 'design_management', label: 'Design Management', icon: PenTool },
    { id: 'late_departments', label: 'Late Departments / Delays', icon: AlertTriangle },
    { id: 'daily_worksheet', label: 'Daily Work Sheet', icon: FileSpreadsheet },
    { id: 'daily_updates', label: 'Daily Updates', icon: Clock },
    { id: 'all_machines', label: 'All Machine Monitoring', icon: Cpu },
    { id: 'process_routes', label: 'Machine Process Route', icon: GitFork },
    { id: 'all_departments', label: 'All Departments', icon: Building },
    { id: 'planning', label: 'Planning Master', icon: CalendarDays },
    { id: 'monthly_plans', label: 'Monthly Plan', icon: Calendar },
    { id: 'weekly_plans', label: 'Weekly Plan', icon: Calendar },
    { id: 'plan_excel_import', label: 'Plan Excel Import', icon: FileSpreadsheet },
    { id: 'plan_vs_actual', label: 'Plan vs Actual', icon: TrendingUp },
    { id: 'backlog_management', label: 'Backlog Management', icon: Layers },
    { id: 'yearly_plans', label: 'Yearly Plans', icon: Calendar },
    { id: 'roadmap', label: 'Roadmap & Gantt', icon: CalendarDays },
    { id: 'accessories_orders', label: 'Accessories Orders', icon: Package },
    { id: 'open_cable_orders', label: 'Open Cable Orders', icon: Cable },
    { id: 'machines', label: 'Machines', icon: Cpu },
    { id: 'projects', label: 'Projects', icon: Boxes },
    { id: 'department_work', label: 'Department Work', icon: Building },
    { id: 'operation_lots', label: 'Operation Lots', icon: Boxes },
    { id: 'quality', label: 'Quality', icon: CheckSquare },
    { id: 'quality_handover', label: 'Quality Handover Hub', icon: ShieldCheck },
    { id: 'handover', label: 'Handover', icon: ArrowRightLeft },
    { id: 'documents', label: 'Documents', icon: FileText },
    { id: 'notifications', label: 'Notifications', icon: Bell, badge: notifications.filter(n => !n.read).length },
    { id: 'reports', label: 'Reports', icon: FileText },
    { id: 'mis', label: 'MIS', icon: FileSpreadsheet },
    { id: 'excel_import', label: 'Excel Import', icon: FileSpreadsheet },
    { id: 'data_management', label: 'Data Management', icon: Database },
    { id: 'users', label: 'Users', icon: Users },
    { id: 'department_management', label: 'Department Management', icon: Building },
    { id: 'audit_logs', label: 'Audit Logs', icon: FileText },
    { id: 'system_settings', label: 'System Settings', icon: Settings },
  ];

  const handleDownloadMisPpt = async () => {
    setGeneratingPpt(true);
    try {
      await generateMisPresentation({
        periodTitle: 'Plant Overview',
        totalMachines: machines.length,
        machines,
        monthlyPlans,
        departmentWork,
        qualityChecks,
        qualityRejections,
      });
    } catch (err) {
      console.error('Failed to generate MIS PPT:', err);
    } finally {
      setGeneratingPpt(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex text-slate-800 font-sans antialiased">
      {/* =========================================================================
          ADMINISTRATOR SIDEBAR
          ========================================================================= */}
      <aside className="w-64 bg-slate-950 text-slate-300 flex flex-col border-r border-slate-800 shrink-0 select-none">
        {/* Administrator Badge Card */}
        <div className="p-3 mx-3 my-3 bg-indigo-950/40 rounded-xl border border-indigo-800/50">
          <div className="flex items-center space-x-2 text-indigo-400">
            <ShieldCheck className="w-4 h-4 text-indigo-400" />
            <span className="text-xs font-black uppercase tracking-wider text-indigo-300">
              Administrator Portal
            </span>
          </div>
          <div className="text-[11px] text-slate-400 mt-1 truncate">
            {userProfile?.employeeName || 'System Administrator'}
          </div>
          <div className="text-[10px] text-indigo-400 font-mono">
            Universal Plant Access
          </div>
        </div>

        {/* Sidebar Menu Items */}
        <div className="flex-1 px-3 py-1 space-y-1 overflow-y-auto custom-scrollbar">
          {adminMenuItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeAdminTab === item.id;

            return (
              <button
                key={item.id}
                onClick={() => {
                  if (item.id === 'excel_import') {
                    onOpenExcelImport('planning');
                    return;
                  }
                  setActiveAdminTab(item.id);
                }}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition ${
                  isActive
                    ? 'bg-indigo-600 text-white shadow-xs font-bold'
                    : 'text-slate-400 hover:text-white hover:bg-slate-900'
                }`}
              >
                <div className="flex items-center space-x-2.5 min-w-0">
                  <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-slate-500'}`} />
                  <span className="truncate">{item.label}</span>
                </div>
                {item.badge !== undefined && item.badge > 0 && (
                  <span className="bg-indigo-500 text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold">
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Return to Home / Directory */}
        <div className="p-3 border-t border-slate-800/80 bg-slate-950/60 space-y-1.5">
          <button
            onClick={onNavigateHome}
            className="w-full flex items-center justify-center space-x-2 px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs font-bold transition border border-slate-800"
          >
            <Home className="w-3.5 h-3.5 text-blue-400" />
            <span>Home Directory</span>
          </button>
          <button
            onClick={signOut}
            className="w-full flex items-center justify-center space-x-2 px-3 py-2 rounded-xl bg-slate-900/60 hover:bg-red-950 hover:text-red-300 text-slate-400 text-xs font-bold transition"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* =========================================================================
          MAIN CONTENT AREA
          ========================================================================= */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Navigation Bar */}
        <header className="h-14 bg-white border-b border-slate-200 px-4 sm:px-6 flex items-center justify-between shrink-0 z-10 shadow-xs">
          {/* Left: Persistent Global Department Scope Selector (VIEW DEPARTMENT) */}
          <div className="flex items-center space-x-2 sm:space-x-3">
            <div className="flex items-center space-x-1.5 text-xs font-black uppercase tracking-wider text-slate-700 bg-slate-100 px-2.5 py-1.5 rounded-lg border border-slate-200">
              <Building className="w-3.5 h-3.5 text-blue-600" />
              <span>VIEW DEPARTMENT:</span>
            </div>
            <div className="relative">
              <select
                id="admin-view-department-select"
                value={selectedDepartment}
                onChange={(e) => {
                  const val = e.target.value;
                  setSelectedDepartment(val);
                  if (val !== 'All Departments') {
                    onInspectDepartment(val);
                  }
                }}
                className="bg-white hover:bg-slate-50 border border-slate-300 text-slate-900 font-bold text-xs rounded-xl px-3 py-1.5 pr-8 outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer transition appearance-none shadow-2xs min-w-[220px] sm:min-w-[280px]"
              >
                <option value="All Departments">🏢 All Departments (Plant Overview)</option>
                <optgroup label="Manufacturing Divisions">
                  {INITIAL_DEPARTMENTS.map((dept) => (
                    <option key={dept.code} value={dept.name}>
                      {dept.name}
                    </option>
                  ))}
                </optgroup>
              </select>
              <ChevronDown className="w-3.5 h-3.5 text-slate-500 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>

            {/* If filtered, show active indicator and quick actions */}
            {selectedDepartment !== 'All Departments' && (
              <div className="flex items-center space-x-1.5">
                <span className="hidden lg:inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                  Selected: {selectedDepartment}
                </span>
                <button
                  onClick={() => onInspectDepartment(selectedDepartment)}
                  className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg text-[11px] font-bold text-white bg-blue-600 hover:bg-blue-500 transition shadow-2xs"
                  title="Open this department's dedicated dashboard"
                >
                  <Eye className="w-3 h-3" />
                  <span>Open Dashboard</span>
                </button>
                <button
                  onClick={() => setSelectedDepartment('All Departments')}
                  className="px-2 py-1 rounded-lg text-[11px] font-bold text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition border border-slate-200 shadow-2xs"
                  title="Reset to All Departments"
                >
                  Clear Filter
                </button>
              </div>
            )}
          </div>

          {/* Right: Quick actions, notifications, user */}
          <div className="flex items-center space-x-3 text-xs">
            <button
              onClick={onOpenGlobalSearch}
              className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 font-semibold flex items-center space-x-1.5 transition"
            >
              <Search className="w-3.5 h-3.5 text-slate-400" />
              <span className="hidden md:inline">Global Search</span>
              <kbd className="hidden md:inline bg-white px-1.5 py-0.5 rounded text-[10px] text-slate-500 border border-slate-300">
                ⌘K
              </kbd>
            </button>

            <button
              onClick={onOpenQuickUpdate}
              className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold flex items-center space-x-1.5 shadow-xs transition"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Quick Work Update</span>
            </button>

            <button
              onClick={() => setActiveAdminTab('notifications')}
              className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 relative transition"
              title="Notifications"
            >
              <Bell className="w-4 h-4" />
              {notifications.filter((n) => !n.read).length > 0 && (
                <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full animate-pulse" />
              )}
            </button>

            {/* Authenticated Admin Badge & Logout in Header */}
            <div className="flex items-center space-x-2.5 pl-3 border-l border-slate-200">
              <div className="text-right hidden sm:block">
                <div className="font-bold text-slate-900 leading-tight">
                  {userProfile?.employeeName || userProfile?.authorityName || 'System Administrator'}
                </div>
                <div className="text-[10px] text-slate-500 font-semibold flex items-center justify-end gap-1">
                  <span className="text-indigo-600 font-bold">Administrator</span>
                  <span>&bull;</span>
                  <span className="px-1.5 py-0.2 rounded bg-indigo-50 text-indigo-700 font-black uppercase text-[9px]">
                    ADMIN
                  </span>
                </div>
              </div>
              <button
                onClick={signOut}
                title="Logout of session"
                className="px-2.5 py-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-700 font-bold flex items-center space-x-1 transition shadow-2xs border border-red-200 text-xs"
              >
                <LogOut className="w-3.5 h-3.5 text-red-600" />
                <span>Logout</span>
              </button>
            </div>
          </div>
        </header>

        {/* View Body */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          {/* TAB: DASHBOARD */}
          {activeAdminTab === 'dashboard' && (
            <DashboardView
              machines={filteredMachines}
              monthlyPlans={filteredMonthlyPlans}
              weeklyPlans={filteredWeeklyPlans}
              departmentWork={filteredDepartmentWork}
              qualityChecks={filteredQualityChecks}
              qualityRejections={filteredQualityRejections}
              qualityOps={qualityOps}
              handovers={filteredHandovers}
              auditLogs={auditLogs}
              selectedDepartment={selectedDepartment}
              onSelectDepartment={setSelectedDepartment}
              onSelectView={setActiveAdminTab}
              onSelectMachine={(m) => setModalMachine(m)}
            />
          )}

          {/* TAB: PRODUCTION ANALYTICS (Universal Executive Management & Power BI View) */}
          {activeAdminTab === 'production_analytics' && (
            <ProductionAnalyticsView
              userProfile={userProfile}
              departmentName={selectedDepartment}
              isDepartmentLocked={false}
              departments={departments}
              machines={machines}
              monthlyPlans={monthlyPlans}
              weeklyPlans={weeklyPlans}
              yearlyPlans={yearlyPlans}
              departmentWork={departmentWork}
              handovers={handovers}
              qualityChecks={qualityChecks}
              qualityRejections={qualityRejections}
              qualityOps={qualityOps}
              machineDocs={machineDocs}
            />
          )}

          {/* TAB: DESIGN MANAGEMENT (Independent Engineering Pipeline) */}
          {activeAdminTab === 'design_management' && (
            <DesignWorkManagementView
              isAdmin={true}
              userProfile={userProfile}
              departmentName="01 Design"
              machines={machines}
            />
          )}

          {/* TAB: LATE DEPARTMENTS (Requirement 8) */}
          {activeAdminTab === 'late_departments' && (
            <LateDepartmentsView
              machines={filteredMachines}
              departmentWork={filteredDepartmentWork}
              monthlyPlans={filteredMonthlyPlans}
              onOpenMachineDetail={(m) => setModalMachine(m)}
            />
          )}

          {/* TAB: DAILY INTEGRATED WORK SHEET (Requirement 9 & 24) */}
          {activeAdminTab === 'daily_worksheet' && (
            <DailyIntegratedWorkSheetView
              machines={filteredMachines}
              departmentWork={filteredDepartmentWork}
              monthlyPlans={filteredMonthlyPlans}
              weeklyPlans={filteredWeeklyPlans}
              handovers={filteredHandovers}
              qualityRejections={filteredQualityRejections}
              onOpenMachineDetail={(m) => setModalMachine(m)}
            />
          )}

          {/* TAB: ALL MACHINES (Plant-wide Monitoring & Tracking Board) */}
          {activeAdminTab === 'all_machines' && (
            <AllMachineMonitoringView
              machines={filteredMachines}
              departmentWork={filteredDepartmentWork}
              handovers={filteredHandovers}
              qualityChecks={filteredQualityChecks}
              qualityRejections={filteredQualityRejections}
              qualityOps={qualityOps}
              selectedDepartment={selectedDepartment}
              onOpenMachineDetail={(m) => setModalMachine(m)}
            />
          )}

          {/* TAB: MACHINE PROCESS ROUTE (Admin Sequence Controller) */}
          {activeAdminTab === 'process_routes' && (
            <MachineProcessRouteView
              machines={filteredMachines}
              departments={departments}
            />
          )}

          {/* TAB: ALL DEPARTMENTS */}
          {activeAdminTab === 'all_departments' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                    All Factory Departments
                  </h2>
                  <p className="text-xs sm:text-sm text-slate-500">
                    Live operational overview of all 20 configured plant divisions
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {INITIAL_DEPARTMENTS.map((dept) => {
                  const tasks = departmentWork.filter((w) => w.department === dept.name);
                  const completed = tasks.filter((w) => w.status === 'Completed').length;
                  const delayed = tasks.filter((w) => w.status === 'Delayed').length;

                  return (
                    <div
                      key={dept.code}
                      onClick={() => onInspectDepartment(dept.name)}
                      className="bg-white rounded-2xl p-4 border border-slate-200 hover:border-indigo-500 hover:shadow-md transition cursor-pointer flex flex-col justify-between group"
                    >
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-xs font-black text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded">
                            {dept.code}
                          </span>
                          <span className="text-[10px] font-bold text-slate-400">
                            Sequence #{dept.order}
                          </span>
                        </div>
                        <h4 className="text-xs font-bold text-slate-900 group-hover:text-indigo-600 transition">
                          {dept.name}
                        </h4>
                      </div>

                      <div className="pt-3 mt-3 border-t border-slate-100 flex items-center justify-between text-[11px]">
                        <span className="text-slate-500">
                          {tasks.length} task{tasks.length !== 1 ? 's' : ''} ({completed} done)
                        </span>
                        {delayed > 0 && (
                          <span className="text-red-600 font-bold">
                            {delayed} delayed
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB: PLANNING / YEARLY / MONTHLY / WEEKLY / PLAN VS ACTUAL */}
          {(activeAdminTab === 'planning' ||
            activeAdminTab === 'yearly_plans' ||
            activeAdminTab === 'monthly_plans' ||
            activeAdminTab === 'weekly_plans' ||
            activeAdminTab === 'plan_vs_actual') && (
            <PlanningView
              departments={departments}
              yearlyPlans={filteredYearlyPlans}
              monthlyPlans={filteredMonthlyPlans}
              weeklyPlans={filteredWeeklyPlans}
              machines={filteredMachines}
              selectedDepartment={selectedDepartment}
              initialTab={
                activeAdminTab === 'monthly_plans'
                  ? 'monthly'
                  : activeAdminTab === 'weekly_plans'
                  ? 'weekly'
                  : activeAdminTab === 'yearly_plans'
                  ? 'yearly'
                  : activeAdminTab === 'plan_vs_actual'
                  ? 'plan_vs_actual'
                  : 'monthly'
              }
              onOpenExcelImport={() => onOpenExcelImport('planning')}
              onOpenPlanExcelImport={(type) => {
                setPlanImportModalState({ isOpen: true, planType: type });
              }}
            />
          )}

          {/* TAB: PLAN EXCEL IMPORT (Admin-Only 4-Column Canonical Import) */}
          {activeAdminTab === 'plan_excel_import' && (
            <PlanExcelImportView
              monthlyPlans={filteredMonthlyPlans}
              weeklyPlans={filteredWeeklyPlans}
              machines={filteredMachines}
              departments={departments}
              onNavigateToPlan={(tab) => {
                if (tab === 'monthly') setActiveAdminTab('monthly_plans');
                else if (tab === 'weekly') setActiveAdminTab('weekly_plans');
                else if (tab === 'plan_vs_actual') setActiveAdminTab('plan_vs_actual');
              }}
              onOpenImportModal={(type) => {
                setPlanImportModalState({ isOpen: true, planType: type });
              }}
            />
          )}

          {/* TAB: ROADMAP & GANTT */}
          {activeAdminTab === 'roadmap' && (
            <RoadmapTimelineView
              roadmapItems={roadmapItems}
              machines={filteredMachines}
              departments={departments}
            />
          )}

          {/* TAB: ACCESSORIES ORDERS */}
          {activeAdminTab === 'accessories_orders' && (
            <AccessoriesOrderModule
              machines={filteredMachines}
              currentDepartment={selectedDepartment !== 'All Departments' ? selectedDepartment : '02-B Planning Accessories'}
              isAdmin={true}
              isPlanning={true}
            />
          )}

          {/* TAB: OPEN CABLE ORDERS */}
          {activeAdminTab === 'open_cable_orders' && (
            <OpenCableOrderModule
              machines={filteredMachines}
              currentDepartment={selectedDepartment !== 'All Departments' ? selectedDepartment : '02-C Planning Open Cable'}
              isAdmin={true}
              isPlanning={true}
            />
          )}

          {/* TAB: MACHINES / PROJECTS */}
          {(activeAdminTab === 'machines' || activeAdminTab === 'projects') && (
            <MachineMasterView
              machines={filteredMachines}
              departments={departments}
              qualityOps={qualityOps}
              qualityChecks={filteredQualityChecks}
              departmentWork={filteredDepartmentWork}
              handovers={filteredHandovers}
              machineDocs={machineDocs}
              selectedMachine={selectedMachine}
              onSelectMachine={setSelectedMachine}
              selectedDepartment={selectedDepartment}
              onOpenExcelImport={() => onOpenExcelImport('machines')}
            />
          )}

          {/* TAB: DEPARTMENT WORK & HANDOVER */}
          {(activeAdminTab === 'department_work' || activeAdminTab === 'handover') && (
            <DepartmentWorkView
              departments={departments}
              departmentWork={filteredDepartmentWork}
              handovers={filteredHandovers}
              machines={filteredMachines}
              selectedDepartment={selectedDepartment}
              onOpenQuickUpdate={onOpenQuickUpdate}
              onOpenExcelImport={() => onOpenExcelImport('department_work')}
            />
          )}

          {/* TAB: OPERATION LOTS */}
          {activeAdminTab === 'operation_lots' && (
            <DepartmentOperationLotsView
              departmentName={selectedDepartment === 'All Departments' ? 'All Departments' : selectedDepartment}
              machines={machines}
            />
          )}

          {/* TAB: DAILY UPDATES */}
          {activeAdminTab === 'daily_updates' && (
            <DepartmentDailyUpdatesView
              departmentName={selectedDepartment === 'All Departments' ? 'All Departments' : selectedDepartment}
              machines={machines}
            />
          )}

          {/* TAB: BACKLOG MANAGEMENT (Requirement 9) */}
          {activeAdminTab === 'backlog_management' && (
            <BacklogManagementView
              departmentName={selectedDepartment === 'All Departments' ? undefined : selectedDepartment}
              machines={machines}
              onOpenDailyUpdate={() => setActiveAdminTab('daily_updates')}
            />
          )}

          {/* TAB: QUALITY */}
          {activeAdminTab === 'quality' && (
            <QualityView
              departments={departments}
              machines={filteredMachines}
              operations={qualityOps}
              dailyChecks={filteredQualityChecks}
              rejections={filteredQualityRejections}
              onOpenExcelImport={() => onOpenExcelImport('quality_ops')}
            />
          )}

          {/* TAB: QUALITY HANDOVER HUB */}
          {activeAdminTab === 'quality_handover' && (
            <QualityHandoverModule
              currentDepartment={selectedDepartment !== 'All Departments' ? selectedDepartment : '04 Inward Quality'}
              departments={departments}
              machines={filteredMachines}
              isQualityView={true}
            />
          )}

          {/* TAB: REPORTS */}
          {activeAdminTab === 'reports' && (
            <ReportsView
              departments={departments}
              machines={filteredMachines}
              monthlyPlans={filteredMonthlyPlans}
              departmentWork={filteredDepartmentWork}
              qualityChecks={filteredQualityChecks}
              qualityRejections={filteredQualityRejections}
            />
          )}

          {/* TAB: MIS & PPT */}
          {activeAdminTab === 'mis' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                    Management Information System (MIS)
                  </h2>
                  <p className="text-xs sm:text-sm text-slate-500">
                    Generate and download executive MIS presentation deck (.pptx)
                  </p>
                </div>
                <button
                  onClick={handleDownloadMisPpt}
                  disabled={generatingPpt}
                  className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-md shadow-indigo-600/20 flex items-center space-x-2 transition disabled:opacity-50"
                >
                  <Download className="w-4 h-4" />
                  <span>{generatingPpt ? 'Generating Deck...' : 'Download MIS PPT'}</span>
                </button>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4 shadow-xs">
                <h3 className="text-sm font-bold text-slate-800">Executive MIS Slides Structure</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
                  {[
                    '1. Title & Plant Identification',
                    '2. Executive Summary',
                    '3. Plan vs Actual Targets',
                    '4. Department Performance',
                    '5. Machine Tracking Status',
                    '6. Pending Work Breakdown',
                    '7. Delayed Work Analysis',
                    '8. Quality Performance & KPIs',
                    '9. Open Rejections & Corrective Actions',
                    '10. Handover Compliance',
                    '11. Key Action Items',
                    '12. Closing Executive Summary',
                  ].map((slide, idx) => (
                    <div key={idx} className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-700 font-semibold">
                      {slide}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB: DATA MANAGEMENT */}
          {activeAdminTab === 'data_management' && (
            <DataManagementView
              departments={departments}
              machines={machines}
              yearlyPlans={yearlyPlans}
              monthlyPlans={monthlyPlans}
              weeklyPlans={weeklyPlans}
              qualityOps={qualityOps}
              qualityChecks={qualityChecks}
              qualityRejections={qualityRejections}
              departmentWork={departmentWork}
              handovers={handovers}
              notifications={notifications}
              auditLogs={auditLogs}
              machineDocs={machineDocs}
              userProfiles={userProfiles}
              onOpenExcelImport={() => onOpenExcelImport('planning')}
            />
          )}

          {/* TAB: NOTIFICATIONS (Requirement 11) */}
          {activeAdminTab === 'notifications' && (
            <div className="space-y-4">
              <DepartmentNotificationCenter
                departmentName=""
                notifications={notifications}
                onNavigateToTab={(tabId) => setActiveAdminTab(tabId)}
              />
            </div>
          )}

          {/* TAB: USERS / DEPARTMENT MANAGEMENT / AUDIT LOGS / SYSTEM SETTINGS */}
          {(activeAdminTab === 'users' ||
            activeAdminTab === 'department_management' ||
            activeAdminTab === 'audit_logs' ||
            activeAdminTab === 'system_settings' ||
            activeAdminTab === 'documents') && (
            <SettingsView
              departments={departments}
              auditLogs={auditLogs}
              userProfiles={userProfiles}
            />
          )}
        </main>
      </div>

      {/* Deep-Dive Machine Monitoring Modal (Section 19-24) */}
      {modalMachine && (
        <MachineDetailModal
          isOpen={true}
          onClose={() => setModalMachine(null)}
          machine={modalMachine}
          departmentWork={departmentWork}
          handovers={handovers}
          qualityChecks={qualityChecks}
          qualityRejections={qualityRejections}
          qualityOps={qualityOps}
          machineDocs={machineDocs}
        />
      )}

      {/* Admin 4-Column Plan Excel Import Wizard Modal */}
      {planImportModalState.isOpen && (
        <AdminPlanExcelImportModal
          isOpen={true}
          onClose={() => setPlanImportModalState({ ...planImportModalState, isOpen: false })}
          defaultPlanType={planImportModalState.planType}
          machines={machines}
        />
      )}
    </div>
  );
};
