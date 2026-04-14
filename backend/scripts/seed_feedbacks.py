from __future__ import annotations

from datetime import datetime, timedelta, timezone
from pathlib import Path
from random import Random
import sys
from typing import Any
from urllib.parse import urlparse

if __package__ in {None, ""}:
    sys.path.append(str(Path(__file__).resolve().parents[1]))

from dotenv import load_dotenv
import os

from postgrest.exceptions import APIError

from core.database import get_supabase_admin, get_supabase_hostname, is_supabase_host_resolvable

try:
    import psycopg2
    from psycopg2.extras import Json
except ImportError:
    psycopg2 = None
    Json = None

DEPARTMENTS = [
    "Engineering",
    "Sales",
    "HR",
    "Design",
    "Finance",
    "Operations",
    "Marketing",
    "Product",
]

EMOTION_LEXICON = {
    "stress": ["stress", "overwhelmed", "unmanageable", "deadline", "pressure", "burnout", "9 pm", "exhaust"],
    "frustration": ["frustrated", "blocked", "approval", "slow", "stagnant", "bureaucracy", "rework"],
    "sarcasm": ["oh great", "just what i needed", "amazing", "interesting approach", "optional"],
    "support": ["supported", "heard", "helpful", "collaborative", "trust", "respect"],
    "growth": ["growth", "promotion", "career", "learning", "mentor"],
    "balance": ["work-life", "weekend", "late", "time off", "pto"],
}

THEME_KEYWORDS = {
    "workload": ["workload", "deadline", "pressure", "9 pm", "overtime", "capacity"],
    "management": ["manager", "leadership", "approval", "process", "decision"],
    "growth": ["promotion", "career", "learning", "mentor", "stagnant"],
    "culture": ["team", "culture", "collaboration", "respect", "inclusion"],
    "compensation": ["salary", "pay", "compensation", "raise"],
    "work_life": ["work-life", "weekend", "time off", "pto", "late"],
}


def _score_sentiment(text: str) -> float:
    lower = text.lower()
    positive_markers = [
        "supported",
        "helpful",
        "heard",
        "collaborative",
        "positive",
        "great mentorship",
        "respect",
        "improved",
        "appreciate",
        "promoted",
    ]
    negative_markers = [
        "overwhelmed",
        "stress",
        "frustrated",
        "unmanageable",
        "stagnant",
        "burnout",
        "late",
        "pressure",
        "without a salary",
        "6 approvals",
    ]
    score = 0.0
    for marker in positive_markers:
        if marker in lower:
            score += 0.22
    for marker in negative_markers:
        if marker in lower:
            score -= 0.24

    if any(marker in lower for marker in EMOTION_LEXICON["sarcasm"]):
        score -= 0.2

    return max(-1.0, min(1.0, round(score, 3)))


def _emotion_tags(text: str) -> dict[str, float | bool]:
    lower = text.lower()
    tags: dict[str, float | bool] = {}
    for emotion, keywords in EMOTION_LEXICON.items():
        hits = sum(1 for keyword in keywords if keyword in lower)
        if emotion == "sarcasm":
            tags["sarcasm_detected"] = hits > 0
            tags["sarcasm_confidence"] = round(min(1.0, hits * 0.35), 3)
        else:
            tags[emotion] = round(min(1.0, hits * 0.3), 3)
    return tags


def _themes(text: str) -> list[str]:
    lower = text.lower()
    picked: list[str] = []
    for theme, keywords in THEME_KEYWORDS.items():
        if any(keyword in lower for keyword in keywords):
            picked.append(theme)
    return picked[:4] if picked else ["general"]


def _make_feedback(
    employee_id: str,
    department: str,
    feedback_type: str,
    raw_text: str,
    submitted_at: datetime,
    *,
    is_anonymous: bool = False,
) -> dict[str, Any]:
    return {
        "employee_id": employee_id,
        "department": department,
        "feedback_type": feedback_type,
        "raw_text": raw_text,
        "submitted_at": submitted_at.isoformat(),
        "is_anonymous": is_anonymous,
        "sentiment_score": _score_sentiment(raw_text),
        "emotion_tags": _emotion_tags(raw_text),
        "themes": _themes(raw_text),
        "analyzed_at": None,
        "analyzed_by_ai": False,
    }


