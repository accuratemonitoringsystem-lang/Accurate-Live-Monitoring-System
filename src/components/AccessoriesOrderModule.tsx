import React, { useState, useMemo, useEffect } from 'react';
import {
  Package,
  Plus,
  Search,
  Filter,
  Download,
  Calendar,
  Clock,
  CheckCircle2,
  AlertTriangle,
  History,
  Eye,
  Edit3,
  Trash2,
  Send,
  X,
  FileText,
  Building,
  Check,
  RotateCcw,
  RefreshCw,
  ChevronRight,
  Shield,
  Layers,
  Sparkles,
} from 'lucide-react';
import {
  AccessoriesCompliance,
  AccessoriesItem,
  AccessoriesOrder,
  AccessoriesOrderHistory,
  ComplianceStatus,
  Machine,
  OrderPriority,
  OrderStatus,
} from '../types';
import { useAuth } from '../context/AuthContext';
import {
  createAccessoriesOrder,
  releaseAccessoriesOrder,
  updateAccessoriesOrder,
  deleteAccessoriesOrder,
  saveAccessoriesCompliance,
  subscribeAccessoriesOrders,
  subscribeAccessoriesItems,
  subscribeAccessoriesCompliances,
  subscribeAccessoriesOrderHistory,
  ACCESSORIES_TARGET_DEPARTMENTS,
} from '../services/db';
import { exportAccessoriesOrdersToExcel } from '../utils/orderExports';

interface AccessoriesOrderModuleProps {
  orders?: AccessoriesOrder[];
  items?: AccessoriesItem[];
  compliances?: AccessoriesCompliance[];
  history?: AccessoriesOrderHistory[];
  machines: Machine[];
  currentDepartment?: string;
  isPlanning?: boolean;
  isAdmin?: boolean;
}

const COMMON_ACCESSORIES = [
  'Fixture Plate 400x400',
  'Fixture Kit Standard M6',
  'Ruby Styli Ø2mm x 20mm',
  'Ruby Styli Ø3mm x 30mm',
  'Ruby Styli Ø5mm x 50mm',
  'Star Stylus 5-way',
  'Disc Stylus Ø18mm',
  'Probe Extension 50mm',
  'Probe Extension 100mm',
  'Auto-Change Rack FCR25',
  'Stylus Change Module SM25',
  'Standard Calibration Sphere Ø19mm',
  'Clamp Kit Set (16 Pcs)',
  'Precision V-Block Set',
  'Rotary Table Plate',
  'Air Filter / Dryer Unit',
  'Anti-Vibration Mounts Kit',
];

