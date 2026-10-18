import React, { useState, useEffect } from 'react';
import {
  Building2,
  ShieldCheck,
  Lock,
  User,
  Eye,
  EyeOff,
  AlertCircle,
  HelpCircle,
  X,
  Search,
  CheckCircle2,
  Calendar,
  Wrench,
  Boxes,
  Cpu,
  Truck,
  CheckSquare,
  ArrowRight,
  Clock,
  Radio,
  RefreshCw,
  LogOut,
  SlidersHorizontal,
  FileSpreadsheet,
} from 'lucide-react';
import { COMPANY_NAME, SYSTEM_SUBTITLE, INITIAL_DEPARTMENTS } from '../constants';
import { useAuth } from '../context/AuthContext';
import { UserProfile } from '../types';

export interface DepartmentInfo {
  id: string;
  code: string;
  name: string;
  category: 'Engineering' | 'Planning' | 'Supply Chain' | 'Quality' | 'Inventory' | 'Fabrication' | 'Machining' | 'Assembly' | 'Finishing' | 'Electronics' | 'Testing & Inspection' | 'Dispatch';
  icon: any;
  description: string;
}

export const ALL_DEPARTMENTS: DepartmentInfo[] = [
  { id: '01', code: '01', name: '01 Design', category: 'Engineering', icon: Wrench, description: 'CAD modeling, component engineering, 3D modeling & drawing approvals' },
  { id: '02', code: '02', name: '02 Planning', category: 'Planning', icon: Calendar, description: 'Master production schedules, roadmap, accessories & open cable planning' },
  { id: '03', code: '03', name: '03 Purchase', category: 'Supply Chain', icon: Boxes, description: 'Procurement of raw materials, bought-out items & vendor tracking' },
  { id: '04', code: '04', name: '04 Inward Quality', category: 'Quality', icon: CheckSquare, description: 'Receiving inspection, material verification & rejection workflows' },
  { id: '05', code: '05', name: '05 Store', category: 'Inventory', icon: Boxes, description: 'Raw stock receipt, bin allocation, material issue & inventory' },
  { id: '06-A', code: '06-A', name: '06-A Metal Shop', category: 'Fabrication', icon: Wrench, description: 'Metal cutting, machining, base fabrication & precision structural work' },
  { id: '06-B', code: '06-B', name: '06-B Granite Shop', category: 'Fabrication', icon: Wrench, description: 'Granite cutting, base preparation & granite guide preparation' },
  { id: '07A', code: '07A', name: '07A-Lapping-Flatness & Insert Fitment', category: 'Machining', icon: Wrench, description: 'Ultra-precision flatness lapping, insert fitment & air bearing surfaces' },
  { id: '07B', code: '07B', name: '07B-Lapping-Y3 & Slot', category: 'Machining', icon: Wrench, description: 'Precision Y3 guide lapping, slot finishing & straightness alignment' },
  { id: '07C', code: '07C', name: '07C-Lapping-RTLT & Top Bottom', category: 'Machining', icon: Wrench, description: 'RTLT reference surface lapping & top-bottom master planar finishing' },
  { id: '08', code: '08', name: '08 Sub Assembly', category: 'Assembly', icon: Cpu, description: 'Z-axis assembly, bridge sub-assemblies & mechanical drive units' },
  { id: '09', code: '09', name: '09 Guard Fitment', category: 'Assembly', icon: Wrench, description: 'Bellow covers, telescopic guards & sheet metal protective casing' },
  { id: '10-A', code: '10-A', name: '10-A Paint Shop-A Class Item', category: 'Finishing', icon: Wrench, description: 'A-Class surface finishing, primer coating & polyurethane topcoat' },
  { id: '10-B', code: '10-B', name: '10-B Paint Shop-Guard Set', category: 'Finishing', icon: Wrench, description: 'Industrial guard powder coating & protective chemical finishing' },
  { id: '11-A', code: '11-A', name: '11-A Electronics-Cable Set', category: 'Electronics', icon: Cpu, description: 'Harness routing, cable tray wiring & controller cable assembly' },
  { id: '11-B', code: '11-B', name: '11-B Electronics-Tuning', category: 'Electronics', icon: Cpu, description: 'Servo drive tuning, scale alignment, encoder testing & electronics' },
  { id: '12', code: '12', name: '12 Assembly', category: 'Assembly', icon: Cpu, description: 'Main machine integration, axis mounting & mechanical assembly' },
  { id: '12-BRIDGE', code: '12 Bridge Assembly', name: '12 Bridge Assembly', category: 'Assembly', icon: Cpu, description: 'Bridge beam mounting, carriage assembly & structural integration' },
  { id: '13', code: '13', name: '13 IT-Computer Inspection', category: 'Testing & Inspection', icon: Cpu, description: 'Controller PC staging, software configuration, probe interface & network' },
  { id: '14', code: '14', name: '14 Calibration', category: 'Quality', icon: CheckSquare, description: 'Laser interferometer calibration, volumetric error compensation & certification' },
  { id: '15', code: '15', name: '15 Packing', category: 'Dispatch', icon: Truck, description: 'Moisture barrier sealing, wooden crating, dispatch packaging & shipping' },
];

