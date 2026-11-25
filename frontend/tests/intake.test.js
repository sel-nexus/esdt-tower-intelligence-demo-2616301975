// @vitest-environment jsdom
/** Verify the local workshop entry, exact text validation and isolated storage recovery. */
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from '../src/App.jsx';
import { SESSION_KEY, resumeSession, selectPersona, exitSession } from '../src/utils/session.js';
import { MAX_SAMPLE_BYTES, SAMPLES_KEY, extractSample, listSamples, removeSample, saveSample } from '../src/utils/samples.js';

const marker = '{"v":1,"signedIn":true}';
const retainedSample = { id: 'retained-1', name: 'retained.txt', type: 'text/plain', size: 3, lastModified: 0, text: 'abc' };
const retainedBytes = JSON.stringify({ v: 1, records: [retainedSample] }, null, 2);
const literal = '\ufeff<b>Synthetic practice only.</b>\r\n\t😀';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  localStorage.clear();
  window.history.replaceState(null, '', '/');
});

/** Model the measured file bytes independently of reported metadata. */
function txt(bytes, metadata = {}) {
  const contents = typeof bytes === 'string' ? new TextEncoder().encode(bytes) : new Uint8Array(bytes);
  return { name: 'Synthetic.TXT', type: '', size: contents.byteLength, lastModified: 0,
    arrayBuffer: async () => contents.buffer, ...metadata };
}

/** Choose the Portfolio Manager perspective through the rendered entry. */
function enterDemo() {
  fireEvent.click(screen.getByRole('button', { name: 'Portfolio Manager' }));
}

/** Open the current demo role disclosure and exit the workshop. */
function exitDemo() {
  fireEvent.click(screen.getByText('Demo role', { exact: true }).closest('summary'));
  fireEvent.click(screen.getByRole('button', { name: 'Exit workshop' }));
}

/** Open the sample route with an existing, documented session marker. */
function openIntake() {
  localStorage.setItem(SESSION_KEY, marker);
  window.history.replaceState(null, '', '/#/samples');
  return render(createElement(App));
}

/** Stage a file using the browser control's change event. */
function stage(file) {
  fireEvent.change(screen.getByLabelText('Choose Synthetic File'), { target: { files: [file] } });
}

const extractButton = () => screen.getByRole('button', { name: 'Extract and Save' });

describe('local workshop session', () => {
  it.each(['', 'Portfolio', 'portfolio ', 'constructor'])(
    'does not persist an unknown role (%s)', role => {
      expect(selectPersona(role, localStorage)).toEqual({ ok: false, code: 'UNKNOWN_PERSONA' });
      expect(localStorage.length).toBe(0);
    },
  );

  it('reads a legacy marker without writing, persists only the role, and exits without touching samples', () => {
    localStorage.setItem(SAMPLES_KEY, retainedBytes);
    expect(resumeSession(localStorage)).toEqual({ ok: true });
    localStorage.setItem(SESSION_KEY, marker);
    expect(resumeSession(localStorage)).toEqual({ ok: true, persona: 'portfolio' });
    expect(localStorage.getItem(SESSION_KEY)).toBe(marker);
    expect(selectPersona('asset', localStorage)).toEqual({ ok: true, persona: 'asset' });
    expect(JSON.parse(localStorage.getItem(SESSION_KEY))).toEqual({ v: 2, persona: 'asset' });
    expect(resumeSession(localStorage).persona).toBe('asset');
    expect(localStorage.length).toBe(2);
    expect(exitSession(localStorage)).toEqual({ ok: true });
    expect(localStorage.getItem(SESSION_KEY)).toBeNull();
    expect(localStorage.getItem(SAMPLES_KEY)).toBe(retainedBytes);
  });

  it.each(['{', '{"v":2,"signedIn":true}', '{"v":2,"persona":"unknown"}', '{"v":1,"signedIn":"true"}', '{"v":1,"signedIn":true,"token":0}'])(
    'fails closed on invalid markers without overwriting them (%s)', raw => {
      localStorage.setItem(SESSION_KEY, raw);
      expect(resumeSession()).toEqual({ ok: false, code: 'STORE_VERSION_INVALID' });
      expect(localStorage.getItem(SESSION_KEY)).toBe(raw);
    },
  );

  it('shows entry before opening deep links, does not read samples on portfolio entry, and fails closed on a blocked marker write', () => {
    window.history.replaceState(null, '', '/#/samples');
    const reads = vi.spyOn(Storage.prototype, 'getItem');
    render(createElement(App));
    expect(screen.getByRole('heading', { name: 'Choose a demo role' })).toHaveFocus();
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Password')).not.toBeInTheDocument();
    const original = Storage.prototype.setItem;
    const failure = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (key, value) {
      if (key === SESSION_KEY) throw new DOMException('Blocked', 'QuotaExceededError');
      original.call(this, key, value);
    });
    enterDemo();
    expect(screen.getByRole('alert')).toHaveTextContent('Browser storage is unavailable');
    expect(localStorage.getItem(SESSION_KEY)).toBeNull();
    failure.mockRestore();
    enterDemo();
    expect(screen.getByRole('heading', { name: 'Portfolio scenario' })).toHaveFocus();
    expect(reads.mock.calls).not.toContainEqual([SAMPLES_KEY]);
  });

  it('warns on failed deletion, hides the workshop, and clears the marker on explicit retry', () => {
    openIntake();
    const removal = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error('Blocked'); });
    exitDemo();
    expect(screen.getByRole('alert')).toHaveTextContent('Reloading may restore it');
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Portfolio Manager' })).not.toBeInTheDocument();
    expect(localStorage.getItem(SESSION_KEY)).toBe(marker);
    removal.mockRestore();
    fireEvent.click(screen.getByRole('button', { name: 'Retry exit' }));
    expect(screen.getByRole('heading', { name: 'Choose a demo role' })).toHaveFocus();
    expect(localStorage.getItem(SESSION_KEY)).toBeNull();
  });
});

