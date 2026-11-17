const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../../js/features/local-task-sequence.js'), 'utf8');

function createHarness(records, pathname = '/app/', tasks = []) {
    const timers = new Map();
    const documentEvents = new Map();
    let timerId = 0;
    const state = { tasks };
    const indexedDB = {
        open(name) {
            const request = {};
            queueMicrotask(() => {
                if (!records.has(name)) records.set(name, undefined);
                request.result = {
                    createObjectStore() {},
                    transaction() {
                        const transaction = {
                            objectStore: () => ({
                                get() {
                                    const result = {};
                                    queueMicrotask(() => { result.result = structuredClone(records.get(name)); transaction.oncomplete(); });
                                    return result;
                                },
                                put(value) {
                                    queueMicrotask(() => { records.set(name, structuredClone(value)); transaction.oncomplete(); });
                                    return {};
                                }
                            })
                        };
                        return transaction;
                    }
                };
                request.onsuccess();
            });
            return request;
        }
    };
    const context = {
        URL, structuredClone, indexedDB, console: { error() {} },
        window: { location: { href: `https://example.test${pathname}` } },
        document: { addEventListener(name, callback) { documentEvents.set(name, callback); } },
        setTimeout(callback) { const id = ++timerId; timers.set(id, callback); return id; },
        clearTimeout(id) { timers.delete(id); }
    };
    vm.runInNewContext(source, context);
    const module = context.window.PlanMilT.localTaskSequence;
    return {
        state, module,
        hide() { context.document.visibilityState = 'hidden'; documentEvents.get('visibilitychange')(); },
        start: () => module.start({ getTasks: () => state.tasks, setTasks: value => { state.tasks = value; } }),
        async flush() {
            const callbacks = [...timers.values()];
            timers.clear();
            callbacks.forEach(callback => callback());
            for (let i = 0; i < 10; i++) await Promise.resolve();
        }
    };
}

test('saves the task sequence and restores it in a new page for the same installation only', async () => {
    const records = new Map();
    const first = createHarness(records);
    await first.start();
    first.state.tasks = [{ task: 'findHighestPoint', parameters: { maxDistance: 10 } }];
    first.module.save();
    await first.flush();

    const second = createHarness(records);
    await second.start();
    assert.deepEqual(second.state.tasks, [{ task: 'findHighestPoint', parameters: { maxDistance: 10 } }]);

    const other = createHarness(records, '/other/');
    await other.start();
    assert.deepEqual(other.state.tasks, []);
});

test('does not replace tasks already present and ignores malformed stored data', async () => {
    const records = new Map([['planmilt.tasks.v1:/app/', [{ task: 'a', parameters: {} }]]]);
    const existing = [{ task: 'b', parameters: {} }];
    const present = createHarness(records, '/app/', existing);
    await present.start();
    assert.equal(present.state.tasks, existing);

    const corrupt = createHarness(new Map([['planmilt.tasks.v1:/app/', [{ task: 1 }]]]));
    await corrupt.start();
    assert.deepEqual(corrupt.state.tasks, []);
});

test('flushes a pending save when the page becomes hidden and writes nothing before restoration', async () => {
    const records = new Map();
    const h = createHarness(records);
    h.module.save();
    await h.flush();
    assert.equal(records.size, 0);
    await h.start();
    h.state.tasks = [{ task: 'x', parameters: {} }];
    h.module.save();
    h.hide();
    await h.flush();
    assert.deepEqual(records.get('planmilt.tasks.v1:/app/'), [{ task: 'x', parameters: {} }]);
});
