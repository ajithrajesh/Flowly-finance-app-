import React, { useEffect, useState } from 'react';
import * as api from '../api';

export default function CustomerOverviewPage() {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  const loadCustomers = () => {
    setLoading(true);
    setError('');
    api
      .fetchCustomerList({ search })
      .then((data) => {
        if (data && Array.isArray(data.customers)) {
          setCustomers(data.customers);
        } else {
          setCustomers([]);
          setError(data?.message || 'Unexpected response format while fetching customer list.');
        }
      })
      .catch((err) => {
        console.error('Failed to load customers:', err);
        setError(err.message || 'Unable to load customer records. Please check your connection.');
        setCustomers([]);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadCustomers();
  }, [search]);

  return (
    <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: '20px', fontWeight: '800', color: '#0f172a', margin: 0 }}>
            Customer Accounts Overview
          </h2>
          <p style={{ fontSize: '13px', color: '#64748b', marginTop: '4px' }}>
            System-wide customer registry and bank account audit.
          </p>
        </div>

        <input
          type="text"
          placeholder="Search customer name, email, phone..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ width: '280px', padding: '8px 14px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px' }}
        />
      </div>

      {error && (
        <div style={{ padding: '12px 16px', borderRadius: '10px', backgroundColor: '#fee2e2', border: '1px solid #fecaca', color: '#b91c1c', fontSize: '13px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>⚠️ {error}</span>
          <button onClick={loadCustomers} style={{ background: '#b91c1c', color: 'white', border: 'none', borderRadius: '6px', padding: '5px 12px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
            Retry
          </button>
        </div>
      )}

      <div style={{ background: 'white', borderRadius: '14px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
        {loading ? (
          <div className="loading-panel">
            <div className="spinner" style={{ marginBottom: '8px' }} />
            <span>Loading customer records...</span>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b', fontSize: '11px', textTransform: 'uppercase' }}>
                <th style={{ padding: '14px 18px' }}>Customer</th>
                <th style={{ padding: '14px 18px' }}>Account</th>
                <th style={{ padding: '14px 18px' }}>Balance</th>
                <th style={{ padding: '14px 18px' }}>KYC Status</th>
                <th style={{ padding: '14px 18px' }}>Branch</th>
              </tr>
            </thead>
            <tbody>
              {customers.length === 0 ? (
                <tr><td colSpan={5} style={{ padding: '24px', textAlign: 'center', color: '#888' }}>No customers found</td></tr>
              ) : (
                customers.map((c) => (
                  <tr key={c._id || c.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '14px 18px' }}>
                      <div style={{ fontWeight: '600', color: '#0f172a' }}>{c.name}</div>
                      <div style={{ fontSize: '11px', color: '#64748b' }}>{c.email} · {c.phone}</div>
                    </td>
                    <td style={{ padding: '14px 18px', fontWeight: '600' }}>
  {c.account
    ? `${c.account.accountNumber} (${c.account.accountType})`
    : 'Not created'}
</td>
                    <td style={{ padding: '14px 18px', fontWeight: '700', color: '#059669' }}>
  {c.account ? `₹${Number(c.account.balance).toLocaleString('en-IN')}` : '—'}
</td>
                    <td style={{ padding: '14px 18px' }}>
                      <span style={{ padding: '3px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: '700', background: c.account && c.account.status === 'Verified' ? '#d1fae5' : '#fee2e2', color: c.account && c.account.status === 'Verified' ? '#047857' : '#b91c1c' }}>
                        {c.account ? c.account.status : '—'}
                      </span>
                    </td>
                    <td style={{ padding: '14px 18px', color: '#64748b' }}>{c.branch || 'Kochi'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
