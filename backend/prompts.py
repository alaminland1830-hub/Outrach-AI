from typing import Literal

from pydantic import BaseModel, Field, field_validator

YN = Literal["yes", "no", "unknown"]
LMH = Literal["high", "medium", "low", "unknown"]

DEFAULT_PROFILE = {
    "name": "", "niche": "", "company_type": "Individual freelance video editor", "services": "", "editing_style": "",
    "target_clients": "", "pricing": "", "experience": "", "positioning": "I am an individual freelance video editor, not an agency.",
    "tone": "Friendly, short, human, professional and non-corporate", "business_goal": "",
    "universal_portfolio": "", "instagram_profile": "", "portfolio": [],
}
ZISAN_PROFILE = {
    "name": "Muhammad Zisan",
    "niche": "SaaS, B2B & Personal Brand Content",
    "company_type": "Individual",
    "services": "SaaS product videos and minimal UI animations; Clean, minimal business animations; Short-form editing for talking-head creators; "
                "Podcast clips and interview highlights; Business, entrepreneurship and motivational content; Educational creators, coaches and course businesses; "
                "Long-form to short-form repurposing",
    "editing_style": "Clean and premium; minimal motion graphics and UI animation; strong hooks and audience retention; accurate, readable captions; "
                     "fast-paced but not over-edited; strategic B-roll, sound design and music; professional pacing and storytelling",
    "target_clients": "SaaS founders and SaaS marketing teams; business coaches and consultants; podcast hosts and personal brands; educational YouTubers "
                      "and online course creators; business creators publishing talking-head videos; marketing agencies that outsource editing; "
                      "companies publishing product demos and software tutorials",
    "pricing": "Depends on project and difficulty: small creators about $10-20 per video, bigger creators about $25-50 per video",
    "experience": "1 year",
    "positioning": "I am an individual freelance video editor, not an agency.",
    "tone": "Friendly, short, human, professional and non-corporate",
    "business_goal": "Find international clients who hire me repeatedly (recurring work), not only one-time projects.",
    "universal_portfolio": "http://u.pc.cd/Snrctalk",
    "instagram_profile": "https://www.instagram.com/zisan.editor/?hl=en",
    "portfolio": [],
}

SYSTEM_ANALYST = (
    "You are a meticulous lead-qualification analyst working for ONE individual freelance video editor (not an agency). "
    "Use ONLY the data provided. Never invent facts, metrics, emails, prices paid, or results. If something is not in the data, write \"unknown\". "
    "You cannot watch videos: you only see the text data explicitly provided (captions, titles, descriptions, transcripts, notes). "
    "Never claim to have watched or analyzed a video's visuals. Mark inferences with \"(inferred)\". "
    "Having a social account does NOT mean someone needs an editor. Be respectful: never insult anyone's current editing. "
    "Respond with ONE JSON object only, no prose, no code fences."
)


class Relevance(BaseModel):
    @field_validator("publishes_video", "needs_saas_ui_animation", "needs_podcast_clips", "needs_talking_head",
                     "needs_educational", "recurring_potential", mode="before", check_fields=False)
    @classmethod
    def lower(cls, v):
        v = str(v or "unknown").strip().lower()
        return v if v in ("yes", "no", "high", "medium", "low") else "unknown"

    @field_validator("service_fit", "evidence", "unknowns", mode="before", check_fields=False)
    @classmethod
    def as_list(cls, v):
        return [v] if isinstance(v, str) else (v or [])

    what_they_do: str = "unknown"
    company: str = ""
    niche: str = "unknown"
    business_type: str = "unknown"
    publishes_video: YN = "unknown"
    video_activity: str = "unknown"
    video_strategy: str = "unknown"
    service_fit: list[str] = []
    needs_saas_ui_animation: YN = "unknown"
    needs_podcast_clips: YN = "unknown"
    needs_talking_head: YN = "unknown"
    needs_educational: YN = "unknown"
    recurring_potential: LMH = "unknown"
    recurring_reason: str = ""
    contact_method: str = "unknown"
    contact_assessment: str = "unknown"
    country: str = "unknown"
    relevance_summary: str = ""
    evidence: list[str] = []
    unknowns: list[str] = []


