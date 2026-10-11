import { expect } from 'chai';
import { EntityTypeEnum } from '@/core/enum/EntityTypeEnum';
import PacketHeaderEnum from '@/core/enum/PacketHeaderEnum';
import { parseServerPacket, ServerPacket, ShopEntry } from '@/client/protocol/ServerPackets';
import GameState, { EntityState } from '@/client/state/GameState';

import CharacterSpawnPacket from '@/core/interface/networking/packets/packet/out/CharacterSpawnPacket';
import CharacterInfoPacket from '@/core/interface/networking/packets/packet/out/CharacterInfoPacket';
import CharacterMoveOutPacket from '@/core/interface/networking/packets/packet/out/CharacterMoveOutPacket';
import CharacterDiedPacket from '@/core/interface/networking/packets/packet/out/CharacterDiedPacket';
import RemoveCharacterPacket from '@/core/interface/networking/packets/packet/out/RemoveCharacterPacket';
import ItemPacket from '@/core/interface/networking/packets/packet/out/ItemPacket';
import UpdateItemPacket from '@/core/interface/networking/packets/packet/out/UpdateItemPacket';
import ItemDroppedPacket from '@/core/interface/networking/packets/packet/out/ItemDroppedPacket';
import ItemDroppedHidePacket from '@/core/interface/networking/packets/packet/out/ItemDroppedHidePacket';
import EmpirePacket from '@/core/interface/networking/packets/packet/bidirectional/empire/EmpirePacket';
import CharacterDetailsPacket from '@/core/interface/networking/packets/packet/out/CharacterDetailsPacket';
import CharacterPointsPacket from '@/core/interface/networking/packets/packet/out/CharacterPointsPacket';
import CharacterPointChangePacket from '@/core/interface/networking/packets/packet/out/CharacterPointChangePacket';
import SkillLevelPacket from '@/core/interface/networking/packets/packet/out/SkillLevelPacket';
import GameTimePacket from '@/core/interface/networking/packets/packet/out/GameTimePacket';
import ChannelPacket from '@/core/interface/networking/packets/packet/out/ChannelPacket';
import AffectAddPacket from '@/core/interface/networking/packets/packet/out/AffectAddPacket';
import AffectRemovePacket from '@/core/interface/networking/packets/packet/out/AffectRemovePacket';

/** Build a decoded packet by packing a real out-packet and parsing it back. */
function decode(frame: Buffer): ServerPacket {
    return parseServerPacket(frame);
}

function shopPacket(subHeader: number, ownerVid: number, entries: ShopEntry[]): ServerPacket {
    return { type: 'shop', header: PacketHeaderEnum.SHOP_OUT, subHeader, ownerVid, pos: 0, entries };
}

function chatPacket(message: string): ServerPacket {
    return { type: 'chat', header: PacketHeaderEnum.CHAT_OUT, messageType: 0, vid: 1, empireId: 0, message };
}

