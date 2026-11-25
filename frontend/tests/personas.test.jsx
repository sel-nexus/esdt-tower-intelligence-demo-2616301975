// @vitest-environment jsdom
/** Exercise the actual workshop shell and its browser-local role persistence. */
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from '../src/App.jsx';
import { SESSION_KEY } from '../src/utils/session.js';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  localStorage.clear();
  window.history.replaceState(null, '', '/');
});

/** Choose a second perspective using the active role's disclosure. */
function switchRole(name) {
  fireEvent.click(screen.getByText('Demo role', { exact: true }).closest('summary'));
  fireEvent.click(screen.getByRole('button', { name, exact: true }));
}

describe('workshop personas', () => {
  it.each([
    ['Portfolio Manager', 'portfolio', '#/portfolio', 'Portfolio scenario'],
    ['Asset Manager', 'asset', '#/assessments', 'Assessments'],
    ['Colocation / Commercial Manager', 'commercial', '#/actions/growth', 'Actions', 'Growth Opportunities'],
    ['Operations Manager', 'operations', '#/actions/critical', 'Actions', 'Critical Sites'],
    ['Demonstration Facilitator', 'facilitator', '#/portfolio', 'Portfolio scenario'],
  ])('opens the relevant start with one selection as %s', (name, id, hash, heading, queue) => {
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Choose a demo role' })).toHaveFocus();
    expect(within(screen.getByRole('list', { name: 'Demo roles' })).getAllByRole('button')).toHaveLength(5);
    fireEvent.click(screen.getByRole('button', { name, exact: true }));
    expect(window.location.hash).toBe(hash);
    expect(screen.getByRole('heading', { level: 1, name: heading })).toHaveFocus();
    expect(screen.getByText('Demo role', { exact: true }).closest('summary')).toHaveTextContent(name);
    expect(JSON.parse(localStorage.getItem(SESSION_KEY))).toEqual({ v: 2, persona: id });
    if (queue) expect(screen.getByLabelText('Action queue')).toHaveValue(queue);
    if (id === 'asset') expect(screen.getByRole('link', { name: /NYC-10234/ })).toBeVisible();
    if (id === 'facilitator') expect(screen.getByRole('region', { name: 'Facilitator controls' })).toBeVisible();
  });

  it('preserves the active scenario, an applied override, discovery state and workflow across switches', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Demonstration Facilitator' }));
    fireEvent.change(screen.getByLabelText('Active scenario'), { target: { value: 'energy-pressure' } });
    const controls = () => within(screen.getByRole('region', { name: 'Facilitator controls' }));
    fireEvent.change(controls().getByRole('spinbutton'), { target: { value: '3' } });
    fireEvent.click(controls().getByRole('button', { name: 'Apply settings' }));
    expect(controls().getByText('Effective tolerance: 3 kW')).toBeVisible();
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search towers' }), { target: { value: 'Chicago' } });

    switchRole('Operations Manager');
    const queue = () => within(screen.getByRole('region', { name: 'Priority queue' }));
    const remediation = () => within(queue().getByRole('heading', { name: 'CHI-40117 · Remediation' }).closest('li'));
    fireEvent.click(remediation().getByRole('button', { name: 'Start action' }));
    expect(remediation().getByText(/Progress: In Progress/)).toBeVisible();
    switchRole('Demonstration Facilitator');
    expect(screen.getByLabelText('Active scenario')).toHaveValue('energy-pressure');
    expect(screen.getByRole('searchbox', { name: 'Search towers' })).toHaveValue('Chicago');
    expect(controls().getByText('Effective tolerance: 3 kW')).toBeVisible();
    switchRole('Operations Manager');
    expect(remediation().getByText(/Progress: In Progress/)).toBeVisible();
  });

  it('keeps the incumbent role and view on a blocked write, then switches on retry', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Portfolio Manager' }));
    const original = Storage.prototype.setItem;
    const blocked = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (key, value) {
      if (key === SESSION_KEY) throw new DOMException('Blocked', 'QuotaExceededError');
      return original.call(this, key, value);
    });
    switchRole('Asset Manager');
    expect(screen.getByRole('alert')).toHaveTextContent('Your current role and workshop changes are unchanged');
    expect(screen.getByRole('heading', { name: 'Portfolio scenario' })).toBeVisible();
    expect(JSON.parse(localStorage.getItem(SESSION_KEY)).persona).toBe('portfolio');
    blocked.mockRestore();
    switchRole('Asset Manager');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Assessments' })).toHaveFocus();
  });

  it('restores the saved role without hijacking the tower deep link, then responds to another tab exiting', () => {
    localStorage.setItem(SESSION_KEY, JSON.stringify({ v: 2, persona: 'commercial' }));
    window.history.replaceState(null, '', '/#/assessments/NYC-10234/growth');
    render(<App />);
    expect(screen.getByRole('heading', { level: 1, name: /NYC-10234/ })).toBeVisible();
    expect(window.location.hash).toBe('#/assessments/NYC-10234/growth');
    expect(screen.getByText('Demo role', { exact: true }).closest('summary')).toHaveTextContent('Colocation / Commercial Manager');
    localStorage.removeItem(SESSION_KEY);
    act(() => window.dispatchEvent(new StorageEvent('storage', { key: SESSION_KEY, storageArea: localStorage })));
    expect(screen.getByRole('heading', { name: 'Choose a demo role' })).toHaveFocus();
    expect(screen.queryByRole('navigation', { name: 'Workshop' })).not.toBeInTheDocument();
  });
});
