from __future__ import annotations

import argparse
import asyncio
import json
import os
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import edge_tts


ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"
DATA_OUTPUT = PUBLIC / "data" / "quiz-data.json"
US_AUDIO_DIR = PUBLIC / "audio" / "us-variants"
US_VOICE = "en-US-JennyNeural"
US_RATE = "-10%"

PAGE_MARKER_RE = re.compile(r"<!--\s*(?:PDF\s+)?page (\d+)\s*-->", re.IGNORECASE)
NUMBERED_LINE_RE = re.compile(r"^(\d+)\s+(.+?)\s*$")
CJK_RE = re.compile(r"[\u3400-\u9fff]")
POS_PREFIX_RE = re.compile(
    r"^(?:(?:n|v|adj|adv|num|prep|pron|conj|det|excl|aux|modal|phr|abbr|art|pl|sing|int)\.?(?:\s*/\s*|\s+|$))+",
    re.IGNORECASE,
)
POS_TOKEN_RE = re.compile(
    r"(?<![A-Za-z])(?:prep|pron|conj|modal|abbr|sing|excl|adj|adv|num|det|aux|phr|art|int|pl|n|v)\.?(?![A-Za-z])",
    re.IGNORECASE,
)


@dataclass(frozen=True)
class CollectionConfig:
    id: str
    label: str
    source: Path
    manifest: Path
    audio_base: str
    expected_entries: int
    expected_audio: int


COLLECTIONS = (
    CollectionConfig(
        id="jian21",
        label="剑21版词表",
        source=ROOT / "Sherry雅思听力1000词（剑21版）2026.7.2.md",
        manifest=PUBLIC / "audio" / "jian21" / "manifest.json",
        audio_base="audio/jian21",
        expected_entries=1052,
        expected_audio=1066,
    ),
    CollectionConfig(
        id="jijing_supplement",
        label="高频补充机经词",
        source=ROOT / "Sherry雅思听力高频补充机经词2026.6.27.md",
        manifest=PUBLIC / "audio" / "jijing-supplement" / "manifest.json",
        audio_base="audio/jijing-supplement",
        expected_entries=385,
        expected_audio=392,
    ),
    CollectionConfig(
        id="xiahua_p1p4",
        label="虾滑P1/P4答案词",
        source=ROOT / "虾滑雅思听力P1P4答案词（去重版）.md",
        manifest=PUBLIC / "audio" / "xiahua-p1p4" / "manifest.json",
        audio_base="audio/xiahua-p1p4",
        expected_entries=342,
        expected_audio=369,
    ),
)

EXPECTED_QUESTION_COUNT = sum(config.expected_entries for config in COLLECTIONS)
EXPECTED_BRITISH_AUDIO_ASSETS = sum(config.expected_audio for config in COLLECTIONS)


# British-preferred form for regional variants. Non-regional variants retain
# the source-first form so their answer semantics are not silently rewritten.
GB_CANONICAL: dict[str, str] = {
    "jian21:20": "theatre",
    "jian21:78": "centre",
    "jian21:92": "catalogue",
    "jian21:173": "thermometer",
    "jian21:185": "blond",
    "jian21:299": "mid-day",
    "jian21:504": "behaviour",
    "jian21:529": "maths",
    "jian21:570": "litre",
    "jian21:608": "fertiliser",
    "jian21:714": "socialise",
    "jian21:738": "harbour",
    "jian21:781": "colour",
    "jian21:915": "diameter",
    "jijing_supplement:37": "barcode",
    "jijing_supplement:142": "advisors",
    "jijing_supplement:147": "flavour",
    "jijing_supplement:154": "grey",
    "jijing_supplement:163": "adaptor",
    "jijing_supplement:313": "defences",
    "jijing_supplement:339": "mould",
    "xiahua_p1p4:149": "fertilisers",
    "xiahua_p1p4:176": "tyres",
    "xiahua_p1p4:291": "grey",
}


