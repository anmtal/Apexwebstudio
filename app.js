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
    const toggleSwitch = document.getElementById('price-toggle-switch');
    const labelSub = document.getElementById('toggle-label-sub');
    const labelTrad = document.getElementById('toggle-label-trad');
    
    const priceVal1 = document.getElementById('price-val-1');
    const priceVal2 = document.getElementById('price-val-2');
    const priceVal3 = document.getElementById('price-val-3');
    const priceVal4 = document.getElementById('price-val-4');
    
    const pricePeriod1 = document.getElementById('price-period-1');
    const pricePeriod2 = document.getElementById('price-period-2');
    const pricePeriod3 = document.getElementById('price-period-3');
    const pricePeriod4 = document.getElementById('price-period-4');
    
    const priceNote1 = document.getElementById('price-note-1');
    const priceNote2 = document.getElementById('price-note-2');
    const priceNote3 = document.getElementById('price-note-3');
    const priceNote4 = document.getElementById('price-note-4');
    const packageDropdown = document.getElementById('selected-package');

    let isTraditional = false;

    const updatePricing = () => {
        const currentValue = packageDropdown.value;

        if (isTraditional) {
            // Traditional Upfront Prices
            priceVal1.innerText = '499';
            priceVal2.innerText = '799';
            priceVal3.innerText = '999';
            priceVal4.innerText = '1999';
            
            pricePeriod1.innerText = ' setup';
            pricePeriod2.innerText = ' setup';
            pricePeriod3.innerText = ' setup';
            pricePeriod4.innerText = ' setup';
            
            priceNote1.innerText = 'One-time Build + $79/mo maintenance (Optional)';
            priceNote2.innerText = 'One-time Build + $79/mo maintenance (Optional)';
            priceNote3.innerText = 'One-time Build + $79/mo maintenance (Optional)';
            priceNote4.innerText = 'One-time Build + $99/mo maintenance (Optional)';
            
            labelSub.classList.remove('active');
            labelTrad.classList.add('active');
            toggleSwitch.classList.add('active');

            // Dynamically show Upfront in form dropdown
            packageDropdown.innerHTML = `
                <option value="Landing Page">Landing Page - $499 CAD Upfront</option>
                <option value="Growth Package">Growth Package - $799 CAD Upfront</option>
                <option value="Enterprise Package">Enterprise Package - $999 CAD Upfront</option>
                <option value="E-Commerce Package">E-Commerce Package - $1,999 CAD Upfront</option>
            `;
        } else {
            // Subscription Monthly Prices
            priceVal1.innerText = '139';
            priceVal2.innerText = '159';
            priceVal3.innerText = '179';
            priceVal4.innerText = '279';
            
            pricePeriod1.innerText = '/ mo';
            pricePeriod2.innerText = '/ mo';
            pricePeriod3.innerText = '/ mo';
            pricePeriod4.innerText = '/ mo';
            
            priceNote1.innerText = '12-Month Contract. Drops to $79/mo in Year 2!';
            priceNote2.innerText = '12-Month Contract. Drops to $79/mo in Year 2!';
            priceNote3.innerText = '12-Month Contract. Drops to $79/mo in Year 2!';
            priceNote4.innerText = '12-Month Contract. Drops to $99/mo in Year 2!';
            
            labelSub.classList.add('active');
            labelTrad.classList.remove('active');
            toggleSwitch.classList.remove('active');

            // Dynamically show Monthly in form dropdown
            packageDropdown.innerHTML = `
                <option value="Landing Page">Landing Page - $139 CAD / mo</option>
                <option value="Growth Package">Growth Package - $159 CAD / mo</option>
                <option value="Enterprise Package">Enterprise Package - $179 CAD / mo</option>
                <option value="E-Commerce Package">E-Commerce Package - $279 CAD / mo</option>
            `;
        }

        // Restore selected value
        packageDropdown.value = currentValue;
    };

    toggleSwitch.addEventListener('click', () => {
        isTraditional = !isTraditional;
        updatePricing();
    });

    // Label triggers
    labelSub.addEventListener('click', () => {
        isTraditional = false;
        updatePricing();
    });

    labelTrad.addEventListener('click', () => {
        isTraditional = true;
        updatePricing();
    });

    // Initialize pricing and dropdown on page load
    updatePricing();

    /* ==========================================================================
       5. DYNAMIC FORM POPULATION VIA PLAN SELECTORS
       ========================================================================== */
    const selectButtons = document.querySelectorAll('.select-plan-btn');

    selectButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const planName = btn.getAttribute('data-plan');
            packageDropdown.value = planName;
            
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
        }

        const selectedAddons = [];
        if (document.getElementById('addon-brand-kit').checked) selectedAddons.push('Brand Identity & Logo Kit (+$249 Setup)');
        if (document.getElementById('addon-local-seo').checked) selectedAddons.push('Local SEO & Map Pack Boost (+$149/mo)');
        if (document.getElementById('addon-lead-auto').checked) selectedAddons.push('Advanced Lead Automation & CRM (+$49/mo)');

        const formData = {
            clientName: name.value.trim(),
            clientEmail: email.value.trim(),
            selectedPackage: packageDropdown.value,
            selectedAddons: selectedAddons.join(', ') || 'None',
            clientMessage: document.getElementById('client-message').value.trim(),
            leadSource: leadSource
        };

        // Deliver the lead. Preferred path is the /api/lead serverless proxy (on
        // Vercel) which keeps the CRM webhook server-side. If that endpoint isn't
        // available (e.g. the page is served from a static host without /api), fall
        // back to posting the webhook directly so leads are never lost in transit.
        // Once the domain is fully served by Vercel, the fallback can be removed.
        const FALLBACK_WEBHOOK = 'https://hook.us2.make.com/v6go83c3ratvdbb1tgskxe39nprwpunu';

        const deliverLead = async () => {
            try {
                const res = await fetch('/api/lead', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(formData)
                });
                if (res.ok) return true;
            } catch (err) {
                console.warn('Serverless endpoint unavailable, using fallback:', err);
            }
            try {
                // no-cors: the request still reaches the webhook even without CORS
                // headers; the response is opaque, so reaching this point = sent.
                await fetch(FALLBACK_WEBHOOK, {
                    method: 'POST',
                    mode: 'no-cors',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(formData)
                });
                return true;
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
        packageDropdown.value = 'Growth Package';
        document.getElementById('addon-brand-kit').checked = false;
        document.getElementById('addon-local-seo').checked = false;
        document.getElementById('addon-lead-auto').checked = false;
        
        successState.style.display = 'none';
        contactForm.style.display = 'block';
    });
});
