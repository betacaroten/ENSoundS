let access = null;
const ccHandlers = [];
const noteHandlers = [];
const stateHandlers = [];

export async function connectMIDI() {
  if (access) return access;
  if (!navigator.requestMIDIAccess) {
    throw new Error("Web MIDI not supported in this browser");
  }
  access = await navigator.requestMIDIAccess({ sysex: false });
  for (const input of access.inputs.values()) attach(input);
  access.onstatechange = (e) => {
    if (e.port.type === "input" && e.port.state === "connected") attach(e.port);
    for (const fn of stateHandlers) fn(e);
  };
  return access;
}

function attach(input) {
  input.onmidimessage = (msg) => {
    const [status, d1, d2] = msg.data;
    const type = status & 0xf0;
    const ch = status & 0x0f;
    const dev = input.name || input.id || "midi";
    if (type === 0xb0) {
      for (const fn of ccHandlers) fn(ch, d1, d2, dev);
    } else if (type === 0x90 && d2 > 0) {
      for (const fn of noteHandlers) fn(ch, d1, d2, dev, "on");
    } else if (type === 0x80 || (type === 0x90 && d2 === 0)) {
      for (const fn of noteHandlers) fn(ch, d1, d2, dev, "off");
    }
  };
}

export function onCC(fn) { ccHandlers.push(fn); return () => removeFrom(ccHandlers, fn); }
export function onNote(fn) { noteHandlers.push(fn); return () => removeFrom(noteHandlers, fn); }
export function onStateChange(fn) { stateHandlers.push(fn); return () => removeFrom(stateHandlers, fn); }

function removeFrom(arr, fn) {
  const i = arr.indexOf(fn);
  if (i >= 0) arr.splice(i, 1);
}

export function listInputs() {
  if (!access) return [];
  return Array.from(access.inputs.values()).map((i) => ({
    id: i.id, name: i.name, manufacturer: i.manufacturer,
  }));
}

export function midiSupported() {
  return typeof navigator !== "undefined" && !!navigator.requestMIDIAccess;
}