JIAN21_PAGE_7_DEFINITIONS = {
    1: "重的",
    2: "工具",
    3: "春天，泉，弹簧；跳跃",
    4: "奥林匹克运动会",
    5: "社团，俱乐部，球杆",
    6: "物理学，物理现象",
    7: "海洋，许多，大量",
    8: "多样化，分歧",
    9: "机场",
    10: "单簧管",
    11: "水池",
    12: "烦忧的",
    13: "无线局域网",
    14: "歌剧",
    15: "展览，表现，显示",
    16: "精力，能量，活力，精神",
    17: "麦克风",
    18: "小提琴",
    19: "电报；拍电报",
    20: "维生素",
    21: "暴风雨；怒骂",
    22: "肩膀",
    23: "温度计",
    24: "金属丝，电线，电报；给……装电线，拍电报，电汇",
    25: "仪器，乐器",
}

JIAN21_PAGE_24_DEFINITIONS = {
    1: "消息，通知",
    2: "医院",
    3: "五月",
    4: "合作",
    5: "国家，故乡",
    6: "天气，气象",
    7: "标准，水准，旗帜，标杆",
    8: "完成，完善",
    9: "浴室，浴盆，沐浴",
    10: "劝服，劝告",
    11: "课程，进程，一道菜，跑道",
    12: "第二，第二名，秒，瞬间",
    13: "医生，博士",
    14: "垃圾，杂物",
    15: "合乎情理的，公平的，公道的",
    16: "支撑，赞助，支持者，忍受",
    17: "新闻工作者，记者",
    18: "返回，回程，收益，归还之物",
    19: "讲义，散发材料",
    20: "书面的，成文的，文字的",
    21: "工作，作品，事业",
    22: "技术的，工艺的，专业的",
    23: "狮子，勇猛的人",
    24: "沙漠；舍弃，遗弃",
    25: "回收，送达，陡下坡",
}

DEFINITION_OVERRIDES: dict[tuple[str, int, int], str] = {
    **{("jian21", 7, number): text for number, text in JIAN21_PAGE_7_DEFINITIONS.items()},
    **{("jian21", 24, number): text for number, text in JIAN21_PAGE_24_DEFINITIONS.items()},
    ("jian21", 16, 12): "二，两个",
    ("jian21", 16, 13): "博客",
    ("jian21", 42, 3): "例行公事，日常工作；日常的，例行的",
    ("jijing_supplement", 4, 8): "额外的；额外的东西，额外费用；额外地",
}

