import React from 'react';

export default function AuditLogsPage() {
  const sampleLogs = [
    { id: 1, time: '2 mins ago', actor: 'Admin Staff (admin@flowly.com)', action: 'System Login', ip: '192.168.1.10', status: 'SUCCESS' },
    { id: 2, time: '14 mins ago', actor: 'Arjun Nair (staff@flowly.com)', action: 'Approved KYC submission #KYC-9021', ip: '192.168.1.14', status: 'SUCCESS' },
    { id: 3, time: '1 hour ago', actor: 'Arjun Nair (staff@flowly.com)', action: 'Sanctioned Loan LN-20261002-4412', ip: '192.168.1.14', status: 'SUCCESS' },
    { id: 4, time: '3 hours ago', actor: 'System Worker Job', action: 'Ran Overdue & EMI check cron', ip: '127.0.0.1', status: 'COMPLETED' },
    { id: 5, time: '5 hours ago', actor: 'Admin Staff (admin@flowly.com)', action: 'Published FD Scheme "Super Senior Shield"', ip: '192.168.1.10', status: 'SUCCESS' },
  ];

  return (
    <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div>
        <h2 style={{ fontSize: '20px', fontWeight: '800', color: '#0f172a', margin: 0 }}>
          Security & Operations Audit Logs
        </h2>
        <p style={{ fontSize: '13px', color: '#64748b', marginTop: '4px' }}>
          Immutable ledger of system events, admin actions, and staff operations.
        </p>
      </div>

      <div style={{ background: 'white', borderRadius: '14px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
          <thead>
            <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b', fontSize: '11px', textTransform: 'uppercase' }}>
              <th style={{ padding: '14px 18px' }}>Timestamp</th>
              <th style={{ padding: '14px 18px' }}>Actor / Staff</th>
              <th style={{ padding: '14px 18px' }}>Action Logged</th>
              <th style={{ padding: '14px 18px' }}>IP / Source</th>
              <th style={{ padding: '14px 18px' }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {sampleLogs.map((log) => (
              <tr key={log.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                <td style={{ padding: '14px 18px', color: '#64748b', fontWeight: '500' }}>{log.time}</td>
                <td style={{ padding: '14px 18px', fontWeight: '600', color: '#0f172a' }}>{log.actor}</td>
                <td style={{ padding: '14px 18px' }}>{log.action}</td>
                <td style={{ padding: '14px 18px', color: '#64748b', fontFamily: 'monospace', fontSize: '12px' }}>{log.ip}</td>
                <td style={{ padding: '14px 18px' }}>
                  <span style={{ padding: '3px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: '700', background: '#d1fae5', color: '#047857' }}>
                    {log.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
