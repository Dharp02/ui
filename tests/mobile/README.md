# iPhone Safari smoke tests

These tests open the existing Storybook component canvases in Safari through Appium and XCUITest. Use the iPhone 17 Pro simulator shown in DeviceHub for the first run, then select a physical iPhone explicitly. DeviceHub displays the simulator; Appium connects to its underlying Xcode simulator by UDID.

## Install and start the services

Requirements: macOS, Xcode selected as the active developer directory, an installed iOS simulator runtime, and Node.js `^20.19.0 || ^22.12.0 || >=24.0.0` with npm 10 or newer. Open Xcode once to finish its initial setup and license prompts.

From the repository root:

```bash
pnpm mobile:install
pnpm mobile:doctor
```

The mobile tooling is an isolated npm package under `tests/mobile`: Appium **3.8.0**, XCUITest driver **12.15.0**, and WebdriverIO **9.32.0**, with transitive dependencies recorded in `package-lock.json`. The root pnpm commands delegate to npm; `mobile:install` uses `npm ci`. Appium documents npm as its supported package manager and supports loading drivers from a local npm package. No global Appium or separate `appium driver install` is needed. Leave `APPIUM_HOME` unset for this package-based driver discovery. See [Appium installation](https://appium.io/docs/en/latest/quickstart/install/) and [managing drivers with npm](https://appium.io/docs/en/latest/guides/managing-exts/#do-it-yourself-with-npm).

Resolve the doctor's required checks before testing. Optional checks may relate to features outside this smoke suite.

Start each service in a separate terminal and leave it running:

```bash
# Terminal 1: Storybook, reachable from the Mac and devices on its network
pnpm storybook --host 0.0.0.0 --ci
```

```bash
# Terminal 2: Appium, listening on the Mac only
pnpm mobile:server
```

Wait for Storybook to finish starting before running the tests. Appium listens at `http://127.0.0.1:4723/`; the phone accesses Storybook, while the test client on the Mac accesses Appium. To use an existing Appium server, set `APPIUM_URL` for the test command.

## Phase 1: DeviceHub iPhone 17 Pro simulator

Find the simulator corresponding to the device selected in DeviceHub:

```bash
xcrun simctl list devices available
```

Run with that simulator's identifier:

```bash
IOS_UDID='<simulator-udid>' pnpm test:mobile
```

The default Storybook URL is `http://127.0.0.1:6006/`. Without `IOS_UDID`, the runner selects an available simulator named `iPhone 17 Pro` only when exactly one matches. Use `IOS_DEVICE_NAME` for another simulator name or `IOS_PLATFORM_VERSION` to disambiguate installed runtimes. Ambiguous or missing matches fail before a session starts. The runner selects portrait orientation; DeviceHub can remain open to observe it.

## Phase 2: physical iPhone

This uses the same suite with environment variables; switching devices requires no source changes or commits. Connect the iPhone to the Mac, trust the computer, and make sure Xcode recognizes it. Enable Developer Mode and UI Automation, plus Safari's Web Inspector and Remote Automation settings. The WDA runner also needs valid development signing. Follow Appium's [device preparation](https://appium.github.io/appium-xcuitest-driver/latest/preparation/real-device-config/) and [provisioning profile guide](https://appium.github.io/appium-xcuitest-driver/latest/preparation/prov-profile-full-manual/) for the installed iOS/Xcode version.

Find the physical device's identifier in Xcode's Devices and Simulators window or:

```bash
xcrun xctrace list devices
```

Open Storybook in Safari on the phone using the Mac's reachable LAN address. Both the Mac and phone must be able to reach this URL. Loopback addresses such as `localhost` point to the phone itself and are rejected by the real-device configuration.

```bash
IOS_REAL_DEVICE=1 \
IOS_UDID='<physical-iphone-udid>' \
IOS_DEVICE_NAME='<iphone-name>' \
STORYBOOK_URL='http://<mac-lan-ip>:6006/' \
pnpm test:mobile
```

`pnpm test:mobile:device` is a shortcut that sets `IOS_REAL_DEVICE=1`. An explicit `IOS_UDID` is required in either case; `auto` is not accepted. Keep UDIDs, development team identifiers, signing files, and machine addresses in your local shell environment rather than committing them.

If Appium must build and sign WDA, supply the applicable optional environment variables:

| Variable               | Purpose                                                                       |
| ---------------------- | ----------------------------------------------------------------------------- |
| `IOS_TEAM_ID`          | Apple development team for `xcodeOrgId`                                       |
| `IOS_SIGNING_ID`       | Signing identity; defaults to `Apple Development` when `IOS_TEAM_ID` is set   |
| `IOS_WDA_BUNDLE_ID`    | WDA bundle identifier covered by your provisioning profile                    |
| `IOS_XCCONFIG`         | Absolute path to a local Xcode configuration file containing signing settings |
| `IOS_PLATFORM_VERSION` | Explicit iOS version, if needed                                               |
| `IOS_WDA_DERIVED_DATA` | Local Xcode derived-data directory for this WDA build                         |
| `IOS_SHOW_XCODE_LOG=1` | Include Xcode build output in the Appium server log for troubleshooting       |

See the official [XCUITest capabilities reference](https://appium.github.io/appium-xcuitest-driver/latest/reference/capabilities/) for these signing settings.

## WDA conflicts and existing runners

WebDriverAgent (WDA) normally uses port 8100. If DeviceHub or another automation session already owns that port, first identify which device and session it belongs to. Use one active automation controller per device.

- Set `IOS_WDA_PORT=8101` (or another free port) to set Appium's `wdaLocalPort`. This controls the local WDA endpoint/forwarding port; it does not select a different device.
- Set `IOS_WDA_REMOTE_PORT` when WDA on a physical phone uses a different remote port. For an existing forwarded endpoint, the local and remote values must match the forwarding configuration. Simulators share ports with their Mac host, so this remote-port setting applies only to physical devices.
- Set `IOS_WDA_URL='http://127.0.0.1:8101'` only when a compatible WDA instance is already running for the selected device and reachable there. Appium attaches to that runner instead of building and launching its own. Do not point it at an unrelated DeviceHub session.
- For a physical phone with an existing forwarded WDA endpoint, its URL and local port must describe that forwarding arrangement. See [attaching to a running WDA](https://appium.github.io/appium-xcuitest-driver/latest/guides/attach-to-running-wda/).

## Results, failures, and cleanup

Each attempted run that reaches the smoke runner creates an ignored directory under `tests/mobile/artifacts/`, named `simulator-<timestamp>` or `device-<timestamp>`. It contains:

- `results.json`: target capabilities, session details, per-test results, page URL, user agent, and viewport measurements.
- Screenshots after each successful check, including an extra `modal-open.png`.
- A screenshot and HTML page source for failed checks, when the session is still usable.

The suite checks the Storybook index and required story IDs before starting WDA. A failed check marks the run unsuccessful and allows the remaining checks to run. Startup errors and session cleanup errors also produce a nonzero exit code. Normal completion and handled failures attempt to delete the Appium session in `finally`; inspect `cleanupError` in the report if teardown fails. Configuration errors can occur before artifacts are created.

The session uses `noReset` and does not request Safari termination. It does not erase the simulator, clear the phone, or uninstall WDA. Stop the Appium and Storybook terminals with Ctrl+C when finished. After a forced interruption, check the server log for an unfinished session and stop only the automation server/session you started before retrying. Preserve the failed run's artifacts when investigating it; they include local device identifiers and are excluded from Git.

## Coverage and next steps

The current checks cover rendering an enabled button, entering an email value, toggling a checkbox through its label, and opening/closing a modal. They navigate directly to Storybook's `iframe.html` canvas, use XCUITest's native web taps, and capture screenshots and viewport metrics. A passing run establishes this narrow Safari interaction path; it does not establish complete mobile usability, visual regression accuracy, native application behavior, landscape behavior, or keyboard/safe-area correctness. Review the screenshots alongside the results.

Camera, microphone, file-picker permissions, and realistic application flows are outside this suite. Future `getUserMedia` camera/microphone tests on a physical phone need a trusted HTTPS Storybook or component-host origin; plain HTTP on a Mac LAN address is insufficient for those APIs. Phase 3 Storybook/mobile-host changes should be planned from the device results before implementation.
