"""
FCP7 XML (XMEML v4) export for Adobe Premiere Pro.

Proper multi-track layout:
  V1      — base video clips (MergeVideos inputs in slot order, or single video)
  V2      — VoiceChanger output (full-duration overlay)
  V3      — VideoSegmentReplace replacement (positioned at startPercent–endPercent)
  V4      — VideoWatermark image/video (full-duration composite)
  V5+     — BurnCaptions and other video overlays
  A1/A2   — Audio linked from V1 clips (stereo channels)
  A3      — GenerateMusic output
"""
import asyncio
import base64
import io
import re
import tempfile
import zipfile
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Optional
import xml.etree.ElementTree as ET

import httpx
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.auth import get_current_user
from app.logging_config import setup_logger
from app.routers.video_processing import probe_video

logger = setup_logger(__name__)

router = APIRouter(prefix="/v1/export", tags=["export"])

FPS = 30  # Premiere default timebase

# Node type strings matching frontend NodeType enum values
_MERGE_TYPE = "mergeVideos"
_VOICE_CHANGER_TYPE = "voiceChanger"
_SEGMENT_REPLACE_TYPE = "videoSegmentReplace"
_WATERMARK_TYPE = "videoWatermark"
_BURN_CAPTIONS_TYPE = "burnCaptions"
_ADD_MUSIC_TYPE = "addMusicToVideo"
_GENERATE_MUSIC_TYPE = "generateMusic"
_VIDEO_LEAF_TYPES = {"generateVideo", "videoInput"}
_MERGE_VIDEO_SLOTS = ["video1", "video2", "video3", "video4", "video5", "video6"]


# ── Timeline data classes ─────────────────────────────────────────────────────

@dataclass
class TrackClip:
    filename: str
    source_url: str
    duration_frames: int = 0           # filled in after probe
    timeline_start_frames: int = 0     # position on the timeline
    opacity: int = 100                 # 0-100, for compositing tracks


@dataclass
class VideoTrack:
    clips: list[TrackClip] = field(default_factory=list)
    blend_mode: str = "normal"         # "normal" for compositing layers


@dataclass
class AudioTrackSpec:
    clips: list[TrackClip] = field(default_factory=list)


@dataclass
class TimelinePlan:
    """
    Multi-track description of the export.
    video_tracks[0] = V1 (base), [1] = V2 (voice changer), etc.
    audio_tracks[0] = A1 (video clip audio L), [1] = A2 (R), [2] = A3 (music), ...
    """
    video_tracks: list[VideoTrack] = field(default_factory=list)
    audio_tracks: list[AudioTrackSpec] = field(default_factory=list)
    # width/height filled in during endpoint after probing V1 clips
    width: int = 1920
    height: int = 1080

    def all_source_urls(self) -> list[str]:
        """Deduplicated list of every URL that needs downloading."""
        seen: dict[str, None] = {}
        for vt in self.video_tracks:
            for c in vt.clips:
                seen[c.source_url] = None
        for at in self.audio_tracks:
            for c in at.clips:
                seen[c.source_url] = None
        return list(seen)


# ── V1Clip / V2Watermark / AudioTrack kept for backward compat with tests ────

@dataclass
class V1Clip:
    filename: str
    duration_secs: float


@dataclass
class V2Watermark:
    filename: str
    total_secs: float
    opacity: int = 80


@dataclass
class AudioTrack:
    """Legacy dataclass kept for existing tests and build_xmeml."""
    filename: str
    duration_secs: float


# ── URL extraction helpers ────────────────────────────────────────────────────

def _get_video_url(node: dict) -> Optional[str]:
    data = node.get("data") or {}
    outputs = data.get("outputs") or {}
    return (
        outputs.get("video")
        or data.get("gcsUrl")
        or data.get("videoUrl")
        or outputs.get("videoUrl")
    ) or None


def _get_audio_url(node: dict) -> Optional[str]:
    data = node.get("data") or {}
    outputs = data.get("outputs") or {}
    return (
        outputs.get("audio")
        or data.get("audioUrl")
        or outputs.get("audioUrl")
    ) or None


