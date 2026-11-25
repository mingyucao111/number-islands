# Number Islands on phones

Open [the web edition](https://mingyucao111.github.io/number-islands/) once while online. The 3D voyage requires WebGL 2. Use the left stick to move and drag the scene to look around. The web app stores progress on the device and caches game files for offline play. Reopen it while online after an update. Progress stays with the browser or installation where you played.

- **iPhone and iPad:** Open the game in Safari. Tap **Share → Add to Home Screen**, turn on **Open as Web App** if offered, then tap **Add**. [Apple instructions](https://support.apple.com/en-sg/guide/iphone/iph42ab2f3a7/ios)
- **Android:** Open the game in Chrome. Tap **More → Install and create shortcut → Install**, or use **Install app** when shown. [Chrome instructions](https://support.google.com/chrome/answer/9658361?co=GENIE.Platform%3DAndroid&hl=en)

## Build the native apps

The [native project](native/) uses Capacitor 8.6.2 and bundles the actual game files so the student experience can launch offline. The bundle ID is `io.github.mingyucao111.numberislands`. Use Node.js 22 or newer. The iOS build requires a Mac with full Xcode 26 or newer. The Android build requires Android Studio with its Android SDK. [Capacitor environment setup](https://capacitorjs.com/docs/getting-started/environment-setup) · [Capacitor 8.6.2](https://github.com/ionic-team/capacitor/releases/tag/8.6.2)

From the repository root, prepare and check the packaged web files.

```sh
cd native
npm ci
npm run prepare:web
```

Create each native project once, using the platform toolchain for the device you plan to test.

```sh
# iPhone and iPad, using Swift Package Manager
npm run ios:init
npm run ios:open

# Android
npm run android:init
npm run android:open
```

After changing web content, run `npm run ios:sync` or `npm run android:sync` and rebuild from the platform IDE. The commands regenerate `native/www` from a fixed list of public assets. The generated platform projects stay local. [Capacitor iOS setup](https://capacitorjs.com/docs/ios) · [Capacitor Android setup](https://capacitorjs.com/docs/android)

## Prepare a store release

- **App Store:** In Xcode, set the owner's signing team and bundle information. Apply the supplied `native/assets/icon.png` to the AppIcon asset catalog. Verify launch, offline play, touch controls, progress and accessibility on a real iPhone and iPad. Use **Product → Archive**, then **Distribute App → App Store Connect** in Organizer. Test the uploaded build on TestFlight before submitting it for review. [Apple distribution](https://developer.apple.com/documentation/xcode/distributing-your-app-for-beta-testing-and-releases)
- **Google Play:** In Android Studio, generate launcher assets from the supplied icon and test on a real Android phone. Open **Build → Generate Signed Bundle / APK**, select **Android App Bundle**, and use the owner's upload signing key. Create a Play Console testing release and upload the signed `.aab`. Review the current Android target API requirement before a production release. [Play release workflow](https://support.google.com/googleplay/android-developer/answer/9859348) · [Play target API requirements](https://support.google.com/googleplay/android-developer/answer/11926878)

Use the store audience and privacy disclosures appropriate for learners. Under Apple's Kids Category rules, place outbound links and purchase opportunities behind a parental gate. Keep teacher authoring out of the child flow. Prepare a suitable privacy policy and screenshots, complete Google Play's data-safety and target-audience declarations, and review its Families policy. [Apple review guidelines](https://developer.apple.com/app-store/review/guidelines/) · [Google Play app review](https://support.google.com/googleplay/android-developer/answer/9859455) · [Google Play Families policy](https://support.google.com/googleplay/android-developer/answer/18265346)

Store signing credentials are unconfigured in this project. Keep certificates, keystores and API keys outside source control. Native store signing, on-device testing and review are pending.
