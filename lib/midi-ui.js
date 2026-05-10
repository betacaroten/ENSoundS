import { connectMIDI, onCC, midiSupported, listInputs } from "./midi.js";

// Wires Web MIDI input to <input type="range"> and <input type="checkbox">
// elements in the page, with a Learn-mode UX. Bindings are stored on
// `state.midiBindings` keyed by element id. Match is by CC number alone —
// channel and device name are recorded but not required to match (so
// reconnects don't break stored mappings).
//
// Required: button, state (a ref with .midiBindings), save(), setStatus(msg, isError?).
// Returns { refresh, exportMapping, importMapping } — call refresh() after the
// page rebuilds elements that should display CC tags.
export function setupMidi({ button, state, save, setStatus }) {
  let connected = false;
  let learnMode = false;
  let armedId = null;
  const pendingCC = new Map();
  let raf = 0;

  function isLearnable(el) {
    return el?.tagName === "INPUT" && el.id && (el.type === "range" || el.type === "checkbox");
  }

  function onLearnClick(e) {
    const el = e.target;
    if (!isLearnable(el)) return;
    e.preventDefault();
    e.stopPropagation();
    if (state.midiBindings?.[el.id] && armedId !== el.id) {
      delete state.midiBindings[el.id];
      save();
      refresh();
      setStatus(`Unbound ${el.id} · saved.`);
      armedId = null;
      clearArmed();
      return;
    }
    clearArmed();
    armedId = el.id;
    el.classList.add("midi-arm");
    setStatus(`Armed: ${el.id}. Twist a knob.`);
  }

  function clearArmed() {
    document.querySelectorAll(".midi-arm").forEach((e) => e.classList.remove("midi-arm"));
  }

  function handleCC(channel, cc, value, deviceName) {
    if (learnMode && armedId) {
      if (!state.midiBindings) state.midiBindings = {};
      state.midiBindings[armedId] = { cc, channel, deviceName };
      save();
      refresh();
      setStatus(`Bound CC ${cc} (${deviceName}) → ${armedId} · saved.`);
      document.getElementById(armedId)?.classList.remove("midi-arm");
      armedId = null;
      return;
    }
    const bindings = state.midiBindings || {};
    let matched = false;
    for (const [id, b] of Object.entries(bindings)) {
      if (b.cc !== cc) continue;
      pendingCC.set(id, value);
      matched = true;
    }
    if (matched && !raf) {
      raf = requestAnimationFrame(() => {
        raf = 0;
        for (const [id, v] of pendingCC) {
          applyValue(document.getElementById(id), v);
        }
        pendingCC.clear();
      });
    } else if (!matched) {
      console.log(`MIDI in: device=${deviceName} ch=${channel} cc=${cc} val=${value}`);
    }
  }

  function applyValue(el, cc) {
    if (!el) return;
    if (el.type === "checkbox") {
      const next = cc >= 64;
      if (el.checked === next) return;
      el.checked = next;
      el.dispatchEvent(new Event("change", { bubbles: true }));
    } else if (el.type === "range") {
      const min = parseFloat(el.min);
      const max = parseFloat(el.max);
      const step = parseFloat(el.step) || 1;
      let v = min + (cc / 127) * (max - min);
      v = Math.round(v / step) * step;
      if (v < min) v = min;
      if (v > max) v = max;
      if (parseFloat(el.value) === v) return;
      el.value = v;
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }

  function refresh() {
    document.querySelectorAll(".midi-cc-tag").forEach((t) => t.remove());
    const bindings = state.midiBindings || {};
    for (const [id, b] of Object.entries(bindings)) {
      const el = document.getElementById(id);
      if (!el) continue;
      const tag = document.createElement("span");
      tag.className = "midi-cc-tag";
      tag.textContent = `● CC ${b.cc}`;
      tag.title = "Click in Learn mode to unbind";
      el.insertAdjacentElement("afterend", tag);
    }
  }

  button.addEventListener("click", async () => {
    try {
      if (!connected) {
        if (!midiSupported()) {
          setStatus("Web MIDI not supported in this browser.", true);
          return;
        }
        await connectMIDI();
        onCC(handleCC);
        connected = true;
        const inputs = listInputs();
        const desc = inputs.length ? inputs.map((i) => i.name).join(", ") : "no inputs";
        setStatus(`MIDI: ${desc}. Click MIDI again to enter Learn mode.`);
        button.classList.add("connected");
        refresh();
        return;
      }
      learnMode = !learnMode;
      document.body.classList.toggle("midi-learn", learnMode);
      button.classList.toggle("learn", learnMode);
      if (learnMode) {
        document.addEventListener("click", onLearnClick, true);
        setStatus("MIDI Learn: click a slider, then twist a knob. Click MIDI again to exit.");
      } else {
        document.removeEventListener("click", onLearnClick, true);
        armedId = null;
        clearArmed();
        setStatus("MIDI ready. Twist your knobs.");
      }
    } catch (e) {
      console.error(e);
      setStatus("MIDI failed: " + (e.message || e), true);
    }
  });

  async function exportMapping() {
    const json = JSON.stringify(state.midiBindings || {}, null, 2);
    try {
      await navigator.clipboard.writeText(json);
      setStatus("MIDI mapping copied to clipboard.");
    } catch {
      console.log(json);
      setStatus("Clipboard blocked — mapping logged to console.", true);
    }
  }

  function importMapping() {
    const current = JSON.stringify(state.midiBindings || {}, null, 2);
    const input = prompt("Paste MIDI mapping JSON (replaces current):", current);
    if (input === null) return;
    try {
      const parsed = JSON.parse(input);
      if (typeof parsed !== "object" || Array.isArray(parsed) || parsed === null) {
        throw new Error("expected an object");
      }
      for (const [id, b] of Object.entries(parsed)) {
        if (typeof b !== "object" || b === null || typeof b.cc !== "number") {
          throw new Error(`invalid binding for "${id}"`);
        }
      }
      state.midiBindings = parsed;
      save();
      refresh();
      const n = Object.keys(parsed).length;
      setStatus(`Imported ${n} MIDI binding${n === 1 ? "" : "s"} · saved.`);
    } catch (e) {
      setStatus(`Import failed: ${e.message || e}`, true);
    }
  }

  return { refresh, exportMapping, importMapping };
}
