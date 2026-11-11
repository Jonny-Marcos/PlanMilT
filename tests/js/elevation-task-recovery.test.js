const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../../js/features/task-execution.js'), 'utf8');

test('task elevation retries once after recovering missing files', async () => {
    let requests = 0;
    let recovered = 0;
    const attach = () => ({});
    const context = {
        window: { PlanMilT: {
            radioPlanning: { attach: () => ({ getPresets: () => [] }) },
            taskRadioLinks: { attach }, taskRadioOperations: { attach },
            taskParameters: { attach }, taskSequenceEditor: { attach },
            elevationFiles: { async ensure(tiles) { recovered++; assert.equal(tiles[0], 'N01E001.HGT'); return true; } },
            apiClient: { async request() {
                requests++;
                return requests === 1
                    ? { ok: false, json: async () => ({ error: 'Arquivos de elevação faltando', missingTiles: ['N01E001.HGT'] }) }
                    : { ok: true, json: async () => [{ lat: 1, lon: 1, elevation: 10 }] };
            } }
        } },
        map: {}, L: {}, turf: {}, drawnItems: {}, planejamentoLayer: {},
        Swal: { close() {}, fire() {} }, Chart: class {}, console: { info() {}, error() {} }
    };
    vm.runInNewContext(source, context);
    const bounds = { getSouth: () => 1, getNorth: () => 2, getWest: () => 1, getEast: () => 2 };
    const points = await context.fetchElevationData(bounds);
    assert.equal(points[0].elevation, 10);
    assert.equal(recovered, 1);
    assert.equal(requests, 2);
});
