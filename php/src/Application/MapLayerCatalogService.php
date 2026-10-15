<?php
declare(strict_types=1);

namespace PlanMilT\Application;

use PDO;
use RuntimeException;
use Throwable;

/**
 * Importa metadados WMS e fornece recomendações categorizadas e pesquisa global.
 */
final class MapLayerCatalogService
{
    private const SEARCH_LIMIT = 100;
    private const CATEGORY_LIMIT = 10;

    private PDO $database;

    /**
     * Cria o serviço de catálogo usando a conexão SQLite da aplicação.
     *
     * @param PDO $database Conexão já migrada do banco da aplicação.
     */
    public function __construct(PDO $database)
    {
        $this->database = $database;
    }

    /**
     * Retorna recomendações por categoria ou resultados da busca textual global.
     *
     * @param string $query Texto pesquisado; vazio retorna apenas categorias e recomendações.
     * @param int|null $serviceId Filtra a busca pelo identificador do SIG.
     * @param string|null $categoryCode Código da categoria, ou `uncategorized`.
     * @param string|null $year Ano exato, ou `none` para camadas sem ano.
     * @return array<string, mixed> Dados do catálogo prontos para o endpoint.
     */
    public function browse(
        string $query = '',
        ?int $serviceId = null,
        ?string $categoryCode = null,
        ?string $year = null
    ): array
    {
        $totalLayers = (int) $this->database->query('SELECT COUNT(*) FROM map_layers')->fetchColumn();
        $years = $this->database->query(
            'SELECT DISTINCT latest_year FROM map_layers WHERE latest_year > 0 ORDER BY latest_year DESC'
        )->fetchAll(PDO::FETCH_COLUMN);
        $query = trim($query);
        if ($query !== '') {
            return [
                'totalLayers' => $totalLayers,
                'query' => $query,
                'years' => array_map('intval', $years),
                'totalResults' => $this->countMatches($query, $serviceId, $categoryCode, $year),
                'results' => $this->search($query, $serviceId, $categoryCode, $year),
            ];
        }

        $categories = $this->database->query(
            'SELECT code, name FROM map_layer_categories ORDER BY display_order'
        )->fetchAll(PDO::FETCH_ASSOC);
        $regionalCondition = $serviceId === null ? $this->regionalServiceCondition() : '';
        foreach ($categories as &$category) {
            $serviceCondition = $serviceId === null ? '' : ' AND ml.map_service_id = ?';
            $order = $serviceId === null
                ? 'CASE WHEN ml.feature_info_status = \'sample_received\' THEN 0 ELSE 1 END, '
                    . 'COALESCE(ml.latest_year, 0) DESC, length(ml.abstract), ml.layer_title COLLATE NOCASE, ml.id'
                : 'CASE WHEN ml.feature_info_status = \'sample_received\' THEN 0 ELSE 1 END, '
                    . 'COALESCE(ml.latest_year, 0) DESC, ml.layer_title COLLATE NOCASE';
            $statement = $this->database->prepare(
                'SELECT ml.layer_name AS layerName, ml.layer_title AS title, ml.latest_year AS latestYear, '
                . 'ms.id AS serviceId, ms.name AS serviceName, '
                . 'ms.url AS serviceUrl, ml.military_relevance AS relevance, ml.feature_info_status AS featureInfoStatus '
                . 'FROM map_layers ml JOIN map_services ms ON ms.id = ml.map_service_id '
                . 'WHERE ml.category_code = ?' . $serviceCondition . $regionalCondition
                . ' AND lower(ms.name) NOT LIKE \'%prefeitura%\' '
                . 'AND lower(ms.name || \' \' || ml.layer_name || \' \' || ml.layer_title || \' \' || ml.abstract) '
                . 'NOT LIKE \'%distrito federal%\' AND lower(ms.name || \' \' || ml.layer_name || \' \' || ml.layer_title || \' \' || ml.abstract) '
                . 'NOT LIKE \'%belo horizonte%\' AND lower(ms.name || \' \' || ml.layer_name || \' \' || ml.layer_title || \' \' || ml.abstract) '
                . 'NOT LIKE \'%rio de janeiro%\' '
                . ' ORDER BY ' . $order . ' LIMIT ' . self::CATEGORY_LIMIT
            );
            $parameters = [$category['code']];
            if ($serviceId !== null) {
                $parameters[] = $serviceId;
            }
            $statement->execute($parameters);
            $category['layers'] = $statement->fetchAll(PDO::FETCH_ASSOC);
            foreach ($category['layers'] as &$layer) {
                $layer['categoryName'] = $category['name'];
            }
            unset($layer);
        }
        unset($category);

        $services = $this->database->query('SELECT id, name, url FROM map_services ORDER BY name COLLATE NOCASE')
            ->fetchAll(PDO::FETCH_ASSOC);

        return [
            'totalLayers' => $totalLayers,
            'categories' => $categories,
            'services' => $services,
            'years' => array_map('intval', $years),
        ];
    }

