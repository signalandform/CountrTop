import React from 'react';

export type OrderStatusState = 'placed' | 'preparing' | 'ready' | 'completed' | 'unknown';

export type CompletedCtaProps = {
  contactPhone: string;
  reviewUrl?: string | null;
  feedbackRating?: 'thumbs_up' | 'thumbs_down' | null;
  onFeedback: (rating: 'thumbs_up' | 'thumbs_down') => void;
};

type OrderStatusTrackerProps = {
  status: OrderStatusState;
  shortcode?: string | null;
  estimatedWaitMinutes?: number | null;
  orderId?: string;
  items?: Array<{ name: string; quantity: number; price?: number }>;
  total?: number;
  currency?: string;
  placedAt?: string;
  compact?: boolean;
  completedCta?: CompletedCtaProps;
};

const getStatusLabel = (s: OrderStatusState) => {
  switch (s) {
    case 'placed': return 'Order Received';
    case 'preparing': return 'Being Prepared';
    case 'ready': return 'Ready for Pickup!';
    case 'completed': return 'Completed';
    default: return 'Processing...';
  }
};

const getStatusIcon = (s: OrderStatusState) => {
  switch (s) {
    case 'placed': return '📋';
    case 'preparing': return '👨‍🍳';
    case 'ready': return '✅';
    case 'completed': return '🎉';
    default: return '⏳';
  }
};

