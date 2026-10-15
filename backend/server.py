from pathlib import Path
from dotenv import load_dotenv
load_dotenv(Path(__file__).parent / ".env")

import json
import logging
import os
import re
from typing import Literal, Optional

from fastapi import FastAPI, APIRouter, Depends, HTTPException, Response
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from starlette.middleware.cors import CORSMiddleware

from core import db, now, out, oid, hash_password, verify_password, create_token, current_user, log_activity
from llm import BUILTIN_MODELS, DEFAULT_MODEL, stream_llm
import scrapers

app = FastAPI()
api = APIRouter(prefix="/api")
logger = logging.getLogger("outreach")

STAGES = ["new", "researched", "contacted", "replied", "call_booked", "won", "lost"]
PLATFORMS = ["instagram", "x", "youtube", "tiktok", "website", "other"]
TASKS = ["research", "outreach", "chat"]
KEY_PROVIDERS = ["openai", "anthropic", "gemini", "xai"]


# ---------- Auth ----------
class AuthIn(BaseModel):
    email: str
    password: str = Field(min_length=6)
    name: Optional[str] = None


def set_auth(response: Response, user: dict) -> dict:
    token = create_token(user["id"], user["email"])
    response.set_cookie("access_token", token, httponly=True, secure=True, samesite="none", max_age=604800, path="/")
    return {"user": user, "token": token}


@api.post("/auth/register")
async def register(body: AuthIn, response: Response):
    email = body.email.strip().lower()
    if not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", email):
        raise HTTPException(400, "Invalid email")
    if await db.users.find_one({"email": email}):
        raise HTTPException(400, "Email already registered")
    doc = {"email": email, "password_hash": hash_password(body.password),
           "name": body.name or email.split("@")[0], "role": "user", "created_at": now()}
    res = await db.users.insert_one(doc)
    doc["_id"] = res.inserted_id
    return set_auth(response, out(doc))


@api.post("/auth/login")
async def login(body: AuthIn, response: Response):
    email = body.email.strip().lower()
    ident = email
    att = await db.login_attempts.find_one({"identifier": ident})
    if att and att.get("count", 0) >= 5 and (now() - att["last"].replace(tzinfo=now().tzinfo)).total_seconds() < 900:
        raise HTTPException(429, "Too many attempts. Try again in 15 minutes.")
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(body.password, user["password_hash"]):
        await db.login_attempts.update_one({"identifier": ident}, {"$inc": {"count": 1}, "$set": {"last": now()}}, upsert=True)
        raise HTTPException(401, "Invalid email or password")
    await db.login_attempts.delete_one({"identifier": ident})
    return set_auth(response, out(user))


@api.post("/auth/logout")
async def logout(response: Response):
    response.delete_cookie("access_token", path="/")
    return {"ok": True}


@api.get("/auth/me")
async def me(user=Depends(current_user)):
    return user


# ---------- Settings ----------
def mask(v: str) -> str:
    return f"{v[:4]}…{v[-4:]}" if v and len(v) > 10 else ("••••" if v else "")


async def get_settings(uid: str) -> dict:
    return await db.settings.find_one({"user_id": uid}) or {}


def public_settings(s: dict) -> dict:
    keys = s.get("keys") or {}
    custom = keys.get("custom") or {}
    return {
        "models": {t: (s.get("models") or {}).get(t) or DEFAULT_MODEL for t in TASKS},
        "keys": {p: mask(keys.get(p, "")) for p in KEY_PROVIDERS},
        "custom": {"base_url": custom.get("base_url", ""), "model": custom.get("model", ""),
                   "api_key": mask(custom.get("api_key", ""))},
        "apify_token": mask(s.get("apify_token", "")),
        "builtin_models": BUILTIN_MODELS,
    }


class SettingsIn(BaseModel):
    models: Optional[dict] = None
    keys: Optional[dict] = None
    custom: Optional[dict] = None
    apify_token: Optional[str] = None


@api.get("/settings")
async def read_settings(user=Depends(current_user)):
    return public_settings(await get_settings(user["id"]))


