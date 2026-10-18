import React, { useState } from 'react';
import {
  Bell,
  CheckCheck,
  CheckCircle2,
  Clock,
  AlertTriangle,
  ArrowRightLeft,
  ShieldAlert,
  Search,
  Filter,
  Eye,
  ExternalLink,
  Trash2,
  X,
  FileText,
} from 'lucide-react';
import { SystemNotification } from '../types';
import {
  markNotificationAsRead,
  markAllNotificationsAsRead,
  deleteNotification,
} from '../services/db';
import { useAuth } from '../context/AuthContext';
import { isDepartmentMatch } from '../utils/departmentUtils';

interface DepartmentNotificationCenterProps {
  departmentName: string;
  notifications: SystemNotification[];
  onNavigateToTab?: (tabId: string) => void;
  onOpenHandoverDetails?: (handoverId: string) => void;
}

export const DepartmentNotificationCenter: React.FC<DepartmentNotificationCenterProps> = ({
  departmentName,
  notifications,
  onNavigateToTab,
  onOpenHandoverDetails,
}) => {
  const { userProfile } = useAuth();
  const isAdmin = userProfile?.role === 'ADMIN';

  const [activeFilter, setActiveFilter] = useState<'ALL' | 'UNREAD' | 'HANDOVER' | 'REJECTION' | 'QUALITY'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedNotif, setSelectedNotif] = useState<SystemNotification | null>(null);

  // Scoped notifications for this department
  const scopedNotifications = notifications.filter((n) => {
    if (isAdmin && !departmentName) return true;
    if (n.recipientUserId && userProfile?.id && n.recipientUserId === userProfile.id) return true;
    const target = n.recipientDepartment || n.toDepartment;
    if (!target && !n.recipientRole) return true;
    return isDepartmentMatch(target, departmentName);
  });

  const unreadCount = scopedNotifications.filter((n) => !n.read && !n.isRead).length;

  const filteredNotifications = scopedNotifications.filter((n) => {
    const isUnread = !n.read && !n.isRead;
    if (activeFilter === 'UNREAD' && !isUnread) return false;
    if (activeFilter === 'HANDOVER' && !n.type.includes('HANDOVER')) return false;
    if (activeFilter === 'REJECTION' && !n.type.includes('REJECT')) return false;
    if (
      activeFilter === 'QUALITY' &&
      !n.type.includes('QUALITY') &&
      !n.recipientDepartment?.toLowerCase().includes('quality')
    ) {
      return false;
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const match =
        n.title.toLowerCase().includes(q) ||
        n.message.toLowerCase().includes(q) ||
        (n.machineNumber && n.machineNumber.toLowerCase().includes(q)) ||
        (n.handoverId && n.handoverId.toLowerCase().includes(q)) ||
        (n.fromDepartment && n.fromDepartment.toLowerCase().includes(q));
      if (!match) return false;
    }
    return true;
  });

  const handleMarkAsRead = async (notifId: string) => {
    try {
      await markNotificationAsRead(notifId);
    } catch (err) {
      console.error('Failed to mark read:', err);
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      await markAllNotificationsAsRead(departmentName, userProfile?.role);
    } catch (err) {
      console.error('Failed to mark all as read:', err);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteNotification(id);
      if (selectedNotif?.id === id) {
        setSelectedNotif(null);
      }
    } catch (err) {
      console.error('Failed to delete notification:', err);
    }
  };

  const handleTakeAction = (notif: SystemNotification) => {
    // Mark as read automatically when taking action
    if (!notif.read && !notif.isRead) {
      handleMarkAsRead(notif.id);
    }

    if (notif.type.includes('REJECT') || notif.type.includes('CORRECTIVE')) {
      if (onNavigateToTab) onNavigateToTab('rejections');
    } else if (notif.type.includes('QUALITY')) {
      if (onNavigateToTab) onNavigateToTab('quality_handover');
    } else if (notif.type.includes('HANDOVER')) {
      if (onNavigateToTab) onNavigateToTab('incoming_handovers');
      if (onOpenHandoverDetails && notif.handoverId) {
        onOpenHandoverDetails(notif.handoverId);
      }
    } else {
      if (onNavigateToTab) onNavigateToTab('my_work');
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 rounded-xl bg-blue-50 text-blue-600 relative">
            <Bell className="w-5 h-5" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 px-1.5 py-0.5 rounded-full text-[10px] font-black bg-red-600 text-white animate-pulse">
                {unreadCount}
              </span>
            )}
          </div>
          <div>
            <h2 className="text-base font-black text-slate-900 tracking-tight">
              {departmentName} Notification Center
            </h2>
            <p className="text-xs text-slate-500">
              Real-time shop-floor operational alerts, handover transitions &amp; quality notifications
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          {unreadCount > 0 && (
            <button
              onClick={handleMarkAllAsRead}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl flex items-center space-x-1.5 transition"
            >
              <CheckCheck className="w-3.5 h-3.5 text-blue-600" />
              <span>Mark All as Read ({unreadCount})</span>
            </button>
          )}
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-3">
        <div className="flex flex-wrap gap-1.5">
          {[
            { id: 'ALL', label: 'All Alerts', count: scopedNotifications.length },
            { id: 'UNREAD', label: 'Unread', count: unreadCount },
            {
              id: 'HANDOVER',
              label: 'Handovers',
              count: scopedNotifications.filter((n) => n.type.includes('HANDOVER')).length,
            },
            {
              id: 'REJECTION',
              label: 'Rejections',
              count: scopedNotifications.filter((n) => n.type.includes('REJECT')).length,
            },
            {
              id: 'QUALITY',
              label: 'Quality',
              count: scopedNotifications.filter((n) => n.type.includes('QUALITY')).length,
            },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveFilter(tab.id as any)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center space-x-1.5 ${
                activeFilter === tab.id
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              <span>{tab.label}</span>
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                  activeFilter === tab.id ? 'bg-blue-900/40 text-white' : 'bg-slate-100 text-slate-600'
                }`}
              >
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search notifications..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg w-full sm:w-60 focus:outline-hidden focus:border-blue-500"
          />
        </div>
      </div>

      {/* Notifications List */}
      <div className="space-y-3">
        {filteredNotifications.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-xs text-slate-400">
            No notifications found under {activeFilter.toLowerCase()} filter for {departmentName}.
          </div>
        ) : (
          filteredNotifications.map((notif) => {
            const isUnread = !notif.read && !notif.isRead;
            const isRejection = notif.type.includes('REJECT') || notif.type.includes('RETURN');
            const isHandover = notif.type.includes('HANDOVER');
            const isQuality = notif.type.includes('QUALITY');

            return (
              <div
                key={notif.id}
                className={`p-4 rounded-2xl border transition shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4 ${
                  isUnread
                    ? 'bg-blue-50/40 border-blue-200 hover:border-blue-300'
                    : 'bg-white border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="flex items-start space-x-3.5 min-w-0">
                  <div
                    className={`p-2.5 rounded-xl shrink-0 mt-0.5 ${
                      isRejection
                        ? 'bg-red-100 text-red-700'
                        : isHandover
                        ? 'bg-blue-100 text-blue-700'
                        : isQuality
                        ? 'bg-purple-100 text-purple-700'
                        : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    {isRejection ? (
                      <AlertTriangle className="w-4 h-4" />
                    ) : isHandover ? (
                      <ArrowRightLeft className="w-4 h-4" />
                    ) : isQuality ? (
                      <ShieldAlert className="w-4 h-4" />
                    ) : (
                      <Bell className="w-4 h-4" />
                    )}
                  </div>

                  <div className="space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-xs text-slate-900">{notif.title}</span>
                      {isUnread && (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-blue-600 text-white">
                          Unread
                        </span>
                      )}
                      {notif.priority && (
                        <span
                          className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                            notif.priority === 'Critical'
                              ? 'bg-red-100 text-red-700'
                              : notif.priority === 'High'
                              ? 'bg-amber-100 text-amber-700'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {notif.priority}
                        </span>
                      )}
                      <span className="text-[10px] font-mono text-slate-400">
                        {new Date(notif.createdAt).toLocaleString()}
                      </span>
                    </div>

                    <p className="text-xs text-slate-700 font-medium leading-relaxed">
                      {notif.message}
                    </p>

                    <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500 font-semibold pt-0.5">
                      {notif.machineNumber && (
                        <span className="font-mono text-slate-900 bg-slate-100 px-1.5 py-0.5 rounded">
                          Machine {notif.machineNumber}
                        </span>
                      )}
                      {notif.handoverId && (
                        <span className="font-mono text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded">
                          ID: {notif.handoverId}
                        </span>
                      )}
                      {notif.fromDepartment && (
                        <span>From: {notif.fromDepartment}</span>
                      )}
                      {notif.toDepartment && (
                        <span>To: {notif.toDepartment}</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Card Actions */}
                <div className="flex items-center space-x-2 shrink-0 self-end md:self-center">
                  <button
                    onClick={() => setSelectedNotif(notif)}
                    className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold flex items-center space-x-1 transition"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>View</span>
                  </button>

                  {isUnread && (
                    <button
                      onClick={() => handleMarkAsRead(notif.id)}
                      className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold flex items-center space-x-1 transition"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Mark Read</span>
                    </button>
                  )}

                  <button
                    onClick={() => handleTakeAction(notif)}
                    className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center space-x-1.5 shadow-xs transition"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Take Action</span>
                  </button>

                  <button
                    onClick={() => handleDelete(notif.id)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition"
                    title="Delete alert"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* NOTIFICATION DETAILS MODAL */}
      {selectedNotif && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200 overflow-hidden text-slate-900">
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Bell className="w-4 h-4 text-blue-400" />
                <h3 className="font-bold text-sm">{selectedNotif.title}</h3>
              </div>
              <button onClick={() => setSelectedNotif(null)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase font-bold text-slate-400">Type</span>
                  <span className="font-bold text-blue-700">{selectedNotif.type}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase font-bold text-slate-400">Timestamp</span>
                  <span className="font-mono text-slate-600">
                    {new Date(selectedNotif.createdAt).toLocaleString()}
                  </span>
                </div>
                {selectedNotif.machineNumber && (
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase font-bold text-slate-400">Machine</span>
                    <span className="font-bold text-slate-900">Machine {selectedNotif.machineNumber}</span>
                  </div>
                )}
                {selectedNotif.handoverId && (
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase font-bold text-slate-400">Handover ID</span>
                    <span className="font-mono font-bold text-blue-700">{selectedNotif.handoverId}</span>
                  </div>
                )}
                {selectedNotif.fromDepartment && (
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase font-bold text-slate-400">From Department</span>
                    <span className="font-semibold text-slate-700">{selectedNotif.fromDepartment}</span>
                  </div>
                )}
                {selectedNotif.toDepartment && (
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase font-bold text-slate-400">Target Department</span>
                    <span className="font-semibold text-slate-700">{selectedNotif.toDepartment}</span>
                  </div>
                )}
              </div>

              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Message Content</span>
                <p className="p-3.5 bg-slate-100 rounded-xl text-slate-800 font-medium leading-relaxed">
                  {selectedNotif.message}
                </p>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                <button
                  onClick={() => {
                    handleDelete(selectedNotif.id);
                  }}
                  className="px-3 py-1.5 text-red-600 hover:bg-red-50 rounded-xl text-xs font-bold"
                >
                  Delete Alert
                </button>

                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => {
                      handleTakeAction(selectedNotif);
                      setSelectedNotif(null);
                    }}
                    className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center space-x-1.5"
                  >
                    <ExternalLink className="w-3 h-3" />
                    <span>Open Work / Take Action</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
