import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { dashboardAPI, cashDepositAPI, cashWithdrawalAPI, transferAPI, statementAPI, getErrorMessage } from '../services/api';
import MpinModal from '../components/MpinModal';
import { 
  Landmark, 
  CreditCard, 
  ArrowUpRight, 
  ArrowDownLeft, 
  Clock, 
  CheckCircle2, 
  AlertCircle, 
  PlusCircle, 
  ShieldAlert, 
  FileCheck, 
  TrendingUp, 
  Activity, 
  KeyRound, 
  FileText, 
  X, 
  Printer, 
  Download, 
  ArrowLeftRight,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';

const Dashboard = () => {
  const { user, account, refreshProfile } = useAuth();
  const navigate = useNavigate();

  const [dashboardData, setDashboardData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [mpinModalOpen, setMpinModalOpen] = useState(false);

  // Recent Account Ledger Pagination State
  const [ledgerPage, setLedgerPage] = useState(1);
  const [ledgerLimit, setLedgerLimit] = useState(5);
  const [ledgerPagination, setLedgerPagination] = useState({
    total: 0,
    page: 1,
    limit: 5,
    totalPages: 1,
    hasNextPage: false,
    hasPrevPage: false,
  });
  const [ledgerLoading, setLedgerLoading] = useState(false);

  // Receipt Modal State
  const [receiptModalOpen, setReceiptModalOpen] = useState(false);
  const [selectedReceipt, setSelectedReceipt] = useState(null);
  const [receiptLoading, setReceiptLoading] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  // Statement Download State
  const [downloadingStatement, setDownloadingStatement] = useState(false);
  const [statementSuccessMessage, setStatementSuccessMessage] = useState('');
  const [statementErrorMessage, setStatementErrorMessage] = useState('');

  const handleDownloadStatement = async () => {
    if (!account) {
      setStatementErrorMessage('Active bank account is required to download bank statements.');
      setTimeout(() => setStatementErrorMessage(''), 5000);
      return;
    }

    setDownloadingStatement(true);
    setStatementErrorMessage('');
    setStatementSuccessMessage('');

    try {
      // Calls /api/statements/download with all=true to fetch all existing transactions and complete account details
      const res = await statementAPI.downloadStatement({
        accountId: account._id || account.id,
        all: 'true',
      });

      let filename = `Flowly_Bank_Statement_${account.accountNumber || 'Account'}_All_Transactions.pdf`;
      const disposition = res.headers && (res.headers['content-disposition'] || res.headers['Content-Disposition']);
      if (disposition) {
        const match = disposition.match(/filename="?([^";]+)"?/);
        if (match && match[1]) {
          filename = match[1];
        }
      }

      const blob = new Blob([res.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);

      setStatementSuccessMessage('Complete bank statement with all transactions downloaded successfully!');
      setTimeout(() => setStatementSuccessMessage(''), 5000);
    } catch (err) {
      console.error('Failed to download bank statement PDF:', err);
      let errMsg = 'Failed to download bank statement. Please try again.';
      if (err.response?.data) {
        if (err.response.data instanceof Blob) {
          try {
            const text = await err.response.data.text();
            const json = JSON.parse(text);
            if (json.message) errMsg = json.message;
          } catch {
            // keep default errMsg
          }
        } else if (err.response.data.message) {
          errMsg = err.response.data.message;
        }
      }
      setStatementErrorMessage(errMsg);
      setTimeout(() => setStatementErrorMessage(''), 6000);
    } finally {
      setDownloadingStatement(false);
    }
  };

  const handleDownloadPdf = async () => {
    if (!selectedReceipt?.receiptNumber) return;
    setDownloadingPdf(true);
    try {
      const isTransfer = String(selectedReceipt.receiptNumber).startsWith('FLWTR');
      const res = isTransfer
        ? await transferAPI.downloadReceiptPDF(selectedReceipt.receiptNumber)
        : await cashWithdrawalAPI.downloadReceiptPDF(selectedReceipt.receiptNumber);

      const blob = new Blob([res.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${isTransfer ? 'Transfer' : 'Withdrawal'}_Receipt_${selectedReceipt.receiptNumber}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to download PDF receipt:', err);
      setStatementErrorMessage(getErrorMessage(err, 'Failed to download PDF receipt. Please try again.'));
      setTimeout(() => setStatementErrorMessage(''), 5000);
    } finally {
      setDownloadingPdf(false);
    }
  };

  const handleViewReceipt = async (receiptNumber) => {
    if (!receiptNumber) return;
    setReceiptLoading(true);
    setReceiptModalOpen(true);
    try {
      let res;
      if (String(receiptNumber).startsWith('FLWWD')) {
        res = await cashWithdrawalAPI.getReceipt(receiptNumber);
      } else if (String(receiptNumber).startsWith('FLWTR')) {
        res = await transferAPI.getReceipt(receiptNumber);
      } else {
        res = await cashDepositAPI.getReceipt(receiptNumber);
      }
      const receiptData = res.data?.receipt || res.data;
      if (receiptData) {
        setSelectedReceipt(receiptData);
      } else {
        setSelectedReceipt(null);
        setStatementErrorMessage('Receipt details could not be found.');
        setTimeout(() => setStatementErrorMessage(''), 5000);
      }
    } catch (err) {
      console.error('Failed to load transaction receipt:', err);
      setSelectedReceipt(null);
      setStatementErrorMessage(getErrorMessage(err, 'Failed to load transaction receipt. Please try again.'));
      setTimeout(() => setStatementErrorMessage(''), 5000);
    } finally {
      setReceiptLoading(false);
    }
  };

  const fetchDashboardData = async (targetPage = ledgerPage, targetLimit = ledgerLimit) => {
    setLoading(true);
    setError('');
    try {
      const res = await dashboardAPI.getDashboard({ page: targetPage, limit: targetLimit });
      if (res.data && (res.data.data || res.data)) {
        const data = res.data.data || res.data;
        setDashboardData(data);
        const pagination = data.recentTransactionsPagination || data.pagination;
        if (pagination) {
          setLedgerPagination(pagination);
          setLedgerPage(pagination.page || targetPage);
          if (pagination.limit) setLedgerLimit(pagination.limit);
        } else if (Array.isArray(data.recentTransactions)) {
          const total = data.recentTransactions.length;
          setLedgerPagination({
            total,
            page: targetPage,
            limit: targetLimit,
            totalPages: Math.ceil(total / targetLimit) || 1,
            hasNextPage: false,
            hasPrevPage: targetPage > 1,
          });
        }
      } else {
        setError(res.data?.message || 'Could not load real-time dashboard metrics.');
      }
    } catch (err) {
      console.error('Failed to fetch dashboard metrics:', err);
      setError(getErrorMessage(err, 'Could not load real-time dashboard metrics. Please check your connection.'));
    } finally {
      setLoading(false);
    }
  };

  const handleLedgerPageChange = async (newPage, newLimit = ledgerLimit) => {
    if (newPage < 1) return;
    if (ledgerPagination.totalPages && newPage > ledgerPagination.totalPages) return;
    if (newPage === ledgerPage && newLimit === ledgerLimit) return;

    setLedgerLoading(true);
    try {
      const res = await dashboardAPI.getRecentTransactions(newPage, newLimit);
      const resData = res.data?.data || res.data;
      const txns = Array.isArray(resData?.transactions)
        ? resData.transactions
        : Array.isArray(resData)
        ? resData
        : res.data?.transactions || [];
      const pagination = resData?.pagination || res.data?.pagination || {
        total: txns.length,
        page: newPage,
        limit: newLimit,
        totalPages: Math.ceil(txns.length / newLimit) || 1,
        hasNextPage: false,
        hasPrevPage: newPage > 1,
      };

      setDashboardData((prev) => (prev ? { ...prev, recentTransactions: txns } : prev));
      setLedgerPagination(pagination);
      setLedgerPage(newPage);
      if (newLimit !== ledgerLimit) setLedgerLimit(newLimit);
    } catch (err) {
      console.error('Failed to load ledger page:', err);
    } finally {
      setLedgerLoading(false);
    }
  };

  const getPageNumbers = (currentPage, totalPages) => {
    if (!totalPages || totalPages <= 1) return [1];
    if (totalPages <= 5) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    if (currentPage <= 3) {
      return [1, 2, 3, 4, '...', totalPages];
    }
    if (currentPage >= totalPages - 2) {
      return [1, '...', totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
    }
    return [1, '...', currentPage - 1, currentPage, currentPage + 1, '...', totalPages];
  };

  useEffect(() => {
    fetchDashboardData();
    refreshProfile();

    const handleAccountUpdate = () => {
      fetchDashboardData();
      refreshProfile();
    };

    window.addEventListener('flowly:account-update', handleAccountUpdate);
    window.addEventListener('flowly:account-suspended', handleAccountUpdate);
    window.addEventListener('focus', handleAccountUpdate);

    return () => {
      window.removeEventListener('flowly:account-update', handleAccountUpdate);
      window.removeEventListener('flowly:account-suspended', handleAccountUpdate);
      window.removeEventListener('focus', handleAccountUpdate);
    };
  }, []);

  const kycStatus = user?.kycStatus || 'pending';
  const isMpinSet = user?.isMpinSet ?? false;
  const isSuspended = account?.status === 'suspended' || user?.status === 'suspended';

  const activeFdTotal =
    dashboardData?.fds?.totalFdPrincipal ??
    dashboardData?.financialOverview?.totalFDAmount ??
    (Array.isArray(dashboardData?.activeFD)
      ? dashboardData.activeFD.reduce((sum, fd) => sum + (fd.principalAmount || fd.depositAmount || 0), 0)
      : 0);

  const activeFdCount =
    dashboardData?.fds?.activeCount ??
    dashboardData?.financialOverview?.activeFDCount ??
    (Array.isArray(dashboardData?.activeFD) ? dashboardData.activeFD.length : 0);

  return (
    <div style={{ paddingBottom: '40px' }}>
      {/* ---------------- SECURITY FREEZE / SUSPENDED TRANSACTIONS ALERT ---------------- */}
      {isSuspended && (
        <div
          style={{
            padding: '16px 20px',
            borderRadius: '14px',
            backgroundColor: '#FEF2F2',
            border: '1.5px solid #FCA5A5',
            color: '#991B1B',
            marginBottom: '20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px',
            boxShadow: '0 4px 12px rgba(220, 38, 38, 0.08)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '10px',
                backgroundColor: '#FEE2E2',
                color: '#DC2626',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <ShieldAlert size={22} />
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: '15px', color: '#991B1B' }}>
                Money Transactions Temporarily Blocked
              </div>
              <div style={{ fontSize: '12.5px', color: '#7F1D1D', marginTop: '2px', lineHeight: 1.4 }}>
                A reported debit transaction has placed a temporary security freeze on your account. For your safety, outgoing transfers and withdrawals are paused until an authorized bank worker reviews the report and enables transactions back from the worker desk.
              </div>
            </div>
          </div>
          <button
            onClick={() => navigate('/help?tab=tickets')}
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              border: '1px solid #DC2626',
              backgroundColor: '#FFFFFF',
              color: '#DC2626',
              fontWeight: 700,
              fontSize: '12.5px',
              cursor: 'pointer',
            }}
          >
            View Ticket Status ↗
          </button>
        </div>
      )}

      {/* ---------------- WELCOME HEADER ---------------- */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '28px', color: '#201530', marginBottom: '4px' }}>
            Good day, {user?.name || 'Customer'} 👋
          </h1>
          <p style={{ color: '#6E677B', fontSize: '14px' }}>
            Here is your financial overview and active banking activities.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button
            onClick={handleDownloadStatement}
            disabled={downloadingStatement}
            className="btn-secondary"
            style={{
              fontSize: '13px',
              padding: '9px 16px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              backgroundColor: '#FAF5FF',
              borderColor: '#8B5CF6',
              color: '#5C187B',
              fontWeight: 600,
              cursor: downloadingStatement ? 'not-allowed' : 'pointer',
              opacity: downloadingStatement ? 0.7 : 1,
            }}
            title="Download verified PDF bank statement containing all existing transactions and complete account details"
          >
            <FileText size={16} /> {downloadingStatement ? 'Downloading Statement...' : 'Bank Statement'}
          </button>
          <button onClick={() => setMpinModalOpen(true)} className="btn-secondary" style={{ fontSize: '13px', padding: '9px 16px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <KeyRound size={16} /> {isMpinSet ? 'Reset MPIN' : 'Generate MPIN'}
          </button>
          <button onClick={() => navigate('/transfer')} className="btn-primary" style={{ fontSize: '13px', padding: '9px 16px', backgroundColor: '#5C187B', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <ArrowLeftRight size={16} /> Transfer
          </button>
          <button onClick={() => navigate('/add-money')} className="btn-secondary" style={{ fontSize: '13px', padding: '9px 16px' }}>
            <PlusCircle size={16} /> Add Money
          </button>
          <button onClick={() => navigate('/loans')} className="btn-secondary" style={{ fontSize: '13px', padding: '9px 16px' }}>
            <CreditCard size={16} /> Apply Loan
          </button>
        </div>
      </div>

      {/* ---------------- STATEMENT NOTIFICATIONS ---------------- */}
      {statementSuccessMessage && (
        <div style={{
          padding: '12px 16px',
          borderRadius: '10px',
          backgroundColor: '#E4F4DC',
          color: '#2E7A22',
          fontSize: '13px',
          fontWeight: 600,
          marginBottom: '20px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <CheckCircle2 size={18} /> {statementSuccessMessage}
        </div>
      )}

      {statementErrorMessage && (
        <div style={{
          padding: '12px 16px',
          borderRadius: '10px',
          backgroundColor: '#FADADA',
          color: '#B23A2E',
          fontSize: '13px',
          fontWeight: 600,
          marginBottom: '20px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <AlertCircle size={18} /> {statementErrorMessage}
        </div>
      )}

      {error && (
        <div style={{
          padding: '14px 18px',
          borderRadius: '10px',
          backgroundColor: '#FADADA',
          color: '#B23A2E',
          fontSize: '13px',
          fontWeight: 600,
          marginBottom: '20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertCircle size={18} /> <span>{error}</span>
          </div>
          <button
            onClick={() => { fetchDashboardData(); refreshProfile(); }}
            className="btn-primary"
            style={{ padding: '6px 14px', fontSize: '12px', whiteSpace: 'nowrap' }}
          >
            Retry
          </button>
        </div>
      )}

      {/* ---------------- MPIN SETUP ALERT BANNER (If not set) ---------------- */}
      {!isMpinSet && (
        <div style={{
          padding: '16px 20px',
          borderRadius: '14px',
          backgroundColor: '#FAF5FF',
          border: '1px solid #8B5CF6',
          marginBottom: '28px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <KeyRound size={24} color="#5C187B" />
            <div>
              <h4 style={{ fontSize: '15px', color: '#201530', margin: 0, fontWeight: 700 }}>
                Security MPIN Not Generated
              </h4>
              <p style={{ fontSize: '13px', color: '#4A4453', margin: 0 }}>
                Generate your 4-6 digit Security MPIN via 2-step email OTP verification for secure login access.
              </p>
            </div>
          </div>
          <button
            onClick={() => setMpinModalOpen(true)}
            className="btn-primary"
            style={{
              padding: '9px 18px',
              fontSize: '13px',
              backgroundColor: '#5C187B'
            }}
          >
            Generate MPIN Now
          </button>
        </div>
      )}

      {/* ---------------- KYC ALERT BANNER (If not verified) ---------------- */}
      {kycStatus !== 'verified' && (
        <div style={{
          padding: '16px 20px',
          borderRadius: '14px',
          backgroundColor: kycStatus === 'rejected' ? '#FADADA' : kycStatus === 'under_verification' ? '#EEE7F4' : '#FBEFD9',
          border: `1px solid ${kycStatus === 'rejected' ? '#E3B3AC' : kycStatus === 'under_verification' ? '#8B5CF6' : '#E6C887'}`,
          marginBottom: '28px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {kycStatus === 'rejected' ? (
              <ShieldAlert size={22} color="#B23A2E" />
            ) : kycStatus === 'under_verification' ? (
              <Clock size={22} color="#5C187B" />
            ) : (
              <AlertCircle size={22} color="#9A6A0C" />
            )}
            <div>
              <h4 style={{ fontSize: '15px', color: '#201530', margin: 0 }}>
                {kycStatus === 'pending' && 'KYC Verification Required'}
                {kycStatus === 'under_verification' && 'KYC Submitted & Under Review'}
                {kycStatus === 'rejected' && 'KYC Verification Document Rejected'}
              </h4>
              <p style={{ fontSize: '13px', color: '#4A4453', margin: 0 }}>
                {kycStatus === 'pending' && 'Complete your identity verification to unlock loan applications and account features.'}
                {kycStatus === 'under_verification' && 'Our staff is reviewing your document. Bank account will activate automatically upon approval.'}
                {kycStatus === 'rejected' && 'Your KYC submission was rejected. Please re-upload a valid identity document.'}
              </p>
            </div>
          </div>
          <button
            onClick={() => navigate('/kyc')}
            className="btn-primary"
            style={{
              padding: '8px 16px',
              fontSize: '12px',
              backgroundColor: kycStatus === 'rejected' ? '#B23A2E' : '#5C187B'
            }}
          >
            {kycStatus === 'pending' ? 'Submit KYC Now' : 'Check KYC Details'}
          </button>
        </div>
      )}

      {/* ---------------- MAIN SAVINGS & ACCOUNT BANNER ---------------- */}
      <div className="hero-gradient-card" style={{ marginBottom: '28px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '20px' }}>
          <div>
            <span style={{ fontSize: '13px', color: '#C9C3DA', fontWeight: 600, display: 'block', marginBottom: '6px' }}>
              Savings Account Net Balance
            </span>
            <div style={{ fontSize: '40px', fontWeight: 800, color: '#FFFFFF', fontFamily: 'Outfit', letterSpacing: '-0.02em' }}>
              ₹{account ? account.balance.toLocaleString('en-IN', { minimumFractionDigits: 2 }) : '0.00'}
            </div>
            <div style={{ display: 'flex', gap: '16px', marginTop: '16px', fontSize: '13px', color: '#E9E4F0' }}>
              <span>Account #: <strong>{account?.accountNumber || 'Pending KYC'}</strong></span>
              <span>•</span>
              <span>IFSC: <strong>{account?.ifscCode || 'FLOW0001001'}</strong></span>
              <span>•</span>
              <span>Branch: <strong>{account?.branch || 'Kochi Main'}</strong></span>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button
              onClick={handleDownloadStatement}
              disabled={downloadingStatement}
              className="btn-secondary"
              style={{
                padding: '10px 18px',
                fontSize: '13px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                backgroundColor: 'rgba(255, 255, 255, 0.15)',
                color: '#FFFFFF',
                borderColor: 'rgba(255, 255, 255, 0.3)',
                cursor: downloadingStatement ? 'not-allowed' : 'pointer',
              }}
              title="Download verified PDF bank statement containing all existing transactions and complete account details"
            >
              <Download size={16} /> {downloadingStatement ? 'Downloading...' : 'Bank Statement (PDF)'}
            </button>
            <button onClick={() => navigate('/transfer')} className="btn-secondary" style={{ padding: '10px 18px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <ArrowLeftRight size={16} /> Transfer
            </button>
            <button onClick={() => navigate('/add-money')} className="btn-secondary" style={{ padding: '10px 18px', fontSize: '13px' }}>
              <PlusCircle size={16} /> Add Money
            </button>
            <button onClick={() => navigate('/deposits')} className="btn-primary" style={{ padding: '10px 18px', fontSize: '13px', backgroundColor: '#8B5CF6' }}>
              <TrendingUp size={16} /> Open FD
            </button>
          </div>
        </div>
      </div>

      {/* ---------------- STATS METRICS GRID ---------------- */}
      <div className="grid-4" style={{ marginBottom: '32px' }}>
        <div className="flowly-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <span style={{ fontSize: '12px', color: '#6E677B', fontWeight: 600 }}>Active Fixed Deposits</span>
            <div style={{ width: '32px', height: '32px', borderRadius: '8px', backgroundColor: '#E4F4DC', color: '#2E7A22', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Landmark size={18} />
            </div>
          </div>
          <div style={{ fontSize: '24px', fontWeight: 800, color: '#201530', fontFamily: 'Outfit' }}>
            ₹{activeFdTotal.toLocaleString('en-IN')}
          </div>
          <div style={{ fontSize: '12px', color: '#2E7A22', fontWeight: 600, marginTop: '4px' }}>
            {activeFdCount} Active Deposit(s)
          </div>
        </div>

        <div className="flowly-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <span style={{ fontSize: '12px', color: '#6E677B', fontWeight: 600 }}>Outstanding Loan</span>
            <div style={{ width: '32px', height: '32px', borderRadius: '8px', backgroundColor: '#EEE7F4', color: '#5C187B', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <CreditCard size={18} />
            </div>
          </div>
          <div style={{ fontSize: '24px', fontWeight: 800, color: '#201530', fontFamily: 'Outfit' }}>
            ₹{dashboardData?.activeLoan?.outstandingAmount ? dashboardData.activeLoan.outstandingAmount.toLocaleString('en-IN') : '0'}
          </div>
          <div style={{ fontSize: '12px', color: '#6E677B', marginTop: '4px' }}>
            {dashboardData?.activeLoan?.productName || 'No Active Loan'}
          </div>
        </div>

        <div className="flowly-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <span style={{ fontSize: '12px', color: '#6E677B', fontWeight: 600 }}>Next EMI Due</span>
            <div style={{ width: '32px', height: '32px', borderRadius: '8px', backgroundColor: '#FBEFD9', color: '#9A6A0C', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Clock size={18} />
            </div>
          </div>
          <div style={{ fontSize: '24px', fontWeight: 800, color: '#201530', fontFamily: 'Outfit' }}>
            ₹{dashboardData?.activeLoan?.nextEmiAmount ? dashboardData.activeLoan.nextEmiAmount.toLocaleString('en-IN') : '0'}
          </div>
          <div style={{ fontSize: '12px', color: '#9A6A0C', fontWeight: 600, marginTop: '4px' }}>
            {dashboardData?.activeLoan?.nextDueDate ? `Due: ${new Date(dashboardData.activeLoan.nextDueDate).toLocaleDateString()}` : 'No upcoming EMI'}
          </div>
        </div>

        <div className="flowly-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <span style={{ fontSize: '12px', color: '#6E677B', fontWeight: 600 }}>KYC Status</span>
            <div style={{ width: '32px', height: '32px', borderRadius: '8px', backgroundColor: kycStatus === 'verified' ? '#E4F4DC' : '#EEE7F4', color: kycStatus === 'verified' ? '#2E7A22' : '#5C187B', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <FileCheck size={18} />
            </div>
          </div>
          <div style={{ fontSize: '20px', fontWeight: 800, color: '#201530', textTransform: 'capitalize', fontFamily: 'Outfit' }}>
            {kycStatus.replace('_', ' ')}
          </div>
          <div style={{ fontSize: '12px', color: kycStatus === 'verified' ? '#2E7A22' : '#5C187B', fontWeight: 600, marginTop: '4px' }}>
            {kycStatus === 'verified' ? 'Account Active ✓' : 'Verification Needed'}
          </div>
        </div>
      </div>

      {/* ---------------- ACTIVE LOAN & RECENT TRANSACTIONS GRID ---------------- */}
      <div className="grid-2" style={{ marginBottom: '32px' }}>
        {/* Active Loan Overview Panel */}
        <div className="flowly-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ fontSize: '16px', margin: 0 }}>Active Loan & EMI</h3>
            <button onClick={() => navigate('/repayments')} className="btn-outline-dark" style={{ fontSize: '11px', padding: '4px 10px' }}>
              Pay EMI Schedule
            </button>
          </div>

          {dashboardData?.activeLoan ? (
            <div>
              <div style={{ padding: '16px', borderRadius: '12px', backgroundColor: '#FAF5FF', border: '1px solid #EEE7F4', marginBottom: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ fontWeight: 700, color: '#5C187B', fontSize: '15px' }}>{dashboardData.activeLoan.productName}</span>
                  <span className="badge badge-purple">{dashboardData.activeLoan.status}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#6E677B' }}>
                  <span>Principal: ₹{dashboardData.activeLoan.principal?.toLocaleString('en-IN')}</span>
                  <span>Tenure: {dashboardData.activeLoan.tenureMonths} mo</span>
                </div>
              </div>

              <div className="kv-row">
                <span className="k">Monthly EMI Amount</span>
                <span className="v">₹{dashboardData.activeLoan.monthlyEMI?.toLocaleString('en-IN')}</span>
              </div>
              <div className="kv-row">
                <span className="k">Outstanding Amount</span>
                <span className="v">₹{dashboardData.activeLoan.outstandingAmount?.toLocaleString('en-IN')}</span>
              </div>
              <div className="kv-row">
                <span className="k">Next Payment Due</span>
                <span className="v">{dashboardData.activeLoan.nextDueDate ? new Date(dashboardData.activeLoan.nextDueDate).toLocaleDateString() : 'N/A'}</span>
              </div>

              <button
                onClick={() => navigate('/repayments')}
                className="btn-primary"
                style={{ width: '100%', marginTop: '16px', padding: '10px' }}
              >
                Pay Current EMI
              </button>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '36px 16px', color: '#A19AA8' }}>
              <CreditCard size={36} style={{ marginBottom: '10px', opacity: 0.5 }} />
              <p style={{ fontWeight: 600, color: '#201530', margin: '0 0 6px 0' }}>No Active Loans</p>
              <p style={{ fontSize: '13px', margin: '0 0 16px 0' }}>Explore low-interest micro-loans with flexible tenures.</p>
              <button onClick={() => navigate('/loans')} className="btn-secondary" style={{ fontSize: '13px' }}>
                Explore Loan Catalog
              </button>
            </div>
          )}
        </div>

        {/* Recent Transactions Panel */}
        <div className="flowly-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h3 style={{ fontSize: '16px', margin: 0 }}>Recent Account Ledger</h3>
              {ledgerPagination?.total > 0 && (
                <span style={{
                  fontSize: '11px',
                  backgroundColor: '#F3EDF7',
                  color: '#5C187B',
                  padding: '2px 8px',
                  borderRadius: '12px',
                  fontWeight: 600
                }}>
                  {ledgerPagination.total} {ledgerPagination.total === 1 ? 'record' : 'records'}
                </span>
              )}
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={handleDownloadStatement}
                disabled={downloadingStatement}
                className="btn-outline-dark"
                style={{
                  fontSize: '11px',
                  padding: '4px 10px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  cursor: downloadingStatement ? 'not-allowed' : 'pointer',
                }}
                title="Download verified PDF bank statement containing all existing transactions and complete account details"
              >
                <FileText size={12} /> {downloadingStatement ? 'Downloading...' : 'Bank Statement (PDF)'}
              </button>
              <button onClick={() => navigate('/deposits')} className="btn-outline-dark" style={{ fontSize: '11px', padding: '4px 10px' }}>
                View All
              </button>
            </div>
          </div>

          <div style={{ position: 'relative', minHeight: '180px' }}>
            {ledgerLoading && (
              <div style={{
                position: 'absolute',
                inset: 0,
                backgroundColor: 'rgba(255, 255, 255, 0.7)',
                backdropFilter: 'blur(1px)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 5,
                borderRadius: '8px'
              }}>
                <div style={{
                  fontSize: '12px',
                  color: '#5C187B',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  backgroundColor: '#FFFFFF',
                  padding: '6px 14px',
                  borderRadius: '20px',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.08)'
                }}>
                  <Clock size={14} /> Loading ledger entries...
                </div>
              </div>
            )}

            {dashboardData?.recentTransactions && dashboardData.recentTransactions.length > 0 ? (
              <>
                <div style={{ overflowX: 'auto' }}>
                  <table className="flowly-table">
                    <thead>
                      <tr>
                        <th>Type / Description</th>
                        <th>Date</th>
                        <th style={{ textAlign: 'right' }}>Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dashboardData.recentTransactions.map((tx) => {
                        const isWithdrawal = tx.type === 'withdrawal' || tx.transactionType === 'WITHDRAWAL' || tx.category === 'withdrawal';
                        const isCashDeposit = !isWithdrawal && (tx.category === 'cash_deposit' || tx.transactionType === 'CASH_DEPOSIT' || (tx.receiptNumber && (tx.type === 'credit' || tx.type === 'deposit')));
                        const receiptNo = tx.receiptNumber || tx.meta?.receiptNumber;
                        return (
                          <tr key={tx._id || tx.id}>
                            <td>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <div style={{
                                  width: '26px',
                                  height: '26px',
                                  borderRadius: '50%',
                                  backgroundColor: tx.type === 'credit' || tx.type === 'deposit' ? '#E4F4DC' : '#FADADA',
                                  color: tx.type === 'credit' || tx.type === 'deposit' ? '#2E7A22' : '#B23A2E',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center'
                                }}>
                                  {tx.type === 'credit' || tx.type === 'deposit' ? <ArrowDownLeft size={14} /> : <ArrowUpRight size={14} />}
                                </div>
                                <div>
                                  <div style={{ fontWeight: 600, fontSize: '13px', color: '#201530', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    {tx.description}
                                    {isWithdrawal ? (
                                      <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', backgroundColor: '#B23A2E', color: 'white', fontWeight: 700 }}>
                                        WITHDRAWAL
                                      </span>
                                    ) : isCashDeposit ? (
                                      <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', backgroundColor: '#5C187B', color: 'white', fontWeight: 700 }}>
                                        CASH DEPOSIT
                                      </span>
                                    ) : null}
                                  </div>
                                  <div style={{ fontSize: '11px', color: '#6E677B' }}>
                                    {tx.refType || 'Savings'} {receiptNo ? `• Ref: ${receiptNo}` : ''}
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td style={{ fontSize: '12px', color: '#6E677B' }}>
                              {new Date(tx.createdAt || tx.date).toLocaleDateString()}
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              <div style={{
                                fontWeight: 700,
                                fontSize: '13px',
                                color: tx.type === 'credit' || tx.type === 'deposit' ? '#2E7A22' : '#201530'
                              }}>
                                {tx.type === 'credit' || tx.type === 'deposit' ? '+' : '-'}₹{tx.amount?.toLocaleString('en-IN')}
                              </div>
                              {receiptNo && (
                                <button
                                  onClick={() => handleViewReceipt(receiptNo)}
                                  style={{
                                    border: 'none',
                                    background: 'none',
                                    color: '#5C187B',
                                    fontSize: '11px',
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    padding: 0,
                                    textDecoration: 'underline'
                                  }}
                                >
                                  View Receipt
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Ledger Pagination Bar */}
                {ledgerPagination && ledgerPagination.total > 0 && (
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginTop: '16px',
                    paddingTop: '12px',
                    borderTop: '1px solid #F0EEF4',
                    flexWrap: 'wrap',
                    gap: '10px'
                  }}>
                    {/* Range info and page limit select */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '12px', color: '#6E677B' }}>
                      <span>
                        Showing {Math.min((ledgerPagination.page - 1) * ledgerPagination.limit + 1, ledgerPagination.total)}–
                        {Math.min(ledgerPagination.page * ledgerPagination.limit, ledgerPagination.total)} of{' '}
                        <strong style={{ color: '#201530' }}>{ledgerPagination.total}</strong>
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span style={{ fontSize: '11px', color: '#8E8799' }}>Rows:</span>
                        <select
                          value={ledgerLimit}
                          onChange={(e) => {
                            const newLim = parseInt(e.target.value, 10);
                            setLedgerLimit(newLim);
                            handleLedgerPageChange(1, newLim);
                          }}
                          style={{
                            fontSize: '11px',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            border: '1px solid #DDD7E3',
                            backgroundColor: '#FFFFFF',
                            color: '#201530',
                            cursor: 'pointer'
                          }}
                          aria-label="Records per page"
                        >
                          <option value={5}>5</option>
                          <option value={10}>10</option>
                          <option value={20}>20</option>
                        </select>
                      </div>
                    </div>

                    {/* Pagination Controls */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <button
                        type="button"
                        onClick={() => handleLedgerPageChange(ledgerPagination.page - 1)}
                        disabled={!ledgerPagination.hasPrevPage || ledgerLoading}
                        className="btn-outline-dark"
                        style={{
                          fontSize: '11px',
                          padding: '4px 8px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '2px',
                          opacity: (!ledgerPagination.hasPrevPage || ledgerLoading) ? 0.45 : 1,
                          cursor: (!ledgerPagination.hasPrevPage || ledgerLoading) ? 'not-allowed' : 'pointer'
                        }}
                        aria-label="Previous page"
                      >
                        <ChevronLeft size={13} />
                        <span>Prev</span>
                      </button>

                      {getPageNumbers(ledgerPagination.page, ledgerPagination.totalPages).map((p, idx) => {
                        if (p === '...') {
                          return (
                            <span key={`ellipsis-${idx}`} style={{ fontSize: '11px', color: '#8E8799', padding: '0 4px' }}>
                              …
                            </span>
                          );
                        }
                        const isCurrent = p === ledgerPagination.page;
                        return (
                          <button
                            key={`page-${p}`}
                            type="button"
                            onClick={() => handleLedgerPageChange(p)}
                            disabled={isCurrent || ledgerLoading}
                            style={{
                              minWidth: '26px',
                              height: '26px',
                              padding: '0 6px',
                              fontSize: '11px',
                              fontWeight: isCurrent ? 700 : 500,
                              borderRadius: '6px',
                              border: isCurrent ? '1px solid #5C187B' : '1px solid #DDD7E3',
                              backgroundColor: isCurrent ? '#5C187B' : '#FFFFFF',
                              color: isCurrent ? '#FFFFFF' : '#201530',
                              cursor: isCurrent || ledgerLoading ? 'default' : 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center'
                            }}
                            aria-label={`Page ${p}`}
                            aria-current={isCurrent ? 'page' : undefined}
                          >
                            {p}
                          </button>
                        );
                      })}

                      <button
                        type="button"
                        onClick={() => handleLedgerPageChange(ledgerPagination.page + 1)}
                        disabled={!ledgerPagination.hasNextPage || ledgerLoading}
                        className="btn-outline-dark"
                        style={{
                          fontSize: '11px',
                          padding: '4px 8px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '2px',
                          opacity: (!ledgerPagination.hasNextPage || ledgerLoading) ? 0.45 : 1,
                          cursor: (!ledgerPagination.hasNextPage || ledgerLoading) ? 'not-allowed' : 'pointer'
                        }}
                        aria-label="Next page"
                      >
                        <span>Next</span>
                        <ChevronRight size={13} />
                      </button>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div style={{ textAlign: 'center', padding: '36px 16px', color: '#A19AA8' }}>
                <Activity size={36} style={{ marginBottom: '10px', opacity: 0.5 }} />
                <p style={{ fontWeight: 600, color: '#201530', margin: 0 }}>No Recent Transactions</p>
                <p style={{ fontSize: '13px' }}>Your deposit and loan payment history will appear here.</p>
              </div>
            )}
          </div>
        </div>
      </div>



      {/* MPIN Generation Modal */}
      <MpinModal
        isOpen={mpinModalOpen}
        onClose={() => setMpinModalOpen(false)}
        onSuccess={() => {
          fetchDashboardData();
        }}
      />

      {/* Customer Cash Transaction Receipt Modal */}
      {receiptModalOpen && (
        <div className="modal-overlay">
          <div className="modal-container" style={{ maxWidth: '460px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '18px', margin: 0, display: 'flex', alignItems: 'center', gap: '8px', color: '#201530' }}>
                <FileText size={20} color="#5C187B" />
                {selectedReceipt?.transactionType === 'TRANSFER' || selectedReceipt?.receiptNumber?.startsWith('FLWTR')
                  ? 'Internal Money Transfer Receipt'
                  : selectedReceipt?.transactionType === 'WITHDRAWAL' || selectedReceipt?.receiptNumber?.startsWith('FLWWD')
                  ? 'Cash Withdrawal Receipt'
                  : 'Cash Deposit Receipt'}
              </h3>
              <button onClick={() => setReceiptModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={20} /></button>
            </div>

            {receiptLoading ? (
              <div style={{ textAlign: 'center', padding: '40px', color: '#6E677B' }}>Loading receipt details...</div>
            ) : selectedReceipt ? (
              <div>
                {(() => {
                  const isTransfer = selectedReceipt.transactionType === 'TRANSFER' || selectedReceipt.receiptNumber?.startsWith('FLWTR');
                  const isWithdrawal = selectedReceipt.transactionType === 'WITHDRAWAL' || selectedReceipt.receiptNumber?.startsWith('FLWWD');
                  return (
                    <>
                      <div style={{
                        textAlign: 'center',
                        padding: '16px',
                        backgroundColor: isTransfer ? '#FAF5FF' : isWithdrawal ? '#FFF5F5' : '#F6FBF4',
                        borderRadius: '12px',
                        border: `1px solid ${isTransfer ? '#8B5CF6' : isWithdrawal ? '#F2C7C7' : '#B8E2AE'}`,
                        marginBottom: '16px'
                      }}>
                        <span style={{ fontSize: '12px', color: '#6E677B', textTransform: 'uppercase', fontWeight: 600 }}>
                          {isTransfer ? 'Amount Transferred' : isWithdrawal ? 'Amount Disbursed / Withdrawn' : 'Amount Deposited'}
                        </span>
                        <div style={{
                          fontSize: '32px',
                          fontWeight: 800,
                          color: isTransfer ? '#5C187B' : isWithdrawal ? '#B23A2E' : '#2E7A22',
                          fontFamily: 'Outfit',
                          margin: '4px 0'
                        }}>
                          {isTransfer || isWithdrawal ? '-' : '+'}₹{Number(selectedReceipt.amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </div>
                        <span style={{ fontSize: '12px', color: '#5C187B', fontWeight: 700 }}>
                          Status: {selectedReceipt.status?.toUpperCase() || 'COMPLETED'} ✓ {isTransfer && `\u2022 ${selectedReceipt.securityTier || 'MPIN Verified'}`}
                        </span>
                      </div>

                      <div className="kv-row">
                        <span className="k">Receipt Number</span>
                        <span className="v" style={{ color: '#5C187B' }}>{selectedReceipt.receiptNumber}</span>
                      </div>
                      <div className="kv-row">
                        <span className="k">Transaction ID</span>
                        <span className="v" style={{ fontSize: '12px' }}>{selectedReceipt.transactionId || selectedReceipt.id}</span>
                      </div>
                      {isTransfer && selectedReceipt.destinationAccount && (
                        <div className="kv-row">
                          <span className="k">To Beneficiary</span>
                          <span className="v">
                            {selectedReceipt.destinationAccount?.customerName} (A/C: {selectedReceipt.destinationAccount?.accountNumber})
                          </span>
                        </div>
                      )}
                      <div className="kv-row">
                        <span className="k">Account Number</span>
                        <span className="v">{selectedReceipt.accountNumber || selectedReceipt.account?.accountNumber || selectedReceipt.sourceAccount?.accountNumber}</span>
                      </div>
                      <div className="kv-row">
                        <span className="k">Payment Method</span>
                        <span className="v">
                          {isTransfer
                            ? 'INTERNAL (Three-Branch Core Grid Transfer)'
                            : isWithdrawal
                            ? 'CASH (Branch Counter Disbursal)'
                            : 'CASH (Branch Counter Deposit)'}
                        </span>
                      </div>
                      <div className="kv-row">
                        <span className="k">Previous Balance</span>
                        <span className="v">₹{Number(selectedReceipt.previousBalance || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                      </div>
                      <div className="kv-row">
                        <span className="k">Updated Balance</span>
                        <span className="v" style={{ color: isWithdrawal ? '#B23A2E' : '#5C187B' }}>
                          ₹{Number(selectedReceipt.updatedBalance || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                      <div className="kv-row">
                        <span className="k">Branch</span>
                        <span className="v">
                          {selectedReceipt.branch || selectedReceipt.sourceAccount?.branch || 'Kochi Main'}
                          {isTransfer && selectedReceipt.destinationAccount?.branch ? ` → ${selectedReceipt.destinationAccount.branch}` : ''}
                        </span>
                      </div>
                      <div className="kv-row">
                        <span className="k">Date & Timestamp</span>
                        <span className="v">{new Date(selectedReceipt.timestamp || selectedReceipt.completedAt || selectedReceipt.initiatedAt).toLocaleString()}</span>
                      </div>

                      <div style={{ display: 'flex', gap: '8px', marginTop: '20px' }}>
                        {(isWithdrawal || isTransfer) && (
                          <button
                            onClick={handleDownloadPdf}
                            disabled={downloadingPdf}
                            className="btn-primary"
                            style={{ flex: 1.2, padding: '10px', fontSize: '13px', backgroundColor: '#5C187B', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                          >
                            <Download size={16} /> {downloadingPdf ? 'Downloading...' : 'PDF Receipt'}
                          </button>
                        )}
                        <button onClick={() => window.print()} className="btn-secondary" style={{ flex: 1, padding: '10px', fontSize: '13px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                          <Printer size={16} /> Print
                        </button>
                        <button onClick={() => setReceiptModalOpen(false)} className="btn-secondary" style={{ flex: 1, padding: '10px', fontSize: '13px' }}>
                          Close
                        </button>
                      </div>
                    </>
                  );
                })()}
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '30px', color: '#B23A2E' }}>
                Could not load receipt details.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;