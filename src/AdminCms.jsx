import { useEffect, useState } from "react";
import Icon from "./Icon";
import { CMS_COLLECTIONS, deleteItem, isClosureActive, saveItem, todayKey, watchCollection } from "./cms";
import { MAP_AREAS, mapAreaLabel } from "./floorPlans";
import { emailConfigured, emailSubscribers } from "./notify";
import AdminFloorPlan from "./AdminFloorPlan";

const FLOOR_PLAN_TAB = "floorplan";

// Each section describes one Firestore collection: its form fields and how a saved
// item is summarised in the list. Field names must match firestore.rules.
const SECTIONS = [
  {
    key: "announcements",
    collection: CMS_COLLECTIONS.announcements,
    label: "Announcements",
    singular: "announcement",
    fields: [
      { name: "title", label: "Title", type: "text", required: true, max: 120 },
      { name: "body", label: "Message", type: "textarea", required: true, max: 2000 },
      { name: "expiresOn", label: "Hide after (optional)", type: "date" },
      { name: "pinned", label: "Pin to the top", type: "checkbox" },
      { name: "published", label: "Published (visible to everyone)", type: "checkbox", initial: true },
    ],
    title: (item) => item.title,
    meta: (item) => [item.pinned && "Pinned", item.expiresOn && `Until ${item.expiresOn}`].filter(Boolean).join(" · ") || "No end date",
    badge: (item) => item.published ? (item.expiresOn && item.expiresOn < todayKey() ? ["Expired", "muted"] : ["Published", "good"]) : ["Draft", "muted"],
    // Email subscribers when an announcement is published for the first time.
    emailLabel: "Email subscribers when this is published",
    email: (item, previous) => item.published && !previous?.published ? {
      subject: `New announcement: ${item.title}`,
      message: `${item.body}${item.expiresOn ? `\n\nShown until ${item.expiresOn}.` : ""}`,
    } : null,
  },
  {
    key: "closures",
    collection: CMS_COLLECTIONS.closures,
    label: "Pathway restrictions",
    singular: "restriction",
    fields: [
      { name: "pathway", label: "Pathway or hallway", type: "text", required: true, max: 100, placeholder: "e.g. East hallway near Room 204" },
      { name: "building", label: "Building", type: "text", required: true, max: 80, placeholder: "e.g. Main Academic Building" },
      { name: "floor", label: "Floor", type: "number", required: true, min: 0, maxValue: 20 },
      { name: "reason", label: "Reason", type: "select", required: true, options: ["Maintenance", "Cleaning", "Construction", "Safety hazard", "School event", "Other"] },
      { name: "mapArea", label: "Block on the 2D floor plan (optional)", type: "select", options: MAP_AREAS, hint: "Routes on the floor plan will avoid this hallway or staircase while the restriction is in effect." },
      { name: "detour", label: "Detour / alternate route (optional)", type: "text", max: 160, placeholder: "e.g. Use the west stairwell" },
      { name: "details", label: "Details (optional)", type: "textarea", max: 500 },
      { name: "startDate", label: "Closed from", type: "date", required: true, initial: () => todayKey() },
      { name: "endDate", label: "Reopens after (optional)", type: "date" },
      { name: "active", label: "Restriction is in effect", type: "checkbox", initial: true },
    ],
    title: (item) => item.pathway,
    meta: (item) => `${item.building} · Floor ${item.floor} · ${item.reason}${item.endDate ? ` · until ${item.endDate}` : ""}${item.mapArea ? ` · map: ${mapAreaLabel(item.mapArea)}` : ""}`,
    badge: (item) => isClosureActive(item) ? ["Closed now", "bad"] : item.active && item.startDate > todayKey() ? ["Scheduled", "warn"] : ["Open", "good"],
    // Email subscribers when a restriction is switched on.
    emailLabel: "Email subscribers about this closure",
    email: (item, previous) => item.active && !previous?.active ? {
      subject: `Hallway closed: ${item.pathway}`,
      message: `${item.pathway} (${item.building}, floor ${item.floor}) is closed for ${item.reason.toLowerCase()} from ${item.startDate}${item.endDate ? ` until ${item.endDate}` : ""}.${item.detour ? ` Detour: ${item.detour}.` : ""}${item.details ? `\n\n${item.details}` : ""}`,
    } : null,
  },
  {
    key: "rooms",
    collection: CMS_COLLECTIONS.rooms,
    label: "Rooms",
    singular: "room",
    fields: [
      { name: "name", label: "Room name or number", type: "text", required: true, max: 80, placeholder: "e.g. Room 204" },
      { name: "building", label: "Building", type: "text", required: true, max: 80 },
      { name: "floor", label: "Floor", type: "number", required: true, min: 0, maxValue: 20 },
      { name: "type", label: "Room type", type: "select", required: true, options: ["Classroom", "Laboratory", "Library", "Clinic", "Restroom", "Faculty room", "Facility", "Other"] },
      { name: "capacity", label: "Capacity (optional)", type: "number", min: 0, maxValue: 5000 },
      { name: "status", label: "Status", type: "select", required: true, options: ["Available", "In use", "Under maintenance", "Closed"] },
      { name: "notes", label: "Notes (optional)", type: "textarea", max: 500 },
    ],
    title: (item) => item.name,
    meta: (item) => `${item.type} · ${item.building} · Floor ${item.floor}${item.capacity ? ` · ${item.capacity} seats` : ""}`,
    badge: (item) => [item.status, item.status === "Available" ? "good" : item.status === "In use" ? "warn" : "bad"],
  },
  {
    key: "offices",
    collection: CMS_COLLECTIONS.offices,
    label: "Offices",
    singular: "office",
    fields: [
      { name: "name", label: "Office name", type: "text", required: true, max: 80, placeholder: "e.g. Registrar's Office" },
      { name: "building", label: "Building", type: "text", required: true, max: 80 },
      { name: "floor", label: "Floor", type: "number", required: true, min: 0, maxValue: 20 },
      { name: "room", label: "Room (optional)", type: "text", max: 40 },
      { name: "hours", label: "Office hours (optional)", type: "text", max: 120, placeholder: "e.g. Mon–Fri, 7:00 AM–5:00 PM" },
      { name: "contact", label: "Contact (optional)", type: "text", max: 120, placeholder: "Phone number or email" },
      { name: "description", label: "Services offered (optional)", type: "textarea", max: 500 },
    ],
    title: (item) => item.name,
    meta: (item) => [`${item.building} · Floor ${item.floor}`, item.room, item.hours].filter(Boolean).join(" · "),
    badge: () => null,
  },
];

