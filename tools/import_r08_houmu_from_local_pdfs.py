"""Import the 2026 business law exam, preserving authored explanations."""

import argparse
import json
import re
from pathlib import Path

import pdfplumber

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "data/r08/houmu.json"
LABELS = "アイウエ"
DIGITS = str.maketrans("０１２３４５６７８９", "0123456789")


def clean(text):
    lines = [line.strip() for line in (text or "").translate(DIGITS).splitlines()
             if line.strip() and not line.strip().startswith("拡拡大大")
             and not re.fullmatch(r"\s*\d+\s*", line)]
    return "\n".join(lines).replace("亨有", "享有")


def answers_from_pdf(path):
    with pdfplumber.open(path) as doc:
        text = clean("\n".join(page.extract_text() or "" for page in doc.pages))
    result = {}
    number = None
    for line in text.splitlines():
        match = re.match(r"^(?:第\s*(\d+)\s*問\s+)?(-|設問\s*\d+)\s+([アイウエ])\s+(\d+)$", line)
        if match:
            if match[1]:
                number = int(match[1])
            sub = None if match[2] == "-" else int(re.search(r"\d+", match[2])[0])
            assert number is not None and (number, sub) not in result
            result[number, sub] = (match[3], int(match[4]))
    assert len(result) == 25 and sum(points for _, points in result.values()) == 100
    return result


def extract_questions(path):
    with pdfplumber.open(path) as doc:
        text = "\n".join(clean(page.filter(lambda obj: obj.get("size", 10) >= 6).extract_text())
                         for page in doc.pages[1:])
    starts = list(re.finditer(r"(?m)^第\s*(\d+)\s*問", text))
    assert [int(m[1]) for m in starts] == list(range(1, 25))
    result = []
    for i, start in enumerate(starts):
        number = int(start[1])
        section = text[start.end():starts[i + 1].start() if i + 1 < len(starts) else len(text)].strip()
        parts = [(None, section)]
        if number == 10:
            split = re.split(r"(?m)^（設問([12])）", section)
            assert len(split) == 5
            parts = [(int(split[j]), split[0].strip() + "\n" + split[j + 1].strip()) for j in (1, 3)]
        for sub, part in parts:
            # The dialogue choices in question 14 put each label on its own line.
            matches = list(re.finditer(r"(?m)^([アイウエ])(?:[ \t]+|\n)", part))
            assert [m[1] for m in matches] == list(LABELS), (number, sub)
            question = part[:matches[0].start()].replace("〔解答群〕", "").strip()
            choices = [part[m.end():matches[j + 1].start() if j + 1 < len(matches) else len(part)].strip()
                       for j, m in enumerate(matches)]
            assert len(set(choices)) == 4 and all(choices)
            result.append((number, sub, question, choices))
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--question-pdf", type=Path, default=Path.home() / "Downloads/E1JC2026.pdf")
    parser.add_argument("--answer-pdf", type=Path, default=Path.home() / "Downloads/2026E.pdf")
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
        row_id = f"r08-houmu-{number:03d}" + (f"-{sub}" if sub else "")
        label, points = answers[number, sub]
        ex = explanations.get(row_id)
        assert ex and len(ex.get("summary", "")) >= 100, row_id
        assert len(ex["choiceReasons"]) == 4 and all(s.strip() for s in ex["choiceReasons"]), row_id
        assert not any(re.match(r"^[アイウエ][．.、\s]", c) for c in choices), row_id
        rows.append({"id": row_id, "year": "令和8年度", "subject": "経営法務", "subjectId": "houmu",
                     "no": f"第{number}問" + (f"（設問{sub}）" if sub else ""), "points": points,
                     "included": True, "question": question, "choices": choices,
                     "answer": LABELS.index(label), "answerLabel": label, "needsAnswerReview": False,
                     "sourceFile": "local official question PDF: E1JC2026.pdf",
                     "answerSource": "local official answer PDF: 2026E.pdf", "explanation": ex})
    assert len(rows) == len({r["id"] for r in rows}) == len({r["question"] for r in rows}) == 25
    assert sum(r["points"] for r in rows) == 100
    OUTPUT.write_text(json.dumps(rows, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    manifest_path = ROOT / "data/manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8-sig"))
    year = next(y for y in manifest["years"] if y["id"] == "r08")
    if not any(s["id"] == "houmu" for s in year["subjects"]):
        year["subjects"].append({"id": "houmu", "name": "経営法務"})
        manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Imported {len(rows)} items, {sum(r['points'] for r in rows)} points")


if __name__ == "__main__":
    main()
