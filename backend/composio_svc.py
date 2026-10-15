import asyncio
import json
import re
import time

from composio import Composio

from core import db, now, provider_key

CONNECTORS = [
    {"slug": "gmail", "name": "Gmail", "desc": "Draft and send outreach emails, read client replies", "cat": "Email"},
    {"slug": "instagram", "name": "Instagram", "desc": "Look up business/creator profiles and your DMs", "cat": "Social"},
    {"slug": "twitter", "name": "X (Twitter)", "desc": "Look up profiles and recent posts", "cat": "Social"},
    {"slug": "linkedin", "name": "LinkedIn", "desc": "Your profile and posts (messaging needs approval)", "cat": "Social"},
    {"slug": "youtube", "name": "YouTube", "desc": "Channel and video details for research", "cat": "Social"},
    {"slug": "googlesheets", "name": "Google Sheets", "desc": "Export and sync leads to a sheet", "cat": "Productivity"},
    {"slug": "googledrive", "name": "Google Drive", "desc": "Portfolio files and briefs", "cat": "Productivity"},
    {"slug": "googlecalendar", "name": "Google Calendar", "desc": "Book discovery calls", "cat": "Productivity"},
    {"slug": "notion", "name": "Notion", "desc": "Client notes and project docs", "cat": "Productivity"},
    {"slug": "slack", "name": "Slack", "desc": "Notify yourself about replies and follow-ups", "cat": "Communication"},
    {"slug": "discord", "name": "Discord", "desc": "Community and client channels", "cat": "Communication"},
    {"slug": "calendly", "name": "Calendly", "desc": "Share booking links and see booked calls", "cat": "Productivity"},
    {"slug": "hubspot", "name": "HubSpot", "desc": "Sync contacts and deals", "cat": "CRM"},
    {"slug": "airtable", "name": "Airtable", "desc": "Lead tables and content trackers", "cat": "Productivity"},
]
LOOKUP = {"instagram": ("instagram", r"BUSINESS_DISCOVERY|USER_BY_USERNAME|LOOKUP"),
          "x": ("twitter", r"USER_LOOKUP_BY_USERNAME|USER_BY_USERNAME|USERNAME")}
_tool_cache: dict = {}


def dump(x):
    if hasattr(x, "model_dump"):
        return x.model_dump(mode="json")
    if isinstance(x, (dict, list, str, int, float, bool)) or x is None:
        return x
    if hasattr(x, "__dict__"):
        return {k: dump(v) for k, v in vars(x).items() if not k.startswith("_")}
    return str(x)


async def composio_client(uid: str):
    key = await provider_key(uid, "composio")
    return Composio(api_key=key) if key else None


async def connectors(uid: str) -> list[dict]:
    c = await composio_client(uid)
    if not c:
        return [{**x, "connected": False, "status": None, "account_id": None} for x in CONNECTORS]

    def run():
        s = c.create(user_id=uid)
        return s.toolkits(toolkits=[x["slug"] for x in CONNECTORS], limit=50)

    res = await asyncio.to_thread(run)
    state = {i.slug: i for i in res.items}
    rows = []
    for x in CONNECTORS:
        st = state.get(x["slug"])
        conn = st.connection if st else None
        acc = conn.connected_account if conn else None
        rows.append({**x, "logo": getattr(st, "logo", None), "connected": bool(conn and conn.is_active),
                     "status": acc.status if acc else None, "account_id": acc.id if acc else None})
    return rows


async def connect(uid: str, slug: str, callback_url: str) -> str:
    c = await composio_client(uid)
    req = await asyncio.to_thread(lambda: c.create(user_id=uid).authorize(slug, callback_url=callback_url))
    return req.redirect_url


async def disconnect(uid: str, slug: str) -> int:
    c = await composio_client(uid)

    def run():
        accs = c.connected_accounts.list(user_ids=[uid], toolkit_slugs=[slug]).items
        for a in accs:
            c.connected_accounts.delete(a.id)
        return len(accs)

    return await asyncio.to_thread(run)


async def is_connected(uid: str, slug: str) -> bool:
    c = await composio_client(uid)
    if not c:
        return False
    accs = await asyncio.to_thread(lambda: c.connected_accounts.list(user_ids=[uid], toolkit_slugs=[slug], statuses=["ACTIVE"]).items)
    return bool(accs)


def _find_tool(c: Composio, toolkit: str, rx: str):
    if toolkit in _tool_cache:
        return _tool_cache[toolkit]
    tools = c.tools.get_raw_composio_tools(toolkits=[toolkit], limit=200)
    match = next((t for t in tools if re.search(rx, t.slug)), None)
    _tool_cache[toolkit] = match
    return match


async def lookup_profile(uid: str, platform: str, handle: str) -> tuple[dict | None, str]:
    """Composio-first profile lookup. Returns (raw data, note)."""
    c = await composio_client(uid)
    if not c or platform not in LOOKUP:
        return None, "Composio key not set"
    toolkit, rx = LOOKUP[platform]
    if not await is_connected(uid, toolkit):
        return None, f"{toolkit} not connected in Composio"
    t0 = time.time()

    def run():
        tool = _find_tool(c, toolkit, rx)
        if not tool:
            return None, f"No profile lookup tool found in Composio {toolkit} toolkit"
        props = (tool.input_parameters or {}).get("properties", {})
        args = {}
        for name in props:
            if "username" in name.lower() or name.lower() in ("handle", "screen_name"):
                args[name] = handle
        for name in (tool.input_parameters or {}).get("required", []):
            if name not in args and "user_id" in name.lower():
                args[name] = "me"
        res = c.tools.execute(tool.slug, args, user_id=uid, dangerously_skip_version_check=True)
        res = dump(res)
        if not res.get("successful"):
            return None, f"Composio {tool.slug}: {str(res.get('error'))[:160]}"
        return res.get("data"), f"via {tool.slug}"

    try:
        data, note = await asyncio.to_thread(run)
    except Exception as e:
        data, note = None, f"Composio error: {str(e)[:160]}"
    await db.api_usage.insert_one({"user_id": uid, "task": "scrape", "provider": "composio", "model": "", "key_id": None,
                                   "builtin": False, "kind": "scraper", "input_tokens": 0, "output_tokens": 0, "cost_usd": 0,
                                   "latency_ms": int((time.time() - t0) * 1000), "ok": data is not None,
                                   "error": "" if data else note, "created_at": now()})
    return data, note


async def agent_session(uid: str):
    c = await composio_client(uid)
    if not c:
        return None, []
    session = await asyncio.to_thread(lambda: c.create(user_id=uid))
    tools = await asyncio.to_thread(session.tools)
    return session, [dump(t) for t in tools]


WRITE_RX = re.compile(r"SEND|POST|DELETE|REMOVE|CREATE|REPLY|UPDATE|INSERT|APPEND|UPLOAD|PUBLISH|TWEET|PATCH|MOVE|TRASH|ADD|WRITE|BATCH")


def needs_confirmation(name: str, args: dict) -> bool:
    blob = name + " " + json.dumps(args, default=str)
    if name.startswith("COMPOSIO_REMOTE"):
        return True
    slugs = re.findall(r"\b[A-Z][A-Z0-9]+_[A-Z0-9_]+\b", blob)
    return any(WRITE_RX.search(s) for s in slugs if not s.startswith("COMPOSIO_"))


async def execute(session, name: str, args: dict):
    def run():
        if name.startswith("COMPOSIO_"):
            return session.execute_meta(name, arguments=args)
        return session.execute(name, arguments=args)
    try:
        return dump(await asyncio.to_thread(run))
    except Exception as e:
        return {"error": str(e)[:400]}
