/** Stage, extract and retain local TXT without sending anything to the portfolio. */
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { focus } from './GlobalBar.jsx';
import { extractSample, listSamples, removeSample, SAMPLE_LIMIT, saveSample } from '../utils/samples.js';

const secondary = `min-h-11 rounded-md border border-border bg-surface px-3 text-sm hover:bg-surface-raised disabled:opacity-50 ${focus}`;
const primary = `min-h-11 rounded-md bg-primary-700 px-3 text-sm font-medium text-white enabled:hover:bg-primary-800 disabled:opacity-50 ${focus}`;
const messages = {
  STORAGE_UNAVAILABLE: 'Retained samples could not be loaded. Enable browser storage and retry.',
  STORE_VERSION_INVALID: 'Retained samples are unreadable or from an unsupported version. They have not been overwritten. Clearing site data deletes all retained samples and the saved session.',
  SAMPLE_UNSUPPORTED: 'Choose a UTF-8 .txt file. Only plain text is supported.',
  SAMPLE_TOO_LARGE: 'Choose a TXT file of 64 KiB or less.',
  SAMPLE_LIMIT: 'Ten samples are already retained. Remove a sample before saving another.',
  SAMPLE_EXTRACT_FAILED: 'The file could not be read as UTF-8 plain text. Choose a valid synthetic TXT file and retry.',
  SAMPLE_STORE_FAILED: 'The sample change could not be saved. Check browser storage and try again. Previously retained samples are unchanged.',
};

/** Render the isolated intake route; only this view reads retained samples. */
export function SampleIntake() {
  const id = useId();
  const input = useRef(null);
  const generation = useRef(0);
  const busy = useRef(false);
  const [records, setRecords] = useState(null);
  const [file, setFile] = useState(null);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState(null);
  const [status, setStatus] = useState('');
  const invalidFile = ['SAMPLE_UNSUPPORTED', 'SAMPLE_TOO_LARGE', 'SAMPLE_EXTRACT_FAILED'].includes(error);
  useEffect(() => { load(); }, []);
  useLayoutEffect(() => () => { generation.current += 1; }, []);

  /** Load saved records without rewriting or re-extracting anything. */
  function load() {
    const result = listSamples();
    setError(result.ok ? null : result.code);
    if (result.ok) setRecords(result.samples);
  }

  /** Invalidate the current read before accepting another selection or cancel. */
  function abandon() {
    generation.current += 1;
    busy.current = false;
    setReading(false);
    setError(null);
    setStatus('');
  }

  /** Clear the staged selection and restore focus to the chooser. */
  function cancel() {
    abandon();
    setFile(null);
    input.current.value = '';
    input.current.focus();
    setStatus('Selection canceled.');
  }

  /** Read on explicit intent, rejecting stale results before any storage mutation. */
  async function extractAndSave() {
    if (!file || !records || busy.current) return;
    if (records.length === SAMPLE_LIMIT) {
      setError('SAMPLE_LIMIT');
      return;
    }
    const command = ++generation.current;
    busy.current = true;
    setReading(true);
    setError(null);
    setStatus('Reading synthetic sample…');
    const extracted = await extractSample(file);
    if (command !== generation.current) return;
    const result = extracted.ok ? saveSample(records, extracted.sample) : extracted;
    busy.current = false;
    setReading(false);
    if (!result.ok) {
      setStatus('');
      setError(result.code);
      return;
    }
    setRecords(result.samples);
    setFile(null);
    input.current.value = '';
    input.current.focus();
    setStatus('Synthetic sample saved on this browser.');
  }

  /**
   * Remove one record only after its replacement envelope is stored.
   * Args:
   *   sampleId: Stable identifier of the retained sample.
   */
  function remove(sampleId) {
    if (busy.current) return;
    setError(null);
    setStatus('');
    const result = removeSample(records, sampleId);
    if (!result.ok) {
      setError(result.code);
      return;
    }
    setRecords(result.samples);
    input.current.focus();
    setStatus('Synthetic sample removed.');
  }

  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <h1 tabIndex={-1} className="text-3xl font-semibold tracking-tight">Synthetic samples</h1>
        <p id={`${id}-warning`} className="mt-3 font-medium">Synthetic samples only. Do not select real or confidential data.</p>
        <p className="mt-2 text-foreground-muted">Retained text stays in this browser profile until removed or site data is cleared. It does not affect assessments, priorities or diagnostics. If you select real information by mistake, cancel; if saved, remove it and clear site data.</p>
        <p className="mt-3 text-sm text-foreground-muted">UTF-8 TXT only · Up to 64 KiB per file · Up to 10 retained samples</p>
        <a href={`${import.meta.env.BASE_URL}synthetic-workshop-example.txt`} download className={`mt-1 inline-flex min-h-11 items-center text-sm text-primary-700 underline underline-offset-4 ${focus}`}>
          Download synthetic-workshop-example.txt
        </a>
      </div>
      <section aria-labelledby={`${id}-intake`} className="space-y-3 border-y border-border py-5">
        <h2 id={`${id}-intake`} className="text-lg font-semibold">Extract a sample</h2>
        <label htmlFor={`${id}-file`} className="block text-sm font-medium">Choose Synthetic File</label>
        <input ref={input} id={`${id}-file`} type="file" accept=".txt,text/plain" disabled={!records}
          aria-invalid={invalidFile || undefined}
          aria-describedby={`${id}-warning${error ? ` ${id}-error` : ''}`}
          className={`block min-h-11 w-full text-sm file:mr-3 file:min-h-11 file:rounded-md file:border file:border-border file:bg-surface file:px-3 file:text-foreground ${focus}`}
          onChange={event => { abandon(); setFile(event.currentTarget.files[0] ?? null); }} />
        <div className="flex flex-wrap gap-2">
          <button type="button" className={primary} onClick={extractAndSave} disabled={!file || reading}>Extract and Save</button>
          <button type="button" className={secondary} onClick={cancel} disabled={!file}>Cancel selection</button>
        </div>
        <p role="status" className="text-sm text-foreground-muted">{status}</p>
        {error && <p id={`${id}-error`} role="alert" className="text-sm">{messages[error]}</p>}
      </section>
      <section aria-labelledby={`${id}-retained`} className="space-y-3">
        <h2 id={`${id}-retained`} className="text-lg font-semibold">Retained samples</h2>
        {!records && (error ? (
          <button type="button" className={secondary} onClick={load}>Retry Loading Samples</button>
        ) : <p role="status">Loading retained samples…</p>)}
        {records?.length === 0 && <p className="text-sm text-foreground-muted">No retained samples yet.</p>}
        {records?.length > 0 && (
          <ul aria-label="Retained samples" className="divide-y divide-border">
            {records.map(record => (
              <li key={record.id} className="space-y-2 py-4">
                <h3 className="break-all font-medium">{record.name}</h3>
                <p className="text-sm text-foreground-muted">{record.size} bytes</p>
                <pre className="whitespace-pre-wrap break-words rounded-md border border-border bg-surface p-3 text-sm">{record.text}</pre>
                <button type="button" className={secondary} disabled={reading} aria-label={`Remove sample ${record.name}`} onClick={() => remove(record.id)}>Remove sample</button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
