const assert = require('node:assert/strict');
const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

test('drawing endpoints preserve compatibility and reject oversized requests', async t => {
    const root = path.join(__dirname, '../..');
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'planmilt-drawing-test-'));
    const databasePath = path.join(directory, 'test.sqlite');
    const setup = spawnSync('php', ['-r', `
        $db = new PDO('sqlite:' . $argv[1]);
        $db->exec("CREATE TABLE drawings (id INTEGER PRIMARY KEY, username TEXT NOT NULL, password_hash TEXT NOT NULL, link TEXT NOT NULL, geojson TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)");
        $db->exec("CREATE TABLE app_settings (setting_key TEXT PRIMARY KEY, setting_value TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT (datetime('now')))");
        $db->exec("PRAGMA user_version=7");
    `, databasePath], { encoding: 'utf8' });
    assert.equal(setup.status, 0, setup.stderr);
    const portServer = net.createServer();
    await new Promise(resolve => portServer.listen(0, '127.0.0.1', resolve));
    const port = portServer.address().port;
    await new Promise(resolve => portServer.close(resolve));
    const server = spawn('php', ['-d', 'post_max_size=1M', '-S', `127.0.0.1:${port}`, '-t', root], {
        env: { ...process.env, PLANMILT_DB_PATH: databasePath },
        stdio: ['ignore', 'ignore', 'pipe']
    });
    let serverOutput = '';
    server.stderr.on('data', data => { serverOutput += data.toString(); });
    try {
        await t.test('frontend in a subdirectory saves and loads through an older root endpoint', async () => {
        const records = new Map();
        const requests = [];
        const server = http.createServer((request, response) => {
            let body = '';
            request.setEncoding('utf8');
            request.on('data', chunk => { body += chunk; });
            request.on('end', () => {
                const params = new URLSearchParams(body);
                requests.push({ path: request.url, params });
                const key = `${params.get('usuario') || ''}\n${params.get('link') || ''}`;
                if (request.url === '/salvar.php') {
                    if (!params.has('usuario') || !params.has('senha') || !params.has('leaflet')) {
                        response.writeHead(400).end('Dados ausentes.');
                        return;
                    }
                    records.set(key, params.get('leaflet'));
                    response.end('Desenho salvo com sucesso!');
                } else if (request.url === '/carregar.php') {
                    response.setHeader('Content-Type', 'application/json');
                    response.end(records.get(key) || JSON.stringify({
                        error: 'Nenhum desenho encontrado para o usuário fornecido.'
                    }));
                } else {
                    response.writeHead(404).end();
                }
            });
        });
        await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
        try {
            const base = `http://127.0.0.1:${server.address().port}/GitHub/PlanMilT-dev/index.html`;
            const name = 'Plano São João & Área=1';
            const feature = {
                type: 'Feature', properties: { color: '#123456' },
                geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] }
            };
            const collection = { type: 'FeatureCollection', features: [feature] };
            const oldName = 'Planejamento anterior';
            await fetch(new URL('/salvar.php', base), {
                method: 'POST', body: new URLSearchParams({
                    usuario: oldName, senha: 'senha', link: '', leaflet: JSON.stringify(collection)
                })
            });
            const elements = {
                'swal-input-plan-name': { value: name },
                'swal-input-senha': { value: 'senha' },
                drawingAutoSaveChoice: { checked: false }
            };
            const handlers = {};
            const saved = new Map();
            const loaded = [];
            const alerts = [];
            const drawnItems = {
                on() {}, getLayer() { return null; }, clearLayers() { loaded.length = 0; },
                addLayer(layer) { loaded.push(layer); }, getLayers() { return loaded; }, getBounds() { return {}; }
            };
            const map = { on() {}, fitBounds() {} };
            const context = {
                URLSearchParams, drawnItems, map,
                window: { location: { href: base }, PlanMilT: {
                    apiClient: { request(url, options) { return fetch(new URL(url, base), options); } },
                    geoJsonSerialization: { toFeatureCollection(group) {
                        return group === drawnItems ? collection : { type: 'FeatureCollection', features: [] };
                    } },
                    coverageImage: { getGroup: () => ({ on() {} }), clear() {} },
                    welcome: { record: () => true }
                } },
                document: {
                    addEventListener() {},
                    getElementById(id) {
                        if (id === 'saveDrawings' || id === 'loadDrawings') {
                            return { addEventListener(event, callback) { handlers[id] = callback; },
                                classList: { add() {}, remove() {} } };
                        }
                        return elements[id];
                    }
                },
                sessionStorage: {
                    getItem: key => saved.get(key) || '',
                    setItem: (key, value) => saved.set(key, value),
                    removeItem: key => saved.delete(key)
                },
                Swal: {
                    async fire(...args) {
                        alerts.push(args);
                        if (args[0]?.title === 'Salvar planejamento') {
                            args[0].didOpen();
                            elements['swal-input-plan-name'].value = name;
                            elements['swal-input-senha'].value = 'senha';
                            return { isConfirmed: true, value: args[0].preConfirm() };
                        }
                        if (args[0]?.title === 'Como deseja carregar o planejamento?') return { isConfirmed: true };
                        return { isConfirmed: true };
                    },
                    isVisible: () => false
                },
                L: { geoJson(data, options) {
                    for (const item of data.features) options.onEachFeature(item, { setStyle() {} });
                    return { addTo() { return this; } };
                } },
                setInterval, clearInterval,
                console: { info() {}, error(...args) { throw new Error(args.join(' ')); } }
            };
            const root = path.join(__dirname, '../..');
            vm.runInNewContext(fs.readFileSync(path.join(root, 'js/features/drawing-storage.js'), 'utf8'), context);
            vm.runInNewContext(fs.readFileSync(path.join(root, 'js/features/drawing-loading.js'), 'utf8'), context);
            await handlers.saveDrawings();
            assert.match(alerts.at(-1)[1], /salvo com sucesso/);
            await context.window.PlanMilT.drawingLoading.load(name);
            assert.equal(loaded.length, 1);
            await context.window.PlanMilT.drawingLoading.load(oldName);
            assert.equal(loaded.length, 1);
            assert.deepEqual(requests.map(request => request.path), [
                '/salvar.php', '/salvar.php', '/carregar.php', '/carregar.php'
            ]);
            for (const request of requests.slice(1)) {
                assert.equal(request.params.get('plan_name'), request.params.get('usuario'));
            }
        } finally {
            server.closeAllConnections();
            await new Promise(resolve => server.close(resolve));
        }
        });
        const base = `http://127.0.0.1:${port}/php/endpoints/`;
        let ready = false;
        for (let attempt = 0; attempt < 100; attempt++) {
            if (server.exitCode !== null) throw new Error(`Servidor PHP encerrou: ${serverOutput}`);
            try {
                await fetch(`${base}drawing-load.php`);
                ready = true;
                break;
            } catch {
                await new Promise(resolve => setTimeout(resolve, 20));
            }
        }
        assert.ok(ready, 'Servidor PHP não iniciou');
        const feature = {
            type: 'Feature',
            properties: { color: '#ff0000', fillColor: '#ff0000', fillOpacity: 0.6, rxPower: '-70.00' },
            geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] }
        };
        const drawing = JSON.stringify({ type: 'FeatureCollection', features: Array(2000).fill(feature) });
        const save = leaflet => fetch(`${base}drawing-save.php`, {
            method: 'POST',
            body: new URLSearchParams({ plan_name: 'teste', senha: 'senha', link: '', leaflet })
        });
        const load = () => fetch(`${base}drawing-load.php`, {
            method: 'POST', body: new URLSearchParams({ plan_name: 'teste', link: '' })
        });
        const saved = await save(drawing);
        assert.equal(saved.status, 200, serverOutput);
        assert.match(await saved.text(), /Desenho salvo com sucesso/);
        assert.equal(await (await load()).text(), drawing);
        const legacy = await fetch(`${base}drawing-save.php`, {
            method: 'POST', body: new URLSearchParams({ usuario: 'teste', senha: 'senha', leaflet: drawing })
        });
        assert.equal(legacy.status, 200);
        assert.match(await legacy.text(), /Desenho atualizado com sucesso/);
        assert.equal(await (await load()).text(), drawing);
        const legacyLoad = await fetch(`${base}drawing-load.php`, {
            method: 'POST', body: new URLSearchParams({ usuario: 'teste', link: '' })
        });
        assert.equal(await legacyLoad.text(), drawing);
        const bothLoad = await fetch(`${base}drawing-load.php`, {
            method: 'POST', body: new URLSearchParams({ plan_name: 'teste', usuario: 'teste', link: '' })
        });
        assert.equal(await bothLoad.text(), drawing);
        const bothSave = await fetch(`${base}drawing-save.php`, {
            method: 'POST', body: new URLSearchParams({
                plan_name: 'teste', usuario: 'teste', senha: 'senha', link: '', leaflet: drawing
            })
        });
        assert.match(await bothSave.text(), /Desenho atualizado com sucesso/);
        const rejected = await save('x'.repeat(1100000));
        assert.equal(rejected.status, 413);
        assert.match(await rejected.text(), /post_max_size/);
        assert.equal(await (await load()).text(), drawing);
        const invalid = await fetch(`${base}drawing-save.php`, {
            method: 'POST', body: new URLSearchParams({ usuario: 'teste' })
        });
        assert.equal(invalid.status, 400);
        const wrongType = await fetch(`${base}drawing-save.php`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}'
        });
        assert.equal(wrongType.status, 400);
        assert.equal(await (await load()).text(), drawing);
        const raster = JSON.stringify({ type: 'FeatureCollection', features: [{
            type: 'Feature', geometry: null, properties: { coverageImage: {
                image: 'data:image/png;base64,AQ==', mapImage: 'data:image/png;base64,Ag==',
                bounds: [[-22, -52], [-21, -51]], mode: 'radio', resolutionKm: 0.5,
                powerSamples: { center: [-21.5, -51.5], radiusKm: 0.5, radialCount: 32, steps: 1, values: Buffer.alloc(128, 0xff).toString('base64') }
            } }
        }] });
        assert.equal((await save(raster)).status, 200);
        assert.equal(await (await load()).text(), raster);
    } finally {
        server.kill('SIGTERM');
        await new Promise(resolve => server.once('exit', resolve));
        fs.rmSync(directory, { recursive: true, force: true });
    }
});
