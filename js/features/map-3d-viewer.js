/**
 * @fileoverview Renderiza uma captura do mapa sobre uma malha de elevação SRTM local.
 * @requires WebGL e window.PlanMilT.map3dGeometry
 */
(() => {
    const canvas = document.getElementById('terrainCanvas');
    const status = document.getElementById('viewerStatus');
    const warnings = document.getElementById('viewerWarnings');
    const exaggeration = document.getElementById('verticalExaggeration');
    const exaggerationValue = document.getElementById('verticalExaggerationValue');
    const baseLayer = document.getElementById('baseLayer3D');
    const attribution = document.getElementById('viewerAttribution');
    const gl = canvas.getContext('webgl', { antialias: true, alpha: false });
    const origin = window.location.origin;
    const host = window.parent !== window ? window.parent : null;
    let activeData;
    let mesh;
    let camera = { yaw: -0.65, pitch: 0.7, distance: 1 };
    let initialCamera;
    let texture;
    let vertexBuffer;
    let indexBuffer;
    let pointer;
    let textureReady = false;

    /**
     * Exibe uma mensagem de estado sem interpretar conteúdo externo como HTML.
     * @param {string} message - Texto de status.
     */
    function showStatus(message) {
        status.textContent = message;
        status.hidden = !message;
    }

    /**
     * Compila e valida um shader WebGL.
     * @param {number} type - Tipo de shader.
     * @param {string} source - Código GLSL.
     * @returns {WebGLShader} Shader compilado.
     */
    function compileShader(type, source) {
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            const message = gl.getShaderInfoLog(shader);
            gl.deleteShader(shader);
            throw new Error(message || 'Não foi possível iniciar o renderizador 3D.');
        }
        return shader;
    }

    /**
     * Multiplica matrizes 4×4 em ordem column-major.
     * @param {Float32Array} first - Matriz à esquerda.
     * @param {Float32Array} second - Matriz à direita.
     * @returns {Float32Array} Produto das matrizes.
     */
    function multiplyMatrices(first, second) {
        const result = new Float32Array(16);
        for (let column = 0; column < 4; column++) {
            for (let row = 0; row < 4; row++) {
                for (let index = 0; index < 4; index++) {
                    result[column * 4 + row] += first[index * 4 + row] * second[column * 4 + index];
                }
            }
        }
        return result;
    }

    /**
     * Cria uma matriz de perspectiva.
     * @param {number} fieldOfView - Campo de visão em radianos.
     * @param {number} aspect - Proporção largura/altura.
     * @param {number} near - Distância próxima.
     * @param {number} far - Distância distante.
     * @returns {Float32Array} Matriz de projeção.
     */
    function perspective(fieldOfView, aspect, near, far) {
        const factor = 1 / Math.tan(fieldOfView / 2);
        const range = 1 / (near - far);
        return new Float32Array([
            factor / aspect, 0, 0, 0,
            0, factor, 0, 0,
            0, 0, (far + near) * range, -1,
            0, 0, 2 * far * near * range, 0
        ]);
    }

    /**
     * Monta uma matriz de câmera orientada para o centro do terreno.
     * @param {number[]} eye - Posição da câmera.
     * @param {number[]} target - Ponto observado.
     * @returns {Float32Array} Matriz de visão.
     */
    function lookAt(eye, target) {
        const normalize = vector => {
            const length = Math.hypot(...vector) || 1;
            return vector.map(value => value / length);
        };
        const cross = (first, second) => [
            first[1] * second[2] - first[2] * second[1],
            first[2] * second[0] - first[0] * second[2],
            first[0] * second[1] - first[1] * second[0]
        ];
        const dot = (first, second) => first.reduce((sum, value, index) => sum + value * second[index], 0);
        const zAxis = normalize(eye.map((value, index) => value - target[index]));
        const xAxis = normalize(cross([0, 1, 0], zAxis));
        const yAxis = cross(zAxis, xAxis);
        return new Float32Array([
            xAxis[0], yAxis[0], zAxis[0], 0,
            xAxis[1], yAxis[1], zAxis[1], 0,
            xAxis[2], yAxis[2], zAxis[2], 0,
            -dot(xAxis, eye), -dot(yAxis, eye), -dot(zAxis, eye), 1
        ]);
    }

    /**
     * Inicia o programa e buffers persistentes do terreno.
     */
    function initializeRenderer() {
        if (!gl) throw new Error('Este navegador não oferece WebGL para exibir o terreno 3D.');
        const vertexShader = compileShader(gl.VERTEX_SHADER, `
attribute vec3 a_position;
attribute vec2 a_uv;
uniform mat4 u_mvp;
varying vec2 v_uv;
void main() {
    v_uv = a_uv;
    gl_Position = u_mvp * vec4(a_position, 1.0);
}`);
        const fragmentShader = compileShader(gl.FRAGMENT_SHADER, `
precision mediump float;
uniform sampler2D u_texture;
varying vec2 v_uv;
void main() {
    gl_FragColor = texture2D(u_texture, v_uv);
}`);
        const program = gl.createProgram();
        gl.attachShader(program, vertexShader);
        gl.attachShader(program, fragmentShader);
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            throw new Error(gl.getProgramInfoLog(program) || 'Não foi possível iniciar o renderizador 3D.');
        }
        gl.useProgram(program);
        gl.enable(gl.DEPTH_TEST);
        gl.disable(gl.CULL_FACE);
        vertexBuffer = gl.createBuffer();
        indexBuffer = gl.createBuffer();
        texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.uniform1i(gl.getUniformLocation(program, 'u_texture'), 0);
        gl.useProgram(program);
        canvas.program = program;
    }

    /**
     * Atualiza a malha GPU e a textura do mapa.
     * @param {Object} data - Snapshot recebido da janela principal.
     */
    function setScene(data) {
        activeData = data;
        updateMesh(data);
        const revision = activeData;
        const image = new Image();
        image.onload = () => {
            if (activeData !== revision) return;
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, texture);
            gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
            textureReady = true;
            const span = Math.max(mesh.width, mesh.depth);
            const aspect = canvas.clientWidth / Math.max(1, canvas.clientHeight);
            camera = { ...camera, distance: span * Math.max(1.9, 1.3 / aspect) };
            initialCamera = { ...camera };
            draw();
            const missing = data.missingTiles || [];
            const messages = [];
            if (missing.length) messages.push(`Sem elevação local em ${missing.join(', ')}; o relevo dessas áreas foi interpolado localmente.`);
            attribution.textContent = data.source === 'bdgex'
                ? 'Mapa: BDGEx – CTM50. Elevação: SRTM local.'
                : 'Mapa: © OpenStreetMap contributors, SRTM | © OpenTopoMap (CC-BY-SA). Elevação: SRTM local.';
            warnings.textContent = messages.join(' ');
            warnings.hidden = messages.length === 0;
            showStatus('Visualização atualizada. Arraste para orbitar e use a roda do mouse para aproximar.');
        };
        image.onerror = () => showStatus('Não foi possível carregar a imagem capturada do mapa.');
        image.src = data.image;
    }

    /**
     * Atualiza a malha GPU sem alterar a textura nem a câmera.
     * @param {Object} data - Snapshot com limites e elevações.
     */
    function updateMesh(data) {
        const scale = Number(exaggeration.value);
        mesh = window.PlanMilT.map3dGeometry.createMesh(data, scale);
        gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, mesh.vertices, gl.STATIC_DRAW);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STATIC_DRAW);
        const position = gl.getAttribLocation(canvas.program, 'a_position');
        const uv = gl.getAttribLocation(canvas.program, 'a_uv');
        gl.enableVertexAttribArray(position);
        gl.vertexAttribPointer(position, 3, gl.FLOAT, false, 20, 0);
        gl.enableVertexAttribArray(uv);
        gl.vertexAttribPointer(uv, 2, gl.FLOAT, false, 20, 12);
    }

    /**
     * Desenha a malha usando a câmera orbital atual.
     */
    function draw() {
        if (!gl || !mesh) return;
        const ratio = Math.min(window.devicePixelRatio || 1, 2);
        const width = Math.max(1, Math.round(canvas.clientWidth * ratio));
        const height = Math.max(1, Math.round(canvas.clientHeight * ratio));
        if (canvas.width !== width || canvas.height !== height) {
            canvas.width = width;
            canvas.height = height;
        }
        gl.viewport(0, 0, width, height);
        gl.clearColor(0.06, 0.09, 0.12, 1);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        const center = [0, 0, 0];
        const horizontal = Math.cos(camera.pitch) * camera.distance;
        const eye = [
            Math.sin(camera.yaw) * horizontal,
            Math.sin(camera.pitch) * camera.distance,
            Math.cos(camera.yaw) * horizontal
        ];
        const near = Math.max(mesh.width, mesh.depth) / 10000;
        const far = camera.distance * 10;
        const projection = perspective(Math.PI / 4, width / height, near, far);
        const view = lookAt(eye, center);
        const matrix = multiplyMatrices(projection, view);
        gl.useProgram(canvas.program);
        gl.uniformMatrix4fv(gl.getUniformLocation(canvas.program, 'u_mvp'), false, matrix);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
        gl.drawElements(gl.TRIANGLES, mesh.indices.length, gl.UNSIGNED_SHORT, 0);
    }

    /**
     * Solicita uma captura nova ao mapa principal.
     */
    function requestRefresh() {
        if (!host) {
            showStatus('O mapa principal não está disponível. Abra o visualizador pelo botão 3D do PlanMilT.');
            return;
        }
        host.postMessage({ type: 'planmilt-3d-refresh', source: baseLayer.value }, origin);
        showStatus('Atualizando camada-base e terreno local…');
    }

    window.addEventListener('message', event => {
        if (!host || event.source !== host || event.origin !== origin || !event.data) return;
        if (event.data.type === 'planmilt-3d-status' && typeof event.data.message === 'string') {
            showStatus(event.data.message);
            return;
        }
        if (event.data.type === 'planmilt-3d-error' && typeof event.data.message === 'string') {
            showStatus(event.data.message);
            return;
        }
        if (event.data.type !== 'planmilt-3d-data' || !event.data.payload) return;
        try {
            setScene(event.data.payload);
        } catch (error) {
            showStatus(error.message);
        }
    });

    document.getElementById('refreshViewer').addEventListener('click', requestRefresh);
    baseLayer.addEventListener('change', requestRefresh);
    document.getElementById('closeViewer').addEventListener('click', () => {
        if (host) host.postMessage({ type: 'planmilt-3d-close' }, origin);
    });
    document.getElementById('resetCamera').addEventListener('click', () => {
        if (initialCamera) {
            camera = { ...initialCamera };
            draw();
        }
    });
    exaggeration.addEventListener('input', () => {
        exaggerationValue.textContent = `${exaggeration.value}×`;
        if (activeData) {
            updateMesh(activeData);
            if (textureReady) draw();
        }
    });
    canvas.addEventListener('pointerdown', event => {
        pointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
        canvas.setPointerCapture(event.pointerId);
    });
    canvas.addEventListener('pointermove', event => {
        if (!pointer || pointer.id !== event.pointerId) return;
        camera.yaw += (event.clientX - pointer.x) * 0.008;
        camera.pitch = Math.max(0.08, Math.min(1.48, camera.pitch + (event.clientY - pointer.y) * 0.006));
        pointer.x = event.clientX;
        pointer.y = event.clientY;
        draw();
    });
    canvas.addEventListener('pointerup', () => { pointer = undefined; });
    canvas.addEventListener('pointercancel', () => { pointer = undefined; });
    canvas.addEventListener('wheel', event => {
        event.preventDefault();
        if (!mesh) return;
        const span = Math.max(mesh.width, mesh.depth);
        camera.distance = Math.max(span * 0.2, Math.min(span * 8, camera.distance * Math.exp(event.deltaY * 0.001)));
        draw();
    }, { passive: false });
    window.addEventListener('resize', draw);

    try {
        initializeRenderer();
        if (host) {
            host.postMessage({ type: 'planmilt-3d-ready', source: baseLayer.value }, origin);
            showStatus('Preparando a visualização do mapa…');
        }
    } catch (error) {
        showStatus(error.message);
    }
})();
