import React, { useState } from 'react';
import {
  X,
  Send,
  PenTool,
  AlertCircle,
  FileText,
  Calendar,
  CheckCircle2,
  Cpu,
  Building,
  UploadCloud,
} from 'lucide-react';
import { Machine, UserProfile } from '../types';
import { createDesignRequest } from '../services/designService';

interface RequestDesignSupportModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentDepartment: string;
  userProfile?: UserProfile | null;
  machines?: Machine[];
  initialMachineNumber?: string;
  onSuccess?: () => void;
}

export const RequestDesignSupportModal: React.FC<RequestDesignSupportModalProps> = ({
  isOpen,
  onClose,
  currentDepartment,
  userProfile,
  machines = [],
  initialMachineNumber = '',
  onSuccess,
}) => {
  const [requestTitle, setRequestTitle] = useState('');
  const [requestDescription, setRequestDescription] = useState('');
  const [targetDesignDept, setTargetDesignDept] = useState('01 Design');
  const [machineNumber, setMachineNumber] = useState(initialMachineNumber);
  const [specification, setSpecification] = useState('');
  const [requiredDrawingDoc, setRequiredDrawingDoc] = useState('');
  const [priority, setPriority] = useState<'Low' | 'Medium' | 'High' | 'Urgent'>('Medium');
  const [requiredByDate, setRequiredByDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 3);
    return d.toISOString().split('T')[0];
  });
  const [attachmentName, setAttachmentName] = useState('');
  const [attachmentUrl, setAttachmentUrl] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleMachineChange = (mNum: string) => {
    setMachineNumber(mNum);
    const found = machines.find((m) => m.machineNumber === mNum);
    if (found) {
      setSpecification(found.model || found.size || '');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!requestTitle.trim()) {
      setErrorMsg('Please enter a request title.');
      return;
    }
    if (!requestDescription.trim()) {
      setErrorMsg('Please enter a detailed description of the design support required.');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      const requesterName = userProfile?.displayName || 'Department Engineer';

      await createDesignRequest(
        {
          requestTitle: requestTitle.trim(),
          requestDescription: requestDescription.trim(),
          requestingDepartment: currentDepartment,
          requestedBy: requesterName,
          requestedByEmail: userProfile?.email || undefined,
          targetDesignDepartment: targetDesignDept,
          machineNumber: machineNumber.trim() || undefined,
          specification: specification.trim() || undefined,
          requiredDrawingDoc: requiredDrawingDoc.trim() || undefined,
          priority,
          requiredByDate,
          attachmentName: attachmentName.trim() || undefined,
          attachmentUrl: attachmentUrl.trim() || undefined,
        },
        userProfile?.email
      );

      setSuccessMsg('Design Support Request submitted successfully! Design department has been notified.');
      setTimeout(() => {
        onSuccess?.();
        onClose();
      }, 1500);
    } catch (err: any) {
      console.error('Failed to submit design request:', err);
      setErrorMsg(err.message || 'Failed to submit design request. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fadeIn">
      <div className="bg-white rounded-2xl max-w-xl w-full border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 sm:p-5 bg-gradient-to-r from-slate-900 to-indigo-950 text-white flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-indigo-300">
              <PenTool className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-black text-base sm:text-lg tracking-tight">Request Design Support</h3>
              <p className="text-xs text-indigo-200/80">
                Send engineering or drawing request to Design &bull; Machine remains in {currentDepartment}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-white/10 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto custom-scrollbar flex-1 text-xs">
          {errorMsg && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl flex items-center space-x-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Department Information Badge */}
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between">
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Requesting Division</span>
              <span className="font-bold text-slate-900 text-xs flex items-center gap-1.5 mt-0.5">
                <Building className="w-3.5 h-3.5 text-indigo-600" />
                {currentDepartment}
              </span>
            </div>
            <div className="text-right">
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Requested By</span>
              <span className="font-semibold text-slate-700 text-xs">
                {userProfile?.displayName || 'Department Team'}
              </span>
            </div>
          </div>

          {/* Target Design Department */}
          <div>
            <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
              Target Design Department <span className="text-red-500">*</span>
            </label>
            <select
              value={targetDesignDept}
              onChange={(e) => setTargetDesignDept(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 font-semibold text-xs outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="01 Design">01 Design (CAD, Engineering &amp; Drawings)</option>
            </select>
          </div>

          {/* Title */}
          <div>
            <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
              Request Title <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Drawing Clarification for Y-Axis Motor Mount, Bracket 3D Model"
              value={requestTitle}
              onChange={(e) => setRequestTitle(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 font-semibold text-xs outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* Machine Reference (Optional) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                Machine Number (Optional)
              </label>
              <div className="relative">
                <input
                  type="text"
                  list="dept-machines-list"
                  placeholder="e.g. 8156 or select..."
                  value={machineNumber}
                  onChange={(e) => handleMachineChange(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 font-mono font-semibold text-xs outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <datalist id="dept-machines-list">
                  {machines.map((m) => (
                    <option key={m.id} value={m.machineNumber}>
                      {m.machineNumber} - {m.model || m.size || 'CMM'}
                    </option>
                  ))}
                </datalist>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                Specification / Model
              </label>
              <input
                type="text"
                placeholder="e.g. CMM Bridge 10.12.08"
                value={specification}
                onChange={(e) => setSpecification(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 font-semibold text-xs outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          {/* Priority & Required By Date */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                Priority
              </label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as any)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 font-semibold text-xs outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="Low">Low (General Inquiry)</option>
                <option value="Medium">Medium (Normal Working Schedule)</option>
                <option value="High">High (Needed within 24-48 hours)</option>
                <option value="Urgent">Urgent (Line / Shop Floor Stopping)</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                Required By Date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                required
                value={requiredByDate}
                onChange={(e) => setRequiredByDate(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 font-semibold text-xs outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          {/* Required Drawing / Document */}
          <div>
            <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
              Required Drawing / Document
            </label>
            <input
              type="text"
              placeholder="e.g. DWG-8156-A-01, 3D Step file, Wiring diagram, BOM rev 2"
              value={requiredDrawingDoc}
              onChange={(e) => setRequiredDrawingDoc(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 font-semibold text-xs outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
              Detailed Description <span className="text-red-500">*</span>
            </label>
            <textarea
              required
              rows={3}
              placeholder="Describe the exact issue, dimensions, revision needed, or reason for support..."
              value={requestDescription}
              onChange={(e) => setRequestDescription(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-slate-800 font-medium text-xs outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
            />
          </div>

          {/* Attachment Reference */}
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
            <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block">
              Reference Document / Drawing Note (Optional)
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input
                type="text"
                placeholder="Attachment file name / Drawing ID"
                value={attachmentName}
                onChange={(e) => setAttachmentName(e.target.value)}
                className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800"
              />
              <input
                type="text"
                placeholder="File link or URL (optional)"
                value={attachmentUrl}
                onChange={(e) => setAttachmentUrl(e.target.value)}
                className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800"
              />
            </div>
          </div>

          {/* Footer Buttons */}
          <div className="pt-3 border-t border-slate-100 flex items-center justify-end space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs transition flex items-center space-x-1.5 shadow-md shadow-indigo-200 disabled:opacity-50"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{isSubmitting ? 'Submitting...' : 'Send Request to Design'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
