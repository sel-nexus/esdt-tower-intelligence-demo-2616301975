/** Project portfolio signals and a single ordered tower cohort for local discovery. */
import outline from '../fixtures/us-outline.v1.json';
import { nextOperationalAction, QUEUES, selectQueue } from './actions.js';
import { listAlerts } from './alerts.js';
import { noteError } from './diagnostics.js';

export const HEALTH_BANDS = ['Good', 'Needs Attention', 'Critical', 'Unknown'];
export const READINESS_BANDS = ['Yes', 'Yes after an upgrade', 'Need More Information', 'No', 'Unknown'];
const unknown = 'Unknown';
const types = ['lattice', 'monopole', 'guyed', 'rooftop'];
const tenantRanges = ['0–1', '2–3', '4+', unknown];
const inspectionStates = ['Due', 'Not due', unknown];
const costStates = ['High cost', 'Within thresholds', unknown];
const opportunityStates = ['Eligible', 'Not eligible', unknown];

export const FACET_LABELS = {
  health: 'Health', type: 'Tower type', geography: 'Geography · state', tenants: 'Active tenant range',
  inspection: 'Inspection timing', readiness: 'Readiness', opportunity: 'Growth opportunity', cost: 'Operating or energy cost',
};

/** Identify the existing growth cohort without imposing a priority cutoff. */
const isOpportunity = answer => answer === 'Yes' || answer === 'Yes after an upgrade';

/** Trim the ends and compare case-insensitively, without treating input as markup. */
const normalize = text => typeof text === 'string' ? text.trim().toLowerCase() : '';

/** Compare only supported site identity and geography fields. */
export function matchesQuery(site, query) {
  const term = normalize(query);
  return !term || [site.siteId, site.city, site.state, site.type].some(value => normalize(value).includes(term));
}

/** Expose the accepted facet vocabulary for the current portfolio. */
export function facetOptions(snapshot) {
  return {
    health: HEALTH_BANDS,
    type: types,
    geography: [...new Set([...snapshot.sitesById.values()].map(site => site.state))].sort(),
    tenants: tenantRanges,
    inspection: inspectionStates,
    readiness: READINESS_BANDS,
    opportunity: opportunityStates,
    cost: costStates,
  };
}

/** Classify a tower without interpreting an unavailable numeric input as zero. */
function facts(site, assessment, config) {
  const { activeTenants = null, operatingCost = null, energyCost = null } = assessment?.commercial ?? {};
  const due = assessment?.inspection?.due;
  const readiness = assessment?.readiness?.answer ?? unknown;
  const cost = operatingCost > config.highOperatingCostCents || energyCost > config.highEnergyCostCents
    ? costStates[0] : operatingCost === null || energyCost === null ? unknown : costStates[1];
  return {
    health: assessment?.health?.band ?? unknown,
    readiness,
    opportunity: readiness === unknown || readiness === 'Need More Information' ? unknown
      : opportunityStates[isOpportunity(readiness) ? 0 : 1],
    type: site.type,
    geography: site.state,
    tenants: !Number.isInteger(activeTenants) || activeTenants < 0 ? unknown : tenantRanges[activeTenants >= 4 ? 2 : activeTenants >= 2 ? 1 : 0],
    inspection: due == null ? unknown : inspectionStates[due ? 0 : 1],
    cost,
  };
}

/** Keep only whitelisted values, so unknown dimension keys never become predicates. */
function acceptedFilters(snapshot, filters) {
  return Object.fromEntries(Object.entries(facetOptions(snapshot)).flatMap(([key, options]) => {
    const selected = Array.isArray(filters?.[key]) ? options.filter(value => filters[key].includes(value)) : [];
    return selected.length ? [[key, selected]] : [];
  }));
}

/** Test the shared discovery query and facet intersection. */
function matchesScope(site, categories, query, filters) {
  return matchesQuery(site, query) && Object.entries(filters).every(([key, values]) => values.includes(categories[key]));
}

/** Select the active portfolio cohort, excluding the map-only contributor signal. */
export function selectPortfolioScope(snapshot, index, { query, filters } = {}) {
  const accepted = acceptedFilters(snapshot, filters);
  return new Set([...snapshot.sitesById.values()]
    .filter(site => site.lifecycleStatus === 'active'
      && matchesScope(site, facts(site, index.get(site.siteId), snapshot.config), query, accepted))
    .map(site => site.siteId));
}

