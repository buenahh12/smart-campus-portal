import { useState } from "react";
import AdminBlueprint from "./AdminBlueprint";
import Icon from "./Icon";
import { CMS_COLLECTIONS, deleteItem, setItem } from "./cms";
import { EDITABLE_TYPES, FLOORS, floorLabel, isEditableSpot, mapRoomDocId, placeTitle } from "./floorPlans";
import { usePlanVersion } from "./usePlan";
import "./adminplan.css";

// Content manager tab: pick a room on the 2D floor plan and change what it is called and
// used for. Saved to mapRooms/<floor>-<room id>; the public map updates right away.

const typeLabel = (value) => EDITABLE_TYPES.find((type) => type.value === value)?.label || value;

const formFor = (item) => ({ name: item.unlabeled ? "" : item.name, code: item.code === "EXIT" ? "" : item.code || "", type: item.type, notes: item.notes || "" });

// Two jobs share the Floor plan tab: renaming rooms that are already mapped, and adding new
// floors or buildings from a contractor's blueprint.
export default function AdminFloorPlan() {
  const [mode, setMode] = useState("rename");
  return <>
    <div className="va-segment fp-mode" role="tablist" aria-label="Floor plan tools">
      <button type="button" role="tab" aria-selected={mode === "rename"} className={mode === "rename" ? "active" : ""} onClick={() => setMode("rename")}>Rename rooms</button>
      <button type="button" role="tab" aria-selected={mode === "add"} className={mode === "add" ? "active" : ""} onClick={() => setMode("add")}>Add floors from blueprints</button>
    </div>
    {mode === "rename" ? <RenameRooms /> : <AdminBlueprint />}
  </>;
}

