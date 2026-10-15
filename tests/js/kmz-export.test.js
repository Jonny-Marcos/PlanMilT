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