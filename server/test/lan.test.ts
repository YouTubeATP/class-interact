import { describe, expect, it } from 'vitest';
import { rankLanAddresses } from '../src/lan';

describe('LAN address ranking', () => {
  it('prefers a 192.168 Wi-Fi address over a 10.x address, whatever order the OS lists them in', () => {
    const a = { name: 'Ethernet 2', ip: '10.134.240.59' };
    const b = { name: 'Wi-Fi', ip: '192.168.50.200' };
    expect(rankLanAddresses([a, b])[0]).toEqual(b);
    expect(rankLanAddresses([b, a])[0]).toEqual(b);
  });

  it('demotes virtual adapters and link-local addresses', () => {
    const wsl = { name: 'vEthernet (WSL)', ip: '192.168.80.1' };
    const wifi = { name: 'Wi-Fi', ip: '10.0.0.7' };
    const linkLocal = { name: 'Ethernet', ip: '169.254.3.4' };
    expect(rankLanAddresses([wsl, linkLocal, wifi]).map((x) => x.ip)).toEqual(['10.0.0.7', '192.168.80.1', '169.254.3.4']);
  });
});
