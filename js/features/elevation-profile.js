/**
 * @fileoverview Contém cálculos puros para amostragem de perfil e linha de visada.
 * @exports window.PlanMilT.elevationProfile
 * @requires Coordenadas geográficas e elevações numéricas
 */
window.PlanMilT = window.PlanMilT || {};

window.PlanMilT.elevationProfile = Object.freeze({
    /**
     * Gera pontos interpolados entre as extremidades de um perfil topográfico.
     * @param {*} start - Coordenada geográfica inicial.
     * @param {*} end - Coordenada geográfica final.
     * @param {number} intervalCount - Número de intervalos entre as extremidades.
     */
    createProfileSamples(start, end, intervalCount = 100) {
        if (!Number.isInteger(intervalCount) || intervalCount < 1) {
            throw new RangeError('A quantidade de intervalos deve ser um inteiro positivo.');
        }

        const points = Array.from({ length: intervalCount + 1 }, (_, index) => {
            const proportion = index / intervalCount;

            return {
                latitude: start.lat + (end.lat - start.lat) * proportion,
                longitude: start.lng + (end.lng - start.lng) * proportion
            };
        });

        return {
            midpoint: {
                lat: (start.lat + end.lat) / 2,
                lng: (start.lng + end.lng) / 2
            },
            points
        };
    },

    /**
     * Interpola o perfil da linha de visada entre as elevações dos extremos.
     * @param {Array<number>} elevations - Elevações ordenadas ao longo do perfil.
     * @param {number} antennaHeight - Altura da antena adicionada à elevação dos extremos.
     */
    createLineOfSight(elevations, antennaHeight = 12) {
        if (!Array.isArray(elevations) || elevations.length === 0) {
            throw new TypeError('O perfil precisa conter pelo menos uma elevação.');
        }

        if (!Number.isFinite(antennaHeight)) {
            throw new TypeError('A altura da antena precisa ser numérica.');
        }

        const numericElevations = elevations.map(Number);
        if (!numericElevations.every(Number.isFinite)) {
            throw new TypeError('O perfil contém elevação inválida.');
        }

        const startElevation = numericElevations[0] + antennaHeight;
        const endElevation = numericElevations[numericElevations.length - 1] + antennaHeight;
        const lastIndex = Math.max(numericElevations.length - 1, 1);

        return numericElevations.map((_, index) => (
            startElevation + (endElevation - startElevation) * (index / lastIndex)
        ));
    }
});