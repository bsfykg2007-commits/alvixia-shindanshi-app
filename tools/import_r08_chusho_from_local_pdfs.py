"""Import the 2026 SME management/policy exam and preserve authored explanations."""

import argparse
import json
import re
from pathlib import Path

import pdfplumber

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "data/r08/chusho.json"
LABELS = "アイウエオ"
DIGITS = str.maketrans("０１２３４５６７８９", "0123456789")
MARKS = {
    8: ["中小企業のデジタル化への取組段階", "中小企業におけるデジタル化の取組内容"],
    15: ["有形固定資産比率と現預金比率の推移", "中小企業の手元流動性"],
    16: ["価格交渉の状況（2024年9月）", "価格転嫁率の状況（2024年9月）"],
    19: ["おおむね次の各号に掲げるもの", "基本方針"],
    25: ["「海外展開相談」", "「海外展開ハンズオン支援」"],
}


def clean(text):
    lines = [line.strip() for line in (text or "").translate(DIGITS).splitlines()
             if line.strip() and not line.strip().startswith("拡拡大大")
             and not re.fullmatch(r"[0-9①②]+", line.strip())]
    return "\n".join(lines)


def answers_from_pdf(path):
    answers = {}
    with pdfplumber.open(path) as doc:
        for page in doc.pages:
            for left, right in [(0, page.width / 2), (page.width / 2, page.width)]:
                number = None
                for line in clean(page.crop((left, 0, right, page.height)).extract_text()).splitlines():
                    m = re.match(r"^(?:第\s*(\d+)\s*問\s+)?(-|設問\s*\d+)\s+([アイウエオ])\s+(\d+)$", line)
                    if not m:
                        continue
                    if m[1]:
                        number = int(m[1])
                    sub = None if m[2] == "-" else int(re.search(r"\d+", m[2])[0])
                    assert number is not None and (number, sub) not in answers
                    answers[number, sub] = (m[3], int(m[4]))
    assert len(answers) == 42 and sum(p for _, p in answers.values()) == 100
    return answers


def extract_questions(path):
    with pdfplumber.open(path) as doc:
        text = "\n".join(clean(p.filter(lambda o: o.get("size", 10) >= 6).extract_text()) for p in doc.pages[1:])
    starts = list(re.finditer(r"(?m)^第\s*(\d+)\s*問", text))
    assert [int(m[1]) for m in starts] == list(range(1, 33))
    result = []
    for i, start in enumerate(starts):
        number = int(start[1])
        section = text[start.end():starts[i + 1].start() if i + 1 < len(starts) else len(text)].strip()
        # The original PDF puts underline reference numbers below the corresponding line.
        for j, phrase in enumerate(MARKS.get(number, [])):
            pattern = r"\s*".join(re.escape(c) for c in phrase)
            section, count = re.subn(pattern, lambda m: "①②"[j] + m[0], section, count=1)
            assert count == 1, (number, phrase)
        split = re.split(r"(?m)^（設問([123])）", section)
        parts = [(None, section)] if len(split) == 1 else [
            (int(split[j]), split[0].strip() + "\n" + split[j + 1].strip()) for j in range(1, len(split), 2)]
        for sub, part in parts:
            matches = list(re.finditer(r"(?m)^([アイウエオ])\s+", part))
            assert len(matches) in (4, 5) and [m[1] for m in matches] == list(LABELS[:len(matches)]), (number, sub)
            question = part[:matches[0].start()].replace("〔解答群〕", "").strip()
            choices = [part[m.end():matches[j + 1].start() if j + 1 < len(matches) else len(part)].strip()
                       for j, m in enumerate(matches)]
            assert len(set(choices)) == len(choices) and all(choices), (number, sub)
            result.append((number, sub, question, choices))
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--question-pdf", type=Path, default=Path.home() / "Downloads/G1JC2026.pdf")
    parser.add_argument("--answer-pdf", type=Path, default=Path.home() / "Downloads/2026G.pdf")
    parser.add_argument("--explanations", type=Path)
    args = parser.parse_args()
    explanations = {}
    if OUTPUT.exists():
        explanations = {r["id"]: r["explanation"] for r in json.loads(OUTPUT.read_text(encoding="utf-8"))}
    if args.explanations:
        explanations.update(json.loads(args.explanations.read_text(encoding="utf-8")))
    answers = answers_from_pdf(args.answer_pdf)
    rows = []
    for number, sub, question, choices in extract_questions(args.question_pdf):
        row_id = f"r08-chusho-{number:03d}" + (f"-{sub}" if sub else "")
        label, points = answers[number, sub]
        ex = explanations.get(row_id)
        assert ex and len(ex.get("summary", "")) >= 100, row_id
        assert len(ex["choiceReasons"]) == len(choices) and all(s.strip() for s in ex["choiceReasons"]), row_id
        assert LABELS.index(label) < len(choices)
        assert not any(re.match(r"^[アイウエオ][．.、\s]", c) for c in choices), row_id
        rows.append({"id": row_id, "year": "令和8年度", "subject": "中小企業経営・政策", "subjectId": "chusho",
                     "no": f"第{number}問" + (f"（設問{sub}）" if sub else ""), "points": points,
                     "included": True, "question": question, "choices": choices,
                     "answer": LABELS.index(label), "answerLabel": label, "needsAnswerReview": False,
                     "sourceFile": "local official question PDF: G1JC2026.pdf",
                     "answerSource": "local official answer PDF: 2026G.pdf", "explanation": ex})
    assert len(rows) == len({r["id"] for r in rows}) == len({r["question"] for r in rows}) == 42
    assert sum(r["points"] for r in rows) == 100
    OUTPUT.write_text(json.dumps(rows, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    path = ROOT / "data/manifest.json"
    manifest = json.loads(path.read_text(encoding="utf-8-sig"))
    year = next(y for y in manifest["years"] if y["id"] == "r08")
    if not any(s["id"] == "chusho" for s in year["subjects"]):
        year["subjects"].append({"id": "chusho", "name": "中小企業経営・政策"})
        path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Imported {len(rows)} items, {sum(r['points'] for r in rows)} points")


if __name__ == "__main__":
    main()
