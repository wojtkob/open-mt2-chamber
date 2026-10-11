import { useMemo, useState, type ChangeEvent, type ReactNode } from 'react';
import type { EntityState } from '@/webclient/contract';
import { EntityTypeEnum, entityTypeLabel, playerClassLabel } from '../lib/enums';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { EmptyState } from './primitives';

export type EntityListProps = {
    entities: EntityState[];
    selectedVid: number | null;
    onTarget: (vid: number) => void;
    onAttack: (vid: number) => void;
};

const ATTACKABLE = new Set<number>([EntityTypeEnum.MONSTER, EntityTypeEnum.METIN_STONE]);

/** Searchable list of nearby entities; click targets, the sword button attacks. */
export function EntityList({ entities, selectedVid, onTarget, onAttack }: EntityListProps): ReactNode {
    const [query, setQuery] = useState('');
    const debouncedQuery = useDebouncedValue(query, 200).trim().toLowerCase();

    const visible = useMemo(() => {
        const sorted = [...entities].sort((a, b) => a.vid - b.vid);
        if (debouncedQuery.length === 0) return sorted;
        return sorted.filter((entity) => {
            const haystack = `${entity.name} ${entityTypeLabel(entity.entityType)} ${entity.vid}`.toLowerCase();
            return haystack.includes(debouncedQuery);
        });
    }, [entities, debouncedQuery]);

    return (
        <div className="entities">
            <input
                type="search"
                className="input input--search"
                placeholder="Filter by name, type or id…"
                value={query}
                onChange={(event: ChangeEvent<HTMLInputElement>) => setQuery(event.target.value)}
                aria-label="Filter nearby entities"
            />
            {visible.length === 0 ? (
                <EmptyState
                    title="Nothing to show"
                    message={entities.length === 0 ? 'No entities in view yet.' : 'No entity matches the filter.'}
                />
            ) : (
                <ul className="entities__list">
                    {visible.map((entity) => {
                        const attackable = ATTACKABLE.has(entity.entityType);
                        return (
                            <li
                                key={entity.vid}
                                className={`entity ${selectedVid === entity.vid ? 'is-selected' : ''}`}
                            >
                                <button
                                    type="button"
                                    className="entity__main"
                                    onClick={() => onTarget(entity.vid)}
                                    aria-pressed={selectedVid === entity.vid}
                                >
                                    <span className="entity__badge">{entityTypeLabel(entity.entityType)}</span>
                                    <span className="entity__name">
                                        {entity.name.length > 0 ? entity.name : `#${entity.vid}`}
                                    </span>
                                    <span className="entity__meta">
                                        {entity.entityType === EntityTypeEnum.PLAYER
                                            ? `Lv ${entity.level} · ${playerClassLabel(entity.playerClass)}`
                                            : `id ${entity.vid}`}
                                        {entity.dead ? ' · defeated' : ''}
                                    </span>
                                </button>
                                {attackable ? (
                                    <button
                                        type="button"
                                        className="icon-btn"
                                        title={`Attack ${entity.name.length > 0 ? entity.name : entity.vid}`}
                                        aria-label={`Attack ${entity.name.length > 0 ? entity.name : entity.vid}`}
                                        onClick={() => onAttack(entity.vid)}
                                    >
                                        ⚔
                                    </button>
                                ) : null}
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
}
