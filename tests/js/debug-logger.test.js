const assert = require('node:assert/strict');
const test = require('node:test');

global.window = {};
require('../../js/features/debug-logger.js');

const debugLogger = window.PlanMilT.debugLogger;

test('debug traces are enabled by default and can be disabled', () => {
    const originalConsoleDebug = console.debug;
    let calls = 0;
    console.debug = () => { calls++; };

    try {
        const trace = debugLogger.start('test.operation');
        trace.finish();
        assert.equal(calls, 2);

        debugLogger.disable();
        debugLogger.start('test.disabled').finish();
        assert.equal(calls, 2);
    } finally {
        console.debug = originalConsoleDebug;
    }
});

test('enabled traces report completion and failures without error messages', () => {
    const originalConsoleInfo = console.info;
    const originalConsoleDebug = console.debug;
    const originalConsoleError = console.error;
    const logs = [];
    console.info = (...args) => logs.push(args);
    console.debug = (...args) => logs.push(args);
    console.error = (...args) => logs.push(args);
    debugLogger.enable();

    try {
        const completed = debugLogger.start('test.completed');
        completed.finish();
        completed.finish();

        const failed = debugLogger.start('test.failed');
        failed.fail(new Error('sensitive error details'));
        failed.finish();

        assert.deepEqual(logs.map(([message]) => message), [
            '[PlanMilT][Debug] Rastreamento ativado.',
            '[PlanMilT][Debug] Operação iniciada.',
            '[PlanMilT][Debug] Operação concluída.',
            '[PlanMilT][Debug] Operação iniciada.',
            '[PlanMilT][Debug] Operação falhou.'
        ]);
        assert.equal(logs[2][1].operation, 'test.completed');
        assert.equal(logs[2][1].durationMs >= 0, true);
        assert.deepEqual(logs[4][1], {
            operation: 'test.failed',
            durationMs: logs[4][1].durationMs,
            errorName: 'Error'
        });
        assert.doesNotMatch(JSON.stringify(logs), /sensitive error details/);

        debugLogger.disable();
        const disabled = debugLogger.start('test.disabled');
        disabled.finish();
        assert.equal(logs.length, 5);
    } finally {
        debugLogger.disable();
        console.info = originalConsoleInfo;
        console.debug = originalConsoleDebug;
        console.error = originalConsoleError;
    }
});