    /**
     * Importa o CSV revisado pelo coletor sem apagar classificações previamente revisadas.
     *
     * @param string $csvPath Caminho do CSV gerado por `tools/catalog-wms-layers.php`.
     * @return array{imported: int, skipped: int, recommended: int}
     */
    public function importCsv(string $csvPath): array
    {
        $file = fopen($csvPath, 'rb');
        if ($file === false) {
            throw new RuntimeException('catalog_csv_unavailable');
        }

        $this->database->beginTransaction();
        try {
            $header = fgetcsv($file, 0, ';', '"', '\\');
            if (!is_array($header)) {
                throw new RuntimeException('catalog_csv_header_missing');
            }
            $header[0] = preg_replace('/^\xEF\xBB\xBF/', '', (string) $header[0]);
            $columns = array_flip($header);
            foreach (['service_name', 'service_host', 'layer_name', 'layer_title'] as $required) {
                if (!isset($columns[$required])) {
                    throw new RuntimeException('catalog_csv_invalid_header');
                }
            }

            $serviceLookup = $this->buildServiceLookup();
            $upsert = $this->database->prepare(
                'INSERT INTO map_layers ('
                . 'map_service_id, layer_name, layer_title, abstract, keywords, queryable, category_code, '
                . 'category_source, military_relevance, review_status, feature_info_status, feature_info_format, '
                . 'feature_info_fields, feature_info_sample, latest_year, collected_at, created_at, updated_at) '
                . 'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime(\'now\'), datetime(\'now\'), datetime(\'now\')) '
                . 'ON CONFLICT (map_service_id, layer_name) DO UPDATE SET '
                . 'layer_title = excluded.layer_title, abstract = excluded.abstract, keywords = excluded.keywords, '
                . 'queryable = excluded.queryable, '
                . 'category_code = CASE WHEN map_layers.review_status = \'reviewed\' '
                . 'THEN map_layers.category_code ELSE excluded.category_code END, '
                . 'category_source = CASE WHEN map_layers.review_status = \'reviewed\' '
                . 'THEN map_layers.category_source ELSE excluded.category_source END, '
                . 'military_relevance = CASE WHEN map_layers.review_status = \'reviewed\' '
                . 'THEN map_layers.military_relevance ELSE excluded.military_relevance END, '
                . 'feature_info_status = excluded.feature_info_status, feature_info_format = excluded.feature_info_format, '
                . 'feature_info_fields = excluded.feature_info_fields, feature_info_sample = excluded.feature_info_sample, '
                . 'latest_year = excluded.latest_year, collected_at = excluded.collected_at, updated_at = datetime(\'now\')'
            );

            $imported = 0;
            $skipped = 0;
            while (($row = fgetcsv($file, 0, ';', '"', '\\')) !== false) {
                $record = $this->recordFromCsvRow($row, $columns, $serviceLookup);
                if ($record === null) {
                    $skipped++;
                    continue;
                }
                $upsert->execute($record);
                $imported++;
            }
            fclose($file);

            $this->assignRecommendations();
            $recommended = (int) $this->database->query(
                'SELECT COUNT(*) FROM map_layers WHERE category_rank IS NOT NULL'
            )->fetchColumn();
            $this->database->commit();

            return ['imported' => $imported, 'skipped' => $skipped, 'recommended' => $recommended];
        } catch (Throwable $error) {
            if (is_resource($file)) {
                fclose($file);
            }
            if ($this->database->inTransaction()) {
                $this->database->rollBack();
            }
            throw $error;
        }
    }

