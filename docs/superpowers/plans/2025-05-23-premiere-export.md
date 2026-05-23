# Premiere Pro Timeline Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an "Export to Premiere" button to the workflow canvas that packages all completed media assets plus a FCP7 XML (XMEML) timeline into a ZIP download; unzipping and opening the XML in Premiere Pro auto-links all clips.

**Architecture:** The frontend serializes the executed workflow graph (nodes + edges JSON) and POSTs it to a new `POST /v1/export/premiere` backend endpoint. The backend downloads all media URLs, probes durations with FFprobe, walks the graph to derive track layout, generates FCP7 XML, bundles everything into a flat ZIP (XML + media files side-by-side), and streams it back. The frontend triggers a browser download.

**Tech Stack:** Python 3.11 + FastAPI + `xml.etree.ElementTree` (stdlib) + `zipfile` (stdlib) + `httpx` (already in deps) + FFprobe (already on server); React + TypeScript on the frontend; pytest + pytest-asyncio for backend tests.

---

## Files touched

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `backend/app/routers/premiere_export.py` | XML builder, graph traversal, media fetching, ZIP endpoint |
| Create | `backend/tests/__init__.py` | Makes tests/ a package |
| Create | `backend/tests/test_premiere_export.py` | Unit tests for XML builder and graph traversal |
| Modify | `backend/app/main.py` | Register new router |
| Modify | `frontend/src/lib/api-config.ts` | Add `export.premiere` URL constant |
| Modify | `frontend/src/components/workflow/WorkflowToolbar.tsx` | Add Export button + two new props |
| Modify | `frontend/src/components/workflow/WorkflowCanvas.tsx` | Implement `handleExportPremiere`, pass to toolbar |

---

### Task 1: FCP7 XML builder — pure functions, unit-tested

**Files:**
- Create: `backend/app/routers/premiere_export.py`
- Create: `backend/tests/__init__.py`
- Create: `backend/tests/test_premiere_export.py`

- [ ] **Step 1: Create the empty tests package**

```bash
mkdir -p backend/tests && touch backend/tests/__init__.py
```

- [ ] **Step 2: Write failing tests for the XML builder**

Create `backend/tests/test_premiere_export.py`:

```python
import xml.etree.ElementTree as ET
import pytest
from app.routers.premiere_export import (
    secs_to_frames,
    build_xmeml,
    V1Clip,
    V2Watermark,
    AudioTrack,
)


def test_secs_to_frames_rounds():
    assert secs_to_frames(1.0) == 30
    assert secs_to_frames(1.033) == 31   # round, not floor
    assert secs_to_frames(0.0) == 0


def test_build_xmeml_single_v1_clip():
    clips = [V1Clip(filename="clip.mp4", duration_secs=2.0)]
    xml_str = build_xmeml(v1_clips=clips, v2_watermark=None, audio_tracks=[])

    root = ET.fromstring(xml_str)
    assert root.tag == "xmeml"
    assert root.attrib["version"] == "4"

    seq = root.find("sequence")
    assert seq is not None
    assert seq.findtext("duration") == "60"  # 2.0s * 30fps

    video = seq.find("media/video")
    assert video is not None
    tracks = video.findall("track")
    assert len(tracks) == 1  # only V1, no watermark

    clipitem = tracks[0].find("clipitem")
    assert clipitem is not None
    assert clipitem.findtext("name") == "clip.mp4"
    assert clipitem.findtext("start") == "0"
    assert clipitem.findtext("end") == "60"


def test_build_xmeml_merge_videos_sequence():
    clips = [
        V1Clip(filename="a.mp4", duration_secs=3.0),
        V1Clip(filename="b.mp4", duration_secs=2.0),
    ]
    xml_str = build_xmeml(v1_clips=clips, v2_watermark=None, audio_tracks=[])
    root = ET.fromstring(xml_str)

    seq = root.find("sequence")
    assert seq.findtext("duration") == "150"  # (3+2)*30

    track = root.find("sequence/media/video/track")
    items = track.findall("clipitem")
    assert len(items) == 2

    assert items[0].findtext("start") == "0"
    assert items[0].findtext("end") == "90"   # 3s * 30
    assert items[1].findtext("start") == "90"
    assert items[1].findtext("end") == "150"


def test_build_xmeml_watermark_creates_v2_track():
    clips = [V1Clip(filename="main.mp4", duration_secs=5.0)]
    wm = V2Watermark(filename="logo.png", total_secs=5.0, opacity=80)
    xml_str = build_xmeml(v1_clips=clips, v2_watermark=wm, audio_tracks=[])

    root = ET.fromstring(xml_str)
    video = root.find("sequence/media/video")
    tracks = video.findall("track")
    assert len(tracks) == 2  # V1 + V2

    wm_item = tracks[1].find("clipitem")
    assert wm_item is not None
    assert wm_item.findtext("name") == "logo.png"
    opacity_kf = wm_item.find("opacity/keyframe")
    assert opacity_kf is not None
    assert opacity_kf.findtext("value") == "80"


def test_build_xmeml_audio_tracks():
    clips = [V1Clip(filename="vid.mp4", duration_secs=4.0)]
    audio = [
        AudioTrack(filename="music.wav", duration_secs=4.0),
        AudioTrack(filename="voice.wav", duration_secs=3.5),
    ]
    xml_str = build_xmeml(v1_clips=clips, v2_watermark=None, audio_tracks=audio)

    root = ET.fromstring(xml_str)
    audio_section = root.find("sequence/media/audio")
    assert audio_section is not None
    tracks = audio_section.findall("track")
    assert len(tracks) == 2
    assert tracks[0].find("clipitem").findtext("name") == "music.wav"
    assert tracks[1].find("clipitem").findtext("name") == "voice.wav"


def test_pathurl_is_filename_only():
    """Premiere auto-links when pathurl has no path prefix."""
    clips = [V1Clip(filename="myclip.mp4", duration_secs=1.0)]
    xml_str = build_xmeml(v1_clips=clips, v2_watermark=None, audio_tracks=[])
    root = ET.fromstring(xml_str)
    pathurl = root.find("sequence/media/video/track/clipitem/file/pathurl")
    assert pathurl is not None
    assert pathurl.text == "myclip.mp4"  # no slashes, no file:// prefix
```

