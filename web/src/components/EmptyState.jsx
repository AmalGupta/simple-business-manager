import { CircleDashed } from "lucide-react";
import { t } from "../theme.js";
import { Card } from "./Card.jsx";

export function EmptyState() {
  return (
    <Card style={{ textAlign: "center", padding: "3rem 1.5rem" }}>
      <CircleDashed size={28} strokeWidth={1.25} color={t.edge2} />
      <p style={{ fontFamily: t.display, fontSize: 18, color: t.edge, margin: "1rem 0 6px" }}>
        Nothing recorded yet
      </p>
      <p style={{ fontSize: 14, color: t.edge2, margin: 0, lineHeight: 1.7 }}>
        The first call you record will show up here within fifteen minutes.
      </p>
    </Card>
  );
}
