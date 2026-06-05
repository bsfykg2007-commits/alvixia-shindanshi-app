import json
import os
import re
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SECTION_KEYS = ["summary", "whyCorrect", "whyOthersWrong", "choiceReasons", "examPoint", "practicalNote"]


def read_body():
    body_path = os.environ.get("ISSUE_BODY_PATH")
    if body_path:
        return Path(body_path).read_text(encoding="utf-8")
    return os.environ.get("ISSUE_BODY", "")


def extract(pattern, body, required=True):
    match = re.search(pattern, body, re.MULTILINE | re.DOTALL)
    if not match:
        if required:
            raise ValueError(f"Missing required field: {pattern}")
        return ""
    return match.group(1).strip()


def parse_explanation(text):
    result = {}
    for index, key in enumerate(SECTION_KEYS):
        start = re.search(rf"^{re.escape(key)}:\s*$", text, re.MULTILINE)
        if not start:
            continue
        end_pos = len(text)
        for next_key in SECTION_KEYS[index + 1:]:
            next_match = re.search(rf"^{re.escape(next_key)}:\s*$", text[start.end():], re.MULTILINE)
            if next_match:
                end_pos = start.end() + next_match.start()
                break
        value = text[start.end():end_pos].strip()
        if key == "choiceReasons":
            result[key] = [line.strip() for line in value.splitlines() if line.strip()]
        else:
            result[key] = value
    if not result:
        result["summary"] = text.strip()
    return result


def find_question(question_id):
    for path in sorted((ROOT / "data").glob("*/*.json")):
        rows = json.loads(path.read_text(encoding="utf-8-sig"))
        for index, row in enumerate(rows):
            if row.get("id") == question_id:
                return path, rows, index
    raise ValueError(f"questionId not found: {question_id}")


def main():
    body = read_body()
    question_id = extract(r"- questionId:\s*(.+)", body)
    answer = int(extract(r"- answer:\s*.*?->\s*(\d+)", body))
    explanation_text = extract(r"### 修正後の解説\s*```(?:\w+)?\s*(.*?)```", body)
    path, rows, index = find_question(question_id)
    question = rows[index]
    question["answer"] = answer
    current = question.get("explanation") or {}
    current.update(parse_explanation(explanation_text))
    question["explanation"] = current
    path.write_text(json.dumps(rows, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(path.relative_to(ROOT))


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"Failed to apply correction issue: {exc}", file=sys.stderr)
        sys.exit(1)