- [ ] **Step 3: Run tests — verify they all fail**

```bash
cd backend && python -m pytest tests/test_premiere_export.py -v 2>&1 | head -30
```

Expected: `ERROR` or `ImportError` — `premiere_export` module not found.

- [ ] **Step 4: Create `backend/app/routers/premiere_export.py` with the XML builder**

```python
"""
FCP7 XML (XMEML v4) export for Adobe Premiere Pro.

Pure functions in this module have no I/O side effects — they only build
data structures and XML strings. The HTTP endpoint is at the bottom.
"""
import asyncio
import base64
import io
import re
import tempfile
import zipfile
from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional
import xml.etree.ElementTree as ET

import httpx
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Any

from app.auth import get_current_user
from app.logging_config import setup_logger
from app.routers.video_processing import probe_video

logger = setup_logger(__name__)

router = APIRouter(prefix="/v1/export", tags=["export"])

FPS = 30  # Premiere default timebase


# ── Data classes ────────────────────────────────────────────────────────────

@dataclass
class V1Clip:
    filename: str
    duration_secs: float


@dataclass
class V2Watermark:
    filename: str
    total_secs: float
    opacity: int = 80  # 0-100


@dataclass
class AudioTrack:
    filename: str
    duration_secs: float


# ── Pure XML builder functions ───────────────────────────────────────────────

def secs_to_frames(secs: float, fps: int = FPS) -> int:
    return round(secs * fps)


def _rate_el(fps: int = FPS) -> ET.Element:
    rate = ET.Element("rate")
    ET.SubElement(rate, "timebase").text = str(fps)
    ET.SubElement(rate, "ntsc").text = "FALSE"
    return rate


def _timecode_el(fps: int = FPS) -> ET.Element:
    tc = ET.Element("timecode")
    tc.append(_rate_el(fps))
    ET.SubElement(tc, "string").text = "00:00:00:00"
    ET.SubElement(tc, "displayformat").text = "NDF"
    return tc


def _file_el(file_id: str, filename: str, duration_frames: int,
             has_audio: bool = True, fps: int = FPS) -> ET.Element:
    f = ET.Element("file", id=file_id)
    ET.SubElement(f, "name").text = filename
    ET.SubElement(f, "pathurl").text = filename  # filename-only → Premiere same-dir auto-link
    f.append(_rate_el(fps))
    ET.SubElement(f, "duration").text = str(duration_frames)
    f.append(_timecode_el(fps))

    media = ET.SubElement(f, "media")
    video = ET.SubElement(media, "video")
    vsc = ET.SubElement(video, "samplecharacteristics")
    vsc.append(_rate_el(fps))
    ET.SubElement(vsc, "width").text = "1920"
    ET.SubElement(vsc, "height").text = "1080"

    if has_audio:
        audio = ET.SubElement(media, "audio")
        asc = ET.SubElement(audio, "samplecharacteristics")
        ET.SubElement(asc, "depth").text = "16"
        ET.SubElement(asc, "samplerate").text = "48000"
        ET.SubElement(audio, "channelcount").text = "2"

    return f


def _audio_file_el(file_id: str, filename: str, duration_frames: int,
                   fps: int = FPS) -> ET.Element:
    f = ET.Element("file", id=file_id)
    ET.SubElement(f, "name").text = filename
    ET.SubElement(f, "pathurl").text = filename
    f.append(_rate_el(fps))
    ET.SubElement(f, "duration").text = str(duration_frames)
    f.append(_timecode_el(fps))

    media = ET.SubElement(f, "media")
    audio = ET.SubElement(media, "audio")
    asc = ET.SubElement(audio, "samplecharacteristics")
    ET.SubElement(asc, "depth").text = "16"
    ET.SubElement(asc, "samplerate").text = "48000"
    ET.SubElement(audio, "channelcount").text = "2"

    return f


def _clipitem_el(item_id: str, filename: str, file_id: str,
                 duration_frames: int, start_frame: int,
                 opacity: Optional[int] = None,
                 fps: int = FPS) -> ET.Element:
    end_frame = start_frame + duration_frames
    ci = ET.Element("clipitem", id=item_id)
    ET.SubElement(ci, "name").text = filename
    ET.SubElement(ci, "duration").text = str(duration_frames)
    ci.append(_rate_el(fps))
    ET.SubElement(ci, "in").text = "0"
    ET.SubElement(ci, "out").text = str(duration_frames - 1)
    ET.SubElement(ci, "start").text = str(start_frame)
    ET.SubElement(ci, "end").text = str(end_frame)

    # Reference the file by id only (file element already declared once)
    ET.SubElement(ci, "file", id=file_id)

    if opacity is not None:
        ET.SubElement(ci, "compositemode").text = "normal"
        op_el = ET.SubElement(ci, "opacity")
        kf = ET.SubElement(op_el, "keyframe")
        ET.SubElement(kf, "when").text = "0"
        ET.SubElement(kf, "value").text = str(opacity)

    return ci


def build_xmeml(
    v1_clips: list[V1Clip],
    v2_watermark: Optional[V2Watermark],
    audio_tracks: list[AudioTrack],
    fps: int = FPS,
) -> str:
    """
    Build a FCP7 XML (XMEML v4) string from the timeline spec.
    All timecodes are in frames at `fps`.
    """
    total_frames = sum(secs_to_frames(c.duration_secs, fps) for c in v1_clips)
    if total_frames == 0:
        total_frames = 1

    root = ET.Element("xmeml", version="4")
    seq = ET.SubElement(root, "sequence")
    ET.SubElement(seq, "name").text = "GenMedia Studio Export"
    ET.SubElement(seq, "duration").text = str(total_frames)
    seq.append(_rate_el(fps))

    media = ET.SubElement(seq, "media")

    # ── Video section ──────────────────────────────────────────────────────
    video_sec = ET.SubElement(media, "video")
    fmt = ET.SubElement(video_sec, "format")
    fsc = ET.SubElement(fmt, "samplecharacteristics")
    fsc.append(_rate_el(fps))
    ET.SubElement(fsc, "width").text = "1920"
    ET.SubElement(fsc, "height").text = "1080"

    # V1 track — clip sequence
    v1_track = ET.SubElement(video_sec, "track")
    cursor = 0
    for i, clip in enumerate(v1_clips):
        df = secs_to_frames(clip.duration_secs, fps)
        file_id = f"file-v1-{i}"
        item_id = f"clipitem-v1-{i}"

        # Inline full file element on first use
        file_el = _file_el(file_id, clip.filename, df, has_audio=True, fps=fps)
        ci = ET.SubElement(v1_track, "clipitem", id=item_id)
        ET.SubElement(ci, "name").text = clip.filename
        ET.SubElement(ci, "duration").text = str(df)
        ci.append(_rate_el(fps))
        ET.SubElement(ci, "in").text = "0"
        ET.SubElement(ci, "out").text = str(df - 1)
        ET.SubElement(ci, "start").text = str(cursor)
        ET.SubElement(ci, "end").text = str(cursor + df)
        ci.append(file_el)

        cursor += df

    # V2 track — watermark overlay (optional)
    if v2_watermark:
        wm = v2_watermark
        wm_frames = secs_to_frames(wm.total_secs, fps)
        v2_track = ET.SubElement(video_sec, "track")
        wm_file_id = "file-v2-wm"
        wm_item_id = "clipitem-v2-wm"

        ci = ET.SubElement(v2_track, "clipitem", id=wm_item_id)
        ET.SubElement(ci, "name").text = wm.filename
        ET.SubElement(ci, "duration").text = str(wm_frames)
        ci.append(_rate_el(fps))
        ET.SubElement(ci, "in").text = "0"
        ET.SubElement(ci, "out").text = str(wm_frames - 1)
        ET.SubElement(ci, "start").text = "0"
        ET.SubElement(ci, "end").text = str(wm_frames)
        wm_file_el = _file_el(wm_file_id, wm.filename, wm_frames, has_audio=False, fps=fps)
        ci.append(wm_file_el)
        ET.SubElement(ci, "compositemode").text = "normal"
        op_el = ET.SubElement(ci, "opacity")
        kf = ET.SubElement(op_el, "keyframe")
        ET.SubElement(kf, "when").text = "0"
        ET.SubElement(kf, "value").text = str(wm.opacity)

    # ── Audio section ──────────────────────────────────────────────────────
    if audio_tracks:
        audio_sec = ET.SubElement(media, "audio")
        for j, atrack in enumerate(audio_tracks):
            af = secs_to_frames(atrack.duration_secs, fps)
            a_file_id = f"file-a{j}"
            a_item_id = f"clipitem-a{j}"

            a_track_el = ET.SubElement(audio_sec, "track")
            ci = ET.SubElement(a_track_el, "clipitem", id=a_item_id)
            ET.SubElement(ci, "name").text = atrack.filename
            ET.SubElement(ci, "duration").text = str(af)
            ci.append(_rate_el(fps))
            ET.SubElement(ci, "in").text = "0"
            ET.SubElement(ci, "out").text = str(af - 1)
            ET.SubElement(ci, "start").text = "0"
            ET.SubElement(ci, "end").text = str(af)
            a_file_el = _audio_file_el(a_file_id, atrack.filename, af, fps=fps)
            ci.append(a_file_el)

    xml_bytes = ET.tostring(root, encoding="unicode", xml_declaration=False)
    return '<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE xmeml>\n' + xml_bytes
```

