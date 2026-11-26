const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

global.window = global;
require('../../js/features/map-print.js');
const mp = window.PlanMilT.mapPrint;
const root = path.join(__dirname, '../..');
const MM = 96 / 25.4;

/** Mapa falso com projeção linear simples (1 grau = 256 * 2^zoom / 360 px). */
function fakeMap({ west = 0, north = 0, widthPx = 800, heightPx = 600, zoom = 10 } = {}) {
    const pxPerDegree = z => 256 * 2 ** z / 360;
    return {
        options: { crs: 'crs' },
        getBounds: () => ({
            getNorthWest: () => ({ lat: north, lng: west }),
            getSouthEast: () => ({ lat: north - heightPx / pxPerDegree(zoom), lng: west + widthPx / pxPerDegree(zoom) })
        }),
        project: (latlng, z) => ({ x: latlng.lng * pxPerDegree(z), y: -latlng.lat * pxPerDegree(z) }),
        unproject: (point, z) => ({ lat: -point.y / pxPerDegree(z), lng: point.x / pxPerDegree(z) })
    };
}

test('zoom e escala são inversos e as áreas por folha consideram margens e rodapé', () => {
    for (const scale of [5000, 50000, 250000]) {
        const zoom = mp.zoomForScale(scale, -21.5);
        assert.ok(Math.abs(mp.scaleForZoom(zoom, -21.5) - scale) < 1e-6);
    }
    assert.deepEqual(mp.getMapAreaMm('A4', 'portrait', false), { width: 190, height: 276 });
    assert.deepEqual(mp.getMapAreaMm('A0', 'portrait', false), { width: 821, height: 1168 });
    assert.deepEqual(mp.getMapAreaMm('A3', 'landscape', 8), { width: 400, height: 268 });
    assert.deepEqual(mp.getMapAreaMm('A4', 'portrait', 12, 10), { width: 190, height: 254 });
    assert.deepEqual(mp.getGroundSizeMeters(50000, { width: 190, height: 276 }), { width: 9500, height: 13800 });
});

test('a grade cobre todo o quadro com folhas contíguas, centralizada e ordenada', () => {
    const area = { width: 100, height: 100 };
    const map = fakeMap({ widthPx: 250 * MM, heightPx: 120 * MM });
    const grid = mp.computeGrid(map, 10, area);
    assert.equal(grid.columns, 3);
    assert.equal(grid.rows, 2);
    assert.deepEqual(grid.sheets.map(s => [s.row, s.column]), [[0, 0], [0, 1], [0, 2], [1, 0], [1, 1], [1, 2]]);
    const step = grid.sheets[1].center.lng - grid.sheets[0].center.lng;
    assert.ok(Math.abs(step - 100 * MM * 360 / (256 * 2 ** 10)) < 1e-9);
    const quadro = map.getBounds();
    const middle = (quadro.getNorthWest().lng + quadro.getSouthEast().lng) / 2;
    assert.ok(Math.abs(grid.sheets[1].center.lng - middle) < 1e-9);
    assert.equal(mp.computeGrid(fakeMap({ widthPx: 100 * MM, heightPx: 100 * MM }), 10, area).sheets.length, 1);
});

test('folhas sem desenhos ou ícones podem ser removidas sem perder a posição original', () => {
    const grid = {
        columns: 3,
        rows: 2,
        sheets: [
            { row: 0, column: 0 }, { row: 0, column: 1 }, { row: 0, column: 2 },
            { row: 1, column: 0 }, { row: 1, column: 1 }, { row: 1, column: 2 }
        ]
    };
    const filtered = mp.filterEmptySheets(grid, sheet => sheet.column !== 1);
    assert.deepEqual(filtered.sheets.map(sheet => [sheet.row, sheet.column, sheet.number]),
        [[0, 0, 1], [0, 2, 3], [1, 0, 4], [1, 2, 6]]);
    assert.deepEqual(filtered.emptyNumbers, [2, 5]);
    assert.equal(filtered.columns, 3);
    assert.equal(filtered.rows, 2);
});

