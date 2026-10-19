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
    assert.match(indexSource, /image-editor\.js\?v=20261019-edit-saved-themes/);
    assert.match(indexSource, /id="imageEditorLoadTheme"/);
    assert.match(indexSource, /image_editor_google_translate_element/);
    assert.match(fs.readFileSync(path.join(root, 'css/app.css'), 'utf8'),
        /body\.image-editor-alert-open \.swal2-container\s*\{\s*z-index: 11000 !important;/);
    assert.match(fs.readFileSync(path.join(root, 'js/features/main.js'), 'utf8'),
        /map\.addControl\(new TranslateControl\(\)\);\s*window\.googleTranslateElementInit\?\.\(\)/);
    assert.match(indexSource, /id="imageEditorDropHint"/);
    assert.match(indexSource, /id="imageEditorMode"/);
    assert.match(indexSource, /id="imageEditorModeLabel"/);
    assert.match(indexSource, /id="imageEditorHint"/);
    assert.match(indexSource, /id="imageEditorNavigation"[^>]*aria-label="Controles de navegação do mapa"/);
    assert.match(indexSource, /class="image-editor-navigation-title">Controle do mapa</);
    assert.match(indexSource, /data-image-editor-pan="up"/);
    assert.match(indexSource, /data-image-editor-zoom="in"/);
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

test('Google Translate initializes whichever map controls exist when its callback runs', () => {
    const callbackSource = indexSource.match(
        /<script type="text\/javascript">\s*(function googleTranslateElementInit[\s\S]*?)\s*<\/script>/
    )[1];
    const targets = new Map();
    const initializedTargets = [];
    const google = {
        translate: {
            TranslateElement: function (options, targetId) {
                initializedTargets.push({ options, targetId });
            }
        }
    };
    const window = { google };
    const document = {
        getElementById(id) {
            return targets.get(id) || null;
        }
    };
    const context = vm.createContext({ window, document, google });
    vm.runInContext(callbackSource, context);

    context.googleTranslateElementInit();
    targets.set('google_translate_element', { dataset: {} });
    targets.set('image_editor_google_translate_element', { dataset: {} });
    context.googleTranslateElementInit();
    context.googleTranslateElementInit();

    assert.deepEqual(initializedTargets.map(item => item.targetId), [
        'google_translate_element',
        'image_editor_google_translate_element'
    ]);
    assert.ok(initializedTargets.every(item => item.options.pageLanguage === 'pt-br'));
});

test('theme editor initializes its map once and supports opening and closing in place', async () => {
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
            return this.listeners[type](event);
        }

        setAttribute(name, value) {
            this.attributes[name] = value;
        }

        setPointerCapture(pointerId) {
            this.capturedPointer = pointerId;
        }

        hasPointerCapture(pointerId) {
            return this.capturedPointer === pointerId;
        }

        releasePointerCapture(pointerId) {
            if (this.capturedPointer === pointerId) this.capturedPointer = null;
        }

        closest(selector) {
            if (selector === 'input, textarea, select, [contenteditable="true"]' && this.editable) return this;
            if (selector === '[data-image-editor-action]' && this.dataset.imageEditorAction) return this;
            if (selector === '[data-image-editor-pan]' && this.dataset.imageEditorPan) return this;
            if (selector === '[data-image-editor-zoom]' && this.dataset.imageEditorZoom) return this;
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
        body: new FakeElement(),
        getElementById(id) {
            if (!elements.has(id)) {
                const element = new FakeElement();
                element.id = id;
                elements.set(id, element);
            }
            return elements.get(id);
        }
    };
    const alertCalls = [];
    let mapCreations = 0;
    let mapInvalidations = 0;
    let lastSavedFormData = null;
    const apiRequests = [];
    const alertResults = [];
    const mapPans = [];
    const mapZooms = [];
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
        panBy(offset) { mapPans.push(offset); },
        zoomIn() { mapZooms.push('in'); },
        zoomOut() { mapZooms.push('out'); },
        fitBounds(bounds, options) {
            this.fittedBounds = bounds;
            this.fitBoundsOptions = options;
        },
        latLngToContainerPoint(point) {
            return point[1] === 10 ? { x: 100, y: 50 } : { x: 700, y: 550 };
        },
        getBounds() {
            return {
                getNorthWest: () => ({ lat: 1, lng: 2 }),
                getSouthEast: () => ({ lat: 3, lng: 4 })
            };
        },
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
    geocoderElement.hidden = false;
    geocoderElement.style.display = '';
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
        this.remove = object => { this.objects = this.objects.filter(item => item !== object); };
        this.clear = () => { this.objects = []; };
        this.setActiveObject = object => { this.activeObject = object; };
        this.getActiveObject = () => this.activeObject;
        this.discardActiveObject = () => { this.activeObject = null; };
        this.renderAll = () => {};
        this.toDataURL = () => 'data:image/png;base64,AA==';
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
                    filters: [],
                    set(properties) { Object.assign(this, properties); },
                    applyFilters() { this.filterApplications = (this.filterApplications || 0) + 1; },
                    setCoords() {}
                });
            },
            filters: {
                Brightness: function (options) { Object.assign(this, { type: 'Brightness' }, options); },
                Contrast: function (options) { Object.assign(this, { type: 'Contrast' }, options); }
            }
        }
    };
    class FakeFormData {
        constructor() {
            this.values = {};
        }

        append(name, value) {
            this.values[name] = value;
        }
    }
    function Canvas2dFilterBackend() {}
    fabric.Canvas2dFilterBackend = Canvas2dFilterBackend;
    class FakeFileReader {
        readAsDataURL() {
            this.onload({ target: { result: 'data:image/png;base64,AA==' } });
        }
    }
    const window = {
        listeners: {},
        PlanMilT: {},
        translateCallbackCount: 0,
        location: { search: '', href: 'https://example.test/' },
        history: { replaceState() {} },
        googleTranslateElementInit() { this.translateCallbackCount += 1; },
        addEventListener(type, callback) { this.listeners[type] = callback; },
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
        Swal: {
            fire(options) {
                alertCalls.push(options);
                return Promise.resolve({ value: alertResults.length ? alertResults.shift() : null });
            }
        },
        FormData: FakeFormData,
        URLSearchParams,
        URL,
        FileReader: FakeFileReader,
        requestAnimationFrame: callback => callback()
    });

    const editor = document.getElementById('imageEditor');
    document.getElementById('imageEditorDropHint').hidden = false;
    window.PlanMilT.openImageEditor();
    window.PlanMilT.apiClient = {
        async request(endpoint, options = {}) {
            apiRequests.push({ endpoint, options });
            if (endpoint === 'image-load.php' && !options.body) {
                return {
                    ok: true,
                    async json() {
                        return { images: [{ id: 41, descricao: '<Tema & teste>' }] };
                    }
                };
            }
            if (endpoint === 'image-load.php') {
                const params = new URLSearchParams(options.body);
                if (!params.get('senha')) {
                    return {
                        ok: true,
                        async json() {
                            return { error: 'Senha incorreta ou não fornecida.' };
                        }
                    };
                }
                return {
                    ok: true,
                    async json() {
                        return {
                            url: 'data:image/png;base64,AA==',
                            bounds: [[50, 10], [0, 30]],
                            descricao: '<Tema & teste>',
                            compartilhavel: false
                        };
                    }
                };
            }
            if (endpoint === 'image-save.php') {
                lastSavedFormData = options.body;
                return {
                    ok: true,
                    async text() { return 'Imagem atualizada com sucesso!'; }
                };
            }
            throw new Error(`Unexpected endpoint: ${endpoint}`);
        }
    };
    assert.equal(editor.hidden, false);
    assert.equal(mapCreations, 1);
    assert.equal(window.translateCallbackCount, 1);
    assert.equal(map.dragging.enabled, false);
    assert.equal(fabricCanvas.wrapperEl.style.zIndex, '500');
    assert.equal(fabricCanvas.upperCanvasEl.style.pointerEvents, 'auto');
    assert.equal(fabricCanvas.upperCanvasEl.style.zIndex, '2');
    assert.equal(fabricCanvas.lowerCanvasEl.style.pointerEvents, 'none');
    assert.equal(fabricCanvas.lowerCanvasEl.style.zIndex, '1');
    assert.deepEqual(map.initialCenter, [12, 34]);
    assert.equal(map.initialZoom, 6);
    assert.equal(zoomControlElement.hidden, true);
    assert.equal(geocoderElement.hidden, false);
    assert.ok(fabric.filterBackend instanceof Canvas2dFilterBackend);
    const mainMenu = document.getElementById('imageEditorMainMenu');
    const adjustmentMenu = document.getElementById('imageEditorAdjustmentMenu');
    const openAdjustmentsButton = document.getElementById('imageEditorOpenAdjustments');
    assert.equal(mainMenu.hidden, false);
    assert.equal(adjustmentMenu.hidden, true);

    const navigation = document.getElementById('imageEditorNavigation');
    navigation.click('click', {
        target: Object.assign(new FakeElement(), { dataset: { imageEditorPan: 'left' } })
    });
    navigation.click('click', {
        target: Object.assign(new FakeElement(), { dataset: { imageEditorZoom: 'in' } })
    });
    navigation.click('click', {
        target: Object.assign(new FakeElement(), { dataset: { imageEditorZoom: 'out' } })
    });
    assert.equal(mapPans.length, 1);
    assert.deepEqual(Array.from(mapPans[0]), [-120, 0]);
    assert.deepEqual(mapZooms, ['in', 'out']);

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
    document.getElementById('imageEditorBrightness').click('input', {
        target: { value: '1.25' }
    });
    document.getElementById('imageEditorContrast').click('input', {
        target: { value: '1.2' }
    });
    assert.equal(image.filterApplications, 2);
    assert.equal(image.width, 1000);
    assert.equal(image.height, 500);
    document.getElementById('imageEditorTools').click('click', {
        target: Object.assign(new FakeElement(), { dataset: { imageEditorAction: 'save' } })
    });
    assert.equal(alertCalls[0].title, 'Salvar Imagem');
    assert.equal(document.body.classes.has('image-editor-alert-open'), true);
    document.getElementById('imageEditorBrightness').value = '1.25';
    document.getElementById('imageEditorContrast').value = '1.2';
    document.getElementById('imageEditorTools').click('click', {
        target: Object.assign(new FakeElement(), { dataset: { imageEditorAction: 'reset' } })
    });
    assert.equal(image.filters.length, 0);
    assert.equal(document.getElementById('imageEditorBrightness').value, '1');
    assert.equal(document.getElementById('imageEditorContrast').value, '1');
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

    alertResults.push('41', 'theme-secret');
    await document.getElementById('imageEditorLoadTheme').click('click');
    assert.match(alertCalls.find(call => call.title === 'Carregar tema para edição').html,
        /&lt;Tema &amp; teste&gt;/);
    const editRequests = apiRequests.filter(request =>
        request.endpoint === 'image-load.php' && request.options.body
    );
    assert.equal(new URLSearchParams(editRequests[0].options.body).get('modo'), 'edicao');
    assert.equal(new URLSearchParams(editRequests[0].options.body).get('senha'), null);
    assert.equal(new URLSearchParams(editRequests[1].options.body).get('senha'), 'theme-secret');
    assert.deepEqual(Array.from(map.fittedBounds), [[50, 10], [0, 30]]);
    const editedImage = fabricCanvas.getObjects()[0];
    assert.equal(editedImage.left, 100);
    assert.equal(editedImage.top, 50);
    assert.equal(editedImage.scaleX, 0.6);
    assert.equal(editedImage.scaleY, 1);

    alertResults.push({
        descricao: 'Tema renomeado',
        senha: 'new-secret',
        compartilhavel: false
    });
    await document.getElementById('imageEditorTools').click('click', {
        target: Object.assign(new FakeElement(), { dataset: { imageEditorAction: 'save' } })
    });
    assert.equal(lastSavedFormData.values.id, '41');
    assert.equal(lastSavedFormData.values.senha_atual, 'theme-secret');
    assert.equal(lastSavedFormData.values.senha, 'new-secret');
    assert.equal(lastSavedFormData.values.descricao, 'Tema renomeado');
    assert.equal(alertCalls.at(-1).text, 'Tema atualizado com sucesso!');
    alertResults.push({
        descricao: 'Tema renomeado novamente',
        senha: '',
        compartilhavel: false
    });
    await document.getElementById('imageEditorTools').click('click', {
        target: Object.assign(new FakeElement(), { dataset: { imageEditorAction: 'save' } })
    });
    assert.equal(lastSavedFormData.values.senha_atual, 'new-secret');
    assert.equal(lastSavedFormData.values.senha, '');
    assert.equal(lastSavedFormData.values.descricao, 'Tema renomeado novamente');

    window.PlanMilT.openImageEditor();
    assert.equal(mapCreations, 1);
    assert.equal(mapInvalidations, 3);

    document.getElementById('closeImageEditor').click('click');
    assert.equal(editor.hidden, true);

    window.PlanMilT.openImageEditor();
    assert.equal(editor.hidden, false);
    assert.equal(mapCreations, 1);
});
