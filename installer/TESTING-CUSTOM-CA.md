# Testing the `--ca-cert` feature with a private CA

How to create a private CA and a self-signed server certificate for a custom
FlowFuse platform, then onboard a device with the installer's `--ca-cert` flag.

Two artifacts are needed:

- **CA** — the trust anchor that signs certificates. Passed to the installer via `--ca-cert`.
- **Server cert** — the platform's TLS certificate, signed by the CA. Handed to the
  FlowFuse docker-compose TLS config (certificate installation is out of scope here).

> Node trusts by **SAN** (Subject Alternative Name), not CN. The server cert must list
> the exact hostname/IP that the agent's `--url` targets, or TLS verification fails.

---

## 1. Create the CA

```sh
mkdir -p certs && cd certs

# CA private key
openssl genrsa -out ca.key 4096

# Self-signed CA cert (10 years); CA:TRUE makes it a signing CA
openssl req -x509 -new -nodes -key ca.key -sha256 -days 3650 \
  -subj "/CN=FlowFuse Test CA/O=FlowFuse Test" \
  -out ca.pem
```

- `ca.pem` — trust anchor → this is what you pass to `--ca-cert`.
- `ca.key` — keep secret, only used to sign.

---

## 2. Create the server cert (signed by CA)

Pick the platform hostname first. Example: `flowfuse.local` + machine IP `192.168.1.50`.

```sh
# Server private key
openssl genrsa -out server.key 2048

# CSR
openssl req -new -key server.key -subj "/CN=flowfuse.local" -out server.csr
```

SAN extension file — **critical**; Node rejects certs without a matching SAN:

```sh
cat > san.ext <<'EOF'
basicConstraints=CA:FALSE
keyUsage = digitalSignature, keyEncipherment
extendedKeyUsage = serverAuth
subjectAltName = @alt
[alt]
DNS.1 = flowfuse.local
IP.1  = 192.168.1.50
EOF
```

Sign with the CA:

```sh
openssl x509 -req -in server.csr -CA ca.pem -CAkey ca.key -CAcreateserial \
  -out server.crt -days 825 -sha256 -extfile san.ext
```

Produces `server.crt` + `server.key` → feed these to the FlowFuse docker-compose TLS config.

---

## 3. Verify before onboarding

```sh
# Confirm SAN is present
openssl x509 -in server.crt -noout -text | grep -A1 "Subject Alternative Name"

# After the platform is up, confirm the chain validates against your CA
curl --cacert ca.pem https://flowfuse.local/
```

No curl cert error = CA + SAN correct.

---

## 4. Onboard the device agent

Add host resolution on the device machine if using a DNS name:

```sh
echo "192.168.1.50 flowfuse.local" | sudo tee -a /etc/hosts
```

Run the installer with the **CA** (not the server cert):

```sh
sudo ./flowfuse-device-installer-linux-amd64 \
  --otc <one-time-code> \
  --url https://flowfuse.local \
  --ca-cert /full/path/certs/ca.pem
```

Confirm the feature worked:

```sh
systemctl show flowfuse-device-agent-1880 -p Environment   # NODE_EXTRA_CA_CERTS=...
ls -l /opt/flowfuse-device/ca-certificates.pem             # copied, owned by flowfuse
```

---

## Key rules

- `--ca-cert` = `ca.pem` (the CA), never `server.crt`.
- SAN must match the `--url` host exactly — a DNS name needs a DNS SAN, a bare IP needs
  an IP SAN. Both are included above, so either URL works.
- The `--url` host must equal a SAN entry, or TLS fails regardless of the CA.
- Runtime broker (MQTT/WS): if fronted by the same CA, it is covered. If it uses a
  different CA, concatenate both PEMs into one file and pass that — Node reads the whole
  bundle.
- These are test-only certs. The `825`-day server-cert limit is the Apple/macOS ceiling.
