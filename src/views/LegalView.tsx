import React from 'react';
import { useParams, Navigate } from 'react-router-dom';
import { Shield, FileText, Lock } from 'lucide-react';
import './LegalView.css';

const CONTENT = {
    privacy: {
        title: 'Privacy Policy',
        icon: <Shield size={32} className="legal-icon text-accent" />,
        lastUpdated: 'March 7, 2026',
        sections: [
            {
                heading: '1. Information We Collect',
                body: 'AegisCorp Agentic Intelligence collects information to provide better services to our enterprise users. This includes account information, telemetry data from deployed autonomous agents, and system interaction logs. All data is encrypted at rest and in transit.'
            },
            {
                heading: '2. How We Use Information',
                body: 'We use the information we collect to maintain and improve our mission control services, develop new features, and protect AegisCorp Agentic Intelligence and our users. Telemetry data is strictly used for analyzing agent performance and is never sold to third parties.'
            },
            {
                heading: '3. Data Security',
                body: 'Security is paramount at AegisCorp Agentic Intelligence. We implement military-grade encryption, strict access controls, and regular external security audits to ensure your data and agent logic remain completely secure.'
            }
        ]
    },
    terms: {
        title: 'Terms of Service',
        icon: <FileText size={32} className="legal-icon text-accent" />,
        lastUpdated: 'March 7, 2026',
        sections: [
            {
                heading: '1. Acceptance of Terms',
                body: 'By accessing or using AegisCorp Agentic Intelligence Enterprise HQ, you agree to be bound by these Terms of Service. If you do not agree to these terms, do not use our services.'
            },
            {
                heading: '2. Autonomous Agents Operations',
                body: 'You are responsible for the actions and logic of the autonomous agents you deploy through AegisCorp Agentic Intelligence. You agree not to deploy agents that violate any laws, perform malicious activities, or intentionally disrupt systems.'
            },
            {
                heading: '3. Service Availability',
                body: 'While we strive for 99.99% uptime, AegisCorp Agentic Intelligence services are provided "as is" and "as available" without any warranties. We reserve the right to suspend access for maintenance or security reasons.'
            }
        ]
    },
    security: {
        title: 'Security Posture',
        icon: <Lock size={32} className="legal-icon text-accent" />,
        lastUpdated: 'March 7, 2026',
        sections: [
            {
                heading: 'Compliance & Certifications',
                body: 'AegisCorp Agentic Intelligence maintains SOC 2 Type II, ISO 27001, and HIPAA compliance. Our infrastructure is continuously monitored for threats.'
            },
            {
                heading: 'Agent Sandboxing',
                body: 'All autonomous agents operate within isolated, secure sandboxes. Agent memory and state are strictly segregated between different enterprise tenants to prevent data leakage.'
            },
            {
                heading: 'Vulnerability Disclosure',
                body: 'We support the security community through our responsible disclosure program. If you believe you have found a vulnerability, please contact our security team immediately at security@aegiscorp.com.'
            }
        ]
    }
};

const LegalView: React.FC = () => {
    const { page } = useParams<{ page: string }>();

    if (!page || !(page in CONTENT)) {
        return <Navigate to="/" replace />;
    }

    const content = CONTENT[page as keyof typeof CONTENT];

    return (
        <div className="legal-container">
            <div className="legal-header">
                {content.icon}
                <h1 className="legal-title">{content.title}</h1>
                <p className="legal-meta">Last Updated: {content.lastUpdated}</p>
            </div>

            <div className="legal-content glass-panel">
                {content.sections.map((section, idx) => (
                    <div key={idx} className="legal-section">
                        <h2>{section.heading}</h2>
                        <p>{section.body}</p>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default LegalView;
