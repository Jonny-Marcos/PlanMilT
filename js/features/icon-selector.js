/**
 * @fileoverview Carrega ícones, oferece seleção para marcadores e mantém o último ícone escolhido.
 * @exports window.PlanMilT.iconSelector
 * @requires Container, preview, Leaflet e API client
 */
window.PlanMilT = window.PlanMilT || {};

const ICON_BROWSER_CATEGORIES = [
    { label: 'Infantaria', names: `bda-inf-amv bda-inf-bld bda-inf-bld-planejada bda-inf-mec bda-inf-mec-planejada bda-inf-mtz bda-inf-mtz-planejada bda-inf-pqdt
        btl-inf-amv btl-inf-bld btl-inf-mec btl-inf-mnth btl-inf-mtz btl-inf-pqdt cia-inf-bld cia-inf-mec cia-inf-mtz
        ft-btl-inf-mec pc-bda-inf-bld-planejada pc-bda-inf-mec pc-bda-inf-mec-planejada pel-inf-mec pel-inf
        cia-ac corpo-ex pc-de ft-blt-inf-mec ft-btl-inf-bld ft-cia-inf-amv ft-cia-inf-mec
        cia-ass-civ cia-c-ap cia-pe de ft-bil-amv pc-de-pcp-planejada` },
    { label: 'Cavalaria', names: `bda-cav-bld bda-cav-bld-planejada bda-cav-mec bda-cav-mec-planejada esqd-c-bld esqd-c-mec
        ft-reg-c-mec pc-bda-cav-bld-planejada pc-bda-cav-mec-planejada pel-c-mec rgt-cav-bld rgt-cav-mec
        esqd-cav ft-cia-cav-mec ft-esqd-car-cmb ft-rgt-car-cmb ft-rgt-cav-mec reg-cav-bld reg-cav-mec` },
    { label: 'Artilharia', names: `art-c-ex art-div bda-aaae bia-105ar bia-aaae bia-art-cmp bia-art bia-mf gaaae
        gac-105ap gac-105ar gac-155ap gac-155apsr gac-155ar gac gac-155-AR glmf pc-art-div sç-art
        bia-cmdo cia-busc-alvos` },
    { label: 'Engenharia', names: `btl-eng btl-eng-cmb btl-eng-cnst cia-eng-amv cia-eng-bld cia-eng-l cia-eng-mec
        cia-eng-pnt cia-eng-pqdt gpt-eng pc-gpt-eng` },
    { label: 'Logística', names: 'bsau gpt-log btl-log' },
    { label: 'Comunicações', names: `bcom cia-c2 cia-com pel-com btl-com pc-cia-com pel-rad
        btl-com-ge cia-ge mae-confirmada mae-estimada mage-confirmada mage-estimada pel-ge
        bcomge bge gce gp-cntr-sist` },
    { label: 'Aviação', names: 'bavex esqd-avex' }
].map(category => ({ ...category, names: category.names.split(/\s+/).filter(Boolean) }));

