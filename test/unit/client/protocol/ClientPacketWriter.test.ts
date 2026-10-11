import { expect } from 'chai';
import PacketHeaderEnum from '@/core/enum/PacketHeaderEnum';
import { QuickSlotTypeEnum } from '@/core/enum/QuickSlotTypeEnum';
import { ShopSubHeaderCG } from '@/core/enum/ShopSubHeaderEnum';
import ClientPacketWriter, { MyShopItemEntry } from '@/client/protocol/ClientPacketWriter';

import HandshakePacket from '@/core/interface/networking/packets/packet/bidirectional/handshake/HandshakePacket';
import LoginRequestPacket from '@/core/interface/networking/packets/packet/in/loginRequest/LoginRequestPacket';
import ServerStatusRequestPacket from '@/core/interface/networking/packets/packet/in/serverStatus/ServerStatusRequestPacket';
import InternalPingPacket from '@/core/interface/networking/packets/packet/in/internalPing/InternalPingPacket';
import PongPacket from '@/core/interface/networking/packets/packet/in/pong/PongPacket';
import MarkLoginPacket from '@/core/interface/networking/packets/packet/in/markLogin/MarkLoginPacket';
import ClientVersionPacket from '@/core/interface/networking/packets/packet/in/clientVersion/ClientVersionPacket';
import AuthTokenPacket from '@/core/interface/networking/packets/packet/in/authToken/AuthTokenPacket';
import CreateCharacterPacket from '@/core/interface/networking/packets/packet/in/createCharacter/CreateCharacterPacket';
import DeleteCharacterPacket from '@/core/interface/networking/packets/packet/in/deleteCharacter/DeleteCharacterPacket';
import SelectCharacterPacket from '@/core/interface/networking/packets/packet/in/selectCharacter/SelectCharacterPacket';
import EnterGamePacket from '@/core/interface/networking/packets/packet/in/enterGame/EnterGamePacket';
import CharacterMovePacket from '@/core/interface/networking/packets/packet/in/characterMove/CharacterMovePacket';
import ChatInPacket from '@/core/interface/networking/packets/packet/in/chat/ChatInPacket';
import AttackPacket from '@/core/interface/networking/packets/packet/in/attack/AttackPacket';
import TargetPacket from '@/core/interface/networking/packets/packet/in/target/TargetPacket';
import SkillUsePacket from '@/core/interface/networking/packets/packet/in/skillUse/SkillUsePacket';
import ItemUsePacket from '@/core/interface/networking/packets/packet/in/itemUse/ItemUsePacket';
import ItemMovePacket from '@/core/interface/networking/packets/packet/in/itemMove/ItemMovePacket';
import ItemDropPacket from '@/core/interface/networking/packets/packet/in/itemDrop/ItemDropPacket';
import ItemPickupPacket from '@/core/interface/networking/packets/packet/in/itemPickup/ItemPickupPacket';
import OnClickPacket from '@/core/interface/networking/packets/packet/in/onclick/OnClickPacket';
import QuestAnswerPacket from '@/core/interface/networking/packets/packet/in/questAnswer/QuestAnswerPacket';
import QuestButtonPacket from '@/core/interface/networking/packets/packet/in/questButton/QuestButtonPacket';
import QuickSlotAddRequestPacket from '@/core/interface/networking/packets/packet/in/quickSlotAdd/QuickSlotAddRequestPacket';
import QuickSlotSwapRequestPacket from '@/core/interface/networking/packets/packet/in/quickSlotSwap/QuickSlotSwapRequestPacket';
import QuickSlotRemoveRequestPacket from '@/core/interface/networking/packets/packet/in/quickSlotRemove/QuickSlotRemoveRequestPacket';
import FlyTargetingRequestPacket from '@/core/interface/networking/packets/packet/in/flyTargeting/FlyTargetingRequestPacket';
import AddFlyTargetingRequestPacket from '@/core/interface/networking/packets/packet/in/addFlyTargeting/AddFlyTargetingRequestPacket';
import ShootPacket from '@/core/interface/networking/packets/packet/in/shoot/ShootPacket';
import ShopPacket from '@/core/interface/networking/packets/packet/in/shop/ShopPacket';
import MyShopPacket from '@/core/interface/networking/packets/packet/in/myshop/MyShopPacket';

