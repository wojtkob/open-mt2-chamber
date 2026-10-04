const OCTETS = 4;
const MAX_OCTET = 255;
const OCTET_PATTERN = /^\d{1,3}$/;

/**
 * IPv4 helpers for the login handshake.
 *
 * The client expects the game server address as a 32 bit integer holding the
 * four octets in network order, which the packet layer then writes as LE
 * (see CharactersInfoPacket). Byte-swapping the octets with `<<` makes the
 * intermediate value a *signed* int32 as soon as the last octet is >= 128, and
 * `Buffer.writeUInt32LE` rejects negative numbers with ERR_OUT_OF_RANGE. That
 * killed the character select screen for any address like 192.168.1.200 —
 * i.e. most DHCP addresses on a home LAN. Everything here stays in unsigned
 * 32 bit space so the value is always writable and always identical on every
 * CPU architecture (ARM64 included).
 */
export default class Ip {
    /**
     * Splits a dotted-quad into four unsigned octets.
     * @throws {Error} when the value is not a valid IPv4 literal.
     */
    static toOctets(ip: string): [number, number, number, number] {
        if (typeof ip !== 'string') {
            throw new Error(`[Ip] expected an IPv4 string, got: ${typeof ip}`);
        }

        const parts = ip.trim().split('.');

        if (parts.length !== OCTETS) {
            throw new Error(`[Ip] invalid IPv4 address "${ip}": expected ${OCTETS} octets, got ${parts.length}`);
        }

        const octets = parts.map((part) => {
            if (!OCTET_PATTERN.test(part)) {
                throw new Error(`[Ip] invalid IPv4 address "${ip}": "${part}" is not an octet`);
            }

            const value = Number.parseInt(part, 10);
            if (value > MAX_OCTET) {
                throw new Error(`[Ip] invalid IPv4 address "${ip}": octet ${value} is above ${MAX_OCTET}`);
            }

            return value;
        }) as [number, number, number, number];

        return octets;
    }

    static isValid(ip: string): boolean {
        try {
            Ip.toOctets(ip);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Converts an IPv4 literal into the unsigned 32 bit integer the client
     * protocol expects. The octets are laid out least-significant first, which
     * is what writing it back as an unsigned little-endian 32 bit value
     * reproduces as the original address.
     */
    static toInt(ip: string): number {
        const [first, second, third, fourth] = Ip.toOctets(ip);

        return (fourth * 0x1000000 + third * 0x10000 + second * 0x100 + first) >>> 0;
    }

    /** Inverse of {@link toInt}, handy for logs and assertions. */
    static fromInt(value: number): string {
        const unsigned = value >>> 0;
        return [unsigned & 0xff, (unsigned >>> 8) & 0xff, (unsigned >>> 16) & 0xff, (unsigned >>> 24) & 0xff].join('.');
    }
}
