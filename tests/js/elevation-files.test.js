const assert = require('node:assert/strict');
const test = require('node:test');

global.window = { PlanMilT: {} };
require('../../js/features/elevation-files.js');

test('downloads each missing tile and retries the elevation profile once', async () => {
    const calls = [];
    global.Swal = { fire() {}, close() {} };
    window.PlanMilT.apiClient = { async request(url, options) {
        calls.push(url);
        if (url.includes('elevation-download')) {
            return { ok: true, json: async () => ({ success: true, tile: JSON.parse(options.body).tile }) };
        }
        return calls.length === 1
            ? { ok: false, json: async () => ({ error: 'Arquivos de elevação faltando', missingTiles: ['S22W052.HGT', 'S22W052.HGT'] }) }
            : { ok: true, json: async () => [{ elevation: 100 }] };
    } };
    assert.deepEqual(await window.PlanMilT.elevationFiles.profile({ points: [] }), [{ elevation: 100 }]);
    assert.deepEqual(calls, ['elevation-profile.php', 'php/endpoints/elevation-download.php', 'elevation-profile.php']);
});

test('offers upload only for files whose automatic download failed', async () => {
    const calls = [];
    const alerts = [];
    global.Swal = {
        fire(options) {
            alerts.push(options);
            if (options.title === 'Download de elevação indisponível') return Promise.resolve({ isConfirmed: true });
            if (options.title === 'Upload de Arquivos de Elevação') return Promise.resolve({ value: { test: true } });
        },
        close() {}
    };
    window.PlanMilT.apiClient = { async request(url, options) {
        calls.push(url);
        if (url === 'elevation-upload.php') return { ok: true, json: async () => ({ success: true }) };
        const tile = JSON.parse(options.body).tile;
        return { ok: tile === 'S22W052.HGT', status: 502, json: async () =>
            tile === 'S22W052.HGT' ? { success: true, tile } : { error: 'Falha ao baixar.' } };
    } };
    const oldError = console.error;
    console.error = () => {};
    try {
        assert.equal(await window.PlanMilT.elevationFiles.ensure(['S22W052.HGT', 'S22W053.HGT']), true);
    } finally { console.error = oldError; }
    const form = alerts.find(value => value.title === 'Upload de Arquivos de Elevação');
    assert.match(form.html, /S22W053/);
    assert.doesNotMatch(form.html, /S22W052/);
    assert.equal(calls.at(-1), 'elevation-upload.php');
});

test('validates tile names and caps requests before making external calls', async () => {
    await assert.rejects(window.PlanMilT.elevationFiles.ensure(['../segredo.HGT']), /inválidos/);
    const tiles = Array.from({ length: 33 }, (_, index) => `N${String(index).padStart(2, '0')}E001.HGT`);
    await assert.rejects(window.PlanMilT.elevationFiles.ensure(tiles), /32 tiles/);
});

test('failed download can be cancelled without retrying the profile', async () => {
    let requests = 0;
    global.Swal = { fire: options => options.title === 'Download de elevação indisponível' ? { isConfirmed: false } : {}, close() {} };
    window.PlanMilT.apiClient = { async request(url) {
        requests++;
        if (url === 'elevation-profile.php') return { ok: false, json: async () => ({ error: 'Arquivos de elevação faltando', missingTiles: ['S22W052.HGT'] }) };
        return { ok: false, status: 502, json: async () => ({ error: 'Falha.' }) };
    } };
    const oldError = console.error;
    console.error = () => {};
    try {
        await assert.rejects(window.PlanMilT.elevationFiles.profile({ points: [] }), error => error.userCancelled === true);
    } finally { console.error = oldError; }
    assert.equal(requests, 2);
});