def _get_image_url(node: dict) -> Optional[str]:
    data = node.get("data") or {}
    outputs = data.get("outputs") or {}
    return (
        outputs.get("image")
        or data.get("imageUrl")
        or outputs.get("imageUrl")
    ) or None


# ── Graph traversal → TimelinePlan ───────────────────────────────────────────

def plan_timeline(nodes: list[dict], edges: list[dict]) -> TimelinePlan:
    """
    Walk the workflow graph and produce a TimelinePlan with multi-track layout.
    No I/O — pure graph traversal.

    Track assignment:
      V1  — base video clips (MergeVideos slots, or leaf GenerateVideo nodes)
      V2  — VoiceChanger output video (full-duration overlay)
      V3  — VideoSegmentReplace replacement (positioned by startPercent/endPercent)
      V4  — VideoWatermark source image/video (compositing layer)
      V5  — BurnCaptions output video (overlay)
      A1  — GenerateMusic audio
      A2  — (reserved for additional audio sources)
    """
    plan = TimelinePlan()
    node_by_id = {n["id"]: n for n in nodes}

    # Build incoming-edge index: (target_id, target_handle) → [edge]
    incoming: dict[tuple[str, str], list[dict]] = {}
    for e in edges:
        key = (e["target"], e.get("targetHandle", ""))
        incoming.setdefault(key, []).append(e)

    def source_node_for(target_id: str, handle: str) -> Optional[dict]:
        for e in incoming.get((target_id, handle), []):
            n = node_by_id.get(e["source"])
            if n:
                return n
        return None

    # ── V1: base video clips ─────────────────────────────────────────────────
    v1_clips: list[TrackClip] = []

    merge_nodes = [n for n in nodes if n.get("type") == _MERGE_TYPE]
    if merge_nodes:
        data = merge_nodes[0].get("data") or {}
        for slot in _MERGE_VIDEO_SLOTS:
            url = data.get(slot)
            if url:
                v1_clips.append(TrackClip(filename="", source_url=url))
    else:
        # No MergeVideos — pick any leaf video node outputs
        for node in nodes:
            ntype = node.get("type", "")
            if ntype in _VIDEO_LEAF_TYPES:
                url = _get_video_url(node)
                if url:
                    v1_clips.append(TrackClip(filename="", source_url=url))

    # Final fallback: any completed node with a gcsUrl
    if not v1_clips:
        for node in nodes:
            data = node.get("data") or {}
            url = data.get("gcsUrl") or data.get("videoUrl")
            if url:
                v1_clips.append(TrackClip(filename="", source_url=url))

    if v1_clips:
        plan.video_tracks.append(VideoTrack(clips=v1_clips))

    # ── A(first): VoiceChanger output → audio track ──────────────────────────
    # VoiceChanger produces a video file containing the re-voiced audio.
    # Represented as an audio track so editors can mix/replace independently.
    vc_nodes = [n for n in nodes if n.get("type") == _VOICE_CHANGER_TYPE]
    for vc_node in vc_nodes:
        url = _get_video_url(vc_node)  # outputs a video file; use its audio stream
        if url:
            plan.audio_tracks.insert(0, AudioTrackSpec(
                clips=[TrackClip(filename="", source_url=url)],
            ))

    # ── V3: VideoSegmentReplace — replacement clip with time positioning ──────
    seg_nodes = [n for n in nodes if n.get("type") == _SEGMENT_REPLACE_TYPE]
    for seg_node in seg_nodes:
        data = seg_node.get("data") or {}
        start_pct = float(data.get("startPercent", 0))
        end_pct = float(data.get("endPercent", 100))
        # Find the replacement video source via the "replacement" input handle
        src = source_node_for(seg_node["id"], "replacement")
        url = _get_video_url(src) if src else None
        if url:
            plan.video_tracks.append(VideoTrack(
                clips=[TrackClip(
                    filename="",
                    source_url=url,
                    # Store percentages temporarily; converted to frames in endpoint
                    # after we know V1 total duration. Reuse timeline_start_frames
                    # and duration_frames as percentage * 1000 until resolved.
                    timeline_start_frames=int(start_pct * 1000),  # marker
                    duration_frames=int(end_pct * 1000),          # marker (end%)
                )],
            ))

    # ── V4: VideoWatermark source (compositing layer) ─────────────────────────
    wm_nodes = [n for n in nodes if n.get("type") == _WATERMARK_TYPE]
    for wm_node in wm_nodes:
        data = wm_node.get("data") or {}
        opacity = int(data.get("opacity", 80))
        wm_src = source_node_for(wm_node["id"], "watermark")
        url = None
        if wm_src:
            url = _get_image_url(wm_src) or _get_video_url(wm_src)
        if url:
            plan.video_tracks.append(VideoTrack(
                clips=[TrackClip(filename="", source_url=url, opacity=opacity)],
            ))

    # ── V5: BurnCaptions output (overlay) ────────────────────────────────────
    cap_nodes = [n for n in nodes if n.get("type") == _BURN_CAPTIONS_TYPE]
    for cap_node in cap_nodes:
        url = _get_video_url(cap_node)
        if url:
            plan.video_tracks.append(VideoTrack(
                clips=[TrackClip(filename="", source_url=url)],
            ))

    # ── Audio: GenerateMusic ─────────────────────────────────────────────────
    music_nodes = [n for n in nodes if n.get("type") == _GENERATE_MUSIC_TYPE]
    for mus_node in music_nodes:
        url = _get_audio_url(mus_node)
        if url:
            plan.audio_tracks.append(AudioTrackSpec(
                clips=[TrackClip(filename="", source_url=url)],
            ))

    return plan