PART_OF_SPEECH_OVERRIDES: dict[tuple[str, int, int], str] = {
    ("jian21", 6, 15): "adv.",
    ("jian21", 7, 1): "adj.",
    ("jian21", 7, 2): "n.",
    ("jian21", 7, 4): "n.",
    ("jian21", 7, 5): "n.",
    ("jian21", 7, 6): "n.",
    ("jian21", 7, 7): "n.",
    ("jian21", 7, 8): "n.",
    ("jian21", 7, 9): "n.",
    ("jian21", 7, 10): "n.",
    ("jian21", 7, 11): "n.",
    ("jian21", 7, 12): "adj.",
    ("jian21", 7, 13): "n.",
    ("jian21", 7, 14): "n.",
    ("jian21", 7, 15): "n.",
    ("jian21", 7, 16): "n.",
    ("jian21", 7, 17): "n.",
    ("jian21", 7, 18): "n.",
    ("jian21", 7, 20): "n.",
    ("jian21", 7, 22): "n.",
    ("jian21", 16, 12): "num.",
    ("jian21", 24, 1): "n.",
    ("jian21", 24, 2): "n.",
    ("jian21", 24, 3): "n.",
    ("jian21", 24, 4): "n.",
    ("jian21", 24, 7): "n.",
    ("jian21", 24, 10): "v.",
    ("jian21", 24, 11): "n.",
    ("jian21", 24, 15): "adj.",
    ("jian21", 24, 17): "n.",
    ("jian21", 24, 19): "n.",
    ("jian21", 24, 22): "adj.",
    ("jian21", 24, 23): "n.",
    ("jian21", 24, 25): "n.",
    ("jian21", 30, 1): "adj.",
    ("jian21", 30, 3): "n.",
    ("jian21", 30, 4): "n.",
    ("jian21", 30, 7): "n.",
    ("jian21", 30, 8): "adj.",
    ("jian21", 30, 9): "n.",
    ("jian21", 30, 10): "n. / v.",
    ("jian21", 30, 11): "n.",
    ("jian21", 30, 12): "n.",
    ("jian21", 30, 13): "n.",
    ("jian21", 30, 15): "n.",
    ("jian21", 30, 17): "n.",
    ("jian21", 30, 18): "adj.",
    ("jian21", 30, 20): "adj.",
    ("jian21", 30, 21): "n.",
    ("jian21", 30, 22): "n.",
    ("jian21", 30, 24): "n.",
    ("jian21", 30, 25): "n.",
    ("jian21", 33, 1): "n.",
    ("jian21", 33, 2): "num.",
    ("jian21", 33, 5): "adj.",
    ("jian21", 33, 6): "n.",
    ("jian21", 33, 7): "n.",
    ("jian21", 33, 9): "n.",
    ("jian21", 33, 10): "num. / n.",
    ("jian21", 33, 14): "n.",
    ("jian21", 33, 16): "n.",
    ("jian21", 33, 18): "n.",
    ("jian21", 33, 22): "n.",
    ("jian21", 33, 24): "n.",
    ("jian21", 33, 25): "n.",
}


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def split_pages(source: Path) -> dict[int, list[str]]:
    pages: dict[int, list[str]] = {}
    current_page: int | None = None
    for line in source.read_text(encoding="utf-8").splitlines():
        marker = PAGE_MARKER_RE.search(line)
        if marker:
            current_page = int(marker.group(1))
            pages[current_page] = []
            continue
        if current_page is not None:
            pages[current_page].append(line)
    return pages


def raw_entries(config: CollectionConfig) -> dict[tuple[int, int], str]:
    result: dict[tuple[int, int], str] = {}
    for page, lines in sorted(split_pages(config.source).items()):
        seen: set[int] = set()
        for line in lines:
            match = NUMBERED_LINE_RE.match(line)
            if not match:
                continue
            number = int(match.group(1))
            if config.id == "jian21" and page == 16 and number == 4 and number in seen:
                number = 14
            elif config.id == "jian21" and page == 16 and number == 5 and number in seen:
                number = 25
            if number in seen:
                continue
            seen.add(number)
            result[(page, number)] = match.group(2).strip()
    return result


def extract_definition(raw: str, headword: str) -> str:
    remainder = raw
    if remainder.casefold().startswith(headword.casefold()):
        remainder = remainder[len(headword) :]
    remainder = POS_PREFIX_RE.sub("", remainder.strip())
    remainder = remainder.strip(" .；;，,")
    if not CJK_RE.search(remainder):
        return ""
    return remainder


def extract_parts_of_speech(raw: str, headword: str) -> str:
    remainder = raw
    if remainder.casefold().startswith(headword.casefold()):
        remainder = remainder[len(headword) :]

    labels: list[str] = []
    for match in POS_TOKEN_RE.finditer(remainder):
        label = f"{match.group(0).casefold().rstrip('.')}."
        if label not in labels:
            labels.append(label)
    return " / ".join(labels)


def slug(text: str) -> str:
    value = re.sub(r"[^a-z0-9]+", "-", text.casefold()).strip("-")
    return value or "word"


def us_filename(collection_id: str, entry_index: int, canonical: str) -> str:
    return f"{collection_id}_{entry_index:04d}_{slug(canonical)}_us.mp3"


