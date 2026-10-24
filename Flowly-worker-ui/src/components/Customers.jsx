function kycBadge(kyc) {
  if (kyc === 'Verified') return <span className="badge badge-green">Verified</span>;
  if (kyc === 'Rejected') return <span className="badge badge-red">Rejected</span>;
  return <span className="badge badge-amber">{kyc}</span>;
}

function statusBadge(status) {
  if (status === 'blocked') return <span className="badge badge-red">Blocked</span>;
  if (status === 'suspended') return <span className="badge badge-red">Suspended</span>;
  if (status === 'inactive') return <span className="badge badge-amber">Inactive</span>;
  if (status === 'no_account') return <span className="badge badge-gray">No account</span>;
  return <span className="badge badge-green">Active</span>;
}

export default function Customers({ customers, pagination, page, onPageChange, searchTerm, onOpenCustomer }) {
  return (
    <>
      <div className="panel-head" style={{ marginBottom: 14 }}>
        <div className="tabs" style={{ borderBottom: 'none', marginBottom: 0 }}>
          <div className="tab active">
            All {pagination ? `(${pagination.total})` : ''}
          </div>
        </div>
        {searchTerm && (
          <span className="cell-sub">Search: "{searchTerm}"</span>
        )}
      </div>

      <div className="panel" style={{ padding: 0 }}>
        <table>
          <tbody>
            <tr>
              <th>Customer</th>
              <th>Account no.</th>
              <th>Phone</th>
              <th>KYC status</th>
              <th>Balance</th>
              <th>Account status</th>
              <th />
            </tr>
            {customers.length === 0 && (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', padding: 24, color: '#8b8880' }}>
                  No customers found.
                </td>
              </tr>
            )}
            {customers.map((c) => (
              <tr key={c.id} className="clickable" onClick={() => onOpenCustomer(c.id)}>
                <td>
                  <div className="cell-user">
                    <div className="avatar">{c.avatar}</div>
                    {c.name}
                  </div>
                </td>
                <td>{c.account}</td>
                <td>{c.phone}</td>
                <td>{kycBadge(c.kyc)}</td>
                <td>{c.balance}</td>
                <td>{statusBadge(c.status)}</td>
                <td>
                  <button
                    className="btn-outline btn-sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenCustomer(c.id);
                    }}
                  >
                    Open
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pagination && pagination.totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginTop: 14 }}>
          <button
            className="btn-outline btn-sm"
            disabled={!pagination.hasPrevPage}
            onClick={() => onPageChange(page - 1)}
          >
            Previous
          </button>
          <span className="cell-sub" style={{ alignSelf: 'center' }}>
            Page {pagination.page} of {pagination.totalPages}
          </span>
          <button
            className="btn-outline btn-sm"
            disabled={!pagination.hasNextPage}
            onClick={() => onPageChange(page + 1)}
          >
            Next
          </button>
        </div>
      )}
    </>
  );
}