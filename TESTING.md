# 🎯 Volary Browser - First Launch Testing Guide

**Status**: Phase 2 Complete - Renderer Foundation Implemented  
**Version**: 0.1.0-alpha  
**Last Updated**: 2025-01-15

---

## Prerequisites Verification

Before launching, verify your environment meets requirements:

### System Requirements
```bash
# Verify Node.js version (>= 20.0.0)
node --version

# Verify npm version (>= 10.0.0)
npm --version

# Verify dependencies installed
npm list electron
npm list react
npm list webpack
```

**Expected Output**: All dependencies present with no errors.

---

## Build Process - Systematic Approach

**Philosophy**: Build in layers to isolate failures. If step N fails, debug before proceeding to N+1.

### Step 1: Install Dependencies

```bash
cd /path/to/volarybrowser
npm install
```

**What This Does**:
- Installs ~1,200 npm packages
- Compiles native addons if any
- Links dependencies for monorepo

**Expected Duration**: 2-5 minutes (network-dependent)

**Success Criteria**: No `ERR!` messages in output

**Common Issues**:
- Network timeout → Retry with `npm install --verbose`
- Permission denied → Run with `sudo` (macOS/Linux) or as Administrator (Windows)
- Native module errors → Ensure build tools installed (Xcode CLI / Visual Studio Build Tools)

---

### Step 2: Build Preload Script

**Why First**: Main process depends on preload bundle.

```bash
npm run dev:preload
```

**What This Does**:
- Compiles `src/preload/preload.ts` → `dist/preload/preload.js`
- Bundles electron APIs
- Enables source maps for debugging

**Expected Output**:
```
asset preload.js 15.2 KiB [emitted] (name: preload)
webpack 5.89.0 compiled successfully in 234 ms
```

**Success Criteria**: 
- `dist/preload/preload.js` file created
- No TypeScript errors
- File size ~15-20KB

**Keep This Running**: Leave terminal open, it will watch for changes.

---

### Step 3: Build Main Process

**Open New Terminal Tab/Window**

```bash
npm run dev:main
```

**What This Does**:
- Compiles `src/main/main.ts` → `dist/main.js`
- Bundles Node.js modules
- Enables source maps

**Expected Output**:
```
asset main.js 145.3 KiB [emitted] (name: main)
webpack 5.89.0 compiled successfully in 1542 ms
```

**Success Criteria**:
- `dist/main.js` file created
- No TypeScript errors  
- File size ~140-150KB

**Keep This Running**: Watch mode enables hot reload.

---

### Step 4: Start Renderer Dev Server

**Open New Terminal Tab/Window**

```bash
npm run dev:renderer
```

**What This Does**:
- Compiles `src/renderer/index.tsx`
- Starts webpack-dev-server on `localhost:3000`
- Enables hot module replacement (HMR)

**Expected Output**:
```
<i> [webpack-dev-server] Project is running at:
<i> [webpack-dev-server] Loopback: http://localhost:3000/
<i> [webpack-dev-server] Content not from webpack is served from '/public'
webpack 5.89.0 compiled successfully in 3456 ms
```

**Success Criteria**:
- Server running on port 3000
- No compilation errors
- Can access `http://localhost:3000` in browser (shows React app)

**Verification** (optional):
```bash
# In separate terminal
curl http://localhost:3000
# Should return HTML with React mount point
```

---

### Step 5: Launch Electron Application

**Open New Terminal Tab/Window**

```bash
npm start
```

**What This Does**:
- Launches Electron with `dist/main.js`
- Creates BrowserWindow
- Loads renderer from `localhost:3000`
- Opens DevTools (development mode)

**Expected Behavior**:

✅ **Window Opens**: Electron window appears (might take 2-5 seconds)

✅ **UI Renders**: Dark-themed interface with:
- Window chrome (traffic lights on macOS, controls on Windows/Linux)
- Address bar with navigation buttons
- Welcome screen with system status
- Status bar at bottom

✅ **Console Output** (in terminal):
```
[Volary] Application ready, initializing subsystems
[Volary] Configuration initialized
[Volary] IPC handlers initialized
[Volary] Creating main window
[Volary] Main window created
[Volary] Volary Browser started successfully
```

✅ **DevTools Open**: Chrome DevTools visible on right side

---

## Validation Checklist - Component Testing

### Phase 1: Visual Validation

**Open Application → Verify UI Elements**

- [ ] Window has custom chrome (not system default)
- [ ] Traffic lights/controls visible (top-left macOS, top-right Win/Linux)
- [ ] Address bar present with URL input
- [ ] Navigation buttons visible (←, →, ↻)
- [ ] Welcome screen displays "Volary Browser" title
- [ ] Status bar shows "Vault: Locked" and "Connected"

