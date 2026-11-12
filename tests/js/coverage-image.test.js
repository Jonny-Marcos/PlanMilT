const assert = require('node:assert/strict');
const test = require('node:test');

global.window = {};
require('../../js/features/coverage-image.js');
require('../../js/features/geojson-serialization.js');

const coverage = window.PlanMilT.coverageImage;
const turf = {
    destination([lng, lat], distance, bearing) {
        const angle = bearing * Math.PI / 180;
        let longitude = lng + distance * Math.sin(angle) / 111;
        if (longitude > 180) longitude -= 360;
        if (longitude < -180) longitude += 360;
        return { geometry: { coordinates: [longitude, lat + distance * Math.cos(angle) / 111] } };
    }
};

function fakeDocument() {
    const canvases = [];
    return {
        canvases,
        createElement() {
            const calls = [];
            const context = {
                calls,
                beginPath() {}, closePath() {}, moveTo(...p) { calls.push(['move', ...p]); },
                lineTo(...p) { calls.push(['line', ...p]); },
                fill() { calls.push(['fill', this.fillStyle, this.globalAlpha]); },
                drawImage(...args) { calls.push(['drawImage', ...args]); }
            };
            const canvas = { width: 0, height: 0, getContext: () => context, toDataURL: () => 'data:image/png;base64,AA==' };
            canvases.push(canvas);
            return canvas;
        }
    };
}

test('adaptive sampling caps a 100 km coverage at 36,180 points by default and never exceeds its radius', () => {
    const { radialCount, steps, resolutionKm } = coverage.resolution(100);
    assert.equal(radialCount, 180);
    assert.equal(steps, 200);
    assert.equal(radialCount * (steps + 1), 36180);
    assert.equal(resolutionKm, 0.5);
    assert.equal(steps * resolutionKm, 100);
    assert.deepEqual(coverage.resolution(1), { radialCount: 180, steps: 20, resolutionKm: 0.05 });
    for (const [count, points] of [[72, 14472], [180, 36180], [360, 72360]]) {
        const result = coverage.resolution(100, count);
        assert.equal(result.radialCount, count);
        assert.equal(result.radialCount * (result.steps + 1), points);
        assert.equal(result.resolutionKm, 0.5);
    }
    assert.throws(() => coverage.resolution(0), /raio/);
    assert.throws(() => coverage.resolution(100, 999), /resolução/);
});

test('radio legend colors match all sensitivity-margin thresholds', () => {
    assert.equal(coverage.signalColor(-65, -100), '#00ff00');
    assert.equal(coverage.signalColor(-75, -100), '#99ff33');
    assert.equal(coverage.signalColor(-85, -100), '#ffff00');
    assert.equal(coverage.signalColor(-95, -100), '#ff9900');
    assert.equal(coverage.signalColor(-96, -100), '#ff0000');
});

test('raster draws transparent colored cells and reprojects geographic rows for Leaflet', () => {
    const document = fakeDocument();
    const raster = coverage.createRaster({ center: { lat: 60, lng: 0 }, radius: 100, turf, document });
    raster.draw([[0, 60], [0.2, 60.2], [0.3, 60.1]], '#ff9900', 0.6);
    const result = raster.finish();
    assert.deepEqual(document.canvases[0].getContext().calls.at(-1), ['fill', '#ff9900', 0.6]);
    assert.equal(result.image, 'data:image/png;base64,AA==');
    assert.equal(result.mapImage, result.image);
    assert.equal(result.count, 1);
    assert.equal(document.canvases[0].width, 1024);
    const rows = document.canvases[1].getContext().calls;
    assert.equal(rows.length, 1024);
    assert.notEqual(rows[512][3], 512, 'latitude deve ser convertida para Mercator');
    assert.ok(result.bounds[0][0] < 60 && result.bounds[1][0] > 60);
});

test('rejects antimeridian and unsupported latitude instead of misplacing imagery', () => {
    const document = fakeDocument();
    assert.throws(() => coverage.createRaster({ center: { lat: 0, lng: 179.9 }, radius: 100, turf, document }), /antimeridiano/);
    assert.throws(() => coverage.createRaster({ center: { lat: 84.9, lng: 0 }, radius: 100, turf, document }), /latitude/);
    assert.throws(() => coverage.projectGeographic({ width: 10000, height: 10000 }, [[-22, -52], [-21, -51]], document), /Dimensões/);
    assert.throws(() => coverage.projectGeographic({ width: 1024, height: 1024 }, [[-22, 179], [-21, -179]], document), /limites/);
});

test('real Turf coordinates preserve local 100 km bounds and reject a crossing', () => {
    const realTurf = require('../../js/library/turf.min.js');
    const document = fakeDocument();
    const raster = coverage.createRaster({ center: { lat: -21.57, lng: -51.25 }, radius: 100, turf: realTurf, document });
    assert.ok(raster.bounds[0][0] < -22 && raster.bounds[1][0] > -21);
    assert.ok(raster.bounds[0][1] < -52 && raster.bounds[1][1] > -51);
    assert.throws(() => coverage.createRaster({ center: { lat: 0, lng: 179.9 }, radius: 100, turf: realTurf, document }), /antimeridiano/);
});

