import { Phone } from "lucide-react";
import { t } from "../theme.js";

export function PhoneLink({ phone }) {
  if (!phone) return null;
  return (
    <a
      href={`tel:${phone.replace(/\s/g, "")}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontSize: 13,
        fontWeight: 700,
        padding: "7px 12px",
        borderRadius: t.radiusButton,
        background: t.accent,
        color: t.white,
        textDecoration: "none",
      }}
    >
      <Phone size={14} />
      Call {phone}
    </a>
  );
}
