# report.py
import glob
import json
import os


def gen_report(out_dir=".promptfoo_results", out_md="promptfoo_report.md"):
    files = glob.glob(os.path.join(out_dir, "*.json"))
    rows = []
    for f in files:
        try:
            with open(f, encoding="utf-8") as result_file:
                j = json.load(result_file)
            rows.append(j)
        except Exception:
            continue
    lines = [
        "| task | provider | model | success | runtime_s |",
        "|---|---|---|---|---|",
    ]
    for r in rows:
        lines.append(
            f"|{r.get('task_id', '-')}|{r.get('provider', '-')}|{r.get('model', '-')}|{r.get('success')}|{r.get('runtime_s')}|"
        )
    with open(out_md, "w", encoding="utf-8") as report_file:
        report_file.write("\n".join(lines))
    print("Wrote", out_md)


if __name__ == "__main__":
    gen_report()
