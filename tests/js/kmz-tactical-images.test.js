const assert = require('node:assert/strict');
const test = require('node:test');

global.window = { PlanMilT: {} };
require('../../js/features/kmz-tactical-images.js');

function harness(scale = 100) {
    const canvases = [];
    global.document = {
        createElement(tag) {
            if (tag === 'div') return {
                set innerHTML(value) { this.textContent = value.replace(/&amp;/g, '&').replace(/<[^>]*>/g, ''); }
            };
            const calls = [];
            const context = {
                measureText: text => ({ width: text.length * 7 }),
                translate: (...args) => calls.push(['translate', ...args]),
                setLineDash: values => calls.push(['dash', values]),
                beginPath() {}, closePath() {},
                moveTo: (...args) => calls.push(['move', ...args]),
                lineTo: (...args) => calls.push(['line', ...args]),
                arc: (...args) => calls.push(['arc', ...args]),
                stroke: () => calls.push(['stroke']),
                fill: (...args) => calls.push(['fill', ...args]),
                createPattern: (tile, repeat) => { calls.push(['pattern', tile, repeat]); return { tile, repeat }; },
                fillText: (...args) => calls.push(['text', ...args]),
                drawImage: (...args) => calls.push(['image', ...args.slice(1)])
            };
            const canvas = { width: 0, height: 0, calls, getContext: () => context,
                toBlob: callback => callback({ png: true }) };
            canvases.push(canvas);
            return canvas;
        }
    };
    const map = {
        getZoom: () => 12,
        project: ([lat, lng]) => ({ x: (lng + 180) * scale, y: (90 - lat) * scale }),
        unproject: ([x, y]) => ({ lng: x / scale - 180, lat: 90 - y / scale })
    };
    return { map, canvases };
}

test('boundary raster preserves line gaps, text offsets, colors and geographic bounds', async () => {
    const { map, canvases } = harness();
    const boundary = { type: 'Companhia', leftText: 'A', rightText: 'B', count: 2 };
    const features = [
        { properties: { role: 'graphic', color: '#123456', tacticalGraphic: { name: 'Boundary', boundary } },
            geometry: { type: 'LineString', coordinates: [[-50, -20], [-49, -20]] } },
        { properties: { role: 'boundaryLabel', text: '1 < Pel', color: '#123456', boundaryOffset: [0, -14],
            tacticalGraphic: { name: 'Boundary', boundary } },
            geometry: { type: 'Point', coordinates: [-49.5, -20] } }
    ];
    const layoutCalls = [];
    const images = await window.PlanMilT.kmzTacticalImages.render(features, map, (geometry, count) => {
        layoutCalls.push({ geometry, count });
        return { dashArray: '14 36 14 36' };
    });
    assert.equal(images.length, 2);
    assert.equal(layoutCalls[0].count, 2);
    assert.deepEqual(canvases[1].calls.find(call => call[0] === 'dash')[1], [14, 36, 14, 36]);
    assert.deepEqual(canvases[3].calls.find(call => call[0] === 'text').slice(0, 2), ['text', '1 < Pel']);
    assert.ok(images[0].bounds.west < -50 && images[0].bounds.east > -49);
    assert.ok(images[0].bounds.north > -20 && images[0].bounds.south < -20);
    assert.equal(canvases[2].calls.filter(call => call[0] === 'image').length, canvases[2].height);
});

test('ordinary tactical labels decode escaped text without interpreting it as markup', async () => {
    const { map, canvases } = harness();
    const feature = { properties: { role: 'label', text: '&lt;Texto&gt; &amp; apoio',
        tacticalGraphic: { name: 'Breach' } }, geometry: { type: 'Point', coordinates: [-50, -20] } };
    await window.PlanMilT.kmzTacticalImages.render([feature], map, () => {});
    assert.equal(canvases[1].calls.find(call => call[0] === 'text')[1], '<Texto> & apoio');
});

test('rasterizes dashed lines and polygon fill patterns', async () => {
    for (const pattern of ['patternX', 'patternSlash', 'patternDots']) {
        const { map, canvases } = harness();
        const features = [
            { properties: { color: '#123456', dashArray: '10, 10' },
                geometry: { type: 'LineString', coordinates: [[-50, -20], [-49, -20]] } },
            { properties: { color: '#123456', fillPattern: pattern },
                geometry: { type: 'Polygon', coordinates: [[[-50, -20], [-49, -20], [-49, -21], [-50, -20]]] } }
        ];
        const images = await window.PlanMilT.kmzTacticalImages.render(features, map, () => {});
        assert.equal(images.length, 2);
        assert.deepEqual(canvases[1].calls.find(call => call[0] === 'dash')[1], [10, 10]);
        const tile = canvases[3].calls.find(call => call[0] === 'pattern')[1];
        assert.equal(tile.calls.filter(call => call[0] === 'line').length, pattern === 'patternX' ? 2 : pattern === 'patternSlash' ? 1 : 0);
        if (pattern === 'patternDots') {
            assert.deepEqual(tile.calls.find(call => call[0] === 'arc').slice(0, 4), ['arc', 4, 4, 1.2]);
            assert.ok(tile.calls.some(call => call[0] === 'fill'));
        }
        assert.ok(canvases[3].calls.some(call => call[0] === 'fill' && call[1] === 'evenodd'));
    }
});

