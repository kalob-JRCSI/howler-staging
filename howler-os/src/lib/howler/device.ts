export function howlerDeviceId(): string {
  if (typeof window === "undefined") return "server";
  const key = "howler-device-id";
  let id = window.sessionStorage.getItem(key);
  if (!id) {
    id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    window.sessionStorage.setItem(key, id);
  }
  return id;
}

export function isPhoneHowler(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPhone|iPod|Android.+Mobile|webOS|BlackBerry/i.test(navigator.userAgent);
}

export function isFieldHowler(): boolean {
  if (typeof navigator === "undefined") return false;
  return isPhoneHowler() || /iPad|Android(?!.*Mobile)/i.test(navigator.userAgent);
}
