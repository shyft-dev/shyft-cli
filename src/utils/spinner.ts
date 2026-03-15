import ora, { type Ora } from 'ora';
import { isJsonMode } from './output.js';

let currentSpinner: Ora | null = null;

export function startSpinner(text: string): Ora | null {
  if (isJsonMode()) return null;
  currentSpinner = ora(text).start();
  return currentSpinner;
}

export function updateSpinner(text: string): void {
  if (currentSpinner) {
    currentSpinner.text = text;
  }
}

export function succeedSpinner(text: string): void {
  if (currentSpinner) {
    currentSpinner.succeed(text);
    currentSpinner = null;
  }
}

export function failSpinner(text: string): void {
  if (currentSpinner) {
    currentSpinner.fail(text);
    currentSpinner = null;
  }
}
