import React from 'react';
import { ShieldCheck, Lock, Eye, Scale } from 'lucide-react';
import AnimatedBackground from '../components/AnimatedBackground';
import './PublicPages.css';

const SafetyView: React.FC = () => {
    return (
        <div className="public-page-container">
            <AnimatedBackground />

            <header className="page-header animate-fade-in-up">
                <h1 className="page-title">Safety & <span className="text-gradient">Trust</span></h1>
                <p className="page-subtitle">At AegisCorp Agentic Intelligence, safety isn't a feature—it's the foundation. We build autonomous systems that are inherently predictable and secure.</p>
            </header>

            <div className="safety-content animate-fade-in-up delay-100">
                <div className="safety-section glass-panel">
                    <div className="safety-grid">
                        <div className="safety-info">
                            <div className="icon-pill bg-emerald">
                                <ShieldCheck size={20} />
                                <span>The Aegis Shield</span>
                            </div>
                            <h2>Autonomous Alignment</h2>
                            <p>
                                Every agent squad operates within a hard-coded policy boundary. Our "Aegis Shield" intercepts every neural output and validates it against enterprise compliance before any action is taken in the physical or digital world.
                            </p>
                            <ul className="check-list">
                                <li>Real-time policy enforcement</li>
                                <li>Immutable execution logs</li>
                                <li>Hardware-level sandbox isolation</li>
                            </ul>
                        </div>
                        <div className="safety-visual">
                            <div className="shield-animation">
                                <div className="shield-ring"></div>
                                <div className="shield-core"><Lock size={40} /></div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="content-grid mt-12">
                    <div className="feature-card glass-panel">
                        <div className="feature-icon bg-blue">
                            <Eye size={24} />
                        </div>
                        <h3>Transparency</h3>
                        <p>View every "thought" and reasoning step your agents take in our real-time Mission Control dashboard.</p>
                    </div>

                    <div className="feature-card glass-panel">
                        <div className="feature-icon bg-purple">
                            <Scale size={24} />
                        </div>
                        <h3>Ethics Framework</h3>
                        <p>Our squads are trained on an evolving dataset of global ethical standards and corporate governance.</p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SafetyView;