**Expected**: All elements render with dark theme, no layout breaks.

---

### Phase 2: Window Control Testing

**Test Each Window Operation**

#### Test 2.1: Minimize
1. Click minimize button (yellow on macOS, − on Win/Linux)
2. **Expected**: Window minimizes to taskbar/dock
3. Click dock/taskbar icon to restore
4. **Expected**: Window restores

**Console Output**:
```
[Volary] IPC handler invoked: window:minimize
```

#### Test 2.2: Maximize/Restore
1. Click maximize button (green on macOS, □ on Win/Linux)
2. **Expected**: Window fills screen (respects taskbar/menu bar)
3. Click again to restore
4. **Expected**: Window returns to previous size

**Console Output**:
```
[Volary] IPC handler invoked: window:maximize
```

#### Test 2.3: Close
1. Click close button (red on macOS, × on Win/Linux)
2. **Expected**: Window closes gracefully
3. **Expected**: All terminal processes remain running (dev servers)

**Console Output**:
```
[Volary] Application shutting down
[Volary] All windows closed
[Volary] Graceful shutdown complete
```

**Restart Application**: `npm start` (should reopen quickly)

---

### Phase 3: Navigation Testing

#### Test 3.1: URL Navigation
1. Click in address bar URL input
2. Type: `example.com`
3. Press Enter
4. **Expected**: Console logs navigation attempt

**Console Output** (DevTools & Terminal):
```
[App] Navigating to: https://example.com
[Volary] IPC handler invoked: nav:navigate
[Volary] Navigation requested: https://example.com
```

**Note**: Actual page won't load yet (Phase 3 feature - webview implementation).  
**Success Criteria**: IPC communication confirmed, no errors.

#### Test 3.2: Navigation Controls
1. Click back button (←)
2. **Expected**: Console logs back navigation
3. Click forward button (→)
4. **Expected**: Console logs forward navigation
5. Click reload button (↻)
6. **Expected**: Console logs reload

**Console Output**:
```
[Volary] IPC handler invoked: nav:back
[Volary] IPC handler invoked: nav:forward
[Volary] IPC handler invoked: nav:reload
```

---

### Phase 4: System Integration Validation

#### Test 4.1: Preload API Availability

**Open DevTools Console** (View → Toggle Developer Tools)

```javascript
// Verify window.volary exists
console.log(window.volary);
// Expected: Object with window, vault, navigation, tabs, workspaces, system

// Test each API namespace
console.log(window.volary.window);
console.log(window.volary.vault);
console.log(window.volary.navigation);
console.log(window.volary.system);

// Query system information
console.log(window.volary.system.getPlatform());
// Expected: "darwin", "win32", or "linux"

console.log(window.volary.system.getVersion());
// Expected: "0.1.0-alpha"

console.log(window.volary.system.isDevelopment());
// Expected: true
```

**Success Criteria**: All APIs return functions/data, no `undefined`.

#### Test 4.2: IPC Message Flow

**DevTools Console**:

```javascript
// Test window minimize via API directly
window.volary.window.minimize();
// Expected: Window minimizes

// Test async vault status query
window.volary.vault.getStatus().then(status => {
  console.log('Vault Status:', status);
});
// Expected: { isUnlocked: false, hasVault: false }
```

**Success Criteria**: Commands execute, responses returned.

---

### Phase 5: Error Boundary Testing

**Purpose**: Validate graceful error handling.

#### Test 5.1: Force React Error

**DevTools Console**:

```javascript
// Throw error in React tree (simulated)
throw new Error('Test error boundary');
```

**Expected Behavior**:
1. Error boundary catches exception
2. Fallback UI displays with error details
3. "Reload Application" button visible
4. Click button → Application reloads successfully

**Note**: In production, error details hidden. Development shows full stack trace.

---

### Phase 6: Performance Validation

#### Test 6.1: Startup Time

**Measure Cold Start**:

1. Fully quit application (Cmd+Q on macOS, Alt+F4 on Windows)
2. Wait 5 seconds (clear from memory)
3. Run: `time npm start` (macOS/Linux) or use stopwatch
4. **Target**: Application visible in < 3 seconds

**Performance Markers** (DevTools Console → Performance):

```javascript
performance.getEntriesByName('volary-init-duration');
// Expected: ~500-1500ms from navigation start to render
```

#### Test 6.2: Memory Baseline

**DevTools Console**:

```javascript
// Check renderer process memory
performance.memory.usedJSHeapSize / 1024 / 1024;
// Expected: 30-60 MB for minimal UI
```

**Task Manager/Activity Monitor**:
- Electron Helper (Renderer): ~100-150 MB
- Main Process: ~50-80 MB