/** Bind a drill-in intent to the snapshot whose numbers the user saw. */
export function signalRef(snapshot, key) {
  const { scenarioId, settingsVersion, snapshotRevision } = snapshot;
  return { key, scenarioId, settingsVersion, snapshotRevision };
}

/** Check reference identity even if the underlying site IDs are unchanged. */
function currentSignal(snapshot, signal) {
  return signal && ['scenarioId', 'settingsVersion', 'snapshotRevision'].every(key => signal[key] === snapshot[key]);
}

/** Compute active-site measures and carry the exact membership behind each tile. */
export function selectKpis(snapshot, index, alerts, activeIds = selectPortfolioScope(snapshot, index)) {
  const ids = [...activeIds];
  const tiles = {};
  /** Publish a number and its contributor IDs together, preserving unavailable membership. */
  function add(key, label, value, siteIds, coverage) {
    tiles[key] = { label, value, siteIds, coverage, ref: signalRef(snapshot, key) };
  }
  /** Sum known values only if every member supplied the required input. */
  function additive(key) {
    const known = ids.map(id => index.get(id)?.commercial?.[key]).filter(Number.isSafeInteger);
    const total = known.reduce((sum, value) => sum + value, 0);
    return { value: known.length === ids.length && Number.isSafeInteger(total) ? total : null, coverage: { known: known.length, total: ids.length } };
  }
  const tenants = additive('activeTenants');
  const revenue = additive('revenue');
  const members = (group, value) => ids.filter(id => (group(index.get(id)) ?? unknown) === value);
  const health = band => members(assessment => assessment?.health?.band, band);
  const readiness = answer => members(assessment => assessment?.readiness?.answer, answer);
  const good = health('Good');
  const knownHealth = ids.length - health(unknown).length;
  const healthComplete = ids.length > 0 && knownHealth === ids.length;
  const growth = ids.filter(id => isOpportunity(index.get(id)?.readiness?.answer));
  const critical = health('Critical');
  const open = alerts.filter(alert => alert.status === 'Open' && activeIds.has(alert.siteId));
  const openIds = new Set(open.map(alert => alert.siteId));
  add('towers', 'Active towers', ids.length, ids);
  add('tenants', 'Active tenants', tenants.value, tenants.value === null ? null : ids, tenants.coverage);
  add('average', 'Average tenancy', tenants.value === null || !ids.length ? null : tenants.value / ids.length, tenants.value === null || !ids.length ? null : ids, tenants.coverage);
  add('revenue', 'Indicative annual revenue', revenue.value, revenue.value === null ? null : ids, revenue.coverage);
  add('healthy', 'Healthy sites', healthComplete ? 100 * good.length / ids.length : null,
    healthComplete ? good : null, { known: knownHealth, total: ids.length });
  add('critical', 'Critical sites', critical.length, critical);
  add('opportunities', 'Growth opportunities', growth.length, growth);
  add('alerts', 'Open alerts', open.length, ids.filter(id => openIds.has(id)));
  for (const [group, values, lookup] of [['health', HEALTH_BANDS, health], ['readiness', READINESS_BANDS, readiness]]) {
    for (const value of values) {
      const siteIds = lookup(value);
      add(`${group}:${value}`, value, siteIds.length, siteIds);
    }
  }
  return tiles;
}

/** Use the queue orders, deduplicating eligible sites before taking at most five. */
export function selectShortlists(snapshot, index, actions, active = selectPortfolioScope(snapshot, index)) {
  // Focused operational queues live in Actions without duplicating the portfolio shortlists.
  return QUEUES.filter(view => view !== 'Missing Information' && view !== 'Power Upgrades').map(view => {
    const isGrowth = view === 'Growth Opportunities' || view === 'Upgrade Required';
    const rows = selectQueue(actions, view).filter(action => active.has(action.siteId)
      && (view !== 'Critical Sites' || action === nextOperationalAction(actions, action.siteId)));
    const rankable = new Map();
    for (const row of rows) {
      if ((!isGrowth || Number.isFinite(row.priority)) && !rankable.has(row.siteId)) rankable.set(row.siteId, row);
    }
    const incomplete = isGrowth && (rows.some(row => !rankable.has(row.siteId)) || [...active].some(id => {
      const answer = index.get(id)?.readiness?.answer;
      return !answer || answer === unknown || answer === 'Need More Information'
        || ((answer === 'Yes after an upgrade' || (view === 'Growth Opportunities' && answer === 'Yes')) && !rankable.has(id));
    }));
    return { view, incomplete, entries: [...rankable.values()].slice(0, 5) };
  });
}

