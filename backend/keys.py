import time
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from core import db, now, out, oid, enc, dec, current_user, audit
from llm import PROVIDERS

router = APIRouter(prefix="/api/keys")

KINDS = {**{p: "llm" for p in PROVIDERS}, "apify": "scraper", "firecrawl": "scraper", "browserless": "scraper",
         "composio": "connector"}
LABELS = {"openai": "OpenAI", "anthropic": "Anthropic", "gemini": "Gemini", "xai": "xAI Grok", "groq": "Groq",
          "openrouter": "OpenRouter", "deepseek": "DeepSeek", "perplexity": "Perplexity", "custom": "Custom (OpenAI-compatible)",
          "apify": "Apify", "firecrawl": "Firecrawl", "browserless": "Browserless", "composio": "Composio"}
PREFIXES = [("sk-ant-", "anthropic"), ("AIza", "gemini"), ("gsk_", "groq"), ("pplx-", "perplexity"), ("fc-", "firecrawl"),
            ("xai-", "xai"), ("sk-or-", "openrouter"), ("apify_api_", "apify"), ("ak_", "composio"), ("sk-", "openai")]


def detect(key: str) -> Optional[str]:
    return next((p for pre, p in PREFIXES if key.startswith(pre)), None)


def mask(key: str) -> str:
    return f"{key[:6]}****{key[-4:]}" if len(key) > 12 else "****"


async def validate_key(provider: str, key: str, base_url: str = "") -> dict:
    t0 = time.time()
    url, headers, params = None, {}, {}
    if provider == "anthropic":
        url, headers = "https://api.anthropic.com/v1/models", {"x-api-key": key, "anthropic-version": "2023-06-01"}
    elif provider == "gemini":
        url, params = "https://generativelanguage.googleapis.com/v1beta/models", {"key": key, "pageSize": 200}
    elif provider in PROVIDERS:
        base = (base_url or PROVIDERS[provider][2] or "").rstrip("/")
        if not base:
            return {"ok": False, "error": "Base URL is required for a custom provider"}
        url, headers = f"{base}/models", {"Authorization": f"Bearer {key}"}
    elif provider == "apify":
        url, headers = "https://api.apify.com/v2/users/me", {"Authorization": f"Bearer {key}"}
    elif provider == "firecrawl":
        url, headers = "https://api.firecrawl.dev/v1/team/credit-usage", {"Authorization": f"Bearer {key}"}
    elif provider == "composio":
        url, headers, params = "https://backend.composio.dev/api/v3/toolkits", {"x-api-key": key}, {"limit": 1}
    else:
        return {"ok": True, "unverified": True, "latency_ms": 0}
    try:
        async with httpx.AsyncClient(timeout=20) as c:
            r = await c.get(url, headers=headers, params=params)
    except httpx.HTTPError as e:
        return {"ok": False, "error": f"Network error: {str(e)[:120]}"}
    ms = int((time.time() - t0) * 1000)
    if r.status_code == 429:
        return {"ok": True, "rate_limited": True, "latency_ms": ms}
    if r.status_code >= 400:
        return {"ok": False, "error": f"Rejected by {LABELS.get(provider, provider)} ({r.status_code})", "latency_ms": ms}
    count = None
    try:
        body = r.json()
        items = body.get("data") or body.get("models")
        count = len(items) if isinstance(items, list) else None
    except Exception:
        pass
    return {"ok": True, "latency_ms": ms, "model_count": count}


class KeyIn(BaseModel):
    api_key: str = Field(min_length=8, max_length=500)
    provider: Optional[str] = None
    model: Optional[str] = ""
    label: Optional[str] = ""
    base_url: Optional[str] = ""


def resolve_provider(body: KeyIn) -> str:
    p = body.provider if body.provider and body.provider != "auto" else detect(body.api_key.strip())
    if not p or p not in KINDS:
        raise HTTPException(400, "Could not detect the provider. Pick it from the list.")
    return p


@router.post("/detect")
async def detect_key(body: KeyIn, user=Depends(current_user)):
    p = detect(body.api_key.strip())
    return {"provider": p, "label": LABELS.get(p) if p else None}


@router.post("/validate")
async def validate(body: KeyIn, user=Depends(current_user)):
    p = resolve_provider(body)
    return {"provider": p, **(await validate_key(p, body.api_key.strip(), body.base_url or ""))}


@router.get("")
async def list_keys(user=Depends(current_user)):
    docs = await db.api_keys.find({"user_id": user["id"]}).sort("priority", 1).to_list(100)
    return {"keys": [out(d) for d in docs], "providers": [{"id": k, "label": v, "kind": KINDS[k]} for k, v in LABELS.items()]}


