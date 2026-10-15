from datetime import timedelta
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from core import db, now, out, oid, current_user, require_admin, audit, get_settings
from leads import editor_profile, STAGES, TERMINAL
from llm import BUILTIN_MODELS, DEFAULT_MODEL, TASKS

router = APIRouter(prefix="/api")
LANGUAGES = ["Bangla", "English", "Hindi", "Urdu", "Arabic", "Spanish"]


# ---------- Settings ----------
def public_settings(s: dict) -> dict:
    return {"models": {t: (s.get("models") or {}).get(t) or DEFAULT_MODEL for t in TASKS}, "tasks": TASKS,
            "language": s.get("language", "Bangla"), "languages": LANGUAGES, "theme": s.get("theme", "light"),
            "thresholds": {"high": 80, "medium": 60, "low": 40, **(s.get("thresholds") or {})},
            "follow_up_days": s.get("follow_up_days", 3), "max_follow_ups": s.get("max_follow_ups", 2),
            "retention_days": s.get("retention_days", 0), "failover": s.get("failover", True),
            "builtin_fallback": s.get("builtin_fallback", True), "builtin_models": BUILTIN_MODELS}


class Thresholds(BaseModel):
    high: int = Field(80, ge=1, le=100)
    medium: int = Field(60, ge=1, le=100)
    low: int = Field(40, ge=0, le=100)


class SettingsIn(BaseModel):
    models: Optional[dict] = None
    language: Optional[str] = None
    theme: Optional[Literal["light", "night"]] = None
    thresholds: Optional[Thresholds] = None
    follow_up_days: Optional[int] = Field(None, ge=1, le=60)
    max_follow_ups: Optional[int] = Field(None, ge=0, le=10)
    retention_days: Optional[int] = Field(None, ge=0, le=3650)
    failover: Optional[bool] = None
    builtin_fallback: Optional[bool] = None


@router.get("/settings")
async def read_settings(user=Depends(current_user)):
    return public_settings(await get_settings(user["id"]))


@router.put("/settings")
async def update_settings(body: SettingsIn, user=Depends(current_user)):
    upd = {}
    if body.models:
        for t, m in body.models.items():
            if t in TASKS and isinstance(m, str) and m.count(":") >= 2:
                upd[f"models.{t}"] = m
    if body.thresholds:
        t = body.thresholds
        if not (t.high > t.medium > t.low):
            raise HTTPException(400, "Thresholds must be High > Medium > Low")
        upd["thresholds"] = t.model_dump()
    if body.language and body.language not in LANGUAGES:
        raise HTTPException(400, "Unsupported language")
    for f in ("language", "theme", "follow_up_days", "max_follow_ups", "retention_days", "failover", "builtin_fallback"):
        v = getattr(body, f)
        if v is not None:
            upd[f] = v
    if upd:
        await db.settings.update_one({"user_id": user["id"]}, {"$set": upd}, upsert=True)
        await audit(user, "settings.updated", ", ".join(upd))
    return public_settings(await get_settings(user["id"]))


async def apply_retention(uid: str, days: int) -> int:
    if not days:
        return 0
    cutoff = now() - timedelta(days=days)
    old = await db.leads.find({"user_id": uid, "stage": {"$in": ["rejected", "lost"]}, "updated_at": {"$lt": cutoff}}, {"_id": 1}).to_list(5000)
    ids = [str(d["_id"]) for d in old]
    if ids:
        await db.leads.delete_many({"_id": {"$in": [d["_id"] for d in old]}})
        for coll in ("drafts", "messages"):
            await db[coll].delete_many({"lead_id": {"$in": ids}})
    return len(ids)


@router.post("/settings/retention/run")
async def run_retention(user=Depends(current_user)):
    n = await apply_retention(user["id"], (await get_settings(user["id"])).get("retention_days", 0))
    await audit(user, "retention.run", f"deleted {n}")
    return {"deleted": n}


@router.delete("/account/data")
async def delete_my_data(user=Depends(current_user)):
    uid = user["id"]
    for coll in ("leads", "drafts", "messages", "activities", "api_usage", "scrape_jobs"):
        await db[coll].delete_many({"user_id": uid})
    await audit(user, "account.data_deleted", "all CRM data")
    return {"ok": True}


# ---------- Editor profile ----------
class Mapping(BaseModel):
    category: str = Field(min_length=1, max_length=100)
    description: str = ""
    link: str = Field(min_length=4, max_length=500)


class ProfileIn(BaseModel):
    name: str = ""
    niche: str = ""
    company_type: str = ""
    services: str = ""
    editing_style: str = ""
    target_clients: str = ""
    pricing: str = ""
    experience: str = ""
    positioning: str = ""
    tone: str = ""
    business_goal: str = ""
    universal_portfolio: str = ""
    instagram_profile: str = ""
    portfolio: list[Mapping] = []


@router.get("/editor-profile")
async def get_profile(user=Depends(current_user)):
    return await editor_profile(user["id"])