- [ ] **Step 5: Run tests — verify they all pass**

```bash
cd backend && python -m pytest tests/test_premiere_export.py -v
```

Expected: all 6 tests pass.

- [ ] **Step 6: Commit**

```bash
git add backend/app/routers/premiere_export.py backend/tests/__init__.py backend/tests/test_premiere_export.py
git commit -m "feat: FCP7 XML builder for Premiere export — pure functions, tested"
```

---

### Task 2: Graph traversal — pure functions, unit-tested

**Files:**
- Modify: `backend/app/routers/premiere_export.py` (add traversal functions)
- Modify: `backend/tests/test_premiere_export.py` (add traversal tests)

The traversal reads workflow graph JSON (list of nodes + list of edges) and produces `v1_clips`, `v2_watermark`, `audio_tracks` inputs for `build_xmeml`. It does NOT fetch files — it only maps node types to track slots and records which URL each asset will come from.

- [ ] **Step 1: Write failing traversal tests**

Append to `backend/tests/test_premiere_export.py`:

```python
from app.routers.premiere_export import (
    collect_media_urls,
    plan_timeline,
    TimelinePlan,
)


# ── Helpers to build fake nodes/edges ────────────────────────────────────────

def _node(node_id, node_type, outputs=None, data=None):
    d = data or {}
    if outputs:
        d["outputs"] = outputs
    return {"id": node_id, "type": node_type, "data": d}


def _edge(source, target, source_handle="video", target_handle="video"):
    return {
        "id": f"{source}-{target}",
        "source": source,
        "target": target,
        "sourceHandle": source_handle,
        "targetHandle": target_handle,
    }


# ── collect_media_urls tests ──────────────────────────────────────────────────

def test_collect_media_urls_video_nodes():
    nodes = [
        _node("n1", "generateVideo", outputs={"video": "https://gcs/clip1.mp4"}),
        _node("n2", "generateVideo", outputs={"video": "https://gcs/clip2.mp4"}),
    ]
    urls = collect_media_urls(nodes, [])
    assert "https://gcs/clip1.mp4" in urls
    assert "https://gcs/clip2.mp4" in urls


def test_collect_media_urls_skips_nodes_without_output():
    nodes = [
        _node("n1", "generateVideo", outputs={}),  # no video key
        _node("n2", "generateVideo"),               # no outputs at all
    ]
    urls = collect_media_urls(nodes, [])
    assert len(urls) == 0


def test_collect_media_urls_includes_audio():
    nodes = [
        _node("n1", "generateMusic", outputs={"audio": "https://gcs/music.wav"}),
        _node("n2", "voiceChanger", outputs={"audio": "https://gcs/voice.wav"}),
    ]
    urls = collect_media_urls(nodes, [])
    assert "https://gcs/music.wav" in urls
    assert "https://gcs/voice.wav" in urls


# ── plan_timeline tests ───────────────────────────────────────────────────────

def test_plan_timeline_single_video():
    nodes = [
        _node("v1", "generateVideo", outputs={"video": "https://gcs/clip.mp4"}),
    ]
    plan = plan_timeline(nodes, [])
    assert len(plan.v1_urls) == 1
    assert plan.v1_urls[0] == "https://gcs/clip.mp4"
    assert plan.v2_watermark_url is None
    assert plan.audio_urls == []


def test_plan_timeline_merge_videos_order():
    """MergeVideos inputs video1..videoN define V1 clip order."""
    merge = _node("merge", "mergeVideos", data={
        "video1": "https://gcs/a.mp4",
        "video2": "https://gcs/b.mp4",
        "video3": "https://gcs/c.mp4",
    })
    nodes = [merge]
    plan = plan_timeline(nodes, [])
    assert plan.v1_urls == [
        "https://gcs/a.mp4",
        "https://gcs/b.mp4",
        "https://gcs/c.mp4",
    ]


def test_plan_timeline_add_music_creates_audio_track():
    nodes = [
        _node("vid", "generateVideo", outputs={"video": "https://gcs/clip.mp4"}),
        _node("mus", "generateMusic", outputs={"audio": "https://gcs/music.wav"}),
        _node("mix", "addMusicToVideo"),
    ]
    edges = [
        _edge("vid", "mix", "video", "video"),
        _edge("mus", "mix", "audio", "audio"),
    ]
    plan = plan_timeline(nodes, edges)
    assert "https://gcs/music.wav" in plan.audio_urls


def test_plan_timeline_voice_changer_adds_audio_track():
    nodes = [
        _node("vc", "voiceChanger", outputs={"audio": "https://gcs/voice.wav"}),
    ]
    plan = plan_timeline(nodes, [])
    assert "https://gcs/voice.wav" in plan.audio_urls


def test_plan_timeline_watermark_node():
    nodes = [
        _node("wm", "videoWatermark",
              outputs={"video": "https://gcs/watermarked.mp4"},
              data={"opacity": 70}),
        _node("src", "generateImage", outputs={"image": "https://gcs/logo.png"}),
    ]
    edges = [_edge("src", "wm", "image", "watermark")]
    plan = plan_timeline(nodes, edges)
    assert plan.v2_watermark_url == "https://gcs/logo.png"
    assert plan.v2_opacity == 70


def test_plan_timeline_falls_back_to_gcs_url():
    """Nodes may store gcsUrl separately from outputs.video."""
    nodes = [
        _node("v1", "generateVideo",
              outputs={},
              data={"gcsUrl": "https://gcs/fallback.mp4"}),
    ]
    plan = plan_timeline(nodes, [])
    assert plan.v1_urls == ["https://gcs/fallback.mp4"]
```

