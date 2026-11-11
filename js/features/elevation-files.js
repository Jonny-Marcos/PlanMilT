/**
 * @fileoverview Obtém tiles de elevação ausentes e oferece upload quando o download falha.
 * @exports window.PlanMilT.elevationFiles
 * @requires Cliente HTTP e SweetAlert2
 */
window.PlanMilT = window.PlanMilT || {};

window.PlanMilT.elevationFiles = Object.freeze({
    /**
     * Baixa tiles sequencialmente e solicita upload dos que não puderam ser obtidos.
     * @param {Array<string>} missingTiles - Nomes HGT informados pelo servidor.
     * @returns {Promise<boolean>} Indica se os arquivos foram obtidos.
     */
    async ensure(missingTiles) {
        if (!Array.isArray(missingTiles) || missingTiles.length === 0 ||
            missingTiles.some(tile => typeof tile !== 'string' || !/^[NS]\d{2}[EW]\d{3}\.HGT$/i.test(tile))) {
            throw new Error('A API retornou nomes de tiles inválidos.');
        }
        const tiles = [...new Set(missingTiles.map(tile => tile.toUpperCase()))];
        if (tiles.length > 32) {
            const error = new Error('A área requer mais de 32 tiles. Reduza a área e tente novamente.');
            error.userMessage = error.message;
            throw error;
        }
        const failed = [];
        for (const [index, tile] of tiles.entries()) {
            Swal.fire({
                title: 'Baixando arquivos de elevação',
                text: `Obtendo arquivo ${index + 1} de ${tiles.length}…`,
                allowOutsideClick: false,
                allowEscapeKey: false,
                showConfirmButton: false
            });
            try {
                const response = await window.PlanMilT.apiClient.request('php/endpoints/elevation-download.php', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ tile })
                });
                const result = await response.json();
                if (!response.ok || !result.success || result.tile !== tile) {
                    throw new Error((result && result.error) || `Falha no download (HTTP ${response.status}).`);
                }
            } catch (error) {
                console.error('[PlanMilT][Elevação] Falha ao baixar um tile.', error);
                failed.push(tile);
            }
        }
        if (failed.length === 0) {
            Swal.close();
            return true;
        }

        const choice = await Swal.fire({
            title: 'Download de elevação indisponível',
            html: `Não foi possível obter: <b>${failed.join(', ')}</b>. Você pode enviar os arquivos HGT manualmente.`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Fazer upload',
            cancelButtonText: 'Cancelar'
        });
        if (!choice.isConfirmed) return false;
        const { value: formData } = await Swal.fire({
            title: 'Upload de Arquivos de Elevação',
            html: `<p>Selecione os arquivos correspondentes aos tiles faltantes.</p>${failed.map((tile, index) => `<label>${tile}: <input type="file" id="missing-hgt-${index}" accept=".hgt"></label><br>`).join('')}`,
            showCancelButton: true,
            confirmButtonText: 'Enviar',
            cancelButtonText: 'Cancelar',
            preConfirm: () => {
                const data = new FormData();
                for (const [index, tile] of failed.entries()) {
                    const input = document.getElementById(`missing-hgt-${index}`);
                    if (!input || !input.files || input.files.length === 0) {
                        Swal.showValidationMessage(`Selecione o arquivo ${tile}.`);
                        return false;
                    }
                    data.append('files[]', input.files[0]);
                }
                data.append('missingTiles', JSON.stringify(failed));
                return data;
            }
        });
        if (!formData) return false;
        const response = await window.PlanMilT.apiClient.request('elevation-upload.php', { method: 'POST', body: formData });
        const result = await response.json();
        if (!response.ok || !result || !result.success) {
            const error = new Error((result && result.message) || 'Falha no upload de elevação.');
            error.userMessage = error.message;
            throw error;
        }
        return true;
    },

    /**
     * Consulta a API de perfil e tenta novamente após obter tiles faltantes.
     * @param {Object} payload - Pontos a consultar.
     * @returns {Promise<*>} Resposta JSON da API.
     */
    async profile(payload) {
        for (let attempt = 0; attempt < 2; attempt++) {
            const response = await window.PlanMilT.apiClient.request('elevation-profile.php', {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
            });
            const data = await response.json();
            if (data && data.error === 'Arquivos de elevação faltando' && Array.isArray(data.missingTiles) && attempt === 0) {
                if (await this.ensure(data.missingTiles)) continue;
                const error = new Error('Obtenção de arquivos de elevação cancelada.');
                error.userCancelled = true;
                throw error;
            }
            if (!response.ok) throw new Error((data && data.error) || `Falha de comunicação (HTTP ${response.status}).`);
            return data;
        }
        throw new Error('Não foi possível obter os arquivos de elevação.');
    }
});
