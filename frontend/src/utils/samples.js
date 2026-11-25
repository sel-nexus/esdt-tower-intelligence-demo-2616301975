/** Validate and retain bounded synthetic text independently of workshop decisions. */
export const SAMPLES_KEY = 'esdt.demo.samples.v1';
export const SAMPLE_LIMIT = 10;
export const MAX_SAMPLE_BYTES = 64 * 1024;
const controls = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/u;

/**
 * Validate selection metadata without reading bytes.
 * Args:
 *   file: Metadata from a staged file or retained record.
 * Returns:
 *   A safe validation code, or null for supported metadata.
 */
function metadataError(file) {
  if (!file || typeof file.name !== 'string' || file.name.length > 255 || !/\.txt$/i.test(file.name)
    || (file.type !== 'text/plain' && file.type !== '')
    || !Number.isSafeInteger(file.lastModified) || file.lastModified < 0
    || !Number.isSafeInteger(file.size) || file.size < 0) return 'SAMPLE_UNSUPPORTED';
  return file.size > MAX_SAMPLE_BYTES ? 'SAMPLE_TOO_LARGE' : null;
}

/**
 * Validate all retained records as a single envelope, including exact UTF-8 byte size.
 * Args:
 *   records: Candidate retained records.
 * Returns:
 *   Whether all records can be displayed and updated without partial recovery.
 */
function validRecords(records) {
  if (!Array.isArray(records) || records.length > SAMPLE_LIMIT) return false;
  const ids = new Set();
  const encoder = new TextEncoder();
  return records.every(record => {
    if (metadataError(record) || Object.keys(record).length !== 6
      || typeof record.id !== 'string' || !record.id.trim() || ids.has(record.id)
      || typeof record.text !== 'string' || record.text.length > MAX_SAMPLE_BYTES
      || controls.test(record.text) || /[\uD800-\uDFFF]/u.test(record.text)
      || encoder.encode(record.text).byteLength !== record.size) return false;
    ids.add(record.id);
    return true;
  });
}

/**
 * Read the sample envelope without writes or re-extraction.
 * Args:
 *   storage: Optional browser-compatible storage for this operation.
 * Returns:
 *   An empty or valid list, or a safe error distinguishing unreadable storage.
 */
export function listSamples(storage) {
  let raw;
  try {
    raw = (storage ?? window.localStorage).getItem(SAMPLES_KEY);
  } catch {
    return { ok: false, code: 'STORAGE_UNAVAILABLE' };
  }
  if (raw === null) return { ok: true, samples: [] };
  try {
    const value = JSON.parse(raw);
    if (value?.v === 1 && Object.keys(value).length === 2 && validRecords(value.records)) {
      return { ok: true, samples: value.records };
    }
  } catch {
    return { ok: false, code: 'STORE_VERSION_INVALID' };
  }
  return { ok: false, code: 'STORE_VERSION_INVALID' };
}

/**
 * Read one staged file as exact UTF-8 text without mutating storage.
 * Args:
 *   file: Staged browser file.
 * Returns:
 *   Validated metadata and text, or a safe error code with no file content.
 */
export async function extractSample(file) {
  const code = metadataError(file);
  if (code) return { ok: false, code };
  const { name, type, size, lastModified } = file;
  try {
    const buffer = await file.arrayBuffer();
    if (buffer.byteLength > MAX_SAMPLE_BYTES) return { ok: false, code: 'SAMPLE_TOO_LARGE' };
    if (buffer.byteLength !== size) return { ok: false, code: 'SAMPLE_EXTRACT_FAILED' };
    const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(buffer);
    if (controls.test(text)) return { ok: false, code: 'SAMPLE_EXTRACT_FAILED' };
    return { ok: true, sample: { name, type, size, lastModified, text } };
  } catch {
    return { ok: false, code: 'SAMPLE_EXTRACT_FAILED' };
  }
}

/**
 * Replace the complete retained envelope and publish only a successful write.
 * Args:
 *   records: Next list from the single-tab intake controller.
 *   storage: Optional browser-compatible storage for this operation.
 * Returns:
 *   The newly stored list or a safe error without a replacement list.
 */
function writeSamples(records, storage) {
  if (!validRecords(records)) return { ok: false, code: 'SAMPLE_STORE_FAILED' };
  try {
    (storage ?? window.localStorage).setItem(SAMPLES_KEY, JSON.stringify({ v: 1, records }));
    return { ok: true, samples: records };
  } catch {
    return { ok: false, code: 'SAMPLE_STORE_FAILED' };
  }
}

/**
 * Retain an extraction in the last valid list without evicting older samples.
 * Args:
 *   records: Last valid list, managed in a single tab.
 *   sample: Newly validated metadata and text.
 *   storage: Optional browser-compatible storage for this operation.
 * Returns:
 *   The committed list or an error; leaves the old list and bytes intact on failure.
 */
export function saveSample(records, sample, storage) {
  if (records.length >= SAMPLE_LIMIT) return { ok: false, code: 'SAMPLE_LIMIT' };
  try {
    const id = Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('');
    return writeSamples([...records, { ...sample, id }], storage);
  } catch {
    return { ok: false, code: 'SAMPLE_STORE_FAILED' };
  }
}

/**
 * Remove one known sample without touching either session key.
 * Args:
 *   records: Last valid list, managed in a single tab.
 *   id: Stable identifier of the selected sample.
 *   storage: Optional browser-compatible storage for this operation.
 * Returns:
 *   The current list if already absent, the committed new list, or a safe error.
 */
export function removeSample(records, id, storage) {
  const retained = records.filter(record => record.id !== id);
  if (retained.length === records.length) return { ok: true, removed: false, samples: records };
  const result = writeSamples(retained, storage);
  return result.ok ? { ...result, removed: true } : result;
}
