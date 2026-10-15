import ReactMarkdown from "react-markdown";

export const Markdown = ({ text, streaming, testId }) => (
  <div data-testid={testId} className={`prose-ai text-sm ${streaming ? "caret" : ""}`}>
    <ReactMarkdown>{text || ""}</ReactMarkdown>
  </div>
);
