export const DEG = Math.PI / 180;
export const rad2deg = (r: number) => r / DEG;
export const deg2rad = (d: number) => d * DEG;
/** rad/s to rev/min. */
export const radps2rpm = (w: number) => (w * 60) / (2 * Math.PI);
export const rpm2radps = (n: number) => (n * 2 * Math.PI) / 60;
