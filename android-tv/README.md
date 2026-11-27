# Chairvana TV (Google TV / Android TV)

A salon's screens as a TV app: the front window sign, the waiting area, the front desk, stations and the color bar.
It's one full-screen WebView showing **chairvana.app/tv**, which already pairs a TV and plays its screen. The app adds
what a TV needs around it:

- Stays on and fills the screen; no system bars.
- Video slides start on their own (no tap needed).
- Reopens itself after a power cut or restart, still paired (the pairing cookie is saved to disk whenever the app pauses).
- If the internet is down when it starts, it shows a "Can't reach Chairvana" panel and tries again every 30 seconds,
  and straight away when the network comes back. Once a screen has played, it keeps playing its saved slides offline.
- Back leaves full-screen video; on the TV page it takes two presses to close, so a bumped remote doesn't take the
  window sign down. Unpairing a TV uses the screen's exit PIN (the lock in the corner).
- The user agent ends in `ChairvanaTV/<version>`, so the web app can tell it's the TV app.

Google TV has no Chrome, so this uses the system WebView rather than a Trusted Web Activity.

## Setting up a TV

1. Install the app (below) and open **Chairvana TV**. It shows a 6-letter code.
2. In Chairvana on your phone: **Screens**, open the screen, **TVs, Pair a TV**, and type the code.
3. The TV starts playing that screen. Move it to another screen or remove it from the same place.

## Building

You don't need Android Studio: GitHub Actions builds it (`.github/workflows/chairvana-tv.yml`) whenever this folder
changes, or from **Actions, Chairvana TV, Run workflow**.

- **Every run:** `chairvana-tv-debug` (a debug APK to sideload for testing; it installs beside the release app).
- **With the signing secrets set:** `chairvana-tv-release`, holding the `.aab` for Google Play and a signed APK.

To build on a computer instead: install Android Studio (or the SDK and JDK 17), then `./gradlew assembleDebug`.
Point it at a test site with `./gradlew assembleDebug -PappUrl=https://your-preview.example/tv`.

## The signing key (once, kept forever)

Google Play needs every update signed with the same upload key. Make it on your own computer, never in a chat:

```sh
keytool -genkeypair -v -keystore upload.jks -alias upload -keyalg RSA -keysize 4096 -validity 10000
base64 -w0 upload.jks > upload.jks.b64     # macOS: base64 -i upload.jks -o upload.jks.b64
```

Then in GitHub (the Salon repository), **Settings, Secrets and variables, Actions**, add:

| Secret | Value |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | the contents of `upload.jks.b64` |
| `ANDROID_KEYSTORE_PASSWORD` | the keystore password |
| `ANDROID_KEY_ALIAS` | `upload` |
| `ANDROID_KEY_PASSWORD` | the key password |

Keep `upload.jks` and its passwords in a password manager, out of the repository, and delete `upload.jks.b64` once
it's in GitHub. Turn on **Play App Signing** when you create the app in the Play Console; Google then holds the real
app key, and a lost upload key can be replaced.

## Installing on a salon TV without the Play Store (testing)

1. On the TV: **Settings, System, About**, press **Android TV OS build** seven times to turn on developer options.
2. **Settings, System, Developer options**: turn on **USB debugging** / **Network debugging**.
3. From a computer on the same network: `adb connect <tv-ip>` then `adb install chairvana-tv-debug.apk`.
   (Or use the "Send Files to TV" app, then open the APK with a file manager.)

## Reopening after a power cut on Google TV

Android TV boxes reopen the app on their own. Google TV (Android 10 and later) only lets an app open itself from the
background if it may display over other apps. Once per TV:

```sh
adb shell appops set app.chairvana.tv SYSTEM_ALERT_WINDOW allow
```

Some TVs (Sony, TCL, Hisense commercial modes) also have their own "start this app when the TV turns on" setting,
which works too.

## Google Play listing (TV)

- The app needs `android.software.leanback` and declares the TV banner (`res/drawable-xhdpi/banner.png`, 320x180).
  Play also wants the large banner `store/tv-banner-1280x720.png` and at least one 1920x1080 TV screenshot.
- In the Play Console, opt the app in to **Android TV** under **Advanced settings, Form factors**, then submit for the
  TV review (it checks the remote works everywhere and there's no touch-only control).
- Target API 36, minimum Android 6 (API 23).

Adapted from the Our Faithful Screens TV app.
