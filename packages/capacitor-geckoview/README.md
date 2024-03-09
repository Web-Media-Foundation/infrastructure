[![Stand With Ukraine](https://raw.githubusercontent.com/vshymanskyy/StandWithUkraine/main/banner2-direct.svg)](https://stand-with-ukraine.pp.ua)

<div>
  <img alt="Web Media Foundation" width="100%" src="https://raw.githubusercontent.com/Web-Media-Foundation/infrastructure/master/assets/title.svg" />
</div>


# `Capacitor Geckoview`

This project is the culmination of efforts to integrate Mozilla's GeckoView into Ionic applications. GeckoView allows
developers to independently control the version of the web engine, which is crucial for maintaining consistent behavior 
cross the fragmented Android ecosystem.

### Why GeckoView with Ionic?

- **Consistent Web Engine:** Control the version of the web engine across all devices.
- **Open Source:** Unlike other proprietary solutions, GeckoView is open source.
- **Community Support:** Backed by Mozilla, it has a supportive community and regular updates.

## Getting Started

### Prerequisites

- Ensure your Ionic project is using Capacitor `5.7.0`.
- Familiarize yourself with the Firefox debugging tools as Chrome's developer tools will no longer be applicable.

### Installation

1. **Update `package.json`:** Add a `resolutions` field to ensure the correct versions of dependencies are used.

```json
"resolutions": {
  "@capacitor/android": "npm:@web-media/capacitor-geckoview@5.7.0-experimental.0"
}
```

2. **Modify `build.gradle`:** Add Mozilla's Maven repository to your project's `build.gradle` file.

```gradle
allprojects {
  repositories {
    // Other repositories
    maven {
      url "https://maven.mozilla.org/maven2/"
    }
  }
}
```

3. **Update `capacitor.config.ts`:** Remove the `config.server.androidScheme` if present.

### Sync and Compile

Once the configuration changes are made, you can sync and compile your project as usual. There should be no additional
steps required for integrating native plugins.

## Technical Details

The integration primarily involves modifications at the Android level and inside the web container.

- **Android Level Changes:**
  - Replace system WebView with GeckoView.
  - Handle web file requests via an HTTP server on a random port.
  - Rebind communication protocols between plugins and the web container.

- **Web Container Adjustments:**
  - Implement a plugin for script injection.
  - Address initialization timing issues by queuing communications until plugins are ready.
  - Manage data synchronization over random ports.

## Known Pitfalls

- **Cookie Management:** Cookie functionality is not implemented. If required, consider contributing via a pull request.
- **Plugin Initialization Delay:** A built-in timer refreshes the page if native-web communication isn't established
  within five seconds.
- **Upgrading:** Versions are strictly locked, we will update the extension regularly since it is a patch for
  `@capacitor/android`, manually diff requires a lot of efforts.

## Support and Contributions

If you encounter any issues or have suggestions, please open an issue in the
[@web-media/infrastructure](https://github.com/web-media-foundation/infrastructure) repository.

We welcome community contributions and strive to provide support when possible.

## Acknowledgements

This plugin is a collaborative effort. Special thanks to:

- [Sun](https://github.com/WindFi) for the Android development.
- [Hyper](https://github.com/Rolaka) and myself for the web development.