export function OrderStatusTracker({
  status,
  shortcode,
  estimatedWaitMinutes,
  orderId,
  items,
  total,
  currency = 'USD',
  placedAt,
  compact = false,
  completedCta,
}: OrderStatusTrackerProps) {
  const formatCurrency = (cents: number, curr: string) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: curr }).format(cents / 100);

  const formatTime = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  };

  const isStepActive = (step: 'received' | 'preparing' | 'ready') => {
    if (step === 'received') return true;
    if (step === 'preparing') return status === 'preparing' || status === 'ready' || status === 'completed';
    if (step === 'ready') return status === 'ready' || status === 'completed';
    return false;
  };

  const isStepCompleted = (step: 'received' | 'preparing' | 'ready') => {
    if (step === 'received') return status !== 'placed' && status !== 'unknown';
    if (step === 'preparing') return status === 'ready' || status === 'completed';
    if (step === 'ready') return status === 'completed';
    return false;
  };

  return (
    <div className={`order-status-tracker ${compact ? 'compact' : ''}`}>
      {/* Header with order ID and shortcode */}
      <div className="tracker-header">
        <div className="tracker-title">
          {orderId && <span className="order-id">Order #{orderId.slice(-6).toUpperCase()}</span>}
          {placedAt && <span className="order-time">{formatTime(placedAt)}</span>}
        </div>
        {shortcode && (
          <div className="shortcode-badge">#{shortcode}</div>
        )}
      </div>

      {/* 3-Step Progress Tracker */}
      <div className="status-steps">
        <div className={`status-step ${isStepActive('received') ? 'active' : ''} ${isStepCompleted('received') ? 'completed' : ''}`}>
          <div className="step-icon">📋</div>
          <div className="step-label">Received</div>
        </div>
        <div className="step-line"></div>
        <div className={`status-step ${isStepActive('preparing') ? 'active' : ''} ${isStepCompleted('preparing') ? 'completed' : ''}`}>
          <div className="step-icon">👨‍🍳</div>
          <div className="step-label">Preparing</div>
        </div>
        <div className="step-line"></div>
        <div className={`status-step ${isStepActive('ready') ? 'active' : ''} ${isStepCompleted('ready') ? 'completed' : ''}`}>
          <div className="step-icon">✅</div>
          <div className="step-label">Ready!</div>
        </div>
      </div>

      {/* Current Status Message */}
      <div className={`status-message status-${status}`}>
        <span className="status-emoji">{getStatusIcon(status)}</span>
        <span className="status-text">{getStatusLabel(status)}</span>
        {estimatedWaitMinutes && status !== 'ready' && status !== 'completed' && (
          <span className="estimated-time">~{estimatedWaitMinutes} min</span>
        )}
      </div>

      {/* Ready Shortcode Display */}
      {status === 'ready' && shortcode && (
        <div className="ready-shortcode">
          <div className="shortcode-label">Show this code at pickup</div>
          <div className="shortcode-value">#{shortcode}</div>
        </div>
      )}

      {/* Completed CTA: feedback, review link, contact */}
      {status === 'completed' && completedCta && (
        <div className="completed-cta">
          <div className="cta-feedback">
            <div className="cta-label">How was your food?</div>
            {completedCta.feedbackRating ? (
              <p className="cta-feedback-thanks">
                Thanks for your feedback! {completedCta.feedbackRating === 'thumbs_up' ? '👍' : '👎'}
              </p>
            ) : (
              <div className="cta-thumbs">
                <button
                  type="button"
                  className="cta-thumb"
                  onClick={() => completedCta.onFeedback('thumbs_up')}
                  aria-label="Thumbs up"
                >
                  👍
                </button>
                <button
                  type="button"
                  className="cta-thumb"
                  onClick={() => completedCta.onFeedback('thumbs_down')}
                  aria-label="Thumbs down"
                >
                  👎
                </button>
              </div>
            )}
          </div>
          <div className="cta-actions">
            {completedCta.reviewUrl && (
              <div className="cta-action-item">
                <div className="cta-label">Review</div>
                <a
                  href={completedCta.reviewUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="cta-link cta-link-review"
                >
                  Leave us a review
                </a>
              </div>
            )}
            {completedCta.contactPhone ? (
              <div className="cta-action-item">
                <div className="cta-label">Contact for help</div>
                <a
                  href={`tel:${completedCta.contactPhone.replace(/\D/g, '')}`}
                  className="cta-link cta-link-contact"
                >
                  {completedCta.contactPhone}
                </a>
              </div>
            ) : (
              <div className="cta-action-item">
                <div className="cta-label">Contact</div>
                <span className="cta-muted">Contact the restaurant directly</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Items Summary (if provided and not compact) */}
      {!compact && items && items.length > 0 && (
        <div className="items-summary">
          {items.slice(0, 5).map((item, idx) => (
            <div key={idx} className="item-row">
              <span className="item-qty">{item.quantity}×</span>
              <span className="item-name">{item.name}</span>
              {item.price !== undefined && (
                <span className="item-price">{formatCurrency(item.price * item.quantity, currency)}</span>
              )}
            </div>
          ))}
          {items.length > 5 && (
            <div className="items-more">+{items.length - 5} more items</div>
          )}
          {total !== undefined && (
            <div className="items-total">
              <span>Total</span>
              <strong>{formatCurrency(total, currency)}</strong>
            </div>
          )}
        </div>
      )}

      <style jsx>{`
        .order-status-tracker {
          background: var(--ct-bg-surface);
          border: 1px solid var(--ct-card-border);
          border-radius: 16px;
          padding: 20px;
          box-shadow: var(--ct-card-shadow);
        }

        .order-status-tracker.compact {
          padding: 16px;
        }

        .tracker-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 20px;
        }

        .compact .tracker-header {
          margin-bottom: 16px;
        }

        .tracker-title {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .order-id {
          font-weight: 600;
          font-size: 14px;
          color: var(--theme-accent, var(--color-accent));
        }

        .order-time {
          font-size: 12px;
          color: var(--color-text-muted);
        }

        .shortcode-badge {
          background: var(--theme-button, var(--color-primary));
          color: white;
          padding: 6px 12px;
          border-radius: 20px;
          font-weight: 700;
          font-size: 14px;
        }

        /* Status Steps */
        .status-steps {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 20px;
        }

        .compact .status-steps {
          margin-bottom: 16px;
        }

        .status-step {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 6px;
          opacity: 0.4;
          transition: opacity 0.3s;
        }

        .status-step.active {
          opacity: 1;
        }

        .status-step.completed .step-icon {
          background: var(--theme-button, var(--color-primary));
        }

        .step-icon {
          width: 44px;
          height: 44px;
          border-radius: 50%;
          background: var(--color-bg-warm);
          border: 1px solid var(--color-border);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 20px;
          transition: background 0.3s;
        }

        .compact .step-icon {
          width: 36px;
          height: 36px;
          font-size: 16px;
        }

        .step-label {
          font-size: 12px;
          font-weight: 500;
          color: var(--color-text);
        }

        .compact .step-label {
          font-size: 11px;
        }

        .step-line {
          flex: 1;
          height: 2px;
          background: var(--color-border);
          margin: 0 8px;
          margin-bottom: 20px;
        }

        .compact .step-line {
          margin-bottom: 16px;
        }

        /* Status Message */
        .status-message {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          padding: 16px;
          border-radius: 12px;
          background: var(--ct-bg-surface-warm);
          border: 1px solid var(--ct-card-border);
          margin-bottom: 16px;
        }

        .compact .status-message {
          padding: 12px;
          margin-bottom: 0;
        }

        .status-message.status-ready {
          background: rgba(16, 185, 129, 0.12);
          border-color: rgba(16, 185, 129, 0.3);
        }

        .status-emoji {
          font-size: 24px;
        }

        .compact .status-emoji {
          font-size: 20px;
        }

        .status-text {
          font-weight: 600;
          font-size: 16px;
        }

        .compact .status-text {
          font-size: 14px;
        }

        .estimated-time {
          color: var(--color-text-muted);
          font-size: 14px;
        }

        /* Ready Shortcode */
        .ready-shortcode {
          text-align: center;
          padding: 20px;
          background: rgba(16, 185, 129, 0.12);
          border: 1px solid rgba(16, 185, 129, 0.28);
          border-radius: 12px;
          margin-bottom: 16px;
        }

        .shortcode-label {
          font-size: 12px;
          color: var(--color-text-muted);
          margin-bottom: 8px;
          text-transform: uppercase;
          letter-spacing: 1px;
        }

        .shortcode-value {
          font-size: 32px;
          font-weight: 800;
          color: var(--color-success);
        }

        /* Completed CTA */
        .completed-cta {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 16px;
          margin-bottom: 16px;
          padding-top: 16px;
          border-top: 1px solid var(--ct-card-border);
        }

        .compact .completed-cta {
          margin-bottom: 0;
          padding-top: 12px;
        }

        .cta-feedback {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
        }

        .cta-label {
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.4px;
          color: var(--color-text-muted);
        }

        .cta-feedback-thanks {
          font-size: 14px;
          color: var(--color-text);
          margin: 0;
        }

        .cta-thumbs {
          display: flex;
          gap: 12px;
        }

        .cta-thumb {
          width: 44px;
          height: 44px;
          display: flex;
          align-items: center;
          justify-content: center;
          border: 1px solid var(--ct-card-border);
          background: var(--ct-bg-surface-warm);
          border-radius: 12px;
          font-size: 20px;
          cursor: pointer;
          transition: background 0.2s, border-color 0.2s;
        }

        .cta-thumb:hover {
          background: rgba(232, 93, 4, 0.08);
          border-color: rgba(232, 93, 4, 0.25);
        }

        .cta-actions {
          display: flex;
          flex-direction: row;
          flex-wrap: wrap;
          justify-content: center;
          gap: 20px;
          align-items: flex-start;
        }

        @media (max-width: 640px) {
          .cta-actions {
            flex-direction: column;
            align-items: center;
            gap: 16px;
          }
        }

        .cta-action-item {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 4px;
          min-width: 0;
        }

        .cta-link {
          font-size: 14px;
          font-weight: 500;
          text-decoration: none;
          transition: opacity 0.2s;
        }

        .cta-link:hover {
          opacity: 0.85;
        }

        .cta-link-review {
          color: var(--theme-button, var(--color-primary));
        }

        .cta-link-contact {
          color: var(--theme-accent, var(--color-accent));
        }

        .cta-muted {
          font-size: 14px;
          color: var(--color-text-muted);
        }

        /* Items Summary */
        .items-summary {
          border-top: 1px solid var(--ct-card-border);
          padding-top: 16px;
        }

        .item-row {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 0;
          font-size: 14px;
        }

        .item-qty {
          color: var(--theme-accent, var(--color-accent));
          font-weight: 600;
          min-width: 28px;
        }

        .item-name {
          flex: 1;
          color: var(--color-text);
        }

        .item-price {
          color: var(--color-text-muted);
        }

        .items-more {
          font-size: 13px;
          color: var(--color-text-muted);
          padding: 8px 0;
        }

        .items-total {
          display: flex;
          justify-content: space-between;
          padding-top: 12px;
          margin-top: 8px;
          border-top: 1px solid var(--ct-card-border);
          font-size: 15px;
        }

        .items-total strong {
          color: var(--theme-accent, var(--color-accent));
        }
      `}</style>
    </div>
  );
}
