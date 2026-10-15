<?php
declare(strict_types=1);

use PlanMilT\Application\MapLayerCatalogService;
use PlanMilT\Infrastructure\Database\SchemaMigrator;

require_once dirname(__DIR__, 2) . '/php/src/Infrastructure/Database/SchemaMigrator.php';
require_once dirname(__DIR__, 2) . '/php/src/Application/MapLayerCatalogService.php';

$database = new PDO('sqlite::memory:');
$database->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
$database->exec('CREATE TABLE desenhos (id INTEGER PRIMARY KEY, usuario TEXT NOT NULL, senha TEXT NOT NULL, leaflet TEXT NOT NULL, link TEXT)');
$database->exec('CREATE TABLE imagens (id INTEGER PRIMARY KEY, imagem BLOB, localizacao TEXT, data_criacao TEXT, descricao TEXT, senha TEXT, compartilhavel BOOLEAN)');
$database->exec('CREATE TABLE sigs (id INTEGER PRIMARY KEY, Nome TEXT, URL TEXT)');
$database->exec('CREATE TABLE task_sequences (id INTEGER PRIMARY KEY, name TEXT NOT NULL, password TEXT NOT NULL, sequence TEXT NOT NULL, date_created TEXT, date_modified TEXT, description TEXT)');
$database->exec("INSERT INTO sigs (Nome, URL) VALUES ('ANA - Agência Nacional de Águas e Saneamento Básico', 'https://www.snirh.gov.br/wms')");
$database->exec("INSERT INTO sigs (Nome, URL) VALUES ('SIG complementar', 'https://other.example/wms')");
$database->exec("INSERT INTO sigs (Nome, URL) VALUES ('Prefeitura Municipal de Belo Horizonte', 'https://bh.example/wms')");
SchemaMigrator::migrate($database);

$csvPath = tempnam(sys_get_temp_dir(), 'planmilt-catalog-test-');
if ($csvPath === false) {
    throw new RuntimeException('Unable to create temporary catalog CSV.');
}

