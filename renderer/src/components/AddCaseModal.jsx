import { useEffect, useMemo, useState } from 'react';

import CourtPicker from './CourtPicker.jsx';
import { COURT_CATEGORY_ORDER, KNOWN_COURTS, knownCourtByName } from '../lib/courts.js';
import { DEFAULT_SCHEDULE_CRON, getAllSchedules } from '../lib/schedules.js';
import {
  fetchDrtBenches,
  fetchDrtCaseTypes,
  fetchNclatBenches,
  fetchNclatCaseTypes,
  fetchNcltBenches,
  fetchNcltCaseTypes,
} from '../lib/api.js';

const BUILT_IN_KARNATAKA_HC_BENCHES = [
  { id: 'B', name: 'Bengaluru Bench' },
  { id: 'D', name: 'Dharwad Bench' },
  { id: 'K', name: 'Kalaburagi Bench' },
];

const BUILT_IN_CASE_TYPES = [
  'WP', 'WA', 'CRP', 'MFA', 'RSA', 'CRL.P', 'RPFC', 'CCC', 'AC', 'CA',
];

const ADD_NEW_VALUE = '__ADD_NEW__';
const EMPTY_VALUE = '';

const EMPTY_DRAFT = {
  benchId: '',
  caseNumber: '',
  caseType: '',
  caseYear: '',
  courtSelection: EMPTY_VALUE,
  recipientIds: [],
  schedule: DEFAULT_SCHEDULE_CRON,
  sourceUrl: '',
};

function InlineAdd({ label, onCancel, onSave, placeholder, saving }) {
  const [value, setValue] = useState('');
  const trimmed = value.trim();

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!trimmed) {
      return;
    }
    try {
      await onSave(trimmed);
      setValue('');
    } catch {
      /* parent shows the error */
    }
  };

  return (
    <form
      className="mt-2 flex items-center gap-2 rounded-md border border-brand-200 bg-brand-50 px-3 py-2"
      onSubmit={handleSubmit}
    >
      <span className="text-xs font-semibold text-brand-700">{label}</span>
      <input
        autoFocus
        className="input flex-1 bg-white"
        onChange={(event) => setValue(event.target.value)}
        placeholder={placeholder}
        value={value}
      />
      <button className="btn-primary" disabled={saving || !trimmed} type="submit">
        {saving ? 'Saving…' : 'Save'}
      </button>
      <button
        className="text-xs font-medium text-slate-500 hover:text-slate-700"
        onClick={onCancel}
        type="button"
      >
        Cancel
      </button>
    </form>
  );
}

