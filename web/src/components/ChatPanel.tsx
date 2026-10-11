import { useEffect, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react';
import type { ChatEntry } from '@/webclient/contract';
import { formatTimeOfDay } from '../lib/format';

export type ChatPanelProps = {
    chatLog: ChatEntry[];
    disabled: boolean;
    onSend: (message: string) => void | Promise<void>;
};

const MAX_MESSAGE_LENGTH = 255;

/** Scrolling chat log with an inline composer (Enter or the button sends). */
export function ChatPanel({ chatLog, disabled, onSend }: ChatPanelProps): ReactNode {
    const [message, setMessage] = useState('');
    const logRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const node = logRef.current;
        if (node !== null) node.scrollTop = node.scrollHeight;
    }, [chatLog.length]);

    const submit = (event: FormEvent<HTMLFormElement>): void => {
        event.preventDefault();
        const text = message.trim();
        if (text.length === 0) return;
        setMessage('');
        void onSend(text);
    };

    return (
        <div className="chat">
            <div className="chat__log" ref={logRef} role="log" aria-live="polite" aria-label="Chat log">
                {chatLog.length === 0 ? (
                    <p className="chat__empty">No messages yet.</p>
                ) : (
                    chatLog.map((entry, index) => (
                        <p key={`${entry.receivedAt}-${index}`} className="chat__line">
                            <span className="chat__time">{formatTimeOfDay(entry.receivedAt)}</span>
                            {entry.vid !== 0 ? <span className="chat__who">#{entry.vid}</span> : null}
                            <span className="chat__text">{entry.message}</span>
                        </p>
                    ))
                )}
            </div>
            <form className="chat__form" onSubmit={submit}>
                <input
                    type="text"
                    className="input chat__input"
                    value={message}
                    maxLength={MAX_MESSAGE_LENGTH}
                    placeholder={disabled ? 'Enter the world to chat' : 'Say something…'}
                    disabled={disabled}
                    aria-label="Chat message"
                    onChange={(event: ChangeEvent<HTMLInputElement>) => setMessage(event.target.value)}
                />
                <button type="submit" className="btn btn--primary" disabled={disabled || message.trim().length === 0}>
                    Send
                </button>
            </form>
        </div>
    );
}
