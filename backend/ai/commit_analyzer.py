"""
Commit Analyzer for NOVA

Uses Groq LLM to:
1. Summarise what a commit does
2. Extract skills demonstrated
3. Rate code quality (score 0-100, label good/neutral/poor)
4. Assess complexity and business impact
"""

from __future__ import annotations

import json
import logging
from typing import Any

from ai.groq_client import groq_chat

logger = logging.getLogger(__name__)


async def analyze_commit(
    commit_message: str,
    diff_content: str,
    repository: str,
) -> dict[str, Any]:
    """
    Full AI analysis of a commit diff.

    Returns:
        {
            summary: str,
            skills_demonstrated: list[str],
            code_quality_score: float,   # 0-100
            code_quality_label: str,     # 'good' | 'neutral' | 'poor'
            complexity: str,             # 'low' | 'medium' | 'high'
            impact: str,                 # 'minor' | 'moderate' | 'significant'
            quality_reasoning: str,
        }
    """
    diff_preview = diff_content[:3000] + "...[truncated]" if len(diff_content) > 3000 else diff_content

    prompt = f"""You are a senior staff engineer reviewing a git commit. Evaluate it honestly and critically.

Repository: {repository}
Commit Message: {commit_message}

Diff:
{diff_preview}

Your job is to:
1. Write a concise summary (1-2 sentences) of what was accomplished.
2. List 3-7 specific technical skills demonstrated (e.g. "React hooks", "PostgreSQL indexing", "async Python", "REST API design").
3. Rate the CODE QUALITY on a scale of 0-100:
   - 90-100: Excellent — clean, well-structured, production-ready
   - 70-89: Good — solid work with minor issues
   - 50-69: Neutral — functional but has room for improvement
   - 30-49: Poor — notable issues: magic numbers, no error handling, messy structure
   - 0-29: Bad — broken patterns, security holes, or destructive changes
4. Label it: "good" (score >= 70), "neutral" (score 50-69), or "poor" (score < 50).
5. Assess complexity: "low", "medium", or "high".
6. Assess business impact: "minor", "moderate", or "significant".
7. Write 1-2 sentences explaining the quality score.

Respond with ONLY valid JSON:
{{
    "summary": "...",
    "skills_demonstrated": ["...", "..."],
    "code_quality_score": 75.0,
    "code_quality_label": "good",
    "complexity": "medium",
    "impact": "moderate",
    "quality_reasoning": "..."
}}"""

    try:
        response = await groq_chat(
            messages=[{"role": "user", "content": prompt}],
            temperature=0.2,
            max_tokens=600,
        )
        content = response.choices[0].message.content.strip()
        start = content.find("{")
        end = content.rfind("}") + 1
        if start != -1 and end > start:
            result = json.loads(content[start:end])
            # Normalise
            score = float(result.get("code_quality_score", 50.0))
            label = result.get("code_quality_label", "neutral").lower()
            if label not in ("good", "neutral", "poor"):
                label = "good" if score >= 70 else ("neutral" if score >= 50 else "poor")
            return {
                "summary": str(result.get("summary", commit_message)),
                "skills_demonstrated": [str(s) for s in result.get("skills_demonstrated", [])],
                "code_quality_score": min(100.0, max(0.0, score)),
                "code_quality_label": label,
                "complexity": str(result.get("complexity", "low")).lower(),
                "impact": str(result.get("impact", "minor")).lower(),
                "quality_reasoning": str(result.get("quality_reasoning", "")),
            }
    except Exception as exc:
        logger.warning("Commit analysis LLM call failed: %s", exc)

    # Fallback — keyword heuristics
    skills = _extract_skills_heuristic(commit_message, diff_content)
    return {
        "summary": commit_message or "Code changes",
        "skills_demonstrated": skills,
        "code_quality_score": 50.0,
        "code_quality_label": "neutral",
        "complexity": "low",
        "impact": "minor",
        "quality_reasoning": "Automated fallback — LLM unavailable.",
    }


def _extract_skills_heuristic(message: str, diff: str) -> list[str]:
    text = f"{message} {diff}".lower()
    skill_map = {
        "python": "Python", "javascript": "JavaScript", "typescript": "TypeScript",
        "java": "Java", "go ": "Go", "rust": "Rust", "react": "React",
        "fastapi": "FastAPI", "django": "Django", "flask": "Flask",
        "node": "Node.js", "express": "Express.js", "nextjs": "Next.js",
        "postgres": "PostgreSQL", "mysql": "MySQL", "mongodb": "MongoDB",
        "redis": "Redis", "docker": "Docker", "kubernetes": "Kubernetes",
        "aws": "AWS", "terraform": "Terraform", "sql": "SQL",
        "graphql": "GraphQL", "rest api": "REST API", "grpc": "gRPC",
        "tailwind": "Tailwind CSS", "css": "CSS", "html": "HTML",
    }
    found = [v for k, v in skill_map.items() if k in text]
    return found[:6] if found else ["Software Development"]