test('a sobreposição repete uma faixa entre folhas vizinhas e mantém a grade centralizada', () => {
    const area = { width: 100, height: 100 };
    const map = fakeMap({ widthPx: 250 * MM, heightPx: 90 * MM });
    const plain = mp.computeGrid(map, 10, area, 0);
    const overlapped = mp.computeGrid(map, 10, area, 10);
    assert.equal(plain.columns, 3);
    assert.equal(overlapped.columns, 3);
    const degrees = mm => mm * MM * 360 / (256 * 2 ** 10);
    const step = overlapped.sheets[1].center.lng - overlapped.sheets[0].center.lng;
    assert.ok(Math.abs(step - degrees(90)) < 1e-9);
    const quadro = map.getBounds();
    const middle = (quadro.getNorthWest().lng + quadro.getSouthEast().lng) / 2;
    assert.ok(Math.abs(overlapped.sheets[1].center.lng - middle) < 1e-9);
    // 250 mm exigem 3 folhas sem sobreposição, mas 4 quando cada junta perde 10 mm.
    assert.equal(mp.computeGrid(fakeMap({ widthPx: 290 * MM, heightPx: 90 * MM }), 10, area, 0).columns, 3);
    assert.equal(mp.computeGrid(fakeMap({ widthPx: 290 * MM, heightPx: 90 * MM }), 10, area, 10).columns, 4);
});

test('textos opcionais só reservam espaço quando preenchidos e são limitados', () => {
    const ctx = { latitude: 0, currentZoom: 10, minZoom: 1, maxZoom: 28 };
    const base = { paper: 'A4', orientation: 'portrait', scaleChoice: 'current', footer: true };
    const plain = mp.resolveSettings(base, ctx).settings;
    assert.equal(plain.headerMm, 0);
    assert.equal(plain.footerMm, 8);
    assert.equal(plain.overlapMm, 0);
    const texts = mp.resolveSettings({ ...base, title: '  Ataque  ', footerText: 'x'.repeat(500), date: '25/11/2026', overlap: '5' }, ctx).settings;
    assert.equal(texts.text.title, 'Ataque');
    assert.equal(texts.text.footerText.length, 120);
    assert.equal(texts.headerMm, 10);
    assert.equal(texts.footerMm, 12);
    assert.equal(texts.areaMm.height, plain.areaMm.height - 10 - 4);
    assert.equal(mp.resolveSettings({ ...base, footer: false, footerText: 'oculto' }, ctx).settings.text.footerText, '');
    assert.ok(mp.resolveSettings({ ...base, overlap: '7' }, ctx).error);
    assert.match(mp.buildFooterText({ ...texts, grid: null }, null, new Date(2024, 0, 5)), /Data: 25\/11\/2026$/);
});

test('resolveSettings valida escala, folha, zoom e limite de folhas', () => {
    const ctx = { latitude: -21.5, currentZoom: 13, minZoom: 1, maxZoom: 28 };
    const ok = mp.resolveSettings({ paper: 'A3', orientation: 'landscape', scaleChoice: '50000', footer: true }, ctx);
    assert.equal(ok.settings.scale, 50000);
    assert.ok(ok.settings.zoom > 10 && ok.settings.zoom < 15);
    assert.ok(mp.resolveSettings({ paper: 'A3', orientation: 'portrait', scaleChoice: 'custom', customScale: '12' }, ctx).error.includes('entre'));
    assert.ok(mp.resolveSettings({ paper: 'A5', orientation: 'portrait', scaleChoice: '5000' }, ctx).error);
    assert.ok(mp.resolveSettings({ paper: 'A4', orientation: 'portrait', scaleChoice: '1000' }, { ...ctx, maxZoom: 10 }).error);
    const current = mp.resolveSettings({ paper: 'A4', orientation: 'portrait', scaleChoice: 'current', footer: false }, ctx);
    assert.equal(current.settings.approximate, true);
    const many = mp.resolveSettings({ paper: 'A4', orientation: 'portrait', scaleChoice: '5000', footer: true },
        { ...ctx, computeGrid: () => ({ sheets: new Array(25) }) });
    assert.match(many.error, /25 folhas/);
});

