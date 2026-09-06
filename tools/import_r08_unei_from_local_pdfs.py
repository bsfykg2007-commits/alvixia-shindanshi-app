"""Import the 2026 operations exam, preserving authored explanations on reimport."""

import argparse
import json
import re
from pathlib import Path

import pdfplumber
import pypdfium2 as pdfium

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "data/r08/unei.json"
LABELS = "アイウエオ"
DIGITS = str.maketrans("０１２３４５６７８９", "0123456789")
# Top-left media coordinates; the same regions are excluded from extracted text.
FIGURES = [(3, 4, (151, 225, 481, 436)), (4, 5, (149, 246, 480, 338)),
           (8, 8, (219, 226, 409, 298)), (9, 9, (129, 325, 499, 614)),
           (15, 15, (114, 245, 513, 410)), (16, 16, (229, 312, 398, 578)),
           (17, 18, (115, 127, 502, 704)), (18, 19, (193, 216, 434, 322)),
           (18, 19, (175, 434, 454, 704)), (20, 22, (124, 205, 503, 249)),
           (27, 27, (125, 226, 502, 396)), (41, 40, (125, 286, 502, 394))]


def clean(text):
    text = (text or "").translate(DIGITS)
    text = re.sub(r"CO\s+排\s*\n2\s*\n出", "CO₂排出", text)
    text = re.sub(r"L\s+直交配列表を用\s*\n8\s*\nいた", "L₈直交配列表を用\nいた", text)
    lines = [line.strip() for line in text.splitlines() if line.strip()
             and not line.strip().startswith("拡拡大大") and not re.fullmatch(r"\s*\d+\s*", line)]
    return "\n".join(lines).replace("Environmen（t 作業環境）", "Environment（作業環境）").replace("TW（I Training", "TWI（Training")


def answers_from_pdf(path):
    answers = {}
    with pdfplumber.open(path) as doc:
        for page in doc.pages:
            for left, right in [(0, page.width / 2), (page.width / 2, page.width)]:
                number = None
                text = clean(page.crop((left, 0, right, page.height)).extract_text())
                for line in text.splitlines():
                    match = re.match(r"^(?:第\s*(\d+)\s*問\s+)?(-|設問\s*\d+)\s+([アイウエオ])\s+(\d+)$", line)
                    if not match:
                        continue
                    if match[1]:
                        number = int(match[1])
                    sub = None if match[2] == "-" else int(re.search(r"\d+", match[2])[0])
                    assert number is not None and (number, sub) not in answers
                    answers[number, sub] = (match[3], int(match[4]))
    assert len(answers) == 44 and sum(p for _, p in answers.values()) == 100
    return answers


def split_choices(section):
    matches = list(re.finditer(r"(?m)^([アイウエオ])\s+", section))
    assert len(matches) in (4, 5), section
    assert [m[1] for m in matches] == list(LABELS[:len(matches)])
    question = section[:matches[0].start()].replace("〔解答群〕", "").strip()
    choices = [section[m.end():matches[i + 1].start() if i + 1 < len(matches) else len(section)].strip()
               for i, m in enumerate(matches)]
    return question, choices


def extract_questions(path):
    pages = []
    with pdfplumber.open(path) as doc:
        for number, page in enumerate(doc.pages[1:], 2):
            boxes = [b for _, p, b in FIGURES if p == number]

            def keep(obj):
                if obj.get("size", 10) < 6 and not obj.get("text", "").isdigit():
                    return False
                return not any(b[0] <= obj["x0"] < b[2] and b[1] <= obj["top"] < b[3] for b in boxes)

            pages.append(clean(page.filter(keep).extract_text()))
    text = "\n".join(pages)
    starts = list(re.finditer(r"(?m)^第\s*(\d+)\s*問", text))
    assert [int(m[1]) for m in starts] == list(range(1, 44))
    result = []
    for i, start in enumerate(starts):
        number = int(start[1])
        section = text[start.end():starts[i + 1].start() if i + 1 < len(starts) else len(text)].strip()
        parts = [(None, section)]
        if number == 18:
            split = re.split(r"(?m)^（設問([12])）", section)
            assert len(split) == 5
            parts = [(int(split[j]), split[0].strip() + "\n" + split[j + 1].strip()) for j in (1, 3)]
        for sub, part in parts:
            question, choices = split_choices(part)
            result.append((number, sub, question, choices))
    return result


def render_figures(path):
    folder = ROOT / "assets/r08/unei"
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
            bitmap = page.render(scale=2.5, crop=(left, page.get_height() - bottom, page.get_width() - right, top))
            sequence = len(result.get(number, [])) + 1
            filename = folder / f"r08-unei-{number:03d}_p{page_number:02d}_figure{sequence}.webp"
            bitmap.to_pil().convert("RGB").save(filename, "WEBP", quality=92, method=6)
            result.setdefault(number, []).append(filename.relative_to(ROOT).as_posix())
            bitmap.close()
            page.close()
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--question-pdf", type=Path, default=Path.home() / "Downloads/D1JC2026.pdf")
    parser.add_argument("--answer-pdf", type=Path, default=Path.home() / "Downloads/2026D.pdf")
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
        row_id = f"r08-unei-{number:03d}" + (f"-{sub}" if sub else "")
        label, points = answers[number, sub]
        ex = explanations.get(row_id)
        assert ex and len(ex.get("summary", "")) >= 100, row_id
        assert len(ex["choiceReasons"]) == len(choices), row_id
        assert all(reason.strip() for reason in ex["choiceReasons"]), row_id
        assert len(choices) == len(set(choices)), row_id
        assert not any(re.match(r"^[アイウエオ][．.、\s]", c) for c in choices), row_id
        assert LABELS.index(label) < len(choices)
        rows.append({"id": row_id, "year": "令和8年度", "subject": "運営管理",
                     "subjectId": "unei", "no": f"第{number}問" + (f"（設問{sub}）" if sub else ""),
                     "points": points, "included": True, "question": question, "choices": choices,
                     "answer": LABELS.index(label), "answerLabel": label, "needsAnswerReview": False,
                     "sourceFile": "local official question PDF: D1JC2026.pdf",
                     "answerSource": "local official answer PDF: 2026D.pdf", "explanation": ex})
    assert len(rows) == len({r["question"] for r in rows}) == 44
    images = render_figures(args.question_pdf)
    for row in rows:
        number = int(row["id"].split("-")[2])
        if number in images:
            row["images"] = images[number][:1] if row["id"].endswith("018-2") else images[number]
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(rows, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    manifest_path = ROOT / "data/manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8-sig"))
    year = next(y for y in manifest["years"] if y["id"] == "r08")
    if not any(s["id"] == "unei" for s in year["subjects"]):
        year["subjects"].append({"id": "unei", "name": "運営管理"})
        manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Imported {len(rows)} items, {sum(r['points'] for r in rows)} points")


if __name__ == "__main__":
    main()