try {
    $csv = fopen($csvPath, 'wb');
    fwrite($csv, "\xEF\xBB\xBF");
    $header = [
        'service_id', 'service_name', 'service_host', 'layer_name', 'layer_title', 'abstract', 'keywords',
        'queryable', 'collection_status', 'collection_error', 'theme_suggestion', 'military_relevance',
        'review_notes', 'review_status', 'feature_info_status', 'feature_info_format',
        'feature_info_fields', 'feature_info_sample',
    ];
    fputcsv($csv, $header, ';', '"', '\\');

    for ($year = 1980; $year <= 2040; $year += 5) {
        fputcsv($csv, [
            '1', 'ANA - Agência Nacional de Águas e Saneamento Básico', 'www.snirh.gov.br',
            'water_' . $year, 'Demanda hídrica municipal ' . $year, '', 'água', '1', 'ok', '',
            'Hidrografia e recursos hídricos', 'potencialmente relevante', 'Metadados WMS indicam vazão.',
            'revisão humana pendente', $year === 2040 ? 'sample_received' : 'skipped_limit', 'application/json',
            $year === 2040 ? 'NMMUN | VZTOTM3S' : '', $year === 2040 ? '{"NMMUN":"Nova Crixás","VZTOTM3S":"1,9"}' : '',
        ], ';', '"', '\\');
    }
    fputcsv($csv, [
        '1', 'ANA - Agência Nacional de Águas e Saneamento Básico', 'www.snirh.gov.br',
        'road_1', 'Rodovias federais', '', '', '1', 'ok', '', 'Transporte terrestre',
        'potencialmente relevante', 'Metadados WMS indicam rodovia.', 'revisão humana pendente',
        'not_queryable', '', '', '',
    ], ';', '"', '\\');
    fputcsv($csv, [
        '1', 'ANA - Agência Nacional de Águas e Saneamento Básico', 'www.snirh.gov.br',
        'unknown_1', 'Dados cartográficos diversos', '', '', '0', 'ok', '', '', 'não triado',
        'Sem termos na triagem.', 'revisão humana pendente', 'not_queryable', '', '', '',
    ], ';', '"', '\\');
    fputcsv($csv, [
        '1', 'ANA - Agência Nacional de Águas e Saneamento Básico', 'www.snirh.gov.br',
        'district_1', 'Limites do Distrito Federal', '', '', '1', 'ok', '', 'Território e meio ambiente',
        'potencialmente relevante', 'Metadados WMS indicam limites.', 'revisão humana pendente',
        'not_queryable', '', '', '',
    ], ';', '"', '\\');
    fputcsv($csv, [
        '1', 'ANA - Agência Nacional de Águas e Saneamento Básico', 'www.snirh.gov.br',
        'belo_horizonte_1', 'Edificações de Belo Horizonte', '', '', '1', 'ok', '', 'População e ocupação',
        'potencialmente relevante', 'Metadados WMS indicam edificações.', 'revisão humana pendente',
        'not_queryable', '', '', '',
    ], ';', '"', '\\');
    fputcsv($csv, [
        '1', 'ANA - Agência Nacional de Águas e Saneamento Básico', 'www.snirh.gov.br',
        'rio_de_janeiro_1', 'Dados territoriais do Rio de Janeiro', '', '', '1', 'ok', '', 'Território e meio ambiente',
        'potencialmente relevante', 'Metadados WMS indicam limites.', 'revisão humana pendente',
        'not_queryable', '', '', '',
    ], ';', '"', '\\');
    fputcsv($csv, [
        '2', 'SIG complementar', 'other.example', 'other_water', 'Demanda hídrica regional', '', '',
        '1', 'ok', '', 'Hidrografia e recursos hídricos', 'potencialmente relevante',
        'Metadados WMS indicam vazão.', 'revisão humana pendente', 'not_queryable', '', '', '',
    ], ';', '"', '\\');
    fputcsv($csv, [
        '3', 'Prefeitura Municipal de Belo Horizonte', 'bh.example', 'municipal_roads', 'Rodovias regionais',
        '', '', '1', 'ok', '', 'Transporte terrestre', 'potencialmente relevante', 'Metadados WMS indicam rodovias.',
        'revisão humana pendente', 'not_queryable', '', '', '',
    ], ';', '"', '\\');
    fclose($csv);

    $catalog = new MapLayerCatalogService($database);
    $import = $catalog->importCsv($csvPath);
    if ($import['imported'] !== 20 || $import['skipped'] !== 0 || $import['recommended'] !== 11) {
        throw new RuntimeException('Catalog CSV import or ten-per-category recommendation limit regression.');
    }

    $browse = $catalog->browse();
    $hydrography = array_values(array_filter($browse['categories'], static fn (array $category): bool => $category['code'] === 'hydrography'))[0];
    if (count($browse['categories']) !== 10 || count($hydrography['layers']) !== 10
        || $hydrography['layers'][0]['layerName'] !== 'water_2040') {
        throw new RuntimeException('Catalog categories or ranked recommendations regression.');
    }

    $database->exec("UPDATE map_services SET name = 'ANA (MG) - Serviço estadual' WHERE id = 1");
    $regionalBrowse = $catalog->browse();
    $regionalHydrography = array_values(array_filter($regionalBrowse['categories'], static fn (array $category): bool => $category['code'] === 'hydrography'))[0];
    $regionalServiceBrowse = $catalog->browse('', 1);
    $database->exec("UPDATE map_services SET name = 'ANA - Agência Nacional de Águas e Saneamento Básico' WHERE id = 1");
    if (count($regionalHydrography['layers']) !== 1
        || $regionalHydrography['layers'][0]['layerName'] !== 'other_water'
        || count(array_filter($regionalServiceBrowse['categories'], static fn (array $category): bool => count($category['layers']) > 0)) === 0) {
        throw new RuntimeException('Regional services must be excluded from recommendations but remain selectable.');
    }

    $searchByTitle = $catalog->browse('water_1980');
    $searchByFeatureInfo = $catalog->browse('Nova Crixás');
    $searchByService = $catalog->browse('Demanda hídrica', 2);
    $searchByAdvancedFilters = $catalog->browse('Demanda hídrica', 1, 'hydrography', '2040');
    $searchByMissingYear = $catalog->browse('Dados cartográficos diversos', null, 'uncategorized', 'none');
    $serviceCategories = $catalog->browse('', 2);
    $searchDistrict = $catalog->browse('Distrito Federal');
    $searchCity = $catalog->browse('Belo Horizonte');
    $searchRio = $catalog->browse('Rio de Janeiro');
    $searchMunicipalService = $catalog->browse('Rodovias regionais');
    $excludedRegions = $database->query(
        "SELECT COUNT(*) FROM map_layers WHERE layer_name IN ('district_1', 'belo_horizonte_1', 'rio_de_janeiro_1', 'municipal_roads') AND category_code IS NULL"
    )->fetchColumn();
    if ($searchByTitle['totalResults'] !== 1
        || $searchByTitle['results'][0]['layerName'] !== 'water_1980'
        || $searchByFeatureInfo['totalResults'] !== 1
        || $searchByFeatureInfo['results'][0]['layerName'] !== 'water_2040'
        || $searchByService['totalResults'] !== 1
        || $searchByService['results'][0]['serviceName'] !== 'SIG complementar'
        || $searchByAdvancedFilters['totalResults'] !== 1
        || $searchByAdvancedFilters['results'][0]['layerName'] !== 'water_2040'
        || $searchByMissingYear['totalResults'] !== 1
        || $searchByMissingYear['results'][0]['layerName'] !== 'unknown_1'
        || $serviceCategories['categories'][1]['layers'][0]['layerName'] !== 'other_water'
        || $searchDistrict['totalResults'] !== 1
        || $searchDistrict['results'][0]['categoryCode'] !== null
        || $searchCity['totalResults'] !== 2
        || count(array_filter($searchCity['results'], static fn (array $result): bool => $result['categoryCode'] !== null)) !== 0
        || $searchRio['totalResults'] !== 1
        || $searchRio['results'][0]['categoryCode'] !== null
        || $searchMunicipalService['totalResults'] !== 1
        || $searchMunicipalService['results'][0]['categoryCode'] !== null
        || (int) $excludedRegions !== 4) {
        throw new RuntimeException('Global search must find recommended and non-recommended layer metadata.');
    }

    $database->exec("UPDATE map_layers SET category_code = 'population', review_status = 'reviewed' WHERE layer_name = 'water_2040'");
    $secondImport = $catalog->importCsv($csvPath);
    $reviewedLayer = $database->query(
        "SELECT category_code, review_status FROM map_layers WHERE layer_name = 'water_2040'"
    )->fetch(PDO::FETCH_ASSOC);
    if ($secondImport['imported'] !== 20
        || (int) $database->query('SELECT COUNT(*) FROM map_layers')->fetchColumn() !== 20
        || $reviewedLayer['category_code'] !== 'population'
        || $reviewedLayer['review_status'] !== 'reviewed') {
        throw new RuntimeException('Catalog refresh must be idempotent and preserve reviewed classification.');
    }

    $endpointDatabasePath = tempnam(sys_get_temp_dir(), 'planmilt-catalog-endpoint-');
    if ($endpointDatabasePath === false) {
        throw new RuntimeException('Unable to create temporary endpoint database.');
    }
    $database->exec('VACUUM INTO ' . $database->quote($endpointDatabasePath));
    $previousDatabasePath = getenv('PLANMILT_DB_PATH');
    $previousRequestMethod = $_SERVER['REQUEST_METHOD'] ?? null;
    $previousQuery = $_GET;
    putenv('PLANMILT_DB_PATH=' . $endpointDatabasePath);
    $_SERVER['REQUEST_METHOD'] = 'GET';
    $_GET = [
        'q' => 'Nova Crixás',
        'service_id' => '1',
        'category_code' => 'population',
        'year' => '2040',
    ];
    ob_start();
    try {
        require dirname(__DIR__, 2) . '/php/endpoints/map-layer-catalog.php';
        $endpointResponse = json_decode((string) ob_get_contents(), true, 512, JSON_THROW_ON_ERROR);
    } finally {
        ob_end_clean();
        putenv($previousDatabasePath === false ? 'PLANMILT_DB_PATH' : 'PLANMILT_DB_PATH=' . $previousDatabasePath);
        if ($previousRequestMethod === null) {
            unset($_SERVER['REQUEST_METHOD']);
        } else {
            $_SERVER['REQUEST_METHOD'] = $previousRequestMethod;
        }
        $_GET = $previousQuery;
        unlink($endpointDatabasePath);
    }
    if ($endpointResponse['totalResults'] !== 1
        || $endpointResponse['results'][0]['title'] !== 'Demanda hídrica municipal 2040') {
        throw new RuntimeException('Catalog HTTP endpoint did not expose the global search contract.');
    }
} finally {
    unlink($csvPath);
}

echo "MapLayerCatalogService tests passed.\n";