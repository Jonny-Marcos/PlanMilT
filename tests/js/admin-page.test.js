const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const endpoint = fs.readFileSync(
    path.join(__dirname, '../../php/endpoints/admin.php'),
    'utf8'
);

test('admin page retains its existing action hooks and uses semantic section landmarks', () => {
    [
        'id="loginPanel"',
        'id="passwordPanel"',
        'id="adminPanel"',
        'id="entitySelect"',
        'id="tableHead"',
        'id="tableBody"',
        'id="recordForm"',
        'id="refreshButton"',
        'id="logoutButton"',
        '<nav class="topbar"',
        '<header class="page-heading"',
        '<section id="adminPanel"'
    ].forEach(marker => assert.ok(endpoint.includes(marker), `Missing admin page hook/landmark: ${marker}`));
});

test('admin page styling is responsive, keyboard-visible and respects reduced-motion preferences', () => {
    assert.match(endpoint, /@media\(max-width:720px\)/);
    assert.match(endpoint, /@media\(max-width:520px\)/);
    assert.match(endpoint, /:focus-visible/);
    assert.match(endpoint, /prefers-reduced-motion:reduce/);
    assert.match(endpoint, /\.table-empty/);
});
