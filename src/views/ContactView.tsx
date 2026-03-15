import React from 'react';
import { Mail, MessageSquare, MapPin, Globe, Send } from 'lucide-react';
import AnimatedBackground from '../components/AnimatedBackground';
import './PublicPages.css';

const ContactView: React.FC = () => {
    return (
        <div className="public-page-container">
            <AnimatedBackground />

            <header className="page-header animate-fade-in-up">
                <h1 className="page-title">Get in <span className="text-gradient">Touch</span></h1>
                <p className="page-subtitle">Ready to deploy your first autonomous squad? Our enterprise consultants are here to help you navigate the agentic era.</p>
            </header>

            <div className="contact-grid-layout animate-fade-in-up delay-100">
                <div className="contact-form-container glass-panel">
                    <form className="contact-form">
                        <div className="form-group">
                            <label>Full Name</label>
                            <input type="text" placeholder="John Doe" />
                        </div>
                        <div className="form-group">
                            <label>Email Address</label>
                            <input type="email" placeholder="john@enterprise.com" />
                        </div>
                        <div className="form-group">
                            <label>Subject</label>
                            <select>
                                <option>Enterprise Inquiry</option>
                                <option>Agent Alignment Services</option>
                                <option>Partnership Proposal</option>
                                <option>Careers</option>
                            </select>
                        </div>
                        <div className="form-group">
                            <label>Message</label>
                            <textarea placeholder="Tell us about your AI mission..."></textarea>
                        </div>
                        <button type="submit" className="btn-primary-glow w-full">
                            Send Message <Send size={18} />
                        </button>
                    </form>
                </div>

                <div className="contact-info-panel">
                    <div className="info-card glass-panel">
                        <MapPin size={24} className="text-accent-primary" />
                        <div>
                            <h4>San Francisco HQ</h4>
                            <p className="text-muted">Aegis Tower, 101 Mission St<br />San Francisco, CA 94105</p>
                        </div>
                    </div>

                    <div className="info-card glass-panel">
                        <Globe size={24} className="text-accent-secondary" />
                        <div>
                            <h4>London Innovation Hub</h4>
                            <p className="text-muted">22 Bishopsgate<br />London, EC2N 4BQ, UK</p>
                        </div>
                    </div>

                    <div className="social-links mt-12">
                        <div className="social-icon glass-panel"><Mail size={20} /></div>
                        <div className="social-icon glass-panel"><MessageSquare size={20} /></div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ContactView;