- [ ] **Step 2: Run tests — confirm they fail**

```bash
cd backend && python -m pytest tests/test_premiere_export.py::test_collect_media_urls_video_nodes -v
```

Expected: `ImportError` — `collect_media_urls` not defined.

- [ ] **Step 3: Add traversal functions to `backend/app/routers/premiere_export.py`**

Add after the existing dataclasses (before the `router = APIRouter(...)` line already there):

```python
# ── Graph traversal ──────────────────────────────────────────────────────────

# Node type strings matching frontend NodeType enum values
_VIDEO_LEAF_TYPES = {"generateVideo", "videoInput"}
_AUDIO_LEAF_TYPES = {"generateMusic", "voiceChanger", "elevenLabsGenerate"}
_MERGE_TYPE = "mergeVideos"
_ADD_MUSIC_TYPE = "addMusicToVideo"
_WATERMARK_TYPE = "videoWatermark"
_SEGMENT_REPLACE_TYPE = "videoSegmentReplace"

# Slot names that MergeVideos uses for its inputs (in order)
_MERGE_VIDEO_SLOTS = ["video1", "video2", "video3", "video4", "video5", "video6"]


@dataclass
class TimelinePlan:
    v1_urls: list[str] = field(default_factory=list)
    v2_watermark_url: Optional[str] = None
    v2_opacity: int = 80
    audio_urls: list[str] = field(default_factory=list)


def _get_video_url(node: dict) -> Optional[str]:
    """Extract the best available video URL from a node."""
    data = node.get("data") or {}
    outputs = data.get("outputs") or {}
    return (
        outputs.get("video")
        or data.get("gcsUrl")
        or data.get("videoUrl")
        or outputs.get("videoUrl")
    ) or None


def _get_audio_url(node: dict) -> Optional[str]:
    """Extract audio URL from a node."""
    data = node.get("data") or {}
    outputs = data.get("outputs") or {}
    return (
        outputs.get("audio")
        or data.get("audioUrl")
        or outputs.get("audioUrl")
    ) or None


def _get_image_url(node: dict) -> Optional[str]:
    """Extract image URL from a node (for watermark sources)."""
    data = node.get("data") or {}
    outputs = data.get("outputs") or {}
    return (
        outputs.get("image")
        or data.get("imageUrl")
        or outputs.get("imageUrl")
    ) or None


def collect_media_urls(nodes: list[dict], _edges: list[dict]) -> list[str]:
    """Return all completed media URLs (video + audio + image) across all nodes."""
    urls = []
    for node in nodes:
        for getter in (_get_video_url, _get_audio_url, _get_image_url):
            url = getter(node)
            if url:
                urls.append(url)
    return list(dict.fromkeys(urls))  # deduplicate, preserve order


def plan_timeline(nodes: list[dict], edges: list[dict]) -> TimelinePlan:
    """
    Walk the workflow graph and produce a TimelinePlan describing which
    URL goes on which track.  Does not perform I/O.
    """
    node_by_id = {n["id"]: n for n in nodes}
    # incoming edges keyed by (target_id, target_handle)
    incoming: dict[tuple[str, str], list[dict]] = {}
    for e in edges:
        key = (e["target"], e.get("targetHandle", ""))
        incoming.setdefault(key, []).append(e)

    plan = TimelinePlan()

    def source_url(target_id: str, target_handle: str,
                   getter=_get_video_url) -> Optional[str]:
        """Follow one edge backwards to the source node and extract a URL."""
        for e in incoming.get((target_id, target_handle), []):
            src = node_by_id.get(e["source"])
            if src:
                url = getter(src)
                if url:
                    return url
        return None

    # ── MergeVideos → V1 clip sequence ──────────────────────────────────────
    merge_nodes = [n for n in nodes if n.get("type") == _MERGE_TYPE]
    if merge_nodes:
        merge = merge_nodes[0]  # take the first (most workflows have one)
        data = merge.get("data") or {}
        for slot in _MERGE_VIDEO_SLOTS:
            url = data.get(slot)
            if url:
                plan.v1_urls.append(url)

    # ── VideoWatermark → V2 track ────────────────────────────────────────────
    wm_nodes = [n for n in nodes if n.get("type") == _WATERMARK_TYPE]
    if wm_nodes:
        wm_node = wm_nodes[0]
        data = wm_node.get("data") or {}
        # Try to find the watermark source via edge on "watermark" handle
        wm_url = source_url(wm_node["id"], "watermark", _get_image_url)
        if not wm_url:
            wm_url = source_url(wm_node["id"], "watermark", _get_video_url)
        if wm_url:
            plan.v2_watermark_url = wm_url
            plan.v2_opacity = int(data.get("opacity", 80))

    # ── Audio tracks: GenerateMusic + VoiceChanger ───────────────────────────
    for node in nodes:
        ntype = node.get("type", "")
        if ntype in _AUDIO_LEAF_TYPES:
            url = _get_audio_url(node)
            if url:
                plan.audio_urls.append(url)

    # ── Fallback: video leaf nodes with no MergeVideos ───────────────────────
    if not plan.v1_urls:
        for node in nodes:
            ntype = node.get("type", "")
            if ntype in _VIDEO_LEAF_TYPES or ntype == _SEGMENT_REPLACE_TYPE:
                url = _get_video_url(node)
                if url:
                    plan.v1_urls.append(url)

    # ── Final fallback: gcsUrl on any completed node ─────────────────────────
    if not plan.v1_urls:
        for node in nodes:
            data = node.get("data") or {}
            url = data.get("gcsUrl") or data.get("videoUrl")
            if url:
                plan.v1_urls.append(url)
                break  # just the first one

    return plan
```

