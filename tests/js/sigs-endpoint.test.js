const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const mapToolsSource = fs.readFileSync(path.join(__dirname, '../../js/features/map-tools.js'), 'utf8');

test('SIGs endpoint resolves relative to the published app directory', () => {
    const match = mapToolsSource.match(/apiClient\.getJson\(['"]([^'"]*sigs\.php)['"]\)/);
    assert.ok(match, 'map-tools must call the SIGs endpoint through apiClient');
    assert.equal(match[1], 'php/endpoints/sigs.php');

    const appBase = 'https://aescoladatatica.fun/GitHub/PlanMilT-dev/';
    assert.equal(
        new URL(match[1], appBase).href,
        'https://aescoladatatica.fun/GitHub/PlanMilT-dev/php/endpoints/sigs.php'
    );
});