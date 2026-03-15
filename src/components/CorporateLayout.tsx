import React from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import './CorporateLayout.css';

const CorporateLayout: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();

    const isScrolled = false; // Add scroll listener later if desired

    return (
        <div className="corporate-layout">
            <nav className={`corp-navbar ${isScrolled ? 'scrolled' : ''}`}>
                <div className="nav-container">
                    <div className="logo-group" onClick={() => navigate('/')}>
                        <img src="/logo.svg" alt="AegisCorp Agentic Intelligence Logo" style={{ width: 28, height: 28 }} />
                        <span className="logo-text" style={{ fontFamily: 'var(--font-serif)', letterSpacing: '-0.02em', fontSize: '18px', fontWeight: 600 }}>AegisCorp Agentic Intelligence</span>
                    </div>

                    <div className="nav-links">
                        <button className={`nav-link ${location.pathname === '/' ? 'active' : ''}`} onClick={() => navigate('/')}>Home</button>
                        <button className={`nav-link ${location.pathname === '/products' ? 'active' : ''}`} onClick={() => navigate('/products')}>Products</button>
                        <button className={`nav-link ${location.pathname === '/research' ? 'active' : ''}`} onClick={() => navigate('/research')}>Research</button>
                        <button className={`nav-link ${location.pathname === '/safety' ? 'active' : ''}`} onClick={() => navigate('/safety')}>Safety</button>
                        <button className={`nav-link ${location.pathname === '/news' ? 'active' : ''}`} onClick={() => navigate('/news')}>News</button>
                        <button className={`nav-link ${location.pathname === '/company' ? 'active' : ''}`} onClick={() => navigate('/company')}>Company</button>
                    </div>

                    <div className="nav-actions">
                        <button className="btn-login">Log In</button>
                        <button className="btn-launch" onClick={() => navigate('/mission')}>
                            Launch HQ
                        </button>
                    </div>
                </div>
            </nav>

            <main className="main-content">
                <Outlet />
            </main>

            <footer className="corp-footer">
                <div className="footer-grid">
                    <div className="footer-brand-section">
                        <div className="logo-group mb-4">
                            <img src="/logo.svg" alt="AegisCorp Agentic Intelligence" style={{ width: 24, height: 24 }} />
                            <span className="logo-text">AegisCorp Agentic Intelligence</span>
                        </div>
                        <p className="footer-tagline">Architecting the future of autonomous agentic intelligence.</p>
                        <div className="footer-socials">
                            <div className="social-link">𝕏</div>
                            <div className="social-link">in</div>
                            <div className="social-link">github</div>
                        </div>
                    </div>
                    
                    <div className="footer-column">
                        <h4>Platform</h4>
                        <span onClick={() => navigate('/products')}>Products</span>
                        <span onClick={() => navigate('/solutions')}>Solutions</span>
                        <span onClick={() => navigate('/pricing')}>Pricing</span>
                        <span onClick={() => navigate('/mission')}>Mission Control</span>
                    </div>

                    <div className="footer-column">
                        <h4>Resources</h4>
                        <span onClick={() => navigate('/research')}>Research</span>
                        <span onClick={() => navigate('/safety')}>Safety</span>
                        <span onClick={() => navigate('/news')}>News & Blog</span>
                        <span>Partners</span>
                    </div>

                    <div className="footer-column">
                        <h4>Company</h4>
                        <span onClick={() => navigate('/company')}>About Us</span>
                        <span onClick={() => navigate('/careers')}>Careers</span>
                        <span onClick={() => navigate('/contact')}>Contact</span>
                        <span>Media Kit</span>
                    </div>
                </div>

                <div className="footer-bottom">
                    <div className="footer-legal">
                        <span onClick={() => navigate('/legal/privacy')}>Privacy</span>
                        <span onClick={() => navigate('/legal/terms')}>Terms</span>
                        <span onClick={() => navigate('/legal/security')}>Security</span>
                        <span onClick={() => navigate('/legal/cookie')}>Cookies</span>
                    </div>
                    <div className="footer-copyright">
                        © 2026 AegisCorp Agentic Intelligence. All rights reserved. Built for the Agentic Era.
                    </div>
                </div>
            </footer>
        </div>
    );
};

export default CorporateLayout;
