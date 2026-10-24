import { useEffect, useState, useCallback } from 'react';
import './styles.css';
import * as api from './api';
import { getSocket, disconnectSocket } from './socket';
import { IMPLEMENTED_ROUTES } from './data';

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
import Placeholder from './components/Placeholder';

const PAGE_TITLES = {
  dashboard: 'Dashboard',
  customers: 'Customers',
  'customer-detail': 'Customer',
  'cash-deposit': 'Offline Cash Deposit Counter',
  'cash-withdrawal': 'Offline Cash Withdrawal Counter',
  kyc: 'KYC verification',
  'video-kyc': 'Video KYC',
  'loan-schemes': 'Loan Schemes & Document Requirements',
  loan: 'Loan Processing',
  emi: 'EMI Schedules, Collections & Recovery Desk',
  'fd-schemes': 'FD Schemes Catalog Management',
  fd: 'Fixed Deposit Review & Approvals',
  tickets: 'Customer Support Tickets & Problem Resolution Desk',
};

export default function App() {
  // ---- auth ---------------------------------------------------------
  const [worker, setWorker] = useState(api.getStoredWorker());
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    if (!api.getToken()) {
      setAuthChecked(true);
      return;
    }
    api
      .fetchMe()
      .then((me) => {
        setWorker(me);
        if (me?.role === 'support' || me?.workerRole === 'support') {
          setRoute('tickets');
        }
      })
      .catch(() => setWorker(null))
      .finally(() => setAuthChecked(true));
  }, []);

  // ---- navigation ----------------------------------------------------
  const [route, setRoute] = useState(() => {
    const stored = api.getStoredWorker();
    return stored?.role === 'support' || stored?.workerRole === 'support' ? 'tickets' : 'dashboard';
  });
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
  const showToast = useCallback((msg) => {
    setToast(msg);
    window.clearTimeout(showToast._t);
    showToast._t = window.setTimeout(() => setToast(''), 2800);
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

  // ---- navigation helpers -----------------------------------------------
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

  const handleNavigate = (key) => {
    setRoute(key);
  };

  const handleOpenCustomer = async (id) => {
    setSelectedCustomerId(id);
    setRoute('customer-detail');
    // Make sure we have full details even if this customer wasn't on the current page
    if (!customers.find((c) => c.id === id)) {
      try {
        const c = await api.fetchCustomerById(id);
        setCustomers((prev) => [...prev, c]);
      } catch (err) {
        showToast(err.message || 'Could not load customer');
      }
    }
  };

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
  };

  const handleLogout = () => {
    api.logoutWorker();
    disconnectSocket();
    setWorker(null);
  };

  // ---- render ------------------------------------------------------------

  if (!authChecked) {
    return <div className="loading-panel">Loading…</div>;
  }

  const handleLoggedIn = (w) => {
    setWorker(w);
    if (w?.role === 'support' || w?.workerRole === 'support') {
      setRoute('tickets');
    } else {
      setRoute('dashboard');
    }
  };

  if (!worker) {
    return <Login onLoggedIn={handleLoggedIn} />;
  }

  const selectedCustomer = customers.find((c) => c.id === selectedCustomerId);

  let content;
  if (!IMPLEMENTED_ROUTES.includes(route)) {
    content = <Placeholder label={PAGE_TITLES[route] || route} />;
  } else if (route === 'dashboard') {
    content = (
      <Dashboard
        onNavigate={handleNavigate}
        onSelectKyc={(id) => {
          setKycSelectedId(id);
        }}
      />
    );
  } else if (route === 'customers') {
    content = customersLoading ? (
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
    );
  } else if (route === 'customer-detail') {
    content = selectedCustomer ? (
      <CustomerDetail
        customer={selectedCustomer}
        onBackToCustomers={() => setRoute('customers')}
        onGoToKyc={() => setRoute('kyc')}
        onToast={showToast}
        onCustomerUpdated={handleCustomerUpdated}
      />
    ) : (
      <div className="loading-panel">Loading customer…</div>
    );
  } else if (route === 'kyc') {
    content = kycLoading ? (
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
      />
    );
  } else if (route === 'video-kyc') {
    content = (
      <VideoKyc
        kycQueue={kycQueue}
        customers={customers}
        onToast={showToast}
        onKycChanged={loadKycQueue}
      />
    );
  } else if (route === 'cash-deposit') {
    content = <CashDeposit onToast={showToast} />;
  } else if (route === 'cash-withdrawal') {
    content = <CashWithdrawal onToast={showToast} />;
  } else if (route === 'loan-schemes') {
    content = <LoanSchemeManagement onToast={showToast} />;
  } else if (route === 'loan') {
    content = <LoanProcessing onToast={showToast} />;
  } else if (route === 'emi') {
    content = <EmiCollections onToast={showToast} worker={worker} />;
  } else if (route === 'fd-schemes') {
    content = <FdSchemeManagement onToast={showToast} />;
  } else if (route === 'fd') {
    content = <FdProcessing onToast={showToast} />;
  } else if (route === 'tickets') {
    content = <Tickets onToast={showToast} worker={worker} />;
  }

  return (
    <div className="flex h-screen">
      <Sidebar route={route} onNavigate={handleNavigate} worker={worker} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          pageTitle={PAGE_TITLES[route] || route}
          worker={worker}
          onSearch={handleSearch}
          unreadCount={unreadCount}
          onNotify={() => setNotificationsOpen(true)}
          onProfile={handleLogout}
        />
        <main className="flex-1 overflow-y-auto px-[22px] py-5">{content}</main>
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