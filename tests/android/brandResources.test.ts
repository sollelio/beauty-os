// @vitest-environment node
// Android R3 · launcher and splash use the official Beauty OS symbol (brand package v0.1), paths and colours verbatim,
// placed as in the official app icon — never redrawn; the launch theme is the brand splash, not Capacitor's placeholder.
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '../..')
const read = (p: string) => readFileSync(resolve(root, p), 'utf8')
const RES = 'android/app/src/main/res/'
const svgPaths = (f: string) => [...read(`sollelio-brand-assets/beauty-os-v0.1/${f}`).matchAll(/<path fill="(#[0-9A-F]{6})" d="([^"]+)"\/>/g)].map((m) => [m[1], m[2]])
const vectorPaths = (f: string) => [...read(RES + f).matchAll(/android:fillColor="([^"]+)" android:pathData="([^"]+)"/g)].map((m) => [m[1], m[2]])
const attr = (x: string, name: string) => new RegExp(`android:${name}="([^"]+)"`).exec(x)?.[1]

describe('Android brand resources', () => {
  it('the launcher foreground is the reversed symbol, the splash icon the symbol: paths and colours verbatim', () => {
    expect(vectorPaths('drawable/ic_launcher_foreground.xml')).toEqual(svgPaths('sollelio-beauty-os-symbol-reverse.svg'))
    expect(vectorPaths('drawable/splash_icon.xml')).toEqual(svgPaths('sollelio-beauty-os-symbol.svg'))
  })
  it('placed as in the official dark app icon (translate 162, scale 7 on 1024), mapped onto the visible 72 of 108', () => {
    const icon = read('sollelio-brand-assets/beauty-os-v0.1/sollelio-beauty-os-app-icon-dark.svg')
    expect(icon).toContain('<rect width="1024" height="1024" rx="224" fill="#11152D"/>')
    expect(icon).toContain('<g transform="translate(162 162) scale(7)">')
    for (const f of ['drawable/ic_launcher_foreground.xml', 'drawable/splash_icon.xml']) {
      const x = read(RES + f)
      expect([attr(x, 'viewportWidth'), attr(x, 'viewportHeight')]).toEqual(['108', '108'])
      expect(Number(attr(x, 'scaleX'))).toBe(7 * 72 / 1024)
      expect(Number(attr(x, 'translateX'))).toBe(162 * 72 / 1024 + 18)
      expect(attr(x, 'scaleY')).toBe(attr(x, 'scaleX'))
      expect(attr(x, 'translateY')).toBe(attr(x, 'translateX'))
    }
    // the symbol's extent (8–92 of 100) stays inside the 66 dp safe-zone circle of the 108 dp canvas
    const s = 7 * 72 / 1024, o = 162 * 72 / 1024 + 18
    expect(Math.hypot(8 * s + o - 54, 8 * s + o - 54)).toBeLessThan(33)
  })
  it('adaptive icons: Midnight Indigo background, the foreground vector; legacy PNGs for every density', () => {
    for (const f of ['ic_launcher', 'ic_launcher_round']) {
      const x = read(`${RES}mipmap-anydpi-v26/${f}.xml`)
      expect(x).toContain('<background android:drawable="@color/ic_launcher_background" />')
      expect(x).toContain('<foreground android:drawable="@drawable/ic_launcher_foreground" />')
      for (const d of ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi']) expect(existsSync(resolve(root, `${RES}mipmap-${d}/${f}.png`))).toBe(true)
    }
    expect(read(`${RES}values/ic_launcher_background.xml`)).toContain('<color name="ic_launcher_background">#11152D</color>')
  })
  it('the launch theme is the brand splash on Warm Off-white (the in-app Brand Splash colour), no placeholder bitmap', () => {
    const styles = read(`${RES}values/styles.xml`)
    expect(styles).toContain('<item name="windowSplashScreenBackground">@color/splash_background</item>')
    expect(styles).toContain('<item name="windowSplashScreenAnimatedIcon">@drawable/splash_icon</item>')
    expect(styles).not.toContain('@drawable/splash<')
    expect(read(`${RES}values/colors.xml`)).toContain('<color name="splash_background">#F7F4EE</color>')
    expect(read('index.html')).toContain('#F7F4EE')
    expect(existsSync(resolve(root, `${RES}drawable/splash.png`))).toBe(false)
  })
})