const emptyValues = (section) => Object.fromEntries(section.fields.map((field) => {
  const initial = typeof field.initial === "function" ? field.initial() : field.initial;
  return [field.name, field.type === "checkbox" ? Boolean(initial) : initial ?? ""];
}));

const valuesFromItem = (section, item) => Object.fromEntries(section.fields.map((field) => [
  field.name,
  field.type === "checkbox" ? Boolean(item[field.name]) : item[field.name] ?? "",
]));

// Turns form strings into the stored types (numbers, booleans, trimmed text).
function toRecord(section, values) {
  const record = {};
  for (const field of section.fields) {
    const raw = values[field.name];
    if (field.type === "checkbox") record[field.name] = Boolean(raw);
    else if (field.type === "number") record[field.name] = raw === "" || raw === null ? null : Number.parseInt(raw, 10);
    else record[field.name] = String(raw ?? "").trim();
  }
  return record;
}

function validate(section, record) {
  for (const field of section.fields) {
    const value = record[field.name];
    if (field.required && (value === "" || value === null || Number.isNaN(value))) return `${field.label} is required.`;
    if (field.type === "number" && value !== null && (Number.isNaN(value) || value < (field.min ?? 0) || value > (field.maxValue ?? 100000))) {
      return `${field.label} must be a whole number between ${field.min ?? 0} and ${field.maxValue ?? 100000}.`;
    }
  }
  if (record.startDate && record.endDate && record.endDate < record.startDate) return "The reopening date must be on or after the closing date.";
  return "";
}

