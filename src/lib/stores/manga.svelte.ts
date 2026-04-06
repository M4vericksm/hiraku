import { PersistenceService } from '../services/persistence';

export interface PDFBookmark {
  title: string;
  pageNumber: number;
}

export interface Manga {
  id: string;
  anilistId?: string;      // AniList manga ID (separate from app ID to avoid collisions)
  title: string;
  author?: string;
  coverUrl?: string;       // loaded at runtime from IndexedDB, not persisted to localStorage
  description?: string;
  progress: number;
  lastReadPage: number;
  totalPage: number;
  filePath: string;
  addedAt: string;
  lastReadAt?: string;
  bookmarks: PDFBookmark[];
  hasHandle?: boolean;
  genres?: string[];
  status?: string;
  averageScore?: number;
  seriesId?: string;       // UUID linking volumes of the same series
  volumeNumber?: number;   // 1, 2, 3... (undefined = standalone)
}

export interface Series {
  id: string;
  title: string;
  author?: string;
  description?: string;
  genres?: string[];
  status?: string;
  averageScore?: number;
  volumes: Manga[];        // sorted by volumeNumber
}

class MangaStore {
  library = $state<Manga[]>([]);
  isLoading = $state(true);

  constructor() {
    if (typeof window === 'undefined') return;
    const saved = localStorage.getItem('hiraku-library');
    if (saved) {
      try {
        this.library = JSON.parse(saved);
      } catch (e) {
        console.error('Falha ao processar biblioteca', e);
      }
    }
    // isLoading will be set to false by loadCovers() after covers are ready
    this.loadCovers();
  }

  private async loadCovers() {
    let needsSave = false;
    for (let i = 0; i < this.library.length; i++) {
      const manga = this.library[i];
      // Migrate: if coverUrl is a long base64, move it to IndexedDB
      if (manga.coverUrl && manga.coverUrl.startsWith('data:')) {
        await PersistenceService.saveCover(manga.id, manga.coverUrl);
        this.library[i] = { ...manga, coverUrl: undefined };
        needsSave = true;
      }
      // Load cover from IndexedDB
      const cover = await PersistenceService.getCover(manga.id);
      if (cover) {
        this.library[i] = { ...this.library[i], coverUrl: cover };
      }
    }
    if (needsSave) this.saveToStorage(); // single write after full migration
    this.isLoading = false;
  }

  saveToStorage() {
    if (typeof window === 'undefined') return;
    // Strip coverUrl before persisting (covers live in IndexedDB)
    const stripped = this.library.map(({ coverUrl: _, ...m }) => m);
    try {
      localStorage.setItem('hiraku-library', JSON.stringify(stripped));
    } catch (e: any) {
      if (e?.name === 'QuotaExceededError' || e?.code === 22) {
        console.error('localStorage cheio mesmo sem capas');
      }
    }
  }

  async addManga(manga: Manga, handle?: FileSystemFileHandle) {
    if (handle) {
      await PersistenceService.saveHandle(manga.id, handle);
      manga.hasHandle = true;
    }
    if (manga.coverUrl) {
      await PersistenceService.saveCover(manga.id, manga.coverUrl);
      // keep coverUrl in memory but not in localStorage (handled by saveToStorage strip)
    }
    this.library = [manga, ...this.library];
    this.saveToStorage();
  }

  async addMangas(mangas: { manga: Manga; handle?: FileSystemFileHandle }[]) {
    for (const item of mangas) {
      if (item.handle) {
        await PersistenceService.saveHandle(item.manga.id, item.handle);
        item.manga.hasHandle = true;
      }
      if (item.manga.coverUrl) {
        await PersistenceService.saveCover(item.manga.id, item.manga.coverUrl);
      }

      // Auto-group: if the library already has a manga with the same anilistId,
      // automatically link this new volume into the same series.
      if (item.manga.anilistId) {
        const existing = this.library.find(m => m.anilistId === item.manga.anilistId);
        if (existing) {
          let seriesId: string;

          if (existing.seriesId) {
            // Already in a series — join it
            seriesId = existing.seriesId;
          } else {
            // Standalone — create a new series, make the existing entry Vol 1
            seriesId = `series-${crypto.randomUUID()}`;
            const existingIdx = this.library.findIndex(m => m.id === existing.id);
            this.library[existingIdx] = {
              ...this.library[existingIdx],
              seriesId,
              volumeNumber: this.library[existingIdx].volumeNumber ?? 1
            };
          }

          // Determine next volume number
          const takenNums = this.library
            .filter(m => m.seriesId === seriesId)
            .map(m => m.volumeNumber ?? 0);
          const nextVol = takenNums.length > 0 ? Math.max(...takenNums) + 1 : 2;

          item.manga.seriesId = seriesId;
          item.manga.volumeNumber = nextVol;
        }
      }
    }
    this.library = [...mangas.map(m => m.manga), ...this.library];
    this.saveToStorage();
  }

  updateProgress(id: string, page: number, total: number) {
    const index = this.library.findIndex((m) => m.id === id);
    if (index !== -1) {
      const manga = this.library[index];
      this.library[index] = {
        ...manga,
        lastReadPage: page,
        totalPage: total,
        progress: Math.round((page / total) * 100),
        lastReadAt: new Date().toISOString()
      };
      this.saveToStorage();
    }
  }

  async removeManga(id: string) {
    await PersistenceService.removeHandle(id);
    await PersistenceService.removeCover(id);
    this.library = this.library.filter((m) => m.id !== id);
    this.saveToStorage();
  }

