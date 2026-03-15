import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, Zap, Database, ArrowRight, ChevronRight, Code } from 'lucide-react';
import AnimatedBackground from '../components/AnimatedBackground';
import './LandingView.css';

const LandingView: React.FC = () => {
    const navigate = useNavigate();

    return (
        <div className="landing-container">
            <AnimatedBackground />
            {/* Hero Section */}
            <section className="hero-section">
                <div className="hero-glow"></div>
                <div className="hero-content">
                    <div className="badge-pill animate-fade-in-up">
                        <span className="badge-pulse"></span>
                        AegisCorp Agentic Intelligence HQ v2.0 is live
                        <ArrowRight size={14} className="ml-2" />
                    </div>
                    <h1 className="hero-title animate-fade-in-up delay-100">
                        Unleash Autonomous <br />
                        <span className="text-gradient">Agentic Intelligence</span>
                    </h1>
                    <p className="hero-subtitle animate-fade-in-up delay-200">
                        The ultimate mission control for your AI squads. Monitor, deploy, and scale autonomous agents with unprecedented precision and security.
                    </p>
                    <div className="hero-actions animate-fade-in-up delay-300">
                        <button className="btn-primary-glow" onClick={() => navigate('/hq')}>
                            Launch HQ <ChevronRight size={18} />
                        </button>
                        <button className="btn-outline">
                            <Code size={18} className="mr-2" />
                            View Documentation
                        </button>
                    </div>
                </div>

                {/* Abstract UI Mockup */}
                <div className="hero-visual animate-fade-in-up delay-300">
                    <div className="glass-panel mockup-window">
                        <div className="mockup-header">
                            <div className="mockup-dots"><span></span><span></span><span></span></div>
                            <div className="mockup-title">AegisCorp Agentic Intelligence Terminal</div>
                        </div>
                        <div className="mockup-body">
                            <div className="mockup-line"><span className="text-accent">root@aegis</span>:~$ init --squad="alpha"</div>
                            <div className="mockup-line text-muted">[OK] Initializing neural pathways...</div>
                            <div className="mockup-line text-muted">[OK] Connecting to mission control...</div>
                            <div className="mockup-line text-success">SUCCESS: Alpha squad is online and awaiting orders.</div>
                            <div className="mockup-line"><span className="text-accent">root@aegis</span>:~$ <span className="cursor-blink">|</span></div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Features Section */}
            <section className="features-section">
                <div className="section-header">
                    <h2 className="section-title">Enterprise-Grade Architecture</h2>
                    <p className="section-subtitle">Built for scale, secured by default. Powering the next generation of AI operations.</p>
                </div>

                <div className="features-grid">
                    <div className="feature-card glass-panel">
                        <div className="feature-icon bg-blue">
                            <Shield size={24} />
                        </div>
                        <h3>Military-Grade Security</h3>
                        <p className="text-muted">End-to-end encryption and robust access controls ensure your agent logic and data remain completely secure.</p>
                    </div>

                    <div className="feature-card glass-panel">
                        <div className="feature-icon bg-purple">
                            <Zap size={24} />
                        </div>
                        <h3>Real-time Telemetry</h3>
                        <p className="text-muted">Monitor every decision, action, and network request made by your autonomous agents in real-time.</p>
                    </div>

                    <div className="feature-card glass-panel">
                        <div className="feature-icon bg-emerald">
                            <Database size={24} />
                        </div>
                        <h3>Persistent Memory</h3>
                        <p className="text-muted">Agents retain context across sessions with our distributed, low-latency semantic memory architecture.</p>
                    </div>
                </div>
            </section>
        </div>
    );
};

export default LandingView;
