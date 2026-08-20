# Connect the CRM to apexwebstudio.ca

Everything on the code side is **done and wired**:

- ✅ `app.js` now has a first-party tracker on **every page** → `/api/track`
- ✅ `/api/lead.js` still emails you via Make.com **and** now saves each lead to the CRM, with an estimated **monthly-pipeline** value (package price + recurring add-ons)
- ✅ `/api/track.js` — traffic ingestion
- ✅ `/api/crm-data.js` — the dashboard's read endpoint (access-key gated)
- ✅ Your dashboard: `crm/apex.html` — themed to Apex (teal/cyan, Outfit), "Leads" wording, pipeline hero

The only thing left is a **datastore** — a free Supabase project. ~5 minutes, one time.

---

## 1. Create the datastore
1. Sign up at **supabase.com** → **New project** (free tier is plenty). Pick a strong DB password.
2. Open **SQL Editor**, paste all of [`backend/schema.sql`](backend/schema.sql), **Run**.
3. Still in SQL Editor, create your tenant and copy the id it returns:
   ```sql
   insert into tenants (name, slug) values ('Apex Web Studio', 'apex') returning id;
   ```

## 2. Get your keys
In Supabase → **Project Settings → API**, copy:
- **Project URL** (e.g. `https://abcd.supabase.co`)
- **service_role** key (the secret one — server-side only, never in the browser)

## 3. Set environment variables (Vercel → Settings → Environment Variables)
| Name | Value |
|---|---|
| `SUPABASE_URL` | your Project URL |
| `SUPABASE_SERVICE_ROLE` | your service_role key |
| `TENANT_APEX` | the tenant id from step 1.3 |
| `CRM_TOKEN` | **a passphrase you invent** — this is your dashboard access key |
| `LEAD_WEBHOOK_URL` | (keep your existing Make.com hook) |

## 4. Redeploy
Push / redeploy the site so the new API code + env vars go live. Nothing else to change on the site — the form and tracker are already wired.

## 5. Open your dashboard
Your dashboard ships with the site at **`/crm/apex.html`** (same origin as `/api`, so it just works):

```
https://apexwebstudio.ca/crm/apex.html?mode=live
```

Enter your **`CRM_TOKEN`** as the access key. Real leads + live traffic appear.
To make live the default (drop the `?mode=live`), set `mode: 'live'` in [`js/config.apex.js`](js/config.apex.js).

**Tip:** add `/crm` to `robots.txt` (or a `noindex`) so the dashboard login isn't indexed.

---

## Security model
- The **service_role** key lives only in the serverless functions — never in the browser.
- The browser reaches data only through `/api/crm-data`, gated by your `CRM_TOKEN` (typed at login, kept in `sessionStorage`, sent as a Bearer header — never in page source).
- This shared-key gate is right for **your single owner dashboard**. When you host **multiple client dashboards**, upgrade to Supabase Auth + Row-Level Security — `schema.sql` already defines the policies for it.

## Test it
Submit your own contact form once → it appears under **Leads** within a second, valued at the package's monthly price. Visit a few pages → **Overview** traffic climbs.
