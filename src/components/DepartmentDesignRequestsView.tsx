import React, { useState, useEffect } from 'react';
import {
  PenTool,
  Plus,
  Clock,
  CheckCircle2,
  AlertCircle,
  FileText,
  MessageSquare,
  Search,
  Send,
  HelpCircle,
  ExternalLink,
} from 'lucide-react';
import { DesignRequest, Machine, UserProfile } from '../types';
import {
  subscribeDesignRequests,
  provideInfoForDesignRequest,
} from '../services/designService';
import { RequestDesignSupportModal } from './RequestDesignSupportModal';

interface DepartmentDesignRequestsViewProps {
  departmentName: string;
  userProfile?: UserProfile | null;
  machines?: Machine[];
}

export const DepartmentDesignRequestsView: React.FC<DepartmentDesignRequestsViewProps> = ({
  departmentName,
  userProfile,
  machines = [],
}) => {
  const [requests, setRequests] = useState<DesignRequest[]>([]);
  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [replyModalRequest, setReplyModalRequest] = useState<DesignRequest | null>(null);
  const [clarificationResponse, setClarificationResponse] = useState('');
  const [isSubmittingClarification, setIsSubmittingClarification] = useState(false);

  useEffect(() => {
    const unsub = subscribeDesignRequests(
      (reqs) => {
        setRequests(reqs);
      },
      { requestingDept: departmentName }
    );
    return () => unsub();
  }, [departmentName]);

  const filteredRequests = requests.filter((r) => {
    if (statusFilter !== 'All' && r.status !== statusFilter) return false;
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      const matchesTitle = r.requestTitle.toLowerCase().includes(term);
      const matchesNumber = r.requestNumber.toLowerCase().includes(term);
      const matchesDesc = r.requestDescription?.toLowerCase().includes(term);
      const matchesMachine = r.machineNumber?.toLowerCase().includes(term);
      if (!matchesTitle && !matchesNumber && !matchesDesc && !matchesMachine) return false;
    }
    return true;
  });

  const handleSendClarification = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyModalRequest || !clarificationResponse.trim()) return;

    setIsSubmittingClarification(true);
    try {
      const userName = userProfile?.displayName || 'Department Engineer';
      await provideInfoForDesignRequest(
        replyModalRequest,
        clarificationResponse.trim(),
        userName,
        userProfile?.email
      );
      setReplyModalRequest(null);
      setClarificationResponse('');
    } catch (err) {
      console.error('Failed to provide clarification:', err);
    } finally {
      setIsSubmittingClarification(false);
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn pb-12">
      {/* Header Banner */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
            <div className="w-11 h-11 rounded-2xl bg-indigo-50 border border-indigo-200 text-indigo-700 flex items-center justify-center">
              <PenTool className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h1 className="text-base sm:text-lg font-black text-slate-900 tracking-tight">
                  DESIGN SUPPORT REQUESTS
                </h1>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                  {departmentName}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Submit drawing clarifications, engineering changes, or 3D requests to Design &bull; Machine remains in {departmentName}
              </p>
            </div>
          </div>

          <button
            onClick={() => setIsRequestModalOpen(true)}
            className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition flex items-center space-x-1.5 shadow-md shadow-indigo-200"
          >
            <Plus className="w-4 h-4" />
            <span>REQUEST DESIGN SUPPORT</span>
          </button>
        </div>

        {/* Filter Bar */}
        <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-slate-100 text-xs">
          <div className="flex-1 min-w-[200px] relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              placeholder="Search by request ID, title, machine number..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-8 pr-3 py-2 text-slate-800 outline-none"
            />
          </div>

          <div className="w-40">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 font-semibold outline-none"
            >
              <option value="All">All Statuses</option>
              <option value="New">New</option>
              <option value="Accepted">Accepted</option>
              <option value="In Progress">In Progress</option>
              <option value="Waiting for Information">Waiting for Info</option>
              <option value="Completed">Completed</option>
            </select>
          </div>
        </div>
      </div>

      {/* Requests List */}
      <div className="space-y-3">
        {filteredRequests.length === 0 ? (
          <div className="bg-white p-12 rounded-2xl border border-slate-200 text-center text-xs text-slate-400 space-y-2">
            <PenTool className="w-8 h-8 text-slate-300 mx-auto" />
            <p>No design support requests submitted yet by {departmentName}.</p>
            <p className="text-[11px] text-slate-400">
              Need drawing clarifications or CAD assistance? Click <strong>REQUEST DESIGN SUPPORT</strong> above.
            </p>
          </div>
        ) : (
          filteredRequests.map((req) => (
            <div
              key={req.id}
              className={`bg-white rounded-2xl p-5 border transition space-y-3 shadow-xs ${
                req.status === 'Completed'
                  ? 'border-emerald-200 bg-emerald-50/20'
                  : req.status === 'Waiting for Information'
                  ? 'border-amber-300 ring-1 ring-amber-100'
                  : 'border-slate-200 hover:border-indigo-300'
              }`}
            >
              {/* Top Row */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="space-y-1">
                  <div className="flex items-center space-x-2">
                    <span className="font-mono text-xs font-black text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded">
                      {req.requestNumber}
                    </span>
                    <span
                      className={`text-[10px] font-black px-2 py-0.5 rounded uppercase ${
                        req.priority === 'Urgent'
                          ? 'bg-red-100 text-red-800'
                          : req.priority === 'High'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {req.priority} Priority
                    </span>
                    <span
                      className={`text-[10px] font-black px-2 py-0.5 rounded uppercase ${
                        req.status === 'Completed'
                          ? 'bg-emerald-100 text-emerald-800'
                          : req.status === 'Waiting for Information'
                          ? 'bg-amber-100 text-amber-800'
                          : req.status === 'Accepted'
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {req.status}
                    </span>
                  </div>

                  <h3 className="font-black text-sm text-slate-900 flex items-center space-x-2">
                    <span>{req.requestTitle}</span>
                    {req.machineNumber && (
                      <span className="font-mono text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">
                        Machine {req.machineNumber}
                      </span>
                    )}
                  </h3>
                  <p className="text-xs text-slate-600">{req.requestDescription}</p>
                </div>

                <div className="text-right text-xs space-y-0.5">
                  <div className="text-slate-500">Required By: <strong>{req.requiredByDate}</strong></div>
                  <div className="text-slate-700">
                    Designer: <strong>{req.assignedDesigner || 'Awaiting Assignment'}</strong>
                  </div>
                </div>
              </div>

              {/* Waiting for Information Warning & Action */}
              {req.status === 'Waiting for Information' && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs space-y-2">
                  <div className="flex items-start space-x-2 text-amber-900 font-medium">
                    <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <strong className="block font-bold">Design requested clarification:</strong>
                      <span>{req.infoRequiredNote}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => setReplyModalRequest(req)}
                    className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-bold text-xs transition flex items-center space-x-1.5 shadow-2xs"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Provide Clarification to Design</span>
                  </button>
                </div>
              )}

              {/* Design Completion Solution & Document */}
              {req.status === 'Completed' && (
                <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs space-y-2">
                  <div className="flex items-center space-x-2 text-emerald-800 font-bold">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>Design Resolution ({req.completedDate || 'Completed'})</span>
                  </div>
                  {req.solutionProvided && (
                    <p className="text-emerald-950 font-medium">{req.solutionProvided}</p>
                  )}
                  {req.completionRemarks && (
                    <p className="text-slate-600 text-[11px]">Remarks: {req.completionRemarks}</p>
                  )}
                  {req.responseDocumentName && (
                    <div className="inline-flex items-center space-x-2 px-3 py-1.5 bg-white border border-emerald-300 rounded-lg text-emerald-900 font-bold">
                      <FileText className="w-4 h-4 text-emerald-600" />
                      <span>{req.responseDocumentName}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Footer Audit */}
              <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
                <span>Requested by {req.requestedBy} on {req.createdAt?.split('T')[0]}</span>
                <span>Target: {req.targetDesignDepartment || '01 Design'}</span>
              </div>
            </div>
          ))
        )}
      </div>

      {/* New Request Modal */}
      {isRequestModalOpen && (
        <RequestDesignSupportModal
          isOpen={isRequestModalOpen}
          onClose={() => setIsRequestModalOpen(false)}
          currentDepartment={departmentName}
          userProfile={userProfile}
          machines={machines}
        />
      )}

      {/* Provide Clarification Modal */}
      {replyModalRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full border border-slate-200 shadow-2xl p-5 space-y-4 text-xs">
            <h3 className="font-black text-sm text-slate-900">
              Provide Clarification for {replyModalRequest.requestNumber}
            </h3>
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-slate-700">
              <span className="font-bold text-[10px] text-slate-400 block uppercase">Question from Design:</span>
              <p className="mt-0.5">{replyModalRequest.infoRequiredNote}</p>
            </div>

            <form onSubmit={handleSendClarification} className="space-y-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">Your Clarification</label>
                <textarea
                  required
                  rows={3}
                  placeholder="Provide dimensions, approval, or specific guidance..."
                  value={clarificationResponse}
                  onChange={(e) => setClarificationResponse(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-slate-800 resize-none outline-none"
                />
              </div>

              <div className="pt-2 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setReplyModalRequest(null)}
                  className="px-3.5 py-1.5 bg-slate-100 rounded-xl font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingClarification}
                  className="px-4 py-1.5 bg-indigo-600 text-white rounded-xl font-bold shadow-xs disabled:opacity-50"
                >
                  {isSubmittingClarification ? 'Submitting...' : 'Send Clarification'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
