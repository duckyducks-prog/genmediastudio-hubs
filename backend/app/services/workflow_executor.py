"""
Server-side workflow executor for shared (temp-user) workflow runs.

Executes a workflow graph on behalf of the owner using the Cloud Run service
account. Called from the /v1/shared/{token}/run endpoint.

Supported node types: prompt, imageInput, videoInput, generateImage,
generateVideo, llm, assetNode, imageOutput, videoOutput.
Unknown node types are treated as pass-throughs.

Input overrides: { node_id: value } where value is a string (text) or
base64 data URI (image/video) for exposed nodes.
"""
import asyncio
from collections import defaultdict, deque
from typing import Any
from app.logging_config import setup_logger
from app.services.generation import GenerationService
from app.chips import resolve_chips

logger = setup_logger(__name__)

# Service account placeholder user_id for library saves
SHARED_USER_ID = "shared_execution"

# Maximum poll time for video generation (seconds)
VIDEO_POLL_TIMEOUT = 600  # 10 minutes
VIDEO_POLL_INTERVAL = 10   # seconds between polls


def _topological_sort(nodes: list[dict], edges: list[dict]) -> list[str]:
    """
    Return node IDs in topological execution order (Kahn's algorithm).
    Disconnected nodes are appended at the end.
    """
    node_ids = {n["id"] for n in nodes}
    in_degree: dict[str, int] = {nid: 0 for nid in node_ids}
    adjacency: dict[str, list[str]] = defaultdict(list)

    for edge in edges:
        src = edge.get("source")
        tgt = edge.get("target")
        if src in node_ids and tgt in node_ids:
            adjacency[src].append(tgt)
            in_degree[tgt] += 1

    queue = deque(nid for nid, deg in in_degree.items() if deg == 0)
    order: list[str] = []

    while queue:
        nid = queue.popleft()
        order.append(nid)
        for neighbor in adjacency[nid]:
            in_degree[neighbor] -= 1
            if in_degree[neighbor] == 0:
                queue.append(neighbor)

    # Append any remaining nodes (cycles or isolated)
    for nid in node_ids:
        if nid not in order:
            order.append(nid)

    return order


def _collect_inputs(
    node_id: str,
    edges: list[dict],
    outputs: dict[str, dict[str, Any]],
) -> dict[str, Any]:
    """
    Build a { targetHandle: value } dict for a node by looking up
    the output values from upstream nodes connected via edges.
    """
    result: dict[str, Any] = {}
    for edge in edges:
        if edge.get("target") != node_id:
            continue
        src_node = edge.get("source")
        src_handle = edge.get("sourceHandle") or "output"
        tgt_handle = edge.get("targetHandle") or "input"
        if src_node in outputs and src_handle in outputs[src_node]:
            result[tgt_handle] = outputs[src_node][src_handle]
    return result


async def execute_workflow(
    workflow: dict,
    input_overrides: dict[str, Any],
    owner_uid: str = SHARED_USER_ID,
) -> list[str]:
    """
    Execute a workflow graph and return a list of final output URLs / data URIs.

    Args:
        workflow: Full workflow document (nodes + edges).
        input_overrides: { node_id: value } for exposed nodes.
        owner_uid: Firebase UID of the workflow owner (used for library saves).

    Returns:
        List of output URLs/data-URIs from leaf nodes.
    """
    nodes_by_id = {n["id"]: n for n in workflow.get("nodes", [])}
    edges = workflow.get("edges", [])
    node_list = list(nodes_by_id.values())

    order = _topological_sort(node_list, edges)
    outputs: dict[str, dict[str, Any]] = {}
    service = GenerationService()

    # Identify leaf nodes (no outgoing edges with a target that has a generation handler)
    nodes_with_outgoing = {e["source"] for e in edges if e.get("source") in nodes_by_id}

    for node_id in order:
        node = nodes_by_id.get(node_id)
        if not node:
            continue

        node_type = node.get("type", "")
        data = node.get("data", {})
        upstream = _collect_inputs(node_id, edges, outputs)

        logger.info(f"[executor] Running node {node_id} (type={node_type})")

        try:
            node_output = await _execute_node(
                node_id=node_id,
                node_type=node_type,
                data=data,
                upstream=upstream,
                input_overrides=input_overrides,
                service=service,
                owner_uid=owner_uid,
            )
        except Exception as e:
            logger.error(f"[executor] Node {node_id} ({node_type}) failed: {e}")
            raise RuntimeError(f"Node '{data.get('label', node_type)}' failed: {e}") from e

        outputs[node_id] = node_output

    # Collect outputs from leaf nodes (no outgoing edges)
    leaf_values: list[str] = []
    for node_id in order:
        node = nodes_by_id.get(node_id)
        if not node:
            continue
        if node_id in nodes_with_outgoing:
            continue
        node_type = node.get("type", "")
        # Skip purely decorative nodes
        if node_type in ("stickyNote", "download"):
            continue
        if node_id in outputs:
            for val in outputs[node_id].values():
                if isinstance(val, str) and val:
                    leaf_values.append(val)

    # If no leaf outputs, return the last generation node's output
    if not leaf_values:
        for node_id in reversed(order):
            node = nodes_by_id.get(node_id)
            if not node:
                continue
            if node_id in outputs:
                for val in outputs[node_id].values():
                    if isinstance(val, str) and val:
                        leaf_values.append(val)
                if leaf_values:
                    break

    return leaf_values


