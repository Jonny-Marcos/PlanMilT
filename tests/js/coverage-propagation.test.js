const assert = require('node:assert/strict');
const test = require('node:test');

global.window = {};
require('../../js/features/coverage-propagation.js');
const model = window.PlanMilT.coveragePropagation;
const parameters = { freq: 450, txPower: 37, txGain: 2, rxGain: 2, rxSens: -105, txHeight: 10, rxHeight: 10 };
const obstructed = [
    { distKm: 0, elevation: 100 },
    { distKm: 1, elevation: 120 },
    { distKm: 2, elevation: 100 }
];

test('frequency boundaries use the four specified bands', () => {
    for (const [frequency, band] of [[3, 'HF'], [29.99, 'HF'], [30, 'VHF'], [299.99, 'VHF'], [300, 'UHF'], [2999.99, 'UHF'], [3000, 'SHF'], [29999, 'SHF']]) {
        assert.equal(model.bandForFrequency(frequency).name, band);
    }
    for (const frequency of [0, 2.99, 30000, NaN]) {
        assert.throws(() => model.bandForFrequency(frequency), /frequência/);
    }
});

test('optimistic, balanced and pessimistic scenarios produce ordered losses in every band', () => {
    for (const frequency of [10, 100, 800, 5800]) {
        const values = ['high', 'medium', 'low'].map(scenario =>
            model.evaluate(obstructed, { ...parameters, freq: frequency }, scenario));
        assert.ok(values.every(value => value.hasObstruction && value.diffractionDb > 0));
        assert.ok(values[0].rxPower > values[1].rxPower && values[1].rxPower > values[2].rxPower);
        assert.ok(values[0].diffractionDb < values[1].diffractionDb && values[1].diffractionDb < values[2].diffractionDb);
        assert.deepEqual(model.evaluate(obstructed, { ...parameters, freq: frequency }), values[1]);
        const cutoff = (values[0].rxPower + values[1].rxPower) / 2;
        assert.equal(model.evaluate(obstructed, { ...parameters, freq: frequency, rxSens: cutoff }, 'high').isViable, true);
        assert.equal(model.evaluate(obstructed, { ...parameters, freq: frequency, rxSens: cutoff }, 'medium').isViable, false);
    }
});

test('a clear profile has no diffraction and environmental losses depend on band', () => {
    const clear = [{ distKm: 0, elevation: 100 }, { distKm: 1, elevation: 100 }];
    const values = [10, 100, 800, 5800].map(freq => model.evaluate(clear, { ...parameters, freq }));
    assert.deepEqual(values.map(result => result.diffractionDb), [0, 0, 0, 0]);
    values.forEach((result, index) => assert.ok(Math.abs(result.environmentDb - [3, 4.5, 6, 7.8][index]) < 1e-10));
});

test('optical coverage keeps strict line of sight independent of RF scenario', () => {
    const optical = { ...parameters, isOptical: true, freq: 0 };
    for (const scenario of ['high', 'medium', 'low']) {
        assert.equal(model.evaluate(obstructed, optical, scenario).isViable, false);
        assert.equal(model.evaluate([obstructed[0], obstructed[2]], optical, scenario).isViable, true);
    }
    assert.throws(() => model.evaluate(obstructed, optical, 'invalid'), /condição válida/);
    assert.throws(() => model.evaluate([{ distKm: 0, elevation: NaN }, obstructed[2]], optical), /inválidos/);
});
