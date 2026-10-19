const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const root = path.join(__dirname, '../..');
const indexSource = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const redirectSource = fs.readFileSync(path.join(root, 'criador-tema.html'), 'utf8');
const editorSource = fs.readFileSync(path.join(root, 'js/features/image-editor.js'), 'utf8');

test('theme editor is embedded in index and the former page redirects to it', () => {
    assert.match(indexSource, /id="imageEditor"[^>]*hidden/);
    assert.match(indexSource, /image-editor\.js\?v=20261019-integrated-editor/);
    assert.match(indexSource, /js\/library\/fabric\.min\.js/);
    assert.match(redirectSource, /url=index\.html\?abrir-criador-tema/);
    assert.doesNotMatch(fs.readFileSync(path.join(root, 'js/features/image-overlays.js'), 'utf8'),
        /href="criador-tema\.html"/);
});

test('theme editor initializes its map once and supports opening and closing in place', () => {
    class FakeElement {
        constructor() {
            this.listeners = {};
            this.dataset = {};
            this.hidden = true;
            this.offsetWidth = 800;
            this.offsetHeight = 600;
            this.style = {};
            this.files = [];
        }

        addEventListener(type, callback) {
            this.listeners[type] = callback;
        }

        click(type, event = { target: this }) {
            this.listeners[type](event);
        }
    }

    const elements = new Map();
    const document = {
        getElementById(id) {
            if (!elements.has(id)) elements.set(id, new FakeElement());
            return elements.get(id);
        }
    };
    let mapCreations = 0;
    let mapInvalidations = 0;
    const map = {
        setView() { return this; },
        invalidateSize() { mapInvalidations += 1; },
        addLayer() {},
        addControl(control) { control.onAdd(); },
        panBy() {},
        fitBounds() {},
        getBounds() { return {}; }
    };
    function Control() {}
    Control.extend = options => function () {
        this.onAdd = options.onAdd;
    };
    Control.prototype.addTo = function () {
        this.onAdd(map);
        return this;
    };

    const leaflet = {
        map() {
            mapCreations += 1;
            return map;
        },
        tileLayer() { return { addTo() {} }; },
        Control,
        DomUtil: {
            get: id => document.getElementById(id),
            create: () => new FakeElement()
        },
        DomEvent: { disableClickPropagation() {} },
        layerGroup() { return { addLayer() {} }; },
        utmGrid() { return {}; },
        CRS: { EPSG4326: {} },
        control: {
            layers() { return { addTo() {} }; }
        }
    };
    leaflet.tileLayer.wms = () => ({});
    leaflet.Control.geocoder = () => ({
        on() { return this; },
        addTo() { return this; }
    });

    function FabricCanvas() {
        this.wrapperEl = { style: {} };
        this.setWidth = () => {};
        this.setHeight = () => {};
    }
    const fabric = {
        Object: { prototype: { set() {} } },
        Canvas: FabricCanvas
    };
    const window = {
        PlanMilT: {},
        location: { search: '', href: 'https://example.test/' },
        history: { replaceState() {} }
    };
    vm.runInNewContext(editorSource, {
        document,
        window,
        L: leaflet,
        fabric,
        URLSearchParams,
        URL,
        requestAnimationFrame: callback => callback()
    });

    const editor = document.getElementById('imageEditor');
    window.PlanMilT.openImageEditor();
    assert.equal(editor.hidden, false);
    assert.equal(mapCreations, 1);

    window.PlanMilT.openImageEditor();
    assert.equal(mapCreations, 1);
    assert.equal(mapInvalidations, 2);

    document.getElementById('closeImageEditor').click('click');
    assert.equal(editor.hidden, true);

    window.PlanMilT.openImageEditor();
    assert.equal(editor.hidden, false);
    assert.equal(mapCreations, 1);
});
