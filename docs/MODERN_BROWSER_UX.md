# 🌐 Modern Browser UX Paradigm
## Security-First, Context-Aware Interface Design

**Version:** 1.0  
**Status:** Living Design Document  
**Last Updated:** October 2025

---

## 🎯 Design Philosophy

Traditional browsers evolved from document viewers into application platforms without fundamental UX reimagination. We reject this incremental approach and architect from first principles:

### Core Design Tenets

1. **Security as Interface, Not Feature**
   - Authentication states visibly integrated into UI chrome
   - Vault status always visible, never ambiguous
   - Security indicators use progressive disclosure

2. **Context Over Chaos**
   - Workspaces replace tab soup
   - Visual boundaries reinforce isolation
   - Memory and security boundaries align with UI structure

3. **Progressive Disclosure**
   - Minimal chrome by default (< 15% vertical space)
   - Context-sensitive controls emerge on interaction
   - Keyboard shortcuts for power users

4. **Privacy-Preserving Interaction**
   - Password-protected history (VAULT tier)
   - Visual indicators for tracking protection
   - No ambiguous "private" mode (EPHEMERAL is explicit)

---

## 🏗️ Interface Architecture

### Spatial Design System

```
┌─────────────────────────────────────────────────────────┐
│ ⚡ COMMAND BAR (collapsed: 44px, expanded: auto)        │ 
│   [Context Selector] [Address/Search] [Security Badge]  │
└─────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────┐
│                                                           │
│                 WEB CONTENT AREA                          │
│              (100% available viewport)                    │
│                                                           │
└─────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────┐
│ STATUS BAR (auto-hide: 24px, hover/activity visible)    │
│   [Download Progress] [Network Status] [Extensions]      │
└─────────────────────────────────────────────────────────┘
```

#### Design Rationale
- **No persistent tab bar** - tabs live inside workspaces, not global UI
- **Collapsed chrome** - web content occupies 92%+ of viewport
- **Command-centric** - keyboard-first, palette-driven interaction
- **Security-visible** - authentication state always present

---

## 🔐 Security-First Interaction Patterns

### Three-Tier Authentication Visualization

Authentication tier determines UI capabilities and visual affordances:

#### EPHEMERAL Mode (🔓 Unlocked Ghost)
```typescript
interface EphemeralUI {
  // Visual Characteristics
  chromeColor: 'rgba(120, 120, 120, 0.15)', // Ghosted, translucent
  indicator: '🔓 Ephemeral Session',
  capabilities: {
    history: false,
    cookies: false,
    passwords: false,
    bookmarks: false,
  },
  // Interaction Affordances
  persistenceWarning: 'on', // Warn on form submission
  autoDestruct: true,        // Close destroys all state
}
```

**User Mental Model:** "Nothing I do here leaves a trace"  
**Use Cases:** Shared computers, sensitive browsing, checking accounts on untrusted networks

---

#### BASIC Mode (🔒 Locked Minimal)
```typescript
interface BasicUI {
  // Visual Characteristics
  chromeColor: 'rgba(66, 135, 245, 0.12)', // Subtle blue tint
  indicator: '🔒 Protected History',
  capabilities: {
    history: true,          // Password-protected
    cookies: true,          // Session-scoped
    passwords: false,       // Requires VAULT elevation
    bookmarks: true,
    sessions: true,         // Workspace state persists
  },
  // Interaction Affordances
  vaultEscalation: 'prompt', // Payment/password forms trigger elevation
  historyAccess: 'protected', // Requires PIN/biometric
}
```

**User Mental Model:** "My browsing is private but accessible to me with authentication"  
**Use Cases:** Daily browsing, research, casual shopping (without saved payment methods)

---

#### VAULT Mode (🔐 Locked Secure)
```typescript
interface VaultUI {
  // Visual Characteristics
  chromeColor: 'rgba(46, 204, 113, 0.18)', // Secure green tint
  indicator: '🔐 Vault Unlocked',
  capabilities: {
    history: true,
    cookies: true,
    passwords: true,         // Full password manager access
    paymentMethods: true,
    certificates: true,
    syncedData: true,
  },
  // Interaction Affordances
  autoLock: {
    timeout: '15m',          // Configurable per-user
    onSystemSleep: true,
    onScreenLock: true,
  },
  vaultAccess: 'immediate',  // No additional prompts
}
```

**User Mental Model:** "I have full access to my secure data"  
**Use Cases:** Banking, password management, secure communications, payment transactions

