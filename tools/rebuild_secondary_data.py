import json
import re
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / ".secondary-pdf-cache"
DATA_PATH = ROOT / "data" / "secondary-sample.json"
sys.path.insert(0, str(CACHE / "py"))

FW_DIGITS = str.maketrans("\uff10\uff11\uff12\uff13\uff14\uff15\uff16\uff17\uff18\uff19", "0123456789")
MAIN_PATTERN = re.compile(
    r"\u7b2c\s*([1-9\uff11-\uff19])\s*\u554f[^\n]{0,40}?"
    r"\u914d\u70b9\s*([0-9\uff10-\uff19]+)\s*\u70b9[^\n]{0,40}"
)
SUB_PATTERN = re.compile(r"[\uff08(]\s*\u8a2d\u554f\s*([0-9\uff10-\uff19]+)\s*[\uff09)]")
LIMIT_PATTERN = re.compile(r"([0-9\uff10-\uff19]+)\s*\u5b57\u4ee5\u5185")


def normalize_cid_text(text):
    text = re.sub(r"/c269([0-9])", lambda match: match.group(1), text)
    text = text.replace("\u53f7\u63d0\u9593\u9593\u3081\u76ee", "\uff08")
    text = text.replace("\u53f7\u63d0\u9593\u9593\u76ee\u9593", "\uff09")
    text = text.replace("\u756a4\u53f7\u53f7\u3058\u3081", "\uff08")
    text = text.replace("\u756a4\u53f7\u53f7\u3081\u53f7", "\uff09")
    text = text.replace("/c27F9a", "a").replace("/c27F9b", "b")
    text = "".join(character for character in text if character in "\n\t" or ord(character) >= 32)
    return text


def clean_lines(text):
    text = normalize_cid_text(text).translate(FW_DIGITS)
    kept = []
    for raw_line in text.replace("\r", "\n").splitlines():
        line = raw_line.strip()
        if not line:
            kept.append("")
            continue
        if re.fullmatch(r"[0-9]+", line):
            continue
        if "indd" in line or re.search(r"\bPage\s+[0-9]+\b", line):
            continue
        if re.fullmatch(r"DKJC[^ ]*", line):
            continue
        kept.append(line)
    text = "\n".join(kept)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def compact_text(text):
    text = clean_lines(text)
    text = re.sub(r"\s+", " ", text).strip()
    japanese = r"\u3041-\u3096\u30a1-\u30f6\u4e00-\u9fff\u3005"
    text = re.sub(r"(?<=[" + japanese + r"])\s+(?=[" + japanese + r"])", "", text)
    text = re.sub(r"(?<=[A-Za-z0-9])\s+(?=[" + japanese + r"])", "", text)
    text = re.sub(r"(?<=[" + japanese + r"])\s+(?=[A-Za-z0-9])", "", text)
    text = re.sub(r"\u7b2c\s*([1-9])\s*\u554f", lambda match: "\u7b2c" + match.group(1) + "\u554f", text)
    text = re.sub(
        r"[\uff08(]\s*\u914d\u70b9\s*([0-9]+)\s*\u70b9\s*[\uff09)]",
        lambda match: "\uff08\u914d\u70b9" + match.group(1) + "\u70b9\uff09",
        text,
    )
    text = re.sub(
        r"[\uff08(]\s*\u8a2d\u554f\s*([0-9]+)\s*[\uff09)]",
        lambda match: "\uff08\u8a2d\u554f" + match.group(1) + "\uff09",
        text,
    )
    text = re.sub(r"(?<=\d)\s+(?=\d+\s*\u5b57)", "", text)
    text = re.sub(r"\s+([\u3001\u3002\uff09\u300d\u300f\u3011])", lambda match: match.group(1), text)
    text = re.sub(r"([\uff08\u300c\u300e\u3010])\s+", lambda match: match.group(1), text)
    return text


def answer_limit(text):
    values = [int(value.translate(FW_DIGITS)) for value in LIMIT_PATTERN.findall(text)]
    return values[-1] if values else None


def allocate_slot_points(slots, total_points):
    if not slots:
        return slots
    base, remainder = divmod(total_points, len(slots))
    for index, slot in enumerate(slots):
        slot["points"] = base + (1 if index < remainder else 0)
    return slots


def clean_slot_label(text):
    text = compact_text(text)
    text = re.sub(r"^(?:の|における|について)\s*", "", text)
    text = re.sub(r"(?:について|に対して|を|は)$", "", text)
    return text.strip(" 、。")