/**
 * Every encoder must produce exactly what the server's matching `in/*` packet
 * `unpack()`s back: same header, same field widths/order, plus the trailing
 * sequence byte the server's `getFrameLength()` expects. Each test packs with
 * the writer and parses with the server class; a mismatch in either direction
 * fails here rather than on a live connection.
 */
describe('ClientPacketWriter', () => {
    it('handshake echoes id/time/delta in a 13 byte frame', () => {
        const frame = ClientPacketWriter.handshake({ id: 0x11223344, time: 123456, delta: 7 });
        expect(frame).to.have.lengthOf(13);
        expect(frame[0]).to.equal(PacketHeaderEnum.HANDSHAKE);

        const parsed = new HandshakePacket({ id: 0, time: 0, delta: 0 }).unpack(frame);
        expect(parsed.getId()).to.equal(0x11223344);
        expect(parsed.getTime()).to.equal(123456);
        expect(parsed.getDelta()).to.equal(7);
    });

    it('loginRequest is 66 bytes and carries username/password/key', () => {
        const frame = ClientPacketWriter.loginRequest({ username: 'admin', password: 'secret', key: 42 });
        expect(frame).to.have.lengthOf(66);
        expect(frame[0]).to.equal(PacketHeaderEnum.LOGIN_REQUEST);

        const parsed = new LoginRequestPacket({ username: '', password: '', key: 0 }).unpack(frame);
        expect(parsed.getUsername()).to.equal('admin');
        expect(parsed.getPassword()).to.equal('secret');
        expect(parsed.getKey()).to.equal(42);
    });

    it('loginRequest trims a username longer than the 31 byte field', () => {
        const frame = ClientPacketWriter.loginRequest({ username: 'x'.repeat(64), password: 'p' });
        const parsed = new LoginRequestPacket({ username: '', password: '', key: 0 }).unpack(frame);
        expect(parsed.getUsername()).to.equal('x'.repeat(30));
    });

    it('serverStatusRequest is a single header byte', () => {
        const frame = ClientPacketWriter.serverStatusRequest();
        expect(frame).to.have.lengthOf(1);
        expect(frame[0]).to.equal(PacketHeaderEnum.SERVER_STATUS_REQUEST);
        expect(new ServerStatusRequestPacket().unpack()).to.be.instanceOf(ServerStatusRequestPacket);
    });

    it('internalPing is 5 unsequenced bytes', () => {
        const frame = ClientPacketWriter.internalPing(0xdeadbeef);
        expect(frame).to.have.lengthOf(5);
        expect(frame[0]).to.equal(PacketHeaderEnum.INTERNAL_PING);
        const parsed = new InternalPingPacket({ time: 0 }).unpack(frame);
        expect(parsed.getTime()).to.equal(0xdeadbeef);
    });

    it('pong and markLogin are header-only frames', () => {
        const pong = ClientPacketWriter.pong();
        expect(pong).to.have.lengthOf(1);
        expect(pong[0]).to.equal(PacketHeaderEnum.PONG);
        expect(new PongPacket().unpack()).to.be.instanceOf(PongPacket);

        const mark = ClientPacketWriter.markLogin();
        expect(mark).to.have.lengthOf(9);
        expect(mark[0]).to.equal(PacketHeaderEnum.MARK_LOGIN);
        expect(new MarkLoginPacket().unpack()).to.be.instanceOf(MarkLoginPacket);
    });

    it('clientVersion is 68 bytes (2x33 fields + sequence)', () => {
        const frame = ClientPacketWriter.clientVersion('open-mt2-client', '1.1.2');
        expect(frame).to.have.lengthOf(68);
        expect(frame[0]).to.equal(PacketHeaderEnum.CLIENT_VERSION);

        const parsed = new ClientVersionPacket({ clientName: '', timeStamp: '' }).unpack(frame);
        expect(parsed.getClientName()).to.equal('open-mt2-client');
        expect(parsed.getTimeStamp()).to.equal('1.1.2');
    });

    it('token is 53 bytes: username, key and 4 XTEA keys', () => {
        const frame = ClientPacketWriter.token({ username: 'admin', key: 99, xteaKeys: [1, 2, 3, 4] });
        expect(frame).to.have.lengthOf(53);
        expect(frame[0]).to.equal(PacketHeaderEnum.TOKEN);

        const parsed = new AuthTokenPacket({ username: '', key: 0, xteaKeys: [] }).unpack(frame);
        expect(parsed.getUsername()).to.equal('admin');
        expect(parsed.getKey()).to.equal(99);
        expect(parsed.getXteaKeys()).to.deep.equal([1, 2, 3, 4]);
    });

    it('token rejects a wrong number of XTEA keys', () => {
        expect(() => ClientPacketWriter.token({ username: 'a', key: 1, xteaKeys: [1, 2, 3] })).to.throw();
    });

    it('createCharacter round-trips slot/name/class/appearance', () => {
        const frame = ClientPacketWriter.createCharacter({
            slot: 2,
            playerName: 'Hero',
            playerClass: 3,
            appearance: 5,
        });
        expect(frame[0]).to.equal(PacketHeaderEnum.CREATE_CHARACTER);

        const parsed = new CreateCharacterPacket({
            slot: 0,
            playerName: '',
            playerClass: 0,
            appearance: 0,
        }).unpack(frame);
        expect(parsed.getSlot()).to.equal(2);
        expect(parsed.getPlayerName()).to.equal('Hero');
        expect(parsed.getPlayerClass()).to.equal(3);
        expect(parsed.getAppearance()).to.equal(5);
    });

    it('deleteCharacter round-trips slot and private code', () => {
        const frame = ClientPacketWriter.deleteCharacter({ slot: 1, privateCode: 'abcd' });
        expect(frame[0]).to.equal(PacketHeaderEnum.DELETE_CHARACTER);

        const parsed = new DeleteCharacterPacket({ slot: 0, privateCode: '' }).unpack(frame);
        expect(parsed.getSlot()).to.equal(1);
        expect(parsed.getPrivateCode()).to.equal('abcd');
    });

    it('selectCharacter is 3 bytes and enterGame is 2 bytes', () => {
        const select = ClientPacketWriter.selectCharacter(3);
        expect(select).to.have.lengthOf(3);
        expect(select[0]).to.equal(PacketHeaderEnum.SELECT_CHARACTER);
        expect(new SelectCharacterPacket({ slot: 0 }).unpack(select).getSlot()).to.equal(3);

        const enter = ClientPacketWriter.enterGame();
        expect(enter).to.have.lengthOf(2);
        expect(enter[0]).to.equal(PacketHeaderEnum.ENTER_GAME);
        expect(new EnterGamePacket().unpack()).to.be.instanceOf(EnterGamePacket);
    });

    it('characterMove round-trips movement fields', () => {
        const frame = ClientPacketWriter.characterMove({
            movementType: 1,
            arg: 2,
            rotation: 128,
            positionX: 1000,
            positionY: 2000,
            time: 3000,
        });
        expect(frame).to.have.lengthOf(17);
        expect(frame[0]).to.equal(PacketHeaderEnum.CHARACTER_MOVE);

        const parsed = new CharacterMovePacket({
            movementType: 0,
            arg: 0,
            rotation: 0,
            positionX: 0,
            positionY: 0,
            time: 0,
        }).unpack(frame);
        expect(parsed.getMovementType()).to.equal(1);
        expect(parsed.getArg()).to.equal(2);
        expect(parsed.getRotation()).to.equal(128);
        expect(parsed.getPositionX()).to.equal(1000);
        expect(parsed.getPositionY()).to.equal(2000);
        expect(parsed.getTime()).to.equal(3000);
    });

    it('chat carries the dynamic size prefix, type and text', () => {
        const frame = ClientPacketWriter.chat('hi there', 6);
        expect(frame[0]).to.equal(PacketHeaderEnum.CHAT_IN);
        expect(frame.readUInt16LE(1)).to.equal(5 + 'hi there'.length);
        expect(frame).to.have.lengthOf(5 + 'hi there'.length + 1);

        const parsed = new ChatInPacket({ message: '', messageType: 0 }).unpack(frame);
        expect(parsed.getMessage()).to.equal('hi there');
        expect(parsed.getMessageType()).to.equal(6);
    });

    it('attack/target/skillUse round-trip their ids', () => {
        const attack = ClientPacketWriter.attack({ skillVnum: 7, victimVirtualId: 0x1000 });
        const parsedAttack = new AttackPacket({ skillVnum: 0, victimVirtualId: 0 }).unpack(attack);
        expect(parsedAttack.getSkillVnum()).to.equal(7);
        expect(parsedAttack.getVictimVirtualId()).to.equal(0x1000);

        const target = ClientPacketWriter.target(0x2000);
        expect(new TargetPacket({ targetVirtualId: 0 }).unpack(target).getTargetVirtualId()).to.equal(0x2000);

        const skill = ClientPacketWriter.skillUse({ skillNum: 12, targetVirtualId: 0x3000 });
        const parsedSkill = new SkillUsePacket({ skillNum: 0, targetVirtualId: 0 }).unpack(skill);
        expect(parsedSkill.getSkillNum()).to.equal(12);
        expect(parsedSkill.getTargetVirtualId()).to.equal(0x3000);
    });

    it('item use/move/drop/pickup round-trip their windows and positions', () => {
        const use = new ItemUsePacket({ window: 0, position: 0 }).unpack(ClientPacketWriter.itemUse(2, 10));
        expect(use.getWindow()).to.equal(2);
        expect(use.getPosition()).to.equal(10);

        const move = new ItemMovePacket({
            fromWindow: 0,
            fromPosition: 0,
            toWindow: 0,
            toPosition: 0,
            count: 0,
        }).unpack(
            ClientPacketWriter.itemMove({ fromWindow: 1, fromPosition: 2, toWindow: 3, toPosition: 4, count: 5 }),
        );
        expect(move.getFromWindow()).to.equal(1);
        expect(move.getFromPosition()).to.equal(2);
        expect(move.getToWindow()).to.equal(3);
        expect(move.getToPosition()).to.equal(4);
        expect(move.getCount()).to.equal(5);

        const drop = new ItemDropPacket({ window: 0, position: 0, gold: 0, count: 0 }).unpack(
            ClientPacketWriter.itemDrop({ window: 1, position: 6, gold: 1000, count: 2 }),
        );
        expect(drop.getWindow()).to.equal(1);
        expect(drop.getPosition()).to.equal(6);
        expect(drop.getGold()).to.equal(1000);
        expect(drop.getCount()).to.equal(2);

        const pick = new ItemPickupPacket({ virtualId: 0 }).unpack(ClientPacketWriter.itemPickup(0x4000));
        expect(pick.getVirtualId()).to.equal(0x4000);
    });

    it('onClick/questAnswer/questButton round-trip', () => {
        const click = new OnClickPacket({ targetVirtualId: 0 }).unpack(ClientPacketWriter.onClick(0x5000));
        expect(click.getTargetVirtualId()).to.equal(0x5000);

        const answer = new QuestAnswerPacket({ answer: 0 }).unpack(ClientPacketWriter.questAnswer(1));
        expect(answer.getAnswer()).to.equal(1);

        const button = new QuestButtonPacket({ questId: 0 }).unpack(ClientPacketWriter.questButton(77));
        expect(button.getQuestId()).to.equal(77);
    });

    it('quick slot add/swap/remove round-trip', () => {
        const add = new QuickSlotAddRequestPacket({ slot: 0, type: QuickSlotTypeEnum.NONE, position: 0 }).unpack(
            ClientPacketWriter.quickSlotAdd({ slot: 4, type: QuickSlotTypeEnum.SKILL, position: 9 }),
        );
        expect(add.getSlot()).to.equal(4);
        expect(add.getType()).to.equal(QuickSlotTypeEnum.SKILL);
        expect(add.getPosition()).to.equal(9);

        const swap = new QuickSlotSwapRequestPacket({ slotA: 0, slotB: 0 }).unpack(
            ClientPacketWriter.quickSlotSwap({ slotA: 1, slotB: 2 }),
        );
        expect(swap.getSlotA()).to.equal(1);
        expect(swap.getSlotB()).to.equal(2);

        const remove = new QuickSlotRemoveRequestPacket({ slot: 0 }).unpack(ClientPacketWriter.quickSlotRemove(3));
        expect(remove.getSlot()).to.equal(3);
    });

    it('fly targeting/adding/shoot round-trip', () => {
        const fly = new FlyTargetingRequestPacket({
            targetVirtualId: 0,
            positionX: 0,
            positionY: 0,
        }).unpack(ClientPacketWriter.flyTargeting({ targetVirtualId: 0x6000, positionX: 1, positionY: 2 }));
        expect(fly.getTargetVirtualId()).to.equal(0x6000);
        expect(fly.getPositionX()).to.equal(1);
        expect(fly.getPositionY()).to.equal(2);

        const add = new AddFlyTargetingRequestPacket({
            targetVirtualId: 0,
            positionX: 0,
            positionY: 0,
        }).unpack(ClientPacketWriter.addFlyTargeting({ targetVirtualId: 0x7000, positionX: 3, positionY: 4 }));
        expect(add.getTargetVirtualId()).to.equal(0x7000);

        expect(new ShootPacket({ type: 0 }).unpack(ClientPacketWriter.shoot(5)).getType()).to.equal(5);
    });

    it('shop END/BUY/SELL/SELL2 match the server subheader framing', () => {
        const end = new ShopPacket().unpack(ClientPacketWriter.shop({ subHeader: ShopSubHeaderCG.END }));
        expect(end.getShopSubHeader()).to.equal(ShopSubHeaderCG.END);

        const buy = new ShopPacket().unpack(ClientPacketWriter.shop({ subHeader: ShopSubHeaderCG.BUY, pos: 8 }));
        expect(buy.getShopSubHeader()).to.equal(ShopSubHeaderCG.BUY);
        expect(buy.getPos()).to.equal(8);

        const sell = new ShopPacket().unpack(ClientPacketWriter.shop({ subHeader: ShopSubHeaderCG.SELL, pos: 9 }));
        expect(sell.getShopSubHeader()).to.equal(ShopSubHeaderCG.SELL);
        expect(sell.getPos()).to.equal(9);

        const sell2 = new ShopPacket().unpack(
            ClientPacketWriter.shop({ subHeader: ShopSubHeaderCG.SELL2, pos: 10, count: 5 }),
        );
        expect(sell2.getShopSubHeader()).to.equal(ShopSubHeaderCG.SELL2);
        expect(sell2.getPos()).to.equal(10);
        expect(sell2.getCount()).to.equal(5);
    });

    it('myShop round-trips the sign and item rows', () => {
        const entries: MyShopItemEntry[] = [
            { vnum: 1000, count: 1, windowType: 1, cellIndex: 5, price: 500, displayPos: 0 },
            { vnum: 2000, count: 3, windowType: 1, cellIndex: 6, price: 250, displayPos: 1 },
        ];
        const frame = ClientPacketWriter.myShop('buy my stuff', entries);
        expect(frame[0]).to.equal(PacketHeaderEnum.PLAYER_SHOP_IN);
        expect(frame).to.have.lengthOf(35 + entries.length * 13 + 1);

        const parsed = new MyShopPacket().unpack(frame);
        expect(parsed.getSign()).to.equal('buy my stuff');
        expect(parsed.getCount()).to.equal(2);
        expect(parsed.getItems()).to.deep.equal(entries);
    });
});
