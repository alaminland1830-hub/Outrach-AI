import re
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

import composio_svc
import prompts as P
from core import db, now, out, current_user, log_activity, audit
from leads import own_lead, apply_patch, insert_lead, editor_profile, LeadIn, sse, ORDER, TERMINAL
from llm import agent_stream

router = APIRouter(prefix="/api")

CONFIRM_RX = re.compile(r"\b(yes|confirm(ed)?|send it|go ahead|do it|approved?|ok,? send|proceed)\b|হ্যাঁ|হা|পাঠাও|করো", re.I)
PROFILE_FIELDS = ["name", "niche", "company_type", "services", "editing_style", "target_clients", "pricing", "experience",
                  "positioning", "tone", "business_goal", "universal_portfolio", "instagram_profile"]


def fn(name, desc, props, required=()):
    return {"type": "function", "function": {"name": name, "description": desc,
                                             "parameters": {"type": "object", "properties": props, "required": list(required)}}}


INTERNAL_TOOLS = [
    fn("search_leads", "Search the user's CRM leads", {"query": {"type": "string"}, "stage": {"type": "string", "enum": ORDER + TERMINAL},
                                                        "min_score": {"type": "integer"}, "limit": {"type": "integer"}}),
    fn("get_lead", "Get full details of one lead", {"lead_id": {"type": "string"}}, ["lead_id"]),
    fn("update_lead", "Update CRM fields of a lead (stage, notes, niche, company, email, country, follow_up_at ISO date)",
       {"lead_id": {"type": "string"}, "updates": {"type": "object", "properties": {
           "stage": {"type": "string", "enum": ORDER + TERMINAL}, "notes": {"type": "string"}, "niche": {"type": "string"},
           "company": {"type": "string"}, "email": {"type": "string"}, "country": {"type": "string"}, "follow_up_at": {"type": "string"}}}},
       ["lead_id", "updates"]),
    fn("add_lead", "Add a new lead to the CRM (duplicates are rejected)",
       {"name": {"type": "string"}, "platform": {"type": "string", "enum": ["instagram", "x", "youtube", "linkedin", "tiktok", "website", "other"]},
        "profile_url": {"type": "string"}, "handle": {"type": "string"}, "notes": {"type": "string"}}, ["name", "platform"]),
    fn("save_draft", "Save an outreach message draft for a lead (never sends it)",
       {"lead_id": {"type": "string"}, "type": {"type": "string", "enum": list(P.MESSAGE_TYPES)}, "content": {"type": "string"},
        "subject": {"type": "string"}}, ["lead_id", "type", "content"]),
    fn("get_editor_profile", "Get the editor's profile (services, style, pricing, portfolio)", {}),
    fn("update_editor_profile", "Update fields of the editor's profile", {"updates": {"type": "object", "properties": {f: {"type": "string"} for f in PROFILE_FIELDS}}}, ["updates"]),
    fn("pipeline_stats", "Count leads by stage", {}),
]
INTERNAL = {t["function"]["name"] for t in INTERNAL_TOOLS}


def slim(d: dict) -> dict:
    keep = ("id", "name", "company", "platform", "handle", "profile_url", "website", "email", "niche", "stage", "score", "priority",
            "follow_up_at", "notes", "recommended_service", "last_contact_at", "do_not_contact")
    return {k: d.get(k) for k in keep if d.get(k) not in (None, "", [])}