- [ ] **Step 4: Run traversal tests**

```bash
cd backend && python -m pytest tests/test_premiere_export.py -v
```

Expected: all tests pass (both XML builder and traversal).

- [ ] **Step 5: Commit**

```bash
git add backend/app/routers/premiere_export.py backend/tests/test_premiere_export.py
git commit -m "feat: graph traversal for Premiere timeline planning — tested"
```

---

### Task 3: HTTP endpoint — download, probe, zip, stream

**Files:**
- Modify: `backend/app/routers/premiere_export.py` (add endpoint)
- Modify: `backend/app/main.py` (register router)
- Modify: `backend/tests/test_premiere_export.py` (add endpoint tests)

- [ ] **Step 1: Write failing endpoint tests**

Append to `backend/tests/test_premiere_export.py`:

```python
import zipfile
from unittest.mock import patch, MagicMock, AsyncMock
from httpx import AsyncClient, ASGITransport
from app.main import app


# Minimal valid workflow graph: one generate-video node, no edges
_SIMPLE_GRAPH = {
    "nodes": [
        {
            "id": "n1",
            "type": "generateVideo",
            "data": {
                "outputs": {"video": "https://storage.googleapis.com/fake/clip.mp4"},
                "status": "completed",
            },
        }
    ],
    "edges": [],
}

# 5-byte fake MP4 (won't probe correctly, but enough to test zip creation)
_FAKE_VIDEO_BYTES = b"\x00\x00\x00\x18ftyp"


@pytest.mark.asyncio
async def test_export_endpoint_returns_zip():
    """Endpoint returns a ZIP containing the XML and at least one media file."""

    async def _fake_fetch(url: str) -> bytes:
        return _FAKE_VIDEO_BYTES

    fake_probe = {"format": {"duration": "3.0"}}

    with (
        patch("app.routers.premiere_export.fetch_media_bytes", new=_fake_fetch),
        patch("app.routers.premiere_export.probe_video", return_value=fake_probe),
        patch("app.routers.premiere_export.get_current_user", return_value={"uid": "u1"}),
    ):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post("/v1/export/premiere", json=_SIMPLE_GRAPH)

    assert response.status_code == 200
    assert "application/zip" in response.headers["content-type"]
    assert "attachment" in response.headers.get("content-disposition", "")

    buf = io.BytesIO(response.content)
    with zipfile.ZipFile(buf) as zf:
        names = zf.namelist()
        xml_files = [n for n in names if n.endswith(".xml")]
        assert len(xml_files) == 1, f"Expected 1 XML, got: {names}"
        xml_content = zf.read(xml_files[0]).decode()
        assert "<xmeml" in xml_content
        assert "clip.mp4" in xml_content  # media filename appears in XML


@pytest.mark.asyncio
async def test_export_endpoint_partial_ok_when_node_has_no_url():
    """Nodes without a completed URL are silently skipped; export still succeeds."""
    graph = {
        "nodes": [
            {"id": "n1", "type": "generateVideo", "data": {"status": "ready"}},  # no URL
            {"id": "n2", "type": "generateVideo",
             "data": {"outputs": {"video": "https://gcs/clip.mp4"}, "status": "completed"}},
        ],
        "edges": [],
    }

    async def _fake_fetch(url: str) -> bytes:
        return _FAKE_VIDEO_BYTES

    with (
        patch("app.routers.premiere_export.fetch_media_bytes", new=_fake_fetch),
        patch("app.routers.premiere_export.probe_video", return_value={"format": {"duration": "2.0"}}),
        patch("app.routers.premiere_export.get_current_user", return_value={"uid": "u1"}),
    ):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post("/v1/export/premiere", json=graph)

    assert response.status_code == 200


@pytest.mark.asyncio
async def test_export_endpoint_rejects_empty_graph():
    """Graph with no completed video nodes returns 422."""
    graph = {"nodes": [], "edges": []}

    with patch("app.routers.premiere_export.get_current_user", return_value={"uid": "u1"}):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post("/v1/export/premiere", json=graph)

    assert response.status_code == 422
```

