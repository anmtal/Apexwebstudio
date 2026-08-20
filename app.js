document.addEventListener('DOMContentLoaded', () => {

    /* ==========================================================================
       1. STICKY HEADER & SCROLL TRANSITIONS
       ========================================================================== */
    const header = document.getElementById('main-header');
    
    window.addEventListener('scroll', () => {
        if (window.scrollY > 50) {
            header.classList.add('scrolled');
        } else {
            header.classList.remove('scrolled');
        }
    });

    /* ==========================================================================
       2. MOBILE NAVIGATION DRAWER
       ========================================================================== */
    const menuToggle = document.getElementById('menu-toggle');
    const navbar = document.getElementById('navbar');
    const navLinks = document.querySelectorAll('.nav-link');

    menuToggle.addEventListener('click', () => {
        navbar.classList.toggle('open');
        const icon = menuToggle.querySelector('i');
        if (navbar.classList.contains('open')) {
            icon.className = 'fa-solid fa-xmark';
        } else {
            icon.className = 'fa-solid fa-bars';
        }
    });

    // Close menu when clicking navigation anchors
    navLinks.forEach(link => {
        link.addEventListener('click', () => {
            navbar.classList.remove('open');
            menuToggle.querySelector('i').className = 'fa-solid fa-bars';
        });
    });

    /* ==========================================================================
       3. VIEWPORT INTERSECTION OBSERVER
       ========================================================================== */
    const sections = document.querySelectorAll('section');
    
    const navObserverOptions = {
        threshold: 0.25,
        rootMargin: "0px 0px -100px 0px"
    };

    const navObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const id = entry.target.getAttribute('id');
                navLinks.forEach(link => {
                    if (link.getAttribute('href') === `#${id}`) {
                        link.classList.add('active');
                    } else {
                        link.classList.remove('active');
                    }
                });
            }
        });
    }, navObserverOptions);

    sections.forEach(section => {
        navObserver.observe(section);
    });

    /* ==========================================================================
       4. INTERACTIVE PRICING SWITCH LOGIC
       ========================================================================== */
    
    
    
    const priceNote1 = document.getElementById('price-note-1');
    const priceNote2 = document.getElementById('price-note-2');
    const priceNote3 = document.getElementById('price-note-3');
    const priceNote4 = document.getElementById('price-note-4');
    const packageDropdown = document.getElementById('selected-package');

    let CURRENCY = 'CAD'; // Canada default; flips to 'USD' for everyone outside Canada (display only — see /api/geo)

    const updatePricing = () => {
        // Flat monthly pricing — $0 upfront, month-to-month, no contract, no Year-2 drop.
        const FLAT_NOTE = '$0 Upfront \u00b7 Month-to-month \u00b7 Cancel anytime';
        [priceNote1, priceNote2, priceNote3, priceNote4].forEach(el => { if (el) el.innerText = FLAT_NOTE; });
        applyCurrency();
    };

    // Swap the currency label (CAD/USD) everywhere prices appear. Numbers are
    // identical in both currencies; only the label changes. Idempotent — the
    // base render always writes "CAD", and this converts it to CURRENCY.
    function applyCurrency() {
        document.querySelectorAll('.currency').forEach(el => { el.textContent = CURRENCY; });
        document.querySelectorAll('.addon-price').forEach(el => {
            el.textContent = el.textContent.replace('CAD', CURRENCY);
        });
        [priceNote1, priceNote2, priceNote3, priceNote4].forEach(el => {
            if (el) el.textContent = el.textContent.replace('CAD', CURRENCY);
        });
        Array.from(packageDropdown.options).forEach(o => {
            o.textContent = o.textContent.replace('CAD', CURRENCY);
        });
    }


    // Initialize pricing and dropdown on page load (defaults to CAD)
    updatePricing();

    // Detect visitor country via Vercel geolocation. Canada -> CAD (default);
    // the US and every other country -> USD.
    fetch('/api/geo')
        .then(r => r.ok ? r.json() : null)
        .then(data => {
            const country = data ? (data.country || '').toUpperCase() : '';
            if (country && country !== 'CA') {
                CURRENCY = 'USD';
                updatePricing();
            }
        })
        .catch(() => { /* network/geo unavailable — stay on CAD */ });

    /* ==========================================================================
       5. DYNAMIC FORM POPULATION VIA PLAN SELECTORS
       ========================================================================== */
    const selectButtons = document.querySelectorAll('.select-plan-btn');

    selectButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const planName = btn.getAttribute('data-plan');
            // Select the Monthly or Upfront variant based on the current toggle
            packageDropdown.value = planName + ' (Monthly)';
            
            // Smooth scroll to the contact form section
            document.getElementById('contact').scrollIntoView({
                behavior: 'smooth'
            });
        });
    });

    /* ==========================================================================
       6. ONBOARDING FORM VALIDATION & ON-SUBMIT TRANSITION
       ========================================================================== */
    const contactForm = document.getElementById('agency-contact-form');
    const successState = document.getElementById('form-success');
    const resetFormBtn = document.getElementById('reset-form-btn');

    // Helpers for the inline "failed to send" message
    const showFormError = () => {
        let note = document.getElementById('form-error-note');
        if (!note) {
            note = document.createElement('div');
            note.id = 'form-error-note';
            note.className = 'form-error-note';
            note.innerHTML = 'Sorry — something went wrong sending your inquiry. Please email <a href="mailto:contact@apexwebstudio.ca">contact@apexwebstudio.ca</a> or call (365) 737-1707.';
            contactForm.appendChild(note);
        }
        note.style.display = 'block';
    };
    const clearFormError = () => {
        const note = document.getElementById('form-error-note');
        if (note) note.style.display = 'none';
    };

    contactForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const name = document.getElementById('client-name');
        const email = document.getElementById('client-email');
        let isValid = true;

        if (!name.value.trim()) {
            name.style.borderColor = '#ff4a4a';
            isValid = false;
        } else {
            name.style.borderColor = 'rgba(255,255,255,0.06)';
        }

        if (!email.value.trim() || !email.value.includes('@')) {
            email.style.borderColor = '#ff4a4a';
            isValid = false;
        } else {
            email.style.borderColor = 'rgba(255,255,255,0.06)';
        }

        if (!isValid) return;

        // Honeypot: real visitors never see this field. If it's filled, treat the
        // submission as a bot — show success but send nothing to the CRM.
        const honeypot = document.getElementById('hp-field');
        if (honeypot && honeypot.value.trim() !== '') {
            contactForm.style.display = 'none';
            successState.style.display = 'block';
            return;
        }

        // Determine which page the lead came from for CRM tracking
        const submittedFrom = window.location.pathname.split('/').pop() || 'index.html';
        let leadSource = 'Main Agency Homepage';
        if (submittedFrom.includes('mississauga')) {
            leadSource = 'Mississauga Landing Page';
        } else if (submittedFrom.includes('toronto')) {
            leadSource = 'Toronto Landing Page';
        } else if (submittedFrom.includes('brampton')) {
            leadSource = 'Brampton Landing Page';
        } else if (submittedFrom.includes('oakville')) {
            leadSource = 'Oakville Landing Page';
        }

        const selectedAddons = [];
        if (document.getElementById('addon-brand-kit').checked) selectedAddons.push('Brand Identity & Logo Kit (+$249 Setup)');
        if (document.getElementById('addon-local-seo').checked) selectedAddons.push('Local SEO & Map Pack Boost (+$499/mo)');
        if (document.getElementById('addon-lead-auto').checked) selectedAddons.push('Client Booking & Automation Suite (+$499/mo)');

        const phoneEl = document.getElementById('client-phone');
        const formData = {
            clientName: name.value.trim(),
            clientEmail: email.value.trim(),
            clientPhone: phoneEl ? phoneEl.value.trim() : '',
            selectedPackage: packageDropdown.value,
            selectedAddons: selectedAddons.join(', ') || 'None',
            clientMessage: document.getElementById('client-message').value.trim(),
            leadSource: leadSource
        };

        // Deliver the lead through the /api/lead serverless proxy, which forwards
        // it to the CRM webhook server-side — the webhook URL is never exposed
        // in client code.
        const deliverLead = async () => {
            try {
                const res = await fetch('/api/lead', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(formData)
                });
                return res.ok;
            } catch (err) {
                console.error('Lead submission failed:', err);
                return false;
            }
        };

        const submitBtn = document.getElementById('submit-form-btn');
        const originalBtnHTML = submitBtn.innerHTML;
        submitBtn.disabled = true;
        submitBtn.innerHTML = 'Sending... <i class="fa-solid fa-spinner fa-spin"></i>';
        clearFormError();

        const delivered = await deliverLead();
        if (delivered) {
            contactForm.style.display = 'none';
            successState.style.display = 'block';
        } else {
            showFormError();
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalBtnHTML;
        }
    });

    resetFormBtn.addEventListener('click', () => {
        contactForm.reset();
        clearFormError();

        // Restore defaults
        packageDropdown.value = 'Growth Package (Monthly)';
        document.getElementById('addon-brand-kit').checked = false;
        document.getElementById('addon-local-seo').checked = false;
        document.getElementById('addon-lead-auto').checked = false;
        
        successState.style.display = 'none';
        contactForm.style.display = 'block';
    });
});