  /**
   * Remove a volume from a series. If only one volume would remain,
   * that volume is unlinkied from the series (becomes standalone).
   */
  async removeVolumeFromSeries(mangaId: string) {
    const manga = this.library.find(m => m.id === mangaId);
    if (!manga) return;

    if (manga.seriesId) {
      const remaining = this.library.filter(
        m => m.seriesId === manga.seriesId && m.id !== mangaId
      );
      if (remaining.length === 1) {
        // Unlink the last remaining volume — make it standalone
        const lastIdx = this.library.findIndex(m => m.id === remaining[0].id);
        this.library[lastIdx] = {
          ...this.library[lastIdx],
          seriesId: undefined,
          volumeNumber: undefined
        };
      }
    }

    await this.removeManga(mangaId);
  }

  markHasHandle(id: string) {
    const idx = this.library.findIndex(m => m.id === id);
    if (idx !== -1) {
      this.library[idx] = { ...this.library[idx], hasHandle: true };
      this.saveToStorage();
    }
  }

  updateMeta(id: string, meta: Partial<Manga>) {
    const idx = this.library.findIndex(m => m.id === id);
    if (idx !== -1) {
      // If new cover provided, save to IndexedDB
      if (meta.coverUrl) {
        PersistenceService.saveCover(id, meta.coverUrl);
      }
      this.library[idx] = { ...this.library[idx], ...meta };
      this.saveToStorage();
    }
  }

  clearAll() {
    // Clean up all covers from IndexedDB
    for (const manga of this.library) {
      PersistenceService.removeCover(manga.id);
      PersistenceService.removeHandle(manga.id);
    }
    this.library = [];
    localStorage.removeItem('hiraku-library');
  }

  // ─── Series / Volumes ──────────────────────────────────────────────

  /**
   * Convert a standalone manga into Volume 1 of a new series.
   * Returns the new seriesId.
   */
  createSeries(mangaId: string): string {
    const idx = this.library.findIndex(m => m.id === mangaId);
    if (idx === -1) return '';
    const seriesId = `series-${crypto.randomUUID()}`;
    this.library[idx] = { ...this.library[idx], seriesId, volumeNumber: 1 };
    this.saveToStorage();
    return seriesId;
  }

  /**
   * Add a new volume to an existing series.
   * seriesId: the target series
   * manga: the new volume Manga object (with seriesId + volumeNumber already set)
   * handle: optional FileSystemFileHandle for the PDF
   */
  async addVolumeToSeries(manga: Manga, handle?: FileSystemFileHandle) {
    // Determine next volume number if not provided
    if (!manga.volumeNumber) {
      const existing = this.library.filter(m => m.seriesId === manga.seriesId);
      manga.volumeNumber = existing.length + 1;
    }
    await this.addManga(manga, handle);
  }

  /** All series derived from the library */
  get seriesList(): Series[] {
    const map = new Map<string, Manga[]>();
    for (const manga of this.library) {
      if (manga.seriesId) {
        if (!map.has(manga.seriesId)) map.set(manga.seriesId, []);
        map.get(manga.seriesId)!.push(manga);
      }
    }
    return [...map.entries()].map(([id, vols]) => {
      const sorted = [...vols].sort((a, b) => (a.volumeNumber ?? 0) - (b.volumeNumber ?? 0));
      const first = sorted[0];
      return {
        id,
        title: first.title
          .replace(/[\s\-–]*[Vv]ol(ume)?\.?\s*\d+.*$/i, '')
          .replace(/[\s\-–]+$/, '')
          .trim() || first.title,
        author: first.author,
        description: first.description,
        genres: first.genres,
        status: first.status,
        averageScore: first.averageScore,
        volumes: sorted
      };
    });
  }

  /** Series by ID */
  getSeries(seriesId: string): Series | undefined {
    return this.seriesList.find(s => s.id === seriesId);
  }

  // ─── Export / Import ───────────────────────────────────────────────

  exportLibrary(): string {
    return JSON.stringify(
      { version: '1', exportedAt: new Date().toISOString(), library: this.library.map(({ coverUrl: _, ...m }) => m) },
      null,
      2
    );
  }

  importLibrary(json: string): { ok: boolean; count: number; error?: string } {
    try {
      const data = JSON.parse(json);
      if (!data.version || !Array.isArray(data.library)) {
        return { ok: false, count: 0, error: 'Arquivo inválido ou não é um backup do Hiraku.' };
      }
      const incoming: Manga[] = data.library;
      const existingIds = new Set(this.library.map((m) => m.id));
      const newEntries = incoming.filter((m) => !existingIds.has(m.id));
      this.library = [...newEntries.map((m) => ({ ...m, hasHandle: false, coverUrl: undefined })), ...this.library];
      this.saveToStorage();
      return { ok: true, count: newEntries.length };
    } catch {
      return { ok: false, count: 0, error: 'Não foi possível ler o arquivo de backup.' };
    }
  }

  // ─── Getters ───────────────────────────────────────────────────────

  get recentManga(): Manga[] {
    return [...this.library]
      .filter((m) => m.lastReadAt || m.lastReadPage > 1)
      .sort((a, b) => {
        const dA = a.lastReadAt ? new Date(a.lastReadAt).getTime() : 0;
        const dB = b.lastReadAt ? new Date(b.lastReadAt).getTime() : 0;
        return dB - dA;
      })
      .slice(0, 4);
  }
}

export const mangaStore = new MangaStore();
