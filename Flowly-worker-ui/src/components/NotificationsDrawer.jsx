import { useState, useEffect, useMemo } from 'react';
import * as api from '../api';
import Icon from './Icon';

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

const getWorkerTypeConfig = (type) => {
  switch (type) {
    case 'kyc':
      return {
        icon: 'fileCheck',
        badgeBg: 'bg-emerald-50 text-emerald-700 border-emerald-200',
        label: 'KYC Verification',
        actionRoute: 'kyc',
        actionLabel: 'Open KYC Queue',
      };
    case 'video-kyc':
      return {
        icon: 'video',
        badgeBg: 'bg-sky-50 text-sky-700 border-sky-200',
        label: 'Video KYC',
        actionRoute: 'video-kyc',
        actionLabel: 'Open Video Call',
      };
    case 'loan':
      return {
        icon: 'landmark',
        badgeBg: 'bg-brand-light text-brand border-accent/20',
        label: 'Loan Desk',
        actionRoute: 'loan',
        actionLabel: 'Review Loan',
      };
    case 'deposit':
      return {
        icon: 'deposit',
        badgeBg: 'bg-teal-50 text-teal-700 border-teal-200',
        label: 'Cash Counter',
        actionRoute: 'cash-deposit',
        actionLabel: 'Deposit Counter',
      };
    case 'withdrawal':
      return {
        icon: 'withdraw',
        badgeBg: 'bg-amber-50 text-amber-700 border-amber-200',
        label: 'Withdrawal Desk',
        actionRoute: 'cash-withdrawal',
        actionLabel: 'Withdrawal Counter',
      };
    case 'fd':
      return {
        icon: 'briefcase',
        badgeBg: 'bg-indigo-50 text-indigo-700 border-indigo-200',
        label: 'Fixed Deposit',
        actionRoute: 'fd',
        actionLabel: 'Review FD',
      };
    case 'transfer':
      return {
        icon: 'transfer',
        badgeBg: 'bg-purple-50 text-purple-700 border-purple-200',
        label: 'C2C Transfer',
        actionRoute: null,
        actionLabel: null,
      };
    case 'emi':
    case 'payment':
      return {
        icon: 'calendar',
        badgeBg: 'bg-blue-50 text-blue-700 border-blue-200',
        label: 'Repayment',
        actionRoute: null,
        actionLabel: null,
      };
    default:
      return {
        icon: 'bell',
        badgeBg: 'bg-surface text-muted border-line',
        label: 'Staff Notice',
        actionRoute: null,
        actionLabel: null,
      };
  }
};

