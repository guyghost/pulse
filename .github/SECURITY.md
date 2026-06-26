# Security Policy

MissionPulse is a browser extension that reads local browser sessions for supported freelance platforms. Please report security issues privately.

## Supported Versions

Security fixes target the current `main` branch and the latest tagged release.

## Reporting a Vulnerability

Open a private GitHub security advisory for this repository, or contact the maintainers through the address listed in the public project profile.

Please include:

- Affected version or commit.
- Clear reproduction steps.
- Impact and data exposure scope.
- Whether secrets, cookies, or session tokens are involved.

Do not open a public issue for an unpatched vulnerability.

## Security Expectations

- No credentials or platform session tokens are stored in the repository.
- Local `.env` and `.env.local` files are ignored by git.
- Browser cookies are used only through Chrome extension APIs for supported connectors.
- The extension core must remain pure and testable, with I/O isolated in the shell layer.