const friendlyError = (error) => error?.code === "permission-denied"
  ? "Permission denied. Only accounts with the administrator role can change campus content."
  : error?.message || "Something went wrong. Please try again.";

export default function AdminCms({ onClose, onOpenAnalytics, onOpenSignIns }) {
  const [activeKey, setActiveKey] = useState(SECTIONS[0].key);
  const [data, setData] = useState({});
  const [loadError, setLoadError] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [values, setValues] = useState(() => emptyValues(SECTIONS[0]));
  const [formError, setFormError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [sendEmail, setSendEmail] = useState(true);
  const section = SECTIONS.find((item) => item.key === activeKey) || SECTIONS[0];
  const items = data[activeKey] || [];

  useEffect(() => {
    const stops = SECTIONS.map((item) => watchCollection(
      item.collection,
      (rows) => setData((current) => ({ ...current, [item.key]: rows })),
      (error) => setLoadError(friendlyError(error)),
    ));
    return () => stops.forEach((stop) => stop());
  }, []);

  useEffect(() => {
    const onKeyDown = (event) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const resetForm = (target = section) => {
    setEditingId(null);
    setValues(emptyValues(target));
    setFormError("");
  };

  const switchSection = (key) => {
    const next = SECTIONS.find((item) => item.key === key);
    setActiveKey(key);
    setNotice("");
    if (next) resetForm(next);
  };

  const startEdit = (item) => {
    setEditingId(item.id);
    setValues(valuesFromItem(section, item));
    setFormError("");
    setNotice("");
  };

  const submit = async (event) => {
    event.preventDefault();
    const record = toRecord(section, values);
    const problem = validate(section, record);
    if (problem) {
      setFormError(problem);
      return;
    }
    setSaving(true);
    setFormError("");
    const previous = editingId ? items.find((item) => item.id === editingId) : null;
    const mail = sendEmail ? section.email?.(record, previous) : null;
    try {
      await saveItem(section.collection, editingId, record);
      const saved = `${section.title(record)} was ${editingId ? "updated" : "added"}. The change is live on the portal.`;
      resetForm();
      if (!mail) {
        setNotice(saved);
      } else if (!emailConfigured) {
        setNotice(`${saved} No email was sent because the email service isn't set up yet (see src/notify.js).`);
      } else {
        setNotice(`${saved} Sending email updates…`);
        const result = await emailSubscribers(mail);
        setNotice(result.total === 0
          ? `${saved} No one has turned on email updates yet, so no email was sent.`
          : `${saved} Email sent to ${result.sent} of ${result.total} subscriber${result.total === 1 ? "" : "s"}${result.failed ? ` (${result.failed} failed)` : ""}.`);
      }
    } catch (error) {
      setFormError(friendlyError(error));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (item) => {
    if (!window.confirm(`Delete "${section.title(item)}"? This cannot be undone.`)) return;
    try {
      await deleteItem(section.collection, item.id);
      if (editingId === item.id) resetForm();
      setNotice(`${section.title(item)} was deleted.`);
    } catch (error) {
      setNotice("");
      setFormError(friendlyError(error));
    }
  };

  const updateValue = (field, value) => setValues((current) => ({ ...current, [field.name]: value }));

  return (
    <div className="admin-shell" role="dialog" aria-modal="true" aria-labelledby="cms-title">
      <div className="admin-dashboard cms-dashboard">
        <header className="admin-dashboard-header">
          <div><p className="kicker">SSCAI ADMINISTRATION</p><h2 id="cms-title">Content manager</h2><p>Update announcements, pathway restrictions, rooms, offices, and the names on the floor plan. Changes go live on the portal right away.</p></div>
          <div className="admin-header-actions">
            {onOpenAnalytics && <button onClick={onOpenAnalytics}>Site visits</button>}
            {onOpenSignIns && <button onClick={onOpenSignIns}>Sign-ins</button>}
            <button className="admin-close" onClick={onClose} aria-label="Close content manager"><Icon name="close" /></button>
          </div>
        </header>
        <div className="cms-tabs" role="tablist" aria-label="Content type">
          {SECTIONS.map((item) => <button key={item.key} type="button" role="tab" aria-selected={activeKey === item.key} className={activeKey === item.key ? "active" : ""} onClick={() => switchSection(item.key)}>{item.label}<span>{data[item.key]?.length ?? "–"}</span></button>)}
          <button type="button" role="tab" aria-selected={activeKey === FLOOR_PLAN_TAB} className={activeKey === FLOOR_PLAN_TAB ? "active" : ""} onClick={() => switchSection(FLOOR_PLAN_TAB)}>Floor plan</button>
        </div>
        {loadError && <p className="auth-error" role="alert">{loadError}</p>}
        {activeKey === FLOOR_PLAN_TAB ? <AdminFloorPlan /> : <div className="cms-grid">
          <form className="cms-form" onSubmit={submit} noValidate>
            <div className="section-title-row"><div><p className="kicker">{editingId ? "EDITING" : "NEW ENTRY"}</p><h3>{editingId ? `Edit ${section.singular}` : `Add ${section.singular}`}</h3></div>{editingId && <button type="button" className="cms-link-button" onClick={() => resetForm()}>Cancel edit</button>}</div>
            {section.fields.map((field) => field.type === "checkbox"
              ? <label key={field.name} className="cms-check"><input type="checkbox" checked={values[field.name]} onChange={(event) => updateValue(field, event.target.checked)} />{field.label}</label>
              : <label key={field.name}>{field.label}
                {field.type === "textarea"
                  ? <textarea rows={4} value={values[field.name]} onChange={(event) => updateValue(field, event.target.value)} maxLength={field.max} required={field.required} />
                  : field.type === "select"
                    ? <select value={values[field.name]} onChange={(event) => updateValue(field, event.target.value)} required={field.required}><option value="">{field.required ? "Choose…" : "None"}</option>{field.options.map((option) => typeof option === "string" ? <option key={option}>{option}</option> : <option key={option.value} value={option.value}>{option.label}</option>)}</select>
                    : <input type={field.type} value={values[field.name]} onChange={(event) => updateValue(field, event.target.value)} maxLength={field.max} min={field.min} max={field.maxValue} placeholder={field.placeholder} required={field.required} />}
                {field.hint && <small className="cms-hint">{field.hint}</small>}
              </label>)}
            {formError && <p className="auth-error" role="alert">{formError}</p>}
            {section.email && <label className="cms-check cms-email-check"><input type="checkbox" checked={sendEmail} onChange={(event) => setSendEmail(event.target.checked)} />{section.emailLabel}</label>}
            {notice && <p className="auth-success" role="status">{notice}</p>}
            <button className="attendance-save" type="submit" disabled={saving}><Icon name={editingId ? "arrow" : "plus"} size={16} /> {saving ? "Saving…" : editingId ? "Save changes" : `Add ${section.singular}`}</button>
          </form>
          <section className="cms-list" aria-label={`Saved ${section.label.toLowerCase()}`}>
            <div className="section-title-row"><div><p className="kicker">LIVE ON THE PORTAL</p><h3>{section.label}</h3></div><span className="record-count">{items.length} saved</span></div>
            {items.length ? items.map((item) => {
              const badge = section.badge(item);
              return <article key={item.id} className={`cms-item ${editingId === item.id ? "editing" : ""}`}>
                <div><b>{section.title(item)}</b><small>{section.meta(item)}</small>{item.updatedBy && <small className="cms-updated">Last edited by {item.updatedBy}{item.updatedAt?.toDate ? ` · ${item.updatedAt.toDate().toLocaleString()}` : ""}</small>}</div>
                {badge && <span className={`cms-badge ${badge[1]}`}>{badge[0]}</span>}
                <div className="cms-item-actions"><button type="button" onClick={() => startEdit(item)}>Edit</button><button type="button" className="danger" onClick={() => remove(item)}>Delete</button></div>
              </article>;
            }) : <p className="empty-attendance">No {section.label.toLowerCase()} yet. Add the first one with the form.</p>}
          </section>
        </div>}
      </div>
    </div>
  );
}
