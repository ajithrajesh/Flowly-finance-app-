import { useEffect, useState, useCallback, useRef } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useParams } from 'react-router-dom';
import './styles.css';
import * as api from './api';
import { getSocket, disconnectSocket } from './socket';
import { PAGE_TITLES, useWorkerNavigation } from './navigation';

import Login from './components/Login';
import Sidebar from './components/Sidebar';
import Topbar from './components/Topbar';
import NotificationsDrawer from './components/NotificationsDrawer';
import Dashboard from './components/Dashboard';
import Customers from './components/Customers';
import CustomerDetail from './components/CustomerDetail';
import KycVerification from './components/KycVerification';
import VideoKyc from './components/VideoKyc';
import LoanSchemeManagement from './components/LoanSchemeManagement';
import LoanProcessing from './components/LoanProcessing';
import EmiCollections from './components/EmiCollections';
import FdSchemeManagement from './components/FdSchemeManagement';
import FdProcessing from './components/FdProcessing';
import CashDeposit from './components/CashDeposit';
import CashWithdrawal from './components/CashWithdrawal';
import Tickets from './components/Tickets';
import Modal from './components/Modal';

function CustomerDetailRoute({
  customers,
  selectedCustomerId,
  setSelectedCustomerId,
  setCustomers,
  onBackToCustomers,
  onGoToKyc,
  onToast,
  onCustomerUpdated,
}) {
  const { id } = useParams();
  const effectiveId = id || selectedCustomerId;
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (effectiveId && selectedCustomerId !== effectiveId) {
      setSelectedCustomerId(effectiveId);
    }
  }, [effectiveId, selectedCustomerId, setSelectedCustomerId]);

  useEffect(() => {
    if (!effectiveId) return;
    const exists = customers.some((c) => c.id === effectiveId);
    if (!exists) {
      let isMounted = true;
      setLoading(true);
      api
        .fetchCustomerById(effectiveId)
        .then((c) => {
          if (isMounted && c) {
            setCustomers((prev) => (prev.some((x) => x.id === c.id) ? prev : [...prev, c]));
          }
        })
        .catch((err) => {
          if (isMounted) onToast(err.message || 'Could not load customer');
        })
        .finally(() => {
          if (isMounted) setLoading(false);
        });
      return () => {
        isMounted = false;
      };
    }
  }, [effectiveId, customers, setCustomers, onToast]);

  const customer = customers.find((c) => c.id === effectiveId);

  if (loading && !customer) {
    return <div className="loading-panel">Loading customer…</div>;
  }

  if (!customer) {
    return (
      <div className="panel" style={{ padding: '24px', textAlign: 'center' }}>
        <p style={{ color: '#64748B', marginBottom: '16px' }}>Customer not found.</p>
        <button className="btn-outline btn-sm" onClick={onBackToCustomers}>
          ← Back to customers
        </button>
      </div>
    );
  }

  return (
    <CustomerDetail
      customer={customer}
      onBackToCustomers={onBackToCustomers}
      onGoToKyc={onGoToKyc}
      onToast={onToast}
      onCustomerUpdated={onCustomerUpdated}
    />
  );
}

