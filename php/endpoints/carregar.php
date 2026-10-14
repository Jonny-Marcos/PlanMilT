<?php
/**
 * Endpoint legado para carregar desenhos armazenados.
 *
 * Mantém o contrato POST do cliente atual enquanto a implementação é migrada.
 */
use PlanMilT\Infrastructure\Database\ConnectionFactory;

require_once dirname(__DIR__, 2) . '/bootstrap.php';

// Verifica se o método de requisição é POST
if ($_SERVER["REQUEST_METHOD"] == "POST") {
    // Recebe os dados via POST
    $usuario = $_POST['usuario'] ?? '';
    $link = $_POST['link'] ?? '';

    header('Content-Type: application/json');

    try {
        // Conecta ao banco de dados SQLite
        $db = ConnectionFactory::create();
        $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

        // Prepara a declaração SQL para selecionar sem usar senha
        $stmt = $db->prepare("SELECT leaflet FROM desenhos WHERE usuario = :usuario AND link = :link");

        // Vincula os parâmetros
        $stmt->bindParam(':usuario', $usuario);
        $stmt->bindParam(':link', $link);


        // Executa a consulta
        $stmt->execute();

        // Tenta buscar o resultado
        $result = $stmt->fetch(PDO::FETCH_ASSOC);

        if ($result) {
            // Como o conteúdo já é um JSON, podemos simplesmente retorná-lo.
            echo $result['leaflet'];
        } else {
            // Envia uma resposta de erro em formato JSON
            echo json_encode(["error" => "Nenhum desenho encontrado para o usuário fornecido."]);
        }
    } catch (PDOException $e) {
        // Envia uma mensagem de erro em formato JSON
        echo json_encode(["error" => "Erro na conexão com o banco de dados: " . $e->getMessage()]);
    }
} else {
    // Envia uma mensagem de erro em formato JSON para métodos não suportados
    echo json_encode(["error" => "Método de requisição não suportado."]);
}
?>
