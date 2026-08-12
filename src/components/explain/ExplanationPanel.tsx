import type { ReactNode } from "react";

export function ExplanationPanel({ children }: { children: ReactNode }) {
  return <div className="explanation-panel">{children}</div>;
}
