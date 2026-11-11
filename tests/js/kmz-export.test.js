const assert = require('node:assert/strict');
const test = require('node:test');

global.window = {};
global.document = {
    createElement() {
        return {
            set innerHTML(value) {
                this.textContent = value.replace(/<[^>]*>/g, '');
            }
        };
    }
};
require('../../js/features/kmz-export.js');
require('../../js/features/geojson-serialization.js');

function createExporter(button = { addEventListener() {} }) {
    return window.PlanMilT.kmzExport.attach({
        map: {},
        drawnItems: {},
        layerRegistry: {},
        button,
        zipArchive: class {},
        sweetAlert: {},
        captureCanvas: async () => ({})
    });
}

test('GeoJSON features are serialized into KML point, line and polygon placemarks', () => {
    const exporter = createExporter();
    const kml = exporter.geojsontokml({
        type: 'FeatureCollection',
        features: [
            { type: 'Feature', properties: { name: 'Base' }, geometry: { type: 'Point', coordinates: [-50, -20] } },
            { type: 'Feature', properties: { name: 'Rota', color: '#123456' }, geometry: { type: 'LineString', coordinates: [[-50, -20], [-49, -21]] } },
            { type: 'Feature', properties: { name: 'Área', color: '#abcdef' }, geometry: { type: 'Polygon', coordinates: [[[-50, -20], [-49, -20], [-49, -21], [-50, -20]]] } }
        ]
    }, {
        documentName: 'PlanMilT',
        documentDescription: 'Teste'
    });

    assert.match(kml, /<name>PlanMilT<\/name>/);
    assert.match(kml, /<name>Base<\/name>/);
    assert.match(kml, /<coordinates>-50,-20<\/coordinates>/);
    assert.match(kml, /<name>Rota<\/name>/);
    assert.match(kml, /-50,-20 -49,-21/);
    assert.match(kml, /<name>Área<\/name>/);
    assert.match(kml, /<Polygon>/);
});

test('GeoJSON multi geometries are serialized into KML multigeometry placemarks', () => {
    const exporter = createExporter();
    const kml = exporter.geojsontokml({
        type: 'FeatureCollection',
        features: [
            {
                type: 'Feature',
                properties: { name: 'Eixo', color: '#112233' },
                geometry: {
                    type: 'MultiLineString',
                    coordinates: [
                        [[-50, -20], [-49.8, -20.2]],
                        [[-49.7, -20.25], [-49.6, -20.3]]
                    ]
                }
            },
            {
                type: 'Feature',
                properties: { name: 'Setor', color: '#445566' },
                geometry: {
                    type: 'MultiPolygon',
                    coordinates: [
                        [[[-50, -20], [-49.9, -20], [-49.9, -20.1], [-50, -20]]],
                        [[[-49.8, -20.2], [-49.7, -20.2], [-49.7, -20.3], [-49.8, -20.2]]]
                    ]
                }
            }
        ]
    }, {
        documentName: 'PlanMilT',
        documentDescription: 'Teste'
    });

    assert.match(kml, /<name>Eixo<\/name>/);
    assert.match(kml, /<name>Setor<\/name>/);
    assert.match(kml, /<MultiGeometry>/);
});

test('icon styles are included for icon features', () => {
    const exporter = createExporter();
    const kml = exporter.geojsontokml({
        type: 'FeatureCollection',
        features: [{
            type: 'Feature',
            properties: { iconUrl: 'symbols/friend/alpha.svg' },
            geometry: { type: 'Point', coordinates: [-50, -20] }
        }]
    }, { documentName: 'PlanMilT', documentDescription: '' });

    assert.match(kml, /files\/alpha\.png/);
    assert.match(kml, /<StyleMap id="m_files\/alpha\.png">/);
});

