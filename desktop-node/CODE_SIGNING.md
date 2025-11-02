# Code Signing Configuration

This document provides instructions for setting up code signing to avoid security warnings during installation.

## Prerequisites

### Windows Code Signing
1. Obtain a code signing certificate from a trusted Certificate Authority (CA):
   - Sectigo (Comodo)
   - DigiCert
   - GlobalSign
   - Entrust

2. Save the certificate as a `.p12` file with a secure password

### macOS Code Signing
1. Enroll in the Apple Developer Program ($99/year)
2. Create a Developer ID Application certificate in Apple Developer Console
3. Download and install the certificate in Keychain Access

## Environment Setup

### Windows
Set the following environment variables:
```bash
# Path to your .p12 certificate file
set CSC_LINK=C:\path\to\your\certificate.p12

# Certificate password
set CSC_KEY_PASSWORD=your_certificate_password

# Optional: Timestamp server
set CSC_TIMESTAMP_SERVER=http://timestamp.sectigo.com
```

### macOS
Set the following environment variables:
```bash
# Certificate name (as shown in Keychain)
export CSC_NAME="Developer ID Application: Your Company Name (TEAM_ID)"

# Apple ID for notarization
export APPLE_ID=your-apple-id@email.com

# App-specific password for notarization
export APPLE_ID_PASS=app-specific-password

# Team ID (found in Apple Developer Console)
export APPLE_TEAM_ID=YOUR_TEAM_ID
```

## Certificate Management

### Windows Certificate Validation
```bash
# Verify certificate information
certutil -dump certificate.p12

# View certificate in Windows Certificate Store
certlm.msc
```

### macOS Certificate Validation
```bash
# List certificates in Keychain
security find-identity -v -p codesigning

# Verify certificate
codesign -dv --verbose=4 /path/to/signed/app
```

## Automated Signing

### GitHub Actions
Create repository secrets for automated builds:

#### Windows Secrets
- `WIN_CSC_LINK`: Base64 encoded certificate file
- `WIN_CSC_KEY_PASSWORD`: Certificate password

#### macOS Secrets
- `MAC_CSC_NAME`: Developer ID name
- `APPLE_ID`: Apple ID email
- `APPLE_ID_PASS`: App-specific password
- `APPLE_TEAM_ID`: Team ID

### Local Development
Create a `.env` file (DO NOT commit to version control):
```bash
# Windows
CSC_LINK=path/to/certificate.p12
CSC_KEY_PASSWORD=certificate_password

# macOS
CSC_NAME=Developer ID Application: Your Name
APPLE_ID=your-apple-id@email.com
APPLE_ID_PASS=app-specific-password
```

## Certificate Types

### Windows
- **Standard Code Signing**: Basic code signing
- **EV Code Signing**: Extended Validation (immediate trust)
- **Timestamping**: Ensures signature validity even after certificate expires

### macOS
- **Developer ID Application**: For distribution outside Mac App Store
- **Mac App Store**: For Mac App Store distribution
- **Notarization**: Apple's automated security scan

## Security Best Practices

1. **Certificate Storage**:
   - Store certificates securely
   - Use hardware security modules (HSM) for high-value certificates
   - Never commit certificates to version control

2. **Password Management**:
   - Use strong, unique passwords
   - Store passwords in secure vaults
   - Use environment variables for automation

3. **Access Control**:
   - Limit access to signing certificates
   - Use separate certificates for development and production
   - Implement certificate rotation policies

4. **Verification**:
   - Always verify signatures after signing
   - Test installations on clean systems
   - Monitor certificate expiration dates

## Troubleshooting

### Windows Issues
- **"The specified network password is not correct"**: Check CSC_KEY_PASSWORD
- **"Cannot find the certificate"**: Verify CSC_LINK path
- **"Timestamp server unavailable"**: Try different timestamp servers

### macOS Issues
- **"Developer ID not found"**: Check CSC_NAME matches Keychain exactly
- **"Notarization failed"**: Verify Apple ID credentials
- **"Certificate expired"**: Renew Developer ID certificate

### Common Solutions
1. **Clear signing cache**: Delete `~/.electron-builder/cache`
2. **Verify environment**: Print all CSC_* environment variables
3. **Test manually**: Use `codesign` (macOS) or `signtool` (Windows) directly

## Testing Signed Builds

### Windows
1. Right-click on signed .exe → Properties → Digital Signatures
2. Check that signature is valid and from your organization
3. Test installation without administrator privileges

### macOS
1. Check signature: `codesign -dv --verbose=4 app.app`
2. Verify notarization: `spctl --assess --verbose app.app`
3. Test first launch (should not show unknown developer warning)

## Annual Maintenance

1. **Certificate Renewal**:
   - Monitor expiration dates
   - Renew certificates 1-2 months before expiration
   - Update environment variables with new certificates

2. **Testing**:
   - Test signing process with renewed certificates
   - Verify installations on fresh systems
   - Update documentation if processes change

## Cost Considerations

### Windows Code Signing
- Standard certificates: $75-300/year
- EV certificates: $300-600/year
- Hardware tokens (EV requirement): $50-150

### macOS Code Signing
- Apple Developer Program: $99/year
- No additional certificate costs

## Support Resources

- [Microsoft Code Signing Documentation](https://docs.microsoft.com/en-us/windows/msix/package/sign-app-package-using-signtool)
- [Apple Code Signing Guide](https://developer.apple.com/library/archive/documentation/Security/Conceptual/CodeSigningGuide/)
- [Electron Builder Code Signing](https://www.electron.build/code-signing)