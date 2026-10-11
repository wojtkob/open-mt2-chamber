import type { ReactNode } from 'react';
import type { LoginStage } from '@/webclient/contract';
import { Spinner } from '../components/primitives';

export type ConnectingScreenProps = {
    stage: LoginStage;
    lastError: { code: string; message: string } | null;
    onDisconnect: () => void;
};

const MESSAGES: Partial<Record<LoginStage, string>> = {
    authenticating: 'Authenticating…',
    loading: 'Loading your character…',
};

/** Full-screen progress view shown while authenticating, loading or entering. */
export function ConnectingScreen({ stage, lastError, onDisconnect }: ConnectingScreenProps): ReactNode {
    return (
        <div className="screen screen--centered">
            <Spinner size="lg" />
            <h1 className="connecting__title">{MESSAGES[stage] ?? 'Connecting…'}</h1>
            <p className="connecting__hint">Talking to the game servers. This only takes a moment.</p>
            {lastError !== null ? (
                <p className="banner banner--error" role="alert">
                    {lastError.message}
                </p>
            ) : null}
            <button type="button" className="btn btn--ghost" onClick={onDisconnect}>
                Cancel
            </button>
        </div>
    );
}
