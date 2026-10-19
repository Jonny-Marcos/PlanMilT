<?php
declare(strict_types=1);

use PlanMilT\Application\AdminService;
use PlanMilT\Infrastructure\Database\ConnectionFactory;

require_once dirname(__DIR__) . '/bootstrap.php';
require_once dirname(__DIR__) . '/src/Application/AdminService.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'GET') {
    header('Allow: GET');
    http_response_code(405);
    echo json_encode(['error' => 'Método não permitido.'], JSON_UNESCAPED_UNICODE);
    exit;
}

try {
    $admin = new AdminService(ConnectionFactory::create());
    echo json_encode(
        $admin->getMapDefaults(),
        JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR
    );
} catch (Throwable $error) {
    http_response_code(500);
    echo json_encode(['error' => 'Não foi possível carregar as configurações do mapa.'], JSON_UNESCAPED_UNICODE);
}