async def _execute_node(
    node_id: str,
    node_type: str,
    data: dict,
    upstream: dict[str, Any],
    input_overrides: dict[str, Any],
    service: GenerationService,
    owner_uid: str,
) -> dict[str, Any]:
    """Execute a single node and return its output handles dict."""

    override_value = input_overrides.get(node_id)

    # ── Input nodes ──────────────────────────────────────────────────────────

    if node_type == "prompt":
        text = override_value if override_value is not None else data.get("prompt", "")
        return {"text": text}

    if node_type == "imageInput":
        if override_value is not None:
            return {"image": override_value}
        # Use stored asset URL if available
        image_val = data.get("assetUrl") or data.get("imageUrl") or data.get("assetRef") or ""
        return {"image": image_val}

    if node_type == "videoInput":
        if override_value is not None:
            return {"video": override_value}
        video_val = data.get("assetUrl") or data.get("videoUrl") or data.get("assetRef") or ""
        return {"video": video_val}

    # assetNode — static asset reference
    if node_type == "assetNode":
        if override_value is not None:
            return {"image": override_value, "video": override_value}
        asset_type = data.get("assetType", "image")
        url = data.get("assetUrl") or data.get("imageUrl") or data.get("videoUrl") or ""
        return {asset_type: url}

    # ── Generation nodes ─────────────────────────────────────────────────────

    if node_type == "generateImage":
        prompt_text = upstream.get("prompt") or upstream.get("text") or data.get("prompt", "")
        prompt_text = resolve_chips(prompt_text)
        ref_images = None
        if "image" in upstream and upstream["image"]:
            ref_images = [upstream["image"]] if isinstance(upstream["image"], str) else upstream["image"]

        result = await service.generate_image(
            prompt=prompt_text,
            user_id=owner_uid,
            reference_images=ref_images,
            aspect_ratio=data.get("aspectRatio", "1:1"),
            resolution=data.get("resolution", "1K"),
        )
        image_data = result.images[0] if result.images else ""
        image_url = f"data:image/png;base64,{image_data}" if image_data and not image_data.startswith("data:") else image_data
        # Prefer saved URL if available
        if hasattr(result, "saved_asset_id") and result.saved_asset_id:
            from app.config import settings
            image_url = f"https://storage.googleapis.com/{settings.gcs_bucket}/images/{result.saved_asset_id}"
        return {"image": image_url}

    if node_type == "generateVideo":
        prompt_text = upstream.get("prompt") or upstream.get("text") or data.get("prompt", "")
        prompt_text = resolve_chips(prompt_text) if prompt_text else prompt_text
        first_frame = upstream.get("image") or upstream.get("firstFrame") or data.get("firstFrameUrl")
        last_frame = upstream.get("lastFrame") or data.get("lastFrameUrl")

        # Start async video generation
        video_start = await service.generate_video(
            prompt=prompt_text,
            user_id=owner_uid,
            first_frame=first_frame,
            last_frame=last_frame,
            aspect_ratio=data.get("aspectRatio", "16:9"),
            duration_seconds=data.get("durationSeconds", 8),
            generate_audio=data.get("generateAudio", True),
        )
        operation_name = video_start.get("operation_name", "")
        if not operation_name:
            raise ValueError("Video generation did not return an operation name")

        # Poll until complete
        elapsed = 0
        while elapsed < VIDEO_POLL_TIMEOUT:
            await asyncio.sleep(VIDEO_POLL_INTERVAL)
            elapsed += VIDEO_POLL_INTERVAL
            status = await service.check_video_status(
                operation_name=operation_name,
                user_id=owner_uid,
                prompt=prompt_text,
            )
            if status.status == "complete":
                video_url = status.video_url or ""
                if status.video_base64 and not video_url:
                    video_url = f"data:video/mp4;base64,{status.video_base64}"
                return {"video": video_url}
            logger.info(f"[executor] Video still processing (elapsed={elapsed}s)…")

        raise TimeoutError(f"Video generation timed out after {VIDEO_POLL_TIMEOUT}s")

    if node_type == "llm":
        prompt_text = upstream.get("prompt") or upstream.get("text") or data.get("prompt", "")
        system_prompt = data.get("systemPrompt") or data.get("system_prompt")
        context_text = upstream.get("context") or upstream.get("text2")
        result = await service.generate_text(
            prompt=resolve_chips(prompt_text),
            system_prompt=system_prompt,
            context=context_text,
            temperature=data.get("temperature", 0.7),
        )
        return {"text": result.response}

    # ── Output / pass-through nodes ──────────────────────────────────────────

    if node_type in ("imageOutput", "preview"):
        image_val = upstream.get("image") or upstream.get("video") or upstream.get("text") or ""
        return {"image": image_val}

    if node_type == "videoOutput":
        video_val = upstream.get("video") or upstream.get("image") or ""
        return {"video": video_val}

    if node_type == "textOutput":
        text_val = upstream.get("text") or ""
        return {"text": text_val}

    # ── Concatenation / modifier nodes ───────────────────────────────────────

    if node_type == "promptConcatenator":
        parts = [v for v in upstream.values() if isinstance(v, str)]
        separator = data.get("separator", " ")
        return {"text": separator.join(parts)}

    # Default pass-through: forward all upstream values
    if upstream:
        return dict(upstream)

    # Node has no upstream and no known handler: return empty
    return {}
