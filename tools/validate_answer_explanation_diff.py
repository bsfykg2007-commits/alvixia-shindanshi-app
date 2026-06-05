import json
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ALLOWED_TOP_LEVEL_KEYS = {"answer", "explanation"}


def run(*args):
    return subprocess.check_output(args, cwd=ROOT, text=True, encoding="utf-8", errors="replace").strip()


def changed_files():
    out = run("git", "diff", "--name-only", "origin/main...HEAD", "--", "data")
    return [Path(line) for line in out.splitlines() if line.strip()]


def load_head(path):
    return json.loads((ROOT / path).read_text(encoding="utf-8-sig"))


def load_base(path):
    try:
        text = run("git", "show", f"origin/main:{path.as_posix()}")
    except subprocess.CalledProcessError:
        raise ValueError(f"{path} is new or missing on main. Correction PRs may only edit existing data files.")
    return json.loads(text)


def by_id(rows, path):
    result = {}
    for row in rows:
        qid = row.get("id")
        if not qid:
            raise ValueError(f"{path} contains a question without id.")
        result[qid] = row
    return result


def validate_question(base, head, qid, path):
    base_keys = set(base.keys())
    head_keys = set(head.keys())
    if base_keys != head_keys:
        raise ValueError(f"{path}:{qid} changed keys. Only answer and explanation values may change.")
    for key in sorted(base_keys):
        if key in ALLOWED_TOP_LEVEL_KEYS:
            continue
        if base[key] != head[key]:
            raise ValueError(f"{path}:{qid} changed '{key}'. Only answer and explanation may change.")


def validate_file(path):
    if path.suffix != ".json":
        raise ValueError(f"{path} is not a JSON data file.")
    base_rows = load_base(path)
    head_rows = load_head(path)
    base_map = by_id(base_rows, path)
    head_map = by_id(head_rows, path)
    if set(base_map) != set(head_map):
        raise ValueError(f"{path} changed question set. Correction PRs may not add or remove questions.")
    for qid in sorted(base_map):
        validate_question(base_map[qid], head_map[qid], qid, path)


def main():
    files = changed_files()
    for path in files:
        validate_file(path)
    print(f"Validated {len(files)} data file(s): only answer/explanation changed.")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"Validation failed: {exc}", file=sys.stderr)
        sys.exit(1)
