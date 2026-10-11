import type { ReactNode } from 'react';
import { formatNumber, percent } from '../lib/format';

/** Inline loading indicator with an optional label. */
export function Spinner({ label, size = 'md' }: { label?: string; size?: 'sm' | 'md' | 'lg' }): ReactNode {
    return (
        <span className={`spinner spinner--${size}`} role="status" aria-live="polite">
            <span className="spinner__ring" aria-hidden="true" />
            {label !== undefined ? <span className="spinner__label">{label}</span> : null}
        </span>
    );
}

/** Pulsing placeholder shown while a panel's data is loading. */
export function Skeleton({ lines = 3 }: { lines?: number }): ReactNode {
    return (
        <div className="skeleton" aria-hidden="true">
            {Array.from({ length: lines }, (_value, index) => (
                <span key={index} className="skeleton__line" />
            ))}
        </div>
    );
}

/** Centred empty/zero-data state with an optional call to action. */
export function EmptyState({
    title,
    message,
    action,
}: {
    title: string;
    message?: string;
    action?: ReactNode;
}): ReactNode {
    return (
        <div className="empty">
            <p className="empty__title">{title}</p>
            {message !== undefined ? <p className="empty__message">{message}</p> : null}
            {action !== undefined ? <div className="empty__action">{action}</div> : null}
        </div>
    );
}

/** A labelled HP/MP/ST style bar. */
export function StatBar({
    label,
    value,
    max,
    tone,
}: {
    label: string;
    value: number;
    max: number;
    tone: 'hp' | 'mp' | 'st' | 'exp';
}): ReactNode {
    const width = percent(value, max);
    return (
        <div className={`stat stat--${tone}`}>
            <div className="stat__head">
                <span className="stat__label">{label}</span>
                <span className="stat__value">
                    {formatNumber(value)}
                    <span className="stat__max"> / {formatNumber(max)}</span>
                </span>
            </div>
            <div
                className="stat__track"
                role="progressbar"
                aria-label={label}
                aria-valuenow={Math.round(value)}
                aria-valuemin={0}
                aria-valuemax={Math.max(max, 0)}
            >
                <div className="stat__fill" style={{ width: `${width}%` }} />
            </div>
        </div>
    );
}

/** Small online/offline dot with an accessible label. */
export function StatusDot({ online, label }: { online: boolean; label: string }): ReactNode {
    return (
        <span
            className={`status-dot ${online ? 'is-online' : 'is-offline'}`}
            title={label}
            aria-label={label}
            role="img"
        />
    );
}

/** A bordered panel with a title row and an optional action slot. */
export function SectionPanel({
    title,
    actions,
    children,
    className = '',
    scroll = false,
}: {
    title: string;
    actions?: ReactNode;
    children: ReactNode;
    className?: string;
    scroll?: boolean;
}): ReactNode {
    return (
        <section className={`panel ${className}`.trim()}>
            <header className="panel__head">
                <h2 className="panel__title">{title}</h2>
                {actions !== undefined ? <div className="panel__actions">{actions}</div> : null}
            </header>
            <div className={`panel__body ${scroll ? 'panel__body--scroll' : ''}`.trim()}>{children}</div>
        </section>
    );
}
