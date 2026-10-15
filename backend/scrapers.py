import re
import time
from typing import Any
from urllib.parse import urlparse

import httpx
from fastapi import HTTPException

from core import db, now

APIFY = "https://api.apify.com/v2"
ACTORS = {
    "instagram": "apify~instagram-profile-scraper",
    "x": "datapilot~twitter-x-profile-scraper",
    "youtube": "streamers~youtube-channel-scraper",
    "google": "apify~google-search-scraper",
}
SOURCE_INFO = {
    "apify": {"method": "Apify actor (public profile scraper)", "limits": "Public data only; may be blocked or incomplete; billed by Apify",
              "usage": "Lead research for one-to-one outreach", "contact": "Contact data is unverified"},
    "composio": {"method": "Composio tool via your connected account (official API)", "limits": "Limited by the platform API scope and your account tier",
                 "usage": "Lead research for one-to-one outreach", "contact": "Respect platform messaging rules"},
    "firecrawl": {"method": "Firecrawl website scrape (public page)", "limits": "Only the public page content; robots and site terms apply",
                  "usage": "Business research", "contact": "Use only public business contacts"},
    "manual": {"method": "Entered by you", "limits": "As provided", "usage": "Lead research", "contact": "As provided"},
}


def source_record(source: str, fields: list[str], note: str = "") -> dict:
    i = SOURCE_INFO[source]
    return {"source": source, "method": i["method"], "access_limits": i["limits"], "allowed_usage": i["usage"],
            "contact_restrictions": i["contact"], "fields": fields, "note": note, "checked_at": now().isoformat()}


def clean_handle(kind: str, value: str) -> str:
    v = (value or "").strip()
    if kind in ("instagram", "x"):
        v = re.sub(r"^https?://(www\.)?(instagram\.com|x\.com|twitter\.com)/", "", v).strip("/@ ").split("/")[0].split("?")[0]
    return v[:500]


def normalize_url(url: str, platform: str = "", handle: str = "") -> str:
    h = (handle or "").strip().lstrip("@").lower()
    if h and platform in ("instagram", "x", "tiktok", "youtube"):
        dom = {"instagram": "instagram.com", "x": "x.com", "tiktok": "tiktok.com", "youtube": "youtube.com"}[platform]
        return f"{dom}/{'@' if platform in ('youtube', 'tiktok') else ''}{h}"
    if not url:
        return ""
    u = url.strip().lower()
    if not re.match(r"^https?://", u):
        u = "https://" + u
    p = urlparse(u)
    host = p.netloc.replace("www.", "").replace("twitter.com", "x.com").replace("m.youtube.com", "youtube.com")
    path = p.path.rstrip("/")
    if host in ("instagram.com", "x.com", "tiktok.com") and path:
        path = "/" + path.strip("/").split("/")[0]
    return f"{host}{path}"


def handle_from_url(url: str, platform: str) -> str:
    m = re.search(r"(instagram\.com|x\.com|twitter\.com|tiktok\.com/@|youtube\.com/@)/?([A-Za-z0-9_.\-]+)", url or "", re.I)
    return m.group(2) if m and platform in ("instagram", "x", "tiktok", "youtube") else ""


def actor_input(kind: str, targets: list[str]) -> dict[str, Any]:
    t = [clean_handle(kind, x) for x in targets if x.strip()]
    if kind == "instagram":
        return {"usernames": t, "resultsLimit": 12}
    if kind == "x":
        return {"profiles": t, "useApifyProxy": True, "apifyProxyGroups": ["RESIDENTIAL"]}
    if kind == "youtube":
        urls = [x if x.startswith("http") else f"https://www.youtube.com/@{x.lstrip('@')}" for x in t]
        return {"startUrls": [{"url": u, "method": "GET"} for u in urls], "maxResults": 8, "maxResultsShorts": 4, "maxResultStreams": 0}
    return {"queries": "\n".join(t), "maxPagesPerQuery": 1, "countryCode": "us", "languageCode": "en", "resultsPerPage": 10}


