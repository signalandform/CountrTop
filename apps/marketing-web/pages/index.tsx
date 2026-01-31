import Head from 'next/head';
import { useState, useEffect } from 'react';

export default function Home() {
  const [email, setEmail] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    
    setLoading(true);
    setError('');
    
    try {
      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, businessName })
      });
      
      if (!res.ok) throw new Error('Failed to submit');
      
      setSubmitted(true);
      setEmail('');
      setBusinessName('');
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Head>
        <title>CountrTop - Modern Online Ordering for Restaurants</title>
        <meta name="description" content="Launch your own branded online ordering in minutes. No commissions, no middlemen. Keep 100% of your revenue." />
        <meta property="og:title" content="CountrTop - Modern Online Ordering for Restaurants" />
        <meta property="og:description" content="Launch your own branded online ordering in minutes. No commissions, no middlemen." />
        <meta property="og:type" content="website" />
      </Head>

      {/* Navigation */}
      <nav className={`nav ${scrolled ? 'nav-scrolled' : ''}`}>
        <div className="nav-inner">
          <a href="#" className="logo">
            <span className="logo-icon">◉</span>
            CountrTop
          </a>
          <div className="nav-links">
            <a href="#features">Features</a>
            <a href="#how-it-works">How It Works</a>
            <a href="#pricing">Pricing</a>
            <a href="https://admin.countrtop.com" target="_blank" rel="noopener noreferrer">Vendor sign in</a>
            <a href="#contact" className="btn-nav">Get Started</a>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="hero">
        <div className="hero-bg">
          <div className="hero-gradient" />
          <div className="hero-pattern" />
        </div>
        <div className="container hero-inner">
          <div className="hero-content">
            <div className="hero-badge animate-fade-in">
              <span className="badge-dot" />
              Bootstrapped • Private Beta • POS-Integrated SaaS
            </div>
            <h1 className="hero-title animate-fade-in animate-delay-1">
              Your restaurant.<br />
              <span className="gradient-text">Your orders.</span><br />
              Your revenue.
            </h1>
            <p className="hero-positioning animate-fade-in animate-delay-2">
              Commission-free online ordering for independent restaurants.
              The owned-channel alternative to DoorDash and Uber Eats.
            </p>
            <p className="hero-subtitle animate-fade-in animate-delay-2">
              Launch your own branded storefront in minutes. 
              Connect to your existing POS. Keep 100% of your revenue.
            </p>
            <div className="hero-cta animate-fade-in animate-delay-3">
              <a href="#contact" className="btn-primary btn-large">
                Join the Waitlist
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <path d="M4 10h12m0 0l-4-4m4 4l-4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </a>
              <a href="#how-it-works" className="btn-secondary btn-large">
                See How It Works
              </a>
            </div>
            <div className="hero-stats animate-fade-in animate-delay-4">
              <div className="stat">
                <span className="stat-value">0%</span>
                <span className="stat-label">Commission fees</span>
              </div>
              <div className="stat-divider" />
              <div className="stat">
                <span className="stat-value">&lt;5min</span>
                <span className="stat-label">Setup time</span>
              </div>
              <div className="stat-divider" />
              <div className="stat">
                <span className="stat-value">24/7</span>
                <span className="stat-label">Order acceptance</span>
              </div>
            </div>
          </div>
          <div className="hero-visual animate-fade-in animate-delay-5">
          <div className="phone-mockup">
            <div className="phone-screen">
              <div className="mockup-header">
                <div className="mockup-logo">🍕 Sal&apos;s Pizza</div>
                <div className="mockup-cart">🛒 2</div>
              </div>
              <div className="mockup-items">
                <div className="mockup-item">
                  <div className="item-img" />
                  <div className="item-info">
                    <div className="item-name">Margherita Pizza</div>
                    <div className="item-price">$14.99</div>
                  </div>
                  <button className="item-add">+</button>
                </div>
                <div className="mockup-item">
                  <div className="item-img" style={{ background: '#FFE4B5' }} />
                  <div className="item-info">
                    <div className="item-name">Garlic Knots (6)</div>
                    <div className="item-price">$6.99</div>
                  </div>
                  <button className="item-add">+</button>
                </div>
              </div>
            </div>
          </div>
          </div>
        </div>
      </section>

      {/* Logos / Social Proof */}
      <section className="social-proof">
        <div className="container">
          <p className="proof-label">Integrates with your favorite POS systems</p>
          <div className="pos-logos">
            <div className="pos-logo">
              <svg viewBox="0 0 100 40" fill="currentColor">
                <rect x="10" y="10" width="20" height="20" rx="4" />
                <text x="40" y="26" fontSize="14" fontWeight="600">Square</text>
              </svg>
              <span className="pos-status supported">Supported now</span>
            </div>
            <div className="pos-logo">
              <svg viewBox="0 0 100 40" fill="currentColor">
                <circle cx="20" cy="20" r="10" />
                <text x="38" y="26" fontSize="14" fontWeight="600">Toast</text>
              </svg>
              <span className="pos-status coming-soon">Coming soon</span>
            </div>
            <div className="pos-logo">
              <svg viewBox="0 0 100 40" fill="currentColor">
                <path d="M10 15 L20 10 L30 15 L30 25 L20 30 L10 25 Z" />
                <text x="38" y="26" fontSize="14" fontWeight="600">Clover</text>
              </svg>
              <span className="pos-status coming-soon">Coming soon</span>
            </div>
          </div>
        </div>
      </section>

      {/* Why CountrTop Wins */}
      <section className="why-wins">
        <div className="container">
          <div className="section-header">
            <span className="section-tag">Why CountrTop</span>
            <h2>Built different. Built to last.</h2>
          </div>
          <div className="wins-grid">
            <div className="win-item">
              <span className="win-icon">💰</span>
              <div className="win-content">
                <h4>Zero Commission Economics</h4>
                <p>Restaurants keep 100% of order revenue. Flat monthly SaaS fee—no per-order cuts.</p>
              </div>
            </div>
            <div className="win-item">
              <span className="win-icon">🔌</span>
              <div className="win-content">
                <h4>POS Integration as Moat</h4>
                <p>Deep Square integration supported now. Toast and Clover integrations are coming soon. Menu syncs automatically and orders flow into your existing systems.</p>
              </div>
            </div>
            <div className="win-item">
              <span className="win-icon">🏪</span>
              <div className="win-content">
                <h4>Branded Storefront Ownership</h4>
                <p>Customers order from the restaurant—not a marketplace. Custom domain, colors, and branding.</p>
              </div>
            </div>
            <div className="win-item">
              <span className="win-icon">📺</span>
              <div className="win-content">
                <h4>Built-In Kitchen Display System</h4>
                <p>KDS shows all orders—online and in-store POS—in one unified queue. Ticket flow New → In Progress → Ready → Complete, order recall, and customer notifications when orders are ready. Replaces paper tickets entirely.</p>
              </div>
            </div>
            <div className="win-item">
              <span className="win-icon">🍕</span>
              <div className="win-content">
                <h4>Founder-Operator Insight</h4>
                <p>Built by people who&apos;ve run restaurants and felt the 30% commission pain firsthand.</p>
              </div>
            </div>
            <div className="win-item">
              <span className="win-icon">📈</span>
              <div className="win-content">
                <h4>Expansion Ready</h4>
                <p>Loyalty and multi-location available on Starter and Pro. Scale as you grow.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="features">
        <div className="container">
          <div className="section-header">
            <span className="section-tag">Features</span>
            <h2>Everything you need to succeed online</h2>
            <p>Built by restaurant operators, for restaurant operators. No tech skills required.</p>
          </div>
          <div className="features-grid">
            <div className="feature-card feature-card-large">
              <div className="feature-icon feature-icon-primary">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="2" y="3" width="20" height="14" rx="2" />
                  <path d="M8 21h8M12 17v4" />
                </svg>
              </div>
              <h3>Kitchen Display System</h3>
              <p>Real-time order management for your kitchen. See orders as they come in, track progress, and never miss a ticket.</p>
              <ul className="feature-list">
                <li>Ticket flow: New → In Progress → Ready → Complete with one tap</li>
                <li>Order recall from completed</li>
                <li>Employee clock in/out</li>
                <li>Customer notifications when order is ready</li>
                <li>Online and POS orders in one queue</li>
                <li>Offline support</li>
              </ul>
              <div className="kds-preview">
                <div className="kds-preview-card">
                  <div className="kds-preview-left">
                    <div className="kds-preview-timer">2:34</div>
                    <div className="kds-preview-label">Order A1B2C3</div>
                    <span className="kds-preview-badge" data-source="online">Online</span>
                  </div>
                  <div className="kds-preview-middle">
                    <div className="kds-preview-line"><span className="kds-preview-qty">2×</span> Burger</div>
                    <div className="kds-preview-line"><span className="kds-preview-qty">1×</span> Fries <span className="kds-preview-mod">+ Extra salt</span></div>
                  </div>
                  <div className="kds-preview-right">
                    <button type="button" className="kds-preview-btn" disabled>Ready</button>
                  </div>
                </div>
              </div>
            </div>
            <div className="feature-card">
              <div className="feature-icon">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 2L2 7l10 5 10-5-10-5z" />
                  <path d="M2 17l10 5 10-5M2 12l10 5 10-5" />
                </svg>
              </div>
              <h3>POS Integration</h3>
              <p>Connect to Square now. Toast and Clover integrations are coming soon.</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z" />
                  <line x1="7" y1="7" x2="7.01" y2="7" />
                </svg>
              </div>
              <h3>Your Brand</h3>
              <p>Custom colors, logo, and domain. Customers order from you, not a third-party marketplace.</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
                </svg>
              </div>
              <h3>Analytics Dashboard</h3>
              <p>Track sales, popular items, peak hours, and customer trends. Make data-driven decisions.</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
                  <path d="M13.73 21a2 2 0 01-3.46 0" />
                </svg>
              </div>
              <h3>Customer Notifications</h3>
              <p>Automatic email updates keep customers informed about their order status.</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 6v6l4 2" />
                </svg>
              </div>
              <h3>24/7 Ordering</h3>
              <p>Accept orders around the clock, even when you&apos;re closed. Set your hours and let customers plan ahead.</p>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="how-it-works">
        <div className="container">
          <div className="section-header">
            <span className="section-tag">How It Works</span>
            <h2>Go live in three simple steps</h2>
            <p>No developers, no lengthy setup. Just connect and start selling.</p>
          </div>
          <div className="steps">
            <div className="step">
              <div className="step-number">1</div>
              <div className="step-content">
                <h3>Connect Your POS</h3>
                <p>Link your Square account in a few clicks. Toast and Clover integrations are coming soon.</p>
              </div>
              <div className="step-visual">
                <div className="connect-visual">
                  <div className="connect-icon pos-icon">POS</div>
                  <div className="connect-line" />
                  <div className="connect-icon ct-icon">◉</div>
                </div>
              </div>
            </div>
            <div className="step">
              <div className="step-number">2</div>
              <div className="step-content">
                <h3>Customize Your Storefront</h3>
                <p>Add your logo, choose your colors, and set your business hours. Make it unmistakably yours.</p>
              </div>
              <div className="step-visual">
                <div className="customize-visual">
                  <div className="color-picker">
                    <div className="color-swatch" style={{ background: '#E85D04' }} />
                    <div className="color-swatch" style={{ background: '#1A1A2E' }} />
                    <div className="color-swatch" style={{ background: '#10B981' }} />
                  </div>
                </div>
              </div>
            </div>
            <div className="step">
              <div className="step-number">3</div>
              <div className="step-content">
                <h3>Start Taking Orders</h3>
                <p>Share your link and watch orders roll in. Orders appear on your KDS in real time and sync to your POS.</p>
              </div>
              <div className="step-visual">
                <div className="orders-visual">
                  <div className="order-ping" />
                  <div className="order-ping order-ping-2" />
                  <div className="order-count">+$247</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="pricing">
        <div className="container">
          <div className="section-header">
            <span className="section-tag">Pricing</span>
            <h2>Simple, transparent pricing</h2>
            <p>Subscription SaaS model. No transaction fees. No per-order commissions. Ever.</p>
          </div>
          <div className="pricing-cards">
            <div className="pricing-card">
              <div className="pricing-header">
                <h3>Beta</h3>
                <div className="pricing-badge">Limited Time</div>
              </div>
              <div className="pricing-price">
                <span className="price-amount">$0</span>
                <span className="price-period">/month</span>
              </div>
              <p className="pricing-description">Free while we&apos;re in beta. Lock in your spot and help shape the product.</p>
              <ul className="pricing-features">
                <li><svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 111.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" fill="#10B981"/></svg>KDS single screen: ticket flow New → In Progress → Ready → Complete, order recall</li>
                <li><svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 111.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" fill="#10B981"/></svg>Employee clock in/out</li>
                <li><svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 111.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" fill="#10B981"/></svg>Customer notifications when order is ready</li>
                <li><svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 111.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" fill="#10B981"/></svg>Basic analytics, single location, employee timesheets</li>
                <li><svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 111.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" fill="#10B981"/></svg>Custom pickup instructions, basic support</li>
                <li><svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 111.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" fill="#10B981"/></svg>Your storefront: yourname.countrtop.com</li>
                <li><svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 111.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" fill="#10B981"/></svg>POS integration, email notifications</li>
              </ul>
              <a href="#contact" className="btn-primary btn-full">Join Waitlist</a>
            </div>
            <div className="pricing-card pricing-card-future">
              <div className="pricing-header">
                <h3>Starter</h3>
                <div className="pricing-badge pricing-badge-muted">Post-launch</div>
              </div>
              <div className="pricing-price">
                <span className="price-amount">$49</span>
                <span className="price-period">/month</span>
              </div>
              <p className="pricing-description">Everything in Beta plus loyalty, branding, and more.</p>
              <ul className="pricing-features">
                <li><svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 111.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" fill="#64748B"/></svg>Everything in Beta</li>
                <li><svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 111.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" fill="#64748B"/></svg>Advanced analytics</li>
                <li><svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 111.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" fill="#64748B"/></svg>Customer loyalty program</li>
                <li><svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 111.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" fill="#64748B"/></svg>Scheduled orders</li>
                <li><svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 111.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" fill="#64748B"/></svg>Custom branding (logo, colors)</li>
              </ul>
              <button className="btn-secondary btn-full" disabled>Coming Soon</button>
            </div>
            <div className="pricing-card pricing-card-future">
              <div className="pricing-header">
                <h3>Pro</h3>
                <div className="pricing-badge pricing-badge-muted">Coming Soon</div>
              </div>
              <div className="pricing-price">
                <span className="price-amount">$99</span>
                <span className="price-period">/month</span>
              </div>
              <p className="pricing-description">Everything in Starter for multi-location operations.</p>
              <ul className="pricing-features">
                <li><svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 111.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" fill="#64748B"/></svg>Everything in Starter</li>
                <li><svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 111.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" fill="#64748B"/></svg>Multiple locations</li>
                <li><svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 111.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" fill="#64748B"/></svg>Multiple KDS screens</li>
                <li><svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 111.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" fill="#64748B"/></svg>Role-based staff accounts</li>
              </ul>
              <button className="btn-secondary btn-full" disabled>Coming Soon</button>
            </div>
          </div>
        </div>
      </section>

      {/* Contact / Lead Capture */}
      <section id="contact" className="contact">
        <div className="container">
          <div className="contact-inner">
            <div className="contact-content">
              <h2>Ready to take control of your online orders?</h2>
              <p>Join our early access program and be among the first restaurants to launch with CountrTop. Limited spots available.</p>
            </div>
            <div className="contact-form-wrapper">
              {submitted ? (
                <div className="success-message">
                  <div className="success-icon">✓</div>
                  <h3>You&apos;re on the list!</h3>
                  <p>We&apos;ll be in touch soon with your early access invite.</p>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="contact-form">
                  <div className="form-group">
                    <label htmlFor="businessName">Business Name</label>
                    <input
                      type="text"
                      id="businessName"
                      value={businessName}
                      onChange={(e) => setBusinessName(e.target.value)}
                      placeholder="Your Restaurant"
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="email">Email Address *</label>
                    <input
                      type="email"
                      id="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@restaurant.com"
                      required
                    />
                  </div>
                  {error && <p className="form-error">{error}</p>}
                  <button type="submit" className="btn-primary btn-full" disabled={loading}>
                    {loading ? 'Submitting...' : 'Join the Waitlist'}
                  </button>
                  <p className="form-note">No spam, ever. We&apos;ll only email you about CountrTop.</p>
                </form>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="footer">
        <div className="container">
          <div className="footer-inner">
            <div className="footer-brand">
              <a href="#" className="logo">
                <span className="logo-icon">◉</span>
                CountrTop
              </a>
              <p>Commission-free online ordering for independent restaurants. Built by operators who lived the marketplace pain.</p>
              <div className="footer-meta">
                <span>Bootstrapped</span>
                <span>•</span>
                <span>Founded 2025</span>
                <span>•</span>
                <span>Private Beta</span>
              </div>
            </div>
            <div className="footer-links">
              <div className="footer-col">
                <h4>Product</h4>
                <a href="#features">Features</a>
                <a href="#how-it-works">How It Works</a>
                <a href="#pricing">Pricing</a>
              </div>
              <div className="footer-col">
                <h4>Company</h4>
                <a href="https://admin.countrtop.com" target="_blank" rel="noopener noreferrer">Vendor sign in</a>
                <a href="mailto:hello@countrtop.com">Contact</a>
              </div>
            </div>
          </div>
          <div className="footer-bottom">
            <p>© {new Date().getFullYear()} CountrTop. All rights reserved.</p>
          </div>
        </div>
      </footer>

      <style jsx>{`
        /* Navigation */
        .nav {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          z-index: 100;
          padding: 1rem 0;
          transition: all 0.3s ease;
        }
        .nav-scrolled {
          background: rgba(254, 253, 251, 0.95);
          backdrop-filter: blur(10px);
          box-shadow: 0 1px 3px rgba(0,0,0,0.05);
        }
        .nav-inner {
          max-width: 1200px;
          margin: 0 auto;
          padding: 0 1.5rem;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .logo {
          font-family: var(--font-display);
          font-weight: 800;
          font-size: 1.5rem;
          display: flex;
          align-items: center;
          gap: 0.5rem;
          color: var(--color-secondary);
        }
        .logo-icon {
          color: var(--color-primary);
          font-size: 1.25rem;
        }
        .nav-links {
          display: flex;
          align-items: center;
          gap: 2rem;
        }
        .nav-links a {
          font-weight: 500;
          color: var(--color-text-muted);
          transition: color 0.2s;
        }
        .nav-links a:hover {
          color: var(--color-text);
        }
        .btn-nav {
          background: var(--color-primary);
          color: white !important;
          padding: 0.625rem 1.25rem;
          border-radius: 8px;
          font-weight: 600;
          transition: background 0.2s;
        }
        .btn-nav:hover {
          background: var(--color-primary-dark);
        }

        /* Hero */
        .hero {
          position: relative;
          min-height: 100vh;
          display: flex;
          align-items: center;
          padding: 8rem 0 4rem;
          overflow: hidden;
        }
        .hero-bg {
          position: absolute;
          inset: 0;
          z-index: 0;
        }
        .hero-gradient {
          position: absolute;
          top: -50%;
          right: -20%;
          width: 80%;
          height: 150%;
          background: radial-gradient(ellipse at center, rgba(232, 93, 4, 0.08) 0%, transparent 60%);
        }
        .hero-pattern {
          position: absolute;
          inset: 0;
          background-image: radial-gradient(circle at 1px 1px, rgba(26, 26, 46, 0.03) 1px, transparent 0);
          background-size: 40px 40px;
        }
        .hero-inner {
          position: relative;
          z-index: 1;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 4rem;
          align-items: center;
        }
        .hero-content {
          max-width: 580px;
        }
        .hero-badge {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.5rem 1rem;
          background: var(--color-bg-warm);
          border: 1px solid var(--color-border);
          border-radius: 100px;
          font-size: 0.875rem;
          font-weight: 500;
          color: var(--color-text-muted);
          margin-bottom: 1.5rem;
          opacity: 0;
        }
        .badge-dot {
          width: 8px;
          height: 8px;
          background: var(--color-success);
          border-radius: 50%;
          animation: pulse 2s infinite;
        }
        .hero-title {
          font-size: clamp(2.5rem, 6vw, 4rem);
          font-weight: 800;
          margin-bottom: 1.5rem;
          opacity: 0;
        }
        .gradient-text {
          background: linear-gradient(135deg, var(--color-primary) 0%, var(--color-accent) 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }
        .hero-positioning {
          font-size: 1.125rem;
          font-weight: 600;
          color: var(--color-text);
          margin-bottom: 1rem;
          line-height: 1.5;
          opacity: 0;
        }
        .hero-subtitle {
          font-size: 1.125rem;
          color: var(--color-text-muted);
          margin-bottom: 2rem;
          line-height: 1.7;
          opacity: 0;
        }
        .hero-cta {
          display: flex;
          gap: 1rem;
          margin-bottom: 3rem;
          opacity: 0;
        }
        .btn-primary {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          background: var(--color-primary);
          color: white;
          padding: 0.875rem 1.5rem;
          border-radius: 10px;
          font-weight: 600;
          transition: all 0.2s;
          border: none;
          cursor: pointer;
        }
        .btn-primary:hover {
          background: var(--color-primary-dark);
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(232, 93, 4, 0.3);
        }
        .btn-primary:disabled {
          opacity: 0.7;
          cursor: not-allowed;
          transform: none;
        }
        .btn-secondary {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          background: transparent;
          color: var(--color-text);
          padding: 0.875rem 1.5rem;
          border-radius: 10px;
          font-weight: 600;
          border: 2px solid var(--color-border);
          transition: all 0.2s;
        }
        .btn-secondary:hover {
          border-color: var(--color-text-muted);
        }
        .btn-secondary:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .btn-large {
          padding: 1rem 2rem;
          font-size: 1.0625rem;
        }
        .btn-full {
          width: 100%;
          justify-content: center;
        }
        .hero-stats {
          display: flex;
          align-items: center;
          gap: 2rem;
          opacity: 0;
        }
        .stat {
          display: flex;
          flex-direction: column;
        }
        .stat-value {
          font-family: var(--font-display);
          font-size: 1.5rem;
          font-weight: 700;
          color: var(--color-text);
        }
        .stat-label {
          font-size: 0.875rem;
          color: var(--color-text-muted);
        }
        .stat-divider {
          width: 1px;
          height: 40px;
          background: var(--color-border);
        }

        /* Hero Visual */
        .hero-visual {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
          opacity: 0;
          justify-content: center;
          align-items: flex-start;
        }
        .phone-mockup {
          width: 260px;
          background: white;
          border-radius: 32px;
          padding: 12px;
          box-shadow: 0 25px 50px -12px rgba(0,0,0,0.15), 0 0 0 1px rgba(0,0,0,0.05);
          animation: float 6s ease-in-out infinite;
          align-self: flex-end;
        }
        .phone-screen {
          background: #FAFAFA;
          border-radius: 24px;
          padding: 1rem;
          min-height: 400px;
        }
        .mockup-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1rem;
        }
        .mockup-logo {
          font-weight: 700;
          font-size: 0.875rem;
        }
        .mockup-cart {
          background: var(--color-primary);
          color: white;
          padding: 0.25rem 0.75rem;
          border-radius: 100px;
          font-size: 0.75rem;
          font-weight: 600;
        }
        .mockup-items {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }
        .mockup-item {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          background: white;
          padding: 0.75rem;
          border-radius: 12px;
        }
        .item-img {
          width: 48px;
          height: 48px;
          background: #FFF0E5;
          border-radius: 8px;
        }
        .item-info {
          flex: 1;
        }
        .item-name {
          font-weight: 600;
          font-size: 0.875rem;
        }
        .item-price {
          color: var(--color-text-muted);
          font-size: 0.8125rem;
        }
        .item-add {
          width: 28px;
          height: 28px;
          background: var(--color-primary);
          color: white;
          border: none;
          border-radius: 8px;
          font-size: 1.25rem;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
        }

        /* Social Proof */
        .social-proof {
          padding: 4rem 0;
          background: var(--color-bg-warm);
          border-top: 1px solid var(--color-border);
          border-bottom: 1px solid var(--color-border);
        }
        .proof-label {
          text-align: center;
          color: var(--color-text-muted);
          font-size: 0.875rem;
          margin-bottom: 2rem;
        }
        .pos-logos {
          display: flex;
          justify-content: center;
          align-items: center;
          gap: 4rem;
        }
        .pos-logo {
          color: var(--color-text-light);
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 6px;
        }
        .pos-logo svg {
          height: 40px;
          width: auto;
        }
        .pos-status {
          font-size: 0.75rem;
          padding: 4px 10px;
          border-radius: 999px;
          border: 1px solid var(--color-border);
          text-transform: uppercase;
          letter-spacing: 0.4px;
        }
        .pos-status.supported {
          color: #0f766e;
          border-color: rgba(16, 185, 129, 0.4);
          background: rgba(16, 185, 129, 0.12);
        }
        .pos-status.coming-soon {
          color: #f59e0b;
          border-color: rgba(245, 158, 11, 0.4);
          background: rgba(245, 158, 11, 0.12);
        }

        /* Why CountrTop Wins */
        .why-wins {
          padding: var(--section-padding) 0;
          background: var(--color-bg);
        }
        .wins-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 2rem;
          max-width: 1000px;
          margin: 0 auto;
        }
        .win-item {
          display: flex;
          gap: 1rem;
          align-items: flex-start;
        }
        .win-icon {
          font-size: 1.5rem;
          flex-shrink: 0;
          width: 48px;
          height: 48px;
          background: var(--color-bg-warm);
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .win-content h4 {
          font-size: 1rem;
          font-weight: 700;
          margin-bottom: 0.375rem;
          color: var(--color-text);
        }
        .win-content p {
          font-size: 0.9375rem;
          color: var(--color-text-muted);
          line-height: 1.5;
        }

        /* Features */
        .features {
          padding: var(--section-padding) 0;
        }
        .section-header {
          text-align: center;
          max-width: 600px;
          margin: 0 auto 4rem;
        }
        .section-tag {
          display: inline-block;
          padding: 0.375rem 1rem;
          background: var(--color-bg-warm);
          border-radius: 100px;
          font-size: 0.875rem;
          font-weight: 600;
          color: var(--color-primary);
          margin-bottom: 1rem;
        }
        .section-header h2 {
          font-size: clamp(2rem, 4vw, 2.75rem);
          margin-bottom: 1rem;
        }
        .section-header p {
          color: var(--color-text-muted);
          font-size: 1.125rem;
        }
        .features-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 1.5rem;
        }
        .feature-card {
          background: white;
          border: 1px solid var(--color-border);
          border-radius: 16px;
          padding: 2rem;
          transition: all 0.3s ease;
        }
        .feature-card:hover {
          border-color: var(--color-primary);
          box-shadow: 0 4px 20px rgba(232, 93, 4, 0.08);
          transform: translateY(-4px);
        }
        .feature-card-large {
          grid-column: span 1;
          grid-row: span 2;
          background: linear-gradient(135deg, var(--color-bg-warm) 0%, white 100%);
        }
        .feature-icon {
          width: 56px;
          height: 56px;
          background: var(--color-bg-warm);
          border-radius: 14px;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 1.5rem;
          color: var(--color-text-muted);
        }
        .feature-icon-primary {
          background: linear-gradient(135deg, var(--color-primary) 0%, var(--color-primary-light) 100%);
          color: white;
        }
        .feature-card h3 {
          font-size: 1.25rem;
          margin-bottom: 0.75rem;
        }
        .feature-card p {
          color: var(--color-text-muted);
          line-height: 1.6;
        }
        .feature-list {
          list-style: none;
          margin-top: 1.5rem;
        }
        .feature-list li {
          padding: 0.5rem 0;
          padding-left: 1.5rem;
          position: relative;
          color: var(--color-text-muted);
        }
        .feature-list li::before {
          content: '✓';
          position: absolute;
          left: 0;
          color: var(--color-success);
          font-weight: bold;
        }

        .kds-preview {
          margin-top: 1.5rem;
          padding-top: 1.5rem;
          border-top: 1px solid var(--color-border);
        }
        .kds-preview-card {
          display: flex;
          align-items: stretch;
          gap: 1rem;
          padding: 1rem;
          background: white;
          border: 1px solid var(--color-border);
          border-radius: 12px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.06);
        }
        .kds-preview-left {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
          min-width: 80px;
        }
        .kds-preview-timer {
          font-family: var(--font-display);
          font-weight: 700;
          font-size: 1.25rem;
          color: var(--color-success);
        }
        .kds-preview-label {
          font-size: 0.875rem;
          font-weight: 600;
          color: var(--color-text);
        }
        .kds-preview-badge {
          display: inline-block;
          padding: 0.2rem 0.5rem;
          border-radius: 6px;
          font-size: 0.7rem;
          font-weight: 600;
        }
        .kds-preview-badge[data-source="online"] {
          background: rgba(59, 130, 246, 0.15);
          color: #2563eb;
        }
        .kds-preview-middle {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 0.35rem;
          font-size: 0.875rem;
          color: var(--color-text);
        }
        .kds-preview-line {
          display: flex;
          align-items: baseline;
          gap: 0.35rem;
        }
        .kds-preview-qty {
          font-weight: 700;
          min-width: 2ch;
        }
        .kds-preview-mod {
          font-size: 0.8rem;
          color: var(--color-text-muted);
        }
        .kds-preview-right {
          display: flex;
          align-items: center;
        }
        .kds-preview-btn {
          padding: 0.5rem 1rem;
          border-radius: 8px;
          border: none;
          background: var(--color-primary);
          color: white;
          font-weight: 600;
          font-size: 0.875rem;
          cursor: default;
        }

        /* How It Works */
        .how-it-works {
          padding: var(--section-padding) 0;
          background: var(--color-bg-dark);
          color: white;
        }
        .how-it-works .section-tag {
          background: rgba(232, 93, 4, 0.15);
        }
        .how-it-works .section-header p {
          color: rgba(255,255,255,0.6);
        }
        .steps {
          display: flex;
          flex-direction: column;
          gap: 3rem;
          max-width: 900px;
          margin: 0 auto;
        }
        .step {
          display: grid;
          grid-template-columns: auto 1fr auto;
          gap: 2rem;
          align-items: center;
        }
        .step-number {
          width: 64px;
          height: 64px;
          background: linear-gradient(135deg, var(--color-primary) 0%, var(--color-primary-light) 100%);
          border-radius: 20px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: var(--font-display);
          font-size: 1.5rem;
          font-weight: 800;
        }
        .step-content h3 {
          font-size: 1.5rem;
          margin-bottom: 0.5rem;
        }
        .step-content p {
          color: rgba(255,255,255,0.6);
          font-size: 1.0625rem;
        }
        .step-visual {
          width: 180px;
          height: 100px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .connect-visual {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }
        .connect-icon {
          width: 48px;
          height: 48px;
          background: rgba(255,255,255,0.1);
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 700;
          font-size: 0.75rem;
        }
        .ct-icon {
          background: var(--color-primary);
          font-size: 1.25rem;
        }
        .connect-line {
          width: 40px;
          height: 2px;
          background: linear-gradient(90deg, rgba(255,255,255,0.2) 0%, var(--color-primary) 100%);
        }
        .customize-visual {
          display: flex;
          gap: 0.5rem;
        }
        .color-picker {
          display: flex;
          gap: 0.5rem;
        }
        .color-swatch {
          width: 40px;
          height: 40px;
          border-radius: 10px;
          border: 3px solid rgba(255,255,255,0.2);
          transition: transform 0.2s;
        }
        .color-swatch:first-child {
          border-color: white;
          transform: scale(1.1);
        }
        .orders-visual {
          position: relative;
          width: 80px;
          height: 80px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .order-ping {
          position: absolute;
          inset: 0;
          border: 2px solid var(--color-success);
          border-radius: 50%;
          animation: ping 2s infinite;
        }
        .order-ping-2 {
          animation-delay: 1s;
        }
        @keyframes ping {
          0% {
            transform: scale(0.5);
            opacity: 1;
          }
          100% {
            transform: scale(1.5);
            opacity: 0;
          }
        }
        .order-count {
          font-family: var(--font-display);
          font-weight: 700;
          font-size: 1.25rem;
          color: var(--color-success);
        }

        /* Pricing */
        .pricing {
          padding: var(--section-padding) 0;
        }
        .pricing-cards {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 2rem;
          max-width: 1100px;
          margin: 0 auto;
        }
        .pricing-card {
          background: white;
          border: 2px solid var(--color-border);
          border-radius: 24px;
          padding: 2.5rem;
          transition: all 0.3s ease;
        }
        .pricing-card:first-child {
          border-color: var(--color-primary);
          box-shadow: 0 8px 30px rgba(232, 93, 4, 0.12);
        }
        .pricing-card-future {
          opacity: 0.7;
        }
        .pricing-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 1rem;
        }
        .pricing-header h3 {
          font-size: 1.25rem;
        }
        .pricing-badge {
          padding: 0.25rem 0.75rem;
          background: var(--color-primary);
          color: white;
          border-radius: 100px;
          font-size: 0.75rem;
          font-weight: 600;
        }
        .pricing-badge-muted {
          background: var(--color-border);
          color: var(--color-text-muted);
        }
        .pricing-price {
          margin-bottom: 1rem;
        }
        .price-amount {
          font-family: var(--font-display);
          font-size: 3rem;
          font-weight: 800;
        }
        .price-period {
          color: var(--color-text-muted);
        }
        .pricing-description {
          color: var(--color-text-muted);
          margin-bottom: 2rem;
          line-height: 1.6;
        }
        .pricing-features {
          list-style: none;
          margin-bottom: 2rem;
        }
        .pricing-features li {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0.5rem 0;
          color: var(--color-text);
        }

        /* Contact */
        .contact {
          padding: var(--section-padding) 0;
          background: linear-gradient(180deg, var(--color-bg-warm) 0%, var(--color-bg) 100%);
        }
        .contact-inner {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 4rem;
          align-items: center;
          max-width: 1000px;
          margin: 0 auto;
        }
        .contact-content h2 {
          font-size: clamp(1.75rem, 3vw, 2.25rem);
          margin-bottom: 1rem;
        }
        .contact-content p {
          color: var(--color-text-muted);
          font-size: 1.125rem;
          line-height: 1.7;
        }
        .contact-form-wrapper {
          background: white;
          border-radius: 24px;
          padding: 2.5rem;
          box-shadow: 0 4px 20px rgba(0,0,0,0.05);
        }
        .contact-form {
          display: flex;
          flex-direction: column;
          gap: 1.25rem;
        }
        .form-group {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }
        .form-group label {
          font-weight: 600;
          font-size: 0.875rem;
        }
        .form-group input {
          padding: 0.875rem 1rem;
          border: 2px solid var(--color-border);
          border-radius: 10px;
          font-size: 1rem;
          transition: border-color 0.2s;
        }
        .form-group input:focus {
          outline: none;
          border-color: var(--color-primary);
        }
        .form-error {
          color: #DC2626;
          font-size: 0.875rem;
        }
        .form-note {
          text-align: center;
          color: var(--color-text-muted);
          font-size: 0.8125rem;
        }
        .success-message {
          text-align: center;
          padding: 2rem 0;
        }
        .success-icon {
          width: 64px;
          height: 64px;
          background: var(--color-success);
          color: white;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 2rem;
          margin: 0 auto 1.5rem;
        }
        .success-message h3 {
          font-size: 1.5rem;
          margin-bottom: 0.5rem;
        }
        .success-message p {
          color: var(--color-text-muted);
        }

        /* Footer */
        .footer {
          padding: 4rem 0 2rem;
          background: var(--color-bg-dark);
          color: white;
        }
        .footer-inner {
          display: flex;
          justify-content: space-between;
          padding-bottom: 3rem;
          border-bottom: 1px solid rgba(255,255,255,0.1);
        }
        .footer-brand {
          max-width: 280px;
        }
        .footer-brand .logo {
          color: white;
          margin-bottom: 1rem;
        }
        .footer-brand p {
          color: rgba(255,255,255,0.5);
          font-size: 0.9375rem;
          margin-bottom: 1rem;
        }
        .footer-meta {
          display: flex;
          gap: 0.5rem;
          font-size: 0.8125rem;
          color: rgba(255,255,255,0.4);
        }
        .footer-links {
          display: flex;
          gap: 4rem;
        }
        .footer-col h4 {
          font-size: 0.875rem;
          font-weight: 600;
          margin-bottom: 1rem;
          color: rgba(255,255,255,0.5);
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .footer-col a {
          display: block;
          padding: 0.375rem 0;
          color: rgba(255,255,255,0.8);
          transition: color 0.2s;
        }
        .footer-col a:hover {
          color: white;
        }
        .footer-bottom {
          padding-top: 2rem;
          text-align: center;
        }
        .footer-bottom p {
          color: rgba(255,255,255,0.4);
          font-size: 0.875rem;
        }

        /* Responsive */
        @media (max-width: 1024px) {
          .hero-inner {
            grid-template-columns: 1fr;
            gap: 3rem;
          }
          .hero-visual {
            display: flex;
            flex-direction: row;
            justify-content: center;
            order: -1;
          }
          .hero-content {
            max-width: 100%;
            text-align: center;
          }
          .hero-cta {
            justify-content: center;
          }
          .hero-stats {
            justify-content: center;
          }
          .phone-mockup {
            width: 220px;
          }
          .wins-grid {
            grid-template-columns: repeat(2, 1fr);
          }
          .features-grid {
            grid-template-columns: repeat(2, 1fr);
          }
          .feature-card-large {
            grid-column: span 2;
            grid-row: span 1;
          }
        }
        @media (max-width: 768px) {
          .nav-links {
            display: none;
          }
          .hero-cta {
            flex-direction: column;
          }
          .hero-stats {
            flex-direction: column;
            align-items: flex-start;
            gap: 1rem;
          }
          .stat-divider {
            display: none;
          }
          .wins-grid {
            grid-template-columns: 1fr;
          }
          .features-grid {
            grid-template-columns: 1fr;
          }
          .feature-card-large {
            grid-column: span 1;
          }
          .step {
            grid-template-columns: auto 1fr;
          }
          .step-visual {
            display: none;
          }
          .pricing-cards {
            grid-template-columns: 1fr;
          }
          .contact-inner {
            grid-template-columns: 1fr;
            gap: 2rem;
          }
          .footer-inner {
            flex-direction: column;
            gap: 2rem;
          }
          .footer-links {
            gap: 2rem;
          }
          .footer-meta {
            flex-wrap: wrap;
          }
          .pos-logos {
            gap: 2rem;
            flex-wrap: wrap;
          }
        }
      `}</style>
    </>
  );
}