---

## 🎨 Command Bar: The New Address Bar

### Design Philosophy
Traditional address bars conflate navigation, search, and browser control. We separate concerns:

```
┌──────────────────────────────────────────────────────────────┐
│  [⚡ Workspace] [🔍 Address/Search Field] [🔐 Security Badge] │
└──────────────────────────────────────────────────────────────┘
```

### Workspace Selector (Left)
- Click: Open workspace picker (visual thumbnails)
- Keyboard: `Cmd/Ctrl + T` → context switcher
- Visual: Color-coded badges, activity indicators
- Long-press: Create new workspace with template

### Unified Search/Navigation Field (Center)
- Autocomplete hierarchy:
  1. Open tabs in current workspace
  2. History (if authenticated)
  3. Bookmarks
  4. Search suggestions
- Privacy: No search suggestions in EPHEMERAL mode
- Keyboard: `Cmd/Ctrl + L` → focus and select all

### Security Badge (Right)
- Visual state indicator:
  - 🔓 **EPHEMERAL** (gray, ghosted)
  - 🔒 **BASIC** (blue, locked)
  - 🔐 **VAULT** (green, secure)
- Click: Security panel (connection info, permissions, tracker stats)
- Keyboard: `Cmd/Ctrl + I` → security info

---

## 🗂️ Workspace-Centric Navigation

### Mental Model Shift
**Old:** Tabs are top-level primitives  
**New:** Workspaces contain tabs, tabs are ephemeral

### Workspace Types

#### 1. **Project Workspace**
```typescript
interface ProjectWorkspace {
  name: string;
  color: string;
  tabs: Tab[];
  pinnedTabs: Tab[];
  isolationLevel: 'strict' | 'relaxed';
  autoArchive: boolean;        // Save session on close
}
```
**Example:** "Research - AI Ethics" workspace with 12 tabs, auto-archived weekly

#### 2. **Ephemeral Workspace**
```typescript
interface EphemeralWorkspace {
  name: string;
  tabs: Tab[];
  autoDestruct: true;
  persistHistory: false;
}
```
**Example:** "Quick Research" - all state destroyed on close

#### 3. **Persistent Workspace**
```typescript
interface PersistentWorkspace {
  name: string;
  tabs: Tab[];
  restoreOnLaunch: boolean;
  syncAcrossDevices: boolean;
}
```
**Example:** "Daily" workspace with pinned email, calendar, news

### Workspace Interaction Patterns

#### Creation
- `Cmd/Ctrl + Shift + N` → New workspace dialog
- Template-based: "Project", "Shopping", "Research", "Ephemeral"
- Color and icon picker for visual distinction

#### Switching
- `Cmd/Ctrl + Tab` → Cycle through workspaces (not tabs!)
- `Cmd/Ctrl + [1-9]` → Jump to workspace by number
- Expose-style grid view: `F3` or trackpad gesture

#### Management
- Right-click workspace → "Archive", "Export", "Share"
- Drag tabs between workspaces
- Bulk tab operations: "Close all", "Bookmark all", "Move to workspace"

---

## 🔍 Password-Protected History

### Design Rationale
Traditional browsers treat history as unauthenticated data, leaking user behavior to anyone with physical access. We make history a **security primitive**.

### Architecture

```typescript
interface HistoryEntry {
  url: string;
  title: string;
  visitTime: number;
  workspaceId: string;
  authLevel: AuthenticationLevel; // EPHEMERAL entries never persist
}

interface HistoryService {
  // Write operations
  recordVisit(entry: HistoryEntry): Promise<void>;
  
  // Read operations (authentication-gated)
  searchHistory(query: string, auth: AuthToken): Promise<HistoryEntry[]>;
  getRecentHistory(count: number, auth: AuthToken): Promise<HistoryEntry[]>;
  
  // Management
  clearHistory(timeRange: TimeRange, auth: AuthToken): Promise<void>;
  exportHistory(format: 'json' | 'csv', auth: AuthToken): Promise<Blob>;
}
```

### User Interaction Flow

#### Accessing History
1. User presses `Cmd/Ctrl + H` or clicks "History" in command palette
2. **Authentication Challenge:**
   - **EPHEMERAL mode:** No history available (message: "History not recorded in Ephemeral mode")
   - **BASIC mode:** PIN or biometric prompt
   - **VAULT mode:** Immediate access (already authenticated)
3. On successful auth: Show history panel with search

