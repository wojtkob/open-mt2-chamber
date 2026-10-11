import type { ReactNode } from 'react';
import type { CharacterSummary } from '@/webclient/contract';
import { playerClassLabel } from '../lib/enums';
import { formatNumber, formatPlayTime } from '../lib/format';

export type CharacterCardProps = {
    character: CharacterSummary;
    busy: boolean;
    onEnter: (slot: number) => void;
};

/** One occupied character slot on the account, with an "enter world" action. */
export function CharacterCard({ character, busy, onEnter }: CharacterCardProps): ReactNode {
    return (
        <article className="character-card">
            <div className="character-card__portrait" aria-hidden="true">
                {character.name.slice(0, 1).toUpperCase()}
            </div>
            <div className="character-card__body">
                <h3 className="character-card__name">{character.name}</h3>
                <p className="character-card__class">
                    {playerClassLabel(character.playerClass)} · Lv {formatNumber(character.level)}
                </p>
                <dl className="character-card__stats">
                    <div>
                        <dt>ST</dt>
                        <dd>{formatNumber(character.st)}</dd>
                    </div>
                    <div>
                        <dt>HT</dt>
                        <dd>{formatNumber(character.ht)}</dd>
                    </div>
                    <div>
                        <dt>DX</dt>
                        <dd>{formatNumber(character.dx)}</dd>
                    </div>
                    <div>
                        <dt>IQ</dt>
                        <dd>{formatNumber(character.iq)}</dd>
                    </div>
                </dl>
                <p className="character-card__play">Played {formatPlayTime(character.playTime)}</p>
                <button
                    type="button"
                    className="btn btn--primary character-card__enter"
                    disabled={busy}
                    onClick={() => onEnter(character.slot)}
                >
                    Enter world
                </button>
            </div>
        </article>
    );
}