- [ ] **Step 2: Run tests — confirm they fail**

```bash
cd backend && python -m pytest tests/test_premiere_export.py::test_export_endpoint_returns_zip -v
```

Expected: `404` or `ImportError` — endpoint not registered yet.

- [ ] **Step 3: Add `fetch_media_bytes` and the endpoint to `premiere_export.py`**

Append to `backend/app/routers/premiere_export.py`:

```python
# ── Media fetching ───────────────────────────────────────────────────────────

async def fetch_media_bytes(url: str) -> bytes:
    """Download a GCS URL or decode a data: URL to raw bytes."""
    if url.startswith("data:"):
        # data:video/mp4;base64,AAAA...
        header, encoded = url.split(",", 1)
        return base64.b64decode(encoded)
    async with httpx.AsyncClient(timeout=120.0) as client:
        resp = await client.get(url)
        resp.raise_for_status()
        return resp.content


def _safe_filename(url: str, node_type: str, index: int) -> str:
    """
    Derive a clean filename from a URL.
    Falls back to <node_type>-<index>.<ext> if the URL path has no useful name.
    """
    path = url.split("?")[0].rstrip("/")
    basename = path.split("/")[-1]
    # Strip any query params or tokens baked into the path segment
    basename = re.sub(r"[^\w.\-]", "_", basename)
    if not basename or len(basename) > 60:
        ext = "mp4" if "video" in node_type.lower() else "wav"
        basename = f"{node_type}-{index}.{ext}"
    return basename


# ── Request/response schemas ─────────────────────────────────────────────────

class ExportRequest(BaseModel):
    nodes: list[dict[str, Any]]
    edges: list[dict[str, Any]]


# ── HTTP endpoint ────────────────────────────────────────────────────────────

@router.post("/premiere")
async def export_premiere(
    req: ExportRequest,
    user: dict = Depends(get_current_user),
):
    """
    POST /v1/export/premiere
    Body: { nodes: [...], edges: [...] }   (serialised workflow graph)
    Returns: application/zip stream containing the FCP7 XML + all media files.
    """
    nodes = req.nodes
    edges = req.edges

    # 1. Plan the timeline (pure, no I/O)
    plan = plan_timeline(nodes, edges)

    # 2. Collect every URL that needs to be in the ZIP
    #    = V1 clips + optional V2 watermark + audio tracks
    all_urls: list[str] = list(dict.fromkeys(
        plan.v1_urls
        + ([plan.v2_watermark_url] if plan.v2_watermark_url else [])
        + plan.audio_urls
    ))

    if not all_urls:
        raise HTTPException(status_code=422, detail="No completed media found in workflow")

    # 3. Download + probe each URL; build filename → bytes map
    with tempfile.TemporaryDirectory() as tmpdir:
        url_to_filename: dict[str, str] = {}
        url_to_duration: dict[str, float] = {}
        media_files: dict[str, bytes] = {}  # filename → bytes

        for i, url in enumerate(all_urls):
            try:
                data = await fetch_media_bytes(url)
            except Exception as exc:
                logger.warning(f"[premiere-export] Failed to fetch {url}: {exc}")
                continue

            # Write to temp file so ffprobe can read it
            raw_type = "video"
            if url in plan.audio_urls:
                raw_type = "audio"
            elif url == plan.v2_watermark_url:
                raw_type = "watermark"

            fname = _safe_filename(url, raw_type, i)
            # Ensure unique filenames within this export
            if fname in media_files:
                stem, ext = fname.rsplit(".", 1) if "." in fname else (fname, "mp4")
                fname = f"{stem}-{i}.{ext}"

            tmp_path = f"{tmpdir}/{fname}"
            with open(tmp_path, "wb") as f:
                f.write(data)

            # probe_video uses subprocess.run — wrap in thread per CLAUDE.md convention
            probe = await asyncio.to_thread(probe_video, tmp_path)
            duration = float(
                (probe.get("format") or {}).get("duration", 0)
            )

            url_to_filename[url] = fname
            url_to_duration[url] = duration
            media_files[fname] = data

        if not media_files:
            raise HTTPException(status_code=422, detail="All media downloads failed")

        # 4. Build FCP7 XML
        v1_clips = [
            V1Clip(
                filename=url_to_filename[u],
                duration_secs=url_to_duration.get(u, 1.0),
            )
            for u in plan.v1_urls
            if u in url_to_filename
        ]
        v2_watermark = None
        if plan.v2_watermark_url and plan.v2_watermark_url in url_to_filename:
            v2_watermark = V2Watermark(
                filename=url_to_filename[plan.v2_watermark_url],
                total_secs=url_to_duration.get(plan.v2_watermark_url, 1.0),
                opacity=plan.v2_opacity,
            )
        audio_tracks = [
            AudioTrack(
                filename=url_to_filename[u],
                duration_secs=url_to_duration.get(u, 1.0),
            )
            for u in plan.audio_urls
            if u in url_to_filename
        ]

        if not v1_clips:
            raise HTTPException(status_code=422, detail="No video clips could be assembled")

        xml_str = build_xmeml(v1_clips, v2_watermark, audio_tracks)

        # 5. Bundle into ZIP in-memory
        timestamp = datetime.utcnow().strftime("%Y%m%d-%H%M%S")
        zip_filename = f"genmediastudio-{timestamp}.zip"
        xml_filename = f"genmediastudio-{timestamp}.xml"

        zip_buf = io.BytesIO()
        with zipfile.ZipFile(zip_buf, "w", compression=zipfile.ZIP_DEFLATED) as zf:
            zf.writestr(xml_filename, xml_str.encode("utf-8"))
            for fname, fdata in media_files.items():
                zf.writestr(fname, fdata)

        zip_bytes = zip_buf.getvalue()

    return StreamingResponse(
        io.BytesIO(zip_bytes),
        media_type="application/zip",
        headers={
            "Content-Disposition": f'attachment; filename="{zip_filename}"',
            "Content-Length": str(len(zip_bytes)),
        },
    )
```

