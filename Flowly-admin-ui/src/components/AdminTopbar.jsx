import React from 'react';

export default function AdminTopbar({
  title,
  onLogout,
  unreadCount = 0,
  onOpenNotifications,
}) {
  return (
    <div className="admin-topbar">
      <div className="pagetitle">{title}</div>

      <div className="actions">
        <div className="status-indicator">
          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981' }} />
          <span>System Healthy · Port 5000</span>
        </div>

        {/* Real-time Notifications Bell */}
        <button
          type="button"
          onClick={onOpenNotifications}
          style={{
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '38px',
            height: '38px',
            borderRadius: '8px',
            border: '1px solid #e2e8f0',
            backgroundColor: unreadCount > 0 ? '#f5f3ff' : '#ffffff',
            color: unreadCount > 0 ? '#4f46e5' : '#475569',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
          title={unreadCount > 0 ? `${unreadCount} unread alerts` : 'Governance Alerts'}
          aria-label="View administrative notifications"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
            <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
          </svg>

          {unreadCount > 0 && (
            <span
              style={{
                position: 'absolute',
                top: '-4px',
                right: '-4px',
                minWidth: '18px',
                height: '18px',
                padding: '0 4px',
                borderRadius: '999px',
                backgroundColor: '#ef4444',
                color: '#ffffff',
                fontSize: '10px',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 2px 4px rgba(239, 68, 68, 0.4)',
                lineHeight: 1,
              }}
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>

        <button className="btn-logout" onClick={onLogout} title="Sign Out">
          Sign Out ➔
        </button>
      </div>
    </div>
  );
}
