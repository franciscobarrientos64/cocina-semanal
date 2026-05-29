const fs = require('fs');
const key = process.env.ANTHROPIC_API_KEY || '';
let html = fs.readFileSync('index.html', 'utf8');
html = html.replace('__ANTHROPIC_KEY_PLACEHOLDER__', key);
fs.writeFileSync('index.html', html);
console.log('Build complete. Key injected:', key.length > 0 ? 'YES' : 'NO - check env vars');
