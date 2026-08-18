# 旁白 · ListenHub TTS（含声音克隆）

ListenHub 原生支持一组 speakers，也允许声音克隆，并使用在 TTS 中。声音克隆本身在 ListenHub 网页端做(上传 / 录一段样本),不在脚本里。脚本只负责**用**克隆声音出片。

- 克隆声音在 `GET /v1/speakers/list?language=zh` 里,`speakerId` 以 **`voice-clone-`** 打头。
  例:`{"name":"Sampleuser","speakerId":"voice-clone-1234567890","gender":"male", ...}`
- 拿这个 `speakerId` 作 `listenhub-tts.sh` 的第 3 参,`/v1/speech` 正常出 mp3 + 自带 SRT (文字＝输入原文、逐句 cue、零识别错),和公共音色**完全同一条链路**。

```bash
# 1) 找到自己的克隆声音 speakerId(以 voice-clone- 打头)
LISTENHUB_API_KEY=...  scripts/listenhub-speakers.sh zh --json \
  | python3 -c 'import json,sys; [print(i["name"],i["speakerId"]) for i in json.load(sys.stdin)["data"]["items"] if i["speakerId"].startswith("voice-clone-")]'

# 2) 用克隆声音出音频 + 字幕
LISTENHUB_API_KEY=...  scripts/listenhub-tts.sh narration.txt out/ voice-clone-6a29dd635b88331426c4ecbc
```

## 工作流

### Step 0 · 选音色(speaker)

列出speaker，由用户选择

```bash
LISTENHUB_API_KEY=...  scripts/listenhub-speakers.sh zh         # 可读音色表(name·特征·描述)
LISTENHUB_API_KEY=...  scripts/listenhub-speakers.sh zh --json  # 原始 JSON,给 agent 解析
# 端点:GET /v1/speakers/list?language=zh,每个 speaker 有 speakerId/name/gender/profile
```

### Step 1 · 出音频 + 原始字幕

```bash
LISTENHUB_API_KEY=...  [GROQ_API_KEY=...] \
  scripts/listenhub-tts.sh <narration.txt> <out-dir> [speakerId] [ttsModel]
# 出 <out-dir>/narration-full.mp3 + <out-dir>/narration.srt(原始,未校正)
```

- 第 3 参 = Step 0 选定的 `speakerId`

### Step 2 · 字幕校正

字幕可能存在识别错误。基于口播稿，校对字幕文件。字幕文件是录制时的真实时间线，校对仅处理文字内容，时间戳保持不变。

### Step 3 · 交付

把 `narration-full.mp3` + **校正后的** SRT 交回 `references/audio.md`「接入成片」流程(切段 →
`sync-durations` → 重排节奏 → 合流 → 出片)。

```
narration.txt ──(本参考)──▶ narration-full.mp3 + narration.srt ──▶ references/audio.md 接入成片 ──▶ 4K MP4
```

## 脚本清单

| 文件 | 作用 |
|---|---|
| `scripts/listenhub-speakers.sh` | 列 speakers(含 `voice-clone-` 克隆声音),选 speakerId |
| `scripts/listenhub-tts.sh` | 文本 → mp3 + srt(speech 主路 / asr fallback) |
| `scripts/scan-heteronyms.sh` | 跑 TTS 前扫多音字 |
| `scripts/srt_helper.py` | buildreq / normalize / insert-pauses / correct / speakers 等子命令 |
| `heteronyms.md` | 多音字高危清单(遇新坑就加) |
