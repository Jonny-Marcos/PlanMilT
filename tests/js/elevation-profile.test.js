const assert = require('node:assert/strict');
const test = require('node:test');

global.window = {};
require('../../js/features/elevation-profile.js');

const elevationProfile = window.PlanMilT.elevationProfile;

test('profile sampling includes both endpoints and the midpoint', () => {
    const profile = elevationProfile.createProfileSamples(
        { lat: -20, lng: -50 },
        { lat: -22, lng: -48 },
        2
    );

    assert.deepEqual(profile.points, [
        { latitude: -20, longitude: -50 },
        { latitude: -21, longitude: -49 },
        { latitude: -22, longitude: -48 }
    ]);
    assert.deepEqual(profile.midpoint, { lat: -21, lng: -49 });
});

test('profile sampling defaults to 101 points', () => {
    const profile = elevationProfile.createProfileSamples(
        { lat: 0, lng: 0 },
        { lat: 1, lng: 1 }
    );

    assert.equal(profile.points.length, 101);
});

test('profile sampling rejects invalid interval counts', () => {
    assert.throws(() => elevationProfile.createProfileSamples(
        { lat: 0, lng: 0 },
        { lat: 1, lng: 1 },
        0
    ), RangeError);
});

test('line of sight interpolates endpoint elevations plus antenna height', () => {
    assert.deepEqual(
        elevationProfile.createLineOfSight([100, 200, 300]),
        [112, 212, 312]
    );
});

test('line of sight handles a single elevation', () => {
    assert.deepEqual(elevationProfile.createLineOfSight([100]), [112]);
});

test('line of sight rejects missing or non-numeric elevations', () => {
    assert.throws(() => elevationProfile.createLineOfSight([]), TypeError);
    assert.throws(() => elevationProfile.createLineOfSight([100, 'N/A']), TypeError);
});