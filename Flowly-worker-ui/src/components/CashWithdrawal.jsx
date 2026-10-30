import React, { useState, useEffect, useCallback } from 'react';
import * as api from '../api';
import Pagination from './Pagination';

export default function CashWithdrawal({ onToast }) {
  // Search & account selection state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');

  const [selectedAccount, setSelectedAccount] = useState(null);

  // Withdrawal Form state
  const [amount, setAmount] = useState('');
  const [remarks, setRemarks] = useState('');
  const [confirmCash, setConfirmCash] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  // Receipt & History modal state
  const [activeReceipt, setActiveReceipt] = useState(null);
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  const handleDownloadPdf = async () => {
    if (!activeReceipt?.receiptNumber) return;
    setDownloadingPdf(true);
    try {
      await api.downloadCashWithdrawalReceiptPDF(activeReceipt.receiptNumber);
      if (onToast) onToast('PDF Receipt downloaded successfully!');
    } catch (err) {
      if (onToast) onToast(err.message || 'Failed to download PDF receipt');
    } finally {
      setDownloadingPdf(false);
    }
  };

  // Recent withdrawals list
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [pagination, setPagination] = useState(null);

  const loadWithdrawalHistory = useCallback(async (p = 1, l = 10) => {
    setHistoryLoading(true);
    try {
      const data = await api.fetchCashWithdrawals({ page: p, limit: l });
      setHistory(data?.withdrawals || []);
      setPagination(
        data?.pagination || {
          total: data?.total || 0,
          page: p,
          limit: l,
          totalPages: Math.max(1, Math.ceil((data?.total || 0) / l)),
          hasPrevPage: p > 1,
          hasNextPage: p * l < (data?.total || 0),
        }
      );
    } catch (err) {
      console.error('Failed to load withdrawal history:', err);
      if (onToast) onToast(err.message || 'Failed to load withdrawal history');
    } finally {
      setHistoryLoading(false);
    }
  }, [onToast]);

  useEffect(() => {
    loadWithdrawalHistory(page, limit);
  }, [page, limit, loadWithdrawalHistory]);

  const handleSearch = async (e) => {
    if (e) e.preventDefault();
    const q = searchQuery.trim();
    if (q.length < 3) {
      setSearchError('Enter at least 3 characters (name, phone, email, or account number)');
      return;
    }

    setSearching(true);
    setSearchError('');
    try {
      const accounts = await api.searchCashWithdrawalAccounts(q);
      setSearchResults(accounts);
      if (accounts.length === 0) {
        setSearchError('No matching Savings or Current account found');
      }
    } catch (err) {
      setSearchError(err.message || 'Failed to search accounts');
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  };

  const handleSelectAccount = (acc) => {
    if (!acc.eligible) {
      setFormError(`Cannot select this account: ${acc.ineligibleReason}`);
      return;
    }
    setSelectedAccount(acc);
    setFormError('');
  };

  const handleClearSelection = () => {
    setSelectedAccount(null);
    setAmount('');
    setRemarks('');
    setConfirmCash(false);
    setFormError('');
  };

  const handlePresetAmount = (addValue) => {
    const current = Number(amount) || 0;
    setAmount(String(current + addValue));
  };

  const handleProcessWithdrawal = async (e) => {
    e.preventDefault();
    if (!selectedAccount) {
      setFormError('Please select a verified customer account');
      return;
    }

    const numAmount = Number(amount);
    if (!numAmount || numAmount <= 0) {
      setFormError('Please enter a valid withdrawal amount greater than ₹0');
      return;
    }

    if (numAmount > selectedAccount.balance) {
      setFormError(
        `Insufficient available balance in ${selectedAccount.accountType?.toUpperCase()} account. Available: ₹${selectedAccount.balance.toLocaleString('en-IN')}, Requested: ₹${numAmount.toLocaleString('en-IN')}`
      );
      return;
    }

    if (!confirmCash) {
      setFormError('You must explicitly confirm that cash has been handed over to the customer');
      return;
    }

    setSubmitting(true);
    setFormError('');

    try {
      const idempotencyKey = `CW-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const res = await api.createCashWithdrawal({
        accountId: selectedAccount.accountId,
        amount: numAmount,
        confirmCashHandedOver: true,
        remarks,
        branch: selectedAccount.branch,
        idempotencyKey,
      });

      const receipt = res?.receipt;
      if (receipt) {
        setActiveReceipt(receipt);
        setShowReceiptModal(true);
        if (onToast) onToast(res?.message || 'Cash withdrawal processed successfully!');
        // Reset withdrawal form & reload history
        handleClearSelection();
        setPage(1);
        await loadWithdrawalHistory(1, limit);
      } else {
        setFormError(res?.message || 'Cash withdrawal processed, but receipt details were missing.');
      }
    } catch (err) {
      setFormError(err.message || 'Failed to process cash withdrawal');
    } finally {
      setSubmitting(false);
    }
  };

  const handleViewReceipt = async (receiptNumber) => {
    try {
      const receipt = await api.fetchCashWithdrawalReceipt(receiptNumber);
      if (receipt) {
        setActiveReceipt(receipt);
        setShowReceiptModal(true);
      } else {
        if (onToast) onToast('Receipt details could not be found.');
      }
    } catch (err) {
      if (onToast) onToast(err.message || 'Could not fetch receipt');
    }
  };

  const handlePrintReceipt = () => {
    window.print();
  };

  return (
    <div className="cash-deposit-page">
      {/* Header Banner */}
      <div className="panel" style={{ marginBottom: '20px', background: 'linear-gradient(135deg, #3b1d52 0%, #1e112a 100%)', color: 'white' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <span style={{ fontSize: '11px', color: '#c9c3da', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Branch Operations • Counter Desk
            </span>
            <h2 style={{ fontSize: '20px', margin: '4px 0', color: '#ffffff' }}>
              Offline Cash Withdrawal Counter
            </h2>
            <p style={{ fontSize: '12px', color: '#e9e4f0', margin: 0 }}>
              Verify customer account & available balance, disburse cash at counter, debit balance, and issue withdrawal receipt.
            </p>
          </div>
          <div style={{ padding: '8px 14px', borderRadius: '8px', backgroundColor: 'rgba(255,255,255,0.1)', textAlign: 'right' }}>
            <div style={{ fontSize: '10px', color: '#c9c3da' }}>Counter Limit</div>
            <div style={{ fontSize: '14px', fontWeight: 700, color: '#f3a0a0' }}>₹1 to ₹2,00,000 per withdrawal</div>
          </div>
        </div>
      </div>

      <div className="grid-2" style={{ gridTemplateColumns: '1.2fr 1fr', gap: '20px' }}>
        {/* LEFT COLUMN: Customer Search & Withdrawal Form */}
        <div>
          {/* STEP 1: Search & Verify Customer Account */}
          <div className="panel">
            <div className="panel-head">
              <span className="panel-title">1. Search & Verify Customer Account</span>
              {selectedAccount && (
                <button onClick={handleClearSelection} className="panel-link">
                  Change Account
                </button>
              )}
            </div>

            {!selectedAccount ? (
              <div>
                <form onSubmit={handleSearch} style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
                  <input
                    type="text"
                    className="field"
                    placeholder="Enter Account #, Name, Phone or Email..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                  <button type="submit" className="btn" disabled={searching}>
                    {searching ? 'Searching...' : 'Search'}
                  </button>
                </form>

                {searchError && <div className="error-banner" style={{ marginBottom: '12px' }}>{searchError}</div>}

                {searchResults.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {searchResults.map((acc) => (
                      <div
                        key={acc.accountId}
                        style={{
                          padding: '12px 14px',
                          borderRadius: '8px',
                          border: acc.eligible ? '1px solid #e0d9ec' : '1px solid #f2c7c7',
                          backgroundColor: acc.eligible ? '#faf8fc' : '#fcf5f5',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                        }}
                      >
                        <div>
                          <div style={{ fontWeight: 700, fontSize: '14px', color: '#241531', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            {acc.holder?.name}
                            <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', backgroundColor: '#e9e4f0', color: '#3b2053', fontWeight: 700 }}>
                              {acc.accountType?.toUpperCase()}
                            </span>
                          </div>
                          <div style={{ fontSize: '12px', color: '#685e75', marginTop: '2px' }}>
                            Account: <strong>{acc.accountNumber}</strong> • {acc.holder?.phone}
                          </div>
                          <div style={{ fontSize: '12px', color: '#3b2053', fontWeight: 700, marginTop: '4px' }}>
                            Available Balance: ₹{(acc.balance || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </div>
                        </div>

                        <div>
                          {acc.eligible ? (
                            <button onClick={() => handleSelectAccount(acc)} className="btn btn-sm">
                              Select Account
                            </button>
                          ) : (
                            <span className="badge badge-red" title={acc.ineligibleReason}>
                              Ineligible
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              /* Account Selected Card */
              <div style={{ padding: '14px', borderRadius: '8px', backgroundColor: '#FAF5FF', border: '1px solid #8B5CF6' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                  <div>
                    <span style={{ fontSize: '11px', color: '#685e75', fontWeight: 700, textTransform: 'uppercase' }}>Selected Customer Account</span>
                    <h3 style={{ fontSize: '17px', margin: '2px 0 0 0', color: '#241531' }}>{selectedAccount.holder?.name}</h3>
                  </div>
                  <span className="badge badge-green">KYC Verified ✓</span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '12px', color: '#4b4355', marginTop: '8px' }}>
                  <div>Account #: <strong>{selectedAccount.accountNumber}</strong></div>
                  <div>Type: <strong style={{ textTransform: 'uppercase' }}>{selectedAccount.accountType}</strong></div>
                  <div>Phone: <strong>{selectedAccount.holder?.phone}</strong></div>
                  <div>Branch: <strong>{selectedAccount.branch}</strong></div>
                </div>

                <div style={{ marginTop: '12px', padding: '10px 14px', borderRadius: '8px', backgroundColor: '#ffffff', border: '1px solid #e0d9ec', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '12px', color: '#685e75', fontWeight: 600 }}>Current Available Balance:</span>
                  <span style={{ fontSize: '18px', fontWeight: 800, color: '#5C187B' }}>
                    ₹{Number(selectedAccount.balance || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* STEP 2: Cash Withdrawal Details & Handout Confirmation */}
          {selectedAccount && (
            <div className="panel" style={{ marginTop: '16px' }}>
              <div className="panel-head">
                <span className="panel-title">2. Enter Cash Amount & Handout Confirmation</span>
              </div>

              {formError && <div className="error-banner" style={{ marginBottom: '14px' }}>{formError}</div>}

              <form onSubmit={handleProcessWithdrawal}>
                <div className="form-group">
                  <label className="field-label">Withdrawal Amount (₹)</label>
                  <input
                    type="number"
                    className="field"
                    placeholder="Enter amount to disburse e.g. 2000"
                    min="1"
                    step="0.01"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    required
                    style={{ fontSize: '16px', fontWeight: 700 }}
                  />

                  {/* Preset Amount Helpers */}
                  <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
                    {[500, 1000, 2000, 5000].map((val) => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => handlePresetAmount(val)}
                        className="btn btn-sm btn-ghost"
                        style={{ fontSize: '11px' }}
                      >
                        +₹{val}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => setAmount(String(selectedAccount.balance))}
                      className="btn btn-sm btn-ghost"
                      style={{ fontSize: '11px', color: '#5C187B', fontWeight: 700 }}
                    >
                      Max (Full Balance)
                    </button>
                  </div>
                </div>

                <div className="form-group">
                  <label className="field-label">Remarks / Disburse Note (Optional)</label>
                  <input
                    type="text"
                    className="field"
                    placeholder="e.g. Counter cash withdrawal request"
                    value={remarks}
                    onChange={(e) => setRemarks(e.target.value)}
                  />
                </div>

                <div className="form-group" style={{ backgroundColor: '#fff5f5', padding: '12px', borderRadius: '8px', border: '1px solid #f2c7c7' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontSize: '13px', color: '#9b2c2c', fontWeight: 600 }}>
                    <input
                      type="checkbox"
                      checked={confirmCash}
                      onChange={(e) => setConfirmCash(e.target.checked)}
                      style={{ width: '18px', height: '18px' }}
                    />
                    I confirm that cash of ₹{amount || '0'} has been counted and handed over to customer {selectedAccount.holder?.name}.
                  </label>
                </div>

                <button
                  type="submit"
                  className="btn"
                  style={{ width: '100%', padding: '12px', fontSize: '14px', marginTop: '8px', backgroundColor: '#3b1d52' }}
                  disabled={submitting}
                >
                  {submitting ? 'Processing Debit...' : 'Process Cash Withdrawal & Debit Account'}
                </button>
              </form>
            </div>
          )}
        </div>

        {/* RIGHT COLUMN: Recent Counter Cash Withdrawals List */}
        <div>
          <div className="panel">
            <div className="panel-head">
              <span className="panel-title">Recent Counter Cash Withdrawals</span>
              <button onClick={() => loadWithdrawalHistory(page, limit)} className="panel-link">
                Refresh
              </button>
            </div>

            {historyLoading ? (
              <div className="loading-panel">Loading withdrawal records...</div>
            ) : history.length > 0 ? (
              <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {history.map((t) => (
                    <div
                      key={t.transactionId || t.receiptNumber}
                      style={{
                        padding: '12px',
                        borderRadius: '8px',
                        border: '1px solid #e0d9ec',
                        backgroundColor: '#ffffff',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '13px', color: '#241531' }}>
                          {t.customerName || 'Customer'}
                        </div>
                        <div style={{ fontSize: '11px', color: '#685e75' }}>
                          {t.accountNumber} • Ref: {t.receiptNumber}
                        </div>
                        <div style={{ fontSize: '10px', color: '#9a90a8', marginTop: '2px' }}>
                          {new Date(t.timestamp).toLocaleString()}
                        </div>
                      </div>

                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontWeight: 800, fontSize: '14px', color: '#b23a2e' }}>
                          -₹{Number(t.amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </div>
                        <button
                          onClick={() => handleViewReceipt(t.receiptNumber)}
                          className="panel-link"
                          style={{ fontSize: '11px', marginTop: '4px' }}
                        >
                          View Receipt
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                {pagination && (
                  <Pagination
                    pagination={pagination}
                    page={page}
                    limit={limit}
                    onPageChange={setPage}
                    onLimitChange={setLimit}
                    limitOptions={[5, 10, 20]}
                    itemLabel="withdrawals"
                    compact={true}
                  />
                )}
              </>
            ) : (
              <div style={{ textAlign: 'center', padding: '30px', color: '#9a90a8', fontSize: '13px' }}>
                No recent counter cash withdrawals recorded.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* RECEIPT MODAL */}
      {showReceiptModal && activeReceipt && (
        <div className="modal-overlay">
          <div className="modal-container" style={{ maxWidth: '460px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '18px', margin: 0, color: '#241531' }}>
                Cash Withdrawal Receipt
              </h3>
              <button onClick={() => setShowReceiptModal(false)} className="panel-link">
                Close
              </button>
            </div>

            <div style={{ textAlign: 'center', padding: '16px', backgroundColor: '#fff5f5', borderRadius: '12px', border: '1px solid #f2c7c7', marginBottom: '16px' }}>
              <span style={{ fontSize: '11px', color: '#685e75', textTransform: 'uppercase', fontWeight: 600 }}>Amount Disbursed</span>
              <div style={{ fontSize: '32px', fontWeight: 800, color: '#b23a2e', margin: '4px 0' }}>
                -₹{Number(activeReceipt.amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </div>
              <span className="badge badge-green">
                Status: {activeReceipt.status?.toUpperCase() || 'COMPLETED'} ✓
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px', color: '#4b4355' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px dashed #e0d9ec', paddingBottom: '6px' }}>
                <span>Receipt Number:</span>
                <strong style={{ color: '#5C187B' }}>{activeReceipt.receiptNumber}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px dashed #e0d9ec', paddingBottom: '6px' }}>
                <span>Customer Name:</span>
                <strong>{activeReceipt.customerName || 'Customer'}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px dashed #e0d9ec', paddingBottom: '6px' }}>
                <span>Account Number:</span>
                <strong>{activeReceipt.accountNumber}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px dashed #e0d9ec', paddingBottom: '6px' }}>
                <span>Payment Method:</span>
                <strong>CASH (Counter Disbursal)</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px dashed #e0d9ec', paddingBottom: '6px' }}>
                <span>Previous Balance:</span>
                <span>₹{Number(activeReceipt.previousBalance || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px dashed #e0d9ec', paddingBottom: '6px' }}>
                <span>Updated Balance:</span>
                <strong style={{ color: '#5C187B' }}>
                  ₹{Number(activeReceipt.updatedBalance || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px dashed #e0d9ec', paddingBottom: '6px' }}>
                <span>Branch Desk:</span>
                <span>{activeReceipt.branch || 'Kochi Main'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '6px' }}>
                <span>Timestamp:</span>
                <span>{new Date(activeReceipt.timestamp || Date.now()).toLocaleString()}</span>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '8px', marginTop: '20px' }}>
              <button
                onClick={handleDownloadPdf}
                disabled={downloadingPdf}
                className="btn"
                style={{ flex: 1.2, backgroundColor: '#5B2E91', color: '#ffffff' }}
              >
                {downloadingPdf ? 'Downloading...' : '📄 Download PDF'}
              </button>
              <button onClick={handlePrintReceipt} className="btn btn-ghost" style={{ flex: 1 }}>
                Print
              </button>
              <button onClick={() => setShowReceiptModal(false)} className="btn btn-ghost" style={{ flex: 1 }}>
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
