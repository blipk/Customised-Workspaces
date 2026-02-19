# Verification Checklist

## 1. Extension Lifecycle
- [ ] Extension enables without errors (`journalctl /usr/bin/gnome-shell -f`)
- [ ] Extension disables cleanly, no lingering errors in journal
- [ ] Re-enable after disable works normally

## 2. Panel Menu — Options (P8, S7, P2)
- [ ] Open panel menu, toggle each boolean option (Isolate Workspaces, Reverse Menu, Show Workspace Overlay)
- [ ] Close and reopen menu — **toggled state persists**
- [ ] Set a CliSwitch command via the dialog, reopen — value persists
- [ ] Toggle Reverse Menu — menu rebuilds in correct order

## 3. Workspace Switching (S1, S2/P5, P26, P24)
- [ ] Switch between workspaces — correct workset loads (favorites + wallpaper)
- [ ] Works with 10+ workspaces (P26 multi-digit index fix)
- [ ] If CliSwitch is set, verify the command runs on switch
- [ ] Create a workset with special characters in the name (e.g. `Test & "quotes"`) — no errors, command doesn't break

## 4. Workset CRUD (S5, S7, S20)
- [ ] Create a new workset — saved correctly
- [ ] Edit a workset (rename, change apps, change wallpaper) — changes persist
- [ ] Cancel an edit dialog (press Escape) — **no changes applied** (S20 fix)
- [ ] Delete a workset — removed, backup created in `envbackups/`
- [ ] Set a workset as default on a workspace — star icon works

## 5. Favorites / Apps (P7)
- [ ] Add a favorite app via the app chooser — appears in workset
- [ ] Remove a favorite app — removed correctly
- [ ] Install/uninstall an app (if possible) — app list updates (P7 cache invalidation)

## 6. Wallpaper / Background (P24)
- [ ] Set different wallpapers per workspace — each workspace shows correct wallpaper
- [ ] Dark/light theme switch — wallpaper variant updates
- [ ] Background style buttons (zoom, centered, etc.) work correctly

## 7. Workspace Isolation (S9, P20)
- [ ] Toggle Isolate Workspaces on — apps filtered per workspace in dash
- [ ] Toggle off — all running apps visible again
- [ ] Rapidly open/close windows — no crashes (P20 debounce)
- [ ] If Dash-to-Panel/Dock installed, isolation defers to their settings

## 8. Overview / Workspace View (P19)
- [ ] Open Activities overview — workspace thumbnails show correct wallpapers and labels
- [ ] Overlay buttons (edit, close, new) work on thumbnails
- [ ] Repeated overview open/close — no Clutter warnings in journal (P19 menu cleanup)

## 9. Session Persistence (P6, P27, P2)
- [ ] Restart GNOME Shell (`Alt+F2` → `r` on X11, or log out/in on Wayland) — session restores correctly
- [ ] Check `~/.config/worksets@blipk.xyz/session.json` is valid JSON after changes
- [ ] Save/load a backup via the menu — works correctly

## 10. File & Directory Security (S4, S17)
- [ ] Run `stat ~/.config/worksets@blipk.xyz/` — permissions should be `drwx------` (0700)
- [ ] If the config dir was created before the fix, manually `chmod 700` it and verify extension still works

## 11. Debug Logging (P4, P34, S18)
- [ ] Enable debug mode in settings — `debug.log` is written to config dir
- [ ] Disable debug mode — logging stops
- [ ] No excessive CPU usage from logging

## 12. Tooltips (P22)
- [ ] Hover over menu items with tooltips — tooltip appears after delay
- [ ] Move mouse away — tooltip disappears
- [ ] Rapidly hover on/off multiple items — no stale tooltips, no errors

## 13. Stderr / Process Output (S12)
- [ ] If any spawned commands produce stderr output, check journal for logged stderr messages (non-critical, just verify no crashes)

## 14. Quick Smoke Test
- [ ] Open menu → create workset → set wallpaper → add app → set as default → switch workspace → switch back → edit → cancel → delete → verify backup exists