describe('isolated synthetic samples', () => {
  it.each([
    ['bad extension', txt('a', { name: 'synthetic.csv' }), 'SAMPLE_UNSUPPORTED'],
    ['bad MIME', txt('a', { type: 'text/html' }), 'SAMPLE_UNSUPPORTED'],
    ['oversize selection', txt('a', { size: MAX_SAMPLE_BYTES + 1 }), 'SAMPLE_TOO_LARGE'],
    ['oversize measured bytes', txt(new Uint8Array(MAX_SAMPLE_BYTES + 1), { size: 1 }), 'SAMPLE_TOO_LARGE'],
    ['wrong measured size', txt('abc', { size: 1 }), 'SAMPLE_EXTRACT_FAILED'],
    ['invalid UTF-8', txt([0xc3, 0x28]), 'SAMPLE_EXTRACT_FAILED'],
    ['NUL', txt([0]), 'SAMPLE_EXTRACT_FAILED'],
    ['binary control', txt([0x1b]), 'SAMPLE_EXTRACT_FAILED'],
  ])('rejects %s before any write', async (_name, file, code) => {
    expect(await extractSample(file)).toEqual({ ok: false, code });
    expect(localStorage.getItem(SAMPLES_KEY)).toBeNull();
  });

  it('reports a blocked file read without replacing the retained record or its bytes', async () => {
    localStorage.setItem(SAMPLES_KEY, retainedBytes);
    const file = txt('new sample', {
      arrayBuffer: async () => { throw new DOMException('File read blocked', 'NotReadableError'); },
    });
    expect(await extractSample(file)).toEqual({ ok: false, code: 'SAMPLE_EXTRACT_FAILED' });

    const { container } = openIntake();
    stage(file);
    fireEvent.click(extractButton());
    expect(await screen.findByRole('alert')).toHaveTextContent('The file could not be read as UTF-8 plain text.');
    expect(screen.queryByText('Synthetic sample saved on this browser.')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: retainedSample.name })).toBeVisible();
    expect(container.querySelector('pre').textContent).toBe(retainedSample.text);
    expect(listSamples()).toEqual({ ok: true, samples: [retainedSample] });
    expect(localStorage.getItem(SAMPLES_KEY)).toBe(retainedBytes);
  });

  it('accepts empty and exactly 64 KiB TXT and preserves Unicode, whitespace and BOM across reads', async () => {
    expect(await extractSample(txt(''))).toMatchObject({ ok: true, sample: { size: 0, text: '' } });
    expect(await extractSample(txt('a'.repeat(MAX_SAMPLE_BYTES), { type: 'text/plain' }))).toMatchObject({ ok: true, sample: { size: MAX_SAMPLE_BYTES } });
    const { sample } = await extractSample(txt(literal));
    const saved = saveSample([], sample);
    expect(saved.ok).toBe(true);
    expect(listSamples()).toEqual(saved);
    expect(saved.samples[0].text).toBe(literal);
    expect(removeSample(saved.samples, 'absent').removed).toBe(false);
    expect(removeSample(saved.samples, saved.samples[0].id)).toEqual({ ok: true, removed: true, samples: [] });
  });

  it('never evicts older samples at the cap or overwrites unreadable envelopes on entry', async () => {
    const { sample } = await extractSample(txt('Synthetic'));
    for (let index = 0; index < 10; index += 1) {
      expect(saveSample(listSamples().samples, sample).ok).toBe(true);
    }
    const full = localStorage.getItem(SAMPLES_KEY);
    expect(saveSample(listSamples().samples, sample)).toEqual({ ok: false, code: 'SAMPLE_LIMIT' });
    expect(localStorage.getItem(SAMPLES_KEY)).toBe(full);
    const unsupported = full.replace('"v":1', '"v":2');
    localStorage.setItem(SAMPLES_KEY, unsupported);
    openIntake();
    expect(screen.getByRole('alert')).toHaveTextContent('unreadable or from an unsupported version');
    expect(screen.queryByText('No retained samples yet.')).not.toBeInTheDocument();
    expect(localStorage.getItem(SAMPLES_KEY)).toBe(unsupported);
    localStorage.setItem(SAMPLES_KEY, full);
    fireEvent.click(screen.getByRole('button', { name: 'Retry Loading Samples' }));
    expect(screen.getAllByRole('button', { name: /Remove sample/ })).toHaveLength(10);
    expect(localStorage.getItem(SAMPLES_KEY)).toBe(full);
  });

  it.each([
    ['duplicate ID', { ...retainedSample, name: 'other.txt' }],
    ['negative size', { ...retainedSample, id: 'other', size: -1 }],
    ['oversized record', { ...retainedSample, id: 'other', size: MAX_SAMPLE_BYTES + 1 }],
    ['UTF-8 byte count mismatch', { ...retainedSample, id: 'other', size: 1, text: 'é' }],
    ['missing required text', { ...retainedSample, id: 'other', text: undefined }],
  ])('rejects the entire v1 envelope for %s without rewriting its bytes', (_reason, malformed) => {
    const raw = JSON.stringify({ v: 1, records: [retainedSample, malformed] }, null, 2);
    localStorage.setItem(SAMPLES_KEY, raw);

    expect(listSamples()).toEqual({ ok: false, code: 'STORE_VERSION_INVALID' });
    openIntake();
    expect(screen.getByRole('alert')).toHaveTextContent('Retained samples are unreadable or from an unsupported version.');
    expect(screen.queryByRole('list', { name: 'Retained samples' })).not.toBeInTheDocument();
    expect(screen.queryByText('No retained samples yet.')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry Loading Samples' }));
    expect(listSamples()).toEqual({ ok: false, code: 'STORE_VERSION_INVALID' });
    expect(localStorage.getItem(SAMPLES_KEY)).toBe(raw);
  });

  it('reports blocked sample storage reads and recovers the exact record on retry without writes', () => {
    localStorage.setItem(SAMPLES_KEY, retainedBytes);
    const getItem = Storage.prototype.getItem;
    const blocked = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function (key) {
      if (key === SAMPLES_KEY) throw new DOMException('Read blocked', 'SecurityError');
      return getItem.call(this, key);
    });

    expect(listSamples()).toEqual({ ok: false, code: 'STORAGE_UNAVAILABLE' });
    const { container } = openIntake();
    expect(screen.getByRole('alert')).toHaveTextContent('Retained samples could not be loaded. Enable browser storage and retry.');
    expect(screen.queryByText('No retained samples yet.')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Choose Synthetic File')).toBeDisabled();
    expect(getItem.call(localStorage, SAMPLES_KEY)).toBe(retainedBytes);

    blocked.mockRestore();
    fireEvent.click(screen.getByRole('button', { name: 'Retry Loading Samples' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: retainedSample.name })).toBeVisible();
    expect(container.querySelector('pre').textContent).toBe(retainedSample.text);
    expect(listSamples()).toEqual({ ok: true, samples: [retainedSample] });
    expect(localStorage.getItem(SAMPLES_KEY)).toBe(retainedBytes);
  });

  it('keeps the last successful sample and bytes when save or removal runs out of quota', async () => {
    const view = openIntake();
    stage(txt(literal));
    expect(localStorage.getItem(SAMPLES_KEY)).toBeNull();
    fireEvent.click(extractButton());
    expect(await screen.findByText('Synthetic sample saved on this browser.')).toBeVisible();
    const before = localStorage.getItem(SAMPLES_KEY);
    const original = Storage.prototype.setItem;
    const quota = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (key, value) {
      if (key === SAMPLES_KEY) throw new DOMException('Storage full', 'QuotaExceededError');
      original.call(this, key, value);
    });
    stage(txt('Another sample', { name: 'another.txt' }));
    fireEvent.click(extractButton());
    expect(await screen.findByRole('alert')).toHaveTextContent('Previously retained samples are unchanged.');
    expect(screen.queryByText('Another sample')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Remove sample/ }));
    expect(screen.getByRole('alert')).toHaveTextContent('Previously retained samples are unchanged.');
    expect(localStorage.getItem(SAMPLES_KEY)).toBe(before);
    expect(view.container.querySelector('pre').textContent).toBe(literal);
    expect(view.container.querySelector('pre b')).toBeNull();
    quota.mockRestore();
    view.unmount();
    expect(openIntake().container.querySelector('pre').textContent).toBe(literal);
  });

  it.each(['cancel', 'new selection', 'sign out', 'other tab'])(
    'discards a late file read after %s', async intent => {
      openIntake();
      let finish;
      stage(txt('abc', { arrayBuffer: () => new Promise(resolve => { finish = resolve; }) }));
      fireEvent.click(extractButton());
      expect(extractButton()).toBeDisabled();
      if (intent === 'cancel') fireEvent.click(screen.getByRole('button', { name: 'Cancel selection' }));
      if (intent === 'new selection') stage(txt('replacement'));
      if (intent === 'sign out') exitDemo();
      if (intent === 'other tab') {
        localStorage.removeItem(SESSION_KEY);
        act(() => window.dispatchEvent(new StorageEvent('storage', { key: SESSION_KEY, oldValue: marker, storageArea: localStorage })));
        expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
      }
      await act(async () => finish(new TextEncoder().encode('abc').buffer));
      expect(localStorage.getItem(SAMPLES_KEY)).toBeNull();
    },
  );
});
