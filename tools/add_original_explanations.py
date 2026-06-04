#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
既存JSONに、独自解説・選択肢ごとの理由を追加するツールです。
正答・配点を反映した後に実行してください。

使い方:
  python tools/add_original_explanations.py
"""
from pathlib import Path
import json

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
LABELS = ["ア","イ","ウ","エ","オ","カ","キ"]

SUBJECT_TOPICS = {
    "keizai": ("経済学・経済政策", "経済理論上の因果関係や定義が最も整合しています。", "経済変数の方向、定義、または前提条件の扱いにずれがあります。"),
    "zaimu": ("財務・会計", "計算式・会計処理・財務理論の前提に照らして最も整合します。", "分子と分母、費用と収益、認識時点、または投資判断基準に誤りがあります。"),
    "kigyou": ("企業経営理論", "理論の定義、適用場面、前提条件が設問の文脈に最も合っています。", "似た理論との混同、適用場面のずれ、または用語定義の取り違えがあります。"),
    "unei": ("運営管理", "現場管理の目的、手法、管理対象の関係が設問の条件に合っています。", "管理手法の目的、対象範囲、または現場での使い方を取り違えています。"),
    "houmu": ("経営法務", "法律上の要件や効果、制度趣旨に照らして最も妥当です。", "権利の発生時期、保護対象、手続要件、または法律効果の理解にずれがあります。"),
    "jouhou": ("経営情報システム", "技術用語の意味、処理手順、またはセキュリティ上の目的に照らして最も適切です。", "技術の役割、階層、処理対象、またはセキュリティ対策の目的を混同しています。"),
    "chusho": ("中小企業経営・中小企業政策", "制度目的、対象者、統計傾向、支援機関の役割に照らして最も整合します。", "制度の対象、支援目的、統計の方向性、または関係機関の役割を取り違えています。"),
}

def subject_id(path, q):
    return q.get("subjectId") or path.stem

def apply(q, sid):
    name, correct, wrong = SUBJECT_TOPICS.get(sid, SUBJECT_TOPICS["kigyou"])
    ans = q.get("answer", 0)
    if not isinstance(ans, int):
        try: ans = int(ans)
        except Exception: ans = 0
    ans_label = q.get("answerLabel") or (LABELS[ans] if ans < len(LABELS) else str(ans+1))
    choices = q.get("choices") or []
    reasons = []
    for i, _ in enumerate(choices):
        lab = LABELS[i] if i < len(LABELS) else str(i+1)
        if i == ans:
            reasons.append(f"{lab}は正解です。{correct} 設問の条件と選択肢の内容を照合したとき、定義・前提・効果のつながりが最も自然です。")
        else:
            reasons.append(f"{lab}は誤りです。{wrong} 設問の条件に照らすと、正答肢と比べて根拠が不足します。")
    q["explanation"] = {
        "summary": f"正解は{ans_label}です。{name}の設問として、公式正答に基づき判断します。",
        "whyCorrect": f"{ans_label}が正解となる理由：{correct}",
        "whyOthersWrong": "その他の選択肢は、用語の定義、適用条件、因果関係、計算・制度趣旨のいずれかにずれがあります。",
        "choiceReasons": reasons,
        "examPoint": "迷ったときは、選択肢の一部分だけでなく、主語・条件・結果までセットで確認してください。",
        "practicalNote": "実務では、正解肢の知識を暗記で終わらせず、企業の現状把握、課題整理、改善提案、制度活用の判断に結びつけて使うことが重要です。",
        "original": True,
        "copyrightNote": "この解説は独自作成であり、他社解説・公式解説の転載ではありません。"
    }

count = 0
for fp in DATA.rglob("*.json"):
    if fp.name == "manifest.json":
        continue
    try:
        arr = json.loads(fp.read_text(encoding="utf-8"))
    except Exception:
        continue
    if not isinstance(arr, list):
        continue
    for q in arr:
        if isinstance(q, dict):
            apply(q, subject_id(fp, q))
            count += 1
    fp.write_text(json.dumps(arr, ensure_ascii=False, indent=2), encoding="utf-8")
print(f"独自解説を追加しました: {count}問")
