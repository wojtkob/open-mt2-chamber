import { expect } from 'chai';
import PacketHeaderEnum from '@/core/enum/PacketHeaderEnum';
import { ConnectionStateEnum } from '@/core/enum/ConnectionStateEnum';
import { ChatMessageTypeEnum } from '@/core/enum/ChatMessageTypeEnum';
import { EntityTypeEnum } from '@/core/enum/EntityTypeEnum';
import { QuickSlotTypeEnum } from '@/core/enum/QuickSlotTypeEnum';
import { ShopSubHeaderGC } from '@/core/enum/ShopSubHeaderEnum';
import { QuestFlagEnum } from '@/core/enum/QuestSendFlagEnum';
import { parseServerPacket } from '@/client/protocol/ServerPackets';
import { ProtocolError } from '@/client/errors';

import HandshakePacket from '@/core/interface/networking/packets/packet/bidirectional/handshake/HandshakePacket';
import EmpirePacket from '@/core/interface/networking/packets/packet/bidirectional/empire/EmpirePacket';

import ConnectionStatePacket from '@/core/interface/networking/packets/packet/out/ConnectionStatePacket';
import PingPacket from '@/core/interface/networking/packets/packet/out/PingPacket';
import InternalPongPacket from '@/core/interface/networking/packets/packet/out/InternalPongPacket';
import LoginSuccessPacket from '@/core/interface/networking/packets/packet/out/LoginSuccessPacket';
import LoginFailedPacket from '@/core/interface/networking/packets/packet/out/LoginFailedPacket';
import ServerStatusPacket from '@/core/interface/networking/packets/packet/out/ServerStatusPacket';
import CharactersInfoPacket from '@/core/interface/networking/packets/packet/out/CharactersInfoPacket';
import CharacterDetailsPacket from '@/core/interface/networking/packets/packet/out/CharacterDetailsPacket';
import CharacterPointsPacket from '@/core/interface/networking/packets/packet/out/CharacterPointsPacket';
import CharacterPointChangePacket from '@/core/interface/networking/packets/packet/out/CharacterPointChangePacket';
import SkillLevelPacket from '@/core/interface/networking/packets/packet/out/SkillLevelPacket';
import GameTimePacket from '@/core/interface/networking/packets/packet/out/GameTimePacket';
import ChannelPacket from '@/core/interface/networking/packets/packet/out/ChannelPacket';
import SetSkillGroupPacket from '@/core/interface/networking/packets/packet/out/SetSkillGroupPacket';
import CreateCharacterSuccessPacket from '@/core/interface/networking/packets/packet/out/CreateCharacterSuccessPacket';
import CreateCharacterFailurePacket from '@/core/interface/networking/packets/packet/out/CreateCharacterFailurePacket';
import DeleteCharacterSuccessPacket from '@/core/interface/networking/packets/packet/out/DeleteCharacterSuccessPacket';
import DeleteCharacterFailurePacket from '@/core/interface/networking/packets/packet/out/DeleteCharacterFailurePacket';
import CharacterSpawnPacket from '@/core/interface/networking/packets/packet/out/CharacterSpawnPacket';
import CharacterInfoPacket from '@/core/interface/networking/packets/packet/out/CharacterInfoPacket';
import CharacterUpdatePacket from '@/core/interface/networking/packets/packet/out/CharacterUpdatePacket';
import CharacterMoveOutPacket from '@/core/interface/networking/packets/packet/out/CharacterMoveOutPacket';
import SyncPositionPacket from '@/core/interface/networking/packets/packet/out/SyncPositionPacket';
import RemoveCharacterPacket from '@/core/interface/networking/packets/packet/out/RemoveCharacterPacket';
import ChatOutPacket from '@/core/interface/networking/packets/packet/out/ChatOutPacket';
import CharacterDiedPacket from '@/core/interface/networking/packets/packet/out/CharacterDiedPacket';
import TargetUpdatedPacket from '@/core/interface/networking/packets/packet/out/TargetUpdatePacket';
import DamagePacket from '@/core/interface/networking/packets/packet/out/DamagePacket';
import TeleportPacket from '@/core/interface/networking/packets/packet/out/TeleportPacket';
import ItemPacket from '@/core/interface/networking/packets/packet/out/ItemPacket';
import UpdateItemPacket from '@/core/interface/networking/packets/packet/out/UpdateItemPacket';
import ItemDroppedPacket from '@/core/interface/networking/packets/packet/out/ItemDroppedPacket';
import ItemDroppedHidePacket from '@/core/interface/networking/packets/packet/out/ItemDroppedHidePacket';
import SetItemOwnershipPacket from '@/core/interface/networking/packets/packet/out/SetItemOwnershipPacket';
import AffectAddPacket from '@/core/interface/networking/packets/packet/out/AffectAddPacket';
import AffectRemovePacket from '@/core/interface/networking/packets/packet/out/AffectRemovePacket';
import SpecialEffectPacket from '@/core/interface/networking/packets/packet/out/SpecialEffectPacket';
import FlyPacket from '@/core/interface/networking/packets/packet/out/FlyPacket';
import FlyTargetingPacket from '@/core/interface/networking/packets/packet/out/FlyTargetingPacket';
import QuickSlotAddResponsePacket from '@/core/interface/networking/packets/packet/out/QuickSlotAddResponsePacket';
import QuickSlotRemoveResponsePacket from '@/core/interface/networking/packets/packet/out/QuickSlotRemoveResponsePacket';
import QuickSlotSwapResponsePacket from '@/core/interface/networking/packets/packet/out/QuickSlotSwapResponsePacket';
import ShopStartPacket from '@/core/interface/networking/packets/packet/out/ShopStartPacket';
import ShopUpdateItemPacket from '@/core/interface/networking/packets/packet/out/ShopUpdateItemPacket';
import ShopEndPacket from '@/core/interface/networking/packets/packet/out/ShopEndPacket';
import ShopResultPacket from '@/core/interface/networking/packets/packet/out/ShopResultPacket';
import ShopSignPacket from '@/core/interface/networking/packets/packet/out/ShopSignPacket';
import QuestScriptPacket from '@/core/interface/networking/packets/packet/out/QuestScriptPacket';
import QuestInfoPacket from '@/core/interface/networking/packets/packet/out/QuestInfoPacket';
import QuestTargetCreatePacket from '@/core/interface/networking/packets/packet/out/QuestTargetCreatePacket';
import QuestTargetRemovePacket from '@/core/interface/networking/packets/packet/out/QuestTargetRemovePacket';

