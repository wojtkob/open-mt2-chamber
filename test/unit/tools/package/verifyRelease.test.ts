import { expect } from 'chai';

// `tools/` is excluded from `tsconfig.build.json` and ships no type
// declarations, so the helpers under test are loaded through `require` with an
// explicit contract instead of relying on JS type inference.
/* eslint-disable @typescript-eslint/no-require-imports -- the `tools/` scripts are plain CommonJS and ship no type declarations. */
const { Report, declaredNodeFloorOf, nodeFloorOf, verifyNodeFloor } =
    require('../../../../tools/package/verifyRelease') as {
        Report: new () => ReportLike;
        declaredNodeFloorOf: (contents: string) => number | null;
        nodeFloorOf: (enginesNode: unknown) => number | null;
        verifyNodeFloor: (entries: TarEntry[], expectedEngines: unknown, report: ReportLike) => void;
    };

/** Mirrors the shape of a `readTarArchive` entry, which is what the verifier walks. */
interface TarEntry {
    name: string;
    type: string;
    data?: Buffer;
}

interface ReportLike {
    checks: number;
    failures: string[];
    check: (condition: boolean, message: string) => boolean;
}

function launcher(contents: string): TarEntry {
    return { name: './open-mt2-1.1.2/bin/common.sh', type: '0', data: Buffer.from(contents, 'utf8') };
}

/** Runs the check and hands back the report so failures can be asserted on. */
function runVerify(entries: TarEntry[], expectedEngines: unknown): ReportLike {
    const report = new Report();
    verifyNodeFloor(entries, expectedEngines, report);
    return report;
}

describe('verifyRelease', () => {
    describe('nodeFloorOf', () => {
        it('should read the major version out of the range forms npm allows', () => {
            for (const enginesNode of ['>=22', '^22.1.0', '22.x', '>=22.0.0', '~22', '22']) {
                expect(nodeFloorOf(enginesNode), enginesNode).to.equal(22);
            }
        });

        it('should report a floor below 22 rather than silently accepting it', () => {
            expect(nodeFloorOf('>=20')).to.equal(20);
            expect(nodeFloorOf('20.x')).to.equal(20);
        });

        it('should return null when the value states no version at all', () => {
            // `null` rather than NaN: a caller comparing NaN against a number
            // reports a mismatch that reads like a real disagreement, when the
            // actual problem is that the manifest says nothing usable.
            for (const enginesNode of [undefined, null, '', 'latest', '>=abc', 22, {}]) {
                expect(nodeFloorOf(enginesNode), JSON.stringify(enginesNode)).to.equal(null);
            }
        });
    });

    describe('declaredNodeFloorOf', () => {
        it('should read a bare assignment, tolerating surrounding whitespace', () => {
            expect(declaredNodeFloorOf('OPEN_MT2_MIN_NODE_MAJOR=22\n')).to.equal(22);
            expect(declaredNodeFloorOf('  OPEN_MT2_MIN_NODE_MAJOR=20  \n')).to.equal(20);
            expect(declaredNodeFloorOf('\tOPEN_MT2_MIN_NODE_MAJOR=24\n')).to.equal(24);
        });

        it('should ignore a commented-out assignment', () => {
            // This is the whole point. A stale `# OPEN_MT2_MIN_NODE_MAJOR=20`
            // left next to the real value is exactly what drift looks like, and
            // reading it as the declared value would defeat the check.
            expect(declaredNodeFloorOf('# OPEN_MT2_MIN_NODE_MAJOR=20\nOPEN_MT2_MIN_NODE_MAJOR=22\n')).to.equal(22);
            expect(declaredNodeFloorOf('# OPEN_MT2_MIN_NODE_MAJOR=20\n')).to.equal(null);
        });

        it('should refuse a value that is not a plain number', () => {
            expect(declaredNodeFloorOf('OPEN_MT2_MIN_NODE_MAJOR=$WANTED\n')).to.equal(null);
            expect(declaredNodeFloorOf('OPEN_MT2_MIN_NODE_MAJOR=22 # tail\n')).to.equal(null);
            expect(declaredNodeFloorOf('# OPEN_MT2_MIN_NODE_MAJOR=22\n')).to.equal(null);
            expect(declaredNodeFloorOf('')).to.equal(null);
        });
    });

    describe('verifyNodeFloor', () => {
        it('should pass when the launcher agrees with the manifest', () => {
            const report = runVerify([launcher('OPEN_MT2_MIN_NODE_MAJOR=22\n')], '>=22');

            expect(report.failures).to.be.empty;
        });

        it('should fail on the exact disagreement 1.1.1 shipped', () => {
            // `package.json` asked for >=22 while this launcher accepted 20,
            // and the release gate passed because only the manifest was read.
            const report = runVerify([launcher('OPEN_MT2_MIN_NODE_MAJOR=20\n')], '>=22');

            expect(report.failures).to.have.lengthOf(1);
            expect(report.failures[0]).to.include('declares the Node floor as 20');
            expect(report.failures[0]).to.include('">=22"');
        });

        it('should fail when the launcher states no floor at all', () => {
            const report = runVerify([launcher('# OPEN_MT2_MIN_NODE_MAJOR=22\n')], '>=22');

            expect(report.failures).to.have.lengthOf(2);
            expect(report.failures[0]).to.include('bare number');
        });

        it('should fail when the tarball is missing the launcher', () => {
            const report = runVerify([], '>=22');

            expect(report.failures).to.have.lengthOf(1);
            expect(report.failures[0]).to.include('missing bin/common.sh');
        });

        it('should not be satisfied by a directory entry of the same name', () => {
            const report = runVerify([{ name: './open-mt2-1.1.2/bin/common.sh', type: '5' }], '>=22');

            expect(report.failures).to.have.lengthOf(1);
            expect(report.failures[0]).to.include('missing bin/common.sh');
        });

        it('should read the launcher and not some other shipped script', () => {
            const entries: TarEntry[] = [
                { name: './open-mt2-1.1.2/scripts/install.sh', type: '0', data: Buffer.from('MIN_NODE_MAJOR=20\n') },
                launcher('OPEN_MT2_MIN_NODE_MAJOR=22\n'),
            ];

            const report = runVerify(entries, '>=22');

            expect(report.failures).to.be.empty;
        });

        it('should count every check it runs, so the total reflects the gate', () => {
            expect(runVerify([launcher('OPEN_MT2_MIN_NODE_MAJOR=22\n')], '>=22').checks).to.equal(3);
        });
    });

    describe('the real shipped launcher against the real manifest', () => {
        it('should agree, so the repository as committed cannot ship 1.1.1 again', () => {
            // Read the two files the packager copies verbatim rather than
            // importing the modules, so this catches the source-tree state the
            // build actually stages.
            const fs = require('node:fs') as typeof import('node:fs');
            const path = require('node:path') as typeof import('node:path');
            const root = path.resolve(__dirname, '..', '..', '..', '..');
            const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')) as {
                engines?: { node?: string };
            };
            const contents = fs.readFileSync(path.join(root, 'deploy', 'launcher', 'common.sh'), 'utf8');

            const report = runVerify([launcher(contents)], pkg.engines?.node);

            expect(report.failures, report.failures.join('; ')).to.be.empty;
        });
    });
});
