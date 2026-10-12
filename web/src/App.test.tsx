import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionActions } from './hooks/useVisualSession';
import { createInitialView, type ViewState } from './state/viewState';

// The hook owns the network; the App only routes on the view it returns, so we
// drive the screens here by swapping that view.
const session = vi.hoisted(() => ({
    view: undefined as unknown as ViewState,
    actions: undefined as unknown as SessionActions,
}));

vi.mock('./hooks/useVisualSession', () => ({
    useVisualSession: () => ({ view: session.view, health: null, actions: session.actions }),
}));

import App from './App';

function makeActions(): SessionActions {
    return {
        login: vi.fn().mockResolvedValue(undefined),
        enterWorld: vi.fn().mockResolvedValue(undefined),
        chat: vi.fn().mockResolvedValue(undefined),
        verb: vi.fn().mockResolvedValue(undefined),
        requestStatus: vi.fn().mockResolvedValue(undefined),
        disconnect: vi.fn().mockResolvedValue(undefined),
        notifyError: vi.fn(),
        dismissToast: vi.fn(),
    };
}

describe('App', () => {
    beforeEach(() => {
        session.actions = makeActions();
        session.view = createInitialView();
    });

    it('shows the login form while idle', () => {
        render(<App />);
        expect(screen.getByRole('button', { name: /connect/i })).toBeTruthy();
    });

    it('routes to character select once an account is loaded', () => {
        session.view = {
            ...createInitialView(),
            stage: 'select',
            loggedInAs: 'admin',
            account: { empireId: 2, characters: [] },
        };
        render(<App />);
        expect(screen.getByText('Select a character')).toBeTruthy();
        expect(screen.getByText('Chunjo empire')).toBeTruthy();
    });

    it('lazy-loads the in-game screen through Suspense', async () => {
        session.view = {
            ...createInitialView(),
            stage: 'game',
            loggedInAs: 'admin',
            game: { connected: true, connectionState: 5 },
        };
        render(<App />);
        // The in-game screen is its own chunk, so it resolves asynchronously.
        expect(await screen.findByText('Skills & effects')).toBeTruthy();
    });

    it('shows the reconnecting banner while the bridge stream is offline', () => {
        session.view = { ...createInitialView(), streamOnline: false };
        render(<App />);
        expect(screen.getByRole('alert').textContent).toMatch(/reconnecting/i);
    });
});