def build_questions() -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    collections_payload: list[dict[str, Any]] = []
    questions: list[dict[str, Any]] = []

    for config in COLLECTIONS:
        manifest = load_json(config.manifest)
        if manifest["source_entry_count"] != config.expected_entries:
            raise ValueError(f"Unexpected entry count for {config.id}: {manifest['source_entry_count']}")
        if manifest["audio_item_count"] != config.expected_audio:
            raise ValueError(f"Unexpected audio count for {config.id}: {manifest['audio_item_count']}")

        source_rows = raw_entries(config)
        grouped: dict[int, list[dict[str, Any]]] = {}
        for item in manifest["items"]:
            grouped.setdefault(int(item["entry_index"]), []).append(item)

        collection_questions: list[str] = []
        for entry_index in range(1, config.expected_entries + 1):
            variants = grouped.get(entry_index)
            if not variants:
                raise ValueError(f"Missing manifest entry {config.id}:{entry_index}")
            variants.sort(key=lambda item: int(item["variant"]))

            page = int(variants[0]["page"])
            number = int(variants[0]["number"])
            source_headword = str(variants[0]["source_headword"])
            accepted_answers = [str(item["pronunciation"]) for item in variants]
            question_id = f"{config.id}:{entry_index}"
            canonical = GB_CANONICAL.get(question_id, accepted_answers[0])

            matching_audio = next(
                (item for item in variants if str(item["pronunciation"]).casefold() == canonical.casefold()),
                None,
            )
            if matching_audio is None:
                raise ValueError(f"Canonical answer has no British audio: {question_id} -> {canonical}")

            definition = DEFINITION_OVERRIDES.get((config.id, page, number), "")
            raw = source_rows.get((page, number), "")
            if not definition:
                definition = extract_definition(raw, source_headword)
            if not definition or not CJK_RE.search(definition):
                raise ValueError(f"Missing Chinese definition: {question_id} ({source_headword})")
            part_of_speech = PART_OF_SPEECH_OVERRIDES.get(
                (config.id, page, number),
                extract_parts_of_speech(raw, source_headword),
            )
            if not part_of_speech:
                raise ValueError(f"Missing part of speech: {question_id} ({source_headword})")

            gb_path = f"{config.audio_base}/{matching_audio['audio']}"
            gb_file = PUBLIC / Path(gb_path)
            if not gb_file.exists() or gb_file.stat().st_size <= 512:
                raise ValueError(f"Missing British audio: {gb_file}")

            audio_sequence = [
                {
                    "accent": "en-GB",
                    "label": "英音",
                    "text": canonical,
                    "src": gb_path,
                }
            ]
            if len(variants) > 1 and config.id != "xiahua_p1p4":
                filename = us_filename(config.id, entry_index, canonical)
                audio_sequence.append(
                    {
                        "accent": "en-US",
                        "label": "美音",
                        "text": canonical,
                        "src": f"audio/us-variants/{filename}",
                    }
                )

            question = {
                "id": question_id,
                "collectionId": config.id,
                "entryIndex": entry_index,
                "page": page,
                "number": number,
                "sourceHeadword": source_headword,
                "canonicalAnswer": canonical,
                "acceptedAnswers": accepted_answers,
                "partOfSpeech": part_of_speech,
                "meaningZh": definition,
                "audioSequence": audio_sequence,
            }
            questions.append(question)
            collection_questions.append(question_id)

        collections_payload.append(
            {
                "id": config.id,
                "label": config.label,
                "questionCount": len(collection_questions),
                "questionIds": collection_questions,
            }
        )

    return collections_payload, questions


