"""
FCP7 XML (XMEML v4) export for Adobe Premiere Pro.

Pure builder functions have no I/O side effects.
The HTTP endpoint is at the bottom of this file.
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


# ── Data classes ─────────────────────────────────────────────────────────────

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
    filename: str
    duration_secs: float


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


def _video_file_el(file_id: str, filename: str, duration_frames: int,
                   fps: int = FPS) -> ET.Element:
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

    audio = ET.SubElement(media, "audio")
    asc = ET.SubElement(audio, "samplecharacteristics")
    ET.SubElement(asc, "depth").text = "16"
    ET.SubElement(asc, "samplerate").text = "48000"
    ET.SubElement(audio, "channelcount").text = "2"

    return f


def _image_file_el(file_id: str, filename: str, duration_frames: int,
                   fps: int = FPS) -> ET.Element:
    f = ET.Element("file", id=file_id)
    ET.SubElement(f, "name").text = filename
    ET.SubElement(f, "pathurl").text = filename
    f.append(_rate_el(fps))
    ET.SubElement(f, "duration").text = str(duration_frames)
    f.append(_timecode_el(fps))

    media = ET.SubElement(f, "media")
    video = ET.SubElement(media, "video")
    vsc = ET.SubElement(video, "samplecharacteristics")
    vsc.append(_rate_el(fps))
    ET.SubElement(vsc, "width").text = "1920"
    ET.SubElement(vsc, "height").text = "1080"

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


def build_xmeml(
    v1_clips: list[V1Clip],
    v2_watermark: Optional[V2Watermark],
    audio_tracks: list[AudioTrack],
    fps: int = FPS,
) -> str:
    """Build a FCP7 XML (XMEML v4) string from the timeline spec."""
    total_frames = sum(secs_to_frames(c.duration_secs, fps) for c in v1_clips)
    if total_frames == 0:
        total_frames = 1

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
    ET.SubElement(fsc, "width").text = "1920"
    ET.SubElement(fsc, "height").text = "1080"

    # V1 track — sequential clip timeline
    v1_track = ET.SubElement(video_sec, "track")
    cursor = 0
    for i, clip in enumerate(v1_clips):
        df = secs_to_frames(clip.duration_secs, fps)
        file_id = f"file-v1-{i}"
        item_id = f"clipitem-v1-{i}"

        ci = ET.SubElement(v1_track, "clipitem", id=item_id)
        ET.SubElement(ci, "name").text = clip.filename
        ET.SubElement(ci, "duration").text = str(df)
        ci.append(_rate_el(fps))
        ET.SubElement(ci, "in").text = "0"
        ET.SubElement(ci, "out").text = str(df - 1)
        ET.SubElement(ci, "start").text = str(cursor)
        ET.SubElement(ci, "end").text = str(cursor + df)
        ci.append(_video_file_el(file_id, clip.filename, df, fps))
        cursor += df

    # V2 track — watermark overlay (optional)
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
        ci.append(_image_file_el("file-v2-wm", wm.filename, wm_frames, fps))
        ET.SubElement(ci, "compositemode").text = "normal"
        op_el = ET.SubElement(ci, "opacity")
        kf = ET.SubElement(op_el, "keyframe")
        ET.SubElement(kf, "when").text = "0"
        ET.SubElement(kf, "value").text = str(wm.opacity)

    # ── Audio section ─────────────────────────────────────────────────────────
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
            ci.append(_audio_file_el(f"file-a{j}", atrack.filename, af, fps))

    xml_bytes = ET.tostring(root, encoding="unicode", xml_declaration=False)
    return '<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE xmeml>\n' + xml_bytes


# ── Graph traversal ───────────────────────────────────────────────────────────

_VIDEO_LEAF_TYPES = {"generateVideo", "videoInput"}
_AUDIO_LEAF_TYPES = {"generateMusic", "voiceChanger", "elevenLabsGenerate"}
_MERGE_TYPE = "mergeVideos"
_ADD_MUSIC_TYPE = "addMusicToVideo"
_WATERMARK_TYPE = "videoWatermark"
_SEGMENT_REPLACE_TYPE = "videoSegmentReplace"
_MERGE_VIDEO_SLOTS = ["video1", "video2", "video3", "video4", "video5", "video6"]


@dataclass
class TimelinePlan:
    v1_urls: list[str] = field(default_factory=list)
    v2_watermark_url: Optional[str] = None
    v2_opacity: int = 80
    audio_urls: list[str] = field(default_factory=list)


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


def collect_media_urls(nodes: list[dict], _edges: list[dict]) -> list[str]:
    """Return all completed media URLs across all nodes."""
    urls = []
    for node in nodes:
        for getter in (_get_video_url, _get_audio_url, _get_image_url):
            url = getter(node)
            if url:
                urls.append(url)
    return list(dict.fromkeys(urls))


def plan_timeline(nodes: list[dict], edges: list[dict]) -> TimelinePlan:
    """
    Walk the workflow graph and produce a TimelinePlan.
    No I/O — pure graph traversal.
    """
    node_by_id = {n["id"]: n for n in nodes}
    incoming: dict[tuple[str, str], list[dict]] = {}
    for e in edges:
        key = (e["target"], e.get("targetHandle", ""))
        incoming.setdefault(key, []).append(e)

    plan = TimelinePlan()

    def source_url(target_id: str, target_handle: str,
                   getter=_get_video_url) -> Optional[str]:
        for e in incoming.get((target_id, target_handle), []):
            src = node_by_id.get(e["source"])
            if src:
                url = getter(src)
                if url:
                    return url
        return None

    # MergeVideos → V1 clip sequence (input slot order)
    merge_nodes = [n for n in nodes if n.get("type") == _MERGE_TYPE]
    if merge_nodes:
        data = merge_nodes[0].get("data") or {}
        for slot in _MERGE_VIDEO_SLOTS:
            url = data.get(slot)
            if url:
                plan.v1_urls.append(url)

    # VideoWatermark → V2 compositing track
    wm_nodes = [n for n in nodes if n.get("type") == _WATERMARK_TYPE]
    if wm_nodes:
        wm_node = wm_nodes[0]
        data = wm_node.get("data") or {}
        wm_url = source_url(wm_node["id"], "watermark", _get_image_url)
        if not wm_url:
            wm_url = source_url(wm_node["id"], "watermark", _get_video_url)
        if wm_url:
            plan.v2_watermark_url = wm_url
            plan.v2_opacity = int(data.get("opacity", 80))

    # Audio leaf nodes → audio tracks
    for node in nodes:
        if node.get("type", "") in _AUDIO_LEAF_TYPES:
            url = _get_audio_url(node)
            if url:
                plan.audio_urls.append(url)

    # Fallback: video leaf nodes when no MergeVideos present
    if not plan.v1_urls:
        for node in nodes:
            ntype = node.get("type", "")
            if ntype in _VIDEO_LEAF_TYPES or ntype == _SEGMENT_REPLACE_TYPE:
                url = _get_video_url(node)
                if url:
                    plan.v1_urls.append(url)

    # Final fallback: gcsUrl / videoUrl on any completed node
    if not plan.v1_urls:
        for node in nodes:
            data = node.get("data") or {}
            url = data.get("gcsUrl") or data.get("videoUrl")
            if url:
                plan.v1_urls.append(url)
                break

    return plan


# ── Media fetching ────────────────────────────────────────────────────────────

async def fetch_media_bytes(url: str) -> bytes:
    """Download a GCS URL or decode a data: URL to raw bytes."""
    if url.startswith("data:"):
        _header, encoded = url.split(",", 1)
        return base64.b64decode(encoded)
    async with httpx.AsyncClient(timeout=120.0) as client:
        resp = await client.get(url)
        resp.raise_for_status()
        return resp.content


def _safe_filename(url: str, role: str, index: int) -> str:
    """Derive a clean filename from a URL."""
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
    Returns: application/zip with FCP7 XML + all media files flat in the ZIP.
    Premiere auto-links when the XML and media live in the same folder.
    """
    nodes = req.nodes
    edges = req.edges

    plan = plan_timeline(nodes, edges)

    all_urls: list[str] = list(dict.fromkeys(
        plan.v1_urls
        + ([plan.v2_watermark_url] if plan.v2_watermark_url else [])
        + plan.audio_urls
    ))

    if not all_urls:
        raise HTTPException(status_code=422, detail="No completed media found in workflow")

    with tempfile.TemporaryDirectory() as tmpdir:
        url_to_filename: dict[str, str] = {}
        url_to_duration: dict[str, float] = {}
        media_files: dict[str, bytes] = {}

        for i, url in enumerate(all_urls):
            try:
                data = await fetch_media_bytes(url)
            except Exception as exc:
                logger.warning(f"[premiere-export] Failed to fetch {url}: {exc}")
                continue

            role = "audio" if url in plan.audio_urls else (
                "watermark" if url == plan.v2_watermark_url else "video"
            )
            fname = _safe_filename(url, role, i)
            if fname in media_files:
                stem, ext = fname.rsplit(".", 1) if "." in fname else (fname, "mp4")
                fname = f"{stem}-{i}.{ext}"

            tmp_path = f"{tmpdir}/{fname}"
            with open(tmp_path, "wb") as f:
                f.write(data)

            # probe_video uses subprocess.run — offload to thread per CLAUDE.md
            probe = await asyncio.to_thread(probe_video, tmp_path)
            duration = float((probe.get("format") or {}).get("duration", 0))

            url_to_filename[url] = fname
            url_to_duration[url] = duration
            media_files[fname] = data

        if not media_files:
            raise HTTPException(status_code=422, detail="All media downloads failed")

        v1_clips = [
            V1Clip(filename=url_to_filename[u], duration_secs=url_to_duration.get(u, 1.0))
            for u in plan.v1_urls if u in url_to_filename
        ]
        v2_watermark = None
        if plan.v2_watermark_url and plan.v2_watermark_url in url_to_filename:
            v2_watermark = V2Watermark(
                filename=url_to_filename[plan.v2_watermark_url],
                total_secs=url_to_duration.get(plan.v2_watermark_url, 1.0),
                opacity=plan.v2_opacity,
            )
        audio_tracks = [
            AudioTrack(filename=url_to_filename[u], duration_secs=url_to_duration.get(u, 1.0))
            for u in plan.audio_urls if u in url_to_filename
        ]

        if not v1_clips:
            raise HTTPException(status_code=422, detail="No video clips could be assembled")

        xml_str = build_xmeml(v1_clips, v2_watermark, audio_tracks)

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