#### History Panel UI
```
┌─────────────────────────────────────────────────────┐
│ 🔍 Search history...                    [Clear All] │
├─────────────────────────────────────────────────────┤
│ Today                                                │
│   • Documentation - Next.js             10:23 AM    │
│   • GitHub - volarybrowser              11:45 AM    │
│                                                       │
│ Yesterday                                            │
│   • Research paper on cryptography       3:15 PM    │
│                                                       │
│ This Week                                            │
│   • [Grouped by workspace]                          │
├─────────────────────────────────────────────────────┤
│ 📊 Statistics: 1,247 visits • 342 unique domains    │
└─────────────────────────────────────────────────────┘
```

### Implementation Details

#### Encryption Layer
```rust
// core/security/history/encryption.rs
pub struct HistoryVault {
    cipher: ChaCha20Poly1305,
    key_derivation: Argon2,
}

impl HistoryVault {
    pub fn encrypt_entry(&self, entry: &HistoryEntry) -> EncryptedBlob {
        // 1. Serialize entry
        let plaintext = bincode::serialize(entry)?;
        
        // 2. Generate per-entry nonce
        let nonce = generate_nonce();
        
        // 3. Encrypt with ChaCha20-Poly1305
        let ciphertext = self.cipher.encrypt(&nonce, plaintext.as_ref())?;
        
        EncryptedBlob {
            nonce,
            ciphertext,
            mac: self.compute_mac(&ciphertext),
        }
    }
    
    pub fn decrypt_entry(&self, blob: &EncryptedBlob) -> Result<HistoryEntry> {
        // Verify MAC first (prevent timing attacks)
        if !self.verify_mac(&blob.ciphertext, &blob.mac) {
            return Err(SecurityError::IntegrityViolation);
        }
        
        // Decrypt
        let plaintext = self.cipher.decrypt(&blob.nonce, blob.ciphertext.as_ref())?;
        
        // Deserialize
        Ok(bincode::deserialize(&plaintext)?)
    }
}
```

#### Storage Layer
```typescript
// core/storage/history-store.ts
export class EncryptedHistoryStore {
  private db: EncryptedDatabase; // SQLCipher
  
  async recordVisit(entry: HistoryEntry, auth: AuthToken): Promise<void> {
    // Validate authentication
    if (!this.validateAuth(auth, AuthenticationLevel.BASIC)) {
      throw new UnauthorizedError('History requires BASIC authentication');
    }
    
    // Never persist EPHEMERAL visits
    if (entry.authLevel === AuthenticationLevel.EPHEMERAL) {
      return;
    }
    
    // Encrypt entry
    const encrypted = await this.vault.encrypt(entry);
    
    // Store in encrypted database
    await this.db.execute(
      'INSERT INTO history (url_hash, encrypted_data, visit_time) VALUES (?, ?, ?)',
      [hashURL(entry.url), encrypted, entry.visitTime]
    );
  }
  
  async searchHistory(query: string, auth: AuthToken): Promise<HistoryEntry[]> {
    // Require authentication for reads
    if (!this.validateAuth(auth, AuthenticationLevel.BASIC)) {
      throw new UnauthorizedError('History access requires authentication');
    }
    
    // Query encrypted database
    const rows = await this.db.query(
      'SELECT encrypted_data FROM history WHERE visit_time > ? ORDER BY visit_time DESC',
      [Date.now() - 30 * 24 * 60 * 60 * 1000] // Last 30 days
    );
    
    // Decrypt and filter client-side (full-text search on plaintext)
    const entries = await Promise.all(
      rows.map(row => this.vault.decrypt(row.encrypted_data))
    );
    
    return entries.filter(entry =>
      entry.url.includes(query) || entry.title.includes(query)
    );
  }
}
```

---

## ⚡ Command Palette: Power User Interface

### Design Philosophy
Inspired by VS Code, Sublime Text, and Raycast: **everything is a command**.

### Invocation
- `Cmd/Ctrl + K` → Open command palette
- `Cmd/Ctrl + Shift + P` → Command palette (action-focused)
- Type-ahead fuzzy search

### Command Categories

#### Navigation Commands
```
• Open URL
• Search History
• Switch Workspace
• Go to Tab
• Recent Tabs
```

#### Workspace Commands
```
• New Workspace
• Archive Current Workspace
• Merge Workspaces
• Export Workspace
```

#### Security Commands
```
• Lock Vault
• Switch to Ephemeral Mode
• Clear Browsing Data
• Manage Passwords
• View Security Report
```

