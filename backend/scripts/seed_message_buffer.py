"""
Seed the message_buffer table from sample_messages.txt for demo/testing.
Run from backend/: python scripts/seed_message_buffer.py

This simulates what Composio webhooks would insert in production.
After seeding, the 2-minute scheduler job will process them automatically.
"""
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from dotenv import load_dotenv
load_dotenv()

from core.database import get_supabase_admin

SAMPLE_FILE = Path(__file__).resolve().parent.parent.parent / "sample_messages.txt"
ORG_ID = "demo-org"


def main() -> None:
    sb = get_supabase_admin()
    rows = []

    for line in SAMPLE_FILE.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if "|" not in line:
            continue
        email, text = line.split("|", 1)
        email = email.strip()
        text = text.strip()
        if email and text:
            rows.append({
                "org_id": ORG_ID,
                "employee_email": email,
                "source": "slack",
                "message_text": text,
            })

    if not rows:
        print("No messages found in sample_messages.txt")
        return

    sb.table("message_buffer").insert(rows).execute()
    print(f"Seeded {len(rows)} messages into message_buffer for org={ORG_ID}")
    print("The 2-minute sentiment job will process them automatically.")
    print("Check external_signals table for results after ~2 minutes.")


if __name__ == "__main__":
    main()
