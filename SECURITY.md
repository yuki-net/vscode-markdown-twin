# Security Policy

## Supported versions

| Version | Supported |
| --- | --- |
| 1.2.x | Yes |
| 1.1.x and earlier | No |

Security fixes are released for the latest published minor version.

## Reporting a vulnerability

**Please do not open a public issue for security problems.**

Use GitHub private vulnerability reporting:

https://github.com/yuki-net/vscode-markdown-twin/security/advisories/new

If private reporting is not available, contact the maintainer [@yukiidayo](https://github.com/yukiidayo) through GitHub.

Please include:

- Affected Markdown Twin version and VS Code version
- Operating system
- A clear description and reproduction steps
- Impact assessment (what an attacker could do)
- Relevant logs from the **Markdown Twin** output channel

Do **not** include API keys, access tokens, or private document content. Redact secrets before sharing logs.

## What to expect

- Acknowledgement of the report within 7 days
- An assessment and remediation plan after triage
- Credit in the release notes if you would like it

This is a volunteer-maintained project, so timelines are best effort. There is no bug bounty.

## Scope

In scope:

- API key storage and handling (VS Code SecretStorage)
- Requests to translation providers
- Webview content security policy and message handling
- Path and URI handling for preview resources
- Vulnerabilities in bundled dependencies

Out of scope:

- Vulnerabilities in VS Code itself
- Vulnerabilities in third-party translation providers
- Attacks that require an already-compromised local machine
- Rate limits or billing issues with translation providers

## Safe harbor

We will not pursue legal action for good-faith security research that follows this policy and avoids privacy violations, service disruption, and destruction of data.
