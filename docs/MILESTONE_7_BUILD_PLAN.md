# Milestone 7: Supabase Realtime Subscriptions — Build Plan

## Goal
Replace the 30-second polling mechanism in KDS with Supabase Realtime subscriptions to `kitchen_tickets`, enabling instant updates when tickets are created, updated, or deleted.

## Current State
- KDS queue uses `setInterval` to poll `/api/vendors/[slug]/tickets` every 30 seconds
- RLS policies are enabled for `kitchen_tickets` and `square_orders`
- Offline support exists (localStorage cache + queue)
- Data is fetched via REST API endpoint

## Target State
- KDS queue subscribes to `kitchen_tickets` changes via Supabase Realtime
- Real-time updates when tickets are inserted, updated, or deleted
- Graceful fallback to polling when realtime fails
- Maintain existing offline support
- Initial load still uses REST API for full dataset

---

## Implementation Steps

### Step 1: Enable Realtime Publication (Database Migration)

**File:** `supabase/migrations/YYYYMMDDHHMMSS_enable_realtime_for_kds_tables.sql`

**Tasks:**
1. Add `kitchen_tickets` to `supabase_realtime` publication
2. Add `square_orders` to `supabase_realtime` publication (for completeness, though we may not subscribe directly)
3. Verify tables are eligible for realtime (RLS enabled ✅)

**SQL:**
```sql
-- Enable realtime for kitchen_tickets
alter publication supabase_realtime add table public.kitchen_tickets;

-- Enable realtime for square_orders (for potential future use)
alter publication supabase_realtime add table public.square_orders;
```

**Verification:**
- Run migration via Supabase MCP
- Verify tables appear in Supabase Dashboard → Database → Publications → supabase_realtime

---

### Step 2: Create Realtime Hook Module

**File:** `apps/kds-web/lib/realtime.ts` (new file)

**Purpose:** Encapsulate realtime subscription logic with proper cleanup and error handling.

**Tasks:**
1. Create `useKitchenTicketsSubscription` hook or subscription manager
2. Handle subscription lifecycle (subscribe/unsubscribe)
3. Handle connection state (connected/disconnected/error)
4. Map realtime payloads to ticket data structures
5. Handle errors gracefully (fallback to polling)

**Key Functions:**
- `createTicketsSubscription(locationId, callback)` - Creates and manages subscription
- `subscribeToTickets(locationId, onInsert, onUpdate, onDelete)` - Main subscription function
- Handle `INSERT`, `UPDATE`, `DELETE` events
- Filter by `location_id` using Supabase filter syntax: `filter: 'location_id=eq.{locationId}'`

**Considerations:**
- Subscription needs to fetch full ticket + order data on INSERT/UPDATE (realtime only sends changed row)
- For UPDATE events, we may need to refetch from API if order data changed
- Handle subscription errors (network issues, auth failures)
- Cleanup subscriptions on unmount

---

### Step 3: Integrate Realtime into KDS Queue UI

**File:** `apps/kds-web/pages/vendors/[slug].tsx`

**Changes:**
1. Replace `setInterval` polling with realtime subscription
2. Keep initial REST API call for full dataset
3. Update state when realtime events arrive:
   - `INSERT` → Add ticket to state (fetch full data if needed)
   - `UPDATE` → Update ticket in state (may need to refetch order data)
   - `DELETE` → Remove ticket from state
4. Maintain fallback polling mechanism (if realtime fails)
5. Show connection status indicator (realtime connected/disconnected)

**State Management:**
- Track subscription state: `subscribed`, `connecting`, `error`
- When INSERT/UPDATE event arrives:
  - Check if we need to fetch full ticket+order data from API
  - Update local state optimistically
  - Optionally refetch full dataset if complex change
- When DELETE event arrives:
  - Remove ticket from local state

**Fallback Strategy:**
- If subscription fails to establish: fall back to polling
- If subscription disconnects: attempt to reconnect, fall back to polling after N failures
- Keep polling interval as backup (e.g., 60 seconds instead of 30)

---

### Step 4: Handle Full Data Fetching on Realtime Events

**Challenge:** Realtime payloads only include the changed row (e.g., `kitchen_tickets` row), but we need the joined `square_orders` data.

**Solution Options:**
1. **Option A (Recommended):** On INSERT/UPDATE, refetch full ticket via API
   - Pros: Guaranteed fresh data, includes order details
   - Cons: Extra API call per event
   - Use existing `/api/vendors/[slug]/tickets` endpoint (filter by ticket ID) or create single-ticket endpoint

2. **Option B:** Subscribe to both tables and merge client-side
   - Pros: No extra API calls
   - Cons: Complex state management, may miss data if events arrive out of order

3. **Option C:** Optimistic update + background refetch
   - Pros: Fast UI update, eventually consistent
   - Cons: Temporary inconsistency possible

**Implementation (Option A):**
- Create helper: `fetchTicketById(ticketId)` that calls API
- On INSERT event: fetch full ticket data, add to state
- On UPDATE event: fetch full ticket data, update state
- On DELETE event: remove from state (no fetch needed)

**New API Route (Optional):**
- `GET /api/vendors/[slug]/tickets/[ticketId]` - Fetch single ticket with order data
- Or extend existing endpoint to accept `?ticketId=...` filter

---

### Step 5: Update Supabase Client Configuration

**File:** `apps/kds-web/lib/supabaseBrowser.ts`

**Tasks:**
1. Ensure realtime features are enabled (default in `@supabase/supabase-js`)
2. No changes needed (realtime is enabled by default)

**Verification:**
- Confirm client supports `.channel()` and `.on('postgres_changes', ...)`

---

