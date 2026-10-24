import React, { useEffect, useState, useCallback } from 'react';
import * as api from '../api';

export default function BusinessAnalysisPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [timeframe, setTimeframe] = useState('all');

  const loadAnalysis = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.fetchBusinessAnalysis();
      if (res.success) {
        setData(res);
      } else {
        setError(res.message || 'Failed to load business analysis');
      }
    } catch (err) {
      setError(err.message || 'Failed to connect to backend server');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAnalysis();
  }, [loadAnalysis]);

  if (loading) {
    return (
      <div className="loading-panel">
        <div className="spinner" style={{ marginBottom: '12px' }} />
        <p style={{ color: '#64748b', fontSize: '14px', fontWeight: 500 }}>
          Generating real-time business intelligence & portfolio analytics...
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="error-banner" style={{ margin: '24px' }}>
        <span>⚠️ {error}</span>
        <button
          onClick={loadAnalysis}
          style={{
            marginLeft: '12px',
            padding: '4px 10px',
            background: '#ef4444',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '12px',
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  const { summary, kycStats, loanStats, fdStats, monthlyTrends, recentActivity } = data;
  const formatRupees = (amt) => `₹${Number(amt || 0).toLocaleString('en-IN')}`;

  return (
    <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      {/* Top Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ fontSize: '20px', fontWeight: '800', color: '#0f172a', margin: 0 }}>
            Executive Business & Financial Analytics
          </h2>
          <p style={{ fontSize: '13px', color: '#64748b', marginTop: '4px' }}>
            Real-time capital depth, net yield margins, default risk analysis, and growth indicators.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#e2e8f0', padding: '4px', borderRadius: '8px' }}>
          {['all', 'quarter', 'month'].map((tf) => (
            <button
              key={tf}
              onClick={() => setTimeframe(tf)}
              style={{
                border: 'none',
                background: timeframe === tf ? '#0f172a' : 'transparent',
                color: timeframe === tf ? '#ffffff' : '#334155',
                padding: '6px 14px',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: '600',
                cursor: 'pointer',
              }}
            >
              {tf === 'all' ? 'All Time' : tf === 'quarter' ? 'This Quarter' : 'This Month'}
            </button>
          ))}
          <button
            onClick={loadAnalysis}
            style={{
              border: 'none',
              background: 'white',
              color: '#6366f1',
              padding: '6px 12px',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: '600',
              cursor: 'pointer',
            }}
          >
            🔄 Refresh
          </button>
        </div>
      </div>

      {/* Primary Metrics Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
        <div style={{ background: 'white', padding: '18px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
          <div style={{ fontSize: '11px', textTransform: 'uppercase', color: '#64748b', fontWeight: '700' }}>
            Total Capital Managed
          </div>
          <div style={{ fontSize: '24px', fontWeight: '800', color: '#0f172a', margin: '8px 0 4px' }}>
            {formatRupees(summary.totalAssetsManaged)}
          </div>
          <div style={{ fontSize: '12px', color: '#059669', fontWeight: '600' }}>
            Savings: {formatRupees(summary.savingsBalance)} · FDs: {formatRupees(summary.activeFdPool)}
          </div>
        </div>

        <div style={{ background: 'white', padding: '18px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
          <div style={{ fontSize: '11px', textTransform: 'uppercase', color: '#64748b', fontWeight: '700' }}>
            Disbursed Loans
          </div>
          <div style={{ fontSize: '24px', fontWeight: '800', color: '#6366f1', margin: '8px 0 4px' }}>
            {formatRupees(summary.totalDisbursedLoans)}
          </div>
          <div style={{ fontSize: '12px', color: '#64748b' }}>
            Outstanding principal: <strong>{formatRupees(summary.totalOutstandingLoans)}</strong>
          </div>
        </div>

        <div style={{ background: 'white', padding: '18px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
          <div style={{ fontSize: '11px', textTransform: 'uppercase', color: '#64748b', fontWeight: '700' }}>
            Net Interest Yield
          </div>
          <div style={{ fontSize: '24px', fontWeight: '800', color: '#059669', margin: '8px 0 4px' }}>
            {formatRupees(summary.totalInterestEarned)}
          </div>
          <div style={{ fontSize: '12px', color: '#059669', fontWeight: '600' }}>
            Return Margin: +{summary.netProfitMargin}%
          </div>
        </div>

        <div style={{ background: 'white', padding: '18px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
          <div style={{ fontSize: '11px', textTransform: 'uppercase', color: '#64748b', fontWeight: '700' }}>
            Default Risk Rate
          </div>
          <div style={{ fontSize: '24px', fontWeight: '800', color: summary.overdueCount > 0 ? '#ef4444' : '#059669', margin: '8px 0 4px' }}>
            {summary.defaultRiskRate}%
          </div>
          <div style={{ fontSize: '12px', color: summary.overdueCount > 0 ? '#ef4444' : '#059669', fontWeight: '600' }}>
            {summary.overdueCount} loan(s) in default risk
          </div>
        </div>
      </div>

      {/* Trajectory & Distribution */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
        
        {/* Custom SVG Bar Chart */}
        <div style={{ background: 'white', padding: '20px', borderRadius: '14px', border: '1px solid #e2e8f0', gridColumn: 'span 2' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div>
              <h3 style={{ fontSize: '15px', fontWeight: '700', color: '#0f172a', margin: 0 }}>
                Financial Growth & Comparative Flow
              </h3>
              <span style={{ fontSize: '12px', color: '#64748b' }}>Monthly comparison of deposits, disbursements, and collections</span>
            </div>
            <div style={{ display: 'flex', gap: '12px', fontSize: '12px', fontWeight: '600' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ width: '10px', height: '10px', background: '#6366f1', borderRadius: '2px' }} /> Deposits
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ width: '10px', height: '10px', background: '#3b82f6', borderRadius: '2px' }} /> Disbursements
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ width: '10px', height: '10px', background: '#10b981', borderRadius: '2px' }} /> Collections
              </span>
            </div>
          </div>

          <div style={{ height: '220px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: '16px', padding: '10px 0', borderBottom: '1px solid #f1f5f9' }}>
            {monthlyTrends.map((item, idx) => {
              const maxVal = Math.max(...monthlyTrends.map((t) => Math.max(t.deposits, t.disbursements, t.collections))) || 1;
              const hDep = Math.max(15, (item.deposits / maxVal) * 180);
              const hDis = Math.max(12, (item.disbursements / maxVal) * 180);
              const hCol = Math.max(10, (item.collections / maxVal) * 180);

              return (
                <div key={idx} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: '4px', height: '180px' }}>
                    <div title={`Deposits: ${formatRupees(item.deposits)}`} style={{ width: '14px', height: `${hDep}px`, background: '#6366f1', borderRadius: '3px 3px 0 0' }} />
                    <div title={`Disbursements: ${formatRupees(item.disbursements)}`} style={{ width: '14px', height: `${hDis}px`, background: '#3b82f6', borderRadius: '3px 3px 0 0' }} />
                    <div title={`Collections: ${formatRupees(item.collections)}`} style={{ width: '14px', height: `${hCol}px`, background: '#10b981', borderRadius: '3px 3px 0 0' }} />
                  </div>
                  <span style={{ fontSize: '11px', fontWeight: '600', color: '#475569' }}>{item.month}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* KYC Distribution */}
        <div style={{ background: 'white', padding: '20px', borderRadius: '14px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <h3 style={{ fontSize: '15px', fontWeight: '700', color: '#0f172a', margin: 0 }}>
            Customer Onboarding Metrics
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', fontWeight: '600', marginBottom: '4px' }}>
                <span>Verified ({kycStats.verified})</span>
                <span style={{ color: '#10b981' }}>{summary.totalCustomers > 0 ? Math.round((kycStats.verified / summary.totalCustomers) * 100) : 0}%</span>
              </div>
              <div style={{ height: '8px', background: '#f1f5f9', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{ width: `${summary.totalCustomers > 0 ? (kycStats.verified / summary.totalCustomers) * 100 : 0}%`, height: '100%', background: '#10b981' }} />
              </div>
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', fontWeight: '600', marginBottom: '4px' }}>
                <span>Under Review ({kycStats.under_verification})</span>
                <span style={{ color: '#3b82f6' }}>{summary.totalCustomers > 0 ? Math.round((kycStats.under_verification / summary.totalCustomers) * 100) : 0}%</span>
              </div>
              <div style={{ height: '8px', background: '#f1f5f9', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{ width: `${summary.totalCustomers > 0 ? (kycStats.under_verification / summary.totalCustomers) * 100 : 0}%`, height: '100%', background: '#3b82f6' }} />
              </div>
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', fontWeight: '600', marginBottom: '4px' }}>
                <span>Pending Submissions ({kycStats.pending})</span>
                <span style={{ color: '#f59e0b' }}>{summary.totalCustomers > 0 ? Math.round((kycStats.pending / summary.totalCustomers) * 100) : 0}%</span>
              </div>
              <div style={{ height: '8px', background: '#f1f5f9', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{ width: `${summary.totalCustomers > 0 ? (kycStats.pending / summary.totalCustomers) * 100 : 0}%`, height: '100%', background: '#f59e0b' }} />
              </div>
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', fontWeight: '600', marginBottom: '4px' }}>
                <span>Rejected ({kycStats.rejected})</span>
                <span style={{ color: '#ef4444' }}>{summary.totalCustomers > 0 ? Math.round((kycStats.rejected / summary.totalCustomers) * 100) : 0}%</span>
              </div>
              <div style={{ height: '8px', background: '#f1f5f9', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{ width: `${summary.totalCustomers > 0 ? (kycStats.rejected / summary.totalCustomers) * 100 : 0}%`, height: '100%', background: '#ef4444' }} />
              </div>
            </div>
          </div>
        </div>

      </div>

    </div>
  );
}
