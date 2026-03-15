import React from 'react';
import { Calendar, ArrowRight } from 'lucide-react';
import AnimatedBackground from '../components/AnimatedBackground';
import './PublicPages.css';

const NewsView: React.FC = () => {
    const articles = [
        {
            title: "AegisCorp Agentic Intelligence Raises $500M to Scale Agentic Infrastructure",
            description: "A new round of funding to accelerate the development of autonomous AI squads for Fortune 500 companies.",
            date: "March 12, 2026",
            tag: "Corporate"
        },
        {
            title: "Announcing the Aegis Shield v2.0",
            description: "Major updates to our safety protocol, introducing hardware-level sandbox isolation for all rogue agent detection.",
            date: "February 28, 2026",
            tag: "Product"
        },
        {
            title: "Why Multi-Agent Consensus is the Future",
            description: "Our research lead explains why single-model agents are legacy technology and why squads are the next frontier.",
            date: "February 15, 2026",
            tag: "Engineering"
        }
    ];

    return (
        <div className="public-page-container">
            <AnimatedBackground />

            <header className="page-header animate-fade-in-up">
                <h1 className="page-title">The <span className="text-gradient">Pulse</span> of AegisCorp</h1>
                <p className="page-subtitle">Latest news, press releases, and engineering insights from the frontlines of agentic intelligence.</p>
            </header>

            <div className="news-grid animate-fade-in-up delay-100">
                {articles.map((art, idx) => (
                    <div key={idx} className="news-card glass-panel">
                        <div className="news-tag">{art.tag}</div>
                        <h3>{art.title}</h3>
                        <p>{art.description}</p>
                        <div className="news-footer">
                            <span><Calendar size={14} /> {art.date}</span>
                            <button className="btn-link">Read More <ArrowRight size={16} /></button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default NewsView;
