<?php
/**
 * Endpoint legado para criar ou atualizar desenhos armazenados.
 *
 * Mantém os campos POST e as respostas de texto consumidas pela interface.
 */
use PlanMilT\Application\DrawingsService;
use PlanMilT\Infrastructure\Database\ConnectionFactory;

require_once dirname(__DIR__) . '/bootstrap.php';
require_once dirname(__DIR__) . '/src/Application/DrawingsService.php';

$method = $_SERVER['REQUEST_METHOD'] ?? '';
if ($method !== 'POST') {
    echo $method === 'GET'
        ? 'Método GET não suportado para esta operação.'
        : 'Método de requisição não suportado.';
    exit;
}

$user = $_POST['usuario'] ?? '';
$password = $_POST['senha'] ?? '';
$link = $_POST['link'] ?? '';
$leaflet = $_POST['leaflet'] ?? '';

if (!is_string($user) || !is_string($password) || !is_string($link) || !is_string($leaflet)) {
    echo 'Erro na conexão com o banco de dados: parâmetros inválidos.';
    exit;
}

try {
    $service = new DrawingsService(ConnectionFactory::create());
    echo $service->save($user, $password, $link, $leaflet);
} catch (PDOException $error) {
    echo 'Não foi possível salvar os desenhos.';
}