def pick(d: dict, *keys, default=None):
    for k in keys:
        v = d.get(k) if isinstance(d, dict) else None
        if v not in (None, "", [], {}):
            return v
    return default


def deep_find(obj, keys: tuple, depth=0):
    if depth > 5:
        return None
    if isinstance(obj, dict):
        for k in keys:
            if obj.get(k) not in (None, "", [], {}):
                return obj[k]
        for v in obj.values():
            r = deep_find(v, keys, depth + 1)
            if r is not None:
                return r
    elif isinstance(obj, list):
        for v in obj[:5]:
            r = deep_find(v, keys, depth + 1)
            if r is not None:
                return r
    return None


def to_int(v) -> int:
    try:
        return int(v or 0)
    except (TypeError, ValueError):
        return 0


def _post(p: dict) -> dict:
    return {"text": str(pick(p, "caption", "text", "full_text", "description", default=""))[:400],
            "type": str(pick(p, "type", "productType", "media_type", default="post")),
            "url": pick(p, "url", "permalink", default=""), "views": to_int(pick(p, "videoViewCount", "videoPlayCount", "viewCount", "view_count")),
            "likes": to_int(pick(p, "likesCount", "like_count", "favorite_count", "likes")),
            "date": str(pick(p, "timestamp", "created_at", "date", default=""))[:10]}


def normalize(kind: str, items: list[dict]) -> list[dict]:
    leads = []
    if kind == "google":
        for it in items:
            for r in it.get("organicResults") or []:
                url = r.get("url", "")
                plat = next((p for p, d in (("instagram", "instagram.com"), ("x", "x.com"), ("x", "twitter.com"),
                                            ("youtube", "youtube.com"), ("tiktok", "tiktok.com")) if d in url), "website")
                leads.append({"platform": plat, "name": r.get("title", "")[:120], "handle": handle_from_url(url, plat),
                              "profile_url": url, "bio": r.get("description", ""), "website": url if plat == "website" else "",
                              "followers": 0, "email": "", "source": "apify"})
    elif kind == "youtube":
        chans = {}
        for it in items:
            url = pick(it, "channelUrl", "inputChannelUrl", default="")
            ch = chans.setdefault(url, {"platform": "youtube", "name": pick(it, "channelName", default=""),
                                        "handle": str(pick(it, "channelUsername", default="")).lstrip("@"), "profile_url": url,
                                        "bio": pick(it, "channelDescription", default=""), "website": "",
                                        "followers": to_int(pick(it, "numberOfSubscribers", default=0)), "email": "",
                                        "country": pick(it, "channelLocation", default=""),
                                        "avatar": pick(it, "channelAvatarUrl", default=""), "videos": [], "source": "apify"})
            if it.get("title"):
                ch["videos"].append({"title": it.get("title"), "url": it.get("url", ""), "views": to_int(it.get("viewCount")),
                                     "duration": it.get("duration", ""), "date": str(it.get("date", ""))[:10],
                                     "text": str(it.get("text", ""))[:300]})
        leads = list(chans.values())
    else:
        for it in items:
            user = it.get("user") if isinstance(it.get("user"), dict) else it
            handle = pick(user, "username", "screen_name", "userName", "handle", default="")
            posts = pick(user, "latestPosts", "tweets", default=[]) or []
            leads.append({
                "platform": kind, "name": pick(user, "fullName", "name", default=handle), "handle": handle,
                "profile_url": pick(user, "url", "profileUrl", default=(f"https://instagram.com/{handle}" if kind == "instagram" else f"https://x.com/{handle}")),
                "bio": pick(user, "biography", "description", "bio", default=""),
                "website": pick(user, "externalUrl", "website", "expanded_url", default=""),
                "followers": to_int(pick(user, "followersCount", "followers_count", "followers", default=0)),
                "following": to_int(pick(user, "followsCount", "friends_count", "following", default=0)),
                "posts": to_int(pick(user, "postsCount", "statuses_count", "tweetsCount", default=0)),
                "email": pick(user, "businessEmail", "publicEmail", "email", default=""),
                "company": pick(user, "businessCategoryName", "category", default=""),
                "country": pick(user, "location", default=""),
                "avatar": pick(user, "profilePicUrl", "profile_image_url_https", "profilePicture", default=""),
                "recent": [_post(p) for p in posts[:10] if isinstance(p, dict)], "source": "apify"})
    for lead in leads:
        lead["prelim_score"] = prelim_score(lead)
    return leads


