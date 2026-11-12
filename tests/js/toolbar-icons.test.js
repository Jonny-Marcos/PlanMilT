const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const styles = fs.readFileSync(path.join(__dirname, '../../css/app.css'), 'utf8');

test('freehand and tactical toolbar icons use the original size without rotation', () => {
    assert.match(styles, /\.leaflet-control-freehand i\s*\{[^}]*font-size:\s*29px/);
    assert.match(styles, /\.leaflet-control-tactical-graphic i\s*\{[^}]*font-size:\s*29px/);
    assert.doesNotMatch(styles, /\.leaflet-control-tactical-graphic i\s*\{[^}]*transform:/);
});

test('active automatic saving highlights the save icon with a green background', () => {
    assert.match(styles, /#saveDrawings\.auto-save-active[\s\S]*?\{[^}]*background-color:\s*#b7e4c7/);
});

test('mobile map controls shrink as the viewport narrows without affecting desktop styles', () => {
    const mobile = styles.match(/@media \(max-width: 600px\) \{\s*#map \{\s*--map-control-size:[\s\S]*?\n            \}/);
    assert.ok(mobile);
    const value = name => {
        const match = mobile[0].match(new RegExp(`--${name}:\\s*clamp\\((\\d+)px,\\s*calc\\((\\d+)px \\+ ([\\d.]+)vw\\),\\s*(\\d+)px\\)`));
        assert.ok(match, `${name} must scale with viewport width`);
        return width => Math.max(+match[1], Math.min(+match[4], +match[2] + +match[3] * width / 100));
    };
    for (const name of ['map-control-size', 'map-control-icon-size']) {
        const size = value(name);
        assert.ok(size(320) < size(390));
        assert.ok(size(390) < size(600));
    }
    assert.match(mobile[0], /#map \.leaflet-control-freehand i,[\s\S]*?#map \.leaflet-control-tactical-graphic i,[\s\S]*?font-size:\s*var\(--map-control-icon-size\)/);
    assert.match(mobile[0], /#map \.map-toolbar \.toolbar-icons i\s*\{\s*font-size:\s*clamp\(/);
    assert.doesNotMatch(mobile[0], /leaflet-marker-icon/);
});

test('mobile Leaflet Draw sprites remain aligned to their original cells', () => {
    const mobile = styles.match(/@media \(max-width: 600px\) \{\s*#map \{\s*--map-control-size:[\s\S]*?\n            \}/)[0];
    assert.match(mobile, /background-size:\s*1000% 100%/);
    const cells = [
        ['draw-polyline', 0], ['draw-polygon', 1], ['draw-rectangle', 2],
        ['draw-circle', 3], ['draw-marker', 4], ['edit-edit', 5],
        ['edit-remove', 6], ['edit-edit\\.leaflet-disabled', 7],
        ['edit-remove\\.leaflet-disabled', 8], ['draw-circlemarker', 9]
    ];
    for (const [name, cell] of cells) {
        const position = mobile.match(new RegExp(`\\.leaflet-draw-${name} \\{ background-position: ([\\d.]+)(%?) 0;`));
        assert.ok(position, `missing sprite position for ${name}`);
        const fraction = Number(position[1]) / (position[2] ? 100 : 1);
        assert.ok(Math.abs(9 * fraction - cell) < 0.000001, `${name} must use cell ${cell}`);
    }
    assert.match(mobile, /#map \.leaflet-draw-actions \{\s*left: calc\(var\(--map-control-size\) \+ 2px\)/);
});