test('vizinhas de cada folha respeitam as bordas da grade', () => {
    const grid = { columns: 3, rows: 2 };
    assert.deepEqual(mp.getNeighbors(grid, { row: 0, column: 0 }), {
        top: null, bottom: 4, left: null, right: 2, topLeft: null, topRight: null, bottomLeft: null, bottomRight: 5
    });
    assert.deepEqual(mp.getNeighbors(grid, { row: 1, column: 1 }), {
        top: 2, bottom: null, left: 4, right: 6, topLeft: 1, topRight: 3, bottomLeft: null, bottomRight: null
    });
});

test('rodapé numera as folhas quando há mais de uma', () => {
    const grid = { columns: 2, rows: 2, sheets: [1, 2, 3, 4] };
    const base = { paper: 'A4', orientation: 'landscape', scale: 25000, approximate: false, grid };
    const date = new Date(2024, 0, 5);
    assert.equal(mp.buildFooterText(base, { row: 1, column: 0 }, date),
        'Escala 1:25.000 · Folha A4 paisagem · Folha 3 de 4 (linha 2, coluna 1) · Impresso em 05/01/2024');
    assert.equal(mp.buildFooterText({ ...base, grid: { columns: 1, rows: 1, sheets: [1] } }, { row: 0, column: 0 }, date),
        'Escala 1:25.000 · Folha A4 paisagem · Impresso em 05/01/2024');
});

/** DOM mínimo suficiente para a sobreposição de impressão. */
function fakeDom() {
    const make = () => {
        const el = {
            style: {}, children: [], listeners: {}, removed: false,
            appendChild(child) { this.children.push(child); return child; },
            append(...items) { items.forEach(item => this.children.push(item)); },
            remove() { this.removed = true; },
            addEventListener(name, fn) { this.listeners[name] = fn; }
        };
        return el;
    };
    const ids = {};
    return {
        head: make(), body: make(), ids,
        createElement: () => make(),
        getElementById: id => ids[id] || null
    };
}

