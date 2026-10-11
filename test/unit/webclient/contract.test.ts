import { expect } from 'chai';
import { ConnectionStateEnum } from '@/core/enum/ConnectionStateEnum';
import { CONNECTION_STATE_NAMES, SERVICE_NAME } from '@/webclient/contract';

describe('webclient contract', () => {
    it('names every connection state the protocol actually uses', () => {
        // Guards against the label map drifting from the enum: an off-by-one
        // here made the SPA label SELECT as "login" and GAME as "loading".
        const expected: Record<number, string> = {
            [ConnectionStateEnum.CLOSE]: 'closed',
            [ConnectionStateEnum.HANDSHAKE]: 'handshake',
            [ConnectionStateEnum.LOGIN]: 'login',
            [ConnectionStateEnum.SELECT]: 'select',
            [ConnectionStateEnum.LOADING]: 'loading',
            [ConnectionStateEnum.GAME]: 'game',
            [ConnectionStateEnum.DEAD]: 'dead',
            [ConnectionStateEnum.AUTH]: 'auth',
        };
        expect(CONNECTION_STATE_NAMES).to.deep.equal(expected);
    });

    it('exposes a stable service name for the health payload', () => {
        expect(SERVICE_NAME).to.equal('open-mt2-web-client');
    });
});
