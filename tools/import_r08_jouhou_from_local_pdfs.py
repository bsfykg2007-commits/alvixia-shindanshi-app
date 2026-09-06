"""Import the 2026 information systems exam, preserving authored explanations."""

import argparse
import json
import re
from pathlib import Path

import pdfplumber
import pypdfium2 as pdfium

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "data/r08/jouhou.json"
LABELS = "アイウエオ"
DIGITS = str.maketrans("０１２３４５６７８９", "0123456789")
# Top-left media coordinates, also excluded from text to avoid duplicated tables.
FIGURES = [(7, 8, (125, 248, 483, 474)),
           (8, 9, (114, 188, 503, 448)),
           (18, 19, (124, 248, 503, 450)),
           (24, 26, (124, 207, 503, 293))]


def clean(text):
    lines = [line.strip() for line in (text or "").translate(DIGITS).splitlines()
             if line.strip() and not line.strip().startswith("拡拡大大")
             and not re.fullmatch(r"\s*\d+\s*", line)]
    text = "\n".join(lines)
    for old, new in [("CP（I コスト効率指数）", "CPI（コスト効率指数）"),
                     ("SP（I スケジュール効率指数）", "SPI（スケジュール効率指数）"),
                     ("「デジタルスキル標準（」ver. 2.0）", "「デジタルスキル標準」（ver. 2.0）")]:
        text = text.replace(old, new)
    return text


def answers_from_pdf(path):
    with pdfplumber.open(path) as doc:
        text = clean("\n".join(page.extract_text() or "" for page in doc.pages))
    matches = re.findall(r"(?m)^第\s*(\d+)\s*問\s+-\s+([アイウエオ])\s+(\d+)$", text)
    assert [int(n) for n, _, _ in matches] == list(range(1, 26))
    answers = {int(n): (label, int(points)) for n, label, points in matches}
    assert sum(p for _, p in answers.values()) == 100
    return answers


def extract_questions(path):
    pages = []
    with pdfplumber.open(path) as doc:
        for number, page in enumerate(doc.pages[1:], 2):
            boxes = [b for _, p, b in FIGURES if p == number]

            def keep(obj):
                if obj.get("size", 10) < 6:
                    return False
                return not any(b[0] <= obj["x0"] < b[2] and b[1] <= obj["top"] < b[3] for b in boxes)

            pages.append(clean(page.filter(keep).extract_text()))
    text = "\n".join(pages)
    starts = list(re.finditer(r"(?m)^第\s*(\d+)\s*問", text))
    assert [int(m[1]) for m in starts] == list(range(1, 26))
    result = []
    for i, start in enumerate(starts):
        number = int(start[1])
        part = text[start.end():starts[i + 1].start() if i + 1 < len(starts) else len(text)].strip()
        if number == 8:
            # The PDF positions Japanese and Latin SQL text on different baselines.
            sql_start, sql_end = part.index("【SQL文①】"), part.index("［説明文］")
            part = (part[:sql_start] + "【SQL文①】\nSELECT 顧客ID, SUM(販売金額) AS 合計\n"
                    "FROM 販売記録 GROUP BY 顧客ID ORDER BY 合計 DESC;\n"
                    "【SQL文②】\nSELECT 商品ID, COUNT(顧客ID) AS 総数\n"
                    "FROM 販売記録 GROUP BY 商品ID ORDER BY 総数 ASC;\n" + part[sql_end:])
        matches = list(re.finditer(r"(?m)^([アイウエオ])\s+", part))
        assert [m[1] for m in matches] == list(LABELS[:len(matches)]) and len(matches) in (4, 5), number
        question = part[:matches[0].start()].replace("〔解答群〕", "").strip()
        choices = [part[m.end():matches[j + 1].start() if j + 1 < len(matches) else len(part)].strip()
                   for j, m in enumerate(matches)]
        assert len(set(choices)) == len(choices) and all(choices), number
        result.append((number, question, choices))
    return result


def render_figures(path):
    folder = ROOT / "assets/r08/jouhou"
    folder.mkdir(parents=True, exist_ok=True)
    result = {}
    with pdfium.PdfDocument(str(path)) as doc:
        for number, page_number, bounds in FIGURES:
            page = doc[page_number - 1]
            left, top, right, bottom = bounds
            box_left, _, _, box_top = page.get_bbox()
            offset = page.get_mediabox()[3] - box_top
            left, right = left - box_left, right - box_left
            top, bottom = top - offset, bottom - offset
            bitmap = page.render(scale=3, crop=(left, page.get_height() - bottom, page.get_width() - right, top))
            filename = folder / f"r08-jouhou-{number:03d}_p{page_number:02d}_figure1.webp"
            bitmap.to_pil().convert("RGB").save(filename, "WEBP", quality=95, method=6)
            result[number] = [filename.relative_to(ROOT).as_posix()]
            bitmap.close()
            page.close()
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--question-pdf", type=Path, default=Path.home() / "Downloads/F1JC2026.pdf")
    parser.add_argument("--answer-pdf", type=Path, default=Path.home() / "Downloads/2026F.pdf")
    parser.add_argument("--explanations", type=Path)
    args = parser.parse_args()
    explanations = {}
    if OUTPUT.exists():
        explanations = {r["id"]: r["explanation"] for r in json.loads(OUTPUT.read_text(encoding="utf-8"))}
    if args.explanations:
        explanations.update(json.loads(args.explanations.read_text(encoding="utf-8")))
    answers = answers_from_pdf(args.answer_pdf)
    rows = []
    for number, question, choices in extract_questions(args.question_pdf):
        row_id = f"r08-jouhou-{number:03d}"
        label, points = answers[number]
        ex = explanations.get(row_id)
        assert ex and len(ex.get("summary", "")) >= 100, row_id
        assert len(ex["choiceReasons"]) == len(choices) and all(s.strip() for s in ex["choiceReasons"]), row_id
        assert not any(re.match(r"^[アイウエオ][．.、\s]", c) for c in choices), row_id
        assert LABELS.index(label) < len(choices), row_id
        rows.append({"id": row_id, "year": "令和8年度", "subject": "経営情報システム", "subjectId": "jouhou",
                     "no": f"第{number}問", "points": points, "included": True,
                     "question": question, "choices": choices, "answer": LABELS.index(label),
                     "answerLabel": label, "needsAnswerReview": False,
                     "sourceFile": "local official question PDF: F1JC2026.pdf",
                     "answerSource": "local official answer PDF: 2026F.pdf", "explanation": ex})
    assert len(rows) == len({r["id"] for r in rows}) == len({r["question"] for r in rows}) == 25
    assert sum(r["points"] for r in rows) == 100
    images = render_figures(args.question_pdf)
    for number, row in enumerate(rows, 1):
        if number in images:
            row["images"] = images[number]
    OUTPUT.write_text(json.dumps(rows, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    manifest_path = ROOT / "data/manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8-sig"))
    year = next(y for y in manifest["years"] if y["id"] == "r08")
    if not any(s["id"] == "jouhou" for s in year["subjects"]):
        year["subjects"].append({"id": "jouhou", "name": "経営情報システム"})
        manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Imported {len(rows)} items, {sum(r['points'] for r in rows)} points")


if __name__ == "__main__":
    main()
