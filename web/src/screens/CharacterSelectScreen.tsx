import { useState, type ReactNode } from 'react';
import type { AccountInfo, ChannelStatus } from '@/webclient/contract';
import { CharacterCard } from '../components/CharacterCard';
import { EmptyState, Spinner } from '../components/primitives';
import { formatNumber } from '../lib/format';

export type CharacterSelectScreenProps = {
    account: AccountInfo | null;
    channels: ChannelStatus[];
    onEnter: (slot: number) => void;
    onRequestStatus: () => void;
    onDisconnect: () => void;
};

const SLOTS = [0, 1, 2, 3];

const EMPIRE_LABELS: Readonly<Record<number, string>> = { 1: 'Shinsoo', 2: 'Chunjo', 3: 'Jinno' };

/** Account character roster (four slots) with an "enter world" action per character. */
export function CharacterSelectScreen({
    account,
    channels,
    onEnter,
    onRequestStatus,
    onDisconnect,
}: CharacterSelectScreenProps): ReactNode {
    const [busySlot, setBusySlot] = useState<number | null>(null);
    const characters = account?.characters ?? [];
    const bySlot = new Map(characters.map((character) => [character.slot, character] as const));
    const empire = account?.empireId ?? null;

    const enter = (slot: number): void => {
        setBusySlot(slot);
        onEnter(slot);
    };

    return (
        <div className="screen screen--select">
            <header className="select__head">
                <div>
                    <h1 className="select__title">Select a character</h1>
                    <p className="select__subtitle">
                        {empire !== null && empire in EMPIRE_LABELS
                            ? `${EMPIRE_LABELS[empire]} empire`
                            : 'Choose who enters the world'}
                    </p>
                </div>
                <div className="select__actions">
                    <button
                        type="button"
                        className="btn btn--ghost"
                        onClick={onRequestStatus}
                        disabled={busySlot !== null}
                    >
                        Server status
                    </button>
                    <button
                        type="button"
                        className="btn btn--ghost"
                        onClick={onDisconnect}
                        disabled={busySlot !== null}
                    >
                        Log out
                    </button>
                </div>
            </header>

            {busySlot !== null ? (
                <p className="banner banner--info" role="status">
                    <Spinner size="sm" /> Entering the world on slot {busySlot + 1}…
                </p>
            ) : null}

            {channels.length > 0 ? (
                <ul className="channels">
                    {channels.map((channel, index) => (
                        <li key={index} className={`channel ${channel.status === 0 ? 'is-open' : 'is-busy'}`}>
                            <span className="channel__name">Channel {index + 1}</span>
                            <span className="channel__port">:{formatNumber(channel.port)}</span>
                            <span className="channel__status">
                                {channel.status === 0 ? 'open' : `state ${channel.status}`}
                            </span>
                        </li>
                    ))}
                </ul>
            ) : null}

            <div className="select__grid">
                {SLOTS.map((slot) => {
                    const character = bySlot.get(slot);
                    if (character === undefined) {
                        return (
                            <div key={slot} className="slot slot--empty">
                                <EmptyState title={`Slot ${slot + 1}`} message="No character in this slot." />
                            </div>
                        );
                    }
                    return <CharacterCard key={slot} character={character} busy={busySlot !== null} onEnter={enter} />;
                })}
            </div>
        </div>
    );
}
