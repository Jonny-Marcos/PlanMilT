/**
 * @fileoverview Inicializa sob demanda o editor de temas integrado ao mapa principal.
 * @requires Leaflet, Fabric.js, geocoder, API de imagens, DOM e SweetAlert2.
 */
(function () {
    const state = {
        map: null,
        canvas: null,
        geocoderControl: null,
        editingTheme: null,
        mode: 'image',
        width: 0,
        height: 0
    };
    const editor = document.getElementById('imageEditor');

    /**
     * Exibe alertas acima da sobreposição fixa do editor.
     * @param {Object|string} options Opções ou título do alerta.
     * @param {string} [text] Texto para a forma abreviada.
     * @param {string} [icon] Ícone para a forma abreviada.
     * @returns {Promise<Object>} Resultado do SweetAlert2.
     */
    function showEditorAlert(options, text, icon) {
        const config = typeof options === 'string'
            ? { title: options, text, icon }
            : options;
        document.body.classList.add('image-editor-alert-open');
        return Swal.fire(config).finally(() => {
            document.body.classList.remove('image-editor-alert-open');
        });
    }

    /**
     * Inicializa o mapa, o canvas e os controles do editor uma única vez.
     */
    function initializeEditor() {
        const mapElement = document.getElementById('imageEditorMap');
        const canvasElement = document.getElementById('imageEditorCanvas');

        fabric.filterBackend = new fabric.Canvas2dFilterBackend();
        fabric.Object.prototype.set({
            borderColor: '#333333',
            cornerColor: '#333333',
            cornerStrokeColor: '#ffffff',
            cornerSize: 14,
            transparentCorners: false,
            rotatingPointOffset: 20,
            padding: 0
        });

        state.canvas = new fabric.Canvas(canvasElement, {
            selection: true,
            preserveObjectStacking: true,
            width: mapElement.clientWidth,
            height: mapElement.clientHeight
        });
        state.canvas.wrapperEl.style.position = 'absolute';
        state.canvas.wrapperEl.style.top = '0';
        state.canvas.wrapperEl.style.left = '0';
        state.canvas.wrapperEl.style.zIndex = '500';
        state.canvas.wrapperEl.style.pointerEvents = 'auto';
        state.canvas.wrapperEl.style.overflow = 'visible';
        state.canvas.upperCanvasEl.style.pointerEvents = 'auto';
        state.canvas.upperCanvasEl.style.zIndex = '2';
        state.canvas.upperCanvasEl.style.touchAction = 'none';
        state.canvas.lowerCanvasEl.style.pointerEvents = 'none';
        state.canvas.lowerCanvasEl.style.zIndex = '1';
        state.canvas.skipTargetFind = false;
        state.canvas.selection = false;
        state.width = mapElement.clientWidth;
        state.height = mapElement.clientHeight;

        const mainMap = window.map;
        const initialCenter = mainMap ? mainMap.getCenter() : [-23.5505, -46.6333];
        const initialZoom = mainMap ? mainMap.getZoom() : 10;
        state.map = L.map(mapElement, {
            attributionControl: false,
            zoomControl: true,
            dragging: false,
            zoom: 10
        }).setView(initialCenter, initialZoom);

        L.tileLayer('https://tile.opentopomap.org/{z}/{x}/{y}.png', {
            opacity: 1,
            attribution: '',
            minZoom: 1,
            maxZoom: 28,
            minNativeZoom: 0,
            maxNativeZoom: 18
        }).addTo(state.map);

        const TranslateControl = L.Control.extend({
            options: { position: 'topright' },
            onAdd: () => {
                const element = L.DomUtil.create('div', 'google-translate-control leaflet-bar');
                element.id = 'image_editor_google_translate_element';
                element.style.backgroundColor = 'white';
                element.style.padding = '5px';
                element.style.borderRadius = '5px';
                element.style.boxShadow = '0 2px 4px rgba(0,0,0,0.2)';
                return element;
            }
        });
        state.map.addControl(new TranslateControl());
        window.googleTranslateElementInit?.();

        state.geocoderControl = L.Control.geocoder({
            position: 'topright',
            placeholder: 'Buscar cidade...',
            errorMessage: 'Local não encontrado.',
            defaultMarkGeocode: false
        }).on('markgeocode', event => state.map.fitBounds(event.geocode.bbox));
        state.geocoderControl.addTo(state.map);

        const imageTools = new L.Control({ position: 'topleft' });
        imageTools.onAdd = () => {
            const element = L.DomUtil.get('imageEditorTools');
            L.DomEvent.disableClickPropagation(element);
            return element;
        };
        imageTools.addTo(state.map);

        addMapLayers();
        state.map.invalidateSize();
        setMode('image');
    }

    /**
     * Adiciona as quadrículas UTM e a camada BDGEx ao controle de camadas.
     */
    function addMapLayers() {
        const utmGrids = L.layerGroup();
        const gridColors = ['#080', '#800', '#880', '#008', '#080', '#800', '#880'];
        gridColors.forEach((color, index) => {
            utmGrids.addLayer(L.utmGrid(index + 19, true, {
                color,
                showAxisLabels: [100, 1000, 10000, 100000],
                showSquareLabels: [100000],
                showAxis100km: true
            }));
        });

        state.map.addLayer(utmGrids);
        const bdgexLayer = L.tileLayer.wms('https://bdgex.eb.mil.br/mapcache', {
            layers: 'ctm50',
            format: 'image/png',
            transparent: true,
            version: '1.1.1',
            tileSize: 96,
            crs: L.CRS.EPSG4326,
            dpiMode: 7,
            tileMatrixSet: 'ctm50-wmsc-2'
        });

        L.control.layers(null, {
            'Quadrículas - UTM': utmGrids,
            'BDGEx - CTM50': bdgexLayer
        }, { collapsed: false }).addTo(state.map);
    }

    /**
     * Abre o editor e cria seus componentes apenas na primeira utilização.
     */
    function openImageEditor() {
        editor.hidden = false;
        showMainMenu();
        if (!state.map) {
            initializeEditor();
        } else {
            setMode('image');
            requestAnimationFrame(resizeEditor);
        }
    }

    /**
     * Fecha o editor e recalcula o tamanho do mapa principal.
     */
    function closeImageEditor() {
        editor.hidden = true;
        showMainMenu();
        if (window.map) {
            requestAnimationFrame(() => window.map.invalidateSize());
        }
    }

    /**
     * Escapa nomes de temas antes de inseri-los no seletor HTML.
     * @param {string} value Texto fornecido pelo banco.
     * @returns {string} Texto seguro para conteúdo HTML.
     */
    function escapeHtml(value) {
        return String(value).replace(/[&<>"']/g, character => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        })[character]);
    }

    /**
     * Busca a lista de temas e permite escolher um para edição.
     */
    async function chooseThemeToEdit() {
        try {
            const response = await window.PlanMilT.apiClient.request('image-load.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
            });
            const data = await response.json();
            if (!response.ok || !Array.isArray(data.images)) {
                throw new Error(data.error || 'Não foi possível listar os temas.');
            }
            if (data.images.length === 0) {
                await showEditorAlert('Nenhum tema disponível', 'Salve um tema antes de carregá-lo para edição.', 'info');
                return;
            }

            const options = data.images
                .map(image => `<option value="${escapeHtml(image.id)}">${escapeHtml(image.descricao)}</option>`)
                .join('');
            const { value: imageId } = await showEditorAlert({
                title: 'Carregar tema para edição',
                html: `<select id="imageEditorThemeSelect" class="swal2-input">${options}</select>`,
                showCancelButton: true,
                confirmButtonText: 'Carregar',
                preConfirm: () => document.getElementById('imageEditorThemeSelect').value
            });
            if (imageId) await loadThemeForEditing(imageId);
        } catch (error) {
            console.error('[PlanMilT][Editor] Falha ao listar temas para edição.', error);
            await showEditorAlert('Erro!', 'Não foi possível obter a lista de temas.', 'error');
        }
    }

    /**
     * Busca o conteúdo de um tema, solicitando senha quando necessária.
     * @param {string} imageId Identificador persistido do tema.
     * @param {string} [password] Senha atual, mantida somente durante a edição.
     * @returns {Promise<Object>} Imagem e metadados autorizados pelo endpoint.
     */
    async function requestThemeForEditing(imageId, password = '') {
        const params = new URLSearchParams({ id: imageId, modo: 'edicao' });
        if (password) params.set('senha', password);
        const response = await window.PlanMilT.apiClient.request('image-load.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: params.toString()
        });
        return response.json();
    }

    /**
     * Carrega o tema selecionado no canvas para edição.
     * @param {string} imageId Identificador persistido do tema.
     */
    async function loadThemeForEditing(imageId) {
        let password = '';
        let passwordAttempts = 0;
        let data;
        while (passwordAttempts <= 3) {
            try {
                data = await requestThemeForEditing(imageId, password);
            } catch (error) {
                console.error('[PlanMilT][Editor] Falha ao carregar tema para edição.', error);
                await showEditorAlert('Erro!', 'Não foi possível carregar o tema.', 'error');
                return;
            }
            if (data.url && Array.isArray(data.bounds)) break;
            if (data.error !== 'Senha incorreta ou não fornecida.' || passwordAttempts === 3) {
                await showEditorAlert('Erro!', data.error || 'Tema não encontrado ou dados incompletos.', 'error');
                return;
            }

            const { value: enteredPassword } = await showEditorAlert({
                title: 'Senha necessária',
                input: 'password',
                inputPlaceholder: 'Digite a senha do tema',
                showCancelButton: true,
                confirmButtonText: 'Carregar',
                preConfirm: value => {
                    if (!value) {
                        Swal.showValidationMessage('A senha não pode estar vazia.');
                        return false;
                    }
                    return value;
                }
            });
            if (!enteredPassword) return;
            password = enteredPassword;
            passwordAttempts += 1;
        }

        if (!data?.url || !Array.isArray(data.bounds) || data.bounds.length < 2) {
            await showEditorAlert('Erro!', 'Tema não encontrado ou dados incompletos.', 'error');
            return;
        }
        if (data.bounds.some(point => !Array.isArray(point) || point.length < 2 ||
            !point.every(Number.isFinite))) {
            console.error('[PlanMilT][Editor] Limites geográficos inválidos no tema carregado.');
            await showEditorAlert('Erro!', 'Os limites geográficos do tema são inválidos.', 'error');
            return;
        }
        state.map.fitBounds(data.bounds, { animate: false });
        state.map.invalidateSize({ pan: false });
        fabric.Image.fromURL(data.url, image => {
            if (!image || image.width <= 0 || image.height <= 0) {
                console.error('[PlanMilT][Editor] O tema carregado não pôde ser decodificado.');
                showEditorAlert('Erro!', 'Não foi possível abrir a imagem do tema.', 'error');
                return;
            }
            const northWest = state.map.latLngToContainerPoint(data.bounds[0]);
            const southEast = state.map.latLngToContainerPoint(data.bounds[1]);
            const width = southEast.x - northWest.x;
            const height = southEast.y - northWest.y;
            if (![northWest.x, northWest.y, southEast.x, southEast.y, width, height].every(Number.isFinite) ||
                width <= 0 || height <= 0) {
                console.error('[PlanMilT][Editor] Limites inválidos no tema carregado.');
                showEditorAlert('Erro!', 'Os limites geográficos do tema são inválidos.', 'error');
                return;
            }
            image.filters = [];
            image.set({
                scaleX: width / image.width,
                scaleY: height / image.height,
                originX: 'left',
                originY: 'top',
                left: northWest.x,
                top: northWest.y
            });
            state.editingTheme = {
                id: imageId,
                description: data.descricao,
                password,
                isShared: data.compartilhavel === true
            };
            document.getElementById('imageEditorBrightness').value = '1';
            document.getElementById('imageEditorContrast').value = '1';
            document.getElementById('imageEditorDropHint').hidden = true;
            addEditableImage(image);
            console.info('[PlanMilT][Editor] Tema carregado para edição.', { id: imageId });
        }, { crossOrigin: 'anonymous' });
    }

    /**
     * Define os controles e substitui a imagem atual no canvas.
     * @param {fabric.Image} image Imagem que será editada.
     * @param {Object} [position] Transformação inicial específica da imagem.
     */
    function addEditableImage(image, position = {}) {
        image.set({
            selectable: true,
            evented: true,
            hasControls: true,
            hasBorders: true,
            lockMovementX: false,
            lockMovementY: false,
            lockScalingX: false,
            lockScalingY: false,
            lockRotation: false,
            lockUniScaling: false,
            ...position
        });
        state.canvas.clear();
        image.setCoords();
        state.canvas.add(image);
        state.canvas.setActiveObject(image);
        state.canvas.calcOffset();
        state.canvas.renderAll();
        setMode('image');
    }

    /**
     * Alterna entre posicionar a imagem e navegar pelo mapa.
     * @param {'image'|'map'} mode Modo de interação ativo.
     */
    function setMode(mode) {
        state.mode = mode;
        const isMapMode = mode === 'map';
        const modeButton = document.getElementById('imageEditorMode');
        const hasImage = state.canvas.getObjects().some(object => object.type === 'image');
        const hint = document.getElementById('imageEditorHint');
        const modeLabel = document.getElementById('imageEditorModeLabel');
        modeLabel.textContent = isMapMode ? 'Posicionar imagem' : 'Mover mapa';
        modeButton.setAttribute('aria-pressed', String(isMapMode));
        modeButton.classList.toggle('image-editor-mode-active', isMapMode);
        hint.hidden = !hasImage;
        hint.textContent = isMapMode
            ? 'Arraste para navegar; volte a Posicionar imagem para editar.'
            : 'Arraste a imagem para mover; use os cantos para redimensionar ou esticar e a alça superior para girar.';
        state.canvas.selection = !isMapMode;
        state.canvas.wrapperEl.style.pointerEvents = isMapMode ? 'none' : 'auto';
        const zoomControl = state.map.zoomControl.getContainer();
        zoomControl.hidden = !isMapMode;
        zoomControl.style.display = isMapMode ? '' : 'none';

        ['dragging', 'scrollWheelZoom', 'doubleClickZoom', 'boxZoom', 'keyboard', 'touchZoom']
            .forEach(interaction => {
                const handler = state.map[interaction];
                if (!handler) return;
                if (isMapMode) {
                    handler.enable();
                } else {
                    handler.disable();
                }
            });
        if (isMapMode) {
            state.canvas.discardActiveObject();
            state.canvas.renderAll();
        } else {
            const image = state.canvas.getObjects().find(object => object.type === 'image');
            if (image) state.canvas.setActiveObject(image);
        }
    }

    /**
     * Desloca o mapa em uma direção sem alterar a posição da imagem.
     * @param {'up'|'down'|'left'|'right'} direction Direção do deslocamento.
     */
    function panMap(direction) {
        const offsets = {
            up: [0, -120],
            down: [0, 120],
            left: [-120, 0],
            right: [120, 0]
        };
        const offset = offsets[direction];
        if (offset) state.map.panBy(offset);
    }

    /**
     * Aplica o zoom solicitado pelos controles do editor.
     * @param {'in'|'out'} direction Aproximar ou afastar o mapa.
     */
    function zoomMap(direction) {
        if (direction === 'in') state.map.zoomIn();
        if (direction === 'out') state.map.zoomOut();
    }

    /**
     * Mostra o menu principal e esconde os ajustes.
     */
    function showMainMenu() {
        document.getElementById('imageEditorMainMenu').hidden = false;
        document.getElementById('imageEditorAdjustmentMenu').hidden = true;
        document.getElementById('imageEditorOpenAdjustments').setAttribute('aria-expanded', 'false');
    }

    /**
     * Abre a tela de ajustes no lugar do menu principal.
     */
    function showAdjustmentMenu() {
        document.getElementById('imageEditorMainMenu').hidden = true;
        document.getElementById('imageEditorAdjustmentMenu').hidden = false;
        document.getElementById('imageEditorOpenAdjustments').setAttribute('aria-expanded', 'true');
    }

    /**
     * Mantém canvas e mapa alinhados quando o editor muda de tamanho.
     */
    function resizeEditor() {
        if (editor.hidden || !state.map || !state.canvas) return;
        const mapElement = document.getElementById('imageEditorMap');
        const width = mapElement.clientWidth;
        const height = mapElement.clientHeight;
        const offsetX = (width - state.width) / 2;
        const offsetY = (height - state.height) / 2;

        state.canvas.getObjects().forEach(object => {
            object.set({
                left: object.left + offsetX,
                top: object.top + offsetY
            });
            object.setCoords();
        });
        state.canvas.setDimensions({ width, height });
        state.canvas.renderAll();
        state.width = width;
        state.height = height;
        state.map.invalidateSize();
    }

    /**
     * Carrega a imagem no centro do mapa sem alterar o tamanho da área de edição.
     * @param {File} file Imagem selecionada pelo usuário.
     */
    function loadImage(file) {
        if (!file || !file.type.startsWith('image/')) {
            showEditorAlert('Arquivo inválido', 'Escolha um arquivo de imagem para criar o tema.', 'warning');
            return;
        }

        const reader = new FileReader();
        reader.onerror = () => {
            console.error('[PlanMilT][Editor] Falha ao ler o arquivo de imagem.');
            showEditorAlert('Erro!', 'Não foi possível ler a imagem selecionada.', 'error');
        };
        reader.onload = event => {
            fabric.Image.fromURL(event.target.result, image => {
                if (!image || image.width <= 0 || image.height <= 0) {
                    console.error('[PlanMilT][Editor] O arquivo selecionado não pôde ser decodificado como imagem.');
                    showEditorAlert('Erro!', 'Não foi possível abrir a imagem selecionada.', 'error');
                    return;
                }
                const scale = Math.min(
                    (state.width * 0.8) / image.width,
                    (state.height * 0.8) / image.height
                );
                image.set({
                    scaleX: scale,
                    scaleY: scale,
                    originX: 'center',
                    originY: 'center',
                    left: state.width / 2,
                    top: state.height / 2
                });
                state.editingTheme = null;
                document.getElementById('imageEditorDropHint').hidden = true;
                document.getElementById('imageEditorBrightness').value = '1';
                document.getElementById('imageEditorContrast').value = '1';
                addEditableImage(image);
            }, { crossOrigin: 'anonymous' });
        };
        reader.readAsDataURL(file);
    }

    /**
     * Atualiza ou adiciona um filtro Fabric à imagem ativa.
     * @param {string} filterType Nome do filtro Fabric.
     * @param {Object} options Opções do filtro.
     */
    function applyFilter(filterType, options) {
        const activeObject = state.canvas.getActiveObject();
        if (!activeObject) return;
        let filter = activeObject.filters.find(item => item && item.type === filterType);
        if (filter) {
            Object.assign(filter, options);
        } else {
            filter = new fabric.Image.filters[filterType](options);
            activeObject.filters.push(filter);
        }
        activeObject.applyFilters();
        state.canvas.renderAll();
    }

    /**
     * Remove a cor branca da imagem selecionada.
     */
    function removeBackground() {
        const activeObject = state.canvas.getActiveObject();
        if (!activeObject) {
            console.warn('[PlanMilT][Editor] Selecione uma imagem antes de remover o fundo.');
            return;
        }
        if (activeObject.type !== 'image') return;

        let filter = activeObject.filters.find(item => item && item.type === 'RemoveColor');
        if (!filter) {
            filter = new fabric.Image.filters.RemoveColor({ threshold: 200, color: '#FFFFFF' });
            activeObject.filters.push(filter);
        } else {
            Object.assign(filter, { threshold: 200, color: '#FFFFFF' });
        }
        activeObject.applyFilters();
        state.canvas.renderAll();
    }

    /**
     * Remove os filtros da imagem selecionada.
     */
    function resetImage() {
        document.getElementById('imageEditorBrightness').value = '1';
        document.getElementById('imageEditorContrast').value = '1';
        const activeObject = state.canvas.getActiveObject();
        if (!activeObject) return;
        activeObject.filters = [];
        activeObject.applyFilters();
        state.canvas.renderAll();
    }

    /**
     * Remove a imagem selecionada do canvas.
     */
    function removeImage() {
        const activeObject = state.canvas.getActiveObject();
        if (!activeObject || activeObject.type !== 'image') return;
        state.canvas.remove(activeObject);
        state.canvas.discardActiveObject();
        state.editingTheme = null;
        state.canvas.renderAll();
        document.getElementById('imageEditorDropHint').hidden = false;
        setMode('image');
    }

    /**
     * Alterna o filtro de escala de cinza da imagem selecionada.
     */
    function applyGrayscale() {
        const activeObject = state.canvas.getActiveObject();
        if (!activeObject) {
            alert('Por favor, selecione uma imagem para aplicar o filtro.');
            return;
        }
        if (activeObject.filters.some(filter => filter && filter.type === 'Grayscale')) {
            alert('O filtro de escala de cinza já está aplicado nesta imagem.');
            return;
        }
        activeObject.filters.push(new fabric.Image.filters.Grayscale());
        activeObject.applyFilters();
        state.canvas.renderAll();
    }

    /**
     * Solicita os dados da imagem e envia o calco com seus limites geográficos.
     */
    async function saveImage() {
        if (!state.canvas.getObjects().some(object => object.type === 'image')) {
            await showEditorAlert('Imagem necessária', 'Envie uma imagem antes de salvar o tema.', 'warning');
            return;
        }
        state.canvas.renderAll();
        const imageDataUrl = state.canvas.toDataURL('image/png', 1);
        const mapBounds = state.map.getBounds();
        const canvasBounds = [
            [mapBounds.getNorthWest().lat, mapBounds.getNorthWest().lng],
            [mapBounds.getSouthEast().lat, mapBounds.getSouthEast().lng]
        ];

        const editingTheme = state.editingTheme;
        const { value: formValues } = await showEditorAlert({
            title: editingTheme ? 'Atualizar tema' : 'Salvar Imagem',
            html: '<label for="descricao">Título do Calco:</label>' +
                `<input id="swal-input1" class="swal2-input" placeholder="Digite o título" value="${escapeHtml(editingTheme?.description || '')}">` +
                `<label for="swal-input2">${editingTheme ? 'Nova senha (opcional):' : 'Senha (opcional):'}</label>` +
                '<input id="swal-input2" class="swal2-input" type="password" placeholder="Deixe vazio para manter a senha atual">' +
                `<label><input type="checkbox" id="swal-input3" ${editingTheme?.isShared ? 'checked' : ''}> Compartilhar sem senha</label>`,
            focusConfirm: false,
            showCancelButton: true,
            confirmButtonText: 'Salvar',
            preConfirm: () => {
                const descricao = document.getElementById('swal-input1').value;
                const senha = document.getElementById('swal-input2').value;
                const compartilhavel = document.getElementById('swal-input3').checked;
                if (!descricao) {
                    Swal.showValidationMessage('O título do Calco é obrigatório!');
                    return false;
                }
                return { descricao, senha, compartilhavel };
            }
        });
        if (!formValues) return;

        const formData = new FormData();
        formData.append('descricao', formValues.descricao);
        formData.append('senha', formValues.senha);
        formData.append('compartilhavel', formValues.compartilhavel);
        formData.append('imagem', imageDataUrl);
        formData.append('localizacao', JSON.stringify(canvasBounds));
        if (editingTheme) {
            formData.append('id', editingTheme.id);
            formData.append('senha_atual', editingTheme.password);
        }

        try {
            const response = await window.PlanMilT.apiClient.request('image-save.php', {
                method: 'POST',
                body: formData
            });
            const message = (await response.text()).trim();
            if (!response.ok ||
                (message !== 'Imagem salva com sucesso!' && message !== 'Imagem atualizada com sucesso!')) {
                console.error('[PlanMilT][Imagens] Servidor recusou o salvamento.', {
                    status: response.status
                });
                await showEditorAlert('Erro!', 'Erro ao salvar a imagem.', 'error');
                return;
            }
            if (editingTheme) {
                state.editingTheme = {
                    ...editingTheme,
                    description: formValues.descricao,
                    password: formValues.senha || editingTheme.password,
                    isShared: formValues.compartilhavel
                };
            }
            console.info('[PlanMilT][Imagens] Imagem salva.', {
                compartilhavel: formValues.compartilhavel,
                atualizada: Boolean(editingTheme)
            });
            await showEditorAlert(
                'Sucesso!',
                editingTheme ? 'Tema atualizado com sucesso!' : 'Imagem salva com sucesso!',
                'success'
            );
        } catch (error) {
            console.error('[PlanMilT][Imagens] Falha na requisição de salvamento.', error);
            await showEditorAlert('Erro!', 'Erro ao salvar a imagem.', 'error');
        }
    }

    document.getElementById('closeImageEditor').addEventListener('click', closeImageEditor);
    document.getElementById('imageEditorFile').addEventListener('change', event => {
        if (event.target.files[0]) loadImage(event.target.files[0]);
        event.target.value = '';
    });
    document.getElementById('imageEditorLoadTheme').addEventListener('click', chooseThemeToEdit);
    document.getElementById('imageEditorBrightness').addEventListener('input', event => {
        applyFilter('Brightness', { brightness: parseFloat(event.target.value) - 1 });
    });
    document.getElementById('imageEditorContrast').addEventListener('input', event => {
        applyFilter('Contrast', { contrast: parseFloat(event.target.value) });
    });
    document.getElementById('imageEditorTools').addEventListener('click', event => {
        if (event.target.closest('[data-image-editor-back]')) {
            showMainMenu();
            return;
        }
        if (event.target.closest('#imageEditorOpenAdjustments')) {
            showAdjustmentMenu();
            return;
        }
        const action = event.target.closest('[data-image-editor-action]')?.dataset.imageEditorAction;
        const actions = {
            save: saveImage,
            'remove-background': removeBackground,
            grayscale: applyGrayscale,
            reset: resetImage,
            remove: removeImage
        };
        if (action && actions[action]) return actions[action]();
    });
    document.getElementById('imageEditorMode').addEventListener('click', () => {
        setMode(state.mode === 'image' ? 'map' : 'image');
    });
    document.getElementById('imageEditorNavigation').addEventListener('click', event => {
        const panDirection = event.target.closest('[data-image-editor-pan]')?.dataset.imageEditorPan;
        if (panDirection) {
            panMap(panDirection);
            return;
        }
        const zoomDirection = event.target.closest('[data-image-editor-zoom]')?.dataset.imageEditorZoom;
        if (zoomDirection) zoomMap(zoomDirection);
    });
    editor.addEventListener('dragover', event => {
        event.preventDefault();
        editor.classList.add('is-drop-target');
    });
    editor.addEventListener('dragleave', event => {
        if (!editor.contains(event.relatedTarget)) {
            editor.classList.remove('is-drop-target');
        }
    });
    editor.addEventListener('drop', event => {
        event.preventDefault();
        editor.classList.remove('is-drop-target');
        const file = event.dataTransfer?.files?.[0];
        if (file) loadImage(file);
    });
    window.addEventListener('resize', resizeEditor);
    window.addEventListener('blur', () => {
        if (!editor.hidden && state.mode === 'map') setMode('image');
    });

    window.PlanMilT = window.PlanMilT || {};
    window.PlanMilT.openImageEditor = openImageEditor;
    if (new URLSearchParams(window.location.search).has('abrir-criador-tema')) {
        const url = new URL(window.location.href);
        url.searchParams.delete('abrir-criador-tema');
        window.history.replaceState(null, '', url);
        openImageEditor();
    }
})();