export default function AddCaseModal({
  currentUserId,
  lookups,
  onAddLookupItem,
  onClose,
  onSubmit,
  portals,
  savedCases = [],
  users,
}) {
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [addingKind, setAddingKind] = useState('');
  const [addingSaving, setAddingSaving] = useState(false);
  const [drtBenches, setDrtBenches] = useState([]);
  const [drtBenchesLoading, setDrtBenchesLoading] = useState(false);
  const [drtBenchesError, setDrtBenchesError] = useState('');
  const [drtCaseTypes, setDrtCaseTypes] = useState([]);
  const [drtCaseTypesLoading, setDrtCaseTypesLoading] = useState(false);
  const [drtCaseTypesError, setDrtCaseTypesError] = useState('');
  const [nclatBenches, setNclatBenches] = useState([]);
  const [nclatCaseTypes, setNclatCaseTypes] = useState([]);
  const [nclatError, setNclatError] = useState('');
  const [ncltBenches, setNcltBenches] = useState([]);
  const [ncltCaseTypes, setNcltCaseTypes] = useState([]);
  const [ncltError, setNcltError] = useState('');

  const customSchedules = lookups?.schedules || [];
  const customCourtTypes = lookups?.courtTypes || [];
  const customBenches = lookups?.benches || [];
  const customCaseTypes = lookups?.caseTypes || [];

  const scheduleOptions = useMemo(
    () => getAllSchedules(customSchedules),
    [customSchedules],
  );

  // The court selection value encodes whether it's a known portal or a custom court.
  // - portal:<portalId>  for built-in adapters
  // - custom:<name>      for user-added or pre-catalogued courts (no adapter yet)
  // - ''                 for no selection
  // - ADD_NEW_VALUE      for the "+ Add new court" sentinel
  const selectedPortal = useMemo(() => {
    if (!draft.courtSelection.startsWith('portal:')) {
      return null;
    }
    const portalId = draft.courtSelection.slice('portal:'.length);
    return portals.find((portal) => portal.id === portalId) || null;
  }, [draft.courtSelection, portals]);

  const customCourtName = useMemo(() => {
    if (!draft.courtSelection.startsWith('custom:')) {
      return '';
    }
    return draft.courtSelection.slice('custom:'.length);
  }, [draft.courtSelection]);

  // Pre-catalogued Indian courts that aren't already covered by a built-in
  // adapter or a custom court the admin already added.
  const visibleKnownCourts = useMemo(() => {
    const supportedNames = new Set(
      portals.map((portal) => String(portal.name || '').toLowerCase()),
    );
    const customNames = new Set(
      customCourtTypes.map((court) => String(court.name || '').toLowerCase()),
    );
    return KNOWN_COURTS.filter((court) => {
      const name = court.name.toLowerCase();
      return !supportedNames.has(name) && !customNames.has(name);
    });
  }, [customCourtTypes, portals]);

  const recentItems = useMemo(() => {
    if (!Array.isArray(savedCases) || !savedCases.length) {
      return [];
    }
    const seen = new Set();
    const collected = [];
    for (let i = savedCases.length - 1; i >= 0 && collected.length < 5; i -= 1) {
      const savedCase = savedCases[i];
      const courtType = savedCase && savedCase.courtType;
      if (!courtType) {
        continue;
      }
      const matchingPortal = portals.find((portal) => portal.id === courtType);
      const value = matchingPortal ? `portal:${matchingPortal.id}` : `custom:${courtType}`;
      const label = matchingPortal ? matchingPortal.name : courtType;
      if (seen.has(value)) {
        continue;
      }
      seen.add(value);
      collected.push({
        badge: matchingPortal ? 'Auto' : undefined,
        label,
        value,
      });
    }
    return collected;
  }, [portals, savedCases]);

  const pickerGroups = useMemo(() => {
    const groups = [];

    if (recentItems.length) {
      groups.push({
        items: recentItems,
        label: 'Recently used',
      });
    }

    if (portals.length) {
      groups.push({
        items: portals.map((portal) => ({
          badge: 'Auto',
          label: portal.name,
          value: `portal:${portal.id}`,
        })),
        label: 'Supported portals (auto-monitor)',
      });
    }

    if (customCourtTypes.length) {
      groups.push({
        items: customCourtTypes.map((court) => ({
          label: court.name,
          value: `custom:${court.name}`,
        })),
        label: 'Your custom courts',
      });
    }

    const known = new Map();
    for (const court of visibleKnownCourts) {
      const list = known.get(court.category) || [];
      list.push({
        label: court.name,
        value: `known:${court.name}`,
      });
      known.set(court.category, list);
    }

    for (const category of COURT_CATEGORY_ORDER) {
      const items = known.get(category);
      if (items && items.length) {
        groups.push({
          items,
          label: category === 'Other' ? 'Other courts (manual tracking)' : `${category}s (manual tracking)`,
        });
      }
    }

    return groups;
  }, [customCourtTypes, portals, recentItems, visibleKnownCourts]);

  const existingCasesAtCourt = useMemo(() => {
    if (!Array.isArray(savedCases) || !draft.courtSelection) {
      return 0;
    }
    let target = '';
    if (selectedPortal) {
      target = selectedPortal.id;
    } else if (customCourtName) {
      target = customCourtName;
    }
    if (!target) {
      return 0;
    }
    return savedCases.filter((existing) => existing.courtType === target).length;
  }, [customCourtName, draft.courtSelection, savedCases, selectedPortal]);

  const isKarnatakaHC = selectedPortal && selectedPortal.id === 'karnatakaHC';
  const isECourts = selectedPortal && selectedPortal.id === 'ecourts';
  const isDRT = selectedPortal && selectedPortal.id === 'drt';
  const isNCLAT = selectedPortal && selectedPortal.id === 'nclat';
  const isNCLT = selectedPortal && selectedPortal.id === 'nclt';
  const isUnsupportedCourt = Boolean(customCourtName);
  const hasCourtPicked = Boolean(selectedPortal) || isUnsupportedCourt;

  const karnatakaBenches = useMemo(() => {
    const benches = [...BUILT_IN_KARNATAKA_HC_BENCHES];
    for (const item of customBenches) {
      if (!benches.some((bench) => bench.name.toLowerCase() === item.name.toLowerCase())) {
        benches.push({ id: item.name, name: item.name });
      }
    }
    return benches;
  }, [customBenches]);

  const allCaseTypes = useMemo(() => {
    const types = [...BUILT_IN_CASE_TYPES];
    for (const item of customCaseTypes) {
      if (!types.some((existing) => existing.toLowerCase() === item.name.toLowerCase())) {
        types.push(item.name);
      }
    }
    return types;
  }, [customCaseTypes]);

  // When a known portal is selected, auto-fill the URL and default the bench.
  useEffect(() => {
    if (!selectedPortal) {
      return;
    }
    setDraft((current) => {
      const next = { ...current };
      if (!next.sourceUrl) {
        next.sourceUrl = selectedPortal.portalUrl || '';
      }
      if (isKarnatakaHC && !next.benchId) {
        next.benchId = karnatakaBenches[0]?.id || '';
      }
      return next;
    });
  }, [selectedPortal, isKarnatakaHC, karnatakaBenches]);

  // When DRT is selected, fetch the bench list once per modal session.
  useEffect(() => {
    if (!isDRT) {
      return undefined;
    }
    let cancelled = false;
    setDrtBenchesLoading(true);
    setDrtBenchesError('');
    fetchDrtBenches()
      .then((response) => {
        if (cancelled) return;
        const sorted = (response.benches || []).slice().sort((a, b) =>
          String(a.SchemaName || '').localeCompare(String(b.SchemaName || '')),
        );
        setDrtBenches(sorted);
      })
      .catch((fetchError) => {
        if (cancelled) return;
        // eslint-disable-next-line no-console
        console.error('[AddCaseModal] DRT bench list failed:', fetchError);
        setDrtBenches([]);
        setDrtBenchesError(fetchError.message || 'Failed to load DRT benches.');
      })
      .finally(() => {
        if (!cancelled) setDrtBenchesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isDRT]);

  // NCLAT bench + case types are small static lists — fetch once when picked.
  useEffect(() => {
    if (!isNCLAT) {
      return undefined;
    }
    let cancelled = false;
    setNclatError('');
    Promise.all([fetchNclatBenches(), fetchNclatCaseTypes()])
      .then(([benchResp, typeResp]) => {
        if (cancelled) return;
        setNclatBenches(benchResp.benches || []);
        setNclatCaseTypes(typeResp.caseTypes || []);
      })
      .catch((nclatLoadError) => {
        if (cancelled) return;
        // eslint-disable-next-line no-console
        console.error('[AddCaseModal] NCLAT options failed:', nclatLoadError);
        setNclatError(nclatLoadError.message || 'Failed to load NCLAT options.');
      });
    return () => {
      cancelled = true;
    };
  }, [isNCLAT]);

  // NCLT bench + case types — small static lists, fetched once when picked.
  useEffect(() => {
    if (!isNCLT) {
      return undefined;
    }
    let cancelled = false;
    setNcltError('');
    Promise.all([fetchNcltBenches(), fetchNcltCaseTypes()])
      .then(([benchResp, typeResp]) => {
        if (cancelled) return;
        setNcltBenches(benchResp.benches || []);
        setNcltCaseTypes(typeResp.caseTypes || []);
      })
      .catch((ncltLoadError) => {
        if (cancelled) return;
        // eslint-disable-next-line no-console
        console.error('[AddCaseModal] NCLT options failed:', ncltLoadError);
        setNcltError(ncltLoadError.message || 'Failed to load NCLT options.');
      });
    return () => {
      cancelled = true;
    };
  }, [isNCLT]);

  // When the bench changes in DRT mode, fetch its case types.
  useEffect(() => {
    if (!isDRT || !draft.benchId) {
      setDrtCaseTypes([]);
      setDrtCaseTypesError('');
      return undefined;
    }
    let cancelled = false;
    setDrtCaseTypesLoading(true);
    setDrtCaseTypesError('');
    fetchDrtCaseTypes(draft.benchId)
      .then((response) => {
        if (cancelled) return;
        const sorted = (response.caseTypes || []).slice().sort((a, b) =>
          String(a.caseTypeName || '').localeCompare(String(b.caseTypeName || '')),
        );
        setDrtCaseTypes(sorted);
      })
      .catch((fetchError) => {
        if (cancelled) return;
        // eslint-disable-next-line no-console
        console.error('[AddCaseModal] DRT case-type list failed:', fetchError);
        setDrtCaseTypes([]);
        setDrtCaseTypesError(fetchError.message || 'Failed to load case types.');
      })
      .finally(() => {
        if (!cancelled) setDrtCaseTypesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isDRT, draft.benchId]);

  const update = (patch) => setDraft((current) => ({ ...current, ...patch }));

  const toggleRecipient = (id) => {
    setDraft((current) => {
      const exists = current.recipientIds.includes(id);
      return {
        ...current,
        recipientIds: exists
          ? current.recipientIds.filter((rid) => rid !== id)
          : [...current.recipientIds, id],
      };
    });
  };

  const onCourtSelectChange = (value) => {
    if (value === ADD_NEW_VALUE) {
      setAddingKind('courtTypes');
      return;
    }
    if (value === EMPTY_VALUE) {
      setDraft((current) => ({
        ...current,
        benchId: '',
        courtSelection: EMPTY_VALUE,
        sourceUrl: '',
      }));
      return;
    }

    // Known-court selection: convert to a custom court (no adapter yet) but
    // pre-fill the portal URL from the catalog.
    if (value.startsWith('known:')) {
      const name = value.slice('known:'.length);
      const known = knownCourtByName(name);
      setDraft((current) => ({
        ...current,
        benchId: '',
        courtSelection: `custom:${name}`,
        sourceUrl: (known && known.portalUrl) || '',
      }));
      return;
    }

    // value is portal:<id> or custom:<name>
    setDraft((current) => {
      const next = {
        ...current,
        benchId: '',
        courtSelection: value,
        sourceUrl: value.startsWith('portal:') ? current.sourceUrl : '',
      };
      // If a custom court matches one in our known catalog, pre-fill its URL
      if (value.startsWith('custom:') && !next.sourceUrl) {
        const known = knownCourtByName(value.slice('custom:'.length));
        if (known && known.portalUrl) {
          next.sourceUrl = known.portalUrl;
        }
      }
      return next;
    });
  };

  const handleAddLookup = async (kind, name) => {
    setError('');
    setAddingSaving(true);
    try {
      const item = await onAddLookupItem(kind, name);
      if (kind === 'courtTypes') {
        // Select the newly added court automatically
        setDraft((current) => ({
          ...current,
          benchId: '',
          courtSelection: `custom:${item.name}`,
          sourceUrl: '',
        }));
      } else if (kind === 'benches' && isKarnatakaHC) {
        update({ benchId: item.name });
      } else if (kind === 'benches') {
        update({ benchId: item.name });
      } else if (kind === 'caseTypes') {
        update({ caseType: item.name });
      }
      setAddingKind('');
    } catch (lookupError) {
      setError(lookupError.message);
      throw lookupError;
    } finally {
      setAddingSaving(false);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');

    if (!draft.courtSelection || draft.courtSelection === ADD_NEW_VALUE) {
      setError('Pick a court type.');
      return;
    }

    const sourceUrl = draft.sourceUrl.trim();
    const rawCaseNumber = draft.caseNumber.trim();

    if (!sourceUrl) {
      setError('Portal URL is required.');
      return;
    }

    // eCourts uses a 16-character CNR as the only required field — derive the
    // other fields from the CNR itself.
    if (isDRT || isNCLAT || isNCLT) {
      const courtId = isNCLAT ? 'nclat' : isNCLT ? 'nclt' : 'drt';
      const portalLabel = isNCLAT ? 'NCLAT' : isNCLT ? 'NCLT' : 'DRT';
      const benchId = String(draft.benchId || '').trim();
      const caseType = String(draft.caseType || '').trim();
      const caseNo = String(draft.caseNumber || '').trim();
      const caseYear = String(draft.caseYear || '').trim();
      if (!benchId) {
        setError(`Pick a ${portalLabel} bench.`);
        return;
      }
      if (!caseType) {
        setError('Pick a case type.');
        return;
      }
      if (!caseNo || !caseYear) {
        setError('Case number and year are required.');
        return;
      }
      const newCase = {
        benchId,
        caseNumber: caseNo,
        caseType,
        caseYear,
        courtType: courtId,
        recipientIds: draft.recipientIds,
        schedule: draft.schedule,
        sourceUrl,
        userId: currentUserId || '',
      };

      setSubmitting(true);
      try {
        await onSubmit(newCase);
        onClose();
      } catch (submitError) {
        setError(submitError.message);
      } finally {
        setSubmitting(false);
      }
      return;
    }

    if (isECourts) {
      const cnr = rawCaseNumber.toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (cnr.length !== 16) {
        setError('CNR must be exactly 16 characters (letters and digits).');
        return;
      }
      const newCase = {
        benchId: cnr.slice(0, 4), // state + court code embedded in CNR
        caseNumber: cnr,
        caseType: 'CNR',
        caseYear: cnr.slice(12, 16),
        cnr,
        courtType: 'ecourts',
        recipientIds: draft.recipientIds,
        schedule: draft.schedule,
        sourceUrl,
        userId: currentUserId || '',
      };

      setSubmitting(true);
      try {
        await onSubmit(newCase);
        onClose();
      } catch (submitError) {
        setError(submitError.message);
      } finally {
        setSubmitting(false);
      }
      return;
    }

    const caseNumber = rawCaseNumber;
    const caseYear = draft.caseYear.trim();
    const caseType = draft.caseType.trim().toUpperCase();

    if (!caseNumber || !caseYear) {
      setError('Case number and year are required.');
      return;
    }
    if (!caseType) {
      setError('Case type is required.');
      return;
    }

    let benchId = draft.benchId.trim();
    let courtType = '';

    if (selectedPortal) {
      if (isKarnatakaHC) {
        courtType = 'highCourtKarnataka';
        if (!benchId) {
          setError('Pick a bench.');
          return;
        }
      } else {
        courtType = selectedPortal.id;
      }
    } else if (customCourtName) {
      courtType = customCourtName;
      if (!benchId) {
        benchId = 'OTHER';
      }
    }

    const newCase = {
      benchId,
      caseNumber,
      caseType,
      caseYear,
      courtType,
      recipientIds: draft.recipientIds,
      schedule: draft.schedule,
      sourceUrl,
      userId: currentUserId || '',
    };

    setSubmitting(true);
    try {
      await onSubmit(newCase);
      onClose();
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-6">
      <div className="my-8 w-full max-w-2xl rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Add a case</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Pick the court, then fill in the case details.
            </p>
          </div>
          <button
            className="text-slate-400 hover:text-slate-600"
            onClick={onClose}
            type="button"
          >
            ✕
          </button>
        </div>

        <form className="space-y-5 px-6 py-5" onSubmit={handleSubmit}>
          <div>
            <span className="field-label">Court type *</span>
            <div className="mt-1.5">
              <CourtPicker
                groups={pickerGroups}
                onAddNew={() => setAddingKind('courtTypes')}
                onChange={onCourtSelectChange}
                value={draft.courtSelection}
              />
            </div>
            {selectedPortal ? (
              <p className="mt-1.5 text-xs text-emerald-700">
                ✓ <strong>{selectedPortal.name}</strong> is supported — cases will be auto-monitored.
              </p>
            ) : isUnsupportedCourt ? (
              <p className="mt-1.5 text-xs text-slate-600">
                <strong>Manual tracking</strong> — auto-monitoring isn't built for {customCourtName} yet. The case is saved with its portal URL so you can check it any time; we'll start auto-fetching once an adapter is added.
              </p>
            ) : null}
            {existingCasesAtCourt > 0 ? (
              <p className="mt-1 text-xs text-slate-500">
                You're already tracking {existingCasesAtCourt} case{existingCasesAtCourt === 1 ? '' : 's'} at this court.
              </p>
            ) : null}
            {addingKind === 'courtTypes' ? (
              <InlineAdd
                label="New court"
                onCancel={() => setAddingKind('')}
                onSave={(name) => handleAddLookup('courtTypes', name)}
                placeholder="e.g. Madras High Court"
                saving={addingSaving}
              />
            ) : null}
          </div>

          <label className="block">
            <span className="field-label">Portal URL *</span>
            <div className="mt-1.5">
              <input
                className="input"
                onChange={(event) => update({ sourceUrl: event.target.value })}
                placeholder={
                  selectedPortal
                    ? selectedPortal.portalUrl
                    : 'https://example-court.gov.in/casestatus'
                }
                value={draft.sourceUrl}
              />
            </div>
            {selectedPortal && draft.sourceUrl === selectedPortal.portalUrl ? (
              <p className="mt-1 text-xs text-slate-500">Auto-filled from court selection — edit if your portal URL is different.</p>
            ) : null}
          </label>

          {hasCourtPicked && isNCLT ? (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="field-label">NCLT bench *</span>
                  <div className="mt-1.5">
                    <select
                      className="input"
                      onChange={(event) => update({ benchId: event.target.value })}
                      value={draft.benchId}
                    >
                      <option value="">— Select a bench —</option>
                      {ncltBenches.map((bench) => (
                        <option key={bench.id} value={bench.id}>
                          {bench.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </label>
                <label className="block">
                  <span className="field-label">Case type *</span>
                  <div className="mt-1.5">
                    <select
                      className="input"
                      onChange={(event) => update({ caseType: event.target.value })}
                      value={draft.caseType}
                    >
                      <option value="">— Select a case type —</option>
                      {ncltCaseTypes.map((type) => (
                        <option key={type.id} value={type.id}>
                          {type.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </label>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="field-label">Case number *</span>
                  <div className="mt-1.5">
                    <input
                      className="input"
                      inputMode="numeric"
                      onChange={(event) => update({ caseNumber: event.target.value })}
                      placeholder="1"
                      value={draft.caseNumber}
                    />
                  </div>
                </label>
                <label className="block">
                  <span className="field-label">Case year *</span>
                  <div className="mt-1.5">
                    <input
                      className="input"
                      inputMode="numeric"
                      maxLength={4}
                      onChange={(event) => update({ caseYear: event.target.value })}
                      placeholder="2024"
                      value={draft.caseYear}
                    />
                  </div>
                </label>
              </div>
              {ncltError ? (
                <p className="text-xs text-rose-700">✗ {ncltError}</p>
              ) : (
                <p className="text-xs text-slate-500">
                  ✓ No captcha required — NCLT cases fetch directly (captcha is client-side only).
                </p>
              )}
            </div>
          ) : hasCourtPicked && isNCLAT ? (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="field-label">NCLAT bench *</span>
                  <div className="mt-1.5">
                    <select
                      className="input"
                      onChange={(event) => update({ benchId: event.target.value })}
                      value={draft.benchId}
                    >
                      <option value="">— Select a bench —</option>
                      {nclatBenches.map((bench) => (
                        <option key={bench.id} value={bench.id}>
                          {bench.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </label>
                <label className="block">
                  <span className="field-label">Case type *</span>
                  <div className="mt-1.5">
                    <select
                      className="input"
                      onChange={(event) => update({ caseType: event.target.value })}
                      value={draft.caseType}
                    >
                      <option value="">— Select a case type —</option>
                      {nclatCaseTypes.map((type) => (
                        <option key={type.id} value={type.id}>
                          {type.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </label>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="field-label">Case number *</span>
                  <div className="mt-1.5">
                    <input
                      className="input"
                      inputMode="numeric"
                      onChange={(event) => update({ caseNumber: event.target.value })}
                      placeholder="1"
                      value={draft.caseNumber}
                    />
                  </div>
                </label>
                <label className="block">
                  <span className="field-label">Case year *</span>
                  <div className="mt-1.5">
                    <input
                      className="input"
                      inputMode="numeric"
                      maxLength={4}
                      onChange={(event) => update({ caseYear: event.target.value })}
                      placeholder="2024"
                      value={draft.caseYear}
                    />
                  </div>
                </label>
              </div>
              {nclatError ? (
                <p className="text-xs text-rose-700">✗ {nclatError}</p>
              ) : (
                <p className="text-xs text-slate-500">
                  ✓ No captcha required — NCLAT cases fetch directly via their official API.
                </p>
              )}
            </div>
          ) : hasCourtPicked && isDRT ? (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="field-label">DRT bench *</span>
                  <div className="mt-1.5">
                    <select
                      className="input"
                      disabled={drtBenchesLoading}
                      onChange={(event) => update({ benchId: event.target.value, caseType: '' })}
                      value={draft.benchId}
                    >
                      <option value="">
                        {drtBenchesLoading ? 'Loading benches…' : '— Select a DRT bench —'}
                      </option>
                      {drtBenches.map((bench) => (
                        <option key={bench.schemeNameDrtId} value={bench.schemeNameDrtId}>
                          {bench.SchemaName}
                        </option>
                      ))}
                    </select>
                  </div>
                  {drtBenchesError ? (
                    <p className="mt-1 text-xs text-rose-700">
                      ✗ {drtBenchesError} — restart the server (<code className="rounded bg-rose-100 px-1">npm run kill-server</code>, then <code className="rounded bg-rose-100 px-1">npm start</code>) and reopen this dialog.
                    </p>
                  ) : (
                    <p className="mt-1 text-xs text-slate-500">
                      {drtBenchesLoading
                        ? 'Fetching the live bench list from drt.gov.in…'
                        : `Live list from drt.gov.in — ${drtBenches.length} benches.`}
                    </p>
                  )}
                </label>
                <label className="block">
                  <span className="field-label">Case type *</span>
                  <div className="mt-1.5">
                    <select
                      className="input"
                      disabled={!draft.benchId || drtCaseTypesLoading}
                      onChange={(event) => update({ caseType: event.target.value })}
                      value={draft.caseType}
                    >
                      <option value="">
                        {!draft.benchId
                          ? '— Pick a bench first —'
                          : drtCaseTypesLoading
                            ? 'Loading case types…'
                            : '— Select a case type —'}
                      </option>
                      {drtCaseTypes.map((type) => (
                        <option key={type.caseType} value={type.caseType}>
                          {type.caseTypeName}
                        </option>
                      ))}
                    </select>
                  </div>
                  {drtCaseTypesError ? (
                    <p className="mt-1 text-xs text-rose-700">✗ {drtCaseTypesError}</p>
                  ) : null}
                </label>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="field-label">Case number *</span>
                  <div className="mt-1.5">
                    <input
                      className="input"
                      inputMode="numeric"
                      onChange={(event) => update({ caseNumber: event.target.value })}
                      placeholder="100"
                      value={draft.caseNumber}
                    />
                  </div>
                </label>
                <label className="block">
                  <span className="field-label">Case year *</span>
                  <div className="mt-1.5">
                    <input
                      className="input"
                      inputMode="numeric"
                      maxLength={4}
                      onChange={(event) => update({ caseYear: event.target.value })}
                      placeholder="2024"
                      value={draft.caseYear}
                    />
                  </div>
                </label>
              </div>
              <p className="text-xs text-slate-500">
                ✓ No captcha required — DRT cases fetch directly via their official API.
              </p>
            </div>
          ) : hasCourtPicked && isECourts ? (
            <div>
              <label className="block">
                <span className="field-label">CNR Number *</span>
                <div className="mt-1.5">
                  <input
                    autoCapitalize="characters"
                    className="input font-mono"
                    maxLength={16}
                    onChange={(event) =>
                      update({ caseNumber: event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') })
                    }
                    placeholder="e.g. KAHC010012342024"
                    value={draft.caseNumber}
                  />
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  The 16-character CNR is printed on every court document. Format: state code + court code + 6 digits + 4-digit year.
                </p>
                {draft.caseNumber && draft.caseNumber.length > 0 && draft.caseNumber.length !== 16 ? (
                  <p className="mt-1 text-xs text-amber-700">
                    {draft.caseNumber.length} of 16 characters entered.
                  </p>
                ) : null}
              </label>
            </div>
          ) : hasCourtPicked ? (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <span className="field-label">Bench / Tribunal {isKarnatakaHC ? '*' : ''}</span>
                  <div className="mt-1.5 flex gap-2">
                    {isKarnatakaHC ? (
                      <select
                        className="input flex-1"
                        onChange={(event) => update({ benchId: event.target.value })}
                        value={draft.benchId}
                      >
                        {karnatakaBenches.map((bench) => (
                          <option key={bench.id} value={bench.id}>
                            {bench.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        className="input flex-1"
                        list="modal-bench-types"
                        onChange={(event) => update({ benchId: event.target.value })}
                        placeholder="e.g. Madurai Bench"
                        value={draft.benchId}
                      />
                    )}
                    {!isKarnatakaHC ? (
                      <datalist id="modal-bench-types">
                        {customBenches.map((bench) => (
                          <option key={bench.id} value={bench.name} />
                        ))}
                      </datalist>
                    ) : null}
                    <button
                      className="btn-secondary whitespace-nowrap"
                      onClick={() => setAddingKind(addingKind === 'benches' ? '' : 'benches')}
                      type="button"
                    >
                      + Add
                    </button>
                  </div>
                  {addingKind === 'benches' ? (
                    <InlineAdd
                      label="New bench"
                      onCancel={() => setAddingKind('')}
                      onSave={(name) => handleAddLookup('benches', name)}
                      placeholder="e.g. Madurai Bench"
                      saving={addingSaving}
                    />
                  ) : null}
                </div>

                <div>
                  <span className="field-label">Case type *</span>
                  <div className="mt-1.5 flex gap-2">
                    <select
                      className="input flex-1"
                      onChange={(event) => update({ caseType: event.target.value })}
                      value={draft.caseType}
                    >
                      <option value="">— Select a case type —</option>
                      {allCaseTypes.map((type) => (
                        <option key={type} value={type}>
                          {type}
                        </option>
                      ))}
                    </select>
                    <button
                      className="btn-secondary whitespace-nowrap"
                      onClick={() => setAddingKind(addingKind === 'caseTypes' ? '' : 'caseTypes')}
                      type="button"
                    >
                      + Add
                    </button>
                  </div>
                  {addingKind === 'caseTypes' ? (
                    <InlineAdd
                      label="New case type"
                      onCancel={() => setAddingKind('')}
                      onSave={(name) => handleAddLookup('caseTypes', name)}
                      placeholder="e.g. SLP"
                      saving={addingSaving}
                    />
                  ) : null}
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="field-label">Case number *</span>
                  <div className="mt-1.5">
                    <input
                      className="input"
                      inputMode="numeric"
                      onChange={(event) => update({ caseNumber: event.target.value })}
                      placeholder="17880"
                      value={draft.caseNumber}
                    />
                  </div>
                </label>
                <label className="block">
                  <span className="field-label">Case year *</span>
                  <div className="mt-1.5">
                    <input
                      className="input"
                      inputMode="numeric"
                      maxLength={4}
                      onChange={(event) => update({ caseYear: event.target.value })}
                      placeholder="2024"
                      value={draft.caseYear}
                    />
                  </div>
                </label>
              </div>
            </>
          ) : (
            <div className="rounded-md border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500">
              Pick a court above to see the case fields.
            </div>
          )}

          <fieldset>
            <legend className="field-label">Check schedule</legend>
            <p className="mt-1 text-xs text-slate-500">
              Add more schedules from Settings → Custom schedules.
            </p>
            <div className="mt-2 space-y-2">
              {scheduleOptions.map((option) => (
                <label
                  className={`flex cursor-pointer items-start gap-3 rounded-md border px-3 py-2 transition ${
                    draft.schedule === option.cron
                      ? 'border-brand-500 bg-brand-50'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                  key={option.cron}
                >
                  <input
                    checked={draft.schedule === option.cron}
                    className="mt-0.5"
                    name="schedule"
                    onChange={() => update({ schedule: option.cron })}
                    type="radio"
                    value={option.cron}
                  />
                  <span>
                    <span className="text-sm font-medium text-slate-900">{option.label}</span>
                    <span className="block text-xs text-slate-500">
                      {option.description}
                      {option.custom ? ' · custom' : ''}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          {users && users.length ? (
            <fieldset>
              <legend className="field-label">Email recipients</legend>
              <p className="mt-1 text-xs text-slate-500">
                Pick who should get the change-detection emails for this case.
              </p>
              <div className="mt-2 max-h-40 space-y-1 overflow-y-auto rounded-md border border-slate-200 px-3 py-2">
                {users.map((user) => (
                  <label
                    className="flex items-center gap-2 py-1 text-sm text-slate-700"
                    key={user.id}
                  >
                    <input
                      checked={draft.recipientIds.includes(user.id)}
                      onChange={() => toggleRecipient(user.id)}
                      type="checkbox"
                    />
                    <span className="font-medium text-slate-900">{user.name}</span>
                    <span className="text-xs text-slate-500">
                      {user.email || user.phone || '(no contact)'}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          ) : null}

          {error ? (
            <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {error}
            </div>
          ) : null}

          <div className="flex justify-end gap-3 border-t border-slate-200 -mx-6 -mb-5 px-6 py-4">
            <button
              className="btn-secondary"
              disabled={submitting}
              onClick={onClose}
              type="button"
            >
              Cancel
            </button>
            <button className="btn-primary" disabled={submitting} type="submit">
              {submitting ? 'Saving…' : 'Add case'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
