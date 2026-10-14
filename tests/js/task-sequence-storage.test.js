const assert = require('node:assert/strict');
const test = require('node:test');

global.window = {};
require('../../js/features/task-sequence-storage.js');

function createStorageHarness({ tasks = [], promptResults = [], requestResults = [] } = {}) {
    let currentTasks = tasks;
    let renderCount = 0;
    let promptIndex = 0;
    let requestIndex = 0;
    const requests = [];
    const alerts = [];
    const storage = window.PlanMilT.taskSequenceStorage.attach({
        getTasks: () => currentTasks,
        setTasks: nextTasks => { currentTasks = nextTasks; },
        renderTasks: () => { renderCount++; },
        sweetAlert: {
            async fire(...args) {
                alerts.push(args);
                return promptResults[promptIndex++] || {};
            }
        },
        request: async (url, options) => {
            requests.push({ url, options });
            return { json: async () => requestResults[requestIndex++] || {} };
        }
    });

    return {
        alerts,
        get tasks() { return currentTasks; },
        get renderCount() { return renderCount; },
        requests,
        storage
    };
}

test('saving a sequence preserves the legacy form actions and payload fields', async () => {
    const taskList = [{ task: 'findHighestPoint', parameters: { maxDistance: 2 } }];
    const harness = createStorageHarness({
        tasks: taskList,
        promptResults: [
            { value: 'Sequence A' },
            { value: 'password' },
            { value: 'Training plan' },
            { isConfirmed: true }
        ],
        requestResults: [
            { success: true, exists: false },
            { success: true }
        ]
    });

    await harness.storage.saveTaskSequence();

    assert.deepEqual(harness.requests.map(request => request.options.body.get('action')), ['check_sequence', 'save']);
    const savePayload = harness.requests[1].options.body;
    assert.equal(savePayload.get('name'), 'Sequence A');
    assert.equal(savePayload.get('password'), 'password');
    assert.equal(savePayload.get('description'), 'Training plan');
    assert.equal(savePayload.get('sequence'), JSON.stringify(taskList));
    assert.equal(harness.renderCount, 1);
});

test('loading sequence details updates shared state and rerenders the editor', async () => {
    const sequence = [{ task: 'placeIcons', parameters: { criteria: 100 } }];
    const harness = createStorageHarness({
        requestResults: [{ success: true, sequence, description: 'Loaded plan' }],
        promptResults: [{}]
    });

    await harness.storage.loadTaskSequenceDetails('Loaded');

    assert.equal(harness.requests[0].options.body.get('action'), 'get_sequence');
    assert.equal(harness.requests[0].options.body.get('name'), 'Loaded');
    assert.deepEqual(harness.tasks, sequence);
    assert.equal(harness.renderCount, 1);
});

test('deleting a sequence requires confirmation and updates the shared list', async () => {
    const taskList = [{ name: 'Sequence A' }, { name: 'Sequence B' }];
    const harness = createStorageHarness({
        tasks: taskList,
        promptResults: [
            { value: 'Sequence A' },
            { value: 'password' },
            { isConfirmed: true },
            {}
        ],
        requestResults: [
            { success: true, sequences: ['Sequence A', 'Sequence B'] },
            { success: true }
        ]
    });

    await harness.storage.deleteTaskSequence();

    assert.equal(harness.requests[0].options.body.get('action'), 'load');
    assert.equal(harness.requests[1].options.body.get('action'), 'delete_sequence');
    assert.equal(harness.requests[1].options.body.get('name'), 'Sequence A');
    assert.equal(harness.requests[1].options.body.get('password'), 'password');
    assert.deepEqual(harness.tasks, [{ name: 'Sequence B' }]);
    assert.equal(harness.renderCount, 1);
});