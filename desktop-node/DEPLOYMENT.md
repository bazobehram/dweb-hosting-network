# DWeb Desktop Node - Deployment Guide

This guide covers production deployment, packaging, and distribution of the DWeb Desktop Node application.

## Prerequisites

- Node.js 18+ installed
- npm or yarn package manager
- Git for version control
- Platform-specific build tools (see below)

### Platform-Specific Requirements

#### Windows
- Visual Studio Build Tools or Visual Studio Community
- Windows SDK
- Code signing certificate (optional, for signed releases)

#### macOS
- Xcode Command Line Tools: `xcode-select --install`
- macOS Developer ID certificate (optional, for signed releases)
- Apple Developer account for notarization

#### Linux
- Build essentials: `sudo apt-get install build-essential`
- Additional libraries for system integration

## Build Configuration

The application uses electron-builder for packaging. Configuration is in `package.json` under the `build` section.

### Key Features
- Multi-platform support (Windows, macOS, Linux)
- Code signing preparation
- Auto-updater integration
- Multiple package formats per platform

## Building the Application

### Development Build
```bash
# Install dependencies
npm install

# Development mode with auto-reload
npm run dev

# Test build (unpacked)
npm run pack
```

### Production Builds

#### Single Platform
```bash
# Build for current platform
npm run build

# Platform-specific builds
npm run build:win     # Windows (NSIS installer + portable)
npm run build:mac     # macOS (DMG + ZIP)
npm run build:linux   # Linux (AppImage + DEB + RPM)
```

#### Cross-Platform
```bash
# Build for all platforms (requires platform-specific tools)
npm run build:all

# Distribution without publishing
npm run dist
```

### Clean Build
```bash
# Clean previous builds
npm run clean

# Full rebuild
npm run clean && npm run build
```

## Package Formats

### Windows
- **NSIS Installer** (`.exe`): Full installer with uninstall support
- **Portable** (`.exe`): Standalone executable, no installation required

### macOS
- **DMG** (`.dmg`): macOS disk image installer
- **ZIP** (`.zip`): Archive for direct app bundle distribution

### Linux
- **AppImage** (`.AppImage`): Portable Linux application
- **DEB** (`.deb`): Debian/Ubuntu package
- **RPM** (`.rpm`): Red Hat/Fedora package

## Code Signing

### Windows
1. Obtain a code signing certificate
2. Set environment variables:
   ```bash
   set CSC_LINK=path/to/certificate.p12
   set CSC_KEY_PASSWORD=certificate_password
   ```

### macOS
1. Obtain Apple Developer ID certificate
2. Import to Keychain
3. Set environment variables:
   ```bash
   export CSC_NAME="Developer ID Application: Your Name"
   export APPLE_ID=your-apple-id@email.com
   export APPLE_ID_PASS=app-specific-password
   ```

## Auto-Updates

The application is configured for auto-updates via GitHub releases:

1. **GitHub Integration**: Set up in `package.json` publish config
2. **Version Bumping**: Use semantic versioning (e.g., `1.2.3`)
3. **Release Process**: Tag releases trigger automated builds

### Update Server Configuration
```json
{
  "publish": {
    "provider": "github",
    "owner": "dweb-network",
    "repo": "desktop-node"
  }
}
```

## CI/CD Pipeline

### GitHub Actions
The `.github/workflows/build.yml` file automates:
- Multi-platform builds on push/PR
- Test execution
- Artifact generation
- Release creation on version tags

### Manual Release Process
1. Update version in `package.json`
2. Create git tag: `git tag v1.2.3`
3. Push tag: `git push origin v1.2.3`
4. GitHub Actions builds and creates release

## Distribution

### GitHub Releases
Automated releases include:
- Windows installer and portable versions
- macOS DMG and ZIP files  
- Linux AppImage, DEB, and RPM packages
- Release notes and installation instructions

### Manual Distribution
1. Build packages: `npm run build:all`
2. Test on target platforms
3. Upload to distribution channels
4. Update documentation

## Installation Instructions

### Windows Users
1. Download the `.exe` installer from releases
2. Run installer as Administrator
3. Follow installation wizard
4. Launch from Start Menu or Desktop

### macOS Users  
1. Download the `.dmg` file from releases
2. Open DMG and drag app to Applications folder
3. On first run, allow in Security & Privacy settings
4. Launch from Applications folder

### Linux Users
#### AppImage (Recommended)
1. Download `.AppImage` file
2. Make executable: `chmod +x DWeb-Desktop-Node-*.AppImage`
3. Run directly: `./DWeb-Desktop-Node-*.AppImage`

#### Package Managers
```bash
# Debian/Ubuntu
sudo dpkg -i dweb-desktop-node_*.deb

# Fedora/RHEL
sudo rpm -i dweb-desktop-node-*.rpm
```

## Troubleshooting

### Build Issues
- **Node modules**: Delete `node_modules` and run `npm install`
- **Cache**: Clear electron-builder cache: `npx electron-builder install-app-deps`
- **Platform tools**: Ensure all build tools are installed

### Runtime Issues
- **Port conflicts**: Check if ports 8788, 8789, 8790 are available
- **Permissions**: Run with appropriate user permissions
- **Dependencies**: Verify system dependencies are installed

### Update Issues
- **Network**: Check internet connection for update checks
- **Permissions**: Ensure app can write to installation directory
- **Firewall**: Allow app through firewall for update downloads

## Security Considerations

- Code signing certificates should be kept secure
- Auto-update channels should use HTTPS
- Distribution files should include checksums
- Regular security audits of dependencies

## Performance Optimization

- **Bundle size**: Exclude unnecessary files in build config
- **Startup time**: Lazy load non-critical components
- **Memory usage**: Monitor and optimize service processes
- **Network**: Implement connection pooling and caching

## Monitoring and Analytics

Consider integrating:
- Error tracking (e.g., Sentry)
- Usage analytics (respecting user privacy)
- Performance monitoring
- Update success/failure tracking

## Support and Maintenance

- Monitor GitHub issues for user feedback
- Maintain compatibility with latest Electron versions
- Regular dependency updates for security
- Document breaking changes in release notes