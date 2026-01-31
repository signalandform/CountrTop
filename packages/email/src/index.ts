import { Resend } from 'resend';

// Initialize Resend client
const resend = new Resend(process.env.RESEND_API_KEY);

// Email types
export type OrderConfirmationData = {
  customerEmail: string;
  customerName: string;
  vendorName: string;
  orderId: string;
  shortcode: string;
  items: Array<{
    name: string;
    quantity: number;
    price: number;
  }>;
  total: number;
  currency: string;
  pickupInstructions?: string;
  estimatedWaitMinutes?: number;
};

export type OrderReadyData = {
  customerEmail: string;
  customerName: string;
  vendorName: string;
  shortcode: string;
  pickupInstructions?: string;
};

export type OrderStatusUpdateData = {
  customerEmail: string;
  customerName: string;
  vendorName: string;
  shortcode: string;
  status: 'preparing' | 'ready' | 'completed';
};

// Format currency
const formatCurrency = (cents: number, currency: string) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100);

// Brand colors aligned with @countrtop/ui theme (theme.css / theme.ts)
const EMAIL = {
  primary: '#E85D04',
  primaryLight: '#FF7B2E',
  accent: '#FFB627',
  success: '#10B981',
  bg: '#FEFDFB',
  bgWarm: '#FFF8F0',
  cardBg: '#ffffff',
  text: '#1A1A2E',
  textMuted: '#64748B',
  border: 'rgba(26, 26, 46, 0.12)',
  fontBody: "'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  fontDisplay: "'Anybody', 'DM Sans', system-ui, sans-serif",
  radius: '16px',
  radiusSm: '12px'
} as const;

// Email templates
const orderConfirmationHtml = (data: OrderConfirmationData) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Order Confirmation</title>
</head>
<body style="margin: 0; padding: 0; background-color: ${EMAIL.bgWarm}; font-family: ${EMAIL.fontBody};">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: ${EMAIL.bgWarm}; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background: ${EMAIL.cardBg}; border: 1px solid ${EMAIL.border}; border-radius: ${EMAIL.radius}; overflow: hidden; box-shadow: 0 10px 30px rgba(15, 15, 26, 0.08);">
          <!-- Header -->
          <tr>
            <td style="padding: 40px 40px 20px; text-align: center;">
              <h1 style="margin: 0; color: ${EMAIL.primary}; font-family: ${EMAIL.fontDisplay}; font-size: 28px; font-weight: 700;">Order Confirmed! ✓</h1>
              <p style="margin: 10px 0 0; color: ${EMAIL.textMuted}; font-size: 16px;">${data.vendorName}</p>
            </td>
          </tr>
          
          <!-- Shortcode -->
          <tr>
            <td style="padding: 20px 40px; text-align: center;">
              <div style="background: rgba(232, 93, 4, 0.08); border: 2px solid ${EMAIL.primary}; border-radius: ${EMAIL.radiusSm}; padding: 20px; display: inline-block;">
                <p style="margin: 0 0 8px; color: ${EMAIL.textMuted}; font-size: 14px; text-transform: uppercase; letter-spacing: 1px;">Your Pickup Code</p>
                <p style="margin: 0; color: ${EMAIL.primary}; font-family: ${EMAIL.fontDisplay}; font-size: 48px; font-weight: 800; letter-spacing: 4px;">${data.shortcode}</p>
              </div>
            </td>
          </tr>
          
          <!-- Estimated Time -->
          ${data.estimatedWaitMinutes ? `
          <tr>
            <td style="padding: 10px 40px; text-align: center;">
              <p style="margin: 0; color: ${EMAIL.text}; font-size: 18px;">
                ⏱️ Estimated wait: <strong>${data.estimatedWaitMinutes} minutes</strong>
              </p>
            </td>
          </tr>
          ` : ''}
          
          <!-- Order Items -->
          <tr>
            <td style="padding: 30px 40px;">
              <h2 style="margin: 0 0 16px; color: ${EMAIL.text}; font-family: ${EMAIL.fontDisplay}; font-size: 18px; font-weight: 600;">Order Summary</h2>
              <table width="100%" cellpadding="0" cellspacing="0">
                ${data.items.map(item => `
                <tr>
                  <td style="padding: 12px 0; border-bottom: 1px solid ${EMAIL.border};">
                    <span style="color: ${EMAIL.primary}; font-weight: 700;">${item.quantity}×</span>
                    <span style="color: ${EMAIL.text}; margin-left: 8px;">${item.name}</span>
                  </td>
                  <td style="padding: 12px 0; border-bottom: 1px solid ${EMAIL.border}; text-align: right; color: ${EMAIL.text};">
                    ${formatCurrency(item.price * item.quantity, data.currency)}
                  </td>
                </tr>
                `).join('')}
                <tr>
                  <td style="padding: 16px 0 0; color: ${EMAIL.text}; font-weight: 700; font-size: 18px;">Total</td>
                  <td style="padding: 16px 0 0; text-align: right; color: ${EMAIL.primary}; font-weight: 700; font-size: 18px;">
                    ${formatCurrency(data.total, data.currency)}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          
          <!-- Pickup Instructions -->
          ${data.pickupInstructions ? `
          <tr>
            <td style="padding: 0 40px 30px;">
              <div style="background: rgba(16, 185, 129, 0.08); border: 1px solid rgba(16, 185, 129, 0.25); border-radius: ${EMAIL.radiusSm}; padding: 16px;">
                <p style="margin: 0 0 8px; color: ${EMAIL.success}; font-weight: 600; font-size: 14px;">📍 Pickup Instructions</p>
                <p style="margin: 0; color: ${EMAIL.text}; font-size: 14px;">${data.pickupInstructions}</p>
              </div>
            </td>
          </tr>
          ` : ''}
          
          <!-- Footer -->
          <tr>
            <td style="padding: 30px 40px; background: ${EMAIL.bgWarm}; text-align: center; border-top: 1px solid ${EMAIL.border};">
              <p style="margin: 0; color: ${EMAIL.textMuted}; font-size: 12px;">
                Order ID: ${data.orderId}<br>
                Powered by CountrTop
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;

