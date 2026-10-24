import React, { useEffect, useState } from 'react';
import * as api from '../api';

export default function FdProcessing({ onToast }) {
  const [queue, setQueue] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState('pending');
  const [pagination, setPagination] = useState(null);
  const [page, setPage] = useState(1);

  // Review Modal State
  const [selectedFdId, setSelectedFdId] = useState(null);
  const [reviewData, setReviewData] = useState(null);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewError, setReviewError] = useState('');

  // Action Dialogs State inside Review Modal
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [infoModalOpen, setInfoModalOpen] = useState(false);
  const [infoMessage, setInfoMessage] = useState('');
  const [submittingAction, setSubmittingAction] = useState(false);

  const loadQueue = async (p = 1, stat = 'pending') => {
    setLoading(true);
    setError('');
    try {
      const res = await api.fetchFdQueue({ page: p, limit: 15, status: stat });
      if (res && Array.isArray(res.fixedDeposits)) {
        setQueue(res.fixedDeposits);
        setPagination(res.pagination || null);
      } else {
        setQueue([]);
        setPagination(null);
        setError(res?.message || 'Failed to fetch FD review queue');
      }
    } catch (err) {
      setError(err.message || 'Failed to fetch FD review queue');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadQueue(page, statusFilter);
  }, [page, statusFilter]);

  const handleOpenReview = async (id) => {
    setSelectedFdId(id);
    setReviewData(null);
    setReviewLoading(true);
    setReviewError('');
    try {
      const res = await api.fetchFdReviewDetails(id);
      setReviewData(res);
    } catch (err) {
      setReviewError(err.message || 'Failed to fetch FD review details');
    } finally {
      setReviewLoading(false);
    }
  };

  const handleCloseReview = () => {
    setSelectedFdId(null);
    setReviewData(null);
    setRejectModalOpen(false);
    setInfoModalOpen(false);
  };

  const handleApprove = async () => {
    if (!selectedFdId) return;
    setSubmittingAction(true);
    try {
      const res = await api.approveFd(selectedFdId);
      onToast && onToast(res.message || 'Fixed Deposit approved and debited!');
      handleCloseReview();
      await loadQueue(page, statusFilter);
    } catch (err) {
      onToast && onToast(err.message || 'Approval failed');
    } finally {
      setSubmittingAction(false);
    }
  };

  const handleRejectSubmit = async (e) => {
    e.preventDefault();
    if (!selectedFdId || !rejectReason.trim()) return;
    setSubmittingAction(true);
    try {
      const res = await api.rejectFd(selectedFdId, rejectReason.trim());
      onToast && onToast(res.message || 'Fixed Deposit rejected');
      handleCloseReview();
      await loadQueue(page, statusFilter);
    } catch (err) {
      onToast && onToast(err.message || 'Rejection failed');
    } finally {
      setSubmittingAction(false);
    }
  };

  const handleRequestInfoSubmit = async (e) => {
    e.preventDefault();
    if (!selectedFdId || !infoMessage.trim()) return;
    setSubmittingAction(true);
    try {
      const res = await api.requestFdMoreInfo(selectedFdId, infoMessage.trim());
      onToast && onToast(res.message || 'Information request sent to customer');
      handleCloseReview();
      await loadQueue(page, statusFilter);
    } catch (err) {
      onToast && onToast(err.message || 'Failed to send information request');
    } finally {
      setSubmittingAction(false);
    }
  };

  const handleRunMaturitySweep = async () => {
    try {
      const res = await api.triggerFdMaturityCheck();
      onToast && onToast(`Maturity check complete: ${res.processed || 0} processed, ${res.renewed || 0} renewed.`);
    } catch (err) {
      onToast && onToast(err.message || 'Maturity check failed');
    }
  };

  return (
    <div style={{ padding: '4px 0 24px 0' }}>
      {/* Header Banner */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ fontSize: '22px', margin: '0 0 4px 0', color: '#111827' }}>Fixed Deposit Review & Approvals Desk</h2>
          <p style={{ margin: 0, fontSize: '13px', color: '#6B7280' }}>
            Review pending customer FD requests, inspect AML fraud checks, Core Banking accounts, and approve bookings.
          </p>
        </div>
        <button
          onClick={handleRunMaturitySweep}
          className="btn-secondary"
          style={{ padding: '8px 16px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}
        >
          ⚡ Run On-Demand Maturity Sweep
        </button>
      </div>

      {/* Filter Tabs */}
      <div className="card" style={{ padding: '12px 16px', marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
        <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '2px' }}>
          {[
            { id: 'pending', label: 'Pending Review' },
            { id: 'info_requested', label: 'Awaiting Info' },
            { id: 'active', label: 'Active FDs' },
            { id: 'matured', label: 'Matured' },
            { id: 'rejected', label: 'Rejected' },
            { id: 'closed_early', label: 'Closed Early' },
            { id: 'all', label: 'All FDs' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => { setStatusFilter(tab.id); setPage(1); }}
              style={{
                padding: '6px 14px',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: 600,
                border: 'none',
                cursor: 'pointer',
                transition: 'all 0.2s',
                backgroundColor: statusFilter === tab.id ? '#4F46E5' : '#F3F4F6',
                color: statusFilter === tab.id ? '#FFF' : '#374151',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
        {pagination && (
          <div style={{ fontSize: '12px', color: '#6B7280' }}>
            Total Count: <strong>{pagination.total}</strong>
          </div>
        )}
      </div>

      {/* Queue Table */}
      {loading ? (
        <div className="loading-panel">Loading FD Queue...</div>
      ) : error ? (
        <div className="error-banner">{error}</div>
      ) : queue.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '48px', color: '#6B7280' }}>
          No Fixed Deposit requests currently in '{statusFilter.replace('_', ' ')}' queue.
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ backgroundColor: '#F9FAFB', borderBottom: '1px solid #E5E7EB', textAlign: 'left' }}>
                <th style={{ padding: '12px 16px', color: '#374151', fontWeight: 600 }}>Customer</th>
                <th style={{ padding: '12px 16px', color: '#374151', fontWeight: 600 }}>Principal Amount</th>
                <th style={{ padding: '12px 16px', color: '#374151', fontWeight: 600 }}>Tenure & Rate</th>
                <th style={{ padding: '12px 16px', color: '#374151', fontWeight: 600 }}>FD Type</th>
                <th style={{ padding: '12px 16px', color: '#374151', fontWeight: 600 }}>Submitted On</th>
                <th style={{ padding: '12px 16px', color: '#374151', fontWeight: 600 }}>Status</th>
                <th style={{ padding: '12px 16px', textAlignment: 'right', color: '#374151', fontWeight: 600 }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {queue.map((fd) => (
                <tr key={fd._id} style={{ borderBottom: '1px solid #F3F4F6' }}>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ fontWeight: 600, color: '#111827' }}>{fd.user?.name || 'Customer'}</div>
                    <div style={{ fontSize: '11px', color: '#6B7280' }}>{fd.user?.email || fd.user?.phone}</div>
                  </td>
                  <td style={{ padding: '12px 16px', fontWeight: 700, color: '#059669', fontSize: '14px' }}>
                    ₹{fd.principalAmount?.toLocaleString('en-IN')}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <div>{fd.tenureMonths} Months</div>
                    <div style={{ fontSize: '11px', color: '#7C3AED', fontWeight: 600 }}>{fd.interestRate}% APR</div>
                  </td>
                  <td style={{ padding: '12px 16px', textTransform: 'capitalize' }}>
                    {fd.fdType || 'regular'}
                  </td>
                  <td style={{ padding: '12px 16px', color: '#6B7280', fontSize: '12px' }}>
                    {new Date(fd.createdAt).toLocaleDateString()}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <span className={`badge ${fd.status === 'pending' ? 'badge-amber' : 'badge-purple'}`}>
                      {fd.status.replace('_', ' ')}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                    <button
                      onClick={() => handleOpenReview(fd._id)}
                      className="btn-primary"
                      style={{ fontSize: '12px', padding: '5px 12px' }}
                    >
                      Review & Decide
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* REVIEW & DECISION MODAL */}
      {selectedFdId && (
        <div className="modal-overlay open" style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999 }}>
          <div className="modal-container" style={{ maxWidth: '850px', maxHeight: '90vh', overflowY: 'auto', backgroundColor: '#FFF', padding: '24px', borderRadius: '12px', width: '90%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '18px', color: '#111827' }}>Worker Review & Decision Desk</h3>
                <span style={{ fontSize: '12px', color: '#6B7280' }}>FD Request ID: {selectedFdId}</span>
              </div>
              <button onClick={handleCloseReview} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px' }}>
                ✕
              </button>
            </div>

            {reviewLoading ? (
              <div className="loading-panel">Loading review details & AML check...</div>
            ) : reviewError ? (
              <div className="error-banner">{reviewError}</div>
            ) : reviewData ? (
              <div>
                {/* AML / FRAUD SCREENING PANEL */}
                {reviewData.amlFraudCheck && (
                  <div style={{
                    padding: '14px 18px',
                    borderRadius: '8px',
                    marginBottom: '16px',
                    backgroundColor: reviewData.amlFraudCheck.riskLevel === 'high' ? '#FEE2E2' : reviewData.amlFraudCheck.riskLevel === 'medium' ? '#FEF3C7' : '#D1FAE5',
                    border: reviewData.amlFraudCheck.riskLevel === 'high' ? '1px solid #FCA5A5' : reviewData.amlFraudCheck.riskLevel === 'medium' ? '1px solid #FCD34D' : '1px solid #6EE7B7'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                      <strong style={{ fontSize: '14px', color: '#111827' }}>🛡 Rule-Based AML & Fraud Check</strong>
                      <span className={`badge ${reviewData.amlFraudCheck.riskLevel === 'high' ? 'badge-red' : reviewData.amlFraudCheck.riskLevel === 'medium' ? 'badge-amber' : 'badge-green'}`} style={{ textTransform: 'uppercase', fontWeight: 700 }}>
                        Risk: {reviewData.amlFraudCheck.riskLevel}
                      </span>
                    </div>
                    {reviewData.amlFraudCheck.flags?.length === 0 ? (
                      <div style={{ fontSize: '12px', color: '#065F46' }}>✓ No AML or account fraud flags detected.</div>
                    ) : (
                      <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '12px', color: '#78350F' }}>
                        {reviewData.amlFraudCheck.flags.map((flag, idx) => (
                          <li key={idx}>{flag}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}

                {/* GRID: CUSTOMER & ACCOUNT DETAILS */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                  {/* Customer Profile & KYC */}
                  <div style={{ backgroundColor: '#F9FAFB', padding: '14px', borderRadius: '8px', border: '1px solid #E5E7EB' }}>
                    <h4 style={{ margin: '0 0 8px 0', fontSize: '14px', color: '#374151' }}>Customer Profile & KYC</h4>
                    <div className="kv-row" style={{ fontSize: '12px' }}>
                      <span className="k">Name</span>
                      <span className="v">{reviewData.customerProfile?.name}</span>
                    </div>
                    <div className="kv-row" style={{ fontSize: '12px' }}>
                      <span className="k">Email</span>
                      <span className="v">{reviewData.customerProfile?.email}</span>
                    </div>
                    <div className="kv-row" style={{ fontSize: '12px' }}>
                      <span className="k">Phone</span>
                      <span className="v">{reviewData.customerProfile?.phone}</span>
                    </div>
                    <div className="kv-row" style={{ fontSize: '12px' }}>
                      <span className="k">KYC Status</span>
                      <span className="v" style={{ textTransform: 'capitalize', fontWeight: 700, color: '#059669' }}>
                        {reviewData.customerProfile?.kycStatus}
                      </span>
                    </div>
                  </div>

                  {/* Core Banking Savings Account */}
                  <div style={{ backgroundColor: '#F9FAFB', padding: '14px', borderRadius: '8px', border: '1px solid #E5E7EB' }}>
                    <h4 style={{ margin: '0 0 8px 0', fontSize: '14px', color: '#374151' }}>Core Banking Account</h4>
                    <div className="kv-row" style={{ fontSize: '12px' }}>
                      <span className="k">Account Number</span>
                      <span className="v">{reviewData.accountStatus?.accountNumber}</span>
                    </div>
                    <div className="kv-row" style={{ fontSize: '12px' }}>
                      <span className="k">Current Balance</span>
                      <span className="v" style={{ fontWeight: 800, fontSize: '14px', color: '#059669' }}>
                        ₹{reviewData.accountStatus?.balance?.toLocaleString('en-IN')}
                      </span>
                    </div>
                    <div className="kv-row" style={{ fontSize: '12px' }}>
                      <span className="k">Account Status</span>
                      <span className="v" style={{ textTransform: 'capitalize' }}>{reviewData.accountStatus?.status}</span>
                    </div>
                  </div>
                </div>

                {/* FD REQUEST TERMS */}
                <div style={{ backgroundColor: '#FAF5FF', padding: '14px', borderRadius: '8px', border: '1px solid #E9D5FF', marginBottom: '16px' }}>
                  <h4 style={{ margin: '0 0 8px 0', fontSize: '14px', color: '#5C187B' }}>Fixed Deposit Request Terms</h4>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', fontSize: '12px' }}>
                    <div>
                      <span style={{ color: '#6B7280' }}>Principal Amount:</span>
                      <div style={{ fontSize: '18px', fontWeight: 800, color: '#111827' }}>
                        ₹{reviewData.fixedDeposit?.principalAmount?.toLocaleString('en-IN')}
                      </div>
                    </div>
                    <div>
                      <span style={{ color: '#6B7280' }}>Interest Rate & Tenure:</span>
                      <div style={{ fontSize: '14px', fontWeight: 700, color: '#7C3AED' }}>
                        {reviewData.fixedDeposit?.interestRate}% APR · {reviewData.fixedDeposit?.tenureMonths} Months
                      </div>
                    </div>
                    <div>
                      <span style={{ color: '#6B7280' }}>Calculated Maturity Payout:</span>
                      <div style={{ fontSize: '16px', fontWeight: 800, color: '#059669' }}>
                        ₹{reviewData.fixedDeposit?.maturityAmount?.toLocaleString('en-IN')}
                      </div>
                    </div>
                  </div>
                </div>

                {/* TRANSACTION HISTORY LEDGER */}
                {reviewData.transactionHistory && reviewData.transactionHistory.length > 0 && (
                  <div style={{ marginBottom: '16px' }}>
                    <h4 style={{ margin: '0 0 8px 0', fontSize: '13px', color: '#374151' }}>Recent Account Transaction History</h4>
                    <div style={{ maxHeight: '140px', overflowY: 'auto', border: '1px solid #E5E7EB', borderRadius: '6px' }}>
                      <table style={{ width: '100%', fontSize: '11px', borderCollapse: 'collapse' }}>
                        <tbody>
                          {reviewData.transactionHistory.slice(0, 5).map((t, idx) => (
                            <tr key={idx} style={{ borderBottom: '1px solid #F3F4F6' }}>
                              <td style={{ padding: '6px 10px', color: '#6B7280' }}>{new Date(t.postedAt).toLocaleDateString()}</td>
                              <td style={{ padding: '6px 10px', textTransform: 'capitalize' }}>{t.type}</td>
                              <td style={{ padding: '6px 10px' }}>{t.description}</td>
                              <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 600 }}>₹{t.amount?.toLocaleString('en-IN')}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* INFO TRAIL */}
                {reviewData.fixedDeposit?.infoRequests?.length > 0 && (
                  <div style={{ backgroundColor: '#FEF3C7', padding: '12px', borderRadius: '6px', marginBottom: '16px', fontSize: '12px' }}>
                    <strong>Information Request Trail:</strong>
                    {reviewData.fixedDeposit.infoRequests.map((req, idx) => (
                      <div key={idx} style={{ marginTop: '4px' }}>
                        • Staff requested: <em>"{req.message}"</em>
                      </div>
                    ))}
                    {reviewData.fixedDeposit.infoResponses?.map((resp, idx) => (
                      <div key={idx} style={{ marginTop: '4px', color: '#047857' }}>
                        ✓ Customer replied: <em>"{resp.note}"</em> {resp.documentUrl && <a href={resp.documentUrl} target="_blank" rel="noreferrer">[View Document]</a>}
                      </div>
                    ))}
                  </div>
                )}

                {/* ACTION BUTTONS */}
                {reviewData.fixedDeposit?.status === 'pending' ? (
                  <div style={{ display: 'flex', gap: '12px', marginTop: '20px', paddingTop: '16px', borderTop: '1px solid #E5E7EB' }}>
                    <button
                      onClick={() => setInfoModalOpen(true)}
                      className="btn-secondary"
                      style={{ flex: 1, fontSize: '13px' }}
                      disabled={submittingAction}
                    >
                      Request Info
                    </button>
                    <button
                      onClick={() => setRejectModalOpen(true)}
                      className="btn-outline-dark"
                      style={{ flex: 1, fontSize: '13px', color: '#DC2626', borderColor: '#FCA5A5' }}
                      disabled={submittingAction}
                    >
                      Reject FD
                    </button>
                    <button
                      onClick={handleApprove}
                      className="btn-primary"
                      style={{ flex: 1, fontSize: '13px', backgroundColor: '#059669' }}
                      disabled={submittingAction}
                    >
                      {submittingAction ? 'Processing Debit...' : 'Approve & Activate FD'}
                    </button>
                  </div>
                ) : (
                  <div style={{ padding: '12px', borderRadius: '8px', backgroundColor: '#F3F4F6', color: '#374151', fontSize: '13px', textAlign: 'center', marginTop: '20px', fontWeight: 600 }}>
                    This Fixed Deposit is currently '{reviewData.fixedDeposit?.status?.replace('_', ' ')}'.
                  </div>
                )}
              </div>
            ) : (
              <div style={{ padding: '32px', textAlign: 'center', color: '#6B7280', fontSize: '13px' }}>
                No review data could be found for this Fixed Deposit.
              </div>
            )}
          </div>
        </div>
      )}

      {/* REJECT DIALOG */}
      {rejectModalOpen && (
        <div className="modal-overlay open" style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="modal-container" style={{ maxWidth: '500px', backgroundColor: '#FFF', padding: '24px', borderRadius: '12px', width: '90%' }}>
            <h3 style={{ margin: '0 0 12px 0', fontSize: '16px', color: '#DC2626' }}>Reject Fixed Deposit Request</h3>
            <form onSubmit={handleRejectSubmit}>
              <div className="form-group">
                <label className="form-label">Rejection Reason (Required)</label>
                <textarea
                  className="form-input"
                  rows={3}
                  placeholder="Provide explicit reason for rejection..."
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  required
                />
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button type="button" onClick={() => setRejectModalOpen(false)} className="btn-outline-dark" style={{ flex: 1 }}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary" style={{ flex: 1, backgroundColor: '#DC2626' }} disabled={submittingAction}>
                  Confirm Reject
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* REQUEST INFO DIALOG */}
      {infoModalOpen && (
        <div className="modal-overlay open" style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="modal-container" style={{ maxWidth: '500px', backgroundColor: '#FFF', padding: '24px', borderRadius: '12px', width: '90%' }}>
            <h3 style={{ margin: '0 0 12px 0', fontSize: '16px', color: '#D97706' }}>Request Additional Information</h3>
            <form onSubmit={handleRequestInfoSubmit}>
              <div className="form-group">
                <label className="form-label">Prompt for Customer (Required)</label>
                <textarea
                  className="form-input"
                  rows={3}
                  placeholder="Specify what document or detail is needed..."
                  value={infoMessage}
                  onChange={(e) => setInfoMessage(e.target.value)}
                  required
                />
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button type="button" onClick={() => setInfoModalOpen(false)} className="btn-outline-dark" style={{ flex: 1 }}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary" style={{ flex: 1, backgroundColor: '#D97706' }} disabled={submittingAction}>
                  Send Request
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