interface HomeLandingViewProps {
  onSelectDepartment: (deptName: string) => void;
  onSelectAdmin: () => void;
  onOpenGlobalSearch: () => void;
}

export const HomeLandingView: React.FC<HomeLandingViewProps> = ({
  onSelectDepartment,
  onSelectAdmin,
  onOpenGlobalSearch,
}) => {
  const { currentUser, userProfile, login, signOut } = useAuth();

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');

  // Optional Sign-In Modal (for operators who want to authenticate for protected changes)
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [targetDeptForLogin, setTargetDeptForLogin] = useState<string | null>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [showForgotModal, setShowForgotModal] = useState(false);

  // Live Clock & Shift
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Compute Current Factory Shift
  const currentHour = currentTime.getHours();
  let currentShift = 'General Shift (09:00 - 17:30)';
  if (currentHour >= 6 && currentHour < 14) {
    currentShift = 'Shift 1 (06:00 - 14:00)';
  } else if (currentHour >= 14 && currentHour < 22) {
    currentShift = 'Shift 2 (14:00 - 22:00)';
  } else if (currentHour >= 22 || currentHour < 6) {
    currentShift = 'Shift 3 / Night Shift';
  }

  // Filter Categories
  const categories = [
    'All',
    'Engineering',
    'Planning',
    'Supply Chain',
    'Quality',
    'Fabrication',
    'Machining',
    'Assembly',
    'Finishing',
    'Electronics',
    'Testing & Inspection',
    'Dispatch',
  ];

  const filteredDepts = ALL_DEPARTMENTS.filter((d) => {
    const matchCategory =
      selectedCategory === 'All' ||
      d.category.toLowerCase().includes(selectedCategory.toLowerCase());
    const matchQuery =
      !searchQuery ||
      d.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      d.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      d.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchCategory && matchQuery;
  });

  // Direct Department Navigation (No login barrier)
  const handleDepartmentClick = (deptName: string) => {
    onSelectDepartment(deptName);
  };

  // Direct Administrator Navigation (No login barrier)
  const handleAdminClick = () => {
    onSelectAdmin();
  };

  // Submit Login for protected actions
  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setAuthError('Please provide both username and password.');
      return;
    }

    setSubmitting(true);
    setAuthError(null);

    try {
      const profile = await login(username.trim(), password, targetDeptForLogin || '');
      if (!profile) {
        setAuthError('Invalid credentials. Please verify your username and password.');
        setSubmitting(false);
        return;
      }

      setShowLoginModal(false);
      if (targetDeptForLogin) {
        onSelectDepartment(targetDeptForLogin);
      }
    } catch (err: any) {
      console.error('Login error:', err);
      setAuthError(err.message || 'Authentication service is currently unavailable. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col font-sans antialiased selection:bg-blue-600 selection:text-white">
      {/* Top Banner & Company Header (Professional White + Blue theme) */}
      <header className="border-b border-slate-200 bg-white sticky top-0 z-30 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex flex-col md:flex-row items-center justify-between gap-3">
          {/* Logo & Company Name */}
          <div className="flex items-center space-x-3.5 text-center md:text-left">
            <div className="w-11 h-11 rounded-xl bg-[#0f294a] flex items-center justify-center text-white shadow-xs font-black text-xl shrink-0">
              A
            </div>
            <div>
              <h1 className="text-base sm:text-lg font-black tracking-tight text-[#0f294a] uppercase flex items-center gap-2 justify-center md:justify-start">
                {COMPANY_NAME}
              </h1>
              <p className="text-xs text-blue-700 font-semibold tracking-wide flex items-center gap-1.5 justify-center md:justify-start">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse inline-block" />
                {SYSTEM_SUBTITLE}
              </p>
            </div>
          </div>

          {/* Plant Shift, Global Search & User Account Status */}
          <div className="flex items-center flex-wrap justify-center gap-2.5">
            {/* Live Shift Badge */}
            <div className="hidden sm:flex items-center space-x-2 bg-blue-50 border border-blue-200 px-3 py-1.5 rounded-lg text-xs font-semibold text-blue-900">
              <Clock className="w-3.5 h-3.5 text-blue-600" />
              <span>{currentShift}</span>
              <span className="text-slate-400 font-normal">|</span>
              <span className="font-mono text-blue-700">{currentTime.toLocaleTimeString()}</span>
            </div>

            {/* Quick Search Shortcut */}
            <button
              onClick={onOpenGlobalSearch}
              className="flex items-center space-x-2 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium border border-slate-200 transition"
              title="Global Search (Ctrl+K or Cmd+K)"
            >
              <Search className="w-3.5 h-3.5 text-slate-500" />
              <span className="hidden md:inline">Global Search</span>
              <kbd className="text-[10px] bg-white text-slate-600 px-1.5 py-0.5 rounded border border-slate-300 font-mono">
                ⌘K
              </kbd>
            </button>

            {/* User Session or Operator Login */}
            {userProfile ? (
              <div className="flex items-center space-x-2 bg-slate-100 border border-slate-200 pl-3 pr-1.5 py-1 rounded-lg text-xs">
                <div className="flex flex-col text-right">
                  <span className="font-bold text-slate-900 leading-tight">
                    {userProfile.employeeName}
                  </span>
                  <span className="text-[10px] text-blue-700 font-semibold">
                    {userProfile.role} &bull; {userProfile.department}
                  </span>
                </div>
                <button
                  onClick={() => signOut()}
                  className="p-1 text-slate-400 hover:text-red-600 hover:bg-white rounded transition"
                  title="Sign out of current operator session"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => {
                  setTargetDeptForLogin(null);
                  setShowLoginModal(true);
                }}
                className="px-3 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-semibold border border-blue-200 transition flex items-center space-x-1.5"
              >
                <User className="w-3.5 h-3.5 text-blue-600" />
                <span>Operator Sign In</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Welcome Notice Banner */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2">
              <span className="px-2.5 py-0.5 rounded-md bg-blue-100 text-blue-800 text-[11px] font-bold uppercase tracking-wider">
                Industrial Manufacturing Execution System
              </span>
              <span className="flex items-center text-xs text-emerald-700 font-medium gap-1">
                <Radio className="w-3 h-3 text-emerald-600" />
                Database Connected
              </span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-slate-900 mt-1.5 tracking-tight">
              Factory Department &amp; Plant Operations Hub
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 mt-1 max-w-3xl leading-relaxed">
              Select any factory department to manage active work orders, daily updates, production planning, quality inspections, and machine handovers. No login required for standard monitoring.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={handleAdminClick}
              className="px-4 py-2.5 rounded-xl bg-[#0f294a] hover:bg-[#1a3a60] text-white font-bold text-xs shadow-xs flex items-center space-x-2 transition"
            >
              <ShieldCheck className="w-4 h-4 text-blue-300" />
              <span>Admin Dashboard</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Highlighted ADMINISTRATOR Master Control Card */}
        <section
          onClick={handleAdminClick}
          className="bg-gradient-to-r from-[#0f294a] via-[#123359] to-[#0f294a] text-white rounded-2xl p-6 border-2 border-blue-900 shadow-md hover:border-blue-500 transition cursor-pointer group"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5">
            <div className="flex items-start space-x-4">
              <div className="w-13 h-13 rounded-2xl bg-blue-600/30 border border-blue-400/40 flex items-center justify-center text-white shrink-0 group-hover:scale-105 transition">
                <ShieldCheck className="w-7 h-7 text-blue-300" />
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center space-x-2.5">
                  <span className="px-2.5 py-0.5 rounded bg-blue-500/20 text-blue-200 text-[10px] font-black uppercase tracking-wider border border-blue-400/30">
                    MASTER CONTROL &amp; PLANT MONITORING
                  </span>
                  <h3 className="text-lg sm:text-xl font-black text-white tracking-tight">
                    ADMINISTRATOR PORTAL
                  </h3>
                </div>
                <p className="text-xs sm:text-sm text-blue-100/80 max-w-3xl leading-relaxed">
                  Plant-wide executive overview, 20-department machine tracking lifecycle, yearly/monthly/weekly master plans, Quality Operation Master, Excel import &amp; validation, audit logs, and full administrative configuration.
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-2 shrink-0">
              <span className="px-4 py-2 rounded-xl bg-blue-600 group-hover:bg-blue-500 text-white font-bold text-xs shadow-sm flex items-center space-x-2 transition">
                <span>Enter Admin Dashboard</span>
                <ArrowRight className="w-4 h-4" />
              </span>
            </div>
          </div>
        </section>

        {/* Category Filters and Search Bar */}
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter by code, department name, or operation..."
                className="w-full bg-white border border-slate-200 rounded-xl pl-9 pr-8 py-2 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition shadow-xs"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="text-xs font-semibold text-slate-500">
              Showing <span className="text-blue-700 font-bold">{filteredDepts.length}</span> of 20 Departments
            </div>
          </div>

          {/* Category Chips */}
          <div className="flex items-center space-x-1.5 overflow-x-auto pb-1 scrollbar-none">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition ${
                  selectedCategory === cat
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* 20 Factory Department Cards Grid */}
        <section className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {filteredDepts.map((dept) => {
              const IconComp = dept.icon;
              const isUserAssigned = userProfile?.department === dept.name;

              return (
                <div
                  key={dept.id}
                  onClick={() => handleDepartmentClick(dept.name)}
                  className={`bg-white rounded-xl p-4 border transition cursor-pointer flex flex-col justify-between hover:border-blue-500 hover:shadow-md group shadow-xs ${
                    isUserAssigned
                      ? 'border-blue-500 ring-2 ring-blue-500/20'
                      : 'border-slate-200'
                  }`}
                >
                  <div className="space-y-3">
                    {/* Top line with code and category */}
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs font-black text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded">
                        {dept.code}
                      </span>
                      <span className="text-[10px] font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded">
                        {dept.category}
                      </span>
                    </div>

                    {/* Department Title */}
                    <div className="flex items-start space-x-3">
                      <div className="p-2 rounded-lg bg-blue-50 text-blue-700 group-hover:bg-blue-600 group-hover:text-white transition shrink-0 mt-0.5">
                        <IconComp className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <h4 className="font-black text-sm text-slate-900 group-hover:text-blue-700 transition leading-snug">
                          {dept.name}
                        </h4>
                        <p className="text-[11px] text-slate-500 line-clamp-2 mt-1 leading-relaxed">
                          {dept.description}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Bottom Action Indicator */}
                  <div className="mt-4 pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-blue-700 group-hover:text-blue-800">
                    <span>Open Dashboard</span>
                    <ArrowRight className="w-3.5 h-3.5 transform group-hover:translate-x-1 transition" />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white py-4 mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 gap-2">
          <div>
            <strong>{COMPANY_NAME}</strong> &bull; {SYSTEM_SUBTITLE}
          </div>
          <div className="flex items-center space-x-4">
            <span>20 Factory Departments</span>
            <span>&bull;</span>
            <span>Enterprise Plant Operations</span>
          </div>
        </div>
      </footer>

      {/* Optional Operator Sign In Modal */}
      {showLoginModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center space-x-2 text-slate-900">
                <User className="w-5 h-5 text-blue-600" />
                <h3 className="text-base font-bold">Operator Identification</h3>
              </div>
              <button
                onClick={() => setShowLoginModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-500">
              Sign in with your employee username and password to record official actions, sign off quality checkpoints, or manage system records.
            </p>

            {authError && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-start space-x-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-600" />
                <span>{authError}</span>
              </div>
            )}

            <form onSubmit={handleLoginSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Username / Employee Code
                </label>
                <input
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="e.g. admin or employee code"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-blue-500 focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Password
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter password"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-3 pr-9 py-2 text-xs text-slate-900 focus:outline-none focus:border-blue-500 focus:bg-white"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setShowLoginModal(false)}
                  className="px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-xs disabled:opacity-50"
                >
                  {submitting ? 'Verifying...' : 'Sign In'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
