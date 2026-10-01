import { createContext, useCallback, useContext } from "react";

/* ------------------------------------------------------------------
   SBM-72 — staff screens in Hindi (default), English, or Punjabi.

   Staff are field and factory workers; an admin picks each person's
   language from that person's tab on the admin home (stored server-side
   as user_settings.display_language, returned on /api/me). Admin screens
   stay English. Only screen text and fixed catalog labels (workflow
   stages, categories, checklist rows) are translated — task text from
   calls and complaints is shown exactly as it was spoken.

   Usage:  const tr = useT();  tr("assignedWork")  tr("nOpen", { n: 3 })
   A missing key falls back to English, then to the key itself.
   ------------------------------------------------------------------ */

export const LANGUAGES = [
  { key: "hi", label: "हिन्दी (Hindi)" },
  { key: "en", label: "English" },
  { key: "pa", label: "ਪੰਜਾਬੀ (Punjabi)" },
];

const LanguageContext = createContext("en");

export function LanguageProvider({ lang, children }) {
  return <LanguageContext.Provider value={lang || "en"}>{children}</LanguageContext.Provider>;
}

export function useLang() {
  return useContext(LanguageContext);
}

/** BCP-47 locale for dates/numbers in the current language. */
export function localeFor(lang) {
  return lang === "hi" ? "hi-IN" : lang === "pa" ? "pa-IN" : "en-IN";
}

function interpolate(text, vars) {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (m, k) => (vars[k] ?? vars[k] === 0 ? String(vars[k]) : m));
}

export function translate(lang, key, vars) {
  const entry = STRINGS[key];
  if (!entry) return interpolate(key, vars);
  return interpolate(entry[lang] ?? entry.en ?? key, vars);
}

export function useT() {
  const lang = useLang();
  return useCallback((key, vars) => translate(lang, key, vars), [lang]);
}

/* Fixed catalog labels — keyed by the stable id, English label as fallback. */
export function stageLabel(lang, stageId, fallback) {
  const entry = STAGES[stageId];
  return (entry && (entry[lang] ?? entry.en)) || fallback || stageId || "";
}

export function categoryLabel(lang, key, fallback) {
  const entry = CATEGORIES[key];
  return (entry && (entry[lang] ?? entry.en)) || fallback || key || "";
}

export function checklistLabel(lang, key, fallback) {
  const entry = CHECKLIST[key];
  return (entry && (entry[lang] ?? entry.en)) || fallback || key || "";
}

/* Date helpers that follow the display language. */
export function fmtDateLang(lang, iso) {
  if (!iso) return "";
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  return d.toLocaleDateString(localeFor(lang), { weekday: "short", day: "numeric", month: "short" });
}

export function fmtShortLang(lang, iso) {
  if (!iso) return "";
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  return d.toLocaleDateString(localeFor(lang), { day: "numeric", month: "short" });
}

/** "23h left" / "overdue", in the display language. */
export function fmtTimeLeftLang(lang, deadline, now = Date.now()) {
  if (!deadline) return "";
  const ms = deadline.getTime() - now;
  if (ms <= 0) return translate(lang, "overdue");
  const h = Math.floor(ms / 3600000);
  if (h >= 1) return translate(lang, "hoursLeft", { n: h });
  return translate(lang, "minutesLeft", { n: Math.max(1, Math.floor(ms / 60000)) });
}

// ---------------------------------------------------------------------------
// Workflow stages (migration 0013 + later) — keyed by workflow_stages.id.
// ---------------------------------------------------------------------------
const STAGES = {
  order_received: { en: "Order Received", hi: "ऑर्डर मिला", pa: "ਆਰਡਰ ਮਿਲਿਆ" },
  details_uploaded: { en: "Details Upload To System", hi: "जानकारी सिस्टम में डालें", pa: "ਜਾਣਕਾਰੀ ਸਿਸਟਮ ਵਿੱਚ ਪਾਓ" },
  site_inspection: { en: "Site Inspection", hi: "साइट निरीक्षण", pa: "ਸਾਈਟ ਜਾਂਚ" },
  material_ordered: { en: "Material Ordered", hi: "सामान का ऑर्डर दिया", pa: "ਸਮਾਨ ਦਾ ਆਰਡਰ ਦਿੱਤਾ" },
  material_received: { en: "Material Received", hi: "सामान मिला", pa: "ਸਮਾਨ ਮਿਲਿਆ" },
  material_sent_coating: { en: "Material Sent For Coating", hi: "सामान कोटिंग के लिए भेजा", pa: "ਸਮਾਨ ਕੋਟਿੰਗ ਲਈ ਭੇਜਿਆ" },
  material_received_coating: { en: "Material Received From Coating", hi: "कोटिंग से सामान वापस मिला", pa: "ਕੋਟਿੰਗ ਤੋਂ ਸਮਾਨ ਵਾਪਸ ਮਿਲਿਆ" },
  quality_control_frames: { en: "Quality Control (Frames)", hi: "गुणवत्ता जाँच (फ्रेम)", pa: "ਗੁਣਵੱਤਾ ਜਾਂਚ (ਫ੍ਰੇਮ)" },
  final_measurements_uploaded: { en: "Final Measurements Uploaded", hi: "अंतिम नाप डाले गए", pa: "ਅੰਤਿਮ ਮਾਪ ਪਾਏ ਗਏ" },
  production_starts: { en: "Production Starts", hi: "उत्पादन शुरू", pa: "ਉਤਪਾਦਨ ਸ਼ੁਰੂ" },
  frames_only_qc: { en: "Frames Only Quality Control", hi: "सिर्फ़ फ्रेम की गुणवत्ता जाँच", pa: "ਸਿਰਫ਼ ਫ੍ਰੇਮ ਦੀ ਗੁਣਵੱਤਾ ਜਾਂਚ" },
  frames_billed_delivered: { en: "Frames Billed & Delivered", hi: "फ्रेम का बिल बना और डिलीवर हुए", pa: "ਫ੍ਰੇਮ ਦਾ ਬਿੱਲ ਬਣਿਆ ਤੇ ਡਿਲੀਵਰ ਹੋਏ" },
  frames_installed: { en: "Frames Installed", hi: "फ्रेम लग गए", pa: "ਫ੍ਰੇਮ ਲੱਗ ਗਏ" },
  payment_frames: { en: "Payment (Frames)", hi: "भुगतान (फ्रेम)", pa: "ਭੁਗਤਾਨ (ਫ੍ਰੇਮ)" },
  glass_ordered: { en: "Glass Ordered", hi: "शीशे का ऑर्डर दिया", pa: "ਸ਼ੀਸ਼ੇ ਦਾ ਆਰਡਰ ਦਿੱਤਾ" },
  glass_received: { en: "Glass Received", hi: "शीशा मिला", pa: "ਸ਼ੀਸ਼ਾ ਮਿਲਿਆ" },
  shutter_integrated: { en: "Shutter Integrated", hi: "शटर जोड़ा गया", pa: "ਸ਼ਟਰ ਜੋੜਿਆ ਗਿਆ" },
  quality_control_shutter: { en: "Quality Control (Shutter)", hi: "गुणवत्ता जाँच (शटर)", pa: "ਗੁਣਵੱਤਾ ਜਾਂਚ (ਸ਼ਟਰ)" },
  billed_delivered: { en: "Billed & Delivered", hi: "बिल बना और डिलीवर हुआ", pa: "ਬਿੱਲ ਬਣਿਆ ਤੇ ਡਿਲੀਵਰ ਹੋਇਆ" },
  shutter_installed: { en: "Shutter Installed", hi: "शटर लग गया", pa: "ਸ਼ਟਰ ਲੱਗ ਗਿਆ" },
  handover: {
    en: "Handover + Silicon + Georgian Glass + Accessories",
    hi: "हैंडओवर + सिलिकॉन + जॉर्जियन ग्लास + सामान",
    pa: "ਹੈਂਡਓਵਰ + ਸਿਲੀਕਾਨ + ਜਾਰਜੀਅਨ ਗਲਾਸ + ਸਮਾਨ",
  },
  payment_final: { en: "Payment (Final)", hi: "भुगतान (अंतिम)", pa: "ਭੁਗਤਾਨ (ਅੰਤਿਮ)" },
  mesh_locking_done: { en: "Mesh & Locking Done", hi: "जाली और लॉक लग गए", pa: "ਜਾਲੀ ਤੇ ਲਾਕ ਲੱਗ ਗਏ" },
};

