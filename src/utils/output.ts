let jsonMode = false;

export function setJsonMode(enabled: boolean): void {
  jsonMode = enabled;
}

export function isJsonMode(): boolean {
  return jsonMode;
}

export function output(data: unknown): void {
  if (jsonMode) {
    console.log(JSON.stringify(data, null, 2));
  } else if (typeof data === 'string') {
    console.log(data);
  } else {
    console.log(JSON.stringify(data, null, 2));
  }
}

export function success(message: string): void {
  if (!jsonMode) {
    console.log(`\u2713 ${message}`);
  }
}

export function error(message: string): void {
  if (jsonMode) {
    console.error(JSON.stringify({ error: message }));
  } else {
    console.error(`\u2717 ${message}`);
  }
}

export function info(message: string): void {
  if (!jsonMode) {
    console.log(message);
  }
}
