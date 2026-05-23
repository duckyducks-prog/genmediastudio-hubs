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
    assert secs_to_frames(1.033) == 31
    assert secs_to_frames(0.0) == 0


def test_build_xmeml_single_v1_clip():
    clips = [V1Clip(filename="clip.mp4", duration_secs=2.0)]
    xml_str = build_xmeml(v1_clips=clips, v2_watermark=None, audio_tracks=[])

    root = ET.fromstring(xml_str)
    assert root.tag == "xmeml"
    assert root.attrib["version"] == "4"

    seq = root.find("sequence")
    assert seq is not None
    assert seq.findtext("duration") == "60"

    video = seq.find("media/video")
    assert video is not None
    tracks = video.findall("track")
    assert len(tracks) == 1

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
    assert seq.findtext("duration") == "150"

    track = root.find("sequence/media/video/track")
    items = track.findall("clipitem")
    assert len(items) == 2

    assert items[0].findtext("start") == "0"
    assert items[0].findtext("end") == "90"
    assert items[1].findtext("start") == "90"
    assert items[1].findtext("end") == "150"


def test_build_xmeml_watermark_creates_v2_track():
    clips = [V1Clip(filename="main.mp4", duration_secs=5.0)]
    wm = V2Watermark(filename="logo.png", total_secs=5.0, opacity=80)
    xml_str = build_xmeml(v1_clips=clips, v2_watermark=wm, audio_tracks=[])

    root = ET.fromstring(xml_str)
    video = root.find("sequence/media/video")
    tracks = video.findall("track")
    assert len(tracks) == 2

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
    clips = [V1Clip(filename="myclip.mp4", duration_secs=1.0)]
    xml_str = build_xmeml(v1_clips=clips, v2_watermark=None, audio_tracks=[])
    root = ET.fromstring(xml_str)
    pathurl = root.find("sequence/media/video/track/clipitem/file/pathurl")
    assert pathurl is not None
    assert pathurl.text == "myclip.mp4"


# ── Task 2: graph traversal tests ──────────────────────────────────────────

from app.routers.premiere_export import (
    collect_media_urls,
    plan_timeline,
    TimelinePlan,
    VideoTrack,
    AudioTrackSpec,
)


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
        _node("n1", "generateVideo", outputs={}),
        _node("n2", "generateVideo"),
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


def test_plan_timeline_single_video():
    nodes = [_node("v1", "generateVideo", outputs={"video": "https://gcs/clip.mp4"})]
    plan = plan_timeline(nodes, [])
    assert len(plan.video_tracks) >= 1
    v1_urls = [c.source_url for c in plan.video_tracks[0].clips]
    assert "https://gcs/clip.mp4" in v1_urls
    assert len(plan.audio_tracks) == 0


def test_plan_timeline_merge_videos_order():
    merge = _node("merge", "mergeVideos", data={
        "video1": "https://gcs/a.mp4",
        "video2": "https://gcs/b.mp4",
        "video3": "https://gcs/c.mp4",
    })
    plan = plan_timeline([merge], [])
    v1_urls = [c.source_url for c in plan.video_tracks[0].clips]
    assert v1_urls == [
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
    audio_urls = [c.source_url for at in plan.audio_tracks for c in at.clips]
    assert "https://gcs/music.wav" in audio_urls


def test_plan_timeline_voice_changer_adds_audio_track():
    """VoiceChanger output (a video file) goes on an audio track for mix flexibility."""
    nodes = [_node("vc", "voiceChanger", outputs={"video": "https://gcs/voice-changed.mp4"})]
    plan = plan_timeline(nodes, [])
    audio_urls = [c.source_url for at in plan.audio_tracks for c in at.clips]
    assert "https://gcs/voice-changed.mp4" in audio_urls


def test_plan_timeline_watermark_node():
    nodes = [
        _node("wm", "videoWatermark",
              outputs={"video": "https://gcs/watermarked.mp4"},
              data={"opacity": 70}),
        _node("src", "generateImage", outputs={"image": "https://gcs/logo.png"}),
    ]
    edges = [_edge("src", "wm", "image", "watermark")]
    plan = plan_timeline(nodes, edges)
    all_video_urls = [c.source_url for vt in plan.video_tracks for c in vt.clips]
    assert "https://gcs/logo.png" in all_video_urls
    wm_clip = next(
        c for vt in plan.video_tracks for c in vt.clips
        if c.source_url == "https://gcs/logo.png"
    )
    assert wm_clip.opacity == 70


def test_plan_timeline_falls_back_to_gcs_url():
    nodes = [
        _node("v1", "generateVideo",
              outputs={},
              data={"gcsUrl": "https://gcs/fallback.mp4"}),
    ]
    plan = plan_timeline(nodes, [])
    v1_urls = [c.source_url for c in plan.video_tracks[0].clips]
    assert "https://gcs/fallback.mp4" in v1_urls


# ── Task 3: endpoint tests ──────────────────────────────────────────────────

import io
import zipfile
from unittest.mock import patch
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.auth import get_current_user

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

_FAKE_VIDEO_BYTES = b"\x00\x00\x00\x18ftyp"


def _auth_override():
    return {"uid": "u1", "email": "test@test.com"}


@pytest.mark.asyncio
async def test_export_endpoint_returns_zip():
    async def _fake_fetch(url: str) -> bytes:
        return _FAKE_VIDEO_BYTES

    fake_probe = {"format": {"duration": "3.0"}}
    app.dependency_overrides[get_current_user] = _auth_override

    try:
        with (
            patch("app.routers.premiere_export.fetch_media_bytes", new=_fake_fetch),
            patch("app.routers.premiere_export.probe_video", return_value=fake_probe),
        ):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                response = await client.post("/v1/export/premiere", json=_SIMPLE_GRAPH)
    finally:
        app.dependency_overrides.pop(get_current_user, None)

    assert response.status_code == 200
    assert "application/zip" in response.headers["content-type"]
    assert "attachment" in response.headers.get("content-disposition", "")

    buf = io.BytesIO(response.content)
    with zipfile.ZipFile(buf) as zf:
        names = zf.namelist()
        xml_files = [n for n in names if n.endswith(".xml")]
        assert len(xml_files) == 1
        xml_content = zf.read(xml_files[0]).decode()
        assert "<xmeml" in xml_content
        assert "clip.mp4" in xml_content


@pytest.mark.asyncio
async def test_export_endpoint_partial_ok_when_node_has_no_url():
    graph = {
        "nodes": [
            {"id": "n1", "type": "generateVideo", "data": {"status": "ready"}},
            {"id": "n2", "type": "generateVideo",
             "data": {"outputs": {"video": "https://gcs/clip.mp4"}, "status": "completed"}},
        ],
        "edges": [],
    }

    async def _fake_fetch(url: str) -> bytes:
        return _FAKE_VIDEO_BYTES

    app.dependency_overrides[get_current_user] = _auth_override
    try:
        with (
            patch("app.routers.premiere_export.fetch_media_bytes", new=_fake_fetch),
            patch("app.routers.premiere_export.probe_video", return_value={"format": {"duration": "2.0"}}),
        ):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                response = await client.post("/v1/export/premiere", json=graph)
    finally:
        app.dependency_overrides.pop(get_current_user, None)

    assert response.status_code == 200


@pytest.mark.asyncio
async def test_export_endpoint_rejects_empty_graph():
    graph = {"nodes": [], "edges": []}

    app.dependency_overrides[get_current_user] = _auth_override
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post("/v1/export/premiere", json=graph)
    finally:
        app.dependency_overrides.pop(get_current_user, None)

    assert response.status_code == 422
