#!/usr/bin/env python3
"""Mechanical facts about a generative run's diff, as input for the (LLM) grader.

Usage: diff_facts.py <changes.diff>  → prints JSON

It does not decide pass/fail. It lists which files changed, which new module folders appeared,
and per-file signals the onion rules care about (forbidden imports, process.env, Container).
"""
import json
import re
import sys
from collections import defaultdict

MODULE_RE = re.compile(r"^server/src/modules/([^/]+)/(.+)$")
SIGNALS = {
    "drizzle_import": re.compile(r"from ['\"]drizzle-orm"),
    "db_import": re.compile(r"from ['\"](\.\./)+db/(schema|client)"),
    "row_type": re.compile(r"\b\w+Row\b"),
    "process_env": re.compile(r"process\.env"),
    "container_ref": re.compile(r"\bContainer\b|\bcontainer\."),
    "fastify_import": re.compile(r"from ['\"]fastify"),
    "repository_import": re.compile(r"from ['\"][^'\"]*repository(\.js)?['\"]"),
    "other_module_import": re.compile(r"from ['\"]\.\./(?!_shared/)[a-z-]+/"),
    "adapter_import": re.compile(r"from ['\"](\.\./)+adapters/"),
    "secrets_get": re.compile(r"secrets\.get\("),
}


def parse(diff_text):
    files = {}
    current = None
    for line in diff_text.splitlines():
        if line.startswith("diff --git "):
            current = line.split(" b/", 1)[1]
            files[current] = {"added": [], "status": "modified"}
        elif current and line.startswith("new file mode"):
            files[current]["status"] = "new"
        elif current and line.startswith("deleted file mode"):
            files[current]["status"] = "deleted"
        elif current and line.startswith("+") and not line.startswith("+++"):
            files[current]["added"].append(line[1:])
    return files


def main():
    files = parse(open(sys.argv[1]).read())
    new_modules = sorted(
        {m.group(1) for p, f in files.items() if (m := MODULE_RE.match(p)) and f["status"] == "new"}
        - {m.group(1) for p, f in files.items() if (m := MODULE_RE.match(p)) and f["status"] != "new"}
    )
    outside = [p for p in files if not any(p.startswith(f"server/src/modules/{m}/") for m in new_modules)]
    per_file = {}
    for path, f in files.items():
        added = "\n".join(f["added"])
        hits = {k: len(rx.findall(added)) for k, rx in SIGNALS.items() if rx.search(added)}
        per_file[path] = {"status": f["status"], "added_lines": len(f["added"]), "signals": hits}
    by_role = defaultdict(list)
    for p in files:
        m = MODULE_RE.match(p)
        if m and m.group(1) in new_modules:
            by_role[m.group(2)].append(p)
    print(json.dumps({
        "new_module_folders": new_modules,
        "files_changed_outside_new_modules": outside,
        "new_module_files": sorted(by_role),
        "per_file": per_file,
    }, indent=2))


if __name__ == "__main__":
    main()
