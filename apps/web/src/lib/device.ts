const DEVICE_ID_KEY = "sb_device_id"

/**
 * A random id that identifies this browser profile, kept in localStorage.
 * Tags plays for analytics, and tells the account's devices apart in
 * Connect.
 */
export function getOrCreateDeviceId(): string {
  if (typeof window === "undefined") return ""
  let deviceId = localStorage.getItem(DEVICE_ID_KEY)
  if (!deviceId) {
    deviceId =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : Math.random().toString(36).substring(2) + Date.now().toString(36)
    localStorage.setItem(DEVICE_ID_KEY, deviceId)
  }
  return deviceId
}

const BROWSERS: ReadonlyArray<[RegExp, string]> = [
  [/Edg\//, "Edge"],
  [/OPR\/|Opera/, "Opera"],
  [/Firefox\/|FxiOS\//, "Firefox"],
  [/Chrome\/|CriOS\//, "Chrome"],
  [/Safari\//, "Safari"],
]

const SYSTEMS: ReadonlyArray<[RegExp, string]> = [
  [/iPhone/, "iPhone"],
  [/iPad/, "iPad"],
  [/Android/, "Android"],
  [/Windows/, "Windows"],
  [/Mac OS X|Macintosh/, "Mac"],
  [/CrOS/, "Chromebook"],
  [/Linux/, "Linux"],
]

/** A label for this device in the device list, e.g. "Chrome · Android". */
export function deviceName(): string {
  if (typeof navigator === "undefined") return "Dispositivo"
  const ua = navigator.userAgent
  const browser = BROWSERS.find(([pattern]) => pattern.test(ua))?.[1]
  const system = SYSTEMS.find(([pattern]) => pattern.test(ua))?.[1]
  return [browser, system].filter(Boolean).join(" · ") || "Dispositivo"
}
