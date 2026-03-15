import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Brain, X, Loader } from 'lucide-react';
import { useLiveEvents, type LiveEvent } from '../hooks/useLiveEvents';

interface Message {
    id: string;
    role: 'user' | 'agent';
    content: string;
    model?: string;
    createdAt?: string;
    streaming?: boolean;
}

interface PersistedChannelMessage {
    id: string;
    role: 'user' | 'agent';
    content: string;
    model?: string;
    createdAt?: string;
}

interface WsPayload {
    type: string;
    clientMessageId?: string;
    content?: string;
    delta?: string;
    model?: string;
    error?: string;
}

const ChannelView = ({ agent, title }: { agent: string | null, title?: string }) => {
    const [messages, setMessages] = useState<Message[]>([]);
    const [inputVal, setInputVal] = useState('');
    const [loading, setLoading] = useState(false);
    const [wsConnected, setWsConnected] = useState(false);
    const endRef = useRef<HTMLDivElement>(null);
    const pendingClientIds = useRef<Set<string>>(new Set());
    const streamingIds = useRef<Set<string>>(new Set());
    const seenEventIds = useRef<Set<string>>(new Set());
    const wsRef = useRef<WebSocket | null>(null);
    const [showTrace, setShowTrace] = useState(false);
    const [traceData, setTraceData] = useState<{ fullPrompt: string, timestamp: string } | null>(null);
    const [traceLoading, setTraceLoading] = useState(false);

    const currentAgent = agent || 'General';
    const currentAgentId = useMemo(() => currentAgent.toLowerCase(), [currentAgent]);
    const displayTitle = title || `#${currentAgent.toLowerCase()}`;
    const subtitle = title
        ? `Project discussion led by ${currentAgent}.`
        : `Direct communications channel with ${currentAgent.charAt(0).toUpperCase() + currentAgent.slice(1)}.`;

    useEffect(() => {
        setMessages([]);
        pendingClientIds.current.clear();
        streamingIds.current.clear();
        seenEventIds.current.clear();
    }, [agent]);

    useEffect(() => {
        if (!agent) return;
        let active = true;

        const loadHistory = async () => {
            try {
                const res = await fetch(`/api/channels/${currentAgentId}/messages`);
                const data: unknown = await res.json();
                if (!active) return;
                const history = Array.isArray(data) ? (data as PersistedChannelMessage[]) : [];
                setMessages(history.map((m) => ({
                    id: m.id,
                    role: m.role,
                    content: m.content,
                    model: m.model,
                    createdAt: m.createdAt,
                })));
            } catch (e) {
                console.error('Failed to load channel history', e);
            }
        };

        loadHistory();
        return () => { active = false; };
    }, [agent, currentAgentId]);

    useEffect(() => {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const socket = new WebSocket(`${protocol}//${window.location.host}/ws`);
        wsRef.current = socket;

        socket.onopen = () => setWsConnected(true);
        socket.onclose = () => setWsConnected(false);
        socket.onerror = () => setWsConnected(false);
        socket.onmessage = (evt) => {
            let data: WsPayload;
            try {
                data = JSON.parse(evt.data) as WsPayload;
            } catch {
                return;
            }

            const clientMessageId = data.clientMessageId;
            if (!clientMessageId) return;
            if (!pendingClientIds.current.has(clientMessageId) && !streamingIds.current.has(clientMessageId)) return;

            if (data.type === 'chat.start') {
                streamingIds.current.add(clientMessageId);
                setMessages((prev) => {
                    if (prev.some((m) => m.id === clientMessageId)) return prev;
                    return [...prev, { id: clientMessageId, role: 'agent', content: '', streaming: true }];
                });
                return;
            }

            if (data.type === 'chat.chunk') {
                streamingIds.current.add(clientMessageId);
                setLoading(true);
                setMessages((prev) => prev.map((m) => (
                    m.id === clientMessageId
                        ? { ...m, role: 'agent', content: data.content ?? m.content, streaming: true }
                        : m
                )));
                return;
            }

            if (data.type === 'chat.done') {
                pendingClientIds.current.delete(clientMessageId);
                streamingIds.current.delete(clientMessageId);
                setLoading(false);
                setMessages((prev) => prev.map((m) => (
                    m.id === clientMessageId
                        ? { ...m, role: 'agent', content: data.content ?? m.content, model: data.model, streaming: false }
                        : m
                )));
                return;
            }

            if (data.type === 'chat.error') {
                pendingClientIds.current.delete(clientMessageId);
                streamingIds.current.delete(clientMessageId);
                setLoading(false);
                setMessages((prev) => {
                    const exists = prev.some((m) => m.id === clientMessageId);
                    if (exists) {
                        return prev.map((m) => (
                            m.id === clientMessageId ? { ...m, content: `Error: ${data.error ?? 'Unknown error'}`, streaming: false } : m
                        ));
                    }
                    return [...prev, { id: clientMessageId, role: 'agent', content: `Error: ${data.error ?? 'Unknown error'}` }];
                });
            }
        };

        return () => {
            wsRef.current = null;
            socket.close();
        };
    }, []);

    useLiveEvents((event: LiveEvent) => {
        if (!agent) return;
        if (seenEventIds.current.has(event.id)) return;
        seenEventIds.current.add(event.id);

        if (event.type === 'chat.user') {
            const payload = event.payload as { agent?: string; message?: string; clientMessageId?: string | null };
            if (payload.agent !== currentAgentId) return;
            if (payload.clientMessageId && pendingClientIds.current.has(payload.clientMessageId)) return;
            setMessages((prev) => [...prev, { id: event.id, role: 'user', content: payload.message ?? '' }]);
            return;
        }

        if (event.type === 'chat.agent' || event.type === 'chat.error') {
            const payload = event.payload as {
                agent?: string;
                reply?: string;
                error?: string;
                model?: string;
                clientMessageId?: string | null;
            };
            if (payload.agent !== currentAgentId) return;
            if (payload.clientMessageId && streamingIds.current.has(payload.clientMessageId)) return;
            if (payload.clientMessageId) pendingClientIds.current.delete(payload.clientMessageId);
            setLoading(false);
            setMessages((prev) => [...prev, {
                id: payload.clientMessageId ?? event.id,
                role: 'agent',
                content: event.type === 'chat.error' ? `Error: ${payload.error ?? 'Unknown error'}` : (payload.reply ?? ''),
                model: payload.model,
            }]);
        }
    });

    useEffect(() => {
        endRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const handleSend = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!inputVal.trim() || loading || !agent) return;

        const userMessage = inputVal.trim();
        const clientMessageId = `cv-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        pendingClientIds.current.add(clientMessageId);
        setInputVal('');
        setMessages((prev) => [...prev, { id: `${clientMessageId}-u`, role: 'user', content: userMessage }]);
        setLoading(true);

        if (wsConnected && wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({
                type: 'chat.send',
                agent: currentAgentId,
                message: userMessage,
                clientMessageId,
            }));
            return;
        }

        try {
            const res = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ agent: currentAgentId, message: userMessage, clientMessageId })
            });
            const data = await res.json();
            pendingClientIds.current.delete(clientMessageId);
            setMessages((prev) => [...prev, {
                id: clientMessageId,
                role: 'agent',
                content: data.reply || (data.error ? `Error: ${data.error}` : 'No response from API.'),
                model: data.model,
            }]);
        } catch (err) {
            pendingClientIds.current.delete(clientMessageId);
            const errorMessage = err instanceof Error ? err.message : 'Unknown error';
            setMessages((prev) => [...prev, { id: clientMessageId, role: 'agent', content: `Network Error: ${errorMessage}` }]);
        } finally {
            setLoading(false);
        }
    };

    const toggleTrace = async () => {
        if (showTrace) {
            setShowTrace(false);
            return;
        }
        setTraceLoading(true);
        setShowTrace(true);
        try {
            const res = await fetch(`/api/agents/${currentAgentId}/trace`);
            if (res.ok) {
                const data = await res.json();
                if (data.error) {
                    setTraceData(null);
                } else {
                    setTraceData(data);
                }
            } else {
                setTraceData(null);
            }
        } catch (e) {
            setTraceData(null);
        } finally {
            setTraceLoading(false);
        }
    };

    return (
        <div style={{ padding: '32px 48px', display: 'flex', flexDirection: 'column', height: '100%', maxWidth: '980px', margin: '0 auto', width: '100%' }} className="animate-fade-in">
            <div style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '20px', marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
                <div>
                    <h1 style={{ fontSize: '24px', fontWeight: 500, fontFamily: 'var(--font-serif)', letterSpacing: '-0.01em', margin: 0 }}>{displayTitle}</h1>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginTop: '8px' }}>{subtitle}</p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <button
                        onClick={toggleTrace}
                        style={{
                            display: 'flex', alignItems: 'center', gap: '8px',
                            fontSize: '11px', color: 'var(--accent-blue)',
                            border: '1px solid var(--accent-blue)', padding: '6px 10px',
                            borderRadius: '999px', background: 'transparent', cursor: 'pointer'
                        }}
                    >
                        <Brain size={14} /> Brain Trace
                    </button>
                    <div style={{ fontSize: '11px', color: wsConnected ? 'var(--accent-green)' : 'var(--text-tertiary)', border: '1px solid var(--border-color)', padding: '6px 10px', borderRadius: '999px' }}>
                        {wsConnected ? 'WebSocket Live Stream' : 'HTTP Fallback'}
                    </div>
                </div>
            </div>

            {showTrace && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
                    backgroundColor: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(8px)',
                    zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    padding: '40px'
                }} onClick={() => setShowTrace(false)}>
                    <div style={{
                        backgroundColor: '#fff', width: '100%', maxWidth: '800px', maxHeight: '80vh',
                        borderRadius: '24px', padding: '32px', display: 'flex', flexDirection: 'column',
                        gap: '24px', boxShadow: '0 20px 50px rgba(0,0,0,0.15)',
                        overflow: 'hidden'
                    }} onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <Brain size={24} color="var(--accent-blue)" />
                                <div>
                                    <h2 style={{ margin: 0, fontSize: '18px', fontFamily: 'var(--font-serif)' }}>Rationalization Trace: {currentAgent}</h2>
                                    {traceData && <p style={{ margin: 0, fontSize: '11px', color: 'var(--text-tertiary)' }}>Last Context Captured: {new Date(traceData.timestamp).toLocaleString()}</p>}
                                </div>
                            </div>
                            <button onClick={() => setShowTrace(false)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)' }}><X size={20} /></button>
                        </div>

                        <div style={{ flex: 1, overflowY: 'auto', backgroundColor: 'var(--bg-main)', borderRadius: '12px', padding: '20px', fontSize: '13px', lineHeight: '1.6', fontFamily: 'monospace', whiteSpace: 'pre-wrap', color: 'var(--text-secondary)' }}>
                            {traceLoading ? (
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '12px' }}>
                                    <Loader className="spin" size={20} /> Accessing agent memory layers...
                                </div>
                            ) : (
                                traceData ? traceData.fullPrompt : "No trace found for this agent in the current session. Send a message first."
                            )}
                        </div>

                        <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', padding: '8px' }}>
                            [!NOTE] Brain Trace reflects the exact internal context injected into the agent's recent thought cycle.
                        </div>
                    </div>
                </div>
            )}

            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '24px', paddingRight: '16px' }}>
                {messages.length === 0 ? (
                    <div style={{ color: 'var(--text-tertiary)', fontSize: '14px', textAlign: 'center', margin: 'auto', fontFamily: 'var(--font-serif)', fontStyle: 'italic' }}>
                        This is the beginning of your direct channel with {currentAgent}.
                    </div>
                ) : (
                    messages.map((m) => (
                        <div key={m.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '8px' }}>
                            <div style={{ fontSize: '12px', color: m.role === 'user' ? 'var(--text-primary)' : 'var(--accent-orange)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
                                {m.role === 'user' ? 'You' : currentAgent.charAt(0).toUpperCase() + currentAgent.slice(1)}
                                {m.streaming && <span style={{ fontSize: '10px', color: 'var(--text-tertiary)' }}>streaming...</span>}
                            </div>
                            <div style={{
                                fontSize: '15px',
                                lineHeight: '1.6',
                                color: 'var(--text-primary)',
                                whiteSpace: 'pre-wrap',
                                maxWidth: '100%',
                                border: '1px solid var(--border-color)',
                                borderRadius: '12px',
                                padding: '12px 14px',
                                background: m.role === 'user' ? 'var(--bg-panel)' : 'transparent',
                            }}>
                                {m.content}
                                {m.model && (
                                    <div style={{ marginTop: '8px', fontSize: '11px', color: 'var(--text-tertiary)' }}>
                                        Model: {m.model}
                                    </div>
                                )}
                            </div>
                        </div>
                    ))
                )}
                {loading && (
                    <div style={{ color: 'var(--text-tertiary)', fontSize: '14px', padding: '4px 0', fontFamily: 'var(--font-serif)', fontStyle: 'italic' }}>
                        {currentAgent} is typing...
                    </div>
                )}
                <div ref={endRef} />
            </div>

            <form onSubmit={handleSend} style={{
                marginTop: '24px',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--border-radius-lg)',
                padding: '12px 16px',
                backgroundColor: 'var(--bg-panel)',
                display: 'flex',
                gap: '12px',
                alignItems: 'center',
            }}>
                <input
                    type="text"
                    value={inputVal}
                    onChange={e => setInputVal(e.target.value)}
                    placeholder={agent ? `Message ${currentAgent}...` : 'Select an agent to chat...'}
                    disabled={!agent || loading}
                    style={{ flex: 1, border: 'none', background: 'transparent', outline: 'none', fontSize: '15px', color: 'var(--text-primary)' }}
                />
                <button type="submit" disabled={!agent || !inputVal.trim() || loading} style={{ color: 'var(--accent-orange)', fontWeight: 600, opacity: (!agent || !inputVal.trim() || loading) ? 0.3 : 1 }}>
                    Send
                </button>
            </form>
        </div>
    );
};

export default ChannelView;
