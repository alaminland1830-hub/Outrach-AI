import re
from typing import Any

import httpx
from fastapi import HTTPException

APIFY = "https://api.apify.com/v2"
ACTORS = {
    "instagram": "apify~instagram-profile-scraper",
    "x": "datapilot~twitter-x-profile-scraper",
    "youtube": "streamers~youtube-channel-scraper",
    "google": "apify~google-search-scraper",
}


def clean_handle(kind: str, value: str) -> str:
    v = value.strip()
    if kind in ("instagram", "x"):
        v = re.sub(r"^https?://(www\.)?(instagram\.com|x\.com|twitter\.com)/", "", v).strip("/@ ").split("/")[0].split("?")[0]
    return v[:500]


def actor_input(kind: str, targets: list[str]) -> dict[str, Any]:
    t = [clean_handle(kind, x) for x in targets if x.strip()]
    if kind == "instagram":
        return {"usernames": t}
    if kind == "x":
        return {"profiles": t, "useApifyProxy": True, "apifyProxyGroups": ["RESIDENTIAL"]}
    if kind == "youtube":
        urls = [x if x.startswith("http") else f"https://www.youtube.com/@{x.lstrip('@')}" for x in t]
        return {"startUrls": [{"url": u, "method": "GET"} for u in urls],
                "maxResults": 5, "maxResultsShorts": 0, "maxResultStreams": 0}
    return {"queries": "\n".join(t), "maxPagesPerQuery": 1, "countryCode": "us",
            "languageCode": "en", "resultsPerPage": 10}


def pick(d: dict, *keys, default=None):
    for k in keys:
        v = d.get(k)
        if v not in (None, "", [], {}):
            return v
    return default


def to_int(v) -> int:
    try:
        return int(v or 0)
    except (TypeError, ValueError):
        return 0


def lead_score(lead: dict) -> int:
    text = f"{lead.get('bio', '')} {lead.get('name', '')}"
    score = 0
    if lead.get("website"):
        score += 30
    if re.search(r"\b(contact|agency|founder|owner|marketing|business|book|coach|brand|creator|podcast)\b", text, re.I):
        score += 25
    score += min(30, round(to_int(lead.get("followers")) / 10000))
    if lead.get("contact"):
        score += 15
    return min(score, 100)


def normalize(kind: str, items: list[dict]) -> list[dict]:
    leads = []
    if kind == "google":
        for it in items:
            for r in it.get("organicResults") or []:
                leads.append({"platform": "website", "name": r.get("title", ""), "handle": "",
                              "url": r.get("url", ""), "bio": r.get("description", ""),
                              "website": r.get("url", ""), "followers": 0, "contact": ""})
    elif kind == "youtube":
        seen = {}
        for it in items:
            url = pick(it, "channelUrl", "inputChannelUrl", default="")
            if url in seen:
                continue
            seen[url] = True
            leads.append({"platform": "youtube", "name": pick(it, "channelName", default=""),
                          "handle": pick(it, "channelUsername", default=""), "url": url,
                          "bio": pick(it, "channelDescription", default=""),
                          "website": "", "followers": to_int(pick(it, "numberOfSubscribers", default=0)),
                          "contact": "", "avatar": pick(it, "channelAvatarUrl", default="")})
    else:
        for it in items:
            user = it.get("user") if isinstance(it.get("user"), dict) else it
            handle = pick(user, "username", "screen_name", "userName", "handle", default="")
            leads.append({
                "platform": kind,
                "name": pick(user, "fullName", "name", default=handle),
                "handle": handle,
                "url": pick(user, "url", "profileUrl", default=(f"https://instagram.com/{handle}" if kind == "instagram" else f"https://x.com/{handle}")),
                "bio": pick(user, "biography", "description", "bio", default=""),
                "website": pick(user, "externalUrl", "website", "expanded_url", default=""),
                "followers": to_int(pick(user, "followersCount", "followers_count", "followers", default=0)),
                "following": to_int(pick(user, "followsCount", "friends_count", "following", default=0)),
                "posts": to_int(pick(user, "postsCount", "statuses_count", "tweetsCount", default=0)),
                "contact": pick(user, "businessEmail", "publicEmail", "email", default=""),
                "avatar": pick(user, "profilePicUrl", "profile_image_url_https", "profilePicture", default=""),
                "recent": [str(pick(p, "caption", "text", "full_text", default=""))[:300]
                           for p in (pick(user, "latestPosts", "tweets", default=[]) or [])[:8] if isinstance(p, dict)],
            })
    for lead in leads:
        lead["score"] = lead_score(lead)
        lead["contact_verified"] = False
    return leads


def _err(r: httpx.Response, what: str):
    if r.status_code == 401:
        raise HTTPException(400, "Apify rejected the token. Check it in Settings.")
    raise HTTPException(502, f"Apify {what} failed ({r.status_code})")


async def start_run(token: str, kind: str, targets: list[str]) -> dict:
    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.post(f"{APIFY}/acts/{ACTORS[kind]}/runs", headers={"Authorization": f"Bearer {token}"},
                         json=actor_input(kind, targets))
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
            d = await c.get(f"{APIFY}/datasets/{run['defaultDatasetId']}/items", headers=h,
                            params={"clean": "true", "limit": 500})
            if d.status_code >= 400:
                _err(d, "dataset")
            items = d.json()
    return run["status"], items, run.get("statusMessage") or ""


async def scrape_sync(token: str, kind: str, target: str) -> list[dict]:
    async with httpx.AsyncClient(timeout=200) as c:
        r = await c.post(f"{APIFY}/acts/{ACTORS[kind]}/run-sync-get-dataset-items",
                         headers={"Authorization": f"Bearer {token}"}, params={"timeout": 180},
                         json=actor_input(kind, [target]))
    if r.status_code >= 400:
        _err(r, "scrape")
    return normalize(kind, r.json())
