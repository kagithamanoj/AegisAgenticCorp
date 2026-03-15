import React, { useState } from 'react';
import { Megaphone, Send } from 'lucide-react';
import './BroadcastView.css';

const BroadcastView = () => {
    const [message, setMessage] = useState('');
    const [isSending, setIsSending] = useState(false);
    const [sentStatus, setSentStatus] = useState<string | null>(null);

    const handleBroadcast = (e: React.FormEvent) => {
        e.preventDefault();
        if (!message.trim()) return;

        setIsSending(true);
        // Simulate network request
        setTimeout(() => {
            setIsSending(false);
            setSentStatus('Broadcast dispatched to active squad fleet.');
            setMessage('');
            setTimeout(() => setSentStatus(null), 5000);
        }, 1200);
    };

    return (
        <div className="broadcast-wrapper" style={{ padding: '32px', maxWidth: '800px', margin: '0 auto', height: '100%' }}>
            <div style={{ marginBottom: '32px' }}>
                <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: '28px', fontWeight: 500, letterSpacing: '-0.02em', marginBottom: '8px' }}>
                    Fleet Broadcast
                </h1>
                <p style={{ color: 'var(--text-secondary)', fontSize: '15px' }}>
                    Push a high-priority operational directive to all active autonomous agents instantly.
                </p>
            </div>

            <div style={{ backgroundColor: 'var(--bg-panel)', border: '1px solid var(--border-color)', borderRadius: 'var(--border-radius-lg)', padding: '24px' }}>
                <form onSubmit={handleBroadcast}>
                    <label style={{ display: 'block', marginBottom: '12px', fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        Global Directive Payload
                    </label>

                    <textarea
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        placeholder="Enter directive. E.g., 'All agents halt Coinbase testing. Pivot immediately to Stripe API review phase.'"
                        style={{
                            width: '100%',
                            minHeight: '160px',
                            backgroundColor: 'var(--bg-main)',
                            border: '1px solid var(--border-color)',
                            borderRadius: 'var(--border-radius-md)',
                            padding: '16px',
                            fontSize: '15px',
                            fontFamily: 'var(--font-base)',
                            color: 'var(--text-primary)',
                            resize: 'vertical',
                            marginBottom: '20px'
                        }}
                    />

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>
                            <Megaphone size={14} style={{ verticalAlign: 'middle', marginRight: '6px' }} />
                            Transmits to 5 Active Agents
                        </div>

                        <button
                            type="submit"
                            disabled={isSending || !message.trim()}
                            style={{
                                backgroundColor: isSending ? 'var(--bg-hover)' : 'var(--accent-orange)',
                                color: isSending ? 'var(--text-tertiary)' : '#fff',
                                border: 'none',
                                padding: '10px 24px',
                                borderRadius: 'var(--border-radius-md)',
                                fontSize: '14px',
                                fontWeight: 600,
                                cursor: isSending || !message.trim() ? 'not-allowed' : 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                transition: 'all 0.2s ease'
                            }}
                        >
                            {isSending ? 'Transmitting...' : (
                                <>
                                    <Send size={16} /> Broadcast
                                </>
                            )}
                        </button>
                    </div>
                </form>

                {sentStatus && (
                    <div style={{ marginTop: '20px', padding: '12px 16px', backgroundColor: 'var(--accent-green-light)', border: '1px solid var(--accent-green)', color: 'var(--accent-green)', borderRadius: 'var(--border-radius-md)', fontSize: '13px', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ width: 8, height: 8, backgroundColor: 'var(--accent-green)', borderRadius: '50%', display: 'inline-block' }}></span>
                        {sentStatus}
                    </div>
                )}
            </div>

            <div style={{ marginTop: '40px' }}>
                <h3 style={{ fontFamily: 'var(--font-serif)', fontSize: '18px', fontWeight: 500, borderBottom: '1px solid var(--border-color)', paddingBottom: '12px', marginBottom: '20px' }}>
                    Recent Transmissions
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div style={{ padding: '16px', border: '1px solid var(--border-color)', borderRadius: 'var(--border-radius-md)', backgroundColor: 'transparent' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '12px', color: 'var(--text-tertiary)' }}>
                            <span>Author: Manoj (Admin)</span>
                            <span>Yesterday, 14:30 PM</span>
                        </div>
                        <div style={{ fontSize: '14px', lineHeight: 1.6, color: 'var(--text-secondary)' }}>
                            "Reminder: All code pushed today must pass the strict Anthropic styling guidelines. No heavy dropshadows."
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default BroadcastView;
