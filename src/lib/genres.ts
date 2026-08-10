/**
 * Rotulos de genero em portugues, espelhando `backend/app/sources/genres.py`.
 *
 * O backend expoe isso em `/genres`, e era de la que a UI tirava os nomes. Mas
 * quando esse endpoint nao responde — servidor mais antigo que o app, ou sem
 * rede — o `catch` deixava o dicionario vazio e a tela caia no slug cru:
 * "slice-of-life", "martial-arts", "post-apocalyptic". Ter a tabela aqui faz o
 * nome legivel aparecer de imediato, sem esperar a rede; o que vier do backend
 * ainda sobrescreve, entao generos novos continuam chegando sem release do app.
 */
export const GENRE_LABELS: Record<string, string> = {
	action: 'Ação',
	adventure: 'Aventura',
	comedy: 'Comédia',
	drama: 'Drama',
	fantasy: 'Fantasia',
	horror: 'Horror',
	mystery: 'Mistério',
	psychological: 'Psicológico',
	romance: 'Romance',
	'sci-fi': 'Ficção Científica',
	'slice-of-life': 'Slice of Life',
	sports: 'Esportes',
	supernatural: 'Sobrenatural',
	thriller: 'Thriller',
	tragedy: 'Tragédia',
	isekai: 'Isekai',
	mecha: 'Mecha',
	historical: 'Histórico',
	'martial-arts': 'Artes Marciais',
	'school-life': 'Vida Escolar',
	shounen: 'Shounen',
	shoujo: 'Shoujo',
	seinen: 'Seinen',
	josei: 'Josei',
	yaoi: 'Yaoi',
	yuri: 'Yuri',
	ecchi: 'Ecchi',
	harem: 'Harem',
	'gender-bender': 'Gender Bender',
	'magical-girls': 'Mahou Shoujo',
	medical: 'Médico',
	music: 'Música',
	philosophical: 'Filosófico',
	crime: 'Crime',
	wuxia: 'Wuxia',
	cooking: 'Culinária',
	'video-games': 'Video Games',
	superhero: 'Super-herói',
	military: 'Militar',
	police: 'Policial',
	'post-apocalyptic': 'Pós-apocalíptico',
	survival: 'Sobrevivência',
	office: 'Escritório',
	animals: 'Animais',
	delinquents: 'Delinquentes',
	monsters: 'Monstros',
	reincarnation: 'Reencarnação',
	'time-travel': 'Viagem no Tempo',
	vampires: 'Vampiros',
	zombies: 'Zumbis',
	demons: 'Demônios',
	magic: 'Magia',
	ninja: 'Ninja',
	samurai: 'Samurai',
	'virtual-reality': 'Realidade Virtual',
	crossdressing: 'Crossdressing',
	'full-color': 'Colorido',
	oneshot: 'One-shot',
	doujinshi: 'Doujinshi',
	webtoon: 'Webtoon',
	adaptation: 'Adaptação',
	anthology: 'Antologia',
	'award-winning': 'Premiado',
	'fan-colored': 'Colorido por fãs',
	'official-colored': 'Colorido oficial',
	'long-strip': 'Tira vertical',
	'4-koma': '4-koma',
	'user-created': 'Criado por usuário',
	// O catalogo embutido escreve "shonen"; o slug canonico e "shounen".
	shonen: 'Shounen'
};

/** Rotulo do genero, ou o proprio slug quando for um que ainda nao conhecemos. */
export function genreLabel(slug: string, extra?: Record<string, string>): string {
	return extra?.[slug] ?? GENRE_LABELS[slug] ?? slug;
}
