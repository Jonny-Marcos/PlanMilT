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
    const baseZoom = document.getElementById('baseZoom3D');
    const attribution = document.getElementById('viewerAttribution');
    const controlFields = document.getElementById('viewerControlFields');
    const toggleControls = document.getElementById('toggleViewerControls');
    const mobileControls = window.matchMedia('(max-width: 600px), (hover: none) and (pointer: coarse)');
    const gl = canvas.getContext('webgl', { antialias: true, alpha: false });
    const origin = window.location.origin;
    const host = window.parent !== window ? window.parent : null;
    let activeData;
    let mesh;
    let camera = { yaw: -0.65, pitch: 0.7, distance: 1, x: 0, z: 0 };
    let initialCamera;
    let texture;
    let vertexBuffer;
    let indexBuffer;
    let pointer;
    const touches = new Map();
    let zoomOverride = null;
    let textureReady = false;
    let showingHint = false;

    /**
     * Exibe uma mensagem de estado sem interpretar conteúdo externo como HTML.
     * @param {string} message - Texto de status.
     * @param {boolean} [hint=false] - Indica uma dica que pode ser ocultada com os controles.
     */
    function showStatus(message, hint = false) {
        showingHint = hint;
        status.textContent = message;
        status.hidden = !message || (hint && controlFields.hidden);
    }

    /**
     * Alterna os controles móveis sem ocultar atribuições, erros ou avisos.
     * @param {boolean} visible - Indica se os controles devem estar visíveis.
     */
    function setControlsVisible(visible) {
        controlFields.hidden = !visible;
        toggleControls.setAttribute('aria-expanded', String(visible));
        toggleControls.textContent = visible ? 'Ocultar controles' : 'Mostrar controles';
        status.hidden = !status.textContent || (showingHint && !visible);
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
        const sameBounds = activeData && activeData.bounds.every((value, index) => value === data.bounds[index]);
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
            if (!sameBounds || !initialCamera) {
                const span = Math.max(mesh.width, mesh.depth);
                const aspect = canvas.clientWidth / Math.max(1, canvas.clientHeight);
                camera = { ...camera, x: 0, z: 0, distance: span * Math.max(1.9, 1.3 / aspect) };
                initialCamera = { ...camera };
            }
            baseZoom.value = String(data.zoom);
            zoomOverride = data.zoomRequested;
            draw();
            const missing = data.missingTiles || [];
            const messages = [];
            if (missing.length) messages.push(`Sem elevação local em ${missing.join(', ')}; o relevo dessas áreas foi interpolado localmente.`);
            attribution.textContent = data.source === 'bdgex'
                ? 'Mapa: BDGEx – CTM50. Elevação: SRTM local.'
                : 'Mapa: © OpenStreetMap contributors, SRTM | © OpenTopoMap (CC-BY-SA). Elevação: SRTM local.';
            warnings.textContent = messages.join(' ');
            warnings.hidden = messages.length === 0;
            showStatus('Arraste para orbitar; botão do meio ou dois dedos deslocam. Use a roda ou pince para aproximar.', true);
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
        const center = [camera.x, 0, camera.z];
        const horizontal = Math.cos(camera.pitch) * camera.distance;
        const eye = [
            camera.x + Math.sin(camera.yaw) * horizontal,
            Math.sin(camera.pitch) * camera.distance,
            camera.z + Math.cos(camera.yaw) * horizontal
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
        host.postMessage({ type: 'planmilt-3d-refresh', source: baseLayer.value, zoom: zoomOverride }, origin);
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

    toggleControls.addEventListener('click', () => setControlsVisible(controlFields.hidden));
    mobileControls.addEventListener('change', () => {
        if (!mobileControls.matches && controlFields.hidden) setControlsVisible(true);
    });
    document.getElementById('refreshViewer').addEventListener('click', requestRefresh);
    document.getElementById('applyBaseZoom').addEventListener('click', () => {
        const zoom = baseZoom.value === '' ? NaN : Number(baseZoom.value);
        if (!Number.isInteger(zoom) || zoom < 0 || zoom > 18) {
            showStatus('Informe um zoom inteiro entre 0 e 18.');
            return;
        }
        zoomOverride = zoom;
        requestRefresh();
    });
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
    /**
     * Desloca a câmera no plano do terreno conforme a orientação e a escala da vista.
     * @param {number} dx - Deslocamento horizontal em pixels.
     * @param {number} dy - Deslocamento vertical em pixels.
     */
    function pan(dx, dy) {
        if (!mesh) return;
        const scale = 2 * camera.distance * Math.tan(Math.PI / 8) / Math.max(1, canvas.clientHeight);
        const vertical = dy / Math.max(0.2, Math.sin(camera.pitch));
        camera.x += scale * (-dx * Math.cos(camera.yaw) - vertical * Math.sin(camera.yaw));
        camera.z += scale * (dx * Math.sin(camera.yaw) - vertical * Math.cos(camera.yaw));
    }

    /**
     * Aproxima ou afasta a câmera respeitando os limites do terreno.
     * @param {number} factor - Multiplicador da distância atual.
     */
    function zoomCamera(factor) {
        if (!mesh) return;
        const span = Math.max(mesh.width, mesh.depth);
        camera.distance = Math.max(span * 0.2, Math.min(span * 8, camera.distance * factor));
    }

    canvas.addEventListener('pointerdown', event => {
        if (event.pointerType === 'touch') {
            touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
            pointer = touches.size === 1 ? { id: event.pointerId, x: event.clientX, y: event.clientY, mode: 'orbit' } : undefined;
        } else {
            if (event.button !== 0 && event.button !== 1) return;
            event.preventDefault();
            pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, mode: event.button === 1 ? 'pan' : 'orbit' };
        }
        canvas.setPointerCapture(event.pointerId);
    });
    canvas.addEventListener('pointermove', event => {
        if (event.pointerType === 'touch' && touches.has(event.pointerId)) {
            const before = [...touches.values()];
            touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
            const after = [...touches.values()];
            if (after.length === 2) {
                pan((after[0].x + after[1].x - before[0].x - before[1].x) / 2,
                    (after[0].y + after[1].y - before[0].y - before[1].y) / 2);
                const oldDistance = Math.hypot(before[0].x - before[1].x, before[0].y - before[1].y);
                const newDistance = Math.hypot(after[0].x - after[1].x, after[0].y - after[1].y);
                if (oldDistance > 0 && newDistance > 0) zoomCamera(oldDistance / newDistance);
                draw();
                return;
            }
            if (after.length !== 1) return;
        }
        if (!pointer || pointer.id !== event.pointerId) return;
        const dx = event.clientX - pointer.x;
        const dy = event.clientY - pointer.y;
        if (pointer.mode === 'pan') pan(dx, dy);
        else {
            camera.yaw += dx * 0.008;
            camera.pitch = Math.max(0.08, Math.min(1.48, camera.pitch + dy * 0.006));
        }
        pointer.x = event.clientX;
        pointer.y = event.clientY;
        draw();
    });
    /**
     * Encerra o gesto e mantém o dedo restante pronto para orbitar.
     * @param {PointerEvent} event - Evento de liberação ou cancelamento.
     */
    function endPointer(event) {
        if (event.pointerType === 'touch') {
            touches.delete(event.pointerId);
            if (touches.size === 1) {
                const [id, point] = touches.entries().next().value;
                pointer = { id, ...point, mode: 'orbit' };
            } else pointer = undefined;
        } else if (pointer && pointer.id === event.pointerId) pointer = undefined;
    }
    canvas.addEventListener('pointerup', endPointer);
    canvas.addEventListener('pointercancel', endPointer);
    canvas.addEventListener('auxclick', event => { if (event.button === 1) event.preventDefault(); });
    canvas.addEventListener('wheel', event => {
        event.preventDefault();
        zoomCamera(Math.exp(event.deltaY * 0.001));
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
