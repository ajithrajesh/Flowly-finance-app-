import React, { useState, useEffect, useMemo } from 'react';
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

const getAdminTypeConfig = (type) => {
  switch (type) {
    case 'worker':
      return {
        badgeBg: '#ede9fe',
        badgeColor: '#5b21b6',
        label: 'Staff Governance',
        route: 'workers',
        actionLabel: 'Worker Monitor',
      };
    case 'loan':
      return {
        badgeBg: '#e0e7ff',
        badgeColor: '#3730a3',
        label: 'Credit & Loans',
        route: 'analysis',
        actionLabel: 'Financial Analytics',
      };
    case 'kyc':
      return {
        badgeBg: '#dcfce7',
        badgeColor: '#166534',
        label: 'KYC & Compliance',
        route: 'customers',
        actionLabel: 'Customer Registry',
      };
    case 'deposit':
    case 'withdrawal':
    case 'transfer':
      return {
        badgeBg: '#fef3c7',
        badgeColor: '#92400e',
        label: 'High-Value Flow',
        route: 'analysis',
        actionLabel: 'View Analytics',
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

export default function AdminNotificationsDrawer({
  isOpen,
  onClose,
  onNavigate,
  onRefreshCount,
}) {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);
  const [drawerError, setDrawerError] = useState('');
  const [activeTab, setActiveTab] = useState('all'); // 'all' | 'unread'
  const [actionInProgress, setActionInProgress] = useState(false);

  const fetchNotifications = async () => {
    if (!isOpen) return;
    setLoading(true);
    setDrawerError('');
    try {
      const data = await api.fetchAdminNotifications({ limit: 40 });
      if (data && Array.isArray(data.notifications)) {
        setNotifications(data.notifications);
      } else {
        setNotifications([]);
        setDrawerError(data?.message || 'Failed to load notifications.');
      }
      if (typeof onRefreshCount === 'function') {
        onRefreshCount();
      }
    } catch (err) {
      console.error('Failed to load admin notifications:', err);
      setDrawerError(err.message || 'Unable to load notifications.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotifications();
  }, [isOpen]);

  // Real-time listener for incoming events while drawer is mounted
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
      if (typeof onRefreshCount === 'function') {
        onRefreshCount();
      }
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
  }, [onRefreshCount]);

  const handleMarkAsRead = async (id, e) => {
    if (e) e.stopPropagation();
    try {
      await api.markAdminNotificationRead(id);
      setNotifications((prev) =>
        prev.map((n) => ((n._id || n.id) === id ? { ...n, status: 'read', isRead: true } : n))
      );
      if (typeof onRefreshCount === 'function') {
        onRefreshCount();
      }
    } catch (err) {
      console.error('Failed to mark read:', err);
      setDrawerError(err.message || 'Failed to mark notification as read.');
    }
  };

  const handleMarkAllRead = async () => {
    setActionInProgress(true);
    setDrawerError('');
    try {
      await api.markAllAdminNotificationsRead();
      setNotifications((prev) =>
        prev.map((n) => ({ ...n, status: 'read', isRead: true }))
      );
      if (typeof onRefreshCount === 'function') {
        onRefreshCount();
      }
    } catch (err) {
      console.error('Failed to mark all read:', err);
      setDrawerError(err.message || 'Failed to mark all notifications as read.');
    } finally {
      setActionInProgress(false);
    }
  };

  const handleDelete = async (id, e) => {
    if (e) e.stopPropagation();
    try {
      await api.deleteAdminNotification(id);
      setNotifications((prev) => prev.filter((n) => (n._id || n.id) !== id));
      if (typeof onRefreshCount === 'function') {
        onRefreshCount();
      }
    } catch (err) {
      console.error('Failed to delete notification:', err);
      setDrawerError(err.message || 'Failed to delete notification.');
    }
  };

  const isUnread = (item) => item.status === 'unread' && !item.isRead;

  const filteredList = useMemo(() => {
    if (activeTab === 'unread') {
      return notifications.filter(isUnread);
    }
    return notifications;
  }, [notifications, activeTab]);

  const unreadCount = useMemo(() => {
    return notifications.filter(isUnread).length;
  }, [notifications]);

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        justifyContent: 'flex-end',
      }}
    >
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.55)',
          backdropFilter: 'blur(3px)',
          transition: 'opacity 0.2s ease',
        }}
      />

      {/* Slide-out Panel */}
      <div
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: '460px',
          height: '100%',
          backgroundColor: '#ffffff',
          boxShadow: '-8px 0 24px rgba(15, 23, 42, 0.25)',
          display: 'flex',
          flexDirection: 'column',
          zIndex: 10000,
          animation: 'slideInRight 0.22s ease-out',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '18px 22px',
            borderBottom: '1px solid #e2e8f0',
            backgroundColor: '#0f172a',
            color: '#f8fafc',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  backgroundColor: '#10b981',
                  boxShadow: '0 0 0 3px rgba(16, 185, 129, 0.3)',
                }}
              />
              <h3 style={{ fontSize: '16px', fontWeight: 700, margin: 0, color: '#f8fafc' }}>
                Governance & Executive Alerts
              </h3>
            </div>
            <p style={{ fontSize: '12px', color: '#94a3b8', margin: '4px 0 0 16px' }}>
              Live administrative feeds across staff, credit, and high-value flows
            </p>
          </div>

          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              fontSize: '20px',
              cursor: 'pointer',
              lineHeight: 1,
              padding: '6px',
              borderRadius: '6px',
            }}
            title="Close Drawer"
          >
            ✕
          </button>
        </div>

        {/* Action Controls & Tab Filters */}
        <div
          style={{
            padding: '12px 20px',
            borderBottom: '1px solid #f1f5f9',
            backgroundColor: '#f8fafc',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', gap: '4px', background: '#e2e8f0', padding: 2, borderRadius: '6px' }}>
            <button
              type="button"
              onClick={() => setActiveTab('all')}
              style={{
                border: 'none',
                background: activeTab === 'all' ? '#ffffff' : 'transparent',
                padding: '5px 12px',
                borderRadius: '5px',
                fontSize: '12px',
                fontWeight: 600,
                color: activeTab === 'all' ? '#0f172a' : '#64748b',
                cursor: 'pointer',
                boxShadow: activeTab === 'all' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
              }}
            >
              All ({notifications.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('unread')}
              style={{
                border: 'none',
                background: activeTab === 'unread' ? '#ffffff' : 'transparent',
                padding: '5px 12px',
                borderRadius: '5px',
                fontSize: '12px',
                fontWeight: 600,
                color: activeTab === 'unread' ? '#0f172a' : '#64748b',
                cursor: 'pointer',
                boxShadow: activeTab === 'unread' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
              }}
            >
              Unread ({unreadCount})
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={handleMarkAllRead}
                disabled={actionInProgress}
                style={{
                  border: '1px solid #cbd5e1',
                  background: '#ffffff',
                  color: '#475569',
                  padding: '5px 10px',
                  borderRadius: '6px',
                  fontSize: '11.5px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Mark all read
              </button>
            )}
            <button
              type="button"
              onClick={fetchNotifications}
              style={{
                border: 'none',
                background: 'transparent',
                color: '#6366f1',
                fontSize: '11.5px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Refresh
            </button>
          </div>
        </div>

        {drawerError && (
          <div style={{ padding: '10px 16px', background: '#fee2e2', borderBottom: '1px solid #fecaca', color: '#b91c1c', fontSize: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>⚠️ {drawerError}</span>
            <button onClick={() => setDrawerError('')} style={{ background: 'none', border: 'none', color: '#b91c1c', fontWeight: 'bold', cursor: 'pointer' }}>×</button>
          </div>
        )}

        {/* Notifications Feed */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
          {loading ? (
            <div style={{ padding: '40px 20px', textAlign: 'center', color: '#64748b', fontSize: '13px' }}>
              Loading alerts…
            </div>
          ) : filteredList.length === 0 ? (
            <div
              style={{
                padding: '48px 24px',
                textAlign: 'center',
                backgroundColor: '#f8fafc',
                borderRadius: '12px',
                border: '1px dashed #cbd5e1',
                marginTop: '16px',
              }}
            >
              <div style={{ fontSize: '28px', marginBottom: '8px' }}>🔔</div>
              <div style={{ fontWeight: 600, color: '#0f172a', fontSize: '14px' }}>
                {activeTab === 'unread' ? 'No unread alerts' : 'No governance alerts recorded'}
              </div>
              <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px', maxWidth: '300px', marginInline: 'auto' }}>
                High-value transactions, staff account actions, loan approvals, and KYC submissions will appear here in real time.
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {filteredList.map((notif) => {
                const id = notif._id || notif.id;
                const unread = isUnread(notif);
                const cfg = getAdminTypeConfig(notif.type);

                return (
                  <div
                    key={id}
                    style={{
                      padding: '12px 14px',
                      borderRadius: '10px',
                      border: unread ? '1px solid #c7d2fe' : '1px solid #e2e8f0',
                      backgroundColor: unread ? '#f5f3ff' : '#ffffff',
                      borderLeft: unread ? '4px solid #6366f1' : '1px solid #e2e8f0',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '6px',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span
                          style={{
                            fontSize: '10.5px',
                            fontWeight: 700,
                            padding: '2px 7px',
                            borderRadius: '4px',
                            backgroundColor: cfg.badgeBg,
                            color: cfg.badgeColor,
                          }}
                        >
                          {cfg.label}
                        </span>
                        <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                          {formatRelativeTime(notif.createdAt)}
                        </span>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {unread && (
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
                            title="Mark Read"
                          >
                            Mark read
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={(e) => handleDelete(id, e)}
                          style={{
                            border: 'none',
                            background: 'transparent',
                            color: '#94a3b8',
                            fontSize: '11px',
                            cursor: 'pointer',
                          }}
                          title="Dismiss"
                        >
                          ✕
                        </button>
                      </div>
                    </div>

                    <div style={{ fontSize: '13px', fontWeight: unread ? 700 : 600, color: '#0f172a' }}>
                      {notif.title}
                    </div>

                    <div style={{ fontSize: '12px', color: '#475569', lineHeight: 1.4 }}>
                      {notif.message}
                    </div>

                    {notif.meta && Object.keys(notif.meta).length > 0 && (
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '4px' }}>
                        {notif.meta.amount && (
                          <span
                            style={{
                              fontSize: '11px',
                              fontWeight: 700,
                              backgroundColor: '#dcfce7',
                              color: '#166534',
                              padding: '2px 6px',
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
                              padding: '2px 6px',
                              borderRadius: '4px',
                              fontWeight: 600,
                            }}
                          >
                            Role: {notif.meta.role}
                          </span>
                        )}
                        {notif.meta.loanId && (
                          <span
                            style={{
                              fontSize: '11px',
                              backgroundColor: '#f1f5f9',
                              color: '#475569',
                              padding: '2px 6px',
                              borderRadius: '4px',
                              fontFamily: 'monospace',
                            }}
                          >
                            Loan: {String(notif.meta.loanId).slice(-6)}
                          </span>
                        )}
                      </div>
                    )}

                    {cfg.route && (
                      <div style={{ marginTop: '4px', paddingTop: '6px', borderTop: '1px dashed #e2e8f0' }}>
                        <button
                          type="button"
                          onClick={() => {
                            if (unread) handleMarkAsRead(id);
                            if (typeof onNavigate === 'function') {
                              onNavigate(cfg.route);
                              onClose();
                            }
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
    </div>
  );
}
