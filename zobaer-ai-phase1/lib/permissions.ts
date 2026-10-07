// Central permission model (Phase 2 engine builds on this). Nothing executes tools in Phase 1.
export enum PermissionLevel { Informational = 0, LowRisk = 1, Confirm = 2, HighImpact = 3 }
export type Decision = "allow_once" | "allow_task" | "always_allow" | "deny" | "cancel";
export function requiresPrompt(level: PermissionLevel, alwaysAllowed: boolean): boolean {
  if (level === PermissionLevel.HighImpact) return true; // never bypassed
  if (level === PermissionLevel.Informational) return false;
  return !alwaysAllowed;
}
