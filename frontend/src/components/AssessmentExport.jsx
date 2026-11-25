/** Present an explicitly captured assessment and reuse its exact text for download. */
import PropTypes from 'prop-types';
import { useRef, useState } from 'react';
import { usePortfolio } from './PortfolioProvider.jsx';

const button = 'min-h-11 rounded-md border border-border px-4 text-sm font-semibold hover:bg-surface-raised focus-visible:outline-ring';

/** Keep the single committed capture distinct from the tower's current decision. */
export function AssessmentExport({ assessmentRef }) {
  const { state, send, downloadExport } = usePortfolio();
  const preview = state.preview?.record.towerId === assessmentRef.siteId ? state.preview : null;
  const [hiddenId, setHiddenId] = useState(null);
  const [downloadResult, setDownloadResult] = useState(null);
  const previewButton = useRef(null);
  const generationId = useRef(null);
  const failed = state.lastCommandId === generationId.current && state.result?.ok === false;
  return (
    <section className="rounded-lg border border-border bg-surface p-5 sm:p-7" aria-labelledby="assessment-export">
      <h2 id="assessment-export" className="text-xl font-semibold">Assessment export</h2>
      <p className="mt-2 text-sm text-foreground-muted">Capture this synthetic assessment as a plain-text snapshot. Nothing is uploaded.</p>
      <button ref={previewButton} type="button" className={`${button} mt-4`} onClick={() => {
        setDownloadResult(null);
        generationId.current = send({ kind: 'exportAssessment', ref: assessmentRef });
      }}>Generate export preview</button>
      {failed && <p role="alert" className="mt-3 text-sm text-error">Preview was not generated. Reopen this assessment and try again.</p>}
      {preview && preview.id !== hiddenId && (
        <div className="mt-4 border-t border-border pt-4">
          <h3 className="font-semibold">Export preview</h3>
          <p className="mt-2 break-all text-sm text-foreground-muted">{preview.record.filename} · captured revision {preview.record.ref.snapshotRevision}</p>
          <pre aria-label="Captured assessment text" tabIndex={0} className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-md border border-border bg-background p-4 text-sm focus-visible:outline-ring">{preview.text}</pre>
          <div className="mt-4 flex flex-wrap gap-3">
            <button type="button" className={button} onClick={() => setDownloadResult(downloadExport(preview.id))}>Download TXT</button>
            <button type="button" className={button} onClick={() => {
              setHiddenId(preview.id);
              setDownloadResult(null);
              previewButton.current?.focus();
            }}>Close preview</button>
          </div>
          <p role="status" className="mt-2 text-sm text-foreground-muted">
            {downloadResult?.ok ? 'TXT download initiated.' : 'Preview is ready to download.'}
          </p>
          {downloadResult?.ok === false && <p role="alert" className="mt-2 text-sm text-error">Download did not start. Generate a new preview and try again.</p>}
        </div>
      )}
    </section>
  );
}

AssessmentExport.propTypes = { assessmentRef: PropTypes.object.isRequired };
