/**
 * Enum values and human labels shared across the UI.
 *
 * The numeric enums are imported straight from the server's core (`@/core/enum`)
 * so the UI can never disagree with the protocol; only the display strings live
 * here.
 */

import { EntityTypeEnum } from '@/core/enum/EntityTypeEnum';
import { PointsEnum } from '@/core/enum/PointsEnum';
import { JobEnum } from '@/core/enum/JobEnum';
import { CONNECTION_STATE_NAMES } from '@/webclient/contract';

export { EntityTypeEnum, PointsEnum, JobEnum, CONNECTION_STATE_NAMES };

const JOB_BASE_NAMES: Readonly<Record<number, string>> = {
    [JobEnum.WARRIOR_MALE % 4]: 'Warrior',
    [JobEnum.ASSASSIN_MALE % 4]: 'Ninja',
    [JobEnum.SURA_MALE % 4]: 'Sura',
    [JobEnum.SHAMAN_MALE % 4]: 'Shaman',
};

/** `0` → `"Warrior (M)"`, `6` → `"Sura (F)"`, unknown → `"Class 42"`. */
export function playerClassLabel(playerClass: number): string {
    if (playerClass < 0 || playerClass > 7) return `Class ${playerClass}`;
    const base = JOB_BASE_NAMES[playerClass % 4] ?? `Class ${playerClass}`;
    const gender = playerClass >= 4 ? 'F' : 'M';
    return `${base} (${gender})`;
}

const ENTITY_TYPE_LABELS: Readonly<Record<number, string>> = {
    [EntityTypeEnum.MONSTER]: 'Monster',
    [EntityTypeEnum.NPC]: 'NPC',
    [EntityTypeEnum.METIN_STONE]: 'Metin stone',
    [EntityTypeEnum.PLAYER]: 'Player',
    [EntityTypeEnum.DROPPED_ITEM]: 'Ground item',
};

export function entityTypeLabel(entityType: number): string {
    return ENTITY_TYPE_LABELS[entityType] ?? `Entity ${entityType}`;
}

export function connectionStateLabel(state: number): string {
    return CONNECTION_STATE_NAMES[state] ?? `state ${state}`;
}

/** Point rows shown in the character detail panel, in protocol index order. */
export const CHARACTER_POINT_ROWS: readonly { index: number; label: string }[] = [
    { index: PointsEnum.LEVEL, label: 'Level' },
    { index: PointsEnum.EXPERIENCE, label: 'Experience' },
    { index: PointsEnum.NEEDED_EXPERIENCE, label: 'Exp. to next level' },
    { index: PointsEnum.ST, label: 'Strength' },
    { index: PointsEnum.HT, label: 'Dexterity' },
    { index: PointsEnum.DX, label: 'Constitution' },
    { index: PointsEnum.IQ, label: 'Intelligence' },
    { index: PointsEnum.GOLD, label: 'Yang' },
    { index: PointsEnum.ATTACK_GRADE, label: 'Attack grade' },
    { index: PointsEnum.DEFENSE_GRADE, label: 'Defence grade' },
    { index: PointsEnum.ATTACK_SPEED, label: 'Attack speed' },
    { index: PointsEnum.MOVE_SPEED, label: 'Move speed' },
];