/** Format known mounting usage without inventing a ratio for invalid observations. */
export function formatUtilization({ occupiedMounts: used, totalMounts: total } = {}) {
  return !Number.isInteger(used) || !Number.isInteger(total) || used < 0 || total <= 0 || used > total
    ? unknown : `${used}/${total} (${Math.round(100 * used / total)}%)`;
}

/** Validate the versioned schematic and expose one projection for outline and sites. */
export function createMapProjection(geometry) {
  if (geometry?.version !== 1 || !Array.isArray(geometry.bounds) || geometry.bounds.length !== 4) return null;
  const [west, south, east, north] = geometry.bounds;
  if (!geometry.bounds.every(Number.isFinite) || west < -180 || east > 180 || south < -90 || north > 90 || west >= east || south >= north) return null;
  /** Place finite coordinates inside the schematic extent, never at a fake origin. */
  function point(lon, lat) {
    if (!Number.isFinite(lon) || !Number.isFinite(lat) || lon < west || lon > east || lat < south || lat > north) return null;
    return { x: (lon - west) * 620 / (east - west), y: (north - lat) * 360 / (north - south) };
  }
  if (!Array.isArray(geometry.ring) || geometry.ring.length < 4) return null;
  const points = geometry.ring.map(pair => Array.isArray(pair) && pair.length === 2 ? point(...pair) : null);
  const first = points[0];
  const last = points.at(-1);
  if (points.some(value => !value) || first.x !== last.x || first.y !== last.y) return null;
  const area = points.slice(1).reduce((sum, p, i) => sum + points[i].x * p.y - p.x * points[i].y, 0);
  return area ? { point, polygon: points.map(({ x, y }) => `${x},${y}`).join(' ') } : null;
}

/** Derive map and list from the same ordered result, dropping only unplottable markers. */
export function selectDiscovery(snapshot, index, intent, actions, tiles, geometry = outline) {
  if (!snapshot) return { ok: false, code: 'INVALID_FIXTURE' };
  const { query, signal, selectedSiteId } = intent;
  const filters = acceptedFilters(snapshot, intent.filters);
  const activeSignal = currentSignal(snapshot, signal) && Object.hasOwn(tiles, signal.key) ? tiles[signal.key] : null;
  const signalIds = activeSignal ? new Set(activeSignal.siteIds ?? []) : null;
  const projection = createMapProjection(geometry);
  const sites = [...snapshot.sitesById.values()].sort((a, b) => a.siteId.localeCompare(b.siteId));
  const searchIds = normalize(query) ? sites.filter(site => matchesQuery(site, query)).map(site => site.siteId) : [];
  const rows = sites.flatMap(site => {
    const { siteId, market } = site;
    const assessment = index.get(siteId);
    const categories = facts(site, assessment, snapshot.config);
    if ((signalIds && !signalIds.has(siteId)) || !matchesScope(site, categories, query, filters)) return [];
    return [{ siteId, market, city: site.city, state: site.state, health: categories.health,
      activeTenants: assessment?.commercial.activeTenants ?? null, utilization: formatUtilization(assessment?.commercial),
      nextStep: nextOperationalAction(actions, siteId)?.nextStep ?? assessment?.recommendation ?? unknown,
      point: projection?.point(site.longitude?.value, site.latitude?.value) ?? null }];
  });
  const siteIds = rows.map(row => row.siteId);
  return { ok: true, rows, siteIds, searchIds, signal: activeSignal,
    polygon: projection?.polygon ?? null, markerIds: rows.filter(row => row.point).map(row => row.siteId),
    selectedSiteId: siteIds.includes(selectedSiteId) ? selectedSiteId : null };
}