// Workflow categories (constants.js WORKFLOW_CATEGORIES) + Office/Factory.
const CATEGORIES = {
  admin_intake: { en: "Admin & Intake", hi: "एडमिन और एंट्री", pa: "ਐਡਮਿਨ ਤੇ ਐਂਟਰੀ" },
  measurement: { en: "Measurement", hi: "नाप", pa: "ਮਾਪ" },
  procurement: { en: "Procurement", hi: "खरीद", pa: "ਖਰੀਦ" },
  production: { en: "Production", hi: "उत्पादन", pa: "ਉਤਪਾਦਨ" },
  quality_control: { en: "Quality Control", hi: "गुणवत्ता जाँच", pa: "ਗੁਣਵੱਤਾ ਜਾਂਚ" },
  installation: { en: "Installation", hi: "फिटिंग", pa: "ਫਿਟਿੰਗ" },
  handover: { en: "Handover", hi: "हैंडओवर", pa: "ਹੈਂਡਓਵਰ" },
  billing_delivery: { en: "Billing & Delivery", hi: "बिल और डिलीवरी", pa: "ਬਿੱਲ ਤੇ ਡਿਲੀਵਰੀ" },
  office: { en: "Office", hi: "ऑफ़िस", pa: "ਦਫ਼ਤਰ" },
  factory: { en: "Factory", hi: "फ़ैक्टरी", pa: "ਫ਼ੈਕਟਰੀ" },
};

// Installation checklist rows (constants.js INSTALLATION_UPDATE_CATEGORIES) + site-visit categories.
const CHECKLIST = {
  location: { en: "Location of Work / Window", hi: "काम / खिड़की की जगह", pa: "ਕੰਮ / ਖਿੜਕੀ ਦੀ ਥਾਂ" },
  work_done: { en: "Work Done", hi: "हो चुका काम", pa: "ਹੋ ਚੁੱਕਾ ਕੰਮ" },
  work_pending: { en: "Work Pending", hi: "बाकी काम", pa: "ਬਾਕੀ ਕੰਮ" },
  material_short: { en: "Material Short", hi: "सामान कम है", pa: "ਸਮਾਨ ਘੱਟ ਹੈ" },
  complaints: { en: "Complaints", hi: "शिकायतें", pa: "ਸ਼ਿਕਾਇਤਾਂ" },
  site_delay: { en: "Site Delay", hi: "साइट पर देरी", pa: "ਸਾਈਟ 'ਤੇ ਦੇਰੀ" },
  installation: { en: "Installation", hi: "फिटिंग", pa: "ਫਿਟਿੰਗ" },
  measurement: { en: "New Measurement", hi: "नया नाप", pa: "ਨਵਾਂ ਮਾਪ" },
  material_delivery: { en: "Material Delivery", hi: "सामान की डिलीवरी", pa: "ਸਮਾਨ ਦੀ ਡਿਲੀਵਰੀ" },
};

