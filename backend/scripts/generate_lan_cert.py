from __future__ import annotations

import argparse
import socket
from pathlib import Path

import trustme


def detect_preferred_ipv4() -> str | None:
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        sock.connect(("8.8.8.8", 80))
        return sock.getsockname()[0]
    except OSError:
        return None
    finally:
        sock.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate a local HTTPS certificate for LAN testing.")
    parser.add_argument("--target", default="certs", help="Output directory, relative to backend/")
    parser.add_argument("--ident", action="append", default=[], help="Hostname or IP to include; may be repeated.")
    parser.add_argument("--no-auto-ip", action="store_true", help="Do not add the machine hostname and preferred LAN IP automatically.")
    args = parser.parse_args()

    names = {"localhost", "127.0.0.1", "::1", *args.ident}
    if not args.no_auto_ip:
        names.add(socket.gethostname())
        names.add(socket.getfqdn())
        lan_ip = detect_preferred_ipv4()
        if lan_ip:
            names.add(lan_ip)

    target = Path(args.target)
    if not target.is_absolute():
        target = Path(__file__).resolve().parents[1] / target
    target.mkdir(parents=True, exist_ok=True)

    ca = trustme.CA(organization_name="TradeSync Local Development")
    server_cert = ca.issue_cert(*sorted(names))

    ca.cert_pem.write_to_path(str(target / "lan-server.cer"))
    server_cert.cert_chain_pems[0].write_to_path(str(target / "lan-server.pem"))
    server_cert.private_key_pem.write_to_path(str(target / "lan-server.key"))

    print(f"Generated certificate files in {target}")
    print("Included names: " + ", ".join(sorted(names)))
    print("Install lan-server.cer into Trusted Root Certification Authorities on remote clients.")


if __name__ == "__main__":
    main()

