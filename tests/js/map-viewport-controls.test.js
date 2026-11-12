const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.join(__dirname, '../..');
const source = fs.readFileSync(path.join(root, 'js/features/map-tools.js'), 'utf8');
const main = fs.readFileSync(path.join(root, 'js/features/main.js'), 'utf8');
const styles = fs.readFileSync(path.join(root, 'css/app.css'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

function createControls(mobile) {
    function element() {
        return {
            style: {}, dataset: {}, attributes: {}, children: [],
            classList: {
                values: new Set(),
                toggle(name, enabled) { if (enabled) this.values.add(name); else this.values.delete(name); },
                remove(name) { this.values.delete(name); },
                contains(name) { return this.values.has(name); }
            },
            setAttribute(name, value) { this.attributes[name] = value; },
            addEventListener(name, callback) { this[name] = callback; },
            appendChild(child) { return this.insertBefore(child, null); },
            insertBefore(child, sibling) {
                if (child.parentNode) child.parentNode.children.splice(child.parentNode.children.indexOf(child), 1);
                const index = sibling ? this.children.indexOf(sibling) : this.children.length;
                this.children.splice(index, 0, child);
                child.parentNode = this;
                return child;
            },
            get nextSibling() {
                if (!this.parentNode) return null;
                return this.parentNode.children[this.parentNode.children.indexOf(this) + 1] || null;
            }
        };
    }
    const toolbar = element();
    const body = element();
    const drawToolbars = [element(), element()];
    const controls = [element(), element(), element(), element(), element(), element(), element()];
    const parent = element();
    parent.appendChild(controls[1]);
    const slot = element();
    const buttons = ['draw', 'layers', 'tools'].map(name => {
        const button = element();
        button.dataset.mobilePanel = name;
        return button;
    });
    toolbar.querySelector = selector => selector === '.mobile-layer-slot' ? slot : null;
    toolbar.querySelectorAll = () => buttons;
    const label = {};
    const icon = {};
    const button = element();
    const mobileToggle = element();
    mobileToggle.firstElementChild = {};
    const media = { matches: mobile, addEventListener(name, callback) { this[name] = callback; } };
    const byId = { toggleControlsBtn: button, toggleControlsLabel: label, toggleControlsIcon: icon, mobileToggleControls: mobileToggle };
    const bySelector = { '.map-toolbar': toolbar, '.leaflet-control-browser-print': controls[0],
        '.leaflet-control-layers': controls[1], '.google-translate-control': controls[5] };
    const document = {
        body,
        createComment: () => element(),
        addEventListener(name, callback) { this[name] = callback; },
        getElementById(id) { return byId[id]; },
        querySelector(selector) { return bySelector[selector]; },
        querySelectorAll() { return drawToolbars; }
    };
    const mapEvents = {};
    const context = {
        window: { matchMedia: () => media,
            PlanMilT: { geolocation: { attach() {} }, kmzExport: { attach() {} }, mapPointInfo: { attach() {} } } },
        document, map: { on(names, callback) { names.split(' ').forEach(name => { mapEvents[name] = callback; }); } },
        drawnItems: {}, layerRegistry: {}, L: { DomEvent: { disableScrollPropagation() {} } },
        JSZip: {}, Swal: {}, proj4() {}, html2canvas() {},
        freehandControl: { getContainer: () => controls[2] },
        tacticalGraphicsControl: { getContainer: () => controls[3] },
        tacticalGraphics: { getBoundaryLayout() {} },
        measureControl: { getContainer: () => controls[6] },
        measureToggleButton: controls[4]
    };
    vm.runInNewContext(source, context);
    return { toolbar, body, drawToolbars, controls, button, label, icon, mobileToggle, buttons, media, parent, slot, document, mapEvents };
}

test('desktop keeps its existing visibility toggle and restored controls', () => {
    const h = createControls(false);
    assert.equal(h.controls[1].parentNode, h.parent);
    assert.equal(h.toolbar.classList.contains('controls-hidden'), false);
    h.button.click();
    assert.equal(h.toolbar.classList.contains('controls-hidden'), true);
    assert.equal(h.controls[1].style.display, 'none');
    assert.equal(h.label.textContent, 'Mostrar controles');
    h.button.click();
    assert.equal(h.controls[1].style.display, 'block');
    assert.equal(h.button.attributes['aria-pressed'], 'false');
});

test('mobile panels open independently and reuse the Leaflet layer control', () => {
    const h = createControls(true);
    const [draw, layers, tools] = h.buttons;
    assert.equal(h.controls[1].parentNode, h.slot);
    assert.equal(h.toolbar.dataset.mobilePanel, '');
    assert.ok(h.buttons.every(button => button.attributes['aria-expanded'] === 'false'));
    assert.equal(h.controls[2].style.display, 'none');
    draw.click();
    assert.equal(h.toolbar.dataset.mobilePanel, 'draw');
    assert.equal(draw.attributes['aria-expanded'], 'true');
    assert.equal(h.controls[2].style.display, 'flex');
    assert.equal(h.body.classList.contains('mobile-map-draw'), true);
    layers.click();
    assert.equal(h.toolbar.dataset.mobilePanel, 'layers');
    assert.equal(h.controls[2].style.display, 'none');
    assert.equal(layers.attributes['aria-expanded'], 'true');
    tools.click();
    assert.equal(h.toolbar.dataset.mobilePanel, 'tools');
    assert.equal(h.controls[6].style.display, 'block');
    tools.click();
    assert.equal(h.toolbar.dataset.mobilePanel, '');
    assert.equal(h.controls[6].style.display, 'none');
});

test('active drawing and freehand controls remain accessible when their panel is closed', () => {
    const h = createControls(true);
    h.buttons[0].click();
    h.mapEvents['draw:drawstart']();
    assert.equal(h.toolbar.dataset.mobilePanel, '');
    h.buttons[1].click();
    assert.equal(h.body.classList.contains('mobile-map-draw'), true);
    h.mapEvents['draw:drawstop']();
    assert.equal(h.body.classList.contains('mobile-map-draw'), false);
    h.buttons[0].click();
    h.mapEvents['planmilt:freehand-mode']({ enabled: true });
    assert.equal(h.toolbar.dataset.mobilePanel, '');
    h.mobileToggle.click();
    assert.equal(h.controls[2].style.display, 'flex');
    h.mapEvents['planmilt:freehand-mode']({ enabled: false });
    assert.equal(h.controls[2].style.display, 'none');
});

test('hiding the mobile bar leaves a way back and restores desktop layout on resizing', () => {
    const h = createControls(false);
    h.button.click();
    h.media.matches = true;
    h.media.change();
    h.buttons[1].click();
    h.mobileToggle.click();
    assert.equal(h.toolbar.dataset.mobilePanel, '');
    assert.equal(h.toolbar.classList.contains('mobile-controls-hidden'), true);
    assert.equal(h.mobileToggle.attributes['aria-label'], 'Mostrar controles');
    h.mobileToggle.click();
    assert.equal(h.toolbar.classList.contains('mobile-controls-hidden'), false);
    assert.equal(h.mobileToggle.attributes['aria-label'], 'Ocultar controles');
    h.media.matches = false;
    h.media.change();
    assert.equal(h.controls[1].parentNode, h.parent);
    assert.equal(h.toolbar.classList.contains('controls-hidden'), true);
    assert.equal(h.controls[1].style.display, 'none');
});

test('keyboard activates toolbar and layer actions without triggering unrelated controls', () => {
    const h = createControls(true);
    let clicks = 0;
    let prevented = false;
    const target = { matches: selector => selector === '.toolbar-icon[role="button"]', click() { clicks++; } };
    h.document.keydown({ key: ' ', target, preventDefault() { prevented = true; } });
    h.document.keydown({ key: 'Enter', target, preventDefault() {} });
    h.document.keydown({ key: 'a', target, preventDefault() {} });
    assert.equal(clicks, 2);
    assert.equal(prevented, true);
});

test('mobile controls are compact, scrollable and cache-busted', () => {
    assert.match(styles, /#map\s*\{\s*width:\s*100%;\s*height:\s*100vh;\s*height:\s*100dvh;/);
    assert.match(styles, /mobile-map-ui:not\(\.mobile-map-draw\) \.leaflet-draw-toolbar\s*\{\s*display:\s*none !important/);
    assert.match(styles, /mobile-layer-slot\s*\{[^}]*overflow-y:\s*auto/);
    assert.match(main, /data-mobile-panel="draw"[\s\S]*data-mobile-panel="layers"[\s\S]*data-mobile-panel="tools"/);
    assert.match(main, /id="mobileToggleControls"[^>]*aria-label="Ocultar controles"/);
    for (const asset of ['css/app.css', 'js/features/main.js', 'js/features/map-tools.js', 'js/features/map-setup.js', 'js/features/freehand-drawing.js']) {
        assert.ok(html.includes(`${asset}?v=20261112-mobile-map`));
    }
});
