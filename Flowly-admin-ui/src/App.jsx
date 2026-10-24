import React, { useEffect, useState, useCallback } from 'react';
import './styles.css';
import * as api from './api';
import { getSocket, disconnectSocket } from './socket';

import AdminLogin from './components/AdminLogin';
import AdminSidebar from './components/AdminSidebar';
import AdminTopbar from './components/AdminTopbar';
import AdminNotificationsDrawer from './components/AdminNotificationsDrawer';

import AdminDashboard from './pages/AdminDashboard';
import BusinessAnalysisPage from './pages/BusinessAnalysisPage';
import WorkerMonitorPage from './pages/WorkerMonitorPage';
import CustomerOverviewPage from './pages/CustomerOverviewPage';
import NocManagementPage from './pages/NocManagementPage';
import AuditLogsPage from './pages/AuditLogsPage';

const PAGE_TITLES = {
  dashboard: 'Executive Overview Dashboard',
  analysis: 'Business Analysis & Financial Analytics',
  workers: 'Worker Monitor & Staff Governance',
  customers: 'Customer Accounts Registry',
  noc: 'NOC Verification & Official Bank Issuance',
  audit: 'Security Audit & Event Logs',
};

export default function App() {
  const [admin, setAdmin] = useState(api.getStoredAdmin());
  const [authChecked, setAuthChecked] = useState(false);
  const [route, setRoute] = useState('dashboard');
  const [unreadCount, setUnreadCount] = useState(0);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [toast, setToast] = useState(null);

  const loadUnreadCount = useCallback(async () => {
    try {
      const res = await api.fetchAdminNotifications({ limit: 1 });
      setUnreadCount(res.unreadCount || 0);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (!api.getToken()) {
      setAuthChecked(true);
      return;
    }
    api
      .fetchMe()
      .then((me) => setAdmin(me))
      .catch(() => setAdmin(null))
      .finally(() => setAuthChecked(true));
  }, []);

  // Socket and notification listeners
  useEffect(() => {
    if (!admin) {
      disconnectSocket();
      return;
    }

    loadUnreadCount();
    getSocket();

    const handleUnread = (e) => {
      if (typeof e.detail?.unreadCount === 'number') {
        setUnreadCount(e.detail.unreadCount);
      }
    };

    const handleNewNotif = (e) => {
      const notif = e.detail;
      setUnreadCount((prev) => prev + 1);
      if (notif) {
        setToast({
          title: notif.title || 'Administrative Alert',
          message: notif.message || '',
        });
        window.clearTimeout(handleNewNotif._t);
        handleNewNotif._t = window.setTimeout(() => setToast(null), 4500);
      }
    };

    const handleAllRead = () => {
      setUnreadCount(0);
    };

    window.addEventListener('flowly:admin:unread-count', handleUnread);
    window.addEventListener('flowly:admin:new-notification', handleNewNotif);
    window.addEventListener('flowly:admin:notifications-all-read', handleAllRead);

    return () => {
      window.removeEventListener('flowly:admin:unread-count', handleUnread);
      window.removeEventListener('flowly:admin:new-notification', handleNewNotif);
      window.removeEventListener('flowly:admin:notifications-all-read', handleAllRead);
    };
  }, [admin, loadUnreadCount]);

  const handleLogout = () => {
    api.logoutAdmin();
    disconnectSocket();
    setAdmin(null);
  };

  if (!authChecked) {
    return (
      <div className="loading-panel" style={{ height: '100vh', background: '#0f172a', color: 'white' }}>
        <div className="spinner" style={{ borderTopColor: '#6366f1' }} />
        <p style={{ marginTop: '14px', fontSize: '13px', color: '#94a3b8' }}>Verifying admin credentials...</p>
      </div>
    );
  }

  if (!admin) {
    return <AdminLogin onLoggedIn={setAdmin} />;
  }

  let content;
  if (route === 'dashboard') {
    content = <AdminDashboard onNavigate={setRoute} />;
  } else if (route === 'analysis') {
    content = <BusinessAnalysisPage />;
  } else if (route === 'workers') {
    content = <WorkerMonitorPage />;
  } else if (route === 'customers') {
    content = <CustomerOverviewPage />;
  } else if (route === 'noc') {
    content = <NocManagementPage />;
  } else if (route === 'audit') {
    content = <AuditLogsPage />;
  }

  return (
    <div className="admin-shell">
      <AdminSidebar route={route} onNavigate={setRoute} admin={admin} />
      <div className="admin-main">
        <AdminTopbar
          title={PAGE_TITLES[route] || 'Admin Dashboard'}
          onLogout={handleLogout}
          unreadCount={unreadCount}
          onOpenNotifications={() => setNotificationsOpen(true)}
        />
        <div className="admin-content">{content}</div>
      </div>

      {/* Slide-out Administrative Notifications Drawer */}
      <AdminNotificationsDrawer
        isOpen={notificationsOpen}
        onClose={() => setNotificationsOpen(false)}
        onNavigate={setRoute}
        onRefreshCount={loadUnreadCount}
      />

      {/* Real-Time Floating Alert Banner */}
      {toast && (
        <div
          onClick={() => {
            setToast(null);
            setRoute('noc');
          }}
          style={{
            position: 'fixed',
            bottom: '24px',
            right: '24px',
            maxWidth: '380px',
            backgroundColor: '#0f172a',
            color: '#f8fafc',
            border: '1px solid #059669',
            borderRadius: '12px',
            padding: '14px 18px',
            boxShadow: '0 10px 30px rgba(0, 0, 0, 0.4)',
            cursor: 'pointer',
            zIndex: 99999,
            display: 'flex',
            alignItems: 'flex-start',
            gap: '12px',
            animation: 'fadeInUp 0.25s ease-out',
          }}
        >
          <div
            style={{
              width: 10,
              height: 10,
              borderRadius: '50%',
              backgroundColor: '#10b981',
              boxShadow: '0 0 0 3px rgba(16, 185, 129, 0.4)',
              marginTop: '4px',
              flexShrink: 0,
            }}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#f8fafc' }}>
              {toast.title}
            </div>
            <div style={{ fontSize: '12px', color: '#cbd5e1', marginTop: '2px', lineHeight: 1.3 }}>
              {toast.message}
            </div>
            <div style={{ fontSize: '11px', color: '#6ee7b7', marginTop: '6px', fontWeight: 600 }}>
              Click to view in NOC Desk ➔
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
