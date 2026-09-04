#!/usr/bin/env python3
"""
One-off contacts importer for the UAT reset.

Reads the phone-contacts Excel export (Full Name + Mobile 1-4 columns),
normalizes every phone number to a bare 10-digit Indian-mobile form, dedupes
across the whole sheet, and emits a SQL file of
`INSERT OR IGNORE INTO callers (...)` statements to review before applying.

Deliberately stdlib-only (xlsx is just a zip of XML) so this doesn't need
`pip install openpyxl` or any new node dependency in the worker's own
package.json — this script never ships with the worker.

Any contact whose "Full Name" exactly matches (case-insensitive) a name in
--family-names is written with category='family' instead of 'client' — for
carrying over classifications that already exist in the live `callers` table
by name (some existing family rows have phone=NULL, so they can't be matched
by number; name is the only link). Pull the current list yourself with:
    wrangler d1 execute sbm-dev --remote --command \
      "SELECT name FROM callers WHERE category = 'family'"

Usage:
    python3 scripts/import_contacts.py <path-to-contacts.xlsx> [output.sql] [--family-names "Dad,Mom,Shri"]

Then review the output file, and apply it yourself with:
    wrangler d1 execute sbm-dev --remote --file=<output.sql>
"""
import sys
import re
import uuid
import zipfile
import xml.etree.ElementTree as ET
from collections import OrderedDict

NS = {"a": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
T = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}t"


def load_shared_strings(zf):
    try:
        root = ET.fromstring(zf.read("xl/sharedStrings.xml"))
    except KeyError:
        return []
    return ["".join(t.text or "" for t in si.iter(T)) for si in root]


def cell_value(cell, strings):
    v = cell.find("a:v", NS)
    if v is None:
        return ""
    if cell.get("t") == "s":
        return strings[int(v.text)]
    return v.text or ""


def normalize_phone(raw: str) -> str | None:
    """Bare 10-digit Indian mobile form, or None if not a plausible number.

    Matches the minimal `normalizePhone` in src/lib/drive-call-filename.ts
    (strip spaces/dashes) PLUS stripping a leading +91/91/0 country/trunk
    prefix, since filenames embed the number as dialled — typically a bare
    10-digit local mobile — not the E.164 form Excel exports often use.
    """
    digits = re.sub(r"\D", "", raw or "")
    if not digits:
        return None
    if len(digits) == 12 and digits.startswith("91"):
        digits = digits[2:]
    elif len(digits) == 11 and digits.startswith("0"):
        digits = digits[1:]
    if len(digits) != 10:
        return None  # junk: USSD codes, emergency numbers, malformed exports
    return digits


def sql_escape(s: str) -> str:
    return s.replace("'", "''")


def csv_escape(s: str) -> str:
    return '"' + s.replace('"', '""') + '"' if ('"' in s or "," in s or "\n" in s) else s


def main():
    args = sys.argv[1:]
    family_names: set[str] = set()
    if "--family-names" in args:
        i = args.index("--family-names")
        family_names = {n.strip().lower() for n in args[i + 1].split(",") if n.strip()}
        del args[i : i + 2]

    if len(args) < 1:
        print(__doc__)
        sys.exit(1)
    xlsx_path = args[0]
    out_path = args[1] if len(args) > 1 else "contacts_master.sql"
    csv_path = out_path.rsplit(".", 1)[0] + ".csv" if "." in out_path else out_path + ".csv"

    with zipfile.ZipFile(xlsx_path) as zf:
        strings = load_shared_strings(zf)
        sheet = ET.fromstring(zf.read("xl/worksheets/sheet1.xml"))

    rows = sheet.find("a:sheetData", NS).findall("a:row", NS)[1:]  # skip header

    seen_phones: "OrderedDict[str, str]" = OrderedDict()  # phone -> name
    skipped = []
    conflicts = []

    for row in rows:
        cells = row.findall("a:c", NS)
        vals = [cell_value(c, strings) for c in cells]
        name = (vals[1].strip() if len(vals) > 1 else "") or "Unknown"
        phones_raw = [v for v in vals[4:8] if v]
        for raw in phones_raw:
            phone = normalize_phone(raw)
            if phone is None:
                skipped.append((name, raw))
                continue
            if phone in seen_phones and seen_phones[phone] != name:
                conflicts.append((phone, seen_phones[phone], name))
                continue  # keep the first name seen, don't overwrite
            seen_phones.setdefault(phone, name)

    def category_for(name: str) -> str:
        return "family" if name.strip().lower() in family_names else "client"

    family_matches = [(phone, name) for phone, name in seen_phones.items() if category_for(name) == "family"]

    # The master list: one row per unique normalized phone, deduped, category
    # assigned. Human-readable CSV plus the ready-to-apply SQL, generated
    # together from the same dedup pass so they can never drift from each other.
    with open(csv_path, "w") as f:
        f.write("name,phone,category\n")
        for phone, name in seen_phones.items():
            f.write(f"{csv_escape(name)},{phone},{category_for(name)}\n")

    with open(out_path, "w") as f:
        f.write("-- Generated by scripts/import_contacts.py — review before applying.\n")
        f.write(f"-- {len(seen_phones)} unique contacts, {len(skipped)} rows skipped (unparseable number), {len(conflicts)} phone collisions (first name kept), {len(family_matches)} reclassified as family.\n\n")
        for phone, name in seen_phones.items():
            row_id = str(uuid.uuid4())
            category = category_for(name)
            f.write(
                "INSERT OR IGNORE INTO callers (id, name, phone, category) "
                f"VALUES ('{row_id}', '{sql_escape(name)}', '{phone}', '{category}');\n"
            )

    print(f"Wrote {len(seen_phones)} contacts to {csv_path} (master list) and {out_path} (SQL import)")
    print(f"Skipped {len(skipped)} unparseable numbers (see below, not written to SQL)")
    for name, raw in skipped[:20]:
        print(f"  skip: {name!r} -> {raw!r}")
    if len(skipped) > 20:
        print(f"  ...and {len(skipped) - 20} more")
    print(f"{len(conflicts)} phone collisions (same number, different names in the sheet):")
    for phone, first, second in conflicts[:20]:
        print(f"  {phone}: kept {first!r}, dropped {second!r}")
    if family_names:
        print(f"{len(family_matches)} contacts reclassified as family (matched --family-names {sorted(family_names)}):")
        for phone, name in family_matches:
            print(f"  family: {name!r} -> {phone}")
        matched_names = {name.strip().lower() for _, name in family_matches}
        unmatched = family_names - matched_names
        if unmatched:
            print(f"  WARNING: no row in the sheet matched these --family-names: {sorted(unmatched)}")


if __name__ == "__main__":
    main()
