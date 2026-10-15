from pathlib import Path
from dotenv import load_dotenv
load_dotenv(Path(__file__).parent / ".env")

import os
import re
from typing import Optional

from fastapi import FastAPI, APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field
from starlette.middleware.cors import CORSMiddleware

import prompts as P
from core import db, now, out, hash_password, verify_password, create_token, current_user, audit
import admin
import assistant
import keys
import leads

app = FastAPI()
auth = APIRouter(prefix="/api/auth")


class AuthIn(BaseModel):
    email: str
    password: str = Field(min_length=6)
    name: Optional[str] = None


def set_auth(response: Response, user: dict) -> dict:
    token = create_token(user["id"], user["email"])
    response.set_cookie("access_token", token, httponly=True, secure=True, samesite="none", max_age=604800, path="/")
    return {"user": user, "token": token}


@auth.post("/register")
async def register(body: AuthIn, response: Response):
    email = body.email.strip().lower()
    if not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", email):
        raise HTTPException(400, "Invalid email")
    if await db.users.find_one({"email": email}):
        raise HTTPException(400, "Email already registered")
    doc = {"email": email, "password_hash": hash_password(body.password), "name": body.name or email.split("@")[0],
           "role": "user", "active": True, "created_at": now()}
    res = await db.users.insert_one(doc)
    doc["_id"] = res.inserted_id
    user = out(doc)
    await audit(user, "auth.register")
    return set_auth(response, user)


@auth.post("/login")
async def login(body: AuthIn, request: Request, response: Response):
    email = body.email.strip().lower()
    ident = f"{request.client.host if request.client else ''}:{email}"
    att = await db.login_attempts.find_one({"identifier": ident})
    if att and att.get("count", 0) >= 5 and (now() - att["last"].replace(tzinfo=now().tzinfo)).total_seconds() < 900:
        raise HTTPException(429, "Too many attempts. Try again in 15 minutes.")
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(body.password, user["password_hash"]):
        await db.login_attempts.update_one({"identifier": ident}, {"$inc": {"count": 1}, "$set": {"last": now()}}, upsert=True)
        raise HTTPException(401, "Invalid email or password")
    if user.get("active") is False:
        raise HTTPException(403, "This account is disabled")
    await db.login_attempts.delete_one({"identifier": ident})
    u = out(user)
    await audit(u, "auth.login")
    return set_auth(response, u)


@auth.post("/logout")
async def logout(response: Response):
    response.delete_cookie("access_token", path="/")
    return {"ok": True}


@auth.get("/me")
async def me(user=Depends(current_user)):
    return user


app.include_router(auth)
for r in (leads.router, assistant.router, admin.router, keys.router):
    app.include_router(r)
app.add_middleware(CORSMiddleware, allow_credentials=True, allow_origin_regex=".*", allow_methods=["*"], allow_headers=["*"])

STAGE_MAP = {"new": "discovered", "researched": "ai_analyzed", "call_booked": "negotiation"}


async def migrate():
    """Safe, idempotent upgrade of v1 leads to the v2 schema. Never deletes data."""
    async for d in db.leads.find({"schema": {"$ne": 2}}):
        upd = {"schema": 2}
        st = d.get("stage", "new")
        if st in STAGE_MAP:
            upd["stage"] = STAGE_MAP[st]
            if st == "call_booked":
                upd["outcomes.call_booked"] = now().isoformat()
        if "profile_url" not in d:
            upd["profile_url"] = d.get("url", "")
        if isinstance(d.get("analysis"), str):
            upd["legacy_analysis"] = d["analysis"]
            upd["analysis"] = None
        if isinstance(d.get("outreach"), dict) and d["outreach"].get("dm"):
            for t, k in (("instagram_dm", "dm"), ("business_email", "email"), ("follow_up", "followup")):
                if d["outreach"].get(k):
                    await db.drafts.insert_one({"lead_id": str(d["_id"]), "user_id": d["user_id"], "type": t, "subject": "",
                                                "content": d["outreach"][k], "status": "draft", "tone": d["outreach"].get("tone", ""),
                                                "length": "", "portfolio": {}, "created_at": now()})
        handle = (d.get("handle") or "").lstrip("@")
        upd.update({"handle_lc": handle.lower(), "url_norm": leads.S.normalize_url(upd.get("profile_url") or d.get("profile_url", ""), d.get("platform", ""), handle),
                    "pinned": d.get("pinned", False), "opt_out": d.get("opt_out", False), "do_not_contact": d.get("do_not_contact", False),
                    "priority": d.get("priority") or "unscored", "outcomes": d.get("outcomes") or {}, "follow_up_at": d.get("follow_up_at"),
                    "follow_up_count": d.get("follow_up_count", 0), "discovered_at": d.get("discovered_at") or d.get("created_at", now()),
                    "last_contact_at": d.get("last_contact_at"), "sources": d.get("sources") or [leads.S.source_record("manual", ["name"])]})
        if not isinstance(d.get("score"), (int, float)) or d.get("score_breakdown") is None:
            upd["prelim_score_v1"] = d.get("score")
            upd["score"] = None
        if d.get("contact"):
            upd["email"] = d["contact"] if "@" in str(d["contact"]) else d.get("email", "")
        await db.leads.update_one({"_id": d["_id"]}, {"$set": upd, "$unset": {"outreach": "", "contact": ""}})


@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)
    await db.leads.create_index([("user_id", 1), ("updated_at", -1)])
    await db.leads.create_index([("user_id", 1), ("url_norm", 1)])
    await db.leads.create_index([("user_id", 1), ("platform", 1), ("handle_lc", 1)])
    await db.messages.create_index([("lead_id", 1), ("created_at", 1)])
    await db.drafts.create_index([("lead_id", 1), ("created_at", -1)])
    await db.api_usage.create_index([("user_id", 1), ("created_at", -1)])
    await db.login_attempts.create_index("identifier")
    await db.audit_logs.create_index("created_at")
    email, pw = os.environ["ADMIN_EMAIL"], os.environ["ADMIN_PASSWORD"]
    existing = await db.users.find_one({"email": email})
    if not existing:
        res = await db.users.insert_one({"email": email, "password_hash": hash_password(pw), "name": "Super Admin",
                                         "role": "admin", "active": True, "created_at": now()})
        admin_id = str(res.inserted_id)
    else:
        admin_id = str(existing["_id"])
        upd = {"role": "admin", "active": True}
        if not verify_password(pw, existing["password_hash"]):
            upd["password_hash"] = hash_password(pw)
        await db.users.update_one({"_id": existing["_id"]}, {"$set": upd})
    if not await db.editor_profiles.find_one({"user_id": admin_id}):
        await db.editor_profiles.insert_one({"user_id": admin_id, **P.ZISAN_PROFILE})
    await migrate()
    async for s in db.settings.find({"retention_days": {"$gt": 0}}):
        await admin.apply_retention(s["user_id"], s["retention_days"])
