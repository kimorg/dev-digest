import type { Agent } from "@devdigest/shared";

/** The editable subset of an agent, as held by the Config tab form. */
export type AgentForm = Pick<
  Agent,
  | "name"
  | "description"
  | "provider"
  | "model"
  | "system_prompt"
  | "strategy"
  | "ci_fail_on"
  | "repo_intel"
  | "enabled"
>;

/** Seed the form from the saved agent. */
export function toAgentForm(agent: Agent): AgentForm {
  return {
    name: agent.name,
    description: agent.description,
    provider: agent.provider,
    model: agent.model,
    system_prompt: agent.system_prompt,
    strategy: agent.strategy,
    ci_fail_on: agent.ci_fail_on,
    repo_intel: agent.repo_intel,
    enabled: agent.enabled,
  };
}