class Opportunity(BaseModel):
    @field_validator("opportunities", mode="before", check_fields=False)
    @classmethod
    def opp_list(cls, v):
        v = [v] if isinstance(v, (str, dict)) else (v or [])
        return [x if isinstance(x, dict) else {"issue": str(x), "evidence": "", "suggestion": ""} for x in v]

    @field_validator("content_observations", "buying_signals", "red_flags", "data_analyzed", mode="before", check_fields=False)
    @classmethod
    def as_list(cls, v):
        return [v] if isinstance(v, str) else (v or [])

    content_observations: list[str] = []
    opportunities: list[dict] = []
    recommended_service: str = "unknown"
    outreach_angle: str = ""
    sample_video_idea: str = ""
    why_my_style: str = ""
    budget_estimate: str = "unknown"
    buying_signals: list[str] = []
    red_flags: list[str] = []
    data_analyzed: list[str] = []
    videos_processed: bool = False


class Factor(BaseModel):
    points: float = 0
    evidence: str = "unknown"


FACTORS = {"niche_match": 25, "video_activity": 20, "editing_opportunity": 20, "recurring_potential": 15,
           "business_signals": 10, "contact_channel": 10}


class Scoring(BaseModel):
    niche_match: Factor = Factor()
    video_activity: Factor = Factor()
    editing_opportunity: Factor = Factor()
    recurring_potential: Factor = Factor()
    business_signals: Factor = Factor()
    contact_channel: Factor = Factor()
    explanation: str = ""
    confidence: int = Field(50, ge=0, le=100)

    @field_validator("confidence", mode="before")
    @classmethod
    def clamp(cls, v):
        try:
            return max(0, min(100, int(float(v))))
        except (TypeError, ValueError):
            return 50


class ReplyExplain(BaseModel):
    @field_validator("intent", mode="before", check_fields=False)
    @classmethod
    def norm_intent(cls, v):
        v = str(v or "").strip().lower()
        return v if v in ("positive", "neutral", "negative", "objection", "question") else "unknown"

    explanation: str
    intent: Literal["positive", "neutral", "negative", "objection", "question", "unknown"] = "unknown"
    key_points: list[str] = []
    suggested_reply: str = ""
    next_step: str = ""


class DataQuality(BaseModel):
    @field_validator("verdict", mode="before", check_fields=False)
    @classmethod
    def norm_verdict(cls, v):
        v = str(v or "").strip().lower()
        return v if v in ("good", "needs_review", "poor") else "needs_review"

    verdict: Literal["good", "needs_review", "poor"] = "needs_review"
    issues: list[str] = []
    missing: list[str] = []
    duplicate_assessment: str = ""


MESSAGE_TYPES = {
    "instagram_dm": "Instagram DM (2-4 short sentences, no subject)",
    "linkedin_message": "LinkedIn message (connection-friendly, 3-5 sentences)",
    "business_email": "Business email (first line 'Subject: ...', then a short body)",
    "follow_up": "Follow-up message to a previous outreach that got no reply (2-3 sentences, add one new piece of value)",
    "free_sample": "Free sample editing offer (offer to edit one of their existing clips for free, no strings)",
    "saas_ui_pitch": "SaaS UI animation pitch (product demo / feature explainer with minimal UI animation)",
    "podcast_pitch": "Podcast editing pitch (clips and interview highlights)",
    "talking_head_pitch": "Talking-head editing pitch (short-form, hooks, captions, pacing)",
    "educational_pitch": "Educational creator pitch (lessons, course content, YouTube explainers)",
}


