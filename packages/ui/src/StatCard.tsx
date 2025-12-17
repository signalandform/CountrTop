import React from 'react';

type StatCardProps = {
  label: string;
  value: string | number;
  helperText?: string;
};

export const StatCard: React.FC<StatCardProps> = ({ label, value, helperText }) => (
  <div
    style={{
      border: '1px solid #e5e7eb',
      borderRadius: 12,
      padding: 16,
      display: 'flex',
      flexDirection: 'column',
      gap: 4,
      background: '#f9fafb'
    }}
  >
    <span style={{ color: '#6b7280', fontSize: 12 }}>{label}</span>
    <strong style={{ fontSize: 22 }}>{value}</strong>
    {helperText ? <span style={{ color: '#9ca3af', fontSize: 12 }}>{helperText}</span> : null}
  </div>
);
