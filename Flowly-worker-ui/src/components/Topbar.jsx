import { useState } from 'react';
import Icon from './Icon';

const initialsOf = (name = '') =>
  name.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('') || '?';

export default function Topbar({ pageTitle, onSearch, onNotify, onProfile, worker, unreadCount = 0 }) {
  const [value, setValue] = useState('');

  const handleChange = (e) => {
    setValue(e.target.value);
    onSearch(e.target.value);
  };

  return (
    <header className="flex h-[66px] shrink-0 items-center justify-between border-b border-line bg-white px-6 shadow-[0_2px_10px_rgba(32,21,48,0.03)]">
      <h1 className="font-heading text-[19px] font-bold tracking-tight text-ink">{pageTitle}</h1>

      <div className="flex items-center gap-3">
        <label className="relative flex items-center text-subtle max-lg:hidden">
          <Icon name="search" size={15} className="pointer-events-none absolute left-[11px]" />
          <input
            value={value}
            onChange={handleChange}
            placeholder="Search customers…"
            className="h-[38px] w-65 rounded-[10px] border border-line bg-surface pr-3 pl-[34px] text-[13px] text-ink transition placeholder:text-subtle focus:border-accent focus:bg-white focus:ring-[3px] focus:ring-accent/15 focus:outline-none"
          />
        </label>

        <button
          type="button"
          title={`Notifications (${unreadCount} unread)`}
          onClick={onNotify}
          className="relative flex size-[38px] items-center justify-center rounded-[10px] border border-line bg-surface text-ink transition-colors hover:bg-brand-light"
        >
          <Icon name="bell" size={17} />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white shadow-xs">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>

        <div className="ml-0.5 flex items-center gap-2.5 border-l border-line pl-3.5">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-full border-[1.5px] border-accent bg-brand-light text-[13px] font-bold text-brand">
            {initialsOf(worker?.name)}
          </div>
          <div className="flex flex-col leading-tight max-lg:hidden">
            <span className="text-[13px] font-bold text-ink">{worker?.name || 'Staff'}</span>
            <span className="text-[11px] text-muted capitalize">{worker?.role || 'worker'}</span>
          </div>
          <button
            type="button"
            title="Sign out"
            onClick={onProfile}
            className="flex rounded-lg p-[7px] text-muted transition-colors hover:bg-danger-light hover:text-danger"
          >
            <Icon name="logout" size={17} />
          </button>
        </div>
      </div>
    </header>
  );
}