@api.put("/settings")
async def update_settings(body: SettingsIn, user=Depends(current_user)):
    upd = {}
    if body.models:
        for t, m in body.models.items():
            if t in TASKS and isinstance(m, str) and m.count(":") >= 2:
                upd[f"models.{t}"] = m
    if body.keys:
        for p, v in body.keys.items():
            if p in KEY_PROVIDERS and v:
                upd[f"keys.{p}"] = v.strip()
    if body.custom:
        for f in ("base_url", "model", "api_key"):
            if body.custom.get(f) is not None:
                upd[f"keys.custom.{f}"] = body.custom[f].strip()
    if body.apify_token is not None:
        upd["apify_token"] = body.apify_token.strip()
    if upd:
        await db.settings.update_one({"user_id": user["id"]}, {"$set": upd}, upsert=True)
    return public_settings(await get_settings(user["id"]))


# ---------- Leads ----------
class LeadIn(BaseModel):
    name: str = Field(min_length=1)
    handle: Optional[str] = ""
    url: Optional[str] = ""
    platform: Literal["instagram", "x", "youtube", "tiktok", "website", "other"] = "instagram"
    notes: Optional[str] = ""
    bio: Optional[str] = ""
    website: Optional[str] = ""
    followers: Optional[int] = 0
    contact: Optional[str] = ""


class LeadPatch(BaseModel):
    name: Optional[str] = None
    handle: Optional[str] = None
    url: Optional[str] = None
    notes: Optional[str] = None
    stage: Optional[str] = None
    platform: Optional[str] = None
    contact: Optional[str] = None


def new_lead(uid: str, data: dict) -> dict:
    fields = {k: data.get(k) for k in ("name", "handle", "url", "platform", "notes", "bio", "website", "followers",
                                        "following", "posts", "contact", "avatar", "recent")}
    fields["handle"] = (fields.get("handle") or "").lstrip("@")
    fields["followers"] = fields.get("followers") or 0
    fields.update({"user_id": uid, "stage": "new", "score": scrapers.lead_score(fields),
                   "contact_verified": False, "analysis": "", "outreach": {}, "created_at": now(), "updated_at": now()})
    return fields


async def own_lead(lead_id: str, uid: str) -> dict:
    doc = await db.leads.find_one({"_id": oid(lead_id), "user_id": uid})
    if not doc:
        raise HTTPException(404, "Lead not found")
    return dict(doc)


@api.get("/leads")
async def list_leads(q: str = "", platform: str = "", stage: str = "", min_score: int = 0, user=Depends(current_user)):
    f = {"user_id": user["id"]}
    if q:
        rx = {"$regex": re.escape(q), "$options": "i"}
        f["$or"] = [{"name": rx}, {"handle": rx}, {"bio": rx}, {"notes": rx}]
    if platform:
        f["platform"] = platform
    if stage:
        f["stage"] = stage
    if min_score:
        f["score"] = {"$gte": min_score}
    docs = await db.leads.find(f, {"recent": 0}).sort("updated_at", -1).to_list(1000)
    return [out(d) for d in docs]


@api.post("/leads")
async def create_lead(body: LeadIn, user=Depends(current_user)):
    lead = new_lead(user["id"], body.model_dump())
    res = await db.leads.insert_one(lead)
    lead["_id"] = res.inserted_id
    await log_activity(user["id"], f"Added lead {lead['name']}", str(res.inserted_id))
    return out(lead)


@api.get("/leads/{lead_id}")
async def get_lead(lead_id: str, user=Depends(current_user)):
    return out(await own_lead(lead_id, user["id"]))


@api.patch("/leads/{lead_id}")
async def patch_lead(lead_id: str, body: LeadPatch, user=Depends(current_user)):
    lead = await own_lead(lead_id, user["id"])
    upd = {k: v for k, v in body.model_dump().items() if v is not None}
    if "stage" in upd and upd["stage"] not in STAGES:
        raise HTTPException(400, "Invalid stage")
    upd["updated_at"] = now()
    await db.leads.update_one({"_id": lead["_id"]}, {"$set": upd})
    if "stage" in upd and upd["stage"] != lead.get("stage"):
        await log_activity(user["id"], f"Moved {lead['name']} to {upd['stage'].replace('_', ' ')}", lead_id)
    return out(await db.leads.find_one({"_id": lead["_id"]}))