# ── Kept for backward-compat with existing tests ─────────────────────────────

def collect_media_urls(nodes: list[dict], _edges: list[dict]) -> list[str]:
    urls = []
    for node in nodes:
        for getter in (_get_video_url, _get_audio_url, _get_image_url):
            url = getter(node)
            if url:
                urls.append(url)
    return list(dict.fromkeys(urls))


# ── Pure XML builder functions ────────────────────────────────────────────────

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


def _make_file_el(file_id: str, filename: str, duration_frames: int,
                  width: int, height: int, has_video: bool = True,
                  has_audio: bool = True, fps: int = FPS) -> ET.Element:
    f = ET.Element("file", id=file_id)
    ET.SubElement(f, "name").text = filename
    ET.SubElement(f, "pathurl").text = filename  # filename-only → same-dir auto-link
    f.append(_rate_el(fps))
    ET.SubElement(f, "duration").text = str(duration_frames)
    f.append(_timecode_el(fps))

    media = ET.SubElement(f, "media")
    if has_video:
        video = ET.SubElement(media, "video")
        vsc = ET.SubElement(video, "samplecharacteristics")
        vsc.append(_rate_el(fps))
        ET.SubElement(vsc, "width").text = str(width)
        ET.SubElement(vsc, "height").text = str(height)
    if has_audio:
        audio = ET.SubElement(media, "audio")
        asc = ET.SubElement(audio, "samplecharacteristics")
        ET.SubElement(asc, "depth").text = "16"
        ET.SubElement(asc, "samplerate").text = "48000"
        ET.SubElement(audio, "channelcount").text = "2"
    return f


