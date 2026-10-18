import React, { useState } from 'react';
import {
  ShieldCheck,
  Building2,
  Lock,
  User,
  Eye,
  EyeOff,
  AlertCircle,
  HelpCircle,
  X,
  Search,
  CheckCircle2,
  KeyRound,
  Send,
  Building,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { COMPANY_NAME, SYSTEM_SUBTITLE, INITIAL_DEPARTMENTS } from '../constants';
import { STANDARD_DEPARTMENT_ACCOUNTS } from '../services/authService';

export const FACTORY_DEPARTMENTS = INITIAL_DEPARTMENTS.map((d) => ({
  id: d.code,
  code: d.code,
  name: d.name,
}));

export const LoginView: React.FC = () => {
  const { login, loading, requestPasswordReset } = useAuth();

  // Login Form State
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Forgot Password Modal State
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [forgotUsername, setForgotUsername] = useState('');
  const [forgotAuthorityName, setForgotAuthorityName] = useState('');
  const [forgotContact, setForgotContact] = useState('');
  const [forgotReason, setForgotReason] = useState('');
  const [forgotSubmitted, setForgotSubmitted] = useState(false);
  const [forgotSubmitting, setForgotSubmitting] = useState(false);
  const [forgotError, setForgotError] = useState<string | null>(null);

  // Department Directory Modal State
  const [showDirectoryModal, setShowDirectoryModal] = useState(false);
  const [directorySearch, setDirectorySearch] = useState('');

  const filteredDirectory = STANDARD_DEPARTMENT_ACCOUNTS.filter(
    (acc) =>
      acc.department.toLowerCase().includes(directorySearch.toLowerCase()) ||
      acc.authorityName.toLowerCase().includes(directorySearch.toLowerCase()) ||
      acc.username.toLowerCase().includes(directorySearch.toLowerCase()) ||
      acc.processNo.toLowerCase().includes(directorySearch.toLowerCase())
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanUser = username.trim();
    if (!cleanUser || !password) {
      setErrorMessage('Please enter both username and password.');
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);

    try {
      await login(cleanUser, password);
      // Successful login updates AuthContext userProfile, transitioning automatically to authorized dashboard
    } catch (err: any) {
      console.error('Login error:', err);
      setErrorMessage(err.message || 'Invalid username or password. Please verify your credentials.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotUsername.trim()) {
      setForgotError('Please enter your department username.');
      return;
    }

    setForgotSubmitting(true);
    setForgotError(null);
    try {
      await requestPasswordReset(
        forgotUsername.trim(),
        forgotAuthorityName.trim(),
        forgotContact.trim(),
        forgotReason.trim()
      );
      setForgotSubmitted(true);
    } catch (err: any) {
      console.error('Password reset request error:', err);
      setForgotError(err.message || 'Failed to submit reset request. Please contact administrator.');
    } finally {
      setForgotSubmitting(false);
    }
  };

  const selectDirectoryUser = (accUsername: string) => {
    setUsername(accUsername);
    setShowDirectoryModal(false);
    setErrorMessage(null);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col justify-between selection:bg-blue-600 selection:text-white font-sans">
      {/* Top Corporate Industrial Header */}
      <header className="bg-white border-b border-slate-200 py-3.5 px-4 sm:px-8 shadow-xs sticky top-0 z-20">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-3.5">
            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center font-black text-lg text-white shadow-sm shadow-blue-500/20">
              AG
            </div>
            <div>
              <h1 className="font-extrabold text-sm sm:text-base tracking-tight text-slate-900 uppercase">
                {COMPANY_NAME}
              </h1>
              <p className="text-[11px] text-slate-500 font-medium">{SYSTEM_SUBTITLE}</p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
              <ShieldCheck className="w-3.5 h-3.5 mr-1 text-blue-600" />
              Secure Manufacturing Access Gate
            </span>
          </div>
        </div>
      </header>

      {/* Main Industrial Login Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-16 flex items-center justify-center">
        <div className="w-full max-w-md">
          {/* Main Login Card */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden">
            {/* Blue Decorative Card Top Header */}
            <div className="bg-gradient-to-r from-blue-700 via-blue-600 to-indigo-700 p-6 text-white text-center">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-white/10 backdrop-blur-xs text-white border border-white/20 mb-3 shadow-inner">
                <Building2 className="w-6 h-6" />
              </div>
              <h2 className="text-xs font-bold uppercase tracking-widest text-blue-100">
                Authorized Access Only
              </h2>
              <h3 className="text-xl font-black tracking-tight uppercase mt-0.5 text-white">
                Factory Portal Login
              </h3>
              <p className="text-xs text-blue-100/90 mt-1 max-w-xs mx-auto">
                Sign in with your department username and secure password to access manufacturing operations.
              </p>
            </div>

            <div className="p-6 sm:p-8">
              {/* Error Message Alert */}
              {errorMessage && (
                <div className="mb-5 p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-start space-x-2.5 animate-in fade-in">
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  <div className="font-medium leading-relaxed">{errorMessage}</div>
                </div>
              )}

              {/* Login Form */}
              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Username Input */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                      Username <span className="text-red-500">*</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowDirectoryModal(true)}
                      className="text-[11px] text-blue-600 hover:text-blue-800 font-semibold transition flex items-center gap-1"
                    >
                      <HelpCircle className="w-3 h-3" />
                      <span>Username Directory</span>
                    </button>
                  </div>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                      <User className="w-4 h-4" />
                    </div>
                    <input
                      type="text"
                      autoFocus
                      required
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="e.g. ACCPLANNING, ACCQUALITY, ACCADMIN"
                      className="w-full bg-slate-50 hover:bg-white focus:bg-white border border-slate-300 rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition font-medium"
                    />
                  </div>
                </div>

                {/* Password Input */}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                    Password <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                      <Lock className="w-4 h-4" />
                    </div>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter your password"
                      className="w-full bg-slate-50 hover:bg-white focus:bg-white border border-slate-300 rounded-xl pl-10 pr-10 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition font-medium"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 transition"
                      tabIndex={-1}
                      title={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Show Password Checkbox & Forgot Password */}
                <div className="flex items-center justify-between pt-1">
                  <label className="flex items-center space-x-2 text-xs text-slate-600 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={showPassword}
                      onChange={(e) => setShowPassword(e.target.checked)}
                      className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="font-medium">Show Password</span>
                  </label>

                  <button
                    type="button"
                    onClick={() => {
                      setForgotUsername(username);
                      setShowForgotModal(true);
                    }}
                    className="text-xs text-blue-600 hover:text-blue-800 font-semibold transition"
                  >
                    Forgot Password?
                  </button>
                </div>

                {/* Login Button with Loading Indicator */}
                <button
                  type="submit"
                  disabled={submitting || loading}
                  className="w-full mt-2 py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold text-sm shadow-md shadow-blue-500/20 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2 cursor-pointer"
                >
                  {submitting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>Verifying Credentials...</span>
                    </>
                  ) : (
                    <span>Sign In to Manufacturing Portal</span>
                  )}
                </button>
              </form>

              {/* Security Policy Information */}
              <div className="mt-6 pt-5 border-t border-slate-100 text-center">
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  Protected Industrial System &bull; Accurate Gauging and Instruments Pvt Ltd.
                  <br />
                  Sessions are encrypted and authenticated. Direct URL bypass is denied.
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Industrial Footer */}
      <footer className="border-t border-slate-200 bg-white py-3 px-4 text-center text-xs text-slate-500">
        <p className="font-medium">
          &copy; {new Date().getFullYear()} {COMPANY_NAME}. All Rights Reserved. Manufacturing Monitoring &amp; Quality System.
        </p>
      </footer>

      {/* =========================================================================
          MODAL: FORGOT PASSWORD / ADMINISTRATOR ASSISTANCE REQUEST
          ========================================================================= */}
      {showForgotModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden animate-in fade-in">
            <div className="bg-gradient-to-r from-blue-700 to-indigo-800 p-4 text-white flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <KeyRound className="w-5 h-5 text-blue-200" />
                <h3 className="font-bold text-sm">Administrator Password Assistance</h3>
              </div>
              <button
                onClick={() => {
                  setShowForgotModal(false);
                  setForgotSubmitted(false);
                  setForgotError(null);
                }}
                className="text-blue-200 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {forgotSubmitted ? (
              <div className="p-6 text-center space-y-3">
                <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <h4 className="text-base font-bold text-slate-900">Reset Request Dispatched</h4>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Your request has been logged and sent with high priority to the System Administrator.
                  The administrator will review your account and issue a temporary activation credential.
                </p>
                <button
                  onClick={() => {
                    setShowForgotModal(false);
                    setForgotSubmitted(false);
                  }}
                  className="w-full mt-3 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-xs transition"
                >
                  Return to Login
                </button>
              </div>
            ) : (
              <form onSubmit={handleForgotSubmit} className="p-5 space-y-3.5">
                <p className="text-xs text-slate-600 leading-relaxed">
                  Please provide your department username and authority name. An administrator will verify and reset your access.
                </p>

                {forgotError && (
                  <div className="p-2.5 rounded-lg bg-red-50 text-red-700 text-xs border border-red-200">
                    {forgotError}
                  </div>
                )}

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Username <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={forgotUsername}
                    onChange={(e) => setForgotUsername(e.target.value)}
                    placeholder="e.g. ACCPLANNING, ACCQUALITY"
                    className="w-full text-xs p-2.5 rounded-xl border border-slate-300 font-bold focus:ring-1 focus:ring-blue-500 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Authority / Employee Name
                  </label>
                  <input
                    type="text"
                    value={forgotAuthorityName}
                    onChange={(e) => setForgotAuthorityName(e.target.value)}
                    placeholder="e.g. Dipak Kamthe"
                    className="w-full text-xs p-2.5 rounded-xl border border-slate-300 focus:ring-1 focus:ring-blue-500 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Contact Extension / Mobile
                  </label>
                  <input
                    type="text"
                    value={forgotContact}
                    onChange={(e) => setForgotContact(e.target.value)}
                    placeholder="e.g. Ext 204 or Mobile Number"
                    className="w-full text-xs p-2.5 rounded-xl border border-slate-300 focus:ring-1 focus:ring-blue-500 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Reason for Reset
                  </label>
                  <textarea
                    rows={2}
                    value={forgotReason}
                    onChange={(e) => setForgotReason(e.target.value)}
                    placeholder="Forgot password / Locked account..."
                    className="w-full text-xs p-2.5 rounded-xl border border-slate-300 focus:ring-1 focus:ring-blue-500 outline-none"
                  />
                </div>

                <div className="pt-2 flex items-center justify-end space-x-2">
                  <button
                    type="button"
                    onClick={() => setShowForgotModal(false)}
                    className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={forgotSubmitting}
                    className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-xs transition disabled:opacity-50 flex items-center space-x-1.5"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>{forgotSubmitting ? 'Submitting...' : 'Send Reset Request'}</span>
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL: OFFICIAL DEPARTMENT USERNAMES DIRECTORY
          (Shows department mappings and official usernames; NO PASSWORDS EXPOSED)
          ========================================================================= */}
      {showDirectoryModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden animate-in fade-in">
            <div className="bg-slate-900 p-4 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center space-x-2">
                <Building className="w-5 h-5 text-blue-400" />
                <div>
                  <h3 className="font-bold text-sm">Official Department Usernames Directory</h3>
                  <p className="text-[11px] text-slate-400">Accurate Gauging and Instruments Pvt Ltd</p>
                </div>
              </div>
              <button
                onClick={() => setShowDirectoryModal(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Search Bar */}
            <div className="p-3 border-b border-slate-200 bg-slate-50 shrink-0">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Filter by department, username, authority..."
                  value={directorySearch}
                  onChange={(e) => setDirectorySearch(e.target.value)}
                  className="w-full text-xs bg-white pl-9 pr-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                />
              </div>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto p-3 divide-y divide-slate-100">
              {/* Administrator Entry */}
              <div
                onClick={() => selectDirectoryUser('Administrator')}
                className="p-3 hover:bg-indigo-50/60 rounded-xl cursor-pointer transition flex items-center justify-between border border-transparent hover:border-indigo-200"
              >
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="font-black text-xs text-indigo-700 font-mono">ADMIN</span>
                    <span className="font-bold text-xs text-slate-900">System Administrator</span>
                    <span className="text-[10px] bg-indigo-100 text-indigo-800 font-bold px-1.5 py-0.2 rounded">
                      Universal Access
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">Authority: System Administrator</div>
                </div>
                <div className="text-right">
                  <span className="text-xs font-mono font-black text-indigo-600 bg-white border border-indigo-200 px-2.5 py-1 rounded-lg">
                    Administrator
                  </span>
                </div>
              </div>

              {/* Department Entries */}
              {filteredDirectory.map((acc) => (
                <div
                  key={acc.username}
                  onClick={() => selectDirectoryUser(acc.username)}
                  className="p-3 hover:bg-blue-50/60 rounded-xl cursor-pointer transition flex items-center justify-between border border-transparent hover:border-blue-200"
                >
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="font-bold text-xs text-blue-600 font-mono">{acc.processNo}</span>
                      <span className="font-bold text-xs text-slate-900">{acc.department}</span>
                      {acc.role === 'QUALITY' && (
                        <span className="text-[10px] bg-purple-100 text-purple-800 font-bold px-1.5 py-0.2 rounded">
                          Quality Inspection
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">Authority: {acc.authorityName}</div>
                  </div>
                  <div className="text-right">
                    <span className="text-xs font-mono font-black text-blue-600 bg-white border border-blue-200 px-2.5 py-1 rounded-lg">
                      {acc.username}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <div className="p-3 border-t border-slate-200 bg-slate-50 text-right shrink-0">
              <button
                onClick={() => setShowDirectoryModal(false)}
                className="px-4 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-200 rounded-lg transition"
              >
                Close Directory
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
