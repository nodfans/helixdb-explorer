import { resetWorkbenchState } from "./workbench";
import { resetHqlWorkspaceState } from "./hql";

export type WorkspaceResetReason = "connection_switch" | "disconnect" | "workspace_switch";

/**
 * Resets cross-page workspace-scoped state while preserving session-level config.
 * This is the single entry point for cross-store workspace cleanup.
 */
export function resetWorkspaceContext(_reason: WorkspaceResetReason) {
  resetWorkbenchState("workspace");
  resetHqlWorkspaceState();
}

