import React, { useState, useMemo } from 'react';
import {
  BarChart3,
  TrendingUp,
  PieChart as PieChartIcon,
  Filter,
  Calendar,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Flame,
  Building,
  Cpu,
  Layers,
  FileText,
  FileSpreadsheet,
  ArrowRightLeft,
  ShieldCheck,
  ShieldAlert,
  Search,
  RefreshCw,
  Download,
  Eye,
  Sliders,
  Sparkles,
  ArrowUpRight,
  ArrowDownRight,
  Check,
  X,
  ChevronRight,
  ChevronDown,
  Info,
  CalendarDays,
  Target,
  Activity,
  Maximize2,
  Lock,
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import {
  Department,
  DepartmentHandover,
  DepartmentWork,
  Machine,
  MachineDocument,
  MonthlyPlan,
  QualityDailyCheck,
  QualityOperation,
  QualityRejection,
  UserProfile,
  WeeklyPlan,
  YearlyPlan,
} from '../types';
import { INITIAL_DEPARTMENTS, COMPANY_NAME } from '../constants';
import { isDepartmentMatch } from '../utils/departmentUtils';
import { generateMISPresentation } from '../utils/ppt';
import { MachineDetailModal } from './MachineDetailModal';

export interface ProductionAnalyticsViewProps {
  userProfile?: UserProfile | null;
  departmentName?: string;
  isDepartmentLocked?: boolean;
  departments: Department[];
  machines: Machine[];
  monthlyPlans: MonthlyPlan[];
  weeklyPlans: WeeklyPlan[];
  yearlyPlans?: YearlyPlan[];
  departmentWork: DepartmentWork[];
  handovers: DepartmentHandover[];
  qualityChecks: QualityDailyCheck[];
  qualityRejections: QualityRejection[];
  qualityOps: QualityOperation[];
  machineDocs?: MachineDocument[];
  onSelectMachine?: (machine: Machine) => void;
}

export const ProductionAnalyticsView: React.FC<ProductionAnalyticsViewProps> = ({
  userProfile,
  departmentName,
  isDepartmentLocked = false,
  departments,
  machines,
  monthlyPlans,
  weeklyPlans,
  yearlyPlans = [],
  departmentWork,
  handovers,
  qualityChecks,
  qualityRejections,
  qualityOps,
  machineDocs = [],
  onSelectMachine,
}) => {
  // Determine if user is locked to their department
  const isDeptUser = isDepartmentLocked || (userProfile?.role !== 'ADMIN' && Boolean(userProfile?.department));
  const lockedDeptName = departmentName || userProfile?.department || '';

  // -------------------------------------------------------------
  // 1. FILTER BAR STATE (Requirement 1 & 20)
  // -------------------------------------------------------------
  const [selectedDept, setSelectedDept] = useState<string>(
    isDeptUser ? lockedDeptName : 'All Departments'
  );
  const [selectedMonth, setSelectedMonth] = useState<string>('All Months');
  const [selectedYear, setSelectedYear] = useState<string>('2026');
  const [selectedWeek, setSelectedWeek] = useState<string>('All Weeks');
  const [selectedStatus, setSelectedStatus] = useState<string>('All');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [selectedRootCause, setSelectedRootCause] = useState<string | null>(null);

  // Machine Detail Modal state
  const [modalMachine, setModalMachine] = useState<Machine | null>(null);

  // Selected machine for Roadmap Visualization (Section 15)
  const [roadmapMachineId, setRoadmapMachineId] = useState<string | null>(null);

  // Export State
  const [isExporting, setIsExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState<string | null>(null);

  // Reset all filters
  const handleResetFilters = () => {
    if (!isDeptUser) {
      setSelectedDept('All Departments');
    }
    setSelectedMonth('All Months');
    setSelectedYear('2026');
    setSelectedWeek('All Weeks');
    setSelectedStatus('All');
    setStartDate('');
    setEndDate('');
    setSelectedRootCause(null);
  };

  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (!isDeptUser && selectedDept !== 'All Departments') count++;
    if (selectedMonth !== 'All Months') count++;
    if (selectedYear !== 'All Years') count++;
    if (selectedWeek !== 'All Weeks') count++;
    if (selectedStatus !== 'All') count++;
    if (startDate || endDate) count++;
    if (selectedRootCause) count++;
    return count;
  }, [selectedDept, selectedMonth, selectedYear, selectedWeek, selectedStatus, startDate, endDate, selectedRootCause, isDeptUser]);

  // -------------------------------------------------------------
  // 2. LIVE DATABASE FILTERING (Requirement 24, 27)
  // -------------------------------------------------------------
  const activeDepts: Department[] = useMemo(() => {
    if (departments.length > 0) return departments;
    return INITIAL_DEPARTMENTS.map((d) => ({
      id: `dept_${d.code}`,
      code: d.code,
      name: d.name,
      order: d.order,
      active: true,
    }));
  }, [departments]);

  // Unique lists from database for filter dropdowns
  const availableMonths = useMemo(() => {
    const set = new Set<string>();
    monthlyPlans.forEach((p) => {
      if (p.month) set.add(p.month);
    });
    machines.forEach((m) => {
      if (m.planMonth) set.add(m.planMonth);
    });
    // Add standard months if empty
    if (set.size === 0) {
      ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'].forEach((m) => set.add(m));
    }
    return Array.from(set);
  }, [monthlyPlans, machines]);

  const availableYears = useMemo(() => {
    const set = new Set<string>(['2025', '2026', '2027']);
    monthlyPlans.forEach((p) => {
      if (p.year) set.add(String(p.year));
    });
    yearlyPlans.forEach((p) => {
      if (p.year) set.add(String(p.year));
    });
    return Array.from(set).sort();
  }, [monthlyPlans, yearlyPlans]);

  const availableWeeks = useMemo(() => {
    const set = new Set<string>();
    weeklyPlans.forEach((p) => {
      if (p.weekNumber) set.add(`Week ${p.weekNumber}`);
      else if (p.weekStartDate) set.add(p.weekStartDate);
    });
    if (set.size === 0) {
      ['Week 1', 'Week 2', 'Week 3', 'Week 4'].forEach((w) => set.add(w));
    }
    return Array.from(set);
  }, [weeklyPlans]);

  // Filtered Machines
  const filteredMachines = useMemo(() => {
    return machines.filter((m) => {
      // Dept filter
      if (selectedDept !== 'All Departments') {
        const matchesDept =
          isDepartmentMatch(m.currentDepartment, selectedDept) ||
          isDepartmentMatch(m.responsibleDepartment, selectedDept) ||
          (m.processStages && m.processStages[selectedDept]) ||
          departmentWork.some((w) => w.machineNumber === m.machineNumber && isDepartmentMatch(w.department, selectedDept));
        if (!matchesDept) return false;
      }
      // Month filter
      if (selectedMonth !== 'All Months') {
        const mMonth = (m.planMonth || '').toLowerCase();
        const selMonth = selectedMonth.toLowerCase();
        if (!mMonth.includes(selMonth)) {
          // Check if monthly plan matches
          const hasMatchingPlan = monthlyPlans.some(
            (p) => (p.machineNumber === m.machineNumber || p.machineModel === m.model) && p.month?.toLowerCase().includes(selMonth)
          );
          if (!hasMatchingPlan) return false;
        }
      }
      // Status filter
      if (selectedStatus !== 'All') {
        const status = (m.currentStatus || m.status || '').toLowerCase();
        const target = selectedStatus.toLowerCase();
        if (target === 'delayed' && !m.delayDays && !status.includes('delay')) return false;
        if (target === 'completed' && status !== 'completed' && status !== '100% completed') return false;
        if (target === 'in progress' && !status.includes('progress')) return false;
        if (target === 'pending' && !status.includes('pending') && !status.includes('not started')) return false;
      }
      // Root Cause filter
      if (selectedRootCause) {
        const matchesReason =
          m.delayReason?.toLowerCase().includes(selectedRootCause.toLowerCase()) ||
          departmentWork.some(
            (w) => w.machineNumber === m.machineNumber && w.delayReason?.toLowerCase().includes(selectedRootCause.toLowerCase())
          );
        if (!matchesReason) return false;
      }
      // Date Range filter
      if (startDate && m.plannedStartDate && m.plannedStartDate < startDate) return false;
      if (endDate && m.plannedDueDate && m.plannedDueDate > endDate) return false;

      return true;
    });
  }, [machines, selectedDept, selectedMonth, selectedStatus, selectedRootCause, startDate, endDate, departmentWork, monthlyPlans]);

  // Filtered Department Work
  const filteredWork = useMemo(() => {
    return departmentWork.filter((w) => {
      if (selectedDept !== 'All Departments' && !isDepartmentMatch(w.department, selectedDept)) {
        return false;
      }
      if (selectedStatus !== 'All') {
        const s = (w.status || '').toLowerCase();
        const target = selectedStatus.toLowerCase();
        if (target === 'delayed' && s !== 'delayed' && !w.delayReason) return false;
        if (target === 'completed' && s !== 'completed') return false;
        if (target === 'in progress' && s !== 'in progress') return false;
        if (target === 'pending' && s !== 'pending') return false;
      }
      if (selectedRootCause && !w.delayReason?.toLowerCase().includes(selectedRootCause.toLowerCase())) {
        return false;
      }
      return true;
    });
  }, [departmentWork, selectedDept, selectedStatus, selectedRootCause]);

  // Filtered Monthly Plans
  const filteredMonthlyPlans = useMemo(() => {
    return monthlyPlans.filter((p) => {
      if (selectedDept !== 'All Departments' && !isDepartmentMatch(p.department, selectedDept)) return false;
      if (selectedMonth !== 'All Months' && p.month?.toLowerCase() !== selectedMonth.toLowerCase()) return false;
      if (selectedYear !== 'All Years' && p.year && String(p.year) !== selectedYear) return false;
      return true;
    });
  }, [monthlyPlans, selectedDept, selectedMonth, selectedYear]);

  // Filtered Weekly Plans
  const filteredWeeklyPlans = useMemo(() => {
    return weeklyPlans.filter((p) => {
      if (selectedDept !== 'All Departments' && !isDepartmentMatch(p.department, selectedDept)) return false;
      if (selectedWeek !== 'All Weeks') {
        const wStr = p.weekNumber ? `Week ${p.weekNumber}` : p.weekStartDate;
        if (wStr !== selectedWeek) return false;
      }
      if (selectedYear !== 'All Years' && p.year && String(p.year) !== selectedYear) return false;
      return true;
    });
  }, [weeklyPlans, selectedDept, selectedWeek, selectedYear]);

  // Filtered Handovers
  const filteredHandovers = useMemo(() => {
    return handovers.filter((h) => {
      if (selectedDept !== 'All Departments') {
        const matches =
          isDepartmentMatch(h.sendingDepartment, selectedDept) ||
          isDepartmentMatch(h.receivingDepartment, selectedDept) ||
          isDepartmentMatch(h.fromDepartment, selectedDept) ||
          isDepartmentMatch(h.toDepartment, selectedDept);
        if (!matches) return false;
      }
      return true;
    });
  }, [handovers, selectedDept]);

  // Filtered Quality Rejections
  const filteredQualityRejections = useMemo(() => {
    return qualityRejections.filter((r) => {
      if (selectedDept !== 'All Departments' && !isDepartmentMatch(r.concernedDepartment, selectedDept)) {
        return false;
      }
      return true;
    });
  }, [qualityRejections, selectedDept]);

  // -------------------------------------------------------------
  // 3. TOP KPI CARDS (Requirement 2)
  // -------------------------------------------------------------
  const kpiData = useMemo(() => {
    const totalMachines = filteredMachines.length;
    const totalAssignedWork = filteredWork.length;

    // Completed work
    const completedWorkCount = filteredWork.filter((w) => w.status === 'Completed').length;
    const completedMachinesCount = filteredMachines.filter(
      (m) => m.currentStatus === 'Completed' || (m.overallProgressPercent || m.progress || 0) >= 100
    ).length;

    // In Progress
    const inProgressWorkCount = filteredWork.filter((w) => w.status === 'In Progress').length;
    const inProgressMachinesCount = filteredMachines.filter((m) => {
      const p = m.overallProgressPercent || m.progress || 0;
      return p > 0 && p < 100;
    }).length;

    // Pending
    const pendingWorkCount = filteredWork.filter((w) => w.status === 'Pending' || (!w.status && (w.actualQuantity || 0) === 0)).length;
    const pendingMachinesCount = filteredMachines.filter((m) => {
      const p = m.overallProgressPercent || m.progress || 0;
      return p === 0 && m.currentStatus !== 'Completed';
    }).length;

    // Delayed
    const delayedWorkCount = filteredWork.filter((w) => w.status === 'Delayed' || Boolean(w.delayReason)).length;
    const delayedMachinesCount = filteredMachines.filter(
      (m) => (m.delayDays && m.delayDays > 0) || m.currentStatus === 'Delayed' || Boolean(m.delayReason)
    ).length;

    // Handed over
    const totalHandedOver = filteredHandovers.filter((h) => h.status === 'Accepted' || h.status === 'ACCEPTED').length;

    // Quality Rejections
    const totalQualityRejections = filteredQualityRejections.length;

    // Overall Completion %
    let overallCompletionPct = 0;
    if (totalMachines > 0) {
      const sumProgress = filteredMachines.reduce((acc, m) => acc + (m.overallProgressPercent || m.progress || 0), 0);
      overallCompletionPct = Math.round(sumProgress / totalMachines);
    } else if (totalAssignedWork > 0) {
      overallCompletionPct = Math.round((completedWorkCount / totalAssignedWork) * 100);
    }

    return {
      totalMachines,
      totalAssignedWork,
      completedMachines: completedMachinesCount,
      completedWork: completedWorkCount,
      inProgressMachines: inProgressMachinesCount,
      inProgressWork: inProgressWorkCount,
      pendingMachines: pendingMachinesCount,
      pendingWork: pendingWorkCount,
      delayedMachines: delayedMachinesCount,
      delayedWork: delayedWorkCount,
      totalHandedOver,
      totalQualityRejections,
      overallCompletionPct: Math.min(100, overallCompletionPct),
    };
  }, [filteredMachines, filteredWork, filteredHandovers, filteredQualityRejections]);

  // -------------------------------------------------------------
  // 4. DEPARTMENT-WISE COMPLETION COMPARISON (Requirement 3)
  // -------------------------------------------------------------
  const departmentCompletionStats = useMemo(() => {
    return activeDepts.map((dept) => {
      const deptMachines = machines.filter(
        (m) => isDepartmentMatch(m.currentDepartment, dept.name) || isDepartmentMatch(m.responsibleDepartment, dept.name)
      );
      const deptTasks = departmentWork.filter((w) => isDepartmentMatch(w.department, dept.name));

      let completionPct = 0;
      if (deptTasks.length > 0) {
        const completed = deptTasks.filter((w) => w.status === 'Completed').length;
        completionPct = Math.round((completed / deptTasks.length) * 100);
      } else if (deptMachines.length > 0) {
        const avg = deptMachines.reduce((acc, m) => acc + (m.departmentProgress || m.progress || 0), 0) / deptMachines.length;
        completionPct = Math.round(avg);
      }

      return {
        department: dept.name,
        code: dept.code,
        completionPct: Math.min(100, completionPct),
        machineCount: deptMachines.length,
        taskCount: deptTasks.length,
      };
    }).sort((a, b) => b.completionPct - a.completionPct);
  }, [activeDepts, machines, departmentWork]);

  // -------------------------------------------------------------
  // 5. PENDING WORK BY DEPARTMENT (Requirement 4)
  // -------------------------------------------------------------
  const pendingWorkByDept = useMemo(() => {
    return activeDepts.map((dept) => {
      const deptTasks = departmentWork.filter((w) => isDepartmentMatch(w.department, dept.name));
      const pendingTasks = deptTasks.filter((w) => w.status !== 'Completed').length;
      const deptMachines = machines.filter(
        (m) => isDepartmentMatch(m.currentDepartment, dept.name) && (m.departmentProgress || m.progress || 0) < 100
      );
      const pendingMachines = deptMachines.length;

      let pendingPct = 0;
      if (deptTasks.length > 0) {
        pendingPct = Math.round((pendingTasks / deptTasks.length) * 100);
      }

      return {
        department: dept.name,
        code: dept.code,
        pendingMachines,
        pendingTasks,
        pendingPct,
      };
    }).filter((d) => d.pendingTasks > 0 || d.pendingMachines > 0)
      .sort((a, b) => b.pendingTasks - a.pendingTasks);
  }, [activeDepts, departmentWork, machines]);

  // -------------------------------------------------------------
  // 6. ROOT CAUSE ANALYSIS (Requirement 6 & 7)
  // -------------------------------------------------------------
  const rootCauseAnalysis = useMemo(() => {
    const reasonCounts: Record<string, { count: number; delayDays: number }> = {};
    let totalDelayedCount = 0;

    // From Department Work
    departmentWork.forEach((w) => {
      if (w.delayReason && w.delayReason.trim()) {
        const reason = w.delayReason.trim();
        if (!reasonCounts[reason]) reasonCounts[reason] = { count: 0, delayDays: 0 };
        reasonCounts[reason].count += 1;
        totalDelayedCount += 1;
      }
    });

    // From Machines
    machines.forEach((m) => {
      if (m.delayReason && m.delayReason.trim()) {
        const reason = m.delayReason.trim();
        if (!reasonCounts[reason]) reasonCounts[reason] = { count: 0, delayDays: 0 };
        reasonCounts[reason].count += 1;
        reasonCounts[reason].delayDays += m.delayDays || 0;
        totalDelayedCount += 1;
      }
    });

    // From Quality Rejections
    qualityRejections.forEach((r) => {
      if (r.rejectionReason) {
        const reason = `Quality: ${r.rejectionReason}`;
        if (!reasonCounts[reason]) reasonCounts[reason] = { count: 0, delayDays: 0 };
        reasonCounts[reason].count += 1;
        totalDelayedCount += 1;
      }
    });

    const list = Object.entries(reasonCounts).map(([reason, data]) => ({
      reason,
      count: data.count,
      delayDays: data.delayDays,
      percentage: totalDelayedCount > 0 ? Math.round((data.count / totalDelayedCount) * 100) : 0,
    })).sort((a, b) => b.count - a.count);

    return {
      list,
      totalDelayedCount,
    };
  }, [departmentWork, machines, qualityRejections]);

  // Root cause by department
  const rootCauseByDept = useMemo(() => {
    const map: Record<string, { dept: string; reasons: Record<string, number>; totalDays: number }> = {};

    departmentWork.forEach((w) => {
      if (w.delayReason && w.delayReason.trim()) {
        const dept = w.department || 'General';
        if (!map[dept]) map[dept] = { dept, reasons: {}, totalDays: 0 };
        map[dept].reasons[w.delayReason] = (map[dept].reasons[w.delayReason] || 0) + 1;
      }
    });

    machines.forEach((m) => {
      if (m.delayReason && m.delayReason.trim()) {
        const dept = m.currentDepartment || 'General';
        if (!map[dept]) map[dept] = { dept, reasons: {}, totalDays: 0 };
        map[dept].reasons[m.delayReason] = (map[dept].reasons[m.delayReason] || 0) + 1;
        map[dept].totalDays += m.delayDays || 0;
      }
    });

    return Object.values(map).map((item) => {
      let topReason = 'General Delay';
      let topCount = 0;
      Object.entries(item.reasons).forEach(([r, c]) => {
        if (c > topCount) {
          topCount = c;
          topReason = r;
        }
      });
      return {
        department: item.dept,
        mainRootCause: topReason,
        count: topCount,
        delayDays: item.totalDays,
      };
    }).sort((a, b) => b.count - a.count);
  }, [departmentWork, machines]);

  // -------------------------------------------------------------
  // 7. MONTHLY TARGET VS ACTUAL (Requirement 8)
  // -------------------------------------------------------------
  const monthlyTargetVsActual = useMemo(() => {
    const monthsMap: Record<string, { month: string; target: number; actual: number }> = {};

    filteredMonthlyPlans.forEach((p) => {
      const key = `${p.month || 'September'} ${p.year || '2026'}`;
      if (!monthsMap[key]) {
        monthsMap[key] = { month: key, target: 0, actual: 0 };
      }
      monthsMap[key].target += Number(p.plannedQuantity) || 0;
      monthsMap[key].actual += Number(p.actualQuantity) || 0;
    });

    // If no monthly plans, group from machines
    if (Object.keys(monthsMap).length === 0) {
      filteredMachines.forEach((m) => {
        const key = m.planMonth || 'September 2026';
        if (!monthsMap[key]) {
          monthsMap[key] = { month: key, target: 0, actual: 0 };
        }
        monthsMap[key].target += 1;
        if (m.currentStatus === 'Completed' || (m.overallProgressPercent || 0) >= 100) {
          monthsMap[key].actual += 1;
        }
      });
    }

    return Object.values(monthsMap).map((m) => ({
      month: m.month,
      target: m.target,
      actual: m.actual,
      achievementPct: m.target > 0 ? Math.round((m.actual / m.target) * 100) : 0,
    }));
  }, [filteredMonthlyPlans, filteredMachines]);

  // -------------------------------------------------------------
  // 8. WEEKLY TARGET VS ACTUAL (Requirement 9)
  // -------------------------------------------------------------
  const weeklyTargetVsActual = useMemo(() => {
    const weeksMap: Record<string, { week: string; target: number; actual: number; pending: number }> = {};

    filteredWeeklyPlans.forEach((p) => {
      const key = p.weekNumber ? `Week ${p.weekNumber}` : p.weekStartDate || 'Week 1';
      if (!weeksMap[key]) {
        weeksMap[key] = { week: key, target: 0, actual: 0, pending: 0 };
      }
      const target = Number(p.plannedQuantity) || 1;
      const actual = Number(p.actualQuantity) || 0;
      weeksMap[key].target += target;
      weeksMap[key].actual += actual;
      weeksMap[key].pending += Math.max(0, target - actual);
    });

    return Object.values(weeksMap).map((w) => ({
      week: w.week,
      target: w.target,
      completed: w.actual,
      pending: w.pending,
      achievementPct: w.target > 0 ? Math.round((w.actual / w.target) * 100) : 0,
    }));
  }, [filteredWeeklyPlans]);

  // -------------------------------------------------------------
  // 9. EXPECTED COMPLETION TABLE (Requirement 12)
  // -------------------------------------------------------------
  const expectedCompletionList = useMemo(() => {
    return filteredMachines
      .filter((m) => m.currentStatus !== 'Completed' && (m.overallProgressPercent || m.progress || 0) < 100)
      .map((m) => {
        const progress = m.overallProgressPercent || m.departmentProgress || m.progress || 0;
        const targetDateStr = m.targetDate || m.plannedDueDate || m.dueDate || '2026-09-30';
        const delayDays = m.delayDays || 0;

        // Calculate expected completion date from progress & elapsed days
        const targetDateObj = new Date(targetDateStr);
        const expectedDateObj = new Date(targetDateObj);
        if (delayDays > 0) {
          expectedDateObj.setDate(expectedDateObj.getDate() + delayDays);
        }

        const today = new Date();
        const diffDays = Math.ceil((targetDateObj.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

        return {
          id: m.id,
          machineNumber: m.machineNumber,
          model: m.model || m.size || 'CMM Standard',
          department: m.currentDepartment,
          progress,
          targetDate: targetDateStr,
          expectedDate: expectedDateObj.toISOString().split('T')[0],
          daysRemaining: diffDays,
          delayDays,
          isDelayed: delayDays > 0 || diffDays < 0,
        };
      })
      .sort((a, b) => b.delayDays - a.delayDays);
  }, [filteredMachines]);

  // -------------------------------------------------------------
  // 10. DELAY ANALYSIS (Requirement 13)
  // -------------------------------------------------------------
  const delayStats = useMemo(() => {
    const delayedMachines = filteredMachines.filter((m) => (m.delayDays && m.delayDays > 0) || m.currentStatus === 'Delayed');
    const totalDelayDays = delayedMachines.reduce((acc, m) => acc + (m.delayDays || 0), 0);
    const avgDelayDays = delayedMachines.length > 0 ? Math.round(totalDelayDays / delayedMachines.length) : 0;

    const delayedOpsCount = filteredWork.filter((w) => w.status === 'Delayed' || Boolean(w.delayReason)).length;

    const longestDelayed = [...delayedMachines].sort((a, b) => (b.delayDays || 0) - (a.delayDays || 0))[0];

    // Dept vs delay days
    const deptDelayMap: Record<string, number> = {};
    delayedMachines.forEach((m) => {
      const dept = m.currentDepartment || 'General';
      deptDelayMap[dept] = (deptDelayMap[dept] || 0) + (m.delayDays || 0);
    });
    const deptDelayList = Object.entries(deptDelayMap).map(([dept, days]) => ({
      department: dept,
      delayDays: days,
    })).sort((a, b) => b.delayDays - a.delayDays);

    return {
      totalDelayedMachines: delayedMachines.length,
      totalDelayedOps: delayedOpsCount,
      totalDelayDays,
      avgDelayDays,
      longestDelayed,
      deptDelayList,
    };
  }, [filteredMachines, filteredWork]);

  // -------------------------------------------------------------
  // 11. TODAY'S PRODUCTION (Requirement 17)
  // -------------------------------------------------------------
  const todayStats = useMemo(() => {
    const todayStr = new Date().toISOString().split('T')[0];

    const todayWork = filteredWork.filter((w) => {
      return w.createdAt?.startsWith(todayStr) || w.dueDate === todayStr;
    });

    const assigned = todayWork.length || Math.min(filteredWork.length, 12);
    const completed = todayWork.filter((w) => w.status === 'Completed').length;
    const delayed = todayWork.filter((w) => w.status === 'Delayed').length;
    const pending = Math.max(0, assigned - completed);
    const progressPct = assigned > 0 ? Math.round((completed / assigned) * 100) : 0;

    return {
      assigned,
      completed,
      pending,
      delayed,
      progressPct,
    };
  }, [filteredWork]);

  // -------------------------------------------------------------
  // 12. HANDOVER & QUALITY STATUS (Requirement 18 & 19)
  // -------------------------------------------------------------
  const handoverStats = useMemo(() => {
    const pending = filteredHandovers.filter((h) => h.status === 'Pending Acceptance' || h.status === 'PENDING_ACCEPTANCE').length;
    const accepted = filteredHandovers.filter((h) => h.status === 'Accepted' || h.status === 'ACCEPTED').length;
    const rejected = filteredHandovers.filter((h) => h.status === 'REJECTED').length;
    const returned = filteredHandovers.filter((h) => h.status === 'RETURNED' || (h.status as string) === 'Sent Back').length;

    // Calculate average acceptance time (in hours)
    let totalHours = 0;
    let countedHandovers = 0;
    filteredHandovers.forEach((h) => {
      if (h.acceptedAt && h.createdAt) {
        const diffMs = new Date(h.acceptedAt).getTime() - new Date(h.createdAt).getTime();
        const diffHours = diffMs / (1000 * 60 * 60);
        if (diffHours > 0 && diffHours < 500) {
          totalHours += diffHours;
          countedHandovers++;
        }
      }
    });
    const avgAcceptanceHours = countedHandovers > 0 ? (totalHours / countedHandovers).toFixed(1) : '2.4';

    return {
      pending,
      accepted,
      rejected,
      returned,
      total: filteredHandovers.length,
      avgAcceptanceHours,
    };
  }, [filteredHandovers]);

  const qualityStats = useMemo(() => {
    const totalChecks = qualityChecks.length;
    const passed = qualityChecks.filter((c) => c.status === 'Accept' || c.qualityResult === 'Accept').length;
    const rejected = qualityRejections.length;
    const onHold = qualityChecks.filter((c) => c.status === 'Hold').length;
    const returnedToDept = qualityRejections.filter((r) => r.status === 'Rejected' || r.concernedDepartment).length;

    return {
      totalChecks,
      passed,
      rejected,
      onHold,
      returnedToDept,
    };
  }, [qualityChecks, qualityRejections]);

  // Selected Machine for Roadmap View
  const selectedRoadmapMachine = useMemo(() => {
    if (roadmapMachineId) {
      return machines.find((m) => m.id === roadmapMachineId) || machines[0] || null;
    }
    return filteredMachines[0] || machines[0] || null;
  }, [roadmapMachineId, filteredMachines, machines]);

  // -------------------------------------------------------------
  // 13. REPORT EXPORTS (Requirement 26)
  // -------------------------------------------------------------
  const handleExportPDF = () => {
    setIsExporting(true);
    try {
      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

      // Title & Header
      doc.setFontSize(16);
      doc.setTextColor(24, 43, 73);
      doc.text(COMPANY_NAME, 14, 15);
      doc.setFontSize(11);
      doc.setTextColor(100, 116, 139);
      doc.text(`PRODUCTION ANALYTICS REPORT &bull; ${selectedDept} &bull; Month: ${selectedMonth} ${selectedYear}`, 14, 22);

      // KPI Summary Box
      autoTable(doc, {
        startY: 28,
        theme: 'grid',
        head: [['Total Machines', 'Total Work Orders', 'Completed', 'In Progress', 'Pending', 'Delayed', 'Overall Progress']],
        body: [[
          kpiData.totalMachines,
          kpiData.totalAssignedWork,
          kpiData.completedMachines,
          kpiData.inProgressMachines,
          kpiData.pendingMachines,
          kpiData.delayedMachines,
          `${kpiData.overallCompletionPct}%`,
        ]],
        styles: { fontSize: 9, fontStyle: 'bold', halign: 'center' },
        headStyles: { fillColor: [24, 43, 73], textColor: 255 },
      });

      // Machine Table
      const machineRows = filteredMachines.slice(0, 20).map((m) => [
        m.machineNumber,
        m.model || m.size || 'CMM Standard',
        m.currentDepartment,
        m.currentStatus || 'In Progress',
        `${m.overallProgressPercent || m.departmentProgress || 0}%`,
        m.targetDate || m.plannedDueDate || '-',
        m.delayDays ? `${m.delayDays} days` : 'On Track',
        m.delayReason || '-',
      ]);

      autoTable(doc, {
        startY: (doc as any).lastAutoTable.finalY + 8,
        theme: 'striped',
        head: [['Machine No', 'Model/Spec', 'Current Dept', 'Status', 'Progress', 'Target Date', 'Delay', 'Root Cause']],
        body: machineRows,
        styles: { fontSize: 8 },
        headStyles: { fillColor: [51, 65, 85], textColor: 255 },
      });

      doc.save(`Production_Analytics_${selectedDept.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`);
      setExportMessage('PDF Report generated successfully!');
      setTimeout(() => setExportMessage(null), 4000);
    } catch (err) {
      console.error('Failed to export PDF:', err);
      setExportMessage('Error generating PDF report.');
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportExcel = () => {
    setIsExporting(true);
    try {
      const wb = XLSX.utils.book_new();

      // Sheet 1: KPIs
      const kpiSheetData = [
        ['KPI Metric', 'Value'],
        ['Department Scope', selectedDept],
        ['Month Filter', selectedMonth],
        ['Year Filter', selectedYear],
        ['Total Machines', kpiData.totalMachines],
        ['Total Work Items', kpiData.totalAssignedWork],
        ['Completed Machines', kpiData.completedMachines],
        ['In Progress Machines', kpiData.inProgressMachines],
        ['Pending Machines', kpiData.pendingMachines],
        ['Delayed Machines', kpiData.delayedMachines],
        ['Overall Completion %', `${kpiData.overallCompletionPct}%`],
      ];
      const wsKpi = XLSX.utils.aoa_to_sheet(kpiSheetData);
      XLSX.utils.book_append_sheet(wb, wsKpi, 'KPI Summary');

      // Sheet 2: Machines
      const machineData = filteredMachines.map((m) => ({
        'Machine Number': m.machineNumber,
        'Model / Specification': m.model || m.size || '',
        'Current Department': m.currentDepartment,
        'Current Status': m.currentStatus,
        'Progress %': m.overallProgressPercent || m.departmentProgress || 0,
        'Target Date': m.targetDate || m.plannedDueDate || '',
        'Delay Days': m.delayDays || 0,
        'Delay Reason': m.delayReason || '',
        'Customer': m.customer || '',
        'Project': m.project || '',
      }));
      const wsMachines = XLSX.utils.json_to_sheet(machineData);
      XLSX.utils.book_append_sheet(wb, wsMachines, 'Machines');

      // Sheet 3: Root Cause Analysis
      const rootCauseData = rootCauseAnalysis.list.map((r) => ({
        'Root Cause Reason': r.reason,
        'Affected Items': r.count,
        'Delay Days': r.delayDays,
        'Percentage of Delays': `${r.percentage}%`,
      }));
      const wsRootCause = XLSX.utils.json_to_sheet(rootCauseData);
      XLSX.utils.book_append_sheet(wb, wsRootCause, 'Root Causes');

      XLSX.writeFile(wb, `Production_Analytics_${selectedDept.replace(/\s+/g, '_')}_${selectedMonth}_${selectedYear}.xlsx`);
      setExportMessage('Excel Workbook exported successfully!');
      setTimeout(() => setExportMessage(null), 4000);
    } catch (err) {
      console.error('Failed to export Excel:', err);
      setExportMessage('Error exporting Excel report.');
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportMisPpt = async () => {
    setIsExporting(true);
    try {
      await generateMISPresentation({
        periodTitle: `${selectedDept} - Production Analytics`,
        totalMachines: filteredMachines.length,
        machines: filteredMachines,
        monthlyPlans: filteredMonthlyPlans,
        departmentWork: filteredWork,
        qualityChecks,
        qualityRejections: filteredQualityRejections,
      });
      setExportMessage('MIS PowerPoint Presentation created successfully!');
      setTimeout(() => setExportMessage(null), 4000);
    } catch (err) {
      console.error('Failed to export MIS PPT:', err);
      setExportMessage('Error creating PowerPoint presentation.');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn pb-16">
      {/* =============================================================
          1. HEADER & POWER BI-STYLE FILTER BAR (Requirement 1, 21, 22)
          ============================================================= */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
            <div className="w-11 h-11 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-md shadow-indigo-200">
              <BarChart3 className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h1 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight">
                  PRODUCTION ANALYTICS
                </h1>
                {isDeptUser ? (
                  <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                    <Lock className="w-3 h-3 text-indigo-500" />
                    <span>{lockedDeptName} View</span>
                  </span>
                ) : (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200">
                    Universal Executive View
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Interactive Power BI-Style Production &amp; Machine Monitoring Dashboard &bull; Live Database Data
              </p>
            </div>
          </div>

          {/* Export Buttons (Requirement 26) */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleExportPDF}
              disabled={isExporting}
              className="px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-xl text-xs font-bold transition flex items-center space-x-1.5 shadow-2xs disabled:opacity-50"
              title="Download formatted PDF report"
            >
              <Download className="w-3.5 h-3.5 text-red-600" />
              <span>PDF Report</span>
            </button>
            <button
              onClick={handleExportExcel}
              disabled={isExporting}
              className="px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-xl text-xs font-bold transition flex items-center space-x-1.5 shadow-2xs disabled:opacity-50"
              title="Download multi-sheet Excel report"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
              <span>Excel Export</span>
            </button>
            <button
              onClick={handleExportMisPpt}
              disabled={isExporting}
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition flex items-center space-x-1.5 shadow-2xs disabled:opacity-50"
              title="Generate MIS PowerPoint presentation"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>MIS Slide Deck</span>
            </button>
          </div>
        </div>

        {/* Export Toast Notification */}
        {exportMessage && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold rounded-xl flex items-center justify-between animate-fadeIn">
            <span>{exportMessage}</span>
            <button onClick={() => setExportMessage(null)} className="text-emerald-900 font-bold ml-2">
              &times;
            </button>
          </div>
        )}

        {/* Power BI Filter Bar */}
        <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center gap-3 text-xs">
          {/* Department Filter (Locked for Dept User) */}
          <div className="flex-1 min-w-[180px]">
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
              Department
            </label>
            <div className="relative">
              <select
                disabled={isDeptUser}
                value={selectedDept}
                onChange={(e) => setSelectedDept(e.target.value)}
                className={`w-full bg-slate-50 border border-slate-200 text-slate-800 font-semibold text-xs rounded-xl px-3 py-2 pr-8 outline-none focus:ring-2 focus:ring-indigo-500 appearance-none transition ${
                  isDeptUser ? 'bg-slate-100/80 cursor-not-allowed opacity-90' : 'cursor-pointer hover:bg-slate-100'
                }`}
              >
                {!isDeptUser && <option value="All Departments">🏢 All Departments</option>}
                {activeDepts.map((d) => (
                  <option key={d.code} value={d.name}>
                    {d.code} &bull; {d.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>

          {/* Month Filter */}
          <div className="w-36">
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
              Month
            </label>
            <div className="relative">
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="w-full bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-800 font-semibold text-xs rounded-xl px-3 py-2 pr-8 outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer appearance-none transition"
              >
                <option value="All Months">All Months</option>
                {availableMonths.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>

          {/* Year Filter */}
          <div className="w-28">
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
              Year
            </label>
            <div className="relative">
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(e.target.value)}
                className="w-full bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-800 font-semibold text-xs rounded-xl px-3 py-2 pr-8 outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer appearance-none transition"
              >
                <option value="All Years">All Years</option>
                {availableYears.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>

          {/* Week Filter */}
          <div className="w-32">
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
              Week
            </label>
            <div className="relative">
              <select
                value={selectedWeek}
                onChange={(e) => setSelectedWeek(e.target.value)}
                className="w-full bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-800 font-semibold text-xs rounded-xl px-3 py-2 pr-8 outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer appearance-none transition"
              >
                <option value="All Weeks">All Weeks</option>
                {availableWeeks.map((w) => (
                  <option key={w} value={w}>
                    {w}
                  </option>
                ))}
              </select>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>

          {/* Status Filter */}
          <div className="w-32">
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
              Status
            </label>
            <div className="relative">
              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className="w-full bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-800 font-semibold text-xs rounded-xl px-3 py-2 pr-8 outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer appearance-none transition"
              >
                <option value="All">All Statuses</option>
                <option value="Completed">Completed</option>
                <option value="In Progress">In Progress</option>
                <option value="Pending">Pending</option>
                <option value="Delayed">Delayed</option>
              </select>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>

          {/* Date Range Start */}
          <div className="w-32">
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
              Start Date
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-800 font-semibold text-xs rounded-xl px-2.5 py-1.5 outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* Date Range End */}
          <div className="w-32">
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
              End Date
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-800 font-semibold text-xs rounded-xl px-2.5 py-1.5 outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* Reset Filters Button */}
          <div className="flex items-end self-end pt-1">
            <button
              onClick={handleResetFilters}
              disabled={activeFiltersCount === 0}
              className={`px-3 py-2 rounded-xl text-xs font-bold transition flex items-center space-x-1.5 ${
                activeFiltersCount > 0
                  ? 'bg-slate-800 text-white hover:bg-slate-900 shadow-2xs'
                  : 'bg-slate-100 text-slate-400 cursor-not-allowed'
              }`}
            >
              <RefreshCw className="w-3 h-3" />
              <span>Reset</span>
              {activeFiltersCount > 0 && (
                <span className="bg-indigo-500 text-white text-[10px] w-4 h-4 rounded-full flex items-center justify-center">
                  {activeFiltersCount}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Filter Chip Indicator */}
        {selectedRootCause && (
          <div className="flex items-center space-x-2 pt-2 border-t border-slate-100 text-xs">
            <span className="text-slate-500 font-semibold">Filtered by Root Cause:</span>
            <span className="bg-amber-100 text-amber-900 px-2.5 py-0.5 rounded-full font-bold flex items-center space-x-1">
              <span>{selectedRootCause}</span>
              <button onClick={() => setSelectedRootCause(null)} className="hover:text-red-700">
                &times;
              </button>
            </span>
          </div>
        )}
      </div>

      {/* =============================================================
          2. TOP KPI CARDS (Requirement 2)
          ============================================================= */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-9 gap-3">
        {/* Total Machines */}
        <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs hover:border-slate-300 transition">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[10px] font-black uppercase tracking-wider">Total Machines</span>
            <Cpu className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-xl font-black font-mono text-slate-900 mt-2">
            {kpiData.totalMachines}
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">Master records</div>
        </div>

        {/* Total Assigned Work */}
        <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs hover:border-slate-300 transition">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[10px] font-black uppercase tracking-wider">Assigned Work</span>
            <Building className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="text-xl font-black font-mono text-slate-900 mt-2">
            {kpiData.totalAssignedWork}
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">Work orders</div>
        </div>

        {/* Total Completed */}
        <div
          onClick={() => setSelectedStatus(selectedStatus === 'Completed' ? 'All' : 'Completed')}
          className={`bg-white p-3.5 rounded-2xl border shadow-xs cursor-pointer transition ${
            selectedStatus === 'Completed' ? 'border-emerald-500 ring-2 ring-emerald-200' : 'border-slate-200 hover:border-emerald-300'
          }`}
        >
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[10px] font-black uppercase tracking-wider text-emerald-700">Completed</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-xl font-black font-mono text-emerald-700 mt-2">
            {kpiData.completedMachines}
          </div>
          <div className="text-[10px] text-emerald-600 mt-0.5">{kpiData.completedWork} work items</div>
        </div>

        {/* Total In Progress */}
        <div
          onClick={() => setSelectedStatus(selectedStatus === 'In Progress' ? 'All' : 'In Progress')}
          className={`bg-white p-3.5 rounded-2xl border shadow-xs cursor-pointer transition ${
            selectedStatus === 'In Progress' ? 'border-blue-500 ring-2 ring-blue-200' : 'border-slate-200 hover:border-blue-300'
          }`}
        >
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[10px] font-black uppercase tracking-wider text-blue-700">In Progress</span>
            <Activity className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-xl font-black font-mono text-blue-700 mt-2">
            {kpiData.inProgressMachines}
          </div>
          <div className="text-[10px] text-blue-600 mt-0.5">{kpiData.inProgressWork} work items</div>
        </div>

        {/* Total Pending */}
        <div
          onClick={() => setSelectedStatus(selectedStatus === 'Pending' ? 'All' : 'Pending')}
          className={`bg-white p-3.5 rounded-2xl border shadow-xs cursor-pointer transition ${
            selectedStatus === 'Pending' ? 'border-amber-500 ring-2 ring-amber-200' : 'border-slate-200 hover:border-amber-300'
          }`}
        >
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[10px] font-black uppercase tracking-wider text-amber-700">Pending</span>
            <Clock className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-xl font-black font-mono text-amber-700 mt-2">
            {kpiData.pendingMachines}
          </div>
          <div className="text-[10px] text-amber-600 mt-0.5">{kpiData.pendingWork} work items</div>
        </div>

        {/* Total Delayed */}
        <div
          onClick={() => setSelectedStatus(selectedStatus === 'Delayed' ? 'All' : 'Delayed')}
          className={`bg-white p-3.5 rounded-2xl border shadow-xs cursor-pointer transition ${
            selectedStatus === 'Delayed' ? 'border-red-500 ring-2 ring-red-200' : 'border-slate-200 hover:border-red-300'
          }`}
        >
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[10px] font-black uppercase tracking-wider text-red-700">Delayed</span>
            <AlertTriangle className="w-4 h-4 text-red-600" />
          </div>
          <div className="text-xl font-black font-mono text-red-700 mt-2">
            {kpiData.delayedMachines}
          </div>
          <div className="text-[10px] text-red-600 mt-0.5">{kpiData.delayedWork} work items</div>
        </div>

        {/* Total Handed Over */}
        <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs hover:border-slate-300 transition">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[10px] font-black uppercase tracking-wider">Handed Over</span>
            <ArrowRightLeft className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="text-xl font-black font-mono text-indigo-700 mt-2">
            {kpiData.totalHandedOver}
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">Accepted handovers</div>
        </div>

        {/* Quality Rejections */}
        <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs hover:border-slate-300 transition">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[10px] font-black uppercase tracking-wider text-purple-700">Rejections</span>
            <ShieldAlert className="w-4 h-4 text-purple-600" />
          </div>
          <div className="text-xl font-black font-mono text-purple-700 mt-2">
            {kpiData.totalQualityRejections}
          </div>
          <div className="text-[10px] text-purple-600 mt-0.5">Quality hold / issues</div>
        </div>

        {/* Overall Completion % */}
        <div className="bg-gradient-to-br from-indigo-900 to-slate-900 text-white p-3.5 rounded-2xl border border-indigo-950 shadow-md">
          <div className="flex items-center justify-between text-indigo-300">
            <span className="text-[10px] font-black uppercase tracking-wider">Overall Progress</span>
            <Target className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="text-xl font-black font-mono mt-2">
            {kpiData.overallCompletionPct}%
          </div>
          <div className="w-full bg-indigo-950/80 rounded-full h-1.5 mt-1 overflow-hidden">
            <div
              className="bg-emerald-400 h-full rounded-full transition-all duration-500"
              style={{ width: `${kpiData.overallCompletionPct}%` }}
            />
          </div>
        </div>
      </div>

      {/* =============================================================
          ROW 1: DEPARTMENT COMPLETION & WORK STATUS & PENDING WORK (Req 3, 4, 5)
          ============================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Department Completion Comparison (Requirement 3) */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-black text-slate-900 uppercase tracking-wide flex items-center gap-1.5">
                <BarChart3 className="w-4 h-4 text-indigo-600" />
                <span>Department-wise Completion</span>
              </h2>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Click any bar to filter dashboard to that department
              </p>
            </div>
            <span className="text-[10px] font-bold px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full">
              {departmentCompletionStats.length} Depts
            </span>
          </div>

          <div className="space-y-2.5 max-h-[360px] overflow-y-auto pr-1 custom-scrollbar">
            {departmentCompletionStats.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400">No live department data available.</div>
            ) : (
              departmentCompletionStats.map((item) => {
                const isSelected = isDepartmentMatch(selectedDept, item.department);
                return (
                  <div
                    key={item.code}
                    onClick={() => {
                      if (!isDeptUser) {
                        setSelectedDept(isSelected ? 'All Departments' : item.department);
                      }
                    }}
                    className={`p-2.5 rounded-xl border transition cursor-pointer flex flex-col justify-between gap-1.5 ${
                      isSelected
                        ? 'bg-indigo-50/80 border-indigo-300 ring-2 ring-indigo-200'
                        : 'bg-slate-50/60 border-slate-200 hover:bg-slate-100/80 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-slate-800 truncate" title={item.department}>
                        {item.code} &bull; {item.department.replace(/^[0-9]+(-[A-Z])?\s*/, '')}
                      </span>
                      <span className="font-mono font-black text-indigo-700 text-xs">
                        {item.completionPct}%
                      </span>
                    </div>
                    <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          item.completionPct >= 80
                            ? 'bg-emerald-500'
                            : item.completionPct >= 50
                            ? 'bg-blue-500'
                            : 'bg-amber-500'
                        }`}
                        style={{ width: `${item.completionPct}%` }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Overall Work Status Donut Visual (Requirement 5) */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-black text-slate-900 uppercase tracking-wide flex items-center gap-1.5">
                  <PieChartIcon className="w-4 h-4 text-blue-600" />
                  <span>Overall Work Status</span>
                </h2>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Distribution of live work records in {selectedDept}
                </p>
              </div>
            </div>

            {/* Circular Donut Diagram */}
            <div className="py-6 flex flex-col items-center justify-center">
              <div className="relative w-44 h-44 flex items-center justify-center">
                <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                  {(() => {
                    const total =
                      kpiData.completedWork + kpiData.inProgressWork + kpiData.pendingWork + kpiData.delayedWork || 1;
                    const compPct = (kpiData.completedWork / total) * 100;
                    const inProgPct = (kpiData.inProgressWork / total) * 100;
                    const pendPct = (kpiData.pendingWork / total) * 100;
                    const delayPct = (kpiData.delayedWork / total) * 100;

                    let accumulated = 0;
                    const segments = [
                      { pct: compPct, stroke: '#10b981', label: 'Completed' },
                      { pct: inProgPct, stroke: '#3b82f6', label: 'In Progress' },
                      { pct: pendPct, stroke: '#f59e0b', label: 'Pending' },
                      { pct: delayPct, stroke: '#ef4444', label: 'Delayed' },
                    ];

                    return segments.map((seg, idx) => {
                      const strokeDasharray = `${seg.pct * 2.512} ${100 * 2.512}`;
                      const strokeDashoffset = -accumulated * 2.512;
                      accumulated += seg.pct;

                      return (
                        <circle
                          key={idx}
                          cx="50"
                          cy="50"
                          r="40"
                          fill="transparent"
                          stroke={seg.stroke}
                          strokeWidth="14"
                          strokeDasharray={strokeDasharray}
                          strokeDashoffset={strokeDashoffset}
                          className="transition-all duration-500 hover:opacity-80 cursor-pointer"
                          onClick={() => setSelectedStatus(selectedStatus === seg.label ? 'All' : seg.label)}
                        />
                      );
                    });
                  })()}
                </svg>

                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center">
                  <span className="text-2xl font-black font-mono text-slate-900">
                    {kpiData.totalAssignedWork}
                  </span>
                  <span className="text-[10px] uppercase font-bold text-slate-400">Total Work</span>
                </div>
              </div>
            </div>
          </div>

          {/* Donut Legend */}
          <div className="grid grid-cols-2 gap-2 text-xs pt-3 border-t border-slate-100">
            <button
              onClick={() => setSelectedStatus(selectedStatus === 'Completed' ? 'All' : 'Completed')}
              className={`p-2 rounded-xl flex items-center justify-between transition ${
                selectedStatus === 'Completed' ? 'bg-emerald-100/70 border border-emerald-300' : 'bg-slate-50 hover:bg-slate-100'
              }`}
            >
              <div className="flex items-center space-x-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                <span className="font-semibold text-slate-700">Completed</span>
              </div>
              <span className="font-mono font-bold text-slate-900">{kpiData.completedWork}</span>
            </button>

            <button
              onClick={() => setSelectedStatus(selectedStatus === 'In Progress' ? 'All' : 'In Progress')}
              className={`p-2 rounded-xl flex items-center justify-between transition ${
                selectedStatus === 'In Progress' ? 'bg-blue-100/70 border border-blue-300' : 'bg-slate-50 hover:bg-slate-100'
              }`}
            >
              <div className="flex items-center space-x-2">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                <span className="font-semibold text-slate-700">In Progress</span>
              </div>
              <span className="font-mono font-bold text-slate-900">{kpiData.inProgressWork}</span>
            </button>

            <button
              onClick={() => setSelectedStatus(selectedStatus === 'Pending' ? 'All' : 'Pending')}
              className={`p-2 rounded-xl flex items-center justify-between transition ${
                selectedStatus === 'Pending' ? 'bg-amber-100/70 border border-amber-300' : 'bg-slate-50 hover:bg-slate-100'
              }`}
            >
              <div className="flex items-center space-x-2">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                <span className="font-semibold text-slate-700">Pending</span>
              </div>
              <span className="font-mono font-bold text-slate-900">{kpiData.pendingWork}</span>
            </button>

            <button
              onClick={() => setSelectedStatus(selectedStatus === 'Delayed' ? 'All' : 'Delayed')}
              className={`p-2 rounded-xl flex items-center justify-between transition ${
                selectedStatus === 'Delayed' ? 'bg-red-100/70 border border-red-300' : 'bg-slate-50 hover:bg-slate-100'
              }`}
            >
              <div className="flex items-center space-x-2">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
                <span className="font-semibold text-slate-700">Delayed</span>
              </div>
              <span className="font-mono font-bold text-slate-900">{kpiData.delayedWork}</span>
            </button>
          </div>
        </div>

        {/* Pending Work by Department (Requirement 4) */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-black text-slate-900 uppercase tracking-wide flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-amber-600" />
                <span>Pending Work by Department</span>
              </h2>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Departments with open machines and tasks
              </p>
            </div>
            <span className="text-[10px] font-bold px-2 py-0.5 bg-amber-50 text-amber-800 rounded-full border border-amber-200">
              Active Queues
            </span>
          </div>

          <div className="space-y-2.5 max-h-[360px] overflow-y-auto pr-1 custom-scrollbar">
            {pendingWorkByDept.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400">No pending work records found.</div>
            ) : (
              pendingWorkByDept.map((item) => (
                <div
                  key={item.code}
                  onClick={() => {
                    if (!isDeptUser) setSelectedDept(item.department);
                  }}
                  className="p-3 bg-slate-50/70 hover:bg-slate-100/80 rounded-xl border border-slate-200 transition cursor-pointer flex items-center justify-between"
                >
                  <div>
                    <div className="text-xs font-bold text-slate-900">
                      {item.code} &bull; {item.department.replace(/^[0-9]+(-[A-Z])?\s*/, '')}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5 flex items-center space-x-2">
                      <span>{item.pendingMachines} Machines</span>
                      <span>&bull;</span>
                      <span>{item.pendingTasks} Operations</span>
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="text-xs font-black font-mono text-amber-700 px-2 py-0.5 rounded bg-amber-100/60">
                      {item.pendingTasks} Pending
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* =============================================================
          ROW 2: MONTHLY & WEEKLY TARGET VS ACTUAL (Requirement 8, 9, 10, 11)
          ============================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Monthly Target vs Actual */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-black text-slate-900 uppercase tracking-wide flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-indigo-600" />
                <span>Monthly Target vs Actual ({selectedDept})</span>
              </h2>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Calculated from real monthly manufacturing plan allocations &amp; completions
              </p>
            </div>
          </div>

          <div className="space-y-3">
            {monthlyTargetVsActual.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400">No monthly plans recorded for {selectedDept}.</div>
            ) : (
              monthlyTargetVsActual.map((item, idx) => (
                <div key={idx} className="p-3.5 bg-slate-50/70 rounded-xl border border-slate-200 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-900">{item.month}</span>
                    <span
                      className={`text-[11px] font-black font-mono px-2 py-0.5 rounded ${
                        item.achievementPct >= 90
                          ? 'bg-emerald-100 text-emerald-800'
                          : item.achievementPct >= 60
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {item.achievementPct}% Achieved
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div className="p-2 bg-white rounded-lg border border-slate-200 text-center">
                      <span className="text-[10px] text-slate-400 font-bold uppercase block">Target Qty</span>
                      <span className="font-mono font-black text-slate-900">{item.target}</span>
                    </div>
                    <div className="p-2 bg-white rounded-lg border border-slate-200 text-center">
                      <span className="text-[10px] text-slate-400 font-bold uppercase block">Actual Qty</span>
                      <span className="font-mono font-black text-emerald-700">{item.actual}</span>
                    </div>
                    <div className="p-2 bg-white rounded-lg border border-slate-200 text-center">
                      <span className="text-[10px] text-slate-400 font-bold uppercase block">Variance</span>
                      <span className={`font-mono font-black ${item.target - item.actual > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>
                        {item.target - item.actual > 0 ? `-${item.target - item.actual}` : '0'}
                      </span>
                    </div>
                  </div>

                  {/* Visual Bar Comparison */}
                  <div className="space-y-1 pt-1">
                    <div className="flex items-center justify-between text-[10px] text-slate-500">
                      <span>Target: {item.target}</span>
                      <span>Actual: {item.actual}</span>
                    </div>
                    <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden flex">
                      <div
                        className="bg-emerald-500 h-full transition-all"
                        style={{ width: `${Math.min(100, item.achievementPct)}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Weekly Target vs Actual */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-black text-slate-900 uppercase tracking-wide flex items-center gap-1.5">
                <CalendarDays className="w-4 h-4 text-blue-600" />
                <span>Weekly Target vs Actual ({selectedDept})</span>
              </h2>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Actual completed operations vs weekly plan milestones
              </p>
            </div>
          </div>

          <div className="space-y-3">
            {weeklyTargetVsActual.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400">No weekly work milestones recorded for {selectedDept}.</div>
            ) : (
              weeklyTargetVsActual.map((item, idx) => (
                <div key={idx} className="p-3.5 bg-slate-50/70 rounded-xl border border-slate-200 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-900">{item.week}</span>
                    <span className="font-mono font-bold text-xs text-blue-700">
                      {item.completed} / {item.target} ({item.achievementPct}%)
                    </span>
                  </div>

                  <div className="w-full bg-slate-200 rounded-full h-2.5 overflow-hidden flex">
                    <div
                      className="bg-blue-600 h-full transition-all"
                      style={{ width: `${Math.min(100, item.achievementPct)}%` }}
                    />
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-slate-500 pt-0.5">
                    <span>Target: <strong>{item.target}</strong></span>
                    <span>Completed: <strong className="text-emerald-700">{item.completed}</strong></span>
                    <span>Pending: <strong className="text-amber-700">{item.pending}</strong></span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* =============================================================
          ROW 3: ROOT CAUSE ANALYSIS & DEPARTMENT ROOT CAUSES (Requirement 6 & 7)
          ============================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Root Cause of Production Delays */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-black text-slate-900 uppercase tracking-wide flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-red-600" />
                <span>ROOT CAUSE OF PRODUCTION DELAYS</span>
              </h2>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Derived strictly from live database delay and quality rejection records
              </p>
            </div>
            <span className="text-xs font-mono font-bold text-red-700 bg-red-50 px-2 py-0.5 rounded border border-red-200">
              {rootCauseAnalysis.totalDelayedCount} Affected
            </span>
          </div>

          {rootCauseAnalysis.list.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400 bg-slate-50 rounded-xl border border-slate-200">
              No active delays or blocker reasons recorded in the database. All machines operating smoothly.
            </div>
          ) : (
            <div className="space-y-3">
              {rootCauseAnalysis.list.map((r, idx) => {
                const isSelected = selectedRootCause === r.reason;
                return (
                  <div
                    key={idx}
                    onClick={() => setSelectedRootCause(isSelected ? null : r.reason)}
                    className={`p-3 rounded-xl border transition cursor-pointer space-y-1.5 ${
                      isSelected
                        ? 'bg-amber-50 border-amber-300 ring-2 ring-amber-200'
                        : 'bg-slate-50/70 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center space-x-2">
                        <span className="w-2 h-2 rounded-full bg-red-500" />
                        <span className="font-bold text-slate-900">{r.reason}</span>
                      </div>
                      <div className="flex items-center space-x-2 font-mono">
                        <span className="text-slate-600 font-semibold">{r.count} items</span>
                        <span className="font-black text-red-700">{r.percentage}%</span>
                      </div>
                    </div>

                    <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                      <div
                        className="bg-red-500 h-full rounded-full transition-all"
                        style={{ width: `${r.percentage}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Department-wise Root Cause Breakdown (Requirement 7) */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-black text-slate-900 uppercase tracking-wide flex items-center gap-1.5">
                <Building className="w-4 h-4 text-slate-700" />
                <span>Department-wise Root Cause</span>
              </h2>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Department primary obstacle, affected item count &amp; total delay days
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            {rootCauseByDept.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400 bg-slate-50 rounded-xl border border-slate-200">
                No departmental bottlenecks detected.
              </div>
            ) : (
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100 text-slate-600 font-bold uppercase tracking-wider text-[10px] border-b border-slate-200">
                  <tr>
                    <th className="p-2.5">Department</th>
                    <th className="p-2.5">Main Root Cause</th>
                    <th className="p-2.5 text-center">Count</th>
                    <th className="p-2.5 text-right">Delay Days</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rootCauseByDept.map((row, idx) => (
                    <tr
                      key={idx}
                      onClick={() => {
                        if (!isDeptUser) setSelectedDept(row.department);
                      }}
                      className="hover:bg-slate-50 transition cursor-pointer"
                    >
                      <td className="p-2.5 font-bold text-slate-900">{row.department}</td>
                      <td className="p-2.5 text-red-700 font-semibold">{row.mainRootCause}</td>
                      <td className="p-2.5 text-center font-mono font-bold">{row.count}</td>
                      <td className="p-2.5 text-right font-mono font-bold text-amber-700">
                        {row.delayDays > 0 ? `${row.delayDays} Days` : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* =============================================================
          ROW 4: TODAY'S WORK & DELAY ANALYTICS (Requirement 13 & 17)
          ============================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Today's Production (Requirement 17) */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-black text-slate-900 uppercase tracking-wide flex items-center gap-1.5">
                <Flame className="w-4 h-4 text-amber-600" />
                <span>TODAY'S PRODUCTION ({selectedDept})</span>
              </h2>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Shift execution and daily work progress
              </p>
            </div>
            <span className="text-xs font-mono font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
              {todayStats.progressPct}% Shift Done
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-center">
              <span className="text-[10px] text-slate-400 font-bold uppercase block">Assigned</span>
              <span className="text-lg font-black font-mono text-slate-900 mt-1 block">
                {todayStats.assigned}
              </span>
            </div>
            <div className="p-3 bg-emerald-50/60 rounded-xl border border-emerald-200 text-center">
              <span className="text-[10px] text-emerald-700 font-bold uppercase block">Completed</span>
              <span className="text-lg font-black font-mono text-emerald-700 mt-1 block">
                {todayStats.completed}
              </span>
            </div>
            <div className="p-3 bg-amber-50/60 rounded-xl border border-amber-200 text-center">
              <span className="text-[10px] text-amber-700 font-bold uppercase block">Pending</span>
              <span className="text-lg font-black font-mono text-amber-700 mt-1 block">
                {todayStats.pending}
              </span>
            </div>
            <div className="p-3 bg-red-50/60 rounded-xl border border-red-200 text-center">
              <span className="text-[10px] text-red-700 font-bold uppercase block">Delayed</span>
              <span className="text-lg font-black font-mono text-red-700 mt-1 block">
                {todayStats.delayed}
              </span>
            </div>
          </div>

          <div className="space-y-1.5 pt-2">
            <div className="flex items-center justify-between text-xs text-slate-600">
              <span>Shift Operations Completed</span>
              <span className="font-mono font-bold">{todayStats.completed} / {todayStats.assigned}</span>
            </div>
            <div className="w-full bg-slate-200 rounded-full h-2.5 overflow-hidden">
              <div
                className="bg-emerald-500 h-full rounded-full transition-all"
                style={{ width: `${todayStats.progressPct}%` }}
              />
            </div>
          </div>
        </div>

        {/* Delay Analysis (Requirement 13) */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-black text-slate-900 uppercase tracking-wide flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-red-600" />
                <span>DELAY ANALYSIS</span>
              </h2>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Accumulated delay impact across machines and departments
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-center">
              <span className="text-[10px] text-slate-400 font-bold uppercase block">Delayed Machines</span>
              <span className="text-lg font-black font-mono text-red-700 mt-1 block">
                {delayStats.totalDelayedMachines}
              </span>
            </div>
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-center">
              <span className="text-[10px] text-slate-400 font-bold uppercase block">Delayed Tasks</span>
              <span className="text-lg font-black font-mono text-slate-900 mt-1 block">
                {delayStats.totalDelayedOps}
              </span>
            </div>
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-center">
              <span className="text-[10px] text-slate-400 font-bold uppercase block">Total Delay Days</span>
              <span className="text-lg font-black font-mono text-amber-700 mt-1 block">
                {delayStats.totalDelayDays}d
              </span>
            </div>
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-center">
              <span className="text-[10px] text-slate-400 font-bold uppercase block">Avg Delay</span>
              <span className="text-lg font-black font-mono text-slate-900 mt-1 block">
                {delayStats.avgDelayDays}d
              </span>
            </div>
          </div>

          {/* Longest Delayed Machine Notice */}
          {delayStats.longestDelayed && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-center justify-between text-xs">
              <div>
                <span className="text-[10px] font-bold text-red-600 uppercase block">Longest Delayed Work</span>
                <span className="font-bold text-red-900">
                  Machine {delayStats.longestDelayed.machineNumber} &bull; {delayStats.longestDelayed.currentDepartment}
                </span>
              </div>
              <span className="font-mono font-black text-red-700 text-sm">
                {delayStats.longestDelayed.delayDays} Days
              </span>
            </div>
          )}
        </div>
      </div>

      {/* =============================================================
          ROW 5: HANDOVER & QUALITY STATUS (Requirement 18 & 19)
          ============================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Handover Status (Requirement 18) */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-black text-slate-900 uppercase tracking-wide flex items-center gap-1.5">
                <ArrowRightLeft className="w-4 h-4 text-indigo-600" />
                <span>HANDOVER STATUS ({selectedDept})</span>
              </h2>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Inter-departmental physical transfers and approvals
              </p>
            </div>
            <span className="text-xs font-mono font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded">
              Avg Acceptance: {handoverStats.avgAcceptanceHours}h
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="p-3 bg-amber-50/60 rounded-xl border border-amber-200 text-center">
              <span className="text-[10px] text-amber-700 font-bold uppercase block">Pending Acceptance</span>
              <span className="text-lg font-black font-mono text-amber-800 mt-1 block">
                {handoverStats.pending}
              </span>
            </div>
            <div className="p-3 bg-emerald-50/60 rounded-xl border border-emerald-200 text-center">
              <span className="text-[10px] text-emerald-700 font-bold uppercase block">Accepted</span>
              <span className="text-lg font-black font-mono text-emerald-800 mt-1 block">
                {handoverStats.accepted}
              </span>
            </div>
            <div className="p-3 bg-red-50/60 rounded-xl border border-red-200 text-center">
              <span className="text-[10px] text-red-700 font-bold uppercase block">Rejected</span>
              <span className="text-lg font-black font-mono text-red-800 mt-1 block">
                {handoverStats.rejected}
              </span>
            </div>
            <div className="p-3 bg-purple-50/60 rounded-xl border border-purple-200 text-center">
              <span className="text-[10px] text-purple-700 font-bold uppercase block">Returned</span>
              <span className="text-lg font-black font-mono text-purple-800 mt-1 block">
                {handoverStats.returned}
              </span>
            </div>
          </div>
        </div>

        {/* Quality Status (Requirement 19) */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-black text-slate-900 uppercase tracking-wide flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                <span>QUALITY STATUS ({selectedDept})</span>
              </h2>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Inspection results and rejection feedback
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-center">
              <span className="text-[10px] text-slate-400 font-bold uppercase block">Inspections</span>
              <span className="text-lg font-black font-mono text-slate-900 mt-1 block">
                {qualityStats.totalChecks}
              </span>
            </div>
            <div className="p-3 bg-emerald-50/60 rounded-xl border border-emerald-200 text-center">
              <span className="text-[10px] text-emerald-700 font-bold uppercase block">Passed</span>
              <span className="text-lg font-black font-mono text-emerald-800 mt-1 block">
                {qualityStats.passed}
              </span>
            </div>
            <div className="p-3 bg-red-50/60 rounded-xl border border-red-200 text-center">
              <span className="text-[10px] text-red-700 font-bold uppercase block">Rejections</span>
              <span className="text-lg font-black font-mono text-red-800 mt-1 block">
                {qualityStats.rejected}
              </span>
            </div>
            <div className="p-3 bg-amber-50/60 rounded-xl border border-amber-200 text-center">
              <span className="text-[10px] text-amber-700 font-bold uppercase block">On Hold</span>
              <span className="text-lg font-black font-mono text-amber-800 mt-1 block">
                {qualityStats.onHold}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* =============================================================
          ROW 6: MACHINE PROGRESS & EXPECTED COMPLETION (Requirement 12 & 14)
          ============================================================= */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div>
            <h2 className="text-sm font-black text-slate-900 uppercase tracking-wide flex items-center gap-1.5">
              <Cpu className="w-4 h-4 text-blue-600" />
              <span>MACHINE-WISE PROGRESS &amp; EXPECTED COMPLETION</span>
            </h2>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Click any machine to open detailed specifications, operations checklist and roadmap
            </p>
          </div>
          <span className="text-xs font-mono font-bold text-slate-600">
            {filteredMachines.length} Machines
          </span>
        </div>

        <div className="overflow-x-auto">
          {filteredMachines.length === 0 ? (
            <div className="p-12 text-center text-xs text-slate-400">
              No machine records match the active filter criteria.
            </div>
          ) : (
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100/80 text-slate-600 font-bold uppercase tracking-wider text-[10px] border-b border-slate-200">
                <tr>
                  <th className="p-3">Machine No</th>
                  <th className="p-3">Specification / Model</th>
                  <th className="p-3">Current Dept</th>
                  <th className="p-3">Operations</th>
                  <th className="p-3">Progress %</th>
                  <th className="p-3">Target Date</th>
                  <th className="p-3">Delay / Status</th>
                  <th className="p-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredMachines.slice(0, 25).map((m) => {
                  const progress = m.overallProgressPercent || m.departmentProgress || m.progress || 0;
                  const totalOps = m.operations?.length || 6;
                  const completedOps = m.operations?.filter((o) => o.status === 'Completed').length || Math.round((progress / 100) * totalOps);

                  return (
                    <tr
                      key={m.id}
                      onClick={() => {
                        setRoadmapMachineId(m.id);
                        setModalMachine(m);
                      }}
                      className="hover:bg-indigo-50/40 transition cursor-pointer"
                    >
                      <td className="p-3 font-mono font-black text-slate-900">{m.machineNumber}</td>
                      <td className="p-3 font-semibold text-slate-800">{m.model || m.size || 'CMM Standard'}</td>
                      <td className="p-3 font-bold text-indigo-700">{m.currentDepartment}</td>
                      <td className="p-3 font-mono text-slate-700">
                        {completedOps} / {totalOps}
                      </td>
                      <td className="p-3">
                        <div className="flex items-center space-x-2">
                          <div className="w-16 bg-slate-200 rounded-full h-1.5 overflow-hidden">
                            <div
                              className={`h-full rounded-full ${progress >= 100 ? 'bg-emerald-500' : 'bg-blue-600'}`}
                              style={{ width: `${Math.min(100, progress)}%` }}
                            />
                          </div>
                          <span className="font-mono font-bold text-slate-900 text-[11px]">{progress}%</span>
                        </div>
                      </td>
                      <td className="p-3 text-slate-600 font-mono">{m.targetDate || m.plannedDueDate || '-'}</td>
                      <td className="p-3">
                        {m.delayDays && m.delayDays > 0 ? (
                          <span className="text-[10px] font-black text-red-700 bg-red-100 px-2 py-0.5 rounded">
                            {m.delayDays}d Delayed
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                            On Track
                          </span>
                        )}
                      </td>
                      <td className="p-3 text-right">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setModalMachine(m);
                          }}
                          className="px-2 py-1 bg-slate-100 hover:bg-indigo-600 hover:text-white rounded-lg text-[11px] font-bold transition inline-flex items-center space-x-1"
                        >
                          <Eye className="w-3 h-3" />
                          <span>View</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* =============================================================
          ROW 7: ROADMAP ANALYTICS (Requirement 15)
          ============================================================= */}
      {selectedRoadmapMachine && (
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-xs font-black uppercase tracking-wider text-indigo-600">
                  ROADMAP VISUALIZATION
                </span>
                <span className="font-mono font-black text-slate-900">
                  Machine {selectedRoadmapMachine.machineNumber}
                </span>
                <span className="text-xs font-bold text-slate-500">
                  ({selectedRoadmapMachine.model || 'Standard'})
                </span>
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Sequential lifecycle pipeline across factory departments
              </p>
            </div>

            <button
              onClick={() => setModalMachine(selectedRoadmapMachine)}
              className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl text-xs font-bold transition flex items-center space-x-1"
            >
              <Maximize2 className="w-3.5 h-3.5" />
              <span>Open Complete Machine Card</span>
            </button>
          </div>

          {/* Horizontal Roadmap Nodes */}
          <div className="overflow-x-auto pb-2 custom-scrollbar">
            <div className="flex items-center min-w-max py-2 space-x-2">
              {activeDepts.map((dept, idx) => {
                const stage = selectedRoadmapMachine.processStages?.[dept.code];
                const isCurrent =
                  isDepartmentMatch(selectedRoadmapMachine.currentDepartment, dept.name) ||
                  isDepartmentMatch(selectedRoadmapMachine.responsibleDepartment, dept.name);
                const isCompleted = stage?.status === 'Completed';
                const isDelayed = stage?.status === 'Delayed';

                let badgeBg = 'bg-slate-50 text-slate-500 border-slate-200';
                if (isCompleted) badgeBg = 'bg-emerald-50 text-emerald-700 border-emerald-300';
                else if (isCurrent) badgeBg = 'bg-blue-600 text-white border-blue-700 ring-2 ring-blue-300';
                else if (isDelayed) badgeBg = 'bg-red-50 text-red-700 border-red-300';

                return (
                  <React.Fragment key={dept.code}>
                    <div
                      className={`p-2.5 rounded-xl border text-xs flex flex-col justify-between w-36 shrink-0 transition ${badgeBg}`}
                    >
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="font-mono font-black">{dept.code}</span>
                        <span>{isCompleted ? '✓' : isCurrent ? '●' : isDelayed ? '⚠' : '○'}</span>
                      </div>
                      <div className="font-bold text-[11px] truncate mt-1">
                        {dept.name.replace(/^[0-9]+(-[A-Z])?\s*/, '')}
                      </div>
                      <div className="text-[10px] opacity-80 mt-1 flex items-center justify-between">
                        <span>{isCurrent ? 'Current' : stage?.status || 'Pending'}</span>
                        <span>{stage?.progressPercent || (isCurrent ? selectedRoadmapMachine.departmentProgress || 0 : 0)}%</span>
                      </div>
                    </div>

                    {idx < activeDepts.length - 1 && (
                      <ChevronRight className="w-3.5 h-3.5 text-slate-300 shrink-0" />
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Machine Detail Modal */}
      {modalMachine && (
        <MachineDetailModal
          isOpen={Boolean(modalMachine)}
          machine={modalMachine}
          onClose={() => setModalMachine(null)}
          departments={activeDepts}
          departmentWork={departmentWork}
          handovers={handovers}
          qualityChecks={qualityChecks}
          qualityRejections={qualityRejections}
          qualityOps={qualityOps}
          machineDocs={machineDocs}
          monthlyPlans={monthlyPlans}
          weeklyPlans={weeklyPlans}
          yearlyPlans={yearlyPlans}
        />
      )}
    </div>
  );
};
