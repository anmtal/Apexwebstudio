document.addEventListener('DOMContentLoaded', () => {

    /* ==========================================================================
       1. STICKY HEADER & SCROLL ANIMATION
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
       2. MOBILE NAVIGATION MENU
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

    // Close mobile menu when clicking a link
    navLinks.forEach(link => {
        link.addEventListener('click', () => {
            navbar.classList.remove('open');
            menuToggle.querySelector('i').className = 'fa-solid fa-bars';
        });
    });

    /* ==========================================================================
       3. ACTIVE SCROLL LINK HIGHLIGHTING
       ========================================================================== */
    const sections = document.querySelectorAll('section');
    
    const navObserverOptions = {
        threshold: 0.3,
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
       4. ANIMATED STATS COUNTER
       ========================================================================== */
    const statsSection = document.getElementById('hero');
    const statNumbers = document.querySelectorAll('.stat-number');
    let counted = false;

    const countUp = () => {
        statNumbers.forEach(stat => {
            const target = parseInt(stat.getAttribute('data-target'));
            let current = 0;
            const increment = Math.ceil(target / 50); // Speed control
            
            const updateCount = () => {
                current += increment;
                if (current >= target) {
                    stat.innerText = target + (stat.parentElement.id === 'stat-card-3' ? '%' : '+');
                } else {
                    stat.innerText = current;
                    requestAnimationFrame(updateCount);
                }
            };
            
            updateCount();
        });
    };

    // Trigger stats counter immediately on hero load
    setTimeout(() => {
        if (!counted) {
            countUp();
            counted = true;
        }
    }, 800);

    /* ==========================================================================
       5. PORTFOLIO FILTERING
       ========================================================================== */
    const filterButtons = document.querySelectorAll('.filter-btn');
    const portfolioItems = document.querySelectorAll('.portfolio-item');

    filterButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            // Remove active class from all buttons
            filterButtons.forEach(b => b.classList.remove('active'));
            // Add active class to clicked button
            btn.classList.add('active');
            
            const filterValue = btn.getAttribute('data-filter');
            
            portfolioItems.forEach(item => {
                const category = item.getAttribute('data-category');
                
                if (filterValue === 'all' || category === filterValue) {
                    item.classList.remove('hidden');
                    // Brief delay to allow CSS transitions to trigger
                    setTimeout(() => {
                        item.style.transform = 'scale(1)';
                        item.style.opacity = '1';
                    }, 50);
                } else {
                    item.style.transform = 'scale(0.9)';
                    item.style.opacity = '0';
                    setTimeout(() => {
                        item.classList.add('hidden');
                    }, 300);
                }
            });
        });
    });

    /* ==========================================================================
       6. INTERACTIVE MULTI-STEP PROJECT PLANNER
       ========================================================================== */
    const steps = document.querySelectorAll('.form-step');
    const nextBtns = document.querySelectorAll('.next-step');
    const prevBtns = document.querySelectorAll('.prev-step');
    const plannerForm = document.getElementById('project-planner-form');
    const successState = document.getElementById('planner-success');
    const resetBtn = document.getElementById('reset-planner-btn');
    const budgetSlider = document.getElementById('budget-slider');
    const budgetVal = document.getElementById('budget-val');
    const typeCards = document.querySelectorAll('.type-card');

    let currentStep = 0;

    // Project Type Selector Visual Polish
    typeCards.forEach(card => {
        const radio = card.querySelector('input[type="radio"]');
        
        // Match initial selection
        if (radio.checked) {
            card.classList.add('selected');
        }

        card.addEventListener('click', () => {
            typeCards.forEach(c => c.classList.remove('selected'));
            card.classList.add('selected');
            radio.checked = true;
        });
    });

    // Dynamic Budget Slider Text
    budgetSlider.addEventListener('input', (e) => {
        const val = parseInt(e.target.value);
        if (val >= 150000) {
            budgetVal.innerText = '$150,000+ CAD';
        } else {
            budgetVal.innerText = `$${val.toLocaleString()} CAD`;
        }
    });

    // Navigate Steps
    const showStep = (stepIndex) => {
        steps.forEach((step, idx) => {
            if (idx === stepIndex) {
                step.classList.add('active');
            } else {
                step.classList.remove('active');
            }
        });
    };

    nextBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            // Simple validation check for Step 2 and Step 3
            if (currentStep === 1) {
                const scopeSelect = document.getElementById('project-scope');
                if (!scopeSelect.value) {
                    scopeSelect.style.borderColor = '#ff4a4a';
                    return;
                }
                scopeSelect.style.borderColor = 'rgba(255,255,255,0.08)';
            }
            
            if (currentStep < steps.length - 1) {
                currentStep++;
                showStep(currentStep);
            }
        });
    });

    prevBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            if (currentStep > 0) {
                currentStep--;
                showStep(currentStep);
            }
        });
    });

    // Handle Form Submit
    plannerForm.addEventListener('submit', (e) => {
        e.preventDefault();
        
        // Inputs validation
        const name = document.getElementById('client-name');
        const email = document.getElementById('client-email');
        let valid = true;

        if (!name.value.trim()) {
            name.style.borderColor = '#ff4a4a';
            valid = false;
        } else {
            name.style.borderColor = 'rgba(255,255,255,0.08)';
        }

        if (!email.value.trim() || !email.value.includes('@')) {
            email.style.borderColor = '#ff4a4a';
            valid = false;
        } else {
            email.style.borderColor = 'rgba(255,255,255,0.08)';
        }

        if (!valid) return;

        // Hide form and show success state
        plannerForm.style.display = 'none';
        successState.style.display = 'block';
    });

    // Reset Form
    resetBtn.addEventListener('click', () => {
        plannerForm.reset();
        currentStep = 0;
        showStep(currentStep);
        
        // Reset budget text
        budgetVal.innerText = '$15,000 CAD';
        
        // Reset type cards
        typeCards.forEach(c => c.classList.remove('selected'));
        typeCards[0].classList.add('selected');
        typeCards[0].querySelector('input[type="radio"]').checked = true;
        
        // Show form & hide success state
        successState.style.display = 'none';
        plannerForm.style.display = 'block';
    });
});
