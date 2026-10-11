import { EntityTypeEnum } from '@/core/enum/EntityTypeEnum';
import TypedEventEmitter from '@/client/util/TypedEventEmitter';
import {
    CharacterDetailsServerPacket,
    ChannelStatus,
    ItemSnapshot,
    ServerPacket,
    ShopEntry,
    SkillInfo,
} from '@/client/protocol/ServerPackets';

/** A live entity (player, monster, npc, metin stone, dropped item) as the client knows it. */
export type EntityState = {
    vid: number;
    entityType: number;
    name: string;
    positionX: number;
    positionY: number;
    positionZ: number;
    rotation: number;
    playerClass: number;
    movementSpeed: number;
    attackSpeed: number;
    state: number;
    affects: number[];
    parts: number[];
    level: number;
    empireId: number;
    guildId: number;
    rankPoints: number;
    pkMode: number;
    mountId: number;
    dead: boolean;
    updatedAt: number;
};

/** A chat line the server broadcast. */
export type ChatEntry = {
    messageType: number;
    vid: number;
    empireId: number;
    message: string;
    receivedAt: number;
};

/** An open shop grid. */
export type ShopState = {
    ownerVid: number;
    entries: Map<number, ShopEntry>;
};

/** An active effect on the local player (GC_AFFECT_ADD has no victim vid). */
export type SelfAffect = {
    affectType: number;
    apply: number;
    value: number;
    flag: number;
    duration: number;
    manaCost: number;
    addedAt: number;
};

export type GameStateEvents = {
    entityAdded: (entity: EntityState) => void;
    entityUpdated: (entity: EntityState) => void;
    entityRemoved: (vid: number) => void;
    itemChanged: (item: ItemSnapshot) => void;
    chat: (entry: ChatEntry) => void;
    pointsChanged: (points: number[]) => void;
    skillsChanged: (skills: SkillInfo[]) => void;
    gameTime: (time: number) => void;
    channel: (channel: number) => void;
    shopChanged: (shop: ShopState | null) => void;
};

const MAX_CHAT_LOG = 500;

/**
 * A passive, in-memory model of the world the game server describes.
 *
 * Feed it every decoded packet (`consume`); it keeps entities, the player's
 * points/skills, the inventory, the open shop and the chat log up to date and
 * announces each change through typed events. It never talks to the socket, so
 * it is trivially unit-testable.
 */
export default class GameState extends TypedEventEmitter<GameStateEvents> {
    private readonly entitiesByVid = new Map<number, EntityState>();
    private readonly items = new Map<string, ItemSnapshot>();
    private readonly droppedItems = new Map<
        number,
        { vid: number; id: number; positionX: number; positionY: number; positionZ: number }
    >();
    private readonly chatEntries: ChatEntry[] = [];
    private points: number[] = [];
    private skills: SkillInfo[] = [];
    private time: number | null = null;
    private currentChannel: number | null = null;
    private empire: number | null = null;
    private self: CharacterDetailsServerPacket | null = null;
    private selectedSlot: number | null = null;
    private shop: ShopState | null = null;
    private readonly selfAffects = new Map<number, SelfAffect>();
    private channels: ChannelStatus[] = [];

