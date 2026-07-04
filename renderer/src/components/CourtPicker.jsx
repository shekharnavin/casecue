import { useEffect, useMemo, useRef, useState } from 'react';

const ADD_NEW_VALUE = '__ADD_NEW__';

export default function CourtPicker({
  groups,
  onAddNew,
  onChange,
  value,
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef(null);
  const searchInputRef = useRef(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    const handleOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setOpen(false);
        setSearch('');
      }
    };
    const handleEsc = (event) => {
      if (event.key === 'Escape') {
        setOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleEsc);
    };
  }, [open]);

  useEffect(() => {
    if (open && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [open]);

  const filteredGroups = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) {
      return groups;
    }
    return groups
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => item.label.toLowerCase().includes(q)),
      }))
      .filter((group) => group.items.length > 0);
  }, [groups, search]);

  const totalMatches = useMemo(
    () => filteredGroups.reduce((sum, group) => sum + group.items.length, 0),
    [filteredGroups],
  );

  const selectedLabel = useMemo(() => {
    if (!value) {
      return '';
    }
    for (const group of groups) {
      const match = group.items.find((item) => item.value === value);
      if (match) {
        return match.label;
      }
    }
    return '';
  }, [groups, value]);

  const handleSelect = (selectedValue) => {
    onChange(selectedValue);
    setOpen(false);
    setSearch('');
  };

  const handleAddNew = () => {
    setOpen(false);
    setSearch('');
    if (onAddNew) {
      onAddNew();
    } else {
      onChange(ADD_NEW_VALUE);
    }
  };

  return (
    <div className="relative" ref={containerRef}>
      <button
        className="input flex w-full items-center justify-between text-left"
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        <span className={selectedLabel ? 'truncate text-slate-900' : 'text-slate-400'}>
          {selectedLabel || '— Select a court —'}
        </span>
        <span className="ml-2 text-slate-400">▾</span>
      </button>

      {open ? (
        <div className="absolute z-20 mt-1 flex max-h-96 w-full flex-col overflow-hidden rounded-md border border-slate-200 bg-white shadow-lg">
          <div className="border-b border-slate-200 p-2">
            <input
              className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search courts and tribunals…"
              ref={searchInputRef}
              type="text"
              value={search}
            />
            {search ? (
              <p className="mt-1 px-1 text-xs text-slate-500">
                {totalMatches} match{totalMatches === 1 ? '' : 'es'}
              </p>
            ) : null}
          </div>

          <div className="flex-1 overflow-y-auto">
            {filteredGroups.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-slate-500">
                No matches for "{search}".
              </div>
            ) : (
              filteredGroups.map((group) => (
                <div key={group.label}>
                  <div className="sticky top-0 border-b border-slate-100 bg-slate-50 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {group.label}
                    {group.subtitle ? (
                      <span className="ml-2 font-normal normal-case text-slate-400">{group.subtitle}</span>
                    ) : null}
                  </div>
                  {group.items.map((item) => {
                    const isSelected = value === item.value;
                    return (
                      <button
                        className={`block w-full px-3 py-1.5 text-left text-sm transition ${
                          isSelected
                            ? 'bg-brand-50 font-medium text-brand-900'
                            : 'text-slate-700 hover:bg-slate-50'
                        }`}
                        key={item.value}
                        onClick={() => handleSelect(item.value)}
                        type="button"
                      >
                        {item.label}
                        {item.badge ? (
                          <span className="ml-2 inline-flex rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
                            {item.badge}
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              ))
            )}
          </div>

          <div className="border-t border-slate-200">
            <button
              className="block w-full px-3 py-2 text-left text-sm font-medium text-brand-700 hover:bg-brand-50"
              onClick={handleAddNew}
              type="button"
            >
              + Add new court…
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
