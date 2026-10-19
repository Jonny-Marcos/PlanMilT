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
        'id="searchForm"',
        'id="searchField"',
        'id="searchMode"',
        'id="elevationFilesInput"',
        'id="uploadElevationButton"',
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

test('admin search supports field/match filters and elevation upload uses authenticated multipart', () => {
    assert.match(endpoint, /searchFieldsByEntity/);
    assert.match(endpoint, /filters: currentSearch/);
    assert.match(endpoint, /action', 'upload_files'/);
    assert.match(endpoint, /credentials: 'same-origin'/);
    assert.match(endpoint, /move_uploaded_file\(/);
    assert.match(endpoint, /validateElevationUpload\(/);
});
