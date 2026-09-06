"""Import the 2026 management exam and preserve its authored explanations."""

import argparse
import json
import re
from pathlib import Path

import pdfplumber
import pypdfium2 as pdfium

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "data/r08/kigyou.json"
LABELS = "アイウエオ"
DIGITS = str.maketrans("０１２３４５６７８９", "0123456789")
# Media-box coordinates; exclude these same regions from text extraction.
FIGURES = [(4, 6, (125, 265, 502, 421)),
           (13, 13, (175, 221, 451, 439)),
           (13, 14, (134, 326, 493, 476)),
           (22, 23, (167, 242, 460, 379))]


def clean(text):
    lines = []
    for line in (text or "").translate(DIGITS).splitlines():
        line = line.strip()
        if not line or line.startswith("拡拡大大") or re.fullmatch(r"\d+", line):
            continue
        lines.append(line)
    return "\n".join(lines).replace("鍼 灸", "鍼灸").replace("流 暢", "流暢")


def answers_from_pdf(path):
    with pdfplumber.open(path) as doc:
        text = clean("\n".join(p.extract_text() or "" for p in doc.pages))
    matches = re.findall(r"第\s*(\d+)\s*問\s+-\s+([アイウエオ])\s+(\d+)", text)
    answers = {int(n): (label, int(points)) for n, label, points in matches}
    assert len(matches) == len(answers) == 41
    assert set(answers) == set(range(1, 42))
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
                return not any(b[0] <= obj["x0"] < b[2] and b[1] <= obj["top"] < b[3]
                               for b in boxes)

            pages.append(clean(page.filter(keep).extract_text()))
    text = "\n".join(pages)
    starts = list(re.finditer(r"(?m)^第\s*(\d+)\s*問", text))
    assert [int(m[1]) for m in starts] == list(range(1, 42))
    result = []
    for i, start in enumerate(starts):
        end = starts[i + 1].start() if i + 1 < len(starts) else len(text)
        section = text[start.end():end].strip()
        choices = list(re.finditer(r"(?m)^([アイウエオ])\s+", section))
        assert len(choices) in (4, 5), start[1]
        assert [m[1] for m in choices] == list(LABELS[:len(choices)])
        question = section[:choices[0].start()].replace("〔解答群〕", "").strip()
        options = [section[m.end():choices[j + 1].start() if j + 1 < len(choices)
                           else len(section)].strip() for j, m in enumerate(choices)]
        result.append((int(start[1]), question, options))
    return result


def render_figures(path):
    folder = ROOT / "assets/r08/kigyou"
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
            bitmap = page.render(scale=2.5, crop=(left, page.get_height() - bottom,
                                                page.get_width() - right, top))
            filename = folder / f"r08-kigyou-{number:03d}_p{page_number:02d}_figure1.webp"
            bitmap.to_pil().convert("RGB").save(filename, "WEBP", quality=92, method=6)
            result.setdefault(number, []).append(filename.relative_to(ROOT).as_posix())
            bitmap.close()
            page.close()
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--question-pdf", type=Path, default=Path.home() / "Downloads/C1JC2026.pdf")
    parser.add_argument("--answer-pdf", type=Path, default=Path.home() / "Downloads/2026C.pdf")
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
        row_id = f"r08-kigyou-{number:03d}"
        label, points = answers[number]
        explanation = explanations.get(row_id)
        assert explanation and len(explanation.get("summary", "")) >= 100, row_id
        assert len(explanation["choiceReasons"]) == len(choices), row_id
        assert LABELS.index(label) < len(choices)
        rows.append({"id": row_id, "year": "令和8年度", "subject": "企業経営理論",
                     "subjectId": "kigyou", "no": f"第{number}問", "points": points,
                     "included": True, "question": question, "choices": choices,
                     "answer": LABELS.index(label), "answerLabel": label,
                     "needsAnswerReview": False,
                     "sourceFile": "local official question PDF: C1JC2026.pdf",
                     "answerSource": "local official answer PDF: 2026C.pdf",
                     "explanation": explanation})
    assert len({r["question"] for r in rows}) == len(rows) == 41
    images = render_figures(args.question_pdf)
    for row in rows:
        number = int(row["id"].rsplit("-", 1)[1])
        if number in images:
            row["images"] = images[number]
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(rows, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    manifest_path = ROOT / "data/manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8-sig"))
    year = next(y for y in manifest["years"] if y["id"] == "r08")
    if not any(s["id"] == "kigyou" for s in year["subjects"]):
        year["subjects"].append({"id": "kigyou", "name": "企業経営理論"})
        manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Imported {len(rows)} questions, {sum(r['points'] for r in rows)} points")


if __name__ == "__main__":
    main()