const orderReadyHtml = (data: OrderReadyData) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your Order is Ready!</title>
</head>
<body style="margin: 0; padding: 0; background-color: ${EMAIL.bgWarm}; font-family: ${EMAIL.fontBody};">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: ${EMAIL.bgWarm}; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background: ${EMAIL.cardBg}; border: 1px solid ${EMAIL.border}; border-radius: ${EMAIL.radius}; overflow: hidden; box-shadow: 0 10px 30px rgba(15, 15, 26, 0.08);">
          <!-- Header -->
          <tr>
            <td style="padding: 40px 40px 20px; text-align: center;">
              <h1 style="margin: 0; color: ${EMAIL.success}; font-family: ${EMAIL.fontDisplay}; font-size: 32px; font-weight: 700;">🎉 Your Order is Ready!</h1>
              <p style="margin: 10px 0 0; color: ${EMAIL.textMuted}; font-size: 16px;">${data.vendorName}</p>
            </td>
          </tr>
          
          <!-- Shortcode -->
          <tr>
            <td style="padding: 30px 40px; text-align: center;">
              <div style="background: rgba(16, 185, 129, 0.1); border: 3px solid ${EMAIL.success}; border-radius: ${EMAIL.radius}; padding: 30px; display: inline-block;">
                <p style="margin: 0 0 8px; color: ${EMAIL.success}; font-size: 14px; text-transform: uppercase; letter-spacing: 1px;">Show this code</p>
                <p style="margin: 0; color: ${EMAIL.success}; font-family: ${EMAIL.fontDisplay}; font-size: 56px; font-weight: 800; letter-spacing: 6px;">${data.shortcode}</p>
              </div>
            </td>
          </tr>
          
          <!-- Message -->
          <tr>
            <td style="padding: 20px 40px; text-align: center;">
              <p style="margin: 0; color: ${EMAIL.text}; font-size: 20px;">
                Hi ${data.customerName}, your order is waiting for you!
              </p>
            </td>
          </tr>
          
          <!-- Pickup Instructions -->
          ${data.pickupInstructions ? `
          <tr>
            <td style="padding: 20px 40px 30px;">
              <div style="background: rgba(232, 93, 4, 0.06); border: 1px solid rgba(232, 93, 4, 0.2); border-radius: ${EMAIL.radiusSm}; padding: 16px; text-align: center;">
                <p style="margin: 0; color: ${EMAIL.text}; font-size: 14px;">📍 ${data.pickupInstructions}</p>
              </div>
            </td>
          </tr>
          ` : ''}
          
          <!-- Footer -->
          <tr>
            <td style="padding: 30px 40px; background: ${EMAIL.bgWarm}; text-align: center; border-top: 1px solid ${EMAIL.border};">
              <p style="margin: 0; color: ${EMAIL.textMuted}; font-size: 12px;">
                Powered by CountrTop
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;

