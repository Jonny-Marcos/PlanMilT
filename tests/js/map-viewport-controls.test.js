const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.join(__dirname, '../..');
const source = fs.readFileSync(path.join(root, 'js/features/map-tools.js'), 'utf8');
const styles = fs.readFileSync(path.join(root, 'css/app.css'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

function createControls(width) {
    const element = () => ({ style: {} });
    const toolbar = element();
    const drawToolbars = [element(), element()];
    const controls = [element(), element(), element(), element(), element(), element()];
    const label = {};
    const icon = {};
    const button = {
        attributes: {},
        setAttribute(name, value) { this.attributes[name] = value; },
        addEventListener(name, callback) { this[name] = callback; }
    };
    const byId = {
        toggleControlsBtn: button,
        toggleControlsLabel: label,
        toggleControlsIcon: icon
    };
    const bySelector = {
        '.map-toolbar': toolbar,
        '.leaflet-control-browser-print': controls[0],
        '.leaflet-control-layers': controls[1],
        '.google-translate-control': controls[5]
    };
    const context = {
        window: {
            innerWidth: width,
            PlanMilT: { geolocation: { attach() {} }, kmzExport: { attach() {} } }
        },
        document: {
            getElementById(id) { return byId[id]; },
            querySelector(selector) { return bySelector[selector]; },
            querySelectorAll() { return drawToolbars; }
        },
        map: {}, drawnItems: {}, layerRegistry: {}, L: {}, JSZip: {}, Swal: {},
        html2canvas() {},
        freehandControl: { getContainer: () => controls[2] },
        tacticalGraphicsControl: { getContainer: () => controls[3] },
        measureToggleButton: controls[4]
    };
    vm.runInNewContext(source, context);
    return { toolbar, drawToolbars, controls, button, label, icon };
}

function assertState(fixture, hidden) {
    const { toolbar, drawToolbars, controls, button, label, icon } = fixture;
    assert.equal(toolbar.style.display, hidden ? 'none' : 'flex');
    for (const control of [...drawToolbars, ...controls]) {
        assert.equal(control.style.display, hidden ? 'none' : 'block');
    }
    const expectedLabel = hidden ? 'Mostrar controles' : 'Ocultar controles';
    assert.equal(label.textContent, expectedLabel);
    assert.equal(button.title, expectedLabel);
    assert.equal(button.attributes['aria-pressed'], String(hidden));
    assert.equal(icon.className, hidden ? 'fas fa-eye' : 'fas fa-eye-slash');
}

for (const [width, initiallyHidden] of [[600, true], [601, false]]) {
    test(`controls initialize and toggle accessibly at width ${width}`, () => {
        const fixture = createControls(width);
        assertState(fixture, initiallyHidden);
        fixture.button.click();
        assertState(fixture, !initiallyHidden);
        fixture.button.click();
        assertState(fixture, initiallyHidden);
    });
}

test('new draw toolbars are included when controls are toggled', () => {
    const fixture = createControls(601);
    const replacement = { style: {} };
    fixture.drawToolbars.splice(0, fixture.drawToolbars.length, replacement);
    fixture.button.click();
    assert.equal(replacement.style.display, 'none');
    fixture.button.click();
    assert.equal(replacement.style.display, 'block');
});

test('map fills the viewport without a minimum height and the button is available at all widths', () => {
    assert.match(styles, /body\s*\{\s*margin:\s*0\s*;/);
    assert.match(styles, /#map\s*\{\s*width:\s*100%;\s*height:\s*100vh;\s*height:\s*100dvh;/);
    assert.doesNotMatch(styles, /#map\s*\{[^}]*min-height:/);
    assert.match(styles, /\.toggle-controls\s*\{[^}]*display:\s*inline-flex;/);
    assert.match(styles, /\.toggle-controls:focus-visible\s*\{/);
    assert.match(html, /id="toggleControlsBtn"[^>]*type="button"[^>]*aria-pressed="true"/);
    assert.match(html, /css\/app\.css\?v=20261111-map-viewport-controls/);
    assert.match(html, /js\/features\/map-tools\.js\?v=20261111-map-viewport-controls/);
});
