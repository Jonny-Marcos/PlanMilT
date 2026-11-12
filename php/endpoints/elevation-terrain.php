<?php
declare(strict_types=1);

/**
 * Fornece uma grade de elevação de baixa resolução para o visualizador 3D.
 */
require_once dirname(__DIR__) . '/bootstrap.php';
require_once dirname(__DIR__) . '/src/Infrastructure/Elevation/SrtmTerrainGrid.php';

use PlanMilT\Infrastructure\Elevation\SrtmTerrainGrid;

header('Content-Type: application/json; charset=utf-8');

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Use POST para consultar o terreno.']);
    exit;
}
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
$expectedOrigin = (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off' ? 'https://' : 'http://')
    . ($_SERVER['HTTP_HOST'] ?? '');
if ($origin === '' || !hash_equals($expectedOrigin, $origin)
    || (isset($_SERVER['HTTP_SEC_FETCH_SITE']) && $_SERVER['HTTP_SEC_FETCH_SITE'] !== 'same-origin')) {
    http_response_code(403);
    echo json_encode(['error' => 'A consulta do terreno deve vir do aplicativo.']);
    exit;
}

$rawData = file_get_contents('php://input');
if ($rawData === false || strlen($rawData) > 16384) {
    http_response_code(413);
    echo json_encode(['error' => 'A consulta do terreno excede o limite permitido.']);
    exit;
}

$request = json_decode($rawData, true);
if (!is_array($request)
    || !isset($request['bounds'], $request['columns'], $request['rows'])
    || !is_array($request['bounds'])
    || !is_int($request['columns'])
    || !is_int($request['rows'])) {
    http_response_code(400);
    echo json_encode(['error' => 'A consulta do terreno é inválida.']);
    exit;
}

try {
    $grid = (new SrtmTerrainGrid())->sample(
        dirname(__DIR__, 2) . '/SRTM3',
        $request['bounds'],
        $request['columns'],
        $request['rows']
    );
    echo json_encode($grid, JSON_THROW_ON_ERROR);
} catch (InvalidArgumentException $error) {
    http_response_code(400);
    echo json_encode(['error' => $error->getMessage()]);
} catch (RuntimeException $error) {
    http_response_code(500);
    echo json_encode(['error' => 'Não foi possível consultar os tiles locais de elevação.']);
} catch (JsonException $error) {
    http_response_code(500);
    echo json_encode(['error' => 'Não foi possível preparar a grade de elevação.']);
}
