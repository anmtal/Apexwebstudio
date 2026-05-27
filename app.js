/* ----------------------------------------------------
   SheetPulse Application Script - High-Fidelity Simulation
   ---------------------------------------------------- */

document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements - Left Panel (Controls)
    const btnOAuth = document.getElementById('btn-oauth');
    const sheetSelectorContainer = document.getElementById('sheet-selector-container');
    const selectSheet = document.getElementById('select-sheet');
    const inputCalendly = document.getElementById('input-calendly');
    const inputSMSBody = document.getElementById('input-sms-body');
    const btnProvision = document.getElementById('btn-provision');
    const numberDetails = document.getElementById('number-details');
    const allocatedNumber = document.getElementById('allocated-number');
    const leadName = document.getElementById('lead-name');
    const leadPhone = document.getElementById('lead-phone');
    const leadService = document.getElementById('lead-service');
    const toggleRealMode = document.getElementById('toggle-real-mode');
    const realModeInputs = document.getElementById('real-mode-inputs');
    const inputWebhook = document.getElementById('input-webhook');
    const btnTrigger = document.getElementById('btn-trigger');
    const stripePaymentLink = document.getElementById('stripe-payment-link');

    // DOM Elements - Right Panel (Visuals)
    const engineStatus = document.getElementById('engine-status');
    const nodeSheet = document.getElementById('node-sheet');
    const nodeApp = document.getElementById('node-app');
    const nodeTwilio = document.getElementById('node-twilio');
    const statusSheet = document.getElementById('status-sheet');
    const statusApp = document.getElementById('status-app');
    const statusTwilio = document.getElementById('status-twilio');
    const path1 = document.getElementById('path-1');
    const path2 = document.getElementById('path-2');

    // Smartphone Display Elements
    const phoneSenderName = document.getElementById('phone-sender-name');
    const phoneMessagesBody = document.getElementById('phone-messages-body');
    const smartphone = document.querySelector('.smartphone');

    // State Variables
    let isSheetsConnected = false;
    let isNumberProvisioned = false;
    let localNumber = '+1 (647) 555-0149';
    let isLoggedIn = false;

    // --------------------------------------------------------
    // Web Audio API Sound Generator (Beep Sound for SMS Ping)
    // --------------------------------------------------------
    function playSMSNotificationSound() {
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (!AudioContext) return;
            
            const ctx = new AudioContext();
            
            // Double-tone rapid notification chime
            const now = ctx.currentTime;
            
            // Note 1
            const osc1 = ctx.createOscillator();
            const gain1 = ctx.createGain();
            osc1.type = 'sine';
            osc1.frequency.setValueAtTime(587.33, now); // D5 note
            gain1.gain.setValueAtTime(0.15, now);
            gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
            osc1.connect(gain1);
            gain1.connect(ctx.destination);
            osc1.start(now);
            osc1.stop(now + 0.15);

            // Note 2 (slightly higher, delayed)
            const osc2 = ctx.createOscillator();
            const gain2 = ctx.createGain();
            osc2.type = 'sine';
            osc2.frequency.setValueAtTime(880.00, now + 0.08); // A5 note
            gain2.gain.setValueAtTime(0.15, now + 0.08);
            gain2.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
            osc2.connect(gain2);
            gain2.connect(ctx.destination);
            osc2.start(now + 0.08);
            osc2.stop(now + 0.3);
            
        } catch (e) {
            console.log('Audio Context blocked or not supported: ', e);
        }
    }

    // Toggle Real Mode Inputs
    toggleRealMode.addEventListener('change', () => {
        if (toggleRealMode.checked) {
            realModeInputs.classList.remove('hidden');
        } else {
            realModeInputs.classList.add('hidden');
        }
    });

    // --------------------------------------------------------
    // Step 1: Connect Google Sheets (Simulated OAuth)
    // --------------------------------------------------------
    btnOAuth.addEventListener('click', () => {
        if (isSheetsConnected) return;

        btnOAuth.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Connecting to Google Account...';
        btnOAuth.disabled = true;

        setTimeout(() => {
            isSheetsConnected = true;
            btnOAuth.innerHTML = '<i class="fa-solid fa-circle-check"></i> Google Sheets Connected';
            btnOAuth.classList.remove('btn-outline');
            btnOAuth.style.background = 'rgba(52, 168, 83, 0.15)';
            btnOAuth.style.borderColor = '#34a853';
            btnOAuth.style.color = '#34a853';
            btnOAuth.disabled = true;

            // Unhide sheet selector dropdown
            sheetSelectorContainer.classList.remove('hidden');
        }, 1200);
    });

    // Handle spreadsheet selection
    selectSheet.addEventListener('change', () => {
        if (selectSheet.value !== '') {
            // Unlock step 2 provision button
            btnProvision.disabled = false;
        } else {
            btnProvision.disabled = true;
        }
    });

    // --------------------------------------------------------
    // Step 2: Reserve Dedicated Local Number (Provisioning)
    // --------------------------------------------------------
    btnProvision.addEventListener('click', () => {
        if (isNumberProvisioned) return;

        btnProvision.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Searching and Registering A2P Brand...';
        btnProvision.disabled = true;

        setTimeout(() => {
            isNumberProvisioned = true;
            btnProvision.innerHTML = '<i class="fa-solid fa-circle-check"></i> Number Registered & Active';
            btnProvision.classList.remove('btn-secondary');
            btnProvision.style.background = 'rgba(6, 182, 212, 0.15)';
            btnProvision.style.borderColor = '#06b6d4';
            btnProvision.style.color = '#06b6d4';
            btnProvision.disabled = true;

            // Unhide reserved number details badge
            numberDetails.classList.remove('hidden');
            phoneSenderName.innerText = `Hamilton Plumbing (${localNumber})`;

            // Unlock step 3 trigger button
            btnTrigger.disabled = false;
        }, 1500);
    });

    // --------------------------------------------------------
    // Step 3: Simulate Lead Submission (Automation Flow Trigger)
    // --------------------------------------------------------
    btnTrigger.addEventListener('click', async () => {
        // Disable trigger button temporarily to prevent overlapping animations
        btnTrigger.disabled = true;
        btnTrigger.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Processing...';

        const nameVal = leadName.value.trim() || 'Lead';
        const serviceVal = leadService.value;
        const phoneVal = leadPhone.value.trim() || '+1 (416) 555-0182';
        const calendlyVal = inputCalendly.value.trim() || 'calendly.com';
        const templateBody = inputSMSBody.value;
        const isRealMode = toggleRealMode.checked;
        const webhookUrl = inputWebhook.value.trim();

        // Reset flow visual states
        resetVisualFlow();

        // Stage 1: Google Sheets Trigger
        engineStatus.innerText = `Triggering webhook: New lead detected in Sheets...`;
        nodeSheet.classList.add('active');
        statusSheet.innerText = 'Row Added';
        statusSheet.style.color = '#34a853';

        // Stage 2: Glow Path 1 Active (Particle flowing to engine)
        setTimeout(() => {
            path1.classList.add('active');
        }, 600);

        // Stage 3: SheetPulse Engine Active
        setTimeout(() => {
            engineStatus.innerText = `Parsing template: Greeting ${nameVal} for ${serviceVal} booking...`;
            nodeApp.classList.add('active');
            statusApp.innerText = isRealMode ? 'Forwarding Webhook' : 'Formatting SMS';
            statusApp.style.color = '#6366f1';
        }, 1600);

        // Stage 4: Glow Path 2 Active (Particle flowing to Twilio)
        setTimeout(() => {
            path2.classList.add('active');
        }, 2200);

        // Stage 5: Twilio / Real Webhook Call
        setTimeout(async () => {
            if (isRealMode && webhookUrl) {
                engineStatus.innerText = `Sending POST payload to Make.com Webhook...`;
                try {
                    const response = await fetch(webhookUrl, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            name: nameVal,
                            phone: phoneVal,
                            service: serviceVal,
                            calendly: calendlyVal,
                            smsTemplate: templateBody
                        })
                    });

                    if (response.ok) {
                        engineStatus.innerText = `Real SMS triggered successfully via Make.com!`;
                        nodeTwilio.classList.add('active');
                        statusTwilio.innerText = 'Sent (Live)';
                        statusTwilio.style.color = '#10b981';
                    } else {
                        engineStatus.innerText = `Webhook responded with error status: ${response.status}`;
                        statusTwilio.innerText = 'Failed';
                        statusTwilio.style.color = '#ef4444';
                    }
                } catch (error) {
                    console.error('Webhook error:', error);
                    engineStatus.innerText = `Network Error: Could not connect to Webhook URL.`;
                    statusTwilio.innerText = 'Net Error';
                    statusTwilio.style.color = '#ef4444';
                }
            } else {
                engineStatus.innerText = `SMS securely routed to ${phoneVal} via Twilio!`;
                nodeTwilio.classList.add('active');
                statusTwilio.innerText = 'Delivered';
                statusTwilio.style.color = '#f22f46';
            }
        }, 3200);

        // Stage 6: Smartphone Receives SMS (Vibration, Audio, and text display)
        setTimeout(() => {
            // Re-enable trigger button
            btnTrigger.disabled = false;
            btnTrigger.innerHTML = '<i class="fa-solid fa-play"></i> Submit Form & Trigger SMS';

            // Vibration & Ringer alert
            smartphone.classList.add('vibrate');
            playSMSNotificationSound();

            // Clear vibrate class after animation ends
            setTimeout(() => {
                smartphone.classList.remove('vibrate');
            }, 1500);

            // Construct and inject SMS Bubble
            let parsedSMS = templateBody
                .replace(/{Name}/g, nameVal)
                .replace(/{Service}/g, serviceVal)
                .replace(/{Calendly}/g, `<a href="https://${calendlyVal}" target="_blank" class="sms-link">${calendlyVal}</a>`);

            const smsBubble = document.createElement('div');
            smsBubble.className = 'sms-bubble';
            smsBubble.innerHTML = parsedSMS;

            // Remove default message helper text
            const sysMessage = phoneMessagesBody.querySelector('.system-message');
            if (sysMessage) sysMessage.remove();

            phoneMessagesBody.appendChild(smsBubble);
            
            // Auto scroll smartphone chat body to bottom
            phoneMessagesBody.scrollTop = phoneMessagesBody.scrollHeight;
        }, 3800);
    });

    // Helper: Reset Flow Canvas Visually
    function resetVisualFlow() {
        nodeSheet.classList.remove('active');
        nodeApp.classList.remove('active');
        nodeTwilio.classList.remove('active');
        path1.classList.remove('active');
        path2.classList.remove('active');
        statusSheet.innerText = 'Waiting';
        statusSheet.style.color = 'var(--text-muted)';
        statusApp.innerText = 'Idle';
        statusApp.style.color = 'var(--text-muted)';
        statusTwilio.innerText = 'Waiting';
        statusTwilio.style.color = 'var(--text-muted)';
    }

    // --------------------------------------------------------
    // Supabase & Simulated User Authentication Integration
    // --------------------------------------------------------
    const SUPABASE_URL = 'https://inclavehofmmwoffreyh.supabase.co';
    const SUPABASE_ANON_KEY = 'sb_publishable_ZrXwOy5MAynHT1ACfGfoiw_xfoCAIHg';

    let supabaseClient = null;
    let isMockAuth = true; // Automatically falls back to high-fidelity mock if no keys are entered

    // Attempt to initialize real Supabase SDK
    if (typeof supabase !== 'undefined' && !SUPABASE_URL.includes('your-project-id')) {
        try {
            supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
            isMockAuth = false;
            console.log("Supabase Auth: Live mode active.");
        } catch (e) {
            console.warn("Supabase Auth initialization failed, falling back to Sandbox Mock mode:", e);
        }
    } else {
        console.log("Supabase Auth: Sandbox Mock mode active (No API keys provided).");
    }

    // Auth DOM Elements
    const btnLoginTrigger = document.getElementById('btn-login-trigger');
    const authModal = document.getElementById('auth-modal');
    const btnCloseModal = document.getElementById('btn-close-modal');
    const btnLoginGoogle = document.getElementById('btn-login-google');
    const btnLoginEmail = document.getElementById('btn-login-email');
    const authEmail = document.getElementById('auth-email');
    const authMessage = document.getElementById('auth-message');
    const dashboardOverlay = document.getElementById('dashboard-overlay');
    const btnLogout = document.getElementById('btn-logout');
    const userEmailText = document.getElementById('user-email');
    const btnManageBilling = document.getElementById('btn-manage-billing');
    
    // Pending Activation Elements
    const dashboardActiveContent = document.getElementById('dashboard-active-content');
    const dashboardPendingContent = document.getElementById('dashboard-pending-content');
    const userEmailPending = document.getElementById('user-email-pending');
    const btnPayPending = document.getElementById('btn-pay-pending');

    // Link dynamic Stripe billing portal
    const stripePortalUrl = "https://billing.stripe.com/p/login/aFaaEXdwx21Q57B7dI2cg00";
    if (btnManageBilling) {
        btnManageBilling.href = stripePortalUrl;
    }

    // Modal Control: Show
    if (btnLoginTrigger) {
        btnLoginTrigger.addEventListener('click', () => {
            // If already logged in (checked by class state or session)
            if (btnLoginTrigger.classList.contains('logged-in')) {
                dashboardOverlay.classList.remove('hidden');
            } else {
                authModal.classList.remove('hidden');
                // Reset messaging
                authMessage.className = 'auth-status-msg hidden';
                authMessage.innerText = '';
            }
        });
    }

    // Modal Control: Hide
    if (btnCloseModal) {
        btnCloseModal.addEventListener('click', () => {
            authModal.classList.add('hidden');
        });
    }

    // Gatekeeper: Intercept Pay Now to enforce authentication
    if (stripePaymentLink) {
        stripePaymentLink.addEventListener('click', (e) => {
            if (!isLoggedIn) {
                e.preventDefault();
                sessionStorage.setItem('triggerPaymentAfterLogin', 'true');
                // Open Login modal
                authModal.classList.remove('hidden');
                authMessage.className = 'auth-status-msg hidden';
                authMessage.innerText = '';
            }
        });
    }

    // Handle Google Login click
    if (btnLoginGoogle) {
        btnLoginGoogle.addEventListener('click', async () => {
            if (isMockAuth) {
                simulateLogin('demo-user@gmail.com');
            } else {
                const { error } = await supabaseClient.auth.signInWithOAuth({
                    provider: 'google',
                    options: { redirectTo: window.location.origin + '/index.html' }
                });
                if (error) alert("OAuth error: " + error.message);
            }
        });
    }



    // Handle Passwordless Email Login click
    if (btnLoginEmail) {
        btnLoginEmail.addEventListener('click', async () => {
            const emailVal = authEmail.value.trim();
            if (!emailVal) {
                showAuthMsg("Please enter a valid email address.", "error");
                return;
            }

            btnLoginEmail.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Sending link...';
            btnLoginEmail.disabled = true;

            if (isMockAuth) {
                setTimeout(() => {
                    btnLoginEmail.innerHTML = '<i class="fa-solid fa-envelope"></i> Send Secure Login Link';
                    btnLoginEmail.disabled = false;
                    showAuthMsg("✔ Magic Login link successfully sent to your email! (Simulator Mode)", "success");
                    
                    // Automatically simulate logging them in after 2 seconds
                    setTimeout(() => {
                        simulateLogin(emailVal);
                    }, 2000);
                }, 1500);
            } else {
                const { error } = await supabaseClient.auth.signInWithOtp({
                    email: emailVal,
                    options: { emailRedirectTo: window.location.origin + '/index.html' }
                });

                btnLoginEmail.innerHTML = '<i class="fa-solid fa-envelope"></i> Send Secure Login Link';
                btnLoginEmail.disabled = false;

                if (error) {
                    showAuthMsg("Error: " + error.message, "error");
                } else {
                    showAuthMsg("✔ Magic login link sent to your email inbox! Click the link to securely access your portal.", "success");
                }
            }
        });
    }

    // Handle Logout click
    if (btnLogout) {
        btnLogout.addEventListener('click', async () => {
            if (isMockAuth) {
                simulateLogout();
            } else {
                await supabaseClient.auth.signOut();
            }
        });
    }

    // Close overlays if clicking outside the card
    window.addEventListener('click', (e) => {
        if (e.target === authModal) {
            authModal.classList.add('hidden');
        }
        if (e.target === dashboardOverlay) {
            dashboardOverlay.classList.add('hidden');
        }
    });

    // Helper: Show Modal Status messages
    function showAuthMsg(msg, type) {
        authMessage.innerText = msg;
        authMessage.className = `auth-status-msg animate-fade-in ${type}`;
    }

    // Fetch real profile subscription status from Supabase
    async function fetchProfileStatus(session) {
        try {
            const { data, error } = await supabaseClient
                .from('profiles')
                .select('subscription_status')
                .eq('id', session.user.id)
                .maybeSingle();

            const status = (data && data.subscription_status) || 'pending_payment';
            
            if (status === 'active') {
                dashboardActiveContent.classList.remove('hidden');
                dashboardPendingContent.classList.add('hidden');
            } else {
                dashboardActiveContent.classList.add('hidden');
                dashboardPendingContent.classList.remove('hidden');
                
                // Dynamically prefill Stripe checkout link with Email and User Reference ID
                if (btnPayPending) {
                    btnPayPending.href = `https://buy.stripe.com/aFaaEXdwx21Q57B7dI2cg00?client_reference_id=${session.user.id}&prefilled_email=${encodeURIComponent(session.user.email)}`;
                }
                
                // If gatekeeper triggered this login, auto-redirect to pre-filled Stripe checkout
                if (sessionStorage.getItem('triggerPaymentAfterLogin') === 'true') {
                    sessionStorage.removeItem('triggerPaymentAfterLogin');
                    window.location.href = `https://buy.stripe.com/aFaaEXdwx21Q57B7dI2cg00?client_reference_id=${session.user.id}&prefilled_email=${encodeURIComponent(session.user.email)}`;
                }
            }
        } catch (err) {
            console.error("Error fetching user profile status:", err);
            // Safe fallback to pending if database call fails
            dashboardActiveContent.classList.add('hidden');
            dashboardPendingContent.classList.remove('hidden');
        }
    }

    // Helper: Simulate Logging In (Mock Mode & Live Supabase Mode)
    async function simulateLogin(email, session = null) {
        isLoggedIn = true;
        authModal.classList.add('hidden');
        dashboardOverlay.classList.remove('hidden');
        
        if (userEmailText) userEmailText.innerText = email;
        if (userEmailPending) userEmailPending.innerText = email;
        
        if (btnLoginTrigger) {
            btnLoginTrigger.innerHTML = '<i class="fa-solid fa-gauge-high"></i> Dashboard';
            btnLoginTrigger.classList.add('logged-in');
            btnLoginTrigger.classList.remove('btn-secondary');
            btnLoginTrigger.classList.add('btn-primary');
        }

        if (isMockAuth || !session) {
            // Mock Mode: Sandbox Simulator logic
            if (sessionStorage.getItem('triggerPaymentAfterLogin') === 'true') {
                sessionStorage.removeItem('triggerPaymentAfterLogin');
                dashboardActiveContent.classList.add('hidden');
                dashboardPendingContent.classList.remove('hidden');
                
                const mockId = 'mock_usr_' + Math.random().toString(36).substr(2, 9);
                if (btnPayPending) {
                    btnPayPending.href = `https://buy.stripe.com/aFaaEXdwx21Q57B7dI2cg00?client_reference_id=${mockId}&prefilled_email=${encodeURIComponent(email)}`;
                }
                
                // Redirect mock checkout
                window.location.href = `https://buy.stripe.com/aFaaEXdwx21Q57B7dI2cg00?client_reference_id=${mockId}&prefilled_email=${encodeURIComponent(email)}`;
            } else {
                // Default mock user to active for visual preview purposes
                dashboardActiveContent.classList.remove('hidden');
                dashboardPendingContent.classList.add('hidden');
            }
        } else {
            // Live Supabase Mode: fetch actual subscription status
            await fetchProfileStatus(session);
        }
    }

    // Helper: Simulate Logging Out (Mock Mode)
    function simulateLogout() {
        isLoggedIn = false;
        dashboardOverlay.classList.add('hidden');
        if (btnLoginTrigger) {
            btnLoginTrigger.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> Client Log In';
            btnLoginTrigger.classList.remove('logged-in');
            btnLoginTrigger.classList.remove('btn-primary');
            btnLoginTrigger.classList.add('btn-secondary');
        }
    }

    // --------------------------------------------------------
    // Observe Real Supabase Session State Changes
    // --------------------------------------------------------
    if (supabaseClient) {
        supabaseClient.auth.onAuthStateChange((event, session) => {
            if (session && session.user) {
                // User logged in live
                simulateLogin(session.user.email, session);
            } else {
                // User logged out live
                simulateLogout();
            }
        });
    }
});
