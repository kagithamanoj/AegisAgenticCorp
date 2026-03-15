import { useState, useRef, useEffect, useMemo } from 'react';
import { Send, User, MessageSquare, AlertTriangle, Activity } from 'lucide-react';
import './LiveFeed.css';
import { useLiveEvents, type LiveEvent } from '../hooks/useLiveEvents';

type FeedItem = {
    id: string;
    type: 'chat' | 'system' | 'task' | 'directive';
    agent: string;
    time: string;
    icon: React.ReactNode;
    content?: string;
    action?: string;
    role?: 'LEAD';
    model?: string;
    channel?: 'chat' | 'tasks' | 'telemetry' | 'directive';
};

type CoinbaseDecision = {
    timestamp: string;
    agent: string;
    action: string;
    rationale?: string;
};

type CoinbaseLatestResponse = {
    decisions?: CoinbaseDecision[];
};

const INITIAL_FEED: FeedItem[] = [];

const LiveFeed = () => {
    const [inputVal, setInputVal] = useState('');
    const [feed, setFeed] = useState(INITIAL_FEED);
    const [loading, setLoading] = useState(false);
    const [activeTab, setActiveTab] = useState<'all' | 'tasks' | 'decisions' | 'comms'>('all');
    const endRef = useRef<HTMLDivElement>(null);
    const seenDecisions = useRef<Set<string>>(new Set());
    const localPendingClientIds = useRef<Set<string>>(new Set());
    const seenEventIds = useRef<Set<string>>(new Set());

    const { connected } = useLiveEvents((event: LiveEvent) => {
        if (seenEventIds.current.has(event.id)) return;
        seenEventIds.current.add(event.id);

        const time = new Date(event.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        if (event.type === 'chat.user') {
            const payload = event.payload as {
                message?: string;
                clientMessageId?: string | null;
            };
            if (payload.clientMessageId && localPendingClientIds.current.has(payload.clientMessageId)) return;

            setFeed(prev => [...prev, {
                id: event.id,
                type: 'chat',
                channel: 'chat',
                agent: 'You',
                content: payload.message ?? '',
                time,
                icon: <User size={16} />
            }]);
            return;
        }

        if (event.type === 'chat.agent' || event.type === 'chat.error') {
            const payload = event.payload as {
                agent?: string;
                agentLabel?: string;
                reply?: string;
                error?: string;
                model?: string;
                clientMessageId?: string | null;
            };
            if (payload.clientMessageId) localPendingClientIds.current.delete(payload.clientMessageId);
            setLoading(false);

            setFeed(prev => [...prev, {
                id: event.id,
                type: 'chat',
                channel: 'chat',
                agent: event.type === 'chat.error' ? 'System' : (payload.agentLabel ?? 'Agent'),
                role: payload.agent === 'monica' ? 'LEAD' : undefined,
                content: event.type === 'chat.error' ? `Error: ${payload.error ?? 'Unknown error'}` : (payload.reply ?? ''),
                model: payload.model,
                time,
                icon: event.type === 'chat.error' ? <AlertTriangle size={16} /> : <MessageSquare size={16} />
            }]);
            return;
        }

        if (event.type === 'directive.created') {
            const payload = event.payload as { target?: string; directive?: string; author?: string };
            setFeed(prev => [...prev, {
                id: event.id,
                type: 'directive',
                channel: 'directive',
                agent: payload.author ?? 'CEO',
                action: `Directive to ${payload.target ?? 'SQUAD'}: ${payload.directive ?? ''}`,
                time,
                icon: <Activity size={16} />
            }]);
            return;
        }

        if (event.type.startsWith('task.')) {
            const payload = event.payload as {
                task?: { title?: string; status?: string; assignee?: string };
                oldStatus?: string;
            };
            const taskTitle = payload.task?.title ?? 'Untitled task';
            const action = event.type === 'task.created'
                ? `Task created: ${taskTitle}${payload.task?.assignee ? ` -> ${payload.task.assignee}` : ''}`
                : event.type === 'task.updated'
                    ? `Task updated: ${taskTitle} (${payload.oldStatus ?? 'unknown'} -> ${payload.task?.status ?? 'unknown'})`
                    : `Task deleted: ${taskTitle}`;

            setFeed(prev => [...prev, {
                id: event.id,
                type: 'task',
                channel: 'tasks',
                agent: 'Mission Control',
                action,
                time,
                icon: <Activity size={16} />
            }]);
        }
    });

    useEffect(() => {
        const fetchCoinbaseData = async () => {
            try {
                const res = await fetch('/api/coinbase/latest');
                if (!res.ok) return;
                const data: CoinbaseLatestResponse = await res.json();

                if (data.decisions && Array.isArray(data.decisions)) {
                    const newEntries: FeedItem[] = [];
                    data.decisions.forEach((d) => {
                        const decisionId = `${d.timestamp}-${d.agent}-${d.action}`;
                        if (!seenDecisions.current.has(decisionId)) {
                            seenDecisions.current.add(decisionId);
                            newEntries.push({
                                id: decisionId,
                                type: 'system',
                                channel: 'telemetry',
                                agent: d.agent,
                                action: `${d.action}: ${d.rationale ?? ''}`.trim(),
                                time: new Date(d.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                                icon: <Activity size={16} />
                            });
                        }
                    });

                    if (newEntries.length > 0) {
                        setFeed(prev => [...prev, ...newEntries]);
                    }
                }
            } catch (e) {
                console.error('Feed poll error', e);
            }
        };

        fetchCoinbaseData();
        const interval = setInterval(fetchCoinbaseData, 10000);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        endRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [feed]);

    const visibleFeed = useMemo(() => {
        if (activeTab === 'all') return feed;
        if (activeTab === 'tasks') return feed.filter(item => item.channel === 'tasks');
        if (activeTab === 'decisions') return feed.filter(item => item.channel === 'telemetry');
        return feed.filter(item => item.channel === 'chat' || item.channel === 'directive');
    }, [activeTab, feed]);

    const handleSend = async () => {
        if (!inputVal.trim() || loading) return;

        const clientMessageId = `lf-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        localPendingClientIds.current.add(clientMessageId);

        const userMsg: FeedItem = {
            id: Date.now().toString(),
            type: 'chat',
            channel: 'chat',
            agent: 'You',
            content: inputVal,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            icon: <User size={16} />
        };

        setFeed(prev => [...prev, userMsg]);
        setInputVal('');
        setLoading(true);

        try {
            const res = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ agent: 'monica', message: userMsg.content, clientMessageId })
            });
            const data = await res.json();

            if (!connected) {
                const monicaReply: FeedItem = {
                    id: `${Date.now()}-reply`,
                    type: 'chat',
                    channel: 'chat',
                    agent: 'Monica',
                    role: 'LEAD',
                    content: data.reply || (data.error ? `Error: ${data.error}` : 'API Error'),
                    model: data.model,
                    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                    icon: <MessageSquare size={16} />
                };
                setFeed(prev => [...prev, monicaReply]);
                localPendingClientIds.current.delete(clientMessageId);
                setLoading(false);
            }
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Unknown error';
            localPendingClientIds.current.delete(clientMessageId);
            const errorReply: FeedItem = {
                id: `${Date.now()}-error`,
                type: 'chat',
                channel: 'chat',
                agent: 'System',
                content: `Error: ${errorMessage}`,
                time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                icon: <AlertTriangle size={16} />
            };
            setFeed(prev => [...prev, errorReply]);
            setLoading(false);
        }
    };

    return (
        <div className="live-feed-panel">
            <div className="feed-header">
                <div className="feed-title-row">
                    <span className="status-dot status-working"></span>
                    <h2>Live Feed</h2>
                    <span className="feed-model" style={{ marginLeft: 8 }}>{connected ? 'SSE LIVE' : 'FALLBACK'}</span>
                </div>
                <div className="feed-tabs">
                    <button type="button" className={`feed-tab ${activeTab === 'all' ? 'active' : ''}`} onClick={() => setActiveTab('all')}>All</button>
                    <button type="button" className={`feed-tab ${activeTab === 'tasks' ? 'active' : ''}`} onClick={() => setActiveTab('tasks')}>Tasks</button>
                    <button type="button" className={`feed-tab ${activeTab === 'decisions' ? 'active' : ''}`} onClick={() => setActiveTab('decisions')}>Decisions</button>
                    <button type="button" className={`feed-tab ${activeTab === 'comms' ? 'active' : ''}`} onClick={() => setActiveTab('comms')}>Comms</button>
                </div>
            </div>

            <div className="feed-content">
                {visibleFeed.map(item => (
                    <div key={item.id} className="feed-item">
                        <div className="feed-avatar" style={{ color: 'var(--text-secondary)' }}>{item.icon}</div>

                        <div className="feed-body">
                            <div className="feed-meta">
                                <span className="feed-author">{item.agent}</span>
                                {item.role === 'LEAD' && <span className="badge badge-lead">LEAD</span>}
                                {item.model && <span className="feed-model">{item.model}</span>}
                                <span className="feed-time">{item.time}</span>
                            </div>

                            {item.type === 'task' || item.type === 'system' || item.type === 'directive' ? (
                                <div className="feed-action" style={{ color: item.type === 'task' ? 'var(--accent-green)' : 'var(--text-secondary)' }}>
                                    {item.action}
                                </div>
                            ) : (
                                <div className="feed-message">
                                    {item.content}
                                </div>
                            )}
                        </div>
                    </div>
                ))}
                {loading && (
                    <div className="feed-item">
                        <div className="feed-avatar" style={{ color: 'var(--text-secondary)' }}><MessageSquare size={16} /></div>
                        <div className="feed-body">
                            <div className="feed-meta"><span className="feed-time">Monica is typing...</span></div>
                        </div>
                    </div>
                )}
                <div ref={endRef} />
            </div>

            <div className="feed-input-wrapper">
                <div className="feed-input-box">
                    <input
                        type="text"
                        placeholder="Message Monica..."
                        value={inputVal}
                        onChange={e => setInputVal(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleSend()}
                    />
                    <button className="send-btn" onClick={handleSend} disabled={loading}>
                        <Send size={16} />
                    </button>
                </div>
            </div>
        </div>
    );
};

export default LiveFeed;
