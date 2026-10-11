import {
    assertSupportedRuntime,
    isRuntimeSupported,
    MIN_NODE_MAJOR,
    unsupportedRuntimeReasons,
} from '@/core/util/nodeVersion';
import { expect } from 'chai';
import sinon from 'sinon';

/**
 * Reads `NAME=123` out of a shell script so the four declarations of the Node
 * floor can be compared. Commented-out assignments are deliberately skipped: a
 * `# MIN_NODE_MAJOR=20` left behind after a change is exactly the drift this
 * exists to catch, and it must not be allowed to read as the real value.
 */
function readShellNumber(file: string, name: string): number {
    const text = fs.readFileSync(file, 'utf8');
    const match = text.match(new RegExp(`^[ \\t]*${name}=(\\d+)[ \\t]*$`, 'm'));

    if (!match || match[1] === undefined) {
        throw new Error(`${name}= is not assigned as a bare number in ${path.relative(process.cwd(), file)}`);
    }

    return Number.parseInt(match[1], 10);
}

describe('nodeVersion', () => {
    describe('MIN_NODE_MAJOR', () => {
        it('is 22, the first release with Promise.withResolvers', () => {
            expect(MIN_NODE_MAJOR).to.equal(22);
        });

        it('should be the same floor the installers and launchers enforce', () => {
            // Four separate declarations of one number, and they run at
            // different times: package.json before install, install.sh while
            // choosing a system runtime, common.sh every launch, nodeVersion.ts
            // inside Node. Nothing links them, so drift is silent until someone
            // hits it on a board. install.sh will replace a system Node 20 with
            // a private 22.x runtime; common.sh is what stops OPEN_MT2_NODE (or
            // a PATH that changed after the install) from putting Node 20 back.
            const root = path.resolve(__dirname, '..', '..', '..', '..');

            for (const [file, name] of [
                ['deploy/scripts/install.sh', 'MIN_NODE_MAJOR'],
                ['deploy/launcher/common.sh', 'OPEN_MT2_MIN_NODE_MAJOR'],
            ] as const) {
                const value = readShellNumber(path.join(root, file), name);

                expect(value, `${file} declares ${value}, nodeVersion.ts declares ${MIN_NODE_MAJOR}`).to.equal(
                    MIN_NODE_MAJOR,
                );
            }
        });
    });

    describe('unsupportedRuntimeReasons', () => {
        it('reports nothing on a supported version', () => {
            expect(unsupportedRuntimeReasons('v22.0.0')).to.deep.equal([]);
            expect(unsupportedRuntimeReasons('v24.11.1')).to.deep.equal([]);
        });

        it('rejects an older major version', () => {
            const reasons = unsupportedRuntimeReasons('v20.20.2');
            expect(reasons).to.have.lengthOf(1);
            expect(reasons[0]).to.contain('too old');
            expect(reasons[0]).to.contain('22');
        });

        it('reports the missing feature when it is genuinely absent', () => {
            // Simulates a runtime whose version string lies about its age.
            const original = Promise.withResolvers;
            try {
                // @ts-expect-error deliberately removing the API for the test
                delete Promise.withResolvers;
                const reasons = unsupportedRuntimeReasons('v22.0.0');
                expect(reasons).to.have.lengthOf(1);
                expect(reasons[0]).to.contain('Promise.withResolvers');
            } finally {
                Promise.withResolvers = original;
            }
        });

        it('tolerates an unparsable version string', () => {
            expect(() => unsupportedRuntimeReasons('not-a-version')).to.not.throw();
        });
    });

    describe('isRuntimeSupported', () => {
        it('is true for the current runtime', () => {
            expect(isRuntimeSupported()).to.equal(true);
        });

        it('is false for a version below the minimum', () => {
            expect(isRuntimeSupported('v18.20.0')).to.equal(false);
        });
    });

    describe('assertSupportedRuntime', () => {
        afterEach(() => sinon.restore());

        it('does nothing on a supported runtime', () => {
            const exit = sinon.stub(process, 'exit');
            const write = sinon.stub(process.stderr, 'write');

            assertSupportedRuntime('v22.0.0');

            expect(exit.called).to.equal(false);
            expect(write.called).to.equal(false);
        });

        it('explains how to upgrade and exits 1 on an unsupported runtime', () => {
            const exit = sinon.stub(process, 'exit');
            const write = sinon.stub(process.stderr, 'write');

            assertSupportedRuntime('v20.20.2');

            expect(exit.calledOnceWith(1)).to.equal(true);
            expect(write.calledOnce).to.equal(true);

            const message = write.firstCall.args[0] as string;
            expect(message).to.contain('cannot start on this Node.js runtime');
            expect(message).to.contain('NodeSource');
            expect(message).to.contain('nvm');
            expect(message).to.contain(process.platform + '/' + process.arch);
        });
    });
});
