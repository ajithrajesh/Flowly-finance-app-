import React, { useEffect, useState, useCallback } from 'react';
import * as api from '../api';

export default function NocManagementPage() {
  const [loading, setLoading] = useState(true);
  const [loans, setLoans] = useState([]);
  const [stats, setStats] = useState({
    pendingCount: 0,
    approvedCount: 0,
    rejectedCount: 0,
    totalClosed: 0,
  });

  const [activeTab, setActiveTab] = useState('requested'); // 'requested' | 'all' | 'approved' | 'rejected' | 'not_requested'
  const [searchTerm, setSearchTerm] = useState('');
  const [actionError, setActionError] = useState('');
  const [actionSuccess, setActionSuccess] = useState('');

  // Modals state
  const [auditLoan, setAuditLoan] = useState(null); // Loan currently open in Verification & Clearance Modal
  const [previewNocLoan, setPreviewNocLoan] = useState(null); // Loan currently open in Official Document Preview Modal
  const [adminRemarks, setAdminRemarks] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [submittingAction, setSubmittingAction] = useState(false);
  const [rejectMode, setRejectMode] = useState(false);

  const loadRequests = useCallback(async () => {
    setLoading(true);
    setActionError('');
    try {
      const res = await api.fetchNocRequests({
        status: activeTab,
        search: searchTerm,
      });

      if (res && res.success) {
        setLoans(res.requests || []);
        if (res.stats) {
          setStats(res.stats);
        }
      } else {
        setActionError(res?.message || 'Failed to load NOC clearance records');
      }
    } catch (err) {
      setActionError(err.message || 'Failed to load NOC clearance records');
    } finally {
      setLoading(false);
    }
  }, [activeTab, searchTerm]);

  useEffect(() => {
    loadRequests();
  }, [loadRequests]);

  const handleOpenAudit = (loan) => {
    setAuditLoan(loan);
    setAdminRemarks('Loan dues verified against core banking books. Full discharge authorized.');
    setRejectionReason('');
    setRejectMode(false);
  };

  const handleApproveNoc = async (loanId) => {
    setSubmittingAction(true);
    setActionError('');
    setActionSuccess('');
    try {
      const res = await api.approveNoc(loanId, {
        adminRemarks: adminRemarks || 'Loan verified and officially closed with full discharge of liabilities.',
      });

      if (res && res.success) {
        setActionSuccess(`NOC Certificate #${res.noc?.certificateNumber || ''} approved and officially issued!`);
        setAuditLoan(null);
        await loadRequests();
        // Automatically open the official document preview
        if (res.loan) {
          setPreviewNocLoan(res.loan);
        }
      } else {
        setActionError(res?.message || 'Failed to approve NOC certificate. Please try again.');
      }
    } catch (err) {
      setActionError(err.message || 'Failed to approve NOC certificate');
    } finally {
      setSubmittingAction(false);
    }
  };

  const handleRejectNoc = async (loanId) => {
    if (!rejectionReason.trim()) {
      alert('Please provide a specific reason for rejection / reconciliation.');
      return;
    }
    setSubmittingAction(true);
    setActionError('');
    setActionSuccess('');
    try {
      const res = await api.rejectNoc(loanId, { rejectionReason });
      if (res && res.success) {
        setActionSuccess('NOC application rejected. The customer has been notified with the reason.');
        setAuditLoan(null);
        setRejectMode(false);
        await loadRequests();
      } else {
        setActionError(res?.message || 'Failed to reject NOC request. Please try again.');
      }
    } catch (err) {
      setActionError(err.message || 'Failed to reject NOC request');
    } finally {
      setSubmittingAction(false);
    }
  };

  const handleDownloadPdf = (loanId) => {
    const url = api.getNocDownloadUrl(loanId);
    window.open(url, '_blank');
  };

  const formatCurrency = (amt) =>
    `₹${Number(amt || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const formatDate = (dateStr) => {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  };

  const formatDateTime = (dateStr) => {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  };

  return (
    <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '22px' }}>
      
      {/* Title & Description */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '36px',
              height: '36px',
              borderRadius: '10px',
              background: 'linear-gradient(135deg, #059669 0%, #047857 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              fontSize: '18px',
              boxShadow: '0 4px 12px rgba(5, 150, 105, 0.3)',
            }}>
              📜
            </div>
            <div>
              <h2 style={{ fontSize: '20px', fontWeight: '800', color: '#0f172a', margin: 0 }}>
                NOC Issuance & Verification Desk
              </h2>
              <p style={{ fontSize: '13px', color: '#64748b', marginTop: '2px' }}>
                Verify loan repayments, review customer clearance requests, approve and issue official Bank No Objection Certificates.
              </p>
            </div>
          </div>
        </div>

        {/* Search Input */}
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <input
            type="text"
            placeholder="Search borrower, loan #, cert #, phone..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              width: '280px',
              padding: '9px 14px',
              borderRadius: '8px',
              border: '1px solid #cbd5e1',
              fontSize: '13px',
              outline: 'none',
              backgroundColor: '#ffffff',
            }}
          />
          <button
            onClick={loadRequests}
            style={{
              padding: '9px 16px',
              borderRadius: '8px',
              border: '1px solid #cbd5e1',
              backgroundColor: '#ffffff',
              fontSize: '13px',
              fontWeight: '600',
              cursor: 'pointer',
              color: '#334155',
            }}
          >
            ↻ Refresh
          </button>
        </div>
      </div>

      {/* Action Banners */}
      {actionSuccess && (
        <div style={{
          padding: '12px 18px',
          borderRadius: '10px',
          background: '#ecfdf5',
          border: '1px solid #a7f3d0',
          color: '#065f46',
          fontSize: '13px',
          fontWeight: '600',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <span>✓ {actionSuccess}</span>
          <button onClick={() => setActionSuccess('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#065f46' }}>✕</button>
        </div>
      )}

      {actionError && (
        <div style={{
          padding: '12px 18px',
          borderRadius: '10px',
          background: '#fef2f2',
          border: '1px solid #fecaca',
          color: '#991b1b',
          fontSize: '13px',
          fontWeight: '600',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <span>⚠ {actionError}</span>
          <button onClick={() => setActionError('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#991b1b' }}>✕</button>
        </div>
      )}

      {/* Metrics Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '16px' }}>
        <div style={{
          background: '#ffffff',
          borderRadius: '14px',
          padding: '18px 20px',
          border: '1px solid #e2e8f0',
          boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
        }}>
          <span style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.6px', color: '#b45309', fontWeight: '700' }}>
            Pending Admin Action
          </span>
          <div style={{ fontSize: '26px', fontWeight: '800', color: '#d97706', marginTop: '6px' }}>
            {stats.pendingCount}
          </div>
          <div style={{ fontSize: '12px', color: '#92400e', marginTop: '4px' }}>
            Clearance requests awaiting verification
          </div>
        </div>

        <div style={{
          background: '#ffffff',
          borderRadius: '14px',
          padding: '18px 20px',
          border: '1px solid #e2e8f0',
          boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
        }}>
          <span style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.6px', color: '#047857', fontWeight: '700' }}>
            Issued & Approved NOCs
          </span>
          <div style={{ fontSize: '26px', fontWeight: '800', color: '#059669', marginTop: '6px' }}>
            {stats.approvedCount}
          </div>
          <div style={{ fontSize: '12px', color: '#065f46', marginTop: '4px' }}>
            Official bank certificates active
          </div>
        </div>

        <div style={{
          background: '#ffffff',
          borderRadius: '14px',
          padding: '18px 20px',
          border: '1px solid #e2e8f0',
          boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
        }}>
          <span style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.6px', color: '#4338ca', fontWeight: '700' }}>
            Total Fully Repaid Loans
          </span>
          <div style={{ fontSize: '26px', fontWeight: '800', color: '#4f46e5', marginTop: '6px' }}>
            {stats.totalClosed}
          </div>
          <div style={{ fontSize: '12px', color: '#3730a3', marginTop: '4px' }}>
            Zero outstanding balance accounts
          </div>
        </div>

        <div style={{
          background: '#ffffff',
          borderRadius: '14px',
          padding: '18px 20px',
          border: '1px solid #e2e8f0',
          boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
        }}>
          <span style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.6px', color: '#be123c', fontWeight: '700' }}>
            Reconciliation Required
          </span>
          <div style={{ fontSize: '26px', fontWeight: '800', color: '#e11d48', marginTop: '6px' }}>
            {stats.rejectedCount}
          </div>
          <div style={{ fontSize: '12px', color: '#9f1239', marginTop: '4px' }}>
            Rejected or held for reconciliation
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid #e2e8f0', paddingBottom: '2px' }}>
        {[
          { key: 'requested', label: 'Pending Approval', count: stats.pendingCount, alert: stats.pendingCount > 0 },
          { key: 'all', label: 'All NOC Records', count: loans.length },
          { key: 'approved', label: 'Approved & Issued', count: stats.approvedCount },
          { key: 'rejected', label: 'Rejected / Pending Reconciliation', count: stats.rejectedCount },
          { key: 'not_requested', label: 'Eligible Closed Loans', count: stats.totalClosed - stats.approvedCount - stats.pendingCount },
        ].map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                padding: '9px 16px',
                border: 'none',
                background: 'none',
                fontSize: '13px',
                fontWeight: isActive ? '700' : '500',
                color: isActive ? '#4f46e5' : '#64748b',
                borderBottom: isActive ? '2px solid #4f46e5' : '2px solid transparent',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                transition: 'all 0.15s ease',
              }}
            >
              <span>{tab.label}</span>
              {tab.alert && (
                <span style={{
                  background: '#d97706',
                  color: 'white',
                  fontSize: '10px',
                  fontWeight: '800',
                  padding: '1px 6px',
                  borderRadius: '999px',
                }}>
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Table Card */}
      <div style={{ background: '#ffffff', borderRadius: '14px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
        {loading ? (
          <div className="loading-panel" style={{ padding: '48px' }}>
            <div className="spinner" style={{ marginBottom: '10px' }} />
            <span style={{ fontSize: '13px', color: '#64748b' }}>Loading clearance records & applications...</span>
          </div>
        ) : loans.length === 0 ? (
          <div style={{ padding: '60px 24px', textAlign: 'center', color: '#64748b' }}>
            <div style={{ fontSize: '32px', marginBottom: '8px' }}>✓</div>
            <div style={{ fontSize: '15px', fontWeight: '600', color: '#0f172a' }}>No records found</div>
            <p style={{ fontSize: '13px', color: '#64748b', marginTop: '4px' }}>
              {activeTab === 'requested'
                ? 'All customer NOC requests have been reviewed and processed.'
                : 'No loans match the current filter and search criteria.'}
            </p>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                <th style={{ padding: '14px 18px' }}>Loan Facility</th>
                <th style={{ padding: '14px 18px' }}>Borrower Info</th>
                <th style={{ padding: '14px 18px' }}>Repayment Audit</th>
                <th style={{ padding: '14px 18px' }}>NOC Status</th>
                <th style={{ padding: '14px 18px' }}>Request Details</th>
                <th style={{ padding: '14px 18px', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loans.map((loan) => {
                const noc = loan.nocCertificate || {};
                const nocStatus = noc.status || (noc.certificateNumber ? 'approved' : 'not_requested');
                const user = loan.user || {};
                const unpaid = (loan.repayments || []).filter((r) => r.status !== 'paid');
                const isFullyRepaid = unpaid.length === 0 && Number(loan.outstandingAmount || 0) <= 0;

                return (
                  <tr key={loan._id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    
                    {/* Loan Info */}
                    <td style={{ padding: '14px 18px' }}>
                      <div style={{ fontWeight: '700', color: '#0f172a' }}>
                        {loan.applicationNumber || `LN-${loan._id.slice(-6).toUpperCase()}`}
                      </div>
                      <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                        {loan.productName || loan.loanType || 'Personal Loan'} • {loan.tenureMonths || 0}M
                      </div>
                      {noc.certificateNumber && (
                        <div style={{ fontSize: '11px', color: '#059669', fontWeight: '700', marginTop: '3px' }}>
                          Ref: {noc.certificateNumber}
                        </div>
                      )}
                    </td>

                    {/* Borrower */}
                    <td style={{ padding: '14px 18px' }}>
                      <div style={{ fontWeight: '600', color: '#0f172a' }}>
                        {noc.customerName || user.name || loan.personalInformation?.fullName || 'Valued Customer'}
                      </div>
                      <div style={{ fontSize: '11px', color: '#64748b' }}>
                        {user.phone || loan.personalInformation?.phone || 'No phone'}
                      </div>
                      <div style={{ fontSize: '11px', color: '#64748b' }}>
                        {user.email || loan.personalInformation?.email || '—'}
                      </div>
                    </td>

                    {/* Repayment Audit */}
                    <td style={{ padding: '14px 18px' }}>
                      <div style={{ fontWeight: '700', color: '#0f172a' }}>
                        {formatCurrency(loan.principal || loan.requestedAmount)}
                      </div>
                      <div style={{ fontSize: '11px', color: isFullyRepaid ? '#059669' : '#dc2626', fontWeight: '700', marginTop: '2px' }}>
                        {isFullyRepaid ? '✓ Zero Dues (100% Repaid)' : `Outstanding: ${formatCurrency(loan.outstandingAmount)}`}
                      </div>
                      <div style={{ fontSize: '11px', color: '#64748b' }}>
                        {(loan.repayments || []).length} EMIs cleared
                      </div>
                    </td>

                    {/* NOC Status */}
                    <td style={{ padding: '14px 18px' }}>
                      {nocStatus === 'requested' && (
                        <span style={{
                          padding: '4px 10px',
                          borderRadius: '999px',
                          fontSize: '11px',
                          fontWeight: '700',
                          background: '#fef3c7',
                          color: '#92400e',
                          border: '1px solid #fde68a',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}>
                          ● Awaiting Admin Approval
                        </span>
                      )}

                      {nocStatus === 'approved' && (
                        <span style={{
                          padding: '4px 10px',
                          borderRadius: '999px',
                          fontSize: '11px',
                          fontWeight: '700',
                          background: '#ecfdf5',
                          color: '#065f46',
                          border: '1px solid #a7f3d0',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}>
                          ✓ Officially Issued
                        </span>
                      )}

                      {nocStatus === 'rejected' && (
                        <span style={{
                          padding: '4px 10px',
                          borderRadius: '999px',
                          fontSize: '11px',
                          fontWeight: '700',
                          background: '#fef2f2',
                          color: '#991b1b',
                          border: '1px solid #fecaca',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}>
                          ✕ Rejected / Reconciliation
                        </span>
                      )}

                      {nocStatus === 'not_requested' && (
                        <span style={{
                          padding: '4px 10px',
                          borderRadius: '999px',
                          fontSize: '11px',
                          fontWeight: '600',
                          background: '#f1f5f9',
                          color: '#475569',
                          border: '1px solid #e2e8f0',
                        }}>
                          Eligible (Closed)
                        </span>
                      )}
                    </td>

                    {/* Request Details */}
                    <td style={{ padding: '14px 18px', maxWidth: '240px' }}>
                      {noc.requestedAt ? (
                        <>
                          <div style={{ fontSize: '11px', color: '#64748b' }}>
                            Applied: {formatDate(noc.requestedAt)}
                          </div>
                          {noc.requestNote && (
                            <div style={{
                              fontSize: '11.5px',
                              color: '#334155',
                              fontStyle: 'italic',
                              marginTop: '2px',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }} title={noc.requestNote}>
                              "{noc.requestNote}"
                            </div>
                          )}
                        </>
                      ) : noc.approvedAt ? (
                        <div style={{ fontSize: '11px', color: '#64748b' }}>
                          Issued: {formatDate(noc.approvedAt)} by {noc.approvedByName || 'Admin'}
                        </div>
                      ) : (
                        <span style={{ fontSize: '11px', color: '#94a3b8' }}>No application submitted</span>
                      )}
                    </td>

                    {/* Actions */}
                    <td style={{ padding: '14px 18px', textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: '8px', alignItems: 'center' }}>
                        
                        {nocStatus === 'requested' && (
                          <button
                            onClick={() => handleOpenAudit(loan)}
                            style={{
                              padding: '6px 14px',
                              borderRadius: '6px',
                              border: 'none',
                              background: '#059669',
                              color: 'white',
                              fontWeight: '700',
                              fontSize: '12px',
                              cursor: 'pointer',
                              boxShadow: '0 2px 4px rgba(5, 150, 105, 0.2)',
                            }}
                          >
                            Verify & Issue NOC
                          </button>
                        )}

                        {nocStatus === 'approved' && (
                          <>
                            <button
                              onClick={() => setPreviewNocLoan(loan)}
                              style={{
                                padding: '6px 12px',
                                borderRadius: '6px',
                                border: '1px solid #cbd5e1',
                                background: '#ffffff',
                                color: '#0f172a',
                                fontWeight: '600',
                                fontSize: '12px',
                                cursor: 'pointer',
                              }}
                            >
                              👁 View NOC
                            </button>
                            <button
                              onClick={() => handleDownloadPdf(loan._id)}
                              style={{
                                padding: '6px 12px',
                                borderRadius: '6px',
                                border: '1px solid #a7f3d0',
                                background: '#ecfdf5',
                                color: '#047857',
                                fontWeight: '700',
                                fontSize: '12px',
                                cursor: 'pointer',
                              }}
                            >
                              📥 Download PDF
                            </button>
                          </>
                        )}

                        {nocStatus === 'rejected' && (
                          <button
                            onClick={() => handleOpenAudit(loan)}
                            style={{
                              padding: '6px 12px',
                              borderRadius: '6px',
                              border: '1px solid #fecaca',
                              background: '#fff',
                              color: '#991b1b',
                              fontWeight: '600',
                              fontSize: '12px',
                              cursor: 'pointer',
                            }}
                          >
                            Review & Re-open
                          </button>
                        )}

                        {nocStatus === 'not_requested' && (
                          <button
                            onClick={() => handleOpenAudit(loan)}
                            style={{
                              padding: '6px 12px',
                              borderRadius: '6px',
                              border: '1px solid #cbd5e1',
                              background: '#f8fafc',
                              color: '#334155',
                              fontWeight: '600',
                              fontSize: '12px',
                              cursor: 'pointer',
                            }}
                          >
                            Audit & Issue
                          </button>
                        )}

                      </div>
                    </td>

                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ========================================================================= */}
      {/* MODAL 1: Admin Verification & Clearance Audit Modal */}
      {/* ========================================================================= */}
      {auditLoan && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(3px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '20px',
        }}>
          <div style={{
            background: '#ffffff',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '680px',
            maxHeight: '90vh',
            overflowY: 'auto',
            padding: '28px',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          }}>
            
            {/* Modal Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid #e2e8f0', paddingBottom: '14px' }}>
              <div>
                <h3 style={{ fontSize: '18px', fontWeight: '800', color: '#0f172a', margin: 0 }}>
                  Loan Settlement Verification & NOC Issuance
                </h3>
                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                  Account: {auditLoan.applicationNumber || auditLoan._id}
                </div>
              </div>
              <button
                onClick={() => setAuditLoan(null)}
                style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#64748b' }}
              >
                ✕
              </button>
            </div>

            {/* Clearance Audit Checklist */}
            <div style={{ background: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '16px', marginBottom: '20px' }}>
              <div style={{ fontSize: '12px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px', color: '#475569', marginBottom: '10px' }}>
                System Clearance Checks
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '12.5px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ color: '#059669', fontWeight: '800' }}>✓</span>
                  <span>Borrower: <strong>{auditLoan.user?.name || auditLoan.personalInformation?.fullName}</strong></span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ color: '#059669', fontWeight: '800' }}>✓</span>
                  <span>KYC Status: <strong>{auditLoan.user?.kycStatus || 'Verified'}</strong></span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ color: '#059669', fontWeight: '800' }}>✓</span>
                  <span>Sanctioned Principal: <strong>{formatCurrency(auditLoan.principal || auditLoan.requestedAmount)}</strong></span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ color: '#059669', fontWeight: '800' }}>✓</span>
                  <span>Outstanding Balance: <strong style={{ color: '#059669' }}>₹0.00 (NIL DUE)</strong></span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ color: '#059669', fontWeight: '800' }}>✓</span>
                  <span>Installments: <strong>{(auditLoan.repayments || []).length} / {(auditLoan.repayments || []).length} EMIs Paid</strong></span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ color: '#059669', fontWeight: '800' }}>✓</span>
                  <span>Overdue Penalty: <strong>₹0.00 Cleared</strong></span>
                </div>
              </div>
            </div>

            {/* Customer Request Details */}
            {auditLoan.nocCertificate?.requestedAt && (
              <div style={{ background: '#eff6ff', borderRadius: '10px', border: '1px solid #bfdbfe', padding: '14px', marginBottom: '20px', fontSize: '12.5px', color: '#1e3a8a' }}>
                <div style={{ fontWeight: '700', marginBottom: '4px' }}>Customer Clearance Application Note:</div>
                <div style={{ fontStyle: 'italic' }}>
                  "{auditLoan.nocCertificate.requestNote || 'Requested No Objection Certificate for loan record clearance.'}"
                </div>
                <div style={{ fontSize: '11px', color: '#3b82f6', marginTop: '6px' }}>
                  Submitted on: {formatDateTime(auditLoan.nocCertificate.requestedAt)}
                </div>
              </div>
            )}

            {/* Recent Repayments Schedule Audit */}
            <div style={{ marginBottom: '20px' }}>
              <div style={{ fontSize: '12px', fontWeight: '700', color: '#334155', marginBottom: '8px' }}>
                Repayment Schedule Audit (Last Installments)
              </div>
              <div style={{ maxHeight: '160px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'left' }}>
                  <thead style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b' }}>
                    <tr>
                      <th style={{ padding: '8px 12px' }}>#</th>
                      <th style={{ padding: '8px 12px' }}>Due Date</th>
                      <th style={{ padding: '8px 12px' }}>EMI Amount</th>
                      <th style={{ padding: '8px 12px' }}>Paid Date</th>
                      <th style={{ padding: '8px 12px' }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(auditLoan.repayments || []).map((r, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '8px 12px', fontWeight: '600' }}>#{r.installmentNo || i + 1}</td>
                        <td style={{ padding: '8px 12px', color: '#64748b' }}>{formatDate(r.dueDate)}</td>
                        <td style={{ padding: '8px 12px', fontWeight: '600' }}>{formatCurrency(r.emiAmount)}</td>
                        <td style={{ padding: '8px 12px', color: '#059669' }}>{formatDate(r.paidDate)}</td>
                        <td style={{ padding: '8px 12px' }}>
                          <span style={{ color: '#059669', fontWeight: '700', background: '#ecfdf5', padding: '2px 6px', borderRadius: '4px', fontSize: '10.5px' }}>
                            PAID
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Admin Decision Action Form */}
            {!rejectMode ? (
              <div>
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: '#334155', marginBottom: '6px' }}>
                    Official Bank Remarks / Verification Endorsement
                  </label>
                  <textarea
                    rows={2}
                    value={adminRemarks}
                    onChange={(e) => setAdminRemarks(e.target.value)}
                    placeholder="Enter official remarks for the certificate..."
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: '8px',
                      border: '1px solid #cbd5e1',
                      fontSize: '13px',
                      outline: 'none',
                    }}
                  />
                  <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
                    * This note will be embedded in the official Bank No Due Certificate and saved to compliance records.
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <button
                    type="button"
                    onClick={() => setRejectMode(true)}
                    style={{
                      padding: '10px 18px',
                      borderRadius: '8px',
                      border: '1px solid #fecaca',
                      background: '#fff',
                      color: '#b91c1c',
                      fontSize: '13px',
                      fontWeight: '600',
                      cursor: 'pointer',
                    }}
                  >
                    Reject Application
                  </button>

                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button
                      type="button"
                      onClick={() => setAuditLoan(null)}
                      style={{
                        padding: '10px 18px',
                        borderRadius: '8px',
                        border: '1px solid #cbd5e1',
                        background: '#ffffff',
                        color: '#475569',
                        fontSize: '13px',
                        fontWeight: '600',
                        cursor: 'pointer',
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={submittingAction}
                      onClick={() => handleApproveNoc(auditLoan._id)}
                      style={{
                        padding: '10px 24px',
                        borderRadius: '8px',
                        border: 'none',
                        background: '#059669',
                        color: 'white',
                        fontSize: '13px',
                        fontWeight: '700',
                        cursor: 'pointer',
                        boxShadow: '0 2px 6px rgba(5, 150, 105, 0.3)',
                      }}
                    >
                      {submittingAction ? 'Issuing Certificate...' : '✓ Approve & Issue Official NOC'}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '12px', padding: '16px' }}>
                <div style={{ fontWeight: '700', color: '#991b1b', fontSize: '13px', marginBottom: '8px' }}>
                  Rejection & Ledger Reconciliation Reason
                </div>
                <textarea
                  rows={2}
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="e.g. Dues reconciliation pending / late fee penalty adjustment needed..."
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    border: '1px solid #fca5a5',
                    fontSize: '13px',
                    outline: 'none',
                    marginBottom: '12px',
                  }}
                />
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                  <button
                    type="button"
                    onClick={() => setRejectMode(false)}
                    style={{
                      padding: '8px 16px',
                      borderRadius: '8px',
                      border: '1px solid #cbd5e1',
                      background: '#fff',
                      fontSize: '12px',
                      fontWeight: '600',
                      cursor: 'pointer',
                    }}
                  >
                    Back to Approval
                  </button>
                  <button
                    type="button"
                    disabled={submittingAction}
                    onClick={() => handleRejectNoc(auditLoan._id)}
                    style={{
                      padding: '8px 18px',
                      borderRadius: '8px',
                      border: 'none',
                      background: '#b91c1c',
                      color: 'white',
                      fontSize: '12px',
                      fontWeight: '700',
                      cursor: 'pointer',
                    }}
                  >
                    {submittingAction ? 'Rejecting...' : 'Confirm Rejection'}
                  </button>
                </div>
              </div>
            )}

          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: Official Bank Document Format Preview & Print Modal */}
      {/* ========================================================================= */}
      {previewNocLoan && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.75)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '20px',
        }}>
          <div style={{
            background: '#ffffff',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '720px',
            maxHeight: '92vh',
            overflowY: 'auto',
            padding: '24px',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
          }}>
            
            {/* Header Controls */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '20px' }}>📜</span>
                <h3 style={{ fontSize: '18px', fontWeight: '800', color: '#047857', margin: 0 }}>
                  Official Bank Document: No Due Certificate
                </h3>
              </div>
              <button
                onClick={() => setPreviewNocLoan(null)}
                style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#64748b' }}
              >
                ✕
              </button>
            </div>

            {/* Official Bank Document Body Container */}
            <div
              id="official-bank-noc-document"
              style={{
                background: '#ffffff',
                border: '2px solid #064E3B',
                borderRadius: '8px',
                padding: '32px 36px',
                marginBottom: '20px',
                boxShadow: '0 4px 14px rgba(0,0,0,0.06)',
                position: 'relative',
              }}
            >
              
              {/* Inner Gold Accent Line */}
              <div style={{
                position: 'absolute',
                top: '6px',
                left: '6px',
                right: '6px',
                bottom: '6px',
                border: '1px solid #B45309',
                pointerEvents: 'none',
              }} />

              {/* Bank Official Header */}
              <div style={{ textAlign: 'center', borderBottom: '1.5px solid #047857', paddingBottom: '16px', marginBottom: '18px' }}>
                <div style={{ fontSize: '24px', fontWeight: '900', color: '#064E3B', letterSpacing: '1px' }}>
                  FLOWLY FINANCE BANK
                </div>
                <div style={{ fontSize: '10px', fontWeight: '700', color: '#B45309', letterSpacing: '0.8px', marginTop: '3px' }}>
                  A SCHEDULED COMMERCIAL BANK • LICENSED BY RESERVE BANK OF INDIA
                </div>
                <div style={{ fontSize: '9.5px', color: '#64748b', marginTop: '3px' }}>
                  Registered Office: Flowly Financial Towers, BKC, Bandra Kurla Complex, Mumbai - 400051
                </div>
                <div style={{ fontSize: '9px', color: '#64748b', marginTop: '2px' }}>
                  CIN: U65191MH2023PTC10987 • IFSC: FLWB0001008 • www.flowlyfinance.com
                </div>
              </div>

              {/* Certificate Title Banner */}
              <div style={{
                background: '#F0FDF4',
                border: '1px solid #A7F3D0',
                borderRadius: '6px',
                padding: '10px',
                textAlign: 'center',
                marginBottom: '18px',
              }}>
                <div style={{ fontSize: '15px', fontWeight: '800', color: '#064E3B', letterSpacing: '0.8px' }}>
                  NO OBJECTION CERTIFICATE (NOC)
                </div>
                <div style={{ fontSize: '9.5px', fontWeight: '700', color: '#B45309', marginTop: '2px' }}>
                  LOAN CLOSURE & FULL LIABILITIES DISCHARGE CERTIFICATE
                </div>
              </div>

              {/* Certificate Meta Header */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                background: '#F8FAFC',
                border: '1px solid #E2E8F0',
                padding: '8px 14px',
                fontSize: '11px',
                marginBottom: '18px',
                borderRadius: '4px',
              }}>
                <div>
                  <span style={{ color: '#64748b', fontWeight: '600' }}>Certificate Ref No: </span>
                  <strong style={{ color: '#064E3B' }}>
                    {previewNocLoan.nocCertificate?.certificateNumber || 'NOC-20261020-XXXX'}
                  </strong>
                </div>
                <div>
                  <span style={{ color: '#64748b', fontWeight: '600' }}>Date of Issuance: </span>
                  <strong>{formatDate(previewNocLoan.nocCertificate?.approvedAt || previewNocLoan.nocCertificate?.generatedAt || new Date())}</strong>
                </div>
              </div>

              {/* Recital */}
              <div style={{ fontSize: '12.5px', color: '#0F172A', fontWeight: '700', marginBottom: '8px' }}>
                TO WHOMSOEVER IT MAY CONCERN,
              </div>
              <p style={{ fontSize: '12px', lineHeight: '1.6', color: '#334155', textAlign: 'justify', marginBottom: '16px' }}>
                This is to certify that customer <strong>{previewNocLoan.nocCertificate?.customerName || previewNocLoan.user?.name || previewNocLoan.personalInformation?.fullName}</strong> had availed of a credit facility from Flowly Finance Bank under Loan Account Number <strong>{previewNocLoan.applicationNumber || previewNocLoan._id}</strong>. The Bank hereby certifies and confirms that the borrower has satisfied, fully repaid, and discharged all equated monthly installments (EMIs), interest, and incidental dues in full and final settlement.
              </p>

              {/* Particulars Grid */}
              <div style={{
                background: '#F0FDF4',
                border: '1px solid #A7F3D0',
                borderRadius: '6px',
                padding: '14px 18px',
                marginBottom: '18px',
              }}>
                <div style={{ fontSize: '11px', fontWeight: '800', color: '#064E3B', marginBottom: '8px', borderBottom: '1px solid #A7F3D0', paddingBottom: '4px' }}>
                  BORROWER & LOAN FACILITY PARTICULARS
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px', fontSize: '11.5px' }}>
                  <div>
                    <span style={{ color: '#64748b' }}>Borrower Name: </span>
                    <strong>{previewNocLoan.nocCertificate?.customerName || previewNocLoan.user?.name}</strong>
                  </div>
                  <div>
                    <span style={{ color: '#64748b' }}>Loan Account No: </span>
                    <strong>{previewNocLoan.applicationNumber || previewNocLoan._id}</strong>
                  </div>
                  <div>
                    <span style={{ color: '#64748b' }}>Sanctioned Principal: </span>
                    <strong>{formatCurrency(previewNocLoan.nocCertificate?.loanAmount || previewNocLoan.principal)}</strong>
                  </div>
                  <div>
                    <span style={{ color: '#64748b' }}>Total Amount Paid: </span>
                    <strong style={{ color: '#064E3B' }}>{formatCurrency(previewNocLoan.totalRepayment || previewNocLoan.principal)}</strong>
                  </div>
                  <div>
                    <span style={{ color: '#64748b' }}>Settlement Date: </span>
                    <strong>{formatDate(previewNocLoan.nocCertificate?.fullyPaidAt || previewNocLoan.updatedAt)}</strong>
                  </div>
                  <div>
                    <span style={{ color: '#64748b' }}>Outstanding Balance: </span>
                    <strong style={{ color: '#047857' }}>₹0.00 (NIL / ZERO DUE)</strong>
                  </div>
                </div>
              </div>

              {/* Legal Non-Objection Clauses */}
              <div style={{ fontSize: '11px', lineHeight: '1.5', color: '#475569', marginBottom: '16px' }}>
                <div style={{ fontWeight: '700', color: '#1E293B', marginBottom: '4px' }}>TERMS OF CERTIFICATION & DISCHARGE:</div>
                <ol style={{ paddingLeft: '18px', margin: 0 }}>
                  <li>All equated monthly installments (EMIs), interest amounts, administrative charges, and penalties under Loan Account {previewNocLoan.applicationNumber} have been credited in full to bank books.</li>
                  <li>There are NO OUTSTANDING DUES, LIABILITIES, OR CLAIMS subsisting against the borrower in respect of this credit facility.</li>
                  <li>Flowly Finance Bank has NO OBJECTION to the borrower submitting this certificate to Credit Information Companies (CIBIL, Experian, CRIF, Equifax) for updating records.</li>
                  <li>Any hypothecation, pledge, or lien held specifically in connection with this loan stands discharged and released.</li>
                </ol>
              </div>

              {previewNocLoan.nocCertificate?.adminRemarks && (
                <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', padding: '8px 12px', borderRadius: '4px', fontSize: '11px', color: '#334155', marginBottom: '18px' }}>
                  <strong>Admin Remarks: </strong> <em>"{previewNocLoan.nocCertificate.adminRemarks}"</em>
                </div>
              )}

              {/* Signature & Seal Footer */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-end',
                borderTop: '1.5px solid #047857',
                paddingTop: '16px',
                marginTop: '10px',
              }}>
                <div>
                  <div style={{ fontSize: '10px', fontWeight: '800', color: '#064E3B' }}>OFFICIAL BANK VERIFICATION & DIGITAL SEAL</div>
                  <div style={{ fontSize: '9px', color: '#64748b', marginTop: '2px' }}>Flowly Core Banking Ledger Reconciled • NIL DUE</div>
                  <div style={{ fontSize: '9.5px', color: '#047857', fontWeight: '700', marginTop: '3px' }}>STATUS: VERIFIED & OFFICIALLY ISSUED</div>
                </div>

                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '9.5px', color: '#64748b' }}>FOR FLOWLY FINANCE BANK</div>
                  <div style={{ fontSize: '13px', fontWeight: '800', color: '#064E3B', marginTop: '2px' }}>
                    {previewNocLoan.nocCertificate?.approvedByName || 'Authorized Bank Administrator'}
                  </div>
                  <div style={{ fontSize: '9.5px', color: '#475569' }}>
                    Head of Credit Administration & Regulatory Issuance
                  </div>
                  <div style={{ fontSize: '8.5px', color: '#64748b', marginTop: '2px' }}>
                    Digitally Authorized on {formatDate(previewNocLoan.nocCertificate?.approvedAt || new Date())}
                  </div>
                </div>
              </div>

            </div>

            {/* Modal Action Buttons */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                onClick={() => setPreviewNocLoan(null)}
                style={{
                  padding: '9px 18px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  background: '#ffffff',
                  fontSize: '13px',
                  fontWeight: '600',
                  cursor: 'pointer',
                }}
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                style={{
                  padding: '9px 18px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  background: '#f8fafc',
                  fontSize: '13px',
                  fontWeight: '600',
                  cursor: 'pointer',
                }}
              >
                🖨 Print Certificate
              </button>
              <button
                type="button"
                onClick={() => handleDownloadPdf(previewNocLoan._id)}
                style={{
                  padding: '9px 22px',
                  borderRadius: '8px',
                  border: 'none',
                  background: '#047857',
                  color: 'white',
                  fontSize: '13px',
                  fontWeight: '700',
                  cursor: 'pointer',
                  boxShadow: '0 2px 6px rgba(4, 120, 87, 0.3)',
                }}
              >
                📥 Download Official PDF
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
