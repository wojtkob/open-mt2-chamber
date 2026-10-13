import { expect } from 'chai';
import sinon from 'sinon';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import World from '@/core/domain/World';
import ResourcePaths from '@/core/infra/config/ResourcePaths';

const AREA_UNIT = 25600;

describe('World.load() atlas de-duplication', () => {
    let tmpDir: string;
    let previousDataRoot: string | undefined;

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'world-atlas-'));
        // An empty attr tree keeps the loader hermetic: ResourcePaths.attr()
        // resolves to it instead of the map attributes that ship with the repo.
        fs.mkdirSync(path.join(tmpDir, 'core', 'infra', 'config', 'data', 'attr'), { recursive: true });
        previousDataRoot = process.env[ResourcePaths.DATA_DIR_ENV_VAR];
        process.env[ResourcePaths.DATA_DIR_ENV_VAR] = tmpDir;
        sinon.stub(process, 'cwd').returns(tmpDir);
    });

    afterEach(() => {
        sinon.restore();
        if (previousDataRoot === undefined) {
            delete process.env[ResourcePaths.DATA_DIR_ENV_VAR];
        } else {
            process.env[ResourcePaths.DATA_DIR_ENV_VAR] = previousDataRoot;
        }
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('loads and spawns a mapName listed twice only once, while still counting it for the world bounds', async () => {
        const getEntities = sinon.stub().resolves([]);
        const logger = { info: sinon.stub(), debug: sinon.stub(), warn: sinon.stub(), error: sinon.stub() };

        const world = new World({
            logger: logger as any,
            config: {
                atlas: [
                    { mapName: 'metin2_map_monkeydungeon', posX: 0, posY: 0, width: 1, height: 1 },
                    { mapName: 'metin2_map_monkeydungeon', posX: AREA_UNIT, posY: AREA_UNIT, width: 1, height: 1 },
                ],
            } as any,
            spawnManager: { getEntities } as any,
            privilegeManager: {} as any,
            eventTimerManager: {} as any,
            entityManager: {} as any,
        });

        await world.load();

        expect(getEntities.calledOnce).to.be.true;
        expect(getEntities.firstCall.args[0]).to.equal('metin2_map_monkeydungeon');
        expect(world.getAreas().size).to.equal(1);
        expect(world.getAreas().has('metin2_map_monkeydungeon')).to.be.true;
        // The duplicate still contributes to the bounds: 25600 + 1 * AREA_UNIT.
        expect(world.getWidth()).to.equal(AREA_UNIT + AREA_UNIT);
        expect(world.getHeight()).to.equal(AREA_UNIT + AREA_UNIT);
    });
});
