"""
Apply the GitHub + JIRA integration database migration.

Run from the backend/ directory:
    python scripts/apply_github_jira_migration.py
"""

import os
import sys
from pathlib import Path

# Make sure we can import core modules
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

from core.database import get_supabase_admin


def main():
    sql_path = Path(__file__).resolve().parents[1] / "database" / "006_github_jira_integration.sql"
    if not sql_path.exists():
        print(f"Migration file not found: {sql_path}")
        sys.exit(1)

    sql = sql_path.read_text()
    sb = get_supabase_admin()

    # Split on semicolons and run each statement individually
    statements = [s.strip() for s in sql.split(";") if s.strip() and not s.strip().startswith("--")]

    print(f"Applying migration: {sql_path.name}")
    print(f"Statements to execute: {len(statements)}")

    errors = []
    for i, stmt in enumerate(statements, 1):
        try:
            sb.rpc("exec_sql", {"sql": stmt + ";"}).execute()
            print(f"  [{i}/{len(statements)}] OK")
        except Exception as exc:
            # Try using postgrest's direct query approach
            try:
                # Some Supabase setups need raw SQL via the REST API
                print(f"  [{i}/{len(statements)}] Note: {str(exc)[:80]}")
                errors.append((i, str(exc)))
            except Exception as exc2:
                print(f"  [{i}/{len(statements)}] FAILED: {exc2}")
                errors.append((i, str(exc2)))

    if errors:
        print(f"\n{len(errors)} statement(s) failed. This may be OK if the tables already exist.")
        print("\nIf tables don't exist yet, run the SQL directly in Supabase SQL Editor:")
        print(f"  {sql_path}")
    else:
        print("\nMigration complete.")


if __name__ == "__main__":
    main()
