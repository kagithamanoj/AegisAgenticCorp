import React from 'react';
import { Briefcase, MapPin, Rocket, Users, ChevronRight } from 'lucide-react';
import AnimatedBackground from '../components/AnimatedBackground';
import './PublicPages.css';

const CareersView: React.FC = () => {
    const jobs = [
        { title: 'Senior Research Scientist (Alignment)', location: 'San Francisco, CA / Remote', dept: 'Research' },
        { title: 'Distributed Systems Engineer', location: 'London, UK / Remote', dept: 'Engineering' },
        { title: 'Product Manager (Agentic UX)', location: 'San Francisco, CA', dept: 'Product' },
        { title: 'Security Engineer (Safety)', location: 'Global Remote', dept: 'Safety' },
    ];

    return (
        <div className="public-page-container">
            <AnimatedBackground />

            <header className="page-header animate-fade-in-up">
                <h1 className="page-title">Join the <span className="text-gradient">Expansion</span></h1>
                <p className="page-subtitle">We're looking for the boldest minds to help us build the future of autonomous intelligence. Help us define the agentic era.</p>
            </header>

            <div className="careers-content animate-fade-in-up delay-100">
                <div className="culture-grid">
                    <div className="culture-card glass-panel">
                        <Rocket size={32} className="text-accent-primary mb-4" />
                        <h3>Massive Impact</h3>
                        <p>Work on technology that is fundamentally changing how enterprises operate and humans interact with AI.</p>
                    </div>
                    <div className="culture-card glass-panel">
                        <Users size={32} className="text-accent-secondary mb-4" />
                        <h3>Top Tier Talent</h3>
                        <p>Join a team of world-class researchers, engineers, and designers from the world's leading labs.</p>
                    </div>
                </div>

                <div className="jobs-section mt-12">
                    <h2 className="section-title">Open Roles</h2>
                    <div className="jobs-list">
                        {jobs.map((job, idx) => (
                            <div key={idx} className="job-row glass-panel">
                                <div className="job-main">
                                    <h3>{job.title}</h3>
                                    <div className="job-meta">
                                        <span><Briefcase size={14} /> {job.dept}</span>
                                        <span><MapPin size={14} /> {job.location}</span>
                                    </div>
                                </div>
                                <button className="btn-link">Apply Now <ChevronRight size={16} /></button>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default CareersView;
