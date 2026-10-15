<?php
declare(strict_types=1);

use PlanMilT\Application\MapLayerCatalogService;
use PlanMilT\Infrastructure\Database\ConnectionFactory;

require_once dirname(__DIR__) . '/php/bootstrap.php';
require_once dirname(__DIR__) . '/php/src/Application/MapLayerCatalogService.php';

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

$projectRoot = dirname(__DIR__);
$csvPath = $argv[1] ?? $projectRoot . '/storage/wms-layer-review.csv';

try {
    $service = new MapLayerCatalogService(ConnectionFactory::create());
    $result = $service->importCsv($csvPath);
    printf(
        "Camadas importadas/atualizadas: %d | Linhas ignoradas: %d | Recomendações: %d\n",
        $result['imported'],
        $result['skipped'],
        $result['recommended']
    );
} catch (Throwable $error) {
    fwrite(STDERR, 'Falha ao importar catálogo: ' . $error->getMessage() . PHP_EOL);
    exit(1);
}