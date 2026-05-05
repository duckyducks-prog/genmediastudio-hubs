"""
Smart Chips — resolves @token shorthand in prompts to full AI descriptions.

Chip categories: camera angles, camera movements, lighting, styles.
Characters and locations are handled separately by the Libraries feature.

Usage: call resolve_chips(prompt) in any generation endpoint before sending
the prompt to the AI model. Unknown @tokens are left unchanged.
"""
import re

CHIP_DEFINITIONS: dict[str, dict] = {
    # ── Camera angles ──────────────────────────────────────────────────────
    "ECU": {
        "description": "extreme close-up shot, camera fills the frame with a single detail such as the subject's eyes or hands",
        "category": "angle",
    },
    "CU": {
        "description": "close-up shot, subject's face fills the frame showing fine emotion and detail",
        "category": "angle",
    },
    "MCU": {
        "description": "medium close-up shot, framing from chest up, newsreader-style composition",
        "category": "angle",
    },
    "MS": {
        "description": "medium shot, framing from waist up, shows the subject and immediate environment",
        "category": "angle",
    },
    "LS": {
        "description": "long shot, full body visible, environment is prominent in the frame",
        "category": "angle",
    },
    "ELS": {
        "description": "extreme long shot, subject appears small within a vast environment",
        "category": "angle",
    },
    "OTS": {
        "description": "over-the-shoulder shot, camera positioned behind one character looking toward another",
        "category": "angle",
    },
    "POV": {
        "description": "point-of-view shot, camera represents a character's first-person perspective",
        "category": "angle",
    },
    "DutchAngle": {
        "description": "dutch angle shot, camera tilted on its axis creating psychological tension",
        "category": "angle",
    },
    "BirdsEye": {
        "description": "bird's-eye view, camera directly overhead looking straight down at the subject",
        "category": "angle",
    },
    "WormEye": {
        "description": "worm's-eye view, camera looking upward from ground level",
        "category": "angle",
    },
    # ── Camera movements ───────────────────────────────────────────────────
    "DollyIn": {
        "description": "dolly-in camera movement, camera physically moves forward toward the subject creating an intimate closing effect",
        "category": "movement",
    },
    "DollyOut": {
        "description": "dolly-out camera movement, camera physically pulls back away from the subject revealing the environment",
        "category": "movement",
    },
    "PanLeft": {
        "description": "pan left camera movement, camera rotates horizontally to the left on a fixed axis",
        "category": "movement",
    },
    "PanRight": {
        "description": "pan right camera movement, camera rotates horizontally to the right on a fixed axis",
        "category": "movement",
    },
    "TiltUp": {
        "description": "tilt up camera movement, camera rotates vertically upward on a fixed axis",
        "category": "movement",
    },
    "TiltDown": {
        "description": "tilt down camera movement, camera rotates vertically downward on a fixed axis",
        "category": "movement",
    },
    "Tracking": {
        "description": "tracking shot, camera moves laterally alongside the subject maintaining consistent framing",
        "category": "movement",
    },
    "Handheld": {
        "description": "handheld camera movement, slight organic shake and drift giving an immediate documentary feel",
        "category": "movement",
    },
    "Crane": {
        "description": "crane shot, camera rises or descends dramatically on a vertical arc revealing scale",
        "category": "movement",
    },
    "Orbit": {
        "description": "orbit camera movement, camera circles around the subject in an arc",
        "category": "movement",
    },
    "ZoomIn": {
        "description": "zoom in, lens focal length increases bringing the subject closer without camera movement",
        "category": "movement",
    },
    "ZoomOut": {
        "description": "zoom out, lens focal length decreases revealing more of the scene",
        "category": "movement",
    },
    # ── Lighting ───────────────────────────────────────────────────────────
    "GoldenHour": {
        "description": "golden hour lighting, warm orange and amber tones, long soft shadows",
        "category": "lighting",
    },
    "BlueHour": {
        "description": "blue hour twilight lighting, cool blue tones, soft diffused ambient light",
        "category": "lighting",
    },
    "Neon": {
        "description": "neon-lit environment, vibrant colored light reflections, cyberpunk atmosphere",
        "category": "lighting",
    },
    "Hardlight": {
        "description": "hard directional lighting, strong contrast, sharp defined shadows",
        "category": "lighting",
    },
    "Softlight": {
        "description": "soft diffused lighting, minimal shadows, flattering and even illumination",
        "category": "lighting",
    },
    "Backlit": {
        "description": "backlit subject, strong light source behind creating silhouette or rim lighting effect",
        "category": "lighting",
    },
    "Practical": {
        "description": "practical lighting only, illuminated by light sources visible within the scene such as lamps and screens",
        "category": "lighting",
    },
    # ── Visual styles ──────────────────────────────────────────────────────
    "Cinematic": {
        "description": "cinematic film look, shallow depth of field, anamorphic lens characteristics, subtle film grain",
        "category": "style",
    },
    "Documentary": {
        "description": "documentary style, naturalistic lighting, handheld feel, observational and unposed",
        "category": "style",
    },
    "Commercial": {
        "description": "commercial advertising style, polished and clean, bright even lighting, high production value",
        "category": "style",
    },
    "Noir": {
        "description": "film noir style, high contrast black and white tones, dramatic shadows, moody atmosphere",
        "category": "style",
    },
    "Drone": {
        "description": "aerial drone footage perspective, high altitude overhead or diagonal view of the landscape below",
        "category": "style",
    },
    "SlowMo": {
        "description": "slow motion footage, dramatically reduced playback speed highlighting movement details",
        "category": "style",
    },
}


def resolve_chips(prompt: str) -> str:
    """Replace @ChipName tokens in a prompt with their full descriptions."""
    if not prompt or "@" not in prompt:
        return prompt

    def replacer(match: re.Match) -> str:
        chip_id = match.group(1)
        chip = CHIP_DEFINITIONS.get(chip_id)
        return chip["description"] if chip else match.group(0)

    return re.sub(r"@(\w+)", replacer, prompt)


def get_chip_list() -> list[dict]:
    """Return chip metadata for the frontend dropdown (no descriptions)."""
    return [
        {"id": chip_id, "category": chip["category"]}
        for chip_id, chip in CHIP_DEFINITIONS.items()
    ]
