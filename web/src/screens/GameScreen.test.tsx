import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ChatEntry, EntityState, SelfSummary } from '@/webclient/contract';
import type { SessionActions } from '../hooks/useVisualSession';
import { createInitialView } from '../state/viewState';
import { GameScreen } from './GameScreen';

function makeEntity(overrides: Partial<EntityState> = {}): EntityState {
    return {
        vid: 11,
        entityType: 0,
        name: 'Wild Dog',
        positionX: 100,
        positionY: 200,
        positionZ: 0,
        rotation: 0,
        playerClass: 0,
        movementSpeed: 100,
        attackSpeed: 100,
        state: 0,
        affects: [],
        parts: [],
        level: 5,
        empireId: 0,
        guildId: 0,
        rankPoints: 0,
        pkMode: 0,
        mountId: 0,
        dead: false,
        updatedAt: 0,
        ...overrides,
    };
}

const SELF: SelfSummary = {
    vid: 1,
    playerName: 'Tester',
    playerClass: 0,
    level: 42,
    positionX: 1,
    positionY: 2,
    positionZ: 3,
    empireId: 1,
    skillGroup: 0,
};

const CHAT: ChatEntry = { messageType: 0, vid: 1, empireId: 1, message: 'welcome', receivedAt: 1000 };

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

function renderGame(overrides: Partial<ReturnType<typeof createInitialView>> = {}): { actions: SessionActions } {
    const actions = makeActions();
    const view = {
        ...createInitialView(),
        stage: 'game' as const,
        game: { connected: true, connectionState: 6 },
        self: SELF,
        points: [0, 42, 0, 0, 0, 500, 800, 200, 300, 100, 100, 1234],
        entities: [makeEntity()],
        chatLog: [CHAT],
        ...overrides,
    };
    render(<GameScreen view={view} actions={actions} />);
    return { actions };
}

describe('GameScreen', () => {
    it('renders the HUD, entities and chat log', () => {
        renderGame();
        expect(screen.getByText('Tester')).toBeTruthy();
        expect(screen.getByText('Wild Dog')).toBeTruthy();
        expect(screen.getByText('welcome')).toBeTruthy();
    });

    it('targets an entity when its row is clicked', async () => {
        const user = userEvent.setup();
        const { actions } = renderGame();
        const row = screen.getByText('Wild Dog').closest('button');
        if (row === null) throw new Error('the entity row button was not rendered');
        await user.click(row);
        expect(actions.verb).toHaveBeenCalledWith({ verb: 'target', targetVirtualId: 11 });
    });

    it('attacks an entity from the list button', async () => {
        const user = userEvent.setup();
        const { actions } = renderGame();
        await user.click(screen.getByRole('button', { name: 'Attack Wild Dog' }));
        expect(actions.verb).toHaveBeenCalledWith({ verb: 'attack', victimVirtualId: 11 });
    });

    it('sends a chat line and clears the input', async () => {
        const user = userEvent.setup();
        const { actions } = renderGame();
        const input = screen.getByLabelText('Chat message') as HTMLInputElement;
        await user.type(input, 'hello world');
        await user.click(screen.getByRole('button', { name: 'Send' }));
        expect(actions.chat).toHaveBeenCalledWith('hello world');
        expect(input.value).toBe('');
    });

    it('disables chat when the game connection is down', () => {
        renderGame({ game: { connected: false, connectionState: 0 } });
        expect((screen.getByLabelText('Chat message') as HTMLInputElement).disabled).toBe(true);
    });

    it('shows an empty entities state when nothing is nearby', () => {
        renderGame({ entities: [] });
        expect(screen.getByText('Nothing to show')).toBeTruthy();
    });
});
