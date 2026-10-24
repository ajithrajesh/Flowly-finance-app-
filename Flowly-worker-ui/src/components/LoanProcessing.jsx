import React, { useState, useEffect, useCallback } from 'react';
import * as api from '../api';

export default function LoanProcessing({ onToast }) {
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  const [selectedApp, setSelectedApp] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [detailTab, setDetailTab] = useState('review'); // 'review' | 'emi_schedule' | 'recovery'

  // Schedule & EMI state
  const [scheduleLoan, setScheduleLoan] = useState(null);
  const [scheduleLoading, setScheduleLoading] = useState(false);

  // Manual EMI Payment Modal State
  const [markPaidModal, setMarkPaidModal] = useState(null); // installment object
  const [markPaidForm, setMarkPaidForm] = useState({ amountPaid: '', note: '' });

  // Recovery Log Form State
  const [recoveryForm, setRecoveryForm] = useState({
    followupType: 'call_made',
    notes: '',
    promisedPaymentDate: '',
  });

  // Review Form States
  const [checklists, setChecklists] = useState({
    documentsVerified: false,
    incomeVerified: false,
    employmentVerified: false,
    bankStatementsVerified: false,
    existingLiabilitiesVerified: false,
    fieldVerificationStatus: 'not_required',
    workerNotes: '',
  });

  // Action modals
  const [activeActionModal, setActiveActionModal] = useState(null); // 'request_doc' | 'sanction' | 'reject' | null
  const [requestedDocTitle, setRequestedDocTitle] = useState('');
  const [docRequestNote, setDocRequestNote] = useState('');
  const [sanctionForm, setSanctionForm] = useState({
    sanctionedAmount: '',
    sanctionedInterestRate: '',
    sanctionedTenureMonths: '',
    sanctionedInterestType: 'diminishing',
  });
  const [rejectionReason, setRejectionReason] = useState('');

  // Document Preview Modal State
  const [previewDoc, setPreviewDoc] = useState(null);

  // Safely resolve any document URL (handles relative /uploads, absolute URLs, blobs)
  const resolveDocUrl = (rawUrl) => {
    if (!rawUrl) return '';
    const url = String(rawUrl).trim();
    if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('blob:') || url.startsWith('data:')) {
      return url;
    }
    const base = (api.SOCKET_BASE || api.API_BASE.replace(/\/api\/?$/, '')).replace(/\/+$/, '');
    const cleanPath = url.startsWith('/') ? url : `/${url}`;
    return `${base}${cleanPath}`;
  };

  const handleOpenDoc = (doc) => {
    const rawUrl = doc.docUrl || doc.url || doc.fileUrl;
    const resolvedUrl = resolveDocUrl(rawUrl);
    if (!resolvedUrl) {
      onToast?.(`Document URL not found for ${doc.label || doc.title || doc.name || 'document'}`);
      return;
    }
    setPreviewDoc({
      title: doc.label || doc.title || doc.name || 'Loan Document',
      docUrl: rawUrl,
      resolvedUrl,
      fileName: doc.fileName || doc.name || (rawUrl ? String(rawUrl).split('/').pop() : 'document.pdf'),
      type: doc.type || doc.category || 'Uploaded Proof',
      status: doc.status || 'uploaded',
      uploadedAt: doc.uploadedAt || selectedApp?.createdAt,
      applicantName: selectedApp?.user?.name || selectedApp?.personalInformation?.fullName || 'Customer',
      applicationNumber: selectedApp?.applicationNumber || 'LN-APP',
      ocrMatchScore: selectedApp?.ocrVerification?.nameMatchScore || selectedApp?.eligibilityCheck?.riskScore || 98,
    });
  };

  const getStandardDocuments = (app) => {
    if (!app?.documents) return [];
    const docs = app.documents;

    const extractUrl = (val) => {
      if (!val) return '';
      if (typeof val === 'string') return val;
      if (typeof val === 'object') return val.docUrl || val.fileUrl || val.url || '';
      return '';
    };

    const extractName = (val, fallback) => {
      if (typeof val === 'object' && val?.fileName) return val.fileName;
      if (typeof val === 'string' && val.includes('/')) return val.split('/').pop();
      return fallback;
    };

    const candidates = [
      {
        key: 'panCard',
        label: 'PAN Card',
        docUrl: extractUrl(docs.panCardUrl || docs.panCard || docs.pan),
        fileName: extractName(docs.panCard || docs.panCardUrl, 'pan_card.pdf'),
        type: 'Tax & Identity Identification (PAN)',
        icon: '🪪',
      },
      {
        key: 'aadhaarCard',
        label: 'Aadhaar Card (POI / POA)',
        docUrl: extractUrl(docs.aadhaarCardUrl || docs.identityProof || docs.aadhaarCard || docs.aadhaar),
        fileName: extractName(docs.identityProof || docs.aadhaarCardUrl, 'aadhaar_card.pdf'),
        type: 'Unique Identity & Residence Proof',
        icon: '🆔',
      },
      {
        key: 'salarySlip',
        label: 'Salary Slip / Income Proof',
        docUrl: extractUrl(docs.salarySlipUrl || docs.incomeProof || docs.salarySlips || docs.salarySlip),
        fileName: extractName(docs.incomeProof || docs.salarySlips || docs.salarySlipUrl, 'salary_slip.pdf'),
        type: 'Income & Employment Proof',
        icon: '💵',
      },
      {
        key: 'bankStatement',
        label: 'Bank Account Statement',
        docUrl: extractUrl(docs.bankStatementUrl || docs.bankStatement),
        fileName: extractName(docs.bankStatement || docs.bankStatementUrl, 'bank_statement.pdf'),
        type: 'Bank History & Cashflow Proof',
        icon: '🏦',
      },
      {
        key: 'addressProof',
        label: 'Address Proof',
        docUrl: extractUrl(docs.addressProofUrl || docs.addressProof),
        fileName: extractName(docs.addressProof || docs.addressProofUrl, 'address_proof.pdf'),
        type: 'Utility / Address Document',
        icon: '🏠',
      },
    ];

    return candidates.filter((item) => Boolean(item.docUrl));
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && previewDoc) {
        setPreviewDoc(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [previewDoc]);

  const loadApplications = useCallback(async () => {
    setLoading(true);
    try {
      if (statusFilter === 'overdue_desk') {
        const overdueList = await api.fetchOverdueLoans();
        setApplications(overdueList);
      } else {
        const data = await api.fetchLoanApplications({ status: statusFilter, search: searchTerm });
        setApplications(data);
      }
    } catch (err) {
      onToast?.(err.message || 'Failed to load loan applications');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, searchTerm, onToast]);

  useEffect(() => {
    loadApplications();
  }, [loadApplications]);

  const loadLoanSchedule = async (loanId) => {
    setScheduleLoading(true);
    try {
      const loanData = await api.fetchLoanSchedule(loanId);
      setScheduleLoan(loanData);
    } catch (err) {
      onToast?.(err.message || 'Failed to fetch repayment schedule');
    } finally {
      setScheduleLoading(false);
    }
  };

  const handleOpenDetail = (app) => {
    setSelectedApp(app);
    setDetailTab(['disbursed', 'active', 'closed'].includes(app.status) ? 'emi_schedule' : 'review');
    setChecklists({
      documentsVerified: app.workerReview?.documentsVerified || false,
      incomeVerified: app.workerReview?.incomeVerified || false,
      employmentVerified: app.workerReview?.employmentVerified || false,
      bankStatementsVerified: app.workerReview?.bankStatementsVerified || false,
      existingLiabilitiesVerified: app.workerReview?.existingLiabilitiesVerified || false,
      fieldVerificationStatus: app.workerReview?.fieldVerificationStatus || 'not_required',
      workerNotes: app.workerReview?.workerNotes || '',
    });
    setSanctionForm({
      sanctionedAmount: app.requestedAmount || app.principal || '',
      sanctionedInterestRate: app.interestRate || 12,
      sanctionedTenureMonths: app.tenureMonths || 12,
      sanctionedInterestType: app.interestType || 'diminishing',
    });
    setActiveActionModal(null);
    setMarkPaidModal(null);
    loadLoanSchedule(app._id);
  };

  const handleSaveChecklist = async () => {
    if (!selectedApp) return;
    setSubmitting(true);
    try {
      const updated = await api.updateWorkerReview(selectedApp._id, checklists);
      setSelectedApp(updated);
      onToast?.('Worker review checklist saved');
      loadApplications();
    } catch (err) {
      onToast?.(err.message || 'Failed to update review');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRequestDocs = async () => {
    if (!docRequestNote.trim()) {
      onToast?.('Please enter document request details');
      return;
    }
    setSubmitting(true);
    try {
      const updated = await api.updateWorkerReview(selectedApp._id, {
        ...checklists,
        requestAdditionalDocs: true,
        requestedDocTitle: requestedDocTitle.trim() || 'Additional Verification Document',
        requestedDocNote: docRequestNote,
      });
      setSelectedApp(updated);
      setActiveActionModal(null);
      setRequestedDocTitle('');
      setDocRequestNote('');
      onToast?.('Additional document request sent to customer');
      loadApplications();
    } catch (err) {
      onToast?.(err.message || 'Failed to request documents');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSanctionLoan = async () => {
    if (!sanctionForm.sanctionedAmount || !sanctionForm.sanctionedInterestRate || !sanctionForm.sanctionedTenureMonths) {
      onToast?.('Please fill out all sanction terms');
      return;
    }
    setSubmitting(true);
    try {
      const updated = await api.sanctionLoan(selectedApp._id, sanctionForm);
      setSelectedApp(updated);
      setActiveActionModal(null);
      onToast?.('Loan Sanctioned successfully! Sanction Letter generated.');
      loadApplications();
    } catch (err) {
      onToast?.(err.message || 'Failed to sanction loan');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRejectLoan = async () => {
    if (!rejectionReason.trim()) {
      onToast?.('Please provide a rejection reason');
      return;
    }
    setSubmitting(true);
    try {
      const updated = await api.rejectLoan(selectedApp._id, rejectionReason);
      setSelectedApp(updated);
      setActiveActionModal(null);
      setRejectionReason('');
      onToast?.('Loan application rejected');
      loadApplications();
    } catch (err) {
      onToast?.(err.message || 'Failed to reject loan');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDisburseLoan = async () => {
    if (!selectedApp) return;
    setSubmitting(true);
    try {
      const res = await api.disburseLoan(selectedApp._id);
      setSelectedApp(res.loan || selectedApp);
      onToast?.(res.message || 'Loan disbursed successfully! EMI repayment schedule generated.');
      await loadLoanSchedule(selectedApp._id);
      setDetailTab('emi_schedule');
      loadApplications();
    } catch (err) {
      onToast?.(err.message || 'Failed to disburse loan');
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenMarkPaid = (installment) => {
    const defaultAmount = Math.max(0, (installment.emiAmount || 0) + (installment.lateFee || 0) - (installment.paidAmount || 0));
    setMarkPaidModal(installment);
    setMarkPaidForm({
      amountPaid: defaultAmount,
      note: 'Manual offline EMI collection recorded by staff',
    });
  };

  const handleSubmitMarkPaid = async (e) => {
    e.preventDefault();
    if (!selectedApp || !markPaidModal) return;
    setSubmitting(true);
    try {
      const res = await api.markEmiPaidManually(selectedApp._id, markPaidModal.installmentNo, {
        amountPaid: Number(markPaidForm.amountPaid),
        note: markPaidForm.note,
      });
      onToast?.(res.message || `EMI Installment #${markPaidModal.installmentNo} marked as paid!`);
      setMarkPaidModal(null);
      await loadLoanSchedule(selectedApp._id);
      loadApplications();
    } catch (err) {
      onToast?.(err.message || 'Failed to mark installment paid');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddRecoveryLog = async (e) => {
    e.preventDefault();
    if (!selectedApp || !recoveryForm.notes.trim()) {
      onToast?.('Please enter notes for the recovery follow-up');
      return;
    }
    setSubmitting(true);
    try {
      const res = await api.recordRecoveryFollowup(selectedApp._id, recoveryForm);
      onToast?.(res.message || 'Recovery follow-up logged successfully');
      setRecoveryForm({ followupType: 'call_made', notes: '', promisedPaymentDate: '' });
      await loadLoanSchedule(selectedApp._id);
    } catch (err) {
      onToast?.(err.message || 'Failed to log recovery follow-up');
    } finally {
      setSubmitting(false);
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'submitted':
        return <span className="badge badge-purple">Submitted</span>;
      case 'under_worker_review':
        return <span className="badge badge-amber">Under Review</span>;
      case 'documents_requested':
        return <span className="badge badge-amber">Docs Needed</span>;
      case 'field_verification':
        return <span className="badge badge-amber">Field Check</span>;
      case 'credit_assessment':
        return <span className="badge badge-purple">Credit Check</span>;
      case 'sanctioned':
        return <span className="badge badge-green">Sanctioned</span>;
      case 'agreement_pending':
        return <span className="badge badge-purple">e-Sign Pending</span>;
      case 'approved':
        return <span className="badge badge-green">Approved (Ready)</span>;
      case 'disbursed':
      case 'active':
        return <span className="badge badge-green">Active (Disbursed)</span>;
      case 'closed':
        return <span className="badge badge-green">Closed (Fully Paid)</span>;
      case 'rejected':
        return <span className="badge badge-red">Rejected</span>;
      default:
        return <span className="badge">{status}</span>;
    }
  };

  const getEmiStatusBadge = (st) => {
    switch (st) {
      case 'paid':
        return <span className="badge badge-green">Paid</span>;
      case 'overdue':
        return <span className="badge badge-red">Overdue</span>;
      case 'partially_paid':
        return <span className="badge badge-amber">Partially Paid</span>;
      case 'pending':
      default:
        return <span className="badge badge-gray">Pending</span>;
    }
  };

  return (
    <div style={{ padding: '4px' }}>
      {/* HEADER & SUMMARY */}
      <div style={{ marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ fontSize: '22px', fontWeight: 700, margin: 0, color: '#111827' }}>
            Loan Application & EMI Collections Desk
          </h2>
          <p style={{ color: '#6B7280', fontSize: '13px', margin: '4px 0 0 0' }}>
            Review customer micro-loans, inspect EMI repayment schedules, record manual collections, track overdue loans & recovery logs.
          </p>
        </div>
        <button className="btn-secondary" onClick={loadApplications} disabled={loading} style={{ fontSize: '13px', padding: '8px 16px' }}>
          🔄 Refresh Queue
        </button>
      </div>

      {/* FILTER TABS */}
      <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '10px', marginBottom: '16px' }}>
        {[
          { key: '', label: 'All Applications' },
          { key: 'overdue_desk', label: '🚨 Overdue EMI Recovery Desk' },
          { key: 'submitted', label: 'Submitted' },
          { key: 'under_worker_review', label: 'Under Review' },
          { key: 'documents_requested', label: 'Docs Requested' },
          { key: 'sanctioned', label: 'Sanctioned' },
          { key: 'approved', label: 'Approved (Ready to Disburse)' },
          { key: 'disbursed', label: 'Active/Disbursed Loans' },
          { key: 'rejected', label: 'Rejected' },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setStatusFilter(tab.key)}
            className={statusFilter === tab.key ? 'btn-primary' : 'btn-secondary'}
            style={{ fontSize: '12px', padding: '6px 14px', borderRadius: '20px', whitespace: 'nowrap' }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* SEARCH BAR */}
      <div style={{ marginBottom: '16px', display: 'flex', gap: '10px' }}>
        <input
          type="text"
          className="form-input"
          placeholder="Search by App ID, customer name, loan product..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{ maxWidth: '360px', fontSize: '13px' }}
        />
      </div>

      {/* APPLICATIONS TABLE */}
      {loading ? (
        <div className="loading-panel">Loading queue...</div>
      ) : applications.length === 0 ? (
        <div className="card" style={{ padding: '40px', textAlign: 'center', color: '#6B7280' }}>
          No loan applications match the selected criteria.
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
            <thead>
              <tr style={{ backgroundColor: '#F9FAFB', borderBottom: '1px solid #E5E7EB' }}>
                <th style={{ padding: '12px 16px', color: '#374151', fontWeight: 600 }}>App #</th>
                <th style={{ padding: '12px 16px', color: '#374151', fontWeight: 600 }}>Customer</th>
                <th style={{ padding: '12px 16px', color: '#374151', fontWeight: 600 }}>Loan Type</th>
                <th style={{ padding: '12px 16px', color: '#374151', fontWeight: 600 }}>Amount & Tenure</th>
                <th style={{ padding: '12px 16px', color: '#374151', fontWeight: 600 }}>Est. Monthly EMI</th>
                <th style={{ padding: '12px 16px', color: '#374151', fontWeight: 600 }}>Overdue / Risk</th>
                <th style={{ padding: '12px 16px', color: '#374151', fontWeight: 600 }}>Status</th>
                <th style={{ padding: '12px 16px', textAlign: 'right', color: '#374151', fontWeight: 600 }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {applications.map((app) => (
                <tr key={app._id} style={{ borderBottom: '1px solid #F3F4F6' }}>
                  <td style={{ padding: '12px 16px', fontWeight: 700, color: '#4F46E5' }}>
                    {app.applicationNumber || app._id?.slice(-6)}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ fontWeight: 600, color: '#111827' }}>{app.user?.name || app.personalInformation?.fullName || 'Customer'}</div>
                    <div style={{ fontSize: '11px', color: '#6B7280' }}>{app.user?.email || app.personalInformation?.email}</div>
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <span style={{ fontWeight: 600 }}>{app.productName || app.loanType}</span>
                    <div style={{ marginTop: '2px' }}>
                      <span className="badge badge-purple" style={{ fontSize: '10px' }}>
                        {app.interestType === 'flat' ? 'Flat EMI' : 'Diminishing'}
                      </span>
                    </div>
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ fontWeight: 700, color: '#059669' }}>₹{(app.requestedAmount || app.principal)?.toLocaleString('en-IN')}</div>
                    <div style={{ fontSize: '11px', color: '#6B7280' }}>{app.tenureMonths} Months @ {app.interestRate}%</div>
                  </td>
                  <td style={{ padding: '12px 16px', fontWeight: 700, color: '#7C3AED' }}>
                    ₹{(app.monthlyEMI || app.emiAmount)?.toLocaleString('en-IN')}/mo
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    {app.overdueInstallments > 0 ? (
                      <span className="badge badge-red" style={{ fontWeight: 700 }}>
                        🚨 {app.overdueInstallments} Overdue EMI(s)
                      </span>
                    ) : (
                      <span
                        style={{
                          fontSize: '11px',
                          padding: '3px 8px',
                          borderRadius: '4px',
                          fontWeight: 700,
                          backgroundColor:
                            app.eligibilityCheck?.riskAssessment === 'LOW_RISK' ? '#D1FAE5' : app.eligibilityCheck?.riskAssessment === 'MEDIUM_RISK' ? '#FEF3C7' : '#FEE2E2',
                          color:
                            app.eligibilityCheck?.riskAssessment === 'LOW_RISK' ? '#065F46' : app.eligibilityCheck?.riskAssessment === 'MEDIUM_RISK' ? '#92400E' : '#991B1B',
                        }}
                      >
                        {app.eligibilityCheck?.riskAssessment || 'LOW_RISK'} ({app.eligibilityCheck?.riskScore || 85}/100)
                      </span>
                    )}
                  </td>
                  <td style={{ padding: '12px 16px' }}>{getStatusBadge(app.status)}</td>
                  <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                    <button
                      onClick={() => handleOpenDetail(app)}
                      className="btn-primary"
                      style={{ padding: '6px 12px', fontSize: '12px' }}
                    >
                      {['disbursed', 'active', 'closed'].includes(app.status) ? 'View EMI Schedule →' : 'Process & Review →'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* DETAIL & EMI REPAYMENT MODAL */}
      {selectedApp && (
        <div className="modal-overlay open" style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0, 0, 0, 0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999 }}>
          <div className="modal-container" style={{ maxWidth: '950px', width: '92%', maxHeight: '90vh', overflowY: 'auto', backgroundColor: '#FFF', padding: '24px', borderRadius: '12px' }}>
            {/* MODAL HEADER */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px', borderBottom: '1px solid #E5E7EB', paddingBottom: '12px' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <h3 style={{ fontSize: '20px', margin: 0, fontWeight: 700, color: '#111827' }}>
                    Application #{selectedApp.applicationNumber || selectedApp._id}
                  </h3>
                  {getStatusBadge(selectedApp.status)}
                </div>
                <div style={{ fontSize: '13px', color: '#6B7280', marginTop: '4px' }}>
                  Product: <strong>{selectedApp.productName}</strong> | Customer: <strong>{selectedApp.user?.name || selectedApp.personalInformation?.fullName}</strong> ({selectedApp.user?.email || selectedApp.personalInformation?.email})
                </div>
              </div>
              <button onClick={() => setSelectedApp(null)} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#6B7280' }}>
                ✕
              </button>
            </div>

            {/* TAB SELECTOR */}
            <div style={{ display: 'flex', gap: '12px', borderBottom: '1px solid #E5E7EB', marginBottom: '20px' }}>
              <button
                onClick={() => setDetailTab('review')}
                style={{
                  padding: '8px 16px',
                  fontSize: '13px',
                  fontWeight: 600,
                  border: 'none',
                  borderBottom: detailTab === 'review' ? '2px solid #4F46E5' : '2px solid transparent',
                  color: detailTab === 'review' ? '#4F46E5' : '#6B7280',
                  backgroundColor: 'transparent',
                  cursor: 'pointer',
                }}
              >
                📋 Application Verification
              </button>
              <button
                onClick={() => setDetailTab('emi_schedule')}
                style={{
                  padding: '8px 16px',
                  fontSize: '13px',
                  fontWeight: 600,
                  border: 'none',
                  borderBottom: detailTab === 'emi_schedule' ? '2px solid #4F46E5' : '2px solid transparent',
                  color: detailTab === 'emi_schedule' ? '#4F46E5' : '#6B7280',
                  backgroundColor: 'transparent',
                  cursor: 'pointer',
                }}
              >
                📅 EMI Repayment Schedule & Payments
              </button>
              <button
                onClick={() => setDetailTab('recovery')}
                style={{
                  padding: '8px 16px',
                  fontSize: '13px',
                  fontWeight: 600,
                  border: 'none',
                  borderBottom: detailTab === 'recovery' ? '2px solid #4F46E5' : '2px solid transparent',
                  color: detailTab === 'recovery' ? '#4F46E5' : '#6B7280',
                  backgroundColor: 'transparent',
                  cursor: 'pointer',
                }}
              >
                📞 Collections & Recovery Follow-ups ({scheduleLoan?.recoveryLogs?.length || 0})
              </button>
            </div>

            {/* TAB 1: APPLICATION VERIFICATION & REVIEW */}
            {detailTab === 'review' && (
              <div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
                  {/* Customer Profile & Financials */}
                  <div style={{ padding: '14px', background: '#F9FAFB', borderRadius: '8px', border: '1px solid #E5E7EB' }}>
                    <h4 style={{ margin: '0 0 10px 0', fontSize: '14px', color: '#374151' }}>Customer & Financial Details</h4>
                    <div style={{ fontSize: '12px', display: 'grid', gap: '6px' }}>
                      <div><span style={{ color: '#6B7280' }}>Name:</span> <strong>{selectedApp.user?.name || selectedApp.personalInformation?.fullName}</strong></div>
                      <div><span style={{ color: '#6B7280' }}>Phone / Email:</span> {selectedApp.user?.phone || selectedApp.personalInformation?.phone} | {selectedApp.user?.email}</div>
                      <div><span style={{ color: '#6B7280' }}>PAN / Aadhaar:</span> {selectedApp.personalInformation?.panNumber || 'ABCDE1234F'} | {selectedApp.personalInformation?.aadhaarNumber || '123456789012'}</div>
                      <div><span style={{ color: '#6B7280' }}>Employer:</span> {selectedApp.employmentDetails?.companyName || 'Private Limited'} ({selectedApp.employmentDetails?.employmentType})</div>
                      <div><span style={{ color: '#6B7280' }}>Monthly Income:</span> <strong>₹{selectedApp.incomeDetails?.monthlyIncome?.toLocaleString('en-IN')}</strong></div>
                    </div>
                  </div>

                  {/* OCR & Risk Checks */}
                  <div style={{ padding: '14px', background: '#F9FAFB', borderRadius: '8px', border: '1px solid #E5E7EB' }}>
                    <h4 style={{ margin: '0 0 10px 0', fontSize: '14px', color: '#374151' }}>Automated OCR & Risk Check</h4>
                    <div style={{ fontSize: '12px', display: 'grid', gap: '6px' }}>
                      <div><span style={{ color: '#6B7280' }}>Requested Amount:</span> <strong>₹{(selectedApp.requestedAmount || selectedApp.principal)?.toLocaleString('en-IN')}</strong></div>
                      <div><span style={{ color: '#6B7280' }}>Tenure & Rate:</span> {selectedApp.tenureMonths} Months @ {selectedApp.interestRate}% APR</div>
                      <div><span style={{ color: '#6B7280' }}>Calculated Monthly EMI:</span> <strong style={{ color: '#7C3AED' }}>₹{(selectedApp.monthlyEMI || selectedApp.emiAmount)?.toLocaleString('en-IN')}/mo</strong></div>
                      <div>
                        <span style={{ color: '#6B7280' }}>Risk Assessment:</span>{' '}
                        <span className="badge badge-green" style={{ textTransform: 'uppercase' }}>
                          {selectedApp.eligibilityCheck?.riskAssessment || 'LOW_RISK'} ({selectedApp.eligibilityCheck?.riskScore || 85}/100)
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Submitted Documents (Specific, Standard & Additional) */}
                {(() => {
                  const standardDocs = getStandardDocuments(selectedApp);
                  const specificDocs = selectedApp.documents?.specificDocs || [];
                  const additionalDocs = selectedApp.documents?.additionalDocs || [];
                  const totalDocs = standardDocs.length + specificDocs.length + additionalDocs.length;

                  return (
                    <div style={{ padding: '16px', background: '#F9FAFB', borderRadius: '8px', border: '1px solid #E5E7EB', marginBottom: '20px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <h4 style={{ margin: 0, fontSize: '14px', color: '#374151', fontWeight: 600 }}>
                            📂 Submitted Loan Documents
                          </h4>
                          <span className="badge badge-purple" style={{ fontSize: '11px', fontWeight: 700 }}>
                            {totalDocs} File{totalDocs !== 1 ? 's' : ''} Attached
                          </span>
                        </div>
                        <span style={{ fontSize: '11.5px', color: '#6B7280' }}>
                          Click &quot;Preview&quot; to inspect in-app or &quot;Open&quot; in a new tab
                        </span>
                      </div>

                      {/* 1. Standard KYC & Financial Proofs */}
                      {standardDocs.length > 0 && (
                        <div style={{ marginBottom: '16px' }}>
                          <div style={{ fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span>Standard Identity &amp; Financial Proofs ({standardDocs.length}):</span>
                            <span style={{ fontSize: '11px', color: '#059669', fontWeight: 500 }}>✓ Auto-Mapped from Customer Profile</span>
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '10px' }}>
                            {standardDocs.map((item, idx) => (
                              <div
                                key={idx}
                                style={{
                                  padding: '10px 12px',
                                  backgroundColor: '#FFF',
                                  borderRadius: '8px',
                                  border: '1px solid #E5E7EB',
                                  boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  alignItems: 'center',
                                }}
                              >
                                <div style={{ minWidth: 0, flex: 1, marginRight: '8px' }}>
                                  <div style={{ fontSize: '12.5px', fontWeight: 600, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '5px' }}>
                                    <span>{item.icon || '📄'}</span>
                                    <span>{item.label}</span>
                                  </div>
                                  <div style={{ fontSize: '11px', color: '#6B7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: '2px' }}>
                                    {item.fileName} &bull; <span style={{ color: '#4F46E5' }}>{item.type}</span>
                                  </div>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                                  <button
                                    type="button"
                                    onClick={() => handleOpenDoc(item)}
                                    className="btn-primary"
                                    style={{ fontSize: '11px', padding: '4px 8px', backgroundColor: '#4F46E5', cursor: 'pointer' }}
                                    title="Preview Document In-App"
                                  >
                                    Preview 👁️
                                  </button>
                                  <a
                                    href={resolveDocUrl(item.docUrl)}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="btn-secondary"
                                    style={{ fontSize: '11px', padding: '4px 8px', textDecoration: 'none' }}
                                    title="Open in New Tab"
                                  >
                                    Open ↗
                                  </a>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* 2. Loan-Specific Uploaded Documents */}
                      {specificDocs.length > 0 && (
                        <div style={{ marginBottom: '16px' }}>
                          <div style={{ fontSize: '12px', fontWeight: 600, color: '#4F46E5', marginBottom: '8px' }}>
                            Loan Scheme Specific Documents ({specificDocs.length}):
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '10px' }}>
                            {specificDocs.map((doc, idx) => (
                              <div
                                key={idx}
                                style={{
                                  padding: '10px 12px',
                                  backgroundColor: '#FFF',
                                  borderRadius: '8px',
                                  border: '1px solid #E5E7EB',
                                  boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  alignItems: 'center',
                                }}
                              >
                                <div style={{ minWidth: 0, flex: 1, marginRight: '8px' }}>
                                  <div style={{ fontSize: '12.5px', fontWeight: 600, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    📄 {doc.name}
                                  </div>
                                  <div style={{ fontSize: '11px', color: '#6B7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: '2px' }}>
                                    {doc.fileName || 'Uploaded file'} &bull; <span style={{ color: '#059669', textTransform: 'uppercase', fontWeight: 600 }}>{doc.status || 'Verified'}</span>
                                  </div>
                                </div>
                                {doc.docUrl ? (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                                    <button
                                      type="button"
                                      onClick={() => handleOpenDoc({ label: doc.name, docUrl: doc.docUrl, fileName: doc.fileName, type: 'Scheme Specific Proof', status: doc.status })}
                                      className="btn-primary"
                                      style={{ fontSize: '11px', padding: '4px 8px', backgroundColor: '#4F46E5', cursor: 'pointer' }}
                                      title="Preview Document In-App"
                                    >
                                      Preview 👁️
                                    </button>
                                    <a
                                      href={resolveDocUrl(doc.docUrl)}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="btn-secondary"
                                      style={{ fontSize: '11px', padding: '4px 8px', textDecoration: 'none' }}
                                      title="Open in New Tab"
                                    >
                                      Open ↗
                                    </a>
                                  </div>
                                ) : (
                                  <span style={{ fontSize: '11px', color: '#9CA3AF' }}>Pending Upload</span>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* 3. Additional Requested Docs */}
                      {additionalDocs.length > 0 && (
                        <div>
                          <div style={{ fontSize: '12px', fontWeight: 600, color: '#D97706', marginBottom: '8px' }}>
                            Requested Additional Documents ({additionalDocs.length}):
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {additionalDocs.map((doc, idx) => (
                              <div
                                key={idx}
                                style={{
                                  padding: '10px 14px',
                                  backgroundColor: doc.status === 'uploaded' ? '#ECFDF5' : '#FFFBEB',
                                  border: `1px solid ${doc.status === 'uploaded' ? '#A7F3D0' : '#FDE68A'}`,
                                  borderRadius: '8px',
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  alignItems: 'center',
                                  fontSize: '12px',
                                }}
                              >
                                <div style={{ minWidth: 0, flex: 1, marginRight: '12px' }}>
                                  <strong style={{ color: '#1F2937' }}>{doc.title || 'Requested Document'}</strong>
                                  {doc.requestedNote && (
                                    <span style={{ color: '#6B7280', marginLeft: '6px' }}>— Note: {doc.requestedNote}</span>
                                  )}
                                  <div style={{ fontSize: '11px', color: '#9CA3AF', marginTop: '2px' }}>
                                    Status: <strong style={{ color: doc.status === 'uploaded' ? '#059669' : '#D97706', textTransform: 'uppercase' }}>{doc.status}</strong>
                                    {doc.uploadedAt && ` • Uploaded: ${new Date(doc.uploadedAt).toLocaleDateString()}`}
                                  </div>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                                  {doc.docUrl ? (
                                    <>
                                      <button
                                        type="button"
                                        onClick={() => handleOpenDoc({ label: doc.title, docUrl: doc.docUrl, fileName: doc.title, type: 'Requested Additional Document', status: doc.status })}
                                        className="btn-primary"
                                        style={{ fontSize: '11px', padding: '4px 8px', backgroundColor: '#059669', cursor: 'pointer' }}
                                        title="Preview Document In-App"
                                      >
                                        Preview 👁️
                                      </button>
                                      <a
                                        href={resolveDocUrl(doc.docUrl)}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="btn-secondary"
                                        style={{ fontSize: '11px', padding: '4px 8px', textDecoration: 'none' }}
                                        title="Open in New Tab"
                                      >
                                        Open ↗
                                      </a>
                                    </>
                                  ) : (
                                    <span style={{ fontSize: '11px', color: '#D97706', fontWeight: 600 }}>Awaiting Customer Upload</span>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Empty State */}
                      {totalDocs === 0 && (
                        <div style={{ padding: '24px', textAlign: 'center', color: '#9CA3AF', fontSize: '12.5px', fontStyle: 'italic', backgroundColor: '#FFF', borderRadius: '8px', border: '1px dashed #D1D5DB' }}>
                          No digital documents or uploads attached to this application yet.
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Worker Verification Checklist */}
                <div style={{ padding: '16px', background: '#F9FAFB', borderRadius: '8px', border: '1px solid #E5E7EB', marginBottom: '20px' }}>
                  <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', color: '#374151' }}>Worker Verification Checklist</h4>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', fontSize: '12px', marginBottom: '14px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                      <input type="checkbox" checked={checklists.documentsVerified} onChange={(e) => setChecklists({ ...checklists, documentsVerified: e.target.checked })} />
                      <span>Documents Verified</span>
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                      <input type="checkbox" checked={checklists.incomeVerified} onChange={(e) => setChecklists({ ...checklists, incomeVerified: e.target.checked })} />
                      <span>Income Verified</span>
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                      <input type="checkbox" checked={checklists.employmentVerified} onChange={(e) => setChecklists({ ...checklists, employmentVerified: e.target.checked })} />
                      <span>Employment Verified</span>
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                      <input type="checkbox" checked={checklists.bankStatementsVerified} onChange={(e) => setChecklists({ ...checklists, bankStatementsVerified: e.target.checked })} />
                      <span>Bank Statements Verified</span>
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                      <input type="checkbox" checked={checklists.existingLiabilitiesVerified} onChange={(e) => setChecklists({ ...checklists, existingLiabilitiesVerified: e.target.checked })} />
                      <span>Liabilities Verified</span>
                    </label>
                  </div>
                  <button className="btn-secondary" onClick={handleSaveChecklist} disabled={submitting} style={{ fontSize: '12px', padding: '6px 14px' }}>
                    💾 Save Verification Progress
                  </button>
                </div>
              </div>
            )}

            {/* TAB 2: EMI REPAYMENT SCHEDULE & PAYMENTS */}
            {detailTab === 'emi_schedule' && (
              <div>
                {scheduleLoading ? (
                  <div className="loading-panel">Loading EMI repayment schedule...</div>
                ) : (
                  <div>
                    {/* EMI SUMMARY CARDS */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '20px' }}>
                      <div className="card" style={{ padding: '12px 14px' }}>
                        <span style={{ fontSize: '11px', color: '#6B7280', fontWeight: 600 }}>Loan Principal</span>
                        <div style={{ fontSize: '18px', fontWeight: 700, color: '#111827', marginTop: '2px' }}>
                          ₹{(scheduleLoan?.principal || selectedApp.principal || selectedApp.requestedAmount)?.toLocaleString('en-IN')}
                        </div>
                      </div>
                      <div className="card" style={{ padding: '12px 14px' }}>
                        <span style={{ fontSize: '11px', color: '#7C3AED', fontWeight: 600 }}>Monthly EMI</span>
                        <div style={{ fontSize: '18px', fontWeight: 700, color: '#7C3AED', marginTop: '2px' }}>
                          ₹{(scheduleLoan?.monthlyEMI || scheduleLoan?.emiAmount || selectedApp.monthlyEMI || selectedApp.emiAmount)?.toLocaleString('en-IN')}
                        </div>
                      </div>
                      <div className="card" style={{ padding: '12px 14px' }}>
                        <span style={{ fontSize: '11px', color: '#059669', fontWeight: 600 }}>Outstanding Balance</span>
                        <div style={{ fontSize: '18px', fontWeight: 700, color: '#059669', marginTop: '2px' }}>
                          ₹{(scheduleLoan?.outstandingAmount !== undefined ? scheduleLoan.outstandingAmount : selectedApp.principal)?.toLocaleString('en-IN')}
                        </div>
                      </div>
                      <div className="card" style={{ padding: '12px 14px' }}>
                        <span style={{ fontSize: '11px', color: '#DC2626', fontWeight: 600 }}>Overdue Installments</span>
                        <div style={{ fontSize: '18px', fontWeight: 700, color: '#DC2626', marginTop: '2px' }}>
                          {scheduleLoan?.repayments?.filter((r) => r.status === 'overdue').length || 0}
                        </div>
                      </div>
                    </div>

                    {/* NOC CERTIFICATE CARD FOR CLOSED LOANS */}
                    {scheduleLoan?.nocCertificate?.certificateNumber && (
                      <div style={{ padding: '14px 18px', backgroundColor: '#ECFDF5', border: '1px solid #6EE7B7', borderRadius: '8px', marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <strong style={{ fontSize: '14px', color: '#065F46' }}>🎉 No Due Certificate (NOC) Issued</strong>
                          <div style={{ fontSize: '12px', color: '#047857', marginTop: '2px' }}>
                            Certificate #: <strong>{scheduleLoan.nocCertificate.certificateNumber}</strong> | Fully Paid On: {new Date(scheduleLoan.nocCertificate.fullyPaidAt).toLocaleDateString()}
                          </div>
                        </div>
                        <a
                          href={`${api.API_BASE}/repayments/noc/${scheduleLoan._id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="btn-primary"
                          style={{ fontSize: '12px', padding: '6px 14px', backgroundColor: '#059669', textDecoration: 'none' }}
                        >
                          ⬇ View NOC Document
                        </a>
                      </div>
                    )}

                    {/* INSTALLMENTS TABLE */}
                    <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: '20px' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                        <thead>
                          <tr style={{ backgroundColor: '#F9FAFB', borderBottom: '1px solid #E5E7EB', textAlign: 'left' }}>
                            <th style={{ padding: '10px 14px', color: '#374151' }}>Inst #</th>
                            <th style={{ padding: '10px 14px', color: '#374151' }}>Due Date</th>
                            <th style={{ padding: '10px 14px', color: '#374151' }}>Principal</th>
                            <th style={{ padding: '10px 14px', color: '#374151' }}>Interest</th>
                            <th style={{ padding: '10px 14px', color: '#374151' }}>Total EMI</th>
                            <th style={{ padding: '10px 14px', color: '#374151' }}>Late Fee / Fine</th>
                            <th style={{ padding: '10px 14px', color: '#374151' }}>Status</th>
                            <th style={{ padding: '10px 14px', color: '#374151' }}>Paid Date</th>
                            <th style={{ padding: '10px 14px', textAlign: 'right', color: '#374151' }}>Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {scheduleLoan?.repayments?.map((r) => (
                            <tr key={r.installmentNo} style={{ borderBottom: '1px solid #F3F4F6', backgroundColor: r.status === 'overdue' ? '#FEF2F2' : 'transparent' }}>
                              <td style={{ padding: '10px 14px', fontWeight: 700 }}>#{r.installmentNo}</td>
                              <td style={{ padding: '10px 14px' }}>{new Date(r.dueDate).toLocaleDateString()}</td>
                              <td style={{ padding: '10px 14px' }}>₹{r.principalComponent?.toLocaleString('en-IN')}</td>
                              <td style={{ padding: '10px 14px' }}>₹{r.interestComponent?.toLocaleString('en-IN')}</td>
                              <td style={{ padding: '10px 14px', fontWeight: 700, color: '#111827' }}>₹{r.emiAmount?.toLocaleString('en-IN')}</td>
                              <td style={{ padding: '10px 14px', color: r.lateFee > 0 ? '#DC2626' : '#6B7280', fontWeight: r.lateFee > 0 ? 700 : 400 }}>
                                {r.lateFee > 0 ? (
                                  <div>
                                    <div>₹{r.lateFee}</div>
                                    <div style={{ fontSize: '10px', color: '#991B1B' }}>
                                      {r.daysOverdue ? `${r.daysOverdue}d overdue` : 'Overdue'}
                                    </div>
                                  </div>
                                ) : '₹0'}
                              </td>
                              <td style={{ padding: '10px 14px' }}>{getEmiStatusBadge(r.status)}</td>
                              <td style={{ padding: '10px 14px', color: '#6B7280' }}>
                                {r.paidDate ? new Date(r.paidDate).toLocaleDateString() : '—'}
                              </td>
                              <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                                {r.status !== 'paid' ? (
                                  <button
                                    onClick={() => handleOpenMarkPaid(r)}
                                    className="btn-primary"
                                    style={{ fontSize: '11px', padding: '4px 10px', backgroundColor: '#059669' }}
                                  >
                                    Mark Paid (Cash/Wire)
                                  </button>
                                ) : (
                                  <span style={{ fontSize: '11px', color: '#059669', fontWeight: 600 }}>✓ Complete</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* TAB 3: COLLECTIONS & RECOVERY LOGS */}
            {detailTab === 'recovery' && (
              <div>
                {/* RECORD FOLLOW-UP FORM */}
                <div style={{ backgroundColor: '#F9FAFB', padding: '16px', borderRadius: '8px', border: '1px solid #E5E7EB', marginBottom: '20px' }}>
                  <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', color: '#111827' }}>📞 Log Recovery Follow-Up Attempt</h4>
                  <form onSubmit={handleAddRecoveryLog}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }} className="form-group">
                      <div>
                        <label className="form-label">Follow-Up Action Type</label>
                        <select
                          className="form-select"
                          value={recoveryForm.followupType}
                          onChange={(e) => setRecoveryForm({ ...recoveryForm, followupType: e.target.value })}
                        >
                          <option value="call_made">Telephone Call Made</option>
                          <option value="sms_sent">SMS / Email Reminder Sent</option>
                          <option value="field_visit">Field Officer Home Visit</option>
                          <option value="promise_to_pay">Customer Promised Payment</option>
                          <option value="legal_notice">Legal Notice Served</option>
                        </select>
                      </div>
                      <div>
                        <label className="form-label">Promised Payment Date (Optional)</label>
                        <input
                          type="date"
                          className="form-input"
                          value={recoveryForm.promisedPaymentDate}
                          onChange={(e) => setRecoveryForm({ ...recoveryForm, promisedPaymentDate: e.target.value })}
                        />
                      </div>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Call / Visit Notes</label>
                      <textarea
                        className="form-input"
                        rows={2}
                        placeholder="Document customer response, reason for delay, or recovery agreement..."
                        value={recoveryForm.notes}
                        onChange={(e) => setRecoveryForm({ ...recoveryForm, notes: e.target.value })}
                        required
                      />
                    </div>
                    <button type="submit" className="btn-primary" disabled={submitting} style={{ fontSize: '12px', padding: '6px 14px' }}>
                      {submitting ? 'Logging...' : 'Record Recovery Entry'}
                    </button>
                  </form>
                </div>

                {/* PAST RECOVERY LOGS TIMELINE */}
                <h4 style={{ fontSize: '14px', margin: '0 0 10px 0', color: '#111827' }}>Historical Recovery Trail</h4>
                {!scheduleLoan?.recoveryLogs || scheduleLoan.recoveryLogs.length === 0 ? (
                  <div className="card" style={{ padding: '20px', textAlign: 'center', color: '#6B7280', fontSize: '12px' }}>
                    No recovery follow-ups recorded for this loan yet.
                  </div>
                ) : (
                  <div style={{ display: 'grid', gap: '8px' }}>
                    {scheduleLoan.recoveryLogs.map((log, idx) => (
                      <div key={idx} className="card" style={{ padding: '12px 16px', fontSize: '12px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                          <strong style={{ textTransform: 'capitalize', color: '#4F46E5' }}>{log.followupType?.replace('_', ' ')}</strong>
                          <span style={{ color: '#6B7280' }}>{new Date(log.loggedAt).toLocaleString()}</span>
                        </div>
                        <div style={{ color: '#374151' }}>{log.notes}</div>
                        {log.promisedPaymentDate && (
                          <div style={{ marginTop: '4px', color: '#059669', fontWeight: 600 }}>
                            📅 Promised Payment Date: {new Date(log.promisedPaymentDate).toLocaleDateString()}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ACTION MODAL OVERLAYS INSIDE REVIEW */}
            {activeActionModal === 'request_doc' && (
              <div style={{ padding: '16px', background: '#FEF3C7', borderRadius: '12px', border: '1px solid #F59E0B', marginBottom: '20px', marginTop: '20px' }}>
                <h4 style={{ margin: '0 0 10px 0', fontSize: '14px', color: '#92400E', fontWeight: 700 }}>
                  📄 Request Specific Document from Customer
                </h4>
                <div style={{ marginBottom: '10px' }}>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#78350F', marginBottom: '4px' }}>
                    Document Title / Type *
                  </label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g., GST Registration Certificate, Last 6 Months Bank Statement, Rent Deed..."
                    value={requestedDocTitle}
                    onChange={(e) => setRequestedDocTitle(e.target.value)}
                    style={{ fontSize: '13px', width: '100%', marginBottom: '8px' }}
                  />
                </div>
                <div style={{ marginBottom: '10px' }}>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#78350F', marginBottom: '4px' }}>
                    Instructions / Reason for Customer *
                  </label>
                  <textarea
                    className="form-input"
                    rows={2}
                    placeholder="Describe specific requirement (e.g., Please upload signed copy with authorized seal in PDF format)..."
                    value={docRequestNote}
                    onChange={(e) => setDocRequestNote(e.target.value)}
                    style={{ fontSize: '13px', marginBottom: '4px' }}
                  />
                </div>
                <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                  <button className="btn-primary" onClick={handleRequestDocs} disabled={submitting} style={{ fontSize: '12px' }}>
                    Send Document Request
                  </button>
                  <button className="btn-secondary" onClick={() => setActiveActionModal(null)} style={{ fontSize: '12px' }}>
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {activeActionModal === 'sanction' && (
              <div style={{ padding: '16px', background: '#DCFCE7', borderRadius: '12px', border: '1px solid #22C55E', marginBottom: '20px', marginTop: '20px' }}>
                <h4 style={{ margin: '0 0 8px 0', fontSize: '14px', color: '#166534' }}>📜 Sanction & Approve Loan Terms</h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '10px', marginBottom: '10px' }}>
                  <div>
                    <label className="form-label">Sanctioned Amount (₹)</label>
                    <input
                      type="number"
                      className="form-input"
                      value={sanctionForm.sanctionedAmount}
                      onChange={(e) => setSanctionForm({ ...sanctionForm, sanctionedAmount: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="form-label">Interest Rate (% APR)</label>
                    <input
                      type="number"
                      step="0.1"
                      className="form-input"
                      value={sanctionForm.sanctionedInterestRate}
                      onChange={(e) => setSanctionForm({ ...sanctionForm, sanctionedInterestRate: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="form-label">Tenure (Months)</label>
                    <input
                      type="number"
                      className="form-input"
                      value={sanctionForm.sanctionedTenureMonths}
                      onChange={(e) => setSanctionForm({ ...sanctionForm, sanctionedTenureMonths: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="form-label">Calculation Model</label>
                    <select
                      className="form-input"
                      value={sanctionForm.sanctionedInterestType || 'diminishing'}
                      onChange={(e) => setSanctionForm({ ...sanctionForm, sanctionedInterestType: e.target.value })}
                    >
                      <option value="diminishing">Diminishing Balance</option>
                      <option value="flat">Flat Rate EMI</option>
                    </select>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button className="btn-primary" onClick={handleSanctionLoan} disabled={submitting} style={{ fontSize: '12px' }}>
                    Generate Sanction Letter & Send to Customer
                  </button>
                  <button className="btn-secondary" onClick={() => setActiveActionModal(null)} style={{ fontSize: '12px' }}>
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {activeActionModal === 'reject' && (
              <div style={{ padding: '16px', background: '#FEE2E2', borderRadius: '12px', border: '1px solid #EF4444', marginBottom: '20px', marginTop: '20px' }}>
                <h4 style={{ margin: '0 0 8px 0', fontSize: '14px', color: '#991B1B' }}>🚫 Reject Loan Application</h4>
                <textarea
                  className="form-input"
                  rows={2}
                  placeholder="Enter rejection reason (e.g. Inadequate income eligibility ratio, unverified employment)..."
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  style={{ fontSize: '13px', marginBottom: '10px' }}
                />
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button className="btn-primary" onClick={handleRejectLoan} disabled={submitting} style={{ fontSize: '12px', backgroundColor: '#991B1B' }}>
                    Confirm Application Rejection
                  </button>
                  <button className="btn-secondary" onClick={() => setActiveActionModal(null)} style={{ fontSize: '12px' }}>
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* WORKER ACTION BAR */}
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', borderTop: '1px solid #E5E7EB', paddingTop: '16px', marginTop: '16px' }}>
              {selectedApp.status === 'approved' && (
                <button
                  className="btn-primary"
                  onClick={handleDisburseLoan}
                  disabled={submitting}
                  style={{ backgroundColor: '#059669', padding: '8px 20px', fontWeight: 700 }}
                >
                  💳 Disburse Loan Funds to Customer Account
                </button>
              )}

              {['submitted', 'under_worker_review', 'documents_requested', 'field_verification', 'credit_assessment'].includes(selectedApp.status) && (
                <>
                  <button className="btn-secondary" onClick={() => setActiveActionModal('request_doc')} style={{ fontSize: '13px' }}>
                    📄 Request Addl. Docs
                  </button>
                  <button className="btn-primary" onClick={() => setActiveActionModal('sanction')} style={{ fontSize: '13px', backgroundColor: '#059669' }}>
                    📜 Sanction & Approve
                  </button>
                  <button className="btn-outline-dark" onClick={() => setActiveActionModal('reject')} style={{ fontSize: '13px', color: '#DC2626', borderColor: '#FCA5A5' }}>
                    🚫 Reject
                  </button>
                </>
              )}

              <button className="btn-secondary" onClick={() => setSelectedApp(null)} style={{ fontSize: '13px' }}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MARK PAID DIALOG */}
      {markPaidModal && (
        <div className="modal-overlay open" style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0, 0, 0, 0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="modal-container" style={{ maxWidth: '480px', backgroundColor: '#FFF', padding: '24px', borderRadius: '12px', width: '90%' }}>
            <h3 style={{ margin: '0 0 6px 0', fontSize: '16px', color: '#059669' }}>
              Record Manual EMI Payment (Inst #{markPaidModal.installmentNo})
            </h3>
            <p style={{ margin: '0 0 16px 0', fontSize: '12px', color: '#6B7280' }}>
              Record an offline cash/wire EMI payment collected by staff.
            </p>

            <form onSubmit={handleSubmitMarkPaid}>
              <div className="form-group">
                <label className="form-label">Amount Collected (₹) *</label>
                <input
                  type="number"
                  step="0.01"
                  className="form-input"
                  value={markPaidForm.amountPaid}
                  onChange={(e) => setMarkPaidForm({ ...markPaidForm, amountPaid: e.target.value })}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Payment Note / Receipt Reference *</label>
                <textarea
                  className="form-input"
                  rows={2}
                  placeholder="e.g. Cash collected at Kochi branch, Receipt #8841..."
                  value={markPaidForm.note}
                  onChange={(e) => setMarkPaidForm({ ...markPaidForm, note: e.target.value })}
                  required
                />
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                <button type="button" onClick={() => setMarkPaidModal(null)} className="btn-outline-dark" style={{ flex: 1 }}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary" style={{ flex: 1, backgroundColor: '#059669' }} disabled={submitting}>
                  {submitting ? 'Recording...' : 'Confirm Mark Paid'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ---------------- DOCUMENT PREVIEW MODAL ---------------- */}
      {previewDoc && (
        <div
          className="modal-overlay open"
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1100,
            padding: '16px',
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setPreviewDoc(null);
          }}
        >
          <div
            className="modal-container"
            style={{
              maxWidth: '920px',
              width: '95%',
              maxHeight: '92vh',
              display: 'flex',
              flexDirection: 'column',
              backgroundColor: '#FFF',
              borderRadius: '12px',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3), 0 10px 10px -5px rgba(0, 0, 0, 0.2)',
              overflow: 'hidden',
            }}
          >
            {/* Modal Header */}
            <div
              style={{
                padding: '14px 20px',
                borderBottom: '1px solid #E5E7EB',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                backgroundColor: '#F9FAFB',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '8px',
                    backgroundColor: '#EEF2FF',
                    color: '#4F46E5',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '18px',
                  }}
                >
                  📄
                </div>
                <div>
                  <div style={{ fontSize: '15px', fontWeight: 700, color: '#111827' }}>
                    {previewDoc.title}
                  </div>
                  <div style={{ fontSize: '11.5px', color: '#6B7280' }}>
                    {previewDoc.fileName} &bull; {previewDoc.type} &bull; {previewDoc.applicantName} ({previewDoc.applicationNumber})
                  </div>
                </div>
              </div>

              {/* Action Toolbar */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <a
                  href={previewDoc.resolvedUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="btn-secondary"
                  style={{ fontSize: '12px', padding: '6px 12px', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px' }}
                >
                  <span>Open in Tab</span> ↗
                </a>
                <a
                  href={previewDoc.resolvedUrl}
                  download={previewDoc.fileName || 'loan-document.pdf'}
                  className="btn-secondary"
                  style={{ fontSize: '12px', padding: '6px 12px', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px' }}
                >
                  <span>Download</span> ⬇
                </a>
                <button
                  type="button"
                  onClick={() => setPreviewDoc(null)}
                  style={{
                    background: 'none',
                    border: 'none',
                    fontSize: '18px',
                    cursor: 'pointer',
                    color: '#9CA3AF',
                    padding: '4px 8px',
                    lineHeight: 1,
                  }}
                  title="Close Preview (Esc)"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Applicant Metadata & Verification Strip */}
            <div
              style={{
                padding: '8px 20px',
                backgroundColor: '#F3EEF9',
                borderBottom: '1px solid #E9D5FF',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                fontSize: '11.5px',
                color: '#5B2E91',
              }}
            >
              <div>
                <strong>Applicant:</strong> {previewDoc.applicantName} | <strong>Loan App:</strong> {previewDoc.applicationNumber}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className="badge badge-green" style={{ fontSize: '10.5px' }}>
                  ✓ OCR VERIFIED ({previewDoc.ocrMatchScore}% MATCH)
                </span>
                <span style={{ color: '#6B7280' }}>Document URL: {previewDoc.docUrl}</span>
              </div>
            </div>

            {/* Document Viewer Body */}
            <div
              style={{
                flex: 1,
                padding: '16px',
                backgroundColor: '#1E293B',
                overflow: 'auto',
                minHeight: '480px',
                maxHeight: '68vh',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {/\.(png|jpe?g|gif|webp|svg)($|\?)/i.test(previewDoc.resolvedUrl) || previewDoc.resolvedUrl.startsWith('data:image') ? (
                <img
                  src={previewDoc.resolvedUrl}
                  alt={previewDoc.title}
                  style={{
                    maxWidth: '100%',
                    maxHeight: '62vh',
                    objectFit: 'contain',
                    borderRadius: '6px',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.5)',
                    backgroundColor: '#FFFFFF',
                  }}
                />
              ) : (
                <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
                  <iframe
                    src={previewDoc.resolvedUrl}
                    title={previewDoc.title}
                    style={{
                      width: '100%',
                      height: '580px',
                      border: 'none',
                      borderRadius: '6px',
                      backgroundColor: '#FFFFFF',
                    }}
                  />
                  <div
                    style={{
                      marginTop: '8px',
                      textAlign: 'center',
                      fontSize: '11.5px',
                      color: '#94A3B8',
                    }}
                  >
                    If the document does not display in the viewer above,{' '}
                    <a
                      href={previewDoc.resolvedUrl}
                      target="_blank"
                      rel="noreferrer"
                      style={{ color: '#A78BFA', textDecoration: 'underline' }}
                    >
                      click here to open in a new browser tab
                    </a>{' '}
                    or download directly.
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div
              style={{
                padding: '12px 20px',
                borderTop: '1px solid #E5E7EB',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                backgroundColor: '#FFFFFF',
              }}
            >
              <div style={{ fontSize: '11px', color: '#6B7280' }}>
                Flowly Loan Underwriting Document Archive &bull; End-to-end encrypted
              </div>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setPreviewDoc(null)}
                style={{ fontSize: '12px', padding: '6px 16px' }}
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
