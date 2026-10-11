import type { ReactNode } from 'react';
import type { DroppedItem, ItemSnapshot } from '@/webclient/contract';
import { formatNumber } from '../lib/format';
import { EmptyState } from './primitives';

const WINDOW_LABELS: Readonly<Record<number, string>> = {
    0: 'Equipment',
    1: 'Inventory',
    2: 'Dragon soul',
    3: 'Safebox',
    4: 'Mall',
};

function windowLabel(window: number): string {
    return WINDOW_LABELS[window] ?? `Window ${window}`;
}

export type ItemsPanelProps = {
    items: ItemSnapshot[];
    droppedItems: DroppedItem[];
    onUse: (window: number, position: number) => void;
    onPickUp: (vid: number) => void;
};

/** Inventory/equipment snapshot plus the dropped items currently on the ground. */
export function ItemsPanel({ items, droppedItems, onUse, onPickUp }: ItemsPanelProps): ReactNode {
    const windows = [...new Set(items.map((item) => item.window))].sort((a, b) => a - b);

    return (
        <div className="items">
            {items.length === 0 ? (
                <EmptyState title="No items" message="Nothing has been received from the server yet." />
            ) : (
                windows.map((window) => (
                    <div key={window} className="items__window">
                        <h3 className="items__window-title">{windowLabel(window)}</h3>
                        <ul className="items__grid">
                            {items
                                .filter((item) => item.window === window)
                                .sort((a, b) => a.position - b.position)
                                .map((item) => (
                                    <li key={`${item.window}:${item.position}`} className="item">
                                        <button
                                            type="button"
                                            className="item__use"
                                            onClick={() => onUse(item.window, item.position)}
                                            title={`Use item #${item.id}`}
                                        >
                                            <span className="item__id">#{item.id}</span>
                                            <span className="item__count">×{formatNumber(item.count)}</span>
                                            {item.sockets.length > 0 ? (
                                                <span className="item__tag">{item.sockets.length} socket(s)</span>
                                            ) : null}
                                            {item.bonuses.length > 0 ? (
                                                <span className="item__tag">{item.bonuses.length} bonus(es)</span>
                                            ) : null}
                                        </button>
                                    </li>
                                ))}
                        </ul>
                    </div>
                ))
            )}

            {droppedItems.length > 0 ? (
                <div className="items__window">
                    <h3 className="items__window-title">On the ground</h3>
                    <ul className="items__grid">
                        {droppedItems.map((drop) => (
                            <li key={drop.vid} className="item">
                                <button
                                    type="button"
                                    className="item__use"
                                    onClick={() => onPickUp(drop.vid)}
                                    title="Pick up"
                                >
                                    <span className="item__id">#{drop.id}</span>
                                    <span className="item__count">pick up</span>
                                </button>
                            </li>
                        ))}
                    </ul>
                </div>
            ) : null}
        </div>
    );
}
