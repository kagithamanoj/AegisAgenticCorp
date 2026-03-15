import { useState, useEffect } from 'react';
import { Shield, Target, Zap, Waves, Save, CheckCircle2 } from 'lucide-react';
import './SquadView.css';

interface Agent {
    id: string;
    name: string;
    role: string;
    status: string;
    activity: string;
    tokensUsed: number;
    utilization: string;
}

interface Directives {
    global_strategy: string;
    tone_override: string;
    agent_overrides: Record<string, string>;
}

const SquadView = ({ setActiveView }: { setActiveView: (view: string) => void }) => {
    const [agents, setAgents] = useState<Agent[]>([]);
    const [directives, setDirectives] = useState<Directives>({
        global_strategy: "",
        tone_override: "",
        agent_overrides: {}
    });
    const [saving, setSaving] = useState(false);
    const [showSaved, setShowSaved] = useState(false);

    const fetchAll = async () => {
        try {
            const [agentsRes, dirRes] = await Promise.all([
                fetch('/api/agents'),
                fetch('/api/directives')
            ]);
            setAgents(await agentsRes.json());
            setDirectives(await dirRes.json());
        } catch (e) {
            console.error('Failed to fetch squad data', e);
        }
    };

    useEffect(() => {
        fetchAll();
        const int = setInterval(fetchAll, 5000);
        return () => clearInterval(int);
    }, []);

    const saveDirectives = async () => {
        setSaving(true);
        try {
            const res = await fetch('/api/directives/persistent', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(directives)
            });
            if (res.ok) {
                setShowSaved(true);
                setTimeout(() => setShowSaved(false), 3000);
            }
        } catch (e) {
            console.error('Failed to save directives', e);
        } finally {
            setSaving(false);
        }
    };

    const handleOverrideChange = (agentId: string, value: string) => {
        setDirectives(prev => ({
            ...prev,
            agent_overrides: {
                ...prev.agent_overrides,
                [agentId]: value
            }
        }));
    };

    return (
        <div className="squad-view-wrapper">
            <div className="squad-view-header">
                <h1>SQUAD NERVE CENTER</h1>
                <p>Strategic oversight and live multi-agent orchestration.</p>
            </div>

            <div className="squad-table-container">
                <table className="squad-table">
                    <thead>
                        <tr>
                            <th>AGENT</th>
                            <th>UTILIZATION</th>
                            <th>LIVE ACTIVITY</th>
                            <th>STATUS</th>
                            <th>ACTION</th>
                        </tr>
                    </thead>
                    <tbody>
                        {agents.map(agent => (
                            <tr key={agent.id} className="squad-table-row">
                                <td>
                                    <div className="squad-table-agent">
                                        <div className="squad-avatar-md">{agent.name.charAt(0)}</div>
                                        <div className="squad-agent-info">
                                            <div className="squad-agent-name">{agent.name}</div>
                                            <div className="squad-agent-id">{agent.id.toUpperCase()}</div>
                                        </div>
                                    </div>
                                </td>
                                <td>
                                    <span className={`badge ${agent.utilization === 'High' ? 'badge-lead' : 'badge-spc'}`}>
                                        {agent.utilization} Load
                                    </span>
                                </td>
                                <td style={{ fontSize: '12px', color: agent.status === 'working' ? 'var(--text-primary)' : 'var(--text-tertiary)' }}>
                                    {agent.activity}
                                </td>
                                <td>
                                    <div className="squad-status-indicator">
                                        <span className={`status-dot ${agent.status === 'working' ? 'status-working' : 'status-idle'}`}></span>
                                        {agent.status.toUpperCase()}
                                    </div>
                                </td>
                                <td>
                                    <button
                                        className="btn-secondary"
                                        style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px' }}
                                        onClick={() => setActiveView(`channel-${agent.id}`)}
                                    >
                                        Command
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <div className="directors-console">
                <h2><Shield size={20} color="var(--accent-blue)" /> Persistent Strategic Overlays</h2>

                <div className="directives-grid">
                    <div className="directive-field">
                        <label><Target size={12} style={{ marginRight: 6 }} /> Global Strategy Index</label>
                        <textarea
                            value={directives.global_strategy}
                            onChange={(e) => setDirectives({ ...directives, global_strategy: e.target.value })}
                            placeholder="Set the overarching mission parameters..."
                        />
                    </div>
                    <div className="directive-field">
                        <label><Waves size={12} style={{ marginRight: 6 }} /> Squad Vibe / Tone Override</label>
                        <textarea
                            value={directives.tone_override}
                            onChange={(e) => setDirectives({ ...directives, tone_override: e.target.value })}
                            placeholder="Control the verbal landscape (e.g., minimalist, aggressive, technical)..."
                        />
                    </div>
                </div>

                <div className="agent-overrides-list">
                    <h3><Zap size={14} style={{ marginRight: 8 }} /> Agent-Specific Overrides</h3>
                    {agents.map(agent => (
                        <div key={agent.id} className="agent-override-row">
                            <span className="agent-name-tag">{agent.name}</span>
                            <div className="directive-field">
                                <input
                                    type="text"
                                    placeholder={`Operational override for ${agent.name}...`}
                                    value={directives.agent_overrides[agent.id] || ""}
                                    onChange={(e) => handleOverrideChange(agent.id, e.target.value)}
                                />
                            </div>
                        </div>
                    ))}
                </div>

                <div style={{ marginTop: 32, display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <button className="save-directives-btn" onClick={saveDirectives} disabled={saving}>
                        {saving ? "Deploying..." : (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Save size={14} /> Deploy Directives
                            </div>
                        )}
                    </button>
                    {showSaved && (
                        <span style={{ color: 'var(--accent-green)', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <CheckCircle2 size={14} /> Strategic alignment updated globally.
                        </span>
                    )}
                </div>
            </div>
        </div>
    );
};

export default SquadView;
