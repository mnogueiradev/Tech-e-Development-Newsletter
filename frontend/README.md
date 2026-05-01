# Tech & Development Newsletter - Frontend React

Projeto frontend da newsletter de tecnologia desenvolvido com React e Tailwind CSS.

## Tecnologias Utilizadas

- **React 19** - Biblioteca principal de UI
- **TypeScript** - Type safety
- **Tailwind CSS** - Framework de estilização utilitário
- **Vite** - Build tool (via Create React App)

## Estrutura do Projeto

```
frontend/
├── public/                 # Arquivos estáticos
│   ├── image.png          # Logo da newsletter
│   ├── screenshot1.png    # Exemplo de newsletter
│   ├── screenshot2.png    # Exemplo de newsletter
│   └── screenshot3.png    # Exemplo de newsletter
├── src/
│   ├── App.tsx            # Componente principal
│   ├── index.css          # Estilos globais (Tailwind)
│   └── index.tsx         # Ponto de entrada
├── package.json           # Dependências e scripts
├── tailwind.config.js     # Configuração do Tailwind
└── postcss.config.js     # Configuração do PostCSS
```

## Como Usar

### Pré-requisitos

- Node.js 18+ instalado
- Servidor backend rodando na porta 3000

### Instalação

```bash
cd frontend
npm install
```

### Desenvolvimento

```bash
npm start
```

O app estará disponível em `http://localhost:3001` (porta 3001 para não conflitar com o backend).

### Build para Produção

```bash
npm run build
```

O build será gerado na pasta `build/`.

## Funcionalidades

- Formulário de inscrição com validação
- Feedback visual de sucesso/erro
- Design responsivo com glassmorphism
- Galeria de exemplos da newsletter
- Integração com API do backend
- Loading states

## Configuração

O projeto está configurado com proxy para o backend (`http://localhost:3000`), então todas as requisições da API são redirecionadas automaticamente.

## Deploy

Para deploy no Render ou outra plataforma:

1. Faça o build: `npm run build`
2. Faça upload da pasta `build/`
3. Configure as variáveis de ambiente do backend
4. Ajuste o proxy no package.json se necessário

## Estilização

O projeto usa Tailwind CSS com um design moderno:
- Gradiente de fundo (roxo/violeta)
- Glassmorphism com backdrop-blur
- Cores consistente com a marca
- Animações suaves e hover states