@router.post("")
async def save_key(body: KeyIn, user=Depends(current_user)):
    p = resolve_provider(body)
    key = body.api_key.strip()
    v = await validate_key(p, key, body.base_url or "")
    if not v["ok"]:
        raise HTTPException(400, v["error"])
    last = await db.api_keys.find_one({"user_id": user["id"]}, sort=[("priority", -1)])
    doc = {"user_id": user["id"], "provider": p, "kind": KINDS[p], "label": body.label or "", "model": body.model or "",
           "base_url": body.base_url or "", "key_enc": enc(key), "masked": mask(key), "enabled": True,
           "priority": (last["priority"] + 1) if last else 0,
           "status": "rate_limited" if v.get("rate_limited") else ("unverified" if v.get("unverified") else "active"),
           "status_at": now(), "latency_ms": v.get("latency_ms"), "model_count": v.get("model_count"),
           "last_checked_at": now(), "created_at": now()}
    res = await db.api_keys.insert_one(doc)
    doc["_id"] = res.inserted_id
    await audit(user, "api_key.added", f"{p} {doc['masked']}")
    return out(doc)


async def own_key(kid: str, uid: str) -> dict:
    k = await db.api_keys.find_one({"_id": oid(kid), "user_id": uid})
    if not k:
        raise HTTPException(404, "Key not found")
    return dict(k)


@router.post("/{kid}/check")
async def check_key(kid: str, user=Depends(current_user)):
    k = await own_key(kid, user["id"])
    v = await validate_key(k["provider"], dec(k["key_enc"]), k.get("base_url", ""))
    status = "invalid" if not v["ok"] else ("rate_limited" if v.get("rate_limited") else ("unverified" if v.get("unverified") else "active"))
    upd = {"status": status, "status_at": now(), "latency_ms": v.get("latency_ms"), "last_checked_at": now(),
           "last_error": v.get("error", "")}
    if v.get("model_count") is not None:
        upd["model_count"] = v["model_count"]
    await db.api_keys.update_one({"_id": k["_id"]}, {"$set": upd})
    return out(await db.api_keys.find_one({"_id": k["_id"]}))


class KeyPatch(BaseModel):
    enabled: Optional[bool] = None
    label: Optional[str] = None
    model: Optional[str] = None
    base_url: Optional[str] = None


@router.patch("/{kid}")
async def patch_key(kid: str, body: KeyPatch, user=Depends(current_user)):
    k = await own_key(kid, user["id"])
    upd = {f: v for f, v in body.model_dump().items() if v is not None}
    if upd:
        await db.api_keys.update_one({"_id": k["_id"]}, {"$set": upd})
    return out(await db.api_keys.find_one({"_id": k["_id"]}))


class OrderIn(BaseModel):
    ids: list[str]


@router.put("/order")
async def reorder(body: OrderIn, user=Depends(current_user)):
    for i, kid in enumerate(body.ids):
        await db.api_keys.update_one({"_id": oid(kid), "user_id": user["id"]}, {"$set": {"priority": i}})
    return {"ok": True}


@router.delete("/{kid}")
async def delete_key(kid: str, user=Depends(current_user)):
    k = await own_key(kid, user["id"])
    await db.api_keys.delete_one({"_id": k["_id"]})
    await audit(user, "api_key.deleted", f"{k['provider']} {k.get('masked')}")
    return {"ok": True}


@router.get("/usage")
async def usage(user=Depends(current_user)):
    rows = await db.api_usage.aggregate([
        {"$match": {"user_id": user["id"]}},
        {"$group": {"_id": {"provider": "$provider", "builtin": "$builtin", "kind": "$kind"}, "calls": {"$sum": 1},
                    "failed": {"$sum": {"$cond": ["$ok", 0, 1]}}, "tokens": {"$sum": {"$add": ["$input_tokens", "$output_tokens"]}},
                    "cost": {"$sum": "$cost_usd"}}},
    ]).to_list(100)
    recent = await db.api_usage.find({"user_id": user["id"]}, {"_id": 0, "user_id": 0}).sort("created_at", -1).to_list(15)
    for r in recent:
        r["created_at"] = r["created_at"].isoformat()
    return {"summary": [{**r["_id"], "calls": r["calls"], "failed": r["failed"], "tokens": r["tokens"],
                         "cost": round(r["cost"], 4)} for r in rows], "recent": recent}
