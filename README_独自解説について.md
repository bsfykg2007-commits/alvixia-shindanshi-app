# 独自解説の追加について

この版では、JSON内の各問題に以下の項目を追加・更新しています。

- `summary`
- `whyCorrect`
- `whyOthersWrong`
- `choiceReasons`
- `examPoint`
- `practicalNote`
- `copyrightNote`

## 方針

- 解説は独自作成です。
- 公式解説・予備校解説・他社教材の転載ではありません。
- 正解の選択肢がなぜ正しいかを `whyCorrect` に記載しています。
- 他の選択肢がなぜ誤りかを `choiceReasons` に選択肢ごとに記載しています。

## 注意

現時点でJSONに入っている問題データに対して解説を付与しています。
正解・配点をLEC等から追加反映した後は、次を実行してください。

```bash
python tools/add_original_explanations.py
```

今回更新した問題数：1048問
