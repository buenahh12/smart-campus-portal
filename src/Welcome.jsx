import Icon from "./Icon";
import VerifyAccess from "./VerifyAccess";

// First screen on a new phone: "Who are you?" Visitors go in at once (with the guard-style
// logbook); students and staff sign in and verify their LRN or employee number for the full map.
// The choice is remembered, so it is asked only once. Choosing "Student" unlocks nothing by itself:
// only the LRN check does (src/campusAccess.js).
const WHO_KEY = "sscai-who";
export const readWho = () => {
  try { return localStorage.getItem(WHO_KEY) || ""; } catch { return ""; }
};
export const saveWho = (value) => {
  try {
    if (value) localStorage.setItem(WHO_KEY, value);
    else localStorage.removeItem(WHO_KEY);
  } catch { /* private window: asked again next time */ }
};

const CHOICES = [
  { id: "visitor", icon: "location", title: "Visitor or parent", text: "Find the office, cashier, clinic or the way out. No account needed.", tone: "visitor" },
  { id: "student", icon: "book", title: "Student", text: "Sign in and verify with your LRN to see every room.", tone: "student" },
  { id: "staff", icon: "building", title: "Teacher or staff", text: "Sign in and verify with your employee number.", tone: "staff" },
];

export default function Welcome({ step, signedIn, onChoose, onSignIn, onCreate, onBack, onSkip, onEmergency }) {
  const role = step === "staff" ? "staff" : "student";
  return <div className="welcome" role="dialog" aria-modal="true" aria-labelledby="welcome-title">
    <div className="welcome-card">
      <img className="welcome-logo" src={`${import.meta.env.BASE_URL}logologooo.jpg`} alt="" width="64" height="64" />
      {step === "choose" ? <>
        <p className="welcome-kicker">WELCOME TO SSCAI NAVI</p>
        <h1 id="welcome-title">Who are you?</h1>
        <p className="welcome-lead">So we can show you the right map.</p>
        <div className="welcome-choices">
          {CHOICES.map((item) => <button key={item.id} type="button" className={`welcome-choice tone-${item.tone}`} onClick={() => onChoose(item.id)}>
            <span className="welcome-choice-icon" aria-hidden="true"><Icon name={item.icon} size={22} /></span>
            <span><b>{item.title}</b><small>{item.text}</small></span>
            <Icon name="arrow" size={18} />
          </button>)}
        </div>
      </> : <>
        <p className="welcome-kicker">{role === "staff" ? "TEACHER OR STAFF" : "STUDENT"}</p>
        <h1 id="welcome-title">{signedIn ? "Verify it's you" : "Sign in first"}</h1>
        {signedIn
          ? <VerifyAccess initialRole={role} bare />
          : <div className="welcome-signin">
            <p className="welcome-lead">Use your own account (Google or email). Then enter your {role === "staff" ? "employee number" : "LRN"} once to unlock the full map.</p>
            <button type="button" className="verify-button" onClick={onSignIn}>Sign in</button>
            <button type="button" className="welcome-link" onClick={onCreate}>Create a new account</button>
          </div>}
        <div className="welcome-foot">
          <button type="button" className="welcome-link" onClick={onBack}><Icon name="arrowLeft" size={15} /> Back</button>
          <button type="button" className="welcome-link" onClick={onSkip}>Not now, use the visitor map</button>
        </div>
      </>}
      <button type="button" className="welcome-emergency" onClick={onEmergency}><Icon name="alert" size={16} /> Emergency? Nearest exit</button>
    </div>
  </div>;
}
