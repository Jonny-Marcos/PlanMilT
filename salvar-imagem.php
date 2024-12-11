<?php

if ($_SERVER["REQUEST_METHOD"] == "POST") {
    try {
        // Conecta ao banco de dados SQLite
        $db = new PDO('sqlite:bd.db');
        $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

        // Recebe os dados do formulário
        $imagemDataUrl = $_POST['imagem'] ?? '';
        $descricao = $_POST['descricao'] ?? '';
        $localizacao = $_POST['localizacao'] ?? '';
        $data_criacao = $_POST['data_criacao'] ?? date('Y-m-d H:i:s');
        $senha = $_POST['senha'] ?? '';
        $compartilhavel = isset($_POST['compartilhavel']) && $_POST['compartilhavel'] === 'true' ? 1 : 0;

        // Decodifica a imagem de Base64
        $imagem = base64_decode(preg_replace('#^data:image/\w+;base64,#i', '', $imagemDataUrl));

        // Hash da senha, se fornecida
        $senhaHash = !empty($senha) ? password_hash($senha, PASSWORD_DEFAULT) : '';

        // Prepara a inserção no banco de dados
        $stmt = $db->prepare("INSERT INTO imagens (imagem, localizacao, data_criacao, descricao, senha, compartilhavel) VALUES (:imagem, :localizacao, :data_criacao, :descricao, :senha, :compartilhavel)");
        $stmt->bindParam(':imagem', $imagem, PDO::PARAM_LOB);
        $stmt->bindParam(':localizacao', $localizacao);
        $stmt->bindParam(':data_criacao', $data_criacao);
        $stmt->bindParam(':descricao', $descricao);
        $stmt->bindParam(':senha', $senhaHash);
        $stmt->bindParam(':compartilhavel', $compartilhavel, PDO::PARAM_INT);

        // Executa a inserção
        if ($stmt->execute()) {
            echo "Imagem salva com sucesso!";
        } else {
            echo "Erro ao salvar a imagem.";
        }
    } catch (PDOException $e) {
        echo "Erro na conexão com o banco de dados: " . $e->getMessage();
    }
} else {
    echo "Método de requisição não suportado.";
}
?>
