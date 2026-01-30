import React from 'react';

type StatCardProps = {
  label: string;
  value: string | number;
  helperText?: string;
};

export const StatCard: React.FC<StatCardProps> = ({ label, value, helperText }) => (
  <div className="ct-stat-card">
    <span className="ct-stat-label">{label}</span>
    <strong className="ct-stat-value">{value}</strong>
    {helperText ? <span className="ct-stat-helper">{helperText}</span> : null}
  </div>
);
