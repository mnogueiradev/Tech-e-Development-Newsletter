const { translateNewsItems } = require('../services/newsTranslation');

translateNewsItems([
    {
        title: "L'IA si è presa Internet, i bot generano più traffico web dell'uomo",
        description: 'Se accetti tutti i cookie di profilazione pubblicitaria e di tracciamento...',
        link: 'https://www.ansa.it/article',
        source: 'www.ansa.it',
    },
    {
        title: 'Google anuncia nova IA para desenvolvedores no Brasil',
        description: 'A empresa expande ferramentas de inteligência artificial para o mercado brasileiro.',
        link: 'https://olhardigital.com.br/noticia',
        source: 'olhardigital.com.br',
    },
]).then((results) => {
    console.log(JSON.stringify(results, null, 2));
}).catch((err) => {
    console.error(err);
    process.exit(1);
});
