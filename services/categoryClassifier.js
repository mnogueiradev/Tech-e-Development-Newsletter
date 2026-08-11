/**
 * Classificador inteligente de notícias para as 8 categorias canônicas da Newsletter.
 */

const CATEGORY_KEYWORDS = {
  ia: [
    'ia', 'ai', 'gpt', 'gpt-4', 'gpt-5', 'openai', 'anthropic', 'claude', 'gemini', 'llm', 
    'deepseek', 'copilot', 'inteligência artificial', 'machine learning', 'deep learning', 
    'neural', 'agente', 'agentes', 'genai', 'midjourney', 'sora', 'mistral', 'llama', 
    'hugging face', 'langchain', 'ollama', 'groq', 'perplexity', 'sam altman', 'yann lecun',
    'modelo generativo', 'prompt', 'visão computacional', 'nlp', 'ia generativa'
  ],
  ciberseguranca: [
    'cibersegurança', 'cybersecurity', 'segurança', 'security', 'vazamento', 'ransomware', 
    'malware', 'phishing', 'hacker', 'hack', 'zero-day', 'vulnerabilidade', 'firewall', 
    'infosec', 'lgpd', 'privacy', 'privacidade', 'ataque cibernético', 'invasão', 'payload',
    'exploit', 'ddos', 'criptografia', 'cert-br', 'cyber'
  ],
  cloud: [
    'cloud', 'aws', 'gcp', 'azure', 'nuvem', 'kubernetes', 'k8s', 'docker', 'serverless', 
    'lambda', 'microservices', 'microserviços', 'terraform', 'vmware', 'oracle cloud', 
    'cloud computing', 'opentelemetry', 'istio', 'helm', 'cloud native'
  ],
  startups: [
    'startup', 'startups', 'saas', 'funding', 'investimento', 'aporte', 'unicórnio', 
    'rodada', 'venture capital', 'vc', 'aquisição', 'aquisicao', 'fintech', 'ipo', 'm&a', 
    'business', 'valuation', 'pitch', 'aceleradora', 'incubadora'
  ],
  hardware: [
    'hardware', 'chip', 'chips', 'gpu', 'gpus', 'cpu', 'cpus', 'nvidia', 'intel', 'amd', 
    'apple silicon', 'processador', 'semicondutor', 'semicondutores', 'datacenter', 'datacenters', 
    'rtx', 'snapdragon', 'tsmc', 'placa de vídeo', 'quantum computing'
  ],
  mobile: [
    'mobile', 'android', 'ios', 'smartphone', 'smartphones', 'iphone', 'ipad', 'app store', 
    'google play', 'flutter', 'react native', 'swift', 'kotlin', 'celular', 'aplicativo', 
    'apps', 'wearable', 'watchos'
  ],
  devops: [
    'devops', 'sre', 'ci/cd', 'pipeline', 'observabilidade', 'observability', 'grafana', 
    'prometheus', 'datadog', 'ansible', 'infrastructure as code', 'iac', 'site reliability'
  ],
  desenvolvimento: [
    'desenvolvimento', 'dev', 'code', 'programação', 'framework', 'javascript', 'typescript', 
    'python', 'react', 'node', 'nodejs', 'api', 'backend', 'frontend', 'git', 'github', 
    'rust', 'golang', 'go', 'java', 'c#', '.net', 'sql', 'database', 'engenharia de software',
    'tecnologia', 'web'
  ]
};

function classifyArticle(title = '', description = '', tags = [], fallbackCategory = 'desenvolvimento') {
  const textToAnalyze = `${title} ${description} ${Array.isArray(tags) ? tags.join(' ') : ''}`.toLowerCase();

  // Pontuação por categoria
  const scores = {
    ia: 0,
    ciberseguranca: 0,
    cloud: 0,
    startups: 0,
    hardware: 0,
    mobile: 0,
    devops: 0,
    desenvolvimento: 0
  };

  // Testa palavras-chave de cada categoria com pesos
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    for (const kw of keywords) {
      if (textToAnalyze.includes(kw.toLowerCase())) {
        // Palavras exatas/fortes ganham mais peso
        if (['openai', 'gpt', 'claude', 'gemini', 'llm', 'deepseek', 'cibersegurança', 'ransomware', 'kubernetes', 'aws', 'nvidia'].includes(kw.toLowerCase())) {
          scores[category] += 3;
        } else {
          scores[category] += 1;
        }
      }
    }
  }

  // Encontra a categoria com maior pontuação
  let bestCategory = null;
  let maxScore = 0;

  for (const [cat, score] of Object.entries(scores)) {
    if (score > maxScore) {
      maxScore = score;
      bestCategory = cat;
    }
  }

  // Se nenhuma pontuação for alcançada ou houver empate fraco, usa fallback
  if (!bestCategory || maxScore < 1) {
    if (fallbackCategory && scores[fallbackCategory] !== undefined) {
      return fallbackCategory;
    }
    return 'desenvolvimento';
  }

  return bestCategory;
}

module.exports = {
  classifyArticle,
  CATEGORY_KEYWORDS
};
