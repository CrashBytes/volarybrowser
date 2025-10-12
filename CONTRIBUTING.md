# Contributing to Volary Browser

**Welcome to the Volary community!** We're building a security-first browser that respects user agency and privacy. This guide will help you contribute effectively to our mission.

---

## 🎯 Contribution Philosophy

### Core Values

1. **Security First**: Every contribution must maintain or improve security posture
2. **User Agency**: Features empower users, never manipulate them
3. **Code Quality**: Clean, self-documenting code is non-negotiable
4. **Open Collaboration**: Ideas are welcome from everyone

### What We're Looking For

- **Security enhancements** (cryptography, authentication, privacy)
- **Performance improvements** (startup time, memory usage, rendering)
- **UI/UX refinements** (accessibility, clarity, keyboard workflows)
- **Documentation** (architecture, API references, user guides)
- **Bug fixes** (especially security-critical issues)

---

## 🏗️ Development Setup

### Prerequisites

```bash
# Required tools
node >= 20.0.0
npm >= 10.0.0
rust >= 1.75.0
python >= 3.11

# Platform-specific dependencies
# macOS: Xcode Command Line Tools
xcode-select --install

# Linux: Build essentials
sudo apt-get install build-essential libgtk-3-dev

# Windows: Visual Studio 2022 Build Tools
# Download from: https://visualstudio.microsoft.com/downloads/
```

### Initial Setup

```bash
# 1. Fork and clone
git clone https://github.com/YOUR_USERNAME/browser.git volary
cd volary

# 2. Add upstream remote
git remote add upstream https://github.com/volary/browser.git

# 3. Install dependencies
npm install

# 4. Build native modules
npm run build:native

# 5. Verify setup
npm test
npm run lint
```

### Development Workflow

```bash
# Create feature branch
git checkout -b feature/your-feature-name

# Run development server (hot reload enabled)
npm run dev

# Run tests continuously
npm run test:watch

# Lint and format before committing
npm run lint
npm run format

# Commit following Conventional Commits
git commit -m "feat(vault): add key rotation support"

# Push and create pull request
git push origin feature/your-feature-name
```

---

## 📐 Code Standards

### TypeScript Guidelines

**Principles:**
- **Strict mode enabled**: No `any` types, full null checking
- **Interface over type**: Use interfaces for object shapes
- **Functional patterns**: Prefer immutability, pure functions
- **Self-documenting**: Variable names explain purpose

**Example:**

```typescript
// ❌ Avoid
function process(data: any) {
  const result = data.map((x) => x * 2);
  return result;
}

// ✅ Prefer
interface DataPoint {
  value: number;
  timestamp: number;
}

function processDataPoints(points: readonly DataPoint[]): DataPoint[] {
  return points.map((point) => ({
    ...point,
    value: point.value * 2,
  }));
}
```

### Rust Guidelines

**Principles:**
- **Memory safety**: Leverage borrow checker, avoid unsafe unless necessary
- **Error handling**: Use `Result` types, never panic in library code
- **Documentation**: Every public API must have doc comments
- **Testing**: Unit tests for all public functions

**Example:**

```rust
// ❌ Avoid
pub fn decrypt_data(data: Vec<u8>) -> Vec<u8> {
    // panics on error
    crypto::decrypt(&data).unwrap()
}

// ✅ Prefer
/// Decrypts data using authenticated encryption.
///
/// # Arguments
/// * `ciphertext` - Encrypted data with authentication tag
///
/// # Returns
/// * `Ok(plaintext)` - Successfully decrypted data
/// * `Err(CryptoError)` - Authentication failure or invalid ciphertext
///
/// # Examples
/// ```
/// let plaintext = decrypt_data(&ciphertext)?;
/// ```
pub fn decrypt_data(ciphertext: &[u8]) -> Result<Vec<u8>, CryptoError> {
    crypto::decrypt(ciphertext).map_err(CryptoError::from)
}
```

---

## 🧪 Testing Requirements

### Coverage Thresholds

| Category | Minimum Coverage | Rationale |
|----------|------------------|-----------|
| Security modules | 95% | Critical infrastructure |
| Core services | 85% | High-risk logic |
| UI components | 70% | Visual testing supplements |

### Test Structure

```typescript
// tests/unit/vault.test.ts
import { Vault, AuthenticationLevel } from '@core/security/vault';

