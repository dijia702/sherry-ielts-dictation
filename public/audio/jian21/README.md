# 剑21版词表本地音频

本目录包含从 `Sherry雅思听力1000词（剑21版）2026.7.2.md` 生成的英式女声音频。

- 发音引擎：Microsoft Edge TTS
- 声音：`en-GB-SoniaNeural`
- 语速：`-10%`
- 原始词条：1052 条
- 本地 MP3：1066 个（斜杠拼写和 `blond(e)` 已拆分）

## 清单

- `manifest.json`：供前端或程序读取，UTF-8 编码。
- `manifest.csv`：供 Excel、Python 或数据工具读取，UTF-8 BOM 编码。
- `audio` 字段是相对于本目录的 MP3 文件名。
- `source_headword` 保留词表原文，`pronunciation` 是该文件实际朗读的内容。
- 同一词条存在多个拼写时，使用相同的 `entry_index`，并通过 `variant` 区分。

浏览器从项目根目录加载时，可使用：

```js
const manifest = await fetch("./audio/jian21/manifest.json").then((response) => response.json());
const item = manifest.items[0];
const player = new Audio(`./audio/jian21/${item.audio}`);
await player.play();
```

## 重新生成

在 `E:\listening` 中运行：

```powershell
python .\generate_word_audio.py
```

脚本会跳过已存在且大小正常的 MP3，因此支持断点续传。若源词表结构或预期词条数量发生变化，脚本会停止并报告错误，避免静默漏词。