    /**
     * Resolve serviços do CSV por nome e host, sem depender de IDs entre instalações.
     *
     * @return array<string, int> Chave composta por nome e host para id do serviço.
     */
    private function buildServiceLookup(): array
    {
        $lookup = [];
        foreach ($this->database->query('SELECT id, name, url FROM map_services')->fetchAll(PDO::FETCH_ASSOC) as $service) {
            $host = strtolower((string) parse_url($service['url'], PHP_URL_HOST));
            $lookup[$service['name'] . '|' . $host] = (int) $service['id'];
        }

        return $lookup;
    }

    /**
     * Converte uma linha CSV em valores do catálogo; linhas de erro ou serviços ausentes são ignorados.
     *
     * @param array<int, string|null> $row Linha lida por fgetcsv.
     * @param array<string, int> $columns Índices das colunas pelo cabeçalho.
     * @param array<string, int> $serviceLookup Serviços locais indexados por nome e host.
     * @return array<int, mixed>|null
     */
    private function recordFromCsvRow(array $row, array $columns, array $serviceLookup): ?array
    {
        $value = static fn (string $key): string => isset($columns[$key]) ? (string) ($row[$columns[$key]] ?? '') : '';
        if ($value('collection_status') !== 'ok' || $value('layer_name') === '') {
            return null;
        }

        $host = strtolower($value('service_host'));
        $serviceId = $serviceLookup[$value('service_name') . '|' . $host] ?? null;
        if ($serviceId === null) {
            return null;
        }

        $category = $this->categoryCode(
            $value('theme_suggestion'),
            $value('service_name'),
            $value('layer_name'),
            $value('layer_title'),
            $value('abstract'),
            $value('feature_info_fields')
        );
        $evidenceSource = str_starts_with($value('review_notes'), 'GetFeatureInfo')
            ? 'feature_info'
            : 'metadata';
        $keywords = array_values(array_filter(array_map('trim', explode('|', $value('keywords')))));
        preg_match_all('/\b(?:19|20)\d{2}\b/u', implode(' ', [
            $value('layer_name'), $value('layer_title'), $value('abstract'),
        ]), $years);
        $relevance = $value('military_relevance') === 'potencialmente relevante'
            ? 'potentially_relevant'
            : 'not_triaged';

        return [
            $serviceId,
            $value('layer_name'),
            $value('layer_title'),
            $value('abstract'),
            (string) json_encode($keywords, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
            $value('queryable') === '1' ? 1 : 0,
            $category,
            $evidenceSource,
            $relevance,
            'pending',
            $value('feature_info_status'),
            $value('feature_info_format'),
            $value('feature_info_fields'),
            $value('feature_info_sample'),
            $years[0] === [] ? null : max(array_map('intval', $years[0])),
        ];
    }

    /**
     * Converte a sugestão anterior para uma das dez categorias estáveis do catálogo.
     *
     * @param string $suggestion Categoria sugerida no CSV.
     * @param string $serviceName Nome do SIG.
     * @param string $layerName Nome técnico da camada.
     * @param string $title Título legível da camada.
     * @param string $abstract Resumo publicado da camada.
     * @param string $fields Campos encontrados em GetFeatureInfo.
     */
    private function categoryCode(
        string $suggestion,
        string $serviceName,
        string $layerName,
        string $title,
        string $abstract,
        string $fields
    ): ?string
    {
        if (stripos($serviceName, 'prefeitura') !== false
            || preg_match('/distrito federal|belo horizonte|rio de janeiro/iu', $serviceName . ' ' . $layerName . ' ' . $title . ' ' . $abstract)) {
            return null;
        }

        $text = strtolower($title . ' ' . $fields);
        if (in_array($suggestion, ['Hidrografia e recursos hídricos'], true)) {
            return 'hydrography';
        }
        if (in_array($suggestion, ['Transporte terrestre', 'Transporte aquaviário', 'Aviação e aeródromos'], true)) {
            return 'transport';
        }
        if ($suggestion === 'Relevo e terreno') {
            return 'terrain';
        }
        if ($suggestion === 'Energia e combustíveis') {
            return 'essential_services';
        }
        if ($suggestion === 'Telecomunicações') {
            return 'telecommunications';
        }
        if ($suggestion === 'Saúde e apoio à população') {
            return 'health_emergency';
        }
        if ($suggestion === 'Riscos e resposta a emergências') {
            return preg_match('/defesa civil|abrigo|hospital|sa[uú]de|emerg[eê]ncia/u', $text)
                ? 'health_emergency'
                : 'environment_risk';
        }
        if ($suggestion === 'Território e meio ambiente') {
            return preg_match('/fronteira|limite|jurisdi[cç][aã]o|terra ind[ií]gena|unidade de conserva[cç][aã]o/u', $text)
                ? 'jurisdiction'
                : 'environment_risk';
        }
        if ($suggestion === 'Geologia e recursos minerais') {
            return 'environment_risk';
        }
        if ($suggestion === 'População e ocupação') {
            return preg_match('/[aá]rea urbana|edifica[cç][aã]o|edif[ií]cio|bairro|mancha urbana|uso do solo urbano/u', $text)
                ? 'urban'
                : 'population';
        }

        return null;
    }

    /**
     * Monta a condição SQL que exclui serviços de abrangência estadual ou municipal das recomendações.
     *
     * Serviços com sigla de UF no nome, "Estadual", "Estado d..." ou "Municipal" não são recomendados;
     * continuam disponíveis na busca e na seleção direta do SIG.
     *
     * @return string Fragmento iniciado por " AND" (vazio se não houver serviços regionais).
     */
    private function regionalServiceCondition(): string
    {
        $ids = [];
        $rows = $this->database->query('SELECT id, name FROM map_services')->fetchAll(PDO::FETCH_ASSOC);
        foreach ($rows as $row) {
            if ($this->isRegionalServiceName((string) $row['name'])) {
                $ids[] = (int) $row['id'];
            }
        }

        return $ids === [] ? '' : ' AND ms.id NOT IN (' . implode(',', $ids) . ')';
    }

    /**
     * Indica se o nome do serviço sugere abrangência apenas estadual ou municipal.
     *
     * @param string $name Nome do SIG.
     */
    private function isRegionalServiceName(string $name): bool
    {
        return (bool) preg_match(
            '/\((AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)\)|estadual|estado d|municipal|prefeitura/iu',
            $name
        );
    }

    /**
     * Atribui no máximo dez recomendações por categoria, priorizando amostras e anos recentes.
     */
    private function assignRecommendations(): void
    {
        $this->database->exec('UPDATE map_layers SET category_rank = NULL');
        $categories = $this->database->query('SELECT code FROM map_layer_categories ORDER BY display_order')->fetchAll(PDO::FETCH_COLUMN);
        $select = $this->database->prepare(
            'SELECT id FROM map_layers WHERE category_code = ? '
            . 'ORDER BY CASE WHEN feature_info_status = \'sample_received\' THEN 0 ELSE 1 END, '
            . 'COALESCE(latest_year, 0) DESC, length(abstract), layer_title, id LIMIT ' . self::CATEGORY_LIMIT
        );
        $update = $this->database->prepare('UPDATE map_layers SET category_rank = ? WHERE id = ?');
        foreach ($categories as $category) {
            $select->execute([$category]);
            foreach ($select->fetchAll(PDO::FETCH_COLUMN) as $rank => $layerId) {
                $update->execute([$rank + 1, $layerId]);
            }
        }
    }

    /**
     * Conta resultados para a busca sem aplicar o limite de exibição.
     *
     * @param string $query Texto já validado e normalizado.
     */
    private function countMatches(
        string $query,
        ?int $serviceId,
        ?string $categoryCode,
        ?string $year
    ): int
    {
        [$where, $parameters] = $this->searchCondition($query, $serviceId, $categoryCode, $year);
        $statement = $this->database->prepare(
            'SELECT COUNT(*) FROM map_layers ml JOIN map_services ms ON ms.id = ml.map_service_id WHERE ' . $where
        );
        $statement->execute($parameters);

        return (int) $statement->fetchColumn();
    }

    /**
     * Retorna até cem resultados globais, incluindo serviços e amostras de atributos.
     *
     * @param string $query Texto já validado e normalizado.
     * @return array<int, array<string, mixed>>
     */
    private function search(
        string $query,
        ?int $serviceId,
        ?string $categoryCode,
        ?string $year
    ): array
    {
        [$where, $parameters] = $this->searchCondition($query, $serviceId, $categoryCode, $year);
        $statement = $this->database->prepare(
            'SELECT ml.layer_name AS layerName, ml.layer_title AS title, ml.latest_year AS latestYear, '
            . 'ml.category_code AS categoryCode, mc.name AS categoryName, ms.id AS serviceId, ms.name AS serviceName, '
            . 'ms.url AS serviceUrl, ml.military_relevance AS relevance, '
            . 'ml.feature_info_fields AS featureInfoFields, ml.feature_info_sample AS featureInfoSample '
            . 'FROM map_layers ml JOIN map_services ms ON ms.id = ml.map_service_id '
            . 'LEFT JOIN map_layer_categories mc ON mc.code = ml.category_code '
            . 'WHERE ' . $where . ' ORDER BY CASE WHEN ml.category_rank IS NULL THEN 1 ELSE 0 END, '
            . 'ml.category_rank, ml.layer_title COLLATE NOCASE LIMIT ' . self::SEARCH_LIMIT
        );
        $statement->execute($parameters);

        return $statement->fetchAll(PDO::FETCH_ASSOC);
    }

    /**
     * Constrói busca literal em atributos e amostras sem interpretar curingas do usuário.
     *
     * @param string $query Texto buscado.
     * @return array{0: string, 1: array<int, string>}
     */
    private function searchCondition(
        string $query,
        ?int $serviceId,
        ?string $categoryCode,
        ?string $year
    ): array
    {
        $escaped = str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], $query);
        $pattern = '%' . $escaped . '%';
        $columns = [
            'ml.layer_name', 'ml.layer_title', 'ml.abstract', 'ml.keywords',
            'ml.feature_info_fields', 'ml.feature_info_sample', 'ms.name',
        ];
        $condition = '(' . implode(' OR ', array_map(
            static fn (string $column): string => $column . ' LIKE ? ESCAPE \'\\\'',
            $columns
        )) . ')';
        $parameters = array_fill(0, count($columns), $pattern);
        if ($serviceId !== null) {
            $condition .= ' AND ml.map_service_id = ?';
            $parameters[] = (string) $serviceId;
        }
        if ($categoryCode === 'uncategorized') {
            $condition .= ' AND ml.category_code IS NULL';
        } elseif ($categoryCode !== null) {
            $condition .= ' AND ml.category_code = ?';
            $parameters[] = $categoryCode;
        }
        if ($year === 'none') {
            $condition .= ' AND COALESCE(ml.latest_year, 0) = 0';
        } elseif ($year !== null) {
            $condition .= ' AND ml.latest_year = ?';
            $parameters[] = (int) $year;
        }

        return [$condition, $parameters];
    }
}