test('imprime várias folhas com as camadas ativas, escala gráfica e limpeza posterior', async () => {
    const map = Object.assign(fakeMap({ widthPx: 250 * MM, heightPx: 120 * MM, zoom: 10 }), {
        getCenter: () => ({ lat: 0 }), getSize: () => ({ x: 800, y: 600 }),
        getZoom: () => 10, getMinZoom: () => 1, getMaxZoom: () => 28,
        getPanes: () => ({ tilePane: { style: {} }, customPane: { style: { zIndex: '650' } } }),
        _layers: {}
    });
    class Layer { constructor(kind) { this.kind = kind; } getTooltip() { return this.tip; } }
    class Popup extends Layer {}
    class Tooltip extends Layer {}
    class MetricGrid extends Layer {
        constructor(options) { super('grid'); this.options = options; }
        addTo(target) { target.added.push(this); return this; }
    }
    const utm = new MetricGrid({ color: '#800', minZoom: 4 });
    utm.options = Object.create({ weight: 2, minZoom: 4 });
    utm.options.color = '#800';
    const tile = new Layer('tile');
    const polygon = new Layer('polygon');
    polygon.tip = { getContent: () => 'Alvo', options: { permanent: true } };
    const group = new Layer('group');
    const boundary = new Layer('line');
    boundary.feature = { properties: { boundaryId: 'b1', tacticalGraphic: { name: 'Boundary', boundary: { count: 3 } } } };
    boundary.toGeoJSON = () => ({ geometry: { type: 'LineString', coordinates: [[0, 0], [1, 0]] } });
    map._layers = { 1: tile, 2: polygon, 3: group, 4: new Popup('popup'), 5: utm, 6: boundary };
    const layoutCalls = [];
    const sheetMaps = [];
    let scales = 0;
    const L = {
        Popup, Tooltip, MetricGrid,
        BrowserPrint: {
            Mode: { Portrait: (p, o) => ({ p, o }) },
            Utils: {
                initialize() {},
                getType: layer => (layer.kind === 'group' ? null : layer.kind),
                cloneLayer: layer => {
                    const clone = { kind: layer.kind, tooltips: [], addTo(target) { target.added.push(this); return this; },
                        bindTooltip(content) { this.tooltips.push(content); },
                        setStyle(style) { this.style = style; } };
                    return clone;
                }
            }
        },
        control: { browserPrint: options => ({ options, addTo() { return this; } }), scale: () => ({ addTo() { scales++; } }) },
        map: (el, options) => {
            const sheetMap = {
                el, options, added: [], panes: {}, removed: false,
                getPane(name) { return name === 'tilePane' ? {} : this.panes[name]; },
                createPane(name) { this.panes[name] = { style: {} }; return this.panes[name]; },
                setView(center, zoom) { this.view = { center, zoom }; },
                remove() { this.removed = true; }
            };
            sheetMaps.push(sheetMap);
            return sheetMap;
        }
    };
    const doc = fakeDom();
    const listeners = {};
    let printed = 0;
    const win = {
        addEventListener: (name, fn) => { listeners[name] = fn; },
        removeEventListener: name => { delete listeners[name]; },
        print() { printed++; }
    };
    const warnings = [];
    const api = mp.attach({
        map, leaflet: L, Swal: {}, doc, win, settleMs: 0,
        boundaryLayout: (geometry, count, zoom) => { layoutCalls.push([geometry.type, count, zoom]); return { dashArray: `z${zoom}` }; }
    });
    const settings = mp.resolveSettings({ paper: 'A4', orientation: 'portrait', scaleChoice: 'current', footer: true, overlap: '5' },
        { latitude: 0, currentZoom: 10, minZoom: 1, maxZoom: 28, computeGrid: (zoom, area, overlap) => mp.computeGrid(map, zoom, area, overlap) }).settings;
    await api.print(settings);

    assert.equal(sheetMaps.length, settings.grid.sheets.length);
    assert.ok(sheetMaps.length > 1);
    assert.equal(printed, 1);
    assert.equal(scales, sheetMaps.length);
    for (const [index, sheetMap] of sheetMaps.entries()) {
        assert.deepEqual(sheetMap.added.map(l => l.kind), ['tile', 'polygon', 'grid', 'line']);
        assert.notEqual(sheetMap.added[2], utm);
        assert.deepEqual(sheetMap.added[2].options, { color: '#800', weight: 2, minZoom: 4 });
        assert.deepEqual(sheetMap.added[1].tooltips, ['Alvo']);
        assert.equal(sheetMap.options.zoomSnap, 0);
        assert.equal(sheetMap.view.zoom, settings.zoom);
        assert.deepEqual(sheetMap.view.center, settings.grid.sheets[index].center);
        assert.equal(sheetMap.panes.customPane.style.zIndex, '650');
        assert.equal(sheetMap.el.style.width, '190mm');
    }
    // As lacunas do limite são recalculadas no zoom da folha, não copiadas do mapa da tela.
    assert.deepEqual(layoutCalls, sheetMaps.map(() => ['LineString', 3, settings.zoom]));
    assert.ok(sheetMaps.every(m => m.added[3].style.dashArray === `z${settings.zoom}`));
    const css = doc.head.children[0].textContent;
    assert.ok(css.includes('@page{size:A4 portrait;margin:0}'));
    assert.ok(css.includes('left:10mm;top:10mm'));
    assert.ok(css.includes('.map-print-map.leaflet-container{background:#fff}'));
    // Nenhuma marcação fica a menos de 4 mm do papel e todas ficam dentro da margem de 1 cm.
    const offsets = [...css.matchAll(/map-print-edge\.[A-Za-z]+\{[^}]*?(?:top|bottom|left|right):(\d+)mm/g)].map(m => Number(m[1]));
    assert.ok(offsets.length >= 8 && offsets.every(mm => mm >= 4 && mm <= 10));
    const overlay = doc.body.children[0];
    const sheets = overlay.children.filter(child => child.className === 'map-print-sheet');
    assert.equal(sheets.length, sheetMaps.length);
    assert.match(sheets[1].children[1].textContent, /Folha 2 de \d+ \(linha 1, coluna 2\)/);

    const index = overlay.children.find(child => child.className === 'map-print-sheet map-print-index');
    assert.ok(index && overlay.children.indexOf(index) < overlay.children.indexOf(sheets[0]));
    const table = index.children.find(child => child.children.length && child.children[0].children.length);
    assert.equal(table.children.length, settings.grid.rows);
    assert.equal(table.children[0].children.length, settings.grid.columns);
    assert.equal(table.children[0].children[1].textContent, '2');
    const marks = sheet => sheet.children.filter(child => child.className.startsWith('map-print-edge'));
    const first = marks(sheets[0]).map(m => [m.className, m.textContent]);
    assert.deepEqual(first.find(([c]) => c.includes('right')), ['map-print-edge right', '▶ Cole a folha 2 ▶']);
    assert.ok(!first.some(([c]) => c.includes(' left') || c.includes(' top')));
    assert.equal(settings.grid.rows, 1);
    assert.ok(!first.some(([c]) => c.includes('bottom')));

    const guides = sheet => sheet.children.filter(child => child.className.startsWith('map-print-overlap')).map(g => g.className);
    assert.deepEqual(guides(sheets[0]), ['map-print-overlap right']);
    assert.deepEqual(guides(sheets[1]).slice(0, 1), ['map-print-overlap left']);
    assert.ok(sheets[0].children.find(c => c.className.startsWith('map-print-overlap')).style.left === '195mm');

    listeners.afterprint();
    assert.ok(overlay.removed && sheetMaps.every(m => m.removed) && doc.head.children[0].removed);
    assert.equal(listeners.afterprint, undefined);
    assert.deepEqual(warnings, []);
});

