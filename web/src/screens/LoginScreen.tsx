import { useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react';
import type { BridgeEndpoint, LoginRequest } from '@/webclient/contract';
import { Spinner } from '../components/primitives';

export type LoginScreenProps = {
    defaults: { auth: BridgeEndpoint; game: BridgeEndpoint };
    lastError: { code: string; message: string } | null;
    onLogin: (input: LoginRequest) => Promise<void>;
};

function parsePort(value: string): number | 'invalid' | undefined {
    const trimmed = value.trim();
    if (trimmed.length === 0) return undefined;
    const parsed = Number.parseInt(trimmed, 10);
    if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 65_535) return 'invalid';
    return parsed;
}

/** Build the wire request, or return a validation message. */
function buildLoginRequest(
    username: string,
    password: string,
    advanced: boolean,
    hosts: { authHost: string; authPort: string; gameHost: string; gamePort: string },
): LoginRequest | string {
    const request: LoginRequest = { username: username.trim(), password };
    if (!advanced) return request;

    if (hosts.authHost.trim().length > 0) request.authHost = hosts.authHost.trim();
    const authPort = parsePort(hosts.authPort);
    if (authPort === 'invalid') return 'The auth port must be a number between 1 and 65535.';
    if (authPort !== undefined) request.authPort = authPort;

    if (hosts.gameHost.trim().length > 0) request.gameHost = hosts.gameHost.trim();
    const gamePort = parsePort(hosts.gamePort);
    if (gamePort === 'invalid') return 'The game port must be a number between 1 and 65535.';
    if (gamePort !== undefined) request.gamePort = gamePort;

    return request;
}

/** Account login form with an optional advanced (auth/game endpoint) section. */
export function LoginScreen({ defaults, lastError, onLogin }: LoginScreenProps): ReactNode {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [advanced, setAdvanced] = useState(false);
    const [authHost, setAuthHost] = useState('');
    const [authPort, setAuthPort] = useState('');
    const [gameHost, setGameHost] = useState('');
    const [gamePort, setGamePort] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
        event.preventDefault();
        if (username.trim().length === 0) {
            setError('Enter your account name.');
            return;
        }
        const request = buildLoginRequest(username, password, advanced, { authHost, authPort, gameHost, gamePort });
        if (typeof request === 'string') {
            setError(request);
            return;
        }
        setError(null);
        setBusy(true);
        try {
            await onLogin(request);
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="screen screen--login">
            <form className="auth-card" onSubmit={submit} noValidate>
                <h1 className="auth-card__title">Sign in</h1>
                <p className="auth-card__subtitle">
                    connect to {defaults.auth.host}:{defaults.auth.port} and {defaults.game.host}:{defaults.game.port}
                </p>

                {lastError !== null ? (
                    <p className="banner banner--error" role="alert">
                        {lastError.message}
                    </p>
                ) : null}

                <label className="field" htmlFor="login-account">
                    <span className="field__label">Account</span>
                    <input
                        id="login-account"
                        className="input"
                        aria-label="Account"
                        value={username}
                        autoComplete="username"
                        onChange={(event: ChangeEvent<HTMLInputElement>) => setUsername(event.target.value)}
                        autoFocus
                    />
                </label>
                <label className="field" htmlFor="login-password">
                    <span className="field__label">Password</span>
                    <input
                        id="login-password"
                        className="input"
                        aria-label="Password"
                        type="password"
                        value={password}
                        autoComplete="current-password"
                        onChange={(event: ChangeEvent<HTMLInputElement>) => setPassword(event.target.value)}
                    />
                </label>

                <details
                    className="advanced"
                    open={advanced}
                    onToggle={(event) => setAdvanced(event.currentTarget.open)}
                >
                    <summary>Server endpoints</summary>
                    <div className="advanced__grid">
                        <label className="field" htmlFor="login-auth-host">
                            <span className="field__label">Auth host</span>
                            <input
                                id="login-auth-host"
                                className="input"
                                aria-label="Auth host"
                                placeholder={defaults.auth.host}
                                value={authHost}
                                onChange={(event: ChangeEvent<HTMLInputElement>) => setAuthHost(event.target.value)}
                            />
                        </label>
                        <label className="field" htmlFor="login-auth-port">
                            <span className="field__label">Auth port</span>
                            <input
                                id="login-auth-port"
                                className="input"
                                aria-label="Auth port"
                                inputMode="numeric"
                                placeholder={String(defaults.auth.port)}
                                value={authPort}
                                onChange={(event: ChangeEvent<HTMLInputElement>) => setAuthPort(event.target.value)}
                            />
                        </label>
                        <label className="field" htmlFor="login-game-host">
                            <span className="field__label">Game host</span>
                            <input
                                id="login-game-host"
                                className="input"
                                aria-label="Game host"
                                placeholder={defaults.game.host}
                                value={gameHost}
                                onChange={(event: ChangeEvent<HTMLInputElement>) => setGameHost(event.target.value)}
                            />
                        </label>
                        <label className="field" htmlFor="login-game-port">
                            <span className="field__label">Game port</span>
                            <input
                                id="login-game-port"
                                className="input"
                                aria-label="Game port"
                                inputMode="numeric"
                                placeholder={String(defaults.game.port)}
                                value={gamePort}
                                onChange={(event: ChangeEvent<HTMLInputElement>) => setGamePort(event.target.value)}
                            />
                        </label>
                    </div>
                </details>

                {error !== null ? (
                    <p className="banner banner--error" role="alert">
                        {error}
                    </p>
                ) : null}

                <button type="submit" className="btn btn--primary btn--block" disabled={busy}>
                    {busy ? <Spinner size="sm" label="Connecting" /> : 'Connect'}
                </button>
            </form>
        </div>
    );
}
