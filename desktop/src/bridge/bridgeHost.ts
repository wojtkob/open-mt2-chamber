/**
 * The desktop client's bridge lifetime manager.
 *
 * The client runs the exact same `BridgeServer`/`VisualSession` code the
 * server-side web client ships (`src/webclient`), and therefore the exact same
 * `Metin2Client` protocol library (`src/client`) — the wire protocol of the
 * desktop client literally is the repository's client library, so "100%
 * compatible with the server" holds by construction. This class only adds the
 * lifecycle the desktop shell needs: start on an ephemeral loopback port,
 * apply settings-driven server defaults, and tear everything down on exit.
 */

import Metin2Client from '../../../src/client/Metin2Client';
import BridgeServer from '../../../src/webclient/BridgeServer';
import VisualSession from '../../../src/webclient/session/VisualSession';
import type { BridgeEndpoint } from '../../../src/webclient/contract';

export type BridgeHostDefaults = { auth: BridgeEndpoint; game: BridgeEndpoint };

export type BridgeHostOptions = {
    version: string;
    /** Directory with a built SPA; `null` shows the "not built" page. */
    staticDir: string | null;
    defaults: BridgeHostDefaults;
};

export type RunningBridge = {
    host: string;
    port: number;
    url: string;
    /** Switch the server endpoints the login form pre-fills (settings change). */
    applyDefaults(defaults: BridgeHostDefaults): void;
    close(): Promise<void>;
};

export default class BridgeHost {
    private readonly client: Metin2Client;
    private readonly session: VisualSession;
    private readonly server: BridgeServer;
    private running = false;

    constructor(options: BridgeHostOptions) {
        this.client = new Metin2Client();
        this.session = new VisualSession({
            client: this.client,
            version: options.version,
            defaults: options.defaults,
        });
        this.server = new BridgeServer({
            session: this.session,
            staticDir: options.staticDir,
            version: options.version,
        });
    }

    /**
     * Start the HTTP bridge. With the default `port = 0` the OS picks a free
     * loopback port, so the desktop client never collides with the server-side
     * web client or another instance — the URL is only ever used locally.
     */
    async start(host = '127.0.0.1', port = 0): Promise<RunningBridge> {
        await this.server.listen(port, host);
        this.running = true;
        const address = this.server.address();
        const url = `http://${address.host}:${address.port}/`;
        return {
            host: address.host,
            port: address.port,
            url,
            applyDefaults: (defaults) => this.applyDefaults(defaults),
            close: () => this.close(),
        };
    }

    /** Replace the server endpoints the login form pre-fills. */
    applyDefaults(defaults: BridgeHostDefaults): void {
        this.session.setDefaults(defaults);
    }

    /** Release the client listeners, close the listener socket and drop the sockets. */
    async close(): Promise<void> {
        if (!this.running) {
            this.client.destroy();
            return;
        }
        this.running = false;
        this.session.dispose();
        try {
            await this.server.close();
        } finally {
            this.client.destroy();
        }
    }
}
