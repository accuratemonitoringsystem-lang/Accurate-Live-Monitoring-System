import React, { useEffect, useState, useRef } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LoginView } from './views/LoginView';
import { AdminDashboardView } from './views/AdminDashboardView';
import { DepartmentDashboardView } from './views/DepartmentDashboardView';
import { FirstLoginPasswordModal } from './components/FirstLoginPasswordModal';
import { GlobalSearchModal } from './components/GlobalSearchModal';
import { QuickUpdateModal } from './components/QuickUpdateModal';
import { ExcelImportModal } from './components/ExcelImportModal';
import {
  initializeDefaultDepartmentsIfEmpty,
  subscribeDepartments,
  subscribeMachines,
  subscribeYearlyPlans,
  subscribeMonthlyPlans,
  subscribeWeeklyPlans,
  subscribeQualityOperations,
  subscribeQualityDailyChecks,
  subscribeQualityRejections,
  subscribeDepartmentWork,
  subscribeDepartmentHandovers,
  subscribeNotifications,
  subscribeAuditLogs,
  subscribeAllMachineDocuments,
  subscribeUserProfiles,
  subscribeRoadmapItems,
} from './services/db';
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
} from './types';
import { ExcelImportType } from './utils/excel';
import { reconcileMonthlyPlanAssignments } from './services/reconciliationService';
import { areMachineNumbersEqual, normalizeMachineNumber } from './utils/machineUtils';
import { isDepartmentMatch } from './utils/departmentUtils';
import { INITIAL_DEPARTMENTS } from './constants';

type NavigationMode = 'admin' | 'department';

