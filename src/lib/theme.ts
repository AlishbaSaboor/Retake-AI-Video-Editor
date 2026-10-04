export type Theme = 'dark' | 'light'

/** Where the visitor's choice of theme is kept, in this browser. */
export const THEME_STORAGE_KEY = 'retake-theme'

/**
 * Runs in <head> before first paint, so a light-mode visitor never sees a
 * flash of dark: dark is the default, and only a remembered "light" changes it.
 */
export const THEME_SCRIPT = `try{if(localStorage.getItem('${THEME_STORAGE_KEY}')==='light')document.documentElement.dataset.theme='light'}catch(e){}`
