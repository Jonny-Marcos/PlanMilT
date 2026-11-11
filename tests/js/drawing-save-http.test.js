const assert = require('node:assert/strict');
const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

test('drawing endpoint persists a large collection and rejects oversized requests without overwriting it', async () => {
    const root = path.join(__dirname, '../..');
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'planmilt-drawing-test-'));
    const databasePath = path.join(directory, 'test.sqlite');
    const setup = spawnSync('php', ['-r', `
        $db = new PDO('sqlite:' . $argv[1]);
        $db->exec("CREATE TABLE drawings (id INTEGER PRIMARY KEY, username TEXT NOT NULL, password_hash TEXT NOT NULL, link TEXT NOT NULL, geojson TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)");
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
            body: new URLSearchParams({ usuario: 'teste', senha: 'senha', link: '', leaflet })
        });
        const load = () => fetch(`${base}drawing-load.php`, {
            method: 'POST', body: new URLSearchParams({ usuario: 'teste', link: '' })
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
                bounds: [[-22, -52], [-21, -51]], mode: 'radio', resolutionKm: 0.5
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
