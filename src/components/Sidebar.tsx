import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { LayoutDashboard, Users, BarChart3, Settings, Briefcase, FileText, Shield } from 'lucide-react';
import './Sidebar.css';

const BASE_SQUAD = [
    { id: 'monica', name: 'Monica', role: 'Chief of Staff', type: 'lead' },
    { id: 'alex', name: 'Alex', role: 'Research Analyst', type: 'lead' },
    { id: 'zara', name: 'Zara', role: 'Content Writer', type: 'spc' },
    { id: 'dev', name: 'Dev', role: 'Full Stack Dev', type: 'spc' },
    { id: 'emma', name: 'Emma', role: 'Data Analytics', type: 'spc' },
    { id: 'sam', name: 'Sam', role: 'Ops Strategist', type: 'spc' },
    { id: 'leo', name: 'Leo', role: 'Growth Strategist', type: 'spc' }
];

interface Project {
    id: string;
    name: string;
}

interface AnalyticsSummary {
    tasks_completed?: number;
    tokens_used?: number;
}

interface CoinbaseDecision {
    agent?: string;
    details?: {
        risk_status?: {
            total_pnl?: number;
        };
    };
}

interface CoinbaseLatestResponse {
    decisions?: CoinbaseDecision[];
}

interface SquadMember {
    id: string;
    name: string;
    role: string;
    type: string;
    status: string;
    activity?: string;
}

