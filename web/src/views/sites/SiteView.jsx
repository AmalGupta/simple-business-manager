import { useState, useEffect, useCallback, useMemo } from "react";
import { t } from "../../theme.js";
import { fmtDate, daysUntil } from "../../lib/dates.js";
import { sortCalls } from "../../lib/constants.js";
import { TILE_ROW_STYLE, TEXT_INPUT_STYLE, PRIMARY_BUTTON_STYLE, SMALL_SECONDARY_BUTTON_STYLE } from "../../styles.js";
import { fetchSiteTeam, fetchSiteTimeline, patchSite, postSiteTeamMember, postSiteVoiceNote } from "../../lib/api.js";
import { Card } from "../../components/Card.jsx";
import { BackLink } from "../../components/BackLink.jsx";
import { TileLabel } from "../../components/TileLabel.jsx";
import { SiteMediaUploadRow } from "./SiteMediaUploadRow.jsx";
import { MyTaskBanner } from "./MyTaskBanner.jsx";
import { SiteTimeline } from "./SiteTimeline.jsx";
import { AssignTeamModal } from "./AssignTeamModal.jsx";
import { WorkTimelinePopup } from "./WorkTimelinePopup.jsx";

/* ------------------------------------------------------------------
   Site view — drilldown from Tile 3, the sites directory, or the
   review screen. Calls tagged to this site (same shape as DayView,
   filtered by site instead of date), plus always-editable site details
   and an always-editable team roster — see the conversation that added
   this: "Always available, not conditional" on call/item count.
   ------------------------------------------------------------------ */
