import asyncio
import csv
import io
import json
import re
from datetime import datetime, timedelta
from difflib import SequenceMatcher
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel, Field

import composio_svc
import prompts as P
import scrapers as S
from core import db, now, aware, out, oid, current_user, log_activity, audit, get_settings, provider_key
from llm import LLMError, llm_json, stream_text

router = APIRouter(prefix="/api")

ORDER = ["discovered", "ai_analyzed", "qualified", "approved", "outreach_drafted", "contacted", "replied", "negotiation", "won"]
TERMINAL = ["lost", "rejected", "do_not_contact"]
STAGES = ORDER + TERMINAL
PLATFORMS = ["instagram", "x", "youtube", "linkedin", "tiktok", "website", "other"]
OUTCOMES = ["replied", "positive_reply", "call_booked", "hired"]
SORTS = {"updated": ("updated_at", -1), "score": ("score", -1), "newest": ("created_at", -1), "name": ("name", 1),
         "follow_up": ("follow_up_at", 1)}


def sse(gen_factory):
    async def stream():
        try:
            async for ev in gen_factory():
                yield f"data: {json.dumps(ev if isinstance(ev, dict) else {'t': ev}, default=str)}\n\n"
        except HTTPException as e:
            yield f"data: {json.dumps({'error': e.detail})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)[:400]})}\n\n"
    return StreamingResponse(stream(), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


async def editor_profile(uid: str) -> dict:
    p = await db.editor_profiles.find_one({"user_id": uid}, {"_id": 0, "user_id": 0})
    return {**P.DEFAULT_PROFILE, **(p or {})}


async def thresholds(uid: str) -> dict:
    return {"high": 80, "medium": 60, "low": 40, **((await get_settings(uid)).get("thresholds") or {})}


async def own_lead(lead_id: str, uid: str) -> dict:
    doc = await db.leads.find_one({"_id": oid(lead_id), "user_id": uid})
    if not doc:
        raise HTTPException(404, "Lead not found")
    return dict(doc)


def blocked(lead: dict):
    if lead.get("do_not_contact") or lead.get("opt_out"):
        raise HTTPException(403, "This lead is marked Do Not Contact / opted out")


async def advance(lead: dict, target: str) -> Optional[str]:
    cur = lead.get("stage")
    if cur in ORDER and ORDER.index(target) > ORDER.index(cur):
        await db.leads.update_one({"_id": lead["_id"]}, {"$set": {"stage": target, "updated_at": now()}})
        return target
    return None


# ---------- Lead CRUD ----------
class LeadIn(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    platform: Literal["instagram", "x", "youtube", "linkedin", "tiktok", "website", "other"] = "instagram"
    profile_url: Optional[str] = ""
    handle: Optional[str] = ""
    company: Optional[str] = ""
    website: Optional[str] = ""
    email: Optional[str] = ""
    contact_method: Optional[str] = ""
    country: Optional[str] = ""
    timezone: Optional[str] = ""
    niche_hint: Optional[str] = ""
    bio: Optional[str] = ""
    notes: Optional[str] = ""
    followers: Optional[int] = 0
    video_urls: list[str] = []
    manual_observations: Optional[str] = ""
    transcript: Optional[str] = ""
    source: Literal["manual", "apify", "composio"] = "manual"
    recent: list = []
    videos: list = []
    avatar: Optional[str] = ""
    following: Optional[int] = 0
    posts: Optional[int] = 0


def build_lead(uid: str, d: dict) -> dict:
    handle = (d.get("handle") or "").strip().lstrip("@") or S.handle_from_url(d.get("profile_url", ""), d["platform"])
    url_norm = S.normalize_url(d.get("profile_url", "") or d.get("website", ""), d["platform"], handle)
    src = d.pop("source", "manual")
    fields = {k: v for k, v in d.items() if k not in ("prelim_score",)}
    fields.update({
        "user_id": uid, "handle": handle, "handle_lc": handle.lower(), "url_norm": url_norm, "stage": "discovered",
        "pinned": False, "opt_out": False, "do_not_contact": False, "score": None, "priority": "unscored",
        "contact_verified": "unverified" if d.get("email") else "none", "outcomes": {}, "analysis": None,
        "sources": [S.source_record(src, [k for k, v in d.items() if v])], "follow_up_at": None, "follow_up_count": 0,
        "discovered_at": now(), "created_at": now(), "updated_at": now(), "last_contact_at": None, "last_verified_at": None,
    })
    return fields


async def find_duplicate(uid: str, url_norm: str, platform: str, handle: str):
    ors = ([{"url_norm": url_norm}] if url_norm else []) + ([{"platform": platform, "handle_lc": handle.lower()}] if handle else [])
    if not ors:
        return None
    dup = await db.leads.find_one({"user_id": uid, "$or": ors})
    return dict(dup) if dup else None


async def insert_lead(uid: str, data: dict) -> tuple[Optional[dict], Optional[dict]]:
    doc = build_lead(uid, data)
    dup = await find_duplicate(uid, doc["url_norm"], doc["platform"], doc["handle"])
    if dup:
        return None, dup
    res = await db.leads.insert_one(doc)
    doc["_id"] = res.inserted_id
    return doc, None


def dup_error(dup: dict):
    if dup.get("do_not_contact"):
        raise HTTPException(409, {"message": "This profile is on your Do Not Contact list", "lead_id": str(dup["_id"])})
    raise HTTPException(409, {"message": f"Duplicate: {dup['name']} already exists", "lead_id": str(dup["_id"])})


@router.post("/leads")
async def create_lead(body: LeadIn, user=Depends(current_user)):
    doc, dup = await insert_lead(user["id"], body.model_dump())
    if dup:
        dup_error(dup)
    await log_activity(user["id"], f"Added lead {doc['name']}", str(doc["_id"]))
    return out(doc)


def lead_filter(uid, q, platform, stage, priority, niche, min_score, pinned, review):
    f = {"user_id": uid}
    if q:
        rx = {"$regex": re.escape(q), "$options": "i"}
        f["$or"] = [{"name": rx}, {"handle": rx}, {"company": rx}, {"niche": rx}, {"bio": rx}, {"notes": rx}, {"platform": rx}]
    if platform:
        f["platform"] = platform
    if stage:
        f["stage"] = stage
    if priority:
        f["priority"] = priority
    if niche:
        f["niche"] = {"$regex": re.escape(niche), "$options": "i"}
    if min_score:
        f["score"] = {"$gte": min_score}
    if pinned:
        f["pinned"] = True
    if review:
        f["stage"] = {"$in": ["ai_analyzed", "qualified"]}
    return f


LIST_PROJ = {"recent": 0, "videos": 0, "website_excerpt": 0, "transcript": 0, "replies": 0}


@router.get("/leads")
async def list_leads(q: str = "", platform: str = "", stage: str = "", priority: str = "", niche: str = "", min_score: int = 0,
                     pinned: bool = False, review: bool = False, sort: str = "updated", page: int = 1, page_size: int = 25,
                     user=Depends(current_user)):
    f = lead_filter(user["id"], q, platform, stage, priority, niche, min_score, pinned, review)
    field, direction = SORTS.get(sort, SORTS["updated"])
    page_size = max(1, min(page_size, 500))
    total = await db.leads.count_documents(f)
    docs = await db.leads.find(f, LIST_PROJ).sort([(field, direction), ("_id", -1)]).skip((max(page, 1) - 1) * page_size).to_list(page_size)
    return {"items": [out(d) for d in docs], "total": total, "page": page, "page_size": page_size}


CSV_COLS = ["id", "name", "company", "website", "platform", "profile_url", "handle", "email", "contact_method", "contact_verified",
            "country", "timezone", "niche", "business_type", "video_activity", "video_urls", "editing_opportunity",
            "recommended_service", "score", "priority", "score_explanation", "evidence_sources", "confidence",
            "recurring_potential", "discovered_at", "last_verified_at", "stage", "last_contact_at", "follow_up_at", "notes", "opt_out"]


@router.get("/leads/export.csv")
async def export_csv(q: str = "", platform: str = "", stage: str = "", priority: str = "", user=Depends(current_user)):
    f = lead_filter(user["id"], q, platform, stage, priority, "", 0, False, False)
    buf = io.StringIO()
    w = csv.DictWriter(buf, fieldnames=CSV_COLS, extrasaction="ignore")
    w.writeheader()
    async for d in db.leads.find(f, LIST_PROJ).sort("updated_at", -1):
        r = out(d)
        a = r.get("analysis") or {}
        opps = a.get("opportunities") or []
        r.update({"video_urls": " ".join(r.get("video_urls") or []),
                  "editing_opportunity": (opps[0].get("issue") if opps and isinstance(opps[0], dict) else ""),
                  "recommended_service": a.get("recommended_service", ""),
                  "evidence_sources": "; ".join(f"{s.get('source')} ({str(s.get('checked_at'))[:10]})" for s in r.get("sources") or [])})
        w.writerow(r)
    await audit(user, "leads.exported", f"filters q={q} platform={platform} stage={stage}")
    return Response(buf.getvalue(), media_type="text/csv", headers={"Content-Disposition": "attachment; filename=leads.csv"})


@router.get("/leads/{lead_id}")
async def get_lead(lead_id: str, user=Depends(current_user)):
    return out(await own_lead(lead_id, user["id"]))


class LeadPatch(BaseModel):
    name: Optional[str] = None
    company: Optional[str] = None
    website: Optional[str] = None
    profile_url: Optional[str] = None
    handle: Optional[str] = None
    email: Optional[str] = None
    contact_method: Optional[str] = None
    contact_verified: Optional[Literal["verified", "unverified", "none"]] = None
    country: Optional[str] = None
    timezone: Optional[str] = None
    niche: Optional[str] = None
    niche_hint: Optional[str] = None
    notes: Optional[str] = None
    stage: Optional[str] = None
    video_urls: Optional[list[str]] = None
    manual_observations: Optional[str] = None
    transcript: Optional[str] = None
    follow_up_at: Optional[str] = None


async def apply_patch(lead: dict, upd: dict, user: dict) -> dict:
    if "stage" in upd and upd["stage"] not in STAGES:
        raise HTTPException(400, "Invalid stage")
    if upd.get("stage") == "do_not_contact":
        upd["do_not_contact"] = True
    if "profile_url" in upd or "handle" in upd:
        h = (upd.get("handle", lead.get("handle")) or "").lstrip("@")
        upd.update({"handle": h, "handle_lc": h.lower(),
                    "url_norm": S.normalize_url(upd.get("profile_url", lead.get("profile_url", "")), lead["platform"], h)})
    if upd.get("follow_up_at"):
        upd["follow_up_at"] = aware(datetime.fromisoformat(upd["follow_up_at"].replace("Z", "+00:00")))
    upd["updated_at"] = now()
    await db.leads.update_one({"_id": lead["_id"]}, {"$set": upd})
    if "stage" in upd and upd["stage"] != lead.get("stage"):
        await log_activity(user["id"], f"Moved {lead['name']} to {upd['stage'].replace('_', ' ')}", str(lead["_id"]), "stage")
    doc = await db.leads.find_one({"_id": lead["_id"]})
    return dict(doc)


@router.patch("/leads/{lead_id}")
async def patch_lead(lead_id: str, body: LeadPatch, user=Depends(current_user)):
    lead = await own_lead(lead_id, user["id"])
    return out(await apply_patch(lead, {k: v for k, v in body.model_dump().items() if v is not None}, user))


@router.delete("/leads/{lead_id}")
async def delete_lead(lead_id: str, user=Depends(current_user)):
    lead = await own_lead(lead_id, user["id"])
    await db.leads.delete_one({"_id": lead["_id"]})
    for coll in ("messages", "drafts", "activities"):
        await db[coll].delete_many({"lead_id": lead_id})
    await audit(user, "lead.deleted", lead["name"])
    return {"ok": True}


@router.post("/leads/{lead_id}/pin")
async def pin(lead_id: str, user=Depends(current_user)):
    lead = await own_lead(lead_id, user["id"])
    await db.leads.update_one({"_id": lead["_id"]}, {"$set": {"pinned": not lead.get("pinned")}})
    return out(await db.leads.find_one({"_id": lead["_id"]}))


@router.post("/leads/{lead_id}/opt-out")
async def opt_out(lead_id: str, user=Depends(current_user)):
    lead = await own_lead(lead_id, user["id"])
    minimal = {"stage": "do_not_contact", "do_not_contact": True, "opt_out": True, "opted_out_at": now(), "email": "",
               "recent": [], "videos": [], "website_excerpt": "", "transcript": "", "follow_up_at": None, "updated_at": now()}
    await db.leads.update_one({"_id": lead["_id"]}, {"$set": minimal})
    await db.drafts.delete_many({"lead_id": lead_id, "status": {"$ne": "sent"}})
    await log_activity(user["id"], f"{lead['name']} opted out — marked Do Not Contact", lead_id, "opt_out")
    await audit(user, "lead.opt_out", lead["name"])
    return out(await db.leads.find_one({"_id": lead["_id"]}))


class OutcomeIn(BaseModel):
    key: Literal["replied", "positive_reply", "call_booked", "hired"]
    value: bool


@router.post("/leads/{lead_id}/outcome")
async def outcome(lead_id: str, body: OutcomeIn, user=Depends(current_user)):
    lead = await own_lead(lead_id, user["id"])
    await db.leads.update_one({"_id": lead["_id"]}, {"$set": {f"outcomes.{body.key}": now().isoformat() if body.value else None, "updated_at": now()}})
    if body.value:
        target = {"replied": "replied", "positive_reply": "replied", "call_booked": "negotiation", "hired": "won"}[body.key]
        await advance(lead, target)
        if body.key in ("replied", "positive_reply"):
            await db.leads.update_one({"_id": lead["_id"]}, {"$set": {"follow_up_at": None}})
        await log_activity(user["id"], f"{lead['name']}: {body.key.replace('_', ' ')}", lead_id, "outcome")
    return out(await db.leads.find_one({"_id": lead["_id"]}))


@router.get("/leads/{lead_id}/activity")
async def lead_activity(lead_id: str, user=Depends(current_user)):
    await own_lead(lead_id, user["id"])
    docs = await db.activities.find({"user_id": user["id"], "lead_id": lead_id}).sort("created_at", -1).to_list(100)
    return [out(d) for d in docs]


# ---------- Enrichment + AI analysis ----------
def from_composio(platform: str, data) -> dict:
    g = lambda *k: S.deep_find(data, k)
    media = g("media")
    posts = media.get("data") if isinstance(media, dict) else (g("tweets") or [])
    p = {"name": g("name", "full_name"), "bio": g("biography", "description"), "website": g("website"),
         "followers": S.to_int(g("followers_count")), "following": S.to_int(g("follows_count", "following_count")),
         "posts": S.to_int(g("media_count", "tweet_count")), "avatar": g("profile_picture_url", "profile_image_url"),
         "country": g("location"), "recent": [S._post(x) for x in (posts or [])[:10] if isinstance(x, dict)]}
    return {k: v for k, v in p.items() if v}


async def enrich(uid: str, lead: dict):
    notes, upd, sources = [], {}, list(lead.get("sources") or [])
    plat, handle = lead["platform"], lead.get("handle")

    async def apify(kind, target):
        token = await provider_key(uid, "apify")
        if not token:
            notes.append("No Apify key — using saved details only")
            return
        try:
            p = await S.apify_profile(uid, token, kind, target)
            if p:
                fresh = {k: v for k, v in p.items() if v and k not in ("source", "prelim_score", "platform", "handle", "name")}
                upd.update(fresh)
                sources.append(S.source_record("apify", list(fresh)))
                notes.append(f"Apify: collected {', '.join(list(fresh)[:6])}")
            else:
                notes.append("Apify returned no profile")
        except HTTPException as e:
            notes.append(f"Apify failed: {e.detail}")

    if plat in ("instagram", "x") and handle:
        data, note = await composio_svc.lookup_profile(uid, plat, handle)
        p = from_composio(plat, data) if data else {}
        if p:
            upd.update(p)
            sources.append(S.source_record("composio", list(p), note))
            notes.append(f"Composio: collected {', '.join(list(p)[:6])} ({note})")
        else:
            notes.append(f"Composio skipped: {note}" if not data else "Composio returned no usable fields")
            await apify(plat, handle)
    elif plat == "youtube" and (lead.get("profile_url") or handle):
        await apify("youtube", lead.get("profile_url") or handle)
    site = upd.get("website") or lead.get("website")
    if site:
        fc = await provider_key(uid, "firecrawl")
        if fc:
            excerpt = await S.firecrawl_site(uid, fc, site)
            if excerpt:
                upd["website_excerpt"] = excerpt
                sources.append(S.source_record("firecrawl", ["website_excerpt"], site))
                notes.append("Firecrawl: website text collected")
    if lead.get("email") and "email" in upd:
        upd.pop("email")
    if upd:
        upd.update({"sources": sources[-12:], "last_verified_at": now(), "updated_at": now()})
        if upd.get("email"):
            upd["contact_verified"] = "unverified"
        await db.leads.update_one({"_id": lead["_id"]}, {"$set": upd})
    return {**lead, **upd}, notes


async def run_analysis(uid: str, lead: dict, emit=None):
    async def say(msg, step):
        if emit:
            await emit({"ev": "progress", "step": step, "msg": msg})
    await say("Collecting public data (Composio first, Apify backup)…", "collect")
    lead, notes = await enrich(uid, lead)
    for n in notes:
        await say(n, "collect")
    profile = await editor_profile(uid)
    await say("AI: relevance analysis + editing opportunity analysis…", "analyze")
    rel, opp = await asyncio.gather(
        llm_json(uid, "relevance", P.SYSTEM_ANALYST, P.relevance_prompt(lead, profile), P.Relevance),
        llm_json(uid, "opportunity", P.SYSTEM_ANALYST, P.opportunity_prompt(lead, profile), P.Opportunity))
    await say("AI: explainable lead scoring…", "score")
    sc = await llm_json(uid, "scoring", P.SYSTEM_ANALYST, P.scoring_prompt(lead, rel.model_dump(), opp.model_dump(), profile), P.Scoring)
    breakdown = {k: {"points": round(max(0, min(mx, getattr(sc, k).points)), 1), "max": mx, "evidence": getattr(sc, k).evidence}
                 for k, mx in P.FACTORS.items()}
    total = int(round(sum(b["points"] for b in breakdown.values())))
    t = await thresholds(uid)
    pr = P.priority_for(total, t)
    analysis = {**rel.model_dump(), **opp.model_dump(), "analyzed_at": now().isoformat()}
    upd = {"analysis": analysis, "score": total, "score_breakdown": breakdown, "score_explanation": sc.explanation,
           "confidence": sc.confidence, "priority": pr, "niche": rel.niche, "business_type": rel.business_type,
           "video_activity": rel.video_activity, "recommended_service": opp.recommended_service,
           "recurring_potential": rel.recurring_potential, "updated_at": now(), "last_verified_at": now()}
    if rel.company and rel.company != "unknown" and not lead.get("company"):
        upd["company"] = rel.company
    if rel.country and rel.country != "unknown" and not lead.get("country"):
        upd["country"] = rel.country
    if not lead.get("contact_method") and rel.contact_method != "unknown":
        upd["contact_method"] = rel.contact_method
    await db.leads.update_one({"_id": lead["_id"]}, {"$set": upd})
    await advance(lead, "qualified" if total >= t["medium"] else "ai_analyzed")
    await log_activity(uid, f"AI analyzed {lead['name']}: score {total} ({pr})", str(lead["_id"]), "analysis")
    doc = await db.leads.find_one({"_id": lead["_id"]})
    return dict(doc)


@router.post("/leads/{lead_id}/analyze")
async def analyze(lead_id: str, user=Depends(current_user)):
    lead = await own_lead(lead_id, user["id"])
    blocked(lead)

    async def gen():
        q: asyncio.Queue = asyncio.Queue()
        task = asyncio.create_task(run_analysis(user["id"], lead, q.put))
        while not task.done() or not q.empty():
            try:
                yield await asyncio.wait_for(q.get(), timeout=0.5)
            except asyncio.TimeoutError:
                continue
        try:
            yield {"done": True, "lead": out(task.result())}
        except LLMError as e:
            yield {"error": str(e)}
    return sse(gen)


@router.post("/leads/{lead_id}/data-quality")
async def data_quality(lead_id: str, user=Depends(current_user)):
    lead = await own_lead(lead_id, user["id"])
    others = await db.leads.find({"user_id": user["id"], "_id": {"$ne": lead["_id"]}},
                                 {"name": 1, "email": 1, "website": 1, "platform": 1, "handle": 1}).to_list(2000)
    dom = S.normalize_url(lead.get("website", "")).split("/")[0] if lead.get("website") else ""
    possible = []
    for o in others:
        reasons = []
        if lead.get("email") and o.get("email", "").lower() == lead["email"].lower():
            reasons.append("same email")
        if dom and o.get("website") and S.normalize_url(o["website"]).split("/")[0] == dom:
            reasons.append("same website domain")
        if SequenceMatcher(None, lead["name"].lower(), (o.get("name") or "").lower()).ratio() > 0.88:
            reasons.append("very similar name (not merged — names alone are not proof)")
        if reasons:
            possible.append({"lead_id": str(o["_id"]), "name": o.get("name"), "platform": o.get("platform"), "reasons": reasons})
    missing = [f for f in ("company", "website", "email", "country", "niche", "profile_url") if not lead.get(f)]
    prompt = (f"PROSPECT DATA\n{P.lead_text(lead)}\n\nCode checks: missing fields={missing}; possible duplicates={possible[:5]}\n\n"
              "Review data quality: inconsistent or suspicious fields (e.g. email domain unrelated to website, mismatched names, "
              "contact that looks personal rather than business), what is missing, and whether the possible duplicates look like the same "
              "person/company (never merge on name alone). Return JSON {verdict: good|needs_review|poor, issues: [..], missing: [..], duplicate_assessment}.")
    try:
        dq = await llm_json(user["id"], "data_quality", P.SYSTEM_ANALYST, prompt, P.DataQuality)
    except LLMError as e:
        raise HTTPException(502, str(e))
    res = {**dq.model_dump(), "possible_duplicates": possible[:10], "checked_at": now().isoformat()}
    await db.leads.update_one({"_id": lead["_id"]}, {"$set": {"data_quality": res}})
    return res


# ---------- Outreach drafts ----------
class DraftGen(BaseModel):
    type: Literal[tuple(P.MESSAGE_TYPES)] = "instagram_dm"
    tone: str = "friendly"
    length: str = "short"


@router.get("/leads/{lead_id}/drafts")
async def list_drafts(lead_id: str, user=Depends(current_user)):
    await own_lead(lead_id, user["id"])
    return [out(d) for d in await db.drafts.find({"lead_id": lead_id}).sort("created_at", -1).to_list(100)]


@router.post("/leads/{lead_id}/drafts/generate")
async def generate_draft(lead_id: str, body: DraftGen, user=Depends(current_user)):
    lead = await own_lead(lead_id, user["id"])
    blocked(lead)
    profile = await editor_profile(user["id"])
    portfolio = P.pick_portfolio(lead, profile)
    prev = ""
    if body.type == "follow_up":
        last = await db.drafts.find_one({"lead_id": lead_id, "status": "sent"}, sort=[("sent_at", -1)])
        prev = (last or {}).get("content", "")
    system = ("You write outreach for an individual freelance video editor. Natural, concise, human English. "
              "Never fabricate facts, results or compliments. Output only the message.")

    async def gen():
        text = ""
        async for chunk in stream_text(user["id"], "messages", system, P.message_prompt(lead, profile, body.type, body.tone, body.length, portfolio, prev)):
            text += chunk
            yield chunk
        subject = ""
        m = re.match(r"\s*subject:\s*(.+)\n+", text, re.I)
        if m:
            subject, text = m.group(1).strip(), text[m.end():]
        d = {"lead_id": lead_id, "user_id": user["id"], "type": body.type, "tone": body.tone, "length": body.length,
             "subject": subject, "content": text.strip(), "status": "draft", "portfolio": portfolio, "created_at": now()}
        res = await db.drafts.insert_one(d)
        d["_id"] = res.inserted_id
        await advance(lead, "outreach_drafted")
        await log_activity(user["id"], f"Drafted {body.type.replace('_', ' ')} for {lead['name']}", lead_id, "draft")
        yield {"done": True, "draft": out(d)}
    return sse(gen)


class DraftPatch(BaseModel):
    content: Optional[str] = None
    subject: Optional[str] = None
    status: Optional[Literal["draft", "approved"]] = None


async def own_draft(did: str, uid: str) -> dict:
    d = await db.drafts.find_one({"_id": oid(did), "user_id": uid})
    if not d:
        raise HTTPException(404, "Draft not found")
    return dict(d)


@router.patch("/drafts/{did}")
async def patch_draft(did: str, body: DraftPatch, user=Depends(current_user)):
    d = await own_draft(did, user["id"])
    if d["status"] == "sent":
        raise HTTPException(400, "Sent messages can't be edited")
    upd = {k: v for k, v in body.model_dump().items() if v is not None}
    if upd.get("status") == "approved":
        upd["approved_at"] = now()
        lead = await own_lead(d["lead_id"], user["id"])
        await advance(lead, "approved")
    await db.drafts.update_one({"_id": d["_id"]}, {"$set": upd})
    return out(await db.drafts.find_one({"_id": d["_id"]}))


@router.delete("/drafts/{did}")
async def delete_draft(did: str, user=Depends(current_user)):
    d = await own_draft(did, user["id"])
    await db.drafts.delete_one({"_id": d["_id"]})
    return {"ok": True}


async def record_sent(user: dict, d: dict, channel: str) -> dict:
    lead = await own_lead(d["lead_id"], user["id"])
    s = await get_settings(user["id"])
    count = lead.get("follow_up_count", 0) + (1 if d["type"] == "follow_up" else 0)
    nxt = now() + timedelta(days=int(s.get("follow_up_days", 3))) if count < int(s.get("max_follow_ups", 2)) else None
    await db.drafts.update_one({"_id": d["_id"]}, {"$set": {"status": "sent", "sent_at": now(), "channel": channel}})
    await db.leads.update_one({"_id": lead["_id"]}, {"$set": {"last_contact_at": now(), "follow_up_at": nxt,
                                                              "follow_up_count": count, "updated_at": now()}})
    await advance(lead, "contacted")
    await log_activity(user["id"], f"Sent {d['type'].replace('_', ' ')} to {lead['name']} via {channel}", d["lead_id"], "sent")
    return out(await db.drafts.find_one({"_id": d["_id"]}))


class SentIn(BaseModel):
    channel: str = "manual"


@router.post("/drafts/{did}/sent")
async def mark_sent(did: str, body: SentIn, user=Depends(current_user)):
    d = await own_draft(did, user["id"])
    blocked(await own_lead(d["lead_id"], user["id"]))
    if d["status"] != "approved":
        raise HTTPException(400, "Approve the message before marking it sent")
    return await record_sent(user, d, body.channel)


@router.post("/drafts/{did}/send-gmail")
async def send_gmail(did: str, user=Depends(current_user)):
    d = await own_draft(did, user["id"])
    lead = await own_lead(d["lead_id"], user["id"])
    blocked(lead)
    if d["status"] != "approved":
        raise HTTPException(400, "Approve the message before sending")
    if not lead.get("email"):
        raise HTTPException(400, "This lead has no email address")
    c = await composio_svc.composio_client(user["id"])
    if not c or not await composio_svc.is_connected(user["id"], "gmail"):
        raise HTTPException(400, "Connect Gmail in Connections first")

    def run():
        res = c.tools.execute("GMAIL_SEND_EMAIL", {"recipient_email": lead["email"], "subject": d.get("subject") or "Quick idea",
                                                   "body": d["content"]}, user_id=user["id"], dangerously_skip_version_check=True)
        return composio_svc.dump(res)
    res = await asyncio.to_thread(run)
    if not res.get("successful"):
        raise HTTPException(502, f"Gmail send failed: {str(res.get('error'))[:200]}")
    await audit(user, "gmail.sent", f"to {lead['email']}")
    return await record_sent(user, d, "gmail")


# ---------- Client replies ----------
class ReplyIn(BaseModel):
    text: str = Field(min_length=1, max_length=8000)


@router.post("/leads/{lead_id}/reply-explain")
async def reply_explain(lead_id: str, body: ReplyIn, user=Depends(current_user)):
    lead = await own_lead(lead_id, user["id"])
    lang = (await get_settings(user["id"])).get("language", "Bangla")
    profile = await editor_profile(user["id"])
    last = await db.drafts.find_one({"lead_id": lead_id, "status": "sent"}, sort=[("sent_at", -1)])
    prompt = (f"EDITOR PROFILE\n{P.profile_text(profile)}\n\nLEAD\n{P.lead_text(lead)}\n\nMY LAST MESSAGE\n{(last or {}).get('content', '(unknown)')}\n\n"
              f"CLIENT REPLY\n{body.text}\n\nExplain what the client means in {lang} (simple, clear). Classify intent. Suggest a short reply in ENGLISH "
              "matching the editor's tone. Return JSON {explanation (in " + lang + "), intent: positive|neutral|negative|objection|question, "
              "key_points (list, in " + lang + "), suggested_reply (English), next_step (in " + lang + ")}.")
    try:
        r = await llm_json(user["id"], "messages", P.SYSTEM_ANALYST, prompt, P.ReplyExplain)
    except LLMError as e:
        raise HTTPException(502, str(e))
    entry = {**r.model_dump(), "text": body.text, "language": lang, "created_at": now().isoformat()}
    await db.leads.update_one({"_id": lead["_id"]}, {"$push": {"replies": entry}, "$set": {
        "outcomes.replied": now().isoformat(), "follow_up_at": None, "updated_at": now(),
        **({"outcomes.positive_reply": now().isoformat()} if r.intent == "positive" else {})}})
    await advance(lead, "replied")
    await log_activity(user["id"], f"{lead['name']} replied ({r.intent})", lead_id, "reply")
    return entry


# ---------- Follow-ups ----------
@router.get("/followups")
async def followups(user=Depends(current_user)):
    docs = await db.leads.find({"user_id": user["id"], "follow_up_at": {"$ne": None}, "stage": {"$nin": TERMINAL + ["won"]}},
                               LIST_PROJ).sort("follow_up_at", 1).to_list(500)
    res = []
    for d in docs:
        r = out(d)
        delta = (aware(d["follow_up_at"]).date() - now().date()).days
        r["bucket"] = "overdue" if delta < 0 else ("today" if delta == 0 else "upcoming")
        res.append(r)
    return res


class FollowIn(BaseModel):
    action: Literal["done", "snooze", "set"]
    days: int = 2
    date: Optional[str] = None


@router.post("/leads/{lead_id}/followup")
async def followup_action(lead_id: str, body: FollowIn, user=Depends(current_user)):
    lead = await own_lead(lead_id, user["id"])
    if body.action == "done":
        val = None
    elif body.action == "snooze":
        val = now() + timedelta(days=body.days)
    else:
        val = aware(datetime.fromisoformat(body.date.replace("Z", "+00:00")))
    await db.leads.update_one({"_id": lead["_id"]}, {"$set": {"follow_up_at": val, "updated_at": now()}})
    return out(await db.leads.find_one({"_id": lead["_id"]}))


# ---------- Discovery / scraping ----------
class ScrapeIn(BaseModel):
    kind: Literal["instagram", "x", "youtube", "google"]
    targets: list[str] = Field(min_length=1, max_length=50)


@router.post("/scrape")
async def start_scrape(body: ScrapeIn, user=Depends(current_user)):
    uid = user["id"]
    targets = [t.strip() for t in body.targets if t.strip()]
    if not targets:
        raise HTTPException(400, "Add at least one target")
    items, notes, remaining = [], [], targets
    if body.kind in ("instagram", "x") and await composio_svc.composio_client(uid):
        remaining = []
        for t in targets[:20]:
            h = S.clean_handle(body.kind, t)
            data, note = await composio_svc.lookup_profile(uid, body.kind, h)
            p = from_composio(body.kind, data) if data else {}
            if p:
                lead = {"platform": body.kind, "handle": h, "name": p.get("name") or h, "email": "", "source": "composio",
                        "profile_url": f"https://{'instagram.com' if body.kind == 'instagram' else 'x.com'}/{h}", **p}
                lead["prelim_score"] = S.prelim_score(lead)
                items.append(lead)
            else:
                remaining.append(t)
                notes.append(f"@{h}: {note}")
        remaining += targets[20:]
    run_id = None
    if remaining:
        token = await provider_key(uid, "apify")
        if not token:
            if not items:
                raise HTTPException(400, "Add an Apify key (or connect Composio for IG/X) in API Manager first")
            notes.append("No Apify key for the rest")
        else:
            run = await S.start_run(token, body.kind, remaining)
            run_id = run["id"]
            await db.scrape_jobs.insert_one({"_id": run_id, "user_id": uid, "kind": body.kind, "targets": remaining,
                                             "status": run.get("status", "READY"), "created_at": now()})
            notes.append(f"Apify run started for {len(remaining)} target(s)")
    return {"id": run_id, "status": "RUNNING" if run_id else "SUCCEEDED", "items": items, "notes": notes}


@router.get("/scrape/{run_id}")
async def scrape_status(run_id: str, user=Depends(current_user)):
    job = await db.scrape_jobs.find_one({"_id": run_id, "user_id": user["id"]})
    if not job:
        raise HTTPException(404, "Job not found")
    if job.get("status") == "SUCCEEDED":
        return {"id": run_id, "status": "SUCCEEDED", "items": job.get("items", [])}
    token = await provider_key(user["id"], "apify")
    if not token:
        raise HTTPException(400, "Apify key missing")
    status, raw, msg = await S.run_status(token, run_id)
    items = S.normalize(job["kind"], raw) if status == "SUCCEEDED" else []
    await db.scrape_jobs.update_one({"_id": run_id}, {"$set": {"status": status, "items": items}})
    if status == "SUCCEEDED":
        await log_activity(user["id"], f"Discovery finished: {len(items)} {job['kind']} results")
    return {"id": run_id, "status": status, "items": items, "error": msg if status in ("FAILED", "ABORTED", "TIMED-OUT") else None}


class ImportIn(BaseModel):
    items: list[dict] = Field(min_length=1, max_length=200)


@router.post("/scrape/import")
async def import_leads(body: ImportIn, user=Depends(current_user)):
    saved, dups, dnc, ids = 0, 0, 0, []
    allowed = set(LeadIn.model_fields)
    for it in body.items:
        it = {k: v for k, v in it.items() if k in allowed}
        it["platform"] = it.get("platform") if it.get("platform") in PLATFORMS else "other"
        it["name"] = (it.get("name") or it.get("handle") or "").strip()[:200]
        if not it["name"]:
            continue
        try:
            data = LeadIn(**it).model_dump()
        except Exception:
            continue
        doc, dup = await insert_lead(user["id"], data)
        if dup:
            dnc += 1 if dup.get("do_not_contact") else 0
            dups += 0 if dup.get("do_not_contact") else 1
            continue
        saved += 1
        ids.append(str(doc["_id"]))
    await log_activity(user["id"], f"Imported {saved} leads ({dups} duplicates skipped, {dnc} on Do Not Contact)")
    return {"saved": saved, "duplicates": dups, "do_not_contact": dnc, "ids": ids}


class SuggestIn(BaseModel):
    focus: str = ""


@router.post("/scrape/suggest")
async def suggest_queries(body: SuggestIn, user=Depends(current_user)):
    profile = await editor_profile(user["id"])

    class Q(BaseModel):
        queries: list[str]
    prompt = (f"EDITOR PROFILE\n{P.profile_text(profile)}\n\nFocus: {body.focus or 'best recurring-client niches'}\n\n"
              "Write 6 precise Google search queries that find INTERNATIONAL prospects who publish videos and match this editor's target clients "
              "(use operators like site:, quotes, intitle:). Prefer business/brand pages with public contact info. Return JSON {queries: [..]}.")
    try:
        return await llm_json(user["id"], "relevance", "You are a lead-generation strategist. Return JSON only.", prompt, Q)
    except LLMError as e:
        raise HTTPException(502, str(e))
