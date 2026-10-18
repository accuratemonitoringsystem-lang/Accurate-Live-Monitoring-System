import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Wrench,
  PauseCircle,
  X,
  Building,
  Check,
  Info,
  ShieldAlert,
} from 'lucide-react';
import { Machine } from '../types';
import { performMachineQualityInspection } from '../services/db';
import { useAuth } from '../context/AuthContext';
import { hasQualityInspectionAccess } from '../utils/departmentUtils';
import { INITIAL_DEPARTMENTS, REJECTION_REASONS, DEFECT_CATEGORIES, DefectCategory } from '../constants';

interface QualityInspectionDecisionModalProps {
  isOpen: boolean;
  onClose: () => void;
  machine: Machine | null;
  initialAction?: 'Accept' | 'Reject' | 'Rework' | 'Hold';
  onSuccess?: (message: string) => void;
}

export const QualityInspectionDecisionModal: React.FC<
  QualityInspectionDecisionModalProps
> = ({
  isOpen,
  onClose,
  machine,
  initialAction = 'Accept',
  onSuccess,
}) => {
  const { userProfile } = useAuth();
  const isAuthorized = hasQualityInspectionAccess(userProfile);

  const [selectedAction, setSelectedAction] = useState<'Accept' | 'Reject' | 'Rework'>(
    initialAction === 'Hold' ? 'Rework' : (initialAction as 'Accept' | 'Reject' | 'Rework')
  );
  const [inspector, setInspector] = useState(
    userProfile?.displayName || userProfile?.email || 'Quality Inspector'
  );

  // Accept Form
  const [acceptRemarks, setAcceptRemarks] = useState('');
  const [acceptConfirmed, setAcceptConfirmed] = useState(true);

  // Reject Form
  const [rejectDefectCategory, setRejectDefectCategory] = useState<DefectCategory>(
    DEFECT_CATEGORIES[0] || 'Dimensional'
  );
  const [rejectReason, setRejectReason] = useState<string>(REJECTION_REASONS[0] || 'Dimension Out of Tolerance');
  const [rejectFinding, setRejectFinding] = useState('');
  const [rejectSpec, setRejectSpec] = useState('');
  const [rejectDept, setRejectDept] = useState(machine?.currentDepartment || '06-A Metal Shop');
  const [rejectActionReq, setRejectActionReq] = useState('');
  const [rejectRemarks, setRejectRemarks] = useState('');

  // Rework Form (Replaces legacy Hold)
  const [reworkDefectCategory, setReworkDefectCategory] = useState<DefectCategory>(
    DEFECT_CATEGORIES[0] || 'Dimensional'
  );
  const [reworkReason, setReworkReason] = useState('Correction / Rework Required');
  const [reworkDept, setReworkDept] = useState(machine?.currentDepartment || '06-A Metal Shop');
  const [reworkFinding, setReworkFinding] = useState('');
  const [reworkSpec, setReworkSpec] = useState('');
  const [reworkActionReq, setReworkActionReq] = useState('');
  const [reworkReviewDate, setReworkReviewDate] = useState('');
  const [reworkRemarks, setReworkRemarks] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (initialAction) {
      setSelectedAction(initialAction === 'Hold' ? 'Rework' : (initialAction as 'Accept' | 'Reject' | 'Rework'));
    }
    if (machine) {
      setRejectDept(machine.currentDepartment || '06-A Metal Shop');
      setReworkDept(machine.currentDepartment || '06-A Metal Shop');
    }
    setErrorMsg(null);
  }, [initialAction, machine, isOpen]);

  if (!isOpen || !machine) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAuthorized) {
      setErrorMsg('ACCESS DENIED: Quality Inspection decisions are strictly reserved for Quality and Admin.');
      return;
    }

    if (selectedAction === 'Reject') {
      if (!rejectDefectCategory) {
        setErrorMsg('Please select a Defect Category for rejection.');
        return;
      }
      if (!rejectFinding.trim()) {
        setErrorMsg('Please specify the observed finding or actual measured value.');
        return;
      }
    }

    if (selectedAction === 'Rework') {
      if (!reworkDefectCategory) {
        setErrorMsg('Please select a Defect Category for rework.');
        return;
      }
    }

    setSubmitting(true);
    setErrorMsg(null);

    try {
      const isRework = selectedAction === 'Rework';
      const defectCategoryToPass =
        selectedAction === 'Reject'
          ? rejectDefectCategory
          : isRework
          ? reworkDefectCategory
          : undefined;

      const res = await performMachineQualityInspection({
        machineNumber: machine.machineNumber,
        action: selectedAction,
        inspector: inspector.trim() || 'Quality Inspector',
        defectCategory: defectCategoryToPass,
        reason:
          selectedAction === 'Reject'
            ? rejectReason
            : isRework
            ? reworkReason
            : undefined,
        observedFinding:
          selectedAction === 'Reject' ? rejectFinding.trim() : isRework ? reworkFinding.trim() : undefined,
        specification:
          selectedAction === 'Reject' ? rejectSpec.trim() : isRework ? reworkSpec.trim() : undefined,
        concernedDepartment:
          selectedAction === 'Reject' ? rejectDept : isRework ? reworkDept : undefined,
        correctiveActionRequired:
          selectedAction === 'Reject'
            ? rejectActionReq.trim()
            : isRework
            ? reworkActionReq.trim()
            : undefined,
        expectedReviewDate: isRework ? reworkReviewDate : undefined,
        remarks:
          selectedAction === 'Accept'
            ? acceptRemarks.trim()
            : selectedAction === 'Reject'
            ? rejectRemarks.trim()
            : reworkRemarks.trim(),
        userEmail: userProfile?.email,
      });

      if (onSuccess) {
        onSuccess(res.message);
      }
      onClose();
    } catch (err: any) {
      console.error('Error submitting quality inspection decision:', err);
      setErrorMsg(err.message || 'Failed to record quality inspection decision.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-slate-900 to-slate-800 text-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/20 text-blue-400 flex items-center justify-center border border-blue-400/30">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-black tracking-tight">
                  Quality Inspection Decision
                </h2>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-500/30 text-blue-300 border border-blue-400/30 uppercase">
                  Quality &amp; Admin
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                Official Quality sign-off for Machine {machine.machineNumber} ({machine.model || 'Standard'})
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg transition"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Access Denied Warning if unauthorized */}
        {!isAuthorized ? (
          <div className="p-8 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto border border-rose-200">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-bold text-slate-800">Quality Inspection Restricted</h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              Only authorized Quality personnel and System Administrators can perform Quality Inspection decisions.
            </p>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold"
            >
              Close
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex-1 flex flex-col overflow-hidden">
            {/* Machine Meta Bar */}
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex flex-wrap items-center gap-4">
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Machine</span>
                  <div className="font-black text-slate-900 text-sm">#{machine.machineNumber}</div>
                </div>
                <div className="border-l border-slate-200 pl-3">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Model / Size</span>
                  <div className="font-bold text-slate-800">{machine.model || 'Standard'}</div>
                </div>
                <div className="border-l border-slate-200 pl-3">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Department</span>
                  <div className="font-semibold text-blue-700">{machine.currentDepartment}</div>
                </div>
                <div className="border-l border-slate-200 pl-3">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Current Quality</span>
                  <div>
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                        (machine.qualityStatus || '').toLowerCase().includes('accept') ||
                        (machine.qualityStatus || '').toLowerCase().includes('pass')
                          ? 'bg-emerald-100 text-emerald-800'
                          : (machine.qualityStatus || '').toLowerCase().includes('reject')
                          ? 'bg-rose-100 text-rose-800'
                          : (machine.qualityStatus || '').toLowerCase().includes('rework') ||
                            (machine.qualityStatus || '').toLowerCase().includes('hold')
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-slate-200 text-slate-700'
                      }`}
                    >
                      {machine.qualityStatus === 'HOLD'
                        ? 'Rework (legacy Hold)'
                        : machine.qualityStatus === 'REWORK_REQUIRED'
                        ? 'REWORK REQUIRED'
                        : machine.qualityStatus || 'Pending QC'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Error Message */}
            {errorMsg && (
              <div className="m-4 mb-0 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                <span className="font-medium">{errorMsg}</span>
              </div>
            )}

            {/* Action Selector Tabs */}
            <div className="p-4 pb-0">
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">
                Select Quality Decision:
              </label>
              <div className="grid grid-cols-3 gap-2">
                {/* ACCEPT */}
                <button
                  type="button"
                  onClick={() => setSelectedAction('Accept')}
                  className={`p-3 rounded-xl border text-center font-bold text-xs transition flex flex-col items-center gap-1 ${
                    selectedAction === 'Accept'
                      ? 'bg-emerald-50 border-emerald-500 text-emerald-800 ring-2 ring-emerald-500/30'
                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <CheckCircle2 className={`w-4 h-4 ${selectedAction === 'Accept' ? 'text-emerald-600' : 'text-slate-400'}`} />
                  <span>ACCEPT</span>
                  <span className="text-[10px] font-normal text-slate-500">Quality Passed</span>
                </button>

                {/* REWORK */}
                <button
                  type="button"
                  onClick={() => setSelectedAction('Rework')}
                  className={`p-3 rounded-xl border text-center font-bold text-xs transition flex flex-col items-center gap-1 ${
                    selectedAction === 'Rework'
                      ? 'bg-amber-50 border-amber-500 text-amber-800 ring-2 ring-amber-500/30'
                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <Wrench className={`w-4 h-4 ${selectedAction === 'Rework' ? 'text-amber-600' : 'text-slate-400'}`} />
                  <span>REWORK</span>
                  <span className="text-[10px] font-normal text-slate-500">Rework Required</span>
                </button>

                {/* REJECT */}
                <button
                  type="button"
                  onClick={() => setSelectedAction('Reject')}
                  className={`p-3 rounded-xl border text-center font-bold text-xs transition flex flex-col items-center gap-1 ${
                    selectedAction === 'Reject'
                      ? 'bg-rose-50 border-rose-500 text-rose-800 ring-2 ring-rose-500/30'
                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <AlertTriangle className={`w-4 h-4 ${selectedAction === 'Reject' ? 'text-rose-600' : 'text-slate-400'}`} />
                  <span>REJECT</span>
                  <span className="text-[10px] font-normal text-slate-500">Non-Conformance</span>
                </button>
              </div>
            </div>

            {/* Dynamic Form Area */}
            <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Inspector Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={inspector}
                  onChange={(e) => setInspector(e.target.value)}
                  placeholder="e.g. Quality Inspector"
                  className="w-full text-xs p-2.5 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-semibold"
                />
              </div>

              {/* ACCEPT SECTION */}
              {selectedAction === 'Accept' && (
                <div className="space-y-4 animate-in fade-in">
                  <div className="p-3.5 bg-emerald-50/70 border border-emerald-200 rounded-xl text-xs text-emerald-900 space-y-1">
                    <p className="font-bold flex items-center gap-1.5 text-emerald-800">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      <span>Quality Acceptance Sign-off</span>
                    </p>
                    <p className="text-[11px] text-emerald-700">
                      Accepting this machine indicates that all tolerances, flatness, runout, and functional parameters have passed inspection. Machine status will be set to Accepted / Ready for Handover.
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Inspection Notes / Sign-off Remarks
                    </label>
                    <textarea
                      rows={3}
                      value={acceptRemarks}
                      onChange={(e) => setAcceptRemarks(e.target.value)}
                      placeholder="e.g. Dimensions, flatness, and insert fitment inspected within tolerance. Passed without remarks."
                      className="w-full text-xs p-2.5 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>

                  <label className="flex items-start gap-2 text-xs text-slate-700 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={acceptConfirmed}
                      onChange={(e) => setAcceptConfirmed(e.target.checked)}
                      className="mt-0.5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                    />
                    <span>
                      I verify that Machine <strong>#{machine.machineNumber}</strong> has completed required checks and complies with manufacturing specifications.
                    </span>
                  </label>
                </div>
              )}

              {/* REWORK SECTION */}
              {selectedAction === 'Rework' && (
                <div className="space-y-4 animate-in fade-in">
                  <div className="p-3.5 bg-amber-50/70 border border-amber-200 rounded-xl text-xs text-amber-900 space-y-1">
                    <p className="font-bold flex items-center gap-1.5 text-amber-800">
                      <Wrench className="w-4 h-4 text-amber-600" />
                      <span>Quality Decision: REWORK REQUIRED</span>
                    </p>
                    <p className="text-[11px] text-amber-700">
                      Sends the machine back to the originating department for correction. Quality status will be set to REWORK REQUIRED.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* Defect Category Dropdown (Mandatory 15 options) */}
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Defect Category <span className="text-red-500">*</span>
                      </label>
                      <select
                        required
                        value={reworkDefectCategory}
                        onChange={(e) => setReworkDefectCategory(e.target.value as DefectCategory)}
                        className="w-full text-xs p-2.5 rounded-xl border border-amber-300 bg-amber-50/30 text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500 font-bold"
                      >
                        {DEFECT_CATEGORIES.map((cat) => (
                          <option key={cat} value={cat}>
                            {cat}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Concerned Department <span className="text-red-500">*</span>
                      </label>
                      <select
                        value={reworkDept}
                        onChange={(e) => setReworkDept(e.target.value)}
                        className="w-full text-xs p-2.5 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-amber-500 font-semibold"
                      >
                        {INITIAL_DEPARTMENTS.map((d) => (
                          <option key={d.code} value={d.name}>
                            {d.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Rework Specific Issue / Finding
                      </label>
                      <input
                        type="text"
                        value={reworkFinding}
                        onChange={(e) => setReworkFinding(e.target.value)}
                        placeholder="e.g. Minor scratches or flatness variation observed"
                        className="w-full text-xs p-2.5 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-amber-500 font-semibold"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Expected Review / Correction Date
                      </label>
                      <input
                        type="date"
                        value={reworkReviewDate}
                        onChange={(e) => setReworkReviewDate(e.target.value)}
                        className="w-full text-xs p-2.5 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-amber-500 font-semibold"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Corrective Action Required
                    </label>
                    <input
                      type="text"
                      value={reworkActionReq}
                      onChange={(e) => setReworkActionReq(e.target.value)}
                      placeholder="e.g. Buff out surface scratches and re-submit to Quality"
                      className="w-full text-xs p-2.5 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Rework Remarks / Special Instructions
                    </label>
                    <textarea
                      rows={2}
                      value={reworkRemarks}
                      onChange={(e) => setReworkRemarks(e.target.value)}
                      placeholder="Detailed instructions for the department operator..."
                      className="w-full text-xs p-2.5 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                  </div>
                </div>
              )}

              {/* REJECT SECTION */}
              {selectedAction === 'Reject' && (
                <div className="space-y-4 animate-in fade-in">
                  <div className="p-3.5 bg-rose-50/70 border border-rose-200 rounded-xl text-xs text-rose-900 space-y-1">
                    <p className="font-bold flex items-center gap-1.5 text-rose-800">
                      <AlertTriangle className="w-4 h-4 text-rose-600" />
                      <span>Quality Rejection &amp; Corrective Action Alert</span>
                    </p>
                    <p className="text-[11px] text-rose-700">
                      Logs a formal non-conformance report. Machine status is flagged as REJECTED and a rework alert is dispatched to the concerned department.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* Defect Category Dropdown (Mandatory 15 options) */}
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Defect Category <span className="text-red-500">*</span>
                      </label>
                      <select
                        required
                        value={rejectDefectCategory}
                        onChange={(e) => setRejectDefectCategory(e.target.value as DefectCategory)}
                        className="w-full text-xs p-2.5 rounded-xl border border-rose-300 bg-rose-50/30 text-slate-900 focus:outline-none focus:ring-2 focus:ring-rose-500 font-bold"
                      >
                        {DEFECT_CATEGORIES.map((cat) => (
                          <option key={cat} value={cat}>
                            {cat}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Concerned Department <span className="text-red-500">*</span>
                      </label>
                      <select
                        value={rejectDept}
                        onChange={(e) => setRejectDept(e.target.value)}
                        className="w-full text-xs p-2.5 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-rose-500 font-semibold"
                      >
                        {INITIAL_DEPARTMENTS.map((d) => (
                          <option key={d.code} value={d.name}>
                            {d.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Observed Finding / Actual Measured Value <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={rejectFinding}
                      onChange={(e) => setRejectFinding(e.target.value)}
                      placeholder="e.g. Base flatness measured 0.018mm (out of tolerance)"
                      className="w-full text-xs p-2.5 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-rose-500 font-semibold"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Specification / Tolerance Requirement
                      </label>
                      <input
                        type="text"
                        value={rejectSpec}
                        onChange={(e) => setRejectSpec(e.target.value)}
                        placeholder="e.g. Flatness max 0.005mm per DWG-685-B1"
                        className="w-full text-xs p-2.5 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-rose-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Corrective Action Required
                      </label>
                      <input
                        type="text"
                        value={rejectActionReq}
                        onChange={(e) => setRejectActionReq(e.target.value)}
                        placeholder="e.g. Return to lapping, re-lap flatness, re-inspect"
                        className="w-full text-xs p-2.5 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-rose-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Additional Remarks / Inspector Notes
                    </label>
                    <textarea
                      rows={2}
                      value={rejectRemarks}
                      onChange={(e) => setRejectRemarks(e.target.value)}
                      placeholder="Additional details for shop floor operator..."
                      className="w-full text-xs p-2.5 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-rose-500"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-800 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl transition"
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={submitting || (selectedAction === 'Accept' && !acceptConfirmed)}
                className={`px-5 py-2 text-xs font-bold rounded-xl flex items-center gap-2 shadow-sm transition disabled:opacity-50 ${
                  selectedAction === 'Accept'
                    ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/20'
                    : selectedAction === 'Rework'
                    ? 'bg-amber-600 hover:bg-amber-500 text-white shadow-amber-600/20'
                    : 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-600/20'
                }`}
              >
                {submitting ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Recording Decision...</span>
                  </>
                ) : (
                  <>
                    {selectedAction === 'Accept' && <Check className="w-4 h-4" />}
                    {selectedAction === 'Rework' && <Wrench className="w-4 h-4" />}
                    {selectedAction === 'Reject' && <AlertTriangle className="w-4 h-4" />}
                    <span>
                      {selectedAction === 'Accept'
                        ? 'ACCEPT MACHINE (PASS QC)'
                        : selectedAction === 'Rework'
                        ? 'SEND FOR REWORK (REWORK REQUIRED)'
                        : 'REJECT MACHINE (REQUIRE REWORK)'}
                    </span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

