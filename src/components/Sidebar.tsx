import React from 'react';
import {
  LayoutDashboard,
  Flame,
  CalendarDays,
  Cpu,
  CheckSquare,
  FileSpreadsheet,
  FileText,
  ShieldCheck,
  Building,
  ArrowRightLeft,
  Settings,
  LogOut,
  Package,
  Cable,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface SidebarProps {
  activeView: string;
  onSelectView: (view: string) => void;
  unreadCount?: number;
  priorityCount?: number;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeView,
  onSelectView,
  priorityCount = 0,
}) => {
  const { userProfile } = useAuth();
  const role = userProfile?.role || 'DEPARTMENT USER';

  const menuItems = [
    {
      id: 'dashboard',
      label: 'Main Dashboard',
      icon: LayoutDashboard,
      roles: ['ADMIN', 'PLANNING', 'QUALITY', 'DEPARTMENT USER', 'MANAGEMENT / VIEWER'],
    },
    {
      id: 'priority',
      label: "Today's Priority",
      icon: Flame,
      badge: priorityCount > 0 ? priorityCount : undefined,
      badgeColor: 'bg-amber-500 text-white',
      roles: ['ADMIN', 'PLANNING', 'QUALITY', 'DEPARTMENT USER', 'MANAGEMENT / VIEWER'],
    },
    {
      id: 'department_work',
      label: 'Department Work',
      icon: Building,
      sublabel: userProfile?.department,
      roles: ['ADMIN', 'DEPARTMENT USER', 'PLANNING', 'QUALITY'],
    },
    {
      id: 'planning',
      label: 'Planning Module',
      icon: CalendarDays,
      roles: ['ADMIN', 'PLANNING', 'MANAGEMENT / VIEWER'],
    },
    {
      id: 'accessories_orders',
      label: 'Accessories Order',
      icon: Package,
      roles: ['ADMIN', 'PLANNING', 'DEPARTMENT USER', 'MANAGEMENT / VIEWER', 'QUALITY'],
    },
    {
      id: 'open_cable_orders',
      label: 'Open Cable Order',
      icon: Cable,
      roles: ['ADMIN', 'PLANNING', 'DEPARTMENT USER', 'MANAGEMENT / VIEWER', 'QUALITY'],
    },
    {
      id: 'machines',
      label: 'Machines & Tracking',
      icon: Cpu,
      roles: ['ADMIN', 'PLANNING', 'QUALITY', 'DEPARTMENT USER', 'MANAGEMENT / VIEWER'],
    },
    {
      id: 'quality',
      label: 'Quality Module',
      icon: CheckSquare,
      roles: ['ADMIN', 'QUALITY', 'PLANNING', 'MANAGEMENT / VIEWER'],
    },
    {
      id: 'excel',
      label: 'Import / Export',
      icon: FileSpreadsheet,
      roles: ['ADMIN', 'PLANNING', 'QUALITY', 'MANAGEMENT / VIEWER'],
    },
    {
      id: 'reports',
      label: 'MIS & Reports',
      icon: FileText,
      roles: ['ADMIN', 'PLANNING', 'MANAGEMENT / VIEWER', 'QUALITY'],
    },
    {
      id: 'settings',
      label: 'Admin Panel & Users',
      icon: ShieldCheck,
      roles: ['ADMIN'],
    },
  ];

  const filteredItems = menuItems.filter((item) => item.roles.includes(role));

  const { signOut } = useAuth();

  return (
    <aside className="w-64 bg-slate-900 text-slate-300 flex flex-col border-r border-slate-800 shrink-0 select-none">
      {/* Active User Department Scope Card */}
      <div className="p-3 mx-3 my-3 bg-slate-800/80 rounded-xl border border-slate-700/60">
        <div className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">
          Active Workspace
        </div>
        <div className="font-bold text-sm text-white truncate mt-0.5" title={userProfile?.department}>
          {userProfile?.department || 'General Facility'}
        </div>
        <div className="flex items-center justify-between text-[11px] text-slate-400 mt-1">
          <span className="bg-blue-900/60 text-blue-300 font-mono text-[10px] px-1.5 py-0.2 rounded border border-blue-600/40">
            {role}
          </span>
          <span className="text-[10px] text-emerald-400 flex items-center gap-1 font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
            Live DB
          </span>
        </div>
      </div>

      {/* Navigation list */}
      <nav className="flex-1 px-3 space-y-1 overflow-y-auto py-1">
        {filteredItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeView === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onSelectView(item.id)}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-medium transition group ${
                isActive
                  ? 'bg-blue-600 text-white font-semibold shadow-sm'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <div className="flex items-center space-x-2.5 min-w-0">
                <Icon
                  className={`w-4 h-4 shrink-0 ${
                    isActive ? 'text-white' : 'text-slate-400 group-hover:text-blue-400'
                  }`}
                />
                <div className="text-left truncate">
                  <div className="truncate">{item.label}</div>
                  {item.sublabel && !isActive && (
                    <div className="text-[10px] text-slate-500 truncate max-w-[130px]">
                      {item.sublabel}
                    </div>
                  )}
                </div>
              </div>

              {item.badge !== undefined && (
                <span
                  className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                    item.badgeColor || 'bg-slate-700 text-slate-200'
                  }`}
                >
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Logout Action */}
      <div className="p-3 border-t border-slate-800">
        <button
          onClick={() => signOut()}
          className="w-full flex items-center justify-center space-x-2 py-2 px-3 rounded-lg bg-red-950/40 hover:bg-red-900/60 text-red-300 border border-red-800/40 text-xs font-semibold transition"
        >
          <LogOut className="w-4 h-4 text-red-400" />
          <span>Logout</span>
        </button>
      </div>

      {/* Footer Info */}
      <div className="px-4 py-2 border-t border-slate-800/60 text-[10px] text-slate-500 flex items-center justify-between">
        <span>Accurate Gauging</span>
        <span className="font-mono text-emerald-500">Live Portal</span>
      </div>
    </aside>
  );
};
