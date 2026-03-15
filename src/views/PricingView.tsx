import React from 'react';
import { Check, Zap, Shield, Rocket } from 'lucide-react';
import AnimatedBackground from '../components/AnimatedBackground';
import './PublicPages.css';

const PricingView: React.FC = () => {
    return (
        <div className="public-page-container">
            <AnimatedBackground />

            <header className="page-header animate-fade-in-up">
                <h1 className="page-title">Investment in <span className="text-gradient">Intelligence</span></h1>
                <p className="page-subtitle">Predictable pricing for exponential productivity. Choose the squad scale that fits your mission.</p>
            </header>

            <div className="pricing-grid animate-fade-in-up delay-100">
                {/* Starter */}
                <div className="pricing-card glass-panel">
                    <div className="pricing-header">
                        <Rocket size={24} className="text-accent-blue" />
                        <h3>Squad Starter</h3>
                        <div className="price">$2,500<span>/mo</span></div>
                    </div>
                    <ul className="pricing-features">
                        <li><Check size={16} /> 3 Autonomous Agents</li>
                        <li><Check size={16} /> Basic Semantic Memory</li>
                        <li><Check size={16} /> Standard Safety Protocols</li>
                        <li><Check size={16} /> Community Support</li>
                    </ul>
                    <button className="btn-outline w-full">Get Started</button>
                </div>

                {/* Enterprise */}
                <div className="pricing-card glass-panel featured">
                    <div className="featured-badge">MOST POPULAR</div>
                    <div className="pricing-header">
                        <Zap size={24} className="text-accent-primary" />
                        <h3>Enterprise Ops</h3>
                        <div className="price">$10,000<span>/mo</span></div>
                    </div>
                    <ul className="pricing-features">
                        <li><Check size={16} /> 15 Autonomous Agents</li>
                        <li><Check size={16} /> Global Alignment Hub</li>
                        <li><Check size={16} /> Aegis Shield v2.0</li>
                        <li><Check size={16} /> 24/7 Human-in-the-loop</li>
                        <li><Check size={16} /> Priority Support</li>
                    </ul>
                    <button className="btn-primary-glow w-full">Launch Enterprise</button>
                </div>

                {/* Custom */}
                <div className="pricing-card glass-panel">
                    <div className="pricing-header">
                        <Shield size={24} className="text-accent-emerald" />
                        <h3>Custom Forge</h3>
                        <div className="price">Custom</div>
                    </div>
                    <ul className="pricing-features">
                        <li><Check size={16} /> Unlimited Agents</li>
                        <li><Check size={16} /> Custom Model Integration</li>
                        <li><Check size={16} /> Dedicated Hardware Nodes</li>
                        <li><Check size={16} /> White-glove Onboarding</li>
                    </ul>
                    <button className="btn-outline w-full">Contact Sales</button>
                </div>
            </div>
        </div>
    );
};

export default PricingView;
