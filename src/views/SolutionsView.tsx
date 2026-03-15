import React from 'react';
import { Target, ShieldCheck, Zap } from 'lucide-react';
import AnimatedBackground from '../components/AnimatedBackground';
import './PublicPages.css';

const SolutionsView: React.FC = () => {
    return (
        <div className="public-page-container">
            <AnimatedBackground />

            <header className="page-header animate-fade-in-up">
                <h1 className="page-title">Industry <span className="text-gradient">Solutions</span></h1>
                <p className="page-subtitle">How AegisCorp Agentic Intelligence autonomous intelligence transforms modern enterprises.</p>
            </header>

            <div className="content-grid animate-fade-in-up delay-100">
                <div className="solution-card glass-panel">
                    <div className="solution-header">
                        <Target size={28} className="text-accent-primary" />
                        <h3>Scalable Automation</h3>
                    </div>
                    <p>
                        Move beyond simple RPA. Our agentic squads reason, plan, and execute complex, multi-step workflows that traditionally required human intervention.
                    </p>
                    <ul className="solution-features">
                        <li>Cross-platform integration</li>
                        <li>Self-correcting workflows</li>
                        <li>Natural language reasoning</li>
                    </ul>
                </div>

                <div className="solution-card glass-panel">
                    <div className="solution-header">
                        <ShieldCheck size={28} className="text-accent-emerald" />
                        <h3>Risk & Compliance</h3>
                    </div>
                    <p>
                        In highly regulated industries like finance, our dedicated Risk Manager agents ensure that every action taken by the squad adheres to internal policies and external regulations.
                    </p>
                    <ul className="solution-features">
                        <li>Pre-execution validation</li>
                        <li>Immutable audit logs</li>
                        <li>Real-time human overrides</li>
                    </ul>
                </div>

                <div className="solution-card glass-panel">
                    <div className="solution-header">
                        <Zap size={28} className="text-accent-secondary" />
                        <h3>Hyper-Personalization</h3>
                    </div>
                    <p>
                        For sales and outreach, agents analyze vast amounts of data to craft uniquely personalized communication strategies at a scale impossible for human teams.
                    </p>
                    <ul className="solution-features">
                        <li>Deep prospect research</li>
                        <li>Dynamic messaging</li>
                        <li>Automated follow-ups</li>
                    </ul>
                </div>
            </div>
        </div>
    );
};

export default SolutionsView;