async def synthesize_us_audio(questions: list[dict[str, Any]], concurrency: int, retries: int) -> None:
    US_AUDIO_DIR.mkdir(parents=True, exist_ok=True)
    targets = [question for question in questions if len(question["audioSequence"]) > 1]
    if len(targets) != 21:
        raise ValueError(f"Expected 21 US variant clips, found {len(targets)}")

    semaphore = asyncio.Semaphore(concurrency)

    async def synthesize(question: dict[str, Any]) -> tuple[str, str]:
        clip = question["audioSequence"][1]
        destination = PUBLIC / Path(clip["src"])
        if destination.exists() and destination.stat().st_size > 512:
            return "skipped", destination.name

        part = destination.with_suffix(".mp3.part")
        async with semaphore:
            last_error: Exception | None = None
            for attempt in range(1, retries + 1):
                try:
                    if part.exists():
                        part.unlink()
                    communicator = edge_tts.Communicate(
                        text=question["canonicalAnswer"],
                        voice=US_VOICE,
                        rate=US_RATE,
                    )
                    await communicator.save(str(part))
                    if not part.exists() or part.stat().st_size <= 512:
                        raise RuntimeError("US audio file is empty or unexpectedly small")
                    os.replace(part, destination)
                    return "generated", destination.name
                except Exception as exc:
                    last_error = exc
                    if part.exists():
                        part.unlink()
                    if attempt < retries:
                        await asyncio.sleep(min(2 ** (attempt - 1), 8))
            return "failed", f"{destination.name}: {last_error}"

    results = await asyncio.gather(*(synthesize(question) for question in targets))
    failures = [detail for status, detail in results if status == "failed"]
    if failures:
        raise RuntimeError("US audio generation failed:\n" + "\n".join(failures))
    generated = sum(status == "generated" for status, _ in results)
    skipped = sum(status == "skipped" for status, _ in results)
    print(f"US audio complete: generated={generated}, skipped={skipped}, failed=0")


def validate_payload(payload: dict[str, Any], require_us_audio: bool) -> None:
    questions = payload["questions"]
    ids = [question["id"] for question in questions]
    if len(questions) != EXPECTED_QUESTION_COUNT or len(set(ids)) != EXPECTED_QUESTION_COUNT:
        raise ValueError(
            f"Expected {EXPECTED_QUESTION_COUNT} unique questions, "
            f"found {len(questions)} / {len(set(ids))}"
        )

    gb_count = 0
    us_count = 0
    for question in questions:
        if not question["acceptedAnswers"] or not question["partOfSpeech"] or not question["meaningZh"]:
            raise ValueError(f"Incomplete question: {question['id']}")
        for clip in question["audioSequence"]:
            path = PUBLIC / Path(clip["src"])
            if clip["accent"] == "en-GB":
                gb_count += 1
            else:
                us_count += 1
            if clip["accent"] == "en-US" and not require_us_audio:
                continue
            if not path.exists() or path.stat().st_size <= 512:
                raise ValueError(f"Missing audio asset: {path}")

    if gb_count != EXPECTED_QUESTION_COUNT or us_count != 21:
        raise ValueError(f"Unexpected quiz audio references: gb={gb_count}, us={us_count}")


async def run(args: argparse.Namespace) -> int:
    collections_payload, questions = build_questions()
    payload = {
        "schemaVersion": 1,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "voices": {"en-GB": "en-GB-SoniaNeural", "en-US": US_VOICE},
        "totals": {
            "questions": len(questions),
            "britishAudioAssets": EXPECTED_BRITISH_AUDIO_ASSETS,
            "usVariantAudioAssets": 21,
        },
        "collections": collections_payload,
        "questions": questions,
    }

    validate_payload(payload, require_us_audio=False)
    if args.generate_us:
        await synthesize_us_audio(questions, args.concurrency, args.retries)
    validate_payload(payload, require_us_audio=True)

    DATA_OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    DATA_OUTPUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(
        f"Quiz data complete: questions={len(questions)}, "
        f"collections={len(collections_payload)}, output={DATA_OUTPUT}"
    )
    return 0


def parser() -> argparse.ArgumentParser:
    value = argparse.ArgumentParser(description="Build browser-ready IELTS dictation data.")
    value.add_argument("--generate-us", action="store_true")
    value.add_argument("--concurrency", type=int, default=4)
    value.add_argument("--retries", type=int, default=4)
    return value


if __name__ == "__main__":
    raise SystemExit(asyncio.run(run(parser().parse_args())))
