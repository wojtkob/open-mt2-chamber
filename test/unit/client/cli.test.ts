import { expect } from 'chai';
import { parseArgs, resolveCharacterSlot } from '@/client/cli';
import { InvalidArgumentError } from '@/client/errors';
import type { CharacterSummary } from '@/client/protocol/ServerPackets';

function character(slot: number, name = `Hero${slot}`): CharacterSummary {
    return {
        slot,
        id: slot + 1,
        name,
        playerClass: 0,
        level: 1,
        playTime: 0,
        st: 0,
        ht: 0,
        dx: 0,
        iq: 0,
        bodyPart: 0,
        nameChange: 0,
        hairPart: 0,
        positionX: 0,
        positionY: 0,
        ip: 0,
        port: 0,
        skillGroup: 0,
        guildId: 0,
        guildName: '',
    };
}

describe('client CLI: parseArgs', () => {
    it('reads the command and every long option', () => {
        const options = parseArgs([
            'play',
            '--auth-host',
            'auth.example',
            '--auth-port',
            '11002',
            '--game-host',
            'game.example',
            '--game-port',
            '13001',
            '--username',
            'bob',
            '--password',
            'secret',
            '--slot',
            '2',
            '--message',
            'hi',
            '--seconds',
            '5',
            '--json',
        ]);

        expect(options).to.deep.equal({
            command: 'play',
            authHost: 'auth.example',
            authPort: 11002,
            gameHost: 'game.example',
            gamePort: 13001,
            username: 'bob',
            password: 'secret',
            slot: 2,
            message: 'hi',
            seconds: 5,
            json: true,
            help: false,
        });
    });

    it('accepts the short aliases', () => {
        const options = parseArgs(['login', '-u', 'bob', '-p', 'secret', '-s', '1', '-m', 'yo']);
        expect(options.command).to.equal('login');
        expect(options.username).to.equal('bob');
        expect(options.password).to.equal('secret');
        expect(options.slot).to.equal(1);
        expect(options.message).to.equal('yo');
    });

    it('applies defaults for the optional fields', () => {
        const options = parseArgs(['status']);
        expect(options).to.include({ command: 'status', seconds: 30, json: false, help: false });
        expect(options.authPort).to.equal(null);
        expect(options.slot).to.equal(null);
    });

    it('flags help without a command', () => {
        expect(parseArgs(['--help']).help).to.equal(true);
        expect(parseArgs(['-h']).help).to.equal(true);
    });

    it('rejects a flag with a missing value', () => {
        expect(() => parseArgs(['login', '--username'])).to.throw(InvalidArgumentError, 'Missing value for --username');
    });

    it('rejects an unknown option', () => {
        expect(() => parseArgs(['login', '--nope'])).to.throw(InvalidArgumentError, 'Unknown option: --nope');
    });

    it('rejects a non-numeric port', () => {
        expect(() => parseArgs(['login', '--auth-port', 'abc'])).to.throw(
            InvalidArgumentError,
            'Invalid number for --auth-port: abc',
        );
    });

    it('rejects a negative port', () => {
        expect(() => parseArgs(['login', '--game-port', '-1'])).to.throw(
            InvalidArgumentError,
            'Invalid number for --game-port: -1',
        );
    });

    it('rejects a second positional argument', () => {
        expect(() => parseArgs(['login', 'play'])).to.throw(InvalidArgumentError, 'Unexpected argument: play');
    });
});

describe('client CLI: resolveCharacterSlot', () => {
    it('falls back to the first occupied slot', () => {
        expect(resolveCharacterSlot([character(1), character(3)], null)).to.equal(1);
    });

    it('returns the requested slot when it is occupied', () => {
        expect(resolveCharacterSlot([character(0), character(2)], 2)).to.equal(2);
    });

    it('rejects an empty account when no slot was requested', () => {
        expect(() => resolveCharacterSlot([], null)).to.throw(InvalidArgumentError, 'no characters to play');
    });

    it('rejects an empty account even when a slot was requested', () => {
        expect(() => resolveCharacterSlot([], 2)).to.throw(InvalidArgumentError, 'No character on slot 2');
    });

    it('rejects an empty character slot', () => {
        expect(() => resolveCharacterSlot([character(0), character(2)], 3)).to.throw(
            InvalidArgumentError,
            'No character on slot 3',
        );
    });
});
