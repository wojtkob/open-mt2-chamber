/**
 * Node.js runtime guard.
 *
 * The servers need ES2024 `Promise.withResolvers`, which is available from
 * Node.js 22 onwards. On an older runtime the code still loads, so the failure
 * does not surface until a quest opens a choice window deep inside gameplay:
 *
 *     TypeError: this.currentChoicePromise.resolve is not a function
 *
 * Checking once at start-up turns that into an immediate, actionable message.
 * On a board like the Pine A64 this matters: Armbian's own `nodejs` package is
 * regularly older than the runtime the server needs, and `deploy/install.sh`
 * installs a supported one when it finds a stale version.
 */
export const MIN_NODE_MAJOR = 22;

/** Features the runtime must provide, beyond the major version number. */
const REQUIRED_FEATURES: Array<{ name: string; available: () => boolean; since: string }> = [
    {
        name: 'Promise.withResolvers',
        available: () => typeof Promise.withResolvers === 'function',
        since: 'Node.js 22',
    },
];

/**
 * Reports the reasons the current runtime cannot run the servers.
 * An empty array means the runtime is supported.
 */
export function unsupportedRuntimeReasons(version: string = process.version): string[] {
    const reasons: string[] = [];
    const major = Number.parseInt(version.replace(/^v/, '').split('.')[0] ?? '', 10);

    if (Number.isFinite(major) && major < MIN_NODE_MAJOR) {
        reasons.push(`Node.js ${version} is too old, Node.js >= ${MIN_NODE_MAJOR} is required`);
    }

    for (const feature of REQUIRED_FEATURES) {
        if (!feature.available()) {
            reasons.push(`${feature.name} is missing (${feature.since} or newer required)`);
        }
    }

    return reasons;
}

/** True when the current runtime can run the servers. */
export function isRuntimeSupported(version: string = process.version): boolean {
    return unsupportedRuntimeReasons(version).length === 0;
}

/**
 * Prints an actionable message and exits when the runtime is unsupported.
 * Call it as the first statement of every entry point.
 */
export function assertSupportedRuntime(version: string = process.version): void {
    const reasons = unsupportedRuntimeReasons(version);

    if (reasons.length === 0) return;

    process.stderr.write(
        [
            'open-mt2 cannot start on this Node.js runtime:',
            ...reasons.map((reason) => `  - ${reason}`),
            '',
            'Upgrade with one of:',
            '  - NodeSource: curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt install -y nodejs',
            '  - nvm:         nvm install 22 && nvm use 22',
            '',
            `Running: ${process.version} on ${process.platform}/${process.arch}`,
            '',
        ].join('\n'),
    );

    process.exit(1);
}
