# 正解・配点の反映方法

LECページの「正解と配点」リンクは、さらに先の診断協会等のページへ遷移する構造なので、下記ツールでリンクをたどってPDFを取得し、既存JSONへ反映します。

## 実行

```bash
pip install requests beautifulsoup4 pymupdf
python tools/import_answers_from_lec.py
```

## 生成・更新されるもの

- `data/answer_links_found.csv`
- `data/answer_import_report.csv`
- `raw_answers/*.pdf`
- `data/<年度>/<科目>.json` の `answer` / `answerLabel` / `points`

## 現在の状態

- R07：正答反映済み
- R01〜R06：問題JSONあり、正答・配点反映待ち
- H28〜H30：アップロードPDFは平成年度分として確認済み。ただし前回抽出ではJSONが空のため、問題抽出処理の追加確認が必要です。

