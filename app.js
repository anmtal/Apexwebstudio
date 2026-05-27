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
    
    const pricePeriod1 = document.getElementById('price-period-1');
    const pricePeriod2 = document.getElementById('price-period-2');
    const pricePeriod3 = document.getElementById('price-period-3');
    
    const priceNote1 = document.getElementById('price-note-1');
    const priceNote2 = document.getElementById('price-note-2');
    const priceNote3 = document.getElementById('price-note-3');

    let isTraditional = false;

    const updatePricing = () => {
        const currentValue = packageDropdown.value;

        if (isTraditional) {
            // Traditional Upfront Prices
            priceVal1.innerText = '499';
            priceVal2.innerText = '799';
            priceVal3.innerText = '999';
            
            pricePeriod1.innerText = ' setup';
            pricePeriod2.innerText = ' setup';
            pricePeriod3.innerText = ' setup';
            
            priceNote1.innerText = 'One-time Build + $79/mo maintenance';
            priceNote2.innerText = 'One-time Build + $79/mo maintenance';
            priceNote3.innerText = 'One-time Build + $79/mo maintenance';
            
            labelSub.classList.remove('active');
            labelTrad.classList.add('active');
            toggleSwitch.classList.add('active');

            // Dynamically show Upfront in form dropdown
            packageDropdown.innerHTML = `
                <option value="Landing Page">Landing Page - $499 CAD Upfront</option>
                <option value="Growth Package">Growth Package - $799 CAD Upfront</option>
                <option value="Enterprise Package">Enterprise Package - $999 CAD Upfront</option>
            `;
        } else {
            // Subscription Monthly Prices
            priceVal1.innerText = '139';
            priceVal2.innerText = '159';
            priceVal3.innerText = '179';
            
            pricePeriod1.innerText = '/ mo';
            pricePeriod2.innerText = '/ mo';
            pricePeriod3.innerText = '/ mo';
            
            priceNote1.innerText = '12-Month Contract. Drops to $79/mo in Year 2!';
            priceNote2.innerText = '12-Month Contract. Drops to $79/mo in Year 2!';
            priceNote3.innerText = '12-Month Contract. Drops to $79/mo in Year 2!';
            
            labelSub.classList.add('active');
            labelTrad.classList.remove('active');
            toggleSwitch.classList.remove('active');

            // Dynamically show Monthly in form dropdown
            packageDropdown.innerHTML = `
                <option value="Landing Page">Landing Page - $139 CAD / mo</option>
                <option value="Growth Package">Growth Package - $159 CAD / mo</option>
                <option value="Enterprise Package">Enterprise Package - $179 CAD / mo</option>
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
    const packageDropdown = document.getElementById('selected-package');

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

    contactForm.addEventListener('submit', (e) => {
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

        // Animate out the form, slide success block in
        contactForm.style.display = 'none';
        successState.style.display = 'block';
    });

    resetFormBtn.addEventListener('click', () => {
        contactForm.reset();
        
        // Restore defaults
        packageDropdown.value = 'Growth Package';
        
        successState.style.display = 'none';
        contactForm.style.display = 'block';
    });
});
