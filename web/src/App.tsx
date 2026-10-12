import { lazy, Suspense, type ReactNode } from 'react';
import ErrorBoundary from './components/ErrorBoundary';
import { Toasts } from './components/Toasts';
import { useVisualSession } from './hooks/useVisualSession';
import { CharacterSelectScreen } from './screens/CharacterSelectScreen';
import { ConnectingScreen } from './screens/ConnectingScreen';
import { LoginScreen } from './screens/LoginScreen';
import { connectionStateLabel } from './lib/enums';

// The in-world screen (HUD, entity/chat/item/shop panels, protocol debug) is the
// largest part of the UI and is only reachable after logging in, so it is split
// into its own chunk and fetched on demand; the login path stays small.
const GameScreen = lazy(() => import('./screens/GameScreen').then((module) => ({ default: module.GameScreen })));

/** Root component: owns the session hook and routes between the four screens. */
export default function App(): ReactNode {
    const { view, health, actions } = useVisualSession();

    const renderScreen = (): ReactNode => {
        switch (view.stage) {
            case 'authenticating':
            case 'loading':
                return (
                    <ConnectingScreen
                        stage={view.stage}
                        lastError={view.lastError}
                        onDisconnect={() => void actions.disconnect()}
                    />
                );
            case 'select':
                return (
                    <CharacterSelectScreen
                        account={view.account}
                        channels={view.channels}
                        onEnter={(slot) => void actions.enterWorld(slot)}
                        onRequestStatus={() => void actions.requestStatus()}
                        onDisconnect={() => void actions.disconnect()}
                    />
                );
            case 'game':
                return (
                    <Suspense
                        fallback={
                            <ConnectingScreen
                                stage="loading"
                                lastError={null}
                                onDisconnect={() => void actions.disconnect()}
                            />
                        }
                    >
                        <GameScreen view={view} actions={actions} />
                    </Suspense>
                );
            case 'idle':
            case 'disconnected':
                return <LoginScreen defaults={view.defaults} lastError={view.lastError} onLogin={actions.login} />;
        }
    };

    return (
        <ErrorBoundary>
            <div className="app">
                <header className="topbar">
                    <div className="topbar__brand">
                        <span className="topbar__logo" aria-hidden="true">
                            ⛩
                        </span>
                        <span className="topbar__title">
                            <strong>open-mt2</strong>
                            <small>web client</small>
                        </span>
                    </div>
                    <div className="topbar__status">
                        <span className={`pill ${view.streamOnline ? 'is-online' : 'is-offline'}`}>
                            bridge {view.streamOnline ? 'live' : 'offline'}
                        </span>
                        {view.stage !== 'idle' ? (
                            <span className="pill">game · {connectionStateLabel(view.game.connectionState)}</span>
                        ) : null}
                        {view.loggedInAs !== null ? <span className="pill">{view.loggedInAs}</span> : null}
                    </div>
                    {view.stage !== 'idle' && view.stage !== 'disconnected' ? (
                        <button type="button" className="btn btn--ghost" onClick={() => void actions.disconnect()}>
                            Disconnect
                        </button>
                    ) : null}
                </header>

                <main className="content">{renderScreen()}</main>

                <footer className="footnote">
                    {health !== null ? (
                        <span>
                            bridge {health.version} · auth {view.defaults.auth.host}:{view.defaults.auth.port} · game{' '}
                            {view.defaults.game.host}:{view.defaults.game.port}
                        </span>
                    ) : (
                        <span>waiting for the web client bridge…</span>
                    )}
                </footer>
            </div>

            <Toasts toasts={view.toasts} onDismiss={actions.dismissToast} />
            {!view.streamOnline ? (
                <div className="offline-banner" role="alert">
                    Reconnecting to the web client bridge…
                </div>
            ) : null}
        </ErrorBoundary>
    );
}
