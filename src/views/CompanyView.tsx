import React from 'react';
import { Hexagon, CheckCircle2, Globe, TrendingUp } from 'lucide-react';
import AnimatedBackground from '../components/AnimatedBackground';
import './PublicPages.css';

const CompanyView: React.FC = () => {
    return (
        <div className="public-page-container">
            <AnimatedBackground />

            <header className="page-header animate-fade-in-up">
                <h1 className="page-title">About <span className="text-gradient">AegisCorp Agentic Intelligence</span></h1>
                <p className="page-subtitle">Pioneering the future of autonomous enterprise operations.</p>
            </header>

            <div className="company-content animate-fade-in-up delay-100">
                <div className="mission-statement glass-panel">
                    <Hexagon size={48} className="text-accent-primary mb-4" />
                    <h2>Our Mission</h2>
                    <p className="text-muted" style={{ fontSize: '18px', lineHeight: '1.8' }}>
                        To empower every enterprise on the planet with secure, scalable, and intelligent autonomous agents. We believe that the next era of business is not built on software alone, but on autonomous digital workforces that can reason, plan, and execute alongside human teams.
                    </p>
                </div>

                <div className="stats-grid mt-12">
                    <div className="stat-card">
                        <Globe size={32} className="text-accent-cyan mb-2" />
                        <div className="stat-number">24/7</div>
                        <div className="stat-label">Global Operations</div>
                    </div>
                    <div className="stat-card">
                        <TrendingUp size={32} className="text-accent-emerald mb-2" />
                        <div className="stat-number">10M+</div>
                        <div className="stat-label">Actions Executed</div>
                    </div>
                    <div className="stat-card">
                        <CheckCircle2 size={32} className="text-accent-secondary mb-2" />
                        <div className="stat-number">99.99%</div>
                        <div className="stat-label">Uptime Reliability</div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default CompanyView;
