import React, { useState } from 'react';
import {
  Settings,
  Shield,
  Users,
  FileText,
  FileSpreadsheet,
  CheckCircle2,
  Lock,
  Plus,
  Search,
  Database,
  KeyRound,
  Eye,
  EyeOff,
  Edit2,
  UserX,
  UserCheck,
  RefreshCw,
  X,
  AlertCircle,
} from 'lucide-react';
import { AuditLog, Department, UserProfile, UserRole } from '../types';
import { exportToExcel } from '../utils/excel';
import { USER_ROLES } from '../constants';
import { useAuth } from '../context/AuthContext';
import {
  adminCreateUserAccount,
  adminResetUserPassword,
  adminToggleUserStatus,
  adminUpdateUserProfile,
} from '../services/authService';
import { FACTORY_DEPARTMENTS } from './LoginView';

interface SettingsViewProps {
  departments: Department[];
  auditLogs: AuditLog[];
  userProfiles: UserProfile[];
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  departments,
  auditLogs,
  userProfiles,
}) => {
  const { userProfile: currentUser, changePassword } = useAuth();
  const isAdmin = currentUser?.role === 'ADMIN';

  const [activeTab, setActiveTab] = useState<'users' | 'change_password' | 'audit' | 'system'>('users');
  const [userSearch, setUserSearch] = useState('');
  const [auditSearch, setAuditSearch] = useState('');
  const [auditActionFilter, setAuditActionFilter] = useState('');

  // Add User Modal State
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [formName, setFormName] = useState('');
  const [formCode, setFormCode] = useState('');
  const [formUsername, setFormUsername] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formDept, setFormDept] = useState(FACTORY_DEPARTMENTS[0].name);
  const [formRole, setFormRole] = useState<UserRole>('DEPARTMENT USER');
  const [formPassword, setFormPassword] = useState('');
  const [formStatus, setFormStatus] = useState<'Active' | 'Inactive'>('Active');
  const [showFormPassword, setShowFormPassword] = useState(false);
  const [savingUser, setSavingUser] = useState(false);
  const [userModalError, setUserModalError] = useState<string | null>(null);

  // Edit User Modal State
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [editName, setEditName] = useState('');
  const [editCode, setEditCode] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editDept, setEditDept] = useState('');
  const [editRole, setEditRole] = useState<UserRole>('DEPARTMENT USER');
  const [savingEdit, setSavingEdit] = useState(false);

  // Reset Password Modal State
  const [resetTargetUser, setResetTargetUser] = useState<UserProfile | null>(null);
  const [newResetPassword, setNewResetPassword] = useState('');
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [savingReset, setSavingReset] = useState(false);
  const [resetMsg, setResetMsg] = useState<string | null>(null);

  // Change Own Password State
  const [currentPwd, setCurrentPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [showPwdFields, setShowPwdFields] = useState(false);
  const [changingPwd, setChangingPwd] = useState(false);
  const [pwdMsg, setPwdMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Filtered Users
  const filteredUsers = userProfiles.filter((u) => {
    if (!userSearch) return true;
    const q = userSearch.toLowerCase();
    return (
      (u.employeeName && u.employeeName.toLowerCase().includes(q)) ||
      (u.displayName && u.displayName.toLowerCase().includes(q)) ||
      (u.username && u.username.toLowerCase().includes(q)) ||
      (u.employeeCode && u.employeeCode.toLowerCase().includes(q)) ||
      (u.email && u.email.toLowerCase().includes(q)) ||
      (u.department && u.department.toLowerCase().includes(q)) ||
      (u.role && u.role.toLowerCase().includes(q))
    );
  });

  // Filtered Audit Logs
  const filteredLogs = auditLogs.filter((log) => {
    if (auditActionFilter && log.action !== auditActionFilter) return false;
    if (auditSearch) {
      const q = auditSearch.toLowerCase();
      return (
        (log.module && log.module.toLowerCase().includes(q)) ||
        (log.userEmail && log.userEmail.toLowerCase().includes(q)) ||
        (log.action && log.action.toLowerCase().includes(q)) ||
        (log.newValue && log.newValue.toLowerCase().includes(q)) ||
        (log.oldValue && log.oldValue.toLowerCase().includes(q))
      );
    }
    return true;
  });

  const handleExportAuditLogs = () => {
    exportToExcel('Accurate_Gauging_Audit_Trail', 'Audit Logs', filteredLogs);
  };

  // Admin: Create User
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim() || !formUsername.trim() || !formPassword) {
      setUserModalError('Please fill in Employee Name, Username, and Password.');
      return;
    }

    if (formPassword.length < 6) {
      setUserModalError('Password must be at least 6 characters.');
      return;
    }

    setSavingUser(true);
    setUserModalError(null);

    try {
      await adminCreateUserAccount(
        {
          employeeName: formName.trim(),
          employeeCode: formCode.trim() || `EMP-${Date.now().toString().slice(-4)}`,
          username: formUsername.trim(),
          email: formEmail.trim() || `${formUsername.trim().toLowerCase()}@accurate.in`,
          department: formRole === 'ADMIN' ? 'ALL' : formDept,
          role: formRole,
          password: formPassword,
          status: formStatus,
        },
        currentUser?.email
      );

      setShowAddUserModal(false);
      setFormName('');
      setFormCode('');
      setFormUsername('');
      setFormEmail('');
      setFormPassword('');
      setFormStatus('Active');
    } catch (err: any) {
      console.error(err);
      setUserModalError(err.message || 'Failed to create user.');
    } finally {
      setSavingUser(false);
    }
  };

  // Admin: Open Edit User Modal
  const handleOpenEdit = (user: UserProfile) => {
    setEditingUser(user);
    setEditName(user.employeeName || user.displayName || '');
    setEditCode(user.employeeCode || '');
    setEditEmail(user.email || '');
    setEditDept(user.department || FACTORY_DEPARTMENTS[0].name);
    setEditRole(user.role);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    setSavingEdit(true);
    try {
      await adminUpdateUserProfile(
        editingUser.id,
        {
          employeeName: editName.trim(),
          displayName: editName.trim(),
          employeeCode: editCode.trim(),
          email: editEmail.trim(),
          department: editRole === 'ADMIN' ? 'ALL' : editDept,
          role: editRole,
        },
        currentUser?.email
      );
      setEditingUser(null);
    } catch (err) {
      console.error(err);
      alert('Failed to update user profile.');
    } finally {
      setSavingEdit(false);
    }
  };

  // Admin: Toggle Status (Activate / Deactivate)
  const handleToggleStatus = async (user: UserProfile) => {
    const newStatus: 'Active' | 'Inactive' =
      user.status === 'Inactive' || user.active === false ? 'Active' : 'Inactive';
    try {
      await adminToggleUserStatus(user.id, newStatus, currentUser?.email);
    } catch (err) {
      console.error(err);
      alert('Failed to update user status.');
    }
  };

  // Admin: Reset Password
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetTargetUser || !newResetPassword) return;
    if (newResetPassword.length < 6) {
      setResetMsg('Password must be at least 6 characters.');
      return;
    }

    setSavingReset(true);
    setResetMsg(null);
    try {
      await adminResetUserPassword(resetTargetUser.id, newResetPassword, currentUser?.email);
      alert(`Password for ${resetTargetUser.username} has been reset successfully.`);
      setResetTargetUser(null);
      setNewResetPassword('');
    } catch (err: any) {
      console.error(err);
      setResetMsg(err.message || 'Failed to reset password.');
    } finally {
      setSavingReset(false);
    }
  };

  // User/Admin: Change Own Password
  const handleChangeOwnPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwdMsg(null);

    if (newPwd !== confirmPwd) {
      setPwdMsg({ type: 'error', text: 'New password and confirmation do not match.' });
      return;
    }

    if (newPwd.length < 6) {
      setPwdMsg({ type: 'error', text: 'New password must be at least 6 characters long.' });
      return;
    }

    setChangingPwd(true);
    try {
      await changePassword(currentPwd, newPwd);
      setPwdMsg({ type: 'success', text: 'Your password has been changed successfully!' });
      setCurrentPwd('');
      setNewPwd('');
      setConfirmPwd('');
    } catch (err: any) {
      console.error(err);
      setPwdMsg({ type: 'error', text: err.message || 'Failed to change password.' });
    } finally {
      setChangingPwd(false);
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <Settings className="w-6 h-6 text-slate-700" />
            <span>Admin Panel, Security &amp; Access Control</span>
          </h2>
          <p className="text-xs sm:text-sm text-slate-500">
            User management, password security, department access controls, and audit trails
          </p>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex border-b border-slate-200 overflow-x-auto space-x-1 sm:space-x-4">
        {isAdmin && (
          <button
            onClick={() => setActiveTab('users')}
            className={`py-2.5 px-3 sm:px-4 text-xs font-bold border-b-2 transition flex items-center space-x-2 whitespace-nowrap ${
              activeTab === 'users'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>User Management ({userProfiles.length})</span>
          </button>
        )}

        <button
          onClick={() => setActiveTab('change_password')}
          className={`py-2.5 px-3 sm:px-4 text-xs font-bold border-b-2 transition flex items-center space-x-2 whitespace-nowrap ${
            activeTab === 'change_password'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <KeyRound className="w-4 h-4" />
          <span>Change Password</span>
        </button>

        {isAdmin && (
          <button
            onClick={() => setActiveTab('audit')}
            className={`py-2.5 px-3 sm:px-4 text-xs font-bold border-b-2 transition flex items-center space-x-2 whitespace-nowrap ${
              activeTab === 'audit'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>Audit Trail ({auditLogs.length})</span>
          </button>
        )}

        <button
          onClick={() => setActiveTab('system')}
          className={`py-2.5 px-3 sm:px-4 text-xs font-bold border-b-2 transition flex items-center space-x-2 whitespace-nowrap ${
            activeTab === 'system'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Shield className="w-4 h-4" />
          <span>Security &amp; Integrity</span>
        </button>
      </div>

      {/* ============================================================
          TAB 1: USER MANAGEMENT (ADMIN ONLY)
          ============================================================ */}
      {activeTab === 'users' && isAdmin && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
            {/* Header & Controls */}
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
              <div className="flex items-center space-x-2 w-full sm:w-auto">
                <div className="relative w-full sm:w-64">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Search name, username, dept..."
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-lg pl-8 pr-3 py-1.5 text-xs focus:ring-1 focus:ring-blue-500 outline-none"
                  />
                </div>
                <span className="text-slate-500 text-[11px] whitespace-nowrap">
                  Showing {filteredUsers.length} user{filteredUsers.length !== 1 ? 's' : ''}
                </span>
              </div>

              <button
                onClick={() => setShowAddUserModal(true)}
                className="w-full sm:w-auto bg-blue-600 hover:bg-blue-500 text-white font-bold px-4 py-2 rounded-xl flex items-center justify-center space-x-1.5 shadow-sm transition"
              >
                <Plus className="w-4 h-4" />
                <span>+ ADD USER</span>
              </button>
            </div>

            {/* Users Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100 border-b border-slate-200 text-slate-700 font-bold uppercase tracking-wider text-[10px]">
                  <tr>
                    <th className="p-3">Employee Name</th>
                    <th className="p-3">Code</th>
                    <th className="p-3">Username</th>
                    <th className="p-3">Department</th>
                    <th className="p-3">Role</th>
                    <th className="p-3">Status</th>
                    <th className="p-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredUsers.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-xs text-slate-400">
                        No employees found matching search criteria.
                      </td>
                    </tr>
                  ) : (
                    filteredUsers.map((u) => {
                      const isActive = u.status !== 'Inactive' && u.active !== false;
                      const isMasterAdmin = u.username === 'Administrator';

                      return (
                        <tr key={u.id} className="hover:bg-slate-50 transition">
                          <td className="p-3 font-bold text-slate-900">
                            {u.employeeName || u.displayName}
                          </td>
                          <td className="p-3 font-mono text-[11px] text-slate-600">
                            {u.employeeCode || '-'}
                          </td>
                          <td className="p-3 font-mono text-blue-700 font-semibold">
                            {u.username}
                          </td>
                          <td className="p-3 text-slate-700">
                            <span className="truncate max-w-[160px] inline-block" title={u.department}>
                              {u.department || 'ALL'}
                            </span>
                          </td>
                          <td className="p-3">
                            <span className="font-bold text-[10px] bg-slate-100 px-2 py-0.5 rounded text-slate-800 border border-slate-200">
                              {u.role}
                            </span>
                          </td>
                          <td className="p-3">
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                                isActive
                                  ? 'text-emerald-700 bg-emerald-100'
                                  : 'text-red-700 bg-red-100'
                              }`}
                            >
                              {isActive ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                          <td className="p-3 text-right space-x-1.5 whitespace-nowrap">
                            {/* Edit */}
                            <button
                              onClick={() => handleOpenEdit(u)}
                              className="p-1.5 text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded transition"
                              title="Edit User"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>

                            {/* Reset Password */}
                            <button
                              onClick={() => {
                                setResetTargetUser(u);
                                setNewResetPassword('');
                                setResetMsg(null);
                              }}
                              className="p-1.5 text-slate-600 hover:text-amber-600 hover:bg-amber-50 rounded transition"
                              title="Reset Password"
                            >
                              <KeyRound className="w-3.5 h-3.5" />
                            </button>

                            {/* Deactivate / Activate (Cannot deactivate master Administrator) */}
                            {!isMasterAdmin && (
                              <button
                                onClick={() => handleToggleStatus(u)}
                                className={`p-1.5 rounded transition ${
                                  isActive
                                    ? 'text-slate-600 hover:text-red-600 hover:bg-red-50'
                                    : 'text-slate-600 hover:text-emerald-600 hover:bg-emerald-50'
                                }`}
                                title={isActive ? 'Deactivate Account' : 'Activate Account'}
                              >
                                {isActive ? (
                                  <UserX className="w-3.5 h-3.5" />
                                ) : (
                                  <UserCheck className="w-3.5 h-3.5" />
                                )}
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================
          TAB 2: CHANGE PASSWORD (ADMIN & SELF)
          ============================================================ */}
      {activeTab === 'change_password' && (
        <div className="max-w-md bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
          <div>
            <h3 className="text-base font-bold text-slate-900">Change Account Password</h3>
            <p className="text-xs text-slate-500">
              Update password for <span className="font-semibold text-slate-700">{currentUser?.username}</span>
            </p>
          </div>

          {pwdMsg && (
            <div
              className={`p-3 rounded-xl text-xs flex items-center space-x-2 ${
                pwdMsg.type === 'success'
                  ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                  : 'bg-red-50 border border-red-200 text-red-800'
              }`}
            >
              {pwdMsg.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
              )}
              <span>{pwdMsg.text}</span>
            </div>
          )}

          <form onSubmit={handleChangeOwnPassword} className="space-y-3.5">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Current Password <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  type={showPwdFields ? 'text' : 'password'}
                  required
                  value={currentPwd}
                  onChange={(e) => setCurrentPwd(e.target.value)}
                  placeholder="Enter current password"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 focus:ring-1 focus:ring-blue-500 outline-none pr-9"
                />
                <button
                  type="button"
                  onClick={() => setShowPwdFields(!showPwdFields)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showPwdFields ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                New Password <span className="text-red-500">*</span>
              </label>
              <input
                type={showPwdFields ? 'text' : 'password'}
                required
                value={newPwd}
                onChange={(e) => setNewPwd(e.target.value)}
                placeholder="At least 6 characters"
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 focus:ring-1 focus:ring-blue-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Confirm New Password <span className="text-red-500">*</span>
              </label>
              <input
                type={showPwdFields ? 'text' : 'password'}
                required
                value={confirmPwd}
                onChange={(e) => setConfirmPwd(e.target.value)}
                placeholder="Re-enter new password"
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 focus:ring-1 focus:ring-blue-500 outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={changingPwd}
              className="w-full py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-sm transition disabled:opacity-50"
            >
              {changingPwd ? 'Updating Password...' : 'Save New Password'}
            </button>
          </form>
        </div>
      )}

      {/* ============================================================
          TAB 3: AUDIT TRAIL (ADMIN ONLY)
          ============================================================ */}
      {activeTab === 'audit' && isAdmin && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
          <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
            <div className="flex items-center space-x-2 w-full sm:w-auto">
              <div className="relative w-full sm:w-64">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search entity, action, user..."
                  value={auditSearch}
                  onChange={(e) => setAuditSearch(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-lg pl-8 pr-3 py-1.5 text-xs focus:ring-1 focus:ring-blue-500 outline-none"
                />
              </div>

              <select
                value={auditActionFilter}
                onChange={(e) => setAuditActionFilter(e.target.value)}
                className="bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs outline-none"
              >
                <option value="">All Actions</option>
                <option value="CREATE_USER">Create User</option>
                <option value="CHANGE_PASSWORD">Change Password</option>
                <option value="LOGIN_SUCCESS">Login Success</option>
                <option value="CREATE">Create</option>
                <option value="UPDATE">Update</option>
                <option value="EXCEL_IMPORT">Excel Import</option>
                <option value="QUALITY_REJECTION">Quality Rejection</option>
              </select>
            </div>

            <button
              onClick={handleExportAuditLogs}
              className="w-full sm:w-auto bg-slate-800 hover:bg-slate-700 text-white font-semibold px-3 py-1.5 rounded-lg flex items-center justify-center space-x-1.5"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Export Audit Excel</span>
            </button>
          </div>

          <div className="overflow-x-auto">
            {filteredLogs.length === 0 ? (
              <div className="p-12 text-center text-xs text-slate-400">
                No audit entries found matching filter.
              </div>
            ) : (
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100 border-b border-slate-200 text-slate-700 font-bold uppercase tracking-wider text-[10px]">
                  <tr>
                    <th className="p-3">Timestamp</th>
                    <th className="p-3">Action</th>
                    <th className="p-3">Entity</th>
                    <th className="p-3">User</th>
                    <th className="p-3">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                  {filteredLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50 transition">
                      <td className="p-3 text-slate-600 whitespace-nowrap">{log.timestamp}</td>
                      <td className="p-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            log.action.includes('CREATE') || log.action.includes('IMPORT')
                              ? 'bg-emerald-100 text-emerald-800'
                              : log.action.includes('REJECTION') || log.action.includes('DEACTIVATE')
                              ? 'bg-red-100 text-red-800'
                              : 'bg-blue-100 text-blue-800'
                          }`}
                        >
                          {log.action}
                        </span>
                      </td>
                      <td className="p-3 font-semibold text-slate-900">{log.module}</td>
                      <td className="p-3 text-slate-700">{log.userEmail}</td>
                      <td className="p-3 text-slate-600 max-w-md truncate font-sans" title={log.newValue || log.oldValue}>
                        {log.newValue || log.oldValue || '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ============================================================
          TAB 4: SYSTEM INTEGRITY
          ============================================================ */}
      {activeTab === 'system' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Accurate Gauging and Instruments Pvt Ltd – Security &amp; Compliance
              </h3>
              <p className="text-xs text-slate-500">Master Prompt Security &amp; Clean Live Data Compliance</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-xs">
              <div className="font-bold text-slate-900 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>SHA-256 Hashed Passwords</span>
              </div>
              <p className="text-slate-500 mt-1 text-[11px]">
                Passwords are cryptographically salted and hashed. Never stored or returned in plain text.
              </p>
            </div>

            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-xs">
              <div className="font-bold text-slate-900 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>Isolated Department Login</span>
              </div>
              <p className="text-slate-500 mt-1 text-[11px]">
                Normal users strictly confined to their department portal. Administrator has universal cross-department access.
              </p>
            </div>

            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-xs">
              <div className="font-bold text-slate-900 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>Zero Mock Data Mandate</span>
              </div>
              <p className="text-slate-500 mt-1 text-[11px]">
                Only the initial Administrator account exists at inception. Real employee accounts are created by Admin.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================
          MODAL: + ADD USER (ADMIN ONLY)
          ============================================================ */}
      {showAddUserModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 relative animate-fadeIn max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setShowAddUserModal(false)}
              className="absolute right-4 top-4 text-slate-400 hover:text-slate-600"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-base font-black text-slate-900 mb-1">USER MANAGEMENT – ADD USER</h3>
            <p className="text-xs text-slate-500 mb-4">
              Register a new department employee with authorized credentials.
            </p>

            {userModalError && (
              <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{userModalError}</span>
              </div>
            )}

            <form onSubmit={handleCreateUser} className="space-y-3.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Employee Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Rajesh Sharma"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    className="w-full text-xs p-2 rounded-xl border border-slate-300 outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Employee Code
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. AG-2026-104"
                    value={formCode}
                    onChange={(e) => setFormCode(e.target.value)}
                    className="w-full text-xs p-2 rounded-xl border border-slate-300 outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Username <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. quality_user"
                    value={formUsername}
                    onChange={(e) => setFormUsername(e.target.value)}
                    className="w-full text-xs p-2 rounded-xl border border-slate-300 outline-none focus:ring-1 focus:ring-blue-500 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Email
                  </label>
                  <input
                    type="email"
                    placeholder="user@accurate.in"
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                    className="w-full text-xs p-2 rounded-xl border border-slate-300 outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Department <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={formDept}
                    onChange={(e) => setFormDept(e.target.value)}
                    disabled={formRole === 'ADMIN'}
                    className="w-full text-xs p-2 rounded-xl border border-slate-300 outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-slate-100"
                  >
                    {FACTORY_DEPARTMENTS.map((d: any) => (
                      <option key={d.id} value={d.name}>
                        {d.code} - {d.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Role <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={formRole}
                    onChange={(e) => setFormRole(e.target.value as UserRole)}
                    className="w-full text-xs p-2 rounded-xl border border-slate-300 outline-none focus:ring-1 focus:ring-blue-500 font-semibold"
                  >
                    {USER_ROLES.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Initial Password <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type={showFormPassword ? 'text' : 'password'}
                      required
                      placeholder="At least 6 characters"
                      value={formPassword}
                      onChange={(e) => setFormPassword(e.target.value)}
                      className="w-full text-xs p-2 rounded-xl border border-slate-300 outline-none focus:ring-1 focus:ring-blue-500 pr-8"
                    />
                    <button
                      type="button"
                      onClick={() => setShowFormPassword(!showFormPassword)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      {showFormPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Status
                  </label>
                  <select
                    value={formStatus}
                    onChange={(e) => setFormStatus(e.target.value as 'Active' | 'Inactive')}
                    className="w-full text-xs p-2 rounded-xl border border-slate-300 outline-none focus:ring-1 focus:ring-blue-500 font-bold"
                  >
                    <option value="Active">Active</option>
                    <option value="Inactive">Inactive</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowAddUserModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 text-xs font-semibold hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingUser}
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition disabled:opacity-50"
                >
                  {savingUser ? 'Creating...' : 'Create User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================
          MODAL: EDIT USER (ADMIN ONLY)
          ============================================================ */}
      {editingUser && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 relative animate-fadeIn">
            <button
              onClick={() => setEditingUser(null)}
              className="absolute right-4 top-4 text-slate-400 hover:text-slate-600"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-base font-black text-slate-900 mb-1">Edit User Profile</h3>
            <p className="text-xs text-slate-500 mb-4 font-mono">
              Username: <span className="font-bold text-blue-600">{editingUser.username}</span>
            </p>

            <form onSubmit={handleSaveEdit} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Employee Name
                </label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full text-xs p-2 rounded-xl border border-slate-300"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Employee Code
                </label>
                <input
                  type="text"
                  value={editCode}
                  onChange={(e) => setEditCode(e.target.value)}
                  className="w-full text-xs p-2 rounded-xl border border-slate-300"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Email
                </label>
                <input
                  type="email"
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  className="w-full text-xs p-2 rounded-xl border border-slate-300"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Department
                </label>
                <select
                  value={editDept}
                  onChange={(e) => setEditDept(e.target.value)}
                  disabled={editRole === 'ADMIN'}
                  className="w-full text-xs p-2 rounded-xl border border-slate-300 disabled:bg-slate-100"
                >
                  {FACTORY_DEPARTMENTS.map((d) => (
                    <option key={d.id} value={d.name}>
                      {d.code} - {d.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Role
                </label>
                <select
                  value={editRole}
                  onChange={(e) => setEditRole(e.target.value as UserRole)}
                  className="w-full text-xs p-2 rounded-xl border border-slate-300 font-semibold"
                >
                  {USER_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  className="px-4 py-2 rounded-xl border border-slate-300 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingEdit}
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold"
                >
                  {savingEdit ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================
          MODAL: RESET PASSWORD (ADMIN ONLY)
          ============================================================ */}
      {resetTargetUser && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-slate-200 relative animate-fadeIn">
            <button
              onClick={() => setResetTargetUser(null)}
              className="absolute right-4 top-4 text-slate-400 hover:text-slate-600"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center space-x-2 mb-3 text-amber-600">
              <KeyRound className="w-5 h-5" />
              <h3 className="text-base font-bold text-slate-900">Reset User Password</h3>
            </div>

            <p className="text-xs text-slate-500 mb-4">
              Enter a new password for employee <span className="font-bold text-slate-800">{resetTargetUser.username}</span>.
            </p>

            {resetMsg && (
              <div className="mb-3 p-2.5 rounded-lg bg-red-50 text-red-700 text-xs">
                {resetMsg}
              </div>
            )}

            <form onSubmit={handleResetPassword} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  New Password <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type={showResetPassword ? 'text' : 'password'}
                    required
                    placeholder="At least 6 characters"
                    value={newResetPassword}
                    onChange={(e) => setNewResetPassword(e.target.value)}
                    className="w-full text-xs p-2 rounded-xl border border-slate-300 pr-8"
                  />
                  <button
                    type="button"
                    onClick={() => setShowResetPassword(!showResetPassword)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400"
                  >
                    {showResetPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setResetTargetUser(null)}
                  className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingReset}
                  className="px-4 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold"
                >
                  {savingReset ? 'Resetting...' : 'Reset Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
