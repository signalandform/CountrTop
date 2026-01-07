# Clover POS Integration Setup Guide

This guide walks you through setting up a Clover POS integration with CountrTop for online ordering, KDS, and order tracking.

## Prerequisites

- Active Clover merchant account
- Clover Developer account (for API access)
- CountrTop vendor account with admin access

---

## Step 1: Get Your Clover API Credentials

### 1.1 Access Clover Developer Dashboard

1. Go to [Clover Developer Portal](https://www.clover.com/developers)
2. Sign in with your Clover merchant account
3. Navigate to **Your Apps** → **Create App** (if you haven't already)

### 1.2 Generate API Token

1. In your app settings, go to **API Tokens**
2. Click **Generate Token**
3. Select the following permissions:
   - **Inventory** - Read (for menu/catalog)
   - **Orders** - Read/Write (for order management)
   - **Payments** - Read (for payment status)
   - **Merchants** - Read (for location info)
4. Copy the generated **Access Token** - you'll need this later

### 1.3 Get Your Merchant ID

1. In the Clover dashboard, look at the URL
2. It will look like: `https://www.clover.com/merchants/{MERCHANT_ID}/...`
3. Copy the **Merchant ID** (a 13-character alphanumeric string)

---

## Step 2: Configure CountrTop

### 2.1 Add Clover Location in Vendor Admin

1. Log in to your CountrTop Vendor Admin
2. Go to **Locations** → **Add Location**
3. Fill in the details:
   - **Name**: Your location name (e.g., "Downtown Store")
   - **POS Provider**: Select **Clover**
   - **External Location ID**: Enter your Clover **Merchant ID**
   - Fill in address, phone, timezone, etc.
4. Click **Save**

### 2.2 Provide API Credentials to CountrTop

Contact CountrTop support to configure your API credentials:

```
CLOVER_ACCESS_TOKEN_{MERCHANT_ID}=your_api_token_here
```

Or if you're self-hosting, add to your environment:

```bash
# .env.local or environment variables
CLOVER_ACCESS_TOKEN=your_default_token
# Or per-location:
CLOVER_ACCESS_TOKEN_ABC123XYZ=location_specific_token
```

---

## Step 3: Configure Webhooks (Optional but Recommended)

Webhooks enable real-time order updates from Clover to CountrTop.

### 3.1 Set Up Webhook URL

1. In Clover Developer Dashboard, go to your app
2. Navigate to **Webhooks** settings
3. Add webhook URL: `https://your-domain.countrtop.com/api/webhooks/clover`
4. Select events to subscribe:
   - `O:CREATE` - Order created
   - `O:UPDATE` - Order updated
   - `P:CREATE` - Payment created
   - `P:UPDATE` - Payment updated

### 3.2 Get Webhook Signing Key

1. In webhook settings, copy the **Signing Key**
2. Provide to CountrTop support or add to environment:

```bash
CLOVER_WEBHOOK_SIGNING_KEY=your_signing_key
```

---

## Step 4: Test the Integration

### 4.1 Verify Catalog Sync

1. In CountrTop Vendor Admin, go to your Clover location
2. Click **Sync Catalog**
3. Verify your menu items appear correctly

### 4.2 Test Online Ordering

1. Visit your CountrTop customer web page
2. Select the Clover location
3. Add items to cart and proceed to checkout
4. Complete a test payment
5. Verify the order appears in:
   - Clover POS device
   - CountrTop KDS

### 4.3 Test KDS Updates

1. Create an order from Clover POS
2. Verify it appears in CountrTop KDS
3. Bump the order through stages
4. Verify customer tracking updates

---

## Troubleshooting

### "Invalid API Token" Error

- Verify the token is correctly copied (no extra spaces)
- Check token permissions include required scopes
- Regenerate token if expired

### Orders Not Syncing

- Verify webhook URL is correctly configured
- Check webhook signing key matches
- Review CountrTop logs for webhook errors

### Catalog Items Missing

- Ensure items are not marked as "hidden" in Clover
- Check item availability settings
- Verify API token has Inventory read permission

### Payment Issues

- Clover checkout redirects to Clover's hosted page
- Ensure redirect URL is correctly configured
- Test in Clover sandbox first

---

## API Reference

### Clover API Base URLs

| Environment | URL |
|-------------|-----|
| Production | `https://api.clover.com/v3` |
| Sandbox | `https://sandbox.dev.clover.com/v3` |

### Key Endpoints Used

| Endpoint | Purpose |
|----------|---------|
| `GET /merchants/{mId}/items` | Fetch catalog |
| `POST /merchants/{mId}/orders` | Create order |
| `GET /merchants/{mId}/orders/{orderId}` | Fetch order |
| `GET /merchants/{mId}` | Merchant/location info |

### Webhook Events

| Event Type | Description |
|------------|-------------|
| `O:CREATE` | New order created |
| `O:UPDATE` | Order modified |
| `O:DELETE` | Order deleted |
| `P:CREATE` | Payment initiated |
| `P:UPDATE` | Payment completed/updated |

---

## Support

For integration support:
- **CountrTop Support**: support@countrtop.com
- **Clover Developer Docs**: https://docs.clover.com
- **Clover Developer Support**: https://www.clover.com/developers/contact

---

## Security Notes

- Never commit API tokens to version control
- Use environment variables for all credentials
- Rotate API tokens periodically
- Enable webhook signature verification in production