def prelim_score(lead: dict) -> int:
    """Quick pre-AI signal for sorting scrape results only; the real score comes from AI analysis."""
    s = 0
    vids = sum(1 for p in lead.get("recent") or [] if re.search(r"video|reel|clip", str(p.get("type")), re.I)) + len(lead.get("videos") or [])
    s += min(30, vids * 5)
    if re.search(r"saas|founder|coach|consult|podcast|course|educat|business|startup|agency|brand", f"{lead.get('bio')} {lead.get('name')}", re.I):
        s += 30
    if lead.get("website"):
        s += 20
    if lead.get("email"):
        s += 20
    return min(s, 100)


async def log_scrape(uid: str, provider: str, ok: bool, t0: float, error: str = ""):
    await db.api_usage.insert_one({"user_id": uid, "task": "scrape", "provider": provider, "model": "", "key_id": None,
                                   "builtin": False, "kind": "scraper", "input_tokens": 0, "output_tokens": 0, "cost_usd": 0,
                                   "latency_ms": int((time.time() - t0) * 1000), "ok": ok, "error": error[:300], "created_at": now()})


def _err(r: httpx.Response, what: str):
    if r.status_code == 401:
        raise HTTPException(400, "Apify rejected the token. Check it in API Manager.")
    raise HTTPException(502, f"Apify {what} failed ({r.status_code})")


async def start_run(token: str, kind: str, targets: list[str]) -> dict:
    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.post(f"{APIFY}/acts/{ACTORS[kind]}/runs", headers={"Authorization": f"Bearer {token}"}, json=actor_input(kind, targets))
    if r.status_code >= 400:
        _err(r, "run")
    return r.json()["data"]


async def run_status(token: str, run_id: str) -> tuple[str, list[dict], str]:
    h = {"Authorization": f"Bearer {token}"}
    async with httpx.AsyncClient(timeout=60) as c:
        r = await c.get(f"{APIFY}/actor-runs/{run_id}", headers=h)
        if r.status_code >= 400:
            _err(r, "status")
        run = r.json()["data"]
        items = []
        if run["status"] == "SUCCEEDED":
            d = await c.get(f"{APIFY}/datasets/{run['defaultDatasetId']}/items", headers=h, params={"clean": "true", "limit": 500})
            if d.status_code >= 400:
                _err(d, "dataset")
            items = d.json()
    return run["status"], items, run.get("statusMessage") or ""


async def apify_profile(uid: str, token: str, kind: str, target: str) -> dict | None:
    t0 = time.time()
    try:
        async with httpx.AsyncClient(timeout=200) as c:
            r = await c.post(f"{APIFY}/acts/{ACTORS[kind]}/run-sync-get-dataset-items", headers={"Authorization": f"Bearer {token}"},
                             params={"timeout": 180}, json=actor_input(kind, [target]))
        if r.status_code >= 400:
            _err(r, "scrape")
        found = normalize(kind, r.json())
        await log_scrape(uid, "apify", True, t0)
        return found[0] if found else None
    except HTTPException as e:
        await log_scrape(uid, "apify", False, t0, e.detail)
        raise


async def firecrawl_site(uid: str, key: str, url: str) -> str:
    t0 = time.time()
    try:
        async with httpx.AsyncClient(timeout=60) as c:
            r = await c.post("https://api.firecrawl.dev/v1/scrape", headers={"Authorization": f"Bearer {key}"},
                             json={"url": url, "formats": ["markdown"], "onlyMainContent": True})
        r.raise_for_status()
        await log_scrape(uid, "firecrawl", True, t0)
        return (r.json().get("data") or {}).get("markdown", "")[:5000]
    except Exception as e:
        await log_scrape(uid, "firecrawl", False, t0, str(e))
        return ""
