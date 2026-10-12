import { expect } from 'chai';
import Metin2Client from '@/client/Metin2Client';
import PacketHeaderEnum from '@/core/enum/PacketHeaderEnum';
import ChatInPacket from '@/core/interface/networking/packets/packet/in/chat/ChatInPacket';
import VisualSession, { SessionError } from '@/webclient/session/VisualSession';
import type { BridgeEvent } from '@/webclient/contract';
import FakeServer, { TEST_CHARACTER, wireAuthServer, wireGameServer } from '../client/support/FakeMetin2Servers';

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

describe('VisualSession', () => {
    let authServer: FakeServer;
    let gameServer: FakeServer;
    let client: Metin2Client;
    let session: VisualSession;
    let events: BridgeEvent[];

    beforeEach(async () => {
        authServer = wireAuthServer(new FakeServer(), { username: 'admin', password: 'admin', key: AUTH_KEY });
        gameServer = wireGameServer(new FakeServer(), { key: AUTH_KEY, empireId: 2, characters: [TEST_CHARACTER] });
        await authServer.listen();
        await gameServer.listen();

        client = new Metin2Client();
        client.on('error', () => undefined);
        session = new VisualSession({
            client,
            version: '9.9.9',
            defaults: {
                auth: { host: '127.0.0.1', port: authServer.port },
                game: { host: '127.0.0.1', port: gameServer.port },
            },
        });
        events = [];
        session.on('event', (event) => events.push(event));
    });

    afterEach(async () => {
        session.dispose();
        client.destroy();
        await authServer.close();
        await gameServer.close();
    });

    const loginRequest = () => ({
        username: 'admin',
        password: 'admin',
        authHost: '127.0.0.1',
        authPort: authServer.port,
        gameHost: '127.0.0.1',
        gamePort: gameServer.port,
        timeoutMs: TIMEOUT_MS,
    });

    it('falls back to the bridge-configured endpoints when the request omits them', async () => {
        // No authHost/authPort/gameHost/gamePort in the request: the session must
        // route to its own defaults (the fake servers here), not the client
        // library's hard-coded 11002/13001.
        const snapshot = await session.login({ username: 'admin', password: 'admin', timeoutMs: TIMEOUT_MS });
        expect(snapshot.stage).to.equal('select');
        expect(snapshot.loggedInAs).to.equal('admin');
    });

    it('reports an idle snapshot before anything happens', () => {
        const snapshot = session.getSnapshot();
        expect(snapshot.service).to.deep.equal({ name: 'open-mt2-web-client', version: '9.9.9' });
        expect(snapshot.stage).to.equal('idle');
        expect(snapshot.loggedInAs).to.equal(null);
        expect(snapshot.defaults.auth.port).to.equal(authServer.port);
    });

    it('setDefaults replaces the pre-filled endpoints and broadcasts a snapshot', () => {
        session.setDefaults({
            auth: { host: 'play.example.com', port: 2001 },
            game: { host: 'play.example.com', port: 3001 },
        });

        const snapshot = session.getSnapshot();
        expect(snapshot.defaults).to.deep.equal({
            auth: { host: 'play.example.com', port: 2001 },
            game: { host: 'play.example.com', port: 3001 },
        });

        // The change must reach SSE observers so the SPA re-renders.
        const snapshots = events.filter(
            (event): event is Extract<BridgeEvent, { type: 'snapshot' }> => event.type === 'snapshot',
        );
        expect(snapshots).to.not.have.lengthOf(0);
        expect(snapshots[snapshots.length - 1].snapshot.defaults).to.deep.equal({
            auth: { host: 'play.example.com', port: 2001 },
            game: { host: 'play.example.com', port: 3001 },
        });

        // Updating again must not leak the previous values into the new ones.
        session.setDefaults({ auth: { host: '10.0.0.2', port: 11002 }, game: { host: '10.0.0.2', port: 13001 } });
        expect(session.getSnapshot().defaults.game.host).to.equal('10.0.0.2');
        expect(session.getSnapshot().defaults.auth.port).to.equal(11002);
    });

    it('runs login, character select and enter, exposing JSON-safe snapshots', async () => {
        const loggedIn = await session.login(loginRequest());
        expect(loggedIn.stage).to.equal('select');
        expect(loggedIn.loggedInAs).to.equal('admin');
        expect(loggedIn.account?.empireId).to.equal(2);
        expect(loggedIn.account?.characters).to.have.lengthOf(1);
        expect(loggedIn.account?.characters[0]).to.include({ name: 'Hero', level: 30, guildName: 'Guild' });

        const selected = await session.select({ slot: 0 });
        expect(selected.stage).to.equal('loading');
        expect(selected.selectedSlot).to.equal(0);
        expect(selected.self?.playerName).to.equal('Hero');
        expect(selected.points).to.have.lengthOf(255);
        expect(selected.points[5]).to.equal(100);
        expect(selected.skills).to.have.lengthOf(255);

        const entered = await session.enter();
        expect(entered.stage).to.equal('game');
        expect(entered.time).to.equal(1_700_000_000);
        expect(entered.channel).to.equal(3);

        // Every stage change is announced on the event stream the bridge forwards.
        const stages = events.filter(
            (event): event is Extract<BridgeEvent, { type: 'stage' }> => event.type === 'stage',
        );
        expect(stages.map((event) => event.stage)).to.include.members(['authenticating', 'select', 'loading', 'game']);
    });

    it('maps a wrong password to an AUTH_FAILED session error and disconnects', async () => {
        const error = await capture(session.login({ ...loginRequest(), password: 'nope' }));

        expect(error).to.be.instanceOf(SessionError);
        expect((error as SessionError).code).to.equal('AUTH_FAILED');
        expect((error as SessionError).status).to.equal('WRONGPWD');

        const snapshot = session.getSnapshot();
        expect(snapshot.stage).to.equal('disconnected');
        expect(snapshot.loggedInAs).to.equal(null);
        expect(snapshot.lastError?.code).to.equal('AUTH_FAILED');
    });

    it('rejects an empty account name before opening a socket', async () => {
        const error = await capture(session.login({ ...loginRequest(), username: '   ' }));
        expect((error as SessionError).code).to.equal('INVALID_ARGUMENT');
    });

    it('refuses a second login while a session is active', async () => {
        await session.login(loginRequest());
        const error = await capture(session.login(loginRequest()));
        expect((error as SessionError).code).to.equal('BUSY');
    });

    it('refuses select and enter out of order', async () => {
        const selectError = await capture(session.select({ slot: 0 }));
        expect((selectError as SessionError).code).to.equal('INVALID_STATE');

        const enterError = await capture(session.enter());
        expect((enterError as SessionError).code).to.equal('INVALID_STATE');
    });

    it('sends a chat line to the game server', async () => {
        await session.login(loginRequest());
        await session.select({ slot: 0 });
        await session.enter();

        session.chat({ message: 'hello world', messageType: 1 });
        await waitFor(() => gameServer.received.some((entry) => entry.header === PacketHeaderEnum.CHAT_IN));

        const frame = gameServer.received.find((entry) => entry.header === PacketHeaderEnum.CHAT_IN);
        expect(frame).to.exist;
        const chat = new ChatInPacket({ message: '', messageType: 0 }).unpack(frame!.frame);
        expect(chat.getMessage()).to.equal('hello world');
        expect(chat.getMessageType()).to.equal(1);
    });

    it('dispatches gameplay verbs as real client frames', async () => {
        await session.login(loginRequest());
        await session.select({ slot: 0 });
        await session.enter();

        session.verb({ verb: 'target', targetVirtualId: 77 });
        session.verb({ verb: 'attack', victimVirtualId: 77 });
        session.verb({
            verb: 'move',
            movementType: 1,
            arg: 2,
            rotation: 3,
            positionX: 100,
            positionY: 200,
            time: 500,
        });

        await waitFor(() => gameServer.received.some((entry) => entry.header === PacketHeaderEnum.CHARACTER_MOVE));
        const headers = gameServer.received.map((entry) => entry.header);
        expect(headers).to.include(PacketHeaderEnum.TARGET);
        expect(headers).to.include(PacketHeaderEnum.ATTACK);
        expect(headers).to.include(PacketHeaderEnum.CHARACTER_MOVE);
    });

    it('asks the connected server for its channel status', async () => {
        await session.login(loginRequest());
        const result = await session.requestServerStatus(TIMEOUT_MS);
        expect(result.success).to.equal(true);
        expect(result.channels).to.deep.equal([{ port: 13001, status: 1 }]);
        expect(session.getSnapshot().channels).to.deep.equal([{ port: 13001, status: 1 }]);
    });

    it('disconnects back to a clean idle session', async () => {
        await session.login(loginRequest());
        await session.select({ slot: 0 });
        await session.enter();

        const snapshot = session.disconnect();
        expect(snapshot.stage).to.equal('idle');
        expect(snapshot.loggedInAs).to.equal(null);
        expect(snapshot.auth.connected).to.equal(false);
        expect(snapshot.game.connected).to.equal(false);
        expect(snapshot.rawPackets).to.have.lengthOf(0);
    });

    it('buffers raw packets and connection transitions for the debug panel', async () => {
        await session.login(loginRequest());
        const snapshot = session.getSnapshot();
        expect(snapshot.rawPackets.length).to.be.greaterThan(0);
        expect(snapshot.connectionEvents.length).to.be.greaterThan(0);
        expect(snapshot.connectionEvents.some((entry) => entry.source === 'auth')).to.equal(true);
    });

    it('broadcasts a full snapshot on the event stream after each transition', async () => {
        await session.login(loginRequest());
        await session.select({ slot: 0 });
        await session.enter();

        const snapshots = events.filter(
            (event): event is Extract<BridgeEvent, { type: 'snapshot' }> => event.type === 'snapshot',
        );
        expect(snapshots.length).to.be.greaterThanOrEqual(3);

        // The streamed snapshot carries the world state the SPA renders (the
        // account/character list has no per-field event) and has already
        // settled `busy`, so the "working…" pill clears.
        const last = snapshots[snapshots.length - 1]!;
        expect(last.snapshot.stage).to.equal('game');
        expect(last.snapshot.busy).to.equal(false);
        expect(last.snapshot.account?.characters).to.have.lengthOf(1);
        expect(last.snapshot.points[5]).to.equal(100);
    });
});