@router.put("/editor-profile")
async def put_profile(body: ProfileIn, user=Depends(current_user)):
    await db.editor_profiles.update_one({"user_id": user["id"]}, {"$set": body.model_dump()}, upsert=True)
    await audit(user, "editor_profile.updated")
    return await editor_profile(user["id"])


# ---------- Dashboard & analytics ----------
async def count(f):
    return await db.leads.count_documents(f)


def rate(a, b):
    return round(a * 100 / b, 1) if b else 0


@router.get("/stats")
async def stats(user=Depends(current_user)):
    uid = user["id"]
    s = await get_settings(uid)
    t = {"high": 80, "medium": 60, "low": 40, **(s.get("thresholds") or {})}
    base = {"user_id": uid}
    total = await count(base)
    contacted = await count({**base, "last_contact_at": {"$ne": None}})
    replied = await count({**base, "outcomes.replied": {"$ne": None}})
    positive = await count({**base, "outcomes.positive_reply": {"$ne": None}})
    calls = await count({**base, "outcomes.call_booked": {"$ne": None}})
    won = await count({**base, "$or": [{"stage": "won"}, {"outcomes.hired": {"$ne": None}}]})
    drafts = await db.drafts.count_documents({"user_id": uid, "status": {"$in": ["draft", "approved"]}})
    sent = await db.drafts.count_documents({"user_id": uid, "status": "sent"})
    due = await count({**base, "follow_up_at": {"$ne": None, "$lte": now() + timedelta(days=1)}, "stage": {"$nin": TERMINAL + ["won"]}})
    group = lambda field: db.leads.aggregate([{"$match": {**base, field: {"$nin": [None, "", "unknown"]}}},
                                              {"$group": {"_id": f"${field}", "n": {"$sum": 1}}}, {"$sort": {"n": -1}}, {"$limit": 8}]).to_list(8)
    recent = await db.leads.find(base, {"name": 1, "niche": 1, "platform": 1, "score": 1, "stage": 1, "priority": 1}).sort("created_at", -1).to_list(5)
    upcoming = await db.leads.find({**base, "follow_up_at": {"$ne": None}, "stage": {"$nin": TERMINAL + ["won"]}},
                                   {"name": 1, "follow_up_at": 1, "stage": 1, "score": 1}).sort("follow_up_at", 1).to_list(5)
    acts = await db.activities.find(base).sort("created_at", -1).to_list(10)
    return {
        "total": total, "qualified": await count({**base, "score": {"$gte": t["medium"]}}),
        "high_priority": await count({**base, "priority": "high"}),
        "awaiting_review": await count({**base, "stage": {"$in": ["ai_analyzed", "qualified"]}}),
        "drafted": drafts, "sent": sent, "contacted": contacted, "replied": replied, "positive": positive, "calls": calls, "won": won,
        "followups_due": due, "reply_rate": rate(replied, contacted), "positive_rate": rate(positive, contacted),
        "close_rate": rate(won, contacted), "conversion": rate(won, total),
        "by_niche": [{"name": r["_id"], "value": r["n"]} for r in await group("niche")],
        "by_platform": [{"name": r["_id"], "value": r["n"]} for r in await group("platform")],
        "recent_leads": [out(d) for d in recent], "upcoming_followups": [out(d) for d in upcoming],
        "activity": [out(a) for a in acts],
    }


