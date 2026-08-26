#!/usr/bin/env python3
import argparse
import json
import os
import re
import sys
import time
from collections import Counter

EMAIL_RE = re.compile(r"[A-Za-z0-9._%+\-]+@([A-Za-z0-9.\-]+\.[A-Za-z]{2,})")


def main() -> None:
    started_at = time.monotonic()
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--raw", required=True)
    parser.add_argument("--map", required=True)
    parser.add_argument("--allowed-domain", required=True)
    args = parser.parse_args()

    def size_mb(path: str) -> float:
        return os.path.getsize(path) / (1024 * 1024)

    def progress(message: str) -> None:
        elapsed = time.monotonic() - started_at
        print(f"[{elapsed:6.1f}s] {message}", flush=True)

    raw_mb = size_mb(args.raw)
    sanitized_mb = size_mb(args.input)
    total_mb = raw_mb + sanitized_mb
    progress(
        f"Starting verification: raw={raw_mb:.1f} MB, sanitized={sanitized_mb:.1f} MB"
    )
    estimate_low = max(10, total_mb / 20)
    estimate_high = max(20, total_mb / 10)
    progress(
        f"Rough duration estimate: {estimate_low:.0f}-{estimate_high:.0f}s "
        "at 10-20 MB/s; actual time depends on disk and memory"
    )
    progress("Loading raw dump")
    with open(args.raw, "r", encoding="utf-8", errors="ignore") as file:
        raw_text = file.read()
    progress(f"Loaded raw dump ({raw_mb:.1f} MB)")
    progress("Loading sanitized dump")
    with open(args.input, "r", encoding="utf-8", errors="ignore") as file:
        sanitized_text = file.read()
    progress(f"Loaded sanitized dump ({sanitized_mb:.1f} MB)")
    progress("Loading email map")
    with open(args.map, "r", encoding="utf-8") as file:
        email_map = json.load(file)
    progress("Scanning raw email occurrences")

    raw_emails = [match.group(0).lower() for match in EMAIL_RE.finditer(raw_text)]
    progress(f"Scanned raw email occurrences ({len(raw_emails)})")
    progress("Scanning sanitized email occurrences")
    sanitized_emails = [match.group(0).lower() for match in EMAIL_RE.finditer(sanitized_text)]
    progress(f"Scanned sanitized email occurrences ({len(sanitized_emails)})")
    raw_counts = Counter(raw_emails)
    sanitized_counts = Counter(sanitized_emails)
    raw_domains = Counter(email.rsplit("@", 1)[1] for email in raw_emails)
    sanitized_domains = Counter(email.rsplit("@", 1)[1] for email in sanitized_emails)

    mapping = {
        str(source).lower(): str(target).lower()
        for source, target in email_map.get("mapping", {}).items()
    }
    allowed_domain = args.allowed_domain.lower().lstrip("@")
    errors: list[str] = []

    if not raw_emails:
        errors.append("raw input contains no email-like values")
    if not sanitized_emails:
        errors.append("sanitized input contains no email-like values")

    disallowed_domains = {
        domain: count
        for domain, count in sanitized_domains.items()
        if domain != allowed_domain
    }
    if disallowed_domains:
        errors.append("sanitized input contains disallowed email domains")

    if len(raw_emails) != len(sanitized_emails):
        errors.append("raw and sanitized email occurrence counts differ")

    if len(mapping) != email_map.get("unique_source_emails"):
        errors.append("email map unique_source_emails does not match mapping size")

    if len(set(mapping.values())) != len(mapping):
        errors.append("email map contains duplicate target addresses")

    missing_sources = set(raw_counts) - set(mapping)
    if missing_sources:
        errors.append("raw email addresses are missing from the email map")

    invalid_targets = {
        target for target in mapping.values()
        if target.rsplit("@", 1)[-1] != allowed_domain
    }
    if invalid_targets:
        errors.append("email map contains targets outside the allowed domain")

    for source, target in mapping.items():
        if raw_counts[source] != sanitized_counts[target]:
            errors.append("email occurrence counts do not match the email map")
            break
        if source.rsplit("@", 1)[-1] != allowed_domain and source in sanitized_counts:
            errors.append("a non-allowed source email remains in the sanitized input")
            break

    print(f"Raw email-like values: {len(raw_emails)}")
    print(f"Sanitized email-like values: {len(sanitized_emails)}")
    print(f"Unique source emails: {len(mapping)}")
    print(f"Raw domains: {dict(sorted(raw_domains.items()))}")
    print(f"Sanitized domains: {dict(sorted(sanitized_domains.items()))}")

    if errors:
        print("\nERROR: sanitization verification failed:")
        for error in sorted(set(errors)):
            print(f"  - {error}")
        sys.exit(1)

    elapsed = time.monotonic() - started_at
    print(f"\nPASS: email rewriting is complete and internally consistent ({total_mb:.1f} MB scanned in {elapsed:.1f}s)")


if __name__ == "__main__":
    main()