test('long tactical geometry is divided into bounded PNG tiles at the current scale', async () => {
    const { map, canvases } = harness(1000);
    const features = [{ properties: { tacticalGraphic: { name: 'Breach' } },
        geometry: { type: 'LineString', coordinates: [[-50, -20], [-47, -20]] } }];
    const images = await window.PlanMilT.kmzTacticalImages.render(features, map, () => {});
    assert.equal(images.length, 3);
    assert.ok(canvases.slice(1).every(canvas => canvas.width <= 1024 && canvas.height <= 1024));
    assert.equal(images[0].bounds.east, images[1].bounds.west);
});

test('keeps the initial zoom throughout rasterization even if the map zoom changes', async () => {
    const { map } = harness();
    let currentZoom = 12;
    map.getZoom = () => currentZoom;
    const project = map.project;
    const unproject = map.unproject;
    map.project = (point, zoom) => { assert.equal(zoom, 12); return project(point); };
    map.unproject = (point, zoom) => { assert.equal(zoom, 12); return unproject(point); };
    const feature = { properties: { role: 'graphic', tacticalGraphic: { name: 'Boundary', boundary: { count: 1 } } },
        geometry: { type: 'LineString', coordinates: [[-50, -20], [-49, -20]] } };
    await window.PlanMilT.kmzTacticalImages.render([feature, feature], map, (geometry, count, zoom) => {
        assert.equal(zoom, 12);
        currentZoom = 14;
        return { dashArray: '30 36 34 0' };
    });
});

test('exports all annotations of a boundary with 100 repetitions', async () => {
    const { map } = harness();
    const features = Array.from({ length: 300 }, (_, index) => ({
        properties: { role: index % 3 ? 'boundaryLabel' : 'boundaryMark', text: index % 3 ? 'Pel' : 'ooo',
            tacticalGraphic: { name: 'Boundary' }, boundaryOffset: [0, index % 3 ? 14 : 0] },
        geometry: { type: 'Point', coordinates: [-50 + index / 10000, -20] }
    }));
    const images = await window.PlanMilT.kmzTacticalImages.render(features, map, () => {});
    assert.equal(images.length, 300);
});

test('rejects antimeridian and excessive raster areas instead of silently omitting graphics', async () => {
    const { map } = harness(1000);
    const feature = coordinates => ({ properties: { tacticalGraphic: { name: 'Breach' } },
        geometry: { type: 'LineString', coordinates } });
    await assert.rejects(window.PlanMilT.kmzTacticalImages.render(
        [feature([[179, 0], [-179, 0]])], map, () => {}), /antimeridiano/);
    await assert.rejects(window.PlanMilT.kmzTacticalImages.render(
        [feature([[-50, -20], [-40, -10]])], map, () => {}), /Afaste o zoom/);
});

test('rasterizes all available tactical graphic geometries', async () => {
    const library = require('@zaes/tactical-graphics');
    require('../../js/features/tactical-graphics-catalog.js');
    const names = window.PlanMilT.tacticalGraphicsCatalog.buildSections(library)
        .slice(1).flatMap(section => section.graphics.map(graphic => graphic.name))
        .filter(name => name !== 'CoordinationPoint');
    const geometries = {
        Point: { type: 'Point', coordinates: [-50, -20] },
        LineString: { type: 'LineString', coordinates: [[-50, -20], [-49.99, -20.01]] },
        Polygon: { type: 'Polygon', coordinates: [[[-50, -20], [-49.99, -20], [-49.99, -20.01], [-50, -20]]] }
    };
    for (const name of names) {
        const { map } = harness();
        const base = { type: 'Feature', geometry: geometries[library.baseGeometryFor(name)],
            properties: { tacticalGraphic: { name, radius: 500 } } };
        const graphic = library.renderTacticalGraphic(base).graphic;
        const images = await window.PlanMilT.kmzTacticalImages.render([graphic], map,
            () => ({ dashArray: '10 36 10 0' }));
        assert.ok(images.length > 0, name);
    }
});