def profile_text(p: dict) -> str:
    port = "\n".join(f"- {m.get('category')}: {m.get('link')} ({m.get('description') or ''})" for m in p.get("portfolio") or [])
    return (f"Name: {p.get('name') or 'unknown'}\nType: {p.get('company_type')}\nNiche: {p.get('niche')}\nServices: {p.get('services')}\n"
            f"Editing style: {p.get('editing_style')}\nTarget clients: {p.get('target_clients')}\nPricing: {p.get('pricing')}\n"
            f"Experience: {p.get('experience')}\nPositioning: {p.get('positioning')}\nPreferred tone: {p.get('tone')}\n"
            f"Business goal: {p.get('business_goal')}\nUniversal portfolio: {p.get('universal_portfolio') or '-'}\n"
            f"Instagram: {p.get('instagram_profile') or '-'}\nPortfolio by category:\n{port or '-'}")


def lead_text(lead: dict) -> str:
    rows = [("Name", lead.get("name")), ("Company/brand", lead.get("company")), ("Platform", lead.get("platform")),
            ("Handle", lead.get("handle")), ("Profile URL", lead.get("profile_url")), ("Website", lead.get("website")),
            ("Followers", lead.get("followers") or None), ("Following", lead.get("following") or None),
            ("Total posts", lead.get("posts") or None), ("Bio", lead.get("bio")), ("Public email (unverified)", lead.get("email")),
            ("Country", lead.get("country")), ("Niche (user-entered)", lead.get("niche_hint")), ("User notes", lead.get("notes")),
            ("User's own observations about their videos", lead.get("manual_observations"))]
    txt = "\n".join(f"{k}: {v}" for k, v in rows if v)
    rec = lead.get("recent") or []
    if rec:
        txt += "\nRecent posts (text only):\n" + "\n".join(
            f"- [{p.get('type', 'post')}{', ' + str(p['views']) + ' views' if isinstance(p, dict) and p.get('views') else ''}] {p.get('text', '') if isinstance(p, dict) else p}"
            for p in rec[:10])
    vids = lead.get("videos") or []
    if vids:
        txt += "\nRecent videos (titles/descriptions only):\n" + "\n".join(
            f"- {v.get('title')} ({v.get('duration') or '?'}, {v.get('views') or '?'} views): {v.get('text', '')[:200]}" for v in vids[:10])
    if lead.get("video_urls"):
        txt += "\nVideo links supplied (NOT watched): " + ", ".join(lead["video_urls"])
    if lead.get("transcript"):
        txt += f"\nTranscript supplied by user:\n{lead['transcript'][:4000]}"
    if lead.get("website_excerpt"):
        txt += f"\nWebsite text excerpt:\n{lead['website_excerpt'][:3000]}"
    srcs = ", ".join(sorted({s.get("source") for s in lead.get("sources") or []})) or "manual entry"
    return txt + f"\nData sources: {srcs}"


def relevance_prompt(lead, profile):
    return (f"EDITOR PROFILE\n{profile_text(profile)}\n\nPROSPECT DATA\n{lead_text(lead)}\n\n"
            "Decide whether this prospect is relevant for THIS editor's services. Return JSON with keys: "
            "what_they_do, company, niche, business_type (one of saas|coach|consultant|podcast|educator|course_business|personal_brand|agency|business_creator|ecommerce|other|unknown), "
            "publishes_video (yes|no|unknown), video_activity (evidence-based, e.g. '5 of last 10 posts are reels'), video_strategy, "
            "service_fit (list of the editor's services that fit), needs_saas_ui_animation, needs_podcast_clips, needs_talking_head, needs_educational (each yes|no|unknown), "
            "recurring_potential (high|medium|low|unknown), recurring_reason, contact_method (email|instagram_dm|linkedin|x_dm|website_form|unknown), "
            "contact_assessment (is there a credible PUBLIC business contact in the data?), country, relevance_summary (2 sentences), "
            "evidence (list of short facts quoted from the data), unknowns (list of what could not be determined).")