/**
 * Each case packs a core `out/*` packet and decodes it with `parseServerPacket`,
 * asserting the client reads back exactly the fields the server wrote. If an
 * `out` packet changes layout, this test fails before a live client would
 * silently desynchronize its stream.
 */
describe('parseServerPacket', () => {
    it('decodes connection state', () => {
        const packet = parseServerPacket(new ConnectionStatePacket({ state: ConnectionStateEnum.GAME }).pack());
        expect(packet).to.include({ type: 'connectionState', state: ConnectionStateEnum.GAME });
    });

    it('decodes the handshake id/time/delta', () => {
        const packet = parseServerPacket(new HandshakePacket({ id: 0x11223344, time: 111, delta: 5 }).pack());
        expect(packet).to.include({ type: 'handshake', id: 0x11223344, time: 111, delta: 5 });
    });

    it('decodes a keepalive ping', () => {
        expect(parseServerPacket(new PingPacket().pack())).to.include({ type: 'ping', header: PacketHeaderEnum.PING });
    });

    it('decodes the internal pong echo time', () => {
        const packet = parseServerPacket(new InternalPongPacket({ time: 0xdeadbeef }).pack());
        expect(packet).to.include({ type: 'internalPong', time: 0xdeadbeef });
    });

    it('decodes login success key and result', () => {
        const packet = parseServerPacket(new LoginSuccessPacket({ key: 4242, result: 1 }).pack());
        expect(packet).to.include({ type: 'loginSuccess', key: 4242, result: 1 });
    });

    it('decodes the login failure status text', () => {
        const packet = parseServerPacket(new LoginFailedPacket({ status: 'WRONGPWD' }).pack());
        expect(packet).to.include({ type: 'loginFailed', status: 'WRONGPWD' });
    });

    it('decodes the channel status list', () => {
        const packet = parseServerPacket(
            new ServerStatusPacket({ status: [{ port: 13001, status: 1 }], isSuccess: true }).pack(),
        );
        expect(packet).to.include({ type: 'serverStatus', success: true });
        if (packet.type === 'serverStatus') {
            expect(packet.channels).to.deep.equal([{ port: 13001, status: 1 }]);
        }
    });

    it('decodes the empire id', () => {
        expect(parseServerPacket(new EmpirePacket({ empireId: 2 }).pack())).to.include({
            type: 'empire',
            empireId: 2,
        });
    });

    it('decodes the character list block plus its guild fields', () => {
        const source = new CharactersInfoPacket();
        source.addCharacter(
            0,
            {
                id: 100,
                name: 'Hero',
                playerClass: 3,
                level: 10,
                playTime: 60,
                st: 5,
                ht: 6,
                dx: 7,
                iq: 8,
                bodyPart: 1,
                nameChange: 0,
                hairPart: 2,
                positionX: 1000,
                positionY: 2000,
                ip: 0x7f000001,
                port: 13001,
                skillGroup: 1,
            },
            77,
            'Guild',
        );

        const packet = parseServerPacket(source.pack());
        expect(packet.type).to.equal('charactersList');
        if (packet.type !== 'charactersList') return;

        expect(packet.characters).to.have.lengthOf(4);
        expect(packet.characters[0]).to.include({
            slot: 0,
            id: 100,
            name: 'Hero',
            playerClass: 3,
            level: 10,
            bodyPart: 1,
            hairPart: 2,
            positionX: 1000,
            positionY: 2000,
            port: 13001,
            guildId: 77,
            guildName: 'Guild',
        });
        expect(packet.characters[1].id).to.equal(0);
    });

    it('decodes the selected character details', () => {
        const packet = parseServerPacket(
            new CharacterDetailsPacket({
                vid: 0x40000001,
                playerClass: 2,
                playerName: 'Hero',
                positionX: 100,
                positionY: 200,
                positionZ: 0,
                empireId: 1,
                skillGroup: 3,
            }).pack(),
        );
        expect(packet).to.include({
            type: 'characterDetails',
            vid: 0x40000001,
            playerClass: 2,
            playerName: 'Hero',
            positionX: 100,
            positionY: 200,
            positionZ: 0,
            empireId: 1,
            skillGroup: 3,
        });
    });

    it('decodes the 255 character points', () => {
        const source = new CharacterPointsPacket();
        source.addPoint(5, 123);
        const packet = parseServerPacket(source.pack());
        expect(packet.type).to.equal('characterPoints');
        if (packet.type !== 'characterPoints') return;
        expect(packet.points).to.have.lengthOf(255);
        expect(packet.points[5]).to.equal(123);
        expect(packet.points[0]).to.equal(0);
    });

    it('decodes a single character point change', () => {
        const packet = parseServerPacket(
            new CharacterPointChangePacket({ vid: 42, type: 9, amount: -3, value: 17 }).pack(),
        );
        expect(packet).to.include({ type: 'characterPointChange', vid: 42, pointType: 9, amount: -3, value: 17 });
    });

    it('decodes the 255 skill levels', () => {
        const skills = Array.from({ length: 255 }, () => ({ rank: 0, level: 0, timeToNextRead: 0 }));
        skills[3] = { rank: 1, level: 20, timeToNextRead: 3600 };
        const packet = parseServerPacket(new SkillLevelPacket({ skills }).pack());
        expect(packet.type).to.equal('skillLevel');
        if (packet.type !== 'skillLevel') return;
        expect(packet.skills).to.have.lengthOf(255);
        expect(packet.skills[3]).to.deep.equal({ rank: 1, level: 20, timeToNextRead: 3600 });
    });

    it('decodes game time, channel and skill group', () => {
        expect(parseServerPacket(new GameTimePacket({ time: 1700000000 }).pack())).to.include({
            type: 'gameTime',
            time: 1700000000,
        });
        expect(parseServerPacket(new ChannelPacket({ channel: 4 }).pack())).to.include({ type: 'channel', channel: 4 });
        expect(parseServerPacket(new SetSkillGroupPacket({ skillGroup: 2 }).pack())).to.include({
            type: 'setSkillGroup',
            skillGroup: 2,
        });
    });

    it('decodes character create/delete results', () => {
        const created = parseServerPacket(
            new CreateCharacterSuccessPacket({
                slot: 1,
                character: {
                    id: 9,
                    name: 'New',
                    playerClass: 1,
                    level: 1,
                    playTime: 0,
                    st: 0,
                    ht: 0,
                    dx: 0,
                    iq: 0,
                    bodyPart: 0,
                    nameChange: 0,
                    hairPart: 0,
                    positionX: 0,
                    positionY: 0,
                    ip: 0,
                    port: 0,
                    skillGroup: 0,
                },
            }).pack(),
        );
        expect(created.type).to.equal('createCharacterSuccess');
        if (created.type === 'createCharacterSuccess') {
            expect(created.slot).to.equal(1);
            expect(created.character.name).to.equal('New');
            expect(created.character.id).to.equal(9);
        }

        expect(parseServerPacket(new CreateCharacterFailurePacket({ reason: 3 }).pack())).to.include({
            type: 'createCharacterFailure',
            reason: 3,
        });
        expect(parseServerPacket(new DeleteCharacterSuccessPacket({ slot: 2 }).pack())).to.include({
            type: 'deleteCharacterSuccess',
            slot: 2,
        });
        expect(parseServerPacket(new DeleteCharacterFailurePacket().pack())).to.include({
            type: 'deleteCharacterFailure',
        });
    });

    it('decodes a character spawn', () => {
        const packet = parseServerPacket(
            new CharacterSpawnPacket({
                vid: 0x5000,
                rotation: 45.5,
                positionX: 10,
                positionY: 20,
                positionZ: 0,
                entityType: EntityTypeEnum.MONSTER,
                playerClass: 101,
                movementSpeed: 120,
                attackSpeed: 90,
                state: 0,
                affects: [1, 2],
            }).pack(),
        );
        expect(packet).to.include({
            type: 'characterSpawn',
            vid: 0x5000,
            rotation: 45.5,
            entityType: EntityTypeEnum.MONSTER,
            playerClass: 101,
            movementSpeed: 120,
            attackSpeed: 90,
        });
        if (packet.type === 'characterSpawn') {
            expect(packet.affects).to.deep.equal([1, 2]);
        }
    });

    it('decodes character info and update', () => {
        const info = parseServerPacket(
            new CharacterInfoPacket({
                vid: 1,
                playerName: 'Hero',
                parts: [1, 2, 3, 4],
                empireId: 1,
                guildId: 5,
                level: 30,
                rankPoints: 10,
                pkMode: 1,
                mountId: 20101,
            }).pack(),
        );
        expect(info).to.include({ type: 'characterInfo', vid: 1, playerName: 'Hero', level: 30, pkMode: 1 });
        if (info.type === 'characterInfo') {
            expect(info.parts).to.deep.equal([1, 2, 3, 4]);
        }

        const update = parseServerPacket(
            new CharacterUpdatePacket({
                vid: 1,
                parts: [5, 6, 7, 8],
                moveSpeed: 130,
                attackSpeed: 100,
                state: 1,
                affects: [3, 4],
                guildId: 5,
                rankPoints: 11,
                pkMode: 2,
                mountVnum: 20102,
            }).pack(),
        );
        expect(update).to.include({ type: 'characterUpdate', vid: 1, moveSpeed: 130, mountVnum: 20102 });
        if (update.type === 'characterUpdate') {
            expect(update.parts).to.deep.equal([5, 6, 7, 8]);
            expect(update.affects).to.deep.equal([3, 4]);
        }
    });

    it('decodes a movement, a sync position and a removal', () => {
        const move = parseServerPacket(
            new CharacterMoveOutPacket({
                vid: 1,
                movementType: 1,
                arg: 2,
                rotation: 90,
                positionX: 100,
                positionY: 200,
                time: 1000,
                duration: 500,
            }).pack(),
        );
        expect(move).to.include({ type: 'characterMove', vid: 1, movementType: 1, duration: 500 });

        const sync = parseServerPacket(new SyncPositionPacket({ virtualId: 7, positionX: 11, positionY: 22 }).pack());
        expect(sync).to.include({ type: 'syncPosition' });
        if (sync.type === 'syncPosition') {
            expect(sync.positions).to.deep.equal([{ vid: 7, positionX: 11, positionY: 22 }]);
        }

        expect(parseServerPacket(new RemoveCharacterPacket({ vid: 9 }).pack())).to.include({
            type: 'removeCharacter',
            vid: 9,
        });
    });

    it('decodes a chat message', () => {
        const packet = parseServerPacket(
            new ChatOutPacket({ messageType: ChatMessageTypeEnum.SHOUT, vid: 3, empireId: 1, message: 'hello' }).pack(),
        );
        expect(packet).to.include({
            type: 'chat',
            messageType: ChatMessageTypeEnum.SHOUT,
            vid: 3,
            empireId: 1,
            message: 'hello',
        });
    });

    it('decodes death, target and damage', () => {
        expect(parseServerPacket(new CharacterDiedPacket({ virtualId: 4 }).pack())).to.include({
            type: 'characterDied',
            vid: 4,
        });
        expect(parseServerPacket(new TargetUpdatedPacket({ virtualId: 4, healthPercentage: 55 }).pack())).to.include({
            type: 'targetUpdated',
            vid: 4,
            healthPercentage: 55,
        });
        expect(parseServerPacket(new DamagePacket({ virtualId: 4, damageFlags: 2, damage: 1234 }).pack())).to.include({
            type: 'damage',
            vid: 4,
            damageFlags: 2,
            damage: 1234,
        });
    });

    it('decodes a teleport', () => {
        const packet = parseServerPacket(
            new TeleportPacket({ positionX: 100, positionY: 200, address: 0x7f000001, port: 13001 }).pack(),
        );
        expect(packet).to.include({
            type: 'teleport',
            positionX: 100,
            positionY: 200,
            address: 0x7f000001,
            port: 13001,
        });
    });

    it('decodes an item snapshot with sockets', () => {
        const packet = parseServerPacket(
            new ItemPacket({
                window: 1,
                position: 3,
                id: 1000,
                count: 5,
                flags: 0,
                antiFlags: 0,
                highlight: 0,
                sockets: [11, 22, 33],
            }).pack(),
        );
        expect(packet.type).to.equal('item');
        if (packet.type !== 'item') return;
        expect(packet.item).to.include({ window: 1, position: 3, id: 1000, count: 5 });
        expect(packet.item.sockets).to.deep.equal([11, 22, 33]);
        expect(packet.item.bonuses).to.have.lengthOf(7);
    });

    it('decodes an item update', () => {
        const packet = parseServerPacket(
            new UpdateItemPacket({ window: 1, position: 3, count: 9, sockets: [1, 2, 3] }).pack(),
        );
        expect(packet).to.include({ type: 'itemUpdate', window: 1, position: 3, count: 9 });
        if (packet.type === 'itemUpdate') {
            expect(packet.sockets).to.deep.equal([1, 2, 3]);
        }
    });

    it('decodes dropped item spawn/hide and ownership', () => {
        expect(
            parseServerPacket(
                new ItemDroppedPacket({ id: 1000, positionX: 1, positionY: 2, virtualId: 0x6000 }).pack(),
            ),
        ).to.include({ type: 'itemDropped', vid: 0x6000, id: 1000, positionX: 1, positionY: 2 });

        expect(parseServerPacket(new ItemDroppedHidePacket({ virtualId: 0x6000 }).pack())).to.include({
            type: 'itemDroppedHide',
            vid: 0x6000,
        });

        expect(
            parseServerPacket(new SetItemOwnershipPacket({ virtualId: 0x6000, ownerName: 'Hero' }).pack()),
        ).to.include({ type: 'setItemOwnership', vid: 0x6000, ownerName: 'Hero' });
    });

    it('decodes affects and special effects', () => {
        const affect = parseServerPacket(
            new AffectAddPacket({ type: 5, apply: 2, value: 10, flag: 1, duration: 60, manaCost: 3 }).pack(),
        );
        expect(affect).to.include({ type: 'affectAdd', affectType: 5, apply: 2, value: 10, duration: 60, manaCost: 3 });

        expect(parseServerPacket(new AffectRemovePacket({ type: 5, apply: 2 }).pack())).to.include({
            type: 'affectRemove',
            affectType: 5,
            apply: 2,
        });

        expect(parseServerPacket(new SpecialEffectPacket({ type: 3, virtualId: 8 }).pack())).to.include({
            type: 'specialEffect',
            effectType: 3,
            vid: 8,
        });
    });

    it('decodes fly and fly targeting (both directions)', () => {
        expect(parseServerPacket(new FlyPacket({ type: 1, fromVirtualId: 1, toVirtualId: 2 }).pack())).to.include({
            type: 'fly',
            flyType: 1,
            fromVid: 1,
            toVid: 2,
        });

        const fly = parseServerPacket(
            new FlyTargetingPacket({ shooterVirtualId: 1, targetVirtualId: 2, positionX: 3, positionY: 4 }).pack(),
        );
        expect(fly).to.include({ type: 'flyTargeting', isAdd: false, shooterVid: 1, targetVid: 2 });

        const add = parseServerPacket(
            new FlyTargetingPacket({
                shooterVirtualId: 1,
                targetVirtualId: 2,
                positionX: 3,
                positionY: 4,
                isAdd: true,
            }).pack(),
        );
        expect(add).to.include({ type: 'flyTargeting', isAdd: true });
    });

    it('decodes quick slot responses', () => {
        expect(
            parseServerPacket(
                new QuickSlotAddResponsePacket({ slot: 1, type: QuickSlotTypeEnum.SKILL, position: 5 }).pack(),
            ),
        ).to.include({ type: 'quickSlotAddResponse', slot: 1, slotType: QuickSlotTypeEnum.SKILL, position: 5 });

        expect(parseServerPacket(new QuickSlotRemoveResponsePacket({ slot: 2 }).pack())).to.include({
            type: 'quickSlotRemoveResponse',
            slot: 2,
        });

        expect(parseServerPacket(new QuickSlotSwapResponsePacket({ slotA: 1, slotB: 2 }).pack())).to.include({
            type: 'quickSlotSwapResponse',
            slotA: 1,
            slotB: 2,
        });
    });

    it('decodes the shop open grid, a single update and the end', () => {
        const start = parseServerPacket(new ShopStartPacket({ ownerVid: 7, items: [] }).pack());
        expect(start).to.include({ type: 'shop', subHeader: ShopSubHeaderGC.START, ownerVid: 7 });
        if (start.type === 'shop') {
            expect(start.entries).to.deep.equal([]);
        }

        const update = parseServerPacket(new ShopUpdateItemPacket({ pos: 3, vnum: 1000, price: 500, count: 2 }).pack());
        expect(update).to.include({ type: 'shop', subHeader: ShopSubHeaderGC.UPDATE_ITEM, pos: 3 });
        if (update.type === 'shop') {
            const zeroBonuses = Array.from({ length: 7 }, () => ({ id: 0, value: 0 }));
            expect(update.entries).to.deep.equal([
                {
                    pos: 3,
                    vnum: 1000,
                    price: 500,
                    count: 2,
                    displayPos: 3,
                    sockets: [0, 0, 0],
                    bonuses: zeroBonuses,
                },
            ]);
        }

        expect(parseServerPacket(new ShopEndPacket().pack())).to.include({
            type: 'shop',
            subHeader: ShopSubHeaderGC.END,
        });

        const result = parseServerPacket(new ShopResultPacket({ result: ShopSubHeaderGC.NOT_ENOUGH_MONEY }).pack());
        expect(result).to.include({ type: 'shop', subHeader: ShopSubHeaderGC.NOT_ENOUGH_MONEY });
    });

    it('decodes a private shop sign', () => {
        expect(parseServerPacket(new ShopSignPacket({ ownerVid: 7, sign: 'buy here' }).pack())).to.include({
            type: 'shopSign',
            ownerVid: 7,
            sign: 'buy here',
        });
    });

    it('decodes a quest script', () => {
        const packet = parseServerPacket(new QuestScriptPacket({ skin: 2, src: 'hello quest' }).pack());
        expect(packet).to.include({ type: 'questScript', skin: 2, src: 'hello quest' });
    });

    it('decodes quest info with the optional flagged fields', () => {
        const flags =
            QuestFlagEnum.ISBEGIN | QuestFlagEnum.TITLE | QuestFlagEnum.CLOCK_NAME | QuestFlagEnum.CLOCK_VALUE;
        const packet = parseServerPacket(
            new QuestInfoPacket({
                id: 12,
                flags,
                wasStarted: 1,
                title: 'The Quest',
                clockName: 'Time',
                clockValue: 30,
            }).pack(),
        );
        expect(packet).to.include({
            type: 'questInfo',
            id: 12,
            title: 'The Quest',
            clockName: 'Time',
            clockValue: 30,
            counterName: null,
            counterValue: null,
            iconFile: null,
        });
        if (packet.type === 'questInfo') {
            expect(packet.wasStarted).to.equal(1);
        }
    });

    it('decodes quest target create and remove', () => {
        expect(
            parseServerPacket(
                new QuestTargetCreatePacket({ id: 1, targetName: 'Spot', targetVirtualId: 5, type: 2 }).pack(),
            ),
        ).to.include({ type: 'questTargetCreate', id: 1, targetName: 'Spot', targetVid: 5, targetType: 2 });

        expect(parseServerPacket(new QuestTargetRemovePacket({ id: 1 }).pack())).to.include({
            type: 'questTargetRemove',
            id: 1,
        });
    });

    it('falls back to a raw packet for an unknown header', () => {
        const frame = Buffer.from([0x99, 0xaa, 0xbb, 0xcc]);
        const packet = parseServerPacket(frame);
        expect(packet.type).to.equal('raw');
        if (packet.type === 'raw') {
            expect(packet.header).to.equal(0x99);
            expect(packet.payload).to.deep.equal(Buffer.from([0xaa, 0xbb, 0xcc]));
        }
    });

    it('throws a ProtocolError on a truncated decoded packet', () => {
        expect(() => parseServerPacket(Buffer.from([PacketHeaderEnum.CHARACTER_DETAILS, 0x01]))).to.throw(
            ProtocolError,
        );
    });

    it('throws a ProtocolError on an empty frame', () => {
        expect(() => parseServerPacket(Buffer.alloc(0))).to.throw(ProtocolError);
    });
});