def build_xmeml_multitrack(
    plan: "TimelinePlan",
    fps: int = FPS,
) -> str:
    """
    Build FCP7 XML from a resolved TimelinePlan (all durations/positions in frames).
    """
    total_frames = sum(c.duration_frames for c in plan.video_tracks[0].clips) if plan.video_tracks else 1

    root = ET.Element("xmeml", version="4")
    seq = ET.SubElement(root, "sequence")
    ET.SubElement(seq, "name").text = "GenMedia Studio Export"
    ET.SubElement(seq, "duration").text = str(total_frames)
    seq.append(_rate_el(fps))

    media = ET.SubElement(seq, "media")

    # ── Video section ─────────────────────────────────────────────────────────
    video_sec = ET.SubElement(media, "video")
    fmt = ET.SubElement(video_sec, "format")
    fsc = ET.SubElement(fmt, "samplecharacteristics")
    fsc.append(_rate_el(fps))
    ET.SubElement(fsc, "width").text = str(plan.width)
    ET.SubElement(fsc, "height").text = str(plan.height)

    # Tracks declared from bottom to top (V1 first = bottom layer in Premiere)
    file_registry: dict[str, str] = {}  # filename → file_id (avoid duplicate file els)

    for track_idx, vtrack in enumerate(plan.video_tracks):
        xml_track = ET.SubElement(video_sec, "track")
        clip_cursor = 0

        for clip_idx, clip in enumerate(vtrack.clips):
            item_id = f"ci-v{track_idx+1}-{clip_idx}"
            file_id = f"file-v{track_idx+1}-{clip_idx}"

            start = clip.timeline_start_frames if clip.timeline_start_frames else clip_cursor
            end = start + clip.duration_frames

            ci = ET.SubElement(xml_track, "clipitem", id=item_id)
            ET.SubElement(ci, "name").text = clip.filename
            ET.SubElement(ci, "duration").text = str(clip.duration_frames)
            ci.append(_rate_el(fps))
            ET.SubElement(ci, "in").text = "0"
            ET.SubElement(ci, "out").text = str(clip.duration_frames - 1)
            ET.SubElement(ci, "start").text = str(start)
            ET.SubElement(ci, "end").text = str(end)

            if clip.filename not in file_registry:
                file_registry[clip.filename] = file_id
                ci.append(_make_file_el(
                    file_id, clip.filename, clip.duration_frames,
                    plan.width, plan.height, has_video=True, has_audio=(track_idx == 0),
                    fps=fps
                ))
            else:
                ET.SubElement(ci, "file", id=file_registry[clip.filename])

            if vtrack.blend_mode != "normal" or clip.opacity < 100:
                ET.SubElement(ci, "compositemode").text = "normal"
                op_el = ET.SubElement(ci, "opacity")
                kf = ET.SubElement(op_el, "keyframe")
                ET.SubElement(kf, "when").text = "0"
                ET.SubElement(kf, "value").text = str(clip.opacity)

            # Link V1 clips to their audio counterparts
            if track_idx == 0:
                ET.SubElement(ci, "link").text = ""
                link1 = ET.SubElement(ci, "link")
                ET.SubElement(link1, "linkclipref").text = f"ci-a1-{clip_idx}"
                ET.SubElement(link1, "mediatype").text = "audio"
                ET.SubElement(link1, "trackindex").text = "1"
                ET.SubElement(link1, "clipindex").text = str(clip_idx + 1)
                link2 = ET.SubElement(ci, "link")
                ET.SubElement(link2, "linkclipref").text = f"ci-a2-{clip_idx}"
                ET.SubElement(link2, "mediatype").text = "audio"
                ET.SubElement(link2, "trackindex").text = "2"
                ET.SubElement(link2, "clipindex").text = str(clip_idx + 1)

            clip_cursor += clip.duration_frames

    # ── Audio section ─────────────────────────────────────────────────────────
    audio_sec = ET.SubElement(media, "audio")

    # A1 + A2: stereo channels linked to V1 clips
    if plan.video_tracks:
        v1_clips = plan.video_tracks[0].clips
        for channel_idx in range(2):  # L and R
            a_track = ET.SubElement(audio_sec, "track")
            cursor = 0
            for clip_idx, clip in enumerate(v1_clips):
                item_id = f"ci-a{channel_idx+1}-{clip_idx}"
                ci = ET.SubElement(a_track, "clipitem", id=item_id)
                ET.SubElement(ci, "name").text = clip.filename
                ET.SubElement(ci, "duration").text = str(clip.duration_frames)
                ci.append(_rate_el(fps))
                ET.SubElement(ci, "in").text = "0"
                ET.SubElement(ci, "out").text = str(clip.duration_frames - 1)
                ET.SubElement(ci, "start").text = str(cursor)
                ET.SubElement(ci, "end").text = str(cursor + clip.duration_frames)
                ET.SubElement(ci, "file", id=file_registry.get(clip.filename, f"file-v1-{clip_idx}"))
                ET.SubElement(ci, "trackindex").text = str(channel_idx + 1)
                link = ET.SubElement(ci, "link")
                ET.SubElement(link, "linkclipref").text = f"ci-v1-{clip_idx}"
                ET.SubElement(link, "mediatype").text = "video"
                ET.SubElement(link, "trackindex").text = "1"
                ET.SubElement(link, "clipindex").text = str(clip_idx + 1)
                cursor += clip.duration_frames

    # Additional audio tracks (GenerateMusic, etc.)
    for at_idx, atrack in enumerate(plan.audio_tracks):
        xml_track = ET.SubElement(audio_sec, "track")
        for clip_idx, clip in enumerate(atrack.clips):
            item_id = f"ci-am{at_idx}-{clip_idx}"
            file_id = f"file-am{at_idx}-{clip_idx}"
            ci = ET.SubElement(xml_track, "clipitem", id=item_id)
            ET.SubElement(ci, "name").text = clip.filename
            ET.SubElement(ci, "duration").text = str(clip.duration_frames)
            ci.append(_rate_el(fps))
            ET.SubElement(ci, "in").text = "0"
            ET.SubElement(ci, "out").text = str(clip.duration_frames - 1)
            ET.SubElement(ci, "start").text = str(clip.timeline_start_frames)
            ET.SubElement(ci, "end").text = str(clip.timeline_start_frames + clip.duration_frames)
            ci.append(_make_file_el(
                file_id, clip.filename, clip.duration_frames,
                plan.width, plan.height, has_video=False, has_audio=True, fps=fps
            ))

    xml_bytes = ET.tostring(root, encoding="unicode", xml_declaration=False)
    return '<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE xmeml>\n' + xml_bytes


