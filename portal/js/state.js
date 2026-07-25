// §2.1 — the eye state machine.
//
// Hygiene rules: opening needs 2 consecutive positive polls; closing always
// passes through Drowsing; a failed fetch never changes anything.

export const EyeState = Object.freeze({
  SEALED: 'sealed',
  STIRRING: 'stirring',
  OPEN: 'open',
  COMMUNING: 'communing',
  DROWSING: 'drowsing',
});

// Events emitted:
//   'change'  (next, prev)      — any state transition
//   'commune'                    — visitor gesture accepted; start audio
//   'resume'                     — source returned mid-drowse while communing;
//                                  reload the audio src and play (§5.5)
//   'sealed'                     — drowse expired; stop audio, back to rest
export function createEyeMachine({ stirMs = 2600, drowseMs = 90000 } = {}) {
  let state = EyeState.SEALED;
  let liveStreak = 0;
  let stirTimer = null;
  let drowseTimer = null;
  let clickQueued = false;
  let resumeCommuning = false;
  const listeners = new Map();

  function on(ev, fn) {
    if (!listeners.has(ev)) listeners.set(ev, []);
    listeners.get(ev).push(fn);
  }
  function emit(ev, ...args) {
    (listeners.get(ev) || []).forEach((fn) => fn(...args));
  }
  function set(next) {
    if (state === next) return;
    const prev = state;
    state = next;
    emit('change', next, prev);
  }

  function beginStir() {
    set(EyeState.STIRRING);
    stirTimer = setTimeout(() => {
      stirTimer = null;
      if (state !== EyeState.STIRRING) return;
      if (clickQueued) {
        clickQueued = false;
        set(EyeState.COMMUNING);
        emit('commune');
      } else {
        set(EyeState.OPEN);
      }
    }, stirMs);
  }

  function beginDrowse() {
    if (stirTimer) {
      clearTimeout(stirTimer);
      stirTimer = null;
    }
    resumeCommuning = state === EyeState.COMMUNING;
    set(EyeState.DROWSING);
    drowseTimer = setTimeout(() => {
      drowseTimer = null;
      if (state !== EyeState.DROWSING) return;
      resumeCommuning = false;
      clickQueued = false;
      set(EyeState.SEALED);
      emit('sealed');
    }, drowseMs);
  }

  function cancelDrowse() {
    if (drowseTimer) {
      clearTimeout(drowseTimer);
      drowseTimer = null;
    }
  }

  function onPoll(res) {
    if (!res || !res.ok) return; // single failed fetch: no state change, ever
    if (res.live) {
      liveStreak += 1;
      if (state === EyeState.SEALED && liveStreak >= 2) {
        beginStir();
      } else if (state === EyeState.DROWSING) {
        // Recently live — one positive poll is enough to wake back up.
        cancelDrowse();
        if (resumeCommuning) {
          resumeCommuning = false;
          set(EyeState.COMMUNING);
          emit('resume');
        } else {
          set(EyeState.OPEN);
        }
      }
    } else {
      liveStreak = 0;
      if (
        state === EyeState.OPEN ||
        state === EyeState.COMMUNING ||
        state === EyeState.STIRRING
      ) {
        beginDrowse();
      }
    }
  }

  // The visitor's click (or Enter/Space on the eye).
  function gesture() {
    if (state === EyeState.OPEN) {
      set(EyeState.COMMUNING);
      emit('commune');
    } else if (state === EyeState.STIRRING) {
      clickQueued = true;
    } else if (state === EyeState.DROWSING) {
      // A hopeful click mid-drowse: if the source returns, come back playing.
      resumeCommuning = true;
    }
    // Sealed: nothing to click. The eye is asleep.
  }

  return {
    on,
    onPoll,
    gesture,
    get state() {
      return state;
    },
  };
}