test('controle de impressão usa o diálogo e o código antigo foi removido', async () => {
    const calls = [];
    const doc = fakeDom();
    const els = {};
    for (const id of ['mapPrintPaper', 'mapPrintOrientation', 'mapPrintScale', 'mapPrintCustomScale', 'mapPrintFooter', 'mapPrintSummary']) {
        els[id] = { addEventListener() {}, style: {} };
    }
    Object.assign(els.mapPrintPaper, { value: 'A4' });
    Object.assign(els.mapPrintOrientation, { value: 'portrait' });
    Object.assign(els.mapPrintScale, { value: '50000' });
    Object.assign(els.mapPrintFooter, { checked: false });
    doc.getElementById = id => els[id];
    const map = Object.assign(fakeMap({ widthPx: 600, heightPx: 400, zoom: 12 }), {
        getCenter: () => ({ lat: 0 }), getSize: () => ({ x: 600, y: 400 }),
        getZoom: () => 12, getMinZoom: () => 1, getMaxZoom: () => 28
    });
    const L = {
        BrowserPrint: { Mode: { Portrait: (p, o) => ({ p, o }) } },
        control: { browserPrint: options => { calls.push(options); return { addTo() { return this; } }; } }
    };
    let html;
    const Swal = {
        fire: async options => {
            html = options.html;
            options.didOpen();
            return { isConfirmed: false };
        }
    };
    const api = mp.attach({ map, leaflet: L, Swal, doc, win: {} });
    assert.equal(await api.open(), null);
    assert.ok(html.includes('Orientação') && html.includes('quantas folhas'));
    assert.match(els.mapPrintSummary.textContent, /1:50\.000 · \d+ folhas? \(/);
    assert.ok(calls[0].title.includes('Imprimir'));

    const popups = fs.readFileSync(path.join(root, 'js/features/map-popups.js'), 'utf8');
    assert.ok(!popups.includes('window.print()') && !popups.includes('zoomend'));
    assert.ok(!/leaflet-control-browser-print\s*\{\s*display:\s*none/.test(fs.readFileSync(path.join(root, 'css/app.css'), 'utf8')));
    const page = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    const at = name => page.indexOf('js/features/' + name + '.js');
    assert.ok(page.indexOf('leaflet.browser.print') < at('map-print') && at('map-print') < at('map-popups'));
});