export const AccessoriesOrderModule: React.FC<AccessoriesOrderModuleProps> = ({
  orders: ordersProp,
  items: itemsProp,
  compliances: compliancesProp,
  history: historyProp,
  machines,
  currentDepartment = '',
  isPlanning = false,
  isAdmin = false,
}) => {
  const { userProfile } = useAuth();

  // Internal real-time subscription states if not passed as props
  const [internalOrders, setInternalOrders] = useState<AccessoriesOrder[]>([]);
  const [internalItems, setInternalItems] = useState<AccessoriesItem[]>([]);
  const [internalCompliances, setInternalCompliances] = useState<AccessoriesCompliance[]>([]);
  const [internalHistory, setInternalHistory] = useState<AccessoriesOrderHistory[]>([]);

  useEffect(() => {
    if (ordersProp === undefined) {
      const unsub = subscribeAccessoriesOrders(setInternalOrders);
      return () => unsub();
    }
  }, [ordersProp]);

  useEffect(() => {
    if (itemsProp === undefined) {
      const unsub = subscribeAccessoriesItems(setInternalItems);
      return () => unsub();
    }
  }, [itemsProp]);

  useEffect(() => {
    if (compliancesProp === undefined) {
      const unsub = subscribeAccessoriesCompliances(setInternalCompliances);
      return () => unsub();
    }
  }, [compliancesProp]);

  useEffect(() => {
    if (historyProp === undefined) {
      const unsub = subscribeAccessoriesOrderHistory(setInternalHistory);
      return () => unsub();
    }
  }, [historyProp]);

  const orders = ordersProp !== undefined ? ordersProp : internalOrders;
  const items = itemsProp !== undefined ? itemsProp : internalItems;
  const compliances = compliancesProp !== undefined ? compliancesProp : internalCompliances;
  const history = historyProp !== undefined ? historyProp : internalHistory;

  const canCreateAndEdit =
    isAdmin ||
    isPlanning ||
    userProfile?.role === 'ADMIN' ||
    userProfile?.role === 'PLANNING' ||
    currentDepartment.includes('Planning') ||
    currentDepartment === '02-B Planning Accessories';

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [priorityFilter, setPriorityFilter] = useState<string>('ALL');
  const [cmmFilter, setCmmFilter] = useState<string>('ALL');
  const [deptFilter, setDeptFilter] = useState<string>('ALL');

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingOrder, setEditingOrder] = useState<AccessoriesOrder | null>(null);

  const [showComplianceModal, setShowComplianceModal] = useState(false);
  const [selectedOrderForCompliance, setSelectedOrderForCompliance] = useState<AccessoriesOrder | null>(null);
  const [selectedItemIdForCompliance, setSelectedItemIdForCompliance] = useState<string>('');

  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [selectedOrderForDetails, setSelectedOrderForDetails] = useState<AccessoriesOrder | null>(null);

  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [selectedOrderForHistory, setSelectedOrderForHistory] = useState<AccessoriesOrder | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Auto notification clear
  const notify = (text: string, type: 'success' | 'error' = 'success') => {
    setActionMessage({ type, text });
    setTimeout(() => setActionMessage(null), 4500);
  };

  // KPI Calculations
  const stats = useMemo(() => {
    const total = orders.length;
    const draft = orders.filter((o) => o.status === 'Draft').length;
    const released = orders.filter((o) => o.status === 'Released').length;
    const inProgress = orders.filter((o) => o.status === 'In Progress').length;
    const partial = orders.filter((o) => o.status === 'Partially Completed').length;
    const completed = orders.filter((o) => o.status === 'Completed').length;
    const delayed = orders.filter((o) => o.status === 'Delayed').length;
    return { total, draft, released, inProgress, partial, completed, delayed };
  }, [orders]);

  // Filtered Orders
  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      // Search term
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        const matchesSearch =
          order.orderNumber.toLowerCase().includes(term) ||
          order.cmmNumber.toLowerCase().includes(term) ||
          order.cmmModel.toLowerCase().includes(term) ||
          (order.customer && order.customer.toLowerCase().includes(term)) ||
          (order.project && order.project.toLowerCase().includes(term));
        if (!matchesSearch) return false;
      }

      // Status
      if (statusFilter !== 'ALL' && order.status !== statusFilter) return false;

      // Priority
      if (priorityFilter !== 'ALL' && order.priority !== priorityFilter) return false;

      // CMM Number
      if (cmmFilter !== 'ALL' && order.cmmNumber !== cmmFilter) return false;

      // Department Filter
      if (deptFilter !== 'ALL') {
        const deptStatus = order.departmentStatuses?.[deptFilter];
        if (!deptStatus || deptStatus === 'Not Applicable') return false;
      }

      return true;
    });
  }, [orders, searchTerm, statusFilter, priorityFilter, cmmFilter, deptFilter]);

  // Unique CMM list for dropdown
  const uniqueCmms = useMemo(() => {
    const list = Array.from(new Set(machines.map((m) => m.machineNumber)));
    return list.sort();
  }, [machines]);

  // Handle Quick Release
  const handleRelease = async (order: AccessoriesOrder) => {
    if (!window.confirm(`Release Accessories Order ${order.orderNumber} to Purchase, Store, Electronics, Calibration, and Packing?`)) {
      return;
    }
    try {
      setIsSubmitting(true);
      await releaseAccessoriesOrder(order.id, userProfile?.email, userProfile?.displayName);
      notify(`Accessories Order ${order.orderNumber} successfully released.`);
    } catch (err: any) {
      notify(err.message || 'Failed to release order.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Delete Draft Order
  const handleDelete = async (order: AccessoriesOrder) => {
    if (order.status !== 'Draft' && !isAdmin) {
      alert('Only Draft orders can be deleted.');
      return;
    }
    if (!window.confirm(`Are you sure you want to delete order ${order.orderNumber}? This cannot be undone.`)) {
      return;
    }
    try {
      setIsSubmitting(true);
      await deleteAccessoriesOrder(order.id, userProfile?.email);
      notify(`Accessories Order ${order.orderNumber} deleted.`);
    } catch (err: any) {
      notify(err.message || 'Failed to delete order.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Determine user department for compliance
  const activeDeptForCompliance = useMemo(() => {
    if (currentDepartment && ACCESSORIES_TARGET_DEPARTMENTS.includes(currentDepartment)) {
      return currentDepartment;
    }
    if (currentDepartment.includes('Purchase')) return '03 Purchase';
    if (currentDepartment.includes('Store')) return '05 Store';
    if (currentDepartment.includes('Electronics')) return '11-A Electronics-Cable Set';
    if (currentDepartment.includes('Calibration')) return '14 Calibration';
    if (currentDepartment.includes('Packing')) return '15 Packing';
    return '03 Purchase'; // default for Admin
  }, [currentDepartment]);

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {actionMessage && (
        <div
          className={`p-4 rounded-xl border flex items-center justify-between text-sm font-medium transition-all ${
            actionMessage.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200 shadow-sm'
              : 'bg-red-50 text-red-800 border-red-200 shadow-sm'
          }`}
        >
          <div className="flex items-center space-x-2">
            {actionMessage.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-red-600 shrink-0" />
            )}
            <span>{actionMessage.text}</span>
          </div>
          <button onClick={() => setActionMessage(null)} className="text-slate-400 hover:text-slate-600">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* TOP STATS BAR */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Total Orders</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">{stats.total}</p>
          <p className="text-xs text-slate-400 mt-0.5">Accurate CMMs</p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <p className="text-xs font-medium text-amber-600 uppercase tracking-wider">Draft</p>
          <p className="text-2xl font-bold text-amber-700 mt-1">{stats.draft}</p>
          <p className="text-xs text-slate-400 mt-0.5">Unreleased</p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <p className="text-xs font-medium text-blue-600 uppercase tracking-wider">Released</p>
          <p className="text-2xl font-bold text-blue-700 mt-1">{stats.released}</p>
          <p className="text-xs text-slate-400 mt-0.5">Sent to Depts</p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <p className="text-xs font-medium text-indigo-600 uppercase tracking-wider">In Progress</p>
          <p className="text-2xl font-bold text-indigo-700 mt-1">{stats.inProgress}</p>
          <p className="text-xs text-slate-400 mt-0.5">Active work</p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <p className="text-xs font-medium text-purple-600 uppercase tracking-wider">Partially Done</p>
          <p className="text-2xl font-bold text-purple-700 mt-1">{stats.partial}</p>
          <p className="text-xs text-slate-400 mt-0.5">Some depts done</p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <p className="text-xs font-medium text-emerald-600 uppercase tracking-wider">Completed</p>
          <p className="text-2xl font-bold text-emerald-700 mt-1">{stats.completed}</p>
          <p className="text-xs text-slate-400 mt-0.5">All depts complied</p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <p className="text-xs font-medium text-red-600 uppercase tracking-wider">Delayed</p>
          <p className="text-2xl font-bold text-red-700 mt-1">{stats.delayed}</p>
          <p className="text-xs text-slate-400 mt-0.5">Needs action</p>
        </div>
      </div>

      {/* CONTROLS & FILTER BAR */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center space-x-2">
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
              <Package className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">Accessories Orders</h2>
              <p className="text-xs text-slate-500">
                Item-wise planning and compliance across Purchase, Store, Electronics, Calibration, and Packing
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() =>
                exportAccessoriesOrdersToExcel(
                  filteredOrders,
                  items,
                  compliances,
                  `Accurate_Accessories_Orders_${new Date().toISOString().split('T')[0]}.xlsx`
                )
              }
              className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-white text-slate-700 hover:bg-slate-50 border border-slate-200 transition"
              title="Export all filtered orders to Excel"
            >
              <Download className="w-4 h-4 text-emerald-600" />
              <span>Export Excel</span>
            </button>

            {canCreateAndEdit && (
              <button
                onClick={() => setShowCreateModal(true)}
                className="flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-bold bg-blue-600 text-white hover:bg-blue-700 shadow-sm transition"
              >
                <Plus className="w-4 h-4" />
                <span>Create Accessories Order</span>
              </button>
            )}
          </div>
        </div>

        {/* Filter Inputs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-2.5 pt-2 border-t border-slate-100">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search Order #, CMM, Customer..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 rounded-xl border border-slate-200 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full px-3 py-1.5 rounded-xl border border-slate-200 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="ALL">All Statuses</option>
              <option value="Draft">Draft</option>
              <option value="Released">Released</option>
              <option value="In Progress">In Progress</option>
              <option value="Partially Completed">Partially Completed</option>
              <option value="Completed">Completed</option>
              <option value="Delayed">Delayed</option>
            </select>
          </div>

          <div>
            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
              className="w-full px-3 py-1.5 rounded-xl border border-slate-200 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="ALL">All Priorities</option>
              <option value="Normal">Normal</option>
              <option value="High">High</option>
              <option value="Urgent">Urgent</option>
              <option value="Critical">Critical</option>
            </select>
          </div>

          <div>
            <select
              value={cmmFilter}
              onChange={(e) => setCmmFilter(e.target.value)}
              className="w-full px-3 py-1.5 rounded-xl border border-slate-200 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="ALL">All CMM Machines</option>
              {uniqueCmms.map((cmm) => (
                <option key={cmm} value={cmm}>
                  {cmm}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center space-x-2">
            <select
              value={deptFilter}
              onChange={(e) => setDeptFilter(e.target.value)}
              className="flex-1 px-3 py-1.5 rounded-xl border border-slate-200 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="ALL">All Target Depts</option>
              {ACCESSORIES_TARGET_DEPARTMENTS.map((dept) => (
                <option key={dept} value={dept}>
                  {dept}
                </option>
              ))}
            </select>

            {(searchTerm || statusFilter !== 'ALL' || priorityFilter !== 'ALL' || cmmFilter !== 'ALL' || deptFilter !== 'ALL') && (
              <button
                onClick={() => {
                  setSearchTerm('');
                  setStatusFilter('ALL');
                  setPriorityFilter('ALL');
                  setCmmFilter('ALL');
                  setDeptFilter('ALL');
                }}
                className="px-2.5 py-1.5 rounded-xl text-xs font-medium text-slate-500 hover:text-slate-800 hover:bg-slate-100 border border-slate-200 transition"
                title="Clear Filters"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ORDERS TABLE */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              <tr>
                <th className="py-3.5 px-4">Order No & Date</th>
                <th className="py-3.5 px-4">CMM Machine</th>
                <th className="py-3.5 px-4">Project & Customer</th>
                <th className="py-3.5 px-4">Priority & Due</th>
                <th className="py-3.5 px-4 text-center">Items (Complied)</th>
                <th className="py-3.5 px-4">Department Statuses</th>
                <th className="py-3.5 px-4 text-center">Overall Status</th>
                <th className="py-3.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    <Package className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                    <p className="text-sm font-medium text-slate-600">No accessories orders found</p>
                    <p className="text-xs text-slate-400 mt-1">
                      {canCreateAndEdit ? 'Click "+ Create Accessories Order" to release an order for CMM accessories.' : 'No orders matched your filter.'}
                    </p>
                  </td>
                </tr>
              ) : (
                filteredOrders.map((order) => {
                  const orderItems = items.filter((it) => it.orderId === order.id);
                  const orderComps = compliances.filter((c) => c.orderId === order.id);

                  // Priority style
                  const priorityClass =
                    order.priority === 'Critical'
                      ? 'bg-red-50 text-red-700 border-red-200'
                      : order.priority === 'Urgent'
                      ? 'bg-amber-50 text-amber-700 border-amber-200'
                      : order.priority === 'High'
                      ? 'bg-orange-50 text-orange-700 border-orange-200'
                      : 'bg-slate-50 text-slate-700 border-slate-200';

                  // Status style
                  const statusClass =
                    order.status === 'Completed'
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : order.status === 'Delayed'
                      ? 'bg-red-50 text-red-700 border-red-200'
                      : order.status === 'Partially Completed'
                      ? 'bg-purple-50 text-purple-700 border-purple-200'
                      : order.status === 'In Progress'
                      ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                      : order.status === 'Released'
                      ? 'bg-blue-50 text-blue-700 border-blue-200'
                      : 'bg-amber-50 text-amber-700 border-amber-200';

                  return (
                    <tr key={order.id} className="hover:bg-slate-50/70 transition">
                      {/* Order No & Date */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center space-x-2">
                          <span className="font-bold text-slate-900 text-sm">{order.orderNumber}</span>
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                            R{order.revision ?? 0}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5 flex items-center space-x-1">
                          <Calendar className="w-3 h-3" />
                          <span>{order.orderDate}</span>
                        </div>
                      </td>

                      {/* CMM Machine */}
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-slate-900">{order.cmmNumber}</div>
                        <div className="text-[11px] text-slate-500">{order.cmmModel}</div>
                      </td>

                      {/* Project & Customer */}
                      <td className="py-3.5 px-4">
                        <div className="font-medium text-slate-800">{order.project || 'Standard'}</div>
                        <div className="text-[11px] text-slate-400">{order.customer || 'Internal'}</div>
                      </td>

                      {/* Priority & Due */}
                      <td className="py-3.5 px-4">
                        <span className={`inline-block px-2 py-0.5 rounded-md text-[11px] font-bold border ${priorityClass}`}>
                          {order.priority}
                        </span>
                        <div className="text-[11px] text-slate-500 mt-1 flex items-center space-x-1">
                          <Clock className="w-3 h-3 text-slate-400" />
                          <span>Due: {order.requiredDate}</span>
                        </div>
                      </td>

                      {/* Items Count */}
                      <td className="py-3.5 px-4 text-center">
                        <span className="font-bold text-slate-800 text-sm">{orderItems.length}</span>
                        <span className="text-slate-400 text-xs"> items</span>
                      </td>

                      {/* Department Statuses */}
                      <td className="py-3.5 px-4">
                        <div className="flex flex-wrap gap-1 max-w-xs">
                          {ACCESSORIES_TARGET_DEPARTMENTS.map((dept) => {
                            const shortDept = dept.replace(/^\d+[-A-Z]*\s*/, '').substring(0, 10);
                            const st = order.departmentStatuses?.[dept] || 'Pending';
                            const badgeColor =
                              st === 'Completed'
                                ? 'bg-emerald-100 text-emerald-800'
                                : st === 'In Progress'
                                ? 'bg-blue-100 text-blue-800'
                                : st === 'Delayed'
                                ? 'bg-red-100 text-red-800'
                                : 'bg-slate-100 text-slate-600';
                            return (
                              <span
                                key={dept}
                                className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${badgeColor}`}
                                title={`${dept}: ${st}`}
                              >
                                {shortDept}: {st}
                              </span>
                            );
                          })}
                        </div>
                      </td>

                      {/* Overall Status */}
                      <td className="py-3.5 px-4 text-center">
                        <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-bold border ${statusClass}`}>
                          {order.status}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end space-x-1">
                          {/* VIEW DETAILS */}
                          <button
                            onClick={() => {
                              setSelectedOrderForDetails(order);
                              setShowDetailsModal(true);
                            }}
                            className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition"
                            title="View Full Order Details"
                          >
                            <Eye className="w-4 h-4" />
                          </button>

                          {/* UPDATE COMPLIANCE (Only for released orders) */}
                          {order.status !== 'Draft' && (
                            <button
                              onClick={() => {
                                setSelectedOrderForCompliance(order);
                                setSelectedItemIdForCompliance(orderItems[0]?.id || '');
                                setShowComplianceModal(true);
                              }}
                              className="flex items-center space-x-1 px-2.5 py-1 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-lg text-xs font-bold transition border border-emerald-200"
                              title="Update Department Item Compliance"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Comply</span>
                            </button>
                          )}

                          {/* RELEASE (For Draft Orders) */}
                          {order.status === 'Draft' && canCreateAndEdit && (
                            <button
                              onClick={() => handleRelease(order)}
                              className="flex items-center space-x-1 px-2 py-1 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg text-xs font-bold transition border border-blue-200"
                              title="Release Order to Departments"
                            >
                              <Send className="w-3.5 h-3.5" />
                              <span>Release</span>
                            </button>
                          )}

                          {/* EDIT / REVISION */}
                          {canCreateAndEdit && (
                            <button
                              onClick={() => {
                                setEditingOrder(order);
                                setShowEditModal(true);
                              }}
                              className="p-1.5 text-slate-500 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition"
                              title={order.status === 'Released' ? 'Create Order Revision' : 'Edit Order'}
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                          )}

                          {/* VIEW HISTORY */}
                          <button
                            onClick={() => {
                              setSelectedOrderForHistory(order);
                              setShowHistoryModal(true);
                            }}
                            className="p-1.5 text-slate-500 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition"
                            title="View Audit History"
                          >
                            <History className="w-4 h-4" />
                          </button>

                          {/* DELETE (Draft or Admin) */}
                          {(order.status === 'Draft' || isAdmin) && canCreateAndEdit && (
                            <button
                              onClick={() => handleDelete(order)}
                              className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                              title="Delete Order"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* =========================================================================
          CREATE ACCESSORIES ORDER MODAL
          ========================================================================= */}
      {showCreateModal && (
        <CreateAccessoriesOrderModal
          machines={machines}
          orders={orders}
          onClose={() => setShowCreateModal(false)}
          onSuccess={(orderId, orderNum) => {
            setShowCreateModal(false);
            notify(`Accessories Order ${orderNum} created successfully!`);
          }}
        />
      )}

      {/* =========================================================================
          EDIT / REVISE ACCESSORIES ORDER MODAL
          ========================================================================= */}
      {showEditModal && editingOrder && (
        <EditAccessoriesOrderModal
          order={editingOrder}
          machines={machines}
          onClose={() => {
            setShowEditModal(false);
            setEditingOrder(null);
          }}
          onSuccess={() => {
            setShowEditModal(false);
            setEditingOrder(null);
            notify(`Accessories Order ${editingOrder.orderNumber} updated successfully!`);
          }}
        />
      )}

      {/* =========================================================================
          ITEM-WISE COMPLIANCE MODAL
          ========================================================================= */}
      {showComplianceModal && selectedOrderForCompliance && (
        <AccessoriesComplianceModal
          order={selectedOrderForCompliance}
          items={items.filter((it) => it.orderId === selectedOrderForCompliance.id)}
          compliances={compliances.filter((c) => c.orderId === selectedOrderForCompliance.id)}
          selectedItemId={selectedItemIdForCompliance}
          userDepartment={activeDeptForCompliance}
          isAdmin={isAdmin}
          onClose={() => {
            setShowComplianceModal(false);
            setSelectedOrderForCompliance(null);
          }}
          onSuccess={() => {
            notify(`Compliance updated for Order ${selectedOrderForCompliance.orderNumber}`);
          }}
        />
      )}

      {/* =========================================================================
          ORDER DETAILS MODAL
          ========================================================================= */}
      {showDetailsModal && selectedOrderForDetails && (
        <AccessoriesOrderDetailsModal
          order={selectedOrderForDetails}
          items={items.filter((it) => it.orderId === selectedOrderForDetails.id)}
          compliances={compliances.filter((c) => c.orderId === selectedOrderForDetails.id)}
          history={history.filter((h) => h.orderId === selectedOrderForDetails.id)}
          onClose={() => {
            setShowDetailsModal(false);
            setSelectedOrderForDetails(null);
          }}
          onOpenCompliance={() => {
            const ord = selectedOrderForDetails;
            setShowDetailsModal(false);
            setSelectedOrderForDetails(null);
            setSelectedOrderForCompliance(ord);
            setShowComplianceModal(true);
          }}
        />
      )}

      {/* =========================================================================
          ORDER HISTORY MODAL
          ========================================================================= */}
      {showHistoryModal && selectedOrderForHistory && (
        <AccessoriesOrderHistoryModal
          order={selectedOrderForHistory}
          history={history.filter((h) => h.orderId === selectedOrderForHistory.id)}
          onClose={() => {
            setShowHistoryModal(false);
            setSelectedOrderForHistory(null);
          }}
        />
      )}
    </div>
  );
};

// =========================================================================
// SUB-COMPONENT: CREATE ORDER MODAL
// =========================================================================

interface CreateAccessoriesOrderModalProps {
  machines: Machine[];
  orders: AccessoriesOrder[];
  onClose: () => void;
  onSuccess: (orderId: string, orderNum: string) => void;
}

const CreateAccessoriesOrderModal: React.FC<CreateAccessoriesOrderModalProps> = ({
  machines,
  orders,
  onClose,
  onSuccess,
}) => {
  const { userProfile } = useAuth();

  // Auto suggest next order number e.g. ACC-2026-001
  const suggestedOrderNumber = useMemo(() => {
    const year = new Date().getFullYear();
    const count = orders.length + 1;
    const pad = String(count).padStart(3, '0');
    return `ACC-${year}-${pad}`;
  }, [orders]);

  const [orderNumber, setOrderNumber] = useState(suggestedOrderNumber);
  const [orderDate, setOrderDate] = useState(new Date().toISOString().split('T')[0]);
  const [requiredDate, setRequiredDate] = useState('');
  const [selectedCmmNumber, setSelectedCmmNumber] = useState('');
  const [cmmModel, setCmmModel] = useState('');
  const [project, setProject] = useState('');
  const [customer, setCustomer] = useState('');
  const [priority, setPriority] = useState<OrderPriority>('Normal');
  const [remarks, setRemarks] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Dynamic Accessories Items
  const [items, setItems] = useState<
    Array<{
      id: string;
      srNo: number;
      accessoryName: string;
      partNumber: string;
      specification: string;
      quantity: number;
      uom: string;
      requiredDate: string;
      priority: OrderPriority;
      remarks: string;
    }>
  >([
    {
      id: `it_${Date.now()}_1`,
      srNo: 1,
      accessoryName: '',
      partNumber: '',
      specification: '',
      quantity: 1,
      uom: 'Nos',
      requiredDate: '',
      priority: 'Normal',
      remarks: '',
    },
  ]);

  // When CMM selected, auto populate Model, Project, Customer
  const handleCmmChange = (cmmNo: string) => {
    setSelectedCmmNumber(cmmNo);
    const m = machines.find((x) => x.machineNumber === cmmNo);
    if (m) {
      setCmmModel(m.model || '');
      setProject(m.project || '');
      setCustomer(m.customer || '');
    }
  };

  const handleAddItem = () => {
    setItems((prev) => [
      ...prev,
      {
        id: `it_${Date.now()}_${prev.length + 1}`,
        srNo: prev.length + 1,
        accessoryName: '',
        partNumber: '',
        specification: '',
        quantity: 1,
        uom: 'Nos',
        requiredDate: requiredDate || '',
        priority: priority,
        remarks: '',
      },
    ]);
  };

  const handleRemoveItem = (idx: number) => {
    if (items.length <= 1) {
      alert('At least one accessory item is required in the order.');
      return;
    }
    setItems((prev) => prev.filter((_, i) => i !== idx).map((it, i) => ({ ...it, srNo: i + 1 })));
  };

  const handleItemChange = (idx: number, field: string, val: any) => {
    setItems((prev) => {
      const copy = [...prev];
      copy[idx] = { ...copy[idx], [field]: val };
      return copy;
    });
  };

  const handleSubmit = async (status: 'Draft' | 'Released') => {
    if (!orderNumber.trim()) {
      alert('Please enter an Order Number.');
      return;
    }
    if (!selectedCmmNumber.trim()) {
      alert('Please select a CMM Machine.');
      return;
    }
    if (!requiredDate) {
      alert('Please enter the overall Required Date.');
      return;
    }

    // Validate items
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (!it.accessoryName.trim()) {
        alert(`Please enter an Accessory Name for item #${i + 1}.`);
        return;
      }
      if (Number(it.quantity) <= 0) {
        alert(`Please enter a valid Quantity (> 0) for item #${i + 1}.`);
        return;
      }
    }

    try {
      setIsSubmitting(true);
      const machineRecord = machines.find((m) => m.machineNumber === selectedCmmNumber);

      const orderPayload: Omit<AccessoriesOrder, 'id' | 'createdAt' | 'updatedAt' | 'totalItemsCount' | 'completedItemsCount'> = {
        orderNumber: orderNumber.trim(),
        orderType: 'ACCESSORIES',
        orderDate,
        requiredDate,
        cmmId: machineRecord?.id || '',
        cmmNumber: selectedCmmNumber,
        cmmModel: cmmModel || machineRecord?.model || '',
        project: project || machineRecord?.project || 'Standard',
        customer: customer || machineRecord?.customer || 'Internal',
        priority,
        status,
        revision: 0,
        remarks,
        createdBy: userProfile?.displayName || userProfile?.email || 'Planning',
        updatedBy: userProfile?.displayName || userProfile?.email || 'Planning',
      };

      const itemsPayload = items.map((it) => ({
        srNo: it.srNo,
        accessoryName: it.accessoryName.trim(),
        partNumber: it.partNumber.trim(),
        specification: it.specification.trim(),
        quantity: Number(it.quantity),
        uom: it.uom || 'Nos',
        requiredDate: it.requiredDate || requiredDate,
        priority: it.priority || priority,
        remarks: it.remarks || '',
      }));

      const newId = await createAccessoriesOrder(
        orderPayload,
        itemsPayload,
        userProfile?.email,
        userProfile?.displayName
      );

      onSuccess(newId, orderNumber);
    } catch (err: any) {
      console.error('Failed to create accessories order:', err);
      alert(err.message || 'Failed to create order.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white w-full max-w-4xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center font-bold">
              <Package className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-base">+ Create Accessories Order</h3>
              <p className="text-xs text-slate-500">
                Planning order release specifically for CMM Machine Accessories
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-xs">
          {/* Order Header Fields */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <label className="block font-bold text-slate-700 mb-1">Order Number *</label>
              <input
                type="text"
                value={orderNumber}
                onChange={(e) => setOrderNumber(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 font-bold text-slate-900"
                placeholder="e.g. ACC-2026-001"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">Order Date *</label>
              <input
                type="date"
                value={orderDate}
                onChange={(e) => setOrderDate(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">Required Date *</label>
              <input
                type="date"
                value={requiredDate}
                onChange={(e) => setRequiredDate(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 font-semibold text-blue-900"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">Priority *</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as OrderPriority)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 font-bold"
              >
                <option value="Normal">Normal</option>
                <option value="High">High</option>
                <option value="Urgent">Urgent</option>
                <option value="Critical">Critical</option>
              </select>
            </div>
          </div>

          {/* CMM Selection & Auto-fill */}
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
            <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider flex items-center space-x-1.5">
              <Building className="w-4 h-4 text-blue-600" />
              <span>CMM Machine Master Linkage</span>
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Select CMM Number *</label>
                <select
                  value={selectedCmmNumber}
                  onChange={(e) => handleCmmChange(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white focus:ring-2 focus:ring-blue-500 font-bold text-slate-900"
                >
                  <option value="">-- Choose Machine --</option>
                  {machines.map((m) => (
                    <option key={m.id} value={m.machineNumber}>
                      {m.machineNumber} - {m.model}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-medium text-slate-600 mb-1">CMM Model / Size</label>
                <input
                  type="text"
                  value={cmmModel}
                  onChange={(e) => setCmmModel(e.target.value)}
                  placeholder="Auto-filled from machine"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white/80"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-600 mb-1">Project</label>
                <input
                  type="text"
                  value={project}
                  onChange={(e) => setProject(e.target.value)}
                  placeholder="Auto-filled from machine"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white/80"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-600 mb-1">Customer</label>
                <input
                  type="text"
                  value={customer}
                  onChange={(e) => setCustomer(e.target.value)}
                  placeholder="Auto-filled from machine"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white/80"
                />
              </div>
            </div>
          </div>

          {/* Remarks */}
          <div>
            <label className="block font-bold text-slate-700 mb-1">General Order Remarks</label>
            <input
              type="text"
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="e.g. Special fixture requirements for aerospace component inspection"
              className="w-full px-3 py-2 rounded-xl border border-slate-200"
            />
          </div>

          {/* ITEMS SECTION */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-bold text-slate-900 text-sm">Accessory Items ({items.length})</h4>
                <p className="text-[11px] text-slate-500">
                  Add actual accessories required for this CMM. Each item will have individual department compliance.
                </p>
              </div>
              <button
                type="button"
                onClick={handleAddItem}
                className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-blue-50 text-blue-700 hover:bg-blue-100 font-bold border border-blue-200 transition"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>+ Add Accessory</span>
              </button>
            </div>

            <div className="space-y-3">
              {items.map((item, idx) => (
                <div key={item.id} className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/50 space-y-2.5">
                  <div className="flex items-center justify-between border-b border-slate-200/60 pb-2">
                    <span className="font-bold text-slate-700">Item #{item.srNo}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveItem(idx)}
                      className="text-slate-400 hover:text-red-600 p-1 rounded transition"
                      title="Remove this accessory"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5">
                    {/* Accessory Name */}
                    <div className="md:col-span-2">
                      <label className="block font-medium text-slate-600 mb-0.5">Accessory Name *</label>
                      <input
                        type="text"
                        list={`acc-suggestions-${idx}`}
                        value={item.accessoryName}
                        onChange={(e) => handleItemChange(idx, 'accessoryName', e.target.value)}
                        placeholder="e.g. Ruby Styli Ø3mm x 30mm or Fixture Plate"
                        className="w-full px-3 py-1.5 rounded-lg border border-slate-300 bg-white font-semibold text-slate-900"
                      />
                      <datalist id={`acc-suggestions-${idx}`}>
                        {COMMON_ACCESSORIES.map((ca) => (
                          <option key={ca} value={ca} />
                        ))}
                      </datalist>
                    </div>

                    {/* Part Number */}
                    <div>
                      <label className="block font-medium text-slate-600 mb-0.5">Part Number</label>
                      <input
                        type="text"
                        value={item.partNumber}
                        onChange={(e) => handleItemChange(idx, 'partNumber', e.target.value)}
                        placeholder="e.g. A-5000-3553"
                        className="w-full px-3 py-1.5 rounded-lg border border-slate-300 bg-white"
                      />
                    </div>

                    {/* Quantity & UOM */}
                    <div className="grid grid-cols-2 gap-1.5">
                      <div>
                        <label className="block font-medium text-slate-600 mb-0.5">Qty *</label>
                        <input
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={(e) => handleItemChange(idx, 'quantity', e.target.value)}
                          className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white font-bold"
                        />
                      </div>
                      <div>
                        <label className="block font-medium text-slate-600 mb-0.5">UOM</label>
                        <select
                          value={item.uom}
                          onChange={(e) => handleItemChange(idx, 'uom', e.target.value)}
                          className="w-full px-2 py-1.5 rounded-lg border border-slate-300 bg-white"
                        >
                          <option value="Nos">Nos</option>
                          <option value="Sets">Sets</option>
                          <option value="Pcs">Pcs</option>
                          <option value="Kit">Kit</option>
                          <option value="Mtr">Mtr</option>
                        </select>
                      </div>
                    </div>

                    {/* Specification */}
                    <div className="md:col-span-2">
                      <label className="block font-medium text-slate-600 mb-0.5">Specification</label>
                      <input
                        type="text"
                        value={item.specification}
                        onChange={(e) => handleItemChange(idx, 'specification', e.target.value)}
                        placeholder="e.g. M2 thread, tungsten carbide stem, sphericity 0.13µm"
                        className="w-full px-3 py-1.5 rounded-lg border border-slate-300 bg-white"
                      />
                    </div>

                    {/* Item Required Date */}
                    <div>
                      <label className="block font-medium text-slate-600 mb-0.5">Required Date</label>
                      <input
                        type="date"
                        value={item.requiredDate || requiredDate}
                        onChange={(e) => handleItemChange(idx, 'requiredDate', e.target.value)}
                        className="w-full px-3 py-1.5 rounded-lg border border-slate-300 bg-white"
                      />
                    </div>

                    {/* Item Priority */}
                    <div>
                      <label className="block font-medium text-slate-600 mb-0.5">Item Priority</label>
                      <select
                        value={item.priority}
                        onChange={(e) => handleItemChange(idx, 'priority', e.target.value as OrderPriority)}
                        className="w-full px-3 py-1.5 rounded-lg border border-slate-300 bg-white"
                      >
                        <option value="Normal">Normal</option>
                        <option value="High">High</option>
                        <option value="Urgent">Urgent</option>
                        <option value="Critical">Critical</option>
                      </select>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Modal Footer with SAVE DRAFT & RELEASE ORDER */}
        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
          <div className="text-xs text-slate-500">
            <span>Releasing notifies </span>
            <span className="font-bold text-slate-700">Purchase, Store, Electronics, Calibration, Packing</span>
          </div>
          <div className="flex items-center space-x-2">
            <button
              type="button"
              disabled={isSubmitting}
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-slate-200 text-slate-700 font-bold hover:bg-slate-100 transition"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => handleSubmit('Draft')}
              className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold transition shadow-sm"
            >
              Save Draft
            </button>
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => handleSubmit('Released')}
              className="flex items-center space-x-1.5 px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold transition shadow-sm"
            >
              <Send className="w-4 h-4" />
              <span>Release Order</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// =========================================================================
// SUB-COMPONENT: EDIT / REVISE ORDER MODAL
// =========================================================================

interface EditAccessoriesOrderModalProps {
  order: AccessoriesOrder;
  machines: Machine[];
  onClose: () => void;
  onSuccess: () => void;
}

const EditAccessoriesOrderModal: React.FC<EditAccessoriesOrderModalProps> = ({
  order,
  machines,
  onClose,
  onSuccess,
}) => {
  const { userProfile } = useAuth();
  const [priority, setPriority] = useState<OrderPriority>(order.priority);
  const [requiredDate, setRequiredDate] = useState(order.requiredDate);
  const [remarks, setRemarks] = useState(order.remarks || '');
  const [revisionRemarks, setRevisionRemarks] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    try {
      setIsSubmitting(true);
      await updateAccessoriesOrder(
        order.id,
        {
          priority,
          requiredDate,
          remarks,
        },
        userProfile?.email,
        userProfile?.displayName,
        revisionRemarks || `Order revised by ${userProfile?.displayName || 'Planning'}`
      );
      onSuccess();
    } catch (err: any) {
      alert(err.message || 'Failed to update order');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200 overflow-hidden text-xs">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div>
            <h3 className="font-bold text-slate-900 text-base">
              {order.status === 'Released' ? 'Create Order Revision' : 'Edit Accessories Order'}
            </h3>
            <p className="text-xs text-slate-500">
              {order.orderNumber} (Current Rev: R{order.revision ?? 0}) — CMM {order.cmmNumber}
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="block font-bold text-slate-700 mb-1">Required Due Date</label>
            <input
              type="date"
              value={requiredDate}
              onChange={(e) => setRequiredDate(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200"
            />
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1">Priority</label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as OrderPriority)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 font-bold"
            >
              <option value="Normal">Normal</option>
              <option value="High">High</option>
              <option value="Urgent">Urgent</option>
              <option value="Critical">Critical</option>
            </select>
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1">Order Remarks</label>
            <input
              type="text"
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200"
            />
          </div>

          {order.status === 'Released' && (
            <div className="bg-amber-50 p-3.5 rounded-xl border border-amber-200">
              <label className="block font-bold text-amber-900 mb-1">
                Revision Remarks / Change Reason (Rev R{(order.revision ?? 0) + 1}) *
              </label>
              <input
                type="text"
                value={revisionRemarks}
                onChange={(e) => setRevisionRemarks(e.target.value)}
                placeholder="e.g. Due date extended due to customer schedule change"
                className="w-full px-3 py-2 rounded-xl border border-amber-300 bg-white font-medium"
              />
              <p className="text-[11px] text-amber-700 mt-1">
                Note: Updating a released order automatically creates revision entry in order history.
              </p>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex items-center justify-end space-x-2">
          <button onClick={onClose} className="px-4 py-2 rounded-xl border border-slate-200 font-bold text-slate-700 hover:bg-slate-100">
            Cancel
          </button>
          <button
            disabled={isSubmitting}
            onClick={handleSubmit}
            className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold transition shadow-sm"
          >
            {order.status === 'Released' ? `Save Revision R${(order.revision ?? 0) + 1}` : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
};

// =========================================================================
// SUB-COMPONENT: ITEM-WISE COMPLIANCE MODAL (DEPARTMENT-SPECIFIC FIELDS)
// =========================================================================

interface AccessoriesComplianceModalProps {
  order: AccessoriesOrder;
  items: AccessoriesItem[];
  compliances: AccessoriesCompliance[];
  selectedItemId?: string;
  userDepartment: string;
  isAdmin?: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const AccessoriesComplianceModal: React.FC<AccessoriesComplianceModalProps> = ({
  order,
  items,
  compliances,
  selectedItemId = '',
  userDepartment,
  isAdmin = false,
  onClose,
  onSuccess,
}) => {
  const { userProfile } = useAuth();

  // Allow admin to select acting department
  const [activeDept, setActiveDept] = useState(userDepartment || '03 Purchase');

  // Currently selected item
  const [activeItemId, setActiveItemId] = useState<string>(selectedItemId || items[0]?.id || '');
  const activeItem = items.find((it) => it.id === activeItemId) || items[0];

  // Existing compliance for this item + dept
  const existingComp = useMemo(() => {
    if (!activeItem) return null;
    return compliances.find((c) => c.itemId === activeItem.id && c.department === activeDept);
  }, [compliances, activeItem, activeDept]);

  // Form Fields
  const [completedQty, setCompletedQty] = useState<number>(existingComp?.completedQuantity ?? 0);
  const [status, setStatus] = useState<ComplianceStatus>(existingComp?.status || 'Pending');
  const [expectedDate, setExpectedDate] = useState<string>(existingComp?.expectedDate || '');
  const [remarks, setRemarks] = useState<string>(existingComp?.remarks || '');
  const [attachment, setAttachment] = useState<string>(existingComp?.attachment || '');

  // Department Specific Fields:
  // Purchase
  const [poStatus, setPoStatus] = useState<string>(existingComp?.poStatus || 'Not Issued');
  const [poNumber, setPoNumber] = useState<string>(existingComp?.poNumber || '');
  const [poDate, setPoDate] = useState<string>(existingComp?.poDate || '');
  const [supplier, setSupplier] = useState<string>(existingComp?.supplier || '');
  const [expectedDelivery, setExpectedDelivery] = useState<string>(existingComp?.expectedDelivery || '');

  // Store
  const [materialReceived, setMaterialReceived] = useState<string>(existingComp?.materialReceived || 'No');
  const [receivedQty, setReceivedQty] = useState<number>(existingComp?.receivedQuantity ?? 0);
  const [grnReference, setGrnReference] = useState<string>(existingComp?.grnReceiptReference || '');
  const [receiptDate, setReceiptDate] = useState<string>(existingComp?.receiptDate || '');

  // Electronics
  const [accessoryAvailable, setAccessoryAvailable] = useState<string>(existingComp?.accessoryAvailable || 'Yes');
  const [accessoryPrepared, setAccessoryPrepared] = useState<string>(existingComp?.accessoryPreparedProcessed || 'Pending');
  const [electronicsStatus, setElectronicsStatus] = useState<string>(existingComp?.electronicsStatus || 'Pending');

  // Calibration
  const [calibrationRequired, setCalibrationRequired] = useState<string>(existingComp?.calibrationRequired || 'Yes');
  const [calibrationCompleted, setCalibrationCompleted] = useState<string>(existingComp?.calibrationCompleted || 'Pending');
  const [calibrationCertificate, setCalibrationCertificate] = useState<string>(existingComp?.calibrationCertificate || '');
  const [calibrationDate, setCalibrationDate] = useState<string>(existingComp?.calibrationDate || '');

  // Packing
  const [packingStatus, setPackingStatus] = useState<string>(existingComp?.packingStatus || 'Pending');
  const [packedQuantity, setPackedQuantity] = useState<number>(existingComp?.packedQuantity ?? 0);
  const [packingDate, setPackingDate] = useState<string>(existingComp?.packingDate || '');

  const [isSubmitting, setIsSubmitting] = useState(false);

  // Sync state when activeItem or activeDept changes
  const switchItem = (itemId: string) => {
    setActiveItemId(itemId);
    const item = items.find((x) => x.id === itemId);
    if (!item) return;
    const comp = compliances.find((c) => c.itemId === item.id && c.department === activeDept);
    setCompletedQty(comp?.completedQuantity ?? 0);
    setStatus(comp?.status || 'Pending');
    setExpectedDate(comp?.expectedDate || '');
    setRemarks(comp?.remarks || '');
    setAttachment(comp?.attachment || '');

    setPoStatus(comp?.poStatus || 'Not Issued');
    setPoNumber(comp?.poNumber || '');
    setPoDate(comp?.poDate || '');
    setSupplier(comp?.supplier || '');
    setExpectedDelivery(comp?.expectedDelivery || '');

    setMaterialReceived(comp?.materialReceived || 'No');
    setReceivedQty(comp?.receivedQuantity ?? 0);
    setGrnReference(comp?.grnReceiptReference || '');
    setReceiptDate(comp?.receiptDate || '');

    setAccessoryAvailable(comp?.accessoryAvailable || 'Yes');
    setAccessoryPrepared(comp?.accessoryPreparedProcessed || 'Pending');
    setElectronicsStatus(comp?.electronicsStatus || 'Pending');

    setCalibrationRequired(comp?.calibrationRequired || 'Yes');
    setCalibrationCompleted(comp?.calibrationCompleted || 'Pending');
    setCalibrationCertificate(comp?.calibrationCertificate || '');
    setCalibrationDate(comp?.calibrationDate || '');

    setPackingStatus(comp?.packingStatus || 'Pending');
    setPackedQuantity(comp?.packedQuantity ?? 0);
    setPackingDate(comp?.packingDate || '');
  };

  // Auto calculate Pending Qty: Required - Completed (no negative)
  const reqQty = activeItem ? Number(activeItem.quantity) : 0;
  const pendingQty = Math.max(0, reqQty - Number(completedQty || 0));

  const handleSaveCompliance = async () => {
    if (!activeItem) return;

    try {
      setIsSubmitting(true);
      const payload: Omit<AccessoriesCompliance, 'id' | 'pendingQuantity' | 'updatedAt'> = {
        orderId: order.id,
        orderNumber: order.orderNumber,
        itemId: activeItem.id,
        itemName: activeItem.accessoryName,
        department: activeDept,
        requiredQuantity: reqQty,
        completedQuantity: Number(completedQty),
        status,
        expectedDate,
        remarks,
        attachment,
        updatedBy: userProfile?.displayName || userProfile?.email || 'User',
        // Dept specifics:
        poStatus,
        poNumber,
        poDate,
        supplier,
        expectedDelivery,
        materialReceived,
        receivedQuantity: Number(receivedQty || completedQty),
        grnReceiptReference: grnReference,
        receiptDate,
        accessoryAvailable,
        accessoryPreparedProcessed: accessoryPrepared,
        electronicsStatus,
        calibrationRequired,
        calibrationCompleted,
        calibrationCertificate,
        calibrationDate,
        packingStatus,
        packedQuantity: Number(packedQuantity || completedQty),
        packingDate,
      };

      await saveAccessoriesCompliance(
        payload,
        userProfile?.email,
        userProfile?.displayName,
        activeDept
      );

      onSuccess();
    } catch (err: any) {
      alert(err.message || 'Failed to update compliance');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white w-full max-w-4xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh] text-xs">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">
              <CheckCircle2 className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-base">Update Item-Wise Department Compliance</h3>
              <p className="text-xs text-slate-500">
                Order: <span className="font-bold text-slate-800">{order.orderNumber}</span> | CMM: <span className="font-bold text-slate-800">{order.cmmNumber} ({order.cmmModel})</span>
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Department Selector */}
        <div className="px-6 py-2.5 bg-slate-100/70 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <span className="font-bold text-slate-700">Complying Department:</span>
            {isAdmin ? (
              <select
                value={activeDept}
                onChange={(e) => {
                  setActiveDept(e.target.value);
                  setTimeout(() => switchItem(activeItemId), 50);
                }}
                className="px-2.5 py-1 rounded-lg border border-slate-300 bg-white font-bold text-blue-700"
              >
                {ACCESSORIES_TARGET_DEPARTMENTS.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            ) : (
              <span className="px-3 py-1 bg-blue-100 text-blue-800 font-bold rounded-lg border border-blue-200">
                {activeDept}
              </span>
            )}
          </div>
          <span className="text-[11px] text-slate-500">
            Due: <strong className="text-slate-800">{order.requiredDate}</strong> | Priority: <strong className="text-slate-800">{order.priority}</strong>
          </span>
        </div>

        {/* Body Layout: Left Item Selector, Right Compliance Form */}
        <div className="flex-1 overflow-y-auto flex flex-col md:flex-row">
          {/* Left: Item list selector */}
          <div className="w-full md:w-64 border-b md:border-b-0 md:border-r border-slate-200 bg-slate-50/50 p-3 space-y-1.5 overflow-y-auto">
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider px-2 mb-1">
              Select Accessory ({items.length})
            </p>
            {items.map((it) => {
              const comp = compliances.find((c) => c.itemId === it.id && c.department === activeDept);
              const isSelected = it.id === activeItemId;
              const isCompleted = comp?.status === 'Completed';
              return (
                <button
                  key={it.id}
                  type="button"
                  onClick={() => switchItem(it.id)}
                  className={`w-full text-left p-2.5 rounded-xl border transition flex items-center justify-between ${
                    isSelected
                      ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <div className="min-w-0 pr-2">
                    <p className="font-bold truncate">{it.accessoryName}</p>
                    <p className={`text-[10px] truncate ${isSelected ? 'text-blue-100' : 'text-slate-400'}`}>
                      Qty: {it.quantity} {it.uom} | P/N: {it.partNumber || 'N/A'}
                    </p>
                  </div>
                  {isCompleted ? (
                    <CheckCircle2 className={`w-4 h-4 shrink-0 ${isSelected ? 'text-emerald-300' : 'text-emerald-600'}`} />
                  ) : (
                    <span
                      className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                        isSelected ? 'bg-blue-700 text-blue-100' : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {comp?.status || 'Pending'}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Right: Compliance Form */}
          <div className="flex-1 p-6 space-y-5 overflow-y-auto">
            {activeItem && (
              <>
                {/* Active Item Details Card */}
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <span className="text-slate-400 text-[10px] uppercase font-bold block">Accessory Item</span>
                    <span className="font-bold text-slate-900 text-sm">{activeItem.accessoryName}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 text-[10px] uppercase font-bold block">Part Number</span>
                    <span className="font-semibold text-slate-800">{activeItem.partNumber || '—'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 text-[10px] uppercase font-bold block">Required Qty</span>
                    <span className="font-bold text-slate-900 text-sm">
                      {activeItem.quantity} {activeItem.uom}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 text-[10px] uppercase font-bold block">Item Due Date</span>
                    <span className="font-semibold text-slate-800">{activeItem.requiredDate || order.requiredDate}</span>
                  </div>
                  {activeItem.specification && (
                    <div className="col-span-2 sm:col-span-4 text-[11px] text-slate-600 bg-white p-2 rounded-lg border border-slate-200">
                      <strong>Specification:</strong> {activeItem.specification}
                    </div>
                  )}
                </div>

                {/* Common Compliance Fields */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Required Quantity</label>
                    <input
                      type="number"
                      readOnly
                      value={reqQty}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-100 font-bold text-slate-600"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Completed / Available Quantity *</label>
                    <input
                      type="number"
                      min="0"
                      max={reqQty}
                      value={completedQty}
                      onChange={(e) => {
                        const val = Math.max(0, Number(e.target.value));
                        setCompletedQty(val);
                        if (val >= reqQty) {
                          setStatus('Completed');
                        } else if (val > 0) {
                          setStatus('Partially Completed');
                        }
                      }}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:ring-2 focus:ring-emerald-500 font-bold text-emerald-800 bg-emerald-50/40 text-sm"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Pending Quantity (Calculated)</label>
                    <input
                      type="number"
                      readOnly
                      value={pendingQty}
                      className={`w-full px-3 py-2 rounded-xl border font-bold text-sm ${
                        pendingQty > 0 ? 'bg-amber-50 text-amber-800 border-amber-200' : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                      }`}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Compliance Status *</label>
                    <select
                      value={status}
                      onChange={(e) => setStatus(e.target.value as ComplianceStatus)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 font-bold text-slate-800"
                    >
                      <option value="Pending">Pending</option>
                      <option value="In Progress">In Progress</option>
                      <option value="Partially Completed">Partially Completed</option>
                      <option value="Completed">Completed</option>
                      <option value="Delayed">Delayed</option>
                      <option value="Not Applicable">Not Applicable</option>
                    </select>
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Expected / Completion Date</label>
                    <input
                      type="date"
                      value={expectedDate}
                      onChange={(e) => setExpectedDate(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300"
                    />
                  </div>
                </div>

                {/* DEPARTMENT SPECIFIC SECTIONS */}
                {/* 1. PURCHASE */}
                {activeDept.includes('Purchase') && (
                  <div className="p-4 bg-blue-50/50 rounded-xl border border-blue-200 space-y-3">
                    <h5 className="font-bold text-blue-900 text-xs uppercase tracking-wider">Purchase Department Details</h5>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block font-medium text-slate-700 mb-1">PO Status</label>
                        <select
                          value={poStatus}
                          onChange={(e) => setPoStatus(e.target.value)}
                          className="w-full px-3 py-1.5 rounded-lg border border-slate-300 bg-white"
                        >
                          <option value="Not Issued">Not Issued</option>
                          <option value="PO Issued">PO Issued</option>
                          <option value="Under Follow-up">Under Follow-up</option>
                          <option value="Dispatched by Vendor">Dispatched by Vendor</option>
                          <option value="Delivered">Delivered</option>
                        </select>
                      </div>

                      <div>
                        <label className="block font-medium text-slate-700 mb-1">PO Number</label>
                        <input
                          type="text"
                          value={poNumber}
                          onChange={(e) => setPoNumber(e.target.value)}
                          placeholder="e.g. PO-2026-9812"
                          className="w-full px-3 py-1.5 rounded-lg border border-slate-300 bg-white font-bold"
                        />
                      </div>

                      <div>
                        <label className="block font-medium text-slate-700 mb-1">Supplier / Vendor</label>
                        <input
                          type="text"
                          value={supplier}
                          onChange={(e) => setSupplier(e.target.value)}
                          placeholder="e.g. Renishaw / Carl Zeiss / Mitutoyo"
                          className="w-full px-3 py-1.5 rounded-lg border border-slate-300 bg-white"
                        />
                      </div>

                      <div>
                        <label className="block font-medium text-slate-700 mb-1">Expected Delivery Date</label>
                        <input
                          type="date"
                          value={expectedDelivery}
                          onChange={(e) => setExpectedDelivery(e.target.value)}
                          className="w-full px-3 py-1.5 rounded-lg border border-slate-300 bg-white"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* 2. STORE */}
                {activeDept.includes('Store') && (
                  <div className="p-4 bg-amber-50/50 rounded-xl border border-amber-200 space-y-3">
                    <h5 className="font-bold text-amber-900 text-xs uppercase tracking-wider">Store Department Inward Details</h5>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block font-medium text-slate-700 mb-1">Material Received?</label>
                        <select
                          value={materialReceived}
                          onChange={(e) => setMaterialReceived(e.target.value)}
                          className="w-full px-3 py-1.5 rounded-lg border border-slate-300 bg-white"
                        >
                          <option value="No">No</option>
                          <option value="Partial">Partial</option>
                          <option value="Full">Full</option>
                        </select>
                      </div>

                      <div>
                        <label className="block font-medium text-slate-700 mb-1">GRN / Receipt Reference</label>
                        <input
                          type="text"
                          value={grnReference}
                          onChange={(e) => setGrnReference(e.target.value)}
                          placeholder="e.g. GRN-2026-4421"
                          className="w-full px-3 py-1.5 rounded-lg border border-slate-300 bg-white font-bold"
                        />
                      </div>

                      <div>
                        <label className="block font-medium text-slate-700 mb-1">Received Quantity</label>
                        <input
                          type="number"
                          value={receivedQty}
                          onChange={(e) => setReceivedQty(Number(e.target.value))}
                          className="w-full px-3 py-1.5 rounded-lg border border-slate-300 bg-white"
                        />
                      </div>

                      <div>
                        <label className="block font-medium text-slate-700 mb-1">Receipt Date</label>
                        <input
                          type="date"
                          value={receiptDate}
                          onChange={(e) => setReceiptDate(e.target.value)}
                          className="w-full px-3 py-1.5 rounded-lg border border-slate-300 bg-white"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* 3. ELECTRONICS */}
                {activeDept.includes('Electronics') && (
                  <div className="p-4 bg-indigo-50/50 rounded-xl border border-indigo-200 space-y-3">
                    <h5 className="font-bold text-indigo-900 text-xs uppercase tracking-wider">Electronics Processing Details</h5>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block font-medium text-slate-700 mb-1">Accessory Available in Dept?</label>
                        <select
                          value={accessoryAvailable}
                          onChange={(e) => setAccessoryAvailable(e.target.value)}
                          className="w-full px-3 py-1.5 rounded-lg border border-slate-300 bg-white"
                        >
                          <option value="Yes">Yes</option>
                          <option value="No">No</option>
                          <option value="In Transit">In Transit</option>
                        </select>
                      </div>

                      <div>
                        <label className="block font-medium text-slate-700 mb-1">Prepared / Processed Status</label>
                        <select
                          value={accessoryPrepared}
                          onChange={(e) => setAccessoryPrepared(e.target.value)}
                          className="w-full px-3 py-1.5 rounded-lg border border-slate-300 bg-white"
                        >
                          <option value="Pending">Pending</option>
                          <option value="In Progress">In Progress</option>
                          <option value="Wiring Done">Wiring Done</option>
                          <option value="Bench Tested">Bench Tested</option>
                          <option value="Completed">Completed</option>
                          <option value="N/A">Not Applicable</option>
                        </select>
                      </div>
                    </div>
                  </div>
                )}

                {/* 4. CALIBRATION */}
                {activeDept.includes('Calibration') && (
                  <div className="p-4 bg-purple-50/50 rounded-xl border border-purple-200 space-y-3">
                    <h5 className="font-bold text-purple-900 text-xs uppercase tracking-wider">Calibration Department Details</h5>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block font-medium text-slate-700 mb-1">Calibration Required?</label>
                        <select
                          value={calibrationRequired}
                          onChange={(e) => setCalibrationRequired(e.target.value)}
                          className="w-full px-3 py-1.5 rounded-lg border border-slate-300 bg-white"
                        >
                          <option value="Yes">Yes</option>
                          <option value="No">No</option>
                        </select>
                      </div>

                      <div>
                        <label className="block font-medium text-slate-700 mb-1">Calibration Certificate / Report #</label>
                        <input
                          type="text"
                          value={calibrationCertificate}
                          onChange={(e) => setCalibrationCertificate(e.target.value)}
                          placeholder="e.g. CAL-CERT-2026-081"
                          className="w-full px-3 py-1.5 rounded-lg border border-slate-300 bg-white font-bold"
                        />
                      </div>

                      <div>
                        <label className="block font-medium text-slate-700 mb-1">Calibration Completion Status</label>
                        <select
                          value={calibrationCompleted}
                          onChange={(e) => setCalibrationCompleted(e.target.value)}
                          className="w-full px-3 py-1.5 rounded-lg border border-slate-300 bg-white"
                        >
                          <option value="Pending">Pending</option>
                          <option value="In Progress">In Progress</option>
                          <option value="Calibrated">Calibrated (Passed)</option>
                          <option value="Failed">Failed (Rejection)</option>
                          <option value="N/A">Not Applicable</option>
                        </select>
                      </div>

                      <div>
                        <label className="block font-medium text-slate-700 mb-1">Calibration Date</label>
                        <input
                          type="date"
                          value={calibrationDate}
                          onChange={(e) => setCalibrationDate(e.target.value)}
                          className="w-full px-3 py-1.5 rounded-lg border border-slate-300 bg-white"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* 5. PACKING */}
                {activeDept.includes('Packing') && (
                  <div className="p-4 bg-emerald-50/50 rounded-xl border border-emerald-200 space-y-3">
                    <h5 className="font-bold text-emerald-900 text-xs uppercase tracking-wider">Packing Department Details</h5>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block font-medium text-slate-700 mb-1">Packing Status</label>
                        <select
                          value={packingStatus}
                          onChange={(e) => setPackingStatus(e.target.value)}
                          className="w-full px-3 py-1.5 rounded-lg border border-slate-300 bg-white"
                        >
                          <option value="Pending">Pending</option>
                          <option value="Accessory Box Packed">Accessory Box Packed</option>
                          <option value="Main Crate Ready">Main Crate Ready</option>
                          <option value="Completed">Completed</option>
                        </select>
                      </div>

                      <div>
                        <label className="block font-medium text-slate-700 mb-1">Packed Quantity</label>
                        <input
                          type="number"
                          value={packedQuantity}
                          onChange={(e) => setPackedQuantity(Number(e.target.value))}
                          className="w-full px-3 py-1.5 rounded-lg border border-slate-300 bg-white font-bold"
                        />
                      </div>

                      <div>
                        <label className="block font-medium text-slate-700 mb-1">Packing Date</label>
                        <input
                          type="date"
                          value={packingDate}
                          onChange={(e) => setPackingDate(e.target.value)}
                          className="w-full px-3 py-1.5 rounded-lg border border-slate-300 bg-white"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Remarks & Attachment */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Department Compliance Remarks</label>
                    <input
                      type="text"
                      value={remarks}
                      onChange={(e) => setRemarks(e.target.value)}
                      placeholder="e.g. Delivered to calibration bay on time"
                      className="w-full px-3 py-2 rounded-xl border border-slate-300"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Attachment / Reference URL</label>
                    <input
                      type="text"
                      value={attachment}
                      onChange={(e) => setAttachment(e.target.value)}
                      placeholder="e.g. Document or Inspection report link"
                      className="w-full px-3 py-2 rounded-xl border border-slate-300"
                    />
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
          <div className="text-xs text-slate-500">
            Saving updates compliance status and triggers next-department notification.
          </div>
          <div className="flex items-center space-x-2">
            <button onClick={onClose} className="px-4 py-2 rounded-xl border border-slate-200 font-bold text-slate-700 hover:bg-slate-100">
              Close
            </button>
            <button
              disabled={isSubmitting}
              onClick={handleSaveCompliance}
              className="flex items-center space-x-1.5 px-6 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold transition shadow-sm"
            >
              <Check className="w-4 h-4" />
              <span>Save Compliance</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// =========================================================================
// SUB-COMPONENT: ORDER DETAILS MODAL
// =========================================================================

interface AccessoriesOrderDetailsModalProps {
  order: AccessoriesOrder;
  items: AccessoriesItem[];
  compliances: AccessoriesCompliance[];
  history: AccessoriesOrderHistory[];
  onClose: () => void;
  onOpenCompliance: () => void;
}

const AccessoriesOrderDetailsModal: React.FC<AccessoriesOrderDetailsModalProps> = ({
  order,
  items,
  compliances,
  history,
  onClose,
  onOpenCompliance,
}) => {
  const [activeTab, setActiveTab] = useState<'items' | 'depts' | 'history'>('items');

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white w-full max-w-5xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh] text-xs">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-lg font-bold text-slate-900">{order.orderNumber}</span>
              <span className="text-xs font-bold px-2 py-0.5 rounded bg-slate-100 border text-slate-700">
                Rev R{order.revision ?? 0}
              </span>
              <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-800">
                {order.status}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              CMM Machine: <strong className="text-slate-800">{order.cmmNumber}</strong> ({order.cmmModel}) | Project: <strong className="text-slate-800">{order.project}</strong> | Customer: <strong className="text-slate-800">{order.customer}</strong>
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="px-6 border-b border-slate-200 bg-white flex space-x-4">
          <button
            onClick={() => setActiveTab('items')}
            className={`py-3 font-bold border-b-2 transition ${
              activeTab === 'items' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Accessory Items Matrix ({items.length})
          </button>
          <button
            onClick={() => setActiveTab('depts')}
            className={`py-3 font-bold border-b-2 transition ${
              activeTab === 'depts' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Department Progress
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`py-3 font-bold border-b-2 transition ${
              activeTab === 'history' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Audit History ({history.length})
          </button>
        </div>

        {/* Tab Content */}
        <div className="p-6 overflow-y-auto flex-1 space-y-4">
          {activeTab === 'items' && (
            <div className="overflow-x-auto border border-slate-200 rounded-xl">
              <table className="w-full text-left">
                <thead className="bg-slate-50 text-[11px] font-bold text-slate-500 uppercase border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-3">#</th>
                    <th className="py-2.5 px-3">Accessory Name</th>
                    <th className="py-2.5 px-3">Part No</th>
                    <th className="py-2.5 px-3">Qty</th>
                    <th className="py-2.5 px-3">Purchase</th>
                    <th className="py-2.5 px-3">Store</th>
                    <th className="py-2.5 px-3">Electronics</th>
                    <th className="py-2.5 px-3">Calibration</th>
                    <th className="py-2.5 px-3">Packing</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.map((it) => {
                    const getDeptComp = (dept: string) => compliances.find((c) => c.itemId === it.id && c.department === dept);

                    return (
                      <tr key={it.id} className="hover:bg-slate-50/70">
                        <td className="py-2.5 px-3 font-bold text-slate-500">{it.srNo}</td>
                        <td className="py-2.5 px-3">
                          <div className="font-bold text-slate-900">{it.accessoryName}</div>
                          {it.specification && <div className="text-[10px] text-slate-400">{it.specification}</div>}
                        </td>
                        <td className="py-2.5 px-3 text-slate-600">{it.partNumber || '—'}</td>
                        <td className="py-2.5 px-3 font-bold text-slate-800">
                          {it.quantity} {it.uom}
                        </td>
                        {ACCESSORIES_TARGET_DEPARTMENTS.map((dept) => {
                          const comp = getDeptComp(dept);
                          const st = comp?.status || 'Pending';
                          const color =
                            st === 'Completed'
                              ? 'bg-emerald-100 text-emerald-800'
                              : st === 'In Progress' || st === 'Partially Completed'
                              ? 'bg-blue-100 text-blue-800'
                              : st === 'Delayed'
                              ? 'bg-red-100 text-red-800'
                              : 'bg-slate-100 text-slate-600';
                          return (
                            <td key={dept} className="py-2.5 px-3">
                              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${color}`}>
                                {comp ? `${comp.completedQuantity}/${it.quantity}` : '0/' + it.quantity}
                              </span>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === 'depts' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {ACCESSORIES_TARGET_DEPARTMENTS.map((dept) => {
                const st = order.departmentStatuses?.[dept] || 'Pending';
                const deptComps = compliances.filter((c) => c.department === dept);
                const compCount = deptComps.filter((c) => c.status === 'Completed').length;

                return (
                  <div key={dept} className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-900 text-xs">{dept}</span>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          st === 'Completed'
                            ? 'bg-emerald-100 text-emerald-800'
                            : st === 'Delayed'
                            ? 'bg-red-100 text-red-800'
                            : 'bg-blue-100 text-blue-800'
                        }`}
                      >
                        {st}
                      </span>
                    </div>
                    <div className="text-slate-500 text-xs">
                      Items Completed: <strong>{compCount}</strong> / {items.length}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {activeTab === 'history' && (
            <div className="space-y-2">
              {history.length === 0 ? (
                <p className="text-slate-400 py-6 text-center">No history records logged yet.</p>
              ) : (
                history.map((h) => (
                  <div key={h.id} className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                    <div className="flex items-center justify-between text-[11px] text-slate-500">
                      <span className="font-bold text-slate-800">{h.action}</span>
                      <span>{h.date} at {h.time}</span>
                    </div>
                    <p className="text-slate-700">{h.remarks}</p>
                    <div className="text-[10px] text-slate-400">
                      By: <strong className="text-slate-600">{h.user}</strong> ({h.department})
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
          <span className="text-xs text-slate-500">Accurate Gauging CMM Order Control</span>
          <div className="flex items-center space-x-2">
            <button onClick={onClose} className="px-4 py-2 rounded-xl border border-slate-200 font-bold text-slate-700 hover:bg-slate-100">
              Close
            </button>
            <button
              onClick={onOpenCompliance}
              className="flex items-center space-x-1.5 px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold transition shadow-sm"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Update Compliance</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// =========================================================================
// SUB-COMPONENT: HISTORY MODAL
// =========================================================================

interface AccessoriesOrderHistoryModalProps {
  order: AccessoriesOrder;
  history: AccessoriesOrderHistory[];
  onClose: () => void;
}

const AccessoriesOrderHistoryModal: React.FC<AccessoriesOrderHistoryModalProps> = ({
  order,
  history,
  onClose,
}) => {
  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden text-xs flex flex-col max-h-[85vh]">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div>
            <h3 className="font-bold text-slate-900 text-base">Accessories Order Audit History</h3>
            <p className="text-xs text-slate-500">
              Order: {order.orderNumber} (CMM {order.cmmNumber})
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1 space-y-3">
          {history.length === 0 ? (
            <p className="text-center text-slate-400 py-8">No history recorded yet.</p>
          ) : (
            history.map((h, i) => (
              <div key={h.id || i} className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-1.5">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-bold text-blue-700 uppercase tracking-wide">{h.action}</span>
                  <span className="text-slate-400">{h.date} {h.time}</span>
                </div>
                <p className="text-slate-800 font-medium">{h.remarks}</p>
                <div className="flex items-center justify-between text-[10px] text-slate-500 pt-1 border-t border-slate-200/60">
                  <span>User: <strong className="text-slate-700">{h.user}</strong></span>
                  <span>Dept: <strong className="text-slate-700">{h.department}</strong></span>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="px-6 py-3 border-t border-slate-100 bg-slate-50 text-right">
          <button onClick={onClose} className="px-4 py-2 rounded-xl border border-slate-200 font-bold text-slate-700 hover:bg-slate-100">
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
