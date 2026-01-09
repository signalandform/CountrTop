# CountrTop Vendor Onboarding Guide

Welcome to CountrTop! This guide will help you set up your restaurant on our platform.

## Table of Contents

1. [Getting Started](#getting-started)
2. [Connecting Your POS System](#connecting-your-pos-system)
3. [Setting Up Your Storefront](#setting-up-your-storefront)
4. [Configuring Your KDS](#configuring-your-kds)
5. [Customizing Your Brand](#customizing-your-brand)
6. [Managing Locations](#managing-locations)
7. [Team Management](#team-management)
8. [Going Live](#going-live)

---

## Getting Started

### What You'll Need

- An active POS system (Square, Toast, or Clover)
- A business email address
- Your restaurant's logo (recommended: 500x500px PNG)
- Your brand colors (hex codes)

### Account Setup

1. Contact CountrTop ops team to create your vendor account
2. You'll receive a login link via email
3. Sign in at `admin.countrtop.com`

---

## Connecting Your POS System

CountrTop integrates with major POS systems to automatically sync your menu and orders.

### Square

1. Go to **Settings** in your vendor admin dashboard
2. Click **Connect Square**
3. Authorize CountrTop to access your Square account
4. Select which location(s) to connect

**Required Square Permissions:**
- Read catalog
- Read orders
- Read locations
- Create payment links

### Toast

1. Contact your Toast rep to enable the CountrTop integration
2. They will provide you with:
   - Restaurant GUID
   - API credentials
3. Enter these in your CountrTop settings

### Clover

1. Install the CountrTop app from the Clover App Market
2. Authorize the connection
3. Your menu will sync automatically

---

## Setting Up Your Storefront

Your customers will order from `yourname.countrtop.com`

### Menu Configuration

Your menu is automatically synced from your POS system. To make changes:

1. Update items in your POS (Square/Toast/Clover)
2. Changes sync to CountrTop within 5 minutes
3. Hidden items in your POS won't appear on your storefront

### Online Ordering Settings

Each location has its own online ordering settings in **Locations > [Location Name]**:

- **Enable/Disable ordering** - Turn online ordering on/off per location
- **Lead time** - Minimum minutes before pickup (default: 15 min)
- **Operating hours** - Set when orders can be placed (JSON configuration)

---

## Configuring Your KDS

The Kitchen Display System (KDS) shows incoming orders in real-time.

### Accessing KDS

1. Navigate to `kds.countrtop.com`
2. Sign in with your vendor admin credentials
3. Select your location (if multi-location)
4. Enter your location PIN

### KDS Settings

Per-location settings in **Locations > [Location Name]**:

- **Active ticket limit** - Max tickets shown in queue (prevents overwhelm)
- **CountrTop order limit** - Max CountrTop orders in queue
- **Auto-bump time** - Auto-complete ready orders after X minutes (optional)
- **Sound alerts** - Play sound for new orders (on/off)
- **Display mode** - Grid or list view

### KDS Workflow

1. **New Order** → Ticket appears with "Start" button
2. **Start** → Marks ticket as "Preparing" (🔥 Cooking badge)
3. **Ready** → Customer gets notified, ticket shows "Complete" button
4. **Complete** → Ticket is archived (can recall within 24h)

### Ticket Features

- **Hold** (⏸️) - Pause a ticket (waiting for customer, etc.)
- **Notes** (📝) - Add staff notes visible on ticket
- **Rename** - Custom label (e.g., "Table 5", "John's order")
- **Reorder** - Move ticket up/down in queue

---

## Customizing Your Brand

Make your storefront match your restaurant's brand!

### Theme Settings

In **Settings > Branding & Theming**:

| Setting | Description | Recommendation |
|---------|-------------|----------------|
| **Logo URL** | Your restaurant logo | 500x500px PNG |
| **Button Color** | Primary CTA buttons | Your brand's main color |
| **Accent Color** | Links, highlights | Complementary color |
| **Font** | Display font | Choose from 10+ options |

### Font Options

- SF Pro Display (default)
- Inter
- Poppins
- Montserrat
- Playfair Display
- Roboto
- And more...

### Preview

Changes preview in real-time in the Settings panel before you save.

---

## Managing Locations

If you have multiple locations:

### Adding a Location

1. Go to **Settings > Locations**
2. Click **Add Location**
3. Enter:
   - Location name
   - Address
   - Phone
   - Pickup instructions
   - POS location ID (from Square/Toast/Clover)

### Location Settings

Each location can have:

- **Online ordering enabled/disabled**
- **Custom pickup instructions**
- **Separate KDS PIN**
- **Independent queue limits**

### Primary Location

Your primary location is the default for customers. To change:

1. Go to **Locations**
2. Click "Set as Primary" on desired location

---

## Team Management

### Adding Team Members

1. Go to **Settings > Team**
2. Click **Invite Member**
3. Enter their email
4. Select role:
   - **Admin** - Full access
   - **Manager** - Most settings, no billing
   - **Staff** - KDS access only

### KDS PINs

For quick KDS clock-in/out:

1. Go to **Settings > KDS Location PINs**
2. Assign 3-digit PINs to staff
3. Staff use PIN to clock in at KDS

---

## Going Live

### Pre-Launch Checklist

- [ ] Menu synced correctly from POS
- [ ] Brand colors and logo configured
- [ ] Pickup instructions set
- [ ] KDS tested with test orders
- [ ] Team members invited
- [ ] Operating hours configured

### Test Order

1. Open your storefront: `yourname.countrtop.com`
2. Add items to cart
3. Complete checkout (use test card in Square sandbox)
4. Verify order appears in KDS
5. Process through the workflow

### Launch!

Once everything is tested:

1. Enable live payments in your POS
2. Share your ordering link: `yourname.countrtop.com`
3. Monitor orders in KDS

---

## Getting Help

### Support

- **Email**: support@countrtop.com
- **Dashboard**: Use the chat widget in vendor admin

### Common Issues

| Issue | Solution |
|-------|----------|
| Menu not syncing | Check POS connection in Settings |
| Orders not appearing | Verify location ID matches POS |
| Email not received | Check spam folder |
| KDS won't load | Clear browser cache, try incognito |

### FAQs

**Q: How quickly do orders appear in KDS?**
A: Instantly! We use real-time updates.

**Q: Can I customize the order confirmation email?**
A: Not yet, but it uses your branding automatically.

**Q: What happens if internet goes down?**
A: KDS has offline mode - orders queue and sync when back online.

**Q: Can customers track their orders?**
A: Yes! They get real-time status updates and an email when ready.

---

## Next Steps

1. Complete the [Pre-Launch Checklist](#pre-launch-checklist)
2. Run a few test orders
3. Train your staff on the KDS
4. Go live and start accepting orders!

Welcome to CountrTop! 🎉
