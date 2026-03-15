import { useEffect, useRef, useState } from 'react';

export type LiveEventType =
    | 'system.connected'
    | 'directive.created'
    | 'task.created'
    | 'task.updated'
    | 'task.deleted'
    | 'board.updated'
    | 'board.activity'
    | 'notifications.read_all'
    | 'chat.user'
    | 'chat.agent'
    | 'chat.error';

export interface LiveEvent<T = unknown> {
    id: string;
    type: LiveEventType | string;
    timestamp: string;
    payload: T;
}

export function useLiveEvents(onEvent?: (event: LiveEvent) => void) {
    const onEventRef = useRef(onEvent);
    const [connected, setConnected] = useState(false);

    useEffect(() => {
        onEventRef.current = onEvent;
    }, [onEvent]);

    useEffect(() => {
        const source = new EventSource('/api/events');

        source.onopen = () => setConnected(true);
        source.onerror = () => setConnected(false);
        source.onmessage = (evt) => {
            try {
                const parsed = JSON.parse(evt.data) as LiveEvent;
                onEventRef.current?.(parsed);
            } catch {
                // Ignore malformed event payloads.
            }
        };

        return () => {
            source.close();
            setConnected(false);
        };
    }, []);

    return { connected };
}
