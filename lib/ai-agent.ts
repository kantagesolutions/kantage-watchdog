import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { readFile, getFileTree } from "./github-client";
import { getSetting } from "./settings";

export interface FileChange {
  path: string;
  repo: string;
  before: string;
  after: string;
  summary: string;
}

export interface AgentResponse {
  reply: string;
  changes: FileChange[];
  filesToRead?: string[];
}

const SYSTEM_PROMPT = `You are Kantage Watchdog, an expert AI DevOps agent with deep knowledge of the Kantage infrastructure.

## The three services you manage:

**Kantage Hub** (repo: hub) — Express.js + React/Vite SPA, PostgreSQL via Drizzle ORM.
- Entry: server/index.ts, server/routes.ts, client/src/pages/admin.tsx
- Auth: x-hub-auth header, ADMIN_PASSCODE env var
- Key: shared/schema.ts for DB types

**Kantage Builder** (repo: builder) — Next.js 14 app router, Prisma, Anthropic/OpenAI for AI code generation.
- Entry: app/api/sessions/[id]/chat/route.ts, lib/agents.ts
- Deploys via Kantage Deploy API (KANTAGE_DEPLOY_URL + KANTAGE_DEPLOY_BUILDER_SECRET)

**Kantage Deploy** (repo: deploy) — Next.js 14, Docker + Traefik for routing, PostgreSQL.
- Entry: src/app/api/builder/provision/route.ts, src/lib/deployment-engine.ts
- Manages Docker containers per app, Traefik labels for routing/SSL

## Your capabilities:
- Read files from any repo using the GitHub API
- Write multi-file fixes across frontend, backend, and config
- Diagnose build/deploy/runtime errors from logs
- Propose and commit approved changes

## Response format:
When you want to make code changes, return EXACTLY this JSON structure:
\`\`\`json
{
  "reply": "Plain English explanation of what you found and what you're doing",
  "changes": [
    {
      "repo": "hub|builder|deploy",
      "path": "relative/path/to/file.ts",
      "summary": "One-line description of the change",
      "content": "COMPLETE new file content — never truncated, never a diff"
    }
  ]
}
\`\`\`

When NOT making code changes (asking questions, explaining, diagnosing):
\`\`\`json
{
  "reply": "Your conversational reply",
  "changes": [],
  "readFiles": ["repo:path/to/file1", "repo:path/to/file2"]
}
\`\`\`

Always include ALL file content — never use "..." or "rest of file unchanged".
Never propose changes without first reading the current file.`;

async function callClaude(messages: { role: "user" | "assistant"; content: string }[], apiKey: string): Promise<string> {
  const client = new Anthropic({ apiKey });
  const response = await client.messages.create({
    model: "claude-3-5-sonnet-20241022",
    max_tokens: 8192,
    system: SYSTEM_PROMPT,
    messages,
  });
  return response.content[0].type === "text" ? response.content[0].text : "";
}

async function callGPT(messages: { role: "user" | "assistant" | "system"; content: string }[], apiKey: string): Promise<string> {
  const client = new OpenAI({ apiKey });
  const response = await client.chat.completions.create({
    model: "gpt-4o",
    max_tokens: 8192,
    messages: [{ role: "system", content: SYSTEM_PROMPT }, ...messages],
  });
  return response.choices[0].message.content || "";
}

function parseAgentResponse(raw: string): { reply: string; changes: any[]; readFiles: string[] } {
  const jsonMatch = raw.match(/```json\s*([\s\S]*?)\s*```/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[1]);
      return {
        reply: parsed.reply || raw,
        changes: parsed.changes || [],
        readFiles: parsed.readFiles || [],
      };
    } catch {}
  }
  try {
    const parsed = JSON.parse(raw);
    return { reply: parsed.reply || raw, changes: parsed.changes || [], readFiles: parsed.readFiles || [] };
  } catch {}
  return { reply: raw, changes: [], readFiles: [] };
}

export async function runAgent(
  userMessage: string,
  history: { role: "user" | "assistant"; content: string }[],
  contextLogs?: string
): Promise<AgentResponse> {
  const anthropicKey = (await getSetting("ANTHROPIC_API_KEY")) || process.env.ANTHROPIC_API_KEY || "";
  const openaiKey   = (await getSetting("OPENAI_API_KEY"))   || process.env.OPENAI_API_KEY   || "";
  const hasAnthropic = !!anthropicKey;
  const hasOpenAI    = !!openaiKey;

  if (!hasAnthropic && !hasOpenAI) {
    return {
      reply: "No AI API key configured. Go to Settings and add your ANTHROPIC_API_KEY or OPENAI_API_KEY.",
      changes: [],
    };
  }

  let fullMessage = userMessage;
  if (contextLogs) {
    fullMessage = `${userMessage}\n\n<context_logs>\n${contextLogs}\n</context_logs>`;
  }

  const messages: { role: "user" | "assistant"; content: string }[] = [
    ...history.slice(-20),
    { role: "user", content: fullMessage },
  ];

  let rawResponse = "";
  try {
    rawResponse = hasAnthropic ? await callClaude(messages, anthropicKey) : await callGPT(messages, openaiKey);
  } catch (e: any) {
    if (hasAnthropic && hasOpenAI) {
      rawResponse = await callGPT(messages, openaiKey);
    } else {
      return { reply: `AI error: ${e?.message || "Unknown error"}`, changes: [] };
    }
  }

  const parsed = parseAgentResponse(rawResponse);

  if (parsed.readFiles.length > 0) {
    const fileContents: string[] = [];
    for (const ref of parsed.readFiles.slice(0, 8)) {
      const [repo, ...parts] = ref.split(":");
      const path = parts.join(":");
      try {
        const { content } = await readFile(repo, path);
        fileContents.push(`\n\n--- FILE: ${repo}:${path} ---\n${content.slice(0, 6000)}`);
      } catch (e: any) {
        fileContents.push(`\n\n--- FILE: ${repo}:${path} ---\n(error reading: ${e?.message})`);
      }
    }

    const followUp: { role: "user" | "assistant"; content: string }[] = [
      ...messages,
      { role: "assistant", content: rawResponse },
      { role: "user", content: `Here are the files you requested:${fileContents.join("")}\n\nNow please write the fix.` },
    ];

    try {
      rawResponse = hasAnthropic ? await callClaude(followUp, anthropicKey) : await callGPT(followUp, openaiKey);
    } catch {}
    const parsed2 = parseAgentResponse(rawResponse);

    const changes: FileChange[] = await Promise.all(
      parsed2.changes.map(async (c: any) => {
        let before = "";
        try { ({ content: before } = await readFile(c.repo, c.path)); } catch {}
        return { path: c.path, repo: c.repo, before, after: c.content, summary: c.summary };
      })
    );

    return { reply: parsed2.reply, changes };
  }

  const changes: FileChange[] = await Promise.all(
    parsed.changes.map(async (c: any) => {
      let before = "";
      try { ({ content: before } = await readFile(c.repo, c.path)); } catch {}
      return { path: c.path, repo: c.repo, before, after: c.content, summary: c.summary };
    })
  );

  return { reply: parsed.reply, changes };
}
