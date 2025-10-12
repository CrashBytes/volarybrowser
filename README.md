# Volary Browser

**Security-First, Context-Aware Web Browser**

![Status](https://img.shields.io/badge/status-alpha-orange)
![License](https://img.shields.io/badge/license-MPL--2.0-blue)
![Platform](https://img.shields.io/badge/platform-cross--platform-green)

## 🎯 Mission

Volary reimagines web browsing from first principles, prioritizing user agency, privacy, and security over surveillance capitalism. We reject the incremental bloat of legacy browsers and architect a clean, purposeful browsing experience where **security is infrastructure, not feature**.

---

## 🏗️ Architectural Philosophy

### Core Principles

1. **Security as Architecture, Not Feature**
   - Vault-based encrypted storage for all persistent data
   - Zero-trust authentication model
   - Cryptographic guarantees over policy promises

2. **Privacy by Default, Not Opt-In**
   - No telemetry without explicit consent
   - Tracker blocking enabled at launch
   - DNS-over-HTTPS mandatory

3. **Context Over Tabs**
   - Workspaces as first-class primitives
   - Session isolation prevents cross-context leaks
   - Memory management tied to context lifecycle

4. **Progressive Disclosure in UI**
   - Minimal chrome by default
   - Context-sensitive controls on-demand
   - Keyboard-driven workflows for power users

5. **Interoperability Without Compromise**
   - Chromium engine for web compatibility
   - Custom UI layer for differentiation
   - Extension API with security guardrails

---

## 📐 System Architecture

```
volary/
├── core/                    # Core browser engine abstractions
│   ├── security/           # Vault, encryption, auth layers
│   ├── identity/           # Browser identity, user-agent, update manifests
│   ├── telemetry/          # Privacy-preserving metrics (opt-in)
│   ├── storage/            # Encrypted storage, IndexedDB abstractions
│   └── workspaces/         # Context isolation, session management
│
├── ui/                      # User interface layer
│   ├── components/         # React components (tab bar, address bar, etc.)
│   ├── themes/             # Visual design system
│   └── layouts/            # Responsive layouts, chrome management
│
├── extensions/              # Extension ecosystem
│   ├── api/                # Extension API compatibility layer
│   └── store/              # Curated extension registry
│
├── build/                   # Build system and tooling
│   ├── scripts/            # Automation scripts
│   └── config/             # Build configurations (webpack, vite, etc.)
│
├── tests/                   # Comprehensive test suite
│   ├── unit/               # Unit tests (Jest)
│   ├── integration/        # Integration tests
│   └── e2e/                # End-to-end tests (Playwright)
│
└── docs/                    # Documentation
    ├── architecture/       # System design documentation
    ├── api/                # API references
    └── guides/             # Development guides
```

---

## 🔐 Security Architecture

### Three-Tier Authentication Model

```typescript
enum AuthenticationLevel {
  EPHEMERAL = 0,   // No auth, no persistence (incognito equivalent)
  BASIC = 1,       // PIN/biometric for history, cookies, sessions
  VAULT = 2,       // Full auth for passwords, payment data, certificates
}
```

**Design Rationale:**
- Most users want convenience (BASIC) without exposing critical secrets
- VAULT tier requires deliberate escalation (prevents passive compromise)
- EPHEMERAL mode provides zero-persistence browsing (no cleanup required)

### Vault Encryption Specification

| Component | Algorithm | Key Derivation | Storage |
|-----------|-----------|----------------|---------|
| Master Key | AES-256-GCM | Argon2id (32MB, 4 iterations) | Memory-only |
| History DB | ChaCha20-Poly1305 | HKDF-SHA256 from master | SQLite with SEE |
| Password Store | AES-256-GCM | Per-entry salt + PBKDF2 | Encrypted JSON |
| Session Tokens | XChaCha20-Poly1305 | Ephemeral, context-scoped | Memory-only |

**Security Guarantees:**
- No plaintext secrets touch disk, ever
- Memory zeroing on vault lock (explicit `memset`)
- Side-channel resistance (constant-time operations)
- Forward secrecy (periodic key rotation)

---

## 🚀 Quick Start

### Prerequisites

```bash
# Required
node >= 20.0.0
npm >= 10.0.0
rust >= 1.75.0         # For native security modules
python >= 3.11         # For build scripts

# Platform-specific
# macOS: Xcode Command Line Tools
# Linux: build-essential, libgtk-3-dev
# Windows: Visual Studio 2022 Build Tools
```

### Build From Source

```bash
# Clone repository
git clone https://github.com/volary/browser.git volary
cd volary

# Install dependencies
npm install

# Build native modules (security, crypto)
npm run build:native

# Build browser (development mode)
npm run build:dev

# Run browser
npm start
```

### Development Workflow

```bash
# Run with hot reload
npm run dev

# Run test suite
npm test

# Run specific test categories
npm run test:unit
npm run test:integration
npm run test:e2e

# Lint and format
npm run lint
npm run format

# Generate API documentation
npm run docs:generate
```

---

## 📊 Performance Targets

| Metric | Target | Rationale |
|--------|--------|-----------|
| Cold startup | < 800ms | Faster than Chrome (1.2s avg) |
| Tab switch latency | < 50ms | Perceptually instant |
| Memory per tab | < 150MB | 30% reduction vs. Chrome |
| Binary size | < 120MB | Minimal bloat |

**Measurement Framework:**
- Continuous benchmarking in CI/CD
- Real-world usage telemetry (opt-in)
- Comparative analysis vs. Chrome/Firefox

---

## 🧪 Testing Strategy

### Test Coverage Requirements

- **Unit Tests:** 85% code coverage minimum
- **Integration Tests:** All security-critical paths
- **E2E Tests:** Core user journeys (browse, auth, workspace management)

### Security Testing

```bash
# Static analysis
npm run analyze:security

# Fuzzing (libFuzzer integration)
npm run fuzz:vault
npm run fuzz:parser

# Penetration testing
# See docs/security/pentest-protocol.md
```

---

## 🤝 Contributing

We welcome contributions aligned with Volary's security-first philosophy.

**Before Contributing:**
1. Read [CONTRIBUTING.md](CONTRIBUTING.md)
2. Review [docs/architecture/](docs/architecture/) for system design
3. Check [open issues](https://github.com/volary/browser/issues) for active work

**Code Standards:**
- Rust: `cargo fmt`, `cargo clippy`
- TypeScript: ESLint + Prettier (configuration in `.eslintrc`)
- Commit messages: [Conventional Commits](https://www.conventionalcommits.org/)

---

## 📜 License

Volary Browser is licensed under the [Mozilla Public License 2.0 (MPL-2.0)](LICENSE).

**Why MPL-2.0?**
- Copyleft for modifications (improvements stay open)
- File-level scope (allows proprietary integrations)
- Patent grant (protects contributors)
- Compatible with proprietary software (unlike GPL)

---

## 🎯 Roadmap

### Phase 1: Foundation (Q1 2025) ✅
- [x] Core architecture design
- [x] Security vault implementation
- [x] Authentication system
- [ ] Basic UI framework
- [ ] Extension API compatibility layer

### Phase 2: Alpha Release (Q2 2025)
- [ ] Context/workspace management
- [ ] Privacy-preserving telemetry
- [ ] Performance optimization pass
- [ ] Developer documentation
- [ ] Alpha user cohort (1,000 users)

### Phase 3: Beta (Q3 2025)
- [ ] Extension store (curated)
- [ ] Cloud sync (zero-knowledge architecture)
- [ ] Mobile prototype (Android/iOS)
- [ ] Security audit (external)
- [ ] Beta release (50,000 users)

### Phase 4: Public Launch (Q4 2025)
- [ ] 1.0 stable release
- [ ] Marketing campaign
- [ ] Enterprise tier exploration
- [ ] Community governance model

---

## 📞 Contact & Community

- **Website:** [volarybrowser.com](https://volarybrowser.com)
- **Documentation:** [docs.volarybrowser.com](https://docs.volarybrowser.com)
- **GitHub Issues:** [Bug Reports & Feature Requests](https://github.com/volary/browser/issues)
- **Discord:** [Community Server](https://discord.gg/volary)
- **Twitter:** [@volarybrowser](https://twitter.com/volarybrowser)

---

## 🙏 Acknowledgments

Built on the shoulders of giants:
- [Chromium Project](https://www.chromium.org/) - Web rendering engine
- [Electron](https://www.electronjs.org/) - Cross-platform framework (exploration phase)
- [libsodium](https://libsodium.org/) - Modern cryptography library
- [SQLCipher](https://www.zetetic.net/sqlcipher/) - Encrypted database engine

Special thanks to the privacy-focused browser pioneers:
- Brave, Tor Browser, Firefox - for demonstrating user-first design
- DuckDuckGo, Startpage - for privacy-respecting search
- EFF, Privacy Badger team - for technical privacy advocacy

---

**Volary:** *Your browser. Your rules. Your data.*
