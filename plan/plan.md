# OUTREACH.AI — AI Sales Employee for Video Editors

A rebuild of the original OUTREACH.AI app: a personal AI sales assistant that finds creator and business leads, researches them in depth, writes outreach that books calls, and keeps an AI memory for every lead.
It adds scraper connections (Apify first) to analyze Instagram and X accounts, plus a choice of AI models, including the user's own API keys.

## Who it's for
Video editors, freelancers and small agencies who look for clients (YouTubers, Instagram/X creators, brands) and want research and outreach done for them.

## Core features and experience
- **Sign in / register**: email and password, same as the original. Demo admin account: `admin@outreach.ai / Admin@123`.
- **Landing + auth screen**: matches the original: "Your personal AI sales employee for video editing", the stat highlights (3x reply rate, AI per-lead memory, 1-click deep analysis), and the sign-in form next to them.
- **Dashboard**: lead count, leads at each pipeline stage, recent activity, and quick actions (Find leads, Add lead).
- **Lead list**: searchable and filterable table (platform, stage, lead score). Add leads by hand (name, handle/URL, platform, notes) or import them from a scrape.
- **Lead finding (scrapers)**:
  - Connect Apify with the user's own Apify token in Settings.
  - Sources: Instagram profiles, X/Twitter profiles, YouTube channels, and Google search (e.g. "fitness YouTubers needing editors").
  - Paste handles/URLs/queries → run → results show followers, bio, website, public contact, and a lead score → pick which ones to save as leads.
- **1-click deep analysis (IG & X)**: pulls the lead's profile data with the scraper, then the AI writes a report covering who they are, content style, posting frequency, audience, editing quality gaps, pain points, how much they could pay, and the best angle to pitch.
- **AI outreach generator**: writes a DM, a cold email and a follow-up for each lead from its research. Tone and length can be changed. Copy with one click. Messages are saved to the lead.
- **Per-lead AI memory/chat**: each lead has its own chat thread. The AI remembers that lead's research, notes, earlier messages and conversation history ("what should I reply to this?", "rewrite more casual"). Replies stream in word by word.
- **Pipeline / CRM board**: drag-and-drop columns: New → Researched → Contacted → Replied → Call Booked → Won / Lost.
- **AI model settings**:
  - Built-in models that need no key (Emergent Universal Key): Claude Sonnet 4.5 (default), GPT-5, Gemini 2.5 Pro, with newer versions also selectable.
  - Bring your own key: OpenAI, Anthropic (Claude), Google Gemini, xAI Grok, and any OpenAI-compatible provider (e.g. OpenRouter, Groq, DeepSeek) via base URL + model name.
  - The user picks which model is used for research, outreach and chat.
- **Scraper settings**: Apify token field, with room for more scraper providers later.

## User flow
1. Sign in (or use the demo admin).
2. Settings → paste Apify token, then choose an AI model (built-in, or add your own key).
3. Find Leads → choose Instagram / X / YouTube / Google → paste handles or a search → run → save the best results as leads.
4. Open a lead → "Deep analysis" → read the AI report.
5. "Generate outreach" → copy the DM/email and send it yourself → move the lead to "Contacted".
6. When the lead replies, paste the reply into the lead's AI chat for a suggested answer → move through the pipeline to "Call Booked".

## UI/UX feel
- Matches the original as closely as possible: dark, bold, high-contrast. A large headline on a split-screen auth page, with stats.
- Sidebar navigation: Dashboard, Leads, Find Leads, Pipeline, Settings.
- Dense, fast, "sales cockpit" feel, with clear badges for platform, stage and lead score. Smooth micro-animations, and streaming AI text.

## Implementation phases
**Phase 1 — MVP (built now)**
Auth with demo admin, landing/sign-in screen, dashboard, lead list with manual add, Apify scraping for IG / X / YouTube / Google, 1-click deep analysis, AI outreach generator, per-lead AI memory chat, pipeline board, AI model settings (built-in models plus own keys for OpenAI / Claude / Gemini / Grok / OpenAI-compatible), and Apify settings.

**Phase 2**
More scraper and data connections: Composio (tool connections) and Metricool (social analytics) with the user's own keys, plus other scraper providers. Send emails directly from the app. Automatic follow-up reminders.

**Phase 3**
Team/agency workspaces, outreach templates and A/B testing, reply-rate analytics, CSV import/export, scheduled lead searches.

## Assumptions
- The original's inner screens could not be viewed (its servers were asleep), so the inside is rebuilt from the landing page, the selected features and the "OUTREACH.AI" concept. It will not be a pixel-perfect copy.
- "matricool" is taken to mean **Metricool**. Composio and Metricool come in Phase 2. Apify is the scraper in Phase 1.
- Scraping uses the user's own Apify account and token, and Apify usage costs are billed by Apify. Without a token, leads can still be added by hand and researched from the details the user enters.
- Only public profile data is used. Scraped contact info is marked as unverified.
- Outreach is copied and sent by the user. The app does not send DMs or emails in Phase 1.
- Default AI model: Claude Sonnet 4.5 via the Universal Key. Its usage is deducted from the user's Emergent key balance.
- Users' own API keys and scraper tokens are stored per account on the server and never shown back in full.
- Registration is open to anyone. Each user only sees their own leads. The admin has no extra screens in Phase 1.
- Lead score is a simple, explained rule (website, business keywords, followers, public contact) shown to help the user decide, not as a final judgement.
