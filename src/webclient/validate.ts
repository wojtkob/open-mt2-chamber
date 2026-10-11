/**
 * Runtime validation of HTTP request bodies for the web client bridge.
 *
 * Every endpoint decodes its JSON body to `unknown` first, then funnels it
 * through the parsers below — there is no `any` and no implicit trust of the
 * wire. A malformed body raises a `SessionError` with code `INVALID_ARGUMENT`,
 * which the bridge turns into a 400 response.
 */

import { SessionError } from './session/VisualSession';
import type {
    AddFlyTargetVerbRequest,
    AimFlyTargetVerbRequest,
    AnswerQuestVerbRequest,
    AttackVerbRequest,
    BuyShopItemVerbRequest,
    ChatRequest,
    ClickVerbRequest,
    CloseShopVerbRequest,
    DropItemVerbRequest,
    LoginRequest,
    MoveItemVerbRequest,
    MoveVerbRequest,
    PickUpVerbRequest,
    PressQuestButtonVerbRequest,
    QuickSlotAddVerbRequest,
    QuickSlotRemoveVerbRequest,
    QuickSlotSwapVerbRequest,
    SelectRequest,
    SellShopItemVerbRequest,
    SellShopItemsVerbRequest,
    ShootVerbRequest,
    TargetVerbRequest,
    UseItemVerbRequest,
    UseSkillVerbRequest,
    VerbRequest,
} from './contract';

type JsonRecord = Record<string, unknown>;

function invalid(message: string): never {
    throw new SessionError(message, 'INVALID_ARGUMENT');
}

function asRecord(value: unknown, what: string): JsonRecord {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        invalid(`Expected ${what} to be a JSON object`);
    }
    return value as JsonRecord;
}

function asString(value: unknown, what: string): string {
    if (typeof value !== 'string') invalid(`Expected ${what} to be a non-empty string`);
    if (value.length === 0) invalid(`Expected ${what} to be a non-empty string`);
    return value;
}

function asInt(value: unknown, what: string): number {
    if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
        invalid(`Expected ${what} to be an integer`);
    }
    return value;
}

function asOptionalInt(value: unknown, what: string): number | undefined {
    if (value === undefined) return undefined;
    return asInt(value, what);
}

function asPort(value: unknown, what: string): number {
    const port = asInt(value, what);
    if (port < 1 || port > 65_535) invalid(`Expected ${what} to be a valid TCP port`);
    return port;
}

function asOptionalPort(value: unknown, what: string): number | undefined {
    if (value === undefined) return undefined;
    return asPort(value, what);
}

function asOptionalHost(value: unknown, what: string): string | undefined {
    if (value === undefined) return undefined;
    return asString(value, what);
}

function asSlot(value: unknown): number {
    const slot = asInt(value, 'slot');
    if (slot < 0 || slot > 3) invalid(`Expected slot to be between 0 and 3`);
    return slot;
}

export function parseLoginRequest(body: unknown): LoginRequest {
    const record = asRecord(body, 'login request');
    const username = asString(record.username, 'username');
    if (username.trim().length === 0) invalid('Expected username to not be blank');
    return {
        username,
        password: typeof record.password === 'string' ? record.password : invalid('Expected password to be a string'),
        authHost: asOptionalHost(record.authHost, 'authHost'),
        authPort: asOptionalPort(record.authPort, 'authPort'),
        gameHost: asOptionalHost(record.gameHost, 'gameHost'),
        gamePort: asOptionalPort(record.gamePort, 'gamePort'),
        host: asOptionalHost(record.host, 'host'),
        port: asOptionalPort(record.port, 'port'),
        timeoutMs: asOptionalInt(record.timeoutMs, 'timeoutMs'),
    };
}

export function parseSelectRequest(body: unknown): SelectRequest {
    const record = asRecord(body, 'select request');
    return { slot: asSlot(record.slot) };
}

export function parseChatRequest(body: unknown): ChatRequest {
    const record = asRecord(body, 'chat request');
    const message = asString(record.message, 'message').trim();
    if (message.length === 0) invalid('Expected message to not be blank');
    return { message, messageType: asOptionalInt(record.messageType, 'messageType') };
}

