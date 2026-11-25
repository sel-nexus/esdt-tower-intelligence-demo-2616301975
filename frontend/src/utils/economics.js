/** Project indicative commercial values without replacing missing observations with zero. */
import { freezeRecord, readAttribute } from './fixtures.js';
import { resolveEvidence } from './health.js';

const moneyKeys = ['revenue', 'operatingCost', 'energyCost', 'upgradeCost', 'annualUpside'];
const paths = ['tenants', 'mounting.occupied', 'mounting.free', ...moneyKeys.map(key => `commercial.${key}`)];
const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 2 });

/** Keep the raw payback ratio separate from its eventual display precision. */
function payback(cost, upside) {
  if (cost === null || upside === null) return { paybackYears: null, paybackStatus: 'unknown', paybackReason: 'Investment and annual upside both need current evidence.' };
  if (upside <= 0) return { paybackYears: null, paybackStatus: 'not-applicable', paybackReason: 'Annual upside is not positive.' };
  if (cost === 0) return { paybackYears: null, paybackStatus: 'not-applicable', paybackReason: 'No investment is indicated.' };
  return { paybackYears: cost / upside, paybackStatus: 'known', paybackReason: null };
}

/** Derive occupancy, money and payback using evidence from the active scenario.
 * @param {object} site Site record whose values are still in USD cents.
 * @param {object} snapshot Committed date and evidence context for that site.
 * @returns {object} Raw cents, raw utilization and payback, and commercial provenance.
 */
export function computeEconomics(site, snapshot) {
  const facts = Object.fromEntries(paths.map(path => [path, resolveEvidence(snapshot, readAttribute(site, path), path)]));
  /** Accept a lease, capacity or money observation only when its source is usable. */
  const known = path => facts[path].usable ? facts[path].value : null;
  const occupied = known('mounting.occupied');
  const free = known('mounting.free');
  const money = Object.fromEntries(moneyKeys.map(key => [key, known(`commercial.${key}`)]));
  const mounts = occupied === null || free === null ? null : occupied + free;
  const evidence = Object.values(facts).map(row => ({ ...row, value: row.attribute === 'tenants' ? row.value?.length ?? null : row.value }));
  return freezeRecord({
    activeTenants: known('tenants')?.filter(tenant => tenant.leaseStatus === 'active').length ?? null,
    occupiedMounts: occupied, totalMounts: mounts,
    utilization: mounts > 0 ? occupied / mounts : null,
    ...money, ...payback(money.upgradeCost, money.annualUpside),
    evidence, gaps: evidence.filter(row => !row.usable),
  });
}

/** Format integer cents for display, preserving the difference between Unknown and zero. */
export function formatIllustrativeUsd(cents) {
  if (cents == null) return 'Unknown';
  const absolute = BigInt(Math.abs(cents));
  const dollars = absolute / 100n;
  const centsPart = String(absolute % 100n).padStart(2, '0');
  return `${cents < 0 ? '-' : ''}${usd.format(dollars)}${centsPart === '00' ? '' : `.${centsPart}`}`;
}
