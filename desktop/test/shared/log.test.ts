import { expect } from 'chai';
import { formatLogLine, errorText, levelEnabled } from '../../src/shared/log';

describe('desktop/shared/log', () => {
    it('formatLogLine renders the ISO timestamp, level and scope', () => {
        const line = formatLogLine(
            'info',
            'listening on http://127.0.0.1:51324',
            'bridge',
            new Date('2026-10-12T09:15:33.123Z'),
        );
        expect(line).to.equal('2026-10-12T09:15:33.123Z info  [bridge] listening on http://127.0.0.1:51324');
    });

    it('omits the scope when absent', () => {
        const line = formatLogLine('error', 'boom', undefined, new Date('2026-01-01T00:00:00.000Z'));
        expect(line).to.equal('2026-01-01T00:00:00.000Z error boom');
    });

    it('levelEnabled compares configured level to message level', () => {
        expect(levelEnabled('error', 'error')).to.equal(true);
        expect(levelEnabled('debug', 'info')).to.equal(false);
        expect(levelEnabled('info', 'debug')).to.equal(true);
        expect(levelEnabled('warn', 'error')).to.equal(false);
        expect(levelEnabled('info', 'error')).to.equal(false);
    });

    it('errorText never throws on exotic values', () => {
        expect(errorText(new Error('kaboom'))).to.match(/kaboom/);
        expect(errorText('nope')).to.equal('nope');
        expect(typeof errorText(Symbol('x'))).to.equal('string');
        expect(errorText({ a: 1 })).to.contain('"a":1');
    });
});
