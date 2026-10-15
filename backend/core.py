import os
from datetime import datetime, timezone, timedelta

import bcrypt
import jwt
from bson import ObjectId
from cryptography.fernet import Fernet
from fastapi import Depends, HTTPException, Request
from motor.motor_asyncio import AsyncIOMotorClient

client = AsyncIOMotorClient(os.environ["MONGO_URL"])
db = client[os.environ["DB_NAME"]]
JWT_ALGORITHM = "HS256"
fernet = Fernet(os.environ["KEY_ENCRYPTION_KEY"].encode())


def now():
    return datetime.now(timezone.utc)


def aware(dt):
    if isinstance(dt, datetime) and dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def out(doc):
    if not doc:
        return doc
    d = dict(doc)
    d["id"] = str(d.pop("_id"))
    for k, v in list(d.items()):
        if isinstance(v, ObjectId):
            d[k] = str(v)
        elif isinstance(v, datetime):
            d[k] = aware(v).isoformat()
    d.pop("password_hash", None)
    d.pop("key_enc", None)
    return d


def oid(value: str) -> ObjectId:
    try:
        return ObjectId(value)
    except Exception:
        raise HTTPException(404, "Not found")


def enc(s: str) -> str:
    return fernet.encrypt(s.encode()).decode()


def dec(s: str) -> str:
    return fernet.decrypt(s.encode()).decode()


def hash_password(p: str) -> str:
    return bcrypt.hashpw(p.encode(), bcrypt.gensalt()).decode()


def verify_password(p: str, h: str) -> bool:
    return bcrypt.checkpw(p.encode(), h.encode())


def create_token(user_id: str, email: str) -> str:
    return jwt.encode({"sub": user_id, "email": email, "exp": now() + timedelta(days=7), "type": "access"},
                      os.environ["JWT_SECRET"], algorithm=JWT_ALGORITHM)


async def current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer ") and len(auth) > 20:
        token = auth[7:]
    if not token:
        raise HTTPException(401, "Not authenticated")
    try:
        payload = jwt.decode(token, os.environ["JWT_SECRET"], algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(401, "Invalid token")
    if payload.get("type") != "access":
        raise HTTPException(401, "Invalid token type")
    user = await db.users.find_one({"_id": ObjectId(payload["sub"])})
    if not user or user.get("active") is False:
        raise HTTPException(401, "Account not available")
    return out(user)


async def require_admin(user=Depends(current_user)) -> dict:
    if user.get("role") != "admin":
        raise HTTPException(403, "Admin only")
    return user


async def log_activity(user_id: str, text: str, lead_id: str = None, kind: str = "info"):
    await db.activities.insert_one({"user_id": user_id, "text": text, "lead_id": lead_id, "kind": kind, "created_at": now()})


async def audit(user: dict, action: str, detail: str = ""):
    await db.audit_logs.insert_one({"user_id": user.get("id"), "email": user.get("email"), "action": action,
                                    "detail": detail[:500], "created_at": now()})


async def get_settings(uid: str) -> dict:
    return await db.settings.find_one({"user_id": uid}) or {}


async def provider_key(uid: str, provider: str):
    k = await db.api_keys.find_one({"user_id": uid, "provider": provider, "enabled": {"$ne": False},
                                    "status": {"$ne": "invalid"}}, sort=[("priority", 1)])
    return dec(k["key_enc"]) if k else None
