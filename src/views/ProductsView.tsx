import React from 'react';
import { Bot, LineChart, Users, ChevronRight } from 'lucide-react';
import AnimatedBackground from '../components/AnimatedBackground';
import './PublicPages.css';

const ProductsView: React.FC = () => {
    return (
        <div className="public-page-container">
            <AnimatedBackground />

            <header className="page-header animate-fade-in-up">
                <h1 className="page-title">Enterprise <span className="text-gradient">Products</span></h1>
                <p className="page-subtitle">Autonomous agent squads designed for specific industry verticals.</p>
            </header>

            <div className="content-grid animate-fade-in-up delay-100">
                {/* Product 1 */}
                <div className="product-card glass-panel">
                    <div className="product-icon-wrapper bg-blue">
                        <LineChart size={32} className="product-icon" />
                    </div>
                    <h2>Aegis Finance (Coinbase Squad)</h2>
                    <p className="product-desc">
                        A fully autonomous trading syndicate consisting of specialized agents: an Orchestrator, a Research Analyst, a Risk Manager, and an Execution Agent. Operating 24/7 with strict compliance.
                    </p>
                    <button className="btn-link">Explore Financial Agents <ChevronRight size={16} /></button>
                </div>

                {/* Product 2 */}
                <div className="product-card glass-panel">
                    <div className="product-icon-wrapper bg-purple">
                        <Users size={32} className="product-icon" />
                    </div>
                    <h2>Aegis Outreach</h2>
                    <p className="product-desc">
                        Intelligent sales and outreach automation. Agents like Alex manage entire lead pipelines, personalize communications at scale, and handle CRM integrations autonomously.
                    </p>
                    <button className="btn-link">Explore Sales Agents <ChevronRight size={16} /></button>
                </div>

                {/* Product 3 */}
                <div className="product-card glass-panel">
                    <div className="product-icon-wrapper bg-emerald">
                        <Bot size={32} className="product-icon" />
                    </div>
                    <h2>Meeting Copilot</h2>
                    <p className="product-desc">
                        An enterprise-grade meeting assistant that joins calls, transcribes conversations, extracts action items, and syncs directly into your project management tools.
                    </p>
                    <button className="btn-link">Explore Copilot <ChevronRight size={16} /></button>
                </div>
            </div>
        </div>
    );
};

export default ProductsView;