# ── Legacy build_xmeml kept for existing tests ───────────────────────────────

def build_xmeml(
    v1_clips: list[V1Clip],
    v2_watermark: Optional[V2Watermark],
    audio_tracks: list[AudioTrack],
    fps: int = FPS,
) -> str:
    total_frames = sum(secs_to_frames(c.duration_secs, fps) for c in v1_clips)
    if total_frames == 0:
        total_frames = 1

    root = ET.Element("xmeml", version="4")
    seq = ET.SubElement(root, "sequence")
    ET.SubElement(seq, "name").text = "GenMedia Studio Export"
    ET.SubElement(seq, "duration").text = str(total_frames)
    seq.append(_rate_el(fps))

    media = ET.SubElement(seq, "media")
    video_sec = ET.SubElement(media, "video")
    fmt = ET.SubElement(video_sec, "format")
    fsc = ET.SubElement(fmt, "samplecharacteristics")
    fsc.append(_rate_el(fps))
    ET.SubElement(fsc, "width").text = "1920"
    ET.SubElement(fsc, "height").text = "1080"

    v1_track = ET.SubElement(video_sec, "track")
    cursor = 0
    for i, clip in enumerate(v1_clips):
        df = secs_to_frames(clip.duration_secs, fps)
        ci = ET.SubElement(v1_track, "clipitem", id=f"clipitem-v1-{i}")
        ET.SubElement(ci, "name").text = clip.filename
        ET.SubElement(ci, "duration").text = str(df)
        ci.append(_rate_el(fps))
        ET.SubElement(ci, "in").text = "0"
        ET.SubElement(ci, "out").text = str(df - 1)
        ET.SubElement(ci, "start").text = str(cursor)
        ET.SubElement(ci, "end").text = str(cursor + df)
        file_el = ET.SubElement(ci, "file", id=f"file-v1-{i}")
        ET.SubElement(file_el, "name").text = clip.filename
        ET.SubElement(file_el, "pathurl").text = clip.filename
        file_el.append(_rate_el(fps))
        ET.SubElement(file_el, "duration").text = str(df)
        file_el.append(_timecode_el(fps))
        m = ET.SubElement(file_el, "media")
        v = ET.SubElement(m, "video")
        vsc = ET.SubElement(v, "samplecharacteristics")
        vsc.append(_rate_el(fps))
        ET.SubElement(vsc, "width").text = "1920"
        ET.SubElement(vsc, "height").text = "1080"
        a = ET.SubElement(m, "audio")
        asc = ET.SubElement(a, "samplecharacteristics")
        ET.SubElement(asc, "depth").text = "16"
        ET.SubElement(asc, "samplerate").text = "48000"
        ET.SubElement(a, "channelcount").text = "2"
        cursor += df

    if v2_watermark:
        wm = v2_watermark
        wm_frames = secs_to_frames(wm.total_secs, fps)
        v2_track = ET.SubElement(video_sec, "track")
        ci = ET.SubElement(v2_track, "clipitem", id="clipitem-v2-wm")
        ET.SubElement(ci, "name").text = wm.filename
        ET.SubElement(ci, "duration").text = str(wm_frames)
        ci.append(_rate_el(fps))
        ET.SubElement(ci, "in").text = "0"
        ET.SubElement(ci, "out").text = str(wm_frames - 1)
        ET.SubElement(ci, "start").text = "0"
        ET.SubElement(ci, "end").text = str(wm_frames)
        wf = ET.SubElement(ci, "file", id="file-v2-wm")
        ET.SubElement(wf, "name").text = wm.filename
        ET.SubElement(wf, "pathurl").text = wm.filename
        ET.SubElement(ci, "compositemode").text = "normal"
        op_el = ET.SubElement(ci, "opacity")
        kf = ET.SubElement(op_el, "keyframe")
        ET.SubElement(kf, "when").text = "0"
        ET.SubElement(kf, "value").text = str(wm.opacity)

    if audio_tracks:
        audio_sec = ET.SubElement(media, "audio")
        for j, atrack in enumerate(audio_tracks):
            af = secs_to_frames(atrack.duration_secs, fps)
            a_track_el = ET.SubElement(audio_sec, "track")
            ci = ET.SubElement(a_track_el, "clipitem", id=f"clipitem-a{j}")
            ET.SubElement(ci, "name").text = atrack.filename
            ET.SubElement(ci, "duration").text = str(af)
            ci.append(_rate_el(fps))
            ET.SubElement(ci, "in").text = "0"
            ET.SubElement(ci, "out").text = str(af - 1)
            ET.SubElement(ci, "start").text = "0"
            ET.SubElement(ci, "end").text = str(af)
            af_el = ET.SubElement(ci, "file", id=f"file-a{j}")
            ET.SubElement(af_el, "name").text = atrack.filename
            ET.SubElement(af_el, "pathurl").text = atrack.filename
            am = ET.SubElement(af_el, "media")
            aa = ET.SubElement(am, "audio")
            aasc = ET.SubElement(aa, "samplecharacteristics")
            ET.SubElement(aasc, "depth").text = "16"
            ET.SubElement(aasc, "samplerate").text = "48000"
            ET.SubElement(aa, "channelcount").text = "2"

    xml_bytes = ET.tostring(root, encoding="unicode", xml_declaration=False)
    return '<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE xmeml>\n' + xml_bytes


