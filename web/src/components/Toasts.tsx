import { useEffect, type ReactNode } from 'react';
import type { Toast } from '../state/viewState';

const DISMISS_AFTER_MS = 6000;

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: string) => void }): ReactNode {
    useEffect(() => {
        const timer = window.setTimeout(() => onDismiss(toast.id), DISMISS_AFTER_MS);
        return () => window.clearTimeout(timer);
    }, [toast.id, onDismiss]);

    const icon = toast.kind === 'error' ? '⚠' : toast.kind === 'success' ? '✓' : 'ℹ';
    return (
        <div className={`toast toast--${toast.kind}`} role="status">
            <span className="toast__icon" aria-hidden="true">
                {icon}
            </span>
            <span className="toast__message">{toast.message}</span>
            <button
                type="button"
                className="toast__close"
                onClick={() => onDismiss(toast.id)}
                aria-label="Dismiss notification"
            >
                ✕
            </button>
        </div>
    );
}

/** Fixed-position stack of transient notifications (auto-dismissing). */
export function Toasts({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: string) => void }): ReactNode {
    return (
        <div className="toasts" aria-live="polite" aria-atomic="false">
            {toasts.map((toast) => (
                <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
            ))}
        </div>
    );
}