const Sidebar: React.FC = () => {
    const [projects, setProjects] = useState<Project[]>([]);
    const [squad, setSquad] = useState<SquadMember[]>(BASE_SQUAD.map(s => ({ ...s, status: 'idle', activity: 'Idle' })));
    const navigate = useNavigate();
    const location = useLocation();

    useEffect(() => {
        const fetchProjects = async () => {
            try {
                const res = await fetch('/api/projects');
                const data: unknown = await res.json();
                setProjects(Array.isArray(data) ? data as Project[] : []);
            } catch (e) {
                console.error('Failed to fetch projects', e);
            }
        };
        fetchProjects();
    }, []);

    useEffect(() => {
        const fetchSquadStatus = async () => {
            try {
                const res = await fetch('/api/agents');
                const data = await res.json();
                if (Array.isArray(data)) {
                    setSquad(prev => prev.map(member => {
                        const found = data.find((a: any) => a.id === member.id);
                        return found ? { ...member, status: found.status } : member;
                    }));
                }
            } catch (e) {
                console.error('Failed to fetch agent statuses', e);
            }
        };

        fetchSquadStatus();

        // Listen to SSE events for real-time updates as well as polling fallback
        const sse = new EventSource('/api/events');
        sse.onmessage = (e) => {
            const ev = JSON.parse(e.data);
            if (ev.type === 'chat.agent' || ev.type === 'chat.user') {
                fetchSquadStatus();
            }
        };

        const int = setInterval(fetchSquadStatus, 5000);
        return () => {
            clearInterval(int);
            sse.close();
        };
    }, []);

    return (
        <aside className="sidebar" style={{ display: 'flex', flexDirection: 'column' }}>
            <div className="sidebar-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div className="company-logo" style={{ backgroundImage: 'url(/logo.svg)', backgroundSize: 'contain', backgroundRepeat: 'no-repeat', backgroundPosition: 'center', width: '32px', height: '32px' }}></div>
                    <h2 style={{ fontSize: '18px', margin: 0, fontFamily: 'var(--font-serif)', letterSpacing: '-0.02em' }}>AegisCorp Agentic Intelligence</h2>
                </div>
            </div>

            <nav className="sidebar-nav">
                <button className={`nav-item ${location.pathname === '/' || location.pathname === '/dashboard' ? 'active' : ''}`} onClick={() => navigate('/')}>
                    <LayoutDashboard size={14} /> Dashboard
                </button>
                <button className={`nav-item ${location.pathname === '/mission' ? 'active' : ''}`} onClick={() => navigate('/mission')}>
                    <Shield size={14} /> Mission Control
                </button>
                <button className={`nav-item ${location.pathname === '/squad' ? 'active' : ''}`} onClick={() => navigate('/squad')}>
                    <Users size={14} /> My Squad
                </button>
                <button className={`nav-item ${location.pathname === '/analytics' ? 'active' : ''}`} onClick={() => navigate('/analytics')}>
                    <BarChart3 size={14} /> ROI Report
                </button>
                <button className={`nav-item ${location.pathname === '/settings' ? 'active' : ''}`} onClick={() => navigate('/settings')}>
                    <Settings name="Settings" size={14} /> Settings
                </button>
            </nav>

            <ROICard />

            {projects.length > 0 && (
                <div className="sidebar-section">
                    <h3 className="section-title" style={{ padding: '0 20px', marginBottom: '8px', marginTop: '16px' }}>Projects</h3>
                    <nav className="sidebar-nav">
                        {projects.map(p => (
                            <button key={p.id} className={`nav-item ${location.pathname === `/project/${p.id}` ? 'active' : ''}`} onClick={() => navigate(`/project/${p.id}`)}>
                                <Briefcase size={14} /> {p.name}
                            </button>
                        ))}
                    </nav>
                </div>
            )}



            <div className="sidebar-squad">
                <div className="squad-header">
                    <h3 className="section-title">Squad ({squad.filter(s => s.status === 'working').length} Active)</h3>
                </div>

                <div className="squad-list">
                    {squad.map(agent => (
                        <div key={agent.id} className="squad-member" onClick={() => navigate(`/channel/${agent.id}`)} style={{ cursor: 'pointer' }}>
                            <div className="squad-avatar-wrapper">
                                <div className="squad-avatar">{agent.name.charAt(0)}</div>
                                {agent.id === 'monica' && <span style={{ position: 'absolute', bottom: -4, right: -4, fontSize: '10px' }}>👑</span>}
                                {agent.id === 'dev' && <span style={{ position: 'absolute', bottom: -4, right: -4, fontSize: '10px' }}>💻</span>}
                            </div>
                            <div className="squad-info">
                                <div className="squad-name-row">
                                    <span className="squad-name">{agent.name}</span>
                                    <span className={`badge ${agent.type === 'lead' ? 'badge-lead' : 'badge-spc'}`}>
                                        {agent.type.toUpperCase()}
                                    </span>
                                </div>
                                <div className="squad-role">{agent.role}</div>
                            </div>
                            <div className="squad-status">
                                <span className={`status-dot ${agent.status === 'working' ? 'status-working' : 'status-idle'}`}></span>
                                <span className="status-text" style={{ color: agent.status === 'working' ? 'var(--accent-green)' : 'var(--text-tertiary)' }}>
                                    {agent.activity || agent.status.toUpperCase()}
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            <div className="sidebar-footer" style={{ marginTop: 'auto', padding: '16px 20px', fontSize: '11px', color: 'var(--text-tertiary)', borderTop: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <a href="#" style={{ color: 'inherit', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '6px' }}><FileText size={12} /> Legal Terms</a>
                <a href="#" style={{ color: 'inherit', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '6px' }}><Shield size={12} /> Privacy Policy</a>
                <span style={{ marginTop: '4px' }}>&copy; 2026 AegisCorp Agentic Intelligence</span>
            </div>
        </aside>
    );
};

const ROICard = () => {
    const [savings, setSavings] = useState<string>('$0.00');

    useEffect(() => {
        const fetchROIShort = async () => {
            try {
                const [aRes, cRes] = await Promise.all([
                    fetch('/api/analytics'),
                    fetch('/api/coinbase/latest')
                ]);
                const aData: AnalyticsSummary = await aRes.json();

                // Simplified calculation for sidebar
                const hours = (aData.tasks_completed || 0) * 2.5;
                const cost = ((aData.tokens_used || 0) / 1000) * 0.005;
                let trading = 0;

                if (cRes.ok) {
                    const cData: CoinbaseLatestResponse = await cRes.json();
                    const latestMonica = [...(cData.decisions ?? [])]
                        .reverse()
                        .find((d) => d.agent === 'Monica' && d.details?.risk_status);
                    if (latestMonica?.details?.risk_status?.total_pnl != null) {
                        trading = latestMonica.details.risk_status.total_pnl;
                    }
                }

                const total = (hours * 75) - cost + trading;
                setSavings(new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(total));
            } catch {
                // Ignore transient sidebar metric fetch errors; next poll retries.
            }
        };
        fetchROIShort();
        const int = setInterval(fetchROIShort, 10000);
        return () => clearInterval(int);
    }, []);

    return (
        <div className="roi-card-sidebar">
            <div className="roi-label">NET PERFORMANCE SAVE</div>
            <div className="roi-value">{savings}</div>
            <div className="roi-progress-bg">
                <div className="roi-progress-fill" style={{ width: '65%' }}></div>
            </div>
            <div className="roi-footer">Operational efficiency is up 12%</div>
        </div>
    );
};

export default Sidebar;
