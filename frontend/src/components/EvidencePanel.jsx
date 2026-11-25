/** Show why a synthetic source supports an assessment input or remains a gap. */
import PropTypes from 'prop-types';

const domains = [
  ['ESDT-Aligned', 'Technical provenance for site condition, capacity, and validation.'],
  ['Tower Owner', 'Owner-managed records, including tenancy and commercial inputs.'],
  [null, 'No source could be resolved for these inputs.'],
];

/** Group source context and evidence limitations by domain without suggesting live integration. */
export function EvidencePanel({ evidence }) {
  const requiredGaps = evidence.filter(item => item.materiality === 'required' && item.flags.length).length;
  return (
    <details className="rounded-lg border border-border bg-surface px-5 py-3 sm:px-7">
      <summary className="min-h-11 cursor-pointer py-2 font-semibold focus-visible:outline-ring">
        <span className="decision-evidence-summary">
          <span>Evidence and sources</span>
          <span className="text-sm font-normal text-foreground-muted">
            {requiredGaps} required {requiredGaps === 1 ? 'input needs' : 'inputs need'} review
          </span>
        </span>
      </summary>
      <p className="mb-4 text-sm text-foreground-muted">Representative systems only. No live integration. An updated record can still describe a stale observation.</p>
      {!evidence.length && <p className="pb-3 text-sm">No source records are available for this assessment.</p>}
      {domains.map(([domain, description]) => {
        const entries = evidence.filter(item => item.domain === domain);
        const needsReview = entries.filter(item => item.flags.length && item.materiality === 'required');
        const otherEntries = entries.filter(item => !needsReview.includes(item));
        return entries.length > 0 && (
          <section key={domain ?? 'unknown'} className="mt-4">
            <h3 className="decision-title font-semibold">{domain ?? 'Source unavailable'}</h3>
            <p className="mb-2 text-sm text-foreground-muted">{description}</p>
            <ul className="divide-y divide-border border-t border-border">
              {[...needsReview, ...otherEntries].map(item => (
                <li key={`${item.attribute}:${item.evidenceId}`} className="decision-grid break-words py-3 text-sm">
                  <div>
                    <p className="font-semibold">{item.label ?? item.attribute}</p>
                    <p className="text-foreground-muted">
                      {item.label ? `${item.attribute} · ` : ''}{item.component ? `${item.component} · ` : ''}{item.materiality}
                    </p>
                    <p className={item.flags.length ? 'mt-1 font-semibold' : 'mt-1 text-foreground-muted'}>
                      {item.flags.length ? item.flags.join(' · ') : 'Current'}{item.missingReason ? ` · ${item.missingReason.replaceAll('-', ' ')}` : ''}
                    </p>
                  </div>
                  <div>
                    <p>{item.sourceSystem ?? 'Unknown source'}{item.synthetic ? ' · Synthetic' : ''}</p>
                    <p className="text-foreground-muted">Observed: {item.asOf ?? 'Unknown'} · Updated: {item.updatedAt ?? 'Unknown'}</p>
                    <p className="text-foreground-muted">Completeness: {item.completeness} · Confidence: {item.confidence == null ? 'Unknown' : `${item.confidence}%`}</p>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </details>
  );
}

EvidencePanel.propTypes = {
  evidence: PropTypes.arrayOf(PropTypes.shape({
    evidenceId: PropTypes.string, attribute: PropTypes.string.isRequired, component: PropTypes.string, label: PropTypes.string,
    materiality: PropTypes.string.isRequired, sourceSystem: PropTypes.string, domain: PropTypes.string,
    synthetic: PropTypes.bool, asOf: PropTypes.string, updatedAt: PropTypes.string,
    completeness: PropTypes.string.isRequired, confidence: PropTypes.number,
    flags: PropTypes.arrayOf(PropTypes.string).isRequired, missingReason: PropTypes.string,
  }).isRequired).isRequired,
};