def split_answer_slots(question_text, default_limit, total_points):
    matches = list(SUB_PATTERN.finditer(question_text))
    if matches:
        slots = []
        id_counts = {}
        for index, match in enumerate(matches):
            end = matches[index + 1].start() if index + 1 < len(matches) else len(question_text)
            sub_text = compact_text(question_text[match.end():end])
            sub_number = match.group(1).translate(FW_DIGITS)
            id_counts[sub_number] = id_counts.get(sub_number, 0) + 1
            slot_id = "sub" + sub_number
            if id_counts[sub_number] > 1:
                slot_id += "_" + str(id_counts[sub_number])
            slots.append(
                {
                    "id": slot_id,
                    "label": "\u8a2d\u554f" + sub_number,
                    "limit": answer_limit(sub_text),
                    "question": sub_text,
                }
            )
        return allocate_slot_points(slots, total_points)

    if "SWOT" in question_text and "\u305d\u308c\u305e\u308c" in question_text:
        return allocate_slot_points([
            {"id": "strength", "label": "\u5f37\u307f", "limit": default_limit},
            {"id": "weakness", "label": "\u5f31\u307f", "limit": default_limit},
            {"id": "opportunity", "label": "\u6a5f\u4f1a", "limit": default_limit},
            {"id": "threat", "label": "\u8105\u5a01", "limit": default_limit},
        ], total_points)

    if "それぞれ" in question_text:
        paired = re.search(
            r"(?:①|⒜|a)\s*(.{1,30}?)と(?:②|⒝|b)\s*(.{1,30}?)(?:について|に対して|を、?それぞれ|それぞれ)",
            question_text,
        )
        if paired:
            labels = [clean_slot_label(paired.group(1)), clean_slot_label(paired.group(2))]
            return allocate_slot_points(
                [
                    {"id": "part1", "label": labels[0] or "回答1", "limit": default_limit},
                    {"id": "part2", "label": labels[1] or "回答2", "limit": default_limit},
                ],
                total_points,
            )

        if re.search(r"(?:課題|改善策|対応策).{0,30}2つ", question_text):
            return allocate_slot_points(
                [
                    {"id": "part1", "label": "回答1", "limit": default_limit},
                    {"id": "part2", "label": "回答2", "limit": default_limit},
                ],
                total_points,
            )
    return []


def purpose_url(year, case_id):
    case_number = case_id.replace("case", "")
    lower_year = year.lower()
    if year == "R01":
        return (
            "https://www.jf-cmca.jp/attach/test/h31/h31_2ji_shushi/"
            + "r01_2ji_shushi_jirei"
            + case_number
            + ".pdf"
        )
    if year in {"H29", "H30"}:
        return (
            "https://www.jf-cmca.jp/attach/test/"
            + lower_year
            + "/"
            + lower_year
            + "_2ji_shushi/"
            + lower_year
            + "_2ji_shushi_jirei"
            + case_number
            + ".pdf"
        )
    return (
        "https://www.jf-cmca.jp/attach/test/"
        + lower_year
        + "/2ji_shushi/"
        + lower_year
        + "_2ji_shushi_jirei"
        + case_number
        + ".pdf"
    )


def extract_case(case):
    pdf_path = CACHE / (case["year"] + "_" + case["caseId"] + ".pdf")
    if case["year"] in {"H28", "H29"}:
        from pypdf import PdfReader

        page_texts = [(page.extract_text() or "") for page in PdfReader(pdf_path).pages]
    else:
        import pymupdf

        document = pymupdf.open(pdf_path)
        page_texts = [page.get_text() for page in document]
    text = clean_lines("\n".join(page_texts[1:]))
    text = normalize_cid_text(text).translate(FW_DIGITS)
    matches = list(MAIN_PATTERN.finditer(text))
    if len(matches) < 3:
        raise ValueError(f"{pdf_path.name}: only {len(matches)} main questions found")

    case["background"] = compact_text(text[: matches[0].start()])
    case["purposeUrl"] = purpose_url(case["year"], case["caseId"])
    case["purposeIndexUrl"] = "https://www.jf-cmca.jp/contents/010_c_/001_shiken_kakokekka_syusi.html"
    questions = []
    for index, match in enumerate(matches):
        end = matches[index + 1].start() if index + 1 < len(matches) else len(text)
        number = int(match.group(1).translate(FW_DIGITS))
        points = int(match.group(2).translate(FW_DIGITS))
        body = compact_text(text[match.end():end])
        question_text = f"\u7b2c{number}\u554f\uff08\u914d\u70b9{points}\u70b9\uff09 {body}".strip()
        limit = answer_limit(body)
        question = {
            "id": "q" + str(number),
            "title": "\u7b2c" + str(number) + "\u554f",
            "question": question_text,
            "limit": limit,
            "points": points,
            "keywords": [],
            "viewpoints": [],
        }
        slots = split_answer_slots(body, limit, points)
        if slots:
            question["answerSlots"] = slots
        questions.append(question)
    case["questions"] = questions
    return case


def main():
    data = json.loads(DATA_PATH.read_text(encoding="utf-8"))
    for case in data["cases"]:
        extract_case(case)
        total = sum(question["points"] for question in case["questions"])
        if total != 100:
            raise ValueError(f"{case['year']} {case['caseId']}: points total is {total}")
    DATA_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"rebuilt {len(data['cases'])} cases / {sum(len(case['questions']) for case in data['cases'])} questions")


if __name__ == "__main__":
    main()
