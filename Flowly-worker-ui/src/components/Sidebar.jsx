import React from 'react';
import { sidebarItems } from '../data';
import Icon from './Icon';

const ICONS = {
  dashboard: 'dashboard',
  customers: 'users',
  'cash-deposit': 'deposit',
  'cash-withdrawal': 'withdraw',
  kyc: 'fileCheck',
  'video-kyc': 'video',
  'loan-schemes': 'fileCheck',
  loan: 'landmark',
  emi: 'calendar',
  'fd-schemes': 'percent',
  fd: 'lock',
  tickets: 'lifebuoy',
};

const initialsOf = (name = '') =>
  name.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('') || '?';

const itemBase =
  'relative mb-0.5 flex w-full items-center gap-[11px] rounded-[10px] px-3 py-[9px] text-left text-[13px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-accent max-lg:justify-center';
const itemIdle = 'text-[#bdb6d0] hover:bg-white/5 hover:text-white';
const itemActive =
  'bg-linear-to-r from-accent/30 to-accent/10 text-white before:absolute before:inset-y-2 before:-left-3.5 before:w-1 before:rounded-r-sm before:bg-accent max-lg:before:-left-2.5 [&>svg]:text-[#c4b0ff]';

export default function Sidebar({ route, onNavigate, worker }) {
  const isSupport = worker?.role === 'support' || worker?.workerRole === 'support';

  return (
    <aside className="flex w-62 shrink-0 flex-col overflow-y-auto bg-linear-to-b from-plum to-plum-deep px-3.5 pt-5 pb-4 text-[#e9e4f0] max-lg:w-17 max-lg:px-2.5">
      <div className="flex items-center gap-[11px] px-2 pt-0.5 pb-[22px] max-lg:justify-center">
        <div className="flex size-[38px] shrink-0 items-center justify-center rounded-[10px] bg-linear-to-br from-brand to-accent font-heading text-[18px] font-extrabold text-white shadow-[0_4px_14px_rgba(139,92,246,0.4)]">
          F
        </div>
        <div className="max-lg:hidden">
          <div className="font-heading text-[20px] leading-[1.1] font-extrabold tracking-tight text-white">
            Flowly<span className="text-accent">.</span>
          </div>
          <div className="mt-0.5 text-[9.5px] font-semibold tracking-[0.08em] text-[#9891ac] uppercase">
            {isSupport ? 'Support Console' : 'Staff Console'}
          </div>
        </div>
      </div>

      <nav>
        {sidebarItems.map((it) => {
          const isActive = route === it.key || (route === 'customer-detail' && it.key === 'customers');
          const isTicketItem = it.key === 'tickets';

          return (
            <React.Fragment key={it.key}>
              {it.section && (
                <div className="mt-[18px] mr-3 mb-1.5 ml-3 text-[10px] font-bold tracking-widest text-[#7f7894] uppercase max-lg:hidden">
                  {it.section}
                </div>
              )}
              <button
                type="button"
                title={it.label}
                onClick={() => onNavigate(it.key)}
                className={`${itemBase} ${isActive ? itemActive : itemIdle} ${isSupport && isTicketItem ? 'ring-1 ring-accent/30' : ''}`}
              >
                <Icon name={ICONS[it.key]} size={17} />
                <span className="max-lg:hidden">{it.label}</span>
                {isSupport && isTicketItem && (
                  <span className="ml-auto rounded-full bg-accent/25 px-1.5 py-0.5 text-[9.5px] font-bold text-accent max-lg:hidden">
                    Primary
                  </span>
                )}
              </button>
            </React.Fragment>
          );
        })}
      </nav>

      <div className="flex-1" />

      <div className="mt-3 flex items-center gap-2.5 rounded-xl border border-white/[0.07] bg-white/5 p-3 max-lg:justify-center">
        <div className="flex size-[34px] shrink-0 items-center justify-center rounded-full bg-linear-to-br from-brand to-accent text-xs font-bold text-white">
          {initialsOf(worker?.name)}
        </div>
        <div className="min-w-0 max-lg:hidden">
          <div className="truncate text-[12.5px] font-bold text-white">{worker?.name || 'Staff'}</div>
          <div className="text-[10.5px] text-[#a79fbd] capitalize">
            {isSupport ? `Support Team · Officer #${worker?.rotationOrder || 1}` : (worker?.role || 'worker')}
          </div>
        </div>
      </div>
    </aside>
  );
}