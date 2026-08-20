// Bundles the multi-file CRM into ONE self-contained HTML file for
// sharing (Artifact / any static host). Inlines CSS + JS, drops the
// Font Awesome dependency (replaced with clean minimal styling), and
// keeps only Google Fonts (the one external allowed in Artifacts).
// Run:  node crm/build-demo.js   → writes crm/demo.artifact.html
const fs = require('fs');
const path = require('path');
const R = (p) => fs.readFileSync(path.join(__dirname, p), 'utf8');

const configFile = process.argv[2] || 'js/config.js';   // e.g. js/config.demo.js
const css = R('css/dashboard.css');
const js = [configFile, 'js/seed.js', 'js/data.js', 'js/app.js'].map(R).join('\n\n');

// pull the body markup out of index.html, minus the <script>/<link> tags
let body = R('index.html').split('<body>')[1].split('</body>')[0];
body = body.replace(/\s*<script[^>]*><\/script>/g, '');

// no-Font-Awesome override: hide icon glyphs, keep layout clean
const override = `
/* ---- self-contained build: no Font Awesome ---- */
i[class*="fa-"]{display:none!important}
.kpi .ic,.radar .ic{display:none!important}
.tb-right .icon-btn{display:none}
.menu-toggle::before{content:"\\2630";font-size:1.15rem}
#drawerX::before{content:"\\2715";font-size:1rem}
.side-nav a{gap:2px}
.login-hint{opacity:.75}
`;

const out = `<link href="https://fonts.googleapis.com/css2?family=Oswald:wght@300..700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
<style>
${css}
${override}
</style>
${body}
<script>
${js}
</script>`;

fs.writeFileSync(path.join(__dirname, 'demo.artifact.html'), out);
console.log('Wrote demo.artifact.html (' + Math.round(out.length / 1024) + ' KB)');
