const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '../../js/features/task-sequence-editor.js'), 'utf8');

test('add-task handler reads the injected parameter service without shadowing it', () => {
    assert.match(source, /const parameterValues = await taskParameters\.getValues\(selectedTask, existingParameters\)/);
    assert.doesNotMatch(source, /const taskParameters = await taskParameters\.getValues/);
    assert.match(source, /parameters: parameterValues/);
});
