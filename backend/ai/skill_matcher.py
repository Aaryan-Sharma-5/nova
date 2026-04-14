"""
Skill Matcher for NOVA

Matches JIRA task requirements to employees using:
1. Hash-based cosine-similarity embeddings (no external API needed)
2. Groq LLM for final candidate evaluation and reasoning

Also generates job postings when no suitable candidate is found.
"""

from __future__ import annotations

import hashlib
import json
import logging
from typing import Any

import numpy as np

from ai.groq_client import groq_chat

logger = logging.getLogger(__name__)

EMBEDDING_DIM = 512  # Smaller than coreinsights — faster, still effective


# ── Embeddings ────────────────────────────────────────────────────────────────

def _embed(text: str) -> list[float]:
    """Deterministic hash-based embedding (no external API required)."""
    if not text or not text.strip():
        return [0.0] * EMBEDDING_DIM

    normalized = text.lower().strip()
    vec: list[float] = []
    for i in range(EMBEDDING_DIM):
        seed = f"{normalized}:{i}"
        digest = hashlib.sha256(seed.encode()).digest()
        val = (digest[i % len(digest)] / 127.5) - 1.0
        vec.append(val)

    arr = np.array(vec, dtype=float)
    norm = np.linalg.norm(arr)
    if norm > 0:
        arr = arr / norm
    return arr.tolist()


def _cosine(a: list[float], b: list[float]) -> float:
    if not a or not b:
        return 0.0
    try:
        length = max(len(a), len(b))
        va = np.zeros(length)
        vb = np.zeros(length)
        va[: len(a)] = a
        vb[: len(b)] = b
        denom = np.linalg.norm(va) * np.linalg.norm(vb)
        return float(np.dot(va, vb) / denom) if denom > 0 else 0.0
    except Exception:
        return 0.0


# ── Skill extraction from JIRA issue ──────────────────────────────────────────

async def extract_required_skills(
    issue_title: str,
    issue_description: str,
    project_name: str,
) -> list[str]:
    """Use Groq to extract required skills from a JIRA issue."""
    prompt = f"""You are a technical recruiter reading a software task.

Project: {project_name}
Task: {issue_title}
Description: {issue_description or "No description provided"}

List 3-7 specific technical skills needed to complete this task.
Return ONLY a JSON array, e.g.: ["Python", "FastAPI", "PostgreSQL"]"""

    try:
        response = await groq_chat(
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3,
            max_tokens=200,
        )
        content = response.choices[0].message.content.strip()
        start = content.find("[")
        end = content.rfind("]") + 1
        if start != -1 and end > start:
            skills = json.loads(content[start:end])
            if isinstance(skills, list) and skills:
                return [str(s).strip() for s in skills if s]
    except Exception as exc:
        logger.warning("Skill extraction failed: %s", exc)

    return _heuristic_skills(issue_title, issue_description)


def _heuristic_skills(title: str, desc: str) -> list[str]:
    text = f"{title} {desc}".lower()
    skill_map = {
        "python": "Python", "javascript": "JavaScript", "typescript": "TypeScript",
        "react": "React", "fastapi": "FastAPI", "django": "Django",
        "node": "Node.js", "sql": "SQL", "postgres": "PostgreSQL",
        "docker": "Docker", "api": "API Development", "frontend": "Frontend",
        "backend": "Backend", "database": "Database Design",
    }
    found = [v for k, v in skill_map.items() if k in text]
    return found[:5] if found else ["Software Development"]


# ── Candidate matching ────────────────────────────────────────────────────────

def find_matching_employees(
    required_skills: list[str],
    task_description: str,
    employees: list[dict[str, Any]],
    top_n: int = 5,
) -> list[dict[str, Any]]:
    """
    Score every employee against the task.

    employees: list of dicts with keys:
        email, full_name, skills (list[str]), skill_embeddings (list[float]),
        avg_code_quality (float), total_commits (int)

    Returns top_n employees with added match_score, sorted descending.
    """
    if not employees:
        return []

    task_skills_text = ", ".join(required_skills)
    task_emb = _embed(task_skills_text)
    task_desc_emb = _embed(task_description)

    scored: list[dict[str, Any]] = []
    for emp in employees:
        emp_skills = emp.get("skills") or []
        emp_skill_emb = emp.get("skill_embeddings") or []
        emp_profile_emb = emp.get("skill_embeddings") or []  # same store

        # Skill text similarity
        skill_text = ", ".join(emp_skills)
        emp_skill_computed = _embed(skill_text) if emp_skills else [0.0] * EMBEDDING_DIM
        skill_sim = _cosine(task_emb, emp_skill_computed if not emp_skill_emb else emp_skill_emb)

        # Profile / description similarity
        profile_sim = _cosine(task_desc_emb, emp_profile_emb)

        # Code quality bonus (0-10 points on top of 0-1 score → scale to 0-0.1)
        quality_bonus = (float(emp.get("avg_code_quality", 50.0)) / 1000.0)

        combined = (skill_sim * 0.65) + (profile_sim * 0.25) + quality_bonus

        scored.append({
            **emp,
            "match_score": min(1.0, combined),
            "skill_similarity": skill_sim,
            "profile_similarity": profile_sim,
        })

    scored.sort(key=lambda x: x["match_score"], reverse=True)
    return scored[:top_n]


# ── LLM candidate evaluation ──────────────────────────────────────────────────

