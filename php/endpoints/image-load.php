<?php
/**
 * Endpoint legado para listar imagens e consultar metadados ou conteúdo.
 *
 * Mantém os contratos GET/POST usados pelo frontend.
 */
use PlanMilT\Infrastructure\Database\ConnectionFactory;

require_once dirname(__DIR__) . '/bootstrap.php';

header("Content-Type: application/json");

if ($_SERVER["REQUEST_METHOD"] == "POST") {
    if (isset($_POST['id'])) {
        $id = filter_var($_POST['id'], FILTER_VALIDATE_INT);
        $providedPassword = $_POST['senha'] ?? '';
        $isEditing = ($_POST['modo'] ?? '') === 'edicao';
        if ($id === false || $id < 1 || !is_string($providedPassword)) {
            echo json_encode(['error' => 'Parâmetros inválidos para carregar a imagem.']);
            exit;
        }

        try {
            // Conecta ao banco de dados SQLite
            $db = ConnectionFactory::create();
            $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

            // Prepara a consulta SQL para buscar os dados da imagem pelo ID
            $stmt = $db->prepare(
                'SELECT image, location, description, password_hash, is_shared FROM images WHERE id = :id'
            );
            $stmt->bindParam(':id', $id, PDO::PARAM_INT);
            $stmt->execute();

            // Busca o resultado
            $image = $stmt->fetch(PDO::FETCH_ASSOC);

            if ($image && $image['image']) {
                $storedPasswordHash = $image['password_hash'];
                $isShared = (int) $image['is_shared'];

                // Verifica se a imagem requer senha
                if ((!$isShared || $isEditing) && !empty($storedPasswordHash)) {
                    // Imagem requer senha
                    if (empty($providedPassword) || !password_verify($providedPassword, $storedPasswordHash)) {
                        echo json_encode(['error' => 'Senha incorreta ou não fornecida.']);
                        exit;
                    }
                }

                // Converte o BLOB para base64 para ser enviado e utilizado diretamente no JavaScript
                $base64 = base64_encode($image['image']);
                $imgSrc = 'data:image/png;base64,' . $base64;

                echo json_encode([
                    'url' => $imgSrc,
                    'bounds' => json_decode($image['location'], true),
                    'descricao' => $image['description'],
                    'compartilhavel' => $isShared === 1
                ]);
            } else {
                echo json_encode(['error' => 'Imagem não encontrada.']);
            }
        } catch (PDOException $e) {
            echo json_encode(['error' => 'Não foi possível carregar a imagem.']);
        }
    } else {
        // Se 'id' não for fornecido, retorna a lista de imagens
        try {
            // Conecta ao banco de dados SQLite
            $db = ConnectionFactory::create();
            $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

            // Prepara a consulta SQL para buscar a lista de imagens
            $stmt = $db->prepare('SELECT id, description AS descricao FROM images ORDER BY id DESC');
            $stmt->execute();

            // Busca o resultado
            $images = $stmt->fetchAll(PDO::FETCH_ASSOC);

            echo json_encode(['images' => $images]);
        } catch (PDOException $e) {
            echo json_encode(['error' => 'Não foi possível listar as imagens.']);
        }
    }
} elseif ($_SERVER["REQUEST_METHOD"] == "GET") {
    if (isset($_GET['id'])) {
        $id = $_GET['id'];

        try {
            // Conecta ao banco de dados SQLite
            $db = ConnectionFactory::create();
            $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

            // Prepara a consulta SQL para buscar a descrição e se a imagem requer senha
            $stmt = $db->prepare(
                'SELECT description, password_hash, is_shared FROM images WHERE id = :id'
            );
            $stmt->bindParam(':id', $id, PDO::PARAM_INT);
            $stmt->execute();

            // Busca o resultado
            $image = $stmt->fetch(PDO::FETCH_ASSOC);

            if ($image) {
                $requiresPassword = !empty($image['password_hash']) && (int) $image['is_shared'] === 0;
                echo json_encode([
                    'descricao' => $image['description'],
                    'requiresPassword' => $requiresPassword
                ]);
            } else {
                echo json_encode(['error' => 'Imagem não encontrada.']);
            }
        } catch (PDOException $e) {
            echo json_encode(['error' => 'Não foi possível carregar os dados da imagem.']);
        }
    } else {
        echo json_encode(['error' => 'ID da imagem não fornecido.']);
    }
} else {
    echo json_encode(['error' => 'Método de requisição incorreto.']);
}

?>
