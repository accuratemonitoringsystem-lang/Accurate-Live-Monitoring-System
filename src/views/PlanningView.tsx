import React, { useState, useEffect } from 'react';
import {
  CalendarDays,
  Target,
  Clock,
  BarChart3,
  Layers,
} from 'lucide-react';
import { Department, Machine, MonthlyPlan, WeeklyPlan, YearlyPlan } from '../types';
import { MonthlyPlanModule } from '../components/planning/MonthlyPlanModule';
import { WeeklyPlanModule } from '../components/planning/WeeklyPlanModule';
import { YearlyPlanModule } from '../components/planning/YearlyPlanModule';
import { PlanVsActualModule } from '../components/planning/PlanVsActualModule';
import { DepartmentDailyUpdatesView } from '../components/operations/DepartmentDailyUpdatesView';
import { BacklogManagementView } from '../components/backlog/BacklogManagementView';

interface PlanningViewProps {
  departments: Department[];
  yearlyPlans: YearlyPlan[];
  monthlyPlans: MonthlyPlan[];
  weeklyPlans: WeeklyPlan[];
  machines?: Machine[];
  onOpenExcelImport: () => void;
  onOpenPlanExcelImport?: (type: 'monthly' | 'weekly') => void;
  selectedDepartment?: string;
  initialTab?: 'monthly' | 'weekly' | 'yearly' | 'plan_vs_actual' | 'daily_updates' | 'backlog';
}

export const PlanningView: React.FC<PlanningViewProps> = ({
  departments,
  yearlyPlans,
  monthlyPlans,
  weeklyPlans,
  machines = [],
  onOpenExcelImport,
  onOpenPlanExcelImport,
  selectedDepartment,
  initialTab = 'monthly',
}) => {
  const [activeTab, setActiveTab] = useState<'monthly' | 'weekly' | 'yearly' | 'plan_vs_actual' | 'daily_updates' | 'backlog'>(initialTab);

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  return (
    <div className="space-y-6">
      {/* Top Navigation / Tab Selector */}
      <div className="flex items-center justify-between border-b border-slate-200 pb-3">
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setActiveTab('daily_updates')}
            className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl text-xs font-bold transition ${
              activeTab === 'daily_updates'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <Clock className="w-4 h-4" />
            <span>Daily Operation Updates</span>
          </button>

          <button
            onClick={() => setActiveTab('monthly')}
            className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl text-xs font-bold transition ${
              activeTab === 'monthly'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <CalendarDays className="w-4 h-4" />
            <span>Monthly Plan ({monthlyPlans.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('weekly')}
            className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl text-xs font-bold transition ${
              activeTab === 'weekly'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <Clock className="w-4 h-4" />
            <span>Weekly Plan ({weeklyPlans.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('yearly')}
            className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl text-xs font-bold transition ${
              activeTab === 'yearly'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <Target className="w-4 h-4" />
            <span>Yearly Targets ({yearlyPlans.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('plan_vs_actual')}
            className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl text-xs font-bold transition ${
              activeTab === 'plan_vs_actual'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <BarChart3 className="w-4 h-4" />
            <span>Plan vs Actual</span>
          </button>

          <button
            onClick={() => setActiveTab('backlog')}
            className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl text-xs font-bold transition ${
              activeTab === 'backlog'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>Backlog Management</span>
          </button>
        </div>

        {selectedDepartment && selectedDepartment !== 'All Departments' && (
          <div className="hidden sm:flex items-center space-x-2 text-xs text-slate-500 bg-white px-3 py-1.5 rounded-xl border border-slate-200">
            <span>Filtered for:</span>
            <span className="font-bold text-slate-900">{selectedDepartment}</span>
          </div>
        )}
      </div>

      {/* TAB CONTENT */}
      {activeTab === 'daily_updates' && (
        <DepartmentDailyUpdatesView
          departmentName={selectedDepartment && selectedDepartment !== 'All Departments' ? selectedDepartment : '02 Planning'}
          machines={machines}
        />
      )}

      {activeTab === 'monthly' && (
        <MonthlyPlanModule
          departments={departments}
          monthlyPlans={monthlyPlans}
          machines={machines}
          selectedDepartment={selectedDepartment}
          onOpenExcelImport={onOpenPlanExcelImport ? () => onOpenPlanExcelImport('monthly') : onOpenExcelImport}
        />
      )}

      {activeTab === 'weekly' && (
        <WeeklyPlanModule
          departments={departments}
          weeklyPlans={weeklyPlans}
          machines={machines}
          selectedDepartment={selectedDepartment}
          onOpenExcelImport={onOpenPlanExcelImport ? () => onOpenPlanExcelImport('weekly') : onOpenExcelImport}
        />
      )}

      {activeTab === 'yearly' && (
        <YearlyPlanModule
          departments={departments}
          yearlyPlans={yearlyPlans}
          machines={machines}
          selectedDepartment={selectedDepartment}
          onOpenExcelImport={onOpenExcelImport}
        />
      )}

      {activeTab === 'plan_vs_actual' && (
        <PlanVsActualModule
          departments={departments}
          yearlyPlans={yearlyPlans}
          monthlyPlans={monthlyPlans}
          weeklyPlans={weeklyPlans}
          machines={machines}
          selectedDepartment={selectedDepartment}
        />
      )}

      {activeTab === 'backlog' && (
        <BacklogManagementView
          departmentName={selectedDepartment && selectedDepartment !== 'All Departments' ? selectedDepartment : '02 Planning'}
          machines={machines}
          onOpenDailyUpdate={() => setActiveTab('daily_updates')}
        />
      )}
    </div>
  );
};