# ── Media fetching ────────────────────────────────────────────────────────────

async def fetch_media_bytes(url: str) -> bytes:
    if url.startswith("data:"):
        _header, encoded = url.split(",", 1)
        return base64.b64decode(encoded)
    async with httpx.AsyncClient(timeout=120.0) as client:
        resp = await client.get(url)
        resp.raise_for_status()
        return resp.content


def _safe_filename(url: str, role: str, index: int) -> str:
    path = url.split("?")[0].rstrip("/")
    basename = path.split("/")[-1]
    basename = re.sub(r"[^\w.\-]", "_", basename)
    if not basename or len(basename) > 60:
        ext = "wav" if role == "audio" else "mp4"
        basename = f"{role}-{index}.{ext}"
    return basename


# ── Request schema ────────────────────────────────────────────────────────────

class ExportRequest(BaseModel):
    nodes: list[dict[str, Any]]
    edges: list[dict[str, Any]]


# ── HTTP endpoint ─────────────────────────────────────────────────────────────

@router.post("/premiere")
async def export_premiere(
    req: ExportRequest,
    user: dict = Depends(get_current_user),
):
    """
    POST /v1/export/premiere
    Body: { nodes: [...], edges: [...] }
    Returns: application/zip with FCP7 XML + all media files (flat structure).
    Premiere auto-links when XML and media live in the same folder.
    """
    nodes = req.nodes
    edges = req.edges

    plan = plan_timeline(nodes, edges)
    all_urls = plan.all_source_urls()

    if not all_urls:
        raise HTTPException(status_code=422, detail="No completed media found in workflow")

    with tempfile.TemporaryDirectory() as tmpdir:
        url_to_filename: dict[str, str] = {}
        url_to_duration: dict[str, float] = {}
        url_to_dims: dict[str, tuple[int, int]] = {}
        media_files: dict[str, bytes] = {}

        for i, url in enumerate(all_urls):
            try:
                data = await fetch_media_bytes(url)
            except Exception as exc:
                logger.warning(f"[premiere-export] Failed to fetch {url}: {exc}")
                continue

            # Determine role for filename generation
            role = "audio"
            for at in plan.audio_tracks:
                if any(c.source_url == url for c in at.clips):
                    role = "audio"
                    break
            else:
                role = "video"

            fname = _safe_filename(url, role, i)
            if fname in media_files:
                stem, ext = fname.rsplit(".", 1) if "." in fname else (fname, "mp4")
                fname = f"{stem}-{i}.{ext}"

            tmp_path = f"{tmpdir}/{fname}"
            with open(tmp_path, "wb") as f:
                f.write(data)

            # probe_video uses subprocess.run — offload to thread per CLAUDE.md
            probe = await asyncio.to_thread(probe_video, tmp_path)
            fmt_info = probe.get("format") or {}
            duration = float(fmt_info.get("duration", 0))

            # Extract video dimensions from first video stream
            w, h = 1920, 1080
            for stream in probe.get("streams", []):
                if stream.get("codec_type") == "video":
                    w = int(stream.get("width", 1920))
                    h = int(stream.get("height", 1080))
                    break

            url_to_filename[url] = fname
            url_to_duration[url] = duration
            url_to_dims[url] = (w, h)
            media_files[fname] = data

        if not media_files:
            raise HTTPException(status_code=422, detail="All media downloads failed")

        # Resolve plan: assign filenames, compute frame positions, detect resolution
        # Use dimensions from first successfully downloaded V1 clip
        if plan.video_tracks and plan.video_tracks[0].clips:
            first_url = next(
                (c.source_url for c in plan.video_tracks[0].clips if c.source_url in url_to_dims),
                None
            )
            if first_url:
                plan.width, plan.height = url_to_dims[first_url]

        v1_total_frames = 0

        for track_idx, vtrack in enumerate(plan.video_tracks):
            cursor = 0
            for clip in vtrack.clips:
                if clip.source_url not in url_to_filename:
                    continue
                clip.filename = url_to_filename[clip.source_url]
                dur = url_to_duration.get(clip.source_url, 1.0)
                df = secs_to_frames(dur)

                is_segment_replace = (
                    track_idx >= 1  # only overlay tracks may be segment replacements
                    and clip.timeline_start_frames > 0  # encoded as pct * 1000
                    and clip.duration_frames > 0
                    and clip.timeline_start_frames <= 100_000
                )
                if is_segment_replace:
                    # Decode percentages stored as int(pct * 1000)
                    start_pct = clip.timeline_start_frames / 1000.0
                    end_pct = clip.duration_frames / 1000.0
                    start_f = round(v1_total_frames * start_pct / 100)
                    end_f = round(v1_total_frames * end_pct / 100)
                    clip.timeline_start_frames = start_f
                    clip.duration_frames = end_f - start_f
                else:
                    clip.duration_frames = df
                    if track_idx == 0:
                        clip.timeline_start_frames = cursor
                        cursor += df
                    else:
                        clip.timeline_start_frames = 0  # full-duration overlays start at 0

            if track_idx == 0:
                v1_total_frames = cursor

        for atrack in plan.audio_tracks:
            for clip in atrack.clips:
                if clip.source_url in url_to_filename:
                    clip.filename = url_to_filename[clip.source_url]
                    dur = url_to_duration.get(clip.source_url, 1.0)
                    clip.duration_frames = secs_to_frames(dur)
                    clip.timeline_start_frames = 0

        # Remove any clips whose URL wasn't successfully downloaded
        plan.video_tracks = [
            VideoTrack(clips=[c for c in vt.clips if c.filename], blend_mode=vt.blend_mode)
            for vt in plan.video_tracks
            if any(c.filename for c in vt.clips)
        ]
        plan.audio_tracks = [
            AudioTrackSpec(clips=[c for c in at.clips if c.filename])
            for at in plan.audio_tracks
            if any(c.filename for c in at.clips)
        ]

        if not plan.video_tracks:
            raise HTTPException(status_code=422, detail="No video clips could be assembled")

        xml_str = build_xmeml_multitrack(plan)

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
