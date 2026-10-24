import React from 'react';

export default function Dashboard({ onNavigate, onSelectKyc }) {
  return (
    <>
      <div className="stat-row">
        <StatCard label="Pending KYC" num="18" delta="+3 today" />
        <StatCard label="Pending loans" num="7" delta="+1 today" />
        <StatCard label="Total customers" num="1,842" delta="+24 this week" />
        <StatCard label="Open tickets" num="4" delta="1 urgent" deltaColor="#B23A2E" />
      </div>

      <div className="grid-2">
        <div className="panel">
          <div className="panel-head">
            <span className="panel-title">Needs attention</span>
            <button className="panel-link" onClick={() => onNavigate('kyc')}>View all</button>
          </div>
          <table>
            <tbody>
              <tr><th>Customer</th><th>Type</th><th>Status</th><th /></tr>
              <tr
                className="clickable"
                onClick={() => { onSelectKyc('RS'); onNavigate('kyc'); }}
              >
                <td>
                  <div className="cell-user">
                    <div className="avatar">RS</div>
                    <div>Rekha Suresh<div className="cell-sub">KYC · pending 2 days</div></div>
                  </div>
                </td>
                <td>KYC</td>
                <td><span className="badge badge-amber">Pending</span></td>
                <td>
                  <button
                    className="btn-outline btn-sm"
                    onClick={(e) => { e.stopPropagation(); onSelectKyc('RS'); onNavigate('kyc'); }}
                  >
                    Review
                  </button>
                </td>
              </tr>
              <tr className="clickable" onClick={() => onNavigate('loan')}>
                <td>
                  <div className="cell-user">
                    <div className="avatar">MJ</div>
                    <div>Manoj Jacob<div className="cell-sub">Personal loan · ₹2,50,000</div></div>
                  </div>
                </td>
                <td>Loan</td>
                <td><span className="badge badge-purple">Review</span></td>
                <td><button className="btn-outline btn-sm" onClick={(e) => { e.stopPropagation(); onNavigate('loan'); }}>Review</button></td>
              </tr>
              <tr className="clickable" onClick={() => onNavigate('tickets')}>
                <td>
                  <div className="cell-user">
                    <div className="avatar">PK</div>
                    <div>Priya Krishnan<div className="cell-sub">Statement download failing</div></div>
                  </div>
                </td>
                <td>Ticket</td>
                <td><span className="badge badge-red">Urgent</span></td>
                <td><button className="btn-outline btn-sm" onClick={(e) => { e.stopPropagation(); onNavigate('tickets'); }}>Open</button></td>
              </tr>
              <tr className="clickable" onClick={() => onNavigate('emi')}>
                <td>
                  <div className="cell-user">
                    <div className="avatar">SV</div>
                    <div>Sunil Varma<div className="cell-sub">EMI · due today</div></div>
                  </div>
                </td>
                <td>EMI</td>
                <td><span className="badge badge-amber">Due</span></td>
                <td><button className="btn-outline btn-sm" onClick={(e) => { e.stopPropagation(); onNavigate('emi'); }}>View</button></td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="panel">
          <div className="panel-head"><span className="panel-title">Today's activity</span></div>
          <BarRow label="KYC approved" pct={70} value="12" />
          <BarRow label="Loans reviewed" pct={35} value="5" />
          <BarRow label="Tickets closed" pct={20} value="3" />
          <div className="panel-head" style={{ marginTop: 14 }}>
            <span className="panel-title">Collections this month</span>
          </div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>₹18.4L</div>
          <div style={{ fontSize: 10.5, color: '#3E7A22', fontWeight: 600 }}>92% of target</div>
        </div>
      </div>
    </>
  );
}

function StatCard({ label, num, delta, deltaColor = '#3E7A22' }) {
  return (
    <div className="stat-card">
      <div className="top">
        <span className="lbl">{label}</span>
        <div className="ic" />
      </div>
      <div className="num">{num}</div>
      <div className="delta" style={{ color: deltaColor }}>{delta}</div>
    </div>
  );
}

function BarRow({ label, pct, value }) {
  return (
    <div className="bar-row">
      <span style={{ width: 110, fontSize: 11, color: '#8b8880' }}>{label}</span>
      <div className="bar-track"><div className="bar-fill" style={{ width: `${pct}%` }} /></div>
      <span style={{ fontSize: 11, fontWeight: 700 }}>{value}</span>
    </div>
  );
}