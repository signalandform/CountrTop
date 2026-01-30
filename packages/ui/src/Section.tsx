import React from 'react';

type SectionProps = {
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
};

export const Section: React.FC<SectionProps> = ({ title, subtitle, children }) => (
  <section className="ct-section">
    <header className="ct-section-header">
      <p className="ct-section-subtitle">{subtitle}</p>
      <h2 className="ct-section-title">{title}</h2>
    </header>
    {children}
  </section>
);