    /** Apply one decoded server packet to the model. */
    consume(packet: ServerPacket): void {
        const now = Date.now();

        switch (packet.type) {
            case 'characterSpawn':
                this.upsertEntity(
                    {
                        vid: packet.vid,
                        entityType: packet.entityType,
                        name: this.entitiesByVid.get(packet.vid)?.name ?? '',
                        positionX: packet.positionX,
                        positionY: packet.positionY,
                        positionZ: packet.positionZ,
                        rotation: packet.rotation,
                        playerClass: packet.playerClass,
                        movementSpeed: packet.movementSpeed,
                        attackSpeed: packet.attackSpeed,
                        state: packet.state,
                        affects: packet.affects,
                        parts: this.entitiesByVid.get(packet.vid)?.parts ?? [],
                        level: 0,
                        empireId: 0,
                        guildId: 0,
                        rankPoints: 0,
                        pkMode: 0,
                        mountId: 0,
                        dead: false,
                        updatedAt: now,
                    },
                    true,
                );
                break;

            case 'characterInfo': {
                const entity = this.ensureEntity(packet.vid, now);
                entity.name = packet.playerName;
                entity.parts = packet.parts;
                entity.empireId = packet.empireId;
                entity.guildId = packet.guildId;
                entity.level = packet.level;
                entity.rankPoints = packet.rankPoints;
                entity.pkMode = packet.pkMode;
                entity.mountId = packet.mountId;
                this.upsertEntity(entity, false);
                break;
            }

            case 'characterUpdate': {
                const entity = this.ensureEntity(packet.vid, now);
                entity.parts = packet.parts;
                entity.movementSpeed = packet.moveSpeed;
                entity.attackSpeed = packet.attackSpeed;
                entity.state = packet.state;
                entity.affects = packet.affects;
                entity.guildId = packet.guildId;
                entity.rankPoints = packet.rankPoints;
                entity.pkMode = packet.pkMode;
                entity.mountId = packet.mountVnum;
                this.upsertEntity(entity, false);
                break;
            }

            case 'characterMove': {
                const entity = this.entitiesByVid.get(packet.vid);
                if (!entity) break;
                entity.positionX = packet.positionX;
                entity.positionY = packet.positionY;
                entity.rotation = packet.rotation;
                entity.state = packet.movementType;
                entity.updatedAt = now;
                this.emit('entityUpdated', entity);
                break;
            }

            case 'syncPosition':
                for (const position of packet.positions) {
                    const entity = this.entitiesByVid.get(position.vid);
                    if (!entity) continue;
                    entity.positionX = position.positionX;
                    entity.positionY = position.positionY;
                    entity.updatedAt = now;
                    this.emit('entityUpdated', entity);
                }
                break;

            case 'removeCharacter':
                if (this.entitiesByVid.delete(packet.vid)) {
                    this.emit('entityRemoved', packet.vid);
                }
                break;

            case 'characterDied': {
                const entity = this.entitiesByVid.get(packet.vid);
                if (!entity) break;
                entity.dead = true;
                entity.updatedAt = now;
                this.emit('entityUpdated', entity);
                break;
            }

            case 'item': {
                const item = packet.item;
                this.items.set(this.itemKey(item.window, item.position), item);
                this.emit('itemChanged', item);
                break;
            }

            case 'itemUpdate': {
                const key = this.itemKey(packet.window, packet.position);
                const previous = this.items.get(key);
                const item: ItemSnapshot = {
                    window: packet.window,
                    position: packet.position,
                    id: previous?.id ?? 0,
                    count: packet.count,
                    sockets: packet.sockets,
                    bonuses: packet.bonuses,
                };
                this.items.set(key, item);
                this.emit('itemChanged', item);
                break;
            }

            case 'itemDropped':
                this.droppedItems.set(packet.vid, {
                    vid: packet.vid,
                    id: packet.id,
                    positionX: packet.positionX,
                    positionY: packet.positionY,
                    positionZ: packet.positionZ,
                });
                break;

            case 'itemDroppedHide':
                this.droppedItems.delete(packet.vid);
                break;

            case 'characterDetails':
                this.self = packet;
                break;

            case 'characterPoints':
                this.points = packet.points;
                this.emit('pointsChanged', this.points);
                break;

            case 'characterPointChange':
                this.points[packet.pointType] = packet.value;
                this.emit('pointsChanged', this.points);
                break;

            case 'skillLevel':
                this.skills = packet.skills;
                this.emit('skillsChanged', this.skills);
                break;

            case 'gameTime':
                this.time = packet.time;
                this.emit('gameTime', packet.time);
                break;

            case 'channel':
                this.currentChannel = packet.channel;
                this.emit('channel', packet.channel);
                break;

            case 'empire':
                this.empire = packet.empireId;
                break;

            case 'chat': {
                const entry: ChatEntry = {
                    messageType: packet.messageType,
                    vid: packet.vid,
                    empireId: packet.empireId,
                    message: packet.message,
                    receivedAt: now,
                };
                this.chatEntries.push(entry);
                if (this.chatEntries.length > MAX_CHAT_LOG) {
                    this.chatEntries.shift();
                }
                this.emit('chat', entry);
                break;
            }

            case 'affectAdd':
                // GC_AFFECT_ADD carries no victim vid: it always describes an
                // effect on the local player, so it is tracked per affect type.
                this.selfAffects.set(packet.affectType, {
                    affectType: packet.affectType,
                    apply: packet.apply,
                    value: packet.value,
                    flag: packet.flag,
                    duration: packet.duration,
                    manaCost: packet.manaCost,
                    addedAt: now,
                });
                break;

            case 'affectRemove':
                this.selfAffects.delete(packet.affectType);
                break;

            case 'shop':
                this.applyShop(packet.subHeader, packet.ownerVid, packet.entries);
                break;

            default:
                break;
        }
    }

