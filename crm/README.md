# APEX CRM — client dashboard

A themed, login-protected owner dashboard that turns any client site into a
subscription product. Built once, re-skinned per client. Runs on **seeded demo
data** out of the box; swap to **Supabase** to go live — the UI never changes.

Pilot theme: **VIP Diamond Barber** (black & gold).

---

## What it does

| Module | Value to the client |
|---|---|
| **Overview** | "£/$ value from your website" hero, live traffic, enquiries-by-service, sources, 30-day chart |
| **Bookings** | Pipeline (new → completed), sort/filter, detail drawer, month calendar, in-studio welcome splash |
| **Clients** | Auto-built CRM from bookings — lifetime value, visit history, **rebook radar** ("due for a cut") |
| **Messages** | WhatsApp / Instagram / email log + click tracking |
| **Insights** | Avg booking value, no-show rate, service leaderboard, visitor→booking funnel |
| **Reviews** | Rating summary + one-tap review-request |
| **Settings** | Profile, live pricing, plan ROI, value methodology |

The estimated-value engine mirrors the sales pitch: **each website enquiry =
the lowest total of the services the visitor selected** (a conservative floor of
warm-lead value, not confirmed revenue). It's the number that makes the monthly
fee un-cancelable.

---

## Run the demo locally

```bash
node crm/serve.js
```

Then open http://localhost:4173 and log in with any email.

---

## Re-skin for another client

1. `js/config.js` — business identity, services & **prices** (copy from their booking page), plan price.
2. `css/dashboard.css` — swap the `:root` tokens (colors + fonts) to match their site.
   That's the whole re-theme.

---

## Go live with Supabase

1. **Create a Supabase project** (one project serves *all* clients).
2. **Run** `backend/schema.sql` in the SQL editor (tables + Row-Level Security).
3. **Add each client** as a `tenants` row; create their owner login under
   Authentication → Users, then link them in `tenant_users`.
4. **Deploy the endpoints** — copy `backend/booking.js` → `/api/booking.js` and
   `backend/track.js` → `/api/track.js` in the site repo. Set Vercel env vars:
   `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE` (server-side only), `TENANT_VIP`,
   and optionally `LEAD_WEBHOOK_URL` (keeps your Make.com alerts).
5. **Wire the site** — point the booking form at `POST /api/booking?tenant=<slug>`
   and paste `backend/tracker-snippet.html` before `</body>` on every page.
6. **Flip the dashboard** — in `js/config.js` set `mode: 'supabase'` and fill in
   `url`, `anonKey`, `tenantId`. Add the Supabase JS client and implement the two
   commented queries in `js/data.js`. Done.

### Security model
- The browser only ever uses the **anon key** and can only **read** — RLS scopes
  every row to the logged-in owner's tenant.
- Inserts (bookings, pageviews) go through the **service-role** key, which lives
  only in the serverless functions, never in the browser.
