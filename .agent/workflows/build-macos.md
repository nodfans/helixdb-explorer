---
description: How to build the macOS DMG for HelixDB Explorer
---

To build a standalone macOS application (.dmg) without App Store notarization:

1. **Navigate to the project root.**

2. **Run the production build command:**

   ```bash
   pnpm tauri build
   ```

   _Note: This will automatically handle the SolidJS frontend build and the Rust backend compilation._

3. **Locate your DMG file:**
   Once the build completes, the `.dmg` installer will be located at:
   `packages/desktop/src-tauri/target/release/bundle/dmg/HelixDB Explorer_0.1.0_x64.dmg` (or similar, depending on your architecture).

4. **Distribution:**
   You can directly share this `.dmg` file. Note that because it is not notarized by Apple, users may need to right-click and select "Open" the first time they run it to bypass Gatekeeper.
