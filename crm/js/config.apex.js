/* ============================================================
   APEX CRM — Apex Web Studio's OWN dashboard config
   Themed to the agency (teal/cyan on space-black, Outfit).
   The value engine treats each website enquiry as new monthly
   subscription pipeline = the package price + recurring add-ons.
   ============================================================ */
window.CRM = window.CRM || {};

CRM.config = {
  // 'demo'  → seeded preview (what you see before wiring Supabase)
  // 'live'  → real data via /api/crm-data (see CONNECT-APEX.md)
  // Override at runtime with ?mode=live / ?mode=demo on the URL.
  mode: 'demo',

  // live-mode endpoint on your own site (same origin as the dashboard)
  liveEndpoint: '/api/crm-data',

  business: {
    name: 'Apex Web Studio',
    tagline: 'Agency Dashboard',
    dashLabel: 'Agency Dashboard',
    initials: 'A',
    location: 'Ontario, Canada',
    website: 'https://apexwebstudio.ca',
    instagram: '',
    whatsapp: '',
    ownerName: 'Apex',
    ownerEmail: 'contact@apexwebstudio.ca',
    currency: 'CAD',
    currencySymbol: '$',
    rebookCycleDays: 30
  },

  // agency-flavoured wording + which appointment features to show
  entity: { plural: 'Leads', singular: 'Lead' },
  entitySub: 'Enquiries & subscription pipeline',
  overviewSub: 'Website & lead insights',
  features: { calendar: false, splash: false },
  plan: null,   // this is your own tool — no client plan card

  // headline hero copy (pipeline framing, not "covers your plan")
  hero: {
    label: 'Monthly pipeline from your website · last 30 days',
    suffix: 'in new subscription enquiries — warm leads, not signed revenue.'
  },

  // packages + recurring add-ons drive the value engine
  services: [
    { name: 'Landing Page',              price: 149 },
    { name: 'Growth Package',            price: 199 },
    { name: 'Enterprise Package',        price: 349 },
    { name: 'E-Commerce Package',        price: 559 },
    { name: 'Local SEO & Map Pack',      price: 499 },
    { name: 'Booking & Automation Suite', price: 499 }
  ],

  valueMethodology:
    'Each website enquiry is valued at the monthly price of the package the ' +
    'visitor selected, plus any recurring add-ons. It reflects new subscription ' +
    'pipeline your site generated — warm leads, not signed contracts.'
};