@api.delete("/leads/{lead_id}")
async def delete_lead(lead_id: str, user=Depends(current_user)):
    lead = await own_lead(lead_id, user["id"])
    await db.leads.delete_one({"_id": lead["_id"]})
    await db.messages.delete_many({"lead_id": lead_id})
    return {"ok": True}


@api.get("/stats")
async def stats(user=Depends(current_user)):
    uid = user["id"]
    by_stage = {s: 0 for s in STAGES}
    async for r in db.leads.aggregate([{"$match": {"user_id": uid}}, {"$group": {"_id": "$stage", "n": {"$sum": 1}}}]):
        by_stage[r["_id"]] = r["n"]
    acts = await db.activities.find({"user_id": uid}).sort("created_at", -1).to_list(12)
    hot = await db.leads.find({"user_id": uid}, {"recent": 0}).sort("score", -1).to_list(5)
    return {"total": sum(by_stage.values()), "by_stage": by_stage,
            "activity": [out(a) for a in acts], "hot_leads": [out(h) for h in hot]}


# ---------- AI helpers ----------
def lead_context(lead: dict) -> str:
    parts = [f"Name: {lead.get('name')}", f"Platform: {lead.get('platform')}", f"Handle: @{lead.get('handle') or '-'}",
             f"URL: {lead.get('url') or '-'}", f"Followers: {lead.get('followers') or 'unknown'}",
             f"Bio: {lead.get('bio') or '-'}", f"Website: {lead.get('website') or '-'}",
             f"Public contact (unverified): {lead.get('contact') or '-'}", f"Pipeline stage: {lead.get('stage')}",
             f"User notes: {lead.get('notes') or '-'}"]
    if lead.get("posts"):
        parts.append(f"Total posts: {lead['posts']}")
    if lead.get("recent"):
        parts.append("Recent posts:\n" + "\n".join(f"- {p}" for p in lead["recent"] if p))
    return "\n".join(parts)


SYSTEM_BASE = ("You are OUTREACH.AI, an elite sales assistant for a freelance video editor / editing agency. "
               "You help them land creators and brands as clients. Be specific, practical and concise. Use markdown.")


