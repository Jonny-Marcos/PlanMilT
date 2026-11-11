/**
 * @fileoverview Aproxima perdas de cobertura RF por faixa, cenário e difração do obstáculo dominante.
 * @exports window.PlanMilT.coveragePropagation
 */
window.PlanMilT = window.PlanMilT || {};

window.PlanMilT.coveragePropagation = Object.freeze((() => {
    const scenarios = Object.freeze({
        high: { diffractionFactor: 0.7, environmentDb: 2 },
        medium: { diffractionFactor: 1, environmentDb: 6 },
        low: { diffractionFactor: 1.3, environmentDb: 12 }
    });

    /**
     * Identifica a faixa de frequência suportada pela aproximação terrestre.
     * @param {number} frequencyMHz - Frequência em MHz.
     * @returns {Object} Nome e fator empírico de perda ambiental.
     */
    function bandForFrequency(frequencyMHz) {
        if (!Number.isFinite(frequencyMHz) || frequencyMHz < 3 || frequencyMHz >= 30000) {
            throw new Error('A frequência da cobertura RF deve estar entre 3 MHz e menos de 30000 MHz.');
        }
        if (frequencyMHz < 30) return { name: 'HF', factor: 0.5 };
        if (frequencyMHz < 300) return { name: 'VHF', factor: 0.75 };
        if (frequencyMHz < 3000) return { name: 'UHF', factor: 1 };
        return { name: 'SHF', factor: 1.3 };
    }

    /**
     * Calcula perdas e visibilidade para um perfil terrestre já amostrado.
     * @param {Array<Object>} points - Distâncias em km e elevações em metros.
     * @param {Object} parameters - Frequência, orçamento RF e alturas das antenas.
     * @param {string} [scenario=medium] - Condição high, medium ou low.
     * @returns {Object} Viabilidade, potência recebida e perdas estimadas.
     */
    function evaluate(points, parameters, scenario = 'medium') {
        const condition = scenarios[scenario];
        if (!condition) throw new Error('Selecione uma condição válida de penetração/difração.');
        if (!Array.isArray(points) || points.length < 2) throw new Error('Perfil de cobertura inválido.');
        const total = points[points.length - 1].distKm;
        if (!Number.isFinite(total) || total <= 0 ||
            points.some((point, index) => !Number.isFinite(point.distKm) || !Number.isFinite(point.elevation) ||
                (index > 0 && point.distKm <= points[index - 1].distKm)) ||
            points[0].distKm !== 0 || !Number.isFinite(parameters.txHeight) || !Number.isFinite(parameters.rxHeight) ||
            parameters.txHeight < 0 || parameters.rxHeight < 0) {
            throw new Error('Perfil ou altura de antena inválidos para cobertura.');
        }
        const band = parameters.isOptical ? null : bandForFrequency(parameters.freq);
        if (!parameters.isOptical && [parameters.txPower, parameters.txGain, parameters.rxGain, parameters.rxSens]
            .some(value => !Number.isFinite(value))) throw new Error('Parâmetros RF inválidos para cobertura.');
        const tx = points[0].elevation + parameters.txHeight;
        const rx = points[points.length - 1].elevation + parameters.rxHeight;
        let maxV = -Infinity;
        let hasObstruction = false;
        for (let index = 1; index < points.length - 1; index++) {
            const d1 = points[index].distKm;
            const d2 = total - d1;
            const terrain = points[index].elevation + d1 * d2 / (12.74 * 1.333);
            const los = tx + (rx - tx) * d1 / total;
            const obstruction = terrain - los;
            if (obstruction > 0) hasObstruction = true;
            if (band) {
                const fresnelRadius = 17.32 * Math.sqrt(d1 * d2 / ((parameters.freq / 1000) * total));
                maxV = Math.max(maxV, Math.SQRT2 * obstruction / fresnelRadius);
            }
        }
        if (!band) return { isViable: !hasObstruction, hasObstruction, rxPower: 0 };
        const diffractionDb = maxV <= -0.78 ? 0 :
            6.9 + 20 * Math.log10(Math.sqrt((maxV - 0.1) ** 2 + 1) + maxV - 0.1);
        const adjustedDiffractionDb = diffractionDb * condition.diffractionFactor;
        const environmentDb = condition.environmentDb * band.factor;
        const freeSpaceDb = 20 * Math.log10(total) + 20 * Math.log10(parameters.freq) + 32.44;
        const rxPower = parameters.txPower + parameters.txGain + parameters.rxGain -
            freeSpaceDb - adjustedDiffractionDb - environmentDb;
        return {
            isViable: rxPower >= parameters.rxSens, hasObstruction, rxPower,
            band: band.name, diffractionDb: adjustedDiffractionDb, environmentDb
        };
    }

    return { bandForFrequency, evaluate };
})());
