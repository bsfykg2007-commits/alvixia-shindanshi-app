"""Import the 2026 finance exam; preserve explanations on subsequent imports."""

import argparse
import json
import re
from pathlib import Path

import pdfplumber
import pypdfium2 as pdfium

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "data/r08/zaimu.json"
LABELS = "アイウエオ"
DIGITS = str.maketrans("０１２３４５６７８９", "0123456789")
# PDF coordinates (top-left origin), restricted to the source tables.
FIGURES = {
    9: (7, (70, 260, 551, 573)),
    11: (9, (70, 195, 551, 684)),
    13: (12, (70, 220, 551, 351)),
    14: (13, (70, 244, 551, 704)),
    18: (17, (120, 340, 505, 414)),
    22: (20, (145, 280, 465, 393)),
}


def clean(text):
    lines = []
    for line in (text or "").translate(DIGITS).splitlines():
        line = line.strip()
        if not line or line.startswith("拡拡大大") or re.fullmatch(r"\d+", line):
            continue
        lines.append(line)
    return "\n".join(lines)


def split_choices(section):
    matches = list(re.finditer(r"(?m)^([アイウエオ])\s+", section))
    assert len(matches) in (4, 5), section
    assert [m[1] for m in matches] == list(LABELS[:len(matches)])
    question = section[:matches[0].start()].replace("〔解答群〕", "").strip()
    choices = []
    for i, match in enumerate(matches):
        end = matches[i + 1].start() if i + 1 < len(matches) else len(section)
        choices.append(section[match.end():end].strip())
    return question, choices


def answers_from_pdf(path):
    answers = {}
    number = None
    with pdfplumber.open(path) as doc:
        text = clean("\n".join(page.extract_text() or "" for page in doc.pages))
    pattern = r"^(?:第\s*(\d+)\s*問\s+)?(-|設問\s*\d+)\s+([アイウエオ])\s+(\d+)$"
    for line in text.splitlines():
        match = re.match(pattern, line)
        if not match:
            continue
        if match[1]:
            number = int(match[1])
        sub = None if match[2] == "-" else int(re.search(r"\d+", match[2])[0])
        assert number is not None
        key = (number, sub)
        assert key not in answers
        answers[key] = (match[3], int(match[4]))
    assert len(answers) == 25 and sum(p for _, p in answers.values()) == 100
    return answers


def render_figures(path):
    result = {}
    folder = ROOT / "assets/r08/zaimu"
    folder.mkdir(parents=True, exist_ok=True)
    with pdfium.PdfDocument(str(path)) as doc:
        for number, (page_number, bounds) in FIGURES.items():
            page = doc[page_number - 1]
            left, top, right, bottom = bounds
            box_left, _, _, box_top = page.get_bbox()
            media_top = page.get_mediabox()[3]
            top_offset = media_top - box_top
            left, right = left - box_left, right - box_left
            top, bottom = top - top_offset, bottom - top_offset
            crop = (left, page.get_height() - bottom, page.get_width() - right, top)
            bitmap = page.render(scale=2.5, crop=crop)
            image = bitmap.to_pil().convert("RGB")
            out = folder / f"r08-zaimu-{number:03d}_p{page_number:02d}_figure1.webp"
            image.save(out, "WEBP", quality=92, method=6)
            result[number] = [out.relative_to(ROOT).as_posix()]
            bitmap.close()
            page.close()
    return result


def remove_table_text(number, question):
    markers = {9: "Ｐ社貸借対照表", 11: "要約貸借対照表", 13: "（単位：百万円）",
               14: "1．売上高・仕入高", 18: "資本コストが4％のときの現価係数表",
               22: "資本コストが10％のときの"}
    marker = markers.get(number)
    return question.split(marker, 1)[0].strip() if marker else question


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--question-pdf", type=Path, default=Path.home() / "Downloads/B1JC2026.pdf")
    parser.add_argument("--answer-pdf", type=Path, default=Path.home() / "Downloads/2026B.pdf")
    parser.add_argument("--explanations", type=Path)
    args = parser.parse_args()
    explanations = {}
    if OUTPUT.exists():
        explanations = {r["id"]: r.get("explanation") for r in json.loads(OUTPUT.read_text(encoding="utf-8-sig"))}
    if args.explanations:
        explanations.update(json.loads(args.explanations.read_text(encoding="utf-8-sig")))
    with pdfplumber.open(args.question_pdf) as doc:
        full = "\n".join(clean(p.extract_text()) for p in doc.pages[1:])
    answers = answers_from_pdf(args.answer_pdf)
    images = render_figures(args.question_pdf)
    starts = list(re.finditer(r"(?m)^第\s*(\d+)\s*問", full))
    assert [int(m[1]) for m in starts] == list(range(1, 25))
    rows = []
    for i, start in enumerate(starts):
        number = int(start[1])
        end = starts[i + 1].start() if i + 1 < len(starts) else len(full)
        section = full[start.end():end].strip()
        sections = [(None, section)]
        if number == 11:
            parts = re.split(r"（設問([12])）", section)
            common = remove_table_text(number, parts[0])
            sections = [(int(parts[j]), common + "\n" + parts[j + 1].strip()) for j in (1, 3)]
        for sub, part in sections:
            question, choices = split_choices(part)
            if number != 11:
                question = remove_table_text(number, question)
            suffix = f"-{sub}" if sub else ""
            row_id = f"r08-zaimu-{number:03d}{suffix}"
            label, points = answers[(number, sub)]
            row = {"id": row_id, "year": "令和8年度", "subject": "財務・会計",
                   "subjectId": "zaimu", "no": f"第{number}問" + (f"（設問{sub}）" if sub else ""),
                   "points": points, "included": True, "question": question, "choices": choices,
                   "answer": LABELS.index(label), "answerLabel": label, "needsAnswerReview": False,
                   "sourceFile": "local official question PDF: B1JC2026.pdf",
                   "answerSource": "local official answer PDF: 2026B.pdf"}
            assert row["answer"] < len(choices)
            if number in images:
                row["images"] = images[number]
            if explanations.get(row_id):
                row["explanation"] = explanations[row_id]
            rows.append(row)
    assert len(rows) == 25 and len({r["id"] for r in rows}) == 25
    assert all(r.get("explanation") for r in rows), "Provide --explanations for the first import"
    for row in rows:
        explanation = row["explanation"]
        assert len(explanation.get("summary", "")) >= 100, row["id"]
        assert len(explanation.get("choiceReasons", [])) == len(row["choices"]), row["id"]
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(rows, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    manifest_path = ROOT / "data/manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8-sig"))
    year = next(y for y in manifest["years"] if y["id"] == "r08")
    if not any(s["id"] == "zaimu" for s in year["subjects"]):
        year["subjects"].append({"id": "zaimu", "name": "財務・会計"})
        manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Imported {len(rows)} items, {sum(r['points'] for r in rows)} points")


if __name__ == "__main__":
    main()
