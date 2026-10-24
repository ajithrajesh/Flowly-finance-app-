import React from 'react';

export default function Placeholder({ label }) {
  return (
    <div className="panel placeholder-panel">
      {label} isn't part of this build — this version covers Dashboard, Customers, and KYC verification.
    </div>
  );
}