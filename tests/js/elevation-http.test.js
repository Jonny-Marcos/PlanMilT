const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

test('elevation endpoints read both HGT resolutions and reject unsafe or replacing uploads', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'planmilt-elevation-http-'));
    const project = path.join(__dirname, '../..');
    for (const dir of ['php/endpoints', 'php/src/Application', 'php/src/Infrastructure/Database', 'SRTM3']) {
        fs.mkdirSync(path.join(root, dir), { recursive: true });
    }
    for (const file of [
        'php/bootstrap.php', 'php/src/Infrastructure/Database/ConnectionFactory.php',
        'php/src/Application/ElevationDownloadService.php',
        'php/endpoints/elevation-profile.php', 'php/endpoints/elevation-upload.php',
        'php/endpoints/elevation-download.php'
    ]) fs.copyFileSync(path.join(project, file), path.join(root, file));
    for (const [name, size, value] of [['N01E001.HGT', 1201, -11], ['N02E002.HGT', 3601, 1234]]) {
        const fd = fs.openSync(path.join(root, 'SRTM3', name), 'w');
        fs.ftruncateSync(fd, size * size * 2);
        const bytes = Buffer.alloc(2);
        bytes.writeInt16BE(value);
        const middle = (size - 1) / 2;
        fs.writeSync(fd, bytes, 0, 2, (middle * size + middle) * 2);
        fs.closeSync(fd);
    }
    const socket = net.createServer();
    await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve));
    const port = socket.address().port;
    await new Promise(resolve => socket.close(resolve));
    const server = spawn('php', ['-S', `127.0.0.1:${port}`, '-t', root], { stdio: 'ignore' });
    const base = `http://127.0.0.1:${port}/php/endpoints/`;
    try {
        let ready = false;
        for (let attempt = 0; attempt < 100; attempt++) {
            try { await fetch(base + 'elevation-download.php'); ready = true; break; }
            catch { await new Promise(resolve => setTimeout(resolve, 20)); }
        }
        assert.ok(ready);
        const profile = await fetch(base + 'elevation-profile.php', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ points: [{ latitude: 1.5, longitude: 1.5 }, { latitude: 2.5, longitude: 2.5 }] })
        });
        assert.deepEqual((await profile.json()).map(point => point.elevation), [-11, 1234]);
        const invalidDownload = await fetch(base + 'elevation-download.php', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tile: '../secret.HGT' })
        });
        assert.equal(invalidDownload.status, 400);
        const wrongType = await fetch(base + 'elevation-download.php', {
            method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ tile: 'N01E001.HGT' })
        });
        assert.equal(wrongType.status, 415);
        const upload = new FormData();
        upload.append('missingTiles', JSON.stringify(['N01E001.HGT']));
        upload.append('files[]', new Blob([Buffer.alloc(1201 * 1201 * 2, 1)]), 'N01E001.HGT');
        const result = await (await fetch(base + 'elevation-upload.php', { method: 'POST', body: upload })).json();
        assert.equal(result.success, false);
        const again = await fetch(base + 'elevation-profile.php', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ points: [{ latitude: 1.5, longitude: 1.5 }] })
        });
        assert.equal((await again.json())[0].elevation, -11);
    } finally {
        server.kill('SIGTERM');
        await new Promise(resolve => server.once('exit', resolve));
        fs.rmSync(root, { recursive: true, force: true });
    }
});
