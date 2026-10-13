import { expect } from 'chai';
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * The native systemd install and the ARM64 compose file describe the same
 * deployment (a 2 GB Pine64): both cap the V8 heap at 1024 MB and keep the
 * cgroup/container limit at 1400 MB. Nothing links the two files, and the
 * failure mode is a boot-time OOM (`Reached heap limit`) on the board, so pin
 * the agreement here.
 */
const root = path.resolve(__dirname, '..', '..', '..');

const readUnit = () => fs.readFileSync(path.join(root, 'deploy', 'systemd', 'open-mt2-game.service'), 'utf8');

const readCompose = () => fs.readFileSync(path.join(root, 'docker-compose.arm64.yml'), 'utf8');

/** The game-server service block, up to the next top-level service (2-space indent). */
const gameServerBlock = (compose: string) => {
    const match = compose.match(/\n {2}game-server:\n([\s\S]*?)(?=\n {2}[a-z0-9-]+:\n)/);
    expect(match, 'docker-compose.arm64.yml must define game-server').to.not.be.null;
    return match ? match[1] : '';
};

const heapOf = (text: string) => {
    const match = text.match(/--max-old-space-size=(\d+)/);
    return match ? Number(match[1]) : undefined;
};

describe('open-mt2-game.service heap cap', () => {
    it('passes an explicit V8 heap cap and the matching env file to the launcher', () => {
        const unit = readUnit();

        expect(unit).to.include('Environment=OPEN_MT2_ENV_FILE=/etc/open-mt2/env');
        expect(unit).to.include('Environment=OPEN_MT2_EXTRA_NODE_ARGS=--max-old-space-size=1024');
    });

    it('keeps MemoryMax above the heap cap so the collector runs before the OOM killer', () => {
        const unit = readUnit();
        const heap = heapOf(unit);
        const memoryMax = unit.match(/MemoryMax=(\d+)M/);

        expect(heap, 'the unit must cap the V8 heap').to.be.a('number');
        expect(memoryMax, 'the unit must set MemoryMax').to.not.be.null;

        expect(Number(memoryMax?.[1])).to.be.greaterThan(heap as number);
    });

    it('agrees with docker-compose.arm64.yml on the heap cap and the container limit', () => {
        const unit = readUnit();
        const block = gameServerBlock(readCompose());

        const unitHeap = heapOf(unit);
        const composeHeap = heapOf(block);
        const unitMemory = Number(unit.match(/MemoryMax=(\d+)M/)?.[1]);
        const composeMemory = Number(block.match(/memory:\s*(\d+)M/)?.[1]);

        expect(unitHeap, 'unit heap').to.equal(composeHeap);
        expect(unitMemory, 'systemd MemoryMax').to.equal(composeMemory);
    });
});
