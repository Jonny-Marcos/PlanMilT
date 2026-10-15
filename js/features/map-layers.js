/**
 * @fileoverview Interpreta respostas de capacidades WMS e consulta camadas via proxy.
 * @exports window.PlanMilT.mapLayers
 * @requires window.PlanMilT.apiClient
 */
window.PlanMilT.mapLayers = Object.freeze({
    /**
     * Converte GetCapabilities em camadas ordenadas pela data mais recente conhecida.
     * @param {string} xmlText - Conteúdo XML retornado pelo serviço WMS.
     * @param {typeof DOMParser} [Parser=DOMParser] - Parser de XML, substituível nos testes.
    * @returns {Array<{Name: string, Title: string, LatestYear: number}>} Camadas com nome, título e ano mais recente anunciado.
     * @throws {Error} Quando a resposta contém XML inválido.
     */
    parseWMSCapabilities(xmlText, Parser = DOMParser) {
        const xmlDocument = new Parser().parseFromString(xmlText, 'application/xml');

        if (xmlDocument.getElementsByTagName('parsererror').length > 0) {
            throw new Error('Resposta de capacidades WMS inválida.');
        }

        const layers = [];
        const layerNodes = xmlDocument.getElementsByTagName('Layer');

        for (let index = 1; index < layerNodes.length; index++) {
            const layerNode = layerNodes[index];
            const nameNode = layerNode.getElementsByTagName('Name')[0];
            const titleNode = layerNode.getElementsByTagName('Title')[0];

            if (nameNode) {
                const dimensions = [
                    ...Array.from(layerNode.getElementsByTagName('Dimension')),
                    ...Array.from(layerNode.getElementsByTagName('Extent'))
                ].filter(node => !node.getAttribute || node.getAttribute('name')?.toLowerCase() === 'time');
                const searchableMetadata = [
                    nameNode.textContent,
                    titleNode ? titleNode.textContent : '',
                    ...dimensions.map(node => node.textContent)
                ].join(' ');
                const years = searchableMetadata.match(/\b(?:19|20)\d{2}\b/g) || [];
                layers.push({
                    Name: nameNode.textContent,
                    Title: titleNode ? titleNode.textContent : nameNode.textContent,
                    LatestYear: years.length > 0 ? Math.max(...years.map(Number)) : 0
                });
            }
        }

        return layers.sort((first, second) =>
            second.LatestYear - first.LatestYear
            || first.Title.localeCompare(second.Title, 'pt-BR', { sensitivity: 'base' })
        );
    },

    /**
     * Consulta GetCapabilities pelo proxy e interpreta as camadas retornadas.
     * @param {string} wmsURL - URL base do serviço WMS.
     * @param {Object} dependencies - Dependências de rede e tratamento de erros.
     * @param {Object} dependencies.apiClient - Cliente que fornece getText(url).
     * @param {Function} dependencies.onError - Callback que recebe falhas da consulta.
     * @returns {Promise<Array<{Name: string, Title: string}>|null>} Camadas ordenadas ou null após falha.
     */
    async getWMSLayers(wmsURL, { apiClient, onError }) {
        const capabilitiesURL = 'proxy.php?url=' + encodeURIComponent(`${wmsURL}?service=WMS&request=GetCapabilities`);

        try {
            const xmlText = await apiClient.getText(capabilitiesURL);
            return this.parseWMSCapabilities(xmlText);
        } catch (error) {
            onError(error);
            return null;
        }
    }
});
