/* ============================================================
   APEX CRM — SHAREABLE DEMO config (placeholder brand)
   A fictional barbershop with .example contacts, so the public
   sales demo carries no real client's identity. Same engine as
   the real per-client config.js.
   ============================================================ */
window.CRM = window.CRM || {};

CRM.config = {
  mode: 'demo',
  supabase: { url: '', anonKey: '', tenantId: '' },

  business: {
    name: 'Blackwood Barber Co.',
    tagline: 'Barber Shop · Est. 2019',
    initials: 'BB',
    location: 'Downtown',
    website: 'https://blackwoodbarber.example',
    instagram: '@blackwoodbarberco',
    whatsapp: '+1 000 000 0000',
    ownerName: 'Jordan',
    ownerEmail: 'hello@blackwoodbarber.example',
    currency: 'CAD',
    currencySymbol: '$',
    rebookCycleDays: 28
  },

  plan: { name: 'Apex Growth', price: 249, interval: 'mo' },

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

  valueMethodology:
    'A conservative floor: every website enquiry is valued at the lowest total ' +
    'of the services the visitor selected. It reflects warm leads the site ' +
    'generated — not confirmed revenue. Direct WhatsApp & Instagram clicks are ' +
    'counted separately.'
};
