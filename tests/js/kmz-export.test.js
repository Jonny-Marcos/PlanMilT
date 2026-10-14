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