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

test('task help covers all task types and details use injected preset labels', () => {
    const taskTypes = [
        'findHighestPoint',
        'placeIcons',
        'drawLinesBetweenIcons',
        'connectDifferentIcons',
        'drawCoverageArea',
        'verifyRadioLinks',
        'identifyCoverageGaps',
        'checkRouteCommunication',
        'suggestRepeaterPositions',
        'compareRadioPresets'
    ];

    for (const taskType of taskTypes) {
        assert.match(source, new RegExp(`${taskType}:\\s*\\{\\s*purpose:`));
    }
    assert.match(source, /taskParameters\.getPresetLabel\?\.\(value\)/);
    assert.doesNotMatch(source, /radioPlanningService/);
    assert.match(source, /safeTaskName/);
    assert.match(source, /escolha <em>Não<\/em> na confirmação de limpeza/);
});
