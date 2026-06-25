# 更新内容 v3

## 正解・配点
- LECページの「正解と配点」の先にある診断協会PDFを直接取りに行く強化版ツールを追加しました。
- 追加ファイル: `tools/import_answers_from_lec_and_jf.py`
- 実行方法:

```bash
pip install requests beautifulsoup4 pymupdf
python tools/import_answers_from_lec_and_jf.py
```

## 解説
- 既存JSON 1048 問に対して、問題文・選択肢の文言を使った具体寄りの解説へ差し替えました。
- 正答反映済み: 154問
- 正答未反映または要確認: 894問

## 注意
- 正答未反映の問題は、誤った採点にならないよう「要確認」扱いの解説にしています。
- 正解・配点反映ツールを実行後に、必要に応じて解説を再生成してください。
