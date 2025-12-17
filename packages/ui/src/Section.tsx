import React from 'react';

type SectionProps = {
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
};

export const Section: React.FC<SectionProps> = ({ title, subtitle, children }) => (
  <section style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 16, marginBottom: 16 }}>
    <header style={{ marginBottom: 12 }}>
      <p style={{ fontSize: 12, color: '#6b7280', margin: 0, textTransform: 'uppercase', letterSpacing: 0.5 }}>
        {subtitle}
      </p>
      <h2 style={{ margin: 0 }}>{title}</h2>
    </header>
    {children}
  </section>
);
