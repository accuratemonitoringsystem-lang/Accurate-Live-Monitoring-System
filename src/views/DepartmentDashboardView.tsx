import React, { useState, useMemo } from 'react';
import {
  LayoutDashboard,
  Building,
  CalendarDays,
  Cpu,
  Calendar,
  CheckSquare,
  ArrowRightLeft,
  FileText,
  Bell,
  FileSpreadsheet,
  Plus,
  Home,
  LogOut,
  ChevronLeft,
  Search,
  Flame,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Download,
  Eye,
  Sliders,
  Package,
  Cable,
  ShieldCheck,
  BarChart3,
  PenTool,
  Layers,
  CircleDashed,
  PlayCircle,
  ArrowRightCircle,
  ShieldAlert,
  XCircle,
  AlertCircle,
  Target,
  Boxes,
} from 'lucide-react';
import { ProductionAnalyticsView } from '../components/ProductionAnalyticsView';
import { DesignWorkManagementView } from '../components/DesignWorkManagementView';
import { DepartmentDesignRequestsView } from '../components/DepartmentDesignRequestsView';
import { RequestDesignSupportModal } from '../components/RequestDesignSupportModal';
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
  RoadmapItem,
  SystemNotification,
  UserProfile,
  WeeklyPlan,
  YearlyPlan,
} from '../types';
import { COMPANY_NAME, SYSTEM_SUBTITLE } from '../constants';
import { useAuth } from '../context/AuthContext';
import { DepartmentWorkView } from './DepartmentWorkView';
import { PlanningView } from './PlanningView';
import { QualityView } from './QualityView';
import { ReportsView } from './ReportsView';
import { AdminDepartmentMonitoringView } from '../components/AdminDepartmentMonitoringView';
import { MachineDetailModal } from '../components/MachineDetailModal';
import { AccessoriesOrderModule } from '../components/AccessoriesOrderModule';
import { OpenCableOrderModule } from '../components/OpenCableOrderModule';
import { QualityHandoverModule } from '../components/QualityHandoverModule';
import { DepartmentHandoversView } from '../components/DepartmentHandoversView';
import { DepartmentNotificationCenter } from '../components/DepartmentNotificationCenter';
import { ShopFloorMachineMonitoringView } from '../components/ShopFloorMachineMonitoringView';
import { PlannedUpcomingWorkView } from '../components/planning/PlannedUpcomingWorkView';
import { RoadmapTimelineView } from '../components/RoadmapTimelineView';
import { DepartmentOperationMasterView } from '../components/operations/DepartmentOperationMasterView';
import { DepartmentOperationLotsView } from '../components/operations/DepartmentOperationLotsView';
import { DepartmentDailyUpdatesView } from '../components/operations/DepartmentDailyUpdatesView';
import { BacklogManagementView } from '../components/backlog/BacklogManagementView';
import { isDepartmentMatch, getNextDepartmentInRoute } from '../utils/departmentUtils';
import { generateMisPresentation } from '../utils/ppt';
import { ExcelImportType } from '../utils/excel';
import { getMachineDisplaySize, cleanMonthYear } from '../utils/machineUtils';
import { reconcileMonthlyPlanAssignments } from '../services/reconciliationService';

interface DepartmentDashboardViewProps {
  departmentName: string;
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
  onReturnToAdmin?: () => void;
}

