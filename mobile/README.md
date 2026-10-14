# GymBro for Android

The app is the website. Not a port of it, not a rewrite that tracks it — the
same deployed Next.js application, running inside a native shell.

## Why it is built this way

The requirement was that nothing differ between the app and the site. Two
earlier attempts tried to meet that by reimplementing the product natively:

- `gymbro-android/` — Kotlin and Jetpack Compose, ~1,700 lines, a local-only
  strength tracker that never connected to the backend.
- `gymbro-mobile/` — an Expo skeleton with four screens.

Both diverged from the web app the moment they were written, which is the
outcome the requirement rules out. Reimplementation cannot produce a carbon
copy; it can only produce something that resembles one until the next change
lands on one side and not the other.

There is also a hard technical constraint. The web app has 32 API routes,
server-side `auth()` and middleware, so it cannot be exported to static files
and bundled into an app. It needs a server, and it already has one.

So the app loads `https://gymbro-dun.vercel.app` directly. There is one
codebase, one UI, one calorie engine, one search ranker. A fix shipped to the
web is live in the app on the next launch, with no store review.

**What this costs:** scrolling, transitions and cold start are web-grade, not
native-grade. A Kotlin rewrite would feel better and would be a different
product within two sprints. That trade was made deliberately.

## What the native layer actually adds

A web view and nothing else would fail Google Play's minimum functionality
policy, and would deserve to. These are real capabilities a browser cannot
offer, wired in `src/lib/native.ts` with web fallbacks so the same code runs in
both places:

| Capability | Why it needs native |
| --- | --- |
| Barcode scanning | ML Kit runs on-device and offline, and reads crumpled labels the browser's `BarcodeDetector` gives up on. It does not exist at all on iOS Safari. |
| Meal and weigh-in reminders | Local notifications survive the app being closed and the phone rebooting. Web push needs a server, a subscription and a browser still installed. |
| Haptics | Physical confirmation when a set is logged, with the phone in a pocket between sets. |
| Offline screen | A themed screen instead of a blank white page with no signal. |
| Splash and system bars | The app opens on its own background rather than flashing white. |

`src/components/native-shell.tsx` dismisses the splash once React has painted,
colours the system bars, and makes the Android back button mean "back" — which
a plain web view ignores, and which users notice within about ten seconds.

## Building

Requires the Android SDK and **JDK 21**. Not 17, and not 25. Both ends of that
are load-bearing and neither error message says so:

- **Not 25.** Gradle 8.14.3, which Capacitor pins, refuses to *run* on JDK 25
  and reports only `Unsupported class file major version 69`.
- **Not 17.** Capacitor 8 compiles everything at Java 21 — the core library,
  the plugins, and `android/app/capacitor.build.gradle`, which is regenerated
  on every `cap sync`. The Android Gradle Plugin does not derive a toolchain
  from `compileOptions`, so each module is built by whichever JDK Gradle runs
  under, and a 17 compiler rejects source 21 with `invalid source release: 21`.

Do not try to pin Java 17 in `android/app/build.gradle` to work around the
second point. The generated file is applied *after* it and wins on
`compileOptions`, so the pin only changes the compiler — leaving a 17 javac
compiling source 21, which fails with an error that reads like a missing JDK
rather than a conflict we introduced.

`settings.gradle` also applies the foojay toolchain resolver, so any module
that requests a JDK by version gets it downloaded on first build rather than
failing on a machine that happens not to have it. That download needs network,
once.

```bash
export JAVA_HOME=/path/to/jdk-21

npx cap sync android          # after changing capacitor.config.ts or plugins
cd android && ./gradlew assembleDebug
```

`android/local.properties` holds the SDK path and is per-machine, so it is not
checked in. Create it with `sdk.dir=/path/to/Android/Sdk` if the build reports
"SDK location not found".

The APK lands at `android/app/build/outputs/apk/debug/app-debug.apk`.

To open in Android Studio instead: `npx cap open android`.

## Releasing

1. Bump `versionCode` and `versionName` in `android/app/build.gradle`.
2. `./gradlew bundleRelease` to produce an AAB.
3. Sign it with the upload keystore — **not** checked in; `*.keystore` and
   `*.jks` are ignored. Losing it means never updating the listing again.
4. Upload to the Play Console internal testing track first.

Because the UI is served, a release is only needed when the native layer
changes: a new plugin, a permission, the splash, the target SDK. Product
changes ship by deploying the web app.

## Configuration

`capacitor.config.ts` at the repo root. The URL it points at is the one thing
that decides which backend the app talks to, so a staging build is one line.