function WorkerApp() {
  // ---- auth ---------------------------------------------------------
  const [worker, setWorker] = useState(api.getStoredWorker());
  const [authChecked, setAuthChecked] = useState(false);

  const isSupport = worker?.role === 'support' || worker?.workerRole === 'support';
  const defaultRoutePath = isSupport ? '/tickets' : '/dashboard';

  // ---- router & history management ----------------------------------
  const { currentRoute, pathname, navigate, goBack } = useWorkerNavigation(defaultRoutePath);

  useEffect(() => {
    if (!api.getToken()) {
      setAuthChecked(true);
      return;
    }
    api
      .fetchMe()
      .then((me) => {
        setWorker(me);
      })
      .catch(() => setWorker(null))
      .finally(() => setAuthChecked(true));
  }, []);

  const [searchTerm, setSearchTerm] = useState('');

  // ---- customers -------------------------------------------------------
  const [customers, setCustomers] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [page, setPage] = useState(1);
  const [customersLoading, setCustomersLoading] = useState(false);
  const [customersError, setCustomersError] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState(null);

  const loadCustomers = useCallback(async (p = 1, search = '') => {
    setCustomersLoading(true);
    setCustomersError('');
    try {
      const data = await api.fetchCustomers({ page: p, limit: 20, search });
      if (data && Array.isArray(data.customers)) {
        setCustomers(data.customers);
        setPagination(data.pagination);
      } else {
        setCustomers([]);
        setCustomersError(data?.message || 'Unexpected response format while loading customers.');
      }
    } catch (err) {
      setCustomers([]);
      setCustomersError(err.message || 'Failed to load customers');
    } finally {
      setCustomersLoading(false);
    }
  }, []);

  // ---- KYC queue -------------------------------------------------------
  const [kycQueue, setKycQueue] = useState([]);
  const [kycSelectedId, setKycSelectedId] = useState(null);
  const [kycLoading, setKycLoading] = useState(false);
  const [kycError, setKycError] = useState('');

  const loadKycQueue = useCallback(async () => {
    setKycLoading(true);
    setKycError('');
    try {
      const data = await api.fetchKycQueue();
      if (Array.isArray(data)) {
        setKycQueue(data);
      } else {
        setKycQueue([]);
        setKycError(data?.message || 'Failed to load KYC queue');
      }
    } catch (err) {
      setKycQueue([]);
      setKycError(err.message || 'Failed to load KYC queue');
    } finally {
      setKycLoading(false);
    }
  }, []);

  // Initial data load, once logged in
  useEffect(() => {
    if (worker) {
      loadCustomers(1, '');
      loadKycQueue();
    }
  }, [worker, loadCustomers, loadKycQueue]);

  // ---- toast -------------------------------------------------------
  const [toast, setToast] = useState('');
  const toastTimerRef = useRef(null);

  const showToast = useCallback((msg) => {
    setToast(msg);
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => setToast(''), 2800);
  }, []);

  // ---- modal / confirm actions -----------------------------------------
  const [modal, setModal] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const openConfirm = (kind, name, extra) => setModal({ type: 'confirm', kind, name, extra });
  const closeModal = () => setModal(null);

  const handleConfirm = async (kind, _name, extra) => {
    if (!kycSelectedId && kind !== 'add-customer') return;
    setSubmitting(true);
    try {
      if (kind === 'approve-kyc') {
        const res = await api.approveKyc(kycSelectedId);
        showToast(res?.message || 'KYC approved');
      } else if (kind === 'reject-kyc') {
        const res = await api.rejectKyc(kycSelectedId, extra?.reason || '');
        showToast(res?.message || 'KYC rejected');
      } else if (kind === 'request-doc') {
        const rec = kycQueue.find((k) => k.id === kycSelectedId);
        if (rec) {
          await api.requestKycDocument(rec?.userId, rec?.name);
          showToast('Document request sent');
        } else {
          showToast('Customer record not found for document request');
        }
      } else {
        showToast(`Unrecognized action: ${kind}`);
      }
      await loadKycQueue();
      await loadCustomers(page, searchTerm);
      closeModal();
    } catch (err) {
      showToast(err.message || 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  };

  // ---- notifications & socket -------------------------------------------
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const loadUnreadCount = useCallback(async () => {
    if (!worker) return;
    try {
      const res = await api.fetchWorkerNotifications({ limit: 1 });
      setUnreadCount(res.unreadCount || 0);
    } catch {
      // non-critical
    }
  }, [worker]);

  useEffect(() => {
    if (!worker) {
      disconnectSocket();
      setUnreadCount(0);
      return;
    }

    loadUnreadCount();
    getSocket();

    const handleUnread = (e) => {
      const count = e.detail?.unreadCount;
      if (typeof count === 'number') {
        setUnreadCount(count);
      }
    };

    const handleNewNotif = (e) => {
      const notif = e.detail;
      if (!notif) return;
      setUnreadCount((prev) => prev + 1);
      showToast(`🔔 ${notif.title || 'Staff Alert'}: ${notif.message || ''}`);
    };

    const handleAllRead = () => {
      setUnreadCount(0);
    };

    window.addEventListener('flowly:worker:unread-count', handleUnread);
    window.addEventListener('flowly:worker:new-notification', handleNewNotif);
    window.addEventListener('flowly:worker:notifications-all-read', handleAllRead);

    return () => {
      window.removeEventListener('flowly:worker:unread-count', handleUnread);
      window.removeEventListener('flowly:worker:new-notification', handleNewNotif);
      window.removeEventListener('flowly:worker:notifications-all-read', handleAllRead);
    };
  }, [worker, loadUnreadCount, showToast]);

  // ---- navigation handlers ----------------------------------------------
  const handleNavigate = useCallback(
    (key, options) => {
      navigate(key, options);
    },
    [navigate]
  );

  const handleOpenCustomer = useCallback(
    async (id) => {
      setSelectedCustomerId(id);
      navigate(`/customers/${id}`);
      if (!customers.find((c) => c.id === id)) {
        try {
          const c = await api.fetchCustomerById(id);
          if (c) {
            setCustomers((prev) => (prev.some((x) => x.id === c.id) ? prev : [...prev, c]));
          }
        } catch (err) {
          showToast(err.message || 'Could not load customer');
        }
      }
    },
    [customers, navigate, showToast]
  );

  const handleBackToCustomers = useCallback(() => {
    goBack('/customers');
  }, [goBack]);

  const handleCustomerUpdated = (updated) => {
    if (!updated?.id) return;
    setCustomers((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
  };

  const handleSelectKyc = (id) => setKycSelectedId(id);

  const handlePageChange = (p) => {
    setPage(p);
    loadCustomers(p, searchTerm);
  };

  const handleSearch = (value) => {
    setSearchTerm(value);
    setPage(1);
    loadCustomers(1, value);
    if (value && currentRoute !== 'customers' && currentRoute !== 'customer-detail') {
      navigate('/customers');
    }
  };

  const handleLogout = () => {
    api.logoutWorker();
    disconnectSocket();
    setWorker(null);
    navigate('/', { replace: true });
  };

  const handleLoggedIn = (w) => {
    setWorker(w);
    const isSupportRole = w?.role === 'support' || w?.workerRole === 'support';
    const fallbackDefault = isSupportRole ? '/tickets' : '/dashboard';
    const destination =
      pathname && pathname !== '/' && pathname !== '/dashboard'
        ? pathname
        : fallbackDefault;
    navigate(destination, { replace: true });
  };

  // ---- render ------------------------------------------------------------
  if (!authChecked) {
    return <div className="loading-panel">Loading…</div>;
  }

  if (!worker) {
    return <Login onLoggedIn={handleLoggedIn} />;
  }

  return (
    <div className="flex h-screen">
      <Sidebar route={currentRoute} onNavigate={handleNavigate} worker={worker} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          pageTitle={PAGE_TITLES[currentRoute] || currentRoute}
          worker={worker}
          onSearch={handleSearch}
          unreadCount={unreadCount}
          onNotify={() => setNotificationsOpen(true)}
          onProfile={handleLogout}
        />
        <main className="flex-1 overflow-y-auto px-[22px] py-5">
          <Routes>
            <Route path="/" element={<Navigate to={defaultRoutePath} replace />} />
            <Route
              path="/dashboard"
              element={
                <Dashboard
                  onNavigate={handleNavigate}
                  onSelectKyc={(id) => {
                    setKycSelectedId(id);
                    handleNavigate('kyc');
                  }}
                />
              }
            />
            <Route
              path="/customers"
              element={
                customersLoading ? (
                  <div className="loading-panel">Loading customers…</div>
                ) : customersError ? (
                  <div className="error-banner">{customersError}</div>
                ) : (
                  <Customers
                    customers={customers}
                    pagination={pagination}
                    page={page}
                    onPageChange={handlePageChange}
                    searchTerm={searchTerm}
                    onOpenCustomer={handleOpenCustomer}
                  />
                )
              }
            />
            <Route
              path="/customers/:id"
              element={
                <CustomerDetailRoute
                  customers={customers}
                  selectedCustomerId={selectedCustomerId}
                  setSelectedCustomerId={setSelectedCustomerId}
                  setCustomers={setCustomers}
                  onBackToCustomers={handleBackToCustomers}
                  onGoToKyc={() => handleNavigate('kyc')}
                  onToast={showToast}
                  onCustomerUpdated={handleCustomerUpdated}
                />
              }
            />
            <Route
              path="/customer-detail"
              element={
                selectedCustomerId ? (
                  <Navigate to={`/customers/${selectedCustomerId}`} replace />
                ) : (
                  <Navigate to="/customers" replace />
                )
              }
            />
            <Route
              path="/customer-detail/:id"
              element={
                <CustomerDetailRoute
                  customers={customers}
                  selectedCustomerId={selectedCustomerId}
                  setSelectedCustomerId={setSelectedCustomerId}
                  setCustomers={setCustomers}
                  onBackToCustomers={handleBackToCustomers}
                  onGoToKyc={() => handleNavigate('kyc')}
                  onToast={showToast}
                  onCustomerUpdated={handleCustomerUpdated}
                />
              }
            />
            <Route
              path="/kyc"
              element={
                kycLoading ? (
                  <div className="loading-panel">Loading KYC queue…</div>
                ) : kycError ? (
                  <div className="error-banner">{kycError}</div>
                ) : (
                  <KycVerification
                    kycQueue={kycQueue}
                    kycSelectedId={kycSelectedId}
                    onSelect={handleSelectKyc}
                    customers={customers}
                    onOpenConfirm={openConfirm}
                    onToast={showToast}
                    onNavigate={handleNavigate}
                    onKycChanged={loadKycQueue}
                  />
                )
              }
            />
            <Route
              path="/video-kyc"
              element={
                <VideoKyc
                  kycQueue={kycQueue}
                  customers={customers}
                  onToast={showToast}
                  onKycChanged={loadKycQueue}
                />
              }
            />
            <Route path="/cash-deposit" element={<CashDeposit onToast={showToast} />} />
            <Route path="/cash-withdrawal" element={<CashWithdrawal onToast={showToast} />} />
            <Route path="/loan-schemes" element={<LoanSchemeManagement onToast={showToast} />} />
            <Route path="/loan" element={<LoanProcessing onToast={showToast} />} />
            <Route path="/emi" element={<EmiCollections onToast={showToast} worker={worker} />} />
            <Route path="/fd-schemes" element={<FdSchemeManagement onToast={showToast} />} />
            <Route path="/fd" element={<FdProcessing onToast={showToast} />} />
            <Route path="/tickets" element={<Tickets onToast={showToast} worker={worker} />} />
            {/* Fallback route */}
            <Route
              path="*"
              element={
                <div className="panel" style={{ padding: '24px', textAlign: 'center' }}>
                  <h3 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '8px' }}>Page Not Found</h3>
                  <p style={{ color: '#64748B', marginBottom: '16px' }}>The requested page does not exist.</p>
                  <button className="btn-outline btn-sm" onClick={() => handleNavigate('dashboard')}>
                    Return to Dashboard
                  </button>
                </div>
              }
            />
          </Routes>
        </main>
      </div>

      <Modal modal={modal} submitting={submitting} onClose={closeModal} onConfirm={handleConfirm} />

      <NotificationsDrawer
        isOpen={notificationsOpen}
        onClose={() => setNotificationsOpen(false)}
        onNavigate={handleNavigate}
        onRefreshCount={loadUnreadCount}
      />

      <div className={`toast ${toast ? 'show' : ''}`}>
        <div className="dot" />
        {toast}
      </div>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <WorkerApp />
    </BrowserRouter>
  );
}