async def run_internal(user: dict, name: str, a: dict):
    uid = user["id"]
    if name == "search_leads":
        f = {"user_id": uid}
        if a.get("query"):
            rx = {"$regex": re.escape(a["query"]), "$options": "i"}
            f["$or"] = [{"name": rx}, {"handle": rx}, {"niche": rx}, {"company": rx}]
        if a.get("stage"):
            f["stage"] = a["stage"]
        if a.get("min_score"):
            f["score"] = {"$gte": a["min_score"]}
        docs = await db.leads.find(f).sort("score", -1).to_list(min(int(a.get("limit") or 20), 50))
        return {"leads": [slim(out(d)) for d in docs]}
    if name == "get_lead":
        d = out(await own_lead(a["lead_id"], uid))
        for k in ("sources", "website_excerpt", "transcript"):
            d.pop(k, None)
        return d
    if name == "update_lead":
        lead = await own_lead(a["lead_id"], uid)
        allowed = {k: v for k, v in (a.get("updates") or {}).items() if k in ("stage", "notes", "niche", "company", "email", "country", "follow_up_at")}
        d = await apply_patch(lead, allowed, user)
        await log_activity(uid, f"AI assistant updated {lead['name']}: {', '.join(allowed)}", a["lead_id"], "ai")
        return {"ok": True, "lead": slim(out(d))}
    if name == "add_lead":
        try:
            data = LeadIn(**{k: v for k, v in a.items() if k in LeadIn.model_fields}).model_dump()
        except Exception as e:
            return {"error": str(e)[:200]}
        doc, dup = await insert_lead(uid, data)
        if dup:
            return {"error": f"Duplicate of existing lead {dup['name']} ({dup['_id']})"}
        await log_activity(uid, f"AI assistant added lead {doc['name']}", str(doc["_id"]), "ai")
        return {"ok": True, "lead_id": str(doc["_id"])}
    if name == "save_draft":
        lead = await own_lead(a["lead_id"], uid)
        if lead.get("do_not_contact"):
            return {"error": "Lead is Do Not Contact"}
        await db.drafts.insert_one({"lead_id": a["lead_id"], "user_id": uid, "type": a.get("type", "instagram_dm"), "tone": "assistant",
                                    "length": "", "subject": a.get("subject", ""), "content": a["content"], "status": "draft",
                                    "portfolio": {}, "created_at": now()})
        return {"ok": True, "note": "Saved as draft. The user must approve it in the Messages tab."}
    if name == "get_editor_profile":
        return await editor_profile(uid)
    if name == "update_editor_profile":
        upd = {k: v for k, v in (a.get("updates") or {}).items() if k in PROFILE_FIELDS}
        await db.editor_profiles.update_one({"user_id": uid}, {"$set": upd}, upsert=True)
        await log_activity(uid, f"AI assistant updated editor profile: {', '.join(upd)}", None, "ai")
        return {"ok": True, "updated": list(upd)}
    if name == "pipeline_stats":
        rows = await db.leads.aggregate([{"$match": {"user_id": uid}}, {"$group": {"_id": "$stage", "n": {"$sum": 1}}}]).to_list(50)
        return {r["_id"]: r["n"] for r in rows}
    return {"error": "unknown tool"}


class ChatIn(BaseModel):
    message: str = Field(min_length=1, max_length=8000)


def history_msgs(docs: list) -> list:
    return [{"role": m["role"], "content": m["content"]} for m in docs if m.get("content")]


async def chat_stream(user: dict, thread: str, system: str, message: str):
    uid = user["id"]
    hist = await db.messages.find({"user_id": uid, "lead_id": thread}).sort("created_at", -1).to_list(24)
    hist.reverse()
    await db.messages.insert_one({"lead_id": thread, "user_id": uid, "role": "user", "content": message, "created_at": now()})
    session, ctools = (None, [])
    try:
        session, ctools = await composio_svc.agent_session(uid)
    except Exception:
        session, ctools = None, []
    confirmed = bool(CONFIRM_RX.search(message))

    async def executor(name, args):
        if name in INTERNAL:
            try:
                return await run_internal(user, name, args)
            except HTTPException as e:
                return {"error": e.detail}
        if not session:
            return {"error": "Composio is not connected"}
        if composio_svc.needs_confirmation(name, args) and not confirmed:
            return {"error": "BLOCKED: this action sends/changes data in an external app. Show the user exactly what will be sent/changed "
                             "and ask them to reply 'confirm'. Do not retry until they confirm."}
        res = await composio_svc.execute(session, name, args)
        await audit(user, "composio.tool", name)
        return res

    sys = system + ("\n\nConnected-app tools (Composio) are available: search for the right tool, check connection, then execute. "
                    "If an app is not connected, tell the user to connect it on the Connections page." if session else
                    "\n\nNo external apps are connected (Composio key missing). You can still use the CRM tools.")
    sys += (" ALWAYS show drafts and ask for confirmation before sending emails/DMs/posts or writing to external apps. "
            "Never fabricate data. Respect Do Not Contact leads.")

    async def gen():
        reply, tools_used = "", []
        async for kind, val in agent_stream(uid, "chat", sys, history_msgs(hist), message, INTERNAL_TOOLS + ctools, executor):
            if kind == "t":
                reply += val
                yield {"t": val}
            else:
                if val["status"] != "running":
                    tools_used.append(val)
                yield {"ev": "tool", **val}
        await db.messages.insert_one({"lead_id": thread, "user_id": uid, "role": "assistant", "content": reply,
                                      "tools": tools_used, "created_at": now()})
        yield {"done": True}
    return sse(gen)


ASSISTANT_SYSTEM = ("You are OUTREACH.AI, the AI sales assistant of an individual freelance video editor. You manage their CRM, analyze their "
                    "editing style from what they tell you, update their profile, write outreach and help manage clients. Be concise; use markdown.")