def opportunity_prompt(lead, profile):
    return (f"EDITOR PROFILE\n{profile_text(profile)}\n\nPROSPECT DATA\n{lead_text(lead)}\n\n"
            "Find specific, respectful, evidence-based editing opportunities (e.g. weak opening hooks, slow pacing, captions, limited visual variation, "
            "B-roll, podcast highlights structure, SaaS features that need minimal UI animation, unclear product demos, long-form to short-form repurposing). "
            "Only list opportunities supported by the provided text data; if the data does not show the videos themselves, say so in the evidence. Return JSON with keys: "
            "content_observations (list), opportunities (list of {issue, evidence, suggestion}), recommended_service (one of the editor's services), "
            "outreach_angle (one personalized angle), sample_video_idea (one concrete free sample idea), why_my_style (why this editor's style fits), "
            "budget_estimate (range with reasoning, or 'unknown'), buying_signals (list), red_flags (list), "
            "data_analyzed (exact list of what you looked at, e.g. 'bio', '8 post captions', 'website excerpt'), "
            "videos_processed (true ONLY if a transcript was supplied, else false).")


def scoring_prompt(lead, rel: dict, opp: dict, profile):
    return (f"EDITOR PROFILE\n{profile_text(profile)}\n\nPROSPECT DATA\n{lead_text(lead)}\n\nRELEVANCE ANALYSIS\n{rel}\n\nOPPORTUNITY ANALYSIS\n{opp}\n\n"
            "Score this lead. Give points per factor with a short evidence string. Use 0 points when evidence is missing (unknown is not a yes). "
            "Factors and max points: niche_match 25 (fit with the editor's services/target clients), video_activity 20 (evidence of ACTIVE video publishing), "
            "editing_opportunity 20 (observable improvement opportunities), recurring_potential 15, business_signals 10 (business activity, offers, growth), "
            "contact_channel 10 (only if a verified/appropriate public business contact is in the data; unverified scraped email max 5). "
            "Return JSON: {niche_match:{points,evidence}, video_activity:{...}, editing_opportunity:{...}, recurring_potential:{...}, "
            "business_signals:{...}, contact_channel:{...}, explanation (2-3 sentences, mention that a score does not guarantee budget or reply), "
            "confidence (0-100, lower when data is thin)}.")


def priority_for(score: int, t: dict) -> str:
    if score >= t.get("high", 80):
        return "high"
    if score >= t.get("medium", 60):
        return "medium"
    if score >= t.get("low", 40):
        return "low"
    return "reject"


def pick_portfolio(lead: dict, profile: dict) -> dict:
    words = set(f"{lead.get('niche', '')} {(lead.get('analysis') or {}).get('recommended_service', '')} {lead.get('business_type', '')}".lower().split())
    best, best_hits = None, 0
    for m in profile.get("portfolio") or []:
        hits = len(words & set(f"{m.get('category', '')} {m.get('description', '')}".lower().split()))
        if hits > best_hits:
            best, best_hits = m, hits
    if best:
        return {"label": best.get("category"), "link": best.get("link")}
    if profile.get("universal_portfolio"):
        return {"label": "Universal Portfolio", "link": profile["universal_portfolio"]}
    return {"label": "", "link": ""}


def message_prompt(lead, profile, mtype, tone, length, portfolio, previous=""):
    a = lead.get("analysis") or {}
    return (f"EDITOR PROFILE\n{profile_text(profile)}\n\nPROSPECT\n{lead_text(lead)}\n\nANALYSIS\n"
            f"Niche: {lead.get('niche')}\nRecommended service: {a.get('recommended_service')}\nOutreach angle: {a.get('outreach_angle')}\n"
            f"Sample video idea: {a.get('sample_video_idea')}\nOpportunities: {a.get('opportunities')}\nWhy my style: {a.get('why_my_style')}\n"
            f"{('PREVIOUS MESSAGE SENT:' + chr(10) + previous) if previous else ''}\n\n"
            f"Write ONE {MESSAGE_TYPES[mtype]}. Tone: {tone}. Length: {length}. Language: English.\n"
            "Rules: explain why you contacted THIS prospect specifically (reference one real detail from the data); connect their content to ONE relevant service; "
            "no fake compliments, no invented results or numbers, no 'I can help grow your business', no aggressive sales language; "
            "write as an individual freelance editor (never 'we' or 'our agency'); one soft call to action. "
            f"{('Include this portfolio link naturally: ' + portfolio['link']) if portfolio.get('link') else 'Do not invent a portfolio link.'} "
            "Output only the message text.")
