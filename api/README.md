# APIセットアップ

1. MySQLで `schema.sql` を実行します。
   既存DBを更新する場合は、`migration_20260607_sessions_topics.sql` と
   `migration_20260607_sync_prompts.sql` を順に実行します。
2. `config.example.php` を `config.php` として複製し、DB接続情報を設定します。
3. HTTPS環境では `secure_cookie` を `true` にします。
4. PHP 8.1以上、PDO MySQL、mbstringを有効にします。

`config.php` は `.gitignore` の対象です。公開領域へDBパスワードを含むバックアップを置かないでください。