async def evaluate_best_candidate(
    candidates: list[dict[str, Any]],
    task_title: str,
    task_description: str,
    required_skills: list[str],
) -> dict[str, Any]:
    """
    Ask Groq to pick the best candidate (or None if all are unqualified).

    Returns:
        { selected_email, selected_name, confidence, reasoning }
    """
    if not candidates:
        return {"selected_email": None, "selected_name": None, "confidence": 0.0, "reasoning": "No candidates available."}

    candidate_block = ""
    for i, c in enumerate(candidates, 1):
        candidate_block += (
            f"\nCandidate {i}:\n"
            f"  Email: {c.get('employee_email', c.get('email', ''))}\n"
            f"  Name: {c.get('full_name', c.get('recommended_assignee_name', ''))}\n"
            f"  Skills: {', '.join(c.get('skills') or [])}\n"
            f"  Avg Code Quality: {c.get('avg_code_quality', 50):.0f}/100\n"
            f"  Total Commits: {c.get('total_commits', 0)}\n"
            f"  Match Score: {c.get('match_score', 0):.2f}\n"
        )

    prompt = f"""You are a strict technical manager assigning a JIRA task to the best available developer.

Task: {task_title}
Description: {task_description or "No description provided"}
Required Skills: {', '.join(required_skills)}

Available candidates (ranked by vector match):
{candidate_block}

Pick the ONE best candidate who can clearly handle this task.
IMPORTANT: If no candidate is qualified enough, select "none" — it is better to hire externally than to assign the wrong person.

Return ONLY valid JSON:
{{
    "selected_email": "email@company.com" or null,
    "selected_name": "Full Name" or null,
    "confidence": 0.85,
    "reasoning": "Why this person was chosen (or why all were rejected)."
}}"""

    try:
        response = await groq_chat(
            messages=[{"role": "user", "content": prompt}],
            temperature=0.2,
            max_tokens=400,
        )
        content = response.choices[0].message.content.strip()
        start = content.find("{")
        end = content.rfind("}") + 1
        if start != -1 and end > start:
            result = json.loads(content[start:end])
            return {
                "selected_email": result.get("selected_email"),
                "selected_name": result.get("selected_name"),
                "confidence": float(result.get("confidence", 0.0)),
                "reasoning": str(result.get("reasoning", "")),
            }
    except Exception as exc:
        logger.warning("Candidate evaluation failed: %s", exc)

    # Fallback: pick highest match score if > 0.6
    best = candidates[0] if candidates else None
    if best and best.get("match_score", 0) > 0.6:
        return {
            "selected_email": best.get("employee_email", best.get("email")),
            "selected_name": best.get("full_name"),
            "confidence": best["match_score"],
            "reasoning": f"Fallback selection based on {best['match_score']:.0%} vector match score.",
        }
    return {
        "selected_email": None,
        "selected_name": None,
        "confidence": 0.0,
        "reasoning": "No candidate met the minimum qualification threshold.",
    }


# ── Job posting generation ────────────────────────────────────────────────────

async def generate_job_posting(
    task_title: str,
    task_description: str,
    required_skills: list[str],
    rejection_reason: str = "",
) -> dict[str, Any]:
    """
    Generate a job posting when no matching employee is found or HR rejects all candidates.

    Returns:
        { title, description (HTML), required_skills, reasoning }
    """
    context = f"\nRejection reason: {rejection_reason}" if rejection_reason else ""

    prompt = f"""You are an expert technical recruiter writing a job posting for a role that needs to be filled urgently.

The engineering team has a task that no current employee can handle:
Task: {task_title}
Description: {task_description or "No description provided"}
Required Skills: {', '.join(required_skills)}{context}

Write a professional job posting.
Return ONLY valid JSON:
{{
    "title": "Concise job title (e.g., Senior Python Engineer)",
    "description": "<h2>About the Role</h2><p>...</p><h2>Responsibilities</h2><ul><li>...</li></ul><h2>Requirements</h2><ul><li>...</li></ul><h2>Nice to Have</h2><ul><li>...</li></ul>",
    "reasoning": "1-2 sentences on why this hire is needed."
}}"""

    try:
        response = await groq_chat(
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3,
            max_tokens=800,
        )
        content = response.choices[0].message.content.strip()
        start = content.find("{")
        end = content.rfind("}") + 1
        if start != -1 and end > start:
            result = json.loads(content[start:end])
            return {
                "title": str(result.get("title", f"Developer – {required_skills[0] if required_skills else 'General'}")),
                "description": str(result.get("description", _fallback_jd(task_title, required_skills))),
                "reasoning": str(result.get("reasoning", "")),
            }
    except Exception as exc:
        logger.warning("Job posting generation failed: %s", exc)

    return {
        "title": f"Developer – {required_skills[0] if required_skills else task_title}",
        "description": _fallback_jd(task_title, required_skills),
        "reasoning": "No matching employee found for the required skill set.",
    }


def _fallback_jd(title: str, skills: list[str]) -> str:
    items = "".join(f"<li>{s}</li>" for s in skills)
    return (
        f"<h2>About the Role</h2><p>We are looking for a skilled developer to help with: {title}.</p>"
        f"<h2>Requirements</h2><ul>{items}<li>Strong communication skills</li></ul>"
        f"<h2>Nice to Have</h2><ul><li>Agile / Scrum experience</li></ul>"
    )