export default function NotificationsDrawer({ isOpen, onClose, onNavigate, onRefreshCount }) {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('all'); // 'all' | 'unread'

  const isRead = (item) => item.status === 'read' || item.isRead === true;

  const fetchNotifications = async () => {
    if (!isOpen) return;
    setLoading(true);
    try {
      const data = await api.fetchWorkerNotifications({ limit: 40 });
      setNotifications(data.notifications || []);
      if (onRefreshCount) onRefreshCount();
    } catch (err) {
      console.error('Failed to fetch worker notifications:', err);
      setNotifications([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotifications();
  }, [isOpen]);

  // Real-time worker socket listeners
  useEffect(() => {
    const handleNewNotif = (e) => {
      const newNotif = e.detail;
      if (!newNotif) return;
      setNotifications((prev) => {
        const id = newNotif._id || newNotif.id;
        const exists = prev.some((n) => (n._id || n.id) === id);
        if (exists) return prev;
        return [newNotif, ...prev];
      });
    };

    const handleRead = (e) => {
      const { id } = e.detail || {};
      if (!id) return;
      setNotifications((prev) =>
        prev.map((n) => (n._id === id || n.id === id ? { ...n, status: 'read', isRead: true } : n))
      );
    };

    const handleAllRead = () => {
      setNotifications((prev) => prev.map((n) => ({ ...n, status: 'read', isRead: true })));
    };

    window.addEventListener('flowly:worker:new-notification', handleNewNotif);
    window.addEventListener('flowly:worker:notification-read', handleRead);
    window.addEventListener('flowly:worker:notifications-all-read', handleAllRead);

    return () => {
      window.removeEventListener('flowly:worker:new-notification', handleNewNotif);
      window.removeEventListener('flowly:worker:notification-read', handleRead);
      window.removeEventListener('flowly:worker:notifications-all-read', handleAllRead);
    };
  }, []);

  const handleMarkAllRead = async () => {
    try {
      await api.markAllWorkerNotificationsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, status: 'read', isRead: true })));
      if (onRefreshCount) onRefreshCount();
    } catch (err) {
      console.error('Failed to mark all as read:', err);
    }
  };

  const handleMarkRead = async (id) => {
    try {
      await api.markWorkerNotificationRead(id);
      setNotifications((prev) =>
        prev.map((n) => (n._id === id || n.id === id ? { ...n, status: 'read', isRead: true } : n))
      );
      if (onRefreshCount) onRefreshCount();
    } catch (err) {
      console.error('Failed to mark notification as read:', err);
    }
  };

  const handleDelete = async (id) => {
    try {
      await api.deleteWorkerNotification(id);
      setNotifications((prev) => prev.filter((n) => n._id !== id && n.id !== id));
      if (onRefreshCount) onRefreshCount();
    } catch (err) {
      console.error('Failed to delete notification:', err);
    }
  };

  const handleAction = (route, notificationId, unread) => {
    if (unread) {
      handleMarkRead(notificationId);
    }
    if (route && onNavigate) {
      onNavigate(route);
      onClose();
    }
  };

  const unreadCount = useMemo(() => notifications.filter((n) => !isRead(n)).length, [notifications]);

  const filteredNotifications = useMemo(() => {
    if (activeTab === 'unread') {
      return notifications.filter((n) => !isRead(n));
    }
    return notifications;
  }, [notifications, activeTab]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-xs transition-opacity animate-in fade-in duration-200">
      {/* Drawer Container */}
      <div className="flex h-full w-full max-w-[440px] flex-col border-l border-line bg-white shadow-[-8px_0_30px_rgba(32,21,48,0.2)] animate-in slide-in-from-right duration-200">
        
        {/* Drawer Header */}
        <div className="flex items-center justify-between border-b border-line bg-[#FAF9F5] px-6 py-4.5">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-[10px] bg-brand-light text-brand">
              <Icon name="bell" size={18} />
            </div>
            <div>
              <h3 className="font-heading text-[17px] font-bold tracking-tight text-ink">
                Staff Alerts
              </h3>
              <p className="text-[11px] text-muted">
                Live queue activity & customer requests
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex size-8 items-center justify-center rounded-lg text-muted transition hover:bg-surface hover:text-ink"
            title="Close drawer"
          >
            <Icon name="x" size={17} />
          </button>
        </div>

        {/* Tab & Action Toolbar */}
        <div className="flex items-center justify-between border-b border-line bg-surface px-6 py-2.5">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setActiveTab('all')}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                activeTab === 'all'
                  ? 'bg-brand text-white shadow-xs'
                  : 'text-muted hover:text-ink'
              }`}
            >
              All ({notifications.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('unread')}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition ${
                activeTab === 'unread'
                  ? 'bg-brand text-white shadow-xs'
                  : 'text-muted hover:text-ink'
              }`}
            >
              Unread
              {unreadCount > 0 && (
                <span
                  className={`rounded-full px-1.5 py-0.2 text-[10px] font-bold ${
                    activeTab === 'unread' ? 'bg-white text-brand' : 'bg-danger text-white'
                  }`}
                >
                  {unreadCount}
                </span>
              )}
            </button>
          </div>

          {unreadCount > 0 && (
            <button
              type="button"
              onClick={handleMarkAllRead}
              className="flex items-center gap-1 text-xs font-bold text-brand hover:underline"
            >
              <Icon name="checkCheck" size={14} /> Mark all read
            </button>
          )}
        </div>

        {/* Notification Scrollable List */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="py-12 text-center text-xs text-muted">
              Loading staff notifications…
            </div>
          ) : filteredNotifications.length === 0 ? (
            <div className="py-16 text-center text-subtle">
              <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-2xl bg-surface text-subtle">
                <Icon name="bell" size={24} />
              </div>
              <p className="font-heading text-sm font-bold text-ink">
                {activeTab === 'unread' ? 'All caught up!' : 'No notifications'}
              </p>
              <p className="mx-auto mt-1 max-w-[240px] text-xs text-muted">
                {activeTab === 'unread'
                  ? 'There are no pending unread notifications in your queue.'
                  : 'New submissions from customers for KYC, loans, and cash counters will appear here in real-time.'}
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-2.5">
              {filteredNotifications.map((item) => {
                const unread = !isRead(item);
                const config = getWorkerTypeConfig(item.type);
                const notifId = item._id || item.id;

                return (
                  <div
                    key={notifId}
                    className={`relative rounded-xl border p-3.5 transition-all ${
                      unread
                        ? 'border-accent/40 bg-brand-light/30 shadow-[0_2px_8px_rgba(139,92,246,0.06)]'
                        : 'border-line bg-white'
                    }`}
                  >
                    {/* Unread dot */}
                    {unread && (
                      <span className="absolute top-3.5 right-3.5 size-2 rounded-full bg-accent" />
                    )}

                    {/* Top Row: Type Pill & Time */}
                    <div className="mb-2 flex items-center justify-between pr-4">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-bold ${config.badgeBg}`}
                      >
                        <Icon name={config.icon} size={12} />
                        {config.label}
                      </span>
                      <span
                        className="text-[11px] text-muted"
                        title={new Date(item.createdAt).toLocaleString()}
                      >
                        {formatRelativeTime(item.createdAt)}
                      </span>
                    </div>

                    {/* Notification Title */}
                    <h4 className="text-[13px] font-bold text-ink">
                      {item.title}
                    </h4>

                    {/* Notification Message */}
                    <p className="mt-1 text-xs text-muted leading-relaxed">
                      {item.message}
                    </p>

                    {/* Footer Actions */}
                    <div className="mt-2.5 flex items-center justify-between border-t border-line/60 pt-2">
                      {/* Action shortcut to queue */}
                      {config.actionRoute ? (
                        <button
                          type="button"
                          onClick={() => handleAction(config.actionRoute, notifId, unread)}
                          className="flex items-center gap-1 text-[11.5px] font-bold text-brand hover:underline"
                        >
                          {config.actionLabel}
                          <Icon name="chevronRight" size={12} />
                        </button>
                      ) : (
                        <span />
                      )}

                      <div className="flex items-center gap-2">
                        {unread && (
                          <button
                            type="button"
                            onClick={() => handleMarkRead(notifId)}
                            className="text-[11px] font-bold text-brand hover:underline"
                          >
                            Mark read
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleDelete(notifId)}
                          className="rounded p-1 text-subtle transition hover:bg-danger-light hover:text-danger"
                          title="Delete notification"
                        >
                          <Icon name="trash" size={13} />
                        </button>
                      </div>
                    </div>
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
