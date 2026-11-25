/** Own the tab-local portfolio state and issue ordered control intents. */
import PropTypes from 'prop-types';
import { createContext, useCallback, useContext, useMemo, useReducer, useRef } from 'react';
import { loadBaseline } from '../utils/fixtures.js';
import { createPortfolioState, reduce } from '../utils/portfolioReducer.js';
import { summarizeBaseline } from '../utils/scenario.js';

const PortfolioContext = createContext(null);

/** Load the baseline and expose a single committed snapshot to workshop views. */
export function PortfolioProvider({ children, fixtureResult }) {
  const [state, dispatch] = useReducer(reduce, fixtureResult, result => createPortfolioState(result ?? loadBaseline()));
  const commandId = useRef(0);
  const send = useCallback(command => dispatch({ ...command, commandId: ++commandId.current }), []);
  const summary = useMemo(() => state.snapshot && summarizeBaseline(state.snapshot), [state.snapshot]);
  const value = useMemo(() => ({ state, snapshot: state.snapshot, summary, send }), [state, summary, send]);

  return <PortfolioContext.Provider value={value}>{children}</PortfolioContext.Provider>;
}

PortfolioProvider.propTypes = { children: PropTypes.node.isRequired, fixtureResult: PropTypes.object };

/** Read the active provider rather than creating an independent state store. */
export function usePortfolio() {
  const value = useContext(PortfolioContext);
  if (!value) throw new Error('PortfolioProvider is required.');
  return value;
}