#### Extension Commands
```
• (Extension-contributed commands)
```

### Implementation
```typescript
// ui/command-palette/registry.ts
export interface Command {
  id: string;
  label: string;
  category: CommandCategory;
  keywords: string[];
  execute: (context: BrowserContext) => Promise<void>;
  icon?: string;
  keybinding?: string;
}

export class CommandRegistry {
  private commands = new Map<string, Command>();
  
  register(command: Command): void {
    this.commands.set(command.id, command);
  }
  
  search(query: string): Command[] {
    // Fuzzy search across label and keywords
    return Array.from(this.commands.values())
      .filter(cmd => this.matchesQuery(cmd, query))
      .sort((a, b) => this.scoreMatch(b, query) - this.scoreMatch(a, query));
  }
}
```

---

## 🎯 Tab Management: Rethinking the Basics

### Problem Statement
Traditional tabs create:
- Visual clutter (30+ tabs common)
- Memory bloat (every tab holds resources)
- Context confusion (no grouping)
- Security risks (cross-tab leaks)

### Volary Solution: Hierarchical Tab Groups

#### Visual Design
```
Workspace: "Research Project"
├── 📌 Pinned Tabs (always visible)
│   ├── [Project Docs]
│   └── [Team Chat]
└── 📂 Tab Groups (collapsible)
    ├── Background Research (5 tabs)
    │   └── [collapsed, shows favicon grid]
    ├── API Documentation (8 tabs)
    │   └── [collapsed, shows favicon grid]
    └── Current Work (3 tabs)
        ├── [Active Tab - Full Title]
        ├── [Tab 2]
        └── [Tab 3]
```

#### Tab States
1. **Active Tab** - Currently viewing
2. **Pinned Tab** - Always restored, minimal chrome
3. **Background Tab** - Loaded but not active
4. **Suspended Tab** - Unloaded to save memory, fast restore
5. **Archived Tab** - Stored as bookmark, not in memory

### Automatic Tab Management
```typescript
interface TabLifecyclePolicy {
  suspendAfter: Duration;     // Default: 30 minutes
  archiveAfter: Duration;      // Default: 7 days
  maxTabsPerWorkspace: number; // Default: 50
}

class TabLifecycleManager {
  async enforcePolicies(): Promise<void> {
    const tabs = await this.getAllTabs();
    
    for (const tab of tabs) {
      const inactiveTime = Date.now() - tab.lastActiveTime;
      
      // Suspend inactive tabs
      if (inactiveTime > this.policy.suspendAfter) {
        await this.suspendTab(tab);
      }
      
      // Archive very old tabs
      if (inactiveTime > this.policy.archiveAfter) {
        await this.archiveTab(tab);
      }
    }
  }
}
```

---

## 🛡️ Privacy & Security Indicators

### Visual Hierarchy of Trust

#### HTTPS Status
```
🔒 Secure   → Valid certificate, strong crypto
⚠️  Warning → Certificate issues, mixed content
🔓 Not Secure → HTTP, no encryption
```

#### Tracker Blocking
```
🛡️ [12 blocked] → Show list on click
⚡ [Enhanced]   → Fingerprinting protection active
```

#### Site Permissions
```
📷 Camera granted
🎤 Microphone granted
📍 Location blocked
🔔 Notifications blocked
```

### Security Panel
Click security badge for detailed panel:
```
┌────────────────────────────────────────────────┐
│ 🔒 Secure Connection                           │
│ certificate.example.com                         │
│ Valid until: Dec 31, 2025                      │
├────────────────────────────────────────────────┤
│ 🛡️ Tracking Protection                        │
│ • 12 trackers blocked                          │
│ • Fingerprinting protection: Enhanced          │
│ • Cookie policy: Strict                        │
├────────────────────────────────────────────────┤
│ 🔐 Site Permissions                            │
│ • Notifications: Blocked                       │
│ • Location: Blocked                            │
│ • Camera: Granted (reset in 1 hour)           │
│                                                 │
│ [Manage Permissions] [View Certificate]       │
└────────────────────────────────────────────────┘
```

---

## 📱 Responsive Design Considerations

### Principle: Content First, Chrome Minimal

#### Desktop (> 1280px)
- Full command bar with all controls visible
- Side panel option for bookmarks/history (collapsible)
- Workspace switcher in top bar

#### Laptop (768px - 1280px)
- Condensed command bar
- Collapsible side panel
- Touch-friendly workspace switcher

