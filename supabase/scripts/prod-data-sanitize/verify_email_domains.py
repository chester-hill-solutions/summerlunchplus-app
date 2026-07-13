#!/usr/bin/env python3
import argparse
import re
import sys
from collections import Counter

EMAIL_RE = re.compile(r"[A-Za-z0-9._%+\-']+@([A-Za-z0-9.\-]+\.[A-Za-z]{2,})")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--allowed-domain", required=True)
    args = parser.parse_args()

    with open(args.input, "r", encoding="utf-8", errors="ignore") as file:
        text = file.read()

    domains = [match.group(1).lower() for match in EMAIL_RE.finditer(text)]
    counts = Counter(domains)

    if not counts:
        print("No email-like values found.")
        return

    print("Domain counts:")
    for domain, count in sorted(counts.items(), key=lambda item: (-item[1], item[0])):
        print(f"  {domain}: {count}")

    allowed_domain = args.allowed_domain.lower()
    disallowed = {domain: count for domain, count in counts.items() if domain != allowed_domain}

    if disallowed:
        print("\nERROR: disallowed email domains found:")
        for domain, count in sorted(disallowed.items(), key=lambda item: (-item[1], item[0])):
            print(f"  {domain}: {count}")
        sys.exit(1)

    print(f"\nPASS: all email domains are @{allowed_domain}")


if __name__ == "__main__":
    main()