// ---------------------------------------------------------------------------
// Screen text.
// ---------------------------------------------------------------------------
const STRINGS = {
  // Common
  back: { en: "Back", hi: "वापस", pa: "ਵਾਪਸ" },
  loading: { en: "Loading…", hi: "लोड हो रहा है…", pa: "ਲੋਡ ਹੋ ਰਿਹਾ ਹੈ…" },
  cancel: { en: "Cancel", hi: "रद्द करें", pa: "ਰੱਦ ਕਰੋ" },
  save: { en: "Save", hi: "सेव करें", pa: "ਸੇਵ ਕਰੋ" },
  saving: { en: "Saving…", hi: "सेव हो रहा है…", pa: "ਸੇਵ ਹੋ ਰਿਹਾ ਹੈ…" },
  done: { en: "Done", hi: "हो गया", pa: "ਹੋ ਗਿਆ" },
  passOn: { en: "Pass on", hi: "आगे दें", pa: "ਅੱਗੇ ਦਿਓ" },
  passOnTo: { en: "Pass on to…", hi: "किसे दें…", pa: "ਕਿਸਨੂੰ ਦੇਣਾ…" },
  planFor: { en: "Plan for", hi: "किस दिन करेंगे", pa: "ਕਿਸ ਦਿਨ ਕਰੋਗੇ" },
  planForDate: { en: "Plan for date", hi: "तारीख चुनें", pa: "ਤਾਰੀਖ਼ ਚੁਣੋ" },
  due: { en: "due {date}", hi: "{date} तक", pa: "{date} ਤੱਕ" },
  deadline: { en: "Deadline {date}", hi: "आखिरी तारीख {date}", pa: "ਆਖ਼ਰੀ ਤਾਰੀਖ਼ {date}" },
  urgent: { en: "Urgent", hi: "ज़रूरी", pa: "ਜ਼ਰੂਰੀ" },
  urgentFinishToday: {
    en: "Urgent — finish today, can’t be moved",
    hi: "ज़रूरी — आज ही पूरा करें, तारीख नहीं बदल सकते",
    pa: "ਜ਼ਰੂਰੀ — ਅੱਜ ਹੀ ਪੂਰਾ ਕਰੋ, ਤਾਰੀਖ਼ ਨਹੀਂ ਬਦਲ ਸਕਦੇ",
  },
  timeLeft: { en: "{t} left", hi: "{t} बाकी", pa: "{t} ਬਾਕੀ" },
  plannedNotDone: { en: "planned {date}, not done", hi: "{date} को करना था, नहीं हुआ", pa: "{date} ਨੂੰ ਕਰਨਾ ਸੀ, ਨਹੀਂ ਹੋਇਆ" },
  plannedOn: { en: "planned {date}", hi: "{date} को करना है", pa: "{date} ਨੂੰ ਕਰਨਾ ਹੈ" },
  notPlanned: { en: "Not planned yet", hi: "अभी दिन तय नहीं", pa: "ਹਾਲੇ ਦਿਨ ਤੈਅ ਨਹੀਂ" },
  today: { en: "Today", hi: "आज", pa: "ਅੱਜ" },
  failedTryAgain: { en: "That didn’t work — try again.", hi: "नहीं हुआ — फिर से कोशिश करें।", pa: "ਨਹੀਂ ਹੋਇਆ — ਫਿਰ ਕੋਸ਼ਿਸ਼ ਕਰੋ।" },
  site: { en: "Site", hi: "साइट", pa: "ਸਾਈਟ" },
  noSite: { en: "No site", hi: "कोई साइट नहीं", pa: "ਕੋਈ ਸਾਈਟ ਨਹੀਂ" },
  general: { en: "General", hi: "सामान्य", pa: "ਆਮ" },
  openSite: { en: "Open site", hi: "साइट खोलें", pa: "ਸਾਈਟ ਖੋਲ੍ਹੋ" },
  call: { en: "Call {n}", hi: "कॉल करें {n}", pa: "ਕਾਲ ਕਰੋ {n}" },
  fromCallWith: { en: "from call with {name}", hi: "{name} के साथ कॉल से", pa: "{name} ਨਾਲ ਕਾਲ ਤੋਂ" },
  complaint: { en: "Complaint", hi: "शिकायत", pa: "ਸ਼ਿਕਾਇਤ" },
  carriedFrom: { en: "carried forward from {date}", hi: "{date} से आगे बढ़ाया", pa: "{date} ਤੋਂ ਅੱਗੇ ਵਧਾਇਆ" },
  carriedForward: {
    en: "c/f by {n} days · due {date}",
    hi: "{n} दिन आगे बढ़ा · {date} तक करना था",
    pa: "{n} ਦਿਨ ਅੱਗੇ ਵਧਿਆ · {date} ਤੱਕ ਕਰਨਾ ਸੀ",
  },
  hoursLeft: { en: "{n}h left", hi: "{n} घंटे बाकी", pa: "{n} ਘੰਟੇ ਬਾਕੀ" },
  minutesLeft: { en: "{n}m left", hi: "{n} मिनट बाकी", pa: "{n} ਮਿੰਟ ਬਾਕੀ" },
  overdue: { en: "overdue", hi: "समय निकल गया", pa: "ਸਮਾਂ ਲੰਘ ਗਿਆ" },

  // Staff home tiles
  assignedWork: { en: "Assigned work", hi: "मेरा काम", pa: "ਮੇਰਾ ਕੰਮ" },
  siteVisit: { en: "Site visit", hi: "साइट विज़िट", pa: "ਸਾਈਟ ਵਿਜ਼ਿਟ" },
  complaints: { en: "Complaints", hi: "शिकायतें", pa: "ਸ਼ਿਕਾਇਤਾਂ" },
  nUrgent: { en: "{n} urgent", hi: "{n} ज़रूरी", pa: "{n} ਜ਼ਰੂਰੀ" },
  nComplaints: { en: "{n} complaints", hi: "{n} शिकायतें", pa: "{n} ਸ਼ਿਕਾਇਤਾਂ" },
  nComplaint: { en: "{n} complaint", hi: "{n} शिकायत", pa: "{n} ਸ਼ਿਕਾਇਤ" },
  nOpen: { en: "{n} open", hi: "{n} बाकी", pa: "{n} ਬਾਕੀ" },
  tasks: { en: "tasks", hi: "काम", pa: "ਕੰਮ" },

  // Assigned work page
  nothingAssigned: { en: "Nothing assigned right now.", hi: "अभी कोई काम नहीं है।", pa: "ਹਾਲੇ ਕੋਈ ਕੰਮ ਨਹੀਂ ਹੈ।" },
  couldntLoadWork: {
    en: "Couldn’t load assigned work. Go back and try again.",
    hi: "काम लोड नहीं हुआ। वापस जाकर फिर कोशिश करें।",
    pa: "ਕੰਮ ਲੋਡ ਨਹੀਂ ਹੋਇਆ। ਵਾਪਸ ਜਾ ਕੇ ਫਿਰ ਕੋਸ਼ਿਸ਼ ਕਰੋ।",
  },
  newSite: { en: "New site", hi: "नई साइट", pa: "ਨਵੀਂ ਸਾਈਟ" },
  notLinkedToSite: { en: "Not linked to a site", hi: "किसी साइट से नहीं जुड़ा", pa: "ਕਿਸੇ ਸਾਈਟ ਨਾਲ ਨਹੀਂ ਜੁੜਿਆ" },
  showMore: { en: "Show more ({n} left)", hi: "और दिखाएँ ({n} बाकी)", pa: "ਹੋਰ ਵਿਖਾਓ ({n} ਬਾਕੀ)" },
  filterAll: { en: "All", hi: "सब", pa: "ਸਾਰੇ" },
  resolve: { en: "Resolve", hi: "हल हुआ", pa: "ਹੱਲ ਹੋਇਆ" },

  // Complaints
  addComplaint: { en: "Add complaint", hi: "शिकायत जोड़ें", pa: "ਸ਼ਿਕਾਇਤ ਜੋੜੋ" },
  noComplaints: { en: "No complaints yet.", hi: "अभी कोई शिकायत नहीं।", pa: "ਹਾਲੇ ਕੋਈ ਸ਼ਿਕਾਇਤ ਨਹੀਂ।" },
  noUnresolvedComplaints: { en: "No unresolved complaints.", hi: "कोई बाकी शिकायत नहीं।", pa: "ਕੋਈ ਬਾਕੀ ਸ਼ਿਕਾਇਤ ਨਹੀਂ।" },
  hideResolved: { en: "Hide resolved ({n})", hi: "हल हुई छिपाएँ ({n})", pa: "ਹੱਲ ਹੋਈਆਂ ਲੁਕਾਓ ({n})" },
  raisedOn: { en: "Raised {date}", hi: "{date} को दर्ज", pa: "{date} ਨੂੰ ਦਰਜ" },
  raisedOnBy: { en: "Raised {date} by {name}", hi: "{date} को {name} ने दर्ज की", pa: "{date} ਨੂੰ {name} ਨੇ ਦਰਜ ਕੀਤੀ" },
  voiceNote: { en: "Voice note", hi: "आवाज़ संदेश", pa: "ਆਵਾਜ਼ ਸੁਨੇਹਾ" },
  unresolved: { en: "Unresolved", hi: "बाकी है", pa: "ਬਾਕੀ ਹੈ" },
  resolved: { en: "Resolved", hi: "हल हो गई", pa: "ਹੱਲ ਹੋ ਗਈ" },
  resolvedOn: { en: "Resolved · {date}", hi: "हल हो गई · {date}", pa: "ਹੱਲ ਹੋ ਗਈ · {date}" },
  resolvedBy: { en: "Resolved by {name}", hi: "{name} ने हल की", pa: "{name} ਨੇ ਹੱਲ ਕੀਤੀ" },
  assignee: { en: "Assignee: {name}", hi: "किसके पास: {name}", pa: "ਕਿਸ ਕੋਲ: {name}" },
  assignedTo: { en: "Assigned to {name}", hi: "{name} के पास", pa: "{name} ਕੋਲ" },
  notAssignedYet: { en: "Not assigned yet", hi: "अभी किसी को नहीं दी", pa: "ਹਾਲੇ ਕਿਸੇ ਨੂੰ ਨਹੀਂ ਦਿੱਤੀ" },
  raisedByYou: { en: "raised by you", hi: "आपने दर्ज की", pa: "ਤੁਸੀਂ ਦਰਜ ਕੀਤੀ" },
  handling: { en: "Handling", hi: "काम", pa: "ਕੰਮ" },
  photosVideos: { en: "Photos & videos ({n})", hi: "फ़ोटो और वीडियो ({n})", pa: "ਫ਼ੋਟੋ ਤੇ ਵੀਡੀਓ ({n})" },
  transcriptNotReady: { en: "Transcript not ready yet.", hi: "लिखित संदेश अभी तैयार नहीं।", pa: "ਲਿਖਤੀ ਸੁਨੇਹਾ ਹਾਲੇ ਤਿਆਰ ਨਹੀਂ।" },
  noAddress: { en: "No address on file", hi: "पता दर्ज नहीं", pa: "ਪਤਾ ਦਰਜ ਨਹੀਂ" },
  poc: { en: "POC: {name}", hi: "संपर्क: {name}", pa: "ਸੰਪਰਕ: {name}" },
  couldntLoadComplaint: { en: "Couldn’t load this complaint.", hi: "यह शिकायत लोड नहीं हुई।", pa: "ਇਹ ਸ਼ਿਕਾਇਤ ਲੋਡ ਨਹੀਂ ਹੋਈ।" },
  newComplaint: { en: "New complaint", hi: "नई शिकायत", pa: "ਨਵੀਂ ਸ਼ਿਕਾਇਤ" },
  whichSite: { en: "Which site is this about?", hi: "यह किस साइट के बारे में है?", pa: "ਇਹ ਕਿਸ ਸਾਈਟ ਬਾਰੇ ਹੈ?" },
  addNewSite: { en: "Add new site", hi: "नई साइट जोड़ें", pa: "ਨਵੀਂ ਸਾਈਟ ਜੋੜੋ" },
  // SBM-95 — search existing sites before adding a new one
  findExistingSite: { en: "Site already exists? Search it", hi: "साइट पहले से है? खोजें", pa: "ਸਾਈਟ ਪਹਿਲਾਂ ਤੋਂ ਹੈ? ਲੱਭੋ" },
  phSearchSite: { en: "Name, sector or city", hi: "नाम, सेक्टर या शहर", pa: "ਨਾਮ, ਸੈਕਟਰ ਜਾਂ ਸ਼ਹਿਰ" },
  noSiteMatches: { en: "No matching site — add it below.", hi: "कोई साइट नहीं मिली — नीचे जोड़ें।", pa: "ਕੋਈ ਸਾਈਟ ਨਹੀਂ ਮਿਲੀ — ਹੇਠਾਂ ਜੋੜੋ।" },
  yourSite: { en: "Your site", hi: "आपकी साइट", pa: "ਤੁਹਾਡੀ ਸਾਈਟ" },
  orAddNewSite: { en: "Or add a new site", hi: "या नई साइट जोड़ें", pa: "ਜਾਂ ਨਵੀਂ ਸਾਈਟ ਜੋੜੋ" },
  failedPickSite: { en: "Couldn’t open that site — try again.", hi: "साइट नहीं खुली — फिर कोशिश करें।", pa: "ਸਾਈਟ ਨਹੀਂ ਖੁੱਲ੍ਹੀ — ਦੁਬਾਰਾ ਕੋਸ਼ਿਸ਼ ਕਰੋ।" },
  complaintTitle: { en: "{site} — Complaint", hi: "{site} — शिकायत", pa: "{site} — ਸ਼ਿਕਾਇਤ" },
  recordComplaintHint: {
    en: "Record a voice note describing the complaint. You can add photos or video after.",
    hi: "शिकायत के बारे में आवाज़ संदेश रिकॉर्ड करें। बाद में फ़ोटो या वीडियो जोड़ सकते हैं।",
    pa: "ਸ਼ਿਕਾਇਤ ਬਾਰੇ ਆਵਾਜ਼ ਸੁਨੇਹਾ ਰਿਕਾਰਡ ਕਰੋ। ਬਾਅਦ ਵਿੱਚ ਫ਼ੋਟੋ ਜਾਂ ਵੀਡੀਓ ਜੋੜ ਸਕਦੇ ਹੋ।",
  },
  recordVoiceNote: { en: "Record voice note", hi: "आवाज़ संदेश रिकॉर्ड करें", pa: "ਆਵਾਜ਼ ਸੁਨੇਹਾ ਰਿਕਾਰਡ ਕਰੋ" },
  reRecord: { en: "Re-record", hi: "फिर से रिकॉर्ड करें", pa: "ਫਿਰ ਰਿਕਾਰਡ ਕਰੋ" },
  optionalNote: {
    en: "Optional short note (voice note is the main record)",
    hi: "छोटा नोट (ज़रूरी नहीं — आवाज़ संदेश ही मुख्य है)",
    pa: "ਛੋਟਾ ਨੋਟ (ਜ਼ਰੂਰੀ ਨਹੀਂ — ਆਵਾਜ਼ ਸੁਨੇਹਾ ਹੀ ਮੁੱਖ ਹੈ)",
  },
  addPhoto: { en: "Add photo", hi: "फ़ोटो जोड़ें", pa: "ਫ਼ੋਟੋ ਜੋੜੋ" },
  addVideo: { en: "Add video", hi: "वीडियो जोड़ें", pa: "ਵੀਡੀਓ ਜੋੜੋ" },
  submitComplaint: { en: "Submit complaint", hi: "शिकायत भेजें", pa: "ਸ਼ਿਕਾਇਤ ਭੇਜੋ" },
  submitting: { en: "Submitting…", hi: "भेज रहे हैं…", pa: "ਭੇਜ ਰਹੇ ਹਾਂ…" },
  failedSubmit: { en: "Failed to submit — try again.", hi: "नहीं भेजा गया — फिर कोशिश करें।", pa: "ਨਹੀਂ ਭੇਜਿਆ ਗਿਆ — ਫਿਰ ਕੋਸ਼ਿਸ਼ ਕਰੋ।" },
  remove: { en: "Remove", hi: "हटाएँ", pa: "ਹਟਾਓ" },
  voiceNoteAttached: { en: "Voice note attached", hi: "आवाज़ संदेश जुड़ गया", pa: "ਆਵਾਜ਼ ਸੁਨੇਹਾ ਜੁੜ ਗਿਆ" },
  complaintAt: { en: "Complaint at {site}", hi: "{site} पर शिकायत", pa: "{site} 'ਤੇ ਸ਼ਿਕਾਇਤ" },

  // Voice recording modal
  startRecording: { en: "Start recording", hi: "रिकॉर्डिंग शुरू करें", pa: "ਰਿਕਾਰਡਿੰਗ ਸ਼ੁਰੂ ਕਰੋ" },
  stop: { en: "Stop", hi: "रोकें", pa: "ਰੋਕੋ" },
  discard: { en: "Discard", hi: "हटा दें", pa: "ਹਟਾ ਦਿਓ" },
  recording: { en: "Recording…", hi: "रिकॉर्ड हो रहा है…", pa: "ਰਿਕਾਰਡ ਹੋ ਰਿਹਾ ਹੈ…" },
  micBlocked: {
    en: "Couldn’t use the microphone. Allow microphone access and try again.",
    hi: "माइक्रोफ़ोन नहीं चला। माइक की अनुमति दें और फिर कोशिश करें।",
    pa: "ਮਾਈਕ੍ਰੋਫ਼ੋਨ ਨਹੀਂ ਚੱਲਿਆ। ਮਾਈਕ ਦੀ ਇਜਾਜ਼ਤ ਦਿਓ ਤੇ ਫਿਰ ਕੋਸ਼ਿਸ਼ ਕਰੋ।",
  },

  // Site visit
  siteVisitTitle: { en: "Site visit", hi: "साइट विज़िट", pa: "ਸਾਈਟ ਵਿਜ਼ਿਟ" },
  pickSite: { en: "Which site are you at?", hi: "आप किस साइट पर हैं?", pa: "ਤੁਸੀਂ ਕਿਸ ਸਾਈਟ 'ਤੇ ਹੋ?" },
  searchSites: { en: "Search sites", hi: "साइट खोजें", pa: "ਸਾਈਟ ਲੱਭੋ" },
  noSitesYet: { en: "No sites yet.", hi: "अभी कोई साइट नहीं।", pa: "ਹਾਲੇ ਕੋਈ ਸਾਈਟ ਨਹੀਂ।" },
  noSitesAssigned: { en: "No sites assigned to you yet.", hi: "अभी आपको कोई साइट नहीं दी गई।", pa: "ਹਾਲੇ ਤੁਹਾਨੂੰ ਕੋਈ ਸਾਈਟ ਨਹੀਂ ਦਿੱਤੀ ਗਈ।" },
  whatToReport: { en: "What are you here to report?", hi: "आप क्या बताने आए हैं?", pa: "ਤੁਸੀਂ ਕੀ ਦੱਸਣ ਆਏ ਹੋ?" },
  starting: { en: "Starting…", hi: "शुरू हो रहा है…", pa: "ਸ਼ੁਰੂ ਹੋ ਰਿਹਾ ਹੈ…" },
  couldntStartReport: { en: "Couldn't start that report — try again.", hi: "रिपोर्ट शुरू नहीं हुई — फिर कोशिश करें।", pa: "ਰਿਪੋਰਟ ਸ਼ੁਰੂ ਨਹੀਂ ਹੋਈ — ਫਿਰ ਕੋਸ਼ਿਸ਼ ਕਰੋ।" },
  whatAreYouHereFor: { en: "What are you here for?", hi: "आप किस काम से आए हैं?", pa: "ਤੁਸੀਂ ਕਿਸ ਕੰਮ ਲਈ ਆਏ ਹੋ?" },
  comingSoon: { en: "Coming soon", hi: "जल्द आ रहा है", pa: "ਜਲਦੀ ਆ ਰਿਹਾ ਹੈ" },
  installations: { en: "Installations", hi: "फिटिंग", pa: "ਫਿਟਿੰਗ" },
  newInstallation: { en: "New installation", hi: "नई फिटिंग", pa: "ਨਵੀਂ ਫਿਟਿੰਗ" },
  checklistComplete: { en: "{done} of {total} done", hi: "{total} में से {done} पूरे", pa: "{total} ਵਿੱਚੋਂ {done} ਪੂਰੇ" },
  addVoiceNoteFirst: {
    en: "Add a voice note first, then photos or video.",
    hi: "पहले आवाज़ संदेश जोड़ें, फिर फ़ोटो या वीडियो।",
    pa: "ਪਹਿਲਾਂ ਆਵਾਜ਼ ਸੁਨੇਹਾ ਜੋੜੋ, ਫਿਰ ਫ਼ੋਟੋ ਜਾਂ ਵੀਡੀਓ।",
  },
  complete: { en: "Complete", hi: "पूरा", pa: "ਪੂਰਾ" },
  notStarted: { en: "Not started", hi: "शुरू नहीं हुआ", pa: "ਸ਼ੁਰੂ ਨਹੀਂ ਹੋਇਆ" },
  inProgress: { en: "In progress", hi: "चल रहा है", pa: "ਚੱਲ ਰਿਹਾ ਹੈ" },
  home: { en: "Home", hi: "होम", pa: "ਹੋਮ" },
  section: { en: "Section", hi: "हिस्सा", pa: "ਹਿੱਸਾ" },
  status: { en: "Status", hi: "स्थिति", pa: "ਸਥਿਤੀ" },
  addVoiceNote: { en: "Add voice note", hi: "आवाज़ संदेश जोड़ें", pa: "ਆਵਾਜ਼ ਸੁਨੇਹਾ ਜੋੜੋ" },
  voiceNoteRecorded: { en: "Voice note recorded", hi: "आवाज़ संदेश रिकॉर्ड हो गया", pa: "ਆਵਾਜ਼ ਸੁਨੇਹਾ ਰਿਕਾਰਡ ਹੋ ਗਿਆ" },
  logAnotherUpdate: { en: "Log another update →", hi: "एक और अपडेट डालें →", pa: "ਇੱਕ ਹੋਰ ਅਪਡੇਟ ਪਾਓ →" },
  loadingTimeline: { en: "Loading timeline…", hi: "इतिहास लोड हो रहा है…", pa: "ਇਤਿਹਾਸ ਲੋਡ ਹੋ ਰਿਹਾ ਹੈ…" },
  nothingLoggedHere: { en: "Nothing logged in this section yet.", hi: "इस हिस्से में अभी कुछ नहीं डाला गया।", pa: "ਇਸ ਹਿੱਸੇ ਵਿੱਚ ਹਾਲੇ ਕੁਝ ਨਹੀਂ ਪਾਇਆ ਗਿਆ।" },

  // Site page (staff view)
  missedClosure: {
    en: "You've missed the target closure date by {n} day(s).",
    hi: "काम पूरा करने की तारीख {n} दिन पहले निकल गई।",
    pa: "ਕੰਮ ਪੂਰਾ ਕਰਨ ਦੀ ਤਾਰੀਖ਼ {n} ਦਿਨ ਪਹਿਲਾਂ ਲੰਘ ਗਈ।",
  },
  voiceSavedAssigned: {
    en: "Voice note saved and assigned to {n} person(s).",
    hi: "आवाज़ संदेश सेव हुआ और {n} लोगों को दिया गया।",
    pa: "ਆਵਾਜ਼ ਸੁਨੇਹਾ ਸੇਵ ਹੋਇਆ ਤੇ {n} ਲੋਕਾਂ ਨੂੰ ਦਿੱਤਾ ਗਿਆ।",
  },
  voiceSavedNobody: {
    en: "Voice note saved. No one is assigned to this site yet, so it wasn't given to anyone.",
    hi: "आवाज़ संदेश सेव हुआ। इस साइट पर अभी कोई नहीं है, इसलिए किसी को नहीं दिया गया।",
    pa: "ਆਵਾਜ਼ ਸੁਨੇਹਾ ਸੇਵ ਹੋਇਆ। ਇਸ ਸਾਈਟ 'ਤੇ ਹਾਲੇ ਕੋਈ ਨਹੀਂ, ਇਸ ਲਈ ਕਿਸੇ ਨੂੰ ਨਹੀਂ ਦਿੱਤਾ ਗਿਆ।",
  },
  siteDetails: { en: "Site details", hi: "साइट की जानकारी", pa: "ਸਾਈਟ ਦੀ ਜਾਣਕਾਰੀ" },
  noAddressDot: { en: "No address on file.", hi: "पता दर्ज नहीं।", pa: "ਪਤਾ ਦਰਜ ਨਹੀਂ।" },
  pointOfContact: { en: "Point of contact: {name}", hi: "संपर्क व्यक्ति: {name}", pa: "ਸੰਪਰਕ ਵਿਅਕਤੀ: {name}" },
  assignedBy: { en: "Assigned to {name}", hi: "{name} को दिया", pa: "{name} ਨੂੰ ਦਿੱਤਾ" },
  referredBy: { en: "Referred by {name}", hi: "{name} के ज़रिए", pa: "{name} ਰਾਹੀਂ" },
  targetClosure: { en: "Target closure date: {date}", hi: "काम पूरा करने की तारीख: {date}", pa: "ਕੰਮ ਪੂਰਾ ਕਰਨ ਦੀ ਤਾਰੀਖ਼: {date}" },
  missedByDays: { en: " — missed by {n}d", hi: " — {n} दिन देर", pa: " — {n} ਦਿਨ ਦੇਰੀ" },
  noTargetClosure: { en: "No target closure date set.", hi: "पूरा करने की तारीख तय नहीं।", pa: "ਪੂਰਾ ਕਰਨ ਦੀ ਤਾਰੀਖ਼ ਤੈਅ ਨਹੀਂ।" },
  team: { en: "Team", hi: "टीम", pa: "ਟੀਮ" },
  noOneAssigned: { en: "No one assigned yet.", hi: "अभी किसी को नहीं दिया।", pa: "ਹਾਲੇ ਕਿਸੇ ਨੂੰ ਨਹੀਂ ਦਿੱਤਾ।" },
  contacts: { en: "Contacts", hi: "संपर्क", pa: "ਸੰਪਰਕ" },
  timeline: { en: "Timeline", hi: "इतिहास", pa: "ਇਤਿਹਾਸ" },
  nothingRecordedSite: { en: "Nothing recorded for this site yet.", hi: "इस साइट के लिए अभी कुछ दर्ज नहीं।", pa: "ਇਸ ਸਾਈਟ ਲਈ ਹਾਲੇ ਕੁਝ ਦਰਜ ਨਹੀਂ।" },
  yourTasksHere: { en: "Your tasks here", hi: "यहाँ आपके काम", pa: "ਇੱਥੇ ਤੁਹਾਡੇ ਕੰਮ" },
  dueDate: { en: "Due {date}", hi: "{date} तक", pa: "{date} ਤੱਕ" },
  markDone: { en: "Mark done", hi: "हो गया", pa: "ਹੋ ਗਿਆ" },
  confirmMarkDone: { en: "Mark this done?", hi: "क्या यह काम हो गया?", pa: "ਕੀ ਇਹ ਕੰਮ ਹੋ ਗਿਆ?" },
  yesDone: { en: "Yes, done", hi: "हाँ, हो गया", pa: "ਹਾਂ, ਹੋ ਗਿਆ" },
  handOffNext: { en: "{stage} — done. Hand off the next stage?", hi: "{stage} — हो गया। अगला काम किसी को दें?", pa: "{stage} — ਹੋ ਗਿਆ। ਅਗਲਾ ਕੰਮ ਕਿਸੇ ਨੂੰ ਦੇਣਾ?" },
  chooseStaff: { en: "Choose a staff member…", hi: "किसे दें चुनें…", pa: "ਕਿਸਨੂੰ ਦੇਣਾ ਚੁਣੋ…" },
  skip: { en: "Skip", hi: "छोड़ें", pa: "ਛੱਡੋ" },
  assign: { en: "Assign", hi: "दें", pa: "ਦਿਓ" },
  assigning: { en: "Assigning…", hi: "दे रहे हैं…", pa: "ਦੇ ਰਹੇ ਹਾਂ…" },

  // Add new site
  fieldHouseNo: { en: "H.No", hi: "मकान नं.", pa: "ਮਕਾਨ ਨੰ." },
  phHouseNo: { en: "House / plot number", hi: "मकान / प्लॉट नंबर", pa: "ਮਕਾਨ / ਪਲਾਟ ਨੰਬਰ" },
  fieldSector: { en: "Sector", hi: "सेक्टर", pa: "ਸੈਕਟਰ" },
  phSector: { en: "Sector or locality", hi: "सेक्टर या मोहल्ला", pa: "ਸੈਕਟਰ ਜਾਂ ਮੁਹੱਲਾ" },
  fieldCity: { en: "City", hi: "शहर", pa: "ਸ਼ਹਿਰ" },
  fieldContactPerson: { en: "Contact person", hi: "संपर्क व्यक्ति", pa: "ਸੰਪਰਕ ਵਿਅਕਤੀ" },
  phName: { en: "Name", hi: "नाम", pa: "ਨਾਮ" },
  fieldContactNumber: { en: "Contact number", hi: "फ़ोन नंबर", pa: "ਫ਼ੋਨ ਨੰਬਰ" },
  phPhone: { en: "Phone number", hi: "फ़ोन नंबर", pa: "ਫ਼ੋਨ ਨੰਬਰ" },
  fieldAssignedBy: { en: "Assigned to", hi: "किसे दिया", pa: "ਕਿਸਨੂੰ ਦਿੱਤਾ" },
  phAssignedBy: { en: "Assigned to", hi: "किसे दिया", pa: "ਕਿਸਨੂੰ ਦਿੱਤਾ" },
  fieldReferredBy: { en: "Referred by", hi: "किसके ज़रिए", pa: "ਕਿਸ ਰਾਹੀਂ" },
  phReferredBy: { en: "Referral source", hi: "किसने भेजा", pa: "ਕਿਸਨੇ ਭੇਜਿਆ" },
  chooseContact: { en: "Choose contact", hi: "संपर्क चुनें", pa: "ਸੰਪਰਕ ਚੁਣੋ" },
  clearContact: { en: "Clear", hi: "हटाएँ", pa: "ਹਟਾਓ" },
  contactNotLinked: { en: "not a directory contact — choose one", hi: "डायरेक्टरी संपर्क नहीं — एक चुनें", pa: "ਡਾਇਰੈਕਟਰੀ ਸੰਪਰਕ ਨਹੀਂ — ਇੱਕ ਚੁਣੋ" },
  fieldLocation: { en: "Location", hi: "लोकेशन", pa: "ਲੋਕੇਸ਼ਨ" },
  sitePhotos: { en: "Site photos", hi: "साइट की फ़ोटो", pa: "ਸਾਈਟ ਦੀਆਂ ਫ਼ੋਟੋਆਂ" },
  siteVoiceNotes: { en: "Site voice notes", hi: "साइट वॉइस नोट", pa: "ਸਾਈਟ ਵੌਇਸ ਨੋਟ" },
  siteLocation: { en: "Site location", hi: "साइट लोकेशन", pa: "ਸਾਈਟ ਲੋਕੇਸ਼ਨ" },
  uploadMeasurements: { en: "Upload measurements", hi: "नाप अपलोड करें", pa: "ਨਾਪ ਅਪਲੋਡ ਕਰੋ" },
  saveSite: { en: "Save site", hi: "साइट सेव करें", pa: "ਸਾਈਟ ਸੇਵ ਕਰੋ" },
  siteSavedAs: { en: "Site saved as {name}. Add photos or notes above, then tap Done.", hi: "साइट {name} नाम से सेव हुई। ऊपर फ़ोटो या नोट जोड़ें, फिर 'हो गया' दबाएँ।", pa: "ਸਾਈਟ {name} ਨਾਮ ਨਾਲ ਸੇਵ ਹੋਈ। ਉੱਪਰ ਫ਼ੋਟੋ ਜਾਂ ਨੋਟ ਜੋੜੋ, ਫਿਰ 'ਹੋ ਗਿਆ' ਦਬਾਓ।" },
  enterAddressPart: { en: "Enter at least H.No, sector, or city.", hi: "कम से कम मकान नं., सेक्टर या शहर लिखें।", pa: "ਘੱਟੋ-ਘੱਟ ਮਕਾਨ ਨੰ., ਸੈਕਟਰ ਜਾਂ ਸ਼ਹਿਰ ਲਿਖੋ।" },
  failedCreateSite: { en: "Failed to create site — try again.", hi: "साइट नहीं बनी — फिर से कोशिश करें।", pa: "ਸਾਈਟ ਨਹੀਂ ਬਣੀ — ਫਿਰ ਕੋਸ਼ਿਸ਼ ਕਰੋ।" },
  locationUnsupported: { en: "Location not supported on this device.", hi: "इस फ़ोन पर लोकेशन नहीं मिलती।", pa: "ਇਸ ਫ਼ੋਨ 'ਤੇ ਲੋਕੇਸ਼ਨ ਨਹੀਂ ਮਿਲਦੀ।" },
  gettingLocation: { en: "Getting location…", hi: "लोकेशन ले रहे हैं…", pa: "ਲੋਕੇਸ਼ਨ ਲੈ ਰਹੇ ਹਾਂ…" },
  locationCaptured: { en: "Location captured.", hi: "लोकेशन मिल गई।", pa: "ਲੋਕੇਸ਼ਨ ਮਿਲ ਗਈ।" },
  locationFailed: { en: "Could not get location — check permissions.", hi: "लोकेशन नहीं मिली — परमिशन देखें।", pa: "ਲੋਕੇਸ਼ਨ ਨਹੀਂ ਮਿਲੀ — ਪਰਮਿਸ਼ਨ ਵੇਖੋ।" },
  photoUploadFailed: { en: "Photo upload failed.", hi: "फ़ोटो अपलोड नहीं हुई।", pa: "ਫ਼ੋਟੋ ਅਪਲੋਡ ਨਹੀਂ ਹੋਈ।" },
  measurementUploadFailed: { en: "Measurement upload failed.", hi: "नाप अपलोड नहीं हुआ।", pa: "ਨਾਪ ਅਪਲੋਡ ਨਹੀਂ ਹੋਇਆ।" },
  voiceUploadFailed: { en: "Voice note upload failed.", hi: "वॉइस नोट अपलोड नहीं हुआ।", pa: "ਵੌਇਸ ਨੋਟ ਅਪਲੋਡ ਨਹੀਂ ਹੋਇਆ।" },

  // Account menu
  logOut: { en: "Log out", hi: "लॉग आउट", pa: "ਲੌਗ ਆਊਟ" },
  resetPin: { en: "Reset PIN", hi: "पिन बदलें", pa: "ਪਿੰਨ ਬਦਲੋ" },
  updatePhone: { en: "Update phone", hi: "फ़ोन नंबर बदलें", pa: "ਫ਼ੋਨ ਨੰਬਰ ਬਦਲੋ" },
  requestOrReport: { en: "Request / report an issue", hi: "कोई माँग या समस्या बताएँ", pa: "ਕੋਈ ਮੰਗ ਜਾਂ ਸਮੱਸਿਆ ਦੱਸੋ" },

  // Admin: language picker on a staff member's tab
  displayLanguage: { en: "Display language", hi: "भाषा", pa: "ਭਾਸ਼ਾ" },
};
