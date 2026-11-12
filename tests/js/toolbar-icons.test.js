const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const styles = fs.readFileSync(path.join(__dirname, '../../css/app.css'), 'utf8');
const main = fs.readFileSync(path.join(__dirname, '../../js/features/main.js'), 'utf8');

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

test('mobile layer, translation, color and transparency controls stay compact', () => {
    const mobile = styles.match(/@media \(max-width: 600px\) \{\s*\/\* Ajustes no Mapa \*\/[\s\S]*?#map \.layer-transparency-control #transparencySlider \{[^}]*\}/);
    assert.ok(mobile);
    assert.match(mobile[0], /#map \.leaflet-control-layers-expanded \{[^}]*font-size:\s*10px/);
    assert.match(mobile[0], /#map \.google-translate-control \.goog-te-combo \{[^}]*width:\s*clamp\(/);
    assert.match(mobile[0], /#map \.google-translate-control \.goog-te-gadget a \{[^}]*display:\s*inline/);
    assert.match(mobile[0], /#map \.color-picker-label \.sp-preview \{[^}]*width:\s*18px/);
    assert.match(mobile[0], /#map \.map-toolbar #layerSelector \{[^}]*font-size:\s*10px/);
    assert.match(mobile[0], /#map \.layer-transparency-control #transparencySlider \{[^}]*width:\s*clamp\(/);
    assert.match(main, /class="toolbar-item layer-transparency-selection">\s*<select id="layerSelector">/);
    assert.match(main, /class="toolbar-item layer-transparency-control">[\s\S]*?id="transparencySlider"/);
});

test('toolbar keeps a single desktop row and two fixed compact rows without stretching transparency', () => {
    assert.match(styles, /#map \.map-toolbar\s*\{[^}]*width:\s*calc\(100vw - 20px\);[^}]*flex-wrap:\s*nowrap/s);
    assert.match(styles, /#map \.map-toolbar \.layer-transparency-control\s*\{[^}]*flex:\s*0 1 200px;[^}]*min-width:\s*0/s);
    const compact = styles.match(/@media \(max-width: 1200px\) \{[\s\S]*?\n            \}/);
    assert.ok(compact);
    assert.match(compact[0], /grid-template-columns:\s*max-content minmax\(0, 1fr\) minmax\(0, 1\.3fr\) max-content/);
    assert.match(compact[0], /\.toolbar-icons\s*\{[^}]*grid-column:\s*1 \/ 4;[^}]*grid-row:\s*1/s);
    assert.match(compact[0], /\.color-picker-label\s*\{[^}]*grid-column:\s*4;[^}]*grid-row:\s*1/s);
    assert.match(compact[0], /\.layer-transparency-control\s*\{[^}]*grid-column:\s*3 \/ 5/s);
    assert.match(compact[0], /#transparencySlider\s*\{\s*max-width:\s*120px/);
    assert.match(compact[0], /#iconSelectorToggle,[\s\S]*?font-size:\s*clamp\(/);
    assert.match(compact[0], /\.map-toolbar\.controls-hidden\s*\{\s*display:\s*flex/);
    assert.match(styles, /@media \(max-width: 900px\)[\s\S]*?label::after\s*\{\s*content:\s*"Transp\.";/);
    assert.match(styles, /@media \(min-width: 768px\) and \(max-width: 1200px\)[\s\S]*?#map \.map-toolbar\s*\{\s*display:\s*flex/);
});
