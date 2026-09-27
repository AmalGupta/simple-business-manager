import { t } from "../theme.js";

/* Prompt v8 todos[].context (migration 0045) — what was said around a todo,
   so it can be routed or done without replaying the call. A <span> with
   display:block so it can sit inside the inline todo-text spans. NULL for
   todos extracted before v8, in which case nothing renders. */
export function TodoContext({ text, style }) {
  if (!text) return null;
  return (
    <span
      style={{
        display: "block",
        marginTop: 3,
        paddingLeft: 8,
        borderLeft: `2px solid ${t.frost}`,
        fontSize: 12,
        lineHeight: 1.45,
        color: t.edge2,
        textDecoration: "none",
        ...style,
      }}
    >
      {text}
    </span>
  );
}