- [ ] **Step 4: Register the router in `backend/app/main.py`**

Add to the import line at the top:

```python
from app.routers import generation, library, health, workflow, elevenlabs, video_processing, folders, shared, scene_elements, workflow_metadata, premiere_export
```

Add after the last `app.include_router(...)` call:

```python
app.include_router(premiere_export.router, tags=["export"])
```

- [ ] **Step 5: Run all backend tests**

```bash
cd backend && python -m pytest tests/ -v
```

Expected: all tests pass including the 3 new endpoint tests.

- [ ] **Step 6: Smoke-test the endpoint locally**

Start the backend: `cd backend && uvicorn app.main:app --reload --port 8000`

Then in a separate terminal (requires a real Firebase token — skip if not set up locally):

```bash
curl -X POST http://localhost:8000/v1/export/premiere \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"nodes":[],"edges":[]}' \
  -o /dev/null -w "%{http_code}\n"
# Expected: 422 (no media)
```

- [ ] **Step 7: Commit**

```bash
git add backend/app/routers/premiere_export.py backend/app/main.py backend/tests/test_premiere_export.py
git commit -m "feat: POST /v1/export/premiere endpoint — downloads media, builds FCP7 XML, streams ZIP"
```

---

### Task 4: Frontend — API constant, export handler, toolbar button

**Files:**
- Modify: `frontend/src/lib/api-config.ts`
- Modify: `frontend/src/components/workflow/WorkflowToolbar.tsx`
- Modify: `frontend/src/components/workflow/WorkflowCanvas.tsx`

- [ ] **Step 1: Add `API_ENDPOINTS` import to `WorkflowCanvas.tsx`**

`WorkflowCanvas.tsx` does not currently import `API_ENDPOINTS`. Add this import near the other `@/lib` imports at the top of the file:

