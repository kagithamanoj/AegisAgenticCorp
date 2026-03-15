import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import { RadioTower, Megaphone, Search, Bell, MessageSquare, SidebarClose, SidebarOpen } from 'lucide-react';

interface LayoutProps {
    children: React.ReactNode;
}

interface LayoutTask {
    status?: string;
}

interface LayoutNotification {
    read?: boolean;
}

const LIVE_FEED_PREF_KEY = 'ocx:live-feed-open';
const LIVE_FEED_EVENT = 'ocx:live-feed-visibility';

const readLiveFeedPref = () => {
    if (typeof window === 'undefined') return true;
    const saved = window.localStorage.getItem(LIVE_FEED_PREF_KEY);
    if (saved === '0') return false;
    if (saved === '1') return true;
    return true;
};

const Layout: React.FC<LayoutProps> = ({ children }) => {
    const navigate = useNavigate();
    const location = useLocation();
    const [stats, setStats] = useState({ agents: 7, tasks: 0, unreadNotifs: 0 });
    const [isLiveFeedOpen, setIsLiveFeedOpen] = useState<boolean>(() => readLiveFeedPref());

    useEffect(() => {
        const fetchStats = async () => {
            try {
                const [agentsRes, tasksRes, notifsRes] = await Promise.all([
                    fetch('/api/agents'),
                    fetch('/api/tasks'),
                    fetch('/api/notifications')
                ]);
                const agentsData = await agentsRes.json();
                const tasksData = await tasksRes.json();
                const notifsData = await notifsRes.json();

                const taskList: LayoutTask[] = Array.isArray(tasksData) ? tasksData : [];
                const notifList: LayoutNotification[] = Array.isArray(notifsData) ? notifsData : [];

                const queueCount = taskList.filter((t) => t.status !== 'done').length;
                const unreadCount = notifList.filter((n) => !n.read).length;

                setStats({
                    agents: Array.isArray(agentsData) ? agentsData.length : (agentsData.agents?.length || 7),
                    tasks: queueCount,
                    unreadNotifs: unreadCount
                });
            } catch (e) {
                console.error("Failed to fetch layout stats", e);
            }
        };
        fetchStats();
        const interval = setInterval(fetchStats, 5000);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        const syncFromStorage = () => setIsLiveFeedOpen(readLiveFeedPref());
        const onStorage = (event: StorageEvent) => {
            if (event.key === LIVE_FEED_PREF_KEY) syncFromStorage();
        };
        const onLiveFeedEvent = () => syncFromStorage();

        window.addEventListener('storage', onStorage);
        window.addEventListener(LIVE_FEED_EVENT, onLiveFeedEvent as EventListener);
        return () => {
            window.removeEventListener('storage', onStorage);
            window.removeEventListener(LIVE_FEED_EVENT, onLiveFeedEvent as EventListener);
        };
    }, []);

    const toggleLiveFeed = () => {
        const next = !isLiveFeedOpen;
        window.localStorage.setItem(LIVE_FEED_PREF_KEY, next ? '1' : '0');
        setIsLiveFeedOpen(next);
        window.dispatchEvent(new CustomEvent(LIVE_FEED_EVENT, { detail: { open: next } }));
    };

    const isMissionView = location.pathname === '/mission';
    const isSquadView = location.pathname === '/squad';

    return (
        <div className="layout-container">
            <Sidebar />

            <main className="main-content">
                <header className="topbar">
                    <div className="topbar-stats">
                        <button
                            type="button"
                            className={`stat-item stat-item-button ${isSquadView ? 'active' : ''}`}
                            onClick={() => navigate('/squad')}
                            title="Open Squad view (active agents)"
                        >
                            <span className="stat-value">{stats.agents}</span>
                            <span className="stat-label">Agents Active</span>
                        </button>
                        <button
                            type="button"
                            className={`stat-item stat-item-button ${isMissionView ? 'active' : ''}`}
                            style={{ marginLeft: '12px' }}
                            onClick={() => navigate('/mission')}
                            title="Open Mission Control (tasks in queue)"
                        >
                            <span className="stat-value">{stats.tasks}</span>
                            <span className="stat-label">Tasks in Queue</span>
                        </button>
                    </div>

                    <div className="topbar-actions">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--accent-green)', backgroundColor: 'var(--accent-green-light)', padding: '6px 12px', borderRadius: '20px', fontSize: '11px', fontWeight: 700, letterSpacing: '0.5px' }}>
                            <RadioTower size={14} /> ACTIVE
                        </div>

                        <button
                            className={`btn-secondary ${location.pathname === '/channel/monica' ? 'active' : ''}`}
                            onClick={() => navigate('/channel/monica')}
                        >
                            <MessageSquare size={14} /> War Room
                        </button>

                        {isMissionView && (
                            <button
                                className={`btn-secondary ${isLiveFeedOpen ? 'active' : ''}`}
                                onClick={toggleLiveFeed}
                                aria-pressed={isLiveFeedOpen}
                                title={isLiveFeedOpen ? 'Hide live feed panel' : 'Show live feed panel'}
                            >
                                {isLiveFeedOpen ? <SidebarClose size={14} /> : <SidebarOpen size={14} />}
                                Live Feed
                            </button>
                        )}

                        <button
                            className={`btn-primary ${location.pathname === '/broadcast' ? 'active' : ''}`}
                            onClick={() => navigate('/broadcast')}
                        >
                            <Megaphone size={14} /> Broadcast
                        </button>

                        <div style={{ width: '1px', height: '20px', backgroundColor: 'var(--border-color)', margin: '0 8px' }}></div>

                        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                            <Search size={14} style={{ position: 'absolute', left: '10px', color: 'var(--text-tertiary)' }} />
                            <input
                                type="text"
                                placeholder="Search..."
                                style={{
                                    padding: '6px 12px 6px 32px',
                                    borderRadius: '20px',
                                    border: '1px solid var(--border-color)',
                                    backgroundColor: 'var(--bg-panel)',
                                    fontSize: '13px',
                                    color: 'var(--text-primary)',
                                    width: '180px',
                                    outline: 'none',
                                    transition: 'border-color 0.2s',
                                    fontFamily: 'var(--font-base)'
                                }}
                            />
                        </div>

                        <button
                            style={{ color: location.pathname === '/notifications' ? 'var(--text-primary)' : 'var(--text-secondary)', position: 'relative', background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px' }}
                            onClick={() => navigate('/notifications')}
                        >
                            <Bell size={18} />
                            {stats.unreadNotifs > 0 && (
                                <div style={{ position: 'absolute', top: 2, right: 4, width: 8, height: 8, backgroundColor: 'var(--accent-red)', borderRadius: '50%' }}></div>
                            )}
                        </button>
                    </div>
                </header>

                <div className="content-area-wrapper">
                    {children}
                </div>
            </main>
        </div>
    );
};

export default Layout;
