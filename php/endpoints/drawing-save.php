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

if (!isset($_POST['usuario'], $_POST['senha'], $_POST['leaflet'])) {
    $postLimit = ini_parse_quantity((string) ini_get('post_max_size'));
    $contentLength = (int) ($_SERVER['CONTENT_LENGTH'] ?? 0);
    if ($_POST === [] && $postLimit > 0 && $contentLength > $postLimit) {
        http_response_code(413);
        echo 'A requisição foi recusada. Verifique o limite post_max_size do PHP e o tamanho dos desenhos.';
    } else {
        http_response_code(400);
        echo 'Não foi possível salvar: dados de desenho ausentes.';
    }
    exit;
}

$user = $_POST['usuario'] ?? '';
$password = $_POST['senha'] ?? '';
$link = $_POST['link'] ?? '';
$geoJson = $_POST['leaflet'] ?? '';

if (!is_string($user) || !is_string($password) || !is_string($link) || !is_string($geoJson)) {
    echo 'Erro na conexão com o banco de dados: parâmetros inválidos.';
    exit;
}

try {
    $service = new DrawingsService(ConnectionFactory::create());
    echo $service->save($user, $password, $link, $geoJson);
} catch (PDOException $error) {
    echo 'Não foi possível salvar os desenhos.';
}