export function parseVerbRequest(body: unknown): VerbRequest {
    const record = asRecord(body, 'verb request');
    const verb = asString(record.verb, 'verb');
    switch (verb) {
        case 'move': {
            const result: MoveVerbRequest = {
                verb: 'move',
                movementType: asInt(record.movementType, 'movementType'),
                arg: asInt(record.arg, 'arg'),
                rotation: asInt(record.rotation, 'rotation'),
                positionX: asInt(record.positionX, 'positionX'),
                positionY: asInt(record.positionY, 'positionY'),
                time: asInt(record.time, 'time'),
            };
            return result;
        }
        case 'target': {
            const result: TargetVerbRequest = {
                verb: 'target',
                targetVirtualId: asInt(record.targetVirtualId, 'targetVirtualId'),
            };
            return result;
        }
        case 'attack': {
            const result: AttackVerbRequest = {
                verb: 'attack',
                skillVnum: asOptionalInt(record.skillVnum, 'skillVnum'),
                victimVirtualId: asInt(record.victimVirtualId, 'victimVirtualId'),
            };
            return result;
        }
        case 'useSkill': {
            const result: UseSkillVerbRequest = {
                verb: 'useSkill',
                skillNum: asInt(record.skillNum, 'skillNum'),
                targetVirtualId: asInt(record.targetVirtualId, 'targetVirtualId'),
            };
            return result;
        }
        case 'useItem': {
            const result: UseItemVerbRequest = {
                verb: 'useItem',
                window: asInt(record.window, 'window'),
                position: asInt(record.position, 'position'),
            };
            return result;
        }
        case 'moveItem': {
            const result: MoveItemVerbRequest = {
                verb: 'moveItem',
                fromWindow: asInt(record.fromWindow, 'fromWindow'),
                fromPosition: asInt(record.fromPosition, 'fromPosition'),
                toWindow: asInt(record.toWindow, 'toWindow'),
                toPosition: asInt(record.toPosition, 'toPosition'),
                count: asInt(record.count, 'count'),
            };
            return result;
        }
        case 'dropItem': {
            const result: DropItemVerbRequest = {
                verb: 'dropItem',
                window: asInt(record.window, 'window'),
                position: asInt(record.position, 'position'),
                gold: asInt(record.gold, 'gold'),
                count: asInt(record.count, 'count'),
            };
            return result;
        }
        case 'pickUp': {
            const result: PickUpVerbRequest = { verb: 'pickUp', virtualId: asInt(record.virtualId, 'virtualId') };
            return result;
        }
        case 'click': {
            const result: ClickVerbRequest = {
                verb: 'click',
                targetVirtualId: asInt(record.targetVirtualId, 'targetVirtualId'),
            };
            return result;
        }
        case 'answerQuest': {
            const result: AnswerQuestVerbRequest = { verb: 'answerQuest', answer: asInt(record.answer, 'answer') };
            return result;
        }
        case 'pressQuestButton': {
            const result: PressQuestButtonVerbRequest = {
                verb: 'pressQuestButton',
                questId: asInt(record.questId, 'questId'),
            };
            return result;
        }
        case 'quickSlotAdd': {
            const result: QuickSlotAddVerbRequest = {
                verb: 'quickSlotAdd',
                slot: asInt(record.slot, 'slot'),
                type: asInt(record.type, 'type'),
                position: asInt(record.position, 'position'),
            };
            return result;
        }
        case 'quickSlotSwap': {
            const result: QuickSlotSwapVerbRequest = {
                verb: 'quickSlotSwap',
                slotA: asInt(record.slotA, 'slotA'),
                slotB: asInt(record.slotB, 'slotB'),
            };
            return result;
        }
        case 'quickSlotRemove': {
            const result: QuickSlotRemoveVerbRequest = { verb: 'quickSlotRemove', slot: asInt(record.slot, 'slot') };
            return result;
        }
        case 'aimFlyTarget': {
            const result: AimFlyTargetVerbRequest = {
                verb: 'aimFlyTarget',
                targetVirtualId: asInt(record.targetVirtualId, 'targetVirtualId'),
                positionX: asInt(record.positionX, 'positionX'),
                positionY: asInt(record.positionY, 'positionY'),
            };
            return result;
        }
        case 'addFlyTarget': {
            const result: AddFlyTargetVerbRequest = {
                verb: 'addFlyTarget',
                targetVirtualId: asInt(record.targetVirtualId, 'targetVirtualId'),
                positionX: asInt(record.positionX, 'positionX'),
                positionY: asInt(record.positionY, 'positionY'),
            };
            return result;
        }
        case 'shoot': {
            const result: ShootVerbRequest = { verb: 'shoot', type: asInt(record.type, 'type') };
            return result;
        }
        case 'buyShopItem': {
            const result: BuyShopItemVerbRequest = { verb: 'buyShopItem', pos: asInt(record.pos, 'pos') };
            return result;
        }
        case 'sellShopItem': {
            const result: SellShopItemVerbRequest = { verb: 'sellShopItem', pos: asInt(record.pos, 'pos') };
            return result;
        }
        case 'sellShopItems': {
            const result: SellShopItemsVerbRequest = {
                verb: 'sellShopItems',
                pos: asInt(record.pos, 'pos'),
                count: asInt(record.count, 'count'),
            };
            return result;
        }
        case 'closeShop': {
            const result: CloseShopVerbRequest = { verb: 'closeShop' };
            return result;
        }
        default:
            invalid(`Unknown verb '${verb}'`);
    }
}
