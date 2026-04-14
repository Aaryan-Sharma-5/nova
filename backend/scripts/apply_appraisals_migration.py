from __future__ import annotations

import os
from pathlib import Path
from urllib.parse import urlparse

from dotenv import load_dotenv

try:
    import psycopg2
except ImportError as exc:  # pragma: no cover
    raise SystemExit(
        "psycopg2 is required. Install dependencies first: pip install -r backend/requirements.txt"
    ) from exc


def _resolve_project_ref(supabase_url: str) -> str:
    parsed = urlparse(supabase_url)
    host = parsed.netloc
    if not host:
        raise ValueError("SUPABASE_URL is missing or invalid")
    return host.split(".")[0]


def _build_connection_kwargs() -> dict[str, str | int]:
    supabase_url = os.getenv("SUPABASE_URL", "").strip()
    db_password = os.getenv("DATABASE_PASSWORD", "").strip().strip('"')

    if not supabase_url:
        raise ValueError("SUPABASE_URL is required in backend/.env")
    if not db_password:
        raise ValueError("DATABASE_PASSWORD is required in backend/.env")

    project_ref = _resolve_project_ref(supabase_url)

    return {
        "host": f"db.{project_ref}.supabase.co",
        "dbname": "postgres",
        "user": "postgres",
        "password": db_password,
        "port": 5432,
        "sslmode": "require",
    }


def main() -> None:
    backend_dir = Path(__file__).resolve().parents[1]
    load_dotenv(backend_dir / ".env")

    sql_path = backend_dir / "database" / "005_appraisals.sql"
    if not sql_path.exists():
        raise FileNotFoundError(f"Migration SQL not found: {sql_path}")

    sql = sql_path.read_text(encoding="utf-8")
    conn_kwargs = _build_connection_kwargs()

    with psycopg2.connect(**conn_kwargs) as conn:
        with conn.cursor() as cur:
            cur.execute(sql)
            cur.execute("NOTIFY pgrst, 'reload schema';")
        conn.commit()

    print("005_appraisals migration applied successfully")


if __name__ == "__main__":
    main()
