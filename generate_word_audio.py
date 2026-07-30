from __future__ import annotations

import argparse
import asyncio
import csv
import json
import os
import re
import sys
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path

import edge_tts


DEFAULT_SOURCE = Path("Sherry雅思听力1000词（剑21版）2026.7.2.md")
DEFAULT_OUTPUT = Path("public/audio/jian21")
DEFAULT_VOICE = "en-GB-SoniaNeural"
DEFAULT_RATE = "-10%"

PAGE_MARKER_RE = re.compile(r"<!--\s*(?:PDF\s+)?page (\d+)\s*-->", re.IGNORECASE)
NUMBERED_LINE_RE = re.compile(r"^(\d+)\s+(.+?)\s*$")
POS_RE = re.compile(
    r"\s+(?:n|v|adj|adv|num|prep|pron|conj|det|excl|aux|modal|phr|abbr|art|pl|sing|int)\.?(?=\s|/|$)",
    re.IGNORECASE,
)
CJK_RE = re.compile(r"[\u3400-\u9fff]")

XIAHUA_PERSON_NAME_ENTRIES = {
    (5, 12),   # Dressler
    (8, 8),    # Walkley
    (8, 9),    # High
    (9, 15),   # Gerald
    (11, 22),  # Curtis
}

# Page 7 was extracted from the PDF in two columns, so its English headwords
# are reconstructed explicitly instead of treating the Chinese column as words.
PAGE_7_HEADWORDS = {
    1: "heavy",
    2: "tools",
    3: "spring",
    4: "Olympics",
    5: "clubs",
    6: "physics",
    7: "sea",
    8: "diversity",
    9: "airport",
    10: "clarinet",
    11: "pool",
    12: "disturbing",
    13: "WiFi",
    14: "opera",
    15: "exhibition",
    16: "energy",
    17: "microphone",
    18: "violin",
    19: "telegraph",
    20: "vitamins",
    21: "storms",
    22: "shoulder",
    23: "thermometer/thermometre",
    24: "wire",
    25: "instruments",
}


@dataclass(frozen=True)
class AudioItem:
    entry_index: int
    page: int
    number: int
    source_headword: str
    pronunciation: str
    speech_text: str
    variant: int
    audio: str


def extract_headword(text: str) -> str:
    pos_match = POS_RE.search(text)
    cjk_match = CJK_RE.search(text)
    cut_points = [match.start() for match in (pos_match, cjk_match) if match]
    cut_at = min(cut_points) if cut_points else len(text)
    return text[:cut_at].strip(" .")


def expand_variants(headword: str) -> list[str]:
    if " = " in headword:
        return [part.strip() for part in headword.split(" = ") if part.strip()]

    if "/" in headword:
        return [part.strip() for part in headword.split("/") if part.strip()]

    optional_suffix = re.fullmatch(r"(.+?)\(([A-Za-z]+)\)", headword)
    if optional_suffix:
        base, suffix = optional_suffix.groups()
        return [base, base + suffix]

    return [headword]


def filename_slug(text: str) -> str:
    slug = text.lower().replace("'", "")
    slug = re.sub(r"[^a-z0-9]+", "-", slug).strip("-")
    return slug or "word"


def resolve_profile(profile: str, source: Path) -> str:
    if profile != "auto":
        return profile
    if "高频补充机经词" in source.name:
        return "jijing_supplement"
    if "1000词" in source.name:
        return "jian21"
    if "虾滑雅思听力P1P4" in source.name:
        return "xiahua_p1p4"
    raise ValueError("Could not infer a source profile; pass --profile explicitly")


def speech_text_for(profile: str, page: int, number: int, pronunciation: str) -> str:
    if profile == "xiahua_p1p4" and (page, number) in XIAHUA_PERSON_NAME_ENTRIES:
        letters = [character.upper() for character in pronunciation if character.isalpha()]
        if not letters:
            raise ValueError(f"Could not spell person name: {pronunciation!r}")
        return " ".join(letters)
    return pronunciation


