import Ip from '@/core/util/Ip';
import { expect } from 'chai';

describe('Ip', () => {
    describe('toInt', () => {
        it('should convert IP address "0.0.0.0" to integer 0', () => {
            const result = Ip.toInt('0.0.0.0');
            expect(result).to.equal(0);
        });

        it('should convert IP address "127.0.0.1" to integer 16777343', () => {
            const result = Ip.toInt('127.0.0.1');
            expect(result).to.equal(16777343);
        });

        it('should convert IP address "192.168.0.1" to integer 16820416', () => {
            const result = Ip.toInt('192.168.0.1');
            expect(result).to.equal(16820416);
        });

        it('should convert IP address "1.1.1.1" to integer 16843009', () => {
            const result = Ip.toInt('1.1.1.1');
            expect(result).to.equal(16843009);
        });

        it('should handle single-digit IP parts correctly', () => {
            const result = Ip.toInt('1.1.1.1');
            expect(result).to.equal(16843009);
        });

        // The value is written with Buffer.writeUInt32LE when the character
        // list is sent, and that rejects negative numbers with ERR_OUT_OF_RANGE.
        // Any address whose last octet is >= 128 used to crash here, which is
        // most DHCP addresses on a home LAN.
        it('should stay unsigned for an address whose last octet is 255', () => {
            const result = Ip.toInt('255.255.255.255');
            expect(result).to.equal(4294967295);
            expect(result).to.be.at.least(0);
        });

        it('should stay unsigned for a typical LAN address such as 192.168.1.200', () => {
            const result = Ip.toInt('192.168.1.200');
            expect(result).to.equal(3355551936);
            expect(result).to.be.at.least(0);
        });

        it('should stay unsigned for a 10.x.x.x address above 127 in the last octet', () => {
            const result = Ip.toInt('10.0.0.200');
            expect(result).to.equal(3355443210);
            expect(result).to.be.at.least(0);
        });

        it('should always produce a value Buffer.writeUInt32LE accepts', () => {
            const addresses = [
                '0.0.0.0',
                '1.2.3.4',
                '10.0.0.1',
                '172.20.10.135',
                '192.168.1.134',
                '192.168.1.200',
                '255.255.255.255',
            ];

            for (const address of addresses) {
                const buffer = Buffer.alloc(4);
                expect(() => buffer.writeUInt32LE(Ip.toInt(address), 0), address).to.not.throw();
            }
        });

        it('should write the address back in the order the client expects', () => {
            for (const address of ['192.168.1.1', '192.168.1.200', '10.0.0.5']) {
                const buffer = Buffer.alloc(4);
                buffer.writeUInt32LE(Ip.toInt(address), 0);
                expect(Array.from(buffer).join('.')).to.equal(address);
            }
        });

        it('should trim surrounding whitespace', () => {
            expect(Ip.toInt(' 192.168.0.1 ')).to.equal(16820416);
        });

        it('should reject an address with too few octets', () => {
            expect(() => Ip.toInt('192.168.1')).to.throw(/invalid IPv4/);
        });

        it('should reject an address with too many octets', () => {
            expect(() => Ip.toInt('192.168.1.1.1')).to.throw(/invalid IPv4/);
        });

        it('should reject a non numeric octet', () => {
            expect(() => Ip.toInt('192.168.1.host')).to.throw(/invalid IPv4/);
        });

        it('should reject an octet above 255', () => {
            expect(() => Ip.toInt('192.168.1.256')).to.throw(/invalid IPv4/);
        });

        it('should reject an empty string', () => {
            expect(() => Ip.toInt('')).to.throw(/invalid IPv4/);
        });

        it('should reject a hostname, since hostnames are not resolved', () => {
            expect(() => Ip.toInt('pine-a64.local')).to.throw(/invalid IPv4/);
        });

        it('should reject a value that is not a string', () => {
            expect(() => Ip.toInt(undefined as unknown as string)).to.throw(/expected an IPv4 string/);
        });
    });

    describe('isValid', () => {
        it('accepts dotted quad literals', () => {
            expect(Ip.isValid('0.0.0.0')).to.be.true;
            expect(Ip.isValid('192.168.1.1')).to.be.true;
            expect(Ip.isValid('255.255.255.255')).to.be.true;
        });

        it('rejects anything else', () => {
            expect(Ip.isValid('192.168.1')).to.be.false;
            expect(Ip.isValid('192.168.1.256')).to.be.false;
            expect(Ip.isValid('server.local')).to.be.false;
            expect(Ip.isValid('')).to.be.false;
        });
    });

    describe('fromInt', () => {
        it('should be the inverse of toInt', () => {
            for (const address of ['0.0.0.0', '10.0.0.5', '192.168.1.1', '192.168.1.200', '255.255.255.255']) {
                expect(Ip.fromInt(Ip.toInt(address))).to.equal(address);
            }
        });

        it('should accept a signed 32 bit value', () => {
            expect(Ip.fromInt(-1)).to.equal('255.255.255.255');
        });
    });
});
