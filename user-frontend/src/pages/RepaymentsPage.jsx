import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { loansAPI, repaymentsAPI, getErrorMessage } from '../services/api';
import {
  CreditCard,
  CheckCircle2,
  Clock,
  AlertCircle,
  X,
  Receipt,
  Award,
  Zap,
  DollarSign,
  ShieldCheck,
  FileCheck,
  Calendar,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Layers,
  ArrowRight
} from 'lucide-react';

import StripeCardModal from '../components/StripeCardModal';

const RepaymentsPage = () => {
  const { user, account, refreshProfile } = useAuth();
  const [loans, setLoans] = useState([]);
  const [selectedLoanId, setSelectedLoanId] = useState('');
  const [scheduleData, setScheduleData] = useState(null);
  const [loading, setLoading] = useState(true);

  // Single Installment Payment Modal State
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [selectedInstallment, setSelectedInstallment] = useState(null);
  const [paymentMethodChoice, setPaymentMethodChoice] = useState('auto_debit'); // 'auto_debit' | 'gateway'

  // Close All Pending EMIs Modal State
  const [closeAllModalOpen, setCloseAllModalOpen] = useState(false);
  const [closeAllMethodChoice, setCloseAllMethodChoice] = useState('auto_debit');
  const [closingAll, setClosingAll] = useState(false);

  // Stripe Card Gateway Modal State
  const [stripeModalOpen, setStripeModalOpen] = useState(false);
  const [stripeClientSecret, setStripeClientSecret] = useState('');
  const [stripeAmount, setStripeAmount] = useState(0);
  const [isCloseAllPayment, setIsCloseAllPayment] = useState(false);

  // NOC Certificate Modal State
  const [nocModalOpen, setNocModalOpen] = useState(false);
  const [nocData, setNocData] = useState(null);
  const [applyNocModalOpen, setApplyNocModalOpen] = useState(false);
  const [nocRequestNote, setNocRequestNote] = useState('');
  const [applyNocLoading, setApplyNocLoading] = useState(false);

  // History Accordion State
  const [showHistory, setShowHistory] = useState(false);

  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [paying, setPaying] = useState(false);

  // Digital (Stripe-verified) payment history & receipts
  const [paymentHistory, setPaymentHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [receiptModalOpen, setReceiptModalOpen] = useState(false);
  const [selectedReceipt, setSelectedReceipt] = useState(null);

  const fetchActiveLoans = async () => {
    setLoading(true);
    try {
      const res = await loansAPI.getMyApplications();
      const list = res.data.applications || [];
      const relevantList = list.filter((app) =>
        ['disbursed', 'active', 'approved', 'closed'].includes(app.status?.toLowerCase())
      );
      setLoans(relevantList);

      if (relevantList.length > 0) {
        setSelectedLoanId(relevantList[0]._id);
      }
    } catch (err) {
      console.error('Failed to fetch loans for repayment:', err);
      setError(getErrorMessage(err, 'Failed to fetch loan accounts. Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  const fetchSchedule = async (loanId) => {
    if (!loanId) return;
    try {
      const res = await repaymentsAPI.getSchedule(loanId);
      const loan = res.data?.loan || res.data;
      if (loan) {
        setScheduleData(loan);

        // Fetch NOC if closed or has noc certificate status
        if (loan?.status === 'closed' || loan?.nocCertificate?.status) {
          const nocRes = await repaymentsAPI.getNoc(loanId).catch(() => null);
          if (nocRes?.data?.noc) {
            setNocData(nocRes.data.noc);
          } else if (loan?.nocCertificate) {
            setNocData(loan.nocCertificate);
          } else {
            setNocData(null);
          }
        }
      } else {
        setScheduleData(null);
        setError('Repayment schedule was not found for this loan.');
      }
    } catch (err) {
      console.error('Failed to fetch repayment schedule:', err);
      setScheduleData(null);
      setError(getErrorMessage(err, 'Failed to fetch repayment schedule.'));
    }
  };

  const handleApplyNoc = async (e) => {
    e.preventDefault();
    if (!selectedLoanId) return;
    setApplyNocLoading(true);
    setError('');
    try {
      const res = await repaymentsAPI.applyNoc(selectedLoanId, { requestNote: nocRequestNote });
      setMessage(res.data?.message || 'NOC application submitted successfully! Awaiting Admin approval.');
      setApplyNocModalOpen(false);
      setNocRequestNote('');
      await fetchSchedule(selectedLoanId);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to submit NOC application');
    } finally {
      setApplyNocLoading(false);
    }
  };

  const fetchDigitalPayments = async (loanId) => {
    if (!loanId) return;
    setLoadingHistory(true);
    try {
      const res = await repaymentsAPI.getPaymentHistory(loanId);
      if (res.data?.payments) {
        setPaymentHistory(res.data.payments);
      } else {
        setPaymentHistory([]);
      }
    } catch (err) {
      console.error('Failed to fetch digital payments:', err);
      setPaymentHistory([]);
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    fetchActiveLoans();
  }, []);

  useEffect(() => {
    if (selectedLoanId) {
      fetchSchedule(selectedLoanId);
      fetchDigitalPayments(selectedLoanId);
    }
  }, [selectedLoanId]);

  // Calculations for pending and paid installments
  const allInstallments = scheduleData?.repayments || [];
  const paidInstallments = allInstallments.filter((r) => r.status === 'paid');
  const pendingInstallments = allInstallments.filter((r) => r.status !== 'paid');

  // Coming month is the first pending installment
  const comingInstallment = pendingInstallments.length > 0 ? pendingInstallments[0] : null;

  // Total pending amount to close the loan in a single payment
  const totalPendingAmount = Math.round(
    pendingInstallments.reduce((sum, r) => sum + (r.emiAmount + (r.lateFee || 0) - (r.paidAmount || 0)), 0) * 100
  ) / 100;

  // Pay Single Month's EMI
  const handlePaySingleInstallment = async () => {
    if (!selectedLoanId || !selectedInstallment) return;

    setError('');
    setMessage('');
    setPaying(true);

    try {
      if (paymentMethodChoice === 'auto_debit') {
        const res = await repaymentsAPI.payAutoDebit(selectedLoanId, selectedInstallment.installmentNo);
        setMessage(res.data.message || `Installment #${selectedInstallment.installmentNo} paid successfully via Auto-Debit!`);
        setPaymentModalOpen(false);
        setSelectedInstallment(null);
        await refreshProfile();
        await fetchSchedule(selectedLoanId);
      } else {
        // Stripe Card Gateway
        const res = await repaymentsAPI.initiateRepayment(selectedLoanId, selectedInstallment.installmentNo);
        const { clientSecret, amountDue } = res.data;

        setIsCloseAllPayment(false);
        setStripeClientSecret(clientSecret);
        setStripeAmount(amountDue || (selectedInstallment.emiAmount + (selectedInstallment.lateFee || 0)));
        setPaymentModalOpen(false);
        setStripeModalOpen(true);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Repayment failed.');
    } finally {
      setPaying(false);
    }
  };

  // Close All Pending EMIs in a Single Payment
  const handleCloseAllPending = async () => {
    if (!selectedLoanId || pendingInstallments.length === 0) return;

    setError('');
    setMessage('');
    setClosingAll(true);

    try {
      if (closeAllMethodChoice === 'auto_debit') {
        const res = await repaymentsAPI.payAutoDebitAll(selectedLoanId);
        setMessage(res.data.message || 'All pending EMIs paid successfully! Loan has been fully closed.');
        setCloseAllModalOpen(false);
        if (res.data.noc) {
          setNocData(res.data.noc);
        }
        await refreshProfile();
        await fetchSchedule(selectedLoanId);
      } else {
        // Stripe Card Gateway for all pending EMIs
        const res = await repaymentsAPI.initiateRepaymentAll(selectedLoanId);
        const { clientSecret, amountDue } = res.data;

        setIsCloseAllPayment(true);
        setStripeClientSecret(clientSecret);
        setStripeAmount(amountDue || totalPendingAmount);
        setCloseAllModalOpen(false);
        setStripeModalOpen(true);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to close loan.');
    } finally {
      setClosingAll(false);
    }
  };

  // Handle Stripe Success (for single installment or full closure)
  const handleStripeSuccess = async (paymentIntent) => {
    setStripeModalOpen(false);
    setPaying(true);
    setError('');
    setMessage('');
    const txnId = paymentIntent.id || paymentIntent.transactionId;

    try {
      if (isCloseAllPayment) {
        const res = await repaymentsAPI.confirmCardRepaymentAll(selectedLoanId, {
          transactionId: txnId,
          amount: stripeAmount,
        });
        setMessage(res.data.message || `Card payment of ₹${stripeAmount} successful! All pending EMIs cleared and loan closed.`);
        if (res.data.noc) {
          setNocData(res.data.noc);
        }
      } else {
        // Server-side verification directly with Stripe, then official receipt
        const instNo = selectedInstallment?.installmentNo;
        const res = await repaymentsAPI.confirmRepayment(selectedLoanId, instNo, {
          transactionId: txnId,
        });

        setMessage(
          res.data.message ||
            `Payment of ₹${stripeAmount?.toLocaleString('en-IN')} verified successfully via Stripe! Receipt: ${res.data.receipt?.receiptNumber}`
        );

        if (res.data?.receipt) {
          setSelectedReceipt({
            ...res.data.receipt,
            loanApplicationNumber: scheduleData?.applicationNumber || selectedLoanId,
            installmentNo: instNo,
            customerName: user?.name || 'Customer',
          });
          setReceiptModalOpen(true);
        } else {
          setError(res.data?.message || 'Repayment recorded, but receipt details were missing.');
        }
      }
    } catch (err) {
      console.error('Confirmation failed:', err);
      setError(
        getErrorMessage(
          err,
          'Payment completed on Stripe, but backend verification encountered an issue. Please refresh the page.'
        )
      );
    } finally {
      setPaying(false);
      setSelectedInstallment(null);
      await refreshProfile();
      await fetchSchedule(selectedLoanId);
      await fetchDigitalPayments(selectedLoanId);
    }
  };

  // Helper for reminder indicators
  const getReminderBadge = (dueDateStr, status, daysOverdue = 0) => {
    if (status === 'paid') return null;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = new Date(dueDateStr);
    due.setHours(0, 0, 0, 0);

    const diffDays = Math.round((due - today) / (1000 * 60 * 60 * 24));

    if (diffDays < 0 || status === 'overdue') {
      const overdueDays = daysOverdue || Math.abs(diffDays);
      return <span className="badge badge-red">🚨 Overdue ({overdueDays}d exceeded)</span>;
    }
    if (diffDays === 0) {
      return <span className="badge badge-amber">⚡ Due Today!</span>;
    }
    if (diffDays === 1) {
      return <span className="badge badge-amber">🚨 Due Tomorrow!</span>;
    }
    if (diffDays <= 3) {
      return <span className="badge badge-purple">⚠️ Due in {diffDays} Days</span>;
    }
    if (diffDays <= 7) {
      return <span className="badge badge-purple">📅 Due in {diffDays} Days</span>;
    }
    return <span className="badge badge-gray">Upcoming</span>;
  };

  return (
    <div style={{ paddingBottom: '40px' }}>
      {/* ---------------- HEADER ---------------- */}
      <div style={{ marginBottom: '28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
          <div
            style={{
              width: '42px',
              height: '42px',
              borderRadius: '12px',
              backgroundColor: '#EEE7F4',
              color: '#5C187B',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Receipt size={22} />
          </div>
          <div>
            <h1 style={{ fontSize: '26px', color: '#201530', margin: 0, fontWeight: 700 }}>
              EMI Repayment Center
            </h1>
            <p style={{ color: '#6E677B', fontSize: '14px', margin: 0 }}>
              Pay your upcoming monthly EMI or close all remaining pending installments at once.
            </p>
          </div>
        </div>
      </div>

      {/* Global Alerts */}
      {message && (
        <div style={{ padding: '14px 18px', borderRadius: '10px', backgroundColor: '#E4F4DC', color: '#2E7A22', fontSize: '14px', fontWeight: 600, marginBottom: '20px' }}>
          ✓ {message}
        </div>
      )}
      {error && (
        <div style={{ padding: '14px 18px', borderRadius: '10px', backgroundColor: '#FADADA', color: '#B23A2E', fontSize: '14px', fontWeight: 600, marginBottom: '20px' }}>
          ⚠ {error}
        </div>
      )}

      {/* Loan Selector Tabs */}
      {loans.length > 0 && (
        <div className="tabs-nav" style={{ marginBottom: '24px' }}>
          {loans.map((ln) => (
            <button
              key={ln._id}
              className={`tab-btn ${selectedLoanId === ln._id ? 'active' : ''}`}
              onClick={() => setSelectedLoanId(ln._id)}
            >
              {ln.productName} ({ln.applicationNumber || ln._id}) {ln.status === 'closed' ? '✓ Closed' : ''}
            </button>
          ))}
        </div>
      )}

      {/* ---------------- LOAN STATUS & SCHEDULE ---------------- */}
      {loading ? (
        <div style={{ padding: '40px 0', textAlign: 'center', color: '#6E677B' }}>Loading repayment schedule...</div>
      ) : loans.length === 0 ? (
        <div className="flowly-card" style={{ textAlign: 'center', padding: '48px 24px', color: '#A19AA8' }}>
          <CreditCard size={40} style={{ marginBottom: '12px', opacity: 0.5 }} />
          <h4 style={{ color: '#201530', fontSize: '16px', margin: '0 0 4px 0' }}>No Active Loans Requiring Repayment</h4>
          <p style={{ fontSize: '13px', margin: 0 }}>Once a loan is approved and disbursed, your EMI schedule will appear here.</p>
        </div>
      ) : (
        <div>
          {/* LOAN CLOSED BANNER & NOC ACTIONS */}
          {(scheduleData?.status === 'closed' || (allInstallments.length > 0 && pendingInstallments.length === 0)) && (() => {
            const currentNocStatus = nocData?.status || scheduleData?.nocCertificate?.status || (nocData?.certificateNumber ? 'approved' : 'not_requested');

            if (currentNocStatus === 'approved') {
              return (
                <div
                  style={{
                    background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
                    color: '#fff',
                    borderRadius: '16px',
                    padding: '24px',
                    marginBottom: '24px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    boxShadow: '0 10px 25px -5px rgba(16, 185, 129, 0.3)',
                    flexWrap: 'wrap',
                    gap: '16px'
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                      <Award size={28} />
                      <h3 style={{ fontSize: '20px', margin: 0, fontWeight: 800 }}>
                        🎉 Official No Due Certificate (NOC) Approved!
                      </h3>
                      <span style={{ background: '#fff', color: '#047857', padding: '2px 8px', borderRadius: '999px', fontSize: '11px', fontWeight: 800 }}>
                        Verified
                      </span>
                    </div>
                    <p style={{ margin: 0, fontSize: '14px', opacity: 0.9 }}>
                      Approved by Bank Admin {nocData?.approvedByName ? `(${nocData.approvedByName})` : ''}. Certificate #{nocData?.certificateNumber || scheduleData?.nocCertificate?.certificateNumber}. All liabilities cleared.
                    </p>
                  </div>

                  <button
                    onClick={() => setNocModalOpen(true)}
                    className="btn-primary"
                    style={{ backgroundColor: '#fff', color: '#047857', padding: '12px 20px', fontWeight: 700, fontSize: '13px', whiteSpace: 'nowrap' }}
                  >
                    📜 View & Print NOC
                  </button>
                </div>
              );
            }

            if (currentNocStatus === 'requested') {
              return (
                <div
                  style={{
                    background: 'linear-gradient(135deg, #3B82F6 0%, #1D4ED8 100%)',
                    color: '#fff',
                    borderRadius: '16px',
                    padding: '24px',
                    marginBottom: '24px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    boxShadow: '0 10px 25px -5px rgba(59, 130, 246, 0.3)',
                    flexWrap: 'wrap',
                    gap: '16px'
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                      <Clock size={28} />
                      <h3 style={{ fontSize: '20px', margin: 0, fontWeight: 800 }}>
                        ⏳ NOC Application Under Review
                      </h3>
                      <span style={{ background: 'rgba(255,255,255,0.2)', padding: '2px 8px', borderRadius: '999px', fontSize: '11px', fontWeight: 700 }}>
                        Awaiting Admin Approval
                      </span>
                    </div>
                    <p style={{ margin: 0, fontSize: '14px', opacity: 0.9 }}>
                      Your NOC application for {scheduleData?.applicationNumber || selectedLoanId} was submitted on {nocData?.requestedAt ? new Date(nocData.requestedAt).toLocaleDateString('en-IN') : 'recently'}. The Bank Administrator is reviewing clearance records.
                    </p>
                  </div>

                  <div style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)', padding: '10px 18px', borderRadius: '10px', fontSize: '13px', fontWeight: 700 }}>
                    Verification in Progress
                  </div>
                </div>
              );
            }

            if (currentNocStatus === 'rejected') {
              return (
                <div
                  style={{
                    background: 'linear-gradient(135deg, #EF4444 0%, #B91C1C 100%)',
                    color: '#fff',
                    borderRadius: '16px',
                    padding: '24px',
                    marginBottom: '24px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    boxShadow: '0 10px 25px -5px rgba(239, 68, 68, 0.3)',
                    flexWrap: 'wrap',
                    gap: '16px'
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                      <AlertCircle size={28} />
                      <h3 style={{ fontSize: '20px', margin: 0, fontWeight: 800 }}>
                        ⚠️ NOC Application Not Approved
                      </h3>
                    </div>
                    <p style={{ margin: 0, fontSize: '14px', opacity: 0.9 }}>
                      Admin note: {nocData?.rejectionReason || 'Settlement documentation requires revision. Please re-apply or contact branch.'}
                    </p>
                  </div>

                  <button
                    onClick={() => setApplyNocModalOpen(true)}
                    className="btn-primary"
                    style={{ backgroundColor: '#fff', color: '#B91C1C', padding: '12px 20px', fontWeight: 700, fontSize: '13px', whiteSpace: 'nowrap' }}
                  >
                    🔄 Re-Apply for NOC
                  </button>
                </div>
              );
            }

            // Default: Not Requested
            return (
              <div
                style={{
                  background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
                  color: '#fff',
                  borderRadius: '16px',
                  padding: '24px',
                  marginBottom: '24px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  boxShadow: '0 10px 25px -5px rgba(16, 185, 129, 0.3)',
                  flexWrap: 'wrap',
                  gap: '16px'
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                    <Award size={28} />
                    <h3 style={{ fontSize: '20px', margin: 0, fontWeight: 800 }}>
                      🎉 Loan Fully Paid & Closed!
                    </h3>
                  </div>
                  <p style={{ margin: 0, fontSize: '14px', opacity: 0.9 }}>
                    All EMIs for {scheduleData?.applicationNumber || selectedLoanId} have been cleared. Submit your application now to obtain your official Bank No Due Certificate (NOC).
                  </p>
                </div>

                <button
                  onClick={() => setApplyNocModalOpen(true)}
                  className="btn-primary"
                  style={{ backgroundColor: '#fff', color: '#047857', padding: '12px 20px', fontWeight: 700, fontSize: '13px', whiteSpace: 'nowrap' }}
                >
                  📝 Apply for No Due Certificate (NOC)
                </button>
              </div>
            );
          })()}

          {/* Metric Cards Strip */}
          {scheduleData && (
            <div className="grid-3" style={{ marginBottom: '24px' }}>
              <div className="flowly-card">
                <span style={{ fontSize: '12px', color: '#6E677B', fontWeight: 600 }}>Monthly EMI</span>
                <div style={{ fontSize: '24px', fontWeight: 800, color: '#5C187B', marginTop: '4px' }}>
                  ₹{(scheduleData.monthlyEMI || scheduleData.emiAmount)?.toLocaleString('en-IN')}
                </div>
                <div style={{ fontSize: '11px', color: '#A19AA8', marginTop: '4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>Tenure: {scheduleData.tenureMonths || allInstallments.length} Months</span>
                  <span className="badge badge-purple" style={{ textTransform: 'capitalize', fontSize: '10px' }}>
                    {scheduleData.interestType === 'flat' ? 'Flat EMI' : 'Diminishing'}
                  </span>
                </div>
              </div>

              <div className="flowly-card">
                <span style={{ fontSize: '12px', color: '#6E677B', fontWeight: 600 }}>Total Outstanding Due</span>
                <div style={{ fontSize: '24px', fontWeight: 800, color: scheduleData.status === 'closed' ? '#10B981' : '#201530', marginTop: '4px' }}>
                  ₹{scheduleData.status === 'closed' ? '0' : totalPendingAmount.toLocaleString('en-IN')}
                </div>
                <div style={{ fontSize: '11px', color: '#A19AA8', marginTop: '4px' }}>
                  {scheduleData.status === 'closed' ? 'All dues settled' : `${pendingInstallments.length} installment(s) remaining`}
                </div>
              </div>

              <div className="flowly-card">
                <span style={{ fontSize: '12px', color: '#6E677B', fontWeight: 600 }}>Payment Progress</span>
                <div
                  style={{
                    fontSize: '24px',
                    fontWeight: 800,
                    color: scheduleData.overdueInstallments > 0 ? '#B23A2E' : '#2E7A22',
                    marginTop: '4px',
                  }}
                >
                  {paidInstallments.length} of {allInstallments.length} Paid
                </div>
                <div style={{ fontSize: '11px', color: '#A19AA8', marginTop: '4px' }}>
                  {scheduleData.overdueInstallments > 0 ? `🚨 ${scheduleData.overdueInstallments} Overdue EMI(s)` : '✓ Up to date'}
                </div>
              </div>
            </div>
          )}

          {/* ---------------- ACTIVE EMI PAY ACTIONS ---------------- */}
          {scheduleData?.status !== 'closed' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px', marginBottom: '28px' }}>
              {/* CARD 1: COMING MONTH'S EMI ONLY */}
              {comingInstallment ? (
                <div
                  className="flowly-card"
                  style={{
                    border: '2px solid #5C187B',
                    position: 'relative',
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between'
                  }}
                >
                  <div style={{
                    position: 'absolute',
                    top: 0,
                    right: 0,
                    backgroundColor: '#5C187B',
                    color: '#fff',
                    padding: '4px 12px',
                    borderBottomLeftRadius: '10px',
                    fontSize: '11px',
                    fontWeight: 800,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em'
                  }}>
                    Coming Month Due
                  </div>

                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                      <span style={{
                        backgroundColor: '#EEE7F4',
                        color: '#5C187B',
                        fontSize: '13px',
                        fontWeight: 800,
                        padding: '4px 10px',
                        borderRadius: '8px'
                      }}>
                        Installment #{comingInstallment.installmentNo}
                      </span>
                      {getReminderBadge(comingInstallment.dueDate, comingInstallment.status, comingInstallment.daysOverdue)}
                    </div>

                    <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#201530', margin: '8px 0 4px' }}>
                      Coming Month's EMI
                    </h3>
                    <p style={{ fontSize: '13px', color: '#6E677B', margin: '0 0 16px' }}>
                      Due on <strong>{new Date(comingInstallment.dueDate).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' })}</strong>
                    </p>

                    <div style={{ backgroundColor: '#F8FAFC', padding: '16px', borderRadius: '12px', marginBottom: '18px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '6px' }}>
                        <span style={{ fontSize: '13px', color: '#64748B', fontWeight: 600 }}>Base EMI</span>
                        <span style={{ fontSize: '18px', fontWeight: 800, color: '#0F172A' }}>
                          ₹{comingInstallment.emiAmount?.toLocaleString('en-IN')}
                        </span>
                      </div>

                      {comingInstallment.lateFee > 0 && (
                        <div style={{ backgroundColor: '#FEF2F2', border: '1px solid #FCA5A5', padding: '10px 12px', borderRadius: '8px', marginBottom: '10px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#B23A2E', fontWeight: 700, fontSize: '13px' }}>
                            <span>🚨 Overdue Penalty ({comingInstallment.daysOverdue || 1} Days Exceeded)</span>
                            <span>+ ₹{comingInstallment.lateFee}</span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#991B1B', marginTop: '4px' }}>
                            <span>Base Late Fee: ₹{Math.max(500, Math.round((comingInstallment.emiAmount || 0) * 0.02))}</span>
                            <span>Delay Surcharge: ₹{Math.max(0, comingInstallment.lateFee - Math.max(500, Math.round((comingInstallment.emiAmount || 0) * 0.02)))}</span>
                          </div>
                        </div>
                      )}

                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#6E677B', borderTop: '1px solid #E2E8F0', paddingTop: '8px', marginTop: '8px' }}>
                        <span>Principal: ₹{comingInstallment.principalComponent?.toLocaleString('en-IN')}</span>
                        <span>Interest: ₹{comingInstallment.interestComponent?.toLocaleString('en-IN')}</span>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1.5px solid #CBD5E1', paddingTop: '10px', marginTop: '10px' }}>
                        <span style={{ fontSize: '14px', fontWeight: 700, color: '#201530' }}>Total Due Now</span>
                        <span style={{ fontSize: '22px', fontWeight: 800, color: '#5C187B' }}>
                          ₹{(comingInstallment.emiAmount + (comingInstallment.lateFee || 0))?.toLocaleString('en-IN')}
                        </span>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      setSelectedInstallment(comingInstallment);
                      setPaymentModalOpen(true);
                    }}
                    className="btn-primary"
                    style={{ width: '100%', padding: '12px', fontSize: '14px', fontWeight: 700 }}
                  >
                    Pay Coming Month's EMI (₹{(comingInstallment.emiAmount + (comingInstallment.lateFee || 0))?.toLocaleString('en-IN')})
                  </button>
                </div>
              ) : (
                <div className="flowly-card" style={{ textAlign: 'center', padding: '32px 20px', color: '#6E677B' }}>
                  <CheckCircle2 size={36} style={{ color: '#10B981', margin: '0 auto 8px' }} />
                  <div style={{ fontWeight: 700, color: '#201530', fontSize: '16px' }}>No Pending Monthly EMI</div>
                  <div style={{ fontSize: '13px' }}>Your regular monthly installments are cleared!</div>
                </div>
              )}

              {/* CARD 2: OPTION TO CLOSE ALL PENDING EMIs AT ONCE */}
              {pendingInstallments.length > 0 && (
                <div
                  className="flowly-card"
                  style={{
                    background: 'linear-gradient(145deg, #FAF5FF 0%, #FFFFFF 100%)',
                    border: '2px solid #8B5CF6',
                    position: 'relative',
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between'
                  }}
                >
                  <div style={{
                    position: 'absolute',
                    top: 0,
                    right: 0,
                    backgroundColor: '#8B5CF6',
                    color: '#fff',
                    padding: '4px 12px',
                    borderBottomLeftRadius: '10px',
                    fontSize: '11px',
                    fontWeight: 800,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em'
                  }}>
                    One-Click Foreclosure
                  </div>

                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                      <span style={{
                        backgroundColor: '#E4F4DC',
                        color: '#2E7A22',
                        fontSize: '13px',
                        fontWeight: 800,
                        padding: '4px 10px',
                        borderRadius: '8px'
                      }}>
                        Close Entire Loan
                      </span>
                      <span style={{ fontSize: '12px', fontWeight: 600, color: '#6E677B' }}>
                        {pendingInstallments.length} EMIs Pending
                      </span>
                    </div>

                    <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#201530', margin: '8px 0 4px' }}>
                      Close All Pending EMIs
                    </h3>
                    <p style={{ fontSize: '13px', color: '#6E677B', margin: '0 0 16px' }}>
                      Pay off all remaining {pendingInstallments.length} installments in a single payment and immediately generate your official No Due Certificate (NOC).
                    </p>

                    <div style={{ backgroundColor: '#FFFFFF', border: '1px solid #E7E4DC', padding: '16px', borderRadius: '12px', marginBottom: '18px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '13px', color: '#6E677B' }}>
                        <span>Installments Covered</span>
                        <strong style={{ color: '#201530' }}>
                          #{pendingInstallments[0].installmentNo} to #{pendingInstallments[pendingInstallments.length - 1].installmentNo} ({pendingInstallments.length} Total)
                        </strong>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '13px', color: '#6E677B' }}>
                        <span>Early Foreclosure Fee</span>
                        <strong style={{ color: '#2E7A22' }}>₹0.00 (Zero Penalty)</strong>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1.5px solid #EEE7F4', paddingTop: '10px', marginTop: '10px' }}>
                        <span style={{ fontSize: '14px', fontWeight: 700, color: '#201530' }}>Single Payment Total</span>
                        <span style={{ fontSize: '24px', fontWeight: 800, color: '#8B5CF6' }}>
                          ₹{totalPendingAmount.toLocaleString('en-IN')}
                        </span>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => setCloseAllModalOpen(true)}
                    className="btn-primary"
                    style={{
                      width: '100%',
                      padding: '12px',
                      fontSize: '14px',
                      fontWeight: 700,
                      backgroundColor: '#8B5CF6',
                      borderColor: '#8B5CF6',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px'
                    }}
                  >
                    <Zap size={16} /> Close Loan in Single Payment (₹{totalPendingAmount.toLocaleString('en-IN')})
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ---------------- COLLAPSIBLE PAYMENT HISTORY (PAID INSTALLMENTS ONLY) ---------------- */}
          {paidInstallments.length > 0 && (
            <div className="flowly-card" style={{ marginTop: '20px' }}>
              <div
                onClick={() => setShowHistory(!showHistory)}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  cursor: 'pointer',
                  userSelect: 'none'
                }}
              >
                <div>
                  <h3 style={{ fontSize: '16px', color: '#201530', margin: 0, fontWeight: 700 }}>
                    Payment History ({paidInstallments.length} Cleared EMIs)
                  </h3>
                  <p style={{ fontSize: '12px', color: '#6E677B', margin: '2px 0 0' }}>
                    View previously completed payments for this loan
                  </p>
                </div>

                <button
                  type="button"
                  style={{
                    background: '#F6F5F1',
                    border: '1px solid #E7E4DC',
                    padding: '6px 12px',
                    borderRadius: '8px',
                    fontSize: '12px',
                    fontWeight: 600,
                    color: '#5C187B',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  {showHistory ? 'Hide History' : 'View History'}
                  {showHistory ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>
              </div>

              {showHistory && (
                <div style={{ marginTop: '16px', overflowX: 'auto', borderTop: '1px solid #E7E4DC', paddingTop: '12px' }}>
                  <table className="flowly-table">
                    <thead>
                      <tr>
                        <th>Installment #</th>
                        <th>Due Date</th>
                        <th>Paid Date</th>
                        <th>EMI Paid</th>
                        <th>Principal</th>
                        <th>Interest</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paidInstallments.map((inst) => (
                        <tr key={inst.installmentNo}>
                          <td style={{ fontWeight: 700 }}>#{inst.installmentNo}</td>
                          <td style={{ fontSize: '13px' }}>
                            {new Date(inst.dueDate).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' })}
                          </td>
                          <td style={{ fontSize: '13px', color: '#2E7A22', fontWeight: 600 }}>
                            {inst.paidDate ? new Date(inst.paidDate).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Cleared'}
                          </td>
                          <td style={{ fontWeight: 700, color: '#5C187B' }}>
                            ₹{inst.emiAmount?.toLocaleString('en-IN')}
                          </td>
                          <td style={{ fontSize: '13px', color: '#6E677B' }}>
                            ₹{inst.principalComponent?.toLocaleString('en-IN')}
                          </td>
                          <td style={{ fontSize: '13px', color: '#6E677B' }}>
                            ₹{inst.interestComponent?.toLocaleString('en-IN')}
                          </td>
                          <td>
                            <span className="badge badge-green">Paid ✓</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
          {/* ---------------- DIGITAL PAYMENT HISTORY (STRIPE VERIFIED TRANSACTIONS) ---------------- */}
          <div className="flowly-card" style={{ marginTop: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div>
                <h3 style={{ fontSize: '17px', color: '#201530', margin: 0, fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <CreditCard size={18} color="#5C187B" /> Digital Payments & Receipts (Stripe Gateway)
                </h3>
                <p style={{ fontSize: '13px', color: '#6E677B', margin: '4px 0 0 0' }}>
                  All digital card payments are verified with Stripe and assigned an official tamper-proof bank receipt number.
                </p>
              </div>
              <button
                onClick={() => fetchDigitalPayments(selectedLoanId)}
                className="btn-outline-dark"
                style={{ fontSize: '12px', padding: '6px 12px' }}
              >
                ↻ Refresh History
              </button>
            </div>

            {loadingHistory ? (
              <div style={{ padding: '24px', textAlign: 'center', color: '#6E677B', fontSize: '13px' }}>
                Loading verified transaction history...
              </div>
            ) : paymentHistory.length === 0 ? (
              <div style={{ padding: '32px 16px', textAlign: 'center', color: '#A19AA8', backgroundColor: '#FAF9FB', borderRadius: '10px' }}>
                <ShieldCheck size={32} style={{ marginBottom: '8px', opacity: 0.6, color: '#5C187B' }} />
                <p style={{ margin: 0, fontSize: '13px' }}>No digital card payments recorded yet for this loan.</p>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="flowly-table">
                  <thead>
                    <tr>
                      <th>Date & Time</th>
                      <th>Receipt #</th>
                      <th>Payment Method</th>
                      <th>Amount</th>
                      <th>Stripe Reference</th>
                      <th>Status</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paymentHistory.map((p) => {
                      const card = p.paymentMethod || {};
                      const isSuccess = p.paymentStatus === 'success';
                      return (
                        <tr key={p._id}>
                          <td style={{ fontSize: '13px' }}>
                            {new Date(p.completedAt || p.createdAt || p.paymentDate).toLocaleString('en-IN', {
                              dateStyle: 'medium',
                              timeStyle: 'short',
                            })}
                          </td>
                          <td style={{ fontWeight: 700, fontSize: '13px', color: '#5C187B', fontFamily: 'monospace' }}>
                            {p.receiptNumber || '—'}
                          </td>
                          <td style={{ fontSize: '13px' }}>
                            {card.brand ? (
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontWeight: 600 }}>
                                <CreditCard size={14} color="#5C187B" />
                                {(card.brand || '').toUpperCase()} •••• {card.last4 || '••••'}
                              </span>
                            ) : (
                              <span>Stripe Card</span>
                            )}
                          </td>
                          <td style={{ fontWeight: 800, color: '#201530', fontSize: '14px' }}>
                            ₹{p.amount?.toLocaleString('en-IN')}
                          </td>
                          <td style={{ fontSize: '12px', color: '#6E677B', fontFamily: 'monospace' }}>
                            {p.transactionReference || '—'}
                          </td>
                          <td>
                            <span className={`badge ${isSuccess ? 'badge-green' : p.paymentStatus === 'failed' ? 'badge-red' : 'badge-amber'}`}>
                              {isSuccess ? '✓ Verified' : p.paymentStatus}
                            </span>
                          </td>
                          <td>
                            {isSuccess && (
                              <button
                                onClick={() => {
                                  setSelectedReceipt({
                                    ...p,
                                    customerName: user?.name || 'Customer',
                                    loanApplicationNumber: p.loan?.applicationNumber || scheduleData?.applicationNumber || selectedLoanId,
                                  });
                                  setReceiptModalOpen(true);
                                }}
                                className="btn-secondary"
                                style={{ fontSize: '12px', padding: '5px 12px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                              >
                                <Receipt size={13} /> View Receipt
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

        </div>
      )}

      {/* ---------------- CONFIRM PAY COMING MONTH EMI MODAL ---------------- */}
      {paymentModalOpen && selectedInstallment && (
        <div className="modal-overlay">
          <div className="modal-container" style={{ maxWidth: '500px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ fontSize: '18px', margin: 0, fontWeight: 700 }}>Pay Coming Month's EMI</h3>
              <button onClick={() => setPaymentModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>

            <div className="kv-row">
              <span className="k">Installment Number</span>
              <span className="v">#{selectedInstallment.installmentNo}</span>
            </div>
            <div className="kv-row">
              <span className="k">Due Date</span>
              <span className="v">{new Date(selectedInstallment.dueDate).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
            </div>
            <div className="kv-row">
              <span className="k">Base EMI Amount</span>
              <span className="v">₹{selectedInstallment.emiAmount?.toLocaleString('en-IN')}</span>
            </div>
            {selectedInstallment.lateFee > 0 && (
              <>
                <div className="kv-row">
                  <span className="k" style={{ color: '#B23A2E' }}>
                    🚨 Overdue Penalty ({selectedInstallment.daysOverdue || 1} Days Exceeded)
                  </span>
                  <span className="v" style={{ color: '#B23A2E', fontWeight: 700 }}>+ ₹{selectedInstallment.lateFee}</span>
                </div>
                <div style={{ fontSize: '11px', color: '#6E677B', padding: '4px 0 8px 0', borderBottom: '1px solid #EEE7F4' }}>
                  Base Missed EMI Penalty: ₹{Math.max(500, Math.round((selectedInstallment.emiAmount || 0) * 0.02))} | Daily Delay Surcharge: ₹{Math.max(0, selectedInstallment.lateFee - Math.max(500, Math.round((selectedInstallment.emiAmount || 0) * 0.02)))}
                </div>
              </>
            )}
            <div className="kv-row" style={{ borderTop: '2px solid #EEE7F4', paddingTop: '10px', marginTop: '10px' }}>
              <span className="k" style={{ fontWeight: 700, fontSize: '15px' }}>Total Amount Payable</span>
              <span className="v" style={{ color: '#5C187B', fontSize: '18px', fontWeight: 800 }}>
                ₹{(selectedInstallment.emiAmount + (selectedInstallment.lateFee || 0))?.toLocaleString('en-IN')}
              </span>
            </div>

            {/* PAYMENT METHOD SELECTOR */}
            <div style={{ marginTop: '20px', marginBottom: '20px' }}>
              <label className="form-label" style={{ marginBottom: '8px' }}>Select Payment Method</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div
                  onClick={() => setPaymentMethodChoice('auto_debit')}
                  style={{
                    padding: '12px',
                    borderRadius: '10px',
                    border: paymentMethodChoice === 'auto_debit' ? '2px solid #5C187B' : '1px solid #E2E8F0',
                    backgroundColor: paymentMethodChoice === 'auto_debit' ? '#FAF5FF' : '#fff',
                    cursor: 'pointer',
                    fontSize: '12px',
                    fontWeight: 700,
                    textAlign: 'center',
                  }}
                >
                  ⚡ Auto-Debit Bank Balance
                  <div style={{ fontSize: '10px', color: '#6E677B', fontWeight: 500, marginTop: '2px' }}>
                    Available: ₹{(account?.balance || 0).toLocaleString('en-IN')}
                  </div>
                </div>
                <div
                  onClick={() => setPaymentMethodChoice('gateway')}
                  style={{
                    padding: '12px',
                    borderRadius: '10px',
                    border: paymentMethodChoice === 'gateway' ? '2px solid #5C187B' : '1px solid #E2E8F0',
                    backgroundColor: paymentMethodChoice === 'gateway' ? '#FAF5FF' : '#fff',
                    cursor: 'pointer',
                    fontSize: '12px',
                    fontWeight: 700,
                    textAlign: 'center',
                  }}
                >
                  💳 Debit/Credit Card Gateway
                  <div style={{ fontSize: '10px', color: '#6E677B', fontWeight: 500, marginTop: '2px' }}>
                    Stripe Cards
                  </div>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px' }}>
              <button onClick={() => setPaymentModalOpen(false)} className="btn-outline-dark" style={{ flex: 1 }}>
                Cancel
              </button>
              <button onClick={handlePaySingleInstallment} className="btn-primary" style={{ flex: 1 }} disabled={paying}>
                {paying ? 'Processing...' : 'Pay ₹' + (selectedInstallment.emiAmount + (selectedInstallment.lateFee || 0))?.toLocaleString('en-IN')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---------------- CONFIRM CLOSE ALL PENDING EMIS MODAL ---------------- */}
      {closeAllModalOpen && (
        <div className="modal-overlay">
          <div className="modal-container" style={{ maxWidth: '540px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Zap size={22} style={{ color: '#8B5CF6' }} />
                <h3 style={{ fontSize: '18px', margin: 0, fontWeight: 800 }}>Close Loan in Single Payment</h3>
              </div>
              <button onClick={() => setCloseAllModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>

            <div style={{ backgroundColor: '#F8FAFC', padding: '14px', borderRadius: '10px', marginBottom: '16px', fontSize: '13px', color: '#475569' }}>
              You are clearing all <strong>{pendingInstallments.length} remaining installments</strong>. Once this single payment settles, your loan account will be officially marked as <strong>CLOSED</strong> and your No Due Certificate (NOC) will be issued immediately.
            </div>

            <div className="kv-row">
              <span className="k">Loan Account</span>
              <span className="v">{scheduleData?.applicationNumber || selectedLoanId}</span>
            </div>
            <div className="kv-row">
              <span className="k">Installments Cleared</span>
              <span className="v">
                #{pendingInstallments[0]?.installmentNo} to #{pendingInstallments[pendingInstallments.length - 1]?.installmentNo} ({pendingInstallments.length} EMIs)
              </span>
            </div>
            <div className="kv-row">
              <span className="k">Foreclosure Penalty</span>
              <span className="v" style={{ color: '#2E7A22', fontWeight: 700 }}>₹0.00 (Zero Fee)</span>
            </div>
            <div className="kv-row" style={{ borderTop: '2px solid #EEE7F4', paddingTop: '10px', marginTop: '10px' }}>
              <span className="k" style={{ fontWeight: 800, fontSize: '15px' }}>Total Amount to Close Loan</span>
              <span className="v" style={{ color: '#8B5CF6', fontSize: '22px', fontWeight: 800 }}>
                ₹{totalPendingAmount.toLocaleString('en-IN')}
              </span>
            </div>

            {/* PAYMENT METHOD SELECTOR */}
            <div style={{ marginTop: '20px', marginBottom: '20px' }}>
              <label className="form-label" style={{ marginBottom: '8px' }}>Choose Single Payment Method</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div
                  onClick={() => setCloseAllMethodChoice('auto_debit')}
                  style={{
                    padding: '12px',
                    borderRadius: '10px',
                    border: closeAllMethodChoice === 'auto_debit' ? '2px solid #8B5CF6' : '1px solid #E2E8F0',
                    backgroundColor: closeAllMethodChoice === 'auto_debit' ? '#FAF5FF' : '#fff',
                    cursor: 'pointer',
                    fontSize: '12px',
                    fontWeight: 700,
                    textAlign: 'center',
                  }}
                >
                  ⚡ Auto-Debit Bank Balance
                  <div style={{ fontSize: '10px', color: '#6E677B', fontWeight: 500, marginTop: '2px' }}>
                    Available: ₹{(account?.balance || 0).toLocaleString('en-IN')}
                  </div>
                </div>
                <div
                  onClick={() => setCloseAllMethodChoice('gateway')}
                  style={{
                    padding: '12px',
                    borderRadius: '10px',
                    border: closeAllMethodChoice === 'gateway' ? '2px solid #8B5CF6' : '1px solid #E2E8F0',
                    backgroundColor: closeAllMethodChoice === 'gateway' ? '#FAF5FF' : '#fff',
                    cursor: 'pointer',
                    fontSize: '12px',
                    fontWeight: 700,
                    textAlign: 'center',
                  }}
                >
                  💳 Debit/Credit Card Gateway
                  <div style={{ fontSize: '10px', color: '#6E677B', fontWeight: 500, marginTop: '2px' }}>
                    Stripe Cards
                  </div>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px' }}>
              <button onClick={() => setCloseAllModalOpen(false)} className="btn-outline-dark" style={{ flex: 1 }}>
                Cancel
              </button>
              <button
                onClick={handleCloseAllPending}
                className="btn-primary"
                style={{ flex: 1, backgroundColor: '#8B5CF6', borderColor: '#8B5CF6' }}
                disabled={closingAll}
              >
                {closingAll ? 'Processing Closure...' : `Pay ₹${totalPendingAmount.toLocaleString('en-IN')} & Close Loan`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---------------- NO DUE CERTIFICATE (NOC) MODAL ---------------- */}
      {nocModalOpen && (
        <div className="modal-overlay">
          <div className="modal-container" style={{ maxWidth: '680px', padding: '28px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Award size={22} color="#047857" />
                <h3 style={{ fontSize: '18px', margin: 0, fontWeight: 700, color: '#047857' }}>Official No Due Certificate (NOC)</h3>
              </div>
              <button onClick={() => setNocModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                <X size={22} />
              </button>
            </div>

            <div
              id="noc-certificate-print"
              style={{
                background: '#fff',
                padding: '28px',
                borderRadius: '10px',
                border: '2px solid #064E3B',
                marginBottom: '20px',
                position: 'relative',
              }}
            >
              {/* Inner Accent Border */}
              <div style={{
                position: 'absolute',
                top: '5px',
                left: '5px',
                right: '5px',
                bottom: '5px',
                border: '1px solid #B45309',
                pointerEvents: 'none',
              }} />

              {/* Bank Header */}
              <div style={{ textAlign: 'center', borderBottom: '1.5px solid #047857', paddingBottom: '14px', marginBottom: '14px' }}>
                <div style={{ fontSize: '22px', fontWeight: 900, color: '#064E3B', letterSpacing: '0.8px' }}>FLOWLY FINANCE BANK</div>
                <div style={{ fontSize: '10px', color: '#B45309', fontWeight: 700, letterSpacing: '0.6px', marginTop: '2px' }}>
                  A SCHEDULED COMMERCIAL BANK • LICENSED BY RESERVE BANK OF INDIA
                </div>
                <div style={{ fontSize: '9px', color: '#6B7280', marginTop: '2px' }}>
                  BKC Bandra Kurla Complex, Mumbai - 400051 • CIN: U65191MH2023PTC10987 • IFSC: FLWB0001008
                </div>
              </div>

              {/* Certificate Title */}
              <div style={{ background: '#F0FDF4', border: '1px solid #A7F3D0', borderRadius: '6px', padding: '8px', textAlign: 'center', marginBottom: '14px' }}>
                <div style={{ fontSize: '13px', fontWeight: 800, color: '#064E3B' }}>
                  NO OBJECTION CERTIFICATE (NOC)
                </div>
                <div style={{ fontSize: '9px', fontWeight: 700, color: '#B45309', marginTop: '1px' }}>
                  LOAN CLOSURE & FULL LIABILITIES DISCHARGE CERTIFICATE
                </div>
              </div>

              {/* Meta strip */}
              <div style={{ display: 'flex', justifyContent: 'space-between', background: '#F8FAFC', border: '1px solid #E2E8F0', padding: '6px 12px', fontSize: '11px', borderRadius: '4px', marginBottom: '14px' }}>
                <div>Certificate Ref: <strong style={{ color: '#064E3B' }}>{nocData?.certificateNumber || scheduleData?.nocCertificate?.certificateNumber || 'NOC-2026-OK'}</strong></div>
                <div>Issue Date: <strong>{new Date(nocData?.approvedAt || Date.now()).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</strong></div>
              </div>

              <div style={{ fontSize: '12.5px', lineHeight: '1.6', color: '#1F2937', marginBottom: '16px' }}>
                <div style={{ fontWeight: 700, marginBottom: '6px' }}>TO WHOMSOEVER IT MAY CONCERN,</div>
                <p style={{ margin: 0 }}>
                  This is to certify that borrower <strong>{nocData?.customerName || user?.name}</strong> has fully settled, repaid, and cleared all outstanding principal, equated monthly installments (EMIs), interest charges, and incidental dues for Loan Account <strong>{scheduleData?.applicationNumber || selectedLoanId}</strong>.
                </p>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 12px', background: '#F0FDF4', padding: '12px 14px', borderRadius: '8px', margin: '12px 0', border: '1px solid #BBF7D0', fontSize: '12px' }}>
                  <div><strong>Borrower Name:</strong> {nocData?.customerName || user?.name}</div>
                  <div><strong>Loan Facility No:</strong> {scheduleData?.applicationNumber || selectedLoanId}</div>
                  <div><strong>Sanctioned Principal:</strong> ₹{(nocData?.loanAmount || scheduleData?.principal)?.toLocaleString('en-IN')}</div>
                  <div><strong>Total Amount Repaid:</strong> ₹{(scheduleData?.totalRepayment || scheduleData?.principal)?.toLocaleString('en-IN')}</div>
                  <div><strong>Closure Date:</strong> {new Date(nocData?.fullyPaidAt || Date.now()).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
                  <div><strong>Outstanding Balance:</strong> <span style={{ color: '#047857', fontWeight: 800 }}>₹0.00 (NIL / ZERO DUE)</span></div>
                </div>

                <div style={{ fontSize: '10.5px', color: '#4B5563', lineHeight: '1.4' }}>
                  Flowly Finance Bank confirms that all liabilities under this facility stand discharged in full. The Bank has NO OBJECTION to the borrower utilizing this certificate for record closure or credit bureau (CIBIL/Experian) reporting.
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderTop: '1px solid #E5E7EB', paddingTop: '14px' }}>
                <div>
                  <div style={{ fontSize: '10px', color: '#6B7280' }}>Digitally Approved & Authorized by</div>
                  <div style={{ fontSize: '12.5px', fontWeight: 700, color: '#064E3B' }}>
                    {nocData?.approvedByName ? `${nocData.approvedByName}` : 'Bank Administrator'}
                  </div>
                  <div style={{ fontSize: '10px', color: '#4B5563' }}>Head of Credit Administration & Regulatory Issuance</div>
                  {nocData?.adminRemarks && (
                    <div style={{ fontSize: '10.5px', color: '#065F46', fontStyle: 'italic', marginTop: '3px' }}>
                      Admin Remarks: "{nocData.adminRemarks}"
                    </div>
                  )}
                </div>
                <div style={{ textAlign: 'right' }}>
                  <ShieldCheck size={36} color="#047857" />
                  <div style={{ fontSize: '9px', fontWeight: 700, color: '#047857', marginTop: '2px' }}>DIGITALLY VERIFIED</div>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => setNocModalOpen(false)} className="btn-outline-dark" style={{ flex: 1, padding: '10px' }}>
                Close
              </button>
              <button onClick={() => window.print()} className="btn-secondary" style={{ flex: 1, padding: '10px' }}>
                🖨 Print Certificate
              </button>
              <button
                onClick={() => {
                  const url = repaymentsAPI.getNocDownloadUrl(selectedLoanId);
                  window.open(url, '_blank');
                }}
                className="btn-primary"
                style={{ flex: 1.2, backgroundColor: '#047857', borderColor: '#047857', padding: '10px', fontWeight: 700 }}
              >
                📥 Download Official PDF
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---------------- APPLY FOR NO DUE CERTIFICATE (NOC) MODAL ---------------- */}
      {applyNocModalOpen && (
        <div className="modal-overlay">
          <div className="modal-container" style={{ maxWidth: '520px', padding: '28px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Award size={22} color="#059669" />
                <h3 style={{ fontSize: '18px', margin: 0, fontWeight: 700, color: '#1F2937' }}>
                  Apply for No Due Certificate (NOC)
                </h3>
              </div>
              <button onClick={() => setApplyNocModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6B7280' }}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleApplyNoc}>
              <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', padding: '14px', borderRadius: '10px', marginBottom: '18px', fontSize: '13px', color: '#065F46' }}>
                <div style={{ fontWeight: 700, marginBottom: '4px' }}>Loan Facility Clearance Verification:</div>
                <div>Account: <strong>{scheduleData?.applicationNumber || selectedLoanId}</strong></div>
                <div>Borrower: <strong>{user?.name || scheduleData?.personalInformation?.fullName}</strong></div>
                <div>Principal Amount: <strong>₹{(scheduleData?.principal || scheduleData?.requestedAmount)?.toLocaleString('en-IN')}</strong></div>
                <div>Status: <strong style={{ color: '#047857' }}>Zero Outstanding Dues (Fully Paid)</strong></div>
                <div style={{ fontSize: '11px', color: '#047857', marginTop: '8px', lineHeight: '1.4' }}>
                  ℹ️ Once you submit, your clearance request is dispatched to the Bank Administrator for official review, digital signature, and issuance of your No Due Certificate.
                </div>
              </div>

              <div style={{ marginBottom: '18px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>
                  Purpose / Customer Remarks (Optional)
                </label>
                <textarea
                  rows={3}
                  value={nocRequestNote}
                  onChange={(e) => setNocRequestNote(e.target.value)}
                  placeholder="e.g. Requesting NOC for personal records / collateral release / credit report clearance"
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #D1D5DB', fontSize: '13px', outline: 'none' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setApplyNocModalOpen(false)}
                  className="btn-secondary"
                  style={{ padding: '9px 18px', fontSize: '13px' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={applyNocLoading}
                  className="btn-primary"
                  style={{ padding: '9px 22px', fontSize: '13px', fontWeight: 700, backgroundColor: '#059669', borderColor: '#059669' }}
                >
                  {applyNocLoading ? 'Submitting…' : 'Submit Application for Admin Approval'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ---------------- OFFICIAL PAYMENT RECEIPT MODAL ---------------- */}
      {receiptModalOpen && selectedReceipt && (
        <div className="modal-overlay" style={{ zIndex: 1200 }}>
          <div className="modal-container" style={{ maxWidth: '580px', padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Receipt size={22} color="#5C187B" />
                <h3 style={{ fontSize: '18px', margin: 0, fontWeight: 700, color: '#201530' }}>
                  Official Digital Payment Receipt
                </h3>
              </div>
              <button onClick={() => setReceiptModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>

            <div
              id="digital-payment-receipt"
              style={{
                background: '#fff',
                border: '2px solid #5C187B',
                borderRadius: '12px',
                padding: '24px',
                marginBottom: '20px',
                boxShadow: '0 4px 12px rgba(92, 24, 123, 0.08)',
              }}
            >
              <div style={{ textAlign: 'center', borderBottom: '2px dashed #E8E3EE', paddingBottom: '16px', marginBottom: '16px' }}>
                <div style={{ fontSize: '20px', fontWeight: 800, color: '#5C187B', letterSpacing: '0.5px' }}>
                  FLOWLY DIGITAL BANK
                </div>
                <div style={{ fontSize: '12px', color: '#6E677B', marginTop: '2px' }}>
                  SECURE STRIPE PAYMENT VERIFICATION RECEIPT
                </div>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', backgroundColor: '#E4F4DC', color: '#2E7A22', fontSize: '12px', fontWeight: 700, padding: '4px 12px', borderRadius: '999px', marginTop: '10px' }}>
                  <CheckCircle2 size={14} /> TRANSACTION VERIFIED & SETTLED
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: '13px', marginBottom: '16px' }}>
                <div>
                  <span style={{ color: '#6E677B', fontSize: '11px', display: 'block' }}>Receipt Number</span>
                  <strong style={{ color: '#5C187B', fontFamily: 'monospace' }}>{selectedReceipt.receiptNumber || 'FLWRP-VERIFIED'}</strong>
                </div>
                <div>
                  <span style={{ color: '#6E677B', fontSize: '11px', display: 'block' }}>Payment Date</span>
                  <strong>{new Date(selectedReceipt.completedAt || selectedReceipt.createdAt || Date.now()).toLocaleString('en-IN')}</strong>
                </div>
                <div>
                  <span style={{ color: '#6E677B', fontSize: '11px', display: 'block' }}>Customer Name</span>
                  <strong>{selectedReceipt.customerName || user?.name || 'Customer'}</strong>
                </div>
                <div>
                  <span style={{ color: '#6E677B', fontSize: '11px', display: 'block' }}>Loan Account #</span>
                  <strong>{selectedReceipt.loanApplicationNumber || scheduleData?.applicationNumber || selectedLoanId}</strong>
                </div>
                <div>
                  <span style={{ color: '#6E677B', fontSize: '11px', display: 'block' }}>Payment Channel</span>
                  <strong>Stripe Card Gateway</strong>
                </div>
                <div>
                  <span style={{ color: '#6E677B', fontSize: '11px', display: 'block' }}>Card Used</span>
                  <strong>{selectedReceipt.paymentMethod?.brand ? `${(selectedReceipt.paymentMethod.brand).toUpperCase()} •••• ${selectedReceipt.paymentMethod.last4}` : 'Card Payment'}</strong>
                </div>
              </div>

              <div style={{ backgroundColor: '#FAF5FF', border: '1px solid #E9D8FD', borderRadius: '8px', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <span style={{ fontSize: '14px', fontWeight: 600, color: '#5C187B' }}>Amount Paid</span>
                <span style={{ fontSize: '22px', fontWeight: 800, color: '#5C187B' }}>
                  ₹{selectedReceipt.amount?.toLocaleString('en-IN')}
                </span>
              </div>

              <div style={{ borderTop: '1px solid #F0EAF5', paddingTop: '12px', fontSize: '11px', color: '#6E677B' }}>
                <div style={{ marginBottom: '4px' }}>
                  <strong>Stripe Transaction Reference:</strong> <span style={{ fontFamily: 'monospace' }}>{selectedReceipt.transactionReference || selectedReceipt.transactionId || 'pi_verified'}</span>
                </div>
                <div>
                  This is a computer-generated digital receipt and requires no physical signature. Verified via Flowly Payment Gateway.
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px' }}>
              <button onClick={() => window.print()} className="btn-primary" style={{ flex: 1, backgroundColor: '#5C187B' }}>
                🖨 Print / Save Receipt
              </button>
              <button onClick={() => setReceiptModalOpen(false)} className="btn-outline-dark" style={{ flex: 1 }}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* STRIPE DEBIT / CREDIT CARD MODAL */}
      <StripeCardModal
        isOpen={stripeModalOpen}
        onClose={() => setStripeModalOpen(false)}
        clientSecret={stripeClientSecret}
        amount={stripeAmount}
        title={isCloseAllPayment ? "Pay Full Loan Balance via Card" : "Pay EMI via Card"}
        onSuccess={handleStripeSuccess}
      />
    </div>
  );
};

export default RepaymentsPage;