@router.post("/leads/{lead_id}/chat")
async def lead_chat(lead_id: str, body: ChatIn, user=Depends(current_user)):
    lead = await own_lead(lead_id, user["id"])
    profile = await editor_profile(user["id"])
    a = lead.get("analysis") or {}
    drafts = await db.drafts.find({"lead_id": lead_id}).sort("created_at", -1).to_list(5)
    memory = (f"LEAD MEMORY (lead_id={lead_id})\n{P.lead_text(lead)}\nStage: {lead.get('stage')} | Score: {lead.get('score')} ({lead.get('priority')})\n"
              f"Analysis: {({k: a.get(k) for k in ('what_they_do', 'niche', 'recommended_service', 'outreach_angle', 'opportunities', 'sample_video_idea')})}\n"
              f"Recent drafts: {[(d['type'], d['status'], d['content'][:300]) for d in drafts]}\n"
              f"Client replies: {[r.get('text', '')[:300] for r in (lead.get('replies') or [])[-3:]]}\n\nEDITOR PROFILE\n{P.profile_text(profile)}")
    system = ASSISTANT_SYSTEM + " You are the dedicated memory for ONE lead; always use what you know about them.\n\n" + memory
    if lead.get("do_not_contact"):
        system += "\nTHIS LEAD IS DO NOT CONTACT: never draft or send outreach to them."
    return await chat_stream(user, lead_id, system, body.message)


@router.get("/leads/{lead_id}/messages")
async def lead_messages(lead_id: str, user=Depends(current_user)):
    await own_lead(lead_id, user["id"])
    return [out(d) for d in await db.messages.find({"lead_id": lead_id, "user_id": user["id"]}).sort("created_at", 1).to_list(500)]


@router.delete("/leads/{lead_id}/messages")
async def clear_lead_messages(lead_id: str, user=Depends(current_user)):
    await own_lead(lead_id, user["id"])
    await db.messages.delete_many({"lead_id": lead_id, "user_id": user["id"]})
    return {"ok": True}


@router.post("/assistant/chat")
async def assistant_chat(body: ChatIn, user=Depends(current_user)):
    profile = await editor_profile(user["id"])
    return await chat_stream(user, "assistant", ASSISTANT_SYSTEM + f"\n\nEDITOR PROFILE\n{P.profile_text(profile)}", body.message)


@router.get("/assistant/messages")
async def assistant_messages(user=Depends(current_user)):
    return [out(d) for d in await db.messages.find({"lead_id": "assistant", "user_id": user["id"]}).sort("created_at", 1).to_list(500)]


@router.delete("/assistant/messages")
async def clear_assistant(user=Depends(current_user)):
    await db.messages.delete_many({"lead_id": "assistant", "user_id": user["id"]})
    return {"ok": True}


# ---------- Connections (Composio) ----------
@router.get("/connections")
async def list_connections(user=Depends(current_user)):
    has_key = bool(await composio_svc.composio_client(user["id"]))
    try:
        rows = await composio_svc.connectors(user["id"])
    except Exception as e:
        raise HTTPException(502, f"Composio error: {str(e)[:200]}")
    return {"has_key": has_key, "connectors": rows}


class ConnectIn(BaseModel):
    callback_url: str


@router.post("/connections/{slug}/connect")
async def connect_app(slug: str, body: ConnectIn, request: Request, user=Depends(current_user)):
    if slug not in {c["slug"] for c in composio_svc.CONNECTORS}:
        raise HTTPException(400, "Unsupported app")
    if not await composio_svc.composio_client(user["id"]):
        raise HTTPException(400, "Add your Composio API key in API Manager first")
    origin = request.headers.get("origin") or ""
    if not body.callback_url.startswith("https://") or (origin and urlparse(body.callback_url).netloc != urlparse(origin).netloc):
        raise HTTPException(400, "Invalid callback URL")
    try:
        url = await composio_svc.connect(user["id"], slug, body.callback_url)
    except Exception as e:
        raise HTTPException(502, f"Composio error: {str(e)[:200]}")
    await audit(user, "connection.started", slug)
    return {"redirect_url": url}


@router.delete("/connections/{slug}")
async def disconnect_app(slug: str, user=Depends(current_user)):
    try:
        n = await composio_svc.disconnect(user["id"], slug)
    except Exception as e:
        raise HTTPException(502, f"Composio error: {str(e)[:200]}")
    await audit(user, "connection.removed", slug)
    return {"removed": n}
