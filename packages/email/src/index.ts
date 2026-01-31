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

// Email templates
const orderConfirmationHtml = (data: OrderConfirmationData) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Order Confirmation</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0f0f23; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #0f0f23; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); border-radius: 16px; overflow: hidden;">
          <!-- Header -->
          <tr>
            <td style="padding: 40px 40px 20px; text-align: center;">
              <h1 style="margin: 0; color: #667eea; font-size: 28px; font-weight: 700;">Order Confirmed! ✓</h1>
              <p style="margin: 10px 0 0; color: #a0a0a0; font-size: 16px;">${data.vendorName}</p>
            </td>
          </tr>
          
          <!-- Shortcode -->
          <tr>
            <td style="padding: 20px 40px; text-align: center;">
              <div style="background: rgba(102, 126, 234, 0.1); border: 2px solid #667eea; border-radius: 12px; padding: 20px; display: inline-block;">
                <p style="margin: 0 0 8px; color: #a0a0a0; font-size: 14px; text-transform: uppercase; letter-spacing: 1px;">Your Pickup Code</p>
                <p style="margin: 0; color: #667eea; font-size: 48px; font-weight: 800; letter-spacing: 4px;">${data.shortcode}</p>
              </div>
            </td>
          </tr>
          
          <!-- Estimated Time -->
          ${data.estimatedWaitMinutes ? `
          <tr>
            <td style="padding: 10px 40px; text-align: center;">
              <p style="margin: 0; color: #e8e8e8; font-size: 18px;">
                ⏱️ Estimated wait: <strong>${data.estimatedWaitMinutes} minutes</strong>
              </p>
            </td>
          </tr>
          ` : ''}
          
          <!-- Order Items -->
          <tr>
            <td style="padding: 30px 40px;">
              <h2 style="margin: 0 0 16px; color: #e8e8e8; font-size: 18px; font-weight: 600;">Order Summary</h2>
              <table width="100%" cellpadding="0" cellspacing="0">
                ${data.items.map(item => `
                <tr>
                  <td style="padding: 12px 0; border-bottom: 1px solid rgba(255,255,255,0.1);">
                    <span style="color: #a78bfa; font-weight: 700;">${item.quantity}×</span>
                    <span style="color: #e8e8e8; margin-left: 8px;">${item.name}</span>
                  </td>
                  <td style="padding: 12px 0; border-bottom: 1px solid rgba(255,255,255,0.1); text-align: right; color: #e8e8e8;">
                    ${formatCurrency(item.price * item.quantity, data.currency)}
                  </td>
                </tr>
                `).join('')}
                <tr>
                  <td style="padding: 16px 0 0; color: #e8e8e8; font-weight: 700; font-size: 18px;">Total</td>
                  <td style="padding: 16px 0 0; text-align: right; color: #667eea; font-weight: 700; font-size: 18px;">
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
              <div style="background: rgba(52, 199, 89, 0.1); border: 1px solid rgba(52, 199, 89, 0.3); border-radius: 8px; padding: 16px;">
                <p style="margin: 0 0 8px; color: #34c759; font-weight: 600; font-size: 14px;">📍 Pickup Instructions</p>
                <p style="margin: 0; color: #e8e8e8; font-size: 14px;">${data.pickupInstructions}</p>
              </div>
            </td>
          </tr>
          ` : ''}
          
          <!-- Footer -->
          <tr>
            <td style="padding: 30px 40px; background: rgba(0,0,0,0.2); text-align: center;">
              <p style="margin: 0; color: #666; font-size: 12px;">
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
<body style="margin: 0; padding: 0; background-color: #0f0f23; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #0f0f23; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); border-radius: 16px; overflow: hidden;">
          <!-- Header -->
          <tr>
            <td style="padding: 40px 40px 20px; text-align: center;">
              <h1 style="margin: 0; color: #34c759; font-size: 32px; font-weight: 700;">🎉 Your Order is Ready!</h1>
              <p style="margin: 10px 0 0; color: #a0a0a0; font-size: 16px;">${data.vendorName}</p>
            </td>
          </tr>
          
          <!-- Shortcode -->
          <tr>
            <td style="padding: 30px 40px; text-align: center;">
              <div style="background: rgba(52, 199, 89, 0.15); border: 3px solid #34c759; border-radius: 16px; padding: 30px; display: inline-block;">
                <p style="margin: 0 0 8px; color: #34c759; font-size: 14px; text-transform: uppercase; letter-spacing: 1px;">Show this code</p>
                <p style="margin: 0; color: #34c759; font-size: 56px; font-weight: 800; letter-spacing: 6px;">${data.shortcode}</p>
              </div>
            </td>
          </tr>
          
          <!-- Message -->
          <tr>
            <td style="padding: 20px 40px; text-align: center;">
              <p style="margin: 0; color: #e8e8e8; font-size: 20px;">
                Hi ${data.customerName}, your order is waiting for you!
              </p>
            </td>
          </tr>
          
          <!-- Pickup Instructions -->
          ${data.pickupInstructions ? `
          <tr>
            <td style="padding: 20px 40px 30px;">
              <div style="background: rgba(102, 126, 234, 0.1); border: 1px solid rgba(102, 126, 234, 0.3); border-radius: 8px; padding: 16px; text-align: center;">
                <p style="margin: 0; color: #e8e8e8; font-size: 14px;">📍 ${data.pickupInstructions}</p>
              </div>
            </td>
          </tr>
          ` : ''}
          
          <!-- Footer -->
          <tr>
            <td style="padding: 30px 40px; background: rgba(0,0,0,0.2); text-align: center;">
              <p style="margin: 0; color: #666; font-size: 12px;">
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

/** Promotional email payload (CRM send). */
export type PromotionalEmailData = {
  fromName: string;
  to: string[];
  subject: string;
  html: string;
  unsubscribeBaseUrl?: string;
};

/** Send promotional email to a list of addresses. Returns sentCount on success. */
export async function sendPromotionalEmail(data: PromotionalEmailData): Promise<{
  success: boolean;
  error?: string;
  sentCount?: number;
}> {
  if (!process.env.RESEND_API_KEY) {
    console.warn('RESEND_API_KEY not configured, skipping promotional email');
    return { success: true, sentCount: 0 };
  }

  const { fromName, to, subject, html, unsubscribeBaseUrl } = data;
  if (to.length === 0) {
    return { success: true, sentCount: 0 };
  }

  const footer = unsubscribeBaseUrl
    ? `<p style="margin: 20px 0 0; color: #888; font-size: 12px;"><a href="${unsubscribeBaseUrl}" style="color: #888;">Unsubscribe</a></p>`
    : '';
  const fullHtml = html + footer;

  try {
    const { error } = await resend.emails.send({
      from: `${fromName} <orders@countrtop.com>`,
      to,
      subject,
      html: fullHtml,
    });

    if (error) {
      console.error('Failed to send promotional email:', error);
      return { success: false, error: error.message };
    }

    return { success: true, sentCount: to.length };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Promotional email error:', message);
    return { success: false, error: message };
  }
}

// Re-export for convenience
export { Resend };