def parse_source(source: Path, profile: str) -> list[AudioItem]:
    lines = source.read_text(encoding="utf-8").splitlines()
    pages: dict[int, list[str]] = {}
    current_page: int | None = None

    for line in lines:
        marker = PAGE_MARKER_RE.search(line)
        if marker:
            current_page = int(marker.group(1))
            pages[current_page] = []
            continue
        if current_page is not None:
            pages[current_page].append(line)

    raw_entries: list[tuple[int, int, str]] = []
    for page, page_lines in sorted(pages.items()):
        if profile == "jian21" and page == 7:
            raw_entries.extend((page, number, headword) for number, headword in PAGE_7_HEADWORDS.items())
            continue

        seen_numbers: set[int] = set()
        for line in page_lines:
            match = NUMBERED_LINE_RE.match(line)
            if not match:
                continue
            number = int(match.group(1))
            # Page 16 has OCR line breaks that turn 14 into "1" + "4" and
            # 25 into "2" + "5". The second 4 and 5 are those lost entries.
            if profile == "jian21" and page == 16 and number == 4 and number in seen_numbers:
                number = 14
            elif profile == "jian21" and page == 16 and number == 5 and number in seen_numbers:
                number = 25
            if number in seen_numbers:
                raise ValueError(f"Duplicate entry number on PDF page {page}: {number}")
            headword = extract_headword(match.group(2))
            if not headword or CJK_RE.search(headword):
                raise ValueError(f"Could not extract an English headword on PDF page {page}, item {number}: {line!r}")
            seen_numbers.add(number)
            raw_entries.append((page, number, headword))

        if profile == "jian21":
            last_number = 27 if page == 42 else 25
        elif profile == "jijing_supplement":
            last_number = 10 if page == 16 else 25
        else:
            last_number = 17 if page == 14 else 25
        expected_numbers = set(range(1, last_number + 1))
        if seen_numbers != expected_numbers:
            missing = sorted(expected_numbers - seen_numbers)
            extra = sorted(seen_numbers - expected_numbers)
            raise ValueError(f"Unexpected entry numbers on PDF page {page}; missing={missing}, extra={extra}")

    if profile == "jian21":
        expected_pages = set(range(1, 43))
        expected_entry_count = 1052
    elif profile == "jijing_supplement":
        expected_pages = set(range(1, 17))
        expected_entry_count = 385
    else:
        expected_pages = set(range(1, 15))
        expected_entry_count = 342
    if set(pages) != expected_pages:
        missing = sorted(expected_pages - set(pages))
        extra = sorted(set(pages) - expected_pages)
        raise ValueError(f"Unexpected PDF page set; missing={missing}, extra={extra}")

    if len(raw_entries) != expected_entry_count:
        raise ValueError(f"Expected {expected_entry_count} source entries, found {len(raw_entries)}")

    items: list[AudioItem] = []
    for entry_index, (page, number, headword) in enumerate(raw_entries, start=1):
        variants = expand_variants(headword)
        for variant_index, pronunciation in enumerate(variants, start=1):
            variant_suffix = chr(96 + variant_index) if len(variants) > 1 else ""
            filename = f"p{page:02d}_{number:02d}{variant_suffix}_{filename_slug(pronunciation)}.mp3"
            items.append(
                AudioItem(
                    entry_index=entry_index,
                    page=page,
                    number=number,
                    source_headword=headword,
                    pronunciation=pronunciation,
                    speech_text=speech_text_for(profile, page, number, pronunciation),
                    variant=variant_index,
                    audio=filename,
                )
            )

    return items