describe('Vault', () => {
  describe('initialization', () => {
    it('should reject weak passphrases', async () => {
      const vault = new Vault();
      await expect(
        vault.initialize('weak', AuthenticationLevel.BASIC)
      ).rejects.toThrow('Passphrase must be at least 12 characters');
    });

    it('should derive master key from passphrase', async () => {
      const vault = new Vault();
      await vault.initialize('strongPassphrase123', AuthenticationLevel.BASIC);
      expect(vault.getStatus()).toBe(VaultStatus.UNLOCKED);
    });
  });

  describe('encryption', () => {
    let vault: Vault;

    beforeEach(async () => {
      vault = new Vault();
      await vault.initialize('testPassphrase123', AuthenticationLevel.VAULT);
    });

    afterEach(() => {
      vault.lock();
    });

    it('should encrypt and decrypt data', async () => {
      const plaintext = Buffer.from('sensitive data');
      const encrypted = await vault.encrypt(plaintext);
      const decrypted = await vault.decrypt(encrypted);
      
      expect(decrypted).toEqual(plaintext);
    });

    it('should detect tampered ciphertext', async () => {
      const plaintext = Buffer.from('sensitive data');
      const encrypted = await vault.encrypt(plaintext);
      
      // Tamper with ciphertext
      encrypted.ciphertext[0] ^= 0xFF;
      
      await expect(vault.decrypt(encrypted)).rejects.toThrow('data may be tampered');
    });
  });
});
```

---

## 🔒 Security Contribution Guidelines

### Security-Critical Code Review

Code touching these areas requires **two approvals** from security team:
- Cryptographic primitives
- Authentication mechanisms
- Network security (TLS, certificate validation)
- Extension sandbox

### Reporting Security Vulnerabilities

**DO NOT** create public issues for security vulnerabilities.

**Instead:**
1. Email security@volarybrowser.com with details
2. Include: Description, reproduction steps, potential impact
3. Allow 90 days for patch before public disclosure
4. Eligible for bug bounty (see SECURITY.md)

---

## 📝 Commit Message Standards

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <subject>

[optional body]

[optional footer]
```

### Types

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code formatting (no logic change)
- `refactor`: Code restructuring (no behavior change)
- `perf`: Performance improvements
- `test`: Test additions or fixes
- `chore`: Build system, dependencies

### Examples

```bash
# Feature addition
feat(vault): implement key rotation policy

Add automatic key rotation after 100k operations or 24 hours.
Provides forward secrecy guarantee.

# Bug fix
fix(identity): correct user-agent string on Linux ARM64

Previously generated incorrect architecture identifier.
Now properly detects aarch64 vs x86_64.

# Breaking change
feat(api)!: redesign extension permission model

BREAKING CHANGE: Extensions must now explicitly request
vault access. Existing extensions will need updates.
```

---

## 🚀 Pull Request Process

### Before Submitting

- [ ] Tests pass locally (`npm test`)
- [ ] Linters pass (`npm run lint`)
- [ ] Code formatted (`npm run format`)
- [ ] Documentation updated (if API changed)
- [ ] Changelog entry added (if user-facing change)

### PR Template

```markdown
## Description
Brief description of changes

## Motivation
Why is this change needed?

## Testing
How was this tested?

## Screenshots (if UI change)
Before/after screenshots

## Checklist
- [ ] Tests added/updated
- [ ] Documentation updated
- [ ] Breaking changes documented
- [ ] Security implications considered
```

### Review Process

1. **Automated checks**: CI/CD must pass (tests, linting, security scans)
2. **Code review**: At least one approval required
3. **Security review**: Required for security-critical code
4. **Maintainer merge**: Final approval and merge by core team

---

## 🎯 Where to Start

### Good First Issues

Look for issues labeled `good first issue`:
- Documentation improvements
- Test coverage additions
- UI refinements
- Bug fixes with reproduction steps

### Areas Needing Help

| Area | Skills Needed | Impact |
|------|---------------|---------|
| Performance profiling | JavaScript, Rust | High |
| Accessibility | WCAG, ARIA | High |
| Documentation | Technical writing | Medium |
| Extension API | Chrome extension development | High |
| UI/UX polish | React, CSS | Medium |

---

## 💬 Community

### Communication Channels

- **GitHub Discussions**: Design proposals, feature requests
- **Discord**: Real-time chat, questions
- **Twitter**: [@volarybrowser](https://twitter.com/volarybrowser)
- **Email**: dev@volarybrowser.com

### Code of Conduct

We follow the [Contributor Covenant](https://www.contributor-covenant.org/).

**Summary:**
- Be respectful and inclusive
- Focus on what's best for the community
- Show empathy toward others
- Accept constructive criticism gracefully

Violations can be reported to conduct@volarybrowser.com.

---

## 📚 Additional Resources

- [Architecture Documentation](docs/architecture/ARCHITECTURE.md)
- [API Reference](docs/api/)
- [Security Model](docs/security/MODEL.md)
- [Performance Guide](docs/performance/OPTIMIZATION.md)

---

**Thank you for contributing to Volary!** Together, we're building a browser that respects user privacy, security, and agency.

**Questions?** Reach out in [GitHub Discussions](https://github.com/volary/browser/discussions).
