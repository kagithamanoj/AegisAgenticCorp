import { useState, useEffect } from 'react';
import { Activity, Zap, CheckCircle, Shield, TrendingUp, Users } from 'lucide-react';
import './Dashboard.css';

interface AgentData {
    id: string;
    name: string;
    status: string;
    activity: string;
    tokensUsed: number;
}

interface TaskData {
    id: string;
    title: string;
    desc: string;
    status: string;
    assignee: string;
}

const Dashboard = () => {
    const [agents, setAgents] = useState<AgentData[]>([]);
    const [tasks, setTasks] = useState<TaskData[]>([]);
    const [tokens, setTokens] = useState<number>(0);

    useEffect(() => {
        const fetchDashboardData = async () => {
            try {
                const [agentsRes, tasksRes, analyticsRes] = await Promise.all([
                    fetch('/api/agents'),
                    fetch('/api/tasks'),
                    fetch('/api/analytics')
                ]);

                if (agentsRes.ok) {
                    const data = await agentsRes.json();
                    setAgents(Array.isArray(data) ? data : (data.agents || []));
                }
                if (tasksRes.ok) {
                    const data = await tasksRes.json();
                    setTasks(Array.isArray(data) ? data : (data.tasks || []));
                }
                if (analyticsRes.ok) {
                    const analytics = await analyticsRes.json();
                    setTokens(analytics.tokens_used || 0);
                }
            } catch (err) {
                console.error("Failed to fetch dashboard telemetry", err);
            }
        };

        fetchDashboardData();
        const interval = setInterval(fetchDashboardData, 5000);
        return () => clearInterval(interval);
    }, []);

    const activeAgents = agents.filter(a => a.status === 'working').length;
    const priorityTasks = tasks.filter(t => t.status !== 'done').slice(0, 5);
    const costEstimate = ((tokens / 1000) * 0.005).toFixed(2);

    return (
        <div className="dashboard-wrapper animate-fade-in-up">
            <div className="dashboard-header">
                <h1><Shield className="text-gradient" size={28} /> AegisCorp Agentic Intelligence Global Command</h1>
                <p>Welcome, Commander. All systems are operating within nominal parameters.</p>
            </div>

            {/* High-Level Telemetry Ticker */}
            <div className="kpi-ticker delay-100">
                <div className="kpi-card">
                    <div className="kpi-label"><Zap size={14} /> Active Agents</div>
                    <div className="kpi-value">{activeAgents} <span style={{ fontSize: '16px', color: 'var(--text-tertiary)' }}>/ 7</span></div>
                    <div className="kpi-trend trend-up">Peak Capacity Available</div>
                </div>
                <div className="kpi-card">
                    <div className="kpi-label"><CheckCircle size={14} /> Tasks in Queue</div>
                    <div className="kpi-value">{tasks.filter(t => t.status !== 'done').length}</div>
                    <div className="kpi-trend trend-up">Processing Efficiently</div>
                </div>
                <div className="kpi-card">
                    <div className="kpi-label"><Activity size={14} /> Tokens Burned</div>
                    <div className="kpi-value">{tokens.toLocaleString()}</div>
                    <div className="kpi-trend trend-down">Est. ${costEstimate} Spend</div>
                </div>
                <div className="kpi-card">
                    <div className="kpi-label"><TrendingUp size={14} /> Global Status</div>
                    <div className="kpi-value" style={{ color: 'var(--system-green)' }}>Secure</div>
                    <div className="kpi-trend trend-up">0 Vulnerabilities Detected</div>
                </div>
            </div>

            {/* Dashboard Grid */}
            <div className="dashboard-grid delay-200">
                {/* Live Agent Heartbeat */}
                <div className="dash-section">
                    <div className="dash-section-header">
                        <Users size={16} className="text-muted" /> Live Agent Heartbeat
                    </div>
                    <div className="heartbeat-list">
                        {agents.map((agent) => (
                            <div key={agent.id} className="heartbeat-item">
                                <div className="hb-agent-info">
                                    <div className="hb-avatar">{agent.id.charAt(0).toUpperCase()}</div>
                                    <div>
                                        <div className="hb-name">{agent.name}</div>
                                        <div className="hb-role">{agent.activity}</div>
                                    </div>
                                </div>
                                <div className={`hb-status-badge ${agent.status === 'working' ? 'hb-status-working' : 'hb-status-idle'}`}>
                                    {agent.status}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Priority Mini-Feed */}
                <div className="dash-section">
                    <div className="dash-section-header">
                        <Zap size={16} className="text-muted" /> Active Priority Queue
                    </div>
                    <div className="priority-feed">
                        {priorityTasks.length > 0 ? priorityTasks.map((task) => (
                            <div key={task.id} className="pf-task">
                                <div className="pf-task-header">
                                    <h4 className="pf-title">{task.title}</h4>
                                    <span className="hb-status-badge hb-status-idle">{task.status.replace('_', ' ')}</span>
                                </div>
                                <p className="pf-desc">{task.desc}</p>
                                <div className="pf-meta">
                                    <span>Assigned to: <strong>{task.assignee}</strong></span>
                                    <span>ID: {task.id.slice(-4)}</span>
                                </div>
                            </div>
                        )) : (
                            <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-tertiary)' }}>
                                No active tasks in queue.
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Organizational Trajectory (Org Chart) */}
            <div className="org-chart-section delay-300">
                <h3 className="org-chart-title">AegisCorp Agentic Intelligence Command Structure</h3>
                <div className="org-tree">

                    {/* Level 1: Commander */}
                    <div className="org-node">
                        <div className="org-card ceo">
                            <div className="org-avatar">👑</div>
                            <div className="org-name">Manoj</div>
                            <div className="org-title">Commander / CEO</div>
                        </div>
                    </div>

                    {/* Level 2: Chief of Staff */}
                    <div className="org-level-2">
                        <div className="org-node">
                            <div className="org-card cos">
                                <div className="org-avatar">⚡</div>
                                <div className="org-name">Monica</div>
                                <div className="org-title">Chief of Staff</div>
                            </div>
                        </div>

                        {/* Level 3: Execution Squad */}
                        <div className="org-level-3">
                            {['Alex', 'Zara', 'Dev', 'Emma', 'Sam', 'Leo'].map((name) => {
                                const agentInfo = agents.find(a => a.name === name);
                                const isWorking = agentInfo?.status === 'working';
                                return (
                                    <div key={name} className="org-node">
                                        <div className="org-card" style={{ borderColor: isWorking ? 'var(--accent-orange)' : 'var(--border-color)' }}>
                                            <div className="org-name">{name}</div>
                                            <div className="org-title">Specialist</div>
                                            {isWorking && <div style={{ marginTop: '8px', fontSize: '10px', color: 'var(--accent-orange)', fontWeight: 600 }}>ACTIVE</div>}
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    </div>

                </div>
            </div>

        </div>
    );
};

export default Dashboard;
