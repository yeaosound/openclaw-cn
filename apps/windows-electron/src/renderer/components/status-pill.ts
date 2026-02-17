export function statusClass(state: string): string {
  if (state === "running") {
    return "status-pill status-pill--running";
  }
  if (state === "starting") {
    return "status-pill status-pill--starting";
  }
  if (state === "error") {
    return "status-pill status-pill--error";
  }
  return "status-pill status-pill--stopped";
}
