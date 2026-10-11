import { useMemo, useState, type ReactNode } from 'react';
import type { SessionActions } from '../hooks/useVisualSession';
import type { ViewState } from '../state/viewState';
import { ChatPanel } from '../components/ChatPanel';
import { DebugPanel } from '../components/DebugPanel';
import { EntityList } from '../components/EntityList';
import { HUD } from '../components/HUD';
import { ItemsPanel } from '../components/ItemsPanel';
import { ShopPanel } from '../components/ShopPanel';
import { EmptyState, SectionPanel, Spinner } from '../components/primitives';
import { EntityTypeEnum, connectionStateLabel, entityTypeLabel, playerClassLabel } from '../lib/enums';
import { formatNumber } from '../lib/format';

export type GameScreenProps = {
    view: ViewState;
    actions: SessionActions;
};

/** The in-world screen: HUD, entities, combat, chat, inventory, shop and diagnostics. */
export function GameScreen({ view, actions }: GameScreenProps): ReactNode {
    const [selectedVid, setSelectedVid] = useState<number | null>(null);
    const selected = useMemo(
        () => view.entities.find((entity) => entity.vid === selectedVid) ?? null,
        [view.entities, selectedVid],
    );

    const canAct = view.stage === 'game' && view.game.connected;
    const nearestDrop = view.droppedItems[0] ?? null;

    // The server always sends all 255 skill slots; only the trained ones (a
    // non-zero rank or level) are worth showing.
    const trainedSkills = useMemo(
        () =>
            view.skills
                .map((skill, index) => ({ skill, index }))
                .filter(({ skill }) => skill.rank > 0 || skill.level > 0),
        [view.skills],
    );

    const target = (vid: number): void => {
        setSelectedVid(vid);
        void actions.verb({ verb: 'target', targetVirtualId: vid });
    };
    const attack = (vid: number): void => {
        setSelectedVid(vid);
        void actions.verb({ verb: 'attack', victimVirtualId: vid });
    };
    const pickUp = (vid: number): void => {
        void actions.verb({ verb: 'pickUp', virtualId: vid });
    };
    const useItem = (window: number, position: number): void => {
        void actions.verb({ verb: 'useItem', window, position });
    };
    const buy = (pos: number): void => {
        void actions.verb({ verb: 'buyShopItem', pos });
    };
    const closeShop = (): void => {
        void actions.verb({ verb: 'closeShop' });
    };

    return (
        <div className="screen screen--game">
            <HUD
                self={view.self}
                points={view.points}
                time={view.time}
                channel={view.channel}
                empireId={view.empireId}
            />

            <div className="game__status">
                <span className={`pill ${view.game.connected ? 'is-online' : 'is-offline'}`}>
                    game · {connectionStateLabel(view.game.connectionState)}
                </span>
                <span className="pill">entities · {formatNumber(view.entities.length)}</span>
                <span className="pill">drops · {formatNumber(view.droppedItems.length)}</span>
                {view.busy ? (
                    <span className="pill pill--busy">
                        <Spinner size="sm" /> working…
                    </span>
                ) : null}
            </div>

            <div className="game__grid">
                <SectionPanel title="Nearby entities" className="game__entities" scroll>
                    <EntityList
                        entities={view.entities}
                        selectedVid={selectedVid}
                        onTarget={target}
                        onAttack={attack}
                    />
                </SectionPanel>

                <SectionPanel title="Combat" className="game__combat">
                    {selected === null ? (
                        <EmptyState title="No target" message="Pick an entity from the list to target it." />
                    ) : (
                        <div className="combat">
                            <p className="combat__target">
                                <strong>{selected.name.length > 0 ? selected.name : `#${selected.vid}`}</strong>{' '}
                                <span className="combat__type">{entityTypeLabel(selected.entityType)}</span>
                            </p>
                            <p className="combat__meta">
                                {selected.entityType === EntityTypeEnum.PLAYER
                                    ? `Level ${formatNumber(selected.level)} · ${playerClassLabel(selected.playerClass)}`
                                    : `id ${selected.vid}`}
                                {selected.dead ? ' · defeated' : ''}
                            </p>
                            <div className="combat__actions">
                                <button type="button" className="btn" onClick={() => target(selected.vid)}>
                                    Target
                                </button>
                                <button type="button" className="btn btn--primary" onClick={() => attack(selected.vid)}>
                                    Attack
                                </button>
                                <button
                                    type="button"
                                    className="btn"
                                    onClick={() => void actions.verb({ verb: 'click', targetVirtualId: selected.vid })}
                                >
                                    Interact
                                </button>
                                <button
                                    type="button"
                                    className="btn"
                                    onClick={() => void actions.verb({ verb: 'shoot', type: 0 })}
                                >
                                    Shoot
                                </button>
                                {nearestDrop !== null ? (
                                    <button type="button" className="btn" onClick={() => pickUp(nearestDrop.vid)}>
                                        Pick up #{nearestDrop.id}
                                    </button>
                                ) : null}
                            </div>
                        </div>
                    )}
                </SectionPanel>

                <SectionPanel title="Chat" className="game__chat">
                    <ChatPanel chatLog={view.chatLog} disabled={!canAct} onSend={(message) => actions.chat(message)} />
                </SectionPanel>

                <SectionPanel title="Inventory" className="game__items" scroll>
                    <ItemsPanel items={view.items} droppedItems={view.droppedItems} onUse={useItem} onPickUp={pickUp} />
                </SectionPanel>

                <SectionPanel title="Shop" className="game__shop">
                    <ShopPanel shop={view.shop} onBuy={buy} onClose={closeShop} />
                </SectionPanel>

                <SectionPanel title="Skills & effects" className="game__skills">
                    {trainedSkills.length === 0 ? (
                        <EmptyState title="No skills trained" message="Skill levels arrive after entering the world." />
                    ) : (
                        <ul className="chips">
                            {trainedSkills.map(({ skill, index }) => (
                                <li key={index} className="chip">
                                    Skill {index + 1} · rank {formatNumber(skill.rank)} · lv {formatNumber(skill.level)}
                                </li>
                            ))}
                        </ul>
                    )}
                    <h3 className="subhead">Active effects</h3>
                    {view.selfAffects.length === 0 ? (
                        <p className="muted">No active effects.</p>
                    ) : (
                        <ul className="chips">
                            {view.selfAffects.map((affect) => (
                                <li key={affect.affectType} className="chip">
                                    Affect #{affect.affectType} · {formatNumber(affect.duration)}s
                                </li>
                            ))}
                        </ul>
                    )}
                </SectionPanel>
            </div>

            <DebugPanel rawPackets={view.rawPackets} connectionEvents={view.connectionEvents} />
        </div>
    );
}