function RenameRooms() {
  usePlanVersion();
  const [floor, setFloor] = useState(1);
  const [selectedId, setSelectedId] = useState(null);
  const [values, setValues] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const plan = FLOORS.find((item) => item.floor === floor);
  const spots = plan.rooms.filter(isEditableSpot);
  const selected = spots.find((item) => item.id === selectedId) || null;
  const editedCount = FLOORS.reduce((sum, item) => sum + item.rooms.filter((room) => room.edited).length, 0);

  const select = (item) => {
    setSelectedId(item.id);
    setValues(formFor(item));
    setError("");
    setNotice("");
  };

  const changeFloor = (next) => {
    setFloor(next);
    setSelectedId(null);
    setValues(null);
    setError("");
  };

  const save = async (event) => {
    event.preventDefault();
    const record = { name: values.name.trim(), code: values.code.trim(), type: values.type, notes: values.notes.trim() };
    if (!record.name) {
      setError("Give the room a name, for example \"Grade 1 Pearl\" or \"Registrar's Office\".");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await setItem(CMS_COLLECTIONS.mapRooms, mapRoomDocId(`${floor}:${selected.id}`), record);
      setNotice(`${record.code ? `${record.code} · ` : ""}${record.name} is saved. The floor plan, search, and SiBot use the new name now.`);
    } catch (problem) {
      setError(problem?.code === "permission-denied" ? "Permission denied. Only the administrator can change the floor plan." : problem?.message || "The room could not be saved. Try again.");
    } finally {
      setSaving(false);
    }
  };

  const restore = async () => {
    if (!window.confirm(`Change this room back to its original name, "${selected.base.unlabeled ? "Unlabeled room" : selected.base.name}"?`)) return;
    setSaving(true);
    setError("");
    try {
      await deleteItem(CMS_COLLECTIONS.mapRooms, mapRoomDocId(`${floor}:${selected.id}`));
      setValues(formFor({ ...selected.base, notes: "" }));
      setNotice("The original name is back.");
    } catch (problem) {
      setError(problem?.message || "The room could not be restored. Try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fp-admin">
      <div className="fp-admin-plan">
        <div className="fp-admin-head">
          <div className="va-segment" role="tablist" aria-label="Floor">
            {FLOORS.map((item) => <button key={item.floor} type="button" role="tab" aria-selected={floor === item.floor} className={floor === item.floor ? "active" : ""} onClick={() => changeFloor(item.floor)}>{floorLabel(item.floor)}</button>)}
          </div>
          <small>{editedCount} {editedCount === 1 ? "room" : "rooms"} renamed so far</small>
        </div>
        <svg className="fp-admin-svg" viewBox="-2 -2 164 104" role="group" aria-label={`${floorLabel(floor)} plan. Choose a room to edit it.`}>
          <rect x="0" y="0" width="160" height="100" className="mp-floor" />
          {plan.rooms.map((item) => {
            const [x, y, w, h] = item.rect;
            const editable = isEditableSpot(item);
            const label = item.unlabeled ? "?" : item.code && item.code !== "EXIT" ? item.code.replace("Room ", "") : item.name;
            const fits = w >= 9 && h >= 6;
            return <g
              key={item.id}
              className={["fp-spot", editable ? "editable" : `mp-${item.type}`, item.unlabeled && "unlabeled", item.edited && "edited", selectedId === item.id && "selected"].filter(Boolean).join(" ")}
              {...(editable ? { role: "button", tabIndex: 0, "aria-label": `${placeTitle(item)}${item.unlabeled ? ", no name yet" : ""}`, onClick: () => select(item), onKeyDown: (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); select(item); } } } : {})}
            >
              <title>{item.unlabeled ? "Unlabeled room" : placeTitle(item)}</title>
              <rect x={x} y={y} width={w} height={h} className="mp-room" />
              {editable && fits && <text x={x + w / 2} y={y + h / 2} className="fp-spot-label">{label.length > w / 2.2 ? `${label.slice(0, Math.max(3, Math.floor(w / 2.2) - 1))}…` : label}</text>}
            </g>;
          })}
          <rect x="0" y="0" width="160" height="100" className="mp-outline" />
        </svg>
        <p className="fp-admin-legend"><span className="fp-key edited" /> Renamed by staff <span className="fp-key unlabeled" /> No name yet <span className="fp-key" /> Original name</p>
        <div className="fp-admin-list" aria-label={`Rooms on the ${floorLabel(floor).toLowerCase()}`}>
          {spots.map((item) => <button key={item.id} type="button" className={selectedId === item.id ? "active" : ""} onClick={() => select(item)}>
            <span>{item.unlabeled ? <em>Unlabeled room</em> : placeTitle(item)}</span>
            {item.edited && <span className="cms-badge good">Renamed</span>}
          </button>)}
        </div>
      </div>

      <form className="cms-form fp-admin-form" onSubmit={save} noValidate>
        {!selected ? <div className="fp-admin-empty">
          <Icon name="location" size={28} />
          <h3>Choose a room</h3>
          <p>Tap a room on the plan or in the list to change its name, room number, or what it&apos;s used for. Hallways, stairs, and exits stay as they are.</p>
        </div> : <>
          <div className="section-title-row"><div><p className="kicker">{floorLabel(floor).toUpperCase()}</p><h3>Edit room</h3></div></div>
          <p className="cms-hint">Original name: {selected.base.unlabeled ? "none posted yet" : `${selected.base.code ? `${selected.base.code} · ` : ""}${selected.base.name}`}</p>
          <label>Room name<input value={values.name} maxLength={50} onChange={(event) => setValues({ ...values, name: event.target.value })} placeholder="e.g. Grade 1 Pearl" required /></label>
          <label>Room number (optional)<input value={values.code} maxLength={20} onChange={(event) => setValues({ ...values, code: event.target.value })} placeholder="e.g. Room 101" /></label>
          <label>Used as<select value={values.type} onChange={(event) => setValues({ ...values, type: event.target.value })}>{EDITABLE_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}</select></label>
          <label>Notes (optional)<textarea rows={3} value={values.notes} maxLength={300} onChange={(event) => setValues({ ...values, notes: event.target.value })} placeholder="e.g. Adviser: Ms. Santos" /></label>
          <small className="cms-hint">Shown as {typeLabel(values.type).toLowerCase()} on the floor plan. Search and SiBot will find it by its new name.</small>
          {error && <p className="auth-error" role="alert">{error}</p>}
          {notice && <p className="auth-success" role="status">{notice}</p>}
          <button className="attendance-save" type="submit" disabled={saving}><Icon name="arrow" size={16} /> {saving ? "Saving…" : "Save room"}</button>
          {selected.edited && <button type="button" className="cms-link-button fp-restore" onClick={restore} disabled={saving}>Restore the original name</button>}
        </>}
      </form>
    </div>
  );
}
