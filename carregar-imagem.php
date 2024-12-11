<?php

header("Content-Type: application/json");

if ($_SERVER["REQUEST_METHOD"] == "POST") {
    if (isset($_POST['id'])) {
        $id = $_POST['id'];
        $senhaInformada = $_POST['senha'] ?? '';

        try {
            // Conecta ao banco de dados SQLite
            $db = new PDO('sqlite:bd.db');
            $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

            // Prepara a consulta SQL para buscar os dados da imagem pelo ID
            $stmt = $db->prepare("SELECT imagem, localizacao, descricao, senha, compartilhavel FROM imagens WHERE id = :id");
            $stmt->bindParam(':id', $id, PDO::PARAM_INT);
            $stmt->execute();

            // Busca o resultado
            $image = $stmt->fetch(PDO::FETCH_ASSOC);

            if ($image && $image['imagem']) {
                $senhaNoBanco = $image['senha'];
                $compartilhavel = (int)$image['compartilhavel'];

                // Verifica se a imagem requer senha
                if ($compartilhavel === 0 && !empty($senhaNoBanco)) {
                    // Imagem requer senha
                    if (empty($senhaInformada) || !password_verify($senhaInformada, $senhaNoBanco)) {
                        echo json_encode(['error' => 'Senha incorreta ou não fornecida.']);
                        exit;
                    }
                }

                // Converte o BLOB para base64 para ser enviado e utilizado diretamente no JavaScript
                $base64 = base64_encode($image['imagem']);
                $imgSrc = 'data:image/png;base64,' . $base64;
                $descricao = $image['descricao'];

                echo json_encode([
                    'url' => $imgSrc,
                    'bounds' => json_decode($image['localizacao'], true),
                    'descricao' => $descricao
                ]);
            } else {
                echo json_encode(['error' => 'Imagem não encontrada.']);
            }
        } catch (PDOException $e) {
            echo json_encode(['error' => $e->getMessage()]);
        }
    } else {
        // Se 'id' não for fornecido, retorna a lista de imagens
        try {
            // Conecta ao banco de dados SQLite
            $db = new PDO('sqlite:bd.db');
            $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

            // Prepara a consulta SQL para buscar a lista de imagens
            $stmt = $db->prepare("SELECT id, descricao FROM imagens ORDER BY id DESC");
            $stmt->execute();

            // Busca o resultado
            $images = $stmt->fetchAll(PDO::FETCH_ASSOC);

            echo json_encode(['images' => $images]);
        } catch (PDOException $e) {
            echo json_encode(['error' => $e->getMessage()]);
        }
    }
} elseif ($_SERVER["REQUEST_METHOD"] == "GET") {
    if (isset($_GET['id'])) {
        $id = $_GET['id'];

        try {
            // Conecta ao banco de dados SQLite
            $db = new PDO('sqlite:bd.db');
            $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

            // Prepara a consulta SQL para buscar a descrição e se a imagem requer senha
            $stmt = $db->prepare("SELECT descricao, senha, compartilhavel FROM imagens WHERE id = :id");
            $stmt->bindParam(':id', $id, PDO::PARAM_INT);
            $stmt->execute();

            // Busca o resultado
            $image = $stmt->fetch(PDO::FETCH_ASSOC);

            if ($image) {
                $requiresPassword = !empty($image['senha']) && (int)$image['compartilhavel'] === 0;
                echo json_encode([
                    'descricao' => $image['descricao'],
                    'requiresPassword' => $requiresPassword
                ]);
            } else {
                echo json_encode(['error' => 'Imagem não encontrada.']);
            }
        } catch (PDOException $e) {
            echo json_encode(['error' => $e->getMessage()]);
        }
    } else {
        echo json_encode(['error' => 'ID da imagem não fornecido.']);
    }
} else {
    echo json_encode(['error' => 'Método de requisição incorreto.']);
}

?>
