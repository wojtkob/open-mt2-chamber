import type { ReactNode } from 'react';
import type { SelfSummary } from '@/webclient/contract';
import { PointsEnum, playerClassLabel } from '../lib/enums';
import { formatClock, formatNumber, formatPlayTime } from '../lib/format';
import { StatBar } from './primitives';

export type HUDProps = {
    self: SelfSummary | null;
    points: number[];
    time: number | null;
    channel: number | null;
    empireId: number | null;
};

function point(points: number[], index: number): number {
    return points[index] ?? 0;
}

const EMPIRE_LABELS: Readonly<Record<number, string>> = { 1: 'Shinsoo', 2: 'Chunjo', 3: 'Jinno' };

/** The in-game heads-up display: identity, resources, experience and clock. */
export function HUD({ self, points, time, channel, empireId }: HUDProps): ReactNode {
    const hp = point(points, PointsEnum.HEALTH);
    const maxHp = point(points, PointsEnum.MAX_HEALTH);
    const mp = point(points, PointsEnum.MANA);
    const maxMp = point(points, PointsEnum.MAX_MANA);
    const stamina = point(points, PointsEnum.STAMINA);
    const maxStamina = point(points, PointsEnum.MAX_STAMINA);
    const gold = point(points, PointsEnum.GOLD);
    const level = point(points, PointsEnum.LEVEL) || (self !== null ? self.level : 0);
    const experience = point(points, PointsEnum.EXPERIENCE);
    const neededExperience = point(points, PointsEnum.NEEDED_EXPERIENCE);
    const playTime = point(points, PointsEnum.PLAY_TIME);
    const empire = empireId ?? self?.empireId ?? null;

    return (
        <div className="hud">
            <div className="hud__identity">
                <span className="hud__name">{self !== null ? self.playerName : 'Adventurer'}</span>
                <span className="hud__class">
                    {self !== null ? playerClassLabel(self.playerClass) : '—'} · Lv {formatNumber(level)}
                </span>
                <span className="hud__empire">
                    {empire !== null && empire in EMPIRE_LABELS ? EMPIRE_LABELS[empire] : 'No empire'}
                    {self !== null ? ` · (${self.positionX}, ${self.positionY})` : ''}
                </span>
            </div>

            <div className="hud__bars">
                <StatBar label="Health" value={hp} max={maxHp} tone="hp" />
                <StatBar label="Mana" value={mp} max={maxMp} tone="mp" />
                <StatBar label="Stamina" value={stamina} max={maxStamina} tone="st" />
            </div>

            <dl className="hud__facts">
                <div className="hud__fact">
                    <dt>Yang</dt>
                    <dd>{formatNumber(gold)}</dd>
                </div>
                <div className="hud__fact">
                    <dt>Channel</dt>
                    <dd>{channel !== null ? formatNumber(channel + 1) : '—'}</dd>
                </div>
                <div className="hud__fact">
                    <dt>Game time</dt>
                    <dd>{formatClock(time)}</dd>
                </div>
                <div className="hud__fact">
                    <dt>Played</dt>
                    <dd>{playTime > 0 ? formatPlayTime(playTime) : '—'}</dd>
                </div>
            </dl>

            <StatBar
                label={`Experience (to Lv ${formatNumber(level + 1)})`}
                value={experience}
                max={neededExperience}
                tone="exp"
            />
        </div>
    );
}
