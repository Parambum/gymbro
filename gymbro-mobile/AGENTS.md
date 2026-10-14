# Expo HAS CHANGED

This project targets **Expo SDK 54**, not the latest SDK. Read the exact
versioned docs at https://docs.expo.dev/versions/v54.0.0/ before writing code.

The pin is deliberate: the Expo Go build on the target device supports SDK 54
only, so upgrading the SDK makes the app unloadable there. Check that
constraint before bumping `expo` or any `expo-*` package.

## Local production exports

`npx expo export` can fail on this machine with a `hermesc.exe` crash
(exit 3765269347 / 0xE06D7363). It is memory pressure, not a code fault —
hermesc compiles the same bundle successfully when run standalone. Use
`npx expo export --no-bytecode` locally; cloud builds are unaffected.