test('editable image overlays omit removal controls while retaining power and optical resolution', () => {
    const layers = [];
    const group = {
        addTo() { return this; },
        addLayer(layer) { layers.push(layer); },
        removeLayer(layer) { const i = layers.indexOf(layer); if (i !== -1) layers.splice(i, 1); },
        clearLayers() { layers.length = 0; },
        eachLayer(callback) { layers.forEach(callback); },
        toGeoJSON() { throw new Error('serialização iterativa necessária'); }
    };
    const leaflet = {
        featureGroup: () => group,
        imageOverlay(image, bounds, options) {
            return { image, bounds, options, bindPopup(html) { this.popup = html; }, setPopupContent(html) { this.popup = html; }, isPopupOpen() { return false; }, openPopup() {}, on(name, callback) { this[name] = callback; } };
        }
    };
    coverage.attach({ hasLayer: () => true }, leaflet, { addOverlay(actual) { assert.equal(actual, group); } });
    const feature = { type: 'Feature', geometry: null, properties: { coverageImage: {
        image: 'data:image/png;base64,AA==', mapImage: 'data:image/png;base64,AQ==',
        bounds: [[-22, -52], [-21, -51]], mode: 'radio', resolutionKm: 0.5
    } } };
    const layer = coverage.add(feature, leaflet);
    assert.doesNotMatch(layer.popup, /sensibilidade|verde|amarelo|vermelho/i);
    layer.click({ latlng: { lat: -21.5, lng: -51.5 } });
    assert.match(layer.popup, /execute a predição novamente/);
    assert.doesNotMatch(layer.popup, /Resolução radial/);
    assert.doesNotMatch(layer.popup, /Remover cobertura|data-coverage-remove/);
    assert.equal(layer.image, feature.properties.coverageImage.mapImage);
    assert.deepEqual(window.PlanMilT.geoJsonSerialization.toFeatureCollection(group).features, [feature]);
    coverage.remove(layer);
    assert.equal(layers.length, 0);
    const optical = coverage.add({
        ...feature,
        properties: { coverageImage: { ...feature.properties.coverageImage, mode: 'optical' } }
    }, leaflet);
    assert.doesNotMatch(optical.popup, /amarelo|visada|Remover cobertura/i);
    assert.match(optical.popup, /0\.500 km/);
    assert.throws(() => coverage.fromFeature({ properties: { coverageImage: {} } }, leaflet), /inválida/);
});

test('RF click returns sampled power by geographic position and survives JSON serialization', () => {
    const realTurf = require('../../js/library/turf.min.js');
    const center = { lat: -21.57, lng: -51.25 };
    const grid = coverage.createPowerSamples(center, 100, 32, 200);
    grid.set(0, 20, -86.125);
    grid.set(8, 100, -103.43);
    grid.set(31, 200, -77.51);
    const data = JSON.parse(JSON.stringify({
        image: 'data:image/png;base64,AA==', mapImage: 'data:image/png;base64,AQ==',
        bounds: [[-23, -53], [-20, -50]], mode: 'radio', resolutionKm: 0.5, powerSamples: grid.serialize()
    }));
    const leaflet = { imageOverlay() {
        return { on(name, callback) { this[name] = callback; }, bindPopup(content) { this.popup = content; }, setPopupContent(content) { this.popup = content; }, openPopup() {} };
    } };
    const overlay = coverage.fromFeature({ properties: { coverageImage: data } }, leaflet);
    const click = (distance, bearing) => {
        const [lng, lat] = realTurf.destination([center.lng, center.lat], distance, bearing, { units: 'kilometers' }).geometry.coordinates;
        overlay.click({ latlng: { lat, lng } });
        return overlay.popup;
    };
    assert.match(click(10, 0), /-86\.13 dBm/);
    assert.doesNotMatch(overlay.popup, /Remover cobertura|data-coverage-remove/);
    assert.match(click(50, 90), /-103\.43 dBm/);
    assert.match(click(99.9, 348.75), /-77\.51 dBm/);
    assert.match(click(25, 0), /Sem potência disponível/);
    assert.match(click(100.1, 0), /Sem potência disponível/);
    assert.doesNotMatch(click(10, 0), /Resolução radial/);
    assert.throws(() => coverage.fromFeature({ properties: { coverageImage: { ...data, powerSamples: { ...data.powerSamples, values: 'inválido' } } } }, leaflet), /inválidas/);
    assert.throws(() => coverage.fromFeature({ properties: { coverageImage: { ...data, powerSamples: null } } }, leaflet), /inválidas/);
    assert.throws(() => grid.set(0, 0, -30), /inválida/);
    assert.throws(() => coverage.createPowerSamples(center, 100, 999, 200), /inválida/);
});
