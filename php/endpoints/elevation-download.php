<?php
declare(strict_types=1);

/**
 * Baixa um tile HGT ausente da fonte pública de elevação.
 */
require_once dirname(__DIR__) . '/bootstrap.php';
require_once dirname(__DIR__) . '/src/Application/ElevationDownloadService.php';

ini_set('display_errors', '0');
error_reporting(E_ALL);
header('Content-Type: application/json; charset=utf-8');
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Método de requisição inválido.']);
    exit;
}
$contentType = strtolower(trim(explode(';', $_SERVER['CONTENT_TYPE'] ?? '', 2)[0]));
if ($contentType !== 'application/json') {
    http_response_code(415);
    echo json_encode(['error' => 'A requisição deve usar application/json.']);
    exit;
}
set_time_limit(120);
$raw = file_get_contents('php://input', false, null, 0, 1025);
$data = $raw !== false && strlen($raw) <= 1024 ? json_decode($raw, true) : null;
if (!is_array($data) || !isset($data['tile']) || !is_string($data['tile'])) {
    http_response_code(400);
    echo json_encode(['error' => 'Informe um tile HGT válido.']);
    exit;
}
try {
    $service = new \PlanMilT\Application\ElevationDownloadService(dirname(__DIR__, 2) . '/SRTM3');
    echo json_encode(['success' => true, 'tile' => $service->ensureTile($data['tile'])]);
} catch (InvalidArgumentException $error) {
    http_response_code(400);
    echo json_encode(['error' => $error->getMessage()]);
} catch (Throwable $error) {
    http_response_code(502);
    echo json_encode(['error' => 'Não foi possível obter o arquivo de elevação.']);
}