### Step 6: Testing & Error Handling

**Test Scenarios:**
1. **Happy Path:**
   - Open KDS → subscription connects
   - Create new order → ticket appears instantly
   - Update ticket status → UI updates instantly
   - Complete ticket → ticket disappears instantly

2. **Connection Issues:**
   - Network disconnect → subscription disconnects → fallback to polling
   - Network reconnect → subscription reconnects → resume realtime
   - Auth token expires → subscription fails → fallback to polling

3. **Edge Cases:**
   - Multiple tabs open → each has own subscription
   - Browser refresh → subscription re-establishes
   - Offline mode → realtime fails → use cached data + offline queue

**Error Handling:**
- Log subscription errors to console (for debugging)
- Show user-friendly connection status
- Automatically retry subscription on failure (max N retries)
- Fall back to polling after repeated failures

---

### Step 7: UI Enhancements (Optional)

**Connection Status Indicator:**
- Add "Realtime" badge when connected
- Add "Polling" badge when using fallback
- Add "Offline" indicator (existing)
- Subtle visual feedback (no intrusive UI changes)

---

## Files to Create/Modify

### New Files:
1. `supabase/migrations/YYYYMMDDHHMMSS_enable_realtime_for_kds_tables.sql`
2. `apps/kds-web/lib/realtime.ts` (realtime subscription helper)

### Modified Files:
1. `apps/kds-web/pages/vendors/[slug].tsx` (integrate realtime subscription)
2. `apps/kds-web/pages/api/vendors/[slug]/tickets/[ticketId].ts` (optional: single ticket endpoint)

---

## Implementation Details

### Realtime Subscription Filter

```typescript
const channel = supabase
  .channel(`kds-tickets-${locationId}`)
  .on(
    'postgres_changes',
    {
      event: '*', // INSERT, UPDATE, DELETE
      schema: 'public',
      table: 'kitchen_tickets',
      filter: `location_id=eq.${locationId}`, // Only tickets for this location
    },
    (payload) => {
      // Handle event
      handleRealtimeEvent(payload);
    }
  )
  .subscribe();
```

### Event Handler Structure

```typescript
function handleRealtimeEvent(payload: RealtimePostgresChangesPayload) {
  const { eventType, new: newRecord, old: oldRecord } = payload;
  
  switch (eventType) {
    case 'INSERT':
      // Fetch full ticket data from API
      fetchTicketById(newRecord.id).then(ticket => {
        setTickets(prev => [...prev, ticket]);
      });
      break;
      
    case 'UPDATE':
      // Fetch full ticket data from API
      fetchTicketById(newRecord.id).then(ticket => {
        setTickets(prev => prev.map(t => 
          t.ticket.id === ticket.ticket.id ? ticket : t
        ));
      });
      break;
      
    case 'DELETE':
      // Remove from state
      setTickets(prev => prev.filter(t => 
        t.ticket.id !== oldRecord.id
      ));
      break;
  }
}
```

### Fallback Polling Strategy

```typescript
const [useRealtime, setUseRealtime] = useState(true);
const [realtimeErrorCount, setRealtimeErrorCount] = useState(0);
const MAX_REALTIME_ERRORS = 3;

// If realtime fails too many times, switch to polling
if (realtimeErrorCount >= MAX_REALTIME_ERRORS) {
  setUseRealtime(false);
}

// Fallback polling interval (longer than original, since realtime is primary)
useEffect(() => {
  if (!useRealtime) {
    const interval = setInterval(fetchTickets, 60000); // 60s
    return () => clearInterval(interval);
  }
}, [useRealtime]);
```

---

## Acceptance Criteria

✅ **Realtime Subscription Works:**
- KDS queue subscribes to `kitchen_tickets` changes
- Subscription is filtered by `location_id`
- Subscription handles INSERT, UPDATE, DELETE events

✅ **UI Updates in Real-Time:**
- New tickets appear instantly (within 1-2 seconds)
- Status updates (placed → ready → completed) reflect immediately
- Completed tickets disappear from queue instantly

✅ **Fallback Mechanism:**
- If realtime fails, falls back to polling (60s interval)
- Connection status is visible to user
- Errors are logged but don't break the UI

✅ **Offline Support Maintained:**
- Existing offline cache/queue still works
- Realtime gracefully handles offline state
- Offline actions sync when back online

✅ **Performance:**
- No degradation in initial load time
- Reduced server load (no polling every 30s)
- Smooth UI updates without flickering

✅ **Testing:**
- Test with multiple orders in quick succession
- Test with network interruptions
- Test with browser refresh
- Test with multiple tabs

---

## Dependencies

- Supabase Realtime must be enabled for the project (default: ✅)
- Tables must be added to `supabase_realtime` publication (Step 1)
- RLS policies must be in place (✅ already done)
- Client must be authenticated (✅ already done)

---

## Rollout Strategy

1. **Phase 1:** Enable realtime publication (Step 1) - No breaking changes
2. **Phase 2:** Implement realtime subscription alongside polling (both run)
3. **Phase 3:** Make realtime primary, polling as fallback
4. **Phase 4:** Remove polling interval (keep only as emergency fallback)

---

## Notes

- Realtime subscriptions are scoped by RLS policies automatically
- Each vendor admin will only receive events for their location
- Subscription uses WebSocket connection (efficient, low latency)
- Consider connection limits if many vendors use KDS simultaneously
- Monitor realtime connection health in production

---

## Future Enhancements (Out of Scope)

- Subscribe to `square_orders` changes (if needed for order updates)
- Presence tracking (show which staff members are viewing KDS)
- Broadcast messages (vendor-to-staff communications)
- Performance metrics (realtime vs polling latency)

