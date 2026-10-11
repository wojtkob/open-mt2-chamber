import { Component, type ErrorInfo, type ReactNode } from 'react';

type Props = { children: ReactNode };
type State = { error: Error | null };

/**
 * Catches render/lifecycle errors anywhere in the SPA and shows a recovery
 * screen instead of a blank page. Resetting clears the error and re-renders;
 * the SSE stream keeps running underneath.
 */
export default class ErrorBoundary extends Component<Props, State> {
    state: State = { error: null };

    static getDerivedStateFromError(error: Error): State {
        return { error };
    }

    componentDidCatch(error: Error, info: ErrorInfo): void {
        console.error('[web-client] UI error', error, info.componentStack);
    }

    render(): ReactNode {
        if (this.state.error !== null) {
            return (
                <div className="fatal" role="alert">
                    <h1 className="fatal__title">Something went wrong</h1>
                    <p className="fatal__message">{this.state.error.message}</p>
                    <button type="button" className="btn btn--primary" onClick={() => this.setState({ error: null })}>
                        Try again
                    </button>
                </div>
            );
        }
        return this.props.children;
    }
}