describe('GameState', () => {
    it('tracks an entity through spawn, info, move, death and removal', () => {
        const state = new GameState();
        const added: EntityState[] = [];
        const removed: number[] = [];
        state.on('entityAdded', (entity) => added.push(entity));
        state.on('entityRemoved', (vid) => removed.push(vid));

        state.consume(
            decode(
                new CharacterSpawnPacket({
                    vid: 10,
                    rotation: 0,
                    positionX: 1,
                    positionY: 2,
                    positionZ: 3,
                    entityType: EntityTypeEnum.MONSTER,
                    playerClass: 101,
                    movementSpeed: 100,
                    attackSpeed: 80,
                    state: 0,
                    affects: [1, 2],
                }).pack(),
            ),
        );

        const spawned = state.getEntity(10);
        expect(spawned).to.exist;
        expect(spawned).to.include({ entityType: EntityTypeEnum.MONSTER, playerClass: 101, dead: false });
        expect(spawned?.affects).to.deep.equal([1, 2]);
        expect(added).to.have.lengthOf(1);

        state.consume(
            decode(
                new CharacterInfoPacket({
                    vid: 10,
                    playerName: 'Orc',
                    parts: [1, 2, 3, 4],
                    empireId: 1,
                    guildId: 0,
                    level: 5,
                    rankPoints: 0,
                    pkMode: 0,
                    mountId: 0,
                }).pack(),
            ),
        );
        expect(state.getEntity(10)?.name).to.equal('Orc');
        expect(state.getEntity(10)?.level).to.equal(5);

        state.consume(
            decode(
                new CharacterMoveOutPacket({
                    vid: 10,
                    movementType: 2,
                    arg: 0,
                    rotation: 90,
                    positionX: 50,
                    positionY: 60,
                    time: 1,
                    duration: 100,
                }).pack(),
            ),
        );
        expect(state.getEntity(10)?.positionX).to.equal(50);
        expect(state.getEntity(10)?.positionY).to.equal(60);

        state.consume(decode(new CharacterDiedPacket({ virtualId: 10 }).pack()));
        expect(state.getEntity(10)?.dead).to.equal(true);

        state.consume(decode(new RemoveCharacterPacket({ vid: 10 }).pack()));
        expect(state.getEntity(10)).to.equal(undefined);
        expect(removed).to.deep.equal([10]);
        expect(state.getEntities()).to.have.lengthOf(0);
    });

    it('tracks inventory items and dropped items', () => {
        const state = new GameState();
        const changed: Array<{ id: number }> = [];
        state.on('itemChanged', (item) => changed.push(item));

        state.consume(
            decode(
                new ItemPacket({
                    window: 1,
                    position: 3,
                    id: 1000,
                    count: 5,
                    flags: 0,
                    antiFlags: 0,
                    highlight: 0,
                    sockets: [1, 2, 3],
                }).pack(),
            ),
        );
        expect(state.getItem(1, 3)).to.include({ id: 1000, count: 5 });
        expect(state.getItem(1, 3)?.sockets).to.deep.equal([1, 2, 3]);

        state.consume(decode(new UpdateItemPacket({ window: 1, position: 3, count: 9, sockets: [4, 5, 6] }).pack()));
        expect(state.getItem(1, 3)?.id).to.equal(1000);
        expect(state.getItem(1, 3)?.count).to.equal(9);
        expect(changed).to.have.lengthOf(2);

        state.consume(
            decode(
                new ItemDroppedPacket({ id: 1000, positionX: 1, positionY: 2, positionZ: 0, virtualId: 0x6000 }).pack(),
            ),
        );
        expect(state.getDroppedItem(0x6000)).to.include({ id: 1000, positionX: 1, positionY: 2 });

        state.consume(decode(new ItemDroppedHidePacket({ virtualId: 0x6000 }).pack()));
        expect(state.getDroppedItem(0x6000)).to.equal(undefined);
    });

    it('tracks self, points, skills, time, channel and empire', () => {
        const state = new GameState();

        state.consume(decode(new EmpirePacket({ empireId: 2 }).pack()));
        expect(state.getEmpire()).to.equal(2);

        state.consume(
            decode(
                new CharacterDetailsPacket({
                    vid: 1,
                    playerClass: 2,
                    playerName: 'Hero',
                    positionX: 10,
                    positionY: 20,
                    positionZ: 0,
                    empireId: 2,
                    skillGroup: 1,
                }).pack(),
            ),
        );
        expect(state.getSelf()?.playerName).to.equal('Hero');

        const points = new CharacterPointsPacket();
        points.addPoint(5, 123);
        state.consume(decode(points.pack()));
        expect(state.getPoints()).to.have.lengthOf(255);
        expect(state.getPoint(5)).to.equal(123);

        state.consume(decode(new CharacterPointChangePacket({ vid: 1, type: 5, amount: 0, value: 999 }).pack()));
        expect(state.getPoint(5)).to.equal(999);

        const skills = Array.from({ length: 255 }, () => ({ rank: 0, level: 0, timeToNextRead: 0 }));
        skills[3] = { rank: 1, level: 20, timeToNextRead: 3600 };
        state.consume(decode(new SkillLevelPacket({ skills }).pack()));
        expect(state.getSkills()).to.have.lengthOf(255);
        expect(state.getSkills()[3]).to.deep.equal({ rank: 1, level: 20, timeToNextRead: 3600 });

        state.consume(decode(new GameTimePacket({ time: 1_700_000_000 }).pack()));
        expect(state.getTime()).to.equal(1_700_000_000);

        state.consume(decode(new ChannelPacket({ channel: 3 }).pack()));
        expect(state.getChannel()).to.equal(3);
    });

    it('appends to the chat log and caps it at 500 entries', () => {
        const state = new GameState();
        const seen: string[] = [];
        state.on('chat', (entry) => seen.push(entry.message));

        for (let index = 0; index < 505; index += 1) {
            state.consume(chatPacket(`m${index}`));
        }

        expect(state.getChatLog()).to.have.lengthOf(500);
        expect(state.getChatLog()[0].message).to.equal('m5');
        expect(state.getChatLog()[499].message).to.equal('m504');
        expect(seen).to.have.lengthOf(505);
    });

    it('tracks self affects from affect add and remove', () => {
        const state = new GameState();

        state.consume(
            decode(new AffectAddPacket({ type: 5, apply: 2, value: 10, flag: 1, duration: 60, manaCost: 3 }).pack()),
        );
        expect(state.getSelfAffects()).to.have.lengthOf(1);
        expect(state.getSelfAffects()[0]).to.include({ affectType: 5, apply: 2, value: 10, duration: 60 });

        state.consume(decode(new AffectRemovePacket({ type: 5, apply: 2 }).pack()));
        expect(state.getSelfAffects()).to.have.lengthOf(0);
    });

    it('opens, updates and closes the shop', () => {
        const state = new GameState();
        const shopEvents: Array<unknown> = [];
        state.on('shopChanged', (shop) => shopEvents.push(shop));

        const entry: ShopEntry = {
            pos: 1,
            vnum: 1000,
            price: 5,
            count: 1,
            displayPos: 1,
            sockets: [0, 0, 0],
            bonuses: [],
        };
        state.consume(shopPacket(0, 7, [entry]));
        expect(state.getShop()?.ownerVid).to.equal(7);
        expect(state.getShop()?.entries.get(1)).to.deep.equal(entry);

        state.consume(shopPacket(2, 0, [{ ...entry, vnum: 0 }]));
        expect(state.getShop()?.entries.has(1)).to.equal(false);

        state.consume(shopPacket(1, 0, []));
        expect(state.getShop()).to.equal(null);
        expect(shopEvents).to.have.lengthOf(3);
    });

    it('reset clears every tracked collection', () => {
        const state = new GameState();
        state.consume(chatPacket('hello'));
        state.consume(decode(new EmpirePacket({ empireId: 2 }).pack()));
        state.consume(decode(new GameTimePacket({ time: 5 }).pack()));
        state.setChannels([{ port: 13001, status: 1 }]);

        state.reset();

        expect(state.getChatLog()).to.have.lengthOf(0);
        expect(state.getEmpire()).to.equal(null);
        expect(state.getTime()).to.equal(null);
        expect(state.getChannels()).to.have.lengthOf(0);
        expect(state.getEntities()).to.have.lengthOf(0);
        expect(state.getItems()).to.have.lengthOf(0);
    });
});