const AppContent: React.FC = () => {
  const { userProfile, loading, signOut } = useAuth();

  // Primary Navigation State
  const [navMode, setNavMode] = useState<NavigationMode>('department');
  const [activeDepartment, setActiveDepartment] = useState<string | null>(null);

  // Modals
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [showQuickUpdateModal, setShowQuickUpdateModal] = useState(false);
  const [showExcelModal, setShowExcelModal] = useState(false);
  const [excelImportType, setExcelImportType] = useState<ExcelImportType>('planning');

  // Real-time collections (defaults to INITIAL_DEPARTMENTS for resilient offline/quota operation)
  const [departments, setDepartments] = useState<Department[]>(INITIAL_DEPARTMENTS);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [yearlyPlans, setYearlyPlans] = useState<YearlyPlan[]>([]);
  const [monthlyPlans, setMonthlyPlans] = useState<MonthlyPlan[]>([]);
  const [weeklyPlans, setWeeklyPlans] = useState<WeeklyPlan[]>([]);
  const [qualityOps, setQualityOps] = useState<QualityOperation[]>([]);
  const [qualityChecks, setQualityChecks] = useState<QualityDailyCheck[]>([]);
  const [qualityRejections, setQualityRejections] = useState<QualityRejection[]>([]);
  const [departmentWork, setDepartmentWork] = useState<DepartmentWork[]>([]);
  const [handovers, setHandovers] = useState<DepartmentHandover[]>([]);
  const [notifications, setNotifications] = useState<SystemNotification[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [machineDocs, setMachineDocs] = useState<MachineDocument[]>([]);
  const [userProfiles, setUserProfiles] = useState<UserProfile[]>([]);
  const [roadmapItems, setRoadmapItems] = useState<RoadmapItem[]>([]);

  // Automatically route authenticated users to their authorized dashboard
  useEffect(() => {
    if (!userProfile) return;
    if (userProfile.role === 'ADMIN') {
      setNavMode('admin');
    } else {
      setNavMode('department');
      setActiveDepartment(userProfile.department);
    }
  }, [userProfile]);

  // Keyboard shortcut for Cmd+K / Ctrl+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setShowSearchModal((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Securely initialize subscriptions ONLY when user is authenticated
  useEffect(() => {
    if (!userProfile) return;

    initializeDefaultDepartmentsIfEmpty();

    const unsubDepts = subscribeDepartments(setDepartments);
    const unsubMach = subscribeMachines(setMachines);
    const unsubYear = subscribeYearlyPlans(setYearlyPlans);
    const unsubMonth = subscribeMonthlyPlans(setMonthlyPlans);
    const unsubWeek = subscribeWeeklyPlans(setWeeklyPlans);
    const unsubQOps = subscribeQualityOperations(setQualityOps);
    const unsubQChecks = subscribeQualityDailyChecks(setQualityChecks);
    const unsubQRej = subscribeQualityRejections(setQualityRejections);
    const unsubWork = subscribeDepartmentWork(setDepartmentWork);
    const unsubHand = subscribeDepartmentHandovers(setHandovers);
    const unsubNotifs = subscribeNotifications(
      userProfile.department,
      userProfile.role,
      userProfile.id,
      setNotifications
    );
    const unsubAudit = subscribeAuditLogs(setAuditLogs);
    const unsubDocs = subscribeAllMachineDocuments(setMachineDocs);
    const unsubUsers = subscribeUserProfiles(setUserProfiles);
    const unsubRoadmap = subscribeRoadmapItems(setRoadmapItems);

    return () => {
      unsubDepts();
      unsubMach();
      unsubYear();
      unsubMonth();
      unsubWeek();
      unsubQOps();
      unsubQChecks();
      unsubQRej();
      unsubWork();
      unsubHand();
      unsubNotifs();
      unsubAudit();
      unsubDocs();
      unsubUsers();
      unsubRoadmap();
    };
  }, [userProfile]);

  const isReconcilingRef = useRef(false);

  // Idempotent auto-reconciliation: ensures saved Monthly Plans (e.g. October 2026) flow into Machine Master and Active Work
  useEffect(() => {
    if (!userProfile || monthlyPlans.length === 0 || isReconcilingRef.current) return;

    // Check if any monthly plan machine is missing from Machine Master, or missing Planning work in department_work
    const hasUnreconciled = monthlyPlans.some((p) => {
      const cleanNum = normalizeMachineNumber(p.machineNumber);
      if (!cleanNum) return false;
      const machExists = machines.some((m) => areMachineNumbersEqual(m.machineNumber, cleanNum));
      const planWorkExists = departmentWork.some(
        (w) => areMachineNumbersEqual(w.machineNumber, cleanNum) && isDepartmentMatch(w.department, '02 Planning')
      );
      return !machExists || !planWorkExists || p.status !== 'RELEASED';
    });

    if (hasUnreconciled) {
      isReconcilingRef.current = true;
      console.log('Synchronizing saved Monthly Plan records with Machine Master and Department Work...');
      reconcileMonthlyPlanAssignments({
        targetMonth: 'all',
        userEmail: userProfile.email || 'auto-reconciliation',
      })
        .then((report) => {
          console.log('Auto-reconciliation finished successfully:', report);
        })
        .catch((err) => {
          console.warn('Notice in monthly plan auto-reconciliation:', err);
        })
        .finally(() => {
          // Allow re-run if needed after short grace period
          setTimeout(() => {
            isReconcilingRef.current = false;
          }, 8000);
        });
    }
  }, [userProfile, monthlyPlans, machines, departmentWork]);

  // Handlers for modal triggers
  const handleOpenExcelImport = (type: ExcelImportType = 'planning') => {
    setExcelImportType(type);
    setShowExcelModal(true);
  };

  // Switch to Department Dashboard (Strictly restricted for non-admin)
  const handleSelectDepartment = (deptName: string) => {
    if (userProfile?.role !== 'ADMIN') {
      setActiveDepartment(userProfile?.department || deptName);
      setNavMode('department');
      return;
    }
    setActiveDepartment(deptName);
    setNavMode('department');
  };

  // Switch to Administrator Dashboard (Strictly admin only)
  const handleSelectAdmin = () => {
    if (userProfile?.role !== 'ADMIN') {
      return;
    }
    setNavMode('admin');
  };

  // Safe navigation fallback
  const handleNavigateHome = () => {
    if (userProfile?.role === 'ADMIN') {
      setNavMode('admin');
    } else {
      setNavMode('department');
      setActiveDepartment(userProfile?.department || null);
    }
  };

  // Loading indicator during initial session check
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center text-white p-4">
        <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4" />
        <h2 className="text-sm font-bold tracking-wider uppercase text-slate-200">
          ACCURATE GAUGING AND INSTRUMENTS PVT LTD
        </h2>
        <p className="text-xs text-slate-400 mt-1">Connecting to Secure Manufacturing System...</p>
      </div>
    );
  }

  // =========================================================================
  // MANDATORY LOGIN GATE: If not authenticated, render LoginView ONLY
  // =========================================================================
  if (!userProfile) {
    return <LoginView />;
  }

  // Enforce department resolution for department users
  const resolvedDept =
    userProfile.role === 'ADMIN'
      ? activeDepartment || userProfile.department || '02 Planning'
      : userProfile.department;

  return (
    <div className="min-h-screen bg-slate-100 text-slate-800 font-sans antialiased">
      {/* First Login Security Password Change Modal */}
      <FirstLoginPasswordModal />

      {/* 1. DEDICATED ADMINISTRATOR DASHBOARD (Admin Only) */}
      {navMode === 'admin' && userProfile.role === 'ADMIN' && (
        <AdminDashboardView
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
          roadmapItems={roadmapItems}
          onOpenQuickUpdate={() => setShowQuickUpdateModal(true)}
          onOpenGlobalSearch={() => setShowSearchModal(true)}
          onOpenExcelImport={handleOpenExcelImport}
          onNavigateHome={handleNavigateHome}
          onInspectDepartment={(deptName) => {
            setActiveDepartment(deptName);
            setNavMode('department');
          }}
        />
      )}

      {/* 2. DEDICATED DEPARTMENT DASHBOARD (Authorized Department Only) */}
      {(navMode === 'department' || userProfile.role !== 'ADMIN') && (
        <DepartmentDashboardView
          departmentName={resolvedDept}
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
          roadmapItems={roadmapItems}
          onOpenQuickUpdate={() => setShowQuickUpdateModal(true)}
          onOpenGlobalSearch={() => setShowSearchModal(true)}
          onOpenExcelImport={handleOpenExcelImport}
          onNavigateHome={handleNavigateHome}
          onReturnToAdmin={userProfile.role === 'ADMIN' ? handleSelectAdmin : undefined}
        />
      )}

      {/* Global Search Modal */}
      <GlobalSearchModal
        isOpen={showSearchModal}
        onClose={() => setShowSearchModal(false)}
        machines={machines}
        operations={qualityOps}
        departmentWork={departmentWork}
        monthlyPlans={monthlyPlans}
        onSelectMachine={() => {
          setShowSearchModal(false);
        }}
        onSelectView={() => setShowSearchModal(false)}
      />

      {/* 1-Minute Daily Quick Update Modal */}
      <QuickUpdateModal
        isOpen={showQuickUpdateModal}
        onClose={() => setShowQuickUpdateModal(false)}
        departmentWork={departmentWork}
        machines={machines}
      />

      {/* Excel Import & Template Modal */}
      <ExcelImportModal
        isOpen={showExcelModal}
        onClose={() => setShowExcelModal(false)}
        defaultType={excelImportType}
      />
    </div>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