def sse(gen_factory):
    async def event_stream():
        try:
            async for chunk in gen_factory():
                yield f"data: {json.dumps({'t': chunk})}\n\n"
            yield f"data: {json.dumps({'done': True})}\n\n"
        except HTTPException as e:
            yield f"data: {json.dumps({'error': e.detail})}\n\n"
        except Exception as e:
            logger.exception("stream failed")
            yield f"data: {json.dumps({'error': str(e)[:300]})}\n\n"
    return StreamingResponse(event_stream(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@api.post("/leads/{lead_id}/analyze")
async def analyze(lead_id: str, user=Depends(current_user)):
    lead = await own_lead(lead_id, user["id"])
    settings = await get_settings(user["id"])

    async def gen():
        nonlocal lead
        token = settings.get("apify_token")
        if lead["platform"] in ("instagram", "x") and lead.get("handle") and token:
            yield f"_Scraping @{lead['handle']} on {lead['platform']}…_\n\n"
            try:
                found = await scrapers.scrape_sync(token, lead["platform"], lead["handle"])
                if found:
                    p = found[0]
                    upd = {k: p[k] for k in ("bio", "website", "followers", "following", "posts", "avatar", "recent", "url")
                           if p.get(k)}
                    if p.get("contact"):
                        upd["contact"] = p["contact"]
                    merged = {**lead, **upd}
                    upd["score"] = scrapers.lead_score(merged)
                    await db.leads.update_one({"_id": lead["_id"]}, {"$set": upd})
                    lead = await db.leads.find_one({"_id": lead["_id"]})
                    yield "_Profile data updated._\n\n"
            except HTTPException as e:
                yield f"_Scrape skipped: {e.detail}_\n\n"
        elif not token and lead["platform"] in ("instagram", "x"):
            yield "_No Apify token — analysing from saved details only._\n\n"
        prompt = (f"Write a deep research report on this potential client.\n\n{lead_context(lead)}\n\n"
                  "Sections (use ## headings): Who they are; Content style; Posting frequency; Audience; "
                  "Editing quality gaps; Pain points; Budget estimate (what they could pay per video/month, with reasoning); "
                  "Best pitch angle; Red flags. If data is missing, say what you inferred.")
        report = ""
        async for chunk in stream_llm(settings, "research", SYSTEM_BASE, prompt):
            report += chunk
            yield chunk
        stage = "researched" if lead.get("stage") == "new" else lead.get("stage")
        await db.leads.update_one({"_id": lead["_id"]}, {"$set": {"analysis": report, "stage": stage, "updated_at": now()}})
        await log_activity(user["id"], f"Deep analysis on {lead['name']}", lead_id)
    return sse(gen)


class OutreachIn(BaseModel):
    tone: str = "friendly"
    length: str = "short"


def split_outreach(text: str) -> dict:
    res = {}
    for key, label in (("dm", "DM"), ("email", "EMAIL"), ("followup", "FOLLOW-UP")):
        m = re.search(rf"###\s*{label}\s*\n(.*?)(?=\n###\s*(DM|EMAIL|FOLLOW-UP)\s*\n|\Z)", text, re.S | re.I)
        res[key] = m.group(1).strip() if m else ""
    return res


@api.post("/leads/{lead_id}/outreach")
async def outreach(lead_id: str, body: OutreachIn, user=Depends(current_user)):
    lead = await own_lead(lead_id, user["id"])
    settings = await get_settings(user["id"])

    async def gen():
        prompt = (f"Lead details:\n{lead_context(lead)}\n\nResearch report:\n{lead.get('analysis') or '(none yet)'}\n\n"
                  f"Write outreach that books a call. Tone: {body.tone}. Length: {body.length}. "
                  "Reference something specific about them. No generic flattery. One clear call to action.\n"
                  "Output EXACTLY three sections with these headings and nothing else:\n"
                  "### DM\n(the Instagram/X DM)\n### EMAIL\n(Subject: line then body)\n### FOLLOW-UP\n(a follow-up for 3 days later)")
        text = ""
        async for chunk in stream_llm(settings, "outreach", SYSTEM_BASE, prompt):
            text += chunk
            yield chunk
        msgs = split_outreach(text)
        msgs.update({"tone": body.tone, "length": body.length, "created_at": now().isoformat()})
        await db.leads.update_one({"_id": lead["_id"]}, {"$set": {"outreach": msgs, "updated_at": now()}})
        await log_activity(user["id"], f"Generated outreach for {lead['name']}", lead_id)
    return sse(gen)


class ChatIn(BaseModel):
    message: str = Field(min_length=1, max_length=8000)


@api.get("/leads/{lead_id}/messages")
async def messages(lead_id: str, user=Depends(current_user)):
    await own_lead(lead_id, user["id"])
    docs = await db.messages.find({"lead_id": lead_id}).sort("created_at", 1).to_list(500)
    return [out(d) for d in docs]


@api.delete("/leads/{lead_id}/messages")
async def clear_messages(lead_id: str, user=Depends(current_user)):
    await own_lead(lead_id, user["id"])
    await db.messages.delete_many({"lead_id": lead_id})
    return {"ok": True}


@api.post("/leads/{lead_id}/chat")
async def chat(lead_id: str, body: ChatIn, user=Depends(current_user)):
    lead = await own_lead(lead_id, user["id"])
    settings = await get_settings(user["id"])
    history = await db.messages.find({"lead_id": lead_id}).sort("created_at", -1).to_list(30)
    history.reverse()
    await db.messages.insert_one({"lead_id": lead_id, "user_id": user["id"], "role": "user",
                                  "content": body.message, "created_at": now()})

    async def gen():
        o = lead.get("outreach") or {}
        memory = (f"LEAD MEMORY\n{lead_context(lead)}\n\nResearch report:\n{(lead.get('analysis') or '(none)')[:6000]}\n\n"
                  f"Outreach already written:\nDM: {o.get('dm') or '-'}\nEmail: {o.get('email') or '-'}\nFollow-up: {o.get('followup') or '-'}")
        transcript = "\n\n".join(f"{'USER' if m['role'] == 'user' else 'ASSISTANT'}: {m['content']}" for m in history)
        prompt = f"Conversation so far:\n{transcript or '(new conversation)'}\n\nUSER: {body.message}\n\nASSISTANT:"
        system = SYSTEM_BASE + " You are the dedicated memory for ONE lead. Always use what you know about them.\n\n" + memory
        reply = ""
        async for chunk in stream_llm(settings, "chat", system, prompt):
            reply += chunk
            yield chunk
        await db.messages.insert_one({"lead_id": lead_id, "user_id": user["id"], "role": "assistant",
                                      "content": reply, "created_at": now()})
    return sse(gen)


# ---------- Scraping ----------
class ScrapeIn(BaseModel):
    kind: Literal["instagram", "x", "youtube", "google"]
    targets: list[str] = Field(min_length=1, max_length=50)


async def apify_token(uid: str) -> str:
    t = (await get_settings(uid)).get("apify_token")
    if not t:
        raise HTTPException(400, "Add your Apify token in Settings first")
    return t


@api.post("/scrape")
async def start_scrape(body: ScrapeIn, user=Depends(current_user)):
    token = await apify_token(user["id"])
    targets = [t for t in body.targets if t.strip()]
    if not targets:
        raise HTTPException(400, "Add at least one target")
    run = await scrapers.start_run(token, body.kind, targets)
    await db.scrape_jobs.insert_one({"_id": run["id"], "user_id": user["id"], "kind": body.kind,
                                     "targets": targets, "status": run.get("status", "READY"), "created_at": now()})
    return {"id": run["id"], "status": run.get("status", "READY"), "items": []}


@api.get("/scrape/{run_id}")
async def scrape_status(run_id: str, user=Depends(current_user)):
    job = await db.scrape_jobs.find_one({"_id": run_id, "user_id": user["id"]})
    if not job:
        raise HTTPException(404, "Job not found")
    if job.get("status") == "SUCCEEDED":
        return {"id": run_id, "status": "SUCCEEDED", "items": job.get("items", [])}
    status, raw, msg = await scrapers.run_status(await apify_token(user["id"]), run_id)
    items = scrapers.normalize(job["kind"], raw) if status == "SUCCEEDED" else []
    await db.scrape_jobs.update_one({"_id": run_id}, {"$set": {"status": status, "items": items}})
    if status == "SUCCEEDED":
        await log_activity(user["id"], f"Scrape finished: {len(items)} {job['kind']} results")
    return {"id": run_id, "status": status, "items": items, "error": msg if status in ("FAILED", "ABORTED", "TIMED-OUT") else None}


class ImportIn(BaseModel):
    items: list[dict] = Field(min_length=1, max_length=200)


@api.post("/scrape/import")
async def import_leads(body: ImportIn, user=Depends(current_user)):
    saved = 0
    for it in body.items:
        if it.get("platform") not in PLATFORMS:
            it["platform"] = "other"
        if not it.get("name") and not it.get("handle"):
            continue
        it["name"] = it.get("name") or it.get("handle")
        if it.get("handle") and await db.leads.find_one({"user_id": user["id"], "platform": it["platform"], "handle": it["handle"]}):
            continue
        await db.leads.insert_one(new_lead(user["id"], it))
        saved += 1
    await log_activity(user["id"], f"Imported {saved} leads from scrape")
    return {"saved": saved}


app.include_router(api)
app.add_middleware(CORSMiddleware, allow_credentials=True, allow_origin_regex=".*",
                   allow_methods=["*"], allow_headers=["*"])


@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)
    await db.leads.create_index([("user_id", 1), ("updated_at", -1)])
    await db.messages.create_index([("lead_id", 1), ("created_at", 1)])
    await db.login_attempts.create_index("identifier")
    email, pw = os.environ["ADMIN_EMAIL"], os.environ["ADMIN_PASSWORD"]
    existing = await db.users.find_one({"email": email})
    if not existing:
        await db.users.insert_one({"email": email, "password_hash": hash_password(pw), "name": "Admin",
                                   "role": "admin", "created_at": now()})
    elif not verify_password(pw, existing["password_hash"]):
        await db.users.update_one({"email": email}, {"$set": {"password_hash": hash_password(pw)}})
