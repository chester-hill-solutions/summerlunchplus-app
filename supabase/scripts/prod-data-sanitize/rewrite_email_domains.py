#!/usr/bin/env python3
import argparse
import json
import re
from collections import Counter

EMAIL_RE = re.compile(r"[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}")


def sanitize_local(local: str) -> str:
    local = local.strip().lower()
    local = re.sub(r"[^a-z0-9._%+\-]", ".", local)
    local = re.sub(r"\.+", ".", local).strip(".")
    return local or "user"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--domain", required=True)
    parser.add_argument("--map-output", required=True)
    args = parser.parse_args()

    with open(args.input, "r", encoding="utf-8", errors="ignore") as file:
        source = file.read()

    mapping: dict[str, str] = {}
    used_targets: set[str] = set()
    source_domain_counts = Counter()

    def replace_email(match: re.Match[str]) -> str:
        original = match.group(0)
        source_key = original.lower()
        local, source_domain = source_key.split("@", 1)
        source_domain_counts[source_domain] += 1

        if source_key in mapping:
            return mapping[source_key]

        base_local = sanitize_local(local)
        candidate = f"{base_local}@{args.domain}"
        index = 1
        while candidate in used_targets:
            index += 1
            candidate = f"{base_local}+{index}@{args.domain}"

        mapping[source_key] = candidate
        used_targets.add(candidate)
        return candidate

    rewritten = EMAIL_RE.sub(replace_email, source)

    with open(args.output, "w", encoding="utf-8") as file:
        file.write(rewritten)

    payload = {
        "target_domain": args.domain,
        "source_domain_counts": dict(sorted(source_domain_counts.items())),
        "unique_source_emails": len(mapping),
        "mapping": mapping,
    }

    with open(args.map_output, "w", encoding="utf-8") as file:
        json.dump(payload, file, indent=2, sort_keys=True)

    print(f"Rewrote {len(mapping)} unique source emails to @{args.domain}")
    print(f"Wrote {args.output}")
    print(f"Wrote {args.map_output}")


if __name__ == "__main__":
    main()
