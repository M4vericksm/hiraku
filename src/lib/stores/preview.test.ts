import { describe, it, expect, beforeEach } from 'vitest';
import { rememberPreview, recallPreview, clearPreviews } from './preview';

describe('preview handoff', () => {
	beforeEach(() => clearPreviews());

	it('devolve o que o card guardou no clique', () => {
		rememberPreview('mangadex', 'abc', { title: 'Berserk', coverUrl: 'https://x/a.jpg' });
		expect(recallPreview('mangadex', 'abc')).toEqual({
			title: 'Berserk',
			coverUrl: 'https://x/a.jpg'
		});
	});

	it('separa obras de mesmo id em fontes diferentes', () => {
		rememberPreview('mangadex', 'abc', { title: 'A' });
		rememberPreview('mangalivre', 'abc', { title: 'B' });
		expect(recallPreview('mangadex', 'abc')?.title).toBe('A');
		expect(recallPreview('mangalivre', 'abc')?.title).toBe('B');
	});

	it('ignora entradas sem titulo — o detalhe nao teria o que mostrar', () => {
		rememberPreview('mangadex', 'abc', { title: '', coverUrl: 'https://x/a.jpg' });
		expect(recallPreview('mangadex', 'abc')).toBeUndefined();
	});

	it('ignora source ou id vazios', () => {
		rememberPreview('', 'abc', { title: 'A' });
		rememberPreview('mangadex', '', { title: 'A' });
		expect(recallPreview('', 'abc')).toBeUndefined();
		expect(recallPreview('mangadex', '')).toBeUndefined();
	});

	it('devolve undefined para o que nunca foi visto (reload direto na URL)', () => {
		expect(recallPreview('mangadex', 'nunca-visto')).toBeUndefined();
	});

	it('sobrescreve o preview quando a mesma obra e clicada de novo', () => {
		rememberPreview('mangadex', 'abc', { title: 'Antigo' });
		rememberPreview('mangadex', 'abc', { title: 'Novo', coverUrl: 'https://x/b.jpg' });
		expect(recallPreview('mangadex', 'abc')).toEqual({
			title: 'Novo',
			coverUrl: 'https://x/b.jpg'
		});
	});

	it('descarta os mais antigos ao estourar o teto, preservando os recentes', () => {
		for (let i = 0; i < 70; i++) {
			rememberPreview('mangadex', `id-${i}`, { title: `T${i}` });
		}
		// 70 insercoes com teto de 60: o primeiro ja saiu, o ultimo continua.
		expect(recallPreview('mangadex', 'id-0')).toBeUndefined();
		expect(recallPreview('mangadex', 'id-69')?.title).toBe('T69');
	});

	it('reinsercao renova a idade — o reclicado nao e o proximo a sair', () => {
		for (let i = 0; i < 60; i++) {
			rememberPreview('mangadex', `id-${i}`, { title: `T${i}` });
		}
		rememberPreview('mangadex', 'id-0', { title: 'T0' });
		rememberPreview('mangadex', 'novo', { title: 'Novo' });

		expect(recallPreview('mangadex', 'id-0')?.title).toBe('T0');
		expect(recallPreview('mangadex', 'id-1')).toBeUndefined();
	});
});
