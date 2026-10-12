import { expect } from 'chai';
import { createConnection } from 'node:net';
import BridgeHost from '../../src/bridge/bridgeHost';

/**
 * Functional test of the desktop client's bridge host: it must bring up the
 * same BridgeServer the web client ships, on an ephemeral loopback port, serve
 * the health/state API, propagate settings-driven endpoint defaults into the
 * session, and shut back down cleanly.
 */
describe('desktop/bridge/bridgeHost', () => {
    it('starts on an ephemeral loopback port and serves the health API', async () => {
        const host = new BridgeHost({
            version: '9.9.9',
            staticDir: null,
            defaults: {
                auth: { host: '127.0.0.1', port: 11002 },
                game: { host: '127.0.0.1', port: 13001 },
            },
        });

        const bridge = await host.start('127.0.0.1', 0);

        expect(bridge.host).to.equal('127.0.0.1');
        expect(bridge.port).to.be.greaterThan(0);
        expect(bridge.url).to.equal(`http://127.0.0.1:${bridge.port}/`);

        const health = await fetch(`${bridge.url}api/health`);
        expect(health.status).to.equal(200);
        const body = (await health.json()) as {
            ok: boolean;
            name: string;
            version: string;
            defaults: { auth: { host: string; port: number }; game: { host: string; port: number } };
        };
        expect(body.ok).to.equal(true);
        expect(body.version).to.equal('9.9.9');
        expect(body.defaults.auth).to.deep.equal({ host: '127.0.0.1', port: 11002 });

        await bridge.close();
    });

    it('propagates settings changes into the session defaults and shuts the port down', async () => {
        const host = new BridgeHost({
            version: '1.0.0',
            staticDir: null,
            defaults: {
                auth: { host: 'old.example.com', port: 11002 },
                game: { host: 'old.example.com', port: 13001 },
            },
        });
        const bridge = await host.start('127.0.0.1', 0);

        bridge.applyDefaults({
            auth: { host: 'new.example.com', port: 2001 },
            game: { host: 'new.example.com', port: 3001 },
        });

        const state = (await (await fetch(`${bridge.url}api/state`)).json()) as {
            defaults: { auth: { host: string; port: number }; game: { host: string; port: number } };
        };
        expect(state.defaults).to.deep.equal({
            auth: { host: 'new.example.com', port: 2001 },
            game: { host: 'new.example.com', port: 3001 },
        });

        await bridge.close();

        // The listener must be gone: nothing may accept connections on the
        // released port.
        await new Promise<void>((resolve, reject) => {
            const socket = createConnection({ host: '127.0.0.1', port: bridge.port });
            socket.once('connect', () => {
                socket.destroy();
                reject(new Error('the bridge port is still accepting connections'));
            });
            socket.once('error', () => resolve());
            socket.setTimeout(2_000, () => {
                socket.destroy();
                reject(new Error('timed out waiting for the port to close'));
            });
        });
    });

    it('close() is safe to call twice and without start()', async () => {
        const host = new BridgeHost({
            version: '1.0.0',
            staticDir: null,
            defaults: {
                auth: { host: '127.0.0.1', port: 11002 },
                game: { host: '127.0.0.1', port: 13001 },
            },
        });
        await host.close();
        const bridge = await host.start('127.0.0.1', 0);
        await bridge.close();
        await bridge.close();
    });
});
