import React, { useState } from 'react';
import {
  Bell,
  Search,
  User,
  LogOut,
  Building2,
  ShieldCheck,
  CheckCircle2,
  Clock,
  AlertTriangle,
  ChevronDown,
  ArrowRightLeft,
  Check,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { SystemNotification } from '../types';
import { markNotificationAsRead } from '../services/db';
import { COMPANY_NAME, SYSTEM_SUBTITLE } from '../constants';
import { FACTORY_DEPARTMENTS } from '../views/LoginView';

interface NavbarProps {
  notifications: SystemNotification[];
  onOpenQuickUpdate: () => void;
  onOpenGlobalSearch: () => void;
  onSelectView: (view: string) => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  notifications,
  onOpenQuickUpdate,
  onOpenGlobalSearch,
  onSelectView,
}) => {
  const { userProfile, signOut, switchActiveDepartment } = useAuth();
  const [showNotifMenu, setShowNotifMenu] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showDeptSwitchMenu, setShowDeptSwitchMenu] = useState(false);

  const unreadCount = notifications.filter((n) => !n.read).length;
  const isAdmin = userProfile?.role === 'ADMIN';

  const handleNotificationClick = async (notif: SystemNotification) => {
    if (!notif.read) {
      await markNotificationAsRead(notif.id);
    }
    if (notif.type === 'rejection') {
      onSelectView('quality');
    } else if (notif.type === 'handover' || notif.type === 'task') {
      onSelectView('department_work');
    } else if (notif.type === 'delay') {
      onSelectView('dashboard');
    }
    setShowNotifMenu(false);
  };

  const handleSwitchDepartment = (deptName: string) => {
    switchActiveDepartment(deptName);
    setShowDeptSwitchMenu(false);

    // Contextual view routing based on department
    if (deptName.toLowerCase().includes('planning')) {
      onSelectView('planning');
    } else if (deptName.toLowerCase().includes('quality') || deptName.toLowerCase().includes('calibration')) {
      onSelectView('quality');
    } else if (deptName === 'All Factory (Master View)') {
      onSelectView('dashboard');
    } else {
      onSelectView('department_work');
    }
  };

  return (
    <header className="bg-slate-900 text-white border-b border-slate-800 sticky top-0 z-40 px-3 sm:px-6 py-2.5 flex items-center justify-between shadow-md">
      {/* Left branding & Current Department Badge */}
      <div className="flex items-center space-x-3">
        <div className="w-10 h-10 rounded-lg bg-blue-600 flex items-center justify-center font-bold text-lg tracking-wider text-white shadow-inner shrink-0">
          AG
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-bold text-sm sm:text-base tracking-wide text-white leading-tight">
              {COMPANY_NAME}
            </h1>
            <span className="hidden md:inline-block text-[10px] bg-blue-900/60 text-blue-200 border border-blue-500/40 px-2 py-0.5 rounded font-mono">
              LIVE SYSTEM
            </span>
          </div>

          <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
            <span className="text-slate-300 font-medium truncate max-w-[200px] sm:max-w-[300px]">
              {userProfile?.department || 'Department Workspace'}
            </span>
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500" />
            <span className="text-[10px] font-semibold text-emerald-400 uppercase tracking-wider">
              {userProfile?.role}
            </span>
          </div>
        </div>
      </div>

      {/* Center Search bar button */}
      <div className="flex-1 max-w-md mx-4 hidden xl:block">
        <button
          onClick={onOpenGlobalSearch}
          className="w-full bg-slate-800 hover:bg-slate-700/80 text-slate-400 text-xs px-3 py-2 rounded-lg flex items-center justify-between border border-slate-700 transition"
        >
          <span className="flex items-center space-x-2">
            <Search className="w-4 h-4 text-slate-400" />
            <span>Search machine, model, operation, department...</span>
          </span>
          <kbd className="bg-slate-900 text-slate-400 px-1.5 py-0.5 rounded text-[10px] border border-slate-700">
            Ctrl+K
          </kbd>
        </button>
      </div>

      {/* Right controls */}
      <div className="flex items-center space-x-2 sm:space-x-3">
        {/* ============================================================
            ADMINISTRATOR: SWITCH DEPARTMENT BUTTON & DROPDOWN
            ============================================================ */}
        {isAdmin && (
          <div className="relative">
            <button
              onClick={() => setShowDeptSwitchMenu(!showDeptSwitchMenu)}
              className="bg-indigo-600/30 hover:bg-indigo-600/40 text-indigo-200 border border-indigo-500/50 text-xs font-bold px-2.5 sm:px-3 py-1.5 rounded-lg flex items-center space-x-1.5 shadow-sm transition"
              title="Administrator Switch Department"
            >
              <ArrowRightLeft className="w-3.5 h-3.5 text-indigo-400" />
              <span className="hidden sm:inline">SWITCH DEPARTMENT</span>
              <ChevronDown className="w-3.5 h-3.5 text-indigo-300" />
            </button>

            {showDeptSwitchMenu && (
              <div className="absolute right-0 mt-2 w-72 sm:w-80 bg-slate-900 text-white rounded-xl shadow-2xl border border-slate-700 py-2 z-50 overflow-hidden animate-fadeIn">
                <div className="px-4 py-2 border-b border-slate-800 flex items-center justify-between">
                  <span className="font-bold text-xs uppercase tracking-wider text-indigo-400">
                    Switch Active Department
                  </span>
                  <span className="text-[10px] text-slate-400">Admin Privileges</span>
                </div>

                <div className="max-h-80 overflow-y-auto divide-y divide-slate-800/60 p-1">
                  {/* Master View option */}
                  <button
                    onClick={() => handleSwitchDepartment('All Factory (Master View)')}
                    className={`w-full text-left px-3 py-2 rounded-lg text-xs flex items-center justify-between transition ${
                      userProfile?.department === 'All Factory (Master View)'
                        ? 'bg-indigo-950/80 text-indigo-300 font-bold border border-indigo-800/60'
                        : 'text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    <div className="flex items-center space-x-2">
                      <ShieldCheck className="w-4 h-4 text-indigo-400" />
                      <span>All Factory (Master Overview)</span>
                    </div>
                    {userProfile?.department === 'All Factory (Master View)' && (
                      <Check className="w-4 h-4 text-indigo-400" />
                    )}
                  </button>

                  {/* 20 Factory Departments */}
                  {FACTORY_DEPARTMENTS.map((dept: any) => {
                    const isCurrent = userProfile?.department === dept.name;
                    return (
                      <button
                        key={dept.id}
                        onClick={() => handleSwitchDepartment(dept.name)}
                        className={`w-full text-left px-3 py-2 rounded-lg text-xs flex items-center justify-between transition ${
                          isCurrent
                            ? 'bg-blue-950/80 text-blue-300 font-bold border border-blue-800/60'
                            : 'text-slate-300 hover:bg-slate-800'
                        }`}
                      >
                        <div className="flex items-center space-x-2">
                          <span className="font-mono text-[10px] text-blue-400 bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800">
                            {dept.code}
                          </span>
                          <span className="truncate max-w-[180px]">{dept.name}</span>
                        </div>
                        {isCurrent && <Check className="w-4 h-4 text-blue-400" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* 1-Minute Daily Update Fast Action */}
        <button
          onClick={onOpenQuickUpdate}
          className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold px-2.5 sm:px-3 py-1.5 rounded-lg flex items-center space-x-1.5 shadow-sm transition"
        >
          <Clock className="w-3.5 h-3.5" />
          <span className="hidden md:inline">1-Min</span>
          <span>Daily Update</span>
        </button>

        {/* Notification Bell */}
        <div className="relative">
          <button
            onClick={() => setShowNotifMenu(!showNotifMenu)}
            className="p-2 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg relative transition"
            title="Notifications"
          >
            <Bell className="w-5 h-5" />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 bg-red-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center animate-pulse">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {showNotifMenu && (
            <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white text-slate-800 rounded-xl shadow-2xl border border-slate-200 py-2 z-50 overflow-hidden animate-fadeIn">
              <div className="px-4 py-2 border-b border-slate-100 flex items-center justify-between">
                <span className="font-semibold text-sm text-slate-900">Notifications</span>
                <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-medium">
                  {unreadCount} unread
                </span>
              </div>
              <div className="max-h-72 overflow-y-auto divide-y divide-slate-100">
                {notifications.length === 0 ? (
                  <div className="py-8 text-center text-xs text-slate-400">
                    No notifications yet.
                  </div>
                ) : (
                  notifications.slice(0, 10).map((notif) => (
                    <div
                      key={notif.id}
                      onClick={() => handleNotificationClick(notif)}
                      className={`p-3 text-xs hover:bg-slate-50 cursor-pointer transition ${
                        !notif.read ? 'bg-blue-50/50' : ''
                      }`}
                    >
                      <div className="flex items-start justify-between gap-1 mb-1">
                        <span className="font-semibold text-slate-900">{notif.title}</span>
                        <span className="text-[10px] text-slate-400 whitespace-nowrap">
                          {new Date(notif.createdAt).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                      <p className="text-slate-600 text-[11px] leading-relaxed line-clamp-2">
                        {notif.message}
                      </p>
                      {notif.recipientDepartment && (
                        <span className="inline-block mt-1 text-[9px] bg-slate-200 text-slate-700 px-1.5 py-0.2 rounded font-mono">
                          {notif.recipientDepartment}
                        </span>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* User profile button & dropdown */}
        <div className="relative">
          <button
            onClick={() => setShowUserMenu(!showUserMenu)}
            className="flex items-center space-x-2 bg-slate-800 hover:bg-slate-750 text-slate-200 px-2.5 py-1.5 rounded-lg border border-slate-700 text-xs transition"
          >
            <div className="w-6 h-6 rounded bg-blue-500 text-white font-bold flex items-center justify-center text-xs">
              {userProfile?.employeeName ? userProfile.employeeName.charAt(0).toUpperCase() : 'U'}
            </div>
            <div className="text-left hidden lg:block max-w-[120px] truncate">
              <div className="font-semibold text-white leading-tight truncate">
                {userProfile?.employeeName || userProfile?.username || 'Authorized User'}
              </div>
              <div className="text-[10px] text-blue-300 truncate">
                {userProfile?.role || 'DEPARTMENT USER'}
              </div>
            </div>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
          </button>

          {showUserMenu && (
            <div className="absolute right-0 mt-2 w-64 bg-white text-slate-800 rounded-xl shadow-2xl border border-slate-200 py-2 z-50 animate-fadeIn">
              <div className="px-4 py-2 border-b border-slate-100">
                <div className="font-bold text-sm text-slate-900">
                  {userProfile?.employeeName || userProfile?.username}
                </div>
                <div className="text-xs text-slate-500 truncate">
                  {userProfile?.email || `@${userProfile?.username}`}
                </div>
                <div className="mt-1.5 flex items-center gap-1.5">
                  <span className="text-[10px] font-semibold bg-blue-100 text-blue-800 px-2 py-0.5 rounded">
                    {userProfile?.role}
                  </span>
                  <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded truncate max-w-[130px]">
                    {userProfile?.department}
                  </span>
                </div>
              </div>

              {isAdmin && (
                <div className="py-1">
                  <button
                    onClick={() => {
                      setShowUserMenu(false);
                      onSelectView('settings');
                    }}
                    className="w-full text-left px-4 py-2 text-xs text-slate-700 hover:bg-slate-100 flex items-center space-x-2"
                  >
                    <ShieldCheck className="w-4 h-4 text-slate-500" />
                    <span>Admin Panel &amp; Settings</span>
                  </button>
                </div>
              )}

              <div className="border-t border-slate-100 pt-1">
                <button
                  onClick={() => {
                    setShowUserMenu(false);
                    signOut();
                  }}
                  className="w-full text-left px-4 py-2 text-xs text-red-600 hover:bg-red-50 flex items-center space-x-2 font-semibold"
                >
                  <LogOut className="w-4 h-4 text-red-500" />
                  <span>Logout</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ============================================================
            15. MANDATORY LOGOUT BUTTON ON EVERY DASHBOARD
            ============================================================ */}
        <button
          onClick={() => signOut()}
          className="p-2 sm:px-3 sm:py-1.5 rounded-lg bg-red-950/40 hover:bg-red-900/60 text-red-300 border border-red-800/50 text-xs font-semibold flex items-center space-x-1.5 transition shadow-sm"
          title="Logout of System"
        >
          <LogOut className="w-4 h-4 text-red-400" />
          <span className="hidden sm:inline">Logout</span>
        </button>
      </div>
    </header>
  );
};
