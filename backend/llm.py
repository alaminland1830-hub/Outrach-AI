import json
import os
import re
import time
import uuid

from pydantic import ValidationError
from emergentintegrations.llm.chat import LlmChat, UserMessage, TextDelta, StreamDone, ToolCallReady

from core import db, now, dec, oid

BUILTIN_MODELS = [
    {"id": "builtin:anthropic:claude-sonnet-4-5-20250929", "label": "Claude Sonnet 4.5"},
    {"id": "builtin:openai:gpt-5", "label": "GPT-5"},
    {"id": "builtin:gemini:gemini-2.5-pro", "label": "Gemini 2.5 Pro"},
    {"id": "builtin:anthropic:claude-sonnet-4-6", "label": "Claude Sonnet 4.6"},
    {"id": "builtin:anthropic:claude-sonnet-5-5", "label": "Claude Sonnet 5.5"},
    {"id": "builtin:openai:gpt-5.4", "label": "GPT-5.4"},
    {"id": "builtin:openai:gpt-5.6-terra", "label": "GPT-5.6 Terra"},
    {"id": "builtin:gemini:gemini-3.1-pro-preview", "label": "Gemini 3.1 Pro"},
    {"id": "builtin:gemini:gemini-3-flash-preview", "label": "Gemini 3 Flash"},
]
DEFAULT_MODEL = BUILTIN_MODELS[0]["id"]
TASKS = {
    "relevance": "Lead relevance analysis",
    "opportunity": "Editing opportunity analysis",
    "scoring": "Lead scoring",
    "messages": "Personalized messages",
    "data_quality": "Duplicate & data-quality checks",
    "chat": "AI chat & assistant",
}
# provider -> (litellm prefix, default model, openai-compatible base url)
PROVIDERS = {
    "openai": ("openai", "gpt-5-mini", "https://api.openai.com/v1"),
    "anthropic": ("anthropic", "claude-sonnet-4-5-20250929", None),
    "gemini": ("gemini", "gemini-2.5-flash", None),
    "xai": ("xai", "grok-4", "https://api.x.ai/v1"),
    "groq": ("groq", "llama-3.3-70b-versatile", "https://api.groq.com/openai/v1"),
    "openrouter": ("openrouter", "openai/gpt-4o-mini", "https://openrouter.ai/api/v1"),
    "deepseek": ("deepseek", "deepseek-chat", "https://api.deepseek.com/v1"),
    "perplexity": ("perplexity", "sonar", "https://api.perplexity.ai"),
    "custom": ("openai", "", None),
}
PRICES = {"claude": (3, 15), "gpt-5-mini": (0.25, 2), "gpt-5": (1.25, 10), "gemini-2.5-pro": (1.25, 10),
          "flash": (0.3, 2.5), "gpt-4": (2, 8), "grok": (3, 15)}


class LLMError(Exception):
    pass


def est_cost(model: str, i: int, o: int) -> float:
    for k, (pi, po) in PRICES.items():
        if k in model:
            return round((i * pi + o * po) / 1e6, 5)
    return round((i * 1 + o * 5) / 1e6, 5)


async def candidates(uid: str, task: str) -> list[dict]:
    s = await db.settings.find_one({"user_id": uid}) or {}
    sel = (s.get("models") or {}).get(task) or DEFAULT_MODEL
    keys = await db.api_keys.find({"user_id": uid, "kind": "llm", "enabled": {"$ne": False}}).sort("priority", 1).to_list(50)
    res = []

    def add_builtin(mid):
        _, prov, model = mid.split(":", 2)
        res.append({"label": f"built-in {model}", "provider": prov, "model": model,
                    "key": os.environ["EMERGENT_LLM_KEY"], "key_id": None, "base_url": None})

    def add_key(k, model=None):
        res.append({"label": f"{k['provider']} key {k.get('label') or ''}".strip(), "provider": k["provider"],
                    "model": model or k.get("model") or PROVIDERS[k["provider"]][1], "key": dec(k["key_enc"]),
                    "key_id": str(k["_id"]), "base_url": k.get("base_url") if k["provider"] == "custom" else None})

    if sel.startswith("builtin:"):
        add_builtin(sel)
    elif sel.startswith("key:"):
        _, kid, model = sel.split(":", 2)
        k = next((x for x in keys if str(x["_id"]) == kid), None)
        if k:
            add_key(k, model or None)
    if s.get("failover", True):
        fresh = lambda k: k.get("status") != "rate_limited" or (now() - k["status_at"].replace(tzinfo=now().tzinfo)).total_seconds() > 120
        for k in keys:
            if k.get("status") != "invalid" and fresh(k) and not any(c["key_id"] == str(k["_id"]) for c in res):
                add_key(k)
        if s.get("builtin_fallback", True) and not any(c["key_id"] is None for c in res):
            add_builtin(DEFAULT_MODEL)
    if not res:
        add_builtin(DEFAULT_MODEL)
    return res


