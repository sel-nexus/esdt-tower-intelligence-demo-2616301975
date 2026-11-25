/** Show why a synthetic source supports an assessment input or remains a gap. */
import PropTypes from 'prop-types';

/** Group source context and evidence limitations by domain without suggesting live integration. */
export function EvidencePanel({ evidence }) {
  return (
    <details className="rounded-lg border border-border bg-surface p-5">
      <summary className="min-h-11 cursor-pointer py-2 font-semibold focus-visible:outline-ring">Evidence and sources</summary>
      <p className="mb-4 text-sm text-foreground-muted">Representative systems only. No live integration.</p>
      {['ESDT-Aligned', 'Tower Owner', null].map(domain => {
        const entries = evidence.filter(item => item.domain === domain);
        return entries.length > 0 && (
          <section key={domain ?? 'unknown'} className="mt-4">
            <h3 className="text-sm font-semibold">{domain ?? 'Source unavailable'}</h3>
            <ul className="mt-2 divide-y divide-border border-t border-border">
              {entries.map(item => (
                <li key={`${item.attribute}:${item.evidenceId}`} className="break-words py-3 text-sm">
                  <p className="font-medium">
                    {item.attribute}{item.component ? ` · ${item.component}` : ''} · {item.materiality}
                  </p>
                  <p>{item.sourceSystem ?? 'Unknown'}{item.synthetic ? ' · Synthetic' : ''}</p>
                  <p className="text-foreground-muted">Observed: {item.asOf ?? 'Unknown'} · Updated: {item.updatedAt ?? 'Unknown'}</p>
                  <p className="text-foreground-muted">Completeness: {item.completeness} · Confidence: {item.confidence == null ? 'Unknown' : `${item.confidence}%`}</p>
                  <p>{item.flags.length ? item.flags.join(' · ') : 'Current'}{item.missingReason ? ` · ${item.missingReason.replaceAll('-', ' ')}` : ''}</p>
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
    evidenceId: PropTypes.string, attribute: PropTypes.string.isRequired, component: PropTypes.string,
    materiality: PropTypes.string.isRequired, sourceSystem: PropTypes.string, domain: PropTypes.string,
    synthetic: PropTypes.bool, asOf: PropTypes.string, updatedAt: PropTypes.string,
    completeness: PropTypes.string.isRequired, confidence: PropTypes.number,
    flags: PropTypes.arrayOf(PropTypes.string).isRequired, missingReason: PropTypes.string,
  }).isRequired).isRequired,
};
