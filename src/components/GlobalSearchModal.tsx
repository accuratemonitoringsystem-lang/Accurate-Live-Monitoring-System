import React, { useState, useEffect, useRef } from 'react';
import { Search, X, Cpu, CheckSquare, Calendar, Building, ArrowRight } from 'lucide-react';
import { DepartmentWork, Machine, MonthlyPlan, QualityOperation } from '../types';

interface GlobalSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  machines: Machine[];
  operations: QualityOperation[];
  departmentWork: DepartmentWork[];
  monthlyPlans: MonthlyPlan[];
  onSelectMachine: (machine: Machine) => void;
  onSelectView: (view: string) => void;
}

export const GlobalSearchModal: React.FC<GlobalSearchModalProps> = ({
  isOpen,
  onClose,
  machines,
  operations,
  departmentWork,
  monthlyPlans,
  onSelectMachine,
  onSelectView,
}) => {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setQuery('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const cleanQuery = query.trim().toLowerCase();

  const matchedMachines = cleanQuery
    ? machines.filter(
        (m) =>
          m.machineNumber.toLowerCase().includes(cleanQuery) ||
          m.model.toLowerCase().includes(cleanQuery) ||
          (m.project && m.project.toLowerCase().includes(cleanQuery)) ||
          (m.customer && m.customer.toLowerCase().includes(cleanQuery)) ||
          m.currentDepartment.toLowerCase().includes(cleanQuery)
      )
    : [];

  const matchedOps = cleanQuery
    ? operations.filter(
        (o) =>
          o.operationName.toLowerCase().includes(cleanQuery) ||
          o.machineModel.toLowerCase().includes(cleanQuery) ||
          (o.partCode && o.partCode.toLowerCase().includes(cleanQuery))
      )
    : [];

  const matchedWork = cleanQuery
    ? departmentWork.filter(
        (w) =>
          w.title.toLowerCase().includes(cleanQuery) ||
          w.department.toLowerCase().includes(cleanQuery) ||
          (w.machineNumber && w.machineNumber.toLowerCase().includes(cleanQuery)) ||
          (w.assignedTo && w.assignedTo.toLowerCase().includes(cleanQuery))
      )
    : [];

  const totalMatches = matchedMachines.length + matchedOps.length + matchedWork.length;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-start justify-center pt-20 px-4">
      <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Search header */}
        <div className="flex items-center px-4 py-3 border-b border-slate-200 bg-slate-50">
          <Search className="w-5 h-5 text-slate-400 mr-3 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Type machine number (e.g. 2523), model (e.g. 685), operation, project, or department..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1 bg-transparent border-none text-sm text-slate-900 focus:outline-hidden placeholder:text-slate-400"
          />
          {query && (
            <button onClick={() => setQuery('')} className="text-slate-400 hover:text-slate-600 mr-2">
              <X className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={onClose}
            className="text-xs bg-slate-200 hover:bg-slate-300 text-slate-700 px-2 py-1 rounded"
          >
            ESC
          </button>
        </div>

        {/* Search Results */}
        <div className="max-h-96 overflow-y-auto p-4 space-y-4">
          {!cleanQuery ? (
            <div className="py-8 text-center text-xs text-slate-400">
              Start typing to search live database records across all factory modules...
            </div>
          ) : totalMatches === 0 ? (
            <div className="py-8 text-center text-xs text-slate-500 font-medium">
              No matching live records found for &ldquo;{query}&rdquo;.
            </div>
          ) : (
            <>
              {matchedMachines.length > 0 && (
                <div>
                  <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <Cpu className="w-3.5 h-3.5 text-blue-600" />
                    <span>Machines ({matchedMachines.length})</span>
                  </div>
                  <div className="space-y-1.5">
                    {matchedMachines.slice(0, 5).map((m) => (
                      <div
                        key={m.id}
                        onClick={() => {
                          onSelectMachine(m);
                          onSelectView('machines');
                          onClose();
                        }}
                        className="p-2.5 rounded-lg border border-slate-100 hover:border-blue-300 hover:bg-blue-50/50 cursor-pointer flex items-center justify-between transition"
                      >
                        <div>
                          <span className="font-bold text-slate-900 text-xs">
                            Machine {m.machineNumber}
                          </span>
                          <span className="ml-2 text-[11px] text-slate-600">Model {m.model}</span>
                          <span className="ml-2 text-[10px] bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded font-mono">
                            {m.currentDepartment}
                          </span>
                        </div>
                        <span className="text-[10px] bg-blue-100 text-blue-800 font-semibold px-2 py-0.5 rounded">
                          {m.currentStatus}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {matchedOps.length > 0 && (
                <div>
                  <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <CheckSquare className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Quality Operations ({matchedOps.length})</span>
                  </div>
                  <div className="space-y-1.5">
                    {matchedOps.slice(0, 5).map((o) => (
                      <div
                        key={o.id}
                        onClick={() => {
                          onSelectView('quality');
                          onClose();
                        }}
                        className="p-2.5 rounded-lg border border-slate-100 hover:border-indigo-300 hover:bg-indigo-50/50 cursor-pointer flex items-center justify-between transition"
                      >
                        <div>
                          <div className="font-semibold text-slate-900 text-xs">{o.operationName}</div>
                          <div className="text-[11px] text-slate-500">
                            Model: {o.machineModel} • Category: {o.category}
                            {o.partCode ? ` • Part: ${o.partCode}` : ''}
                          </div>
                        </div>
                        <ArrowRight className="w-4 h-4 text-slate-400" />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {matchedWork.length > 0 && (
                <div>
                  <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <Building className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Department Work Orders ({matchedWork.length})</span>
                  </div>
                  <div className="space-y-1.5">
                    {matchedWork.slice(0, 5).map((w) => (
                      <div
                        key={w.id}
                        onClick={() => {
                          onSelectView('department_work');
                          onClose();
                        }}
                        className="p-2.5 rounded-lg border border-slate-100 hover:border-emerald-300 hover:bg-emerald-50/50 cursor-pointer flex items-center justify-between transition"
                      >
                        <div>
                          <div className="font-semibold text-slate-900 text-xs">{w.title}</div>
                          <div className="text-[11px] text-slate-500">
                            Dept: {w.department}
                            {w.machineNumber ? ` • Machine ${w.machineNumber}` : ''}
                          </div>
                        </div>
                        <span className="text-[10px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded font-medium">
                          {w.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
