<?php

// Verifica se o método de requisição é POST
if ($_SERVER["REQUEST_METHOD"] == "POST") {
    try {
        // Conecta ao banco de dados SQLite
        $db = new PDO('sqlite:bd.db');

        // Recebe os dados via POST
        $usuario = $_POST['usuario'] ?? '';
        $senha = $_POST['senha'] ?? '';
        $link = $_POST['link'] ?? '';
        $leaflet = $_POST['leaflet'] ?? '';

        // Primeiro, verifica apenas pela existência do usuário
        $stmtUserExists = $db->prepare("SELECT senha FROM desenhos WHERE usuario = :usuario AND link = :link");
        $stmtUserExists->bindParam(':usuario', $usuario);
        $stmtUserExists->bindParam(':link', $link);
        $stmtUserExists->execute();

        $userExistsResult = $stmtUserExists->fetch();

        if ($userExistsResult) {
            // Usuário existe, verifica se a senha está correta
            if (password_verify($senha, $userExistsResult['senha'])) {
                // Senha correta, atualiza o registro
                $updateStmt = $db->prepare("UPDATE desenhos SET link = :link, leaflet = :leaflet WHERE usuario = :usuario AND senha = :senhaHash");
                $updateStmt->bindParam(':usuario', $usuario);
                // Não é necessário atualizar a senha, mas é necessário passá-la corretamente para a condição WHERE
                $senhaHash = $userExistsResult['senha']; // A senha já está em hash
                $updateStmt->bindParam(':senhaHash', $senhaHash);
                $updateStmt->bindParam(':link', $link);
                $updateStmt->bindParam(':leaflet', $leaflet);

                if ($updateStmt->execute()) {
                    echo "Desenho atualizado com sucesso!";
                } else {
                    echo "Erro ao atualizar o desenho.";
                }
            } else {
                // Senha incorreta, retorna mensagem de erro
                echo "Senha incorreta.";
            }
        } else {
            // Usuário não existe, insere um novo registro
            // Primeiro, cria o hash da senha
            $senhaHash = password_hash($senha, PASSWORD_DEFAULT);

            $insertStmt = $db->prepare("INSERT INTO desenhos (usuario, senha, link, leaflet) VALUES (:usuario, :senhaHash, :link, :leaflet)");
            $insertStmt->bindParam(':usuario', $usuario);
            $insertStmt->bindParam(':senhaHash', $senhaHash); // Usa a senha em hash
            $insertStmt->bindParam(':link', $link);
            $insertStmt->bindParam(':leaflet', $leaflet);

            if ($insertStmt->execute()) {
                echo "Desenho salvo com sucesso!";
            } else {
                echo "Erro ao salvar o desenho.";
            }
        }
    } catch (PDOException $e) {
        // Caso ocorra um erro na conexão com o banco de dados, imprime a mensagem de erro
        echo "Erro na conexão com o banco de dados: " . $e->getMessage();
    }
} elseif ($_SERVER["REQUEST_METHOD"] == "GET") {
    // Código para manipulação de requisições GET, se necessário
    echo "Método GET não suportado para esta operação.";
} else {
    // Método de requisição não suportado
    echo "Método de requisição não suportado.";
}
?>
