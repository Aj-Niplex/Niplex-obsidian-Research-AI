# Obsidian app validation notes

The official Obsidian download page was opened at https://obsidian.md/download. It listed Linux AppImage version 1.13.7, Android APK version 1.13.8, and iOS/Android store links; the page was marked last updated August 12, 2026.

The browser download history confirmed that `Obsidian-1.13.7.AppImage` was downloaded from `https://obsidian.md` into the sandbox download directory. This is a desktop Linux validation target only; it does not replace direct Android and iOS testing on physical devices or emulators.

The official GitHub release `v1.13.7` was checked with GitHub CLI. Its x86-64 AppImage asset is `Obsidian-1.13.7.AppImage` with a published asset size of 136,902,072 bytes; the local download is an ELF x86-64 executable with the same 131 MiB rounded size. The downloaded SHA-256 is `e0d8e0a611624de8c9c7dcd8a9e648279fb0a0d552faa1312b7e4f3a5fa72663`.

The AppImage help command ran successfully, and a 20-second launch under `xvfb-run` loaded `/resources/obsidian.asar`, checked GitHub for updates, and reported that version 1.13.7 was up to date. The process was intentionally stopped by the timeout (`exit_code=124`) because it is an interactive app; startup itself succeeded. The sandbox did not provide a way to drive the full Obsidian UI or to emulate Android/iOS, so mobile device validation remains a physical-device step.
