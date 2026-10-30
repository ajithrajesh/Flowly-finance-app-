import React, { useState, useEffect, useCallback } from 'react';
import * as api from '../api';
import Pagination from './Pagination';

export default function CashDeposit({ onToast }) {
  // Search & account selection state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');

  const [selectedAccount, setSelectedAccount] = useState(null);

  // Deposit Form state
  const [amount, setAmount] = useState('');
  const [remarks, setRemarks] = useState('');
  const [confirmCash, setConfirmCash] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  // Receipt & History modal state
  const [activeReceipt, setActiveReceipt] = useState(null);
  const [showReceiptModal, setShowReceiptModal] = useState(false);

  // Recent deposits list
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [pagination, setPagination] = useState(null);

  const loadDepositHistory = useCallback(async (p = 1, l = 10) => {
    setHistoryLoading(true);
    try {
      const data = await api.fetchCashDeposits({ page: p, limit: l });
      setHistory(data?.deposits || []);
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
      console.error('Failed to load deposit history:', err);
      if (onToast) onToast(err.message || 'Failed to load deposit history');
    } finally {
      setHistoryLoading(false);
    }
  }, [onToast]);

  useEffect(() => {
    loadDepositHistory(page, limit);
  }, [page, limit, loadDepositHistory]);

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
      const accounts = await api.searchCashDepositAccounts(q);
      setSearchResults(accounts);
      if (accounts.length === 0) {
        setSearchError('No matching Savings account found');
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

  const handleProcessDeposit = async (e) => {
    e.preventDefault();
    if (!selectedAccount) {
      setFormError('Please select a verified customer savings account');
      return;
    }

    const numAmount = Number(amount);
    if (!numAmount || numAmount <= 0) {
      setFormError('Please enter a valid deposit amount greater than ₹0');
      return;
    }

    if (!confirmCash) {
      setFormError('You must explicitly confirm receipt of cash from customer');
      return;
    }

    setSubmitting(true);
    setFormError('');

    try {
      const idempotencyKey = `CD-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const res = await api.createCashDeposit({
        accountId: selectedAccount.accountId,
        amount: numAmount,
        confirmCashReceived: true,
        remarks,
        branch: selectedAccount.branch,
        idempotencyKey,
      });

      const receipt = res?.receipt;
      if (receipt) {
        setActiveReceipt(receipt);
        setShowReceiptModal(true);
        if (onToast) onToast(res?.message || 'Cash deposit processed successfully!');
        // Reset deposit form
        handleClearSelection();
        setPage(1);
        await loadDepositHistory(1, limit);
      } else {
        setFormError(res?.message || 'Cash deposit processed, but receipt details were missing.');
      }
    } catch (err) {
      setFormError(err.message || 'Failed to process cash deposit');
    } finally {
      setSubmitting(false);
    }
  };

  const handleViewReceipt = async (receiptNumber) => {
    try {
      const receipt = await api.fetchCashDepositReceipt(receiptNumber);
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
      <div className="panel" style={{ marginBottom: '20px', background: 'linear-gradient(135deg, #241531 0%, #3b2053 100%)', color: 'white' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <span style={{ fontSize: '11px', color: '#c9c3da', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Branch Operations • Counter Desk
            </span>
            <h2 style={{ fontSize: '20px', margin: '4px 0', color: '#ffffff' }}>
              Offline Cash Deposit System
            </h2>
            <p style={{ fontSize: '12px', color: '#e9e4f0', margin: 0 }}>
              Accept cash from customer, verify Savings account, credit balance, and generate immediate transaction receipt.
            </p>
          </div>
          <div style={{ padding: '8px 14px', borderRadius: '8px', backgroundColor: 'rgba(255,255,255,0.1)', textAlign: 'right' }}>
            <div style={{ fontSize: '10px', color: '#c9c3da' }}>Counter Limit</div>
            <div style={{ fontSize: '14px', fontWeight: 700, color: '#7cd68a' }}>₹1 to ₹2,00,000 per deposit</div>
          </div>
        </div>
      </div>

      <div className="grid-2" style={{ gridTemplateColumns: '1.2fr 1fr', gap: '20px' }}>
        {/* LEFT COLUMN: Customer Search & Deposit Form */}
        <div>
          {/* STEP 1: Search & Verify Customer Account */}
          <div className="panel">
            <div className="panel-head">
              <span className="panel-title">1. Search & Verify Customer Savings Account</span>
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
                    placeholder="Enter Account # (e.g. AC-1029384), Name, Phone or Email..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                  <button type="submit" className="btn" disabled={searching}>
                    {searching ? 'Searching...' : 'Search'}
                  </button>
                </form>

                {searchError && <div className="field-error" style={{ marginBottom: '12px' }}>{searchError}</div>}

                {searchResults.length > 0 && (
                  <div>
                    <div style={{ fontSize: '11px', color: '#8b8880', marginBottom: '8px', fontWeight: 600 }}>
                      Select Customer Savings Account ({searchResults.length} found):
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {searchResults.map((acc) => (
                        <div
                          key={acc.accountId}
                          onClick={() => handleSelectAccount(acc)}
                          style={{
                            padding: '12px',
                            borderRadius: '8px',
                            border: acc.eligible ? '1px solid #d1d5db' : '1px solid #fca5a5',
                            backgroundColor: acc.eligible ? '#ffffff' : '#fef2f2',
                            cursor: acc.eligible ? 'pointer' : 'not-allowed',
                            transition: 'all 0.15s',
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div>
                              <div style={{ fontWeight: 700, fontSize: '13px', color: '#201530' }}>
                                {acc.holder.name}
                              </div>
                              <div style={{ fontSize: '11.5px', color: '#5c187b', fontWeight: 600 }}>
                                Account #: {acc.accountNumber}
                              </div>
                              <div style={{ fontSize: '10.5px', color: '#8b8880', marginTop: '2px' }}>
                                Branch: {acc.branch || 'Kochi'} • Phone: {acc.holder.phone || 'N/A'} • Email: {acc.holder.email || 'N/A'}
                              </div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                              <span className={`badge ${acc.eligible ? 'badge-green' : 'badge-red'}`}>
                                {acc.eligible ? 'Verified Savings ✓' : 'Ineligible'}
                              </span>
                              <div style={{ fontSize: '11.5px', fontWeight: 700, color: '#201530', marginTop: '4px' }}>
                                Bal: ₹{Number(acc.balance || 0).toLocaleString('en-IN')}
                              </div>
                            </div>
                          </div>
                          {!acc.eligible && (
                            <div style={{ fontSize: '10.5px', color: '#b23a2e', marginTop: '6px', fontWeight: 600 }}>
                              ⚠ {acc.ineligibleReason}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* Selected Verified Customer Card */
              <div style={{ padding: '14px', borderRadius: '10px', backgroundColor: '#f9f5ff', border: '1px solid #d8b4fe' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                  <div>
                    <span className="badge badge-purple" style={{ marginBottom: '4px' }}>Verified Savings Account</span>
                    <h3 style={{ fontSize: '16px', margin: '2px 0 0 0', color: '#201530' }}>{selectedAccount.holder.name}</h3>
                  </div>
                  <button onClick={handleClearSelection} className="btn-ghost" style={{ fontSize: '11px', color: '#5c187b' }}>
                    ✕ Change
                  </button>
                </div>

                <div className="kv-row">
                  <span className="k">Account Number</span>
                  <span className="v" style={{ color: '#5c187b' }}>{selectedAccount.accountNumber}</span>
                </div>
                <div className="kv-row">
                  <span className="k">Account Type</span>
                  <span className="v" style={{ textTransform: 'capitalize' }}>{selectedAccount.accountType}</span>
                </div>
                <div className="kv-row">
                  <span className="k">Current Account Balance</span>
                  <span className="v" style={{ color: '#2e7a22', fontSize: '14px' }}>
                    ₹{Number(selectedAccount.balance || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="kv-row">
                  <span className="k">Branch & IFSC</span>
                  <span className="v">{selectedAccount.branch || 'Kochi'} ({selectedAccount.ifscCode || 'FLOW0001001'})</span>
                </div>
                <div className="kv-row">
                  <span className="k">Customer KYC Status</span>
                  <span className="v" style={{ color: '#2e7a22' }}>{selectedAccount.holder.kycStatus || 'verified'} ✓</span>
                </div>
              </div>
            )}
          </div>

          {/* STEP 2: Enter Deposit Amount & Confirm Cash */}
          <div className="panel">
            <div className="panel-head">
              <span className="panel-title">2. Cash Receipt & Deposit Details</span>
            </div>

            <form onSubmit={handleProcessDeposit}>
              <div className="field-group">
                <label className="field-label">Deposit Amount (₹) *</label>
                <input
                  type="number"
                  className="field"
                  placeholder="Enter cash deposit amount..."
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  min="1"
                  max="200000"
                  step="any"
                  disabled={!selectedAccount || submitting}
                  required
                />
              </div>

              {/* Quick Preset Amount Chips */}
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '14px' }}>
                <span style={{ fontSize: '10.5px', color: '#8b8880', alignSelf: 'center', marginRight: '4px' }}>Quick Add:</span>
                {[500, 1000, 5000, 10000, 50000].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    className="btn-outline"
                    style={{ padding: '3px 8px', fontSize: '10.5px' }}
                    onClick={() => handlePresetAmount(preset)}
                    disabled={!selectedAccount || submitting}
                  >
                    +₹{preset.toLocaleString()}
                  </button>
                ))}
              </div>

              <div className="field-group">
                <label className="field-label">Remarks / Deposit Note (Optional)</label>
                <input
                  type="text"
                  className="field"
                  placeholder="e.g. Branch cash deposit counter 2"
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  maxLength={250}
                  disabled={!selectedAccount || submitting}
                />
              </div>

              {/* Cash Received Verification Checkbox */}
              <div
                style={{
                  padding: '12px',
                  borderRadius: '8px',
                  backgroundColor: confirmCash ? '#f0fdf4' : '#fffbe6',
                  border: confirmCash ? '1px solid #86efac' : '1px solid #ffe58f',
                  marginBottom: '16px',
                }}
              >
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={confirmCash}
                    onChange={(e) => setConfirmCash(e.target.checked)}
                    disabled={!selectedAccount || submitting}
                    style={{ marginTop: '3px', width: '16px', height: '16px', accentColor: '#5c187b' }}
                  />
                  <span style={{ fontSize: '11.5px', color: '#201530', fontWeight: 600, lineHeight: '1.4' }}>
                    I confirm that physical cash of{' '}
                    <strong style={{ color: '#5c187b' }}>
                      ₹{Number(amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </strong>{' '}
                    has been collected, counted, and verified from customer {selectedAccount ? selectedAccount.holder.name : ''}.
                  </span>
                </label>
              </div>

              {formError && <div className="field-error" style={{ marginBottom: '14px' }}>⚠ {formError}</div>}

              <button
                type="submit"
                className="btn"
                style={{ width: '100%', padding: '12px', fontSize: '13px' }}
                disabled={!selectedAccount || !confirmCash || !amount || submitting}
              >
                {submitting ? 'Processing CASH_DEPOSIT Transaction...' : 'Confirm Cash Receipt & Process Deposit'}
              </button>
            </form>
          </div>
        </div>

        {/* RIGHT COLUMN: Recent Branch Cash Deposits Log */}
        <div>
          <div className="panel">
            <div className="panel-head">
              <span className="panel-title">Recent Branch Cash Deposits Log</span>
              <button onClick={() => loadDepositHistory(page, limit)} className="panel-link">
                Refresh
              </button>
            </div>

            {historyLoading ? (
              <div className="loading-panel">Loading transaction log...</div>
            ) : history.length === 0 ? (
              <div style={{ textTransform: 'none', color: '#8b8880', fontSize: '12px', textAlign: 'center', padding: '24px 0' }}>
                No cash deposits recorded yet today.
              </div>
            ) : (
              <div>
                <div style={{ overflowX: 'auto' }}>
                  <table>
                    <thead>
                      <tr>
                        <th>Receipt # / Account</th>
                        <th>Amount</th>
                        <th>Status</th>
                        <th style={{ textAlign: 'right' }}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.map((dep) => (
                        <tr key={dep.receiptNumber || dep.transactionId}>
                          <td>
                            <div style={{ fontWeight: 700, fontSize: '11.5px', color: '#5c187b' }}>
                              {dep.receiptNumber}
                            </div>
                            <div style={{ fontSize: '10px', color: '#8b8880' }}>
                              Acc: {dep.account?.accountNumber || dep.accountNumber || '—'}
                            </div>
                          </td>
                          <td>
                            <div style={{ fontWeight: 700, color: '#2e7a22', fontSize: '12px' }}>
                              +₹{dep.amount?.toLocaleString('en-IN')}
                            </div>
                            <div style={{ fontSize: '9.5px', color: '#8b8880' }}>
                              {new Date(dep.completedAt || dep.timestamp || dep.initiatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </div>
                          </td>
                          <td>
                            <span className="badge badge-green">COMPLETED</span>
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <button
                              onClick={() => handleViewReceipt(dep.receiptNumber)}
                              className="btn-outline btn-sm"
                            >
                              View Receipt
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {pagination && (
                  <Pagination
                    pagination={pagination}
                    page={page}
                    limit={limit}
                    onPageChange={setPage}
                    onLimitChange={setLimit}
                    limitOptions={[5, 10, 20]}
                    itemLabel="deposits"
                    compact={true}
                  />
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* RECEIPT MODAL */}
      {showReceiptModal && activeReceipt && (
        <div className="modal-overlay open">
          <div className="modal-box" style={{ width: '480px', maxWidth: '95vw' }}>
            {/* Printable Receipt Area */}
            <div id="printable-receipt-card" style={{ padding: '8px' }}>
              <div style={{ textAlign: 'center', paddingBottom: '12px', borderBottom: '1px dashed #cfccc2', marginBottom: '12px' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '8px', backgroundColor: '#5c187b', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 6px auto', fontWeight: 800 }}>
                  F
                </div>
                <h3 style={{ margin: 0, fontSize: '16px', color: '#201530' }}>FLOWLY FINANCE BANK</h3>
                <div style={{ fontSize: '11px', color: '#8b8880' }}>Official Offline Cash Deposit Receipt</div>
                <div style={{ fontSize: '10px', color: '#2e7a22', fontWeight: 700, marginTop: '4px' }}>
                  ✓ TRANSACTION COMPLETED & BALANCE UPDATED
                </div>
              </div>

              <div style={{ backgroundColor: '#f9f8f5', padding: '12px', borderRadius: '8px', marginBottom: '14px' }}>
                <div style={{ fontSize: '11px', color: '#8b8880', textAlign: 'center' }}>DEPOSIT AMOUNT</div>
                <div style={{ fontSize: '28px', fontWeight: 800, color: '#2e7a22', textAlign: 'center', margin: '2px 0 6px 0' }}>
                  ₹{Number(activeReceipt.amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </div>
                <div style={{ fontSize: '10.5px', color: '#5c187b', textAlign: 'center', fontWeight: 600 }}>
                  Transaction Type: CASH_DEPOSIT
                </div>
              </div>

              <div className="kv-row">
                <span className="k">Receipt Number</span>
                <span className="v" style={{ color: '#5c187b' }}>{activeReceipt.receiptNumber}</span>
              </div>
              <div className="kv-row">
                <span className="k">Transaction ID</span>
                <span className="v" style={{ fontSize: '10.5px' }}>{activeReceipt.transactionId}</span>
              </div>
              <div className="kv-row">
                <span className="k">Account Number</span>
                <span className="v">{activeReceipt.accountNumber || activeReceipt.account?.accountNumber}</span>
              </div>
              <div className="kv-row">
                <span className="k">Customer Name</span>
                <span className="v">{activeReceipt.customerName || 'Account Holder'}</span>
              </div>
              <div className="kv-row">
                <span className="k">Payment Method</span>
                <span className="v">CASH (Counter Hand-over)</span>
              </div>
              <div className="kv-row">
                <span className="k">Previous Account Balance</span>
                <span className="v">₹{Number(activeReceipt.previousBalance || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="kv-row">
                <span className="k">Updated Account Balance</span>
                <span className="v" style={{ color: '#2e7a22', fontSize: '13px' }}>
                  ₹{Number(activeReceipt.updatedBalance || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="kv-row">
                <span className="k">Processed By (Worker ID)</span>
                <span className="v">{activeReceipt.processedBy?.name || activeReceipt.workerId || 'Worker Counter'}</span>
              </div>
              <div className="kv-row">
                <span className="k">Branch Location</span>
                <span className="v">{activeReceipt.branch || 'Kochi Branch'}</span>
              </div>
              <div className="kv-row">
                <span className="k">Status & Timestamp</span>
                <span className="v" style={{ color: '#2e7a22' }}>
                  COMPLETED • {new Date(activeReceipt.timestamp || activeReceipt.completedAt || Date.now()).toLocaleString()}
                </span>
              </div>
              {activeReceipt.remarks && (
                <div className="kv-row">
                  <span className="k">Remarks</span>
                  <span className="v">{activeReceipt.remarks}</span>
                </div>
              )}
            </div>

            <div className="modal-actions" style={{ marginTop: '16px' }}>
              <button onClick={handlePrintReceipt} className="btn-outline">
                🖨 Print / Save Receipt
              </button>
              <button onClick={() => setShowReceiptModal(false)} className="btn">
                Close & Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
