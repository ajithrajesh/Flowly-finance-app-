import React, { useEffect, useState, useCallback } from 'react';
import * as api from '../api';

const formatRelativeTime = (dateInput) => {
  if (!dateInput) return '';
  const date = new Date(dateInput);
  const now = new Date();
  const diffMs = now - date;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHr / 24);

  if (diffSec < 45) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDays === 1) {
    return `Yesterday, ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  }
  if (diffDays < 7) {
    return `${diffDays}d ago`;
  }
  return date.toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const getAlertConfig = (type) => {
  switch (type) {
    case 'worker':
      return {
        badgeBg: '#ede9fe',
        badgeColor: '#5b21b6',
        label: 'Staff Governance',
        route: 'workers',
        actionLabel: 'Staff Roster',
      };
    case 'loan':
    case 'noc':
      return {
        badgeBg: '#d1fae5',
        badgeColor: '#065f46',
        label: 'Credit & NOC Clearance',
        route: 'noc',
        actionLabel: 'NOC Desk',
      };
    case 'kyc':
      return {
        badgeBg: '#dcfce7',
        badgeColor: '#166534',
        label: 'KYC & Compliance',
        route: 'customers',
        actionLabel: 'Registry',
      };
    case 'deposit':
    case 'withdrawal':
    case 'transfer':
      return {
        badgeBg: '#fef3c7',
        badgeColor: '#92400e',
        label: 'High-Value Flow',
        route: 'analysis',
        actionLabel: 'Financial Flow',
      };
    case 'tickets':
    case 'support':
      return {
        badgeBg: '#fee2e2',
        badgeColor: '#991b1b',
        label: 'Support Escalation',
        route: 'audit',
        actionLabel: 'Audit Logs',
      };
    default:
      return {
        badgeBg: '#f1f5f9',
        badgeColor: '#334155',
        label: 'Executive Notice',
        route: null,
        actionLabel: null,
      };
  }
};

export default function AdminDashboard({ onNavigate }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Live Governance Notifications State
  const [notifications, setNotifications] = useState([]);
  const [notifsLoading, setNotifsLoading] = useState(true);
  const [notifsError, setNotifsError] = useState('');
  const [notifFilter, setNotifFilter] = useState('all'); // 'all' | 'unread'
  const [markingAll, setMarkingAll] = useState(false);

  const loadDashboardData = useCallback(() => {
    setLoading(true);
    setError('');
    api
      .fetchBusinessAnalysis()
      .then((res) => {
        if (res && res.success !== false) {
          setData(res);
        } else {
          setError(res?.message || 'Failed to load executive dashboard data.');
        }
      })
      .catch((err) => {
        console.error('Failed to load dashboard metrics:', err);
        setError(err.message || 'Unable to connect to backend server. Please verify backend service.');
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  const loadNotifications = useCallback(async () => {
    setNotifsLoading(true);
    setNotifsError('');
    try {
      const res = await api.fetchAdminNotifications({ limit: 12 });
      if (res && Array.isArray(res.notifications)) {
        setNotifications(res.notifications);
      } else {
        setNotifications([]);
        setNotifsError(res?.message || 'Failed to retrieve admin alerts.');
      }
    } catch (err) {
      console.error('Failed to load dashboard admin notifications:', err);
      setNotifsError(err.message || 'Unable to fetch recent alerts.');
    } finally {
      setNotifsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  // Real-time socket event listeners
  useEffect(() => {
    const handleNewNotif = (e) => {
      const incoming = e.detail;
      if (!incoming) return;
      setNotifications((prev) => {
        const id = incoming._id || incoming.id;
        const exists = prev.some((n) => (n._id || n.id) === id);
        if (exists) return prev;
        return [incoming, ...prev];
      });
    };

    const handleRead = (e) => {
      const id = e.detail?.id || e.detail?.notification?._id;
      if (!id) return;
      setNotifications((prev) =>
        prev.map((n) => ((n._id || n.id) === id ? { ...n, status: 'read', isRead: true } : n))
      );
    };

    const handleAllRead = () => {
      setNotifications((prev) =>
        prev.map((n) => ({ ...n, status: 'read', isRead: true }))
      );
    };

    window.addEventListener('flowly:admin:new-notification', handleNewNotif);
    window.addEventListener('flowly:admin:notification-read', handleRead);
    window.addEventListener('flowly:admin:notifications-all-read', handleAllRead);

    return () => {
      window.removeEventListener('flowly:admin:new-notification', handleNewNotif);
      window.removeEventListener('flowly:admin:notification-read', handleRead);
      window.removeEventListener('flowly:admin:notifications-all-read', handleAllRead);
    };
  }, []);

  const handleMarkAsRead = async (id, e) => {
    if (e) e.stopPropagation();
    try {
      await api.markAdminNotificationRead(id);
      setNotifications((prev) =>
        prev.map((n) => ((n._id || n.id) === id ? { ...n, status: 'read', isRead: true } : n))
      );
    } catch (err) {
      console.error('Failed to mark admin alert read:', err);
      setNotifsError(err.message || 'Failed to update alert status.');
    }
  };

  const handleMarkAllRead = async () => {
    setMarkingAll(true);
    setNotifsError('');
    try {
      await api.markAllAdminNotificationsRead();
      setNotifications((prev) =>
        prev.map((n) => ({ ...n, status: 'read', isRead: true }))
      );
    } catch (err) {
      console.error('Failed to mark all admin alerts read:', err);
      setNotifsError(err.message || 'Failed to mark all alerts as read.');
    } finally {
      setMarkingAll(false);
    }
  };

  const formatRupees = (amt) => `₹${Number(amt || 0).toLocaleString('en-IN')}`;

  const unreadCount = notifications.filter(
    (n) => n.status === 'unread' && !n.isRead
  ).length;

  const displayedNotifications = notifications.filter((n) => {
    if (notifFilter === 'unread') {
      return n.status === 'unread' && !n.isRead;
    }
    return true;
  });

  return (
    <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {error && (
        <div style={{ padding: '14px 18px', borderRadius: '12px', backgroundColor: '#fee2e2', border: '1px solid #fecaca', color: '#b91c1c', fontSize: '13px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>⚠️ {error}</span>
          <button onClick={loadDashboardData} style={{ background: '#b91c1c', color: 'white', border: 'none', borderRadius: '6px', padding: '6px 14px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
            Retry
          </button>
        </div>
      )}
      
      {/* Executive Welcome & Key Callouts */}
      <div
        style={{
          background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%)',
          color: 'white',
          padding: '24px',
          borderRadius: '16px',
          boxShadow: '0 4px 14px rgba(15, 23, 42, 0.2)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '16px',
        }}
      >
        <div>
          <span style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px', color: '#a5b4fc', fontWeight: '700' }}>
            Executive Dashboard
          </span>
          <h2 style={{ fontSize: '22px', fontWeight: '800', marginTop: '4px' }}>
            Flowly Finance Command Center
          </h2>
          <p style={{ fontSize: '13px', color: '#cbd5e1', marginTop: '4px' }}>
            System-wide oversight across capital liquidity, staff desk throughput, and credit performance.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            onClick={() => onNavigate('analysis')}
            style={{
              padding: '10px 18px',
              borderRadius: '8px',
              border: 'none',
              background: '#6366f1',
              color: 'white',
              fontWeight: '600',
              fontSize: '13px',
              cursor: 'pointer',
              boxShadow: '0 2px 6px rgba(99, 102, 241, 0.4)',
            }}
          >
            📊 View Business Analytics
          </button>
          <button
            onClick={() => onNavigate('workers')}
            style={{
              padding: '10px 18px',
              borderRadius: '8px',
              border: '1px solid #475569',
              background: '#1e293b',
              color: 'white',
              fontWeight: '600',
              fontSize: '13px',
              cursor: 'pointer',
            }}
          >
            👥 Manage Staff Roster
          </button>
          <button
            onClick={() => onNavigate('noc')}
            style={{
              padding: '10px 18px',
              borderRadius: '8px',
              border: 'none',
              background: '#059669',
              color: 'white',
              fontWeight: '600',
              fontSize: '13px',
              cursor: 'pointer',
              boxShadow: '0 2px 6px rgba(5, 150, 105, 0.4)',
            }}
          >
            📜 NOC Clearance Desk
          </button>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
        <div style={{ background: 'white', padding: '18px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
          <div style={{ fontSize: '11px', textTransform: 'uppercase', color: '#64748b', fontWeight: '700' }}>
            Total Capital Under Management
          </div>
          <div style={{ fontSize: '24px', fontWeight: '800', color: '#0f172a', margin: '6px 0 2px' }}>
            {loading ? '...' : formatRupees(data?.summary?.totalAssetsManaged)}
          </div>
          <div style={{ fontSize: '12px', color: '#059669', fontWeight: '600' }}>
            Savings & Active FD Deposits
          </div>
        </div>

        <div style={{ background: 'white', padding: '18px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
          <div style={{ fontSize: '11px', textTransform: 'uppercase', color: '#64748b', fontWeight: '700' }}>
            Total Disbursed Loans
          </div>
          <div style={{ fontSize: '24px', fontWeight: '800', color: '#6366f1', margin: '6px 0 2px' }}>
            {loading ? '...' : formatRupees(data?.summary?.totalDisbursedLoans)}
          </div>
          <div style={{ fontSize: '12px', color: '#64748b' }}>
            Active Credit Portfolio
          </div>
        </div>

        <div style={{ background: 'white', padding: '18px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
          <div style={{ fontSize: '11px', textTransform: 'uppercase', color: '#64748b', fontWeight: '700' }}>
            Total Active Staff
          </div>
          <div style={{ fontSize: '24px', fontWeight: '800', color: '#3b82f6', margin: '6px 0 2px' }}>
            {loading ? '...' : data?.summary?.totalWorkers ?? 0}
          </div>
          <div style={{ fontSize: '12px', color: '#3b82f6', fontWeight: '600' }}>
            Desk officers & admins
          </div>
        </div>

        <div style={{ background: 'white', padding: '18px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
          <div style={{ fontSize: '11px', textTransform: 'uppercase', color: '#64748b', fontWeight: '700' }}>
            Delinquency Risk Rate
          </div>
          <div style={{ fontSize: '24px', fontWeight: '800', color: data?.summary?.overdueCount > 0 ? '#ef4444' : '#10b981', margin: '6px 0 2px' }}>
            {loading ? '...' : `${data?.summary?.defaultRiskRate ?? 0}%`}
          </div>
          <div style={{ fontSize: '12px', color: data?.summary?.overdueCount > 0 ? '#ef4444' : '#059669', fontWeight: '600' }}>
            {data?.summary?.overdueCount ?? 0} loans overdue
          </div>
        </div>
      </div>

      {/* Main Grid: Business Overview & Staff Quick View */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '20px' }}>
        
        {/* Business Analysis Preview */}
        <div style={{ background: 'white', padding: '20px', borderRadius: '14px', border: '1px solid #e2e8f0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ fontSize: '15px', fontWeight: '700', color: '#0f172a', margin: 0 }}>
              KYC & Customer Onboarding Status
            </h3>
            <button
              onClick={() => onNavigate('analysis')}
              style={{ border: 'none', background: 'none', color: '#6366f1', fontWeight: '600', fontSize: '12px', cursor: 'pointer' }}
            >
              Full Analysis ➔
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', background: '#f8fafc', borderRadius: '8px' }}>
              <span style={{ fontSize: '13px', fontWeight: '600' }}>Verified Customers</span>
              <strong style={{ color: '#10b981' }}>{data?.kycStats?.verified ?? 0}</strong>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', background: '#f8fafc', borderRadius: '8px' }}>
              <span style={{ fontSize: '13px', fontWeight: '600' }}>KYC Under Review</span>
              <strong style={{ color: '#3b82f6' }}>{data?.kycStats?.under_verification ?? 0}</strong>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', background: '#f8fafc', borderRadius: '8px' }}>
              <span style={{ fontSize: '13px', fontWeight: '600' }}>Pending Submissions</span>
              <strong style={{ color: '#f59e0b' }}>{data?.kycStats?.pending ?? 0}</strong>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', background: '#f8fafc', borderRadius: '8px' }}>
              <span style={{ fontSize: '13px', fontWeight: '600' }}>Rejected Submissions</span>
              <strong style={{ color: '#ef4444' }}>{data?.kycStats?.rejected ?? 0}</strong>
            </div>
          </div>
        </div>

        {/* Worker Monitor Preview */}
        <div style={{ background: 'white', padding: '20px', borderRadius: '14px', border: '1px solid #e2e8f0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ fontSize: '15px', fontWeight: '700', color: '#0f172a', margin: 0 }}>
              Staff Desk Operations
            </h3>
            <button
              onClick={() => onNavigate('workers')}
              style={{ border: 'none', background: 'none', color: '#6366f1', fontWeight: '600', fontSize: '12px', cursor: 'pointer' }}
            >
              Worker Monitor ➔
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ padding: '14px', background: '#f8fafc', borderRadius: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: '13px', fontWeight: '700', color: '#0f172a' }}>Worker Staff Roster</div>
                <div style={{ fontSize: '11px', color: '#64748b' }}>Active desk officers monitoring queues</div>
              </div>
              <span style={{ fontSize: '18px', fontWeight: '800', color: '#6366f1' }}>{data?.summary?.totalWorkers ?? 0}</span>
            </div>

            <div style={{ padding: '14px', background: '#f8fafc', borderRadius: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: '13px', fontWeight: '700', color: '#0f172a' }}>Active Bank Accounts</div>
                <div style={{ fontSize: '11px', color: '#64748b' }}>Verified user bank accounts</div>
              </div>
              <span style={{ fontSize: '18px', fontWeight: '800', color: '#059669' }}>{data?.summary?.activeAccounts ?? 0}</span>
            </div>

            <div style={{ padding: '14px', background: '#f8fafc', borderRadius: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: '13px', fontWeight: '700', color: '#0f172a' }}>Active FD Schemes</div>
                <div style={{ fontSize: '11px', color: '#64748b' }}>Published fixed deposit products</div>
              </div>
              <span style={{ fontSize: '18px', fontWeight: '800', color: '#3b82f6' }}>{data?.summary?.activeFdSchemes ?? 0}</span>
            </div>
          </div>
        </div>

      </div>

      {/* Real-Time Executive & Governance Alerts Widget */}
      <div
        style={{
          background: 'white',
          padding: '22px',
          borderRadius: '16px',
          border: '1px solid #e2e8f0',
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px',
            marginBottom: '16px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span
              style={{
                width: 9,
                height: 9,
                borderRadius: '50%',
                backgroundColor: '#10b981',
                boxShadow: '0 0 0 3px rgba(16, 185, 129, 0.25)',
              }}
            />
            <div>
              <h3 style={{ fontSize: '16px', fontWeight: '700', color: '#0f172a', margin: 0 }}>
                Executive & Governance Alerts
              </h3>
              <p style={{ fontSize: '12px', color: '#64748b', margin: '2px 0 0' }}>
                Real-time operational signals across high-value transfers, loan sanctions, and staff permissions
              </p>
            </div>
            {unreadCount > 0 && (
              <span
                style={{
                  backgroundColor: '#fee2e2',
                  color: '#991b1b',
                  fontSize: '11px',
                  fontWeight: 700,
                  padding: '3px 9px',
                  borderRadius: '999px',
                }}
              >
                {unreadCount} unread
              </span>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ display: 'flex', background: '#f1f5f9', padding: 2, borderRadius: '6px' }}>
              <button
                type="button"
                onClick={() => setNotifFilter('all')}
                style={{
                  border: 'none',
                  background: notifFilter === 'all' ? '#ffffff' : 'transparent',
                  padding: '5px 12px',
                  borderRadius: '5px',
                  fontSize: '12px',
                  fontWeight: 600,
                  color: notifFilter === 'all' ? '#0f172a' : '#64748b',
                  cursor: 'pointer',
                  boxShadow: notifFilter === 'all' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                }}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setNotifFilter('unread')}
                style={{
                  border: 'none',
                  background: notifFilter === 'unread' ? '#ffffff' : 'transparent',
                  padding: '5px 12px',
                  borderRadius: '5px',
                  fontSize: '12px',
                  fontWeight: 600,
                  color: notifFilter === 'unread' ? '#0f172a' : '#64748b',
                  cursor: 'pointer',
                  boxShadow: notifFilter === 'unread' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                }}
              >
                Unread only
              </button>
            </div>

            {unreadCount > 0 && (
              <button
                type="button"
                onClick={handleMarkAllRead}
                disabled={markingAll}
                style={{
                  border: '1px solid #cbd5e1',
                  background: '#ffffff',
                  color: '#475569',
                  padding: '5px 12px',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Mark all read
              </button>
            )}

            <button
              type="button"
              onClick={loadNotifications}
              style={{
                border: 'none',
                background: 'transparent',
                color: '#6366f1',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Refresh
            </button>
          </div>
        </div>

        {notifsLoading ? (
          <div style={{ padding: '30px', textAlign: 'center', color: '#64748b', fontSize: '13px' }}>
            Loading governance stream…
          </div>
        ) : displayedNotifications.length === 0 ? (
          <div
            style={{
              padding: '36px 20px',
              textAlign: 'center',
              backgroundColor: '#f8fafc',
              borderRadius: '12px',
              border: '1px dashed #cbd5e1',
            }}
          >
            <div style={{ fontSize: '24px', marginBottom: '6px' }}>⚡</div>
            <div style={{ fontWeight: 600, color: '#0f172a', fontSize: '14px' }}>
              {notifFilter === 'unread' ? 'No unread alerts' : 'No governance events recorded'}
            </div>
            <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
              Critical actions such as high-value transfers, loan disbursements, and staff account modifications will stream here in real time.
            </div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '12px' }}>
            {displayedNotifications.map((notif) => {
              const id = notif._id || notif.id;
              const isUnread = notif.status === 'unread' && !notif.isRead;
              const cfg = getAlertConfig(notif.type);

              return (
                <div
                  key={id}
                  style={{
                    padding: '14px 16px',
                    borderRadius: '12px',
                    border: isUnread ? '1px solid #c7d2fe' : '1px solid #e2e8f0',
                    backgroundColor: isUnread ? '#faf5ff' : '#ffffff',
                    borderLeft: isUnread ? '4px solid #6366f1' : '1px solid #e2e8f0',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    gap: '8px',
                    boxShadow: isUnread ? '0 2px 6px rgba(99, 102, 241, 0.08)' : 'none',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span
                          style={{
                            fontSize: '10px',
                            fontWeight: 700,
                            padding: '2px 7px',
                            borderRadius: '4px',
                            backgroundColor: cfg.badgeBg,
                            color: cfg.badgeColor,
                            textTransform: 'uppercase',
                            letterSpacing: '0.4px',
                          }}
                        >
                          {cfg.label}
                        </span>
                        <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                          {formatRelativeTime(notif.createdAt)}
                        </span>
                      </div>

                      {isUnread && (
                        <button
                          type="button"
                          onClick={(e) => handleMarkAsRead(id, e)}
                          style={{
                            border: 'none',
                            background: 'transparent',
                            color: '#6366f1',
                            fontSize: '11px',
                            fontWeight: 600,
                            cursor: 'pointer',
                          }}
                        >
                          Mark read
                        </button>
                      )}
                    </div>

                    <div style={{ fontSize: '13.5px', fontWeight: isUnread ? 700 : 600, color: '#0f172a', lineHeight: 1.3 }}>
                      {notif.title}
                    </div>

                    <div style={{ fontSize: '12.5px', color: '#475569', marginTop: '3px', lineHeight: 1.4 }}>
                      {notif.message}
                    </div>

                    {notif.meta && Object.keys(notif.meta).length > 0 && (
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '6px' }}>
                        {notif.meta.amount && (
                          <span
                            style={{
                              fontSize: '11px',
                              fontWeight: 700,
                              backgroundColor: '#dcfce7',
                              color: '#166534',
                              padding: '2px 7px',
                              borderRadius: '4px',
                            }}
                          >
                            ₹{Number(notif.meta.amount).toLocaleString('en-IN')}
                          </span>
                        )}
                        {notif.meta.role && (
                          <span
                            style={{
                              fontSize: '11px',
                              backgroundColor: '#ede9fe',
                              color: '#5b21b6',
                              padding: '2px 7px',
                              borderRadius: '4px',
                              fontWeight: 600,
                            }}
                          >
                            Staff: {notif.meta.role}
                          </span>
                        )}
                        {notif.meta.loanId && (
                          <span
                            style={{
                              fontSize: '11px',
                              backgroundColor: '#f1f5f9',
                              color: '#475569',
                              padding: '2px 7px',
                              borderRadius: '4px',
                              fontFamily: 'monospace',
                            }}
                          >
                            Loan #{String(notif.meta.loanId).slice(-6)}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {cfg.route && (
                    <div style={{ paddingTop: '6px', borderTop: '1px dashed #f1f5f9' }}>
                      <button
                        type="button"
                        onClick={() => {
                          if (isUnread) handleMarkAsRead(id);
                          onNavigate(cfg.route);
                        }}
                        style={{
                          border: 'none',
                          background: 'transparent',
                          color: '#4f46e5',
                          fontSize: '11.5px',
                          fontWeight: 700,
                          cursor: 'pointer',
                          padding: 0,
                        }}
                      >
                        {cfg.actionLabel} ➔
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

    </div>
  );
}
