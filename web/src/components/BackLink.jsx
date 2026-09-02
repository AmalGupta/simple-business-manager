import { ChevronLeft } from "lucide-react";
import { t } from "../theme.js";

export function BackLink({ onClick, children, style }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: 0,
        marginBottom: "1rem",
        border: "none",
        background: "none",
        cursor: "pointer",
        color: t.edge2,
        fontSize: 13,
        ...style,
      }}
    >
      <ChevronLeft size={16} /> {children}
    </button>
  );
}