export function SiteView({
  site,
  siteRecord,
  calls,
  onBack,
  onOpen,
  onSiteUpdated,
  autoEditDetails = false,
  canManage = true,
  myOpenTasks = [],
  onTasksChanged = () => {},
  staffRoster = [],
  onAssignTodo,
}) {
  const [showWorkTimeline, setShowWorkTimeline] = useState(false);
  const siteCalls = useMemo(
    () => sortCalls(calls.filter((c) => c.sites?.includes(site))),
    [calls, site]
  );

  /* "Assign new site" only for a genuinely blank site — no details AND no
     call history yet. Anything with either already shows "Add more site
     details" instead, since it's not really a fresh/untouched site. */
  const hasDetails = Boolean(
    siteRecord?.address?.trim() ||
      siteRecord?.poc_name?.trim() ||
      siteRecord?.house_no?.trim() ||
      siteRecord?.sector?.trim() ||
      siteRecord?.city?.trim()
  );
  const isBlankSite = !hasDetails && siteCalls.length === 0;
  const daysMissed = siteRecord?.target_closure_date ? -daysUntil(siteRecord.target_closure_date) : 0;
  const targetMissed = daysMissed > 0;

  const [address, setAddress] = useState(siteRecord?.address ?? "");
  const [pocName, setPocName] = useState(siteRecord?.poc_name ?? "");
  const [targetDate, setTargetDate] = useState(siteRecord?.target_closure_date ?? "");
  const [savingDetails, setSavingDetails] = useState(false);
  const [detailsSaved, setDetailsSaved] = useState(false);
  // Landing here straight from "Add new site" (see onSiteCreated) opens the
  // details form immediately rather than requiring an extra tap, since the
  // whole point of that flow was to keep filling this site in.
  const [editingDetails, setEditingDetails] = useState(autoEditDetails && !hasDetails);

  const [team, setTeam] = useState(null);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [timeline, setTimeline] = useState(null);

  useEffect(() => {
    if (!siteRecord?.id) {
      setTeam([]);
      return;
    }
    let cancelled = false;
    fetchSiteTeam(siteRecord.id)
      .then((data) => {
        if (!cancelled) setTeam(data);
      })
      .catch((err) => {
        console.error("[sbm] failed to load site team", err);
        if (!cancelled) setTeam([]);
      });
    return () => {
      cancelled = true;
    };
  }, [siteRecord?.id]);

  const loadTimeline = useCallback(() => {
    if (!siteRecord?.id) {
      setTimeline([]);
      return Promise.resolve();
    }
    return fetchSiteTimeline(siteRecord.id)
      .then((data) => setTimeline(data))
      .catch((err) => {
        console.error("[sbm] failed to load site timeline", err);
        setTimeline([]);
      });
  }, [siteRecord?.id]);

  useEffect(() => {
    loadTimeline();
  }, [loadTimeline]);

  const saveDetails = async () => {
    if (!siteRecord?.id) return;
    setSavingDetails(true);
    setDetailsSaved(false);
    try {
      await patchSite(siteRecord.id, { address, poc_name: pocName, target_closure_date: targetDate || null });
      await onSiteUpdated?.();
      setDetailsSaved(true);
      setEditingDetails(false);
    } catch (err) {
      console.error("[sbm] failed to save site details", err);
    } finally {
      setSavingDetails(false);
    }
  };

  const addTeamMember = async (userId) => {
    const member = await postSiteTeamMember(siteRecord.id, userId);
    setTeam((current) => [...(current ?? []), member]);
  };

  const handleAssignTodo = async (todoId, staffId) => {
    if (!onAssignTodo) return;
    await onAssignTodo(todoId, staffId);
    await loadTimeline();
  };

  return (
    <div>
      <BackLink onClick={onBack}>Back</BackLink>

      <h1 style={{ fontFamily: t.display, fontSize: 22, fontWeight: 500, color: t.edge, margin: "0 0 1.25rem" }}>
        {site}
      </h1>

      {/* Staff have no visibility into the Sites-list red highlight (that's
          their own home page, not a management view) — this is their only
          signal that a target closure date has passed. Admin/superadmin get
          the list highlight instead; this banner would be redundant for
          them since they're the ones who set the date. */}
      {!canManage && targetMissed && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "10px 14px",
            marginBottom: "1.25rem",
            borderRadius: t.radiusCard,
            background: t.signalBg,
            color: t.signal,
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          You've missed the target closure date by {daysMissed} day{daysMissed === 1 ? "" : "s"}.
        </div>
      )}

      {siteRecord?.id && (
        <SiteMediaUploadRow
          siteId={siteRecord.id}
          onUploaded={loadTimeline}
          onVoiceNote={async (blob, fileName) => {
            await postSiteVoiceNote(siteRecord.id, blob, fileName);
            await loadTimeline();
          }}
        />
      )}

      {siteRecord?.id && (
        <Card style={{ marginBottom: 12 }}>
          <TileLabel
            action={
              canManage ? (
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {detailsSaved && !editingDetails && <span style={{ fontSize: 12, color: t.edge2 }}>Saved.</span>}
                  <button
                    onClick={() => {
                      setDetailsSaved(false);
                      setEditingDetails((v) => !v);
                    }}
                    style={{
                      padding: "6px 12px",
                      border: `1px solid ${t.frost}`,
                      borderRadius: t.radiusButton,
                      background: t.white,
                      color: t.edge,
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {editingDetails ? "Cancel" : isBlankSite ? "Assign new site" : "Add more site details"}
                  </button>
                </div>
              ) : undefined
            }
          >
            Site details
          </TileLabel>

          {canManage && editingDetails ? (
            <>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 6 }}>
                <input
                  placeholder="Address"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  style={TEXT_INPUT_STYLE}
                />
                <input
                  placeholder="Point of contact name"
                  value={pocName}
                  onChange={(e) => setPocName(e.target.value)}
                  style={TEXT_INPUT_STYLE}
                />
                <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: t.edge2 }}>
                  Target closure date
                  <input
                    type="date"
                    value={targetDate}
                    onChange={(e) => setTargetDate(e.target.value)}
                    style={TEXT_INPUT_STYLE}
                  />
                </label>
              </div>
              <div style={{ marginTop: 10 }}>
                <button onClick={saveDetails} disabled={savingDetails} style={{ ...PRIMARY_BUTTON_STYLE, opacity: savingDetails ? 0.6 : 1 }}>
                  {savingDetails ? "Saving…" : "Save details"}
                </button>
              </div>
            </>
          ) : (
            // Read-only summary of whatever's currently saved — shown for
            // everyone, not just staff, and not only while the edit form
            // happens to be open. Previously an admin had no way to see a
            // site's saved address/point-of-contact without re-opening the
            // edit form every visit, which read as "the details I added
            // aren't there when I come back."
            <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: 14, color: t.edge }}>{siteRecord?.address?.trim() || "No address on file."}</span>
              {siteRecord?.poc_name?.trim() && (
                <span style={{ fontSize: 13, color: t.edge2 }}>Point of contact: {siteRecord.poc_name}</span>
              )}
              {siteRecord?.poc_contact_number?.trim() && (
                <span style={{ fontSize: 13, color: t.edge2 }}>Contact: {siteRecord.poc_contact_number}</span>
              )}
              {(siteRecord?.assigned_by?.trim() || siteRecord?.referred_by?.trim()) && (
                <span style={{ fontSize: 13, color: t.edge2 }}>
                  {[siteRecord.assigned_by && `Assigned by ${siteRecord.assigned_by}`, siteRecord.referred_by && `Referred by ${siteRecord.referred_by}`]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              )}
              {siteRecord?.site_location?.trim() && (
                <span style={{ fontSize: 13, color: t.edge2 }}>Location: {siteRecord.site_location}</span>
              )}
              <span style={{ fontSize: 13, color: targetMissed ? t.signal : t.edge2, fontWeight: targetMissed ? 700 : 400 }}>
                {siteRecord?.target_closure_date
                  ? `Target closure date: ${fmtDate(siteRecord.target_closure_date)}${targetMissed ? ` — missed by ${daysMissed}d` : ""}`
                  : "No target closure date set."}
              </span>
            </div>
          )}
        </Card>
      )}

      {siteRecord?.id && (
        <Card style={{ marginBottom: 12 }}>
          <TileLabel
            action={
              canManage ? (
                <button
                  onClick={() => setShowAssignModal(true)}
                  style={{
                    padding: "6px 12px",
                    border: `1px solid ${t.frost}`,
                    borderRadius: t.radiusButton,
                    background: t.white,
                    color: t.edge,
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                  }}
                >
                  {team && team.length > 0 ? "Add more members" : "Assign team"}
                </button>
              ) : undefined
            }
          >
            Team
          </TileLabel>
          {team === null ? (
            <p style={{ fontSize: 13, color: t.edge2, margin: "6px 0 0" }}>Loading…</p>
          ) : team.length === 0 ? (
            <p style={{ fontSize: 13, color: t.edge2, margin: "6px 0 0" }}>No one assigned yet.</p>
          ) : (
            team.map((m) => (
              <div key={m.id} style={{ display: "flex", justifyContent: "space-between", ...TILE_ROW_STYLE }}>
                <span style={{ fontSize: 14, color: t.edge }}>{m.name}</span>
                <span style={{ fontSize: 13, color: t.edge2 }}>{m.contact_number || "no phone on file"}</span>
              </div>
            ))
          )}
        </Card>
      )}

      {siteRecord?.id && canManage && (
        <div style={{ marginBottom: 12 }}>
          <button onClick={() => setShowWorkTimeline(true)} style={SMALL_SECONDARY_BUTTON_STYLE}>
            View work timeline
          </button>
        </div>
      )}

      {siteRecord?.id && !canManage && (
        <MyTaskBanner siteId={siteRecord.id} myTasks={myOpenTasks} onChanged={onTasksChanged} />
      )}

      <TileLabel>Timeline</TileLabel>
      <div style={{ marginTop: 8 }}>
        <SiteTimeline
          entries={timeline}
          onOpenCall={onOpen}
          canManage={canManage}
          staffRoster={staffRoster}
          onAssignTodo={handleAssignTodo}
        />
      </div>

      {showAssignModal && <AssignTeamModal onClose={() => setShowAssignModal(false)} onAdd={addTeamMember} />}
      {showWorkTimeline && (
        <WorkTimelinePopup site={siteRecord} onClose={() => setShowWorkTimeline(false)} onAssigned={onTasksChanged} />
      )}
    </div>
  );
}
