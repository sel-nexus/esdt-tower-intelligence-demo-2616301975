/** Own the tab-local portfolio state and issue ordered control intents. */
import PropTypes from 'prop-types';
import { createContext, useCallback, useContext, useMemo, useReducer, useRef } from 'react';
import { loadBaseline } from '../utils/fixtures.js';
import { rankActions } from '../utils/actions.js';
import { listAlerts } from '../utils/alerts.js';
import { inspectDiagnostics } from '../utils/diagnostics.js';
import { reduceDiscovery, selectDiscovery, selectKpis, selectShortlists } from '../utils/discover.js';
import { downloadText } from '../utils/export.js';
import { createPortfolioState, reduce } from '../utils/portfolioReducer.js';
import { summarizeBaseline } from '../utils/scenario.js';

const PortfolioContext = createContext(null);

/** Commit discovery and decision intents through the same ordered reducer. */
const workshopReducer = (state, command) => reduceDiscovery(reduce, state, command);

/** Read wall-clock time outside the reducer. */
const nowUtc = () => new Date().toISOString();

/** Load the baseline and expose a single committed snapshot to workshop views. */
export function PortfolioProvider({ children, fixtureResult, now = nowUtc, download = downloadText }) {
  const [state, dispatch] = useReducer(workshopReducer, fixtureResult, result => createPortfolioState(result ?? loadBaseline()));
  const commandId = useRef(0);
  const send = useCallback(command => {
    const id = ++commandId.current;
    dispatch({ ...command, commandId: id, timestamp: now() });
    return id;
  }, [now]);
  /** Initiate an explicit local download only from a currently committed capture. */
  const downloadExport = useCallback(previewId => {
    const preview = state.preview;
    if (commandId.current !== state.lastCommandId || !preview || preview.id !== previewId) {
      // A newer intent may have replaced the capture; never initiate a stale download.
      return { ok: false, code: 'STALE_VIEW' };
    }
    const id = ++commandId.current;
    const timestamp = now();
    const result = download(preview.text, preview.record.filename);
    if (commandId.current === id) dispatch({ kind: 'downloadExport', previewId, initiated: result.ok, commandId: id, timestamp });
    return result;
  }, [state.preview, state.lastCommandId, now, download]);
  const summary = useMemo(() => state.snapshot && summarizeBaseline(state.snapshot), [state.snapshot]);
  const { assessments } = state;
  const alerts = useMemo(() => listAlerts(state.snapshot, state.workflow.alerts), [state.snapshot, state.workflow.alerts]);
  const actions = useMemo(() => rankActions(state.snapshot, assessments, state.workflow), [state.snapshot, assessments, state.workflow]);
  const diagnostics = useMemo(() => inspectDiagnostics(state.snapshot, state.audit), [state.snapshot, state.audit]);
  const { snapshot } = state;
  const kpis = useMemo(() => snapshot ? selectKpis(snapshot, assessments, alerts) : null, [snapshot, assessments, alerts]);
  const shortlists = useMemo(() => snapshot ? selectShortlists(snapshot, assessments, actions) : [], [snapshot, assessments, actions]);
  const discovery = useMemo(() => selectDiscovery(snapshot, assessments, state.discovery, actions, kpis),
    [snapshot, assessments, state.discovery, actions, kpis]);
  const value = useMemo(() => ({ state, snapshot, summary, assessments, alerts, actions, diagnostics, send, downloadExport, kpis, shortlists, discovery }),
    [state, snapshot, summary, assessments, alerts, actions, diagnostics, send, downloadExport, kpis, shortlists, discovery]);

  return <PortfolioContext.Provider value={value}>{children}</PortfolioContext.Provider>;
}

PortfolioProvider.propTypes = { children: PropTypes.node.isRequired, fixtureResult: PropTypes.object, now: PropTypes.func, download: PropTypes.func };

/** Read the active provider rather than creating an independent state store. */
export function usePortfolio() {
  const value = useContext(PortfolioContext);
  if (!value) throw new Error('PortfolioProvider is required.');
  return value;
}
