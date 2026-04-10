"""Session recording analysis pipeline for mandatory feedback sessions."""

from __future__ import annotations

import json
import re
from typing import Any

from ai.groq_client import get_groq_client, groq_chat


async def transcribe_session(audio_blob: bytes) -> str:
    """Transcribe session audio via Groq Whisper-compatible endpoint."""
    if not audio_blob:
        return ""

    client = get_groq_client()
    try:
        response = client.audio.transcriptions.create(
            model="whisper-large-v3",
            file=("session.webm", audio_blob),
            response_format="verbose_json",
        )
        text = getattr(response, "text", None)
        if isinstance(text, str) and text.strip():
            return text.strip()
    except Exception:
        pass

    # Fallback for local/dev when transcription is unavailable.
    try:
        return audio_blob.decode("utf-8", errors="ignore").strip()[:4000]
    except Exception:
        return ""


def _extract_json(raw: str) -> dict[str, Any] | None:
    try:
        parsed = json.loads(raw)
        return parsed if isinstance(parsed, dict) else None
    except json.JSONDecodeError:
        pass

    match = re.search(r"\{[\s\S]*\}", raw)
    if not match:
        return None

    try:
        parsed = json.loads(match.group(0))
        return parsed if isinstance(parsed, dict) else None
    except json.JSONDecodeError:
        return None


async def analyze_session_emotion(transcript: str) -> dict[str, Any]:
    """Analyze transcript emotion and risk markers using Groq LLM."""
    if not transcript.strip():
        return {
            "overall_sentiment": "neutral",
            "stress_indicators": [],
            "hesitation_count": 0,
            "hesitation_markers": [],
            "key_themes": [],
            "red_flags": [],
            "confidence_score": 0.0,
            "valence": 0.0,
            "stress_level": 0.0,
            "timeline": [],
        }

    prompt = (
        "You are an HR interview analyzer. Return ONLY JSON with keys: "
        "overall_sentiment (positive|neutral|negative), stress_indicators (string[]), "
        "hesitation_count (int), hesitation_markers (string[]), key_themes (string[]), "
        "red_flags (string[]), confidence_score (0..1), valence (-1..1), stress_level (0..1), "
        "timeline ([{segment:string, stress:0..1, confidence:0..1}])."
    )

    try:
        response = await groq_chat(
            messages=[
                {"role": "system", "content": prompt},
                {"role": "user", "content": transcript[:12000]},
            ],
            temperature=0.2,
            max_tokens=700,
        )
        raw = response.choices[0].message.content if response and response.choices else ""
        payload = _extract_json(raw) or {}
    except Exception:
        payload = {}

    hesitation_markers = payload.get("hesitation_markers")
    if not isinstance(hesitation_markers, list):
        hesitation_markers = [w for w in ["um", "i guess", "maybe"] if w in transcript.lower()]

    timeline = payload.get("timeline")
    if not isinstance(timeline, list) or not timeline:
        timeline = [
            {"segment": "start", "stress": 0.35, "confidence": 0.55},
            {"segment": "middle", "stress": 0.45, "confidence": 0.5},
            {"segment": "end", "stress": 0.4, "confidence": 0.58},
        ]

    def _num(value: Any, default: float, minimum: float, maximum: float) -> float:
        try:
            v = float(value)
        except (TypeError, ValueError):
            v = default
        return max(minimum, min(maximum, v))

    return {
        "overall_sentiment": str(payload.get("overall_sentiment", "neutral")),
        "stress_indicators": payload.get("stress_indicators", []),
        "hesitation_count": int(payload.get("hesitation_count", len(hesitation_markers))),
        "hesitation_markers": hesitation_markers,
        "key_themes": payload.get("key_themes", []),
        "red_flags": payload.get("red_flags", []),
        "confidence_score": _num(payload.get("confidence_score"), 0.5, 0.0, 1.0),
        "valence": _num(payload.get("valence"), 0.0, -1.0, 1.0),
        "stress_level": _num(payload.get("stress_level"), 0.5, 0.0, 1.0),
        "timeline": timeline,
    }


def derive_scores(emotion_analysis: dict[str, Any], transcript: str) -> dict[str, float]:
    """Map emotion analysis to NOVA's 4 standard normalized scores."""
    text = transcript.lower()

    valence = float(emotion_analysis.get("valence", 0.0))
    stress = float(emotion_analysis.get("stress_level", 0.5))
    hesitation_count = int(emotion_analysis.get("hesitation_count", 0))
    confidence = float(emotion_analysis.get("confidence_score", 0.5))

    workload_sentiment = max(0.0, min(1.0, 0.6 - (0.45 * stress) + (0.2 * valence)))

    manager_penalty = 0.18 if "manager" in text and any(
        kw in text for kw in ("difficult", "micromanage", "unsupported", "ignored")
    ) else 0.0
    manager_relationship = max(0.0, min(1.0, 0.65 + (0.2 * valence) - manager_penalty - (0.08 * stress)))

    team_penalty = 0.2 if any(kw in text for kw in ("team conflict", "isolated", "no collaboration")) else 0.0
    team_dynamics = max(0.0, min(1.0, 0.62 + (0.15 * valence) - team_penalty - (0.05 * hesitation_count)))

    growth_penalty = 0.2 if any(kw in text for kw in ("stagnant", "no growth", "no support", "promotion")) else 0.0
    growth_satisfaction = max(0.0, min(1.0, 0.6 + (0.22 * valence) - growth_penalty - (0.1 * (1 - confidence))))

    return {
        "workload_sentiment": round(workload_sentiment, 3),
        "manager_relationship": round(manager_relationship, 3),
        "team_dynamics": round(team_dynamics, 3),
        "growth_satisfaction": round(growth_satisfaction, 3),
    }


async def generate_hr_summary(transcript: str, emotion_analysis: dict[str, Any]) -> str:
    """Generate a plain English 3-sentence HR reviewer summary."""
    prompt = (
        "Write exactly 3 sentences for an HR reviewer. Keep it factual and neutral. "
        "Mention sentiment, stress indicators, and one recommended follow-up."
    )

    try:
        response = await groq_chat(
            messages=[
                {"role": "system", "content": prompt},
                {
                    "role": "user",
                    "content": json.dumps(
                        {
                            "transcript_excerpt": transcript[:8000],
                            "emotion_analysis": emotion_analysis,
                        }
                    ),
                },
            ],
            temperature=0.2,
            max_tokens=220,
        )
        content = response.choices[0].message.content if response and response.choices else ""
        summary = (content or "").strip()
        if summary:
            return summary
    except Exception:
        pass

    sentiment = emotion_analysis.get("overall_sentiment", "neutral")
    stress_level = float(emotion_analysis.get("stress_level", 0.5))
    flags = emotion_analysis.get("red_flags", [])
    flag_text = ", ".join(flags[:2]) if isinstance(flags, list) and flags else "no major red flags"
    return (
        f"Session tone appears {sentiment} with observed stress level {stress_level:.2f}. "
        f"Key risk markers include {flag_text}. "
        "Recommended follow-up is a structured HR check-in and manager alignment conversation within one week."
    )
