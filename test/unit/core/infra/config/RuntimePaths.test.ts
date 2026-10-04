import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import RuntimePaths from '@/core/infra/config/RuntimePaths';
import { expect } from 'chai';

describe('RuntimePaths', () => {
    describe('appRoot', () => {
        afterEach(() => RuntimePaths.resetCache());

        it('anchors on the folder holding package.json, not on the working directory', () => {
            const originalCwd = process.cwd();

            try {
                // Deliberately somewhere without any of the shipped assets: a
                // packaged install started by systemd does exactly this.
                process.chdir(os.tmpdir());
                RuntimePaths.resetCache();

                const appRoot = RuntimePaths.appRoot();

                expect(path.isAbsolute(appRoot)).to.be.true;
                expect(fs.existsSync(path.join(appRoot, 'package.json'))).to.be.true;
            } finally {
                process.chdir(originalCwd);
                RuntimePaths.resetCache();
            }
        });

        it('caches the resolved root', () => {
            expect(RuntimePaths.appRoot()).to.equal(RuntimePaths.appRoot());
        });
    });

    describe('dataDir', () => {
        it('resolves the attr directory shipped with the sources', () => {
            const directory = RuntimePaths.dataDir('attr');
            expect(path.basename(directory)).to.equal('attr');
            expect(fs.existsSync(directory)).to.be.true;
        });

        it('resolves the spawn directory shipped with the sources', () => {
            const directory = RuntimePaths.dataDir('spawn');
            expect(path.basename(directory)).to.equal('spawn');
            expect(fs.existsSync(directory)).to.be.true;
        });

        it('returns an absolute path regardless of the working directory', () => {
            const originalCwd = process.cwd();

            try {
                process.chdir(os.tmpdir());
                RuntimePaths.resetCache();

                expect(path.isAbsolute(RuntimePaths.dataDir('attr'))).to.be.true;
                expect(path.isAbsolute(RuntimePaths.dataDir('spawn'))).to.be.true;
            } finally {
                process.chdir(originalCwd);
                RuntimePaths.resetCache();
            }
        });

        it('reports the shipped directories as present', () => {
            expect(RuntimePaths.hasDataDir('attr')).to.be.true;
            expect(RuntimePaths.hasDataDir('spawn')).to.be.true;
        });

        it('offers the working directory, then the compiled and source layouts', () => {
            const candidates = RuntimePaths.dataDirCandidates('attr');

            expect(candidates.length).to.equal(3);
            // A packaged install has no <prefix>/src, so the compiled layout has
            // to be reachable without relying on the working directory.
            expect(candidates[0]).to.contain(path.join('src', 'core'));
            expect(candidates[1]).to.contain(path.join('dist', 'core'));
            expect(candidates[2]).to.contain(path.join('src', 'core'));
        });
    });

    describe('resolveFirstExisting', () => {
        it('picks the first candidate that exists', () => {
            expect(RuntimePaths.resolveFirstExisting(['/does/not/exist', __filename, __dirname])).to.equal(__filename);
        });

        it('falls back to the first candidate when none exists', () => {
            expect(RuntimePaths.resolveFirstExisting(['/nope/a', '/nope/b'])).to.equal('/nope/a');
        });

        it('always returns something for an empty candidate list', () => {
            expect(RuntimePaths.resolveFirstExisting([])).to.equal(undefined);
        });
    });
});