window.PlanMilT.iconSelector = Object.freeze({
    defaultMarkerUrl: 'css/images/marker-icon.png',

    /**
     * Recria ícones persistidos, incluindo o nome legado do marcador padrão do Leaflet.
     * @param {Object} properties - Propriedades da feição.
     * @param {Object} leaflet - Namespace Leaflet.
     * @param {Object} [options] - Dimensões padrão para ícones personalizados.
     * @returns {Object} Ícone Leaflet.
     */
    createStoredIcon(properties, leaflet, options = {}) {
        if (properties.militarySymbol) {
            return window.PlanMilT.militarySymbols.createIcon(properties.militarySymbol, leaflet);
        }
        if (properties.iconUrl === 'marker-icon.png' || properties.iconUrl === this.defaultMarkerUrl) {
            return new leaflet.Icon.Default();
        }
        return leaflet.icon({ iconUrl: properties.iconUrl, iconSize: options.iconSize || [40, 40],
            iconAnchor: options.iconAnchor || [15, 15] });
    },

    /**
     * Monta a navegação Ícones gerados anteriormente / Amigo / Inimigo e suas especialidades.
     * @param {Array<string>} paths - Caminhos dos ícones de `symbols/icons.php`.
     * @param {Object} handlers - Funções chamadas ao escolher um ícone.
     * @param {Function} handlers.onSelectIcon - Recebe a chave (`pasta/nome`) e o caminho do ícone.
     * @param {Function} handlers.onSelectSymbol - Recebe os dados do símbolo gerado anteriormente.
     * @param {HTMLElement} [browser] - Contêiner que recebe a navegação; por padrão um novo elemento.
     * @returns {HTMLElement} Contêiner com a navegação.
     */
    createBrowser(paths, { onSelectIcon, onSelectSymbol }, browser = document.createElement('div')) {
        browser.className = `${browser.className || ''} icon-browser`.trim();
        const iconsByDirectory = {};
        paths.forEach(iconPath => {
            const parts = iconPath.split('/');
            const iconName = parts.pop().replace('.svg', '');
            const directoryName = parts.pop();
            iconsByDirectory[directoryName] = iconsByDirectory[directoryName] || [];
            iconsByDirectory[directoryName].push({ iconName, optionValue: `${directoryName}/${iconName}`, iconPath });
        });
        const iconCategories = ICON_BROWSER_CATEGORIES;

        const folderList = document.createElement('div');
        folderList.className = 'folder-list';
        const categoryList = document.createElement('div');
        categoryList.className = 'folder-list icon-category-list';
        const iconList = document.createElement('div');
        iconList.className = 'icon-list';

        /**
         * Destaca o botão ativo de uma lista de navegação.
         * @param {HTMLElement} list - Lista que contém os botões.
         * @param {HTMLElement} selected - Botão selecionado.
         */
        function selectButton(list, selected) {
            Array.from(list.children).forEach(button => {
                button.setAttribute('aria-pressed', button === selected ? 'true' : 'false');
            });
        }

        /**
         * Mostra os ícones de um grupo, preservando suas chaves originais.
         * @param {Array<Object>} group - Ícones a apresentar.
         */
        function renderIcons(group) {
            group.forEach(iconData => {
                const iconItem = document.createElement('div');
                iconItem.className = 'icon-item';

                const image = document.createElement('img');
                image.src = iconData.iconPath;
                image.alt = iconData.iconName;
                image.title = iconData.iconName;
                image.dataset.optionValue = iconData.optionValue;
                image.className = 'icon-image';
                image.addEventListener('click', () => onSelectIcon(iconData.optionValue, iconData.iconPath));

                iconItem.appendChild(image);
                iconList.appendChild(iconItem);
            });
        }

        const recentButton = document.createElement('button');
        recentButton.type = 'button';
        recentButton.className = 'folder-button';
        recentButton.textContent = 'Ícones gerados anteriormente';
        recentButton.setAttribute('aria-pressed', 'false');
        recentButton.addEventListener('click', () => {
            selectButton(folderList, recentButton);
            categoryList.innerHTML = '';
            iconList.innerHTML = '';
            const tray = document.createElement('div');
            tray.className = 'recent-symbol-tray';
            iconList.appendChild(tray);
            window.PlanMilT.militarySymbols.renderRecentTray(tray, onSelectSymbol);
        });
        folderList.appendChild(recentButton);

        [['friend', 'Amigo'], ['enemy', 'Inimigo']].forEach(([directoryName, affiliation]) => {
            const folderButton = document.createElement('button');
            folderButton.type = 'button';
            folderButton.textContent = affiliation;
            folderButton.className = 'folder-button';
            folderButton.setAttribute('aria-pressed', 'false');

            folderButton.addEventListener('click', () => {
                selectButton(folderList, folderButton);
                categoryList.innerHTML = '';
                iconList.innerHTML = '';
                const unclassified = (iconsByDirectory[directoryName] || []).filter(icon =>
                    !iconCategories.some(category => category.names.includes(icon.iconName))
                );
                if (unclassified.length) {
                    const heading = document.createElement('div');
                    heading.className = 'icon-group-heading';
                    heading.textContent = 'Ícones sem classificação';
                    iconList.appendChild(heading);
                    renderIcons(unclassified);
                }

                iconCategories.forEach(category => {
                    const categoryButton = document.createElement('button');
                    categoryButton.type = 'button';
                    categoryButton.className = 'folder-button';
                    categoryButton.textContent = category.label;
                    categoryButton.setAttribute('aria-pressed', 'false');
                    categoryButton.addEventListener('click', () => {
                        selectButton(categoryList, categoryButton);
                        iconList.innerHTML = '';
                        const group = (iconsByDirectory[directoryName] || []).filter(icon =>
                            category.names.includes(icon.iconName)
                        );
                        if (category.label === 'Comunicações' && (iconsByDirectory.c2 || []).length) {
                            const heading = document.createElement('div');
                            heading.className = 'icon-group-heading';
                            heading.textContent = affiliation;
                            iconList.appendChild(heading);
                            renderIcons(group);
                            const sharedHeading = document.createElement('div');
                            sharedHeading.className = 'icon-group-heading';
                            sharedHeading.textContent = 'C2 (comum)';
                            iconList.appendChild(sharedHeading);
                            renderIcons(iconsByDirectory.c2);
                        } else if (group.length) {
                            renderIcons(group);
                        } else {
                            const empty = document.createElement('p');
                            empty.textContent = 'Nenhum ícone nesta divisão.';
                            iconList.appendChild(empty);
                        }
                    });
                    categoryList.appendChild(categoryButton);
                });
            });

            folderList.appendChild(folderButton);
        });

        browser.appendChild(folderList);
        browser.appendChild(categoryList);
        browser.appendChild(iconList);
        return browser;
    },

    /**
     * Abre uma janela nativa com a navegação de ícones e retorna a escolha.
     * @param {Array<string>} paths - Caminhos dos ícones disponíveis.
     * @returns {Promise<{iconUrl: string, symbol?: Object}|null>} Escolha ou nulo se cancelada.
     */
    pickIcon(paths) {
        return new Promise(resolve => {
            const dialog = document.createElement('dialog');
            dialog.className = 'icon-picker-dialog';
            let choice = null;
            const choose = value => { choice = value; dialog.close(); };
            const title = document.createElement('h3');
            title.textContent = 'Selecionar ícone';
            const cancel = document.createElement('button');
            cancel.type = 'button';
            cancel.textContent = 'Cancelar';
            cancel.addEventListener('click', () => dialog.close());
            dialog.append(title, this.createBrowser(paths, {
                onSelectIcon: (key, iconPath) => choose({ iconUrl: iconPath }),
                onSelectSymbol: data => choose({ iconUrl: data.iconUrl, symbol: data })
            }), cancel);
            dialog.addEventListener('close', () => { dialog.remove(); resolve(choice); });
            document.body.appendChild(dialog);
            dialog.showModal();
        });
    },

    /**
     * Carrega e conecta o seletor de ícones à toolbar e à prévia.
     * @param {Object} dependencies - Dependências externas necessárias para inicializar o módulo.
     * @param {HTMLElement} [dependencies.container] - Contêiner opcional da navegação.
     * @param {HTMLElement} [dependencies.preview] - Prévia opcional do ícone.
     * @param {Object} dependencies.leaflet - Namespace Leaflet usado para criar camadas e controles.
     * @param {Object} dependencies.apiClient - Cliente compartilhado para chamadas à API.
     */
    attach({ container, preview, leaflet, apiClient }) {
        const icons = Object.create(null);
        const iconPaths = Object.create(null);
        let selectedIconKey = 'null';
        let pathsLoaded = false;

        /**
         * Carrega os dados de ícones e prepara o seletor.
         */
        async function load() {
            const paths = await apiClient.getJson('symbols/icons.php');

            paths.forEach(iconPath => {
                const pathParts = iconPath.split('/');
                const iconFileName = pathParts.pop();
                const iconName = iconFileName.replace('.svg', '');
                const directoryName = pathParts.pop();
                const optionValue = `${directoryName}/${iconName}`;

                icons[optionValue] = leaflet.icon({
                    iconUrl: iconPath,
                    iconSize: [40, 40],
                    iconAnchor: [15, 15],
                    popupAnchor: [0, -15]
                });
                iconPaths[optionValue] = iconPath;
            });

            pathsLoaded = true;
            if (container && preview) buildSelector();
        }

        /**
         * Monta no DOM as opções do seletor de ícones.
         */
        function buildSelector() {
            container.innerHTML = '';

            const toggleButton = document.createElement('button');
            toggleButton.id = 'iconSelectorToggle';
            toggleButton.type = 'button';
            toggleButton.textContent = 'Selecionar ícone';
            container.appendChild(toggleButton);

            const selectorContent = document.createElement('div');
            selectorContent.id = 'iconSelectorContent';
            selectorContent.style.display = 'none';
            container.appendChild(selectorContent);

            window.PlanMilT.iconSelector.createBrowser(Object.values(iconPaths), {
                onSelectIcon(optionValue) {
                    selectedIconKey = optionValue;
                    preview.src = iconPaths[selectedIconKey];
                    preview.hidden = false;
                    selectorContent.style.display = 'none';
                },
                onSelectSymbol(data) {
                    selectMilitarySymbol(data);
                    selectorContent.style.display = 'none';
                }
            }, selectorContent);
            toggleButton.addEventListener('click', function() {
                selectorContent.style.display = selectorContent.style.display === 'none' || selectorContent.style.display === ''
                    ? 'block'
                    : 'none';
            });
        }

        /**
         * Seleciona um ícone criado sem alterar os ícones existentes.
         * @param {Object} data - Imagem e metadados do símbolo.
         */
        function selectMilitarySymbol(data) {
            selectedIconKey = '__military_symbol__';
            icons[selectedIconKey] = window.PlanMilT.militarySymbols.createIcon(data, leaflet);
            icons[selectedIconKey].militarySymbol = data;
            if (preview) {
                preview.src = data.iconUrl;
                preview.hidden = false;
            }
        }

        return Object.freeze({
            load,
            /**
             * Permite reutilizar, selecionar ou criar o ícone de um novo marcador.
             * @param {Object} sweetAlert - Interface SweetAlert2.
             * @returns {Promise<Object|null>} Ícone Leaflet selecionado ou nulo ao cancelar.
             */
            async selectForMarker(sweetAlert) {
                const current = icons[selectedIconKey] || null;
                const result = await sweetAlert.fire({
                    title: 'Adicionar ícone',
                    html: `<div id="markerIconChoice" style="text-align:left">
${current ? '<p>Ícone selecionado: <img id="markerIconPreview" alt="Ícone selecionado" style="width:48px;height:48px;object-fit:contain;vertical-align:middle"></p><label><input type="radio" name="markerIconAction" value="use" checked> Usar este ícone</label><br>' : ''}
<label><input type="radio" name="markerIconAction" value="select" ${current ? '' : 'checked'}> Selecionar ícone</label><br>
<label><input type="radio" name="markerIconAction" value="create"> Criar ícone</label>
</div>`,
                    showCancelButton: true,
                    confirmButtonText: 'Continuar',
                    cancelButtonText: 'Cancelar',
                    didOpen: () => {
                        const image = sweetAlert.getPopup().querySelector('#markerIconPreview');
                        if (image && current) image.src = current.options.iconUrl;
                    },
                    preConfirm: () => sweetAlert.getPopup().querySelector('input[name="markerIconAction"]:checked').value
                });
                if (!result.isConfirmed) return null;
                if (result.value === 'use') return current;
                try {
                    if (result.value === 'create') {
                        const symbol = await window.PlanMilT.militarySymbols.open();
                        if (!symbol) return null;
                        selectMilitarySymbol(symbol);
                    } else if (result.value === 'select') {
                        if (!pathsLoaded) await load();
                        const choice = await window.PlanMilT.iconSelector.pickIcon(Object.values(iconPaths));
                        if (!choice) return null;
                        if (choice.symbol) {
                            selectMilitarySymbol(choice.symbol);
                        } else {
                            const key = Object.keys(iconPaths).find(name => iconPaths[name] === choice.iconUrl);
                            if (!key) throw new Error('Ícone selecionado não encontrado no catálogo.');
                            selectedIconKey = key;
                        }
                    } else {
                        throw new Error('Ação de ícone desconhecida.');
                    }
                    return icons[selectedIconKey];
                } catch (error) {
                    console.error('[PlanMilT][Ícones] Falha ao selecionar ou criar ícone.', error);
                    await sweetAlert.fire('Erro', 'Não foi possível selecionar ou criar o ícone.', 'error');
                    return null;
                }
            },
            /**
             * Retorna a chave do ícone atualmente selecionado.
             */
            getSelectedIconKey() {
                return selectedIconKey;
            },
            /**
             * Retorna o objeto Leaflet do ícone atualmente selecionado.
             */
            getSelectedIcon() {
                return icons[selectedIconKey] || null;
            },
            /**
             * Seleciona um ícone criado sem alterar o catálogo de ícones existente.
             * @param {Object} data - Imagem e metadados do símbolo.
             */
            selectMilitarySymbol
        });
    }
});