```typescript
import { API_ENDPOINTS } from "@/lib/api-config";
```

Verify it compiles:

```bash
cd frontend && npx tsc --noEmit --skipLibCheck 2>&1 | grep "WorkflowCanvas" | head -5
# Expected: no output
```

- [ ] **Step 3: Add the export URL to `frontend/src/lib/api-config.ts`**

After the `video:` block (around line 51), add:

```typescript
  export: {
    premiere: `${VEO_API_BASE_URL}/v1/export/premiere`,
  },
```

Verify the full file still parses:

```bash
cd frontend && npx tsc --noEmit --skipLibCheck 2>&1 | grep "api-config" | head -5
# Expected: no output (no errors)
```

- [ ] **Step 4: Add props and button to `WorkflowToolbar.tsx`**

Add two props to the `WorkflowToolbarProps` interface (after `isInsideCompound?: boolean`):

```typescript
  onExportPremiere?: () => void;
  isExportingPremiere?: boolean;
```

Add the destructured params in the function signature (after `isInsideCompound = false`):

```typescript
  onExportPremiere,
  isExportingPremiere = false,
```

Add the import for the `Download` icon at the top (Lucide already imported — add `Download` to the list):

```typescript
import {
  Trash2, ZoomIn, ZoomOut, Maximize2, Play, RotateCcw, Save, List,
  StopCircle, Share2, LayoutTemplate, PanelRightClose, PanelRightOpen,
  Settings, Download,
} from "lucide-react";
```

Add the Export button inside the `{!collapsed && <>` block, after the Settings button and before the closing `</>`:

```tsx
{/* Export to Premiere */}
{onExportPremiere && !isReadOnly && !isInsideCompound && (
  <>
    <div className="w-px h-6 bg-border mx-0.5" />
    <button
      onClick={onExportPremiere}
      disabled={isExportingPremiere}
      className="toolbar-btn text-pill"
      title="Export timeline to Adobe Premiere Pro (downloads ZIP)"
    >
      {isExportingPremiere ? (
        <Spinner size={14} />
      ) : (
        <Download className="w-3.5 h-3.5" />
      )}
      <span>{isExportingPremiere ? "Exporting…" : "Open in Premiere"}</span>
    </button>
  </>
)}
```

- [ ] **Step 5: Type-check `WorkflowToolbar.tsx`**

```bash
cd frontend && npx tsc --noEmit --skipLibCheck 2>&1 | grep "WorkflowToolbar" | head -5
# Expected: no output
```

- [ ] **Step 6: Implement `handleExportPremiere` in `WorkflowCanvas.tsx`**

Add state near other loading states (search for `isExecuting` state declaration):

```typescript
const [isExportingPremiere, setIsExportingPremiere] = useState(false);
```

Add the handler function (place it near other `handleXxx` callbacks, before the JSX return):

```typescript
const handleExportPremiere = useCallback(async () => {
  if (isExportingPremiere) return;
  setIsExportingPremiere(true);
  try {
    const { auth } = await import("@/lib/firebase");
    const token = await auth.currentUser?.getIdToken();
    if (!token) {
      toast({ title: "Not signed in", variant: "destructive" });
      return;
    }
    const response = await fetch(API_ENDPOINTS.export.premiere, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ nodes, edges }),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.detail || `Export failed (${response.status})`);
    }
    const blob = await response.blob();
    const disposition = response.headers.get("content-disposition") || "";
    const match = disposition.match(/filename="([^"]+)"/);
    const filename = match?.[1] ?? "genmediastudio-export.zip";
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "Export ready", description: `Downloaded ${filename}` });
  } catch (err) {
    toast({
      title: "Export failed",
      description: err instanceof Error ? err.message : String(err),
      variant: "destructive",
    });
  } finally {
    setIsExportingPremiere(false);
  }
}, [isExportingPremiere, nodes, edges, toast]);
```

- [ ] **Step 7: Compute `hasCompletedVideo` and wire props to `WorkflowToolbar`**

Add this derived value near other derived state (before the JSX return):

```typescript
const hasCompletedVideo = nodes.some(
  (n) => n.data.status === "completed" && (
    n.data.outputs?.video || n.data.gcsUrl || n.data.videoUrl
  )
);
```

Find the `<WorkflowToolbar` JSX block and add these two props:

```tsx
onExportPremiere={hasCompletedVideo ? handleExportPremiere : undefined}
isExportingPremiere={isExportingPremiere}
```

- [ ] **Step 8: Type-check the full frontend**

```bash
cd frontend && npx tsc --noEmit --skipLibCheck 2>&1 | grep -E "WorkflowCanvas|WorkflowToolbar|api-config" | head -10
# Expected: no output
```

- [ ] **Step 9: Manual smoke-test in the browser**

1. Start backend: `cd backend && uvicorn app.main:app --reload --port 8000`
2. Start frontend: `cd frontend && pnpm dev`
3. Open the workflow canvas, run at least one GenerateVideo node to completion
4. Verify the "Open in Premiere" button appears in the toolbar
5. Click it — browser should download a `.zip` file
6. Unzip: confirm it contains one `.xml` file and at least one `.mp4`
7. Open the XML in Premiere Pro — confirm clips appear on the timeline and Premiere finds the media without prompting

- [ ] **Step 10: Commit**

```bash
git add frontend/src/lib/api-config.ts frontend/src/components/workflow/WorkflowToolbar.tsx frontend/src/components/workflow/WorkflowCanvas.tsx
git commit -m "feat: Export to Premiere button — serialises workflow, downloads ZIP with FCP7 XML + media"
```
