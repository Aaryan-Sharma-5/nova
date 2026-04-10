from __future__ import annotations

import json
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException

from api.deps import require_role
from core.config import settings
from models.user import User, UserRole

router = APIRouter(prefix="/api/benchmarks", tags=["Benchmarks"])


def _load_benchmarks() -> list[dict]:
    benchmarks_path = Path(__file__).resolve().parents[2] / "data" / "industry_benchmarks.json"
    if not benchmarks_path.exists():
        return []
    return json.loads(benchmarks_path.read_text(encoding="utf-8"))


@router.get("/{sector}")
async def get_sector_benchmark(
    sector: str,
    _current_user: User = Depends(require_role([UserRole.MANAGER, UserRole.HR, UserRole.LEADERSHIP])),
) -> dict:
    rows = _load_benchmarks()
    sector_lower = sector.strip().lower()
    for row in rows:
        if str(row.get("sector", "")).lower() == sector_lower:
            return {
                **row,
                "note": "Benchmarks are simulated industry medians for demonstration purposes",
            }
    raise HTTPException(status_code=404, detail=f"No benchmark found for sector '{sector}'")


@router.get("/current/org")
async def get_current_org_benchmark(
    _current_user: User = Depends(require_role([UserRole.MANAGER, UserRole.HR, UserRole.LEADERSHIP])),
) -> dict:
    rows = _load_benchmarks()
    sector_lower = settings.ORG_SECTOR.strip().lower()
    selected = next((row for row in rows if str(row.get("sector", "")).lower() == sector_lower), None)
    if selected:
        return {
            "org_sector": settings.ORG_SECTOR,
            **selected,
            "note": "Benchmarks are simulated industry medians for demonstration purposes",
        }
    return {
        "org_sector": settings.ORG_SECTOR,
        "note": "Benchmarks are simulated industry medians for demonstration purposes",
    }