/* ==========================================================================
   7. FIRST-PARTY ANALYTICS  (feeds the Apex owner dashboard)
   Cookie-free, ~1KB. Runs on every page (app.js is site-wide). Sends
   page views + contact-clicks to /api/track. No third-party trackers.
   ========================================================================== */
(function () {
    var ENDPOINT = '/api/track?tenant=apex';
    var start = Date.now();
    var sid = sessionStorage.getItem('apx_sid');
    if (!sid) { sid = Math.random().toString(36).slice(2) + Date.now().toString(36); sessionStorage.setItem('apx_sid', sid); }

    function ref() {
        try {
            if (!document.referrer) return 'Direct';
            var h = new URL(document.referrer).hostname;
            if (h === location.hostname) return 'Direct';
            if (/google\./.test(h)) return 'Google';
            if (/bing\./.test(h)) return 'Bing';
            if (/instagram\./.test(h)) return 'Instagram';
            if (/facebook\.|fb\./.test(h)) return 'Facebook';
            if (/linkedin\./.test(h)) return 'LinkedIn';
            return h;
        } catch (e) { return 'Direct'; }
    }
    function send(type, extra) {
        var payload = Object.assign({ type: type, path: location.pathname, referrer: ref(), session: sid }, extra || {});
        var body = JSON.stringify(payload);
        try {
            if (navigator.sendBeacon) navigator.sendBeacon(ENDPOINT, new Blob([body], { type: 'application/json' }));
            else fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body, keepalive: true });
        } catch (e) { /* never block the page */ }
    }

    send('pageview');
    window.addEventListener('pagehide', function () { send('pageview', { duration: Math.round((Date.now() - start) / 1000) }); });
    document.addEventListener('click', function (e) {
        var a = e.target.closest && e.target.closest('a');
        if (!a) return;
        var href = a.getAttribute('href') || '';
        if (/wa\.me|whatsapp/i.test(href)) send('wa_click');
        else if (/instagram\.com/i.test(href)) send('ig_click');
        else if (/^tel:/i.test(href)) send('call_click');
        else if (/^mailto:/i.test(href)) send('email_click');
    }, true);
})();
