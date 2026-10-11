import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { LoginScreen, type LoginScreenProps } from './LoginScreen';

const defaults: LoginScreenProps['defaults'] = {
    auth: { host: '127.0.0.1', port: 11002 },
    game: { host: '127.0.0.1', port: 13001 },
};

function renderLogin(overrides: Partial<LoginScreenProps> = {}): { onLogin: ReturnType<typeof vi.fn> } {
    const onLogin = vi.fn().mockResolvedValue(undefined);
    render(<LoginScreen defaults={defaults} lastError={null} onLogin={onLogin} {...overrides} />);
    return { onLogin };
}

describe('LoginScreen', () => {
    it('submits the account and password', async () => {
        const user = userEvent.setup();
        const { onLogin } = renderLogin();

        await user.type(screen.getByLabelText('Account'), 'admin');
        await user.type(screen.getByLabelText('Password'), 's3cret');
        await user.click(screen.getByRole('button', { name: 'Connect' }));

        expect(onLogin).toHaveBeenCalledTimes(1);
        expect(onLogin).toHaveBeenCalledWith({ username: 'admin', password: 's3cret' });
    });

    it('shows the default endpoints', () => {
        renderLogin();
        expect(screen.getByText(/connect to 127\.0\.0\.1:11002/)).toBeTruthy();
    });

    it('blocks an empty account name with an inline error', async () => {
        const user = userEvent.setup();
        const { onLogin } = renderLogin();

        await user.click(screen.getByRole('button', { name: 'Connect' }));

        expect(onLogin).not.toHaveBeenCalled();
        expect(screen.getByRole('alert').textContent).toContain('Enter your account name');
    });

    it('renders a previous session error', () => {
        renderLogin({ lastError: { code: 'AUTH_FAILED', message: 'Wrong password or account' } });
        expect(screen.getByRole('alert').textContent).toContain('Wrong password or account');
    });
});
