import { expect } from 'chai';
import PacketHeaderEnum from '@/core/enum/PacketHeaderEnum';
import { ConnectionStateEnum } from '@/core/enum/ConnectionStateEnum';
import Metin2Client from '@/client/Metin2Client';
import { AuthError, InvalidStateError, TimeoutError } from '@/client/errors';
import ChatInPacket from '@/core/interface/networking/packets/packet/in/chat/ChatInPacket';
import HandshakePacket from '@/core/interface/networking/packets/packet/bidirectional/handshake/HandshakePacket';
import ConnectionStatePacket from '@/core/interface/networking/packets/packet/out/ConnectionStatePacket';
import FakeServer, { TEST_CHARACTER, wireAuthServer, wireGameServer } from './support/FakeMetin2Servers';

const AUTH_KEY = 0xabcdef;
const TIMEOUT_MS = 3_000;

async function waitFor(predicate: () => boolean, timeoutMs = 2_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (!predicate()) {
        if (Date.now() > deadline) throw new Error('Timed out waiting for condition');
        await new Promise((resolve) => setTimeout(resolve, 5));
    }
}

async function capture(promise: Promise<unknown>): Promise<unknown> {
    try {
        await promise;
        return null;
    } catch (error) {
        return error;
    }
}

describe('Metin2Client end-to-end', () => {
    let authServer: FakeServer;
    let gameServer: FakeServer;
    let client: Metin2Client;

    beforeEach(async () => {
        authServer = wireAuthServer(new FakeServer(), { username: 'admin', password: 'admin', key: AUTH_KEY });
        gameServer = wireGameServer(new FakeServer(), {
            key: AUTH_KEY,
            empireId: 2,
            characters: [TEST_CHARACTER],
        });
        await authServer.listen();
        await gameServer.listen();

        client = new Metin2Client();
        client.on('error', () => undefined);
    });

    afterEach(async () => {
        client.destroy();
        await authServer.close();
        await gameServer.close();
    });

    const loginOptions = () => ({
        username: 'admin',
        password: 'admin',
        authHost: '127.0.0.1',
        authPort: authServer.port,
        gameHost: '127.0.0.1',
        gamePort: gameServer.port,
        timeoutMs: TIMEOUT_MS,
    });

    it('runs login, character select, enter game and a gameplay verb against real sockets', async () => {
        const account = await client.login(loginOptions());

        expect(account.empireId).to.equal(2);
        expect(account.characters).to.have.lengthOf(1);
        expect(account.characters[0]).to.include({ name: 'Hero', level: 30, guildName: 'Guild' });
        expect(client.state.getEmpire()).to.equal(2);

        const selected = await client.selectCharacter(0);
        expect(selected.details.playerName).to.equal('Hero');
        expect(selected.points).to.have.lengthOf(255);
        expect(selected.points[5]).to.equal(100);
        expect(selected.skills).to.have.lengthOf(255);
        expect(client.state.getSelf()?.playerName).to.equal('Hero');
        expect(client.state.getSelectedSlot()).to.equal(0);

        const entered = await client.enterGame();
        expect(entered.time).to.equal(1_700_000_000);
        expect(entered.channel).to.equal(3);
        expect(client.state.getChannel()).to.equal(3);
        expect(client.game.getState()).to.equal(ConnectionStateEnum.GAME);

        client.chat('hello world', 1);
        await waitFor(() => gameServer.received.some((entry) => entry.header === PacketHeaderEnum.CHAT_IN));

        const chatFrame = gameServer.received.find((entry) => entry.header === PacketHeaderEnum.CHAT_IN);
        expect(chatFrame).to.exist;
        const chat = new ChatInPacket({ message: '', messageType: 0 }).unpack(chatFrame!.frame);
        expect(chat.getMessage()).to.equal('hello world');
        expect(chat.getMessageType()).to.equal(1);

        const selectFrames = gameServer.received.filter((entry) => entry.header === PacketHeaderEnum.SELECT_CHARACTER);
        expect(selectFrames).to.have.lengthOf(1);
        expect(gameServer.received.some((entry) => entry.header === PacketHeaderEnum.ENTER_GAME)).to.equal(true);
    });

    it('rejects a wrong password with an AuthError carrying the server status', async () => {
        const error = await capture(client.authenticateAuth({ ...loginOptions(), password: 'nope' }));

        expect(error).to.be.instanceOf(AuthError);
        expect((error as AuthError).status).to.equal('WRONGPWD');
    });

    it('rejects an invalid token because the game server closes silently', async () => {
        const error = await capture(client.authenticateGame({ ...loginOptions(), key: 999 }));

        expect(error).to.be.instanceOf(AuthError);
        expect((error as AuthError).status).to.equal('CLOSED');
    });

    it('times out when the game server never answers the token', async () => {
        const stalled = new FakeServer();
        stalled.onConnect((socket) => {
            stalled.send(socket, new ConnectionStatePacket({ state: ConnectionStateEnum.HANDSHAKE }).pack());
            stalled.send(socket, new HandshakePacket({ id: 1, time: 2, delta: 0 }).pack());
        });
        stalled.onFrame((socket, header) => {
            if (header === PacketHeaderEnum.HANDSHAKE) {
                stalled.send(socket, new ConnectionStatePacket({ state: ConnectionStateEnum.LOGIN }).pack());
            }
        });
        await stalled.listen();

        const stalledClient = new Metin2Client();
        stalledClient.on('error', () => undefined);
        try {
            const error = await capture(
                stalledClient.game.authenticate({
                    host: '127.0.0.1',
                    port: stalled.port,
                    username: 'admin',
                    key: AUTH_KEY,
                    timeoutMs: 200,
                }),
            );
            expect(error).to.be.instanceOf(TimeoutError);
        } finally {
            stalledClient.destroy();
            await stalled.close();
        }
    });

    it('refuses a gameplay verb before entering the game', () => {
        expect(() => client.chat('too early')).to.throw(InvalidStateError);
    });

    it('asks the auth server for its channel status', async () => {
        await client.authenticateAuth(loginOptions());

        const status = await client.requestServerStatus(TIMEOUT_MS);
        expect(status.success).to.equal(true);
        expect(status.channels).to.deep.equal([{ port: 13001, status: 1 }]);
    });
});
