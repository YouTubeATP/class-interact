import { networkInterfaces } from 'node:os';

export interface NicAddress {
  name: string;
  ip: string;
}

const VIRTUAL = /vethernet|wsl|hyper-v|virtualbox|vmware|vmnet|docker|veth|br-|tailscale|zerotier|utun|\btun\d|\btap\b|loopback|bluetooth|vpn|warp/i;

/** Lower is more likely to be the Wi-Fi / Ethernet address phones on the same network can reach. */
export function lanRank({ name, ip }: NicAddress): number {
  let r = VIRTUAL.test(name) ? 20 : 0;
  if (ip.startsWith('169.254.')) return r + 30; // link-local: no real network behind it
  if (ip.startsWith('192.168.')) return r; // home and classroom routers
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(ip)) return r + 2; // often Docker / WSL / Hyper-V
  if (ip.startsWith('10.')) return r + 4; // large private ranges: VPNs, tethering, campus networks
  return r + 5;
}

/** Addresses ordered best guess first. */
export function rankLanAddresses(list: NicAddress[]): NicAddress[] {
  return [...list].sort((a, b) => lanRank(a) - lanRank(b));
}

/** Addresses phones on the same network might use, best guess first. A laptop usually has several. */
export function lanUrls(port: number): string[] {
  const all: NicAddress[] = Object.entries(networkInterfaces()).flatMap(([name, list]) =>
    (list ?? []).filter((i) => i.family === 'IPv4' && !i.internal).map((i) => ({ name, ip: i.address })),
  );
  return rankLanAddresses(all).map((x) => `http://${x.ip}:${port}`);
}