@router.get("/analytics")
async def analytics(user=Depends(current_user)):
    uid = user["id"]
    base = {"user_id": uid}
    stages = {r["_id"]: r["n"] for r in await db.leads.aggregate([{"$match": base}, {"$group": {"_id": "$stage", "n": {"$sum": 1}}}]).to_list(50)}
    buckets = await db.leads.aggregate([{"$match": {**base, "score": {"$ne": None}}},
                                        {"$bucket": {"groupBy": "$score", "boundaries": [0, 40, 60, 80, 101], "default": "other",
                                                     "output": {"n": {"$sum": 1}}}}]).to_list(10)
    labels = {0: "<40", 40: "40-59", 60: "60-79", 80: "80-100"}
    niche = await db.leads.aggregate([{"$match": {**base, "niche": {"$nin": [None, "", "unknown"]}}},
                                      {"$group": {"_id": "$niche", "n": {"$sum": 1}, "won": {"$sum": {"$cond": [{"$eq": ["$stage", "won"]}, 1, 0]}},
                                                  "replied": {"$sum": {"$cond": [{"$ne": [{"$ifNull": ["$outcomes.replied", None]}, None]}, 1, 0]}}}},
                                      {"$sort": {"n": -1}}, {"$limit": 8}]).to_list(8)
    platform = await db.leads.aggregate([{"$match": base}, {"$group": {"_id": "$platform", "n": {"$sum": 1}}}]).to_list(20)
    msgs = await db.drafts.aggregate([{"$match": base}, {"$group": {"_id": {"type": "$type", "status": "$status"}, "n": {"$sum": 1}}}]).to_list(50)
    portfolio = await db.drafts.aggregate([{"$match": {**base, "portfolio.label": {"$nin": [None, ""]}}},
                                           {"$group": {"_id": "$portfolio.label", "n": {"$sum": 1}}}]).to_list(20)
    since = now() - timedelta(days=14)
    usage = await db.api_usage.aggregate([{"$match": {**base, "created_at": {"$gte": since}}},
                                          {"$group": {"_id": {"$dateToString": {"format": "%Y-%m-%d", "date": "$created_at"}},
                                                      "calls": {"$sum": 1}, "tokens": {"$sum": {"$add": ["$input_tokens", "$output_tokens"]}},
                                                      "cost": {"$sum": "$cost_usd"}, "failed": {"$sum": {"$cond": ["$ok", 0, 1]}}}},
                                          {"$sort": {"_id": 1}}]).to_list(20)
    by_task = await db.api_usage.aggregate([{"$match": base}, {"$group": {"_id": "$task", "calls": {"$sum": 1}, "cost": {"$sum": "$cost_usd"}}}]).to_list(20)
    return {
        "pipeline": [{"name": s.replace("_", " ").title(), "value": stages.get(s, 0)} for s in STAGES],
        "scores": [{"name": labels.get(b["_id"], "other"), "value": b["n"]} for b in buckets],
        "niches": [{"name": n["_id"], "leads": n["n"], "replied": n["replied"], "won": n["won"]} for n in niche],
        "platforms": [{"name": p["_id"], "value": p["n"]} for p in platform],
        "messages": [{"type": m["_id"]["type"], "status": m["_id"]["status"], "n": m["n"]} for m in msgs],
        "portfolio": [{"name": p["_id"], "value": p["n"]} for p in portfolio],
        "usage": [{"day": u["_id"][5:], "calls": u["calls"], "tokens": u["tokens"], "cost": round(u["cost"], 4), "failed": u["failed"]} for u in usage],
        "by_task": [{"name": t["_id"], "calls": t["calls"], "cost": round(t["cost"], 4)} for t in by_task],
        "analyzed": await db.leads.count_documents({**base, "analysis": {"$ne": None}}),
        "messages_total": await db.drafts.count_documents(base),
        "followups_total": await db.leads.count_documents({**base, "follow_up_count": {"$gt": 0}}),
    }


# ---------- Admin ----------
@router.get("/admin/overview")
async def admin_overview(user=Depends(require_admin)):
    return {"users": await db.users.count_documents({}), "leads": await db.leads.count_documents({}),
            "ai_calls": await db.api_usage.count_documents({"kind": "llm"}), "messages": await db.drafts.count_documents({}),
            "cost": round(sum([u.get("cost_usd", 0) async for u in db.api_usage.find({}, {"cost_usd": 1})]), 4)}


@router.get("/admin/users")
async def admin_users(user=Depends(require_admin)):
    users = await db.users.find({}).sort("created_at", 1).to_list(1000)
    counts = {r["_id"]: r["n"] for r in await db.leads.aggregate([{"$group": {"_id": "$user_id", "n": {"$sum": 1}}}]).to_list(1000)}
    return [{**out(u), "leads": counts.get(str(u["_id"]), 0), "active": u.get("active", True)} for u in users]


class UserPatch(BaseModel):
    role: Optional[Literal["admin", "user"]] = None
    active: Optional[bool] = None


@router.patch("/admin/users/{uid}")
async def admin_patch_user(uid: str, body: UserPatch, user=Depends(require_admin)):
    if uid == user["id"]:
        raise HTTPException(400, "You can't change your own role or status")
    upd = {k: v for k, v in body.model_dump().items() if v is not None}
    res = await db.users.update_one({"_id": oid(uid)}, {"$set": upd})
    if not res.matched_count:
        raise HTTPException(404, "User not found")
    await audit(user, "admin.user_updated", f"{uid} {upd}")
    return {"ok": True}


@router.delete("/admin/users/{uid}")
async def admin_delete_user(uid: str, user=Depends(require_admin)):
    if uid == user["id"]:
        raise HTTPException(400, "You can't delete yourself")
    target = await db.users.find_one({"_id": oid(uid)})
    if not target:
        raise HTTPException(404, "User not found")
    await db.users.delete_one({"_id": target["_id"]})
    for coll in ("leads", "drafts", "messages", "activities", "api_usage", "api_keys", "settings", "editor_profiles", "scrape_jobs"):
        await db[coll].delete_many({"user_id": uid})
    await audit(user, "admin.user_deleted", target["email"])
    return {"ok": True}


@router.get("/admin/audit")
async def admin_audit(page: int = 1, user=Depends(require_admin)):
    total = await db.audit_logs.count_documents({})
    docs = await db.audit_logs.find({}).sort("created_at", -1).skip((max(page, 1) - 1) * 50).to_list(50)
    return {"items": [out(d) for d in docs], "total": total}

