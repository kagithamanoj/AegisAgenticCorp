import React from 'react';
import { Microscope, FileText, Globe, GraduationCap, ChevronRight } from 'lucide-react';
import AnimatedBackground from '../components/AnimatedBackground';
import './PublicPages.css';

const ResearchView: React.FC = () => {
    return (
        <div className="public-page-container">
            <AnimatedBackground />

            <header className="page-header animate-fade-in-up">
                <h1 className="page-title">Aegis <span className="text-gradient">Research</span></h1>
                <p className="page-subtitle">Pioneering the frontiers of autonomous agent alignment, semantic memory architectures, and collaborative neural squads.</p>
            </header>

            <div className="content-grid animate-fade-in-up delay-100">
                {/* Featured Research */}
                <div className="research-card glass-panel wide">
                    <div className="research-label">FEATURED PUBLICATION</div>
                    <h2>The Multi-Agent Consensus Protocol (MACP)</h2>
                    <p>
                        Our latest breakthrough in enabling autonomous agents to reach alignment on complex tasks without human intervention, ensuring high-fidelity execution in decentralised environments.
                    </p>
                    <div className="research-meta">
                        <span><FileText size={16} /> Read Paper</span>
                        <span>March 2026</span>
                    </div>
                </div>

                <div className="research-card glass-panel">
                    <div className="research-icon bg-cyan">
                        <Microscope size={24} />
                    </div>
                    <h3>Semantic Memory</h3>
                    <p>Building long-term, low-latency contextual retrieval for agents to learn from every interaction.</p>
                    <button className="btn-link">Learn More <ChevronRight size={16} /></button>
                </div>

                <div className="research-card glass-panel">
                    <div className="research-icon bg-blue">
                        <Globe size={24} />
                    </div>
                    <h3>Global Alignment</h3>
                    <p>Scaling agent squads across geographic boundaries while maintaining strict policy adherence.</p>
                    <button className="btn-link">Learn More <ChevronRight size={16} /></button>
                </div>

                <div className="research-card glass-panel">
                    <div className="research-icon bg-purple">
                        <GraduationCap size={24} />
                    </div>
                    <h3>Neuro-symbolic Logic</h3>
                    <p>Integrating structured reasoning with large-scale neural models for verifiable agent actions.</p>
                    <button className="btn-link">Learn More <ChevronRight size={16} /></button>
                </div>
            </div>
        </div>
    );
};

export default ResearchView;
