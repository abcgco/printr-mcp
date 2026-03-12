import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { commandExists } from "../../setup/lib/clients.js";

export type AgentDef = {
  id: string;
  label: string;
  detect: () => boolean;
  skillPath: () => string;
};

export type InstallResult = "installed" | "already_exists" | "failed";

export const AGENTS: AgentDef[] = [
  {
    id: "claude-code",
    label: "Claude Code",
    detect: () => commandExists("claude"),
    skillPath: () => join(homedir(), ".claude", "skills", "printr.md"),
  },
  {
    id: "cursor",
    label: "Cursor",
    detect: () => commandExists("cursor") || existsSync(join(homedir(), ".cursor")),
    skillPath: () => join(homedir(), ".cursor", "skills", "printr.md"),
  },
  {
    id: "windsurf",
    label: "Windsurf",
    detect: () => commandExists("windsurf") || existsSync(join(homedir(), ".codeium", "windsurf")),
    skillPath: () => join(homedir(), ".codeium", "windsurf", "skills", "printr.md"),
  },
  {
    id: "gemini",
    label: "Gemini CLI",
    detect: () => commandExists("gemini") || existsSync(join(homedir(), ".gemini")),
    skillPath: () => join(homedir(), ".gemini", "skills", "printr.md"),
  },
  {
    id: "local",
    label: "Local project (.claude/skills/)",
    detect: () => existsSync(".claude") || existsSync(".git"),
    skillPath: () => join(process.cwd(), ".claude", "skills", "printr.md"),
  },
];

export const ALL_AGENT_IDS = AGENTS.map((a) => a.id);

export function installSkill(agent: AgentDef, content: string): InstallResult {
  try {
    const path = agent.skillPath();
    if (existsSync(path)) return "already_exists";
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
    return "installed";
  } catch {
    return "failed";
  }
}
