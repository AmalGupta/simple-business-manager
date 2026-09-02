import { useState, useEffect, useMemo, useRef } from "react";
import { Image, Video, Mic, Check } from "lucide-react";
import { t } from "../../theme.js";
import { INSTALLATION_UPDATE_CATEGORIES } from "../../lib/constants.js";
import { fetchInstallation, fetchSiteTimeline, postInstallationUpdate, postInstallationUpdateMedia } from "../../lib/api.js";
import { Card } from "../../components/Card.jsx";
import { BackLink } from "../../components/BackLink.jsx";
import { VoiceNoteModal } from "../sites/VoiceNoteModal.jsx";
import { SiteTimeline } from "../sites/SiteTimeline.jsx";

const actionButtonStyle = (busy) => ({
  display: "flex",
  alignItems: "center",
  gap: 6,
  padding: "8px 14px",
  minHeight: 40,
  border: `1px solid ${t.frost}`,
  borderRadius: t.radiusButton,
  background: t.white,
  color: t.edge,
  fontSize: 13,
  fontWeight: 600,
  cursor: busy ? "wait" : "pointer",
  whiteSpace: "nowrap",
});

const tableHeaderStyle = {
  fontFamily: t.label,
  fontSize: 10,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  color: t.edge2,
};

function rowStatus(current) {
  if (!current?.voice_note_call_id) return { label: "—", complete: false, started: false };
  if (current.media_count > 0) return { label: "Done", complete: true, started: true };
  return { label: "In progress", complete: false, started: true };
}

function filterTimelineForCategory(timeline, updates, categoryKey) {
  if (!timeline || !updates) return [];
  const updateIds = new Set(updates.filter((u) => u.category === categoryKey).map((u) => u.id));
  const callIds = new Set(
    updates.filter((u) => u.category === categoryKey && u.voice_note_call_id).map((u) => u.voice_note_call_id)
  );
  return timeline.filter((entry) => {
    if (entry.type === "call" && callIds.has(entry.id)) return true;
    if (entry.type === "media" && entry.ref?.installation_update_id && updateIds.has(entry.ref.installation_update_id)) {
      return true;
    }
    return false;
  });
}

/*
 * Compact 6-row checklist table + category timeline panel. Voice notes still
 * flow through the calls/STT pipeline and appear on the site timeline
 * (transcript admin-only on the sites page). Each row's panel reuses
 * SiteTimeline filtered to that category's installation_updates.
 */