def make_chat(c: dict, system: str, history: list | None = None) -> LlmChat:
    initial = [{"role": "system", "content": system}] + (history or [])
    chat = LlmChat(api_key=c["key"], session_id=str(uuid.uuid4()), system_message=system, initial_messages=initial)
    chat.with_model(PROVIDERS.get(c["provider"], ("openai",))[0], c["model"])
    if c.get("base_url"):
        chat.with_params(api_base=c["base_url"])
    return chat


async def log_usage(uid, task, c, usage, t0, ok, error=""):
    i = getattr(usage, "input_tokens", 0) or 0
    o = getattr(usage, "output_tokens", 0) or 0
    await db.api_usage.insert_one({"user_id": uid, "task": task, "provider": c["provider"], "model": c["model"],
                                   "key_id": c["key_id"], "builtin": c["key_id"] is None, "input_tokens": i,
                                   "output_tokens": o, "cost_usd": est_cost(c["model"], i, o),
                                   "latency_ms": int((time.time() - t0) * 1000), "ok": ok, "error": error[:300],
                                   "kind": "llm", "created_at": now()})
    if c["key_id"]:
        upd = {"last_used_at": now()}
        if not ok:
            upd.update({"status": "rate_limited" if re.search(r"429|rate.?limit|quota", error, re.I) else "error",
                        "status_at": now(), "last_error": error[:200]})
        elif ok:
            upd.update({"status": "active", "status_at": now()})
        await db.api_keys.update_one({"_id": oid(c["key_id"])}, {"$set": upd})


def short(e: Exception) -> str:
    return re.sub(r"\s+", " ", str(e))[:220]


async def stream_text(uid: str, task: str, system: str, prompt: str, history: list | None = None):
    errors = []
    for c in await candidates(uid, task):
        started, t0 = False, time.time()
        try:
            chat = make_chat(c, system, history)
            async for ev in chat.stream_message(UserMessage(text=prompt)):
                if isinstance(ev, TextDelta):
                    started = True
                    yield ev.content
                elif isinstance(ev, StreamDone):
                    await log_usage(uid, task, c, ev.usage, t0, True)
            return
        except Exception as e:
            await log_usage(uid, task, c, None, t0, False, short(e))
            if started:
                raise LLMError(f"AI stream interrupted: {short(e)}")
            errors.append(f"{c['label']}: {short(e)}")
    raise LLMError("All AI providers failed. " + " | ".join(errors))


def extract_json(text: str) -> dict:
    t = re.sub(r"^```(json)?|```$", "", text.strip(), flags=re.M).strip()
    start, end = t.find("{"), t.rfind("}")
    if start < 0 or end <= start:
        raise ValueError("No JSON object found")
    return json.loads(t[start:end + 1])


async def llm_json(uid: str, task: str, system: str, prompt: str, model_cls):
    text = "".join([c async for c in stream_text(uid, task, system, prompt)])
    for attempt in range(2):
        try:
            return model_cls.model_validate(extract_json(text))
        except (ValueError, ValidationError) as e:
            if attempt:
                raise LLMError(f"AI returned malformed data twice: {short(e)}")
            fix = f"{prompt}\n\nYour previous answer was invalid ({short(e)}). Return ONLY one valid JSON object matching the schema."
            text = "".join([c async for c in stream_text(uid, task, system, fix)])


async def agent_stream(uid, task, system, history, user_text, tools, executor, max_steps=8):
    """Yields ('t', text) and ('tool', info) events; runs a bounded tool loop with provider failover."""
    errors = []
    for c in await candidates(uid, task):
        started = False
        try:
            chat = make_chat(c, system, history)
            if tools:
                chat.with_tools(tools)
            msg = UserMessage(text=user_text)
            for _ in range(max_steps):
                calls, t0 = [], time.time()
                async for ev in chat.stream_message(msg):
                    if isinstance(ev, TextDelta):
                        started = True
                        yield ("t", ev.content)
                    elif isinstance(ev, ToolCallReady):
                        calls.append(ev.tool_call)
                    elif isinstance(ev, StreamDone):
                        await log_usage(uid, task, c, ev.usage, t0, True)
                if not calls:
                    return
                started = True
                for tc in calls:
                    yield ("tool", {"name": tc.name, "status": "running"})
                    result = await executor(tc.name, tc.arguments or {})
                    ok = not (isinstance(result, dict) and result.get("error"))
                    yield ("tool", {"name": tc.name, "status": "done" if ok else "failed"})
                    chat.add_tool_result(tc.id, json.dumps(result, default=str)[:15000])
                msg = None
            yield ("t", "\n\n_(Stopped: too many tool steps.)_")
            return
        except Exception as e:
            await log_usage(uid, task, c, None, time.time(), False, short(e))
            if started:
                raise LLMError(f"AI interrupted: {short(e)}")
            errors.append(f"{c['label']}: {short(e)}")
    raise LLMError("All AI providers failed. " + " | ".join(errors))
