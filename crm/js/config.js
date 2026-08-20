/* ============================================================
   APEX CRM — per-client configuration
   Everything that changes between clients lives here. Swap this
   one file (theme vars in dashboard.css + this config) to re-skin
   the whole dashboard for another business.
   ============================================================ */
window.CRM = window.CRM || {};

CRM.config = {
  // ---- Data source -------------------------------------------------
  // 'demo'     → runs on seeded in-browser data (what you're seeing now)
  // 'supabase' → reads live data from Supabase (see backend/README.md)
  mode: 'demo',

  supabase: {
    url: '',          // https://xxxx.supabase.co
    anonKey: '',      // public anon key (safe for the browser; RLS protects rows)
    tenantId: ''      // this client's tenant id
  },

  // ---- Business identity ------------------------------------------
  business: {
    name: 'VIP Diamond Barber',
    tagline: 'Barber Shop · Est. 2025',
    initials: 'VIP',
    location: 'Ontario, Canada',
    website: 'https://vipdiamondbarber.ca',
    instagram: '@vip_barber_2025',
    whatsapp: '+1 000 000 0000',
    ownerName: 'Marco',
    ownerEmail: 'booking@vipdiamondbarber.ca',
    currency: 'CAD',
    currencySymbol: '$',
    // What "one visit due for rebook" means for this trade (days)
    rebookCycleDays: 28
  },

  // ---- Plan (shown subtly in Settings — reinforces the value) -----
  plan: {
    name: 'Apex Growth',
    price: 250,
    interval: 'mo'
  },

  // ---- Services & prices ------------------------------------------
  // Pulled straight from the client's booking page. Drives the
  // estimated-value engine: each enquiry = sum of the LOWEST listed
  // price of the services the visitor selected (a conservative floor).
  services: [
    { name: 'Haircut',            price: 35 },
    { name: 'Skin Fade',          price: 40 },
    { name: 'Haircut & Beard',    price: 50 },
    { name: 'Beard Trim & Shape', price: 20 },
    { name: 'Hot Towel Shave',    price: 35 },
    { name: 'Lineup / Edge-up',   price: 15 },
    { name: 'Kids Cut',           price: 25 },
    { name: 'VIP Package',        price: 65 }
  ],

  // ---- Copy for the value widget (kept honest, like the pitch) ----
  valueMethodology:
    'A conservative floor: every website enquiry is valued at the lowest total ' +
    'of the services the visitor selected. It reflects warm leads the site ' +
    'generated — not confirmed revenue. Direct WhatsApp & Instagram clicks are ' +
    'counted separately.'
};