#### Tablet (< 768px)
- Minimal chrome (command bar only)
- Gesture-based navigation
- Full-screen focus mode

---

## 🎨 Design System

### Color Palette

#### Authentication States
```css
:root {
  /* EPHEMERAL */
  --ephemeral-primary: rgba(120, 120, 120, 0.15);
  --ephemeral-text: rgba(120, 120, 120, 0.8);
  
  /* BASIC */
  --basic-primary: rgba(66, 135, 245, 0.12);
  --basic-accent: #4287f5;
  
  /* VAULT */
  --vault-primary: rgba(46, 204, 113, 0.18);
  --vault-accent: #2ecc71;
  
  /* Semantic Colors */
  --error: #e74c3c;
  --warning: #f39c12;
  --success: #27ae60;
  --info: #3498db;
}
```

### Typography
```css
:root {
  /* Font Stack */
  --font-family-sans: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 
                      'Helvetica Neue', Arial, sans-serif;
  --font-family-mono: 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace;
  
  /* Type Scale */
  --text-xs: 0.75rem;   /* 12px */
  --text-sm: 0.875rem;  /* 14px */
  --text-base: 1rem;    /* 16px */
  --text-lg: 1.125rem;  /* 18px */
  --text-xl: 1.25rem;   /* 20px */
  --text-2xl: 1.5rem;   /* 24px */
}
```

### Spacing System
```css
:root {
  --space-1: 0.25rem;  /* 4px */
  --space-2: 0.5rem;   /* 8px */
  --space-3: 0.75rem;  /* 12px */
  --space-4: 1rem;     /* 16px */
  --space-6: 1.5rem;   /* 24px */
  --space-8: 2rem;     /* 32px */
}
```

---

## ⚙️ Accessibility

### Keyboard Navigation
All functionality accessible via keyboard:
- `Tab` → Navigate interactive elements
- `Cmd/Ctrl + K` → Command palette (universal access)
- `Esc` → Close modals, panels
- `?` → Show keyboard shortcuts overlay

### Screen Reader Support
- ARIA labels on all interactive elements
- Semantic HTML structure
- Focus indicators (visible borders)
- Status announcements for state changes

### Visual Accessibility
- Minimum contrast ratio: WCAG AAA (7:1)
- Respects system dark/light mode
- Configurable font sizes
- Motion reduction support (respects `prefers-reduced-motion`)

---

## 🚀 Performance Targets

### Initial Load
- **Cold start:** < 800ms (to visible UI)
- **Time to interactive:** < 1.2s
- **Bundle size:** < 120MB

### Runtime Performance
- **Tab switch:** < 50ms (perceptually instant)
- **Command palette open:** < 30ms
- **Workspace switch:** < 100ms
- **Memory per tab:** < 150MB (30% less than Chrome)

### Measurement Strategy
```typescript
// ui/performance/metrics.ts
export class PerformanceMonitor {
  recordMetric(name: string, value: number): void {
    // Send to telemetry (opt-in only)
    performance.mark(`volary:${name}`);
    
    // Log to console in development
    if (process.env.NODE_ENV === 'development') {
      console.log(`[Perf] ${name}: ${value}ms`);
    }
  }
  
  measureStartup(): void {
    const navigationStart = performance.timing.navigationStart;
    const domContentLoaded = performance.timing.domContentLoadedEventEnd;
    
    this.recordMetric('startup.cold', domContentLoaded - navigationStart);
  }
}
```

---

## 🔄 Iteration & Feedback

### Design Validation Methods
1. **User Testing** - Quarterly usability studies
2. **A/B Testing** - Feature flags for controlled rollouts
3. **Telemetry** - Opt-in performance and usage metrics
4. **Community Feedback** - Public roadmap, feature voting

### Design Principles Hierarchy
1. **Security** - Never compromise for convenience
2. **Privacy** - Default to user agency
3. **Performance** - Fast is a feature
4. **Simplicity** - Reduce cognitive load
5. **Flexibility** - Accommodate power users

---

## 📚 Further Reading

- [ARCHITECTURE.md](../ARCHITECTURE.md) - System design
- [SECURITY.md](./security/threat-model.md) - Security architecture
- [CONTRIBUTING.md](../CONTRIBUTING.md) - Development guidelines

---

**Next Steps:**
1. Implement command bar prototype
2. Design workspace switcher
3. Build authentication UI flows
4. Create design system components
5. User testing with alpha cohort

**Document Owner:** Volary Design Team  
**Last Review:** October 2025  
**Next Review:** January 2026