    /** Forget everything (e.g. on disconnect). */
    reset(): void {
        this.entitiesByVid.clear();
        this.items.clear();
        this.droppedItems.clear();
        this.chatEntries.length = 0;
        this.points = [];
        this.skills = [];
        this.time = null;
        this.currentChannel = null;
        this.empire = null;
        this.self = null;
        this.selectedSlot = null;
        this.shop = null;
        this.selfAffects.clear();
        this.channels = [];
    }

    getEntity(vid: number): EntityState | undefined {
        return this.entitiesByVid.get(vid);
    }

    getEntities(): EntityState[] {
        return [...this.entitiesByVid.values()];
    }

    getPlayers(): EntityState[] {
        return this.getEntities().filter((entity) => entity.entityType === EntityTypeEnum.PLAYER);
    }

    getItem(window: number, position: number): ItemSnapshot | undefined {
        return this.items.get(this.itemKey(window, position));
    }

    getItems(): ItemSnapshot[] {
        return [...this.items.values()];
    }

    getDroppedItem(vid: number) {
        return this.droppedItems.get(vid);
    }

    getPoints(): number[] {
        return this.points;
    }

    getPoint(index: number): number {
        return this.points[index] ?? 0;
    }

    getSkills(): SkillInfo[] {
        return this.skills;
    }

    getTime(): number | null {
        return this.time;
    }

    getChannel(): number | null {
        return this.currentChannel;
    }

    getEmpire(): number | null {
        return this.empire;
    }

    getSelf(): CharacterDetailsServerPacket | null {
        return this.self;
    }

    getSelectedSlot(): number | null {
        return this.selectedSlot;
    }

    setSelectedSlot(slot: number): void {
        this.selectedSlot = slot;
    }

    getShop(): ShopState | null {
        return this.shop;
    }

    getChatLog(): ChatEntry[] {
        return this.chatEntries;
    }

    getChannels(): ChannelStatus[] {
        return this.channels;
    }

    setChannels(channels: ChannelStatus[]): void {
        this.channels = channels;
    }

    getSelfAffects(): SelfAffect[] {
        return [...this.selfAffects.values()];
    }

    private applyShop(subHeader: number, ownerVid: number, entries: ShopEntry[]): void {
        if (ownerVid !== 0 || subHeader === 0) {
            this.shop = { ownerVid, entries: new Map() };
        }
        if (!this.shop) return;

        for (const entry of entries) {
            if (entry.vnum === 0) {
                this.shop.entries.delete(entry.pos);
            } else {
                this.shop.entries.set(entry.pos, entry);
            }
        }

        if (subHeader === 1) {
            this.shop = null;
        }

        this.emit('shopChanged', this.shop);
    }

    private ensureEntity(vid: number, now: number): EntityState {
        const existing = this.entitiesByVid.get(vid);
        if (existing) return existing;
        return {
            vid,
            entityType: EntityTypeEnum.PLAYER,
            name: '',
            positionX: 0,
            positionY: 0,
            positionZ: 0,
            rotation: 0,
            playerClass: 0,
            movementSpeed: 0,
            attackSpeed: 0,
            state: 0,
            affects: [],
            parts: [],
            level: 0,
            empireId: 0,
            guildId: 0,
            rankPoints: 0,
            pkMode: 0,
            mountId: 0,
            dead: false,
            updatedAt: now,
        };
    }

    private upsertEntity(entity: EntityState, isNew: boolean): void {
        const existed = this.entitiesByVid.has(entity.vid);
        this.entitiesByVid.set(entity.vid, entity);
        this.emit(existed || !isNew ? 'entityUpdated' : 'entityAdded', entity);
    }

    private itemKey(window: number, position: number): string {
        return `${window}:${position}`;
    }
}