export function InstallationScreen({ installation, onBack, onHome }) {
  const [updates, setUpdates] = useState(null);
  const [timeline, setTimeline] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState(INSTALLATION_UPDATE_CATEGORIES[0].key);
  const [recordingCategory, setRecordingCategory] = useState(null);
  const [busyUpdateId, setBusyUpdateId] = useState(null);
  const photoTargetRef = useRef(null);
  const videoTargetRef = useRef(null);
  const photoInputRef = useRef(null);
  const videoInputRef = useRef(null);

  const load = () => {
    fetchInstallation(installation.id)
      .then((data) => {
        setUpdates(data.updates);
        return fetchSiteTimeline(data.installation.site_id);
      })
      .then((entries) => setTimeline(entries))
      .catch((err) => {
        console.error("[sbm] failed to load installation", err);
        setUpdates([]);
        setTimeline([]);
      });
  };

  useEffect(load, [installation.id]);

  const latestByCategory = useMemo(() => {
    const m = new Map();
    for (const u of updates ?? []) m.set(u.category, u);
    return m;
  }, [updates]);

  const selectedMeta = INSTALLATION_UPDATE_CATEGORIES.find((c) => c.key === selectedCategory);
  const current = latestByCategory.get(selectedCategory);
  const hasVoice = Boolean(current?.voice_note_call_id);
  const complete = hasVoice && current.media_count > 0;
  const busy = busyUpdateId === current?.id;

  const categoryTimeline = useMemo(
    () => filterTimelineForCategory(timeline, updates, selectedCategory),
    [timeline, updates, selectedCategory]
  );

  const handleVoiceNote = async (category, blob, fileName) => {
    await postInstallationUpdate(installation.id, category, blob, fileName);
    load();
  };

  const handleMediaFile = async (file) => {
    const updateId = photoTargetRef.current ?? videoTargetRef.current;
    if (!file || !updateId) return;
    setBusyUpdateId(updateId);
    try {
      await postInstallationUpdateMedia(updateId, file);
      load();
    } catch (err) {
      console.error("[sbm] failed to attach media", err);
    } finally {
      setBusyUpdateId(null);
      photoTargetRef.current = null;
      videoTargetRef.current = null;
    }
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: "1rem" }}>
        <BackLink onClick={onBack} style={{ marginBottom: 0 }}>
          Back
        </BackLink>
        {onHome && (
          <button
            type="button"
            onClick={onHome}
            style={{
              padding: 0,
              border: "none",
              background: "none",
              cursor: "pointer",
              color: t.accent,
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            Home
          </button>
        )}
      </div>
      <h1 style={{ fontFamily: t.display, fontSize: 22, fontWeight: 500, color: t.edge, margin: "0 0 1.25rem" }}>
        {installation.label}
      </h1>

      <input
        ref={photoInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: "none" }}
        onChange={(e) => {
          handleMediaFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <input
        ref={videoInputRef}
        type="file"
        accept="video/*"
        capture="environment"
        style={{ display: "none" }}
        onChange={(e) => {
          handleMediaFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />

      {updates === null ? (
        <p style={{ fontSize: 14, color: t.edge2 }}>Loading…</p>
      ) : (
        <div className="sbm-install-grid">
          <Card style={{ padding: 0, alignSelf: "start" }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(0, 1fr) max-content",
                gap: 12,
                padding: "10px 14px",
                borderBottom: `1px solid ${t.frost}`,
                ...tableHeaderStyle,
              }}
            >
              <span>Section</span>
              <span>Status</span>
            </div>
            {INSTALLATION_UPDATE_CATEGORIES.map((cat) => {
              const row = latestByCategory.get(cat.key);
              const { label: status, complete: rowComplete } = rowStatus(row);
              const selected = selectedCategory === cat.key;

              return (
                <button
                  key={cat.key}
                  type="button"
                  onClick={() => setSelectedCategory(cat.key)}
                  aria-pressed={selected}
                  style={{
                    all: "unset",
                    boxSizing: "border-box",
                    cursor: "pointer",
                    display: "grid",
                    gridTemplateColumns: "minmax(0, 1fr) max-content",
                    gap: 12,
                    alignItems: "center",
                    width: "100%",
                    padding: "10px 14px",
                    borderTop: `1px solid ${t.frost}`,
                    background: selected ? "color-mix(in srgb, var(--color-accent) 10%, white)" : t.white,
                    fontFamily: t.body,
                    textAlign: "left",
                  }}
                >
                  <span
                    style={{
                      fontSize: 14,
                      fontWeight: selected ? 600 : 400,
                      color: t.edge,
                      lineHeight: 1.35,
                      minWidth: 0,
                    }}
                  >
                    {cat.label}
                  </span>
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                      fontSize: 12,
                      color: rowComplete ? t.accent : t.edge2,
                      whiteSpace: "nowrap",
                      flexShrink: 0,
                    }}
                  >
                    {rowComplete && <Check size={14} />}
                    {status}
                  </span>
                </button>
              );
            })}
          </Card>

          <div>
            <h2 style={{ fontFamily: t.display, fontSize: 17, fontWeight: 500, color: t.edge, margin: "0 0 12px" }}>
              {selectedMeta?.label}
            </h2>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
              {!hasVoice && (
                <button type="button" onClick={() => setRecordingCategory(selectedCategory)} style={actionButtonStyle(false)}>
                  <Mic size={15} /> Add voice note
                </button>
              )}
              {hasVoice && (
                <>
                  <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: t.edge2, minHeight: 40 }}>
                    <Mic size={13} /> Voice note recorded
                  </span>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      photoTargetRef.current = current.id;
                      photoInputRef.current?.click();
                    }}
                    style={actionButtonStyle(busy)}
                  >
                    <Image size={15} /> Add photo
                  </button>
                  {selectedMeta?.allowVideo && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        videoTargetRef.current = current.id;
                        videoInputRef.current?.click();
                      }}
                      style={actionButtonStyle(busy)}
                    >
                      <Video size={15} /> Add video
                    </button>
                  )}
                </>
              )}
              {complete && (
                <button
                  type="button"
                  onClick={() => setRecordingCategory(selectedCategory)}
                  style={{ all: "unset", cursor: "pointer", fontSize: 12, fontWeight: 600, color: t.accent, minHeight: 40, display: "flex", alignItems: "center" }}
                >
                  Log another update →
                </button>
              )}
            </div>

            {timeline === null ? (
              <p style={{ fontSize: 13, color: t.edge2 }}>Loading timeline…</p>
            ) : categoryTimeline.length === 0 ? (
              <Card style={{ padding: "2rem 1.5rem", textAlign: "center" }}>
                <p style={{ fontSize: 14, color: t.edge2, margin: 0 }}>Nothing logged in this section yet.</p>
              </Card>
            ) : (
              <SiteTimeline entries={categoryTimeline} canManage={false} onOpenCall={() => {}} />
            )}
          </div>
        </div>
      )}

      {recordingCategory && (
        <VoiceNoteModal
          onClose={() => setRecordingCategory(null)}
          onSave={async (blob, fileName) => {
            await handleVoiceNote(recordingCategory, blob, fileName);
          }}
        />
      )}
    </div>
  );
}
