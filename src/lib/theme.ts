/** Cookie that stores the chosen theme. Read on the server to render <html data-theme> without a flash. */
export const THEME_COOKIE = "verfy_theme";

/** Browser UI colour per theme (the page background, --bg in globals.css). */
export const THEME_COLOR = { light: "#f6f5f1", dark: "#0d0e11" } as const;
