import json
import os
import uuid

import httpx
from fastapi import HTTPException
from emergentintegrations.llm.chat import LlmChat, UserMessage, TextDelta, StreamDone

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
OPENAI_COMPAT = {"openai": "https://api.openai.com/v1", "xai": "https://api.x.ai/v1"}


def resolve(settings: dict, task: str):
    model_id = (settings.get("models") or {}).get(task) or DEFAULT_MODEL
    source, provider, model = model_id.split(":", 2)
    keys = settings.get("keys") or {}
    if source == "builtin":
        return {"kind": "lib", "provider": provider, "model": model, "key": os.environ["EMERGENT_LLM_KEY"]}
    if provider == "custom":
        c = keys.get("custom") or {}
        if not c.get("api_key") or not c.get("base_url"):
            raise HTTPException(400, "Custom provider is not configured in Settings")
        return {"kind": "http", "base": c["base_url"].rstrip("/"), "model": c.get("model") or model, "key": c["api_key"]}
    key = keys.get(provider)
    if not key:
        raise HTTPException(400, f"No API key saved for {provider}. Add it in Settings.")
    if provider in OPENAI_COMPAT:
        return {"kind": "http", "base": OPENAI_COMPAT[provider], "model": model, "key": key}
    return {"kind": "lib", "provider": provider, "model": model, "key": key}


async def _stream_http(cfg, system, prompt):
    body = {"model": cfg["model"], "stream": True,
            "messages": [{"role": "system", "content": system}, {"role": "user", "content": prompt}]}
    headers = {"Authorization": f"Bearer {cfg['key']}"}
    async with httpx.AsyncClient(timeout=httpx.Timeout(180, connect=15)) as client:
        async with client.stream("POST", f"{cfg['base']}/chat/completions", json=body, headers=headers) as r:
            if r.status_code >= 400:
                text = (await r.aread()).decode()[:300]
                raise RuntimeError(f"Provider error {r.status_code}: {text}")
            async for line in r.aiter_lines():
                if not line.startswith("data:"):
                    continue
                data = line[5:].strip()
                if data == "[DONE]":
                    break
                try:
                    delta = json.loads(data)["choices"][0]["delta"].get("content")
                except (KeyError, IndexError, json.JSONDecodeError):
                    continue
                if delta:
                    yield delta


async def _stream_lib(cfg, system, prompt):
    chat = LlmChat(api_key=cfg["key"], session_id=str(uuid.uuid4()), system_message=system) \
        .with_model(cfg["provider"], cfg["model"])
    async for ev in chat.stream_message(UserMessage(text=prompt)):
        if isinstance(ev, TextDelta):
            yield ev.content
        elif isinstance(ev, StreamDone):
            break


def stream_llm(settings: dict, task: str, system: str, prompt: str):
    cfg = resolve(settings, task)
    return _stream_http(cfg, system, prompt) if cfg["kind"] == "http" else _stream_lib(cfg, system, prompt)
