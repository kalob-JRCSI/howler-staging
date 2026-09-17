# HOWLER_IOS_ORB / stick-mute 20260917c

## Stick-mute fix
`speakHowler` / minified `a_()` must NOT set mute (`$g` / `muted`) before the early-return when `speechSynthesis.speaking|pending`. Mute only after the bail check.

Marker: `HOWLER_SPEAK_LOCK_20260917c`

## iOS board
- Banner: tap orb then speak
- Debug strip: Heard / Muted / Mode / Error (+ Ignore / Cmd / Say)
- Orb tap: unlockSpeech + markSpeechUnlocked + listen() with 45s command window

## Windows fallback (if Actions not used)
1. Copy `howler-os/public/assets/index-xCGGqu00.js` (patched live bundle) over `C:\Users\User\Documents\howler-worker\public\assets\index-xCGGqu00.js`
2. `cd C:\Users\User\Documents\howler-worker`
3. `npx wrangler deploy`
4. Confirm Version ID; do not create D1 test clients
