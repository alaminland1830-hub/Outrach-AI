import { Link } from "react-router-dom";
import { PageHeader } from "@/components/AppLayout";
import { ChatPanel } from "@/components/ChatPanel";

const PROMPTS = [
  "Which of my leads should I contact first today and why?",
  "Analyze my editing style from my profile and suggest a sharper positioning line",
  "Draft LinkedIn messages for my top 3 qualified leads",
  "Add all high-priority leads to a Google Sheet",
  "Check my Gmail for replies from leads and summarize them",
];

export default function Assistant() {
  return (
    <div>
      <PageHeader title="AI Assistant" sub={<>Manages your CRM and your connected apps (<Link to="/connections" className="text-violet-600 hover:underline">Connections</Link>). It always asks before sending or changing anything outside the app.</>} />
      <ChatPanel messagesPath="/assistant/messages" sendPath="/assistant/chat" title="CRM tools + connected apps via Composio" height="h-[calc(100vh-200px)] min-h-[520px]"
        placeholder="Ask me to find, update, draft, organize — or to use Gmail, Sheets, Notion, Slack and more once connected." prompts={PROMPTS} testPrefix="assistant" />
    </div>
  );
}
