import {
    assertSupportedRuntime,
    isRuntimeSupported,
    MIN_NODE_MAJOR,
    unsupportedRuntimeReasons,
} from '@/core/util/nodeVersion';
import { expect } from 'chai';
import sinon from 'sinon';

describe('nodeVersion', () => {
    describe('MIN_NODE_MAJOR', () => {
        it('is 22, the first release with Promise.withResolvers', () => {
            expect(MIN_NODE_MAJOR).to.equal(22);
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
