import type { ReactNode } from 'react';
import type { ConnectionEventView, RawPacketView } from '@/webclient/contract';
import { connectionStateLabel } from '../lib/enums';
import { formatTimeOfDay } from '../lib/format';
import { EmptyState } from './primitives';

export type DebugPanelProps = {
    rawPackets: RawPacketView[];
    connectionEvents: ConnectionEventView[];
};

/** Collapsible diagnostics: the last decoded packets and connection transitions. */
export function DebugPanel({ rawPackets, connectionEvents }: DebugPanelProps): ReactNode {
    const recentPackets = [...rawPackets].slice(-60).reverse();
    const recentEvents = [...connectionEvents].slice(-12).reverse();

    return (
        <details className="debug">
            <summary className="debug__summary">
                Protocol diagnostics <span className="debug__count">{rawPackets.length} packets</span>
            </summary>
            <div className="debug__body">
                <h3 className="debug__title">Connection transitions</h3>
                {recentEvents.length === 0 ? (
                    <EmptyState title="No transitions yet" />
                ) : (
                    <ul className="debug__list">
                        {recentEvents.map((event, index) => (
                            <li key={`${event.at}-${index}`} className="debug__row">
                                <span className="debug__time">{formatTimeOfDay(event.at)}</span>
                                <span className="debug__source">{event.source}</span>
                                <span className="debug__detail">{connectionStateLabel(event.state)}</span>
                            </li>
                        ))}
                    </ul>
                )}

                <h3 className="debug__title">Recent packets</h3>
                {recentPackets.length === 0 ? (
                    <EmptyState title="No packets yet" />
                ) : (
                    <ul className="debug__list">
                        {recentPackets.map((view, index) => (
                            <li key={`${view.receivedAt}-${index}`} className="debug__row">
                                <span className="debug__time">{formatTimeOfDay(view.receivedAt)}</span>
                                <span className="debug__source">{view.source}</span>
                                <span className="debug__detail">{view.packet.type}</span>
                                <span className="debug__header">
                                    0x{view.packet.header.toString(16).padStart(2, '0')}
                                </span>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </details>
    );
}
