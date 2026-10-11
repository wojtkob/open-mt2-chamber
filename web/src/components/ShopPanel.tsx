import type { ReactNode } from 'react';
import type { ShopGrid } from '@/webclient/contract';
import { formatNumber } from '../lib/format';
import { EmptyState } from './primitives';

export type ShopPanelProps = {
    shop: ShopGrid;
    onBuy: (pos: number) => void;
    onClose: () => void;
};

/** The open NPC/private shop, with a buy action per entry. */
export function ShopPanel({ shop, onBuy, onClose }: ShopPanelProps): ReactNode {
    if (shop === null) {
        return <EmptyState title="No shop open" message="Talk to a shop NPC to trade." />;
    }

    const entries = [...shop.entries].sort((a, b) => a.pos - b.pos);

    return (
        <div className="shop">
            <div className="shop__bar">
                <span className="shop__owner">Owner #{shop.ownerVid}</span>
                <button type="button" className="btn btn--ghost" onClick={onClose}>
                    Close shop
                </button>
            </div>
            {entries.length === 0 ? (
                <EmptyState title="Empty stock" message="This shop has no items to sell." />
            ) : (
                <ul className="shop__list">
                    {entries.map((entry) => (
                        <li key={entry.pos} className="shop__entry">
                            <span className="shop__item">#{entry.vnum}</span>
                            <span className="shop__count">×{formatNumber(entry.count)}</span>
                            <span className="shop__price">{formatNumber(entry.price)} yang</span>
                            <button type="button" className="btn btn--small" onClick={() => onBuy(entry.pos)}>
                                Buy
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