def build_feedback_rows() -> list[dict[str, Any]]:
    rnd = Random(42)
    now = datetime.now(timezone.utc)
    rows: list[dict[str, Any]] = []

    # Engineering: 8 (5 workload stress, 2 positive culture, 1 sarcastic process)
    engineering_texts = [
        "Workload has been unmanageable. I've been staying until 9 PM every day for three weeks.",
        "We are shipping too many priorities in parallel and the on-call load is exhausting.",
        "I am consistently firefighting production issues and cannot focus on strategic work.",
        "Deadlines keep moving up while headcount stays flat. Stress levels are very high.",
        "Our sprint goals exceed team capacity and burnout risk is rising fast.",
        "The team culture is strong and peers jump in quickly when someone is overloaded.",
        "I genuinely feel supported by my manager. The 1:1s are helpful and I feel heard.",
        "The new process is amazing. We now need 6 approvals to send one email.",
    ]
    for idx, text in enumerate(engineering_texts, start=1):
        rows.append(
            _make_feedback(
                f"NOVA-ENG{idx + 1:03d}",
                "Engineering",
                "pulse_survey" if idx <= 6 else "session_transcript",
                text,
                now - timedelta(days=rnd.randint(1, 70)),
            )
        )

    # Sales: 6 (mix pressure stress + 2 positive)
    sales_texts = [
        "Pipeline pressure is intense this quarter and I feel constant anxiety about targets.",
        "Customer escalations and quota pressure are colliding and morale is dropping.",
        "Weekly target revisions make planning difficult and stress is high.",
        "I appreciate the coaching from my manager; it helped me close deals with confidence.",
        "The team celebrates wins and shares playbooks openly, which keeps energy positive.",
        "I feel stretched by back-to-back calls and late follow-ups with global accounts.",
    ]
    for idx, text in enumerate(sales_texts, start=1):
        rows.append(
            _make_feedback(
                f"NOVA-SAL{idx + 1:03d}",
                "Sales",
                "pulse_survey",
                text,
                now - timedelta(days=rnd.randint(1, 80)),
            )
        )

    # HR: 5 mostly neutral/positive
    hr_texts = [
        "Most processes are stable and collaboration with talent acquisition has improved.",
        "The employee listening program is useful and response quality is improving.",
        "Workload is manageable, though reporting cycles can get intense at month end.",
        "I feel respected by leadership and appreciate clear communication on policy changes.",
        "Team support is strong and handoffs are smoother than last quarter.",
    ]
    for idx, text in enumerate(hr_texts, start=1):
        rows.append(
            _make_feedback(
                f"NOVA-HRD{idx + 1:03d}",
                "HR",
                "session_transcript" if idx == 3 else "pulse_survey",
                text,
                now - timedelta(days=rnd.randint(1, 65)),
            )
        )

    # Design: 6 creative frustration + manager praise
    design_texts = [
        "Frequent scope changes force multiple redesign cycles and creative focus gets fragmented.",
        "I need more uninterrupted time for deep design work; meetings are too frequent.",
        "Feedback arrives too late in the cycle and causes avoidable rework.",
        "My manager protects focus time well and gives constructive critiques.",
        "I appreciate the trust to explore concepts before narrowing direction.",
        "Cross-functional alignment has improved and design reviews feel more productive.",
    ]
    for idx, text in enumerate(design_texts, start=1):
        rows.append(
            _make_feedback(
                f"NOVA-DES{idx + 1:03d}",
                "Design",
                "pulse_survey",
                text,
                now - timedelta(days=rnd.randint(1, 60)),
            )
        )

    # Finance: 5 work-life balance concerns
    finance_texts = [
        "Month-end close repeatedly extends into late evenings and weekends.",
        "Work-life balance has slipped due to recurring audit requests.",
        "I am often online after hours to reconcile urgent reporting issues.",
        "The workload around compliance deadlines feels unsustainable.",
        "More predictable planning would reduce overtime during quarter close.",
    ]
    for idx, text in enumerate(finance_texts, start=1):
        rows.append(
            _make_feedback(
                f"NOVA-FIN{idx + 1:03d}",
                "Finance",
                "pulse_survey",
                text,
                now - timedelta(days=rnd.randint(1, 75)),
            )
        )

    # 5 exit interview style feedbacks (longer, candid)
    exit_texts = [
        "I'm leaving because the pace became unsustainable over the last two quarters. I enjoyed the people, but repeated late nights and shifting priorities made it hard to maintain health and family commitments.",
        "I appreciated the mission, but growth conversations stalled. I was asked to take on senior-level work without clear compensation progression, and I no longer saw a realistic path forward.",
        "Got promoted and given more responsibility without a salary conversation. Interesting approach.",
        "I'm sure the 'optional' team outing that managers track attendance for will be very relaxing.",
        "I learned a lot here, but inconsistent leadership communication created uncertainty that affected trust and long-term commitment.",
    ]
    exit_departments = ["Engineering", "Sales", "Design", "Product", "Operations"]
    for idx, text in enumerate(exit_texts, start=1):
        rows.append(
            _make_feedback(
                f"EXIT{idx:03d}",
                exit_departments[idx - 1],
                "exit_interview",
                text,
                now - timedelta(days=rnd.randint(1, 90)),
                is_anonymous=idx in {3, 4},
            )
        )

    # 5 peer reviews
    peer_texts = [
        "My teammate communicates clearly, but frequently appears overloaded and stressed during handoffs.",
        "Strong collaborator who mentors juniors well and improves team morale.",
        "Reliable delivery, though deadlines sometimes slip due to unclear upstream requirements.",
        "Very supportive in incidents and always stays calm under pressure.",
        "Could improve documentation quality; verbal updates are strong but written context is thin.",
    ]
    peer_departments = ["Engineering", "HR", "Sales", "Design", "Finance"]
    for idx, text in enumerate(peer_texts, start=1):
        rows.append(
            _make_feedback(
                f"PEER{idx:03d}",
                peer_departments[idx - 1],
                "peer_review",
                text,
                now - timedelta(days=rnd.randint(1, 50)),
                is_anonymous=idx in {2, 5},
            )
        )

    # Remaining 10 to reach 50 with mixed departments/sentiment and anonymous coverage
    remainder = [
        ("Operations", "pulse_survey", "Oh great, another all-hands meeting. Just what I needed on a Friday afternoon."),
        ("Marketing", "pulse_survey", "Campaign planning has become smoother and cross-team collaboration is improving."),
        ("Product", "session_transcript", "Roadmap churn is creating stress, but design and engineering partnership is improving."),
        ("Operations", "pulse_survey", "Process documentation improved this month and reduced confusion for new hires."),
        ("Marketing", "pulse_survey", "I'm frustrated by constant context switching between campaigns and urgent asks."),
        ("Product", "pulse_survey", "Decision-making feels slow because approvals are spread across too many stakeholders."),
        ("Engineering", "session_transcript", "I enjoy mentoring, but incident load has become difficult to sustain."),
        ("Sales", "pulse_survey", "Manager recognition has improved and the team feels more connected."),
        ("Design", "pulse_survey", "Creative quality improves when timelines include proper discovery."),
        ("Finance", "pulse_survey", "I need better workload balancing during close week to avoid burnout."),
    ]

    for idx, (dept, ftype, text) in enumerate(remainder, start=1):
        rows.append(
            _make_feedback(
                f"NOVA-OPS{idx:03d}",
                dept,
                ftype,
                text,
                now - timedelta(days=rnd.randint(1, 85)),
            )
        )

    # Enforce exactly 10 anonymous records with mixed sentiment.
    anonymous_indexes = {2, 7, 12, 16, 23, 31, 36, 41, 45, 49}
    for idx, row in enumerate(rows, start=1):
        row["is_anonymous"] = idx in anonymous_indexes
        if row["is_anonymous"]:
            row["employee_id"] = f"ANON{idx:03d}"

    if len(rows) != 50:
        raise ValueError(f"Expected 50 rows, got {len(rows)}")

    return rows