async def synthesize_one(
    item: AudioItem,
    output_dir: Path,
    voice: str,
    rate: str,
    semaphore: asyncio.Semaphore,
    retries: int,
) -> tuple[str, str]:
    destination = output_dir / item.audio
    if destination.exists() and destination.stat().st_size > 512:
        return "skipped", item.audio

    part = destination.with_suffix(destination.suffix + ".part")
    last_error: Exception | None = None
    async with semaphore:
        for attempt in range(1, retries + 1):
            try:
                if part.exists():
                    part.unlink()
                communicator = edge_tts.Communicate(
                    text=item.speech_text,
                    voice=voice,
                    rate=rate,
                )
                await communicator.save(str(part))
                if not part.exists() or part.stat().st_size <= 512:
                    raise RuntimeError("synthesized file is empty or unexpectedly small")
                os.replace(part, destination)
                return "generated", item.audio
            except Exception as exc:  # Network failures are retried and reported at the end.
                last_error = exc
                if part.exists():
                    part.unlink()
                if attempt < retries:
                    await asyncio.sleep(min(2 ** (attempt - 1), 8))

    return "failed", f"{item.audio}: {last_error}"


def write_manifests(
    items: list[AudioItem],
    output_dir: Path,
    source: Path,
    voice: str,
    rate: str,
    profile: str,
) -> None:
    json_path = output_dir / "manifest.json"
    csv_path = output_dir / "manifest.csv"
    payload = {
        "schema_version": 1,
        "source": source.name,
        "collection_id": profile,
        "voice": voice,
        "rate": rate,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source_entry_count": len({item.entry_index for item in items}),
        "audio_item_count": len(items),
        "items": [asdict(item) for item in items],
    }
    json_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    with csv_path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(asdict(items[0]).keys()))
        writer.writeheader()
        writer.writerows(asdict(item) for item in items)


async def run(args: argparse.Namespace) -> int:
    source = args.source.resolve()
    output_dir = args.output.resolve()
    profile = resolve_profile(args.profile, source)
    items = parse_source(source, profile)

    print(
        f"Parsed collection={profile}: "
        f"{len({item.entry_index for item in items})} entries into {len(items)} audio items."
    )
    if args.dry_run:
        for item in items:
            speech_note = (
                f" [speech: {item.speech_text}]"
                if item.speech_text != item.pronunciation
                else ""
            )
            print(
                f"{item.page:02d}:{item.number:02d} "
                f"{item.pronunciation}{speech_note} -> {item.audio}"
            )
        return 0

    output_dir.mkdir(parents=True, exist_ok=True)
    write_manifests(items, output_dir, source, args.voice, args.rate, profile)

    semaphore = asyncio.Semaphore(args.concurrency)
    completed = 0
    generated = 0
    skipped = 0
    failures: list[str] = []

    tasks = [
        asyncio.create_task(
            synthesize_one(item, output_dir, args.voice, args.rate, semaphore, args.retries)
        )
        for item in items
    ]
    for task in asyncio.as_completed(tasks):
        status, detail = await task
        completed += 1
        if status == "generated":
            generated += 1
        elif status == "skipped":
            skipped += 1
        else:
            failures.append(detail)

        if completed % 50 == 0 or completed == len(tasks):
            print(
                f"Progress {completed}/{len(tasks)} "
                f"(generated={generated}, skipped={skipped}, failed={len(failures)})",
                flush=True,
            )

    if failures:
        failure_path = output_dir / "failures.txt"
        failure_path.write_text("\n".join(failures) + "\n", encoding="utf-8")
        print(f"Failed items were written to {failure_path}", file=sys.stderr)
        return 1

    failure_path = output_dir / "failures.txt"
    if failure_path.exists():
        failure_path.unlink()
    print(f"Audio generation complete: generated={generated}, skipped={skipped}, failed=0")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Generate local British-English MP3 files for the IELTS word list.")
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument(
        "--profile",
        choices=("auto", "jian21", "jijing_supplement", "xiahua_p1p4"),
        default="auto",
    )
    parser.add_argument("--voice", default=DEFAULT_VOICE)
    parser.add_argument("--rate", default=DEFAULT_RATE)
    parser.add_argument("--concurrency", type=int, default=6)
    parser.add_argument("--retries", type=int, default=4)
    parser.add_argument("--dry-run", action="store_true")
    return parser


if __name__ == "__main__":
    raise SystemExit(asyncio.run(run(build_parser().parse_args())))
