# Host Trudvsem network diagnosis - 2026-11-11

Reproduce from Node-Back on the developer HOST (sandbox pipe/network permissions
may differ): `npm run diagnose:trudvsem`. The script prints safe DNS/TCP/TLS/fetch
results and proxy presence/host only; never credentials or API response bodies.
Also checked `Resolve-DnsName`, curl -4/-6 and `netsh winhttp show proxy` on Windows.

Observed:

| Check | Result |
| --- | --- |
| DNS A | 185.99.9.49 |
| DNS AAAA | No record (ENODATA); curl -6 cannot resolve an IPv6 destination |
| HTTP_PROXY/HTTPS_PROXY/ALL_PROXY/NO_PROXY/NODE_USE_ENV_PROXY | Unset |
| WinHTTP | Direct access, no proxy |
| Direct IPv4 TCP:443 | Connected in ~0.17 s in Python; Node TCP probe also connected; an earlier curl attempt timed out |
| TLS with correct SNI and certificate verification | Handshake timeout after TCP connect |
| TLS capped at 1.2 | Handshake timeout as well |
| HTTPS control github.com | TCP connects, TLS 1.3 handshake succeeds |
| Node fetch API | TypeError with underlying UND_ERR_CONNECT_TIMEOUT |
| CLI live --probe-offset, bounded timeout, retries=0 | Failed; no live offset evidence |

The previous generic NETWORK_ERROR hides the underlying connect failure. Importer
now logs only a safe allowlisted cause code (e.g. UND_ERR_CONNECT_TIMEOUT), retaining
bounded retries. A synthetic retry cannot fix this endpoint-specific TLS stall.
Observed failure boundary is connection/TLS establishment, before any HTTP status or
JSON parsing. It is not explained by missing IPv4 DNS, IPv6 fallback or configured
proxy credentials. A bad certificate was not observed: the handshake never completed.
Local evidence cannot distinguish upstream TLS service failure from path/SNI filtering;
network/server logs or a second independent egress route are required to identify
which component drops the handshake. No TLS verification was disabled, proxy settings
changed or retry budget expanded. IPv4-only access also did not recover the endpoint.

Live vacancies were NOT obtained. Live offset and date-filter semantics remain
unverified; reproducible fixture/mock sync is covered in SYNC_V1.md. To recheck when
connectivity is restored, first run diagnostics, then standalone --probe-offset,
then a bounded sync. Do not claim cursor-safe live incremental until its filter
semantics are independently confirmed.
