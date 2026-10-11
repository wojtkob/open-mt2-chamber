import { EventEmitter } from 'node:events';

/**
 * A minimal strongly-typed facade over `node:events`.
 *
 * Subclasses declare an event map (`{ eventName: (...args) => void }`) and get
 * `on`/`off`/`once`/`emit` checked against it. The single cast to the base
 * `EventEmitter`'s untyped listener signature is confined here, so no `any`
 * leaks into the rest of the client.
 */
export default class TypedEventEmitter<Events extends Record<string, (...args: never[]) => void>> {
    private readonly emitter = new EventEmitter();

    on<K extends keyof Events & string>(event: K, listener: Events[K]): this {
        this.emitter.on(event, listener as unknown as (...args: unknown[]) => void);
        return this;
    }

    once<K extends keyof Events & string>(event: K, listener: Events[K]): this {
        this.emitter.once(event, listener as unknown as (...args: unknown[]) => void);
        return this;
    }

    off<K extends keyof Events & string>(event: K, listener: Events[K]): this {
        this.emitter.off(event, listener as unknown as (...args: unknown[]) => void);
        return this;
    }

    removeAllListeners(event?: keyof Events & string): this {
        this.emitter.removeAllListeners(event);
        return this;
    }

    listenerCount(event: keyof Events & string): number {
        return this.emitter.listenerCount(event);
    }

    protected emit<K extends keyof Events & string>(event: K, ...args: Parameters<Events[K]>): boolean {
        return this.emitter.emit(event, ...args);
    }
}
