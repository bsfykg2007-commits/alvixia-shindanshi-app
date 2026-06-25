<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

$configFile = __DIR__ . '/config.php';
if (!is_file($configFile)) {
    respond(['ok' => false, 'error' => 'サーバー設定が完了していません。'], 503);
}
$config = require $configFile;

session_name((string)($config['session_name'] ?? 'alvixia_shindanshi'));
session_set_cookie_params([
    'lifetime' => 0,
    'path' => '/',
    'secure' => (bool)($config['secure_cookie'] ?? true),
    'httponly' => true,
    'samesite' => 'Lax',
]);
session_start();

function respond(array $data, int $status = 200): never
{
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function db(): PDO
{
    global $config;
    static $pdo;
    if (!$pdo) {
        $pdo = new PDO(
            (string)$config['dsn'],
            (string)$config['user'],
            (string)$config['password'],
            [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES => false,
            ]
        );
    }
    return $pdo;
}

function input(): array
{
    $raw = file_get_contents('php://input');
    $data = json_decode($raw ?: '{}', true);
    if (!is_array($data)) {
        respond(['ok' => false, 'error' => 'JSON形式が正しくありません。'], 400);
    }
    return $data;
}

function require_method(string $method): void
{
    if ($_SERVER['REQUEST_METHOD'] !== $method) {
        header('Allow: ' . $method);
        respond(['ok' => false, 'error' => '許可されていない操作です。'], 405);
    }
}

function user_id(): ?int
{
    return isset($_SESSION['user_id']) ? (int)$_SESSION['user_id'] : null;
}

function require_user(): int
{
    $id = user_id();
    if (!$id) {
        respond(['ok' => false, 'error' => 'ログインが必要です。'], 401);
    }
    return $id;
}

function current_user(int $id): ?array
{
    $stmt = db()->prepare('SELECT id, email, display_name, rankings_opt_in, created_at FROM users WHERE id = ?');
    $stmt->execute([$id]);
    $user = $stmt->fetch();
    return $user ?: null;
}

function text_value(array $data, string $key, int $max = 255): string
{
    $value = trim((string)($data[$key] ?? ''));
    return mb_substr($value, 0, $max);
}

function nullable_int(mixed $value): ?int
{
    return $value === null || $value === '' ? null : (int)$value;
}

function question_meta(array $data): array
{
    $subject = text_value($data, 'subject', 100);
    $questionNo = text_value($data, 'questionNo', 50);
    $topic = infer_topic(text_value($data, 'topic', 150), $subject, $questionNo);
    return [
        text_value($data, 'questionId', 191),
        text_value($data, 'year', 32),
        $subject,
        text_value($data, 'subjectId', 50),
        $topic,
        $questionNo,
    ];
}

function infer_topic(string $topic, string $subject, string $questionNo = '', string $question = ''): string
{
    $topic = trim($topic);
    if ($topic !== '' && $topic !== '分野未設定') return mb_substr($topic, 0, 150);
    $text = mb_strtolower($question . ' ' . $questionNo);
    preg_match('/\d+/', $questionNo, $match);
    $number = isset($match[0]) ? (int)$match[0] : 0;
    $has = static function (array $words) use ($text): bool {
        foreach ($words as $word) if (mb_strpos($text, mb_strtolower($word)) !== false) return true;
        return false;
    };
    if (mb_strpos($subject, '企業経営理論') !== false) {
        if ($has(['マーケティング','消費者','ブランド','製品','価格','チャネル','広告','市場調査','顧客','サービス','流通'])) return 'マーケティング';
        if ($has(['人的資源','人事','労働','採用','賃金','評価','能力開発','キャリア','雇用','モチベーション'])) return '人的資源管理';
        if ($has(['組織','リーダーシップ','意思決定','組織文化','権限','官僚制','コンフリクト'])) return '組織論';
        if ($number >= 30) return 'マーケティング';
        if ($number >= 20) return '人的資源管理';
        if ($number >= 14) return '組織論';
        return '経営戦略';
    }
    if (mb_strpos($subject, '財務') !== false) return $has(['原価','損益分岐','標準原価','CVP']) ? '管理会計' : ($has(['投資','NPV','IRR','資本コスト','企業価値','証券']) ? 'ファイナンス' : '財務会計');
    if (mb_strpos($subject, '運営管理') !== false) return $has(['店舗','商店','小売','物流','在庫','販売','立地']) ? '店舗・販売管理' : '生産管理';
    if (mb_strpos($subject, '経営情報') !== false) return $has(['開発','プロジェクト','要件','テスト','システム監査']) ? 'システム開発・管理' : '情報技術';
    if (mb_strpos($subject, '経営法務') !== false) return $has(['知的財産','著作','特許','商標','意匠']) ? '知的財産権' : ($has(['会社法','株主','取締役','組織再編']) ? '会社法' : '民法・その他法務');
    if (mb_strpos($subject, '経済学') !== false) return $has(['国民所得','GDP','物価','金融','財政','景気','為替']) ? 'マクロ経済学' : 'ミクロ経済学';
    if (mb_strpos($subject, '中小企業') !== false) return $has(['政策','法律','支援','補助','制度','白書']) ? '中小企業政策' : '中小企業経営';
    return $subject !== '' ? mb_substr($subject . '・未分類', 0, 150) : '未分類';
}
