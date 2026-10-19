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
    assert.match(indexSource, /image-editor\.js\?v=20261019-editor-canvas-hit-testing/);
    assert.match(indexSource, /id="imageEditorDropHint"/);
    assert.match(indexSource, /id="imageEditorMode"/);
    assert.match(indexSource, /id="imageEditorModeLabel"/);
    assert.match(indexSource, /id="imageEditorHint"/);
    assert.match(indexSource, /id="imageEditorAdjustmentMenu"[^>]*hidden/);
    assert.match(indexSource, /id="imageEditorAdjustmentBack"[^>]*data-image-editor-back/);
    assert.match(indexSource, /Solte uma imagem aqui/);
    assert.doesNotMatch(fs.readFileSync(path.join(root, 'css/app.css'), 'utf8'),
        /#imageEditorCanvas\s*\{[^}]*z-index/s);
    assert.match(indexSource, /js\/library\/fabric\.min\.js/);
    assert.match(redirectSource, /url=index\.html\?abrir-criador-tema/);
    assert.doesNotMatch(fs.readFileSync(path.join(root, 'js/features/image-overlays.js'), 'utf8'),
        /href="criador-tema\.html"/);
});

test('theme editor initializes its map once and supports opening and closing in place', () => {
    class FakeElement {
        constructor() {
            this.listeners = {};
            this.id = '';
            this.dataset = {};
            this.hidden = true;
            this.offsetWidth = 800;
            this.offsetHeight = 600;
            this.clientWidth = 800;
            this.clientHeight = 600;
            this.style = {};
            this.files = [];
            this.attributes = {};
            this.classes = new Set();
            this.classList = {
                add: name => this.classes.add(name),
                remove: name => this.classes.delete(name),
                toggle: (name, force) => {
                    if (force) this.classes.add(name);
                    else this.classes.delete(name);
                }
            };
        }

        addEventListener(type, callback) {
            this.listeners[type] = callback;
        }

        click(type, event = { target: this }) {
            this.listeners[type](event);
        }

        setAttribute(name, value) {
            this.attributes[name] = value;
        }

        closest(selector) {
            if (selector === '[data-image-editor-action]' && this.dataset.imageEditorAction) return this;
            if (selector === '[data-image-editor-back]' &&
                (this.dataset.imageEditorBack !== undefined || this.id === 'imageEditorAdjustmentBack')) return this;
            if (selector === '#imageEditorOpenAdjustments' && this.id === 'imageEditorOpenAdjustments') return this;
            return null;
        }

        contains() {
            return false;
        }
    }

    const elements = new Map();
    const document = {
        getElementById(id) {
            if (!elements.has(id)) {
                const element = new FakeElement();
                element.id = id;
                elements.set(id, element);
            }
            return elements.get(id);
        }
    };
    let mapCreations = 0;
    let mapInvalidations = 0;
    const createInteraction = () => ({
        enabled: true,
        enable() { this.enabled = true; },
        disable() { this.enabled = false; }
    });
    const zoomControlElement = new FakeElement();
    const map = {
        setView(center, zoom) {
            this.initialCenter = center;
            this.initialZoom = zoom;
            return this;
        },
        invalidateSize() { mapInvalidations += 1; },
        addLayer() {},
        addControl(control) { control.onAdd(); },
        panBy() {},
        fitBounds() {},
        getBounds() { return {}; },
        dragging: createInteraction(),
        scrollWheelZoom: createInteraction(),
        doubleClickZoom: createInteraction(),
        boxZoom: createInteraction(),
        keyboard: createInteraction(),
        touchZoom: createInteraction()
    };
    map.zoomControl = { getContainer: () => zoomControlElement };
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
    const geocoderElement = new FakeElement();
    leaflet.Control.geocoder = () => ({
        on() { return this; },
        addTo() { return this; },
        getContainer() { return geocoderElement; }
    });

    let fabricCanvas;
    function FabricCanvas(element, options) {
        fabricCanvas = this;
        this.wrapperEl = { style: {} };
        this.upperCanvasEl = { style: {} };
        this.lowerCanvasEl = { style: {} };
        this.objects = [];
        this.width = options.width;
        this.height = options.height;
        this.selection = options.selection;
        this.setWidth = () => {};
        this.setHeight = () => {};
        this.setDimensions = dimensions => {
            this.width = dimensions.width;
            this.height = dimensions.height;
        };
        this.getObjects = () => this.objects;
        this.add = object => this.objects.push(object);
        this.clear = () => { this.objects = []; };
        this.setActiveObject = object => { this.activeObject = object; };
        this.getActiveObject = () => this.activeObject;
        this.discardActiveObject = () => { this.activeObject = null; };
        this.renderAll = () => {};
        this.calcOffset = () => {};
        this.requestRenderAll = () => {};
    }
    const fabric = {
        Object: { prototype: { set() {} } },
        Canvas: FabricCanvas,
        Image: {
            fromURL(url, callback) {
                callback({
                    type: 'image',
                    width: 1000,
                    height: 500,
                    set(properties) { Object.assign(this, properties); },
                    setCoords() {}
                });
            }
        }
    };
    class FakeFileReader {
        readAsDataURL() {
            this.onload({ target: { result: 'data:image/png;base64,AA==' } });
        }
    }
    const window = {
        PlanMilT: {},
        location: { search: '', href: 'https://example.test/' },
        history: { replaceState() {} },
        addEventListener() {},
        map: {
            getCenter: () => [12, 34],
            getZoom: () => 6,
            invalidateSize() {}
        }
    };
    vm.runInNewContext(editorSource, {
        document,
        window,
        L: leaflet,
        fabric,
        URLSearchParams,
        URL,
        FileReader: FakeFileReader,
        requestAnimationFrame: callback => callback()
    });

    const editor = document.getElementById('imageEditor');
    document.getElementById('imageEditorDropHint').hidden = false;
    window.PlanMilT.openImageEditor();
    assert.equal(editor.hidden, false);
    assert.equal(mapCreations, 1);
    assert.equal(map.dragging.enabled, false);
    assert.equal(fabricCanvas.wrapperEl.style.zIndex, '500');
    assert.equal(fabricCanvas.upperCanvasEl.style.pointerEvents, 'auto');
    assert.equal(fabricCanvas.upperCanvasEl.style.zIndex, '2');
    assert.equal(fabricCanvas.lowerCanvasEl.style.pointerEvents, 'none');
    assert.equal(fabricCanvas.lowerCanvasEl.style.zIndex, '1');
    assert.deepEqual(map.initialCenter, [12, 34]);
    assert.equal(map.initialZoom, 6);
    assert.equal(zoomControlElement.hidden, true);
    assert.equal(geocoderElement.hidden, true);
    const mainMenu = document.getElementById('imageEditorMainMenu');
    const adjustmentMenu = document.getElementById('imageEditorAdjustmentMenu');
    const openAdjustmentsButton = document.getElementById('imageEditorOpenAdjustments');
    assert.equal(mainMenu.hidden, false);
    assert.equal(adjustmentMenu.hidden, true);

    const file = { type: 'image/png' };
    editor.click('drop', {
        target: editor,
        preventDefault() {},
        dataTransfer: { files: [file] }
    });
    const image = fabricCanvas.getObjects()[0];
    assert.equal(document.getElementById('imageEditorDropHint').hidden, true);
    assert.equal(document.getElementById('imageEditorMap').style.width, undefined);
    assert.equal(map.dragging.enabled, false);
    assert.equal(image.left, 400);
    assert.equal(image.top, 300);
    assert.equal(image.scaleX, 0.64);
    assert.equal(image.lockUniScaling, false);
    assert.equal(image.lockRotation, false);
    assert.equal(image.selectable, true);
    assert.equal(image.evented, true);
    assert.equal(image.hasControls, true);
    assert.equal(image.lockScalingX, false);
    assert.equal(image.lockScalingY, false);
    assert.equal(image.lockMovementX, false);
    assert.equal(image.lockMovementY, false);
    assert.equal(fabricCanvas.activeObject, image);
    assert.equal(fabricCanvas.width, 800);
    assert.equal(fabricCanvas.height, 600);
    assert.equal(editor.classes.has('is-drop-target'), false);

    document.getElementById('imageEditorTools').click('click', {
        target: openAdjustmentsButton
    });
    assert.equal(mainMenu.hidden, true);
    assert.equal(adjustmentMenu.hidden, false);
    assert.equal(openAdjustmentsButton.attributes['aria-expanded'], 'true');

    document.getElementById('imageEditorTools').click('click', {
        target: document.getElementById('imageEditorAdjustmentBack')
    });
    assert.equal(mainMenu.hidden, false);
    assert.equal(adjustmentMenu.hidden, true);
    assert.equal(openAdjustmentsButton.attributes['aria-expanded'], 'false');

    document.getElementById('imageEditorMode').click('click');
    assert.equal(map.dragging.enabled, true);
    assert.equal(fabricCanvas.wrapperEl.style.pointerEvents, 'none');
    assert.equal(document.getElementById('imageEditorModeLabel').textContent, 'Posicionar imagem');
    assert.equal(zoomControlElement.hidden, false);
    assert.equal(geocoderElement.hidden, false);
    assert.match(document.getElementById('imageEditorHint').textContent, /volte a Posicionar imagem/);

    document.getElementById('imageEditorMode').click('click');
    assert.equal(map.dragging.enabled, false);
    assert.equal(fabricCanvas.wrapperEl.style.pointerEvents, 'auto');
    assert.equal(fabricCanvas.activeObject, image);
    assert.match(document.getElementById('imageEditorHint').textContent, /cantos para redimensionar ou esticar/);
    assert.match(document.getElementById('imageEditorHint').textContent, /alça superior para girar/);

    window.PlanMilT.openImageEditor();
    assert.equal(mapCreations, 1);
    assert.equal(mapInvalidations, 2);

    document.getElementById('closeImageEditor').click('click');
    assert.equal(editor.hidden, true);

    window.PlanMilT.openImageEditor();
    assert.equal(editor.hidden, false);
    assert.equal(mapCreations, 1);
});
