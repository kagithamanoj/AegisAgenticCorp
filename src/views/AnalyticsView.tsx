import { useState, useEffect } from 'react';
import { Clock, DollarSign, Activity, Loader } from 'lucide-react';
import './AnalyticsView.css';

interface AnalyticsData {
    tokens_used: number;
    tasks_completed: number;
    agent_usage: Record<string, number>;
}

interface CoinbaseDecision {
    agent?: string;
    details?: {
        risk_status?: {
            total_pnl?: number;
        };
    };
}

interface CoinbaseReport {
    decisions?: CoinbaseDecision[];
}

const AnalyticsView = () => {
    const [data, setData] = useState<AnalyticsData | null>(null);
    const [coinbaseData, setCoinbaseData] = useState<CoinbaseReport | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchAnalytics = async () => {
            try {
                const [analyticsRes, coinbaseRes] = await Promise.all([
                    fetch('/api/analytics'),
                    fetch('/api/coinbase/latest')
                ]);

                const analyticsJson = await analyticsRes.json();
                setData(analyticsJson);

                if (coinbaseRes.ok) {
                    const coinbaseJson = await coinbaseRes.json();
                    setCoinbaseData(coinbaseJson);
                }
            } catch (err) {
                console.error("Failed to fetch analytics", err);
            } finally {
                setLoading(false);
            }
        };
        fetchAnalytics();

        // Poll every 5 seconds for real-time updates
        const interval = setInterval(fetchAnalytics, 5000);
        return () => clearInterval(interval);
    }, []);

    if (loading || !data) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', color: 'var(--text-tertiary)' }}>
                <Loader className="spin" style={{ animation: 'spin 1.5s linear infinite' }} size={24} /> <span style={{ marginLeft: 8 }}>Fetching Live Telemetry...</span>
            </div>
        );
    }

    // Cost Mathematics Setup
    const MINIMAX_COST_PER_1K_TOKENS = 0.005;
    const HUMAN_RATE_PER_HOUR = 75;
    const HOURS_PER_TASK = 2.5;

    const totalTokens = data.tokens_used || 0;
    const taskVelocity = data.tasks_completed || 0;

    const actualApiCost = (totalTokens / 1000) * MINIMAX_COST_PER_1K_TOKENS;
    const estimatedHoursSaved = taskVelocity * HOURS_PER_TASK;
    const humanCostEquivalent = estimatedHoursSaved * HUMAN_RATE_PER_HOUR;

    // Get P&L from latest Coinbase decision (Monica risk_status)
    let tradingPnl = 0;
    if (coinbaseData && coinbaseData.decisions && coinbaseData.decisions.length > 0) {
        // Find latest monica decision with details
        const latestMonica = [...coinbaseData.decisions].reverse().find(d => d.agent === 'Monica' && d.details && d.details.risk_status);
        if (latestMonica) {
            tradingPnl = latestMonica.details?.risk_status?.total_pnl ?? 0;
        }
    }

    const netSavings = humanCostEquivalent - actualApiCost + tradingPnl;

    const formatCurrency = (val: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);

    const maxTokensByAgent = Math.max(...Object.values(data.agent_usage), 1);

    return (
        <div className="analytics-wrapper">
            <div className="analytics-header">
                <h1>ROI & PERFORMANCE REPORT</h1>
                <p>Live telemetry tracking Minimax M2.5 token usage, task velocity, and verified Coinbase trading profit/loss.</p>
            </div>

            <div className="metrics-grid">
                <div className="metric-card">
                    <div className="metric-icon-wrapper" style={{ backgroundColor: 'var(--accent-green-light)', color: 'var(--accent-green)' }}>
                        <DollarSign size={20} />
                    </div>
                    <div className="metric-info">
                        <div className="metric-label">Total Performance Savings</div>
                        <div className="metric-value">{formatCurrency(netSavings)}</div>
                        <div className="metric-subtext positive">Net ROI including P&L</div>
                    </div>
                </div>

                <div className="metric-card">
                    <div className="metric-icon-wrapper" style={{ backgroundColor: tradingPnl >= 0 ? 'var(--accent-green-light)' : '#fee2e2', color: tradingPnl >= 0 ? 'var(--accent-green)' : '#ef4444' }}>
                        <Activity size={20} />
                    </div>
                    <div className="metric-info">
                        <div className="metric-label">Coinbase Trading P&L</div>
                        <div className="metric-value" style={{ color: tradingPnl >= 0 ? 'var(--accent-green)' : '#ef4444' }}>
                            {tradingPnl >= 0 ? '+' : ''}{formatCurrency(tradingPnl)}
                        </div>
                        <div className="metric-subtext">Verified Real-Time Results</div>
                    </div>
                </div>

                <div className="metric-card">
                    <div className="metric-icon-wrapper" style={{ backgroundColor: 'var(--accent-orange-light)', color: 'var(--accent-orange)' }}>
                        <Clock size={20} />
                    </div>
                    <div className="metric-info">
                        <div className="metric-label">Time Saved</div>
                        <div className="metric-value">{estimatedHoursSaved.toFixed(1)} hrs</div>
                        <div className="metric-subtext">Human equivalence</div>
                    </div>
                </div>

                <div className="metric-card">
                    <div className="metric-icon-wrapper" style={{ backgroundColor: 'var(--accent-purple-light)', color: 'var(--accent-purple)' }}>
                        <Activity size={20} />
                    </div>
                    <div className="metric-info">
                        <div className="metric-label">API Usage</div>
                        <div className="metric-value">{totalTokens.toLocaleString()}</div>
                        <div className="metric-subtext">Cumulative Tokens</div>
                    </div>
                </div>
            </div>

            <div className="charts-section">
                <div className="chart-card">
                    <h3>Squad Efficiency (By Token Volume)</h3>
                    <div className="utilization-list">
                        {Object.entries(data.agent_usage).length === 0 && (
                            <div style={{ color: 'var(--text-tertiary)', fontSize: '14px', fontStyle: 'italic', fontFamily: 'var(--font-serif)' }}>No agent telemetry recorded yet.</div>
                        )}
                        {Object.entries(data.agent_usage)
                            .sort(([, a], [, b]) => b - a)
                            .map(([agentName, tokens], index) => {
                                const percentage = ((tokens / maxTokensByAgent) * 100).toFixed(0);
                                const colors = ['var(--accent-orange)', 'var(--accent-blue)', 'var(--accent-green)', 'var(--accent-purple)', 'var(--accent-yellow)'];
                                const color = colors[index % colors.length];

                                return (
                                    <div className="util-item" key={agentName}>
                                        <div className="util-label">
                                            <span style={{ textTransform: 'capitalize' }}>{agentName}</span>
                                            <span>{tokens.toLocaleString()} tokens</span>
                                        </div>
                                        <div className="util-bar-bg">
                                            <div className="util-bar-fill" style={{ width: `${percentage}%`, backgroundColor: color, transition: 'width 0.5s ease-out' }}></div>
                                        </div>
                                    </div>
                                );
                            })}
                    </div>
                </div>

                <div className="chart-card">
                    <h3>Strategic Cost Benefit Analysis</h3>
                    <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '24px', lineHeight: '1.6' }}>
                        The net performance includes the theoretical savings of human time minus the actual infrastructure costs, combined with the real-world profit generated by the Coinbase project agents.
                    </p>

                    <div className="efficiency-stats">
                        <div className="eff-stat">
                            <span className="eff-stat-label">Minimax Infrastructure Cost</span>
                            <span className="eff-stat-value">{formatCurrency(actualApiCost)}</span>
                        </div>
                        <div className="eff-stat">
                            <span className="eff-stat-label">Traditional Engineer Equivalent ($75/hr)</span>
                            <span className="eff-stat-value">{formatCurrency(humanCostEquivalent)}</span>
                        </div>
                        <div className="eff-stat">
                            <span className="eff-stat-label">Coinbase Trading Results (P&L)</span>
                            <span className="eff-stat-value" style={{ color: tradingPnl >= 0 ? 'var(--accent-green)' : '#ef4444' }}>
                                {tradingPnl >= 0 ? '+' : ''}{formatCurrency(tradingPnl)}
                            </span>
                        </div>
                        <div className="eff-stat total">
                            <span className="eff-stat-label" style={{ color: 'var(--text-primary)' }}>Net ROI Contribution</span>
                            <span className="eff-stat-value positive">{formatCurrency(netSavings)}</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AnalyticsView;