export const DepartmentDashboardView: React.FC<DepartmentDashboardViewProps> = ({
  departmentName,
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
  onReturnToAdmin,
}) => {
  const { userProfile, signOut } = useAuth();
  const isAdmin = userProfile?.role === 'ADMIN';

  const isQualityDept =
    departmentName.includes('Quality') ||
    departmentName === '04 Inward Quality' ||
    departmentName === '14 Calibration';

  const isPlanningDept =
    departmentName.includes('Planning') ||
    departmentName === '02-A Planning Open Cable' ||
    departmentName === '02-B Planning Accessories';

  const isDesignDept =
    departmentName.toLowerCase().includes('design') ||
    departmentName.startsWith('01-A') ||
    departmentName.startsWith('01-B');

  // Active Tab & Filters (Standard Dashboard overview as unified landing tab)
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [selectedMonth, setSelectedMonth] = useState<string>('October 2026');
  const [selectedMachineSize, setSelectedMachineSize] = useState<string>('All Sizes');
  const [shopFloorKpiFilter, setShopFloorKpiFilter] = useState<string | null>(null);
  const [isDesignRequestModalOpen, setIsDesignRequestModalOpen] = useState(false);
  const [selectedMachine, setSelectedMachine] = useState<Machine | null>(null);
  const [generatingPpt, setGeneratingPpt] = useState(false);

  // Scoped Data: Strictly filtered to this department using canonical matching
  const scopedWork = departmentWork.filter((w) => isDepartmentMatch(w.department, departmentName));
  // Central manufacturing plan is visible to all departments except Design (Requirement 2)
  const scopedMonthly = isDesignDept
    ? []
    : monthlyPlans.filter((p) => {
        if (isDepartmentMatch(p.department, '02 Planning') || !p.department) return true;
        return isDepartmentMatch(p.department, departmentName);
      });
  const scopedWeekly = isDesignDept
    ? []
    : weeklyPlans.filter((p) => {
        if (isDepartmentMatch(p.department, '02 Planning') || !p.department) return true;
        return isDepartmentMatch(p.department, departmentName);
      });
  const scopedHandovers = handovers.filter(
    (h) =>
      isDepartmentMatch(h.sendingDepartment, departmentName) ||
      isDepartmentMatch(h.fromDepartment, departmentName) ||
      isDepartmentMatch(h.receivingDepartment, departmentName) ||
      isDepartmentMatch(h.toDepartment, departmentName)
  );
  const incomingHandoversList = handovers.filter(
    (h) =>
      isDepartmentMatch(h.receivingDepartment, departmentName) ||
      isDepartmentMatch(h.toDepartment, departmentName)
  );
  const pendingIncomingCount = incomingHandoversList.filter(
    (h) => h.status === 'SENT' || h.status === 'Pending Acceptance'
  ).length;

  const scopedRejections = isQualityDept
    ? qualityRejections
    : qualityRejections.filter((r) => isDepartmentMatch(r.concernedDepartment, departmentName));

  const scopedNotifications = notifications.filter((n) => {
    if (isAdmin && !departmentName) return true;
    const target = n.recipientDepartment || n.toDepartment;
    if (!target && !n.recipientRole) return true;
    return isDepartmentMatch(target, departmentName);
  });
  const unreadNotifsCount = scopedNotifications.filter((n) => !n.read && !n.isRead).length;

  // Available Machine Sizes dynamically computed across machines and work items (Requirement 4)
  const availableMachineSizes = useMemo(() => {
    const set = new Set<string>();
    machines.forEach((m) => {
      const sz = m.machineSize || m.size || m.model || m.machineModel;
      if (sz) set.add(sz.trim());
    });
    departmentWork.forEach((w) => {
      const sz = w.machineSize || w.machineModel;
      if (sz) set.add(sz.trim());
    });
    monthlyPlans.forEach((p) => {
      const sz = p.machineSize || p.machineModel;
      if (sz) set.add(sz.trim());
    });
    return Array.from(set).sort();
  }, [machines, departmentWork, monthlyPlans]);

  // Available Months dynamically computed from real database data (Requirement 20)
  const availableMonths = useMemo(() => {
    const set = new Set<string>();
    departmentWork.forEach((w) => {
      if (w.month || w.planMonth) {
        const { month: m, year: y } = cleanMonthYear(w.month || w.planMonth, w.year || w.planYear);
        set.add(`${m} ${y}`);
      }
    });
    machines.forEach((m) => {
      if (m.planMonth || m.month) {
        const { month: mo, year: yr } = cleanMonthYear(m.planMonth || m.month, m.planYear || m.year);
        set.add(`${mo} ${yr}`);
      }
    });
    monthlyPlans.forEach((p) => {
      if (p.month) {
        const { month: mo, year: yr } = cleanMonthYear(p.month, p.year);
        set.add(`${mo} ${yr}`);
      }
    });
    const list = Array.from(set);
    list.sort((a, b) => {
      if (a.toLowerCase().includes('october')) return -1;
      if (b.toLowerCase().includes('october')) return 1;
      if (a.toLowerCase().includes('september')) return -1;
      if (b.toLowerCase().includes('september')) return 1;
      return b.localeCompare(a);
    });
    return ['All Months', ...list];
  }, [departmentWork, machines, monthlyPlans]);

  // Scoped work filtered by selectedMonth AND selectedMachineSize (Requirement 4 & 20)
  const monthScopedWork = useMemo(() => {
    return scopedWork.filter((w) => {
      // Month filtering
      if (selectedMonth !== 'All Months') {
        const { month: cleanM, year: cleanY } = cleanMonthYear(w.month || w.planMonth, w.year || w.planYear);
        const mLabel = `${cleanM} ${cleanY}`.toLowerCase();
        const sel = selectedMonth.toLowerCase();

        let monthMatches = false;
        if (mLabel === sel) monthMatches = true;
        else if (sel.includes(cleanM.toLowerCase()) && (cleanY ? sel.includes(cleanY) : true)) monthMatches = true;
        else if (cleanM.toLowerCase() === 'october' && sel.includes('october')) monthMatches = true;
        else if (w.assignedDate) {
          const d = new Date(w.assignedDate);
          if (!isNaN(d.getTime())) {
            const mName = d.toLocaleString('en-US', { month: 'long' }).toLowerCase();
            if (sel.includes(mName)) monthMatches = true;
          }
        }
        if (!monthMatches) return false;
      }

      // Machine Size filtering
      if (selectedMachineSize !== 'All Sizes') {
        const wSize = (w.machineSize || w.machineModel || '').toLowerCase().trim();
        const target = selectedMachineSize.toLowerCase().trim();
        if (!wSize.includes(target) && !target.includes(wSize)) {
          return false;
        }
      }

      return true;
    });
  }, [scopedWork, selectedMonth, selectedMachineSize]);

  // Machine size filtered subsets across all views (Requirement 4)
  const sizeFilteredMachines = useMemo(() => {
    if (selectedMachineSize === 'All Sizes') return machines;
    const target = selectedMachineSize.toLowerCase().trim();
    return machines.filter((m) => {
      const sz = (m.machineSize || m.size || m.model || m.machineModel || '').toLowerCase().trim();
      return sz.includes(target) || target.includes(sz);
    });
  }, [machines, selectedMachineSize]);

  const sizeFilteredWork = useMemo(() => {
    if (selectedMachineSize === 'All Sizes') return scopedWork;
    const target = selectedMachineSize.toLowerCase().trim();
    return scopedWork.filter((w) => {
      const sz = (w.machineSize || w.machineModel || '').toLowerCase().trim();
      return sz.includes(target) || target.includes(sz);
    });
  }, [scopedWork, selectedMachineSize]);

  const sizeFilteredHandovers = useMemo(() => {
    if (selectedMachineSize === 'All Sizes') return scopedHandovers;
    const target = selectedMachineSize.toLowerCase().trim();
    return scopedHandovers.filter((h) => {
      const sz = (h.machineSize || h.machineModel || '').toLowerCase().trim();
      if (sz) return sz.includes(target) || target.includes(sz);
      const found = machines.find((m) => m.machineNumber === h.machineNumber);
      if (found) {
        const msz = (found.machineSize || found.size || found.model || '').toLowerCase().trim();
        return msz.includes(target) || target.includes(msz);
      }
      return false;
    });
  }, [scopedHandovers, selectedMachineSize, machines]);

  // Section 19: Live 9 KPI Card counts from live database records
  const totalAssignedKpi = monthScopedWork.length;
  const notStartedKpi = monthScopedWork.filter(
    (w) => (!w.progress || w.progress === 0) && (w.status === 'Not Started' || w.status === 'Pending')
  ).length;
  const inProgressKpi = monthScopedWork.filter(
    (w) => ((w.progress || 0) > 0 && (w.progress || 0) < 100) || w.status === 'In Progress'
  ).length;
  const completedKpi = monthScopedWork.filter(
    (w) => (w.progress || 0) >= 100 || w.status === 'Completed'
  ).length;
  const delayedKpi = monthScopedWork.filter((w) => {
    if (w.status === 'Delayed') return true;
    if (w.targetDate && (w.progress || 0) < 100) {
      const d = new Date(w.targetDate);
      return !isNaN(d.getTime()) && d < new Date();
    }
    return false;
  }).length;
  const readyForHandoverKpi = monthScopedWork.filter(
    (w) => w.isResponsible && (w.progress || 0) >= 100
  ).length;
  const waitingForHandoverKpi = pendingIncomingCount;
  const qualityHoldKpi = monthScopedWork.filter(
    (w) => w.status === 'Quality Hold' || w.status === 'QUALITY_HOLD' || w.status === 'On Hold'
  ).length;
  const rejectedKpi = scopedRejections.filter((r) => r.status !== 'Closed').length;

  // Legacy variables maintained
  const totalTasks = totalAssignedKpi;
  const completedTasks = completedKpi;
  const inProgressTasks = inProgressKpi;
  const pendingTasks = notStartedKpi;
  const delayedTasks = delayedKpi;

  const targetMonthlyQty = scopedMonthly.reduce((sum, p) => sum + (Number(p.plannedQuantity) || 0), 0);
  const actualMonthlyQty = scopedMonthly.reduce((sum, p) => sum + (Number(p.actualQuantity) || 0), 0);
  const monthlyAchievement =
    targetMonthlyQty > 0 ? Math.round((actualMonthlyQty / targetMonthlyQty) * 100) : 0;

  const scopedDeptMachines = machines.filter((m) =>
    isDepartmentMatch(m.responsibleDepartment || m.currentDepartment, departmentName)
  );

  // Build Department Navigation Menu based on Department Specifications
  let displayNavItems: Array<{
    id: string;
    label: string;
    icon: any;
    badge?: number;
    badgeColor?: string;
  }> = [];

  if (isPlanningDept) {
    // Section 2: Planning unified dashboard with its explicit internal work modules
    displayNavItems = [
      { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { id: 'daily_updates', label: 'Daily Operation Updates', icon: Clock },
      { id: 'planned_machines', label: 'Monthly Plan / Upcoming Machines', icon: Layers, badge: monthlyPlans.length + weeklyPlans.length, badgeColor: 'bg-indigo-600' },
      { id: 'monthly_plan', label: 'Monthly Plan', icon: Calendar, badge: monthlyPlans.length, badgeColor: 'bg-blue-600' },
      { id: 'weekly_plan', label: 'Weekly Plan', icon: Clock },
      { id: 'outgoing_handovers', label: 'Planning Handover / Release', icon: ArrowRightLeft },
      { id: 'incoming_handovers', label: 'Incoming Machines', icon: ArrowRightLeft, badge: pendingIncomingCount, badgeColor: 'bg-amber-600' },
      { id: 'my_work', label: 'Active Work', icon: Building, badge: scopedWork.filter(w => w.status !== 'Completed').length },
      { id: 'completed_work', label: 'Completed / Handed Over', icon: CheckCircle2, badge: scopedWork.filter(w => w.status === 'Completed').length },
      { id: 'roadmap', label: 'Roadmap', icon: CalendarDays },
      { id: 'yearly_plan', label: 'Yearly Plan', icon: Target },
      { id: 'shop_floor', label: 'Shop Floor Work', icon: Cpu, badge: scopedDeptMachines.length, badgeColor: 'bg-blue-600' },
      { id: 'operation_lots', label: 'Operation Lots', icon: Boxes },
      { id: 'operation_master', label: 'Operation Master', icon: Sliders },
      { id: 'plan_vs_actual', label: 'Plan vs Actual', icon: BarChart3 },
      { id: 'accessories_orders', label: 'Accessories', icon: Package },
      { id: 'open_cable_orders', label: 'Open Cable', icon: Cable },
      { id: 'excel_import', label: 'Plan Excel Import', icon: FileSpreadsheet },
      { id: 'reports', label: 'Reports', icon: FileText },
      { id: 'documents', label: 'Documents', icon: FileText },
      { id: 'notifications', label: 'Notifications', icon: Bell, badge: unreadNotifsCount, badgeColor: 'bg-red-600' },
    ];
  } else if (isDesignDept) {
    // Section 1: Consolidated 01 Design dashboard (Monthly plan strictly excluded from Design as per Requirement 2 & 4)
    displayNavItems = [
      { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { id: 'design_management', label: 'Design Work Management', icon: PenTool },
      { id: 'operation_lots', label: 'Operation Lots', icon: Boxes },
      { id: 'operation_master', label: 'Operation Master', icon: Sliders },
      { id: 'shop_floor', label: 'Shop Floor & Machines', icon: Cpu, badge: scopedDeptMachines.length, badgeColor: 'bg-blue-600' },
      { id: 'machine_monitoring', label: 'Machine Monitoring', icon: LayoutDashboard },
      { id: 'my_work', label: 'Active Work', icon: Building, badge: scopedWork.filter(w => w.status !== 'Completed').length },
      { id: 'daily_updates', label: 'Daily Updates', icon: Clock },
      { id: 'pending_work', label: 'Pending Work', icon: Clock, badge: pendingTasks + inProgressTasks },
      { id: 'completed_work', label: 'Completed Work', icon: CheckCircle2, badge: completedTasks },
      { id: 'delayed_work', label: 'Delayed Work', icon: AlertTriangle, badge: delayedTasks, badgeColor: 'bg-red-500' },
      { id: 'quality_handover', label: 'Quality Handover', icon: ShieldCheck },
      { id: 'outgoing_handovers', label: 'Department Handover', icon: ArrowRightLeft },
      { id: 'incoming_handovers', label: 'Incoming Machines', icon: ArrowRightLeft, badge: pendingIncomingCount, badgeColor: 'bg-amber-600' },
      { id: 'notifications', label: 'Notifications', icon: Bell, badge: unreadNotifsCount, badgeColor: 'bg-red-600' },
      { id: 'documents', label: 'Documents', icon: FileText },
      { id: 'reports', label: 'Reports', icon: FileText },
      { id: 'mis', label: 'MIS', icon: FileSpreadsheet },
    ];
  } else {
    // Section 5 & 6: Same functional structure for Metal Shop, 07A, 07B, 07C Lapping, 12 Bridge Assembly, etc.
    displayNavItems = [
      { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { id: 'planned_machines', label: 'Monthly Plan / Upcoming Machines', icon: Layers, badge: scopedMonthly.length, badgeColor: 'bg-indigo-600' },
      { id: 'incoming_handovers', label: 'Incoming Machines', icon: ArrowRightLeft, badge: pendingIncomingCount, badgeColor: 'bg-amber-600' },
      { id: 'my_work', label: 'Active Work', icon: Building, badge: scopedWork.filter(w => w.status !== 'Completed').length },
      { id: 'completed_work', label: 'Completed / Handed Over Work', icon: CheckCircle2, badge: scopedWork.filter(w => w.status === 'Completed').length },
      { id: 'shop_floor', label: 'Shop Floor Work', icon: Cpu, badge: scopedDeptMachines.length, badgeColor: 'bg-blue-600' },
      { id: 'operation_lots', label: 'Operation Lots', icon: Boxes },
      { id: 'operation_master', label: 'Operation Master', icon: Sliders },
      { id: 'machine_monitoring', label: 'Machine Tracking', icon: LayoutDashboard },
      { id: 'monthly_plan', label: 'Monthly Plan', icon: Calendar, badge: scopedMonthly.length, badgeColor: 'bg-blue-600' },
      { id: 'weekly_plan', label: 'Weekly Plan', icon: Clock },
      { id: 'daily_updates', label: 'Daily Updates', icon: Clock },
      { id: 'backlog', label: 'Backlog Management', icon: Layers },
      { id: 'pending_work', label: 'Pending Work', icon: Clock, badge: pendingTasks + inProgressTasks },
      { id: 'delayed_work', label: 'Delayed Work', icon: AlertTriangle, badge: delayedTasks, badgeColor: 'bg-red-500' },
      { id: 'quality_handover', label: isQualityDept ? 'Quality Receiving Deck' : 'Quality Handover', icon: ShieldCheck },
      { id: 'outgoing_handovers', label: 'Department Handover', icon: ArrowRightLeft },
      { id: 'notifications', label: 'Notifications', icon: Bell, badge: unreadNotifsCount, badgeColor: 'bg-red-600' },
      { id: 'documents', label: 'Documents', icon: FileText },
      { id: 'reports', label: 'Reports', icon: FileText },
      { id: 'mis', label: 'MIS', icon: FileSpreadsheet },
    ];

    if (isQualityDept) {
      displayNavItems.splice(
        2,
        0,
        { id: 'quality_ops', label: 'Quality Operations', icon: CheckSquare },
        { id: 'today_inspection', label: "Today's Inspection", icon: CheckSquare }
      );
    }

    displayNavItems.splice(displayNavItems.findIndex(i => i.id === 'quality_handover'), 0, {
      id: 'design_support',
      label: 'Design Support Requests',
      icon: PenTool,
    });
  }

  const handleDownloadMisPpt = async () => {
    setGeneratingPpt(true);
    try {
      await generateMisPresentation({
        periodTitle: departmentName,
        totalMachines: machines.length,
        machines,
        monthlyPlans: scopedMonthly,
        departmentWork: scopedWork,
        qualityChecks: qualityChecks,
        qualityRejections: scopedRejections,
      });
    } catch (err) {
      console.error('Failed to generate Department MIS PPT:', err);
    } finally {
      setGeneratingPpt(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex text-slate-800 font-sans antialiased">
      {/* =========================================================================
          DEPARTMENT SIDEBAR
          ========================================================================= */}
      <aside className="w-64 bg-slate-900 text-slate-300 flex flex-col border-r border-slate-800 shrink-0 select-none">
        {/* Department Scope Card */}
        <div className="p-3 mx-3 my-3 bg-slate-800/90 rounded-xl border border-slate-700/60">
          <div className="flex items-center space-x-2 text-blue-400">
            <Building className="w-4 h-4 text-blue-400" />
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
              Department Portal
            </span>
          </div>
          <div className="text-xs font-bold text-white mt-1 leading-snug">
            {departmentName}
          </div>
          <div className="text-[10px] text-blue-400 mt-0.5">
            {scopedWork.length} Active Assigned Task{scopedWork.length !== 1 ? 's' : ''}
          </div>
        </div>

        {/* Navigation items */}
        <div className="flex-1 px-3 py-1 space-y-1 overflow-y-auto custom-scrollbar">
          {displayNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;

            return (
              <button
                key={item.id}
                onClick={() => {
                  if (item.id === 'excel_import') {
                    onOpenExcelImport('planning');
                    return;
                  }
                  setActiveTab(item.id);
                }}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-xs font-bold'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                <div className="flex items-center space-x-2.5 min-w-0">
                  <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-slate-500'}`} />
                  <span className="truncate">{item.label}</span>
                </div>
                {item.badge !== undefined && item.badge > 0 && (
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold text-white ${
                      item.badgeColor || 'bg-slate-700'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Footer Navigation */}
        <div className="p-3 border-t border-slate-800 bg-slate-950/60 space-y-1.5">
          {isAdmin && onReturnToAdmin && (
            <button
              onClick={onReturnToAdmin}
              className="w-full flex items-center justify-center space-x-1.5 px-3 py-2 rounded-xl bg-indigo-950/80 hover:bg-indigo-900 border border-indigo-700/60 text-indigo-300 text-xs font-bold transition shadow-xs"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              <span>Return to Admin</span>
            </button>
          )}

          {isAdmin && (
            <button
              onClick={onNavigateHome}
              className="w-full flex items-center justify-center space-x-2 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-300 text-xs font-bold transition"
            >
              <Home className="w-3.5 h-3.5 text-blue-400" />
              <span>Home Directory</span>
            </button>
          )}

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
        {/* Admin Inspection Banner if inspected by Administrator */}
        {isAdmin && onReturnToAdmin && (
          <div className="bg-indigo-900 text-indigo-100 text-xs px-4 py-2 flex items-center justify-between shadow-xs">
            <span className="font-semibold">
              Administrator Inspection Mode: viewing <strong>{departmentName}</strong>
            </span>
            <button
              onClick={onReturnToAdmin}
              className="px-2.5 py-1 rounded bg-indigo-700 hover:bg-indigo-600 text-white font-bold text-[11px] transition"
            >
              Return to Admin Dashboard
            </button>
          </div>
        )}

        {/* Top Header */}
        <header className="h-14 bg-white border-b border-slate-200 px-4 sm:px-6 flex items-center justify-between shrink-0 z-10 shadow-xs">
          <div className="flex items-center space-x-3">
            <h1 className="text-base font-black text-slate-900 tracking-tight">
              {departmentName} Dashboard
            </h1>
            <span className="text-xs font-semibold px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 hidden sm:inline">
              Shop Floor Node
            </span>
            <div className="hidden sm:flex items-center gap-1.5 bg-indigo-50/80 border border-indigo-200 px-2 py-1 rounded-xl">
              <span className="text-[11px] font-bold text-indigo-900">📐 Size:</span>
              <select
                aria-label="Filter machines by size"
                value={selectedMachineSize}
                onChange={(e) => setSelectedMachineSize(e.target.value)}
                className="text-xs font-bold text-indigo-950 bg-white border border-indigo-300 rounded-lg px-2 py-0.5 shadow-2xs outline-none cursor-pointer"
              >
                <option value="All Sizes">All Sizes</option>
                {availableMachineSizes.map((sz) => (
                  <option key={sz} value={sz}>
                    Size {sz}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center space-x-3 text-xs">
            <button
              onClick={() => setActiveTab('notifications')}
              className="relative p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition"
              title="Department Notifications"
            >
              <Bell className="w-4 h-4" />
              {unreadNotifsCount > 0 && (
                <span className="absolute -top-1 -right-1 px-1.5 py-0.5 rounded-full text-[10px] font-black bg-red-600 text-white animate-pulse">
                  {unreadNotifsCount}
                </span>
              )}
            </button>

            <button
              onClick={onOpenGlobalSearch}
              className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 font-semibold flex items-center space-x-1.5 transition"
            >
              <Search className="w-3.5 h-3.5 text-slate-400" />
              <span className="hidden md:inline">Global Search</span>
            </button>

            {!isDesignDept && (
              <button
                onClick={() => setIsDesignRequestModalOpen(true)}
                className="px-3 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 font-bold flex items-center space-x-1.5 transition"
                title="Send drawing or support request to Design"
              >
                <PenTool className="w-3.5 h-3.5 text-indigo-600" />
                <span className="hidden sm:inline">Request Design Support</span>
              </button>
            )}

            <button
              onClick={onOpenQuickUpdate}
              className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold flex items-center space-x-1.5 shadow-xs transition"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Update Progress</span>
            </button>

            {/* Authenticated User Badge & Logout in Header */}
            <div className="flex items-center space-x-2.5 pl-3 border-l border-slate-200">
              <div className="text-right hidden sm:block">
                <div className="font-bold text-slate-900 leading-tight">
                  {userProfile?.authorityName || userProfile?.displayName || userProfile?.username}
                </div>
                <div className="text-[10px] text-slate-500 font-semibold flex items-center justify-end gap-1">
                  <span className="text-blue-600 font-bold">{userProfile?.department}</span>
                  <span>&bull;</span>
                  <span className="px-1.5 py-0.2 rounded bg-slate-100 text-slate-700 font-black uppercase text-[9px]">
                    {userProfile?.role}
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
          {/* TAB: DESIGN WORK MANAGEMENT (Autonomous Design Module) */}
          {activeTab === 'design_management' && (
            <DesignWorkManagementView
              departmentName={departmentName}
              userProfile={userProfile}
              machines={machines}
            />
          )}

          {/* TAB: DEPARTMENT DESIGN SUPPORT REQUESTS (From this department to Design) */}
          {activeTab === 'design_support' && (
            <DepartmentDesignRequestsView
              departmentName={departmentName}
              userProfile={userProfile}
              machines={machines}
            />
          )}

          {/* TAB: DASHBOARD (Unified Dashboard overview for all departments) */}
          {activeTab === 'dashboard' && (
            <div className="space-y-6">
              {/* Month Filter & Department Header Banner (Requirement 4 & 20) */}
              <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="p-1.5 bg-blue-600 text-white rounded-lg">
                      <Layers className="w-4 h-4" />
                    </span>
                    <h3 className="text-sm font-bold text-slate-900">
                      {departmentName} — Production KPI &amp; Machine Tracking
                    </h3>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    Live production machine status from database. Click any KPI card below to filter the Shop Floor work table.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                  {/* Machine Size Dropdown Filter (Requirement 4) */}
                  <div className="flex items-center gap-2 bg-indigo-50/80 p-2 rounded-xl border border-indigo-200">
                    <span className="text-xs font-bold text-indigo-900 uppercase tracking-wide shrink-0">
                      📐 Machine Size:
                    </span>
                    <select
                      id="dept-size-select"
                      aria-label="Filter department by machine size"
                      value={selectedMachineSize}
                      onChange={(e) => setSelectedMachineSize(e.target.value)}
                      className="bg-white font-bold text-indigo-950 border border-indigo-300 rounded-lg px-2.5 py-1 text-xs outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer shadow-2xs"
                    >
                      <option value="All Sizes">All Sizes ({machines.length})</option>
                      {availableMachineSizes.map((sz) => (
                        <option key={sz} value={sz}>
                          Size {sz}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Month Dropdown Filter (Requirement 20) */}
                  <div className="flex items-center gap-2 bg-slate-50 p-2 rounded-xl border border-slate-200">
                    <Calendar className="w-4 h-4 text-blue-600 shrink-0 ml-1" />
                    <label htmlFor="dept-month-select" className="text-xs font-bold text-slate-600 uppercase tracking-wide shrink-0">
                      Month:
                    </label>
                    <select
                      id="dept-month-select"
                      value={selectedMonth}
                      onChange={(e) => setSelectedMonth(e.target.value)}
                      className="bg-white font-bold text-slate-900 border border-slate-300 rounded-lg px-2.5 py-1 text-xs outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer shadow-2xs"
                    >
                      {availableMonths.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* 4-STATE MACHINE WORKFLOW ARCHITECTURE (Section 2 & Section 6) */}
              {!isDesignDept && (
                <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-xs">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                    <div>
                      <h4 className="text-xs font-black uppercase tracking-wider text-slate-800 flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-blue-600 inline-block"></span>
                        Manufacturing Workflow States &amp; Access Control
                      </h4>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Planned machines remain strictly view-only until formally handed over and accepted by {departmentName}.
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    {/* A. Monthly Plan / Upcoming Machines */}
                    <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-200 flex flex-col justify-between">
                      <div>
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-black uppercase tracking-wider text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded">
                            State A &bull; View-Only
                          </span>
                          <Layers className="w-4 h-4 text-indigo-600" />
                        </div>
                        <h5 className="text-xs font-bold text-slate-900 mt-2">Monthly Plan / Upcoming</h5>
                        <p className="text-[10px] text-slate-500 mt-0.5">
                          Central monthly manufacturing plan in priority sequence.
                        </p>
                      </div>
                      <div className="mt-3 pt-2 border-t border-slate-200/80 flex items-center justify-between">
                        <span className="text-lg font-black text-slate-900 font-mono">{scopedMonthly.length}</span>
                        <button
                          type="button"
                          onClick={() => setActiveTab('planned_machines')}
                          className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 transition cursor-pointer"
                        >
                          View Plan &rarr;
                        </button>
                      </div>
                    </div>

                    {/* B. Incoming Machines */}
                    <div className="bg-amber-50/60 rounded-xl p-3.5 border border-amber-200 flex flex-col justify-between">
                      <div>
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-black uppercase tracking-wider text-amber-800 bg-amber-100 border border-amber-300 px-2 py-0.5 rounded">
                            State B &bull; Awaiting Acceptance
                          </span>
                          <ArrowRightLeft className="w-4 h-4 text-amber-600" />
                        </div>
                        <h5 className="text-xs font-bold text-slate-900 mt-2">Incoming Machines</h5>
                        <p className="text-[10px] text-slate-500 mt-0.5">
                          Handed over to this department but awaiting formal acceptance.
                        </p>
                      </div>
                      <div className="mt-3 pt-2 border-t border-amber-200/80 flex items-center justify-between">
                        <span className="text-lg font-black text-amber-900 font-mono">{pendingIncomingCount}</span>
                        <button
                          type="button"
                          onClick={() => setActiveTab('incoming_handovers')}
                          className="text-[11px] font-bold text-amber-700 hover:text-amber-900 transition cursor-pointer"
                        >
                          Review &amp; Accept &rarr;
                        </button>
                      </div>
                    </div>

                    {/* C. Active Work */}
                    <div className="bg-emerald-50/60 rounded-xl p-3.5 border border-emerald-200 flex flex-col justify-between">
                      <div>
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-black uppercase tracking-wider text-emerald-800 bg-emerald-100 border border-emerald-300 px-2 py-0.5 rounded">
                            State C &bull; Work Authorized
                          </span>
                          <Building className="w-4 h-4 text-emerald-600" />
                        </div>
                        <h5 className="text-xs font-bold text-slate-900 mt-2">Active Work</h5>
                        <p className="text-[10px] text-slate-500 mt-0.5">
                          Accepted machines currently owned by {departmentName}. Full update rights.
                        </p>
                      </div>
                      <div className="mt-3 pt-2 border-t border-emerald-200/80 flex items-center justify-between">
                        <span className="text-lg font-black text-emerald-900 font-mono">{scopedWork.filter((w) => w.status !== 'Completed').length}</span>
                        <button
                          type="button"
                          onClick={() => setActiveTab('my_work')}
                          className="text-[11px] font-bold text-emerald-700 hover:text-emerald-900 transition cursor-pointer"
                        >
                          Manage Work &rarr;
                        </button>
                      </div>
                    </div>

                    {/* D. Completed / Handed Over Work */}
                    <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-200 flex flex-col justify-between">
                      <div>
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-black uppercase tracking-wider text-slate-700 bg-slate-200 border border-slate-300 px-2 py-0.5 rounded">
                            State D &bull; Completed History
                          </span>
                          <CheckCircle2 className="w-4 h-4 text-slate-600" />
                        </div>
                        <h5 className="text-xs font-bold text-slate-900 mt-2">Completed / Transferred</h5>
                        <p className="text-[10px] text-slate-500 mt-0.5">
                          Finished tasks and machines transferred to subsequent departments.
                        </p>
                      </div>
                      <div className="mt-3 pt-2 border-t border-slate-200/80 flex items-center justify-between">
                        <span className="text-lg font-black text-slate-800 font-mono">{scopedWork.filter((w) => w.status === 'Completed').length}</span>
                        <button
                          type="button"
                          onClick={() => setActiveTab('completed_work')}
                          className="text-[11px] font-bold text-slate-700 hover:text-slate-900 transition cursor-pointer"
                        >
                          View Archive &rarr;
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Section 19: The 9 Live Department KPI Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-9 gap-3 sm:gap-3.5">
                {/* 1. TOTAL ASSIGNED */}
                <button
                  type="button"
                  onClick={() => {
                    setShopFloorKpiFilter('all');
                    setActiveTab('shop_floor');
                  }}
                  className="bg-white hover:bg-slate-50 transition-all rounded-2xl p-4 border border-slate-200 hover:border-blue-400 shadow-xs text-left group cursor-pointer"
                  title="Click to view all assigned machines on shop floor"
                >
                  <div className="flex items-center justify-between text-slate-400 group-hover:text-blue-600 transition-colors">
                    <span className="text-[10px] font-bold uppercase tracking-wider">Total Assigned</span>
                    <Layers className="w-3.5 h-3.5" />
                  </div>
                  <div className="text-2xl font-black text-slate-900 mt-1 font-mono group-hover:text-blue-600 transition-colors">
                    {totalAssignedKpi}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5 font-medium flex items-center justify-between">
                    <span>{selectedMonth}</span>
                    <span className="text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity">&rarr;</span>
                  </div>
                </button>

                {/* 2. NOT STARTED */}
                <button
                  type="button"
                  onClick={() => {
                    setShopFloorKpiFilter('not_started');
                    setActiveTab('shop_floor');
                  }}
                  className="bg-white hover:bg-slate-50 transition-all rounded-2xl p-4 border border-slate-200 hover:border-slate-400 shadow-xs text-left group cursor-pointer"
                  title="Click to view machines not started"
                >
                  <div className="flex items-center justify-between text-slate-400 group-hover:text-slate-700 transition-colors">
                    <span className="text-[10px] font-bold uppercase tracking-wider">Not Started</span>
                    <CircleDashed className="w-3.5 h-3.5" />
                  </div>
                  <div className="text-2xl font-black text-slate-600 mt-1 font-mono group-hover:text-slate-900 transition-colors">
                    {notStartedKpi}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5 font-medium flex items-center justify-between">
                    <span>Pending Work</span>
                    <span className="text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity">&rarr;</span>
                  </div>
                </button>

                {/* 3. IN PROGRESS */}
                <button
                  type="button"
                  onClick={() => {
                    setShopFloorKpiFilter('in_progress');
                    setActiveTab('shop_floor');
                  }}
                  className="bg-white hover:bg-blue-50/40 transition-all rounded-2xl p-4 border border-slate-200 hover:border-blue-400 shadow-xs text-left group cursor-pointer"
                  title="Click to view machines in progress"
                >
                  <div className="flex items-center justify-between text-blue-500 group-hover:text-blue-700 transition-colors">
                    <span className="text-[10px] font-bold uppercase tracking-wider">In Progress</span>
                    <PlayCircle className="w-3.5 h-3.5" />
                  </div>
                  <div className="text-2xl font-black text-blue-600 mt-1 font-mono">
                    {inProgressKpi}
                  </div>
                  <div className="text-[10px] text-blue-600/80 mt-0.5 font-medium flex items-center justify-between">
                    <span>Active Work</span>
                    <span className="opacity-0 group-hover:opacity-100 transition-opacity">&rarr;</span>
                  </div>
                </button>

                {/* 4. COMPLETED */}
                <button
                  type="button"
                  onClick={() => {
                    setShopFloorKpiFilter('completed');
                    setActiveTab('shop_floor');
                  }}
                  className="bg-white hover:bg-emerald-50/40 transition-all rounded-2xl p-4 border border-slate-200 hover:border-emerald-400 shadow-xs text-left group cursor-pointer"
                  title="Click to view 100% completed machines"
                >
                  <div className="flex items-center justify-between text-emerald-600 transition-colors">
                    <span className="text-[10px] font-bold uppercase tracking-wider">Completed</span>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  </div>
                  <div className="text-2xl font-black text-emerald-600 mt-1 font-mono">
                    {completedKpi}
                  </div>
                  <div className="text-[10px] text-emerald-600/80 mt-0.5 font-medium flex items-center justify-between">
                    <span>100% Done</span>
                    <span className="opacity-0 group-hover:opacity-100 transition-opacity">&rarr;</span>
                  </div>
                </button>

                {/* 5. DELAYED */}
                <button
                  type="button"
                  onClick={() => {
                    setShopFloorKpiFilter('delayed');
                    setActiveTab('shop_floor');
                  }}
                  className="bg-white hover:bg-rose-50/40 transition-all rounded-2xl p-4 border border-slate-200 hover:border-rose-400 shadow-xs text-left group cursor-pointer"
                  title="Click to view delayed / overdue machines"
                >
                  <div className="flex items-center justify-between text-rose-500 transition-colors">
                    <span className="text-[10px] font-bold uppercase tracking-wider">Delayed</span>
                    <AlertCircle className="w-3.5 h-3.5" />
                  </div>
                  <div className="text-2xl font-black text-rose-600 mt-1 font-mono">
                    {delayedKpi}
                  </div>
                  <div className="text-[10px] text-rose-600/80 mt-0.5 font-medium flex items-center justify-between">
                    <span>Action Needed</span>
                    <span className="opacity-0 group-hover:opacity-100 transition-opacity">&rarr;</span>
                  </div>
                </button>

                {/* 6. READY FOR HANDOVER */}
                <button
                  type="button"
                  onClick={() => {
                    setShopFloorKpiFilter('ready_handover');
                    setActiveTab('shop_floor');
                  }}
                  className="bg-white hover:bg-teal-50/40 transition-all rounded-2xl p-4 border border-slate-200 hover:border-teal-400 shadow-xs text-left group cursor-pointer"
                  title="Click to view machines ready for handover"
                >
                  <div className="flex items-center justify-between text-teal-600 transition-colors">
                    <span className="text-[10px] font-bold uppercase tracking-wider">Ready Handover</span>
                    <ArrowRightCircle className="w-3.5 h-3.5" />
                  </div>
                  <div className="text-2xl font-black text-teal-600 mt-1 font-mono">
                    {readyForHandoverKpi}
                  </div>
                  <div className="text-[10px] text-teal-600/80 mt-0.5 font-medium flex items-center justify-between">
                    <span>Ready to Dispatch</span>
                    <span className="opacity-0 group-hover:opacity-100 transition-opacity">&rarr;</span>
                  </div>
                </button>

                {/* 7. WAITING FOR HANDOVER */}
                <button
                  type="button"
                  onClick={() => {
                    setShopFloorKpiFilter('waiting_handover');
                    setActiveTab('shop_floor');
                  }}
                  className="bg-white hover:bg-amber-50/40 transition-all rounded-2xl p-4 border border-slate-200 hover:border-amber-400 shadow-xs text-left group cursor-pointer"
                  title="Click to view incoming handovers pending acceptance"
                >
                  <div className="flex items-center justify-between text-amber-600 transition-colors">
                    <span className="text-[10px] font-bold uppercase tracking-wider">Waiting Handover</span>
                    <ArrowRightLeft className="w-3.5 h-3.5" />
                  </div>
                  <div className="text-2xl font-black text-amber-600 mt-1 font-mono">
                    {waitingForHandoverKpi}
                  </div>
                  <div className="text-[10px] text-amber-600/80 mt-0.5 font-medium flex items-center justify-between">
                    <span>Incoming Handovers</span>
                    <span className="opacity-0 group-hover:opacity-100 transition-opacity">&rarr;</span>
                  </div>
                </button>

                {/* 8. QUALITY HOLD */}
                <button
                  type="button"
                  onClick={() => {
                    setShopFloorKpiFilter('quality_hold');
                    setActiveTab('shop_floor');
                  }}
                  className="bg-white hover:bg-indigo-50/40 transition-all rounded-2xl p-4 border border-slate-200 hover:border-indigo-400 shadow-xs text-left group cursor-pointer"
                  title="Click to view machines sent for rework"
                >
                  <div className="flex items-center justify-between text-indigo-600 transition-colors">
                    <span className="text-[10px] font-bold uppercase tracking-wider">Rework Required</span>
                    <ShieldAlert className="w-3.5 h-3.5" />
                  </div>
                  <div className="text-2xl font-black text-indigo-600 mt-1 font-mono">
                    {qualityHoldKpi}
                  </div>
                  <div className="text-[10px] text-indigo-600/80 mt-0.5 font-medium flex items-center justify-between">
                    <span>Correction / Rework</span>
                    <span className="opacity-0 group-hover:opacity-100 transition-opacity">&rarr;</span>
                  </div>
                </button>

                {/* 9. REJECTED */}
                <button
                  type="button"
                  onClick={() => {
                    setShopFloorKpiFilter('rejected');
                    setActiveTab('shop_floor');
                  }}
                  className="bg-white hover:bg-rose-50/40 transition-all rounded-2xl p-4 border border-slate-200 hover:border-rose-400 shadow-xs text-left group cursor-pointer"
                  title="Click to view rejections / rework"
                >
                  <div className="flex items-center justify-between text-rose-600 transition-colors">
                    <span className="text-[10px] font-bold uppercase tracking-wider">Rejected</span>
                    <XCircle className="w-3.5 h-3.5" />
                  </div>
                  <div className="text-2xl font-black text-rose-600 mt-1 font-mono">
                    {rejectedKpi}
                  </div>
                  <div className="text-[10px] text-rose-600/80 mt-0.5 font-medium flex items-center justify-between">
                    <span>Quality Rework</span>
                    <span className="opacity-0 group-hover:opacity-100 transition-opacity">&rarr;</span>
                  </div>
                </button>
              </div>

              {/* Shop Floor Real Machines Status Banner */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
                <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="p-1 bg-blue-600 text-white rounded-md">
                      <Cpu className="w-3.5 h-3.5" />
                    </span>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                      Live Shop Floor Machines ({scopedDeptMachines.length})
                    </h3>
                  </div>
                  <button
                    onClick={() => setActiveTab('shop_floor')}
                    className="text-xs text-blue-600 hover:text-blue-700 font-bold flex items-center gap-1"
                  >
                    <span>Open Shop Floor Execution</span>
                    <span>&rarr;</span>
                  </button>
                </div>

                {scopedDeptMachines.length === 0 ? (
                  <div className="p-6 text-center text-xs text-slate-400">
                    No machines currently at {departmentName} station. Incoming machines from preceding departments will appear here.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-100/70 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[10px]">
                        <tr>
                          <th className="p-3">Machine No</th>
                          <th className="p-3">Machine Size</th>
                          <th className="p-3">Current Work</th>
                          <th className="p-3">Status</th>
                          <th className="p-3">Progress</th>
                          <th className="p-3">Next Route</th>
                          <th className="p-3 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {scopedDeptMachines.slice(0, 5).map((m) => {
                          const prog = m.progress !== undefined ? m.progress : m.overallProgressPercent || 0;
                          const sizeDisplay = getMachineDisplaySize(m);
                          return (
                            <tr key={m.id} className="hover:bg-slate-50 transition">
                              <td className="p-3 font-bold font-mono text-blue-600">{m.machineNumber}</td>
                              <td className="p-3 text-slate-800 font-bold">{sizeDisplay !== 'Size not available' ? sizeDisplay : (m.machineSize || m.model || m.machineModel || '-')}</td>
                              <td className="p-3 font-medium text-slate-800">{m.currentWork || 'Production Process'}</td>
                              <td className="p-3">
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                                  prog >= 100 ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-100 text-blue-800'
                                }`}>
                                  {prog >= 100 ? '100% Completed' : (m.status || 'In Progress')}
                                </span>
                              </td>
                              <td className="p-3 font-mono font-bold text-slate-800">{prog}%</td>
                              <td className="p-3 text-slate-600">{m.nextDepartment || getNextDepartmentInRoute(departmentName) || 'Next Dept'}</td>
                              <td className="p-3 text-right">
                                <button
                                  onClick={() => setActiveTab('shop_floor')}
                                  className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[11px] rounded transition"
                                >
                                  Manage &rarr;
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Department Work Table */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
                <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                    Assigned Department Work ({scopedWork.length})
                  </h3>
                  <button
                    onClick={() => setActiveTab('my_work')}
                    className="text-xs text-blue-600 hover:text-blue-700 font-bold"
                  >
                    View All Work &rarr;
                  </button>
                </div>

                {scopedWork.length === 0 ? (
                  <div className="p-8 text-center text-xs text-slate-400">
                    No work assigned to {departmentName} yet. Real tasks will appear here when planned or allocated.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-100/70 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[10px]">
                        <tr>
                          <th className="p-3">Task / Operation</th>
                          <th className="p-3">Machine No</th>
                          <th className="p-3">Model</th>
                          <th className="p-3">Priority</th>
                          <th className="p-3">Status</th>
                          <th className="p-3">Progress</th>
                          <th className="p-3">Due Date</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {scopedWork.slice(0, 8).map((w) => (
                          <tr key={w.id} className="hover:bg-slate-50 transition">
                            <td className="p-3 font-semibold text-slate-900">{w.title}</td>
                            <td className="p-3 font-mono text-slate-700">{w.machineNumber || '-'}</td>
                            <td className="p-3 text-slate-600">{w.machineModel || '-'}</td>
                            <td className="p-3">
                              <span
                                className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                                  w.priority === 'Critical'
                                    ? 'bg-red-100 text-red-800'
                                    : w.priority === 'High'
                                    ? 'bg-amber-100 text-amber-800'
                                    : 'bg-slate-100 text-slate-700'
                                }`}
                              >
                                {w.priority}
                              </span>
                            </td>
                            <td className="p-3">
                              <span
                                className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                                  w.status === 'Completed'
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : w.status === 'Delayed'
                                    ? 'bg-red-100 text-red-800'
                                    : w.status === 'In Progress'
                                    ? 'bg-blue-100 text-blue-800'
                                    : 'bg-slate-100 text-slate-700'
                                }`}
                              >
                                {w.status}
                              </span>
                            </td>
                            <td className="p-3 font-mono font-bold text-slate-800">
                              {(w.actualQuantity && w.plannedQuantity)
                                ? Math.round((w.actualQuantity / w.plannedQuantity) * 100)
                                : (w.status === 'Completed' ? 100 : 0)}%
                            </td>
                            <td className="p-3 text-slate-600">{w.dueDate || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB: PRODUCTION ANALYTICS (Department-Scoped View - Locked to Current Department) */}
          {activeTab === 'production_analytics' && (
            <ProductionAnalyticsView
              userProfile={userProfile}
              departmentName={departmentName}
              isDepartmentLocked={true}
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

          {/* TAB: DAILY UPDATES */}
          {activeTab === 'daily_updates' && (
            <DepartmentDailyUpdatesView
              departmentName={departmentName}
              machines={machines}
            />
          )}

          {/* TAB: BACKLOG MANAGEMENT (Requirement 9) */}
          {activeTab === 'backlog' && (
            <BacklogManagementView
              departmentName={departmentName}
              machines={sizeFilteredMachines}
              onOpenDailyUpdate={() => setActiveTab('daily_updates')}
            />
          )}

          {/* TAB: MY WORK / PENDING / COMPLETED / DELAYED / WORK ALLOCATION */}
          {(activeTab === 'my_work' ||
            activeTab === 'work_allocation' ||
            activeTab === 'pending_work' ||
            activeTab === 'completed_work' ||
            activeTab === 'delayed_work') && (
            <DepartmentWorkView
              departments={departments}
              departmentWork={sizeFilteredWork}
              handovers={sizeFilteredHandovers}
              machines={sizeFilteredMachines}
              onOpenQuickUpdate={onOpenQuickUpdate}
              onOpenExcelImport={() => onOpenExcelImport('department_work')}
            />
          )}

          {/* TAB: INCOMING / OUTGOING / SHOP HANDOVERS */}
          {(activeTab === 'incoming_handovers' ||
            activeTab === 'outgoing_handovers' ||
            activeTab === 'handover') && (
            <DepartmentHandoversView
              currentDepartment={departmentName}
              departments={departments}
              machines={sizeFilteredMachines}
              handovers={sizeFilteredHandovers}
              initialTab={
                activeTab === 'outgoing_handovers'
                  ? 'outgoing'
                  : 'incoming'
              }
            />
          )}

          {/* TAB: PLANNED MACHINES / UPCOMING WORK (Admin Excel Plan View with strict permission controls) */}
          {activeTab === 'planned_machines' && (
            <PlannedUpcomingWorkView
              currentDepartment={departmentName}
              departments={departments}
              machines={sizeFilteredMachines}
              monthlyPlans={monthlyPlans.filter(
                (p) =>
                  selectedMachineSize === 'All Sizes' ||
                  (p.machineSize || p.machineModel || '').toLowerCase().includes(selectedMachineSize.toLowerCase())
              )}
              weeklyPlans={weeklyPlans.filter(
                (p) =>
                  selectedMachineSize === 'All Sizes' ||
                  (p.machineSize || p.machineModel || '').toLowerCase().includes(selectedMachineSize.toLowerCase())
              )}
              handovers={sizeFilteredHandovers}
              onOpenMachineDetail={(m) => setSelectedMachine(m)}
              onNavigateToWork={() => setActiveTab('my_work')}
            />
          )}

          {/* TAB: NOTIFICATION CENTER */}
          {activeTab === 'notifications' && (
            <DepartmentNotificationCenter
              departmentName={departmentName}
              notifications={notifications}
              onNavigateToTab={(tab) => setActiveTab(tab)}
            />
          )}

          {/* TAB: WEEKLY / MONTHLY PLAN / YEARLY PLAN / PLAN VS ACTUAL */}
          {(activeTab === 'weekly_plan' ||
            activeTab === 'monthly_plan' ||
            activeTab === 'yearly_plan' ||
            activeTab === 'plan_vs_actual') && (
            <PlanningView
              departments={departments}
              yearlyPlans={yearlyPlans.filter((p) => isDepartmentMatch(p.department, departmentName))}
              monthlyPlans={scopedMonthly}
              weeklyPlans={scopedWeekly}
              machines={machines}
              initialTab={
                activeTab === 'weekly_plan'
                  ? 'weekly'
                  : activeTab === 'yearly_plan'
                  ? 'yearly'
                  : activeTab === 'plan_vs_actual'
                  ? 'plan_vs_actual'
                  : 'monthly'
              }
              onOpenExcelImport={() => onOpenExcelImport('planning')}
            />
          )}

          {/* TAB: ROADMAP (Planning Module 2) */}
          {activeTab === 'roadmap' && (
            <RoadmapTimelineView
              roadmapItems={roadmapItems}
              machines={machines}
              departments={departments}
            />
          )}

          {/* TAB: ACCESSORIES ORDERS (Planning Module 10) */}
          {activeTab === 'accessories_orders' && (
            <AccessoriesOrderModule
              machines={machines}
              currentDepartment={departmentName}
              isAdmin={isAdmin}
              isPlanning={isPlanningDept}
            />
          )}

          {/* TAB: OPEN CABLE ORDERS (Planning Module 11) */}
          {activeTab === 'open_cable_orders' && (
            <OpenCableOrderModule
              machines={machines}
              currentDepartment={departmentName}
              isAdmin={isAdmin}
              isPlanning={isPlanningDept}
            />
          )}

          {/* TAB: EXCEL IMPORT (Planning Module 12) */}
          {activeTab === 'excel_import' && (
            <div className="space-y-6">
              <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
                  <div>
                    <h2 className="text-xl font-black text-slate-900">Planning Excel Import & Bulk Sync</h2>
                    <p className="text-xs text-slate-500 mt-1">
                      Upload production plans, machine schedules, or departmental task lists directly from Excel spreadsheets (.xlsx, .xls).
                    </p>
                  </div>
                  <button
                    onClick={() => onOpenExcelImport('planning')}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl shadow-xs transition flex items-center space-x-2 self-start sm:self-auto"
                  >
                    <FileSpreadsheet className="w-4 h-4" />
                    <span>Open Excel Importer</span>
                  </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-slate-100">
                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                    <h4 className="text-xs font-bold text-slate-800">Monthly &amp; Weekly Plans</h4>
                    <p className="text-[11px] text-slate-500 mt-1">Upload plant-wide target schedules per machine and month.</p>
                    <button
                      onClick={() => onOpenExcelImport('planning')}
                      className="mt-3 text-xs font-bold text-blue-600 hover:text-blue-700 block"
                    >
                      Import Plans &rarr;
                    </button>
                  </div>
                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                    <h4 className="text-xs font-bold text-slate-800">Machine Plans &amp; Shop Floor</h4>
                    <p className="text-[11px] text-slate-500 mt-1">Batch import new machine numbers and project codes.</p>
                    <button
                      onClick={() => onOpenExcelImport('machines')}
                      className="mt-3 text-xs font-bold text-blue-600 hover:text-blue-700 block"
                    >
                      Import Machines &rarr;
                    </button>
                  </div>
                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                    <h4 className="text-xs font-bold text-slate-800">Department Work Tasks</h4>
                    <p className="text-[11px] text-slate-500 mt-1">Bulk upload assigned work operations and target completion dates.</p>
                    <button
                      onClick={() => onOpenExcelImport('department_work')}
                      className="mt-3 text-xs font-bold text-blue-600 hover:text-blue-700 block"
                    >
                      Import Work &rarr;
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB: QUALITY HANDOVER & RECEIVING */}
          {activeTab === 'quality_handover' && (
            <QualityHandoverModule
              currentDepartment={departmentName}
              departments={departments}
              machines={machines}
              isQualityView={isQualityDept}
            />
          )}

          {/* TAB: QUALITY OPS / TODAY INSPECTION / REJECTIONS */}
          {(activeTab === 'quality_ops' ||
            activeTab === 'today_inspection' ||
            activeTab === 'rejections') && (
            <QualityView
              machines={machines}
              operations={qualityOps}
              dailyChecks={qualityChecks}
              rejections={scopedRejections}
              initialTab={
                activeTab === 'quality_ops'
                  ? 'operations'
                  : activeTab === 'rejections'
                  ? 'rejections'
                  : 'checklist'
              }
              onOpenExcelImport={() => onOpenExcelImport('quality_ops')}
            />
          )}

          {/* TAB: REPORTS */}
          {activeTab === 'reports' && (
            <ReportsView
              departments={departments}
              machines={machines}
              monthlyPlans={scopedMonthly}
              departmentWork={scopedWork}
              qualityChecks={qualityChecks}
              qualityRejections={scopedRejections}
            />
          )}

          {/* TAB: MIS */}
          {activeTab === 'mis' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                    {departmentName} MIS Report
                  </h2>
                  <p className="text-xs sm:text-sm text-slate-500">
                    Generate and download department presentation deck (.pptx)
                  </p>
                </div>
                <button
                  onClick={handleDownloadMisPpt}
                  disabled={generatingPpt}
                  className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-md shadow-blue-600/20 flex items-center space-x-2 transition disabled:opacity-50"
                >
                  <Download className="w-4 h-4" />
                  <span>{generatingPpt ? 'Generating Deck...' : 'Download Department MIS PPT'}</span>
                </button>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4 shadow-xs">
                <h3 className="text-sm font-bold text-slate-800">
                  Department Operational Metrics Export
                </h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  The PowerPoint deck is generated purely from live database records for {departmentName}, including task completions, milestone targets, delayed reasons, and quality results.
                </p>
              </div>
            </div>
          )}

          {/* TAB: SHOP FLOOR & MACHINE-WISE MONITORING */}
          {activeTab === 'shop_floor' && (
            <ShopFloorMachineMonitoringView
              currentDepartment={departmentName}
              departments={departments}
              machines={machines}
              handovers={handovers}
              monthlyPlans={monthlyPlans}
              weeklyPlans={weeklyPlans}
              departmentWork={departmentWork}
              qualityChecks={qualityChecks}
              qualityRejections={qualityRejections}
              onOpenMachineDetail={(m) => setSelectedMachine(m)}
              initialMonth={selectedMonth}
              initialFilter={shopFloorKpiFilter}
            />
          )}

          {/* TAB: DEPARTMENT OPERATION LOTS */}
          {activeTab === 'operation_lots' && (
            <DepartmentOperationLotsView
              departmentName={departmentName}
              machines={machines}
            />
          )}

          {/* TAB: DEPARTMENT OPERATION MASTER (DYNAMIC MACHINE-SIZE-WISE MASTER) */}
          {activeTab === 'operation_master' && (
            <DepartmentOperationMasterView departmentName={departmentName} />
          )}

          {/* TAB: MACHINE MONITORING MATRIX / DEPARTMENT MONITORING */}
          {(activeTab === 'machine_monitoring' || activeTab === 'department_monitoring') && (
            <AdminDepartmentMonitoringView
              selectedDepartment={departmentName}
              onSelectDepartment={() => {}}
              machines={machines}
              departmentWork={departmentWork}
              handovers={handovers}
              qualityChecks={qualityChecks}
              qualityRejections={qualityRejections}
              qualityOps={qualityOps}
              monthlyPlans={monthlyPlans}
              weeklyPlans={weeklyPlans}
              onOpenMachineDetail={(m) => setSelectedMachine(m)}
            />
          )}

          {/* TAB: DOCUMENTS */}
          {activeTab === 'documents' && (
            <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4 shadow-xs">
              <h3 className="text-sm font-bold text-slate-800">
                {departmentName} Document Vault
              </h3>
              <p className="text-xs text-slate-500">
                Balloon drawings, technical specifications, process sheets, and shared inspection drawings.
              </p>
              <div className="p-8 text-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-xl">
                No documents currently shared for {departmentName}. Upload drawings via Machine Master.
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Deep-Dive Machine Monitoring Modal */}
      {selectedMachine && (
        <MachineDetailModal
          isOpen={true}
          onClose={() => setSelectedMachine(null)}
          machine={selectedMachine}
          departmentWork={departmentWork}
          handovers={handovers}
          qualityChecks={qualityChecks}
          qualityRejections={qualityRejections}
          qualityOps={qualityOps}
          machineDocs={machineDocs}
        />
      )}

      {/* Request Design Support Modal for other departments */}
      {isDesignRequestModalOpen && (
        <RequestDesignSupportModal
          isOpen={isDesignRequestModalOpen}
          onClose={() => setIsDesignRequestModalOpen(false)}
          currentDepartment={departmentName}
          userProfile={userProfile}
          machines={machines}
        />
      )}
    </div>
  );
};