/** Route discovery-only commands and reconcile selection after any committed changes.
 *
 * Args:
 *   reduce: Existing portfolio reducer that owns decisions and workflow.
 *   state: Current committed portfolio and discovery intent.
 *   command: Ordered tab-local user intent.
 * Returns:
 *   One atomic state, without recomputing assessments for discovery changes.
 */
export function reduceDiscovery(reduce, state, command) {
  const discoveryKinds = ['query', 'facet', 'setFacet', 'signal', 'clearDiscovery', 'selectTower'];
  let next;
  if (!discoveryKinds.includes(command?.kind)) {
    next = reduce(state, command);
  } else {
    if (!Number.isSafeInteger(command.commandId) || command.commandId <= state.lastCommandId) return state;
    const { snapshot, discovery } = state;
    next = { ...state, lastCommandId: command.commandId, lastCommandKind: command.kind, result: { ok: true } };
    /** Record a safe failure code without replacing committed intent. */
    const reject = code => ({ ...next, audit: noteError(state.audit, code), result: { ok: false, code } });
    if (!snapshot) return reject('INVALID_FIXTURE');
    const pending = { ...discovery, notice: null };
    switch (command.kind) {
      case 'query':
        if (typeof command.query !== 'string') return reject('INVALID_QUERY');
        pending.query = command.query;
        break;
      case 'facet':
      case 'setFacet': {
        const options = facetOptions(snapshot);
        const { key, value } = command;
        const replace = command.kind === 'setFacet';
        if (!Object.hasOwn(options, key) || !(options[key].includes(value) || (replace && value === ''))) return reject('INVALID_FILTER');
        const current = discovery.filters[key] ?? [];
        const values = replace ? (value ? [value] : []) : current.includes(value) ? current.filter(item => item !== value) : [...current, value];
        pending.filters = { ...discovery.filters, [key]: values };
        if (!pending.filters[key].length) delete pending.filters[key];
        break;
      }
      case 'signal': {
        if (command.ref !== null) {
          if (!currentSignal(snapshot, command.ref)) return reject('STALE_VIEW');
          const tiles = selectKpis(snapshot, state.assessments, listAlerts(snapshot, state.workflow.alerts),
            selectPortfolioScope(snapshot, state.assessments, discovery));
          if (!Object.hasOwn(tiles, command.ref.key) || tiles[command.ref.key].siteIds === null) return reject('SIGNAL_UNAVAILABLE');
          pending.signal = tiles[command.ref.key].ref;
        } else pending.signal = null;
        break;
      }
      case 'clearDiscovery':
        Object.assign(pending, { query: '', filters: {}, signal: null, selectedSiteId: null });
        break;
      case 'selectTower':
        if (!snapshot.sitesById.has(command.siteId)) return reject('SITE_NOT_FOUND');
        pending.selectedSiteId = command.siteId;
        break;
      default:
        break;
    }
    next.discovery = pending;
  }
  if (next === state || !next.snapshot || !next.result?.ok) return next;
  let { discovery } = next;
  const { snapshot, assessments } = next;
  if (discovery.signal && !currentSignal(snapshot, discovery.signal)) {
    discovery = { ...discovery, signal: null, notice: 'The portfolio changed. Choose a current signal to drill in again.' };
  }
  if (discovery.selectedSiteId) {
    const site = snapshot.sitesById.get(discovery.selectedSiteId);
    const tiles = discovery.signal && selectKpis(snapshot, assessments, listAlerts(snapshot, next.workflow.alerts),
      selectPortfolioScope(snapshot, assessments, discovery));
    const category = site && facts(site, assessments.get(site.siteId), snapshot.config);
    if (!site || !matchesScope(site, category, discovery.query, acceptedFilters(snapshot, discovery.filters))
      || (tiles && !tiles[discovery.signal.key]?.siteIds?.includes(site.siteId))) {
      discovery = { ...discovery, selectedSiteId: null,
        notice: !site ? 'The selected tower is no longer in this scenario.' : discovery.notice };
    }
  }
  return discovery === next.discovery ? next : { ...next, discovery };
}
