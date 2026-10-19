<?php
/**
 * Endpoint legado que armazena imagens e metadados no SQLite.
 *
 * Mantém o formulário POST usado pelo criador de temas.
 */
use PlanMilT\Infrastructure\Database\ConnectionFactory;

require_once dirname(__DIR__) . '/bootstrap.php';
require_once dirname(__DIR__) . '/src/Application/ImagesService.php';

if ($_SERVER["REQUEST_METHOD"] == "POST") {
    try {
        $db = ConnectionFactory::create();
        $imageDataUrl = $_POST['imagem'] ?? '';
        $description = $_POST['descricao'] ?? '';
        $location = $_POST['localizacao'] ?? '';
        $password = $_POST['senha'] ?? '';
        $currentPassword = $_POST['senha_atual'] ?? '';
        $createdAt = $_POST['data_criacao'] ?? null;
        if (!is_string($imageDataUrl) || !is_string($description) || !is_string($location) ||
            !is_string($password) || !is_string($currentPassword) ||
            ($createdAt !== null && !is_string($createdAt))) {
            http_response_code(400);
            echo 'Dados inválidos para salvar o tema.';
            exit;
        }
        $isShared = isset($_POST['compartilhavel']) && $_POST['compartilhavel'] === 'true';
        $imageId = isset($_POST['id']) ? filter_var($_POST['id'], FILTER_VALIDATE_INT) : null;
        $imageContents = preg_replace('#^data:image/\w+;base64,#i', '', $imageDataUrl);
        $image = is_string($imageContents) ? base64_decode($imageContents, true) : false;
        $decodedLocation = json_decode($location, true);

        if ($image === false || $description === '' || $location === '' ||
            !is_array($decodedLocation) || count($decodedLocation) < 2 ||
            (isset($_POST['id']) && ($imageId === false || $imageId < 1))) {
            http_response_code(400);
            echo 'Dados inválidos para salvar o tema.';
            exit;
        }

        $service = new \PlanMilT\Application\ImagesService($db);
        echo $service->save(
            $image,
            $description,
            $location,
            $password,
            $isShared,
            $imageId === null ? null : (int) $imageId,
            $currentPassword,
            $createdAt
        );
    } catch (PDOException $e) {
        http_response_code(500);
        echo 'Não foi possível salvar o tema.';
    }
} else {
    echo "Método de requisição não suportado.";
}
?>
