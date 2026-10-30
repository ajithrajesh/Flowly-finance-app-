import React, { useState, useEffect, useCallback } from 'react';
import * as api from '../api';
import Icon from './Icon';
import Pagination from './Pagination';

export default function EmiCollections({ onToast, worker }) {
  const [loans, setLoans] = useState([]);
  const [stats, setStats] = useState({
    totalLoans: 0,
    totalActiveLoans: 0,
    totalClosedLoans: 0,
    totalOverdueLoans: 0,
    totalDisbursed: 0,
    totalCollected: 0,
    totalOutstanding: 0,
    totalOverdueAmount: 0,
    collectionRate: 100,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [pagination, setPagination] = useState(null);

  // Filters & Search
  const [activeTab, setActiveTab] = useState('all'); // 'all' | 'overdue' | 'active' | 'closed'
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('nextDue'); // 'nextDue' | 'overdue' | 'amount'

  // Selected Loan for Detail Drawer / Modal
  const [selectedLoan, setSelectedLoan] = useState(null);
  const [detailTab, setDetailTab] = useState('schedule'); // 'schedule' | 'recovery' | 'info'

  // Collect Payment Modal State
  const [collectModal, setCollectModal] = useState(null); // { loan, installment }
  const [collectForm, setCollectForm] = useState({
    amountPaid: '',
    paymentMethod: 'cash',
    receiptNumber: '',
    note: '',
  });
  const [collectSubmitting, setCollectSubmitting] = useState(false);

  // Recovery Log Modal State
  const [recoveryModal, setRecoveryModal] = useState(null); // loan object
  const [recoveryForm, setRecoveryForm] = useState({
    followupType: 'call_made',
    promisedPaymentDate: '',
    notes: '',
  });
  const [recoverySubmitting, setRecoverySubmitting] = useState(false);

  // NOC Preview Modal State
  const [nocModal, setNocModal] = useState(null);

  // Load Collections Data
  const loadCollections = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api.fetchCollectionsOverview({
        status: activeTab,
        search: searchTerm,
        page,
        limit,
        sortBy,
      });

      if (data && data.success) {
        setLoans(data.loans || []);
        setPagination(data.pagination || null);
        if (data.stats) {
          setStats(data.stats);
        }
      } else {
        // Fallback to loan applications + overdue if backend collections endpoint fails
        const [appsRes, overdueRes] = await Promise.all([
          api.fetchLoanApplications({ page, limit }).catch(() => ({ applications: [] })),
          api.fetchOverdueLoans({ page, limit }).catch(() => ({ loans: [] })),
        ]);
        const allApps = appsRes.applications || [];
        setLoans(allApps.filter((a) => ['disbursed', 'active', 'closed', 'approved'].includes(a.status)));
        setPagination(appsRes.pagination || null);
      }
    } catch (err) {
      console.error('Failed to load collections:', err);
      setError(err.message || 'Could not load EMI & collections data');
    } finally {
      setLoading(false);
    }
  }, [activeTab, searchTerm, page, limit, sortBy]);

  useEffect(() => {
    loadCollections();
  }, [loadCollections]);

  // Handle opening Schedule Detail
  const handleOpenSchedule = async (loan) => {
    try {
      // Fetch fresh schedule if possible
      const freshLoan = await api.fetchLoanSchedule(loan._id || loan.id);
      setSelectedLoan(freshLoan || loan);
    } catch {
      setSelectedLoan(loan);
    }
    setDetailTab('schedule');
  };

  // Open Collect Payment Modal
  const handleOpenCollect = (loan, inst = null) => {
    const defaultInst = inst || (loan.repayments || []).find((r) => r.status !== 'paid') || (loan.repayments || [])[0];
    if (!defaultInst) {
      onToast?.('No unpaid installment found for this loan.');
      return;
    }
    const dueAmount = (defaultInst.emiAmount || 0) + (defaultInst.lateFee || 0) - (defaultInst.paidAmount || 0);

    setCollectModal({ loan, installment: defaultInst });
    setCollectForm({
      amountPaid: dueAmount > 0 ? String(dueAmount) : String(defaultInst.emiAmount || 0),
      paymentMethod: 'cash',
      receiptNumber: `RCPT-${Date.now().toString().slice(-6)}`,
      note: `Counter collection by staff (${worker?.name || 'Officer'})`,
    });
  };

  // Submit Collect Payment
  const handleSubmitCollect = async (e) => {
    e.preventDefault();
    if (!collectModal?.loan?._id || !collectModal?.installment?.installmentNo) return;

    const amount = Number(collectForm.amountPaid);
    if (!amount || amount <= 0) {
      onToast?.('Please enter a valid positive payment amount');
      return;
    }

    setCollectSubmitting(true);
    try {
      const res = await api.markEmiPaidManually(
        collectModal.loan._id,
        collectModal.installment.installmentNo,
        {
          amountPaid: amount,
          paymentMethod: collectForm.paymentMethod,
          receiptNumber: collectForm.receiptNumber,
          note: collectForm.note,
        }
      );

      onToast?.(`✓ Successfully collected ₹${amount.toLocaleString('en-IN')} for Installment #${collectModal.installment.installmentNo}`);
      setCollectModal(null);
      await loadCollections();

      // Refresh opened drawer if currently viewing this loan
      if (selectedLoan && (selectedLoan._id === collectModal.loan._id || selectedLoan.id === collectModal.loan._id)) {
        if (res.loan) {
          setSelectedLoan(res.loan);
        } else {
          const fresh = await api.fetchLoanSchedule(collectModal.loan._id);
          setSelectedLoan(fresh);
        }
      }
    } catch (err) {
      onToast?.(err.message || 'Payment collection failed');
    } finally {
      setCollectSubmitting(false);
    }
  };

  // Open Recovery Follow-Up Modal
  const handleOpenRecovery = (loan) => {
    setRecoveryModal(loan);
    setRecoveryForm({
      followupType: 'call_made',
      promisedPaymentDate: '',
      notes: '',
    });
  };

  // Submit Recovery Follow-Up
  const handleSubmitRecovery = async (e) => {
    e.preventDefault();
    if (!recoveryModal?._id) return;

    if (!recoveryForm.notes.trim()) {
      onToast?.('Please write details about the borrower conversation/visit.');
      return;
    }

    setRecoverySubmitting(true);
    try {
      await api.recordRecoveryFollowup(recoveryModal._id, {
        followupType: recoveryForm.followupType,
        promisedPaymentDate: recoveryForm.promisedPaymentDate || null,
        notes: recoveryForm.notes,
      });

      onToast?.('✓ Recovery follow-up log saved successfully');
      setRecoveryModal(null);
      await loadCollections();

      if (selectedLoan && selectedLoan._id === recoveryModal._id) {
        const fresh = await api.fetchLoanSchedule(recoveryModal._id);
        setSelectedLoan(fresh);
      }
    } catch (err) {
      onToast?.(err.message || 'Failed to record recovery follow-up');
    } finally {
      setRecoverySubmitting(false);
    }
  };

  // Open NOC Certificate Modal
  const handleOpenNoc = (loan) => {
    setNocModal(loan);
  };

  // Sorted list of loans
  const sortedLoans = [...loans].sort((a, b) => {
    if (sortBy === 'overdue') {
      const aOverdue = (a.summary?.overdueCount || 0) + (a.overdueInstallments || 0);
      const bOverdue = (b.summary?.overdueCount || 0) + (b.overdueInstallments || 0);
      return bOverdue - aOverdue;
    }
    if (sortBy === 'amount') {
      return (b.principal || 0) - (a.principal || 0);
    }
    // Default: Next Due Date
    const aDate = a.nextDueDate ? new Date(a.nextDueDate).getTime() : Infinity;
    const bDate = b.nextDueDate ? new Date(b.nextDueDate).getTime() : Infinity;
    return aDate - bDate;
  });

  return (
    <div className="flex-1 overflow-y-auto p-6 bg-[#f8fafc] text-ink">
      
      {/* 1. Header Banner */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="flex size-10 items-center justify-center rounded-xl bg-linear-to-br from-brand to-accent text-white shadow-xs">
              <Icon name="calendar" size={20} />
            </div>
            <div>
              <h1 className="font-heading text-xl font-extrabold text-ink tracking-tight">
                EMI Schedules, Collections & Recovery Desk
              </h1>
              <p className="text-xs text-muted">
                Monitor borrower repayment schedules, record offline counter payments, and manage recovery follow-up logs.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={loadCollections}
            disabled={loading}
            className="btn-secondary h-9 px-3.5 text-xs font-semibold flex items-center gap-1.5"
            title="Refresh Collections Data"
          >
            <span>🔄</span> {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* 2. Top Portfolio Metrics Row */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        
        {/* Total Portfolio Disbursed */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs font-bold text-slate-500 uppercase tracking-wider">
            <span>Portfolio Disbursed</span>
            <div className="flex size-7 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
              <Icon name="landmark" size={15} />
            </div>
          </div>
          <div className="mt-2 text-2xl font-extrabold text-slate-900">
            ₹{Number(stats.totalDisbursed || 0).toLocaleString('en-IN')}
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
            <span className="font-semibold text-brand">{stats.totalLoans || loans.length} total loans</span>
            <span>·</span>
            <span>{stats.totalActiveLoans || 0} active</span>
          </div>
        </div>

        {/* Collections Received */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs font-bold text-slate-500 uppercase tracking-wider">
            <span>Total Collected</span>
            <div className="flex size-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
              <Icon name="deposit" size={15} />
            </div>
          </div>
          <div className="mt-2 text-2xl font-extrabold text-emerald-600">
            ₹{Number(stats.totalCollected || 0).toLocaleString('en-IN')}
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-xs text-emerald-700 font-semibold">
            <span>{stats.collectionRate || 100}% collection efficiency</span>
          </div>
        </div>

        {/* Total Outstanding Principal */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs font-bold text-slate-500 uppercase tracking-wider">
            <span>Outstanding Balance</span>
            <div className="flex size-7 items-center justify-center rounded-lg bg-sky-50 text-sky-600">
              <Icon name="chart" size={15} />
            </div>
          </div>
          <div className="mt-2 text-2xl font-extrabold text-slate-900">
            ₹{Number(stats.totalOutstanding || 0).toLocaleString('en-IN')}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            Across all running installment plans
          </div>
        </div>

        {/* Overdue Amount & At-Risk Accounts */}
        <div className="rounded-2xl border border-red-200 bg-linear-to-br from-red-50/60 to-white p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs font-bold text-red-600 uppercase tracking-wider">
            <span>Overdue Amount</span>
            <div className="flex size-7 items-center justify-center rounded-lg bg-red-100 text-red-600">
              <Icon name="alert" size={15} />
            </div>
          </div>
          <div className="mt-2 text-2xl font-extrabold text-red-600">
            ₹{Number(stats.totalOverdueAmount || 0).toLocaleString('en-IN')}
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-xs font-semibold text-red-700">
            <span>⚠️ {stats.totalOverdueLoans || 0} borrower accounts overdue</span>
          </div>
        </div>

      </div>

      {/* 3. Search & Filter Bar */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-xs">
        
        {/* Filter Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          <button
            type="button"
            onClick={() => { setActiveTab('all'); setPage(1); }}
            className={`rounded-xl px-3 py-1.5 text-xs font-bold transition-colors ${
              activeTab === 'all'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            All Portfolios ({stats.totalLoans || (pagination ? pagination.total : loans.length)})
          </button>

          <button
            type="button"
            onClick={() => { setActiveTab('overdue'); setPage(1); }}
            className={`flex items-center gap-1 rounded-xl px-3 py-1.5 text-xs font-bold transition-colors ${
              activeTab === 'overdue'
                ? 'bg-red-600 text-white shadow-xs'
                : 'text-red-700 hover:bg-red-50'
            }`}
          >
            <span>🚨 Overdue & At-Risk</span>
            <span className="rounded-full bg-white/20 px-1.5 text-[10px]">
              {stats.totalOverdueLoans || 0}
            </span>
          </button>

          <button
            type="button"
            onClick={() => { setActiveTab('active'); setPage(1); }}
            className={`rounded-xl px-3 py-1.5 text-xs font-bold transition-colors ${
              activeTab === 'active'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-emerald-700 hover:bg-emerald-50'
            }`}
          >
            🟢 Active & Regular ({stats.totalActiveLoans || 0})
          </button>

          <button
            type="button"
            onClick={() => { setActiveTab('closed'); setPage(1); }}
            className={`rounded-xl px-3 py-1.5 text-xs font-bold transition-colors ${
              activeTab === 'closed'
                ? 'bg-slate-700 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            ✅ Closed & NOC ({stats.totalClosedLoans || 0})
          </button>
        </div>

        {/* Search & Sort Controls */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative min-w-[220px]">
            <input
              type="text"
              placeholder="Search borrower, loan #, phone…"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setPage(1);
              }}
              className="w-full rounded-xl border border-slate-200 bg-slate-50/60 py-1.5 pr-8 pl-3 text-xs text-ink placeholder:text-muted focus:border-accent focus:bg-white focus:outline-none"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => {
                  setSearchTerm('');
                  setPage(1);
                }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            )}
          </div>

          <select
            value={sortBy}
            onChange={(e) => {
              setSortBy(e.target.value);
              setPage(1);
            }}
            className="rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 focus:border-accent focus:outline-none"
          >
            <option value="nextDue">Sort by: Next Due Date</option>
            <option value="overdue">Sort by: Highest Overdue</option>
            <option value="amount">Sort by: Loan Amount</option>
          </select>
        </div>

      </div>

      {/* 4. Loans Table / List */}
      {loading ? (
        <div className="flex h-64 flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white">
          <div className="spinner mb-3" />
          <p className="text-xs font-medium text-muted">Loading EMI portfolios & collection ledger…</p>
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-xs text-red-700">
          ⚠️ {error}
        </div>
      ) : sortedLoans.length === 0 ? (
        <div className="flex h-56 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white text-center p-6">
          <div className="mb-2 text-3xl">📂</div>
          <h3 className="font-heading text-sm font-bold text-ink">No loans match the selected criteria</h3>
          <p className="mt-1 text-xs text-muted">
            Try switching filter tabs or clearing your search query.
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  <th className="px-4 py-3.5">Borrower Details</th>
                  <th className="px-4 py-3.5">Loan / Type</th>
                  <th className="px-4 py-3.5">Principal & EMI</th>
                  <th className="px-4 py-3.5">Installment Progress</th>
                  <th className="px-4 py-3.5">Next Due / Status</th>
                  <th className="px-4 py-3.5">Balance</th>
                  <th className="px-4 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sortedLoans.map((loan) => {
                  const borrowerName = loan.user?.name || loan.personalInformation?.fullName || 'Borrower';
                  const borrowerPhone = loan.user?.phone || loan.personalInformation?.mobileNumber || '—';
                  const borrowerEmail = loan.user?.email || '—';
                  const isClosed = loan.status === 'closed';

                  const repayments = loan.repayments || [];
                  const totalInst = repayments.length;
                  const paidInst = repayments.filter((r) => r.status === 'paid').length;
                  const overdueInst = repayments.filter((r) => r.status === 'overdue').length;
                  const percent = totalInst > 0 ? Math.round((paidInst / totalInst) * 100) : 0;

                  const isOverdue = overdueInst > 0 || (loan.overdueInstallments || 0) > 0;
                  const nextDueFormatted = loan.nextDueDate
                    ? new Date(loan.nextDueDate).toLocaleDateString('en-IN', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })
                    : isClosed
                    ? 'Settled'
                    : 'N/A';

                  return (
                    <tr key={loan._id || loan.id} className="hover:bg-slate-50/60 transition-colors">
                      
                      {/* Borrower */}
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2.5">
                          <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-linear-to-br from-indigo-500 to-accent text-[11px] font-bold text-white">
                            {borrowerName.slice(0, 2).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <div className="font-bold text-slate-900 truncate">{borrowerName}</div>
                            <div className="text-[11px] text-slate-500 truncate">{borrowerPhone}</div>
                          </div>
                        </div>
                      </td>

                      {/* Loan Product */}
                      <td className="px-4 py-3.5">
                        <div className="font-semibold text-slate-800">{loan.applicationNumber || 'LN-APP'}</div>
                        <div className="text-[11px] text-slate-500">
                          {loan.loanType || loan.productName || 'Personal Loan'} · {loan.tenureMonths || 12}M @ {loan.interestRate || 12}%
                        </div>
                      </td>

                      {/* Principal & EMI */}
                      <td className="px-4 py-3.5">
                        <div className="font-bold text-slate-900">
                          ₹{Number(loan.principal || loan.requestedAmount || 0).toLocaleString('en-IN')}
                        </div>
                        <div className="text-[11px] font-semibold text-brand">
                          EMI: ₹{Number(loan.monthlyEMI || loan.emiAmount || 0).toLocaleString('en-IN')}/mo
                        </div>
                      </td>

                      {/* Installment Progress */}
                      <td className="px-4 py-3.5">
                        <div className="flex items-center justify-between text-[11px] mb-1">
                          <span className="font-bold text-slate-700">
                            {paidInst} of {totalInst} EMIs
                          </span>
                          <span className="font-semibold text-slate-500">{percent}%</span>
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-300 ${
                              isClosed
                                ? 'bg-emerald-500'
                                : isOverdue
                                ? 'bg-red-500'
                                : 'bg-brand'
                            }`}
                            style={{ width: `${percent}%` }}
                          />
                        </div>
                      </td>

                      {/* Next Due / Status */}
                      <td className="px-4 py-3.5">
                        {isClosed ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700">
                            <span>✓</span> Closed / Settled
                          </span>
                        ) : isOverdue ? (
                          <div className="inline-flex flex-col">
                            <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[10.5px] font-bold text-red-700">
                              <span>⚠️</span> {overdueInst || loan.overdueInstallments || 1} EMI Overdue
                            </span>
                            <span className="text-[10px] text-red-600 font-medium mt-0.5">
                              Due: {nextDueFormatted}
                            </span>
                          </div>
                        ) : (
                          <div className="inline-flex flex-col">
                            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10.5px] font-semibold text-slate-700">
                              <span>📅</span> Next: {nextDueFormatted}
                            </span>
                          </div>
                        )}
                      </td>

                      {/* Balance */}
                      <td className="px-4 py-3.5">
                        <div className="font-bold text-slate-900">
                          ₹{Number(loan.outstandingAmount || 0).toLocaleString('en-IN')}
                        </div>
                        <div className="text-[10px] text-slate-500">remaining</div>
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          
                          {/* View Schedule */}
                          <button
                            type="button"
                            onClick={() => handleOpenSchedule(loan)}
                            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 transition-colors shadow-2xs"
                            title="View full EMI schedule"
                          >
                            Schedule
                          </button>

                          {/* Collect EMI */}
                          {!isClosed && (
                            <button
                              type="button"
                              onClick={() => handleOpenCollect(loan)}
                              className="rounded-lg bg-emerald-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-emerald-700 transition-colors shadow-2xs"
                              title="Record counter EMI payment"
                            >
                              Collect
                            </button>
                          )}

                          {/* Recovery Log (for overdue) */}
                          {isOverdue && (
                            <button
                              type="button"
                              onClick={() => handleOpenRecovery(loan)}
                              className="rounded-lg bg-red-600 px-2 py-1 text-[11px] font-bold text-white hover:bg-red-700 transition-colors shadow-2xs"
                              title="Log recovery follow-up call/visit"
                            >
                              Follow-Up
                            </button>
                          )}

                          {/* NOC Certificate (for closed loans) */}
                          {isClosed && (
                            <button
                              type="button"
                              onClick={() => handleOpenNoc(loan)}
                              className="rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-200 px-2.5 py-1 text-[11px] font-bold hover:bg-indigo-100 transition-colors shadow-2xs"
                              title="View No Due Certificate"
                            >
                              NOC
                            </button>
                          )}

                        </div>
                      </td>

                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pagination Controls */}
      {pagination && (
        <Pagination
          pagination={pagination}
          page={page}
          limit={limit}
          onPageChange={setPage}
          onLimitChange={setLimit}
          limitOptions={[5, 10, 20, 50]}
          itemLabel="loans"
        />
      )}

      {/* ========================================================================= */}
      {/* MODAL 1: Full EMI Schedule & Recovery Drawer */}
      {/* ========================================================================= */}
      {selectedLoan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="flex max-h-[90vh] w-full max-w-4xl flex-col rounded-2xl bg-white shadow-2xl overflow-hidden">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-6 py-4">
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-xl bg-brand text-white font-bold">
                  <Icon name="calendar" size={18} />
                </div>
                <div>
                  <h3 className="font-heading text-base font-extrabold text-ink">
                    Loan Repayment Ledger · {selectedLoan.applicationNumber}
                  </h3>
                  <div className="text-xs text-muted">
                    Borrower: <span className="font-semibold text-slate-800">{selectedLoan.user?.name || selectedLoan.personalInformation?.fullName}</span> ({selectedLoan.user?.phone || '—'})
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelectedLoan(null)}
                className="flex size-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition-colors"
              >
                ✕
              </button>
            </div>

            {/* Sub-Tabs: Schedule vs Recovery History vs Borrower Info */}
            <div className="flex border-b border-slate-200 px-6 bg-white gap-4">
              <button
                type="button"
                onClick={() => setDetailTab('schedule')}
                className={`py-3 text-xs font-bold border-b-2 transition-colors ${
                  detailTab === 'schedule'
                    ? 'border-brand text-brand'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                📅 Installment Schedule ({selectedLoan.repayments?.length || 0})
              </button>

              <button
                type="button"
                onClick={() => setDetailTab('recovery')}
                className={`py-3 text-xs font-bold border-b-2 transition-colors flex items-center gap-1.5 ${
                  detailTab === 'recovery'
                    ? 'border-brand text-brand'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <span>📞 Recovery Action Logs</span>
                <span className="rounded-full bg-slate-100 px-1.5 text-[10px] text-slate-600">
                  {selectedLoan.recoveryLogs?.length || 0}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setDetailTab('info')}
                className={`py-3 text-xs font-bold border-b-2 transition-colors ${
                  detailTab === 'info'
                    ? 'border-brand text-brand'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                ℹ️ Loan Sanction Details
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-6">
              
              {/* TAB 1: SCHEDULE */}
              {detailTab === 'schedule' && (
                <div>
                  
                  {/* Summary bar inside modal */}
                  <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs">
                    <div>
                      <span className="text-[11px] text-slate-500 block">Sanctioned Principal</span>
                      <span className="font-extrabold text-slate-900 text-sm">
                        ₹{Number(selectedLoan.principal || selectedLoan.requestedAmount || 0).toLocaleString('en-IN')}
                      </span>
                    </div>
                    <div>
                      <span className="text-[11px] text-slate-500 block">Monthly EMI</span>
                      <span className="font-extrabold text-brand text-sm">
                        ₹{Number(selectedLoan.monthlyEMI || selectedLoan.emiAmount || 0).toLocaleString('en-IN')}
                      </span>
                    </div>
                    <div>
                      <span className="text-[11px] text-slate-500 block">Outstanding Balance</span>
                      <span className="font-extrabold text-slate-900 text-sm">
                        ₹{Number(selectedLoan.outstandingAmount || 0).toLocaleString('en-IN')}
                      </span>
                    </div>
                    <div>
                      <span className="text-[11px] text-slate-500 block">Overdue Installments</span>
                      <span className={`font-extrabold text-sm ${selectedLoan.overdueInstallments > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                        {selectedLoan.overdueInstallments || 0}
                      </span>
                    </div>
                  </div>

                  {/* Schedule Table */}
                  <div className="rounded-xl border border-slate-200 overflow-hidden">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-100/70 text-[10.5px] font-bold text-slate-500 uppercase tracking-wider">
                          <th className="px-3 py-2.5">#</th>
                          <th className="px-3 py-2.5">Due Date</th>
                          <th className="px-3 py-2.5">EMI Amount</th>
                          <th className="px-3 py-2.5">Principal / Interest</th>
                          <th className="px-3 py-2.5">Late Fee</th>
                          <th className="px-3 py-2.5">Status</th>
                          <th className="px-3 py-2.5">Payment Record</th>
                          <th className="px-3 py-2.5 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {(selectedLoan.repayments || []).map((inst) => {
                          const isPaid = inst.status === 'paid';
                          const isOver = inst.status === 'overdue';
                          const isPart = inst.status === 'partially_paid';

                          const dueStr = inst.dueDate
                            ? new Date(inst.dueDate).toLocaleDateString('en-IN', {
                                day: 'numeric',
                                month: 'short',
                                year: 'numeric',
                              })
                            : '—';

                          const paidStr = inst.paidDate
                            ? new Date(inst.paidDate).toLocaleDateString('en-IN', {
                                day: 'numeric',
                                month: 'short',
                                year: 'numeric',
                              })
                            : null;

                          return (
                            <tr key={inst.installmentNo} className={isOver ? 'bg-red-50/30' : isPaid ? 'bg-emerald-50/20' : ''}>
                              <td className="px-3 py-2.5 font-bold text-slate-700">
                                {inst.installmentNo}
                              </td>

                              <td className="px-3 py-2.5 font-medium text-slate-800">
                                {dueStr}
                              </td>

                              <td className="px-3 py-2.5 font-bold text-slate-900">
                                ₹{Number(inst.emiAmount || 0).toLocaleString('en-IN')}
                              </td>

                              <td className="px-3 py-2.5 text-[11px] text-slate-500">
                                ₹{inst.principalComponent || 0} / ₹{inst.interestComponent || 0}
                              </td>

                              <td className="px-3 py-2.5">
                                {(inst.lateFee || 0) > 0 ? (
                                  <span className="font-bold text-red-600">
                                    +₹{inst.lateFee} ({inst.daysOverdue || 0}d)
                                  </span>
                                ) : (
                                  <span className="text-slate-400">—</span>
                                )}
                              </td>

                              <td className="px-3 py-2.5">
                                {isPaid ? (
                                  <span className="rounded-full bg-emerald-100 text-emerald-800 px-2 py-0.5 text-[10px] font-bold">
                                    ✓ PAID
                                  </span>
                                ) : isOver ? (
                                  <span className="rounded-full bg-red-100 text-red-800 px-2 py-0.5 text-[10px] font-bold">
                                    ⚠️ OVERDUE
                                  </span>
                                ) : isPart ? (
                                  <span className="rounded-full bg-amber-100 text-amber-800 px-2 py-0.5 text-[10px] font-bold">
                                    PARTIAL (₹{inst.paidAmount})
                                  </span>
                                ) : (
                                  <span className="rounded-full bg-slate-100 text-slate-600 px-2 py-0.5 text-[10px] font-bold">
                                    PENDING
                                  </span>
                                )}
                              </td>

                              <td className="px-3 py-2.5 text-[11px]">
                                {isPaid ? (
                                  <div>
                                    <div className="font-medium text-emerald-700">Paid {paidStr}</div>
                                    <div className="text-[10px] text-slate-500 uppercase">
                                      {inst.gateway?.paymentMethod || 'Manual Counter'}
                                    </div>
                                  </div>
                                ) : isPart ? (
                                  <span className="text-amber-700 font-medium">₹{inst.paidAmount} received</span>
                                ) : (
                                  <span className="text-slate-400">—</span>
                                )}
                              </td>

                              <td className="px-3 py-2.5 text-right">
                                {!isPaid && (
                                  <button
                                    type="button"
                                    onClick={() => handleOpenCollect(selectedLoan, inst)}
                                    className="rounded-lg bg-emerald-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-emerald-700 transition-colors shadow-2xs"
                                  >
                                    Collect
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                </div>
              )}

              {/* TAB 2: RECOVERY FOLLOW-UP LOGS */}
              {detailTab === 'recovery' && (
                <div>
                  
                  <div className="mb-4 flex items-center justify-between">
                    <div>
                      <h4 className="font-bold text-sm text-slate-900">Borrower Recovery Logs & Field Trail</h4>
                      <p className="text-xs text-muted">Audited interaction history for overdue collection follow-ups.</p>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleOpenRecovery(selectedLoan)}
                      className="btn-primary text-xs font-bold px-3 py-1.5 flex items-center gap-1.5"
                    >
                      <span>➕</span> Log New Follow-Up
                    </button>
                  </div>

                  {(!selectedLoan.recoveryLogs || selectedLoan.recoveryLogs.length === 0) ? (
                    <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-xs text-muted">
                      No recovery follow-up actions recorded yet for this loan.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {selectedLoan.recoveryLogs.map((log, idx) => {
                        const typeLabels = {
                          call_made: { label: '📞 Phone Call Made', color: 'bg-blue-50 text-blue-700 border-blue-200' },
                          promise_to_pay: { label: '🤝 Promise to Pay (PTP)', color: 'bg-amber-50 text-amber-700 border-amber-200' },
                          field_visit: { label: '🚗 Field / Address Visit', color: 'bg-purple-50 text-purple-700 border-purple-200' },
                          legal_notice: { label: '⚖️ Legal Notice Dispatched', color: 'bg-red-50 text-red-700 border-red-200' },
                        };
                        const info = typeLabels[log.followupType] || { label: log.followupType, color: 'bg-slate-50 text-slate-700 border-slate-200' };

                        return (
                          <div key={idx} className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-2xs">
                            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                              <span className={`rounded-lg border px-2.5 py-0.5 text-xs font-bold ${info.color}`}>
                                {info.label}
                              </span>
                              <span className="text-[11px] text-slate-400">
                                {new Date(log.loggedAt || Date.now()).toLocaleString('en-IN')}
                              </span>
                            </div>

                            <p className="text-xs text-slate-700 whitespace-pre-wrap mb-2">
                              {log.notes || 'No detailed note.'}
                            </p>

                            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 text-[11px] text-slate-500">
                              <div>Logged by: <span className="font-semibold text-slate-700">{log.loggedBy?.name || 'Staff Officer'}</span></div>
                              {log.promisedPaymentDate && (
                                <div className="text-amber-700 font-semibold">
                                  Promised Pay Date: {new Date(log.promisedPaymentDate).toLocaleDateString('en-IN')}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                </div>
              )}

              {/* TAB 3: LOAN SANCTION DETAILS */}
              {detailTab === 'info' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-2">
                    <h5 className="font-bold text-slate-900 border-b pb-1.5">Borrower Profile</h5>
                    <div><span className="text-slate-500">Full Name:</span> <span className="font-semibold">{selectedLoan.user?.name || selectedLoan.personalInformation?.fullName}</span></div>
                    <div><span className="text-slate-500">Email:</span> <span className="font-semibold">{selectedLoan.user?.email || '—'}</span></div>
                    <div><span className="text-slate-500">Phone:</span> <span className="font-semibold">{selectedLoan.user?.phone || '—'}</span></div>
                    <div><span className="text-slate-500">PAN Card:</span> <span className="font-mono font-bold">{selectedLoan.personalInformation?.panNumber || '—'}</span></div>
                    <div><span className="text-slate-500">Employment:</span> <span className="font-semibold">{selectedLoan.employmentDetails?.employmentType || 'Salaried'}</span></div>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-2">
                    <h5 className="font-bold text-slate-900 border-b pb-1.5">Sanction Terms</h5>
                    <div><span className="text-slate-500">Application Number:</span> <span className="font-mono font-bold">{selectedLoan.applicationNumber}</span></div>
                    <div><span className="text-slate-500">Loan Product:</span> <span className="font-semibold">{selectedLoan.productName || selectedLoan.loanType}</span></div>
                    <div><span className="text-slate-500">Interest Type:</span> <span className="font-semibold capitalize">{selectedLoan.interestType || 'Diminishing'}</span></div>
                    <div><span className="text-slate-500">Interest Rate:</span> <span className="font-semibold">{selectedLoan.interestRate || 12}% per annum</span></div>
                    <div><span className="text-slate-500">Tenure:</span> <span className="font-semibold">{selectedLoan.tenureMonths || 12} Months</span></div>
                  </div>
                </div>
              )}

            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-6 py-3.5">
              <div className="text-xs text-slate-500">
                Loan Status: <span className="font-bold uppercase text-slate-800">{selectedLoan.status}</span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedLoan(null)}
                className="btn-secondary text-xs font-semibold px-4 py-1.5"
              >
                Close Ledger
              </button>
            </div>

          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: Collect Payment (Counter / Offline Deposit) */}
      {/* ========================================================================= */}
      {collectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-heading text-base font-extrabold text-ink">
                  Record Counter EMI Payment
                </h3>
                <p className="text-xs text-muted">
                  Installment #{collectModal.installment.installmentNo} · {collectModal.loan.applicationNumber}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCollectModal(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmitCollect} className="space-y-4 text-xs">
              
              {/* Due Amount Summary banner */}
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-emerald-900">
                <div className="flex justify-between items-center">
                  <span>Regular EMI:</span>
                  <span className="font-bold">₹{Number(collectModal.installment.emiAmount || 0).toLocaleString('en-IN')}</span>
                </div>
                {(collectModal.installment.lateFee || 0) > 0 && (
                  <div className="flex justify-between items-center text-red-600 font-semibold mt-1">
                    <span>Overdue Penalty ({collectModal.installment.daysOverdue || 0}d):</span>
                    <span>+₹{collectModal.installment.lateFee}</span>
                  </div>
                )}
                <div className="border-t border-emerald-200 mt-2 pt-1 flex justify-between items-center font-extrabold text-sm text-emerald-950">
                  <span>Total Due:</span>
                  <span>
                    ₹{(
                      (collectModal.installment.emiAmount || 0) +
                      (collectModal.installment.lateFee || 0) -
                      (collectModal.installment.paidAmount || 0)
                    ).toLocaleString('en-IN')}
                  </span>
                </div>
              </div>

              {/* Amount to Collect */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Amount Received (₹) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={collectForm.amountPaid}
                  onChange={(e) => setCollectForm({ ...collectForm, amountPaid: e.target.value })}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm font-bold text-slate-900 focus:border-brand focus:outline-none"
                />
              </div>

              {/* Payment Mode */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Payment Mode *
                </label>
                <select
                  value={collectForm.paymentMethod}
                  onChange={(e) => setCollectForm({ ...collectForm, paymentMethod: e.target.value })}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-800 bg-white focus:border-brand focus:outline-none"
                >
                  <option value="cash">💵 Cash at Branch Counter</option>
                  <option value="upi">📱 UPI / QR Counter Transfer</option>
                  <option value="bank_transfer">🏦 Bank Deposit / NEFT</option>
                  <option value="cheque">📜 Cheque Clearance</option>
                </select>
              </div>

              {/* Receipt Reference */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Receipt / Transaction Reference
                </label>
                <input
                  type="text"
                  value={collectForm.receiptNumber}
                  onChange={(e) => setCollectForm({ ...collectForm, receiptNumber: e.target.value })}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs font-mono text-slate-800 focus:border-brand focus:outline-none"
                />
              </div>

              {/* Worker Note */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Audit / Counter Note
                </label>
                <textarea
                  rows={2}
                  value={collectForm.note}
                  onChange={(e) => setCollectForm({ ...collectForm, note: e.target.value })}
                  className="w-full rounded-xl border border-slate-300 px-3 py-1.5 text-xs text-slate-800 focus:border-brand focus:outline-none"
                  placeholder="e.g. Counter deposit received by staff"
                />
              </div>

              {/* Buttons */}
              <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setCollectModal(null)}
                  className="btn-secondary px-4 py-2 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={collectSubmitting}
                  className="btn-primary px-5 py-2 text-xs font-bold flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700"
                >
                  {collectSubmitting ? 'Processing…' : 'Confirm Collection'}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 3: Log Recovery Follow-Up */}
      {/* ========================================================================= */}
      {recoveryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-heading text-base font-extrabold text-ink">
                  Log Recovery Follow-Up
                </h3>
                <p className="text-xs text-muted">
                  Loan: {recoveryModal.applicationNumber} · Borrower: {recoveryModal.user?.name || recoveryModal.personalInformation?.fullName}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setRecoveryModal(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmitRecovery} className="space-y-4 text-xs">
              
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Follow-Up Action Type *
                </label>
                <select
                  value={recoveryForm.followupType}
                  onChange={(e) => setRecoveryForm({ ...recoveryForm, followupType: e.target.value })}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-800 bg-white focus:border-brand focus:outline-none"
                >
                  <option value="call_made">📞 Phone Call Made to Borrower</option>
                  <option value="promise_to_pay">🤝 Promise to Pay (Borrower Committed to Date)</option>
                  <option value="field_visit">🚗 Field Visit to Residential / Work Address</option>
                  <option value="legal_notice">⚖️ Formal Legal / Demand Notice Issued</option>
                </select>
              </div>

              {recoveryForm.followupType === 'promise_to_pay' && (
                <div>
                  <label className="block font-bold text-amber-800 mb-1">
                    Promised Payment Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={recoveryForm.promisedPaymentDate}
                    onChange={(e) => setRecoveryForm({ ...recoveryForm, promisedPaymentDate: e.target.value })}
                    className="w-full rounded-xl border border-amber-300 px-3 py-2 text-xs text-slate-800 focus:border-brand focus:outline-none"
                  />
                </div>
              )}

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Conversation / Visit Notes *
                </label>
                <textarea
                  rows={3}
                  required
                  placeholder="Summarize borrower response, reason for delay, next follow-up plan…"
                  value={recoveryForm.notes}
                  onChange={(e) => setRecoveryForm({ ...recoveryForm, notes: e.target.value })}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs text-slate-800 focus:border-brand focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setRecoveryModal(null)}
                  className="btn-secondary px-4 py-2 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={recoverySubmitting}
                  className="btn-primary px-5 py-2 text-xs font-bold"
                >
                  {recoverySubmitting ? 'Saving…' : 'Record Log'}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 4: No Due Certificate (NOC) Preview */}
      {/* ========================================================================= */}
      {nocModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-2xl bg-white p-8 shadow-2xl border-4 border-emerald-600/30">
            <div className="text-center pb-4 border-b border-slate-200">
              <div className="text-2xl font-extrabold tracking-tight text-emerald-800 font-heading">FLOWLY FINANCE BANK</div>
              <div className="text-xs uppercase tracking-widest text-slate-500 font-bold mt-0.5">No Due Certificate (NOC)</div>
              <div className="text-[11px] font-mono text-emerald-700 mt-1">
                Ref: {nocModal.nocCertificate?.certificateNumber || `NOC-${nocModal.applicationNumber}`}
              </div>
            </div>

            <div className="my-6 space-y-3 text-xs text-slate-700">
              <p>This is to certify that the borrower detailed below has fully settled and cleared all outstanding loan EMIs, interest charges, and dues in accordance with the bank agreement.</p>
              
              <div className="rounded-xl bg-slate-50 p-4 border border-slate-200 space-y-1.5 font-medium">
                <div>Borrower: <span className="font-bold text-slate-900">{nocModal.user?.name || nocModal.personalInformation?.fullName}</span></div>
                <div>Loan Application: <span className="font-bold text-slate-900">{nocModal.applicationNumber}</span></div>
                <div>Sanctioned Principal: <span className="font-bold text-slate-900">₹{Number(nocModal.principal || nocModal.requestedAmount || 0).toLocaleString('en-IN')}</span></div>
                <div>Status: <span className="font-bold text-emerald-700 uppercase">Fully Paid & Closed (Zero Dues)</span></div>
              </div>

              <p className="text-[11px] text-slate-500 italic">No further claims or payments are outstanding against this credit facility.</p>
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setNocModal(null)}
                className="btn-secondary px-4 py-2 text-xs font-semibold"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => {
                  window.print();
                }}
                className="btn-primary px-4 py-2 text-xs font-bold flex items-center gap-1.5"
              >
                <span>🖨️</span> Print Certificate
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