**Success Criteria**: Memory usage reasonable for empty application.

---

### Phase 7: Hot Reload Validation

**Purpose**: Confirm development workflow efficiency.

#### Test 7.1: Renderer Hot Reload

1. Keep application running
2. Edit `src/renderer/App.tsx`:
   - Change welcome title from "Volary Browser" to "Volary Browser - Modified"
3. Save file
4. **Expected**: UI updates without full reload (~1-2 seconds)
5. **Expected**: Application state preserved (no flash)

**Console Output** (Dev Server):
```
[HMR] Checking for updates...
[HMR] Updated modules: ./src/renderer/App.tsx
```

#### Test 7.2: Main Process Hot Reload

1. Edit `src/main/main.ts`:
   - Add console.log at application startup
2. Save file
3. **Expected**: Terminal shows recompilation
4. **Restart Required**: `npm start` again (main process can't HMR)

---

## Troubleshooting Guide

### Issue: Window Opens but Blank Screen

**Symptoms**: White/black window, no UI rendered.

**Diagnosis**:

1. Check DevTools Console for errors
2. Verify renderer dev server running (`localhost:3000`)
3. Check terminal for compilation errors

**Solution**:

```bash
# Restart renderer dev server
Ctrl+C (kill dev:renderer)
npm run dev:renderer
# Wait for "compiled successfully"
# Restart Electron
npm start
```

---

### Issue: "window.volary is undefined"

**Symptoms**: TypeError in console, APIs unavailable.

**Diagnosis**:

1. Check `dist/preload/preload.js` exists
2. Verify preload script built successfully
3. Check main process config loads correct preload path

**Solution**:

```bash
# Rebuild preload
Ctrl+C (kill dev:preload)
npm run dev:preload
# Verify build success
ls -lh dist/preload/preload.js
# Restart Electron
npm start
```

---

### Issue: IPC Handlers Not Responding

**Symptoms**: Button clicks do nothing, no console output.

**Diagnosis**:

1. Check main process logs for IPC registration
2. Verify handlers initialized before window creation

**Solution**:

```bash
# Check main process terminal for errors
# Look for "IPC handlers initialized"
# If missing, rebuild main process
npm run dev:main
```

---

### Issue: Port 3000 Already in Use

**Symptoms**: Renderer dev server fails to start.

**Solution**:

```bash
# Find process using port 3000
lsof -ti:3000 | xargs kill -9  # macOS/Linux
netstat -ano | findstr :3000   # Windows (then kill PID)

# Or use alternative port
PORT=3001 npm run dev:renderer
# Update config.ts devServer.port to 3001
```

---

### Issue: TypeScript Compilation Errors

**Symptoms**: Build fails with type errors.

**Solution**:

```bash
# Check TypeScript version
npx tsc --version
# Should be 5.3.3 or higher

# Verify tsconfig.json exists
cat tsconfig.json

# Clean build artifacts
rm -rf dist
rm -rf node_modules/.cache

# Rebuild
npm run dev:main
npm run dev:preload
npm run dev:renderer
```

---

## Success Criteria Summary

### ✅ Phase 2 Complete When:

- [x] Application launches without errors
- [x] UI renders with custom chrome
- [x] Window controls functional (minimize, maximize, close)
- [x] Address bar accepts input
- [x] Navigation buttons trigger IPC messages
- [x] DevTools accessible and functional
- [x] Hot reload works for renderer changes
- [x] `window.volary` API available and functional
- [x] Error boundary catches and displays errors
- [x] Memory usage reasonable (<200MB total)

---

## Next Development Phase

**Phase 3: Security Vault Implementation**

With renderer foundation validated, we can now:
1. Complete vault encryption logic
2. Build authentication UI (PIN/password entry)
3. Integrate encrypted storage backend
4. Implement session token management

**Estimated Duration**: 4-6 hours

---

## Support & Debugging

### Log Locations

**Development Console Logs**:
- Main Process: Terminal running `npm start`
- Renderer Process: DevTools Console

**Future Production Logs**:
- macOS: `~/Library/Logs/Volary Browser/`
- Windows: `%APPDATA%/Volary Browser/logs/`
- Linux: `~/.config/Volary Browser/logs/`

### Reporting Issues

When filing bug reports, include:
1. Operating system and version
2. Node.js version (`node --version`)
3. Complete error stack trace
4. Steps to reproduce
5. Screenshots (if UI-related)

---

**Testing Completion**: You've now validated the full main process → preload → renderer → IPC stack.

**Architecture Status**: Foundation solid. Ready for feature development.

**Congratulations**: You've successfully built and validated a security-first Electron application architecture! 🎉
