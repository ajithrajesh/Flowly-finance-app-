import React from 'react';

const ADMIN_NAV_ITEMS = [
  { key: 'dashboard', label: 'Executive Overview', section: null },
  { key: 'analysis', label: 'Business Analysis', section: 'Analytics' },
  { key: 'workers', label: 'Worker Monitor', section: 'Governance' },
  { key: 'customers', label: 'Customer Overview', section: 'Operations' },
  { key: 'noc', label: 'NOC Clearance & Issuance', section: null },
  { key: 'audit', label: 'Security & Audit Logs', section: 'System' },
];

export default function AdminSidebar({ route, onNavigate, admin }) {
  const initials = (admin?.name || 'Admin')
    .split(' ')
    .slice(0, 2)
    .map((n) => n[0])
    .join('')
    .toUpperCase();

  return (
    <div className="admin-sidebar">
      <div className="admin-logo">
        <div className="mark">F</div>
        <div>
          <div className="word">Flowly Admin</div>
          <span className="badge-tag">Portal v1.0</span>
        </div>
      </div>

      {ADMIN_NAV_ITEMS.map((item) => {
        const isActive = route === item.key;
        return (
          <React.Fragment key={item.key}>
            {item.section && <div className="sb-section">{item.section}</div>}
            <div
              className={`sb-item ${isActive ? 'active' : ''}`}
              onClick={() => onNavigate(item.key)}
            >
              <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: isActive ? '#ffffff' : '#64748b' }} />
              {item.label}
            </div>
          </React.Fragment>
        );
      })}

      <div className="sb-spacer" />

      <div className="sb-profile">
        <div className="sb-avatar">{initials}</div>
        <div>
          <div className="nm">{admin?.name || 'Administrator'}</div>
          <div className="rl">Executive Privileges</div>
        </div>
      </div>
    </div>
  );
}
