<?php
/**
 * Endpoint legado que armazena imagens e metadados no SQLite.
 *
 * Mantém o formulário POST usado pelo criador de temas.
 */
use PlanMilT\Infrastructure\Database\ConnectionFactory;

require_once dirname(__DIR__) . '/bootstrap.php';

if ($_SERVER["REQUEST_METHOD"] == "POST") {
    try {
        // Conecta ao banco de dados SQLite
        $db = ConnectionFactory::create();

        // Recebe os dados do formulário
        $imageDataUrl = $_POST['imagem'] ?? '';
        $description = $_POST['descricao'] ?? '';
        $location = $_POST['localizacao'] ?? '';
        $createdAt = $_POST['data_criacao'] ?? gmdate('Y-m-d H:i:s');
        $password = $_POST['senha'] ?? '';
        $isShared = isset($_POST['compartilhavel']) && $_POST['compartilhavel'] === 'true' ? 1 : 0;

        // Decodifica a imagem de Base64
        $image = base64_decode(preg_replace('#^data:image/\w+;base64,#i', '', $imageDataUrl));

        // Hash da senha, se fornecida
        $passwordHash = !empty($password) ? password_hash($password, PASSWORD_DEFAULT) : '';

        // Prepara a inserção no banco de dados
        $stmt = $db->prepare(
            'INSERT INTO images (image, location, created_at, updated_at, description, password_hash, is_shared) '
            . 'VALUES (:image, :location, :createdAt, datetime(\'now\'), :description, :passwordHash, :isShared)'
        );
        $stmt->bindParam(':image', $image, PDO::PARAM_LOB);
        $stmt->bindParam(':location', $location);
        $stmt->bindParam(':createdAt', $createdAt);
        $stmt->bindParam(':description', $description);
        $stmt->bindParam(':passwordHash', $passwordHash);
        $stmt->bindParam(':isShared', $isShared, PDO::PARAM_INT);

        // Executa a inserção
        if ($stmt->execute()) {
            echo "Imagem salva com sucesso!";
        } else {
            echo "Erro ao salvar a imagem.";
        }
    } catch (PDOException $e) {
        echo 'Não foi possível salvar a imagem.';
    }
} else {
    echo "Método de requisição não suportado.";
}
?>