// Send functions
export async function sendOrderConfirmation(data: OrderConfirmationData): Promise<{ success: boolean; error?: string }> {
  if (!process.env.RESEND_API_KEY) {
    console.warn('RESEND_API_KEY not configured, skipping email');
    return { success: true };
  }

  try {
    const { error } = await resend.emails.send({
      from: `${data.vendorName} <orders@countrtop.com>`,
      to: data.customerEmail,
      subject: `Order Confirmed - ${data.vendorName} #${data.shortcode}`,
      html: orderConfirmationHtml(data),
    });

    if (error) {
      console.error('Failed to send order confirmation email:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Email send error:', message);
    return { success: false, error: message };
  }
}

export async function sendOrderReady(data: OrderReadyData): Promise<{ success: boolean; error?: string }> {
  if (!process.env.RESEND_API_KEY) {
    console.warn('RESEND_API_KEY not configured, skipping email');
    return { success: true };
  }

  try {
    const { error } = await resend.emails.send({
      from: `${data.vendorName} <orders@countrtop.com>`,
      to: data.customerEmail,
      subject: `🎉 Your order is ready! - ${data.vendorName}`,
      html: orderReadyHtml(data),
    });

    if (error) {
      console.error('Failed to send order ready email:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Email send error:', message);
    return { success: false, error: message };
  }
}

// Promotional email (CRM)
const BATCH_SIZE = 100;

export type PromotionalEmailParams = {
  fromName: string;
  to: string[];
  subject: string;
  html: string;
  /** Base URL for unsubscribe (e.g. https://vendor.countrtop.com/api/vendors/vendor/unsubscribe). Email param is appended per recipient. */
  unsubscribeBaseUrl?: string;
};

function promotionalEmailHtml(html: string, unsubscribeUrl?: string): string {
  if (!unsubscribeUrl) return html;
  const footer = `
<div style="margin-top: 32px; padding-top: 16px; border-top: 1px solid ${EMAIL.border}; text-align: center;">
  <p style="margin: 0; color: ${EMAIL.textMuted}; font-size: 12px;">
    <a href="${unsubscribeUrl}" style="color: ${EMAIL.textMuted};">Unsubscribe</a> from promotional emails from this business.
  </p>
</div>`;
  return html + footer;
}

export async function sendPromotionalEmail(params: PromotionalEmailParams): Promise<{
  success: boolean;
  sentCount?: number;
  error?: string;
}> {
  if (!process.env.RESEND_API_KEY) {
    console.warn('RESEND_API_KEY not configured, skipping promotional email');
    return { success: true, sentCount: 0 };
  }

  const { fromName, to, subject, html, unsubscribeBaseUrl } = params;
  const recipients = [...new Set(to.map((e) => e.trim().toLowerCase()).filter(Boolean))];
  if (recipients.length === 0) {
    return { success: true, sentCount: 0 };
  }

  const from = `${fromName} <orders@countrtop.com>`;
  let sentCount = 0;

  try {
    if (unsubscribeBaseUrl) {
      for (const email of recipients) {
        const unsubscribeUrl = `${unsubscribeBaseUrl}${unsubscribeBaseUrl.includes('?') ? '&' : '?'}email=${encodeURIComponent(email)}`;
        const fullHtml = promotionalEmailHtml(html, unsubscribeUrl);
        const { error } = await resend.emails.send({
          from,
          to: email,
          subject,
          html: fullHtml,
        });
        if (error) {
          console.error('Failed to send promotional email:', error);
          return { success: false, sentCount, error: error.message };
        }
        sentCount += 1;
      }
    } else {
      const fullHtml = promotionalEmailHtml(html);
      for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
        const chunk = recipients.slice(i, i + BATCH_SIZE);
        const { error } = await resend.emails.send({
          from,
          to: chunk,
          subject,
          html: fullHtml,
        });
        if (error) {
          console.error('Failed to send promotional email batch:', error);
          return { success: false, sentCount, error: error.message };
        }
        sentCount += chunk.length;
      }
    }
    return { success: true, sentCount };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Promotional email send error:', message);
    return { success: false, sentCount, error: message };
  }
}

// Re-export for convenience
export { Resend };
