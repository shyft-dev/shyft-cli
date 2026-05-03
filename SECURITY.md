# Security Policy

## Reporting a Vulnerability

If you believe you've found a security issue in `@shyft-dev/cli`, please **do not open a public GitHub issue**. Instead, email **support@shyft.dev** with:

- A description of the issue and its impact
- Steps to reproduce (or a proof of concept)
- The CLI version (`shyft --version`) and your OS

We aim to acknowledge reports within **2 business days** and to provide a remediation timeline within **7 days**.

## Supported Versions

Only the latest released minor version receives security fixes. Please upgrade before reporting.

## Scope

In scope:
- The `@shyft-dev/cli` package itself (this repository)
- Local credential handling (`~/.shyft/config.json`)
- The CLI's interaction with the Shyft API

Out of scope:
- Vulnerabilities in third-party dependencies (please report upstream)
- Issues in the Shyft platform API or web app (report separately to security@shyft.dev with `[platform]` in the subject)

## Disclosure

We follow coordinated disclosure. Please give us a reasonable window to ship a fix before publishing details.
