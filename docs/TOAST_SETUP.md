# Toast POS Integration Setup Guide

This guide walks you through setting up a Toast POS integration with CountrTop for online ordering, KDS, and order tracking.

## Prerequisites

- Active Toast restaurant account
- Toast Partner API access (requires partner agreement)
- CountrTop vendor account with admin access

---

## Step 1: Get Toast API Credentials

### 1.1 Become a Toast Partner

Toast uses a partner integration model. You'll need:

1. Apply for Toast Partner Program at [pos.toasttab.com/partners](https://pos.toasttab.com/partners)
2. Complete the partner onboarding process
3. Get access to Toast Developer Portal

### 1.2 Create API Client

1. Log in to Toast Developer Portal
2. Navigate to **API Clients** → **Create Client**
3. Configure your client:
   - **Name**: CountrTop Integration
   - **Type**: Machine Client (for server-to-server)
   - **Permissions**: Orders (Read/Write), Menus (Read), Restaurants (Read)
4. Copy the **Client ID** and **Client Secret**

### 1.3 Get Restaurant GUID

1. In Toast Web Portal, look at the URL when viewing a restaurant
2. The URL contains: `/restaurants/{RESTAURANT_GUID}/...`
3. Copy the **Restaurant GUID** (a UUID format string)

---

## Step 2: Configure CountrTop

### 2.1 Add Toast Location in Vendor Admin

1. Log in to your CountrTop Vendor Admin
2. Go to **Locations** → **Add Location**
3. Fill in the details:
   - **Name**: Your restaurant name
   - **POS Provider**: Select **Toast**
   - **External Location ID**: Enter your Toast **Restaurant GUID**
   - Fill in address, phone, timezone, etc.
4. Click **Save**

### 2.2 Provide API Credentials to CountrTop

Contact CountrTop support to configure your API credentials:

```
TOAST_CLIENT_ID=your_client_id
TOAST_CLIENT_SECRET=your_client_secret
```

Or if you're self-hosting, add to your environment:

```bash
# .env.local or environment variables
TOAST_CLIENT_ID=your_default_client_id
TOAST_CLIENT_SECRET=your_default_client_secret

# Or per-location:
TOAST_CLIENT_ID_{RESTAURANT_GUID}=location_specific_id
TOAST_CLIENT_SECRET_{RESTAURANT_GUID}=location_specific_secret
```

---

## Step 3: Configure Webhooks (Recommended)

Webhooks enable real-time order updates from Toast to CountrTop.

### 3.1 Set Up Webhook URL

1. In Toast Developer Portal, go to your API client
2. Navigate to **Webhooks** → **Add Webhook**
3. Configure:
   - **URL**: `https://your-domain.countrtop.com/api/webhooks/toast`
   - **Events**: 
     - `ORDER_CREATED`
     - `ORDER_UPDATED`
     - `ORDER_COMPLETED`
     - `PAYMENT_CREATED`
     - `PAYMENT_UPDATED`

### 3.2 Get Webhook Secret

1. In webhook settings, copy the **Signing Secret**
2. Provide to CountrTop support or add to environment:

```bash
TOAST_WEBHOOK_SECRET=your_webhook_secret
```

---

## Step 4: Test the Integration

### 4.1 Verify Catalog Sync

1. In CountrTop Vendor Admin, go to your Toast location
2. Click **Sync Catalog**
3. Verify your menu items appear correctly
4. Check that modifiers and prices are correct

### 4.2 Test Online Ordering

1. Visit your CountrTop customer web page
2. Select the Toast location
3. Add items to cart and proceed to checkout
4. Complete a test payment
5. Verify the order appears in:
   - Toast POS terminal
   - CountrTop KDS

### 4.3 Test KDS Integration

1. Create an order from Toast POS
2. Verify it appears in CountrTop KDS
3. Bump the order through stages
4. Verify customer tracking updates

---

## Troubleshooting

### "Authentication Failed" Error

- Verify Client ID and Client Secret are correct
- Check that your API client has proper permissions
- Ensure the restaurant GUID matches your account

### Orders Not Syncing

- Verify webhook URL is correctly configured
- Check webhook signing secret matches
- Review CountrTop logs for webhook errors
- Ensure your API client has ORDER permissions

### Menu Items Missing

- Check item visibility settings in Toast
- Verify items are set to "Online Ordering" visibility
- Ensure items are not marked as deleted

### Payment Issues

- Toast handles payments through their own system
- Online orders redirect to Toast's payment page
- Verify your Toast account has online ordering enabled

---

## API Reference

### Toast API Base URLs

| Environment | URL |
|-------------|-----|
| Production | `https://ws-api.toasttab.com` |
| Sandbox | `https://ws-sandbox-api.toasttab.com` |

### Key Endpoints Used

| Endpoint | Purpose |
|----------|---------|
| `POST /authentication/v1/authentication/login` | OAuth token |
| `GET /menus/v2/menus/{guid}/menuItems` | Fetch catalog |
| `POST /orders/v2/orders` | Create order |
| `GET /orders/v2/orders/{guid}` | Fetch order |
| `GET /restaurants/v1/restaurants/{guid}` | Restaurant info |

### Webhook Events

| Event Type | Description |
|------------|-------------|
| `ORDER_CREATED` | New order created |
| `ORDER_UPDATED` | Order modified |
| `ORDER_COMPLETED` | Order fulfilled |
| `PAYMENT_CREATED` | Payment initiated |
| `PAYMENT_UPDATED` | Payment status changed |

---

## Toast-Specific Features

### Order Types

Toast supports various dining options:
- **Dine-In**: Eat in restaurant
- **Take-Out**: Customer pickup
- **Delivery**: Delivery to address
- **Curbside**: Curbside pickup

CountrTop maps these to appropriate pickup instructions in KDS.

### Display Numbers

Toast generates display numbers for orders which appear in:
- KDS ticket header
- Customer order tracking
- Receipt/ticket printouts

### Guest Information

Toast orders can include:
- Customer name (first/last)
- Email address
- Phone number
- Special requests/notes

All customer info is displayed in KDS for easy identification.

---

## Support

For integration support:
- **CountrTop Support**: support@countrtop.com
- **Toast Partner Support**: partners@toasttab.com
- **Toast API Docs**: Available to partners via Developer Portal

---

## Security Notes

- Never commit API credentials to version control
- Use environment variables for all secrets
- Rotate client secrets periodically
- Enable webhook signature verification in production
- Toast uses OAuth 2.0 with automatic token refresh