def _is_dns_connectivity_error(exc: Exception) -> bool:
    text = str(exc).lower()
    markers = (
        "getaddrinfo failed",
        "could not translate host name",
        "name or service not known",
        "temporary failure in name resolution",
        "nodename nor servname provided",
        "httpx.connecterror",
        "httpcore.connecterror",
        "connecterror",
        "errno 11001",
    )
    return any(marker in text for marker in markers)


def _dns_help_message(hostname: str) -> str:
    return (
        f"Unable to resolve Supabase host '{hostname}'. "
        "Fix local DNS first, then rerun the script. "
        "Recommended: set adapter DNS to 1.1.1.1 and 8.8.8.8, run 'ipconfig /flushdns', "
        "and verify with 'Resolve-DnsName <hostname>'."
    )


def seed_feedbacks() -> int:
    load_dotenv()
    supabase_host = get_supabase_hostname()
    if not is_supabase_host_resolvable():
        raise RuntimeError(_dns_help_message(supabase_host))

    supabase = get_supabase_admin()
    rows = build_feedback_rows()

    try:
        # Idempotent refresh for local/demo runs.
        supabase.table("employee_feedbacks").delete().neq("id", "00000000-0000-0000-0000-000000000000").execute()

        inserted = 0
        chunk_size = 25
        for start in range(0, len(rows), chunk_size):
            chunk = rows[start : start + chunk_size]
            response = supabase.table("employee_feedbacks").insert(chunk).execute()
            inserted += len(response.data or [])
        return inserted
    except APIError as exc:
        message = str(exc)
        if "PGRST205" not in message and "employee_feedbacks" not in message:
            if _is_dns_connectivity_error(exc):
                raise RuntimeError(_dns_help_message(supabase_host)) from exc
            raise

        if psycopg2 is None or Json is None:
            raise RuntimeError(
                "Supabase schema cache has not refreshed and psycopg2 fallback is unavailable."
            ) from exc

        supabase_url = os.getenv("SUPABASE_URL", "").strip()
        db_password = os.getenv("DATABASE_PASSWORD", "").strip().strip('"')
        if not supabase_url or not db_password:
            raise RuntimeError(
                "DATABASE_PASSWORD and SUPABASE_URL are required for direct seed fallback."
            ) from exc

        project_ref = urlparse(supabase_url).netloc.split(".")[0]
        db_host = f"db.{project_ref}.supabase.co"
        try:
            conn = psycopg2.connect(
                host=db_host,
                dbname="postgres",
                user="postgres",
                password=db_password,
                port=5432,
                sslmode="require",
            )
        except Exception as db_exc:
            if _is_dns_connectivity_error(db_exc):
                raise RuntimeError(_dns_help_message(db_host)) from db_exc
            raise
        try:
            with conn:
                with conn.cursor() as cur:
                    cur.execute("delete from public.employee_feedbacks")
                    for row in rows:
                        cur.execute(
                            """
                            insert into public.employee_feedbacks (
                                employee_id, submitted_at, feedback_type, raw_text,
                                department, is_anonymous, sentiment_score,
                                emotion_tags, themes, analyzed_at, analyzed_by_ai
                            ) values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                            """,
                            (
                                row["employee_id"],
                                row["submitted_at"],
                                row["feedback_type"],
                                row["raw_text"],
                                row["department"],
                                row["is_anonymous"],
                                row["sentiment_score"],
                                Json(row["emotion_tags"]),
                                Json(row["themes"]),
                                row["analyzed_at"],
                                row["analyzed_by_ai"],
                            ),
                        )
            return len(rows)
        finally:
            conn.close()
    except Exception as exc:
        if _is_dns_connectivity_error(exc):
            raise RuntimeError(_dns_help_message(supabase_host)) from exc
        raise


if __name__ == "__main__":
    count = seed_feedbacks()
    print(f"Seeded {count} employee feedback rows")