test('exports multiple embedded military symbols as distinct PNG files referenced by KML', async () => {
    let handler;
    let archive;
    let downloaded = false;
    const previousDocument = global.document;
    const previousCreate = URL.createObjectURL;
    const icons = ['data:image/svg+xml;utf8,%3Csvg%20id%3D%221%22%2F%3E', 'data:image/svg+xml;utf8,%3Csvg%20id%3D%222%22%2F%3E'];
    const features = icons.map(iconUrl => ({ type: 'Feature',
        properties: { iconUrl, militarySymbol: { iconSize: [100, 50], iconAnchor: [75, 20] } },
        geometry: { type: 'Point', coordinates: [-50, -20] } }));
    const group = children => ({ eachLayer(callback) { children.forEach(callback); }, toGeoJSON() {} });
    window.PlanMilT.coverageImage = { getGroup: () => group([]) };
    global.document = {
        createElement(tag) {
            if (tag === 'img') return { width: 80, height: 40, set src(value) { this.url = value; queueMicrotask(() => this.onload()); } };
            if (tag === 'canvas') return { getContext: () => ({ drawImage() {} }), toBlob(callback) { callback({ png: true }); } };
            return { click() { downloaded = true; }, set innerHTML(value) { this.textContent = value; } };
        }
    };
    URL.createObjectURL = () => 'blob:test';
    try {
        window.PlanMilT.kmzExport.attach({
            map: {}, drawnItems: group(features.map(feature => ({ toGeoJSON: () => feature }))), layerRegistry: {},
            button: { addEventListener(name, callback) { handler = callback; } },
            zipArchive: class {
                constructor() { archive = this; this.files = {}; }
                file(name, data) { this.files[name] = data; }
                async generateAsync() { return {}; }
            },
            sweetAlert: { fire: async () => ({ isConfirmed: false }) },
            captureCanvas: () => { throw new Error('unexpected capture'); }
        });
        await handler();
        assert.equal(downloaded, true);
        assert.ok(archive.files['files/planmilt-symbol-1.png']);
        assert.ok(archive.files['files/planmilt-symbol-2.png']);
        assert.match(archive.files['doc.kml'], /#m_files\/planmilt-symbol-1\.png/);
        assert.match(archive.files['doc.kml'], /#m_files\/planmilt-symbol-2\.png/);
        assert.match(archive.files['doc.kml'], /<hotSpot x="0\.75" y="0\.6"/);
        assert.doesNotMatch(archive.files['doc.kml'], /data:image/);
    } finally {
        global.document = previousDocument;
        URL.createObjectURL = previousCreate;
    }
});

test('KMZ export reports failure instead of downloading when a generated symbol cannot be converted', async () => {
    let handler;
    let downloaded = false;
    const alerts = [];
    const previousDocument = global.document;
    const feature = { type: 'Feature', properties: { iconUrl: 'data:image/svg+xml,bad' }, geometry: { type: 'Point', coordinates: [0, 0] } };
    const group = children => ({ eachLayer(callback) { children.forEach(callback); }, toGeoJSON() {} });
    window.PlanMilT.coverageImage = { getGroup: () => group([]) };
    global.document = { createElement(tag) {
        if (tag === 'img') return { set src(value) { queueMicrotask(() => this.onerror(new Error('invalid image'))); } };
        return { click() { downloaded = true; }, set innerHTML(value) { this.textContent = value; } };
    } };
    const oldError = console.error;
    console.error = () => {};
    try {
        window.PlanMilT.kmzExport.attach({
            map: {}, drawnItems: group([{ toGeoJSON: () => feature }]), layerRegistry: {},
            button: { addEventListener(name, callback) { handler = callback; } },
            zipArchive: class { file() {} async generateAsync() { throw new Error('must not generate'); } },
            sweetAlert: { fire: async (...args) => { alerts.push(args); return { isConfirmed: false }; } },
            captureCanvas: () => {}
        });
        await handler();
        assert.equal(downloaded, false);
        assert.match(alerts.at(-1)[1], /Não foi possível preparar/);
    } finally {
        global.document = previousDocument;
        console.error = oldError;
    }
});

test('attach registers the export button handler and exposes the converter', () => {
    let registeredHandler;
    const exporter = createExporter({
        addEventListener(eventName, handler) {
            assert.equal(eventName, 'click');
            registeredHandler = handler;
        }
    });
    assert.equal(typeof registeredHandler, 'function');
    assert.equal(typeof exporter.geojsontokml, 'function');
});

test('exports multiple raster-only coverages as PNG GroundOverlays without optional map capture', async () => {
        let handler;
        let archive;
        let clicked = false;
        const previousDocument = global.document;
        const previousCreate = URL.createObjectURL;
        const feature = (image, bounds) => ({ type: 'Feature', geometry: null, properties: { coverageImage: {
            image, mapImage: 'data:image/png;base64,Aw==', bounds, resolutionKm: 0.5, mode: 'radio'
        } } });
        const images = [
            feature('data:image/png;base64,AQ==', [[-22, -52], [-21, -51]]),
            feature('data:image/png;base64,Ag==', [[-20, -50], [-19, -49]])
        ];
        const group = children => ({
            eachLayer(callback) { children.forEach(callback); },
            toGeoJSON() { throw new Error('não usar serialização recursiva'); }
        });
        window.PlanMilT.coverageImage = { getGroup: () => group(images.map(item => ({ toGeoJSON: () => item }))) };
        global.document = { createElement: () => ({ click() { clicked = true; } }) };
        URL.createObjectURL = () => 'blob:test';
        try {
            window.PlanMilT.kmzExport.attach({
                map: {}, drawnItems: group([]), layerRegistry: {},
                button: { addEventListener(name, callback) { handler = callback; } },
                zipArchive: class {
                    constructor() { archive = this; this.files = {}; }
                    file(name, data, options) { this.files[name] = { data, options }; }
                    async generateAsync() { return {}; }
                },
                sweetAlert: { fire: async () => ({ isConfirmed: false }) },
                captureCanvas: () => { throw new Error('captura não deve ser usada'); }
            });
            await handler();
            assert.equal(clicked, true);
            assert.deepEqual(archive.files['coverage/coverage-1.png'], { data: 'AQ==', options: { base64: true } });
            assert.equal(archive.files['coverage/coverage-2.png'].data, 'Ag==');
            const kml = archive.files['doc.kml'].data;
            assert.equal((kml.match(/<GroundOverlay>/g) || []).length, 2);
            assert.match(kml, /<south>-22<\/south><east>-51<\/east><west>-52<\/west>/);
            assert.match(kml, /planmilt-coverage/);
            assert.match(kml, /sensibilidade/);
        } finally {
            global.document = previousDocument;
            URL.createObjectURL = previousCreate;
        }
});