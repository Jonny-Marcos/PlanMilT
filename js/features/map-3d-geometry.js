/**
 * @fileoverview Converte uma grade SRTM em malha WebGL alinhada à projeção Mercator.
 * @exports window.PlanMilT.map3dGeometry
 */
window.PlanMilT = window.PlanMilT || {};

window.PlanMilT.map3dGeometry = Object.freeze({
    /**
     * Gera vértices texturizados e índices triangulares para uma grade de elevação.
     * @param {Object} data - Limites e elevações da área.
     * @param {number} verticalScale - Exagero vertical aplicado ao relevo.
     * @returns {Object} Buffers de vértices e triângulos prontos para WebGL.
     */
    createMesh(data, verticalScale = 1) {
        const { bounds, elevations } = data || {};
        if (!Array.isArray(bounds) || bounds.length !== 4
            || !bounds.every(Number.isFinite)
            || !Array.isArray(elevations) || elevations.length < 2
            || !Number.isFinite(verticalScale) || verticalScale < 0.1 || verticalScale > 10) {
            throw new Error('A área ou a grade de elevação é inválida.');
        }
        const [south, west, north, east] = bounds;
        const columns = elevations[0]?.length;
        if (south >= north || west >= east || south < -85 || north > 85 || west < -180 || east > 180
            || north - south > 5 || east - west > 5
            || elevations.length > 65
            || columns < 2 || columns > 65
            || elevations.some(row => !Array.isArray(row) || row.length !== columns
                || row.some(value => value !== null && !Number.isFinite(value)))) {
            throw new Error('A grade de elevação possui dimensões inválidas.');
        }

        const rows = elevations.length;
        const heightValues = elevations.flat().filter(Number.isFinite);
        const baseElevation = heightValues.length
            ? heightValues.reduce((sum, value) => sum + value, 0) / heightValues.length
            : 0;
        const heights = elevations.map(row => row.slice());
        for (let pass = 0; pass < rows + columns; pass++) {
            let filled = false;
            for (let row = 0; row < rows; row++) {
                for (let column = 0; column < columns; column++) {
                    if (Number.isFinite(heights[row][column])) continue;
                    const neighbors = [
                        heights[row - 1]?.[column], heights[row + 1]?.[column],
                        heights[row]?.[column - 1], heights[row]?.[column + 1]
                    ].filter(Number.isFinite);
                    if (neighbors.length) {
                        heights[row][column] = neighbors.reduce((sum, value) => sum + value, 0) / neighbors.length;
                        filled = true;
                    }
                }
            }
            if (!filled) break;
        }

        const projectX = longitude => longitude * Math.PI / 180 * 6378137;
        const projectY = latitude => {
            const radians = latitude * Math.PI / 180;
            return 6378137 * Math.log(Math.tan(Math.PI / 4 + radians / 2));
        };
        const westX = projectX(west);
        const eastX = projectX(east);
        const southY = projectY(south);
        const northY = projectY(north);
        const centerX = (westX + eastX) / 2;
        const centerY = (southY + northY) / 2;
        const vertices = new Float32Array(rows * columns * 5);
        let vertexIndex = 0;
        for (let row = 0; row < rows; row++) {
            const latitude = north - (north - south) * row / (rows - 1);
            for (let column = 0; column < columns; column++) {
                const longitude = west + (east - west) * column / (columns - 1);
                vertices[vertexIndex++] = projectX(longitude) - centerX;
                vertices[vertexIndex++] = (Number.isFinite(heights[row][column]) ? heights[row][column] : baseElevation) * verticalScale
                    - baseElevation * verticalScale;
                vertices[vertexIndex++] = projectY(latitude) - centerY;
                vertices[vertexIndex++] = column / (columns - 1);
                vertices[vertexIndex++] = 1 - row / (rows - 1);
            }
        }

        const indices = new Uint16Array((rows - 1) * (columns - 1) * 6);
        let index = 0;
        for (let row = 0; row < rows - 1; row++) {
            for (let column = 0; column < columns - 1; column++) {
                const topLeft = row * columns + column;
                const topRight = topLeft + 1;
                const bottomLeft = topLeft + columns;
                const bottomRight = bottomLeft + 1;
                indices[index++] = topLeft;
                indices[index++] = bottomLeft;
                indices[index++] = topRight;
                indices[index++] = topRight;
                indices[index++] = bottomLeft;
                indices[index++] = bottomRight;
            }
        }

        return { vertices, indices, rows, columns, width: eastX - westX, depth: northY - southY };
    }
});
