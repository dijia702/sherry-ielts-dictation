const fs = require("node:fs");
const path = require("node:path");

const directory = process.argv[2];
if (!directory) throw new Error("Usage: node scripts/inspect_leveldb_tables.cjs <leveldb-directory>");

function readVarint(buffer, start) {
  let value = 0;
  let shift = 0;
  let offset = start;
  while (offset < buffer.length && shift <= 49) {
    const byte = buffer[offset++];
    value += (byte & 0x7f) * 2 ** shift;
    if ((byte & 0x80) === 0) return [value, offset];
    shift += 7;
  }
  throw new Error("Invalid varint");
}

function decodeSnappy(input) {
  const [outputLength, afterLength] = readVarint(input, 0);
  const output = Buffer.alloc(outputLength);
  let source = afterLength;
  let target = 0;
  while (source < input.length) {
    const tag = input[source++];
    const type = tag & 3;
    let length;
    let offset;
    if (type === 0) {
      length = tag >>> 2;
      if (length < 60) length += 1;
      else {
        const lengthBytes = length - 59;
        length = 1;
        for (let index = 0; index < lengthBytes; index += 1) length += input[source + index] * 2 ** (index * 8);
        source += lengthBytes;
      }
      input.copy(output, target, source, source + length);
      source += length;
      target += length;
      continue;
    }
    if (type === 1) {
      length = 4 + ((tag >>> 2) & 7);
      offset = ((tag & 0xe0) << 3) | input[source++];
    } else if (type === 2) {
      length = 1 + (tag >>> 2);
      offset = input.readUInt16LE(source);
      source += 2;
    } else {
      length = 1 + (tag >>> 2);
      offset = input.readUInt32LE(source);
      source += 4;
    }
    if (!offset || offset > target) throw new Error("Invalid Snappy copy offset");
    for (let index = 0; index < length; index += 1) output[target + index] = output[target - offset + index];
    target += length;
  }
  if (target !== output.length) throw new Error("Unexpected Snappy output length");
  return output;
}

function readBlock(table, handle) {
  const { offset, size } = handle;
  const contents = table.subarray(offset, offset + size);
  const compression = table[offset + size];
  if (compression === 0) return contents;
  if (compression === 1) return decodeSnappy(contents);
  throw new Error(`Unsupported block compression: ${compression}`);
}

function parseBlock(buffer) {
  const restartCount = buffer.readUInt32LE(buffer.length - 4);
  const end = buffer.length - 4 - restartCount * 4;
  let offset = 0;
  let previousKey = Buffer.alloc(0);
  const entries = [];
  while (offset < end) {
    const [shared, afterShared] = readVarint(buffer, offset);
    const [nonShared, afterNonShared] = readVarint(buffer, afterShared);
    const [valueLength, afterValueLength] = readVarint(buffer, afterNonShared);
    const keyStart = afterValueLength;
    const key = Buffer.concat([previousKey.subarray(0, shared), buffer.subarray(keyStart, keyStart + nonShared)]);
    const valueStart = keyStart + nonShared;
    entries.push({ key, value: buffer.subarray(valueStart, valueStart + valueLength) });
    previousKey = key;
    offset = valueStart + valueLength;
  }
  return entries;
}

function readHandle(buffer, start = 0) {
  const [offset, afterOffset] = readVarint(buffer, start);
  const [size, afterSize] = readVarint(buffer, afterOffset);
  return [{ offset, size }, afterSize];
}

function decodeState(value) {
  if (value[0] !== 1) return null;
  try {
    return JSON.parse(value.subarray(1).toString("utf8"));
  } catch {
    return null;
  }
}

function summarize(file, state) {
  const entries = Object.entries(state.wrongBook ?? {});
  const jian = entries.filter(([id]) => id.startsWith("jian21:"));
  const timestamps = jian.flatMap(([, entry]) =>
    Array.isArray(entry.errorTimestamps) ? entry.errorTimestamps : [entry.addedAt],
  ).filter(Boolean);
  return {
    file,
    collectionScope: state.collectionScope,
    page: state.pageSelections?.jian21,
    jianEntries: jian.length,
    totalEntries: entries.length,
    jianWrongCount: jian.reduce((total, [, entry]) => total + (entry.wrongCount ?? 0), 0),
    totalWrongCount: entries.reduce((total, [, entry]) => total + (entry.wrongCount ?? 0), 0),
    july30Timestamps: timestamps.filter((timestamp) => timestamp.startsWith("2026-07-30")).length,
    latestTimestamp: timestamps.sort().at(-1),
  };
}

const results = [];
for (const file of fs.readdirSync(directory).filter((name) => name.endsWith(".ldb"))) {
  try {
    const table = fs.readFileSync(path.join(directory, file));
    const footer = table.subarray(table.length - 48);
    const [metaHandle, afterMeta] = readHandle(footer);
    const [indexHandle] = readHandle(footer, afterMeta);
    void metaHandle;
    const indexEntries = parseBlock(readBlock(table, indexHandle));
    for (const indexEntry of indexEntries) {
      const [dataHandle] = readHandle(indexEntry.value);
      for (const entry of parseBlock(readBlock(table, dataHandle))) {
        if (!entry.key.includes(Buffer.from("sherry-dictation:v1"))) continue;
        const state = decodeState(entry.value);
        if (state) {
          const userKey = entry.key.subarray(0, -8).toString("utf8");
          results.push({
            summary: { ...summarize(file, state), origin: userKey.split("\0")[0] },
            state,
          });
        }
      }
    }
  } catch (error) {
    results.push({ error: `${file}: ${error.message}` });
  }
}

for (const result of results) console.log(JSON.stringify(result.summary ?? result));
