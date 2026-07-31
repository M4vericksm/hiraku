/** Biblioteca e estado vivem só no browser (localStorage / IndexedDB). SSR gerava HTML com spinner e hidratação falhava. */
export const ssr = false;
