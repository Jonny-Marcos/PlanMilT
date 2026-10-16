const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const styles = fs.readFileSync(path.join(__dirname, '../../css/app.css'), 'utf8');

test('freehand and tactical toolbar icons have balanced size and orientation', () => {
    assert.match(styles, /\.leaflet-control-freehand i\s*\{[^}]*font-size:\s*20px/);
    assert.match(styles, /\.leaflet-control-tactical-graphic i\s*\{[^}]*font-size:\s*20px/);
    assert.match(styles, /\.leaflet-control-tactical-graphic i\s*\{[^}]*transform:\s*rotate\(-8deg\)/);
});
