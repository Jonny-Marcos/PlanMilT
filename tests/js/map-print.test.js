const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

global.window = global;
require('../../js/features/map-print.js');
const mp = window.PlanMilT.mapPrint;
const root = path.join(__dirname, '../..');

test('zoom e escala são inversos e A4/A3 têm áreas corretas', () => {
    for (const scale of [5000, 50000, 250000]) {
        const zoom = mp.zoomForScale(scale, -21.5);
        assert.ok(Math.abs(mp.scaleForZoom(zoom, -21.5) - scale) < 1e-6);
    }
    assert.deepEqual(mp.getMapAreaMm('A4', 'portrait', false), { width: 190, height: 277 });
    assert.deepEqual(mp.getMapAreaMm('A3', 'landscape', false), { width: 400, height: 277 });
    assert.deepEqual(mp.getMapAreaMm('A4', 'portrait', true), { width: 190, height: 268 });
    assert.deepEqual(mp.getGroundSizeMeters(50000, { width: 190, height: 277 }), { width: 9500, height: 13850 });
});

test('resolveSettings valida escala, folha e zoom', () => {
    const ctx = { latitude: -21.5, currentZoom: 13, minZoom: 1, maxZoom: 28 };
    const ok = mp.resolveSettings({ paper: 'A3', orientation: 'landscape', scaleChoice: '50000', footer: true }, ctx);
    assert.equal(ok.settings.scale, 50000);
    assert.ok(ok.settings.zoom > 10 && ok.settings.zoom < 15);
    assert.ok(mp.resolveSettings({ paper: 'A3', orientation: 'portrait', scaleChoice: 'custom', customScale: '12' }, ctx).error.includes('entre'));
    assert.ok(mp.resolveSettings({ paper: 'A5', orientation: 'portrait', scaleChoice: '5000' }, ctx).error);
    const current = mp.resolveSettings({ paper: 'A4', orientation: 'portrait', scaleChoice: 'current', footer: false }, ctx);
    assert.equal(current.settings.approximate, true);
    assert.ok(mp.resolveSettings({ paper: 'A4', orientation: 'portrait', scaleChoice: '1000' }, { ...ctx, maxZoom: 10 }).error);
});

test('rodapé e modo do plugin refletem a configuração', () => {
    const { settings } = mp.resolveSettings({ paper: 'A4', orientation: 'landscape', scaleChoice: '25000', footer: true },
        { latitude: 0, currentZoom: 10, minZoom: 1, maxZoom: 28 });
    assert.equal(mp.buildFooterText(settings, new Date(2024, 0, 5)), 'Escala 1:25.000 · Folha A4 paisagem · Impresso em 05/01/2024');
    const calls = [];
    const L = { BrowserPrint: { Mode: {
        Landscape: (paper, o) => { calls.push([paper, o]); return {}; },
        Portrait: () => assert.fail()
    } } };
    mp.buildMode(L, settings);
    assert.equal(calls[0][0], 'A4');
    assert.equal(calls[0][1].zoom, settings.zoom);
    assert.equal(calls[0][1].footer.enabled, true);
    assert.equal(calls[0][1].margin, 10);
});

test('getSize ignora devicePixelRatio', () => {
    const helper = { getSize: () => ({ Width: '380mm', Height: '554mm' }) };
    window.devicePixelRatio = 2;
    mp.ignorePixelRatio(helper);
    mp.ignorePixelRatio(helper);
    assert.deepEqual(helper.getSize(), { Width: '190mm', Height: '277mm' });
    delete window.devicePixelRatio;
});

test('controle abre o diálogo, restaura zoomSnap e adiciona escala gráfica', async () => {
    const handlers = {};
    const map = {
        options: {}, on: (e, f) => { handlers[e] = f; },
        getCenter: () => ({ lat: -21.5 }), getSize: () => ({ x: 800, y: 600 }),
        getZoom: () => 13, getMinZoom: () => 1, getMaxZoom: () => 28
    };
    let printed;
    let snapDuringPrint;
    let scaleAdded = 0;
    const L = {
        BrowserPrint: {
            Helper: { getSize: () => ({ Width: '1mm', Height: '1mm' }) },
            Event: { PrintInit: 'i', PrintStart: 's', PrintEnd: 'e', PrintCancel: 'c' },
            Mode: { Portrait: (p, o) => ({ p, o }), Landscape: (p, o) => ({ p, o }) }
        },
        browserPrint: () => ({
            print: mode => {
                printed = mode;
                handlers.i();
                snapDuringPrint = map.options.zoomSnap;
                handlers.s({ printMap: {} });
            }
        }),
        control: {
            browserPrint: () => ({ addTo() { return this; } }),
            scale: () => ({ addTo() { scaleAdded++; } })
        }
    };
    const els = {};
    for (const id of ['mapPrintPaper', 'mapPrintOrientation', 'mapPrintScale', 'mapPrintCustomScale', 'mapPrintFooter', 'mapPrintSummary', 'print-footer']) {
        els[id] = { addEventListener() {}, style: {} };
    }
    Object.assign(els.mapPrintPaper, { value: 'A3' });
    Object.assign(els.mapPrintOrientation, { value: 'portrait' });
    Object.assign(els.mapPrintScale, { value: '50000' });
    Object.assign(els.mapPrintFooter, { checked: true });
    global.document = { getElementById: id => els[id] || null };
    let html;
    const Swal = {
        fire: async options => {
            html = options.html;
            options.didOpen();
            return { isConfirmed: true, value: options.preConfirm() };
        },
        showValidationMessage() {}
    };
    const api = mp.attach({ map, leaflet: L, Swal });
    const settings = await api.open();
    assert.equal(settings.scale, 50000);
    assert.equal(printed.p, 'A3');
    assert.equal(snapDuringPrint, 0);
    assert.equal(map.options.zoomSnap, undefined);
    assert.equal(scaleAdded, 1);
    assert.equal(els['print-footer'].style.fontSize, '12px');
    assert.ok(html.includes('Orientação'));
    assert.ok(els.mapPrintSummary.textContent.includes('1:50.000'));
});

test('código antigo de impressão foi removido e o controle não fica oculto', () => {
    const popups = fs.readFileSync(path.join(root, 'js/features/map-popups.js'), 'utf8');
    assert.ok(!popups.includes('window.print()') && !popups.includes('zoomend'));
    assert.ok(!/leaflet-control-browser-print\s*\{\s*display:\s*none/.test(fs.readFileSync(path.join(root, 'css/app.css'), 'utf8')));
    const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    const at = name => html.indexOf('js/features/' + name + '.js');
    assert.ok(html.indexOf('leaflet.browser.print') < at('map-print') && at('map-print') < at('map-popups'));
});
