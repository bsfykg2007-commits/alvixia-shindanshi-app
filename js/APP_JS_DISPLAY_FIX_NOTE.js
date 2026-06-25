// app.js側の表示修正メモ
// 既存の showFeedback 内で choiceReasons を <ol><li>...</li></ol> で表示している場合、
// 番号が出ます。次のように div 表示へ変更してください:
//
// const reasons=(ex.choiceReasons||[]).map((r,i)=>`<div class="choice-reason"><strong>${labelOf(i)}：</strong>${escapeHtml(r)}</div>`).join('');
// ...
// <details open><summary>選択肢ごとの解説</summary><div class="reason-list">${reasons}</div></details>
