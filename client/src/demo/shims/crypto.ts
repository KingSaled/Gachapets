/** Browser stand-ins for the few node:crypto calls the game services make. */
function bytes(n: number) {
  const b = new Uint8Array(n);
  crypto.getRandomValues(b);
  return {
    toString(enc?: string) {
      if (enc === 'hex') return [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
      const s = btoa(String.fromCharCode(...b));
      return enc === 'base64url' ? s.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') : s;
    },
    readUIntBE(_offset: number, len: number) {
      let v = 0;
      for (let i = 0; i < len; i++) v = v * 256 + b[i];
      return v;
    },
  };
}
const shim = {
  randomBytes: bytes,
  scrypt: () => {
    throw new Error('scrypt is not available in the demo build');
  },
  timingSafeEqual: () => false,
};
export const randomBytes = shim.randomBytes;
export default shim;
