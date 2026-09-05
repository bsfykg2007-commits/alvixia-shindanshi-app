import json
import re
import sys
from pathlib import Path

import pdfplumber
import pypdfium2 as pdfium
from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
QUESTION_PDF = Path(r"C:\Users\bsfyk\Downloads\A1JC2026.pdf")
ANSWER_PDF = Path(r"C:\Users\bsfyk\Downloads\2026A.pdf")
DATA_DIR = ROOT / "data" / "r08"
ASSET_DIR = ROOT / "assets" / "r08" / "keizai"
LABELS = list("アイウエオカキ")


def normalize(text):
    text = (text or "").replace("\r", "\n")
    text = text.translate(str.maketrans("０１２３４５６７８９", "0123456789"))
    text = re.sub(r"拡拡大大.*", "", text)
    text = re.sub(r"^[A-Z]$", "", text, flags=re.MULTILINE)
    text = re.sub(r"^\s*\d+\s*$", "", text, flags=re.MULTILINE)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def compact(text):
    text = normalize(text)
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n+", "\n", text)
    return text.strip()


def extract_question_text():
    with pdfplumber.open(QUESTION_PDF) as pdf:
        # The cover page contains exam instructions, not question content.
        pages = [normalize(page.extract_text() or "") for page in pdf.pages[1:]]
    return "\n".join(pages)


def split_questions(full_text):
    pattern = re.compile(r"(?m)^第\s*([0-9]+)\s*問")
    matches = list(pattern.finditer(full_text))
    questions = []
    for index, match in enumerate(matches):
        end = matches[index + 1].start() if index + 1 < len(matches) else len(full_text)
        number = int(match.group(1))
        section = full_text[match.start():end].strip()
        questions.append((number, section))
    return questions


def split_question_and_choices(section):
    lines = [line.strip() for line in section.splitlines() if line.strip()]
    question_lines = []
    choices = []
    current = None
    in_choices = False

    for line in lines:
        if line == "〔解答群〕":
            in_choices = True
            continue
        match = re.match(r"^([アイウエオカキ])\s+(.+)$", line)
        if match:
            in_choices = True
            if current:
                choices.append(current.strip())
            current = match.group(2).strip()
            continue
        if in_choices:
            if current:
                current += "\n" + line
            continue
        question_lines.append(line)

    if current:
        choices.append(current.strip())

    return compact("\n".join(question_lines)), [compact(choice) for choice in choices]


def parse_answers():
    with pdfplumber.open(ANSWER_PDF) as pdf:
        text = normalize("\n".join(page.extract_text() or "" for page in pdf.pages))
    answers = {}
    for match in re.finditer(r"第\s*([0-9]+)\s*問\s+-\s+([アイウエオカキ])\s+([0-9]+)", text):
        number = int(match.group(1))
        label = match.group(2)
        points = int(match.group(3))
        answers[number] = {"answerLabel": label, "answer": LABELS.index(label), "points": points}
    return answers


def render_pages():
    ASSET_DIR.mkdir(parents=True, exist_ok=True)
    doc = pdfium.PdfDocument(str(QUESTION_PDF))
    outputs = {}
    question_pages = {
        1: [2],
        2: [3, 4],
        3: [5],
        6: [7],
        11: [13],
        12: [15, 16],
        14: [18],
        16: [21],
        17: [23],
        18: [25],
        19: [27],
        20: [29],
        21: [30],
        22: [31],
        24: [33],
        25: [34],
    }
    for question_number, pages in question_pages.items():
        paths = []
        for page_number in pages:
            page = doc[page_number - 1]
            bitmap = page.render(scale=2.0)
            image = bitmap.to_pil()
            if image.mode != "RGB":
                image = image.convert("RGB")
            path = ASSET_DIR / f"r08-keizai-{question_number:03d}_p{page_number:02d}.webp"
            image.save(path, "WEBP", quality=90, method=6)
            paths.append(path.relative_to(ROOT).as_posix())
        outputs[question_number] = paths
    return outputs


def load_explanations():
    path = ROOT / "tmp" / "r08_keizai" / "explanations.json"
    if not path.exists():
        return {}
    rows = json.loads(path.read_text(encoding="utf-8-sig"))
    return {int(row["no"]): row["explanation"] for row in rows}


def build_rows():
    answers = parse_answers()
    images = render_pages()
    explanations = load_explanations()
    rows = []
    for number, section in split_questions(extract_question_text()):
        question, choices = split_question_and_choices(section)
        if number == 14 and not choices:
            choices = ["ア", "イ", "ウ", "エ"]
        answer = answers[number]
        row = {
            "id": f"r08-keizai-{number:03d}",
            "year": "令和8年度",
            "subject": "経済学・経済政策",
            "subjectId": "keizai",
            "no": f"第{number}問",
            "points": answer["points"],
            "included": True,
            "question": question,
            "choices": choices,
            "answer": answer["answer"],
            "answerLabel": answer["answerLabel"],
            "needsAnswerReview": False,
            "sourceFile": "local official question PDF: A1JC2026.pdf",
            "answerSource": "local official answer PDF: 2026A.pdf",
        }
        if number in images:
            row["images"] = images[number]
        if number in explanations:
            row["explanation"] = explanations[number]
        rows.append(row)
    return rows


def update_manifest():
    path = ROOT / "data" / "manifest.json"
    manifest = json.loads(path.read_text(encoding="utf-8-sig"))
    if not any(year.get("id") == "r08" for year in manifest["years"]):
        subjects = [subject for subject in manifest["years"][0]["subjects"] if subject.get("id") == "keizai"]
        manifest["years"].insert(0, {"id": "r08", "name": "令和8年度", "subjects": subjects})
        path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main():
    if not QUESTION_PDF.exists() or not ANSWER_PDF.exists():
        raise FileNotFoundError("Required PDFs were not found in Downloads.")
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    rows = build_rows()
    if len(rows) != 25:
        raise ValueError(f"Expected 25 questions, got {len(rows)}")
    missing_choices = [row["id"] for row in rows if len(row["choices"]) < 4]
    if missing_choices:
        raise ValueError(f"Questions with too few choices: {missing_choices}")
    DATA_DIR.joinpath("keizai.json").write_text(
        json.dumps(rows, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    update_manifest()
    print(f"Wrote {len(rows)} questions to {DATA_DIR / 'keizai.json'}")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
